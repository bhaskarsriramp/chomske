/**
 * routes/studio.js: the AI demo recorder.
 *
 *   GET    /studio/config
 *   GET    /studio/demos                          the library
 *   POST   /studio/demos                          { title } start one
 *   GET    /studio/demos/:id
 *   PATCH  /studio/demos/:id                      { title }
 *   DELETE /studio/demos/:id
 *
 *   POST   /studio/demos/:id/upload               { filename, mime, size, client_key } begin
 *   POST   /studio/demos/:id/upload/resume        carry on an upload that stopped
 *   POST   /studio/demos/:id/upload/complete      { capture } the recording has landed
 *
 *   POST   /studio/demos/:id/analyse              { expected_cost, captions }
 *   POST   /studio/demos/:id/vision               read the screens: blur, steps, narration
 *   POST   /studio/demos/:id/captions             transcribe, on its own
 *   POST   /studio/demos/:id/captions/from-script captions from the narration
 *   POST   /studio/demos/:id/review               fresh suggestions for this edit
 *   POST   /studio/demos/:id/suggestions/:sid     { action: "apply" | "dismiss" }
 *
 *   PUT    /studio/demos/:id/timeline             { timeline, rev }
 *
 *   POST   /studio/demos/:id/renders              { expected_cost, options }
 *   GET    /studio/demos/:id/renders/:rid/download
 *   DELETE /studio/demos/:id/renders/:rid
 *
 * ── SIGNED-IN CREATORS ONLY ──────────────────────────────────────────────────
 * Not showcase visitors. A showcase is a private link to a demo of OUR product;
 * letting it upload gigabytes into the bucket and burn render minutes would turn
 * an outreach tool into free hosting.
 *
 * ── PRICES ARE CONFIRMED, NOT ASSUMED ────────────────────────────────────────
 * Every paid action takes `expected_cost`, the number the button showed. If the
 * server's own price differs — the edit changed length since the price was
 * shown, or the rate changed — nothing is charged and the new price comes back.
 * Nobody pays a number they did not see.
 */
import express from "express";
import mongoose from "mongoose";
import authenticateToken from "../middleware/authenticateToken.js";
import StudioDemo from "../models/StudioDemo.js";
import StudioJob from "../models/StudioJob.js";
import {
  storageKind, CHUNK_BYTES, createUploadSession, statObject, readUrl, removePrefix, removeObject,
} from "../services/media/storage.js";
import { hasEncoder } from "../services/media/ffmpeg.js";
import { enqueue, saveAnalysis, afterAnalysis, compareShadow } from "../services/studio/studioRunner.js";
import {
  browserStatus, browserPlan, sessionPayload, answer, parseResult, storeResult, resultKey,
  startAsk, findAsk, askingNow, waitAsk, logEntry, endSession,
  HOLD_MS, FIRST_HOLD_MS, RECHECK_RATE, MAX_RUN_MS, ASK_KINDS, VISION_KINDS,
} from "../services/studio/browserAnalysis.js";
import { VISION_ON_ANALYSE } from "../services/studio/analyse.js";
import { exactDiff } from "../services/studio/exactJson.js";
import {
  STUDIO_LIMITS, LEDGER_REASON, acceptable, ACCEPT_MIME, demoKey, demoPrefix, bumpExpiry,
  studioCost, shapeDemo, shapeDemoCard, publishProgress, followsFor, shapeVoiceover,
  STUDIO_ANALYSE_CREDITS_PER_MIN, STUDIO_EXPORT_CREDITS_PER_MIN,
} from "../services/studio/demoService.js";
import {
  RENDER_ENGINE, RESOLUTIONS, FRAME_RATES, VIDEO_MBPS, AUDIO_KBPS, FORMATS, SPEEDS, MAX_RESOLUTION,
  PRESETS, DEFAULT_EXPORT, EXPORT_MULTIPLIERS, cleanExportOptions, exportPrice,
} from "../services/studio/exportOptions.js";
import {
  ASPECT_KEYS, CURSOR_THEMES, CAPTION_STYLES, BLUR_KINDS,
  sanitizeTimeline, layout, newId,
} from "../services/studio/timeline.js";
import { GRADIENTS } from "../services/studio/render/frame.js";
import { applySuggestion } from "../services/studio/suggestions.js";
import { runCommand } from "../services/studio/command.js";
import { isDemoSlug, ensureDemoSlug } from "../services/studio/demoSlug.js";
import { blurSig } from "../../src/components/Studio/follow.mjs";
import { voiceById, voiceSig } from "../../src/components/Studio/voices.mjs";
import { voiceSampleUrl } from "../services/studio/voice.js";
import { listMusic, saveUploadedMusic, deleteUploadedMusic, UPLOAD as MUSIC_UPLOAD } from "../services/studio/music.js";
import StudioAsset from "../models/StudioAsset.js";
import {
  BACKGROUND_LIMITS, BACKGROUND_TYPES, prepareBackground, saveBackground, deleteBackground, shapeBackground,
} from "../services/studio/backgrounds.js";
import { cuesFromNarration } from "../services/studio/captionsFromScript.js";
import { spend, refund, getBalance, InsufficientCredits } from "../services/creditsService.js";
import { dbUnreachable, noteDbFault } from "../db.js";

const router = express.Router();
router.use(authenticateToken);

/** Where the browser reaches this API, for local-mode media links. */
const baseUrlOf = () => String(process.env.PUBLIC_API_URL || "").replace(/\/$/, "");
const originOf = (req) =>
  req.get("origin") || String(process.env.CORS_ORIGINS || "").split(",")[0].trim() || undefined;

const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });

/** A number from the browser, or 0 if it is not one or is outside all reason. */
const clampNum = (v, lo, hi) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : 0;
};

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    // A database dropout is one line, and recorded before the 500 goes out so
    // it leaves as a 503 the browser retries (middleware/dbDropout.js).
    if (dbUnreachable(err)) {
      noteDbFault(err);
      console.warn(`[studio] ${req.method} ${req.originalUrl}: database unreachable (${err.name}: ${String(err.message).split("\n")[0].slice(0, 160)})`);
    } else {
      console.error(`[studio] ${req.method} ${req.originalUrl} failed:`, err);
    }
    if (!res.headersSent) fail(res, 500, err.userMessage || "Something went wrong. Please try again.");
  }
};

const cleanTitle = (v) => String(v || "").replace(/\s+/g, " ").trim().slice(0, 120);
const sinceDay = () => new Date(Date.now() - 24 * 3600 * 1000);

/**
 * The caller's own demo, by slug or by id.
 *
 * The browser opens a demo by its slug, the id in the address bar
 * (services/studio/demoSlug.js); older links and internal calls use the _id.
 * The two can never be confused: a slug is ten characters, an id is 24.
 */
async function ownDemo(req, res) {
  const key = String(req.params.id || "");
  const by = isDemoSlug(key) ? { slug: key } : mongoose.Types.ObjectId.isValid(key) ? { _id: key } : null;
  if (!by) {
    fail(res, 404, "Recording not found.");
    return null;
  }
  const demo = await StudioDemo.findOne({ ...by, user: req.user.id });
  if (!demo) {
    fail(res, 404, "Recording not found.");
    return null;
  }
  await ensureDemoSlug(demo);
  return demo;
}

async function respond(req, res, demo, extra = {}) {
  const fresh = await StudioDemo.findById(demo._id);
  return res.json({ success: true, demo: await shapeDemo(fresh, { baseUrl: baseUrlOf() }), ...extra });
}

/** Take credits, or answer 402 with what is missing. Returns null when it answered. */
async function charge(req, res, cost, { refId, note, what }) {
  try {
    const spent = await spend(req.user.id, cost, { reason: LEDGER_REASON, refType: "StudioDemo", refId, note });
    return spent.spent;
  } catch (err) {
    if (err instanceof InsufficientCredits) {
      fail(res, 402, `${what} needs ${err.needed} credits and you have ${err.balance}.`, {
        insufficient_credits: true, needed: err.needed, balance: err.balance,
      });
      return null;
    }
    throw err;
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   Config
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Everything the studio needs to draw itself: what this server will accept,
 * what it will render, and what things cost. The browser never hard-codes any
 * of it, so raising a limit is a server change and not a deploy of both halves.
 */
router.get("/config", wrap(async (req, res) => {
  const hevc = await hasEncoder("libx265");
  res.json({
    success: true,
    engine: RENDER_ENGINE,
    storage: storageKind(),
    chunk_bytes: CHUNK_BYTES,
    limits: {
      max_upload_bytes: STUDIO_LIMITS.maxUploadBytes,
      max_recording_seconds: STUDIO_LIMITS.maxRecordingSeconds,
      max_demos: STUDIO_LIMITS.maxDemos,
      retention_days: STUDIO_LIMITS.retentionDays,
      daily_analyses: STUDIO_LIMITS.dailyAnalyses,
      daily_exports: STUDIO_LIMITS.dailyExports,
    },
    accept: ACCEPT_MIME,
    pricing: {
      analyse_per_min: STUDIO_ANALYSE_CREDITS_PER_MIN,
      export_per_min: STUDIO_EXPORT_CREDITS_PER_MIN,
      multipliers: EXPORT_MULTIPLIERS,
    },
    export: {
      presets: PRESETS,
      defaults: DEFAULT_EXPORT,
      resolutions: RESOLUTIONS.filter((r) => r <= MAX_RESOLUTION),
      frame_rates: FRAME_RATES,
      video_mbps: VIDEO_MBPS,
      audio_kbps: AUDIO_KBPS,
      formats: FORMATS,
      speeds: Object.keys(SPEEDS),
      hevc,
    },
    timeline: {
      aspects: ASPECT_KEYS,
      cursor_themes: CURSOR_THEMES,
      caption_styles: CAPTION_STYLES,
      // No easings: every zoom is Smooth and the editor offers no choice.
      blur_kinds: BLUR_KINDS,
      backgrounds: Object.keys(GRADIENTS),
    },
    // Whether the first analysis may run in the creator's browser, and which
    // build does it (services/studio/browserAnalysis.js). "off" unless this
    // server has checked the build is its own code.
    browser_analysis: await browserStatus().then(
      (s) => ({ mode: s.mode, version: s.version || null, worker: s.worker || null }),
      () => ({ mode: "off", version: null, worker: null })
    ),
    balance: await getBalance(req.user.id),
  });
}));

/* ────────────────────────────────────────────────────────────────────────────
   Music
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * GET /studio/music
 *
 * Clipo's music library (services/studio/music.js): public-domain tracks we
 * host, and the creator's own uploads first, each with a link to play it, its
 * mood, length and waveform. Free: listing them calls no model.
 */
router.get("/music", wrap(async (req, res) => {
  res.json({ success: true, ...(await listMusic({ baseUrl: baseUrlOf(), user: req.user.id })) });
}));

/**
 * POST /studio/music   body: the audio file itself; X-Filename: its name
 *
 * One of the creator's own tracks, up to MUSIC_UPLOAD.maxSeconds long: checked,
 * made into an MP3 at the library's loudness and kept on their account.
 * Answers { track } as the list shows it. Any audio type is accepted here and
 * judged by what ffmpeg can read, not by the browser's guess at the type.
 */
router.post(
  "/music",
  (req, res, next) =>
    Number(req.get("content-length") || 0) > MUSIC_UPLOAD.maxBytes
      ? fail(res, 413, `That file is over ${Math.round(MUSIC_UPLOAD.maxBytes / 1048576)} MB. Use an MP3 or M4A, or a shorter clip.`)
      : next(),
  express.raw({ type: () => true, limit: MUSIC_UPLOAD.maxBytes }),
  wrap(async (req, res) => {
    let name = "";
    try {
      name = decodeURIComponent(String(req.get("x-filename") || ""));
    } catch {
      name = "";
    }
    try {
      const { track } = await saveUploadedMusic(req.user.id, req.body, name);
      // The link for the editor, now that the file is stored.
      const list = await listMusic({ baseUrl: baseUrlOf(), user: req.user.id });
      res.json({ success: true, track: list.tracks.find((t) => t.id === track.id) || track });
    } catch (err) {
      if (err.userMessage) return fail(res, err.status || 400, err.userMessage);
      throw err;
    }
  })
);

router.delete("/music/:id", wrap(async (req, res) => {
  const gone = await deleteUploadedMusic(req.user.id, req.params.id);
  if (!gone) return fail(res, 404, "That track isn't here any more.");
  res.json({ success: true, deleted: String(req.params.id) });
}));

/* ────────────────────────────────────────────────────────────────────────────
   The library
   ──────────────────────────────────────────────────────────────────────────── */

router.get("/demos", wrap(async (req, res) => {
  const demos = await StudioDemo.find({ user: req.user.id })
    .sort({ created_at: -1 })
    .limit(120)
    .select("-timeline -capture.track -capture.motion -analysis.suggestions")
    .lean();
  // Demos from before slugs existed get theirs here, the first time they are listed.
  await Promise.all(demos.filter((d) => !d.slug).map(ensureDemoSlug));
  res.json({
    success: true,
    demos: await Promise.all(demos.map((d) => shapeDemoCard(d, { baseUrl: baseUrlOf() }))),
  });
}));

/* ────────────────────────────────────────────────────────────────────────────
   Background images
   The creator's own, for the canvas. They belong to the account rather than to
   a demo, so they are listed and stored apart from any one recording. See
   services/studio/backgrounds.js.
   ──────────────────────────────────────────────────────────────────────────── */

router.get("/backgrounds", wrap(async (req, res) => {
  const rows = await StudioAsset.find({ user: req.user.id, kind: "background" })
    .sort({ created_at: -1 })
    .limit(BACKGROUND_LIMITS.maxPerUser)
    .lean();
  res.json({
    success: true,
    backgrounds: await Promise.all(rows.map((a) => shapeBackground(a, { baseUrl: baseUrlOf() }))),
  });
}));

router.post(
  "/backgrounds",
  // Refused on the declared size before a byte is read, with a sentence rather
  // than the parser's bare 413.
  (req, res, next) =>
    Number(req.get("content-length") || 0) > BACKGROUND_LIMITS.maxBytes
      ? fail(res, 413, `That image is over ${Math.round(BACKGROUND_LIMITS.maxBytes / 1048576)} MB.`)
      : next(),
  express.raw({ type: BACKGROUND_TYPES, limit: BACKGROUND_LIMITS.maxBytes }),
  wrap(async (req, res) => {
    const held = await StudioAsset.countDocuments({ user: req.user.id, kind: "background" });
    if (held >= BACKGROUND_LIMITS.maxPerUser) {
      return fail(res, 429, `You have ${held} background images, which is the most there can be.`);
    }
    let prepared;
    try {
      prepared = await prepareBackground(req.body);
    } catch (err) {
      if (err.userMessage) return fail(res, err.status || 400, err.userMessage);
      throw err;
    }
    const asset = await saveBackground(req.user.id, prepared);
    res.json({ success: true, background: await shapeBackground(asset, { baseUrl: baseUrlOf() }) });
  })
);

router.delete("/backgrounds/:id", wrap(async (req, res) => {
  const gone = await deleteBackground(req.user.id, req.params.id);
  if (!gone) return fail(res, 404, "That image isn't here any more.");
  res.json({ success: true, deleted: String(req.params.id) });
}));

router.post("/demos", wrap(async (req, res) => {
  const live = await StudioDemo.countDocuments({ user: req.user.id, purged: false });
  if (live >= STUDIO_LIMITS.maxDemos) {
    return fail(res, 429, `You have ${live} recordings. Delete one before starting another.`);
  }
  const demo = await StudioDemo.create({
    user: req.user.id,
    title: cleanTitle(req.body?.title),
    status: "new",
    expires_at: bumpExpiry(),
  });
  // Minted here rather than in create(), so the one place that handles a
  // collision on the unique index is ensureDemoSlug.
  await ensureDemoSlug(demo);
  return respond(req, res, demo);
}));

router.get("/demos/:id", wrap(async (req, res) => {
  const demo = await ownDemo(req, res);
  if (demo) await respond(req, res, demo);
}));

router.patch("/demos/:id", wrap(async (req, res) => {
  const demo = await ownDemo(req, res);
  if (!demo) return;
  demo.title = cleanTitle(req.body?.title);
  demo.expires_at = bumpExpiry();
  await demo.save();
  res.json({ success: true, title: demo.title });
}));

router.delete("/demos/:id", wrap(async (req, res) => {
  const demo = await ownDemo(req, res);
  if (!demo) return;
  if (!demo.purged) await removePrefix(demoPrefix(demo)).catch((err) => console.error("[studio] delete files:", err.message));
  await StudioJob.deleteMany({ demo: demo._id, status: { $in: ["queued", "failed", "done"] } });
  await StudioDemo.deleteOne({ _id: demo._id });
  res.json({ success: true });
}));

/* ────────────────────────────────────────────────────────────────────────────
   The upload
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Begin sending the capture.
 *
 * ── THE BROWSER UPLOADS STRAIGHT TO STORAGE ──────────────────────────────────
 * This answers with a resumable session URL and the browser PUTs chunks at it
 * (src/components/Studio/recorder.js, reusing the script editor's upload
 * protocol). The footage never passes through this server, which is the only
 * way a gigabyte screen recording on a domestic connection is survivable.
 *
 * `client_key` names this upload, so asking twice — a lost answer, sent again —
 * hands back the one upload already started rather than beginning a second.
 */
router.post("/demos/:id/upload", wrap(async (req, res) => {
  const demo = await ownDemo(req, res);
  if (!demo) return;

  const mime = String(req.body?.mime || "");
  const size = Number(req.body?.size) || 0;
  const clientKey = String(req.body?.client_key || "").slice(0, 120);

  if (!acceptable(mime)) return fail(res, 400, "That isn't a video this studio can read.");
  if (size > STUDIO_LIMITS.maxUploadBytes) {
    return fail(res, 413, `That recording is ${(size / 1024 / 1024).toFixed(0)} MB. The limit is ${Math.round(STUDIO_LIMITS.maxUploadBytes / 1024 / 1024)} MB.`);
  }

  // Already started, same browser, same recording: hand back the session it has.
  if (clientKey && demo.recording?.client_key === clientKey && demo.recording?.upload_url) {
    return res.json({
      success: true,
      upload: { url: demo.recording.upload_url, chunk_bytes: CHUNK_BYTES, storage: storageKind() },
      resumed: true,
    });
  }

  const key = demoKey(demo, "src", `capture.${mime.includes("mp4") ? "mp4" : "webm"}`);
  const session = await createUploadSession({
    key,
    contentType: mime,
    size,
    origin: originOf(req),
    baseUrl: baseUrlOf(),
  });

  demo.recording = {
    ...(demo.recording?.toObject?.() || demo.recording || {}),
    status: "uploading",
    key,
    client_key: clientKey,
    upload_url: session.url,
    filename: String(req.body?.filename || "recording").slice(0, 120),
    mime,
    size,
    error: "",
  };
  demo.status = "uploading";
  demo.error = "";
  demo.expires_at = bumpExpiry();
  await demo.save();

  res.json({ success: true, upload: { url: session.url, chunk_bytes: CHUNK_BYTES, storage: storageKind() } });
}));

router.post("/demos/:id/upload/resume", wrap(async (req, res) => {
  const demo = await ownDemo(req, res);
  if (!demo) return;
  if (!demo.recording?.upload_url) return fail(res, 409, "There's no upload to carry on with.");
  res.json({
    success: true,
    upload: { url: demo.recording.upload_url, chunk_bytes: CHUNK_BYTES, storage: storageKind() },
  });
}));

/**
 * The capture has landed. Hand over what the tracker saw and start preparing.
 *
 * The tracker report arrives here rather than during the recording for one
 * reason: it is worthless without the video it describes, and a browser that
 * crashed halfway would otherwise leave a pointer path for a recording that
 * does not exist. It is stored raw — conclusions are derived from it on every
 * analysis (services/studio/events.js), so re-tuning the thresholds does not
 * need anybody to record again.
 */
router.post("/demos/:id/upload/complete", wrap(async (req, res) => {
  const demo = await ownDemo(req, res);
  if (!demo) return;
  if (!demo.recording?.key) return fail(res, 409, "There's no upload to complete.");

  const stat = await statObject(demo.recording.key);
  if (!stat) return fail(res, 409, "That upload didn't finish. Please try again.");

  const cap = req.body?.capture || {};
  const track = Array.isArray(cap.track) ? cap.track.slice(0, 200000) : [];
  const motion = Array.isArray(cap.motion) ? cap.motion.slice(0, 200000) : [];

  demo.recording.status = "uploaded";
  demo.recording.size = stat.size || demo.recording.size;
  demo.recording.upload_url = "";
  demo.capture = {
    surface: ["monitor", "window", "browser"].includes(cap.surface) ? cap.surface : "unknown",
    label: String(cap.label || "").slice(0, 120),
    mic: !!cap.mic,
    system_audio: !!cap.system_audio,
    tracker: String(cap.tracker || "").slice(0, 32),
    samples: track.length,
    track,
    motion,
    // Validated here rather than trusted: this steers how the pointer is looked
    // for, and a nonsense screen width would steer it off a cliff. Anything
    // unrecognised becomes a zero, which the locator reads as "not reported"
    // and falls back to measuring the recording, exactly as before.
    env: {
      platform: ["windows", "macos", "linux", "chromeos", "android", "ios"].includes(cap.env?.platform)
        ? cap.env.platform
        : "unknown",
      scheme: ["light", "dark"].includes(cap.env?.scheme) ? cap.env.scheme : "unknown",
      dpr: clampNum(cap.env?.dpr, 0.5, 8),
      screen_w: clampNum(cap.env?.screen_w, 240, 16384),
      screen_h: clampNum(cap.env?.screen_h, 240, 16384),
      browser: ["chrome", "edge", "opera", "brave", "firefox", "safari"].includes(cap.env?.browser) ? cap.env.browser : "unknown",
      browser_version: String(cap.env?.browser_version || "").replace(/[^0-9.]/g, "").slice(0, 16),
    },
    /**
     * What the capture track delivered (capture.js startCapture): the cursor
     * mode the browser applied — which decides whether an idle pointer is in
     * the picture at all — its frame rate and pixel ratio. Recorded, not acted
     * on: it is what lets a recording that behaves oddly be traced to the
     * browser that made it.
     */
    device: cap.device
      ? {
        cursor: ["always", "motion", "never"].includes(cap.device.cursor) ? cap.device.cursor : "",
        cursor_offered: String(cap.device.cursor_offered || "").replace(/[^a-z,]/g, "").slice(0, 40),
        cursor_supported: cap.device.cursor_supported === true,
        frame_rate: clampNum(cap.device.frame_rate, 0, 240),
        logical_surface: typeof cap.device.logical_surface === "boolean" ? cap.device.logical_surface : null,
        screen_pixel_ratio: clampNum(cap.device.screen_pixel_ratio, 0, 8),
        width: clampNum(cap.device.width, 0, 16384),
        height: clampNum(cap.device.height, 0, 16384),
      }
      : undefined,
    /**
     * The pointer this machine draws, measured in the browser at full
     * resolution while the recording was being made. Validated on the same
     * principle as env: a nonsense height would steer the locator off a cliff,
     * and a zero reads as "not reported", which falls back to measuring the
     * recording exactly as before. See capture.js profileOf().
     */
    cursor: cap.cursor
      ? {
        design: ["light", "dark"].includes(cap.cursor.design) ? cap.cursor.design : "",
        height_px: clampNum(cap.cursor.height_px, 6, 200),
        samples: clampNum(cap.cursor.samples, 0, 100000),
        confidence: clampNum(cap.cursor.confidence, 0, 1),
      }
      : undefined,
    /**
     * How often the browser handed over a frame, measured while recording. Each
     * field is clamped rather than trusted, same as everything else here — this
     * arrives from a page and nothing that arrives from a page decides anything
     * until it has been given a range. See capture.js cadenceOf().
     */
    frames: cap.frames && cap.frames.supported === true
      ? {
        supported: true,
        frames: clampNum(cap.frames.frames, 0, 1e6),
        presented: clampNum(cap.frames.presented, 0, 1e6),
        p10_ms: clampNum(cap.frames.p10_ms, 0, 5000),
        median_ms: clampNum(cap.frames.median_ms, 0, 5000),
        p90_ms: clampNum(cap.frames.p90_ms, 0, 5000),
        fastest_quarter_hz: clampNum(cap.frames.fastest_quarter_hz, 0, 1000),
        median_hz: clampNum(cap.frames.median_hz, 0, 1000),
        spread: clampNum(cap.frames.spread, 0, 10000),
        // The tracker's health: grabs abandoned, pauses restarted, and when its
        // last sample was — against the video's length, how early it went quiet.
        stalls: clampNum(cap.frames.stalls, 0, 1e6),
        replays: clampNum(cap.frames.replays, 0, 1e6),
        last_sample_s: clampNum(cap.frames.last_sample_s, 0, 1e5),
        // Which path fed the tracker: frames straight from the stream, or the
        // older <video> on a timer (capture.js pump / tick).
        mode: ["frames", "timer"].includes(cap.frames.mode) ? cap.frames.mode : "",
      }
      : cap.frames
        ? { supported: false }
        : undefined,
  };
  demo.status = "preparing";
  demo.stage = "Queued";
  demo.progress = 0.02;
  demo.expires_at = bumpExpiry();
  await demo.save();

  await enqueue({ demo: demo._id, user: req.user.id, type: "prepare" });
  publishProgress(demo, { status: "preparing", stage: "Queued", progress: 0.02 });

  await respond(req, res, demo);
}));

/* ────────────────────────────────────────────────────────────────────────────
   Analysis
   ──────────────────────────────────────────────────────────────────────────── */

router.post("/demos/:id/analyse", wrap(async (req, res) => {
  const demo = await ownDemo(req, res);
  if (!demo) return;
  if (demo.purged) return fail(res, 410, "This recording's files have been deleted.");
  if (demo.recording?.status !== "ready") return fail(res, 409, "This recording isn't ready yet.");

  const busy = await StudioJob.findOne({ demo: demo._id, type: "analyse", status: { $in: ["queued", "running"] } });
  if (busy) return fail(res, 409, "This recording is already being analysed.");

  const today = await StudioJob.countDocuments({ user: req.user.id, type: "analyse", created_at: { $gte: sinceDay() } });
  if (today >= STUDIO_LIMITS.dailyAnalyses) {
    return fail(res, 429, `You've analysed ${today} recordings today. The daily limit is ${STUDIO_LIMITS.dailyAnalyses}.`);
  }

  const cost = studioCost("analyse", demo.recording.duration);
  const expected = Number(req.body?.expected_cost);
  if (Number.isFinite(expected) && expected !== cost) {
    return fail(res, 409, "The price changed. Please try again.", { price_changed: true, cost });
  }

  const charged = await charge(req, res, cost, { refId: demo._id, note: "analyse", what: "Analysing this recording" });
  if (charged === null) return;

  // Captions are opt-in. See services/studio/analyse.js for why a silent screen
  // recording must not be given captions of room tone by default.
  const wantCaptions = req.body?.captions === true && demo.recording.has_audio;

  /**
   * ── IN THE CREATOR'S BROWSER, WHEN IT CAN ────────────────────────────────
   * If this server offers it and the page says it can run this exact build,
   * the analysis runs in the browser (services/studio/browserAnalysis.js). The
   * server's own job is queued either way:
   *   on      held — no worker may take it while the browser sends heartbeats;
   *           if they stop, the hold lapses and it runs as it always would
   *   shadow  not held — it runs now and its result is the one used; the
   *           browser's is only compared with it
   */
  const plan = await browserPlan(demo, { client: req.body?.browser || null, wantCaptions }).catch((err) => {
    console.error("[studio] browser analysis plan failed; analysing on the server:", err.message);
    return null;
  });

  demo.status = "analysing";
  demo.stage = "Queued";
  demo.progress = 0.01;
  demo.error = "";
  demo.analysis = {
    ...(demo.analysis?.toObject?.() || {}),
    status: "running",
    error: "",
    charged,
    browser: plan ? { mode: plan.mode, session: plan.session, version: plan.version, status: "running", started_at: new Date(), asks: [] } : null,
  };
  demo.expires_at = bumpExpiry();
  await demo.save();

  await enqueue({
    demo: demo._id,
    user: req.user.id,
    type: "analyse",
    ref: wantCaptions ? "captions" : "",
    data: plan ? { browser: { mode: plan.mode, session: plan.session } } : null,
    notBefore: plan?.mode === "on" ? new Date(Date.now() + FIRST_HOLD_MS) : null,
  });
  publishProgress(demo, { status: "analysing", stage: "Queued", progress: 0.01 });

  const browser = plan ? await sessionPayload(demo, plan, { baseUrl: baseUrlOf() }) : null;
  await respond(req, res, demo, { charged, balance: await getBalance(req.user.id), ...(browser ? { browser } : {}) });
}));

/* ────────────────────────────────────────────────────────────────────────────
   The browser analysis (services/studio/browserAnalysis.js)

   The page reports on the run (heartbeat), asks the model's questions through
   the server (ask), hands in the result (result), or gives up (failed). Every
   route answers only for the demo's current session; anything else is a run
   the server has already moved on from.
   ──────────────────────────────────────────────────────────────────────────── */

/** How long one /ask request waits on the answer before telling the page to ask again. */
const ASK_WAIT_MS = 20_000;

/** The demo's browser run, if `session` is it. */
function browserRun(demo, session) {
  const b = demo.analysis?.browser;
  return b && session && b.session === String(session) ? b : null;
}

/** Push the server's held analyse job back by `ms`; false when it is no longer held. */
async function holdFor(demo, session, ms) {
  const r = await StudioJob.updateOne(
    { demo: demo._id, type: "analyse", status: "queued", "data.browser.session": session },
    { $set: { not_before: new Date(Date.now() + ms), updated_at: new Date() } }
  );
  return r.matchedCount > 0;
}

router.post("/demos/:id/analysis/heartbeat", wrap(async (req, res) => {
  const demo = await ownDemo(req, res);
  if (!demo) return;
  const session = String(req.body?.session || "");
  const b = browserRun(demo, session);
  if (!b || b.status !== "running") return res.json({ success: true, go: false });
  if (b.mode !== "on") return res.json({ success: true, go: true });

  // Past the longest a browser run may take, the hold is not renewed and the
  // server's job runs.
  if (Date.now() - new Date(b.started_at).getTime() > MAX_RUN_MS) {
    return res.json({ success: true, go: false, reason: "too slow" });
  }
  if (!(await holdFor(demo, session, HOLD_MS))) return res.json({ success: true, go: false });

  const progress = Math.max(0.01, Math.min(0.99, Number(req.body?.progress) || 0.01));
  const stage = String(req.body?.stage || "Analysing").slice(0, 80);
  await StudioDemo.updateOne({ _id: demo._id }, { $set: { stage, progress, updated_at: new Date() } });
  publishProgress(demo, { status: "analysing", stage, progress });
  res.json({ success: true, go: true });
}));

/**
 * A question for the model, from the browser's analysis: { session, id, kind,
 * q } starts it, { session, id } asks after it. Either answers within
 * ASK_WAIT_MS with { a, error } or { pending, progress }, and the page asks
 * again (see browserAnalysis.js startAsk). The answer is logged for the
 * re-check whether or not the page is still there to receive it.
 */
router.post("/demos/:id/analysis/ask", wrap(async (req, res) => {
  const demo = await ownDemo(req, res);
  if (!demo) return;
  const session = String(req.body?.session || "");
  const b = browserRun(demo, session);
  if (!b || b.status !== "running") return fail(res, 409, "This analysis is no longer running in the browser.");
  const id = Number(req.body?.id);
  if (!Number.isInteger(id) || id < 1 || id > 1000) return fail(res, 400, "That isn't a question the analysis asks.");
  const key = `${demo._id}|${session}|${id}`;

  let entry = findAsk(key);
  if (!entry) {
    const kind = String(req.body?.kind || "");
    const q = req.body?.q;
    if (q == null) return fail(res, 410, "The server is no longer answering this question.");
    if (!ASK_KINDS.includes(kind) || typeof q !== "string" || q.length > 20 * 1024 * 1024) return fail(res, 400, "That isn't a question the analysis asks.");
    if (VISION_KINDS.has(kind) && !VISION_ON_ANALYSE) return fail(res, 400, "That isn't a question the analysis asks.");
    const asked = [...(b.asks || []).map((x) => x.kind), ...askingNow(`${demo._id}|${session}|`)];
    if (asked.length >= 40) return fail(res, 429, "Too many questions for one analysis.");
    if (VISION_KINDS.has(kind) && asked.includes(kind)) return fail(res, 429, "The analysis asks that once.");

    // The model can take a while; the browser is waiting on it, not gone.
    if (b.mode === "on") await holdFor(demo, session, HOLD_MS + 60_000);
    entry = startAsk(key, kind, async (e) => {
      const out = await answer(demo, session, kind, q, { onProgress: (p) => (e.progress = Math.max(0, Math.min(1, Number(p) || 0))) });
      if (out.refused) {
        console.log(`[studio] browser analysis ${demo._id}: refused a ${kind} question (${out.refused})`);
        return out;
      }
      const logged = await logEntry(demo, session, id, kind, q, out);
      await StudioDemo.updateOne({ _id: demo._id, "analysis.browser.session": session }, { $push: { "analysis.browser.asks": logged } });
      return out;
    });
  }

  const out = await waitAsk(entry, ASK_WAIT_MS);
  if (out.pending) return res.json({ success: true, pending: true, progress: out.progress });
  // Not what the server's analysis would have been asked: the run ends and the server does the job.
  if (out.refused) return fail(res, 409, out.refused);
  res.json({ success: true, a: out.a ?? null, error: out.error || null });
}));

router.post("/demos/:id/analysis/failed", wrap(async (req, res) => {
  const demo = await ownDemo(req, res);
  if (!demo) return;
  const session = String(req.body?.session || "");
  const b = browserRun(demo, session);
  if (!b) return res.json({ success: true });
  endSession(demo._id, session);
  const reason = String(req.body?.reason || "unknown").slice(0, 300);
  await StudioDemo.updateOne(
    { _id: demo._id, "analysis.browser.session": session },
    { $set: { "analysis.browser.status": "failed", "analysis.browser.error": reason } }
  );
  // The server's job runs now rather than when the hold would have lapsed.
  if (b.mode === "on") await holdFor(demo, session, 0);
  console.log(`[studio] browser analysis ${demo._id} gave up (${reason}); ${b.mode === "on" ? "the server takes over" : "shadow only"}`);
  res.json({ success: true });
}));

router.post("/demos/:id/analysis/result", wrap(async (req, res) => {
  const demo = await ownDemo(req, res);
  if (!demo) return;
  const session = String(req.body?.session || "");
  const b = browserRun(demo, session);
  if (!b || b.status !== "running") return res.json({ success: true, accepted: false, reason: "this run is over" });
  endSession(demo._id, session);

  const status = await browserStatus();
  const reject = async (reason) => {
    await StudioDemo.updateOne(
      { _id: demo._id, "analysis.browser.session": session },
      { $set: { "analysis.browser.status": "rejected", "analysis.browser.error": reason } }
    );
    if (b.mode === "on") await holdFor(demo, session, 0);
    console.log(`[studio] browser analysis ${demo._id}: result refused (${reason})`);
    return res.json({ success: true, accepted: false, reason });
  };
  if (req.body?.version !== b.version || status.version !== b.version) return reject("it was made by a different build");

  let result;
  try {
    result = parseResult(req.body?.result);
  } catch (err) {
    return reject(err.message);
  }
  /**
   * ── CHECKED, NOT CLEANED ─────────────────────────────────────────────────
   * The editor's saves are passed through sanitizeTimeline. A result from the
   * analysis is already in the shape it produces, so passing it through must
   * change nothing — and if it would, the result did not come from the
   * analysis as built, and the server does the job instead. Cleaning it would
   * make it neither the browser's result nor the server's.
   */
  const cleaned = sanitizeTimeline(result.timeline, { duration: demo.recording?.duration || 0, source: result.timeline.source });
  const changed = exactDiff(result.timeline, cleaned, { limit: 1 });
  if (changed.length) return reject(`the edit is not in the shape the analysis makes (${changed[0].at})`);

  await storeResult(demo, session, "browser", req.body.result);
  const key = resultKey(demo, session, "browser");
  const ms = Math.max(0, Number(req.body?.ms) || 0);

  if (b.mode === "shadow") {
    await StudioDemo.updateOne(
      { _id: demo._id, "analysis.browser.session": session },
      { $set: { "analysis.browser.status": "done", "analysis.browser.result_key": key, "analysis.browser.ms": ms } }
    );
    compareShadow(demo._id, session).catch((err) => console.error("[studio] shadow compare failed:", err.message));
    // Where the model was asked, the server's own run got its own answers and
    // the two can differ for that alone; the re-check replays this run's.
    if ((b.asks || []).length) {
      await enqueue({ demo: demo._id, user: demo.user, type: "recheck", ref: session, notBefore: new Date(Date.now() + 60_000) }).catch(() => {});
    }
    return res.json({ success: true, accepted: true, shadow: true });
  }

  // Taken only while still held: once a worker has started it, the server's
  // run is the one that counts.
  const taken = await StudioJob.findOneAndUpdate(
    { demo: demo._id, type: "analyse", status: "queued", "data.browser.session": session },
    { $set: { status: "done", lease_until: null, updated_at: new Date(), "data.browser.done_at": new Date() } },
    { new: true }
  );
  if (!taken) return res.json({ success: true, accepted: false, reason: "the server has already taken over" });

  try {
    const fresh = await StudioDemo.findById(demo._id);
    const asks = fresh.analysis?.browser?.asks || [];
    const spent = { usd: asks.reduce((s, a) => s + (Number(a.usd) || 0), 0), calls: asks.reduce((s, a) => s + (Number(a.calls) || 0), 0) };
    await StudioDemo.updateOne(
      { _id: demo._id, "analysis.browser.session": session },
      { $set: { "analysis.browser.status": "done", "analysis.browser.result_key": key, "analysis.browser.ms": ms } }
    );
    await saveAnalysis(fresh, result, spent);
    await afterAnalysis(fresh, result);
  } catch (err) {
    // Not saved: the server's job runs after all.
    await StudioJob.updateOne({ _id: taken._id }, { $set: { status: "queued", not_before: null, updated_at: new Date() } }).catch(() => {});
    throw err;
  }
  console.log(`[studio] browser analysis ${demo._id}: accepted (${(ms / 1000).toFixed(0)}s in the browser)`);

  if (Math.random() < RECHECK_RATE) {
    // A minute's grace, so a re-check never competes with the creator's own next steps.
    await enqueue({ demo: demo._id, user: demo.user, type: "recheck", ref: session, notBefore: new Date(Date.now() + 60_000) }).catch(() => {});
  }
  res.json({ success: true, accepted: true });
}));

/**
 * Read the screens: blur, steps, narration.
 *
 * ── WHY THIS IS ITS OWN BUTTON ───────────────────────────────────────────────
 * The first analysis is pixels only — the camera, the cursor and the clicks all
 * come from the recording itself now, with no model call — so it is fast and it
 * is free. What still needs the model is reading what is ON the screen: finding
 * an API key to blur, naming the steps, writing the voiceover.
 *
 * That is worth paying for when it is wanted and worth nothing when it is not,
 * so it is asked for rather than assumed. Priced like an analysis, because it
 * is the part of one that costs: every sampled frame, read.
 *
 * Leaves the edit alone. See the `vision` handler in studioRunner.js.
 */
router.post("/demos/:id/vision", wrap(async (req, res) => {
  const demo = await ownDemo(req, res);
  if (!demo) return;
  if (demo.purged) return fail(res, 410, "This recording's files have been deleted.");
  if (!demo.timeline) return fail(res, 409, "Analyse this recording first.");
  if (demo.recording?.status !== "ready") return fail(res, 409, "This recording isn't ready yet.");

  const busy = await StudioJob.findOne({ demo: demo._id, type: { $in: ["analyse", "vision"] }, status: { $in: ["queued", "running"] } });
  if (busy) return fail(res, 409, "This recording is already being read.");

  const cost = studioCost("analyse", demo.recording.duration);
  const expected = Number(req.body?.expected_cost);
  if (Number.isFinite(expected) && expected !== cost) {
    return fail(res, 409, "The price changed. Please try again.", { price_changed: true, cost });
  }

  const charged = await charge(req, res, cost, { refId: demo._id, note: "read screens", what: "Reading this recording's screens" });
  if (charged === null) return;

  demo.analysis = { ...(demo.analysis?.toObject?.() || {}), status: "running", error: "", read_charged: charged };
  demo.expires_at = bumpExpiry();
  await demo.save();

  await enqueue({ demo: demo._id, user: req.user.id, type: "vision" });
  publishProgress(demo, { stage: "Queued", progress: 0.01, reading: true });

  await respond(req, res, demo, { charged, balance: await getBalance(req.user.id) });
}));

/**
 * Captions on their own, for a demo analysed without them.
 *
 * Free. It is one model call on audio this server already has, and putting a
 * price on it would make the honest default — leave captions off unless you
 * want them — the expensive one.
 */
router.post("/demos/:id/captions", wrap(async (req, res) => {
  const demo = await ownDemo(req, res);
  if (!demo) return;
  if (!demo.timeline) return fail(res, 409, "Analyse this recording first.");
  if (!demo.recording?.has_audio) {
    return fail(res, 409, "This recording has no sound. You can still add captions by hand.");
  }

  const busy = await StudioJob.findOne({ demo: demo._id, type: "captions", status: { $in: ["queued", "running"] } });
  if (busy) return fail(res, 409, "Captions are already being written.");

  await enqueue({ demo: demo._id, user: req.user.id, type: "captions" });
  publishProgress(demo, { captioning: true });
  res.json({ success: true });
}));

/**
 * Captions from the voiceover script the analysis already wrote.
 *
 * Synchronous, free, and no model call: the narration is in the timeline and
 * this is a chunking pass over it (services/studio/captionsFromScript.js). It
 * answers with the whole demo so the editor swaps straight to the new cues.
 */
router.post("/demos/:id/captions/from-script", wrap(async (req, res) => {
  const demo = await ownDemo(req, res);
  if (!demo) return;
  if (!demo.timeline) return fail(res, 409, "Analyse this recording first.");

  const tl = demo.timeline;
  const cues = cuesFromNarration(tl.narration || [], { duration: tl.duration || 0 });
  if (!cues.length) {
    return fail(res, 409, "There's no voiceover script for this recording yet.");
  }

  demo.timeline = sanitizeTimeline(
    { ...tl, cues, captions: { ...(tl.captions || {}), enabled: true } },
    { duration: tl.duration, source: tl.source }
  );
  demo.rev = (demo.rev || 0) + 1;
  demo.expires_at = bumpExpiry();
  demo.markModified("timeline");
  await demo.save();

  await respond(req, res, demo);
}));

router.post("/demos/:id/review", wrap(async (req, res) => {
  const demo = await ownDemo(req, res);
  if (!demo) return;
  if (!demo.timeline) return fail(res, 409, "There's no edit to review yet.");

  const busy = await StudioJob.findOne({ demo: demo._id, type: "review", status: { $in: ["queued", "running"] } });
  if (busy) return res.json({ success: true, already: true });

  await enqueue({ demo: demo._id, user: req.user.id, type: "review" });
  res.json({ success: true });
}));

/** Apply or dismiss one of the reviewer's suggestions. */
router.post("/demos/:id/suggestions/:sid", wrap(async (req, res) => {
  const demo = await ownDemo(req, res);
  if (!demo) return;
  if (!demo.timeline) return fail(res, 409, "There's no edit to change.");

  const suggestion = (demo.analysis?.suggestions || []).find((s) => s.id === req.params.sid);
  if (!suggestion) return fail(res, 404, "That suggestion is no longer here.");

  const resolved = [...new Set([...(demo.analysis?.resolved || []), suggestion.id])];

  if (req.body?.action === "dismiss") {
    await StudioDemo.updateOne({ _id: demo._id }, { $set: { "analysis.resolved": resolved, updated_at: new Date() } });
    return respond(req, res, demo);
  }

  const { timeline, applied, why } = applySuggestion(demo.timeline, suggestion, {
    duration: demo.recording?.duration || demo.timeline.duration || 0,
  });

  await StudioDemo.updateOne(
    { _id: demo._id },
    {
      // A suggestion that could not be applied is still resolved: it is about
      // something that has moved on, and offering it again next time would be
      // offering the same dead button.
      $set: { ...(applied ? { timeline } : {}), "analysis.resolved": resolved, expires_at: bumpExpiry(), updated_at: new Date() },
      $inc: applied ? { rev: 1 } : {},
    }
  );

  await respond(req, res, demo, { applied, why });
}));

/* ────────────────────────────────────────────────────────────────────────────
   Edits asked for in words (the editor's chat, services/studio/command.js)
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * POST /studio/demos/:id/command
 *   { text } or { intent }   a message, or a button from an earlier answer
 *   { playhead, selected, zooms, cuts, history }   what the editor has now
 *   { rid }   the browser's id for this message, for the live "Looking at…" status
 *
 * Answers with the edit to make, and the editor makes it through the same
 * edit() every other change goes through, so it autosaves, undoes and
 * previews like one made by hand. Nothing is written here: the zooms in the
 * request may be ahead of the stored timeline, and a server-side write would
 * race the editor's own autosave.
 *
 * Free for now, like the voiceover: one short text call per message.
 */
router.post("/demos/:id/command", wrap(async (req, res) => {
  const demo = await ownDemo(req, res);
  if (!demo) return;
  if (!demo.timeline) return fail(res, 409, "There's no edit to change yet.");
  const text = String(req.body?.text || "").trim();
  if (!text && !(req.body?.intent && typeof req.body.intent === "object")) return fail(res, 400, "Type what you'd like to change.");
  if (text.length > 400) return fail(res, 400, "That message is too long. Keep it under 400 characters.");
  // What it is doing while the creator waits ("Looking at the frame at
  // 0:15.7…"), over the live channel, tagged with the browser's own id for
  // this message so the right message shows it.
  const rid = String(req.body?.rid || "").slice(0, 40);
  const onStatus = rid ? (status) => publishProgress(demo, { command: { rid, status } }) : null;
  res.json({ success: true, ...(await runCommand({ demo, body: req.body, onStatus })) });
}));

/** The creator undid an edit the chat made: logged beside the command, as how often it was wrong. */
router.post("/demos/:id/command/undone", wrap(async (req, res) => {
  const demo = await ownDemo(req, res);
  if (!demo) return;
  const cid = String(req.body?.cid || "").slice(0, 40);
  const how = req.body?.how === "typed" ? "typed" : "button";
  console.log(`[studio] command ${cid} on ${demo._id}: undone (${how})`);
  res.json({ success: true });
}));

/* ────────────────────────────────────────────────────────────────────────────
   The timeline
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Autosave from the editor.
 *
 * `rev` is what the browser last read. A mismatch means another tab saved in
 * between, and the answer is the current document rather than a silent
 * overwrite of work this tab never saw.
 *
 * The recovered pointer path is NOT accepted from the browser. It is megabytes,
 * the editor never edits it, and taking it back on every autosave would put the
 * whole track through JSON twice a minute for nothing. Whatever is stored stays.
 */
router.put("/demos/:id/timeline", wrap(async (req, res) => {
  const demo = await ownDemo(req, res);
  if (!demo) return;
  if (demo.purged) return fail(res, 410, "This recording's files have been deleted.");
  if (!demo.timeline) return fail(res, 409, "There's no edit to save yet.");

  const rev = Number(req.body?.rev);
  if (Number.isFinite(rev) && rev !== demo.rev) {
    return fail(res, 409, "This recording changed in another tab.", {
      stale: true,
      demo: await shapeDemo(demo, { baseUrl: baseUrlOf() }),
    });
  }

  const incoming = req.body?.timeline || {};
  const timeline = sanitizeTimeline(
    { ...incoming, track: demo.timeline.track || [], source: demo.timeline.source },
    { duration: demo.recording?.duration || demo.timeline.duration || 0, source: demo.timeline.source }
  );

  const updated = await StudioDemo.findOneAndUpdate(
    { _id: demo._id, rev: demo.rev },
    { $set: { timeline, expires_at: bumpExpiry(), updated_at: new Date() }, $inc: { rev: 1 } },
    { new: true }
  );
  if (!updated) {
    return fail(res, 409, "This recording changed in another tab.", {
      stale: true,
      demo: await shapeDemo(await StudioDemo.findById(demo._id), { baseUrl: baseUrlOf() }),
    });
  }

  res.json({
    success: true,
    rev: updated.rev,
    output_duration: Math.round(layout(timeline).duration * 100) / 100,
  });
}));

/* ────────────────────────────────────────────────────────────────────────────
   Following a blur
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * POST /studio/demos/:id/follow  { blur: { id, x, y, w, h, at, start, end } }
 *
 * Follow one blur through the recording, so it stays on what it covers when
 * the page scrolls (services/studio/blurTrack.js). The blur comes in the body,
 * exactly as the editor has it, because the editor asks the moment the
 * creator lets go of the rectangle and its autosave may not have landed yet.
 * The follow is signed with that blur (follow.mjs blurSig) and only ever used
 * while the blur still matches.
 *
 * Free: it is a pass over frames on this server, no model call, and charging
 * for the thing that keeps a secret covered would make leaving it uncovered
 * the cheaper choice. A newer request for the same blur replaces a queued one.
 */
router.post("/demos/:id/follow", wrap(async (req, res) => {
  const demo = await ownDemo(req, res);
  if (!demo) return;
  if (demo.purged) return fail(res, 410, "This recording's files have been deleted.");
  if (!demo.recording?.mp4_key) return fail(res, 409, "This recording isn't ready yet.");

  const b = req.body?.blur || {};
  const id = String(b.id || "");
  if (!/^[\w-]{1,40}$/.test(id)) return fail(res, 400, "Which blur?");
  const total = Number(demo.recording?.duration || demo.timeline?.duration || 0);
  const r4 = (v) => Math.round(Number(v) * 1e4) / 1e4;
  const r3 = (v) => Math.round(Number(v) * 1e3) / 1e3;
  const blur = {
    id,
    x: r4(b.x), y: r4(b.y), w: r4(b.w), h: r4(b.h),
    at: r3(Math.min(total, Math.max(0, Number(b.at)))),
    start: r3(Math.min(total, Math.max(0, Number(b.start)))),
    end: r3(Math.min(total, Math.max(0, Number(b.end)))),
  };
  const ok = [blur.x, blur.y, blur.w, blur.h, blur.at, blur.start, blur.end].every(Number.isFinite);
  if (!ok || blur.w <= 0 || blur.h <= 0 || blur.w > 1 || blur.h > 1 || blur.end - blur.start < 0.02) {
    return fail(res, 400, "That blur can't be followed.");
  }

  await StudioJob.deleteMany({ demo: demo._id, type: "track", ref: id, status: "queued" });
  const busy = await StudioJob.countDocuments({ demo: demo._id, type: "track", status: { $in: ["queued", "running"] } });
  if (busy >= 24) return fail(res, 429, "Too many blurs are being followed at once. Try again in a moment.");

  const sig = blurSig(blur);
  await enqueue({ demo: demo._id, user: req.user.id, type: "track", ref: id, data: { blur, seq: Date.now() } });
  publishProgress(demo, { following: { id, sig, progress: 0 } });
  res.json({ success: true, sig });
}));

/**
 * GET /studio/demos/:id/follows
 *
 * Each blur's follow, and where the latest request to apply each blur is:
 * { follows: { [id]: follow }, jobs: { [id]: { sig, status, error, age } } },
 * `age` in seconds since it was asked for. The editor reads this every few
 * seconds while a blur is applying, so a progress message lost on the way
 * (a dropped socket, a worker that never picked the job up) shows as what it
 * is instead of "Applying…" for ever.
 */
/* ────────────────────────────────────────────────────────────────────────────
   The AI voiceover
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * POST /studio/demos/:id/voice/sample  { voice, text }
 *
 * One voice saying the demo's own first sentence, so a creator hears how it
 * sounds on their content before choosing it: { audio: <a link to an MP3> }.
 * Made once and kept (voice.js voiceSampleUrl): asking again, today or next
 * week, plays the kept file instead of calling the model. Free, like the
 * voiceover itself for now.
 */
router.post("/demos/:id/voice/sample", wrap(async (req, res) => {
  const demo = await ownDemo(req, res);
  if (!demo) return;
  const v = voiceById(String(req.body?.voice || ""));
  const text = String(req.body?.text || "").replace(/\s+/g, " ").trim().slice(0, 240);
  if (!v) return fail(res, 400, "Which voice?");
  if (!text) return fail(res, 400, "There is nothing to say yet.");
  let audio;
  try {
    audio = await voiceSampleUrl(text, v.id, { baseUrl: baseUrlOf() });
  } catch (err) {
    console.error(`[studio] voice sample ${v.id} failed:`, err.message);
    return fail(res, 502, err.userMessage || "That voice didn't answer. Try again in a moment.");
  }
  res.json({ success: true, audio });
}));

/**
 * POST /studio/demos/:id/voice  { voice, cues: [{ id, start, end, text }] }
 *
 * Make the voiceover from these captions in this voice (the "voice" job,
 * services/studio/voice.js). The captions come in the body, exactly as the
 * editor has them, like a blur to follow: Apply is pressed right after an
 * edit, before the autosave lands. A newer request replaces a queued one.
 * Answers with the signature the finished voiceover will carry.
 */
router.post("/demos/:id/voice", wrap(async (req, res) => {
  const demo = await ownDemo(req, res);
  if (!demo) return;
  if (demo.purged) return fail(res, 410, "This recording's files have been deleted.");
  const v = voiceById(String(req.body?.voice || ""));
  if (!v) return fail(res, 400, "Which voice?");
  const total = Number(demo.recording?.duration || demo.timeline?.duration || 0);
  const cues = (Array.isArray(req.body?.cues) ? req.body.cues : [])
    .slice(0, 1000)
    .map((c) => ({
      id: String(c?.id || "").slice(0, 40),
      start: Math.max(0, Math.min(total || Infinity, Number(c?.start) || 0)),
      end: Math.max(0, Math.min(total || Infinity, Number(c?.end) || 0)),
      text: String(c?.text || "").replace(/\s+/g, " ").trim().slice(0, 300),
    }))
    .filter((c) => c.text && c.end > c.start);
  if (!cues.length) return fail(res, 400, "Add some captions first: the voice speaks them.");

  const sig = voiceSig(v.id, cues);
  await StudioJob.deleteMany({ demo: demo._id, type: "voice", status: "queued" });
  await enqueue({ demo: demo._id, user: req.user.id, type: "voice", ref: sig, data: { voice: v.id, cues, sig, seq: Date.now() } });
  publishProgress(demo, { voicing: { sig, progress: 0 } });
  res.json({ success: true, sig });
}));

/**
 * GET /studio/demos/:id/voice
 *
 * The voiceover, and where the latest request for one is: { voiceover, job:
 * { sig, status, error, age } }. The editor reads this every few seconds
 * while one is being made, so a lost progress message never leaves it saying
 * "Making the voiceover…" for ever.
 */
router.get("/demos/:id/voice", wrap(async (req, res) => {
  const demo = await ownDemo(req, res);
  if (!demo) return;
  const job = await StudioJob.findOne({ demo: demo._id, type: "voice" }).sort({ created_at: -1 }).select("ref status error created_at").lean();
  res.json({
    success: true,
    voiceover: await shapeVoiceover(demo, { baseUrl: baseUrlOf() }),
    job: job
      ? {
          sig: job.ref,
          status: job.status,
          error: job.status === "failed" ? "We couldn't make the voiceover. Try again in a moment." : "",
          age: Math.round((Date.now() - new Date(job.created_at).getTime()) / 1000),
        }
      : null,
  });
}));

router.get("/demos/:id/follows", wrap(async (req, res) => {
  const demo = await ownDemo(req, res);
  if (!demo) return;
  const rows = await StudioJob.find({ demo: demo._id, type: "track" })
    .sort({ created_at: -1 })
    .limit(60)
    .select("ref status error data created_at")
    .lean();
  const jobs = {};
  const now = Date.now();
  for (const j of rows) {
    if (jobs[j.ref] || !j.data?.blur) continue;
    jobs[j.ref] = {
      sig: blurSig(j.data.blur),
      status: j.status,
      error: j.status === "failed" ? "We couldn't apply that blur" : "",
      age: Math.round((now - new Date(j.created_at).getTime()) / 1000),
    };
  }
  res.json({ success: true, follows: followsFor(demo), jobs });
}));

/* ────────────────────────────────────────────────────────────────────────────
   Exports
   ──────────────────────────────────────────────────────────────────────────── */

router.post("/demos/:id/renders", wrap(async (req, res) => {
  const demo = await ownDemo(req, res);
  if (!demo) return;
  if (demo.purged) return fail(res, 410, "This recording's files have been deleted.");
  if (!demo.timeline) return fail(res, 409, "There's no edit to export yet.");

  const today = await StudioJob.countDocuments({ user: req.user.id, type: "render", created_at: { $gte: sinceDay() } });
  if (today >= STUDIO_LIMITS.dailyExports) {
    return fail(res, 429, `You've exported ${today} times today. The daily limit is ${STUDIO_LIMITS.dailyExports}.`);
  }

  const hevc = await hasEncoder("libx265");
  const options = cleanExportOptions(req.body?.options, { hevc });
  const out = layout(demo.timeline).duration;
  if (!(out > 0.1)) return fail(res, 400, "There's nothing left in this edit to export.");

  const cost = exportPrice(studioCost("export", out), options);
  const expected = Number(req.body?.expected_cost);
  if (Number.isFinite(expected) && expected !== cost) {
    return fail(res, 409, "The price changed. Please try again.", { price_changed: true, cost, options });
  }

  const charged = await charge(req, res, cost, { refId: demo._id, note: `export ${options.format}`, what: "This export" });
  if (charged === null) return;

  const id = newId("r");
  await StudioDemo.updateOne(
    { _id: demo._id },
    {
      $push: {
        renders: {
          $each: [{ id, status: "queued", options, charged, created_at: new Date() }],
          $position: 0,
          // Ten is what a creator can actually keep track of, and every one is
          // a file in the bucket. Older ones drop off the list; their objects
          // go with the demo's prefix when it expires.
          $slice: 10,
        },
      },
      $set: { expires_at: bumpExpiry(), updated_at: new Date() },
    }
  );

  await enqueue({ demo: demo._id, user: req.user.id, type: "render", ref: id });
  publishProgress(demo, { render: id, status: "queued", progress: 0 });

  await respond(req, res, demo, { render: id, charged, balance: await getBalance(req.user.id) });
}));

router.get("/demos/:id/renders/:rid/download", wrap(async (req, res) => {
  const demo = await ownDemo(req, res);
  if (!demo) return;
  const entry = (demo.renders || []).find((x) => x.id === req.params.rid);
  if (!entry || entry.status !== "done") return fail(res, 404, "That export isn't ready.");

  const wantSrt = String(req.query.file || "") === "srt";
  const key = wantSrt ? entry.srt_key : entry.output_key;
  if (!key) return fail(res, 404, wantSrt ? "There are no captions with that export." : "That export is gone.");

  const safe = (demo.title || "demo").replace(/[^\w\s-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "demo";
  const ext = wantSrt ? "srt" : entry.options?.format || "mp4";
  const url = await readUrl(key, { baseUrl: baseUrlOf(), filename: `${safe}.${ext}` });
  res.json({ success: true, url });
}));

router.delete("/demos/:id/renders/:rid", wrap(async (req, res) => {
  const demo = await ownDemo(req, res);
  if (!demo) return;
  const entry = (demo.renders || []).find((x) => x.id === req.params.rid);
  if (!entry) return fail(res, 404, "That export is already gone.");

  // Credits back only for one still queued: a finished render was delivered,
  // and a failed one was refunded when it failed.
  if (entry.status === "queued" && entry.charged > 0) {
    await refund(req.user.id, entry.charged, { refType: "StudioDemo", refId: demo._id, note: "export cancelled" }).catch(() => {});
  }
  if (entry.output_key) await removeObject(entry.output_key).catch(() => {});
  if (entry.srt_key) await removeObject(entry.srt_key).catch(() => {});

  await StudioJob.deleteMany({ demo: demo._id, type: "render", ref: entry.id, status: "queued" });
  await StudioDemo.updateOne({ _id: demo._id }, { $pull: { renders: { id: entry.id } } });

  await respond(req, res, demo);
}));

export default router;

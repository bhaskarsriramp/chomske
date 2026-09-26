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
import { enqueue } from "../services/studio/studioRunner.js";
import {
  STUDIO_LIMITS, LEDGER_REASON, acceptable, ACCEPT_MIME, demoKey, demoPrefix, bumpExpiry,
  studioCost, shapeDemo, shapeDemoCard, publishProgress,
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
import { isDemoSlug, ensureDemoSlug } from "../services/studio/demoSlug.js";
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
    balance: await getBalance(req.user.id),
  });
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

  demo.status = "analysing";
  demo.stage = "Queued";
  demo.progress = 0.01;
  demo.error = "";
  demo.analysis = { ...(demo.analysis?.toObject?.() || {}), status: "running", error: "", charged };
  demo.expires_at = bumpExpiry();
  await demo.save();

  await enqueue({ demo: demo._id, user: req.user.id, type: "analyse", ref: wantCaptions ? "captions" : "" });
  publishProgress(demo, { status: "analysing", stage: "Queued", progress: 0.01 });

  await respond(req, res, demo, { charged, balance: await getBalance(req.user.id) });
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

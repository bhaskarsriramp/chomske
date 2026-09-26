/**
 * routes/edit.js: the video editor.
 *
 *   GET    /edit/config
 *   GET    /edit/projects                     Edit videos
 *   POST   /edit/projects                     { script_id }  open (or reopen) the edit for a script
 *                                             { name }       start a project for any video
 *   GET    /edit/projects/:id
 *   PATCH  /edit/projects/:id                 { name }
 *   DELETE /edit/projects/:id
 *   POST   /edit/projects/:id/media           { filename, mime, size, kind }  start an upload
 *   POST   /edit/projects/:id/media/:mid/complete
 *   POST   /edit/projects/:id/media/:mid/resume   carry on an upload that stopped
 *   DELETE /edit/projects/:id/media/:mid
 *   PATCH  /edit/projects/:id/recordings      { ids }  the order recordings were made in
 *   POST   /edit/projects/:id/analyse         { expected_cost }  match to the script, or write captions
 *   POST   /edit/projects/:id/open            free projects: edit without (new) captions
 *   PUT    /edit/projects/:id/timeline        { timeline, rev }
 *   GET    /edit/projects/:id/translate/quote ?lang=
 *   POST   /edit/projects/:id/translate       { lang, expected_cost }
 *   POST   /edit/projects/:id/translate/ack   { id }  the editor has taken the result
 *   POST   /edit/projects/:id/renders         { expected_cost }
 *   GET    /edit/projects/:id/renders/:rid/download
 *   DELETE /edit/projects/:id/renders/:rid
 *
 * ── SIGNED-IN CREATORS ONLY ──────────────────────────────────────────────────
 * Not showcase visitors. A showcase is a private link to a demo; letting it
 * upload gigabytes into our bucket and burn render minutes would turn an
 * outreach tool into free hosting.
 *
 * ── PRICES ARE CONFIRMED, NOT ASSUMED ────────────────────────────────────────
 * Every paid action takes `expected_cost`, the number the button showed. If the
 * server's own price differs (the edit changed length since the price was
 * shown, or the rate changed), nothing is charged and the new price comes back.
 * Nobody pays a number they did not see.
 */
import express from "express";
import mongoose from "mongoose";
import authenticateToken from "../middleware/authenticateToken.js";
import EditProject from "../models/EditProject.js";
import EditJob from "../models/EditJob.js";
import Script from "../models/Script.js";
import {
  storageKind, CHUNK_BYTES, createUploadSession, statObject, readUrl, removePrefix, removeObject,
} from "../services/media/storage.js";
import { enqueue } from "../services/edit/editRunner.js";
import { hasEncoder } from "../services/media/ffmpeg.js";
import {
  EXPORT_ENGINE, RESOLUTIONS, FRAME_RATES, VIDEO_MBPS, AUDIO_KBPS, SPEEDS, MAX_RESOLUTION, EXPORT_MULTIPLIERS,
  DEFAULT_EXPORT, cleanExportOptions, exportPrice,
} from "../services/edit/exportOptions.js";
import {
  EDIT_LIMITS, LEDGER_REASON, ACCEPT, classify, mediaKey, projectPrefix, bumpExpiry, scriptLines,
  shapeProject, publishProgress, modeOf, aspectOf, readyRecordings, untranscribed, translationQuote,
} from "../services/edit/projectService.js";
import { sanitizeTimeline, layout, newId, buildFreeTimeline, mergeFreeTimeline } from "../services/edit/timeline.js";
import { CAPTION_LANGUAGES, LANGUAGE_CODES, languageByCode } from "../services/edit/languages.js";
import { spend, refund, getBalance, InsufficientCredits } from "../services/creditsService.js";
import {
  editCost, EDIT_ANALYSE_CREDITS_PER_MIN, EDIT_EXPORT_CREDITS_PER_MIN, EDIT_TRANSLATE_CREDITS_PER_MIN,
} from "../services/creditPricing.js";

const router = express.Router();
router.use(authenticateToken);

/**
 * Where the browser reaches this API, for local-mode media links.
 *
 * Empty unless PUBLIC_API_URL is set, which makes the links root-relative
 * ("/media/upload/..."), and the browser puts its own API address in front
 * (src/components/Edit/editApi.js). It used to fall back to this request's own
 * host, which behind nginx is "https://tryclipo.com" WITHOUT the "/api" the
 * proxy strips, so every upload chunk went to the static site and nginx
 * refused it with 413.
 */
const baseUrlOf = () => String(process.env.PUBLIC_API_URL || "").replace(/\/$/, "");

const originOf = (req) =>
  req.get("origin") || String(process.env.CORS_ORIGINS || "").split(",")[0].trim() || undefined;

const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    console.error(`[edit] ${req.method} ${req.originalUrl} failed:`, err);
    if (!res.headersSent) fail(res, 500, err.userMessage || "Something went wrong. Please try again.");
  }
};

const cleanName = (v) => String(v || "").replace(/\s+/g, " ").trim().slice(0, 120);

async function ownProject(req, res) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    fail(res, 404, "Project not found.");
    return null;
  }
  const project = await EditProject.findOne({ _id: req.params.id, user: req.user.id });
  if (!project) {
    fail(res, 404, "Project not found.");
    return null;
  }
  return project;
}

async function respondProject(req, res, project, extra = {}) {
  const fresh = project.toObject ? project : await EditProject.findById(project._id);
  const script = fresh.script
    ? await Script.findOne({ _id: fresh.script, user: req.user.id })
        .select("text roman_text roman_aligned shoot_pack language_label headline")
        .lean()
    : null;
  return res.json({
    success: true,
    project: await shapeProject(fresh, { baseUrl: baseUrlOf(req) }),
    script: script
      ? {
          headline: script.headline || "",
          language_label: script.language_label || "",
          lines: scriptLines(script),
          checklist: (script.shoot_pack?.broll || []).map((b) => ({ item: b.item, note: b.note })),
        }
      : null,
    ...extra,
  });
}

const sinceDay = () => new Date(Date.now() - 24 * 3600 * 1000);

/** Take credits, or answer 402 with what is missing. Returns null when it answered. */
async function charge(req, res, cost, { refId, note, what }) {
  try {
    const spent = await spend(req.user.id, cost, { reason: LEDGER_REASON, refType: "EditProject", refId, note });
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

/* ── Config ──────────────────────────────────────────────────────────────── */

router.get("/config", async (req, res) => {
  const hevc = await hasEncoder("libx265");
  res.json({
    success: true,
    storage: storageKind(),
    chunk_bytes: CHUNK_BYTES,
    accept: ACCEPT,
    limits: {
      max_upload_mb: Math.round(EDIT_LIMITS.maxUploadBytes / 1024 / 1024),
      max_recording_seconds: EDIT_LIMITS.maxRecordingSeconds,
      max_asset_seconds: EDIT_LIMITS.maxAssetSeconds,
      max_media: EDIT_LIMITS.maxMedia,
      max_projects: EDIT_LIMITS.maxProjects,
      retention_days: EDIT_LIMITS.retentionDays,
    },
    pricing: {
      analyse_per_min: EDIT_ANALYSE_CREDITS_PER_MIN,
      export_per_min: EDIT_EXPORT_CREDITS_PER_MIN,
      translate_per_min: EDIT_TRANSLATE_CREDITS_PER_MIN,
    },
    caption_languages: CAPTION_LANGUAGES.map(({ code, label, native }) => ({ code, label, native })),
    // What the export dialog offers. `engine` lets the browser notice a server
    // that was never restarted after an update, before a creator pays for an
    // export that server would draw without its captions and media.
    export: {
      engine: EXPORT_ENGINE,
      resolutions: RESOLUTIONS.filter((r) => r <= MAX_RESOLUTION),
      frame_rates: FRAME_RATES,
      video_mbps: VIDEO_MBPS,
      audio_kbps: AUDIO_KBPS,
      codecs: hevc ? ["h264", "hevc"] : ["h264"],
      speeds: Object.keys(SPEEDS),
      multipliers: EXPORT_MULTIPLIERS,
      defaults: DEFAULT_EXPORT,
    },
  });
});

/* ── Projects ────────────────────────────────────────────────────────────── */

router.get("/projects", wrap(async (req, res) => {
  const q = { user: req.user.id };
  if (req.query.script_id && mongoose.Types.ObjectId.isValid(req.query.script_id)) q.script = req.query.script_id;
  const rows = await EditProject.find(q).sort({ updated_at: -1 }).limit(60).select("-timeline").lean();
  const baseUrl = baseUrlOf(req);
  const projects = await Promise.all(
    rows.map(async (p) => {
      const shaped = await shapeProject(p, { baseUrl, withTimeline: false });
      const cover = shaped.media.find((m) => m.kind === "recording" && m.thumb_url);
      const last = [...shaped.renders].reverse().find((r) => r.status === "done");
      return {
        id: shaped.id,
        mode: shaped.mode,
        script: shaped.script,
        headline: shaped.headline,
        status: shaped.status,
        duration: p.duration || 0,
        thumb_url: cover?.thumb_url || null,
        recordings: shaped.media.filter((m) => m.kind === "recording").length,
        exported: !!last,
        rendering: shaped.renders.some((r) => r.status === "queued" || r.status === "rendering"),
        translating: shaped.translation?.status === "running",
        purged: shaped.purged,
        expires_at: shaped.expires_at,
        updated_at: shaped.updated_at,
      };
    })
  );
  res.json({ success: true, projects });
}));

router.post("/projects", wrap(async (req, res) => {
  const scriptId = String(req.body?.script_id || "");

  // Any video, no script: a project with a name and nothing else yet.
  if (!scriptId) {
    const live = await EditProject.countDocuments({ user: req.user.id, purged: false });
    if (live >= EDIT_LIMITS.maxProjects) {
      return fail(res, 429, `You have ${live} videos here. Delete ones you've finished to start another.`);
    }
    const project = await EditProject.create({
      user: req.user.id,
      mode: "free",
      headline: cleanName(req.body?.name) || "Untitled video",
      expires_at: bumpExpiry(),
    });
    return respondProject(req, res, project);
  }

  if (!mongoose.Types.ObjectId.isValid(scriptId)) return fail(res, 400, "Pick a script first.");
  const script = await Script.findOne({ _id: scriptId, user: req.user.id }).lean();
  if (!script) return fail(res, 404, "Script not found.");
  if (script.status !== "done") return fail(res, 400, "Let the script finish writing first.");

  // One live edit per script. Opening it again reopens it, with its uploads.
  let project = await EditProject.findOne({ user: req.user.id, script: script._id, purged: false }).sort({ updated_at: -1 });
  if (!project) {
    project = await EditProject.create({
      user: req.user.id,
      profile: script.profile || null,
      script: script._id,
      mode: "script",
      headline: script.headline || "",
      language_label: script.language_label || "",
      expires_at: bumpExpiry(),
    });
  }
  return respondProject(req, res, project);
}));

router.get("/projects/:id", wrap(async (req, res) => {
  const project = await ownProject(req, res);
  if (!project) return;
  return respondProject(req, res, project);
}));

router.patch("/projects/:id", wrap(async (req, res) => {
  const project = await ownProject(req, res);
  if (!project) return;
  const name = cleanName(req.body?.name);
  if (!name) return fail(res, 400, "Give your video a name.");
  await EditProject.updateOne({ _id: project._id }, { $set: { headline: name, updated_at: new Date() } });
  res.json({ success: true, headline: name });
}));

router.delete("/projects/:id", wrap(async (req, res) => {
  const project = await ownProject(req, res);
  if (!project) return;
  const busy = await EditJob.exists({ project: project._id, status: "running" });
  if (busy) return fail(res, 409, "Wait for the current step to finish, then delete.");
  await EditJob.updateMany({ project: project._id, status: "queued" }, { $set: { status: "failed", error: "project deleted" } });
  await removePrefix(projectPrefix(project)).catch((err) => console.error("[edit] delete files:", err.message));
  await EditProject.deleteOne({ _id: project._id });
  res.json({ success: true });
}));

/* ── Media ───────────────────────────────────────────────────────────────── */

/**
 * The session for a file still uploading, to carry on from the last byte the
 * store holds. Cloud Storage keeps a resumable session for a week, so the same
 * one is handed back (a new one would start the file over). A local upload link
 * is signed again: the bytes already written wait on disk under the same key.
 */
async function uploadSessionFor(project, m, req) {
  if (storageKind() === "gcs" && m.upload_url) return { kind: "gcs", url: m.upload_url, chunk_bytes: CHUNK_BYTES };
  const upload = await createUploadSession({ key: m.key, contentType: m.mime, size: m.size, origin: originOf(req), baseUrl: baseUrlOf(req) });
  if (upload.kind === "gcs") {
    await EditProject.updateOne({ _id: project._id, "media.id": m.id }, { $set: { "media.$.upload_url": upload.url } });
  }
  return upload;
}

router.post("/projects/:id/media", wrap(async (req, res) => {
  const project = await ownProject(req, res);
  if (!project) return;
  if (project.purged) return fail(res, 410, "This project's files have expired. Start a new project.");

  // The same upload asked for twice, because the answer to the first was lost
  // on a dropped connection: hand back the one already started, not a second.
  const clientKey = String(req.body?.client_key || "").slice(0, 80);
  const same = clientKey ? project.media.find((m) => m.client_key === clientKey) : null;
  if (same) {
    if (same.status !== "uploading") return res.json({ success: true, media_id: same.id, upload: null, done: true });
    return res.json({ success: true, media_id: same.id, upload: await uploadSessionFor(project, same, req) });
  }

  const kind = req.body?.kind === "recording" ? "recording" : "asset";
  const size = Number(req.body?.size) || 0;
  const filename = String(req.body?.filename || "").slice(0, 200);
  const mime = String(req.body?.mime || "").slice(0, 100);
  const { type, ext } = classify(mime, filename);

  if (!type) return fail(res, 400, "That file type isn't supported. Use MP4 or MOV video, JPG, PNG or WebP images, and MP3, M4A or WAV audio.");
  if (kind === "recording" && type !== "video") return fail(res, 400, "That has to be a video file.");
  if (!size) return fail(res, 400, "That file is empty.");
  if (size > EDIT_LIMITS.maxUploadBytes) {
    return fail(res, 413, `Files can be up to ${Math.round(EDIT_LIMITS.maxUploadBytes / 1024 / 1024 / 1024 * 10) / 10} GB.`);
  }
  if (project.media.length >= EDIT_LIMITS.maxMedia) return fail(res, 400, `A project can hold ${EDIT_LIMITS.maxMedia} files.`);
  if (kind === "recording" && project.status === "analysing") {
    return fail(res, 409, "Wait for this step to finish before adding another video.");
  }

  const id = newId("md");
  const order = project.media.filter((m) => m.kind === "recording").length;
  const key = mediaKey(project, id, "src", ext);
  const upload = await createUploadSession({ key, contentType: mime, size, origin: originOf(req), baseUrl: baseUrlOf(req) });

  await EditProject.updateOne(
    { _id: project._id },
    {
      $push: {
        media: { id, kind, type, status: "uploading", filename, mime, size, order, key, client_key: clientKey, upload_url: upload.kind === "gcs" ? upload.url : "" },
      },
      $set: { updated_at: new Date(), expires_at: bumpExpiry() },
    }
  );
  res.json({ success: true, media_id: id, upload });
}));

router.post("/projects/:id/media/:mid/complete", wrap(async (req, res) => {
  const project = await ownProject(req, res);
  if (!project) return;
  const m = project.media.find((x) => x.id === req.params.mid);
  if (!m) return fail(res, 404, "That upload no longer exists.");

  if (m.status === "uploading") {
    const stat = await statObject(m.key);
    if (!stat || stat.size !== m.size) {
      return fail(res, 409, "The upload didn't finish. Try it again.", { received: stat?.size || 0 });
    }
    const claimed = await EditProject.updateOne(
      { _id: project._id, media: { $elemMatch: { id: m.id, status: "uploading" } } },
      { $set: { "media.$.status": "uploaded", "media.$.upload_url": "", updated_at: new Date() } }
    );
    if (claimed.modifiedCount) {
      await enqueue({ project: project._id, user: project.user, type: "prepare", ref: m.id });
      publishProgress(project, { media: m.id, media_status: "uploaded" });
    }
  }
  return respondProject(req, res, await EditProject.findById(project._id));
}));

/** An upload that stopped: its session again, so the browser carries on from what arrived. */
router.post("/projects/:id/media/:mid/resume", wrap(async (req, res) => {
  const project = await ownProject(req, res);
  if (!project) return;
  if (project.purged) return fail(res, 410, "This project's files have expired.");
  const m = project.media.find((x) => x.id === req.params.mid);
  if (!m) return fail(res, 404, "That upload no longer exists. Upload the file again.");
  if (m.status !== "uploading") return res.json({ success: true, media_id: m.id, upload: null, done: true });
  res.json({ success: true, media_id: m.id, size: m.size, upload: await uploadSessionFor(project, m, req) });
}));

router.delete("/projects/:id/media/:mid", wrap(async (req, res) => {
  const project = await ownProject(req, res);
  if (!project) return;
  const m = project.media.find((x) => x.id === req.params.mid);
  if (!m) return respondProject(req, res, project);
  const free = modeOf(project) === "free";

  if (m.status === "processing") return fail(res, 409, "That file is still being prepared. Remove it in a moment.");
  if (m.kind === "recording" && project.status === "analysing") return fail(res, 409, "Wait for this step to finish.");
  if (!free && m.kind === "recording" && project.timeline && (project.timeline.clips || []).some((c) => c.media === m.id)) {
    return fail(res, 409, "Your edit is cut from this recording. Match again without it to remove it.");
  }

  // Anything in the edit pointing at the file lets go of it, rather than the
  // edit failing at export over a file that is gone. For a free project that
  // includes a whole video: its parts, their B-roll and their captions go.
  const $set = { updated_at: new Date() };
  const tl = project.timeline;
  if (tl && m.kind === "asset") {
    $set.timeline = {
      ...tl,
      broll: (tl.broll || []).map((b) => (b.media === m.id ? { ...b, media: null, media_in: 0 } : b)),
      audio: (tl.audio || []).filter((a) => a.media !== m.id),
    };
  } else if (tl && free && m.kind === "recording") {
    const gone = new Set((tl.clips || []).filter((c) => c.media === m.id).map((c) => c.id));
    $set.timeline = {
      ...tl,
      clips: (tl.clips || []).filter((c) => c.media !== m.id),
      broll: (tl.broll || []).filter((b) => !gone.has(b.clip)),
      sources: (tl.sources || []).filter((id) => id !== m.id),
    };
    if (Array.isArray(tl.segments)) $set.timeline.segments = tl.segments.filter((s) => s.media !== m.id);
    $set.duration = layout($set.timeline).duration;
  }
  await EditProject.updateOne(
    { _id: project._id },
    {
      $pull: { media: { id: m.id }, "analysis.transcribed": m.id },
      $set,
      ...($set.timeline ? { $inc: { timeline_rev: 1 } } : {}),
    }
  );
  await Promise.all([m.key, m.proxy_key, m.audio_key, m.thumb_key].filter(Boolean).map((k) => removeObject(k).catch(() => {})));
  return respondProject(req, res, await EditProject.findById(project._id));
}));

router.patch("/projects/:id/recordings", wrap(async (req, res) => {
  const project = await ownProject(req, res);
  if (!project) return;
  if (project.status === "analysing") return fail(res, 409, "Wait for this step to finish.");
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(String);
  await Promise.all(
    ids.map((id, i) => EditProject.updateOne({ _id: project._id, "media.id": id }, { $set: { "media.$.order": i } }))
  );
  return respondProject(req, res, await EditProject.findById(project._id));
}));

/* ── Matching, or captions ───────────────────────────────────────────────── */

router.post("/projects/:id/analyse", wrap(async (req, res) => {
  const project = await ownProject(req, res);
  if (!project) return;
  if (project.purged) return fail(res, 410, "This project's files have expired.");
  if (project.status === "analysing") return respondProject(req, res, project);
  const free = modeOf(project) === "free";

  const recordings = project.media.filter((m) => m.kind === "recording" && m.status !== "failed");
  if (!recordings.length) return fail(res, 400, free ? "Upload your video first." : "Upload your recording first.");
  if (recordings.some((m) => m.status !== "ready")) {
    return fail(res, 409, "Still preparing your upload. This takes a few seconds per minute of video.", { preparing: true });
  }

  // A script is matched from every recording, again. A free project only
  // listens to the videos that have no captions yet.
  const targets = free ? untranscribed(project).filter((m) => m.has_audio) : recordings;
  if (!targets.length) {
    return fail(res, 400, free ? "Captions are already written for every video with sound here." : "Upload your recording first.");
  }

  const seconds = targets.reduce((n, m) => n + (m.duration || 0), 0);
  const cost = editCost("analyse", seconds);
  if (req.body?.expected_cost !== undefined && Number(req.body.expected_cost) !== cost) {
    return fail(res, 409, `This now costs ${cost} credits.`, { price_changed: true, cost });
  }

  const today = await EditJob.countDocuments({ user: req.user.id, type: "analyse", created_at: { $gte: sinceDay() } });
  if (today >= EDIT_LIMITS.dailyAnalyses) {
    return fail(res, 429, `You've used this ${EDIT_LIMITS.dailyAnalyses} times today. The limit resets 24 hours after each one.`);
  }

  const charged = await charge(req, res, cost, {
    refId: project._id,
    what: free ? "Writing captions" : "This",
    note: free ? `Write captions (${Math.ceil(seconds / 60)} min)` : `Match recording to script (${Math.ceil(seconds / 60)} min)`,
  });
  if (charged === null) return;

  const started = await EditProject.findOneAndUpdate(
    { _id: project._id, status: { $ne: "analysing" } },
    {
      $set: {
        status: "analysing", stage: "Queued", progress: 0, error: "",
        "analysis.charged": charged, "analysis.seconds": seconds, "analysis.started_at": new Date(),
        "analysis.targets": free ? targets.map((m) => m.id) : [],
        updated_at: new Date(), expires_at: bumpExpiry(),
      },
    },
    { new: true }
  );
  if (!started) {
    if (charged) await refund(req.user.id, charged, { refType: "EditProject", refId: project._id, note: "Duplicate request" }).catch(() => {});
    return respondProject(req, res, await EditProject.findById(project._id));
  }

  await enqueue({ project: project._id, user: project.user, type: "analyse" });
  return respondProject(req, res, started, { balance: await getBalance(req.user.id).catch(() => null) });
}));

/**
 * A free project, into the editor without waiting for captions: the edit is
 * built from the videos as they are, or has newly uploaded videos added to the
 * end. Free, since nothing is listened to.
 */
router.post("/projects/:id/open", wrap(async (req, res) => {
  const project = await ownProject(req, res);
  if (!project) return;
  if (modeOf(project) !== "free") return fail(res, 400, "Match your recording to the script to start editing.");
  if (project.purged) return fail(res, 410, "This project's files have expired.");
  if (project.status === "analysing") return fail(res, 409, "Wait for your captions to finish.");
  if (project.media.some((m) => m.kind === "recording" && (m.status === "uploaded" || m.status === "processing"))) {
    return fail(res, 409, "Still preparing your upload. This takes a few seconds per minute of video.", { preparing: true });
  }
  const ready = readyRecordings(project);
  if (!ready.length) return fail(res, 400, "Upload your video first.");

  const timeline = project.timeline
    ? mergeFreeTimeline(project.timeline, { recordings: ready })
    : buildFreeTimeline({ recordings: ready, aspect: aspectOf(ready[0]) });
  const changed = !project.timeline || timeline.clips.length !== (project.timeline.clips || []).length || project.status !== "ready";
  if (!changed) return respondProject(req, res, project);

  const saved = await EditProject.findOneAndUpdate(
    { _id: project._id, timeline_rev: project.timeline_rev, status: { $ne: "analysing" } },
    {
      $set: { status: "ready", error: "", timeline, duration: layout(timeline).duration, updated_at: new Date(), expires_at: bumpExpiry() },
      $inc: { timeline_rev: 1 },
    },
    { new: true }
  );
  if (!saved) return fail(res, 409, "This video changed in another tab. Try again.");
  return respondProject(req, res, saved);
}));

/* ── The edit ────────────────────────────────────────────────────────────── */

router.put("/projects/:id/timeline", wrap(async (req, res) => {
  const project = await ownProject(req, res);
  if (!project) return;
  if (project.status !== "ready" || !project.timeline) return fail(res, 409, "There is no edit to save yet.");

  const rev = Number(req.body?.rev);
  if (rev !== project.timeline_rev) {
    // Another tab saved in between. The client decides what to keep; the
    // server never silently overwrites either one.
    return fail(res, 409, "This edit changed in another tab.", { conflict: true, rev: project.timeline_rev, timeline: project.timeline });
  }

  const mediaById = new Map(project.media.filter((m) => m.status === "ready").map((m) => [m.id, m]));
  let clean;
  try {
    clean = sanitizeTimeline(req.body?.timeline, mediaById);
  } catch (err) {
    return fail(res, 400, err.userMessage || "That edit could not be saved.");
  }
  const duration = layout(clean).duration;

  const saved = await EditProject.findOneAndUpdate(
    { _id: project._id, timeline_rev: rev },
    { $set: { timeline: clean, duration, updated_at: new Date(), expires_at: bumpExpiry() }, $inc: { timeline_rev: 1 } },
    { new: true, projection: { timeline_rev: 1 } }
  );
  if (!saved) return fail(res, 409, "This edit changed in another tab.", { conflict: true });

  res.json({
    success: true,
    rev: saved.timeline_rev,
    duration,
    export_cost: duration > 0 ? editCost("export", duration) : 0,
  });
}));

/* ── Translation ─────────────────────────────────────────────────────────── */

router.get("/projects/:id/translate/quote", wrap(async (req, res) => {
  const project = await ownProject(req, res);
  if (!project) return;
  const lang = String(req.query.lang || "");
  if (!LANGUAGE_CODES.has(lang)) return fail(res, 400, "Pick a language.");
  if (!project.timeline) return fail(res, 409, "There is no edit yet.");
  const q = translationQuote(project.timeline, lang);
  res.json({ success: true, lang, cost: q.cost, count: q.ids.length, seconds: Math.round(q.seconds * 10) / 10 });
}));

router.post("/projects/:id/translate", wrap(async (req, res) => {
  const project = await ownProject(req, res);
  if (!project) return;
  if (project.purged) return fail(res, 410, "This project's files have expired.");
  const lang = String(req.body?.lang || "");
  const target = languageByCode(lang);
  if (!target) return fail(res, 400, "Pick a language.");
  if (project.status !== "ready" || !project.timeline) return fail(res, 409, "There is no edit to translate yet.");
  if (project.translation?.status === "running") return fail(res, 409, "A translation is already running for this video.");

  const q = translationQuote(project.timeline, lang);
  if (!q.ids.length) return fail(res, 400, `These captions are already in ${target.label}.`, { nothing: true });
  if (req.body?.expected_cost !== undefined && Number(req.body.expected_cost) !== q.cost) {
    return fail(res, 409, `This now costs ${q.cost} credits.`, { price_changed: true, cost: q.cost });
  }

  const today = await EditJob.countDocuments({ user: req.user.id, type: "translate", created_at: { $gte: sinceDay() } });
  if (today >= EDIT_LIMITS.dailyTranslations) {
    return fail(res, 429, `You've translated ${EDIT_LIMITS.dailyTranslations} times today. The limit resets 24 hours after each one.`);
  }

  const charged = await charge(req, res, q.cost, {
    refId: project._id,
    what: "This translation",
    note: `Translate captions to ${target.label} (${Math.ceil(q.seconds / 60)} min)`,
  });
  if (charged === null) return;

  const id = newId("tr");
  const updated = await EditProject.findOneAndUpdate(
    { _id: project._id, "translation.status": { $ne: "running" } },
    {
      $set: {
        translation: { id, status: "running", lang, ids: q.ids, charged, error: "", items: null, started_at: new Date(), finished_at: null },
        updated_at: new Date(),
        expires_at: bumpExpiry(),
      },
    },
    { new: true }
  );
  if (!updated) {
    if (charged) await refund(req.user.id, charged, { refType: "EditProject", refId: project._id, note: "Duplicate translation" }).catch(() => {});
    return respondProject(req, res, await EditProject.findById(project._id));
  }

  await enqueue({ project: project._id, user: project.user, type: "translate", ref: id });
  return respondProject(req, res, updated, { balance: await getBalance(req.user.id).catch(() => null) });
}));

router.post("/projects/:id/translate/ack", wrap(async (req, res) => {
  const project = await ownProject(req, res);
  if (!project) return;
  await EditProject.updateOne(
    { _id: project._id, "translation.id": String(req.body?.id || ""), "translation.status": { $in: ["done", "failed"] } },
    { $set: { "translation.status": "applied", "translation.items": null } }
  );
  res.json({ success: true });
}));

/* ── Export ──────────────────────────────────────────────────────────────── */

router.post("/projects/:id/renders", wrap(async (req, res) => {
  const project = await ownProject(req, res);
  if (!project) return;
  if (project.purged) return fail(res, 410, "This project's files have expired.");
  if (project.status !== "ready" || !project.timeline) return fail(res, 409, "There is no edit to export yet.");
  if (project.renders.some((r) => r.status === "queued" || r.status === "rendering")) {
    return fail(res, 409, "An export is already running for this video.");
  }

  const duration = layout(project.timeline).duration;
  if (!(duration > 0)) return fail(res, 400, "There is nothing in this edit to export. Turn on at least one part of your video.");
  const options = cleanExportOptions(req.body?.options, { hevc: await hasEncoder("libx265") });
  const cost = exportPrice(editCost("export", duration), options);
  if (req.body?.expected_cost !== undefined && Number(req.body.expected_cost) !== cost) {
    return fail(res, 409, `This export now costs ${cost} credits.`, { price_changed: true, cost });
  }

  const today = await EditJob.countDocuments({ user: req.user.id, type: "render", created_at: { $gte: sinceDay() } });
  if (today >= EDIT_LIMITS.dailyExports) {
    return fail(res, 429, `You've exported ${EDIT_LIMITS.dailyExports} videos today. The limit resets 24 hours after each one.`);
  }

  const id = newId("rn");
  const charged = await charge(req, res, cost, {
    refId: project._id,
    what: "This export",
    note: `Export video (${Math.ceil(duration / 60)} min, ${options.resolution}p${options.fps})`,
  });
  if (charged === null) return;

  await EditProject.updateOne(
    { _id: project._id },
    {
      $push: {
        renders: {
          $each: [{ id, status: "queued", stage: "Queued", aspect: project.timeline.aspect, charged, duration, options, engine: EXPORT_ENGINE }],
          $slice: -10,
        },
      },
      $set: { updated_at: new Date(), expires_at: bumpExpiry() },
    }
  );
  await enqueue({ project: project._id, user: project.user, type: "render", ref: id });
  return respondProject(req, res, await EditProject.findById(project._id), {
    render_id: id,
    balance: await getBalance(req.user.id).catch(() => null),
  });
}));

router.get("/projects/:id/renders/:rid/download", wrap(async (req, res) => {
  const project = await ownProject(req, res);
  if (!project) return;
  const r = project.renders.find((x) => x.id === req.params.rid);
  if (!r || r.status !== "done" || !r.output_key) return fail(res, 404, "That export isn't ready.");
  if (project.purged) return fail(res, 410, "This export has expired.");
  const srt = req.query.file === "srt";
  if (srt && !r.srt_key) return fail(res, 404, "This export has no subtitle file.");

  const slug = String(project.headline || "video")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "video";
  const url = await readUrl(srt ? r.srt_key : r.output_key, {
    baseUrl: baseUrlOf(req),
    filename: `${slug}-${String(r.aspect).replace(":", "x")}.${srt ? "srt" : "mp4"}`,
    contentType: srt ? "application/x-subrip" : "video/mp4",
    expiresSec: 3600,
  });
  res.json({ success: true, url });
}));

router.delete("/projects/:id/renders/:rid", wrap(async (req, res) => {
  const project = await ownProject(req, res);
  if (!project) return;
  const r = project.renders.find((x) => x.id === req.params.rid);
  if (!r) return respondProject(req, res, project);
  if (r.status === "queued" || r.status === "rendering") return fail(res, 409, "That export is still running.");
  if (r.output_key) await removeObject(r.output_key).catch(() => {});
  if (r.srt_key) await removeObject(r.srt_key).catch(() => {});
  await EditProject.updateOne({ _id: project._id }, { $pull: { renders: { id: r.id } } });
  return respondProject(req, res, await EditProject.findById(project._id));
}));

export default router;

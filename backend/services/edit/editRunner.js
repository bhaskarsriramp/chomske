/**
 * editRunner.js: the editor's heavy work, run off the request path.
 *
 * ── HOW A JOB RUNS ───────────────────────────────────────────────────────────
 * Routes insert an EditJob and return. Every instance ticks every few seconds,
 * claims queued jobs up to its own concurrency limits with an atomic
 * findOneAndUpdate, and holds a lease it keeps extending while the work runs.
 * A process that dies mid-render stops extending; the lease lapses; the next
 * tick anywhere picks the job up again. After MAX_ATTEMPTS the job is failed and
 * whatever it charged is refunded.
 *
 * ── NOTHING ESCAPES A HANDLER ────────────────────────────────────────────────
 * A job has nobody to report to. Every failure ends in the project saying what
 * went wrong in a sentence a creator can read, the credits back, and an event
 * so the open tab updates without a refresh.
 */
import os from "os";
import path from "path";
import fsp from "fs/promises";
import EditProject from "../../models/EditProject.js";
import EditJob from "../../models/EditJob.js";
import Script from "../../models/Script.js";
import { materialize, putFile, removePrefix, removeObject } from "../media/storage.js";
import {
  probe, makeVideoProxy, makeAudioProxy, extractSpeechAudio, makeThumbnail, cutAudio, detectSpeech,
} from "../media/ffmpeg.js";
import { transcribePieces } from "./transcribeSpeech.js";
import { translateSegments } from "./translateCaptions.js";
import { alignRecording } from "./align.js";
import {
  buildInitialTimeline, buildFreeTimeline, mergeFreeTimeline, segmentsFromPieces, segmentsOf, layout,
} from "./timeline.js";
import { renderTimeline } from "./render.js";
import { refund } from "../creditsService.js";
import {
  EDIT_LIMITS, mediaKey, projectPrefix, bumpExpiry, scriptLines, publishProgress, modeOf, aspectOf,
  readyRecordings, untranscribed,
} from "./projectService.js";

const WORKER = `${os.hostname()}:${process.pid}`;
const LEASE_MS = 90_000;
const TICK_MS = 2500;
const MAX_ATTEMPTS = 3;
const int = (v, d) => (parseInt(v, 10) > 0 ? parseInt(v, 10) : d);

const LIMIT = {
  prepare: int(process.env.EDIT_PREPARE_CONCURRENCY, 2),
  analyse: int(process.env.EDIT_ANALYSE_CONCURRENCY, 1),
  render: int(process.env.EDIT_RENDER_CONCURRENCY, 1),
  translate: int(process.env.EDIT_TRANSLATE_CONCURRENCY, 2),
};
const running = { prepare: 0, analyse: 0, render: 0, translate: 0 };

const userError = (msg) => Object.assign(new Error(msg), { userMessage: msg });
const r3 = (n) => Math.round(Number(n) * 1000) / 1000;

/** Queue work. Returns at once; the job runs on the next tick. */
export async function enqueue({ project, user, type, ref = "" }) {
  const job = await EditJob.create({ project, user, type, ref });
  setImmediate(() => tick().catch(() => {}));
  return job;
}

let ticking = false;
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    for (const type of Object.keys(LIMIT)) {
      while (running[type] < LIMIT[type]) {
        const job = await claim(type);
        if (!job) break;
        running[type]++;
        execute(job).finally(() => {
          running[type]--;
          setImmediate(() => tick().catch(() => {}));
        });
      }
    }
  } finally {
    ticking = false;
  }
}

function claim(type) {
  const now = new Date();
  return EditJob.findOneAndUpdate(
    { type, $or: [{ status: "queued" }, { status: "running", lease_until: { $lt: now } }] },
    {
      $set: { status: "running", lease_until: new Date(now.getTime() + LEASE_MS), worker: WORKER, updated_at: now },
      $inc: { attempts: 1 },
    },
    { sort: { created_at: 1 }, new: true }
  );
}

async function execute(job) {
  const beat = setInterval(() => {
    EditJob.updateOne(
      { _id: job._id, worker: WORKER, status: "running" },
      { $set: { lease_until: new Date(Date.now() + LEASE_MS) } }
    ).catch(() => {});
  }, LEASE_MS / 3);

  const workDir = path.join(os.tmpdir(), "lipi-edit", String(job._id));
  await fsp.mkdir(workDir, { recursive: true }).catch(() => {});
  const handler = HANDLERS[job.type];

  try {
    if (job.attempts > MAX_ATTEMPTS) {
      throw Object.assign(userError("This kept failing, so we stopped trying. Your credits are back."), { final: true });
    }
    await handler.run(job, workDir);
    await EditJob.updateOne({ _id: job._id }, { $set: { status: "done", lease_until: null, updated_at: new Date() } });
  } catch (err) {
    console.error(`[edit] ${job.type} ${job._id} (attempt ${job.attempts}) failed:`, err.message);
    // A clear user-facing refusal (no sound, wrong file) will fail the same way
    // every time. Only faults with no message of their own are worth another go.
    const again = !err.userMessage && !err.final && job.attempts < MAX_ATTEMPTS;
    if (again) {
      await EditJob.updateOne({ _id: job._id }, { $set: { status: "queued", lease_until: null, error: String(err.message).slice(0, 500) } });
    } else {
      await EditJob.updateOne({ _id: job._id }, { $set: { status: "failed", lease_until: null, error: String(err.message).slice(0, 500), updated_at: new Date() } });
      await handler.fail(job, err).catch((e) => console.error(`[edit] ${job.type} failure handling:`, e.message));
    }
  } finally {
    clearInterval(beat);
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

function setMedia(projectId, mediaId, fields) {
  const $set = { updated_at: new Date() };
  for (const [k, v] of Object.entries(fields)) $set[`media.$.${k}`] = v;
  return EditProject.updateOne({ _id: projectId, "media.id": mediaId }, { $set });
}

function setRender(projectId, renderId, fields) {
  const $set = {};
  for (const [k, v] of Object.entries(fields)) $set[`renders.$.${k}`] = v;
  return EditProject.updateOne({ _id: projectId, "renders.id": renderId }, { $set });
}

/** Writes progress at most every 1.5 s, so a render does not become a write storm. */
function reporter(write) {
  let last = 0;
  return async (fields, force = false) => {
    const now = Date.now();
    if (!force && now - last < 1500) return;
    last = now;
    await write(fields).catch(() => {});
  };
}

async function pool(items, size, fn) {
  const queue = items.map((item, i) => [item, i]);
  await Promise.all(
    Array.from({ length: Math.min(size, queue.length) }, async () => {
      while (queue.length) {
        const [item, i] = queue.shift();
        await fn(item, i);
      }
    })
  );
}

/* ── prepare: one uploaded file ─────────────────────────────────────────── */

const prepare = {
  async run(job, workDir) {
    const project = await EditProject.findById(job.project).lean();
    if (!project || project.purged) return;
    const m = (project.media || []).find((x) => x.id === job.ref);
    if (!m || m.status === "ready") return;

    await setMedia(project._id, m.id, { status: "processing", error: "" });
    publishProgress(project, { media: m.id, media_status: "processing" });

    const src = await materialize(m.key, workDir, `src_${m.id}`);
    const info = await probe(src);
    const set = {
      duration: r3(info.duration),
      width: info.width,
      height: info.height,
      has_audio: info.has_audio,
    };

    let shown = 0;
    const onProgress = (p) => {
      if (p - shown < 0.1) return;
      shown = p;
      publishProgress(project, { media: m.id, media_status: "processing", media_progress: Math.round(p * 100) });
    };

    if (m.type === "video") {
      if (!info.has_video) throw userError("That file has no video in it.");
      if (m.kind === "recording") {
        // A script recording is nothing without its sound. A video uploaded on
        // its own may be silent footage, which is still worth editing.
        if (!info.has_audio && modeOf(project) === "script") {
          throw userError("That recording has no sound, so there is nothing to match to your script.");
        }
        const others = (project.media || [])
          .filter((x) => x.kind === "recording" && x.id !== m.id && x.status !== "failed")
          .reduce((n, x) => n + (x.duration || 0), 0);
        if (others + info.duration > EDIT_LIMITS.maxRecordingSeconds) {
          throw userError(`Videos can add up to ${Math.round(EDIT_LIMITS.maxRecordingSeconds / 60)} minutes per project.`);
        }
      } else if (info.duration > EDIT_LIMITS.maxAssetSeconds) {
        throw userError(`B-roll clips can be up to ${Math.round(EDIT_LIMITS.maxAssetSeconds / 60)} minutes long.`);
      }

      const proxy = path.join(workDir, "proxy.mp4");
      await makeVideoProxy(src, proxy, { duration: info.duration, onProgress });
      set.proxy_key = mediaKey(project, m.id, "proxy", "mp4");
      await putFile(proxy, set.proxy_key, "video/mp4");

      const thumb = path.join(workDir, "thumb.jpg");
      await makeThumbnail(src, thumb, { at: Math.min(1, info.duration / 2) });
      set.thumb_key = mediaKey(project, m.id, "thumb", "jpg");
      await putFile(thumb, set.thumb_key, "image/jpeg");

      if (m.kind === "recording" && info.has_audio) {
        const audio = path.join(workDir, "speech.mp3");
        await extractSpeechAudio(src, audio, { duration: info.duration });
        set.audio_key = mediaKey(project, m.id, "audio", "mp3");
        await putFile(audio, set.audio_key, "audio/mpeg");
      }
    } else if (m.type === "image") {
      if (!info.has_video || !info.width) throw userError("We couldn't read that image. Use a JPG, PNG or WebP.");
      set.duration = 0;
      const thumb = path.join(workDir, "thumb.jpg");
      await makeThumbnail(src, thumb, { isImage: true });
      set.thumb_key = mediaKey(project, m.id, "thumb", "jpg");
      await putFile(thumb, set.thumb_key, "image/jpeg");
    } else {
      if (!info.has_audio) throw userError("That file has no sound in it.");
      const proxy = path.join(workDir, "audio.m4a");
      await makeAudioProxy(src, proxy, { duration: info.duration, onProgress });
      set.proxy_key = mediaKey(project, m.id, "proxy", "m4a");
      await putFile(proxy, set.proxy_key, "audio/mp4");
    }

    set.status = "ready";
    set.error = "";
    await setMedia(project._id, m.id, set);
    await EditProject.updateOne({ _id: project._id }, { $set: { expires_at: bumpExpiry() } });
    publishProgress(project, { media: m.id, media_status: "ready" });
  },

  async fail(job, err) {
    const project = await EditProject.findById(job.project).lean();
    if (!project) return;
    await setMedia(project._id, job.ref, {
      status: "failed",
      error: err.userMessage || "We couldn't read that file. Try exporting it from your phone again as MP4.",
    });
    publishProgress(project, { media: job.ref, media_status: "failed" });
  },
};

/* ── analyse: listen, then match to the script or write captions ────────── */

/** The stretches of speech in some recordings, each cut to its own small file. */
async function speechPieces(recordings, workDir, stage) {
  await stage("Finding where you speak", 0.04, true);
  const pieces = [];
  for (const rec of recordings) {
    if (!rec.audio_key) continue;
    const audio = await materialize(rec.audio_key, workDir, `speech_${rec.id}.mp3`);
    const { islands } = await detectSpeech(audio, { duration: rec.duration });
    islands.forEach((isl, k) => {
      pieces.push({
        media: rec.id,
        media_duration: rec.duration,
        start: isl.start,
        end: isl.end,
        audio,
        // Cut a little wide for the model, so a soft first consonant is not
        // lost; the clip edges still come from the island itself.
        cutStart: Math.max(0, isl.start - 0.1, k > 0 ? (islands[k - 1].end + isl.start) / 2 : 0),
        cutEnd: Math.min(rec.duration, isl.end + 0.1, k < islands.length - 1 ? (isl.end + islands[k + 1].start) / 2 : rec.duration),
      });
    });
  }
  if (pieces.length) {
    await stage("Getting your speech ready", 0.12, true);
    await pool(pieces, 4, async (p, i) => {
      p.path = path.join(workDir, `piece_${String(i).padStart(4, "0")}.mp3`);
      await cutAudio(p.audio, p.path, p.cutStart, p.cutEnd);
    });
  }
  return pieces;
}

const analyse = {
  async run(job, workDir) {
    const project = await EditProject.findById(job.project).lean();
    if (!project || project.purged || project.status !== "analysing") return;

    const report = reporter((fields) =>
      EditProject.updateOne({ _id: project._id }, { $set: fields }).then(() => publishProgress(project, fields))
    );
    const stage = (name, progress, force = false) => report({ stage: name, progress: Math.round(progress * 100) / 100 }, force);

    if (modeOf(project) === "free") return captionVideo(project, workDir, stage);

    const script = await Script.findOne({ _id: project.script, user: project.user }).lean();
    if (!script) throw userError("The script for this video no longer exists.");
    const lines = scriptLines(script);
    if (!lines.length) throw userError("This script has no lines to match.");

    const recordings = readyRecordings(project);
    if (!recordings.length) throw userError("Upload your recording first.");

    // ── Where the speech is ───────────────────────────────────────────────
    const pieces = await speechPieces(recordings, workDir, stage);
    if (!pieces.length) throw userError("We couldn't hear any speech in your recording. Check it has sound.");

    // ── What was said ─────────────────────────────────────────────────────
    await stage("Listening to your recording", 0.2, true);
    const { results, usage } = await transcribePieces({
      pieces,
      lines,
      languageLabel: script.language_label || project.language_label,
      onProgress: (p) => stage("Listening to your recording", 0.2 + 0.62 * p),
    });
    pieces.forEach((p, i) => Object.assign(p, results[i]));

    // ── Which line is which ───────────────────────────────────────────────
    await stage("Matching to your script", 0.86, true);
    const alignment = alignRecording({
      lines,
      pieces: pieces.map(({ media, media_duration, start, end, text, roman, lines: hint }) => ({
        media, media_duration, start, end, text, roman, lines: hint,
      })),
    });
    if (alignment.stats.matched === 0) {
      throw userError("None of your recording matched this script. Check you uploaded the video you recorded for it.");
    }

    // A second analysis replaces the first edit. The route warns before this.
    const timeline = buildInitialTimeline({
      alignment,
      shots: script.shoot_pack?.shots || [],
      aspect: aspectOf(recordings[0]),
      hasRoman: lines.some((l) => l.roman),
      pieces,
    });

    await EditProject.updateOne(
      { _id: project._id },
      {
        $set: {
          status: "ready",
          stage: "",
          progress: 1,
          error: "",
          timeline,
          duration: layout(timeline).duration,
          "analysis.stats": alignment.stats,
          "analysis.usage": usage,
          "analysis.finished_at": new Date(),
          updated_at: new Date(),
          expires_at: bumpExpiry(),
        },
        $inc: { timeline_rev: 1 },
      }
    );
    publishProgress(project, { status: "ready" });
    console.log(
      `[edit] analysed ${project._id}: ${alignment.stats.matched}/${alignment.stats.lines} lines, ` +
        `${pieces.length} pieces, $${(usage.usd || 0).toFixed(4)}`
    );
  },

  async fail(job, err) {
    const project = await EditProject.findOne({ _id: job.project, status: "analysing" }).lean();
    if (!project) return;
    const charged = project.analysis?.charged || 0;
    const free = modeOf(project) === "free";
    await EditProject.updateOne(
      { _id: project._id, status: "analysing" },
      {
        $set: {
          status: project.timeline ? "ready" : "failed",
          stage: "",
          progress: 0,
          error: err.userMessage || (free ? "We couldn't write captions for this video. Please try again." : "We couldn't match this recording. Please try again."),
          "analysis.charged": 0,
          "analysis.targets": [],
        },
      }
    );
    if (charged > 0) {
      await refund(project.user, charged, {
        refType: "EditProject", refId: project._id, note: free ? "Captions failed" : "Matching failed",
      }).catch((e) => console.error("[edit] analyse refund failed:", e.message));
    }
    publishProgress(project, { status: "failed" });
  },
};

/**
 * A video uploaded on its own: write down what was said, as captions.
 *
 * Only the recordings the route charged for (analysis.targets) are listened to.
 * The first time, this builds the edit: every recording whole, in order. After
 * that it only adds, since the creator may have trimmed, split and dressed the
 * edit in the meantime: new recordings go on the end, their captions join the
 * rest, and nothing already there is touched.
 */
async function captionVideo(project, workDir, stage) {
  const ready = readyRecordings(project);
  if (!ready.length) throw userError("Upload your video first.");
  const wanted = new Set(project.analysis?.targets || []);
  const targets = wanted.size ? ready.filter((m) => wanted.has(m.id)) : untranscribed(project);
  if (!targets.length) throw userError("Captions are already written for every video here.");

  const pieces = await speechPieces(targets, workDir, stage);
  let usage = { usd: 0, input: 0, output: 0 };
  let language = "";
  if (pieces.length) {
    await stage("Writing your captions", 0.2, true);
    const out = await transcribePieces({
      pieces,
      languageLabel: project.language_label,
      onProgress: (p) => stage("Writing your captions", 0.2 + 0.74 * p),
    });
    pieces.forEach((p, i) => Object.assign(p, out.results[i]));
    usage = out.usage;
    language = out.language;
  }

  const segments = segmentsFromPieces(pieces);
  const heard = new Set(segments.map((s) => s.media));
  const timeline = project.timeline
    ? mergeFreeTimeline(project.timeline, { recordings: ready, segments })
    : buildFreeTimeline({ recordings: ready, segments, aspect: aspectOf(ready[0]) });

  // Nobody talking (music, silent footage) is not a failure of the video, but
  // there was nothing to caption, so it costs nothing.
  const silent = segments.length === 0;
  const charged = project.analysis?.charged || 0;

  await EditProject.updateOne(
    { _id: project._id, status: "analysing" },
    {
      $set: {
        status: "ready",
        stage: "",
        progress: 1,
        error: silent ? "We couldn't hear anyone speaking, so there are no captions to write. Your credits are back, and you can still edit the video." : "",
        timeline,
        duration: layout(timeline).duration,
        "analysis.stats": { segments: segments.length, pieces: pieces.length },
        "analysis.usage": usage,
        "analysis.finished_at": new Date(),
        "analysis.targets": [],
        ...(silent ? { "analysis.charged": 0 } : {}),
        ...(language && !project.language_label ? { language_label: language } : {}),
        updated_at: new Date(),
        expires_at: bumpExpiry(),
      },
      $addToSet: { "analysis.transcribed": { $each: targets.filter((m) => heard.has(m.id)).map((m) => m.id) } },
      $inc: { timeline_rev: 1 },
    }
  );
  if (silent && charged > 0) {
    await refund(project.user, charged, { refType: "EditProject", refId: project._id, note: "No speech to caption" })
      .catch((e) => console.error("[edit] caption refund failed:", e.message));
  }
  publishProgress(project, { status: "ready" });
  console.log(`[edit] captioned ${project._id}: ${segments.length} segments from ${pieces.length} pieces, $${(usage.usd || 0).toFixed(4)}`);
}

/* ── translate: captions in another language ────────────────────────────── */

const translate = {
  async run(job) {
    const project = await EditProject.findById(job.project).lean();
    const t = project?.translation;
    if (!project || project.purged || !t || t.id !== job.ref || t.status !== "running") return;

    // The words as they are in the saved edit now, which may have been
    // corrected since the translation was ordered.
    const wanted = new Set(t.ids || []);
    const segments = segmentsOf(project.timeline || {}).filter((s) => wanted.has(s.id));
    const { items, usage } = await translateSegments({
      segments,
      lang: t.lang,
      sourceLabel: project.language_label,
    });

    await EditProject.updateOne(
      { _id: project._id, "translation.id": t.id, "translation.status": "running" },
      {
        $set: {
          "translation.status": "done",
          "translation.items": items,
          "translation.usage": usage,
          "translation.finished_at": new Date(),
          updated_at: new Date(),
          expires_at: bumpExpiry(),
        },
      }
    );
    publishProgress(project, { translation: t.id, translation_status: "done" });
    console.log(`[edit] translated ${project._id} to ${t.lang}: ${Object.keys(items).length}/${segments.length}, $${(usage.usd || 0).toFixed(4)}`);
  },

  async fail(job, err) {
    const project = await EditProject.findById(job.project).lean();
    const t = project?.translation;
    if (!t || t.id !== job.ref || t.status !== "running") return;
    await EditProject.updateOne(
      { _id: project._id, "translation.id": t.id, "translation.status": "running" },
      {
        $set: {
          "translation.status": "failed",
          "translation.error": err.userMessage || "We couldn't translate your captions. Your credits are back; please try again.",
          "translation.charged": 0,
          "translation.finished_at": new Date(),
        },
      }
    );
    if (t.charged > 0) {
      await refund(project.user, t.charged, { refType: "EditProject", refId: project._id, note: "Translation failed" })
        .catch((e) => console.error("[edit] translate refund failed:", e.message));
    }
    publishProgress(project, { translation: t.id, translation_status: "failed" });
  },
};

/* ── render: one export ─────────────────────────────────────────────────── */

const render = {
  async run(job, workDir) {
    const project = await EditProject.findById(job.project).lean();
    if (!project || project.purged) return;
    const r = (project.renders || []).find((x) => x.id === job.ref);
    if (!r || r.status === "done") return;

    const report = reporter((fields) =>
      setRender(project._id, r.id, fields).then(() =>
        publishProgress(project, { render: r.id, render_status: fields.status || "rendering", render_progress: fields.progress })
      )
    );
    await report({ status: "rendering", stage: "Starting", progress: 0, error: "" }, true);

    const mediaById = new Map((project.media || []).filter((m) => m.status === "ready").map((m) => [m.id, m]));
    const paths = new Map();
    const pathOf = async (id) => {
      if (!paths.has(id)) {
        const m = mediaById.get(id);
        if (!m) throw userError("A file used in this edit is missing. Remove it and export again.");
        paths.set(id, await materialize(m.key, workDir, `media_${id}.${m.key.split(".").pop()}`));
      }
      return paths.get(id);
    };

    const result = await renderTimeline({
      timeline: project.timeline,
      mediaById,
      pathOf,
      workDir,
      onProgress: (p, stage) => report({ status: "rendering", stage, progress: Math.round(p * 100) / 100 }),
    });

    const key = `${projectPrefix(project)}/renders/${r.id}.mp4`;
    await report({ status: "rendering", stage: "Saving", progress: 0.99 }, true);
    await putFile(result.output, key, "video/mp4");
    const { size } = await fsp.stat(result.output);

    await setRender(project._id, r.id, {
      status: "done", stage: "", progress: 1, output_key: key, size,
      duration: Math.round(result.duration * 100) / 100, finished_at: new Date(),
    });
    await EditProject.updateOne({ _id: project._id }, { $set: { updated_at: new Date(), expires_at: bumpExpiry() } });
    publishProgress(project, { render: r.id, render_status: "done" });
  },

  async fail(job, err) {
    const project = await EditProject.findById(job.project).lean();
    if (!project) return;
    const r = (project.renders || []).find((x) => x.id === job.ref);
    if (!r || r.status === "done" || r.status === "failed") return;
    await setRender(project._id, r.id, {
      status: "failed", stage: "",
      error: err.userMessage || "This export failed. Your credits are back; please try again.",
      finished_at: new Date(),
    });
    if (r.charged > 0) {
      await refund(project.user, r.charged, {
        refType: "EditProject", refId: project._id, note: "Export failed",
      }).catch((e) => console.error("[edit] render refund failed:", e.message));
    }
    publishProgress(project, { render: r.id, render_status: "failed" });
  },
};

const HANDLERS = { prepare, analyse, render, translate };

/* ── Retention ──────────────────────────────────────────────────────────── */

/**
 * Delete the files of projects nobody has touched for EDIT_RETENTION_DAYS, and
 * uploads that were started and never finished.
 *
 * A project with work in flight is never purged: its expiry is pushed instead,
 * so a long render queued at 11:59 on its last day still finishes.
 */
export async function sweepExpired() {
  const now = new Date();
  const rows = await EditProject.find({ purged: false, expires_at: { $lt: now } }).limit(50).lean();
  for (const p of rows) {
    const busy = await EditJob.exists({ project: p._id, status: { $in: ["queued", "running"] } });
    if (busy) {
      await EditProject.updateOne({ _id: p._id }, { $set: { expires_at: bumpExpiry() } });
      continue;
    }
    try {
      await removePrefix(projectPrefix(p));
      await EditProject.updateOne({ _id: p._id }, { $set: { purged: true, media: [], updated_at: now } });
      console.log(`[edit] purged files of ${p._id}`);
    } catch (err) {
      console.error(`[edit] purge ${p._id} failed:`, err.message);
    }
  }

  const stale = new Date(now.getTime() - 48 * 3600 * 1000);
  const abandoned = await EditProject.find({ media: { $elemMatch: { status: "uploading", created_at: { $lt: stale } } } })
    .limit(50)
    .lean();
  for (const p of abandoned) {
    for (const m of p.media.filter((x) => x.status === "uploading" && x.created_at < stale)) {
      await removeObject(m.key).catch(() => {});
      await EditProject.updateOne({ _id: p._id }, { $pull: { media: { id: m.id } } });
    }
  }

  await EditJob.deleteMany({ status: { $in: ["done", "failed"] }, updated_at: { $lt: new Date(now.getTime() - 7 * 86400000) } });
}

let timer = null;
export function startEditRunner() {
  if (String(process.env.EDIT_RUNNER_DISABLED || "").toLowerCase() === "true" || timer) return;
  timer = setInterval(() => tick().catch((err) => console.error("[edit] tick:", err.message)), TICK_MS);
  setInterval(() => sweepExpired().catch((err) => console.error("[edit] sweep:", err.message)), 30 * 60 * 1000);
  setTimeout(() => sweepExpired().catch(() => {}), 60 * 1000);
  tick().catch(() => {});
  console.log(`[edit] runner ${WORKER} started (prepare ${LIMIT.prepare}, analyse ${LIMIT.analyse}, render ${LIMIT.render}, translate ${LIMIT.translate})`);
}

export default { enqueue, startEditRunner, sweepExpired };

/**
 * studioRunner.js: the demo studio's heavy work, run off the request path.
 *
 * ── HOW A JOB RUNS ───────────────────────────────────────────────────────────
 * Routes insert a StudioJob and return. Every instance ticks every few seconds,
 * claims queued jobs up to its own concurrency limits with an atomic
 * findOneAndUpdate, and holds a lease it keeps extending while the work runs. A
 * process that dies mid-render stops extending; the lease lapses; the next tick
 * anywhere picks the job up again. After MAX_ATTEMPTS the job is failed and
 * whatever it charged is refunded.
 *
 * A network fault is different (storage or the model unreachable for a while,
 * edit/transient.js). The job waits, longer each time, and runs again WITHOUT
 * using up an attempt, so a dropped connection holds an analysis up rather than
 * failing it.
 *
 * Deliberately the same design as the script editor's runner, and a separate
 * queue: analysing a demo is dozens of model calls and exporting one is three
 * ffmpeg passes, and neither should be stuck behind the other product's backlog.
 *
 * ── NOTHING ESCAPES A HANDLER ────────────────────────────────────────────────
 * A job has nobody to report to. Every failure ends in the demo saying what
 * went wrong in a sentence a creator can read, the credits back, and an event
 * so the open tab updates without a refresh.
 */
import os from "os";
import path from "path";
import fsp from "fs/promises";
import StudioDemo from "../../models/StudioDemo.js";
import StudioJob from "../../models/StudioJob.js";
import { materialize, putFile, removePrefix, removeObject, statObject } from "../media/storage.js";
import { probe, makeVideoProxy, makeThumbnail, extractSpeechAudio, remuxRecording } from "../media/ffmpeg.js";
import { refund } from "../creditsService.js";
import { transient } from "../edit/transient.js";
import { analyseRecording, generateCaptions, visionPass, auditPass } from "./analyse.js";
import { reviewEdit, newSpend } from "./vision.js";
import { applyPatches } from "./audit.js";
import { witnessPass, WITNESS_MODE } from "./witness.js";
import { applySuggestion } from "./suggestions.js";
import { renderTimeline } from "./render/compose.js";
import { missingFonts, FONTS_DIR } from "./render/ass.js";
import { sanitizeTimeline } from "./timeline.js";
import { RENDER_ENGINE, cleanExportOptions } from "./exportOptions.js";
import { STUDIO_LIMITS, demoKey, demoPrefix, bumpExpiry, publishProgress } from "./demoService.js";
import { jobDir } from "../media/scratch.js";

const WORKER = `${os.hostname()}:${process.pid}`;
const LEASE_MS = 90_000;
const TICK_MS = 2500;
const MAX_ATTEMPTS = 3;
/**
 * Whether a press the audit confirmed becomes a zoom on its own.
 *
 * On, because a demo that silently drops a click the model plainly saw is the
 * wrong default. Set STUDIO_AUTO_PRESS_ZOOMS=0 to go back to offering them as
 * suggestions and nothing more.
 */
const AUTO_APPLY_PRESSES = String(process.env.STUDIO_AUTO_PRESS_ZOOMS || "1") !== "0";
/**
 * Network faults waited out per job: 15 s between tries, doubling, at most 10
 * minutes. A prepare or a render waits about an hour, because the work is all
 * local and only the download or upload was at fault. An analysis gives up
 * sooner: every try pays for model calls again.
 */
const NETWORK_RETRIES = { prepare: 10, render: 10, analyse: 4, vision: 4, captions: 4, review: 3 };

const int = (v, d) => (parseInt(v, 10) > 0 ? parseInt(v, 10) : d);
const LIMIT = {
  prepare: int(process.env.STUDIO_PREPARE_CONCURRENCY, 2),
  analyse: int(process.env.STUDIO_ANALYSE_CONCURRENCY, 1),
  vision: int(process.env.STUDIO_VISION_CONCURRENCY, 1),
  captions: int(process.env.STUDIO_CAPTIONS_CONCURRENCY, 2),
  render: int(process.env.STUDIO_RENDER_CONCURRENCY, 1),
  review: int(process.env.STUDIO_REVIEW_CONCURRENCY, 2),
};
const running = { prepare: 0, analyse: 0, vision: 0, captions: 0, render: 0, review: 0 };

const userError = (msg) => Object.assign(new Error(msg), { userMessage: msg });

/** Queue work. Returns at once; the job runs on the next tick. */
export async function enqueue({ demo, user, type, ref = "" }) {
  const job = await StudioJob.create({ demo, user, type, ref });
  setImmediate(() => tick().catch(() => {}));
  return job;
}

let ticking = false;
let timer = null;

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
  return StudioJob.findOneAndUpdate(
    {
      type,
      $or: [
        { status: "queued", $or: [{ not_before: null }, { not_before: { $lte: now } }] },
        // A lease that ran out: the process holding it died. Anyone may take it.
        { status: "running", lease_until: { $lt: now } },
      ],
    },
    {
      $set: { status: "running", lease_until: new Date(now.getTime() + LEASE_MS), worker: WORKER, updated_at: now },
      $inc: { attempts: 1 },
    },
    { sort: { created_at: 1 }, new: true }
  );
}

async function execute(job) {
  const beat = setInterval(() => {
    StudioJob.updateOne(
      { _id: job._id, worker: WORKER, status: "running" },
      { $set: { lease_until: new Date(Date.now() + LEASE_MS) } }
    ).catch(() => {});
  }, LEASE_MS / 3);

  // Where a job works on disk is a deployment question, not a code one: a
  // Local SSD on a VM, and definitely not /tmp in a container, where it is RAM.
  // See services/media/scratch.js.
  const workDir = await jobDir("lipi-studio", job._id);
  const handler = HANDLERS[job.type];

  try {
    if (job.attempts > MAX_ATTEMPTS) {
      throw Object.assign(userError("This kept failing, so we stopped trying. Your credits are back."), { final: true });
    }
    await handler.run(job, workDir);
    await StudioJob.updateOne({ _id: job._id }, { $set: { status: "done", lease_until: null, updated_at: new Date() } });
  } catch (err) {
    console.error(`[studio] ${job.type} ${job._id} (attempt ${job.attempts}) failed:`, err.message);
    const retries = job.retries || 0;
    const network = !err.final && transient(err) && retries < (NETWORK_RETRIES[job.type] || 0);
    // A clear user-facing refusal (no video, a file ffmpeg cannot read) fails
    // the same way every time. Only faults with no message of their own are
    // worth another go.
    const again = !err.userMessage && !err.final && job.attempts < MAX_ATTEMPTS;

    if (network) {
      const wait = Math.min(10 * 60_000, 15_000 * 2 ** retries);
      await StudioJob.updateOne(
        { _id: job._id },
        {
          $set: {
            status: "queued", lease_until: null,
            not_before: new Date(Date.now() + wait),
            error: String(err.message).slice(0, 500), updated_at: new Date(),
          },
          $inc: { retries: 1, attempts: -1 },
        }
      );
      console.log(`[studio] ${job.type} ${job._id}: network fault, trying again in ${Math.round(wait / 1000)}s (${retries + 1}/${NETWORK_RETRIES[job.type]})`);
    } else if (again) {
      await StudioJob.updateOne({ _id: job._id }, { $set: { status: "queued", lease_until: null, error: String(err.message).slice(0, 500) } });
    } else {
      await StudioJob.updateOne({ _id: job._id }, { $set: { status: "failed", lease_until: null, error: String(err.message).slice(0, 500), updated_at: new Date() } });
      await handler.fail(job, err).catch((e) => console.error(`[studio] ${job.type} failure handling:`, e.message));
    }
  } finally {
    clearInterval(beat);
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Writes progress at most every 1.5s, so a render does not become a write storm. */
function reporter(write) {
  let last = 0;
  return async (fields, force = false) => {
    const now = Date.now();
    if (!force && now - last < 1500) return;
    last = now;
    await write(fields).catch(() => {});
  };
}

const setDemo = (id, fields) => StudioDemo.updateOne({ _id: id }, { $set: { ...fields, updated_at: new Date() } });

function setRender(demoId, renderId, fields) {
  const $set = {};
  for (const [k, v] of Object.entries(fields)) $set[`renders.$.${k}`] = v;
  return StudioDemo.updateOne({ _id: demoId, "renders.id": renderId }, { $set });
}

/* ────────────────────────────────────────────────────────────────────────────
   prepare: the capture, made into something the rest of the pipeline can use
   ──────────────────────────────────────────────────────────────────────────── */

const prepare = {
  async run(job, workDir) {
    const demo = await StudioDemo.findById(job.demo);
    if (!demo || demo.purged) return;
    const r = demo.recording;
    if (!r?.key) throw userError("This recording didn't finish uploading. Please record again.");

    const report = reporter((fields) => {
      publishProgress(demo, fields);
      return setDemo(demo._id, fields);
    });

    await setDemo(demo._id, { status: "preparing", stage: "Checking the recording", progress: 0.05, error: "" });
    publishProgress(demo, { status: "preparing", stage: "Checking the recording", progress: 0.05 });

    // ── What arrived ──────────────────────────────────────────────────────
    const raw = await materialize(r.key, workDir, "capture");
    const first = await probe(raw);
    if (!first.has_video) {
      // Worth the four lines: this is a dead end for the creator and there is
      // nothing in the logs to tell an empty upload from a codec the server
      // cannot read from a file truncated in transit.
      let bytes = -1;
      try { bytes = (await fsp.stat(raw)).size; } catch { /* the size is a nicety */ }
      console.error(
        "[studio] " + String(demo._id) + " has no video stream. key=" + r.key +
          " bytes=" + bytes + " probe=" + JSON.stringify(first)
      );
      throw userError("That file has no video in it. Please record again.");
    }

    // ── A real duration ───────────────────────────────────────────────────
    // MediaRecorder writes a header saying the duration is unknown, because the
    // browser was still recording when it wrote it. Everything downstream is
    // arithmetic on a duration, so this is the first thing made true.
    await report({ stage: "Reading the recording", progress: 0.15 }, true);
    const mp4 = path.join(workDir, "recording.mp4");
    await remuxRecording(raw, mp4, { duration: first.duration });
    const meta = await probe(mp4);

    if (!(meta.duration > 0.5)) throw userError("That recording came out empty. Please try again.");
    if (meta.duration > STUDIO_LIMITS.maxRecordingSeconds) {
      throw userError(`That recording is ${Math.round(meta.duration / 60)} minutes long. The limit is ${Math.round(STUDIO_LIMITS.maxRecordingSeconds / 60)}.`);
    }

    // ── The copies everything else reads ──────────────────────────────────
    await report({ stage: "Making a preview copy", progress: 0.35 }, true);
    const proxy = path.join(workDir, "proxy.mp4");
    await makeVideoProxy(mp4, proxy, {
      duration: meta.duration,
      onProgress: (p) => report({ stage: "Making a preview copy", progress: 0.35 + 0.3 * p }),
    });

    const thumb = path.join(workDir, "thumb.jpg");
    await makeThumbnail(mp4, thumb, { at: Math.min(1.5, meta.duration / 3) });

    let audioLocal = "";
    if (meta.has_audio) {
      await report({ stage: "Separating the audio", progress: 0.7 }, true);
      audioLocal = path.join(workDir, "speech.mp3");
      await extractSpeechAudio(mp4, audioLocal, { duration: meta.duration }).catch((err) => {
        // A recording whose audio track will not decode is still a perfectly
        // good silent demo. It loses captions, not the demo.
        console.error("[studio] speech track failed:", err.message);
        audioLocal = "";
      });
    }

    // ── Put them where the editor can reach them ──────────────────────────
    await report({ stage: "Saving", progress: 0.82 }, true);
    const mp4Key = demoKey(demo, "src", "recording.mp4");
    const proxyKey = demoKey(demo, "proxy", "preview.mp4");
    const thumbKey = demoKey(demo, "thumb", "poster.jpg");
    const audioKey = audioLocal ? demoKey(demo, "audio", "speech.mp3") : "";

    await putFile(mp4, mp4Key, "video/mp4");
    await putFile(proxy, proxyKey, "video/mp4");
    await putFile(thumb, thumbKey, "image/jpeg");
    if (audioLocal) await putFile(audioLocal, audioKey, "audio/mpeg");

    const stat = await statObject(mp4Key).catch(() => null);

    await StudioDemo.updateOne(
      { _id: demo._id },
      {
        $set: {
          "recording.status": "ready",
          "recording.mp4_key": mp4Key,
          "recording.proxy_key": proxyKey,
          "recording.thumb_key": thumbKey,
          "recording.audio_key": audioKey,
          "recording.duration": meta.duration,
          "recording.width": meta.width,
          "recording.height": meta.height,
          "recording.fps": meta.fps || 30,
          "recording.has_audio": !!audioKey,
          "recording.size": stat?.size || demo.recording.size || 0,
          "recording.upload_url": "",
          status: "ready",
          stage: "",
          progress: 1,
          expires_at: bumpExpiry(),
          updated_at: new Date(),
        },
      }
    );

    // The original capture is no longer needed: everything reads the remuxed
    // copy. It is usually the largest object in the bucket for this demo.
    await removeObject(r.key).catch(() => {});
    await StudioDemo.updateOne({ _id: demo._id }, { $set: { "recording.key": "" } });

    publishProgress(demo, { status: "ready", stage: "", progress: 1, prepared: true });
  },

  async fail(job, err) {
    const demo = await StudioDemo.findById(job.demo);
    if (!demo) return;
    const message = err.userMessage || "We couldn't process that recording. Please try again.";
    await setDemo(demo._id, { status: "failed", stage: "", progress: 0, error: message, "recording.status": "failed", "recording.error": message });
    publishProgress(demo, { status: "failed", error: message });
  },
};

/* ────────────────────────────────────────────────────────────────────────────
   analyse: the Gemini pipeline
   ──────────────────────────────────────────────────────────────────────────── */

const analyse = {
  async run(job, workDir) {
    const demo = await StudioDemo.findById(job.demo);
    if (!demo || demo.purged) return;
    const r = demo.recording;
    if (!r?.mp4_key) throw userError("This recording isn't ready to analyse yet.");

    const report = reporter((fields) => {
      publishProgress(demo, fields);
      return setDemo(demo._id, fields);
    });

    await setDemo(demo._id, { status: "analysing", stage: "Starting", progress: 0.01, error: "", "analysis.status": "running", "analysis.error": "" });
    publishProgress(demo, { status: "analysing", stage: "Starting", progress: 0.01 });

    const video = await materialize(r.mp4_key, workDir, "recording.mp4");
    const audio = r.audio_key ? await materialize(r.audio_key, workDir, "speech.mp3") : "";

    // `ref` carries the one option analysis takes. Captions are opt-in: see the
    // note in analyse.js for why a silent demo must not get them by default.
    const wantCaptions = job.ref === "captions";

    const result = await analyseRecording({
      video,
      audio,
      workDir,
      capture: { track: demo.capture?.track || [], motion: demo.capture?.motion || [] },
      source: { width: r.width, height: r.height, fps: r.fps || 30 },
      duration: r.duration,
      wantCaptions,
      onProgress: (p, stage) => report({ stage, progress: Math.max(0.01, Math.min(0.99, p)) }),
    });

    await StudioDemo.updateOne(
      { _id: demo._id },
      {
        $set: {
          timeline: result.timeline,
          status: "ready",
          stage: "",
          progress: 1,
          "analysis.status": "done",
          "analysis.summary": result.summary,
          "analysis.product": result.product,
          "analysis.language": result.language,
          "analysis.language_label": result.language_label,
          "analysis.frames_read": result.frames_read,
          "analysis.blur_checked": !!result.blur_checked,
          "analysis.frames_failed": result.frames_failed,
          "analysis.sync": result.sync || null,
          "analysis.locate": result.locate || null,
          "analysis.elements": result.elements || null,
          // The moments the screen changed, measured once. See the model.
          "analysis.changes": result.changes || null,
          "analysis.rests": result.rests || null,
          // The recording as a graph (vig.js): screens, objects, what was done to what.
          "analysis.vig": result.vig || null,
          /**
           * ── LAST TIME'S FINDINGS DO NOT SURVIVE A NEW EDIT ────────────────
           * The edit has just been rebuilt from scratch, so every zoom id a
           * previous audit or review named is gone. applySuggestion() refuses a
           * dead id politely enough, but offering a creator three buttons that
           * all answer "that zoom isn't in the edit any more" is worse than
           * offering none. The check re-runs immediately below.
           */
          "analysis.suggestions": [],
          "analysis.resolved": [],
          "analysis.findings": null,
          "analysis.audited_at": null,
          "analysis.audited_rev": -1,
          "analysis.usd": result.spend.usd,
          "analysis.calls": result.spend.calls,
          "analysis.finished_at": new Date(),
          title: demo.title || defaultTitle(result),
          expires_at: bumpExpiry(),
          updated_at: new Date(),
        },
        $inc: { rev: 1 },
      }
    );

    console.log(
      `[studio] analysed ${demo._id}: ${result.frames_read} frames (${result.frames_failed} missed), ` +
        `clock ${result.sync?.confident ? `${result.sync.offset >= 0 ? "+" : ""}${result.sync.offset}s` : "unchecked"}` +
        `${result.sync?.parked ? " (opening filled)" : ""}, ` +
        `${result.timeline.steps.length} steps, ${result.timeline.zooms.length} zooms, ` +
        `${result.timeline.blurs.length} blurs, ${result.timeline.cues.length} cues, $${result.spend.usd.toFixed(4)}`
    );

    publishProgress(demo, { status: "ready", stage: "", progress: 1, analysed: true });

    /**
     * ── THE CHECK IS ITS OWN JOB, AND IT RUNS EVERY TIME NOW ─────────────────
     * Separate so the editor opens the moment the edit exists rather than
     * waiting on more model calls for advice.
     *
     * It used to be enqueued only when the model pass had run, because the only
     * thing in it was the quality reviewer and the reviewer needs a step list to
     * say anything beyond generalities. The job does two things now, and the
     * other one — checking the clicks against the recording — needs no steps, no
     * frame grid and no vision pass. It needs the change list, which the
     * analysis above always produces. See the review handler.
     *
     * So it runs on every analysis. On a demo whose screens nobody has read,
     * that is the audit alone: the presses whose verdict was a close call, and
     * the moments on screen that nothing in the edit accounts for.
     */
    await enqueue({ demo: demo._id, user: demo.user, type: "review" }).catch(() => {});
  },

  async fail(job, err) {
    const demo = await StudioDemo.findById(job.demo);
    if (!demo) return;
    const message = err.userMessage || "We couldn't analyse this recording. Your credits are back.";
    await setDemo(demo._id, {
      // Still ready: the recording is fine and the editor opens on it. What
      // failed is the automatic edit, and saying "failed" would suggest the
      // footage is gone.
      status: demo.timeline ? "ready" : "failed",
      stage: "", progress: 0, error: message,
      "analysis.status": "failed", "analysis.error": message,
    });
    await refundCharge(demo, demo.analysis?.charged, "analysis");
    publishProgress(demo, { status: demo.timeline ? "ready" : "failed", error: message });
  },
};

function defaultTitle(result) {
  if (result.product) return `${result.product} demo`;
  if (result.summary) return result.summary.replace(/\.$/, "").slice(0, 70);
  return "Untitled recording";
}

/* ────────────────────────────────────────────────────────────────────────────
   vision: read the screen — blur, steps, narration
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * What the model has to look at the recording to know, run when it is asked for.
 *
 * ── WHY IT IS NOT PART OF THE FIRST ANALYSIS ANY MORE ────────────────────────
 * It used to be, because the camera could not tell a button from a blank half
 * of a page without it. That is no longer true — the operating system's own
 * pointer says which is which, in every frame, for nothing — so the model pass
 * became a reading of the CONTENT and nothing else, and content is exactly the
 * kind of thing a creator should be able to decline.
 *
 * ── WHAT IT WRITES, AND WHAT IT LEAVES ALONE ─────────────────────────────────
 * Writes: blurs, steps, narration, and the summary the demo is titled from.
 * Leaves: every cut, zoom, event and pointer sample exactly where they are. By
 * the time this runs the creator has had the editor open and may have moved
 * things; a pass they started to find private information does not get to
 * rearrange their edit. Like the captions job, the demo is READ AGAIN after
 * the model answers, so a minute of their editing is not rolled back by a
 * write that predates it.
 */
const vision = {
  async run(job, workDir) {
    const demo = await StudioDemo.findById(job.demo);
    if (!demo || demo.purged) return;
    if (!demo.timeline) throw userError("Analyse this recording first.");
    const r = demo.recording;
    if (!r?.mp4_key) throw userError("This recording isn't ready yet.");

    const report = reporter((fields) => {
      publishProgress(demo, fields);
      return setDemo(demo._id, fields);
    });

    await setDemo(demo._id, { stage: "Starting", progress: 0.01, "analysis.status": "running", "analysis.error": "" });
    publishProgress(demo, { stage: "Starting", progress: 0.01, reading: true });

    const video = await materialize(r.mp4_key, workDir, "recording.mp4");
    const result = await visionPass({
      video,
      workDir,
      duration: r.duration,
      events: demo.timeline.events || [],
      onProgress: (p, stage) => report({ stage, progress: Math.max(0.01, Math.min(0.99, p)) }),
    });

    const fresh = await StudioDemo.findById(job.demo);
    if (!fresh || fresh.purged) return;
    /**
     * ── THE EVENTS ARE ANNOTATED, NOT REPLACED ───────────────────────────────
     * visionPass() returns the same events with the control each press landed
     * on written onto it: the label, the type and, the part the camera wants,
     * the box. Only those fields — `zoomable` and the timing are untouched, so
     * nothing about the edit the creator has open changes. The boxes are what
     * let the audit offer "aim this zoom at the thing that was pressed".
     *
     * Merged by id against the FRESH events rather than written wholesale,
     * because the creator may have added or deleted a press in the minutes this
     * pass was running, and the answer to that is to leave theirs alone.
     */
    const byId = new Map((result.events || []).map((e) => [e.id, e]));
    const events = (fresh.timeline?.events || []).map((e) => {
      const seen = byId.get(e.id);
      return seen ? { ...e, target: seen.target, control: seen.control, on_control: seen.on_control } : e;
    });

    const timeline = sanitizeTimeline(
      {
        ...fresh.timeline,
        events,
        blurs: result.blurs,
        steps: result.steps,
        narration: result.narration,
      },
      { duration: fresh.recording?.duration || 0, source: fresh.timeline?.source }
    );

    await StudioDemo.updateOne(
      { _id: demo._id },
      {
        $set: {
          timeline,
          stage: "", progress: 1,
          "analysis.status": "done",
          "analysis.summary": result.summary,
          "analysis.product": result.product,
          "analysis.frames_read": result.frames_read,
          "analysis.blur_checked": !!result.blur_checked,
          "analysis.frames_failed": result.frames_failed,
          "analysis.elements": result.elements || null,
          "analysis.finished_at": new Date(),
          title: demo.title && demo.title !== "Untitled recording" ? demo.title : defaultTitle(result),
          expires_at: bumpExpiry(),
          updated_at: new Date(),
        },
        $inc: { rev: 1, "analysis.usd": result.spend.usd, "analysis.calls": result.spend.calls },
      }
    );

    console.log(
      `[studio] read ${demo._id}: ${result.frames_read} frames (${result.frames_failed} missed), ` +
        `${result.steps.length} steps, ${result.blurs.length} blurs, $${result.spend.usd.toFixed(4)}`
    );
    publishProgress(demo, { stage: "", progress: 1, reading: true, read: true, blurs: result.blurs.length, steps: result.steps.length });

    await enqueue({ demo: demo._id, user: demo.user, type: "review" }).catch(() => {});
  },

  async fail(job, err) {
    const demo = await StudioDemo.findById(job.demo);
    if (!demo) return;
    await setDemo(demo._id, { stage: "", progress: 1, "analysis.status": "done" });
    await refundCharge(demo, demo.analysis?.read_charged, "the reading");
    publishProgress(demo, {
      stage: "", progress: 1, reading: false,
      // Not the demo's `error`: the edit is untouched and perfectly usable.
      notice: err.userMessage || "We couldn't read this recording's screens. Your credits are back.",
    });
  },
};

/* ────────────────────────────────────────────────────────────────────────────
   captions: transcribe the audio, and nothing else
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Captions, added to a demo that was analysed without them.
 *
 * ── WHY THIS IS NOT "ANALYSE AGAIN" ──────────────────────────────────────────
 * Everything else in the edit came from reading hundreds of frames, and none of
 * it changes because somebody now wants subtitles. Re-running the pipeline
 * would cost the full analysis price, take minutes, and — worse — replace the
 * timeline the creator has been editing for the last ten. This reads the audio
 * and writes into `cues`, leaving every cut, zoom, blur and annotation exactly
 * where the creator put it.
 */
const captions = {
  async run(job, workDir) {
    const demo = await StudioDemo.findById(job.demo);
    if (!demo || demo.purged) return;
    if (!demo.timeline) throw userError("Analyse this recording before adding captions.");
    if (!demo.recording?.audio_key) {
      throw userError("This recording has no sound, so there's nothing to caption. You can still add captions by hand.");
    }

    await setDemo(demo._id, { stage: "Listening", progress: 0.1 });
    publishProgress(demo, { stage: "Listening", progress: 0.1, captioning: true });

    const audio = await materialize(demo.recording.audio_key, workDir, "speech.mp3");
    const result = await generateCaptions({ audio, duration: demo.recording.duration });

    if (!result.cues.length) {
      await setDemo(demo._id, { stage: "", progress: 1 });
      publishProgress(demo, { stage: "", progress: 1, captioning: false, captions: 0 });
      throw userError("We couldn't hear any speech in this recording. You can add captions by hand instead.");
    }

    // Read again rather than reusing the copy from the top of this handler: the
    // creator has had the editor open for the minute this took, and their cuts
    // and zooms must not be rolled back by a write that predates them.
    const fresh = await StudioDemo.findById(job.demo);
    const timeline = sanitizeTimeline(
      {
        ...fresh.timeline,
        cues: result.cues,
        captions: { ...(fresh.timeline.captions || {}), enabled: true, lang: result.language || "" },
      },
      { duration: fresh.recording?.duration || 0, source: fresh.timeline?.source }
    );

    await StudioDemo.updateOne(
      { _id: demo._id },
      {
        $set: {
          timeline,
          stage: "", progress: 1,
          "analysis.language": result.language,
          "analysis.language_label": result.language_label,
          expires_at: bumpExpiry(),
          updated_at: new Date(),
        },
        $inc: { rev: 1, "analysis.usd": result.spend.usd, "analysis.calls": result.spend.calls },
      }
    );

    console.log(`[studio] captioned ${demo._id}: ${result.cues.length} cues (${result.language_label || "unknown"})`);
    publishProgress(demo, { stage: "", progress: 1, captioning: false, captions: result.cues.length });
  },

  async fail(job, err) {
    const demo = await StudioDemo.findById(job.demo);
    if (!demo) return;
    await setDemo(demo._id, { stage: "", progress: 0 });
    publishProgress(demo, {
      captioning: false,
      // Not the demo's `error`: the edit is untouched and perfectly usable.
      // This is one action failing, and it is reported as one.
      notice: err.userMessage || "We couldn't write captions for this recording.",
    });
  },
};

/* ────────────────────────────────────────────────────────────────────────────
   review: the edit, checked against the recording and then read back
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * ── TWO CHECKS, ONE JOB, AND THEY ASK DIFFERENT QUESTIONS ────────────────────
 * The audit (services/studio/audit.js) checks the edit against the RECORDING:
 * it cuts two frames at each moment the pixel pipeline was unsure about or did
 * not account for at all, and asks what actually happened there. That is where
 * a missed click and a camera move nobody proposed come from.
 *
 * The reviewer (vision.js reviewEdit) checks the edit against ITSELF: it reads
 * the timeline as a piece of editing and says what a video editor would. It
 * sees no frames and cannot know what was missed.
 *
 * They run together because they arrive in the same list beside the creator's
 * edit and a creator should not have to learn which advice came from where.
 * The audit runs first: it costs frames and can fail on a recording whose file
 * has expired, and a failed audit must still leave the reviewer's advice.
 */
const review = {
  async run(job, workDir) {
    const demo = await StudioDemo.findById(job.demo);
    if (!demo || demo.purged || !demo.timeline) return;

    const spend = newSpend();
    const duration = demo.recording?.duration || demo.timeline.duration || 0;

    /* ── Checked against the recording ───────────────────────────────────── */
    let audit = { findings: [], suggestions: [], patches: [], events: null, checked: 0 };
    const changes = Array.isArray(demo.analysis?.changes) ? demo.analysis.changes : [];
    const rests = Array.isArray(demo.analysis?.rests) ? demo.analysis.rests : [];

    /**
     * ── AN UNCHANGED EDIT ASKS THE SAME QUESTIONS ────────────────────────────
     * "Check again" costs about fifty frames, and on an edit nobody has touched
     * it cuts the same frames at the same moments and gets the same answers.
     * The reviewer below still re-runs — it is one text call and a creator
     * pressing the button wants a second opinion on the prose — but the frames
     * are not paid for twice. Any edit at all bumps `rev`, so this only ever
     * skips work that would have changed nothing.
     */
    const stale = (demo.analysis?.audited_rev ?? -1) !== (demo.rev || 0);
    if (!stale) {
      audit = {
        findings: demo.analysis?.findings || [],
        suggestions: (demo.analysis?.suggestions || []).filter((s) => s.source === "audit"),
        patches: [],
        events: null,
        checked: 0,
      };
      console.log("[studio] " + demo._id + " unchanged since its last check; keeping " + audit.findings.length + " finding(s)");
    } else if (demo.recording?.mp4_key && (changes.length || rests.length)) {
      publishProgress(demo, { auditing: true });
      try {
        const video = await materialize(demo.recording.mp4_key, workDir, "recording.mp4");
        const res = await auditPass({
          video,
          workDir,
          duration,
          timeline: demo.timeline,
          changes,
          rests,
        });
        audit = res;
        spend.usd += res.spend.usd;
        spend.calls += res.spend.calls;
      } catch (err) {
        // The recording may have expired, or ffmpeg may have refused a frame.
        // Neither is a reason to lose the reviewer's advice as well.
        console.error("[studio] audit failed:", err);
      }
    } else if (!changes.length) {
      console.log("[studio] no change list on " + demo._id + "; re-analyse to cross-check the clicks");
    }

    /* ── A second witness to the clicks ──────────────────────────────────── */
    /**
     * A model watches the whole recording and lists the clicks it sees; any the
     * camera did not zoom on, where the creator's own pointer was resting, are
     * offered as "possible missed click". It never changes the edit itself.
     * See witness.js. Carried over, like the audit, when the edit has not
     * changed since it last looked.
     */
    let witness = { suggestions: [], summary: demo.analysis?.witness || null };
    if (!stale) {
      witness.suggestions = (demo.analysis?.suggestions || []).filter((s) => s.source === "witness");
    } else if (WITNESS_MODE !== "off" && demo.recording?.mp4_key) {
      publishProgress(demo, { auditing: true });
      try {
        const video = await materialize(demo.recording.mp4_key, workDir, "recording.mp4");
        witness = await witnessPass({ video, workDir, timeline: demo.timeline, duration });
        spend.usd += witness.usd || 0;
        spend.calls += 1;
      } catch (err) {
        console.error("[studio] witness failed:", err);
      }
    }

    /* ── Read back as a piece of editing ─────────────────────────────────── */
    /**
     * ── AND ONLY WHEN THERE IS SOMETHING TO READ ─────────────────────────────
     * The reviewer is handed the steps, the cuts, the zooms and the blurs, and
     * it is the steps that let it say anything specific: without them it is
     * looking at a list of timestamps with no idea what the demo is about, and
     * what comes back is advice about pacing in general. With the model pass off
     * there are no steps, so this would be a paid call for generalities — and
     * the audit above has already done the part that does not need them.
     */
    let verdict = demo.analysis?.verdict || "";
    let suggestions = [];
    if ((demo.timeline.steps || []).length) {
      ({ verdict, suggestions } = await reviewEdit({
        timeline: demo.timeline,
        steps: demo.timeline.steps,
        duration,
        spend,
      }));
    }

    /**
     * ── THE DEMO IS READ AGAIN BEFORE ANYTHING IS WRITTEN ────────────────────
     * Same reason as the vision and caption jobs: by now the creator may have
     * had the editor open for a minute, and a write built on the timeline this
     * job started from would roll that back. Only the evidence fields go onto
     * the events, and only for events that still exist.
     */
    const fresh = await StudioDemo.findById(job.demo);
    if (!fresh || fresh.purged) return;

    const offers = [...audit.suggestions, ...(witness.suggestions || []), ...suggestions].slice(0, 24);

    /**
     * ── A SUGGESTION ALREADY TURNED DOWN STAYS TURNED DOWN ───────────────────
     * `resolved` used to be cleared on every review, which was harmless while
     * every suggestion in the list was newly minted with a new id. It is not
     * harmless now: the audit's findings are carried over unchanged when the
     * edit has not moved, so clearing this would push a creator's own "Ignore"
     * back at them every time they pressed Check again.
     */
    const keptIds = new Set(offers.map((s) => s.id));
    const resolved = (fresh.analysis?.resolved || []).filter((id) => keptIds.has(id));

    const set = {
      "analysis.verdict": verdict,
      /**
       * The audit's offers first. They are findings about the recording, and a
       * missed click matters more than a note about pacing.
       */
      "analysis.suggestions": offers,
      "analysis.resolved": resolved,
      "analysis.findings": audit.findings,
      "analysis.witness": witness.summary || null,
      "analysis.audited_at": new Date(),
      updated_at: new Date(),
    };

    /**
     * ── THE CAMERA MOVES FOR A PRESS THE MODEL SAW, WITHOUT BEING ASKED ──────
     * suggestions.js says nothing is applied automatically, and that rule is
     * about the QUALITY REVIEWER: it reads a timeline the same models produced
     * and offers opinions about it, so a reviewer that applies its own advice
     * has stopped being a reviewer.
     *
     * The audit is not that. It reads the RECORDING — the same pixels the
     * pixel pipeline read, through an instrument that does not share its blind
     * spots — and answers a question of fact: was the thing at this position
     * activated. When it says yes with confidence and the camera did not move,
     * the demo has a hole in it that the creator can see, and leaving that
     * behind a button means the default output is the wrong one.
     *
     *   "a user should never miss a click so on every click the zoom in must
     *    happen"
     *
     * So a confident missed press becomes a zoom here. Only that: a `wrong_zoom`
     * still only ever offers to REMOVE something, because taking a camera move
     * away from a creator who wanted it is the mistake that cannot be undone by
     * watching the result, and a `reframe` is a matter of taste. Everything the
     * audit applied is still in `findings` and still listed as a suggestion, so
     * what happened is visible and reversible in the editor.
     */
    let timeline = fresh.timeline;
    const applied = [];
    // Only the findings sure enough to act on unasked. See AUDIT.apply.
    const ready = (audit.suggestions || []).filter((s) => s.change?.op === "add_zoom" && s.auto);

    /**
     * ── A SAFETY NET THAT SILENTLY DOES NOTHING IS NOT A SAFETY NET ──────────
     * Every branch that skips this used to skip it without a word, and one of
     * them was being taken in production: six analysed recordings, between four
     * and ten confident zooms offered on each, `resolved` empty on every one.
     * On a recording of a landing page the arbiter had correctly recovered the
     * press on "Pricing" with confidence 1.00 and named the zoom for it, and
     * the exported video had no camera move anywhere in it.
     *
     * Nothing in the log said so. The audit reported its findings, the review
     * reported its suggestions, and the line in between — the one that turns a
     * finding into a camera move — was never reached.
     *
     * So the skip is now as loud as the work. This is the difference between
     * "the arbiter found nothing" and "the arbiter found it and was not
     * allowed to act", which are the same silence and opposite problems.
     */
    if (ready.length && !(timeline && AUTO_APPLY_PRESSES)) {
      console.warn(
        "[studio] " + ready.length + " zoom(s) for presses the camera missed were NOT applied: " +
          (!timeline ? "this demo has no timeline to apply them to" : "STUDIO_AUTO_PRESS_ZOOMS is off") +
          ". They are offered as suggestions instead."
      );
    }

    if (timeline && AUTO_APPLY_PRESSES) {
      for (const s of ready) {
        const res = applySuggestion(timeline, s, { duration: fresh.recording?.duration || duration });
        if (res.applied) {
          timeline = res.timeline;
          applied.push(s.id);
        } else {
          console.log("[studio] audit zoom at " + (s.change.start || 0).toFixed(1) + "s not applied: " + res.why);
        }
      }
      if (applied.length) {
        console.log("[studio] " + applied.length + " zoom(s) added for presses the camera had missed");
      } else if (ready.length) {
        console.warn("[studio] none of the " + ready.length + " zoom(s) for missed presses could be applied");
      }
    }

    const patched = (audit.patches?.length || applied.length) && timeline;
    if (patched) {
      set.timeline = sanitizeTimeline(
        { ...timeline, events: applyPatches(timeline.events || [], audit.patches) },
        { duration: fresh.recording?.duration || 0, source: fresh.timeline?.source }
      );
    }
    // A suggestion the audit already carried out is not an offer any more.
    if (applied.length) set["analysis.resolved"] = [...resolved, ...applied];
    // The rev this audit's findings describe — AFTER this write's own bump, or
    // they would be stale the moment they were stored.
    set["analysis.audited_rev"] = (fresh.rev || 0) + (patched ? 1 : 0);

    await StudioDemo.updateOne(
      { _id: demo._id },
      { $set: set, $inc: { "analysis.usd": spend.usd, "analysis.calls": spend.calls, ...(patched ? { rev: 1 } : {}) } }
    );

    console.log(
      `[studio] reviewed ${demo._id}: ${audit.checked} moment(s) checked, ` +
        `${audit.findings.length} finding(s), ${set["analysis.suggestions"].length} suggestion(s), $${spend.usd.toFixed(4)}`
    );
    publishProgress(demo, { reviewed: true, auditing: false, findings: audit.findings.length });
  },

  // A review that fails costs the creator nothing and takes nothing away: the
  // edit is untouched and simply has no suggestions beside it.
  async fail(job) {
    const demo = await StudioDemo.findById(job.demo);
    if (demo) publishProgress(demo, { reviewed: true, auditing: false });
  },
};

/* ────────────────────────────────────────────────────────────────────────────
   render: one export
   ──────────────────────────────────────────────────────────────────────────── */

const render = {
  async run(job, workDir) {
    const demo = await StudioDemo.findById(job.demo);
    if (!demo || demo.purged) return;
    const entry = (demo.renders || []).find((x) => x.id === job.ref);
    if (!entry || entry.status === "done") return;
    if (!demo.timeline) throw userError("This demo has no edit to export yet.");
    if (!demo.recording?.mp4_key) throw userError("This recording isn't ready to export.");

    const report = reporter((fields) => {
      publishProgress(demo, { render: job.ref, ...fields });
      return setRender(demo._id, job.ref, fields);
    });

    await setRender(demo._id, job.ref, { status: "rendering", stage: "Starting", progress: 0.01, error: "", worker: WORKER });
    publishProgress(demo, { render: job.ref, status: "rendering", progress: 0.01 });

    const source = await materialize(demo.recording.mp4_key, workDir, "recording.mp4");
    const options = cleanExportOptions(entry.options);
    const out = path.join(workDir, `export.${options.format}`);

    const result = await renderTimeline({
      timeline: demo.timeline,
      source,
      workDir,
      dest: out,
      options,
      onProgress: (p, stage) => report({ stage, progress: Math.max(0.01, Math.min(0.99, p)) }),
    });

    await report({ stage: "Uploading", progress: 0.99 }, true);
    const ext = options.format;
    const outKey = demoKey(demo, "renders", `${job.ref}.${ext}`);
    const mime = ext === "gif" ? "image/gif" : ext === "webm" ? "video/webm" : "video/mp4";
    await putFile(out, outKey, mime);

    let srtKey = "";
    if (result.srt) {
      const srtPath = path.join(workDir, "captions.srt");
      await fsp.writeFile(srtPath, result.srt, "utf8");
      srtKey = demoKey(demo, "renders", `${job.ref}.srt`);
      await putFile(srtPath, srtKey, "text/plain; charset=utf-8");
    }

    const stat = await statObject(outKey).catch(() => null);

    await setRender(demo._id, job.ref, {
      status: "done",
      stage: "",
      progress: 1,
      output_key: outKey,
      srt_key: srtKey,
      size: stat?.size || 0,
      duration: result.duration,
      width: result.width,
      height: result.height,
      drew: result.drew,
      engine: RENDER_ENGINE,
      finished_at: new Date(),
    });
    await setDemo(demo._id, { expires_at: bumpExpiry() });

    console.log(`[studio] rendered ${demo._id}/${job.ref}: ${result.width}x${result.height} ${result.duration.toFixed(1)}s ${JSON.stringify(result.drew)}`);
    publishProgress(demo, { render: job.ref, status: "done", progress: 1 });
  },

  async fail(job, err) {
    const demo = await StudioDemo.findById(job.demo);
    if (!demo) return;
    const entry = (demo.renders || []).find((x) => x.id === job.ref);
    const message = err.userMessage || "That export failed. Your credits are back.";
    await setRender(demo._id, job.ref, { status: "failed", stage: "", error: message });
    await refundCharge(demo, entry?.charged, `export ${job.ref}`);
    publishProgress(demo, { render: job.ref, status: "failed", error: message });
  },
};

/**
 * Credits back, once.
 *
 * `charged` is zeroed in the same breath so a job that fails twice — which it
 * can, between an attempt and a lease expiring — refunds once and not twice.
 */
async function refundCharge(demo, charged, note) {
  if (!(charged > 0)) return;
  await refund(demo.user, charged, { refType: "StudioDemo", refId: demo._id, note }).catch((err) =>
    console.error(`[studio] refund failed for ${demo._id}:`, err.message)
  );
}

const HANDLERS = { prepare, analyse, vision, captions, render, review };

/* ────────────────────────────────────────────────────────────────────────────
   Retention
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Delete the files of demos nobody has touched in STUDIO_RETENTION_DAYS.
 *
 * The row stays, with `purged: true`, so the library can say what happened
 * rather than showing a demo that fails to open. The timeline is dropped with
 * the footage: it describes a recording that no longer exists, and it is the
 * biggest thing in the document.
 */
export async function sweepExpired() {
  const due = await StudioDemo.find({ purged: false, expires_at: { $lt: new Date() } })
    .select("_id user expires_at")
    .limit(50)
    .lean();

  for (const d of due) {
    try {
      await removePrefix(demoPrefix(d));
      await StudioDemo.updateOne(
        { _id: d._id },
        {
          $set: {
            purged: true, timeline: null,
            "recording.key": "", "recording.mp4_key": "", "recording.proxy_key": "",
            "recording.audio_key": "", "recording.thumb_key": "",
            "capture.track": null, "capture.motion": null,
            updated_at: new Date(),
          },
        }
      );
      console.log(`[studio] purged ${d._id}`);
    } catch (err) {
      console.error(`[studio] purge ${d._id} failed:`, err.message);
    }
  }
}

export function startStudioRunner() {
  if (String(process.env.STUDIO_RUNNER_DISABLED || "").toLowerCase() === "true" || timer) return;
  timer = setInterval(() => tick().catch((err) => console.error("[studio] tick:", err.message)), TICK_MS);
  setInterval(() => sweepExpired().catch((err) => console.error("[studio] sweep:", err.message)), 30 * 60 * 1000);
  setTimeout(() => sweepExpired().catch(() => {}), 90 * 1000);
  tick().catch(() => {});
  console.log(
    `[studio] runner ${WORKER} started, engine ${RENDER_ENGINE} ` +
      `(prepare ${LIMIT.prepare}, analyse ${LIMIT.analyse}, captions ${LIMIT.captions}, render ${LIMIT.render}, review ${LIMIT.review})`
  );
  // Said at start-up rather than discovered by a creator whose export failed.
  missingFonts().then((missing) => {
    if (missing.length) {
      console.error(`[studio] caption fonts missing in ${FONTS_DIR}: ${missing.join(", ")}. Exports with captions will fail until they are there.`);
    }
  });
}

export default { enqueue, startStudioRunner, sweepExpired };

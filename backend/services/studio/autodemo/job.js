/**
 * autodemo/job.js: the auto product demo, as a job of its own.
 *
 * The creator records, describes what the demo should show, and gets back a
 * demo with a script written for that description, captions from the script,
 * a presenter's voice reading it, and the camera easing in on what the script
 * talks about where nothing was clicked — on top of the automatic edit.
 *
 * ── IT RUNS AFTER THE ANALYSIS, NEVER INSIDE IT ──────────────────────────────
 * The clicks and their zooms are the analysis's (events.js, analyse.js),
 * measured against labelled recordings, and nothing here may move them. So
 * this job waits for the analysis to finish exactly as it always does, READS
 * its events and zooms, and writes only what is its own: the narration, the
 * captions, the voice, and focus zooms ADDED beside the click zooms (never
 * overlapping one, tracked by id in `live_focus`). A bug in here can spoil a
 * script or a focus zoom; it cannot touch a click or a click's zoom.
 *
 * ── WAITING WITHOUT HOLDING A SLOT FOR MINUTES ───────────────────────────────
 * The request usually arrives before the recording is even prepared. The job
 * checks for up to WAIT_SLICE_MS and then queues a fresh copy of itself a few
 * seconds out, so a long analysis costs a handful of short job rows rather
 * than a worker slot held for its whole length.
 *
 * ── IT NEVER OVERWRITES THE CREATOR ──────────────────────────────────────────
 * The write is made on the freshest copy of the timeline and only where the
 * demo's `rev` is still the one read, so an edit saved meanwhile is never
 * rolled back: the job reads again and re-applies its own fields. What it
 * replaced is kept in `autodemo.before`, and Undo puts it back.
 *
 * ── demo.autodemo ────────────────────────────────────────────────────────────
 *   { seq, brief, voice, status: waiting|running|done|failed|undone, stage,
 *     progress, error, requested_at, started_at, finished_at, product,
 *     summary, steps, lines, cues, voice_ok, voice_error, seen, usd, focus,
 *     skipped, live_focus, shortened, lengthened, before }
 * `seq` names the request: a newer request replaces an older one, and a job
 * whose seq is no longer the demo's stops without writing.
 */
import StudioDemo from "../../../models/StudioDemo.js";
import StudioJob from "../../../models/StudioJob.js";
import { materialize, putFile } from "../../media/storage.js";
import { providerReady } from "../../ai/provider.js";
import { retryDb } from "../../../db.js";
import { generateCaptions } from "../analyse.js";
import { cuesFromNarration } from "../captionsFromScript.js";
import { sanitizeTimeline } from "../timeline.js";
import { demoKey, bumpExpiry, publishProgress } from "../demoService.js";
import { voiceById, voiceSig, DEFAULT_VOICE } from "../../../../src/components/Studio/voices.mjs";
import { zoomOutGap } from "../../../../src/components/Studio/camera.mjs";
import { direct, refit } from "./director.js";
import { buildNarration } from "./narrator.js";

/** How long one job waits for the analysis before handing over to the next. */
const WAIT_SLICE_MS = 45_000;
const POLL_MS = 3_000;
/** Longer than any analysis; past it the request is given up. */
const MAX_WAIT_MS = 45 * 60_000;
/**
 * Nothing running and no analysis: the automatic edit was never started (the
 * editor starts it for a requested demo once the recording is prepared, so
 * this is a creator who left before that). Given up after this long.
 */
const IDLE_GIVE_UP_MS = 20 * 60_000;
/** Tries at the guarded write before giving up on a demo being edited throughout. */
const WRITE_TRIES = 8;

export const BRIEF_MAX = 1500;
export const BRIEF_MIN = 8;

const userError = (msg) => Object.assign(new Error(msg), { userMessage: msg });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Write fields of the request `seq`, and only while it is still the demo's request. */
function setAuto(demoId, seq, fields) {
  const $set = { updated_at: new Date() };
  for (const [k, v] of Object.entries(fields)) $set[`autodemo.${k}`] = v;
  return StudioDemo.updateOne({ _id: demoId, "autodemo.seq": seq }, { $set }).catch(() => null);
}

/** Progress, written at most every 1.2s. The editor polls for it; nothing is pushed. */
function reporter(demoId, seq) {
  let last = 0;
  return (progress, stage, force = false) => {
    const now = Date.now();
    if (!force && now - last < 1200) return;
    last = now;
    setAuto(demoId, seq, { progress: Math.round(Math.max(0, Math.min(1, progress)) * 100) / 100, ...(stage ? { stage } : {}) });
  };
}

/**
 * Where the automatic edit is: "ready" (finished, with an edit), "pending"
 * (preparing, queued or running), "failed", "idle" (nothing is happening and
 * nothing finished) or "gone".
 */
async function analysisState(demoId) {
  const d = await StudioDemo.findById(demoId).select("status purged recording.status analysis.status timeline.duration").lean();
  if (!d || d.purged) return "gone";
  // A queued analysis comes first: a demo being analysed AGAIN still has its
  // old edit, and a script written on that would be overwritten in a minute.
  const busy = await StudioJob.exists({ demo: demoId, type: { $in: ["prepare", "analyse"] }, status: { $in: ["queued", "running"] } });
  if (busy || ["uploading", "preparing", "analysing"].includes(d.status) || d.recording?.status === "processing" || d.analysis?.status === "running") {
    return "pending";
  }
  if (d.analysis?.status === "done" && d.timeline) return "ready";
  if (d.analysis?.status === "failed" || d.status === "failed") return "failed";
  return "idle";
}

/** The four timeline fields this feature owns. */
const OWN = ["narration", "cues", "captions", "voice"];

/**
 * `tl` with only this feature's fields replaced.
 *
 * The new values go through sanitizeTimeline like every other write, but only
 * THEY are taken from its answer: every other field — events, zooms, cuts,
 * the pointer — is the stored object exactly as it was, not a re-sanitized
 * copy of it, so not even an empty field of a click changes shape.
 */
function withOnly(tl, fields, duration) {
  const checked = sanitizeTimeline({ ...tl, ...fields }, { duration, source: tl.source });
  const next = { ...tl };
  for (const k of OWN) next[k] = checked[k];
  return next;
}

/**
 * The zooms with this feature's focus zooms swapped: `remove` (ids it placed
 * before) taken out, `add` put in. Every other zoom — every click's — is the
 * stored object exactly as it was; only the new ones are sanitized.
 */
function withFocus(tl, { remove = [], add = [] }, duration) {
  const gone = new Set(remove);
  const kept = (tl.zooms || []).filter((z) => !gone.has(z.id));
  const added = add.length ? sanitizeTimeline({ ...tl, zooms: add }, { duration, source: tl.source }).zooms : [];
  return [...kept, ...added].sort((a, b) => a.start - b.start);
}

/* ── The request ───────────────────────────────────────────────────────────── */

export const cleanBrief = (v) => String(v || "").replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim().slice(0, BRIEF_MAX);

/**
 * Ask for an auto demo on `demo`. Replaces any request still in progress.
 * The analysis is not started here: that is the creator's paid action, made
 * through the same route as ever (the editor makes it for them once the
 * recording is prepared).
 */
export async function requestAutodemo(demo, { brief, voice, user }) {
  const prev = demo.autodemo || null;
  const ad = {
    seq: Date.now(),
    brief: cleanBrief(brief),
    voice: voiceById(voice)?.id || DEFAULT_VOICE,
    status: "waiting",
    stage: "Waiting for the automatic edit",
    progress: 0,
    error: "",
    requested_at: new Date(),
    started_at: null,
    finished_at: null,
    product: "",
    summary: "",
    steps: [],
    lines: 0,
    cues: 0,
    voice_ok: null,
    voice_error: "",
    seen: "",
    usd: 0,
    focus: [],
    skipped: [],
    // The ids of the focus zooms this feature has in the timeline right now,
    // whatever became of the request that placed them: the next run replaces
    // them, Undo removes them.
    live_focus: Array.isArray(prev?.live_focus) ? prev.live_focus : [],
    // What a finished earlier run replaced stays undoable until this one
    // replaces it in turn.
    before: prev?.status === "done" ? prev.before || null : null,
  };
  await StudioDemo.updateOne({ _id: demo._id }, { $set: { autodemo: ad, updated_at: new Date() } });
  await StudioJob.deleteMany({ demo: demo._id, type: "autodemo", status: "queued" });
  await StudioJob.create({ demo: demo._id, user, type: "autodemo", data: { seq: ad.seq } });
  publishProgress(demo, { autodemo: { status: "waiting" } });
  return shapeAutodemo(ad);
}

/** What the editor is told. `before` stays on the server. */
export function shapeAutodemo(ad) {
  if (!ad) return null;
  return {
    status: ad.status,
    stage: ad.stage || "",
    progress: ad.progress || 0,
    error: ad.error || "",
    brief: ad.brief || "",
    voice: ad.voice || DEFAULT_VOICE,
    product: ad.product || "",
    summary: ad.summary || "",
    steps: ad.steps || [],
    lines: ad.lines || 0,
    cues: ad.cues || 0,
    voice_ok: ad.voice_ok ?? null,
    voice_error: ad.voice_error || "",
    // The zooms it placed where nothing was clicked: { start, end, label }.
    focus: (ad.focus || []).map((f) => ({ start: f.start, end: f.end, label: f.label })),
    requested_at: ad.requested_at || null,
    finished_at: ad.finished_at || null,
    can_undo: ad.status === "done" && !!ad.before,
  };
}

/**
 * Put back what the last finished run replaced: the captions, the script, the
 * captions switch, the voice switch, the voiceover, and its focus zooms taken
 * out (with any earlier run's put back). Click zooms, cuts and everything else
 * are left as they are now.
 */
export async function undoAutodemo(demoId) {
  for (let i = 0; i < WRITE_TRIES; i++) {
    const fresh = await StudioDemo.findById(demoId);
    const ad = fresh?.autodemo;
    if (!fresh || !fresh.timeline || !ad || ad.status !== "done" || !ad.before) {
      return { ok: false, message: "There's nothing to undo." };
    }
    const tl = fresh.timeline;
    const b = ad.before;
    const duration = fresh.recording?.duration || tl.duration || 0;
    const next = withOnly(tl, {
      cues: b.cues || [],
      narration: b.narration || [],
      captions: { ...(tl.captions || {}), enabled: !!b.captions_enabled },
      voice: b.voice || { on: false, keep_original: false },
    }, duration);
    // Put back as they were, not re-sanitized: they were stored objects before.
    const back = Array.isArray(b.focus_removed) ? b.focus_removed : [];
    const gone = new Set(ad.live_focus || []);
    next.zooms = [...(tl.zooms || []).filter((z) => !gone.has(z.id)), ...back].sort((a, b2) => a.start - b2.start);
    const update = {
      $set: {
        timeline: next,
        "autodemo.status": "undone",
        "autodemo.before": null,
        "autodemo.live_focus": Array.isArray(b.live_focus) ? b.live_focus : [],
        expires_at: bumpExpiry(),
        updated_at: new Date(),
      },
      $inc: { rev: 1 },
    };
    if (b.voiceover) update.$set.voiceover = b.voiceover;
    else update.$unset = { voiceover: "" };
    const res = await StudioDemo.updateOne({ _id: fresh._id, rev: fresh.rev, "autodemo.seq": ad.seq }, update);
    if (res.modifiedCount) {
      publishProgress(fresh, { autodemo: { status: "undone" } });
      return { ok: true };
    }
    await sleep(250);
  }
  return { ok: false, message: "The demo kept changing, so nothing was undone. Try again." };
}

/* ── The job ───────────────────────────────────────────────────────────────── */

export const autodemoJob = {
  async run(job, workDir) {
    const seq = job.data?.seq;
    let demo = await StudioDemo.findById(job.demo);
    if (!demo || demo.purged) return;
    const ad = demo.autodemo;
    // Replaced by a newer request, undone, or already finished: not this job's any more.
    if (!ad || ad.seq !== seq || !["waiting", "running"].includes(ad.status)) return;

    /* 1. The automatic edit, finished. */
    const requested = new Date(ad.requested_at || job.created_at).getTime();
    const sliceEnds = Date.now() + WAIT_SLICE_MS;
    let state;
    for (;;) {
      state = await analysisState(job.demo);
      if (state !== "pending" && state !== "idle") break;
      const waited = Date.now() - requested;
      if (waited > MAX_WAIT_MS) {
        throw userError("The automatic edit took too long, so the product demo wasn't made. Open the recording and generate it again.");
      }
      if (state === "idle" && waited > IDLE_GIVE_UP_MS) {
        throw userError("The automatic edit never started, so there was nothing to build the demo on. Open the recording and generate the demo again.");
      }
      if (Date.now() > sliceEnds) {
        await StudioJob.create({ demo: demo._id, user: demo.user, type: "autodemo", data: { seq }, not_before: new Date(Date.now() + POLL_MS) });
        return;
      }
      await sleep(POLL_MS);
    }
    if (state === "gone") return;
    if (state === "failed") {
      throw userError("The automatic edit didn't finish, so the product demo couldn't be built. Run Edit it automatically again, then generate the demo.");
    }
    if (!providerReady()) throw userError("The AI isn't set up on this server, so the demo couldn't be written.");

    /* 2. Started. */
    const report = reporter(demo._id, seq);
    await setAuto(demo._id, seq, { status: "running", stage: "Starting", progress: 0.03, started_at: new Date(), error: "" });
    publishProgress(demo, { autodemo: { status: "running" } });

    demo = await StudioDemo.findById(job.demo);
    if (!demo?.timeline || demo.autodemo?.seq !== seq) return;
    const r = demo.recording;
    const duration = Number(r?.duration || demo.timeline.duration || 0);
    if (!r?.mp4_key || !(duration > 0)) throw userError("This recording isn't ready, so the demo couldn't be built.");
    const usd = { total: 0 };

    const video = await materialize(r.mp4_key, workDir, "recording.mp4");

    /* 3. What the creator said, if they spoke. */
    let speech = [];
    if (r.audio_key && demo.capture?.mic) {
      report(0.06, "Listening to what you said", true);
      try {
        const audio = await materialize(r.audio_key, workDir, "speech.mp3");
        const heard = await generateCaptions({ audio, duration });
        speech = heard.cues || [];
        usd.total += Number(heard.spend?.usd || 0);
      } catch (err) {
        // Their words help; the demo can be written without them.
        console.warn(`[autodemo] ${demo._id}: could not transcribe the microphone (${err.message})`);
      }
    }

    /* 4. The script, and where the camera eases in. */
    // An earlier run's focus zooms are this feature's own and about to be
    // replaced: they neither block the new ones nor read as clicks.
    const earlierFocus = new Set(demo.autodemo.live_focus || []);
    const plan = await direct({
      video,
      workDir,
      duration,
      brief: demo.autodemo.brief,
      timeline: { ...demo.timeline, zooms: (demo.timeline.zooms || []).filter((z) => !earlierFocus.has(z.id)) },
      hint: { summary: demo.analysis?.summary, product: demo.analysis?.product },
      speech,
      changes: demo.analysis?.changes || [],
      onProgress: (p, stage) => report(0.1 + 0.45 * p, stage, true),
    });
    usd.total += plan.spend.usd;
    if (!plan.lines.length) {
      throw userError("We couldn't write a script for this recording. Try describing what it should show in a sentence or two, and generate it again.");
    }

    /*
     * 5. The voice, then the lines it did not fit, rewritten and spoken again.
     *    How fast a line is spoken varies more than its word count says, so
     *    the first take is measured: a line that left silence before the next
     *    is lengthened, one that had to be rushed is shortened, and only
     *    those are spoken again (the narrator keeps the other takes). A
     *    failure in the voice still leaves the script and its captions.
     */
    const voice = voiceById(demo.autodemo.voice)?.id || DEFAULT_VOICE;
    let lines = plan.lines;
    let made = null;
    let voiceError = "";
    let refitted = 0;
    const takes = new Map();
    report(0.6, "Recording the voice", true);
    try {
      made = await buildNarration({ lines, voice, duration, workDir, cache: takes, brisk: false, onProgress: (p) => report(0.6 + 0.2 * p, "Recording the voice") });
    } catch (err) {
      voiceError = err.userMessage || "The voice couldn't be made this time. The script and captions are in; add the voice from the Voice tab.";
      console.warn(`[autodemo] ${demo._id}: voice failed (${err.message})`);
    }
    for (const [round, minGap] of [[0, 1.0], [1, 1.5]]) {
      if (!made) break;
      try {
        const re = await refit(lines, made.takes, { rec: plan.rec, brief: demo.autodemo.brief, steps: plan.steps, duration, minGap });
        usd.total += re.spend.usd;
        if (!re.changed) break;
        report(0.82 + 0.05 * round, "Smoothing the voice", true);
        const again = await buildNarration({ lines: re.lines, voice, duration, workDir, cache: takes, onProgress: (p) => report(0.82 + 0.05 * round + 0.05 * p, "Smoothing the voice") });
        lines = re.lines;
        made = again;
        refitted += re.changed;
      } catch (err) {
        // The takes so far stand; they are a complete voiceover.
        console.warn(`[autodemo] ${demo._id}: fitting round ${round + 1} skipped (${err.message})`);
        break;
      }
    }

    // Validated the way the timeline will store them BEFORE the signature is
    // taken, so the voiceover matches the captions the editor holds (voices.mjs
    // voiceSig) and the Voice tab does not call it stale.
    const cues = sanitizeTimeline(
      { ...demo.timeline, cues: cuesFromNarration(lines, { duration }) },
      { duration, source: demo.timeline.source }
    ).cues;
    if (!cues.length) {
      throw userError("We couldn't write a script for this recording. Try describing what it should show in a sentence or two, and generate it again.");
    }
    let voiceover = null;
    if (made) {
      const vseq = Date.now();
      const sig = voiceSig(voice, cues);
      const key = demoKey(demo, "voice", `${sig}-${vseq}.mp3`);
      await putFile(made.file, key, "audio/mpeg");
      voiceover = { name: voice, sig, key, seq: vseq, seconds: made.seconds, sentences: made.sentences, made_at: new Date() };
    }

    /* 6. Written on the freshest timeline, only where nobody saved in between. */
    report(0.95, "Putting it together", true);
    let saved = false;
    for (let i = 0; i < WRITE_TRIES && !saved; i++) {
      const fresh = await StudioDemo.findById(job.demo);
      if (!fresh || fresh.purged || !fresh.timeline) return;
      if (fresh.autodemo?.seq !== seq) return;
      const tl = fresh.timeline;
      const live = Array.isArray(fresh.autodemo?.live_focus) ? fresh.autodemo.live_focus : [];
      const before = {
        cues: tl.cues || [],
        narration: tl.narration || [],
        captions_enabled: !!tl.captions?.enabled,
        voice: tl.voice || { on: false, keep_original: false },
        voiceover: fresh.voiceover || null,
        // The focus zooms this run replaces, exactly as stored, and their ids.
        focus_removed: (tl.zooms || []).filter((z) => live.includes(z.id)),
        live_focus: live,
      };
      // A zoom may have arrived since the plan was made (the creator's, or the
      // check's confirmed press): a focus zoom that would now crowd it is dropped.
      const others = (tl.zooms || []).filter((z) => !live.includes(z.id));
      const focus = plan.focus.filter((f) =>
        others.every((z) => z.end + zoomOutGap(z, f) <= f.start || z.start - zoomOutGap(f, z) >= f.end)
      );
      const next = withOnly(tl, {
        narration: lines,
        cues,
        captions: { ...(tl.captions || {}), enabled: true },
        // Without a new voice, any older one would read the OLD script over
        // these captions, so it is switched off until the Voice tab makes one.
        voice: { ...(tl.voice || { keep_original: false }), on: !!voiceover },
      }, duration);
      next.zooms = withFocus(tl, { remove: live, add: focus }, duration);
      const focusIds = new Set(focus.map((f) => f.id));
      const placed = next.zooms.filter((z) => focusIds.has(z.id));
      const $set = {
        timeline: next,
        "autodemo.status": "done",
        "autodemo.stage": "",
        "autodemo.progress": 1,
        "autodemo.finished_at": new Date(),
        "autodemo.product": plan.product,
        "autodemo.summary": plan.summary,
        "autodemo.steps": plan.steps,
        "autodemo.lines": lines.length,
        "autodemo.refitted": refitted,
        "autodemo.cues": cues.length,
        "autodemo.voice_ok": !!voiceover,
        "autodemo.voice_error": voiceError,
        "autodemo.seen": plan.seen,
        "autodemo.focus": placed.map((z) => ({ id: z.id, start: z.start, end: z.end, label: z.label, level: z.level })),
        "autodemo.skipped": [...plan.skipped, ...plan.focus.filter((f) => !focusIds.has(f.id)).map((f) => ({ what: f.label, why: "a zoom arrived there meanwhile" }))],
        "autodemo.live_focus": placed.map((z) => z.id),
        "autodemo.shortened": plan.shortened,
        "autodemo.lengthened": plan.lengthened,
        "autodemo.usd": Math.round(usd.total * 10000) / 10000,
        "autodemo.before": before,
        expires_at: bumpExpiry(),
        updated_at: new Date(),
      };
      if (voiceover) $set.voiceover = voiceover;
      const res = await retryDb(`save autodemo ${fresh._id}`, () =>
        StudioDemo.updateOne({ _id: fresh._id, rev: fresh.rev, "autodemo.seq": seq }, { $set, $inc: { rev: 1 } })
      );
      saved = !!res?.modifiedCount;
      if (!saved) await sleep(300 + i * 200);
    }
    if (!saved) {
      throw userError("The recording was being edited the whole time, so the demo wasn't applied. Generate it again.");
    }

    console.log(
      `[autodemo] ${demo._id}: ${lines.length} lines, ${cues.length} captions, ` +
        `voice ${voiceover ? `${voice} ${voiceover.seconds}s` : "failed"}, watched as ${plan.seen}, ` +
        `fitted ${plan.shortened} shorter / ${plan.lengthened} longer, ${refitted} refitted to the voice, ` +
        `${plan.focus.length} focus zoom(s)${plan.skipped.length ? ` (${plan.skipped.length} skipped)` : ""}, $${usd.total.toFixed(4)}`
    );
    publishProgress(demo, { autodemo: { status: "done" } });
  },

  async fail(job, err) {
    const seq = job.data?.seq;
    const message = err.userMessage || "We couldn't make the product demo. Your edit is unchanged. Try again in a moment.";
    await setAuto(job.demo, seq, { status: "failed", stage: "", progress: 0, error: message, finished_at: new Date() });
    const demo = await StudioDemo.findById(job.demo).select("user").lean();
    if (demo) publishProgress(demo, { autodemo: { status: "failed" } });
  },
};

export default { autodemoJob, requestAutodemo, undoAutodemo, shapeAutodemo, cleanBrief, BRIEF_MIN, BRIEF_MAX };

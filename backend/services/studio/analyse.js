/**
 * analyse.js: a recording, turned into an edit.
 *
 * This is the product. Everything else is plumbing around it: the browser hands
 * over pixels and a tracker report, and what comes back is a timeline with the
 * cuts, camera moves, captions and blur already decided.
 *
 * ── THE ORDER IS A DEPENDENCY CHAIN ──────────────────────────────────────────
 *   frames          sampled once, and read by two different passes
 *   events          what the pointer did, from the tracker (events.js)
 *   UI              what is on each frame (vision.js)
 *   steps           what the person was DOING — needs both of the above
 *   cuts            dead air, from the steps and from the pointer log
 *   zooms           the camera — needs the steps to know what matters
 *   blur            runs against every frame, in parallel with the rest
 *   captions        from the audio, independent of all of it
 *   narration       needs the steps
 *
 * The independent halves run together: blur and captions do not wait for the
 * steps, and the steps do not wait for blur.
 *
 * ── A FAILED PASS IS NOT A FAILED ANALYSIS ───────────────────────────────────
 * Every stage degrades rather than throws. No UI reading still gives steps from
 * the pointer log; no steps still gives zooms from the clicks; no audio simply
 * means no captions. What comes out is always an edit, and `analysis.frames_failed`
 * plus the returned spend say honestly how complete it was. The one thing that
 * DOES fail the job is having no recording to read.
 *
 * ── THE BLUR PASS IS NOT OPTIONAL ────────────────────────────────────────────
 * Every other pass can be skipped to save money. This one runs on every sampled
 * frame every time, because a missed API key cannot be un-published, and the
 * creator who most needs it is the one who did not think to ask for it.
 */
import path from "path";
import fsp from "fs/promises";
import { extractFrames } from "../media/ffmpeg.js";
import {
  newSpend, readFrames, detectSteps, planZooms, findSensitive, writeCaptions, writeNarration,
} from "./vision.js";
import { inferEvents, idleCuts, zoomsFromClicks, anticipateClicks, restToFull } from "./events.js";
import { emptyTimeline, sanitizeTimeline, smoothTrack, newId, mergedCuts } from "./timeline.js";
import { STUDIO_LIMITS } from "./demoService.js";

/**
 * Build the first edit.
 *
 * @param {object} o
 * @param {string} o.video       the prepared recording on local disk
 * @param {string} [o.audio]     the speech track, when the recording had one
 * @param {string} o.workDir
 * @param {object} o.capture     { track, motion } as the browser reported them
 * @param {object} o.source      { width, height, fps }
 * @param {number} o.duration
 * @param {Function} o.onProgress (fraction, stage)
 */
export async function analyseRecording({ video, audio = "", workDir, capture = {}, source, duration, wantCaptions = false, onProgress = () => {} }) {
  const spend = newSpend();
  const every = Math.max(0.5, STUDIO_LIMITS.frameEvery);

  /* ── Frames ──────────────────────────────────────────────────────────── */
  onProgress(0.02, "Sampling the recording");
  const framesDir = path.join(workDir, "frames");
  await fsp.mkdir(framesDir, { recursive: true });
  const frames = await extractFrames(video, framesDir, { every, duration, longEdge: 1280 });
  if (!frames.length) {
    throw Object.assign(new Error("no frames"), {
      userMessage: "We couldn't read any frames from this recording. It may not have finished uploading.",
    });
  }

  /* ── What the pointer did ────────────────────────────────────────────── */
  onProgress(0.06, "Reading the pointer");
  const events = inferEvents({
    samples: capture.track || [],
    motion: capture.motion || [],
    duration,
  });

  /* ── Everything the model reads ──────────────────────────────────────── */
  // The UI pass and the blur pass both walk every frame and neither needs the
  // other's answer, so they go together. Captions need only the audio.
  onProgress(0.1, "Watching the recording");

  const uiTask = readFrames(frames, {
    spend,
    onProgress: (p) => onProgress(0.1 + 0.34 * p, "Understanding the interface"),
  }).catch((err) => {
    console.error("[studio] UI pass failed entirely:", err);
    return [];
  });

  // The pointer log goes in with the frames: a blur is released when the screen
  // changes under it, not when the model happens to miss a sample. See
  // vision.js joinRegions.
  const blurTask = findSensitive(frames, { every, duration, events, spend }).catch((err) => {
    console.error("[studio] blur pass failed:", err);
    return [];
  });

  // ── CAPTIONS ARE ASKED FOR, NOT ASSUMED ──────────────────────────────────
  // Most product demos are silent screen recordings with the narration added
  // later, or never. Transcribing one produces captions of room tone, and
  // burning those onto a clean recording is worse than useless — it is a thing
  // the creator now has to find and turn off. So it runs only when the creator
  // asked, and generateCaptions() below adds them later to a demo that was
  // analysed without them, without re-reading a single frame.
  const captionTask =
    wantCaptions && audio
      ? writeCaptions(audio, { duration, spend }).catch((err) => {
          console.error("[studio] caption pass failed:", err);
          return { language: "", language_label: "", cues: [] };
        })
      : Promise.resolve({ language: "", language_label: "", cues: [] });

  const shots = await uiTask;
  onProgress(0.46, "Working out the steps");

  /* ── What the person was doing ───────────────────────────────────────── */
  const { summary, product, steps, dead } = await detectSteps({ shots, events, duration, spend }).catch((err) => {
    console.error("[studio] step detection failed:", err);
    return { summary: "", product: "", steps: [], dead: [] };
  });

  /* ── The camera ──────────────────────────────────────────────────────── */
  onProgress(0.58, "Planning the camera");
  let zooms = steps.length
    ? await planZooms({ steps, shots, events, duration, spend }).catch((err) => {
        console.error("[studio] zoom planning failed:", err);
        return [];
      })
    : [];

  /**
   * ── THE CLICKS DECIDE THE CAMERA; THE PLANNER FILLS THE GAPS ──────────────
   * The first version of this trusted the planner and used the clicks only as
   * a fallback, and the result was an eleven-second export that was a single
   * static crop: the planner had aimed at the content area, every click in the
   * recording happened in the left nav, and the nav was outside the frame the
   * whole time. Nobody watching could see a single thing being clicked.
   *
   * The order is now the other way round, because a click is the one moment in
   * a demo where the viewer is guaranteed to be looking for something
   * specific:
   *
   *   1. Every click gets a zoom, centred ON the click (events.js containing).
   *   2. The planner's zooms are kept only where they do not collide with one,
   *      re-aimed at any click inside them, and released as soon as it lands.
   *   3. restToFull() guarantees the camera reaches 1.0× between moves, which
   *      is the difference between a zoom and a crop.
   *   4. A demo may not be zoomed for more than MAX_ZOOMED of its length. Past
   *      that it stops reading as emphasis and starts reading as a mistake.
   */
  const clickZooms = zoomsFromClicks(events, { duration });
  const aimed = anticipateClicks(zooms, events, { duration });

  const collides = (z) =>
    clickZooms.some((c) => z.start < c.end + REST && c.start < z.end + REST);
  zooms = restToFull([...clickZooms, ...aimed.filter((z) => !collides(z))], { rest: REST });

  zooms = capZoomed(zooms, duration);
  if (!zooms.length) zooms = restToFull(clickZooms, { rest: REST });

  /* ── Narration ───────────────────────────────────────────────────────── */
  onProgress(0.68, "Writing the narration");
  const narration = steps.length
    ? await writeNarration({ steps, summary, product, duration, spend }).catch(() => [])
    : [];

  /* ── The passes that were running all along ──────────────────────────── */
  onProgress(0.82, "Checking for anything private");
  const blurs = await blurTask;
  onProgress(0.9, wantCaptions ? "Writing captions" : "Finishing");
  const captions = await captionTask;

  /* ── Assembly ────────────────────────────────────────────────────────── */
  onProgress(0.95, "Building the edit");

  const tl = emptyTimeline({ duration, ...source });

  // The pointer path, smoothed once here rather than at render time: the editor
  // draws the same path the export will, and re-smoothing on every preview
  // frame in the browser would cost more than it is worth.
  tl.track = smoothTrack(capture.track || [], {
    rate: 60,
    strength: tl.cursor.smoothing,
    duration,
  });
  tl.events = events;
  tl.steps = steps;
  tl.zooms = zooms;
  tl.blurs = blurs;
  tl.narration = narration;

  // Cuts come from two places and overlap constantly: the model's "dead" spans
  // and the pointer log's idle stretches are usually the same silence seen
  // twice. mergedCuts() folds them; ids are re-minted after, so every cut in
  // the document is one the editor can select and delete.
  tl.cuts = mergeCuts([...dead, ...idleCuts(events, { duration })], duration);

  tl.captions = {
    enabled: captions.cues.length > 0,
    style: "trylipi",
    position: "bottom",
    size: "m",
    lang: captions.language || "",
  };
  tl.cues = captions.cues;

  const timeline = sanitizeTimeline(tl, { duration, source });

  return {
    timeline,
    summary,
    product,
    language: captions.language,
    language_label: captions.language_label,
    frames_read: shots.length,
    frames_failed: Math.max(0, frames.length - shots.length),
    spend,
  };
}

/**
 * Captions for a demo that was analysed without them.
 *
 * Deliberately a separate entry point rather than a re-analysis. Everything
 * else in the edit — the steps, the camera, the blur — came
 * from reading hundreds of frames, and none of it changes because somebody
 * wants subtitles. This reads the audio and nothing else, so the button in the
 * editor is a few seconds and a few cents rather than the whole pipeline again.
 *
 * @returns {{ cues, language, language_label, spend }}
 */
export async function generateCaptions({ audio, duration }) {
  const spend = newSpend();
  if (!audio) return { cues: [], language: "", language_label: "", spend };
  const res = await writeCaptions(audio, { duration, spend });
  return { ...res, spend };
}

/** Seconds the camera must sit at the full frame between two zooms. */
const REST = 0.35;
/** The most of a recording that may be under a zoom. */
const MAX_ZOOMED = 0.6;

/**
 * Zooms, trimmed until the demo is not mostly zoomed.
 *
 * A zoom is emphasis, and emphasis on everything is emphasis on nothing. Past
 * about sixty per cent the video stops reading as "this bit matters" and starts
 * reading as "this recording is cropped wrong" — which is precisely how a real
 * export looked when the planner returned two zooms that covered all of it.
 *
 * The weakest are dropped first: a 1.3× zoom contributes almost nothing and
 * costs the same screen time as a 2.5× one that actually shows something.
 */
function capZoomed(zooms, duration) {
  if (!(duration > 0) || zooms.length < 2) return zooms;
  const span = (z) => z.end - z.start + (Number(z.ramp_out) || 0.2);
  let kept = [...zooms];
  let total = kept.reduce((a, z) => a + span(z), 0);
  if (total <= duration * MAX_ZOOMED) return kept;

  const order = [...kept].sort((a, b) => a.level - b.level || span(b) - span(a));
  for (const weakest of order) {
    if (total <= duration * MAX_ZOOMED || kept.length <= 1) break;
    kept = kept.filter((z) => z !== weakest);
    total -= span(weakest);
  }
  return kept.sort((a, b) => a.start - b.start);
}

/**
 * Two lists of proposed cuts, as one list with no overlaps.
 *
 * Also refuses to cut the very start: a demo that opens mid-action because the
 * first two seconds were "idle" has lost its establishing shot, which is the
 * one thing a viewer needs to know what they are looking at.
 */
function mergeCuts(cuts, duration) {
  const OPENING = 1.2;
  const kept = cuts
    .map((c) => ({ ...c, start: Math.max(c.start, OPENING) }))
    .filter((c) => c.end - c.start > 0.5 && c.start < duration);

  return mergedCuts({ cuts: kept, duration }).map((c) => {
    const from = kept.find((k) => k.start <= c.start + 0.01 && k.end >= c.end - 0.01) || kept.find((k) => k.start >= c.start - 0.01 && k.end <= c.end + 0.01);
    return { id: newId("cut"), start: c.start, end: c.end, reason: from?.reason || "idle", auto: true };
  });
}

export default { analyseRecording, generateCaptions };

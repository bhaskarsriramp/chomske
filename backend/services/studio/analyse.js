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
  newSpend, readFrames, detectSteps, planZooms, spaceZooms, findSensitive, writeCaptions, writeNarration,
} from "./vision.js";
import { inferEvents, idleCuts, zoomsFromClicks, anticipateClicks } from "./events.js";
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
   * ── THE CAMERA IS THE PLAN, PLUS EVERY CLICK THE PLAN MISSED ──────────────
   * Three things happen here, in order, and all three matter:
   *
   *   1. The planner's zooms are kept. It read the frames and knows what is
   *      worth looking at; the pointer log does not.
   *   2. Every one of them is pulled back so the camera is settled BEFORE the
   *      click it was planned for, not arriving after it.
   *   3. Clicks the planner said nothing about get a zoom of their own.
   *
   * Step 3 is the one that was missing, and it is most of what a screen
   * recorder is for. A click is the only moment in a demo where the viewer is
   * guaranteed to be looking for something specific — the button being
   * pressed — and a demo that zooms on some of them and not others reads as
   * inattentive. spaceZooms() then drops any that land on top of a planned
   * one, so the camera never pulls out and back in inside a second.
   */
  if (!zooms.length) zooms = zoomsFromClicks(events, { duration });
  zooms = anticipateClicks(zooms, events, { duration });

  const covered = (t) => zooms.some((z) => t >= z.start - 0.7 && t <= z.end + 0.7);
  const extra = zoomsFromClicks(events, { duration }).filter((z) => !covered((z.start + z.end) / 2));
  if (extra.length) {
    zooms = spaceZooms([...zooms, ...extra].sort((a, b) => a.start - b.start));
  }

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

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
  newSpend, readFrames, detectSteps, findSensitive, writeCaptions, writeNarration,
} from "./vision.js";
import { confirmClicks, shapeFromControls, steadyPath, restOnControls, inferEvents, idleCuts, zoomsFromClicks, restToFull, partCuts } from "./events.js";
import { alignCapture } from "./sync.js";
import { locatePointer, mergeLocated, stepPath, snapToLocated } from "./locate.js";
import { intentPath } from "./intent.js";
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

  /* ── The browser's report, checked against the video ─────────────────── */
  /**
   * ── TWO RECORDINGS, TWO CLOCKS, ONE TRUTH ────────────────────────────────
   * The pointer path was recorded by the browser; the video was recorded by
   * MediaRecorder. Nothing ties their timestamps together, and everything below
   * is a position looked up by time. This re-reads the finished file, lines the
   * two up on what actually changed on screen, and recovers where the pointer
   * was parked before it first moved — which the browser's tracker cannot see,
   * because it finds the pointer by differencing frames and a still pointer
   * makes no difference at all. See sync.js.
   */
  onProgress(0.04, "Checking the pointer against the recording");
  const aligned = await alignCapture({ video, capture, duration, sourceWidth: source?.width || 1920, sourceHeight: source?.height || 1080 }).catch((err) => {
    console.error("[studio] capture alignment failed:", err);
    return { track: capture.track || [], motion: capture.motion || [], screen: null, sync: { offset: 0, confident: false, reason: "the check could not be run" } };
  });
  const capturedTrack = aligned.track;
  const capturedMotion = aligned.motion;

  /**
   * ── THE POINTER, FOUND BY WHAT IT LOOKS LIKE ──────────────────────────────
   * The difference tracker above cannot see a still pointer, loses it while the
   * page scrolls, and guesses its hotspot to within a few pixels. locate.js
   * finds it by its shape in every frame instead — parked, mid-scroll, and to
   * the pixel — and knows whether it is an arrow or a hand.
   *
   * It is started here and not awaited: it is all arithmetic on decoded frames,
   * and the model pass below is all waiting on the network, so they overlap
   * and the creator waits for the longer of the two, not both. It is read
   * after the model has answered, before anything is decided from the clicks.
   *
   * Thirty frames a second is not arbitrary. It is the export's own frame grid,
   * so every located sample is the position in exactly the recording frame the
   * export will show at that moment.
   */
  const locateTask = locatePointer(video, {
    sourceWidth: source?.width || 1920,
    sourceHeight: source?.height || 1080,
    duration,
    fps: 30,
    cursorPx: aligned.sync?.cursor_px || 0,
    /**
     * ── THE HINTS ARE THE RAW LOG, NOT THE CLEANED ONE ────────────────────
     * alignCapture() throws away the samples where the tracker was following a
     * spinner or a repaint instead of the pointer, because those would be
     * DRAWN. As hints they are harmless: a hint is only a place to look, and
     * looking somewhere the pointer is not costs one failed match. Throwing
     * them away is not harmless — on a page that spends six seconds loading,
     * the cleaning removes every hint there is, and the one stretch where the
     * locator most needs a second opinion is the one where it gets none.
     */
    hints: (capture.track || []).map((p) => ({ ...p, t: num0(p.t) + num0(aligned.sync?.offset) })),
  }).catch((err) => {
    console.error("[studio] pointer locator failed; using the tracker alone:", err);
    return { track: [], design: null, heightPx: 0, found: 0, frames: 0 };
  });

  /* ── Everything the model reads ──────────────────────────────────────── */
  /**
   * ── THE MODEL PASS STARTS FIRST, AND IS WAITED FOR LAST ──────────────────
   * It is the longest thing in the analysis and it needs nothing from the rest
   * of it, so it goes out now and is collected at the end. Everything between
   * here and there runs while it is in flight.
   */
  onProgress(0.06, "Reading the pointer");

  const uiTask = readFrames(frames, {
    spend,
    onProgress: (p) => onProgress(0.1 + 0.34 * p, "Understanding the interface"),
  }).catch((err) => {
    console.error("[studio] UI pass failed entirely:", err);
    return [];
  });

  /* ── What the pointer did ────────────────────────────────────────────── */
  /**
   * ── THE PRESSES ARE READ FROM THE POINTER, NOT FROM THE TRACKER ──────────
   * This used to run before the locator had answered, on the difference
   * tracker's log alone, and the tracker cannot see a still pointer — which is
   * the only kind there is at the moment of a click. Everything downstream was
   * then reasoning about a pointer that vanished for the whole of every press.
   *
   * On one recording that cost the most important click in it: the creator put
   * the pointer on "API Keys", held it while a billing page finished loading,
   * pressed, and the tracker's only report of those six seconds was a loading
   * spinner going round. No sighting, no dwell, no click, no zoom.
   *
   * So the locator is read first now. Where it found the pointer that IS the
   * pointer — position and, just as importantly, the shape the operating
   * system drew, which is the one thing that says whether what was under it
   * could be clicked at all. The tracker fills the gaps, as it always did.
   */
  const located = await locateTask;
  const locatedShare = located.frames ? located.found / located.frames : 0;
  console.log(
    "[studio] pointer located by shape in " + located.found + " of " + located.frames + " frames" +
      (located.design ? " (" + located.design + " pointer, " + located.heightPx + "px)" : " — no pointer design recognised, tracker only")
  );
  const pointerPath = located.track.length ? mergeLocated(located.track, capturedTrack) : capturedTrack;

  let events = inferEvents({
    samples: pointerPath,
    motion: capturedMotion,
    duration,
    // What the finished video says changed, with loading spinners and other
    // animations discounted. Without it a spinner reads as a page navigating.
    screen: aligned.screen,
    // The real pointer, frame by frame: what the OS drew, where.
    located: located.track,
  });

  /**
   * ── A POINTER PARKED FROM THE FIRST FRAME IS DRAWN FROM THE FIRST FRAME ────
   * When the first click was made by a pointer that was already sitting on the
   * control before recording started, there is no sighting of it until well
   * after the click — and nothing drawn until then, while the real pointer is
   * plainly visible in the picture the whole time. It was there all along; the
   * click says so. So the path starts there.
   */
  const opening = events.find((e) => e.source === "parked");
  if (opening && capturedTrack.length && opening.t < num0(capturedTrack[0].t)) {
    capturedTrack.unshift({ t: 0, x: opening.x, y: opening.y, shape: opening.shape || "default", conf: 1 });
  }

  // Presses go where the pointer actually was, so the zoom and the ripple land
  // on the control and not a few pixels beside it.
  events = snapToLocated(events, located.track);

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

  /**
   * ── THE CAMERA WAITS FOR THE MODEL ──────────────────────────────────────
   * inferEvents() above found the presses from pixels alone, which is all it
   * can see: a pointer that stopped, and a screen that changed near it. That
   * shape is also what somebody reading a page with the mouse parked on it
   * produces, and what a trackpad scroll produces, and a demo that zooms into
   * those is worse than one that never zooms at all.
   *
   * Now that every frame has been read there is a second opinion available —
   * what was actually under the pointer — so the clicks are graded before
   * anything aims at them. Nothing is deleted here; only the camera is
   * withheld. See confirmClicks().
   */
  const notes = [];
  const graded = confirmClicks(events, shots, { located: located.track, onNote: (n) => notes.push(n) });
  for (const n of notes) {
    console.log("[studio] press at " + n.t.toFixed(2) + "s " + (n.zoomable ? "moves the camera" : "does not move the camera") + " — " + n.why);
  }
  events = graded;

  onProgress(0.46, "Working out the steps");

  /* ── What the person was doing ───────────────────────────────────────── */
  const { summary, product, steps, dead } = await detectSteps({ shots, events, duration, spend }).catch((err) => {
    console.error("[studio] step detection failed:", err);
    return { summary: "", product: "", steps: [], dead: [] };
  });

  /* ── The camera ──────────────────────────────────────────────────────── */
  onProgress(0.58, "Planning the camera");

  /**
   * ── THE CAMERA MOVES FOR A CLICK, AND FOR NOTHING ELSE ────────────────────
   * The creator has said it plainly and more than once: zoom when somebody
   * clicks a control, never on a hover, never while they scroll, never on the
   * model's own idea of what is interesting. Every zoom that was not a click
   * has turned out to be a bug report.
   *
   * There used to be a second source. The model watched the recording and
   * proposed zooms of its own, and those were kept wherever they did not
   * collide with a click. On a real recording that planned zoom arrived a
   * second and a half after the API Keys click, over a page that had already
   * loaded — "zoom is happening after some delay" — and in another it landed
   * on a billing page the creator was only scrolling. A planned zoom has no
   * press behind it by definition, so the rule it breaks is the one the
   * creator cares about most.
   *
   * So the planner is gone, including its model call. What is left:
   *
   *   1. Every accepted click gets a zoom, centred ON the click. "Accepted" is
   *      confirmClicks(): on a control, something came of it, and the page was
   *      not scrolling.
   *   2. restToFull() guarantees the camera reaches 1.0x between moves, which
   *      is the difference between a zoom and a crop.
   *   3. A demo may not be zoomed for more than MAX_ZOOMED of its length.
   */
  const clickZooms = zoomsFromClicks(events, { duration });
  let zooms = restToFull(clickZooms, { rest: REST });
  zooms = capZoomed(zooms, duration);


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

  /**
   * ── THE POINTER IS COMPOSED, NOT COPIED ──────────────────────────────────
   * Where the recording gives enough real clicks to work from, the path drawn
   * in the demo is built from them — resting on each control, travelling to
   * the next along a curve a hand would make, arriving a beat before the press
   * (intent.js). Where it does not, the recovered path is smoothed and used as
   * before. Either way this happens once, here: the editor draws the same path
   * the export will.
   *
   * What was actually seen is never overwritten. It stays in capture.track, so
   * a better composer tomorrow can be run against a recording made today.
   */
  const composed = intentPath(events, { shots, track: capturedTrack, duration });
  // The drawn pointer holds a hand wherever the model says there is something
  // to press, which is the rule the operating system itself follows and the one
  // that makes our cursor the same silhouette as the one it has to cover.
  /**
   * ── THE DRAWN POINTER, IN THREE RULES ────────────────────────────────────
   * Applied in this order, and the order matters:
   *
   *   1. steadyPath    it may only move somewhere it then stays, so no cause
   *                    of a brief deviation — spinner, repaint, artefact, or
   *                    something nobody has seen yet — can move it at all
   *   2. restOnControls while it sits on a control it sits perfectly still, so
   *                    a hand's small wobble cannot drift ours off the one
   *                    burnt into the recording
   *   3. shapeFromControls it holds a hand wherever there is something to
   *                    press, which is the rule the operating system follows
   *
   * Steadying comes first because the other two read positions, and a position
   * that was never real should not be snapped to a control or given a hand.
   */
  const wh = { sourceWidth: source?.width || 1920, sourceHeight: source?.height || 1080 };
  const steady = steadyPath(capturedTrack, wh);
  const rested = restOnControls(steady, shots, wh);
  const shaped = shapeFromControls(rested, shots);
  const stilled = capturedTrack.length - countMoves(steady, wh);
  if (stilled > 0) console.log("[studio] " + stilled + " brief deviation(s) of the pointer were not drawn");
  /**
   * ── WHERE THE POINTER WAS FOUND, IT IS DRAWN EXACTLY THERE ────────────────
   * Found in most of the recording, the located positions ARE the drawn path:
   * the real shape, frame by frame, with no smoothing, so the pointer burnt
   * into the recording is under ours in every frame, still or moving. The
   * tracker's (steadied, shaped) samples fill only what the locator missed.
   * Found in too little of it — an unusual pointer, a recording at a scale no
   * template fits — the path is built exactly as it was before.
   */
  if (locatedShare >= 0.5) {
    tl.track = stepPath(mergeLocated(located.track, shaped));
    tl.cursor = { ...tl.cursor, smoothing: 0, located: true };
  } else {
    tl.track = smoothTrack(shaped, { rate: 60, strength: tl.cursor.smoothing, duration });
  }
  tl.composed = composed ? composed.path : [];
  tl.cursor = {
    ...tl.cursor,
    captured_px: aligned.sync?.cursor_px > 0 ? aligned.sync.cursor_px : 22,
  };

  // Where the pointer really was, thinned, so the renderer can erase the one
  // burnt into the recording. Only worth carrying when the drawn path is not
  // the recovered one — otherwise the drawn pointer is already on top of it.
  // Always kept: it is what the renderer reconstructs away if the creator
  // switches to the composed path, and it is small.
  tl.captured = thin(located.track.length ? mergeLocated(located.track, capturedTrack) : capturedTrack);
  if (composed) {
    console.log(
      `[studio] pointer composed from ${composed.anchors.length} clicks ` +
        `(${composed.snapped} snapped to a control the model named)`
    );
  }
  tl.events = events;
  tl.steps = steps;
  tl.zooms = zooms;
  tl.blurs = blurs;
  tl.narration = narration;

  // Cuts come from two places and overlap constantly: the model's "dead" spans
  // and the pointer log's idle stretches are usually the same silence seen
  // twice. mergedCuts() folds them; ids are re-minted after, so every cut in
  // the document is one the editor can select and delete.
  // The camera is decided first and the cuts give way to it: a cut that lands
  // on a zoom's ramp deletes the frames the move was going to play on, and what
  // survives is a jump. See events.js partCuts.
  /**
   * ── NOTHING IS REMOVED FROM THE RECORDING UNLESS SOMEBODY ASKS ───────────
   * These used to be applied on sight, and a creator watching their own demo
   * described the result as "I felt fast forwarding" — a two second cut landing
   * exactly between the click that opened API Keys and the click that went back
   * to Billing. They were right, and the reason is worth stating because it is
   * not obvious from the code that produced it.
   *
   * Dead air is only dead to something counting pixels. A pause while a page
   * settles is the beat that tells a viewer the click worked, and the moment
   * they read the screen they have just been taken to. Cutting it does not
   * tighten the demo, it removes the part where the demo made sense — and the
   * join is visible, because the pointer and the camera arrive somewhere they
   * were not a frame ago.
   *
   * So they are worked out and offered, not taken. The editor already has Add
   * cut and Restore cut, so a creator who does want the pause gone can have it
   * in one gesture, and one who does not is never surprised by footage that
   * went missing on its own.
   */
  const proposed = partCuts(mergeCuts([...dead, ...idleCuts(events, { duration })], duration), zooms);
  tl.cuts = [];
  tl.dead_air = proposed;
  if (proposed.length) {
    console.log(
      "[studio] " + proposed.length + " quiet stretch(es) found and LEFT IN: " +
        proposed.map((c) => c.start.toFixed(1) + "-" + c.end.toFixed(1) + "s").join(", ")
    );
  }

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
    // Only what the gate reads: the box, what it is, and what it said.
    elements: shots.map((s) => ({
      t: Math.round(Number(s.t) * 1000) / 1000,
      elements: (s.elements || []).map((el) => ({
        type: el.type,
        label: el.label,
        bbox: (el.bbox || []).map((v) => Math.round(Number(v) * 1000) / 1000),
      })),
    })),
        locate: { found: located.found, frames: located.frames, design: located.design, height_px: located.heightPx },
    frames_read: shots.length,
    frames_failed: Math.max(0, frames.length - shots.length),
    sync: aligned.sync,
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
 * The recovered path at fifteen samples a second.
 *
 * The erase patch is a little larger than a cursor and moves between samples in
 * a straight line, so more resolution than this buys nothing and costs document
 * size. A sample is kept when the pointer has moved far enough to matter or
 * when enough time has passed that the patch would otherwise drift.
 */
function thin(track, { step = 1 / 15, move = 0.004 } = {}) {
  const out = [];
  for (const p of track || []) {
    const last = out[out.length - 1];
    if (!last || p.t - last.t >= step || Math.hypot(p.x - last.x, p.y - last.y) >= move) {
      out.push({ t: p.t, x: p.x, y: p.y });
    }
  }
  return out;
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


/** How many samples actually moved the pointer, for the log above. */
function countMoves(track, { sourceWidth = 1920, sourceHeight = 1080 } = {}) {
  const ratio = sourceHeight / Math.max(1, sourceWidth);
  let n = 0;
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1];
    const b = track[i];
    if (Math.hypot(b.x - a.x, (b.y - a.y) * ratio) > 0.02) n++;
  }
  return n;
}

/** A number, or 0. */
function num0(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

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
 *
 * ── EXCEPT THAT NOW THE MODEL DOES NOT RUN HERE AT ALL ───────────────────────
 * See VISION_ON_ANALYSE below. The first edit is made from pixels only; the
 * blur pass, the steps and the narration are a second, separate pass the
 * creator asks for. Nothing about the paragraph above has stopped being true —
 * a missed API key still cannot be un-published — so the editor must keep
 * saying so until that pass has run. It is an interface promise now rather
 * than a pipeline one.
 */
import path from "path";
import fsp from "fs/promises";
import { extractFrames } from "../media/ffmpeg.js";
import {
  newSpend, readFrames, detectSteps, findSensitive, writeCaptions, writeNarration, identifyPointer, judgeRuns, pointerTargets,
} from "./vision.js";
import { providerReady } from "../ai/provider.js";
import { judgePresses, PRESS_JUDGE_MODE } from "./judge.js";
import { confirmClicks, shapeFromControls, steadyPath, restOnControls, inferEvents, idleCuts, zoomsFromClicks, restToFull, partCuts, capZoomed, restMoments, dwells } from "./events.js";
import { changeMoments, auditEdit, applyPatches } from "./audit.js";
import { alignCapture, settleAfter, playingRegions, fillFromVideo } from "./sync.js";
import { locatePointer, mergeLocated, stepPath, snapToLocated, withoutStrangers, stayedChanged } from "./locate.js";
import { intentPath } from "./intent.js";
import { buildVig, applyVig, vigForStorage, restsToName, VIG_MODE } from "./vig.js";
import { emptyTimeline, sanitizeTimeline, smoothTrack, newId, mergedCuts } from "./timeline.js";
import { STUDIO_LIMITS } from "./demoService.js";

/**
 * ── WHETHER THE MODEL READS THE FRAMES DURING THE FIRST ANALYSIS ─────────────
 *
 * Off. Nothing in the camera, the cursor or the clicks needs it any more.
 *
 * ── WHY IT IS OFF RATHER THAN DELETED ───────────────────────────────────────
 * Every line the model pass feeds is still here and still wired up — this is a
 * switch, not an amputation. `STUDIO_VISION_ON_ANALYSE=on` in the environment
 * restores the old behaviour exactly, with no deploy and no code change, which
 * is the point: the creator asked for this to be reversible on their word after
 * they had watched a few exports.
 *
 * ── WHAT CHANGED TO MAKE IT UNNECESSARY ─────────────────────────────────────
 * The model's only job in the camera was to say whether there was something
 * pressable under the pointer. The operating system answers that question in
 * every frame, for free, by drawing a hand over what answers a click and an
 * arrow over what does not — and locate.js now reads that glyph directly. See
 * confirmClicks() in events.js.
 *
 * ── WHAT STILL NEEDS IT, AND WHERE THAT NOW HAPPENS ─────────────────────────
 * Blur, the steps, the narration and the written summary are all readings of
 * what is ON the screen, which no amount of pointer arithmetic can supply.
 * Those moved to visionPass() below, run on demand when the creator opens the
 * panel that needs them, so the first edit is instant and free and nobody pays
 * for a blur pass on a recording with nothing private in it.
 *
 * Captions were never part of this: they are read from the audio, they have
 * always been opt-in, and they have always had their own entry point.
 */
export const VISION_ON_ANALYSE =
  String(process.env.STUDIO_VISION_ON_ANALYSE || "off").trim().toLowerCase() === "on";

/**
 * ── WHETHER THE MODEL SETTLES WHICH POINTER IS THE CREATOR'S ─────────────────
 *
 * On, and independent of the switch above. It is one request, made only when a
 * recording contains two pointers that both look real — the creator's and one
 * inside a demo on the page — which is the one decision the pixels cannot make
 * and the one every other result rests on: pick the demo's cursor and every
 * click is filed where the demo's cursor was. See locate.js chooseIdentity.
 * Half a dozen frames at analysis size, a fraction of a cent, on the
 * recordings that need it and on no others.
 *
 * `STUDIO_POINTER_VISION=off` falls back to the pixel evidence alone.
 */
export const POINTER_VISION =
  String(process.env.STUDIO_POINTER_VISION || "on").trim().toLowerCase() !== "off";

/**
 * ── WHETHER THE BLUR PASS RUNS AT ALL ────────────────────────────────────────
 *
 * Off, on the creator's instruction, while the camera is being worked on:
 *
 *   "we are automatically applying the blur for the sensitive information on
 *    the screen right, lets pause it for now, cause i'm testing the clicks and
 *    mouse, camera related stuff. Once we master in this area then we will move
 *    to the blur, captions."
 *
 * ── AND THIS FILE ARGUES THE OPPOSITE, SO SAY SO PLAINLY ─────────────────────
 * The header above says the blur pass is the one that is not optional, because
 * "a missed API key cannot be un-published, and the creator who most needs it is
 * the one who did not think to ask for it". That reasoning has not stopped being
 * true. What has changed is who is recording: while this is a tool being tested
 * by the person who built it, on recordings they choose, the argument is about a
 * risk nobody is currently taking, and every model call it makes is noise in the
 * measurements the camera work is being judged by.
 *
 * So it is a switch and not a deletion — `STUDIO_BLUR=on` restores it with no
 * deploy — and it must be turned back on BEFORE anybody else records anything.
 * The editor still tells the creator that nothing has been checked for private
 * information, which is now an interface promise rather than a pipeline one,
 * exactly as it already is when the vision pass is off.
 */
export const BLUR_ON =
  String(process.env.STUDIO_BLUR || "off").trim().toLowerCase() === "on";

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

  /**
   * ── HOW SMOOTHLY THE RECORDING WAS TAKEN, BEFORE ANYTHING IS DONE TO IT ───
   * Nothing reads this yet. It is here because a creator reported that smooth
   * scrolling comes out of the export stepping, and the recording's average
   * frame rate cannot say whether that was already true of the capture: a
   * screen capture emits a frame only when the screen changes, so thirteen a
   * second may be thirty during a scroll and two over a still page.
   *
   * `fastest_quarter_hz` is the recording at its busiest, which is the number
   * that answers it. Near 30 means the motion was captured smoothly and what
   * follows is ours to fix; far below means the browser never had the frames.
   * See capture.js cadenceOf().
   */
  const cad = capture?.frames;
  if (cad?.supported) {
    console.log(
      "[studio] capture cadence: " + cad.frames + " frames, median " +
        Number(cad.median_ms || 0).toFixed(1) + "ms (" + Number(cad.median_hz || 0).toFixed(1) + "fps), " +
        "busiest quarter " + Number(cad.fastest_quarter_hz || 0).toFixed(1) + "fps, " +
        "p10–p90 " + Number(cad.p10_ms || 0).toFixed(1) + "–" + Number(cad.p90_ms || 0).toFixed(1) + "ms " +
        "(spread " + Number(cad.spread || 0).toFixed(1) + "x)"
    );
  } else if (cad) {
    console.log("[studio] capture cadence: this browser does not report frame timing");
  }
  // The tracker's health (capture.js): how early it went quiet, and why.
  if (cad && cad.last_sample_s != null) {
    const short = num0(duration) - num0(cad.last_sample_s);
    console.log(
      "[studio] browser tracker: last sample at " + num0(cad.last_sample_s).toFixed(1) + "s of " + num0(duration).toFixed(1) + "s" +
        (short > 1 ? " (" + short.toFixed(1) + "s early)" : "") + ", " + num0(cad.stalls) + " stalled grab(s), " + num0(cad.replays) + " restart(s)" + (cad.mode ? ", read by " + cad.mode : "")
    );
  }
  // What the capture delivered, where the browser said (see capture.js startCapture).
  const dev = capture?.device;
  if (dev || capture?.env?.browser) {
    console.log(
      "[studio] captured with " + (capture?.env?.browser || "an unknown browser") + " " + (capture?.env?.browser_version || "") +
        " on " + (capture?.env?.platform || "?") + ", " + (capture?.surface || "?") + " surface" +
        (dev ? ", cursor " + (dev.cursor ? '"' + dev.cursor + '"' : "not reported") + (dev.cursor_offered ? " (offered " + dev.cursor_offered + ")" : "") +
          ", " + (dev.frame_rate || "?") + "fps, " + (dev.width || "?") + "x" + (dev.height || "?") +
          (dev.screen_pixel_ratio ? ", pixel ratio " + dev.screen_pixel_ratio : "") : "")
    );
  }

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
  // Where the browser's tracker went silent — often the last seconds of a demo,
  // where its last press is — the video's own measurement stands in. See sync.js.
  const capturedMotion = fillFromVideo(aligned.motion, aligned.screen, duration);

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
     * The machine this was recorded on. The pointer's height in the picture
     * follows from the screen's width in CSS pixels, which nothing on this
     * side can work out from the video — and the fallback that stands in for
     * it assumes a 1920-wide desktop at 100% zoom. Absent on every recording
     * made before the browser started reporting it, which is why it is only
     * ever a prior. See capture.js environment() and locate.js.
     */
    env: capture.env || null,
    /**
     * The pointer itself, read at full resolution in the browser while this was
     * being recorded. It settles the two things calibration otherwise has to
     * discover by searching the encoded video — which design and how tall — and
     * those are the two it can get wrong for a whole recording at a stretch.
     * Absent on every recording made before the browser started measuring it.
     * See capture.js profileOf() and tracker.worker.js readGlyph().
     */
    cursor: capture.cursor || null,
    /**
     * What the screen was doing, measured just above. The locator uses it for
     * one thing: a region that was animating for most of the recording is a
     * video playing on the page, and a pointer found inside one belongs to
     * whoever recorded THAT — not to the creator. See sync.js playingRegions.
     */
    screen: aligned.screen,
    /**
     * When two pointers both fit — the creator's and one in a demo on the
     * page — the model is shown each, boxed, and asked which is whose.
     */
    identify: POINTER_VISION && providerReady()
      ? (rivals) => identifyPointer({ video, dir: path.join(workDir, "identity"), rivals, spend })
      : null,
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
    // With the model reading frames as well, that pass drives the bar and this
    // one stays quiet rather than the two fighting over it.
    onProgress: VISION_ON_ANALYSE ? null : (p) => onProgress(0.06 + 0.5 * p, "Following the pointer"),
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

  const uiTask = VISION_ON_ANALYSE
    ? readFrames(frames, {
        spend,
        onProgress: (p) => onProgress(0.1 + 0.34 * p, "Understanding the interface"),
      }).catch((err) => {
        console.error("[studio] UI pass failed entirely:", err);
        return [];
      })
    : Promise.resolve([]);

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
      (located.design
        ? " (" + located.design + " pointer, " + located.heightPx + "px" +
          /**
           * How well the chosen template actually looked like a pointer. Text
           * matches in the 0.74–0.77 band and a real cursor from 0.85; the bar
           * to be counted at all is 0.72, so a number in the seventies here
           * means the whole recording was tracked against noise. It was not
           * printed anywhere until a recording came back calibrated to a 12px
           * dark arrow and nothing in the log said it was a bad fit.
           */
          (located.fit ? ", fit " + Number(located.fit).toFixed(3) : "") + ")"
        : " — no pointer design recognised, tracker only")
  );
  const pointerPath = located.track.length ? mergeLocated(located.track, capturedTrack) : capturedTrack;

  /**
   * ── THE PATH TO DRAW, WITHOUT SOMEBODY ELSE'S POINTER IN IT ───────────────
   * Asked of the model while the rest of this runs, and read only where the
   * drawn path is built. The presses below use located.track exactly as found:
   * this may move our cursor for a stretch and can never cost a click. See
   * locate.js withoutStrangers.
   */
  const drawnTask =
    POINTER_VISION && providerReady() && located.track.length
      ? withoutStrangers(located.track, {
          W: source?.width || 1920,
          H: source?.height || 1080,
          screen: aligned.screen,
          judge: ({ reference, runs }) =>
            judgeRuns({ video, dir: path.join(workDir, "runs"), reference, runs, heightPx: located.heightPx, spend }),
        }).catch((err) => {
          console.error("[studio] the check for somebody else's pointer failed:", err);
          return null;
        })
      : Promise.resolve(null);

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

  // A small control — a toggle, a tab, a checkbox — that stayed changed after
  // the pointer left was pressed, however little of the screen it changed.
  // See locate.js stayedChanged.
  events = await stayedChanged(video, events, {
    located: located.track,
    // Every rest, so a hand's rest nothing was proposed at is asked too.
    rests: dwells(pointerPath),
    screen: aligned.screen,
    W: source?.width || 1920,
    H: source?.height || 1080,
    duration,
  }).catch((err) => {
    console.error("[studio] the stayed-changed check failed:", err);
    return events;
  });

  // The pointer log goes in with the frames: a blur is released when the screen
  // changes under it, not when the model happens to miss a sample. See
  // vision.js joinRegions.
  const blurTask = VISION_ON_ANALYSE && BLUR_ON
    ? findSensitive(frames, { every, duration, events, spend }).catch((err) => {
        console.error("[studio] blur pass failed:", err);
        return [];
      })
    : Promise.resolve([]);

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
   * ── THE RECORDING AS A GRAPH (vig.js) ───────────────────────────────────
   * The readings, the pointer and the page changes, joined into screens, the
   * objects on them and what the pointer did to what. Two things are decided
   * from it before the gate weighs the presses: a page change goes to the
   * press on the thing it is named after, and a press on something that turned
   * selected (and stayed) is corroborated. Without readings it is empty and
   * changes nothing.
   */
  let vig = null;
  if (VIG_MODE !== "off" && shots.length) {
    /**
     * What each rest was on, asked of a close crop with the pointer's tip
     * marked (vision.js pointerTargets) — the frame-wide readings box a list
     * a row out often enough to name the wrong item. One request, only for the
     * rests a page change or a press followed.
     */
    let named = [];
    const toName = restsToName({ pointer: pointerPath, events });
    if (toName.length && providerReady()) {
      const W = source?.width || 1920;
      const H = source?.height || 1080;
      const answers = await pointerTargets({
        video, dir: path.join(workDir, "targets"), W, H, spend,
        targets: toName.map((r) => ({ t: r.t, x: r.x * W, y: r.y * H })),
      }).catch((err) => {
        console.warn("[studio] vig: naming what the pointer was on failed: " + err.message);
        return [];
      });
      named = toName.map((r, i) => ({ ...r, ...(answers[i] || {}) })).filter((r) => r.type);
      if (named.length) {
        console.log("[studio] vig: the pointer was on " + named.map((r) => r.from.toFixed(1) + "s " + (r.type === "none" ? "(nothing)" : "\"" + r.label + "\"") + " " + Number(r.confidence).toFixed(2)).join(", "));
      }
    }
    vig = buildVig({ shots, events, pointer: pointerPath, screen: aligned.screen, duration, named });
    events = applyVig(events, vig, { screen: aligned.screen, onNote: (s) => console.log("[studio] vig: " + s) });
    console.log(
      "[studio] vig: " + vig.screens.length + " screen(s), " + vig.objects.length + " object(s), " +
        vig.opens.length + " page change(s) matched to what was pressed by name, " +
        vig.changes.filter((c) => c.attended).length + " state change(s) under the pointer"
    );
  }

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
  const graded = confirmClicks(events, shots, {
    located: located.track,
    flashes: located.flashes,
    /**
     * Which parts of the screen do not scroll, measured from pixels. This is
     * what stops a press on a fixed navigation bar being refused because the
     * page behind it moved — five of ten presses on one real recording. See
     * sync.js isSticky.
     */
    screen: aligned.screen,
    /**
     * The regions that were animating for most of the recording, and which
     * surface was shared. The first lets a change be attributed to a video
     * playing rather than to the press; the second says whether there is any
     * browser furniture in the picture at all. See sync.js explainMotion and
     * chromeBand.
     */
    playing: playingRegions(aligned.screen, { duration }),
    capture,
    onNote: (n) => notes.push(n),
  });
  for (const n of notes) {
    console.log("[studio] press at " + n.t.toFixed(2) + "s " + (n.zoomable ? "moves the camera" : "does not move the camera") + " — " + n.why);
  }
  events = graded;

  /**
   * The model's verdict on every press, given everything measured above. Off
   * unless STUDIO_PRESS_JUDGE says otherwise; see judge.js.
   */
  if (PRESS_JUDGE_MODE !== "off" && providerReady()) {
    events = await judgePresses(events, {
      video,
      workDir,
      located: located.track,
      flashes: located.flashes,
      screen: aligned.screen,
      W: source?.width || 1920,
      H: source?.height || 1080,
      duration,
      spend,
    }).catch((err) => {
      console.error("[studio] the press judge failed:", err);
      return events;
    });
  }

  if (VISION_ON_ANALYSE) onProgress(0.46, "Working out the steps");

  /* ── What the person was doing ───────────────────────────────────────── */
  const { summary, product, steps, dead } = VISION_ON_ANALYSE
    ? await detectSteps({ shots, events, duration, spend }).catch((err) => {
        console.error("[studio] step detection failed:", err);
        return { summary: "", product: "", steps: [], dead: [] };
      })
    : { summary: "", product: "", steps: [], dead: [] };

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
  /**
   * ── THE STEPS SHAPE THE CAMERA WHEN THERE ARE ANY ────────────────────────
   * Two presses inside one step are one thing the viewer is watching, so the
   * camera holds across them instead of pulling out and back in. With the model
   * pass off there are no steps and the gap on the clock decides, exactly as
   * before. See MERGE_IN_STEP in events.js.
   */
  const clickZooms = zoomsFromClicks(events, {
    duration,
    steps,
    /**
     * ── HOW STRONG A ZOOM THIS RECORDING CAN AFFORD ─────────────────────────
     * A zoom crops and rescales, so the level that stays sharp depends on how
     * many source pixels there are to spend. See levelForBox.
     */
    sourceWidth: source?.width || 0,
    /**
     * ── AND HOW LONG TO STAY ────────────────────────────────────────────────
     * Until the screen has settled after the press, rather than for a fixed
     * beat. A control that answers instantly is unaffected; one that loads for
     * a second no longer has its loading framed and its answer missed. See
     * sync.js settleAfter.
     */
    holdFor: aligned.screen ? (t) => settleAfter(aligned.screen, t) : null,
  });
  let zooms = restToFull(clickZooms, { rest: REST });
  zooms = capZoomed(zooms, duration);


  /* ── Narration ───────────────────────────────────────────────────────── */
  if (VISION_ON_ANALYSE) onProgress(0.68, "Writing the narration");
  const narration = VISION_ON_ANALYSE && steps.length
    ? await writeNarration({ steps, summary, product, duration, spend }).catch(() => [])
    : [];

  /* ── The passes that were running all along ──────────────────────────── */
  if (VISION_ON_ANALYSE && BLUR_ON) onProgress(0.82, "Checking for anything private");
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
  const shaped = shapeFromControls(rested, shots, { screen: aligned.screen });
  const stilled = capturedTrack.length - countMoves(steady, wh);
  if (stilled > 0) console.log("[studio] " + stilled + " brief deviation(s) of the pointer were not drawn");
  /**
   * ── WHERE THE POINTER WAS FOUND, IT IS DRAWN EXACTLY THERE ────────────────
   * The located positions ARE the drawn path wherever they exist: the real
   * shape, frame by frame, with no smoothing, so the pointer burnt into the
   * recording is under ours in every frame, still or moving. The tracker's
   * (steadied, shaped) samples fill only what the locator missed.
   *
   * ── AND "WHEREVER THEY EXIST" USED TO MEAN "ONLY IF MOST OF THEM DO" ──────
   * This was an all-or-nothing switch on half the frames, and on a real
   * recording that threw away every sighting because there were not quite
   * enough of them. The result was the worst of both: the pointer had been
   * found exactly, in a large part of the recording, and was drawn from the
   * difference tracker anyway — approximate, smoothed, and with the shape
   * guessed from a patch of pixels. The creator saw all of it at once: our
   * arrow beside their hand, both visible, drifting apart as they moved.
   *
   * A sighting is right or it is not; how many other frames also have one
   * changes nothing about it. So every located sample is used, and the share
   * now decides only whether the recording counts as located overall — which
   * is a claim made to the editor, not a reason to discard measurements.
   */
  const drawn = await drawnTask;
  const theirs = drawn?.dropped || [];
  const notTheirs = (list) => (theirs.length ? list.filter((p) => !theirs.some((s) => p.t >= s.start && p.t <= s.end)) : list);
  if (located.track.length) {
    tl.track = stepPath(mergeLocated(drawn?.track || located.track, notTheirs(shaped)));
    tl.cursor = { ...tl.cursor, smoothing: 0, located: locatedShare >= 0.5 };
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
  // Somebody else's pointer is part of the picture, not something to erase.
  tl.captured = thin(located.track.length ? mergeLocated(notTheirs(located.track), notTheirs(capturedTrack)) : capturedTrack);
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

  /**
   * ── EVERY MOMENT THE SCREEN CHANGED, KEPT ────────────────────────────────
   * Arithmetic over what sync.js already measured: no model, no frames, no
   * network, a few milliseconds. It is kept because it is the only way to look
   * for what was MISSED — a press nobody found is invisible by definition, and
   * cannot be discovered by examining the presses that were found.
   *
   * The list is a fact about the RECORDING, so it is computed once here and
   * never again. Whether any given moment is explained is a fact about the
   * EDIT, which changes every time the creator touches it, so that is worked
   * out fresh each audit. See services/studio/audit.js.
   */
  const changes = changeMoments(aligned.screen, { duration }).slice(0, 400);
  if (changes.length) {
    const loud = changes.filter((c) => !events.some((e) => Math.abs(e.t - c.t) <= 1.6));
    console.log(
      `[studio] ${changes.length} screen change(s) measured; ${loud.length} with no event within 1.6s` +
        (loud.length ? " — " + loud.slice(0, 6).map((c) => c.t.toFixed(1) + "s").join(", ") + (loud.length > 6 ? ", …" : "") : "")
    );
  }

  /**
   * ── AND WHERE THE POINTER STOPPED, WHICH IS THE OTHER HALF OF "MISSED" ────
   * The change list above finds moments the screen did something nobody
   * accounted for. It cannot find a press whose result was too small or too
   * far from the pointer to register as a change at all — a toggle flipping, a
   * tab becoming selected, a checkbox. Those leave no event and no change, so
   * nothing downstream has any reason to look at them.
   *
   * A person clicks with the pointer held still, so every click in the
   * recording is inside one of these rests. Stored beside the changes, and for
   * the same reason: a fact about the recording, measured once. The audit
   * subtracts the rests that are already explained and asks the model about
   * what is left. See events.js restMoments and audit.js plan().
   */
  const rests = restMoments(pointerPath);
  if (rests.length) {
    const bare = rests.filter((r) => !events.some((e) => Math.abs(num0(e.t) - r.t) <= 1.0));
    console.log(
      `[studio] pointer rested ${rests.length} time(s); ${bare.length} with no event within 1s` +
        (bare.length ? " — " + bare.slice(0, 6).map((r) => r.t.toFixed(1) + "s").join(", ") + (bare.length > 6 ? ", …" : "") : "")
    );
  }

  return {
    timeline,
    changes,
    rests,
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
        locate: { found: located.found, frames: located.frames, design: located.design, height_px: located.heightPx, fit: located.fit },
    frames_read: shots.length,
    // The recording as a graph — screens, objects, rests, what was done to what.
    vig: vigForStorage(vig),
    /**
     * Whether the frames were checked for private information, which is NOT the
     * same question as whether they were read. With the blur pass paused they
     * are read for the steps and not checked for anything, and the editor must
     * go on saying so — "Every sampled frame was checked" when none was is the
     * one claim this product cannot make. See BLUR_ON.
     */
    blur_checked: BLUR_ON,
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
 * Everything the model has to look at the screen to know, on demand.
 *
 * ── WHY THIS IS A SECOND PASS AND NOT PART OF THE FIRST ─────────────────────
 * The first analysis used to read every frame with the model because the
 * camera needed it to know what was clickable. It does not any more — the
 * operating system's own pointer says so in every frame — so the model pass
 * stopped being on the critical path and became what it always was in
 * substance: a reading of the CONTENT.
 *
 * That reading is worth paying for when you want it and worth nothing when you
 * do not. A creator demoing a public marketing page has nothing to blur; a
 * creator who only wants a clean zoomed recording has no use for a written
 * step list. Both of them were paying for both, on every recording, before the
 * editor had even opened.
 *
 * ── WHAT IT DELIBERATELY DOES NOT TOUCH ─────────────────────────────────────
 * The camera, the cursor path, the clicks and the cuts. By the time somebody
 * asks for this they have had the edit open and may well have moved a zoom or
 * deleted one, and a pass they ran to find private information has no business
 * rearranging their edit. The one thing the model could still add to the
 * camera — a press on a native button that some sites draw with a plain arrow
 * — is not worth overwriting a creator's own work for.
 *
 * @param {object} o
 * @param {string} o.video     the prepared recording on local disk
 * @param {string} o.workDir
 * @param {number} o.duration
 * @param {Array}  o.events    the presses already found, so a blur can be
 *                             released when the screen changes under it
 * @returns {{ shots, blurs, steps, summary, product, narration, dead,
 *             elements, frames_read, frames_failed, spend }}
 */
export async function visionPass({ video, workDir, duration, events = [], onProgress = () => {} }) {
  const spend = newSpend();
  const every = Math.max(0.5, STUDIO_LIMITS.frameEvery);

  onProgress(0.02, "Sampling the recording");
  const framesDir = path.join(workDir, "frames");
  await fsp.mkdir(framesDir, { recursive: true });
  const frames = await extractFrames(video, framesDir, { every, duration, longEdge: 1280 });
  if (!frames.length) {
    throw Object.assign(new Error("no frames"), {
      userMessage: "We couldn't read any frames from this recording.",
    });
  }

  onProgress(0.05, "Watching the recording");
  const uiTask = readFrames(frames, {
    spend,
    onProgress: (p) => onProgress(0.05 + 0.5 * p, "Understanding the interface"),
  }).catch((err) => {
    console.error("[studio] UI pass failed entirely:", err);
    return [];
  });

  /**
   * Paused while the camera is being worked on — see BLUR_ON. The steps, the
   * narration and the frame reading all still run: those are what the creator
   * asked to keep, because the camera needs the model's understanding of the
   * flow and needs none of its opinion about what is private.
   */
  const blurTask = BLUR_ON
    ? findSensitive(frames, { every, duration, events, spend }).catch((err) => {
        console.error("[studio] blur pass failed:", err);
        return [];
      })
    : Promise.resolve([]);

  const shots = await uiTask;

  onProgress(0.6, "Working out the steps");
  const { summary, product, steps, dead } = await detectSteps({ shots, events, duration, spend }).catch((err) => {
    console.error("[studio] step detection failed:", err);
    return { summary: "", product: "", steps: [], dead: [] };
  });

  onProgress(0.78, "Writing the narration");
  const narration = steps.length
    ? await writeNarration({ steps, summary, product, duration, spend }).catch(() => [])
    : [];

  // Only claimed when it is actually happening: a progress bar that says it
  // checked for private information when the pass is paused is the one kind of
  // lie this product must not tell.
  if (BLUR_ON) onProgress(0.9, "Checking for anything private");
  const blurs = await blurTask;

  /**
   * ── THE CONTROLS, WRITTEN ONTO THE PRESSES THAT LANDED ON THEM ─────────────
   * Now that every frame has been read, the box of the thing under each press
   * is knowable, and it is the single most useful fact the camera never had: a
   * zoom built from a click COORDINATE is a fixed box around a point, and one
   * built from the control's own rectangle frames the control.
   *
   * ── AND ONLY THE EVIDENCE, NOT THE VERDICT ────────────────────────────────
   * confirmClicks() also decides `zoomable`, and with the frames read it would
   * decide differently for some presses than the pixels did — a press refused
   * for a plain arrow would now be allowed on a named control. That is very
   * probably the better answer, and writing it here would still be wrong: by
   * the time this pass runs the creator has had the editor open, and a zoom
   * appearing in an edit they are working on because a background job changed
   * its mind is exactly the kind of surprise this file's header promises not to
   * spring. So the box, the label and the shape are written; the verdict is
   * left exactly as it was, and any disagreement reaches the creator as a
   * suggestion from the audit (services/studio/audit.js) instead.
   */
  const KEEP = ["target", "control", "on_control", "pointer_shape"];
  const regraded = new Map(
    confirmClicks(events, shots, { onNote: () => {} }).map((e) => [e.id, e])
  );
  let named = 0;
  const annotated = events.map((e) => {
    const fresh = regraded.get(e.id);
    if (!fresh) return e;
    const add = {};
    for (const k of KEEP) if (fresh[k] !== undefined) add[k] = fresh[k];
    if (add.target && !e.target) named++;
    return Object.keys(add).length ? { ...e, ...add } : e;
  });
  if (named) console.log(`[studio] ${named} press(es) now know the control they landed on`);

  return {
    events: annotated,
    shots,
    blurs,
    steps,
    summary,
    product,
    narration,
    dead,
    elements: shots.map((s) => ({
      t: Math.round(Number(s.t) * 1000) / 1000,
      elements: (s.elements || []).map((el) => ({
        type: el.type,
        label: el.label,
        bbox: (el.bbox || []).map((v) => Math.round(Number(v) * 1000) / 1000),
      })),
    })),
    frames_read: shots.length,
    /**
     * Whether the frames were checked for private information, which is NOT the
     * same question as whether they were read. With the blur pass paused they
     * are read for the steps and not checked for anything, and the editor must
     * go on saying so — "Every sampled frame was checked" when none was is the
     * one claim this product cannot make. See BLUR_ON.
     */
    blur_checked: BLUR_ON,
    frames_failed: Math.max(0, frames.length - shots.length),
    spend,
  };
}

/**
 * The edit, checked against the recording it came from.
 *
 * ── A THIRD PASS, AND DELIBERATELY NOT PART OF EITHER OF THE OTHER TWO ───────
 * analyseRecording() builds the edit from pixels. visionPass() reads the
 * screens. This one asks whether the first got it right, and it is separate
 * from both for the same reason a reviewer is separate from an author: a pass
 * that audits its own output in the same breath is not auditing anything.
 *
 * It is also the cheapest of the three by a wide margin, because it does not
 * sample the recording at all — it cuts two frames at each of a couple of dozen
 * moments the pixel pipeline already identified as interesting or unaccounted
 * for. A ten minute demo costs the vision pass three hundred frames and costs
 * this one about fifty.
 *
 * ── NOTHING IT FINDS IS APPLIED ──────────────────────────────────────────────
 * Camera changes come back as suggestions, which the creator accepts one at a
 * time through services/studio/suggestions.js. The only thing written directly
 * is evidence onto the events that were checked — what the frames showed, what
 * the control was called — and never the verdict, the time or the position,
 * which belong to the pixels.
 */
export async function auditPass({
  video,
  workDir,
  duration,
  timeline,
  changes = [],
  onProgress = () => {},
}) {
  const spend = newSpend();
  const events = timeline?.events || [];
  const zooms = timeline?.zooms || [];

  onProgress(0.05, "Checking the clicks against the recording");
  const res = await auditEdit({
    video,
    workDir,
    duration,
    events,
    zooms,
    changes,
    spend,
    onProgress: (p) => onProgress(0.05 + 0.9 * p, "Checking the clicks against the recording"),
  });

  return { ...res, events: applyPatches(events, res.patches), spend };
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

export default { analyseRecording, generateCaptions, visionPass, auditPass, VISION_ON_ANALYSE };


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

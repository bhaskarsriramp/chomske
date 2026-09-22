/**
 * events.js: pixels, turned back into what the person did.
 *
 * ── THE CONSTRAINT THIS FILE EXISTS TO WORK AROUND ───────────────────────────
 * A browser recording a screen gets pixels and nothing else. getDisplayMedia
 * hands over frames; it does not hand over the pointer, the clicks, the keys or
 * which window was in front. JavaScript sees mouse events inside its own tab and
 * nowhere else, so when a creator shares another window — which is every real
 * demo — there are no events to capture at all. This is why Screen Studio is a
 * native app and why Supademo ships a browser extension.
 *
 * So the events are RECOVERED. The browser-side tracker
 * (src/components/Studio/cursorTracker.worker.js) watches the captured frames
 * and reports two things per sample: where it believes the pointer is, and a
 * summary of what changed on screen since the previous sample. That is the raw
 * material. This file turns it into clicks, scrolls, typing and screen changes.
 *
 * ── WHY THE INFERENCE LIVES ON THE SERVER ────────────────────────────────────
 * The tracker reports observations; this file reports conclusions. Keeping the
 * two apart means the thresholds below can be changed and an existing recording
 * re-analysed, without asking anybody to record it again. The browser stores
 * what it SAW; a mistake here is a bug, not lost data.
 *
 * ── WHAT A CLICK LOOKS LIKE FROM THE OUTSIDE ─────────────────────────────────
 * Nobody can see a mouse button from a video. What is visible is the shape of
 * the behaviour around one: the pointer arrives somewhere and stops, it holds
 * still for a moment, and then a part of the screen near it changes. Nothing
 * else in normal use produces that sequence. The pointer changing from an arrow
 * to a hand on the way in raises the confidence, because the operating system
 * only draws a hand over something clickable.
 *
 * It is not perfect and does not claim to be. Every event carries a confidence,
 * the editor shows the low ones differently, and the creator can add or remove
 * one by hand. A missed click costs a zoom; it does not cost the recording.
 */
import { newId, rampsOf, clampRect } from "./timeline.js";
import { busyShare } from "./sync.js";

/**
 * How much of a changed region has to be animating before the change is the
 * animation rather than a reaction to anything.
 *
 * Not a majority — well past one. A press on a control that happens to sit
 * beside a playing video produces a box covering both, and that box is perhaps
 * half animation; refusing it would throw away real presses on any page with a
 * video on it. Three quarters means the change is essentially all animation
 * with a little noise, which is what a video playing to itself looks like.
 */
const MOSTLY_ANIMATION = 0.75;

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const frac = (v, d = 0) => clamp(num(v, d), 0, 1);
const round3 = (v) => Math.round(v * 1000) / 1000;
const round4 = (v) => Math.round(v * 10000) / 10000;
/** The middle value. Used wherever one bad frame must not carry the answer. */
const median = (vs) => {
  const s = [...vs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * The thresholds, in one place, because every one of them is a judgement that
 * will need re-tuning against real recordings and none of them should be found
 * buried in a condition three functions down.
 */
export const RULES = {
  /** Pointer speed, in fractions of the frame per second, that counts as still. */
  stillSpeed: 0.035,
  /** How long it must be still before a change nearby can be read as a click. */
  dwellMs: 90,
  /** The window after the pointer settles in which a change counts as its doing. */
  reactionMs: [40, 520],
  /**
   * What a new screen looks like.
   *
   * ── IT IS A SHAPE, NOT AN AMOUNT ──────────────────────────────────────────
   * This used to be "45% of the pixels changed", and on a real product it never
   * once fired. Modern interfaces are mostly white, and navigating from one
   * white page to another white page changes a tenth of the pixels: the text
   * moves, the background does not. A twenty-five second recording of somebody
   * clicking through a billing console peaked at fourteen per cent, so no
   * navigation was ever detected, so no click was, so the camera had nothing to
   * zoom on and no ripple ever fired. The creator's words were "the actual
   * click is missing", and it was.
   *
   * What separates a new screen from a button lighting up is not how many
   * pixels moved but WHERE: a navigation changes something in every corner,
   * a widget changes one place. So the test is the bounding box — most of the
   * width and most of the height — with a modest floor to rule out noise.
   */
  navBox: 0.6,
  /**
   * How much of the picture a change that spans only ONE dimension has to
   * cover before it is a new screen rather than a widget doing something.
   *
   * A quarter of the frame. The settings pane that prompted it covers 0.44; a
   * menu opening covers about 0.08, a row highlighting 0.006. Well clear of
   * both, and it is never the only test: a change this shape also has to be
   * beside the pointer that caused it.
   */
  navArea: 0.25,
  navEnergy: 0.02,
  /**
   * How close to the frame's top and bottom edges a faint change has to reach
   * before its shape alone says a whole surface was replaced.
   *
   * A page swapping its content pane runs the full height of the window; a
   * chart, a toast or a panel filling in sits in a band somewhere inside it.
   * Eight per cent leaves room for a header bar without letting a band through.
   */
  faintEdge: 0.08,
  /** Repaints closer together than this are one navigation, not several. */
  navGap: 0.4,
  /**
   * How much of the screen the VIDEO must agree changed, ignoring anything
   * that was merely animating.
   *
   * The browser's own summary is a single bounding box around everything that
   * changed, so a spinner in the middle and the pointer near an edge produce a
   * box spanning the frame — indistinguishable from a page replacing itself.
   * That is how a demo collected a click for every turn of a loading spinner.
   * sync.js measures the same moment from the finished video, in cells, with
   * the animations discounted; below this share of them, nothing navigated.
   */
  navCover: 0.12,
  /** A scroll changes a lot of the screen too; this is its ceiling. */
  scrollMaxEnergy: 0.42,
  /** Below this, nothing happened worth calling an event. */
  noiseEnergy: 0.0015,
  /** A click's change is local: this much of the frame at most. */
  clickMaxEnergy: 0.42,
  /** How far the change can be from the pointer and still be the pointer's doing. */
  clickRadius: 0.16,
  /** Two clicks closer than this, at the same spot, are one double-click. */
  doubleClickMs: 380,
  /** A scroll's changed region is tall and the pointer is still. */
  scrollMinHeight: 0.35,
  scrollMinSamples: 2,
  /** Typing: small changes, in a short wide band, several samples running. */
  typeMaxEnergy: 0.02,
  typeMaxHeight: 0.09,
  typeMinSamples: 3,
  /** Nothing moving and nothing changing for this long is dead air. */
  idleMs: 1400,
};

/**
 * How long after the pointer stops a whole-screen change may still be that
 * click's doing.
 *
 * Wider than `reactionMs` on purpose. A button darkening is instant; a page
 * navigating has to fetch, render and paint, and on a real site that is most of
 * a second. Holding the ordinary reaction window here is what made every
 * navigation click invisible.
 */
const NAV_REACTION = 1.1;

/**
 * How long ago the pointer may have settled and the change still be its doing.
 *
 * Generous — people hover before they press, and a slow page takes a moment —
 * but finite, which is what stops a parked pointer collecting a click for every
 * repaint of a page that is busy on its own account.
 */
const REST_FRESH = 2.5;
/**
 * The same, for a pointer the operating system is drawing a hand under.
 *
 * ── A HOVER BEFORE A PRESS IS LONGER THAN TWO AND A HALF SECONDS ────────────
 * Two and a half was a guess made when nothing was known about what the
 * pointer was over, and it has to be short, because a pointer parked anywhere
 * at all would otherwise collect a click from any repaint that came along.
 *
 * It is also shorter than a demo. People put the pointer on the thing they are
 * about to show, say a sentence about it, and then press — five seconds, often
 * more. Every one of those clicks was being thrown away for being too patient.
 *
 * The hand is what makes the longer window safe. A pointer sitting on a menu
 * row for five seconds and then the page changes is a person clicking a menu
 * row. A pointer sitting in the empty half of a panel is refused outright,
 * whatever the interval, by the rule above this one.
 */
const REST_HOVER = 6;

/** How long after a press its consequence may take to appear. */
const CONSEQUENCE = 1.4;
/** How much bigger that consequence has to be than the press's own flicker. */
const CONSEQUENCE_GROWTH = 3;
/**
 * How much of the screen a press has to change on its own frame to need no
 * further consequence at all.
 *
 * A hover changes its own row: a percent or two. Five percent is already more
 * than any highlight, and the value that matters in practice is far above it —
 * a sidebar row that swaps the content area moves a fifth of the picture.
 */
const CONSEQUENCE_ALONE = 0.05;
/**
 * The same thing, measured as the SIZE of what changed rather than the share
 * of pixels inside it that did.
 *
 * ── IT IS A SHAPE, NOT AN AMOUNT, HERE TOO ──────────────────────────────────
 * `navBox` above learned this lesson already: interfaces are mostly white, so
 * a new screen changes a tenth of the pixels and the honest measure is where
 * the change was, not how much of it there was. The consequence test never got
 * the same treatment and still reads pixel share alone.
 *
 * Measured on a real recording: the creator opened the account menu, a third
 * of the width and six tenths of the height of the frame appeared, and it
 * cleared the pixel test by 0.0015 — 0.0515 against 0.05. A menu one shade
 * lighter, or over a busier page, is thrown away as "nothing came of it", and
 * a press that plainly opened a menu gets no zoom.
 *
 * A region this size is a menu, a popover, a panel or a pane. A hover's
 * highlight is its own row — four thousandths of a frame — and a tooltip is
 * not much more, so there is a factor of ten between this and anything a
 * pointer can cause by merely sitting somewhere.
 */
const CONSEQUENCE_AREA = 0.06;
/**
 * How soon the consequence of a press has to START.
 *
 * ── A HOVER IS A PRESS WEARING SOMETHING ELSE'S CONSEQUENCE ─────────────────
 * The test is relative: a change bigger than the press's own flicker. When the
 * press made no flicker at all — a hover over a sidebar row, where the
 * highlight is a rounding error — the bar drops to the noise floor and ANY
 * change in the next second and a half qualifies, whatever caused it.
 *
 * On one recording that is exactly what happened. The creator rested the
 * pointer on "Referral Bonus", never pressed it, and the page never changed;
 * two thirds of a second later a chart elsewhere on the screen finished
 * drawing itself, and the rules called that the consequence. The camera pushed
 * in on a hover.
 *
 * A browser does not take two thirds of a second to acknowledge a click. In
 * that same recording all five real presses were answered in 0.12 seconds —
 * soon enough that the change is already inside the window the press itself is
 * measured over, so nothing is lost by refusing late SMALL changes. A large
 * one is a different matter: a page replacing itself may take its time, which
 * is what a slow page does, so size earns the delay.
 */
const CONSEQUENCE_PROMPT = 0.5;
/** How much of the screen a LATE consequence has to change to count at all. */
const CONSEQUENCE_LATE = 0.25;
/** The same, on the browser tracker's own scale rather than the video's. */
const CONSEQUENCE_LATE_ENERGY = 0.05;

/**
 * ── A SCROLL IS NOT A CONSEQUENCE ────────────────────────────────────────────
 * The click test above asks "did the pointer rest, and did something change
 * near it?". On a laptop that question has a false answer built into the
 * hardware: two fingers on a trackpad scroll the page while the pointer sits
 * perfectly still, wherever it happened to be left. The pointer rests, the
 * screen changes enormously, and every rule fires. Six of the eleven clicks
 * found in one real recording were this, and half the zooms in the export were
 * aimed at a page the creator was only reading.
 *
 * What separates the two is the SHAPE of the change, not its size. A press
 * repaints a region: a menu opens, a panel fills, a row lights up. A scroll
 * TRANSLATES: every line of content moves the same distance in the same
 * direction, and nothing else about the picture changes at all.
 *
 * The tracker already measures that translation — it has to, to tell a scroll
 * from a pointer move — and reports it per frame as dy. It is a rare signal and
 * a sharp one: across a twenty-five second recording only nine per cent of
 * frames carried any vertical shift at all, and the clicks the creator named as
 * scrolls carried between 0.18 and 0.60 of a frame height of it while every
 * real press carried none.
 */
const SCROLL_SHIFT = 0.004;
/** Frame heights of travel, summed over the reaction window, that mean scrolling. */
const SCROLL_SUM = 0.05;

/**
 * How far the picture slid vertically in the moment after a press.
 *
 * Small shifts are ignored one at a time and summed: a slow trackpad scroll is
 * many small steps, and a single step is indistinguishable from a text caret
 * blinking a row over.
 */
function scrolledAfter(mot, t) {
  let sum = 0;
  for (const m of mot) {
    if (m.t < t) continue;
    if (m.t > t + CONSEQUENCE) break;
    const dy = Math.abs(num(m.dy, 0));
    if (dy >= SCROLL_SHIFT) sum += dy;
  }
  return sum;
}

/**
 * The tracker's raw report, cleaned.
 *
 * Samples arrive from a browser and are used to build ffmpeg filter arguments
 * and canvas coordinates, so every field is forced into range here, once, at
 * the boundary. `confidence` below 0.35 means the tracker could not separate
 * the pointer from a repainting screen; those samples are dropped rather than
 * interpolated, and cursorAt() bridges the gap.
 */
export function cleanSamples(raw, { duration = 0 } = {}) {
  const max = duration > 0 ? duration : Infinity;
  return (raw || [])
    .map((s) => ({
      t: round3(clamp(num(s.t), 0, max)),
      x: round4(frac(s.x, 0.5)),
      y: round4(frac(s.y, 0.5)),
      shape: String(s.shape || "default").replace(/[^a-z_]/gi, "").slice(0, 16) || "default",
      conf: clamp(num(s.conf, 1), 0, 1),
      // Kept because it changes how much a sighting is worth: a located one is
      // the pointer, read off the frame by its shape. A tracker one is
      // whatever moved, which during a page load is the page.
      located: s.located === true,
    }))
    .filter((s) => s.conf >= 0.35)
    .sort((a, b) => a.t - b.t)
    .filter((s, i, arr) => i === 0 || s.t - arr[i - 1].t > 0.004);
}

/** The tracker's per-sample summary of what changed on screen. */
export function cleanMotion(raw, { duration = 0 } = {}) {
  const max = duration > 0 ? duration : Infinity;
  return (raw || [])
    .map((m) => ({
      t: round3(clamp(num(m.t), 0, max)),
      energy: clamp(num(m.energy), 0, 1),
      x: round4(frac(m.x, 0.5)),
      y: round4(frac(m.y, 0.5)),
      w: round4(frac(m.w, 0)),
      h: round4(frac(m.h, 0)),
      dy: round3(clamp(num(m.dy), -1, 1)),
    }))
    .sort((a, b) => a.t - b.t);
}

/* ────────────────────────────────────────────────────────────────────────────
   Pointer behaviour
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Speed at each sample, in fractions of the frame per second.
 * Measured across a three-sample window rather than between neighbours: at
 * 60 Hz the gap between two samples is small enough that a one-pixel
 * measurement error reads as a metre-per-second lurch.
 */
export function speeds(samples) {
  const out = new Array(samples.length).fill(0);
  for (let i = 0; i < samples.length; i++) {
    const a = samples[Math.max(0, i - 1)];
    const b = samples[Math.min(samples.length - 1, i + 1)];
    const dt = b.t - a.t;
    out[i] = dt > 0 ? Math.hypot(b.x - a.x, b.y - a.y) / dt : 0;
  }
  return out;
}

/**
 * Where the pointer settled and for how long.
 * A demo is mostly these: the pointer goes somewhere, waits, something happens.
 */
export function dwells(samples, v = speeds(samples)) {
  const out = [];
  /**
   * ── THE GAPS ARE THE DWELLS ───────────────────────────────────────────────
   * The single most important line in this file, and it was missing.
   *
   * The tracker finds the pointer by differencing frames, so a pointer that is
   * not moving produces no difference and is not reported at all. A creator
   * resting the pointer on a menu item therefore does not appear in the track
   * as a run of slow samples — it appears as a HOLE. Looking for dwells among
   * the samples finds only the moments the pointer was drifting slowly, which
   * is almost never: a real recording of twenty-five seconds and two hundred
   * samples yielded two.
   *
   * A hole in the track is the pointer standing still, at the last place it was
   * seen, until the moment it was seen again. That is the definition of a
   * dwell, and every click in a demo happens during one.
   */
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    if (b.t - a.t < GAP_REST) continue;
    out.push({ start: a.t, end: b.t, x: a.x, y: a.y, shape: a.shape, n: 2, blind: true });
  }

  let open = null;
  for (let i = 0; i < samples.length; i++) {
    if (v[i] <= RULES.stillSpeed) {
      if (!open) open = { start: samples[i].t, x: samples[i].x, y: samples[i].y, shape: samples[i].shape, n: 1 };
      else {
        open.end = samples[i].t;
        open.n += 1;
        // The resting position is the LAST sample of the dwell, not the first:
        // the pointer decelerates into place and the early samples of a dwell
        // are still a few pixels short of where it stopped.
        open.x = samples[i].x;
        open.y = samples[i].y;
        open.shape = samples[i].shape;
      }
    } else if (open) {
      if ((open.end ?? open.start) - open.start >= RULES.dwellMs / 1000) out.push({ ...open, end: open.end ?? open.start });
      open = null;
    }
  }
  if (open && (open.end ?? open.start) - open.start >= RULES.dwellMs / 1000) out.push({ ...open, end: open.end ?? open.start });
  return out.sort((a, b) => a.start - b.start);
}

/**
 * How long the pointer must have sat still before the moment is worth PAYING
 * to ask the model about.
 *
 * RULES.dwellMs (90) is the bar for a dwell to exist at all, and it is
 * deliberately low because the rules downstream need every rest they can get.
 * This is a different question: a rest this short is usually the pointer
 * pausing mid-travel, and the audit's budget is better spent elsewhere. A
 * fifth of a second is about the shortest a hand takes to arrive somewhere,
 * press, and still be there — the same reasoning as HELD_CLICKABLE.
 */
const REST_MS = 200;

/**
 * Every moment the pointer stopped, whether or not anything was made of it.
 *
 * ── WHY THIS IS NOT THE SAME LIST AS THE CLICKS ──────────────────────────────
 * inferEvents() proposes a press only where a rest is FOLLOWED BY a change it
 * can see near the pointer. That is the right rule for a pipeline that has to
 * decide on its own, and it is a rule with a blind side: a press whose result
 * was small, or slow, or off where the pointer was — a toggle flipping, a tab
 * becoming selected, a value updating in a panel across the screen — produces
 * a rest and no event, so there is nothing for the audit to be uncertain ABOUT
 * and the moment is never checked by anything.
 *
 * Examining the presses that were found can never reveal the ones that were
 * not. This is the list that can: a person clicks with the pointer held still,
 * so every click in a recording is inside one of these, and what the audit does
 * with them is ask the recording what actually happened there.
 *
 * It is a fact about the RECORDING — where the pointer stopped — so it is
 * measured once and stored, exactly like the change list beside it. Which of
 * them are already explained is a fact about the EDIT, and is worked out fresh
 * every time the audit runs.
 *
 * @param {Array} samples the pointer path, located and merged
 * @returns {Array<{t:number,x:number,y:number,ms:number,shape:string}>}
 */
export function restMoments(samples, { limit = 400 } = {}) {
  const out = [];
  for (const d of dwells(samples || [])) {
    const ms = Math.round((num(d.end) - num(d.start)) * 1000);
    if (ms < REST_MS) continue;
    out.push({
      /**
       * The END of the rest, not its middle or its start. A press happens at
       * the moment the hand stops moving and commits, and what follows it is
       * the consequence the audit cuts its "after" frame from — so timing the
       * candidate at the end of the rest puts that frame on the result rather
       * than on the rest of the hover.
       */
      t: round3(num(d.end)),
      x: round4(frac(d.x, 0.5)),
      y: round4(frac(d.y, 0.5)),
      ms,
      shape: d.shape || "default",
    });
  }
  /**
   * The longest rests first when the cap bites. A pointer parked for two
   * seconds is far more likely to have pressed something than one that paused
   * for a quarter of a second on its way past.
   */
  out.sort((a, b) => b.ms - a.ms);
  return out.slice(0, limit).sort((a, b) => a.t - b.t);
}

/**
 * How long the tracker must lose the pointer before that counts as it resting.
 *
 * It runs at 24 Hz, so a couple of dropped samples is ordinary and means
 * nothing. A quarter of a second of silence means the pointer stopped.
 */
const GAP_REST = 0.25;

/* ────────────────────────────────────────────────────────────────────────────
   Inference
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Everything the recording says the person did.
 *
 * Order matters. Screen changes are found first and claim their moments, so a
 * page navigation is never also reported as a click on whatever the pointer
 * happened to be over. Then clicks, which are the events the edit is actually
 * built from. Then scrolls and typing, which are found in what is left.
 *
 * @returns {Array<{id,t,type,x,y,dy,text,confidence,source}>}
 */
export function inferEvents({ samples, motion, duration = 0, screen = null, located = null }) {
  const pts = cleanSamples(samples, { duration });
  const mot = cleanMotion(motion, { duration });
  if (!mot.length) return [];

  const v = speeds(pts);
  const rests = dwells(pts, v);
  const claimed = [];
  const events = [];

  const isClaimed = (t, window = 0.25) => claimed.some((c) => Math.abs(c - t) < window);
  const claim = (t) => claimed.push(t);

  // ── Screen changes ────────────────────────────────────────────────────────
  // A page repainting takes several samples; they are one navigation, and only
  // the first matters, because that is the moment the old screen went away.
  const navs = [];
  let lastNav = -Infinity;
  for (const m of mot) {
    /**
     * ── AND NOT EVERY NEW SCREEN CHANGES MANY PIXELS ──────────────────────
     * `navBox` below learned that a new screen is a shape and not an amount.
     * `navEnergy`, the floor underneath it, never did — it is still a count of
     * how many pixels came out different, and that is the one thing a modern
     * interface refuses to supply. White cards replaced by white skeleton
     * placeholders on a white page move almost nothing.
     *
     * Measured on a real recording: pressing "Projects" replaced three
     * quarters of the width and the whole height of the frame and changed
     * 1.97% of the pixels. The floor is 2%. The most deliberate press in the
     * demo was three ten-thousandths of a percent short of being visible at
     * all, and got no zoom.
     *
     * So a change may also earn its place by its SIZE AND SHAPE: a real share
     * of the picture, running from the top of the frame to the bottom, which
     * is what a page or a pane replacing itself does and what a widget
     * redrawing itself in the middle of one does not. That second half matters
     * — without it, a chart finishing its animation across the screen from a
     * resting hand would qualify, and that hover is a bug this file has
     * already been through once.
     */
    const faint =
      m.energy >= RULES.noiseEnergy &&
      m.w * m.h >= RULES.navArea &&
      m.y <= RULES.faintEdge &&
      m.y + m.h >= 1 - RULES.faintEdge;
    if (m.energy < RULES.navEnergy && !faint) continue;
    /**
     * ── NOT EVERY NEW SCREEN FILLS THE SCREEN ─────────────────────────────
     * The test below this used to be the whole of it: most of the width AND
     * most of the height, which is what a page replacing a page looks like.
     * Half the navigations in a product demo are not that shape.
     *
     * A settings dialog is the ordinary case. The creator pressed "Usage" in
     * its left rail and the pane beside it became a different pane — measured
     * on a real recording, 0.525 of the frame's width by 0.839 of its height.
     * Every corner of the DIALOG changed and not one corner of the frame did,
     * so the rule read it as "no navigation", no click was minted, and the
     * most deliberate moment in that stretch of the demo got no zoom: "i have
     * clicked the 'Usage' menu item from the Settings side bar, Zoom-in not
     * happened and not worked".
     *
     * Nothing about that is a smaller event than a page load. It is the same
     * event inside a smaller surface, and the frame's edges are an accident of
     * where the dialog happens to sit. So a change that spans one whole
     * dimension and covers a real share of the picture counts too — and pays
     * for the looser shape by having to be BESIDE THE POINTER, which is
     * checked where the rest is found below. A pane swaps because the rail
     * next to it was pressed; a chart finishing on the far side of the screen
     * while somebody hovers is not a press, and that is the difference.
     */
    const whole = m.w >= RULES.navBox && m.h >= RULES.navBox;
    const surface = (m.w >= RULES.navBox || m.h >= RULES.navBox) && m.w * m.h >= RULES.navArea;
    if (!whole && !surface) continue;
    /**
     * ── A PAGE SCROLLING IS NOT A PAGE CHANGING ───────────────────────────
     * The test above is a shape test: something changed in every corner, which
     * nothing but a new screen does. Except one thing does, constantly, and it
     * is the single most common thing anybody does to a page. Scrolling moves
     * every line of content at once, so the changed region spans the frame and
     * the energy clears the floor, and the rule fires on a creator who was
     * only reading.
     *
     * Every one of those minted a click, because the block below reads a
     * whole-screen change over a resting pointer as near-certain evidence of a
     * press — and a pointer IS resting during a trackpad scroll, which is the
     * whole reason a trackpad has two fingers.
     *
     * The difference is coherence. When a page navigates, the new content bears
     * no relation to the old and the row-correlation finds no consistent shift.
     * When it scrolls, every row moved the same distance, and that distance is
     * dy. On the recording that prompted this, seven of eleven whole-screen
     * changes carried a shift and four did not, and the four were the four real
     * page changes.
     *
     * Nothing is lost by returning here: the scroll section further down emits
     * a scroll event for exactly these frames.
     */
    if (Math.abs(num(m.dy, 0)) >= SCROLL_SHIFT) continue;
    /**
     * ── AND NOT JUST THIS FRAME: THE STRETCH AROUND IT ─────────────────────
     * The check above reads one frame, and the first frame of a scroll often
     * reads as no shift at all — the row correlation cannot match a flick that
     * moved further than it searches. One real recording had a "navigation"
     * with a shift of zero sitting inside twenty-two frames of scrolling, and
     * it minted a click the creator never made, with a zoom.
     *
     * What makes a scroll a scroll is that it is SUSTAINED and it is COHERENT:
     * every row goes the same way. Twenty-two of those shifts in a second and
     * a half, all upward: a scroll. A page opening shows a few shifts that
     * disagree with each other — its layout settling — and a real click on
     * "API Keys" measured seven of them with a coherence of 0.64.
     */
    if (scrollingAround(mot, m.t)) continue;
    /**
     * ── AND THE TEST THAT DOES NOT ASK THE TRACKER WHICH WAY IT WENT ───────
     * Every scroll veto above this line is built on `dy`, and `dy` has a
     * ceiling. The tracker measures it by sliding one frame's row profile over
     * the previous frame's, across a fixed range of offsets; past that range
     * it cannot see the shift at all and returns the offset that happened to
     * fit best, which for two pictures that do not match is near enough zero.
     *
     * So the faster the page scrolls, the more it looks like a page that did
     * not scroll. Dragging the scrollbar to the bottom of a dashboard — the
     * single most common way anybody gets to the bottom of anything — moves
     * the content further in one frame than the search ever reaches, every
     * frame, for as long as the drag lasts. Measured on a real recording:
     * fourteen consecutive frames of a fifth of the picture changing, `dy`
     * reported as 0.0000, no scroll detected, a navigation minted, a zoom:
     * "the Zoom in has happened without any click and right side you can see
     * our mouse pointer is moving with the vertical scoller line".
     *
     * `dy` cannot be trusted to say a page was still, so this asks something
     * `dy` is not involved in. A page replacing itself is a STEP: one frame
     * differs from its predecessor and the frame after that is already the new
     * page, quiet again. A scroll is a RUN: it keeps changing for as long as
     * somebody keeps scrolling. Measured across both recordings, a real press
     * that changed the screen had 4% of the surrounding second also changing,
     * and the scroll had 40-46%. That is not a threshold anyone has to tune.
     */
    if (sustained(mot, m.t, m.energy)) continue;
    if (!screenAgrees(screen, m.t, m)) continue;
    if (m.t - lastNav < RULES.navGap) {
      lastNav = m.t;
      continue;
    }
    lastNav = m.t;
    events.push(event("nav", m.t, m.x + m.w / 2, m.y + m.h / 2, { confidence: clamp(0.5 + m.energy * 3, 0, 1) }));
    // `whole` travels with it: a frame-filling change contains the pointer
    // wherever the pointer is, and a pane-sized one has to be shown to.
    navs.push({ ...m, whole });
    claim(m.t);
  }

  /**
   * ── THE CLICKS THAT NAVIGATE ──────────────────────────────────────────────
   * These were being thrown away, and they are the most important clicks in a
   * product demo.
   *
   * The ordinary click test below looks for a SMALL change near where the
   * pointer settled: a button darkening, a menu opening, a field filling. It
   * explicitly rejects anything above `clickMaxEnergy`, and the loop above has
   * already claimed the moment for a "nav". Both of those are correct in
   * isolation and together they mean that clicking a menu item which replaces
   * the whole page produces no click at all.
   *
   * That is exactly what a real recording showed: a twenty-two second demo of
   * someone navigating a settings panel, and ONE click detected in it. The
   * camera had nothing to zoom on, the click ripple never fired, and watching
   * it back there was no moment where anything looked pressed — the screen
   * simply became a different screen.
   *
   * A whole-screen change with the pointer resting somewhere the instant before
   * it is not ambiguous. Nothing else does that. It is a click, and the size of
   * the change is evidence FOR it rather than against it, so it is read here,
   * before the subtle case, and given high confidence.
   */
  /**
   * A rest can only have been clicked once. Without this, a page that repaints
   * in stages while the pointer sits still — a chart drawing itself, a list
   * filling in — hands out a click for every stage, and the end of a demo fills
   * with presses nobody made.
   */
  const spent = new Set();

  for (const nav of navs) {
    /**
     * ── A PAGE FINISHING LOADING IS NOT A PRESS ────────────────────────────
     * Everything below reads a whole-screen change over a resting pointer as
     * near-certain evidence of a click, and for a page that CHANGED that is
     * right. A page that is still arriving changes the same way, several times
     * over, seconds after the press that asked for it — and the creator, done
     * clicking, has moved the pointer somewhere neutral to watch it come in.
     *
     * Two of those were minted on one recording, each with its own zoom, each
     * on a pointer sitting in the empty half of a panel that had not drawn
     * itself yet: "i think while some part or section of the page is loading
     * our code is treating it as a new page, because of that it is
     * automatically zooming in there."
     *
     * The pointer says which it was. Nobody presses empty space and gets a new
     * screen for it, so a plain arrow over the spot means the screen changed by
     * itself. Nothing is claimed and no dwell is spent: the creator is often
     * about to press something for real while the page is still settling, and
     * that press needs the dwell it happens in.
     */
    const os = osShapeAt(located, nav.t);
    const read = settledAt(os);
    if (read && !CLICKABLE_SHAPES.has(os.shape)) continue;

    /**
     * The dwell the pointer was in when the page changed.
     *
     * ── THE POINTER DOES NOT MOVE AFTER A CLICK ─────────────────────────────
     * The first version of this looked for a dwell that had ENDED shortly
     * before the navigation, and found nothing, because that is not what
     * people do. You click a menu item and your hand stays still while the
     * page loads — so the dwell is still open when the navigation lands, and
     * often runs to the end of the recording. Measuring from `rest.end` put
     * the click seconds after the nav, or never.
     *
     * So the test is containment: the pointer had settled before the change
     * and had not left by the time it happened.
     */
    const rest = rests
      .filter((r) => !spent.has(r))
      .filter((r) => nav.t >= r.start + RULES.reactionMs[0] / 1000 && nav.t <= r.end + NAV_REACTION)
      // ── THE REST HAS TO BE FRESH ────────────────────────────────────────
      // A press and the change it causes are seconds apart at most. A pointer
      // that has been parked for half a minute while a dashboard loads itself
      // in stages did not click anything, and attributing one to it is how a
      // demo ends up with a ripple firing at nothing. Longer where the OS is
      // drawing a hand: that is a person hovering the thing they are about to
      // press, which is most of what a demo is.
      .filter((r) => nav.t - r.start <= (read ? REST_HOVER : REST_FRESH))
      // ── A PANE THAT CHANGED HAS TO BE THE ONE BESIDE THE HAND ───────────
      // The price of accepting a change that does not fill the frame. A rail
      // and the pane it drives are neighbours, so the pointer is on or beside
      // what changed; a chart redrawing itself across the screen from a parked
      // pointer is not, and that is the hover the camera used to push in on.
      .filter((r) => nav.whole || distanceTo(nav, r) <= RULES.clickRadius)
      .sort((a, b) => b.start - a.start)[0];
    if (!rest) {
      /**
       * ── THE CLICK NOBODY SAW, BECAUSE THE POINTER NEVER MOVED ────────────
       * The tracker sees a pointer only when it moves. A creator who puts the
       * mouse on "API Keys" before pressing record, and clicks it two seconds
       * in, gives it nothing to see: no sighting before the page changes, so no
       * rest, so no click — and the most important moment in the demo got no
       * zoom of its own. What the viewer saw instead was the model's planned
       * zoom arriving a second and a half after the page had already loaded.
       *
       * The pointer does not move after a click; the hand stays put while the
       * page loads. So where it is first seen once the page has settled is where
       * it was when it pressed — provided it is seen there twice, still, and
       * soon. confirmClicks() still decides whether that spot is a control.
       */
      const parked = settledAfter(pts, mot, nav.t);
      const beside = parked && (nav.whole || distanceTo(nav, parked) <= RULES.clickRadius);
      if (beside && !events.some((e) => (e.type === "click" || e.type === "dblclick") && Math.abs(e.t - nav.t) < 0.6)) {
        const at = Math.max(0, nav.t - 0.12);
        events.push(event("click", at, parked.x, parked.y, {
          confidence: 0.75,
          source: "parked",
          shape: parked.shape || "default",
          corroborated: true,
          scrolled: false,
          scroll_shift: 0,
        }));
        claim(at);
      }
      continue;
    }
    spent.add(rest);

    /**
     * ── THE SAME POINTER, THE SAME PLACE, THE SAME PAGE LOADING ─────────────
     * A page often arrives in two paints: the frame, then the data. If the
     * pointer was already credited with a click at this spot and has not moved
     * since, the second paint is that click still landing — not a second
     * press. Without this, one click on "API Keys" became two, and the one
     * that kept the zoom was the later one, two and a half seconds late.
     */
    const earlier = events.find((e) =>
      (e.type === "click" || e.type === "dblclick") &&
      e.t < nav.t && nav.t - e.t < 3 &&
      Math.hypot(e.x - rest.x, e.y - rest.y) < 0.03
    );
    if (earlier) { claim(nav.t); continue; }

    // The press is just before the change it caused, and inside the dwell.
    const at = clamp(nav.t - 0.12, rest.start, Math.max(rest.start, rest.end));
    if (events.some((e) => e.type === "click" && Math.abs(e.t - at) < 0.25)) continue;

    // A page that changed under a resting pointer is strong evidence on its
    // own; a hand cursor over the spot makes it near-certain.
    let confidence = 0.72;
    if (rest.shape === "pointer" || rest.shape === "hand") confidence += 0.2;
    if (rest.end - rest.start > 0.2) confidence += 0.06;

    // The nav that produced this was already checked for translation above, so
    // it is on the record as a press during a settled page rather than as one
    // with no opinion attached.
    // Where the hand was when it pressed, not where the dwell ended up.
    const spot = restAt(pts, rest, at);
    events.push(event("click", at, spot.x, spot.y, {
      confidence: clamp(confidence, 0, 1),
      source: "nav",
      shape: rest.shape || "default",
      corroborated: true,
      scrolled: false,
      scroll_shift: 0,
    }));
    claim(at);
  }

  // ── Clicks ────────────────────────────────────────────────────────────────
  for (const rest of rests) {
    if (spent.has(rest)) continue;
    const from = rest.start + RULES.reactionMs[0] / 1000;
    const to = rest.end + RULES.reactionMs[1] / 1000;

    let best = null;
    for (const m of mot) {
      if (m.t < from || m.t > to) continue;
      if (m.energy < RULES.noiseEnergy || m.energy > RULES.clickMaxEnergy) continue;
      if (isClaimed(m.t, 0.2)) continue;

      const near = distanceTo(m, rest);
      if (near > RULES.clickRadius) continue;
      const score = m.energy / (1 + near * 6);
      if (!best || score > best.score) best = { m, near, score };
    }
    if (!best) continue;

    // ── Confidence ────────────────────────────────────────────────────────
    // Three independent signals, each worth something on its own and none
    // conclusive. A hand cursor over the spot is the strongest: the OS only
    // draws it over something that responds to a click.
    let confidence = 0.45;
    if (rest.shape === "pointer" || rest.shape === "hand") confidence += 0.3;
    if (best.near < 0.06) confidence += 0.15;
    if (rest.end - rest.start > 0.25) confidence += 0.1;
    if (best.m.energy > 0.02) confidence += 0.05;

    /**
     * ── A PRESS HAPPENED WHEN IT LANDED, NOT WHEN THE HAND MOVED ON ─────────
     * This said `rest.end`, and `rest.end` is not when the press happened. It
     * is when the pointer NEXT MOVED — and after a click the hand stays put,
     * which is the one thing about pressing a button this file states outright
     * three separate times. The dwell is still open while the new screen
     * arrives, while the creator talks over it, until they finally reach for
     * the next control. On a pointer that never moves again it is the end of
     * the recording.
     *
     * So the zoom landed seconds after the thing it was meant to be showing.
     * Measured on a real recording: the creator pressed "Usage" in a settings
     * dialog at 21.58s, the pane changed at once, and the press was written
     * down at 24s — by which time the camera's move collided with the NEXT
     * click's and was merged away entirely. What the creator saw was a demo
     * that ignored the press and then zoomed on the one after it: "Zoom-in not
     * happened and not worked. but worked when i clicked [the next one]".
     *
     * The press is just before the change it caused, and inside the dwell it
     * was made during. That is the same rule the navigation branch above has
     * always used, and there was never a reason for the two to differ.
     */
    const at = clamp(best.m.t - 0.12, rest.start, Math.max(rest.start, rest.end));
    // And where the hand was at that moment, for the same reason.
    const spot = restAt(pts, rest, at);

    // One press, however many passes found it.
    if (events.some((e) => (e.type === "click" || e.type === "dblclick") && Math.abs(e.t - at) < 0.4 && Math.hypot(e.x - spot.x, e.y - spot.y) < 0.05)) continue;

    /**
     * Did anything come of it? A press is followed by a change bigger than the
     * one it made at the control itself — a menu opening, a panel filling, a
     * row appearing. A hover's highlight is the whole story, and stops there.
     *
     * Measured from the press, for the same reason: a window opening at
     * `rest.end` opens after the consequence it is looking for has come and
     * gone, and reads a real press as one that nothing came of.
     */
    const after = grewAfter(screen, mot, best.m, at);
    // Measured, not judged: confirmClicks() below decides what it means once
    // the model has said whether the pointer was on a control at the time.
    const slid = scrolledAfter(mot, at);
    events.push(
      event("click", at, spot.x, spot.y, {
        confidence: clamp(confidence * (after ? 1 : 0.8), 0, 1),
        shape: rest.shape || "default",
        corroborated: after,
        // After OR around: on one recording the creator's flick ended a tenth of
        // a second before the rest, so looking only forward saw nothing.
        //
        // And `sustained`, because both of those read `dy`, and a scrollbar
        // dragged to the bottom of a page reports no `dy` at all. A pointer
        // parked on the scrollbar while the page streams past it is the same
        // shape as a press — it rests, the screen changes beside it — and
        // without this it is minted as one.
        scrolled: slid >= SCROLL_SUM || scrollingAround(mot, at) || sustained(mot, best.m.t, best.m.energy),
        scroll_shift: round3(slid),
      })
    );
    spent.add(rest);
    claim(best.m.t);
    claim(at);
  }

  // ── Double clicks ─────────────────────────────────────────────────────────
  const clicks = events.filter((e) => e.type === "click").sort((a, b) => a.t - b.t);
  for (let i = 1; i < clicks.length; i++) {
    const a = clicks[i - 1];
    const b = clicks[i];
    if (b.t - a.t < RULES.doubleClickMs / 1000 && Math.hypot(b.x - a.x, b.y - a.y) < 0.02) {
      b.type = "dblclick";
      b.confidence = Math.max(a.confidence, b.confidence);
      a.drop = true;
    }
  }

  // ── Scrolls ───────────────────────────────────────────────────────────────
  // A tall changed region while the pointer is still. `dy` comes from the
  // tracker's row correlation, which is the one thing a frame difference can
  // say about direction.
  let run = [];
  const flushScroll = () => {
    if (run.length >= RULES.scrollMinSamples) {
      const mid = run[Math.floor(run.length / 2)];
      const dy = run.reduce((s, m) => s + m.dy, 0) / run.length;
      if (!isClaimed(mid.t, 0.3)) {
        events.push(event("scroll", mid.t, mid.x + mid.w / 2, mid.y + mid.h / 2, { dy, confidence: 0.7 }));
        for (const m of run) claim(m.t);
      }
    }
    run = [];
  };
  for (const m of mot) {
    const still = pointerStill(pts, v, m.t);
    if (still && m.h >= RULES.scrollMinHeight && m.energy > RULES.noiseEnergy && m.energy < RULES.scrollMaxEnergy) run.push(m);
    else flushScroll();
  }
  flushScroll();

  // ── Typing ────────────────────────────────────────────────────────────────
  // A caret advancing is a very small change in a short, wide band, repeating.
  // The text itself is not read here: the vision pass OCRs the field, which is
  // both more accurate and the only way to know what was typed rather than that
  // typing happened.
  run = [];
  const flushType = () => {
    if (run.length >= RULES.typeMinSamples) {
      const first = run[0];
      const last = run[run.length - 1];
      if (!isClaimed(first.t, 0.3)) {
        events.push(event("type", first.t, first.x + first.w / 2, first.y + first.h / 2, { confidence: 0.6 }));
        events.push(event("type_end", last.t, last.x + last.w / 2, last.y + last.h / 2, { confidence: 0.6 }));
        for (const m of run) claim(m.t);
      }
    }
    run = [];
  };
  for (const m of mot) {
    if (m.energy > RULES.noiseEnergy && m.energy < RULES.typeMaxEnergy && m.h < RULES.typeMaxHeight && pointerStill(pts, v, m.t)) run.push(m);
    else flushType();
  }
  flushType();

  // ── Idle ──────────────────────────────────────────────────────────────────
  for (const span of idleSpans(mot, pts, v, duration)) {
    events.push(event("idle", span.start, 0.5, 0.5, { confidence: 0.9, dy: round3(span.end - span.start) }));
  }

  return events
    .filter((e) => !e.drop && e.type !== "type_end")
    .sort((a, b) => a.t - b.t);
}

/**
 * Does the recording itself say the screen changed at this moment?
 *
 * Absent a reading (an older analysis, or a video that could not be re-read)
 * the answer is yes, and the browser's summary stands on its own as it always
 * did. This only ever removes a navigation nothing corroborates.
 */
/**
 * Whether something larger followed the little change under the pointer.
 *
 * Measured from the video where sync.js could read it, because that series has
 * the animations taken out; from the browser's own summary otherwise. Either
 * way the test is the same: within the window a press's consequence would land
 * in, was there a change several times the size of the one at the control?
 */
function grewAfter(screen, mot, at, t) {
  const from = t + 0.05;
  const to = t + CONSEQUENCE;
  const series = screen && screen.motion && screen.motion.length ? screen.motion : null;

  /**
   * ── THE SAME EVIDENCE, WHICHEVER WAY THE MOMENT WAS MEASURED ──────────────
   * "A big enough change is its own consequence" used to live only in the
   * branch below, the one that runs when the video could NOT be read. So on
   * every ordinary recording — where sync.js reads it fine — the only evidence
   * available was `cover`: one scalar, the share of the whole frame that
   * changed.
   *
   * That is the wrong instrument for half the presses in a product demo. A
   * page replacing a page covers the frame. A settings dialog swapping its
   * pane covers a fifth of it, and a dialog is where people keep the settings
   * worth demonstrating. One threshold cannot serve both, so tuning it for one
   * took the other away — which is exactly what the creator kept seeing:
   *
   *   "whenever I click on projects or any other tab the zoom is working ...
   *    but in the same screen recording when I click on the billing or usage
   *    the zoom is not happening ... if one thing is working the other thing
   *    is not working."
   *
   * The tracker's own bounding box does not have that problem: it says how big
   * the thing that changed WAS, not what share of the screen it happened to
   * occupy, and it is there in both cases. So the test is asked first, of the
   * same evidence, whichever branch is about to run.
   */
  /**
   * ── AND IT IS NOT A CONSEQUENCE IF IT WAS GOING TO HAPPEN ANYWAY ──────────
   * Both tests above read the BROWSER TRACKER's motion log, which is a single
   * bounding box around everything that changed and knows nothing about what
   * was merely animating. sync.js measures exactly that — readGrids() marks a
   * cell as busy when it changes through most of a window, which a playing
   * video does in every frame — and the two shortcuts here were returning true
   * before that reading was ever consulted.
   *
   * The result, on a real recording: a landing page with a product video
   * autoplaying on it. The video clears both bars on its own, every frame, so
   * every pointer rest anywhere near it was "corroborated" and the camera
   * pushed into a video nobody had pressed. Worse than the bad zoom itself, it
   * spent the demo's zoom budget (restToFull, capZoomed), so the real click on
   * "Pricing" a second later had nothing left to spend.
   *
   * The animation detection was correct and computed and simply not asked. It
   * is asked now, of the area that changed rather than of a point, because a
   * video is not a point. See sync.js busyShare.
   */
  const selfMoving = busyShare(screen, num(at.t), at);
  if (selfMoving < MOSTLY_ANIMATION) {
    if (num(at.energy) >= CONSEQUENCE_ALONE) return true;
    if (num(at.w) * num(at.h) >= CONSEQUENCE_AREA) return true;
  }

  if (series) {
    const here = nearest(series, at.t);
    const base = Math.max(0.01, here ? here.cover : 0.01);
    // The video's own reading, which has the animations discounted, can still
    // clear the bar on its own where the tracker's box did not.
    if (here && here.cover >= CONSEQUENCE_ALONE) return true;
    for (const m of series) {
      if (m.t < from || m.t > to) continue;
      const floor = m.t > t + CONSEQUENCE_PROMPT ? CONSEQUENCE_LATE : 0.05;
      if (m.cover >= base * CONSEQUENCE_GROWTH && m.cover >= floor) return true;
    }
    return false;
  }

  /**
   * The rule below looks for something bigger AFTER the press than the press
   * itself made, because the shape it was written for is a button darkening
   * and then a panel opening. Half the interfaces people demo do not work that
   * way: pressing a row in a sidebar swaps the whole content area in the very
   * same frame, and there is nothing afterwards at all.
   *
   * Measured on a real recording: the creator pressed "Calendar", a fifth of
   * the screen changed on that frame, and the next three and a half seconds
   * were perfectly still while the new view loaded. The rule read that as
   * "nothing came of it", threw the press away, and the zoom went instead to a
   * phantom press minted when the page finally finished drawing — four and a
   * half seconds late. That is the "zoom-in delay" a creator sees.
   *
   * That case is now answered above, for both branches. What is left here is
   * the original relative test, for a press whose own frame was small.
   */
  const base = Math.max(RULES.noiseEnergy, at.energy);
  for (const m of mot) {
    if (m.t < from || m.t > to) continue;
    if (m.t > t + CONSEQUENCE_PROMPT && m.energy < CONSEQUENCE_LATE_ENERGY) continue;
    if (m.energy >= base * CONSEQUENCE_GROWTH) return true;
  }
  return false;
}

function nearest(series, t) {
  let best = null;
  for (const m of series) {
    if (!best || Math.abs(m.t - t) < Math.abs(best.t - t)) best = m;
  }
  return best;
}

function screenAgrees(screen, t, box = null) {
  const series = screen && screen.motion;
  if (!series || !series.length) return true;
  /**
   * ── THE LARGEST CHANGE IN THE WINDOW, NOT THE NEAREST SAMPLE ─────────────
   * The video is read as frame-to-frame differences, and a page replacing
   * itself is ONE frame of difference: the frame after it is already the new
   * page, and differs from its predecessor by almost nothing. So the nearest
   * sample to the browser's timestamp is the change about half the time and
   * the quiet frame right after it the other half.
   *
   * On one recording the browser saw "API Keys" open at 3.74s. The video saw
   * it at 3.67s, with a third of the screen changing — and the sample nearest
   * 3.74 was 3.75, with 0.2%. The navigation was vetoed, the click that caused
   * it was never found, and the zoom came from something else a second and a
   * half later. The question is whether the video saw a big change around
   * this moment, so that is what is asked.
   */
  let seen = false;
  let most = 0;
  for (const m of series) {
    if (Math.abs(m.t - t) > 0.25) continue;
    seen = true;
    most = Math.max(most, num(m.cover, 0));
  }
  if (!seen) return true;
  if (most >= RULES.navCover) return true;
  /**
   * ── AND A SMALL SURFACE COVERS A SMALL SHARE OF THE SCREEN ────────────────
   * `cover` is the share of the WHOLE FRAME the video saw change, so it asks a
   * page-sized question. A dialog that navigates its own pane can only ever
   * answer it with a small number, however completely it changed — and being
   * vetoed here is the same "one thing works, the other stops" the consequence
   * test above had. Scaled against what actually changed rather than against
   * the frame, a pane swap clears the same bar a page swap does.
   */
  const area = num(box && box.w) * num(box && box.h);
  return area > 0 && most >= RULES.navCover * area;
}

/**
 * ── A SCROLL IS A RUN ────────────────────────────────────────────────────────
 * The first version of this asked which way the page moved overall, and
 * called it a scroll only when nearly every shift agreed on a direction. A
 * creator who scrolls down and then straight back up moves the page fourteen
 * times with a net movement of nothing — coherence 0.01 — and that "page
 * change" minted a click and a zoom at the very start of a demo.
 *
 * What a scroll has that nothing else has is a RUN: several frames in a row,
 * each moved the same way as the one before. A page loading wobbles as its
 * layout settles, and a real click on "API Keys" measured a longest run of 4.
 * Every scroll measured in the same recordings ran 6, 7 and more. A run of
 * five is the line, and a long one-directional drift still counts as well.
 */
const SCROLL_RUN = 5;
const SCROLL_FRAMES = 5;
const SCROLL_COHERENCE = 0.85;

function scrollingAround(mot, t) {
  let n = 0;
  let abs = 0;
  let net = 0;
  let run = 0;
  let longest = 0;
  let sign = 0;
  for (const m of mot) {
    if (m.t < t - 0.4) continue;
    if (m.t > t + 1.4) break;
    const dy = num(m.dy, 0);
    if (Math.abs(dy) < SCROLL_SHIFT) { run = 0; sign = 0; continue; }
    const sg = Math.sign(dy);
    run = sg === sign ? run + 1 : 1;
    sign = sg;
    longest = Math.max(longest, run);
    n++;
    abs += Math.abs(dy);
    net += dy;
  }
  if (longest >= SCROLL_RUN) return true;
  return n >= SCROLL_FRAMES && abs >= SCROLL_SUM && Math.abs(net) / abs >= SCROLL_COHERENCE;
}

/**
 * Is this moment a STEP in the picture, or part of a RUN?
 *
 * ── THE ONE SCROLL TEST THAT DOES NOT DEPEND ON `dy` ────────────────────────
 * Everything else here asks the tracker how far the page slid. That question
 * has a ceiling built into it — see the note at the call site — and the answer
 * degrades towards "it did not slide" exactly as the scroll gets bigger, which
 * is the worst possible failure direction for a veto.
 *
 * This asks a question with no ceiling: for how long did the picture keep
 * changing? Nothing about it cares which way the content went, how far, or
 * whether the tracker could follow it.
 *
 *   a new screen   one frame differs; the next frame IS the new screen and
 *                  differs from it by almost nothing
 *   a scroll       every frame differs, for as long as the hand keeps going
 *
 * ── WHY THE FLOOR IS RELATIVE ───────────────────────────────────────────────
 * A fixed floor would make this a tuning problem — the share of pixels a
 * scroll changes depends entirely on how busy the page is. Measured against
 * the candidate's own size it does not: the frames either side of a scroll are
 * the same order of magnitude as the one in the middle, because they are the
 * same scroll; the frames either side of a navigation are a repaint of nothing.
 *
 * On two real recordings: presses that changed the screen scored 0.04, and
 * scrolling to the bottom of a dashboard scored 0.40 and 0.46. There is an
 * order of magnitude between them and the line is drawn in the gap.
 */
const RUN_SHARE = 0.35;
/** How much of a second either side is read. */
const RUN_BEFORE = 0.35;
const RUN_AFTER = 0.65;
/** A neighbouring frame counts as "still changing" at this much of the candidate. */
const RUN_RELATIVE = 0.2;

function sustained(mot, t, energy) {
  const floor = Math.max(RULES.noiseEnergy, num(energy) * RUN_RELATIVE);
  let n = 0;
  let changing = 0;
  for (const m of mot) {
    if (m.t < t - RUN_BEFORE) continue;
    if (m.t > t + RUN_AFTER) break;
    n++;
    if (num(m.energy) >= floor) changing++;
  }
  // Too few samples to say. A recording that thin has nothing to protect.
  if (n < 6) return false;
  return changing / n >= RUN_SHARE;
}

/** How soon after a page changes the pointer must be found again. */
const SETTLE_WITHIN = 2.0;
/** Two sightings this close are the same resting place. */
const SETTLE_SAME = 0.025;
/** And they must be this close in time to count as one rest. */
const SETTLE_GAP = 0.9;

/**
 * Where a pointer that was not seen pressing is first seen at rest afterwards.
 *
 * Only for a pointer that was genuinely still beforehand: if it had been seen
 * moving in the moment before the page changed, it was not parked, and the
 * ordinary rules already had their chance.
 */
function settledAfter(pts, mot, t) {
  if (pts.some((p) => p.t < t && p.t > t - 0.6)) return null;
  /**
   * ── A LOCATED SIGHTING NEEDS NO STILL SCREEN ──────────────────────────────
   * The screen has to be quiet for a TRACKER sighting to mean anything: during
   * a repaint the difference tracker reports the repaint, so a sample taken
   * then is the page, not the pointer. That test is why the most important
   * press in one recording was thrown away — the creator clicked "API Keys",
   * the page spent a second and a half drawing itself, and every sighting of
   * the pointer sitting on the item it had just pressed was discarded for
   * arriving during the change it caused.
   *
   * A located sighting is not an inference from movement. It is the pointer,
   * matched by its own shape in that frame, and a page repainting around it
   * does not make it less true.
   */
  const quiet = (p) => {
    if (p.located) return true;
    let best = null;
    for (const m of mot) {
      const d = Math.abs(m.t - p.t);
      if (!best || d < best.d) best = { d, m };
    }
    return !best || best.d > 0.1 || num(best.m.energy) <= 0.03;
  };
  // The FIRST sighting has to come soon; the one that confirms it may come a
  // moment later. Requiring both inside the window missed a real click by a
  // hundredth of a second.
  const after = pts.filter((p) => p.t > t && quiet(p));
  for (let i = 0; i + 1 < after.length; i++) {
    const a = after[i];
    if (a.t > t + SETTLE_WITHIN) break;
    const b = after[i + 1];
    if (b.t - a.t > SETTLE_GAP) continue;
    if (Math.hypot(b.x - a.x, b.y - a.y) > SETTLE_SAME) continue;
    return a;
  }
  return null;
}

function event(type, t, x, y, extra = {}) {
  return {
    id: newId("e"),
    t: round3(Math.max(0, t)),
    type,
    x: round4(frac(x, 0.5)),
    y: round4(frac(y, 0.5)),
    dy: 0,
    text: "",
    confidence: 0.5,
    source: "pixel",
    ...extra,
  };
}

/**
 * Where the pointer was AT a moment, rather than where its dwell ended.
 *
 * ── A DWELL'S POSITION IS ITS LAST SAMPLE, AND A PRESS IS NOT ITS LAST ──────
 * dwells() records a dwell at the position of its LAST sample, deliberately:
 * the pointer decelerates into place, so the early samples of a short dwell
 * are a few pixels short of where it actually stopped.
 *
 * That reasoning holds for a dwell that is a pause. It breaks for a dwell that
 * is a stay — and after a press the hand stays, which is the whole reason the
 * press's TIME had to stop being `rest.end` too. The dwell runs on while the
 * new screen arrives and the creator drifts the pointer towards whatever they
 * mean to do next, and its "position" follows them there. So the press was
 * filed at the place the hand ended up, not the place it pressed.
 *
 * Measured on a real recording: the creator pressed "Usage" in a settings rail
 * at (0.22, 0.35), and the camera pushed in on (0.78, 0.81) — "Adjust limit",
 * at the opposite corner of the dialog, where the hand had wandered while the
 * pane loaded. "why the hell Zoom-in or camera moved to the right bottom of
 * this screen?"
 *
 * The press happened at a moment. The pointer was somewhere at that moment.
 * That is the position, and nothing later gets a vote.
 */
function restAt(pts, rest, t) {
  const until = Math.min(num(t), num(rest.end, t)) + 0.05;
  let best = null;
  for (const p of pts) {
    if (p.t < rest.start - 0.05) continue;
    if (p.t > until) break;
    best = p;
  }
  // A blind dwell — a hole in the track — has no samples inside it at all, and
  // the dwell already carries the last place the pointer was seen before it.
  return best ? { x: best.x, y: best.y } : { x: rest.x, y: rest.y };
}

/** How far a changed region is from where the pointer was resting. 0 when over it. */
function distanceTo(m, rest) {
  const dx = Math.max(m.x - rest.x, 0, rest.x - (m.x + m.w));
  const dy = Math.max(m.y - rest.y, 0, rest.y - (m.y + m.h));
  return Math.hypot(dx, dy);
}

function pointerStill(pts, v, t) {
  if (!pts.length) return true;
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].t <= t) lo = mid;
    else hi = mid;
  }
  return v[lo] <= RULES.stillSpeed * 2;
}

/** Stretches where the screen did not change and the pointer did not move. */
function idleSpans(mot, pts, v, duration) {
  const spans = [];
  let open = null;
  for (const m of mot) {
    const quiet = m.energy < RULES.noiseEnergy && pointerStill(pts, v, m.t);
    if (quiet) {
      if (!open) open = { start: m.t, end: m.t };
      else open.end = m.t;
    } else if (open) {
      if (open.end - open.start >= RULES.idleMs / 1000) spans.push(open);
      open = null;
    }
  }
  if (open && open.end - open.start >= RULES.idleMs / 1000) spans.push(open);
  return spans.map((s) => ({ start: round3(s.start), end: round3(Math.min(s.end, duration || s.end)) }));
}

/* ────────────────────────────────────────────────────────────────────────────
   What the events say about the edit
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Cuts proposed from the pointer log alone, before the model has seen anything.
 *
 * These are the uncontroversial ones: the screen did not change and nobody
 * moved. The model finds the subtler dead air (a spinner, a repeated action);
 * this finds the four seconds where the creator was reading their notes, and it
 * finds it for free.
 *
 * The edges are held back so a cut never lands on the frame where something
 * started happening again.
 */
export function idleCuts(events, { duration = 0, minSeconds = 1.6, pad = 0.35 } = {}) {
  return events
    .filter((e) => e.type === "idle" && e.dy >= minSeconds)
    .map((e) => {
      const start = e.t + pad;
      const end = Math.min(duration || Infinity, e.t + e.dy - pad);
      return end - start > 0.4
        ? { id: newId("cut"), start: round3(start), end: round3(end), reason: "idle", auto: true }
        : null;
    })
    .filter(Boolean);
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * THE CLICK CAMERA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * This is the shape of the move, and it is the whole product:
 *
 *     full frame ──ease in──► [ CLICK ] ──snap out──► full frame
 *                  ~0.5s        held        ~0.2s
 *                             0.3s
 *
 * The camera is settled on the target BEFORE the pointer reaches it, so the
 * viewer sees the button, sees the pointer arrive, and sees it pressed. The
 * instant the press lands the camera leaves, because what the click produced —
 * a page, a menu, a dialog — is the next thing worth seeing and it needs the
 * whole frame.
 *
 * ── WHAT THE FIRST VERSION GOT WRONG ─────────────────────────────────────────
 * Three things, all visible frame by frame in a real export:
 *
 *   1. The rect did not contain the click. It was built as a fixed 0.28 × 0.2
 *      box offset from the pointer and then clamped into frame, so a click near
 *      an edge — which is where navigation lives, and navigation is what people
 *      click — ended up outside the crop. The recording showed eleven seconds
 *      of a left nav being clicked with the left nav cropped off.
 *   2. It held for most of a second after the press, so the result of the click
 *      played out inside a crop of the previous screen.
 *   3. Consecutive zooms merged into one another with no gap, so the camera
 *      never returned to the full frame at all and the "zoom" was a static
 *      crop for the length of the demo.
 *
 * So the rect is now DERIVED FROM the click rather than merely near it: the
 * click is the centre, and `containing()` below guarantees it stays inside
 * after clamping, whatever the level or the edge.
 */

/**
 * ── THE NUMBERS, AND WHY THEY ARE NOT SMALLER ────────────────────────────────
 * The first attempt at this read the brief "zoom out the instant the click
 * happens" literally: settled 0.15s early, held 0.3s, left over 0.2s on a
 * snappy curve. On paper that is exactly what was asked for. On screen it is a
 * flash — six frames of movement with a page change happening inside them, so
 * the camera move and the cut land at the same instant and the eye reads one
 * event, not two. Nothing looks clicked; the screen just becomes another screen.
 *
 * A click has to be READABLE, which takes three separate beats:
 *
 *   arrive   the camera is there before the pointer is, and settled enough
 *            that the viewer's eye has found the target
 *   press    the pointer is on the target, the ripple fires, the interface
 *            responds — all of it while still zoomed in
 *   leave    a move the eye can follow, not a jump cut
 *
 * "Immediately" means the camera does not LINGER after the press. It does not
 * mean the exit takes six frames. So the hold covers the press and the start of
 * the response, and the exit is smooth and roughly as long as the entrance.
 */
/** Fully zoomed this long before the press, so the camera has settled. */
const SETTLE = 0.3;
/** Held after the press: the ripple, and the interface beginning to respond. */
const HOLD = 0.55;
/** How long the camera takes to leave. Long enough to be a move, not a cut. */
const RAMP_OUT = 0.42;
/** Two clicks closer than this are one move; further apart, the camera resets. */
const MERGE = 1.6;
/**
 * The widest a merged zoom may get before the merge is abandoned.
 *
 * 0.62 of the frame is about 1.6x, which is the shallowest move that still
 * reads as the camera choosing something.
 */
const MERGE_MAX = 0.62;
/**
 * The same, for two presses the step detector puts in the same step.
 *
 * Only ever used when the steps exist, which means the model pass has run. A
 * step is a claim that these presses are one thing the viewer is watching, and
 * it is a far better reason to hold the shot than a gap measured on a clock.
 * MERGE_MAX still applies, so a step whose presses are spread across the screen
 * still gets more than one shot rather than one shot of the whole screen.
 */
const MERGE_IN_STEP = 3.2;

/**
 * ── WAS IT A CONTROL, OR WAS IT JUST SOMEWHERE? ──────────────────────────────
 * Everything above this line is pixels. It can tell that the pointer stopped
 * and that the screen changed, and from those two facts alone it cannot tell a
 * press from a person putting the mouse down to read with.
 *
 * People click on nothing all the time. It is a habit, not an intention: a tap
 * on white space to dismiss a menu, to focus the window, to park the hand. A
 * demo that zooms into the middle of a paragraph because somebody tapped there
 * does not look clever, it looks broken — and it spends the zoom budget that
 * the one click that mattered needed.
 *
 * The model has already read every sampled frame and named what was on it, with
 * a box around each control. So the question can simply be asked: at the moment
 * of this press, was the pointer on something a person can press?
 *
 * ── WHAT THIS FUNCTION MAY AND MAY NOT DO ────────────────────────────────────
 * It may withhold the CAMERA. It may not delete the event. A click this
 * function rejects still happened as far as anything else is concerned — it
 * keeps its ripple, it stays in the editor, and the creator can turn the zoom
 * back on. The camera is an editorial decision and is allowed to be
 * conservative; the record of what the pointer did is not.
 *
 * ── AND IT ONLY RULES WHERE IT HAS EVIDENCE ──────────────────────────────────
 * The vision pass samples frames every few seconds, and any one of them can
 * come back empty. "No control found near this click" therefore has two very
 * different meanings: the model looked and there was nothing there, or the
 * model never looked. Only the first is a reason to withhold anything. Where
 * there is no evidence either way the click keeps whatever the pixels earned
 * it, which is what the whole pipeline did before this function existed.
 */

/** Element types a person can actually press. The rest are surfaces. */
const PRESSABLE = new Set([
  "button", "icon_button", "link", "nav_item", "tab", "list_item",
  "text_field", "dropdown", "checkbox", "toggle", "menu",
  "browser_tab", "browser_url",
]);

/**
 * Things that CONTAIN controls rather than being one.
 *
 * ── WHY THESE MATTER MORE THAN THE CONTROLS DO ──────────────────────────────
 * Asked to describe a frame in at most twenty-five elements, the model will
 * sometimes answer "there is a sidebar here" and leave it at that. Tested on a
 * real frame it did exactly that: ten elements, of which the entire left
 * navigation — six items, one of which the creator was pointing at — was a
 * single box labelled "sidebar".
 *
 * Read naively that means "the pointer was not on a control", and the most
 * important click in the demo loses its zoom. But the model did not look at
 * those six items and decide none was under the pointer; it never broke them
 * out in the first place. That is absence of evidence, and this function's
 * whole contract is that it only rules where it has some.
 *
 * So a press inside one of these, with nothing enumerated within it, is
 * reported as "nobody looked" rather than "nothing there".
 */
const CONTAINER = new Set([
  "sidebar", "toolbar", "menu", "table", "list", "card", "modal", "dialog",
  "nav", "tab_bar", "empty_state",
]);

/** How far from a frame the model read a click may be and still be judged by it. */
const SEEN_WITHIN = 1.4;
/**
 * How far outside a control's box the pointer may be and still be on it.
 *
 * ── THE MODEL KNOWS WHAT, NOT EXACTLY WHERE ─────────────────────────────────
 * Generous, and deliberately so. Asked to box the items in a left navigation
 * rail, the model named all six correctly and placed them about a twentieth of
 * a frame to the right of where they actually were — and put one of them near
 * the bottom of the screen when it was at the top. The labels were right every
 * time; the geometry was approximately right.
 *
 * That is the tool being used for what it is good at. A vision model reading a
 * screenshot is an excellent judge of WHAT is on it and a rough judge of
 * exactly WHERE, and a hit test built on strict containment throws the first
 * away because of the second. With this tolerance the press that matters lands
 * on its nav item, and a press in the middle of an empty content pane — a third
 * of a frame from the nearest control — still lands on nothing, which is the
 * distinction the whole gate exists to draw.
 */
const EDGE_SLOP = 0.06;
/**
 * A "button" filling a third of the screen is a mislabelled panel. Counting it
 * would let one bad box wave every click through.
 */
const CONTROL_MAX_AREA = 0.2;

/**
 * What the pointer was on when it pressed, or null when nobody looked.
 *
 * @returns {{ label, type, area } | false | null}
 *          the control, false for "looked and found nothing", null for no frame
 */
/**
 * The horizontal extent of a vertical list of nav items, or null when the
 * items run across rather than down (a top bar is found by column, not row).
 */
function navColumn(els) {
  const rows = els.filter((e) => String(e.type) === "nav_item" && Array.isArray(e.bbox) && e.bbox[2] > 0 && e.bbox[3] > 0);
  if (rows.length < 3) return null;
  const cx = rows.map((e) => e.bbox[0] + e.bbox[2] / 2);
  const cy = rows.map((e) => e.bbox[1] + e.bbox[3] / 2);
  const spread = (v) => Math.max(...v) - Math.min(...v);
  if (spread(cy) < spread(cx) * 2) return null;
  /**
   * ── AND IT STOPS WHERE THE PAGE STARTS ─────────────────────────────────
   * The model's sidebar boxes sit about a tenth of the frame too far right, so
   * their right edges reach into the page content. Taken as the column's edge,
   * that made a pointer resting on the billing page count as being "on Spend"
   * in the sidebar, and a scroll there produced a sidebar click. The model
   * places the page's own elements accurately, so the first of those to the
   * right of the list is where the list ends.
   */
  const lefts = rows.map((e) => e.bbox[0]).sort((a, b) => a - b);
  const listLeft = lefts[Math.floor(lefts.length / 2)];
  const page = els
    .filter((e) => Array.isArray(e.bbox) && !["nav_item", "sidebar", "avatar"].includes(String(e.type)))
    .map((e) => e.bbox[0])
    .filter((x) => x >= listLeft + 0.05);
  const right = Math.max(...rows.map((e) => e.bbox[0] + e.bbox[2]));
  return {
    x0: Math.max(0, Math.min(...lefts) - EDGE_SLOP),
    x1: page.length ? Math.min(right, Math.min(...page) - 0.005) : right,
  };
}

export function controlUnder(shots, t, x, y) {
  let looked = false;
  let best = null;
  let bestArea = Infinity;

  for (const shot of shots || []) {
    if (Math.abs(num(shot.t) - t) > SEEN_WITHIN) continue;
    const els = shot.elements || [];
    // A frame with no pressable element on it at all is a frame the model did
    // not really read. Counting it as evidence of absence would reject every
    // click in a recording the vision pass failed on.
    if (!els.some((e) => PRESSABLE.has(String(e.type)))) continue;
    looked = true;

    const column = navColumn(els);
    for (const el of els) {
      if (!PRESSABLE.has(String(el.type))) continue;
      let [ex, ey, ew, eh] = el.bbox || [];
      if (!(ew > 0) || !(eh > 0)) continue;
      const area = ew * eh;
      if (area > CONTROL_MAX_AREA) continue;
      /**
       * ── A SIDEBAR ROW IS FOUND BY ITS ROW ──────────────────────────────
       * Asked to box a left navigation, the model gets every label and every
       * row's height right and the horizontal placement wrong: it put "API
       * Keys" at x = 0.12 when the row starts at 0.015, so a pointer resting
       * on the item was 0.08 away from its box and the item's own click read
       * as "not on a control". In a vertical list the row is what identifies
       * the item, so the box is widened to the whole column the list occupies.
       */
      if (column && String(el.type) === "nav_item") {
        // Past the column's right edge is the page, not the list: no slack.
        if (x > column.x1) continue;
        ex = column.x0;
        ew = column.x1 - column.x0;
      }
      // Distance from the point to the box, zero when inside it.
      const dx = Math.max(ex - x, 0, x - (ex + ew));
      const dy = Math.max(ey - y, 0, y - (ey + eh));
      const off = Math.hypot(dx, dy);
      if (off > EDGE_SLOP) continue;
      /**
       * Containment beats proximity, and among equals the smaller box wins:
       * the smallest thing containing the point is the control, and the bigger
       * ones around it are the row, the group and the panel it sits in.
       */
      const rank = off * 10 + area;
      if (rank < bestArea) {
        bestArea = rank;
        best = {
          label: String(el.label || ""),
          type: String(el.type),
          area: round4(area),
          off: round4(off),
          /**
           * ── THE BOX, KEPT, BECAUSE THE CAMERA WANTS IT ────────────────────
           * Until now this function answered a yes/no question — was the
           * pointer on something — and threw the rectangle away. The rectangle
           * is the more valuable half: a zoom built from a click COORDINATE is
           * a fixed box around a point, and a zoom built from the control's own
           * box frames the control. That is the difference between framing "API
           * Keys" and framing a patch of sidebar that happens to contain it.
           *
           * The WIDENED box is what is kept for a nav item, deliberately. The
           * model places a vertical list about a twentieth of a frame to the
           * right of where it really is (see above), so its own box is the one
           * we know to be wrong horizontally, and the column is the one we
           * believe covers the item.
           */
          bbox: clampRect({ x: ex, y: ey, w: ew, h: eh }),
        };
      }
    }
  }

  if (best) return best;
  if (!looked) return null;

  // Nothing pressable was found here. Before calling that a miss, check whether
  // the point is inside something the model described but did not open up.
  for (const shot of shots || []) {
    if (Math.abs(num(shot.t) - t) > SEEN_WITHIN) continue;
    for (const el of shot.elements || []) {
      if (!CONTAINER.has(String(el.type))) continue;
      const [ex, ey, ew, eh] = el.bbox || [];
      if (!(ew > 0) || !(eh > 0)) continue;
      if (x >= ex && x <= ex + ew && y >= ey && y <= ey + eh) return null;
    }
  }
  return false;
}

/**
 * The pointer's shape, decided the way the operating system decides it.
 *
 * ── THE CREATOR'S RULE, FINALLY IMPLEMENTABLE ────────────────────────────────
 * "A click only happens when hover happens, it turns into a hand shaped icon,
 * then the user clicks it." That is exactly right, and it was not possible to
 * act on until now, because the shape the tracker reports is not the shape of
 * the cursor. It classifies the DENSITY of the patch of pixels that changed, so
 * a compact spinner reads as "pointer" and a still cursor over a nav item that
 * highlights underneath it reads as "default" — backwards on precisely the
 * moments that matter.
 *
 * An operating system does not classify pixels. It draws a hand because the
 * thing under the pointer is clickable, and that is a fact about the interface
 * which the model has now written down. So the shape is taken from the same
 * evidence the camera uses.
 *
 * ── WHY IT SHOWS UP AS A SECOND CURSOR ───────────────────────────────────────
 * The drawn pointer is larger than the captured one specifically so that it
 * covers it. Covering is a property of the silhouette, not of the area: an
 * arrow drawn over a hand leaves the hand's fingers sticking out to the right,
 * and what a viewer sees is not "the wrong icon", it is a small second cursor
 * next to the big one. A frame of one export shows exactly that — our arrow on
 * the Billing item with the real hand still visible beside it.
 */
export function shapeFromControls(track, shots) {
  if (!shots || !shots.length) return track || [];
  return (track || []).map((p) => {
    // A text caret is a real reading of a real shape and is left alone; it is
    // the arrow-or-hand decision that the blob classifier cannot make.
    if (p.shape === "text") return p;
    const on = controlUnder(shots, num(p.t), num(p.x, 0.5), num(p.y, 0.5));
    return { ...p, shape: on ? "pointer" : "default" };
  });
}

/**
 * ── THE POINTER MAY NOT GO ANYWHERE IT DOES NOT STAY ─────────────────────────
 * Every fix to the drawn pointer so far has named a cause: the spinner steals
 * it, the repaint steals it, the compression artefact steals it. Each one was
 * real and each one was fixed, and the creator's answer was the right one:
 *
 *   "it's not about the loader or spinner... for some user maybe some element
 *    may cause this mouse to spin or hover around it, we should solve this
 *    globally so that never happens."
 *
 * That is a request for an invariant rather than another special case, and
 * there is one available that needs to know nothing about what caused a
 * deviation:
 *
 *   The drawn pointer only moves somewhere it then REMAINS.
 *
 * A hand that moves a mouse to a place either stays there or carries on past
 * it. It does not visit a point for a tenth of a second and return to exactly
 * where it started. Every artefact this pipeline has ever drawn has been that
 * shape — an excursion — and every real movement has not, whatever produced it.
 *
 * ── WHY IT IS NOT JUST A SMOOTHING FILTER ────────────────────────────────────
 * Smoothing averages an excursion into the path, which drags the pointer
 * partway towards the spinner and back: less obviously wrong, still wrong, and
 * now wrong everywhere instead of somewhere. This does not average. It decides
 * whether the evidence is good enough to move at all, and when it is not, the
 * pointer holds exactly where it was. A held pointer is invisible. A pointer
 * that wanders is the bug.
 */

/** How long a dart has to come back within to count as one. */
const STAY = 0.22;
/**
 * A move smaller than this is the hand, and is always followed.
 *
 * ── THE FIRST VERSION HELD FAR TOO MUCH ─────────────────────────────────────
 * It refused any move under 0.02 of the frame — thirty-eight pixels on a 1920
 * recording — on the theory that small moves were noise. They were not. They
 * were the creator sliding the last few pixels onto "API Keys" and stopping,
 * and our pointer stayed where they had been. Measured across one recording
 * the drawn pointer sat 33 pixels from the real one on average, and the real
 * hand showed beside ours for the whole of the zoom. A pointer that follows
 * every real move is covered by ours by construction; only the dart is wrong.
 */
const DART = 0.03;
/** Coming back within this of where it left from is a return. */
const BACK = 0.012;

export function steadyPath(track, { sourceWidth = 1920, sourceHeight = 1080 } = {}) {
  if (!track || track.length < 3) return track || [];
  const ratio = sourceHeight / Math.max(1, sourceWidth);
  const apart = (a, b) => Math.hypot(num(b.x) - num(a.x), (num(b.y) - num(a.y)) * ratio);

  const out = [track[0]];
  let held = track[0];

  for (let i = 1; i < track.length; i++) {
    const p = track[i];
    if (apart(held, p) < DART) { held = p; out.push(p); continue; }

    // A big move. If the path comes back to where it left from inside the
    // window, it was an excursion and nothing is drawn; otherwise it is real,
    // whether it stopped somewhere new or is travelling on through.
    let returns = false;
    for (let j = i + 1; j < track.length; j++) {
      const q = track[j];
      if (num(q.t) - num(p.t) > STAY) break;
      if (apart(held, q) <= BACK) { returns = true; break; }
    }
    if (returns) { out.push({ ...p, x: held.x, y: held.y }); continue; }

    held = p;
    out.push(p);
  }
  return out;
}

/**
 * Kept as a named step so the pipeline reads the same, but it no longer moves
 * anything.
 *
 * ── WHY THE LOCK WAS REMOVED ─────────────────────────────────────────────────
 * It held the pointer at the FIRST position seen on a control until the hand
 * moved a twentieth of the frame away, to stop a resting hand's wobble pulling
 * ours off the real one. The wobble was never the problem: while a real
 * pointer rests the tracker cannot see it at all, so ours already holds at the
 * last sighting, which is where the real one is. What the lock did instead was
 * pin ours to the spot the hand ENTERED the control, nine pixels from where it
 * stopped, and keep it there after the hand had left — 78 and 109 pixels
 * behind on the way out. That is the real hand showing beside ours.
 */
export function restOnControls(track) {
  return track || [];
}

/**
 * ── THE OPERATING SYSTEM ALREADY KNOWS WHAT IS CLICKABLE ─────────────────────
 * The whole question confirmClicks() exists to answer — was there something
 * pressable under the pointer? — has been answered on screen, in every frame,
 * by the machine that drew the pointer. A hand is drawn over a link, a button,
 * a menu row; a plain arrow is drawn over a heading, a panel, a margin, an
 * empty half of a page that is still loading. No model is needed and no site
 * has to be recognised: it is the same rule on every page ever rendered.
 *
 * It was not usable until the pointer could be found by its shape, because the
 * only shape available came from the difference tracker, which classifies the
 * DENSITY of the patch of pixels that changed and reads a spinner as a hand.
 * locate.js reads the actual glyph, so this is now the strongest evidence the
 * pipeline has about a press, and the cheapest — it costs nothing and needs no
 * Gemini call, which matters on the day the credits run out.
 *
 * ── WHY A MOMENT OF HAND IS NOT ENOUGH ──────────────────────────────────────
 * Sweeping the pointer across a page flickers through every link on the way.
 * On one recording a press was minted while the pointer was passing over a
 * link on its way somewhere else — one frame of hand in twenty — and the
 * camera pushed in on nothing. A real press is made by a pointer that arrived,
 * stopped, and was shown a hand the whole time it sat there. So the shape is
 * the one that held AT THE PLACE THE PRESS LANDED, not the one in a single
 * frame.
 */
export const CLICKABLE_SHAPES = new Set(["pointer", "hand", "text"]);

/** A press has to land within this of a located sighting for one to describe it. */
const SHAPE_REACH = 0.35;
/** How much either side of the press is read. */
const SHAPE_WINDOW = 0.6;
/** Sightings this close to the press's own position are the same resting place. */
const SHAPE_SAME = 0.025;
/** How much of that time the shape has to have held to count as settled. */
const SHAPE_SHARE = 0.6;
/**
 * And how many sightings that share has to be drawn from.
 *
 * One frame is not a reading. A pointer crossing a page at speed is over a
 * link for a frame at a time and off it again, and both the hand and the arrow
 * mean nothing there — it was not resting anywhere, so it was not pressing
 * anything either. Below this the answer is "no reading", which sends the
 * decision to the model's opinion rather than to a guess.
 */
const SHAPE_LEAST = 3;

/**
 * How much of the time around a press the pointer must have spent AT the spot.
 *
 * ── AGREEING ABOUT THE SHAPE IS NOT THE SAME AS HAVING STOPPED ──────────────
 * `share` says the sightings near the reference point agreed about the cursor's
 * shape. It says nothing about whether the pointer stayed there, and once the
 * reference became a median of the window a pointer moving STEADILY through
 * that window satisfied it easily: it passes through the middle, several
 * sightings land near it, and they all agree it is a hand — because it is one.
 *
 * That is a drag, not a press, and it is exactly what riding a scrollbar down
 * a page looks like: a hand, moving at a constant speed, for four seconds,
 * while the camera pushed in and pulled out over and over. "the mouse is
 * actually going there, it is transforming to hand gesture and zooming in and
 * zooming out and till bottom it is zooming in and zooming out."
 *
 * So the test also asks how much of the window those sightings were: nearly
 * all of them for a hand that stopped, a fraction of them for one on its way
 * past. A press is made by a pointer that arrived and STAYED.
 */
const SHAPE_HELD = 0.45;

/**
 * How far either side of the press the run is read.
 *
 * Forwards, mostly: the hand stays put after a press and arrives shortly
 * before one, so the stillness that proves it is on the far side. Riding a
 * scrollbar at an ordinary speed keeps the pointer inside a 0.05-wide band for
 * about a quarter of a second, so there is a wide gap between that and any
 * press worth the name.
 */
const HELD_BACK = 0.3;
const HELD_FORWARD = 1.0;
/** How much of that span really has to have been spent at the spot. */
const HELD_DENSITY = 0.5;

/** Did the pointer stop here and stay, with a shape it held? */
function settledAt(os) {
  if (!os || os.n < SHAPE_LEAST || os.share < SHAPE_SHARE) return false;
  return num(os.held) >= SHAPE_HELD;
}

/**
 * What the operating system was drawing where a press landed.
 *
 * @param {Array}  path  the located track — positions and real shapes, per frame
 * @param {number} t     when the press happened
 * @returns {{shape:string, share:number, n:number}|null}  null where the
 *          pointer was never located near that moment, which is not evidence
 *          of anything and is treated as such by the caller.
 */
export function osShapeAt(path, t, { reach = SHAPE_REACH, window = SHAPE_WINDOW, near = SHAPE_SAME } = {}) {
  if (!path || !path.length) return null;

  /**
   * Where the pointer was, taken from the track rather than from the press:
   * the press's own coordinates come from a frame difference and can be a few
   * pixels out, or — for a pointer that was parked before the recording began
   * — an outright guess. The track is a measurement.
   *
   * ── AND TAKEN FROM ALL OF THE TRACK, NOT ONE FRAME OF IT ──────────────────
   * This used to be the single sighting nearest the press in time, and every
   * other sighting was then measured against that one frame. So one bad frame
   * — and the locator's worst frames are the ones during a repaint, which is
   * exactly when a press happens — moved the reference somewhere the pointer
   * never was, and every good sighting at the real position fell outside
   * `near` of it.
   *
   * The reading did not degrade, it inverted. A pointer that had sat perfectly
   * still for nearly two seconds came back as "seen 36 times, settled 1" —
   * which confirmClicks() reads as its strongest evidence AGAINST a press,
   * "the pointer never stopped here", and the zoom was withheld. Measured on a
   * real recording: pressing "Projects" in the left rail, with the hand
   * visibly motionless on it and the OS drawing a hand the whole time, got no
   * camera move at all.
   *
   * A median cannot be moved by a minority of bad frames, however wrong they
   * are, and a pointer that genuinely travelled still has no position that
   * most of its sightings agree on — so a real sweep still reads as one.
   */
  let anyNear = false;
  const xs = [];
  const ys = [];
  for (const p of path) {
    if (Math.abs(num(p.t) - t) <= reach) anyNear = true;
    const dt = num(p.t) - t;
    if (dt < -window || dt > window) continue;
    xs.push(num(p.x, 0.5));
    ys.push(num(p.y, 0.5));
  }
  if (!anyNear || !xs.length) return null;

  const x = median(xs);
  const y = median(ys);
  const here = [];
  // How many times the pointer was seen AT ALL through this moment, wherever
  // it was. The difference between "we were not watching" and "we were
  // watching and it never stopped here" — see `seen` in confirmClicks().
  let seen = 0;
  for (const p of path) {
    const dt = num(p.t) - t;
    if (dt < -window || dt > window) continue;
    seen++;
    if (Math.hypot(num(p.x, 0.5) - x, num(p.y, 0.5) - y) > near) continue;
    here.push(String(p.shape || "default"));
  }
  if (!here.length) return { shape: "", share: 0, n: 0, seen };

  const tally = new Map();
  for (const s of here) tally.set(s, (tally.get(s) || 0) + 1);
  let shape = "default";
  let n = 0;
  for (const [s, c] of tally) if (c > n) { n = c; shape = s; }

  /**
   * ── HOW LONG IT STAYED, READ FORWARDS FROM THE PRESS ──────────────────────
   * The share of the window spent at this spot cannot answer "did it stop",
   * because a press happens at the START of a rest and not in the middle of
   * one. You scroll, you move to the menu item, you press it — so the half of
   * the window before the press is the hand on its way there, and a test that
   * wants most of a symmetric window to be still refuses a perfectly ordinary
   * click for having only just arrived. Measured: a press 0.72s before the end
   * of the window passed and one 0.66s before it failed, on identical
   * behaviour either side. That cliff is what lost "My Startup".
   *
   * What the pointer did before it arrived is not evidence about the press. It
   * was on its way. What matters is that it was here AND STAYED — so this is
   * the unbroken run at this spot containing the press, read mostly forwards,
   * and a couple of stray frames do not break it.
   */
  let from = null;
  let to = null;
  let atSpot = 0;
  let total = 0;
  for (const p of path) {
    const dt = num(p.t) - t;
    if (dt < -HELD_BACK || dt > HELD_FORWARD) continue;
    total++;
    if (Math.hypot(num(p.x, 0.5) - x, num(p.y, 0.5) - y) > near) continue;
    atSpot++;
    if (from === null) from = num(p.t);
    to = num(p.t);
  }
  /**
   * ── LOSING SIGHT OF IT IS NOT THE SAME AS IT LEAVING ──────────────────────
   * A run counted frame by frame would be cut in half by the locator dropping
   * the pointer for a moment, and it drops it exactly when a page repaints —
   * which is exactly when a press happens. So the span is measured from the
   * first sighting at this spot to the last, and the gaps in between are
   * allowed as long as most of the span really was spent here.
   *
   * That is what separates a dropout from a departure. A hand the locator lost
   * for a third of a second is at the same spot on both sides of the gap; a
   * pointer riding a scrollbar never comes back to where it was, so its span
   * is only as long as the moment it spent crossing this one band.
   */
  let held = 0;
  if (from !== null && from <= t + 1e-9 && to >= t - 1e-9 && total > 0) {
    if (atSpot / total >= HELD_DENSITY) held = to - from;
  }

  return { shape, share: n / here.length, n: here.length, seen, held: round3(held) };
}

/**
 * How many sightings through the window count as having watched the pointer.
 *
 * At thirty frames a second this is a fifth of a second of continuous
 * observation. Fewer than that and the locator was struggling here, so an
 * unsettled reading says nothing; more, and an unsettled reading is a fact
 * about the pointer rather than about the locator.
 */
const SHAPE_WATCHED = 6;

/* ────────────────────────────────────────────────────────────────────────────
   What a press is worth
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The weights, in one place, because they ARE the policy.
 *
 * ── HOW THEY WERE CHOSEN ─────────────────────────────────────────────────────
 * Not fitted to anything — there was no labelled data when they were written,
 * which is what scripts/truthScore.js and fixtures/truth.html now exist to
 * provide. They were set so that the decision this file made BEFORE the scorer
 * existed comes out unchanged in every case it already handled, and only the
 * three cases it handled wrongly come out different:
 *
 *   unchanged   a settled hand alone passes; a named control alone passes;
 *               a plain arrow alone fails; nothing read fails; a press with
 *               no consequence fails; a press on no control fails
 *   changed     a clickable glyph HELD through a press the speed threshold
 *               called "moving" now passes  ← the Projects click
 *   changed     an acknowledgement under a plain arrow now passes
 *               ← canvas, Figma, VS Code web, most of Electron
 *   changed     an acknowledgement during a scroll now passes
 *
 * That is deliberate: a rewrite that also re-tunes is a rewrite nobody can
 * review. Tune them against real numbers now that there are some.
 */
const W_CHANGED = 0.25;   // something came of it — necessary, and evidence in itself
const W_FLASH = 0.6;      // the interface acknowledged a press, at the pointer
const W_HAND = 0.5;       // the OS drew a clickable glyph and it settled
const W_HELD = 0.3;       // ...or drew one and held it, without settling
const W_CONTROL = 0.5;    // the model named a control under the pointer
const W_ARROW = 0.2;      // the OS drew a plain arrow: weak evidence against
const W_MOVING = 0.3;     // the pointer never settled — a proxy, see above
const W_SCROLLED = 0.35;  // the page was scrolling — also a proxy
/** Total at or above which the camera moves. */
const PRESS_BAR = 0.5;

/**
 * How long a clickable glyph must be held to count, without settling.
 *
 * Lower than SHAPE_HELD, deliberately. That constant decides whether the
 * pointer STOPPED, which is a strong claim; this one only asks whether the
 * operating system was drawing "you can press this" at the spot for long
 * enough that a press is plausible. A fifth of a second is about the shortest
 * deliberate hover a hand makes.
 */
const HELD_CLICKABLE = 0.2;

function heldClickable(os) {
  return !!os && CLICKABLE_SHAPES.has(os.shape) && num(os.held) >= HELD_CLICKABLE;
}

/**
 * How close an acknowledgement has to be to the press to be its acknowledgement.
 *
 * Tight. The flash IS the mouse-down, and the press's own timestamp comes from
 * the rest of this file resolving a dwell — which lands a little after. A
 * second either way would let one button's ripple vouch for a press somewhere
 * else entirely.
 */
const FLASH_BACK = 0.45;
const FLASH_FWD = 0.35;

function flashAt(flashes, t) {
  if (!flashes || !flashes.length) return null;
  let best = null;
  for (const f of flashes) {
    const dt = num(f.t) - t;
    if (dt < -FLASH_BACK || dt > FLASH_FWD) continue;
    if (!best || Math.abs(dt) < Math.abs(num(best.t) - t)) best = f;
  }
  return best;
}

/**
 * Decide which clicks get to move the camera.
 *
 * Reads what was measured elsewhere and combines it once, here, so the rule can
 * be read in one place. Strongest evidence first:
 *
 *   nothing came of it          the camera stays put
 *   the page was scrolling      the camera stays put, hand or not
 *   the OS drew a hand there    the camera moves — it only does that over
 *                               something that answers a click
 *   on a named control          the camera moves
 *   the OS drew a plain arrow   the camera stays put: empty space, a heading,
 *                               a panel still loading
 *   the model looked, saw none  the camera stays put
 *   nobody looked at all        the camera moves, as it always did
 *
 * ── THE ARROW RULE IS THE ONE THE CREATOR ASKED FOR ─────────────────────────
 * "Zoom in should only happen when user clicks on a Clickable UI element like
 * buttons etc. It should not zoom-in in any other condition. Sometimes users
 * have a tendency to click at some empty place where there is no UI clickable
 * element, so at those places we should not Zoom-in."
 *
 * Before this, a press with no model reading behind it was allowed through —
 * the pipeline's oldest default, from when there was nothing else to go on. On
 * a recording analysed with the vision pass unavailable that default let every
 * press through, including two the creator never made, minted by a page
 * finishing loading under a parked pointer. The arrow is what says so.
 *
 * A native <button> is drawn with an arrow on some sites, so the model's
 * reading is still consulted BEFORE the arrow rule refuses: the OS's hand can
 * only ever add a press, never take one away from a control the model named.
 *
 * @param {Array} events   from inferEvents
 * @param {Array} shots    from readFrames — per-frame elements the model named
 * @param {Array} located  from locatePointer — the real pointer, frame by frame
 */
export function confirmClicks(events, shots, { located = null, flashes = null, onNote = () => {} } = {}) {
  return (events || []).map((e) => {
    if (e.type !== "click" && e.type !== "dblclick") return e;

    const on = controlUnder(shots, num(e.t), num(e.x, 0.5), num(e.y, 0.5));
    const had = e.corroborated !== false;
    const scrolled = e.scrolled === true;

    const os = osShapeAt(located, num(e.t));
    const settled = settledAt(os);
    const hand = settled && CLICKABLE_SHAPES.has(os.shape);
    const arrow = settled && os.shape === "default";
    /**
     * ── A POINTER THAT NEVER STOPPED DID NOT PRESS ANYTHING ────────────────
     * Watched through this moment and never resting in one place. That is not
     * a missing reading, it is a reading: nobody presses a button on the way
     * past it, and the hand needs a fraction of a second on the spot for the
     * mouse to go down and up.
     *
     * Before this, an unsettled pointer fell through to the oldest default in
     * the pipeline — "nobody looked, so allow it" — which is the one case
     * where the evidence is actually against a press. The last zoom of one
     * recording landed on a press made while the pointer was travelling
     * across the screen, with nothing clickable under it at any point:
     * "there is no clickable element nor I have clicked, the Zoom-in
     * happened, it should not right".
     */
    const moving = os && !settled && os.seen >= SHAPE_WATCHED;

    let zoomable;
    let why;
    /**
     * ── A SCROLL OVER A CONTROL IS STILL A SCROLL ──────────────────────────
     * This used to let a press through if it was on a named control even when
     * the page had scrolled, on the theory that a link can jump to an anchor.
     * In practice it let through a hover: the creator scrolled a billing page
     * with the pointer resting on a dropdown, the page moved, the rules saw a
     * rest and a change on a control, and a zoom landed on a click that never
     * happened. When the only thing that followed was the page sliding, there
     * is no evidence of a press at all.
     */
    /**
     * ── THE CAMERA MOVES ON EVIDENCE, AND STAYS PUT ON THE ABSENCE OF IT ────
     * This was a list of reasons to REFUSE, ending in "nothing was read here;
     * allowed". That default is why this file kept growing: the camera moved
     * for anything that looked vaguely like a press, and every new thing a
     * creator did that happened to look like one — a page finishing loading, a
     * scrollbar being dragged, a panel fetching its data — had to be found in
     * an export and then written in here as another refusal. A blocklist can
     * only ever be as long as the bugs already reported.
     *
     *   "we should not hard code what things need to be ignored for the zoom
     *    in or camera rotation, we should only focus on at what interaction we
     *    should move the camera ... if we follow that simple rule, any other
     *    new interaction comes, it simply ignores it."
     *
     * So it is turned around. There are exactly two things that say a person
     * pressed something, and both are positive:
     *
     *   the OS drew a hand (or a caret) and held it there   — the machine that
     *     rendered the page saying this answers a click
     *   the model named a control under the pointer         — for the sites
     *     that draw a plain arrow on a real button
     *
     * Everything else is not a press. Not "a press we have decided to skip" —
     * not a press. Scrolling, a page arriving in stages, a tap on empty space,
     * a drag, and whatever nobody has thought of yet all land in the same
     * place now, and they land there without anybody adding a rule for them.
     */
    /**
     * ── THE LADDER IS GONE, AND WHY ──────────────────────────────────────────
     * This used to be an if/else chain: the first matching rule decided and
     * everything below it was unreachable. With two signals that was a fair
     * model of the problem. With four it stopped being one, and the failure was
     * not subtle — a press refused because a speed threshold called the pointer
     * "moving" could not be saved by anything, however much else agreed it was
     * a press. The creator reported it as a missing zoom on "Projects" and it
     * was structurally unfixable inside a chain.
     *
     * So the evidence is ADDED UP. Every channel is positive: something is seen
     * or it is not, and what is not seen contributes nothing rather than
     * blocking. That keeps the property the creator asked for —
     *
     *   "we should not hard code what things need to be ignored ... we should
     *    only focus on at what interaction we should move the camera ... if we
     *    follow that simple rule, any other new interaction comes, it simply
     *    ignores it."
     *
     * — because a new kind of interaction nobody has thought of scores zero and
     * is ignored, without anybody writing a rule against it. And it means four
     * weak agreeing signals can outvote one strong disagreeing one, which is the
     * case a chain can never express.
     */
    const ev = [];
    let score = 0;
    const add = (w, tag) => { score += w; ev.push(tag); };

    /**
     * ── ONE HARD VETO, AND ONLY ONE ──────────────────────────────────────────
     * Nothing came of it. Not "we decided to skip this" — there is no moment
     * here worth pointing a camera at, whether or not a finger went down, so
     * there is nothing for any amount of further evidence to be about.
     */
    if (!had) {
      zoomable = false;
      onNote({ t: num(e.t), zoomable, why: "nothing came of it" });
      return { ...e, zoomable, basis: "no-consequence", why: "nothing came of it", score: 0,
        on_control: on ? true : on === false ? false : null, control: on ? on.label || on.type : "",
        pointer_shape: os && os.shape ? os.shape : null };
    }
    add(W_CHANGED, "something changed");

    // The acknowledgement the interface itself drew at the pointer, in the
    // frames around the press. First-hand evidence of the press, not of its
    // consequence — the only channel here that is. See locate.js flashesFrom.
    const lit = flashAt(flashes, num(e.t));
    if (lit) add(W_FLASH, "the control lit up under the pointer");

    // The operating system drew a hand, a caret or a pointing finger, and held
    // it. It only does that over something that answers a click.
    if (hand) add(W_HAND, "the pointer was a " + (os.shape === "text" ? "text caret" : "hand") + " here");
    else if (heldClickable(os)) add(W_HELD, "a clickable pointer was held here");

    if (on) add(W_CONTROL, "on " + (on.label ? '"' + on.label + '"' : on.type));
    if (arrow) add(-W_ARROW, "a plain arrow here");

    /**
     * ── A PENALTY IS A PROXY, AND A PROXY RETIRES WHEN ANSWERED ──────────────
     * "The pointer never stopped" is not an observation about a press. It is a
     * speed threshold standing in for the question "did they hold still long
     * enough to press something" — and a flash, or a clickable glyph held on
     * the spot, answers that question directly. A stand-in does not get to
     * outvote the thing it was standing in for.
     *
     * Same for scrolling: it stands in for "was this really a press, or just
     * the page moving under a resting hand". An acknowledgement drawn at the
     * pointer answers that outright.
     */
    if (moving && !lit && !heldClickable(os)) add(-W_MOVING, "the pointer never settled here");
    /**
     * ── A SCROLL IS SOMETIMES WHAT THE CLICK DID, AND WE CANNOT TELL ──────
     * Half the links on a marketing page are anchors: pressing "Pricing" in a
     * nav does not navigate, it scrolls. A real demo lost its Pricing zoom to
     * this, and the obvious repair is to soften the penalty when the operating
     * system was drawing a hand at the spot.
     *
     * That was tried and reverted, because the two cases are the SAME evidence.
     * An anchor click is: hand on a link, page scrolls, pointer stays put. A
     * wheel scroll with the pointer resting on a nav item is: hand on a link,
     * page scrolls, pointer stays put. Softening the penalty enough to pass the
     * first passes the second by exactly the same margin — and the second is
     * the precise false positive this penalty was added for ("the creator
     * scrolled a billing page with the pointer resting on a dropdown, and a
     * zoom landed on a click that never happened").
     *
     * There is no cheap third signal that separates them. There are two
     * expensive ones, and both are already built:
     *
     *   the flash   the control drew its own acknowledgement (locate.js). A
     *               wheel scroll does not make a nav item light up. This
     *               retires the penalty outright, above.
     *   the audit   `scrolling` is a heuristic refusal, so audit.js cuts the
     *               frames either side and asks what actually happened. It
     *               comes back as a suggestion rather than a silent zoom.
     *
     * So the gate stays strict and the rescue happens where there is evidence
     * to rescue it with. Trading a missing zoom for a phantom one is not a fix.
     */
    if (scrolled && !lit) add(-W_SCROLLED, "the page was scrolling");

    zoomable = score >= PRESS_BAR;

    /**
     * The dominant reason, for code downstream to switch on (audit.js reads it
     * to tell a refusal made on a heuristic from one made on a reading).
     */
    const basis = lit ? "flash"
      : hand ? "hand"
      : on ? "control"
      : heldClickable(os) ? "held"
      : scrolled ? "scrolling"
      : moving ? "moving"
      : arrow ? "arrow"
      : on === false ? "off-control"
      : "nothing-read";

    why = zoomable
      ? ev.filter((w) => !w.startsWith("something changed")).slice(0, 2).join(", ") || "something changed here"
      : ev.length > 1
        ? "not enough to call it a press: " + ev.slice(1).join(", ")
        : "nothing says this was a press";

    onNote({ t: num(e.t), zoomable, why });
    return {
      ...e,
      zoomable,
      basis,
      on_control: on ? true : on === false ? false : null,
      control: on ? on.label || on.type : "",
      /**
       * ── WHAT THE CAMERA SHOULD FRAME, WHEN ANYBODY KNOWS ──────────────────
       * The control's own rectangle, so zoomsFromClicks() can hold the thing
       * that was pressed rather than a fixed box around where the pointer was.
       * Absent when no frame was read here, which is the common case with the
       * model pass off — and then the camera falls back to the click point
       * exactly as it always did.
       */
      target: on && on.bbox ? [round4(on.bbox.x), round4(on.bbox.y), round4(on.bbox.w), round4(on.bbox.h)] : undefined,
      // What the evidence added up to. Kept because a threshold is only
      // reviewable next to the numbers it was applied to.
      score: Math.round(score * 100) / 100,
      pointer_shape: os && os.shape ? os.shape : null,
      // The sentence above, kept on the event: it is the only record of why a
      // zoom is or is not there, and reading it back beats reconstructing it.
      why,
    };
  });
}

/**
 * Planned zooms that land on somebody reading, removed.
 *
 * ── THE CLICKS ARE NOT THE ONLY THING THAT AIMS THE CAMERA ──────────────────
 * zoomsFromClicks() above is now careful about what counts as a press, but it
 * is only one of the two things that move the camera. The other is the model's
 * own plan — it watches the recording and proposes emphasis of its own, and
 * that plan has no idea whether the creator was pressing anything.
 *
 * On one recording the creator scrolled a billing page from seventeen to
 * twenty-one seconds and the planner put a three and a half second zoom right
 * across it. No click was involved, so no amount of care about clicks would
 * have prevented it, and to the person watching it is the same bug: the camera
 * pushed in on a page they were only reading.
 *
 * Scrolling is already detected, from the same vertical translation the click
 * rules use. A planned zoom sitting mostly on top of it is dropped.
 */
/**
 * Frame heights of travel per second that mean the page is moving under the
 * viewer rather than the viewer moving through the page.
 */
const SCROLL_RATE = 0.06;
/** How much of a zoom has to sit on that before the zoom is the problem. */
const SCROLL_SHARE = 0.4;

export function dropScrollZooms(zooms, events, { motion = [], onNote = () => {} } = {}) {
  /**
   * ── MEASURED, NOT COUNTED ────────────────────────────────────────────────
   * The first version of this counted scroll EVENTS inside the zoom, and a
   * three and a half second zoom over a page the creator was visibly scrolling
   * survived it, because only two events had been emitted in that stretch and
   * two events' worth of window came to forty-six per cent of the span.
   *
   * The events are a summary; the translation is the evidence. A long slow
   * scroll produces one event and four seconds of movement, and it is the four
   * seconds that the viewer sees. So this reads the same per-frame vertical
   * shift the click rules use and asks how much of the zoom is sitting on top
   * of it.
   */
  /**
   * How far the page travelled during a stretch, in frame heights per second.
   *
   * The share of FRAMES that moved was the obvious measure and it is the wrong
   * one, because a trackpad scroll is bursty: a flick, a glide, a pause, another
   * flick. Over one real three and a half second zoom only eighteen per cent of
   * frames carried a shift — and they added up to the page moving more than half
   * a screen height, which is not something a viewer fails to notice. Distance
   * is what they see, so distance is what is measured.
   */
  const travel = (from, to) => {
    let sum = 0;
    for (const m of motion || []) {
      const t = num(m.t);
      if (t < from) continue;
      if (t > to) break;
      const dy = Math.abs(num(m.dy, 0));
      if (dy >= SCROLL_SHIFT) sum += dy;
    }
    return sum / Math.max(0.001, to - from);
  };

  /** Fall back to the events when there is no motion series to read. */
  const spans = [];
  for (const ev of events || []) {
    if (ev.type !== "scroll") continue;
    const start = num(ev.t) - 0.4;
    const end = num(ev.t) + 0.4;
    const prev = spans[spans.length - 1];
    if (prev && start <= prev.end) prev.end = Math.max(prev.end, end);
    else spans.push({ start, end });
  }

  return (zooms || []).filter((z) => {
    const span = num(z.end) - num(z.start);
    if (!(span > 0)) return true;

    let share;
    if (motion && motion.length) {
      const rate = travel(num(z.start), num(z.end));
      if (rate < SCROLL_RATE) return true;
      onNote({ start: num(z.start), end: num(z.end), rate });
      return false;
    }
    {
      let over = 0;
      for (const sp of spans) over += Math.max(0, Math.min(z.end, sp.end) - Math.max(z.start, sp.start));
      share = over / span;
    }
    if (share < SCROLL_SHARE) return true;
    onNote({ start: num(z.start), end: num(z.end), share });
    return false;
  });
}

export function zoomsFromClicks(events, { duration = 0, level = 2.0, settle = SETTLE, hold = HOLD, merge = MERGE, steps = [], sourceWidth = 0, holdFor = null } = {}) {
  const out = [];
  const clicks = events.filter(
    // zoomable is set by confirmClicks() once the model has said what was under
    // the pointer. Undefined means that pass never ran, and the old rule stands.
    (e) => (e.type === "click" || e.type === "dblclick") &&
      e.confidence >= 0.55 &&
      e.corroborated !== false &&
      e.zoomable !== false
  );

  /**
   * ── A CLICK CONTRIBUTES A BOX, NOT A POINT ────────────────────────────────
   * Where confirmClicks() named the control, the box is the control's. Where it
   * did not, the box is the click itself with no size — and containingBox()
   * then behaves exactly as containing() always did, which is what keeps every
   * recording analysed without the model framed the way it was before.
   */
  const boxOf = (c) =>
    Array.isArray(c.target) && c.target.length >= 4 && num(c.target[2]) > 0
      ? { x: num(c.target[0]), y: num(c.target[1]), w: num(c.target[2]), h: num(c.target[3]) }
      : { x: frac(c.x, 0.5), y: frac(c.y, 0.5), w: 0, h: 0 };

  const stepAt = (t) => (steps || []).find((s) => t >= num(s.start) - 0.05 && t <= num(s.end) + 0.05) || null;

  for (const c of clicks) {
    const start = Math.max(0, c.t - settle);
    /**
     * ── THE CAMERA LEAVES WHEN THE RESULT IS UP, NOT ON A STOPWATCH ────────
     * `hold` is the beat a control that responds instantly deserves. Anything
     * slower — a page that fetches, a panel that renders — spent that beat
     * showing a loading state and the camera pulled out exactly as the answer
     * appeared. `holdFor` asks the recording when the screen actually settled
     * after this press. See sync.js settleAfter. Absent, nothing changes.
     */
    const keep = holdFor ? Math.max(hold, holdFor(c.t)) : hold;
    const end = Math.min(duration || Infinity, c.t + keep);
    if (end - start < 0.2) continue;

    const mine = boxOf(c);
    // A named control sets the strength of the shot; an unnamed one keeps the
    // caller's constant, which is the behaviour every existing demo has.
    const want = mine.w > 0 ? levelForBox(mine, { sourceWidth }) : Math.min(level, levelForBox(null, { sourceWidth }));

    /**
     * ── TWO PRESSES IN ONE STEP ARE ONE SHOT ──────────────────────────────
     * The gap below is a clock: presses closer together than `merge` become one
     * camera move. That is the right instrument when nothing else is known, and
     * the wrong one when the steps are known — six presses filling one form are
     * one thing a viewer is watching however slowly the person typed, and
     * pulling out and back in between them is the seasick auto-zoom this
     * product exists not to be. Within a step the clock is relaxed; across a
     * step boundary it is not relaxed at all, because a new step is a new
     * subject and the camera should reset for it.
     */
    const here = stepAt(c.t);
    const prev = out[out.length - 1];
    const sameStep = !!here && !!prev && prev.step === here.id;
    const window = sameStep ? Math.max(merge, MERGE_IN_STEP) : merge;

    // Two clicks close together are one camera move covering both, not two:
    // pulling out and back in between two clicks a second apart is the reason
    // auto-zoom has a reputation for making people seasick. The rect grows to
    // hold both points rather than jumping between them.
    /**
     * ── MERGING HAS A LIMIT, AND IT IS THE POINT OF ZOOMING ─────────────────
     * Two clicks close together are one camera move covering both: pulling out
     * and back in between two presses a second apart is why auto-zoom has a
     * reputation for making people seasick.
     *
     * But the rect grows to hold every point it merges, and a rect that has
     * grown to nine tenths of the frame is not a zoom — it is the whole screen
     * with the edges trimmed, which is exactly what one real demo exported.
     * Past the point where the move would stop reading as emphasis, the clicks
     * get their own zooms instead.
     */
    if (prev && start < prev.end + window) {
      // The wider of the two shots wins: a level that holds one control will
      // not hold two, and containingBox() lowers it further if it has to.
      const lvl = Math.min(prev.level, want);
      const grown = containingBox([...prev.boxes, mine], lvl);
      if (grown.w <= MERGE_MAX) {
        prev.end = round3(Math.max(prev.end, end));
        prev.boxes.push(mine);
        prev.level = lvl;
        Object.assign(prev, grown);
        continue;
      }
    }

    out.push({
      id: newId("z"),
      start: round3(start),
      end: round3(end),
      ...containingBox([mine], want),
      level: want,
      easing: "smooth",
      // Gentle in, hard out. See timeline.js rampsOf for why these are not the
      // same number.
      ramp_out: RAMP_OUT,
      ease_out: "smooth",
      // A shot built around a named control is holding an element, which is
      // what "element" means; one built around a click point is following the
      // cursor. Saying which is not cosmetic — render/camera reads it.
      camera: mine.w > 0 ? "element" : "cursor",
      follow: false,
      follow_strength: 0.7,
      label: c.control ? String(c.control).slice(0, 60) : "click",
      auto: true,
      boxes: [mine],
      step: here?.id || "",
    });
  }

  // `boxes` and `step` are working state, not part of the timeline schema.
  return out.map(({ boxes, step, ...z }) => z);
}

/**
 * A rect at `level` that is guaranteed to contain every point given, after the
 * clamp into frame.
 *
 * ── THIS IS THE FUNCTION THE BROKEN EXPORT NEEDED ────────────────────────────
 * The camera shows a window of 1/level of the frame. Centring that window on a
 * point near an edge pushes it off the picture, and clamping it back moves it
 * AWAY from the point — which is how a click at x = 0.05 ended up outside its
 * own zoom. Clamping the CENTRE into the range the window can legally occupy,
 * before building the rect, cannot do that: the worst case is the point sitting
 * against the inside edge of the frame, which is still on screen.
 *
 * The level is also lowered, never the framing sacrificed, when the points are
 * too far apart to hold at the asked-for level. A wider shot that contains what
 * was clicked beats a tighter one that does not.
 */
export function containing(points, level) {
  const xs = points.map((p) => frac(p.x, 0.5));
  const ys = points.map((p) => frac(p.y, 0.5));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  // The window must hold the spread of points plus a margin, or the level drops.
  const MARGIN = 0.12;
  const need = Math.max(maxX - minX, maxY - minY) + MARGIN * 2;
  const w = clamp(Math.max(1 / Math.max(1, level), need), 0.08, 1);

  // Centre, then clamp the CENTRE — not the rect — into where it may legally sit.
  const cx = clamp((minX + maxX) / 2, w / 2, 1 - w / 2);
  const cy = clamp((minY + maxY) / 2, w / 2, 1 - w / 2);
  return { x: round4(cx - w / 2), y: round4(cy - w / 2), w: round4(w), h: round4(w) };
}

/** Breathing room left around a framed control, in fractions of the frame. */
const BOX_MARGIN = 0.06;

/**
 * The same guarantee as containing(), for rectangles rather than points.
 *
 * ── WHY THIS IS THE ONE THAT MATTERS ─────────────────────────────────────────
 * containing() frames a click, which is a coordinate, so the best it can do is
 * put a box of a fixed size around it and hope the thing that was pressed is
 * inside. When the control's own rectangle is known the question changes from
 * "what is near the click" to "what was pressed", and the shot can be built
 * around the answer. A press at the very edge of a wide button is then framed
 * with the whole button in view rather than with half of it cropped off.
 *
 * A zero-size box is a point, and this degenerates to containing() exactly —
 * which is what every recording analysed without the model still gets.
 */
export function containingBox(boxes, level, { margin = BOX_MARGIN } = {}) {
  const list = (boxes || []).filter(Boolean);
  if (!list.length) return containing([{ x: 0.5, y: 0.5 }], level);

  const minX = Math.min(...list.map((b) => frac(b.x, 0.5)));
  const minY = Math.min(...list.map((b) => frac(b.y, 0.5)));
  const maxX = Math.max(...list.map((b) => frac(b.x, 0.5) + Math.max(0, num(b.w))));
  const maxY = Math.max(...list.map((b) => frac(b.y, 0.5) + Math.max(0, num(b.h))));

  const need = Math.max(maxX - minX, maxY - minY) + margin * 2;
  const w = clamp(Math.max(1 / Math.max(1, level), need), 0.08, 1);
  const cx = clamp((minX + maxX) / 2, w / 2, 1 - w / 2);
  const cy = clamp((minY + maxY) / 2, w / 2, 1 - w / 2);
  return { x: round4(cx - w / 2), y: round4(cy - w / 2), w: round4(w), h: round4(w) };
}

/**
 * How hard to push in, given the size of the thing being looked at.
 *
 * ── ONE CONSTANT CANNOT SERVE A CHECKBOX AND A CHART ─────────────────────────
 * The camera has always zoomed to a fixed 2.0x, which is a compromise between
 * two shots that want different things. A sixteen-pixel icon at 2.0x is still a
 * sixteen-pixel icon on a phone; a card filling a third of the screen at 2.0x is
 * a crop with the context cut off. The shot should be sized by its subject: a
 * zoom exists to make one thing legible, so the level is whatever makes that
 * thing about a third of the picture.
 *
 * Both ends are clamped hard. Below 1.4x nobody can see that the camera moved,
 * and past 2.8x a 1080p recording shown at 1080p is visibly soft — the pixels
 * are not there, and a blurry emphasis is worse than none.
 */
const TARGET_SHARE = 0.34;
const LEVEL_MIN = 1.4;
const LEVEL_MAX = 2.8;

/**
 * ── AND THE CEILING DEPENDS ON HOW MANY PIXELS THERE ARE TO SPEND ────────────
 * A zoom does not magnify, it crops and rescales. At level L the camera shows
 * sourceWidth/L pixels across the full width of the export, so the upscale is
 * L × exportWidth / sourceWidth — and past a point the interface text, which is
 * the entire content of a product demo, goes soft.
 *
 * The cap used to be a flat 2.8, which is the right number for a 4K recording
 * and badly wrong for a 1080p one. Exported at 1080p, a 1080p source at 2.4×
 * IS a 2.4× upscale, and it looked it: every zoomed frame of a real demo came
 * out mushy while the unzoomed ones were sharp.
 *
 * ── WHY 1.8 AND NOT 1.0 ──────────────────────────────────────────────────────
 * Refusing to upscale at all would cap a 1080p recording at 1.0× — no zoom.
 * Some softness in a zoom is expected and forgiven; a viewer reads it as a
 * close-up. 1.8 is where measured test renders stopped looking like a close-up
 * and started looking like a mistake.
 *
 * The reference is 1920 because that is what almost every export is: the
 * YouTube and Original presets on a 1080p capture, and the smaller presets
 * only ever have MORE pixels per output pixel than this assumes.
 */
const MAX_UPSCALE = 1.8;
const REFERENCE_WIDTH = 1920;

export function levelForBox(rect, { sourceWidth = 0 } = {}) {
  const span = Math.max(num(rect?.w), num(rect?.h));
  const ceiling = sourceWidth > 0
    ? clamp((MAX_UPSCALE * sourceWidth) / REFERENCE_WIDTH, LEVEL_MIN, LEVEL_MAX)
    : LEVEL_MAX;
  if (!(span > 0)) return Math.min(2.0, ceiling);
  return Math.round(clamp(TARGET_SHARE / span, LEVEL_MIN, ceiling) * 10) / 10;
}

/**
 * The model's planned zooms, retimed AND re-aimed around the clicks inside them.
 *
 * The planner reads frames and knows what is worth looking at; it has no feel
 * for the tenth of a second on either side of a press, and no idea where the
 * pointer is. Left alone it opens a zoom at the moment of the action, aimed at
 * whatever looked important in the frame — which in a real recording was the
 * content area while every click happened in the nav.
 *
 * So the planner keeps its judgement about WHAT a stretch is about, and the
 * pointer log corrects WHEN the camera arrives and WHETHER the thing being
 * clicked is actually in shot.
 */
export function anticipateClicks(zooms, events, { duration = 0, settle = SETTLE, reach = 1.1 } = {}) {
  const clicks = events
    .filter((e) => (e.type === "click" || e.type === "dblclick") && e.confidence >= 0.5)
    .sort((a, b) => a.t - b.t);
  if (!clicks.length) return zooms;

  return zooms.map((z) => {
    // The clicks this zoom is plausibly about: inside it, or just after it
    // opens. `reach` is how late a click may be and still be the thing planned
    // for.
    const mine = clicks.filter((c) => c.t >= z.start - 0.25 && c.t <= Math.max(z.start + reach, z.end));
    if (!mine.length) return z;

    const first = mine[0];
    const start = Math.max(0, Math.min(z.start, first.t - settle));
    if (z.end - start < 0.2) return z;

    // Re-aim only when the plan does not already have the click in shot.
    const holds = mine.every((c) => c.x >= z.x && c.x <= z.x + z.w && c.y >= z.y && c.y <= z.y + z.h);
    const rect = holds ? { x: z.x, y: z.y, w: z.w, h: z.h } : containing(mine.map((c) => ({ x: c.x, y: c.y })), z.level);

    return {
      ...z,
      ...rect,
      start: round3(start),
      // Released as soon as the last click it covers has landed. A planned
      // zoom that ran on for four seconds after the press is four seconds of
      // the viewer looking at a crop of a page that has already changed.
      end: round3(clamp(Math.min(z.end, mine[mine.length - 1].t + HOLD), start + 0.2, duration || Infinity)),
      ramp_out: RAMP_OUT,
      ease_out: "smooth",
    };
  });
}

/**
 * The camera, guaranteed to come back to the full frame between moves.
 *
 * ── WHY THIS EXISTS AND spaceZooms DOES NOT COVER IT ─────────────────────────
 * vision.js spaceZooms enforces a gap between a zoom's `end` and the next
 * `start`. That is not the same thing, because a zoom's influence extends a
 * ramp beyond each edge: with a 0.8s gap and a 0.55s ramp on both sides, the
 * previous zoom is still pulling out as the next one starts pulling in and the
 * picture never reaches 1.0×. Watched back, that is a permanent crop that
 * wobbles — which is exactly what came out of the first real export.
 *
 * So the gap required here is measured between INFLUENCES, and it includes a
 * beat at the full frame. Anything that cannot be given that beat is dropped:
 * one clean zoom reads better than two that never let go.
 */
export function restToFull(zooms, { rest = 0.35 } = {}) {
  const out = [];
  /**
   * The last moment each kept zoom still has to be on screen for.
   *
   * A zoom ends a hold after the press it was built for, so the press itself
   * is at `end - HOLD` — and once a zoom has absorbed a later press as well
   * (below), it has to stay up for that one too. Without this the shortening
   * branch below would trim a zoom back past the very press it had just taken
   * responsibility for, and that press would be on screen with the camera
   * somewhere else entirely. It is the same "one press, silently unserved"
   * this function exists to stop, one step further along.
   */
  const mustHold = new Map();
  const keep = (z) => {
    const copy = { ...z };
    out.push(copy);
    mustHold.set(copy, num(z.end) - HOLD);
    return copy;
  };

  for (const z of [...zooms].sort((a, b) => a.start - b.start)) {
    const prev = out[out.length - 1];
    if (!prev) {
      keep(z);
      continue;
    }
    const tail = Number(prev.ramp_out) || RAMP_OUT;
    const thisIn = z.start - rampIn(z);
    if (thisIn >= prev.end + tail + rest) {
      keep(z);
      continue;
    }

    /**
     * ── TOO CLOSE TOGETHER IS NOT A REASON TO IGNORE A PRESS ────────────────
     * This used to keep the stronger of the two and throw the other away. That
     * is a rule about the camera making a press disappear, and which press
     * disappears depends on how fast the creator happened to be clicking —
     * measured on the current code, clicking round a screen at one and a half
     * seconds a click lost EVERY SECOND ZOOM, and at one second a click lost
     * two out of three. Nothing about those presses was wrong. They were
     * simply too close to the one before.
     *
     *   "we can't estimate or imagine how many clicks a user can actually
     *    click on the screen recording, right?"
     *
     * No, and we do not have to. There are two ways to make room without
     * refusing anybody, and only the second costs anything:
     *
     *   1. the earlier zoom holds for less time, so the camera still gets back
     *      to the full frame before the next move begins
     *   2. failing that, the two become ONE move wide enough to hold both
     *      presses — which is what zoomsFromClicks does for clicks close
     *      together anyway, and is the honest answer when there is genuinely
     *      no time for two separate moves
     *
     * Dropping one is not on the list.
     */
    const latestEnd = thisIn - rest - tail;
    const floor = Math.max(prev.start + MIN_HOLD, mustHold.get(prev) ?? 0);
    if (latestEnd >= floor) {
      prev.end = round3(latestEnd);
      keep(z);
      continue;
    }

    /**
     * ── NO ROOM FOR TWO MOVES, SO ONE MOVE THAT TRAVELS ────────────────────
     * A push-in, a hold and a pull-out is about one and a third seconds, and
     * the camera needs a beat at the full frame after it. Below roughly two
     * seconds a click there is genuinely no time for two separate moves, and
     * no rule anywhere can invent it.
     *
     * Widening one shot to hold both presses is the obvious way out and it is
     * a trap: two presses in opposite corners need almost the whole frame to
     * contain them, so the "zoom" comes out at 1.0x and neither press is shown
     * at all. That is losing them both while appearing to keep them.
     *
     * So the camera stays in and travels instead — which is what a person
     * editing this by hand would do, and what the follow mode already exists
     * for. Both presses are seen close up, and the move between them is a
     * move rather than a pull-out and a fresh push-in nobody had time for.
     */
    prev.end = round3(Math.max(prev.end, z.end));
    prev.follow = true;
    if (!Number.isFinite(Number(prev.follow_strength))) prev.follow_strength = 0.7;
    // It now answers for this press too, and may not be trimmed back past it.
    mustHold.set(prev, Math.max(mustHold.get(prev) ?? 0, num(z.end) - HOLD));
  }
  return out;
}

const rampIn = (z) => (Number.isFinite(Number(z?.ramp_in)) ? Number(z.ramp_in) : RAMP_SECONDS[z?.easing] || 0.55);
const RAMP_SECONDS = { smooth: 0.55, snappy: 0.32, slow: 0.9, linear: 0.5 };

export default {
  RULES, cleanSamples, cleanMotion, speeds, dwells, inferEvents, idleCuts,
  zoomsFromClicks, anticipateClicks, containing, containingBox, levelForBox, restToFull,
};

/**
 * Cuts, moved out of the way of the camera.
 *
 * ── A CUT THAT EATS A RAMP IS A JUMP CUT ON THE LENS ─────────────────────────
 * Cuts and zooms are decided independently — one from dead air, the other from
 * clicks — and they are both spans on the same recording, so they collide. When
 * they do, the collision is invisible in the timeline and brutal in the export.
 *
 * A real one: the creator clicks a menu item at 4.42s, the page starts loading
 * at 4.54s, and the loading is dead air so it is cut from 4.5s. The zoom built
 * for that click runs 4.12–4.97 and its camera is moving from 3.57 to 5.39. Cut
 * everything after 4.5 and the ramp OUT no longer exists, and neither does most
 * of the hold. What plays is the camera arriving at 2x and the picture changing
 * underneath it in one frame — measured at 1.00x to 1.98x between two
 * consecutive frames. The creator described it as "in a flash, there is no
 * smooth transition", which is exactly right: there is no transition at all,
 * because the frames it would have played on were thrown away.
 *
 * The camera wins. A cut exists to save the viewer three seconds of a spinner;
 * a zoom exists to show them the thing the demo is about. So the cut gives way:
 * it starts after the camera has finished leaving, or ends before it starts
 * arriving, and if that leaves too little to be worth cutting it is dropped.
 */
export function partCuts(cuts, zooms, { min = 0.5 } = {}) {
  const spans = (zooms || []).map((z) => {
    const r = rampsOf(z);
    return { a: num(z.start) - r.in, b: num(z.end) + r.out };
  });
  const out = [];

  for (const c of cuts || []) {
    let s = num(c.start);
    let e = num(c.end);
    let gone = false;

    for (const z of spans) {
      if (z.b <= s || z.a >= e || gone) continue;
      if (z.a <= s && z.b >= e) {
        // The camera is moving for the whole of this cut. There is nothing
        // left to remove.
        gone = true;
      } else if (z.a <= s) {
        s = z.b;
      } else if (z.b >= e) {
        e = z.a;
      } else {
        // The camera move sits inside the cut, which splits it. Keeping the
        // longer half is simpler than splitting and merging afterwards, and a
        // cut is dead air either way.
        if (z.a - s >= e - z.b) e = z.a;
        else s = z.b;
      }
    }

    if (!gone && e - s >= min) out.push({ ...c, start: round3(s), end: round3(e) });
  }
  return out;
}

/** The most of a recording that may be under a zoom. */
const MAX_ZOOMED = 0.6;

/**
 * The least time a zoom can hold and still read as the camera choosing something.
 *
 * Below about a third of a second the push-in and the pull-out meet in the
 * middle and it reads as a twitch rather than a move.
 */
const MIN_HOLD = 0.3;

/**
 * Zooms, shortened until the demo is not mostly zoomed.
 *
 * A zoom is emphasis, and emphasis on everything is emphasis on nothing. Past
 * about sixty per cent the video stops reading as "this bit matters" and starts
 * reading as "this recording is cropped wrong" — which is precisely how a real
 * export looked when the planner returned two zooms that covered all of it.
 *
 * ── IT SHORTENS THEM; IT NO LONGER DELETES THEM ─────────────────────────────
 * This used to drop whole zooms, weakest first, until the total fitted. That
 * makes the zooms compete: a press keeps its camera or loses it depending on
 * how many OTHER presses the creator made, which is a rule nobody can predict
 * and nobody asked for. It is also the exact shape of the complaint that took
 * five recordings to pin down — one set of clicks working only while another
 * set did not, with nothing wrong with either click.
 *
 * The creator's rule leaves no room for it:
 *
 *   "whenever a user clicks at some point then we should zoom in there. That
 *    is the simple thing."
 *
 * A press that earned a zoom keeps it. If the demo is too zoomed, every zoom
 * gives up some of its hold instead, in proportion, down to the shortest move
 * that still reads as one. A slightly brisker demo is a judgement call; a
 * missing zoom is a bug report.
 */
export function capZoomed(zooms, duration) {
  if (!(duration > 0) || zooms.length < 2) return zooms;
  const tail = (z) => Number(z.ramp_out) || 0.2;
  const span = (z) => z.end - z.start + tail(z);
  const total = zooms.reduce((a, z) => a + span(z), 0);
  const cap = duration * MAX_ZOOMED;
  if (total <= cap) return zooms;

  // What every zoom has to give up, shared out by how long each one is.
  const floor = zooms.reduce((a, z) => a + MIN_HOLD + tail(z), 0);
  if (cap <= floor) return zooms.map((z) => ({ ...z, end: round3(z.start + MIN_HOLD) }));

  const spare = total - floor;
  const keep = (cap - floor) / spare;
  return zooms.map((z) => {
    /**
     * A following zoom is already the compressed case: restToFull made it when
     * there was no room for separate moves, and it is holding the camera over
     * several presses at once. Trimming its end would strand every press after
     * the new one — so it is left alone, and the others give up the time.
     */
    if (z.follow) return { ...z };
    const held = Math.max(0, z.end - z.start - MIN_HOLD);
    return { ...z, end: round3(z.start + MIN_HOLD + held * keep) };
  });
}

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
import { newId } from "./timeline.js";

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const frac = (v, d = 0) => clamp(num(v, d), 0, 1);
const round3 = (v) => Math.round(v * 1000) / 1000;
const round4 = (v) => Math.round(v * 10000) / 10000;

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
  /** Change big enough to be a new screen rather than a widget reacting. */
  navEnergy: 0.45,
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
  return out;
}

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
export function inferEvents({ samples, motion, duration = 0 }) {
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
  const navs = [];
  for (const m of mot) {
    if (m.energy >= RULES.navEnergy) {
      events.push(event("nav", m.t, m.x + m.w / 2, m.y + m.h / 2, { confidence: clamp(m.energy, 0, 1) }));
      navs.push(m);
      claim(m.t);
    }
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
  for (const nav of navs) {
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
      .filter((r) => nav.t >= r.start + RULES.reactionMs[0] / 1000 && nav.t <= r.end + NAV_REACTION)
      .sort((a, b) => b.start - a.start)[0];
    if (!rest) continue;

    // The press is just before the change it caused, and inside the dwell.
    const at = clamp(nav.t - 0.12, rest.start, Math.max(rest.start, rest.end));
    if (events.some((e) => e.type === "click" && Math.abs(e.t - at) < 0.25)) continue;

    // A page that changed under a resting pointer is strong evidence on its
    // own; a hand cursor over the spot makes it near-certain.
    let confidence = 0.72;
    if (rest.shape === "pointer" || rest.shape === "hand") confidence += 0.2;
    if (rest.end - rest.start > 0.2) confidence += 0.06;

    events.push(event("click", at, rest.x, rest.y, { confidence: clamp(confidence, 0, 1), source: "nav" }));
    claim(at);
  }

  // ── Clicks ────────────────────────────────────────────────────────────────
  for (const rest of rests) {
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

    events.push(event("click", rest.end, rest.x, rest.y, { confidence: clamp(confidence, 0, 1) }));
    claim(best.m.t);
    claim(rest.end);
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
    if (still && m.h >= RULES.scrollMinHeight && m.energy > RULES.noiseEnergy && m.energy < RULES.navEnergy) run.push(m);
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

export function zoomsFromClicks(events, { duration = 0, level = 2.0, settle = SETTLE, hold = HOLD, merge = MERGE } = {}) {
  const out = [];
  const clicks = events.filter((e) => (e.type === "click" || e.type === "dblclick") && e.confidence >= 0.55);

  for (const c of clicks) {
    const start = Math.max(0, c.t - settle);
    const end = Math.min(duration || Infinity, c.t + hold);
    if (end - start < 0.2) continue;

    const prev = out[out.length - 1];
    // Two clicks close together are one camera move covering both, not two:
    // pulling out and back in between two clicks a second apart is the reason
    // auto-zoom has a reputation for making people seasick. The rect grows to
    // hold both points rather than jumping between them.
    if (prev && start < prev.end + merge) {
      prev.end = round3(Math.max(prev.end, end));
      prev.points.push({ x: c.x, y: c.y });
      Object.assign(prev, containing(prev.points, prev.level));
      continue;
    }

    out.push({
      id: newId("z"),
      start: round3(start),
      end: round3(end),
      ...containing([{ x: c.x, y: c.y }], level),
      level,
      easing: "smooth",
      // Gentle in, hard out. See timeline.js rampsOf for why these are not the
      // same number.
      ramp_out: RAMP_OUT,
      ease_out: "smooth",
      camera: "cursor",
      follow: false,
      follow_strength: 0.7,
      label: "click",
      auto: true,
      points: [{ x: c.x, y: c.y }],
    });
  }

  // `points` is working state, not part of the timeline schema.
  return out.map(({ points, ...z }) => z);
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
  for (const z of [...zooms].sort((a, b) => a.start - b.start)) {
    const prev = out[out.length - 1];
    if (!prev) {
      out.push(z);
      continue;
    }
    const prevOut = prev.end + (Number(prev.ramp_out) || RAMP_OUT);
    const thisIn = z.start - rampIn(z);
    if (thisIn >= prevOut + rest) {
      out.push(z);
      continue;
    }
    // Too close to let go between them. Keep the stronger one; when they are
    // the same strength keep the earlier, because the first of two rapid
    // clicks is the one the viewer has not seen yet.
    if (z.level > prev.level + 0.15) out[out.length - 1] = z;
  }
  return out;
}

const rampIn = (z) => (Number.isFinite(Number(z?.ramp_in)) ? Number(z.ramp_in) : RAMP_SECONDS[z?.easing] || 0.55);
const RAMP_SECONDS = { smooth: 0.55, snappy: 0.32, slow: 0.9, linear: 0.5 };

export default {
  RULES, cleanSamples, cleanMotion, speeds, dwells, inferEvents, idleCuts,
  zoomsFromClicks, anticipateClicks, containing, restToFull,
};

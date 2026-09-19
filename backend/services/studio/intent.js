/**
 * intent.js: the pointer path, composed rather than recovered.
 *
 * ── THE CHANGE THIS FILE REPRESENTS ──────────────────────────────────────────
 * Everything else in this pipeline has tried to answer "where was the mouse?".
 * That question has cost four rounds of bugs, and every one of them was a
 * failure of RECOVERY rather than of intent: the tracker cannot see a pointer
 * that is not moving, it prefers a loading spinner to a real cursor, it loses
 * the path across a page navigation, and the clock it timestamps on is not the
 * clock the video is on.
 *
 * None of those can happen to a path that is composed. And a composed path is
 * what a viewer wanted in the first place. Nobody watching a product demo wants
 * to see the truth about a mouse — the overshoot, the circling while someone
 * reads, the drift to a second monitor, the twitch. They want to see the
 * intention: this control, then that one, then the result.
 *
 * So the pointer here is drawn the way a motion designer would draw it. It
 * rests on a control, travels to the next one along a curve a hand would make,
 * arrives a beat before the press so the viewer's eye gets there first, and
 * stays for the press.
 *
 * ── THE LINE THIS FILE MUST NOT CROSS ────────────────────────────────────────
 * It composes MOTION. It never composes EVENTS.
 *
 * Every anchor below is a click that actually happened, at the time it actually
 * happened, at a control that was actually on screen — the events come from
 * events.js reading the recording, and the control comes from the vision pass
 * reading the same frames. What is invented is only the travel between them,
 * which nobody is making a claim about.
 *
 * This matters because the failure mode changes shape. A tracker that gets the
 * position wrong looks like a glitch and a viewer discounts it. A composed path
 * that goes to the wrong control looks like confidence, and a demo that
 * confidently shows a button being pressed that was never pressed is not an
 * edit, it is a fabrication. Hence: anchors only from real clicks, snapping
 * only to elements the model actually saw, and a return to the recorded path
 * whenever there is not enough evidence to compose one.
 *
 * ── WHY SNAPPING TO THE ELEMENT IS THE POINT ─────────────────────────────────
 * A click's recovered position is a few pixels of guesswork on a downscaled
 * difference image. The element it landed on is a labelled rectangle the vision
 * pass read off the frame. Snapping the anchor to the middle of that rectangle
 * is what turns "approximately here" into "on the API Keys menu item" — and it
 * is the one thing in this product that a recorder following a mouse cannot do.
 */
import { EASE } from "./timeline.js";

/** Frames a second the composed path is written at. Matches smoothTrack. */
const RATE = 60;

/**
 * How fast the pointer travels, in frame widths per second.
 *
 * A full-width move lands in about six tenths of a second, which is roughly
 * what an unhurried hand does and comfortably slower than a real flick. The
 * point of a composed path is legibility, not realism.
 */
const SPEED = 1.7;
const TRAVEL_MIN = 0.22;
const TRAVEL_MAX = 0.85;

/**
 * How long the pointer is sitting on the control before the press.
 *
 * The viewer's eye has to arrive before the thing happens or the click reads as
 * something the video did rather than something a person did. It is also what
 * the camera is timed against — events.js SETTLE holds the zoom fully in for
 * the same beat — so the two arrive together.
 */
const ARRIVE_BEFORE = 0.3;
/** ...and stays after it, so the press is not the last frame of the pause. */
const HOLD_AFTER = 0.18;

/**
 * How far a composed path bows away from the straight line, as a share of the
 * distance travelled.
 *
 * A hand moving between two points does not draw a line segment; it draws a
 * shallow arc. Without this the path is unmistakably machine-made, and with
 * much more than this it looks like it is avoiding something.
 */
const BOW = 0.085;

/** How near a click has to be to an element before it is read as landing on it. */
const SNAP_NEAR = 0.05;
/** How far in time a frame can be from a click and still describe its screen. */
const SNAP_WINDOW = 1.6;
/** An element bigger than this is a panel, not a control; never snap to one. */
const SNAP_MAX_AREA = 0.2;

/** Clicks needed before composing is better than following. */
const MIN_ANCHORS = 2;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const round3 = (v) => Math.round(v * 1000) / 1000;
const round4 = (v) => Math.round(v * 10000) / 10000;

/**
 * ── MINIMUM JERK ─────────────────────────────────────────────────────────────
 * Not an easing curve chosen because it looked nice. When a person reaches for
 * something, the trajectory they produce is the one that minimises jerk — the
 * rate of change of acceleration — and it has a closed form. Using it means the
 * pointer accelerates and settles the way a hand does, including the hard
 * deceleration into the target that every other easing curve understates.
 */
const minimumJerk = (k) => {
  const t = clamp(k, 0, 1);
  return t * t * t * (10 - 15 * t + 6 * t * t);
};

/* ────────────────────────────────────────────────────────────────────────────
   Anchors
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The control a click landed on, according to the frames.
 *
 * Containing elements win over near ones, and the SMALLEST containing element
 * wins over the rest: a click inside a dialog is on the button inside the
 * dialog, not on the dialog. Panels are excluded outright — snapping to the
 * middle of a sidebar would move the pointer further from the truth than
 * leaving it where it was found.
 */
export function elementAt(shots, t, x, y) {
  let best = null;
  let bestGap = Infinity;
  for (const shot of shots || []) {
    const gap = Math.abs(num(shot.t) - t);
    if (gap > SNAP_WINDOW) continue;
    for (const el of shot.elements || []) {
      const [ex, ey, ew, eh] = el.bbox || [];
      if (!(ew > 0) || !(eh > 0)) continue;
      const area = ew * eh;
      if (area > SNAP_MAX_AREA) continue;
      const inside = x >= ex && x <= ex + ew && y >= ey && y <= ey + eh;
      const cx = ex + ew / 2;
      const cy = ey + eh / 2;
      const near = Math.hypot(x - cx, y - cy);
      if (!inside && near > SNAP_NEAR) continue;
      // Containment beats proximity; among containers, smaller beats larger;
      // and a closer frame in time breaks what is left.
      const rank = (inside ? 0 : 1) * 1000 + area * 100 + gap * 0.5;
      if (rank < bestGap) {
        bestGap = rank;
        best = { x: cx, y: cy, label: el.label || "", type: el.type || "", area, inside };
      }
    }
  }
  return best;
}

/**
 * The clicks, as places the pointer has to be at times it has to be there.
 *
 * Clicks closer together than a travel's worth of time at the same place are
 * one anchor: a double click is one journey, not two.
 */
export function anchorsFrom(events, shots, { minConfidence = 0.5 } = {}) {
  const clicks = (events || [])
    .filter((e) => (e.type === "click" || e.type === "dblclick") && num(e.confidence, 1) >= minConfidence)
    .sort((a, b) => num(a.t) - num(b.t));

  const out = [];
  for (const c of clicks) {
    const t = num(c.t);
    const x = clamp(num(c.x, 0.5), 0, 1);
    const y = clamp(num(c.y, 0.5), 0, 1);
    const el = elementAt(shots, t, x, y);
    const a = {
      t: round3(t),
      x: round4(el ? el.x : x),
      y: round4(el ? el.y : y),
      label: el ? el.label : "",
      snapped: !!el,
      moved: el ? round4(Math.hypot(el.x - x, el.y - y)) : 0,
    };
    const prev = out[out.length - 1];
    if (prev && a.t - prev.t < 0.4 && Math.hypot(a.x - prev.x, a.y - prev.y) < 0.03) {
      prev.t = a.t;
      continue;
    }
    out.push(a);
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
   The path
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * A composed pointer path, or null when there is not enough to compose one.
 *
 * Returns the same shape as a recovered track — the renderer and the editor
 * cannot tell the difference and do not need to, because a timeline has always
 * held conclusions rather than observations. What was seen stays in
 * `capture.track`; what will be drawn is this.
 *
 * @param {Array} events   as inferred from the recording
 * @param {object} o
 * @param {Array} o.shots  the vision pass, for snapping to controls
 * @param {Array} o.track  the recovered path, used only to decide where the
 *                         pointer starts, since nothing else knows
 * @param {number} o.duration
 * @returns {{ path, anchors, snapped } | null}
 */
export function intentPath(events, { shots = [], track = [], duration = 0, rate = RATE } = {}) {
  const anchors = anchorsFrom(events, shots);
  if (anchors.length < MIN_ANCHORS || !(duration > 0.2)) return null;

  // Where the pointer was before the first press. The recovered path is the
  // only thing that knows, and it frequently does not; falling back to the
  // first anchor means the demo opens with the pointer already on its target,
  // which is honest — nothing has been claimed about the time before it.
  const first = track.find((p) => num(p.t) <= anchors[0].t - 0.2);
  const origin = first
    ? { x: clamp(num(first.x, anchors[0].x), 0, 1), y: clamp(num(first.y, anchors[0].y), 0, 1) }
    : { x: anchors[0].x, y: anchors[0].y };

  /* ── The legs ──────────────────────────────────────────────────────────── */
  // Each leg is: stay where you are, travel, be there before the press.
  const legs = [];
  let from = origin;
  let ready = 0;

  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const dist = Math.hypot(a.x - from.x, a.y - from.y);
    const want = clamp(dist / SPEED, TRAVEL_MIN, TRAVEL_MAX);
    const arrive = a.t - ARRIVE_BEFORE;
    // Never start before the previous press has been held, and never travel
    // backwards in time when two clicks are closer together than a journey.
    const depart = Math.max(ready, arrive - want);
    const travel = Math.max(0.04, arrive - depart);
    legs.push({ from, to: { x: a.x, y: a.y }, depart, arrive, travel, anchor: a, bow: i % 2 === 0 ? 1 : -1 });
    from = { x: a.x, y: a.y };
    ready = a.t + HOLD_AFTER;
  }

  /* ── Writing it out ────────────────────────────────────────────────────── */
  const step = 1 / rate;
  const path = [];
  for (let t = 0; t <= duration + 1e-6; t += step) {
    const at = round3(t);
    let p = null;
    let onTarget = false;

    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      if (t < leg.depart) {
        // Still where the last leg left it.
        p = leg.from;
        onTarget = i > 0;
        break;
      }
      if (t <= leg.arrive) {
        const k = minimumJerk((t - leg.depart) / leg.travel);
        p = bowed(leg.from, leg.to, k, leg.bow);
        onTarget = k > 0.94;
        break;
      }
      if (i === legs.length - 1) {
        p = leg.to;
        onTarget = true;
      }
    }

    if (!p) p = legs[legs.length - 1].to;
    path.push({
      t: at,
      x: round4(clamp(p.x, 0, 1)),
      y: round4(clamp(p.y, 0, 1)),
      // A hand on a control, an arrow on the way to one. The gesture is now
      // decided by where the pointer IS rather than guessed from a handful of
      // pixels, so it cannot flicker.
      shape: onTarget ? "pointer" : "default",
    });
  }

  return { path, anchors, snapped: anchors.filter((a) => a.snapped).length };
}

/**
 * A point along a shallow arc between two places.
 *
 * A quadratic Bézier whose control point is pushed off the midpoint at right
 * angles to the travel. The push alternates from leg to leg: a path that always
 * bows the same way reads as a rule rather than as a hand.
 */
function bowed(a, b, k, sign) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return { x: b.x, y: b.y };
  const off = BOW * dist * sign;
  const cx = (a.x + b.x) / 2 - (dy / dist) * off;
  const cy = (a.y + b.y) / 2 + (dx / dist) * off;
  const m = 1 - k;
  return {
    x: m * m * a.x + 2 * m * k * cx + k * k * b.x,
    y: m * m * a.y + 2 * m * k * cy + k * k * b.y,
  };
}

/** Unused but kept honest: the easing table the rest of the studio shares. */
export const EASINGS_USED = { minimumJerk, smooth: EASE.smooth };

export default { intentPath, anchorsFrom, elementAt };

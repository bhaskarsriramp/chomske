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
  for (const m of mot) {
    if (m.energy >= RULES.navEnergy) {
      events.push(event("nav", m.t, m.x + m.w / 2, m.y + m.h / 2, { confidence: clamp(m.energy, 0, 1) }));
      claim(m.t);
    }
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
 * Zoom targets from the clicks: the camera move every screen recorder wants.
 *
 * ── THE ZOOM ARRIVES BEFORE THE CLICK, NOT AFTER IT ──────────────────────────
 * This is the whole trick, and it is the one thing hand-edited demos get right
 * and automatic ones get wrong. A zoom that starts ON the click shows the
 * viewer a button that has already been pressed. The viewer needs to see the
 * button, see the pointer arrive at it, and see it pressed — so the camera has
 * to be settled on the target BEFORE the pointer gets there.
 *
 * In this timeline a zoom's `start` is the moment it is fully in: the ease-in
 * runs over RAMP seconds BEFORE `start` (see timeline.js cameraAt). So the
 * anchor is the click itself, less a couple of frames of settle, and the
 * ease-in falls naturally into the approach. `hold` then keeps the frame on
 * the target just long enough to read what the click did — a menu opening, a
 * field filling — before it releases.
 *
 * `hold` is deliberately short. The instinct is to linger, and lingering is
 * what makes an automatic edit feel slow: the interesting thing is the next
 * action, and the camera should already be on its way there.
 */
export function zoomsFromClicks(events, { duration = 0, level = 1.8, settle = 0.12, hold = 0.9, merge = 1.2 } = {}) {
  const out = [];
  const clicks = events.filter((e) => (e.type === "click" || e.type === "dblclick") && e.confidence >= 0.55);

  for (const c of clicks) {
    // Fully zoomed a couple of frames before the button is pressed.
    const start = Math.max(0, c.t - settle);
    const end = Math.min(duration || Infinity, c.t + hold);
    if (end - start < 0.3) continue;

    const prev = out[out.length - 1];
    // Two clicks close together are one camera move covering both, not two:
    // pulling out and back in between two clicks a second apart is the reason
    // auto-zoom has a reputation for making people seasick.
    if (prev && start < prev.end + merge) {
      prev.end = round3(Math.max(prev.end, end));
      const x0 = Math.min(prev.x, c.x - 0.14);
      const y0 = Math.min(prev.y, c.y - 0.1);
      prev.w = round4(Math.max(prev.x + prev.w, c.x + 0.14) - x0);
      prev.h = round4(Math.max(prev.y + prev.h, c.y + 0.1) - y0);
      prev.x = round4(clamp(x0, 0, 1));
      prev.y = round4(clamp(y0, 0, 1));
      continue;
    }

    out.push({
      id: newId("z"),
      start: round3(start),
      end: round3(end),
      x: round4(clamp(c.x - 0.14, 0, 1)),
      y: round4(clamp(c.y - 0.1, 0, 1)),
      w: 0.28, h: 0.2,
      level,
      easing: "smooth",
      camera: "cursor",
      follow: false,
      follow_strength: 0.7,
      label: "click",
      auto: true,
    });
  }
  return out;
}

/**
 * The model's planned zooms, retimed so each one lands before the click it is
 * about.
 *
 * The planner reads frames and describes what should be on screen; it has no
 * feel for the tenth of a second on either side of a press, and left alone it
 * tends to open a zoom at the moment of the action. Where a planned zoom has a
 * click just inside its front edge, the zoom is pulled back so the camera is
 * already there — the planner keeps its judgement about WHAT to look at, and
 * the pointer log decides WHEN.
 */
export function anticipateClicks(zooms, events, { duration = 0, settle = 0.12, reach = 1.1 } = {}) {
  const clicks = events
    .filter((e) => (e.type === "click" || e.type === "dblclick") && e.confidence >= 0.5)
    .map((e) => e.t)
    .sort((a, b) => a - b);
  if (!clicks.length) return zooms;

  return zooms.map((z) => {
    // The first click at or just after this zoom opens; `reach` is how late a
    // click may be and still be the thing the zoom was planned for.
    const c = clicks.find((t) => t >= z.start - 0.25 && t <= z.start + reach);
    if (c === undefined) return z;
    const start = Math.max(0, Math.min(z.start, c - settle));
    // Never inverted, and never so long the ruler shows a zoom over the whole
    // recording because one click sat near a badly-timed plan.
    if (z.end - start < 0.3) return z;
    return { ...z, start: round3(start), end: round3(Math.min(duration || Infinity, z.end)) };
  });
}

export default { RULES, cleanSamples, cleanMotion, speeds, dwells, inferEvents, idleCuts, zoomsFromClicks, anticipateClicks };

/**
 * hide.js: removing the pointer the operating system burnt into the recording.
 *
 * ── WHY THIS BECAME NECESSARY ────────────────────────────────────────────────
 * A browser recording a screen gets the cursor composited into the pixels and
 * no way to ask for it separately. Until now that was survivable, because the
 * drawn pointer went exactly where the captured one was and, being a third
 * larger, covered it.
 *
 * Composing the path (intent.js) ends that arrangement. A composed pointer
 * rests on controls and travels between them; the real one wanders, overshoots
 * and stops to let somebody read. Measured against a real recording, the two
 * are more than a cursor's width apart in NINETY-FIVE PER CENT of frames. So
 * covering no longer works, and the captured pointer has to actually go.
 *
 * ── HOW ──────────────────────────────────────────────────────────────────────
 * ffmpeg's `delogo` filter reconstructs a rectangle from the pixels around its
 * border — it exists to remove a station's watermark. A watermark does not
 * move, and neither did this filter's rectangle for most of its life, which is
 * why the first version of this file was going to be a list of static patches
 * over the moments the pointer sat still.
 *
 * It turns out x, y, w and h are EXPRESSIONS, re-evaluated every frame. Tested
 * directly: `x='60+200*t'` puts the reconstructed patch at x≈86 a tenth of a
 * second in and x≈406 at 1.7 seconds. So the rectangle can follow the pointer
 * along its whole path, and one filter removes it from the entire recording.
 *
 * The expression is the recovered path written as a flat sum of gated linear
 * segments — no nesting, because two hundred nested if()s is a parser's worst
 * day. Each term is a straight line between two sightings, multiplied by a gate
 * that is 1 only during that segment.
 *
 * ── WHAT IT COSTS ────────────────────────────────────────────────────────────
 * On flat interface panels the result is invisible: the border it interpolates
 * from is the same colour as the middle. Over text it leaves a soft smudge the
 * size of a cursor. A smudge is not nothing — but it is a great deal less than
 * a second pointer going its own way, which is what the alternative is.
 *
 * This runs BEFORE the zoom, in the recording's own coordinates, for the same
 * reason the blur does: the rectangle is in source pixels, and re-projecting it
 * through a moving camera every frame is a way to be two frames late.
 */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const r2 = (v) => Math.round(v * 100) / 100;

/**
 * ── THE PATCH IS NOT CENTRED ON THE POINTER ──────────────────────────────────
 * A cursor's position is its hotspot, and a hotspot is not the middle of the
 * picture: an arrow hangs down and to the right of its tip, a hand hangs below
 * and to both sides of its fingertip. Centring a square on the hotspot — which
 * the first version did — leaves the patch covering empty background above and
 * left, and the bottom of the cursor sticking out underneath. It measured worse
 * than not erasing at all.
 *
 * These cover the union of both silhouettes, in multiples of the pointer's
 * measured height, with a little margin for the shadow the OS draws.
 */
const LEFT = 0.6;
const UP = 0.15;
const WIDE = 1.37;
const TALL = 1.55;
/** Smallest patch worth asking for, in source pixels. */
const MIN_PX = 12;
/** Gaps longer than this are the pointer standing still, so the patch holds. */
const HOLD = 0.2;
/** Samples closer together than this are the same moment. */
const MIN_STEP = 0.01;

/**
 * The captured pointer's path, as ffmpeg expressions in output time.
 *
 * @param {Array} captured  the RECOVERED path — where the pointer actually was,
 *                          not the composed one that will be drawn
 * @param {object} lay      layout(), for mapping source time past the cuts
 * @param {object} o        { sourceWidth, sourceHeight, cursorPx }
 * @returns {{ filter: string, samples: number } | null}
 */
export function hideFilter(captured, lay, { sourceWidth, sourceHeight, cursorPx = 22, drawn = null } = {}) {
  const pts = toOutput(captured, lay);
  if (pts.length < 2) return null;

  const cp = Math.max(MIN_PX, num(cursorPx, 22));
  const w = Math.max(MIN_PX, Math.round(cp * WIDE));
  const h = Math.max(MIN_PX, Math.round(cp * TALL));
  // delogo reconstructs from a one pixel band outside the rectangle, so the
  // rectangle may not touch the edge of the frame. A pointer at the very edge
  // is clamped inwards; it is a patch of background either way.
  const maxX = Math.max(1, sourceWidth - w - 2);
  const maxY = Math.max(1, sourceHeight - h - 2);
  const px = (p) => clamp(Math.round(p.x * sourceWidth - cp * LEFT), 1, maxX);
  const py = (p) => clamp(Math.round(p.y * sourceHeight - cp * UP), 1, maxY);

  const xs = [];
  const ys = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const from = r2(a.t);
    // The last sample runs to the end of the recording: a pointer nobody saw
    // move is a pointer that stayed where it was.
    const to = b ? r2(b.t) : r2(lay.duration + 1);
    if (to - from < MIN_STEP) continue;

    const gate = `gte(t,${from})*lt(t,${to})`;
    const x0 = px(a);
    const y0 = py(a);

    // A gap longer than a dropped sample or two is the pointer at rest, so the
    // patch holds rather than sliding slowly across the picture to meet it.
    if (!b || to - from > HOLD) {
      xs.push(`${x0}*${gate}`);
      ys.push(`${y0}*${gate}`);
      continue;
    }
    const x1 = px(b);
    const y1 = py(b);
    const span = (to - from).toFixed(3);
    xs.push(x1 === x0 ? `${x0}*${gate}` : `(${x0}+${x1 - x0}*(t-${from})/${span})*${gate}`);
    ys.push(y1 === y0 ? `${y0}*${gate}` : `(${y0}+${y1 - y0}*(t-${from})/${span})*${gate}`);
  }

  if (!xs.length) return null;

  /**
   * ── ONLY WHERE IT WOULD ACTUALLY SHOW ─────────────────────────────────────
   * Reconstructing a rectangle is not free: over a line of text it takes the
   * text with it and leaves a pale gap where the words were. So it is done only
   * where the captured pointer is somewhere the drawn one is NOT already
   * standing.
   *
   * That saves the damage exactly where it would hurt most. Near a click the
   * two pointers are in the same place — the click was inferred from the
   * pointer resting there — and a click is on a labelled control, which is to
   * say on text. Those moments are skipped, and what is left to erase is the
   * travel in between, which is mostly flat panel.
   */
  const spans = needed(pts, drawn, sourceWidth, sourceHeight, cp, lay);
  if (!spans.length) return null;

  // Outside every gate the sum is zero, which delogo would read as the corner
  // of the frame. max() with 1 keeps it legal, and the enable list keeps the
  // filter switched off there anyway.
  const X = "max(1\," + xs.join("+") + ")";
  const Y = "max(1\," + ys.join("+") + ")";
  const on = spans.map((sp) => "between(t," + r2(sp.start) + "," + r2(sp.end) + ")").join("+");

  return {
    filter: "delogo=x='" + X + "':y='" + Y + "':w=" + w + ":h=" + h + ":enable='" + on + "'",
    samples: xs.length,
    spans: spans.length,
    covered: r2(spans.reduce((a, sp) => a + (sp.end - sp.start), 0)),
  };
}

/**
 * The stretches where the two pointers are far enough apart to matter.
 *
 * "Far enough" is how much the drawn pointer overhangs the captured one: it is
 * drawn a third larger from the same hotspot, so it hides a displacement of
 * about a third of a cursor and no more.
 */
function needed(pts, drawn, sourceWidth, sourceHeight, cursorPx, lay) {
  if (!drawn || !drawn.length) return [{ start: Math.max(0, pts[0].t - 0.05), end: lay.duration + 0.5 }];

  const reach = Math.max(6, cursorPx * 0.35);
  const spans = [];
  let open = null;

  for (const q of pts) {
    const d = at(drawn, q.t);
    const apart = d ? Math.hypot((q.x - d.x) * sourceWidth, (q.y - d.y) * sourceHeight) : Infinity;
    if (apart > reach) {
      if (!open) open = { start: q.t, end: q.t };
      else open.end = q.t;
    } else if (open) {
      spans.push(open);
      open = null;
    }
  }
  if (open) spans.push({ start: open.start, end: lay.duration + 0.5 });

  // A patch flicking on and off every few frames is worse than one that stays,
  // so anything nearly touching is joined and a blink is dropped.
  const merged = [];
  for (const sp of spans) {
    const prev = merged[merged.length - 1];
    if (prev && sp.start - prev.end < 0.25) prev.end = sp.end;
    else merged.push({ start: sp.start, end: sp.end });
  }
  return merged
    .filter((sp) => sp.end - sp.start > 0.08)
    .map((sp) => ({ start: Math.max(0, sp.start - 0.05), end: sp.end + 0.05 }));
}

/** A path's position at a moment, interpolated. */
function at(track, t) {
  if (!track.length) return null;
  if (t <= num(track[0].t)) return track[0];
  if (t >= num(track[track.length - 1].t)) return track[track.length - 1];
  let lo = 0;
  let hi = track.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (num(track[mid].t) <= t) lo = mid;
    else hi = mid;
  }
  const a = track[lo];
  const b = track[hi];
  const span = num(b.t) - num(a.t);
  if (!(span > 0)) return a;
  const k = (t - num(a.t)) / span;
  return { x: num(a.x) + (num(b.x) - num(a.x)) * k, y: num(a.y) + (num(b.y) - num(a.y)) * k };
}

/**
 * The recovered path in OUTPUT time, with anything inside a cut dropped.
 *
 * The erase runs on the already-cut video, so every time here has to be where
 * that moment ended up — the same mapping the blur rectangles go through.
 */
function toOutput(captured, lay) {
  const out = [];
  for (const p of captured || []) {
    const t = num(p.t, -1);
    if (t < 0) continue;
    for (const seg of lay.segments) {
      if (t < seg.src_start || t > seg.src_end) continue;
      out.push({ t: seg.out_start + (t - seg.src_start), x: clamp(num(p.x, 0.5), 0, 1), y: clamp(num(p.y, 0.5), 0, 1) });
      break;
    }
  }
  out.sort((a, b) => a.t - b.t);
  // Two samples at the same instant make a zero-length segment and a division
  // by zero in the expression.
  return out.filter((p, i, arr) => i === 0 || p.t - arr[i - 1].t >= MIN_STEP);
}

export default { hideFilter };

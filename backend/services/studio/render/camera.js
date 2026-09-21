/**
 * camera.js: the zoom timeline, as an ffmpeg filter.
 *
 * ── WHY zoompan AND NOT crop ─────────────────────────────────────────────────
 * The obvious filter is `crop`, and it cannot do this. crop's `x` and `y` are
 * re-evaluated for every frame, but `w` and `h` are evaluated ONCE when the
 * graph is configured. A crop can therefore pan and can never zoom. The same is
 * true of `scale`. That leaves `zoompan`, which exists precisely to vary the
 * field of view over time: it crops `iw/z × ih/z` at `(x, y)` and scales the
 * result to a fixed output size, with z, x and y evaluated per frame.
 *
 * ── zoompan's ONE REAL FLAW, AND THE FIX ─────────────────────────────────────
 * zoompan rounds its crop origin to whole INPUT pixels. On a slow zoom that
 * shows up as the picture stepping sideways a pixel at a time instead of
 * gliding — the "zoompan jitter" every forum thread complains about. The fix is
 * to give it more input pixels than it needs: supersampling the source by 2×
 * before zoompan makes one input pixel half an output pixel, and the stepping
 * drops below what the eye resolves. `supersampleFor` works out when it is
 * worth the memory and when the source already has pixels to spare.
 *
 * ── THE EXPRESSIONS ARE GENERATED, NOT WRITTEN ───────────────────────────────
 * A demo's camera is a piecewise function of time: still, ramp in, hold, ramp
 * out, still. Each piece becomes one gated term of a SUM, and the ramps carry
 * their easing inline, built with `st()`/`ld()` registers so the easing
 * polynomial appears once per term rather than three times.
 *
 * A sum and not a nested `if()` chain, which is what this was: ffmpeg parses
 * expressions by recursive descent and gives up somewhere around a hundred
 * levels, so a chain one branch per keyframe long broke every demo past about
 * twenty-three zooms — and broke it as "Failed to configure output pad", which
 * names nothing. Gated terms are flat however many there are. See fieldExpr.
 *
 * Following zooms cannot be analytic — the camera is chasing a path that came
 * out of a frame difference — so those stretches are sampled at FOLLOW_HZ and
 * interpolated linearly between samples. At ten samples a second against a
 * damped, already-smoothed cursor path, linear and eased are the same picture.
 *
 * ── NEVER LINEAR ─────────────────────────────────────────────────────────────
 * The easing is not decoration. A constant-rate zoom is the single clearest
 * tell that a video was edited by a machine: real camera moves accelerate out
 * of rest and settle into place, and the eye reads a linear one as a fault in
 * the playback rather than a move.
 */
import { EASE, rampsOf, activeZooms, cameraAt, clampRect, layout, toSource, drawnTrack } from "../timeline.js";

/** Samples per second for a zoom that follows the pointer. */
const FOLLOW_HZ = 10;

const round4 = (v) => Math.round(v * 10000) / 10000;
const round3 = (v) => Math.round(v * 1000) / 1000;

/**
 * How much to enlarge the source before zoompan sees it.
 *
 * Only ever an enlargement, never a reduction: a source with pixels to spare
 * already defeats the rounding, and shrinking it first would throw away the
 * detail the zoom exists to show. Capped at 2×, because the memory cost is
 * quadratic and the benefit past 2× is below the noise floor of an H.264 encode.
 */
/**
 * ── AND THE STEP THAT MATTERS IS A FRACTION OF THE PICTURE, NOT A PIXEL ──────
 * The rule below asks for twice the output width, which puts zoompan's
 * rounding at half an output pixel whatever the export is. That is the right
 * target at 1080p and far past it at 4K: half a pixel of 3840 is a quarter of
 * the picture-fraction that half a pixel of 1920 is, and nobody can see the
 * difference. What it costs is not nothing — a 4K export was supersampling to
 * 7680 × 4320, thirty-three megapixels a frame, four times the filter work of
 * the 1080p case on top of four times the encode.
 *
 * So there is a second ceiling: never resample finer than one part in 3840 of
 * the picture, which is exactly the fineness a 1080p export already gets. A 4K
 * source then needs no supersampling at all — its own pixels are already that
 * fine — and everything at or below 1080p is unchanged to the pixel.
 */
const FINE_ENOUGH_WIDTH = 3840;

export function supersampleFor({ sourceWidth, videoWidth }) {
  if (!(sourceWidth > 0) || !(videoWidth > 0)) return 1;
  // Half an output pixel of rounding...
  const want = (videoWidth * 2) / sourceWidth;
  // ...but never finer than one part in 3840 of the finished picture.
  const enough = FINE_ENOUGH_WIDTH / sourceWidth;
  return Math.min(2, Math.max(1, Math.round(Math.min(want, enough) * 100) / 100));
}

/* ────────────────────────────────────────────────────────────────────────────
   The camera, sampled
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The camera as a list of keys in OUTPUT time: the fewest points that describe
 * the move, each marked with how to get there from the one before.
 *
 * A zoom in the recording becomes one of these per surviving stretch of it. A
 * zoom that straddles a cut is two moves with the removed seconds gone from
 * between them, which is what stops a cut from dragging the camera with it.
 *
 * @returns {Array<{ t, x, y, w, ease }>} ease is how to reach THIS key
 */
export function cameraKeys(tl, { fps = 30 } = {}) {
  const lay = layout(tl);
  const zooms = activeZooms(tl);
  const track = drawnTrack(tl);
  if (!zooms.length) return [];

  const keys = [];
  const push = (t, rect, ease) => {
    const k = {
      t: round3(Math.max(0, t)),
      x: round4(rect.x),
      y: round4(rect.y),
      w: round4(rect.w),
      ease: ease || "linear",
    };
    const prev = keys[keys.length - 1];
    if (prev && k.t <= prev.t + 1 / (fps * 2)) {
      // Two keys inside one frame: the later one wins, there is no time
      // between them to animate across.
      keys[keys.length - 1] = { ...k, t: prev.t };
      return;
    }
    // A key equal to the one before it is NOT redundant, and dropping it was a
    // bug worth a comment. Two equal keys are what a plateau IS: the pair
    // (2.0s zoomed, 4.5s zoomed) is the hold, and the pair (5.05s wide,
    // 6.68s wide) is the stillness before the next move. Deduping them left the
    // camera creeping from one zoom straight into the next for the whole
    // recording, never resting anywhere. Equal neighbours cost one constant
    // branch each in the expression, which is nothing.
    keys.push(k);
  };

  const FULL = { x: 0, y: 0, w: 1, h: 1 };
  const at = (srcT) => cameraAt(tl, srcT, { track });

  for (const z of zooms) {
    // In and out are separate moves with separate lengths and curves: see
    // timeline.js rampsOf. A click zoom eases in over half a second and snaps
    // out in a fifth of one.
    const r = rampsOf(z);
    const inStart = Math.max(0, z.start - r.in);
    const outEnd = Math.min(tl.duration, z.end + r.out);

    // ── The move in ───────────────────────────────────────────────────────
    for (const span of spansOf(inStart, z.start, lay)) {
      push(span.start, FULL, "linear");
      push(span.end, at(span.src_end), r.easeIn);
    }

    // ── The hold ──────────────────────────────────────────────────────────
    for (const span of spansOf(z.start, z.end, lay)) {
      if (z.follow && track?.length) {
        const step = 1 / FOLLOW_HZ;
        for (let t = span.src_start; t < span.src_end; t += step) {
          push(span.start + (t - span.src_start), at(t), "linear");
        }
        push(span.end, at(span.src_end), "linear");
      } else {
        const rect = at((span.src_start + span.src_end) / 2);
        push(span.start, rect, r.easeIn);
        push(span.end, rect, "hold");
      }
    }

    // ── The move out ──────────────────────────────────────────────────────
    for (const span of spansOf(z.end, outEnd, lay)) {
      push(span.start, at(span.src_start), "hold");
      push(span.end, FULL, r.easeOut);
    }
  }

  return thinKeys(keys.sort((a, b) => a.t - b.t));
}

/**
 * The most keyframes one camera expression may carry.
 *
 * ── A CEILING, NOT A TARGET ──────────────────────────────────────────────────
 * Flattening the expression (see fieldExpr) moved the wall from 92 keys to
 * something over 200, measured. This sits well inside that, because the number
 * that matters is not the one where it breaks but the one where it is CERTAIN
 * not to — and the failure mode is a demo that will not export at all, reported
 * as an ffmpeg error nobody can read.
 *
 * Ordinary work never comes near it: a click zoom is four keys, so this is
 * forty of them in one recording. It is reached by a long demo full of FOLLOW
 * zooms, which sample the pointer at FOLLOW_HZ and can emit ten keys a second.
 */
const MAX_KEYS = 160;

/**
 * The same camera move, with the keys that were not saying anything removed.
 *
 * ── WHICH ONES GO ────────────────────────────────────────────────────────────
 * A key that sits on the straight line between its neighbours describes nothing
 * the line does not already describe. Following a pointer at ten samples a
 * second across a slow drag produces a great many of those, and they are the
 * whole reason a long demo can run out of expression.
 *
 * So the least informative key is dropped, repeatedly, until the rest fit —
 * measuring "least informative" as how far it deviates from the chord between
 * its neighbours, in all three of x, y and w at once. That is Douglas–Peucker's
 * criterion, applied greedily.
 *
 * ── AND WHICH NEVER GO ───────────────────────────────────────────────────────
 * Anything that is not a LINEAR key. The first and last of a ramp, the ends of
 * a hold, and every eased key carry the SHAPE of the move: an eased key is not
 * on the chord by definition, and dropping one turns a curve into a straight
 * line. Only the interpolation points between them are ever candidates.
 */
function thinKeys(keys) {
  if (keys.length <= MAX_KEYS) return keys;

  const out = [...keys];
  const droppable = (i) => i > 0 && i < out.length - 1 && (out[i].ease || "linear") === "linear";

  // How far key i sits off the line from i-1 to i+1, over x, y and w together.
  const sag = (i) => {
    const a = out[i - 1];
    const b = out[i];
    const c = out[i + 1];
    const span = c.t - a.t;
    if (span <= 0) return 0;
    const f = (b.t - a.t) / span;
    return (
      Math.abs(b.x - (a.x + (c.x - a.x) * f)) +
      Math.abs(b.y - (a.y + (c.y - a.y) * f)) +
      Math.abs(b.w - (a.w + (c.w - a.w) * f))
    );
  };

  const before = out.length;
  while (out.length > MAX_KEYS) {
    let at = -1;
    let least = Infinity;
    for (let i = 1; i < out.length - 1; i++) {
      if (!droppable(i)) continue;
      const d = sag(i);
      if (d < least) {
        least = d;
        at = i;
      }
    }
    // Nothing left that may be dropped: every remaining key carries shape. A
    // camera this complicated is past what one expression can hold, and cutting
    // an eased key would be a visible change to the move. Better a long
    // expression than a wrong one; fieldExpr is flat and has the headroom.
    if (at < 0) break;
    out.splice(at, 1);
  }

  if (out.length < before) {
    console.log(`[studio] camera: ${before} keyframes thinned to ${out.length} (the flat ones between moves)`);
  }
  return out;
}

/** The output-time stretches a source-time span survives as. */
function spansOf(start, end, lay) {
  const out = [];
  for (const s of lay.segments) {
    const a = Math.max(start, s.src_start);
    const b = Math.min(end, s.src_end);
    if (b - a > 0.001) {
      out.push({
        start: s.out_start + (a - s.src_start),
        end: s.out_start + (b - s.src_start),
        src_start: a,
        src_end: b,
      });
    }
  }
  return out;
}

/**
 * The camera at a moment of the finished video, from the keys.
 * The browser preview and the overlay renderer both read the camera through
 * this, so all three agree on where the frame is at any instant.
 */
export function cameraAtOutput(keys, t) {
  const FULL = { x: 0, y: 0, w: 1, h: 1 };
  if (!keys?.length) return FULL;
  if (t <= keys[0].t) return rectOf(keys[0]);

  let lo = 0;
  let hi = keys.length - 1;
  if (t >= keys[hi].t) return rectOf(keys[hi]);
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keys[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = keys[lo];
  const b = keys[hi];
  if (b.ease === "hold") return rectOf(a);

  const span = b.t - a.t;
  const raw = span > 0 ? (t - a.t) / span : 1;
  const k = (EASE[b.ease] || EASE.linear)(Math.min(1, Math.max(0, raw)));
  return clampRect({
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    w: a.w + (b.w - a.w) * k,
    h: a.w + (b.w - a.w) * k,
  });
}

const rectOf = (k) => clampRect({ x: k.x, y: k.y, w: k.w, h: k.w });

/* ────────────────────────────────────────────────────────────────────────────
   Keys → ffmpeg expressions
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * ffmpeg's easing curves, written in its own expression language.
 *
 * `ld(0)` holds the branch's progress, already stored by the caller. Each one
 * is the exact function EASE in timeline.js applies, so the preview and the
 * export move identically — the browser and ffmpeg are computing the same
 * polynomial, not two similar ones.
 */
const EASE_EXPR = {
  smooth: "if(lt(ld(0),0.5), 4*ld(0)*ld(0)*ld(0), 1-pow(-2*ld(0)+2,3)/2)",
  snappy: "1-pow(1-ld(0),4)",
  slow: "if(lt(ld(0),0.5), 2*ld(0)*ld(0), 1-pow(-2*ld(0)+2,2)/2)",
  linear: "ld(0)",
  hold: "0",
};

/**
 * One piecewise expression over the keys, for whichever field is asked for.
 *
 * `T` is the expression that gives the current time. zoompan has no `t`: it
 * counts output frames in `on`, so time is `on/fps` and nothing else works.
 *
 * ── IT IS A SUM, AND IT USED TO BE A NESTED if() CHAIN ───────────────────────
 * The obvious way to write a piecewise function here is one `if()` per segment,
 * each one's `else` being the whole of the rest — and that is what this did.
 * It is correct, it is compact, and past a certain length ffmpeg cannot parse
 * it: av_expr_parse is recursive descent, and a chain N segments long is N
 * levels deep.
 *
 * Measured, against real ffmpeg on a real clip:
 *
 *   nested, tiny branches    fine at 80 levels, FAILS at 100 — on 1,800 chars
 *   flat sum, real easing    fine at 200 terms — on 26,000 chars
 *
 * So the wall is DEPTH, and length barely matters until three times further
 * out. In production that wall arrived at 92 keys, which is 23 zooms: every
 * demo longer than about a minute failed to export, with
 *
 *   [Parsed_zoompan_3] Failed to configure output pad
 *   Nothing was written into output file
 *
 * and nothing anywhere saying the expression was the problem.
 *
 * A piecewise function does not need nesting. Each segment is gated by a
 * half-open test and the gated values are ADDED: exactly one gate is ever 1, so
 * the sum is the piece that applies. Depth becomes a constant no matter how
 * many segments there are.
 *
 * ── WHAT IT COSTS, AND WHY THAT IS FINE ──────────────────────────────────────
 * if() short-circuits and a sum does not, so every segment's easing is now
 * evaluated on every frame rather than just the one in range. That is a few
 * thousand arithmetic operations per frame against a full-frame bicubic rescale
 * and an H.264 encode — unmeasurable next to either.
 */
function fieldExpr(keys, field, T, { scale = 1, offset = 0 } = {}) {
  const val = (k) => round4(k[field] * scale + offset);
  if (!keys.length) return String(offset);
  if (keys.length === 1) return String(val(keys[0]));

  const terms = [];

  // Before the first key the camera is wherever the first key says.
  terms.push(`lt(${T},${keys[0].t})*${val(keys[0])}`);

  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    const span = b.t - a.t;
    const from = val(a);
    const to = val(b);

    /**
     * Half-open, [a, b). Closed on both ends would double-count every boundary
     * — two gates true at once, two values added, and the camera jumping to
     * roughly twice its position for one frame at every keyframe.
     */
    const gate = `gte(${T},${a.t})*lt(${T},${b.t})`;

    if (b.ease === "hold" || span <= 0 || Math.abs(to - from) < 1e-6) {
      if (Math.abs(from) > 1e-9) terms.push(`${gate}*${from}`);
      continue;
    }

    const ease = EASE_EXPR[b.ease] || EASE_EXPR.linear;
    /**
     * `st(0, …)*0 + …` is the idiom for storing a value without adding it to
     * the result: st() RETURNS what it stored, so the multiply by zero is what
     * keeps the progress out of the arithmetic.
     *
     * ── AND SHARING SLOT 0 IS STILL SAFE, FOR A DIFFERENT REASON ────────────
     * It used to be safe because only one branch of the chain ever ran. Now
     * every term runs, so the reason is the other one: operands evaluate left
     * to right, and each term writes slot 0 and reads it back inside itself
     * before the next term is reached. A term is self-contained; the register
     * never has to survive one.
     */
    terms.push(`${gate}*(st(0,clip((${T}-${a.t})/${round3(span)},0,1))*0+(${from}+(${round4(to - from)})*(${ease})))`);
  }

  // At and after the last key the camera stays where the last key put it.
  const last = keys[keys.length - 1];
  terms.push(`gte(${T},${last.t})*${val(last)}`);

  return `(${terms.join("+")})`;
}

/**
 * The zoom filter for a timeline, or null when the camera never moves.
 *
 * @param {object} o
 * @param {number} o.videoWidth   the video layer's output size
 * @param {number} o.videoHeight
 * @param {number} o.sourceWidth  the base video's own size
 * @param {number} o.sourceHeight
 * @param {number} o.fps
 * @returns {{ filters: string[], keys: Array, supersample: number } | null}
 */
export function zoomFilter(tl, { videoWidth, videoHeight, sourceWidth, sourceHeight, fps }) {
  const keys = cameraKeys(tl, { fps });
  if (!keys.length) return null;

  const S = supersampleFor({ sourceWidth, videoWidth });
  const T = `(on/${fps})`;

  // ── z ─────────────────────────────────────────────────────────────────────
  // zoompan crops iw/z wide, so the zoom factor is the reciprocal of the share
  // of the frame the camera is holding. Floored at 1: zoompan refuses anything
  // below it, and below it would mean showing more than the source has.
  const zKeys = keys.map((k) => ({ ...k, z: Math.max(1, 1 / Math.max(k.w, 1e-6)) }));
  const z = `max(1,${fieldExpr(zKeys, "z", T)})`;

  // ── x, y ──────────────────────────────────────────────────────────────────
  // Top-left of the crop, in INPUT pixels — which after supersampling are the
  // enlarged ones, hence iw/ih rather than the source's own numbers.
  const x = `max(0,min(iw-iw/zoom,${fieldExpr(keys, "x", T, { scale: 1 })}*iw))`;
  const y = `max(0,min(ih-ih/zoom,${fieldExpr(keys, "y", T, { scale: 1 })}*ih))`;

  const filters = [];
  if (S > 1.001) {
    // Even dimensions, and bicubic: the enlargement exists to give zoompan
    // sub-pixel room, and a nearest-neighbour one would give it none.
    filters.push(`scale=w=ceil(iw*${S}/2)*2:h=ceil(ih*${S}/2)*2:flags=bicubic`);
  }
  filters.push(
    `zoompan=z='${z}':x='${x}':y='${y}':d=1:s=${videoWidth}x${videoHeight}:fps=${fps}`,
    // zoompan sets a sample aspect ratio from its own arithmetic; left alone it
    // reaches the encoder as a stretched picture on non-square-pixel sources.
    "setsar=1"
  );

  return { filters, keys, supersample: S };
}

/**
 * The camera sampled at every output frame, for the overlay renderer.
 *
 * The overlay is drawn in the FINISHED frame's coordinates, so the cursor and
 * every annotation has to be projected through whatever the camera is doing at
 * that instant. Reading it from the same keys the filter was built from is what
 * guarantees an arrow lands on the button it is pointing at.
 */
export function sampleCamera(keys, { duration, fps }) {
  const n = Math.max(1, Math.round(duration * fps));
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = cameraAtOutput(keys, i / fps);
  return out;
}

/** Which moment of the recording a given output frame came from. */
export function sourceTimes(tl, { duration, fps }) {
  const lay = layout(tl);
  const n = Math.max(1, Math.round(duration * fps));
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = toSource(i / fps, lay);
  return out;
}

export default { supersampleFor, cameraKeys, cameraAtOutput, zoomFilter, sampleCamera, sourceTimes };

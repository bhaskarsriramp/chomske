/**
 * follow.mjs: where a followed blur is, at any moment. Shared by the editor's
 * preview and the export (backend services/studio/render/compose.js), for the
 * same reason camera.mjs is: a blur drawn one place in the preview and another
 * in the file is a secret published by the export alone.
 *
 * A blur's FOLLOW is what the tracker (backend services/studio/blurTrack.js)
 * found when it followed the blur's patch through the recording:
 *
 *   { v, sig, at, keys: [[t, x, y, on], ...], held: [[t0, t1], ...], trackable }
 *
 * keys are steps, not a curve: from time t (a real frame of the recording) the
 * rectangle's top-left is at (x, y), fractions of the frame, drawn when on is
 * 1, until the next key. Steps because the recording moves in steps, one frame
 * at a time; a blur eased between two frames would sit half way between where
 * the secret was and where it is.
 *
 * A follow belongs to one exact blur: its rectangle, the moment it was placed
 * on, and its span. `sig` says which, and a follow whose sig no longer matches
 * its blur (the creator moved it, resized it, or changed when it runs) is not
 * used at all, by anything, until it has been followed again.
 */

// Rounded with Math.round first, the way the server's timeline sanitizer
// stores them (round4, round3): toFixed alone can round an exact half the
// other way, and a signature that differs by one digit is a blur never
// matched by its own follow. "x" for not set: +null is 0, and a blur never
// placed must not sign as one placed at the first frame.
const f4 = (v) => (v == null || !Number.isFinite(+v) ? "x" : (Math.round(+v * 1e4) / 1e4).toFixed(4));
const f3 = (v) => (v == null || !Number.isFinite(+v) ? "x" : (Math.round(+v * 1e3) / 1e3).toFixed(3));

/** Which exact blur a follow was made for. */
export function blurSig(b) {
  return [f4(b.x), f4(b.y), f4(b.w), f4(b.h), f3(b.at), f3(b.start), f3(b.end)].join(",");
}

/** The follow for this blur, if there is one and it is still this blur's. */
export function followFor(follows, blur) {
  const f = follows?.[blur?.id];
  return f && f.trackable && Array.isArray(f.keys) && f.keys.length && f.sig === blurSig(blur) ? f : null;
}

/**
 * Where the followed rectangle is at recording time t: { x, y, on }. Before
 * the first key it is where the first key puts it.
 */
export function followAt(follow, t) {
  const k = follow.keys;
  let lo = 0;
  let hi = k.length - 1;
  if (t < k[0][0]) return { x: k[0][1], y: k[0][2], on: !!k[0][3] };
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (k[mid][0] <= t + 1e-6) lo = mid;
    else hi = mid - 1;
  }
  return { x: k[lo][1], y: k[lo][2], on: !!k[lo][3] };
}

/** Whether t falls in a stretch where the tracker lost it and held it in place. */
export function heldAt(follow, t) {
  return (follow?.held || []).some(([a, b]) => t >= a - 1e-6 && t <= b + 1e-6);
}

const follow = { blurSig, followFor, followAt, heldAt };
export default follow;

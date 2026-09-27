/**
 * follow.mjs: where a followed blur is, at any moment. Shared by the editor's
 * preview and the export (backend services/studio/render/compose.js), for the
 * same reason camera.mjs is: a blur drawn one place in the preview and another
 * in the file is a secret published by the export alone.
 *
 * A blur's FOLLOW is what the tracker (backend services/studio/blurTrack.js)
 * found when it followed the blur's patch through the recording:
 *
 *   { v, sig, at, keys: [[t, x, y, on, s], ...], held: [[t0, t1], ...], trackable }
 *
 * keys are steps, not a curve: from time t (a real frame of the recording) the
 * rectangle's top-left is at (x, y), fractions of the frame, it is s times the
 * size it was drawn (what it covers can zoom; follows made before that have
 * no s, which is 1), and it is drawn when on is 1, until the next key. Steps because the recording moves in steps, one frame
 * at a time; a blur eased between two frames would sit half way between where
 * the secret was and where it is.
 *
 * A follow belongs to one exact blur: its rectangle, the moment it was placed
 * on, and its span. `sig` says which, and a follow whose sig no longer matches
 * its blur (the creator moved it, resized it, or changed when it runs) is not
 * used at all, by anything, until it has been applied again (applyState).
 */

// Rounded with Math.round first, the way the server's timeline sanitizer
// stores them (round4, round3): toFixed alone can round an exact half the
// other way, and a signature that differs by one digit is a blur never
// matched by its own follow. "x" for not set: +null is 0, and a blur never
// placed must not sign as one placed at the first frame.
const f4 = (v) => (v == null || !Number.isFinite(+v) ? "x" : (Math.round(+v * 1e4) / 1e4).toFixed(4));
const f3 = (v) => (v == null || !Number.isFinite(+v) ? "x" : (Math.round(+v * 1e3) / 1e3).toFixed(3));

/**
 * The tracker a follow must come from to be used. Raised when the tracker
 * changes what it gets right, so a blur applied by an older one shows as not
 * applied (one click to apply again) instead of carrying its mistakes on:
 * 4 follows zoom, and never moves to a different copy of the same text.
 * The backend's tracker stamps its follows with this same number.
 */
export const FOLLOW_VERSION = 4;

/** Which exact blur a follow was made for. */
export function blurSig(b) {
  return [f4(b.x), f4(b.y), f4(b.w), f4(b.h), f3(b.at), f3(b.start), f3(b.end)].join(",");
}

/** The follow for this blur, if there is one and it is still this blur's. */
export function followFor(follows, blur) {
  const f = follows?.[blur?.id];
  return f && f.trackable && Array.isArray(f.keys) && f.keys.length && (f.v || 0) >= FOLLOW_VERSION && f.sig === blurSig(blur) ? f : null;
}

/**
 * Where the followed rectangle is at recording time t: { x, y, on, s }, s the
 * size it is drawn at as a multiple of the size it was drawn. Before the first
 * key it is where the first key puts it.
 */
export function followAt(follow, t) {
  const k = follow.keys;
  let lo = 0;
  let hi = k.length - 1;
  if (t < k[0][0]) lo = 0;
  else {
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (k[mid][0] <= t + 1e-6) lo = mid;
      else hi = mid - 1;
    }
  }
  return { x: k[lo][1], y: k[lo][2], on: !!k[lo][3], s: k[lo][4] || 1 };
}

/** Whether t falls in a stretch where the tracker lost it and held it in place. */
export function heldAt(follow, t) {
  return (follow?.held || []).some(([a, b]) => t >= a - 1e-6 && t <= b + 1e-6);
}

/**
 * Where a followed blur is drawn: [[t0, t1], ...] in recording time, the
 * stretches its keys have it on, the last running to `end` (the blur's end,
 * where the tracker stopped looking).
 */
export function coverage(follow, end) {
  const out = [];
  const k = follow?.keys || [];
  for (let i = 0; i < k.length; i++) {
    if (!k[i][3]) continue;
    const t0 = k[i][0];
    const t1 = i + 1 < k.length ? k[i + 1][0] : end;
    const last = out[out.length - 1];
    if (last && Math.abs(last[1] - t0) < 1e-6) last[1] = t1;
    else if (t1 > t0) out.push([t0, t1]);
  }
  return out;
}

/**
 * ── APPLYING A BLUR ──────────────────────────────────────────────────────────
 * A blur is placed by hand (a rectangle over the secret, at one moment) and
 * then APPLIED: followed through the whole recording, so it covers the secret
 * wherever and whenever it is on screen. Applying is something the creator
 * asks for and watches happen, not something that happens behind their back,
 * because a blur that silently stands still while the page scrolls reads as a
 * blur that does not work. One answer to "where is this blur at", for every
 * place that shows it (the timeline, the Blur panel, the picture, Export):
 *
 *   unapplied  never applied as it is now: new, or changed since
 *   applying   { progress 0-1, waiting (not started yet), slow }
 *   applied    follows what it covers
 *   still      applied, but nothing under it to recognise; it stays put
 *   failed     { message }
 *
 * Where the tracker lost sight of the thing for a moment and held the blur
 * still (`held`) is not a state of its own any more: it is not something the
 * creator can act on, and a warning on every applied blur read as the apply
 * not working. The blur covers there; the tracker's job is to make those
 * moments rare, not the creator's to review them.
 *
 * `following` is the editor's own record of what it asked for: { [id]: { sig,
 * progress, waiting, slow, failed, message } }.
 */
export function applyState(b, follows, following) {
  const sig = blurSig(b);
  const f = follows?.[b.id];
  if (f && f.sig === sig && (f.v || 0) >= FOLLOW_VERSION) {
    if (!f.trackable) return { kind: "still" };
    return { kind: "applied" };
  }
  const run = following?.[b.id];
  if (run && run.sig === sig) {
    if (run.failed) return { kind: "failed", message: run.message || "" };
    return { kind: "applying", progress: run.progress || 0, waiting: !!run.waiting, slow: !!run.slow };
  }
  return { kind: "unapplied" };
}

/**
 * Each blur's name, for the Blur panel and the timeline alike: its label, or
 * "Blur n", numbered in the order they sit in the recording (where each was
 * placed), so the same blur has the same number in both.
 */
export function blurNames(blurs) {
  const order = (blurs || [])
    .map((b, i) => ({ b, i, t: b.at ?? b.start ?? 0 }))
    .sort((u, v) => u.t - v.t || u.i - v.i);
  return new Map(order.map(({ b }, k) => [b.id, b.label || `Blur ${k + 1}`]));
}

const follow = { FOLLOW_VERSION, blurSig, followFor, followAt, heldAt, coverage, applyState, blurNames };
export default follow;

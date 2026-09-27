/**
 * foundBlurs.js: when a blur the vision pass found is a thing already covered.
 *
 * The vision pass (vision.js joinRegions) never merges sightings on a guess: a
 * thing seen again after a gap, or scrolled a long way between two samples,
 * comes out as two blurs, and each is applied (followed) like one drawn by
 * hand. Once one of them has a follow it can be ASKED: at the moment the other
 * was found, is this one on, over the same box? Then they are one thing, and
 * the found one that came later goes (studioRunner dropFoundTwins).
 */
import { followFor, followAt, heldAt } from "../../../src/components/Studio/follow.mjs";

/** How much of the smaller box two must share to be one thing. */
const SAME_SHARE = 0.6;

/**
 * The blur that already covers found blur `b` where it was found, or null:
 * one drawn by hand, or one found earlier (so two found blurs can never each
 * drop the other), whose follow has it on over b's box at b's moment. Only
 * where the tracker SAW it: a stretch it held in place after losing sight of
 * its thing proves nothing about what is there.
 */
export function twinOf(b, blurs, follows) {
  if (!b?.auto || b.at == null) return null;
  for (const a of blurs || []) {
    if (a.id === b.id) continue;
    if (a.auto && !(a.at != null && (a.at < b.at || (a.at === b.at && a.id < b.id)))) continue;
    const f = followFor(follows, a);
    if (!f || heldAt(f, b.at)) continue;
    const p = followAt(f, b.at);
    if (!p.on) continue;
    const r = { x: p.x, y: p.y, w: a.w * p.s, h: a.h * p.s };
    const ix = Math.max(0, Math.min(r.x + r.w, b.x + b.w) - Math.max(r.x, b.x));
    const iy = Math.max(0, Math.min(r.y + r.h, b.y + b.h) - Math.max(r.y, b.y));
    if ((ix * iy) / Math.max(1e-9, Math.min(r.w * r.h, b.w * b.h)) >= SAME_SHARE) return a;
  }
  return null;
}

export default { twinOf };

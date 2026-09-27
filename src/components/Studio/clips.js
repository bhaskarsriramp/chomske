/**
 * clips.js: the recording as clips.
 *
 * A clip is a stretch of the recording that plays. Two things end one: a cut,
 * where time was taken out, and a split, where the creator pointed at the
 * video lane and chose "Cut here". A split takes nothing out; it is only the
 * line between two clips, so that either can then be deleted on its own.
 *
 * Nothing here is stored. Clips are read off the timeline's cuts and splits
 * every time, which is what keeps them from ever disagreeing with what plays.
 * Deleting a clip is adding a cut over it, so the renderer, which knows only
 * cuts, needs nothing new.
 *
 * Everything is in RECORDING time (src_*) with the output position alongside
 * (out_*) for drawing and for the times a creator reads, which are the
 * finished video's.
 */
import { newId, clamp, mergedCuts } from "./model";

/** No clip is made shorter than this, and no split goes closer to an edge. */
export const MIN_CLIP = 0.2;

const round3 = (v) => Math.round(v * 1000) / 1000;
const EPS = 0.002;

/**
 * A clip's id: where it starts in the recording, which does not move when
 * anything before it is cut or restored.
 */
export const clipIdAt = (srcStart) => `clip${Math.round(srcStart * 1000)}`;

/**
 * The clips, in playing order, numbered from 1.
 * @param {object} tl   the timeline
 * @param {object} lay  layout(tl), which the caller has already
 */
export function clipsOf(tl, lay) {
  const splits = (tl.splits || []).slice().sort((a, b) => a - b);
  const out = [];
  for (const s of lay.segments || []) {
    const inner = splits.filter((x) => x > s.src_start + MIN_CLIP / 2 && x < s.src_end - MIN_CLIP / 2);
    let a = s.src_start;
    for (const b of [...inner, s.src_end]) {
      if (b - a >= 0.05) {
        out.push({
          id: clipIdAt(a),
          src_start: a,
          src_end: b,
          out_start: s.out_start + (a - s.src_start),
          out_end: s.out_start + (b - s.src_start),
        });
      }
      a = b;
    }
  }
  return out.map((c, i) => ({ ...c, n: i + 1 }));
}

/**
 * Split the clip under a recording-time moment, or null when that is too close
 * to a clip's edge to leave two usable clips.
 */
export function splitPatch(tl, lay, srcT) {
  const at = round3(srcT);
  const clip = clipsOf(tl, lay).find((c) => at > c.src_start && at < c.src_end);
  if (!clip || at - clip.src_start < MIN_CLIP || clip.src_end - at < MIN_CLIP) return null;
  return { splits: [...(tl.splits || []), at].sort((a, b) => a - b) };
}

/**
 * How far each edge of a clip can be dragged, in recording time.
 *
 * Inward, until the clip is MIN_CLIP long. Outward, only back over footage that
 * was taken out right beside it: a clip cannot grow into its neighbour, whose
 * footage it would then share, so an edge against another clip (a split) does
 * not move outward at all, and neither does one at the start or end of the
 * recording.
 */
export function trimBounds(tl, clip) {
  const cuts = mergedCuts(tl);
  const before = cuts.find((c) => Math.abs(c.end - clip.src_start) < EPS);
  const after = cuts.find((c) => Math.abs(c.start - clip.src_end) < EPS);
  return {
    start: [before ? before.start : clip.src_start, clip.src_end - MIN_CLIP],
    end: [clip.src_start + MIN_CLIP, after ? after.end : clip.src_end],
  };
}

/** The stored cuts with [lo, hi] put back, splitting a cut that spans it. */
function restore(cuts, lo, hi) {
  const out = [];
  for (const c of cuts) {
    if (c.end <= lo + EPS || c.start >= hi - EPS) {
      out.push(c);
      continue;
    }
    if (c.start < lo - 0.02) out.push({ ...c, end: round3(lo) });
    if (c.end > hi + 0.02) out.push({ ...c, id: newId("cut"), start: round3(hi) });
  }
  return out;
}

/**
 * Move one edge of a clip to `to` (recording time, clamped to trimBounds).
 *
 *   inward   the stretch between the old edge and the new one is cut
 *   outward  the stretch is restored, and a split marks the new edge so the
 *            footage that came back belongs to THIS clip, not its neighbour
 *
 * Returns the patch and where the clip now starts (its id follows its start),
 * or null when the edge did not really move.
 */
export function trimPatch(tl, clip, side, to) {
  const [lo, hi] = trimBounds(tl, clip)[side];
  const t = round3(clamp(to, lo, hi));
  let cuts = tl.cuts || [];
  let splits = tl.splits || [];

  if (side === "end") {
    const b = clip.src_end;
    if (Math.abs(t - b) < 0.01) return null;
    if (t < b) {
      cuts = [...cuts, { id: newId("cut"), start: t, end: round3(b), reason: "manual", auto: false }];
      splits = splits.filter((x) => !(x > t && x < b));
    } else {
      cuts = restore(cuts, b, t);
      splits = [...splits.filter((x) => !(x >= b - EPS && x < t)), t];
    }
  } else {
    const a = clip.src_start;
    if (Math.abs(t - a) < 0.01) return null;
    if (t > a) {
      cuts = [...cuts, { id: newId("cut"), start: round3(a), end: t, reason: "manual", auto: false }];
      splits = splits.filter((x) => !(x > a && x < t));
    } else {
      cuts = restore(cuts, t, a);
      splits = [...splits.filter((x) => !(x > t && x <= a + EPS)), t];
    }
  }

  return {
    patch: { cuts, splits: [...new Set(splits.map(round3))].sort((x, y) => x - y) },
    start: side === "start" ? t : clip.src_start,
  };
}

/**
 * Take one clip out: a cut over exactly its stretch. The splits inside it go
 * (there is nothing left for them to divide); the ones at its edges stay, so
 * restoring the cut brings the clip back as the clip it was, not merged into
 * its neighbours.
 */
export function deleteClipPatch(tl, clip) {
  return {
    cuts: [
      ...(tl.cuts || []),
      { id: newId("cut"), start: round3(clip.src_start), end: round3(clip.src_end), reason: "manual", auto: false },
    ],
    splits: (tl.splits || []).filter((x) => !(x > clip.src_start && x < clip.src_end)),
  };
}

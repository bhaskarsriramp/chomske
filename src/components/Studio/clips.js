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
import { newId } from "./model";

/** No clip is made shorter than this, and no split goes closer to an edge. */
export const MIN_CLIP = 0.2;

const round3 = (v) => Math.round(v * 1000) / 1000;

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
          // Named by where it starts in the recording, which does not move when
          // anything before it is cut or restored.
          id: `clip${Math.round(a * 1000)}`,
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

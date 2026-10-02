/**
 * placement.js: where every scene lands, in frames. Plain JS so the pipeline
 * (Node) and the composition (webpack) place scenes with the same arithmetic.
 *
 * Each scene starts OVERLAP frames before the last one ends, while the last
 * one blurs away, so a cut is never a hard edge.
 */
import { SCENE_TYPES } from "./library.js";

export const FPS = 30;
export const OVERLAP = 10;
/** The voice starts this many frames into its scene, once the first words are on screen. */
export const VOICE_LEAD = 8;

export function placeScenes(board, fps = FPS) {
  let at = 0;
  return (board?.scenes || [])
    .filter((s) => SCENE_TYPES.includes(s.type))
    .map((scene, i) => {
      const dur = Math.max(45, Math.round((Number(scene.seconds) || 3) * fps));
      const from = i === 0 ? 0 : at - OVERLAP;
      at = from + dur;
      return { scene, from, dur };
    });
}

export const durationOf = (board, fps = FPS) => {
  const placed = placeScenes(board, fps);
  return placed.length ? placed[placed.length - 1].from + placed[placed.length - 1].dur : fps * 5;
};

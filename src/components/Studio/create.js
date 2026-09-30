/**
 * create.js: what a new zoom, blur or caption is, in one place.
 *
 * There are two ways to make each of them: the Add button in its panel, and
 * clicking an empty stretch of its lane on the timeline. They have to make the
 * same thing, or a zoom added one way would behave differently from a zoom
 * added the other, so both come here.
 *
 * `start` and `end` are recording time, like everything stored. `end` is
 * optional: without one, each kind gets the length its panel always gave it.
 */
import { newId, clamp } from "./model";
import { zoomOutGap } from "./camera.mjs";

/** How long each kind runs when nobody has said, in seconds. Infinity is "to the end". */
export const DEFAULT_LENGTH = { zoom: 2.5, blur: Infinity, cue: 1.8 };

/** How much room each kind needs before it is worth making. */
export const MIN_LENGTH = { zoom: 0.4, blur: 0.4, cue: 0.4 };

/**
 * Shorter than this, a zoom ended early for the next one is not worth having
 * on its own, and it runs up to the next one instead.
 */
const MIN_OWN = 0.8;

/**
 * A new zoom's end, brought in so the camera pulls all the way out before the
 * next zoom starts (camera.mjs zoomOutGap). Clicking the lane just before a
 * zoom used to make one that ended exactly where the next began, and Add made
 * one that ran into it and was cut back to the same place on save: either way
 * the camera slid from one into the other and the two played as one long zoom.
 */
export function fitBeforeNext(item, zooms) {
  const next = (zooms || [])
    .filter((z) => z.id !== item.id && z.start > item.start + 0.01)
    .sort((a, b) => a.start - b.start)[0];
  if (!next) return item.end;
  const fit = next.start - zoomOutGap(item, next);
  if (item.end <= fit) return item.end;
  if (fit - item.start >= MIN_OWN) return Math.round(fit * 1000) / 1000;
  // No room to pull out first: stop at it rather than run into it.
  return Math.min(item.end, next.start);
}

/**
 * @returns {{ item: object, patch: object, label: string }} the new item, the
 *   timeline change that adds it, and the undo label for that change.
 */
export function create(kind, tl, start, end) {
  const duration = tl.duration || 0;

  if (kind === "zoom") {
    const s = end == null ? clamp(start, 0, Math.max(0, duration - 1.5)) : start;
    const item = {
      id: newId("z"),
      start: s,
      end: end ?? Math.min(duration || s + 2.5, s + 2.5),
      x: 0.3, y: 0.3, w: 0.4, h: 0.4,
      level: 1.8,
      // Always Smooth: the editor no longer offers a choice (see ZoomPanel).
      easing: "smooth",
      camera: "region",
      follow: false,
      follow_strength: 0.7,
      label: "",
      auto: false,
    };
    item.end = fitBeforeNext(item, tl.zooms);
    return { item, patch: { zooms: [...(tl.zooms || []), item] }, label: "Add zoom" };
  }

  if (kind === "blur") {
    const s = end == null ? clamp(start, 0, Math.max(0, duration - 0.5)) : start;
    const item = {
      id: newId("b"),
      start: s,
      // To the end by default. The safe reading of "cover this" is the wider
      // one: a secret that is on screen now is usually on screen after, and a
      // blur that stops too early is the failure that matters.
      end: end ?? (duration || s + 3),
      x: 0.34, y: 0.42, w: 0.32, h: 0.09,
      kind: "blur",
      strength: 0.8,
      label: "",
      auto: false,
    };
    return { item, patch: { blurs: [...(tl.blurs || []), item] }, label: "Add blur" };
  }

  if (kind === "cue") {
    const s = end == null ? clamp(start, 0, Math.max(0, duration - 1)) : start;
    const item = {
      id: newId("q"),
      start: s,
      end: end ?? Math.min(duration || s + 1.8, s + 1.8),
      text: "New caption",
      emphasis: [],
      custom: null,
    };
    // Adding a line switches captions on: a caption made and then invisible
    // because the track was off reads as the add having failed.
    return {
      item,
      patch: { cues: [...(tl.cues || []), item], captions: { ...(tl.captions || {}), enabled: true } },
      label: "Add caption",
    };
  }

  throw new Error(`create: unknown kind "${kind}"`);
}

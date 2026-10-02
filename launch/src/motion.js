/**
 * motion.js: the motion language every scene speaks.
 *
 * Three springs and nothing else, so the whole video moves like one thing:
 *   SETTLE  entrances of text and cards: fast start, no overshoot
 *   POP     small things that should feel physical (a logo, a button, a ripple)
 *   GLIDE   the camera and big surfaces: slow, heavy, never bouncy
 * Stagger between siblings is a few frames, never more than ~100 ms, so a
 * list reads as one gesture rather than a queue.
 */
import { interpolate, spring, Easing } from "remotion";

export const SETTLE = { damping: 200, stiffness: 120, mass: 0.9 };
export const POP = { damping: 13, stiffness: 170, mass: 0.7 };
export const GLIDE = { damping: 200, stiffness: 45, mass: 1.4 };

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };

/** 0 → 1 from `delay` frames, on a spring. */
export const enter = (frame, fps, delay = 0, config = SETTLE, durationInFrames) =>
  spring({ frame: frame - delay, fps, config, durationInFrames });

/** Text and cards arrive from below, out of a blur. */
export function riseStyle(p, { y = 34, blur = 12, scale = 0 } = {}) {
  return {
    opacity: interpolate(p, [0, 0.6], [0, 1], clamp),
    transform: `translate3d(0, ${(1 - p) * y}px, 0)${scale ? ` scale(${1 - scale * (1 - p)})` : ""}`,
    filter: blur ? `blur(${(1 - Math.min(1, p * 1.25)) * blur}px)` : undefined,
  };
}

/** Eased 0 → 1 between two frames. */
export const ramp = (frame, from, to, easing = Easing.bezier(0.65, 0, 0.35, 1)) =>
  interpolate(frame, [from, to], [0, 1], { ...clamp, easing });

export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);

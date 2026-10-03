/**
 * musicMix.mjs: how the tracks on the music lane are HEARD, shared by the
 * preview (Preview.js) and the export (backend render/compose.js) so the two
 * play the same thing. No imports: the backend and the Cloud Run renderer
 * load this file as it is.
 *
 * ── TRACKS THAT TOUCH BLEND INTO EACH OTHER ──────────────────────────────────
 * Two tracks end to end used to meet in a hole: the first faded out to nothing
 * before its end, the second faded up from nothing after its start. Where a
 * track starts within JOIN seconds of the end of the one before, they
 * crossfade instead. The second starts exactly where it sits on the lane and
 * fades in over CROSSFADE seconds; the first keeps playing past its end for
 * those same seconds, fading out underneath it. Equal-power curves (a quarter
 * sine each way; ffmpeg's afade curve=qsin) keep the loudness level through
 * the blend, where straight lines would sag in the middle. A track's own fade
 * in and fade out apply at its free ends only.
 */

/** How long two touching tracks blend, at most (never over half the incoming one). */
export const CROSSFADE = 1.5;
/** How close two tracks must be to count as touching. */
export const JOIN = 0.15;

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/**
 * Each item with how it is heard: `play` (seconds from its start, its tail
 * under the next track included), `fadeIn` and `fadeOut` (seconds), and
 * `blendIn` / `blendOut` (whether that end is a crossfade). Sorted by start.
 */
export function musicPlan(items) {
  const list = [...(items || [])]
    .filter((m) => m && num(m.duration) > 0)
    .sort((a, b) => num(a.start) - num(b.start));
  return list.map((m, i) => {
    const start = num(m.start);
    const duration = num(m.duration);
    const prev = list[i - 1];
    const next = list[i + 1];
    const blendIn = !!prev && Math.abs(start - (num(prev.start) + num(prev.duration))) <= JOIN;
    const gapOut = next ? num(next.start) - (start + duration) : Infinity;
    const blendOut = !!next && Math.abs(gapOut) <= JOIN;
    const xin = Math.min(CROSSFADE, duration / 2);
    const xout = blendOut ? Math.min(CROSSFADE, num(next.duration) / 2) : 0;
    return {
      ...m,
      start,
      duration,
      play: blendOut ? Math.max(duration, duration + gapOut) + xout : duration,
      fadeIn: blendIn ? xin : Math.min(num(m.fade_in), duration / 2),
      fadeOut: blendOut ? xout : Math.min(num(m.fade_out), duration / 2),
      blendIn,
      blendOut,
    };
  });
}

/**
 * How loud a planned item is at output time `t`, 0..1 of its own volume: its
 * fades as the export draws them (straight at a free end, a quarter sine in a
 * blend).
 */
export function gainAt(p, t) {
  const local = t - p.start;
  if (local < 0 || local > p.play) return 0;
  let g = 1;
  if (p.fadeIn > 0.01 && local < p.fadeIn) {
    const x = local / p.fadeIn;
    g = Math.min(g, p.blendIn ? Math.sin((x * Math.PI) / 2) : x);
  }
  const left = p.play - local;
  if (p.fadeOut > 0.01 && left < p.fadeOut) {
    const x = left / p.fadeOut;
    g = Math.min(g, p.blendOut ? Math.sin((x * Math.PI) / 2) : x);
  }
  return Math.max(0, Math.min(1, g));
}

/** Where in its track an item is at output time `t`, looping if it loops. */
export function trackTimeAt(m, t, trackLength) {
  const pos = num(m.in) + (t - num(m.start));
  if (m.loop !== false && trackLength > 0.5) return ((pos % trackLength) + trackLength) % trackLength;
  return pos;
}

/**
 * How loud an unplanned item is at `t` (its own fades only): kept for
 * callers that look at one item on its own.
 */
export function fadeAt(m, t) {
  return gainAt(musicPlan([m])[0] || { start: 0, play: 0, fadeIn: 0, fadeOut: 0 }, t);
}

/**
 * followBlur.js: a followed blur, as ffmpeg expressions in the export's time.
 *
 * The follow (src/components/Studio/follow.mjs) says where the rectangle is
 * from each real frame of the recording onward. The export does not blur the
 * recording's frames, though: it blurs the stream after the cuts have been
 * joined and the frame rate made constant (compose.js, `fps=`), and both of
 * those move frames in time. So every step is carried into that stream:
 *
 *   1. through the cuts, using where each kept stretch ACTUALLY starts in the
 *      joined file (each is re-encoded on its own and comes out a whole number
 *      of frames long, so the planned starts drift a frame per cut);
 *   2. onto the tick the frame-rate conversion lands that frame on: `fps`
 *      rounds each frame's time to the NEAREST tick, so a frame can appear up
 *      to half a tick before its own timestamp, and a blur keyed to the
 *      timestamp would arrive one frame late — in a fast scroll, a frame with
 *      the secret uncovered.
 *
 * And because a frame of slop anywhere in that chain is still a frame of the
 * secret, a blur that moves is drawn three times — where it is on this tick,
 * where it was on the tick before and where it will be on the tick after — so
 * an off-by-one in any direction is still covered. Standing still, the three
 * coincide and cost nothing but the filters.
 *
 * Positions are steps (a flat sum of `gte` gates, no nesting, the same shape
 * as the camera's and the pointer patch's), constant between frames.
 */
import { followAt } from "../../../../src/components/Studio/follow.mjs";

const even = (v) => Math.round(v / 2) * 2;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const n3 = (v) => (Math.round(v * 1000) / 1000).toString();

/**
 * The followed blur's value over the export's time, as a list of steps.
 *
 * @param {object} blur      the timeline blur (recording-time start/end)
 * @param {object} follow    its follow
 * @param {Array}  segs      [{ src_start, src_end, out_start }], out_start the
 *                           actual start of each kept stretch in the joined file
 * @param {object} o         { FPS, W, H, w, h }: frame and region in pixels
 * @returns {Array<[number, {x, y, on}]>} [output time the value starts, value]
 */
function steps(blur, follow, segs, { FPS, W, H, w, h }) {
  const at = (ts) => {
    if (ts < blur.start - 1e-6 || ts >= blur.end - 1e-6) return { x: 0, y: 0, on: 0 };
    const p = followAt(follow, ts);
    return {
      x: even(clamp(p.x * W, 0, W - w)),
      y: even(clamp(p.y * H, 0, H - h)),
      on: p.on ? 1 : 0,
    };
  };
  const out = [];
  for (const s of segs) {
    if (s.src_end <= blur.start || s.src_start >= blur.end) continue;
    out.push([s.out_start, at(s.src_start)]);
    const cuts = [blur.start, blur.end, ...follow.keys.map((k) => k[0])];
    for (const ts of cuts) {
      if (ts <= s.src_start + 1e-6 || ts >= s.src_end - 1e-6) continue;
      const tick = Math.round((ts - s.src_start) * FPS) / FPS;
      out.push([s.out_start + tick, at(ts)]);
    }
  }
  out.sort((a, b) => a[0] - b[0]);
  // Several changes on one tick: the last one is what that tick shows.
  const merged = [];
  for (const st of out) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last[0] - st[0]) < 1e-6) last[1] = st[1];
    else merged.push(st);
  }
  return merged;
}

/** One of x / y / on as a flat sum of steps, shifted by `shift` ticks. */
function expr(list, key, FPS, shift) {
  if (!list.length) return "0";
  let e = String(list[0][1][key]);
  let prev = list[0][1][key];
  for (let i = 1; i < list.length; i++) {
    const v = list[i][1][key];
    if (v === prev) continue;
    // Half a tick early, so the gate is open on the tick itself whatever the
    // float arithmetic does; then moved by the shift.
    const c = list[i][0] - 0.5 / FPS - shift / FPS;
    e += `${v - prev >= 0 ? "+" : ""}${v - prev}*gte(t,${n3(c)})`;
    prev = v;
  }
  return e;
}

/**
 * The regions to draw for one followed blur: three when it ever moves (see
 * the header), one when it never does. Each is { x, y, on } expressions of t,
 * to be used as crop/overlay x and y and as the overlay's `enable`.
 */
export function followedRegions(blur, follow, segs, o) {
  const list = steps(blur, follow, segs, o);
  if (!list.length) return [];
  const moves = list.some((st, i) => i > 0 && (st[1].x !== list[i - 1][1].x || st[1].y !== list[i - 1][1].y));
  const shifts = moves ? [-1, 0, 1] : [0];
  return shifts.map((sh) => ({
    x: expr(list, "x", o.FPS, sh),
    y: expr(list, "y", o.FPS, sh),
    on: expr(list, "on", o.FPS, sh),
  }));
}

export default { followedRegions };

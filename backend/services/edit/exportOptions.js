/**
 * exportOptions.js: what an export can be asked for, and what it costs.
 *
 * One list, read by the route (to validate and price), the runner (to render)
 * and /edit/config (to say what the export dialog offers). The browser prices a
 * choice with the multipliers config sends, and the route checks the price it
 * was shown, so the number on the button is still the number charged.
 *
 * ── RESOLUTION IS THE SHORT SIDE ─────────────────────────────────────────────
 * "1080p" means 1080 × 1920 for a Short and 1920 × 1080 for YouTube, the way
 * every phone and platform uses the word. Every placement in the timeline is a
 * fraction of the frame, so a 4K export is the 1080p design drawn with more
 * pixels, not a different layout.
 *
 * ── WHY THE BIG ONES COST MORE ───────────────────────────────────────────────
 * A 4K frame is four times the pixels of a 1080p one, and 60 fps is twice the
 * frames: that is the server time an export takes, and credits pay for it.
 */
import { ASPECTS } from "./timeline.js";

const pos = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

/**
 * Bumped whenever a render starts drawing something an older server would
 * silently leave out. The browser warns before exporting against a server that
 * reports less, which is what a backend that was never restarted looks like.
 */
export const EXPORT_ENGINE = 3;

export const RESOLUTIONS = [720, 1080, 1440, 2160];
export const FRAME_RATES = [24, 25, 30, 50, 60];
/** Fixed video bitrates on offer, in Mbps. 0 is "Auto": constant quality. */
export const VIDEO_MBPS = [0, 2, 4, 8, 12, 16, 25, 40, 60];
export const AUDIO_KBPS = [128, 192, 256, 320];
/** x264/x265 presets. Slower packs the same quality into fewer bytes. */
export const SPEEDS = { fast: "veryfast", balanced: "medium", best: "slow" };

/** The biggest export this server will make. A small VM can cap it at 1440. */
export const MAX_RESOLUTION = RESOLUTIONS.filter((r) => r <= pos(process.env.EDIT_EXPORT_MAX_RESOLUTION, 2160)).pop() || 1080;

export const EXPORT_MULTIPLIERS = {
  r1440: pos(process.env.EDIT_EXPORT_1440_MULTIPLIER, 1.5),
  r2160: pos(process.env.EDIT_EXPORT_4K_MULTIPLIER, 2),
  high_fps: pos(process.env.EDIT_EXPORT_HIGH_FPS_MULTIPLIER, 1.5),
};

export const DEFAULT_EXPORT = Object.freeze({
  resolution: 1080,
  fps: 30,
  video_mbps: 0,
  audio_kbps: 192,
  codec: "h264",
  speed: "fast",
  loudness: false,
  captions: "burn",
  srt: false,
});

const pick = (v, list, d) => (list.includes(Number(v)) ? Number(v) : d);

/**
 * Options from the browser, as something safe to hand ffmpeg. Anything unknown
 * falls back to the default rather than failing: an export is never refused
 * over a setting.
 *
 * @param {object} input
 * @param {object} [caps]  what this server can do: { hevc, maxResolution }
 */
export function cleanExportOptions(input, { hevc = false, maxResolution = MAX_RESOLUTION } = {}) {
  const o = input && typeof input === "object" ? input : {};
  const resolution = Math.min(pick(o.resolution, RESOLUTIONS, DEFAULT_EXPORT.resolution), maxResolution);
  return {
    resolution,
    fps: pick(o.fps, FRAME_RATES, DEFAULT_EXPORT.fps),
    video_mbps: pick(o.video_mbps, VIDEO_MBPS, DEFAULT_EXPORT.video_mbps),
    audio_kbps: pick(o.audio_kbps, AUDIO_KBPS, DEFAULT_EXPORT.audio_kbps),
    codec: o.codec === "hevc" && hevc ? "hevc" : "h264",
    speed: Object.hasOwn(SPEEDS, o.speed) ? o.speed : DEFAULT_EXPORT.speed,
    loudness: o.loudness === true,
    captions: o.captions === "none" ? "none" : "burn",
    srt: o.srt === true,
  };
}

/** How many times the base export price these options cost. */
export function exportMultiplier(o) {
  let m = 1;
  if (o.resolution >= 2160) m *= EXPORT_MULTIPLIERS.r2160;
  else if (o.resolution >= 1440) m *= EXPORT_MULTIPLIERS.r1440;
  if (o.fps > 30) m *= EXPORT_MULTIPLIERS.high_fps;
  return m;
}

/** The price of an export: the base price for its length, times its options. */
export function exportPrice(baseCost, o) {
  return Math.ceil(baseCost * exportMultiplier(o) - 1e-9);
}

const even = (n) => Math.max(2, 2 * Math.round(n / 2));

/** The output frame in pixels, for an aspect at a resolution (the short side). */
export function outputSize(aspect, resolution = 1080) {
  const [w, h] = ASPECTS[aspect] || ASPECTS["9:16"];
  const k = (Number(resolution) || 1080) / 1080;
  return [even(w * k), even(h * k)];
}

export default {
  EXPORT_ENGINE, RESOLUTIONS, FRAME_RATES, VIDEO_MBPS, AUDIO_KBPS, SPEEDS, MAX_RESOLUTION, EXPORT_MULTIPLIERS,
  DEFAULT_EXPORT, cleanExportOptions, exportMultiplier, exportPrice, outputSize,
};

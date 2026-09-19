/**
 * exportOptions.js: what a demo can be exported as, and what it costs.
 *
 * One list, read by the route (to validate and price), by the runner (to
 * render) and by /studio/config (to fill the export dialog). The browser prices
 * a choice with the multipliers config sends and the route re-checks the price
 * it was shown, so the number on the button is the number charged.
 *
 * ── PRESETS ARE THE INTERFACE ────────────────────────────────────────────────
 * Nobody making a product demo wants to choose a bitrate. They want "the one
 * for YouTube" or "the one for LinkedIn". Every preset below is a complete set
 * of options with a name someone would actually say; the individual controls
 * exist underneath for the one person in fifty who needs them.
 *
 * ── RESOLUTION IS THE SHORT SIDE ─────────────────────────────────────────────
 * "1080p" means 1920×1080 landscape and 1080×1920 vertical, the way every
 * platform uses the word. Every position in a timeline is a fraction of the
 * frame, so a 4K export is the same design drawn with more pixels.
 */
import { ASPECT_KEYS } from "./timeline.js";

const pos = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

/**
 * Bumped whenever a render starts drawing something an older server would
 * silently leave out. The browser warns before exporting against a server
 * reporting less, which is what a backend nobody restarted looks like.
 */
export const RENDER_ENGINE = 1;

export const RESOLUTIONS = [720, 1080, 1440, 2160];
export const FRAME_RATES = [24, 30, 60];
export const VIDEO_MBPS = [0, 4, 8, 12, 16, 25, 40, 60];
export const AUDIO_KBPS = [128, 192, 256, 320];
export const FORMATS = ["mp4", "gif", "webm"];
/** x264/x265 presets. Slower packs the same quality into fewer bytes. */
export const SPEEDS = { fast: "veryfast", balanced: "medium", best: "slow" };

/** The biggest export this server will make. A small VM can cap it at 1440. */
export const MAX_RESOLUTION =
  RESOLUTIONS.filter((r) => r <= pos(process.env.STUDIO_MAX_RESOLUTION, 2160)).pop() || 1080;

export const DEFAULT_EXPORT = Object.freeze({
  preset: "original",
  aspect: "source",
  // Not 1080: with aspect "source" this is a ceiling, never a target, so a
  // recording made on a larger display keeps its own pixels instead of being
  // scaled down to a number.
  resolution: 1440,
  fps: 30,
  codec: "h264",
  format: "mp4",
  video_mbps: 0,
  audio_kbps: 192,
  speed: "balanced",
  captions: true,
});

/**
 * The named presets.
 *
 * `gif` deliberately caps at 720p/15fps: a GIF is a palette-quantised,
 * losslessly-compressed frame sequence, and a 1080p one of a thirty second demo
 * is a 90 MB file nothing will load. The point of the format is that it plays
 * inline in a README or a Slack message, which it stops doing above a few
 * megabytes.
 */
export const PRESETS = [
  // First, and the default. Every other preset reshapes the recording to fit a
  // platform; this one leaves it exactly as it was captured, which is the only
  // way interface text survives an export unsoftened.
  { id: "original", label: "Original", hint: "The recording's own size · 30fps", options: { aspect: "source", resolution: 1440, fps: 30, format: "mp4" } },
  { id: "youtube", label: "YouTube", hint: "1920×1080 · 30fps", options: { aspect: "16:9", resolution: 1080, fps: 30, format: "mp4" } },
  { id: "demo4k", label: "4K demo", hint: "3840×2160 · 60fps", options: { aspect: "16:9", resolution: 2160, fps: 60, format: "mp4", speed: "best" } },
  { id: "reels", label: "Reels / Shorts", hint: "1080×1920 · 30fps", options: { aspect: "9:16", resolution: 1080, fps: 30, format: "mp4" } },
  { id: "square", label: "Square", hint: "1080×1080 · 30fps", options: { aspect: "1:1", resolution: 1080, fps: 30, format: "mp4" } },
  { id: "linkedin", label: "LinkedIn", hint: "1080×1350 · 30fps", options: { aspect: "4:5", resolution: 1080, fps: 30, format: "mp4" } },
  { id: "twitter", label: "X / Twitter", hint: "1280×720 · 30fps", options: { aspect: "16:9", resolution: 720, fps: 30, format: "mp4" } },
  { id: "gif", label: "GIF", hint: "720p · 15fps · no audio", options: { aspect: "16:9", resolution: 720, fps: 15, format: "gif", captions: false } },
];

export const presetById = (id) => PRESETS.find((p) => p.id === id) || null;

export const EXPORT_MULTIPLIERS = {
  r1440: pos(process.env.STUDIO_1440_MULTIPLIER, 1.5),
  r2160: pos(process.env.STUDIO_2160_MULTIPLIER, 2.5),
  fps60: pos(process.env.STUDIO_60FPS_MULTIPLIER, 1.6),
  best: pos(process.env.STUDIO_BEST_MULTIPLIER, 1.3),
  hevc: pos(process.env.STUDIO_HEVC_MULTIPLIER, 1.4),
};

/**
 * Anything from the browser, made into options this server will render.
 * A preset fills in whatever the caller left out; explicit fields still win, so
 * "the YouTube one but vertical" is a preset plus one override.
 */
export function cleanExportOptions(input, { hevc = false, maxResolution = MAX_RESOLUTION } = {}) {
  const raw = input && typeof input === "object" ? input : {};
  // The default preset counts as a choice. Without this its options were listed
  // in PRESETS and never applied to anything, because nothing had asked for it
  // by name yet.
  const preset = presetById(raw.preset || DEFAULT_EXPORT.preset);
  const o = { ...DEFAULT_EXPORT, ...(preset?.options || {}), ...raw };

  const one = (v, list, d) => (list.includes(v) ? v : d);
  const format = one(o.format, FORMATS, "mp4");

  const resolution = RESOLUTIONS.includes(Number(o.resolution)) ? Number(o.resolution) : 1080;
  const fps = FRAME_RATES.includes(Number(o.fps)) ? Number(o.fps) : format === "gif" ? 15 : 30;

  return {
    preset: preset?.id || "",
    aspect: one(o.aspect, ASPECT_KEYS, "source"),
    // A GIF above 720 is a file nobody can load; the cap is not negotiable.
    resolution: Math.min(resolution, format === "gif" ? 720 : maxResolution),
    fps: format === "gif" ? Math.min(fps, 15) : fps,
    codec: format === "mp4" && o.codec === "hevc" && hevc ? "hevc" : format === "webm" ? "vp9" : "h264",
    format,
    video_mbps: VIDEO_MBPS.includes(Number(o.video_mbps)) ? Number(o.video_mbps) : 0,
    audio_kbps: AUDIO_KBPS.includes(Number(o.audio_kbps)) ? Number(o.audio_kbps) : 192,
    speed: one(o.speed, Object.keys(SPEEDS), "balanced"),
    captions: format === "gif" ? false : o.captions !== false,
  };
}

/** What an export costs, relative to a 1080p30 H.264 one. */
export function exportMultiplier(o) {
  let m = 1;
  if (o.resolution === 1440) m *= EXPORT_MULTIPLIERS.r1440;
  if (o.resolution === 2160) m *= EXPORT_MULTIPLIERS.r2160;
  if (o.fps >= 60) m *= EXPORT_MULTIPLIERS.fps60;
  if (o.speed === "best") m *= EXPORT_MULTIPLIERS.best;
  if (o.codec === "hevc") m *= EXPORT_MULTIPLIERS.hevc;
  return Math.round(m * 100) / 100;
}

export function exportPrice(baseCost, o) {
  return Math.max(1, Math.ceil(baseCost * exportMultiplier(o)));
}

/** Constant-quality target when no bitrate was asked for. */
export function crfFor(o) {
  // 18 rather than 21: a demo is text on flat colour, where the artefact that
  // shows first is ringing around letter edges, and it shows at 21. The extra
  // bytes are cheap on screen content — it compresses to almost nothing between
  // the moments something actually moves.
  const base = o.codec === "hevc" ? 23 : 18;
  // Screen content is flat colour and hard edges, which H.264 handles very
  // well; the quality that matters is text sharpness, and that is lost to a
  // high CRF long before it is lost to a low bitrate. 4K gets a touch more
  // headroom because the same CRF at four times the pixels is a much bigger file.
  return o.resolution >= 2160 ? base + 2 : base;
}

export default {
  RENDER_ENGINE, RESOLUTIONS, FRAME_RATES, VIDEO_MBPS, AUDIO_KBPS, FORMATS, SPEEDS,
  MAX_RESOLUTION, DEFAULT_EXPORT, PRESETS, presetById, EXPORT_MULTIPLIERS,
  cleanExportOptions, exportMultiplier, exportPrice, crfFor,
};

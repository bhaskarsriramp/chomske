/**
 * shims/ffmpeg.js: backend/services/media/ffmpeg.js, for the analysis in the
 * browser.
 *
 * The analysis reads video through one function, ffmpegToFrames(). This gives
 * it the same function over the browser's own decoder (WebCodecs, with
 * mediabunny to read the MP4), reproducing what the server's ffmpeg command
 * does to every frame:
 *
 *   -ss start -i src -t duration -vf fps=F,scale=W:H:flags=bilinear -pix_fmt gray
 *
 *   decode   H.264 decoding is bit-exact by specification; measured identical
 *            on 8,199 of 8,199 frames, software and GPU decoders alike
 *   fps=F    which recorded frame fills each 1/F slot, with the fps filter's
 *            integer rounding, the two -t cuts ffmpeg applies, and its end-of-
 *            file rule — measured identical on every read the analysis makes
 *   gray     one table, yuv420p (tv) → grey, from the build machine's ffmpeg;
 *            the server checks at boot that its own ffmpeg gives the same
 *   scale    only ever to the SOURCE size. A shrunk read cannot be made here
 *            byte for byte (the one the analysis makes, the screen reading,
 *            comes from the server), so asking for one breaks the run.
 */
import { Input, ALL_FORMATS, BlobSource, UrlSource, EncodedPacketSink } from "mediabunny";
import { broken } from "./globals.js";

/* global __GRAY_LUT__ */
export const GRAY_LUT = new Uint8Array(__GRAY_LUT__);

export const FFMPEG_PATH = "browser";
export const FFPROBE_PATH = "browser";

let HW = "prefer-software";
/** "prefer-software" (the default: Chrome's software decoder is ffmpeg's) or "prefer-hardware". */
export function setDecoderPreference(v) { HW = v; }

export const stats = { decodedFrames: 0, decodeMs: 0, passes: 0 };

const inputs = new Map();
async function open(src) {
  if (inputs.has(src)) return inputs.get(src);
  const p = (async () => {
    const source = typeof src === "string" ? new UrlSource(src) : new BlobSource(src);
    const input = new Input({ formats: ALL_FORMATS, source });
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw broken("the recording has no video track the browser can read");
    const config = await track.getDecoderConfig();
    const support = await VideoDecoder.isConfigSupported({ ...config, hardwareAcceleration: HW });
    if (!support.supported) throw broken("this browser cannot decode the recording (" + config.codec + ")");
    return { track, config, sink: new EncodedPacketSink(track), res: track.timeResolution };
  })();
  inputs.set(src, p);
  return p;
}

/**
 * Decoded luma planes in presentation order from the key frame at or before
 * `from` seconds, each { pts, dur (stream ticks), y (w*h) }.
 */
async function* lumaFrames(src, from = 0) {
  const { config, sink, res, track } = await open(src);
  const w = track.displayWidth;
  const h = track.displayHeight;
  const first = from > 0 ? (await sink.getKeyPacket(from, { verifyKeyPackets: true })) || (await sink.getFirstPacket()) : await sink.getFirstPacket();
  const queue = [];
  let wake = null;
  let failure = null;
  let pending = Promise.resolve();
  let stopped = false;
  const push = (v) => { queue.push(v); if (wake) { wake(); wake = null; } };
  const decoder = new VideoDecoder({
    output: (frame) => {
      pending = pending.then(async () => {
        try {
          const buf = new Uint8Array(frame.allocationSize());
          const layout = await frame.copyTo(buf);
          const ts = frame.timestamp;
          const dur = frame.duration;
          const y = new Uint8Array(w * h);
          const { offset, stride } = layout[0];
          for (let r = 0; r < h; r++) y.set(buf.subarray(offset + r * stride, offset + r * stride + w), r * w);
          push({ pts: Math.round((ts / 1e6) * res), dur: dur ? Math.round((dur / 1e6) * res) : 0, y });
        } finally {
          frame.close();
        }
      });
    },
    error: (e) => { failure = e; push(null); },
  });
  decoder.configure({ ...config, hardwareAcceleration: HW });
  const t0 = performance.now();
  stats.passes++;
  const feed = (async () => {
    for await (const packet of sink.packets(first)) {
      if (failure || stopped) break;
      while (!stopped && (decoder.decodeQueueSize > 6 || queue.length > 12)) await new Promise((r) => setTimeout(r, 0));
      if (stopped) break;
      decoder.decode(packet.toEncodedVideoChunk());
    }
    if (!failure && !stopped) await decoder.flush();
    await pending;
    push(null);
  })();
  try {
    while (true) {
      if (!queue.length) await new Promise((r) => (wake = r));
      const v = queue.shift();
      if (v === null) break;
      stats.decodedFrames++;
      yield v;
    }
  } finally {
    stopped = true;
    queue.length = 0;
    await feed.catch(() => {});
    try { decoder.close(); } catch { /* closed */ }
    stats.decodeMs += performance.now() - t0;
    if (failure) throw broken("the browser's decoder failed: " + (failure.message || failure));
  }
}

/** av_rescale_q_rnd(pts, 1/res, 1/fps, NEAR_INF), in integers. */
function toSlot(pts, res, fps) {
  const n = pts * fps;
  const q = Math.floor(n / res);
  const r = n - q * res;
  return 2 * r >= res ? q + 1 : q;
}

/**
 * ── THE POINTER SEARCH HAS A TIME BUDGET, AND THIS MACHINE IS NOT THE SERVER ──
 * locate.js stops searching once its read of the recording has run for
 * budgetMs (by the clock), so where it stops depends on how fast the machine
 * is. A read here that gets near that budget is one the server may have
 * finished — or stopped somewhere else — so it breaks the run. The same
 * formula as locate.js, from the same setting (STUDIO_LOCATE_BUDGET_MS).
 */
const BUDGET_SHARE = 0.8;
function locateBudgetMs(duration) {
  return Math.round(Math.min(1_800_000, Math.max(300_000, Number(process.env.STUDIO_LOCATE_BUDGET_MS) || duration * 15_000)));
}

/** The server's ffmpegToFrames contract: onFrame(buf, index) awaited per frame; resolves { frames }. */
export async function ffmpegToFrames(src, { width, height, fps, pixelFormat = "gray", start = 0, duration = 0, onFrame }) {
  if (pixelFormat !== "gray") throw broken("a " + pixelFormat + " frame read");
  const began = Date.now();
  const guardMs = BUDGET_SHARE * locateBudgetMs(duration);
  const { res, track } = await open(src);
  const sw = track.displayWidth;
  const sh = track.displayHeight;
  if (width !== sw || height !== sh) throw broken(`a ${width}x${height} frame read, which only the server's scaler makes`);
  const startTicks = Math.round(start * res);
  const out = Buffer.alloc(width * height);

  // -t, applied twice by ffmpeg 6.1: the output trim filter keeps a slot while
  // (slot − first slot written) < duration in 1/fps rounded to nearest, and
  // the recording-time check while slot / fps < duration exactly.
  const durUs = Math.round(duration * 1e6);
  const durSlots = duration > 0 ? toSlot(durUs, 1e6, fps) : Infinity;
  let index = 0;
  let held = null;
  let next = null;
  let firstSlot = null;
  const emit = async (frame, slot) => {
    if (firstSlot === null) firstSlot = slot;
    if (slot - firstSlot >= durSlots) return false;
    if (duration > 0 && slot * 1e6 >= durUs * fps) return false;
    if (Date.now() - began > guardMs) {
      broken(`reading the recording took over ${Math.round(guardMs / 1000)}s here, near the pointer search's time budget`);
    }
    const y = frame.y;
    for (let i = 0; i < y.length; i++) out[i] = GRAY_LUT[y[i]];
    await onFrame(out, index++);
    return true;
  };

  let lastPts = null;
  let lastDur = 0;
  for await (const f of lumaFrames(src, start)) {
    if (f.pts < startTicks) continue;
    const rel = f.pts - startTicks;
    lastDur = f.dur || (lastPts !== null ? rel - lastPts : 0);
    lastPts = rel;
    const slot = toSlot(rel, res, fps);
    if (next === null) next = slot;
    while (held && next < slot) {
      if (!(await emit(held, next))) return { frames: index };
      next++;
    }
    held = f;
  }
  if (held) {
    const eof = toSlot(lastPts + lastDur, res, fps);
    while (next < Math.max(eof, next + 1)) {
      if (!(await emit(held, next))) break;
      next++;
    }
  }
  return { frames: index };
}

/**
 * The vision pass's stills. The first analysis only counts them (the pass is
 * off there), so the list is made without any pictures: one per `every`
 * seconds, ending where ffmpeg's fps=1/every does.
 */
export async function extractFrames(src, destDir, { every = 2, start = 0, duration = 0 } = {}) {
  const n = Math.max(1, toSlot(Math.round(duration * 1e6), 1e6 * every, 1));
  return Array.from({ length: n }, (_, i) => ({ file: null, t: Math.round((start + i * every) * 1000) / 1000 }));
}

export async function probe(src) {
  const { track } = await open(src);
  return { width: track.displayWidth, height: track.displayHeight, duration: await track.computeDuration() };
}

const serverOnly = (name) => () => { throw broken(name + " needs the server"); };
export const runProcess = serverOnly("runProcess");
export const ffmpeg = serverOnly("ffmpeg");
export const hasEncoder = async () => false;
export const makeVideoProxy = serverOnly("makeVideoProxy");
export const makeWatchCopy = serverOnly("makeWatchCopy");
export const makeAudioProxy = serverOnly("makeAudioProxy");
export const extractSpeechAudio = serverOnly("extractSpeechAudio");
export const makeThumbnail = serverOnly("makeThumbnail");
export const extractFrameAt = serverOnly("extractFrameAt");
export const ffmpegFromFrames = serverOnly("ffmpegFromFrames");
export const remuxRecording = serverOnly("remuxRecording");
export const cutAudio = serverOnly("cutAudio");
export const detectSpeech = serverOnly("detectSpeech");

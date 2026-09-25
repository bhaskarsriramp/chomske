/**
 * A real recording, run through the whole first analysis exactly as the
 * server runs it — with the browser's tracker replayed over the video.
 *
 * Used by replay.mjs (one recording, printed) and truth.mjs (every labelled
 * recording, scored).
 *
 * ── WHY THE TRACKER IS REPLAYED ──────────────────────────────────────────────
 * The browser's tracker report (the pointer path, the motion series and the
 * full-size reading of the pointer) is uploaded beside the video and lives in
 * the database, not in the file. Everything downstream reads it — the aligner,
 * the locator's hints, the press rules — so running the analysis without it is
 * running a different pipeline. The real tracker.worker.js is loaded here and
 * fed the recording's frames at the rate and size capture.js feeds it, patch
 * included. It is not identical to the upload — the browser saw the screen
 * before the encoder did — but it is the same code on nearly the same pixels.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { probe, FFMPEG_PATH } from "../../services/media/ffmpeg.js";

// Imported late so this is set first: the studio services reach Redis on load,
// and without it a local run spends its time reconnecting and never exits.
process.env.REDIS_DISABLED = process.env.REDIS_DISABLED || "true";
const { analyseRecording } = await import("../../services/studio/analyse.js");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKER = path.join(HERE, "../../../src/components/Studio/tracker.worker.js");

/* capture.js constants — must match. */
const TRACK_HZ = 24;
const TRACK_EDGE = 960;
const PATCH = 192;
const PATCH_GRID = 64;
const GLYPH_MIN_SAMPLES = 6;

async function loadWorker() {
  const code = fs.readFileSync(WORKER, "utf8");
  const tmp = path.join(os.tmpdir(), "lipi-replay-" + process.pid + "-" + Date.now() + ".mjs");
  fs.writeFileSync(tmp, code + "\nexport { handle };\n");
  try {
    return await import("file://" + tmp.replace(/\\/g, "/"));
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/** Every frame at TRACK_HZ, full size, RGBA, one at a time. */
async function* framesOf(file, w, h) {
  const size = w * h * 4;
  const ff = spawn(FFMPEG_PATH, ["-v", "error", "-i", file, "-vf", `fps=${TRACK_HZ}`, "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"]);
  // One preallocated frame, filled chunk by chunk: concatenating a growing
  // buffer per chunk is quadratic and takes minutes per frame at 1080p.
  let cur = Buffer.allocUnsafe(size);
  let fill = 0;
  const queue = [];
  let done = false;
  let wake = null;
  ff.stdout.on("data", (d) => {
    let off = 0;
    while (off < d.length) {
      const n = Math.min(size - fill, d.length - off);
      d.copy(cur, fill, off, off + n);
      fill += n;
      off += n;
      if (fill === size) {
        queue.push(cur);
        cur = Buffer.allocUnsafe(size);
        fill = 0;
      }
    }
    if (queue.length > 8) ff.stdout.pause();
    wake?.();
  });
  ff.on("close", () => { done = true; wake?.(); });
  let i = 0;
  while (true) {
    if (queue.length) {
      const f = queue.shift();
      if (queue.length < 4) ff.stdout.resume();
      yield { i: i++, data: new Uint8ClampedArray(f.buffer, f.byteOffset, f.length) };
      continue;
    }
    if (done) return;
    await new Promise((r) => (wake = r));
    wake = null;
  }
}

/** Area-average downscale, as the browser's resize would. */
function downscale(rgba, W, H, w, h) {
  const out = new Uint8ClampedArray(w * h * 4);
  const sx = W / w;
  const sy = H / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const k = (yy * W + xx) * 4;
          r += rgba[k]; g += rgba[k + 1]; b += rgba[k + 2]; n++;
        }
      }
      const o = (y * w + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
    }
  }
  return out;
}

function crop(rgba, W, at) {
  const out = new Uint8ClampedArray(at.w * at.h * 4);
  for (let y = 0; y < at.h; y++) {
    const s = ((at.y + y) * W + at.x) * 4;
    out.set(rgba.subarray(s, s + at.w * 4), y * at.w * 4);
  }
  return out;
}

const round3 = (v) => Math.round(v * 1000) / 1000;
const round4 = (v) => Math.round(v * 10000) / 10000;

/** capture.js profileOf(), in substance. */
function profileOf(glyphs) {
  if (glyphs.length < GLYPH_MIN_SAMPLES) return null;
  let light = 0, dark = 0;
  for (const g of glyphs) (g.design === "dark" ? dark++ : light++);
  const design = dark > light ? "dark" : "light";
  const heights = glyphs.filter((g) => g.design === design).map((g) => g.h).sort((a, b) => a - b);
  const height = heights[heights.length >> 1];
  const agree = Math.max(light, dark) / glyphs.length;
  const tight = heights.filter((v) => Math.abs(v - height) <= 1).length / heights.length;
  const enough = Math.min(1, glyphs.length / 24);
  return { design, height_px: height, samples: glyphs.length, confidence: round3(Math.min(agree, tight) * enough) };
}

/** The browser's tracker, replayed. Mirrors capture.js createTracker(). */
export async function replayTracker(file, vw, vh) {
  const { handle } = await loadWorker();
  const scale = Math.min(1, TRACK_EDGE / Math.max(vw, vh));
  const w = Math.max(2, Math.round((vw * scale) / 2) * 2);
  const h = Math.max(2, Math.round((vh * scale) / 2) * 2);
  const track = [];
  const motion = [];
  const glyphs = [];
  let lastKept = null;
  let lastSeen = null;
  const patchRect = () => {
    if (!lastSeen) return null;
    const pw = Math.min(PATCH, vw);
    const ph = Math.min(PATCH, vh);
    const snap = (v, size, max) => Math.max(0, Math.min(max - size, Math.floor((v - size / 2) / PATCH_GRID) * PATCH_GRID));
    return { x: snap(lastSeen.x * vw, pw, vw), y: snap(lastSeen.y * vh, ph, vh), w: pw, h: ph };
  };
  for await (const f of framesOf(file, vw, vh)) {
    const t = f.i / TRACK_HZ;
    const at = patchRect();
    const data = downscale(f.data, vw, vh, w, h);
    const patchData = at ? crop(f.data, vw, at) : null;
    const msg = handle({ type: "frame", data, width: w, height: h, patchData, patchW: at?.w, patchH: at?.h, at, vw, vh, t });
    if (!msg || msg.first || msg.error) continue;
    if (msg.glyph?.design && glyphs.length < 4000) glyphs.push({ h: msg.glyph.h, design: msg.glyph.design });
    if (msg.motion) {
      motion.push({ t: round3(t), energy: round4(msg.motion.energy), x: round4(msg.motion.x), y: round4(msg.motion.y), w: round4(msg.motion.w), h: round4(msg.motion.h), dy: round3(msg.motion.dy) });
    }
    if (msg.cursor) {
      const p = { t: round3(t), x: round4(msg.cursor.x), y: round4(msg.cursor.y), shape: msg.cursor.shape, conf: round3(msg.cursor.conf) };
      lastSeen = { x: p.x, y: p.y };
      const moved = !lastKept || Math.hypot(p.x - lastKept.x, p.y - lastKept.y) > 0.0015;
      const stale = !lastKept || p.t - lastKept.t > 0.25;
      if (moved || stale) { track.push(p); lastKept = p; }
    }
  }
  return { track, motion, cursor: profileOf(glyphs), tracker: "px-3 (replayed)", samples: track.length };
}

/**
 * The whole first analysis of one recording.
 *
 * @param {string} src
 * @param {object} [o]
 * @param {object} [o.env]     what capture.js environment() would have reported
 * @param {object} [o.cursor]  replaces the browser's pointer reading — for asking
 *                             "would the rest have worked with the right design?"
 * @returns {Promise<{ info, capture, result }>}
 */
export async function replay(src, { env = null, cursor = null } = {}) {
  const info = await probe(src);
  /**
   * STUDIO_REPLAY_CAPTURE=<file.json> replays with a capture given, not one
   * simulated from the video: the real one a creator's browser recorded (from
   * the demo's record), or a doctored copy that asks "what if the browser had
   * not seen this".
   */
  const capture = process.env.STUDIO_REPLAY_CAPTURE
    ? JSON.parse(fs.readFileSync(process.env.STUDIO_REPLAY_CAPTURE, "utf8"))
    : await replayTracker(src, info.width, info.height);
  if (env) capture.env = env;
  if (cursor) capture.cursor = cursor;
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "lipi-replay-"));
  try {
    const result = await analyseRecording({
      video: src,
      workDir,
      capture,
      source: { width: info.width, height: info.height, fps: info.fps || 30 },
      duration: info.duration,
    });
    return { info, capture, result };
  } finally {
    // STUDIO_KEEP_WORK=1 keeps the frames the analysis made, for looking at.
    if (!process.env.STUDIO_KEEP_WORK) fs.rmSync(workDir, { recursive: true, force: true });
    else console.log("[replay] work kept in " + workDir);
  }
}

/** "windows:1920x1080" as capture.js environment() would report it. */
export function envFrom(arg) {
  if (!arg) return null;
  const [platform, dims] = String(arg).split(":");
  const [sw, sh] = (dims || "").split("x").map(Number);
  return { platform, scheme: "light", dpr: 1, screen_w: sw || 0, screen_h: sh || 0 };
}

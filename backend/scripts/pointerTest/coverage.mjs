import os from "os";
import fs from "fs";
import path from "path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { ffmpegFromFrames, ffmpegToFrames } from "../../services/media/ffmpeg.js";
import { readCur } from "./cursors.mjs";
import { locatePointer, mergeLocated, stepPath } from "../../services/studio/locate.js";
import { renderTimeline } from "../../services/studio/render/compose.js";
import { sanitizeTimeline } from "../../services/studio/timeline.js";

const S = path.join(os.tmpdir(), "lipi-pointer-cover");
fs.rmSync(S, { recursive: true, force: true }); fs.mkdirSync(S, { recursive: true });
const W = 1920, H = 1020, FPS = 18, D = 8;
const bgFile = process.argv[2] || path.join(os.tmpdir(), "lipi-pointer-test", "bg_light.png");
const bg = await loadImage(bgFile);

function tinted(file) {
  const m = readCur("C:/Windows/Cursors/" + file + ".cur").find((x) => x.w === 32 && x.rgba?.px);
  const px = new Uint8ClampedArray(m.rgba.px);
  // The body goes pink: still bright to the locator, unmistakable to the counter.
  for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 200 && px[i] > 200) { px[i] = 255; px[i + 1] = 150; px[i + 2] = 190; }
  const c = createCanvas(m.rgba.w, m.rgba.h);
  const id = c.getContext("2d").createImageData(m.rgba.w, m.rgba.h);
  id.data.set(px);
  c.getContext("2d").putImageData(id, 0, 0);
  return { img: c, hx: m.hx, hy: m.hy };
}
const arrow = tinted("aero_arrow");
const hand = tinted("aero_link");

// Rest, slow move, a FAST flick, hand over a control with a tremor, rest, then a page scroll under a still pointer.
function truth(t) {
  const ease = (a, b, k) => a + (b - a) * (k * k * (3 - 2 * k));
  let x, y;
  if (t < 1) { x = 400; y = 300; }
  else if (t < 2.5) { const k = (t - 1) / 1.5; x = ease(400, 1000, k); y = ease(300, 600, k); }
  else if (t < 2.8) { const k = (t - 2.5) / 0.3; x = ease(1000, 300, k); y = ease(600, 200, k); }
  else if (t < 5) { x = 300 + 4 * Math.sin(t * 9); y = 200; }
  else { x = 1200; y = 450; }
  return { x: Math.round(x), y: Math.round(y), shape: t >= 2.8 && t < 5 ? "pointer" : "default" };
}

const src = path.join(S, "src.mp4");
const c = createCanvas(W, H);
const g = c.getContext("2d");
const hints = [];
let prev = null;
await ffmpegFromFrames(["-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", src], {
  width: W, height: H, fps: FPS, pixelFormat: "rgba",
  write: async (push) => {
    for (let i = 0; i < D * FPS; i++) {
      const t = i / FPS;
      const dy = t > 5.5 ? -Math.round((t - 5.5) * 300) : 0;
      g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
      g.drawImage(bg, 0, dy);
      if (dy) g.drawImage(bg, 0, dy + H);
      const p = truth(t);
      const k = p.shape === "pointer" ? hand : arrow;
      g.drawImage(k.img, p.x - k.hx, p.y - k.hy);
      // What the frame-difference tracker would have seen: the pointer only
      // while it moves, a few pixels off.
      if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) > 2) hints.push({ t, x: (p.x + (Math.random() * 12 - 6)) / W, y: (p.y + (Math.random() * 12 - 6)) / H });
      prev = p;
      await push(Buffer.from(g.getImageData(0, 0, W, H).data.buffer));
    }
  },
});

const r = await locatePointer(src, { sourceWidth: W, sourceHeight: H, duration: D, fps: 30, cursorPx: 20, hints });
console.log("located " + r.found + "/" + r.frames + " (" + r.design + " " + r.heightPx + "px)");
const track = stepPath(mergeLocated(r.track, []));
const timeline = sanitizeTimeline({
  duration: D, source: { width: W, height: H, fps: FPS },
  canvas: { aspect: "source", background: { kind: "none" }, padding: 0, radius: 0, shadow: 0 },
  cuts: [], blurs: [], events: [], captions: [], zooms: [], track,
  cursor: { enabled: true, mode: "recorded", size: 1.35, ripple: false, captured_px: 20, theme: "light", smoothing: 0, located: true },
}, { duration: D });

const out = path.join(S, "out.mp4");
await renderTimeline({ timeline, source: src, workDir: S, dest: out, options: { preset: "original", aspect: "source", resolution: 1080, fps: 30, captions: false } });

let frames = 0, bad = 0, worst = 0, worstT = 0;
const badTimes = [];
await ffmpegToFrames(out, {
  width: W, height: H, fps: 30, pixelFormat: "rgb24",
  onFrame: (f, i) => {
    frames++;
    // The real pointer in the recording frame the export shows at this moment.
    const p = truth(Math.round((i / 30) * FPS) / FPS);
    let pink = 0;
    for (let y = Math.max(0, p.y - 40); y < Math.min(H, p.y + 50); y++) {
      for (let x = Math.max(0, p.x - 40); x < Math.min(W, p.x + 50); x++) {
        const k = (y * W + x) * 3;
        if (f[k] > 200 && f[k + 1] > 110 && f[k + 1] < 190 && f[k + 2] > 150 && f[k + 2] < 225) pink++;
      }
    }
    if (pink > 0) { bad++; badTimes.push((i / 30).toFixed(2)); if (pink > worst) { worst = pink; worstT = i / 30; } }
  },
});
console.log("export frames: " + frames + "   frames where the real pointer shows: " + bad +
  (bad ? "   worst " + worst + " px at " + worstT.toFixed(2) + "s   at: " + badTimes.slice(0, 14).join(" ") : "   ✓ never"));

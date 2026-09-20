import os from "os";
import fs from "fs";
import path from "path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { FFMPEG_PATH, runProcess, ffmpegFromFrames } from "../../services/media/ffmpeg.js";
import { readCur } from "./cursors.mjs";

const S = path.join(os.tmpdir(), "lipi-pointer-test");
fs.mkdirSync(S, { recursive: true });
const W = 1920, H = 1020, FPS = 20, D = 9;

/* ── Backgrounds, all cursor-free ─────────────────────────────────────────── */
const light = path.join(S, "bg_light.png");
const dark = path.join(S, "bg_dark.png");
const busy = path.join(S, "bg_busy.png");
if (!fs.existsSync(light)) {
  /**
   * A page to hide a pointer on, drawn rather than taken from a recording so
   * this runs anywhere. It is deliberately hostile: hundreds of text-like
   * strokes, boxes, circles and — most of all — little arrow and triangle
   * glyphs, which are the shapes most likely to be mistaken for a pointer.
   */
  const c = createCanvas(W, H);
  const g = c.getContext("2d");
  g.fillStyle = "#fdfdfd"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#f4f5f7"; g.fillRect(0, 0, 275, H);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 900; i++) {                        // text-like strokes
    const x = 40 + rnd() * (W - 120), y = 40 + rnd() * (H - 80);
    g.fillStyle = `rgba(20,22,30,${0.45 + rnd() * 0.5})`;
    g.fillRect(x, y, 2 + rnd() * 9, 2 + rnd() * 11);
  }
  for (let i = 0; i < 40; i++) {                          // cards and borders
    const x = 300 + rnd() * (W - 700), y = 60 + rnd() * (H - 260);
    g.strokeStyle = "rgba(0,0,0,.16)"; g.lineWidth = 1;
    g.strokeRect(x, y, 120 + rnd() * 320, 60 + rnd() * 160);
  }
  for (let i = 0; i < 60; i++) {                          // arrow-shaped glyphs
    const x = 60 + rnd() * (W - 140), y = 60 + rnd() * (H - 140), s2 = 9 + rnd() * 14;
    g.fillStyle = rnd() > 0.5 ? "#1a1d24" : "#ffffff";
    g.strokeStyle = "#1a1d24"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + s2); g.lineTo(x + s2 * 0.6, y + s2 * 0.6); g.closePath();
    g.fill(); g.stroke();
  }
  for (let i = 0; i < 50; i++) {                          // icons
    const x = 60 + rnd() * (W - 120), y = 60 + rnd() * (H - 120);
    g.strokeStyle = "rgba(20,22,30,.7)"; g.lineWidth = 1.4;
    g.beginPath(); g.arc(x, y, 4 + rnd() * 7, 0, Math.PI * 2); g.stroke();
  }
  fs.writeFileSync(light, c.toBuffer("image/png"));
  await runProcess(FFMPEG_PATH, ["-y", "-i", light, "-vf", "negate,hue=h=180", dark]);
  await runProcess(FFMPEG_PATH, ["-y", "-f", "lavfi", "-i", `mandelbrot=s=${W}x${H}:start_scale=0.4`, "-frames:v", "1", busy]);
}

/* ── The real system pointers ─────────────────────────────────────────────── */
function cursor(file, size, invert = false) {
  const m = readCur("C:/Windows/Cursors/" + file + ".cur").find((x) => x.w === size && x.rgba?.px);
  const c = createCanvas(m.rgba.w, m.rgba.h);
  const id = c.getContext("2d").createImageData(m.rgba.w, m.rgba.h);
  const px = new Uint8ClampedArray(m.rgba.px);
  if (invert) for (let i = 0; i < px.length; i += 4) { px[i] = 255 - px[i]; px[i + 1] = 255 - px[i + 1]; px[i + 2] = 255 - px[i + 2]; }
  id.data.set(px);
  c.getContext("2d").putImageData(id, 0, 0);
  return { img: c, hx: m.hx, hy: m.hy };
}

/* ── A path: travel, rest, hand over a control, off screen, back, scroll ── */
function truth(t) {
  if (t >= 5.2 && t < 6.0) return null;                         // off screen
  const ease = (a, b, k) => a + (b - a) * (k * k * (3 - 2 * k));
  let x, y;
  if (t < 1.5) { const k = t / 1.5; x = ease(300, 900, k); y = ease(200, 500, k); }
  else if (t < 3.0) { x = 900; y = 500; }                        // resting
  else if (t < 4.2) { const k = (t - 3.0) / 1.2; x = ease(900, 1500, k); y = ease(500, 260, k); }
  else if (t < 5.2) { x = 1500 + 30 * Math.sin((t - 4.2) * 6); y = 260; }
  else { const k = Math.min(1, (t - 6.0) / 1.5); x = ease(1700, 600, k); y = ease(900, 700, k); }
  const shape = (t >= 3.6 && t < 5.2) || (t >= 7.8) ? "pointer" : "default";
  return { x: Math.round(x), y: Math.round(y), shape };
}

export async function makeClip(name, bgFile, { size = 32, scroll = false, invert = false } = {}) {
  const out = path.join(S, name + ".mp4");
  const bg = await loadImage(bgFile);
  const arrow = cursor("aero_arrow", size, invert);
  const hand = cursor("aero_link", size, invert);
  const c = createCanvas(W, H);
  const g = c.getContext("2d");
  const gt = [];
  const hints = [];
  let prev = null;
  await ffmpegFromFrames(["-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", out], {
    width: W, height: H, fps: FPS, pixelFormat: "rgba",
    write: async (push) => {
      for (let i = 0; i < D * FPS; i++) {
        const t = i / FPS;
        g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
        // Scrolling: the page slides up under a still pointer, 6 to 7.5 s.
        const dy = scroll && t > 6 && t < 7.5 ? -Math.round((t - 6) * 220) : scroll && t >= 7.5 ? -330 : 0;
        g.drawImage(bg, 0, dy);
        if (dy) g.drawImage(bg, 0, dy + H);
        const p = truth(t);
        if (p) {
          const k = p.shape === "pointer" ? hand : arrow;
          g.drawImage(k.img, p.x - k.hx, p.y - k.hy);
        }
        gt.push(p ? { t, ...p } : { t, x: null });
        /**
         * What the frame-difference tracker would have reported: the pointer
         * only while it MOVES (a still one makes no difference to see), a few
         * pixels off, and now and then a stray sighting of the page instead.
         */
        const moved = prev && p && Math.hypot(p.x - prev.x, p.y - prev.y) > 2;
        if (moved) hints.push({ t, x: (p.x + (Math.random() * 12 - 6)) / W, y: (p.y + (Math.random() * 12 - 6)) / H });
        else if (p && Math.random() < 0.05) hints.push({ t, x: Math.random(), y: Math.random() * 0.15 });
        prev = p;
        await push(Buffer.from(g.getImageData(0, 0, W, H).data.buffer));
      }
    },
  });
  return { file: out, gt, hints };
}

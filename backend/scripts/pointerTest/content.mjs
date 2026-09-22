/**
 * The pointer that is not the pointer.
 *
 *     node scripts/pointerTest/content.mjs
 *
 * ── THE BUG THIS REPRODUCES ──────────────────────────────────────────────────
 * A creator records a page that has a product demo PLAYING on it — which is
 * every competitor's home page, most landing pages, and a great many real
 * products. That video was recorded on somebody else's machine and it has their
 * cursor in it, moving around, looking exactly like a cursor, because it is one.
 *
 * locate.js finds the pointer by looking for the thing that looks exactly like
 * a pointer, and every test it has for telling a pointer from the page passes
 * the one inside the video:
 *
 *   it fits the template   perfectly — it IS an operating system pointer
 *   it moves               which is the property nothing printed on a page has
 *   it is unique           there is only one of it in its neighbourhood
 *
 * So calibration can lock onto the wrong cursor's design and size, and the
 * whole recording is then read looking for somebody else's pointer. Reported
 * from a real export: "it is cursorful platform and it is demoing a video and
 * our code is detecting that video's mouse and clicks".
 *
 * ── WHAT SEPARATES THEM ──────────────────────────────────────────────────────
 * Not how they look. WHERE THEY LIVE. The real pointer is composited on top of
 * everything by the operating system and goes wherever the hand goes. The other
 * one is a picture inside a rectangle that repaints itself continuously for the
 * whole recording and can never leave it.
 *
 * sync.js playingRegions() measures exactly that, and locate.js refuses a
 * sighting inside one when it has no continuity to reason from — calibrating,
 * or re-acquiring a pointer it has lost. A pointer it is already FOLLOWING is
 * never refused this way, because a creator moving their own cursor onto a
 * video to press pause is ordinary and continuity proves the pointer is theirs.
 *
 * ── WHAT THIS ASSERTS ────────────────────────────────────────────────────────
 * The real pointer is on the left half of the screen throughout and the video
 * is a rectangle on the right. So the test is simply: does the track stay on
 * the left? Every sighting inside the video rectangle is a frame in which this
 * tool was following a stranger's mouse.
 *
 * Windows only: the pointer images come from C:/Windows/Cursors.
 */
import os from "os";
import fs from "fs";
import path from "path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { ffmpegFromFrames } from "../../services/media/ffmpeg.js";
import { locatePointer } from "../../services/studio/locate.js";
import { readScreen } from "../../services/studio/sync.js";
import { readCur } from "./cursors.mjs";

const S = path.join(os.tmpdir(), "lipi-pointer-test");
fs.mkdirSync(S, { recursive: true });

const W = 1920;
const H = 1020;
const FPS = 20;
const D = 10;

/** The video playing on the page, in frame coordinates. */
const VIDEO = { x: 1020, y: 220, w: 780, h: 520 };

function cursorImage(file, size) {
  const m = readCur("C:/Windows/Cursors/" + file + ".cur").find((x) => x.w === size && x.rgba?.px);
  if (!m) throw new Error("no " + size + "px image in " + file);
  const c = createCanvas(m.rgba.w, m.rgba.h);
  const id = c.getContext("2d").createImageData(m.rgba.w, m.rgba.h);
  id.data.set(new Uint8ClampedArray(m.rgba.px));
  c.getContext("2d").putImageData(id, 0, 0);
  return { img: c, hx: m.hx, hy: m.hy };
}

/**
 * The creator's own pointer. Stays on the LEFT of the screen for the whole
 * recording — travel, rest, travel, rest — and never goes near the video.
 */
function realPointer(t) {
  const ease = (a, b, k) => a + (b - a) * (k * k * (3 - 2 * k));
  /**
   * ── MOSTLY PARKED, WHICH IS WHAT MAKES THIS HARD ──────────────────────────
   * A creator watching a page rests their hand. Over the twelve frames
   * calibration samples, a parked pointer never moves — so it FAILS the "it
   * was somewhere different between frames" test that is meant to separate a
   * pointer from the page, while the cursor inside the video passes it in
   * every frame. The wrong answer is the one that looks more like a pointer by
   * the only test available.
   */
  if (t < 1.2) { const k = t / 1.2; return { x: Math.round(ease(140, 620, k)), y: Math.round(ease(180, 430, k)) }; }
  if (t < 7.0) return { x: 620, y: 430 };
  if (t < 7.8) { const k = (t - 7.0) / 0.8; return { x: Math.round(ease(620, 540, k)), y: Math.round(ease(430, 500, k)) }; }
  return { x: 540, y: 500 };
}

/**
 * The pointer INSIDE the video: a different size, moving the whole time,
 * confined to the video's rectangle. Exactly what a recorded demo contains.
 */
function videoPointer(t) {
  const cx = VIDEO.x + VIDEO.w / 2;
  const cy = VIDEO.y + VIDEO.h / 2;
  return {
    x: Math.round(cx + Math.cos(t * 1.7) * (VIDEO.w * 0.34)),
    y: Math.round(cy + Math.sin(t * 2.3) * (VIDEO.h * 0.32)),
  };
}

async function build() {
  const out = path.join(S, "content_cursor.mp4");
  const real = cursorImage("aero_arrow", 32);
  /**
   * The SAME size as the creator's. A demo recorded on a similar display looks
   * the same, so size cannot be what tells them apart — and leaning on it
   * would be a test that passes for the wrong reason.
   */
  const other = cursorImage("aero_arrow", 32);

  const c = createCanvas(W, H);
  const g = c.getContext("2d");

  // A plain page, drawn once. The interest is the video, not the page.
  const page = createCanvas(W, H);
  const pg = page.getContext("2d");
  pg.fillStyle = "#fdfdfd";
  pg.fillRect(0, 0, W, H);
  pg.fillStyle = "#f4f5f7";
  pg.fillRect(0, 0, 275, H);
  let seed = 11;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 700; i++) {
    pg.fillStyle = `rgba(20,22,30,${0.45 + rnd() * 0.5})`;
    pg.fillRect(40 + rnd() * 900, 40 + rnd() * (H - 80), 2 + rnd() * 9, 2 + rnd() * 11);
  }

  const truth = [];
  await ffmpegFromFrames(
    ["-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", out],
    {
      width: W, height: H, fps: FPS, pixelFormat: "rgba",
      write: async (push) => {
        for (let i = 0; i < D * FPS; i++) {
          const t = i / FPS;
          g.drawImage(page, 0, 0);

          /**
           * The video, repainting every frame so readScreen() sees it for what
           * it is. Shifting bands rather than noise: a real video's pixels are
           * correlated frame to frame, and noise would be an easier problem
           * than the one this is about.
           */
          for (let b = 0; b < 26; b++) {
            const hue = (b * 14 + t * 90) % 360;
            g.fillStyle = `hsl(${hue}, 62%, ${46 + 16 * Math.sin(t * 3 + b)}%)`;
            g.fillRect(VIDEO.x, VIDEO.y + (b * VIDEO.h) / 26, VIDEO.w, VIDEO.h / 26 + 1);
          }

          const vp = videoPointer(t);
          g.drawImage(other.img, vp.x - other.hx, vp.y - other.hy);

          const rp = realPointer(t);
          g.drawImage(real.img, rp.x - real.hx, rp.y - real.hy);

          truth.push({ t, real: rp, video: vp });
          await push(Buffer.from(g.getImageData(0, 0, W, H).data.buffer));
        }
      },
    }
  );
  return { file: out, truth };
}

const { file, truth } = await build();
const duration = truth.length / FPS;

/** Is a normalised point inside the video rectangle? */
const inVideo = (x, y) =>
  x * W >= VIDEO.x && x * W <= VIDEO.x + VIDEO.w && y * H >= VIDEO.y && y * H <= VIDEO.y + VIDEO.h;

const run = async (label, screen) => {
  const r = await locatePointer(file, {
    sourceWidth: W, sourceHeight: H, duration, fps: FPS, screen,
  });
  const stolen = r.track.filter((p) => inVideo(p.x, p.y));
  // How far each sighting is from where the creator's pointer really was.
  let off = 0;
  let n = 0;
  for (const p of r.track) {
    const g = truth[Math.round(p.t * FPS)];
    if (!g) continue;
    off += Math.hypot(p.x * W - g.real.x, p.y * H - g.real.y);
    n++;
  }
  console.log(
    "  " + label.padEnd(22) +
      " design " + String(r.design).padEnd(6) + String(r.heightPx).padEnd(4) +
      " found " + String(Math.round((100 * r.found) / Math.max(1, r.frames))).padStart(3) + "%" +
      "  in the video " + String(stolen.length).padStart(3) + "/" + String(r.track.length).padEnd(4) +
      "  off by " + (n ? (off / n).toFixed(0) : "-").padStart(4) + "px"
  );
  return { r, stolen };
};

console.log("\nA page with a demo video playing on it, and a cursor inside the video.\n");

const blind = await run("without screen data", null);
const screen = await readScreen(file, { duration, sourceWidth: W, sourceHeight: H });
const seeing = await run("with screen data", screen);

console.log("");
const ok = (name, cond) => {
  console.log((cond ? "  PASS  " : "  FAIL  ") + name);
  return cond;
};
let pass = true;
pass = ok("the video's cursor is never reported as the pointer", seeing.stolen.length === 0) && pass;
pass = ok(
  "the pointer is found in most frames",
  seeing.r.frames > 0 && seeing.r.found / seeing.r.frames >= 0.8
) && pass;
pass = ok("and it is the creator's, not the video's", (() => {
  let off = 0;
  let n = 0;
  for (const p of seeing.r.track) {
    const g = truth[Math.round(p.t * FPS)];
    if (!g) continue;
    off += Math.hypot(p.x * W - g.real.x, p.y * H - g.real.y);
    n++;
  }
  return n > 0 && off / n <= 12;
})()) && pass;

console.log(pass ? "\nall passed\n" : "\nFAILED\n");
process.exit(pass ? 0 : 1);

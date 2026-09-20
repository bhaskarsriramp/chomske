/**
 * The pointer that does not move, on a page that will not sit still.
 *
 *     node scripts/pointerTest/parked.mjs
 *
 * ── THE CASE THIS EXISTS FOR ────────────────────────────────────────────────
 * A creator puts the pointer on a menu row, waits while the page finishes
 * loading, and presses. It is the most ordinary thing in a product demo and it
 * is the hardest frame in the recording to read, because:
 *
 *   - the pointer is STILL, so the difference tracker cannot see it at all and
 *     there are no hints to corroborate a match;
 *   - a spinner is going round somewhere else, so the tracker's hints point at
 *     the spinner, which is worse than having none;
 *   - the page is otherwise static, so frame after frame is byte-identical and
 *     a locator that has lost the pointer has nothing new to look at.
 *
 * On a real recording that combination lost the pointer for six and a half
 * seconds, and with it the click on "API Keys" and the zoom that should have
 * come with it. The pointer is plainly visible in every one of those frames.
 *
 * Windows only: the pointer images come from `C:/Windows/Cursors`. They are
 * read at run time and never copied into the product.
 */
import os from "os";
import fs from "fs";
import path from "path";
import { createCanvas } from "@napi-rs/canvas";
import { ffmpegFromFrames } from "../../services/media/ffmpeg.js";
import { locatePointer } from "../../services/studio/locate.js";
import { readCur } from "./cursors.mjs";

const S = path.join(os.tmpdir(), "lipi-pointer-test");
fs.mkdirSync(S, { recursive: true });

const W = 1920, H = 1020, FPS = 20, D = 10;
/** Where the pointer parks: a sidebar row, as "API Keys" sits in the real one. */
const PARK = { x: 60, y: 186 };
/** It arrives here, and stays from here to the end. */
const ARRIVE = 2.0;

function cursorImage(file, size) {
  const m = readCur("C:/Windows/Cursors/" + file + ".cur").find((x) => x.w === size && x.rgba?.px);
  const c = createCanvas(m.rgba.w, m.rgba.h);
  const id = c.getContext("2d").createImageData(m.rgba.w, m.rgba.h);
  id.data.set(new Uint8ClampedArray(m.rgba.px));
  c.getContext("2d").putImageData(id, 0, 0);
  return { img: c, hx: m.hx, hy: m.hy, h: m.rgba.h };
}

/** A product page: sidebar, rows, a content area that loads. */
function page(g, { loaded, spin }) {
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#f8f9fa"; g.fillRect(0, 0, 275, H);
  g.fillStyle = "#1a1d24"; g.font = "600 21px sans-serif";
  g.fillText("Google AI Studio", 24, 40);
  g.font = "400 12px sans-serif"; g.fillStyle = "#8b9099";
  g.fillText("PROJECT", 24, 96);
  const rows = ["API Keys", "Projects", "Usage", "Rate Limit", "Spend", "Billing"];
  rows.forEach((label, i) => {
    const y = 120 + i * 44;
    // The row the pointer rests on is highlighted, exactly as a hover does it.
    if (i === 0) { g.fillStyle = "#eceef1"; g.beginPath(); g.roundRect(14, y - 22, 246, 38, 19); g.fill(); }
    g.fillStyle = "#33373f"; g.font = "400 16px sans-serif";
    g.fillText(label, 58, y + 4);
    g.strokeStyle = "#5f6673"; g.lineWidth = 1.4;
    g.beginPath(); g.arc(34, y - 4, 7, 0, Math.PI * 2); g.stroke();
  });

  g.fillStyle = "#1a1d24"; g.font = "600 30px sans-serif";
  g.fillText(loaded ? "Gemini API Billing" : "API Keys", 380, 70);

  if (!loaded) {
    /**
     * The spinner. This is the adversary: it is the only thing moving, so it
     * is what a difference tracker reports, and it is compact and dark enough
     * to be mistaken for a pointer by anything that does not read the shape.
     */
    g.strokeStyle = "#4285f4"; g.lineWidth = 4;
    g.beginPath(); g.arc(1080, 420, 22, spin, spin + Math.PI * 1.4); g.stroke();
    return;
  }
  let seed = 11;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(26,29,36,${0.4 + rnd() * 0.5})`;
    g.fillRect(380 + rnd() * 1400, 120 + rnd() * (H - 200), 3 + rnd() * 10, 3 + rnd() * 9);
  }
  for (let i = 0; i < 14; i++) {
    g.strokeStyle = "rgba(0,0,0,.14)";
    g.strokeRect(380 + rnd() * 1100, 140 + rnd() * (H - 320), 180 + rnd() * 320, 90 + rnd() * 120);
  }
}

async function makeClip(name, size, { cursor = true } = {}) {
  const out = path.join(S, name + ".mp4");
  const hand = cursorImage("aero_link", size);
  const arrow = cursorImage("aero_arrow", size);
  const c = createCanvas(W, H);
  const g = c.getContext("2d");
  const truth = [];
  const hints = [];

  await ffmpegFromFrames(["-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", out], {
    width: W, height: H, fps: FPS, pixelFormat: "rgba",
    write: async (push) => {
      for (let i = 0; i < D * FPS; i++) {
        const t = i / FPS;
        const loaded = t >= 8.0;
        page(g, { loaded, spin: t * 7 });

        // In from the top right, then parked on the row for six seconds.
        let x, y, shape;
        if (t < ARRIVE) {
          const k = t / ARRIVE;
          x = Math.round(900 + (PARK.x - 900) * k);
          y = Math.round(90 + (PARK.y - 90) * k);
          shape = k > 0.9 ? "pointer" : "default";
        } else {
          x = PARK.x; y = PARK.y; shape = "pointer";
        }
        const k = shape === "pointer" ? hand : arrow;
        if (cursor) g.drawImage(k.img, x - k.hx, y - k.hy);
        truth.push({ t, x, y, shape });

        /**
         * What the difference tracker reports. While the pointer moves it sees
         * the pointer; once it stops it sees the spinner and nothing else, and
         * every one of those hints points at the wrong thing.
         */
        if (t < ARRIVE) hints.push({ t, x: (x + (Math.random() * 10 - 5)) / W, y: (y + (Math.random() * 10 - 5)) / H });
        else if (!loaded) hints.push({ t, x: (1080 + (Math.random() * 40 - 20)) / W, y: (420 + (Math.random() * 40 - 20)) / H });

        await push(Buffer.from(g.getImageData(0, 0, W, H).data.buffer));
      }
    },
  });
  return { file: out, truth, hints };
}

let failures = 0;
for (const [label, size, cursorPx] of [["32px pointer", 32, 20], ["48px pointer", 48, 30]]) {
  const { file, truth, hints } = await makeClip("parked_" + size, size);
  const r = await locatePointer(file, { sourceWidth: W, sourceHeight: H, duration: D, fps: FPS, hints, cursorPx });
  const byI = new Map(r.track.map((p) => [Math.round(p.t * FPS), p]));

  let held = 0, total = 0, wrong = 0, handRight = 0;
  truth.forEach((gt, i) => {
    if (gt.t < ARRIVE + 0.2 || gt.t >= 8.0) return;   // the parked stretch only
    total++;
    const p = byI.get(i);
    if (!p) return;
    const e = Math.hypot(p.x * W - gt.x, p.y * H - gt.y);
    if (e > 12) { wrong++; return; }
    held++;
    if (p.shape === gt.shape) handRight++;
  });

  const pct = Math.round((100 * held) / total);
  const shapePct = held ? Math.round((100 * handRight) / held) : 0;
  const ok = pct >= 95 && shapePct >= 95 && wrong === 0;
  if (!ok) failures++;
  console.log(
    (ok ? "PASS  " : "FAIL  ") + label.padEnd(14) +
      " parked frames held " + String(pct).padStart(3) + "%" +
      "  wrong place " + wrong +
      "  read as a hand " + shapePct + "%" +
      "  [" + r.design + " " + r.heightPx + "px]"
  );
}

/**
 * ── AND IT MUST NOT INVENT ONE ──────────────────────────────────────────────
 * Calibration now falls back to looking for a HAND when a recording offers no
 * arrow to identify itself by. That fallback is why a demo of a sidebar works
 * at all, and it is also the most dangerous thing in this file: a locator that
 * hallucinates a pointer puts our cursor somewhere nobody's hand ever was —
 * and because a hand means "clickable", it hands out zooms to go with it.
 *
 * So the same page is rendered with no pointer on it anywhere. The right
 * answer is to find nothing and say so.
 */
{
  const { file } = await makeClip("parked_none", 32, { cursor: false });
  const r = await locatePointer(file, { sourceWidth: W, sourceHeight: H, duration: D, fps: FPS, hints: [], cursorPx: 20 });
  const share = r.frames ? r.found / r.frames : 0;
  const ok = !r.design || share < 0.05;
  if (!ok) failures++;
  console.log(
    (ok ? "PASS  " : "FAIL  ") + "no pointer at all".padEnd(14) +
      "  design " + (r.design || "none") +
      "  claimed " + r.found + "/" + r.frames + " frames"
  );
}

console.log(failures ? "\n" + failures + " failed\n" : "\nall passed\n");
process.exit(failures ? 1 : 0);

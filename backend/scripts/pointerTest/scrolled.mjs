/**
 * A page scrolled end to end, a cursor in a demo riding along, and a press on
 * a fixed navigation bar.
 *
 *     node scripts/pointerTest/scrolled.mjs
 *
 * ── THE BUG THIS REPRODUCES ──────────────────────────────────────────────────
 * 2026-09-24, cursorful.com again, the morning after video.mjs was written for
 * it. The creator scrolled the whole page with the keyboard — Windows hides
 * the pointer while they do — then put the pointer on "Pricing" and pressed,
 * and the anchor link smooth-scrolled the page under the fixed bar. The export
 * had no zoom on Pricing or on Editor, and our hand drawn on the cursors
 * inside the page's embedded demos.
 *
 * One cause behind both. The re-acquisition veto was playingRegions() used
 * uncapped: how often each place on the SCREEN changed over the whole
 * recording. A page being scrolled changes every place on the screen, so 363
 * of 840 cells were "video" — the navigation bar among them — and a pointer
 * lost for a moment could never be found again where the creator clicked. It
 * was located in 21% of frames. And a demo that scrolls up the screen with the
 * page is in no one place for long, so the stranger's cursor inside it was
 * outside the veto, and was taken for the pointer.
 *
 * What replaced it asks about the moment and the place: was a moving picture
 * playing there right now with the scrolling taken out (sync.js readMedia),
 * and did this match just move WITH the page (locate.js ridesWithPage)? The
 * real pointer is drawn in screen coordinates; it never rides the scroll.
 *
 * ── WHAT IS ASSERTED ─────────────────────────────────────────────────────────
 *   scrolling is not a moving picture   the bar is not vetoed while the page
 *                                       jumps underneath it
 *   the pointer is found on the bar     after being hidden for the whole scroll,
 *                                       and held through the anchor jump
 *   the cursor riding the scroll is     never taken for the pointer while the
 *   somebody else's                     page is moving
 *
 * ── AND WHAT IT HONESTLY DOES NOT ────────────────────────────────────────────
 * A cursor inside a demo on a page that is standing still, while the creator's
 * own pointer is hidden, is not asserted either way. Nothing about it that the
 * pixels can see separates it from a pointer resting on a still page — same
 * drawing, same size, no scroll for it to ride. That case needs to know the
 * rectangle is a picture of a screen, which is the vision pass's job
 * (events.js mediaUnder), not this file's.
 */
import path from "path";
import os from "os";
import fs from "fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { ffmpegFromFrames } from "../../services/media/ffmpeg.js";
import { locatePointer } from "../../services/studio/locate.js";
import { readScreen, inMedia } from "../../services/studio/sync.js";

const S = path.join(os.tmpdir(), "lipi-pointer-test");
fs.mkdirSync(S, { recursive: true });

const W = 1920;
const H = 1020;
const FPS = 20;
const D = 9;
const NAV = 80;

let pass = true;
const ok = (name, cond, detail = "") => {
  console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "  " + detail : ""));
  if (!cond) pass = false;
  return cond;
};

/** The page is three screens tall; this is how far down it is scrolled. */
const PAGE_H = 3200;
const ease = (k) => (k < 0 ? 0 : k > 1 ? 1 : k * k * (3 - 2 * k));
function scrollAt(t) {
  if (t < 1) return 0;
  if (t < 3.5) return ease((t - 1) / 2.5) * 1400;          // keyboard scroll down
  if (t < 5) return 1400 - ease((t - 3.5) / 1.5) * 1400;   // and back to the top
  if (t < 6.2) return 0;
  if (t < 7.0) return ease((t - 6.2) / 0.8) * 2000;        // the anchor jump after the press
  return 2000;
}
/**
 * Is the page moving at t — fast enough that riding it can be told from moving
 * by itself? What the "riding" assertion is asked over. A page easing to a stop
 * moves a few pixels a second, less than the cursor in the demo does on its
 * own, and in those frames the two cannot be separated by anybody.
 */
const scrolling = (t) => Math.abs(scrollAt(t + 0.05) - scrollAt(t - 0.05)) / 0.1 >= 150;

/**
 * The embedded demo, in PAGE coordinates, and the cursor inside it. Below the
 * fold while the page is at the top, so it is on screen only while the page
 * moves: the keyboard scroll carries it through the view, and the anchor jump
 * carries it through again. See "what it honestly does not" above for why a
 * demo on screen while the page stands still is not asserted here.
 */
const DEMO = { x: 360, y: 1250, w: 1200, h: 640 };
function decoy(t) {
  return { x: DEMO.x + 300 + Math.sin(t * 0.9) * 200, y: DEMO.y + 250 + Math.cos(t * 0.7) * 120 };
}

/** The creator's pointer, in SCREEN coordinates. Hidden while they scroll. */
const PRICING = { x: 720, y: 30 };
function truth(t) {
  if (t < 1) return { x: 500, y: 520 };
  if (t < 5.4) return null;
  if (t < 5.8) {
    const k = (t - 5.4) / 0.4;
    return { x: 900 - k * (900 - PRICING.x), y: 300 - k * (300 - PRICING.y) };
  }
  return PRICING;
}

async function clip() {
  const out = path.join(S, "scrolled_page.mp4");
  const arrow = await loadImage(path.join(S, "cur_scroll_arrow.png"));

  // The page, drawn once: text blocks and boxes all the way down, so there is
  // texture for a scroll to be measured on.
  const page = createCanvas(W, PAGE_H);
  const p = page.getContext("2d");
  p.fillStyle = "#f7fbf8";
  p.fillRect(0, 0, W, PAGE_H);
  p.fillStyle = "#1f2937";
  p.font = "bold 64px sans-serif";
  p.fillText("Screen recorder with automatic zoom", 380, 260);
  /**
   * Paragraphs, headings and cards at uneven intervals, as a real page has
   * them. The first version drew one identical line every 34 pixels, and a
   * page that repeats exactly has no single answer to "how far did it move" —
   * every multiple of 34 fits — which is a property of the drawing, not of
   * anything a creator records.
   */
  const words = ["Record", "beautiful", "screen", "recordings", "with", "follow-cursor", "zooms", "export", "in", "4K", "and", "share", "a", "link", "to", "your", "team"];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 380; y < PAGE_H - 40;) {
    if (y > DEMO.y - 40 && y < DEMO.y + DEMO.h + 40) { y += 20; continue; }
    const heading = rand() < 0.12;
    p.font = heading ? "bold 40px sans-serif" : "22px sans-serif";
    p.fillStyle = heading ? "#111827" : rand() < 0.5 ? "#374151" : "#6b7280";
    let line = "";
    const n = heading ? 3 + Math.floor(rand() * 3) : 6 + Math.floor(rand() * 9);
    for (let k = 0; k < n; k++) line += words[Math.floor(rand() * words.length)] + " ";
    p.fillText(line, 260 + Math.floor(rand() * 240), y);
    y += heading ? 70 + Math.floor(rand() * 30) : 26 + Math.floor(rand() * 22);
    if (rand() < 0.08) {
      p.fillStyle = rand() < 0.5 ? "#e5e7eb" : "#d1fae5";
      p.fillRect(300 + Math.floor(rand() * 500), y, 360 + Math.floor(rand() * 300), 120 + Math.floor(rand() * 160));
      y += 300;
    }
  }

  const c = createCanvas(W, H);
  const g = c.getContext("2d");
  await ffmpegFromFrames(["-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", out], {
    width: W, height: H, fps: FPS, pixelFormat: "rgba",
    write: async (push) => {
      for (let i = 0; i < D * FPS; i++) {
        const t = i / FPS;
        const off = Math.round(scrollAt(t));
        g.drawImage(page, 0, off, W, H, 0, 0, W, H);

        /**
         * The demo, where it is on the page. A recording of a mostly still
         * screen — which is what a product demo is — with a few rows that
         * change slowly, and somebody else's cursor in it, the same drawing as
         * the creator's.
         */
        const dy = DEMO.y - off;
        g.fillStyle = "#ffffff";
        g.fillRect(DEMO.x, dy, DEMO.w, DEMO.h);
        g.fillStyle = "#e5e7eb";
        g.fillRect(DEMO.x, dy, DEMO.w, 60);
        g.fillStyle = "#9ca3af";
        for (let r = 0; r < 12; r++) g.fillRect(DEMO.x + 40, dy + 100 + r * 40, 300 + ((r * 97 + Math.floor(t * 2) * 31) % 500), 14);
        const d = decoy(t);
        g.drawImage(arrow, d.x, d.y - off);

        /**
         * The bar, fixed, over the page — and see-through, as the real one is,
         * so the page scrolling underneath shows in it. That is what put it in
         * the whole-recording "moving picture" map and vetoed the pointer on it.
         */
        g.fillStyle = "rgba(255,255,255,0.8)";
        g.fillRect(560, 0, 800, NAV);
        g.fillStyle = "#111827";
        g.font = "24px sans-serif";
        for (const [x, label] of [[640, "Features"], [PRICING.x - 20, "Pricing"], [860, "FAQ"], [960, "Editor"]]) g.fillText(label, x, 48);

        const me = truth(t);
        if (me) g.drawImage(arrow, me.x - 2, me.y - 2);
        await push(Buffer.from(g.getImageData(0, 0, W, H).data.buffer));
      }
    },
  });
  return out;
}

function drawArrow(file) {
  const c = createCanvas(32, 32);
  const g = c.getContext("2d");
  const pts = [[0, 0], [0, 22], [5, 17], [9, 26], [13, 24], [9, 16], [16, 16]];
  g.beginPath();
  g.moveTo(pts[0][0] + 2, pts[0][1] + 2);
  for (const [x, y] of pts.slice(1)) g.lineTo(x + 2, y + 2);
  g.closePath();
  g.fillStyle = "#ffffff";
  g.fill();
  g.lineWidth = 1.4;
  g.strokeStyle = "#000000";
  g.stroke();
  fs.writeFileSync(path.join(S, file), c.toBuffer("image/png"));
}

console.log("\n" + "=".repeat(84));
console.log("  A page scrolled end to end, a cursor in a demo riding along, a press on a fixed bar");
console.log("=".repeat(84) + "\n");

drawArrow("cur_scroll_arrow.png");
const file = await clip();
const screen = await readScreen(file, { duration: D, sourceWidth: W, sourceHeight: H });

/**
 * What the browser's difference tracker offers: whatever moved. While the
 * creator's pointer is hidden that is only ever the stranger's cursor.
 */
const hints = [];
for (let i = 0; i < D * FPS; i++) {
  const t = i / FPS;
  const d = decoy(t);
  hints.push({ t, x: (d.x + 6) / W, y: (d.y - scrollAt(t) + 8) / H });
  const me = truth(t);
  if (me) hints.push({ t, x: me.x / W, y: me.y / H });
}

const r = await locatePointer(file, { sourceWidth: W, sourceHeight: H, duration: D, fps: FPS, screen, cursorPx: 22, hints });

const onBar = r.track.filter((q) => q.t >= 5.9 && q.t <= D);
const found = onBar.filter((q) => Math.hypot(q.x * W - PRICING.x, q.y * H - PRICING.y) < 12).length;
const barFrames = Math.round((D - 5.9) * FPS);
const onDecoy = r.track.filter((q) => {
  const d = decoy(q.t);
  return Math.hypot(q.x * W - d.x, q.y * H - (d.y - scrollAt(q.t))) < 30;
});
const whileScrolling = onDecoy.filter((q) => scrolling(q.t));
/** Frames in which the demo's cursor was on screen while the page moved: what it COULD have been taken on. */
let exposed = 0;
for (let i = 0; i < D * FPS; i++) {
  const t = i / FPS;
  const y = decoy(t).y - scrollAt(t);
  if (scrolling(t) && y > 0 && y < H - 30) exposed++;
}
const vetoedBar = [5.9, 6.1, 6.4, 6.7, 6.9].filter((t) => inMedia(screen, t, PRICING.x / W, PRICING.y / H));

console.log("    pointer found       " + r.found + " of " + r.frames + " frames, " + r.design + " " + r.heightPx + "px");
console.log("    on Pricing          " + found + " of " + barFrames + " frames from 5.9s, through the anchor jump");
console.log("    on the demo cursor  " + onDecoy.length + " frames, " + whileScrolling.length + " of them while the page moved" +
  " — it was on screen for " + exposed + " frames of scrolling\n");

ok("the anchor jump is not a moving picture under the bar", vetoedBar.length === 0,
  vetoedBar.length ? "vetoed at " + vetoedBar.join(", ") + "s" : "");
ok("the pointer is found on the bar after being hidden for the whole scroll", found >= barFrames * 0.8,
  found + " of " + barFrames);
ok("and not lost while the page jumps under it", r.track.some((q) => q.t > 6.5 && q.t < 6.9 && q.y * H < NAV));
/**
 * "Never" would be a claim this cannot keep. The frame a cursor first slides
 * into view has no earlier frame showing where it came from, so there is no
 * ride to see yet; and passing under the see-through bar at the top edge it is
 * half hidden and cannot be found again in the frame before. What is asserted
 * is what the export got wrong: it was FOLLOWED, for seconds at a time. Here
 * no run of frames on it may be longer than MAX_RUN — a tenth of a second and
 * a half — before it is let go.
 */
const MAX_RUN = 3;
let run = 0;
let longest = 0;
for (let i = 0; i < whileScrolling.length; i++) {
  run = i && whileScrolling[i].t - whileScrolling[i - 1].t <= 1.5 / FPS ? run + 1 : 1;
  longest = Math.max(longest, run);
}
ok("the cursor riding the scroll is let go at once, not followed", longest <= MAX_RUN,
  "longest run " + longest + " frame(s); " + whileScrolling.length + " of the " + exposed + " frames it was on screen while scrolling" +
    (whileScrolling.length ? ": " + whileScrolling.slice(0, 8).map((q) => q.t.toFixed(2) + "s").join(", ") : ""));

console.log(pass ? "\nall passed\n" : "\nFAILED\n");
process.exit(pass ? 0 : 1);

/**
 * The navigation bar that does not move.
 *
 *     node scripts/pointerTest/sticky.mjs
 *
 * ── THE BUG THIS REPRODUCES ──────────────────────────────────────────────────
 * A creator recorded a marketing page, pressed "Pricing" in the navigation bar,
 * and the page scrolled to the pricing section — which is what an anchor link
 * does. The camera did not move. The production log says why: five of ten
 * presses were refused for "the page was scrolling".
 *
 * events.js explains the refusal and concludes it cannot be fixed:
 *
 *   An anchor click is: hand on a link, page scrolls, pointer stays put. A
 *   wheel scroll with the pointer resting on a nav item is: hand on a link,
 *   page scrolls, pointer stays put. […] There is no cheap third signal that
 *   separates them.
 *
 * There is one, and it is geometric rather than temporal. The navigation bar is
 * FIXED. It does not move when the page scrolls under it. So "the page
 * scrolled" is a statement about a different part of the screen from the one
 * that was clicked, and it cannot be evidence about this one.
 *
 * ── WHAT IS ASSERTED ─────────────────────────────────────────────────────────
 * A recording of a page with a fixed bar, scrolled hard in the middle:
 *
 *   the scroll is measured           an offset that grows while the page moves
 *   the bar is recognised as fixed   and the content underneath is not
 *   a press on the bar survives      the same press, at the same moment, with
 *                                    and without that knowledge
 *
 * The last one is the point. The first two are only how it gets there.
 */
import os from "os";
import fs from "fs";
import path from "path";
import { createCanvas } from "@napi-rs/canvas";
import { ffmpegFromFrames } from "../../services/media/ffmpeg.js";
import { readScreen, isSticky, scrollAt } from "../../services/studio/sync.js";
import { confirmClicks } from "../../services/studio/events.js";

const S = path.join(os.tmpdir(), "lipi-pointer-test");
fs.mkdirSync(S, { recursive: true });

const W = 1920;
const H = 1020;
const FPS = 20;
const D = 8;

/** The fixed bar, in frame coordinates. Seventy pixels, as real ones are. */
const BAR_H = 70;

/** When the page is scrolled, and how far it gets. */
const SCROLL_FROM = 2.0;
const SCROLL_TO = 5.0;
const SCROLL_PX = 1500;

function page() {
  /**
   * Tall enough to scroll through, and textured all the way down — a page of
   * flat colour has no vertical texture and nothing could measure its travel,
   * which is a real limitation and not one this test is about.
   */
  const c = createCanvas(W, H + SCROLL_PX + 200);
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, c.width, c.height);

  let seed = 3;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  for (let y = 40; y < c.height - 40; y += 34) {
    // Paragraph-ish rows of varying length and weight, so each band of the
    // picture has a brightness profile of its own to be recognised by.
    const wide = 200 + rnd() * 900;
    g.fillStyle = `rgba(20,22,30,${0.5 + rnd() * 0.45})`;
    g.fillRect(140 + rnd() * 80, y, wide, 8 + rnd() * 6);
    if (rnd() > 0.7) {
      g.fillStyle = "#e8ecf5";
      g.fillRect(1180, y - 10, 520, 90);
    }
  }
  return c;
}

/** The fixed bar: drawn over everything, in the same place, always. */
function bar(g, t) {
  g.fillStyle = "#12161f";
  g.fillRect(0, 0, W, BAR_H);
  const items = ["Product", "Pricing", "Docs", "Editor"];
  items.forEach((label, i) => {
    g.fillStyle = "#ffffff";
    g.font = "20px sans-serif";
    g.fillText(label, 1150 + i * 160, 44);
  });
  g.fillStyle = "#4ea1ff";
  g.fillRect(120, 24, 140, 22);
  // A hairline under it, which is what a real fixed bar uses to say it is over
  // the content rather than part of it.
  g.fillStyle = "rgba(0,0,0,0.25)";
  g.fillRect(0, BAR_H, W, 3);
}

function scrollY(t) {
  if (t <= SCROLL_FROM) return 0;
  if (t >= SCROLL_TO) return SCROLL_PX;
  const k = (t - SCROLL_FROM) / (SCROLL_TO - SCROLL_FROM);
  return Math.round(SCROLL_PX * (k * k * (3 - 2 * k)));
}

async function build() {
  const out = path.join(S, "sticky_nav.mp4");
  const body = page();
  const c = createCanvas(W, H);
  const g = c.getContext("2d");

  await ffmpegFromFrames(
    ["-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", out],
    {
      width: W, height: H, fps: FPS, pixelFormat: "rgba",
      write: async (push) => {
        for (let i = 0; i < D * FPS; i++) {
          const t = i / FPS;
          g.fillStyle = "#ffffff";
          g.fillRect(0, 0, W, H);
          g.drawImage(body, 0, -scrollY(t));
          bar(g, t);
          await push(Buffer.from(g.getImageData(0, 0, W, H).data.buffer));
        }
      },
    }
  );
  return out;
}

const file = await build();
const screen = await readScreen(file, { duration: D, sourceWidth: W, sourceHeight: H });

console.log("\nA page with a fixed navigation bar, scrolled from 2s to 5s.\n");

const before = scrollAt(screen, 1.5);
const after = scrollAt(screen, 5.5);
const travelled = Math.abs(after - before);
console.log(
  "  viewport offset: " + before.toFixed(3) + " at 1.5s → " + after.toFixed(3) + " at 5.5s" +
    "   (the page really moved " + (SCROLL_PX / H).toFixed(2) + " frame heights)"
);

/** The grid, printed, because a map of what was called fixed is the evidence. */
const g = screen.scrollGrid;
let barCells = 0;
let bodyCells = 0;
for (let cy = 0; cy < g.h; cy++) {
  let row = "  ";
  for (let cx = 0; cx < g.w; cx++) row += screen.sticky[cy * g.w + cx] ? "█" : "·";
  const top = (cy / g.h) * H;
  const tag = top < BAR_H ? "  ← the bar" : "";
  if (cy === 0) barCells = [...Array(g.w)].filter((_, cx) => screen.sticky[cx]).length;
  if (cy >= 4) bodyCells += [...Array(g.w)].filter((_, cx) => screen.sticky[cy * g.w + cx]).length;
  console.log(row + tag);
}

console.log("");
let pass = true;
const ok = (name, cond, detail = "") => {
  console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "  " + detail : ""));
  return cond;
};

pass = ok(
  "the scroll is measured, not just noticed",
  travelled > (SCROLL_PX / H) * 0.6,
  "read " + travelled.toFixed(2) + " of " + (SCROLL_PX / H).toFixed(2) + " frame heights"
) && pass;
pass = ok("the bar is recognised as fixed", barCells >= 2, barCells + " of " + g.w + " cells in its row") && pass;
pass = ok(
  "and the page under it is not",
  bodyCells === 0,
  bodyCells + " cells below the fold wrongly called fixed"
) && pass;
pass = ok("a point in the bar reads as fixed", isSticky(screen, 0.6, 0.03)) && pass;
pass = ok("a point in the content does not", !isSticky(screen, 0.4, 0.6)) && pass;

/* ────────────────────────────────────────────────────────────────────────────
   And the press it exists to rescue
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The same press, judged twice: once knowing nothing about which parts of the
 * screen scroll, and once knowing. Everything else is identical — the pointer
 * was a hand, it settled, something changed, and the page was scrolling —
 * because the whole claim is that this ONE fact flips the answer.
 */
const press = {
  id: "e1",
  type: "click",
  t: 2.1,
  x: 0.62,
  y: 0.035,
  confidence: 0.8,
  corroborated: true,
  scrolled: true,
};
const held = [
  { t: 1.9, x: 0.62, y: 0.035, shape: "pointer" },
  { t: 2.0, x: 0.62, y: 0.035, shape: "pointer" },
  { t: 2.1, x: 0.62, y: 0.035, shape: "pointer" },
  { t: 2.2, x: 0.62, y: 0.035, shape: "pointer" },
  { t: 2.3, x: 0.62, y: 0.035, shape: "pointer" },
  { t: 2.4, x: 0.62, y: 0.035, shape: "pointer" },
  { t: 2.5, x: 0.62, y: 0.035, shape: "pointer" },
];

const blind = confirmClicks([press], [], { located: held })[0];
const seeing = confirmClicks([press], [], { located: held, screen })[0];

console.log("");
console.log("  knowing nothing:  " + (blind.zoomable ? "zoom" : "no zoom") + "   score " + blind.score + "   " + blind.why);
console.log("  knowing the bar:  " + (seeing.zoomable ? "zoom" : "no zoom") + "   score " + seeing.score + "   " + seeing.why);

console.log("");
/**
 * Both halves matter. If the press passed WITHOUT the sticky reading, the test
 * would be proving nothing — the scroll penalty would not have been what stood
 * in its way, and the fix would be untested.
 */
pass = ok("without it, the press is refused for scrolling", blind.zoomable === false) && pass;
pass = ok("with it, the same press earns its zoom", seeing.zoomable === true) && pass;

/* ────────────────────────────────────────────────────────────────────────────
   And the control that moved between being read and being pressed
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * ── A TWO-SECOND FRAME GRID IS A LONG TIME ON A MOVING PAGE ──────────────────
 * The model reads a frame every two seconds and every question about what was
 * under the pointer is answered from the nearest one. Here a button is read at
 * 2.0s, before the page moves, and pressed at 4.0s after it has travelled most
 * of a frame height. Asked from the stale box the pointer is nowhere near it —
 * the press comes back "off-control", which is indistinguishable from a press
 * on empty space and is nothing of the kind.
 *
 * Knowing how far the page travelled is enough to move the box. It is the cheap
 * two-thirds of persistent object tracking: no optical flow, no descriptors, no
 * re-detection, just the observation that a page which scrolled took everything
 * on it along.
 */
const READ_AT = 2.0;
const PRESS_AT = 3.0;
/**
 * The page's REAL travel, from the fixture rather than from the measurement.
 * Placing the press where the button truly ended up, and then asking the
 * measurement to find it, is what makes this a test of the measurement. Using
 * the measured offset on both sides would cancel its error out and prove only
 * that the arithmetic is self-consistent.
 */
const travel = (scrollY(PRESS_AT) - scrollY(READ_AT)) / H;
const read = scrollAt(screen, PRESS_AT) - scrollAt(screen, READ_AT);

/** Where the button was when the model saw it. */
const BTN = { x: 0.30, y: 0.62, w: 0.14, h: 0.05 };
const shots = [{
  t: READ_AT,
  screen: "pricing page",
  busy: false,
  elements: [{ type: "button", label: "Start free trial", bbox: [BTN.x, BTN.y, BTN.w, BTN.h], importance: "high", state: "normal", sticky: false }],
}];

/** ...and where it is by the time it is pressed. */
const pressedAt = { x: BTN.x + BTN.w / 2, y: BTN.y + BTN.h / 2 - travel };

const movedPress = {
  id: "e2", type: "click", t: PRESS_AT,
  x: pressedAt.x, y: pressedAt.y,
  confidence: 0.8, corroborated: true, scrolled: false,
};
const onIt = (t) => [-0.2, -0.1, 0, 0.1, 0.2, 0.3].map((d) => ({
  t: t + d, x: pressedAt.x, y: pressedAt.y, shape: "pointer",
}));

const stale = confirmClicks([movedPress], shots, { located: onIt(PRESS_AT) })[0];
const moved = confirmClicks([movedPress], shots, { located: onIt(PRESS_AT), screen })[0];

console.log("");
console.log(
  "  the page really travelled " + travel.toFixed(3) + " frame heights between the frame and the press; " +
    "measured " + read.toFixed(3) + " (out by " + Math.abs(read - travel).toFixed(3) + ")"
);
console.log("  from the stale box:  " + (stale.control || "nothing under the pointer") + "   basis " + stale.basis);
console.log("  moved to where it is: " + (moved.control || "nothing under the pointer") + "   basis " + moved.basis);

console.log("");
pass = ok(
  "the page moved far enough for this to be a real question",
  Math.abs(travel) > 0.3,
  travel.toFixed(2) + " frame heights"
) && pass;
pass = ok("from a stale box the control is missed", stale.control !== "Start free trial") && pass;
pass = ok("moved to where it is, the control is found", moved.control === "Start free trial") && pass;

console.log(pass ? "\nall passed\n" : "\nFAILED\n");
process.exit(pass ? 0 : 1);

/**
 * Does the browser actually know what cursor it is looking at?
 *
 *     node scripts/pointerTest/glyph.mjs
 *
 * ── WHAT THIS IS CHECKING ────────────────────────────────────────────────────
 * The server decides two things about a recording before it can find the
 * pointer in it at all: whether the cursor has a light body inside a dark rim
 * (Windows) or a dark body inside a light one (macOS), and how tall it is. It
 * decides them by drawing candidate pointers and seeing which fits the uploaded
 * video best (services/studio/locate.js, calibrate). When it decides wrong it
 * decides wrong for the WHOLE recording, and every later frame is matched
 * against a template for a pointer that is not there. A real recording
 * calibrated as a 21px dark pointer on a machine that draws a 19px light one
 * and located the cursor in 40% of its frames.
 *
 * Neither number survives the trip. H.264 smears the one-pixel rim the design
 * lives in, and the tracker's own pass runs on a frame downscaled to a 960px
 * long side, which halves a 19px cursor to nine.
 *
 * So the browser measures both DURING the recording, out of a small patch cut
 * from the original frame at one to one, before any encoder touches it
 * (src/components/Studio/tracker.worker.js, readGlyph). This asks whether that
 * measurement is right, against real cursor files at known sizes over
 * backgrounds chosen to be awkward.
 *
 * ── WHY IT MEASURES THE BIAS RATHER THAN ONLY PASSING ────────────────────────
 * The glyph is found by what CHANGED between two patches, and the parts of it
 * that happened to match what was underneath do not change. So a reading can
 * only ever be shorter than the pointer, never taller, and the question that
 * matters is HOW MUCH shorter — a systematic two pixels would put every
 * recording's templates two pixels small. The report prints the error per case
 * so that number is visible and not assumed.
 *
 * Windows only: the pointer images come from C:/Windows/Cursors.
 */
import os from "os";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createCanvas } from "@napi-rs/canvas";
import { readCur } from "./cursors.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKER = path.join(HERE, "../../../src/components/Studio/tracker.worker.js");

/**
 * ── LOADING A WORKER SCRIPT FROM NODE ────────────────────────────────────────
 * tracker.worker.js is a classic worker script, deliberately: making it a
 * module worker would raise the browser floor this product runs on for no gain
 * to the product. A classic script has no exports, so the test appends them to
 * a copy. Reading the real file rather than a duplicate of its arithmetic is
 * the entire point — a copy would drift and then pass while the worker failed.
 */
async function loadWorker() {
  const src = fs.readFileSync(WORKER, "utf8");
  const tmp = path.join(os.tmpdir(), "lipi-glyph-" + process.pid + ".mjs");
  fs.writeFileSync(tmp, src + "\nexport { measurePatch, luma };\n");
  try {
    return await import("file://" + tmp.replace(/\\/g, "/"));
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

const { measurePatch, luma } = await loadWorker();

/** The patch the worker is given, in source pixels. Must match capture.js. */
const PATCH = 192;

/**
 * One cursor image, optionally inverted into a macOS-style dark-bodied
 * pointer — the same trick the bench uses, because a real .cur for the other
 * platform is not on this machine and the thing under test is the RELATION
 * between body and rim, which inverting preserves exactly.
 */
function cursor(file, size, invert = false) {
  const m = readCur("C:/Windows/Cursors/" + file + ".cur").find((x) => x.w === size && x.rgba?.px);
  if (!m) throw new Error("no " + size + "px image in " + file);
  const px = new Uint8ClampedArray(m.rgba.px);
  if (invert) {
    for (let i = 0; i < px.length; i += 4) {
      px[i] = 255 - px[i];
      px[i + 1] = 255 - px[i + 1];
      px[i + 2] = 255 - px[i + 2];
    }
  }
  const c = createCanvas(m.rgba.w, m.rgba.h);
  const id = c.getContext("2d").createImageData(m.rgba.w, m.rgba.h);
  id.data.set(px);
  c.getContext("2d").putImageData(id, 0, 0);

  /**
   * ── THE TRUTH TO COMPARE AGAINST ──────────────────────────────────────────
   * Not the file's 32x32 box — most of that is transparent. The height of the
   * drawn glyph is the span of rows with any opacity in them, which is what
   * locate.js means by heightPx and therefore what the browser has to report.
   */
  let top = m.rgba.h;
  let bot = -1;
  for (let y = 0; y < m.rgba.h; y++) {
    for (let x = 0; x < m.rgba.w; x++) {
      if (px[(y * m.rgba.w + x) * 4 + 3] > 40) {
        if (y < top) top = y;
        if (y > bot) bot = y;
        break;
      }
    }
  }
  return { img: c, trueH: bot - top + 1 };
}

/* ────────────────────────────────────────────────────────────────────────────
   Backgrounds
   ──────────────────────────────────────────────────────────────────────────── */

function background(kind) {
  const c = createCanvas(PATCH, PATCH);
  const g = c.getContext("2d");
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  if (kind === "plain light") {
    g.fillStyle = "#fbfbfd";
    g.fillRect(0, 0, PATCH, PATCH);
  } else if (kind === "plain dark") {
    g.fillStyle = "#14161c";
    g.fillRect(0, 0, PATCH, PATCH);
  } else if (kind === "text") {
    // The awkward case for the rim: a black outline over black text does not
    // change, so part of the rim is simply missing from the measurement.
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, PATCH, PATCH);
    g.fillStyle = "#101216";
    for (let i = 0; i < 260; i++) g.fillRect(rnd() * PATCH, rnd() * PATCH, 2 + rnd() * 7, 2 + rnd() * 3);
  } else if (kind === "photo") {
    // Every pixel differs from its neighbour, so nearly all of the glyph reads
    // as changed and the arrival is merged with nothing.
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `hsl(${rnd() * 360}, ${40 + rnd() * 50}%, ${20 + rnd() * 60}%)`;
      g.fillRect(rnd() * PATCH, rnd() * PATCH, 3 + rnd() * 8, 3 + rnd() * 8);
    }
  }
  return c;
}

/* ────────────────────────────────────────────────────────────────────────────
   One reading
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Two patches with the cursor in different places, measured.
 *
 * `travel` is how far it moved between them, and it matters: a pointer that
 * moved less than its own width leaves an arrival still joined to the hole it
 * came from, which is the case readGlyph is supposed to REFUSE rather than
 * measure badly.
 */
function patchPair(bg, cur, from, travel) {
  const frame = (dx, dy) => {
    const c = createCanvas(PATCH, PATCH);
    const g = c.getContext("2d");
    g.drawImage(bg, 0, 0);
    g.drawImage(cur.img, from.x + dx, from.y + dy);
    return luma(g.getImageData(0, 0, PATCH, PATCH).data, PATCH, PATCH);
  };
  return { before: frame(0, 0), after: frame(travel.dx, travel.dy) };
}

function reading(bg, cur, from, travel) {
  const { before, after } = patchPair(bg, cur, from, travel);
  return measurePatch(after, before, PATCH, PATCH);
}

/* ────────────────────────────────────────────────────────────────────────────
   The cases
   ──────────────────────────────────────────────────────────────────────────── */

const CASES = [];
for (const [bgName, wantDesign, invert] of [
  ["plain light", "light", false],
  ["plain dark", "light", false],
  ["text", "light", false],
  ["photo", "light", false],
  ["plain light", "dark", true],
  ["plain dark", "dark", true],
  ["text", "dark", true],
  ["photo", "dark", true],
]) {
  for (const size of [32, 48]) {
    CASES.push({ bgName, wantDesign, invert, size });
  }
}

console.log("\nThe pointer, measured in the browser at full resolution.\n");
console.log(
  "  " + "background".padEnd(13) + " " + "cursor".padEnd(14) +
    " read as        tall  true  err"
);

let pass = true;
const errors = [];
let designWrong = 0;
let missed = 0;

for (const c of CASES) {
  const bg = background(c.bgName);
  const cur = cursor("aero_arrow", c.size, c.invert);
  // Far enough that the arrival and the departure are separate blobs, which is
  // the ordinary case: at 24Hz an unhurried pointer covers 20-60px a frame.
  const g = reading(bg, cur, { x: 60, y: 50 }, { dx: 44, dy: 26 });

  const label = (c.invert ? "dark-body " : "light-body ") + c.size + "px";
  if (!g) {
    missed++;
    console.log("  " + c.bgName.padEnd(13) + " " + label.padEnd(14) + " nothing");
    continue;
  }
  const err = g.h - cur.trueH;
  errors.push(err);
  if (g.design !== c.wantDesign) designWrong++;
  console.log(
    "  " + c.bgName.padEnd(13) + " " + label.padEnd(14) + " " +
      (g.design + " " + g.shape).padEnd(15) +
      String(g.h).padStart(4) + String(cur.trueH).padStart(6) +
      (err >= 0 ? "  +" : "  ") + err
  );
}

/* ── And the case it must refuse ────────────────────────────────────────────
 * A pointer that barely moved. The arrival and the hole overlap into one
 * sparse smear that is taller and thinner than the glyph, and measuring it
 * would poison the median with readings that are wrong in a consistent
 * direction — which is worse than having fewer readings.
 */
const crawl = reading(background("text"), cursor("aero_arrow", 32), { x: 60, y: 50 }, { dx: 3, dy: 2 });

/* ── And what it costs ──────────────────────────────────────────────────────
 * This runs twenty-four times a second INSIDE the recording it is measuring,
 * on the same machine, while the creator is demonstrating something. A frame
 * of jank here is a frame of jank in the finished video, so the budget is not
 * a performance nicety — it is the difference between a measurement worth
 * having and one that damages what it measures.
 *
 * Node is not a browser and this number is not the browser's number. It is a
 * guard against the arithmetic growing by an order of magnitude unnoticed,
 * which is the way this actually goes wrong.
 */
const { before: cb, after: ca } = patchPair(background("text"), cursor("aero_arrow", 32), { x: 60, y: 50 }, { dx: 44, dy: 26 });
for (let i = 0; i < 500; i++) measurePatch(ca, cb, PATCH, PATCH);
const N = 4000;
const t0 = process.hrtime.bigint();
for (let i = 0; i < N; i++) measurePatch(ca, cb, PATCH, PATCH);
const perFrame = Number(process.hrtime.bigint() - t0) / 1e6 / N;

console.log("");
const ok = (name, cond) => {
  console.log((cond ? "  PASS  " : "  FAIL  ") + name);
  return cond;
};

pass = ok("every case was measured", missed === 0) && pass;
pass = ok("the design is right every time", designWrong === 0) && pass;
/**
 * ── WHY A PIXEL AND NOT A PERCENTAGE ─────────────────────────────────────────
 * locate.js draws its templates at whole pixel heights and a hand matches or
 * does not on one pixel of difference. A pointer read as 18 when it is 19 costs
 * nothing — the server offers a spread around the reading and re-measures the
 * winner three pixels either side — and a pointer read as 16 falls outside both
 * and costs the recording its cursor. One pixel is the tolerance that matters.
 *
 * This was two pixels under-read and one-sided before the rim correction in
 * toneOf, on the two cases where the rim matches what is behind it. It is worth
 * knowing if that ever comes back, so the bias is printed either way.
 */
pass = ok(
  "the height is right to within a pixel",
  errors.length > 0 && Math.max(...errors.map(Math.abs)) <= 1
) && pass;
pass = ok("a pointer that barely moved is refused, not guessed at", !crawl) && pass;
pass = ok(
  "and reading it costs under a millisecond, because it runs during the recording",
  perFrame < 1
) && pass;

if (errors.length) {
  const mean = errors.reduce((a, b) => a + b, 0) / errors.length;
  console.log("\n  height error: mean " + mean.toFixed(1) + "px, worst " + Math.min(...errors) + "px");
}
console.log(
  "  cost: " + perFrame.toFixed(3) + " ms a frame, " +
    (perFrame * 24).toFixed(1) + " ms of CPU per second of recording"
);

console.log(pass ? "\nall passed\n" : "\nFAILED\n");
process.exit(pass ? 0 : 1);

/**
 * The locator, run against real recordings.
 *
 *     node scripts/pointerTest/real.mjs
 *
 * ── WHY THIS EXISTS ALONGSIDE THE SYNTHETIC TESTS ───────────────────────────
 * The drawn pages in harness.mjs are deliberately hostile and they are still
 * drawn by us, which means they can only contain the difficulties we thought
 * of. Every real failure so far has been something nobody thought of:
 *
 *   - a recording whose pointer is a HAND nearly throughout, because the demo
 *     is of a sidebar and every row is clickable. Calibration only ever looked
 *     for arrows, found two in twelve sampled frames, gave up, and the whole
 *     recording fell back to the difference tracker — our arrow beside their
 *     hand for seventy-six seconds.
 *   - a window capture at 1904x1092, which is not a standard size and not a
 *     multiple of anything.
 *   - Windows hiding the pointer entirely while the creator types.
 *
 * So this runs over whatever real recordings are sitting in `fixtures/`. When
 * a creator reports a recording that goes wrong, put it there: it becomes a
 * permanent test, and the thing that broke once cannot break again quietly.
 *
 * The recordings themselves do not belong in the repository — they are
 * somebody's screen, and they are tens of megabytes each — so the directory is
 * usually empty and this prints how to fill it. Empty it again before a
 * deploy.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { locatePointer } from "../../services/studio/locate.js";
import { probe, runProcess, FFMPEG_PATH } from "../../services/media/ffmpeg.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(HERE, "fixtures");

/** What a recording of a pointer has to produce to count as read. */
const WANT = {
  /** Of the frames the pointer is actually IN. Gaps are usually real. */
  found: 0.8,
  /** Below this a match is a coincidence rather than a pointer. */
  score: 0.8,
};

const files = fs.existsSync(DIR)
  ? fs.readdirSync(DIR).filter((f) => /\.(mp4|webm|mov|mkv)$/i.test(f))
  : [];

if (!files.length) {
  fs.mkdirSync(DIR, { recursive: true });
  console.log(
    "\nNo recordings to test.\n\n" +
      "  Put real screen recordings in:\n    " + DIR + "\n\n" +
      "  Any .mp4/.webm/.mov/.mkv, from any tool — the locator only looks at\n" +
      "  the picture. A recording a creator reported a cursor problem on is the\n" +
      "  best kind. Keep them out of the repo and out of a deploy.\n"
  );
  process.exit(0);
}

/**
 * ── THE SAME RECORDING IS NOT THE SAME PROBLEM AT EVERY SIZE ────────────────
 * Whoever is recording decides how big the pointer is in the picture, and they
 * decide it without knowing: a smaller display, a scaled browser window, a
 * capture the browser downsized on its way out. The pointer's height in pixels
 * is the one number every template in locate.js is built from.
 *
 * Scaled to 1280 wide, this recording's pointer is thirteen pixels tall — and
 * at that size the recording once calibrated to a design it does not have, at
 * a size nothing is drawn at, and found the pointer in NONE of its frames.
 * The same footage at 1920 read perfectly. Nobody would have found that by
 * looking at the original.
 *
 * So every fixture is tested at the size it came in and at a small one.
 */
const SCALES = [
  { label: "native", width: 0 },
  { label: "1280 wide", width: 1280 },
];

let failures = 0;
for (const name of files) {
  const src = path.join(DIR, name);
  const info = await probe(src);

  for (const scale of SCALES) {
    let file = src;
    let width = info.width;
    let height = info.height;

    if (scale.width && info.width > scale.width) {
      width = scale.width;
      height = Math.round((info.height * scale.width) / info.width / 2) * 2;
      file = path.join(os.tmpdir(), "lipi-real-" + scale.width + "-" + name);
      if (!fs.existsSync(file)) {
        await runProcess(FFMPEG_PATH, [
          "-y", "-v", "error", "-i", src, "-vf", `scale=${width}:${height}`,
          "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", file,
        ]);
      }
    } else if (scale.width) {
      continue; // already smaller than this; nothing to test
    }

    const t0 = Date.now();
    const r = await locatePointer(file, {
      sourceWidth: width, sourceHeight: height, duration: info.duration, fps: 30, cursorPx: 0, hints: [],
    });
    const secs = (Date.now() - t0) / 1000;

    const scores = r.track.map((p) => p.score).filter(Number.isFinite).sort((a, b) => a - b);
    const median = scores.length ? scores[Math.floor(scores.length / 2)] : 0;
    const share = r.frames ? r.found / r.frames : 0;
    const shapes = {};
    for (const p of r.track) shapes[p.shape] = (shapes[p.shape] || 0) + 1;

    /**
     * A gap is not automatically a fault. Windows hides the pointer while the
     * creator types, and a pointer that leaves the window is not in the
     * picture to be found. What would be a fault is a LOW SCORE — that means
     * whatever it did find was not really a pointer.
     */
    const ok = r.design && share >= WANT.found && median >= WANT.score;
    if (!ok) failures++;

    console.log(
      (ok ? "PASS  " : "FAIL  ") + name.slice(0, 30).padEnd(31) + scale.label.padEnd(11) +
        " " + width + "x" + height +
        "  found " + String(Math.round(share * 100)).padStart(3) + "%" +
        "  score " + median.toFixed(3) +
        "  " + (r.design || "NO DESIGN") + " " + r.heightPx + "px" +
        "  " + JSON.stringify(shapes) +
        "  [" + secs.toFixed(0) + "s, " + ((secs * 1000) / Math.max(1, r.frames)).toFixed(0) + " ms/frame]"
    );
  }
}

console.log(failures ? "\n" + failures + " failed\n" : "\nall passed\n");
process.exit(failures ? 1 : 0);

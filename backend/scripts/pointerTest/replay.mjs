/**
 * One real recording through the whole first analysis, printed.
 *
 *     node scripts/pointerTest/replay.mjs <recording.mp4> [--env windows:1920x1080]
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * Every other test here either builds its own recording or runs one stage of
 * the pipeline. Neither can answer the question a creator actually asks: "I
 * clicked Pricing at 0:23, why is there no zoom?" The answer lives in the
 * interaction between the tracker, the aligner, the locator, the press rules
 * and the gate, and it only shows up when all of them run on the real footage.
 * See replayLib.mjs for how the browser's half is reproduced.
 *
 * Prints the locator's calibration, every press and the gate's reason, and the
 * camera moves, then writes the whole result to <recording>.replay.json.
 *
 * To score a recording against what really happened in it, label it and run
 * truth.mjs instead.
 */
import fs from "fs";
import path from "path";
import { replay, envFrom } from "./replayLib.mjs";

const src = process.argv[2];
if (!src || !fs.existsSync(src)) {
  console.log("usage: node scripts/pointerTest/replay.mjs <recording.mp4> [--env windows:1920x1080]");
  process.exit(1);
}
const envArg = (process.argv.find((a) => a.startsWith("--env=")) || "").slice(6) ||
  (process.argv.includes("--env") ? process.argv[process.argv.indexOf("--env") + 1] : "");

const t0 = Date.now();
const { info, capture, result: res } = await replay(src, { env: envFrom(envArg) });
const W = info.width;
const H = info.height;
console.log(`\n${path.basename(src)}  ${W}x${H}  ${info.duration.toFixed(2)}s  ${info.fps || "?"}fps  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
console.log(`[replay] tracker: ${capture.track.length} sightings, ${capture.motion.length} motion samples, profile ${JSON.stringify(capture.cursor)}`);
console.log(`[replay] locate: ${JSON.stringify(res.locate)}`);

const tl = res.timeline;
console.log("\nPRESSES");
for (const e of (tl.events || []).filter((e) => e.type === "click" || e.type === "dblclick")) {
  console.log(
    "  " + e.t.toFixed(2).padStart(6) + "s  " + (e.zoomable ? "ZOOM " : "  -  ") +
      " at " + (e.x * W).toFixed(0).padStart(4) + "," + (e.y * H).toFixed(0).padStart(4) +
      "  score " + Number(e.score ?? NaN).toFixed(2) + "  " + String(e.basis || "").padEnd(14) + " " + (e.why || "")
  );
}
console.log("\nOTHER EVENTS");
for (const e of (tl.events || []).filter((e) => e.type !== "click" && e.type !== "dblclick")) {
  console.log("  " + e.t.toFixed(2).padStart(6) + "s  " + e.type + (e.duration ? " " + Number(e.duration).toFixed(2) + "s" : ""));
}
console.log("\nZOOMS");
for (const z of tl.zooms || []) console.log("  " + z.start.toFixed(2) + "-" + z.end.toFixed(2) + "s  level " + Number(z.level).toFixed(2));
if (!(tl.zooms || []).length) console.log("  (none)");

const out = src + ".replay.json";
fs.writeFileSync(out, JSON.stringify({ capture, result: { ...res, spend: undefined } }, null, 1));
console.log("\nwrote " + out + "\n");
// The services this imports open a Redis connection that would keep the
// process alive forever, reconnecting.
process.exit(0);

/**
 * What the review stage's arbiter would add to a recording's camera.
 *
 *     VERTEX_PROJECT=<project> node scripts/pointerTest/arbiter.mjs <recording.mp4> [--env windows:1920x1080]
 *
 * The first analysis refuses a press it cannot prove from pixels; the arbiter
 * (audit.js, PRESS_ARBITER) looks at the frames around each refusal and says
 * whether something was actually activated. In production its confident
 * verdicts become zooms only when STUDIO_AUTO_PRESS_ZOOMS is on. This prints
 * what they would be — the question being whether turning it on catches the
 * clicks the pixels missed without inventing ones the creator never made.
 * Costs real model calls: a few cents a recording.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { replay, envFrom } from "./replayLib.mjs";

const src = process.argv[2];
if (!src || !fs.existsSync(src)) {
  console.log("usage: node scripts/pointerTest/arbiter.mjs <recording.mp4> [--env windows:1920x1080]");
  process.exit(1);
}
const envArg = (process.argv.find((a) => a.startsWith("--env=")) || "").slice(6) ||
  (process.argv.includes("--env") ? process.argv[process.argv.indexOf("--env") + 1] : "");

const { auditPass } = await import("../../services/studio/analyse.js");
const { info, result } = await replay(src, { env: envFrom(envArg) });
const W = info.width;
const H = info.height;
const tl = result.timeline;

console.log("\nFIRST ANALYSIS");
for (const e of (tl.events || []).filter((e) => e.type === "click" || e.type === "dblclick")) {
  console.log("  " + e.t.toFixed(2).padStart(6) + "s  " + (e.zoomable ? "ZOOM " : "  -  ") +
    " at " + (e.x * W).toFixed(0).padStart(4) + "," + (e.y * H).toFixed(0).padStart(4) + "  " + (e.basis || ""));
}

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "lipi-arbiter-"));
try {
  const audit = await auditPass({ video: src, workDir, duration: info.duration, timeline: tl, changes: result.changes || [] });
  console.log("\nARBITER FINDINGS");
  for (const f of audit.findings || []) {
    console.log("  " + Number(f.t).toFixed(2).padStart(6) + "s  " + String(f.kind).padEnd(16) + " conf " + Number(f.confidence).toFixed(2) + "  " + (f.what || f.label || f.why || ""));
  }
  console.log("\nZOOMS IT WOULD ADD (auto = applied when STUDIO_AUTO_PRESS_ZOOMS is on)");
  for (const s of (audit.suggestions || []).filter((s) => s.change?.op === "add_zoom")) {
    console.log("  " + Number(s.change.start).toFixed(2) + "-" + Number(s.change.end).toFixed(2) + "s  " + (s.auto ? "AUTO " : "offer") + "  " + (s.title || s.why || ""));
  }
  console.log("\nspend $" + Number(audit.spend?.usd || 0).toFixed(4) + " in " + (audit.spend?.calls || 0) + " call(s)\n");
} finally {
  fs.rmSync(workDir, { recursive: true, force: true });
}
process.exit(0);

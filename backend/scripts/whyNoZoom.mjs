/**
 * Why did that press not earn a zoom — or that scroll earn one?
 *
 *     MONGODB_PASSWORD=… node scripts/whyNoZoom.mjs [demoId]
 *
 * ── WHAT THIS IS FOR ─────────────────────────────────────────────────────────
 * Every judgement confirmClicks() makes is already written onto the event: the
 * score it reached, the sentence explaining it, which channel dominated, what
 * the pointer looked like, how it arrived. Nobody could read any of it without
 * opening the database by hand, so every question about a real recording turned
 * into a guess about what the rules PROBABLY did.
 *
 * This prints it. Read only — it opens the connection, dumps one demo's events
 * and zooms beside each other, and closes.
 *
 * With no id it takes the most recently analysed demo, which is almost always
 * the one being asked about.
 */
import mongoose from "mongoose";
import connectToMongo from "../db.js";
import StudioDemo from "../models/StudioDemo.js";

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const f2 = (v) => num(v).toFixed(2);

const id = process.argv[2] || "";

await connectToMongo();

const demo = id
  ? await StudioDemo.findById(id).lean()
  : await StudioDemo.findOne({ "analysis.status": "done" }).sort({ updatedAt: -1 }).lean();

if (!demo) {
  console.log("no demo found");
  await mongoose.disconnect();
  process.exit(1);
}

const tl = demo.timeline || {};
const events = (tl.events || []).filter((e) => e.type === "click" || e.type === "dblclick");
const zooms = tl.zooms || [];
const rec = demo.recording || {};

console.log("\n" + "=".repeat(78));
console.log(demo.title || "(untitled)");
console.log("  id        " + demo._id);
console.log("  recorded  " + f2(rec.duration) + "s  " + rec.width + "x" + rec.height + "  " + rec.fps + "fps");
console.log("  tracker   " + (demo.capture?.tracker || "(none)") + "   surface " + (demo.capture?.surface || "?"));
console.log("  env       " + JSON.stringify(demo.capture?.env || {}));
console.log("  cursor    " + JSON.stringify(demo.capture?.cursor || {}));
/**
 * How often the browser handed over a frame, against the 30 the export writes.
 * The recording's own fps is frames ÷ duration and cannot separate "the capture
 * was slow" from "the screen was still"; the busiest quarter can. See
 * capture.js cadenceOf().
 */
const cad = demo.capture?.frames;
if (cad?.supported) {
  console.log(
    "  cadence   " + cad.frames + " frames   median " + f2(cad.median_hz) + "fps" +
      "   busiest quarter " + f2(cad.fastest_quarter_hz) + "fps" +
      "   p10–p90 " + f2(cad.p10_ms) + "–" + f2(cad.p90_ms) + "ms" +
      "   spread " + f2(cad.spread) + "x"
  );
} else if (cad) {
  console.log("  cadence   this browser does not report frame timing");
}
console.log("  analysis  frames_read " + num(demo.analysis?.frames_read) +
  "   blur_checked " + (demo.analysis?.blur_checked === true) +
  "   locate " + JSON.stringify(demo.analysis?.locate || {}));
console.log("  updated   " + demo.updatedAt);
console.log("=".repeat(78));

/* ── Every press, and what was decided about it ────────────────────────────── */
console.log("\nPRESSES  (" + events.length + ")\n");
console.log(
  "    t      zoom?  score  basis          shape     approach  moved_by   on control"
);
/**
 * ── A LABEL THE ANALYSIS NEVER HAD ───────────────────────────────────────────
 * `control` is written twice by two different passes. confirmClicks() sets it
 * from what was under the pointer, and the audit PATCHES it afterwards with
 * what it read off the frames — which is often a control the analysis never
 * matched, because the pointer was somewhere else entirely.
 *
 * Printed the same way, the second kind reads as though the gate knew what was
 * pressed and refused anyway. On one real recording this column said "Pricing"
 * beside a press whose own evidence was `on_control: false`, and it took a dump
 * of the raw event to see that the press had been written down two thirds of a
 * screen away from the button the label names. `on_control` is what says which
 * is which, so it is shown.
 */
const controlOf = (e) => {
  if (e.on_control === true) return String(e.control || "");
  if (e.control) return String(e.control) + " (audit)";
  return e.on_control === false ? "(nothing)" : "-";
};

for (const e of events) {
  console.log(
    "  " + f2(e.t).padStart(6) +
      "   " + (e.zoomable === false ? " no " : e.zoomable === true ? " YES" : "  ? ") +
      "   " + String(num(e.score).toFixed(2)).padStart(5) +
      "  " + String(e.basis || "-").padEnd(14) +
      " " + String(e.pointer_shape || "-").padEnd(9) +
      " " + String(e.approach || "-").padEnd(9) +
      " " + String(e.moved_by || "-").padEnd(10) +
      " " + controlOf(e).slice(0, 28)
  );
  if (e.why) console.log("           " + e.why);
}

/* ── Every camera move, and where it came from ─────────────────────────────── */
console.log("\nZOOMS  (" + zooms.length + ")\n");
console.log("    start     end   level  intent   follow  auto   label");
for (const z of zooms) {
  const near = events.filter((e) => num(e.t) >= num(z.start) - 0.4 && num(e.t) <= num(z.end) + 0.4);
  console.log(
    "  " + f2(z.start).padStart(6) + "  " + f2(z.end).padStart(6) +
      "   " + f2(z.level).padStart(5) +
      "  " + String(z.intent || "-").padEnd(8) +
      " " + (z.follow ? " yes " : "  no ") +
      "  " + (z.auto ? "auto" : "hand") +
      "   " + String(z.label || "").slice(0, 34) +
      (near.length ? "" : "   ← NO PRESS INSIDE IT")
  );
}

/* ── What the audit proposed, and what was applied unasked ─────────────────── */
const findings = demo.analysis?.findings || [];
const suggestions = (demo.analysis?.suggestions || []).filter((s) => s.source === "audit");
if (findings.length) {
  console.log("\nAUDIT FINDINGS  (" + findings.length + ")\n");
  for (const f of findings) {
    console.log(
      "  " + f2(f.t).padStart(6) + "  " + String(f.kind || "").padEnd(18) +
        " conf " + f2(f.confidence) + (f.acted ? "  ACTED" : "        ") +
        "  " + String(f.label || "").slice(0, 40)
    );
    if (f.why) console.log("           " + String(f.why).slice(0, 120));
  }
}
if (suggestions.length) {
  console.log("\nAUDIT SUGGESTIONS  (" + suggestions.length + ")\n");
  for (const s of suggestions) {
    console.log(
      "  " + String(s.change?.op || "").padEnd(12) +
        " " + f2(s.change?.start).padStart(6) + "–" + f2(s.change?.end) +
        "  " + String(s.title || "").slice(0, 60)
    );
  }
}

/* ── Scrolls, because two of the three complaints are about them ───────────── */
const scrolls = (tl.events || []).filter((e) => e.type === "scroll");
console.log("\nSCROLLS  (" + scrolls.length + ")   " + scrolls.map((e) => f2(e.t)).join(" "));

await mongoose.disconnect();

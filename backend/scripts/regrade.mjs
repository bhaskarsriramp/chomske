/**
 * What would today's rules decide about a recording analysed yesterday?
 *
 *     MONGODB_PASSWORD=… node scripts/regrade.mjs <demoId>
 *
 * ── WHY THIS IS POSSIBLE AT ALL ──────────────────────────────────────────────
 * Because the analysis stores EVIDENCE and not only conclusions. The pointer
 * path, the elements the model named, the moments the screen changed and the
 * pointer's rests are all on the document, deliberately:
 *
 *   "Kept because it is EVIDENCE, not a conclusion. Whether a press was on
 *    something clickable is decided from this, and that judgement has already
 *    been changed twice."
 *
 * So a change to confirmClicks() can be tried against a real recording that
 * already went wrong, in a second, without re-running the analysis, without
 * paying for the model, and without asking anybody to record again.
 *
 * Read only. It prints the old verdict beside the new one and writes nothing.
 *
 * ── WHAT IT CANNOT SEE ───────────────────────────────────────────────────────
 * `flashes` and `screen` are derived from the video on every analysis and are
 * not stored, so the acknowledgement channel and the sticky/scroll measurement
 * are absent here. Every press they would have rescued shows as unchanged, so
 * this UNDERSTATES the effect of a change rather than overstating it.
 */
import mongoose from "mongoose";
import connectToMongo from "../db.js";
import StudioDemo from "../models/StudioDemo.js";
import { confirmClicks } from "../services/studio/events.js";

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const f2 = (v) => num(v).toFixed(2);

const id = process.argv[2];
if (!id) {
  console.log("usage: node scripts/regrade.mjs <demoId>");
  process.exit(1);
}

await connectToMongo();
const demo = await StudioDemo.findById(id).lean();
if (!demo) {
  console.log("no such demo");
  await mongoose.disconnect();
  process.exit(1);
}

const events = demo.timeline?.events || [];
const shots = demo.analysis?.elements || [];
const track = demo.timeline?.track || [];

/**
 * The stored events already carry their verdict, so they are stripped back to
 * the OBSERVATIONS before being re-judged. Leaving `zoomable` on them would let
 * yesterday's answer leak into today's.
 */
const raw = events.map(({ zoomable, basis, score, why, approach, moved_by, control, on_control, target, anchor, ...rest }) => rest);

const fresh = confirmClicks(raw, shots, { located: track });

const byId = new Map(fresh.map((e) => [e.id, e]));
let flipped = 0;

console.log("\n" + "=".repeat(86));
console.log((demo.title || "(untitled)") + "   " + id);
console.log("  re-judged with the code in this working tree, from stored evidence only");
console.log("  (no flashes, no screen measurement — both are derived from the video)");
console.log("=".repeat(86));
console.log("\n    t     was        now        score        basis         approach   on control\n");

for (const e of events) {
  if (e.type !== "click" && e.type !== "dblclick") continue;
  const n = byId.get(e.id);
  if (!n) continue;
  const before = e.zoomable === false ? "no " : e.zoomable === true ? "YES" : " ? ";
  const after = n.zoomable === false ? "no " : n.zoomable === true ? "YES" : " ? ";
  const changed = before !== after;
  /**
   * A press the original run kept on its acknowledgement cannot be reproduced
   * here: `flashes` are measured from the video on every analysis and are not
   * stored. Flagging them stops a harness limitation being read as a
   * regression — which it was, once, on the first recording this was pointed at.
   */
  const blind = e.basis === "flash" && after === "no ";
  if (changed && !blind) flipped++;
  console.log(
    (changed ? "  * " : "    ") + f2(e.t).padStart(6) +
      "   " + before + "   ->   " + after +
      "   " + f2(e.score).padStart(5) + " -> " + f2(n.score).padStart(5) +
      "   " + String(n.basis || "-").padEnd(13) +
      " " + String(n.approach || "-").padEnd(10) +
      " " + String(n.control || (n.on_control === false ? "(nothing)" : "-")).slice(0, 30) +
      (blind ? "   [was kept on a flash this harness cannot see]" : "")
  );
  if (changed) console.log("            " + n.why);
}

console.log("\n  " + flipped + " press(es) would be decided differently\n");
await mongoose.disconnect();

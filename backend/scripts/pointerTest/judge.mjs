/**
 * Experiment: the model judges every candidate press WITH the measurement
 * (services/studio/judge.js), scored against the labelled recordings next to
 * the rules that decide today.
 *
 *     VERTEX_PROJECT=<project> node scripts/pointerTest/judge.mjs [name-filter]
 *
 * Policies compared, over the same candidates:
 *   rules          confirmClicks' zoomable — what production does
 *   model          the model's "yes" at 0.6 or more, alone
 *   rules+add      rules, plus the model's confident "yes" (0.7) on a refusal
 *   rules-veto     rules, minus the model's confident "no" (0.7) on a zoom
 *
 * A labelled click is caught when a candidate within T_SLACK s and PX_SLACK px
 * of it is chosen; every chosen candidate near no labelled click is a false
 * zoom. A click with no candidate at all is out of every judge's reach and is
 * counted separately.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

process.env.STUDIO_PRESS_JUDGE = process.env.STUDIO_PRESS_JUDGE || "shadow";
const { replay, envFrom } = await import("./replayLib.mjs");
const { VERDICTS } = await import("../../services/studio/judge.js");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2] || "";
const T_SLACK = 0.8;
const PX_SLACK = 90;

const POLICIES = {
  rules: (e) => !!e.zoomable,
  model: (e) => e.judged?.clicked === "yes" && e.judged.confidence >= 0.6,
  "rules+add": (e) => !!e.zoomable || (e.judged?.clicked === "yes" && e.judged.confidence >= 0.7),
  "rules-veto": (e) => !!e.zoomable && !(e.judged?.clicked === "no" && e.judged.confidence >= 0.7),
};
const total = Object.fromEntries(Object.keys(POLICIES).map((k) => [k, { caught: 0, falses: 0 }]));
let labelled = 0;
let unreachable = 0;
const dump = [];

const files = fs.readdirSync(path.join(HERE, "truth")).filter((f) => f.endsWith(".json") && f.includes(filter)).sort();
for (const f of files) {
  const truth = JSON.parse(fs.readFileSync(path.join(HERE, "truth", f), "utf8"));
  const video = path.join(HERE, "fixtures", truth.recording);
  if (!fs.existsSync(video)) { console.log("SKIP " + f); continue; }
  console.log("\n" + "=".repeat(78) + "\n" + f);
  VERDICTS.length = 0;
  const { info, result } = await replay(video, { env: envFrom(truth.env) });
  const W = info.width;
  const H = info.height;
  // The verdicts, joined back onto the presses by time and place.
  const presses = (result.timeline.events || []).filter((e) => e.type === "click" || e.type === "dblclick").map((e) => {
    const v = VERDICTS.find((q) => Math.abs(q.t - e.t) < 0.02 && Math.abs(q.x - e.x) < 0.002 && Math.abs(q.y - e.y) < 0.002);
    return v ? { ...e, judged: v } : e;
  });
  const matchOf = (e) => (truth.clicks || []).find((c) => Math.abs(e.t - c.t) <= T_SLACK && Math.hypot(e.x * W - c.x, e.y * H - c.y) <= PX_SLACK);

  console.log("  " + "t".padStart(6) + "  " + "real click?".padEnd(22) + "rules   model");
  for (const e of presses) {
    const m = matchOf(e);
    const j = e.judged;
    console.log(
      "  " + e.t.toFixed(2).padStart(6) + "  " + (m ? "YES " + m.label : "no").padEnd(22) +
        (e.zoomable ? "zoom    " : "  -     ") +
        (j ? (j.clicked + " " + j.confidence.toFixed(2)).padEnd(10) + j.evidence.slice(0, 110) : "(no answer)")
    );
    dump.push({ file: f, t: e.t, x: e.x, y: e.y, real: m ? m.label : null, rules: !!e.zoomable, basis: e.basis, judged: j || null });
  }
  for (const c of truth.clicks || []) {
    labelled++;
    const near = presses.filter((e) => matchOf(e) === c);
    if (!near.length) { unreachable++; console.log("  (no candidate press at all for " + c.label + " at " + c.t + "s)"); }
  }
  for (const [name, pick] of Object.entries(POLICIES)) {
    let caught = 0;
    let falses = 0;
    for (const c of truth.clicks || []) if (presses.some((e) => matchOf(e) === c && pick(e))) caught++;
    for (const e of presses) if (pick(e) && !matchOf(e)) falses++;
    total[name].caught += caught;
    total[name].falses += falses;
    console.log("  " + name.padEnd(11) + " caught " + caught + "/" + (truth.clicks || []).length + ", false zooms " + falses);
  }
}

console.log("\n" + "=".repeat(78));
console.log("labelled clicks: " + labelled + " (" + unreachable + " with no candidate press, out of every judge's reach)");
for (const [name, t] of Object.entries(total)) console.log("  " + name.padEnd(11) + " caught " + t.caught + "/" + labelled + ", false zooms " + t.falses);
fs.writeFileSync(path.join(HERE, "fixtures", "judge-results.json"), JSON.stringify(dump, null, 1));
process.exit(0);

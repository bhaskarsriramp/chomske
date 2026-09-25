/**
 * Every recording score.mjs has scored, added up.
 *
 *     node scripts/pointerTest/qa/report.mjs
 *
 * One recording says whether a change helped that recording. This says whether
 * it helped: recall and false camera moves over the whole corpus, and — the
 * reason it exists — WHICH RULE is behind the misses, counted, so the next fix
 * goes where most of them are rather than where the last complaint was.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(HERE, "..", "fixtures", "qa-results");
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".json")) : [];
if (!files.length) {
  console.log("\nNothing scored yet. Run qa/score.mjs on a recording and its mouse log first.\n");
  process.exit(0);
}

let presses = 0, hits = 0, falses = 0, zooms = 0, wrong = 0, inView = 0;
const missed = {};
const falseBy = {};
const timing = [];
console.log("\n" + "recording".padEnd(44) + "presses  hit  recall  false  pointer p95");
for (const f of files.sort()) {
  const r = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  presses += r.presses; hits += r.hits; falses += r.false_moves; zooms += r.zooms;
  wrong += r.pointer?.wrong_s || 0; inView += r.pointer?.in_view_s || 0;
  for (const [k, v] of Object.entries(r.missed_by || {})) missed[k] = (missed[k] || 0) + v;
  for (const [k, v] of Object.entries(r.false_by || {})) falseBy[k] = (falseBy[k] || 0) + v;
  for (const row of r.rows || []) if (row.hit && row.press) timing.push(row.press.dt);
  console.log(
    String(r.recording).slice(0, 43).padEnd(44) + String(r.presses).padStart(7) + String(r.hits).padStart(5) +
      ((r.presses ? Math.round((100 * r.hits) / r.presses) : 0) + "%").padStart(8) + String(r.false_moves).padStart(7) +
      ((r.pointer?.p95_px ?? "-") + "px").padStart(13)
  );
}
timing.sort((a, b) => a - b);
const q = (p) => (timing.length ? timing[Math.min(timing.length - 1, Math.floor(p * timing.length))].toFixed(2) + "s" : "-");
console.log("\nALL " + files.length + " RECORDINGS");
console.log("  recall            " + hits + " / " + presses + " = " + (presses ? ((100 * hits) / presses).toFixed(1) : "-") + "%");
console.log("  false moves       " + falses + " of " + zooms + " camera moves");
console.log("  press timing      p10 " + q(0.1) + "  median " + q(0.5) + "  p90 " + q(0.9) + "  (press minus real)");
console.log("  pointer drawn >60px from the real one for " + wrong.toFixed(1) + "s of " + inView.toFixed(1) + "s in view");
const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => "    " + String(v).padStart(4) + "  " + k).join("\n");
if (Object.keys(missed).length) console.log("\n  MISSES, BY THE RULE THAT REFUSED THEM\n" + top(missed));
if (Object.keys(falseBy).length) console.log("\n  FALSE MOVES, BY THE PRESS BEHIND THEM\n" + top(falseBy));
console.log("");

/**
 * The second witness (services/studio/witness.js), scored on the labelled
 * recordings: what it would offer a creator, and whether each offer is a real
 * click the camera missed or noise.
 *
 *     VERTEX_PROJECT=<project> node scripts/pointerTest/witness.mjs [name-filter]
 *
 * Each recording is analysed as production would (replay), then watched by
 * the witness exactly as the review job does. Reported:
 *   useful   an offer on a labelled click the camera did NOT zoom on
 *   noise    an offer near no labelled click — a creator would have to dismiss it
 *   agreed   camera zooms the witness confirmed
 *   unseen   camera zooms the witness did not see (logged only, never offered)
 *   set aside  witness claims dropped because the creator's pointer was not resting there
 */
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const { replay, envFrom } = await import("./replayLib.mjs");
const { witnessPass } = await import("../../services/studio/witness.js");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2] || "";
const T_SLACK = 0.8;
const tot = { useful: 0, noise: 0, agreed: 0, unseen: 0, aside: 0, missedByCamera: 0 };

for (const f of fs.readdirSync(path.join(HERE, "truth")).filter((x) => x.endsWith(".json") && x.includes(filter)).sort()) {
  const truth = JSON.parse(fs.readFileSync(path.join(HERE, "truth", f), "utf8"));
  const video = path.join(HERE, "fixtures", truth.recording);
  if (!fs.existsSync(video)) { console.log("SKIP " + f); continue; }
  console.log("\n" + "=".repeat(78) + "\n" + f);
  const { info, result } = await replay(video, { env: envFrom(truth.env) });
  const tl = result.timeline;
  const zoomedAt = (t) => (tl.zooms || []).some((z) => z.start <= t + 0.3 && z.end >= t - 0.3);
  for (const c of truth.clicks || []) if (!zoomedAt(c.t)) { tot.missedByCamera++; console.log("  camera missed " + c.label + " at " + c.t + "s"); }
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "lipi-witness-"));
  try {
    const w = await witnessPass({ video, workDir, timeline: tl, duration: info.duration });
    const s = w.summary;
    if (!s) { console.log("  (the witness gave no answer)"); continue; }
    tot.agreed += s.agreed;
    tot.unseen += s.unseen.length;
    tot.aside += s.set_aside;
    for (const g of w.suggestions) {
      const t = g.change.start + 0.45;
      const real = (truth.clicks || []).find((c) => Math.abs(c.t - t) <= T_SLACK);
      if (real && !zoomedAt(real.t)) { tot.useful++; console.log("  USEFUL  " + g.title + " at " + t.toFixed(2) + "s (real: " + real.label + ")"); }
      else { tot.noise++; console.log("  NOISE   " + g.title + " at " + t.toFixed(2) + "s" + (real ? " (already zoomed: " + real.label + ")" : "")); }
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
console.log("\n" + "=".repeat(78));
console.log(`camera missed ${tot.missedByCamera} labelled click(s)`);
console.log(`witness offers: ${tot.useful} useful, ${tot.noise} noise; confirmed ${tot.agreed} zooms, did not see ${tot.unseen}, set aside ${tot.aside} claims`);
process.exit(0);

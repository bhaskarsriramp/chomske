/**
 * truthScore.js: how many of the clicks you really made did the pipeline keep?
 *
 * Run on the VM, against a demo and the log fixtures/truth.html wrote:
 *   node scripts/truthScore.js <demoId> ~/truth-1758412345.json
 *   node scripts/truthScore.js <demoId> truth.json --offset=1.84
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────
 * Every threshold in services/studio/events.js is a judgement, and until now
 * every one of them has been tuned by watching an export. "It missed the
 * Projects click" is a real report and a useless measurement: it does not say
 * whether the click was never DETECTED, detected and REFUSED by the gate, or
 * kept and then framed somewhere the eye did not go. Those three have three
 * different fixes and no way to tell them apart from the outside.
 *
 * This says which. It walks the same click through every stage and reports
 * where each one was lost, with the gate's own reason attached.
 *
 * ── IT READS. IT NEVER WRITES ────────────────────────────────────────────────
 * No model calls, no storage, nothing touched in the database. Run it as often
 * as you like on the same recording while you change a threshold and
 * re-analyse; the number moving is the point.
 */
import "dotenv/config";
import fs from "fs";
import mongoose from "mongoose";
import connectToMongo from "../db.js";
import StudioDemo from "../models/StudioDemo.js";

const arg = (name, d = "") => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : d;
};
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const pct = (n, d) => (d ? ((100 * n) / d).toFixed(0).padStart(3) + "%" : "  —%");

/**
 * How far apart a real click and a recovered one may be and still be the same
 * press.
 *
 * Generous in time, because the pipeline timestamps a press at the moment the
 * evidence resolves rather than at mouse-down, and sync.js's clock alignment
 * has its own error. Tight in space, because a press recovered a fifth of a
 * frame away from where the finger went down is not the same press — it is a
 * coincidence, and counting it would flatter every number below.
 */
const NEAR_T = 0.6;
const NEAR_XY = 0.08;

/**
 * ── LINING THE TWO CLOCKS UP ─────────────────────────────────────────────────
 * The page's log starts at its sync flash; the video starts whenever
 * MediaRecorder produced its first frame. The flash is by a wide margin the
 * largest thing that happens on screen, and analysis.changes already measures
 * exactly that, so the offset is the timestamp of the biggest change near the
 * start. No video decode, no guessing.
 *
 * It refuses rather than guesses when nothing stands out, because a wrong
 * offset applied confidently turns a perfect run into a report of total
 * failure — and someone would then go and "fix" a pipeline that was fine.
 */
function findFlash(changes, { within = 25 } = {}) {
  const early = (changes || []).filter((c) => num(c.t) <= within);
  if (early.length < 2) return null;
  const sorted = [...early].sort((a, b) => num(b.cover) - num(a.cover));
  const top = sorted[0];
  const next = sorted[1];
  // A full-viewport inversion is not a close call. If the runner-up is within
  // half of it, this recording has something else big at the start and the
  // flash cannot be picked out.
  if (num(top.cover) < 0.5 || num(top.cover) < num(next.cover) * 2) return null;
  return num(top.t);
}

function main_report(truth, demo, offset) {
  const tl = demo.timeline || {};
  const events = (tl.events || []).filter((e) => e.type === "click" || e.type === "dblclick");
  const zooms = tl.zooms || [];

  const real = (truth.clicks || [])
    .filter((c) => c.button === 0 && Number.isFinite(c.t))
    .map((c) => ({ ...c, vt: num(c.t) + offset }));

  const used = new Set();
  const rows = [];

  for (const c of real) {
    /**
     * The nearest unclaimed press, in time, that also landed in roughly the
     * right place. One recovered press may only answer for one real one:
     * without that, a demo that minted a single click near a burst of five
     * would score five out of five.
     */
    let best = null;
    for (const e of events) {
      if (used.has(e.id)) continue;
      const dt = Math.abs(num(e.t) - c.vt);
      if (dt > NEAR_T) continue;
      const d = Math.hypot(num(e.x) - num(c.x), num(e.y) - num(c.y));
      if (d > NEAR_XY) continue;
      if (!best || dt < best.dt) best = { e, dt, d };
    }
    if (best) used.add(best.e.id);

    const zoom = best
      ? zooms.find((z) => num(z.start) - 0.6 <= best.e.t && num(z.end) + 0.2 >= best.e.t)
      : zooms.find((z) => num(z.start) - 0.6 <= c.vt && num(z.end) + 0.2 >= c.vt);

    rows.push({
      truth: c,
      event: best?.e || null,
      dt: best?.dt ?? null,
      d: best?.d ?? null,
      zoom: zoom || null,
      stage: !best ? "undetected" : best.e.zoomable === false ? "refused" : zoom ? "kept" : "no-zoom",
    });
  }

  const ghosts = events.filter((e) => !used.has(e.id));
  return { rows, ghosts, real, events, zooms };
}

async function main() {
  const [demoId, truthPath] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!demoId || !truthPath) {
    console.error("usage: node scripts/truthScore.js <demoId> <truth.json> [--offset=SECONDS] [--verbose]");
    process.exit(2);
  }

  const truth = JSON.parse(fs.readFileSync(truthPath, "utf8"));
  await connectToMongo();
  const demo = await StudioDemo.findById(demoId).lean();
  if (!demo) {
    console.error("no such demo: " + demoId);
    process.exit(1);
  }

  const manual = arg("offset");
  const offset = manual !== "" ? num(manual) : findFlash(demo.analysis?.changes);
  if (offset === null) {
    console.error(
      "\nCould not find the sync flash in analysis.changes.\n" +
      "  Either the recording does not contain it, or the demo has no change list\n" +
      "  (re-analyse it). Pass --offset=SECONDS to line them up by hand: it is the\n" +
      "  video time at which the screen goes black.\n"
    );
    process.exit(1);
  }

  const { rows, ghosts, real, events, zooms } = main_report(truth, demo, offset);

  console.log("");
  console.log(`  demo      ${demoId}  (${(demo.recording?.duration || 0).toFixed(1)}s, ${demo.recording?.width}x${demo.recording?.height})`);
  console.log(`  truth     ${truthPath}  —  ${real.length} real press(es), ${(truth.hovers || []).length} hover(s)`);
  console.log(`  offset    ${offset.toFixed(3)}s${manual !== "" ? " (given)" : " (from the sync flash)"}`);
  console.log(`  pipeline  ${events.length} press(es) recovered, ${zooms.length} zoom(s)`);

  /* ── The funnel ───────────────────────────────────────────────────────── */
  const detected = rows.filter((r) => r.event).length;
  const kept = rows.filter((r) => r.event && r.event.zoomable !== false).length;
  const framed = rows.filter((r) => r.zoom).length;

  console.log("");
  console.log("  ── Where the real presses went ────────────────────────────");
  console.log(`     detected by the pixels   ${String(detected).padStart(3)} / ${real.length}   ${pct(detected, real.length)}`);
  console.log(`     kept by the gate         ${String(kept).padStart(3)} / ${real.length}   ${pct(kept, real.length)}`);
  console.log(`     given a camera move      ${String(framed).padStart(3)} / ${real.length}   ${pct(framed, real.length)}`);

  /* ── Every loss, with the reason ──────────────────────────────────────── */
  const lost = rows.filter((r) => r.stage !== "kept");
  if (lost.length) {
    console.log("");
    console.log("  ── What was lost, and where ───────────────────────────────");
    for (const r of lost) {
      const c = r.truth;
      const where = `${c.vt.toFixed(2)}s ${(c.label || "(empty space)").padEnd(16)} ${c.kind.padEnd(12)}`;
      if (r.stage === "undetected") {
        console.log(`     NEVER SEEN   ${where}  no press was recovered within ${NEAR_T}s and ${NEAR_XY} of it`);
      } else if (r.stage === "refused") {
        console.log(`     REFUSED      ${where}  ${r.event.basis || "?"} — ${r.event.why || ""}`);
      } else {
        console.log(`     NO ZOOM      ${where}  kept by the gate, but no camera move covers it`);
      }
    }
  }

  /**
   * ── AND THE PRESSES NOBODY MADE ──────────────────────────────────────────
   * Recall on its own is easy to win: mint a click every half second and
   * nothing is ever missed. These are the ones with no real press behind them,
   * and a change that improves the numbers above while growing this list has
   * not improved anything.
   */
  console.log("");
  console.log("  ── Presses the pipeline invented ──────────────────────────");
  if (!ghosts.length) {
    console.log("     none");
  } else {
    for (const g of ghosts) {
      console.log(
        `     ${num(g.t).toFixed(2).padStart(6)}s  ${(g.zoomable === false ? "refused" : "KEPT   ")}  ` +
          `${g.basis || "?"}${g.control ? ` on "${g.control}"` : ""}`
      );
    }
    const keptGhosts = ghosts.filter((g) => g.zoomable !== false).length;
    console.log(`     ${ghosts.length} invented, ${keptGhosts} of them kept — those are the zooms on nothing`);
  }

  /* ── Unqualified clicks: the ones that SHOULD be refused ──────────────── */
  const empties = rows.filter((r) => r.truth.kind === "empty");
  if (empties.length) {
    const rightlyRefused = empties.filter((r) => !r.event || r.event.zoomable === false).length;
    console.log("");
    console.log("  ── Clicks on empty space (the camera must NOT move) ───────");
    console.log(`     correctly ignored        ${String(rightlyRefused).padStart(3)} / ${empties.length}   ${pct(rightlyRefused, empties.length)}`);
    for (const r of empties.filter((x) => x.event && x.event.zoomable !== false)) {
      console.log(`     LEAKED  ${r.truth.vt.toFixed(2)}s  kept as "${r.event.basis}" — ${r.event.why || ""}`);
    }
  }

  /* ── How well placed, and how well named ──────────────────────────────── */
  const matched = rows.filter((r) => r.event);
  if (matched.length) {
    const ds = matched.map((r) => r.d).sort((a, b) => a - b);
    const dts = matched.map((r) => Math.abs(r.dt)).sort((a, b) => a - b);
    const mid = (a) => a[a.length >> 1];
    console.log("");
    console.log("  ── How close the recovered press was ──────────────────────");
    console.log(`     position   median ${(mid(ds) * 100).toFixed(1)}% of the frame, worst ${(ds[ds.length - 1] * 100).toFixed(1)}%`);
    console.log(`     timing     median ${mid(dts).toFixed(3)}s, worst ${dts[dts.length - 1].toFixed(3)}s`);

    const named = matched.filter((r) => r.event.control);
    if (named.length) {
      const right = named.filter((r) => String(r.event.control).toLowerCase() === String(r.truth.label).toLowerCase()).length;
      console.log(`     named      ${right} of ${named.length} controls named correctly`);
      for (const r of named.filter((x) => String(x.event.control).toLowerCase() !== String(x.truth.label).toLowerCase())) {
        console.log(`        ${r.truth.vt.toFixed(2)}s  said "${r.event.control}", was "${r.truth.label || "(empty space)"}"`);
      }
    }
  }

  if (arg("verbose") !== "" || process.argv.includes("--verbose")) {
    console.log("");
    console.log("  ── Every press, in order ──────────────────────────────────");
    for (const r of rows) {
      console.log(
        `     ${r.truth.vt.toFixed(2).padStart(6)}s  ${(r.truth.label || "(empty)").padEnd(16)} ` +
          `${r.stage.padEnd(11)} ${r.event ? `${r.event.basis || "?"}` : ""}`
      );
    }
  }

  console.log("");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[truth-score] failed:", err);
  process.exit(1);
});

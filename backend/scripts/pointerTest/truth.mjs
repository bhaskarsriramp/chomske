/**
 * Real recordings, scored against what really happened in them.
 *
 *     node scripts/pointerTest/truth.mjs            # every labelled recording
 *     node scripts/pointerTest/truth.mjs cursorful  # those whose name matches
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * On 2026-09-23 a fix made a recording of a landing page with an embedded demo
 * video come out right, and every synthetic test in this folder passed. The
 * next morning the creator recorded the same page again, scrolled it a little
 * more, and both of their presses on the navigation bar were lost while our
 * pointer rode a stranger's cursor inside the demo. Every synthetic test still
 * passed. The creator's words: "if everyday one different bug or output or
 * issues comes then our platform will be unpredictable and nobody will use it."
 *
 * The drawn test pages can only contain the difficulties somebody thought of.
 * The recordings that broke contain the ones nobody did. So every recording a
 * creator reports goes here WITH ITS ANSWER — the presses they actually made,
 * and where the cursors that are not theirs live — and every change to the
 * pointer, the presses or the camera is scored against all of them before it
 * ships. A fix for one recording that breaks another shows up here, not in the
 * creator's next export.
 *
 * ── THE FILES ────────────────────────────────────────────────────────────────
 *   truth/<name>.json      the answer, committed: timestamps and coordinates
 *   fixtures/<recording>   the footage, NOT committed (somebody's screen, tens
 *                          of megabytes). `source` in the truth file says where
 *                          to fetch it from.
 *
 * A truth file:
 *
 *   {
 *     "recording": "cursorful-2026-09-24.mp4",
 *     "source":    "gs://…/src/recording.mp4",
 *     "env":       "windows:1920x1080",
 *     "clicks":    [{ "label": "Pricing", "t": 23.2, "x": 950, "y": 45 }],
 *     "strangers": [{ "label": "…", "from": 13.5, "to": 17.6, "box": [x0, y0, x1, y1] }],
 *     "stranger_budget_s": 0
 *   }
 *
 * Coordinates are source pixels. `strangers` are places where a cursor that is
 * NOT the creator's is on screen; seconds of OUR pointer drawn inside one are
 * counted against `stranger_budget_s` — a ratchet, lowered as things improve
 * and never raised. A press may carry `"known": "why"` when its failure is
 * understood and not the code's (the replay differing from production, say);
 * it is reported as KNOWN rather than failed, and flagged if it starts passing.
 *
 * ── WHAT PASSES ─────────────────────────────────────────────────────────────
 *   every labelled press   moves the camera: a press the gate accepted, within
 *                          T_SLACK of the time and PX_SLACK of the place
 *   no other camera move   a zoom that covers no labelled press is a zoom on
 *                          something the creator did not do
 *   strangers              our pointer drawn on somebody else's for no longer
 *                          than the file's budget
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { replay, envFrom } from "./replayLib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TRUTH = path.join(HERE, "truth");
const FIXTURES = path.join(HERE, "fixtures");

/** How far a press may be from the labelled one and still be it. */
const T_SLACK = 0.8;
const PX_SLACK = 90;

const want = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const files = fs.existsSync(TRUTH)
  ? fs.readdirSync(TRUTH).filter((f) => f.endsWith(".json") && (!want.length || want.some((w) => f.includes(w))))
  : [];
if (!files.length) {
  console.log("\nNo labelled recordings" + (want.length ? " matching " + want.join(", ") : "") + " in " + TRUTH + "\n");
  process.exit(0);
}

let failed = 0;
let skipped = 0;
for (const f of files) {
  const truth = JSON.parse(fs.readFileSync(path.join(TRUTH, f), "utf8"));
  const video = path.join(FIXTURES, truth.recording);
  console.log("\n" + "=".repeat(78) + "\n" + f + "  —  " + (truth.about || ""));
  if (!fs.existsSync(video)) {
    skipped++;
    console.log("  SKIP  the recording is not in fixtures/. Fetch it with:\n" +
      "        gcloud storage cp \"" + (truth.source || "?") + "\" \"" + video + "\"");
    continue;
  }

  const t0 = Date.now();
  const { info, result } = await replay(video, { env: envFrom(truth.env) });
  const W = info.width;
  const H = info.height;
  const tl = result.timeline;
  const presses = (tl.events || []).filter((e) => e.type === "click" || e.type === "dblclick");
  const zooms = tl.zooms || [];
  let ok = true;
  const line = (pass, text) => { console.log((pass ? "  PASS  " : "  FAIL  ") + text); if (!pass) ok = false; };

  console.log("  analysed in " + ((Date.now() - t0) / 1000).toFixed(0) + "s   located " + result.locate?.found + "/" + result.locate?.frames +
    " frames (" + (result.locate?.design || "no design") + " " + (result.locate?.height_px || "?") + "px)");

  /* Every labelled press moves the camera. */
  for (const c of truth.clicks || []) {
    const near = presses
      .map((e) => ({ e, dt: Math.abs(e.t - c.t), d: Math.hypot(e.x * W - c.x, e.y * H - c.y) }))
      .filter((m) => m.dt <= T_SLACK && m.d <= PX_SLACK)
      .sort((a, b) => a.dt - b.dt);
    const hit = near.find((m) => m.e.zoomable);
    const zoomed = zooms.some((z) => z.start <= c.t + 0.3 && z.end >= c.t - 0.3);
    /**
     * A press labelled `known` is a failure somebody has already explained in
     * the truth file — typically something the replay does that production
     * does not. It is reported, not counted: a harness that is always red is a
     * harness nobody reads. If it starts passing, that is said loudly, so the
     * label comes off.
     */
    if (c.known && !(hit && zoomed)) {
      console.log(`  KNOWN ${c.label} at ${c.t}s — ${c.known}`);
    } else if (hit && zoomed) {
      line(true, `${c.label} at ${c.t}s — press at ${hit.e.t.toFixed(2)}s, ${hit.d.toFixed(0)}px away, basis ${hit.e.basis}` +
        (c.known ? "   << labelled known-failing and now PASSES: remove the label" : ""));
    } else if (near.length) {
      const m = near[0];
      line(false, `${c.label} at ${c.t}s — found at ${m.e.t.toFixed(2)}s but refused: ${m.e.basis} — ${m.e.why || ""}`);
    } else {
      const closest = presses.map((e) => ({ e, dt: Math.abs(e.t - c.t) })).sort((a, b) => a.dt - b.dt)[0];
      line(false, `${c.label} at ${c.t}s — no press there` +
        (closest ? ` (nearest: ${closest.e.t.toFixed(2)}s at ${(closest.e.x * W).toFixed(0)},${(closest.e.y * H).toFixed(0)})` : ""));
    }
  }

  /* No camera move the creator did not ask for. */
  for (const z of zooms) {
    const earned = (truth.clicks || []).some((c) => z.start <= c.t + 0.3 && z.end >= c.t - 0.3);
    if (!earned) line(false, `zoom ${z.start.toFixed(2)}-${z.end.toFixed(2)}s covers no press the creator made`);
  }

  /* Our pointer on somebody else's. */
  const track = tl.track || [];
  let onStranger = 0;
  const where = [];
  for (let i = 0; i < track.length; i++) {
    const p = track[i];
    const next = track[i + 1];
    const span = Math.min(0.1, next ? next.t - p.t : 0.033);
    const x = p.x * W;
    const y = p.y * H;
    const s = (truth.strangers || []).find((q) => p.t >= q.from && p.t <= q.to && x >= q.box[0] && y >= q.box[1] && x <= q.box[2] && y <= q.box[3]);
    if (s) { onStranger += span; if (!where.includes(s.label)) where.push(s.label); }
  }
  const budget = Number(truth.stranger_budget_s || 0);
  line(onStranger <= budget + 1e-6,
    `our pointer drawn on a stranger's for ${onStranger.toFixed(2)}s (budget ${budget}s)` + (where.length ? " — " + where.join("; ") : ""));

  if (!ok) failed++;
}

console.log("\n" + (failed ? failed + " of " + files.length + " recording(s) FAILED" : "all " + (files.length - skipped) + " scored recording(s) passed") +
  (skipped ? ", " + skipped + " skipped (no footage)" : "") + "\n");
process.exit(failed ? 1 : 0);

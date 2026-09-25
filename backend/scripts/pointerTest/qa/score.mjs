/**
 * A test recording scored against the creator's real mouse.
 *
 *     node scripts/pointerTest/qa/score.mjs <recording.mp4> <mouselog.jsonl> [--env windows:1920x1080] [--truth name]
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────
 * Eleven recordings labelled by hand, frame by frame, is what every change to
 * the pointer and the presses was measured against, and eleven is not enough:
 * the threshold that fixes one site breaks another, and there were not enough
 * sites to see it coming. Labelling by hand does not scale, and it is not even
 * exact — a press that changed nothing on screen has no frame to point at.
 *
 * mouselog.ps1 writes down the real mouse while a TEST recording is made. This
 * lines the two up — in time and in space, from the pointer's own path, so
 * nobody has to note when recording started or where the tab sat on screen —
 * and then says, for every press the creator really made, whether the camera
 * moved to it, and for every camera move, whether a press was really there.
 * And it measures how far the drawn pointer was from the real one.
 *
 * With --truth <name> the presses are also written as truth/<name>.json, so the
 * recording joins the corpus truth.mjs checks every change against.
 *
 * ── THE ALIGNMENT ────────────────────────────────────────────────────────────
 * Time: the log's clock and the video's are offset by an unknown amount. The
 * pointer's SPEED is the same curve in both (up to a scale, since the log is
 * in screen pixels and the video in its own), so the offset is where the two
 * speed curves correlate best. Space: with the offset known, pairs of (logged
 * position, drawn position) give x_video = ax·x_screen + bx and the same for
 * y, fitted robustly because the drawn path is sometimes wrong — which is part
 * of what is being measured. Then the offset is refined on position.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { replay, envFrom } from "../replayLib.mjs";
import { probe } from "../../../services/media/ffmpeg.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TRUTH = path.join(HERE, "..", "truth");

/** The same slack truth.mjs gives a press. */
const T_SLACK = 0.8;
const PX_SLACK = 90;
/** A press whose release is further or later than this was a drag, not a click. */
const DRAG_PX = 12;
const DRAG_S = 0.8;
/** Two left presses this close in time and place are one double click. */
const DOUBLE_S = 0.5;
const DOUBLE_PX = 8;
/** Drawn this far from the real pointer, it was drawn in the wrong place. */
const WRONG_PX = 60;
const STEP = 1 / 30;

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf("--" + name);
  if (i >= 0) return args[i + 1];
  const eq = args.find((a) => a.startsWith("--" + name + "="));
  return eq ? eq.split("=").slice(1).join("=") : null;
};
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && !args[i - 1].includes("=")));
const [video, logFile] = positional;
if (!video || !logFile) {
  console.log("usage: node scripts/pointerTest/qa/score.mjs <recording.mp4> <mouselog.jsonl> [--env windows:1920x1080] [--truth name]");
  process.exit(1);
}

/* ── The log ─────────────────────────────────────────────────────────────── */
const lines = fs.readFileSync(logFile, "utf8").split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const head = lines.find((l) => l.start_utc) || {};
const log = lines.filter((l) => typeof l.t === "number").map((l) => ({ ...l, t: l.t / 1000 })).sort((a, b) => a.t - b.t);
if (log.length < 20) { console.log("The log has almost nothing in it (" + log.length + " events)."); process.exit(1); }
const logEnd = log[log.length - 1].t;

/** Where the real pointer was at log time t: the last reported position. */
const posOf = (() => {
  const pts = log.filter((l) => l.e === "move" || l.e === "down" || l.e === "up");
  return (t) => {
    let lo = 0;
    let hi = pts.length - 1;
    if (t < pts[0].t) return null;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].t <= t) lo = m; else hi = m; }
    const p = pts[hi].t <= t ? pts[hi] : pts[lo];
    return { x: p.x, y: p.y };
  };
})();

/* ── The recording, analysed the way production analyses it ────────────── */
console.log("\nAnalysing " + path.basename(video) + " …");
const t0 = Date.now();
/**
 * --cached reuses the analysis replay.mjs saved beside the recording
 * (<recording>.replay.json), for trying the scoring again without waiting for
 * the analysis again. Only for that: a changed pipeline needs a fresh one.
 */
const saved = video + ".replay.json";
const { info, result } = args.includes("--cached") && fs.existsSync(saved)
  ? { info: await probe(video), result: JSON.parse(fs.readFileSync(saved, "utf8")).result }
  : await replay(video, { env: envFrom(flag("env") || "windows:1920x1080") });
const W = info.width;
const H = info.height;
const duration = info.duration;
const tl = result.timeline;
console.log("  analysed in " + ((Date.now() - t0) / 1000).toFixed(0) + "s, " + W + "x" + H + ", " + duration.toFixed(1) + "s");

/** The drawn pointer at video time t, in video pixels; null in a hole. */
const drawn = (() => {
  const tr = (tl.track || []).map((p) => ({ t: p.t, x: p.x * W, y: p.y * H }));
  return (t) => {
    let best = null;
    for (const p of tr) {
      if (p.t > t + 0.05) break;
      if (p.t >= t - 0.05) best = p;
    }
    return best;
  };
})();

/* ── Time: the speed curves ──────────────────────────────────────────────── */
const speedSeries = (at, from, to) => {
  const out = [];
  let prev = at(from);
  for (let t = from + STEP; t <= to; t += STEP) {
    const p = at(t);
    out.push(p && prev ? Math.hypot(p.x - prev.x, p.y - prev.y) / STEP : NaN);
    prev = p;
  }
  return out;
};
const vSpeed = speedSeries(drawn, 0, duration);
const ncc = (a, b) => {
  let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    n++; sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y;
  }
  if (n < 90) return -1;
  const cov = sab - (sa * sb) / n;
  const va = saa - (sa * sa) / n;
  const vb = sbb - (sb * sb) / n;
  return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : -1;
};
let lag = null;
{
  const lSpeed = speedSeries(posOf, 0, logEnd);
  let best = -2;
  const maxLag = Math.max(0, logEnd - duration) + 5;
  for (let k = Math.round(-5 / STEP); k <= Math.round(maxLag / STEP); k++) {
    const slice = [];
    for (let i = 0; i < vSpeed.length; i++) { const j = i + k; slice.push(j >= 0 && j < lSpeed.length ? lSpeed[j] : NaN); }
    const c = ncc(vSpeed, slice);
    if (c > best) { best = c; lag = k * STEP; }
  }
  console.log("  time: log = video + " + lag.toFixed(2) + "s (speed correlation " + best.toFixed(2) + ")");
  if (best < 0.5) console.log("  WARNING: the speed curves hardly agree — check that the log and the recording are the same session");
}

/* ── Space: a robust fit, then the offset refined on position ───────────── */
/**
 * Only moments when the real pointer was MOVING say anything about the time
 * offset: a pointer sitting still is in the same place at every offset, and
 * with a demo mostly made of rests, a fit over all moments picks whichever
 * offset it likes. They say everything about the space mapping, though, so the
 * fit uses all moments and the offset is judged on the moving ones.
 */
const movingAt = (t) => {
  const a = posOf(t - 0.05);
  const b = posOf(t + 0.05);
  return a && b && Math.hypot(b.x - a.x, b.y - a.y) / 0.1 > 150;
};
const fitAt = (L) => {
  let pairs = [];
  for (let t = 0; t <= duration; t += STEP) {
    const d = drawn(t);
    const r = posOf(t + L);
    if (d && r) pairs.push({ sx: r.x, sy: r.y, vx: d.x, vy: d.y, moving: movingAt(t + L) });
  }
  if (pairs.length < 30) return null;
  const all = pairs.slice();
  let fit = null;
  for (let round = 0; round < 4; round++) {
    const line = (k) => {
      const n = pairs.length;
      let a = 0, b = 0, aa = 0, ab = 0;
      for (const p of pairs) { const s = k === "x" ? p.sx : p.sy; const v = k === "x" ? p.vx : p.vy; a += s; b += v; aa += s * s; ab += s * v; }
      const slope = (ab - (a * b) / n) / Math.max(1e-9, aa - (a * a) / n);
      return { slope, cut: (b - slope * a) / n };
    };
    const fx = line("x");
    const fy = line("y");
    fit = { ax: fx.slope, bx: fx.cut, ay: fy.slope, by: fy.cut };
    const errs = pairs.map((p) => Math.hypot(fit.ax * p.sx + fit.bx - p.vx, fit.ay * p.sy + fit.by - p.vy)).sort((a, b) => a - b);
    const keep = errs[Math.floor(errs.length * 0.7)];
    pairs = pairs.filter((p) => Math.hypot(fit.ax * p.sx + fit.bx - p.vx, fit.ay * p.sy + fit.by - p.vy) <= Math.max(keep, 6));
  }
  const err = (p) => Math.hypot(fit.ax * p.sx + fit.bx - p.vx, fit.ay * p.sy + fit.by - p.vy);
  const errs = pairs.map(err).sort((a, b) => a - b);
  // The offset's score: the mean error while moving, the worst fifth left out
  // (those are the drawn path being wrong, which is not the offset's fault).
  // Judged on EVERY moving moment: the trimming above drops exactly the ones
  // a wrong offset gets wrong, and a score over what is left favours any offset.
  const mv = all.filter((p) => p.moving).map(err).sort((a, b) => a - b);
  const kept = mv.slice(0, Math.max(1, Math.floor(mv.length * 0.8)));
  const moving = kept.length ? kept.reduce((a, b) => a + b, 0) / kept.length : Infinity;
  return { ...fit, median: errs[errs.length >> 1], moving, n: pairs.length };
};
let map = fitAt(lag);
for (let d = -0.3; d <= 0.3 + 1e-9; d += 0.01) {
  const f = fitAt(lag + d);
  if (f && (!map || f.moving < map.moving)) { map = { ...f }; map.lag = lag + d; }
}
if (map && map.lag != null) lag = map.lag;
if (!map) { console.log("  Could not line the log up with the recording."); process.exit(1); }
console.log("  space: x = " + map.ax.toFixed(4) + "·sx + " + map.bx.toFixed(1) + ", y = " + map.ay.toFixed(4) + "·sy + " + map.by.toFixed(1) +
  "  (median residual " + map.median.toFixed(1) + "px, " + map.moving.toFixed(1) + "px while moving, over " + map.n + " samples; lag refined to " + lag.toFixed(2) + "s)");
const toVideo = (p) => ({ x: map.ax * p.x + map.bx, y: map.ay * p.y + map.by });

/* ── The creator's real presses, in video time and pixels ────────────────── */
const presses = [];
{
  const downs = log.filter((l) => l.e === "down");
  for (const d of downs) {
    const up = log.find((l) => l.e === "up" && l.b === d.b && l.t >= d.t);
    const t = d.t - lag;
    const at = toVideo(d);
    const inside = t >= 0 && t <= duration && at.x >= -4 && at.y >= -4 && at.x <= W + 4 && at.y <= H + 4;
    const drag = up && (Math.hypot(up.x - d.x, up.y - d.y) > DRAG_PX || up.t - d.t > DRAG_S);
    presses.push({ t, x: at.x, y: at.y, b: d.b, inside, drag: !!drag, held: up ? up.t - d.t : null });
  }
  // A second left press on the same spot within half a second is the other
  // half of a double click, not a press of its own.
  for (let i = 1; i < presses.length; i++) {
    const a = presses[i - 1];
    const b = presses[i];
    if (a.b === "left" && b.b === "left" && b.t - a.t <= DOUBLE_S && Math.hypot(b.x - a.x, b.y - a.y) <= DOUBLE_PX) { a.double = true; b.second = true; }
  }
}
const counted = presses.filter((p) => p.inside && p.b === "left" && !p.drag && !p.second);
const optional = presses.filter((p) => p.inside && !counted.includes(p) && !p.second);
const outside = presses.filter((p) => !p.inside);

/* ── Scored the way truth.mjs scores a labelled recording ───────────────── */
const events = (tl.events || []).filter((e) => e.type === "click" || e.type === "dblclick");
const zooms = tl.zooms || [];
let hits = 0;
const timing = [];
const where = [];
/** Why each miss and each false move happened: the rule, by its basis. */
const missedBy = {};
const falseBy = {};
const rows = [];
console.log("\nPRESSES THE CREATOR MADE (" + counted.length + " counted" + (optional.length ? ", " + optional.length + " not counted: drags / right or middle button" : "") +
  (outside.length ? ", " + outside.length + " outside the recording" : "") + ")");
for (const c of counted) {
  const near = events.map((e) => ({ e, dt: e.t - c.t, d: Math.hypot(e.x * W - c.x, e.y * H - c.y) }))
    .filter((m) => Math.abs(m.dt) <= T_SLACK && m.d <= PX_SLACK).sort((a, b) => Math.abs(a.dt) - Math.abs(b.dt));
  const hit = near.find((m) => m.e.zoomable);
  const zoomed = zooms.some((z) => z.start <= c.t + 0.3 && z.end >= c.t - 0.3);
  const ok = hit && zoomed;
  if (ok) { hits++; timing.push(hit.dt); where.push(hit.d); }
  const reason = ok ? null : hit ? "zoom-misses-moment" : near.length ? near[0].e.basis || "refused" : "no-candidate";
  if (reason) missedBy[reason] = (missedBy[reason] || 0) + 1;
  rows.push({ t: +c.t.toFixed(2), x: Math.round(c.x), y: Math.round(c.y), hit: !!ok, reason,
    press: (hit || near[0]) ? { t: (hit || near[0]).e.t, dt: +((hit || near[0]).dt).toFixed(2), px: Math.round((hit || near[0]).d), basis: (hit || near[0]).e.basis, signals: (hit || near[0]).e.signals || null } : null });
  const at = c.t.toFixed(2).padStart(6) + "s at " + c.x.toFixed(0).padStart(4) + "," + c.y.toFixed(0).padStart(4) + (c.double ? " (double)" : "");
  console.log("  " + (ok ? "HIT   " : "MISS  ") + at + "  " +
    (ok ? "press " + hit.e.t.toFixed(2) + "s (" + (hit.dt >= 0 ? "+" : "") + hit.dt.toFixed(2) + "s), " + hit.d.toFixed(0) + "px, basis " + hit.e.basis
      : hit ? "press accepted at " + hit.e.t.toFixed(2) + "s, but no camera move covers the moment itself"
      : near.length ? "found at " + near[0].e.t.toFixed(2) + "s but refused: " + near[0].e.basis + " — " + (near[0].e.why || "")
        : "no press within " + T_SLACK + "s and " + PX_SLACK + "px"));
}
let falses = 0;
console.log("\nCAMERA MOVES");
for (const z of zooms) {
  const earned = [...counted, ...optional].some((c) => z.start <= c.t + 0.3 && z.end >= c.t - 0.3);
  if (!earned) {
    falses++;
    const by = events.find((e) => e.zoomable && e.t >= z.start - 0.1 && e.t <= z.end + 0.1);
    const k = by ? by.basis || "?" : "planned";
    falseBy[k] = (falseBy[k] || 0) + 1;
  }
  console.log("  " + (earned ? "ok    " : "FALSE ") + z.start.toFixed(2) + "-" + z.end.toFixed(2) + "s");
}

/* ── The drawn pointer against the real one ──────────────────────────────── */
const errs = [];
let wrong = 0;
let watched = 0;
for (let t = 0; t <= duration; t += STEP) {
  const r = posOf(t + lag);
  if (!r) continue;
  const real = toVideo(r);
  if (real.x < 0 || real.y < 0 || real.x > W || real.y > H) continue;
  watched += STEP;
  const d = drawn(t);
  if (!d) continue;
  const e = Math.hypot(d.x - real.x, d.y - real.y);
  errs.push(e);
  if (e > WRONG_PX) wrong += STEP;
}
errs.sort((a, b) => a - b);
const pct = (p) => (errs.length ? errs[Math.min(errs.length - 1, Math.floor(p * errs.length))].toFixed(1) : "-");
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };

console.log("\nSUMMARY");
console.log("  presses: " + hits + " of " + counted.length + " got the camera (recall " + (counted.length ? ((100 * hits) / counted.length).toFixed(0) : "-") + "%)");
console.log("  camera moves on nothing: " + falses + " of " + zooms.length);
if (timing.length) console.log("  press timing: median " + med(timing).toFixed(2) + "s off, position median " + med(where).toFixed(0) + "px off");
console.log("  drawn pointer vs real: p50 " + pct(0.5) + "px, p95 " + pct(0.95) + "px, drawn >" + WRONG_PX + "px away for " + wrong.toFixed(1) + "s of " + watched.toFixed(1) + "s in view");

if (Object.keys(missedBy).length) console.log("  misses by reason: " + Object.entries(missedBy).map(([k, v]) => k + " " + v).join(", "));
if (Object.keys(falseBy).length) console.log("  false moves by the press behind them: " + Object.entries(falseBy).map(([k, v]) => k + " " + v).join(", "));

/**
 * The numbers, kept per recording, so qa/report.mjs can add up a whole corpus.
 * Beside the footage in fixtures/, which is never committed.
 */
{
  const dir = path.join(path.dirname(video), "qa-results");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, path.basename(video).replace(/\.[^.]+$/, "") + ".json");
  fs.writeFileSync(out, JSON.stringify({
    recording: path.basename(video), scored_at: new Date().toISOString(), duration,
    alignment: { lag_s: +lag.toFixed(3), median_px: +map.median.toFixed(1) },
    presses: counted.length, hits, false_moves: falses, zooms: zooms.length,
    missed_by: missedBy, false_by: falseBy,
    timing_median_s: timing.length ? +med(timing).toFixed(3) : null, position_median_px: where.length ? +med(where).toFixed(1) : null,
    pointer: { p50_px: errs.length ? +errs[Math.floor(0.5 * errs.length)].toFixed(1) : null, p95_px: errs.length ? +errs[Math.min(errs.length - 1, Math.floor(0.95 * errs.length))].toFixed(1) : null, wrong_s: +wrong.toFixed(2), in_view_s: +watched.toFixed(2) },
    rows,
  }, null, 2) + "\n");
  console.log("  results: " + path.relative(process.cwd(), out));
}

/* ── And into the corpus ─────────────────────────────────────────────────── */
const name = flag("truth");
if (name) {
  const file = path.join(TRUTH, name + ".json");
  const truth = {
    about: "Scored from a mouse log (qa/mouselog.ps1): every press here is a real one, timed and placed by the log.",
    recording: path.basename(video),
    env: flag("env") || "windows:1920x1080",
    source_log: path.basename(logFile),
    logged_at: head.start_utc || null,
    alignment: { lag_s: +lag.toFixed(3), ax: +map.ax.toFixed(5), bx: +map.bx.toFixed(2), ay: +map.ay.toFixed(5), by: +map.by.toFixed(2), median_px: +map.median.toFixed(1) },
    clicks: counted.map((c, i) => ({ label: "press " + (i + 1) + (c.double ? " (double)" : ""), t: +c.t.toFixed(2), x: Math.round(c.x), y: Math.round(c.y) })),
    optional: optional.map((c) => ({ label: c.drag ? "drag" : c.b + " button", t: +c.t.toFixed(2), x: Math.round(c.x), y: Math.round(c.y) })),
    strangers: [],
    stranger_budget_s: 0,
  };
  fs.writeFileSync(file, JSON.stringify(truth, null, 2) + "\n");
  console.log("\n  wrote " + path.relative(process.cwd(), file) + " — put the recording in fixtures/ as " + path.basename(video));
}
console.log("");
process.exit(0);

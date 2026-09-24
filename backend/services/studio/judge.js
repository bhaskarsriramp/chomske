/**
 * judge.js — was each candidate press a click? Asked of the model WITH
 * everything the pixels measured.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * Two ways of deciding have each failed on real recordings. The weighted rules
 * in events.js confirmClicks refused a toggle ("nothing came of it") and a
 * navigation ("the page was scrolling") on cap.so; the arbiter (audit.js),
 * asked from a strip of stills alone, called three auto-rotating tab changes
 * presses there and missed both real ones. The rules know timing, position and
 * movement and not meaning; the model knows meaning and, from stills, not
 * timing.
 *
 * So the model is handed the measurement: when the pointer arrived and left,
 * whether it was the creator's, its shape, whether the page scrolled, what
 * changed on screen and when, whether the spot stayed changed after the
 * pointer left, a moving picture there, a click flash — plus frames across the
 * moment and close-ups of the spot before and after. See prompts.js
 * PRESS_JUDGE.
 *
 * ── MODES ───────────────────────────────────────────────────────────────────
 * STUDIO_PRESS_JUDGE=off     (default) not asked
 *                  =shadow   asked, recorded on each press as `judged`, and
 *                            the camera still follows the rules — for
 *                            measuring it against the labelled recordings
 *                            (scripts/pointerTest/judge.mjs)
 *                  =decide   a confident verdict decides the press
 */
import path from "path";
import fsp from "fs/promises";
import { extractFrameAt } from "../media/ffmpeg.js";
import { judgePress, newSpend } from "./vision.js";
import { measureStay } from "./locate.js";
import { inMedia } from "./sync.js";

export const PRESS_JUDGE_MODE = String(process.env.STUDIO_PRESS_JUDGE || "off").trim().toLowerCase();
/**
 * Every verdict given in this process, in order, for the scoring harness
 * (scripts/pointerTest/judge.mjs): the timeline's own cleanup does not carry
 * `judged` through, and a measurement tool should not widen the document.
 */
export const VERDICTS = [];
/** How sure the model must be before its verdict decides, in decide mode. */
const JUDGE_SURE = 0.7;
/** Thinking tokens the model may spend per press. */
const JUDGE_THINK = Math.max(0, parseInt(process.env.STUDIO_PRESS_JUDGE_THINK || "2048", 10) || 0);

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const pct = (v) => Math.round(num(v) * 100) + "%";
const sec = (v) => (v >= 0 ? "+" : "") + num(v).toFixed(2) + "s";

const SHAPE_WORDS = {
  pointer: "a hand (the system draws a hand only over things that can be clicked)",
  hand: "a hand (the system draws a hand only over things that can be clicked)",
  default: "an arrow",
  text: "a text caret",
};

/** What the measurement says about one press, as the lines PRESS_JUDGE reads. */
function factsFor(e, stay, { located, flashes, screen, W, H }) {
  const t = num(e.t);
  const x = num(e.x) * W;
  const y = num(e.y) * H;
  const lines = [];
  lines.push(`- The moment is ${t.toFixed(2)}s into the recording. The marked spot is ${pct(e.x)} across and ${pct(e.y)} down the frame.`);

  const L = (located || []).filter((p) => p.located && !p.held);
  const here = L.filter((p) => Math.abs(p.t - t) <= 0.15 && Math.hypot(p.x * W - x, p.y * H - y) <= 30);
  if (!here.length) {
    const age = num(e.position_age, NaN);
    lines.push(
      "- The pointer was NOT seen at this moment" +
        (Number.isFinite(age) ? `; it was last seen ${age.toFixed(2)}s earlier, so the spot is where it was last seen, not where it is.` : ".")
    );
  } else {
    lines.push(
      here.some((p) => p.proven)
        ? "- The pointer here is the recording computer's own pointer (checked: it was followed from where that pointer was)."
        : "- The pointer here could not be checked as the recording computer's own: it appeared here without being followed from where that pointer last was."
    );
  }

  if (stay && stay.arrived != null) {
    lines.push(
      `- Movement: the pointer arrived at the spot ${(t - stay.arrived).toFixed(2)}s before the moment, stayed still there until ${(stay.left - t).toFixed(2)}s after it, then left.`
    );
    const during = L.filter((p) => p.t >= stay.arrived - 0.05 && p.t <= stay.left + 0.05 && Math.hypot(p.x * W - x, p.y * H - y) <= 30);
    const counts = {};
    for (const p of during) counts[p.shape || "default"] = (counts[p.shape || "default"] || 0) + 1;
    const shapes = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k]) => SHAPE_WORDS[k] || k);
    if (shapes.length) lines.push("- Its shape while it rested there: " + shapes.slice(0, 2).join(", then ") + ".");
  } else {
    lines.push("- Movement: the pointer was not seen resting at this spot for any length of time.");
  }

  const scroll = (screen?.scroll || []).filter((s) => s.t >= t - 1 && s.t <= t + 1.5 && Math.abs(num(s.dy)) >= 1 / 270);
  if (scroll.length >= 2) {
    const total = scroll.reduce((a, s) => a + Math.abs(num(s.dy)), 0);
    lines.push(`- Scrolling, measured on the video: the page scrolled between ${sec(scroll[0].t - t)} and ${sec(scroll[scroll.length - 1].t - t)}, by about ${pct(total)} of the screen's height in all.`);
  } else {
    lines.push("- Scrolling, measured on the video: the page did not scroll between -1.0s and +1.5s.");
  }

  const motion = (screen?.motion || []).filter((m) => m.t >= t - 0.5 && m.t <= t + 1.5);
  const biggest = motion.reduce((b, m) => (!b || m.cover > b.cover ? m : b), null);
  const before = (screen?.motion || []).filter((m) => m.t >= t - 1.5 && m.t < t - 0.2);
  const usual = before.length ? before.reduce((a, m) => a + num(m.cover), 0) / before.length : 0;
  if (!biggest || biggest.cover < 0.01) {
    lines.push("- Screen changes: nothing changed anywhere on the screen by more than 1% between -0.5s and +1.5s.");
  } else {
    lines.push(
      `- Screen changes: the largest between -0.5s and +1.5s covered ${pct(biggest.cover)} of the screen at ${sec(biggest.t - t)}, ` +
        `in a region ${pct(biggest.w)} wide and ${pct(biggest.h)} tall starting ${pct(biggest.x)} across and ${pct(biggest.y)} down. ` +
        `In the second before the moment the screen was changing by about ${pct(usual)} per frame.`
    );
  }

  if (stay && stay.share != null) {
    lines.push(
      `- The marked area just before the pointer arrived (${stay.before.toFixed(2)}s) against just after it left (${stay.after.toFixed(2)}s)` +
        (stay.shift ? `, with the page's ${Math.abs(stay.shift)}px scroll taken out` : "") +
        `: ${pct(stay.share)} of it is different` + (stay.share >= 0.08 ? " — it stayed changed." : " — it looks as it did before.")
    );
  } else {
    lines.push("- The marked area could not be compared before the pointer arrived and after it left" + (stay?.reason ? ` (${stay.reason})` : "") + ".");
  }

  let playing = false;
  for (let q = t - 1; q <= t + 1 && !playing; q += 0.25) playing = inMedia(screen, q, num(e.x), num(e.y));
  lines.push(playing ? "- A moving picture (a video or an animation) was playing at the spot around this moment." : "- No moving picture was playing at the spot.");

  const flash = (flashes || []).find((f) => Math.abs(num(f.t) - t) <= 0.45 && Math.hypot(num(f.x) * W - x, num(f.y) * H - y) <= 40);
  lines.push(flash ? `- A brief flash right at the pointer (a control acknowledging a press) at ${sec(flash.t - t)}.` : "- No brief flash was seen at the pointer.");
  if (e.control) lines.push(`- An earlier reading named the control under the pointer: "${e.control}".`);
  return lines.join("\n");
}

/** The frames shown, each labelled with when it is relative to the moment. */
async function framesFor(e, stay, { video, dir, W, H, duration }) {
  const t = num(e.t);
  const x = num(e.x) * W;
  const y = num(e.y) * H;
  const scale = W / 1920;
  const mark = { x: x - 80 * scale, y: y - 20 * scale, w: 160 * scale, h: 80 * scale, t: 3 };
  const end = Math.max(0, duration - 0.05);
  const clampT = (v) => Math.min(end, Math.max(0, v));
  const arrive = stay?.arrived != null ? stay.arrived - 0.3 : t - 1.0;
  const leave = stay?.left != null && stay.left + 0.35 > t + 1.6 ? stay.left + 0.35 : t + 2.4;
  const wanted = [
    [arrive, stay?.arrived != null ? "before the pointer arrived" : "a second before"],
    [t - 0.2, "just before the moment"],
    [t + 0.15, "just after the moment"],
    [t + 0.6, ""],
    [t + 1.4, ""],
    [leave, stay?.left != null ? "after the pointer left" : ""],
  ].map(([at, what]) => [clampT(at), what]).sort((a, b) => a[0] - b[0]);
  const images = [];
  let last = -1;
  const tag = String(Math.round(t * 1000));
  for (const [at, what] of wanted) {
    if (at - last < 0.1) continue;
    last = at;
    const file = path.join(dir, `judge_${tag}_${Math.round(at * 1000)}.jpg`);
    try {
      await extractFrameAt(video, file, at, { longEdge: 1280, mark });
      if (!(await fsp.stat(file)).size) continue;
      images.push({ file, label: `${sec(at - t)}${what ? " (" + what + ")" : ""}, the whole frame` });
    } catch { /* one missing frame is not a reason to lose the question */ }
  }
  const crop = { x: Math.max(0, x - 240 * scale), y: Math.max(0, y - 135 * scale), w: Math.min(W, 480 * scale), h: Math.min(H, 270 * scale) };
  crop.x = Math.min(crop.x, W - crop.w);
  crop.y = Math.min(crop.y, H - crop.h);
  for (const [at, what] of [[clampT(arrive), "before the pointer arrived"], [clampT(leave), "after the pointer left"]]) {
    const file = path.join(dir, `judge_${tag}_close_${Math.round(at * 1000)}.jpg`);
    try {
      await extractFrameAt(video, file, at, { longEdge: 1280, mark, crop });
      if (!(await fsp.stat(file)).size) continue;
      images.push({ file, label: `${sec(at - t)}, a close-up of the marked area ${what}` });
    } catch { /* as above */ }
  }
  return images;
}

/**
 * Every candidate press, judged. Returns the events with `judged` on each
 * press that got an answer; in decide mode a confident answer also sets
 * `zoomable`.
 */
export async function judgePresses(events, { video, workDir, located = [], flashes = [], screen = null, W, H, duration = 0, spend = newSpend(), mode = PRESS_JUDGE_MODE } = {}) {
  if (mode !== "shadow" && mode !== "decide") return events;
  const dir = path.join(workDir, "judge");
  await fsp.mkdir(dir, { recursive: true });
  const out = [];
  for (const e of events || []) {
    if (e.type !== "click" && e.type !== "dblclick") { out.push(e); continue; }
    const stay = await measureStay(video, e, { located, screen, W, H, duration }).catch(() => null);
    const facts = factsFor(e, stay, { located, flashes, screen, W, H });
    const images = await framesFor(e, stay, { video, dir, W, H, duration });
    const verdict = images.length ? await judgePress({ images, facts, spend, label: "judgePress at " + num(e.t).toFixed(2) + "s", thinkingBudget: JUDGE_THINK }) : null;
    if (!verdict) { out.push(e); continue; }
    console.log(
      "[studio] judge " + num(e.t).toFixed(2) + "s: " + verdict.clicked + " (" + verdict.confidence.toFixed(2) + ")" +
        (verdict.target ? " " + verdict.target : "") + " — " + verdict.evidence + "   [rules: " + (e.zoomable ? "zoom" : "no zoom") + "]"
    );
    VERDICTS.push({ t: num(e.t), x: num(e.x), y: num(e.y), rules: !!e.zoomable, ...verdict, facts });
    let next = { ...e, judged: { ...verdict, facts } };
    if (mode === "decide" && verdict.confidence >= JUDGE_SURE && verdict.clicked !== "unsure") {
      const zoomable = verdict.clicked === "yes";
      next = { ...next, zoomable, basis: zoomable ? "judged" : "judged-no", why: "the model, from the measurement: " + verdict.evidence };
    }
    out.push(next);
  }
  return out;
}

export default { judgePresses, PRESS_JUDGE_MODE };

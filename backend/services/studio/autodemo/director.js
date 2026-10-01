/**
 * autodemo/director.js: the recording plus the creator's description, turned
 * into a timed voiceover script and the moments the camera should ease in on.
 *
 * ── WHAT IT READS ────────────────────────────────────────────────────────────
 *   the recording    as video when it is small enough to send whole (the same
 *                    way witness.js sends it), otherwise as stills
 *   the click log    the analysis's own events and zooms, measured from the
 *                    pixels: read here, never changed
 *   the description  what the creator typed after recording
 *   their own words  the microphone track transcribed, when they spoke
 *
 * ── WHAT IT RETURNS ──────────────────────────────────────────────────────────
 * Script lines in recording time that run end to end (each until the next
 * starts) and are sized to be spoken in their window; and focus zooms placed
 * where nothing was clicked but something deserves a closer look. Nothing here
 * writes to a demo; the job (autodemo/job.js) decides what to do with it.
 */
import path from "path";
import fsp from "fs/promises";
import { generateJson, MODEL } from "../../ai/provider.js";
import { makeWatchCopy, extractFrames, extractFrameAt } from "../../media/ffmpeg.js";
import { newId } from "../timeline.js";
import { findOnFrame } from "../command.js";
import { containingBox } from "../events.js";
import { zoomOutGap } from "../../../../src/components/Studio/camera.mjs";
import { DIRECTOR, DIRECTOR_SCHEMA, FIT, WORDS_PER_SECOND, COVERAGE } from "./prompts.js";

/** Frames a second the model samples from the watch copy. Clicks come from the log, so the flow is what it needs. */
const WATCH_FPS = 2;
const WATCH_EDGE = 1024;
/** Largest watch copy sent inline (witness.js uses the same ceiling). STUDIO_AUTODEMO_INLINE_MB overrides it, for tests. */
const MAX_INLINE_BYTES = (Number(process.env.STUDIO_AUTODEMO_INLINE_MB) > 0 ? Number(process.env.STUDIO_AUTODEMO_INLINE_MB) : 18) * 1024 * 1024;
/** Stills sent instead, when the video is too big. */
const MAX_STILLS = 48;
/** The breath left between two lines, seconds. */
const BREATH = 0.2;
/** A line shorter than this on screen is dropped. */
const MIN_LINE = 0.6;
/** How far before the model's own start a line may begin, into silence, when it needs the room. */
const LEAD_MAX = 1.5;
/** The first line starts no later than this when the model starts it within the opening seconds. */
const OPENING = 0.3;

/* Focus zooms: gentler than a click's (events.js LEVEL_MIN 1.4 … 1.8 on 1080p). */
const FOCUS_LEVEL_MIN = 1.3;
const FOCUS_LEVEL_MAX = 1.65;
const FOCUS_MIN_LEN = 1.8;
const FOCUS_MAX_LEN = 4.5;
/** Clear of any click by this much: the click's own zoom and the screen it changes own that moment. */
const CLICK_CLEAR = 1.0;
/** After a scroll, the page is given this long to come to rest. */
const SCROLL_SETTLE = 0.7;
/** A box this large is most of the screen: easing in on it shows nothing new. */
const FOCUS_MAX_AREA = 0.4;
/**
 * A measured screen change this big (share of the frame, audit.js
 * changeMoments → analysis.changes) is the page moving: a page that settles
 * after a navigation scrolls with no scroll event at all. Seen on a real
 * recording: a zoom on a pricing card placed at 34.0s, the page moved at
 * 34.58s (0.29 of the frame), and the card's title slid out of the shot.
 */
const MOVE_COVER = 0.12;
const MOVE_SETTLE = 0.5;
/** Something moving this soon after the zoom would start is waited out rather than cut short. */
const LOOKAHEAD = 1.0;
/** Waited out this long and still moving: the moment has passed with the narration. */
const MAX_DELAY = 3.0;

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round2 = (v) => Math.round(num(v) * 100) / 100;
const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;
const clean = (s, max) => String(s || "").replace(/\s+/g, " ").trim().slice(0, max);

/** The model call every pass makes. Exported so a test's stand-in answers all of them. */
export const ask = (opts) => generateJson(opts);

/**
 * One model call that survives a refused schema, like vision.js ask(): the
 * limits a schema must fit are the service's and unstated, so a 400 with a
 * schema attached is asked once more without it.
 */
async function askJson(opts, spend) {
  try {
    const res = await ask(opts);
    spend.usd += num(res.usd);
    spend.calls += 1;
    return res.json;
  } catch (err) {
    spend.usd += num(err?.usd);
    if (opts.schema && /\b400\b|INVALID_ARGUMENT/.test(String(err?.message || ""))) {
      console.warn(`[autodemo] ${opts.label}: the response schema was refused; asking without it`);
      return askJson({ ...opts, schema: null }, spend);
    }
    throw err;
  }
}

/* ── The recording, in a form the model can watch ──────────────────────────── */

async function recordingParts({ video, workDir, duration }) {
  const copy = path.join(workDir, "autodemo-watch.mp4");
  try {
    await makeWatchCopy(video, copy, { fps: WATCH_FPS, longEdge: WATCH_EDGE, duration });
    const bytes = await fsp.readFile(copy);
    if (bytes.length <= MAX_INLINE_BYTES) {
      return {
        seen: "video",
        model: MODEL.video,
        parts: [{ inlineData: { mimeType: "video/mp4", data: bytes.toString("base64") }, videoMetadata: { fps: WATCH_FPS } }],
      };
    }
    console.log(`[autodemo] watch copy is ${(bytes.length / 1e6).toFixed(1)}MB; sending stills instead`);
  } catch (err) {
    console.warn(`[autodemo] could not make a watch copy (${err.message}); sending stills instead`);
  }

  const dir = path.join(workDir, "autodemo-stills");
  await fsp.mkdir(dir, { recursive: true });
  const every = Math.max(1.5, duration / MAX_STILLS);
  const frames = (await extractFrames(video, dir, { every, duration, longEdge: 960 })).slice(0, MAX_STILLS + 2);
  const parts = [];
  for (const f of frames) {
    parts.push({ text: `Frame at ${f.t.toFixed(1)}s:` });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: (await fsp.readFile(f.file)).toString("base64") } });
  }
  return { seen: "stills", model: MODEL.vision, parts };
}

/* ── What the analysis already measured ────────────────────────────────────── */

const PRESSES = new Set(["click", "dblclick", "rightclick"]);
/** Presses the analysis believed (a press it decided was not one is never narrated or zoomed around). */
const pressesOf = (timeline) => (timeline.events || []).filter((e) => PRESSES.has(e.type) && e.zoomable !== false);

/**
 * The clicks, typing and camera moves the analysis found, as lines of text.
 * Read only: the camera is the analysis's, and this module never changes it.
 */
export function clickLog(timeline = {}) {
  const out = [];
  let lastScroll = -10;
  for (const e of timeline.events || []) {
    const t = num(e.t);
    if (PRESSES.has(e.type)) {
      if (e.zoomable === false) continue;
      const what = clean(e.control, 60);
      out.push(`${t.toFixed(2)}s  ${e.type === "dblclick" ? "double-click" : e.type === "rightclick" ? "right-click" : "click"}${what ? ` on "${what}"` : ""}`);
    } else if (e.type === "type") {
      const typed = clean(e.text, 60);
      out.push(`${t.toFixed(2)}s  typing${typed ? ` "${typed}"` : ""}`);
    } else if (e.type === "scroll") {
      if (t - lastScroll > 2) out.push(`${t.toFixed(2)}s  scrolling`);
      lastScroll = t;
    }
  }
  for (const z of timeline.zooms || []) {
    const label = clean(z.label, 60);
    out.push(`${num(z.start).toFixed(2)}–${num(z.end).toFixed(2)}s  the camera zooms in${label ? ` on "${label}"` : ""}`);
  }
  return out
    .sort((a, b) => parseFloat(a) - parseFloat(b))
    .slice(0, 160)
    .join("\n");
}

/* ── The script, made safe to use ──────────────────────────────────────────── */

/**
 * Lines in order, inside the recording, never overlapping, and running end to
 * end: each line's window is from its start to the next line's (less a
 * breath), so the captions stay up while it is spoken and the voice has the
 * whole stretch. Overlapping lines meet halfway. A line too short for its
 * words may start up to LEAD_MAX earlier, into silence. The opening line is
 * pulled to the first moment if the model started it within a few seconds.
 */
export function cleanLines(raw, duration) {
  const lines = (Array.isArray(raw) ? raw : [])
    .map((l) => ({
      start: clamp(num(l?.start), 0, duration),
      end: clamp(num(l?.end), 0, duration),
      text: clean(l?.text, 400),
    }))
    .filter((l) => l.text && l.end > l.start)
    .sort((a, b) => a.start - b.start)
    .slice(0, 80);

  const out = [];
  for (const l of lines) {
    const prev = out[out.length - 1];
    if (prev && l.start < prev.end + BREATH) {
      const meet = Math.max(prev.start + MIN_LINE + BREATH / 2, (prev.end + l.start) / 2);
      prev.end = meet - BREATH / 2;
      l.start = Math.max(l.start, meet + BREATH / 2);
    }
    if (l.end - l.start > 0.05) out.push(l);
  }
  if (out[0] && out[0].start > OPENING && out[0].start < 4) out[0].start = OPENING;

  // Too short for its words even running to the next line: begin a little
  // earlier, into the silence the model left before it. Done BEFORE the lines
  // are stretched, while that silence is still there to take.
  for (let i = 0; i < out.length; i++) {
    const l = out[i];
    const next = out[i + 1];
    const reach = next ? next.start - BREATH : duration;
    const needed = words(l.text) / WORDS_PER_SECOND + 0.3;
    if (reach - l.start >= needed) continue;
    const prev = out[i - 1];
    const earlier = Math.max(prev ? prev.end + BREATH : 0, l.start - LEAD_MAX);
    l.start = Math.min(l.start, Math.max(earlier, reach - needed));
  }

  // Each line holds until the next one starts; the last until the end.
  for (let i = 0; i < out.length; i++) {
    const next = out[i + 1];
    out[i].end = Math.max(out[i].end, next ? next.start - BREATH : duration);
  }

  return out
    .filter((l) => l.end - l.start >= MIN_LINE)
    .map((l) => ({ id: newId("v"), start: round2(l.start), end: round2(l.end), text: l.text }));
}

export function cleanSteps(raw, duration) {
  return (Array.isArray(raw) ? raw : [])
    .map((s) => ({
      start: round2(clamp(num(s?.start), 0, duration)),
      end: round2(clamp(num(s?.end), 0, duration)),
      title: clean(s?.title, 80),
      detail: clean(s?.detail, 300),
      matters: ["high", "medium", "low"].includes(s?.matters) ? s.matters : "medium",
    }))
    .filter((s) => s.title && s.end > s.start)
    .sort((a, b) => a.start - b.start)
    .slice(0, 20);
}

/** The words a line should carry: its window at the voice's pace, a little under so it is never rushed. */
export const targetOf = (l) => Math.max(4, Math.round((l.end - l.start) * WORDS_PER_SECOND * COVERAGE));

/**
 * Words the prompt already forbids, caught when they slip through anyway (one
 * did on the first real run: "monetize seamlessly"). Inside quotes is an
 * on-screen label being read out, and stays.
 */
const HYPE = /\b(seamless(ly)?|powerful|robust|cutting[- ]edge|revolutionar(y|ily)|game[- ]chang(er|ing)|effortless(ly)?|supercharg(e|es|ed|ing)|world[- ]class|best[- ]in[- ]class)\b/i;
export function hypeOf(text) {
  const m = String(text || "").replace(/"[^"]*"|“[^”]*”/g, "").match(HYPE);
  return m ? m[0] : "";
}

/** Before anything is spoken: lines too long or too short for their window by the word count, or with a hype word. */
export function misfits(lines) {
  return lines
    .map((l, i) => {
      const have = words(l.text);
      const want = targetOf(l);
      const hype = hypeOf(l.text);
      if (hype) return { i, have, want, why: `remove "${hype}"` };
      if (have > want + 2) return { i, have, want, why: "too long" };
      if (l.end - l.start >= 2 && have < want * 0.85 && want - have >= 3) return { i, have, want, why: "too short" };
      return null;
    })
    .filter(Boolean);
}

/**
 * After the voice has spoken: the same question answered with the voice's own
 * pace for each line, which varies more than any word count can predict (one
 * real take ran at 2.1 words a second, another at 3.5). A line that leaves
 * more than a second of silence before the next is lengthened; one that needs
 * speeding up past what sounds natural is shortened. `room` is from the line's
 * start to the next line's start, where the narrator places it.
 */
export function measuredMisfits(lines, takes, duration, { minGap = 1.0 } = {}) {
  return lines
    .map((l, i) => {
      const seconds = num(takes[i]?.seconds);
      if (!(seconds > 0.3)) return null;
      const have = words(l.text);
      const next = lines[i + 1];
      const room = (next ? next.start : duration) - l.start;
      const pace = have / seconds;
      const want = Math.round(clamp(pace * Math.max(0.6, room - 0.35), 3, 34));
      const hype = hypeOf(l.text);
      if (hype) return { i, have, want, why: `remove "${hype}"` };
      if (room - seconds > minGap && want - have >= 2) return { i, have, want, why: "too short" };
      if (seconds > room * 1.12 && have - want >= 2) return { i, have, want, why: "too long" };
      return null;
    })
    .filter(Boolean);
}

/**
 * The marked lines rewritten, once, with the recording in view so a longer
 * line gains a real on-screen detail. A rewrite is kept only if it moved
 * toward its target without overshooting badly (and, for a hype word, lost
 * it); anything else stays as it was, and the narrator's own fitting handles
 * the rest.
 */
async function fit(lines, marks, { rec, brief, steps, spend }) {
  if (!marks.length) return { lines, shortened: 0, lengthened: 0 };
  const byI = new Map(marks.map((m) => [m.i, m]));
  const script = lines
    .map((l, i) => {
      const m = byI.get(i);
      const tag = m ? `   <<< ${m.why}: rewrite to about ${m.want} words` : "";
      return `[${i}] ${l.start.toFixed(1)}–${l.end.toFixed(1)}s (${(l.end - l.start).toFixed(1)}s): ${l.text}${tag}`;
    })
    .join("\n");
  const text =
    `${FIT}\n\nCREATOR'S DESCRIPTION:\n"""\n${clean(brief, 1500)}\n"""\n\n` +
    (steps.length ? `WHAT IS ON SCREEN, BY STRETCH:\n${steps.map((s) => `${s.start.toFixed(1)}–${s.end.toFixed(1)}s ${s.title}: ${s.detail}`).join("\n")}\n\n` : "") +
    `SCRIPT:\n${script}`;
  let json = null;
  try {
    json = await askJson(
      { model: rec.model, label: "autodemo:fit", parts: [...rec.parts, { text }], maxOutputTokens: 4096, temperature: 0.3, thinkingBudget: 1024 },
      spend
    );
  } catch (err) {
    console.warn(`[autodemo] fitting failed (${err.message}); keeping the lines as written`);
    return { lines, shortened: 0, lengthened: 0 };
  }
  const next = lines.map((l) => ({ ...l }));
  let shortened = 0;
  let lengthened = 0;
  for (const r of Array.isArray(json?.lines) ? json.lines : []) {
    const i = Math.round(num(r?.i, -1));
    const m = byI.get(i);
    const t = clean(r?.text, 400);
    if (!m || !t) continue;
    const n = words(t);
    if (m.why.startsWith("remove")) {
      // The word gone, and no further from the length wanted than before.
      if (!hypeOf(t) && Math.abs(n - m.want) <= Math.abs(m.have - m.want) + 2) {
        next[i].text = t;
        if (n < m.have) shortened++;
        else lengthened++;
      } else {
        console.log(`[autodemo] fit: kept line ${i} (${m.why}, wanted ~${m.want} words, got ${n}${hypeOf(t) ? `, still "${hypeOf(t)}"` : ""})`);
      }
    } else if (m.have > m.want && n < m.have) {
      next[i].text = t;
      shortened++;
    } else if (m.have < m.want && n > m.have && n <= Math.ceil(m.want * 1.25) + 1) {
      next[i].text = t;
      lengthened++;
    } else {
      console.log(`[autodemo] fit: kept line ${i} (${m.why}, had ${m.have}, wanted ~${m.want}, got ${n})`);
    }
  }
  return { lines: next, shortened, lengthened };
}

/**
 * Lines refitted to how the voice actually spoke them (measuredMisfits), for
 * a second take of just those lines. `ctx` is what direct() returned.
 */
export async function refit(lines, takes, { rec, brief, steps, duration, minGap = 1.0 }) {
  const spend = { usd: 0, calls: 0 };
  const marks = measuredMisfits(lines, takes, duration, { minGap });
  if (!marks.length || !rec) return { lines, changed: 0, marks, spend };
  const done = await fit(lines, marks, { rec, brief, steps, spend });
  return { lines: done.lines, changed: done.shortened + done.lengthened, marks, spend };
}

/* ── Focus zooms ───────────────────────────────────────────────────────────── */

export function cleanFocus(raw, duration) {
  return (Array.isArray(raw) ? raw : [])
    .map((f) => ({
      start: round2(clamp(num(f?.start), 0, duration)),
      end: round2(clamp(num(f?.end), 0, duration)),
      what: clean(f?.what, 200),
      why: clean(f?.why, 200),
    }))
    .filter((f) => f.what && f.end > f.start)
    .sort((a, b) => a.start - b.start)
    .slice(0, 6);
}

/**
 * When a focus moment can hold, or null: on a still screen (after any scroll
 * has settled, ended before the next one), clear of every click by
 * CLICK_CLEAR, and beside every zoom already there with the camera's own gap
 * (camera.mjs zoomOutGap) — the same rule the chat's added zooms keep.
 */
export function focusWindow(f, { presses, scrolls, changes = [], zooms, duration }) {
  const moves = changes.filter((c) => num(c.cover) >= MOVE_COVER).map((c) => num(c.t));
  // Later until the screen is still: past every scroll by SCROLL_SETTLE, every
  // click by CLICK_CLEAR and every big screen change by MOVE_SETTLE — including
  // any due in the first LOOKAHEAD seconds — checked again after each move,
  // since moving past one can land right behind the next.
  let start = f.start;
  for (let k = 0; k < 16; k++) {
    const s = scrolls.filter((t) => t > start - SCROLL_SETTLE && t <= start + LOOKAHEAD).map((t) => t + SCROLL_SETTLE);
    const c = presses.filter((t) => t > start - CLICK_CLEAR && t <= start + LOOKAHEAD).map((t) => t + CLICK_CLEAR);
    const m = moves.filter((t) => t > start - MOVE_SETTLE && t <= start + LOOKAHEAD).map((t) => t + MOVE_SETTLE);
    if (!s.length && !c.length && !m.length) break;
    start = Math.max(start, ...s, ...c, ...m);
  }
  if (start - f.start > MAX_DELAY) return null;
  let end = clamp(f.end, start + FOCUS_MIN_LEN, start + FOCUS_MAX_LEN);
  const interrupt = [...presses.map((t) => t - CLICK_CLEAR), ...scrolls.map((t) => t - 0.2), ...moves.map((t) => t - 0.15)]
    .filter((t) => t > start)
    .sort((a, b) => a - b)[0];
  if (interrupt !== undefined) end = Math.min(end, interrupt);

  const shape = { easing: "smooth" };
  for (const z of [...zooms].sort((a, b) => a.start - b.start)) {
    if (z.end + zoomOutGap(z, shape) <= start || z.start - zoomOutGap(shape, z) >= end) continue;
    if (z.start >= start) end = Math.min(end, z.start - zoomOutGap(shape, z));
    else start = Math.max(start, z.end + zoomOutGap(z, shape));
  }
  end = Math.min(end, duration - 0.2);
  return end - start >= FOCUS_MIN_LEN ? { start: round2(start), end: round2(end) } : null;
}

/**
 * How far to ease in on a box: until it fills about FOCUS_FILL of the picture
 * with a little margin, between FOCUS_LEVEL_MIN and FOCUS_LEVEL_MAX — never
 * as far as a click's zoom. (0.62 was tried first: on the first real run both
 * zooms came out at 1.25x, which reads as no zoom at all.)
 */
const FOCUS_FILL = 0.8;
export function focusLevel(box) {
  const span = Math.max(num(box.w), num(box.h)) + 0.04;
  return Math.round(clamp(FOCUS_FILL / span, FOCUS_LEVEL_MIN, FOCUS_LEVEL_MAX) * 20) / 20;
}

/**
 * The focus moments, as zooms. Each is timed first (focusWindow), then found
 * on the frame it will hold (the chat's findOnFrame, so the box is read at
 * full size rather than guessed from the video), then framed with a margin.
 *
 * @returns {Promise<{ zooms: Array, skipped: Array<{ what, why }> }>}
 */
export async function placeFocus({ video, workDir, focus, timeline, duration, changes = [], spend }) {
  const presses = pressesOf(timeline).map((e) => num(e.t));
  const scrolls = (timeline.events || []).filter((e) => e.type === "scroll").map((e) => num(e.t));
  const zooms = [];
  const skipped = [];
  for (const [k, f] of focus.entries()) {
    const when = focusWindow(f, { presses, scrolls, changes, zooms: [...(timeline.zooms || []), ...zooms], duration });
    if (!when) {
      skipped.push({ what: f.what, why: "no still moment clear of the clicks, their zooms and the page moving" });
      continue;
    }
    const file = path.join(workDir, `focus-${k}.jpg`);
    let found = null;
    try {
      await extractFrameAt(video, file, when.start + 0.15, { longEdge: 1280 });
      const res = await findOnFrame(file, f.what, { ask });
      spend.usd += num(res.usd);
      spend.calls += 1;
      found = res.matches[0] || null;
    } catch (err) {
      skipped.push({ what: f.what, why: `could not look at the frame (${err.message})` });
      continue;
    }
    if (!found) {
      skipped.push({ what: f.what, why: "not found on the frame" });
      continue;
    }
    if (found.box.w * found.box.h > FOCUS_MAX_AREA) {
      skipped.push({ what: f.what, why: "it fills most of the screen already" });
      continue;
    }
    const level = focusLevel(found.box);
    const rect = containingBox([found.box], level, { margin: 0.04 });
    zooms.push({
      id: newId("z"),
      start: when.start,
      end: when.end,
      ...rect,
      level,
      easing: "smooth",
      follow: false,
      auto: true,
      label: clean(found.label || f.what, 60),
    });
  }
  return { zooms, skipped };
}

/* ── The whole pass ────────────────────────────────────────────────────────── */

/**
 * @param {object} o
 * @param {string} o.video      the recording on local disk
 * @param {string} o.workDir
 * @param {number} o.duration
 * @param {string} o.brief      the creator's description
 * @param {object} o.timeline   the analysis's edit (read only), with its zooms as the creator has them
 * @param {object} [o.hint]     { summary, product } from the analysis, if it read the screens
 * @param {Array}  [o.speech]   the creator's own words: [{ start, end, text }]
 * @returns {Promise<{ product, summary, steps, lines, focus, skipped, seen, shortened, lengthened, spend }>}
 */
export async function direct({ video, workDir, duration, brief, timeline, hint = {}, speech = [], changes = [], onProgress = () => {} }) {
  const spend = { usd: 0, calls: 0 };

  onProgress(0.08, "Watching the recording");
  const rec = await recordingParts({ video, workDir, duration });

  const log = clickLog(timeline);
  const said = (speech || [])
    .filter((c) => clean(c.text, 300))
    .map((c) => `${num(c.start).toFixed(1)}–${num(c.end).toFixed(1)}s  ${clean(c.text, 300)}`)
    .join("\n");
  const earlier = [hint.product && `Product seen on screen: ${clean(hint.product, 80)}`, hint.summary && `An earlier reading: ${clean(hint.summary, 300)}`]
    .filter(Boolean)
    .join("\n");
  const target = Math.round(duration * WORDS_PER_SECOND * COVERAGE);

  const prompt =
    `${DIRECTOR.replace("TARGET_WORDS", String(target))}\n\n` +
    `The recording is ${duration.toFixed(1)} seconds long.${rec.seen === "stills" ? " It is given as stills with their times." : ""}\n\n` +
    `CREATOR'S DESCRIPTION OF THIS DEMO:\n"""\n${clean(brief, 1500)}\n"""\n\n` +
    `CLICK LOG (measured from the recording; times in seconds):\n${log || "(no clicks were found)"}\n` +
    (said ? `\nTHE CREATOR'S OWN SPOKEN WORDS WHILE RECORDING:\n${said}\n` : "") +
    (earlier ? `\n${earlier}\n` : "");

  onProgress(0.25, "Writing the script");
  const json = await askJson(
    {
      model: rec.model,
      label: "autodemo:director",
      parts: [...rec.parts, { text: prompt }],
      schema: DIRECTOR_SCHEMA,
      maxOutputTokens: 12288,
      temperature: 0.5,
      thinkingBudget: 4096,
    },
    spend
  );

  let lines = cleanLines(json?.lines, duration);
  const steps = cleanSteps(json?.steps, duration);

  onProgress(0.5, "Fitting the script to the video");
  const fitted = await fit(lines, misfits(lines), { rec, brief, steps, spend });
  lines = fitted.lines;

  onProgress(0.75, "Choosing what to show up close");
  const placed = await placeFocus({ video, workDir, focus: cleanFocus(json?.focus, duration), timeline, duration, changes: Array.isArray(changes) ? changes : [], spend });

  return {
    product: clean(json?.product, 80),
    summary: clean(json?.summary, 300),
    steps,
    lines,
    focus: placed.zooms,
    skipped: placed.skipped,
    seen: rec.seen,
    shortened: fitted.shortened,
    lengthened: fitted.lengthened,
    spend,
    // Kept in memory for refit() after the voice has spoken; never stored.
    rec,
  };
}

export default { direct, refit, clickLog, cleanLines, cleanSteps, cleanFocus, focusWindow, focusLevel, placeFocus, misfits, measuredMisfits, hypeOf, targetOf };

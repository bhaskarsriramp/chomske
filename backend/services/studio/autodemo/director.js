/**
 * autodemo/director.js: the recording plus the creator's description, turned
 * into a timed voiceover script.
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
 * Script lines in recording time, cleaned so they never overlap and sized to
 * be speakable in the window they have. Nothing here writes to a demo; the job
 * (autodemo/job.js) decides what to do with the answer.
 */
import path from "path";
import fsp from "fs/promises";
import { generateJson, MODEL } from "../../ai/provider.js";
import { makeWatchCopy, extractFrames } from "../../media/ffmpeg.js";
import { newId } from "../timeline.js";
import { DIRECTOR, DIRECTOR_SCHEMA, TIGHTEN, WORDS_PER_SECOND } from "./prompts.js";

/** Frames a second the model samples from the watch copy. Clicks come from the log, so the flow is what it needs. */
const WATCH_FPS = 2;
const WATCH_EDGE = 1024;
/** Largest watch copy sent inline (witness.js uses the same ceiling). STUDIO_AUTODEMO_INLINE_MB overrides it, for tests. */
const MAX_INLINE_BYTES = (Number(process.env.STUDIO_AUTODEMO_INLINE_MB) > 0 ? Number(process.env.STUDIO_AUTODEMO_INLINE_MB) : 18) * 1024 * 1024;
/** Stills sent instead, when the video is too big. */
const MAX_STILLS = 48;
/** The gap left between two lines, seconds. */
const BREATH = 0.25;
/** A line shorter than this on screen is dropped. */
const MIN_LINE = 0.6;
/** How far past the model's own end a line may be given room, when nothing follows it. */
const STRETCH = 2.5;
/** How far before the model's own start a line may begin, into silence, when it needs the room. */
const LEAD_MAX = 1.5;

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round2 = (v) => Math.round(num(v) * 100) / 100;
const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;
const clean = (s, max) => String(s || "").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * One model call that survives a refused schema, like vision.js ask(): the
 * limits a schema must fit are the service's and unstated, so a 400 with a
 * schema attached is asked once more without it.
 */
async function askJson(opts, spend) {
  try {
    const res = await generateJson(opts);
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
      // A press the analysis decided was not one (moving, scrolling, nothing
      // came of it) is left out: the script must not narrate a click that
      // might not have happened.
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

/* ── The answer, made safe to use ──────────────────────────────────────────── */

/**
 * Lines in order, inside the recording, never overlapping, each long enough to
 * read.
 *
 * Two lines that overlap meet halfway, so neither loses all of its time. A
 * line too short for its words borrows from the silence around it: first after
 * it (up to STRETCH), then before it (up to LEAD_MAX), never from another
 * line. Whatever is still too long is for tighten() to shorten.
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
    // Kept even when short for now: the room it needs may be borrowed below.
    if (l.end - l.start > 0.05) out.push(l);
  }

  for (let i = 0; i < out.length; i++) {
    const l = out[i];
    const needed = words(l.text) / WORDS_PER_SECOND + 0.3;
    if (l.end - l.start >= needed) continue;
    const next = out[i + 1];
    const later = Math.min(next ? next.start - BREATH : duration, l.end + STRETCH);
    l.end = Math.max(l.end, Math.min(later, l.start + needed));
    if (l.end - l.start >= needed) continue;
    const prev = out[i - 1];
    const earlier = Math.max(prev ? prev.end + BREATH : 0, l.start - LEAD_MAX);
    l.start = Math.min(l.start, Math.max(earlier, l.end - needed));
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
      matters: ["high", "medium", "low"].includes(s?.matters) ? s.matters : "medium",
    }))
    .filter((s) => s.title && s.end > s.start)
    .sort((a, b) => a.start - b.start)
    .slice(0, 20);
}

/** The most words a line can carry in its window. */
const budgetOf = (l) => Math.max(3, Math.floor((l.end - l.start) * WORDS_PER_SECOND));

/**
 * Lines too long for their window, asked to be shorter, once. A shorter answer
 * replaces the line; anything else leaves it as it was, and the voice's own
 * fitting (voice.js) deals with the rest.
 */
async function tighten(lines, spend) {
  const over = lines
    .map((l, i) => ({ i, l, budget: budgetOf(l) }))
    .filter((x) => words(x.l.text) > Math.ceil(x.budget * 1.15));
  if (!over.length) return { lines, tightened: 0 };

  const text =
    `${TIGHTEN}\n\nLINES:\n` +
    over.map((x) => `{"i": ${x.i}, "max_words": ${x.budget}, "text": ${JSON.stringify(x.l.text)}}`).join("\n");
  let json = null;
  try {
    json = await askJson({ model: MODEL.text, label: "autodemo:tighten", parts: [{ text }], maxOutputTokens: 4096, temperature: 0.2 }, spend);
  } catch (err) {
    console.warn(`[autodemo] tightening failed (${err.message}); keeping the long lines`);
    return { lines, tightened: 0 };
  }
  const next = lines.map((l) => ({ ...l }));
  let tightened = 0;
  for (const r of Array.isArray(json?.lines) ? json.lines : []) {
    const i = Math.round(num(r?.i, -1));
    const t = clean(r?.text, 400);
    if (!next[i] || !t || words(t) >= words(next[i].text)) continue;
    next[i].text = t;
    tightened++;
  }
  return { lines: next, tightened };
}

/* ── The whole pass ────────────────────────────────────────────────────────── */

/**
 * @param {object} o
 * @param {string} o.video      the recording on local disk
 * @param {string} o.workDir
 * @param {number} o.duration
 * @param {string} o.brief      the creator's description
 * @param {object} o.timeline   the analysis's edit (read only)
 * @param {object} [o.hint]     { summary, product } from the analysis, if it read the screens
 * @param {Array}  [o.speech]   the creator's own words: [{ start, end, text }]
 * @returns {Promise<{ product, summary, steps, lines, seen, tightened, spend }>}
 */
export async function direct({ video, workDir, duration, brief, timeline, hint = {}, speech = [], onProgress = () => {} }) {
  const spend = { usd: 0, calls: 0 };

  onProgress(0.1, "Watching the recording");
  const rec = await recordingParts({ video, workDir, duration });

  const log = clickLog(timeline);
  const said = (speech || [])
    .filter((c) => clean(c.text, 300))
    .map((c) => `${num(c.start).toFixed(1)}–${num(c.end).toFixed(1)}s  ${clean(c.text, 300)}`)
    .join("\n");
  const earlier = [hint.product && `Product seen on screen: ${clean(hint.product, 80)}`, hint.summary && `An earlier reading: ${clean(hint.summary, 300)}`]
    .filter(Boolean)
    .join("\n");

  const prompt =
    `${DIRECTOR}\n\n` +
    `The recording is ${duration.toFixed(1)} seconds long.${rec.seen === "stills" ? " It is given as stills with their times." : ""}\n\n` +
    `CREATOR'S DESCRIPTION OF THIS DEMO:\n"""\n${clean(brief, 1500)}\n"""\n\n` +
    `CLICK LOG (measured from the recording; times in seconds):\n${log || "(no clicks were found)"}\n` +
    (said ? `\nTHE CREATOR'S OWN SPOKEN WORDS WHILE RECORDING:\n${said}\n` : "") +
    (earlier ? `\n${earlier}\n` : "");

  onProgress(0.3, "Writing the script");
  const json = await askJson(
    {
      model: rec.model,
      label: "autodemo:director",
      parts: [...rec.parts, { text: prompt }],
      schema: DIRECTOR_SCHEMA,
      maxOutputTokens: 8192,
      temperature: 0.4,
      thinkingBudget: 2048,
    },
    spend
  );

  let lines = cleanLines(json?.lines, duration);
  const steps = cleanSteps(json?.steps, duration);

  onProgress(0.55, "Fitting the script to the video");
  const fit = await tighten(lines, spend);
  lines = fit.lines;

  return {
    product: clean(json?.product, 80),
    summary: clean(json?.summary, 300),
    steps,
    lines,
    seen: rec.seen,
    tightened: fit.tightened,
    spend,
  };
}

export default { direct, clickLog, cleanLines, cleanSteps };

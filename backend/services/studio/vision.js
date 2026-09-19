/**
 * vision.js: the recording, read by Gemini.
 *
 * Eight questions get asked about a demo, in the order they depend on each
 * other. This file asks them, checks the answers are usable, and converts
 * everything into the timeline's vocabulary (services/studio/timeline.js).
 *
 *   1. readFrames      what is on each sampled frame
 *   2. detectSteps     what the person was doing, and what is dead air
 *   3. planZooms       where the camera goes
 *   4. findSensitive   what must be blurred before this is published
 *   5. writeCaptions   what was said
 *   6. planNotes       what to point at
 *   7. writeNarration  what should have been said, when nothing was
 *   8. reviewEdit      what is still wrong with the result
 *
 * ── THE MODEL'S ANSWER IS NEVER TRUSTED ──────────────────────────────────────
 * Every number that comes back is clamped, every span is checked against the
 * recording's real duration, every box is forced inside the frame, and anything
 * that cannot be repaired is dropped. A bounding box of [0.4, 0.3, 12, 8] is a
 * perfectly ordinary model answer and it must not become a crop filter.
 *
 * ── PARTIAL ANSWERS ARE KEPT ─────────────────────────────────────────────────
 * Reading 600 frames is 600 chances for one call to fail. A batch that fails
 * after its retries is skipped and the analysis carries on, because 580 frames
 * of UI understanding makes a good edit and an exception makes none. What was
 * missed is counted and reported, so a run that lost half its frames says so
 * rather than quietly producing a thin edit.
 *
 * ── WHAT IT COSTS ────────────────────────────────────────────────────────────
 * Frames dominate. Everything else is text. Each call's spend is accumulated
 * and handed back so the job can record what the analysis actually cost against
 * what the creator was charged.
 */
import fsp from "fs/promises";
import { generateJson, retryable, pool, TEXT_MODEL } from "../edit/gemini.js";
import {
  UI_ANALYZER, STEP_DETECTOR, ZOOM_PLANNER, BLUR_DETECTOR,
  CAPTION_GENERATOR, NARRATION_WRITER, ANNOTATION_PLANNER, QUALITY_REVIEWER,
  frameIndex, eventLog, elementLog,
} from "./prompts.js";
import { newId, clampRect } from "./timeline.js";

/** Vision reads and text reasoning both go to the same flash model by default. */
export const VISION_MODEL = process.env.GEMINI_VISION_MODEL || process.env.GEMINI_TEXT_MODEL || "gemini-3.5-flash";
export const AUDIO_MODEL = process.env.GEMINI_AUDIO_MODEL || VISION_MODEL;

/**
 * Frames per UI-analysis request.
 *
 * One frame per call is the most accurate and costs a round trip each; the whole
 * recording in one call loses track of which answer belongs to which frame past
 * about a dozen. Six is where accuracy stopped falling and the number of calls
 * stopped mattering.
 */
const FRAMES_PER_READ = 6;
/** Concurrent Gemini calls. Bounded by the key pool's per-minute limits. */
const CONCURRENCY = parseInt(process.env.STUDIO_VISION_CONCURRENCY || "4", 10);
const ATTEMPTS = 3;

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const str = (v, max = 200) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);

/** A model's [x,y,w,h] as a rect this product can render. Null when unusable. */
function box(bbox) {
  if (!Array.isArray(bbox) || bbox.length < 4) return null;
  let [x, y, w, h] = bbox.map((v) => num(v, NaN));
  if (![x, y, w, h].every(Number.isFinite)) return null;

  // Asked for fractions, sometimes given pixels anyway. A box with any number
  // above 1.5 is pixels in SOME frame size we were not told; there is no way to
  // recover which, so it goes rather than lands somewhere arbitrary.
  if (Math.max(x, y, w, h) > 1.5) return null;
  if (w <= 0.001 || h <= 0.001) return null;
  return clampRect({ x, y, w, h });
}

/** One image, as a Gemini part. */
async function imagePart(file) {
  const data = await fsp.readFile(file);
  return { inlineData: { mimeType: "image/jpeg", data: data.toString("base64") } };
}

/**
 * One model call with retries, and a spend counter that survives failure.
 *
 * `spend` is mutated rather than returned so a batch that fails on its last
 * attempt still accounts for the tokens the first two attempts burned. Those
 * were charged by Google whether or not this product got an answer.
 */
async function ask({ model = VISION_MODEL, parts, maxOutputTokens = 16384, spend, label }) {
  let lastErr = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await generateJson({ model, parts, maxOutputTokens });
      spend.usd += res.usd;
      spend.calls += 1;
      return res.json;
    } catch (err) {
      lastErr = err;
      spend.usd += num(err?.usd);
      if (!retryable(err) || attempt === ATTEMPTS) break;
      await new Promise((r) => setTimeout(r, 400 * attempt * attempt));
    }
  }
  console.warn(`[studio] ${label} failed after ${ATTEMPTS} attempts: ${lastErr?.message}`);
  spend.failed += 1;
  return null;
}

export const newSpend = () => ({ usd: 0, calls: 0, failed: 0 });

/* ────────────────────────────────────────────────────────────────────────────
   1. What is on each frame
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Every sampled frame, read for its UI.
 *
 * @param {Array<{file,t}>} frames
 * @returns {Promise<Array<{ t, screen, app, busy, elements }>>} one per frame, in order
 */
export async function readFrames(frames, { spend = newSpend(), onProgress = () => {} } = {}) {
  const batches = [];
  for (let i = 0; i < frames.length; i += FRAMES_PER_READ) batches.push(frames.slice(i, i + FRAMES_PER_READ));

  const results = new Array(frames.length).fill(null);
  let done = 0;

  await pool(batches, CONCURRENCY, async (batch, bi) => {
    const parts = [{ text: `${UI_ANALYZER}\n\nYou are given ${batch.length} frames. Answer for EACH, in order, as an array under "frames".\n\n${frameIndex(batch)}` }];
    for (const f of batch) parts.push(await imagePart(f.file));

    const json = await ask({ parts, spend, label: `readFrames batch ${bi + 1}`, maxOutputTokens: 8192 });
    const answers = Array.isArray(json?.frames) ? json.frames : json ? [json] : [];

    batch.forEach((f, k) => {
      const a = answers[k];
      const at = bi * FRAMES_PER_READ + k;
      results[at] = {
        t: f.t,
        file: f.file,
        screen: str(a?.screen, 60),
        app: str(a?.app, 60),
        busy: !!a?.busy,
        elements: (a?.elements || [])
          .map((e) => {
            const b = box(e.bbox);
            if (!b) return null;
            return {
              type: str(e.type, 24) || "unknown",
              label: str(e.label, 80),
              bbox: [b.x, b.y, b.w, b.h],
              importance: ["high", "medium", "low"].includes(e.importance) ? e.importance : "medium",
            };
          })
          .filter(Boolean)
          .slice(0, 25),
      };
    });

    done += batch.length;
    onProgress(done / frames.length);
  });

  return results.filter(Boolean);
}

/* ────────────────────────────────────────────────────────────────────────────
   2. What the person was doing
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The demo's chapters, and its dead air.
 *
 * Frames are thinned to at most STEP_FRAMES before being sent: the step
 * detector is reasoning about a narrative, and forty frames spread across the
 * recording tell that story as well as four hundred at a tenth of the cost.
 * The ones kept are spread evenly, with every frame where the screen CHANGED
 * kept regardless, because that is where a step boundary can be.
 */
const STEP_FRAMES = 40;

export async function detectSteps({ shots, events, duration, spend = newSpend() }) {
  const keep = thinFrames(shots, STEP_FRAMES);

  const parts = [
    {
      text:
        `${STEP_DETECTOR}\n\n` +
        `The recording is ${duration.toFixed(1)} seconds long.\n\n` +
        `FRAMES (in order):\n${frameIndex(keep)}\n\n` +
        `WHAT WAS ON THEM:\n${elementLog(keep, { limit: STEP_FRAMES })}\n\n` +
        `POINTER LOG:\n${eventLog(events)}`,
    },
  ];
  for (const f of keep) parts.push(await imagePart(f.file));

  const json = await ask({ parts, spend, label: "detectSteps", maxOutputTokens: 8192 });
  if (!json) return { summary: "", product: "", steps: [], dead: [] };

  const steps = (json.steps || [])
    .map((s) => {
      const start = clamp(num(s.start), 0, duration);
      const end = clamp(num(s.end, start), start, duration);
      const focus = box(s.focus) || { x: 0, y: 0, w: 1, h: 1 };
      if (end - start < 0.3 || !str(s.title)) return null;
      return {
        id: newId("s"),
        start, end,
        title: str(s.title, 100),
        detail: str(s.detail, 400),
        importance: ["high", "medium", "low"].includes(s.importance) ? s.importance : "medium",
        camera: ["cursor", "element", "modal", "region", "full"].includes(s.camera) ? s.camera : "element",
        focus,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);

  // Overlaps happen and break the chapter list. The later step wins its own
  // start; the earlier one is shortened to meet it.
  for (let i = 0; i < steps.length - 1; i++) {
    if (steps[i].end > steps[i + 1].start) steps[i].end = steps[i + 1].start;
  }

  const dead = (json.dead || [])
    .map((d) => {
      const start = clamp(num(d.start), 0, duration);
      const end = clamp(num(d.end, start), start, duration);
      return end - start >= 0.8
        ? {
            id: newId("cut"),
            start, end,
            reason: ["loading", "idle", "error", "repetition"].includes(d.reason) ? (d.reason === "repetition" ? "idle" : d.reason) : "idle",
            auto: true,
          }
        : null;
    })
    .filter(Boolean);

  return {
    summary: str(json.summary, 300),
    product: str(json.product, 80),
    steps: steps.filter((s) => s.end - s.start >= 0.3),
    dead,
  };
}

/** Frames spread evenly, with every screen change kept. */
function thinFrames(shots, max) {
  if (shots.length <= max) return shots;
  const keep = new Set();
  for (let i = 1; i < shots.length; i++) {
    if (shots[i].screen && shots[i].screen !== shots[i - 1].screen) keep.add(i);
  }
  const stride = shots.length / max;
  for (let i = 0; i < max; i++) keep.add(Math.floor(i * stride));
  return [...keep].sort((a, b) => a - b).slice(0, max + 12).map((i) => shots[i]);
}

/* ────────────────────────────────────────────────────────────────────────────
   3. Where the camera goes
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The zoom timeline.
 *
 * Text only: the steps, the elements and the pointer log are enough, and the
 * frames were already read once. A second pass over the pictures to decide
 * framing costs as much as the whole first analysis and produced the same plan.
 */
export async function planZooms({ steps, shots, events, duration, spend = newSpend() }) {
  if (!steps.length) return [];

  const text =
    `${ZOOM_PLANNER}\n\n` +
    `The recording is ${duration.toFixed(1)} seconds long.\n\n` +
    `STEPS:\n` +
    steps
      .map((s) => `${s.start.toFixed(2)}–${s.end.toFixed(2)}s [${s.importance}, camera=${s.camera}] ${s.title}: ${s.detail} (focus [${s.focus.x.toFixed(2)},${s.focus.y.toFixed(2)},${s.focus.w.toFixed(2)},${s.focus.h.toFixed(2)}])`)
      .join("\n") +
    `\n\nELEMENTS SEEN:\n${elementLog(shots, { limit: 60 })}\n\nPOINTER LOG:\n${eventLog(events)}`;

  const json = await ask({ model: TEXT_MODEL, parts: [{ text }], spend, label: "planZooms", maxOutputTokens: 8192 });
  if (!json) return [];

  const zooms = (json.zooms || [])
    .map((z) => {
      const b = box(z.bbox);
      const start = clamp(num(z.start), 0, duration);
      const end = clamp(num(z.end, start), start, duration);
      if (!b || end - start < 0.5) return null;
      return {
        id: newId("z"),
        start,
        end: Math.min(end, start + 8),
        x: b.x, y: b.y, w: b.w, h: b.h,
        level: clamp(num(z.level, 1.6), 1.05, 3),
        easing: ["smooth", "snappy", "slow"].includes(z.easing) ? z.easing : "smooth",
        camera: ["cursor", "element", "modal", "region", "full"].includes(z.camera) ? z.camera : "element",
        follow: !!z.follow,
        follow_strength: 0.7,
        label: str(z.label, 80),
        auto: true,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);

  return spaceZooms(zooms);
}

/**
 * Zooms, with the ones that crowd each other removed.
 *
 * The prompt asks for breathing room and the model mostly gives it, but a
 * camera that re-frames twice in a second is the difference between a demo that
 * reads as edited and one that reads as broken, so it is enforced here too. The
 * one with the higher zoom level survives a collision, on the reasoning that it
 * was the more deliberate choice.
 */
const MIN_GAP = 0.8;

export function spaceZooms(zooms) {
  const out = [];
  for (const z of zooms) {
    const prev = out[out.length - 1];
    if (!prev) { out.push(z); continue; }
    if (z.start < prev.end + MIN_GAP) {
      if (z.level > prev.level + 0.15) out[out.length - 1] = z;
      // Otherwise the new one is dropped: the camera stays where it was.
      continue;
    }
    out.push(z);
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
   4. What must not be published
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Sensitive regions, found per frame and joined into spans.
 *
 * ── WHY EVERY FRAME AND NOT A SAMPLE ─────────────────────────────────────────
 * The other analysers can miss a frame and produce a slightly worse edit. This
 * one missing a frame publishes an API key. So it reads every sampled frame,
 * and a region found on one frame is held for the whole gap to the next sample
 * plus a margin on each side, because the thing was almost certainly on screen
 * between two sightings of it and a blur that flickers off for one frame is the
 * same as no blur at all.
 */
export async function findSensitive(frames, { every = 2, duration = 0, spend = newSpend(), onProgress = () => {} } = {}) {
  const found = [];
  let done = 0;

  await pool(frames, CONCURRENCY, async (f) => {
    const json = await ask({
      parts: [{ text: BLUR_DETECTOR }, await imagePart(f.file)],
      spend,
      label: `findSensitive t=${f.t}`,
      maxOutputTokens: 4096,
    });
    for (const r of json?.regions || []) {
      const b = box(r.bbox);
      if (!b) continue;
      found.push({
        t: f.t,
        ...b,
        kind: ["blur", "pixelate", "box"].includes(r.kind) ? r.kind : "blur",
        label: str(r.label, 60),
        confidence: clamp(num(r.confidence, 0.6), 0, 1),
      });
    }
    done += 1;
    onProgress(done / frames.length);
  });

  return joinRegions(found, { every, duration });
}

/**
 * Per-frame findings, as the fewest spans that cover them.
 *
 * Two boxes are the same thing when they overlap by more than half and are on
 * consecutive samples. The joined span takes the UNION of the boxes, so a
 * dialog that drifts a few pixels between frames stays covered rather than
 * losing its edge.
 */
function joinRegions(found, { every, duration }) {
  const pad = Math.max(0.15, every * 0.6);
  const open = [];
  const closed = [];

  for (const r of found.sort((a, b) => a.t - b.t)) {
    const hit = open.find((o) => o.kind === r.kind && o.last >= r.t - every * 1.5 && overlap(o, r) > 0.5);
    if (hit) {
      const x = Math.min(hit.x, r.x);
      const y = Math.min(hit.y, r.y);
      hit.w = Math.max(hit.x + hit.w, r.x + r.w) - x;
      hit.h = Math.max(hit.y + hit.h, r.y + r.h) - y;
      hit.x = x;
      hit.y = y;
      hit.last = r.t;
      hit.confidence = Math.max(hit.confidence, r.confidence);
      if (!hit.label && r.label) hit.label = r.label;
    } else {
      open.push({ ...r, first: r.t, last: r.t });
    }
    for (let i = open.length - 1; i >= 0; i--) {
      if (open[i].last < r.t - every * 1.5) closed.push(open.splice(i, 1)[0]);
    }
  }
  closed.push(...open);

  return closed.map((o) => {
    const rect = clampRect({
      // Padded outward so no glyph sits on the boundary of the blur.
      x: o.x - 0.006, y: o.y - 0.008, w: o.w + 0.012, h: o.h + 0.016,
    });
    return {
      id: newId("b"),
      start: Math.max(0, o.first - pad),
      end: duration > 0 ? Math.min(duration, o.last + pad) : o.last + pad,
      ...rect,
      kind: o.kind,
      strength: o.kind === "box" ? 1 : 0.75,
      label: o.label,
      confidence: o.confidence,
      auto: true,
    };
  });
}

function overlap(a, b) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = x * y;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/* ────────────────────────────────────────────────────────────────────────────
   5. What was said
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Captions from the recording's own audio.
 *
 * The whole speech track goes in one call. It is a 16 kHz mono MP3 at 32 kbps
 * (services/media/ffmpeg.js), so twenty minutes is under 5 MB, well inside what
 * an inline part carries, and one call keeps the cue timings consistent in a way
 * that stitching per-minute calls never quite does.
 */
export async function writeCaptions(audioFile, { duration = 0, spend = newSpend() } = {}) {
  const data = await fsp.readFile(audioFile);
  const json = await ask({
    model: AUDIO_MODEL,
    parts: [
      { text: `${CAPTION_GENERATOR}\n\nThe audio is ${duration.toFixed(1)} seconds long.` },
      { inlineData: { mimeType: "audio/mpeg", data: data.toString("base64") } },
    ],
    spend,
    label: "writeCaptions",
    maxOutputTokens: 32768,
  });
  if (!json) return { language: "", language_label: "", cues: [] };

  let last = 0;
  const cues = (json.cues || [])
    .map((c) => {
      const start = clamp(num(c.start), 0, duration || Infinity);
      const end = clamp(num(c.end, start), start, duration || Infinity);
      const text = str(c.text, 300);
      if (!text || end - start < 0.05) return null;
      return {
        id: newId("q"),
        start, end, text,
        emphasis: (c.emphasis || []).slice(0, 6).map((w) => str(w, 60)).filter(Boolean),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start)
    // Overlapping cues draw on top of each other. The later one wins its start.
    .map((c) => {
      const fixed = { ...c, start: Math.max(c.start, last) };
      last = Math.max(last, fixed.end);
      return fixed;
    })
    .filter((c) => c.end - c.start >= 0.05);

  return { language: str(json.language, 12), language_label: str(json.language_label, 60), cues };
}

/* ────────────────────────────────────────────────────────────────────────────
   6. What to point at
   ──────────────────────────────────────────────────────────────────────────── */

export async function planNotes({ steps, shots, duration, spend = newSpend() }) {
  if (!steps.length) return [];

  const text =
    `${ANNOTATION_PLANNER}\n\n` +
    `The recording is ${duration.toFixed(1)} seconds long.\n\n` +
    `STEPS:\n` +
    steps.map((s) => `${s.start.toFixed(2)}–${s.end.toFixed(2)}s [${s.importance}] ${s.title}: ${s.detail}`).join("\n") +
    `\n\nELEMENTS SEEN:\n${elementLog(shots, { limit: 60 })}`;

  const json = await ask({ model: TEXT_MODEL, parts: [{ text }], spend, label: "planNotes", maxOutputTokens: 4096 });
  if (!json) return [];

  return (json.annotations || [])
    .map((a) => {
      const b = box(a.bbox);
      const start = clamp(num(a.start), 0, duration);
      const end = clamp(num(a.end, start), start, duration);
      const text2 = str(a.text, 200);
      if (!b || !text2 || end - start < 0.4) return null;
      return {
        id: newId("n"),
        start,
        end: Math.min(end, start + 4),
        kind: ["tooltip", "arrow", "circle", "spotlight", "underline"].includes(a.kind) ? a.kind : "tooltip",
        text: text2,
        ...b,
        anchor: ["top", "bottom", "left", "right", "auto"].includes(a.anchor) ? a.anchor : "auto",
        color: "",
        auto: true,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
}

/* ────────────────────────────────────────────────────────────────────────────
   7. What should have been said
   ──────────────────────────────────────────────────────────────────────────── */

export async function writeNarration({ steps, summary, product, duration, spend = newSpend() }) {
  if (!steps.length) return [];

  const text =
    `${NARRATION_WRITER}\n\n` +
    `The demo: ${summary || "a product demo"}${product ? ` (product: ${product})` : ""}.\n` +
    `The recording is ${duration.toFixed(1)} seconds long.\n\n` +
    `STEPS:\n` +
    steps.map((s) => `${s.start.toFixed(2)}–${s.end.toFixed(2)}s (${(s.end - s.start).toFixed(1)}s) ${s.title}: ${s.detail}`).join("\n");

  const json = await ask({ model: TEXT_MODEL, parts: [{ text }], spend, label: "writeNarration", maxOutputTokens: 4096 });
  if (!json) return [];

  return (json.lines || [])
    .map((l) => {
      const start = clamp(num(l.start), 0, duration);
      const end = clamp(num(l.end, start), start, duration);
      const text2 = str(l.text, 600);
      return text2 && end > start ? { id: newId("v"), start, end, text: text2 } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
}

/* ────────────────────────────────────────────────────────────────────────────
   8. What is still wrong
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The finished edit, reviewed. Returns suggestions the creator can apply with
 * one click (services/studio/suggestions.js turns a `change` into a timeline
 * edit). Advisory only: nothing here is applied automatically, because a
 * reviewer that edits its own work has no reviewer.
 */
export async function reviewEdit({ timeline, steps, duration, spend = newSpend() }) {
  const describe = (list, fn) => (list?.length ? list.map(fn).join("\n") : "(none)");

  const text =
    `${QUALITY_REVIEWER}\n\n` +
    `The recording is ${duration.toFixed(1)} seconds long.\n\n` +
    `STEPS:\n${describe(steps, (s) => `${s.id} ${s.start.toFixed(2)}–${s.end.toFixed(2)}s [${s.importance}] ${s.title}`)}\n\n` +
    `CUTS:\n${describe(timeline.cuts, (c) => `${c.id} ${c.start.toFixed(2)}–${c.end.toFixed(2)}s (${c.reason})`)}\n\n` +
    `ZOOMS:\n${describe(timeline.zooms, (z) => `${z.id} ${z.start.toFixed(2)}–${z.end.toFixed(2)}s level ${z.level} at [${z.x.toFixed(2)},${z.y.toFixed(2)},${z.w.toFixed(2)},${z.h.toFixed(2)}] ${z.label}`)}\n\n` +
    `ANNOTATIONS:\n${describe(timeline.notes, (n) => `${n.id} ${n.start.toFixed(2)}–${n.end.toFixed(2)}s ${n.kind} "${n.text}"`)}\n\n` +
    `BLURS:\n${describe(timeline.blurs, (b) => `${b.id} ${b.start.toFixed(2)}–${b.end.toFixed(2)}s ${b.kind} ${b.label}`)}`;

  const json = await ask({ model: TEXT_MODEL, parts: [{ text }], spend, label: "reviewEdit", maxOutputTokens: 4096 });
  if (!json) return { verdict: "", suggestions: [] };

  const OPS = ["add_cut", "remove_cut", "add_zoom", "adjust_zoom", "remove_zoom", "add_blur", "add_annotation", "adjust_step"];
  const suggestions = (json.suggestions || [])
    .map((s) => {
      const op = OPS.includes(s.change?.op) ? s.change.op : null;
      if (!op || !str(s.title)) return null;
      const b = box(s.change?.bbox);
      return {
        id: newId("sg"),
        title: str(s.title, 80),
        why: str(s.why, 240),
        severity: ["high", "medium", "low"].includes(s.severity) ? s.severity : "medium",
        change: {
          op,
          id: str(s.change.id, 32),
          start: clamp(num(s.change.start), 0, duration),
          end: clamp(num(s.change.end), 0, duration),
          bbox: b ? [b.x, b.y, b.w, b.h] : null,
          level: clamp(num(s.change.level, 0), 0, 5),
          text: str(s.change.text, 200),
        },
      };
    })
    .filter(Boolean)
    .slice(0, 20);

  const rank = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b2) => rank[a.severity] - rank[b2.severity]);

  return { verdict: str(json.verdict, 300), suggestions };
}

export default {
  VISION_MODEL, AUDIO_MODEL, newSpend,
  readFrames, detectSteps, planZooms, spaceZooms, findSensitive, writeCaptions, planNotes, writeNarration, reviewEdit,
};

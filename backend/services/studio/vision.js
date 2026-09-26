/**
 * vision.js: the recording, read by Gemini.
 *
 * Seven questions get asked about a demo, in the order they depend on each
 * other. This file asks them, checks the answers are usable, and converts
 * everything into the timeline's vocabulary (services/studio/timeline.js).
 *
 *   1. readFrames      what is on each sampled frame
 *   2. detectSteps     what the person was doing, and what is dead air
 *   3. planZooms       where the camera goes
 *   4. findSensitive   what must be blurred before this is published
 *   5. writeCaptions   what was said
 *   6. writeNarration  what should have been said, when nothing was
 *   7. arbitratePress  did a press really happen here, and on what
 *      auditChange     something changed and nothing explains it — what was it
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
import path from "path";
import { generateJson, pool, TEXT_MODEL } from "../edit/gemini.js";
import { MODEL } from "../ai/provider.js";
import { extractFrameAt } from "../media/ffmpeg.js";
import {
  UI_ANALYZER, STEP_DETECTOR, ZOOM_PLANNER, BLUR_DETECTOR,
  CAPTION_GENERATOR, NARRATION_WRITER, QUALITY_REVIEWER,
  PRESS_ARBITER, CHANGE_AUDITOR, POINTER_IDENTITY, POINTER_RUNS, PRESS_JUDGE, POINTER_TARGET,
  frameIndex, eventLog, elementLog,
} from "./prompts.js";
import { newId, clampRect } from "./timeline.js";

/** Vision reads and text reasoning both go to the same flash model by default. */
export const VISION_MODEL = MODEL.vision;
export const AUDIO_MODEL = MODEL.audio;

/**
 * Frames per UI-analysis request.
 *
 * One frame per call is the most accurate and costs a round trip each; the whole
 * recording in one call loses track of which answer belongs to which frame past
 * about a dozen. Six is where accuracy stopped falling and the number of calls
 * stopped mattering.
 */
/**
 * ── WHY THIS IS SMALL ────────────────────────────────────────────────────────
 * Six frames at up to twenty-five elements each is a lot of JSON to ask for in
 * one answer, and a reply that runs past the token limit does not come back
 * half-parsed — it does not parse at all, and the whole batch is lost. That
 * happened on a real recording: the first batch of six came back empty, so the
 * first ten seconds of the demo had no elements, so the two most important
 * clicks in it could not be judged and the gate had to wave them through.
 *
 * It was invisible because a lost batch looked exactly like six frames with
 * nothing on them. See the answer-count check below, which is what makes the
 * difference visible now.
 */
const FRAMES_PER_READ = 1;

/**
 * How a control may be drawn, per UI_ANALYZER. Anything else reads as "normal",
 * which is the value that contributes nothing either way.
 */
const ELEMENT_STATES = new Set(["normal", "hovered", "pressed", "focused", "selected", "disabled"]);
/**
 * How wide this pass fans out.
 *
 * ── NOT THE RATE LIMIT, AND IT USED TO BE ────────────────────────────────────
 * This was the only thing standing between a three hundred frame pass and the
 * per-minute quota, which meant the ceiling was set by whichever pass happened
 * to be running and two passes at once had twice the ceiling. The real limits
 * are GEMINI_RPM and GEMINI_CONCURRENCY in services/ai/provider.js, and they
 * apply across every caller in the process at once.
 *
 * What is left here is how many frames this pass is willing to have in the air,
 * which is now only a statement about its own memory: each one is a base64 JPEG
 * held until the answer comes back.
 */
// 8 since the move to AI Studio's paid tier (2026-09-25): the provider's own
// budget is what limits the rate, and eight small JPEGs in the air is nothing.
const CONCURRENCY = parseInt(process.env.STUDIO_VISION_CONCURRENCY || "8", 10);

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const str = (v, max = 200) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
const round3 = (v) => Math.round(num(v) * 1000) / 1000;

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
 * One model call, and a spend counter that survives failure.
 *
 * `spend` is mutated rather than returned so a call that fails on its last
 * attempt still accounts for the tokens the earlier attempts burned. Those were
 * charged by Google whether or not this product got an answer.
 *
 * ── THE RETRY LOOP THAT USED TO BE HERE IS GONE ──────────────────────────────
 * It backed off 400ms and then 1600ms, which is the wrong order of magnitude
 * for a per-minute quota: three requests into a closed window, then a pass
 * reported as failed. Waiting is now the provider's job
 * (services/ai/provider.js), where it can read the server's own retryDelay,
 * hold the whole process back rather than this one call, and coordinate with
 * the other workers through Redis. Two retry loops stacked on top of each other
 * would multiply into attempts nobody asked for, so this one is a single call.
 */
async function ask({ model = VISION_MODEL, parts, maxOutputTokens = 16384, spend, label, schema = null }) {
  try {
    const res = await generateJson({ model, parts, maxOutputTokens, schema, label });
    spend.usd += res.usd;
    spend.calls += 1;
    return res.json;
  } catch (err) {
    spend.usd += num(err?.usd);
    /**
     * ── A SCHEMA THE SERVICE REFUSES IS NOT A REASON TO LOSE THE FRAME ──────
     * The limits a schema must fit are the service's, not ours, and they are
     * not stated anywhere: UI_SCHEMA at maxItems 40 was refused with a bare
     * "400 invalid argument" on every frame, which would have silently
     * emptied every reading on the day it shipped. So a refusal with a schema
     * attached is asked once more without it — the prompt still says what to
     * return — and said out loud, so the schema gets fixed.
     */
    if (schema && /\b400\b|INVALID_ARGUMENT/.test(String(err?.message || ""))) {
      console.warn(`[studio] ${label}: the response schema was refused (${String(err.message).slice(0, 80)}); asking without it`);
      return ask({ model, parts, maxOutputTokens, spend, label, schema: null });
    }
    console.warn(`[studio] ${label} failed: ${err?.message}`);
    spend.failed += 1;
    return null;
  }
}

export const newSpend = () => ({ usd: 0, calls: 0, failed: 0 });

/* ────────────────────────────────────────────────────────────────────────────
   1. What is on each frame
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The shape UI_ANALYZER answers in, held to while the model writes.
 *
 * ── WHY THE LIMIT IS IN THE SCHEMA AND NOT ONLY IN THE PROMPT ────────────────
 * The prompt says "at most 25 elements", and also "report every item in a list
 * separately" and "never drop a picture of another screen". On a page that is
 * mostly lists — a pricing table's feature rows, a column of search results —
 * those pull against each other, and in production one frame's reply ran to
 * the full 16384-token allowance:
 *
 *   [ai] a reply would not parse (MAX_TOKENS, 16374 tokens of answer) and it
 *        was closed off: 44015 characters from 44028
 *
 * — two hundred elements, billed, and salvaged only by cutting it off. The
 * allowance had already been raised once for truncation, which is the wrong
 * fix when the model is not running short of room but running on. A schema's
 * maxItems stops the list where it should stop, as it is written; it also
 * makes the reply valid JSON by construction, which retires the "Expected ','
 * or ']'" repairs this pass used to need.
 *
 * ── AND WHY TWENTY-FOUR ──────────────────────────────────────────────────────
 * Vertex compiles the schema into the grammar it decodes with, and the grammar
 * has a size limit that a cap multiplies: this item shape with maxItems 40 —
 * or 28 — is refused outright ("400 Request contains an invalid argument", on
 * every frame), and 24 is accepted. Measured on gemini-2.5-flash, 2026-09-24.
 * The prompt asks for twenty plus the pictures of other screens, in order of
 * what matters, so the cap trims the tail and not the point. See ask() for
 * what happens if a limit like this one moves.
 */
const UI_MAX_ELEMENTS = 24;
const UI_SCHEMA = {
  type: "OBJECT",
  properties: {
    screen: { type: "STRING" },
    busy: { type: "BOOLEAN" },
    app: { type: "STRING" },
    elements: {
      type: "ARRAY",
      maxItems: UI_MAX_ELEMENTS,
      items: {
        type: "OBJECT",
        properties: {
          type: { type: "STRING" },
          label: { type: "STRING" },
          bbox: { type: "ARRAY", items: { type: "NUMBER" }, minItems: 4, maxItems: 4 },
          importance: { type: "STRING", enum: ["high", "medium", "low"] },
          state: { type: "STRING", enum: ["normal", "hovered", "pressed", "focused", "selected", "disabled"] },
          sticky: { type: "BOOLEAN" },
        },
        required: ["type", "label", "bbox", "importance"],
        propertyOrdering: ["type", "label", "bbox", "importance", "state", "sticky"],
      },
    },
  },
  required: ["screen", "busy", "app", "elements"],
  propertyOrdering: ["screen", "busy", "app", "elements"],
};
/**
 * Room to answer one frame in: two dozen elements at seventy-odd tokens each,
 * with four times that to spare. A reply that still runs out of it is a model
 * repeating itself, and stopping it at 8192 costs half what 16384 did.
 */
const UI_MAX_TOKENS = 8192;

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
    // One frame per call, so the wording that asks for an array of answers is
    // only used if a future change batches them again.
    const many = batch.length > 1;
    const parts = [{ text: many
      ? `${UI_ANALYZER}\n\nYou are given ${batch.length} frames. Answer for EACH, in order, as an array under \"frames\".\n\n${frameIndex(batch)}`
      : `${UI_ANALYZER}\n\nAnswer for this one frame.` }];
    for (const f of batch) parts.push(await imagePart(f.file));

    // The schema describes ONE frame's answer; a batch of several would need
    // the array form, and FRAMES_PER_READ is 1.
    const json = await ask({
      parts, spend, label: `readFrames batch ${bi + 1}`,
      maxOutputTokens: many ? 16384 : UI_MAX_TOKENS,
      schema: many ? null : UI_SCHEMA,
    });
    let answers = Array.isArray(json?.frames) ? json.frames : json ? [json] : [];

    /**
     * ── A MISSING ANSWER IS NOT AN EMPTY SCREEN ──────────────────────────────
     * Silence and "there is nothing here" are the same shape in the reply and
     * mean opposite things. Everything downstream that asks "was the pointer on
     * a control?" needs to tell an answer of no from no answer, so a frame the
     * model did not answer for is asked about again on its own, and if it still
     * says nothing it is left out rather than filled in with a blank.
     */
    if (answers.length < batch.length) {
      console.warn(
        "[studio] vision batch " + (bi + 1) + " answered " + answers.length +
          " of " + batch.length + " frames; asking again" + (many ? " one at a time" : "")
      );
      const retried = [];
      for (let k = 0; k < batch.length; k++) {
        if (answers[k]) { retried[k] = answers[k]; continue; }
        const one = await ask({
          parts: [{ text: UI_ANALYZER + "\n\nAnswer for this one frame." }, await imagePart(batch[k].file)],
          spend,
          label: "readFrames batch " + (bi + 1) + " frame " + (k + 1) + " (retry)",
          /**
           * ── A SECOND ASK WITH LESS ROOM IS NOT A RETRY ────────────────────
           * This used to halve the allowance to 8192, on the reasoning that
           * one frame needs less than a batch of them. FRAMES_PER_READ is 1,
           * so the "batch" it is retrying was already a single frame asked
           * with the full 16384 — the retry was the identical request with
           * half the space to answer in.
           *
           * Which is the wrong direction for the commonest reason to be here.
           * A reply that stopped early stopped because it ran out of room, and
           * asking again with less of it makes a second failure more likely,
           * not less. Seen in production as batch 8 failing on a truncated
           * reply and being asked again the same way.
           *
           * The same room as the first ask, and the same schema: since the
           * schema caps the list, running out of room means repetition, and
           * more of it would buy more repetition.
           */
          maxOutputTokens: UI_MAX_TOKENS,
          schema: UI_SCHEMA,
        }).catch(() => null);
        retried[k] = one && Array.isArray(one.frames) ? one.frames[0] : one;
      }
      answers = retried;
    }

    batch.forEach((f, k) => {
      const a = answers[k];
      const at = bi * FRAMES_PER_READ + k;
      // Nothing came back for this frame even on a second ask. Leaving it null
      // keeps it out of frames_read and out of every judgement that would
      // otherwise read the blank as evidence.
      if (!a) { results[at] = null; return; }
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
              /**
               * ── HOW THE CONTROL IS DRAWN, WHICH IS THE INTERFACE TALKING ───
               * "pressed" is the only first-hand observation of a click this
               * product can get from a still frame: the interface acknowledging
               * one as it happens. Everything else in the pipeline infers a
               * press from what followed it.
               *
               * Unrecognised becomes "normal", which contributes nothing —
               * absence of a reading must never be evidence against a press.
               */
              state: ELEMENT_STATES.has(e.state) ? e.state : "normal",
              // Whether it stays put while the page scrolls under it. See
              // events.js confirmClicks for why a sticky nav bar matters.
              sticky: e.sticky === true,
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
        // Always Smooth, whatever the model asked for. The editor no longer
        // offers an easing, so a Snappy or Slow chosen here could never be
        // seen or changed by the creator.
        easing: "smooth",
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
export async function findSensitive(frames, { every = 2, duration = 0, events = [], spend = newSpend(), onProgress = () => {} } = {}) {
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

  return joinRegions(found, { every, duration, events });
}

/**
 * Per-frame findings, as the fewest spans that cover them.
 *
 * Two boxes are the same thing when they overlap by more than half and are on
 * consecutive samples. The joined span takes the UNION of the boxes, so a
 * dialog that drifts a few pixels between frames stays covered rather than
 * losing its edge.
 *
 * ── A BLUR ENDS WHEN THE SCREEN CHANGES, NOT WHEN THE MODEL BLINKS ───────────
 * The first version of this ended a span a fixed margin after the last frame
 * the model saw the region on, and it leaked. The failure is visible frame by
 * frame in a recording of a billing page: the card number is covered at 4.6s
 * and legible at 5.0s, because the sample at 6s happened to come back without
 * it. Nothing about the SCREEN changed — only the model's answer did.
 *
 * Detection is per-frame and probabilistic; the thing being detected is not. A
 * card number does not leave the screen between two samples and come back. So
 * the end of a span is now decided by the recording rather than by the model:
 * a region is held until the screen actually changes under it (the pointer
 * log's `nav` events, which are what a navigation, a dialog closing or a tab
 * switch look like), and only then released. Missing samples in the middle are
 * bridged for the same reason, and the same logic runs backwards from the first
 * sighting so a region is covered from the moment it appeared rather than from
 * whenever the sampler happened to catch it.
 *
 * The cost of being wrong is asymmetric and the defaults follow it: over-blur
 * is a rectangle the creator drags away in two seconds, under-blur is a
 * published secret. HOLD_MAX caps it so a single finding cannot blur the rest
 * of the demo.
 */
const HOLD_MAX = 12;
/** Bridged across this many missed samples before a span is considered ended. */
const BRIDGE_SAMPLES = 3;
/** Two boxes are the same region at this IoU, or when one mostly contains the other. */
const SAME_IOU = 0.28;
const SAME_INSIDE = 0.6;

function joinRegions(found, { every, duration, events = [] }) {
  const pad = Math.max(0.15, every * 0.6);
  const bridge = every * BRIDGE_SAMPLES;
  const open = [];
  const closed = [];

  for (const r of found.sort((a, b) => a.t - b.t)) {
    const hit = open.find((o) => o.kind === r.kind && o.last >= r.t - bridge && same(o, r));
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
      if (open[i].last < r.t - bridge) closed.push(open.splice(i, 1)[0]);
    }
  }
  closed.push(...open);

  // Where the screen changed under the region. A navigation is the only honest
  // evidence in the recording that what was on screen is no longer on screen.
  const navs = (events || [])
    .filter((e) => e.type === "nav")
    .map((e) => e.t)
    .sort((a, b) => a - b);
  const nextNav = (t) => navs.find((n) => n > t + 0.15);
  const prevNav = (t) => {
    let out;
    for (const n of navs) {
      if (n < t - 0.15) out = n;
      else break;
    }
    return out;
  };

  const spans = closed.map((o) => {
    // Held until the screen changes, and never past HOLD_MAX. With no
    // navigation to release it, one full sample interval past the last
    // sighting, so a single missed frame can never uncover anything.
    const after = nextNav(o.last);
    const floor = o.last + Math.max(pad, every * 1.5);
    const end = Math.min(o.last + HOLD_MAX, after !== undefined ? Math.max(floor, Math.min(after, o.last + HOLD_MAX)) : floor);

    // And covered from when it appeared: back to the navigation that put it
    // there, or one sample earlier when nothing in the log says.
    const before = prevNav(o.first);
    const ceiling = o.first - Math.max(pad, every);
    const start = Math.max(0, before !== undefined ? Math.max(before, Math.min(ceiling, o.first), o.first - HOLD_MAX) : ceiling);

    const rect = clampRect({
      // Padded outward so no glyph sits on the boundary of the blur, and wider
      // than it looks it needs to be: text reflows, a number gains a digit, and
      // a box that fits exactly at one sample leaks at the next.
      x: o.x - 0.012, y: o.y - 0.016, w: o.w + 0.024, h: o.h + 0.032,
    });
    return {
      id: newId("b"),
      start: round3(start),
      end: round3(duration > 0 ? Math.min(duration, end) : end),
      ...rect,
      kind: o.kind,
      strength: o.kind === "box" ? 1 : 0.75,
      label: o.label,
      confidence: o.confidence,
      auto: true,
    };
  });

  return mergeSpans(spans);
}

/**
 * Two spans of the same region that now overlap in time are one span.
 *
 * Holding to the next navigation makes this common: the model finds the card
 * number at 4s and again at 10s, both are held, and without this the creator
 * gets two chips stacked on the ruler for one rectangle and has to delete both
 * to reveal it.
 */
function mergeSpans(spans) {
  const out = [];
  for (const s of spans.sort((a, b) => a.start - b.start)) {
    const hit = out.find((o) => o.kind === s.kind && s.start <= o.end + 0.2 && same(o, s));
    if (!hit) {
      out.push(s);
      continue;
    }
    const x = Math.min(hit.x, s.x);
    const y = Math.min(hit.y, s.y);
    hit.w = Math.max(hit.x + hit.w, s.x + s.w) - x;
    hit.h = Math.max(hit.y + hit.h, s.y + s.h) - y;
    hit.x = x;
    hit.y = y;
    hit.end = Math.max(hit.end, s.end);
    hit.confidence = Math.max(hit.confidence, s.confidence);
    if (!hit.label && s.label) hit.label = s.label;
  }
  return out;
}

/**
 * Whether two boxes are the same thing on screen.
 *
 * Intersection over union alone was too strict. The model re-draws a box a
 * little differently every frame — tighter around the digits on one, including
 * the card brand on the next — and at IoU > 0.5 those two read as different
 * regions, which ends the first span and starts a second one late. Containment
 * catches that case: a box that sits mostly inside its neighbour is the same
 * region seen at a different crop, whatever their union says.
 */
function same(a, b) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = x * y;
  if (inter <= 0) return false;
  const areaA = a.w * a.h;
  const areaB = b.w * b.h;
  const union = areaA + areaB - inter;
  if (union > 0 && inter / union > SAME_IOU) return true;
  return inter / Math.max(1e-9, Math.min(areaA, areaB)) > SAME_INSIDE;
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
   6. What should have been said
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
   8. Two frames, one moment: the cross-check
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * ── WHY THESE TWO ARE DIFFERENT FROM EVERYTHING ABOVE ────────────────────────
 * Every pass above samples the recording on a fixed grid — a frame every two
 * seconds — and reads what is on each one. That grid is set before anything is
 * known about the recording, so most of the frames land on nothing in
 * particular and the moments that matter fall between them. A press lasts a
 * tenth of a second; the grid cannot see it, and paying for a grid fine enough
 * to would mean thirty times the frames for the same demo.
 *
 * These two pick their frames AFTERWARDS, from moments the pixel pipeline has
 * already identified as interesting, and they send a pair — before and after —
 * because the question is what CHANGED. That is both far cheaper (fifty frames
 * where the grid would need three hundred) and far more accurate, since the
 * "before" frame is by construction the frame the moment happened on rather
 * than one up to 1.4 seconds away.
 *
 * ── AND WHY THEY MAY NOT DECIDE ANYTHING ─────────────────────────────────────
 * The recording is the source of truth and the pixel pipeline reads it. These
 * are a second opinion asked where that reading was uncertain or silent, and
 * what comes back is a finding, not an edit. See services/studio/audit.js for
 * what is done with one, and intent.js for the line neither may cross: the
 * model may name, veto or reframe a press; it may not invent one into the
 * timeline behind the creator's back.
 */

/** A verdict this product knows how to act on. Anything else is "unclear". */
/**
 * "content" is the verdict that stops a stranger's mouse moving our camera: the
 * position is inside a video or screenshot on the page, so whatever happened
 * there was recorded on somebody else's screen. See PRESS_ARBITER.
 */
const VERDICTS = new Set(["press", "hover", "scroll", "settling", "content", "unclear"]);
/**
 * Which kind of activation a press was. The camera treats them differently — a
 * drag wants the shot to travel, a text selection wants it to stay put, a menu
 * wants room for what opened — so this is a field the edit acts on rather than
 * a label for a report. Anything unrecognised becomes "other", which behaves
 * exactly as a press with no kind attached always did.
 */
const INTERACTIONS = new Set(["click", "menu", "type", "drag", "resize", "submit", "select", "other", "none"]);
const KINDS = new Set(["content", "action", "result", "scroll", "loading", "noise", "unclear"]);

/**
 * Was there a press at this moment, and on what?
 *
 * @param {{before: string, after: string}} pair  two frame files on local disk
 * @param {{t: number, x: number, y: number}} at  where the pointer was resting
 * @returns {Promise<object|null>} null when the call failed or the answer was unusable
 */
export async function arbitratePress({ frames, at, spend = newSpend() }) {
  if (!Array.isArray(frames) || frames.length < 2) return null;

  /**
   * ── THE MODEL IS TOLD WHEN EACH FRAME IS, NOT JUST THAT THERE ARE SEVERAL ──
   * Without the offsets it can see that things differ and not how far apart
   * they are, and the whole question is about time: whether a change lasted,
   * whether a page was already loading before the moment, how long the result
   * took to arrive. The list below is the key to the images that follow it.
   */
  const legend = frames
    .map((f, i) => `  ${i + 1}. ${f.offset >= 0 ? "+" : ""}${f.offset.toFixed(2)}s`)
    .join("\n");

  const text =
    `${PRESS_ARBITER}\n\n` +
    `The pointer was resting at ${(num(at.x) * 100).toFixed(1)}% across and ${(num(at.y) * 100).toFixed(1)}% down the frame.\n` +
    `The moment in question is 0.00s. The ${frames.length} images that follow are, in order:\n${legend}`;

  const parts = [{ text }];
  for (const f of frames) parts.push(await imagePart(f.file));

  const json = await ask({
    parts,
    spend,
    label: `arbitratePress at ${num(at.t).toFixed(2)}s`,
    maxOutputTokens: 1024,
  });
  if (!json) return null;

  const verdict = VERDICTS.has(json.verdict) ? json.verdict : "unclear";
  const settled = Number(json.settled_by);
  return {
    t: round3(num(at.t)),
    verdict,
    // Only meaningful on a press; forced to "none" otherwise rather than
    // trusted, because a model that has just said "hover" naming a drag is
    // contradicting itself and the verdict is the harder judgement.
    interaction:
      verdict === "press" && INTERACTIONS.has(json.interaction_type) && json.interaction_type !== "none"
        ? json.interaction_type
        : verdict === "press"
          ? "other"
          : "none",
    // An answer with no confidence attached is not a confident answer.
    confidence: clamp(num(json.confidence, 0.5), 0, 1),
    target: str(json.target, 80),
    target_type: str(json.target_type, 24) || "none",
    target_bbox: box(json.target_bbox),
    result_bbox: box(json.result_bbox),
    typed: str(json.typed, 120),
    /**
     * How long the result took to appear, which is how long the camera should
     * stay. Clamped to the window it could have been observed in: a number
     * outside that is the model guessing rather than reading.
     */
    settled_by: Number.isFinite(settled) ? clamp(settled, 0, 6) : null,
    what: str(json.what_happened, 160),
  };
}

/**
 * Which of several pointers seen in a recording is the creator's own.
 *
 * Every sighting is cut from the recording with its pointer boxed, and the
 * model is asked about all of them in one request, grouped by pointer, so it
 * judges each against the others. See locate.js chooseIdentity for why this
 * exists and prompts.js POINTER_IDENTITY for the question.
 *
 * ── ONE ANSWER, OR NONE ──────────────────────────────────────────────────────
 * `own` is set only when exactly one group was called the computer's own with
 * some confidence. Two "own" answers is the model unable to tell — or the same
 * pointer offered twice, as an arrow and as a hand — and guessing between them
 * here would hide that from the fallback that has more to go on.
 *
 * @param {object} o
 * @param {string} o.video
 * @param {string} o.dir       where the marked frames are written
 * @param {Array}  o.rivals    [{ key, heightPx, sightings: [{ t, x, y }] }], in source pixels
 * @returns {Promise<{ own: number|null, verdicts: Array }|null>}
 */
export async function identifyPointer({ video, dir, rivals, spend = newSpend() }) {
  await fsp.mkdir(dir, { recursive: true });
  const parts = [{ text: POINTER_IDENTITY }];
  let shown = 0;
  for (let g = 0; g < rivals.length; g++) {
    const letter = "ABC"[g];
    for (let i = 0; i < rivals[g].sightings.length; i++) {
      const file = path.join(dir, `pointer_${letter}${i}.jpg`);
      if (!(await boxedFrame(video, file, rivals[g].sightings[i], rivals[g].heightPx))) continue;
      parts.push({ text: `Group ${letter}, image ${i + 1}:` });
      parts.push(await imagePart(file));
      shown++;
    }
  }
  if (!shown) return null;

  const json = await ask({ parts, spend, label: "identifyPointer", maxOutputTokens: 1024 });
  if (!Array.isArray(json?.groups)) return null;
  const KINDS = new Set(["own", "content", "none", "unsure"]);
  const verdicts = json.groups
    .map((v) => ({
      index: "ABC".indexOf(String(v?.group || "").trim().toUpperCase()),
      kind: KINDS.has(v?.kind) ? v.kind : "unsure",
      confidence: clamp(num(v?.confidence, 0.5), 0, 1),
      why: str(v?.why, 160),
    }))
    .filter((v) => v.index >= 0 && v.index < rivals.length);
  const own = verdicts.filter((v) => v.kind === "own" && v.confidence >= 0.6);
  return { own: own.length === 1 ? own[0].index : null, verdicts };
}

/**
 * One frame with a box around the pointer at a sighting, or false.
 * The hotspot is the tip, and the glyph hangs below and to the right of it.
 */
async function boxedFrame(video, file, s, heightPx) {
  const hp = Math.max(8, num(heightPx, 18));
  const mark = { x: s.x - hp * 0.9, y: s.y - hp * 0.7, w: hp * 2.6, h: hp * 2.7 };
  try {
    await extractFrameAt(video, file, s.t, { longEdge: 1280, mark });
    return (await fsp.stat(file)).size > 0;
  } catch {
    return false;
  }
}

/**
 * For each stretch of the pointer's path, whether it was the creator's pointer
 * or one inside a picture on the page — judged against a sighting known to be
 * theirs. See locate.js withoutStrangers and prompts.js POINTER_RUNS.
 *
 * @param {object} o
 * @param {{t,x,y}} o.reference   a sighting of the creator's pointer, source pixels
 * @param {Array}   o.runs        [{ sightings: [{ t, x, y }] }], source pixels
 * @param {number}  o.heightPx    the pointer's height, for the box
 * @returns {Promise<Array<{kind, confidence, why}|null>|null>} one per run, in order
 */
export async function judgeRuns({ video, dir, reference, runs, heightPx, spend = newSpend() }) {
  await fsp.mkdir(dir, { recursive: true });
  const ref = path.join(dir, "run_R.jpg");
  if (!(await boxedFrame(video, ref, reference, heightPx))) return null;
  const parts = [{ text: POINTER_RUNS }, { text: "Image R — the computer's own pointer:" }, await imagePart(ref)];
  let shown = 0;
  for (let g = 0; g < runs.length; g++) {
    for (let i = 0; i < runs[g].sightings.length; i++) {
      const file = path.join(dir, `run_${g + 1}_${i}.jpg`);
      if (!(await boxedFrame(video, file, runs[g].sightings[i], heightPx))) continue;
      parts.push({ text: `Group ${g + 1}, image ${i + 1}:` });
      parts.push(await imagePart(file));
      shown++;
    }
  }
  if (!shown) return null;

  const json = await ask({ parts, spend, label: "judgeRuns", maxOutputTokens: 2048 });
  if (!Array.isArray(json?.groups)) return null;
  /**
   * The reference is the pixels' best guess at the creator's pointer, and every
   * verdict below is "the same as R or not". If the model sees R inside a
   * picture, the whole comparison is upside down; nothing is acted on.
   */
  if (process.env.STUDIO_TRACE_RUNS) {
    // Where the pictures the model was shown are, so they can be looked at.
    console.log("[studio] trace: stranger check reference at " + num(reference.t).toFixed(2) + "s (" + Math.round(num(reference.x)) + "," +
      Math.round(num(reference.y)) + "), model said reference " + (json.reference || "?") + "; images in " + dir);
  }
  if (json.reference === "content") {
    console.warn("[studio] the reference sighting for the stranger check looks like somebody else's pointer; no verdicts used");
    // Said apart from every other failure, so the caller can try another.
    return "reference";
  }
  const KINDS = new Set(["own", "content", "none", "unsure"]);
  const out = runs.map(() => null);
  for (const v of json.groups) {
    const i = Math.round(num(v?.group, 0)) - 1;
    if (i < 0 || i >= runs.length) continue;
    out[i] = { kind: KINDS.has(v?.kind) ? v.kind : "unsure", confidence: clamp(num(v?.confidence, 0.5), 0, 1), why: str(v?.why, 160) };
  }
  return out;
}

/**
 * What the pointer's tip was on, at each of several moments — one crop each,
 * the tip marked, all asked in one request. See prompts.js POINTER_TARGET and
 * vig.js, which uses the answers to name what each rest was on.
 *
 * @param {object} o
 * @param {Array<{t,x,y}>} o.targets  source pixels
 * @param {number} o.W, o.H           the recording's size
 * @returns {Promise<Array<{label, type, confidence}|null>>} one per target, in order
 */
export async function pointerTargets({ video, dir, targets, W, H, spend = newSpend() }) {
  if (!Array.isArray(targets) || !targets.length) return [];
  await fsp.mkdir(dir, { recursive: true });
  const parts = [{ text: POINTER_TARGET }];
  const shown = [];
  // Big enough to hold the element and its neighbours, small enough that one
  // row of a list is many pixels tall once the model has it.
  const cw = Math.min(W, 640);
  const ch = Math.min(H, 360);
  for (let i = 0; i < targets.length; i++) {
    const s = targets[i];
    const x = num(s.x);
    const y = num(s.y);
    const file = path.join(dir, `target_${i}.jpg`);
    try {
      await extractFrameAt(video, file, num(s.t), {
        longEdge: 960,
        mark: { x: x - 7, y: y - 7, w: 14, h: 14, t: 2 },
        crop: { x: clamp(x - cw / 2, 0, W - cw), y: clamp(y - ch / 2, 0, H - ch), w: cw, h: ch },
      });
      if (!((await fsp.stat(file)).size > 0)) continue;
    } catch {
      continue;
    }
    parts.push({ text: `Image ${shown.length + 1}:` });
    parts.push(await imagePart(file));
    shown.push(i);
  }
  const out = targets.map(() => null);
  if (!shown.length) return out;
  const json = await ask({ parts, spend, label: "pointerTargets", maxOutputTokens: 4096 });
  for (const v of Array.isArray(json?.targets) ? json.targets : []) {
    const k = Math.round(num(v?.image, 0)) - 1;
    if (k < 0 || k >= shown.length) continue;
    out[shown[k]] = { label: str(v?.label, 80), type: str(v?.type, 20) || "none", confidence: clamp(num(v?.confidence, 0.5), 0, 1) };
  }
  return out;
}

/**
 * Was this a click — asked with the measured facts, not from stills alone.
 * See prompts.js PRESS_JUDGE and judge.js.
 *
 * @param {object} o
 * @param {Array<{file: string, label: string}>} o.images  in the order described
 * @param {string} o.facts   the measurement, as the lines the prompt refers to
 * @returns {Promise<{clicked, confidence, target, evidence}|null>}
 */
export async function judgePress({ images, facts, spend = newSpend(), label = "judgePress", thinkingBudget = 0 }) {
  const parts = [{ text: PRESS_JUDGE + "\n\nFACTS\n" + facts + "\n\nIMAGES — the magenta rectangle marks the same place in every one:" }];
  for (let i = 0; i < images.length; i++) {
    parts.push({ text: `Image ${i + 1}: ${images[i].label}` });
    parts.push(await imagePart(images[i].file));
  }
  let json = null;
  try {
    const res = await generateJson({ model: VISION_MODEL, parts, maxOutputTokens: 4096, thinkingBudget });
    spend.usd += res.usd;
    spend.calls += 1;
    json = res.json;
  } catch (err) {
    spend.usd += num(err?.usd);
    spend.failed += 1;
    console.warn(`[studio] ${label} failed: ${err?.message}`);
    return null;
  }
  const clicked = ["yes", "no", "unsure"].includes(json?.clicked) ? json.clicked : "unsure";
  return {
    clicked,
    confidence: clamp(num(json?.confidence, 0.5), 0, 1),
    target: str(json?.target, 60),
    evidence: str(json?.evidence, 240),
  };
}

/**
 * Something changed here and nothing in the recording explains it. What was it?
 *
 * @param {{before: string, after: string}} pair
 * @param {{t: number}} at
 */
export async function auditChange({ pair, at, spend = newSpend() }) {
  if (!pair?.before || !pair?.after) return null;

  const text =
    `${CHANGE_AUDITOR}\n\n` +
    `This is ${num(at.t).toFixed(2)} seconds into the recording. ` +
    `The first image is BEFORE the change, the second is AFTER it.`;

  const json = await ask({
    parts: [{ text }, await imagePart(pair.before), await imagePart(pair.after)],
    spend,
    label: `auditChange at ${num(at.t).toFixed(2)}s`,
    maxOutputTokens: 1024,
  });
  if (!json) return null;

  const kind = KINDS.has(json.kind) ? json.kind : "unclear";
  return {
    t: round3(num(at.t)),
    kind,
    /**
     * ── THE MODEL MAY NOT SAY "WORTH WATCHING" ABOUT A SPINNER ──────────────
     * It is asked to be strict and it mostly is, but "worth_camera: true" on a
     * kind of "loading" or "noise" is self-contradictory and the answer should
     * not need a human to notice. The kind is the harder judgement of the two
     * and the one the schema describes in most detail, so the kind wins.
     */
    worth: json.worth_camera === true && (kind === "action" || kind === "result"),
    confidence: clamp(num(json.confidence, 0.5), 0, 1),
    label: str(json.label, 48),
    what: str(json.what_happened, 160),
    bbox: box(json.bbox),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   9. What is still wrong
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
    `BLURS:\n${describe(timeline.blurs, (b) => `${b.id} ${b.start.toFixed(2)}–${b.end.toFixed(2)}s ${b.kind} ${b.label}`)}`;

  const json = await ask({ model: TEXT_MODEL, parts: [{ text }], spend, label: "reviewEdit", maxOutputTokens: 4096 });
  if (!json) return { verdict: "", suggestions: [] };

  const OPS = ["add_cut", "remove_cut", "add_zoom", "adjust_zoom", "remove_zoom", "add_blur", "adjust_step"];
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
  readFrames, detectSteps, planZooms, spaceZooms, findSensitive, writeCaptions, writeNarration, reviewEdit,
  arbitratePress, auditChange,
};

/**
 * witness.js — a second pair of eyes on the clicks, that never decides.
 *
 * ── WHERE THIS SITS ──────────────────────────────────────────────────────────
 * The camera moves on the pixel pipeline's clicks (events.js confirmClicks),
 * which on the labelled recordings catches every real click with no false
 * ones. That is a measurement of the recordings somebody has labelled, and the
 * next website is not one of them. So after the edit exists, a model watches
 * the whole recording as video and lists every click it sees, and the two are
 * compared:
 *
 *   both saw it           a confirmation, logged
 *   only the model did    a question for the creator — offered in the Review
 *                         panel as "possible missed click", one button to zoom
 *   only the pipeline did logged; the pipeline has been right about its own
 *                         zooms every time it has been measured, the model has
 *                         not, so this does not argue with the creator's edit
 *
 * ── WHY THE MODEL NEVER DECIDES ─────────────────────────────────────────────
 * Measured on 2026-09-24 (scripts/pointerTest/videojudge.mjs, 17 labelled
 * clicks): Gemini 2.5 Pro watching the video found 16 at the right time, and
 * also 12 that were never made — nearly all of them an embedded demo's own
 * clicks, which look exactly like a person's. Its positions were ~200px off.
 * So its TIMING is used, its position never is, and a claim survives only
 * where the pipeline's own record shows the creator's pointer — the verified
 * one, with somebody else's taken out (locate.js withoutStrangers) — resting
 * at that moment. A click claimed while the creator's pointer was hidden or
 * moving through is the demo's, and is dropped with the reason logged.
 *
 * STUDIO_WITNESS=off | shadow (default: log only) | suggest (log and offer)
 *
 * ── SHADOW BY DEFAULT, AND WHY ──────────────────────────────────────────────
 * On the seven labelled recordings of 2026-09-24 the camera already zoomed
 * every real click, so the witness had nothing to rescue — and its first
 * version offered three "possible missed clicks" that were all a demo's own.
 * An offer a creator must dismiss is a cost. So it watches and logs every
 * agreement and disagreement on real recordings first; `suggest` is for when
 * those logs show its offers are worth a click.
 */
import path from "path";
import fsp from "fs/promises";
import { makeWatchCopy } from "../media/ffmpeg.js";
import { generateJson, PROVIDER, MODEL } from "../ai/provider.js";
import { WITNESS } from "./prompts.js";
import { newId } from "./timeline.js";
import { containingBox, levelForBox } from "./events.js";

export const WITNESS_MODE = String(process.env.STUDIO_WITNESS || "shadow").trim().toLowerCase();
/**
 * The pro model on Vertex, where 2.5 is still served; on AI Studio the same
 * model the rest of the studio uses (services/ai/provider.js MODEL), because
 * AI Studio has retired 2.5 for new accounts. STUDIO_WITNESS_MODEL wins.
 */
const WITNESS_MODEL = String(process.env.STUDIO_WITNESS_MODEL || (PROVIDER === "aistudio" ? MODEL.video : "gemini-2.5-pro")).trim();
/** Frames a second the model samples. 10 found clicks to a tenth of a second. */
const WITNESS_FPS = Math.max(1, Math.min(24, Number(process.env.STUDIO_WITNESS_FPS) || 10));
/** The thinking it may do; the measured run used this much. */
const WITNESS_THINK = 16384;
/** Largest watch copy sent inline; past this the witness stands down. */
const WITNESS_MAX_BYTES = 18 * 1024 * 1024;

/** How far apart in time the two witnesses may put the same click. */
const SAME_CLICK = 0.8;
/**
 * How far, as a share of the frame's width, the model's claimed position may
 * be from where the pointer rested: its measured errors were ~200px on a
 * 1920 frame and once 475px; a demo's click across the page is further.
 */
const WITNESS_REACH = 0.3;
/** The window around a claimed click in which the creator's pointer must rest. */
const REST_BEFORE = 0.6;
const REST_AFTER = 0.4;
/** How far, in pixels of a 1920-wide picture, a resting pointer may wander. */
const REST_SPREAD = 28;
/** The camera move offered, matching audit.js LEAD and HOLD. */
const LEAD = 0.45;
const HOLD = 1.5;

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const round3 = (v) => Math.round(num(v) * 1000) / 1000;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * The model's list of clicks, from the whole recording.
 * @returns {Promise<{ clicks: Array<{t,x,y,target,confidence}>, pointer: string, usd: number }|null>}
 */
export async function watchForClicks({ video, workDir, duration }) {
  const copy = path.join(workDir, "witness.mp4");
  await makeWatchCopy(video, copy, { fps: WITNESS_FPS, duration });
  const bytes = await fsp.readFile(copy);
  if (bytes.length > WITNESS_MAX_BYTES) {
    console.log("[studio] witness: the recording is too long to send (" + (bytes.length / 1e6).toFixed(1) + "MB); not watched");
    return null;
  }
  const res = await generateJson({
    model: WITNESS_MODEL,
    label: "witness",
    parts: [
      { inlineData: { mimeType: "video/mp4", data: bytes.toString("base64") }, videoMetadata: { fps: WITNESS_FPS } },
      { text: WITNESS(duration, WITNESS_FPS) },
    ],
    maxOutputTokens: 16384,
    temperature: 0,
    thinkingBudget: WITNESS_THINK,
  });
  const clicks = (Array.isArray(res.json?.clicks) ? res.json.clicks : [])
    .map((c) => ({ t: round3(num(c.t, NaN)), x: clamp(num(c.x, 0.5), 0, 1), y: clamp(num(c.y, 0.5), 0, 1), target: String(c.target || "").slice(0, 60), confidence: clamp(num(c.confidence, 0.5), 0, 1) }))
    .filter((c) => Number.isFinite(c.t) && c.t >= 0 && (!duration || c.t <= duration));
  return { clicks, pointer: String(res.json?.pointer || "").slice(0, 120), usd: res.usd };
}

/** Where the creator's pointer rested around `t`, from the timeline's record of it, or null. */
function restingAt(timeline, t, W) {
  const seen = (timeline.captured || []).filter((p) => num(p.t) >= t - REST_BEFORE && num(p.t) <= t + REST_AFTER);
  if (seen.length < 2) return null;
  const xs = seen.map((p) => num(p.x)).sort((a, b) => a - b);
  const ys = seen.map((p) => num(p.y)).sort((a, b) => a - b);
  const mx = xs[xs.length >> 1];
  const my = ys[ys.length >> 1];
  const H = W * num(timeline.source?.height, 1080) / Math.max(1, num(timeline.source?.width, 1920));
  const spread = Math.max(...seen.map((p) => Math.hypot((num(p.x) - mx) * W, (num(p.y) - my) * H)));
  return spread <= REST_SPREAD * (W / 1920) * 2.5 ? { x: mx, y: my } : null;
}

/**
 * The two witnesses, side by side.
 * @returns {{ agreed: Array, onlyModel: Array, onlyPipeline: Array, dropped: Array }}
 */
export function compareWitness(clicks, timeline) {
  const W = num(timeline.source?.width, 1920);
  const events = (timeline.events || []).filter((e) => e.type === "click" || e.type === "dblclick");
  const zoomed = events.filter((e) => e.zoomable);
  const agreed = [];
  const onlyModel = [];
  const dropped = [];
  const matched = new Set();

  for (const c of clicks) {
    const hit = zoomed.find((e) => Math.abs(num(e.t) - c.t) <= SAME_CLICK && !matched.has(e));
    if (hit) { matched.add(hit); agreed.push({ ...c, event: hit.id, at: hit.t }); continue; }
    const rest = restingAt(timeline, c.t, W);
    if (!rest) { dropped.push({ ...c, why: "the creator's pointer was not resting anywhere in the picture then — most likely a click inside a video or demo" }); continue; }
    /**
     * ── TWO WITNESSES, ONE MOMENT ──────────────────────────────────────────
     * Measured on the labelled recordings: with only "the creator's pointer
     * was resting" asked of a claim, three of three offers were the embedded
     * YouTube demo's own click on its search button, made while the creator's
     * pointer sat parked elsewhere on the page. Every real miss so far was a
     * candidate the pipeline FOUND and refused — "the page was scrolling",
     * "nothing came of it" — at the place the pointer rested. So a claim is
     * only a question when the pipeline saw a candidate there too, and when
     * the model put it within reach of that place (its positions run ~200px
     * off, never the width of the page off).
     */
    const refused = events.find((e) => !e.zoomable && Math.abs(num(e.t) - c.t) <= SAME_CLICK && Math.hypot(num(e.x) - rest.x, num(e.y) - rest.y) <= 0.05);
    const far = Math.hypot(c.x - rest.x, (c.y - rest.y) * (num(timeline.source?.height, 1080) / Math.max(1, W))) ;
    const claimed = "claimed at (" + Math.round(c.x * W) + "," + Math.round(c.y * num(timeline.source?.height, 1080)) + "), the pointer rested at (" + Math.round(rest.x * W) + "," + Math.round(rest.y * num(timeline.source?.height, 1080)) + ")";
    if (!refused) {
      dropped.push({ ...c, why: "the camera saw no candidate press where the pointer rested; " + claimed });
      continue;
    }
    if (refused.basis === "in-picture" || refused.basis === "in-media") {
      dropped.push({ ...c, why: "the pointer there was judged part of a picture on the page: " + (refused.why || refused.basis) });
      continue;
    }
    if (far > WITNESS_REACH) {
      dropped.push({ ...c, why: "the model put it too far from where the pointer rested; " + claimed });
      continue;
    }
    onlyModel.push({ ...c, x: rest.x, y: rest.y, refused: { id: refused.id, t: refused.t, why: refused.why || refused.basis || "" } });
  }
  const onlyPipeline = zoomed.filter((e) => !matched.has(e)).map((e) => ({ id: e.id, t: e.t, x: e.x, y: e.y, basis: e.basis }));
  return { agreed, onlyModel, onlyPipeline, dropped };
}

/** The model-only clicks, as suggestions the Review panel can apply. */
export function witnessSuggestions(onlyModel, { duration = 0 } = {}) {
  return onlyModel.map((c) => {
    const rect = { x: clamp(c.x - 0.06, 0, 0.88), y: clamp(c.y - 0.04, 0, 0.92), w: 0.12, h: 0.08 };
    const level = levelForBox(rect);
    const frame = containingBox([rect], level);
    const label = c.target || "this control";
    return {
      id: newId("sg"),
      title: "Possible missed click on " + label,
      why:
        "A second check that watched the whole recording saw a click here at " + c.t.toFixed(1) + "s" +
        (c.refused ? ", where the camera held back because " + c.refused.why : ", where the camera saw nothing") +
        ". Your pointer was resting on it then. Apply to zoom on it.",
      severity: "medium",
      source: "witness",
      change: {
        op: "add_zoom",
        id: "",
        start: round3(Math.max(0, c.t - LEAD)),
        end: round3(duration ? Math.min(duration, c.t + HOLD) : c.t + HOLD),
        bbox: [frame.x, frame.y, frame.w, frame.h],
        level,
        text: label,
      },
    };
  });
}

/**
 * The whole witness pass, for the review job.
 * @returns {Promise<{ suggestions: Array, summary: object|null, usd: number }>}
 */
export async function witnessPass({ video, workDir, timeline, duration }) {
  if (WITNESS_MODE === "off") return { suggestions: [], summary: null, usd: 0 };
  let seen = null;
  try {
    seen = await watchForClicks({ video, workDir, duration });
  } catch (err) {
    console.warn("[studio] witness failed: " + String(err?.message || err).slice(0, 200));
    return { suggestions: [], summary: null, usd: num(err?.usd) };
  }
  if (!seen) return { suggestions: [], summary: null, usd: 0 };
  const cmp = compareWitness(seen.clicks, timeline);
  console.log(
    "[studio] witness (" + WITNESS_MODEL + "): " + seen.clicks.length + " click(s) seen — " +
      cmp.agreed.length + " agree with the camera, " + cmp.onlyModel.length + " it missed, " +
      cmp.onlyPipeline.length + " the witness did not see, " + cmp.dropped.length + " set aside"
  );
  for (const c of cmp.onlyModel) console.log("[studio]   possible missed click at " + c.t.toFixed(2) + "s on \"" + c.target + "\"" + (c.refused ? " (refused: " + c.refused.why + ")" : ""));
  for (const c of cmp.dropped) console.log("[studio]   set aside " + c.t.toFixed(2) + "s \"" + c.target + "\": " + c.why);
  for (const e of cmp.onlyPipeline) console.log("[studio]   the witness did not see the camera's click at " + num(e.t).toFixed(2) + "s (" + (e.basis || "") + ")");
  const suggestions = WITNESS_MODE === "suggest" ? witnessSuggestions(cmp.onlyModel, { duration }) : [];
  return {
    suggestions,
    usd: seen.usd,
    summary: {
      model: WITNESS_MODEL,
      pointer: seen.pointer,
      seen: seen.clicks.length,
      agreed: cmp.agreed.length,
      missed: cmp.onlyModel.map((c) => ({ t: c.t, target: c.target })),
      unseen: cmp.onlyPipeline.map((e) => ({ t: e.t, basis: e.basis })),
      set_aside: cmp.dropped.length,
    },
  };
}

export default { witnessPass, watchForClicks, compareWitness, witnessSuggestions, WITNESS_MODE };

/**
 * audit.js: the pixel pipeline's work, checked against the recording.
 *
 * ── WHAT THIS IS NOT ─────────────────────────────────────────────────────────
 * It is not a second click detector. The clicks come from events.js reading the
 * pointer, and locate.js finding it by its shape in every frame, and that stays
 * the source of truth. A model cannot compete there and should not be asked to:
 * a press is a tenth of a second of pointer behaviour, the frames are sampled
 * every two seconds, and the moment is literally between them. Sampling thirty
 * times finer to see it would cost thirty times the frames to answer a question
 * the template matcher already answers to the pixel.
 *
 * ── WHAT IT IS ───────────────────────────────────────────────────────────────
 * The check that nothing was missed. The pipeline decides; this asks the
 * recording whether the decision holds, at the small number of moments where
 * that is genuinely in doubt, and reports what it finds as something the
 * creator can accept or ignore.
 *
 * ── THE IDEA THAT MAKES IT AFFORDABLE ────────────────────────────────────────
 * "Find every click we missed" is unbounded and mostly pointless. Find every
 * click WORTH A CAMERA MOVE is bounded, because every one of those produced a
 * visible change on screen — that is what makes it worth watching. A press that
 * changed nothing is a press nobody wants a zoom on.
 *
 * So the audit set is arithmetic, not a model call:
 *
 *     every significant change on screen
 *   − every change an event already explains
 *   = the moments worth paying to look at
 *
 * The left-hand side is already computed. sync.js readScreen() measures what
 * changed, cell by cell, twelve times a second, with spinners and animations
 * discounted. The right-hand side is the event list. The difference is small —
 * a handful of moments on a real demo — and it is the whole candidate set.
 *
 * ── AND WHAT FALLS OUT OF IT FOR FREE ────────────────────────────────────────
 * The same difference contains moments with no press behind them at all: a
 * result arriving, an error, a value updating. No click rule could ever find
 * those, because there is no click. They are the camera moves the pipeline is
 * structurally unable to propose, and they cost nothing extra to ask about.
 *
 * ── THE LINE ─────────────────────────────────────────────────────────────────
 * intent.js states it and this file keeps it: what is invented may never be an
 * EVENT. Nothing here writes a click into the timeline. It proposes camera
 * moves, it annotates evidence already on the record, and every proposal is a
 * button somebody presses. A demo that confidently shows a button being pressed
 * that was never pressed is not an edit, it is a fabrication.
 */
import path from "path";
import fsp from "fs/promises";
import { extractFrameAt } from "../media/ffmpeg.js";
import { newSpend, arbitratePress, auditChange } from "./vision.js";
import { newId, clampRect } from "./timeline.js";
import { containingBox, levelForBox, CLICKABLE_SHAPES } from "./events.js";

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round3 = (v) => Math.round(num(v) * 1000) / 1000;
const round4 = (v) => Math.round(num(v) * 10000) / 10000;

/**
 * Every judgement in this file, in one place, because every one of them will
 * need re-tuning against real recordings and none should be found buried in a
 * condition three functions down. Same reasoning as events.js RULES.
 */
export const AUDIT = {
  /**
   * Share of the screen that has to change before the moment is worth noticing.
   *
   * Calibrated against the numbers events.js already measured on real
   * recordings: a row highlighting covers 0.006, a menu opening about 0.08, a
   * settings pane swapping 0.44, and RULES.navCover calls 0.12 a navigation.
   * Four per cent sits below a menu and well above a highlight, which is the
   * gap this wants: anything a viewer would notice, nothing they would not.
   */
  changeCover: 0.04,
  /**
   * ...and it must stand out from what the page is doing anyway.
   *
   * A page with a video playing in it, or a table refreshing on a timer,
   * changes constantly. Against a flat threshold every second of that is a
   * candidate and the audit becomes three hundred model calls about nothing.
   * Measured against the local baseline instead, a busy page raises its own bar
   * and only a real step above it counts.
   */
  standOut: 2.2,
  /** The window the baseline is measured over, in seconds either side. */
  baselineWindow: 2.5,
  /** Changes closer together than this are one moment, not several. */
  spanGap: 0.4,
  /**
   * How long before a change an event may sit and still explain it.
   *
   * A press and its consequence are not simultaneous: the click lands, the
   * request goes, the page paints. events.js allows up to 520ms for the
   * reaction it uses to FIND a press; explaining one after the fact can be more
   * generous, because a page that took a second to respond is still that
   * press's doing and proposing a second camera move for it would be wrong.
   */
  explainBefore: 1.6,
  /** And how long after, for an event timestamped on the consequence itself. */
  explainAfter: 0.45,
  /** A zoom already covering the moment means the camera is there. Plus slack. */
  zoomPad: 0.5,
  /**
   * The most moments one audit will pay to look at.
   *
   * Two frames and one call each, so this is the bill. Twenty-four is about
   * fifty frames — a sixth of what the uniform two-second grid costs on a ten
   * minute demo — and a recording with more than twenty-four unexplained
   * changes has something else wrong with it that more model calls will not fix.
   */
  maxChecks: 24,
  /** Seconds before the moment the BEFORE frame is taken. */
  before: 0.16,
  /** ...and after the moment, for the AFTER frame. */
  after: 0.6,
  /**
   * Confidence below which a finding is recorded but not offered.
   *
   * The model is asked to answer "unclear" and to be honest about confidence,
   * which it only does if a low number actually costs it something. It does:
   * below this the finding goes into the record for anyone reading the log and
   * never becomes a button.
   */
  accept: 0.6,
};

/* ────────────────────────────────────────────────────────────────────────────
   Part one: arithmetic. What changed, and what explains it.
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The moments the screen visibly changed.
 *
 * Pure arithmetic over what sync.js already measured — no model, no frames, no
 * network. Worth running on its own: a recording whose change list bears no
 * relation to its event list has a tracking problem, and that is visible here
 * before a single call is paid for.
 *
 * @param {object} screen  as readScreen() returns it: { fps, motion: [{t, cover, x, y, w, h}] }
 * @returns {Array<{t, cover, x, y, w, h}>} peaks, in time order
 */
export function changeMoments(screen, { duration = 0 } = {}) {
  const series = screen?.motion;
  if (!Array.isArray(series) || series.length < 3) return [];

  const at = (i) => series[clamp(i, 0, series.length - 1)];
  const fps = num(screen.fps, 12) || 12;
  const half = Math.max(1, Math.round(AUDIT.baselineWindow * fps));

  /**
   * ── THE BASELINE IS A MEDIAN, NOT A MEAN ──────────────────────────────────
   * The window around a real change contains that change, and an average
   * carries it into its own baseline — so the bigger the event, the higher the
   * bar it has to clear. The middle value of the window is unmoved by a spike
   * in it, which is the property wanted here.
   */
  const baseline = (i) => {
    const vs = [];
    for (let j = i - half; j <= i + half; j++) vs.push(num(at(j).cover));
    vs.sort((a, b) => a - b);
    return vs[vs.length >> 1];
  };

  const spans = [];
  let open = null;
  for (let i = 0; i < series.length; i++) {
    const m = series[i];
    const cover = num(m.cover);
    const base = Math.max(0.004, baseline(i));
    const hot = cover >= AUDIT.changeCover && cover >= base * AUDIT.standOut;

    if (!hot) continue;
    if (open && m.t - open.last <= AUDIT.spanGap) {
      open.last = num(m.t);
      if (cover > open.cover) {
        open.cover = cover;
        open.t = num(m.t);
        open.box = { x: num(m.x), y: num(m.y), w: num(m.w), h: num(m.h) };
      }
      continue;
    }
    if (open) spans.push(open);
    open = {
      t: num(m.t),
      last: num(m.t),
      cover,
      box: { x: num(m.x), y: num(m.y), w: num(m.w), h: num(m.h) },
    };
  }
  if (open) spans.push(open);

  return spans
    .filter((s) => !duration || s.t <= duration)
    .map((s) => ({
      t: round3(s.t),
      cover: round3(s.cover),
      ...(() => {
        const r = clampRect({ x: s.box.x, y: s.box.y, w: s.box.w || 0.2, h: s.box.h || 0.2 });
        return { x: round4(r.x), y: round4(r.y), w: round4(r.w), h: round4(r.h) };
      })(),
    }));
}

/** The events that could be responsible for something changing at `t`. */
function eventNear(events, t) {
  for (const e of events || []) {
    const dt = t - num(e.t);
    if (dt < -AUDIT.explainAfter || dt > AUDIT.explainBefore) continue;
    if (e.type === "click" || e.type === "dblclick" || e.type === "rightclick") return "a press at " + num(e.t).toFixed(2) + "s";
    if (e.type === "scroll") return "scrolling";
    if (e.type === "type") return "typing";
    if (e.type === "drag") return "a drag";
    if (e.type === "nav") return "a screen change already recorded";
  }
  return "";
}

/** Whether the camera is already on this moment. */
function zoomOver(zooms, t) {
  return (zooms || []).some((z) => t >= num(z.start) - AUDIT.zoomPad && t <= num(z.end) + AUDIT.zoomPad);
}

/**
 * The moments nothing in the edit accounts for.
 *
 * This is the recall check, and it is the reason the whole file exists. A
 * missing click is invisible by definition — it looks exactly like a moment
 * with nothing in it — so it cannot be found by looking at what was found. It
 * can only be found by looking at what the recording did and subtracting.
 *
 * @returns {Array<{t, cover, x, y, w, h}>} sorted by how much changed, biggest first
 */
export function unexplained(changes, { events = [], zooms = [], limit = AUDIT.maxChecks } = {}) {
  const out = [];
  for (const c of changes || []) {
    const by = eventNear(events, num(c.t));
    if (by) continue;
    if (zoomOver(zooms, num(c.t))) continue;
    out.push(c);
  }
  return out.sort((a, b) => num(b.cover) - num(a.cover)).slice(0, Math.max(0, limit));
}

/**
 * The presses whose verdict was a close call.
 *
 * ── THE PRECISION CHECK, AND WHY IT IS A SHORT LIST ──────────────────────────
 * confirmClicks() decides on positive evidence: the operating system drew a
 * hand, or the model named a control under the pointer. Where both agree —
 * either way — there is nothing to arbitrate and no reason to pay for a look.
 * What is left is the disagreements and the silences:
 *
 *   refused for a plain arrow      the gate's known blind spot. A site that
 *                                  draws a plain arrow over a real button —
 *                                  canvas apps, design tools, a lot of Electron
 *                                  — loses every zoom it should have had
 *   refused with nothing read      no hand, no control, no opinion: the gate
 *                                  falls through to "nothing says this was a
 *                                  press", which is a guess, not a reading
 *   allowed on one signal only     a hand with no control named, or a control
 *                                  named with no hand, where the other half of
 *                                  the evidence is missing rather than against
 *
 * On a clean recording that is a small fraction of the presses. On a canvas app
 * it may be most of them, which is exactly the case worth paying for.
 */
export function uncertainPresses(events, { limit = AUDIT.maxChecks } = {}) {
  const out = [];
  for (const e of events || []) {
    if (e.type !== "click" && e.type !== "dblclick") continue;
    // Nothing came of it, or the page was scrolling: those are not close calls,
    // they are readings, and events.js made them from evidence this cannot add
    // to. Asking the model would only invite it to overrule a fact.
    if (e.corroborated === false || e.scrolled === true) continue;

    // The same set confirmClicks() judges by, imported rather than restated:
    // two copies of "which glyphs mean pressable" would drift within a week.
    const hand = CLICKABLE_SHAPES.has(e.pointer_shape);
    const arrow = e.pointer_shape === "default";
    const onControl = e.on_control === true;
    const noControl = e.on_control === false;
    const unread = e.on_control == null;

    let why = "";
    if (e.zoomable === false && arrow && unread) why = "a plain arrow, and no frame was read here";
    else if (e.zoomable === false && arrow && noControl) why = "a plain arrow and no control named";
    else if (e.zoomable === false && !hand && unread) why = "nothing was read here either way";
    else if (e.zoomable === true && hand && !onControl) why = "a hand, but no control was named";
    else if (e.zoomable === true && onControl && arrow) why = "a control was named, but the pointer was a plain arrow";
    if (!why) continue;

    out.push({ id: e.id, t: num(e.t), x: num(e.x, 0.5), y: num(e.y, 0.5), zoomable: e.zoomable === true, why });
  }
  // The uncertain presses nearest the middle of the demo are no more valuable
  // than the ones at its edges, so the cap takes them in order and says how
  // many it left. Sorting by anything here would be inventing an importance.
  return out.slice(0, Math.max(0, limit));
}

/* ────────────────────────────────────────────────────────────────────────────
   Part two: the frames, and the second opinion
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The frame just before a moment and the frame shortly after it.
 *
 * ── THIS PAIR IS THE WHOLE TECHNIQUE ─────────────────────────────────────────
 * A hover, a scroll and a press are indistinguishable in one still and obvious
 * across two. And because the BEFORE frame is cut at the moment itself rather
 * than taken off a two-second grid, it is the screen the press actually landed
 * on — which the uniform sampling cannot promise: controlUnder() will judge a
 * press against a frame up to 1.4 seconds away, by which time the page it
 * landed on may already be gone.
 */
async function framePair(video, t, dir, { duration = 0 } = {}) {
  const before = Math.max(0, t - AUDIT.before);
  const after = Math.min(duration || Infinity, t + AUDIT.after);
  const tag = String(Math.round(t * 1000));
  const a = path.join(dir, `pair_${tag}_a.jpg`);
  const b = path.join(dir, `pair_${tag}_b.jpg`);
  try {
    await extractFrameAt(video, a, before);
    await extractFrameAt(video, b, after);
    return { before: a, after: b };
  } catch (err) {
    console.warn("[studio] could not cut a frame pair at " + t.toFixed(2) + "s: " + err.message);
    return null;
  }
}

/** A finding, in the one shape everything downstream reads. */
function finding(kind, o) {
  return {
    id: newId("f"),
    kind,
    t: round3(num(o.t)),
    confidence: clamp(num(o.confidence, 0.5), 0, 1),
    label: String(o.label || "").slice(0, 80),
    why: String(o.why || "").slice(0, 200),
    bbox: o.bbox ? [round4(o.bbox.x), round4(o.bbox.y), round4(o.bbox.w), round4(o.bbox.h)] : null,
    event: o.event || "",
    zoom: o.zoom || "",
    acted: o.acted !== false,
  };
}

/** The union of two boxes, either of which may be missing. */
function union(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x + a.w, b.x + b.w);
  const y1 = Math.max(a.y + a.h, b.y + b.h);
  return clampRect({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
}

/**
 * ── WHY A RESULT BOX IS NOT ALWAYS WORTH UNIONING IN ─────────────────────────
 * Framing the control together with what it produced is the good case: press
 * "New key", see the dialog, both in shot. But half the time the consequence is
 * the whole page, and a rect that holds a button and the entire screen is the
 * entire screen — a zoom of 1.0x, which is not a zoom. So the result only joins
 * the frame when it is small enough to leave a shot worth having.
 */
const RESULT_MAX = 0.55;

function frameFor(target, result) {
  if (!target) return result && result.w * result.h <= 0.9 ? result : null;
  if (!result) return target;
  const big = Math.max(result.w, result.h) > RESULT_MAX;
  return big ? target : union(target, result);
}

/* ────────────────────────────────────────────────────────────────────────────
   Part three: the audit
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Check the edit against the recording.
 *
 * @param {object}   o
 * @param {string}   o.video      the recording on local disk
 * @param {string}   o.workDir
 * @param {number}   o.duration
 * @param {Array}    o.events     the timeline's events, as the pipeline left them
 * @param {Array}    o.zooms      the timeline's zooms
 * @param {Array}    o.changes    changeMoments(), from the analysis
 * @param {Function} [o.onProgress]
 *
 * @returns {Promise<{ findings, suggestions, patches, checked, spend }>}
 *          `patches` annotate events with what was learned; they never move,
 *          add or remove one. `suggestions` are camera changes, and every one
 *          of them is a button rather than an edit.
 */
export async function auditEdit({
  video,
  workDir,
  duration = 0,
  events = [],
  zooms = [],
  changes = [],
  spend = newSpend(),
  onProgress = () => {},
}) {
  const dir = path.join(workDir, "audit");
  await fsp.mkdir(dir, { recursive: true }).catch(() => {});

  const presses = uncertainPresses(events);
  const gaps = unexplained(changes, { events, zooms });
  const total = presses.length + gaps.length;

  console.log(
    `[studio] audit: ${changes.length} screen change(s), ${gaps.length} unexplained, ` +
      `${presses.length} press(es) with an uncertain verdict`
  );
  if (!total) return { findings: [], suggestions: [], patches: [], checked: 0, spend };

  const findings = [];
  const patches = [];
  let done = 0;
  const step = () => onProgress(Math.min(1, ++done / total));

  /* ── The presses whose verdict was a close call ─────────────────────────── */
  for (const p of presses) {
    const pair = await framePair(video, p.t, dir, { duration });
    if (!pair) {
      step();
      continue;
    }
    const said = await arbitratePress({ pair, at: p, spend });
    step();
    if (!said) continue;

    const target = said.target_bbox ? clampRect(said.target_bbox) : null;
    const result = said.result_bbox ? clampRect(said.result_bbox) : null;

    /**
     * ── THE ANNOTATION HAPPENS WHATEVER THE VERDICT ──────────────────────────
     * Even when nothing is proposed, what the model read belongs on the record:
     * the next person to wonder why this press did or did not earn a zoom
     * should not have to pay for the pass again to find out. Only evidence
     * fields are written — never the time, the position, or the verdict the
     * pixels reached.
     */
    patches.push({
      id: p.id,
      fields: {
        checked: said.verdict,
        ...(said.target ? { control: said.target } : {}),
        ...(said.typed ? { text: said.typed } : {}),
        ...(target ? { target: [round4(target.x), round4(target.y), round4(target.w), round4(target.h)] } : {}),
      },
    });

    const confident = said.confidence >= AUDIT.accept;

    if (said.verdict === "press" && !p.zoomable) {
      const bbox = frameFor(target, result);
      findings.push(
        finding("missed_press", {
          t: p.t,
          confidence: said.confidence,
          label: said.target || said.what || "a press with no zoom",
          why: `the camera stayed put because ${p.why}, but the frames either side show ${said.what || "the control being used"}`,
          bbox,
          event: p.id,
          acted: confident,
        })
      );
    } else if (p.zoomable && (said.verdict === "hover" || said.verdict === "scroll" || said.verdict === "settling")) {
      const z = (zooms || []).find((zz) => p.t >= num(zz.start) - 0.1 && p.t <= num(zz.end) + 0.1);
      findings.push(
        finding("wrong_zoom", {
          t: p.t,
          confidence: said.confidence,
          label: said.what || said.verdict,
          why: `the camera moved for a press here, but the frames either side show ${said.verdict === "hover" ? "only a hover" : said.verdict === "scroll" ? "the page scrolling" : "the screen settling on its own"}`,
          event: p.id,
          zoom: z?.id || "",
          // With no zoom to remove there is nothing to offer, however sure the
          // model is. The finding still goes on the record.
          acted: confident && !!z,
        })
      );
    } else if (said.verdict === "press" && p.zoomable && target) {
      /**
       * ── THE VERDICT WAS RIGHT AND THE FRAMING STILL MIGHT NOT BE ───────────
       * A zoom built from a click COORDINATE is a fixed box around a point. Now
       * that the control's own rectangle is known, and the rectangle of what it
       * produced, the shot can hold the thing rather than the spot — which is
       * the difference between framing "API Keys" and framing a patch of
       * sidebar that happens to contain it.
       */
      const z = (zooms || []).find((zz) => p.t >= num(zz.start) - 0.1 && p.t <= num(zz.end) + 0.1);
      const want = frameFor(target, result);
      if (z && want && !holds(z, want)) {
        findings.push(
          finding("reframe", {
            t: p.t,
            confidence: said.confidence,
            label: said.target || "reframe the shot",
            why: `the zoom here is aimed at the click, not at ${said.target ? `"${said.target}"` : "what was pressed"}`,
            bbox: want,
            event: p.id,
            zoom: z.id,
            acted: confident,
          })
        );
      }
    }
  }

  /* ── The changes nothing accounts for ───────────────────────────────────── */
  for (const g of gaps) {
    const pair = await framePair(video, num(g.t), dir, { duration });
    if (!pair) {
      step();
      continue;
    }
    const said = await auditChange({ pair, at: g, spend });
    step();
    if (!said) continue;

    if (!said.worth) {
      // Recorded anyway, at low weight. A run that decided twenty moments were
      // noise is a run whose thresholds are wrong, and that is only visible if
      // the nos are counted as well as the yeses.
      findings.push(
        finding("no_change_needed", {
          t: num(g.t),
          confidence: said.confidence,
          label: said.label || said.kind,
          why: said.what || `read as ${said.kind}`,
          acted: false,
        })
      );
      continue;
    }

    findings.push(
      finding(said.kind === "action" ? "missed_press" : "missed_moment", {
        t: num(g.t),
        confidence: said.confidence,
        label: said.label || said.what || "something happened here",
        why:
          said.kind === "action"
            ? `${said.what || "a control was used here"}, and no press was recovered at this moment`
            : `${said.what || "something arrived here"}, and nothing the person did explains it`,
        bbox: said.bbox || { x: num(g.x), y: num(g.y), w: num(g.w, 0.3), h: num(g.h, 0.3) },
        acted: said.confidence >= AUDIT.accept,
      })
    );
  }

  const suggestions = toSuggestions(findings, { duration });

  console.log(
    `[studio] audit: ${findings.length} finding(s) from ${done} look(s) — ` +
      summarise(findings) + `; ${suggestions.length} offered, $${spend.usd.toFixed(4)}`
  );

  return { findings, suggestions, patches, checked: done, spend };
}

/** Whether a zoom's rect already holds the box we would want framed. */
function holds(zoom, want) {
  const zx = num(zoom.x);
  const zy = num(zoom.y);
  const zw = num(zoom.w, 1);
  const zh = num(zoom.h, 1);
  const inside =
    want.x >= zx - 0.01 && want.y >= zy - 0.01 && want.x + want.w <= zx + zw + 0.01 && want.y + want.h <= zy + zh + 0.01;
  if (!inside) return false;
  /**
   * Containing it is not the same as framing it. A shot four times the size of
   * the thing it is about contains it and shows the viewer a page. Past that
   * the zoom is worth re-aiming even though nothing is cropped off.
   */
  const want_area = Math.max(1e-4, want.w * want.h);
  return zw * zh <= want_area * 6;
}

function summarise(findings) {
  const by = {};
  for (const f of findings) by[f.kind] = (by[f.kind] || 0) + 1;
  const parts = Object.entries(by).map(([k, n]) => n + " " + k.replace(/_/g, " "));
  return parts.length ? parts.join(", ") : "nothing";
}

/* ────────────────────────────────────────────────────────────────────────────
   Part four: findings, as things the creator can press a button on
   ──────────────────────────────────────────────────────────────────────────── */

/** How long a proposed zoom runs, either side of the moment. */
const LEAD = 0.45;
const HOLD = 1.5;

/**
 * Findings, as suggestions.
 *
 * Deliberately the same shape the quality reviewer produces, so they arrive in
 * the same list, apply through the same services/studio/suggestions.js and are
 * dismissed the same way. A creator should not have to learn that some of the
 * advice beside their edit came from arithmetic and some from a reviewer.
 */
export function toSuggestions(findings, { duration = 0 } = {}) {
  const out = [];
  for (const f of findings) {
    if (!f.acted) continue;
    const start = Math.max(0, f.t - LEAD);
    const end = Math.min(duration || Infinity, f.t + HOLD);

    if (f.kind === "missed_press" || f.kind === "missed_moment") {
      if (!f.bbox) continue;
      const rect = { x: f.bbox[0], y: f.bbox[1], w: f.bbox[2], h: f.bbox[3] };
      const level = levelForBox(rect);
      const frame = containingBox([rect], level);
      out.push({
        id: newId("sg"),
        title: (f.kind === "missed_press" ? "Zoom on " : "Emphasise ") + (f.label || "this moment"),
        why: f.why,
        severity: "medium",
        source: "audit",
        change: {
          op: "add_zoom",
          id: "",
          start: round3(start),
          end: round3(end),
          bbox: [frame.x, frame.y, frame.w, frame.h],
          level,
          text: f.label || "",
        },
      });
      continue;
    }

    if (f.kind === "wrong_zoom" && f.zoom) {
      out.push({
        id: newId("sg"),
        title: "Remove the zoom at " + f.t.toFixed(1) + "s",
        why: f.why,
        severity: "medium",
        source: "audit",
        change: { op: "remove_zoom", id: f.zoom, start: 0, end: 0, bbox: null, level: 0, text: "" },
      });
      continue;
    }

    if (f.kind === "reframe" && f.zoom && f.bbox) {
      const rect = { x: f.bbox[0], y: f.bbox[1], w: f.bbox[2], h: f.bbox[3] };
      const level = levelForBox(rect);
      const frame = containingBox([rect], level);
      out.push({
        id: newId("sg"),
        title: "Aim the zoom at " + (f.label || "what was pressed"),
        why: f.why,
        severity: "low",
        source: "audit",
        change: {
          op: "adjust_zoom",
          id: f.zoom,
          // Only the framing. Naming a start and an end here would move a zoom
          // the creator may already have retimed, over a disagreement about
          // where it points.
          start: 0,
          end: 0,
          bbox: [frame.x, frame.y, frame.w, frame.h],
          level,
          text: "",
        },
      });
    }
  }

  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 20);
}

/**
 * The evidence patches, applied to an event list.
 *
 * ── WHAT THIS IS ALLOWED TO TOUCH ────────────────────────────────────────────
 * The fields that record what was READ, and nothing else. Not `t`, not `x`/`y`,
 * not `zoomable`, not `confidence` — those are the pixel pipeline's conclusions
 * and the audit exists to check them, not to quietly rewrite them into
 * agreement with itself. An audit that edits the thing it is auditing has
 * audited nothing.
 */
const WRITABLE = new Set(["checked", "control", "text", "target"]);

export function applyPatches(events, patches) {
  if (!patches?.length) return events;
  const by = new Map(patches.map((p) => [p.id, p.fields || {}]));
  return (events || []).map((e) => {
    const fields = by.get(e.id);
    if (!fields) return e;
    const clean = {};
    for (const [k, v] of Object.entries(fields)) if (WRITABLE.has(k)) clean[k] = v;
    return { ...e, ...clean };
  });
}

export default { AUDIT, changeMoments, unexplained, uncertainPresses, auditEdit, toSuggestions, applyPatches };

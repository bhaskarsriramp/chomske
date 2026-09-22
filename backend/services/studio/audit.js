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
 * So the candidate set is arithmetic, not a model call. sync.js readScreen()
 * already measures what changed, cell by cell, twelve times a second, with
 * spinners and animations discounted; changeMoments() distils that to the
 * moments something happened. Every one of them is a candidate, and so is every
 * press. On a real demo that is a couple of dozen moments, not a couple of
 * hundred, because it counts what HAPPENED rather than how long the recording is.
 *
 * ── AND NEITHER SIDE OUTRANKS THE OTHER ──────────────────────────────────────
 * An earlier version of this file only audited the presses the pixel pipeline
 * was already unsure about, on the reasoning that where it is confident it is
 * right. That reasoning cost the creator real clicks. A press refused for "the
 * pointer never stopped here" is a CONFIDENT no by the gate's own reckoning, and
 * it was also wrong.
 *
 * The honest position is that the pixel pipeline is not a sensor. There is no
 * hardware click anywhere in this product — getDisplayMedia hands over frames
 * and nothing else, so every press in the timeline is already an inference from
 * pixels. Ranking one inference above another and only checking the loser is a
 * habit, not a hierarchy of reliability. So both are read, the answers are put
 * together (see plan() and the fusion in auditEdit), and the budget decides how
 * far down the list the money goes rather than which questions may be asked.
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
  /**
   * ...and the most it may grow to on a long recording.
   *
   * budgetFor() scales the cap with duration, because a ten minute demo really
   * does contain more to check than a ten second one and refusing to look is
   * how a missed click survives. A hundred and twenty looks is about 240 frames
   * — still under what the uniform two-second grid costs the vision pass for
   * the same recording, and that grid is not even trying to find a missed click.
   */
  maxLooks: 120,
  /** Seconds before the moment the BEFORE frame is taken. */
  before: 0.16,
  /** ...and after the moment, for the AFTER frame. */
  after: 0.6,
  /**
   * ── A PRESS IS A SEQUENCE, SO THE ARBITER IS SHOWN ONE ────────────────────
   * Two frames, at -0.16s and +0.6s, is a keyhole 0.76 seconds wide, and three
   * of the four things that prove a press happened fall outside it:
   *
   *   the approach     the pointer arriving and stopping, which is what
   *                    separates a press from the pointer being parked there
   *   the morph        arrow becoming a hand — the operating system itself
   *                    saying the thing under it answers a click
   *   the ripple       the interface's own acknowledgement, a frame or two long
   *   PERSISTENCE      the one that actually decides it, and the one a single
   *                    after-frame cannot show at all. "Did the change STAY?"
   *                    is not answerable from one picture of the change.
   *
   * And the keyhole actively misleads on a slow page: at +0.6s a page that had
   * to fetch is showing a spinner, so the model reads a real press as the
   * screen settling on its own and the camera is withheld.
   *
   * These offsets cover approach, press, acknowledgement, and the result both
   * arriving and still being there. Nothing here needs to happen in real time —
   * the recording is finished and every frame of it is on disk — so the only
   * cost of looking further is tokens, and they buy the evidence that matters.
   */
  strip: [-0.5, -0.18, 0.12, 0.4, 0.9, 1.8],
  /**
   * ...and where to look when that was still not enough.
   *
   * A verdict of "unclear" is the model saying the window did not contain the
   * answer, which is a reason to widen it rather than to give up on the moment.
   * Only an unclear verdict pays for this, so a recording of plain presses
   * never does.
   */
  stripWide: [-1.2, -0.3, 0.15, 1.0, 2.5, 4.5],
  /**
   * Long side of an arbiter frame.
   *
   * Smaller than the 1280 the UI pass uses, because this question is about what
   * CHANGES between frames rather than about reading every label on them, and
   * six frames at 1024 cost about what four would at 1280. The control's own
   * label is still legible at this size, which is the one detail the answer
   * needs.
   */
  stripEdge: 1024,
  /**
   * Confidence below which a finding is recorded but not offered.
   *
   * The model is asked to answer "unclear" and to be honest about confidence,
   * which it only does if a low number actually costs it something. It does:
   * below this the finding goes into the record for anyone reading the log and
   * never becomes a button.
   */
  accept: 0.6,
  /**
   * ...and the higher bar a finding must clear to be CARRIED OUT rather than
   * offered.
   *
   * ── WHY THESE ARE TWO NUMBERS AND NOT ONE ─────────────────────────────────
   * They answer different questions. `accept` asks "is this worth showing the
   * creator", where being wrong costs them a moment reading a suggestion and
   * dismissing it. This asks "is this worth doing to their edit without being
   * asked", where being wrong costs them a camera move they did not want and
   * have to find and delete.
   *
   * The gap is not theoretical. On a recording of a page with a demo video
   * playing on it, the arbiter answered "press" for ten moments inside that
   * video — honestly, because a real person really had pressed those things,
   * on their own machine, before this recording existed — and ten camera moves
   * onto a stranger's mouse were applied to an edit that had correctly decided
   * on none. The model is now asked whether a position is inside a picture of
   * another screen before it is asked anything else, which is the real fix;
   * this is what keeps the cost of the next unforeseen case a suggestion
   * rather than an edit.
   */
  apply: 0.8,
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

/**
 * The event that accounts for something changing at `t`, or "".
 *
 * ── A REFUSED PRESS IS NOT AN EXPLANATION ────────────────────────────────────
 * This used to return the nearest event of any kind, and that quietly disabled
 * the entire recall half of this file. On a real ten second demo it reported
 * "7 screen changes measured, 0 with no event within 1.6s" — every change
 * accounted for, nothing to check — while the creator was watching a press on
 * "Projects" get no zoom at all.
 *
 * The reason is that a press the gate REFUSED still counted. But a refusal is
 * the pipeline saying "no press happened here", and a screen that changed
 * substantially anyway is not corroboration of that, it is the single loudest
 * piece of evidence against it. Treating it as an explanation means the one
 * shape a missed click actually makes — a refused press, and then the screen
 * changing — is the one shape that silences the alarm.
 *
 * So only an ACCEPTED press explains a change. A refused one leaves the moment
 * unexplained, which is exactly what it is.
 */
function eventNear(events, t) {
  for (const e of events || []) {
    const dt = t - num(e.t);
    if (dt < -AUDIT.explainAfter || dt > AUDIT.explainBefore) continue;
    if (e.type === "click" || e.type === "dblclick" || e.type === "rightclick") {
      if (e.zoomable === false) continue;
      return "a press at " + num(e.t).toFixed(2) + "s";
    }
    /**
     * ── A SCROLL EXPLAINS A CHANGE WHATEVER SIZE IT IS ───────────────────────
     * The first attempt at this let a scroll explain only a SMALL change, on
     * the theory that a page replacing itself mid-scroll is a different event
     * wearing the same timestamp. The theory is right and the test was wrong,
     * and events.js already says why in the comment above RULES.navBox: what
     * separates a new screen from a widget is not how much changed but WHERE.
     * A scroll moves every line of text in the content area, so it clears any
     * magnitude bar worth setting — and gating on one would have marked every
     * scroll in every demo as unaccounted for, which is the opposite of the
     * bounded candidate set this whole file depends on.
     *
     * A press refused BECAUSE of a scroll is still checked. It is checked as a
     * press, by uncertainPresses() below, which is the better question anyway:
     * it knows where the pointer was.
     */
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
    if (eventNear(events, num(c.t))) continue;
    if (zoomOver(zooms, num(c.t))) continue;
    out.push(c);
  }
  return out.sort((a, b) => num(b.cover) - num(a.cover)).slice(0, Math.max(0, limit));
}

/* ────────────────────────────────────────────────────────────────────────────
   What to look at, and in what order
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * ── WHY THIS IS NOT A SHORTLIST ANY MORE ─────────────────────────────────────
 * The first version asked the recording about two narrow sets: presses whose
 * verdict was a close call, and changes nothing accounted for. That was built
 * to be cheap, and it was — six calls on a ten second demo. It was also built
 * on the assumption that where the pixel pipeline is CONFIDENT it is right, and
 * that assumption is the thing that kept losing clicks. A press refused for "the
 * pointer never stopped here" is not a close call by the gate's own reckoning;
 * it is a confident no. It was also wrong.
 *
 * The honest position is that the pixel pipeline is not a sensor. There is no
 * hardware click anywhere in this product — getDisplayMedia hands over frames
 * and nothing else, so every press in the timeline is already an inference from
 * pixels (events.js, locate.js). Ranking one inference above another and only
 * auditing the loser is not a hierarchy of reliability, it is a habit.
 *
 * So every moment the screen changed is a candidate, and so is every press. The
 * budget decides how far down the list the money goes, not which questions are
 * allowed to be asked. On a short demo that means everything is looked at, which
 * is the point.
 *
 * ── WHAT ORDER, AND WHY IT MATTERS MORE THAN THE CAP ─────────────────────────
 * A hole a viewer can see beats a shot that could be framed a little better.
 * So the ranking is by what the creator would notice if it went unchecked:
 *
 *   0  a press the gate refused          a missing zoom. The loudest failure.
 *   1  a change with no press near it    a click never detected at all, or a
 *                                        result nobody pressed for — the camera
 *                                        move the pipeline cannot propose.
 *   2  a press allowed on one signal     probably right, worth confirming, and
 *                                        worth a box to frame properly.
 *   3  a change already accounted for    confirmation only. Reached on a short
 *                                        recording, skipped on a long one.
 */
export const PRIORITY = { refused: 0, rested: 1, unaccounted: 2, thin: 3, confirm: 4 };

/**
 * How many moments this recording's audit may buy.
 *
 * Scales with length because a longer demo genuinely contains more to check,
 * and is floored so a short one gets looked at completely. Two frames and one
 * call each; a ten minute demo at the ceiling is still under half what the
 * uniform two-second grid costs for the vision pass.
 */
export function budgetFor(duration) {
  return clamp(Math.round(num(duration) / 3), AUDIT.maxChecks, AUDIT.maxLooks);
}

/**
 * Everything worth asking the recording about, best first.
 *
 * @returns {Array<object>} each with `kind` ("press" | "change") and `priority`
 */
export function plan({ changes = [], events = [], zooms = [], rests = [], duration = 0, budget = 0 } = {}) {
  const items = [];

  for (const p of uncertainPresses(events, { limit: Infinity })) {
    items.push({ ...p, kind: "press", priority: p.zoomable ? PRIORITY.thin : PRIORITY.refused });
  }

  /**
   * ── THE RESTS NOBODY PROPOSED A PRESS FOR ────────────────────────────────
   * uncertainPresses() above can only be uncertain about presses that EXIST.
   * The press that was never proposed — because its result was a toggle
   * flipping, a tab highlighting, a value changing in a panel on the other
   * side of the screen — leaves no event to be uncertain about and no change
   * loud enough to reach the list below. It is invisible to both, and it is
   * exactly the click a creator notices missing.
   *
   * A person clicks with the pointer held still, so every one of those clicks
   * is inside a rest. Any rest with no event already on it and no zoom already
   * over it is therefore a moment worth one question: "was the thing here
   * activated?" — which is the narrow, well-posed question the arbiter answers
   * best, because it comes with a position.
   *
   * They rank BELOW a refused press and above an unaccounted change. A refusal
   * is a moment the pipeline looked at and got wrong, which is likelier to be
   * a real press than a moment it never considered; a rest at least carries a
   * pointer position, which an unexplained change does not.
   */
  for (const r of rests || []) {
    const t = num(r.t);
    if (eventNear(events, t)) continue;
    if (zoomOver(zooms, t)) continue;
    items.push({
      kind: "press",
      // No event exists for this moment, so there is nothing to patch evidence
      // onto. auditEdit() reads the empty id as "this one is a proposal".
      id: "",
      t,
      x: num(r.x, 0.5),
      y: num(r.y, 0.5),
      ms: num(r.ms),
      zoomable: false,
      // Ranked within the band by how long the pointer sat there, reusing the
      // sort's existing tie-break. Two seconds parked on a control is far more
      // likely to be a press than a quarter-second pause on the way past.
      cover: num(r.ms) / 1000,
      why: "the pointer rested here for " + Math.round(num(r.ms)) + "ms and nothing was made of it",
      priority: PRIORITY.rested,
    });
  }

  for (const c of changes || []) {
    const t = num(c.t);
    const accounted = !!eventNear(events, t) || zoomOver(zooms, t);
    items.push({
      kind: "change",
      t,
      cover: num(c.cover),
      x: num(c.x, 0.5),
      y: num(c.y, 0.5),
      w: num(c.w, 0.3),
      h: num(c.h, 0.3),
      priority: accounted ? PRIORITY.confirm : PRIORITY.unaccounted,
    });
  }

  /**
   * ── ONE QUESTION PER MOMENT ──────────────────────────────────────────────
   * A missed click shows up twice: as the press the gate refused, and as the
   * change it caused a fraction of a second later. They are one moment. The
   * press wins, because it carries the pointer's position and can therefore ask
   * "was the thing HERE activated" rather than "what happened somewhere on this
   * screen" — a narrower question that gets a better answer.
   */
  items.sort((a, b) => a.priority - b.priority || num(b.cover) - num(a.cover) || a.t - b.t);

  const kept = [];
  const cap = budget || budgetFor(duration);
  let folded = 0;

  /**
   * What this candidate is already covered by, or null.
   *
   * ── A PRESS IS NEVER FOLDED INTO ANYTHING ────────────────────────────────
   * The first version folded any two candidates within the explanation window
   * of each other, and on a dense demo that ate the presses: two real presses
   * 1.5 seconds apart became one question, and a click at 4.45s disappeared
   * into the audit for a different click at 2.93s. Thirteen candidates came out
   * as four.
   *
   * Folding exists for ONE case — a press and the change it caused are the same
   * moment reported twice — and that case has a direction. The change follows
   * the press. So only a change folds, only into a press that precedes it, and
   * two presses are always two questions however close together they are.
   */
  const coveredBy = (it) => {
    /**
     * ── A PROPOSED REST IS NOT A PRESS AND DOES FOLD ─────────────────────────
     * The rule below — two presses are always two questions — is about presses
     * the pipeline actually FOUND, where being close together is ordinary and
     * folding them loses a real click. A rest carries no such claim: it is only
     * "the pointer stopped here". Two overlapping rests, or a rest sitting on a
     * press already being asked about, are one moment and one question.
     */
    if (it.kind === "press" && !it.id) {
      return kept.find((k) => k.kind === "press" && Math.abs(k.t - it.t) <= AUDIT.spanGap) || null;
    }
    if (it.kind !== "change") return null;
    const by = kept.find((k) => k.kind === "press" && it.t >= k.t - 0.25 && it.t <= k.t + AUDIT.explainBefore);
    if (by) return by;
    return kept.find((k) => k.kind === "change" && Math.abs(k.t - it.t) <= AUDIT.spanGap) || null;
  };

  for (const it of items) {
    const clash = coveredBy(it);
    if (clash) {
      // The press carries the moment, and inherits the change's measured box so
      // nothing the arithmetic worked out is thrown away.
      if (clash.kind === "press" && !clash.box) clash.box = { x: it.x, y: it.y, w: it.w, h: it.h };
      folded++;
      continue;
    }
    if (kept.length >= cap) break;
    kept.push(it);
  }

  return { items: kept, folded, dropped: Math.max(0, items.length - kept.length - folded), cap };
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
/**
 * What each refusal was actually made of.
 *
 * ── A HEURISTIC AND A READING ARE NOT THE SAME REFUSAL ───────────────────────
 * confirmClicks() turns a press down for eight different reasons and they are
 * not equally sure of themselves:
 *
 *   no-consequence  the screen did not change. Nothing was worth a camera move
 *                   here whether or not a finger went down, so there is nothing
 *                   for a model to find. A reading; leave it alone.
 *   moving          the pointer was judged never to have settled. That is a
 *                   speed threshold applied to a recovered path, and a fast,
 *                   confident hand trips it. A HEURISTIC.
 *   scrolling       a vertical translation was detected nearby. A person can
 *                   scroll and then press within the same second. A HEURISTIC.
 *   arrow           the OS drew a plain arrow, so nothing was pressable. True of
 *                   the OS, false of any app that draws its own cursor.
 *   off-control     the model named controls and none was under the pointer —
 *                   decided on boxes it places roughly by its own admission.
 *   nothing-read    nobody looked. The gate's own fallback, and a guess.
 *
 * The first is a fact. The rest are inferences worth a second opinion, and the
 * ones the creator keeps reporting as missing zooms are `moving` and
 * `scrolling` — which the first version of this function did not check at all.
 */
const HEURISTIC_REFUSAL = new Set(["moving", "scrolling", "arrow", "off-control", "nothing-read", "held"]);

/**
 * ── AND THE EVIDENCE CHANNELS THAT ARE FIRST-HAND ───────────────────────────
 * "flash" means the interface drew its own acknowledgement at the pointer
 * (locate.js flashesFrom) — the one channel in this product that observes a
 * press rather than inferring it from a consequence. A press kept on that needs
 * no second opinion about WHETHER it happened; it may still be worth a look for
 * what it landed on, which is a different and cheaper question.
 */
const FIRST_HAND = new Set(["flash"]);

export function uncertainPresses(events, { limit = AUDIT.maxChecks } = {}) {
  const out = [];
  for (const e of events || []) {
    if (e.type !== "click" && e.type !== "dblclick") continue;

    // The same set confirmClicks() judges by, imported rather than restated:
    // two copies of "which glyphs mean pressable" would drift within a week.
    const hand = CLICKABLE_SHAPES.has(e.pointer_shape);
    const arrow = e.pointer_shape === "default";
    const onControl = e.on_control === true;

    let why = "";

    if (typeof e.basis === "string") {
      /**
       * A press the gate turned down on an inference. This is the case the
       * whole file exists for and the one it used to miss: a refusal for
       * "the pointer never stopped here" left no trace in `pointer_shape` or
       * `on_control` that the old rules below could see, so the most common
       * refusal in every log was never once checked.
       */
      if (e.zoomable === false && HEURISTIC_REFUSAL.has(e.basis)) {
        why = REFUSAL_WORDS[e.basis] || "the camera was withheld on an inference";
      } else if (e.zoomable === true && FIRST_HAND.has(e.basis) && !onControl) {
        // Observed directly, so not in doubt — but nobody has named what it
        // landed on, and the camera has only a coordinate to aim at.
        why = "the control lit up, but nothing named it";
      } else if (e.zoomable === true && (e.basis === "hand" || e.basis === "held") && !onControl) {
        // Allowed, but on one signal only. Worth confirming, and worth framing.
        why = "a hand, but no control was named";
      } else if (e.zoomable === true && e.basis === "control" && arrow) {
        why = "a control was named, but the pointer was a plain arrow";
      }
    } else {
      /**
       * ── DEMOS ANALYSED BEFORE `basis` EXISTED ──────────────────────────────
       * Read from what is on the event instead. Weaker — it cannot see a
       * `moving` refusal at all, which is precisely why `basis` was added — but
       * an old demo re-reviewed should still get what can be got.
       */
      if (e.corroborated === false || e.scrolled === true) continue;
      const noControl = e.on_control === false;
      const unread = e.on_control == null;
      if (e.zoomable === false && arrow && unread) why = "a plain arrow, and no frame was read here";
      else if (e.zoomable === false && arrow && noControl) why = "a plain arrow and no control named";
      else if (e.zoomable === false && !hand && unread) why = "nothing was read here either way";
      else if (e.zoomable === false) why = "the camera was withheld here";
      else if (e.zoomable === true && hand && !onControl) why = "a hand, but no control was named";
      else if (e.zoomable === true && onControl && arrow) why = "a control was named, but the pointer was a plain arrow";
    }

    if (!why) continue;
    out.push({ id: e.id, t: num(e.t), x: num(e.x, 0.5), y: num(e.y, 0.5), zoomable: e.zoomable === true, why });
  }

  /**
   * ── THE REFUSALS COME FIRST WHEN THE CAP BITES ───────────────────────────
   * A press that got no camera move is a hole in the demo the creator can see.
   * One that got a slightly badly aimed move is a polish note. When more
   * moments are uncertain than the budget allows, the holes are the ones worth
   * the frames.
   */
  /**
   * Refusals first: a press that got no camera move is a hole the creator can
   * see, and one that got a slightly badly aimed move is a polish note. plan()
   * re-ranks across both kinds of candidate, so the cap here is normally
   * Infinity and this ordering only matters when it is called directly.
   */
  out.sort((a, b) => Number(a.zoomable) - Number(b.zoomable));
  return Number.isFinite(limit) ? out.slice(0, Math.max(0, limit)) : out;
}

/** What to tell the model, and later the creator, about why we are asking. */
const REFUSAL_WORDS = {
  held: "a clickable pointer was held here but the evidence fell short",
  moving: "the pointer was judged never to have settled here",
  scrolling: "the page was judged to be scrolling here",
  arrow: "the pointer was a plain arrow, so nothing was judged pressable",
  "off-control": "no named control was under the pointer",
  "nothing-read": "nothing was read here either way",
};

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

/**
 * Several frames around a moment, in time order, each tagged with its offset.
 *
 * Unlike framePair() above this is for the PRESS question, where the answer is
 * a shape in time — arrive, morph, acknowledge, change, stay changed — and no
 * pair of stills can carry it. See AUDIT.strip.
 *
 * Offsets that fall outside the recording are dropped rather than clamped: two
 * frames at the same instant would be shown to the model as two moments and
 * invite it to read a change that is not there.
 */
async function frameStrip(video, t, dir, { duration = 0, offsets = AUDIT.strip } = {}) {
  const out = [];
  const seen = new Set();
  for (const d of offsets) {
    const at = t + d;
    if (at < 0) continue;
    if (duration && at > duration) continue;
    const key = Math.round(at * 1000);
    if (seen.has(key)) continue;
    seen.add(key);
    const file = path.join(dir, `strip_${Math.round(t * 1000)}_${key}.jpg`);
    try {
      await extractFrameAt(video, file, at, { longEdge: AUDIT.stripEdge });
      out.push({ file, at: round3(at), offset: round3(d) });
    } catch (err) {
      // One frame that would not cut is not a reason to lose the moment: the
      // sequence is still readable with five frames instead of six.
      console.warn("[studio] could not cut a frame at " + at.toFixed(2) + "s: " + err.message);
    }
  }
  // Below three frames there is no sequence to read and the question is not
  // worth paying for.
  return out.length >= 3 ? out : null;
}

/** A finding, in the one shape everything downstream reads. */
function finding(kind, o) {
  return {
    id: newId("f"),
    kind,
    t: round3(num(o.t)),
    confidence: clamp(num(o.confidence, 0.5), 0, 1),
    /**
     * How long the result took to appear, when the arbiter could see it. The
     * camera holds until then rather than for a fixed beat, so a press on
     * something that had to fetch does not have its loading state framed and
     * its answer missed. Null where it was not read.
     */
    settled_by: Number.isFinite(Number(o.settled_by)) ? round3(Number(o.settled_by)) : null,
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
 * @param {Array}    o.rests      restMoments(), from the analysis
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
  rests = [],
  spend = newSpend(),
  onProgress = () => {},
}) {
  const dir = path.join(workDir, "audit");
  await fsp.mkdir(dir, { recursive: true }).catch(() => {});

  const { items, folded, dropped, cap } = plan({ changes, events, zooms, rests, duration });
  const presses = items.filter((i) => i.kind === "press");
  const gaps = items.filter((i) => i.kind === "change");
  const total = items.length;

  const tally = (p) => items.filter((i) => i.priority === p).length;
  console.log(
    `[studio] audit: ${changes.length} screen change(s), ${(events || []).filter((e) => e.type === "click" || e.type === "dblclick").length} press(es); ` +
      `checking ${total} moment(s) of a possible ${cap}` +
      (folded ? ` (${folded} folded)` : "") +
      (dropped ? `, ${dropped} past the budget` : "") +
      ` — ${tally(PRIORITY.refused)} refused press, ${tally(PRIORITY.rested)} unexplained rest, ` +
      `${tally(PRIORITY.unaccounted)} unaccounted change, ` +
      `${tally(PRIORITY.thin)} thin press, ${tally(PRIORITY.confirm)} confirmation`
  );
  if (!total) return { findings: [], suggestions: [], patches: [], checked: 0, spend };

  const findings = [];
  const patches = [];
  let done = 0;
  const step = () => onProgress(Math.min(1, ++done / total));

  /* ── The presses ────────────────────────────────────────────────────────── */
  for (const p of presses) {
    const frames = await frameStrip(video, p.t, dir, { duration });
    if (!frames) {
      step();
      continue;
    }
    let said = await arbitratePress({ frames, at: p, spend });
    step();
    if (!said) continue;

    /**
     * ── AN "UNCLEAR" IS A REQUEST FOR MORE TIME, NOT A VERDICT ───────────────
     * The model saying it cannot tell is the model saying the window it was
     * given did not contain the answer. Treating that as "no press" throws away
     * exactly the moments the audit exists for — and the recording is finished,
     * so there is nothing stopping us looking further out.
     *
     * The wide window reaches four and a half seconds past the moment, which
     * covers a page that had to fetch before it showed anything. Only an
     * unclear answer pays for it, so a recording of ordinary presses never does.
     */
    if (said.verdict === "unclear") {
      const wider = await frameStrip(video, p.t, dir, { duration, offsets: AUDIT.stripWide });
      if (wider) {
        const again = await arbitratePress({ frames: wider, at: p, spend });
        step();
        if (again && again.verdict !== "unclear") {
          console.log(
            "[studio] press at " + p.t.toFixed(2) + "s was unclear in 2.3s of frames; " +
              "over 5.7s it reads as " + again.verdict
          );
          said = again;
        }
      }
    }

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
    /**
     * A rest proposed by plan() has no event behind it — that is what makes it
     * worth asking about — so there is nothing to annotate. The finding below
     * carries everything learned here.
     */
    if (p.id) {
      patches.push({
        id: p.id,
        fields: {
          checked: said.verdict,
          ...(said.target ? { control: said.target } : {}),
          ...(said.typed ? { text: said.typed } : {}),
          ...(target ? { target: [round4(target.x), round4(target.y), round4(target.w), round4(target.h)] } : {}),
        },
      });
    }

    const confident = said.confidence >= AUDIT.accept;

    /**
     * ── A PRESS INSIDE A PICTURE OF ANOTHER SCREEN IS NOT OUR PRESS ─────────
     * The arbiter is shown frames and asked whether the thing at a position was
     * activated. Inside an embedded demo video the honest answer is yes — a
     * real person really did press it, on their own machine, before this
     * recording existed. Six of those came back "press" on one real demo and
     * became six camera moves onto a stranger's mouse.
     *
     * So the model is now asked the prior question first, and when it says the
     * position is inside a video or a screenshot this stops here: no finding,
     * nothing offered, nothing applied. Recorded on the event so the next
     * person to wonder why this moment got no zoom can see that it was looked
     * at and why. See PRESS_ARBITER.
     */
    if (said.verdict === "content") {
      console.log(
        "[studio] press at " + p.t.toFixed(2) + "s is inside " +
          (said.what || "a video or screenshot on the page") + " — somebody else's screen, not this one"
      );
      continue;
    }

    if (said.verdict === "press" && !p.zoomable) {
      /**
       * ── AND IF THE MODEL NAMED NO BOX, THE ARITHMETIC DID ──────────────────
       * A rescued press with nowhere to point is a finding that cannot become a
       * button. When this press absorbed a change moment (see plan()), that
       * moment's own bounding box — measured, not read — says where on screen
       * the consequence was, which is a perfectly good thing to frame.
       */
      const bbox = frameFor(target, result) || p.box || null;
      findings.push(
        finding("missed_press", {
          t: p.t,
          confidence: said.confidence,
          label: said.target || said.what || "a press with no zoom",
          why: `the camera stayed put because ${p.why}, but the frames around it show ${said.what || "the control being used"}`,
          bbox,
          settled_by: said.settled_by,
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

    /**
     * Inside a picture of another screen, so whatever changed was recorded on
     * somebody else's machine. worth_camera should already be false — this is
     * the belt to that braces, because the cost of getting it wrong is a camera
     * move onto a stranger's mouse and the cost of this line is nothing.
     */
    if (said.kind === "content") {
      console.log(
        "[studio] change at " + num(g.t).toFixed(2) + "s is inside " +
          (said.what || "a video or screenshot on the page") + " — somebody else's screen, not this one"
      );
      continue;
    }

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
/** How long to stay after a slow result finally appears, so it can be read. */
const RESULT_BEAT = 0.9;

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
    /**
     * ── THE CAMERA LEAVES WHEN THE RESULT IS UP, NOT ON A STOPWATCH ─────────
     * HOLD is the beat a control that answers instantly deserves. The arbiter
     * now reads the sequence rather than a pair, so it can say WHEN the result
     * became visible — and a press whose answer took two seconds to arrive had
     * the camera pull out exactly as it appeared. Plus a beat to read it by.
     * Same reasoning as settleAfter() in the analysis path.
     */
    const hold = f.settled_by > 0 ? Math.max(HOLD, f.settled_by + RESULT_BEAT) : HOLD;
    const end = Math.min(duration || Infinity, f.t + hold);

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
        // Sure enough to carry out unasked, rather than only to offer. The
        // runner applies these and leaves the rest as buttons. See AUDIT.apply.
        auto: num(f.confidence) >= AUDIT.apply,
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

export default { AUDIT, PRIORITY, changeMoments, unexplained, uncertainPresses, plan, budgetFor, auditEdit, toSuggestions, applyPatches };

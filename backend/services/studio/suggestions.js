/**
 * suggestions.js: turning the reviewer's advice into an actual edit.
 *
 * The quality reviewer (prompts.js, QUALITY_REVIEWER) returns changes rather
 * than opinions: not "the pacing drags around 40 seconds" but "add a cut from
 * 38.2 to 43.1". This file is what makes one of those a single click.
 *
 * ── APPLIED HERE, NOT IN THE BROWSER ─────────────────────────────────────────
 * The editor could do this arithmetic itself, and then there would be two
 * copies of it, and the one in the browser would be the one that drifted. The
 * browser sends a suggestion id; the server applies it to the stored timeline
 * and answers with the new one. A suggestion is also the only kind of edit that
 * can be WRONG in a way worth refusing — a cut outside the recording, a zoom on
 * a rectangle that is not there — and refusing it needs the same clamping every
 * other write goes through (timeline.js sanitizeTimeline).
 *
 * ── NOTHING IS APPLIED AUTOMATICALLY ─────────────────────────────────────────
 * The reviewer looked at an edit the same models produced. A reviewer that
 * applies its own advice has no reviewer, and the failure mode is a demo that
 * drifts a little further from what the creator recorded on every pass. Every
 * one of these is a button somebody pressed.
 */
import { newId, sanitizeTimeline } from "./timeline.js";

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const rectOf = (bbox) =>
  Array.isArray(bbox) && bbox.length >= 4
    ? { x: num(bbox[0]), y: num(bbox[1]), w: num(bbox[2], 0.25), h: num(bbox[3], 0.25) }
    : null;

/**
 * Apply one suggestion to a timeline.
 *
 * @returns {{ timeline: object, applied: boolean, why: string }}
 *          `applied: false` with a reason when the change no longer makes
 *          sense — the creator deleted the zoom it was about, say — so the
 *          editor can retire the suggestion instead of showing a dead button.
 */
export function applySuggestion(timeline, suggestion, { duration }) {
  const tl = JSON.parse(JSON.stringify(timeline));
  const c = suggestion?.change || {};
  const start = Math.max(0, num(c.start));
  const end = Math.max(start, num(c.end));
  const rect = rectOf(c.bbox);

  const found = (list) => (tl[list] || []).findIndex((x) => x.id === c.id);
  const ok = (why = "") => ({ timeline: sanitizeTimeline(tl, { duration, source: tl.source }), applied: true, why });
  const no = (why) => ({ timeline, applied: false, why });

  switch (c.op) {
    case "add_cut": {
      if (end - start < 0.3) return no("That cut is too short to make a difference.");
      tl.cuts = [...(tl.cuts || []), { id: newId("cut"), start, end, reason: "idle", auto: false }];
      return ok();
    }

    case "remove_cut": {
      const i = found("cuts");
      if (i < 0) return no("That cut isn't in the edit any more.");
      tl.cuts.splice(i, 1);
      return ok();
    }

    case "add_zoom": {
      if (!rect) return no("We couldn't tell what that zoom should be on.");
      if (end - start < 0.5) return no("That zoom is too short.");
      tl.zooms = [
        ...(tl.zooms || []),
        {
          id: newId("z"),
          start, end,
          ...rect,
          level: num(c.level, 0) > 1 ? num(c.level) : 1.8,
          /**
           * ── THE SUGGESTION MAY SAY HOW THE CAMERA SHOULD MOVE ─────────────
           * "smooth" with no ramps means rampsOf falls back to 0.55s at both
           * ends, which is a reveal. A zoom onto a press the analysis missed is
           * not a reveal, and the audit now says so (audit.js toSuggestions).
           * Anything that does not is unchanged, which is every suggestion the
           * quality reviewer has ever produced.
           */
          easing: c.easing || "smooth",
          ...(c.ease_out ? { ease_out: c.ease_out } : {}),
          ...(num(c.ramp_in, 0) > 0 ? { ramp_in: num(c.ramp_in) } : {}),
          ...(num(c.ramp_out, 0) > 0 ? { ramp_out: num(c.ramp_out) } : {}),
          camera: "element",
          follow: false,
          follow_strength: 0.7,
          label: c.text || "",
          auto: false,
        },
      ];
      return ok();
    }

    case "adjust_zoom": {
      const i = found("zooms");
      if (i < 0) return no("That zoom isn't in the edit any more.");
      const z = tl.zooms[i];
      // Only the fields the suggestion actually named. A reviewer that returns
      // start: 0 because it had nothing to say about the start must not move
      // the zoom to the beginning of the video.
      if (num(c.level, 0) > 1) z.level = num(c.level);
      if (rect) Object.assign(z, rect);
      if (end - start >= 0.5) {
        z.start = start;
        z.end = end;
      }
      z.auto = false;
      return ok();
    }

    case "remove_zoom": {
      const i = found("zooms");
      if (i < 0) return no("That zoom isn't in the edit any more.");
      tl.zooms.splice(i, 1);
      return ok();
    }

    case "add_blur": {
      if (!rect) return no("We couldn't tell what that blur should cover.");
      tl.blurs = [
        ...(tl.blurs || []),
        {
          id: newId("b"),
          start,
          // A blur with no end named covers the rest of the recording. The
          // safe reading of an underspecified privacy change is the wider one.
          end: end > start ? end : num(duration),
          ...rect,
          kind: "blur",
          strength: 0.8,
          label: c.text || "sensitive",
          auto: false,
        },
      ];
      return ok();
    }

    // "add_annotation" used to live here. On-screen arrows, circles and tooltip
    // bubbles were cut from the product: this is a tool for solo founders
    // shipping a product demo, and a demo covered in callouts reads as a
    // training video. A reviewer that still asks for one is told so rather than
    // silently ignored, because a suggestion that disappears looks like a bug.
    case "add_annotation":
      return no("On-screen notes aren't part of the studio any more.");

    case "adjust_step": {
      const i = found("steps");
      if (i < 0) return no("That step isn't in the edit any more.");
      const s = tl.steps[i];
      if (end - start >= 0.3) {
        s.start = start;
        s.end = end;
      }
      if (c.text) s.title = c.text;
      return ok();
    }

    default:
      return no("We don't know how to apply that one.");
  }
}

export default { applySuggestion };

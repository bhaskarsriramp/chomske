/**
 * captionsFromScript.js: the voiceover script, turned into captions.
 *
 * ── WHY THIS IS NOT A MODEL CALL ─────────────────────────────────────────────
 * The studio already wrote a narration for this demo during the analysis
 * (vision.js writeNarration): one or two spoken sentences per step, already
 * timed to the step they describe. Asking a model to "write captions for this
 * video" a second time would pay for frames again, take thirty seconds, and
 * produce something that says the same thing in different words — which is
 * worse, because the creator who then records the voiceover from the script
 * would find the burned-in captions disagreeing with what they said.
 *
 * So captions from the script are free and instant. They are the script.
 *
 * ── THE THREE WAYS A DEMO GETS CAPTIONS ──────────────────────────────────────
 *   from my voice    transcribed from the recording's own audio (vision.js)
 *   from the script  this file: the narration, chunked and retimed
 *   by hand          the creator types them in the editor
 *
 * The first needs sound and most product demos are silent. The second is the
 * one that fits a silent screen recording with a written script, which is what
 * a solo founder shipping a launch video actually has.
 *
 * ── CHUNKING IS THE WHOLE JOB ────────────────────────────────────────────────
 * A narration line is a sentence. A caption is a glance. Burning a full
 * sentence on screen at 13 words gives a viewer a paragraph to read while the
 * picture moves on, so each line is broken into pieces short enough to take in
 * without looking away from the product, and each piece is given the share of
 * its line's time that its own length deserves. Splitting on punctuation first
 * means the breaks land where the sentence already pauses rather than mid
 * clause.
 */
import { newId } from "./timeline.js";

/** The longest a caption may be before it stops being readable at a glance. */
const MAX_CHARS = 42;
const MAX_WORDS = 8;
/** Below this a piece is not worth a cue of its own; it joins its neighbour. */
const MIN_SECONDS = 0.5;

const round3 = (v) => Math.round((Number(v) || 0) * 1000) / 1000;

/**
 * Caption cues for a timeline, from its narration.
 *
 * @param {Array<{start,end,text}>} narration
 * @param {object} [o]
 * @param {number} [o.duration] the recording's length, to clamp against
 * @returns {Array<{id,start,end,text,emphasis,custom}>}
 */
export function cuesFromNarration(narration, { duration = 0 } = {}) {
  const lines = (narration || [])
    .map((n) => ({
      start: Math.max(0, Number(n.start) || 0),
      end: Number(n.end) || 0,
      text: String(n.text || "").replace(/\s+/g, " ").trim(),
    }))
    .filter((n) => n.text && n.end > n.start)
    .sort((a, b) => a.start - b.start);

  const out = [];

  for (const line of lines) {
    // A line may not run into the next one. The narration writer times to the
    // step, and two steps that touch produce two lines that touch; a caption
    // overlapping the next caption is two lines drawn on top of each other.
    const next = lines.find((l) => l.start > line.start);
    const end = Math.min(line.end, next ? next.start : Infinity, duration > 0 ? duration : Infinity);
    if (end <= line.start) continue;

    const pieces = chunk(line.text);
    const weights = pieces.map((p) => Math.max(1, p.length));
    const total = weights.reduce((a, b) => a + b, 0);

    // ── A PIECE MAY ONLY EVER JOIN ITS OWN LINE ───────────────────────────
    // The short-piece rule below merges a fragment into the caption before it,
    // and without this mark that "before" was whatever happened to be last in
    // the output — the END of the PREVIOUS narration line. A demo whose second
    // step opened with "Next," produced a caption reading "…left for the week.
    // Next," that ran past the first step and into the second: two different
    // moments of the demo in one line, on screen over the wrong picture.
    const lineStart = out.length;

    let at = line.start;
    pieces.forEach((text, i) => {
      // Time shared out by length, so a six-word piece is not on screen for the
      // same beat as a two-word one.
      const share = ((end - line.start) * weights[i]) / total;
      const stop = i === pieces.length - 1 ? end : Math.min(end, at + share);
      const prev = out.length > lineStart ? out[out.length - 1] : null;

      if (stop - at >= MIN_SECONDS || !prev) {
        out.push({
          id: newId("q"),
          start: round3(at),
          end: round3(stop),
          text,
          emphasis: "",
          custom: null,
        });
        at = stop;
      } else {
        // Too short to read on its own: it rides along with the piece before
        // it rather than flashing.
        prev.text = `${prev.text} ${text}`.trim();
        prev.end = round3(stop);
        at = stop;
      }
    });

    // A line whose FIRST piece was too short has nothing to ride on, so it was
    // pushed on its own above and may still be under MIN_SECONDS. Give it the
    // time by taking it from the piece after it rather than leaving a flash.
    const first = out[lineStart];
    const second = out[lineStart + 1];
    if (first && second && first.end - first.start < MIN_SECONDS) {
      second.text = `${first.text} ${second.text}`.trim();
      second.start = first.start;
      out.splice(lineStart, 1);
    }
  }

  return out;
}

/**
 * One sentence, as the fewest readable pieces.
 *
 * Breaks at punctuation first — that is where the speaker pauses, so it is
 * where a caption should change — and only falls back to counting words when a
 * clause is still too long to read.
 */
function chunk(text) {
  const clauses = String(text)
    .split(/(?<=[.!?,;:—–])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const out = [];
  for (const clause of clauses) {
    if (fits(clause)) {
      // Two short clauses in a row read better as one caption than as two
      // flashes, so long as the result still fits.
      const prev = out[out.length - 1];
      if (prev && fits(`${prev} ${clause}`)) out[out.length - 1] = `${prev} ${clause}`;
      else out.push(clause);
      continue;
    }
    out.push(...byWords(clause));
  }
  return out.length ? out : [String(text)];
}

const fits = (s) => s.length <= MAX_CHARS && s.split(/\s+/).length <= MAX_WORDS;

function byWords(clause) {
  const words = clause.split(/\s+/).filter(Boolean);
  const out = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (line && !fits(test)) {
      out.push(line);
      line = w;
    } else line = test;
  }
  if (line) out.push(line);
  return out;
}

export default { cuesFromNarration };

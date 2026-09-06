/**
 * prose.js: cleanup applied to text a model wrote, before anyone reads it.
 *
 * ── WHY THE DASH RULE IS CODE AND NOT ONLY A PROMPT LINE ────────────────────
 * ANTI_TELL in scriptWriterService.js asks the model not to use em-dashes, and
 * that is worth asking. It is not a guarantee. Prompt rules are followed most
 * of the time, and "most of the time" is not the bar for something that goes
 * into every script this product sells.
 *
 * Two reasons it matters here more than it would elsewhere. A creator reads
 * this script OUT LOUD, and an em-dash is a pause with no spoken form, so it
 * lands as a stumble in the take. And it is the single most recognised tell of
 * generated text, on a product whose whole promise is that the words sound like
 * the person rather than like a machine.
 *
 * A comma is the substitution because it is what a person reading aloud
 * actually does at that break: a short pause, no change in pitch.
 *
 * Every dash below is written as a \u escape rather than as the character. The
 * point of this file is that the character does not appear in this codebase,
 * and a rule that exempts its own implementation is a rule with a hole in it.
 */

// U+2014 em dash, U+2015 horizontal bar. Both are pauses, never punctuation
// inside a word. U+2013 en dash counts only when spaced (see below).
const EM = /[\u2014\u2015]/;
const SPACED_EN = /\s\u2013\s/;

/**
 * Strip em-dashes from model-written prose.
 *
 * The spaced en-dash is caught too, because it is the first thing a model
 * reaches for when told to stop using em-dashes, and it reads exactly the same
 * way on screen. An UNSPACED en-dash or hyphen is left alone: those are ranges
 * and compounds ("2-3 paragraphs", "50-200 per 1,000 views"), which are
 * meaningful and correct.
 *
 * @param {*} value  anything; non-strings come back as ""
 * @returns {string}
 */
export function noEmDash(value) {
  const s = String(value ?? "");
  if (!EM.test(s) && !SPACED_EN.test(s)) return s;

  return s
    // A dash opening a line is a bullet, not a pause, so it just goes.
    .replace(/^([ \t]*)[\u2013\u2014\u2015][ \t]+/gm, "$1")
    // The pause itself.
    .replace(/[ \t]*[\u2014\u2015][ \t]*/g, ", ")
    .replace(/[ \t]+\u2013[ \t]+/g, ", ")
    // Tidy what the substitution can leave behind: a comma landing next to
    // punctuation that was already doing the same job.
    .replace(/,\s*,/g, ",")
    .replace(/,\s*([.!?;:])/g, "$1")
    .replace(/[ \t]+([.,!?;:])/g, "$1")
    .replace(/,\s*$/, "")
    .trim();
}

/** The same, mapped over a list, dropping anything that empties out. */
export function noEmDashAll(list) {
  return (Array.isArray(list) ? list : []).map(noEmDash).filter(Boolean);
}

/**
 * For values where a comma would be wrong because the string is one token, not
 * a sentence: a hashtag split in two is two broken hashtags.
 */
export function dropDashes(value) {
  return String(value ?? "").replace(/[\u2014\u2015]/g, "");
}

export default { noEmDash, noEmDashAll, dropDashes };

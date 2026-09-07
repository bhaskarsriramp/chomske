/**
 * creditPricing.js: what things cost, in one place.
 *
 * ── WHY THIS IS A MODULE AND NOT NUMBERS SPRINKLED THROUGH ROUTES ────────────
 * Every number below is money. A price that exists in two files WILL disagree
 * eventually, the route charges 30 and the pricing page promises 20, and the
 * first anyone hears of it is a refund request. The API serves its pack list
 * from this file, the script route charges from this file, and the frontend
 * renders whatever the API sent rather than hardcoding a rupee figure.
 *
 * ── THE UNIT: ONE CREDIT BUYS TWO SECONDS OF FINISHED SCRIPT ─────────────────
 * Duration is the honest cost driver in both directions. An eight-minute script
 * costs us roughly eight times a Short in output tokens, and it is worth far
 * more to the creator, long-form earns ₹50-200 per 1,000 views in India where
 * Shorts earn ₹5-30. Charging per script instead would mean the same price for
 * both, which overcharges for a Short and hands away the long-form value.
 *
 * ── HOW THE PACK SIZES WERE SET ─────────────────────────────────────────────
 * Anchored to what an Indian creator already pays a human. Freelance
 * scriptwriters here run ₹0.50-4 per word; an 8-minute script is roughly 1,200
 * words, so ₹600-4,800 by hand. At 240 credits it lands near ₹200. Video
 * editors charge ₹1,000-5,000 per Short, so a script at ₹19-25 is a rounding
 * error against the production cost it feeds.
 *
 * The ceiling is real and low: Indian group-buy services sell forty premium
 * tools for ₹449-499 a month, so a single tool priced above that loses on sight.
 * These packs sit under it deliberately, and they are ONE-TIME, credits never
 * expire, because "tired of stacking subscriptions" is the actual complaint
 * this pricing exists to answer.
 */

/** One credit = this many seconds of finished script. */
export const SECONDS_PER_CREDIT = 2;

/**
 * The bounds of what can be ordered.
 *
 * Clamped SERVER-SIDE, not just in the picker. `seconds` arrives in a request
 * body, and a hand-rolled call asking for 86,400 seconds would otherwise bill
 * a fortune of credits and hand Gemini a prompt that never returns.
 */
export const MIN_SECONDS = 45;
export const MAX_SECONDS = 480;   // 8 minutes

/**
 * The lengths the UI offers. Free-form input between MIN and MAX still works;
 * these are the ones worth one tap, chosen around how the formats actually
 * publish: under a minute for Shorts/Reels, then the long-form steps.
 */
export const DURATION_PRESETS = [
  { seconds: 45,  label: "45s",    note: "Reel / Short" },
  { seconds: 60,  label: "60s",    note: "Short, full length" },
  { seconds: 90,  label: "90s",    note: "Short-form, more detail" },
  { seconds: 180, label: "3 min",  note: "Long-form" },
  { seconds: 300, label: "5 min",  note: "Long-form, deep" },
  { seconds: 480, label: "8 min",  note: "Full explainer" },
];

/**
 * The English twin, at half price.
 *
 * The expensive half of a script is the research, the ranked story, the
 * coverage, the voice profile, and that is already paid for by the first
 * language. The twin is one more model call over the same material.
 *
 * It is discounted rather than free because it is the single most valuable
 * thing on the menu: India-facing content earns ₹50-200 per 1,000 views while
 * English content reaching US viewers earns ₹650-3,300. Half price makes it an
 * obvious yes; free would make it look worthless.
 */
export const ENGLISH_TWIN_RATE = 0.5;

/** Title, description, hashtags and thumbnail lines. Flat, it does not scale
 *  with length, it is one short call whatever the script's duration. */
export const PACKAGING_CREDITS = 15;

/* ── WHAT THE SCRIPT IS WRITTEN FROM ────────────────────────────────────────
 *
 * Until now there was one answer: a ranked news story, whose research was paid
 * for by the collector on its own clock and cost the creator nothing at the
 * moment they ordered. Import and Idea break that assumption in one specific
 * way, so the pricing has to grow one dimension:
 *
 *   pasted text   free. It is input tokens, a few tenths of a cent.
 *   web links     free. TinyFish costs nothing (services/tinyfishClient.js)
 *                 and the extra input tokens are the same rounding error.
 *   a YouTube URL NOT free. Gemini reads the video itself, and video is the
 *                 most expensive input this product buys, metered per second.
 *   a lookup      not free. Turning "make something about the RBI decision"
 *                 into real sources is a model call plus a fan-out over the
 *                 news sources, on demand, for one person.
 *
 * Only the last two carry a price, and both are charged at GENERATION, never
 * at preview. Preview does the free work (validate the URL, read the pages)
 * precisely so a creator can see what we found before deciding to spend.
 */

/**
 * The longest video Import will read.
 *
 * Deliberately far above the 90-second ceiling in routes/transcribe.js, and for
 * the opposite reason. That limit exists because voice profiling learns hooks
 * and sign-offs, which are dense in a Short and diluted across twenty minutes.
 * This is not voice profiling: the video is the STORY, and the videos creators
 * actually want to cover, a press conference, a long-form news segment, a
 * podcast clip, are minutes long by nature. A 90-second cap here would refuse
 * the main use case.
 *
 * What makes ten minutes affordable is that it is priced (below) rather than
 * absorbed. What keeps it bounded is DAILY_SOURCE_READS in routes/source.js and
 * Gemini's own per-key ceiling of roughly eight hours of YouTube a day, which is
 * a per-KEY limit shared by every user, so it is the number to watch first if
 * this feature gets popular.
 */
export const MAX_SOURCE_VIDEO_SECONDS = parseInt(process.env.MAX_SOURCE_VIDEO_SECONDS || "600", 10);

/** How many pages one Import may carry. TinyFish takes ten per request; five is
 *  more material than even an eight-minute script can use without repeating. */
export const MAX_SOURCE_LINKS = 5;

/** Pasted material. Roughly 1,000 words, which is a full article or a long brief. */
export const MAX_SOURCE_TEXT_CHARS = 6000;

/** And the Idea brief, which is an instruction rather than material. */
export const MAX_PROMPT_CHARS = 2000;

/**
 * Video reading, priced in blocks.
 *
 * Gemini bills video by the second, so the honest shape is per-second, but a
 * price that changes when a creator pastes a 4:01 video instead of a 3:59 one is
 * a price nobody can predict. Blocks of two minutes are coarse enough to reason
 * about ("about six credits a couple of minutes") and fine enough that a ten
 * minute video does not cost the same as a ninety second one.
 *
 * The first block is free. A short clip is how somebody tries this feature for
 * the first time, and the base script price already absorbs a read that size.
 */
export const VIDEO_READ_FREE_SECONDS = 120;
export const VIDEO_READ_BLOCK_SECONDS = 120;
export const VIDEO_READ_CREDITS_PER_BLOCK = parseInt(process.env.VIDEO_READ_CREDITS || "6", 10);

/**
 * Looking a topic up before writing about it.
 *
 * Covers one model call to turn a sentence into search queries, a fan-out
 * across the free news sources, and the larger prompt that results. Charged
 * only when it actually produced material: a lookup that comes back empty is
 * refunded in full and the script is written from the brief alone, which is
 * what would have happened had they never ticked the box.
 */
export const LOOKUP_CREDITS = parseInt(process.env.LOOKUP_CREDITS || "10", 10);

/**
 * What reading a given source costs, before a word is written.
 *
 * @param {object} source
 * @param {number} source.videoSeconds  length of the YouTube video, 0 if none
 * @param {boolean} source.lookup       the creator asked us to research it
 * @param {boolean} source.alreadyRead  the material is cached from a previous
 *   order, so the expensive part is already bought and must not be sold twice
 * @returns {{ video: number, lookup: number, total: number }}
 */
export function sourceCost({ videoSeconds = 0, lookup = false, alreadyRead = false } = {}) {
  // ── A REGENERATE MUST NOT RE-BUY THE READ ────────────────────────────────
  // A creator who orders 60 seconds from a video and then wants three minutes
  // from the same video is the expected path, not an edge case. The transcript
  // is cached on the Source document, so the second order pays for writing and
  // nothing else. Charging again would be billing for work we do not redo.
  if (alreadyRead) return { video: 0, lookup: 0, total: 0 };

  const secs = Math.max(0, Math.round(Number(videoSeconds) || 0));
  const billable = Math.max(0, secs - VIDEO_READ_FREE_SECONDS);
  const video = Math.ceil(billable / VIDEO_READ_BLOCK_SECONDS) * VIDEO_READ_CREDITS_PER_BLOCK;
  const look = lookup ? LOOKUP_CREDITS : 0;

  return { video, lookup: look, total: video + look };
}

/**
 * What a new account starts with: three 60-second scripts.
 *
 * Enough to reach the moment the product is actually judged on, a finished
 * script in their own voice, without being enough to run a channel on. A
 * trial that ends before that moment tells them nothing about whether to pay.
 */
export const SIGNUP_FREE_CREDITS = 100;

/**
 * The packs. `credits` is what lands in the wallet; `inr` is what Razorpay
 * charges. Everything else is display, derived here so the pricing page cannot
 * drift from the arithmetic.
 */
export const PACKS = [
  { id: "starter", inr: 199, credits: 250,  label: "Starter" },
  { id: "creator", inr: 499, credits: 700,  label: "Creator", popular: true },
  { id: "studio",  inr: 999, credits: 1600, label: "Studio"  },
];

export function getPack(id) {
  return PACKS.find((p) => p.id === String(id || "")) || null;
}

/** Clamp a requested duration into what we are willing to write and bill for. */
export function clampSeconds(v) {
  const n = Math.round(Number(v) || 0);
  if (!Number.isFinite(n)) return MIN_SECONDS;
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, n));
}

/**
 * What one job costs, in credits.
 *
 * Rounded UP: a 45-second script is 22.5 credits and we charge 23. Rounding
 * down would mean the shortest scripts are sold fractionally below cost, and
 * fractional credits in a wallet are a rounding-error bug waiting to happen,
 * balances are integers everywhere.
 *
 * @param {number} seconds        requested length, pre-clamp is fine
 * @param {boolean} englishTwin   also produce the English version
 * @param {boolean} packaging     also produce title/description/hashtags
 * @param {object} source         what it is written FROM, see sourceCost(). A
 *   news story costs nothing to read here, its research was paid for by the
 *   collector; an Import or a looked-up Idea is not free, and the price on the
 *   button has to say so before it is pressed.
 * @returns {{ total, base, twin, packaging, source, seconds }}
 */
export function quote({ seconds, englishTwin = false, packaging = false, source = null } = {}) {
  const secs = clampSeconds(seconds);
  const base = Math.ceil(secs / SECONDS_PER_CREDIT);
  const twin = englishTwin ? Math.ceil(base * ENGLISH_TWIN_RATE) : 0;
  const pack = packaging ? PACKAGING_CREDITS : 0;
  const src = source ? sourceCost(source).total : 0;
  return {
    seconds: secs, base, twin, packaging: pack, source: src,
    total: base + twin + pack + src,
  };
}

/**
 * Roughly how many words fit in `seconds` at this creator's measured pace.
 *
 * Their own words-per-second comes from their own videos (services/
 * voiceMetrics.js). A generic 150-words-per-minute would be wrong for
 * everybody: the measured range across Indic short-form runs from a little
 * over 2 to nearly 5 words a second, which is a two-fold error at the extremes
 * and for a Short, an over-long script is one that gets cut off mid-sentence.
 *
 * The fallback is only used when the profile has no measured pace yet.
 */
export const FALLBACK_WORDS_PER_SECOND = 2.6;

export function wordTarget(seconds, wordsPerSecond) {
  const wps = Number(wordsPerSecond) > 0 ? Number(wordsPerSecond) : FALLBACK_WORDS_PER_SECOND;
  const mid = Math.round(clampSeconds(seconds) * wps);
  // A range, not a number: a model told "exactly 190 words" pads or truncates to
  // hit it, and both show up as filler or a missing sign-off.
  return { low: Math.round(mid * 0.9), high: Math.round(mid * 1.1), mid, wps };
}

export default {
  SECONDS_PER_CREDIT, MIN_SECONDS, MAX_SECONDS, DURATION_PRESETS,
  ENGLISH_TWIN_RATE, PACKAGING_CREDITS, SIGNUP_FREE_CREDITS, PACKS,
  MAX_SOURCE_VIDEO_SECONDS, MAX_SOURCE_LINKS, MAX_SOURCE_TEXT_CHARS, MAX_PROMPT_CHARS,
  VIDEO_READ_FREE_SECONDS, VIDEO_READ_BLOCK_SECONDS, VIDEO_READ_CREDITS_PER_BLOCK,
  LOOKUP_CREDITS, sourceCost,
  getPack, clampSeconds, quote, wordTarget,
};

/**
 * creditPricing.js — what things cost, in one place.
 *
 * ── WHY THIS IS A MODULE AND NOT NUMBERS SPRINKLED THROUGH ROUTES ────────────
 * Every number below is money. A price that exists in two files WILL disagree
 * eventually — the route charges 30 and the pricing page promises 20, and the
 * first anyone hears of it is a refund request. The API serves its pack list
 * from this file, the script route charges from this file, and the frontend
 * renders whatever the API sent rather than hardcoding a rupee figure.
 *
 * ── THE UNIT: ONE CREDIT BUYS TWO SECONDS OF FINISHED SCRIPT ─────────────────
 * Duration is the honest cost driver in both directions. An eight-minute script
 * costs us roughly eight times a Short in output tokens, and it is worth far
 * more to the creator — long-form earns ₹50-200 per 1,000 views in India where
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
 * These packs sit under it deliberately, and they are ONE-TIME — credits never
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
 * The expensive half of a script is the research — the ranked story, the
 * coverage, the voice profile — and that is already paid for by the first
 * language. The twin is one more model call over the same material.
 *
 * It is discounted rather than free because it is the single most valuable
 * thing on the menu: India-facing content earns ₹50-200 per 1,000 views while
 * English content reaching US viewers earns ₹650-3,300. Half price makes it an
 * obvious yes; free would make it look worthless.
 */
export const ENGLISH_TWIN_RATE = 0.5;

/** Title, description, hashtags and thumbnail lines. Flat — it does not scale
 *  with length, it is one short call whatever the script's duration. */
export const PACKAGING_CREDITS = 15;

/**
 * What a new account starts with: three 60-second scripts.
 *
 * Enough to reach the moment the product is actually judged on — a finished
 * script in their own voice — without being enough to run a channel on. A
 * trial that ends before that moment tells them nothing about whether to pay.
 */
export const SIGNUP_FREE_CREDITS = 90;

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
 * fractional credits in a wallet are a rounding-error bug waiting to happen —
 * balances are integers everywhere.
 *
 * @param {number} seconds        requested length, pre-clamp is fine
 * @param {boolean} englishTwin   also produce the English version
 * @param {boolean} packaging     also produce title/description/hashtags
 * @returns {{ total, base, twin, packaging, seconds }}
 */
export function quote({ seconds, englishTwin = false, packaging = false } = {}) {
  const secs = clampSeconds(seconds);
  const base = Math.ceil(secs / SECONDS_PER_CREDIT);
  const twin = englishTwin ? Math.ceil(base * ENGLISH_TWIN_RATE) : 0;
  const pack = packaging ? PACKAGING_CREDITS : 0;
  return { seconds: secs, base, twin, packaging: pack, total: base + twin + pack };
}

/**
 * Roughly how many words fit in `seconds` at this creator's measured pace.
 *
 * Their own words-per-second comes from their own videos (services/
 * voiceMetrics.js). A generic 150-words-per-minute would be wrong for
 * everybody: the measured range across Indic short-form runs from a little
 * over 2 to nearly 5 words a second, which is a two-fold error at the extremes
 * — and for a Short, an over-long script is one that gets cut off mid-sentence.
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
  getPack, clampSeconds, quote, wordTarget,
};

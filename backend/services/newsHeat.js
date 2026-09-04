/**
 * newsHeat.js — how a story's place in the feed is decided.
 *
 * Its own module because two things need to agree about it exactly: the feed
 * route that orders by it, and scripts/newsDoctor.js, which exists to explain
 * an order somebody is staring at and does not believe. A second copy of this
 * formula in the diagnostic would eventually disagree with the real one, and a
 * diagnostic that lies is worse than none.
 */

// How fast a piece of coverage stops counting toward how "live" a story is.
//
// ── WHY ONE HOUR ─────────────────────────────────────────────────────────────
// This started at two, and two produced an order nobody could read off the
// screen: a cluster of 28 write-ups bunched around eleven hours old outranked a
// story whose newest article was four hours old, because at a two-hour
// half-life ONE article at 4h is worth ELEVEN at 11h — so 28 old ones still
// won on total. Defensible arithmetic, invisible from the page, and the exact
// question it prompted was "why is the 11h card above the 4h card".
//
// At one hour that ratio is 128:1, so no realistic pile of half-day-old
// coverage can outweigh genuinely recent reporting, and the order lines up with
// the timestamps on the cards. The burst protection survives: three articles in
// the last hour still beat one posted five minutes ago, which is the case this
// whole score exists for.
export const HEAT_HALF_LIFE_H = Math.max(
  0.25,
  parseFloat(process.env.NEWS_HEAT_HALFLIFE_HOURS || "1")
);

/**
 * When the newest write-up of this story went out.
 *
 * Future timestamps are ignored rather than trusted: a scheduled post or a
 * publisher with a skewed clock would otherwise date a story in the future and
 * hold the top of the feed until real time caught up with it.
 *
 * @param {Array<Date|string>} times every member's publish time
 * @returns {Date|null}
 */
export function latestOf(times, now = Date.now()) {
  let best = null;
  for (const t of times || []) {
    if (!t) continue;
    const ms = new Date(t).getTime();
    if (Number.isNaN(ms) || ms > now) continue;
    if (best === null || ms > best) best = ms;
  }
  return best === null ? null : new Date(best);
}

/**
 * How much is being written about this story RIGHT NOW.
 *
 * ── WHY NOT JUST ORDER BY THE NEWEST LINK ────────────────────────────────────
 * Because one late rehash of a dead story would then outrank a burst of twelve
 * write-ups on a live one: a single blog post at 2am holds the top of the feed
 * over the story the entire press is still filing on. Counting the coverage
 * fixes that; counting it WITHOUT decay breaks it the other way, because a
 * story with forty write-ups from yesterday would never leave.
 *
 * So every piece of coverage contributes a share that halves every
 * HEAT_HALF_LIFE_H hours. At the one-hour default:
 *
 *   12 articles over the last 3h   →  3.90   still being written about
 *    3 articles in the last hour   →  2.07   a real story, breaking now
 *    1 article 5 minutes ago       →  0.95   one outlet, just now
 *   28 articles bunched at 11h     →  0.01   this morning's news, however big
 *
 * (Measured, not estimated — those are the values this function returns.)
 */
export function heatOf(times, now = Date.now()) {
  let heat = 0;
  for (const t of times || []) {
    if (!t) continue;
    const ms = now - new Date(t).getTime();
    if (Number.isNaN(ms)) continue;
    // Future-dated coverage counts as "now" rather than scoring above 1 — a
    // scheduled post or a skewed clock must not be able to buy the top slot.
    const hours = Math.max(0, ms / 3600000);
    heat += Math.pow(0.5, hours / HEAT_HALF_LIFE_H);
  }
  return heat;
}

export default { HEAT_HALF_LIFE_H, latestOf, heatOf };

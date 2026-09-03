/**
 * newsCadence.js — how often each category is worth working on, and when it
 * was last worked on.
 *
 * ── THE PROBLEM THIS SOLVES ──────────────────────────────────────────────────
 * Collection and ranking are per CATEGORY, never per user: one pass over
 * `ai_tech` serves everyone who picked it, and the thousandth signup adds no
 * cost at all. That part was already true. What was not true is that the work
 * stopped when nobody was watching. A category selected once by a trial user
 * who never came back was still being collected and ranked 96 times a day,
 * forever, for an audience of zero.
 *
 * So the tier a category gets is set by the last time any of its people
 * actually opened the app:
 *
 *   hot    someone signed in within NEWS_HOT_DAYS   → every pass (15 min)
 *   warm   someone signed in within NEWS_WARM_DAYS  → hourly
 *   cold   nobody since then                        → not polled at all
 *
 * A cold category wakes the moment one of its users returns (see
 * wakeCategories), so "cold" costs a returning creator nothing.
 *
 * ── WHY REDIS ────────────────────────────────────────────────────────────────
 * The hourly guard is a set-if-absent with an expiry, which is one round trip
 * and no bookkeeping. Doing it in Mongo would mean reading and writing a
 * schedule document on every tick.
 *
 * Every failure path here is deliberately FAIL-OPEN: if Redis is unreachable,
 * every live category is treated as hot and we poll exactly as often as we did
 * before this file existed. That spends money it did not need to, which is the
 * right way round — the alternative, failing closed, would silently stop
 * collecting news and the first symptom would be an empty feed nobody could
 * explain.
 */
import redis from "../redis.js";
import User from "../models/User.js";
import NewsLock, { LOCK_ID } from "../models/NewsLock.js";
import { isValidCategory, DEFAULT_CATEGORY } from "./categories.js";

const HOT_DAYS = parseInt(process.env.NEWS_HOT_DAYS || "2", 10);
const WARM_DAYS = parseInt(process.env.NEWS_WARM_DAYS || "14", 10);
const WARM_CADENCE_MIN = parseInt(process.env.NEWS_WARM_CADENCE_MIN || "60", 10);

// How long one paid ranking pass covers a category. Ten minutes is shorter than
// the collector's own 15-minute cycle, so a refresh can never be told "too soon"
// for stories that have actually arrived since the last one.
const RANK_COOLDOWN_SEC = parseInt(process.env.NEWS_RANK_COOLDOWN_SEC || "600", 10);

const K_POLL = (cat) => `hg:news:poll:${cat}`;
const K_CHECKED = "hg:news:checked";
const K_KICK = (cat) => `hg:news:kick:${cat}`;
const K_RANK = (cat) => `hg:news:rank:${cat}`;

// Redis is shared with betaFounderProduction, so nothing here may be written
// without the hg: prefix. See redis.js.
const CHECKED_TTL_SEC = 14 * 24 * 3600;

/**
 * "Used the product since this date."
 *
 * last_seen_at is the real signal, but it only exists on accounts that have
 * opened the feed since this field shipped. The fallback to last_login covers
 * everyone else — without it, every pre-existing account would read as dormant
 * on the first deploy and every category would go cold at once.
 */
function activeSince(date) {
  return {
    $or: [
      { last_seen_at: { $gte: date } },
      { last_seen_at: null, last_login: { $gte: date } },
    ],
  };
}

/**
 * Mark an account as still here, at most once an hour.
 *
 * Called on every feed load. The throttle is the whole point: without it this
 * is a database write per page view, to record something whose resolution only
 * needs to be days. Redis holds the throttle, so the common case is one cheap
 * key check and nothing else. No Redis means no throttle, so it falls back to
 * writing every time — correct, just chattier, and the collector's tiers stay
 * accurate either way.
 */
export async function touchSeen(userId) {
  if (!userId) return;

  if (redis) {
    try {
      const fresh = await redis.set(`hg:news:seen:${userId}`, "1", "EX", 3600, "NX");
      if (fresh !== "OK") return;      // already stamped within the hour
    } catch { /* fall through and write */ }
  }

  await User.updateOne({ _id: userId }, { $set: { last_seen_at: new Date() } }).catch(() => {});
}

/**
 * Which categories to work on this pass, and how often each should run.
 *
 * @param {number} intervalMin the scheduler's own tick, so "every pass" can be
 *                             expressed without this module knowing the number
 * @returns {Promise<Array<{id: string, tier: string, cadenceMin: number}>>}
 */
export async function categoryPlan(intervalMin) {
  const now = Date.now();
  const hotSince = new Date(now - HOT_DAYS * 86400000);
  const warmSince = new Date(now - WARM_DAYS * 86400000);

  let hot = [];
  let warm = [];
  try {
    // Two distinct() calls rather than loading users: this returns a handful of
    // category ids however many accounts exist.
    [hot, warm] = await Promise.all([
      User.distinct("categories", activeSince(hotSince)),
      User.distinct("categories", activeSince(warmSince)),
    ]);
  } catch (err) {
    console.error("[news] couldn't read active categories:", err.message);
    return [{ id: DEFAULT_CATEGORY, tier: "hot", cadenceMin: intervalMin }];
  }

  const hotSet = new Set(hot.filter(isValidCategory));
  const warmSet = new Set(warm.filter(isValidCategory));

  const plan = [];
  for (const id of warmSet) {
    const isHot = hotSet.has(id);
    plan.push({
      id,
      tier: isHot ? "hot" : "warm",
      cadenceMin: isHot ? intervalMin : WARM_CADENCE_MIN,
    });
  }

  // No users at all, or none in a fortnight. Keeping one category running means
  // a demo, a fresh deploy, or the first signup of the week lands on a product
  // with something in it rather than on an empty page.
  if (!plan.length) return [{ id: DEFAULT_CATEGORY, tier: "hot", cadenceMin: intervalMin }];

  return plan;
}

/**
 * Reserve this category's slot for the current pass.
 *
 * Hot categories run every tick, so they skip Redis entirely — the guard would
 * expire exactly as often as it is asked, which is a round trip to learn "yes".
 *
 * @returns {Promise<boolean>} true when this pass should do the work
 */
export async function claimPoll(cat, cadenceMin, intervalMin) {
  if (cadenceMin <= intervalMin) return true;
  if (!redis) return true;                       // fail open: poll as before

  try {
    // Expires on its own, so a crashed pass cannot leave a category paused.
    const ok = await redis.set(K_POLL(cat), "1", "EX", cadenceMin * 60, "NX");
    return ok === "OK";
  } catch {
    return true;
  }
}

/**
 * Record that a category was just collected.
 *
 * Written twice on purpose. Redis serves the feed's "checked N minutes ago"
 * without touching Mongo on a page load; the lock document is the copy that
 * outlives a Redis restart and works from an instance outside the VPC.
 */
export async function markChecked(cat, at = new Date()) {
  const iso = at.toISOString();

  if (redis) {
    try {
      await redis.hset(K_CHECKED, cat, iso);
      await redis.expire(K_CHECKED, CHECKED_TTL_SEC);
    } catch { /* the Mongo copy below is the one that has to land */ }
  }

  await NewsLock.updateOne(
    { _id: LOCK_ID },
    { $set: { [`checked.${cat}`]: at } },
    { upsert: true }
  ).catch(() => {});
}

/**
 * When these categories were last collected.
 *
 * Returns the OLDEST of them: a feed drawn from three categories is only as
 * current as its stalest one, and claiming otherwise would be the kind of
 * reassuring number that is quietly wrong.
 *
 * @returns {Promise<Date|null>}
 */
export async function lastCheckedAt(cats) {
  const ids = (cats || []).filter(Boolean);
  if (!ids.length) return null;

  if (redis) {
    try {
      const vals = await redis.hmget(K_CHECKED, ...ids);
      const times = vals.map((v) => (v ? new Date(v) : null)).filter((d) => d && !isNaN(d));
      // Every id must be present, or the oldest is a guess about the rest.
      if (times.length === ids.length) return new Date(Math.min(...times.map((d) => d.getTime())));
    } catch { /* fall through to Mongo */ }
  }

  try {
    const doc = await NewsLock.findById(LOCK_ID).select("checked last_run_at").lean();
    if (!doc) return null;
    const times = ids
      .map((id) => doc.checked?.[id])
      .filter(Boolean)
      .map((d) => new Date(d))
      .filter((d) => !isNaN(d));
    if (times.length) return new Date(Math.min(...times.map((d) => d.getTime())));
    return doc.last_run_at ? new Date(doc.last_run_at) : null;
  } catch {
    return null;
  }
}

/**
 * Bring categories back from cold, because one of their people just showed up.
 *
 * Clearing the guard is what makes the next scheduled tick pick them up. The
 * caller usually also wants an immediate pass — see kickoffCategories in the
 * scheduler — because a category that has been cold for a fortnight may have
 * nothing left inside the feed's window, and a returning creator should not
 * meet an empty page while a timer runs down.
 */
export async function wakeCategories(cats) {
  const ids = (cats || []).filter(isValidCategory);
  if (!ids.length || !redis) return;
  try {
    await redis.del(...ids.map(K_POLL));
  } catch { /* the guard expires on its own soon enough */ }
}

/**
 * Take the right to SPEND MONEY ranking one category.
 *
 * This is the throttle the whole on-demand model rests on. Ranking now fires
 * from user actions — opening Topics, pressing Refresh, signing in — and those
 * are things a person does repeatedly and several people do at once. Without a
 * guard, three refreshes are three ranking calls, and ten users sharing a
 * category multiply that again.
 *
 * Unlike everything else in this file it does NOT simply fail open, because
 * failing open here means unbounded spend. Redis is the fast path; when it is
 * unreachable the same decision is made with one atomic Mongo update, which is
 * affordable because this runs on refreshes rather than on every page view.
 *
 * @returns {Promise<boolean>} true when the caller should do the ranking
 */
export async function claimRank(cat, seconds = RANK_COOLDOWN_SEC) {
  if (redis) {
    try {
      return (await redis.set(K_RANK(cat), "1", "EX", seconds, "NX")) === "OK";
    } catch { /* fall through to the database guard */ }
  }

  // Matches only when this category has never been ranked, or was ranked longer
  // ago than the cooldown. One round trip, and atomic, so two instances racing
  // on the same refresh cannot both win.
  const cutoff = new Date(Date.now() - seconds * 1000);
  try {
    const r = await NewsLock.findOneAndUpdate(
      {
        _id: LOCK_ID,
        $or: [
          { [`ranked.${cat}`]: { $exists: false } },
          { [`ranked.${cat}`]: null },
          { [`ranked.${cat}`]: { $lt: cutoff } },
        ],
      },
      { $set: { [`ranked.${cat}`]: new Date() } },
      { upsert: true, new: false }
    );
    return r === null || !r.ranked?.[cat] || new Date(r.ranked[cat]) < cutoff;
  } catch (err) {
    // Upsert race: the other instance created the row microseconds earlier.
    if (err?.code === 11000) return false;
    console.error(`[news] rank guard failed for ${cat}:`, err.message);
    return false;   // deliberately closed: an unknown state must not bill
  }
}

/**
 * Has this category been collected recently enough that a refresh does not need
 * to go out to the sources again?
 *
 * Collection is free but slow — a full multi-source pass is over a minute, which
 * is far too long to hold a button press open. The scheduled collector runs
 * every 15 minutes, so a refresh almost never needs to collect; it needs to RANK
 * what the collector already brought in.
 */
export async function isFreshlyCollected(cat, withinMin = 20) {
  const at = await lastCheckedAt([cat]);
  return !!at && Date.now() - at.getTime() < withinMin * 60000;
}

/**
 * Take the right to run an out-of-band pass for one category.
 *
 * Fifty people returning at once must not become fifty collections. Without
 * Redis there is no cheap way to coordinate that across instances, so the
 * kickoff simply does not run and the category waits for the next scheduled
 * tick — the safe direction to fail for something that only saves waiting.
 */
export async function claimKickoff(cat, seconds = 300) {
  if (!redis) return false;
  try {
    return (await redis.set(K_KICK(cat), "1", "EX", seconds, "NX")) === "OK";
  } catch {
    return false;
  }
}

export default {
  categoryPlan, claimPoll, markChecked, lastCheckedAt,
  wakeCategories, claimKickoff, claimRank, isFreshlyCollected, touchSeen,
};

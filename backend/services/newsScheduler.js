/**
 * newsScheduler.js — keep the news coming in, and rank it when someone looks.
 *
 * ── WHAT RUNS ON THE CLOCK, AND WHAT DOES NOT ────────────────────────────────
 * Collection does. It is free, and it is lossy to skip: Google News serves only
 * `when:1d` and HN Algolia reaches back 36 hours, so an unpolled window is gone
 * for good. It also owns `first_seen_at`, the clock behind "you are early on
 * this" — collect only when a user logs in and that timestamp starts recording
 * when somebody happened to open the app instead of when the story broke.
 *
 * Ranking does not. It costs money, and running it ninety-six times a day per
 * category meant paying to judge stories for an empty room. It now fires from
 * ensureRanked() on sign-in and on Fetch, behind a ten-minute per-category
 * throttle — and Fetch also runs the ONE source cheap and fast enough to belong
 * on a button press (see fetchAndRank), so that pressing it can return a story
 * the collector has not been to look for yet.
 *
 * ── WHY THERE'S A DATABASE CLAIM AND NOT JUST setInterval ────────────────────
 * Cloud Run (and anything else that autoscales) can run several instances of
 * this process at once. A bare interval in each of them would fetch every source
 * N times and, worse, spend N ranking calls — the cost multiplies silently with
 * traffic, which is the exact class of bug that makes an API bill surprising.
 *
 * So the interval only *attempts* a run; an atomic findOneAndUpdate decides who
 * actually does it. Same pattern as the reference project's daily-refresh claims,
 * minus the extra dependency: one collection job doesn't justify pulling in Agenda.
 */
import NewsLock, { LOCK_ID } from "../models/NewsLock.js";
import { collectNews } from "./newsCollector.js";
import { rankNews } from "./newsRanker.js";
import { backfillBriefs } from "./newsBriefService.js";
import { getCategory } from "./categories.js";
import {
  categoryPlan, claimPoll, markChecked, claimKickoff, claimRank,
  isFreshlyCollected, wakeCategories,
} from "./newsCadence.js";

const INTERVAL_MIN = parseInt(process.env.NEWS_POLL_MINUTES || "15", 10);

// Briefs written per category per pass. Matched to MAX_CARDS in NewsFeed.js —
// the number of cards the feed will actually show — so every visible story is
// readable the moment it is opened rather than generating a brief with the
// reader waiting on it. Raise both together or the tail of the feed pays for a
// brief on every single open. Ranking is on-demand now, so this fires a few
// times a day, not ninety-six.
const BRIEF_LIMIT = parseInt(process.env.NEWS_BRIEF_LIMIT || "15", 10);

// Ranking is demand-driven now: it runs when somebody signs in, opens Topics or
// presses Refresh, not on the collector's clock. Flip this to put the old
// behaviour back without a deploy, if the feed ever needs to be warm for
// somebody who is not the one asking for it.
const RANK_ON_SCHEDULE =
  String(process.env.NEWS_RANK_ON_SCHEDULE || "false").toLowerCase() === "true";

/**
 * Try to claim the next run. Atomic: the update only matches when the existing
 * lock has expired, so exactly one instance can win.
 *
 * The lease is deliberately longer than a run takes (~75s collect + ~10s rank)
 * so a slow pass isn't stolen mid-flight, but short enough that a crashed
 * instance doesn't block the next cycle for long.
 */
async function claim(leaseMs) {
  const now = new Date();
  try {
    const r = await NewsLock.findOneAndUpdate(
      { _id: LOCK_ID, $or: [{ locked_until: { $lt: now } }, { locked_until: null }] },
      { $set: { locked_until: new Date(now.getTime() + leaseMs), last_run_at: now } },
      { upsert: true, new: false }
    );
    // No previous doc = we just created it = we hold the lock.
    return r === null || !r.locked_until || r.locked_until < now;
  } catch (err) {
    // Upsert race: the other instance created it microseconds earlier. It won.
    if (err?.code === 11000) return false;
    throw err;
  }
}

/**
 * Collect one category. Free, and the half that must never be skipped.
 *
 * Google News only serves `when:1d` and HN Algolia only reaches back 36 hours,
 * so a window we do not poll is gone permanently — there is no way to ask for
 * yesterday later. That is why collection stayed on a clock when ranking moved
 * off it: skipping a paid pass costs nothing but a few seconds of staleness,
 * while skipping a free one loses stories that cannot be recovered at any price.
 */
async function collectCategory(cat) {
  const collected = await collectNews(cat);

  // Stamped after collection, not after ranking: this is what the feed shows as
  // "checked N minutes ago", and the honest answer to that is when we last went
  // and looked, whether or not there turned out to be anything to judge.
  await markChecked(cat);
  return collected;
}

/**
 * Score what has been collected but not yet judged, then write the briefs the
 * feed will need. This is the part that costs money.
 *
 * ── WHY THIS IS NOT ON THE CLOCK ─────────────────────────────────────────────
 * It used to run after every collection, ninety-six times a day per category,
 * whether or not a single person opened the app. That is roughly $7 a month per
 * category spent ranking stories for an empty room. Now it runs when somebody is
 * actually about to read the feed: on sign-in, on opening Topics, and on
 * Refresh. Cost follows use instead of following the clock.
 *
 * The backlog cannot pile up: the ranker takes at most one batch from a
 * 36-hour window, so returning after a week is one ordinary call, not a bill.
 *
 * @returns {{ ranked, detailed, briefs, usd, skipped }}
 */
export async function ensureRanked(cat, { force = false } = {}) {
  if (!getCategory(cat)) return { skipped: true, reason: "unknown_category" };

  // The throttle the whole on-demand model rests on. Ten page loads, three
  // refreshes and four users all arriving at once must add up to one paid pass.
  if (!force && !(await claimRank(cat))) {
    return { ranked: 0, detailed: 0, briefs: 0, usd: 0, skipped: true, reason: "cooldown" };
  }

  let ranked = { ranked: 0, detailed: 0, usd: 0 };
  try {
    ranked = await rankNews(cat);
  } catch (err) {
    console.error(`[news:${cat}] ranking failed:`, err.message);
  }

  let briefs = 0;
  try {
    briefs = await backfillBriefs(cat, { limit: BRIEF_LIMIT });
  } catch (err) {
    console.error(`[news:${cat}] brief pass failed:`, err.message);
  }

  return {
    ranked: ranked.ranked || 0,
    detailed: ranked.detailed || 0,
    briefs,
    usd: ranked.usd || 0,
    skipped: false,
  };
}

/**
 * What the Fetch button runs: go and get the newest stories, then judge them.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * Refresh used to rank only, on the reasoning that a full collection is over a
 * minute of fan-out and the scheduled collector had already been. Both halves of
 * that were true and the conclusion was still wrong: pressing a button named
 * "Fetch new topics" could not, under any circumstance, produce a topic that was
 * not already in the database. On a quiet collector — a restart, a cold
 * category, a source that started failing — the button was a no-op with a
 * reassuring spinner, and the honest answer to "why is the top story ten hours
 * old" was invisible from the outside.
 *
 * The paid news source changes what is possible here: it is ONE http request,
 * about a second, and it reaches back further than any free source can. So a
 * refresh now genuinely fetches. The free sources stay on the scheduler's clock
 * where their minute and a half doesn't keep anyone waiting.
 *
 * Ranking is FORCED when that fetch actually brought something in, and only
 * then. Otherwise a creator pays for fresh articles and still sees yesterday's
 * feed, because the ten-minute ranking cooldown was holding the scores back —
 * which is the same bug one layer down. Nothing runs away: the fetch has its own
 * per-category gap, so the second press inside ten minutes inserts nothing, and
 * a forced rank cannot follow.
 *
 * @returns {{ inserted, ranked, briefs, usd, skipped }}
 */
export async function fetchAndRank(cat) {
  if (!getCategory(cat)) return { skipped: true, reason: "unknown_category" };

  let inserted = 0;
  try {
    const collected = await collectNews(cat, { fast: true, userInitiated: true });
    inserted = collected.inserted || 0;
  } catch (err) {
    // The feed still renders what is already ranked, and the scheduled pass will
    // be along shortly. Never worth failing a button press over.
    console.error(`[news:${cat}] fast collect failed:`, err.message);
  }

  // Deliberately no markChecked(): "checked N minutes ago" means a FULL pass
  // over every source, and stamping it here would both overstate what we looked
  // at and make the next sign-in kickoff skip its real collection.
  const ranked = await ensureRanked(cat, { force: inserted > 0 });
  return { inserted, ...ranked };
}

/**
 * Everything for one category, used by the wake-up path where a returning
 * creator needs both halves done before they look at anything.
 */
async function runCategory(cat) {
  // Skips the network entirely when the scheduled collector has been here
  // recently — collection is over a minute of fan-out across a dozen sources,
  // and repeating it because somebody signed in gains nothing.
  const fresh = await isFreshlyCollected(cat);
  const collected = fresh ? { inserted: 0, skipped: true } : await collectCategory(cat);

  const out = await ensureRanked(cat);
  return { category: cat, inserted: collected.inserted, ...out };
}

async function runOnce() {
  const plan = await categoryPlan(INTERVAL_MIN);
  console.log(
    `[news] pass over ${plan.length} live categor${plan.length === 1 ? "y" : "ies"}: ` +
    plan.map((p) => `${p.id}(${p.tier})`).join(", ")
  );

  const summary = [];
  let totalUsd = 0;
  let skipped = 0;

  // Sequential on purpose. These are network-bound passes against shared public
  // endpoints (Google News, HN), and firing eight at once is how a polite
  // consumer turns into one that gets rate-limited.
  for (const { id: cat, tier, cadenceMin } of plan) {
    // A warm category runs hourly, not every tick. The guard is a Redis
    // set-if-absent with an expiry, so nothing has to be cleaned up and a
    // crashed pass cannot leave a category paused for longer than its cadence.
    if (!(await claimPoll(cat, cadenceMin, INTERVAL_MIN))) {
      skipped++;
      continue;
    }

    try {
      // COLLECTION ONLY. The scheduled pass deliberately does not rank: that is
      // the paid half, and it now happens when somebody is about to read the
      // feed rather than on a timer nobody is watching. Set
      // NEWS_RANK_ON_SCHEDULE=true to put it back without a deploy.
      const collected = await collectCategory(cat);

      let row = { category: cat, inserted: collected.inserted, usd: 0 };
      if (RANK_ON_SCHEDULE && collected.inserted > 0) {
        row = { ...row, ...(await ensureRanked(cat)) };
      }

      totalUsd += row.usd || 0;
      summary.push({ ...row, tier });
    } catch (err) {
      // One category failing must never stop the others — the same reasoning as
      // Promise.allSettled inside the collector, one level up.
      console.error(`[news:${cat}] pass failed:`, err.message);
      summary.push({ category: cat, tier, error: err.message });
    }
  }

  if (skipped) console.log(`[news] ${skipped} warm categor${skipped === 1 ? "y" : "ies"} not due this tick`);

  const gathered = summary.reduce((n, r) => n + (r.inserted || 0), 0);
  console.log(
    `[news] collected ${gathered} new item(s)` +
    (totalUsd > 0 ? ` · $${totalUsd.toFixed(4)}` : " · no ranking (on demand)")
  );

  await NewsLock.updateOne(
    { _id: LOCK_ID },
    { $set: { last_result: { at: new Date(), categories: summary, usd: totalUsd } } }
  ).catch(() => {});
}

/**
 * Somebody just showed up. Make sure their categories have something in them.
 *
 * Called on sign-in and when a selection changes. A category nobody has opened
 * for a fortnight stops being polled, and the feed's window is 48 hours, so by
 * the time its owner comes back there may be nothing left inside it. Waiting up
 * to fifteen minutes for the next tick would mean a returning creator meets an
 * empty page, which is the one impression this product cannot afford twice.
 *
 * Deliberately fire-and-forget: sign-in must not wait on a network-bound
 * collection, and if this fails the scheduled tick does the same work shortly.
 * claimKickoff is what stops fifty simultaneous logins becoming fifty passes.
 */
export function kickoffCategories(cats) {
  const ids = [...new Set((cats || []).filter((c) => getCategory(c)))];
  if (!ids.length) return;

  (async () => {
    await wakeCategories(ids);          // let the next scheduled tick have them too

    for (const cat of ids) {
      try {
        if (!(await claimKickoff(cat))) continue;   // someone else is already on it
        console.log(`[news:${cat}] kickoff — a user just returned`);
        await runCategory(cat);
      } catch (err) {
        console.error(`[news:${cat}] kickoff failed:`, err.message);
      }
    }
  })().catch(() => {});
}

export function startNewsScheduler() {
  if (String(process.env.NEWS_POLL_ENABLED || "true").toLowerCase() === "false") {
    console.log("[news] scheduler disabled (NEWS_POLL_ENABLED=false)");
    return;
  }

  const intervalMs = INTERVAL_MIN * 60 * 1000;

  const tick = async () => {
    try {
      if (!(await claim(intervalMs - 30_000))) return; // another instance has it
      await runOnce();
    } catch (err) {
      console.error("[news] scheduled run failed:", err.message);
    }
  };

  // Staggered rather than immediate: on a cold start the server should answer
  // health checks before a 75-second network-bound collection begins.
  setTimeout(tick, 20_000);
  setInterval(tick, intervalMs);

  console.log(`[news] scheduler on — every ${INTERVAL_MIN} min`);
}

export default { startNewsScheduler, kickoffCategories, ensureRanked, fetchAndRank };

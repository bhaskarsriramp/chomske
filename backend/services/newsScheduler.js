/**
 * newsScheduler.js — run collection + ranking on a loop.
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
import { categoryPlan, claimPoll, markChecked, claimKickoff, wakeCategories } from "./newsCadence.js";

const INTERVAL_MIN = parseInt(process.env.NEWS_POLL_MINUTES || "15", 10);

// Briefs written per category per pass. At four passes an hour this is up to 24
// stories an hour per category, which is far more than any category actually
// produces — so in practice it is a ceiling that never binds, and on the day a
// category does go wild it is the thing that stops the bill going with it.
const BRIEF_LIMIT = parseInt(process.env.NEWS_BRIEF_LIMIT || "6", 10);

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
 * Do one category: collect, rank what is new, write the briefs the feed will
 * need. Shared by the scheduled pass and by the wake-up a returning user
 * triggers, so both paths do exactly the same work in the same order.
 */
async function runCategory(cat) {
  const collected = await collectNews(cat);

  // Stamped after collection, not after ranking: this is what the feed shows as
  // "checked N minutes ago", and the honest answer to that is when we last went
  // and looked, whether or not there turned out to be anything to judge.
  await markChecked(cat);

  // Rank only when something new arrived. A pass with nothing new has nothing
  // to judge, and skipping it is the difference between paying once a day and
  // paying every 15 minutes, per category.
  let ranked = { ranked: 0, detailed: 0, usd: 0 };
  if (collected.inserted > 0) {
    ranked = await rankNews(cat);
  } else {
    console.log(`[news:${cat}] nothing new — skipping the ranking call`);
  }

  // Write the reading briefs for whatever now qualifies for the feed. Done here
  // rather than when a story is opened because the alternative is a creator
  // arrowing down the list and firing a generation per row. Capped, so a heavy
  // news day costs more time, never unbounded money.
  let briefs = 0;
  try {
    briefs = await backfillBriefs(cat, { limit: BRIEF_LIMIT });
  } catch (err) {
    console.error(`[news:${cat}] brief pass failed:`, err.message);
  }

  return { category: cat, inserted: collected.inserted, ranked: ranked.ranked, detailed: ranked.detailed, briefs, usd: ranked.usd };
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
      const row = await runCategory(cat);
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

  if (totalUsd > 0) console.log(`[news] pass complete · $${totalUsd.toFixed(4)}`);

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

export default { startNewsScheduler, kickoffCategories };

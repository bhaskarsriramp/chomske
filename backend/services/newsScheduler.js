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
import mongoose from "mongoose";
import User from "../models/User.js";
import { collectNews } from "./newsCollector.js";
import { rankNews } from "./newsRanker.js";
import { isValidCategory, DEFAULT_CATEGORY } from "./categories.js";

const INTERVAL_MIN = parseInt(process.env.NEWS_POLL_MINUTES || "15", 10);

// Tiny standalone collection — the lock is infrastructure, not domain data, so
// it doesn't belong in models/.
const LockSchema = new mongoose.Schema({
  _id: String,
  locked_until: Date,
  last_run_at: Date,
  last_result: mongoose.Schema.Types.Mixed,
});
const Lock = mongoose.models.NewsLock || mongoose.model("NewsLock", LockSchema, "news_locks");

const LOCK_ID = "news-poll";

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
    const r = await Lock.findOneAndUpdate(
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
 * Categories at least one user has actually chosen.
 *
 * ── THIS IS THE COST CONTROL ─────────────────────────────────────────────────
 * Collection is free but ranking is not, so running every category in the
 * catalogue would multiply the bill by eight to serve feeds nobody opens. Reading
 * the selections first means spend scales with what users want rather than with
 * how many categories we happen to support — the difference between adding a
 * category being free and it being a standing charge.
 *
 * With no users yet, the default keeps the product demoable rather than empty.
 */
async function activeCategories() {
  try {
    const ids = await User.distinct("categories");
    const live = (ids || []).filter(isValidCategory);
    return live.length ? live : [DEFAULT_CATEGORY];
  } catch (err) {
    console.error("[news] couldn't read active categories:", err.message);
    return [DEFAULT_CATEGORY];
  }
}

async function runOnce() {
  const cats = await activeCategories();
  console.log(`[news] pass over ${cats.length} active categor${cats.length === 1 ? "y" : "ies"}: ${cats.join(", ")}`);

  const summary = [];
  let totalUsd = 0;

  // Sequential on purpose. These are network-bound passes against shared public
  // endpoints (Google News, HN), and firing eight at once is how a polite
  // consumer turns into one that gets rate-limited.
  for (const cat of cats) {
    try {
      const collected = await collectNews(cat);

      // Rank only when something new arrived. A pass with nothing new has nothing
      // to judge, and skipping it is the difference between paying once a day and
      // paying every 15 minutes, per category.
      let ranked = { ranked: 0, usd: 0 };
      if (collected.inserted > 0) {
        ranked = await rankNews(cat);
      } else {
        console.log(`[news:${cat}] nothing new — skipping the ranking call`);
      }

      totalUsd += ranked.usd || 0;
      summary.push({ category: cat, inserted: collected.inserted, ranked: ranked.ranked, usd: ranked.usd });
    } catch (err) {
      // One category failing must never stop the others — the same reasoning as
      // Promise.allSettled inside the collector, one level up.
      console.error(`[news:${cat}] pass failed:`, err.message);
      summary.push({ category: cat, error: err.message });
    }
  }

  if (totalUsd > 0) console.log(`[news] pass complete · $${totalUsd.toFixed(4)}`);

  await Lock.updateOne(
    { _id: LOCK_ID },
    { $set: { last_result: { at: new Date(), categories: summary, usd: totalUsd } } }
  ).catch(() => {});
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

export default { startNewsScheduler };

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
import { collectNews } from "./newsCollector.js";
import { rankNews } from "./newsRanker.js";

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

async function runOnce() {
  const collected = await collectNews();
  // Rank only when something new arrived — a pass with no new stories has
  // nothing to judge, and skipping it is the difference between ~₹2/day and
  // ~₹2 every 15 minutes.
  let ranked = { ranked: 0, usd: 0 };
  if (collected.inserted > 0) {
    ranked = await rankNews();
  } else {
    console.log("[news] nothing new — skipping the ranking call");
  }

  await Lock.updateOne(
    { _id: LOCK_ID },
    { $set: { last_result: { at: new Date(), inserted: collected.inserted, ranked: ranked.ranked, usd: ranked.usd } } }
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

import mongoose from "mongoose";

/**
 * NewsLock — the collector's single coordination row.
 *
 * It started life inside newsScheduler.js on the reasoning that a lease is
 * infrastructure rather than domain data. Three modules now read it (the
 * scheduler claims it, the cadence layer stamps it, the feed route reads
 * "when did we last check"), so it has earned a file. Two guarded model
 * definitions of the same collection in different modules is how you get an
 * OverwriteModelError on the second import.
 *
 * `checked` is a per-category map of when that category last completed a
 * collection. It duplicates what Redis holds, on purpose: Redis is the fast
 * path for the feed's "checked 4 minutes ago" line, and this is the copy that
 * survives a Redis restart or an instance running outside the VPC.
 */
const NewsLockSchema = new mongoose.Schema({
  _id: String,
  locked_until: Date,
  last_run_at: Date,
  last_result: mongoose.Schema.Types.Mixed,
  checked: { type: mongoose.Schema.Types.Mixed, default: {} },
});

export const LOCK_ID = "news-poll";

export default mongoose.models.NewsLock || mongoose.model("NewsLock", NewsLockSchema, "news_locks");

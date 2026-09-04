/**
 * newsDoctor.js — why is the feed not showing anything new?
 *
 * Run on the VM, where the real env and the real database are:
 *   cd ~/chomske/backend && node scripts/newsDoctor.js
 *
 * ── WHAT IT IS FOR ───────────────────────────────────────────────────────────
 * "The top story is ten hours old" has five different causes and they look
 * identical from the app:
 *
 *   1. Nothing is being COLLECTED — the scheduler is not running, or this
 *      category went cold and is not being polled at all.
 *   2. Things are being collected but not RANKED, so they sit at ai_score -1
 *      and the feed's filter hides them. This is the quiet one: it costs money
 *      to fix, fails silently when the Gemini key is out of quota, and leaves a
 *      feed that looks frozen rather than broken.
 *   3. They are ranked, and genuinely scored below the bar. A real quiet day.
 *   4. The apidirect key is out of credit, so the only minutes-fresh source is
 *      gone and everything left has a floor of hours.
 *   5. It is one running story, so new coverage keeps merging into a cluster
 *      whose timestamp is when it broke — the feed is updating and cannot show
 *      it. Look at "newest item" against "newest cluster start".
 *
 * Every number below separates one of those from the others. Nothing here
 * writes, spends, or calls an API — it reads the database and the key rows.
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectToMongo from "../db.js";
import NewsItem from "../models/NewsItem.js";
import User from "../models/User.js";
import NewsLock, { LOCK_ID } from "../models/NewsLock.js";
import ApidirectAPIs from "../models/ApidirectAPIs.js";
import { CATEGORIES } from "../services/categories.js";

const ago = (d) => {
  if (!d) return "never";
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = m / 60;
  return h < 48 ? `${h.toFixed(1)}h ago` : `${(h / 24).toFixed(1)}d ago`;
};

async function main() {
  await connectToMongo();
  console.log(`\n=== news doctor · ${new Date().toISOString()} ===\n`);

  const lock = await NewsLock.findById(LOCK_ID).lean();
  console.log("SCHEDULER");
  console.log(`  last tick        ${ago(lock?.last_run_at)}`);
  console.log(`  lease held until ${lock?.locked_until ? new Date(lock.locked_until).toISOString() : "—"}`);
  // A last tick older than NEWS_POLL_MINUTES means the process running the
  // interval is not alive — which is the whole answer, and no per-category
  // number below will make sense until it is.
  const pollMin = parseInt(process.env.NEWS_POLL_MINUTES || "15", 10);
  if (!lock?.last_run_at || Date.now() - new Date(lock.last_run_at).getTime() > pollMin * 60000 * 2) {
    console.log(`  ⚠️  NO TICK IN OVER ${pollMin * 2} MINUTES — the collector is not running.`);
  }

  console.log("\nCATEGORIES");
  // Only the ones somebody actually picked: an unselected category is supposed
  // to be empty and its emptiness is not a symptom.
  const picked = new Set((await User.distinct("categories")) || []);

  for (const cat of CATEGORIES) {
    if (!picked.has(cat.id)) continue;

    const [newest, newestRanked, unranked, above, last24] = await Promise.all([
      NewsItem.findOne({ category: cat.id }).sort({ first_seen_at: -1 }).select("first_seen_at title").lean(),
      NewsItem.findOne({ category: cat.id, ai_score: { $gte: 5 } }).sort({ first_seen_at: -1 })
        .select("first_seen_at ai_score title").lean(),
      NewsItem.countDocuments({ category: cat.id, ai_score: -1, first_seen_at: { $gte: new Date(Date.now() - 36 * 3600000) } }),
      NewsItem.countDocuments({ category: cat.id, ai_score: { $gte: 5 }, first_seen_at: { $gte: new Date(Date.now() - 48 * 3600000) } }),
      NewsItem.countDocuments({ category: cat.id, first_seen_at: { $gte: new Date(Date.now() - 24 * 3600000) } }),
    ]);

    console.log(`\n  ${cat.id}`);
    console.log(`    collected (full)   ${ago(lock?.checked?.[cat.id])}`);
    console.log(`    paid fetch         ${ago(lock?.fetched?.[cat.id])}`);
    console.log(`    paid rank          ${ago(lock?.ranked?.[cat.id])}`);
    console.log(`    newest item        ${ago(newest?.first_seen_at)}  ${newest?.title?.slice(0, 55) || ""}`);
    console.log(`    newest ON THE FEED ${ago(newestRanked?.first_seen_at)}  (score ${newestRanked?.ai_score ?? "—"})`);
    console.log(`    in last 24h        ${last24} items · ${above} above the bar · ${unranked} still unranked`);

    // The two readings that name the cause outright.
    if (last24 === 0) {
      console.log("    → NOTHING IS COMING IN. Collection, not ranking, is the problem.");
    } else if (unranked > 20 && above === 0) {
      console.log("    → COLLECTED BUT NOT JUDGED. Ranking is failing or throttled — check AISTUDIO_KEY quota.");
    } else if (newest && newestRanked &&
               new Date(newest.first_seen_at) - new Date(newestRanked.first_seen_at) > 3 * 3600000) {
      console.log("    → Fresh items exist but none cleared the bar. Either a quiet day, or the ranker is scoring low.");
    }
  }

  console.log("\nAPIDIRECT KEYS");
  const keys = await ApidirectAPIs.find({}).lean();
  if (!keys.length) {
    console.log("  none recorded (a key set only in env is recorded on its first use)");
  }
  for (const k of keys) {
    const tail = `…${String(k.apidirect_key || "").slice(-4)}`;
    const cooling = k.cooldown_until && new Date(k.cooldown_until) > new Date()
      ? ` · cooling until ${new Date(k.cooldown_until).toISOString()}`
      : "";
    console.log(
      `  ${tail} ${k.label || ""} [${k.status || "ok"}]${cooling}\n` +
      `      ok:${k.request_count || 0} err:${k.error_count || 0} strikes:${k.track_403 || 0} ` +
      `last ok ${ago(k.last_success_at)}` +
      (k.last_error_code ? `\n      last error: ${k.last_status_code} ${k.last_error_code} — ${k.last_error} (${ago(k.last_error_at)})` : "")
    );
  }

  console.log("");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[news-doctor] failed:", err);
  process.exit(1);
});

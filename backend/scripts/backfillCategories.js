/**
 * backfillCategories.js — one-time migration for the category release.
 *
 * Run once on the VM after deploying the category work:
 *   cd ~/chomske/backend && node scripts/backfillCategories.js
 *
 * ── WHY THIS IS NEEDED ───────────────────────────────────────────────────────
 * Two things broke for rows written before categories existed.
 *
 * 1. NO `category` FIELD. The schema gained `category: { default: "ai_tech" }`,
 *    but a Mongoose default only applies when a NEW document is created — it
 *    does not touch rows already in the database. The feed matches with
 *    `{ category: { $in: [...] } }`, and a document with no `category` field
 *    does not match $in at all. So every pre-existing story became invisible,
 *    which is exactly the empty feed this fixes.
 *
 * 2. STALE `url_hash`. Dedupe keys are now scoped by category, so an old row's
 *    hash no longer matches what the collector computes for the same URL. Left
 *    alone, the next pass would re-insert every story as "new" — duplicating the
 *    feed and resetting first_seen_at, which would mark week-old news as
 *    Breaking. Recomputing keeps the existing rows as the dedupe targets.
 *
 * Safe to run more than once: both updates are scoped to rows that still need
 * them, and the hash mapping is 1-to-1 so no two rows can collide.
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectToMongo from "../db.js";
import NewsItem from "../models/NewsItem.js";
import { urlHash } from "../utils/normalize.js";
import { DEFAULT_CATEGORY } from "../services/categories.js";

async function main() {
  await connectToMongo();

  const total = await NewsItem.countDocuments({});
  console.log(`\n[backfill] ${total} news items in "${mongoose.connection.name}"\n`);

  // ── 1. category ────────────────────────────────────────────────────────────
  const missing = await NewsItem.countDocuments({ category: { $exists: false } });
  if (missing) {
    const r = await NewsItem.updateMany(
      { category: { $exists: false } },
      { $set: { category: DEFAULT_CATEGORY } }
    );
    console.log(`[backfill] category → "${DEFAULT_CATEGORY}" on ${r.modifiedCount} rows (${missing} were missing it)`);
  } else {
    console.log("[backfill] category: nothing missing");
  }

  // ── 2. url_hash ────────────────────────────────────────────────────────────
  // Recomputed in batches rather than one big read: the collection grows without
  // bound and loading it whole would eventually not fit in memory.
  const cursor = NewsItem.find({}, { url: 1, category: 1, url_hash: 1 }).lean().cursor();
  let checked = 0;
  let changed = 0;
  let ops = [];

  const flush = async () => {
    if (!ops.length) return;
    try {
      await NewsItem.bulkWrite(ops, { ordered: false });
    } catch (err) {
      // 11000 here would mean two rows genuinely share a (category, url) pair —
      // report it rather than dying, since the rest of the batch still applied.
      const dupes = err?.writeErrors?.filter((e) => e.code === 11000)?.length ?? 0;
      if (dupes) console.warn(`[backfill]   ${dupes} duplicate key(s) skipped in this batch`);
      else throw err;
    }
    ops = [];
  };

  for await (const doc of cursor) {
    checked++;
    const want = urlHash(doc.url, doc.category || DEFAULT_CATEGORY);
    if (want !== doc.url_hash) {
      ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { url_hash: want } } } });
      changed++;
    }
    if (ops.length >= 500) await flush();
    if (checked % 2000 === 0) console.log(`[backfill]   …${checked}/${total}`);
  }
  await flush();

  console.log(`[backfill] url_hash: ${changed} rescoped, ${checked - changed} already correct`);

  // ── Report ─────────────────────────────────────────────────────────────────
  const byCat = await NewsItem.aggregate([
    { $group: { _id: "$category", n: { $sum: 1 }, ranked: { $sum: { $cond: [{ $gte: ["$ai_score", 0] }, 1, 0] } } } },
    { $sort: { n: -1 } },
  ]);
  console.log("\n[backfill] rows per category:");
  for (const c of byCat) console.log(`  ${String(c._id || "(none)").padEnd(16)} ${String(c.n).padStart(6)} rows, ${c.ranked} ranked`);

  const fresh = await NewsItem.countDocuments({
    first_seen_at: { $gte: new Date(Date.now() - 72 * 3600000) },
    ai_score: { $gte: 3 },
  });
  console.log(`\n[backfill] ${fresh} rows would show in a 72h "Everything" feed.`);
  if (!fresh) {
    console.log("[backfill] Nothing recent enough — the next collector pass (≤15 min) will fill it.");
  }

  await mongoose.disconnect();
  console.log("\n[backfill] done\n");
}

main().catch((err) => {
  console.error("[backfill] FAILED:", err);
  process.exit(1);
});

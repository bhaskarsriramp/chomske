/**
 * migrateSingleCategory.js: everyone onto Tech & gadgets, and ai_tech renamed.
 *
 * Two changes happened at once and they have to be applied together, because
 * each one alone leaves the database in a state the app refuses to serve.
 *
 *   1. `ai_tech` became `tech_gadgets`. The category stopped being about AI
 *      news and started being about what these channels actually publish, which
 *      is phones far more often than models.
 *
 *   2. Six of the seven categories were switched off. The engine is now
 *      category-specific in three separate places, the voice analysis, the
 *      script formats and the writer's prompt, and each of those is real work
 *      per category. One category done properly beats seven half-built.
 *
 * ── WHY THIS COERCES RATHER THAN CLEARS ──────────────────────────────────────
 * A profile whose only category was `sports` now holds an id that
 * sanitizeSelection rejects, which the onboarding gate reads as "has not chosen
 * yet". Left alone, every one of those users would be bounced back to a picker
 * showing a single card, to choose the only thing available. That is a worse
 * experience than simply moving them, and moving them is what was decided.
 *
 * ── SAFE TO RUN TWICE ────────────────────────────────────────────────────────
 * Every write is idempotent and filtered to rows that are actually wrong, so a
 * second run reports zeros. Run it from backend/:
 *
 *   node scripts/migrateSingleCategory.js          # report only, changes nothing
 *   node scripts/migrateSingleCategory.js --apply  # write
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../db.js";
import Profile from "../models/Profile.js";
import User from "../models/User.js";
import NewsItem from "../models/NewsItem.js";
import { DEFAULT_CATEGORY, LEGACY_IDS, enabledCategories } from "../services/categories.js";

const APPLY = process.argv.includes("--apply");
const TARGET = DEFAULT_CATEGORY;

function line(label, n) {
  console.log(`  ${String(n).padStart(6)}  ${label}`);
}

async function main() {
  await connectDB();

  const enabled = enabledCategories().map((c) => c.id);
  if (!enabled.includes(TARGET)) {
    throw new Error(`${TARGET} is not enabled; refusing to migrate everyone onto a disabled category.`);
  }

  console.log(`\n${APPLY ? "APPLYING" : "DRY RUN"} · target category: ${TARGET}`);
  console.log(`enabled: ${enabled.join(", ")}\n`);

  /* ── 1. NewsItem.category ────────────────────────────────────────────────
     Renamed, not deleted. The rows for switched-off categories are left exactly
     where they are: they cost nothing to keep, they expire on their own TTL,
     and deleting a month of collected news to enact a UI decision would be
     throwing away the only copy of something we paid to collect. */
  const legacyNews = await NewsItem.countDocuments({ category: { $in: Object.keys(LEGACY_IDS) } });
  console.log("NewsItem");
  line(`rows to rename (${Object.keys(LEGACY_IDS).join(", ")})`, legacyNews);
  if (APPLY && legacyNews) {
    for (const [from, to] of Object.entries(LEGACY_IDS)) {
      const r = await NewsItem.updateMany({ category: from }, { $set: { category: to } });
      line(`${from} -> ${to}`, r.modifiedCount);
    }
  }

  /* ── 2. Profile.categories ───────────────────────────────────────────────
     Every profile ends up holding exactly [TARGET]. Counted in three buckets
     first so the dry run says what it is about to do to whom, rather than
     reporting one opaque total. */
  const profiles = await Profile.find({}).select("categories").lean();
  let alreadyRight = 0;
  let legacyRename = 0;
  let moved = 0;

  for (const p of profiles) {
    const cats = p.categories || [];
    if (cats.length === 1 && cats[0] === TARGET) { alreadyRight++; continue; }
    if (cats.length === 1 && LEGACY_IDS[cats[0]] === TARGET) { legacyRename++; continue; }
    moved++;
  }

  console.log("\nProfile");
  line("already correct", alreadyRight);
  line(`renamed from a legacy id`, legacyRename);
  line(`moved from another category`, moved);

  if (APPLY && (legacyRename + moved)) {
    const r = await Profile.updateMany(
      { $or: [{ categories: { $ne: [TARGET] } }, { categories: { $size: 0 } }] },
      { $set: { categories: [TARGET] } }
    );
    line("profiles written", r.modifiedCount);
  }

  /* ── 3. User.categories ──────────────────────────────────────────────────
     The denormalised union the collector schedules off. Rewritten wholesale
     rather than per user: with one enabled category the union is the same for
     everybody who has any profile at all, and recomputing it per account would
     be thousands of queries to reach one answer. */
  const usersWrong = await User.countDocuments({ categories: { $ne: [TARGET] } });
  console.log("\nUser");
  line("accounts to rewrite", usersWrong);
  if (APPLY && usersWrong) {
    const r = await User.updateMany({ categories: { $ne: [TARGET] } }, { $set: { categories: [TARGET] } });
    line("accounts written", r.modifiedCount);
  }

  /* ── 4. What this does NOT touch ─────────────────────────────────────────
     Voice profiles. Every one of them was built from short-form video, because
     routes/transcribe.js has never accepted anything longer, so they are all
     already correct as the SHORT lane and need no migration at all. They will
     be re-analysed for their category on the creator's next Analyse press,
     free, see voiceAnalysisCost({ categoryUpgrade }). Scripts are likewise
     untouched: what a script was written as is a fact about the past. */
  console.log("\nNot touched: voice profiles (already short-lane), scripts (history).");

  if (!APPLY) console.log("\nDry run. Re-run with --apply to write.\n");
  else console.log("\nDone.\n");

  await mongoose.connection.close();
}

main().catch(async (err) => {
  console.error("\nMigration failed:", err.message);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});

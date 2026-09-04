/**
 * migrateProfiles.js — move existing accounts onto profiles.
 *
 *   node scripts/migrateProfiles.js          # report only, changes nothing
 *   node scripts/migrateProfiles.js --apply  # write
 *
 * Rehearse it against a restored dump first:
 *   MONGODB_URI=mongodb://localhost:27017/hinglish node scripts/migrateProfiles.js
 *
 * ── WHAT CHANGED ────────────────────────────────────────────────────────────
 * Before profiles, an account had:
 *   · categories on the USER row
 *   · at most ONE VoiceProfile, enforced by a unique index on `user`
 *   · transcripts and scripts pointing at neither
 *
 * A Profile is now the container for a channel — its categories, its one voice,
 * that voice's videos, and the scripts written for it. This gives every account
 * exactly one profile named "My Profile" that owns all of the above, so nobody
 * opens the app after the deploy to find their feed, their videos or their
 * history missing.
 *
 * ── THIS ONE IS NOT FULLY OPTIONAL ──────────────────────────────────────────
 * ensureProfile() adopts orphans lazily on the first request that needs a
 * profile, so the app works either way. But the new UNIQUE index on
 * voice_profiles.profile cannot be built while existing rows all have
 * profile: null — they collide with each other on null. Running this first is
 * what lets that index exist. server.js logs the failure rather than crashing,
 * so a skipped migration degrades to "one voice per account" instead of an
 * outage — but it is a real degradation.
 *
 * Safe to run repeatedly: every step is idempotent.
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectToMongo from "../db.js";
import User from "../models/User.js";
import Profile from "../models/Profile.js";
import Transcript from "../models/Transcript.js";
import Script from "../models/Script.js";
import VoiceProfile from "../models/VoiceProfile.js";
import { sanitizeSelection } from "../services/categories.js";

const APPLY = process.argv.includes("--apply");

// What the one carried-over profile is called. Deliberately the same default the
// onboarding screen pre-fills, so an existing user and a new one see the same
// word for the same thing.
const LEGACY_NAME = "My Profile";

async function main() {
  await connectToMongo();
  console.log(APPLY ? "APPLYING changes\n" : "DRY RUN — nothing will be written (pass --apply to write)\n");

  const db = mongoose.connection.db;

  // ── 1. Every account that has anything at all ─────────────────────────────
  const userIds = [
    ...new Set(
      [
        ...(await User.distinct("_id")),
        ...(await VoiceProfile.distinct("user")),
        ...(await Transcript.distinct("user")),
        ...(await Script.distinct("user")),
      ].map(String)
    ),
  ];
  console.log(`· ${userIds.length} account(s) to check\n`);

  let created = 0, adoptedT = 0, adoptedS = 0, adoptedV = 0, defaults = 0, catsMoved = 0;

  for (const uid of userIds) {
    const id = new mongoose.Types.ObjectId(uid);
    let profiles = await Profile.find({ user: id }).sort({ created_at: 1 }).lean();

    // 1a. No profile yet — build one from whatever the account already watched,
    // so their feed survives the deploy rather than resetting to nothing.
    if (!profiles.length) {
      const u = await User.findById(id).select("categories").lean();
      const cats = sanitizeSelection(u?.categories || []);
      created++;
      if (cats.length) catsMoved++;

      if (APPLY) {
        const doc = await Profile.create({
          user: id, name: LEGACY_NAME, categories: cats, is_default: true, created_at: new Date(),
        });
        profiles = [doc.toObject()];
      } else {
        profiles = [{ _id: new mongoose.Types.ObjectId(), name: LEGACY_NAME, is_default: true }];
      }
    }

    const primary = profiles.find((p) => p.is_default) || profiles[0];

    // 1b. Exactly one default.
    if (!primary.is_default || profiles.filter((p) => p.is_default).length !== 1) {
      defaults++;
      if (APPLY) {
        await Profile.updateMany({ user: id, _id: { $ne: primary._id } }, { $set: { is_default: false } });
        await Profile.updateOne({ _id: primary._id }, { $set: { is_default: true } });
      }
    }

    // 1c. Adopt everything unclaimed into that profile.
    const unclaimed = { $or: [{ profile: null }, { profile: { $exists: false } }] };

    const oT = await Transcript.countDocuments({ user: id, ...unclaimed });
    const oS = await Script.countDocuments({ user: id, ...unclaimed });
    const oV = await VoiceProfile.countDocuments({ user: id, ...unclaimed });
    adoptedT += oT; adoptedS += oS; adoptedV += oV;

    if (APPLY) {
      if (oT) await Transcript.updateMany({ user: id, ...unclaimed }, { $set: { profile: primary._id } });
      if (oS) {
        await Script.updateMany(
          { user: id, ...unclaimed },
          { $set: { profile: primary._id, profile_name: String(primary.name || LEGACY_NAME) } }
        );
      }
      if (oV) {
        // A user could in principle hold more than one unclaimed voice row (an
        // interrupted earlier migration). Only the newest is worth keeping —
        // the unique index below allows exactly one per profile, and the rest
        // are stale duplicates of the same account's single legacy voice.
        const rows = await VoiceProfile.find({ user: id, ...unclaimed }).sort({ built_at: -1, created_at: -1 });
        await VoiceProfile.updateOne({ _id: rows[0]._id }, { $set: { profile: primary._id } });
        if (rows.length > 1) {
          await VoiceProfile.deleteMany({ _id: { $in: rows.slice(1).map((r) => r._id) } });
          console.log(`  · dropped ${rows.length - 1} duplicate legacy voice row(s) for ${uid}`);
        }
      }
    }
  }

  // ── 2. Indexes ────────────────────────────────────────────────────────────
  // Done AFTER the backfill: the unique index on `profile` cannot be built while
  // rows still share profile: null.
  console.log("\n── indexes ──────────────────────────────────────");
  const vp = db.collection("voice_profiles");
  const indexes = await vp.indexes().catch(() => []);

  const staleUnique = indexes.find(
    (i) => i.unique && JSON.stringify(i.key) === JSON.stringify({ user: 1 })
  );
  if (staleUnique) {
    console.log(`  unique index "${staleUnique.name}" on { user: 1 } must go`);
    if (APPLY) { await vp.dropIndex(staleUnique.name); console.log("  dropped"); }
  } else {
    console.log("  no stale unique index on { user: 1 } ✓");
  }

  const hasProfileUnique = indexes.some(
    (i) => i.unique && JSON.stringify(i.key) === JSON.stringify({ profile: 1 })
  );
  if (!hasProfileUnique) {
    console.log("  unique index on { profile: 1 } needs creating");
    if (APPLY) {
      const orphans = await VoiceProfile.countDocuments({ $or: [{ profile: null }, { profile: { $exists: false } }] });
      if (orphans > 1) {
        // Refused rather than attempted: several rows sharing profile: null all
        // collide, and the resulting E11000 names one arbitrary row while saying
        // nothing about the other twenty.
        console.log(`  SKIPPED — ${orphans} voice rows still have no profile. Re-run this script.`);
      } else {
        await VoiceProfile.collection.createIndex({ profile: 1 }, { unique: true });
        console.log("  created");
      }
    }
  } else {
    console.log("  unique index on { profile: 1 } already there ✓");
  }

  console.log("\n── summary ──────────────────────────────────────");
  console.log(`  profiles created     ${created}`);
  console.log(`  with categories      ${catsMoved}  (carried over from the account)`);
  console.log(`  default flags fixed  ${defaults}`);
  console.log(`  videos adopted       ${adoptedT}`);
  console.log(`  scripts adopted      ${adoptedS}`);
  console.log(`  voices adopted       ${adoptedV}`);
  console.log(APPLY ? "\nDone." : "\nDry run only. Re-run with --apply to write.");

  await mongoose.connection.close();
}

main().catch(async (err) => {
  console.error("migration failed:", err);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});

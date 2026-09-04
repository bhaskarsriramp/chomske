/**
 * migrateVoices.js — move existing accounts onto named voice sets.
 *
 *   node scripts/migrateVoices.js          # report only, changes nothing
 *   node scripts/migrateVoices.js --apply  # write
 *
 * Before voice sets, a user had at most one VoiceProfile (enforced by a unique
 * index) and their transcripts and scripts pointed at nothing. This gives every
 * account exactly one default set that owns all of it, so nobody opens the app
 * after the deploy to find their videos and their history missing.
 *
 * ── THIS IS OPTIONAL, ON PURPOSE ────────────────────────────────────────────
 * ensureVoice() in services/voiceProfileService.js does the same adoption
 * lazily, on the first request that needs a set, and server.js drops the stale
 * unique index at boot. Running this just does it all at once, up front, where
 * the output can be read — rather than discovering it one user at a time.
 *
 * Safe to run repeatedly: every step is idempotent.
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectToMongo from "../db.js";
import Transcript from "../models/Transcript.js";
import Script from "../models/Script.js";
import VoiceProfile from "../models/VoiceProfile.js";

const APPLY = process.argv.includes("--apply");

// What an already-built profile gets called. Deliberately not left empty: an
// empty name makes the client show its blocking "name this voice" dialog, and
// ambushing an existing user with a modal they never asked for, about a feature
// they have not seen yet, is a bad first impression of a good change.
const LEGACY_NAME = "My voice";

async function main() {
  await connectToMongo();
  console.log(APPLY ? "APPLYING changes\n" : "DRY RUN — nothing will be written (pass --apply to write)\n");

  // ── 1. The stale unique index ──────────────────────────────────────────────
  // user_1 was { unique: true }. While it exists, a second voice set for the
  // same user is rejected by the database no matter what the code says.
  const coll = mongoose.connection.db.collection("voice_profiles");
  const indexes = await coll.indexes().catch(() => []);
  const stale = indexes.find((i) => i.unique && JSON.stringify(i.key) === JSON.stringify({ user: 1 }));
  if (stale) {
    console.log(`· unique index "${stale.name}" on { user: 1 } must go`);
    if (APPLY) {
      await coll.dropIndex(stale.name);
      console.log("  dropped");
    }
  } else {
    console.log("· no stale unique index on { user: 1 } ✓");
  }

  // ── 2. Every user who has anything at all ─────────────────────────────────
  const userIds = [
    ...new Set(
      [
        ...(await VoiceProfile.distinct("user")),
        ...(await Transcript.distinct("user")),
        ...(await Script.distinct("user")),
      ].map(String)
    ),
  ];
  console.log(`\n· ${userIds.length} account(s) to check\n`);

  let created = 0, named = 0, adoptedT = 0, adoptedS = 0, defaults = 0;

  for (const uid of userIds) {
    const id = new mongoose.Types.ObjectId(uid);
    let voices = await VoiceProfile.find({ user: id }).sort({ created_at: 1 }).lean();

    // 2a. No set at all — the user has transcripts or scripts but never
    // analysed. Give them an empty one to hold what they have.
    if (!voices.length) {
      created++;
      if (APPLY) {
        const doc = await VoiceProfile.create({ user: id, name: "", is_default: true, created_at: new Date() });
        voices = [doc.toObject()];
      } else {
        voices = [{ _id: new mongoose.Types.ObjectId(), name: "", is_default: true }];
      }
    }

    const primary = voices.find((v) => v.is_default) || voices[0];

    // 2b. Exactly one default.
    if (!primary.is_default || voices.filter((v) => v.is_default).length !== 1) {
      defaults++;
      if (APPLY) {
        await VoiceProfile.updateMany({ user: id, _id: { $ne: primary._id } }, { $set: { is_default: false } });
        await VoiceProfile.updateOne({ _id: primary._id }, { $set: { is_default: true } });
      }
    }

    // 2c. A built-but-unnamed set gets the legacy name (see LEGACY_NAME above).
    for (const v of voices) {
      if (v.built_at && !String(v.name || "").trim()) {
        named++;
        if (APPLY) await VoiceProfile.updateOne({ _id: v._id }, { $set: { name: LEGACY_NAME } });
      }
    }

    // 2d. Adopt everything unclaimed into the default set.
    const orphanT = await Transcript.countDocuments({ user: id, voice: null });
    const orphanS = await Script.countDocuments({ user: id, $or: [{ voice: null }, { voice: { $exists: false } }] });
    adoptedT += orphanT;
    adoptedS += orphanS;
    if (APPLY && orphanT) {
      await Transcript.updateMany({ user: id, voice: null }, { $set: { voice: primary._id } });
    }
    if (APPLY && orphanS) {
      await Script.updateMany(
        { user: id, $or: [{ voice: null }, { voice: { $exists: false } }] },
        { $set: { voice: primary._id, voice_name: String(primary.name || LEGACY_NAME) } }
      );
    }
  }

  console.log("── summary ──────────────────────────────────────");
  console.log(`  voice sets created   ${created}`);
  console.log(`  named "${LEGACY_NAME}"    ${named}`);
  console.log(`  default flags fixed  ${defaults}`);
  console.log(`  videos adopted       ${adoptedT}`);
  console.log(`  scripts adopted      ${adoptedS}`);
  console.log(APPLY ? "\nDone." : "\nDry run only. Re-run with --apply to write.");

  await mongoose.connection.close();
}

main().catch(async (err) => {
  console.error("migration failed:", err);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});

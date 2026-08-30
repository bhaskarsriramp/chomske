/**
 * ONE-TIME MIGRATION — encrypt existing plaintext fbLongLivedToken and fbPageAccessToken
 *
 * Run once after deploying the token-encryption changes:
 *   node backend/scripts/migrateEncryptTokens.js
 *
 * Safe to re-run: already-encrypted values are detected and skipped.
 */

import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/User.js";
import { encryptToken, decryptToken } from "../utils/tokenCrypto.js";

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

function isAlreadyEncrypted(value) {
  if (!value) return false;
  // Encrypted format: "ivHex:authTagHex:ciphertextHex" — all three parts are hex, separated by ":"
  const parts = value.split(":");
  return parts.length === 3;
}

async function migrateEncryptTokens() {
  if (!MONGO_URI) throw new Error("MONGO_URI / MONGODB_URI env var is not set");

  await mongoose.connect(MONGO_URI);
  console.log("✅ Connected to MongoDB");

  // Find all users that have at least one token field set
  const users = await User.find({
    $or: [
      { fbLongLivedToken: { $exists: true, $ne: null } },
      { fbPageAccessToken: { $exists: true, $ne: null } },
    ],
  }).select("_id fbLongLivedToken fbPageAccessToken").lean();

  console.log(`Found ${users.length} user(s) with token fields.`);

  let encrypted = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of users) {
    try {
      const update = {};

      if (user.fbLongLivedToken && !isAlreadyEncrypted(user.fbLongLivedToken)) {
        update.fbLongLivedToken = encryptToken(user.fbLongLivedToken);
      }

      if (user.fbPageAccessToken && !isAlreadyEncrypted(user.fbPageAccessToken)) {
        update.fbPageAccessToken = encryptToken(user.fbPageAccessToken);
      }

      if (Object.keys(update).length > 0) {
        await User.findByIdAndUpdate(user._id, update);
        encrypted++;
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`❌ Failed to encrypt tokens for user ${user._id}:`, err.message);
      errors++;
    }
  }

  console.log(`\nMigration complete:`);
  console.log(`  Encrypted : ${encrypted}`);
  console.log(`  Skipped   : ${skipped} (already encrypted)`);
  console.log(`  Errors    : ${errors}`);

  await mongoose.disconnect();
  console.log("Disconnected.");
}

migrateEncryptTokens().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

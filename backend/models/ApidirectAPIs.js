import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * ApidirectAPIs — one row per apidirect.io account key.
 *
 * Same shape as the reference project's ApidirectKey collection so keys can be
 * pasted in the same way: insert a document with `apidirect_key` set and the pool
 * picks it up within 5 minutes (or immediately after a restart).
 *
 * ── KEYS ARE NEVER AUTO-DELETED ──────────────────────────────────────────────
 * They carry prepaid credits. A key that returns 401/402/403 is cooled for an
 * hour and skipped by rotation, and the failure is counted here for visibility —
 * but deleting it would throw away money over what is usually a temporary
 * billing state.
 */
const ApidirectAPIsSchema = new Schema({
  apidirect_key: { type: String, required: true, unique: true, trim: true },

  // Human name for logs, so a failing key is identifiable without printing it.
  label:  { type: String, default: "" },
  active: { type: Boolean, default: true },

  // Auth/billing rejections seen on this key. Observability only — nothing reads
  // this to make decisions, because a key can recover the moment it is topped up.
  track_403: { type: Number, default: 0 },

  last_used_at: { type: Date, default: null },
  created_at:   { type: Date, default: Date.now },
});

export default mongoose.models.ApidirectAPIs ||
  mongoose.model("ApidirectAPIs", ApidirectAPIsSchema, "apidirect_apis");

import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * AIStudioKeys, one row per Gemini AI Studio API key (collection
 * "aistudio_keys"). The same idea as TinyfishAPIs: a key is added by inserting
 * a row with `api_key` set, and every process picks it up within a minute
 * (services/ai/aistudioPool.js). Nothing else to deploy. The environment's
 * AISTUDIO_KEY is still used, after these, as a last resort.
 *
 * ── A LIMIT BELONGS TO A PROJECT, NOT TO A KEY ───────────────────────────────
 * AI Studio counts its rate limits per Google Cloud PROJECT (measured: the
 * voice model's 10 a minute and 100 a day are the project's, whichever of its
 * keys asks). Two keys from one project share one allowance, so rotating
 * between them adds nothing. Rotation adds capacity only across keys from
 * different projects (or accounts): note which project a key is from in
 * `project`, so that stays visible.
 *
 * ── KEYS ARE NEVER AUTO-DELETED ──────────────────────────────────────────────
 * A key that is refused is rested (an hour for an invalid key or one out of
 * credit, until the reset for a daily limit, the minute for a per-minute one)
 * and the next key is used at once. The failure is written here so it can be
 * read from a Mongo shell; nothing routes on these fields, the rest itself is
 * kept in Redis (and in each process). Set `active: false` to take a key out.
 */
const AIStudioKeysSchema = new Schema({
  api_key: { type: String, required: true, unique: true, trim: true },

  // A name for logs, so a failing key is identifiable without printing it.
  label: { type: String, default: "" },
  active: { type: Boolean, default: true },
  // The Google Cloud project (or account) the key belongs to: keys of one
  // project share its limits.
  project: { type: String, default: "" },

  // ── Live health, written fire-and-forget ──────────────────────────────────
  // "ok" | "rate_limited" | "daily_limited" | "invalid" | "no_credit" | "error"
  status: { type: String, default: "ok" },
  // Which kind of use the last refusal was for: "text" or "tts" (a key out
  // of voice for the day still answers text).
  status_scope: { type: String, default: "" },
  last_status_code: { type: Number, default: null },
  last_error: { type: String, default: "" },
  last_error_at: { type: Date, default: null },
  // When rotation will try this key again (for that scope).
  cooldown_until: { type: Date, default: null },

  requests: { type: Number, default: 0 },
  error_count: { type: Number, default: 0 },
  last_used_at: { type: Date, default: null },
  last_success_at: { type: Date, default: null },
  created_at: { type: Date, default: Date.now },
});

export default mongoose.models.AIStudioKeys || mongoose.model("AIStudioKeys", AIStudioKeysSchema, "aistudio_keys");

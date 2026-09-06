import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * TinyfishAPIs, one row per TinyFish account key.
 *
 * Same shape and the same rules as ApidirectAPIs, so a key is added the same
 * way: insert a document with `tiny_api_key` set and the pool picks it up
 * within five minutes, or immediately after a restart. Nothing else to deploy.
 *
 * ── WHY THIS POOL EXISTS AT ALL, GIVEN FETCH IS FREE ─────────────────────────
 * TinyFish charges nothing for page fetches, so this is not a spend control.
 * It is a RATE control. The limit is requests per minute per key, and a single
 * script pulls three to five URLs in one request, so one key is comfortable for
 * one creator and uncomfortable the moment several order a script at once.
 * Adding a second key is then the whole fix, with no code change.
 *
 * ── KEYS ARE NEVER AUTO-DELETED ──────────────────────────────────────────────
 * A key that returns 401/403 is cooled for an hour and skipped by rotation, and
 * the failure is recorded here for visibility. Deleting it would turn a
 * temporary account state into a permanent loss of capacity, and the row costs
 * nothing to keep.
 */
const TinyfishAPIsSchema = new Schema({
  tiny_api_key: { type: String, required: true, unique: true, trim: true },

  // Human name for logs, so a failing key is identifiable without printing it.
  label:  { type: String, default: "" },
  active: { type: Boolean, default: true },

  // ── Live health ────────────────────────────────────────────────────────────
  // Written fire-and-forget from the client. Nothing reads it to make a routing
  // decision, the Redis cooldown does that, so a failed write here can never
  // affect whether a request goes out.

  // "ok" | "rate_limited" | "invalid" | "error"
  status: { type: String, default: "ok" },

  last_status_code: { type: Number, default: null },
  last_error:       { type: String, default: "" },
  last_error_at:    { type: Date,   default: null },

  // When rotation will consider this key again. The Redis cooldown is what
  // enforces it; this copy exists so the state is readable from a Mongo shell,
  // including from outside the VPC where Redis is not reachable.
  cooldown_until: { type: Date, default: null },

  // URLs successfully fetched, not requests. One request carries up to ten.
  urls_fetched:  { type: Number, default: 0 },
  error_count:   { type: Number, default: 0 },

  last_used_at:    { type: Date, default: null },
  last_success_at: { type: Date, default: null },
  created_at:      { type: Date, default: Date.now },
});

export default mongoose.models.TinyfishAPIs ||
  mongoose.model("TinyfishAPIs", TinyfishAPIsSchema, "tinyfish_apis");

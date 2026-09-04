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
 *
 * ── WHY THE HEALTH FIELDS BELOW EXIST ────────────────────────────────────────
 * `track_403` alone answers "has this key ever failed", which is the wrong
 * question when three keys are in rotation and the feed has gone quiet. The
 * question is "which key is working RIGHT NOW, and which one is out of credit" —
 * and that needs the last status, the machine-readable code apidirect returned,
 * and when the cooldown lifts. All of it is written fire-and-forget from the
 * client: nothing reads it to make a routing decision (the cooldown in Redis does
 * that), so a failed write can never affect whether a request goes out.
 */
const ApidirectAPIsSchema = new Schema({
  apidirect_key: { type: String, required: true, unique: true, trim: true },

  // Human name for logs, so a failing key is identifiable without printing it.
  label:  { type: String, default: "" },
  active: { type: Boolean, default: true },

  // Auth/billing rejections seen on this key. Observability only — nothing reads
  // this to make decisions, because a key can recover the moment it is topped up.
  track_403: { type: Number, default: 0 },

  // ── Live health ────────────────────────────────────────────────────────────
  // Written on every terminal outcome so `GET /stats/apidirect` can say which key
  // is serving and which is out, without anyone reading logs.

  // "ok" | "exhausted" | "blocked" | "invalid" | "rate_limited" | "error"
  // `exhausted` and `blocked` are the two that mean STOP TOPPING UP AND LOOK:
  // free tier spent with no card on file, and account blocked for payment failure.
  status: { type: String, default: "ok" },

  // Exactly what apidirect said, kept raw. Its codes are documented and stable
  // (payment_required, account_blocked, monthly_limit_exceeded …), and they carry
  // more than the HTTP status does — 429 alone cannot tell a spending cap apart
  // from three requests arriving at once, and those want opposite responses.
  last_status_code: { type: Number, default: null },   // HTTP status
  last_error_code:  { type: String, default: "" },     // apidirect's `code`
  last_error:       { type: String, default: "" },     // human-readable message
  last_error_at:    { type: Date,   default: null },
  last_endpoint:    { type: String, default: "" },     // which one it failed on

  // When rotation will consider this key again. Set alongside the Redis cooldown
  // that actually enforces it — this copy is here so the state is visible from a
  // Mongo shell or a dashboard, including from outside the VPC where Redis is not
  // reachable at all.
  cooldown_until: { type: Date, default: null },

  // Cumulative counters. request_count is billable calls that SUCCEEDED, which is
  // the number to compare against an apidirect invoice.
  request_count: { type: Number, default: 0 },
  error_count:   { type: Number, default: 0 },

  last_used_at:    { type: Date, default: null },  // last attempt
  last_success_at: { type: Date, default: null },  // last 2xx
  created_at:      { type: Date, default: Date.now },
});

export default mongoose.models.ApidirectAPIs ||
  mongoose.model("ApidirectAPIs", ApidirectAPIsSchema, "apidirect_apis");

import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * Transcript — one row per (user, video) transcription.
 *
 * Cached on purpose. Reading a video is the single expensive operation in this
 * product, so re-opening a video you already ran must never pay for it twice —
 * the unique index below is what enforces that, not application logic that can
 * be raced by a double-click.
 *
 * `status` exists because a long video takes far longer than an HTTP request
 * should wait: the row is created as "processing" and the client polls it.
 */
const TranscriptSchema = new Schema({
  user:     { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  video_id: { type: String, required: true },          // canonical YouTube id
  url:      { type: String, required: true },          // the normalized watch URL we sent

  status: { type: String, enum: ["processing", "done", "failed"], default: "processing", index: true },

  // What the model heard, in the language it was spoken in — Devanagari stays
  // Devanagari, Telugu stays Telugu. Never translated to English.
  text: { type: String, default: "" },

  // BCP-47-ish label the model reports ("hi", "hi-en" for Hinglish, "te", "bn").
  language:       { type: String, default: "" },
  language_label: { type: String, default: "" },       // human-readable, for the UI

  title:    { type: String, default: "" },
  error:    { type: String, default: "" },
  ms_taken: { type: Number, default: 0 },

  // ── Video metadata, from apidirect before we ever pay to read it ───────────
  // duration_seconds is the gate: voice profiling accepts short-form only, and a
  // URL tells you nothing about length. Checking for $0.005 beats transcribing a
  // 40-minute video for ₹60 and then rejecting it.
  //
  // null means UNKNOWN, not zero — apidirect returns null for live streams, and
  // treating that as 0 would let a stream through a "under 60 seconds" check.
  duration_seconds: { type: Number, default: null },
  channel:          { type: String, default: "" },
  thumbnail:        { type: String, default: "" },

  // What this row actually cost to produce. Stored per transcript because reading
  // video is the only real cost here and it varies enormously with length — a
  // 60-second Short and a 40-minute talk are two different businesses. Keeping
  // the true numbers makes "what does my average user cost me" a query instead
  // of a guess. See readUsage() in services/geminiClient.js.
  usage: {
    input_tokens:    { type: Number, default: 0 },
    output_tokens:   { type: Number, default: 0 },
    thinking_tokens: { type: Number, default: 0 },
    total_tokens:    { type: Number, default: 0 },
    usd:             { type: Number, default: 0 },
  },

  created_at: { type: Date, default: Date.now, index: true },
  updated_at: { type: Date, default: Date.now },
});

// One transcript per user per video — the cache key, enforced by the database.
TranscriptSchema.index({ user: 1, video_id: 1 }, { unique: true });

export default mongoose.models.Transcript || mongoose.model("Transcript", TranscriptSchema, "transcripts");

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

  // Which voice set this video teaches. A creator with a Hindi channel and an
  // English one keeps two sets, and a video only ever belongs to one of them —
  // the slot count, the analysis input and the "your videos" list are all scoped
  // by this. Null only on rows written before voice sets existed; the migration
  // and ensureVoice() both adopt those into the user's default set.
  voice:    { type: Schema.Types.ObjectId, ref: "VoiceProfile", default: null, index: true },

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

  // The rest of what that same (already paid for) lookup returns. Stored
  // because the call has been made either way — throwing the answer away and
  // asking again later would be paying twice for one fact. `category` and
  // `keywords` are YouTube's own labels for the video, which say what this
  // creator actually makes; `views` is the closest thing to a reach signal we
  // get without asking them to connect an account.
  channel_id:   { type: String, default: "" },
  description:  { type: String, default: "" },
  views:        { type: Number, default: null },
  category:     { type: String, default: "" },
  keywords:     { type: [String], default: [] },
  published_at: { type: Date,   default: null },

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
//
// Deliberately still keyed on (user, video_id) rather than (user, voice,
// video_id) now that voice sets exist. Widening it would let the same video be
// added to two sets, and each copy would be transcribed and BILLED separately
// for text we already hold. The route turns the resulting duplicate-key error
// into "that video is already in <set name>", which is the honest answer.
TranscriptSchema.index({ user: 1, video_id: 1 }, { unique: true });

// The per-set queries: slot counts, the video list, and the analysis input.
TranscriptSchema.index({ user: 1, voice: 1, status: 1 });

export default mongoose.models.Transcript || mongoose.model("Transcript", TranscriptSchema, "transcripts");

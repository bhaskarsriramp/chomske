import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * Script — one generated video script: a news story, written in a creator's voice.
 *
 * Async and polled for the same reason transcription is (see routes/transcribe.js):
 * writing a full script is a slow generation, and a request held open that long
 * loses to proxy idle timeouts, showing a network error for work that succeeded.
 *
 * Rows are kept rather than streamed and forgotten so a creator can come back to
 * what they generated, and so regenerating is a deliberate act with a visible
 * cost rather than something a page refresh does for free.
 */
const ScriptSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

  // What it is about. news_item is the specific row; story is the cluster key, so
  // a script survives the underlying article being re-clustered or aged out.
  news_item: { type: Schema.Types.ObjectId, ref: "NewsItem", index: true },
  story:     { type: String, default: "" },
  headline:  { type: String, default: "" },   // the news title, for the history list
  angle:     { type: String, default: "" },

  status: { type: String, enum: ["processing", "done", "failed"], default: "processing", index: true },

  // The script itself, in the creator's own language and script — Devanagari stays
  // Devanagari, the English words they habitually keep in English stay English.
  text:  { type: String, default: "" },
  // The opening line, pulled out separately: it is the part a creator judges the
  // whole script by, and the part they most often want to swap.
  hook:  { type: String, default: "" },
  title_suggestions: [{ type: String }],

  language:       { type: String, default: "" },
  language_label: { type: String, default: "" },

  // Which channel it was written for, and how good that channel's voice was at
  // the time. Without the confidence, a script written from a one-video voice is
  // indistinguishable later from one written after the creator added ten.
  //
  // The name is COPIED, not looked up through the ref. A creator who renames or
  // deletes a profile must not find their old scripts relabelled or unlabelled —
  // what a script was written as is a fact about the past, and history that
  // rewrites itself is not history.
  profile:          { type: Schema.Types.ObjectId, ref: "Profile", default: null, index: true },
  profile_name:     { type: String, default: "" },
  voice_confidence: { type: String, default: "" },
  sources_used:     [{ type: String }],   // urls the facts came from

  error:    { type: String, default: "" },
  ms_taken: { type: Number, default: 0 },

  // ── What was ordered, and what it cost ────────────────────────────────────
  // Stored on the script rather than only in the ledger because this is what a
  // creator sees in their history: "8 min · with English · 255 credits". The
  // ledger answers the accounting question; this answers theirs.
  duration_seconds: { type: Number, default: 60 },
  credits_charged:  { type: Number, default: 0 },
  credits_refunded: { type: Number, default: 0 },

  // ── The English twin ──────────────────────────────────────────────────────
  // Same story, same voice, written for a US-facing audience. Kept on the same
  // document rather than as a second Script row: it is one order, one price and
  // one thing in the history list, and splitting it would double every row in
  // the list for a creator who always buys both.
  english_text: { type: String, default: "" },
  english_hook: { type: String, default: "" },

  // ── The packaging pack ────────────────────────────────────────────────────
  // Title options live in title_suggestions above; these are the rest of what
  // gets pasted into the upload form.
  description:     { type: String, default: "" },
  hashtags:        [{ type: String }],
  thumbnail_lines: [{ type: String }],

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

export default mongoose.models.Script || mongoose.model("Script", ScriptSchema, "scripts");

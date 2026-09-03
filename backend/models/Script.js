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

  // Which profile wrote it, and how good that profile was at the time. Without
  // this, a script written from a one-video profile is indistinguishable later
  // from one written after the creator added ten.
  voice_confidence: { type: String, default: "" },
  sources_used:     [{ type: String }],   // urls the facts came from

  error:    { type: String, default: "" },
  ms_taken: { type: Number, default: 0 },

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

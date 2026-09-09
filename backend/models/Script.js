import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * Script, one generated video script: a news story, written in a creator's voice.
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

  // ── A BULLETIN IS MANY STORIES, IN THE CREATOR'S OWN ORDER ────────────────
  // Empty for a single-story script, where `news_item` says everything. For a
  // bulletin this is the full running order, stored as an ordered array because
  // the order IS the editorial decision: they chose what leads. It is also the
  // cache key for "have we already written this exact bulletin", which an
  // unordered set could not answer without treating two different videos as one.
  //
  // news_item stays populated with the FIRST story, so every existing query,
  // history row and topic lookup keeps working without knowing bulletins exist.
  news_items:  [{ type: Schema.Types.ObjectId, ref: "NewsItem" }],
  story_count: { type: Number, default: 1 },

  // Which shape this was written as, from the category's format list. Recorded
  // rather than derived, for the same reason duration_seconds is: what a script
  // was written as is a fact about the past.
  format:      { type: String, default: "" },
  voice_lane:  { type: String, default: "" },   // "short" | "long"

  story:     { type: String, default: "" },
  headline:  { type: String, default: "" },   // the news title, for the history list
  angle:     { type: String, default: "" },

  /**
   * ── WHERE THE STORY CAME FROM ─────────────────────────────────────────────
   * There used to be one answer, so it did not need recording: every script was
   * a ranked news story and `news_item` said which. There are now three:
   *
   *   news    Discover. A story the collector found and ranked.
   *   import  Import. A video, some links, or text the creator brought.
   *   idea    Idea. Something they asked for in their own words.
   *
   * Indexed because this is the question the product most needs answered after
   * shipping, and it cannot be answered retroactively. The news pipeline is the
   * largest thing in this backend, an entire collector, ranker, scheduler,
   * diversity pass and a paid key pool, and it is worth what it costs only if
   * creators write from it. If most scripts turn out to arrive by Import or
   * Idea, that is a fact about where the product actually is, and this field is
   * the only place it will ever show up. See GET /stats/dashboard.
   *
   * Defaults to "news" so every row written before this existed reads correctly
   * rather than as an unknown.
   */
  source_kind: { type: String, enum: ["news", "import", "idea"], default: "news", index: true },

  // The Source document the material came from, for import and idea. It expires
  // (see models/Source.js), so nothing below may depend on it still being there.
  source: { type: Schema.Types.ObjectId, ref: "Source", default: null, index: true },

  /**
   * What the creator actually typed or pasted, copied here rather than read
   * through the ref above.
   *
   * The Source is a cache and will be gone in a month. This is the record, and
   * it is what makes a script in the history list mean something: "the video
   * they pasted", "these four links", "the idea they described". Without it an
   * Import script three weeks later is a page of text with no provenance at
   * all, which is exactly the failure the news path's coverage list exists to
   * prevent.
   *
   * The pasted `text` body is deliberately NOT copied here, only its length.
   * It can be six thousand characters of someone else's article, and storing it
   * twice, permanently, to label a row is not worth it.
   */
  source_input: {
    youtube_url:   { type: String, default: "" },
    youtube_title: { type: String, default: "" },
    links:         [{ type: String }],
    text_chars:    { type: Number, default: 0 },
    prompt:        { type: String, default: "" },
    // Whether the Idea brief was researched, and whether that research found
    // anything. Both are needed: a lookup that came back empty is refunded and
    // the script is written from the brief alone, and the creator is told so.
    lookup:        { type: Boolean, default: false },
    lookup_used:   { type: Boolean, default: false },
  },

  status: { type: String, enum: ["processing", "done", "failed"], default: "processing", index: true },

  // The script itself, in the creator's own language and script, Devanagari stays
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
  // deletes a profile must not find their old scripts relabelled or unlabelled,
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

  // ── ARE THE EXTRAS STILL COMING? ──────────────────────────────────────────
  // The script is marked `done` the moment the script itself is written, which
  // is right: it is the deliverable, and holding the status back would make a
  // creator wait on a translation they may not have bought. But the English
  // twin and the packaging are written AFTER that, and the client stops polling
  // the instant it sees `done`. So it captured the row in the one-second window
  // where the script exists and the extras do not, and never looked again: a
  // creator who paid for "Also write it in English" got no English anywhere,
  // and only a reload much later would have shown it.
  //
  // This is the flag that says "keep watching". Set when the order included an
  // extra, cleared when the extras block finishes, either way, including when
  // one of them failed and was refunded.
  extras_pending: { type: Boolean, default: false },

  // ── The English twin ──────────────────────────────────────────────────────
  // Same story, same voice, written for a US-facing audience. Kept on the same
  // document rather than as a second Script row: it is one order, one price and
  // one thing in the history list, and splitting it would double every row in
  // the list for a creator who always buys both.
  english_text: { type: String, default: "" },
  english_hook: { type: String, default: "" },

  // ── WHEN THE TWIN DID NOT ARRIVE ──────────────────────────────────────────
  // A failed twin is refunded, and until now that was the whole of it: a line
  // in the server log, a quiet adjustment to the balance, and a creator who
  // ticked "Also write it in English", was charged for it, and found no English
  // and no explanation. A refund nobody is told about is indistinguishable from
  // being charged for nothing. Set when the twin fails, cleared when one
  // succeeds, and rendered where the language toggle would have been.
  english_error: { type: String, default: "" },

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

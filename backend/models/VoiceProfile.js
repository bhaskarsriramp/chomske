import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * VoiceProfile — how one creator actually talks, learned from their transcripts.
 *
 * This is the asset the product is really built around. Anyone can generate a
 * script about today's news; the only thing worth paying for is a script that
 * sounds like the person who has to read it out loud.
 *
 * ── WHY VERBATIM SAMPLES ARE STORED ALONGSIDE THE DESCRIPTION ────────────────
 * A described style ("energetic, uses rhetorical questions") produces generic
 * writing, because every creator's description sounds the same. Their ACTUAL
 * opening lines do not. So the profile keeps both: prose analysis for the parts a
 * model can reason about, and real quoted openings/closings as few-shot anchors,
 * which is what makes the output land in a specific voice rather than a plausible
 * average of all Hindi tech creators.
 *
 * One row per user, rebuilt when they add videos — cheap to regenerate (a few
 * thousand input tokens), so it is never patched incrementally.
 */
const VoiceProfileSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },

  // Which transcripts produced this. Used to detect staleness: if the user has
  // transcripts this profile never saw, it is out of date.
  built_from:     [{ type: Schema.Types.ObjectId, ref: "Transcript" }],
  transcript_count: { type: Number, default: 0 },

  // The language the scripts must come back in. Taken from their transcripts, not
  // guessed — a Hinglish creator must never receive a pure-Hindi or English script.
  language:       { type: String, default: "" },   // hi-en, te-en, hi, en …
  language_label: { type: String, default: "" },

  // ── How they open ──────────────────────────────────────────────────────────
  // The single highest-value thing here. The first line decides whether a video
  // is watched, and it is the most personal, most repeated pattern a creator has.
  opening_patterns: [{ type: String }],
  sample_openings:  [{ type: String }],   // verbatim, in their own script

  // ── How they move through a topic ──────────────────────────────────────────
  narration_arc:    { type: String, default: "" },
  recurring_moves:  [{ type: String }],

  // ── How they close ─────────────────────────────────────────────────────────
  closing_patterns: [{ type: String }],
  sample_closings:  [{ type: String }],   // verbatim

  // ── Texture ────────────────────────────────────────────────────────────────
  signature_phrases: [{ type: String }],  // verbatim catchphrases and fillers
  vocabulary_notes:  { type: String, default: "" }, // which English words stay English
  sentiment:         { type: String, default: "" }, // their habitual stance
  pacing:            { type: String, default: "" },
  audience:          { type: String, default: "" },
  topics:            [{ type: String }],  // what they gravitate toward
  avoid:             [{ type: String }],  // what they never do

  // The dense instruction block actually injected into the writing prompt. Built
  // once here so script generation stays a single cheap call that does not have to
  // re-derive the style every time.
  style_brief: { type: String, default: "" },

  // How much to trust this. One video is a hint; five is a voice. Surfaced in the
  // UI so a thin profile never silently passes for a good one.
  confidence: { type: String, enum: ["thin", "fair", "good"], default: "thin" },

  usage: {
    input_tokens:    { type: Number, default: 0 },
    output_tokens:   { type: Number, default: 0 },
    thinking_tokens: { type: Number, default: 0 },
    total_tokens:    { type: Number, default: 0 },
    usd:             { type: Number, default: 0 },
  },

  built_at:   { type: Date, default: Date.now },
  created_at: { type: Date, default: Date.now },
});

export default mongoose.models.VoiceProfile ||
  mongoose.model("VoiceProfile", VoiceProfileSchema, "voice_profiles");

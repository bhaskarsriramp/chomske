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
 * Rebuilt when they add videos — cheap to regenerate (a few thousand input
 * tokens), so it is never patched incrementally.
 *
 * ── ONE VOICE PER PROFILE ────────────────────────────────────────────────────
 * This used to be one row per USER, enforced by a unique index on `user`. That
 * was wrong for how creators actually work: one person runs a Hindi tech channel
 * and an English one, and blending those into a single profile produces a voice
 * that is nobody's — the same failure the mixed-language warning in
 * routes/transcribe.js already had to warn about.
 *
 * It is now one row per PROFILE (models/Profile.js), which is the container for
 * a whole channel: its categories, its videos, its scripts and this. A profile
 * has exactly one voice, so this row carries no name of its own — what it is
 * called is the profile's name, and storing that twice is storing it wrong.
 *
 * The unique index on `user` is therefore gone, replaced by a unique index on
 * `profile`. The old one still exists in any database created before this
 * change: VoiceProfile.syncIndexes() at boot (server.js) drops it, and
 * scripts/migrateProfiles.js backfills the data.
 */
const VoiceProfileSchema = new Schema({
  // Kept alongside `profile` so every ownership check can be scoped to the
  // caller without a join. A profile id alone must never be enough to read or
  // overwrite somebody else's voice.
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

  // The channel this voice belongs to. One voice per profile — enforced by the
  // unique index below, not by application logic that a double-click can race.
  profile: { type: Schema.Types.ObjectId, ref: "Profile", required: true },

  // Which transcripts produced this. Used to detect staleness: if the profile
  // holds transcripts this voice never saw, it is out of date.
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

  // Counted, not described. Code-mixing ratio, sentence lengths, question rate,
  // the English words they actually keep, the phrases repeated across videos.
  // Computed by services/voiceMetrics.js with no model involved, which is why
  // these are the only fields here that cannot be hallucinated — and why the
  // script writer can be held to them numerically instead of asked nicely.
  metrics: { type: mongoose.Schema.Types.Mixed, default: null },

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

  // When an automatic rebuild last failed. The inputs do not change between one
  // script and the next, so a rebuild that just failed will fail again for the
  // same reason and at the same price — this is what stops every press of
  // "Write this in my voice" paying for the identical doomed analysis.
  build_failed_at: { type: Date, default: null },

  // Null until the first successful analysis. This — not the presence of the row
  // — is what "this voice is ready" means: a profile that has collected videos
  // but has never been analysed has no style to write from.
  built_at:   { type: Date, default: null },
  created_at: { type: Date, default: Date.now },
});

// One voice per profile, enforced by the database.
VoiceProfileSchema.index({ profile: 1 }, { unique: true });

export default mongoose.models.VoiceProfile ||
  mongoose.model("VoiceProfile", VoiceProfileSchema, "voice_profiles");

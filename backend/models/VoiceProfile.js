import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * VoiceProfile, how one creator actually talks, learned from their transcripts.
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
 * Rebuilt when they add videos, cheap to regenerate (a few thousand input
 * tokens), so it is never patched incrementally.
 *
 * ── ONE VOICE PER PROFILE ────────────────────────────────────────────────────
 * This used to be one row per USER, enforced by a unique index on `user`. That
 * was wrong for how creators actually work: one person runs a Hindi tech channel
 * and an English one, and blending those into a single profile produces a voice
 * that is nobody's, the same failure the mixed-language warning in
 * routes/transcribe.js already had to warn about.
 *
 * It is now one row per PROFILE (models/Profile.js), which is the container for
 * a whole channel: its categories, its videos, its scripts and this. A profile
 * has exactly one voice, so this row carries no name of its own, what it is
 * called is the profile's name, and storing that twice is storing it wrong.
 *
 * The unique index on `user` is therefore gone, replaced by a unique index on
 * `profile`. The old one still exists in any database created before this
 * change: VoiceProfile.syncIndexes() at boot (server.js) drops it, and
 * scripts/migrateProfiles.js backfills the data.
 */
/**
 * ── THE LONG LANE ────────────────────────────────────────────────────────────
 * The same analysis, run again over a different kind of video, because a tech
 * creator has two voices and the second one cannot be inferred from the first.
 *
 * Under two minutes they cover ONE product start to finish. Over two minutes
 * they cover seven to fourteen, and the defining skill stops being the hook and
 * becomes the JOIN: how they close item four and open item five. That move does
 * not appear in a Short even once, because a Short has no second item, so a
 * voice learned from Shorts and asked to write a bulletin repeats one gesture
 * fourteen times. See services/voiceLanes.js for the full argument.
 *
 * ── WHY THIS IS A SUB-DOCUMENT AND NOT A SECOND ROW ─────────────────────────
 * Because the top-level fields on this schema are ALREADY the short lane, and
 * always have been: routes/transcribe.js has never accepted a video over 90
 * seconds, so every voice ever built here was built from short-form. Keeping
 * short at the top level means no migration, no rewrite of the dozen places
 * that read `profile.style_brief`, and no window where a half-migrated row
 * makes a creator's voice disappear.
 *
 * The fields are a deliberate subset of the parent's. `language` is absent
 * because a person speaks one language in both formats; voiceForLane() falls
 * back to the parent for it, which also means a long lane built before a field
 * existed can never hand the writer an empty language.
 */
const LongLaneSchema = new Schema({
  built_from:       [{ type: Schema.Types.ObjectId, ref: "Transcript" }],
  transcript_count: { type: Number, default: 0 },

  opening_patterns: [{ type: String }],
  sample_openings:  [{ type: String }],
  narration_arc:    { type: String, default: "" },
  recurring_moves:  [{ type: String }],
  closing_patterns: [{ type: String }],
  sample_closings:  [{ type: String }],
  signature_phrases: [{ type: String }],
  vocabulary_notes:  { type: String, default: "" },
  sentiment:         { type: String, default: "" },
  pacing:            { type: String, default: "" },
  audience:          { type: String, default: "" },
  avoid:             [{ type: String }],
  style_brief:       { type: String, default: "" },

  // Carried so a long lane can be read on its own where that is simpler, and so
  // a creator who genuinely writes long-form in a second language is not forced
  // into the short lane's answer.
  language:       { type: String, default: "" },
  language_label: { type: String, default: "" },

  // Measured over long-form transcripts specifically. Speaking rate is NOT the
  // same across formats, Shorts are compressed and run measurably faster, and
  // wordTarget() turns that rate directly into a word count. Using the Short
  // rate for an eight-minute script is how a script comes back a minute long.
  metrics: { type: mongoose.Schema.Types.Mixed, default: null },

  // The category-specific block for this lane. Same shape as the parent's.
  category_voice: { type: mongoose.Schema.Types.Mixed, default: null },

  confidence: { type: String, enum: ["thin", "fair", "good"], default: "thin" },
  built_at:   { type: Date, default: null },
  builds:     { type: Number, default: 0 },

  building:    { type: Boolean, default: false },
  build_error: { type: String, default: "" },
  build_failed_at: { type: Date, default: null },
}, { _id: false });

const VoiceProfileSchema = new Schema({
  // Kept alongside `profile` so every ownership check can be scoped to the
  // caller without a join. A profile id alone must never be enough to read or
  // overwrite somebody else's voice.
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

  // The channel this voice belongs to. One voice per profile, enforced by the
  // unique index below, not by application logic that a double-click can race.
  profile: { type: Schema.Types.ObjectId, ref: "Profile", required: true },

  // Which transcripts produced this. Used to detect staleness: if the profile
  // holds transcripts this voice never saw, it is out of date.
  built_from:     [{ type: Schema.Types.ObjectId, ref: "Transcript" }],
  transcript_count: { type: Number, default: 0 },

  // The language the scripts must come back in. Taken from their transcripts, not
  // guessed, a Hinglish creator must never receive a pure-Hindi or English script.
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
  // these are the only fields here that cannot be hallucinated, and why the
  // script writer can be held to them numerically instead of asked nicely.
  metrics: { type: mongoose.Schema.Types.Mixed, default: null },

  /**
   * ── WHAT THEY SAY, NOT ONLY HOW THEY SAY IT ────────────────────────────────
   * Everything above this line is category-blind: openings, closings, fillers,
   * code-mixing. All of it necessary, none of it sufficient, because two tech
   * creators with identical openings still sound nothing alike the moment they
   * reach a spec sheet or a price.
   *
   * This holds the answers to the questions only this category asks: whether a
   * battery is "6000 mAh" or "chhe hazaar", how they say ₹15,000 out loud, the
   * exact words they use to tell somebody not to buy something. The fields are
   * defined per category in services/categories.js under `voice`, so this is
   * Mixed on purpose, the schema for it lives with the category that asked for
   * it rather than being frozen here.
   */
  category_voice: { type: mongoose.Schema.Types.Mixed, default: null },

  /**
   * Which category's questions produced `category_voice`.
   *
   * Read as a staleness marker in two directions. Empty means this voice predates
   * category-aware analysis and has never been asked the questions that make it
   * specific, which is what earns the one free rebuild. A different id means the
   * profile changed category and the answers on file are about the wrong subject.
   */
  built_for_category: { type: String, default: "" },

  /**
   * Which VERSION of that category's question set produced them.
   *
   * built_for_category alone answers "were these answers about the right
   * subject". It cannot answer "were they about the right subject, asked the
   * way we ask now", and that is the case that actually recurs: the field list
   * in services/categories.js grows, every stored profile keeps saying
   * "tech_gadgets", the staleness check sees nothing wrong, and creators are
   * charged for a rebuild that exists because we changed the questions.
   *
   * 0 means a profile built before versioning, which is stale by definition.
   */
  built_for_spec: { type: Number, default: 0 },

  // The long-form voice. Null until they add long videos and run it; see the
  // sub-schema above for why the short lane is not symmetric with it.
  long: { type: LongLaneSchema, default: () => ({}) },

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
  // same reason and at the same price, this is what stops every press of
  // "Write this in my voice" paying for the identical doomed analysis.
  build_failed_at: { type: Date, default: null },

  // Reading several videos and then analysing them runs to minutes, far past
  // any HTTP timeout, so the build is kicked off and polled rather than held
  // open. These two are what the client polls on.
  building: { type: Boolean, default: false },
  build_error: { type: String, default: "" },

  // Null until the first successful analysis. This, not the presence of the row
  // is what "this voice is ready" means: a profile that has collected videos
  // but has never been analysed has no style to write from.
  built_at:   { type: Date, default: null },

  // ── HOW MANY TIMES THIS HAS BEEN ANALYSED ─────────────────────────────────
  // The first two builds are free (see VOICE_FREE_BUILDS in
  // services/creditPricing.js): the first because a voice a creator has never
  // heard is not something they can be asked to pay for, and the second because
  // the first attempt is usually the one where they discover a video was the
  // wrong one. Everything after that is a rebuild of a voice that already
  // works, and it re-reads every video, so it is priced.
  //
  // Counted on SUCCESS only. A build that failed cost the creator nothing (it
  // is refunded) and must not use up a free one.
  builds: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
});

// One voice per profile, enforced by the database.
VoiceProfileSchema.index({ profile: 1 }, { unique: true });

export default mongoose.models.VoiceProfile ||
  mongoose.model("VoiceProfile", VoiceProfileSchema, "voice_profiles");

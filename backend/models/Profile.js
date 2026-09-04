import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * Profile — one channel's workspace.
 *
 * This is the top-level thing a creator works inside. Someone running three
 * YouTube channels in three niches keeps three profiles, and each one owns:
 *
 *   · its own CATEGORIES     — the tech channel watches AI and markets, the
 *                              other watches sports and science
 *   · exactly one VOICE      — see models/VoiceProfile.js, keyed on this row
 *   · its own VIDEOS         — the transcripts that taught that voice
 *   · its own SCRIPTS        — everything written for that channel
 *
 * ── WHY THE NAME IS MANDATORY ────────────────────────────────────────────────
 * The name is the only thing distinguishing three profiles in a dropdown at the
 * moment credits are spent. "Untitled" next to "Untitled" is how a creator pays
 * to have a story written for the wrong channel, in the wrong voice, about a
 * category that channel does not cover. So it is asked for at creation — the
 * first one defaults to "My Profile", every later one has to be typed.
 *
 * ── WHY CATEGORIES LIVE HERE AND NOT ON THE USER ─────────────────────────────
 * They used to be a field on User, which made "what do you cover" an account-wide
 * answer. It is not: it is a per-channel answer, and a sports channel should
 * never see AI stories because the same person also runs a tech channel.
 *
 * User.categories still exists, but ONLY as the denormalised union of every
 * profile's categories — the collector schedules paid work off it and needs to
 * know everything any profile watches. profileService.syncUserCategories() is
 * the single place that writes it.
 */
const ProfileSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

  name: { type: String, required: true, trim: true, maxlength: 60 },

  // What THIS channel covers. Same ids as services/categories.js.
  categories: { type: [String], default: [] },

  // Which one the app opens on. Exactly one per user should carry this; the
  // service repairs it rather than trusting it — a stale flag decides which
  // channel a script gets written for, so "probably right" is not good enough.
  is_default: { type: Boolean, default: false },

  created_at: { type: Date, default: Date.now },
});

// The list query behind every profile picker: this user's profiles, oldest
// first, so the order they made them in is the order they see.
ProfileSchema.index({ user: 1, created_at: 1 });

export default mongoose.models.Profile || mongoose.model("Profile", ProfileSchema, "profiles");

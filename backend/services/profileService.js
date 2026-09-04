/**
 * profileService.js — the creator's channels.
 *
 * A Profile (models/Profile.js) is the container everything else hangs off:
 * categories, one voice, that voice's videos, and the scripts written for it.
 * Someone running three YouTube channels keeps three profiles and switches
 * between them; every screen in the app is about exactly one at a time.
 *
 * Nothing here calls a model or costs anything. The analysis lives in
 * voiceProfileService.js, which this file's `voiceFor()` hands a row to.
 */
import mongoose from "mongoose";
import Profile from "../models/Profile.js";
import VoiceProfile from "../models/VoiceProfile.js";
import Transcript from "../models/Transcript.js";
import Script from "../models/Script.js";
import User from "../models/User.js";
import { sanitizeSelection, isValidCategory } from "./categories.js";

// How many channels one account may keep.
//
// This is a spend ceiling, not a tidiness rule. Every profile carries its own
// slots of videos, and reading a video is the single expensive thing this
// product does — an unbounded number of profiles is an unbounded transcription
// bill from one account. DAILY_TRANSCRIBE_LIMIT caps the rate; this caps the
// total.
export const MAX_PROFILES = Math.max(1, parseInt(process.env.MAX_PROFILES || "5", 10));

const MAX_VOICE_VIDEOS = () => parseInt(process.env.MAX_VOICE_VIDEOS || "5", 10);

/** The name the very first profile gets, so onboarding never has to ask twice. */
export const DEFAULT_PROFILE_NAME = "My Profile";

/* ── Reading ────────────────────────────────────────────────────────────────*/

/**
 * The user's profiles, oldest first, each with the counts every screen needs.
 *
 * Two aggregates rather than four queries per profile: a creator with five
 * channels would otherwise cost twenty round trips to render a dropdown.
 */
export async function listProfiles(userId) {
  const uid = new mongoose.Types.ObjectId(String(userId));

  const [profiles, voices, videoCounts] = await Promise.all([
    Profile.find({ user: userId }).sort({ created_at: 1 }).lean(),
    VoiceProfile.find({ user: userId }).lean(),
    Transcript.aggregate([
      { $match: { user: uid } },
      {
        $group: {
          _id: "$profile",
          // "Held" is what fills a slot: anything not failed, including a video
          // still processing. "Ready" is what analysis can actually read.
          held: { $sum: { $cond: [{ $ne: ["$status", "failed"] }, 1, 0] } },
          ready: {
            $sum: { $cond: [{ $and: [{ $eq: ["$status", "done"] }, { $ne: ["$text", ""] }] }, 1, 0] },
          },
        },
      },
    ]).catch(() => []),
  ]);

  const voiceBy = new Map(voices.map((v) => [String(v.profile), v]));
  const countBy = new Map(videoCounts.map((c) => [String(c._id), c]));

  return profiles.map((p) => shapeProfile(p, voiceBy.get(String(p._id)), countBy.get(String(p._id))));
}

/** The list shape every screen renders from. Never includes the style brief. */
export function shapeProfile(p, voice, count) {
  const held = count?.held || 0;
  const ready = count?.ready || 0;
  const built = !!voice?.built_at;
  const max = MAX_VOICE_VIDEOS();

  return {
    id: String(p._id),
    name: p.name || "",
    is_default: !!p.is_default,
    categories: p.categories || [],

    videos: { used: held, ready, max, left: Math.max(0, max - held) },

    voice: {
      built,
      transcript_count: voice?.transcript_count || 0,
      language: voice?.language || "",
      language_label: voice?.language_label || "",
      confidence: voice?.confidence || "thin",
      // Behind if the profile holds videos the analysis never saw. Counted
      // against what is READY, since a still-processing video was never
      // analysable.
      stale: built && (voice?.transcript_count || 0) !== ready,
      built_at: voice?.built_at || null,
    },

    created_at: p.created_at,
  };
}

/* ── Writing ────────────────────────────────────────────────────────────────*/

/**
 * Adopt rows written before profiles existed.
 *
 * A transcript, script or voice with no `profile` predates this feature. Left
 * alone it would vanish from every per-profile list — a creator would open the
 * app after the deploy and find their five videos gone. So the first profile a
 * user has takes ownership of everything unclaimed.
 *
 * Idempotent, and cheap when there is nothing to do: the counts are index hits
 * and the updates only run when non-zero. Safe to call on every request that
 * needs a profile, which is what makes the migration script optional rather
 * than load-bearing.
 */
async function adoptOrphans(userId, profileId) {
  const orphans = await Transcript.countDocuments({ user: userId, profile: null });
  if (orphans > 0) {
    await Transcript.updateMany({ user: userId, profile: null }, { $set: { profile: profileId } });
    console.log(`[profiles] adopted ${orphans} pre-existing video(s) into profile ${profileId}`);
  }

  // Scripts too, or "My scripts" filtered by profile would show an empty
  // history to someone who has written thirty.
  await Script.updateMany(
    { user: userId, $or: [{ profile: null }, { profile: { $exists: false } }] },
    { $set: { profile: profileId } }
  ).catch(() => {});

  // And the voice itself. Before profiles this was one row per user, so an
  // existing analysis has no profile to belong to — without this the creator
  // would be told to analyse a voice we already have.
  await VoiceProfile.updateMany(
    { user: userId, $or: [{ profile: null }, { profile: { $exists: false } }] },
    { $set: { profile: profileId } }
  ).catch(() => {});
}

/**
 * The profile to act on when the caller didn't name one, creating the first one
 * if this account has never had any.
 */
export async function ensureProfile(userId) {
  let profiles = await Profile.find({ user: userId }).sort({ created_at: 1 });

  if (!profiles.length) {
    // Seeded from whatever the account already watched, so a user who signed up
    // before profiles existed keeps their feed instead of landing on an empty
    // one and being asked to choose again.
    const legacy = await User.findById(userId).select("categories").lean().catch(() => null);

    await Profile.create({
      user: userId,
      name: DEFAULT_PROFILE_NAME,
      categories: sanitizeSelection(legacy?.categories || []),
      is_default: true,
      created_at: new Date(),
    });

    // Re-read rather than trusting the insert: two requests arriving together
    // can both find nothing and both create. Whoever is second sees both rows
    // here and the repair below settles on the older one, so the worst case is
    // one spare profile rather than a user with two conflicting defaults.
    profiles = await Profile.find({ user: userId }).sort({ created_at: 1 });
  }

  // Exactly one default. Repaired rather than assumed — a stale flag decides
  // which channel a script gets written for, so "probably right" is not enough.
  const defaults = profiles.filter((p) => p.is_default);
  const active = defaults[0] || profiles[0];
  if (defaults.length !== 1 || !active.is_default) {
    await Profile.updateMany({ user: userId, _id: { $ne: active._id } }, { $set: { is_default: false } });
    await Profile.updateOne({ _id: active._id }, { $set: { is_default: true } });
    active.is_default = true;
  }

  await adoptOrphans(userId, active._id);
  return active;
}

/**
 * Resolve a caller-supplied profile id to one of this user's profiles.
 *
 * Falls back to the default rather than erroring: an id from a stale tab, or a
 * profile deleted in another window, should land the creator on a working
 * screen, not on "not found". Returns { profile, requested_missing }.
 */
export async function resolveProfile(userId, profileId) {
  const id = String(profileId || "").trim();
  if (id && id !== "all" && mongoose.Types.ObjectId.isValid(id)) {
    const found = await Profile.findOne({ _id: id, user: userId });
    if (found) return { profile: found, requested_missing: false };
    return { profile: await ensureProfile(userId), requested_missing: true };
  }
  return { profile: await ensureProfile(userId), requested_missing: false };
}

/** A new channel. Refuses past the ceiling rather than silently capping. */
export async function createProfile(userId, { name, categories } = {}) {
  const clean = String(name || "").trim().slice(0, 60);
  if (!clean) {
    const err = new Error("Give this profile a name.");
    err.needs_name = true;
    throw err;
  }

  const held = await Profile.countDocuments({ user: userId });
  if (held >= MAX_PROFILES) {
    const err = new Error(`You can keep ${MAX_PROFILES} profiles. Delete one to add another.`);
    err.limit_reached = true;
    throw err;
  }

  const doc = await Profile.create({
    user: userId,
    name: clean,
    categories: sanitizeSelection(categories),
    // Never steals the default from an existing profile — switching which
    // channel you are working on is a choice, not a side effect of making one.
    is_default: held === 0,
    created_at: new Date(),
  });

  await syncUserCategories(userId);
  return doc;
}

/** Rename, re-scope, or both. Only the fields present are touched. */
export async function updateProfile(userId, profileId, { name, categories } = {}) {
  const set = {};

  if (name !== undefined) {
    const clean = String(name || "").trim().slice(0, 60);
    if (!clean) {
      const err = new Error("Give this profile a name.");
      err.needs_name = true;
      throw err;
    }
    set.name = clean;
  }

  if (categories !== undefined) {
    const chosen = sanitizeSelection(categories);
    if (!chosen.length) {
      const err = new Error("Pick at least one category for this profile.");
      err.needs_categories = true;
      throw err;
    }
    set.categories = chosen;
  }

  if (!Object.keys(set).length) return Profile.findOne({ _id: profileId, user: userId });

  const doc = await Profile.findOneAndUpdate({ _id: profileId, user: userId }, { $set: set }, { new: true });
  if (doc && set.categories) await syncUserCategories(userId);
  return doc;
}

/** Make this the profile the app opens on. */
export async function setDefaultProfile(userId, profileId) {
  const target = await Profile.findOne({ _id: profileId, user: userId });
  if (!target) return null;
  await Profile.updateMany({ user: userId, _id: { $ne: target._id } }, { $set: { is_default: false } });
  await Profile.updateOne({ _id: target._id }, { $set: { is_default: true } });
  return target;
}

/**
 * Delete a channel: its voice, and the videos that taught it.
 *
 * Scripts are NOT deleted. They are the thing the creator paid for, and losing
 * six months of writing because they tidied up their channels would be
 * unforgivable — they keep the copied profile_name and simply stop matching
 * that filter.
 *
 * The last profile cannot be deleted: with none left there is nowhere for the
 * next video to go and no categories to draw a feed from, and the app would be
 * creating one back a moment later anyway.
 */
export async function deleteProfile(userId, profileId) {
  // Ownership is checked BEFORE the "is this your last one" rule, and both
  // before anything is removed. The other order answers "this is your only
  // profile" to someone deleting a profile that isn't theirs — a confusing
  // reply to the wrong question, reporting on their account instead of simply
  // saying the id was not found.
  const target = await Profile.findOne({ _id: profileId, user: userId });
  if (!target) return null;

  const count = await Profile.countDocuments({ user: userId });
  if (count <= 1) {
    const err = new Error("This is your only profile. Edit it instead, or make another first.");
    err.last_one = true;
    throw err;
  }

  const doc = await Profile.findOneAndDelete({ _id: target._id, user: userId });
  if (!doc) return null;

  await Transcript.deleteMany({ user: userId, profile: doc._id });
  await VoiceProfile.deleteMany({ user: userId, profile: doc._id });
  // Detached rather than deleted, so the scripts survive with their labels.
  await Script.updateMany({ user: userId, profile: doc._id }, { $set: { profile: null } }).catch(() => {});

  if (doc.is_default) await ensureProfile(userId);   // promotes the next one
  await syncUserCategories(userId);
  return doc;
}

/**
 * Rewrite User.categories as the union of every profile's categories.
 *
 * ── WHY THIS DENORMALISATION EXISTS ─────────────────────────────────────────
 * The collector decides what to spend money on by reading
 * `User.distinct("categories", { last_seen_at: … })` — a handful of ids however
 * many accounts exist (services/newsCadence.js). Doing that across profiles
 * would mean joining profiles to their users on every scheduler tick to answer
 * a question that changes only when someone edits their categories.
 *
 * So the per-profile list is the truth for what a creator SEES, and this field
 * is the union of it, for what we PAY TO COLLECT. This function is the only
 * place that writes it — anywhere else and the two drift, which shows up as a
 * category that quietly stopped being collected.
 */
export async function syncUserCategories(userId) {
  const rows = await Profile.find({ user: userId }).select("categories").lean();

  // Validated but NOT capped, and that distinction is the whole point.
  //
  // sanitizeSelection() stops at MAX_CATEGORIES, which is the limit on what ONE
  // channel may watch. This field is the union across every channel, so a
  // creator with three profiles of three categories legitimately reaches nine.
  // Running it through sanitizeSelection truncated the union to three and
  // silently stopped collecting for every category past the cut — a paying user
  // watching a category that quietly never updates again, with nothing anywhere
  // saying why. The per-profile cap is still enforced where it belongs, on the
  // profile itself.
  const union = [...new Set(rows.flatMap((r) => r.categories || []))].filter(isValidCategory);

  await User.updateOne({ _id: userId }, { $set: { categories: union } }).catch(() => {});
  return union;
}

/**
 * The VoiceProfile row for a profile, created empty if it has never had one.
 *
 * Upserted rather than found-or-created so two requests arriving together
 * cannot make two — the unique index on `profile` would reject the second, and
 * this way there is no second.
 */
export async function voiceFor(userId, profileId) {
  return VoiceProfile.findOneAndUpdate(
    { profile: profileId },
    { $setOnInsert: { user: userId, profile: profileId, created_at: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

export default {
  listProfiles, shapeProfile, ensureProfile, resolveProfile,
  createProfile, updateProfile, setDefaultProfile, deleteProfile,
  syncUserCategories, voiceFor, MAX_PROFILES, DEFAULT_PROFILE_NAME,
};

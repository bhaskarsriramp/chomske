/**
 * profiles.js: the creator's channels.
 *
 * A profile is one channel's workspace: its categories, its one voice, that
 * voice's videos, and the scripts written for it. Someone running three YouTube
 * channels in three niches keeps three profiles and switches between them.
 *
 * ── THE NAME IS REQUIRED AT CREATION ────────────────────────────────────────
 * Unlike everything else here, the name cannot be deferred. It is the only thing
 * telling three profiles apart in the dropdown where credits are spent, and
 * "Untitled" next to "Untitled" is how a creator pays for a story written for
 * the wrong channel. The first profile is named for them ("My Profile") during
 * onboarding; every later one has to be typed.
 *
 * Everything here is scoped to req.user.id. A profile id alone is never enough
 * to read, rename or delete one.
 */
import express from "express";
import mongoose from "mongoose";
import Transcript from "../models/Transcript.js";
import Script from "../models/Script.js";
import VoiceProfile from "../models/VoiceProfile.js";
import authenticateToken from "../middleware/authenticateToken.js";
import {
  listProfiles, ensureProfile, resolveProfile, createProfile, updateProfile,
  setDefaultProfile, deleteProfile, shapeProfile, voiceFor, MAX_PROFILES,
} from "../services/profileService.js";
import { buildVoiceProfile } from "../services/voiceProfileService.js";
import { kickoffCategories } from "../services/newsScheduler.js";
import { getCategory } from "../services/categories.js";

const router = express.Router();

/**
 * GET /profiles, every channel this creator has, with the counts each screen needs.
 *
 * ensureProfile() runs first so a brand new account, and an account that
 * predates profiles, both come back with something to select rather than an
 * empty dropdown and a dead end.
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    await ensureProfile(req.user.id);
    const profiles = await listProfiles(req.user.id);
    return res.json({
      success: true,
      profiles: profiles.map(withLabels),
      max: MAX_PROFILES,
      active: profiles.find((p) => p.is_default)?.id || profiles[0]?.id || null,
    });
  } catch (err) {
    console.error("[profiles] list failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't load your profiles." });
  }
});

/** POST /profiles  { name, categories }, a new channel. */
router.post("/", authenticateToken, async (req, res) => {
  try {
    const doc = await createProfile(req.user.id, {
      name: req.body?.name,
      categories: req.body?.categories,
    });

    // A category this account has never watched may never have been collected,
    // or may have gone cold. Without this the new profile opens on an empty feed
    // and stays empty until the next scheduler tick.
    kickoffCategories(doc.categories);

    const profiles = await listProfiles(req.user.id);
    return res.status(201).json({
      success: true,
      profile: withLabels(profiles.find((p) => p.id === String(doc._id)) || shapeProfile(doc.toObject())),
      profiles: profiles.map(withLabels),
    });
  } catch (err) {
    if (err.limit_reached) {
      return res.status(400).json({ success: false, limit_reached: true, message: err.message });
    }
    if (err.needs_name) {
      return res.status(400).json({ success: false, needs_name: true, message: err.message });
    }
    console.error("[profiles] create failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't create that profile." });
  }
});

/**
 * PATCH /profiles/:id  { name?, categories?, is_default? }
 * Rename, re-scope, or make this the one the app opens on.
 */
router.patch("/:id", authenticateToken, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid id" });
  }
  try {
    if (req.body?.name !== undefined || req.body?.categories !== undefined) {
      const doc = await updateProfile(req.user.id, req.params.id, {
        name: req.body?.name,
        categories: req.body?.categories,
      });
      if (!doc) return res.status(404).json({ success: false, message: "Not found" });
      if (req.body?.categories !== undefined) kickoffCategories(doc.categories);
    }

    if (req.body?.is_default === true) {
      const doc = await setDefaultProfile(req.user.id, req.params.id);
      if (!doc) return res.status(404).json({ success: false, message: "Not found" });
    }

    const profiles = await listProfiles(req.user.id);
    return res.json({
      success: true,
      profiles: profiles.map(withLabels),
      profile: withLabels(profiles.find((p) => p.id === req.params.id) || null),
    });
  } catch (err) {
    if (err.needs_name) return res.status(400).json({ success: false, needs_name: true, message: err.message });
    if (err.needs_categories) {
      return res.status(400).json({ success: false, needs_categories: true, message: err.message });
    }
    console.error("[profiles] patch failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't update that profile." });
  }
});

/**
 * DELETE /profiles/:id, the channel, its voice, and the videos that taught it.
 *
 * Scripts written for it are kept and detached: they carry a copied
 * profile_name, so a creator tidying up their channels never loses writing they
 * paid for.
 */
router.delete("/:id", authenticateToken, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid id" });
  }
  try {
    const doc = await deleteProfile(req.user.id, req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Not found" });
    const profiles = await listProfiles(req.user.id);
    return res.json({ success: true, deleted: String(doc._id), profiles: profiles.map(withLabels) });
  } catch (err) {
    if (err.last_one) return res.status(400).json({ success: false, last_one: true, message: err.message });
    console.error("[profiles] delete failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't delete that profile." });
  }
});

/**
 * POST /profiles/:id/analyse, learn this channel's voice from its videos.
 *
 * ── WHY THIS IS NOW KICKED OFF AND POLLED ────────────────────────────────────
 * It used to be held open: one text-in text-out call over transcripts that had
 * already been read, landing in a few seconds. That stopped being true when
 * adding a video stopped reading it. This call now reads every pending video
 * first, and five video reads plus the analysis runs to minutes, past the
 * client's timeout and past nginx's default proxy_read_timeout of sixty
 * seconds. Held open, it would fail on exactly the accounts doing the most work.
 *
 * So it claims the build, returns immediately, and the client polls
 * GET /script/voice until `building` clears. `building` is on the VoiceProfile
 * row rather than in memory so a restart mid-build cannot strand the flag
 * somewhere the next request cannot see it.
 */
router.post("/:id/analyse", authenticateToken, async (req, res) => {
  try {
    const { profile } = await resolveProfile(req.user.id, req.params.id);
    const voice = await voiceFor(req.user.id, profile._id);

    // Already running. Answered as success, because the end state the caller
    // wants is already on its way and a second press should not read the same
    // videos twice.
    if (voice.building) {
      return res.status(202).json({ success: true, building: true, already: true });
    }

    const analysable = await Transcript.countDocuments({
      user: req.user.id,
      profile: profile._id,
      status: { $in: ["pending", "processing", "done"] },
    });
    if (!analysable) {
      return res.status(400).json({
        success: false,
        message: "Add at least one video to this profile first. That's what its voice is learned from.",
      });
    }

    await VoiceProfile.updateOne(
      { _id: voice._id },
      { $set: { building: true, build_error: "" } }
    );

    // Fire and forget; the client polls.
    buildVoiceProfile(req.user.id, profile._id)
      .then(({ built, reason }) => VoiceProfile.updateOne({ _id: voice._id }, {
        $set: {
          building: false,
          build_error: built ? "" : (reason === "no_transcripts"
            ? "None of the videos could be read. Check they are public and try again."
            : "Couldn't build this voice."),
        },
      }))
      .catch((err) => {
        console.error("[profiles] analyse failed:", err.message);
        return VoiceProfile.updateOne({ _id: voice._id }, {
          $set: {
            building: false,
            build_error: err.userMessage || "Couldn't analyse this voice. Please try again.",
          },
        });
      })
      .catch(() => {});

    return res.status(202).json({ success: true, building: true });
  } catch (err) {
    console.error("[profiles] analyse kickoff failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't start this analysis." });
  }
});

/**
 * DELETE /profiles/:id/voice, throw away the voice AND the videos behind it.
 *
 * The videos go with it, deliberately. A voice is nothing but its videos read;
 * leaving them behind would mean the next Analyse press rebuilt the same voice
 * from the same set, which is not what somebody pressing Delete is asking for.
 * They want to start the channel's voice again from nothing, and this is the
 * one control that does it without deleting the channel itself.
 *
 * Scripts already written keep working. They carry their own copy of the voice
 * they were written in, so this cannot reach back and change anything a creator
 * has already paid for.
 */
router.delete("/:id/voice", authenticateToken, async (req, res) => {
  try {
    const { profile } = await resolveProfile(req.user.id, req.params.id);
    const [voiceGone, videosGone] = await Promise.all([
      VoiceProfile.deleteMany({ user: req.user.id, profile: profile._id }),
      Transcript.deleteMany({ user: req.user.id, profile: profile._id }),
    ]);

    const profiles = await listProfiles(req.user.id);
    return res.json({
      success: true,
      // False when there was nothing to delete. The caller treats that as done
      // rather than as an error: the end state they asked for is the end state.
      deleted: (voiceGone.deletedCount || 0) > 0,
      videos_deleted: videosGone.deletedCount || 0,
      profiles: profiles.map(withLabels),
    });
  } catch (err) {
    console.error("[profiles] voice delete failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't delete this voice." });
  }
});

/** What deleting one would actually destroy. Drives the confirmation. */
router.get("/:id/usage", authenticateToken, async (req, res) => {
  try {
    const { profile } = await resolveProfile(req.user.id, req.params.id);
    const [videos, scripts] = await Promise.all([
      Transcript.countDocuments({ user: req.user.id, profile: profile._id }),
      Script.countDocuments({ user: req.user.id, profile: profile._id }),
    ]);
    return res.json({ success: true, videos, scripts });
  } catch (err) {
    console.error("[profiles] usage failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't read that profile." });
  }
});

/**
 * Category ids are storage; labels are what a person reads. Resolved here rather
 * than in the browser so the two can never disagree about what "ai_tech" means.
 */
function withLabels(p) {
  if (!p) return null;
  return {
    ...p,
    category_labels: (p.categories || []).map((id) => getCategory(id)?.label || id),
  };
}

/** The learned detail, for the panel that shows what an analysis found. */
/** The same summary the voice endpoint returns. See shapeProfile in
 *  routes/script.js for why the analysis itself does not leave the server. */
function shapeVoice(v) {
  if (!v) return null;
  return {
    transcript_count: v.transcript_count || 0,
    language: v.language || "",
    language_label: v.language_label || "",
    confidence: v.confidence || "thin",
    built_at: v.built_at,
  };
}

export default router;

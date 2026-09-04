/**
 * voices.js — the creator's voice sets.
 *
 * A voice set is a named container: its own videos, its own learned style, its
 * own name. One person can run a Hindi tech channel and an English one, and
 * blending both into a single profile produces a voice that is nobody's.
 *
 * ── THE NAME IS ASKED FOR AFTER THE ANALYSIS, NOT BEFORE ────────────────────
 * A set is created empty and unnamed. Nothing worth naming exists until the
 * analysis succeeds — before that it is a pile of links, and asking someone to
 * name a pile of links is asking them to predict what we will find in it. Once
 * it is built the name becomes load-bearing, because it is what they pick from
 * a dropdown at the moment they spend credits, so `needs_name` is reported and
 * the client blocks on it.
 *
 * Everything here is scoped to req.user.id. A voice id alone is never enough to
 * read, rename or delete a set.
 */
import express from "express";
import mongoose from "mongoose";
import Transcript from "../models/Transcript.js";
import Script from "../models/Script.js";
import authenticateToken from "../middleware/authenticateToken.js";
import {
  listVoices, ensureVoice, resolveVoice, createVoice, renameVoice,
  setDefaultVoice, deleteVoice, buildVoiceProfile, shapeVoice, MAX_VOICES,
} from "../services/voiceProfileService.js";

const router = express.Router();

/**
 * GET /voices — every set this creator has, with the counts each screen needs.
 *
 * ensureVoice() runs first so a brand new account, and an account that predates
 * voice sets, both come back with something to select rather than an empty
 * dropdown and a dead end.
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    await ensureVoice(req.user.id);
    const voices = await listVoices(req.user.id);
    return res.json({
      success: true,
      voices,
      max: MAX_VOICES,
      active: voices.find((v) => v.is_default)?.id || voices[0]?.id || null,
    });
  } catch (err) {
    console.error("[voices] list failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't load your voices." });
  }
});

/** POST /voices  { name? } — a new, empty set. */
router.post("/", authenticateToken, async (req, res) => {
  try {
    const doc = await createVoice(req.user.id, req.body?.name);
    const voices = await listVoices(req.user.id);
    return res.status(201).json({
      success: true,
      voice: voices.find((v) => v.id === String(doc._id)) || shapeVoice(doc.toObject()),
      voices,
    });
  } catch (err) {
    if (err.limit_reached) {
      return res.status(400).json({ success: false, limit_reached: true, message: err.message });
    }
    console.error("[voices] create failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't create that voice." });
  }
});

/**
 * PATCH /voices/:id  { name?, is_default? }
 * Rename, or make this the one the app opens on.
 */
router.patch("/:id", authenticateToken, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid id" });
  }
  try {
    if (typeof req.body?.name === "string") {
      const name = req.body.name.trim();
      if (!name) return res.status(400).json({ success: false, message: "Give this voice a name." });
      const doc = await renameVoice(req.user.id, req.params.id, name);
      if (!doc) return res.status(404).json({ success: false, message: "Not found" });
    }

    if (req.body?.is_default === true) {
      const doc = await setDefaultVoice(req.user.id, req.params.id);
      if (!doc) return res.status(404).json({ success: false, message: "Not found" });
    }

    const voices = await listVoices(req.user.id);
    return res.json({ success: true, voices, voice: voices.find((v) => v.id === req.params.id) || null });
  } catch (err) {
    console.error("[voices] patch failed:", err);
    return res.status(500).json({ success: false, message: err.message || "Couldn't update that voice." });
  }
});

/**
 * DELETE /voices/:id — the set and the videos that taught it.
 *
 * Scripts written in it are kept and detached: they carry a copied voice_name,
 * so a creator tidying up their voices never loses writing they paid for.
 */
router.delete("/:id", authenticateToken, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid id" });
  }
  try {
    const doc = await deleteVoice(req.user.id, req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Not found" });
    const voices = await listVoices(req.user.id);
    return res.json({ success: true, deleted: String(doc._id), voices });
  } catch (err) {
    if (err.last_one) {
      return res.status(400).json({ success: false, last_one: true, message: err.message });
    }
    console.error("[voices] delete failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't delete that voice." });
  }
});

/**
 * POST /voices/:id/analyse — learn this set's style from its videos.
 *
 * Held open rather than polled, unlike transcription: this is one text-in
 * text-out call over at most ~18k characters, which lands in a few seconds.
 */
router.post("/:id/analyse", authenticateToken, async (req, res) => {
  try {
    const { voice } = await resolveVoice(req.user.id, req.params.id);
    const { profile, built, reason } = await buildVoiceProfile(req.user.id, voice._id);

    if (!built) {
      return res.status(400).json({
        success: false,
        message:
          reason === "no_transcripts"
            ? "Add at least one video to this voice first — that's what it's learned from."
            : "Couldn't build this voice.",
      });
    }

    const voices = await listVoices(req.user.id);
    return res.json({
      success: true,
      voices,
      voice: voices.find((v) => v.id === String(voice._id)) || null,
      // The full analysis, for the "here's what we learned" panel. Only ever
      // returned from the call that produced it — the list endpoint stays small.
      profile: shapeProfile(profile),
    });
  } catch (err) {
    console.error("[voices] analyse failed:", err);
    return res.status(500).json({ success: false, message: err.message || "Couldn't analyse this voice." });
  }
});

/** GET /voices/:id/videos — the videos in one set, newest first. */
router.get("/:id/videos", authenticateToken, async (req, res) => {
  try {
    const { voice } = await resolveVoice(req.user.id, req.params.id);
    const docs = await Transcript.find({ user: req.user.id, voice: voice._id })
      .sort({ created_at: -1 })
      .limit(50)
      .lean();
    return res.json({ success: true, voice_id: String(voice._id), transcripts: docs.map((d) => ({
      id: String(d._id), title: d.title || "", url: d.url, status: d.status,
      language_label: d.language_label || "", duration_seconds: d.duration_seconds ?? null,
    })) });
  } catch (err) {
    console.error("[voices] videos failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't load those videos." });
  }
});

/** What one script counts for. Used by the delete confirmation. */
router.get("/:id/usage", authenticateToken, async (req, res) => {
  try {
    const { voice } = await resolveVoice(req.user.id, req.params.id);
    const [videos, scripts] = await Promise.all([
      Transcript.countDocuments({ user: req.user.id, voice: voice._id }),
      Script.countDocuments({ user: req.user.id, voice: voice._id }),
    ]);
    return res.json({ success: true, videos, scripts });
  } catch (err) {
    console.error("[voices] usage failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't read that voice." });
  }
});

/** The learned detail, for the panel that shows what an analysis found. */
function shapeProfile(p) {
  if (!p) return null;
  return {
    id: String(p._id),
    name: p.name || "",
    transcript_count: p.transcript_count || 0,
    language: p.language || "",
    language_label: p.language_label || "",
    confidence: p.confidence || "thin",
    opening_patterns: p.opening_patterns || [],
    sample_openings: p.sample_openings || [],
    closing_patterns: p.closing_patterns || [],
    sample_closings: p.sample_closings || [],
    signature_phrases: p.signature_phrases || [],
    recurring_moves: p.recurring_moves || [],
    narration_arc: p.narration_arc || "",
    vocabulary_notes: p.vocabulary_notes || "",
    sentiment: p.sentiment || "",
    pacing: p.pacing || "",
    audience: p.audience || "",
    topics: p.topics || [],
    avoid: p.avoid || [],
    built_at: p.built_at,
  };
}

export default router;

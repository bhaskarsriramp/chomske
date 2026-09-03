/**
 * script.js — generate a script for a story, and read the voice profile behind it.
 *
 * Async and polled, same shape as /transcribe and for the same reason: writing a
 * full script (plus a profile rebuild on the first run) outlives what a proxy will
 * hold open, and a timeout on work that actually succeeded is the worst failure
 * mode to debug.
 */
import express from "express";
import mongoose from "mongoose";
import NewsItem from "../models/NewsItem.js";
import Script from "../models/Script.js";
import authenticateToken from "../middleware/authenticateToken.js";
import { writeScript } from "../services/scriptWriterService.js";
import { buildVoiceProfile, getUsableProfile, profileStatus } from "../services/voiceProfileService.js";

const router = express.Router();

// Writing is cheap next to reading video, but it is not free and it is the
// endpoint someone would hammer. Kept separate from the transcribe cap because
// the two cost wildly different amounts.
const DAILY_SCRIPT_LIMIT = parseInt(process.env.DAILY_SCRIPT_LIMIT || "30", 10);

/** GET /script/voice — what we know about how this user talks. */
router.get("/voice", authenticateToken, async (req, res) => {
  try {
    const { profile, transcripts_available, stale } = await profileStatus(req.user.id);
    return res.json({
      success: true,
      transcripts_available,
      stale,
      profile: profile ? shapeProfile(profile) : null,
    });
  } catch (err) {
    console.error("[script] GET /voice failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't load your voice profile." });
  }
});

/** POST /script/voice/rebuild — re-learn from the latest transcripts. */
router.post("/voice/rebuild", authenticateToken, async (req, res) => {
  try {
    const { profile, built, reason } = await buildVoiceProfile(req.user.id);
    if (!built) {
      return res.status(400).json({
        success: false,
        message:
          reason === "no_transcripts"
            ? "Transcribe at least one video first — that's what your voice is learned from."
            : "Couldn't build a voice profile.",
      });
    }
    return res.json({ success: true, profile: shapeProfile(profile) });
  } catch (err) {
    console.error("[script] rebuild failed:", err);
    return res.status(500).json({ success: false, message: err.message || "Couldn't rebuild your voice profile." });
  }
});

/** POST /script  { news_id, force? } */
router.post("/", authenticateToken, async (req, res) => {
  try {
    const newsId = String(req.body?.news_id || "");
    if (!mongoose.Types.ObjectId.isValid(newsId)) {
      return res.status(400).json({ success: false, message: "Invalid story id" });
    }

    const item = await NewsItem.findById(newsId).lean();
    if (!item) return res.status(404).json({ success: false, message: "Story not found" });

    const userId = req.user.id;

    // Already written it? Hand it back rather than billing for the same story
    // twice — regenerating has to be an explicit choice.
    if (!req.body?.force) {
      const existing = await Script.findOne({ user: userId, news_item: item._id, status: { $ne: "failed" } })
        .sort({ created_at: -1 })
        .lean();
      if (existing) return res.json({ success: true, cached: true, script: shape(existing) });
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const usedToday = await Script.countDocuments({
      user: userId,
      created_at: { $gte: since },
      status: { $in: ["processing", "done"] },
    });
    if (usedToday >= DAILY_SCRIPT_LIMIT) {
      return res.status(429).json({
        success: false,
        limit_reached: true,
        message: `You've generated ${DAILY_SCRIPT_LIMIT} scripts today. The limit resets 24 hours after each one.`,
      });
    }

    // Fail before creating a row if there is nothing to write in the voice of —
    // a "processing" script that can never succeed is a worse experience than a
    // clear message here.
    const profile = await getUsableProfile(userId, { autoBuild: false });
    const hasTranscripts = (await profileStatus(userId)).transcripts_available > 0;
    if (!profile && !hasTranscripts) {
      return res.status(400).json({
        success: false,
        needs_transcript: true,
        message: "Transcribe one of your videos first — that's how we learn your voice.",
      });
    }

    const doc = await Script.create({
      user: userId,
      news_item: item._id,
      story: item.cluster_id || "",
      headline: item.title,
      angle: item.ai_angle || "",
      status: "processing",
    });

    // Fire and forget; the client polls.
    runScript(doc._id, userId, item).catch((err) =>
      console.error(`[script] unhandled failure for ${doc._id}:`, err)
    );

    return res.status(202).json({ success: true, cached: false, script: shape(doc) });
  } catch (err) {
    console.error("[script] POST failed:", err);
    return res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
  }
});

/** GET /script/:id — poll target. */
router.get("/:id", authenticateToken, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid id" });
  }
  // Scoped to the caller: an id alone must never read someone else's script.
  const doc = await Script.findOne({ _id: req.params.id, user: req.user.id }).lean();
  if (!doc) return res.status(404).json({ success: false, message: "Not found" });
  return res.json({ success: true, script: shape(doc) });
});

/** The work, off the request path. Never throws to the caller. */
async function runScript(id, userId, item) {
  const started = Date.now();
  try {
    // Built here rather than in the route so the first-ever script absorbs the
    // profile build without the request waiting on both.
    const profile = await getUsableProfile(userId, { autoBuild: true });
    if (!profile) throw Object.assign(new Error("no profile"), {
      userMessage: "Transcribe one of your videos first — that's how we learn your voice.",
    });

    const out = await writeScript({ profile, item });

    await Script.updateOne(
      { _id: id },
      {
        $set: {
          status: "done",
          text: out.text,
          hook: out.hook,
          title_suggestions: out.title_suggestions,
          language: out.language,
          language_label: out.language_label,
          voice_confidence: profile.confidence || "",
          sources_used: out.sources_used,
          usage: out.usage || {},
          ms_taken: Date.now() - started,
          updated_at: new Date(),
        },
      }
    );

    const u = out.usage || {};
    console.log(
      `[script] ${id} done in ${((Date.now() - started) / 1000).toFixed(1)}s · ` +
      `${out.text.length} chars · ${out.language_label || "?"} · ` +
      `voice:${profile.confidence} · $${(u.usd || 0).toFixed(4)}`
    );
  } catch (err) {
    await Script.updateOne(
      { _id: id },
      {
        $set: {
          status: "failed",
          error: err.userMessage || "We couldn't write this script.",
          ms_taken: Date.now() - started,
          updated_at: new Date(),
        },
      }
    ).catch(() => {});
    console.error(`[script] ${id} failed: ${err.message}`);
  }
}

function shape(d) {
  return {
    id: String(d._id),
    news_item: d.news_item ? String(d.news_item) : null,
    headline: d.headline || "",
    angle: d.angle || "",
    status: d.status,
    text: d.text || "",
    hook: d.hook || "",
    title_suggestions: d.title_suggestions || [],
    language: d.language || "",
    language_label: d.language_label || "",
    voice_confidence: d.voice_confidence || "",
    sources_used: d.sources_used || [],
    error: d.error || "",
    created_at: d.created_at,
  };
}

function shapeProfile(p) {
  return {
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

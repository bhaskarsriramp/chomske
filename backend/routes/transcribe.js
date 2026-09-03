/**
 * transcribe.js — paste a YouTube link, get back what was said.
 *
 * ── WHY THIS IS ASYNC RATHER THAN ONE REQUEST ────────────────────────────────
 * Reading a video takes anywhere from ~20 seconds to several minutes. Holding an
 * HTTP request open that long loses to proxy and load-balancer idle timeouts
 * (Cloud Run, nginx and friends all cut long-idle connections), and the user sees
 * a network error on work that actually succeeded. So POST creates a row and
 * returns immediately; the client polls GET until it leaves "processing".
 *
 * The unique index on (user, video_id) is what makes this safe against a
 * double-click: the second insert loses, and we hand back the row that won
 * instead of paying to read the same video twice.
 */
import express from "express";
import mongoose from "mongoose";
import Transcript from "../models/Transcript.js";
import { parseYouTubeUrl } from "../utils/youtube.js";
import { transcribeYouTube } from "../services/geminiClient.js";
import authenticateToken from "../middleware/authenticateToken.js";

const router = express.Router();
const DAILY_LIMIT = parseInt(process.env.DAILY_TRANSCRIBE_LIMIT || "10", 10);

/** POST /transcribe  { url } */
router.post("/", authenticateToken, async (req, res) => {
  try {
    const parsed = parseYouTubeUrl(req.body?.url);
    if (!parsed) {
      return res.status(400).json({
        success: false,
        message: "That doesn't look like a YouTube link. Paste a normal video, Shorts or youtu.be URL.",
      });
    }

    const userId = req.user.id;

    // Already have it? Return the cached row — free, instant, and the reason a
    // second look at yesterday's video costs nothing.
    const existing = await Transcript.findOne({ user: userId, video_id: parsed.videoId }).lean();
    if (existing && existing.status !== "failed") {
      return res.json({ success: true, cached: true, transcript: shape(existing) });
    }

    // Spend cap. Counts only rows we actually started today, so cache hits and
    // failures don't burn the allowance.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const usedToday = await Transcript.countDocuments({
      user: userId,
      created_at: { $gte: since },
      status: { $in: ["processing", "done"] },
    });
    if (usedToday >= DAILY_LIMIT) {
      return res.status(429).json({
        success: false,
        limit_reached: true,
        message: `You've used all ${DAILY_LIMIT} videos for today. The limit resets 24 hours after each one.`,
      });
    }

    // A previous attempt failed — reuse the row rather than fighting the unique index.
    let doc;
    if (existing) {
      doc = await Transcript.findOneAndUpdate(
        { _id: existing._id },
        { $set: { status: "processing", error: "", text: "", created_at: new Date(), updated_at: new Date() } },
        { new: true }
      );
    } else {
      try {
        doc = await Transcript.create({
          user: userId,
          video_id: parsed.videoId,
          url: parsed.url,
          status: "processing",
        });
      } catch (err) {
        // 11000 = the double-click lost the race. The winner is already running,
        // so return that instead of starting a second (billed) read.
        if (err?.code === 11000) {
          const winner = await Transcript.findOne({ user: userId, video_id: parsed.videoId }).lean();
          if (winner) return res.json({ success: true, cached: true, transcript: shape(winner) });
        }
        throw err;
      }
    }

    // Fire and forget. The client polls; nothing awaits this.
    runTranscription(doc._id, parsed.url).catch((err) =>
      console.error(`[transcribe] unhandled failure for ${doc._id}:`, err)
    );

    return res.status(202).json({ success: true, cached: false, transcript: shape(doc) });
  } catch (err) {
    console.error("[transcribe] POST failed:", err);
    return res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
  }
});

/** GET /transcribe/:id — poll target. */
router.get("/:id", authenticateToken, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid id" });
  }
  // Scoped to the caller — an id alone must never be enough to read someone
  // else's transcript.
  const doc = await Transcript.findOne({ _id: req.params.id, user: req.user.id }).lean();
  if (!doc) return res.status(404).json({ success: false, message: "Not found" });
  return res.json({ success: true, transcript: shape(doc) });
});

/** GET /transcribe — this user's history, newest first. */
router.get("/", authenticateToken, async (req, res) => {
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const docs = await Transcript.find({ user: req.user.id })
    .sort({ created_at: -1 })
    .limit(limit)
    .lean();

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const usedToday = await Transcript.countDocuments({
    user: req.user.id,
    created_at: { $gte: since },
    status: { $in: ["processing", "done"] },
  });

  return res.json({
    success: true,
    transcripts: docs.map(shape),
    quota: { used: usedToday, limit: DAILY_LIMIT, left: Math.max(0, DAILY_LIMIT - usedToday) },
  });
});

/** The actual work, off the request path. Never throws to the caller. */
async function runTranscription(id, url) {
  const started = Date.now();
  try {
    const out = await transcribeYouTube(url);
    await Transcript.updateOne(
      { _id: id },
      {
        $set: {
          status: "done",
          text: out.text,
          language: out.language,
          language_label: out.language_label,
          title: out.title,
          usage: out.usage || {},
          ms_taken: Date.now() - started,
          updated_at: new Date(),
        },
      }
    );
    const u = out.usage || {};
    console.log(
      `[transcribe] ${id} done in ${((Date.now() - started) / 1000).toFixed(1)}s · ` +
      `${out.text.length} chars · ${out.language_label || out.language || "?"} · ` +
      `${u.total_tokens || 0} tokens · $${(u.usd || 0).toFixed(4)}`
    );
  } catch (err) {
    // userMessage is the version safe to show; err.message may carry internals.
    await Transcript.updateOne(
      { _id: id },
      {
        $set: {
          status: "failed",
          error: err.userMessage || "We couldn't read this video.",
          ms_taken: Date.now() - started,
          updated_at: new Date(),
        },
      }
    ).catch(() => {});
    console.error(`[transcribe] ${id} failed: ${err.message}`);
  }
}

function shape(d) {
  return {
    id: String(d._id),
    video_id: d.video_id,
    url: d.url,
    status: d.status,
    text: d.text || "",
    language: d.language || "",
    language_label: d.language_label || "",
    title: d.title || "",
    error: d.error || "",
    created_at: d.created_at,
  };
}

export default router;

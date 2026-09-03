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
import VoiceProfile from "../models/VoiceProfile.js";
import { parseYouTubeUrl } from "../utils/youtube.js";
import { transcribeYouTube } from "../services/geminiClient.js";
import { getYouTubeVideoDetails, isApidirectConfigured } from "../services/apidirectClient.js";
import authenticateToken from "../middleware/authenticateToken.js";

const router = express.Router();
const DAILY_LIMIT = parseInt(process.env.DAILY_TRANSCRIBE_LIMIT || "10", 10);

// How many videos define one voice. Five short-form videos is plenty of signal;
// past that the marginal gain is small and every extra one costs a transcription.
const MAX_VOICE_VIDEOS = parseInt(process.env.MAX_VOICE_VIDEOS || "5", 10);

// Short-form only. Voice profiling learns hooks and sign-offs, which are dense in
// a Short and diluted across twenty minutes of a long video — and a long video
// costs roughly 20× more to read for a weaker signal.
//
// NOTE: YouTube raised the Shorts ceiling to 180s in late 2024, so a creator's own
// Shorts may now exceed this. Raise MAX_VIDEO_SECONDS if their uploads get rejected.
const MAX_VIDEO_SECONDS = parseInt(process.env.MAX_VIDEO_SECONDS || "60", 10);

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

    // Five videos define the voice. Enforced before anything is spent.
    const held = await Transcript.countDocuments({ user: userId, status: { $ne: "failed" } });
    if (held >= MAX_VOICE_VIDEOS) {
      return res.status(400).json({
        success: false,
        limit_reached: true,
        message: `You can keep ${MAX_VOICE_VIDEOS} videos. Delete one to add another.`,
      });
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

    // ── Length gate, BEFORE paying Gemini to read it ────────────────────────
    // Reading video is this product's whole cost, and it scales with duration.
    // One $0.005 lookup here is the difference between rejecting a 40-minute
    // video and transcribing it first to discover it was too long.
    let meta = null;
    if (isApidirectConfigured()) {
      try {
        meta = await getYouTubeVideoDetails(parsed.url);
      } catch (err) {
        // Never block on the checker being down — a failed lookup falls through
        // to Gemini, which is the same behaviour as before this gate existed.
        console.warn(`[transcribe] duration lookup failed for ${parsed.videoId}: ${err.message}`);
      }

      if (meta?.is_live) {
        return res.status(400).json({
          success: false,
          message: "That's a live stream. Add a finished short video instead.",
        });
      }
      // null = unknown (live, or apidirect had no data). Only reject on a number
      // we actually have, so an unknown never silently blocks a valid Short.
      if (meta && typeof meta.duration === "number" && meta.duration > MAX_VIDEO_SECONDS) {
        return res.status(400).json({
          success: false,
          too_long: true,
          duration: meta.duration,
          message:
            `That video is ${formatDuration(meta.duration)} long. Voice profiling uses short-form ` +
            `videos only, up to ${MAX_VIDEO_SECONDS} seconds, because hooks and sign-offs are what ` +
            `we learn from and a long video buries them.`,
        });
      }
    }

    const videoMeta = {
      duration_seconds: meta && typeof meta.duration === "number" ? meta.duration : null,
      channel: meta?.author || "",
      thumbnail: meta?.thumbnail || "",
      ...(meta?.title ? { title: meta.title } : {}),
    };

    // A previous attempt failed — reuse the row rather than fighting the unique index.
    let doc;
    if (existing) {
      doc = await Transcript.findOneAndUpdate(
        { _id: existing._id },
        { $set: { status: "processing", error: "", text: "", created_at: new Date(), updated_at: new Date(), ...videoMeta } },
        { new: true }
      );
    } else {
      try {
        doc = await Transcript.create({
          user: userId,
          video_id: parsed.videoId,
          url: parsed.url,
          status: "processing",
          ...videoMeta,
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

/** GET /transcribe — this user's videos, newest first. */
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

  const held = docs.filter((d) => d.status !== "failed").length;
  const ready = docs.filter((d) => d.status === "done" && d.text);

  // A voice is one person. Videos in two different languages produce a blended
  // profile that is nobody's — the reason a Telugu Short and a Hindi Short in the
  // same list yielded "Telugu-English and Hinglish" as a single voice. Surfaced
  // rather than silently blocked, because a genuinely bilingual creator exists.
  const languages = [...new Set(ready.map((d) => d.language_label).filter(Boolean))];

  return res.json({
    success: true,
    transcripts: docs.map(shape),
    slots: { used: held, max: MAX_VOICE_VIDEOS, left: Math.max(0, MAX_VOICE_VIDEOS - held) },
    ready_count: ready.length,
    mixed_languages: languages.length > 1 ? languages : null,
    max_seconds: MAX_VIDEO_SECONDS,
    quota: { used: usedToday, limit: DAILY_LIMIT, left: Math.max(0, DAILY_LIMIT - usedToday) },
  });
});

/**
 * DELETE /transcribe/:id — drop one video from the voice set.
 *
 * The stored VoiceProfile is left alone but marked behind by its own count check
 * (services/voiceProfileService.js), so the next analysis re-learns from what
 * remains. Deleting the profile here would leave a user who removes one video
 * unable to generate anything until they re-analyse.
 */
router.delete("/:id", authenticateToken, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid id" });
  }
  // Scoped to the caller — an id alone must never delete someone else's row.
  const doc = await Transcript.findOneAndDelete({ _id: req.params.id, user: req.user.id });
  if (!doc) return res.status(404).json({ success: false, message: "Not found" });

  // Drop it from the profile's provenance so the "is my profile stale" check
  // notices, without destroying a profile the user still needs to write with.
  await VoiceProfile.updateOne(
    { user: req.user.id },
    { $pull: { built_from: doc._id } }
  ).catch(() => {});

  const left = await Transcript.countDocuments({ user: req.user.id, status: { $ne: "failed" } });
  return res.json({ success: true, deleted: String(doc._id), slots_left: Math.max(0, MAX_VOICE_VIDEOS - left) });
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

function formatDuration(s) {
  const n = Math.round(Number(s) || 0);
  if (n < 60) return `${n} seconds`;
  const m = Math.floor(n / 60);
  const rem = n % 60;
  return rem ? `${m}m ${rem}s` : `${m} minutes`;
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
    channel: d.channel || "",
    thumbnail: d.thumbnail || "",
    duration_seconds: d.duration_seconds ?? null,
    error: d.error || "",
    created_at: d.created_at,
  };
}

export default router;

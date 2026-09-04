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
import { resolveVoice, listVoices } from "../services/voiceProfileService.js";
import authenticateToken from "../middleware/authenticateToken.js";

const router = express.Router();
const DAILY_LIMIT = parseInt(process.env.DAILY_TRANSCRIBE_LIMIT || "10", 10);

// How many videos define one voice. Five short-form videos is plenty of signal;
// past that the marginal gain is small and every extra one costs a transcription.
//
// Counted PER VOICE SET, not per account: a creator with a Hindi channel and an
// English one needs five of each, and the total is bounded instead by
// MAX_VOICE_PROFILES and by the daily cap below.
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

    // Which voice this video teaches. An unknown or missing id lands on the
    // user's default set rather than failing — see resolveVoice().
    const { voice } = await resolveVoice(userId, req.body?.voice);

    // Already have it? Return the cached row — free, instant, and the reason a
    // second look at yesterday's video costs nothing.
    const existing = await Transcript.findOne({ user: userId, video_id: parsed.videoId }).lean();
    if (existing && existing.status !== "failed") {
      // It may belong to a DIFFERENT voice set. Adding it here would mean
      // transcribing and paying for text we already hold, so it is refused —
      // but named, because "you already added this" while looking at an empty
      // list is the kind of message that reads as a bug.
      if (String(existing.voice || "") !== String(voice._id)) {
        const other = (await listVoices(userId)).find((v) => v.id === String(existing.voice));
        return res.status(400).json({
          success: false,
          duplicate_in_other_voice: true,
          message: other
            ? `That video is already in “${other.name || "your other voice"}”. A video belongs to one voice at a time.`
            : "You've already added that video to another voice.",
        });
      }
      return res.json({ success: true, cached: true, transcript: shape(existing) });
    }

    // Five videos define one voice. Enforced before anything is spent.
    const held = await Transcript.countDocuments({
      user: userId, voice: voice._id, status: { $ne: "failed" },
    });
    if (held >= MAX_VOICE_VIDEOS) {
      return res.status(400).json({
        success: false,
        limit_reached: true,
        message: `This voice holds ${MAX_VOICE_VIDEOS} videos. Delete one, or add another voice.`,
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
    // video and transcribing it first to discover it was too long. Gemini is
    // never asked how long something is — that would be paying the expensive
    // model to answer a question the cheap endpoint already answers.
    let meta = null;
    let lookupError = null;
    if (isApidirectConfigured()) {
      try {
        meta = await getYouTubeVideoDetails(parsed.url);
      } catch (err) {
        lookupError = err;
        console.warn(`[transcribe] duration lookup failed for ${parsed.videoId}: ${err.message}`);
      }
    }

    if (meta?.is_live) {
      return res.status(400).json({
        success: false,
        message: "That's a live stream. Add a finished short video instead.",
      });
    }

    // ── THIS GATE FAILS CLOSED ──────────────────────────────────────────────
    // It used to fall through to Gemini whenever the lookup was unavailable —
    // no key configured, key out of credit, endpoint down, video not found — on
    // the reasoning that an unknown length should not block a valid Short. That
    // is the wrong way round for the one check standing between an arbitrary
    // URL and the most expensive call this product makes. "Unknown" is exactly
    // the state an abusive or accidental 40-minute upload arrives in, and the
    // failure is silent: nobody discovers it until the bill.
    //
    // So a length we cannot verify is not eligible. The message says which of
    // the two situations it is, because "try again in a minute" and "your key
    // is out of credit" need different actions from whoever reads it.
    const duration = typeof meta?.duration === "number" ? meta.duration : null;
    if (duration === null) {
      const exhausted = lookupError?.keyExhausted === true;
      console.warn(
        `[transcribe] REFUSED ${parsed.videoId}: length unverifiable ` +
        `(${!isApidirectConfigured() ? "no apidirect key" : exhausted ? "key exhausted" : "lookup failed"})`
      );
      return res.status(503).json({
        success: false,
        length_unknown: true,
        message: exhausted || !isApidirectConfigured()
          ? "We can't check video lengths right now, so new videos are paused. Please try again later."
          : "We couldn't read that video's details. Check the link is a public YouTube video and try again.",
      });
    }

    if (duration > MAX_VIDEO_SECONDS) {
      return res.status(400).json({
        success: false,
        too_long: true,
        duration,
        message:
          `That video is ${formatDuration(duration)} long. Voice profiling uses short-form ` +
          `videos only, up to ${MAX_VIDEO_SECONDS} seconds, because hooks and sign-offs are what ` +
          `we learn from and a long video buries them.`,
      });
    }

    // Everything the one paid lookup returned, kept. It has already been bought.
    const videoMeta = {
      duration_seconds: duration,
      channel: meta.author || "",
      channel_id: meta.channel_id || "",
      thumbnail: meta.thumbnail || "",
      description: String(meta.description || "").slice(0, 5000),
      views: Number.isFinite(meta.views) ? meta.views : null,
      category: meta.category || "",
      keywords: meta.keywords || [],
      // "2009-10-25 06:57:33" is UTC without a marker — left alone it would be
      // read in the server's local zone and land 5.5 hours out on an IST box.
      // An unparseable value becomes null rather than an Invalid Date, which
      // Mongoose would reject and take the whole insert down with it.
      published_at: parsePublished(meta.date),
      ...(meta.title ? { title: meta.title } : {}),
    };

    // A previous attempt failed — reuse the row rather than fighting the unique index.
    let doc;
    if (existing) {
      doc = await Transcript.findOneAndUpdate(
        { _id: existing._id },
        {
          $set: {
            status: "processing", error: "", text: "",
            // A failed row is being retried; it moves to whichever set the
            // creator is looking at now, which may not be where it first landed.
            voice: voice._id,
            created_at: new Date(), updated_at: new Date(), ...videoMeta,
          },
        },
        { new: true }
      );
    } else {
      try {
        doc = await Transcript.create({
          user: userId,
          voice: voice._id,
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

/** GET /transcribe?voice=… — the videos in one voice set, newest first. */
router.get("/", authenticateToken, async (req, res) => {
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));

  const { voice } = await resolveVoice(req.user.id, req.query.voice);

  const docs = await Transcript.find({ user: req.user.id, voice: voice._id })
    .sort({ created_at: -1 })
    .limit(limit)
    .lean();

  // The daily cap stays per ACCOUNT, across every voice. It is a spend control —
  // reading video is the whole cost of this product — and making it per-set
  // would multiply the ceiling by however many sets someone chose to create.
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
    voice_id: String(voice._id),
    voice_name: voice.name || "",
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

  // Drop it from its own set's provenance so the "is this voice stale" check
  // notices, without destroying a profile the user still needs to write with.
  await VoiceProfile.updateOne(
    { _id: doc.voice, user: req.user.id },
    { $pull: { built_from: doc._id } }
  ).catch(() => {});

  const left = await Transcript.countDocuments({
    user: req.user.id, voice: doc.voice, status: { $ne: "failed" },
  });
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

/**
 * apidirect's publish date: "2009-10-25 06:57:33", UTC with no zone marker.
 * Returns null rather than an Invalid Date, which Mongoose refuses to cast.
 */
function parsePublished(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  const iso = /[TZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s.replace(" ", "T")}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
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

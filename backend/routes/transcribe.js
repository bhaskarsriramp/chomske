/**
 * transcribe.js: the videos a channel's voice is learned from.
 *
 * ── ADDING A VIDEO NO LONGER READS IT ────────────────────────────────────────
 * This used to transcribe on add. Paste a link, Gemini reads the video, done.
 * It was simple and it billed for work nobody had asked for: a creator pasting
 * five links to see what happens, changing their mind, and deleting them, had
 * already spent five video reads. The expensive call was triggered by an action
 * that costs nothing to take back.
 *
 * So adding a video now buys only the cheap metadata lookup (title, length,
 * thumbnail, about half a cent) and stores the row as "pending". Gemini is not
 * called at all. Every pending video for a channel is read in one go when the
 * creator presses Analyse my voice, which is the moment they have actually
 * asked for something, see services/voiceProfileService.js.
 *
 * The length gate still runs here rather than at analysis time. It is the whole
 * reason the metadata lookup is bought, and refusing a 40-minute video at the
 * moment it is pasted is a far better experience than accepting it and failing
 * later.
 *
 * The unique index on (user, video_id) is what makes this safe against a
 * double-click: the second insert loses, and we hand back the row that won.
 */
import express from "express";
import mongoose from "mongoose";
import Transcript from "../models/Transcript.js";
import VoiceProfile from "../models/VoiceProfile.js";
import { parseYouTubeUrl } from "../utils/youtube.js";
import { getYouTubeVideoDetails, isApidirectConfigured } from "../services/apidirectClient.js";
import { resolveProfile, listProfiles, voiceFor } from "../services/profileService.js";
import authenticateToken from "../middleware/authenticateToken.js";

const router = express.Router();
const DAILY_LIMIT = parseInt(process.env.DAILY_TRANSCRIBE_LIMIT || "10", 10);

// How many videos define one voice. Five short-form videos is plenty of signal;
// past that the marginal gain is small and every extra one costs a transcription.
//
// Counted PER PROFILE, not per account: a creator running a Hindi tech channel
// and an English one needs five for each, and the total is bounded instead by
// MAX_PROFILES and by the daily cap below.
const MAX_VOICE_VIDEOS = parseInt(process.env.MAX_VOICE_VIDEOS || "5", 10);

// ── THE LENGTH GATE IS NOW TWO GATES ────────────────────────────────────────
// It used to be one ceiling: short-form only, nothing over 90 seconds, on the
// reasoning that hooks and sign-offs are dense in a Short and diluted across
// twenty minutes. That reasoning is still correct and it is still why the short
// lane exists. What it missed is that hooks and sign-offs are not the whole of
// a voice once a script runs past two minutes.
//
// Over two minutes these creators are not making a longer version of a Short.
// They are making a different thing: seven to fourteen products in sequence,
// where the skill that carries the video is the join between items. That move
// occurs zero times in a Short, so no amount of short-form training material
// can teach it. See services/voiceLanes.js.
//
// So a video is now sorted into a lane by its length, and the band between the
// two lanes is refused: too long to be a dense sample, too short to reliably
// contain a second story.
import {
  laneForVideo, laneQuery, laneStatus, SHORT, LONG,
  SHORT_MAX_SECONDS, LONG_MIN_SECONDS, LONG_MIN_VIDEOS, LANE_SPLIT_SECONDS,
} from "../services/voiceLanes.js";

// Kept as an alias so the /limits payload and any older client keep working.
const MAX_VIDEO_SECONDS = SHORT_MAX_SECONDS;

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

    // Which channel this video teaches. An unknown or missing id lands on the
    // user's default profile rather than failing, see resolveProfile().
    const { profile } = await resolveProfile(userId, req.body?.profile);

    // Already have it? Return the cached row, free, instant, and the reason a
    // second look at yesterday's video costs nothing.
    const existing = await Transcript.findOne({ user: userId, video_id: parsed.videoId }).lean();
    if (existing && existing.status !== "failed") {
      // It may belong to a DIFFERENT profile. Adding it here would mean
      // transcribing and paying for text we already hold, so it is refused,
      // but named, because "you already added this" while looking at an empty
      // list is the kind of message that reads as a bug.
      if (String(existing.profile || "") !== String(profile._id)) {
        const other = (await listProfiles(userId)).find((p) => p.id === String(existing.profile));
        return res.status(400).json({
          success: false,
          duplicate_in_other_profile: true,
          message: other
            ? `That video is already in “${other.name}”. A video belongs to one profile at a time.`
            : "You've already added that video to another profile.",
        });
      }
      return res.json({ success: true, cached: true, transcript: shape(existing) });
    }

    // ── The cheap guard, before the paid lookup ─────────────────────────────
    // Five per lane, so a profile trains both voices without either crowding
    // the other out. This early check is the TOTAL only: the lane a video
    // belongs to is not known until its duration has been looked up, and doing
    // that lookup for somebody who is already completely full would be paying
    // to say no. The per-lane limit is enforced below, once the lane is known.
    const held = await Transcript.countDocuments({
      user: userId, profile: profile._id, status: { $ne: "failed" },
    });
    if (held >= MAX_VOICE_VIDEOS * 2) {
      return res.status(400).json({
        success: false,
        limit_reached: true,
        message:
          `This profile holds ${MAX_VOICE_VIDEOS * 2} videos, ${MAX_VOICE_VIDEOS} short and ` +
          `${MAX_VOICE_VIDEOS} long. Delete one, or add another profile.`,
      });
    }

    // Spend cap. Counts only rows we actually started today, so cache hits and
    // failures don't burn the allowance.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const usedToday = await Transcript.countDocuments({
      user: userId,
      created_at: { $gte: since },
      status: { $in: ["pending", "processing", "done"] },
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
    // never asked how long something is, that would be paying the expensive
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
    // It used to fall through to Gemini whenever the lookup was unavailable,
    // no key configured, key out of credit, endpoint down, video not found, on
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

    // ── WHICH LANE DOES THIS VIDEO TRAIN ────────────────────────────────────
    // null is the band in the middle, 91 to 179 seconds, which trains neither.
    // Refusing it names both bands, because a creator who just had a 2:30 video
    // rejected needs to know which direction to go, and "too long" alone would
    // send them the wrong way.
    const lane = laneForVideo(duration);
    if (!lane) {
      return res.status(400).json({
        success: false,
        wrong_length: true,
        duration,
        message:
          `That video is ${formatDuration(duration)}, which falls between the two kinds we ` +
          `learn from. Add a short video (under ${SHORT_MAX_SECONDS} seconds) to teach us your ` +
          `hook and sign-off, or a full-length one (over ${Math.round(LONG_MIN_SECONDS / 60)} ` +
          `minutes) to teach us how you move between stories.`,
      });
    }

    // The per-lane cap, now that the lane is known. Named by lane, because
    // "this profile holds 5 videos" while their short list shows two is the
    // kind of message that reads as a bug rather than as a limit.
    const inLane = await Transcript.countDocuments({
      user: userId, profile: profile._id, status: { $ne: "failed" }, ...laneQuery(lane),
    });
    if (inLane >= MAX_VOICE_VIDEOS) {
      return res.status(400).json({
        success: false,
        limit_reached: true,
        lane,
        message:
          lane === SHORT
            ? `This profile already holds ${MAX_VOICE_VIDEOS} short videos. Delete one to add another.`
            : `This profile already holds ${MAX_VOICE_VIDEOS} long videos. Delete one to add another.`,
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
      // "2009-10-25 06:57:33" is UTC without a marker, left alone it would be
      // read in the server's local zone and land 5.5 hours out on an IST box.
      // An unparseable value becomes null rather than an Invalid Date, which
      // Mongoose would reject and take the whole insert down with it.
      published_at: parsePublished(meta.date),
      ...(meta.title ? { title: meta.title } : {}),
    };

    // A previous attempt failed, reuse the row rather than fighting the unique index.
    let doc;
    if (existing) {
      doc = await Transcript.findOneAndUpdate(
        { _id: existing._id },
        {
          $set: {
            status: "pending", error: "", text: "",
            // A failed row is being retried; it moves to whichever profile the
            // creator is looking at now, which may not be where it first landed.
            profile: profile._id,
            created_at: new Date(), updated_at: new Date(), ...videoMeta,
          },
        },
        { new: true }
      );
    } else {
      try {
        doc = await Transcript.create({
          user: userId,
          profile: profile._id,
          video_id: parsed.videoId,
          url: parsed.url,
          status: "pending",
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

    // Nothing is read here. The row waits until the creator asks for a voice.
    return res.json({ success: true, cached: false, transcript: shape(doc) });
  } catch (err) {
    console.error("[transcribe] POST failed:", err);
    return res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
  }
});

/** GET /transcribe/:id, poll target. */
router.get("/:id", authenticateToken, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid id" });
  }
  // Scoped to the caller, an id alone must never be enough to read someone
  // else's transcript.
  const doc = await Transcript.findOne({ _id: req.params.id, user: req.user.id }).lean();
  if (!doc) return res.status(404).json({ success: false, message: "Not found" });
  return res.json({ success: true, transcript: shape(doc) });
});

/** GET /transcribe?profile=…, the videos in one profile, newest first. */
router.get("/", authenticateToken, async (req, res) => {
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));

  const { profile } = await resolveProfile(req.user.id, req.query.profile);

  const docs = await Transcript.find({ user: req.user.id, profile: profile._id })
    .sort({ created_at: -1 })
    .limit(limit)
    .lean();

  // The daily cap stays per ACCOUNT, across every profile. It is a spend control
  // reading video is the whole cost of this product, and making it per-profile
  // would multiply the ceiling by however many channels someone chose to create.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const usedToday = await Transcript.countDocuments({
    user: req.user.id,
    created_at: { $gte: since },
    status: { $in: ["pending", "processing", "done"] },
  });

  const held = docs.filter((d) => d.status !== "failed").length;

  // ANALYSABLE, not already-read. A pending video has not cost anything yet and
  // has not been transcribed, but it is exactly what an analysis would consume,
  // so it is what the button should count. Counting only "done" here would have
  // told a creator who just added three videos that they had none.
  const ready = docs.filter((d) => d.status === "pending" || (d.status === "done" && d.text));

  // A voice is one person. Videos in two different languages produce a blended
  // profile that is nobody's, the reason a Telugu Short and a Hindi Short in the
  // same list yielded "Telugu-English and Hinglish" as a single voice. Surfaced
  // rather than silently blocked, because a genuinely bilingual creator exists.
  const languages = [...new Set(docs.map((d) => d.language_label).filter(Boolean))];

  // ── The two lanes, and what each still needs ────────────────────────────
  // Counted from what is actually on file rather than from a stored flag, so
  // deleting a long video immediately takes the long lane back below its
  // minimum instead of leaving a stale "ready" the ordering screen would then
  // honour and the writer would then refuse.
  const usable = docs.filter((d) => d.status !== "failed");
  const shortDocs = usable.filter((d) => laneForVideo(d.duration_seconds) === SHORT);
  const longDocs = usable.filter((d) => laneForVideo(d.duration_seconds) === LONG);

  const vp = await voiceFor(req.user.id, profile._id);
  const lanes = laneStatus(vp, { short: shortDocs.length, long: longDocs.length });

  // Per lane, because "analysable" means something different in each: the short
  // lane can build from one video, the long lane needs LONG_MIN_VIDEOS before
  // it has seen a habit rather than one episode's running order.
  const readyIn = (list) =>
    list.filter((d) => d.status === "pending" || (d.status === "done" && d.text)).length;

  return res.json({
    success: true,
    profile_id: String(profile._id),
    profile_name: profile.name || "",
    transcripts: docs.map(shape),
    // Kept for any client still reading it, now the SHORT lane's slots, which
    // is what it has always actually meant.
    slots: {
      used: shortDocs.length,
      max: MAX_VOICE_VIDEOS,
      left: Math.max(0, MAX_VOICE_VIDEOS - shortDocs.length),
    },
    lane_slots: {
      short: {
        used: shortDocs.length,
        max: MAX_VOICE_VIDEOS,
        left: Math.max(0, MAX_VOICE_VIDEOS - shortDocs.length),
        ready_count: readyIn(shortDocs),
      },
      long: {
        used: longDocs.length,
        max: MAX_VOICE_VIDEOS,
        left: Math.max(0, MAX_VOICE_VIDEOS - longDocs.length),
        ready_count: readyIn(longDocs),
        min_videos: LONG_MIN_VIDEOS,
      },
    },
    lanes,
    ready_count: ready.length,
    mixed_languages: languages.length > 1 ? languages : null,
    max_seconds: MAX_VIDEO_SECONDS,
    short_max_seconds: SHORT_MAX_SECONDS,
    long_min_seconds: LONG_MIN_SECONDS,
    lane_split_seconds: LANE_SPLIT_SECONDS,
    quota: { used: usedToday, limit: DAILY_LIMIT, left: Math.max(0, DAILY_LIMIT - usedToday) },
  });
});

/**
 * DELETE /transcribe/:id, drop one video from its profile.
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
  // Scoped to the caller, an id alone must never delete someone else's row.
  const doc = await Transcript.findOneAndDelete({ _id: req.params.id, user: req.user.id });
  if (!doc) return res.status(404).json({ success: false, message: "Not found" });

  // Drop it from its own profile's voice provenance so the "is this voice
  // stale" check notices, without destroying a voice the user still writes with.
  await VoiceProfile.updateOne(
    { profile: doc.profile, user: req.user.id },
    { $pull: { built_from: doc._id } }
  ).catch(() => {});

  const left = await Transcript.countDocuments({
    user: req.user.id, profile: doc.profile, status: { $ne: "failed" },
  });
  return res.json({ success: true, deleted: String(doc._id), slots_left: Math.max(0, MAX_VOICE_VIDEOS - left) });
});

/** The actual work, off the request path. Never throws to the caller. */
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
    lane: laneForVideo(d.duration_seconds),
    error: d.error || "",
    created_at: d.created_at,
  };
}

export default router;

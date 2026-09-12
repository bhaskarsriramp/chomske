/**
 * channel.js: find a creator's channel, and offer their recent short videos.
 *
 * ── WHAT THIS REPLACED ───────────────────────────────────────────────────────
 * Five trips to another tab. Building a voice meant finding five of your own
 * video URLs and pasting them one at a time, which is the most tedious thing in
 * the product and was the first thing it asked anybody to do. Now a creator
 * types their channel name, confirms it is them, and ticks videos off a list of
 * their own thumbnails.
 *
 * ── IT ADDS NOTHING TO THE ANALYSIS PATH ─────────────────────────────────────
 * Deliberately, and this matters more than anything else here. Nothing in this
 * file transcribes, charges, writes a Transcript or touches a VoiceProfile. It
 * answers two questions, "which channel" and "which of their videos could be
 * used", and then the browser posts the chosen urls to the EXISTING
 * POST /transcribe one at a time, exactly as if they had been pasted by hand.
 *
 * That is why the picker cannot produce a video the rest of the product would
 * refuse. Every guard on that endpoint, the lane test, the slot ceiling, the
 * daily cap, the duplicate index, the live-stream refusal, still runs, and none
 * of it was reimplemented here to be got subtly wrong. This screen is a better
 * way to fill in the same form.
 *
 * ── AND IT IS CLOSED TO SHOWCASE SESSIONS ────────────────────────────────────
 * authenticateToken, not authenticateAny. A showcase already has the voice an
 * admin built for it, and the one thing a showcase visitor must not be able to
 * do is spend somebody else's quota building another.
 */
import express from "express";
import Transcript from "../models/Transcript.js";
import authenticateToken from "../middleware/authenticateToken.js";
import { resolveProfile } from "../services/profileService.js";
import { resolveChannel, recentEligible, OFFER_COUNT } from "../services/youtubeChannelService.js";
import { isYouTubeDataConfigured } from "../services/youtubeDataClient.js";
import { SHORT_MAX_SECONDS, SHORT, laneForVideo } from "../services/voiceLanes.js";

const router = express.Router();

const MAX_VOICE_VIDEOS = parseInt(process.env.MAX_VOICE_VIDEOS || "5", 10);

/**
 * GET /channel/resolve?q=…
 *
 * One confident match, or a short list to choose from. See
 * services/youtubeChannelService.js for the ladder of exact lookups this tries
 * before it will spend a search.
 *
 * `match` is never to be auto-accepted by the client. It is a proposal for a
 * confirmation card, because two channels can share a title and picking the
 * wrong one costs five video reads and produces a stranger's voice.
 */
router.get("/resolve", authenticateToken, async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) {
    return res.status(400).json({ success: false, message: "Type a channel name, @handle or link." });
  }
  if (q.length > 200) {
    return res.status(400).json({ success: false, message: "That is too long to be a channel name." });
  }
  if (!isYouTubeDataConfigured()) {
    return res.status(503).json({
      success: false,
      message: "Channel lookup is unavailable right now. Paste video links instead.",
    });
  }

  try {
    const { match, candidates, searched, units } = await resolveChannel(q);
    console.log(
      `[channel] resolve "${q}" -> ${match ? match.handle || match.channel_id : `${candidates.length} candidates`} ` +
      `· ${units} units${searched ? " · SEARCHED" : ""}`
    );

    if (!match && candidates.length === 0) {
      return res.json({
        success: true,
        match: null,
        candidates: [],
        message:
          "We couldn't find that channel. Try your @handle, or paste a link to your channel or any of your videos.",
      });
    }

    return res.json({ success: true, match, candidates });
  } catch (err) {
    // keyExhausted covers a spent quota AND a misconfigured key, and both mean
    // the same thing to a creator: not your fault, not your link, try later.
    const exhausted = err?.keyExhausted === true;
    console.warn(`[channel] resolve failed for "${q}": ${err.message}`);
    return res.status(exhausted ? 503 : 502).json({
      success: false,
      message: exhausted
        ? "Channel lookup is paused right now. Paste video links instead."
        : "We couldn't search for that channel. Please try again.",
    });
  }
});

/**
 * GET /channel/videos?channel_id=…&profile=…
 *
 * The creator's most recent videos under the short lane's ceiling, with
 * everything the picker needs to be honest about what can still be added.
 *
 * ── WHY THE CEILING IS READ AND NOT WRITTEN DOWN ─────────────────────────────
 * SHORT_MAX_SECONDS, from services/voiceLanes.js, is the same constant
 * POST /transcribe tests against. Hardcoding three minutes here would mean the
 * picker and the endpoint could drift by a single second and start offering
 * videos that are then refused, and a creator who tick-boxed five videos and
 * got four has no way to know which one was the problem or why.
 */
router.get("/videos", authenticateToken, async (req, res) => {
  const channelId = String(req.query.channel_id || "").trim();
  if (!/^UC[\w-]{22}$/.test(channelId)) {
    return res.status(400).json({ success: false, message: "That isn't a channel id." });
  }
  if (!isYouTubeDataConfigured()) {
    return res.status(503).json({
      success: false,
      message: "Channel lookup is unavailable right now. Paste video links instead.",
    });
  }

  try {
    const profile = await resolveProfile(req.user.id, req.query.profile);
    if (!profile) {
      return res.status(404).json({ success: false, message: "That channel workspace is gone." });
    }

    const { videos, scanned, total, units } = await recentEligible(channelId, {
      maxSeconds: SHORT_MAX_SECONDS,
      want: OFFER_COUNT,
    });

    // ── What is already here, and how much room is left ────────────────────
    // Counted the same way GET /transcribe counts it: failed rows do not hold a
    // slot, and the ceiling is per lane. Anything already on file is returned
    // flagged rather than filtered out, because a creator who sees four of
    // their five recent videos and cannot tell why one is missing assumes the
    // list is broken.
    const held = await Transcript.find({ user: req.user.id, profile: profile._id })
      .select("video_id status duration_seconds")
      .lean();

    const mine = new Set(
      held.filter((t) => t.status !== "failed").map((t) => String(t.video_id))
    );
    const usedShortSlots = held.filter(
      (t) => t.status !== "failed" && laneForVideo(t.duration_seconds) === SHORT
    ).length;

    const slotsLeft = Math.max(0, MAX_VOICE_VIDEOS - usedShortSlots);

    console.log(
      `[channel] videos ${channelId} -> ${videos.length} eligible of ${scanned} scanned ` +
      `(${total} uploads) · ${units} units · ${slotsLeft} slots left`
    );

    return res.json({
      success: true,
      profile_id: String(profile._id),
      channel_id: channelId,
      videos: videos.map((v) => ({ ...v, already_added: mine.has(v.video_id) })),
      // So the picker can say "we looked through 150 of your 580 uploads" when
      // it comes back with three, instead of implying the channel has three.
      scanned,
      total_uploads: total,
      max_seconds: SHORT_MAX_SECONDS,
      slots: { used: usedShortSlots, max: MAX_VOICE_VIDEOS, left: slotsLeft },
    });
  } catch (err) {
    const exhausted = err?.keyExhausted === true;
    console.warn(`[channel] videos failed for ${channelId}: ${err.message}`);
    return res.status(exhausted ? 503 : 502).json({
      success: false,
      message: exhausted
        ? "We can't read your channel right now. Paste video links instead."
        : "We couldn't read that channel's videos. Please try again.",
    });
  }
});

export default router;

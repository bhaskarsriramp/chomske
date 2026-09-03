/**
 * stats.js — the Dashboard's numbers.
 *
 * Two counts a creator actually cares about: how many videos are teaching us
 * their voice, and how many scripts they've generated. Everything is scoped to
 * the caller and to a date range.
 *
 * ── WHY VIDEO COUNT IGNORES THE RANGE ────────────────────────────────────────
 * The voice set is a CURRENT state, not an activity total — there are five slots
 * and some number are filled right now. Filtering it by "last 7 days" would show
 * 0 for a user whose voice is working perfectly but who added their videos a
 * month ago, which reads as a broken product. Scripts are genuine activity, so
 * those do respect the range.
 */
import express from "express";
import mongoose from "mongoose";
import Transcript from "../models/Transcript.js";
import Script from "../models/Script.js";
import VoiceProfile from "../models/VoiceProfile.js";
import authenticateToken from "../middleware/authenticateToken.js";

const router = express.Router();
const MAX_VOICE_VIDEOS = parseInt(process.env.MAX_VOICE_VIDEOS || "5", 10);

/**
 * Resolve ?range=7d|28d|custom (+ ?from&?to) into real dates.
 * Bad input falls back to 7 days rather than erroring — a dashboard should
 * always render something.
 */
function resolveRange(q) {
  const range = String(q.range || "7d");

  if (range === "custom") {
    const from = new Date(q.from);
    const to = new Date(q.to);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from <= to) {
      // The `to` date is inclusive: a user picking 1st–7th means through the end
      // of the 7th, not midnight at its start.
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      return { from, to: end, label: "Custom", key: "custom" };
    }
  }

  const days = range === "28d" ? 28 : 7;
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (days - 1));
  return { from, to: new Date(), label: `Last ${days} days`, key: `${days}d` };
}

/** GET /stats/dashboard?range=7d|28d|custom&from=&to= */
router.get("/dashboard", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const range = resolveRange(req.query);
    const inRange = { $gte: range.from, $lte: range.to };

    const [videosHeld, videosReady, scriptsInRange, scriptsAll, profile, recentScripts] =
      await Promise.all([
        Transcript.countDocuments({ user: userId, status: { $ne: "failed" } }),
        Transcript.countDocuments({ user: userId, status: "done", text: { $ne: "" } }),
        Script.countDocuments({ user: userId, status: "done", created_at: inRange }),
        Script.countDocuments({ user: userId, status: "done" }),
        VoiceProfile.findOne({ user: userId }).lean(),
        Script.find({ user: userId, status: "done" })
          .sort({ created_at: -1 })
          .limit(8)
          .select("headline language_label created_at")
          .lean(),
      ]);

    // Daily buckets for the range, so the UI can draw activity rather than one
    // number. Built in Mongo because doing it in JS would pull every row back.
    const byDay = await Script.aggregate([
      // req.user.id is a string; $match needs a real ObjectId or it matches
      // nothing and the chart renders silently empty.
      { $match: { user: new mongoose.Types.ObjectId(userId), status: "done", created_at: inRange } },
      {
        $group: {
          // UTC day keys. Deliberately not toLocaleDateString: that only returns
          // ISO on a full-ICU Node build, and silently produces a different format
          // elsewhere — a bug this codebase's sibling project has already hit.
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$created_at", timezone: "UTC" } },
          n: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]).catch(() => []);

    return res.json({
      success: true,
      range: { key: range.key, label: range.label, from: range.from, to: range.to },
      videos: {
        used: videosHeld,
        ready: videosReady,
        max: MAX_VOICE_VIDEOS,
        left: Math.max(0, MAX_VOICE_VIDEOS - videosHeld),
      },
      scripts: { in_range: scriptsInRange, all_time: scriptsAll },
      voice: profile
        ? {
            confidence: profile.confidence || "thin",
            language_label: profile.language_label || "",
            transcript_count: profile.transcript_count || 0,
            built_at: profile.built_at,
            // The profile is behind if videos were added or removed since it ran.
            stale: (profile.transcript_count || 0) !== videosReady,
          }
        : null,
      by_day: byDay.map((d) => ({ day: d._id, count: d.n })),
      recent_scripts: recentScripts.map((s) => ({
        headline: s.headline || "",
        language_label: s.language_label || "",
        created_at: s.created_at,
      })),
    });
  } catch (err) {
    console.error("[stats] dashboard failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't load your dashboard." });
  }
});

export default router;

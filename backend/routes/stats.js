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
import User from "../models/User.js";
import VoiceProfile from "../models/VoiceProfile.js";
import { apidirectKeyHealth } from "../services/apidirectClient.js";
import authenticateToken from "../middleware/authenticateToken.js";

const router = express.Router();
const MAX_VOICE_VIDEOS = parseInt(process.env.MAX_VOICE_VIDEOS || "5", 10);

// Who may read operational state. Comma-separated addresses; empty means nobody,
// which is the right default for a public deployment — a signed-in stranger has
// no business knowing whether our news budget is spent, and "no addresses
// configured" must never quietly mean "everyone".
const ADMIN_EMAILS = new Set(
  String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

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

/**
 * GET /stats/dashboard?range=7d|28d|custom&from=&to=&voice=
 *
 * ?voice=<id> narrows every number to one voice set; omitted (or "all") reports
 * the whole account. A creator running two channels needs both views: "how is
 * the Hindi channel doing" and "how much have I made in total" are different
 * questions and the dashboard should answer whichever was asked.
 */
router.get("/dashboard", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const range = resolveRange(req.query);
    const inRange = { $gte: range.from, $lte: range.to };

    // Scope. An invalid id falls through to the whole account rather than
    // matching nothing and reporting a confident, wrong zero.
    const voiceParam = String(req.query.voice || "").trim();
    const voiceId =
      voiceParam && voiceParam !== "all" && mongoose.Types.ObjectId.isValid(voiceParam)
        ? new mongoose.Types.ObjectId(voiceParam)
        : null;
    const scope = voiceId ? { voice: voiceId } : {};

    const [videosHeld, videosReady, scriptsInRange, scriptsAll, profile, recentScripts] =
      await Promise.all([
        Transcript.countDocuments({ user: userId, ...scope, status: { $ne: "failed" } }),
        Transcript.countDocuments({ user: userId, ...scope, status: "done", text: { $ne: "" } }),
        Script.countDocuments({ user: userId, ...scope, status: "done", created_at: inRange }),
        Script.countDocuments({ user: userId, ...scope, status: "done" }),
        // With no voice selected this reports the DEFAULT set's profile, not a
        // blend of every set — there is no such thing as an average of two
        // voices, and inventing one would be the exact failure voice sets exist
        // to prevent.
        voiceId
          ? VoiceProfile.findOne({ _id: voiceId, user: userId }).lean()
          : VoiceProfile.findOne({ user: userId, is_default: true }).lean(),
        Script.find({ user: userId, ...scope, status: "done" })
          .sort({ created_at: -1 })
          .limit(8)
          .select("headline language_label voice_name created_at")
          .lean(),
      ]);

    // Daily buckets for the range, so the UI can draw activity rather than one
    // number. Built in Mongo because doing it in JS would pull every row back.
    const byDay = await Script.aggregate([
      // req.user.id is a string; $match needs a real ObjectId or it matches
      // nothing and the chart renders silently empty.
      { $match: { user: new mongoose.Types.ObjectId(userId), ...scope, status: "done", created_at: inRange } },
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
      voice_id: voiceId ? String(voiceId) : null,
      videos: {
        used: videosHeld,
        ready: videosReady,
        max: MAX_VOICE_VIDEOS,
        left: Math.max(0, MAX_VOICE_VIDEOS - videosHeld),
      },
      scripts: { in_range: scriptsInRange, all_time: scriptsAll },
      // built_at is what "analysed" means — the row exists from the moment the
      // set is created, so its presence alone says nothing.
      voice: profile?.built_at
        ? {
            id: String(profile._id),
            name: profile.name || "",
            confidence: profile.confidence || "thin",
            language_label: profile.language_label || "",
            transcript_count: profile.transcript_count || 0,
            built_at: profile.built_at,
            // The profile is behind if videos were added or removed since it
            // ran — only meaningful when the numbers describe the same set.
            stale: !!voiceId && (profile.transcript_count || 0) !== videosReady,
          }
        : null,
      by_day: byDay.map((d) => ({ day: d._id, count: d.n })),
      recent_scripts: recentScripts.map((s) => ({
        headline: s.headline || "",
        language_label: s.language_label || "",
        voice_name: s.voice_name || "",
        created_at: s.created_at,
      })),
    });
  } catch (err) {
    console.error("[stats] dashboard failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't load your dashboard." });
  }
});

/**
 * GET /stats/apidirect — which apidirect key is working, and which is spent.
 *
 * ── WHY THIS IS A ROUTE AND NOT A LOG LINE ───────────────────────────────────
 * With several keys in rotation, "the news stopped updating" and "one key ran
 * out of credit" look identical from the app. The client already cools a failing
 * key for an hour, rotates past it and records why on its row — this is the
 * window onto that, so the answer to "which key do I need to top up" is one
 * request instead of an hour of log archaeology.
 *
 * Secrets never leave: last four characters only, which is enough to match a row
 * to a key in the apidirect dashboard and useless to anyone else.
 *
 * `status` per key:
 *   ok           serving normally
 *   exhausted    free tier used up, or a daily/monthly spending cap hit — the
 *                one that means TOP THIS UP (402, or 429 with a limit code)
 *   blocked      account blocked for a payment failure (403)
 *   invalid      key revoked or deleted (401)
 *   rate_limited too many at once — transient, clears in seconds
 */
router.get("/apidirect", authenticateToken, async (req, res) => {
  try {
    const me = await User.findById(req.user.id).select("email").lean();
    const email = String(me?.email || "").toLowerCase();
    if (!ADMIN_EMAILS.size || !ADMIN_EMAILS.has(email)) {
      // 404, not 403: an endpoint whose existence is only interesting to whoever
      // runs the deployment should not confirm itself to anyone else.
      return res.status(404).json({ success: false, message: "Not found" });
    }

    const keys = await apidirectKeyHealth();
    return res.json({
      success: true,
      configured: keys.length > 0,
      usable_now: keys.filter((k) => k.usable_now).length,
      keys,
    });
  } catch (err) {
    console.error("[stats] apidirect health failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't read key health." });
  }
});

export default router;

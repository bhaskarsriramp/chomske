/**
 * admin.js: the showcase workbench.
 *
 * ── EVERY ROUTE HERE IS requireAdmin ─────────────────────────────────────────
 * Which reads the flag from the database on each request rather than trusting
 * the token, and answers 404 rather than 403 to anyone without it. A 403 tells
 * a prober that the endpoint exists and that the only thing missing is a
 * permission, which is exactly the information not to give away.
 *
 * The flag itself is set by hand in Mongo. There is deliberately no route that
 * grants it: an endpoint capable of making somebody an admin is the highest
 * value target in the product, and nothing here needs one.
 */
import express from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import Profile from "../models/Profile.js";
import Transcript from "../models/Transcript.js";
import Script from "../models/Script.js";
import VoiceProfile from "../models/VoiceProfile.js";
import ShowcaseVisit from "../models/ShowcaseVisit.js";
import { requireAdmin } from "../middleware/authenticateToken.js";
import { getBalance, grant } from "../services/creditsService.js";
import {
  createShowcase, startShowcaseBuild, inspectUrls, shareUrl, newSlug,
  SHOWCASE_CREDITS, SHOWCASE_MAX_VIDEOS,
} from "../services/showcaseService.js";
import { resolveChannel, recentEligible, OFFER_COUNT } from "../services/youtubeChannelService.js";
import { isYouTubeDataConfigured } from "../services/youtubeDataClient.js";
import { SHORT_MAX_SECONDS } from "../services/voiceLanes.js";

const router = express.Router();

/**
 * Everything the admin list needs about one showcase, including whether its
 * voice is ready, because a link sent before the analysis finishes opens onto
 * an empty page and that is not an impression you get twice.
 */
async function shapeShowcase(row, { deep = false } = {}) {
  const profile = await Profile.findOne({ user: row._id }).select("_id name categories").lean();
  const voice = profile
    ? await VoiceProfile.findOne({ profile: profile._id })
        .select("built_at building build_error transcript_count confidence language_label builds")
        .lean()
    : null;

  const videos = await Transcript.countDocuments({ user: row._id });
  const balance = await getBalance(row._id).catch(() => 0);

  const out = {
    id: String(row._id),
    display_name: row.showcase?.display_name || row.name || "",
    slug: row.showcase?.slug || "",
    url: row.showcase?.slug ? shareUrl(row.showcase.slug) : "",
    active: row.showcase?.active !== false,
    notes: row.showcase?.notes || "",

    videos,
    credits: balance,

    // The gate on "copy link". False until the analysis has actually produced
    // something.
    ready: Boolean(voice?.built_at) && !voice?.building,
    building: Boolean(voice?.building),
    build_error: voice?.build_error || "",
    transcript_count: voice?.transcript_count || 0,
    confidence: voice?.confidence || "",
    language_label: voice?.language_label || "",

    opens: row.showcase?.opens || 0,
    scripts_made: row.showcase?.scripts_made || 0,
    last_opened_at: row.showcase?.last_opened_at || null,

    claimed: Boolean(row.showcase?.claimed_by),
    claimed_at: row.showcase?.claimed_at || null,
    created_at: row.created_at,
  };

  if (deep) {
    // Distinct browsers, which is the number that answers "did HE open it".
    // `opens` counts hits and cannot tell twenty of ours from twenty of his.
    out.visitors = await ShowcaseVisit.countDocuments({ showcase: row._id });

    // ── THE VIDEOS THE VOICE WAS BUILT FROM ─────────────────────────────────
    // Which ones were read, which failed, and how long each is. A thin or odd
    // voice is nearly always explained here: one video that never transcribed,
    // or five from a channel that turned out not to be theirs.
    out.videos_list = await Transcript.find({ user: row._id })
      .select("title url video_id duration_seconds status thumbnail channel views error created_at language_label")
      .sort({ created_at: 1 })
      .lean();

    // ── WHO OPENED IT, AND WHEN ─────────────────────────────────────────────
    // One row per browser. The visitor id is truncated on the way out: it is a
    // session identifier, and the admin only ever needs to tell two visitors
    // apart, never to reconstruct one.
    const visits = await ShowcaseVisit.find({ showcase: row._id })
      .sort({ first_seen_at: 1 })
      .limit(100)
      .lean();
    out.visits = visits.map((v) => ({
      id: String(v.visitor_id || "").slice(0, 6),
      first_seen_at: v.first_seen_at,
      last_seen_at: v.last_seen_at,
      scripts_generated: v.scripts_generated || 0,
      credits_used: v.credits_used || 0,
      // Enough to tell a phone from a laptop, which is the only question the
      // full string is ever asked here.
      device: /Mobi|Android|iPhone/i.test(v.user_agent || "") ? "phone" : "desktop",
    }));

    // ── WHAT THEY ACTUALLY WROTE ────────────────────────────────────────────
    // An open is curiosity; a script is interest. This is the column that says
    // whether the outreach worked.
    out.scripts = await Script.find({ user: row._id })
      .select("headline status duration_seconds credits_charged created_at error")
      .sort({ created_at: -1 })
      .limit(50)
      .lean();

    // ── THE VOICE ITSELF ────────────────────────────────────────────────────
    // Measured facts only, the same line routes/script.js draws: style_brief
    // and category_voice never leave the server, not even for an admin, so
    // there is exactly one rule about that asset rather than one with an
    // exception in it. What is here is enough to judge whether an analysis is
    // worth sending: how much it read, what it measured, how sure it is.
    if (voice?.built_at) {
      const full = await VoiceProfile.findOne({ profile: profile._id })
        .select("metrics signature_phrases category_voice built_at built_for_category built_for_spec")
        .lean();
      const m = full?.metrics || {};
      out.voice = {
        built_at: full?.built_at || null,
        built_for_category: full?.built_for_category || "",
        built_for_spec: full?.built_for_spec || 0,
        signature_phrase_count: (full?.signature_phrases || []).length,
        category_voice_fields: Object.keys(full?.category_voice || {}).length,
        metrics: {
          videos: m.videos ?? null,
          words: m.words ?? null,
          script: m.script || "",
          english_ratio: m.english_ratio ?? null,
          english_kept: (m.english_kept || []).slice(0, 15),
          mean_sentence_words: m.mean_sentence_words ?? null,
          short_sentence_ratio: m.short_sentence_ratio ?? null,
          question_ratio: m.question_ratio ?? null,
          words_per_second: m.words_per_second ?? null,
          address: m.address || "",
          opening_stems: (m.opening_stems || []).slice(0, 5),
          repeated_phrases: (m.repeated_phrases || []).slice(0, 12),
          sentence_starters: (m.sentence_starters || []).slice(0, 10),
        },
      };
    }

    out.notes = row.showcase?.notes || "";
    out.created_by = row.showcase?.created_by ? String(row.showcase.created_by) : "";
  }

  return out;
}

/** GET /admin/me, the gate the frontend renders on. */
router.get("/me", requireAdmin, async (req, res) => {
  return res.json({
    success: true,
    admin: true,
    limits: { max_videos: SHOWCASE_MAX_VIDEOS, credits_per_link: SHOWCASE_CREDITS },
  });
});

/** GET /admin/showcases */
router.get("/showcases", requireAdmin, async (req, res) => {
  try {
    const rows = await User.find({ kind: "showcase" }).sort({ created_at: -1 }).limit(200).lean();
    const showcases = [];
    for (const r of rows) showcases.push(await shapeShowcase(r));
    return res.json({ success: true, showcases });
  } catch (err) {
    console.error("[admin] list failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't load showcases." });
  }
});

/**
 * POST /admin/showcases/inspect  { urls }
 *
 * Free, and separate from creation on purpose. It buys only the metadata
 * lookup, so an admin can paste five links and see which ones are usable, how
 * long they are and whose channel they are from, before anything is written or
 * any video is read.
 */
router.post("/showcases/inspect", requireAdmin, async (req, res) => {
  try {
    const urls = Array.isArray(req.body?.urls) ? req.body.urls.slice(0, SHOWCASE_MAX_VIDEOS) : [];
    if (!urls.length) return res.status(400).json({ success: false, message: "Paste at least one URL." });

    const { ok, rejected } = await inspectUrls(urls);
    return res.json({
      success: true,
      ok: ok.map((v) => ({
        url: v.url,
        video_id: v.video_id,
        title: v.details?.title || "",
        channel: v.details?.author || "",
        duration_seconds: v.duration_seconds,
        thumbnail: v.details?.thumbnail || "",
        views: v.details?.views ?? null,
      })),
      rejected,
    });
  } catch (err) {
    console.error("[admin] inspect failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't check those links." });
  }
});

/**
 * GET /admin/channel/resolve?q=…
 *
 * The same ladder of one-unit lookups the creator-facing route uses, behind the
 * admin gate instead. Two endpoints rather than one shared one because the
 * QUESTION is different even though the lookup is identical: a creator is
 * naming their own channel and the server can scope everything to their profile
 * and their slots, while an admin is naming somebody else's and there is no
 * profile in existence yet to count against.
 *
 * Nothing is duplicated that matters. Both handlers are a dozen lines over
 * services/youtubeChannelService.js, which is where the resolver actually lives.
 */
router.get("/channel/resolve", requireAdmin, async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.status(400).json({ success: false, message: "Type a channel name, @handle or link." });
  if (q.length > 200) return res.status(400).json({ success: false, message: "That is too long." });
  if (!isYouTubeDataConfigured()) {
    return res.status(503).json({ success: false, message: "Channel lookup is unavailable. Paste URLs instead." });
  }

  try {
    const { match, candidates, searched, units } = await resolveChannel(q);
    console.log(
      `[admin] resolve "${q}" -> ${match ? match.handle || match.channel_id : `${candidates.length} candidates`} ` +
      `· ${units} units${searched ? " · SEARCHED" : ""}`
    );
    if (!match && !candidates.length) {
      return res.json({
        success: true, match: null, candidates: [],
        message: "No channel found. Try the @handle, or a link to the channel or one of its videos.",
      });
    }
    return res.json({ success: true, match, candidates });
  } catch (err) {
    console.warn(`[admin] resolve failed for "${q}": ${err.message}`);
    return res.status(err?.keyExhausted ? 503 : 502).json({
      success: false,
      message: err?.keyExhausted
        ? "Channel lookup is paused right now. Paste URLs instead."
        : "Couldn't search for that channel.",
    });
  }
});

/**
 * GET /admin/channel/videos?channel_id=…
 *
 * A channel's recent videos short enough for a showcase.
 *
 * ── THE CEILING IS THE SHORT LANE'S, NOT A SHOWCASE SETTING ──────────────────
 * SHORT_MAX_SECONDS, the same constant inspectUrls tests through
 * laneForVideo(). A showcase is deliberately short-form only: the long lane
 * needs three long videos of its own and teaches something an outreach page
 * does not need, so offering a five minute video here would produce a pick the
 * very next step refuses.
 *
 * ── AND WHY ALREADY-USED VIDEOS ARE FLAGGED ──────────────────────────────────
 * Across EVERY showcase, not just one. Outreach happens over weeks from a list,
 * and the failure this prevents is quiet: an admin builds a second showcase for
 * a creator who already has one, spends five more video reads, and sends a
 * second link while the first is still live. The flag makes that visible at the
 * moment of choosing rather than in the list afterwards.
 */
router.get("/channel/videos", requireAdmin, async (req, res) => {
  const channelId = String(req.query.channel_id || "").trim();
  if (!/^UC[\w-]{22}$/.test(channelId)) {
    return res.status(400).json({ success: false, message: "That isn't a channel id." });
  }
  if (!isYouTubeDataConfigured()) {
    return res.status(503).json({ success: false, message: "Channel lookup is unavailable. Paste URLs instead." });
  }

  try {
    const { videos, scanned, total, units } = await recentEligible(channelId, {
      maxSeconds: SHORT_MAX_SECONDS,
      want: OFFER_COUNT,
    });

    // Only showcase rows. A video sitting in a real creator's own voice profile
    // is none of this screen's business and must not be flagged as taken.
    const showcaseIds = await User.find({ kind: "showcase" }).select("_id").lean();
    const used = new Set(
      (await Transcript.find({
        user: { $in: showcaseIds.map((u) => u._id) },
        video_id: { $in: videos.map((v) => v.video_id) },
      }).select("video_id").lean()).map((t) => String(t.video_id))
    );

    console.log(
      `[admin] videos ${channelId} -> ${videos.length} eligible of ${scanned} scanned ` +
      `(${total} uploads) · ${units} units · ${used.size} already in a showcase`
    );

    return res.json({
      success: true,
      channel_id: channelId,
      videos: videos.map((v) => ({ ...v, already_added: used.has(v.video_id) })),
      scanned,
      total_uploads: total,
      max_seconds: SHORT_MAX_SECONDS,
      // A showcase is always new, so the whole allowance is free. Shaped like
      // the creator route's reply so one picker component reads both.
      slots: { used: 0, max: SHOWCASE_MAX_VIDEOS, left: SHOWCASE_MAX_VIDEOS },
    });
  } catch (err) {
    console.warn(`[admin] videos failed for ${channelId}: ${err.message}`);
    return res.status(err?.keyExhausted ? 503 : 502).json({
      success: false,
      message: err?.keyExhausted
        ? "Can't read that channel right now. Paste URLs instead."
        : "Couldn't read that channel's videos.",
    });
  }
});

/** POST /admin/showcases  { display_name, urls, notes } */
router.post("/showcases", requireAdmin, async (req, res) => {
  try {
    const displayName = String(req.body?.display_name || "").trim();
    const urls = Array.isArray(req.body?.urls) ? req.body.urls : [];
    const notes = String(req.body?.notes || "");

    const { showcase, added, rejected } = await createShowcase({
      adminId: req.user.id, displayName, urls, notes,
    });

    const shaped = await shapeShowcase(showcase.toObject ? showcase.toObject() : showcase);
    return res.status(201).json({ success: true, showcase: shaped, added, rejected });
  } catch (err) {
    if (err.userMessage) {
      return res.status(400).json({ success: false, message: err.userMessage, rejected: err.rejected || [] });
    }
    console.error("[admin] create failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't create that showcase." });
  }
});

/** GET /admin/showcases/:id */
router.get("/showcases/:id", requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: "Not found" });
    }
    const row = await User.findOne({ _id: req.params.id, kind: "showcase" }).lean();
    if (!row) return res.status(404).json({ success: false, message: "Not found" });
    return res.json({ success: true, showcase: await shapeShowcase(row, { deep: true }) });
  } catch (err) {
    console.error("[admin] detail failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't load that showcase." });
  }
});

/**
 * POST /admin/showcases/:id/build
 *
 * Runs the ordinary voice analysis, the same one the creator-facing "Analyse my
 * voice" button runs, over this showcase's videos. See services/showcaseService.js.
 */
router.post("/showcases/:id/build", requireAdmin, async (req, res) => {
  try {
    const out = await startShowcaseBuild(req.params.id);
    return res.status(202).json({ success: true, ...out });
  } catch (err) {
    if (err.userMessage) return res.status(400).json({ success: false, message: err.userMessage });
    console.error("[admin] build failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't start that analysis." });
  }
});

/** POST /admin/showcases/:id/topup  { credits } */
router.post("/showcases/:id/topup", requireAdmin, async (req, res) => {
  try {
    const amount = Math.max(1, Math.min(1000, Math.round(Number(req.body?.credits) || SHOWCASE_CREDITS)));
    const row = await User.findOne({ _id: req.params.id, kind: "showcase" }).select("_id showcase.display_name").lean();
    if (!row) return res.status(404).json({ success: false, message: "Not found" });

    await grant(row._id, amount, {
      reason: "showcase", refType: "User", refId: row._id,
      note: `Top-up for ${row.showcase?.display_name || "showcase"}`,
    });

    return res.json({ success: true, credits: await getBalance(row._id) });
  } catch (err) {
    console.error("[admin] topup failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't add credits." });
  }
});

/**
 * POST /admin/showcases/:id/active  { active }
 *
 * The kill switch. A creator who would rather this did not exist gets it turned
 * off in one click, and the same control is what the "remove this" link on the
 * page itself calls.
 */
router.post("/showcases/:id/active", requireAdmin, async (req, res) => {
  try {
    const active = req.body?.active !== false;
    const r = await User.updateOne(
      { _id: req.params.id, kind: "showcase" },
      { $set: { "showcase.active": active } }
    );
    if (!r.matchedCount) return res.status(404).json({ success: false, message: "Not found" });
    return res.json({ success: true, active });
  } catch (err) {
    console.error("[admin] toggle failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't change that." });
  }
});

/**
 * POST /admin/showcases/:id/rotate
 *
 * A new slug, killing the old link. For when one has been forwarded further
 * than intended, or pasted somewhere public.
 */
router.post("/showcases/:id/rotate", requireAdmin, async (req, res) => {
  try {
    const slug = newSlug();
    const r = await User.updateOne(
      { _id: req.params.id, kind: "showcase" },
      { $set: { "showcase.slug": slug } }
    );
    if (!r.matchedCount) return res.status(404).json({ success: false, message: "Not found" });
    return res.json({ success: true, slug, url: shareUrl(slug) });
  } catch (err) {
    console.error("[admin] rotate failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't rotate that link." });
  }
});

export default router;

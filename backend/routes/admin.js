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
import VoiceProfile from "../models/VoiceProfile.js";
import ShowcaseVisit from "../models/ShowcaseVisit.js";
import { requireAdmin } from "../middleware/authenticateToken.js";
import { getBalance, grant } from "../services/creditsService.js";
import {
  createShowcase, startShowcaseBuild, inspectUrls, shareUrl, newSlug,
  SHOWCASE_CREDITS, SHOWCASE_MAX_VIDEOS,
} from "../services/showcaseService.js";

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
    out.videos_list = await Transcript.find({ user: row._id })
      .select("title url duration_seconds status thumbnail channel error")
      .sort({ created_at: 1 })
      .lean();
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

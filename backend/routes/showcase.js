/**
 * showcase.js: opening a private share link, and claiming it.
 *
 * ── THE LINK IS THE CREDENTIAL ───────────────────────────────────────────────
 * There is no sign-in here and there is not meant to be. A creator we have
 * emailed cold will not create an account to look at a demo; asking them to is
 * the step that loses them, and the entire point of a showcase is that it has
 * already done the work that would otherwise be asked of them first.
 *
 * So POST /v/:slug/open trades a valid slug for a scoped session cookie. That
 * session can read the feed, read the voice and generate a script, and can do
 * nothing else: see authenticateToken.js, where the default guard refuses it
 * and only a named allow-list lets it through.
 *
 * ── WHY THIS ROUTER SENDS noindex ────────────────────────────────────────────
 * The page carries a real person's name and quotes their own sentences back to
 * them. Sent privately to that person, that is a courtesy they can end at any
 * time. Indexed by Google, it becomes public commercial use of their identity
 * that they never agreed to, and no amount of "it was meant to be private"
 * undoes a cached search result.
 *
 * The header goes on the ROUTER, not on individual handlers, so a route added
 * later cannot forget it.
 */
import express from "express";
import crypto from "crypto";
import User from "../models/User.js";
import Profile from "../models/Profile.js";
import VoiceProfile from "../models/VoiceProfile.js";
import {
  COOKIE_NAME, cookieOptions, readSession, signShowcaseSession, SHOWCASE_SESSION_DAYS,
} from "../middleware/authenticateToken.js";
import { getBalance } from "../services/creditsService.js";
import { resolveSlug, recordVisit, claimShowcase } from "../services/showcaseService.js";

const router = express.Router();

// Belt and braces with the same header on the static host. Anything under this
// router is private by construction.
router.use((req, res, next) => {
  res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.set("Cache-Control", "no-store");
  next();
});

/**
 * The session cookie for a share link.
 *
 * Shorter-lived than a real one, and otherwise identical, so the whole existing
 * cookie path (httpOnly, SameSite, domain) applies unchanged.
 */
function showcaseCookieOptions() {
  return { ...cookieOptions(), maxAge: SHOWCASE_SESSION_DAYS * 24 * 60 * 60 * 1000 };
}

/**
 * POST /v/:slug/open
 *
 * Idempotent: opening the same link twice is the normal case (they read the
 * email, close the tab, come back). Each open refreshes the session and counts
 * one visit.
 */
router.post("/:slug/open", async (req, res) => {
  try {
    const showcase = await resolveSlug(req.params.slug);
    if (!showcase) {
      // One answer for every failure mode, deliberately: expired, deactivated,
      // claimed, or never existed all look the same from outside, so the
      // endpoint cannot be used to enumerate which slugs are real.
      return res.status(404).json({ success: false, message: "This link isn't active any more." });
    }

    const profile = await Profile.findOne({ user: showcase._id }).select("_id name").lean();
    const voice = profile
      ? await VoiceProfile.findOne({ profile: profile._id })
          .select("built_at building language_label confidence transcript_count")
          .lean()
      : null;

    // ── AN UNBUILT SHOWCASE IS NOT OPENABLE ────────────────────────────────
    // The admin panel gates "copy link" on the same condition, so this should
    // be unreachable. It exists because the alternative, if it ever is reached,
    // is the creator we most wanted to impress landing on an empty page.
    if (!voice?.built_at) {
      return res.status(409).json({
        success: false,
        message: "This demo isn't ready yet. Please try the link again shortly.",
      });
    }

    // A browser, not a request. Reused from the existing cookie when this is a
    // return visit so the analytics do not count one person as many.
    const prior = readSession(req, res);
    const visitorId =
      prior?.kind === "showcase" && prior.id === String(showcase._id) && prior.visitor_id
        ? prior.visitor_id
        : crypto.randomBytes(9).toString("base64url");

    res.cookie(COOKIE_NAME, signShowcaseSession(showcase._id, visitorId), showcaseCookieOptions());

    // Never blocks the page.
    recordVisit(showcase._id, visitorId, req).catch(() => {});

    return res.json({
      success: true,
      showcase: {
        id: String(showcase._id),
        display_name: showcase.showcase?.display_name || showcase.name || "",
        slug: showcase.showcase?.slug || "",
        profile_id: String(profile._id),
        language_label: voice.language_label || "",
        confidence: voice.confidence || "",
        transcript_count: voice.transcript_count || 0,
        credits: await getBalance(showcase._id).catch(() => 0),
      },
    });
  } catch (err) {
    console.error("[showcase] open failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't open that link." });
  }
});

/**
 * GET /v/analysis, what we measured about this creator.
 *
 * ── PROOF, NOT PROSE, AND THE SAME LINE AS EVERYWHERE ELSE ───────────────────
 * shapeProfile() in routes/script.js draws a hard boundary: `style_brief` never
 * leaves the server, because it is the instruction block the whole product is
 * built around, and what a creator gets instead is counts they can sanity-check
 * an analysis against. That line does not move because the page is persuasive.
 *
 * So this sends MEASURED NUMBERS, which are facts about how this person already
 * speaks, computed with no model in the loop (services/voiceMetrics.js): the
 * code-mixing ratio, sentence shape, the English words they keep, the openings
 * they reuse. Those are the persuasive part precisely because they are checkable
 * against videos the creator made themselves.
 *
 * It does NOT send style_brief, category_voice, or the sample openings and
 * closings. Handing over the analysis in full would mean the demo gives away
 * the thing the subscription sells.
 */
router.get("/analysis", async (req, res) => {
  try {
    const session = readSession(req, res);
    if (!session || session.kind !== "showcase") {
      return res.status(401).json({ success: false, message: "Open this from your link." });
    }

    const profile = await Profile.findOne({ user: session.id }).select("_id").lean();
    const voice = profile ? await VoiceProfile.findOne({ profile: profile._id }).lean() : null;
    if (!voice?.built_at) return res.status(404).json({ success: false, message: "Not ready yet." });

    const m = voice.metrics || {};
    return res.json({
      success: true,
      analysis: {
        videos: m.videos || voice.transcript_count || 0,
        language_label: voice.language_label || "",
        confidence: voice.confidence || "",
        script: m.script || "",

        english_ratio: m.english_ratio ?? null,
        english_kept: (m.english_kept || []).slice(0, 12),

        mean_sentence_words: m.mean_sentence_words ?? null,
        short_sentence_ratio: m.short_sentence_ratio ?? null,
        question_ratio: m.question_ratio ?? null,
        words_per_second: m.words_per_second ?? null,
        address: m.address || "",

        opening_stems: (m.opening_stems || []).slice(0, 3),
        repeated_phrases: (m.repeated_phrases || []).slice(0, 8),
        sentence_starters: (m.sentence_starters || []).slice(0, 8),

        // Counts, in the shapeProfile tradition: enough to tell a real analysis
        // from a shrug, without being the analysis.
        signature_phrase_count: (voice.signature_phrases || []).length,
        category_voice_fields: Object.keys(voice.category_voice || {}).length,
      },
    });
  } catch (err) {
    console.error("[showcase] analysis failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't load that." });
  }
});

/**
 * GET /v/:slug
 *
 * A metadata-only peek used before the session exists, so the page can render
 * the creator's name while the open call is in flight. Carries nothing the
 * link holder could not see a moment later, and no credentials.
 */
router.get("/:slug", async (req, res) => {
  const showcase = await resolveSlug(req.params.slug).catch(() => null);
  if (!showcase) return res.status(404).json({ success: false, message: "This link isn't active any more." });

  const profile = await Profile.findOne({ user: showcase._id }).select("_id").lean();
  const voice = profile ? await VoiceProfile.findOne({ profile: profile._id }).select("built_at").lean() : null;

  return res.json({
    success: true,
    showcase: {
      display_name: showcase.showcase?.display_name || showcase.name || "",
      ready: Boolean(voice?.built_at),
    },
  });
});

/**
 * POST /v/:slug/retire
 *
 * The creator's own off switch, on the page itself.
 *
 * ── WHY THIS NEEDS NO AUTHENTICATION ─────────────────────────────────────────
 * Holding the link is the only qualification, which is the same qualification
 * as viewing it. The worst a stranger with the link can do is turn off a demo
 * that was built for somebody else, and losing a showcase costs us a rebuild;
 * making a creator email us to withdraw costs us their goodwill and is exactly
 * the friction that turns a polite objection into a public one.
 */
router.post("/:slug/retire", async (req, res) => {
  try {
    const showcase = await resolveSlug(req.params.slug);
    if (!showcase) return res.json({ success: true, retired: true });   // already gone

    await User.updateOne({ _id: showcase._id }, { $set: { "showcase.active": false } });
    res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });

    console.log(`[showcase] "${showcase.showcase?.display_name}" retired by the recipient`);
    return res.json({ success: true, retired: true });
  } catch (err) {
    console.error("[showcase] retire failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't remove that." });
  }
});

/**
 * POST /v/claim  { showcase_id }
 *
 * Called immediately AFTER a successful Google sign-in from a showcase page.
 * Moves the profile, the voice and the transcripts onto the real account, so
 * the creator arrives at a finished voice instead of an empty "paste five URLs"
 * screen. See claimShowcase() for why this re-parents rather than copying.
 *
 * Guarded by the ordinary human session: the caller must have just signed in.
 */
router.post("/claim", async (req, res) => {
  try {
    const session = readSession(req, res);
    if (!session || session.kind !== "human") {
      return res.status(401).json({ success: false, message: "Sign in first." });
    }

    const out = await claimShowcase(String(req.body?.showcase_id || ""), session.id);
    if (!out.claimed) {
      return res.status(400).json({
        success: false,
        reason: out.reason,
        message:
          out.reason === "already_claimed"
            ? "This demo has already been claimed."
            : "Couldn't attach that voice to your account.",
      });
    }

    return res.json({ success: true, ...out });
  } catch (err) {
    console.error("[showcase] claim failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't attach that voice." });
  }
});

export default router;

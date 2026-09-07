/**
 * source.js: the free half of Import and Idea.
 *
 * ── WHY PREVIEW IS AN ENDPOINT AND NOT PART OF POST /script ──────────────────
 * Because the creator has a decision to make in between, and they cannot make
 * it without knowing what we actually hold. "Five links" and "five links, two
 * of which are paywalled" are different orders at the same price, and the
 * second one is the one that produces a disappointing script. Discover solves
 * this with the brief and the source list: you read what the story is before
 * you order. This is the same beat.
 *
 * Everything here is free and everything here fails loudly. The expensive work,
 * reading a video, happens once somebody has paid, in POST /script.
 *
 * ── THE CAPS ARE ON THIS ROUTE FOR A REASON ─────────────────────────────────
 * A preview costs us a little: one apidirect metadata call for a video, a fan
 * out of page fetches, and for a lookup one small model call plus a news
 * search. Individually trivial, and trivially loopable, so it gets a per-user
 * daily ceiling of its own on top of the express-rate-limit ceiling in
 * server.js. The two guard different things: that one stops a burst, this one
 * stops a slow drip.
 */
import express from "express";
import mongoose from "mongoose";
import Source from "../models/Source.js";
import authenticateToken from "../middleware/authenticateToken.js";
import { buildSource, confirmDraft, redraft, shapeSource, SourceRejected } from "../services/sourceService.js";
import { resolveProfile } from "../services/profileService.js";
import { getCategory } from "../services/categories.js";
import {
  MAX_SOURCE_LINKS, MAX_SOURCE_TEXT_CHARS, MAX_PROMPT_CHARS,
  MAX_SOURCE_VIDEO_SECONDS, VIDEO_READ_FREE_SECONDS, LOOKUP_CREDITS,
  VIDEO_READ_BLOCK_SECONDS, VIDEO_READ_CREDITS_PER_BLOCK,
} from "../services/creditPricing.js";

const router = express.Router();

/** Previews a creator may build in a day. Generous: pasting links, reading what
 *  came back and adjusting is the normal way this screen gets used. */
const DAILY_PREVIEWS = parseInt(process.env.DAILY_SOURCE_PREVIEWS || "40", 10);

/**
 * POST /source/preview
 *   { kind, youtube?, links?[], text?, prompt?, lookup?, profile? }
 *
 * Reads everything that is free to read and hands back what we hold.
 *
 * ── AND IT IS FREE, DELIBERATELY ─────────────────────────────────────────────
 * Pasting links, seeing which pages we could actually get, dropping the two
 * that were paywalled and trying again is how this screen is meant to be used,
 * and a price on that loop would stop people using it. Nothing is charged
 * until a script is ordered, and then it is charged once, on the one button
 * that spends credits: the read plus the length (see quote() in
 * services/creditPricing.js).
 *
 * That is also where the money matches the work. The video is not watched
 * here, only its length looked up; the read itself happens inside POST /script
 * (services/sourceMaterial.js), so charging here would take credits for a read
 * that has not happened and might never happen.
 */
router.post("/preview", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const usedToday = await Source.countDocuments({ user: userId, created_at: { $gte: since } });
    if (usedToday >= DAILY_PREVIEWS) {
      return res.status(429).json({
        success: false,
        limit_reached: true,
        message: `You've prepared ${DAILY_PREVIEWS} sources today. The limit resets 24 hours after each one.`,
      });
    }

    // ── Which market a lookup searches ────────────────────────────────────
    // The creator's own channel decides. Somebody running an Indian markets
    // channel who types "the rate decision" means the RBI, and a US-locale
    // search would confidently answer about the Fed. Taken from the profile's
    // first category, which is the same signal the feed uses.
    let locale = null;
    if (req.body?.lookup) {
      const { profile } = await resolveProfile(userId, req.body?.profile);
      locale = getCategory((profile.categories || [])[0])?.locale || null;
    }

    const doc = await buildSource(userId, {
      kind: req.body?.kind === "idea" ? "idea" : "import",
      youtube: String(req.body?.youtube || "").trim(),
      links: Array.isArray(req.body?.links) ? req.body.links.filter(Boolean) : [],
      text: String(req.body?.text || ""),
      prompt: String(req.body?.prompt || ""),
      lookup: !!req.body?.lookup,
      locale,
    });

    return res.json({ success: true, source: shapeSource(doc) });
  } catch (err) {
    if (err instanceof SourceRejected) {
      // A refusal the creator can act on: a bad link, a live stream, a video
      // over the cap. Its own shape so the client can highlight the field
      // rather than showing a generic banner.
      return res.status(400).json({
        success: false,
        message: err.userMessage,
        too_long: !!err.too_long,
        length_unknown: !!err.length_unknown,
        duration: err.duration ?? null,
      });
    }
    console.error("[source] preview failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't prepare that. Please try again." });
  }
});

/**
 * POST /source/:id/confirm  { text }
 *
 * The creator has read the draft, fixed what was wrong, and is putting their
 * name to it. That signature is what turns model-written content into material
 * this product is willing to write a script from, so it is a real request with
 * a real record rather than a checkbox in the browser.
 *
 * Free. Nothing has been read or generated that was not already paid for by
 * the preview; this only records an approval.
 */
router.post("/:id/confirm", authenticateToken, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid id" });
  }
  try {
    const doc = await confirmDraft(req.user.id, req.params.id, req.body?.text);
    return res.json({ success: true, source: shapeSource(doc) });
  } catch (err) {
    if (err instanceof SourceRejected) {
      return res.status(400).json({ success: false, message: err.userMessage });
    }
    console.error("[source] confirm failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't save that. Please try again." });
  }
});

/**
 * POST /source/:id/redraft
 *
 * A different draft of the same idea. Free, and capped only by the preview
 * ceiling below: a creator who rejects two drafts is using the product exactly
 * as intended, and charging for that would push them to accept a bad one.
 */
router.post("/:id/redraft", authenticateToken, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid id" });
  }
  try {
    const doc = await redraft(req.user.id, req.params.id);
    return res.json({ success: true, source: shapeSource(doc) });
  } catch (err) {
    if (err instanceof SourceRejected) {
      return res.status(400).json({ success: false, message: err.userMessage });
    }
    console.error("[source] redraft failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't write another draft. Please try again." });
  }
});

/** GET /source/limits, what the screens are allowed to accept. Rendered rather
 *  than hardcoded, for the same reason prices are: two copies drift. */
router.get("/limits", authenticateToken, (req, res) => {
  return res.json({
    success: true,
    limits: {
      max_links: MAX_SOURCE_LINKS,
      max_text_chars: MAX_SOURCE_TEXT_CHARS,
      max_prompt_chars: MAX_PROMPT_CHARS,
      max_video_seconds: MAX_SOURCE_VIDEO_SECONDS,
      free_video_seconds: VIDEO_READ_FREE_SECONDS,
      lookup_credits: LOOKUP_CREDITS,

      // ── THE VIDEO RATE, SO THE UI CAN EXPLAIN ITSELF ──────────────────
      // Only the help text under the video field, "10 credits per 30s". The
      // TOTAL always comes from GET /billing/quote and is never assembled in
      // the browser, so this can change here without a new frontend build and
      // the two cannot disagree. Links and pasted text have no rate because
      // they have no price. See services/creditPricing.js.
      video_block_seconds: VIDEO_READ_BLOCK_SECONDS,
      video_block_credits: VIDEO_READ_CREDITS_PER_BLOCK,
    },
  });
});

/** GET /source/:id, so a reload does not lose a prepared source. */
router.get("/:id", authenticateToken, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid id" });
  }
  // Scoped to the caller: an id alone must never read someone else's material.
  const doc = await Source.findOne({ _id: req.params.id, user: req.user.id }).lean();
  if (!doc) return res.status(404).json({ success: false, message: "Not found" });
  return res.json({ success: true, source: shapeSource(doc) });
});

export default router;

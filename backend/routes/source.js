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
import { buildSource, shapeSource, SourceRejected } from "../services/sourceService.js";
import { resolveProfile } from "../services/profileService.js";
import { getCategory } from "../services/categories.js";
import {
  MAX_SOURCE_LINKS, MAX_SOURCE_TEXT_CHARS, MAX_PROMPT_CHARS,
  MAX_SOURCE_VIDEO_SECONDS, VIDEO_READ_FREE_SECONDS, LOOKUP_CREDITS,
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
      youtube: req.body?.youtube || "",
      links: req.body?.links || [],
      text: req.body?.text || "",
      prompt: req.body?.prompt || "",
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

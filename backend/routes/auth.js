/**
 * auth.js — Google sign-in.
 *
 * ── WHY THIS DIFFERS FROM THE REFERENCE PROJECT ──────────────────────────────
 * betaFounderProduction's /user-login-gmail takes `email`, `firstName`, `picture`
 * from the REQUEST BODY and trusts them. That means anyone with curl can post
 * somebody else's email and be issued a valid session for their account.
 *
 * Here the browser sends only the Google ID token (a signed JWT). We verify that
 * signature against Google's public keys and check it was issued for OUR client
 * id, then read the identity out of the verified payload. The client never gets
 * to assert who it is.
 */
import express from "express";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import User from "../models/User.js";
import Profile from "../models/Profile.js";
import authenticateToken, { COOKIE_NAME, cookieOptions } from "../middleware/authenticateToken.js";
import { publicCategories, sanitizeSelection, MAX_CATEGORIES } from "../services/categories.js";
import { ensureProfile, syncUserCategories } from "../services/profileService.js";
import { kickoffCategories } from "../services/newsScheduler.js";

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * POST /auth/google  { credential }
 * `credential` is the ID token from @react-oauth/google.
 */
router.post("/google", async (req, res) => {
  try {
    const credential = String(req.body?.credential || "");
    if (!credential) return res.status(400).json({ success: false, message: "Missing credential" });

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID, // rejects tokens minted for another app
      });
      payload = ticket.getPayload();
    } catch (err) {
      console.warn("[auth] google token verification failed:", err.message);
      return res.status(401).json({ success: false, message: "Google sign-in failed. Please try again." });
    }

    // Google sets this false for unverified addresses; those can be reassigned,
    // so treating them as an identity would let someone inherit another account.
    if (!payload?.email_verified) {
      return res.status(403).json({ success: false, message: "Your Google email isn't verified." });
    }

    const googleSub = payload.sub;
    const now = new Date();

    // Keyed on `sub`, never on email — Google accounts can change their address,
    // and an address can be reassigned to a different person over time.
    const user = await User.findOneAndUpdate(
      { google_sub: googleSub },
      {
        $set: {
          email: payload.email,
          name: payload.name || "",
          picture: payload.picture || "",
          last_login: now,
          last_seen_at: now,
        },
        $inc: { login_count: 1 },
        $setOnInsert: { google_sub: googleSub, created_at: now },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const token = jwt.sign(
      { sub: String(user._id), email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "14d" }
    );

    res.cookie(COOKIE_NAME, token, cookieOptions());

    // Their categories may have gone cold while they were away — the collector
    // stops polling a category nobody has opened in a fortnight. This wakes them
    // and collects immediately, so the feed has something in it by the time they
    // finish signing in. Fire-and-forget: sign-in never waits on the network.
    kickoffCategories(user.categories);

    return res.json({ success: true, user: publicUser(user) });
  } catch (err) {
    console.error("[auth] /google failed:", err);
    return res.status(500).json({ success: false, message: "Something went wrong signing you in." });
  }
});

/**
 * GET /auth/me — who am I? The frontend's only way to know, since the cookie is httpOnly.
 *
 * ── THIS IS WHAT "LOGGING IN FOR THE DAY" ACTUALLY LOOKS LIKE ────────────────
 * POST /auth/google runs once a fortnight. The cookie lasts 14 days, so every
 * other visit — opening the app in the morning, a new tab, a reload — arrives
 * here instead, and for a long time here did nothing but answer the question.
 *
 * That was the whole staleness bug. The kickoff lives on the sign-in path, the
 * paid ranking pass fires from the kickoff, and a returning creator was taking
 * neither: the collector had run forty times overnight and every one of those
 * rows was sitting at ai_score -1, invisible to a feed that filters on score.
 * The top card stayed at whatever was last judged, which could be yesterday.
 *
 * So a session restore wakes the categories exactly as a fresh sign-in does.
 * Fire-and-forget for the same reason it is there: nobody should wait on a
 * network-bound collection to find out who they are. It is safe to call on
 * every page load because claimKickoff holds a five-minute per-category slot
 * and claimRank a ten-minute one — fifty tabs are still one pass.
 */
router.get("/me", authenticateToken, async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  if (!user) {
    res.clearCookie(COOKIE_NAME, cookieOptions());
    return res.status(401).json({ success: false, message: "Account not found" });
  }

  kickoffCategories(user.categories);

  return res.json({ success: true, user: publicUser(user) });
});

/** GET /auth/categories — the catalogue, for the onboarding cards. */
router.get("/categories", (req, res) => {
  return res.json({ success: true, categories: publicCategories(), max: MAX_CATEGORIES });
});

/**
 * PUT /auth/categories  { categories: [ids], profile_name? }
 *
 * First-run onboarding. It answers two questions in one screen — what this
 * channel covers, and what to call it — because they are the same decision:
 * a profile with no categories has no feed, and one with no name cannot be told
 * apart from the next one they make.
 *
 * Both are written to the user's DEFAULT PROFILE (models/Profile.js), not to the
 * account. Later edits go through PATCH /profiles/:id, which is where a creator
 * with several channels changes them one at a time.
 *
 * Validated server-side and capped — the client enforces the same limit, but a
 * direct call must not be able to subscribe to all eight and quietly multiply
 * the collection bill.
 */
router.put("/categories", authenticateToken, async (req, res) => {
  const chosen = sanitizeSelection(req.body?.categories);
  if (!chosen.length) {
    return res.status(400).json({
      success: false,
      message: `Pick at least one, up to ${MAX_CATEGORIES}.`,
    });
  }

  const profile = await ensureProfile(req.user.id);

  // The name is optional HERE and only here: the first profile is pre-filled
  // with "My Profile" so a new account is never blocked on naming something it
  // has not seen yet. Every profile after this one has to be named — see
  // services/profileService.js createProfile().
  const name = String(req.body?.profile_name || "").trim().slice(0, 60);
  await Profile.updateOne(
    { _id: profile._id, user: req.user.id },
    { $set: { categories: chosen, ...(name ? { name } : {}) } }
  );

  // Kept in step so the collector keeps scheduling off one field — see
  // profileService.syncUserCategories() for why this denormalisation exists.
  await syncUserCategories(req.user.id);

  // onboarded_at is stamped once and never moved, so it records when they first
  // chose rather than when they last edited. Done as an aggregation-pipeline
  // update so $ifNull can read the existing value in the same atomic operation —
  // a read-then-write would let two concurrent saves race and reset it.
  const user = await User.findOneAndUpdate(
    { _id: req.user.id },
    [{ $set: { onboarded_at: { $ifNull: ["$onboarded_at", new Date()] } } }],
    { new: true }
  );
  if (!user) return res.status(404).json({ success: false, message: "Account not found" });

  // A category they have just added may never have been collected, or may have
  // gone cold. Without this the onboarding "Continue" lands on an empty feed and
  // stays empty until the next tick.
  kickoffCategories(chosen);

  return res.json({ success: true, user: publicUser(user) });
});

/** POST /auth/logout */
router.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions());
  return res.json({ success: true });
});

// Never ship the whole Mongo document to the browser — send only what the UI draws.
function publicUser(u) {
  return {
    id: String(u._id),
    email: u.email,
    name: u.name,
    picture: u.picture,
    // The onboarding gate reads this. `onboarded` is its own flag rather than
    // categories.length so a user who clears their selection later is not sent
    // back through first-run onboarding.
    //
    // `categories` here is the UNION across every profile, not one channel's
    // list — it is what the collector schedules off. Screens that show or edit
    // what a channel covers read it from GET /profiles instead.
    categories: u.categories || [],
    onboarded: !!u.onboarded_at,
  };
}

export default router;

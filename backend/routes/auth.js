/**
 * auth.js: Google sign-in.
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
import { COOKIE_NAME, cookieOptions, readSession } from "../middleware/authenticateToken.js";
import { publicCategories, MAX_CATEGORIES } from "../services/categories.js";

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

    // Keyed on `sub`, never on email, Google accounts can change their address,
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

    return res.json({ success: true, user: publicUser(user) });
  } catch (err) {
    console.error("[auth] /google failed:", err);
    return res.status(500).json({ success: false, message: "Something went wrong signing you in." });
  }
});

/**
 * GET /auth/me, who am I? The frontend's only way to know, since the cookie is httpOnly.
 *
 * POST /auth/google runs once a fortnight. The cookie lasts 14 days, so every
 * other visit, opening the app in the morning, a new tab, a reload, arrives
 * here instead. It only answers the question: the news collector it used to
 * wake on the way is gone.
 */
router.get("/me", async (req, res) => {
  // Never cached. This used to answer 401, which nothing caches; a 200 with a
  // user object in it is exactly the kind of response a proxy or the browser's
  // heuristic WILL hold on to, and one creator being served another's identity
  // is not a bug worth risking to save a request.
  res.set("Cache-Control", "no-store");

  // ── WHY THIS IS 200 AND NOT 401 ────────────────────────────────────────────
  // Every visitor to the landing page hits this, and the honest answer for a
  // creator who has never signed in is "you are nobody yet", which is a fact,
  // not an error. Answering 401 made Chrome log a red "Failed to load resource"
  // on the front door of the product for every anonymous visit. The client
  // reads `user`, so it cannot tell the difference; the console can.
  //
  // Guarded routes are unchanged and still 401. See authenticateToken.
  const session = readSession(req, res);
  if (!session) return res.json({ success: true, user: null });

  const user = await User.findById(session.id).lean();
  if (!user) {
    // The account went away under a still-valid token (deleted, or a restore).
    // Same shape as signed out, because that is what the holder now is.
    res.clearCookie(COOKIE_NAME, cookieOptions());
    return res.json({ success: true, user: null });
  }

  return res.json({ success: true, user: publicUser(user) });
});

/**
 * GET /auth/categories, the catalogue of what a channel can cover.
 *
 * First-run onboarding (PUT /auth/categories, "name this channel and pick what
 * it covers") is gone: a new account now lands straight in the demo studio.
 * This read stays for the parked new-profile dialog
 * (src/components/Profile/NewProfileDialog.js), and it is free.
 */
router.get("/categories", (req, res) => {
  return res.json({ success: true, categories: publicCategories(), max: MAX_CATEGORIES });
});

/** POST /auth/logout */
router.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions());
  return res.json({ success: true });
});

// Never ship the whole Mongo document to the browser, send only what the UI draws.
function publicUser(u) {
  return {
    id: String(u._id),
    email: u.email,
    name: u.name,
    picture: u.picture,

    // ── WHAT KIND OF SESSION IS LOOKING ────────────────────────────────────
    // A showcase visitor holding a private link is, as far as this endpoint is
    // concerned, signed in: readSession resolves their cookie to the showcase
    // User row, so /auth/me answers with it and the app shell boots normally.
    //
    // That is the whole design. The demo is the REAL app in a restricted mode,
    // not a second implementation of it: the sidebar, the feed, the ordering
    // screen and the script writer are the ones a paying creator uses, and the
    // only difference is which controls are offered. A parallel demo UI would
    // drift from the product within a month and show prospects something we do
    // not actually sell.
    //
    // So the client branches on this one field. Nothing here is a security
    // boundary; the server already refuses a showcase session everywhere it
    // matters (see middleware/authenticateToken.js). This decides what to DRAW.
    kind: u.kind || "human",
    showcase: u.kind === "showcase"
      ? {
          display_name: u.showcase?.display_name || u.name || "",
          slug: u.showcase?.slug || "",
        }
      : null,
  };
}

export default router;

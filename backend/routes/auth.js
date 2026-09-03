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
import authenticateToken, { COOKIE_NAME, cookieOptions } from "../middleware/authenticateToken.js";

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

/** GET /auth/me — who am I? The frontend's only way to know, since the cookie is httpOnly. */
router.get("/me", authenticateToken, async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  if (!user) {
    res.clearCookie(COOKIE_NAME, cookieOptions());
    return res.status(401).json({ success: false, message: "Account not found" });
  }
  return res.json({ success: true, user: publicUser(user) });
});

/** POST /auth/logout */
router.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions());
  return res.json({ success: true });
});

// Never ship the whole Mongo document to the browser — send only what the UI draws.
function publicUser(u) {
  return { id: String(u._id), email: u.email, name: u.name, picture: u.picture };
}

export default router;

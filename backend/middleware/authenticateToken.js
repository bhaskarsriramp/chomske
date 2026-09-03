/**
 * authenticateToken.js — reads our own session JWT from the httpOnly cookie.
 *
 * The cookie is httpOnly on purpose: JS on the page can't read it, so an XSS bug
 * can't walk off with a session. That also means the frontend can never "check if
 * logged in" locally — it asks GET /auth/me instead, which is the intended flow.
 */
import jwt from "jsonwebtoken";

export const COOKIE_NAME = "hinglish_token";

export default function authenticateToken(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ success: false, message: "Not signed in" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email };
    return next();
  } catch {
    // Expired or tampered — clear it so the browser stops sending a dead cookie.
    res.clearCookie(COOKIE_NAME, cookieOptions());
    return res.status(401).json({ success: false, message: "Session expired. Please sign in again." });
  }
}

/**
 * Shared cookie settings — the single source of truth for set AND clear.
 * They must match exactly or clearCookie silently fails to remove anything.
 */
export function cookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  const domain = (process.env.COOKIE_DOMAIN || "").trim();
  return {
    httpOnly: true,
    // SameSite=None requires Secure, and Secure requires HTTPS — which localhost
    // isn't. So dev uses Lax over http, production uses None over https.
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    // A domain of "localhost" is invalid and makes the browser drop the cookie
    // without telling you. Only ever set it when one is genuinely configured.
    ...(domain ? { domain } : {}),
    path: "/",
    maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days, matching the JWT below
  };
}

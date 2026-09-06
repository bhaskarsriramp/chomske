/**
 * authenticateToken.js: reads our own session JWT from the httpOnly cookie.
 *
 * The cookie is httpOnly on purpose: JS on the page can't read it, so an XSS bug
 * can't walk off with a session. That also means the frontend can never "check if
 * logged in" locally, it asks GET /auth/me instead, which is the intended flow.
 */
import jwt from "jsonwebtoken";

export const COOKIE_NAME = "hinglish_token";

/**
 * Read the session cookie WITHOUT deciding what absence means.
 *
 * Split out of the middleware because exactly one route disagrees about what
 * "no session" is. For every guarded route it is a refusal, and 401 is right.
 * For GET /auth/me it is the answer: that endpoint's whole job is to report
 * session state, and "signed out" is a state, not a failure. Answering it with
 * 401 made every anonymous landing-page visit log a red error in the console,
 * which is both untrue and the kind of noise that hides real errors.
 *
 * Returns { id, email } or null. Clears a cookie that is expired or tampered,
 * so the browser stops sending a dead one on every subsequent request.
 */
export function readSession(req, res) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return { id: payload.sub, email: payload.email };
  } catch {
    res.clearCookie(COOKIE_NAME, cookieOptions());
    return null;
  }
}

export default function authenticateToken(req, res, next) {
  // Read before readSession can clear it: the difference between "you never had
  // a session" and "yours expired" is the difference between silence and a
  // message worth showing, and only the presence of the cookie tells them apart.
  const had = Boolean(req.cookies?.[COOKIE_NAME]);
  const user = readSession(req, res);

  if (!user) {
    return res.status(401).json({
      success: false,
      message: had ? "Session expired. Please sign in again." : "Not signed in",
    });
  }

  req.user = user;
  return next();
}

/**
 * Shared cookie settings, the single source of truth for set AND clear.
 * They must match exactly or clearCookie silently fails to remove anything.
 */
export function cookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  const domain = (process.env.COOKIE_DOMAIN || "").trim();
  return {
    httpOnly: true,
    // SameSite=None requires Secure, and Secure requires HTTPS, which localhost
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

/**
 * authenticateToken.js: reads our own session JWT from the httpOnly cookie.
 *
 * The cookie is httpOnly on purpose: JS on the page can't read it, so an XSS bug
 * can't walk off with a session. That also means the frontend can never "check if
 * logged in" locally, it asks GET /auth/me instead, which is the intended flow.
 */
import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const COOKIE_NAME = "hinglish_token";

/**
 * ── TWO KINDS OF SESSION IN ONE COOKIE ───────────────────────────────────────
 * A "human" session is somebody who signed in with Google and owns their data.
 * A "showcase" session is a visitor holding a private outreach link: they are
 * acting AS a showcase User row that an admin built for them, and they never
 * authenticated at all. The link is the whole credential.
 *
 * That difference is enforced by DEFAULT DENY. `authenticateToken` refuses a
 * showcase session, so every one of the ~25 existing guarded routes stays
 * closed to it without being touched, and the handful that should open must say
 * so explicitly by using `authenticateAny`. The inverse, a deny-list of routes
 * showcases cannot reach, would mean every route added later is open until
 * somebody remembers it should not be, and the failure is silent: a stranger
 * spending credits or mutating a demo, with no error anywhere.
 */
export const SHOWCASE_SESSION_DAYS = parseInt(process.env.SHOWCASE_SESSION_DAYS || "7", 10);

/** Mint the ordinary 14-day session for a signed-in account. */
export function signHumanSession(user) {
  return jwt.sign(
    { sub: String(user._id), email: user.email, kind: "human" },
    process.env.JWT_SECRET,
    { expiresIn: "14d" }
  );
}

/**
 * Mint a scoped session for someone holding a share link.
 *
 * Shorter-lived than a real session because it is handed out by a URL rather
 * than earned by signing in, and because the link can always mint another. The
 * visitor id rides along so ShowcaseVisit can tell one browser from the next
 * without anything being asked of the person.
 */
export function signShowcaseSession(showcaseUserId, visitorId) {
  return jwt.sign(
    { sub: String(showcaseUserId), kind: "showcase", vid: String(visitorId) },
    process.env.JWT_SECRET,
    { expiresIn: `${SHOWCASE_SESSION_DAYS}d` }
  );
}

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
    return {
      id: payload.sub,
      email: payload.email || "",
      // Absent on every token minted before showcases existed, and those are
      // all human. Defaulting the other way would silently downgrade every
      // live session the moment this deploys.
      kind: payload.kind === "showcase" ? "showcase" : "human",
      visitor_id: payload.vid || "",
    };
  } catch {
    res.clearCookie(COOKIE_NAME, cookieOptions());
    return null;
  }
}

/**
 * The strict guard: a signed-in human, and nothing else.
 *
 * Every route that existed before showcases keeps using this and therefore
 * keeps refusing them, with no edit and no chance of one being missed.
 */
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

  // 403, not 401: the session is perfectly valid, it is simply not allowed
  // here. A 401 would tell the client to go and re-authenticate, and a showcase
  // visitor has nothing to re-authenticate WITH, so it would loop.
  if (user.kind === "showcase") {
    return res.status(403).json({
      success: false,
      code: "showcase_scope",
      message: "Create an account to do that.",
    });
  }

  req.user = user;
  return next();
}

/**
 * The permissive guard: a human OR someone holding a share link.
 *
 * Used on exactly the routes a showcase visitor needs to experience the
 * product: read the feed, read the voice, price a script, generate one, read it
 * back. Handlers can branch on `req.user.kind` where the two differ, and every
 * one of them is already scoped by `req.user.id`, which for a showcase is the
 * showcase's own row. So the data boundary is the same boundary as always.
 */
export function authenticateAny(req, res, next) {
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
 * Admin only.
 *
 * Reads the flag from the database on every request rather than trusting a
 * claim in the token. A token is valid for fourteen days; revoking somebody's
 * admin rights has to take effect on the next request, not a fortnight later.
 */
export async function requireAdmin(req, res, next) {
  const user = readSession(req, res);
  if (!user || user.kind !== "human") {
    return res.status(401).json({ success: false, message: "Not signed in" });
  }

  try {
    const row = await User.findById(user.id).select("admin kind").lean();
    if (!row?.admin || row.kind !== "human") {
      // Deliberately the same answer as a missing route. An endpoint that says
      // "you are not an admin" has confirmed the endpoint exists.
      return res.status(404).json({ success: false, message: "Not found" });
    }
  } catch {
    return res.status(500).json({ success: false, message: "Something went wrong." });
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

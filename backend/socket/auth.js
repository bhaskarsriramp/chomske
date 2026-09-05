/**
 * socket/auth.js — who is on the other end of this socket.
 *
 * ── WHY THIS DOES NOT LOOK LIKE THE REFERENCE PROJECT'S ──────────────────────
 * betaFounderProduction reads its token from `handshake.auth.token`, because it
 * keeps the JWT in localStorage and hands it to the client explicitly. This one
 * cannot: the session is an httpOnly cookie (see middleware/authenticateToken.js)
 * and page JS is not allowed to read it — that is the whole point of httpOnly,
 * and giving it up to make the socket handshake tidier would trade a real XSS
 * defence for a shorter file.
 *
 * The browser sends the cookie on the handshake by itself as long as the client
 * connects `withCredentials` and the origin is in the CORS list, so the token is
 * already here in the headers. It just has to be parsed rather than read.
 */
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { COOKIE_NAME } from "../middleware/authenticateToken.js";
import { isValidCategory } from "../services/categories.js";

/**
 * Pull one cookie out of a raw Cookie header.
 *
 * Hand-rolled rather than pulling in `cookie`: this is one value out of a
 * semicolon list, the dependency would exist for a four-line function, and
 * cookie-parser only runs on Express requests — a socket handshake never passes
 * through the middleware stack.
 */
function readCookie(header, name) {
  if (!header) return "";
  for (const part of String(header).split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return part.slice(eq + 1).trim();
    }
  }
  return "";
}

/**
 * Socket.IO handshake middleware.
 *
 * Loads the account's categories here, once, rather than trusting whatever the
 * client later asks to subscribe to. A room is the only thing standing between
 * one creator's feed and another's, so which rooms this socket may enter is a
 * server-side fact — see socket/index.js.
 */
export async function socketAuth(socket, next) {
  try {
    const token = readCookie(socket.handshake.headers?.cookie, COOKIE_NAME);
    if (!token) return next(new Error("AUTH_REQUIRED"));

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Only the two fields the socket layer actually uses. `categories` is the
    // denormalised copy the collector already schedules from — see
    // profileService.syncUserCategories() for why it exists.
    const user = await User.findById(payload.sub).select("_id categories").lean();
    if (!user) return next(new Error("USER_NOT_FOUND"));

    socket.user = {
      id: String(user._id),
      categories: (user.categories || []).filter(isValidCategory),
    };
    return next();
  } catch (err) {
    // Expired cookies are the common case and are not worth a stack trace: a
    // 14-day session ending is ordinary, and the client reconnects after the
    // next sign-in.
    console.warn("[socket] auth refused:", err.message);
    return next(new Error("AUTH_INVALID"));
  }
}

export default socketAuth;

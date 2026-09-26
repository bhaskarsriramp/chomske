/**
 * dbDropout.js: what a request answers when the database dropped out under it.
 *
 * ── A FAILURE DURING A DATABASE DROPOUT SAYS SO ──────────────────────────────
 * Thirty-odd routes catch their own errors and answer 500 "Something went
 * wrong", which is right for a bug and wrong for the few seconds the shared
 * Atlas cluster drops out (db.js): the request was fine and will work if sent
 * again. While db.js knows of a dropout (no primary now, or one in the last
 * minute) a 5xx answer becomes 503 with Retry-After and a sentence that says
 * what happened. The browser retries a GET that gets one (src/api.js), so a
 * page load mostly rides through it without the creator seeing anything.
 */
import { dbUnreachable, dbTrouble, noteDbFault } from "../db.js";

export const DB_BUSY = "We lost our connection to the database for a moment. Please try again in a few seconds.";
const busy = (body) => ({ ...(body && typeof body === "object" ? body : {}), success: false, message: DB_BUSY, db_unavailable: true });

/**
 * A route's error can arrive a few milliseconds BEFORE the driver has noticed
 * the database is gone: at the instant of a cut, the request fails on a dead
 * socket and the "no primary" event follows. Measured, the 500 went out first.
 * So a 5xx that finds no dropout on record waits this long and looks again.
 * Only failures pay it; a healthy request never reaches this line.
 */
const SECOND_LOOK_MS = 250;

/** Early in the chain: rewrites a route's own 5xx answer while a dropout is on. */
export function dbDropoutAnswers(req, res, next) {
  const json = res.json.bind(res);
  const send = (body) => {
    // Something answered during the second look; the first answer stands.
    if (res.headersSent) return res;
    if (dbTrouble()) {
      res.status(503).set("Retry-After", "3");
      return json(busy(body));
    }
    return json(body);
  };
  res.json = (body) => {
    if (res.statusCode < 500 || res.statusCode === 503) return json(body);
    if (dbTrouble()) return send(body);
    setTimeout(() => send(body), SECOND_LOOK_MS);
    return res;
  };
  next();
}

/**
 * For the error handler: answers 503 and returns true when the error was a
 * dropout, logging one line rather than the page of topology the driver
 * attaches to it. Returns false for anything else.
 */
export function answeredDbDropout(err, req, res) {
  if (!dbUnreachable(err)) return false;
  noteDbFault(err);
  console.warn(`[server] ${req.method} ${req.path}: database unreachable (${err.name}: ${String(err.message).split("\n")[0].slice(0, 160)})`);
  res.status(503).set("Retry-After", "3").json(busy());
  return true;
}

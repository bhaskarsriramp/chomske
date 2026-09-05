/**
 * newsEvents.js — telling the browser something happened, from wherever it did.
 *
 * ── THE PROBLEM ──────────────────────────────────────────────────────────────
 * The work a creator is waiting on does not happen in the request they are
 * waiting on. Ranking is fired from a sign-in kickoff, a stale feed and a button
 * press; briefs run on after the response has already gone. Under plain HTTP the
 * only way to learn any of that finished is to ask again, so a creator either
 * watched a spinner until the slowest part of the pass was done, or found out on
 * their next page load.
 *
 * ── WHY THIS IS A PUBLISH AND NOT AN EMIT ────────────────────────────────────
 * The ranker has no idea which sockets exist, and it must not: it runs on the
 * scheduler's tick as readily as inside a request, and on a different instance
 * from the browser it needs to reach as soon as there is more than one. So the
 * services publish FACTS to Redis, socket/index.js subscribes on every instance,
 * and each one delivers to whichever sockets it happens to be holding. Same
 * shape as the reference project's inbox fan-out, one channel instead of a
 * pattern — there are a handful of categories, not a conversation per founder.
 *
 * Without Redis (REDIS_DISABLED, local development) the publish falls back to
 * emitting straight into this process, which is correct for the one-instance
 * case and is exactly the case that runs without Redis.
 *
 * Nothing here ever throws. A dropped event costs a creator a few seconds until
 * their next read; a throw would cost the ranking pass it was reporting on.
 */
import redis from "../redis.js";

export const NEWS_CHANNEL = "hg:news:events";

// Registered by socket/index.js at boot. Null on any process without a socket
// server — a script, a migration — where publishing is a no-op rather than an
// error.
let deliver = null;

/** Called once by the socket server: "send events to me". */
export function onNewsEvent(fn) {
  deliver = typeof fn === "function" ? fn : null;
}

/**
 * Announce something a waiting feed would want to know.
 *
 * @param {object} event           must carry `type` and `category`
 * @param {string} event.type      "news:ranked" | "news:brief"
 * @param {string} event.category  the room this belongs to
 */
export async function publishNewsEvent(event) {
  if (!event?.type || !event?.category) return;

  const payload = { ...event, at: new Date().toISOString() };

  if (redis) {
    try {
      await redis.publish(NEWS_CHANNEL, JSON.stringify(payload));
      return;
    } catch {
      // Fall through: better to reach this instance's own sockets than nobody's.
    }
  }

  try {
    deliver?.(payload);
  } catch (err) {
    console.warn("[news-events] local delivery failed:", err.message);
  }
}

export default { publishNewsEvent, onNewsEvent, NEWS_CHANNEL };

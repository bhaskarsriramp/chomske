/**
 * redis.js — the one Redis connection for the process.
 *
 * Same shape as the reference project's src/realtime/redis.js: a single module
 * owns the client, and every other file imports this default rather than
 * constructing its own. One connection, one place to change the host, and no
 * chance of two modules disagreeing about which instance they are talking to.
 *
 * ── THIS IS A SHARED INSTANCE ────────────────────────────────────────────────
 * The same GCP Memorystore node serves betaFounderProduction. One Redis, one
 * keyspace, two applications — so every key this project writes MUST carry the
 * `hg:` prefix (see utils/limiter.js). Without it, a name that happens to match
 * one of the other project's keys silently corrupts its counters, and the symptom
 * would surface over there as a rate limiter behaving strangely for no local
 * reason. Prefix anything new you add here.
 *
 * The two projects' cooldowns are deliberately NOT shared, even though both call
 * apidirect. Sharing would let one app's cooldown bug disable the other's API
 * access, and the only thing it buys is skipping a single 401 to discover a key
 * is out of credit. Isolation is worth more than one saved request.
 *
 * ── ONE DELIBERATE DIFFERENCE FROM THE REFERENCE ─────────────────────────────
 * `enableOfflineQueue: false`. The reference client queues commands while it is
 * disconnected, which is why its clients HANG instead of erroring when Redis is
 * unreachable — the documented behaviour outside the VPC, and a well-known pain
 * during local development. With the queue off, a command against a dead Redis
 * rejects in about a millisecond, and every caller here already treats a Redis
 * failure as "fall back to in-process". On the VM, where Redis is reachable,
 * behaviour is identical; off the VM the app degrades instead of stalling.
 */
import Redis from "ioredis";

// The Memorystore private IP — the same node betaFounderProduction uses.
// Reachable only from inside the VPC. REDIS_HOST overrides it without a deploy.
const HOST = String(process.env.REDIS_HOST || "10.3.176.99").trim();
const PORT = parseInt(process.env.REDIS_PORT || "6379", 10);

// The host above is a VPC-private address, so off the VM it is unreachable by
// definition. REDIS_DISABLED skips the client entirely for local development —
// without it, ioredis reconnects forever and buries real errors under a wall of
// ETIMEDOUT. Requests still work either way; this only quiets the logs.
const DISABLED = String(process.env.REDIS_DISABLED || "").toLowerCase() === "true";

let client = null;

if (DISABLED) {
  console.log("[redis] disabled (REDIS_DISABLED=true) — limits held in-process");
} else {
  client = new Redis({
    host: HOST,
    port: PORT,
    ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
    // Finite, unlike the reference project's `null` (retry forever): a request
    // waiting on a dead Redis is worse than one that fails and falls back.
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    enableOfflineQueue: false,
    connectTimeout: 5000,
    lazyConnect: false,
    // Back off to 10s between attempts so an outage reconnects promptly but a
    // permanently unreachable host doesn't spin.
    retryStrategy: (times) => Math.min(times * 500, 10000),
  });

  client.on("connect", () => console.log(`[redis] connected → ${HOST}:${PORT}`));

  // Logged, never thrown. An unhandled 'error' on an ioredis client takes the
  // process down, and Redis being unavailable must never stop the API serving.
  // Throttled because a dead host emits one of these per retry forever, and the
  // twentieth copy of the same message only hides the next real problem.
  let errCount = 0;
  let lastErrLog = 0;
  client.on("error", (err) => {
    errCount++;
    const now = Date.now();
    if (errCount === 1 || now - lastErrLog > 60000) {
      lastErrLog = now;
      console.error(
        `[redis] error: ${err.message}` +
        (errCount > 1 ? ` (${errCount} since start; set REDIS_DISABLED=true for local dev)` : "")
      );
    }
  });
}

export const isRedisEnabled = () => !!client;

export default client;

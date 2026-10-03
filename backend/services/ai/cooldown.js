/**
 * cooldown.js: a named budget put to sleep, shared by every process.
 *
 * Moved out of provider.js so the key pool (aistudioPool.js) and the model
 * client (provider.js) read and write the same rests: a key the client found
 * rate limited is one the pool will not hand out, in this process and, through
 * Redis, in every other.
 *
 * ── ONE WORKER'S 429 IS EVERY WORKER'S 429 ──────────────────────────────────
 * The quota belongs to the project, not to the request that happened to hit it.
 * Without this, four concurrent workers each discover the closed window
 * separately, each burns its own attempts, and the retries land together and
 * close it again. Marking the bucket means the other three wait before they
 * ask, and through Redis it means the other processes do too.
 */
import redis from "../../redis.js";

const CKEY = (bucket) => "hg:ai:cool:" + bucket;
const _cool = new Map();

/** Milliseconds left on this bucket's rest, or 0. */
export async function coolingFor(bucket) {
  const until = _cool.get(bucket) || 0;
  const local = Math.max(0, until - Date.now());
  if (!redis) return local;
  try {
    const ttl = await redis.pttl(CKEY(bucket));
    return Math.max(local, ttl > 0 ? ttl : 0);
  } catch {
    return local;
  }
}

/**
 * Put a bucket to sleep for `ms`. A longer rest already set stands (a daily
 * limit is not cut short by a later per-minute one); `extend` replaces a
 * shorter one in Redis too.
 */
export async function cool(bucket, ms, { extend = false } = {}) {
  const until = Date.now() + ms;
  _cool.set(bucket, Math.max(_cool.get(bucket) || 0, until));
  if (!redis) return;
  try {
    if (extend) {
      const ttl = await redis.pttl(CKEY(bucket));
      if (!(ttl > ms)) await redis.set(CKEY(bucket), "1", "PX", Math.ceil(ms));
    } else {
      await redis.set(CKEY(bucket), "1", "PX", Math.ceil(ms), "NX");
    }
  } catch {
    /* Redis being unavailable must never stop a request; the local map holds. */
  }
}

export default { coolingFor, cool };

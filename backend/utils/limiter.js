/**
 * limiter.js: concurrency slots and cooldowns for external API keys.
 *
 * Backed by the shared Redis client (backend/redis.js) so limits hold across
 * processes, exactly as the reference project's apiRateLimiter.js does. Redis is
 * imported once from that module rather than connected here, one connection for
 * the process, one place that knows the host.
 *
 * ── REDIS DOWN MEANS DEGRADED, NEVER BROKEN ──────────────────────────────────
 * Every Redis call below is wrapped and falls through to an in-process counter on
 * failure. That matters because these limits guard a paid API: if Redis is
 * unreachable the correct behaviour is to keep serving with slightly weaker
 * coordination, not to fail every request. With one server the in-process path is
 * exactly as correct anyway, Redis only starts earning its place at two.
 */
import redis, { isRedisEnabled } from "../redis.js";

// ── Cooldowns ────────────────────────────────────────────────────────────────
// A cooled key is skipped by rotation until its deadline passes.

const _cooldowns = new Map(); // key -> epoch ms when it expires

export async function setCooldown(service, keyId, ms) {
  const k = `hg:cooldown:${service}:${keyId}`;
  _cooldowns.set(k, Date.now() + Math.max(0, ms));   // always kept locally too
  if (!isRedisEnabled()) return;
  try {
    await redis.set(k, "1", "PX", Math.max(1, ms));
  } catch (err) {
    console.warn("[limiter] redis setCooldown failed, using in-process:", err.message);
  }
}

export async function cooldownRemainingMs(service, keyId) {
  const k = `hg:cooldown:${service}:${keyId}`;
  if (isRedisEnabled()) {
    try {
      const ttl = await redis.pttl(k);
      if (ttl > 0) return ttl;
      // -2 = no such key. Trust that over the local map so a cooldown cleared in
      // Redis isn't kept alive by this process's stale copy.
      if (ttl === -2) { _cooldowns.delete(k); return 0; }
    } catch (err) {
      console.warn("[limiter] redis pttl failed, using in-process:", err.message);
    }
  }
  const until = _cooldowns.get(k) || 0;
  const left = until - Date.now();
  if (left <= 0) { _cooldowns.delete(k); return 0; }
  return left;
}

// ── Concurrency slots ────────────────────────────────────────────────────────
// apidirect's documented limit is concurrency per (endpoint, key), not requests
// per minute, so this counts in-flight calls, it does not meter a rate.

const _inflight = new Map(); // service -> count

export class NoSlotError extends Error {
  constructor(service) {
    super(`[${service}] no free concurrency slot`);
    this.name = "NoSlotError";
  }
}

function takeLocal(service, max) {
  const cur = _inflight.get(service) || 0;
  if (cur >= max) throw new NoSlotError(service);
  _inflight.set(service, cur + 1);
  let released = false;
  return {
    release: async () => {
      if (released) return;
      released = true;
      _inflight.set(service, Math.max(0, (_inflight.get(service) || 1) - 1));
    },
  };
}

/**
 * Take one slot, or throw NoSlotError immediately when the cap is reached.
 * Deliberately does not wait: callers rotate to a different key, and queueing on
 * a busy key while an idle key exists is strictly worse.
 *
 * @returns {{ release: () => Promise<void> }}
 */
export async function acquireSlot(service, max) {
  if (!isRedisEnabled()) return takeLocal(service, max);

  const k = `hg:conc:${service}`;
  let n;
  try {
    n = await redis.incr(k);
    // TTL every time, not just on the first increment: without it a counter
    // orphaned by a crash between INCR and EXPIRE would never expire, and that
    // key's slots would be permanently consumed.
    await redis.expire(k, 60);
  } catch (err) {
    console.warn("[limiter] redis incr failed, using in-process:", err.message);
    return takeLocal(service, max);
  }

  if (n > max) {
    await redis.decr(k).catch(() => {});
    throw new NoSlotError(service);
  }

  let released = false;
  return {
    release: async () => {
      if (released) return;
      released = true;
      await redis.decr(k).catch(() => {});
    },
  };
}

/**
 * Take one unit from a per-key REQUESTS-PER-WINDOW budget.
 *
 * ── WHY THIS IS NOT acquireSlot ─────────────────────────────────────────────
 * acquireSlot caps how many calls run AT ONCE, which is what apidirect limits.
 * TinyFish limits how many run PER MINUTE, and the two need opposite shapes: a
 * concurrency slot is given back when the call finishes, a rate unit is not
 * given back at all, it expires with the window.
 *
 * Fixed window rather than sliding: a sliding window needs a sorted set and a
 * cleanup pass per call, and the failure mode of a fixed window here is allowing
 * a brief double burst across a boundary, which TinyFish answers with a 429 that
 * the caller already handles by rotating.
 *
 * @param {string} service   bucket name, e.g. "tinyfish"
 * @param {string} keyId     the key this budget belongs to
 * @param {number} limit     units per window
 * @param {number} windowSec window length in seconds
 * @param {number} count     units to take, since one request can carry several URLs
 * @returns {Promise<boolean>} false when the budget for this window is spent
 */
export async function takeRate(service, keyId, limit, windowSec, count = 1) {
  const bucket = Math.floor(Date.now() / (windowSec * 1000));
  const k = `hg:rate:${service}:${keyId}:${bucket}`;

  if (!isRedisEnabled()) {
    const cur = (_rateLocal.get(k) || 0) + count;
    if (cur > limit) return false;
    _rateLocal.set(k, cur);
    // Bounded: one entry per key per window, and old windows are dropped on the
    // next call rather than by a timer.
    if (_rateLocal.size > 200) {
      for (const key of _rateLocal.keys()) {
        if (key !== k) _rateLocal.delete(key);
      }
    }
    return true;
  }

  try {
    const n = await redis.incrby(k, count);
    // Set every time, for the same reason acquireSlot does: a counter orphaned
    // between INCR and EXPIRE would hold its budget for ever.
    await redis.expire(k, windowSec * 2);
    if (n > limit) return false;
    return true;
  } catch (err) {
    // Fail OPEN. This is a politeness limit on a free endpoint, not a spend
    // guard, and refusing to fetch because Redis blinked would break script
    // generation over a rate limit nobody was near.
    console.warn("[limiter] rate check failed, allowing:", err.message);
    return true;
  }
}

const _rateLocal = new Map();

export default { setCooldown, cooldownRemainingMs, acquireSlot, takeRate, NoSlotError };

/**
 * limiter.js — concurrency slots and cooldowns for external API keys.
 *
 * ── WHY THIS IS IN-PROCESS BY DEFAULT, NOT REDIS ─────────────────────────────
 * The reference project coordinates through Redis because it runs several pods
 * and a shared counter is the only way they can respect "3 concurrent per key".
 * Hinglish runs as ONE pm2 process on one VM, so an in-process counter is exactly
 * as correct and has no infrastructure to be down.
 *
 * It also cannot hang. That project's Redis lives on a hardcoded GCP Memorystore
 * private IP, and an unreachable Redis makes ioredis wait rather than fail — the
 * documented reason its clients hang instead of erroring outside that VPC. A
 * shared counter is not worth turning every duration check into a 30-second stall.
 *
 * REDIS_URL is the upgrade path. Set it and this switches to a Redis-backed
 * counter that works across pods; leave it unset and ioredis is never imported,
 * so a missing or unreachable Redis cannot affect anything.
 */

const REDIS_URL = String(process.env.REDIS_URL || "").trim();

let _redis = null;
let _redisTried = false;

/** Lazily connect, and only when explicitly configured. Never throws. */
async function redis() {
  if (!REDIS_URL) return null;
  if (_redisTried) return _redis;
  _redisTried = true;
  try {
    const { default: Redis } = await import("ioredis");
    _redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 2,
      // Fail fast rather than queueing forever — the whole point of the fallback.
      connectTimeout: 3000,
      enableOfflineQueue: false,
      lazyConnect: false,
    });
    _redis.on("error", (err) => console.error("[limiter] redis error:", err.message));
    console.log("[limiter] using Redis for cross-process limits");
  } catch (err) {
    console.error("[limiter] Redis unavailable, falling back in-process:", err.message);
    _redis = null;
  }
  return _redis;
}

// ── Cooldowns ────────────────────────────────────────────────────────────────
// A cooled key is skipped by rotation until its deadline passes.

const _cooldowns = new Map(); // key -> epoch ms when it expires

export async function setCooldown(service, keyId, ms) {
  const k = `cooldown:${service}:${keyId}`;
  const until = Date.now() + Math.max(0, ms);
  _cooldowns.set(k, until);
  const r = await redis();
  if (r) await r.set(k, "1", "PX", Math.max(1, ms)).catch(() => {});
}

export async function cooldownRemainingMs(service, keyId) {
  const k = `cooldown:${service}:${keyId}`;
  const r = await redis();
  if (r) {
    const ttl = await r.pttl(k).catch(() => -2);
    if (ttl > 0) return ttl;
  }
  const until = _cooldowns.get(k) || 0;
  const left = until - Date.now();
  if (left <= 0) { _cooldowns.delete(k); return 0; }
  return left;
}

// ── Concurrency slots ────────────────────────────────────────────────────────
// apidirect's documented limit is concurrency per (endpoint, key), not requests
// per minute — so this counts in-flight calls, it does not meter a rate.

const _inflight = new Map(); // service -> count

export class NoSlotError extends Error {
  constructor(service) {
    super(`[${service}] no free concurrency slot`);
    this.name = "NoSlotError";
  }
}

/**
 * Take one slot, or throw NoSlotError immediately when the cap is reached.
 * Callers rotate to another key rather than queueing, which is why this does not
 * wait: waiting on a busy key while an idle key exists is strictly worse.
 *
 * @returns {{ release: () => Promise<void> }}
 */
export async function acquireSlot(service, max) {
  const r = await redis();
  if (r) {
    const n = await r.incr(`conc:${service}`).catch(() => 0);
    if (n === 1) await r.expire(`conc:${service}`, 60).catch(() => {});
    if (n > max) {
      await r.decr(`conc:${service}`).catch(() => {});
      throw new NoSlotError(service);
    }
    let released = false;
    return {
      release: async () => {
        if (released) return;
        released = true;
        await r.decr(`conc:${service}`).catch(() => {});
      },
    };
  }

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

export default { setCooldown, cooldownRemainingMs, acquireSlot, NoSlotError };

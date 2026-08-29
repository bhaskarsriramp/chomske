// Redis-backed rate limiter for external API calls (currently: Gemini AI Studio).
//
// Trimmed port of betaFounderProduction's backend/utils/apiRateLimiter.js — keeps
// only the sliding-window limiter + 429 handling that chomske's single low-volume
// call site needs. The concurrency limiter, key-exhaustion tracking, leader
// election and observability snapshots from the source file have no caller here.
//
// Redis key layout:
//   rl:api:{service}:key:{keyId}:bucket   sorted-set: granted-slot timestamps (score=ms)
//   rl:cooldown:{service}:{keyId}         string "1" with PX = retry-after ms
//
// Failure modes are explicit:
//   - Redis down  → fail-open (allow the call, log the error)
//   - 429 seen    → write cooldown so future calls skip this key
//   - Queue wait  → caller passes maxWaitMs; exceeded → QueueTimeoutError
//   - All keys cool → caller passes onAllCooled ("wait" | "fail")

import redis from "../../src/realtime/redis.js";

// ─── Error classes ──────────────────────────────────────────────────────────

export class RateLimitedError extends Error {
  constructor(service, keyId, retryAfterMs) {
    super(`[${service}] Key ${keyId} returned 429 (retry in ${retryAfterMs}ms)`);
    this.name = "RateLimitedError";
    this.service = service;
    this.keyId = keyId;
    this.retryAfterMs = retryAfterMs;
    this.retryable = true;
  }
}

export class AllKeysCooledError extends Error {
  constructor(service, retryAfterMs) {
    super(`[${service}] All candidate keys are in cooldown (shortest retry ${retryAfterMs}ms)`);
    this.name = "AllKeysCooledError";
    this.service = service;
    this.retryAfterMs = retryAfterMs;
    this.retryable = true;
  }
}

export class QueueTimeoutError extends Error {
  constructor(service, waitedMs) {
    super(`[${service}] Queue timeout after ${waitedMs}ms`);
    this.name = "QueueTimeoutError";
    this.service = service;
    this.waitedMs = waitedMs;
    this.retryable = false;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, Math.max(0, ms))); }

// Add ±15% jitter so concurrent waiters do not wake at the same instant.
function jitter(ms) { return Math.round(ms * (0.85 + Math.random() * 0.3)); }

function shuffle(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Detect 429 across SDK shapes: fetch Response, axios err, Gemini SDK err.
export function is429(err) {
  const status = err?.status || err?.httpStatusCode || err?.code
    || err?.response?.status || err?.statusCode || 0;
  if (status === 429) return true;
  const msg = err?.message || err?.toString?.() || "";
  return /\b429\b|RESOURCE_EXHAUSTED|rate.?limit|quota.?(?:exceed|exhaust)|too.?many.?requests/i.test(msg);
}

// Try to read a retry-after hint from common error shapes. Returns ms or null.
export function extractRetryAfterMs(err) {
  const headers = err?.response?.headers || err?.headers || err?.responseHeaders;
  if (headers) {
    let ra;
    if (typeof headers.get === "function") {
      ra = headers.get("retry-after");
    } else if (typeof headers === "object") {
      ra = headers["retry-after"] || headers["Retry-After"];
    }
    if (ra) {
      const n = parseInt(ra, 10);
      if (!Number.isNaN(n) && n > 0) return n * 1000;
    }
  }

  // Gemini error body — "retryDelay": "23s"
  const msg = err?.message || err?.toString?.() || "";
  const m = msg.match(/retryDelay["'\s:]+(\d+(?:\.\d+)?)s/i);
  if (m) return Math.round(parseFloat(m[1]) * 1000);

  const body = err?.response?.data || err?.body || err?.errorInfo;
  if (body?.retry_after) {
    const n = parseFloat(body.retry_after);
    if (!Number.isNaN(n)) return n * 1000;
  }

  return null;
}

// ─── Lua: multi-key sliding window + min-gap + cooldown check ───────────────
//
// Walks candidate buckets in order. For each:
//   1. If cooldown key has PTTL > 0, skip (record shortest cooldown).
//   2. Expire old entries beyond windowMs.
//   3. If min-gap not yet elapsed since the last grant, skip.
//   4. If at capacity, skip.
//   5. Otherwise, ZADD and return the winning index.
//
// Returns: { ok, keyIndex (1-based), retryAfterMs, allCooled }

const ACQUIRE_SCRIPT = `
local n = #KEYS
local now      = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local limit    = tonumber(ARGV[3])
local minGapMs = tonumber(ARGV[4])
local member   = ARGV[5]

local minRetry = -1
local coolCount = 0

for i = 1, n do
  local bucket = KEYS[i]
  local coolKey = ARGV[5 + i]

  local pttl = redis.call('PTTL', coolKey)
  if pttl > 0 then
    coolCount = coolCount + 1
    if minRetry < 0 or pttl < minRetry then minRetry = pttl end
  else
    redis.call('ZREMRANGEBYSCORE', bucket, 0, now - windowMs)

    local gapWait = 0
    if minGapMs > 0 then
      local last = redis.call('ZRANGE', bucket, -1, -1, 'WITHSCORES')
      if last[2] then
        local diff = now - tonumber(last[2])
        if diff < minGapMs then gapWait = minGapMs - diff end
      end
    end

    if gapWait > 0 then
      if minRetry < 0 or gapWait < minRetry then minRetry = gapWait end
    else
      local count = redis.call('ZCARD', bucket)
      if count >= limit then
        local oldest = redis.call('ZRANGE', bucket, 0, 0, 'WITHSCORES')
        local oldestScore = tonumber(oldest[2]) or now
        local wait = windowMs - (now - oldestScore) + 50
        if wait < 50 then wait = 50 end
        if minRetry < 0 or wait < minRetry then minRetry = wait end
      else
        redis.call('ZADD', bucket, now, member)
        redis.call('PEXPIRE', bucket, windowMs * 2)
        return {1, i, 0, 0}
      end
    end
  end
end

if minRetry < 0 then minRetry = 1000 end
local allCooled = 0
if coolCount == n then allCooled = 1 end
return {0, 0, minRetry, allCooled}
`;

// ─── Core acquire ───────────────────────────────────────────────────────────

async function acquireGlobalSlot({ service, candidateKeys, limit, windowMs, minGapMs = 0 }) {
  if (!candidateKeys?.length) {
    return { ok: false, keyId: null, retryAfterMs: 1000, allCooled: false };
  }

  const order = shuffle(candidateKeys);
  const bucketKeys = order.map(k => `rl:api:${service}:key:${k}:bucket`);
  const cooldownKeys = order.map(k => `rl:cooldown:${service}:${k}`);
  const member = `${Date.now()}:${Math.random().toString(36).slice(2, 11)}`;

  try {
    const res = await redis.eval(
      ACQUIRE_SCRIPT,
      bucketKeys.length,
      ...bucketKeys,
      String(Date.now()),
      String(windowMs),
      String(limit),
      String(minGapMs),
      member,
      ...cooldownKeys,
    );
    const [ok, idx, retry, allCooled] = res;
    if (ok === 1) {
      return { ok: true, keyId: order[idx - 1], retryAfterMs: 0, allCooled: false };
    }
    return {
      ok: false,
      keyId: null,
      retryAfterMs: Math.max(50, Number(retry) || 1000),
      allCooled: allCooled === 1,
    };
  } catch (err) {
    // Fail-open: a Redis outage must not block external API calls.
    console.error(`[apiRateLimiter] Redis eval failed for "${service}" — failing open:`, err.message);
    return { ok: true, keyId: candidateKeys[0], retryAfterMs: 0, allCooled: false };
  }
}

// ─── Factory: sliding-window limiter ────────────────────────────────────────

export function createRedisLimiter({ service, limit, windowMs, minGapMs = 0, getCandidates }) {
  if (typeof getCandidates !== "function") {
    throw new Error(`createRedisLimiter[${service}]: getCandidates must be an async function`);
  }

  return {
    service,
    limit,
    windowMs,
    minGapMs,

    async acquire(opts = {}) {
      const { maxWaitMs = Infinity, onAllCooled = "wait" } = opts;
      const start = Date.now();
      const deadline = maxWaitMs === Infinity ? Infinity : start + maxWaitMs;

      while (true) {
        const candidates = await getCandidates();
        if (!candidates?.length) {
          throw new Error(`[${service}] No API keys available — check the relevant env var`);
        }
        const ids = candidates.map(c => c.keyId);

        const r = await acquireGlobalSlot({ service, candidateKeys: ids, limit, windowMs, minGapMs });

        if (r.ok) {
          const won = candidates.find(c => c.keyId === r.keyId) || candidates[0];
          return won;
        }

        if (r.allCooled && onAllCooled === "fail") {
          throw new AllKeysCooledError(service, r.retryAfterMs);
        }

        const now = Date.now();
        if (now >= deadline) {
          throw new QueueTimeoutError(service, now - start);
        }

        const cap = Math.min(deadline - now, 5000);
        const wait = Math.max(50, Math.min(cap, jitter(r.retryAfterMs)));
        await sleep(wait);
      }
    },
  };
}

// ─── Cooldown helpers ───────────────────────────────────────────────────────

export async function setCooldown(service, keyId, ms) {
  try {
    await redis.set(`rl:cooldown:${service}:${keyId}`, "1", "PX", Math.max(1000, ms));
  } catch (err) {
    console.error(`[apiRateLimiter] setCooldown(${service}/${keyId}) failed:`, err.message);
  }
}

// ─── Response-aware call wrapper ────────────────────────────────────────────

/**
 * Wrap an SDK call. On 429:
 *   1. Extract retry-after (header → body → default).
 *   2. Write cooldown to Redis so this key is skipped until it expires.
 *   3. Throw RateLimitedError so the caller can decide to retry.
 */
export async function callWithRateLimitProtection({ service, keyId, fn, defaultCooldownMs = 30_000 }) {
  try {
    return await fn();
  } catch (err) {
    if (is429(err)) {
      const retryMs = extractRetryAfterMs(err) ?? defaultCooldownMs;
      await setCooldown(service, keyId, retryMs);
      const wrap = new RateLimitedError(service, keyId, retryMs);
      wrap.cause = err;
      throw wrap;
    }
    throw err;
  }
}

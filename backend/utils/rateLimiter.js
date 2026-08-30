import redis from "../../src/realtime/redis.js";

const RATE_LIMIT_PER_HOUR = 180;
const WINDOW_MS = 3600000; // 1 hour in ms

// Atomic Lua script: remove expired entries → count → conditionally add
// Only ZADD (consume a slot) if count is under the limit
const ROLLING_WINDOW_SCRIPT = `
  local key = KEYS[1]
  local now = tonumber(ARGV[1])
  local window = tonumber(ARGV[2])
  local limit = tonumber(ARGV[3])
  local member = ARGV[4]

  redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
  local count = redis.call('ZCARD', key)

  if count < limit then
    redis.call('ZADD', key, now, member)
    redis.call('EXPIRE', key, 7200)
    return 1
  end

  redis.call('EXPIRE', key, 7200)
  return 0
`;

// Atomically checks the rolling window and consumes a slot if available.
// Returns true if a slot was granted, false if rate limited.
export async function canSendDM(creatorId) {
  const key = `rl:${creatorId}`;
  const now = Date.now();
  const member = `${now}:${Math.random().toString(36).substring(2, 11)}`;

  const result = await redis.eval(
    ROLLING_WINDOW_SCRIPT,
    1,
    key,
    String(now),
    String(WINDOW_MS),
    String(RATE_LIMIT_PER_HOUR),
    member
  );

  return result === 1;
}

/**
 * Generic sliding-window rate limiter for HTTP endpoints.
 * @param {string} identifier - unique key (e.g. "auth:login:1.2.3.4")
 * @param {number} max        - max requests allowed in the window
 * @param {number} windowMs   - window size in milliseconds
 * @returns {Promise<boolean>} true = request allowed, false = rate limited
 */
export async function checkRateLimit(identifier, max, windowMs) {
  try {
    const key = `rl:http:${identifier}`;
    const now = Date.now();
    const member = `${now}:${Math.random().toString(36).substring(2, 9)}`;

    const result = await redis.eval(
      ROLLING_WINDOW_SCRIPT,
      1,
      key,
      String(now),
      String(windowMs),
      String(max),
      member
    );

    return result === 1; // true = allowed, false = blocked
  } catch {
    // Fail open: if Redis is unavailable, allow the request rather than blocking all users
    return true;
  }
}

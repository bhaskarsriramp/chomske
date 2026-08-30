/**
 * Simple distributed lock using Redis
 * - Prevents thundering herd
 * - Auto-expires if process crashes
 */

const { redisGet, redisSet, redisDel } = require("./redisBridge");

async function acquireLock(key, ttl = 30) {
  const lockKey = `lock:${key}`;

  const existing = await redisGet(lockKey);
  if (existing) return false;

  await redisSet(lockKey, "1", ttl);
  return true;
}

async function releaseLock(key) {
  const lockKey = `lock:${key}`;
  await redisDel(lockKey);
}

module.exports = {
  acquireLock,
  releaseLock,
};

const axios = require("axios");
const REDIS_BRIDGE_URL = "http://34.180.49.15:3000";

const redisGet = async (key) => {
  try {
    const res = await axios.post(`${REDIS_BRIDGE_URL}/cache/get`, { key });
    return res.data?.value || null;
  } catch (err) {
    // console.error(`❌ redisGet failed for ${key}:`, err.message);
    return null;
  }
};

const redisSet = async (key, value, ttl = 86400) => {
  try {
    const res = await axios.post(`${REDIS_BRIDGE_URL}/cache/set`, {
      key,
      value,
      ttl,
    });
    
    if (!res.data?.ok) {
      // console.error(`❌ redisSet failed for ${key}:`, res.data);
      return false;
    }
    
    // console.log(`✅ redisSet success: ${key} (TTL: ${ttl}s)`);
    return true;
  } catch (err) {
    // console.error(`❌ redisSet error for ${key}:`, err.message);
    return false;
  }
};

const redisDel = async (key) => {
  try {
    await axios.post(`${REDIS_BRIDGE_URL}/cache/del`, { key });
    // console.log(`✅ redisDel success: ${key}`);
    return true;
  } catch (err) {
    // console.error(`❌ redisDel error for ${key}:`, err.message);
    return false;
  }
};

module.exports = {
  redisGet,
  redisSet,
  redisDel,
};
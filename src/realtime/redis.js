// services/redis.js
const Redis = require("ioredis");

const redis = new Redis({
  // host: process.env.REDIS_HOST, // private IP
  host: "10.3.176.99", // private IP
  port: 6379,
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on("connect", () => {
  console.log("✅ Redis (GCP Memorystore) connected");
});

redis.on("error", (err) => {
  console.error("❌ Redis error", err);
});

module.exports = redis;

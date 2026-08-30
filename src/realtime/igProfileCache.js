const { redisGet, redisSet, redisDel } = require("./redisBridge");
const { acquireLock, releaseLock } = require("./redisLock");
const axios = require("axios");

const PROFILE_TTL = 23 * 60 * 60; // 82800 seconds (23 hours)

const REDIS_BRIDGE_URL = "http://34.180.49.15:3000";

async function getCachedProfile(igUserId) {
  if (!igUserId) return null;
  
  const cached = await redisGet(`ig:user:${igUserId}`);
  
  if (cached) {
    const age = cached.fetchedAt ? Date.now() - cached.fetchedAt : 0;
    // console.log(`📦 Cache hit for ${igUserId} (age: ${Math.floor(age / 1000)}s)`);
  } else {
    // console.log(`📦 Cache miss for ${igUserId}`);
  }
  
  return cached;
}

let InstagramService = null;

async function getInstagramService() {
  if (!InstagramService) {
    const mod = await import("../../backend/middleware/instagramService.js");
    InstagramService = mod.default || mod;
  }
  return InstagramService;
}

// Helper function to publish profile updates to creator room
async function publishProfileUpdateToCreator({ creatorId, igUserId, name, profilePic }) {
  try {
    await axios.post(`${REDIS_BRIDGE_URL}/publish/creator`, {
      creatorId: creatorId.toString(),
      event: {
        type: "participant:updated",
        data: { igUserId, name, profilePic }
      }
    });
    // console.log(`✅ Published profile update to creator ${creatorId}`);
  } catch (err) {
    // console.error('❌ Failed to publish profile update to creator:', err.message);
  }
}

async function fetchAndCacheProfileSafely({
  igUserId,
  accessToken,
  conversationId, // 🔑 For conversation-specific events
  creatorId, // 🔑 For creator-room events
  publishSocketEvent,
}) {
  const cacheKey = `ig:user:${igUserId}`;
  const lockKey = `lock:${cacheKey}`;

  // Fast path - check cache
  const cached = await getCachedProfile(igUserId);
  if (cached?.fetchedAt) {
    const age = Date.now() - cached.fetchedAt;
    if (age < PROFILE_TTL * 1000) {
      return cached;
    }
    // console.log(`⏰ Profile expired for ${igUserId}, refreshing...`);
  }

  // Lock to prevent duplicate fetches
  const locked = await acquireLock(lockKey, 30);
 if (!locked) {
  // wait briefly for cache to populate
  await new Promise(r => setTimeout(r, 300));
  return await getCachedProfile(igUserId);
}


  try {
    // console.log(`🔄 Fetching profile from Instagram for ${igUserId}...`);
    
    const InstagramService = await getInstagramService();

    const profile = await InstagramService.fetchUserProfile({
      igUserId,
      accessToken,
    });

    if (!profile) {
      // console.log(`⚠️ No profile data returned for ${igUserId}`);
      return cached;
    }

    const payload = {
      igUserId,
      name: profile.name || null,
      profilePic: profile.profile_pic_url || null,
      restricted: profile.is_private || false,
      fetchedAt: Date.now(),
    };

    // 🔥 CRITICAL: Set cache with explicit logging
    // console.log(`💾 Setting cache for ${igUserId}:`, {
    //   name: payload.name,
    //   hasPic: !!payload.profilePic,
    //   ttl: PROFILE_TTL,
    // });

    const setResult = await redisSet(cacheKey, payload, PROFILE_TTL);
    
    if (!setResult) {
      // console.error(`❌ Failed to cache profile for ${igUserId}`);
    } else {
      // console.log(`✅ Successfully cached profile for ${igUserId}`);
    }

    // 🔥 FIX #1: Emit to conversation room (for active chat)
    if (publishSocketEvent && conversationId) {
      await publishSocketEvent({
        conversationId,
        payload: {
          type: "participant:updated",
          data: {
            igUserId,
            name: payload.name,
            profilePic: payload.profilePic,
          },
        },
      });

      // console.log(`📡 Emitted profile update for conversation ${conversationId}`);
    }
    
    // 🔥 FIX #2: Emit to creator room (for sidebar)
    if (creatorId) {
      await publishProfileUpdateToCreator({
        creatorId,
        igUserId,
        name: payload.name,
        profilePic: payload.profilePic,
      });
    }

    return payload;
  } catch (err) {
    // console.error(`❌ Profile fetch failed for ${igUserId}:`, err.message);
    return cached || null;
  } finally {
    await releaseLock(lockKey);
  }
}

module.exports = {
  getCachedProfile,
  fetchAndCacheProfileSafely,
};
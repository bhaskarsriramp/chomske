// services/realtimePublisher.js
import axios from "axios";

const REALTIME_URL = "http://34.180.49.15:3000";

const realtimeClient = axios.create({
  baseURL: REALTIME_URL,
  timeout: 8000,
  proxy: false,
  headers: {
    "Content-Type": "application/json",
  },
  httpAgent: undefined,
  httpsAgent: undefined,
});

function fireAndForget(promise, label) {
  promise
    .then(() => {})
    .catch((err) => {
      console.error(`❌ [${label}] Fire-and-forget failed:`, err.message);
    });
}

async function retryWithBackoff(fn, maxRetries = 2, initialDelay = 500) {
  let lastError;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      
      const isTimeout = err.code === "ECONNABORTED" || err.message?.includes("timeout");
      const isNetworkError = err.code === "ECONNREFUSED" || err.code === "ENOTFOUND";
      
      if (!isTimeout && !isNetworkError && err.response?.status < 500) {
        throw err;
      }

      if (attempt < maxRetries) {
        console.warn(`⚠️ Retry ${attempt}/${maxRetries} after ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
      }
    }
  }

  throw lastError;
}

export function publishInboxMessageHTTP({
  creatorId,
  conversationId,
  message,
  conversation,
}) {
  fireAndForget(
    realtimeClient.post("/publish/inbox", {
      creatorId,
      conversationId,
      message,
      conversation,
    }),
    "inbox-message"
  );
}

/**
 * Publish conversation update (label, followUp, creatorHasReplied, etc.)
 * 🔥 NOTE: Make sure 'update' object includes creatorHasReplied when relevant
 */
export function publishConversationUpdate({
  creatorId,
  conversationId,
  update,
}) {
  fireAndForget(
    retryWithBackoff(
      () =>
        realtimeClient.post("/publish/conversation-update", {
          creatorId,
          conversationId,
          update,
        }),
      2,
      300
    ).then(() => {
      console.log(`✅ Published conversation update for: ${conversationId}`);
    }),
    "conversation-update"
  );
}

export function publishConversationCreated({ creatorId, conversation }) {
  const payload = {
    creatorId: String(creatorId),
    conversation: conversation,
  };

  fireAndForget(
    retryWithBackoff(
      () => realtimeClient.post("/publish/conversation-created", payload),
      2,
      300
    ).then(() => {
      console.log("✅ Published conversation:created to creator room");
    }),
    "conversation-created"
  );
}

export async function publishInboxMessageHTTPBlocking({
  creatorId,
  conversationId,
  message,
  conversation,
}) {
  try {
    await retryWithBackoff(
      () =>
        realtimeClient.post("/publish/inbox", {
          creatorId,
          conversationId,
          message,
          conversation,
        }),
      3,
      500
    );
    return { success: true };
  } catch (err) {
    console.error("❌ Blocking inbox publish failed:", err.message);
    return { success: false, error: err.message };
  }
}

export async function checkRealtimeHealth() {
  try {
    const res = await realtimeClient.get("/health", { timeout: 3000 });
    return res.status === 200;
  } catch {
    return false;
  }
}
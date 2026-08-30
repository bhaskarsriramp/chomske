// services/inboxPublisher.js
import { redis } from "./redis.js";

export async function publishInboxMessage({
  creatorId,
  conversationId,
  message
}) {
  const payload = JSON.stringify({
    type: "message:new",
    conversationId,
    message
  });

  // 1. Realtime push
  await redis.publish(
    `inbox:conversation:${conversationId}`,
    payload
  );

  // 2. Increment unread
  await redis.hincrby(
    `inbox:unread:${creatorId}`,
    conversationId,
    1
  );

  // 3. Move conversation to top
  await redis.zadd(
    `inbox:conversations:${creatorId}`,
    Date.now(),
    conversationId
  );
}

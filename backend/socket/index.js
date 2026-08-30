import { Server } from "socket.io";
import { socketAuth } from "./auth.js";
import redis from "../realtime/redis.js"

export function initSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: [
        "https://chomske.com",
        "https://app.chomske.com",
      ],
      credentials: true,
    },
  });

  // 🔐 AUTH MIDDLEWARE
  io.use(socketAuth);

  io.on("connection", (socket) => {
    console.log("🟢 Socket connected:", socket.id, "user:", socket.user.id);

    socket.on("join_conversation", ({ conversationId }) => {
      if (!conversationId) return;

      // Creator-scoped room (VERY IMPORTANT)
      const room = `u:${socket.user.id}:c:${conversationId}`;
      socket.join(room);

      console.log(`📥 Joined ${room}`);
    });

    socket.on("leave_conversation", ({ conversationId }) => {
      const room = `u:${socket.user.id}:c:${conversationId}`;
      socket.leave(room);
    });

    socket.on("disconnect", () => {
      console.log("🔴 Socket disconnected:", socket.id);
    });
  });

  // ---------- Redis fan-out ----------
  const sub = redis.duplicate();

  sub.psubscribe("inbox:conversation:*", (err) => {
    if (err) console.error("❌ Redis psubscribe failed", err);
    else console.log("📡 Redis subscribed inbox:*");
  });

  sub.on("pmessage", (_pattern, channel, message) => {
    try {
      const payload = JSON.parse(message);
      const { creatorId, conversationId } = payload;

      const room = `u:${creatorId}:c:${conversationId}`;
      io.to(room).emit("inbox:event", payload);

    } catch (e) {
      console.error("❌ Redis payload error", e.message);
    }
  });

  return io;
}

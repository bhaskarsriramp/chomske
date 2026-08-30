// services/socketServer.js
const { Server } = require("socket.io");
const redis = require("./redis.js");

const initSocketServer = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: "*", // tighten later
      methods: ["GET", "POST"],
    },
  });

  // console.log("🟢 Socket.IO initialized");

  // ---------- Socket connection ----------
  io.on("connection", (socket) => {
    // console.log("🔌 Client connected:", socket.id);

    // Join conversation room
    socket.on("join_conversation", ({ conversationId }) => {
      if (!conversationId) return;
      socket.join(`conv:${conversationId}`);
      // console.log(`📥 ${socket.id} joined conv:${conversationId}`);
    });

    socket.on("leave_conversation", ({ conversationId }) => {
      if (!conversationId) return;
      socket.leave(`conv:${conversationId}`);
    });

socket.on("join_creator", ({ creatorId }) => {
  if (!creatorId) return;
  socket.join(`creator:${creatorId}`);
  // console.log(`👤 ${socket.id} joined creator:${creatorId}`);
});

socket.on("leave_creator", ({ creatorId }) => {
  if (!creatorId) return;
  socket.leave(`creator:${creatorId}`);
});



    socket.on("disconnect", () => {
      // console.log("❌ Client disconnected:", socket.id);
    });
  });

  // ---------- Redis → Socket.IO fanout ----------
  const sub = redis.duplicate();

  sub.psubscribe("inbox:conversation:*", (err) => {
    if (err) {
      // console.error("❌ Redis psubscribe failed", err);
    } else {
      // console.log("📡 Redis subscribed to inbox:conversation:*");
    }
  });

  sub.psubscribe("inbox:creator:*", (err) => {
  if (err) {
    // console.error("❌ Redis psubscribe failed", err);
  } else {
    // console.log("📡 Redis subscribed to inbox:creator:*");
  }
});


sub.on("pmessage", (_pattern, channel, message) => {
  try {
    const payload = JSON.parse(message);

    // inbox:conversation:<conversationId>
    if (channel.startsWith("inbox:conversation:")) {
      const conversationId = channel.split(":").pop();
      io.to(`conv:${conversationId}`).emit("inbox:event", payload);
      return;
    }

    // inbox:creator:<creatorId>
    if (channel.startsWith("inbox:creator:")) {
      const creatorId = channel.split(":").pop();
      io.to(`creator:${creatorId}`).emit("inbox:event", payload);
      return;
    }
  } catch (e) {
    // console.error("❌ Redis message parse failed", e.message);
  }
});


  return io;
};

module.exports = {
  initSocketServer,
};
















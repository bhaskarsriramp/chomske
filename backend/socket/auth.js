import jwt from "jsonwebtoken";
import User from "../models/User.js"

export async function socketAuth(socket, next) {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");

    if (!token) {
      return next(new Error("AUTH_REQUIRED"));
    }

const JWT_SECRET = process.env.JWT_SECRET;

    const decoded = jwt.verify(token, JWT_SECRET);

    // Minimal user lookup (avoid heavy populate)
    const user = await User.findById(decoded.user_id)
      .select("_id instagramConnected")
      .lean();

    if (!user) {
      return next(new Error("USER_NOT_FOUND"));
    }

    socket.user = {
      id: user._id.toString(),
      instagramConnected: user.instagramConnected,
    };

    next();
  } catch (err) {
    console.error("❌ Socket auth failed:", err.message);
    next(new Error("AUTH_INVALID"));
  }
}

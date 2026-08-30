import mongoose from "mongoose";

const revokedTokenSchema = new mongoose.Schema({
  jti: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
});

// TTL index: MongoDB automatically removes documents once expiresAt is reached
revokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("RevokedToken", revokedTokenSchema);

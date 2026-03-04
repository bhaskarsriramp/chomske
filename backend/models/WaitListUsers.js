import mongoose from "mongoose";
const { Schema } = mongoose;

const Waitlist_User_Schema = new Schema({
  email: { type: String, required: true },
  pricing: { type: Number },
    created_at: { type: Date, default: Date.now },
  updated_at: { type: Date }
});

Waitlist_User_Schema.index({ email: 1}, { unique: true });

// Register model as "User" but use existing collection "users"
const WaitListUser = mongoose.models.User || mongoose.model("WaitListUser", Waitlist_User_Schema, "waitlist_users");
export default WaitListUser;

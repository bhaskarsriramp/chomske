import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * User — one row per Google account that has signed in.
 *
 * `google_sub` is the stable Google account id and the real identity key. Email is
 * stored for display and support, but is NOT the join key: a Google account can
 * change its email address, and two people can hold the same address over time.
 */
const UserSchema = new Schema({
  google_sub: { type: String, required: true, unique: true, index: true },
  email:      { type: String, required: true, index: true },
  name:       { type: String, default: "" },
  picture:    { type: String, default: "" },

  last_login:   { type: Date, default: Date.now },
  login_count:  { type: Number, default: 0 },
  created_at:   { type: Date, default: Date.now },
});

export default mongoose.models.User || mongoose.model("User", UserSchema, "users");

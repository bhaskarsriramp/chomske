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

  // What this creator covers. Chosen once at first sign-in and changeable later.
  //
  // It decides which stories they see AND which categories the collector spends
  // money on — services/newsScheduler.js reads a distinct() over this field and
  // only runs the ones somebody picked. So an empty array here is not just an
  // incomplete profile, it is the difference between a paid ranking pass running
  // and not running.
  categories: { type: [String], default: [], index: true },

  // Stamped when the category screen is completed. Kept separate from
  // categories.length because "chose nothing yet" and "chose, then cleared"
  // should not look identical to the onboarding gate.
  onboarded_at: { type: Date, default: null },

  last_login:   { type: Date, default: Date.now, index: true },

  // Last time they actually opened the feed, which is NOT the same as last
  // sign-in: the token lasts 14 days, so somebody using this every morning can
  // go a fortnight without re-authenticating. The collector decides whether a
  // category is still worth polling from this field, and reading last_login
  // instead would let it go cold underneath a daily user. Written at most once
  // an hour per account (services/newsCadence.js touchSeen).
  last_seen_at: { type: Date, default: null, index: true },
  login_count:  { type: Number, default: 0 },
  created_at:   { type: Date, default: Date.now },
});

export default mongoose.models.User || mongoose.model("User", UserSchema, "users");

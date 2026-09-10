import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * ── THE SHOWCASE BLOCK ───────────────────────────────────────────────────────
 * Present only on `kind: "showcase"` rows. See services/showcaseService.js.
 *
 * A showcase is a voice we built from a real creator's public videos so we can
 * show it to THEM, privately, over email. It is a User row rather than a model
 * of its own because everything downstream, the feed, the wallet, Transcript,
 * VoiceProfile and the whole script pipeline, is already scoped by `user`.
 * Giving showcases their own model would mean forking every one of those and
 * maintaining two copies of script generation forever.
 */
const ShowcaseSchema = new Schema({
  // What we call this creator on the page. Not `name` on the parent, which is
  // taken from Google for real accounts and would read as an identity claim.
  display_name: { type: String, default: "" },

  // The whole credential. 8 random base62 characters, unguessable rather than
  // readable: a guessable slug is enumerable, and enumeration here spends money.
  slug: { type: String, default: null },

  created_by: { type: Schema.Types.ObjectId, ref: "User", default: null },

  // The kill switch. Flipped from the admin panel, and by the "remove this"
  // link on the page itself, so a creator who objects can end it without
  // waiting for an email to be read.
  active: { type: Boolean, default: true },

  // ── WHAT HAPPENS WHEN THEY SIGN UP ─────────────────────────────────────────
  // The Profile, VoiceProfile and Transcripts are RE-PARENTED to their real
  // account, not copied: Transcript is unique on (user, video_id), so a copy
  // means duplicate rows and remapped built_from refs for no gain once the
  // showcase has done its job. These two are what is left afterwards, an audit
  // record of who claimed it and when.
  claimed_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
  claimed_at: { type: Date, default: null },

  // Cheap counters for the admin list. Distinct-visitor detail lives on
  // ShowcaseVisit; these answer "has anyone opened it at all" without a join.
  opens:           { type: Number, default: 0 },
  scripts_made:    { type: Number, default: 0 },
  last_opened_at:  { type: Date, default: null },

  // Free text for the campaign: which channel, which email, what was said.
  notes: { type: String, default: "" },
}, { _id: false });

/**
 * User, one row per Google account that has signed in.
 *
 * `google_sub` is the stable Google account id and the real identity key. Email is
 * stored for display and support, but is NOT the join key: a Google account can
 * change its email address, and two people can hold the same address over time.
 *
 * ── WHY google_sub IS NO LONGER REQUIRED ─────────────────────────────────────
 * It was `required: true, unique: true`, which is right for every row that came
 * from a sign-in and impossible for a showcase, which has no Google account
 * behind it and never will. The index is now sparse: rows without the field are
 * not indexed at all, so any number of showcases can coexist while two real
 * accounts still cannot share a sub.
 *
 * `required` moved to a validator rather than being dropped outright, so a
 * human account missing its identity key is still rejected. Losing that check
 * would let a bug create a signed-in user nothing can ever match again.
 */
const UserSchema = new Schema({
  google_sub: {
    type: String,
    default: undefined,
    index: { unique: true, sparse: true },
    required: function () { return this.kind !== "showcase"; },
  },
  email:      { type: String, required: function () { return this.kind !== "showcase"; }, index: true },
  name:       { type: String, default: "" },
  picture:    { type: String, default: "" },

  // ── Admin ──────────────────────────────────────────────────────────────────
  // Flipped by hand in the database, never by any route. There is deliberately
  // no way to grant this through the API: an endpoint that can make somebody an
  // admin is the single highest-value target in the product, and this feature
  // does not need one to work.
  admin: { type: Boolean, default: false, index: true },

  // "human" is an account somebody signed into. "showcase" is a voice we built
  // for outreach, which must never be counted as a user, emailed, or billed.
  kind: { type: String, enum: ["human", "showcase"], default: "human", index: true },

  showcase: { type: ShowcaseSchema, default: undefined },

  // What this creator covers. Chosen once at first sign-in and changeable later.
  //
  // It decides which stories they see AND which categories the collector spends
  // money on, services/newsScheduler.js reads a distinct() over this field and
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

// The share link's lookup, and the guarantee that two showcases can never
// collide on a slug. Sparse because every human account leaves it unset.
UserSchema.index({ "showcase.slug": 1 }, { unique: true, sparse: true });

export default mongoose.models.User || mongoose.model("User", UserSchema, "users");

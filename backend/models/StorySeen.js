import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * StorySeen — which stories this creator has already opened.
 *
 * ── WHY THIS IS ITS OWN COLLECTION ───────────────────────────────────────────
 * The reference project marks an opportunity read by writing `seen_at` onto the
 * opportunity document itself, which works because each of those rows belongs to
 * one founder. Nothing here does. A NewsItem is collected once per CATEGORY and
 * serves every creator who picked it — that sharing is the entire reason this
 * product is affordable — so a `seen_at` on the row would mean the first person
 * to open a story cleared the NEW badge for everybody.
 *
 * So the read state is keyed on (user, story) and lives apart from the story.
 *
 * ── WHAT "STORY" IS ──────────────────────────────────────────────────────────
 * The cluster key, not a row id. A story is five outlets and one card, and the
 * representative row can change between passes when a better-scoring member
 * arrives — keyed on a row id, a story you had already read would come back
 * badged NEW the moment a sixth outlet picked it up. Items with no cluster fall
 * back to their own id.
 *
 * Re-clustering can still resurrect a badge: if the ranker coins a different key
 * for the same event, that is a new story as far as this collection knows. That
 * is now rare by construction — see the "story keys already in use" block in
 * newsRanker.js, which exists to stop keys drifting between passes.
 */
const StorySeenSchema = new Schema({
  user:  { type: Schema.Types.ObjectId, ref: "User", required: true },
  story: { type: String, required: true },

  // TTL anchor as well as a record. Two weeks is far longer than the feed's own
  // 48-hour window, so a row can never expire while its story is still on
  // screen — the badge cannot flicker back on something you just read — and the
  // collection stays proportional to a fortnight of reading rather than growing
  // for the life of the account.
  seen_at: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 14 },
});

// One row per user per story, and the exact shape the feed reads: "of these
// twenty keys, which has this user seen".
StorySeenSchema.index({ user: 1, story: 1 }, { unique: true });

export default mongoose.models.StorySeen ||
  mongoose.model("StorySeen", StorySeenSchema, "story_seen");

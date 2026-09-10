import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * ShowcaseVisit, one row per browser that has opened one share link.
 *
 * ── WHY THIS IS NOT JUST A COUNTER ON THE USER ROW ───────────────────────────
 * `showcase.opens` already answers "how many times was this link hit", and for
 * an outreach campaign that number is close to useless on its own: it cannot
 * tell twenty opens by us during testing apart from twenty by the creator, and
 * the whole question the campaign is asking is "did HE open it".
 *
 * A row per visitor makes that a count of documents instead of a guess, and it
 * is the same row that tells you whether the person who opened it went on to
 * generate anything, which is the only engagement signal that matters before
 * they sign up.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ───────────────────────────────────────
 * It does NOT hold a credit budget. Credits live on the showcase's own wallet
 * and are capped per LINK, not per visitor: a hundred credits attached to the
 * link, shared by everyone who opens it, which is the decision that keeps the
 * spend on an outreach campaign bounded by the number of links sent rather than
 * by how far one of them travels.
 *
 * ── AND WHY THE IP IS HASHED ─────────────────────────────────────────────────
 * The only question it is kept for is "are these two visits the same person",
 * which a hash answers exactly as well as the address does. Storing the address
 * itself would mean holding personal data about someone who never signed up,
 * never agreed to anything, and in most cases is being contacted cold.
 */
const ShowcaseVisitSchema = new Schema({
  // The showcase User row this visit belongs to.
  showcase: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

  // Random id minted into the session cookie on first open. This is what makes
  // a "visitor" a browser rather than a request.
  visitor_id: { type: String, required: true },

  scripts_generated: { type: Number, default: 0 },
  credits_used:      { type: Number, default: 0 },

  // Coarse, and only ever compared, never displayed or reversed.
  ip_hash:    { type: String, default: "" },
  user_agent: { type: String, default: "" },

  first_seen_at: { type: Date, default: Date.now },
  last_seen_at:  { type: Date, default: Date.now, index: true },
});

// One row per browser per showcase. The upsert on open relies on this.
ShowcaseVisitSchema.index({ showcase: 1, visitor_id: 1 }, { unique: true });

export default mongoose.models.ShowcaseVisit ||
  mongoose.model("ShowcaseVisit", ShowcaseVisitSchema, "showcase_visits");

import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * NewsItem — one story, however many places we saw it.
 *
 * ── THE TWO DEDUPE KEYS, AND WHY THERE ARE TWO ───────────────────────────────
 * `url_hash` catches the same link arriving from several sources (HN and Google
 * News both linking one TechCrunch article). It's exact and cheap.
 *
 * `title_sig` catches the harder case: the SAME EVENT written up independently
 * by five outlets, each with its own URL. Without it a big launch floods the feed
 * with five rows that are really one story — which is the failure mode that makes
 * an aggregator feel like noise. Not unique-indexed, because two genuinely
 * different stories can collapse to one signature; it's a clustering hint the
 * ranker uses, not a hard constraint.
 *
 * `first_seen_at` is deliberately OURS, not the publisher's timestamp. It records
 * when this story entered our system, which is the only honest basis for telling a
 * creator "you're early on this" — a backfilled published_at from a source we
 * polled late would lie about that.
 */
const NewsItemSchema = new Schema({
  source:      { type: String, required: true, index: true },  // "hn" | "arxiv" | "openai" | …
  source_kind: { type: String, default: "outlet" },            // primary | community | paper | outlet

  title: { type: String, required: true },
  url:   { type: String, required: true },
  summary: { type: String, default: "" },

  url_hash:  { type: String, required: true, unique: true, index: true },
  title_sig: { type: String, default: "", index: true },

  published_at:  { type: Date, index: true },   // what the source claims
  first_seen_at: { type: Date, default: Date.now, index: true },

  // Whatever a given source uniquely offers — HN points/comments, arXiv authors,
  // GitHub tag. Mixed because it genuinely differs per source and nothing queries
  // inside it; the ranker reads named fields it knows about.
  meta: { type: Schema.Types.Mixed, default: {} },

  // Deterministic score (recency + source weight + engagement). Always present.
  raw_score: { type: Number, default: 0, index: true },

  // Gemini's judgement. -1 = not yet ranked, so an unranked item is visibly
  // distinct from one the model scored zero.
  ai_score:  { type: Number, default: -1 },
  ai_reason: { type: String, default: "" },
  ai_angle:  { type: String, default: "" },   // why a creator would cover it
  ranked_at: { type: Date, default: null },

  cluster_id: { type: String, default: "", index: true },

  created_at: { type: Date, default: Date.now },
});

// The feed query: recent, best first.
NewsItemSchema.index({ first_seen_at: -1, ai_score: -1 });

export default mongoose.models.NewsItem || mongoose.model("NewsItem", NewsItemSchema, "news_items");

import mongoose from "mongoose";
import { createHash } from "crypto";
const { Schema } = mongoose;

/**
 * Source: material a creator brought themselves, ready to be written from.
 *
 * ── WHY THIS IS A DOCUMENT AND NOT A REQUEST BODY ───────────────────────────
 * Import and Idea both have a step the news feed never needed: turning what the
 * creator pasted into facts. Reading five articles takes seconds; reading a ten
 * minute video takes longer and costs real money. Holding that in a request
 * body would mean redoing it on every order.
 *
 * It buys three separate things:
 *
 *   1. THE PREVIEW IS HONEST. Pages are read BEFORE anything is charged, so a
 *      creator sees "read 3 of 5, Bloomberg and FT refused" and decides with
 *      that in front of them. The news path could always fall back to the
 *      collector's snippets when TinyFish came back empty; this path has no
 *      fallback at all, and a script written from five paywalls would be a
 *      script written from nothing, paid for. See services/sourceService.js.
 *
 *   2. A REGENERATE DOES NOT RE-BUY THE READ. `facts` is filled in the first
 *      time a script is written from this source and reused afterwards, so
 *      ordering 60 seconds and then three minutes from the same video pays the
 *      video price once. Reading is now bought at the preview step (see
 *      readCost in services/creditPricing.js), so this flag no longer gates a
 *      charge; it still records that the transcript is held and need not be
 *      fetched again.
 *
 *   3. THE SCRIPT STAYS CHECKABLE. Scripts point here, so "which links was
 *      this written from" is answerable a week later, the same promise the
 *      news path keeps through its coverage list.
 *
 * ── WHY IT EXPIRES ──────────────────────────────────────────────────────────
 * This is a cache of somebody else's content, not a record of the creator's
 * work. The Script keeps what matters permanently (its text, its sources_used,
 * the URLs and the brief in source_input). Holding full article bodies and
 * video transcripts indefinitely would grow without bound and store more of
 * other people's copyrighted text than we have any reason to.
 */

/** A month. Long enough that "write another one from that video" still works. */
const TTL_DAYS = parseInt(process.env.SOURCE_TTL_DAYS || "30", 10);

const LinkSchema = new Schema({
  url:    { type: String, default: "" },
  title:  { type: String, default: "" },
  source: { type: String, default: "" },   // the hostname, for display
  // Whether TinyFish actually got anything back. False rows are KEPT rather
  // than dropped: "we couldn't read the FT one" is information the creator
  // needs before they spend credits, and silently returning four of five links
  // is how a paywall turns into a mystery.
  ok:     { type: Boolean, default: false },
  chars:  { type: Number, default: 0 },
}, { _id: false });

const SourceSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

  // Which screen made it. Kept distinct from Script.source_kind only in that
  // "news" never lands here: a ranked story already has NewsItem behind it.
  kind: { type: String, enum: ["import", "idea"], required: true },

  /**
   * Content hash of the inputs, scoped to the user.
   *
   * The reason a creator can paste the same video twice and pay for it once.
   * Not unique at the index level on purpose: an expired document being
   * rebuilt, or two tabs previewing together, should produce a working source
   * rather than a duplicate-key error on a cache.
   */
  hash: { type: String, default: "", index: true },

  // ── What they gave us ────────────────────────────────────────────────────
  youtube: {
    video_id:         { type: String, default: "" },
    url:              { type: String, default: "" },
    title:            { type: String, default: "" },
    channel:          { type: String, default: "" },
    thumbnail:        { type: String, default: "" },
    duration_seconds: { type: Number, default: 0 },
  },
  links:  { type: [LinkSchema], default: [] },
  text:   { type: String, default: "" },    // pasted material, up to 6000 chars
  prompt: { type: String, default: "" },    // the Idea brief

  // Idea only: they asked us to find real sources rather than write from the
  // brief alone. `lookup_used` is the answer to whether it worked, and it is
  // what routes/script.js prices off.
  lookup:      { type: Boolean, default: false },
  lookup_used: { type: Boolean, default: false },

  /**
   * ── THE DRAFT, AND THE SIGNATURE ON IT ────────────────────────────────────
   * Idea only, and only when the lookup found nothing to write from, which for
   * an evergreen subject is every time: there is no coverage of "the difference
   * between candlestick and chart patterns" and there never will be.
   *
   * `draft` is what the model proposed (services/ideaDraftService.js). It is
   * NOT material and is never written from. `text` holds what the creator
   * actually approved after editing it, and `draft_approved_at` is the moment
   * they did, which is the only thing that makes this source orderable.
   *
   * The two are kept apart deliberately. Together they are the record of what
   * we suggested versus what a human signed off on, and that distinction is
   * the whole justification for letting a model write content here at all.
   */
  draft:            { type: String, default: "" },
  draft_approved_at: { type: Date, default: null },

  // ── What we made of it ───────────────────────────────────────────────────
  // The headline the script is about, and the angle to take. Derived cheaply
  // (the video's title, the first link's title, the first line of the brief)
  // rather than with a model call: the writer picks its own angle from the
  // facts when there isn't a better one to hand it.
  title: { type: String, default: "" },
  angle: { type: String, default: "" },

  /**
   * The assembled material block, in the exact shape the writer's prompt wants.
   *
   * Built once, in services/sourceMaterial.js, and reused for the English twin
   * and for every later regenerate. Empty until the first generation for a
   * source whose reading is not free, which is the video case: pages and pasted
   * text are read during the free preview, a video is read when someone pays.
   */
  facts:        { type: String, default: "" },
  sources_used: [{ type: String }],

  // Filled the first time the video is read, so the charge is not repeated.
  video_read_at: { type: Date, default: null },
  // What the creator has already paid to read this material. Informational:
  // the "don't charge twice" decision is made on video_read_at / lookup_used.
  read_charged:  { type: Number, default: 0 },

  error: { type: String, default: "" },

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },

  // Mongo drops the document itself once this passes. Set on create rather than
  // as `expires: "30d"` on created_at so a source that gets used again can have
  // its life extended (see services/sourceService.js).
  expires_at: { type: Date, default: () => new Date(Date.now() + TTL_DAYS * 86400000) },
});

SourceSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
SourceSchema.index({ user: 1, created_at: -1 });

/**
 * The cache key.
 *
 * Order-insensitive across links, because pasting the same three articles in a
 * different order is the same request, and a creator who reorders them should
 * not pay to read them again. The lookup flag is part of the key: "write from
 * my brief" and "research my brief first" produce genuinely different material.
 */
export function sourceHash({ kind = "import", videoId = "", links = [], text = "", prompt = "", lookup = false }) {
  const parts = [
    // Import and Idea can produce identical inputs (a bare prompt), and they
    // are not the same request: one treats the text as material, the other as
    // an instruction, and they get different fact rules. Without this a reuse
    // could hand back a source built under the other screen's meaning.
    `k:${kind}`,
    `v:${videoId}`,
    `l:${[...links].map((u) => String(u || "").trim()).sort().join("|")}`,
    `t:${String(text || "").trim()}`,
    `p:${String(prompt || "").trim()}`,
    `r:${lookup ? 1 : 0}`,
  ];
  return createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 40);
}

export const SOURCE_TTL_DAYS = TTL_DAYS;

export default mongoose.models.Source || mongoose.model("Source", SourceSchema, "sources");

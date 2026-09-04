/**
 * news.js — the ranked feed.
 *
 * Reads collapse by cluster: five outlets covering one launch return ONE entry
 * with a `sources` count, rather than five rows that make the feed look like
 * noise. The count isn't cosmetic — how many outlets picked a story up is itself
 * a signal of how big it is, so it's returned and used for ordering.
 */
import express from "express";
import mongoose from "mongoose";
import NewsItem from "../models/NewsItem.js";
import StorySeen from "../models/StorySeen.js";
import { isValidCategory, DEFAULT_CATEGORY, getCategory } from "../services/categories.js";
import { resolveProfile } from "../services/profileService.js";
import { ensureBrief } from "../services/newsBriefService.js";
import { lastCheckedAt, touchSeen } from "../services/newsCadence.js";
import { heatOf, latestOf } from "../services/newsHeat.js";
import { fetchAndRank } from "../services/newsScheduler.js";
import authenticateToken from "../middleware/authenticateToken.js";

const router = express.Router();

/**
 * GET /news
 *   ?hours=24        window on first_seen_at (default 24, max 72)
 *   ?min_score=4     lowest ai_score to include (default 4 — below that is noise)
 *   ?limit=25        max clusters (default 25, max 100)
 *   ?source=hn       optional single-source filter
 *
 * Ordering is by how live a story is, not by the single newest link — see
 * services/newsHeat.js for the formula and why it exists.
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    const hours = Math.min(72, Math.max(1, parseInt(req.query.hours, 10) || 24));
    const minScore = Math.max(0, Math.min(10, parseInt(req.query.min_score, 10) || 4));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));

    // The feed is whatever THIS PROFILE covers, not what the account covers.
    // A creator running a sports channel and a tech channel must never see AI
    // stories in the sports feed just because the same person also runs the
    // other one — that is the whole reason profiles exist.
    //
    // Falling back to the default category rather than returning nothing keeps a
    // not-yet-onboarded account from seeing an empty product and concluding it
    // is broken.
    const { profile } = await resolveProfile(req.user.id, req.query.profile);
    let mine = (profile.categories || []).filter(isValidCategory);
    if (!mine.length) mine = [DEFAULT_CATEGORY];

    // ?category= narrows to one of THIS PROFILE's categories, for a per-category
    // tab. Never a way to read a category they did not pick.
    const asked = String(req.query.category || "");
    const cats = asked && mine.includes(asked) ? [asked] : mine;

    const match = {
      category: { $in: cats },
      first_seen_at: { $gte: new Date(Date.now() - hours * 3600000) },
      ai_score: { $gte: minScore },
    };
    if (req.query.source) match.source = String(req.query.source);

    const rows = await NewsItem.aggregate([
      { $match: match },
      // Sort BEFORE grouping so $first picks the best-scoring member as the
      // cluster's representative rather than an arbitrary one.
      { $sort: { ai_score: -1, raw_score: -1 } },
      {
        $group: {
          _id: { $ifNull: ["$cluster_id", "$_id"] },
          doc: { $first: "$$ROOT" },
          sources: { $addToSet: "$source" },
          count: { $sum: 1 },
          earliest: { $min: "$first_seen_at" },

          // ── THE CLUSTER'S CLOCK IS ITS NEWEST MEMBER, NOT ITS OLDEST ───────
          // A running story keeps gathering coverage into the same cluster, so
          // `earliest` is pinned to when it broke. That is a true fact and it
          // was the wrong one to lead with: a story with twenty outlets on it,
          // the freshest two hours old, displayed and sorted as seventeen hours
          // old — below stories whose newest coverage was half a day older. The
          // feed read as frozen while it was in fact moving.
          //
          // Publisher time where there is one, our own clock where there isn't,
          // for every member. `latest` and `heat` are both derived from this in
          // Node — see below for why that is not done here.
          times: { $push: { $ifNull: ["$published_at", "$first_seen_at"] } },

          // Never null, so the pipeline always has something to order by even
          // when every publisher date in a cluster is missing or unparseable.
          latest_seen: { $max: "$first_seen_at" },
        },
      },
      // Two stages, and the order matters. Rank first and cut to the limit, so
      // what survives is the best of the window; THEN order what survived by
      // time. Sorting by time first would fill the feed with whatever happened
      // to arrive most recently, which on a quiet hour is three press releases
      // and a job posting.
      { $sort: { "doc.ai_score": -1, count: -1, "doc.raw_score": -1 } },
      { $limit: limit },
      // A deterministic base order; the real ordering is applied in Node below.
      { $sort: { latest_seen: -1 } },
    ]);

    // Liveliest first. The cut to `limit` above was made on the ranker's
    // judgement; this decides the order of what survived, so the story most is
    // being written about right now opens the list. `latest` breaks ties, so
    // once every candidate has gone cold and their heat has decayed to nothing,
    // this degrades to exactly "newest coverage first".
    const now = Date.now();
    for (const r of rows) {
      r.latest = latestOf(r.times, now) || r.latest_seen;
      r.heat = heatOf(r.times, now);
    }
    rows.sort((a, b) => b.heat - a.heat || new Date(b.latest) - new Date(a.latest));

    // When the collector last went and looked. The footer used to claim
    // "Rechecked every 15 minutes", which is a promise, not evidence — a creator
    // staring at an eight-hour-old top card could not tell a quiet news day from
    // a broken collector. Read from Redis, so this costs nothing on a page load.
    const checkedAt = await lastCheckedAt(cats);

    // Opening the feed is what "still using this" means. Not awaited: the
    // response must not wait on a bookkeeping write, and if it fails the worst
    // case is this account looks a little staler than it is.
    touchSeen(req.user.id);

    // Which of these this creator has already opened, in one query over the
    // fifteen keys actually being returned. A story stays badged NEW until they
    // click it — not until it gets old — so this flag is the badge.
    let seen = new Set();
    try {
      const keys = rows.map((r) => storyKey(r.doc));
      const marks = await StorySeen.find({ user: req.user.id, story: { $in: keys } })
        .select("story")
        .lean();
      seen = new Set(marks.map((m) => m.story));
    } catch (err) {
      // Unreadable read state means every card shows as unread, which is the
      // safe direction: a badge that should have gone is a smaller problem than
      // a feed that fails to load over a decoration.
      console.warn("[news] couldn't read seen state:", err.message);
    }

    return res.json({
      success: true,
      window_hours: hours,
      count: rows.length,
      checked_at: checkedAt,
      // ALWAYS their full selection, not the filtered subset. The client draws a
      // category switcher from this, and echoing back only the category it just
      // asked for would collapse that switcher to one chip and strand them
      // inside whichever category they happened to open.
      categories: mine.map((id) => ({ id, label: getCategory(id)?.label || id })),
      // Which one this response actually is.
      category: cats.length === 1 ? cats[0] : "",
      items: rows.map((r) => ({ ...shape(r.doc, r), seen: seen.has(storyKey(r.doc)) })),
    });
  } catch (err) {
    console.error("[news] GET / failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't load the feed." });
  }
});

/**
 * POST /news/refresh  { category? }
 *
 * Go and get the newest stories, then judge them.
 *
 * ── THIS USED TO ONLY RE-SCORE, AND THAT WAS THE BUG ─────────────────────────
 * The reasoning was sound — a full collection is over a minute of fan-out across
 * a dozen sources, far too long to hold a button press open, and the collector
 * runs on its own clock anyway — but the result was a button called "Fetch new
 * topics" that could not fetch a topic. Everything it could show you was already
 * in the database before you pressed it. When the collector was quiet, for any
 * of the several reasons it can be quiet, pressing it did nothing and said
 * nothing, and a ten-hour-old top story looked identical to a broken pipeline.
 *
 * It now runs the paid news source, which is one request and about a second, and
 * reaches minutes rather than hours back. The free sources stay on the
 * scheduler's clock. Both halves are throttled per CATEGORY, not per user, so
 * three presses, ten page loads and four people sharing a category still add up
 * to one paid fetch and one paid ranking pass.
 *
 * Coming back inside a cooldown is not an error — it means the feed is already
 * current — so the response says what happened rather than failing.
 */
router.post("/refresh", authenticateToken, async (req, res) => {
  try {
    const { profile } = await resolveProfile(req.user.id, req.body?.profile);
    let mine = (profile.categories || []).filter(isValidCategory);
    if (!mine.length) mine = [DEFAULT_CATEGORY];

    const asked = String(req.body?.category || "");
    const cats = asked && mine.includes(asked) ? [asked] : mine;

    let inserted = 0;
    let ranked = 0;
    let briefs = 0;
    let paid = false;

    for (const cat of cats) {
      const out = await fetchAndRank(cat);
      inserted += out.inserted || 0;
      ranked += out.ranked || 0;
      briefs += out.briefs || 0;
      if (!out.skipped) paid = true;
    }

    // `collected` is what actually came in off the wire. The client reports new
    // CARDS, which is a different and smaller number (most stories score too low
    // to reach the feed) — but when the two disagree loudly, this is the field
    // that says whether the fetch worked and the bar was high, or the fetch
    // never happened at all.
    return res.json({ success: true, collected: inserted, ranked, briefs, refreshed: paid });
  } catch (err) {
    console.error("[news] POST /refresh failed:", err);
    // The feed still renders from what is already ranked, so this is never worth
    // showing a creator an error over.
    return res.json({ success: true, collected: 0, ranked: 0, briefs: 0, refreshed: false });
  }
});

/**
 * GET /news/:id/brief — the 100-120 word read on this story.
 *
 * Its own endpoint rather than part of /news/:id because generating one takes a
 * few seconds the first time. Folded into the main read, it would hold back the
 * coverage list too, and the pane would sit blank while a creator waited for
 * prose they might not even scroll to. Split, the sources paint immediately and
 * the brief drops in when it lands. Almost always cached by then: the collector
 * pre-generates briefs for feed-visible stories after each ranking pass.
 */
router.get("/:id/brief", authenticateToken, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid id" });
  }
  try {
    const doc = await NewsItem.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ success: false, message: "Not found" });

    const brief = await ensureBrief(doc);
    return res.json({ success: true, brief, summary: doc.summary || "" });
  } catch (err) {
    console.error("[news] GET /:id/brief failed:", err);
    // Not an error the reader needs to see: the pane falls back to the summary
    // it already has rather than showing them a failure they cannot act on.
    return res.json({ success: true, brief: "" });
  }
});

/** GET /news/:id — one story, plus every source that covered it. */
router.get("/:id", authenticateToken, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid id" });
  }
  const doc = await NewsItem.findById(req.params.id).lean();
  if (!doc) return res.status(404).json({ success: false, message: "Not found" });

  // NEWEST FIRST. The list used to open with whoever broke the story, which put
  // the oldest account of a developing event at the top of the reading list —
  // the one most likely to have been overtaken by the time anyone opened it.
  const coverage = doc.cluster_id
    ? await NewsItem.find({ category: doc.category, cluster_id: doc.cluster_id })
        .select("source title url published_at")
        .sort({ published_at: -1 })
        .lean()
    : [];

  return res.json({
    success: true,
    item: shape(doc, {
      count: coverage.length || 1,
      sources: [...new Set(coverage.map((c) => c.source))],
      // coverage is newest-first, so the tail broke it and the head is current.
      earliest: coverage.length ? coverage[coverage.length - 1].published_at : doc.first_seen_at,
      latest: coverage.length ? coverage[0].published_at : doc.first_seen_at,
    }),
    // Every link that covered it — this is what a creator opens to grab
    // screenshots and check facts before recording.
    coverage: coverage.map((c) => ({
      source: c.source, title: c.title, url: c.url, published_at: c.published_at,
    })),
  });
});

/**
 * What the read-state is keyed on: the cluster, falling back to the row.
 *
 * Must match what the client posts back, so both sides derive it the same way —
 * shape() sends the same two fields out as `story` and `id`.
 */
function storyKey(d) {
  return d?.cluster_id || String(d?._id || "");
}

/**
 * POST /news/seen  { story } | { stories: [...] }
 *
 * "I have looked at this one." Called when a card is opened, which is what
 * clears its NEW badge.
 *
 * ── WHY THE BADGE WAITS FOR A CLICK AND NOT A TIMER ──────────────────────────
 * The reference project dismisses its NEW chip after a card has been in the
 * viewport for 2.5 seconds, which suits a feed that is scrolled through. This
 * one is a shortlist of fifteen where the whole job is choosing between them —
 * a creator reads every headline before picking, so a dwell timer would clear
 * every badge on the list during the very scan the badges exist to help with.
 * Opening a story is the moment they actually dealt with it.
 *
 * Idempotent and cheap: an upsert per story, and re-marking one already marked
 * changes nothing. Failure is answered with success — losing a read mark means
 * a badge lingers, which is not worth an error in front of somebody.
 */
router.post("/seen", authenticateToken, async (req, res) => {
  try {
    const raw = Array.isArray(req.body?.stories)
      ? req.body.stories
      : [req.body?.story].filter(Boolean);

    // Capped: this is only ever called with what is on screen, and an unbounded
    // array would let one request write as many rows as it liked.
    const stories = [...new Set(raw.map((s) => String(s || "").trim()).filter(Boolean))].slice(0, 50);
    if (!stories.length) return res.json({ success: true, marked: 0 });

    await StorySeen.bulkWrite(
      stories.map((story) => ({
        updateOne: {
          filter: { user: req.user.id, story },
          // seen_at is insert-only: it anchors the TTL, and refreshing it on a
          // re-open would keep a story's read mark alive indefinitely for
          // somebody who keeps revisiting it.
          update: { $setOnInsert: { user: req.user.id, story, seen_at: new Date() } },
          upsert: true,
        },
      })),
      { ordered: false }
    );

    return res.json({ success: true, marked: stories.length });
  } catch (err) {
    // 11000 = two tabs marked the same story at once. Not a failure.
    if (err?.code !== 11000) console.error("[news] POST /seen failed:", err.message);
    return res.json({ success: true, marked: 0 });
  }
});

function shape(d, cluster = {}) {
  return {
    id: String(d._id),
    category: d.category || "",
    category_label: getCategory(d.category)?.label || "",
    story: d.cluster_id || "",
    title: d.title,
    url: d.url,
    summary: d.summary || "",
    brief: d.brief || "",
    source: d.source,
    source_kind: d.source_kind,
    score: d.ai_score,
    angle: d.ai_angle || "",
    why: d.ai_reason || "",
    published_at: d.published_at,
    // The cluster's own clock: when the FIRST of its members reached us. The
    // representative row is whichever scored best, which may well be an outlet
    // that picked the story up hours late, and showing its timestamp made a
    // story look newer than it was.
    first_seen_at: cluster.earliest || d.first_seen_at,
    // THE ONE THE FEED PRINTS AND SORTS ON: when the newest write-up of this
    // story went out. `first_seen_at` above is kept for the "NEW" flag's own
    // reasoning and for anything that wants the break time, but a card leading
    // with it told creators a live story was seventeen hours stale.
    latest_at: cluster.latest || d.published_at || d.first_seen_at,
    // How many separate sources carried this story — the "how big is it" signal.
    sources: cluster.sources || [d.source],
    source_count: cluster.count || 1,
    points: d.meta?.points ?? null,
  };
}

export default router;

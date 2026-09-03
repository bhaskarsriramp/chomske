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
import authenticateToken from "../middleware/authenticateToken.js";

const router = express.Router();

/**
 * GET /news
 *   ?hours=24        window on first_seen_at (default 24, max 72)
 *   ?min_score=4     lowest ai_score to include (default 4 — below that is noise)
 *   ?limit=25        max clusters (default 25, max 100)
 *   ?source=hn       optional single-source filter
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    const hours = Math.min(72, Math.max(1, parseInt(req.query.hours, 10) || 24));
    const minScore = Math.max(0, Math.min(10, parseInt(req.query.min_score, 10) || 4));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));

    const match = {
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
        },
      },
      { $sort: { "doc.ai_score": -1, count: -1, "doc.raw_score": -1 } },
      { $limit: limit },
    ]);

    return res.json({
      success: true,
      window_hours: hours,
      count: rows.length,
      items: rows.map((r) => shape(r.doc, r)),
    });
  } catch (err) {
    console.error("[news] GET / failed:", err);
    return res.status(500).json({ success: false, message: "Couldn't load the feed." });
  }
});

/** GET /news/:id — one story, plus every source that covered it. */
router.get("/:id", authenticateToken, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid id" });
  }
  const doc = await NewsItem.findById(req.params.id).lean();
  if (!doc) return res.status(404).json({ success: false, message: "Not found" });

  const coverage = doc.cluster_id
    ? await NewsItem.find({ cluster_id: doc.cluster_id })
        .select("source title url published_at")
        .sort({ published_at: 1 })
        .lean()
    : [];

  return res.json({
    success: true,
    item: shape(doc, { count: coverage.length || 1, sources: [...new Set(coverage.map((c) => c.source))] }),
    // Every link that covered it — this is what a creator opens to grab
    // screenshots and check facts before recording.
    coverage: coverage.map((c) => ({
      source: c.source, title: c.title, url: c.url, published_at: c.published_at,
    })),
  });
});

function shape(d, cluster = {}) {
  return {
    id: String(d._id),
    story: d.cluster_id || "",
    title: d.title,
    url: d.url,
    summary: d.summary || "",
    source: d.source,
    source_kind: d.source_kind,
    score: d.ai_score,
    angle: d.ai_angle || "",
    why: d.ai_reason || "",
    published_at: d.published_at,
    first_seen_at: d.first_seen_at,
    // How many separate sources carried this story — the "how big is it" signal.
    sources: cluster.sources || [d.source],
    source_count: cluster.count || 1,
    points: d.meta?.points ?? null,
  };
}

export default router;

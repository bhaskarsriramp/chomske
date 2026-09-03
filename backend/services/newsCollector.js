/**
 * newsCollector.js — run every source, dedupe, store.
 *
 * ── ONE DEAD SOURCE MUST NEVER KILL A RUN ────────────────────────────────────
 * Promise.allSettled, not Promise.all. Each source reads a different surface and
 * fails for its own reasons — a feed goes 503, GitHub rate-limits, arXiv is slow.
 * With Promise.all, one rejection throws away every item the other ten sources
 * already fetched successfully. (Exactly the outage the reference project hit in
 * xWarmListService: a single ReferenceError inside one source took down all four.)
 *
 * ── SCORING IS DETERMINISTIC HERE ────────────────────────────────────────────
 * raw_score is computed without any model call, so the feed is useful (and
 * ordered) even if the AI ranker never runs or its key is missing. The ranker
 * refines; it isn't a dependency.
 */
import NewsItem from "../models/NewsItem.js";
import { allSources } from "./sources/index.js";
import { urlHash, titleSignature } from "../utils/normalize.js";

// How much a source's ORIGINALITY is worth. A primary announcement is the story;
// an outlet write-up is a report OF the story, and arrives later.
const KIND_WEIGHT = {
  primary:   1.00,
  paper:     0.75,
  community: 0.70,
  outlet:    0.55,
};

const MAX_AGE_HOURS = parseInt(process.env.NEWS_MAX_AGE_HOURS || "48", 10);

/**
 * Deterministic score, 0–1. Recency dominates on purpose: this product's promise
 * is being early, so a strong story from yesterday should still lose to a decent
 * one from an hour ago.
 */
function scoreItem(item) {
  const when = item.published_at || new Date();
  const ageHours = Math.max(0, (Date.now() - when.getTime()) / 3600000);

  // Half-life of 8 hours — a story is worth half as much by the end of the day.
  const recency = Math.pow(0.5, ageHours / 8);
  const kind = KIND_WEIGHT[item.source_kind] ?? 0.5;

  // HN votes are the only real engagement signal available for free. Logarithmic
  // because the gap between 5 and 50 points matters far more than 500 to 545.
  const points = Number(item.meta?.points) || 0;
  const engagement = points > 0 ? Math.min(1, Math.log10(points + 1) / 2.5) : 0;

  return +(recency * 0.55 + kind * 0.30 + engagement * 0.15).toFixed(4);
}

/**
 * Run one full collection pass.
 * @returns {{ fetched, inserted, duplicates, bySource, errors }}
 */
export async function collectNews() {
  const started = Date.now();
  const sources = allSources();

  const settled = await Promise.allSettled(sources.map((s) => s.run()));

  const items = [];
  const bySource = {};
  const errors = [];

  settled.forEach((res, i) => {
    const name = sources[i].name;
    if (res.status === "fulfilled") {
      const got = res.value || [];
      bySource[name] = got.length;
      items.push(...got);
    } else {
      bySource[name] = 0;
      errors.push(`${name}: ${res.reason?.message || res.reason}`);
    }
  });

  const cutoff = Date.now() - MAX_AGE_HOURS * 3600000;
  let inserted = 0;
  let duplicates = 0;
  let skipped = 0;

  for (const item of items) {
    if (!item?.url || !item?.title) { skipped++; continue; }

    // Undated items are treated as "now" — most feeds date correctly, and
    // dropping the few that don't would lose real stories.
    const published = item.published_at || new Date();
    if (published.getTime() < cutoff) { skipped++; continue; }

    const doc = {
      source: item.source,
      source_kind: item.source_kind || "outlet",
      title: item.title,
      url: item.url,
      summary: item.summary || "",
      url_hash: urlHash(item.url),
      title_sig: titleSignature(item.title),
      // The cluster IS the title signature. Rows are never merged or dropped —
      // five outlets covering one launch stay five rows, because that count is
      // itself a signal that the story is big. The feed collapses them at READ
      // time to one entry with a coverage count, which is both a better display
      // and a better ranking input than silently discarding four of them.
      cluster_id: titleSignature(item.title),
      published_at: published,
      meta: item.meta || {},
      raw_score: scoreItem({ ...item, published_at: published }),
    };

    try {
      // A field may appear in $setOnInsert OR $set, never both — Mongo rejects the
      // update outright with "would create a conflict at <path>", and because the
      // whole doc was in $setOnInsert while meta.points was in $set, EVERY upsert
      // failed. So the split is explicit: identity fields are insert-only, and the
      // two things that legitimately change on re-sighting live in $set.
      //
      // first_seen_at stays insert-only on purpose: re-seeing a story must not
      // reset it, or "you're early on this" resets on every poll and becomes a lie.
      const { raw_score, meta, ...insertOnly } = doc;
      const r = await NewsItem.updateOne(
        { url_hash: doc.url_hash },
        {
          $setOnInsert: { ...insertOnly, first_seen_at: new Date(), created_at: new Date() },
          // HN points climb after first sight, so score and meta refresh each pass.
          $set: { raw_score, meta },
        },
        { upsert: true }
      );
      if (r.upsertedCount) inserted++;
      else duplicates++;
    } catch (err) {
      // 11000 = another concurrent pass inserted it first. Not an error.
      if (err?.code === 11000) duplicates++;
      else errors.push(`upsert ${item.source}: ${err.message}`);
    }
  }

  const out = {
    fetched: items.length,
    inserted,
    duplicates,
    skipped,
    bySource,
    errors,
    ms: Date.now() - started,
  };

  console.log(
    `[news] collected ${out.fetched} → ${inserted} new, ${duplicates} dup, ${skipped} stale ` +
    `in ${(out.ms / 1000).toFixed(1)}s` + (errors.length ? ` · ${errors.length} error(s)` : "")
  );
  // Grouped, not one line each. A single systematic bug produces one error per
  // item — the first run of this printed the same message 694 times and buried
  // everything else. Distinct message + count is what's actually diagnostic.
  if (errors.length) {
    const grouped = new Map();
    for (const e of errors) grouped.set(e, (grouped.get(e) || 0) + 1);
    for (const [msg, n] of [...grouped].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      console.warn(`[news]   ${n}× ${msg}`);
    }
  }

  return out;
}

export default { collectNews };

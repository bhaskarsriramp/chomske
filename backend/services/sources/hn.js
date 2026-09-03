/**
 * hn.js — Hacker News, via the Algolia search API.
 *
 * Algolia rather than the Firebase API because it supports a TIME FILTER
 * (`created_at_i > …`), so we can ask for "AI stories from the last N hours"
 * in one request instead of walking 500 story ids and fetching each.
 *
 * Live-probed: a 24h window on "AI" returned 233 stories — and almost all of
 * them sat at 1–2 points. That's the reason for MIN_POINTS below: HN's real
 * value here isn't coverage, it's that the community already filtered. An
 * unvoted HN submission is not a signal, it's a link someone pasted.
 */
import { cleanText, parseDate } from "../../utils/normalize.js";

const ENDPOINT = "https://hn.algolia.com/api/v1/search_by_date";

// Queries are OR'd across separate requests — Algolia's relevance works better
// on one concept at a time than on a long boolean string.
const LOOKBACK_HOURS = parseInt(process.env.NEWS_LOOKBACK_HOURS || "36", 10);
// Two upvotes is enough to mean "at least one other person thought this mattered",
// while still catching stories in their first hour before they've accumulated.
const MIN_POINTS = parseInt(process.env.HN_MIN_POINTS || "2", 10);

/** @param {string[]} queries — from the category catalog; HN only knows some domains. */
export async function fetchHackerNews(queries = []) {
  if (!queries.length) return [];
  const since = Math.floor(Date.now() / 1000) - LOOKBACK_HOURS * 3600;
  const out = [];
  const seen = new Set();

  for (const q of queries) {
    const url =
      `${ENDPOINT}?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=50` +
      `&numericFilters=created_at_i>${since},points>=${MIN_POINTS}`;

    let data;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;      // one bad query must not lose the others
      data = await res.json();
    } catch {
      continue;
    }

    for (const h of data.hits || []) {
      // Ask HN / text posts have no external url — link to the HN thread itself.
      const link = h.url || `https://news.ycombinator.com/item?id=${h.objectID}`;
      if (seen.has(link)) continue;   // the same story matches several queries
      seen.add(link);

      out.push({
        source: "hn",
        source_kind: "community",
        title: cleanText(h.title, 300),
        url: link,
        summary: cleanText(h.story_text || "", 400),
        published_at: parseDate(h.created_at),
        meta: {
          points: h.points || 0,
          comments: h.num_comments || 0,
          hn_id: h.objectID,
          hn_url: `https://news.ycombinator.com/item?id=${h.objectID}`,
        },
      });
    }
  }

  return out;
}

export default { fetchHackerNews };

/**
 * googleNews.js — Google News RSS.
 *
 * Free, no key, and supports a `when:1d` operator so we get a real freshness
 * window rather than whatever the feed felt like returning.
 *
 * Two quirks worth knowing:
 *   1. Links are news.google.com redirectors, not the publisher's URL. They still
 *      dedupe consistently (the redirector is stable per article), but the
 *      canonical publisher URL isn't available without following each one — not
 *      worth a request per item. If the same story also arrives from HN or an
 *      outlet feed with its real URL, titleSignature is what collapses them.
 *   2. Titles carry a " - Publisher" suffix, stripped below so the signature
 *      matches the same headline from a direct feed.
 */
import Parser from "rss-parser";
import { cleanText, parseDate } from "../../utils/normalize.js";

const parser = new Parser({ timeout: 15000 });

/**
 * @param {string[]} queries  what to search for — comes from the category catalog
 * @param {{hl,gl,ceid}} locale  which Google News edition. An Indian creator
 *   covering markets wants Indian coverage; AI news reads better from the US
 *   edition. Getting this wrong is the difference between local and irrelevant.
 */
export async function fetchGoogleNews(queries = [], locale = { hl: "en-US", gl: "US", ceid: "US:en" }) {
  const out = [];
  const seen = new Set();

  for (const q of queries) {
    const url =
      `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:1d")}` +
      `&hl=${locale.hl}&gl=${locale.gl}&ceid=${locale.ceid}`;

    let feed;
    try {
      feed = await parser.parseURL(url);
    } catch {
      continue;
    }

    for (const item of feed.items || []) {
      if (!item.link || !item.title) continue;
      if (seen.has(item.link)) continue;   // queries overlap heavily
      seen.add(item.link);

      // "Headline here - TechCrunch" → "Headline here"
      const title = cleanText(item.title, 300).replace(/\s+-\s+[^-]{2,40}$/, "");

      out.push({
        source: "google-news",
        source_kind: "outlet",
        title,
        url: item.link,
        summary: cleanText(item.contentSnippet || "", 300),
        published_at: parseDate(item.isoDate || item.pubDate),
        meta: { query: q, publisher: cleanText(item.source?.name || "", 80) },
      });
    }
  }

  return out;
}

export default { fetchGoogleNews };

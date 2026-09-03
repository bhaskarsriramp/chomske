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

const QUERIES = [
  "artificial intelligence",
  "OpenAI",
  "Anthropic Claude",
  "Google Gemini AI",
  "AI model release",
];

export async function fetchGoogleNews() {
  const out = [];
  const seen = new Set();

  for (const q of QUERIES) {
    const url =
      `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:1d")}` +
      `&hl=en-US&gl=US&ceid=US:en`;

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

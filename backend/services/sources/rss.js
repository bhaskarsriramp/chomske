/**
 * rss.js — one generic fetcher for every plain RSS/Atom feed.
 *
 * All of these were live-probed and returned 200. Two notes from that probe:
 *   • anthropic.com has NO feed (rss.xml → 404). Their announcements arrive
 *     second-hand via HN and the outlets until that changes.
 *   • VentureBeat 308-redirects; rss-parser follows redirects, so it's fine here
 *     even though a bare fetch() would need { redirect: "follow" }.
 */
import Parser from "rss-parser";
import { cleanText, parseDate } from "../../utils/normalize.js";

const parser = new Parser({
  timeout: 15000,
  // Some feeds reject the default node user-agent outright.
  headers: { "User-Agent": "Mozilla/5.0 (compatible; hinglish-news/1.0)" },
});

/**
 * Fetch one feed. The feed definition comes from the category catalog
 * (services/categories.js), which is what lets a new category add its own
 * authorities without touching this file.
 *
 * @param {{source,kind,url,filter?}} feed — `filter: true` marks a broad feed
 *   (Ars Technica, The Verge) that carries plenty off-topic for the category, so
 *   it gets narrowed by `filterTerms` before reaching the ranker. Without that,
 *   a general-tech feed fills an AI channel's input with phone reviews and the
 *   token cost goes with it.
 * @param {RegExp|null} filterTerms — the category's on-topic test.
 */
export async function fetchRssFeed({ source, kind, url, filter = false }, filterTerms = null) {
  let feed;
  try {
    feed = await parser.parseURL(url);
  } catch {
    return []; // the collector logs the empty result; one dead feed isn't fatal
  }

  const out = [];
  for (const item of feed.items || []) {
    if (!item.link || !item.title) continue;

    const title = cleanText(item.title, 300);
    const summary = cleanText(item.contentSnippet || item.content || "", 400);

    if (filter && filterTerms && !filterTerms.test(`${title} ${summary}`)) continue;

    out.push({
      source,
      source_kind: kind,
      title,
      url: item.link,
      summary,
      published_at: parseDate(item.isoDate || item.pubDate),
      meta: {},
    });
  }
  return out;
}

export default { fetchRssFeed };

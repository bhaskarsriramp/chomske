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

export const RSS_FEEDS = [
  // Primary — the organisation announcing its own work. Earliest and most reliable.
  { source: "openai",      kind: "primary", url: "https://openai.com/news/rss.xml" },
  { source: "deepmind",    kind: "primary", url: "https://deepmind.google/blog/rss.xml" },
  { source: "huggingface", kind: "primary", url: "https://huggingface.co/blog/feed.xml" },

  // Outlets — later, but written for people, which is closer to video material.
  { source: "techcrunch-ai", kind: "outlet", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
  { source: "venturebeat-ai", kind: "outlet", url: "https://venturebeat.com/category/ai/feed/" },
  { source: "arstechnica",   kind: "outlet", url: "https://feeds.arstechnica.com/arstechnica/index" },
  { source: "theverge",      kind: "outlet", url: "https://www.theverge.com/rss/index.xml" },
];

// General-tech feeds (Ars, Verge) carry plenty that has nothing to do with AI.
// Filtering here keeps the ranker's input — and therefore its token cost — from
// being mostly phone reviews.
const AI_TERMS = /\b(ai|a\.i\.|artificial intelligence|llm|gpt|claude|gemini|openai|anthropic|deepmind|machine learning|neural|model|chatbot|nvidia|gpu|agent|transformer|copilot|hugging ?face|inference|diffusion)\b/i;
const NEEDS_FILTER = new Set(["arstechnica", "theverge"]);

export async function fetchRssFeed({ source, kind, url }) {
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

    if (NEEDS_FILTER.has(source) && !AI_TERMS.test(`${title} ${summary}`)) continue;

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

export default { fetchRssFeed, RSS_FEEDS };

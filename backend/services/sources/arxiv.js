/**
 * arxiv.js — new AI papers.
 *
 * The earliest signal there is: a paper lands here days or weeks before anyone
 * writes it up. Most papers are not video material, which the ranker handles —
 * this fetcher's job is only to make sure the genuinely big ones (a new model,
 * a result that breaks a benchmark) aren't missed because we were waiting for
 * TechCrunch to notice.
 *
 * MUST be https — the http endpoint 301s and `fetch` won't follow it by default.
 * Returns Atom XML, not JSON, so it's parsed with the shared RSS parser.
 */
import Parser from "rss-parser";
import { cleanText, parseDate } from "../../utils/normalize.js";

const parser = new Parser({ timeout: 15000 });

// cs.AI (artificial intelligence), cs.LG (learning), cs.CL (language).
// cs.CV is deliberately out — computer-vision volume is enormous and rarely
// makes AI-news video content.
const CATEGORIES = ["cs.AI", "cs.LG", "cs.CL"];
const PER_CATEGORY = 25;

export async function fetchArxiv() {
  const out = [];

  for (const cat of CATEGORIES) {
    const url =
      `https://export.arxiv.org/api/query?search_query=cat:${encodeURIComponent(cat)}` +
      `&sortBy=submittedDate&sortOrder=descending&max_results=${PER_CATEGORY}`;

    let feed;
    try {
      feed = await parser.parseURL(url);
    } catch {
      continue; // one category failing must not lose the rest
    }

    for (const item of feed.items || []) {
      if (!item.link || !item.title) continue;
      out.push({
        source: "arxiv",
        source_kind: "paper",
        // arXiv titles arrive with newlines and runs of spaces from the LaTeX.
        title: cleanText(item.title, 300),
        url: item.link,
        summary: cleanText(item.contentSnippet || item.content || "", 500),
        published_at: parseDate(item.isoDate || item.pubDate),
        meta: { category: cat, authors: cleanText(item.creator || "", 200) },
      });
    }
  }

  return out;
}

export default { fetchArxiv };

/**
 * sources/index.js — the source registry.
 *
 * Every fetcher returns the SAME shape so the collector never special-cases:
 *   { source, source_kind, title, url, summary, published_at, meta }
 *
 * `source_kind` drives the ranker's weighting, and the distinction is the whole
 * point of a be-first product:
 *   primary   — the org itself announcing (OpenAI, DeepMind, GitHub release).
 *               Earliest possible signal; everything else is downstream of it.
 *   paper     — arXiv. Earlier still, but most papers are not video material.
 *   community — HN. Not first, but the best available proxy for "will people care".
 *   outlet    — TechCrunch, Verge, Google News. Latest, but written for humans.
 *
 * Every source is free and needs no API key. GITHUB_TOKEN is optional and only
 * raises GitHub's rate limit (60/hr → 5,000/hr); nothing breaks without it.
 */
import { fetchHackerNews } from "./hn.js";
import { fetchArxiv } from "./arxiv.js";
import { fetchGitHubReleases } from "./github.js";
import { fetchGoogleNews } from "./googleNews.js";
import { fetchRssFeed, RSS_FEEDS } from "./rss.js";

/**
 * Everything to run in one collection pass. Each entry is { name, run }, where
 * run() resolves to an array of normalized items (and is allowed to reject —
 * the collector isolates failures per source).
 */
export function allSources() {
  const list = [
    { name: "hn",          run: () => fetchHackerNews() },
    { name: "arxiv",       run: () => fetchArxiv() },
    { name: "github",      run: () => fetchGitHubReleases() },
    { name: "google-news", run: () => fetchGoogleNews() },
  ];

  for (const feed of RSS_FEEDS) {
    list.push({ name: feed.source, run: () => fetchRssFeed(feed) });
  }

  return list;
}

export default { allSources };

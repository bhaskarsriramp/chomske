/**
 * sources/index.js — build the fetcher list for ONE category.
 *
 * Every fetcher returns the SAME shape so the collector never special-cases:
 *   { source, source_kind, title, url, summary, published_at, meta }
 *
 * `source_kind` drives the ranker's weighting, and the distinction is the whole
 * point of a be-first product:
 *   primary   — the org itself announcing. Earliest possible signal.
 *   paper     — arXiv. Earlier still, but most papers are not video material.
 *   community — HN. Not first, but the best free proxy for "will people care".
 *   outlet    — written for humans, so closest to video material, and latest.
 *
 * ── WHY THIS TAKES A CATEGORY ────────────────────────────────────────────────
 * The source mix is not universal. HN knows tech and nothing about cricket;
 * arXiv and GitHub are meaningless outside research and software. Google News
 * takes an arbitrary query and covers everything, which is why it is the one
 * source every category gets. Asking for a category returns only the fetchers
 * that can actually say something about it, so a sports pass never spends a
 * request on arXiv.
 *
 * Every source is free and needs no API key. GITHUB_TOKEN is optional and only
 * raises GitHub's rate limit (60/hr → 5,000/hr); nothing breaks without it.
 */
import { fetchHackerNews } from "./hn.js";
import { fetchArxiv } from "./arxiv.js";
import { fetchGitHubReleases } from "./github.js";
import { fetchGoogleNews } from "./googleNews.js";
import { fetchRssFeed } from "./rss.js";
import { fetchApidirectNews } from "./apidirectNews.js";
import { getCategory } from "../categories.js";

/**
 * @param {string} categoryId
 * @param {object} opts
 * @param {boolean} opts.fast   only sources that answer in about a second. A
 *   full pass fans out across a dozen feeds and takes over a minute, which is
 *   far too long to hold a button press open — but the paid news source is a
 *   single HTTP request, so a Fetch can genuinely bring in new stories without
 *   the wait. See POST /news/refresh.
 * @param {boolean} opts.userInitiated  somebody is waiting on this, so the paid
 *   source uses its shorter gap between passes.
 * @returns {{name, run}[]} — run() resolves to normalized items, and is allowed
 *   to reject; the collector isolates failures per source.
 */
export function allSources(categoryId, { fast = false, userInitiated = false } = {}) {
  const cat = getCategory(categoryId);
  if (!cat) return [];

  const list = [];

  // The only paid source, and the only one that can be minutes fresh. First in
  // the list because on a fast pass it is the whole list.
  list.push({
    name: "apidirect-news",
    run: () => fetchApidirectNews(cat, { userInitiated }),
  });

  if (fast) return list;

  // Universal: works for any topic, no key, real freshness window.
  if (cat.googleNews?.length) {
    list.push({ name: "google-news", run: () => fetchGoogleNews(cat.googleNews, cat.locale) });
  }

  // Tech-shaped domains only. HN has no useful signal on film or exams.
  if (cat.hn?.length) {
    list.push({ name: "hn", run: () => fetchHackerNews(cat.hn) });
  }
  if (cat.arxiv) list.push({ name: "arxiv", run: () => fetchArxiv() });
  if (cat.github) list.push({ name: "github", run: () => fetchGitHubReleases() });

  for (const feed of cat.rss || []) {
    list.push({ name: feed.source, run: () => fetchRssFeed(feed, cat.filterTerms || null) });
  }

  return list;
}

export default { allSources };

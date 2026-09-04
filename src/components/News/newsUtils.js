/**
 * newsUtils.js — display helpers shared by the feed and the story drawer.
 *
 * Lives in its own module rather than at the bottom of NewsFeed.js because
 * StoryDetail needs them too, and NewsFeed imports StoryDetail — putting them in
 * either component would make the two files import each other.
 */

/**
 * Human names for the backend's source slugs (backend/services/sources/).
 * Anything not listed falls back to a tidied version of the slug itself, so
 * adding a feed server-side never leaves a raw id showing in the UI.
 */
const SOURCE_LABELS = {
  "hn": "Hacker News",
  "arxiv": "arXiv",
  "github": "GitHub",
  "google-news": "Google News",
  "openai": "OpenAI",
  "deepmind": "DeepMind",
  "huggingface": "Hugging Face",
  "techcrunch-ai": "TechCrunch",
  "venturebeat-ai": "VentureBeat",
  "arstechnica": "Ars Technica",
  "theverge": "The Verge",
};

export function sourceLabel(slug) {
  if (!slug) return "";
  return (
    SOURCE_LABELS[slug] ||
    String(slug).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/** Compact relative time. Feeds are scanned, not read — "3h" beats a timestamp. */
export function timeAgo(value) {
  if (!value) return "";
  const ms = Date.now() - new Date(value).getTime();
  if (Number.isNaN(ms)) return "";

  const mins = Math.round(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;

  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;

  const days = Math.round(hrs / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

// isFresh() lived here: true while a story was under three hours old, which is
// what the NEW badge used to mean. The badge now means "you have not opened
// this" (per-user read state — see StorySeen on the server), and nothing else
// wanted a freshness boolean, so the helper went with it rather than staying as
// an export with no callers.


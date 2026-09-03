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

/**
 * What kind of source this is. The distinction is the product's whole point:
 * an announcement is the event, coverage is a report of it written later.
 */
const KIND_LABELS = {
  primary: "Announcement",
  paper: "Paper",
  community: "Community",
  outlet: "Coverage",
};

export function kindLabel(kind) {
  return KIND_LABELS[kind] || "";
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

/**
 * Accent is reserved for the stories that actually deserve a video today —
 * if every card were coloured, the colour would say nothing.
 */
export function scoreStyle(score) {
  if (score >= 8) {
    return { color: "#fff", background: "var(--accent)", borderColor: "var(--accent)" };
  }
  if (score >= 6) {
    return { color: "var(--accent)", background: "var(--accent-soft)", borderColor: "#F7CFCF" };
  }
  return { color: "var(--ink-mute)", background: "var(--card)", borderColor: "var(--line)" };
}

/**
 * True while a story is still early. Based on first_seen_at — the moment WE first
 * saw it, not publish time, because publish dates are inconsistent across feeds
 * and a backdated republish would otherwise fake urgency.
 */
export function isFresh(firstSeenAt, withinHours = 3) {
  if (!firstSeenAt) return false;
  const ms = Date.now() - new Date(firstSeenAt).getTime();
  return !Number.isNaN(ms) && ms >= 0 && ms < withinHours * 3600000;
}


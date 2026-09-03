/**
 * normalize.js — turn messy source data into stable dedupe keys.
 *
 * Everything here exists because the same story arrives looking different from
 * every direction: the same URL carrying different tracking params, the same
 * headline with different punctuation, five outlets writing up one launch.
 */
import { createHash } from "crypto";

// Tracking junk that changes the URL string without changing the page. Google
// News in particular appends its own, so without this the same article
// re-inserts every poll.
const JUNK_PARAMS = /^(utm_|fbclid|gclid|mc_|ref|ref_src|source|cmpid|guccounter|_hsenc|_hsmi|igshid|si)/i;

/**
 * Canonical URL: lowercase host, no www, no tracking params, no trailing slash,
 * no fragment. Two links to the same article should produce one string.
 */
export function canonicalUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  let u;
  try {
    u = new URL(raw);
  } catch {
    return raw; // not parseable — hash it as-is rather than dropping the item
  }
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  u.hash = "";
  u.protocol = "https:"; // http vs https is not a different article

  for (const k of [...u.searchParams.keys()]) {
    if (JUNK_PARAMS.test(k)) u.searchParams.delete(k);
  }
  // Sorted, so ?a=1&b=2 and ?b=2&a=1 hash the same.
  u.searchParams.sort();

  let out = u.toString();
  out = out.replace(/\/$/, "").replace(/\?$/, "");
  return out;
}

/**
 * Dedupe key for a URL, optionally scoped.
 *
 * `scope` exists so the same article can be collected under two categories: an
 * AI funding round belongs in both ai_tech and business, and a single global key
 * would let whichever category ran first silently starve the other's feed.
 *
 * The scope is joined AFTER canonicalisation, never before. Prefixing the raw
 * string would make `new URL()` throw inside canonicalUrl, which falls back to
 * returning the input untouched — so tracking parameters would stop being
 * stripped and every Google News link would re-insert on each poll.
 */
export function urlHash(url, scope = "") {
  const canon = canonicalUrl(url);
  const key = scope ? `${scope}|${canon}` : canon;
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

// Words that carry no identifying signal in a headline. Kept deliberately short:
// over-stripping makes unrelated stories collide, which is worse than a duplicate.
const STOP = new Set([
  "a","an","the","for","and","or","but","of","to","in","on","at","by","with","from",
  "is","are","was","were","be","been","its","it","this","that","as","after","over",
  "new","now","says","say","said","how","why","what","will","can","could","just",
]);

/**
 * A signature for "same event, different write-up".
 *
 * Lowercase, strip punctuation, drop stopwords, keep the 6 most distinctive
 * (longest) words, sort them. "OpenAI Launches GPT-6 Today" and "GPT-6: OpenAI
 * launches its new model" collapse to the same key; unrelated stories don't.
 *
 * Six words is the tuned part — fewer collides unrelated stories, more and small
 * wording differences split one event into several rows.
 */
export function titleSignature(title) {
  const words = String(title || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

  if (!words.length) return "";

  const distinctive = [...new Set(words)]
    .sort((a, b) => b.length - a.length)
    .slice(0, 6)
    .sort();

  return distinctive.join("-");
}

/** Collapse whitespace and cap length — feed text arrives with all sorts in it. */
export function cleanText(s, max = 400) {
  return String(s || "")
    .replace(/<[^>]*>/g, " ")      // strip HTML that RSS summaries are full of
    .replace(/&\w+;/g, " ")        // and their entities
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Parse whatever a source calls a date. Returns null rather than Invalid Date. */
export function parseDate(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default { canonicalUrl, urlHash, titleSignature, cleanText, parseDate };

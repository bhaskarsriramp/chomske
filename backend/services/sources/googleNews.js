/**
 * googleNews.js: Google News RSS.
 *
 * Free, no key, and supports a `when:1d` operator so we get a real freshness
 * window rather than whatever the feed felt like returning.
 *
 * Two quirks worth knowing:
 *   1. Links are news.google.com redirectors, not the publisher's URL. They still
 *      dedupe consistently (the redirector is stable per article), but the
 *      canonical publisher URL isn't available without following each one, not
 *      worth a request per item. If the same story also arrives from HN or an
 *      outlet feed with its real URL, titleSignature is what collapses them.
 *   2. Titles carry a " - Publisher" suffix, stripped below so the signature
 *      matches the same headline from a direct feed.
 */
import Parser from "rss-parser";
import { cleanText, parseDate } from "../../utils/normalize.js";

const parser = new Parser({ timeout: 15000 });

/**
 * The most items ONE query may contribute to a pass.
 *
 * ── WHY A CAP, WHEN EVERY ITEM IS SCORED INDEPENDENTLY ANYWAY ────────────────
 * Because they are not all scored. Google News answers a broad query with up to
 * 100 items and a narrow one with six, and measured on this catalog the spread
 * was exactly that wide: "artificial intelligence" and "bitcoin price" returned
 * 100 each while "unicorn startup" returned 6. The ranker then reads the top
 * NEWS_RANK_BATCH*3 rows by raw_score, and google-news items all share one
 * source_kind, so within a pass they are separated by recency alone. A query
 * that returns 100 fresh items therefore does not just contribute more, it
 * occupies the ranking window and the other queries' stories are never judged
 * at all: they sit at ai_score -1, which the feed filters out.
 *
 * So the widest query in a category silently decides what the category is
 * about. Capping every query to the same ceiling makes the catalog's list mean
 * what it looks like it means, one line per facet, each with an equal say.
 */
const PER_QUERY = Math.max(1, parseInt(process.env.NEWS_GOOGLE_PER_QUERY || "25", 10));

/**
 * Google News titles end in " - Publisher". That suffix is the ONLY place the
 * publisher's name appears in this feed.
 *
 * ── THE FIELD THAT LOOKED LIKE THE ANSWER IS EMPTY ───────────────────────────
 * The obvious source is `<source url="...">Publisher</source>` on each item,
 * and this file used to read it as `item.source?.name`. rss-parser does not map
 * that element, so `item.source` is `undefined` on every item and every
 * google-news row has been stored with `meta.publisher: ""` since this was
 * written. Nothing failed, the field was just always blank, which is why it
 * survived: the feed's own "78 sources · Reuters, CNBC +17" line reads the
 * `source` slug rather than this, so a blank publisher never showed up on a
 * card. Parsed off the title instead, which is where the data actually is.
 *
 * The name doubles as the row's `source`, matching what apidirectNews.js
 * already does and for the same reason: who PUBLISHED a story is what a creator
 * reads off a card, and "google-news" is our plumbing. Storing the plumbing
 * collapsed every one of these rows into a single source, so a story carried by
 * thirty outlets counted as one, both on the card and in anything that counts
 * how wide the net is.
 */
function splitPublisher(rawTitle) {
  const m = rawTitle.match(/^(.*\S)\s+-\s+([^-]{2,40})$/);
  if (!m) return { title: rawTitle, publisher: "" };
  return { title: m[1], publisher: m[2].trim() };
}

/** "The New York Times" → "the-new-york-times", for use as a `source` slug. */
function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

/**
 * @param {string[]} queries  what to search for, comes from the category catalog
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

    let taken = 0;

    for (const item of feed.items || []) {
      if (taken >= PER_QUERY) break;       // see PER_QUERY, one query must not flood the pass
      if (!item.link || !item.title) continue;
      if (seen.has(item.link)) continue;   // queries overlap heavily
      seen.add(item.link);
      taken++;

      // "Headline here - TechCrunch" → "Headline here" + "TechCrunch"
      const { title, publisher } = splitPublisher(cleanText(item.title, 300));

      out.push({
        // The publisher where we could read one, the aggregator where we could
        // not. Never a bare "google-news" when a real name was on offer.
        source: slugify(publisher) || "google-news",
        source_kind: "outlet",
        title,
        url: item.link,
        summary: cleanText(item.contentSnippet || "", 300),
        published_at: parseDate(item.isoDate || item.pubDate),
        meta: { via: "google-news", query: q, publisher: cleanText(publisher, 80) },
      });
    }
  }

  return out;
}

export default { fetchGoogleNews };

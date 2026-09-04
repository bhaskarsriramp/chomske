/**
 * apidirectNews.js — the only PAID source, and the only one that can be fresh.
 *
 * ── WHY A PAID SOURCE EXISTS AT ALL ──────────────────────────────────────────
 * Every free source here has a floor on how new its newest item can be. Google
 * News RSS takes `when:1d`, which is a bucket for "today", not a live window;
 * HN Algolia reaches back 36 hours and surfaces things once they get votes;
 * publisher RSS updates when the publisher feels like rebuilding it. On a
 * fast-moving day that floor is hours deep, and a product whose whole promise is
 * "cover it before everyone else" cannot be hours behind.
 *
 * apidirect's /v1/news/articles takes `time_published=1h` and answers with
 * articles minutes old — live-verified at 12 minutes on the first probe. That
 * gap is the reason to spend money here.
 *
 * ── WHAT IT COSTS, AND THE THREE THINGS THAT KEEP IT SMALL ───────────────────
 * $0.008 per REQUEST — not per article — so:
 *
 *   1. ASK BIG, ONCE. limit=30 costs exactly what limit=1 costs. Paginating or
 *      splitting a topic into more queries is the only way to overspend here.
 *   2. A FEW QUERIES, NOT ALL OF THEM. A category lists five Google News queries
 *      because those are free; this takes the first two.
 *   3. A GAP BETWEEN PASSES. Claimed per category through Redis (Mongo as the
 *      fallback), so fifteen-minute collector ticks, four users signing in and
 *      three Fetch presses still add up to one paid pass an hour.
 *
 * At the defaults that is 2 requests an hour per category — about $0.38 a day,
 * or roughly a third of what one ranking pass costs. Set APIDIRECT_NEWS_ENABLED
 * =false to turn it off entirely without a deploy; every free source keeps
 * working and the feed simply goes back to being a few hours behind.
 *
 * Failures are never fatal: no key, an exhausted key, or a bad response returns
 * [] and the collector carries on with the free sources. Which key failed and
 * why is recorded on the key's own row — see apidirectClient.markFailure.
 */
import { searchNewsArticles, isApidirectConfigured } from "../apidirectClient.js";
import { claimApidirectNews } from "../newsCadence.js";
import { cleanText } from "../../utils/normalize.js";

const ENABLED = () => String(process.env.APIDIRECT_NEWS_ENABLED || "true").toLowerCase() !== "false";

const QUERIES_PER_PASS = () => Math.max(1, parseInt(process.env.APIDIRECT_NEWS_QUERIES || "2", 10));
const RESULT_LIMIT = () => Math.min(100, Math.max(1, parseInt(process.env.APIDIRECT_NEWS_LIMIT || "30", 10)));

// The window asked for. `1d` rather than `1h` on purpose: the same request costs
// the same either way, and a day's worth means a pass that gets skipped (a
// restart, a claim lost to another instance) doesn't leave a hole nothing can
// fill. The collector's own MAX_AGE_HOURS decides what is too old to keep.
const TIME_WINDOW = () => String(process.env.APIDIRECT_NEWS_TIME || "1d");

// Minutes between paid passes for one category. The scheduled collector runs
// every 15; this deliberately does not.
const GAP_MIN = () => Math.max(1, parseInt(process.env.APIDIRECT_NEWS_GAP_MIN || "60", 10));

// The gap when a person pressed Fetch new topics. Shorter, because somebody is
// sitting there waiting and a refresh that cannot return anything new is the
// bug this whole file was written to fix — but not zero, or the button becomes
// a way to spend money by holding it down.
const USER_GAP_MIN = () => Math.max(1, parseInt(process.env.APIDIRECT_NEWS_USER_GAP_MIN || "10", 10));

let warnedNoKey = false;

/**
 * A stable slug for the publisher, used as the item's `source`.
 *
 * Publisher-level rather than a single "apidirect-news" bucket, because the
 * source is what the feed prints under a story ("Reuters, CNBC +3") and what
 * the ranker sees when it weighs how much to trust a headline. Where the story
 * came THROUGH is our plumbing and belongs in meta; who published it is the
 * part a creator is reading.
 */
function publisherSlug(a) {
  const host = String(a.domain || "").toLowerCase().replace(/^www\./, "");
  const root = host.split(".")[0];
  if (root && root.length > 1) return root.replace(/[^a-z0-9]+/g, "-").slice(0, 40);

  const name = String(a.source_name || "").toLowerCase();
  const slug = name.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return slug || "newswire";
}

/** Category locale ("en-IN"/"IN") → the endpoint's country/language pair. */
function localeFor(cat) {
  const gl = String(cat?.locale?.gl || "US").toLowerCase().slice(0, 2);
  const hl = String(cat?.locale?.hl || "en-US").toLowerCase().slice(0, 2);
  return { country: gl, language: hl };
}

/**
 * Which queries to spend on. A category can name its own with `apidirectNews`
 * when the free-source query that reads well on Google News is not the one
 * worth paying for; otherwise the head of the Google News list, which is
 * ordered broadest-first already.
 */
function queriesFor(cat) {
  const list = (cat.apidirectNews?.length ? cat.apidirectNews : cat.googleNews) || [];
  return list.slice(0, QUERIES_PER_PASS());
}

/**
 * @param {object} cat  the category config from categories.js
 * @param {{ userInitiated?: boolean }} opts  a person is waiting, so use the
 *   shorter gap between paid passes
 * @returns {Promise<Array>} items in the collector's shape — [] on any problem
 */
export async function fetchApidirectNews(cat, { userInitiated = false } = {}) {
  if (!ENABLED()) return [];
  if (!isApidirectConfigured()) {
    // Once per process, not once per category per fifteen minutes. A permanent
    // condition logged on a timer is how the line that matters gets buried.
    if (!warnedNoKey) {
      warnedNoKey = true;
      console.warn("[apidirect-news] no key configured — skipping (free sources still run)");
    }
    return [];
  }

  const queries = queriesFor(cat);
  if (!queries.length) return [];

  // The spend guard. Deliberately checked BEFORE the network, and deliberately
  // not fail-open: an unknown state must not bill.
  const gap = userInitiated ? USER_GAP_MIN() : GAP_MIN();
  if (!(await claimApidirectNews(cat.id, gap))) return [];

  const { country, language } = localeFor(cat);
  const out = [];
  let failed = 0;

  // Sequential, not Promise.all: one key allows 3 concurrent requests per
  // endpoint and two queries at a time buys nothing worth a 429 on a paid call.
  for (const q of queries) {
    let res;
    try {
      res = await searchNewsArticles(q, {
        limit: RESULT_LIMIT(),
        timePublished: TIME_WINDOW(),
        country,
        language,
      });
    } catch (err) {
      failed++;
      // Loud, because this is the difference between "quiet news day" and "the
      // paid source has been dead since Tuesday" — the exact confusion that a
      // silently-failing source creates.
      console.error(
        `[apidirect-news:${cat.id}] "${q}" failed: ${err.message}` +
        (err.keyExhausted ? " — key out of credit or capped, see /stats/apidirect" : "")
      );
      continue;
    }

    for (const a of res.articles) {
      out.push({
        source: publisherSlug(a),
        source_kind: "outlet",
        title: cleanText(a.title, 300),
        url: a.url,
        summary: cleanText(a.snippet, 300),
        // The publisher's own timestamp. The collector still stamps its own
        // first_seen_at, which is what "you are early on this" is measured on.
        published_at: a.published_at,
        meta: {
          via: "apidirect",
          query: q,
          publisher: cleanText(a.source_name, 80),
          image: a.photo_url || "",
          authors: (a.authors || []).slice(0, 3),
        },
      });
    }
  }

  console.log(
    `[apidirect-news:${cat.id}] ${queries.length} quer${queries.length === 1 ? "y" : "ies"} → ` +
    `${out.length} articles (~$${(queries.length * 0.008).toFixed(3)})` +
    (failed ? ` · ${failed} failed` : "")
  );
  return out;
}

export default { fetchApidirectNews };

/**
 * apidirectClient.js — read-only wrapper around apidirect.io.
 *
 * Two endpoints are used:
 *   GET /v1/youtube/video?url=<watch url>      →  video.duration (integer SECONDS)
 *   GET /v1/news/articles?query=…              →  fresh news, minutes old
 *
 * The duration is why this file first existed. Voice profiling only accepts
 * short-form videos, and there is no way to know a video's length from its URL —
 * so the check has to happen before we pay Gemini to read it. Rejecting a
 * 40-minute video for $0.005 instead of transcribing it for ₹60 is the trade.
 *
 * News articles came later, for a different reason: every free source in
 * services/sources has a floor on how fresh it can be (Google News RSS serves a
 * `when:1d` bucket, HN Algolia reaches back 36 hours), and this endpoint answers
 * `time_published=1h` with articles minutes old. It costs $0.008 per REQUEST —
 * not per result — so one call with limit=30 is one eighth of a cent for thirty
 * stories. See sources/apidirectNews.js for how often it is allowed to run.
 *
 * Auth: X-API-Key. Keys come from the ApidirectAPIs collection plus the
 * APIDIRECT_API_KEY env value, deduped, so keys can be added without a deploy.
 *
 * RATE LIMIT (apidirect.io/docs/rate-limits): 3 concurrent requests per endpoint
 * per key, with no RPM ceiling. So we hold a slot per (endpoint, key) below that
 * cap and rotate across keys — with N keys the ceiling is 3×N concurrent.
 *
 * ── FAILURE HANDLING: THE STATUS IS NOT ENOUGH ───────────────────────────────
 * Keys are NEVER deleted — they carry prepaid credit and a billing state is
 * usually temporary. What decides the response is apidirect's own `code`, not
 * the HTTP status, because 429 covers two opposite situations:
 *
 *   401 invalid_api_key / user_not_found      key is dead      → 1h cooldown
 *   402 payment_required                      free tier spent  → 1h cooldown
 *   403 account_blocked                       payment failed   → 1h cooldown
 *   429 daily_limit_exceeded                  SPEND CAP hit    → 1h cooldown
 *   429 monthly_limit_exceeded                SPEND CAP hit    → 1h cooldown
 *   429 concurrency_limit_exceeded            three at once    → 2.5s, retry
 *   429 upstream_rate_limit                   source throttled → 2.5s, retry
 *   5xx / network                             transient        → backoff, retry
 *
 * Treating a spending cap as a 2.5-second blip (which is what "429 → brief
 * cooldown" did) means the pool keeps hammering a key that will refuse every
 * request until midnight, and the feed goes quiet with nothing in the logs
 * saying why. Every terminal outcome is now written to the key's row as well —
 * see ApidirectAPIs and GET /stats/apidirect, which is how you tell a working
 * key from an exhausted one without reading logs.
 *
 * Uses global fetch (Node 18+) rather than axios, so this adds no dependency.
 */
import { createHash } from "crypto";
import ApidirectAPIs from "../models/ApidirectAPIs.js";
import { setCooldown, cooldownRemainingMs, acquireSlot, NoSlotError } from "../utils/limiter.js";

const YOUTUBE_VIDEO_URL = "https://apidirect.io/v1/youtube/video";
const NEWS_ARTICLES_URL = "https://apidirect.io/v1/news/articles";

const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 20000;
const KEY_COOLDOWN_SERVICE = "apidirect";
const KEY_EXHAUSTED_COOLDOWN_MS = 60 * 60 * 1000;  // auth/billing/spend cap — 1 hour
const TRANSIENT_429_COOLDOWN_MS = 2500;
const CANDIDATE_TTL_MS = 5 * 60 * 1000;

// apidirect `code` values that mean "this key cannot serve requests right now".
// A daily or monthly SPENDING cap arrives as 429, alongside codes that mean the
// exact opposite, so the code is the only thing that separates them.
const EXHAUSTED_CODES = new Set([
  "payment_required",        // 402 — free tier used up, no card on file
  "account_blocked",         // 403 — payment failure
  "daily_limit_exceeded",    // 429 — spending limit
  "monthly_limit_exceeded",  // 429 — spending limit
]);

const INVALID_CODES = new Set([
  "invalid_api_key",  // revoked or deleted
  "missing_api_key",
  "user_not_found",
]);

/** What to show a human on /stats/apidirect for a given failure. */
function healthStatus(status, code) {
  if (INVALID_CODES.has(code)) return "invalid";
  if (code === "account_blocked") return "blocked";
  if (EXHAUSTED_CODES.has(code)) return "exhausted";
  if (status === 401) return "invalid";
  if (status === 402 || status === 403) return "exhausted";
  if (status === 429) return "rate_limited";
  return "error";
}

function perKeyConcurrency() {
  const n = parseInt(process.env.APIDIRECT_PER_KEY_CONCURRENCY || "2", 10);
  return Math.min(Math.max(Number.isFinite(n) ? n : 2, 1), 3); // apidirect's cap is 3
}

export class ApidirectNotConfiguredError extends Error {
  constructor(msg) { super(msg); this.name = "ApidirectNotConfiguredError"; }
}
export class ApidirectRateLimitedError extends Error {
  constructor(msg = "apidirect.io rate limited") { super(msg); this.name = "ApidirectRateLimitedError"; }
}

const envKey = () => String(process.env.APIDIRECT_API_KEY || "").trim();
const keyId = (secret) => `apidirect_${createHash("sha256").update(String(secret)).digest("hex").slice(0, 8)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

function shuffle(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── Key pool ─────────────────────────────────────────────────────────────────
let _cands = null;
let _candsAt = 0;
let _candCount = 0;

async function candidates() {
  if (_cands && Date.now() - _candsAt < CANDIDATE_TTL_MS) return _cands;
  const byKey = new Map();
  const ek = envKey();
  if (ek) byKey.set(ek, { keyId: keyId(ek), apiKey: ek, label: "env" });
  try {
    const docs = await ApidirectAPIs.find({ active: { $ne: false } }).lean();
    for (const d of docs || []) {
      const k = String(d?.apidirect_key || "").trim();
      if (k && !byKey.has(k)) byKey.set(k, { keyId: keyId(k), apiKey: k, label: d.label || keyId(k) });
    }
  } catch (err) {
    console.error("[apidirect] couldn't load ApidirectAPIs:", err.message);
  }
  _cands = [...byKey.values()];
  _candsAt = Date.now();
  _candCount = _cands.length;
  return _cands;
}

/** Synchronous gate for callers — an env key, or keys seen on a prior load. */
export function isApidirectConfigured() {
  return !!envKey() || _candCount > 0;
}

/**
 * Load the key collection once at boot so isApidirectConfigured() is true
 * immediately after a restart. Without this a deployment that stores its keys
 * only in Mongo would report "not configured" until something forced a load —
 * and nothing would, because the callers are gated by that very check.
 */
export async function warmApidirectKeys() {
  _candsAt = 0;
  const c = await candidates();
  console.log(`[apidirect] ${c.length} key(s) loaded`);
  return c.length;
}

/** Grab a free slot on any live key, skipping cooled ones. */
async function acquireKeySlot(endpoint) {
  const cands = await candidates();
  if (!cands.length) {
    throw new ApidirectNotConfiguredError(
      "No apidirect keys configured — add one to the ApidirectAPIs collection or set APIDIRECT_API_KEY."
    );
  }

  const live = [];
  for (const c of shuffle(cands)) {
    if ((await cooldownRemainingMs(KEY_COOLDOWN_SERVICE, c.keyId)) <= 0) live.push(c);
  }
  if (!live.length) {
    throw new ApidirectRateLimitedError("All apidirect keys are cooling down — try again shortly.");
  }

  for (const c of live) {
    try {
      const slot = await acquireSlot(`${endpoint}:${c.keyId}`, perKeyConcurrency());
      return { ...c, release: slot.release };
    } catch (err) {
      if (err instanceof NoSlotError) continue;  // this key is busy, try the next
      throw err;
    }
  }
  throw new ApidirectRateLimitedError("All apidirect keys are at their concurrency cap.");
}

// ── Key health, written for humans ───────────────────────────────────────────
// Every write here is fire-and-forget on purpose: this is a record of what
// happened, never an input to what happens next (rotation reads the Redis
// cooldown), so a Mongo hiccup must not turn a working request into a failure.

/**
 * Upserted, not updated. A key supplied through APIDIRECT_API_KEY has no row in
 * the collection, so a plain update would match nothing and every failure on the
 * env key — the one most deployments actually run on — would be recorded
 * nowhere. Creating the row on first use means "which key is exhausted" has an
 * answer for every key that has ever served a request, however it was supplied.
 */
function keyRow(slot) {
  return {
    filter: { apidirect_key: slot.apiKey },
    onInsert: { label: slot.label || "", active: true, created_at: new Date() },
  };
}

function markSuccess(slot, endpoint) {
  const now = new Date();
  const { filter, onInsert } = keyRow(slot);
  ApidirectAPIs.updateOne(
    filter,
    {
      $setOnInsert: onInsert,
      $set: {
        status: "ok",
        last_used_at: now,
        last_success_at: now,
        last_status_code: 200,
        last_endpoint: endpoint,
        // Cleared, not left behind: a key that just served a request is not in
        // the state its last failure described, and a stale "exhausted" row is
        // exactly the reading that sends someone off buying another key.
        last_error_code: "",
        last_error: "",
        cooldown_until: null,
      },
      $inc: { request_count: 1 },
    },
    { upsert: true }
  ).catch(() => {});   // 11000 = another instance created the row first
}

/**
 * Record a terminal failure on a key.
 *
 * `track_403` keeps its name and its meaning from the reference project — the
 * count of auth/credit strikes — so anything already reading it still works.
 * It is incremented for the whole 401/402/403 + spend-cap family, because from
 * the operator's side those are one question: is this key still good?
 */
function markFailure(slot, { endpoint, status, code, message, cooldownMs = 0, strike = false }) {
  const now = new Date();
  const set = {
    status: healthStatus(status, code),
    last_used_at: now,
    last_status_code: status || null,
    last_error_code: code || "",
    last_error: String(message || "").slice(0, 300),
    last_error_at: now,
    last_endpoint: endpoint,
  };
  if (cooldownMs > 0) set.cooldown_until = new Date(now.getTime() + cooldownMs);

  const inc = { error_count: 1 };
  if (strike) inc.track_403 = 1;

  const { filter, onInsert } = keyRow(slot);
  ApidirectAPIs.updateOne(
    filter,
    { $setOnInsert: onInsert, $set: set, $inc: inc },
    { upsert: true }
  ).catch(() => {});
}

/** apidirect returns `{ error, code }` as JSON on every failure. */
function parseError(body) {
  try {
    const j = JSON.parse(body);
    return { code: String(j?.code || ""), message: String(j?.error || "") };
  } catch {
    return { code: "", message: String(body || "").slice(0, 200) };
  }
}

/**
 * Live health of every key in the pool, for GET /stats/apidirect.
 *
 * Reads the stored row and overlays the cooldown that is ACTUALLY in force
 * (Redis), because that is what rotation obeys — the row's `cooldown_until` is a
 * copy for anyone looking from outside the VPC and can be a few minutes stale.
 * Secrets never leave: only the last four characters, which is enough to match a
 * row against a key in the apidirect dashboard.
 */
export async function apidirectKeyHealth() {
  const cands = await candidates();
  const docs = await ApidirectAPIs.find({}).lean().catch(() => []);
  const byKey = new Map((docs || []).map((d) => [String(d.apidirect_key || "").trim(), d]));

  const out = [];
  for (const c of cands) {
    const d = byKey.get(c.apiKey) || {};
    const cooling = await cooldownRemainingMs(KEY_COOLDOWN_SERVICE, c.keyId).catch(() => 0);
    const stored = d.status || "ok";
    out.push({
      label: c.label,
      key_tail: `…${c.apiKey.slice(-4)}`,
      source: c.label === "env" ? "env" : "collection",
      // The row says WHY it last failed; the cooldown says whether rotation is
      // skipping it right now. When those disagree — a key cooling with nothing
      // recorded against it — the cooldown is the fact that matters.
      status: cooling > 0 && stored === "ok" ? "cooling" : stored,
      usable_now: cooling <= 0,
      cooldown_ms_left: cooling,
      last_error_code: d.last_error_code || "",
      last_error: d.last_error || "",
      last_error_at: d.last_error_at || null,
      last_endpoint: d.last_endpoint || "",
      track_403: d.track_403 || 0,
      request_count: d.request_count || 0,
      error_count: d.error_count || 0,
      last_success_at: d.last_success_at || null,
      last_used_at: d.last_used_at || null,
    });
  }
  return out;
}

/**
 * GET one endpoint with key rotation and retry.
 *
 * ── TWO BUDGETS, NOT ONE ─────────────────────────────────────────────────────
 * Rotating past a dead key and retrying a network blip are different events and
 * used to share a single four-attempt allowance. With five keys where four were
 * out of credit, the fifth — the working one — was never reached: each 402
 * consumed an attempt and the request failed with a live key sitting untouched
 * in the pool. A couple of 502s ahead of it made it worse, because a backoff
 * spent the allowance that rotation then could not use.
 *
 * So a request may now walk the WHOLE pool (every key gets one chance) and
 * separately retry MAX_RETRIES times for transient trouble. The two cannot
 * starve each other. Nothing runs away: a key that fails is cooled for an hour
 * before the next rotation step, so a pass over N keys happens at most once, and
 * the next request skips all of them without spending an attempt at all.
 */
async function requestWithRetry({ url, endpoint, params, label }) {
  // Every key deserves one chance at this request. Read once — the pool is
  // cached for five minutes, so this is not a per-attempt lookup.
  const keyCount = (await candidates()).length || 1;

  let lastErr;
  let rotations = 0;   // keys written off on THIS request (auth, billing, caps)
  let transient = 0;   // blips: 5xx, timeouts, concurrency 429s, a busy pool
  let attempt = 0;     // both together, for the log line and the backoff curve

  while (rotations < keyCount && transient <= MAX_RETRIES) {
    attempt++;
    let slot;
    try {
      slot = await acquireKeySlot(endpoint);
    } catch (err) {
      // Every key busy or cooling — wait a beat and try again rather than failing
      // the user's request on a transient pool state.
      if (err instanceof ApidirectRateLimitedError && transient < MAX_RETRIES) {
        transient++;
        await sleep(400 + Math.floor(Math.random() * 400));
        continue;
      }
      throw err;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const qs = new URLSearchParams(params).toString();
      console.log(`[apidirect] → GET /${endpoint} key=${slot.label}${attempt > 1 ? ` (try ${attempt})` : ""} ${label}`);
      const res = await fetch(`${url}?${qs}`, {
        headers: { "X-API-Key": slot.apiKey, Accept: "application/json" },
        signal: ctrl.signal,
      });

      if (res.ok) {
        markSuccess(slot, endpoint);
        return await res.json();
      }

      const status = res.status;
      const body = await res.text().catch(() => "");
      const { code, message } = parseError(body);

      // Auth, billing, or a spending cap. All four mean the same thing to the
      // pool — this key cannot serve for a while — so all four cool for an hour
      // and rotate. The key is never deleted: a topped-up account, a raised
      // limit or the next UTC midnight brings it straight back, and the hourly
      // retry is what discovers that on its own.
      const spent =
        status === 401 || status === 402 || status === 403 ||
        (status === 429 && EXHAUSTED_CODES.has(code));

      if (spent) {
        await setCooldown(KEY_COOLDOWN_SERVICE, slot.keyId, KEY_EXHAUSTED_COOLDOWN_MS);
        markFailure(slot, {
          endpoint, status, code, message,
          cooldownMs: KEY_EXHAUSTED_COOLDOWN_MS,
          strike: true,
        });
        rotations++;
        console.error(
          `[apidirect] ❌ KEY UNUSABLE (${status} ${code || "?"}) key=${slot.label} on /${endpoint} — ` +
          `cooled 60min, rotating (${rotations}/${keyCount} keys tried). ${message || ""}`.trim()
        );
        lastErr = Object.assign(new Error(`apidirect ${status} ${code}`.trim()), { status, code, keyExhausted: true });
        continue;
      }

      // The other 429s: three requests at once on one key, or the upstream
      // source throttling us. Both clear in seconds, so this is a blip that
      // rotation steps around rather than a key worth writing off.
      if (status === 429) {
        await setCooldown(KEY_COOLDOWN_SERVICE, slot.keyId, TRANSIENT_429_COOLDOWN_MS);
        markFailure(slot, { endpoint, status, code, message });
        lastErr = new ApidirectRateLimitedError(`apidirect 429 ${code || ""}`.trim());
        if (transient < MAX_RETRIES) { transient++; continue; }
        throw Object.assign(lastErr, { fatal: true });
      }

      if (status === 404) {
        const e = new Error("apidirect 404");
        e.notFound = true;
        throw e;
      }

      if ((status >= 500 || status === 408) && transient < MAX_RETRIES) {
        const backoff = 800 * 2 ** transient + Math.floor(Math.random() * 400);
        console.warn(`[apidirect] ${status} ${code || ""} — backing off ${backoff}ms (retry ${transient + 1}/${MAX_RETRIES})`);
        markFailure(slot, { endpoint, status, code, message });
        transient++;
        await sleep(backoff);
        lastErr = new Error(`apidirect ${status}`);
        continue;
      }

      markFailure(slot, { endpoint, status, code, message });
      // `fatal` so the catch below rethrows instead of looping. Without it a hard
      // 400 — a malformed query, say — was caught, not rethrown, and quietly
      // retried against every remaining key: four identical rejections for a
      // request that could never succeed.
      throw Object.assign(new Error(`apidirect ${status}: ${message || body.slice(0, 200)}`), { status, code, fatal: true });
    } catch (err) {
      lastErr = err;
      if (err?.notFound || err?.fatal) throw err;

      // A timeout or a dropped connection. The key is fine, the network was not.
      const isBlip = err?.name === "AbortError" || err?.name === "TypeError";
      if (isBlip && transient < MAX_RETRIES) {
        transient++;
        await sleep(800 * 2 ** transient);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
      slot.release().catch(() => {});
    }
  }

  // Fell out of the loop: either every key in the pool refused us, or the
  // transient budget ran out. Both are worth naming — "all 3 keys are out of
  // credit" and "apidirect kept timing out" are different problems.
  if (rotations >= keyCount && keyCount > 0) {
    throw Object.assign(
      lastErr || new Error(`all ${keyCount} apidirect key(s) unusable`),
      { keyExhausted: true, allKeysTried: true }
    );
  }
  throw lastErr || new Error("apidirect retries exhausted");
}

/**
 * Video details for one YouTube URL.
 *
 * `duration` comes back as an integer number of SECONDS, or null — null is
 * documented for live streams, and callers must treat it as "unknown", never as
 * zero, or a live stream would sail through a short-form check.
 *
 * Live-verified field list (2026-09-04, dQw4w9WgXcQ): author, category,
 * channel_id, date, description, duration, is_live, keywords, thumbnail, title,
 * type, url, video_id, views.
 *
 * @returns {{ video_id, url, title, author, channel_id, description, duration,
 *   views, category, keywords, thumbnail, is_live, type, date }|null}
 */
export async function getYouTubeVideoDetails(watchUrl) {
  const url = String(watchUrl || "").trim();
  if (!url) return null;

  let data;
  try {
    data = await requestWithRetry({
      url: YOUTUBE_VIDEO_URL,
      endpoint: "youtube_video",
      params: { url },
      label: url,
    });
  } catch (err) {
    if (err?.notFound) return null;
    throw err;
  }

  const v = data?.video || data;
  if (!v || (!v.video_id && !v.title)) return null;

  const duration = v.duration == null ? null : Number(v.duration);
  return {
    video_id: v.video_id ? String(v.video_id) : "",
    url: v.url || url,
    title: v.title || "",
    author: v.author || "",
    channel_id: v.channel_id ? String(v.channel_id) : "",
    description: v.description || "",
    duration: Number.isFinite(duration) ? duration : null,
    views: Number(v.views) || 0,
    // "Music", "Entertainment", "Science & Technology" — YouTube's own label.
    category: v.category || "",
    keywords: Array.isArray(v.keywords) ? v.keywords.filter((k) => typeof k === "string").slice(0, 25) : [],
    thumbnail: v.thumbnail || "",
    is_live: v.is_live === true,
    type: v.type || "",
    date: v.date || null,
  };
}

/**
 * Parse apidirect's publication timestamp.
 *
 * Two shapes are in the wild: the documented "2026-01-15 14:30:00" (UTC, no
 * zone marker) and the ISO "2026-09-04T00:02:47.000Z" the live endpoint
 * actually returns. The space form MUST be forced to UTC — left alone, `new
 * Date("2026-01-15 14:30:00")` is read in the server's local zone, which on an
 * IST box would date every article five and a half hours early and quietly
 * push the freshest stories out of the collector's window.
 */
function parseNewsDate(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  const iso = /[TZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s.replace(" ", "T")}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Search news articles — GET /v1/news/articles.
 *
 * ── WHY THIS IS WORTH PAYING FOR WHEN THE RSS SOURCES ARE FREE ───────────────
 * Freshness. Google News RSS answers `when:1d`, so its floor is "some time
 * today"; this answers `time_published=1h` with articles twelve minutes old,
 * live-verified. For a product whose promise is "cover it before everyone
 * else", four hours of latency is the whole product.
 *
 * BILLED PER REQUEST ($0.008), NOT PER RESULT — so `limit` is free money and
 * splitting one query into three is not. Callers should ask for a high limit
 * once rather than paginating.
 *
 * Operators are NOT supported here (live-probed: a parenthesised OR query with
 * an exclusion returned zero results while the plain keyword returned twenty).
 * Pass plain keywords.
 *
 * An empty result set is a normal answer, not a failure — a narrow query in a
 * 1-hour window legitimately finds nothing.
 *
 * @param {string} query        plain keywords, max 500 chars
 * @param {object} opts
 * @param {number} opts.limit         1-100 (default 30)
 * @param {string} opts.timePublished anytime | 1h | 1d | 7d | 1y (default 1d)
 * @param {string} opts.country       2-letter (default us)
 * @param {string} opts.language      2-letter (default en)
 * @param {string} opts.source        e.g. "bbc.com", optional
 * @returns {Promise<{articles: Array, count: number}>}
 */
export async function searchNewsArticles(query, {
  limit = 30,
  timePublished = "1d",
  country = "us",
  language = "en",
  source = "",
} = {}) {
  const q = String(query || "").trim().slice(0, 500);
  if (!q) return { articles: [], count: 0 };

  const params = {
    query: q,
    limit: Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100),
    time_published: timePublished,
    country: String(country || "us").toLowerCase().slice(0, 2),
    language: String(language || "en").toLowerCase().slice(0, 2),
  };
  if (source) params.source = source;

  const data = await requestWithRetry({
    url: NEWS_ARTICLES_URL,
    endpoint: "news_articles",
    params,
    label: `"${q}"`,
  });

  const items = Array.isArray(data?.articles) ? data.articles : [];
  const articles = items
    .map((a) => {
      if (!a?.title || !a?.url) return null;
      return {
        title: String(a.title),
        url: String(a.url),
        snippet: String(a.snippet || ""),
        published_at: parseNewsDate(a.published_datetime_utc),
        source_name: String(a.source_name || ""),
        domain: String(a.domain || ""),
        authors: Array.isArray(a.authors) ? a.authors.filter((x) => typeof x === "string") : [],
        photo_url: String(a.photo_url || ""),
      };
    })
    .filter(Boolean);

  console.log(`[apidirect] ← news "${q}" (${params.time_published}): ${articles.length} articles`);
  return { articles, count: data?.count ?? articles.length };
}

export default {
  getYouTubeVideoDetails,
  searchNewsArticles,
  isApidirectConfigured,
  warmApidirectKeys,
  apidirectKeyHealth,
};

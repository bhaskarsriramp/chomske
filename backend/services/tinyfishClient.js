/**
 * tinyfishClient.js: read the actual article, not just its headline.
 *
 * ── THE PROBLEM THIS SOLVES ──────────────────────────────────────────────────
 * A script used to be written from eight headlines and their RSS snippets, cut
 * to 300 characters each. About 2,400 characters of raw material, for anything
 * from a 45 second Reel to an eight minute explainer. It is why the prompt has
 * to be so strict about inventing nothing: the model genuinely had almost
 * nothing to work with, and the honest output at that length is thin.
 *
 * TinyFish returns the readable content of a page as markdown. Handing the
 * writer two or three real articles instead of five snippets is the single
 * largest quality change available to this product, and page fetches are free,
 * so it costs only the extra input tokens (a few tenths of a cent per script).
 *
 * ── WHY THERE IS A KEY POOL FOR A FREE SERVICE ───────────────────────────────
 * Free is not unlimited. The limit is requests per minute per key, and one
 * script takes one request carrying three to five URLs. One key is fine for one
 * creator and tight the moment several order at once, so keys rotate and a
 * second key is added by inserting a row (see models/TinyfishAPIs.js).
 *
 * ── THIS MUST NEVER BREAK A SCRIPT ───────────────────────────────────────────
 * Everything here fails soft. No key, rate limited, a paywall, a dead link, the
 * SDK throwing: the caller gets back whatever was extracted, possibly nothing,
 * and falls back to the snippets it already had. A creator who paid for a
 * script must never lose it because a publisher blocked a crawler.
 */
import { createHash } from "crypto";
import TinyfishAPIs from "../models/TinyfishAPIs.js";
import { setCooldown, cooldownRemainingMs, takeRate } from "../utils/limiter.js";

const SERVICE = "tinyfish";

// TinyFish takes up to ten URLs in one request, which is more than any script
// needs, so a fetch is always a single call.
const URLS_PER_REQUEST = 10;

// Requests per minute per key. Deliberately under whatever the published
// ceiling is: this is a free service and being a polite consumer of it is worth
// more than the last few requests a minute.
const RPM = parseInt(process.env.TINYFISH_RPM || "15", 10);

// A 429 says "later". An auth failure says "not with this key", and an hour is
// long enough that a dead key stops being tried on every script.
const RATE_COOLDOWN_MS = parseInt(process.env.TINYFISH_RATE_COOLDOWN_MS || "60000", 10);
const DEAD_COOLDOWN_MS = 60 * 60 * 1000;

const REQUEST_TIMEOUT_MS = parseInt(process.env.TINYFISH_TIMEOUT_MS || "45000", 10);

const KEYS_TTL_MS = 5 * 60 * 1000;
let _keysCache = null;
let _keysAt = 0;
const _clients = new Map();

const keyId = (secret) =>
  "tf_" + createHash("sha256").update(String(secret)).digest("hex").slice(0, 8);

/** Lazy, so a deployment without the SDK installed fails on use, not on boot. */
async function clientFor(cand) {
  if (_clients.has(cand.keyId)) return _clients.get(cand.keyId);
  const { TinyFish } = await import("@tiny-fish/sdk");
  const c = new TinyFish({ apiKey: cand.apiKey });
  _clients.set(cand.keyId, c);
  return c;
}

/**
 * The pool: every key in Mongo, plus TINYFISH_API_KEY from the environment.
 *
 * Cached for five minutes so adding a key does not need a deploy, and reading
 * the collection is not on the path of every script.
 */
async function candidates() {
  if (_keysCache && Date.now() - _keysAt < KEYS_TTL_MS) return _keysCache;

  const out = [];
  const seen = new Set();

  const push = (secret, label) => {
    const s = String(secret || "").trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push({ apiKey: s, keyId: keyId(s), label: label || keyId(s) });
  };

  try {
    const rows = await TinyfishAPIs.find({ active: { $ne: false } }).lean();
    for (const r of rows) push(r.tiny_api_key, r.label);
  } catch (err) {
    console.warn("[tinyfish] couldn't read the key collection:", err.message);
  }
  push(process.env.TINYFISH_API_KEY, "env");

  _keysCache = out;
  _keysAt = Date.now();
  return out;
}

export function isTinyfishConfigured() {
  return !!(process.env.TINYFISH_API_KEY || (_keysCache && _keysCache.length));
}

function is429(err) {
  const s = err?.status || err?.statusCode || err?.response?.status || 0;
  return s === 429 || /rate.?limit|too many requests/i.test(String(err?.message || ""));
}

function isDeadKey(err) {
  const s = err?.status || err?.statusCode || err?.response?.status || 0;
  if (s === 401 || s === 403) return true;
  return /invalid.*api[\s-]?key|api[\s-]?key.*(invalid|expired|revoked)|unauthoriz|forbidden/i
    .test(String(err?.message || ""));
}

/** Health, written fire and forget. Nothing routes on it. */
function note(cand, patch) {
  if (cand.label === "env") return;
  TinyfishAPIs.updateOne({ tiny_api_key: cand.apiKey }, { $set: patch, $inc: patch.$inc || {} })
    .catch(() => {});
}

/**
 * Fetch the readable content of some URLs.
 *
 * @param {string[]} urls
 * @param {{ maxChars?: number }} opts  per-URL cap on returned text
 * @returns {Promise<Map<string,string>>} url → extracted text. Missing entries
 *   are pages that could not be read; the caller falls back for those.
 */
export async function fetchArticles(urls, { maxChars = 2500 } = {}) {
  const list = [...new Set((urls || []).map((u) => String(u || "").trim()).filter(Boolean))]
    .slice(0, URLS_PER_REQUEST);
  const out = new Map();
  if (!list.length) return out;

  const pool = await candidates();
  if (!pool.length) {
    console.warn("[tinyfish] no key configured, scripts fall back to source snippets");
    return out;
  }

  // One attempt per key. A 429 or a dead key rotates; anything else is not the
  // key's fault and retrying it on another one would just fail again.
  for (const cand of pool) {
    if (await cooldownRemainingMs(SERVICE, cand.keyId)) continue;
    if (!(await takeRate(SERVICE, cand.keyId, RPM, 60, list.length))) {
      await setCooldown(SERVICE, cand.keyId, RATE_COOLDOWN_MS);
      continue;
    }

    const started = Date.now();
    try {
      const client = await clientFor(cand);
      const res = await withTimeout(
        client.fetch.getContents({ urls: list, format: "markdown", links: false }),
        REQUEST_TIMEOUT_MS
      );

      for (const r of res?.results || []) {
        const text = clean(r?.content || r?.markdown || r?.text || "", maxChars);
        if (r?.url && text) out.set(r.url, text);
      }

      const failed = (res?.errors || []).length;
      console.log(
        `[tinyfish] ${out.size}/${list.length} page(s) read in ` +
        `${((Date.now() - started) / 1000).toFixed(1)}s` + (failed ? `, ${failed} refused` : "")
      );
      note(cand, {
        status: "ok", last_used_at: new Date(), last_success_at: new Date(),
        $inc: { urls_fetched: out.size },
      });
      return out;
    } catch (err) {
      if (is429(err)) {
        await setCooldown(SERVICE, cand.keyId, RATE_COOLDOWN_MS);
        note(cand, { status: "rate_limited", last_error: "429", last_error_at: new Date(),
                     cooldown_until: new Date(Date.now() + RATE_COOLDOWN_MS), $inc: { error_count: 1 } });
        console.warn(`[tinyfish] 429 on ${cand.label}, rotating`);
        continue;
      }
      if (isDeadKey(err)) {
        await setCooldown(SERVICE, cand.keyId, DEAD_COOLDOWN_MS);
        note(cand, { status: "invalid", last_error: String(err.message || "").slice(0, 300),
                     last_error_at: new Date(), cooldown_until: new Date(Date.now() + DEAD_COOLDOWN_MS),
                     $inc: { error_count: 1 } });
        console.warn(`[tinyfish] key ${cand.label} rejected, cooled 1h`);
        continue;
      }
      // Not the key's fault. Give up rather than replay a bad request across
      // every key we have.
      note(cand, { status: "error", last_error: String(err.message || "").slice(0, 300),
                   last_error_at: new Date(), $inc: { error_count: 1 } });
      console.warn(`[tinyfish] fetch failed: ${err.message}`);
      return out;
    }
  }

  console.warn("[tinyfish] every key is cooling down, falling back to snippets");
  return out;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`tinyfish timed out after ${ms}ms`)), ms)),
  ]);
}

/**
 * Markdown from a news page arrives with the furniture attached: nav lists,
 * cookie notices, share links, "read more" rails. Left in, it is input tokens
 * spent on something the writer must then be told to ignore.
 */
function clean(md, maxChars) {
  let s = String(md || "");
  if (!s) return "";

  s = s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")     // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")   // links, keep the words
    .replace(/^#{1,6}\s*/gm, "")               // heading marks
    .replace(/[*_`>|]+/g, " ")
    .replace(/\r/g, "");

  // Drop the short orphan lines that navigation and share bars are made of,
  // while keeping real prose and short quoted lines inside it.
  const kept = s
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 60 || /[.!?]$/.test(l));

  return kept.join("\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim().slice(0, maxChars);
}

export default { fetchArticles, isTinyfishConfigured };

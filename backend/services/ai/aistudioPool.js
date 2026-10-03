/**
 * aistudioPool.js: the Gemini AI Studio keys, and which one to use next.
 *
 * ── WHERE THE KEYS COME FROM: THE COLLECTION ─────────────────────────────────
 * The aistudio_keys collection (models/AIStudioKeys.js), every active row, in
 * the order they were added. Only those (the creator's decision, 2026-10-03:
 * "use the keys from the collection, not from the bashrc"): while the
 * collection has an active key, the environment's AISTUDIO_KEY is not used at
 * all. The environment's key is a safety net for when there is nothing else:
 * a process with no database (a script, the Cloud Run renderer), the moment
 * before the first read, or a collection with no active row. The collection
 * is read again every minute, so a key added, replaced or switched off in the
 * database takes effect within a minute in every process, with no restart.
 *
 * ── A REFUSED KEY IS RESTED, AND THE NEXT ONE IS USED AT ONCE ───────────────
 * Every caller that speaks to AI Studio asks this file for a key (nextKey)
 * and tells it when a key was refused (rest). A rested key is skipped until
 * its rest is over, so the request goes straight on with the next free key
 * instead of waiting out the limit; only when every key is resting does
 * anything wait. How long a key rests:
 *   per-minute limit (429)       what the refusal says, else a minute
 *   daily limit (429 "per day")  until the reset the refusal names, else 6 h
 *   invalid key, out of credit   an hour (and its row says so)
 * Rests are kept per SCOPE, because limits are per model: a key out of voice
 * requests for the day ("tts") still answers text ("text"). They live in
 * Redis (cooldown.js), shared by the server and the worker, under the same
 * names the model client (provider.js) uses for its request budgets.
 *
 * ── MORE KEYS MEANS MORE ROOM ONLY ACROSS PROJECTS ───────────────────────────
 * AI Studio counts limits per Google Cloud project. Keys of one project share
 * them; see models/AIStudioKeys.js.
 */
import mongoose from "mongoose";
import AIStudioKeys from "../../models/AIStudioKeys.js";
import { coolingFor, cool } from "./cooldown.js";

const REFRESH_MS = 60_000;
const MINUTE_REST_MS = 60_000;
const DAILY_REST_MS = 6 * 3600_000;
const DEAD_REST_MS = 3600_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

const envKeys = () =>
  String(process.env.AISTUDIO_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

/** The last six characters: enough to tell keys apart in a log, never the key. */
export const keyId = (key) => String(key || "").slice(-6);

/** The rest/budget name of a key for one kind of use. "text" keeps provider.js's old name. */
export const bucketOf = (key, scope = "text") => (scope === "text" ? "aistudio:" : `aistudio-${scope}:`) + keyId(key);

/* ── The keys ──────────────────────────────────────────────────────────────── */

let fromDb = [];
let labels = new Map();
let loadedAt = 0;
let loading = null;

/** Read the collection again (skipped quietly without a database connection). */
export async function refreshKeys() {
  if (mongoose.connection.readyState !== 1) return fromDb;
  try {
    const rows = await AIStudioKeys.find({ active: { $ne: false } }).sort({ created_at: 1 }).select("api_key label").lean();
    fromDb = rows.map((r) => String(r.api_key || "").trim()).filter(Boolean);
    if (fromDb.length) saidFallback = false;
    labels = new Map(rows.map((r) => [String(r.api_key || "").trim(), r.label || keyId(r.api_key)]));
    loadedAt = Date.now();
  } catch (err) {
    console.warn(`[ai] couldn't read the AI Studio keys collection: ${err.message}`);
  }
  return fromDb;
}

/**
 * Every usable key: the collection's; the environment's only when the
 * collection has none. Synchronous (it is read where a request is being
 * built); the collection is re-read in the background once the last read is
 * a minute old.
 */
let saidFallback = false;
export function aistudioKeys() {
  if (Date.now() - loadedAt > REFRESH_MS && !loading && mongoose.connection.readyState === 1) {
    loading = refreshKeys().finally(() => {
      loading = null;
    });
  }
  if (fromDb.length) return [...new Set(fromDb)];
  const env = envKeys();
  if (env.length && loadedAt && !saidFallback) {
    saidFallback = true;
    console.warn("[ai] the aistudio_keys collection has no active key; using the environment's AISTUDIO_KEY until it does");
  }
  return env;
}

/** Where the keys in use come from, for the boot log. */
export const keySource = () => (fromDb.length ? "collection" : envKeys().length ? "environment" : "none");

export const labelOf = (key) => labels.get(key) || (envKeys().includes(key) ? `env:${keyId(key)}` : keyId(key));

/* ── Which key next ────────────────────────────────────────────────────────── */

const cursors = new Map();

/**
 * The next key to use for `scope`, skipping any that is resting: { key, wait }
 * with wait 0, or, when every key rests, the one free soonest and how long
 * until it is. Null when there is no key at all.
 */
export async function nextKey(scope = "text") {
  const keys = aistudioKeys();
  if (!keys.length) return null;
  const at = cursors.get(scope) || 0;
  let soonest = null;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(at + i) % keys.length];
    const wait = await coolingFor(bucketOf(key, scope));
    if (wait <= 0) {
      cursors.set(scope, (at + i + 1) % keys.length);
      return { key, wait: 0 };
    }
    if (!soonest || wait < soonest.wait) soonest = { key, wait };
  }
  return soonest;
}

/** Whether some key other than `key` is free for `scope` right now. */
export async function anotherFree(key, scope = "text") {
  for (const k of aistudioKeys()) {
    if (k !== key && (await coolingFor(bucketOf(k, scope))) <= 0) return true;
  }
  return false;
}

/* ── What a refusal means ──────────────────────────────────────────────────── */

/** "retry in 15h13m31s" / "retryDelay": "41s" → ms, or 0. */
export function waitFromMessage(message) {
  const text = String(message || "");
  const long = text.match(/retry in\s+((?:\d+(?:\.\d+)?[hms]\s*)+)/i);
  if (long) {
    let ms = 0;
    for (const [, n, u] of long[1].matchAll(/(\d+(?:\.\d+)?)([hms])/g)) ms += Number(n) * { h: 3600_000, m: 60_000, s: 1000 }[u];
    if (ms > 0) return Math.round(ms);
  }
  const delay = text.match(/"?retryDelay"?\s*[:=]\s*"?(\d+(?:\.\d+)?)s/i);
  return delay ? Math.round(parseFloat(delay[1]) * 1000) : 0;
}

/**
 * Whether a refusal is about the KEY (so another key may well work), and how
 * long that key should rest: { why, ms } or null when it is not the key's
 * (a bad request, an overloaded service).
 */
export function keyRefusal(status, message) {
  const text = String(message || "");
  if (status === 402 || /prepayment|credits are depleted|billing account|payment required/i.test(text)) {
    return { why: "no_credit", ms: DEAD_REST_MS };
  }
  if (status === 429 || /resource_exhausted|rate limit/i.test(text)) {
    if (/per ?day|perday|daily/i.test(text)) return { why: "daily_limited", ms: waitFromMessage(text) || DAILY_REST_MS };
    return { why: "rate_limited", ms: waitFromMessage(text) || MINUTE_REST_MS };
  }
  if (status === 401 || (status === 400 && /api[_ ]?key/i.test(text)) || (status === 403 && /api[_ ]?key|permission|denied/i.test(text))) {
    return { why: "invalid", ms: DEAD_REST_MS };
  }
  return null;
}

/* ── Resting a key, and its row ────────────────────────────────────────────── */

/** Rest `key` for `scope`, and write why on its row (fire and forget). */
export async function rest(key, ms, { scope = "text", why = "rate_limited", status = null, message = "" } = {}) {
  await cool(bucketOf(key, scope), ms, { extend: why !== "rate_limited" });
  const mins = ms >= 3600_000 ? `${(ms / 3600_000).toFixed(1)} h` : `${Math.round(ms / 1000)} s`;
  console.warn(`[ai] AI Studio key ${labelOf(key)} ${why.replace("_", " ")} (${scope}); resting it ${mins}${aistudioKeys().length > 1 ? ", next key goes on" : ""}`);
  if (!fromDb.includes(key) || mongoose.connection.readyState !== 1) return;
  AIStudioKeys.updateOne(
    { api_key: key },
    {
      $set: {
        status: why,
        status_scope: scope,
        last_status_code: status,
        last_error: String(message || "").slice(0, 400),
        last_error_at: new Date(),
        cooldown_until: new Date(Date.now() + ms),
      },
      $inc: { error_count: 1 },
    }
  ).catch(() => {});
}

/**
 * Use counts, written once a minute rather than per request (an analysis
 * makes hundreds): requests, last used, last success, and "ok" again once a
 * key that was refused answers.
 */
const tally = new Map();
export function used(key, ok = true) {
  if (!fromDb.includes(key)) return;
  const t = tally.get(key) || { requests: 0, ok: false };
  t.requests++;
  if (ok) t.ok = true;
  tally.set(key, t);
}
setInterval(() => {
  if (!tally.size || mongoose.connection.readyState !== 1) return;
  const now = new Date();
  for (const [key, t] of tally) {
    AIStudioKeys.updateOne(
      { api_key: key },
      { $inc: { requests: t.requests }, $set: { last_used_at: now, ...(t.ok ? { last_success_at: now, status: "ok" } : {}) } }
    ).catch(() => {});
  }
  tally.clear();
}, 60_000).unref?.();

/**
 * Call `fn(key)` with the next free key for `scope`; when the key is refused
 * (fn throws an error with `status` and the service's message), rest it and go
 * straight on with the next free one. Waits only when every key is resting,
 * and not longer than `maxWaitMs` at a time. Throws the last error when the
 * attempts run out; when every key is out for the day, that error carries
 * `daily: true` and `waitMs`.
 */
export async function withKey(scope, fn, { attempts = 6, maxWaitMs = 70_000 } = {}) {
  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const pick = await nextKey(scope);
    if (!pick) throw Object.assign(new Error("no AI Studio key is set"), { noKey: true });
    if (pick.wait > 0) {
      if (pick.wait > maxWaitMs) {
        // Every key is out for longer than anyone should wait: say so.
        throw Object.assign(last || new Error("every AI Studio key is resting"), { daily: true, waitMs: pick.wait, allResting: true });
      }
      await sleep(pick.wait + 50);
    }
    try {
      const out = await fn(pick.key);
      used(pick.key, true);
      return out;
    } catch (err) {
      last = err;
      const why = keyRefusal(Number(err?.status) || 0, err?.message);
      if (!why) throw err;
      used(pick.key, false);
      await rest(pick.key, why.ms, { scope, why: why.why, status: Number(err?.status) || null, message: err?.message });
      // Straight on to another key: a key switch is not a failed attempt.
      if (await anotherFree(pick.key, scope)) attempt--;
    }
  }
  throw last || new Error("AI Studio refused every attempt");
}

export default { aistudioKeys, keySource, refreshKeys, nextKey, anotherFree, rest, used, withKey, keyRefusal, waitFromMessage, keyId, bucketOf, labelOf };

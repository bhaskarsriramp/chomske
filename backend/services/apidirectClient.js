/**
 * apidirectClient.js — read-only wrapper around apidirect.io's YouTube API.
 *
 * One endpoint is used:
 *   GET /v1/youtube/video?url=<watch url>   →  video.duration (integer SECONDS)
 *
 * That duration is the entire reason this exists. Voice profiling only accepts
 * short-form videos, and there is no way to know a video's length from its URL —
 * so the check has to happen before we pay Gemini to read it. Rejecting a
 * 40-minute video for $0.005 instead of transcribing it for ₹60 is the trade.
 *
 * Auth: X-API-Key. Keys come from the ApidirectAPIs collection plus the
 * APIDIRECT_API_KEY env value, deduped, so keys can be added without a deploy.
 *
 * RATE LIMIT (apidirect.io/docs/rate-limits): 3 concurrent requests per endpoint
 * per key, with no RPM ceiling. So we hold a slot per (endpoint, key) below that
 * cap and rotate across keys — with N keys the ceiling is 3×N concurrent.
 *
 * Failure handling mirrors the reference project, and keys are NEVER deleted:
 *   401 / 402 / 403 → 1 hour cooldown, rotate. The key holds prepaid credit and
 *                     usually recovers; deleting it throws money away.
 *   429             → brief cooldown so rotation skips it, retry.
 *   5xx / network   → exponential backoff, retry.
 *
 * Uses global fetch (Node 18+) rather than axios, so this adds no dependency.
 */
import { createHash } from "crypto";
import ApidirectAPIs from "../models/ApidirectAPIs.js";
import { setCooldown, cooldownRemainingMs, acquireSlot, NoSlotError } from "../utils/limiter.js";

const YOUTUBE_VIDEO_URL = "https://apidirect.io/v1/youtube/video";

const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 20000;
const KEY_COOLDOWN_SERVICE = "apidirect";
const KEY_EXHAUSTED_COOLDOWN_MS = 60 * 60 * 1000;  // auth/billing — 1 hour
const TRANSIENT_429_COOLDOWN_MS = 2500;
const CANDIDATE_TTL_MS = 5 * 60 * 1000;

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

/** GET one endpoint with key rotation and retry. */
async function requestWithRetry({ url, endpoint, params, label }) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let slot;
    try {
      slot = await acquireKeySlot(endpoint);
    } catch (err) {
      // Every key busy or cooling — wait a beat and try again rather than failing
      // the user's request on a transient pool state.
      if (err instanceof ApidirectRateLimitedError && attempt < MAX_RETRIES) {
        await sleep(400 + Math.floor(Math.random() * 400));
        continue;
      }
      throw err;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const qs = new URLSearchParams(params).toString();
      console.log(`[apidirect] → GET /${endpoint} key=${slot.label}${attempt ? ` (retry ${attempt})` : ""} ${label}`);
      const res = await fetch(`${url}?${qs}`, {
        headers: { "X-API-Key": slot.apiKey, Accept: "application/json" },
        signal: ctrl.signal,
      });

      if (res.ok) {
        ApidirectAPIs.updateOne({ apidirect_key: slot.apiKey }, { $set: { last_used_at: new Date() } }).catch(() => {});
        return await res.json();
      }

      const status = res.status;
      const body = await res.text().catch(() => "");

      // Auth or billing — cool for an hour and rotate. Never delete the key.
      if (status === 401 || status === 402 || status === 403) {
        await setCooldown(KEY_COOLDOWN_SERVICE, slot.keyId, KEY_EXHAUSTED_COOLDOWN_MS);
        ApidirectAPIs.updateOne({ apidirect_key: slot.apiKey }, { $inc: { track_403: 1 } }).catch(() => {});
        console.error(`[apidirect] AUTH/BILLING ${status} on key=${slot.label} — cooled 60min, rotating`);
        lastErr = new Error(`apidirect ${status}`);
        continue;
      }

      if (status === 429) {
        await setCooldown(KEY_COOLDOWN_SERVICE, slot.keyId, TRANSIENT_429_COOLDOWN_MS);
        lastErr = new ApidirectRateLimitedError("apidirect 429");
        if (attempt < MAX_RETRIES) continue;
        throw lastErr;
      }

      if (status === 404) {
        const e = new Error("apidirect 404");
        e.notFound = true;
        throw e;
      }

      if ((status >= 500 || status === 408) && attempt < MAX_RETRIES) {
        const backoff = 800 * 2 ** attempt + Math.floor(Math.random() * 400);
        console.warn(`[apidirect] ${status} — backing off ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(backoff);
        lastErr = new Error(`apidirect ${status}`);
        continue;
      }

      throw new Error(`apidirect ${status}: ${body.slice(0, 200)}`);
    } catch (err) {
      lastErr = err;
      if (err?.notFound) throw err;
      const transient = err?.name === "AbortError" || err?.name === "TypeError";
      if (transient && attempt < MAX_RETRIES) {
        await sleep(800 * 2 ** attempt);
        continue;
      }
      if (attempt >= MAX_RETRIES) throw err;
    } finally {
      clearTimeout(timer);
      slot.release().catch(() => {});
    }
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
 * @returns {{ video_id, title, author, channel_id, duration, views, thumbnail, is_live, type }|null}
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
    thumbnail: v.thumbnail || "",
    is_live: v.is_live === true,
    type: v.type || "",
    date: v.date || null,
  };
}

export default { getYouTubeVideoDetails, isApidirectConfigured, warmApidirectKeys };

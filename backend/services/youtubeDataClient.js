/**
 * youtubeDataClient.js: video metadata from YouTube's own Data API v3.
 *
 * ── WHY THIS REPLACED A PAID LOOKUP ──────────────────────────────────────────
 * Every video that enters this product is measured before Gemini is allowed to
 * read it, because reading video is the entire cost of the business and it
 * scales with duration. That check used to be apidirect's /v1/youtube/video at
 * $0.005 a call, one call per video.
 *
 * videos.list answers the same question for ONE quota unit against a free
 * allowance of 10,000 units a day, and it takes up to FIFTY video ids in a
 * single request for that same one unit. Measured against the five videos of a
 * real showcase profile: five apidirect calls and five round trips became one
 * request, 623ms, one unit. At the volumes this product runs at the metadata
 * lookup stops being a line item at all.
 *
 * ── AND WHY THE ANSWERS ARE BETTER, NOT JUST CHEAPER ─────────────────────────
 * apidirect was returning NORMALISED titles, not real ones. A video actually
 * called "iPhone Ultra Flop అవుతుందా? 😱 | Apple's Biggest Risk?" arrived as
 * "iPhone Ultra Fold: Will it Flop?", an English translation of a Telugu title.
 * Tidier, and an invention. A creator scanning My voice is looking for the
 * title THEY wrote, so the raw string is the correct one even though it carries
 * emoji and hashtags and needs truncating in the UI.
 *
 * Three fields also arrive here that had no equivalent before: the audio
 * language YouTube has on file (`te` on four of those five videos, which is
 * Telugu stated outright rather than guessed), live statistics, and a proper
 * ISO-8601 publish timestamp with a zone marker, which is why this module needs
 * none of the "2009-10-25 06:57:33 is UTC but does not say so" handling that
 * services/apidirectClient.js carries.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ────────────────────────────────────────────
 * search.list. It costs 100 units against a separate ceiling of 100 searches a
 * day, so a single careless search loop burns the entire daily allowance. If
 * something ever needs to find videos rather than describe known ones, that is
 * a decision to take deliberately, not a helper to leave lying around.
 *
 * Auth is a plain API key restricted to this one API, which is why there is no
 * OAuth here and no consent screen: public video metadata needs no user's
 * permission. See .env.example for how the key is minted and restricted.
 */
import { parseYouTubeUrl } from "../utils/youtube.js";

const ENDPOINT = "https://www.googleapis.com/youtube/v3/videos";
const CHANNELS_ENDPOINT = "https://www.googleapis.com/youtube/v3/channels";
const PLAYLIST_ITEMS_ENDPOINT = "https://www.googleapis.com/youtube/v3/playlistItems";
const SEARCH_ENDPOINT = "https://www.googleapis.com/youtube/v3/search";

/** Everything the three call sites read, in one request. Parts do NOT multiply
 *  the quota cost for videos.list: this costs the same one unit as `id` alone. */
const PARTS = "snippet,contentDetails,statistics,status,liveStreamingDetails";

/** The documented ceiling for videos.list. Still one unit at fifty. */
export const MAX_IDS_PER_CALL = 50;

const REQUEST_TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;

/**
 * Reasons that mean "this key cannot serve requests right now".
 *
 * Split from the transport errors below for the same reason apidirectClient
 * splits them: the two need different words in front of a user. A quota that
 * resets at midnight Pacific is "paused, try later"; a bad link is "check the
 * link". Collapsing them produces a message that is wrong in one of the cases.
 */
const EXHAUSTED_REASONS = new Set([
  "quotaExceeded",          // the 10,000/day allowance is spent
  "dailyLimitExceeded",
  "rateLimitExceeded",
  "userRateLimitExceeded",
]);

/** Reasons that mean the key itself is wrong, or wrongly restricted. */
const KEY_FAULT_REASONS = new Set([
  "keyInvalid",
  "ipRefererBlocked",       // Application restriction does not match the caller
  "accessNotConfigured",    // YouTube Data API v3 not enabled on the project
  "forbidden",
]);

export class YouTubeLookupError extends Error {
  constructor(message, { keyExhausted = false, notFound = false, status = 0, reason = "" } = {}) {
    super(message);
    this.name = "YouTubeLookupError";
    // Named to match the contract routes/transcribe.js and sourceService.js
    // already check against apidirect errors, so the call sites keep one
    // branch rather than growing a second provider's vocabulary.
    this.keyExhausted = keyExhausted;
    this.notFound = notFound;
    this.status = status;
    this.reason = reason;
  }
}

export function isYouTubeDataConfigured() {
  return Boolean(String(process.env.API_KEY_YOUTUBE || "").trim());
}

/**
 * ISO-8601 duration to whole seconds.
 *
 * YouTube reports "PT1M24S" where apidirect reported 84. The two disagree by up
 * to a second on the same video because YouTube rounds UP to the whole second
 * and apidirect rounded down: three of five test videos came back one second
 * longer. That direction is the safe one. The number gates what we are about to
 * pay Gemini to read, so over-stating a length can only ever refuse a video we
 * would have accepted, never accept one we would have refused.
 *
 * @returns {number|null} null when the string is absent or unparseable, and for
 *   "P0D", which is what a live stream or an unstarted premiere reports. Null
 *   means UNKNOWN at every call site, and unknown fails closed.
 */
export function parseIsoDuration(iso) {
  const s = String(iso || "").trim();
  if (!s || s === "P0D") return null;

  const m = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(s);
  if (!m) return null;

  const [, d, h, min, sec] = m;
  const total =
    (d ? parseFloat(d) : 0) * 86400 +
    (h ? parseFloat(h) : 0) * 3600 +
    (min ? parseFloat(min) : 0) * 60 +
    (sec ? parseFloat(sec) : 0);

  // A parse that matched but summed to zero is the "PT0S" case, which is the
  // same unknown as P0D rather than a genuinely zero-length video.
  return total > 0 ? Math.round(total) : null;
}

/**
 * Pick the largest thumbnail YouTube actually rendered.
 *
 * `maxres` and `standard` are NOT generated for every video, so the keys
 * present vary per video and the object has to be probed rather than indexed.
 * Ordered largest first because this is what fills a card.
 */
function bestThumbnail(thumbnails = {}) {
  for (const size of ["maxres", "standard", "high", "medium", "default"]) {
    const url = thumbnails?.[size]?.url;
    if (url) return url;
  }
  return "";
}

/**
 * One API item to the shape the rest of the codebase already speaks.
 *
 * Deliberately field-compatible with what apidirectClient.getYouTubeVideoDetails
 * returned, so swapping the provider touched three call sites and no schema:
 * `duration` in seconds, `author` for the channel name, `date` for publication.
 *
 * `category` is NOT carried across even though categoryId is right there. What
 * a channel covers is asked once at sign-up and stored on the user, and a
 * per-video label derived from YouTube's own taxonomy would be a second, worse
 * answer to a question already answered. It was never read anywhere.
 */
function shape(item, fallbackUrl = "") {
  const sn = item?.snippet || {};
  const cd = item?.contentDetails || {};
  const st = item?.statistics || {};
  const live = sn.liveBroadcastContent;

  const commentCount = st.commentCount == null ? null : Number(st.commentCount);

  return {
    video_id: item?.id || "",
    url: item?.id ? `https://www.youtube.com/watch?v=${item.id}` : fallbackUrl,
    title: sn.title || "",
    author: sn.channelTitle || "",
    channel_id: sn.channelId || "",
    description: String(sn.description || ""),
    duration: parseIsoDuration(cd.duration),
    views: Number(st.viewCount) || 0,
    keywords: Array.isArray(sn.tags) ? sn.tags.filter((k) => typeof k === "string").slice(0, 25) : [],
    thumbnail: bestThumbnail(sn.thumbnails),

    // Two independent signals, because either alone has a hole. A stream that
    // has ENDED reports liveBroadcastContent "none" but keeps a real duration,
    // and should be treated as an ordinary video; one that is live or upcoming
    // reports "P0D" and must never reach Gemini.
    is_live: live === "live" || live === "upcoming",
    type: live === "none" ? "video" : String(live || ""),

    // Already ISO-8601 with a Z. No zone repair needed, unlike apidirect's.
    date: sn.publishedAt || null,

    // ── New, and free ────────────────────────────────────────────────────────
    // YouTube's own record of what is spoken, not a guess from the transcript.
    language: sn.defaultAudioLanguage || sn.defaultLanguage || "",
    // null means the creator DISABLED comments, which is different from zero.
    comment_count: Number.isFinite(commentCount) ? commentCount : null,
    like_count: Number(st.likeCount) || 0,
    embeddable: item?.status?.embeddable !== false,
  };
}

/**
 * Raw call, with retries for transport faults only.
 *
 * A 403 is never retried: quota does not come back within a backoff window, and
 * hammering a refused key is how a transient log becomes a permanent one.
 */
async function request(ids) {
  return get(`${ENDPOINT}?part=${PARTS}&id=${ids.join(",")}`);
}

/**
 * One GET against the API, with retries for transport faults only.
 *
 * @param {string} pathAndQuery  everything up to the key, e.g.
 *   "https://…/channels?part=snippet&id=UC…". The key is appended here so no
 *   call site ever holds it.
 */
async function get(pathAndQuery) {
  const key = String(process.env.API_KEY_YOUTUBE || "").trim();
  if (!key) throw new YouTubeLookupError("API_KEY_YOUTUBE is not set", { keyExhausted: true });

  const url = `${pathAndQuery}&key=${encodeURIComponent(key)}`;
  let lastErr = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      const body = await res.json().catch(() => ({}));

      if (res.ok) return body;

      const reason = body?.error?.errors?.[0]?.reason || "";
      const detail = body?.error?.message || `HTTP ${res.status}`;

      if (EXHAUSTED_REASONS.has(reason)) {
        throw new YouTubeLookupError(`YouTube quota: ${detail}`, {
          keyExhausted: true, status: res.status, reason,
        });
      }
      if (KEY_FAULT_REASONS.has(reason) || res.status === 400 || res.status === 403) {
        // A misconfigured key is not a user's bad link, and it is not transient
        // either. Flagged as exhausted so the call sites say "paused, try
        // later" rather than blaming the URL somebody pasted.
        throw new YouTubeLookupError(`YouTube key rejected: ${detail}`, {
          keyExhausted: true, status: res.status, reason,
        });
      }
      if (res.status === 404) {
        throw new YouTubeLookupError("Video not found", { notFound: true, status: 404, reason });
      }

      lastErr = new YouTubeLookupError(detail, { status: res.status, reason });
    } catch (err) {
      if (err instanceof YouTubeLookupError) throw err;
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }

    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    }
  }

  throw new YouTubeLookupError(lastErr?.message || "YouTube lookup failed");
}

/**
 * Details for one video.
 *
 * @param {string} input  a watch URL, a youtu.be or /shorts link, or a bare id.
 * @returns {Promise<object|null>} null when the video does not exist, is
 *   private, was deleted, or is blocked everywhere we can see.
 *
 *   THAT NULL IS THE IMPORTANT PART. videos.list answers a request for an
 *   unavailable video with HTTP 200 and an EMPTY items array, not an error, so
 *   a caller that only checks for a thrown exception reads deletion as success
 *   and carries on with undefined fields. Normalised to null here, which is the
 *   same thing apidirect returned and the state every call site already handles.
 */
export async function getVideoDetails(input) {
  const parsed = parseYouTubeUrl(input);
  if (!parsed) return null;

  const body = await request([parsed.videoId]);
  const item = body?.items?.[0];
  if (!item) return null;

  return shape(item, parsed.url);
}

/**
 * Details for many videos, in chunks of fifty, one quota unit per chunk.
 *
 * Nothing calls this on the request path yet: adding a video is one video, and
 * batching one id is the same unit as batching fifty. It exists because the
 * background work this unlocks (refreshing a channel's back catalogue, reading
 * comment counts before deciding which videos are worth fetching comments for)
 * is the difference between 1 unit and 50, and writing that loop at the call
 * site is how a 10,000 unit allowance quietly becomes a 200 video ceiling.
 *
 * @param {string[]} inputs  urls or ids, in any mix.
 * @returns {Promise<Map<string, object>>} keyed by video id. Ids that came back
 *   unavailable are ABSENT from the map rather than present with a null, so
 *   `map.get(id)` is falsy exactly when there is nothing to use.
 */
export async function getVideoDetailsBatch(inputs = []) {
  const ids = [];
  for (const raw of inputs) {
    const parsed = parseYouTubeUrl(raw);
    if (parsed && !ids.includes(parsed.videoId)) ids.push(parsed.videoId);
  }

  const out = new Map();
  for (let i = 0; i < ids.length; i += MAX_IDS_PER_CALL) {
    const body = await request(ids.slice(i, i + MAX_IDS_PER_CALL));
    for (const item of body?.items || []) out.set(item.id, shape(item));
  }
  return out;
}

/* ── Channels ──────────────────────────────────────────────────────────────── */

/**
 * The playlist that holds every public upload of a channel, derived rather
 * than fetched.
 *
 * YouTube builds it by swapping the "UC" prefix of a channel id for "UU". That
 * is a documented, stable convention, and it is worth knowing because the
 * alternative is asking channels.list for contentDetails purely to read a
 * string you could have computed. When the id does not start with UC the
 * convention does not apply and this returns null, so the caller falls back to
 * whatever the API told it.
 */
export function uploadsPlaylistId(channelId) {
  const id = String(channelId || "").trim();
  return /^UC[\w-]{22}$/.test(id) ? `UU${id.slice(2)}` : null;
}

/**
 * One channel, by whichever identifier we have. ONE quota unit.
 *
 * The three lookups are alternatives, not a search: each is an exact match on a
 * different key, and each costs a single unit. That is the whole reason this
 * exists. Finding a channel by free text costs 100 units through search.list
 * (below), so the resolver in services/youtubeChannelService.js tries every
 * exact route it can construct before it will spend that.
 *
 * @param {object} by  exactly one of { id, handle, username }.
 *   id       a UC… channel id
 *   handle   the @name form, with or without the @
 *   username a legacy /user/ name, mostly dead but free to try
 * @returns {Promise<object|null>} null when nothing matched, which for a handle
 *   is the ordinary case and not an error.
 */
export async function getChannel({ id, handle, username } = {}) {
  let selector = "";
  if (id) selector = `id=${encodeURIComponent(String(id).trim())}`;
  else if (handle) {
    const h = String(handle).trim().replace(/^@+/, "");
    if (!h) return null;
    selector = `forHandle=${encodeURIComponent(`@${h}`)}`;
  } else if (username) selector = `forUsername=${encodeURIComponent(String(username).trim())}`;
  else return null;

  const body = await get(
    `${CHANNELS_ENDPOINT}?part=snippet,statistics,contentDetails&${selector}`
  );
  const item = body?.items?.[0];
  return item ? shapeChannel(item) : null;
}

/**
 * What a confirmation card needs, and nothing a creator would not recognise.
 *
 * `uploads` is the point of the whole call for the import flow: with it, a
 * channel's newest videos come back from playlistItems.list at one unit per
 * fifty, instead of 100 units through search.list.
 */
function shapeChannel(item) {
  const sn = item?.snippet || {};
  const st = item?.statistics || {};
  return {
    channel_id: item?.id || "",
    title: sn.title || "",
    // "@aerramtechtelugu". The thing a creator will actually recognise as
    // theirs, more reliably than a UC id nobody has memorised.
    handle: sn.customUrl || "",
    description: String(sn.description || "").slice(0, 400),
    thumbnail:
      sn.thumbnails?.high?.url || sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url || "",
    country: sn.country || "",
    published_at: sn.publishedAt || null,
    // Hidden by some channels, in which case the field is simply absent rather
    // than zero, and a card showing "0 subscribers" for a real channel reads as
    // a broken lookup.
    subscribers: st.hiddenSubscriberCount ? null : Number(st.subscriberCount) || 0,
    video_count: Number(st.videoCount) || 0,
    view_count: Number(st.viewCount) || 0,
    uploads:
      item?.contentDetails?.relatedPlaylists?.uploads || uploadsPlaylistId(item?.id) || "",
  };
}

/**
 * A page of a playlist, newest first. ONE quota unit for up to fifty items.
 *
 * Used against a channel's uploads playlist, which is the cheap road to "what
 * has this creator posted lately". Returns ids and titles only: playlistItems
 * does NOT carry duration, so the caller pairs these with getVideoDetailsBatch
 * to find out which of them are short enough to learn from.
 *
 * @returns {Promise<{ids: string[], titles: Map<string,string>, nextPageToken: string, total: number}>}
 */
export async function listPlaylistItems(playlistId, pageToken = "") {
  const pid = String(playlistId || "").trim();
  if (!pid) return { ids: [], titles: new Map(), nextPageToken: "", total: 0 };

  const body = await get(
    `${PLAYLIST_ITEMS_ENDPOINT}?part=snippet,contentDetails&maxResults=50` +
    `&playlistId=${encodeURIComponent(pid)}` +
    (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "")
  );

  const ids = [];
  const titles = new Map();
  for (const it of body?.items || []) {
    const vid = it?.contentDetails?.videoId;
    if (!vid) continue;
    ids.push(vid);
    // Kept as a fallback only. A playlist item's title goes stale when a video
    // is renamed, where videos.list is always current, so the caller prefers
    // the latter and reaches for this when a video has since gone private.
    titles.set(vid, it?.snippet?.title || "");
  }

  return {
    ids,
    titles,
    nextPageToken: body?.nextPageToken || "",
    total: body?.pageInfo?.totalResults || 0,
  };
}

/**
 * Find channels by free text. ONE HUNDRED quota units, and a hard ceiling of
 * 100 searches a day.
 *
 * ── READ THIS BEFORE CALLING IT ──────────────────────────────────────────────
 * This is the most expensive call in the product by two orders of magnitude,
 * and the daily search ceiling is separate from, and far smaller than, the
 * 10,000 unit allowance: one hundred searches spends the ENTIRE day's quota and
 * hits the search cap at the same moment. Ten of these is a tenth of everything
 * this product can do today.
 *
 * It exists as the last resort of the resolver and nothing else should call it.
 * Every exact lookup, a url, a handle, a channel id, a slugified name, costs a
 * single unit and covers the overwhelming majority of real inputs, because a
 * creator entering their OWN channel knows its name and YouTube generated most
 * handles from channel names.
 *
 * Results are RANKED BY RELEVANCE, not filtered for exactness. Two channels can
 * carry the same title, and impersonation is common, so a caller must never
 * auto-select the top hit: the creator confirms.
 */
export async function searchChannels(query, max = 5) {
  const q = String(query || "").trim();
  if (!q) return [];

  console.warn(`[youtube] search.list for "${q}" costs 100 quota units of 10,000/day`);

  const body = await get(
    `${SEARCH_ENDPOINT}?part=snippet&type=channel&maxResults=${Math.min(Math.max(1, max), 10)}` +
    `&q=${encodeURIComponent(q)}`
  );

  return (body?.items || [])
    .map((it) => ({
      channel_id: it?.id?.channelId || it?.snippet?.channelId || "",
      title: it?.snippet?.title || "",
      description: String(it?.snippet?.description || "").slice(0, 400),
      thumbnail:
        it?.snippet?.thumbnails?.high?.url ||
        it?.snippet?.thumbnails?.medium?.url ||
        it?.snippet?.thumbnails?.default?.url || "",
      // search.list carries none of these. Left null rather than zero so a card
      // can tell "not known" from "none", and so the resolver can decide
      // whether one more unit to fill them in is worth spending.
      handle: "",
      subscribers: null,
      video_count: 0,
      uploads: uploadsPlaylistId(it?.id?.channelId) || "",
    }))
    .filter((c) => c.channel_id);
}

export default {
  getVideoDetails,
  getVideoDetailsBatch,
  getChannel,
  listPlaylistItems,
  searchChannels,
  uploadsPlaylistId,
  isYouTubeDataConfigured,
  parseIsoDuration,
  MAX_IDS_PER_CALL,
};

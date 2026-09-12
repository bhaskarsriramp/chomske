/**
 * youtubeChannelService.js: find a creator's channel, then their recent videos.
 *
 * ── THE PROBLEM THIS SOLVES ──────────────────────────────────────────────────
 * Building a voice used to mean hunting down five of your own video URLs, one
 * at a time, in another tab. Everybody has their own channel open all day and
 * nobody has their video ids to hand, so the first thing this product asked of
 * a creator was the most tedious thing in it.
 *
 * The whole of that is replaced by typing a channel name.
 *
 * ── WHY THE RESOLVER IS A LADDER AND NOT A SEARCH ────────────────────────────
 * The obvious implementation is search.list, and it would work, and it would
 * cap this product at a hundred onboarding attempts a day forever. search.list
 * costs 100 quota units against a 10,000 unit daily allowance, and sits behind
 * a SEPARATE ceiling of 100 searches a day. Those two limits bite at the same
 * moment: a hundred people typing their channel name spends everything.
 *
 * Worse, it is not a limit money fixes. The Gemini bill is a spend problem with
 * a spend solution; a YouTube quota extension needs Google's audit, which is
 * slow and frequently refused.
 *
 * So every exact route is tried first, and each of them costs ONE unit:
 *
 *   a pasted url          →  parse it, look up the id or handle directly
 *   a pasted VIDEO url    →  videos.list gives us snippet.channelId
 *   "@aerramtechtelugu"   →  channels.list?forHandle
 *   "UC1Y55DeTnp0efAK…"   →  channels.list?id
 *   "Aerram Tech Telugu"  →  SLUGIFY IT and try it as a handle
 *
 * That fourth-from-last line is the one that makes free-text input affordable.
 * YouTube generated handles from channel names when it introduced them, so for
 * a large share of channels the handle simply IS the name, lowercased with the
 * spaces taken out. Verified against a real channel: "Aerram Tech Telugu"
 * resolves through @aerramtechtelugu for one unit.
 *
 * search.list runs only when all of that misses, which leaves it for genuinely
 * ambiguous names rather than making it the default path.
 *
 * ── AND WHY THE CREATOR ALWAYS CONFIRMS ──────────────────────────────────────
 * Even an exact title match is shown for confirmation rather than accepted.
 * search.list ranks by relevance and has no notion of exactness, two channels
 * can hold identical titles, and impersonation is common in exactly the niche
 * this product serves. Picking the wrong channel does not fail loudly: it
 * spends five video reads and hands back a voice profile of a stranger.
 */
import {
  getChannel,
  getVideoDetails,
  getVideoDetailsBatch,
  listPlaylistItems,
  searchChannels,
  uploadsPlaylistId,
} from "./youtubeDataClient.js";
import { parseYouTubeUrl } from "../utils/youtube.js";

/** How many eligible videos to offer. Ten to choose five from. */
export const OFFER_COUNT = parseInt(process.env.CHANNEL_OFFER_COUNT || "10", 10);

/**
 * How deep to dig for those ten, in pages of fifty.
 *
 * Three pages, so 150 uploads. The eligible band is short videos only, and a
 * creator who mostly posts long-form may have few of them near the top: on the
 * one real channel measured, 25 of the newest 50 uploads qualified, but a
 * long-form channel could need the extra pages. Each page is one quota unit,
 * so the ceiling exists to stop an unbounded crawl, not to save money.
 */
const MAX_PAGES = parseInt(process.env.CHANNEL_SCAN_PAGES || "3", 10);

/**
 * A channel name reduced to the handle YouTube most likely generated from it.
 *
 * Lowercased, with everything a handle cannot contain removed. Handles allow
 * letters, digits, underscore, hyphen and period, so those survive and spaces
 * and punctuation do not.
 */
export function slugifyHandle(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9._-]+/g, "")
    .slice(0, 30);
}

/** A bare UC channel id, as pasted. */
function asChannelId(s) {
  const v = String(s || "").trim();
  return /^UC[\w-]{22}$/.test(v) ? v : null;
}

/**
 * Pull a channel identifier out of any YouTube URL shape.
 *
 * @returns {{kind: "id"|"handle"|"username"|"video", value: string}|null}
 */
export function parseChannelInput(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;

  // Not a url. A bare id, a bare @handle, or a name.
  if (!/^(https?:\/\/|www\.|youtube\.com|youtu\.be|m\.youtube\.com)/i.test(raw)) {
    if (asChannelId(raw)) return { kind: "id", value: raw };
    if (raw.startsWith("@")) return { kind: "handle", value: raw.slice(1) };
    return null;
  }

  // A video url is a perfectly good way to name a channel, and it is the one
  // shape a creator can always produce: open any of their videos, copy the
  // address. videos.list answers it for a single unit.
  const video = parseYouTubeUrl(raw);
  if (video) return { kind: "video", value: video.videoId };

  let u;
  try {
    u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const path = u.pathname.replace(/\/+$/, "");

  const byId = path.match(/^\/channel\/(UC[\w-]{22})/);
  if (byId) return { kind: "id", value: byId[1] };

  const byHandle = path.match(/^\/@([\w.-]+)/);
  if (byHandle) return { kind: "handle", value: byHandle[1] };

  const byUser = path.match(/^\/user\/([\w.-]+)/);
  if (byUser) return { kind: "username", value: byUser[1] };

  // /c/CustomName. There is no API lookup for these, so it is handed on as a
  // name and takes its chances with the slug attempt and then search.
  const byCustom = path.match(/^\/c\/([\w.-]+)/);
  if (byCustom) return { kind: "handle", value: byCustom[1] };

  return null;
}

/**
 * Find the channel somebody meant.
 *
 * @param {string} input  a url, an @handle, a UC id, or a channel name.
 * @returns {Promise<{match: object|null, candidates: object[], searched: boolean, units: number}>}
 *   `match` is a single confident hit, still to be confirmed by the creator.
 *   `candidates` is the ambiguous case, for a pick-one list.
 *   `searched` says whether the 100 unit call was spent, for the logs.
 */
export async function resolveChannel(input) {
  const raw = String(input || "").trim();
  if (!raw) return { match: null, candidates: [], searched: false, units: 0 };

  let units = 0;
  const parsed = parseChannelInput(raw);

  // ── Exact routes, one unit each ──────────────────────────────────────────
  if (parsed) {
    if (parsed.kind === "video") {
      units += 1;
      const v = await getVideoDetails(parsed.value).catch(() => null);
      if (v?.channel_id) {
        units += 1;
        const ch = await getChannel({ id: v.channel_id }).catch(() => null);
        if (ch) return { match: ch, candidates: [], searched: false, units };
      }
    } else {
      units += 1;
      const ch = await getChannel({ [parsed.kind]: parsed.value }).catch(() => null);
      if (ch) return { match: ch, candidates: [], searched: false, units };
    }
  }

  // ── The slug gamble, one unit ────────────────────────────────────────────
  // A plain name, tried as the handle YouTube probably minted from it. Skipped
  // when the input was already a handle that missed, since retrying the same
  // string with the punctuation stripped is a second guess at the same thing
  // and occasionally is not, which is why it is compared rather than assumed.
  const slug = slugifyHandle(parsed?.kind === "handle" ? parsed.value : raw);
  const alreadyTried = parsed?.kind === "handle" && slugifyHandle(parsed.value) === slug;
  if (slug && !alreadyTried) {
    units += 1;
    const ch = await getChannel({ handle: slug }).catch(() => null);
    if (ch) return { match: ch, candidates: [], searched: false, units };
  }

  // ── Last resort, one hundred units ───────────────────────────────────────
  // Never reached by a url, a handle or an id. This is for a name that is not
  // also a handle, which is the minority case it is worth keeping alive for.
  units += 100;
  const candidates = await searchChannels(raw, 5).catch(() => []);

  // A single hit is still a candidate, not a match. search.list ranks by
  // relevance, so "one result" means "one result we were shown", not "the
  // right one", and the creator is the only one who can say.
  return { match: null, candidates, searched: true, units };
}

/**
 * A channel's most recent videos that are short enough to learn from.
 *
 * ── WHY DURATION AND NOT "IS IT A SHORT" ─────────────────────────────────────
 * The API carries no isShort flag, and it does not matter that it does not.
 * What decides whether a video can train the short voice is its LENGTH, which
 * the API does carry, so a 90 second Short and a 150 second ordinary upload are
 * the same thing to this product and are treated as one pool.
 *
 * The ceiling is passed in rather than read here, because the only correct
 * value for it is services/voiceLanes.js's SHORT_MAX_SECONDS. Offering a video
 * the transcribe endpoint will then refuse is the single worst outcome this
 * screen can produce: it reads as a bug, and the creator has no way to tell
 * which of their five picks was the problem.
 *
 * @returns {Promise<{videos: object[], scanned: number, total: number, units: number}>}
 */
export async function recentEligible(channel, { maxSeconds, want = OFFER_COUNT } = {}) {
  const uploads =
    (typeof channel === "string" ? uploadsPlaylistId(channel) : channel?.uploads) || "";
  if (!uploads) return { videos: [], scanned: 0, total: 0, units: 0 };

  const ceiling = Number(maxSeconds) > 0 ? Number(maxSeconds) : 180;

  const out = [];
  let pageToken = "";
  let scanned = 0;
  let total = 0;
  let units = 0;

  for (let page = 0; page < MAX_PAGES && out.length < want; page++) {
    units += 1;
    const listed = await listPlaylistItems(uploads, pageToken);
    if (!listed.ids.length) break;

    total = listed.total || total;
    scanned += listed.ids.length;

    // One unit for up to fifty durations. Titles come from here too rather
    // than from the playlist, because a playlist item keeps the title a video
    // had when it was added and creators rename videos constantly.
    units += 1;
    const details = await getVideoDetailsBatch(listed.ids);

    for (const id of listed.ids) {
      if (out.length >= want) break;
      const d = details.get(id);

      // Absent means private, deleted or blocked since the playlist was built.
      // Silently skipped: it is not a video the creator can offer us anyway.
      if (!d) continue;

      // Null duration is a live stream or an unstarted premiere, which reports
      // P0D. Treating it as zero would slip a stream past the ceiling.
      if (!d.duration || d.duration <= 0) continue;
      if (d.duration > ceiling) continue;
      if (d.is_live) continue;

      out.push({
        video_id: id,
        url: `https://www.youtube.com/watch?v=${id}`,
        title: d.title || listed.titles.get(id) || "",
        duration_seconds: d.duration,
        thumbnail: d.thumbnail || "",
        views: d.views || 0,
        published_at: d.date || null,
      });
    }

    pageToken = listed.nextPageToken;
    if (!pageToken) break;
  }

  return { videos: out, scanned, total, units };
}

export default { resolveChannel, recentEligible, parseChannelInput, slugifyHandle, OFFER_COUNT };

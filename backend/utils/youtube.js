/**
 * youtube.js — turn whatever the user pasted into a canonical video id + URL.
 *
 * People paste every shape there is: youtu.be links, /shorts/, /live/, /embed/,
 * URLs carrying a playlist or a ?t= timestamp, mobile m.youtube.com, and plain
 * ids. Gemini wants one clean watch URL, and our cache key wants one stable id,
 * so both are derived here rather than at each call site.
 */

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * @returns {{ videoId: string, url: string } | null} null when it isn't a video link.
 */
export function parseYouTubeUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;

  // A bare id, pasted on its own.
  if (ID_RE.test(raw)) return canonical(raw);

  let u;
  try {
    u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = u.hostname.replace(/^www\./i, "").replace(/^m\./i, "").toLowerCase();
  const path = u.pathname.replace(/\/+$/, "");

  // youtu.be/<id>
  if (host === "youtu.be") {
    const id = path.split("/")[1];
    return ID_RE.test(id || "") ? canonical(id) : null;
  }

  if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;

  // /watch?v=<id>
  const v = u.searchParams.get("v");
  if (v && ID_RE.test(v)) return canonical(v);

  // /shorts/<id>, /live/<id>, /embed/<id>, /v/<id>
  const m = path.match(/^\/(shorts|live|embed|v)\/([A-Za-z0-9_-]{11})/);
  if (m) return canonical(m[2]);

  return null;
}

function canonical(videoId) {
  // Deliberately stripped of playlist / timestamp / tracking params: those change
  // the URL string without changing the video, which would defeat the cache and
  // could point Gemini at a different starting position than the user expects.
  return { videoId, url: `https://www.youtube.com/watch?v=${videoId}` };
}

export default { parseYouTubeUrl };

/**
 * projectService.js: the editor's shared vocabulary.
 *
 * Limits, which files are accepted, where a project's files live, how a script
 * becomes lines, and what the browser is told about a project. Used by the
 * routes and by the job runner, which must agree on all of it.
 */
import { sentences } from "../voiceMetrics.js";
import { readUrl, KEY_ROOT } from "../media/storage.js";
import { publishUserEvent } from "../newsEvents.js";
import { editCost, EDIT_ANALYSE_CREDITS_PER_MIN, EDIT_EXPORT_CREDITS_PER_MIN } from "../creditPricing.js";
import { layout } from "./timeline.js";

const MB = 1024 * 1024;
const int = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export const EDIT_LIMITS = {
  maxUploadBytes: int(process.env.EDIT_MAX_UPLOAD_MB, 2048) * MB,
  // Across every recording in a project. Twenty minutes covers an eight-minute
  // script read with plenty of retakes, and bounds what one analysis can cost.
  maxRecordingSeconds: int(process.env.EDIT_MAX_RECORDING_SECONDS, 1200),
  maxAssetSeconds: int(process.env.EDIT_MAX_ASSET_SECONDS, 900),
  maxMedia: int(process.env.EDIT_MAX_MEDIA, 60),
  retentionDays: int(process.env.EDIT_RETENTION_DAYS, 7),
  dailyAnalyses: int(process.env.EDIT_DAILY_ANALYSES, 25),
  dailyExports: int(process.env.EDIT_DAILY_EXPORTS, 25),
};

/** Written against CreditLedger's reason for every editor charge and refund. */
export const LEDGER_REASON = "edit";

const EXT_BY_MIME = {
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/x-matroska": "mkv", "video/3gpp": "3gp",
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac",
  "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav", "audio/ogg": "ogg", "audio/webm": "weba",
};
const TYPE_BY_EXT = {
  mp4: "video", mov: "video", m4v: "video", webm: "video", mkv: "video", "3gp": "video",
  jpg: "image", jpeg: "image", png: "image", webp: "image",
  mp3: "audio", m4a: "audio", aac: "audio", wav: "audio", ogg: "audio", weba: "audio",
};

/** The file extensions the upload pickers offer. */
export const ACCEPT = {
  recording: ".mp4,.mov,.m4v,.webm,.mkv,.3gp,video/*",
  asset: ".mp4,.mov,.m4v,.webm,.jpg,.jpeg,.png,.webp,.mp3,.m4a,.aac,.wav,.ogg",
};

/**
 * What kind of file this is, from what the browser said and the name.
 *
 * Images are narrower than "anything image/*": HEIC from an iPhone, GIF and
 * SVG would all pass a prefix check and then fail in ffmpeg with an error
 * nobody can act on. Refused here, the message can say what to use instead.
 */
export function classify(mime, filename) {
  const m = String(mime || "").toLowerCase();
  const ext = String(filename || "").toLowerCase().split(".").pop();
  let type = m.startsWith("video/") ? "video" : m.startsWith("image/") ? "image" : m.startsWith("audio/") ? "audio" : TYPE_BY_EXT[ext] || null;
  if (type === "image" && !(EXT_BY_MIME[m] || ["jpg", "jpeg", "png", "webp"].includes(ext))) type = null;
  const safeExt = EXT_BY_MIME[m] || (TYPE_BY_EXT[ext] ? ext : type === "video" ? "mp4" : "bin");
  return { type, ext: safeExt };
}

export const projectPrefix = (p) => `${KEY_ROOT}/edit/${p.user}/${p._id}`;
export const mediaKey = (p, mediaId, folder, ext) => `${projectPrefix(p)}/${folder}/${mediaId}.${ext}`;

/** Every touch of a project keeps its files for another retention period. */
export const bumpExpiry = () => new Date(Date.now() + EDIT_LIMITS.retentionDays * 86400000);

/**
 * The script as numbered lines.
 *
 * The shoot pack's lines when there is one: they are the lines the B-roll was
 * planned against, so a shot for "line 4" lands on the same line 4 the
 * matching produced. Otherwise the same sentence split the pack uses.
 */
export function scriptLines(script) {
  const pack = script?.shoot_pack;
  if (Array.isArray(pack?.lines) && pack.lines.length) {
    return pack.lines.map((l) => ({ n: Number(l.n), text: String(l.text || ""), roman: String(l.roman || "") }));
  }
  const native = sentences(script?.text || "");
  const roman = script?.roman_aligned ? sentences(script?.roman_text || "") : [];
  const aligned = roman.length === native.length;
  return native.map((t, i) => ({ n: i + 1, text: t, roman: aligned ? roman[i] : "" }));
}

/** Tell the owner's open tabs something changed. The browser re-reads the project. */
export function publishProgress(project, fields = {}) {
  return publishUserEvent({
    type: "edit:update",
    user: String(project.user),
    project: String(project._id),
    ...fields,
  }).catch(() => {});
}

/* ── Signed URLs, kept stable ───────────────────────────────────────────────
   The editor re-reads a project every few seconds while something is running.
   A fresh signed URL on every read would change the <video> element's src each
   time, which restarts the preview mid-playback, and on a VM without a key file
   each signature is a round trip to IAM. So a URL is minted once and reused for
   half its lifetime. */
const urlCache = new Map();
async function stableUrl(key, opts) {
  const now = Date.now();
  const hit = urlCache.get(key);
  if (hit && hit.until > now) return hit.url;
  const url = await readUrl(key, { ...opts, expiresSec: 12 * 3600 });
  urlCache.set(key, { url, until: now + 6 * 3600 * 1000 });
  if (urlCache.size > 5000) {
    for (const k of urlCache.keys()) {
      urlCache.delete(k);
      if (urlCache.size <= 4000) break;
    }
  }
  return url;
}

/**
 * What the browser is told about a project.
 *
 * Storage keys never leave the server: the browser gets URLs to play and look
 * at, and nothing it could use to ask for a different file.
 */
export async function shapeProject(doc, { baseUrl, withTimeline = true } = {}) {
  const p = doc?.toObject ? doc.toObject() : doc;

  const media = await Promise.all(
    (p.media || []).map(async (m) => {
      const ready = m.status === "ready";
      return {
        id: m.id,
        kind: m.kind,
        type: m.type,
        status: m.status,
        filename: m.filename,
        size: m.size,
        order: m.order,
        duration: m.duration,
        width: m.width,
        height: m.height,
        has_audio: m.has_audio,
        error: m.error,
        created_at: m.created_at,
        proxy_url: ready && m.proxy_key
          ? await stableUrl(m.proxy_key, { baseUrl, contentType: m.type === "audio" ? "audio/mp4" : "video/mp4" })
          : null,
        thumb_url: ready && m.thumb_key ? await stableUrl(m.thumb_key, { baseUrl, contentType: "image/jpeg" }) : null,
        image_url: ready && m.type === "image" ? await stableUrl(m.key, { baseUrl, contentType: m.mime || "image/jpeg" }) : null,
      };
    })
  );

  const recordingSeconds = media
    .filter((m) => m.kind === "recording" && m.status === "ready")
    .reduce((n, m) => n + (Number(m.duration) || 0), 0);
  const duration = p.timeline ? layout(p.timeline).duration : 0;

  return {
    id: String(p._id),
    script: String(p.script),
    headline: p.headline,
    language_label: p.language_label,
    status: p.status,
    stage: p.stage,
    progress: p.progress,
    error: p.error,
    media,
    timeline: withTimeline ? p.timeline : undefined,
    timeline_rev: p.timeline_rev,
    duration,
    analysis: {
      charged: p.analysis?.charged || 0,
      seconds: p.analysis?.seconds || 0,
      stats: p.analysis?.stats || null,
      finished_at: p.analysis?.finished_at || null,
    },
    renders: (p.renders || []).map((r) => ({
      id: r.id, status: r.status, stage: r.stage, progress: r.progress, error: r.error,
      aspect: r.aspect, size: r.size, duration: r.duration, charged: r.charged,
      created_at: r.created_at, finished_at: r.finished_at,
    })),
    // Priced here, from the saved state, never in the browser. See the note at
    // the top of ScriptOrder.js on why a price has one source.
    pricing: {
      analyse: recordingSeconds > 0 ? editCost("analyse", recordingSeconds) : 0,
      analyse_seconds: recordingSeconds,
      export: duration > 0 ? editCost("export", duration) : 0,
      analyse_per_min: EDIT_ANALYSE_CREDITS_PER_MIN,
      export_per_min: EDIT_EXPORT_CREDITS_PER_MIN,
    },
    expires_at: p.expires_at,
    purged: !!p.purged,
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
}

export default {
  EDIT_LIMITS, LEDGER_REASON, ACCEPT, classify, projectPrefix, mediaKey, bumpExpiry,
  scriptLines, publishProgress, shapeProject,
};

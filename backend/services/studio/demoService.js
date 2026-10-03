/**
 * demoService.js: the demo studio's shared vocabulary.
 *
 * Limits, what a capture may be, where a demo's files live, what analysing and
 * exporting cost, and what the browser is told about a demo. Used by the routes
 * and by the job runner, which have to agree on all of it.
 */
import { readUrl, isRelayUrl, KEY_ROOT } from "../media/storage.js";
import { publishUserEvent } from "../newsEvents.js";
import { layout, drewCounts } from "./timeline.js";
import { RENDER_ENGINE } from "./exportOptions.js";
import { CREDITS_PER_MINUTE, videoCredits, exportExtraCredits } from "../creditPricing.js";
import { isPaid, owed, videoPrice, trialCovers } from "./videoBilling.js";

const MB = 1024 * 1024;
const int = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export const STUDIO_LIMITS = {
  maxUploadBytes: int(process.env.STUDIO_MAX_UPLOAD_MB, 4096) * MB,
  /**
   * The longest recording this product will accept: three minutes (the
   * creator's decision, 2026-10-03; it was thirty). The recorder stops itself
   * there (RecordPage.js) and the editor is told it through /studio/config;
   * one that arrives longer anyway is cut to it when it is prepared
   * (studioRunner.js). It also bounds one analysis: the vision pass reads a
   * frame every couple of seconds, so the length IS the size of the bill, and
   * the pointer locator reads frame by frame only up to 180 s (locate.js).
   */
  maxRecordingSeconds: int(process.env.STUDIO_MAX_RECORDING_SECONDS, 180),
  /** Live (unexpired) demos per creator. Each can hold gigabytes for a week. */
  maxDemos: int(process.env.STUDIO_MAX_DEMOS, 60),
  retentionDays: int(process.env.STUDIO_RETENTION_DAYS, 7),
  dailyAnalyses: int(process.env.STUDIO_DAILY_ANALYSES, 25),
  dailyExports: int(process.env.STUDIO_DAILY_EXPORTS, 40),
  /** Seconds between the frames the vision pass reads. */
  frameEvery: Number(process.env.STUDIO_FRAME_EVERY || 2),
};

/** Written against CreditLedger's reason for every studio charge and refund. */
export const LEDGER_REASON = "studio";

/**
 * What a browser recording arrives as.
 *
 * MediaRecorder produces WebM almost everywhere and fragmented MP4 on some
 * Chrome builds; both are accepted and both are remuxed on arrival, because
 * neither carries a usable duration while it is being written
 * (services/media/ffmpeg.js remuxRecording).
 */
export const ACCEPT_MIME = [
  "video/webm", "video/x-matroska", "video/mp4", "video/quicktime",
];

export const acceptable = (mime) => ACCEPT_MIME.some((m) => String(mime || "").toLowerCase().startsWith(m));

export const demoPrefix = (d) => `${KEY_ROOT}/studio/${d.user}/${d._id}`;
export const demoKey = (d, folder, name) => `${demoPrefix(d)}/${folder}/${name}`;

export const bumpExpiry = () => new Date(Date.now() + STUDIO_LIMITS.retentionDays * 86400000);

/* ────────────────────────────────────────────────────────────────────────────
   Pricing
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * ── ONE PRICE PER VIDEO (2026-10-03) ─────────────────────────────────────────
 * A video is charged once, when Clipo starts on it, in proportion to its
 * length: $2 a minute, one credit a second (creditPricing.js videoCredits).
 * The same for "Zoom on clicks" and for a product demo, which is built on the
 * same analysis. Everything after that is part of the video: reading the
 * screens, captions, the voice, the chat, music, and exports up to 1440p. The
 * only extra is a 4K export (exportCredits).
 *
 * Recording, uploading, previewing and editing were always free, and still
 * are: a meter running while somebody drags a zoom handle is a meter that
 * makes them stop editing.
 */
export const STUDIO_CREDITS_PER_MIN = CREDITS_PER_MINUTE;

/**
 * @param {"analyse"|"read"|"export"} kind
 * @param {number} seconds  the recording's length
 * @returns {number} credits; 0 for anything included in the video
 */
export function studioCost(kind, seconds) {
  return kind === "analyse" ? videoCredits(seconds) : 0;
}

/** What an export of `seconds` of finished video costs on top: 0 below 4K. */
export function exportCredits(seconds, options = {}) {
  return exportExtraCredits(seconds, options?.resolution);
}

/* ────────────────────────────────────────────────────────────────────────────
   Telling the browser
   ──────────────────────────────────────────────────────────────────────────── */

export function publishProgress(demo, fields = {}) {
  return publishUserEvent({
    type: "studio:update",
    user: String(demo.user),
    demo: String(demo._id),
    ...fields,
  }).catch(() => {});
}

/* ── Signed URLs, kept stable ───────────────────────────────────────────────
   The editor re-reads a demo every few seconds while something is running. A
   fresh signed URL on every read would change the <video> element's src each
   time, restarting the preview mid-playback, and on a VM without a key file
   each signature is a round trip to IAM. So a URL is minted once and reused for
   half its lifetime. Same cache as the script editor's, separate instance.

   That round trip sometimes fails ("Premature close": IAM's reply cut off).
   readUrl tries again; if it still fails, an older URL for the same file that
   has not expired yet is used, and failing that an `optional` one (a
   thumbnail, an export link, a background) comes back empty, so one dropped
   signature costs a missing picture rather than the whole library or editor.
   Only what cannot be done without (the editor's video) still fails the
   request. A key being signed is signed once, however many ask at once: after
   a restart the cache is empty and a library page asks for every thumbnail
   together. */
const URL_LIFE = 12 * 3600 * 1000;
/**
 * ── WHAT THE EDITOR PLAYS ────────────────────────────────────────────────────
 * A copy of the recording at its own size, up to PREVIEW_LINES, with a
 * keyframe every second so scrubbing lands where it is asked to (studioRunner
 * prepare). It used to be 540p at CRF 30, and interface text in the preview
 * was a smear while the export, made from the original, was sharp.
 *
 * Recordings prepared before that still have only the small copy. Theirs
 * plays the original instead, which is as sharp as the export: slower to seek
 * (a browser recording has a keyframe every four seconds or so), but only on
 * those, and never on one too big for a preview to decode smoothly.
 */
export const PREVIEW_LINES = 1440;
export const PREVIEW_VERSION = 2;
function previewKey(r) {
  if ((r.proxy_v || 0) >= PREVIEW_VERSION || !r.mp4_key) return r.proxy_key;
  const lines = Math.min(r.width || 0, r.height || 0);
  return lines > 0 && lines <= PREVIEW_LINES ? r.mp4_key : r.proxy_key;
}

const urlCache = new Map();
const signing = new Map();
export async function stableUrl(key, opts = {}) {
  if (!key) return "";
  const { optional = false, ...rest } = opts;
  const now = Date.now();
  const hit = urlCache.get(key);
  if (hit && hit.until > now) return hit.url;
  let job = signing.get(key);
  if (!job) {
    job = readUrl(key, { ...rest, expiresSec: URL_LIFE / 1000 })
      .then((url) => {
        const at = Date.now();
        // Served through this server because signing failed: kept only a
        // little while, so the bucket's own URL comes back once it signs again.
        const keep = isRelayUrl(url) ? 20 * 60 * 1000 : URL_LIFE / 2;
        urlCache.set(key, { url, until: at + keep, valid: at + URL_LIFE - 30 * 60 * 1000 });
        if (urlCache.size > 5000) {
          for (const k of urlCache.keys()) {
            urlCache.delete(k);
            if (urlCache.size <= 4000) break;
          }
        }
        return url;
      })
      .finally(() => signing.delete(key));
    signing.set(key, job);
  }
  try {
    return await job;
  } catch (err) {
    if (hit && hit.valid > Date.now()) return hit.url;
    if (optional) {
      console.error(`[studio] couldn't sign ${key}, left empty:`, err.message);
      return "";
    }
    throw err;
  }
}

/**
 * The AI voiceover as the editor sees it: which voice, what it was made from
 * (sig), where each sentence sits, and a URL to play. The storage key stays
 * here.
 */
export async function shapeVoiceover(d, { baseUrl } = {}) {
  const v = d.voiceover;
  if (!v?.key) return null;
  return {
    name: v.name,
    sig: v.sig,
    seconds: v.seconds || 0,
    sentences: v.sentences || [],
    made_at: v.made_at || null,
    url: await stableUrl(v.key, { baseUrl, optional: true }),
  };
}

/** The follows of the blurs the timeline still has; a deleted blur's go unsaid. */
export function followsFor(d) {
  const all = d.follows || {};
  const out = {};
  for (const b of d.timeline?.blurs || []) if (all[b.id]) out[b.id] = all[b.id];
  return out;
}

/**
 * What the browser is told about a demo.
 *
 * Storage keys never leave the server: the browser gets URLs to play and look
 * at, and nothing it could use to ask for a different file. The raw tracker
 * report never leaves either — it is megabytes, the browser already has its own
 * copy while recording, and the editor works from the timeline's smoothed track.
 */
export async function shapeDemo(doc, { baseUrl, withTimeline = true } = {}) {
  const d = doc.toObject ? doc.toObject() : doc;
  const r = d.recording || {};
  const lay = d.timeline ? layout(d.timeline) : null;

  return {
    id: String(d._id),
    // The address-bar id (demoSlug.js). The browser opens a demo by this.
    slug: d.slug || "",
    // Each blur's follow, for the blurs that still exist (follow.mjs).
    follows: followsFor(d),
    // The AI voiceover, when one has been made (voice.js).
    voiceover: await shapeVoiceover(d, { baseUrl }),
    title: d.title || "Untitled recording",
    status: d.status,
    stage: d.stage || "",
    progress: d.progress || 0,
    error: d.error || "",
    rev: d.rev || 0,
    purged: !!d.purged,
    expires_at: d.expires_at || null,
    created_at: d.created_at,
    updated_at: d.updated_at,

    // Whether it is paid for and what it costs (videoBilling.js): the editor
    // draws the watermark on an unpaid video and prices its first export.
    billing: {
      paid: isPaid(d),
      trial: !!d.billing?.trial,
      // The free video, while it is within the free length.
      trial_covers: trialCovers(d),
      price: videoPrice(d),
      // Owed before an AI feature runs now: 0 when paid, or free for now.
      owed: owed(d),
    },

    recording: {
      status: r.status || "uploading",
      duration: r.duration || 0,
      width: r.width || 0,
      height: r.height || 0,
      fps: r.fps || 0,
      size: r.size || 0,
      has_audio: !!r.has_audio,
      error: r.error || "",
      proxy_url: await stableUrl(previewKey(r), { baseUrl }),
      thumb_url: await stableUrl(r.thumb_key, { baseUrl, optional: true }),
    },

    capture: {
      surface: d.capture?.surface || "unknown",
      label: d.capture?.label || "",
      mic: !!d.capture?.mic,
      system_audio: !!d.capture?.system_audio,
      samples: d.capture?.samples || 0,
    },

    analysis: {
      status: d.analysis?.status || "none",
      summary: d.analysis?.summary || "",
      product: d.analysis?.product || "",
      language_label: d.analysis?.language_label || "",
      frames_read: d.analysis?.frames_read || 0,
      blur_checked: !!d.analysis?.blur_checked,
      frames_failed: d.analysis?.frames_failed || 0,
      verdict: d.analysis?.verdict || "",
      suggestions: (d.analysis?.suggestions || []).filter((s) => !(d.analysis?.resolved || []).includes(s.id)),
      /**
       * ── WHAT THE CROSS-CHECK ACTUALLY DID ─────────────────────────────────
       * Counts, not findings. The findings themselves are on the demo for
       * anyone debugging, and most of them are "this was nothing" — a list the
       * editor would only make noisier. What a creator wants to know is that
       * the recording WAS checked and how thoroughly, which is the difference
       * between "nothing to fix" meaning nobody looked and "nothing to fix"
       * meaning eleven moments were looked at and all eleven were fine.
       */
      audit: d.analysis?.audited_at
        ? {
            at: d.analysis.audited_at,
            changes: Array.isArray(d.analysis?.changes) ? d.analysis.changes.length : 0,
            findings: Array.isArray(d.analysis?.findings) ? d.analysis.findings.length : 0,
            checked: Array.isArray(d.analysis?.findings)
              ? d.analysis.findings.filter((f) => f.kind !== "no_change_needed").length
              : 0,
          }
        : null,
      error: d.analysis?.error || "",
      finished_at: d.analysis?.finished_at || null,
    },

    timeline: withTimeline ? d.timeline || null : undefined,
    summary: d.timeline ? drewCounts(d.timeline, lay) : null,
    output_duration: lay ? Math.round(lay.duration * 100) / 100 : 0,

    renders: await Promise.all(
      (d.renders || []).map(async (x) => ({
        id: x.id,
        status: x.status,
        stage: x.stage || "",
        progress: x.progress || 0,
        error: x.error || "",
        options: x.options || null,
        drew: x.drew || null,
        size: x.size || 0,
        duration: x.duration || 0,
        width: x.width || 0,
        height: x.height || 0,
        created_at: x.created_at,
        finished_at: x.finished_at || null,
        // Stale only in the sense that the server has learned to draw something
        // this file predates. The editor offers a re-export rather than
        // pretending the old file has it.
        stale: (x.engine || 0) < RENDER_ENGINE,
        url: x.status === "done" ? await stableUrl(x.output_key, { baseUrl, optional: true }) : "",
      }))
    ),
  };
}

/** The short form for the library list. */
export async function shapeDemoCard(doc, { baseUrl } = {}) {
  const d = doc.toObject ? doc.toObject() : doc;
  const lay = d.timeline ? layout(d.timeline) : null;
  return {
    id: String(d._id),
    slug: d.slug || "",
    title: d.title || "Untitled recording",
    status: d.status,
    progress: d.progress || 0,
    purged: !!d.purged,
    duration: d.recording?.duration || 0,
    output_duration: lay ? Math.round(lay.duration * 100) / 100 : 0,
    width: d.recording?.width || 0,
    height: d.recording?.height || 0,
    renders: (d.renders || []).filter((r) => r.status === "done").length,
    thumb_url: await stableUrl(d.recording?.thumb_key, { baseUrl, optional: true }),
    created_at: d.created_at,
    updated_at: d.updated_at,
    expires_at: d.expires_at || null,
  };
}

export default {
  STUDIO_LIMITS, LEDGER_REASON, ACCEPT_MIME, acceptable,
  demoPrefix, demoKey, bumpExpiry,
  STUDIO_CREDITS_PER_MIN, studioCost, exportCredits,
  publishProgress, shapeDemo, shapeDemoCard,
};

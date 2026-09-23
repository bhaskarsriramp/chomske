/**
 * demoService.js: the demo studio's shared vocabulary.
 *
 * Limits, what a capture may be, where a demo's files live, what analysing and
 * exporting cost, and what the browser is told about a demo. Used by the routes
 * and by the job runner, which have to agree on all of it.
 */
import { readUrl, KEY_ROOT } from "../media/storage.js";
import { publishUserEvent } from "../newsEvents.js";
import { layout, drewCounts } from "./timeline.js";
import { RENDER_ENGINE } from "./exportOptions.js";

const MB = 1024 * 1024;
const int = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export const STUDIO_LIMITS = {
  maxUploadBytes: int(process.env.STUDIO_MAX_UPLOAD_MB, 4096) * MB,
  /**
   * The longest recording this product will accept.
   *
   * Thirty minutes is well past any demo worth publishing, and it is also what
   * bounds one analysis: the vision pass reads a frame every couple of seconds,
   * so the length of the recording IS the size of the bill.
   */
  maxRecordingSeconds: int(process.env.STUDIO_MAX_RECORDING_SECONDS, 1800),
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
 * ── WHERE THE MONEY GOES ─────────────────────────────────────────────────────
 * Analysing is the expensive half and it is nearly all Gemini: a frame every
 * two seconds through the UI analyser, every frame again through the blur
 * detector, plus the text passes. A ten minute demo is roughly 600 frame reads.
 * Exporting is server time: three ffmpeg passes and a canvas layer.
 *
 * Recording, uploading, previewing and editing are free. Those are what a
 * creator spends their time doing, and a meter running while somebody drags a
 * zoom handle is a meter that makes them stop editing.
 */
export const STUDIO_ANALYSE_CREDITS_PER_MIN = int(process.env.STUDIO_ANALYSE_CREDITS_PER_MIN, 12);
export const STUDIO_EXPORT_CREDITS_PER_MIN = int(process.env.STUDIO_EXPORT_CREDITS_PER_MIN, 8);
/** The quality review is one text call over the edit, not another look at it. */
export const STUDIO_REVIEW_CREDITS = int(process.env.STUDIO_REVIEW_CREDITS, 3);

/**
 * @param {"analyse"|"export"} kind
 * @param {number} seconds  recording length for analyse, output length for export
 */
export function studioCost(kind, seconds) {
  const perMin = kind === "export" ? STUDIO_EXPORT_CREDITS_PER_MIN : STUDIO_ANALYSE_CREDITS_PER_MIN;
  return perMin * Math.max(1, Math.ceil((Number(seconds) || 0) / 60));
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
   half its lifetime. Same cache as the script editor's, separate instance. */
const urlCache = new Map();
async function stableUrl(key, opts) {
  if (!key) return "";
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

    recording: {
      status: r.status || "uploading",
      duration: r.duration || 0,
      width: r.width || 0,
      height: r.height || 0,
      fps: r.fps || 0,
      size: r.size || 0,
      has_audio: !!r.has_audio,
      error: r.error || "",
      // The editor plays the 540p copy, never the original: a 4K screen
      // recording is not something a scrubbing preview can seek in.
      proxy_url: await stableUrl(r.proxy_key, { baseUrl }),
      thumb_url: await stableUrl(r.thumb_key, { baseUrl }),
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
        url: x.status === "done" ? await stableUrl(x.output_key, { baseUrl }) : "",
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
    title: d.title || "Untitled recording",
    status: d.status,
    progress: d.progress || 0,
    purged: !!d.purged,
    duration: d.recording?.duration || 0,
    output_duration: lay ? Math.round(lay.duration * 100) / 100 : 0,
    width: d.recording?.width || 0,
    height: d.recording?.height || 0,
    renders: (d.renders || []).filter((r) => r.status === "done").length,
    summary: d.analysis?.summary || "",
    thumb_url: await stableUrl(d.recording?.thumb_key, { baseUrl }),
    created_at: d.created_at,
    updated_at: d.updated_at,
    expires_at: d.expires_at || null,
  };
}

export default {
  STUDIO_LIMITS, LEDGER_REASON, ACCEPT_MIME, acceptable,
  demoPrefix, demoKey, bumpExpiry,
  STUDIO_ANALYSE_CREDITS_PER_MIN, STUDIO_EXPORT_CREDITS_PER_MIN, STUDIO_REVIEW_CREDITS, studioCost,
  publishProgress, shapeDemo, shapeDemoCard,
};

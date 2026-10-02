/**
 * launchRunner.js: generated product demos (models/LaunchVideo.js), made by
 * the launch/ pipeline in the worker process.
 *
 * ── THE PIPELINE LIVES IN ITS OWN FOLDER ─────────────────────────────────────
 * launch/ has its own package.json (Remotion, a headless Chrome, Playwright),
 * so the backend's dependencies are untouched by it. It is imported on first
 * use, never at boot: a worker on a machine where `npm install` has not been
 * run in launch/ starts normally, says so once, and leaves launch jobs alone,
 * and the API refuses new ones for the same reason (launchAvailable()).
 *
 * ── HOW A JOB RUNS ───────────────────────────────────────────────────────────
 * Same design as studioRunner.js: claimed with an atomic findOneAndUpdate,
 * held on a lease the worker keeps extending, picked up again by anyone once
 * the lease lapses. One at a time per worker by default: a render is a
 * headless browser per frame in flight, and the machine also runs exports.
 *
 * ── WHAT IS KEPT ─────────────────────────────────────────────────────────────
 *   <prefix>/v<N>.mp4      every version, for the player and the download
 *   <prefix>/thumb.jpg     the site's first screenshot, for the library card
 *   <prefix>/work/…        the job folder: screenshots, drafts, boards, voice
 *                          takes and music, so the next refinement can run on
 *                          any worker and reuse everything that did not change
 * The local copy is removed after each job; a refinement fetches it back.
 */
import os from "os";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import LaunchVideo from "../../models/LaunchVideo.js";
import TinyfishAPIs from "../../models/TinyfishAPIs.js";
import { putFile, materialize, removePrefix, KEY_ROOT } from "../media/storage.js";
import { jobDir, scratchRoot } from "../media/scratch.js";

const WORKER = `${os.hostname()}:${process.pid}`;
const LEASE_MS = 120_000;
const TICK_MS = 4000;
/** Claims of one request before it is given up. A failure with a reason for the creator is final at once. */
const MAX_ATTEMPTS = 2;
const int = (v, d) => (parseInt(v, 10) > 0 ? parseInt(v, 10) : d);
const CONCURRENCY = int(process.env.LAUNCH_CONCURRENCY, 1);
/**
 * The longest one job may run. A first cut is ~5 minutes on a quiet machine;
 * past this something is stuck (a browser tab that never answers), and
 * without a limit the heartbeat would keep the lease, and the video
 * "running", for ever. The render is cancelled, not just abandoned.
 */
const JOB_TIMEOUT_MS = int(process.env.LAUNCH_JOB_TIMEOUT_MS, 30 * 60 * 1000);

export const LAUNCH_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../launch");
export const launchPrefix = (doc) => `${KEY_ROOT}/launch/${doc.user}/${doc._id}`;

/** Whether this machine can make launch videos: the pipeline's own dependencies are installed, and it is not switched off. */
export function launchAvailable() {
  if (String(process.env.LAUNCH_ENABLED || "1") === "0") return false;
  return fs.existsSync(path.join(LAUNCH_DIR, "api.mjs")) && fs.existsSync(path.join(LAUNCH_DIR, "node_modules", "remotion"));
}

let api = null;
const loadApi = async () => (api ||= await import(pathToFileURL(path.join(LAUNCH_DIR, "api.mjs")).href));

/**
 * Every usable TinyFish key: the environment's (comma-separated), then the
 * active rows of the pool (models/TinyfishAPIs.js). The pipeline takes them in
 * turn and moves to the next on a refusal, so more keys means more headroom.
 */
async function tinyfishKeys() {
  const env = String(process.env.TINYFISH_API_KEY || "").split(",").map((k) => k.trim()).filter(Boolean);
  const rows = await TinyfishAPIs.find({ active: { $ne: false }, status: { $ne: "invalid" } }).select("tiny_api_key").lean().catch(() => []);
  return [...new Set([...env, ...rows.map((r) => r.tiny_api_key).filter(Boolean)])];
}

async function fetchTo(key, dest) {
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const got = await materialize(key, path.dirname(dest), path.basename(dest));
  if (path.resolve(got) !== path.resolve(dest)) await fsp.copyFile(got, dest);
}

const MIME = { ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp", ".wav": "audio/wav", ".mp3": "audio/mpeg" };
const mimeOf = (f) => MIME[path.extname(f).toLowerCase()] || "application/octet-stream";

/** The job folder back from storage, for a refinement on a worker that does not have it. */
async function syncDown(doc, dir) {
  await fsp.rm(dir, { recursive: true, force: true });
  await fsp.mkdir(dir, { recursive: true });
  for (const rel of doc.work_files || []) await fetchTo(`${doc.work_key}/${rel}`, path.join(dir, rel));
}

/** The job folder into storage: every JSON (they change), and any other file not stored yet. */
async function syncUp(doc, dir, files) {
  const had = new Set(doc.work_files || []);
  const workKey = `${launchPrefix(doc)}/work`;
  for (const rel of files) {
    if (had.has(rel) && !rel.endsWith(".json")) continue;
    await putFile(path.join(dir, rel), `${workKey}/${rel}`, mimeOf(rel));
  }
  return workKey;
}

const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

function replyFor(kind, r) {
  const secs = Math.round(r.seconds);
  const noVoice = r.voiced ? "" : " The voiceover couldn't be recorded right now, so this version has music only. Ask again later to add the voice.";
  if (kind === "create") return `Your first cut is ready: ${secs} seconds, ${plural(r.scenes, "scene")}.${noVoice} Tell me anything you'd like changed.`;
  // The editor's own words about what it understood and did (launch/api.mjs refineVideo), then the version.
  const said = String(r.reply || "").trim();
  return `${said ? `${said} ` : ""}Version ${r.version} is ready (${secs} seconds).${noVoice}`;
}

/** One job, start to finish. Exported for the end-to-end test (scripts/launchTest.mjs). */
export async function runLaunchJob(doc) {
  const kind = doc.pending?.kind === "refine" ? "refine" : "create";
  const dir = await jobDir("lipi-launch", doc._id);
  const outDir = path.join(scratchRoot(), "lipi-launch-out");
  await fsp.mkdir(outDir, { recursive: true });
  const nextV = (doc.versions?.length || 0) + 1;
  const out = path.join(outDir, `${doc._id}-v${nextV}.mp4`);
  const log = (m) => console.log(`[launch] ${doc.slug} ${m}`);

  // Ours only while we hold it: a write after the lease was taken over is dropped.
  const mine = { _id: doc._id, worker: WORKER, status: "running" };
  const beat = setInterval(() => {
    LaunchVideo.updateOne(mine, { $set: { lease_until: new Date(Date.now() + LEASE_MS) } }).catch(() => {});
  }, LEASE_MS / 3);
  let last = 0;
  const onProgress = (f, stage) => {
    const now = Date.now();
    if (now - last < 1500) return;
    last = now;
    LaunchVideo.updateOne(mine, { $set: { progress: Math.round(f * 100) / 100, stage: stage || "", updated_at: new Date() } }).catch(() => {});
  };

  const stop = new AbortController();
  const limit = setTimeout(() => stop.abort(), JOB_TIMEOUT_MS);
  try {
    const pipeline = await loadApi();
    pipeline.setKeys({ tinyfish: await tinyfishKeys() });
    let result;
    if (kind === "create") {
      await fsp.rm(dir, { recursive: true, force: true });
      result = await pipeline.createVideo({ url: doc.url, dir, out, notes: doc.notes || "", signal: stop.signal, onProgress, log });
    } else {
      await syncDown(doc, dir);
      result = await pipeline.refineVideo({ dir, request: doc.pending.text, out, signal: stop.signal, onProgress, log });
    }
    onProgress(0.995, "Saving");
    const prefix = launchPrefix(doc);
    const key = `${prefix}/v${result.version}.mp4`;
    await putFile(out, key, "video/mp4");
    // The poster of this version (a frame of the video), else the site's first screenshot.
    let thumbKey = doc.thumb_key;
    const shot = path.join(dir, "shots", "s1.jpg");
    if (result.poster) {
      thumbKey = `${prefix}/poster-v${result.version}.jpg`;
      await putFile(result.poster, thumbKey, "image/jpeg");
    } else if (!thumbKey && fs.existsSync(shot)) {
      thumbKey = `${prefix}/thumb.jpg`;
      await putFile(shot, thumbKey, "image/jpeg");
    }
    const files = await pipeline.filesOf(dir);
    const workKey = await syncUp(doc, dir, files);

    await LaunchVideo.updateOne(mine, {
      $set: {
        status: "done", stage: "", progress: 1, error: "", lease_until: null, attempts: 0,
        pending: { kind: "", text: "", at: null },
        thumb_key: thumbKey, work_key: workKey, work_files: files,
        ...(kind === "create" && result.title ? { title: String(result.title).slice(0, 80) } : {}),
        updated_at: new Date(),
      },
      $push: {
        versions: { v: result.version, key, seconds: Math.round(result.seconds * 10) / 10, scenes: result.scenes, voiced: result.voiced, request: kind === "refine" ? doc.pending.text : "" },
        chat: { role: "assistant", text: replyFor(kind, result), v: result.version },
      },
    });
    log(`v${result.version} done, ${result.seconds.toFixed(1)}s`);
  } catch (err) {
    console.error(`[launch] ${doc.slug} ${kind} failed (attempt ${doc.attempts}):`, err.message);
    const final = !!err.userMessage || doc.attempts >= MAX_ATTEMPTS;
    if (!final) {
      await LaunchVideo.updateOne(mine, { $set: { status: "queued", lease_until: null, stage: "Trying again", updated_at: new Date() } }).catch(() => {});
    } else {
      const message = err.userMessage || "Something went wrong making this video. Please try again.";
      const fresh = await LaunchVideo.findById(doc._id).lean();
      const chat = (fresh?.chat || []).slice();
      for (let i = chat.length - 1; i >= 0; i--) {
        if (chat[i].role === "user") {
          chat[i] = { ...chat[i], failed: true };
          break;
        }
      }
      chat.push({ role: "assistant", text: message, failed: true, at: new Date() });
      // A failed refinement leaves the video as it was; only a first cut that never arrived is a failed video.
      const hasVideo = (fresh?.versions || []).length > 0;
      await LaunchVideo.updateOne(mine, {
        $set: { status: hasVideo ? "done" : "failed", error: message, stage: "", progress: 0, lease_until: null, attempts: 0, chat, pending: { kind: "", text: "", at: null }, updated_at: new Date() },
      }).catch(() => {});
    }
  } finally {
    clearTimeout(limit);
    clearInterval(beat);
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
    await fsp.rm(out, { force: true }).catch(() => {});
  }
}

let running = 0;
async function tick() {
  while (running < CONCURRENCY) {
    const now = new Date();
    const doc = await LaunchVideo.findOneAndUpdate(
      { $or: [{ status: "queued" }, { status: "running", lease_until: { $lt: now } }] },
      { $set: { status: "running", lease_until: new Date(now.getTime() + LEASE_MS), worker: WORKER, updated_at: now }, $inc: { attempts: 1 } },
      { sort: { updated_at: 1 }, new: true }
    ).lean();
    if (!doc) return;
    running++;
    runLaunchJob(doc).finally(() => {
      running--;
    });
  }
}

/** Delete a video's files (every version and its working folder). */
export const removeLaunchFiles = (doc) => removePrefix(`${launchPrefix(doc)}/`);

let timer = null;
export function startLaunchRunner() {
  if (timer) return;
  if (!launchAvailable()) {
    console.warn(`[launch] generated demos are OFF on this machine: run \`npm install\` in ${LAUNCH_DIR} (or LAUNCH_ENABLED=0 is set)`);
    return;
  }
  timer = setInterval(() => tick().catch((err) => console.error("[launch] tick:", err.message)), TICK_MS);
  console.log(`[launch] generated demos running (${CONCURRENCY} at a time)`);
}

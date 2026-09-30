/**
 * browserAnalysis.js: the first analysis, run in the creator's browser.
 *
 * ── WHAT MOVES AND WHAT DOES NOT ─────────────────────────────────────────────
 * Following the pointer (locate.js), reading its presses (events.js) and
 * planning the camera are arithmetic on decoded frames, and cost the server
 * about three CPU-minutes for a one-minute demo. The same code, unmodified,
 * runs in a Web Worker (browser-analysis/), and was measured to produce the
 * server's result byte for byte on every labelled recording — provided three
 * things come from the server, which is what this file is for:
 *
 *   the screen reading   sync.js readScreen shrinks frames with ffmpeg's
 *                        scaler, which no browser reproduces. Made in the
 *                        prepare job, stored, handed over (exactJson.js).
 *   the model's answers  the two-pointer check, the stranger check and the
 *                        press judge need the recording's frames and Gemini;
 *                        the browser asks, this server answers from its own
 *                        copy exactly as the server analysis would, and
 *                        every answer is logged for the re-check.
 *   the templates        the pointer templates as the server's canvas draws
 *                        them, built once into static files (the build).
 *
 * Everything else — prepare, blur tracking, captions, voice, the vision pass,
 * review, export — stays on the server exactly as it was.
 *
 * ── MODES (STUDIO_BROWSER_ANALYSIS) ──────────────────────────────────────────
 *   off     (default) nothing changes anywhere
 *   shadow  the server analyses as always and its result is what the creator
 *           gets; the browser analyses too and the two are compared. Proof on
 *           real recordings at no risk.
 *   on      the browser's result is used. The server's job waits, held, while
 *           the browser sends heartbeats; if the tab closes, fails or gives
 *           up, the hold lapses and the server runs the job it always would.
 *           A sample of accepted results is re-run on the server and compared
 *           (the "recheck" job), replaying the logged answers.
 *
 * ── WHEN THE BROWSER BUNDLE IS NOT THIS SERVER'S CODE ────────────────────────
 * The build writes a manifest naming every server file it bundled and a hash
 * of their contents. At boot this server hashes its own copies; if they
 * differ — the analysis changed and the bundle was not rebuilt, or the files
 * were deployed differently — browser analysis is switched off with a log
 * line, and everything runs on the server as before.
 */
import fs from "fs";
import fsp from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { FFMPEG_PATH } from "../media/ffmpeg.js";
import { materialize, putFile, relayUrl } from "../media/storage.js";
import { exactStringify, exactParse, exactDiff } from "./exactJson.js";
import { readScreen } from "./sync.js";
import { identifyPointer, judgeRuns, newSpend } from "./vision.js";
import { judgePresses, PRESS_JUDGE_MODE } from "./judge.js";
import { providerReady } from "../ai/provider.js";
import { VISION_ON_ANALYSE } from "./analyse.js";
import { demoKey } from "./demoService.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");

const pick = (v, list, d) => (list.includes(String(v || "").trim().toLowerCase()) ? String(v).trim().toLowerCase() : d);
const num = (v, d) => (Number.isFinite(Number(v)) && String(v).trim() !== "" ? Number(v) : d);

export const BROWSER_MODE = pick(process.env.STUDIO_BROWSER_ANALYSIS, ["off", "shadow", "on"], "off");
/** Share of accepted browser results the server re-runs and compares. */
export const RECHECK_RATE = Math.min(1, Math.max(0, num(process.env.STUDIO_BROWSER_RECHECK, 0.2)));
/** How long the server waits after the browser's last heartbeat before taking over. */
export const HOLD_MS = Math.max(15, num(process.env.STUDIO_BROWSER_HOLD_S, 45)) * 1000;
/** The first wait: the browser has the recording to download before it can report. */
export const FIRST_HOLD_MS = Math.max(HOLD_MS, num(process.env.STUDIO_BROWSER_FIRST_HOLD_S, 120) * 1000);
/** Longest recording the browser is given (memory: it holds the whole file). */
export const MAX_SECONDS = num(process.env.STUDIO_BROWSER_MAX_SECONDS, 600);
/** The fields of an analysis result compared between two runs. `spend` is not: replayed answers cost nothing. */
const COMPARED = (r) => { const { spend, ...rest } = r || {}; return rest; };

/* ────────────────────────────────────────────────────────────────────────────
   Is the bundle this server's code?
   ──────────────────────────────────────────────────────────────────────────── */

function manifestPath() {
  const set = String(process.env.STUDIO_BROWSER_MANIFEST || "").trim();
  if (set) return set;
  // What nginx serves (build/) if it exists, else the source (public/).
  for (const p of [path.join(REPO, "build/studio/analysis/manifest.json"), path.join(REPO, "public/studio/analysis/manifest.json")]) {
    if (fs.existsSync(p)) return p;
  }
  return "";
}

/**
 * The same fingerprint browser-analysis/build.mjs computes: every file of ours
 * in the bundle (the analysis modules and the browser shims — so the
 * browser-analysis/ folder must be deployed with the backend), the server's
 * canvas library version, and the bundled mediabunny version.
 */
export function fingerprint(files, canvasVersion, mediabunnyVersion) {
  const h = crypto.createHash("sha256");
  for (const rel of files) {
    h.update(rel + "\0");
    h.update(sourceOf(rel));
    h.update("\0");
  }
  h.update(`canvas:${canvasVersion}|mediabunny:${mediabunnyVersion}`);
  return h.digest("hex");
}

/**
 * A file's contents with Windows line endings made Unix ones, as the build
 * reads it: the development machine has CRLF files that git delivers to the
 * server as LF, and a line ending cannot change what JavaScript does.
 */
function sourceOf(rel) {
  return fs.readFileSync(path.join(REPO, rel), "utf8").replace(/\r\n/g, "\n");
}

/** Which of the manifest's files (or versions) this server's copy differs in. */
function whatDiffers(m) {
  const out = [];
  for (const rel of m.files || []) {
    const want = m.file_hashes?.[rel];
    if (!want) continue;
    let have = "missing";
    try { have = crypto.createHash("sha256").update(sourceOf(rel)).digest("hex"); } catch { /* missing */ }
    if (have !== want) out.push(rel + (have === "missing" ? " (missing)" : ""));
  }
  if (m.canvas_version && m.canvas_version !== canvasVersion()) out.push(`@napi-rs/canvas ${canvasVersion()} here, ${m.canvas_version} in the build`);
  return out;
}

function canvasVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(REPO, "backend/node_modules/@napi-rs/canvas/package.json"), "utf8")).version;
  } catch {
    return "unknown";
  }
}

/** This ffmpeg's yuv420p (tv) → gray table, which the browser's frame reader copies. */
function grayLut() {
  return new Promise((resolve, reject) => {
    const W = 256, H = 16;
    const yuv = Buffer.alloc(W * H * 1.5);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) yuv[r * W + c] = c;
    yuv.fill(128, W * H);
    const c = spawn(FFMPEG_PATH, ["-v", "error", "-f", "rawvideo", "-pix_fmt", "yuv420p", "-s", `${W}x${H}`, "-color_range", "tv", "-i", "pipe:0",
      "-vf", `fps=30,scale=${W}:${H}:flags=bilinear`, "-pix_fmt", "gray", "-f", "rawvideo", "pipe:1"], { windowsHide: true });
    const out = [];
    c.stdout.on("data", (d) => out.push(d));
    c.on("error", reject);
    c.on("close", (code) => (code === 0 ? resolve(Array.from(Buffer.concat(out).subarray(0, W))) : reject(new Error("ffmpeg exited " + code))));
    c.stdin.end(yuv);
  });
}

let statusPromise = null;
/**
 * { mode, ok, version, worker, templates, envKeys, reason } — `mode` is what
 * this server will actually do: "off" whenever `ok` is false.
 */
export function browserStatus() {
  if (!statusPromise) {
    statusPromise = (async () => {
      const off = (reason) => {
        if (BROWSER_MODE !== "off") console.warn(`[studio] browser analysis is OFF: ${reason}`);
        return { mode: "off", ok: false, reason };
      };
      if (BROWSER_MODE === "off") return { mode: "off", ok: false, reason: "STUDIO_BROWSER_ANALYSIS is off" };
      const file = manifestPath();
      if (!file) return off("no browser analysis build (public/studio/analysis/manifest.json)");
      let m;
      try { m = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return off("the manifest could not be read: " + e.message); }
      let version;
      try { version = fingerprint(m.files || [], canvasVersion(), m.mediabunny || ""); } catch (e) { return off("a bundled file is missing on this server: " + e.message); }
      if (version !== m.version) {
        const which = whatDiffers(m);
        return off(
          "the browser bundle was built from different analysis code than this server has" +
            (which.length ? ` — differs in: ${which.slice(0, 5).join(", ")}${which.length > 5 ? ` and ${which.length - 5} more` : ""}` : "") +
            ". Deploy the same files the bundle was built from, or rebuild it (browser-analysis/build.mjs)"
        );
      }
      const lut = await grayLut().catch((e) => null);
      if (!lut || lut.join(",") !== (m.gray_lut || []).join(",")) return off("this server's ffmpeg converts to grey differently from the one the bundle was built against");
      if (VISION_ON_ANALYSE) return off("STUDIO_VISION_ON_ANALYSE is on; the vision pass needs the server");
      console.log(`[studio] browser analysis ${BROWSER_MODE.toUpperCase()}, bundle ${version.slice(0, 12)}, re-check ${Math.round(RECHECK_RATE * 100)}%`);
      return { mode: BROWSER_MODE, ok: true, version, worker: m.worker, templates: m.templates, envKeys: m.env_keys || [] };
    })();
  }
  return statusPromise;
}

/* ────────────────────────────────────────────────────────────────────────────
   Who gets it
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Whether this analysis may run in the creator's browser. Anything the
 * browser path does not reproduce exactly — captions, which are written
 * inside the analysis from the audio — keeps the analysis on the server.
 */
export async function browserPlan(demo, { client = null, wantCaptions = false } = {}) {
  const s = await browserStatus();
  if (s.mode === "off") return null;
  if (!client || client.version !== s.version) return null;
  if (wantCaptions) return null;
  const r = demo.recording || {};
  if (!r.mp4_key || !(r.duration > 0) || r.duration > MAX_SECONDS) return null;
  const motion = Array.isArray(demo.capture?.motion) ? demo.capture.motion : [];
  // With motion to align, the analysis needs the screen reading.
  if (motion.length && !r.screen_key) return null;
  return { mode: s.mode, session: crypto.randomBytes(12).toString("hex"), version: s.version };
}

/** What the browser needs to run the analysis the server would have run. */
export async function sessionPayload(demo, plan, { baseUrl = "" } = {}) {
  const s = await browserStatus();
  const r = demo.recording;
  const env = {};
  for (const k of s.envKeys) if (process.env[k] != null) env[k] = String(process.env[k]);
  return {
    session: plan.session,
    mode: plan.mode,
    version: s.version,
    worker: s.worker,
    templates: s.templates,
    video: relayUrl(r.mp4_key, { baseUrl, contentType: "video/mp4" }),
    screen: r.screen_key ? relayUrl(r.screen_key, { baseUrl, contentType: "application/json" }) : null,
    // Exactly what the server's analyse job passes (studioRunner.js).
    capture: { track: demo.capture?.track || [], motion: demo.capture?.motion || [] },
    source: { width: r.width, height: r.height, fps: r.fps || 30 },
    duration: r.duration,
    env,
    provider_ready: providerReady(),
    heartbeat_s: Math.round(Math.min(10, HOLD_MS / 4000)),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   Files: the screen reading and the raw results
   ──────────────────────────────────────────────────────────────────────────── */

async function putText(text, key, type) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "lipi-ba-"));
  const file = path.join(dir, "data");
  try {
    await fsp.writeFile(file, text, "utf8");
    await putFile(file, key, type);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function readText(key) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "lipi-ba-"));
  try {
    return await fsp.readFile(await materialize(key, dir, "data"), "utf8");
  } finally {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * The screen reading, made in the prepare job from the file it has just
 * written, stored for the browser. Returns its key, or "" when it could not
 * be made (the browser path is then simply not offered).
 */
export async function storeScreen(demo, video, { duration, width, height }) {
  if (BROWSER_MODE === "off") return "";
  try {
    const screen = await readScreen(video, { duration, sourceWidth: width, sourceHeight: height });
    const key = demoKey(demo, "analysis", "screen.json");
    await putText(exactStringify(screen), key, "application/json");
    return key;
  } catch (err) {
    console.error("[studio] browser analysis: the screen reading could not be stored:", err.message);
    return "";
  }
}

export const resultKey = (demo, session, who) => demoKey(demo, "analysis", `${who}-${session}.json`);
export const storeResult = (demo, session, who, text) => putText(text, resultKey(demo, session, who), "application/json");

/* ────────────────────────────────────────────────────────────────────────────
   The model's questions, answered from the server's copy
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Answer one question the browser's analysis would have asked the model.
 * `q` is exactJson; so is the answer. Returns { a, usd, calls } or
 * { error } — an error is the one the server analysis would have met too.
 */
export async function answer(demo, kind, qText) {
  const q = exactParse(qText);
  const r = demo.recording;
  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), "lipi-ask-"));
  const spend = newSpend();
  try {
    const video = await materialize(r.mp4_key, workDir, "recording.mp4");
    let a;
    if (kind === "identify") {
      a = await identifyPointer({ video, dir: path.join(workDir, "identity"), rivals: q, spend });
    } else if (kind === "judgeRuns") {
      a = await judgeRuns({ video, dir: path.join(workDir, "runs"), reference: q.reference, runs: q.runs, heightPx: q.heightPx, spend });
    } else if (kind === "judgePresses") {
      const screen = r.screen_key ? exactParse(await readText(r.screen_key)) : null;
      a = await judgePresses(q.events, {
        video, workDir, located: q.located, flashes: q.flashes, screen, W: q.W, H: q.H, duration: q.duration, spend, mode: PRESS_JUDGE_MODE,
      });
    } else {
      return { error: "unknown question " + kind };
    }
    return { a: exactStringify(a), usd: spend.usd, calls: spend.calls };
  } catch (err) {
    return { error: String(err?.message || err), usd: spend.usd, calls: spend.calls };
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * The logged answers, as the `asks` analyseRecording replays (see analyse.js).
 * A question the log does not have is a difference in itself: the re-check
 * asked something the browser run did not.
 */
export function replayAsks(log = []) {
  const found = new Map(log.map((x) => [x.kind + "\n" + x.q, x]));
  const get = (kind, q) => {
    const hit = found.get(kind + "\n" + exactStringify(q));
    if (!hit) throw Object.assign(new Error(`the re-check asked a ${kind} question the browser run did not`), { unasked: true });
    if (hit.error) throw new Error(hit.error);
    return exactParse(hit.a);
  };
  return {
    identify: async (rivals) => get("identify", rivals),
    judgeRuns: async ({ reference, runs, heightPx }) => get("judgeRuns", { reference, runs, heightPx }),
    judgePresses: async (events, o) => get("judgePresses", { events, located: o.located, flashes: o.flashes, W: o.W, H: o.H, duration: o.duration }),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   The result: checked, and compared
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The browser's result, parsed and checked for shape. Throws a readable
 * reason when it is not an analysis result.
 */
export function parseResult(text) {
  if (typeof text !== "string" || text.length < 10 || text.length > 60 * 1024 * 1024) throw new Error("the result is missing or too large");
  const r = exactParse(text);
  if (!r || typeof r !== "object") throw new Error("the result is not an object");
  if (!r.timeline || typeof r.timeline !== "object") throw new Error("the result has no timeline");
  for (const k of ["track", "events", "zooms", "cuts", "blurs", "cues"]) {
    if (r.timeline[k] != null && !Array.isArray(r.timeline[k])) throw new Error(`the result's timeline.${k} is not a list`);
  }
  return r;
}

/** { identical, count, diffs } between two raw results. */
export function compareResults(a, b) {
  const diffs = exactDiff(COMPARED(a), COMPARED(b), { limit: 25 });
  return { identical: diffs.length === 0, count: diffs.length, diffs: diffs.slice(0, 10) };
}

export default {
  BROWSER_MODE, RECHECK_RATE, HOLD_MS, FIRST_HOLD_MS, browserStatus, browserPlan, sessionPayload, storeScreen,
  resultKey, storeResult, readText, answer, replayAsks, parseResult, compareResults, fingerprint,
};

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
 *   the model's answers  the two-pointer check, the stranger check, the
 *                        press judge and — with STUDIO_VISION_ON_ANALYSE on —
 *                        the vision pass (every sampled still read, what the
 *                        pointer rested on, the steps, the narration) need
 *                        the recording and Gemini; the browser asks, this
 *                        server answers from its own copy exactly as the
 *                        server analysis would, and every answer is logged
 *                        for the re-check.
 *   the templates        the pointer templates as the server's canvas draws
 *                        them, built once into static files (the build).
 *
 * Everything else — prepare, blur finding and tracking, captions, voice, the
 * on-demand vision pass, review, export — stays on the server exactly as it
 * was.
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
import { FFMPEG_PATH, extractFrames } from "../media/ffmpeg.js";
import { materialize, putFile, relayUrl } from "../media/storage.js";
import { exactStringify, exactParse, exactDiff } from "./exactJson.js";
import { readScreen } from "./sync.js";
import { identifyPointer, judgeRuns, newSpend, readFrames, pointerTargets, detectSteps, writeNarration } from "./vision.js";
import { judgePresses, PRESS_JUDGE_MODE } from "./judge.js";
import { providerReady } from "../ai/provider.js";
import { VISION_ON_ANALYSE, BLUR_ON } from "./analyse.js";
import { demoKey, STUDIO_LIMITS } from "./demoService.js";

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
/**
 * The longest a browser run may hold the server's job. With the vision pass
 * on, a run also waits on the model reading every still, as the server's own
 * analysis does, so it is allowed longer.
 */
export const MAX_RUN_MS = Math.max(120, num(process.env.STUDIO_BROWSER_MAX_RUN_S, VISION_ON_ANALYSE ? 900 : 420)) * 1000;
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
      // The blur pass inside the first analysis (vision and blur both on) is
      // not one of the questions a browser run can ask.
      if (VISION_ON_ANALYSE && BLUR_ON) return off("STUDIO_BLUR is on with STUDIO_VISION_ON_ANALYSE; the blur pass runs on the server only");
      console.log(
        `[studio] browser analysis ${BROWSER_MODE.toUpperCase()}, bundle ${version.slice(0, 12)}, re-check ${Math.round(RECHECK_RATE * 100)}%` +
          (VISION_ON_ANALYSE ? ", vision pass answered here" : "")
      );
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

/** Every question a browser run may ask. */
export const ASK_KINDS = ["identify", "judgeRuns", "judgePresses", "readFrames", "pointerTargets", "detectSteps", "writeNarration"];
/**
 * The vision pass's questions: asked only with STUDIO_VISION_ON_ANALYSE on,
 * and each at most once a run, as the analysis asks them. Reading every still
 * is most of what an analysis costs, so the cap is what keeps a page from
 * asking for it twice.
 */
export const VISION_KINDS = new Set(["readFrames", "pointerTargets", "detectSteps", "writeNarration"]);

const refusal = (reason) => Object.assign(new Error(reason), { refused: true });

/** A promise-making function, run once; a failure is not kept, so the next caller tries again. */
function once(make) {
  let p = null;
  return () => (p ||= make().catch((err) => { p = null; throw err; }));
}

/** At most EXTRACTING cuts of stills at once in this process: they are ffmpeg decoding a whole recording. */
const EXTRACTING = Math.max(1, num(process.env.STUDIO_BROWSER_EXTRACT_CONCURRENCY, 2));
let extracting = 0;
const extractQueue = [];
async function extractSlot(fn) {
  if (extracting >= EXTRACTING) await new Promise((r) => extractQueue.push(r));
  extracting++;
  try {
    return await fn();
  } finally {
    extracting--;
    extractQueue.shift()?.();
  }
}

/**
 * ── ONE COPY OF THE RECORDING PER RUN ────────────────────────────────────────
 * A run's questions share one folder: the recording, fetched once, and its
 * sampled stills, cut once by the very call the server's analysis makes
 * (extractFrames every STUDIO_FRAME_EVERY seconds, 1280 on the long edge). A
 * failure to get either is a refusal — the server's analysis would have had
 * them — so the run ends and the server does the job.
 *
 * `video` and `screen` load them; the parity harness passes local files.
 */
export function makeWorkspace({ dir, duration, video, screen = async () => null }) {
  const every = Math.max(0.5, STUDIO_LIMITS.frameEvery);
  let n = 0;
  const ws = {
    dir,
    users: 0,
    used: Date.now(),
    closing: false,
    video: once(() => video().catch((err) => { throw refusal("the recording could not be read here: " + err.message); })),
    screen: once(() => screen().catch((err) => { throw refusal("the screen reading could not be read here: " + err.message); })),
    frames: once(async () => {
      const file = await ws.video();
      const framesDir = path.join(dir, "frames");
      try {
        await fsp.rm(framesDir, { recursive: true, force: true });
        await fsp.mkdir(framesDir, { recursive: true });
        return await extractSlot(() => extractFrames(file, framesDir, { every, duration, longEdge: 1280 }));
      } catch (err) {
        throw refusal("the stills could not be cut here: " + err.message);
      }
    }),
    /** A fresh folder inside this one, for a function that writes its own files. */
    sub: async (name) => {
      const d = path.join(dir, `${name}-${++n}`);
      await fsp.mkdir(d, { recursive: true });
      return d;
    },
  };
  return ws;
}

/** Dropped this long after a run's last question, if its end was never reported. */
const IDLE_MS = 15 * 60_000;
const spaces = new Map();

function sessionSpace(demo, session) {
  const key = `${demo._id}|${session}`;
  let ws = spaces.get(key);
  if (!ws) {
    const r = demo.recording;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lipi-ask-"));
    ws = makeWorkspace({
      dir,
      duration: r.duration,
      video: () => materialize(r.mp4_key, dir, "recording.mp4"),
      screen: async () => (r.screen_key ? exactParse(await readText(r.screen_key)) : null),
    });
    spaces.set(key, ws);
  }
  ws.used = Date.now();
  return ws;
}

function sweepSpaces() {
  for (const [key, ws] of spaces) {
    if (ws.users > 0 || !(ws.closing || Date.now() - ws.used > IDLE_MS)) continue;
    spaces.delete(key);
    fsp.rm(ws.dir, { recursive: true, force: true }).catch(() => {});
  }
}
setInterval(sweepSpaces, 60_000).unref();

/** The run is over (its result is in, or it gave up): its folder goes once no question is using it. */
export function endSession(demoId, session) {
  const ws = spaces.get(`${demoId}|${session}`);
  if (!ws) return;
  ws.closing = true;
  sweepSpaces();
}

/**
 * Answer one question the way the server's own analysis asks it: the same
 * function, on the same recording, with the same stills. `q` is the parsed
 * question; the answer is the function's value, and an error is the one the
 * function threw. A question whose premise this server does not share — the
 * browser's stills are not the ones cut here — is refused (err.refused).
 */
export async function answerWith(ws, kind, q, { spend = newSpend(), onProgress = () => {} } = {}) {
  switch (kind) {
    case "identify":
      return identifyPointer({ video: await ws.video(), dir: await ws.sub("identity"), rivals: q, spend });
    case "judgeRuns":
      return judgeRuns({ video: await ws.video(), dir: await ws.sub("runs"), reference: q.reference, runs: q.runs, heightPx: q.heightPx, spend });
    case "judgePresses":
      return judgePresses(q.events, {
        video: await ws.video(), workDir: await ws.sub("judge"), located: q.located, flashes: q.flashes, screen: await ws.screen(),
        W: q.W, H: q.H, duration: q.duration, spend, mode: PRESS_JUDGE_MODE,
      });
    case "readFrames": {
      const frames = await ws.frames();
      const here = frames.map((f) => f.t);
      if (exactStringify(here) !== exactStringify(q.t)) {
        throw refusal(`the stills cut here (${here.length}) are not the ones the browser counted (${Array.isArray(q.t) ? q.t.length : "none"})`);
      }
      return readFrames(frames, { spend, onProgress });
    }
    case "pointerTargets":
      return pointerTargets({ video: await ws.video(), dir: await ws.sub("targets"), targets: q.targets, W: q.W, H: q.H, spend });
    case "detectSteps": {
      // The readings name their stills by where they were cut; this run's are
      // the same stills (one extractFrames call, one recording).
      const files = new Map((await ws.frames()).map((f) => [f.t, f.file]));
      const shots = (Array.isArray(q.shots) ? q.shots : []).map((s) => {
        if (!files.has(s?.t)) throw refusal(`no still was cut here at ${s?.t}s`);
        return { ...s, file: files.get(s.t) };
      });
      return detectSteps({ shots, events: q.events, duration: q.duration, spend });
    }
    case "writeNarration":
      return writeNarration({ steps: q.steps, summary: q.summary, product: q.product, duration: q.duration, spend });
    default:
      throw refusal("unknown question " + kind);
  }
}

/**
 * Answer a browser run's question. `qText` is exactJson; so is the answer.
 * Returns { a, usd, calls }, { error, usd, calls } — the error the server's
 * analysis would have met too — or { refused } when it cannot be answered the
 * way the server's analysis would have been.
 */
export async function answer(demo, session, kind, qText, { onProgress } = {}) {
  const ws = sessionSpace(demo, session);
  ws.users++;
  const spend = newSpend();
  try {
    const a = await answerWith(ws, kind, exactParse(qText), { spend, onProgress });
    return { a: exactStringify(a), usd: spend.usd, calls: spend.calls };
  } catch (err) {
    if (err?.refused) return { refused: err.message, usd: spend.usd, calls: spend.calls };
    return { error: String(err?.message || err), usd: spend.usd, calls: spend.calls };
  } finally {
    ws.users--;
    ws.used = Date.now();
  }
}

/**
 * ── A QUESTION OUTLIVES THE REQUEST THAT ASKED IT ────────────────────────────
 * Reading every still takes minutes, and the proxy in front of the API closes
 * a request after sixty seconds. So a question is started once, keyed by the
 * run and the worker's own number for it, and the page asks after it until it
 * is answered; the answer is kept a couple of minutes after, for a page whose
 * last poll was lost.
 *
 * In this process's memory: a restart loses the question, the page is told
 * so, and the server's own job takes over.
 */
const asking = new Map();
const KEEP_ANSWERED_MS = 120_000;

/** The question `key`, started with `work(entry)` if it is not already going. */
export function startAsk(key, kind, work) {
  let e = asking.get(key);
  if (e) return e;
  e = { kind, progress: 0, done: false, out: null };
  e.promise = (async () => {
    try {
      e.out = await work(e);
    } catch (err) {
      // Not the model's answer (answer() returns those): the log could not be
      // written, or similar. The server's analysis would not have met it.
      e.out = { refused: String(err?.message || err) };
    }
    e.done = true;
    setTimeout(() => asking.delete(key), KEEP_ANSWERED_MS).unref();
    return e.out;
  })();
  asking.set(key, e);
  return e;
}

export const findAsk = (key) => asking.get(key) || null;

/** The kinds of the questions still being answered for keys starting `prefix`. */
export const askingNow = (prefix) => [...asking].filter(([k, e]) => k.startsWith(prefix) && !e.done).map(([, e]) => e.kind);

/** The question's outcome if it is answered within `ms`, else { pending, progress }. */
export async function waitAsk(e, ms) {
  let timer = null;
  await Promise.race([e.promise, new Promise((r) => (timer = setTimeout(r, ms)))]);
  clearTimeout(timer);
  return e.done ? e.out : { pending: true, progress: e.progress };
}

/**
 * ── THE LOG ─────────────────────────────────────────────────────────────────
 * Every answer is kept for the re-check. It lives in the demo's document,
 * which every request of the run reads, and a vision pass's readings run to a
 * megabyte — so a large question and answer are stored as a file and the log
 * names it.
 */
const INLINE_MAX = 32 * 1024;

export async function logEntry(demo, session, id, kind, qText, out) {
  const entry = { kind, id, q: qText, a: out.a ?? null, error: out.error || null, usd: out.usd || 0, calls: out.calls || 0, at: new Date() };
  if (qText.length + (entry.a?.length || 0) > INLINE_MAX) {
    const key = demoKey(demo, "analysis", `ask-${session}-${id}.json`);
    await putText(JSON.stringify({ q: entry.q, a: entry.a }), key, "application/json");
    entry.q = null;
    entry.a = null;
    entry.key = key;
  }
  return entry;
}

/** The log with every stored question and answer read back in. */
export async function loadAsks(log = []) {
  return Promise.all(
    (log || []).map(async (x) => {
      if (!x?.key) return x;
      const { q, a } = JSON.parse(await readText(x.key));
      return { ...x, q, a };
    })
  );
}

/**
 * The logged answers (read in: loadAsks), as the `asks` analyseRecording
 * replays (see analyse.js). Each question is built here exactly as the
 * browser's shims build it. A question the log does not have is a difference
 * in itself: the re-check asked something the browser run did not.
 */
export function replayAsks(log = []) {
  /**
   * A question as its key in the log. The ids timeline.js mints ("ev_3fbe9ee506")
   * are random per run, so the re-check's presses carry different ones from the
   * browser's; like exactDiff, the key does not count them as a difference.
   */
  const keyOf = (kind, qText) => kind + "\n" + String(qText).replace(/"[a-z]+_[0-9a-f]{10}"/g, '"#id"');
  const found = new Map(log.map((x) => [keyOf(x.kind, x.q), x]));
  const get = (kind, q) => {
    const hit = found.get(keyOf(kind, exactStringify(q)));
    if (!hit) throw Object.assign(new Error(`the re-check asked a ${kind} question the browser run did not`), { unasked: true });
    if (hit.error) throw new Error(hit.error);
    return exactParse(hit.a);
  };
  return {
    identify: async (rivals) => get("identify", rivals),
    judgeRuns: async ({ reference, runs, heightPx }) => get("judgeRuns", { reference, runs, heightPx }),
    judgePresses: async (events, o) => get("judgePresses", { events, located: o.located, flashes: o.flashes, W: o.W, H: o.H, duration: o.duration }),
    readFrames: async (frames) => get("readFrames", { t: frames.map((f) => f.t) }),
    pointerTargets: async ({ targets, W, H }) => get("pointerTargets", { targets, W, H }),
    detectSteps: async ({ shots, events, duration }) => get("detectSteps", { shots, events, duration }),
    writeNarration: async ({ steps, summary, product, duration }) => get("writeNarration", { steps, summary, product, duration }),
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
  BROWSER_MODE, RECHECK_RATE, HOLD_MS, FIRST_HOLD_MS, MAX_RUN_MS, ASK_KINDS, VISION_KINDS, browserStatus, browserPlan, sessionPayload, storeScreen,
  resultKey, storeResult, readText, makeWorkspace, endSession, answerWith, answer, startAsk, findAsk, askingNow, waitAsk, logEntry, loadAsks,
  replayAsks, parseResult, compareResults, fingerprint,
};

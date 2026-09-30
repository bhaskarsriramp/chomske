/**
 * cloudRender.js: one export from a request in the bucket, for Cloud Run
 * (renderService.js, the HTTP service; renderJob.js, the batch job).
 *
 * ── THE SAME EXPORT, SOMEWHERE ELSE ──────────────────────────────────────────
 * This is the picture half of the render job in studioRunner.js (render.run):
 * the same renderTimeline, the same ffmpeg, the same fonts. What it leaves
 * behind is everything that is not the picture — the database, the live
 * channel, credits — which stays with the server that asked for it.
 *
 * So it is a function from files to files. The server writes a request into
 * the bucket; this reads it, renders, uploads the export, and writes its
 * progress and its result beside the request, where the server reads them.
 * No database password lives in Cloud Run.
 *
 * request.json
 *   { source_key, voice_key, background_key, timeline, options, follows,
 *     output_key, srt_key }
 * progress.json (beside it, every few seconds)
 *   { progress, stage, at }
 * result.json (beside it, last)
 *   { ok: true, width, height, duration, drew, size, srt_key, ms, cpus, peak_rss_mb }
 *   { ok: false, error, userMessage }
 */
import fs from "fs";
import fsp from "fs/promises";
import os from "os";
import path from "path";
import { materialize, putFile, statObject } from "../../media/storage.js";

/** A small JSON file into the bucket. */
async function putJson(key, value) {
  const tmp = path.join(os.tmpdir(), `render-${process.pid}-${Date.now()}-${path.posix.basename(key)}`);
  await fsp.writeFile(tmp, JSON.stringify(value));
  try {
    await putFile(tmp, key, "application/json");
  } finally {
    await fsp.rm(tmp, { force: true }).catch(() => {});
  }
}

/**
 * The most memory this export's processes held at once (Linux only): in the
 * container, the renderer and its ffmpeg children are all there is.
 */
function memoryMeter() {
  let peak = 0;
  const sample = () => {
    if (process.platform !== "linux") return;
    let total = 0;
    for (const pid of fs.readdirSync("/proc").filter((d) => /^\d+$/.test(d))) {
      try {
        const m = /VmRSS:\s+(\d+) kB/.exec(fs.readFileSync(`/proc/${pid}/status`, "utf8"));
        if (m) total += Number(m[1]) * 1024;
      } catch { /* gone */ }
    }
    peak = Math.max(peak, total);
  };
  const timer = setInterval(sample, 1000);
  return { stop: () => { clearInterval(timer); sample(); return Math.round(peak / 1048576); } };
}

/**
 * Render the request at `requestKey` (a .json in the bucket). Resolves with
 * the result it also writes as result.json; a failure is written there too
 * and then thrown.
 */
export async function renderFromRequest(requestKey) {
  const dir = path.posix.dirname(requestKey);
  const t0 = Date.now();
  const meter = memoryMeter();
  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), "render-"));
  try {
    if (!String(requestKey).endsWith(".json")) throw new Error("the request must be a .json in the bucket");
    // Loaded here, not at the top, so a module that will not load is reported
    // in result.json like any other failure.
    const { renderTimeline } = await import("./compose.js");
    const { cleanExportOptions } = await import("../exportOptions.js");
    const { loadImage } = await import("@napi-rs/canvas");

    const req = JSON.parse(await fsp.readFile(await materialize(requestKey, workDir, "request.json"), "utf8"));
    const source = await materialize(req.source_key, workDir, "recording.mp4");
    const voiceFile = req.voice_key ? await materialize(req.voice_key, workDir, "voice.mp3") : null;
    const options = cleanExportOptions(req.options);
    const out = path.join(workDir, `export.${options.format}`);

    // Progress to the bucket at most every three seconds: one object may be
    // written about once a second, and nobody watches a bar more closely.
    let last = 0;
    let pending = null;
    const report = (progress, stage) => {
      const now = Date.now();
      if (now - last < 3000 || pending) return;
      last = now;
      pending = putJson(`${dir}/progress.json`, { progress, stage, at: new Date().toISOString() })
        .catch((err) => console.warn("[render] progress not written:", err.message))
        .finally(() => { pending = null; });
    };

    const result = await renderTimeline({
      timeline: req.timeline,
      source,
      workDir,
      dest: out,
      options,
      follows: req.follows || {},
      voiceFile,
      // The server looked the image up (it has the database); here it is only fetched.
      loadBackground: async () => {
        if (!req.background_key) return null;
        try {
          return await loadImage(await materialize(req.background_key, workDir, "background-image.jpg"));
        } catch (err) {
          console.warn(`[render] background image could not be loaded: ${err.message}`);
          return null;
        }
      },
      onProgress: (p, stage) => report(Math.max(0.01, Math.min(0.99, p)), stage),
    });

    report(0.99, "Uploading");
    const ext = options.format;
    const mime = ext === "gif" ? "image/gif" : ext === "webm" ? "video/webm" : "video/mp4";
    await putFile(out, req.output_key, mime);
    let srtKey = "";
    if (result.srt && req.srt_key) {
      const srtPath = path.join(workDir, "captions.srt");
      await fsp.writeFile(srtPath, result.srt, "utf8");
      await putFile(srtPath, req.srt_key, "text/plain; charset=utf-8");
      srtKey = req.srt_key;
    }
    const stat = await statObject(req.output_key).catch(() => null);
    await pending;
    const done = {
      ok: true,
      width: result.width,
      height: result.height,
      duration: result.duration,
      drew: result.drew,
      size: stat?.size || 0,
      srt_key: srtKey,
      ms: Date.now() - t0,
      cpus: os.availableParallelism ? os.availableParallelism() : os.cpus().length,
      peak_rss_mb: meter.stop(),
    };
    await putJson(`${dir}/result.json`, done);
    console.log(`[render] ${req.output_key}: ${done.width}x${done.height} ${Number(done.duration).toFixed(1)}s in ${(done.ms / 1000).toFixed(1)}s, ${done.cpus} CPUs, peak ${done.peak_rss_mb} MB`);
    return done;
  } catch (err) {
    meter.stop();
    console.error("[render] failed:", err);
    await putJson(`${dir}/result.json`, { ok: false, error: String(err?.message || err).slice(0, 500), userMessage: err?.userMessage || "" }).catch(() => {});
    throw err;
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export default { renderFromRequest };

/**
 * vmPrepCost.mjs: how long the VM's own code takes for what "edit
 * automatically" asks of the server, on one recording (no model calls).
 *
 *     nice -n 19 node vmPrepCost.mjs <app dir> <storage key of an .mp4>
 *
 * Times the prepare job's steps (the same functions), the stills the vision
 * questions need, and a whole server-side analysis — what a creator whose
 * browser cannot analyse (Safari, Firefox) gets. Changes nothing in the app.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";

const [appDir, key] = process.argv.slice(2);
const BACKEND = path.resolve(appDir, "backend");
Object.assign(process.env, {
  REDIS_DISABLED: "true", MEDIA_BUCKET: "tryclipo-bucket",
  STUDIO_VISION_ON_ANALYSE: "off", STUDIO_POINTER_VISION: "off", GEMINI_PROVIDER: "vertex", VERTEX_PROJECT: "",
});
const mod = (p) => import(pathToFileURL(path.join(BACKEND, p)).href);
const { materialize } = await mod("services/media/storage.js");
const ff = await mod("services/media/ffmpeg.js");
const { readScreen } = await mod("services/studio/sync.js");
const { analyseRecording } = await mod("services/studio/analyse.js");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prep-cost-"));
const t = {};
const time = async (k, f) => { const t0 = Date.now(); const cpu0 = process.cpuUsage(); const r = await f(); t[k] = `${((Date.now() - t0) / 1000).toFixed(1)}s`; return r; };
try {
  const src = await materialize(key, dir, "capture.mp4");
  const meta = await ff.probe(src);
  const mp4 = path.join(dir, "recording.mp4");
  await time("remux", () => ff.remuxRecording(src, mp4, { duration: meta.duration }));
  await time("preview", () => ff.makeVideoProxy(mp4, path.join(dir, "proxy.mp4"), { duration: meta.duration }));
  await time("thumbnail", () => ff.makeThumbnail(mp4, path.join(dir, "thumb.jpg"), { at: 1.5 }));
  await time("audio", () => ff.extractSpeechAudio(mp4, path.join(dir, "speech.mp3"), { duration: meta.duration }).catch(() => null));
  await time("screen", () => readScreen(mp4, { duration: meta.duration, sourceWidth: meta.width, sourceHeight: meta.height }));
  fs.mkdirSync(path.join(dir, "frames"));
  await time("stills", () => ff.extractFrames(mp4, path.join(dir, "frames"), { every: 2, duration: meta.duration, longEdge: 1280 }));
  const work = path.join(dir, "work");
  fs.mkdirSync(work);
  await time("server_analysis", () => analyseRecording({ video: mp4, workDir: work, capture: {}, source: { width: meta.width, height: meta.height, fps: 30 }, duration: meta.duration }));
  console.log(JSON.stringify({ duration: meta.duration, ...t }));
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
process.exit(0);

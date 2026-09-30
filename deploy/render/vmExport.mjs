/**
 * vmExport.mjs: the test cases of deploy/render/test.mjs, exported by the VM's
 * own deployed code, for comparing with Cloud Run.
 *
 *     node vmExport.mjs <app dir> <case...>
 *
 * Run ON the VM, from anywhere (e.g. /tmp): it loads <app dir>/backend/.env
 * the way the app does, imports the app's renderTimeline, reads each case from
 * gs://tryclipo-bucket/lipi/cloudrun-test/<case>/ and writes the export to
 * .../<case>/vm/export.mp4 with a result.json. It changes nothing in the app.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import { pathToFileURL } from "url";

const [appDir, ...names] = process.argv.slice(2);
const BACKEND = path.resolve(appDir, "backend");
const req = createRequire(path.join(BACKEND, "package.json"));
process.env.REDIS_DISABLED = "true";
req("dotenv").config({ path: path.join(BACKEND, ".env") });
process.env.MEDIA_BUCKET = "tryclipo-bucket";

const mod = (p) => import(pathToFileURL(path.join(BACKEND, p)).href);
const { materialize, putFile } = await mod("services/media/storage.js");
const { renderTimeline } = await mod("services/studio/render/compose.js");
const { FFMPEG_PATH } = await mod("services/media/ffmpeg.js");
const T = "lipi/cloudrun-test";

console.log(`ffmpeg ${FFMPEG_PATH}, ${os.cpus().length} CPUs (${os.cpus()[0]?.model}), node ${process.version}`);
for (const name of names) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "vm-export-"));
  try {
    const c = JSON.parse(fs.readFileSync(await materialize(`${T}/${name}/case.json`, work, "case.json"), "utf8"));
    const source = await materialize(`${T}/${name}/source.mp4`, work, "source.mp4");
    const voiceFile = c.voice ? await materialize(`${T}/${name}/voice.mp3`, work, "voice.mp3") : null;
    const out = path.join(work, "export.mp4");
    const t0 = Date.now();
    const r = await renderTimeline({ timeline: c.timeline, source, workDir: work, dest: out, options: c.options, follows: c.follows || {}, voiceFile });
    const ms = Date.now() - t0;
    await putFile(out, `${T}/${name}/vm/export.mp4`, "video/mp4");
    const result = { ok: true, width: r.width, height: r.height, duration: r.duration, ms, size: fs.statSync(out).size };
    fs.writeFileSync(path.join(work, "result.json"), JSON.stringify(result));
    await putFile(path.join(work, "result.json"), `${T}/${name}/vm/result.json`, "application/json");
    console.log(`${name}: ${r.width}x${r.height} ${r.duration.toFixed(1)}s rendered on the VM in ${(ms / 1000).toFixed(1)}s`);
  } catch (err) {
    console.log(`${name}: FAILED ${err.message}`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}
process.exit(0);

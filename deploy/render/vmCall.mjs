/**
 * vmCall.mjs: from the VM, ask the Cloud Run export service to render a test
 * case with the VM's own identity — what the export job does
 * (remoteRender.js), without the app.
 *
 *     node vmCall.mjs <app dir> <service url> <case> <tag>
 *
 * Copies .../<case>/s8a/request.json (or the first run found) to .../<case>/<tag>/,
 * points its output there, and posts it. Changes nothing in the app.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import { pathToFileURL } from "url";

const [appDir, url, name, tag] = process.argv.slice(2);
const BACKEND = path.resolve(appDir, "backend");
const req = createRequire(path.join(BACKEND, "package.json"));
process.env.REDIS_DISABLED = "true";
process.env.MEDIA_BUCKET = "tryclipo-bucket";
const { materialize, putFile } = await import(pathToFileURL(path.join(BACKEND, "services/media/storage.js")).href);
const { GoogleAuth } = req("google-auth-library");

const T = "lipi/cloudrun-test";
const work = fs.mkdtempSync(path.join(os.tmpdir(), "vm-call-"));
const r = JSON.parse(fs.readFileSync(await materialize(`${T}/${name}/s8a/request.json`, work, "req.json"), "utf8"));
r.output_key = `${T}/${name}/${tag}/export.mp4`;
r.srt_key = `${T}/${name}/${tag}/export.srt`;
fs.writeFileSync(path.join(work, "request.json"), JSON.stringify(r));
await putFile(path.join(work, "request.json"), `${T}/${name}/${tag}/request.json`, "application/json");

const client = await new GoogleAuth().getIdTokenClient(new URL(url).origin);
const headers = await client.getRequestHeaders();
const t0 = Date.now();
const res = await fetch(url.replace(/\/+$/, "") + "/render", {
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify({ request: `${T}/${name}/${tag}/request.json` }),
});
const body = await res.text();
console.log(`HTTP ${res.status} after ${((Date.now() - t0) / 1000).toFixed(0)}s: ${body.slice(0, 400)}`);
fs.rmSync(work, { recursive: true, force: true });
process.exit(0);

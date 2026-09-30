/**
 * test.mjs: the Cloud Run export against the same export made on this
 * machine by the same code (backend/renderJob.js).
 *
 *     node deploy/render/test.mjs stage                 build the cases, upload them
 *     node deploy/render/test.mjs local <case...>       render them here (the reference)
 *     node deploy/render/test.mjs cloud <job> <case> [--copies N] [--tag t]
 *                                                        render on Cloud Run, N at once
 *     node deploy/render/test.mjs svc <case> [--copies N] [--tag t]
 *                                                        the same through the service, via
 *                                                        `gcloud run services proxy` on :8089
 *     node deploy/render/test.mjs compare <case> <tag>  PSNR/SSIM of a cloud output vs the local one
 *
 * Cases (all from the labelled recordings in backend/scripts/pointerTest):
 *   original   the default export ("Original": the recording's own size,
 *              30fps) of a demo with zooms, the cursor, clicks and 3 blurs
 *   cutfollow  the default export of a demo with a cut and a followed blur
 *   full       YouTube preset (1920x1080 on a background image), captions in
 *              English and Hindi, the AI voiceover mixed in
 *   demo4k     the "4K demo" preset: 3840x2160, 60fps, the slow encoder
 *
 * Everything lives under gs://<bucket>/lipi/cloudrun-test/ and, locally,
 * backend/scripts/browserParity/out/crtest/ (the same keys).
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { spawnSync, spawn } from "child_process";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const PROJECT = process.env.RENDER_PROJECT || "project-73c4c1db-b64d-42cb-9b8";
const REGION = process.env.RENDER_REGION || "us-central1";
const BUCKET = process.env.RENDER_BUCKET || "tryclipo-bucket";
const ROOT = "lipi/cloudrun-test";
const LOCAL = path.join(REPO, "backend/scripts/browserParity/out/crtest");
const JOBS = path.join(REPO, "backend/scripts/browserParity/out/jobs");
const FFMPEG = path.join(REPO, "backend/node_modules/ffmpeg-static/ffmpeg.exe");
const win = process.platform === "win32";

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", shell: win, maxBuffer: 1 << 26, ...opts });
  if (r.status !== 0 && !opts.allowFail) throw new Error(`${cmd} ${args.slice(0, 4).join(" ")} failed: ${(r.stderr || r.stdout || "").slice(-800)}`);
  return r;
};
const gcloud = (args, opts) => run("gcloud", [...args, "--project", PROJECT], opts);
const local = (key) => path.join(LOCAL, ...key.split("/"));
const md5 = (file) => crypto.createHash("md5").update(fs.readFileSync(file)).digest("hex");

/* ── The cases ──────────────────────────────────────────────────────────────── */
function job(name) {
  return JSON.parse(fs.readFileSync(path.join(JOBS, name + ".json"), "utf8"));
}
function cases() {
  const a = job("lifetime2-zoom-cursor-blurs");
  const b = job("cursorful-scroll-cut-follow");
  const full = structuredClone(a.timeline);
  full.captions = { ...full.captions, enabled: true };
  full.cues = [
    { id: "c_0000000001", start: 0.4, end: 4.8, text: "Open the pricing page and pick the lifetime plan" },
    { id: "c_0000000002", start: 5.2, end: 10.5, text: "यह बटन सेटिंग्स खोलता है और आपकी योजना दिखाता है" },
    { id: "c_0000000003", start: 11, end: 17.5, text: "Then confirm — the checkout opens in a new panel" },
  ];
  full.canvas = { ...full.canvas, background: { kind: "image", value: "0123456789abcdef01234567" } };
  full.voice = { on: true, keep_original: false };
  return {
    original: { timeline: a.timeline, follows: a.follows || {}, options: null, source: a.sourcePath },
    cutfollow: { timeline: b.timeline, follows: b.follows || {}, options: null, source: b.sourcePath },
    full: { timeline: full, follows: a.follows || {}, options: { preset: "youtube" }, source: a.sourcePath, voice: true, background: true },
    demo4k: { timeline: a.timeline, follows: a.follows || {}, options: { preset: "demo4k" }, source: a.sourcePath },
    // "full" on the default gradient: what an older deploy can render without
    // its database (the uploaded image needs the lookup).
    fullgrad: {
      timeline: { ...full, canvas: { ...full.canvas, background: { kind: "gradient", value: "dusk" } } },
      follows: a.follows || {}, options: { preset: "youtube" }, source: a.sourcePath, voice: true,
    },
  };
}

function request(name, c, dir) {
  const ext = c.options?.format || "mp4";
  return {
    source_key: `${ROOT}/${name}/source.mp4`,
    voice_key: c.voice ? `${ROOT}/${name}/voice.mp3` : "",
    background_key: c.background ? `${ROOT}/${name}/background.jpg` : "",
    timeline: c.timeline,
    options: c.options,
    follows: c.follows,
    output_key: `${dir}/export.${ext}`,
    srt_key: `${dir}/export.srt`,
  };
}

function stage() {
  const all = cases();
  for (const [name, c] of Object.entries(all)) {
    const base = local(`${ROOT}/${name}`);
    fs.mkdirSync(base, { recursive: true });
    fs.copyFileSync(c.source, path.join(base, "source.mp4"));
    if (c.voice) fs.copyFileSync(path.join(REPO, "backend/scripts/browserParity/rec/claude-voice.mp3"), path.join(base, "voice.mp3"));
    if (c.background) {
      run(FFMPEG, ["-y", "-v", "error", "-ss", "5", "-i", path.join(REPO, "backend/scripts/browserParity/rec/6ab4f73ad23295672bb19a9c.mp4"), "-frames:v", "1", "-q:v", "3", path.join(base, "background.jpg")], { shell: false });
    }
    fs.writeFileSync(path.join(base, "case.json"), JSON.stringify(c));
  }
  gcloud(["storage", "cp", "-r", path.join(LOCAL, "lipi"), `gs://${BUCKET}/`]);
  console.log(`staged ${Object.keys(all).join(", ")} in gs://${BUCKET}/${ROOT}/`);
}

/** One run's folder: the request, and where the job writes. */
function prepareRun(name, tag) {
  const c = JSON.parse(fs.readFileSync(local(`${ROOT}/${name}/case.json`), "utf8"));
  const dir = `${ROOT}/${name}/${tag}`;
  const req = request(name, c, dir);
  fs.mkdirSync(local(dir), { recursive: true });
  fs.writeFileSync(local(`${dir}/request.json`), JSON.stringify(req));
  return { dir, req };
}

function localRender(name) {
  const { dir } = prepareRun(name, "local");
  const t0 = Date.now();
  const r = run(process.execPath, ["renderJob.js"], {
    cwd: path.join(REPO, "backend"), shell: false,
    env: { ...process.env, MEDIA_BUCKET: "", MEDIA_LOCAL_DIR: LOCAL, RENDER_REQUEST: `${dir}/request.json` },
    allowFail: true,
  });
  const result = JSON.parse(fs.readFileSync(local(`${dir}/result.json`), "utf8"));
  console.log(`local ${name}: ${result.ok ? `${result.width}x${result.height} in ${((Date.now() - t0) / 1000).toFixed(0)}s, ${(result.size / 1e6).toFixed(1)} MB, md5 ${md5(local(result.ok ? `${dir}/export.mp4` : `${dir}/result.json`))}` : "FAILED " + result.error}`);
  if (!result.ok) console.log(r.stderr.slice(-1500));
}

async function cloudRender(jobName, name, copies, tag) {
  const runs = [];
  for (let i = 0; i < copies; i++) {
    const t = copies > 1 ? `${tag}-${i + 1}` : tag;
    const { dir } = prepareRun(name, t);
    gcloud(["storage", "cp", local(`${dir}/request.json`), `gs://${BUCKET}/${dir}/request.json`]);
    runs.push({ dir, tag: t });
  }
  // All started together: each is its own execution, on its own machine.
  const t0 = Date.now();
  await Promise.all(runs.map((r) => new Promise((resolve, reject) => {
    const p = spawn("gcloud", ["run", "jobs", "execute", jobName, "--region", REGION, "--project", PROJECT,
      "--update-env-vars", `RENDER_REQUEST=${r.dir}/request.json`, "--async", "--format", "value(metadata.name)"], { shell: win });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => (code === 0 ? ((r.execution = out.trim().split(/\s+/).pop()), (r.started = Date.now()), resolve()) : reject(new Error(out))));
  })));
  console.log(`started ${runs.length} execution(s) of ${jobName} for ${name} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  // Wait for every result.json.
  const pending = new Set(runs);
  while (pending.size) {
    await new Promise((r) => setTimeout(r, 5000));
    for (const r of [...pending]) {
      const got = gcloud(["storage", "cat", `gs://${BUCKET}/${r.dir}/result.json`], { allowFail: true });
      // An execution that died without writing its result (a container that
      // would not start) is found through its own status.
      if (got.status !== 0 && r.execution && Date.now() - (r.checked || 0) > 20000) {
        r.checked = Date.now();
        const st = gcloud(["run", "jobs", "executions", "describe", r.execution, "--region", REGION, "--format", "value(status.failedCount)"], { allowFail: true });
        if (Number(st.stdout.trim()) > 0) {
          got.status = 0;
          got.stdout = JSON.stringify({ ok: false, error: `execution ${r.execution} failed without a result; see its logs` });
        }
      }
      if (got.status === 0 && got.stdout.trim().startsWith("{")) {
        r.result = JSON.parse(got.stdout);
        r.wall = (Date.now() - r.started) / 1000;
        pending.delete(r);
        console.log(`  ${r.tag}: ${r.result.ok ? `${r.result.width}x${r.result.height}, ${r.result.duration.toFixed(1)}s of video, rendered in ${(r.result.ms / 1000).toFixed(0)}s inside, ${r.wall.toFixed(0)}s from start to file, ${r.result.cpus} CPUs, peak ${r.result.peak_rss_mb} MB, ${(r.result.size / 1e6).toFixed(1)} MB` : "FAILED " + r.result.error}`);
      }
    }
    if ((Date.now() - t0) / 1000 > 7200) throw new Error("gave up waiting after 2 hours");
  }
  // The outputs, for comparing.
  for (const r of runs) {
    if (!r.result.ok) continue;
    gcloud(["storage", "cp", `gs://${BUCKET}/${r.dir}/export.mp4`, local(`${r.dir}/export.mp4`)]);
    r.md5 = md5(local(`${r.dir}/export.mp4`));
  }
  const md5s = [...new Set(runs.filter((r) => r.md5).map((r) => r.md5))];
  console.log(`  outputs: ${md5s.length === 1 ? `all ${runs.length} identical (md5 ${md5s[0]})` : `${md5s.length} different files: ${md5s.join(", ")}`}`);
  const walls = runs.filter((r) => r.wall).map((r) => r.wall);
  console.log(`  start to file: fastest ${Math.min(...walls).toFixed(0)}s, slowest ${Math.max(...walls).toFixed(0)}s`);
  fs.writeFileSync(local(`${ROOT}/${name}/${tag}-summary.json`), JSON.stringify(runs.map(({ tag: t, execution, wall, result, md5: m }) => ({ tag: t, execution, wall, result, md5: m })), null, 1));
}

/**
 * The service (renderService.js), through `gcloud run services proxy` on
 * localhost (it signs the requests with this machine's login): N exports
 * posted at once, each timed from the request to the file being in the bucket.
 */
async function serviceRender(base, name, copies, tag) {
  const runs = [];
  for (let i = 0; i < copies; i++) {
    const t = copies > 1 ? `${tag}-${i + 1}` : tag;
    const { dir } = prepareRun(name, t);
    gcloud(["storage", "cp", local(`${dir}/request.json`), `gs://${BUCKET}/${dir}/request.json`]);
    runs.push({ dir, tag: t });
  }
  const t0 = Date.now();
  await Promise.all(runs.map(async (r) => {
    const s = Date.now();
    try {
      const res = await fetch(`${base}/render`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: `${r.dir}/request.json` }),
        signal: AbortSignal.timeout(3700_000),
      });
      r.result = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
    } catch (err) {
      r.result = { ok: false, error: String(err.message || err) };
    }
    r.wall = (Date.now() - s) / 1000;
    console.log(`  ${r.tag}: ${r.result.ok ? `${r.result.width}x${r.result.height}, ${r.result.duration.toFixed(1)}s of video, rendered in ${(r.result.ms / 1000).toFixed(0)}s inside, ${r.wall.toFixed(0)}s from request to file, ${r.result.cpus} CPUs, peak ${r.result.peak_rss_mb} MB, ${(r.result.size / 1e6).toFixed(1)} MB` : "FAILED " + r.result.error} (+${((s - t0) / 1000).toFixed(0)}s)`);
  }));
  for (const r of runs) {
    if (!r.result.ok) continue;
    gcloud(["storage", "cp", `gs://${BUCKET}/${r.dir}/export.mp4`, local(`${r.dir}/export.mp4`)]);
    r.md5 = md5(local(`${r.dir}/export.mp4`));
  }
  const md5s = [...new Set(runs.filter((r) => r.md5).map((r) => r.md5))];
  console.log(`  outputs: ${md5s.length === 1 ? `all ${runs.filter((r) => r.md5).length} identical (md5 ${md5s[0]})` : `${md5s.length} different files: ${md5s.join(", ")}`}`);
  const walls = runs.map((r) => r.wall);
  console.log(`  request to file: fastest ${Math.min(...walls).toFixed(0)}s, slowest ${Math.max(...walls).toFixed(0)}s`);
  fs.writeFileSync(local(`${ROOT}/${name}/${tag}-summary.json`), JSON.stringify(runs.map(({ tag: t, wall, result, md5: m }) => ({ tag: t, wall, result, md5: m })), null, 1));
}

function compare(name, tag) {
  const a = local(`${ROOT}/${name}/local/export.mp4`);
  const b = local(`${ROOT}/${name}/${tag}/export.mp4`);
  const r = run(FFMPEG, ["-v", "info", "-i", a, "-i", b, "-lavfi", "[0:v][1:v]ssim;[0:v][1:v]psnr", "-f", "null", "-"], { shell: false });
  const ssim = /SSIM .*All:([\d.]+)/.exec(r.stderr)?.[1];
  const psnr = /PSNR .*average:([\d.inf]+)/.exec(r.stderr)?.[1];
  const probe = (f) => run(FFMPEG, ["-i", f], { shell: false, allowFail: true }).stderr.match(/Stream #0:\d.*?: (Video|Audio): [^\n]+/g)?.map((s) => s.replace(/^Stream #0:\d(\[\w+\])?(\(\w+\))?: /, "")).join(" | ");
  console.log(`${name}: cloud vs this machine — SSIM ${ssim}, PSNR ${psnr} dB; md5 ${md5(a) === md5(b) ? "IDENTICAL" : "differs"}`);
  console.log(`  local: ${probe(a)}\n  cloud: ${probe(b)}`);
}

const [cmd, ...rest] = process.argv.slice(2);
const flag = (k, d) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : d; };
if (cmd === "stage") stage();
else if (cmd === "local") for (const n of rest) localRender(n);
else if (cmd === "cloud") await cloudRender(rest[0], rest[1], Number(flag("--copies", 1)), flag("--tag", "cloud"));
else if (cmd === "svc") await serviceRender(flag("--url", "http://localhost:8089"), rest[0], Number(flag("--copies", 1)), flag("--tag", "svc"));
else if (cmd === "compare") compare(rest[0], rest[1]);
else console.log("usage: stage | local <case...> | cloud <job> <case> [--copies N] [--tag t] | svc <case> [--copies N] [--tag t] [--url u] | compare <case> <tag>");

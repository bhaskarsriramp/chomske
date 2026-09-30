/**
 * build.mjs: the browser analysis, built into public/studio/analysis/.
 *
 *     cd browser-analysis && npm install && node build.mjs
 *
 * Run it after ANY change to the analysis code (backend/services/studio/
 * analyse.js and everything it imports). If it is not rerun, the server
 * notices at boot that the bundle is not its code and keeps every analysis
 * on the server (services/studio/browserAnalysis.js) — safe, but the
 * browser path is off until this is run again and the output deployed.
 *
 * Writes:
 *   worker-<version>.js   the Web Worker: worker.js, the server's analysis
 *                         modules unmodified, and shims/ for the Node parts
 *   tpl/<sha1>.bin        every pointer template, drawn by the server's canvas
 *   manifest.json         { version, worker, templates, files, env_keys,
 *                           gray_lut, canvas_version, built_at }
 *
 * `version` is a SHA-256 over every server file in the bundle (listed in
 * `files`) and the canvas library's version. The server computes the same at
 * boot from its own copies.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const OUT = path.join(REPO, "public/studio/analysis");
const PUBLIC_PATH = "/studio/analysis/";
const backendRequire = createRequire(path.join(REPO, "backend/package.json"));

const rel = (p) => path.relative(REPO, p).split(path.sep).join("/");
const abs = (p) => path.join(REPO, p);

/* ── Which module stands in for which ───────────────────────────────────── */
const SHIMS = path.join(HERE, "shims");
const BY_NAME = {
  "@napi-rs/canvas": path.join(SHIMS, "canvas.js"),
  crypto: path.join(SHIMS, "crypto.js"),
  path: path.join(SHIMS, "path.js"),
  "fs/promises": path.join(SHIMS, "fsp.js"),
  url: path.join(SHIMS, "url.js"),
};
const BY_FILE = new Map([
  [abs("backend/services/media/ffmpeg.js"), path.join(SHIMS, "ffmpeg.js")],
  [abs("backend/services/studio/vision.js"), path.join(SHIMS, "vision.js")],
  [abs("backend/services/ai/provider.js"), path.join(SHIMS, "provider.js")],
  [abs("backend/services/studio/judge.js"), path.join(SHIMS, "judge.js")],
  [abs("backend/services/studio/demoService.js"), path.join(SHIMS, "demoService.js")],
]);
const shimPlugin = {
  name: "shims",
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      if (BY_NAME[args.path]) return { path: BY_NAME[args.path] };
      if (args.path.startsWith(".") && args.resolveDir) {
        const target = path.resolve(args.resolveDir, args.path);
        const shim = BY_FILE.get(target);
        // A shim may import the module it replaces only through its own path.
        if (shim && !args.importer.startsWith(SHIMS)) return { path: shim };
      }
      return undefined;
    });
  },
};

/* ── The build machine's ffmpeg: yuv420p (tv) → gray ──────────────────────── */
function grayLut() {
  const ffmpegPath = process.env.FFMPEG_PATH || backendRequire("ffmpeg-static");
  const W = 256, H = 16;
  const yuv = Buffer.alloc(W * H * 1.5);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) yuv[r * W + c] = c;
  yuv.fill(128, W * H);
  const r = spawnSync(ffmpegPath, ["-v", "error", "-f", "rawvideo", "-pix_fmt", "yuv420p", "-s", `${W}x${H}`, "-color_range", "tv", "-i", "pipe:0",
    "-vf", `fps=30,scale=${W}:${H}:flags=bilinear`, "-pix_fmt", "gray", "-f", "rawvideo", "pipe:1"], { input: yuv, maxBuffer: 1 << 20 });
  if (r.status !== 0) throw new Error("ffmpeg failed: " + r.stderr);
  return Array.from(r.stdout.subarray(0, W));
}

const canvasVersion = JSON.parse(fs.readFileSync(abs("backend/node_modules/@napi-rs/canvas/package.json"), "utf8")).version;

const mediabunnyVersion = JSON.parse(fs.readFileSync(path.join(HERE, "node_modules/mediabunny/package.json"), "utf8")).version;

/** Must match services/studio/browserAnalysis.js fingerprint(). */
function fingerprint(files) {
  const h = crypto.createHash("sha256");
  for (const f of files) {
    h.update(f + "\0");
    h.update(fs.readFileSync(abs(f)));
    h.update("\0");
  }
  h.update(`canvas:${canvasVersion}|mediabunny:${mediabunnyVersion}`);
  return h.digest("hex");
}

const bundleOptions = (define) => ({
  entryPoints: [path.join(HERE, "worker.js")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["chrome111", "edge111"],
  plugins: [shimPlugin],
  nodePaths: [path.join(HERE, "node_modules")],
  metafile: true,
  absWorkingDir: HERE,
  legalComments: "none",
  logLevel: "warning",
  define,
});

const t0 = Date.now();
const lut = grayLut();

// Pass 1: which files end up in the bundle.
const probe = await esbuild.build({ ...bundleOptions({ __GRAY_LUT__: JSON.stringify(lut), __VERSION__: '""' }), write: false });
// Every file of ours in the bundle — the server's analysis modules and this
// folder's shims alike — so any change to either makes a new version, and a
// browser can never keep running a worker the server no longer matches.
// (Libraries are pinned by version instead: see fingerprint.)
const files = Object.keys(probe.metafile.inputs)
  // "(disabled):…" entries are modules a package switches off for browsers;
  // "<define:…>" ones are the constants passed in below.
  .filter((p) => !p.startsWith("(") && !p.startsWith("<"))
  // Relative to esbuild's working directory, which is this folder.
  .map((p) => rel(path.resolve(HERE, p)))
  .filter((p) => !p.includes("node_modules/"))
  .sort();
const version = fingerprint(files);
const envKeys = [...new Set(files.flatMap((f) => [...fs.readFileSync(abs(f), "utf8").matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1])))].sort();

// Pass 2: the worker, stamped with its version.
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (/^worker-.*\.js(\.map)?$/.test(f)) fs.rmSync(path.join(OUT, f));
const workerName = `worker-${version.slice(0, 16)}.js`;
await esbuild.build({
  ...bundleOptions({ __GRAY_LUT__: JSON.stringify(lut), __VERSION__: JSON.stringify(version) }),
  outfile: path.join(OUT, workerName),
  minify: true,
  sourcemap: "external",
});

// The templates, drawn by the server's canvas in a process of their own.
const tplDir = path.join(OUT, "tpl");
fs.rmSync(tplDir, { recursive: true, force: true });
const gen = await new Promise((resolve, reject) => {
  const c = spawn(process.execPath, ["--import", "./tools/register.mjs", "tools/genTemplates.mjs", tplDir], { cwd: HERE, windowsHide: true });
  let out = "", err = "";
  c.stdout.on("data", (d) => (out += d));
  c.stderr.on("data", (d) => (err += d));
  c.on("close", (code) => (code === 0 ? resolve(JSON.parse(out.trim().split(/\r?\n/).pop())) : reject(new Error(err.slice(-2000)))));
});

const manifest = {
  version,
  worker: PUBLIC_PATH + workerName,
  templates: PUBLIC_PATH + "tpl/",
  files,
  env_keys: envKeys,
  gray_lut: lut,
  canvas_version: canvasVersion,
  mediabunny: mediabunnyVersion,
  built_at: new Date().toISOString(),
};
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));

const size = fs.statSync(path.join(OUT, workerName)).size;
console.log(`browser analysis ${version.slice(0, 16)}: ${files.length} server files, worker ${(size / 1024).toFixed(0)} KB, ` +
  `${gen.count} templates (${(gen.bytes / 1e6).toFixed(1)} MB), env ${envKeys.length} keys, ${((Date.now() - t0) / 1000).toFixed(0)}s`);

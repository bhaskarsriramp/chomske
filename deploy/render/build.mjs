/**
 * build.mjs: the export's container, built by Cloud Build and pushed to
 * Artifact Registry.
 *
 *     node deploy/render/build.mjs [--tag v1]
 *
 * Stages only what the export needs — backend/ without node_modules, scripts
 * or .env files, and the editor modules the server shares — into a temp folder,
 * and hands that to `gcloud builds submit`. Settings (environment):
 *   RENDER_PROJECT   default project-73c4c1db-b64d-42cb-9b8
 *   RENDER_REGION    default us-central1
 *   RENDER_IMAGE     default <region>-docker.pkg.dev/<project>/clipo/render
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const PROJECT = process.env.RENDER_PROJECT || "project-73c4c1db-b64d-42cb-9b8";
const REGION = process.env.RENDER_REGION || "us-central1";
const IMAGE = process.env.RENDER_IMAGE || `${REGION}-docker.pkg.dev/${PROJECT}/clipo/render`;
const tagAt = process.argv.indexOf("--tag");
const TAG = tagAt > 0 ? process.argv[tagAt + 1] : new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);

const SKIP = new Set(["node_modules", "scripts", ".env", ".env.example"]);
const ctx = fs.mkdtempSync(path.join(os.tmpdir(), "clipo-render-"));
function copy(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name.startsWith(".env")) continue;
    const s = path.join(from, e.name);
    const d = path.join(to, e.name);
    if (e.isDirectory()) copy(s, d);
    else fs.copyFileSync(s, d);
  }
}
copy(path.join(REPO, "backend"), path.join(ctx, "backend"));
// The modules the server shares with the editor (camera, cursor looks, blur
// follow, voices): every .mjs in src/components/Studio.
const shared = path.join(REPO, "src/components/Studio");
fs.mkdirSync(path.join(ctx, "src/components/Studio"), { recursive: true });
for (const f of fs.readdirSync(shared).filter((n) => n.endsWith(".mjs"))) {
  fs.copyFileSync(path.join(shared, f), path.join(ctx, "src/components/Studio", f));
}
fs.copyFileSync(path.join(HERE, "Dockerfile"), path.join(ctx, "Dockerfile"));

console.log(`building ${IMAGE}:${TAG} from ${ctx}`);
const r = spawnSync("gcloud", ["builds", "submit", ctx, "--project", PROJECT, "--region", REGION, "--tag", `${IMAGE}:${TAG}`, "--suppress-logs"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
fs.rmSync(ctx, { recursive: true, force: true });
if (r.status !== 0) process.exit(r.status || 1);
console.log(`\nimage: ${IMAGE}:${TAG}`);

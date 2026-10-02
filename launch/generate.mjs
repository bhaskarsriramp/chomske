/**
 * generate.mjs: the launch-video pipeline from a terminal: the same calls the
 * app's worker makes (api.mjs), with files kept under launch/work and launch/out.
 *
 *   node generate.mjs https://tryclipo.com [--slug name] [--local] [--notes "…"]
 *   node generate.mjs --refine <slug> "make the hook about saving time"
 *   node generate.mjs --render <slug>          (re-render the latest board)
 */
import fsp from "fs/promises";
import path from "path";
import { ROOT } from "./pipeline/env.mjs";
import { createVideo, refineVideo, renderLatest } from "./api.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const t0 = Date.now();
const log = (msg) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s] ${msg}`);
let shown = "";
const onProgress = (f, stage) => {
  const line = `${stage} ${Math.floor(f * 10) * 10}%`;
  if (line !== shown) log((shown = line));
};
const slugOf = (url) => new URL(url).hostname.replace(/^www\./, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
const outFor = async (slug, version) => {
  await fsp.mkdir(path.join(ROOT, "out"), { recursive: true });
  return path.join(ROOT, "out", `${slug}-v${version}.mp4`);
};
const readState = async (dir) => JSON.parse(await fsp.readFile(path.join(dir, "state.json"), "utf8"));

async function main() {
  const refine = opt("--refine");
  const rerender = opt("--render");

  if (rerender) {
    const dir = path.join(ROOT, "work", rerender);
    const { version } = await readState(dir);
    const r = await renderLatest({ dir, out: await outFor(rerender, version), log });
    log(`done: v${r.version}, ${r.seconds.toFixed(1)}s`);
    return;
  }

  if (refine) {
    const at = args.indexOf("--refine");
    const request = args.filter((a, i) => i !== at && i !== at + 1 && !a.startsWith("--")).join(" ");
    if (!request) throw new Error('Say what to change: --refine <slug> "make it shorter"');
    const dir = path.join(ROOT, "work", refine);
    const { version } = await readState(dir);
    log(`refining v${version}: "${request}"`);
    const r = await refineVideo({ dir, request, out: await outFor(refine, version + 1), onProgress, log });
    log(`done: v${r.version}, ${r.seconds.toFixed(1)}s, voice ${r.voiced ? "yes" : "NO"}, music ${r.music ? "yes" : "no"}`);
    return;
  }

  const url = args.find((a) => /^https?:\/\//.test(a));
  if (!url) throw new Error('Usage: node generate.mjs <url> | --refine <slug> "request" | --render <slug>');
  const slug = opt("--slug") || slugOf(url);
  const dir = path.join(ROOT, "work", slug);
  log(`reading ${url}`);
  const r = await createVideo({ url, dir, out: await outFor(slug, 1), notes: opt("--notes") || "", local: flag("--local"), onProgress, log });
  log(`done: "${r.title}" v1, ${r.seconds.toFixed(1)}s, ${r.scenes} scenes, voice ${r.voiced ? "yes" : "NO"}, music ${r.music ? "yes" : "no"}`);
}

main().catch((err) => {
  console.error(err.userMessage ? `${err.userMessage}\n${err.message}` : err);
  process.exit(1);
});

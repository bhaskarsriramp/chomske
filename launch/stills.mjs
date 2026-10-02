/**
 * stills.mjs: a few frames of a board as PNGs, to judge the look without a
 * full render.  node stills.mjs <slug> [frame frame …]
 * With no frames: one frame late in each scene, once its animation has landed.
 */
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { ROOT } from "./pipeline/env.mjs";
import { placeScenes } from "./src/placement.js";

const [slug, ...frames] = process.argv.slice(2);
const dir = path.join(ROOT, "work", slug);
const state = JSON.parse(await fsp.readFile(path.join(dir, "state.json"), "utf8"));
const board = JSON.parse(await fsp.readFile(path.join(dir, `board-v${state.version}.json`), "utf8"));
const SHELL = path.join(ROOT, ".browser", "chrome-headless-shell-win64", "chrome-headless-shell.exe");
const browserExecutable = fs.existsSync(SHELL) ? SHELL : null;

const serveUrl = await bundle({ entryPoint: path.join(ROOT, "src", "index.jsx"), publicDir: dir });
const inputProps = { board };
const composition = await selectComposition({ serveUrl, id: "Launch", inputProps, browserExecutable });
const at = frames.length
  ? frames.map(Number)
  : placeScenes(board).map(({ from, dur, scene }) => ({ f: from + (scene.type === "reveal" ? dur - 20 : Math.min(dur - 14, scene.type === "feature" ? 80 : 50)), name: scene.type }));
const outDir = path.join(ROOT, "out", "stills", slug);
await fsp.mkdir(outDir, { recursive: true });
for (const [i, a] of at.entries()) {
  const f = typeof a === "number" ? a : a.f;
  const name = typeof a === "number" ? `f${f}` : `${String(i + 1).padStart(2, "0")}-${a.name}`;
  const output = path.join(outDir, `${name}.jpg`);
  await renderStill({ composition, serveUrl, output, frame: f, inputProps, imageFormat: "jpeg", jpegQuality: 82, browserExecutable });
  console.log(output);
}

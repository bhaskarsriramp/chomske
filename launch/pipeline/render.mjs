/**
 * render.mjs: a board and its files, rendered to an MP4 by Remotion.
 *
 * The job's folder IS the bundle's public folder, so the board's paths
 * (shots/s1.png, audio/….wav, logo.svg) are served as they are written.
 */
import os from "os";
import path from "path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition, makeCancelSignal } from "@remotion/renderer";
import { placeScenes } from "../src/placement.js";
import fs from "fs";
import { ROOT } from "./env.mjs";

/** A headless shell fetched by hand (launch/.browser) when Remotion's own download keeps failing; otherwise Remotion's. */
const SHELL = path.join(ROOT, ".browser", "chrome-headless-shell-win64", "chrome-headless-shell.exe");
const browserExecutable = process.env.REMOTION_BROWSER || (fs.existsSync(SHELL) ? SHELL : null);

/** Frames rendered at once. Each is a browser tab (~300 MB); on a shared VM keep it modest. */
const CONCURRENCY = Number(process.env.LAUNCH_RENDER_CONCURRENCY) || Math.max(2, Math.min(8, Math.floor(os.cpus().length * 0.75)));

/** The poster: the reveal once the site has risen under the logo, or failing that the first feature in full swing. */
function posterFrame(board) {
  const placed = placeScenes(board);
  const reveal = placed.find((p) => p.scene.type === "reveal");
  if (reveal) return reveal.from + reveal.dur - 22;
  const feature = placed.find((p) => p.scene.type === "feature");
  if (feature) return feature.from + Math.min(feature.dur - 14, 80);
  return Math.min(60, (placed[0]?.dur || 60) - 1);
}

export async function renderBoard({ board, dir, out, poster = null, signal = null, log = () => {}, onProgress = () => {} }) {
  // A caller's AbortSignal stops the render properly (its browser tabs closed), not just the wait for it.
  const { cancelSignal, cancel } = makeCancelSignal();
  if (signal?.aborted) throw new Error("render cancelled");
  signal?.addEventListener("abort", () => cancel(), { once: true });
  const t0 = Date.now();
  const serveUrl = await bundle({ entryPoint: path.join(ROOT, "src", "index.jsx"), publicDir: dir });
  log(`bundled in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const inputProps = { board };
  const composition = await selectComposition({ serveUrl, id: "Launch", inputProps, browserExecutable });
  let shown = -1;
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    crf: 17,
    pixelFormat: "yuv420p",
    audioBitrate: "192k",
    outputLocation: out,
    inputProps,
    browserExecutable,
    cancelSignal,
    concurrency: CONCURRENCY,
    timeoutInMilliseconds: 120_000,
    onProgress: ({ progress }) => {
      onProgress(progress);
      const p = Math.floor(progress * 10);
      if (p !== shown) {
        shown = p;
        log(`render ${p * 10}%`);
      }
    },
  });
  if (poster) {
    await renderStill({ composition, serveUrl, output: poster, frame: posterFrame(board), inputProps, imageFormat: "jpeg", jpegQuality: 82, scale: 0.5, browserExecutable }).catch((err) =>
      log(`poster skipped: ${String(err.message).slice(0, 160)}`)
    );
  }
  log(`rendered ${(composition.durationInFrames / composition.fps).toFixed(1)}s of video in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${out}`);
  return { seconds: composition.durationInFrames / composition.fps };
}

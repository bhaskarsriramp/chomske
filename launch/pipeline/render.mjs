/**
 * render.mjs: a board and its files, rendered to an MP4 by Remotion.
 *
 * The job's folder IS the bundle's public folder, so the board's paths
 * (shots/s1.png, audio/….wav, logos/L1.png) are served as they are written.
 *
 * ── A RENDER THAT STOPS MOVING IS RESTARTED, SMALLER ─────────────────────────
 * Seen on a 16 GB Windows machine: eight tabs, each holding 2× screenshots,
 * rendered to 40% and then sat at zero CPU for minutes. Every frame rendered
 * on its own in two seconds, so nothing in the video was wrong; the machine
 * was. So progress is watched: no progress for STALL_MS and the render is
 * cancelled and run once more with half the tabs. Each frame is a browser
 * tab (~300-500 MB), which is also why the default is modest.
 */
import os from "os";
import fs from "fs";
import path from "path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition, makeCancelSignal } from "@remotion/renderer";
import { placeScenes } from "../src/placement.js";
import { ROOT } from "./env.mjs";
import { headlessShell } from "./browser.mjs";

/** Frames rendered at once: at most half the CPUs, never more than 6. LAUNCH_RENDER_CONCURRENCY overrides. */
const CONCURRENCY = Number(process.env.LAUNCH_RENDER_CONCURRENCY) || Math.max(2, Math.min(6, Math.floor(os.cpus().length / 2)));
/** No progress for this long is a stall. */
const STALL_MS = Number(process.env.LAUNCH_RENDER_STALL_MS) || 90_000;

/** The poster: the reveal once the site has risen under the logo, or failing that the first feature in full swing. */
function posterFrame(board) {
  const placed = placeScenes(board);
  const reveal = placed.find((p) => p.scene.type === "reveal");
  if (reveal) return reveal.from + reveal.dur - 22;
  const feature = placed.find((p) => p.scene.type === "feature");
  if (feature) return feature.from + Math.min(feature.dur - 14, 80);
  return Math.min(60, (placed[0]?.dur || 60) - 1);
}

/** One renderMedia, cancelled by the caller's signal or by its own stall watch. */
async function renderOnce({ composition, serveUrl, inputProps, out, browserExecutable, concurrency, signal, onProgress, log }) {
  const { cancelSignal, cancel } = makeCancelSignal();
  const onAbort = () => cancel();
  signal?.addEventListener("abort", onAbort, { once: true });
  let best = 0;
  let movedAt = Date.now();
  let stalled = false;
  const watch = setInterval(() => {
    if (Date.now() - movedAt > STALL_MS) {
      stalled = true;
      cancel();
    }
  }, 5000);
  let shown = -1;
  try {
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
      concurrency,
      timeoutInMilliseconds: 120_000,
      onProgress: ({ progress }) => {
        if (progress > best + 0.0005) {
          best = progress;
          movedAt = Date.now();
        }
        onProgress(progress);
        const p = Math.floor(progress * 10);
        if (p !== shown) {
          shown = p;
          log(`render ${p * 10}%`);
        }
      },
    });
    return { stalled: false };
  } catch (err) {
    if (stalled && !signal?.aborted) return { stalled: true, at: best, error: err };
    throw err;
  } finally {
    clearInterval(watch);
    signal?.removeEventListener("abort", onAbort);
  }
}

export async function renderBoard({ board, dir, out, poster = null, signal = null, log = () => {}, onProgress = () => {} }) {
  // launch/'s own Chrome, whatever folder the process runs from (browser.mjs).
  const browserExecutable = headlessShell();
  if (signal?.aborted) throw new Error("render cancelled");
  const t0 = Date.now();
  const serveUrl = await bundle({ entryPoint: path.join(ROOT, "src", "index.jsx"), publicDir: dir });
  log(`bundled in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const inputProps = { board };
  const composition = await selectComposition({ serveUrl, id: "Launch", inputProps, browserExecutable });

  let concurrency = CONCURRENCY;
  for (let attempt = 1; ; attempt++) {
    const r = await renderOnce({ composition, serveUrl, inputProps, out, browserExecutable, concurrency, signal, onProgress, log });
    if (!r.stalled) break;
    fs.rmSync(out, { force: true });
    if (attempt >= 2) throw new Error(`the render stopped making progress at ${Math.round(r.at * 100)}%, twice`);
    concurrency = Math.max(1, Math.floor(concurrency / 2));
    log(`render stalled at ${Math.round(r.at * 100)}% for ${STALL_MS / 1000}s; starting again with ${concurrency} tabs`);
  }

  if (poster) {
    await renderStill({ composition, serveUrl, output: poster, frame: posterFrame(board), inputProps, imageFormat: "jpeg", jpegQuality: 82, scale: 0.5, browserExecutable }).catch((err) =>
      log(`poster skipped: ${String(err.message).slice(0, 160)}`)
    );
  }
  log(`rendered ${(composition.durationInFrames / composition.fps).toFixed(1)}s of video in ${((Date.now() - t0) / 1000).toFixed(1)}s (${concurrency} tabs) → ${out}`);
  return { seconds: composition.durationInFrames / composition.fps };
}

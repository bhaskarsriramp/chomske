/**
 * watermark.js: a free generated demo's preview copy, with the Clipo mark
 * burned into the picture.
 *
 * ── WATCH FREE, PAY TO DOWNLOAD (2026-10-03) ─────────────────────────────────
 * A first-time creator's one free generated demo plays with the watermark;
 * downloading the clean file is what is paid for (routes/launch.js unlock).
 * The clean file is never sent to the page until then: the player gets this
 * copy. Burned in, not drawn over the player, because a mark on top of a
 * <video> element is one line of devtools away from gone.
 *
 * The card is drawn by the same code as the editor's (src/components/Studio/
 * watermark.mjs) into an image at this video's scale, and moves between the
 * same corners every WM_EVERY seconds via ffmpeg's overlay, evaluated per
 * frame. It jumps rather than fades: the editor's fade is a nicety, and an
 * ffmpeg alpha ramp per move costs more than it is worth here.
 */
import fsp from "fs/promises";
import path from "path";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { ffmpeg, probe } from "../media/ffmpeg.js";
import { FONTS_DIR } from "../studio/render/ass.js";
import { watermarkSize, drawWatermarkCard, WM_EVERY, WM_CORNERS, WM_MARGIN } from "../../../src/components/Studio/watermark.mjs";

/** The family the card is drawn in: the bold Noto Sans the captions ship with. */
const FAMILY = "Clipo Mark";
let registered = false;
function font() {
  if (!registered) {
    registered = true;
    try {
      GlobalFonts.registerFromPath(path.join(FONTS_DIR, "NotoSans-Bold.ttf"), FAMILY);
    } catch (err) {
      console.warn("[launch] watermark font not registered; the system sans stands in:", err.message);
    }
  }
  return `'${FAMILY}', sans-serif`;
}

/** The card, as a PNG sized for a video `height` pixels high. */
export async function watermarkImage(height, dest) {
  const k = Math.max(0.3, height / 1080);
  const f = font();
  const { w, h } = watermarkSize(createCanvas(8, 8).getContext("2d"), k, { font: f });
  const canvas = createCanvas(Math.ceil(w) + 2, Math.ceil(h) + 2);
  drawWatermarkCard(canvas.getContext("2d"), 1, 1, k, { font: f });
  await fsp.writeFile(dest, await canvas.encode("png"));
  return { w: canvas.width, h: canvas.height };
}

/**
 * Where the card goes, as ffmpeg overlay expressions: the slot is
 * floor(t / WM_EVERY) mod the number of corners, and each corner is a sum of
 * eq() tests for the slots that are on the right, or at the bottom.
 */
export function moveExpressions(margin) {
  const slot = `mod(floor(t/${WM_EVERY}),${WM_CORNERS.length})`;
  const any = (test) => WM_CORNERS.map((c, i) => (test(c) ? `eq(${slot},${i})` : "")).filter(Boolean).join("+");
  const m = Math.round(margin);
  return {
    x: `if(${any((c) => c.endsWith("r"))},W-w-${m},${m})`,
    y: `if(${any((c) => c.startsWith("b"))},H-h-${m},${m})`,
  };
}

/**
 * Write `dest`: `src` with the moving mark burned in. The sound is copied;
 * the picture is encoded once, fast, at a quality that holds up for watching.
 */
export async function watermarkCopy(src, dest, { signal } = {}) {
  const info = await probe(src);
  const height = info.height || 1080;
  const png = `${dest}.mark.png`;
  await watermarkImage(height, png);
  const { x, y } = moveExpressions(WM_MARGIN * (height / 1080));
  try {
    await ffmpeg(
      [
        "-i", src,
        "-i", png,
        "-filter_complex", `[0:v][1:v]overlay=x='${x}':y='${y}':eval=frame[v]`,
        "-map", "[v]", "-map", "0:a?",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
        "-c:a", "copy",
        "-movflags", "+faststart",
        dest,
      ],
      { duration: info.duration, signal }
    );
  } finally {
    await fsp.rm(png, { force: true }).catch(() => {});
  }
  return dest;
}

export default { watermarkCopy, watermarkImage, moveExpressions };

/**
 * frame.js: the ground the demo sits on.
 *
 * A raw screen recording is a rectangle of someone's monitor, edge to edge, and
 * it looks like a support ticket. The same recording inset a little, with
 * rounded corners, a soft shadow and something behind it, looks like a product
 * video. That is the whole job of this file, and it is worth more to how a demo
 * reads than any other single thing in the renderer.
 *
 * ── THREE STILL IMAGES, NOT A FILTER ─────────────────────────────────────────
 * The background, the shadow and the corner mask never change during a demo, so
 * they are drawn ONCE as PNGs and handed to ffmpeg as looping inputs. A filter
 * graph that generated a rounded-corner alpha per frame with `geq` would be
 * arithmetic on every pixel of every frame for a result that is identical each
 * time, and `geq` is the slowest filter in ffmpeg by a wide margin.
 *
 * The shadow is baked INTO the background rather than composited separately: it
 * is always in the same place, always under the video, and one input is one
 * less thing for the graph to align.
 *
 * ── THE ASPECT CHANGE HAPPENS HERE ───────────────────────────────────────────
 * A 16:9 recording exported as a 9:16 Short is this step and nothing else: the
 * video keeps its own shape and is fitted into the canvas, and the background
 * fills what is left. Nothing is stretched and nothing is cropped, because a
 * cropped demo loses the sidebar that explains what the screen is.
 */
import { createCanvas } from "@napi-rs/canvas";
import fsp from "fs/promises";
import { outputSize } from "../timeline.js";

/**
 * The backgrounds on offer.
 *
 * Deliberately muted. The background is behind a screenshot full of small text
 * and coloured interface; anything saturated competes with the thing the viewer
 * is meant to read. Every one of these is dark or desaturated for that reason.
 */
export const GRADIENTS = {
  dusk: ["#1b2735", "#2d3f52", "#0f1720"],
  ocean: ["#0b2b3a", "#12485c", "#071a24"],
  forest: ["#12281a", "#2A835F", "#0a1a12"],
  ember: ["#2b1a14", "#5a3324", "#180d0a"],
  slate: ["#1c1e22", "#32363d", "#101114"],
  mist: ["#e8edf2", "#f7f9fb", "#dde4ec"],
  paper: ["#f3f1ec", "#faf9f6", "#e8e4dc"],
  aurora: ["#0d1b2a", "#00B7CD", "#0d1b2a"],
  plum: ["#241a2e", "#4a3160", "#140e1c"],
  ink: ["#0a0c10", "#161a22", "#05070a"],
};

export const BACKGROUND_KINDS = ["gradient", "solid", "image", "none"];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const even = (n) => Math.max(2, Math.round(n / 2) * 2);

/**
 * Where the video sits inside the finished frame, in pixels.
 *
 * `contain`, never `cover`. A demo cropped to fill its canvas loses whichever
 * edge held the navigation, and the navigation is usually what tells a viewer
 * where they are.
 */
export function videoBox({ aspect, resolution, sourceWidth, sourceHeight, padding = 0 }) {
  const [W, H] = outputSize(aspect, resolution, { width: sourceWidth, height: sourceHeight });
  const pad = clamp(padding, 0, 0.3);
  const boxW = W * (1 - pad * 2);
  const boxH = H * (1 - pad * 2);
  const ar = sourceWidth > 0 && sourceHeight > 0 ? sourceWidth / sourceHeight : 16 / 9;

  let vw = boxW;
  let vh = boxW / ar;
  if (vh > boxH) {
    vh = boxH;
    vw = boxH * ar;
  }
  vw = even(vw);
  vh = even(vh);

  return { W, H, x: Math.round((W - vw) / 2), y: Math.round((H - vh) / 2), w: vw, h: vh };
}

/**
 * How round the corners are, in pixels of the OUTPUT.
 *
 * The creator's number is expressed against a 1080-tall reference so the same
 * setting looks the same at 720p and at 4K. A radius in absolute pixels would
 * make a 4K export's corners look almost square next to its own preview.
 */
export function radiusFor(radius, H) {
  return Math.round(clamp(radius, 0, 80) * (H / 1080));
}

/* ────────────────────────────────────────────────────────────────────────────
   The still images
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Background plus the video's drop shadow, as one PNG.
 *
 * @returns {Promise<string>} the file written
 */
export async function drawBackground({ canvas: design, box, dest, image = null }) {
  const { W, H, x, y, w, h } = box;
  const cv = createCanvas(W, H);
  const ctx = cv.getContext("2d");
  const bg = design.background || { kind: "gradient", value: "dusk" };

  if (bg.kind === "solid") {
    ctx.fillStyle = /^#[0-9a-f]{6}$/i.test(bg.value) ? bg.value : "#12141a";
    ctx.fillRect(0, 0, W, H);
  } else if (bg.kind === "image" && image) {
    // `cover`: a backdrop with letterbox bars on it is not a backdrop.
    const ar = image.width / image.height;
    let iw = W;
    let ih = W / ar;
    if (ih < H) {
      ih = H;
      iw = H * ar;
    }
    ctx.drawImage(image, (W - iw) / 2, (H - ih) / 2, iw, ih);
    // Held back so interface text on top of it stays the brightest thing.
    ctx.fillStyle = "rgba(8,10,14,0.28)";
    ctx.fillRect(0, 0, W, H);
  } else if (bg.kind === "none") {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, W, H);
  } else {
    const stops = GRADIENTS[bg.value] || GRADIENTS.dusk;
    // Diagonal, because a vertical gradient behind a horizontal video draws a
    // band across the middle of the frame exactly where the video's edge is.
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, stops[0]);
    g.addColorStop(0.55, stops[1]);
    g.addColorStop(1, stops[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // A wide, very soft light from behind the video. It is what keeps a flat
    // gradient from looking like a PowerPoint background.
    const glow = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, Math.max(W, H) * 0.7);
    glow.addColorStop(0, "rgba(255,255,255,0.09)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  }

  const shadow = clamp(design.shadow ?? 0.5, 0, 1);
  if (shadow > 0.01) {
    const r = radiusFor(design.radius ?? 18, H);
    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${0.55 * shadow})`;
    ctx.shadowBlur = Math.round(38 * shadow * (H / 1080) + 14);
    ctx.shadowOffsetY = Math.round(16 * shadow * (H / 1080));
    // The shape is filled black under where the video will sit. Only the blur
    // outside the video's own rectangle is ever seen, so the fill colour does
    // not matter and the shape does.
    roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = "#000000";
    ctx.fill();
    ctx.restore();
  }

  await fsp.writeFile(dest, await cv.encode("png"));
  return dest;
}

/**
 * The corner mask: white where the video shows, black where it is cut away.
 *
 * Fed to `alphamerge`, which takes its alpha from the mask's LUMA, so this is
 * drawn in plain greyscale with no alpha channel of its own. Anti-aliased by
 * the canvas, which is what makes the corners smooth rather than stepped —
 * the reason this is not four `drawbox` calls.
 */
export async function drawCornerMask({ box, radius, dest }) {
  const { w, h } = box;
  const cv = createCanvas(w, h);
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, 0, 0, w, h, radius);
  ctx.fill();
  await fsp.writeFile(dest, await cv.encode("png"));
  return dest;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export default { GRADIENTS, BACKGROUND_KINDS, videoBox, radiusFor, drawBackground, drawCornerMask };

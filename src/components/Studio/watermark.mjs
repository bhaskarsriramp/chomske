/**
 * watermark.mjs: the "Made with tryclipo.com" mark on a video not yet paid for.
 *
 * Two lines, "Made with" over a larger "tryclipo.com", beside the Clipo mark,
 * on a dark glass card: legible on any screen and quiet enough to watch the
 * video through. It starts bottom right and moves to another corner every
 * WM_EVERY seconds, so no single crop, blur or sticker over one corner of a
 * re-recorded screen gets rid of it.
 *
 * One drawing, two places:
 *   the editor     Preview.js draws it over every frame of an unpaid
 *                  recording, in the same canvas as the picture
 *   the server     backend services/launch/watermark.js draws the card once
 *                  and burns it, moving the same way, into the preview copy of
 *                  a free generated demo
 *
 * No imports: the backend loads this file directly, and a browser bundle and
 * Node agree on nothing else.
 */

/** Seconds in one corner before it moves. */
export const WM_EVERY = 10;
/** The corners in turn, bottom right first, in an order that is not a circle. */
export const WM_CORNERS = ["br", "tl", "tr", "bl", "tl", "br", "bl", "tr"];
/** How far from the frame's edges, at a 1080-high frame. */
export const WM_MARGIN = 28;
/** How long each move fades over in the editor, out and in. */
const WM_FADE = 0.35;
const FONT = "Inter, 'Segoe UI', system-ui, -apple-system, sans-serif";

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * Where the mark is at time `t` of the video, and how far faded in: it fades
 * out before each move and in after it; the very start is already in.
 */
export function watermarkAt(t) {
  const s = Math.max(0, Number(t) || 0);
  const slot = Math.floor(s / WM_EVERY);
  const into = s - slot * WM_EVERY;
  const alpha = clamp01(Math.min(slot === 0 ? WM_FADE : into, WM_EVERY - into) / WM_FADE);
  return { corner: WM_CORNERS[slot % WM_CORNERS.length], alpha };
}

/** The card's measurements at scale `k` (1 = a 1080-high frame). */
function metrics(ctx, k, font) {
  const small = Math.max(10, Math.round(22 * k));
  const big = Math.max(16, Math.round(37 * k));
  const mark = Math.round(54 * k);
  const padX = 18 * k;
  const padY = 13 * k;
  const gap = 14 * k;
  const lines = small * 1.2 + big * 1.12;
  ctx.save();
  ctx.font = `500 ${small}px ${font}`;
  const w1 = ctx.measureText("Made with").width;
  ctx.font = `700 ${big}px ${font}`;
  const w2 = ctx.measureText("tryclipo.com").width;
  ctx.restore();
  const w = padX * 2 + mark + gap + Math.max(w1, w2);
  const h = padY * 2 + Math.max(mark, lines);
  return { small, big, mark, padX, padY, gap, lines, w, h };
}

/** The card's size at scale `k`, for laying it out or sizing an image of it. */
export function watermarkSize(ctx, k, { font = FONT } = {}) {
  const m = metrics(ctx, k, font);
  return { w: m.w, h: m.h };
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

/** The card itself, its top left at (x, y), at scale `k`. */
export function drawWatermarkCard(ctx, x, y, k, { font = FONT, alpha = 1 } = {}) {
  const m = metrics(ctx, k, font);
  ctx.save();
  ctx.globalAlpha = 0.9 * alpha;
  roundRect(ctx, x, y, m.w, m.h, 14 * k);
  ctx.fillStyle = "rgba(12, 13, 20, 0.62)";
  ctx.fill();
  ctx.lineWidth = Math.max(1, k);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.stroke();

  // The mark: the blue tile and its white pointer, as in public/logo.svg
  // (a 56-unit tile at 4,4 in a 64 box; the pointer M24.5 16 v29 l21.5 -9.5 z).
  const mx = x + m.padX;
  const my = y + (m.h - m.mark) / 2;
  roundRect(ctx, mx, my, m.mark, m.mark, m.mark * 0.29);
  ctx.fillStyle = "#1B17FF";
  ctx.fill();
  const u = m.mark / 56;
  const at = (px, py) => [mx + (px - 4) * u, my + (py - 4) * u];
  ctx.beginPath();
  ctx.moveTo(...at(24.5, 16));
  ctx.lineTo(...at(24.5, 45));
  ctx.lineTo(...at(46, 35.5));
  ctx.closePath();
  ctx.fillStyle = "#FFFFFF";
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 5 * u;
  ctx.lineJoin = "round";
  ctx.fill();
  ctx.stroke();

  const tx = mx + m.mark + m.gap;
  const ty = y + (m.h - m.lines) / 2;
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
  ctx.font = `500 ${m.small}px ${font}`;
  ctx.fillText("Made with", tx, ty);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 ${m.big}px ${font}`;
  ctx.fillText("tryclipo.com", tx, ty + m.small * 1.2);
  ctx.restore();
}

/** Over a whole frame W × H at time `t` of the video. */
export function paintWatermark(ctx, W, H, t, { font = FONT } = {}) {
  const { corner, alpha } = watermarkAt(t);
  if (alpha <= 0.01) return;
  const k = H / 1080;
  const { w, h } = watermarkSize(ctx, k, { font });
  const m = WM_MARGIN * k;
  const x = corner.endsWith("r") ? W - m - w : m;
  const y = corner.startsWith("b") ? H - m - h : m;
  drawWatermarkCard(ctx, x, y, k, { font, alpha });
}

export default { WM_EVERY, WM_CORNERS, WM_MARGIN, watermarkAt, watermarkSize, drawWatermarkCard, paintWatermark };

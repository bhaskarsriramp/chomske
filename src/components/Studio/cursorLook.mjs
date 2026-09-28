/**
 * cursorLook.mjs: the colours the drawn pointer and its click ripple are
 * painted in. Shared by the editor's preview (Preview.js) and the export
 * (backend services/studio/render/overlay.js), for the same reason camera.mjs
 * and follow.mjs are: a pointer one colour in the editor and another in the
 * file is an export nobody previewed.
 *
 * Three looks: Dark, the default; Light; and the creator's own colour
 * (`color`), outlined in whichever of white or near-black stands out from it.
 * A demo may still carry a look that no longer exists: "system" was the light
 * arrow, and ring, dot and none draw as the default.
 *
 * The ripple is drawn on every click and only its colour (`ripple_color`) is
 * a choice, white by default.
 */
export const CURSOR_LOOKS = ["dark", "light", "custom"];
export const DEFAULT_CURSOR_COLOR = "#3b82f6";
export const DEFAULT_RIPPLE_COLOR = "#ffffff";

const INK = "#18181b";
const WHITE = "#ffffff";

export const isHex = (v) => /^#[0-9a-f]{6}$/i.test(String(v || ""));

const rgbOf = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Relative luminance, 0 for black to 1 for white (WCAG). */
function luminance(hex) {
  const [r, g, b] = rgbOf(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Which of the three looks a cursor's `theme` means. */
export function cursorLookName(theme) {
  if (theme === "light" || theme === "system") return "light";
  if (theme === "custom") return "custom";
  return "dark";
}

/** The pointer's { fill, line }. */
export function cursorColors(cur) {
  const look = cursorLookName(cur?.theme);
  if (look === "light") return { fill: WHITE, line: INK };
  if (look === "custom") {
    const fill = isHex(cur?.color) ? cur.color : DEFAULT_CURSOR_COLOR;
    return { fill, line: luminance(fill) > 0.5 ? INK : WHITE };
  }
  return { fill: INK, line: WHITE };
}

/** The ripple's colour as "r, g, b", for an rgba() carrying the ripple's own fade. */
export function rippleRgb(cur) {
  return rgbOf(isHex(cur?.ripple_color) ? cur.ripple_color : DEFAULT_RIPPLE_COLOR).join(", ");
}

/**
 * ── THE HAND ─────────────────────────────────────────────────────────────────
 * The classic pointing hand, the one every desktop draws over a link: index
 * finger up, the other three curled beside it with a line between each, the
 * thumb out to the left, a cuff at the wrist. Laid out from the fingertip,
 * which is the hotspot, in units of the cursor's size `s`. traceHand is the
 * outline (fill it, then stroke it); traceHandDetail strokes the lines
 * between the fingers.
 *
 * It is drawn over the hand burnt into the recording, from the same hotspot,
 * so it has to COVER that one, and that is what sets the knuckles' height:
 * Windows' hand has them five to seven pixels below its fingertip, and a
 * taller finger leaves them showing beside ours, more so the larger ours is
 * drawn. At these heights, measured against aero_link.cur from 1.15x to 1.8x
 * size, at most one of its 261 pixels shows, and only against our outline.
 */
export function traceHand(ctx, s) {
  const p = (x, y) => [x * s, y * s];
  ctx.beginPath();
  ctx.moveTo(...p(-0.13, 0.56));
  // The index finger, round-topped a little above the hotspot so the real
  // fingertip's own outline is under ours.
  ctx.lineTo(...p(-0.13, 0.06));
  ctx.quadraticCurveTo(...p(-0.13, -0.07), ...p(0, -0.07));
  ctx.quadraticCurveTo(...p(0.13, -0.07), ...p(0.13, 0.06));
  // Middle, ring and little fingers, each knuckle a step lower.
  ctx.lineTo(...p(0.13, 0.27));
  ctx.quadraticCurveTo(...p(0.13, 0.18), ...p(0.205, 0.18));
  ctx.quadraticCurveTo(...p(0.28, 0.18), ...p(0.28, 0.27));
  ctx.quadraticCurveTo(...p(0.28, 0.22), ...p(0.355, 0.22));
  ctx.quadraticCurveTo(...p(0.43, 0.22), ...p(0.43, 0.31));
  ctx.quadraticCurveTo(...p(0.43, 0.28), ...p(0.5, 0.28));
  ctx.quadraticCurveTo(...p(0.57, 0.28), ...p(0.57, 0.37));
  // Down the outside of the hand into the cuff.
  ctx.lineTo(...p(0.57, 0.7));
  ctx.quadraticCurveTo(...p(0.57, 0.86), ...p(0.47, 0.94));
  ctx.lineTo(...p(0.47, 1.04));
  ctx.lineTo(...p(-0.03, 1.04));
  ctx.lineTo(...p(-0.03, 0.94));
  // The thumb, out to the left and back into the base of the finger.
  ctx.quadraticCurveTo(...p(-0.13, 0.86), ...p(-0.24, 0.72));
  ctx.quadraticCurveTo(...p(-0.33, 0.61), ...p(-0.35, 0.55));
  ctx.quadraticCurveTo(...p(-0.36, 0.47), ...p(-0.28, 0.47));
  ctx.quadraticCurveTo(...p(-0.2, 0.48), ...p(-0.13, 0.56));
  ctx.closePath();
}

export function traceHandDetail(ctx, s) {
  const line = (x0, y0, x1, y1) => {
    ctx.beginPath();
    ctx.moveTo(x0 * s, y0 * s);
    ctx.lineTo(x1 * s, y1 * s);
    ctx.stroke();
  };
  line(0.13, 0.27, 0.13, 0.38);
  line(0.28, 0.27, 0.28, 0.42);
  line(0.43, 0.31, 0.43, 0.47);
}

const cursorLook = {
  CURSOR_LOOKS, DEFAULT_CURSOR_COLOR, DEFAULT_RIPPLE_COLOR,
  isHex, cursorLookName, cursorColors, rippleRgb, traceHand, traceHandDetail,
};
export default cursorLook;

/**
 * cursorLook.mjs: the colours the drawn pointer and its click ripple are
 * painted in. Shared by the editor's preview (Preview.js) and the export
 * (backend services/studio/render/overlay.js), for the same reason camera.mjs
 * and follow.mjs are: a pointer one colour in the editor and another in the
 * file is an export nobody previewed.
 *
 * Three looks: Dark, the default; Light; and the creator's own colour
 * (`color`), edged with a very thin black line. The creator's calls, in
 * order: a normal black border made an orange pointer read as not quite the
 * colour picked; one in the colour itself left no edge at all and did not
 * look good either; a hairline of black does both.
 * A demo may still carry a look that no longer exists: "system" was the light
 * arrow, and ring, dot and none draw as the default.
 *
 * The ripple is drawn on every click and only its colour (`ripple_color`) is
 * a choice, white by default.
 */
export const CURSOR_LOOKS = ["dark", "light", "custom"];
export const DEFAULT_CURSOR_COLOR = "#3b82f6";
export const DEFAULT_RIPPLE_COLOR = "#ffffff";
/**
 * How big the drawn pointer is, as a multiple of the one in the recording,
 * when the creator has not chosen: 1.8 (the creator's call, 2026-09-28; it
 * was 1.35). Larger than 1 on purpose: ours has to cover the one burnt into
 * the recording.
 */
export const DEFAULT_CURSOR_SIZE = 1.8;

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

/** The outline and finger lines of Dark and Light, as fractions of the size. */
const EDGE = { lineW: 0.055, lineMin: 1, detailW: 0.04, detailMin: 0.8 };
/** ...and the hairline a colour gets. */
const HAIRLINE = { lineW: 0.02, lineMin: 0.6, detailW: 0.018, detailMin: 0.5 };

/**
 * The pointer's colours: `fill` its body, `line` its outline and `detail` the
 * lines between the hand's fingers; and how thick those two are drawn, at
 * size s, Math.max(lineMin, s * lineW) and Math.max(detailMin, s * detailW).
 */
export function cursorColors(cur) {
  const look = cursorLookName(cur?.theme);
  if (look === "light") return { fill: WHITE, line: INK, detail: INK, ...EDGE };
  if (look === "custom") {
    const fill = isHex(cur?.color) ? cur.color.toLowerCase() : DEFAULT_CURSOR_COLOR;
    // A near-black colour against a black hairline would have no edge.
    const line = luminance(fill) < 0.04 ? WHITE : "#000000";
    return { fill, line, detail: line, ...HAIRLINE };
  }
  return { fill: INK, line: WHITE, detail: WHITE, ...EDGE };
}

/** The ripple's colour as "r, g, b", for an rgba() carrying the ripple's own fade. */
export function rippleRgb(cur) {
  return rgbOf(isHex(cur?.ripple_color) ? cur.ripple_color : DEFAULT_RIPPLE_COLOR).join(", ");
}

/**
 * ── THE HAND ─────────────────────────────────────────────────────────────────
 * The classic pointing hand, the one every desktop draws over a link: index
 * finger up, the other three curled beside it with a line between each, the
 * thumb out to the left, and the palm rounded off underneath in one smooth
 * curve (the creator's reference; a square wrist cuff read as clunky). Laid out from the fingertip,
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
  // Down the outside, then one smooth curve round the heel of the palm.
  ctx.lineTo(...p(0.57, 0.6));
  ctx.bezierCurveTo(...p(0.57, 0.86), ...p(0.4, 1.02), ...p(0.16, 1.02));
  ctx.bezierCurveTo(...p(0.0, 1.02), ...p(-0.1, 0.95), ...p(-0.19, 0.83));
  // The thumb, out to the left and back into the base of the finger.
  ctx.lineTo(...p(-0.31, 0.64));
  ctx.quadraticCurveTo(...p(-0.37, 0.53), ...p(-0.3, 0.48));
  ctx.quadraticCurveTo(...p(-0.22, 0.44), ...p(-0.13, 0.56));
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
  CURSOR_LOOKS, DEFAULT_CURSOR_COLOR, DEFAULT_RIPPLE_COLOR, DEFAULT_CURSOR_SIZE,
  isHex, cursorLookName, cursorColors, rippleRgb, traceHand, traceHandDetail,
};
export default cursorLook;

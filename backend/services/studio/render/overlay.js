/**
 * overlay.js: the cursor layer, rendered frame by frame.
 *
 * ── WHY A CANVAS AND NOT MORE FFMPEG FILTERS ─────────────────────────────────
 * The cursor, its outline, its glow, its trail and the click ripples are vector
 * drawing. FFmpeg can draw a box and it can draw a string; a soft-edged pointer
 * with an outline, following a path and scaling with a zoom, is either
 * impossible in a filter graph or a `geq` expression nobody will ever be able
 * to change. A canvas does all of it in a few lines each, at a quality the
 * filter graph could not reach, and the result is one ordinary video input to
 * the main render.
 *
 * ── THE LAYER IS DRAWN IN OUTPUT SPACE, AFTER THE CAMERA ─────────────────────
 * Every position in the timeline is a fraction of the SOURCE frame. Here each
 * one is projected through the camera rect for that exact frame, so a cursor
 * inside a 2× zoom is drawn twice as large in the place the zoom put it, and an
 * arrow pointing at a button follows that button as the camera moves. Drawing
 * before the zoom instead would let ffmpeg magnify the cursor's own pixels, and
 * a 2× blown-up 24-pixel arrow is a smear.
 *
 * ── NO PNG SEQUENCE ──────────────────────────────────────────────────────────
 * Frames go straight down a pipe into ffmpeg as raw RGBA. A three minute demo
 * at 60 fps is 10,800 frames; on disk that is 10,800 files and several
 * gigabytes, and the writing costs more than the drawing. ffmpeg consumes them
 * as fast as it encodes, so backpressure sets the rate and nothing has to guess
 * it. The encode is QuickTime RLE, which is lossless, carries a real alpha
 * channel, and compresses a mostly-empty layer to almost nothing.
 *
 * ── COVERING THE REAL CURSOR ─────────────────────────────────────────────────
 * The pointer in the recording is burnt into the pixels — the browser gives no
 * way to capture a screen without it, and no way to erase it afterwards that
 * does not leave a smudge. So the synthetic cursor is drawn slightly LARGER
 * than the captured one, at the position the tracker recovered, and covers it.
 * That is why `size` defaults above 1 and why it scales with the zoom: at 1.0,
 * or at a fixed size inside a 2× zoom, the original peeks out from under ours
 * on every fast move.
 */


import { createCanvas } from "@napi-rs/canvas";
import { ffmpegFromFrames } from "../../media/ffmpeg.js";
import { cursorAt, layout, EASE } from "../timeline.js";
import { cameraAtOutput } from "./camera.js";

/** How long a click ripple lives. */
const RIPPLE = 0.5;
/** Trail samples kept behind the pointer, at full rate. */
const TRAIL_STEPS = 14;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ease = EASE.smooth;

/** Cursor themes: fill, outline, and whether to draw the arrow at all. */
const THEMES = {
  system: { fill: "#ffffff", line: "#1a1a1a", arrow: true },
  light: { fill: "#ffffff", line: "#18181b", arrow: true },
  dark: { fill: "#18181b", line: "#ffffff", arrow: true },
  ring: { fill: "rgba(255,255,255,0.14)", line: "#ffffff", arrow: false },
  dot: { fill: "#ffffff", line: "rgba(0,0,0,0.45)", arrow: false },
  none: null,
};

/* ────────────────────────────────────────────────────────────────────────────
   The animated layer
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Render the cursor and annotation layer to a QuickTime RLE file with alpha.
 *
 * @param {object} o
 * @param {object} o.timeline
 * @param {Array}  o.keys        camera keys, from cameraKeys()
 * @param {number} o.width       the video layer's size, matching zoompan's output
 * @param {number} o.height
 * @param {number} o.fps
 * @param {number} o.duration    of the OUTPUT, in seconds
 * @param {string} o.dest
 * @returns {Promise<{ drawn: number, frames: number }>} null when nothing would be drawn
 */
export async function renderOverlay({ timeline, keys, width, height, fps, duration, dest, onProgress = () => {} }) {
  const lay = layout(timeline);
  const theme = THEMES[timeline.cursor?.theme || "light"];
  const wantCursor = timeline.cursor?.enabled !== false && theme && timeline.track?.length > 0;

  const clicks = clickMarks(timeline, lay);
  if (!wantCursor && !clicks.length) return null;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const total = Math.max(1, Math.round(duration * fps));
  const cur = timeline.cursor || {};

  // The pointer's own pixel size at source scale, before zoom and before the
  // creator's size setting. 22px is a macOS arrow; Windows is within a pixel.
  const baseCursorPx = 22 * (width / Math.max(1, timeline.source?.width || width));

  let drawn = 0;

  await ffmpegFromFrames(
    [
      "-an",
      // qtrle: lossless, real alpha, and a layer that is 98% transparent
      // costs almost nothing to store. VP9 with alpha would be smaller and
      // is far slower to encode than this whole render can afford.
      "-c:v", "qtrle", "-pix_fmt", "argb",
      dest,
    ],
    {
      width, height, fps, pixelFormat: "rgba",
      write: async (push) => {
        for (let i = 0; i < total; i++) {
          const t = i / fps;
          const cam = cameraAtOutput(keys, t);
          const srcT = sourceAt(lay, t);

          ctx.clearRect(0, 0, width, height);
          let any = false;

          for (const c of clicks) {
            if (t >= c.t && t <= c.t + RIPPLE && cur.ripple !== false) {
              drawRipple(ctx, c, t, cam, width, height, baseCursorPx);
              any = true;
            }
          }

          if (wantCursor) {
            const p = cursorAt(timeline.track, srcT);
            if (p) {
              const pt = projectPoint(p, cam, width, height);
              // Off the edge of the camera: there is nothing to cover and
              // nothing to point at, so nothing is drawn.
              if (pt.x > -80 && pt.y > -80 && pt.x < width + 80 && pt.y < height + 80) {
                if (cur.trail > 0) drawTrail(ctx, timeline.track, srcT, cam, width, height, cur, theme);
                drawCursor(ctx, pt, cam, cur, theme, baseCursorPx, p.shape);
                any = true;
              }
            }
          }

          if (any) drawn++;
          await push(Buffer.from(ctx.getImageData(0, 0, width, height).data.buffer));
          if (i % 30 === 0) onProgress(i / total);
        }
      },
    }
  );

  return { drawn, frames: total };
}

/** Which moment of the recording an output moment came from. */
function sourceAt(lay, t) {
  for (const s of lay.segments) {
    if (t >= s.out_start && t <= s.out_end) return s.src_start + (t - s.out_start);
  }
  return lay.segments.length ? lay.segments[lay.segments.length - 1].src_end : 0;
}

/** Clicks, in output time, with the ones inside a cut dropped. */
function clickMarks(tl, lay) {
  const out = [];
  for (const e of tl.events || []) {
    if (e.type !== "click" && e.type !== "dblclick") continue;
    if (e.confidence < 0.5) continue;
    for (const span of lay.segments) {
      if (e.t >= span.src_start && e.t <= span.src_end) {
        out.push({ t: span.out_start + (e.t - span.src_start), x: e.x, y: e.y, double: e.type === "dblclick" });
        break;
      }
    }
  }
  return out;
}

/** A source-frame fraction, as a pixel of the output frame, under the camera. */
function projectPoint(p, cam, W, H) {
  return { x: ((p.x - cam.x) / cam.w) * W, y: ((p.y - cam.y) / cam.h) * H };
}

/* ────────────────────────────────────────────────────────────────────────────
   The pointer
   ──────────────────────────────────────────────────────────────────────────── */

function drawCursor(ctx, pt, cam, cur, theme, basePx, shape) {
  // Scales with the zoom because the captured pointer does. A synthetic cursor
  // held at a constant size inside a 2× zoom sits in the middle of a pointer
  // twice its size, which looks exactly like the bug it is.
  const zoom = clamp(1 / cam.w, 1, 3);
  const size = basePx * (cur.size || 1.35) * Math.min(zoom, 2.2);

  ctx.save();
  ctx.translate(pt.x, pt.y);

  if (cur.glow > 0) {
    const r = size * 1.9;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(255,255,255,${0.30 * cur.glow})`);
    g.addColorStop(0.55, `rgba(255,255,255,${0.10 * cur.glow})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // A soft drop shadow is what separates the pointer from a light interface.
  // Without it a white arrow on a white dialog disappears, which is the single
  // most common complaint about screen recordings.
  ctx.shadowColor = "rgba(0,0,0,0.34)";
  ctx.shadowBlur = size * 0.36;
  ctx.shadowOffsetY = size * 0.08;

  if (!theme.arrow) {
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = theme.fill;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.lineWidth = Math.max(1.5, size * 0.09);
    ctx.strokeStyle = theme.line;
    ctx.stroke();
  } else if (shape === "text" || shape === "ibeam") {
    drawIBeam(ctx, size, theme);
  } else if (shape === "pointer" || shape === "hand") {
    drawHand(ctx, size, theme);
  } else {
    drawArrow(ctx, size, theme);
  }

  ctx.restore();
}

/**
 * The arrow, drawn from its tip.
 *
 * The path is in units of the cursor's own size so one set of numbers serves
 * every resolution. The proportions are the standard pointer everyone's eye
 * already knows; a "designed" cursor reads as a watermark.
 */
function drawArrow(ctx, s, theme) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, s * 1.02);
  ctx.lineTo(s * 0.25, s * 0.78);
  ctx.lineTo(s * 0.42, s * 1.16);
  ctx.lineTo(s * 0.57, s * 1.09);
  ctx.lineTo(s * 0.40, s * 0.72);
  ctx.lineTo(s * 0.70, s * 0.70);
  ctx.closePath();
  ctx.fillStyle = theme.fill;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = Math.max(1, s * 0.055);
  ctx.lineJoin = "round";
  ctx.strokeStyle = theme.line;
  ctx.stroke();
}

/**
 * The hand, for anything the OS considered clickable.
 *
 * The path below is drawn from the shape's top-left, but the HOTSPOT of a hand
 * cursor — the pixel the operating system considers "where the pointer is" — is
 * the tip of the extended finger. Without the shift, the ripple from a click
 * appeared up and to the left of the finger that made it, and the synthetic
 * cursor sat a few pixels off the captured one it is meant to cover.
 */
function drawHand(ctx, s, theme) {
  const u = s * 0.055;
  ctx.translate(-s * 0.34, 0);
  ctx.beginPath();
  ctx.moveTo(s * 0.30, 0);
  ctx.quadraticCurveTo(s * 0.44, 0, s * 0.44, u * 2.6);
  ctx.lineTo(s * 0.44, s * 0.52);
  ctx.lineTo(s * 0.52, s * 0.46);
  ctx.quadraticCurveTo(s * 0.68, s * 0.40, s * 0.72, s * 0.56);
  ctx.lineTo(s * 0.80, s * 0.98);
  ctx.quadraticCurveTo(s * 0.84, s * 1.28, s * 0.58, s * 1.34);
  ctx.lineTo(s * 0.34, s * 1.34);
  ctx.quadraticCurveTo(s * 0.16, s * 1.32, s * 0.10, s * 1.10);
  ctx.lineTo(s * 0.02, s * 0.74);
  ctx.quadraticCurveTo(s * 0.0, s * 0.56, s * 0.16, s * 0.58);
  ctx.lineTo(s * 0.24, s * 0.64);
  ctx.lineTo(s * 0.24, u * 2.6);
  ctx.quadraticCurveTo(s * 0.24, 0, s * 0.30, 0);
  ctx.closePath();
  ctx.fillStyle = theme.fill;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = Math.max(1, s * 0.055);
  ctx.lineJoin = "round";
  ctx.strokeStyle = theme.line;
  ctx.stroke();
}

/** The text caret, for anything over an input. */
function drawIBeam(ctx, s, theme) {
  const w = Math.max(2, s * 0.13);
  ctx.strokeStyle = theme.fill;
  ctx.lineWidth = w;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.62);
  ctx.lineTo(0, s * 0.62);
  ctx.moveTo(-s * 0.2, -s * 0.62);
  ctx.lineTo(s * 0.2, -s * 0.62);
  ctx.moveTo(-s * 0.2, s * 0.62);
  ctx.lineTo(s * 0.2, s * 0.62);
  ctx.stroke();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = w * 0.45;
  ctx.stroke();
}

/**
 * The trail: where the pointer has just been, fading out behind it.
 *
 * Off by default. It reads as speed on a fast move and as a mess on a slow one,
 * and most demos are slow moves, so it is something a creator turns on for a
 * particular recording rather than something every demo gets.
 */
function drawTrail(ctx, track, srcT, cam, W, H, cur, theme) {
  const step = 0.016;
  ctx.save();
  for (let k = TRAIL_STEPS; k > 0; k--) {
    const p = cursorAt(track, srcT - k * step);
    if (!p) continue;
    const pt = projectPoint(p, cam, W, H);
    const a = (1 - k / TRAIL_STEPS) * 0.35 * cur.trail;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, Math.max(1.5, 5 * (1 - k / TRAIL_STEPS) * clamp(1 / cam.w, 1, 2.2)), 0, Math.PI * 2);
    ctx.fillStyle = theme.fill;
    ctx.fill();
  }
  ctx.restore();
}

/**
 * The click ripple: a ring that expands and fades from where the click landed.
 *
 * This is the one effect that does real work rather than decoration. A click in
 * a screen recording is invisible — the button changes colour for 80
 * milliseconds and the viewer misses it — and the ripple is what tells them
 * something was pressed, and where.
 */
function drawRipple(ctx, c, t, cam, W, H, basePx) {
  const k = clamp((t - c.t) / RIPPLE, 0, 1);
  const pt = projectPoint(c, cam, W, H);
  const zoom = clamp(1 / cam.w, 1, 3);
  const r = basePx * (0.5 + ease(k) * 2.6) * Math.min(zoom, 2.2);
  const alpha = (1 - k) * 0.75;

  ctx.save();
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(2, basePx * 0.16 * (1 - k * 0.6));
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.shadowColor = `rgba(0,0,0,${alpha * 0.5})`;
  ctx.shadowBlur = 6;
  ctx.stroke();

  // A filled flash at the moment of contact, gone within a sixth of a second.
  if (k < 0.3) {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, basePx * 0.55 * (1 - k / 0.3), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${(1 - k / 0.3) * 0.4})`;
    ctx.fill();
  }
  ctx.restore();

  if (c.double) {
    const k2 = clamp((t - c.t - 0.09) / RIPPLE, 0, 1);
    if (k2 > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, basePx * (0.5 + ease(k2) * 2.6) * Math.min(zoom, 2.2), 0, Math.PI * 2);
      ctx.lineWidth = Math.max(1.5, basePx * 0.12);
      ctx.strokeStyle = `rgba(255,255,255,${(1 - k2) * 0.5})`;
      ctx.stroke();
      ctx.restore();
    }
  }
}

export default { renderOverlay };

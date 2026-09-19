/**
 * overlay.js: everything drawn ON the picture, rendered frame by frame.
 *
 * ── WHY A CANVAS AND NOT MORE FFMPEG FILTERS ─────────────────────────────────
 * The cursor, its glow and trail, click ripples, arrows, rounded tooltip
 * bubbles and a spotlight mask are vector drawing with text in it. FFmpeg can
 * draw a box and it can draw a string; everything else on that list is either
 * impossible or a `geq` expression nobody will ever be able to change. A canvas
 * does all of it in a few lines each, at a quality the filter graph could not
 * reach, and the result is one ordinary video input to the main render.
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
import path from "path";
import { fileURLToPath } from "url";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { ffmpegFromFrames } from "../../media/ffmpeg.js";
import { cursorAt, placedSpans, layout, EASE } from "../timeline.js";
import { cameraAtOutput } from "./camera.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.resolve(process.env.EDIT_FONTS_DIR || path.join(HERE, "..", "..", "..", "assets", "fonts"));

let fontsReady = false;
/**
 * The annotation font. Registered once per process; a second call is a no-op.
 * The same Noto family the captions use, so a tooltip and a caption in Telugu
 * are the same letterforms rather than two different fallbacks.
 */
function ensureFonts() {
  if (fontsReady) return "Noto Sans";
  for (const file of ["NotoSans-Bold.ttf", "NotoSansDevanagari-Bold.ttf", "NotoSansTelugu-Bold.ttf", "NotoSansTamil-Bold.ttf", "NotoSansBengali-Bold.ttf"]) {
    try { GlobalFonts.registerFromPath(path.join(FONTS_DIR, file)); } catch { /* absent is survivable: the fallback still draws Latin */ }
  }
  fontsReady = true;
  return "Noto Sans";
}

/** How long an annotation takes to appear and to go. */
const FADE = 0.22;
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
  const font = ensureFonts();
  const lay = layout(timeline);
  const theme = THEMES[timeline.cursor?.theme || "light"];
  const wantCursor = timeline.cursor?.enabled !== false && theme && timeline.track?.length > 0;

  const notes = placedSpans(timeline.notes || [], lay);
  const clicks = clickMarks(timeline, lay);
  if (!wantCursor && !notes.length && !clicks.length) return null;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const total = Math.max(1, Math.round(duration * fps));
  const cur = timeline.cursor || {};

  // The pointer's own pixel size at source scale, before zoom and before the
  // creator's size setting. 22px is a macOS arrow; Windows is within a pixel.
  const baseCursorPx = 22 * (width / Math.max(1, timeline.source?.width || width));

  // ── EVERY ANNOTATION SIZE IS AGAINST THE FRAME, NOT AGAINST PIXELS ───────
  // Tooltip text, stroke weights and padding were all in raw pixels, which made
  // them correct at 1080p and half the size they should be at 4K: the same
  // design drawn on four times the area. `ui` is the frame's height against the
  // 1080 reference every one of those numbers was chosen for.
  const ui = height / 1080;

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

          // Spotlight first: it darkens everything, including anything drawn
          // before it, so it has to be under the rest of the layer.
          for (const n of notes) {
            if (n.kind === "spotlight" && t >= n.start - FADE && t <= n.end + FADE) {
              drawSpotlight(ctx, n, t, cam, width, height);
              any = true;
            }
          }

          for (const c of clicks) {
            if (t >= c.t && t <= c.t + RIPPLE && cur.ripple !== false) {
              drawRipple(ctx, c, t, cam, width, height, baseCursorPx);
              any = true;
            }
          }

          for (const n of notes) {
            if (n.kind === "spotlight") continue;
            if (t >= n.start - FADE && t <= n.end + FADE) {
              drawNote(ctx, n, t, cam, width, height, font, ui);
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

function projectRect(r, cam, W, H) {
  const a = projectPoint({ x: r.x, y: r.y }, cam, W, H);
  const b = projectPoint({ x: r.x + r.w, y: r.y + r.h }, cam, W, H);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

/** Opacity at the edges of a span, so nothing snaps on or off. */
function fadeAt(t, start, end) {
  if (t < start) return ease(clamp((t - (start - FADE)) / FADE, 0, 1));
  if (t > end) return 1 - ease(clamp((t - end) / FADE, 0, 1));
  return 1;
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

/* ────────────────────────────────────────────────────────────────────────────
   Annotations
   ──────────────────────────────────────────────────────────────────────────── */

const ACCENT = "#2A7C13";
const INK = "#0f1115";

function drawNote(ctx, n, t, cam, W, H, font, ui = 1) {
  const alpha = fadeAt(t, n.start, n.end);
  if (alpha <= 0.01) return;
  const r = projectRect(n, cam, W, H);
  const color = n.color || ACCENT;
  // Resolution first, then a gentle growth under zoom. The zoom term is capped
  // well below the camera's own factor on purpose: a label is a fixed piece of
  // interface sitting on top of the video, not part of the picture being
  // magnified, so at 3x it should be a little larger and not three times larger.
  const scale = ui * clamp(1 / cam.w, 1, 1.5);

  ctx.save();
  ctx.globalAlpha = alpha;

  if (n.kind === "circle") drawCircle(ctx, r, color, scale, t, n);
  else if (n.kind === "underline") drawUnderline(ctx, r, color, scale);
  else if (n.kind === "arrow") drawArrowNote(ctx, r, n, color, scale, W, H, font, alpha);
  else drawTooltip(ctx, r, n, color, scale, W, H, font);

  ctx.restore();
}

function drawCircle(ctx, r, color, scale, t, n) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  // A slow pulse, one cycle a second, so a ring that sits for three seconds
  // still reads as "look here" rather than as part of the interface.
  const pulse = 1 + Math.sin((t - n.start) * Math.PI * 2) * 0.02;
  ctx.beginPath();
  ctx.ellipse(cx, cy, (r.w / 2 + 10 * scale) * pulse, (r.h / 2 + 8 * scale) * pulse, 0, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(2.5, 5 * scale);
  ctx.strokeStyle = color;
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 8 * scale;
  ctx.stroke();
}

function drawUnderline(ctx, r, color, scale) {
  const y = r.y + r.h + 5 * scale;
  ctx.beginPath();
  ctx.moveTo(r.x, y);
  ctx.lineTo(r.x + r.w, y);
  ctx.lineWidth = Math.max(3, 6 * scale);
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 6 * scale;
  ctx.stroke();
}

/**
 * The spotlight: everything except the subject, darkened.
 *
 * Drawn as a full-frame fill with the subject punched out using
 * destination-out, rather than as four rectangles around it, because four
 * rectangles cannot have a soft edge and a hard-edged spotlight looks like a
 * rendering error.
 */
function drawSpotlight(ctx, n, t, cam, W, H) {
  const alpha = fadeAt(t, n.start, n.end);
  if (alpha <= 0.01) return;
  const r = projectRect(n, cam, W, H);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const rad = Math.max(r.w, r.h) * 0.75 + 30;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(6,8,12,0.62)";
  ctx.fillRect(0, 0, W, H);

  ctx.globalCompositeOperation = "destination-out";
  const g = ctx.createRadialGradient(cx, cy, rad * 0.62, cx, cy, rad);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * A label in a bubble, placed beside the thing it names.
 *
 * The side is chosen from where there is room, not from the model's suggestion
 * alone: an annotation the model anchored "top" on an element at the top of the
 * screen has to go below or it is drawn off the frame.
 */
function drawTooltip(ctx, r, n, color, scale, W, H, font) {
  const pad = 15 * scale;
  const fs = Math.round(clamp(30 * scale, 18, H * 0.055));
  ctx.font = `600 ${fs}px "${font}", sans-serif`;
  const lines = wrapText(ctx, n.text, Math.min(W * 0.4, 520 * scale));
  const lh = fs * 1.32;
  const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2;
  const bh = lines.length * lh + pad * 1.5;

  const place = choosePlacement(n.anchor, r, bw, bh, W, H, 16 * scale);
  const { x, y, side } = place;

  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 20 * scale;
  ctx.shadowOffsetY = 5 * scale;
  roundRect(ctx, x, y, bw, bh, 12 * scale);
  ctx.fillStyle = "rgba(255,255,255,0.97)";
  ctx.fill();
  ctx.shadowColor = "transparent";

  // The accent bar is what ties the bubble to the annotation colour without
  // tinting the text background, which would cost the label its legibility.
  ctx.fillStyle = color;
  roundRect(ctx, x, y, 4.5 * scale, bh, 3 * scale);
  ctx.fill();

  drawPointer(ctx, place, r, color);

  ctx.fillStyle = INK;
  ctx.textBaseline = "top";
  lines.forEach((line, i) => ctx.fillText(line, x + pad + 4 * scale, y + pad * 0.72 + i * lh));
  void side;
}

/** The little triangle joining a bubble to its subject. */
function drawPointer(ctx, place, r, color) {
  const { x, y, w, h, side, scale = 1 } = place;
  const s = 9 * scale;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  ctx.beginPath();
  if (side === "bottom") {
    const px = clamp(cx, x + 16, x + w - 16);
    ctx.moveTo(px - s, y);
    ctx.lineTo(px + s, y);
    ctx.lineTo(px, y - s);
  } else if (side === "top") {
    const px = clamp(cx, x + 16, x + w - 16);
    ctx.moveTo(px - s, y + h);
    ctx.lineTo(px + s, y + h);
    ctx.lineTo(px, y + h + s);
  } else if (side === "right") {
    const py = clamp(cy, y + 16, y + h - 16);
    ctx.moveTo(x, py - s);
    ctx.lineTo(x, py + s);
    ctx.lineTo(x - s, py);
  } else {
    const py = clamp(cy, y + 16, y + h - 16);
    ctx.moveTo(x + w, py - s);
    ctx.lineTo(x + w, py + s);
    ctx.lineTo(x + w + s, py);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,0.97)";
  ctx.fill();
  void color;
}

function choosePlacement(anchor, r, bw, bh, W, H, gap) {
  const fits = {
    bottom: { x: clamp(r.x + r.w / 2 - bw / 2, 12, W - bw - 12), y: r.y + r.h + gap, ok: r.y + r.h + gap + bh < H - 12 },
    top: { x: clamp(r.x + r.w / 2 - bw / 2, 12, W - bw - 12), y: r.y - gap - bh, ok: r.y - gap - bh > 12 },
    right: { x: r.x + r.w + gap, y: clamp(r.y + r.h / 2 - bh / 2, 12, H - bh - 12), ok: r.x + r.w + gap + bw < W - 12 },
    left: { x: r.x - gap - bw, y: clamp(r.y + r.h / 2 - bh / 2, 12, H - bh - 12), ok: r.x - gap - bw > 12 },
  };
  const order = anchor && anchor !== "auto" ? [anchor, "bottom", "top", "right", "left"] : ["bottom", "top", "right", "left"];
  for (const side of order) {
    const f = fits[side];
    if (f?.ok) return { ...f, w: bw, h: bh, side, scale: gap / 16 };
  }
  return { x: clamp(r.x, 12, W - bw - 12), y: clamp(r.y + r.h + gap, 12, H - bh - 12), w: bw, h: bh, side: "bottom", scale: gap / 16 };
}

/**
 * A curved arrow into the target, with its label at the tail.
 *
 * Curved rather than straight because a straight line from a label to a button
 * reads as a table rule; a curve reads as a gesture. The control point is
 * offset perpendicular to the run, so the bow is always on the outside.
 */
function drawArrowNote(ctx, r, n, color, scale, W, H, font, alpha) {
  const tx = r.x + r.w / 2;
  const ty = r.y + r.h / 2;
  const len = 165 * scale;
  const fromRight = tx < W / 2;
  const sx = fromRight ? tx + r.w / 2 + len : tx - r.w / 2 - len;
  const sy = ty + (ty < H / 2 ? len * 0.55 : -len * 0.55);

  const ex = tx + (fromRight ? r.w / 2 + 12 * scale : -(r.w / 2 + 12 * scale));
  const ey = ty;
  const mx = (sx + ex) / 2;
  const my = (sy + ey) / 2 + (fromRight ? -1 : 1) * len * 0.3;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3, 5.5 * scale);
  ctx.lineCap = "round";
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 8 * scale;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo(mx, my, ex, ey);
  ctx.stroke();

  // The head is aimed along the curve's own tangent at the end point, which is
  // the direction from the control point, not from the start.
  const ang = Math.atan2(ey - my, ex - mx);
  const head = 20 * scale;
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - head * Math.cos(ang - 0.42), ey - head * Math.sin(ang - 0.42));
  ctx.lineTo(ex - head * Math.cos(ang + 0.42), ey - head * Math.sin(ang + 0.42));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();

  if (n.text) {
    const fs = Math.round(clamp(30 * scale, 18, H * 0.055));
    ctx.font = `600 ${fs}px "${font}", sans-serif`;
    const lines = wrapText(ctx, n.text, 360 * scale);
    const pad = 12 * scale;
    const lh = fs * 1.3;
    const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2;
    const bh = lines.length * lh + pad * 1.4;
    const bx = clamp(sx - (fromRight ? 0 : bw), 12, W - bw - 12);
    const by = clamp(sy - bh / 2, 12, H - bh - 12);

    ctx.globalAlpha = alpha;
    ctx.shadowColor = "rgba(0,0,0,0.32)";
    ctx.shadowBlur = 18 * scale;
    roundRect(ctx, bx, by, bw, bh, 11 * scale);
    ctx.fillStyle = "rgba(255,255,255,0.97)";
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = INK;
    ctx.textBaseline = "top";
    lines.forEach((line, i) => ctx.fillText(line, bx + pad, by + pad * 0.7 + i * lh));
  }
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

function wrapText(ctx, text, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

export default { renderOverlay };

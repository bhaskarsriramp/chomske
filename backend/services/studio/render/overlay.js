/**
 * overlay.js: the cursor layer, rendered frame by frame.
 *
 * ── WHY A CANVAS AND NOT MORE FFMPEG FILTERS ─────────────────────────────────
 * The cursor, its outline, its glow and the click ripples are vector
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
import { cursorAt, layout, drawnTrack, EASE } from "../timeline.js";
import { cameraAtOutput } from "./camera.js";
import { cursorColors, rippleRgb, traceHand, traceHandDetail, DEFAULT_CURSOR_SIZE } from "../../../../src/components/Studio/cursorLook.mjs";

/** How long a click ripple lives. */
const RIPPLE = 0.5;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ease = EASE.smooth;

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
  // Dark, Light or the creator's colour, and the ripple's: the same as the
  // editor draws them (cursorLook.mjs).
  const look = cursorColors(timeline.cursor);
  const rippleColor = rippleRgb(timeline.cursor);
  const path = drawnTrack(timeline);
  const wantCursor = !!path && path.length > 0;

  const clicks = clickMarks(timeline, lay);
  if (!wantCursor && !clicks.length) return null;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const total = Math.max(1, Math.round(duration * fps));
  const cur = timeline.cursor || {};

  /**
   * The captured pointer's own size, which is what ours has to beat.
   *
   * 22px is a macOS arrow at 100%, and Windows is within a pixel of it — but a
   * creator on a scaled display records a cursor half again as big, and nothing
   * in the recording says so. sync.js measures it off the frames. Never smaller
   * than the old assumption: under-measuring would draw a pointer that does not
   * cover the one underneath, which is the whole job.
   */
  const capturedPx = Math.max(22, Number(timeline.cursor?.captured_px) || 22);
  const baseCursorPx = capturedPx * (width / Math.max(1, timeline.source?.width || width));

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
            if (t >= c.t && t <= c.t + RIPPLE) {
              drawRipple(ctx, c, t, cam, width, height, baseCursorPx, rippleColor);
              any = true;
            }
          }

          if (wantCursor) {
            const p = cursorAt(path, srcT);
            if (p) {
              const pt = projectPoint(p, cam, width, height);
              // Off the edge of the camera: there is nothing to cover and
              // nothing to point at, so nothing is drawn.
              if (pt.x > -80 && pt.y > -80 && pt.x < width + 80 && pt.y < height + 80) {
                drawCursor(ctx, pt, cam, cur, look, baseCursorPx, p.shape);
                any = true;
              }
            }
          }

          if (any) drawn++;
          await push(Buffer.from(ctx.getImageData(0, 0, width, height).data.buffer));
          if (i % 30 === 0) onProgress(i / total);

          /**
           * ── THIS LINE IS WHY THE SITE STAYS UP DURING AN EXPORT ─────────────
           * push() resolves immediately whenever ffmpeg's stdin has room, and
           * awaiting a promise that is already resolved does NOT give the event
           * loop a turn — it only runs other microtasks. Timers, sockets and
           * every incoming HTTP request wait. So for as long as ffmpeg kept up,
           * this loop drew frame after frame without the server answering
           * anything, and the whole site timed out in the browser while an
           * export ran: "This site can't be reached", ERR_TIMED_OUT.
           *
           * Measured: three hundred frames of work awaiting resolved promises
           * served zero requests; the same loop yielding here served them all
           * and took two per cent longer.
           */
          await new Promise((r) => setImmediate(r));
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
    // A ripple says "this was pressed". A press the camera was told to ignore —
    // a hover, a tap on empty space, a rest while the page scrolled — must not
    // say it either, or the viewer sees a click the demo just decided never
    // happened. undefined means a demo analysed before the gate existed.
    if (e.zoomable === false) continue;
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

function drawCursor(ctx, pt, cam, cur, look, basePx, shape) {
  // Scales with the zoom because the captured pointer does. A synthetic cursor
  // held at a constant size inside a 2× zoom sits in the middle of a pointer
  // twice its size, which looks exactly like the bug it is.
  const zoom = clamp(1 / cam.w, 1, 3);
  const size = basePx * (cur.size || DEFAULT_CURSOR_SIZE) * Math.min(zoom, 2.2);

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

  /**
   * ── TWO POINTERS, BOTH OURS ───────────────────────────────────────────────
   * A hand over anything clickable, an arrow everywhere else. That is the
   * gesture people already read, and following it is what makes a hover legible
   * in a demo without an annotation pointing at it.
   *
   * What it is NOT is the operating system's set. The OS draws four or five
   * shapes and swaps between them per frame, and the captured one is twenty
   * pixels of unstyleable bitmap. Both of these are drawn here, in the look
   * the creator chose, at the size they chose, from matching paths — and the
   * shape they follow has already been decided over a window in timeline.js
   * smoothTrack, so a steady hover cannot flicker between the two.
   */
  if (shape === "pointer" || shape === "hand") {
    drawHand(ctx, size, look);
  } else {
    drawArrow(ctx, size, look);
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
function drawArrow(ctx, s, look) {
  // The tip sits a hair up and left of the hotspot. A point placed exactly on
  // it leaves the real arrow’s own corner pixel showing; this is under a pixel
  // at any size a demo is drawn at, and it closes that gap.
  ctx.translate(-s * 0.03, -s * 0.03);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, s * 1.02);
  ctx.lineTo(s * 0.25, s * 0.78);
  ctx.lineTo(s * 0.42, s * 1.16);
  ctx.lineTo(s * 0.57, s * 1.09);
  ctx.lineTo(s * 0.40, s * 0.72);
  ctx.lineTo(s * 0.70, s * 0.70);
  ctx.closePath();
  ctx.fillStyle = look.fill;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = Math.max(look.lineMin, s * look.lineW);
  ctx.lineJoin = "round";
  ctx.strokeStyle = look.line;
  ctx.stroke();
}

/**
 * The hand: the classic pointing hand, from the fingertip (the hotspot). Its
 * outline and the lines between its fingers are cursorLook.mjs traceHand and
 * traceHandDetail, shared with the editor's preview, which says why the
 * knuckles sit where they do.
 */
function drawHand(ctx, s, look) {
  traceHand(ctx, s);
  ctx.fillStyle = look.fill;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = look.line;
  ctx.lineWidth = Math.max(look.lineMin, s * look.lineW);
  ctx.stroke();
  // The lines between the fingers, a little finer than the outline.
  ctx.strokeStyle = look.detail;
  ctx.lineWidth = Math.max(look.detailMin, s * look.detailW);
  traceHandDetail(ctx, s);
}

/**
 * The click ripple: a ring that expands and fades from where the click landed.
 *
 * This is the one effect that does real work rather than decoration. A click in
 * a screen recording is invisible — the button changes colour for 80
 * milliseconds and the viewer misses it — and the ripple is what tells them
 * something was pressed, and where.
 */
function drawRipple(ctx, c, t, cam, W, H, basePx, rgb) {
  const k = clamp((t - c.t) / RIPPLE, 0, 1);
  const pt = projectPoint(c, cam, W, H);
  const zoom = clamp(1 / cam.w, 1, 3);
  const r = basePx * (0.5 + ease(k) * 2.6) * Math.min(zoom, 2.2);
  const alpha = (1 - k) * 0.75;

  ctx.save();
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(2, basePx * 0.16 * (1 - k * 0.6));
  ctx.strokeStyle = `rgba(${rgb},${alpha})`;
  ctx.shadowColor = `rgba(0,0,0,${alpha * 0.5})`;
  ctx.shadowBlur = 6;
  ctx.stroke();

  // A filled flash at the moment of contact, gone within a sixth of a second.
  if (k < 0.3) {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, basePx * 0.55 * (1 - k / 0.3), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${rgb},${(1 - k / 0.3) * 0.4})`;
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
      ctx.strokeStyle = `rgba(${rgb},${(1 - k2) * 0.5})`;
      ctx.stroke();
      ctx.restore();
    }
  }
}

export default { renderOverlay };

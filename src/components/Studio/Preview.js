/**
 * Preview.js: the edit, playing, before anything has been rendered.
 *
 * ── THERE IS NO FILE TO PLAY ─────────────────────────────────────────────────
 * The edit changes on every drag, so there is nothing rendered to show. What
 * plays is the 540p copy of the raw recording, with the camera, the blur, the
 * cursor and the annotations drawn over it live, from the same arithmetic the
 * renderer uses (model.js). A creator dragging a zoom handle sees the result of
 * the drag in the same frame they let go on.
 *
 * ── CANVAS FOR THE PICTURE, HTML FOR THE WORDS ───────────────────────────────
 * The zoom, the blur and the cursor are drawn on a canvas, because the zoom IS
 * a source rectangle passed to drawImage and doing it any other way would mean
 * re-deriving it. Captions are HTML on top, because they
 * are text that has to be legible, selectable and draggable, and because the
 * browser's text layout is better than anything worth writing here.
 *
 * That makes the preview CLOSE to the export and not identical to it: the same
 * pixels, the same positions, the same easing, the browser's own glyphs. The
 * export is the one that is right.
 *
 * ── PLAYBACK WALKS THE CUTS ──────────────────────────────────────────────────
 * Output time is derived from the video element's own clock, never from a
 * timer, so a stalled network pauses the playhead instead of letting it run
 * ahead of the picture. When the clock enters a cut, the element is seeked past
 * it. That is why a cut can be added mid-playback and simply takes effect.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  layout, toSource, toOutputSnapped, cameraAt, cursorAt, drawnTrack, videoBox, backgroundCss,
  placedSpans, placedCues, captionPoint, captionLook, clamp, EASE,
} from "./model";
import { useBox } from "./ui";
import Skeleton from "../Shell/Skeleton";

/** How long a click ripple lives. Matches overlay.js. */
const RIPPLE = 0.5;

export default function Preview({
  tl,
  proxyUrl,
  playing,
  onPlayingChange,
  time = 0,
  onTime,
  seekTo = null,
  selection = null,
  onSelect,
  onChange,
  showChrome = true,
  // "center" puts the frame in the middle of the space it is given; "top"
  // pins it to the top edge, so leftover height gathers below it rather than
  // opening a gap under the header.
  align = "center",
  // The signed URL of an uploaded background image, when the canvas uses one.
  backgroundUrl = "",
}) {
  const wrapRef = useRef(null);
  // The background image, once loaded. A ref, not state: the frame loop below
  // runs every animation frame and simply picks it up on the next one.
  const bgImgRef = useRef(null);
  useEffect(() => {
    bgImgRef.current = null;
    if (!backgroundUrl) return undefined;
    const img = new Image();
    let live = true;
    img.onload = () => {
      if (live) bgImgRef.current = img;
    };
    img.src = backgroundUrl;
    return () => {
      live = false;
    };
  }, [backgroundUrl]);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const box = useBox(wrapRef);
  const [ready, setReady] = useState(false);

  const lay = useMemo(() => layout(tl), [tl]);
  const cues = useMemo(() => placedCues(tl, lay), [tl, lay]);
  const blurs = useMemo(() => placedSpans(tl.blurs || [], lay), [tl, lay]);
  const clicks = useMemo(() => clickMarks(tl, lay), [tl, lay]);

  const srcW = tl.source?.width || 1920;
  const srcH = tl.source?.height || 1080;
  const vb = useMemo(
    () => videoBox({ aspect: tl.canvas?.aspect, sourceWidth: srcW, sourceHeight: srcH, padding: tl.canvas?.padding }),
    [tl.canvas?.aspect, tl.canvas?.padding, srcW, srcH]
  );

  /* ── The frame the preview is drawn into ─────────────────────────────── */
  const [AW, AH] = ASPECT_OF(tl.canvas?.aspect, srcW, srcH);
  const ar = AW / AH;
  let fw = box.w;
  let fh = box.w / ar;
  if (box.h > 0 && fh > box.h) {
    fh = box.h;
    fw = box.h * ar;
  }

  /* ── Playback ────────────────────────────────────────────────────────── */
  const timeRef = useRef(time);
  timeRef.current = time;

  // Seeks are requested by changing `seekTo`, not by driving `time`, so the
  // playhead can follow the video during playback without every frame of it
  // being read back as a seek request.
  /**
   * ── A SEEK IS AN EVENT, NOT A STATE ────────────────────────────────────────
   * This effect used to depend on the layout as well as the request, and the
   * layout is rebuilt on every edit. So every edit re-ran the LAST seek: drag
   * the cursor Size slider and the video jumped back to wherever the creator
   * had last clicked the ruler — to a moment with no pointer in it, which read
   * as "the cursor disappears when I change its size". It runs now only when a
   * new request arrives; the layout it needs is read, not depended on.
   */
  const layRef = useRef(lay);
  layRef.current = lay;
  const durRef = useRef(tl.duration || 0);
  durRef.current = tl.duration || 0;

  useEffect(() => {
    const v = videoRef.current;
    const at = seekTo && typeof seekTo === "object" ? seekTo.t : seekTo;
    if (!v || at == null || !Number.isFinite(at)) return;
    v.currentTime = clamp(toSource(at, layRef.current), 0, Math.max(0, durRef.current - 0.05));
  }, [seekTo]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) {
      // Playback stops itself a hair before the end of the edit rather than at
      // the end of the file, so the element never reports "ended" and play()
      // would resume at the last frame and stop again at once. Pressing Play at
      // the end means "watch it again".
      const lay2 = layRef.current;
      if (toOutputSnapped(v.currentTime, lay2) >= lay2.duration - 0.1) v.currentTime = toSource(0, lay2);
      v.play().catch(() => onPlayingChange?.(false));
    } else v.pause();
  }, [playing, onPlayingChange]);

  /* ── The frame loop ──────────────────────────────────────────────────── */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const v = videoRef.current;
    if (!canvas || !v) return;

    const W = canvas.width;
    const H = canvas.height;
    if (!W || !H) return;
    const ctx = canvas.getContext("2d");

    // Where in the OUTPUT we are, from the element's own clock.
    const srcT = v.currentTime;
    const outT = toOutputSnapped(srcT, lay);
    const cam = cameraAt(tl, srcT, { track: drawnTrack(tl) });

    // ── The ground ──────────────────────────────────────────────────────
    paintBackground(ctx, tl.canvas, W, H, bgImgRef.current);

    // ── The picture ─────────────────────────────────────────────────────
    const dx = vb.x * W;
    const dy = vb.y * H;
    const dw = vb.w * W;
    const dh = vb.h * H;
    const radius = Math.round((tl.canvas?.radius ?? 0) * (H / 1080));

    ctx.save();
    roundRect(ctx, dx, dy, dw, dh, radius);
    if ((tl.canvas?.shadow ?? 0) > 0.01) {
      ctx.shadowColor = `rgba(0,0,0,${0.55 * (tl.canvas?.shadow ?? 0)})`;
      ctx.shadowBlur = 38 * (H / 1080) + 14;
      ctx.shadowOffsetY = 16 * (H / 1080);
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.shadowColor = "transparent";
    }
    ctx.clip();

    if (v.readyState >= 2) {
      // The zoom IS this call: the camera rect, in the source's own pixels, as
      // drawImage's source rectangle. No transform, no second buffer.
      const sx = cam.x * v.videoWidth;
      const sy = cam.y * v.videoHeight;
      const sw = Math.max(1, cam.w * v.videoWidth);
      const sh = Math.max(1, cam.h * v.videoHeight);
      ctx.drawImage(v, sx, sy, sw, sh, dx, dy, dw, dh);

      // ── The pointer the recording came with ──────────────────────────
      // The exporter reconstructs it away with ffmpeg's delogo (render/hide.js).
      // A canvas cannot do that, but it can smear the same rectangle, which
      // looks close enough that what the editor shows and what comes out of the
      // export are the same edit. Without it the preview shows two pointers and
      // the finished file does not.
      // Only when the drawn path is somewhere the captured one is not.
      if (tl.cursor?.mode === "intent" && tl.cursor?.hide_real !== false && (tl.captured || []).length > 1) {
        paintHide(ctx, v, tl, srcT, cam, { dx, dy, dw, dh }, srcW, srcH);
      }

      // ── Blur, on top of the picture and inside the clip ──────────────
      for (const b of blurs) {
        if (outT < b.start || outT > b.end) continue;
        paintBlur(ctx, v, b, cam, { dx, dy, dw, dh });
      }
    } else {
      ctx.fillStyle = "#0B0D14";
      ctx.fillRect(dx, dy, dw, dh);
    }

    // ── The cursor and its ripples ──────────────────────────────────────
    for (const c of clicks) {
      if (outT >= c.t && outT <= c.t + RIPPLE && tl.cursor?.ripple !== false) {
        paintRipple(ctx, c, outT, cam, { dx, dy, dw, dh }, srcW, tl.cursor);
      }
    }
    const drawnPath = drawnTrack(tl);
    if (tl.cursor?.theme !== "none" && drawnPath?.length) {
      const p = cursorAt(drawnPath, srcT);
      if (p) paintCursor(ctx, p, cam, tl.cursor, { dx, dy, dw, dh }, srcW);
    }

    ctx.restore();

    if (onTime && Math.abs(outT - timeRef.current) > 0.012) onTime(outT);

    // Playback stops at the end of the OUTPUT, which is not the end of the
    // recording when the last thing in it was cut.
    if (!v.paused) {
      const cut = cutAt(lay, srcT);
      if (cut) v.currentTime = Math.min(cut.end + 0.001, tl.duration || cut.end);
      else if (outT >= lay.duration - 0.05) {
        v.pause();
        onPlayingChange?.(false);
      }
    }
  }, [tl, lay, vb, blurs, clicks, srcW, srcH, onTime, onPlayingChange]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  /* ── Canvas sizing ───────────────────────────────────────────────────── */
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !fw || !fh) return;
    // Capped at 2: beyond that a 4K screen redraws eight million pixels per
    // frame to show a preview nobody is inspecting at that scale.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(fw * dpr);
    canvas.height = Math.round(fh * dpr);
  }, [fw, fh]);

  /* ── What is on screen right now, for the HTML layer ─────────────────── */
  const cue = cues.find((c) => time >= c.start && time <= c.end) || null;
  const srcT = toSource(time, lay);
  const cam = cameraAt(tl, srcT, { track: drawnTrack(tl) });

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", flex: 1, minHeight: 0, display: "grid", placeItems: align === "top" ? "start center" : "center", overflow: "hidden" }}
    >
      <video
        ref={videoRef}
        src={proxyUrl || undefined}
        playsInline
        preload="auto"
        onLoadedMetadata={() => setReady(true)}
        onEnded={() => onPlayingChange?.(false)}
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
      />

      <div style={{ position: "relative", width: fw || 0, height: fh || 0 }}>
        <canvas
          ref={canvasRef}
          style={{ display: "block", width: "100%", height: "100%", borderRadius: 10, background: "#07080C" }}
        />

        {/* ── Captions ──────────────────────────────────────────────────
            HTML so the text is the browser's own, and so a line can be
            dragged where it should sit rather than typed as a number. */}
        {cue && <CaptionLine tl={tl} cue={cue} frame={{ w: fw, h: fh }} onChange={onChange} selected={selection?.kind === "cue" && selection.id === cue.id} onSelect={onSelect} />}

        {/* ── Editing handles ───────────────────────────────────────── */}
        {selection && onChange && (
          <RectHandle tl={tl} selection={selection} time={time} cam={cam} vb={vb} frame={{ w: fw, h: fh }} onChange={onChange} />
        )}

        {/* The frame pulses while the video loads, rather than carrying the
            words "Loading the recording…", grey on near-black. */}
        {showChrome && !ready && (
          <div role="status" aria-label="Loading the recording" style={{ position: "absolute", inset: 0 }}>
            <Skeleton variant="rectangular" width="100%" height="100%" style={{ borderRadius: 10, backgroundColor: "#1B1D24" }} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Painting
   ──────────────────────────────────────────────────────────────────────────── */

const ASPECTS = { "16:9": [1920, 1080], "9:16": [1080, 1920], "1:1": [1080, 1080], "4:5": [1080, 1350] };
const ASPECT_OF = (a, sw, sh) => ASPECTS[a] || (a === "source" && sw > 0 && sh > 0 ? [sw, sh] : ASPECTS["16:9"]);

function paintBackground(ctx, design, W, H, image = null) {
  const bg = design?.background || { kind: "none" };
  ctx.clearRect(0, 0, W, H);
  if (bg.kind === "image") {
    // Exactly as frame.js draws it for the export: cover, centred, then a 28%
    // dark veil so the interface on top stays the brightest thing. Black until
    // the image has loaded, which is also what the export does without one.
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    if (image?.width) {
      const ar = image.width / image.height;
      let iw = W;
      let ih = W / ar;
      if (ih < H) {
        ih = H;
        iw = H * ar;
      }
      ctx.drawImage(image, (W - iw) / 2, (H - ih) / 2, iw, ih);
      ctx.fillStyle = "rgba(8,10,14,0.28)";
      ctx.fillRect(0, 0, W, H);
    }
    return;
  }
  if (bg.kind === "none") {
    ctx.fillStyle = "#000";
  } else if (bg.kind === "solid") {
    ctx.fillStyle = /^#[0-9a-f]{6}$/i.test(bg.value) ? bg.value : "#12141a";
  } else {
    const css = backgroundCss(bg);
    const stops = css.match(/#[0-9a-f]{6}/gi) || ["#1b2735", "#2d3f52", "#0f1720"];
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, stops[0]);
    g.addColorStop(0.55, stops[1] || stops[0]);
    g.addColorStop(1, stops[2] || stops[0]);
    ctx.fillStyle = g;
  }
  ctx.fillRect(0, 0, W, H);
}

/**
 * One blur region, drawn over the picture.
 *
 * ── IT MUST NEVER SILENTLY DO NOTHING ────────────────────────────────────────
 * This is the control a creator uses to decide whether an API key is safe to
 * publish. `ctx.filter` is not in every browser, so where it is missing the
 * region is pixelated through a small offscreen canvas instead — which always
 * works. A blur that quietly renders as nothing would tell somebody their
 * secret was covered when it was not.
 */
let scratch = null;
/**
 * Smear over the captured pointer, the way the export reconstructs it away.
 *
 * Skipped wherever the drawn pointer is already standing on it: our own is a
 * third larger from the same hotspot, so it covers a small displacement, and
 * smearing there would take the label underneath with it for nothing. Mirrors
 * render/hide.js needed().
 */
function paintHide(ctx, video, tl, srcT, cam, d, srcW, srcH) {
  const p = cursorAt(tl.captured, srcT);
  if (!p) return;
  const drawn = cursorAt(drawnTrack(tl) || tl.track, srcT);
  const px = Math.max(12, tl.cursor?.captured_px || 22);
  if (drawn && Math.hypot((drawn.x - p.x) * srcW, (drawn.y - p.y) * srcH) <= Math.max(6, px * 0.35)) return;

  // The same rectangle the exporter uses: a pointer hangs down and right of its
  // hotspot, so this is not centred on it.
  const bx = (p.x * srcW - px * 0.6) / srcW;
  const by = (p.y * srcH - px * 0.15) / srcH;
  const bw = (px * 1.37) / srcW;
  const bh = (px * 1.55) / srcH;

  const x = ((bx - cam.x) / cam.w) * d.dw + d.dx;
  const y = ((by - cam.y) / cam.h) * d.dh + d.dy;
  const w = (bw / cam.w) * d.dw;
  const h = (bh / cam.h) * d.dh;
  if (w < 1 || h < 1) return;
  if (x > d.dx + d.dw || y > d.dy + d.dh || x + w < d.dx || y + h < d.dy) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  // Drawing the whole picture again, blurred, through that little window. The
  // blur is scaled to the patch so a zoomed-in preview smears by the same
  // amount of PICTURE rather than the same number of screen pixels.
  ctx.filter = `blur(${Math.max(2, w * 0.55).toFixed(1)}px)`;
  const sx = cam.x * video.videoWidth;
  const sy = cam.y * video.videoHeight;
  const sw = Math.max(1, cam.w * video.videoWidth);
  const sh = Math.max(1, cam.h * video.videoHeight);
  ctx.drawImage(video, sx, sy, sw, sh, d.dx, d.dy, d.dw, d.dh);
  ctx.filter = "none";
  ctx.restore();
}

function paintBlur(ctx, video, b, cam, d) {
  // The region, in the source's fractions, through the camera, into the frame.
  const x = ((b.x - cam.x) / cam.w) * d.dw + d.dx;
  const y = ((b.y - cam.y) / cam.h) * d.dh + d.dy;
  const w = (b.w / cam.w) * d.dw;
  const h = (b.h / cam.h) * d.dh;
  if (w < 1 || h < 1) return;
  if (x > d.dx + d.dw || y > d.dy + d.dh || x + w < d.dx || y + h < d.dy) return;

  if (b.kind === "box") {
    ctx.save();
    ctx.fillStyle = "#000";
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    return;
  }

  const sx = b.x * video.videoWidth;
  const sy = b.y * video.videoHeight;
  const sw = Math.max(1, b.w * video.videoWidth);
  const sh = Math.max(1, b.h * video.videoHeight);

  const canBlur = typeof ctx.filter === "string";
  if (b.kind === "blur" && canBlur) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.filter = `blur(${Math.max(3, Math.min(w, h) * 0.18 * (b.strength ?? 0.8))}px)`;
    // Drawn slightly larger than the region so the blur kernel has pixels to
    // reach for at the edges; without it every blur has a sharp, readable rim.
    ctx.drawImage(video, sx, sy, sw, sh, x - w * 0.12, y - h * 0.12, w * 1.24, h * 1.24);
    ctx.filter = "none";
    ctx.restore();
    return;
  }

  const blocks = Math.max(3, Math.round(10 * (b.strength ?? 0.8)));
  if (!scratch) scratch = document.createElement("canvas");
  const tw = Math.max(2, Math.round(w / blocks));
  const th = Math.max(2, Math.round(h / blocks));
  scratch.width = tw;
  scratch.height = th;
  const sc = scratch.getContext("2d");
  sc.drawImage(video, sx, sy, sw, sh, 0, 0, tw, th);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch, 0, 0, tw, th, x, y, w, h);
  ctx.restore();
}

function paintCursor(ctx, p, cam, cur, d, srcW) {
  const x = ((p.x - cam.x) / cam.w) * d.dw + d.dx;
  const y = ((p.y - cam.y) / cam.h) * d.dh + d.dy;
  if (x < d.dx - 60 || y < d.dy - 60 || x > d.dx + d.dw + 60 || y > d.dy + d.dh + 60) return;

  const zoom = clamp(1 / cam.w, 1, 3);
  const s = Math.max(22, Number(cur?.captured_px) || 22) * (d.dw / srcW) * (cur?.size || 1.35) * Math.min(zoom, 2.2);
  const dark = cur?.theme === "dark";
  const fill = dark ? "#18181b" : "#fff";
  const line = dark ? "#fff" : "#18181b";

  ctx.save();
  ctx.translate(x, y);

  if (cur?.glow > 0) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 1.9);
    g.addColorStop(0, `rgba(255,255,255,${0.3 * cur.glow})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, s * 1.9, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.shadowColor = "rgba(0,0,0,.34)";
  ctx.shadowBlur = s * 0.36;
  ctx.shadowOffsetY = s * 0.08;

  if (cur?.theme === "ring" || cur?.theme === "dot") {
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = cur.theme === "ring" ? "rgba(255,255,255,.14)" : fill;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.lineWidth = Math.max(1.5, s * 0.09);
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    // ── TWO POINTERS, BOTH OURS ─────────────────────────────────────────────
    // Hand over anything clickable, arrow everywhere else — the gesture people
    // already read. Neither is the system's: those are twenty unstyleable
    // pixels and there are four of them. The shape was settled over a window in
    // timeline.js smoothTrack, so a steady hover cannot flicker between the
    // two. Mirrors render/overlay.js drawCursor.
  } else if (p.shape === "pointer" || p.shape === "hand") {
    // Laid out from the fingertip, which is the hotspot: no offset needed.
    handPath(ctx, s);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.lineWidth = Math.max(1, s * 0.055);
    ctx.lineJoin = "round";
    ctx.strokeStyle = line;
    ctx.stroke();
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(0.8, s * 0.04);
    handDetail(ctx, s);
  } else {
    // Same sub-pixel tip margin as overlay.js drawArrow.
    ctx.translate(-s * 0.03, -s * 0.03);
    arrowPath(ctx, s);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.lineWidth = Math.max(1, s * 0.055);
    ctx.lineJoin = "round";
    ctx.strokeStyle = line;
    ctx.stroke();
  }
  ctx.restore();
}

function arrowPath(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, s * 1.02);
  ctx.lineTo(s * 0.25, s * 0.78);
  ctx.lineTo(s * 0.42, s * 1.16);
  ctx.lineTo(s * 0.57, s * 1.09);
  ctx.lineTo(s * 0.4, s * 0.72);
  ctx.lineTo(s * 0.7, s * 0.7);
  ctx.closePath();
}

/** The hand, matching render/overlay.js drawHand. Laid out from its box; the
 *  caller shifts it so the fingertip lands on the pointer's real position. */
/** A pointing hand. Mirrors render/overlay.js drawHand exactly. */
// Same outline and detail as overlay.js drawHand — see the note there.
function handPath(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(s * -0.15, s * 0.34);
  ctx.lineTo(s * -0.15, s * 0.02);
  ctx.quadraticCurveTo(s * -0.15, s * -0.08, s * 0.005, s * -0.08);
  ctx.quadraticCurveTo(s * 0.16, s * -0.08, s * 0.16, s * 0.02);
  ctx.lineTo(s * 0.16, s * 0.27);
  ctx.quadraticCurveTo(s * 0.17, s * 0.19, s * 0.235, s * 0.19);
  ctx.quadraticCurveTo(s * 0.31, s * 0.19, s * 0.31, s * 0.28);
  ctx.quadraticCurveTo(s * 0.32, s * 0.24, s * 0.38, s * 0.24);
  ctx.quadraticCurveTo(s * 0.45, s * 0.24, s * 0.45, s * 0.33);
  ctx.quadraticCurveTo(s * 0.46, s * 0.3, s * 0.515, s * 0.3);
  ctx.quadraticCurveTo(s * 0.58, s * 0.3, s * 0.58, s * 0.4);
  ctx.lineTo(s * 0.58, s * 0.7);
  ctx.quadraticCurveTo(s * 0.58, s * 0.86, s * 0.47, s * 0.95);
  ctx.lineTo(s * 0.47, s * 1.04);
  ctx.lineTo(s * -0.06, s * 1.04);
  ctx.lineTo(s * -0.06, s * 0.93);
  ctx.quadraticCurveTo(s * -0.2, s * 0.84, s * -0.3, s * 0.66);
  ctx.quadraticCurveTo(s * -0.37, s * 0.5, s * -0.3, s * 0.38);
  ctx.quadraticCurveTo(s * -0.24, s * 0.31, s * -0.15, s * 0.34);
  ctx.closePath();
}

function handDetail(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(s * 0.16, s * 0.27);
  ctx.lineTo(s * 0.16, s * 0.44);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(s * 0.31, s * 0.28);
  ctx.lineTo(s * 0.31, s * 0.46);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(s * 0.45, s * 0.33);
  ctx.lineTo(s * 0.45, s * 0.48);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(s * -0.15, s * 0.4);
  ctx.quadraticCurveTo(s * -0.12, s * 0.52, s * 0, s * 0.6);
  ctx.stroke();
}


function paintRipple(ctx, c, t, cam, d, srcW, cur) {
  const k = clamp((t - c.t) / RIPPLE, 0, 1);
  const x = ((c.x - cam.x) / cam.w) * d.dw + d.dx;
  const y = ((c.y - cam.y) / cam.h) * d.dh + d.dy;
  const base = Math.max(22, Number(cur?.captured_px) || 22) * (d.dw / srcW) * Math.min(clamp(1 / cam.w, 1, 3), 2.2);
  const r = base * (0.5 + EASE.smooth(k) * 2.6);

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(2, base * 0.16 * (1 - k * 0.6));
  ctx.strokeStyle = `rgba(255,255,255,${(1 - k) * 0.75})`;
  ctx.stroke();
  if (k < 0.3) {
    ctx.beginPath();
    ctx.arc(x, y, base * 0.55 * (1 - k / 0.3), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${(1 - k / 0.3) * 0.4})`;
    ctx.fill();
  }
  ctx.restore();
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

/* ────────────────────────────────────────────────────────────────────────────
   The HTML layer
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * One caption line, placed where the renderer will place it and draggable.
 *
 * Dragging writes to that line's own `custom.x/y` rather than to the whole
 * track, because "this one line collides with the interface" is the actual
 * complaint, and moving every caption to fix one is not the fix.
 */
function CaptionLine({ tl, cue, frame, onChange, selected, onSelect }) {
  const look = captionLook(tl, cue);
  const pt = captionPoint(tl, cue);
  const dragging = useRef(null);

  const size = Math.max(11, look.frac * frame.h);
  const words = String(cue.text || "").split(/(\s+)/);
  const hits = new Set((cue.emphasis || []).flatMap((e) => String(e).toLowerCase().split(/\s+/)).filter(Boolean));

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={(e) => {
        if (!onChange) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = { x: e.clientX, y: e.clientY, px: pt.x, py: pt.y };
        onSelect?.({ kind: "cue", id: cue.id });
      }}
      onPointerMove={(e) => {
        const d = dragging.current;
        if (!d || !frame.w) return;
        const nx = clamp(d.px + (e.clientX - d.x) / frame.w, 0.04, 0.96);
        const ny = clamp(d.py + (e.clientY - d.y) / frame.h, 0.04, 0.96);
        onChange({ kind: "cue", id: cue.id, patch: { custom: { ...(cue.custom || {}), x: nx, y: ny } } });
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        dragging.current = null;
      }}
      onKeyDown={(e) => { if (e.key === "Enter") onSelect?.({ kind: "cue", id: cue.id }); }}
      style={{
        position: "absolute",
        left: `${pt.x * 100}%`,
        top: `${pt.y * 100}%`,
        transform: "translate(-50%,-50%)",
        maxWidth: "84%",
        padding: look.box ? `${size * 0.26}px ${size * 0.5}px` : 0,
        borderRadius: look.box ? size * 0.3 : 0,
        background: look.box ? "rgba(0,0,0,.42)" : "transparent",
        fontSize: size,
        fontWeight: look.weight,
        lineHeight: 1.22,
        letterSpacing: "-0.015em",
        textAlign: "center",
        color: look.color,
        textTransform: look.caps ? "uppercase" : "none",
        textShadow: look.shadow === "none" ? "none" : look.shadow,
        WebkitTextStroke: look.stroke ? `${Math.max(1, size * 0.045)}px ${look.stroke}` : undefined,
        paintOrder: "stroke fill",
        cursor: onChange ? "move" : "default",
        outline: selected ? "1.5px dashed rgba(255,255,255,.55)" : "none",
        outlineOffset: 5,
        userSelect: "none",
        whiteSpace: "pre-wrap",
      }}
    >
      {words.map((w, i) => {
        const bare = w.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
        const on = bare && hits.has(bare);
        return (
          <span key={i} style={on ? { color: look.accent } : undefined}>
            {w}
          </span>
        );
      })}
    </div>
  );
}

/**
 * The rectangle of whatever is selected, draggable on the picture.
 *
 * This is how a blur gets moved and resized. Typing four numbers is not how
 * anybody decides that a rectangle covers an API key; dragging it over the key
 * and watching the key disappear is.
 */
function RectHandle({ tl, selection, time, cam, vb, frame, onChange }) {
  const list = selection.kind === "blur" ? tl.blurs : selection.kind === "zoom" ? tl.zooms : null;
  const item = list?.find((x) => x.id === selection.id);
  const drag = useRef(null);
  if (!item || !frame.w) return null;

  // Only while it is actually on screen: a handle floating over a frame where
  // the thing it belongs to is not visible is a handle that moves the wrong
  // rectangle.
  const visible = selection.kind === "zoom" || (time >= item.start - 0.3 && time <= item.end + 0.3);
  if (!visible) return null;

  const x = ((item.x - cam.x) / cam.w) * vb.w + vb.x;
  const y = ((item.y - cam.y) / cam.h) * vb.h + vb.y;
  const w = (item.w / cam.w) * vb.w;
  const h = (item.h / cam.h) * vb.h;

  const begin = (mode) => (e) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, x: e.clientX, y: e.clientY, item: { ...item } };
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    // Back out of the camera: a drag of ten screen pixels inside a 2× zoom is
    // five pixels of the source, and storing the screen delta would make every
    // edit made while zoomed twice as large as it looked.
    const dx = ((e.clientX - d.x) / frame.w / vb.w) * cam.w;
    const dy = ((e.clientY - d.y) / frame.h / vb.h) * cam.h;
    const it = d.item;
    let patch;
    if (d.mode === "move") {
      patch = { x: clamp(it.x + dx, 0, 1 - it.w), y: clamp(it.y + dy, 0, 1 - it.h) };
    } else {
      const left = d.mode.includes("w");
      const top = d.mode.includes("n");
      const nx = left ? clamp(it.x + dx, 0, it.x + it.w - 0.02) : it.x;
      const ny = top ? clamp(it.y + dy, 0, it.y + it.h - 0.02) : it.y;
      const nw = left ? it.x + it.w - nx : clamp(it.w + dx, 0.02, 1 - it.x);
      const nh = top ? it.y + it.h - ny : clamp(it.h + dy, 0.02, 1 - it.y);
      patch = { x: nx, y: ny, w: nw, h: nh };
    }
    onChange({ kind: selection.kind, id: item.id, patch });
  };
  const end = (e) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    drag.current = null;
  };

  return (
    <div
      className="st-handle"
      onPointerDown={begin("move")}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: `${w * 100}%`,
        height: `${h * 100}%`,
        borderColor: selection.kind === "blur" ? "#FF9482" : "var(--ink)",
      }}
    >
      {["nw", "ne", "sw", "se"].map((k) => (
        <span
          key={k}
          className={`st-handle-knob ${k}`}
          onPointerDown={begin(k)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          style={{ borderColor: selection.kind === "blur" ? "#FF9482" : "var(--ink)" }}
        />
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

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
    for (const s of lay.segments) {
      if (e.t >= s.src_start && e.t <= s.src_end) {
        out.push({ t: s.out_start + (e.t - s.src_start), x: e.x, y: e.y, double: e.type === "dblclick" });
        break;
      }
    }
  }
  return out;
}

function cutAt(lay, srcT) {
  for (let i = 0; i < lay.segments.length - 1; i++) {
    const a = lay.segments[i];
    const b = lay.segments[i + 1];
    if (srcT >= a.src_end - 0.02 && srcT < b.src_start) return { start: a.src_end, end: b.src_start };
  }
  return null;
}

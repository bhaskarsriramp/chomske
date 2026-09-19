/**
 * compose.js: a timeline, turned into a video file.
 *
 * ── THE ORDER IS THE WHOLE DESIGN ────────────────────────────────────────────
 * Each step has to happen in exactly one place in the chain, and getting the
 * order wrong is not a cosmetic bug:
 *
 *   1. CUTS, first, on the source. Everything after this works in OUTPUT time,
 *      which is why nothing downstream has to know cuts exist.
 *   2. BLUR, before the zoom. A blur rectangle is in source coordinates; if it
 *      were applied after the camera it would have to be re-projected per frame,
 *      and a blur that lags the thing it covers by two frames has published the
 *      secret it was there to hide.
 *   3. ZOOM, which also scales the picture down to the size it will occupy.
 *      One step, because zoompan's output size is a parameter (camera.js).
 *   4. CURSOR AND ANNOTATIONS, after the zoom, so they are drawn at output
 *      resolution rather than magnified from the source's pixels.
 *   5. ROUNDED CORNERS AND THE CANVAS, which is also where a 16:9 recording
 *      becomes a 9:16 export.
 *   6. CAPTIONS, on the finished frame, so they sit on the background rather
 *      than inside the inset picture.
 *   7. AUDIO.
 *
 * ── WHY CUTS GET THEIR OWN PASSES ────────────────────────────────────────────
 * One giant filter graph with a `trim` per surviving segment decodes the
 * recording from its first frame once per segment. On a twenty minute demo with
 * forty cuts that is forty full decodes. Cutting each segment with `-ss` on the
 * INPUT seeks instead of decodes, and the concat demuxer joins them by copying.
 * The cost is some disk; the alternative does not finish.
 *
 * A demo with NO cuts skips both passes and the source is used directly, which
 * is the common case for a short demo and saves an entire encode.
 *
 * ── NOTHING IS LEFT OUT QUIETLY ──────────────────────────────────────────────
 * Same rule as the script editor's renderer. A missing font, an overlay that
 * failed to draw, a blur that could not be placed: each one fails the render
 * with a sentence a creator can read, rather than producing a file that looks
 * finished and is missing the thing it was made for. Every finished render
 * records what it actually drew.
 */
import fsp from "fs/promises";
import path from "path";
import { ffmpeg, probe } from "../../media/ffmpeg.js";
import { layout, placedSpans, drewCounts, activeZooms, drawnTrack } from "../timeline.js";
import { cleanExportOptions, crfFor, SPEEDS } from "../exportOptions.js";
import { zoomFilter, cameraKeys } from "./camera.js";
import { renderOverlay } from "./overlay.js";
import { videoBox, radiusFor, drawBackground, drawCornerMask } from "./frame.js";
import { hideFilter } from "./hide.js";
import { buildAss, buildSrt, missingFonts, FONTS_DIR } from "./ass.js";

const userError = (msg) => Object.assign(new Error(msg), { userMessage: msg });

/**
 * Render a demo.
 *
 * @param {object} o
 * @param {object} o.timeline
 * @param {string} o.source      the recording on local disk
 * @param {string} o.workDir     scratch, deleted by the caller
 * @param {string} o.dest
 * @param {object} o.options     export options, already cleaned or not
 * @param {Function} o.onProgress (fraction, stage)
 * @returns {Promise<{ width, height, duration, drew, srt }>}
 */
export async function renderTimeline({ timeline, source, workDir, dest, options = null, onProgress = () => {} }) {
  const o = cleanExportOptions(options, { hevc: options?.codec === "hevc" });
  const lay = layout(timeline);
  if (!(lay.duration > 0.1)) {
    throw userError("There is nothing left in this demo to export. Remove a cut and try again.");
  }

  const src = await probe(source);
  const sourceWidth = src.width || timeline.source?.width || 1920;
  const sourceHeight = src.height || timeline.source?.height || 1080;

  const design = timeline.canvas || {};
  const box = videoBox({
    aspect: o.aspect,
    resolution: o.resolution,
    sourceWidth,
    sourceHeight,
    padding: design.padding ?? 0.06,
  });
  const { W, H } = box;
  const FPS = o.fps;
  const duration = lay.duration;

  // ── Captions, checked before anything is encoded ──────────────────────────
  const { ass, fonts, count: captionCount } = o.captions ? buildAss(timeline, { width: W, height: H }) : { ass: "", fonts: [], count: 0 };
  if (captionCount > 0) {
    const absent = await missingFonts(fonts);
    if (absent.length) {
      console.error(`[studio] render: caption fonts missing in ${FONTS_DIR}: ${absent.join(", ")}`);
      throw userError("Captions can't be drawn because this server is missing its caption fonts. Your credits are back.");
    }
  }

  /* ── Passes 1 & 2: the cuts ──────────────────────────────────────────── */
  let base = source;
  const segments = lay.segments;
  const cut = segments.length > 1 || (segments.length === 1 && (segments[0].src_start > 0.02 || segments[0].src_end < timeline.duration - 0.02));

  if (cut) {
    const files = [];
    let done = 0;
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      const d = s.src_end - s.src_start;
      const out = path.join(workDir, `seg_${String(i).padStart(4, "0")}.mp4`);
      // A short fade on each join. A hard cut between two moments of the same
      // screen recording pops on the audio, and the picture jumps whatever was
      // mid-animation; fifteen milliseconds is inaudible and removes both.
      const fade = Math.min(0.015, d / 4);
      const args = ["-ss", String(s.src_start), "-t", String(d), "-i", source];
      if (!src.has_audio) args.push("-f", "lavfi", "-t", String(d), "-i", "anullsrc=r=48000:cl=stereo");
      args.push(
        "-map", "0:v:0", "-map", src.has_audio ? "0:a:0" : "1:a:0",
        "-vf", `fps=${FPS},setsar=1,format=yuv420p`,
        "-af", `aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,afade=t=in:d=${fade},afade=t=out:st=${Math.max(0, d - fade)}:d=${fade}`,
        "-t", String(d),
        // CRF 16 is a working copy, not the export. It is encoded again in the
        // last pass, and a lossy first pass would show as softened text there.
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-ac", "2",
        "-video_track_timescale", String(FPS * 1000),
        out
      );
      await ffmpeg(args, {
        duration: d,
        onProgress: (p) => onProgress(0.25 * ((done + p * d) / duration), "Trimming"),
      });
      done += d;
      files.push(out);
    }

    onProgress(0.25, "Joining");
    await fsp.writeFile(path.join(workDir, "segments.txt"), files.map((f) => `file '${path.basename(f)}'`).join("\n"));
    base = path.join(workDir, "base.mp4");
    await ffmpeg(["-f", "concat", "-safe", "0", "-i", "segments.txt", "-c", "copy", "base.mp4"], { cwd: workDir });
  }

  /* ── The still layers ─────────────────────────────────────────────────── */
  onProgress(0.28, "Preparing the canvas");
  const bgPath = path.join(workDir, "background.png");
  const maskPath = path.join(workDir, "mask.png");
  const radius = radiusFor(design.radius ?? 18, H);
  await drawBackground({ canvas: design, box, dest: bgPath });
  const rounded = radius > 0;
  if (rounded) await drawCornerMask({ box, radius, dest: maskPath });

  /* ── The animated layer ───────────────────────────────────────────────── */
  const keys = cameraKeys(timeline, { fps: FPS });
  const overlayPath = path.join(workDir, "overlay.mov");
  let overlay = null;
  try {
    overlay = await renderOverlay({
      timeline, keys, width: box.w, height: box.h, fps: FPS, duration,
      dest: overlayPath,
      onProgress: (p) => onProgress(0.28 + 0.22 * p, "Drawing the cursor"),
    });
  } catch (err) {
    console.error("[studio] overlay layer failed:", err);
    throw userError("The cursor and annotations couldn't be drawn for this export. Your credits are back.");
  }

  /* ── Pass 3: everything at once ───────────────────────────────────────── */
  onProgress(0.5, "Rendering");

  const inputs = ["-i", base, "-loop", "1", "-i", bgPath];
  let next = 2;
  const maskIndex = rounded ? next++ : -1;
  if (rounded) inputs.push("-loop", "1", "-i", maskPath);
  const overlayIndex = overlay ? next++ : -1;
  if (overlay) inputs.push("-i", overlayPath);

  const graph = [];
  let v = "0:v";

  // ── 1b. The captured pointer ──────────────────────────────────────────
  /**
   * Before anything else touches the picture, and before the camera, because
   * the path is in the recording's own coordinates. One delogo whose rectangle
   * follows the recovered path; see hide.js for why that is possible at all.
   */
  let hid = null;
  // Only worth reconstructing the captured pointer away when the drawn one is
  // somewhere else. In "recorded" mode it is drawn on top of it and larger.
  if (timeline.cursor?.mode === "intent" && timeline.cursor?.hide_real !== false && (timeline.captured || []).length > 1) {
    hid = hideFilter(timeline.captured, lay, {
      sourceWidth,
      sourceHeight,
      cursorPx: timeline.cursor?.captured_px || 22,
      // The path that WILL be drawn: wherever it already stands over the
      // captured pointer, there is nothing to erase.
      drawn: drawnTrack(timeline),
    });
    if (hid) {
      graph.push(`[${v}]${hid.filter}[vhide]`);
      v = "vhide";
    }
  }

  // ── 2. Blur ───────────────────────────────────────────────────────────
  const blurs = placedSpans(timeline.blurs || [], lay);
  if (blurs.length) {
    graph.push(`[${v}]split=${blurs.length + 1}${blurs.map((_, i) => `[bm${i}]`).join("")}[bsrc]`);
    // The split's LAST output carries the picture forward; the others are each
    // cropped to one region. Named this way round so the chain below reads in
    // the order it runs.
    let carry = "bsrc";
    for (let i = 0; i < blurs.length; i++) {
      const b = blurs[i];
      const x = Math.round(b.x * sourceWidth / 2) * 2;
      const y = Math.round(b.y * sourceHeight / 2) * 2;
      const w = Math.max(2, Math.round((b.w * sourceWidth) / 2) * 2);
      const h = Math.max(2, Math.round((b.h * sourceHeight) / 2) * 2);
      const on = `enable='between(t,${b.start.toFixed(3)},${b.end.toFixed(3)})'`;

      if (b.kind === "box") {
        graph.push(`[${carry}]drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=black@1:t=fill:${on}[bo${i}]`);
        carry = `bo${i}`;
        continue;
      }
      if (b.kind === "pixelate") {
        // Down and back up with nearest neighbour. The block size is a share of
        // the region, so a small field and a whole dialog both come out with
        // blocks large enough to be unreadable and small enough to look
        // deliberate.
        const blocks = Math.max(4, Math.round(10 * b.strength));
        graph.push(
          `[bm${i}]crop=${w}:${h}:${x}:${y},scale=${Math.max(2, Math.round(w / blocks))}:${Math.max(2, Math.round(h / blocks))}:flags=neighbor,scale=${w}:${h}:flags=neighbor,setsar=1[bp${i}]`,
          `[${carry}][bp${i}]overlay=${x}:${y}:${on}[bo${i}]`
        );
      } else {
        // boxblur's radius has to stay inside the region or ffmpeg refuses the
        // filter outright, which is how a blur on a narrow field used to fail
        // the whole export.
        const r = Math.max(2, Math.min(Math.floor(Math.min(w, h) / 2) - 1, Math.round(Math.min(w, h) * 0.12 * b.strength)));
        graph.push(
          `[bm${i}]crop=${w}:${h}:${x}:${y},boxblur=luma_radius=${r}:luma_power=2:chroma_radius=${r}:chroma_power=2,setsar=1[bp${i}]`,
          `[${carry}][bp${i}]overlay=${x}:${y}:${on}[bo${i}]`
        );
      }
      carry = `bo${i}`;
    }
    v = carry;
  }

  // ── 3. Zoom, and the scale into the box ───────────────────────────────
  const zoom = activeZooms(timeline).length
    ? zoomFilter(timeline, { videoWidth: box.w, videoHeight: box.h, sourceWidth, sourceHeight, fps: FPS })
    : null;
  if (zoom) {
    graph.push(`[${v}]${zoom.filters.join(",")}[vz]`);
  } else {
    graph.push(`[${v}]scale=${box.w}:${box.h}:flags=bicubic,setsar=1[vz]`);
  }
  v = "vz";

  // ── 4. Cursor and annotations ─────────────────────────────────────────
  if (overlay) {
    graph.push(
      // The layer is the same size as the picture, so this is a straight
      // composite at the origin. `shortest` is deliberately absent: the layer
      // is exactly as long as the output, and if it were ever a frame short
      // ending the stream there would truncate the export.
      `[${overlayIndex}:v]fps=${FPS},format=rgba,setsar=1[ovl]`,
      `[${v}][ovl]overlay=0:0:format=auto:eof_action=pass[vo]`
    );
    v = "vo";
  }

  // ── 5. Corners, then the canvas ───────────────────────────────────────
  if (rounded) {
    graph.push(
      `[${v}]format=yuva420p[vfa]`,
      `[${maskIndex}:v]format=gray,setsar=1[vmask]`,
      // shortest=1 because the mask is a LOOPED still and therefore an infinite
      // stream. Without it the frame synchroniser waits for an input that never
      // ends and the render stalls at 50% with no error.
      `[vfa][vmask]alphamerge=shortest=1[vrc]`
    );
    v = "vrc";
  }
  graph.push(
    `[1:v]scale=${W}:${H},setsar=1,format=yuv420p[bg]`,
    `[bg][${v}]overlay=${box.x}:${box.y}:format=auto:shortest=1[vframed]`
  );
  v = "vframed";

  // ── 6. Captions ───────────────────────────────────────────────────────
  if (captionCount > 0) {
    await fsp.writeFile(path.join(workDir, "captions.ass"), ass, "utf8");
    await fsp.mkdir(path.join(workDir, "fonts"), { recursive: true });
    for (const f of fonts) await fsp.copyFile(path.join(FONTS_DIR, f), path.join(workDir, "fonts", f));
    // Relative paths with cwd set to the work directory: filter arguments treat
    // ':' and '\' specially, and a Windows path needs escaping that is very
    // easy to get subtly wrong.
    graph.push(`[${v}]ass=captions.ass:fontsdir=fonts[vcap]`);
    v = "vcap";
  }

  // ── 7. Audio ──────────────────────────────────────────────────────────
  const music = (timeline.audio?.music || []).filter((m) => m.start < duration && m.duration > 0.05);
  const voice = Math.max(0, Number(timeline.audio?.voice ?? 1));
  let a = src.has_audio ? "0:a" : null;

  if (a && (voice !== 1 || music.length)) {
    graph.push(`[0:a]volume=${voice.toFixed(2)}[a0]`);
    a = "a0";
  }
  // Music tracks would be extra inputs here. They are accepted by the timeline
  // and the editor, and wiring their files through is the one thing this
  // renderer does not do yet; an export with music silently dropping it would
  // break the rule at the top of this file, so it is refused instead.
  if (music.length) {
    throw userError("Background music isn't in this export yet. Remove the music track and export again.");
  }

  const isGif = o.format === "gif";
  graph.push(`[${v}]format=yuv420p[vout]`);

  // A GIF is made FROM the finished video rather than in the same graph. The
  // one-pass form — split, palettegen on one branch, paletteuse on the other —
  // has to hold every frame of the second branch in memory until palettegen
  // emits its single frame at end of stream. For a minute of 720p that is over
  // a gigabyte of buffered frames, so the render dies on exactly the demos
  // people most want a GIF of.
  const videoOut = isGif ? path.join(workDir, "gifsource.mp4") : dest;

  // ── WHY THE GRAPH GOES IN A FILE ──────────────────────────────────────
  // The pointer-erase expression is one term per recovered sighting, so a two
  // minute demo is tens of kilobytes of filter. Windows will not take a command
  // line that long, and the failure is a truncated argument rather than an
  // error anyone could read.
  await fsp.writeFile(path.join(workDir, "graph.txt"), graph.join(";"), "utf8");
  const args = [...inputs, "-filter_complex_script", "graph.txt", "-map", "[vout]"];
  if (a && !isGif) args.push("-map", a.includes(":") ? a : `[${a}]`);

  if (isGif) {
    args.push("-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p");
  } else if (o.codec === "vp9") {
    args.push("-c:v", "libvpx-vp9", "-crf", String(crfFor(o) + 10), "-b:v", "0", "-row-mt", "1");
  } else {
    args.push(
      "-c:v", o.codec === "hevc" ? "libx265" : "libx264",
      "-preset", SPEEDS[o.speed],
      ...(o.video_mbps ? ["-b:v", `${o.video_mbps}M`, "-maxrate", `${o.video_mbps * 1.5}M`, "-bufsize", `${o.video_mbps * 3}M`] : ["-crf", String(crfFor(o))]),
      "-pix_fmt", "yuv420p",
      "-g", String(FPS * 2),
      ...(o.codec === "hevc" ? ["-tag:v", "hvc1"] : ["-profile:v", "high"])
    );
  }
  if (!isGif) {
    if (a) args.push("-c:a", "aac", "-b:a", `${o.audio_kbps}k`, "-ar", "48000", "-ac", "2");
    else args.push("-an");
    args.push("-movflags", "+faststart");
  }
  args.push("-r", String(FPS), "-t", String(duration), videoOut);

  await ffmpeg(args, {
    cwd: workDir,
    duration,
    onProgress: (p) => onProgress(0.5 + (isGif ? 0.34 : 0.5) * p, "Rendering"),
  });

  if (isGif) {
    // Two real passes. A GIF quantised against the default 216 web-safe colours
    // turns an interface screenshot into banded gradients and grey text; a
    // palette built from this video's own frames keeps it looking like the
    // video it came from.
    const palette = path.join(workDir, "palette.png");
    await ffmpeg(["-i", videoOut, "-vf", `fps=${FPS},scale=${W}:-2:flags=lanczos,palettegen=stats_mode=diff`, palette], {
      duration,
      onProgress: (p) => onProgress(0.84 + 0.06 * p, "Choosing colours"),
    });
    await ffmpeg(
      [
        "-i", videoOut, "-i", palette,
        "-lavfi", `fps=${FPS},scale=${W}:-2:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
        "-loop", "0", dest,
      ],
      { duration, onProgress: (p) => onProgress(0.9 + 0.1 * p, "Writing the GIF") }
    );
  }

  onProgress(1, "Done");

  // ── What actually came out ────────────────────────────────────────────
  const srt = captionCount > 0 ? buildSrt(timeline) : "";
  const drew = {
    ...drewCounts(timeline, lay),
    captions: captionCount,
    overlay_frames: overlay?.drawn || 0,
    hid: hid ? hid.samples : 0,
    hid_seconds: hid ? hid.covered : 0,
    zoom_keys: keys.length,
    supersample: zoom?.supersample || 1,
    format: o.format,
  };

  return { width: W, height: H, duration, drew, srt };
}

/** Which audio label to map, given ffmpeg's naming of a filtered vs raw stream. */
export default { renderTimeline };

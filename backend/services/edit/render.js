/**
 * render.js: turn a timeline into an MP4.
 *
 * ── THREE PASSES, ON PURPOSE ─────────────────────────────────────────────────
 *   1. Every clip is cut from its recording and normalised to one size, frame
 *      rate and audio format. Seeking happens here, per clip, on the input,
 *      which is fast even an hour into a file.
 *   2. The normalised clips are joined with the concat demuxer, copying the
 *      streams. Nothing is re-encoded, because nothing needs to be.
 *   3. One final encode lays the B-roll, captions, text and music over the
 *      joined voice track, at the bitrate, codec and loudness asked for.
 *
 * The alternative, one giant filter graph with a trim per clip, decodes every
 * recording from its first frame for every clip and falls over somewhere past a
 * hundred lines. Three passes cost a little disk and scale to the eight-minute
 * scripts this product writes.
 *
 * An edit with nothing on top (no B-roll, captions, text or music) skips the
 * third picture encode: pass 1 is then made at the export's own quality and the
 * picture is copied, so a plain cut does not pay for two encodes.
 *
 * ── B-ROLL, THREE WAYS ───────────────────────────────────────────────────────
 *   full   the cutaway replaces the picture
 *   split  the cutaway takes one half (or share) and the creator the other
 *   pip    the cutaway sits on the picture at a size and place the creator chose
 * Every cutaway is its own input, seeked to just the stretch it covers. A split
 * reads the joined creator track a SECOND time the same way, seeked to the same
 * stretch, for its pane. Splitting the main stream inside the graph would look
 * simpler and is not: the branch waiting for a cutaway at 1:00 would queue a
 * minute of full-size frames in memory while the other branch caught up.
 *
 * ── CAPTIONS ARE ASS, RENDERED BY LIBASS ─────────────────────────────────────
 * drawtext does not shape complex scripts in most builds: Telugu and Devanagari
 * come out as disconnected letters. libass shapes with HarfBuzz, falls back
 * across fonts per glyph, so "iPhone 17 ధర" renders both halves, and handles
 * outlines, boxes and positioning in one subtitle file. The fonts ship in
 * assets/fonts (Noto, OFL) so the result does not depend on what the server
 * happens to have installed.
 *
 * ── NOTHING IS LEFT OUT QUIETLY ──────────────────────────────────────────────
 * A missing font used to be skipped, and libass then draws nothing: an export
 * that looked finished and had no captions. It now fails, with the credits
 * refunded, and every finished export records what it drew (`drew`).
 */
import fsp from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { ffmpeg } from "../media/ffmpeg.js";
import {
  layout, captionCues, captionPlacement, captionLook, segmentsOf, textPlacement, pipPlacement, splitPanes, buildSrt,
} from "./timeline.js";
import { cleanExportOptions, outputSize, SPEEDS } from "./exportOptions.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FONTS_DIR = path.resolve(process.env.EDIT_FONTS_DIR || path.join(HERE, "..", "..", "assets", "fonts"));

const userError = (msg) => Object.assign(new Error(msg), { userMessage: msg });

const SCRIPT_FONTS = [
  [/[ఀ-౿]/, "Noto Sans Telugu", "NotoSansTelugu-Bold.ttf"],
  [/[ऀ-ॿ]/, "Noto Sans Devanagari", "NotoSansDevanagari-Bold.ttf"],
  [/[஀-௿]/, "Noto Sans Tamil", "NotoSansTamil-Bold.ttf"],
  [/[ಀ-೿]/, "Noto Sans Kannada", "NotoSansKannada-Bold.ttf"],
  [/[ഀ-ൿ]/, "Noto Sans Malayalam", "NotoSansMalayalam-Bold.ttf"],
  [/[ঀ-৿]/, "Noto Sans Bengali", "NotoSansBengali-Bold.ttf"],
  [/[઀-૿]/, "Noto Sans Gujarati", "NotoSansGujarati-Bold.ttf"],
  [/[਀-੿]/, "Noto Sans Gurmukhi", "NotoSansGurmukhi-Bold.ttf"],
  [/[଀-୿]/, "Noto Sans Oriya", "NotoSansOriya-Bold.ttf"],
];
const LATIN_FONT = ["Noto Sans", "NotoSans-Bold.ttf"];
export const ALL_FONTS = [LATIN_FONT[1], ...SCRIPT_FONTS.map(([, , file]) => file)];

/** The font files, of those asked about, that are not on this server. */
export async function missingFonts(files = ALL_FONTS) {
  const out = [];
  for (const f of files) {
    if (!(await fsp.stat(path.join(FONTS_DIR, f)).then((s) => s.size > 0, () => false))) out.push(f);
  }
  return out;
}

/** The output frame for an aspect, at a resolution (the short side). */
export function frameSize(tl, resolution = 1080) {
  return outputSize(tl?.aspect, resolution);
}

const assTime = (t) => {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor(cs / 6000) % 60;
  const s = Math.floor(cs / 100) % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
};

const assText = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/[{}]/g, "").replace(/\r?\n/g, "\\N");

/** The font files a subtitle file needs: Latin always, plus each Indic script in it. */
function fontsFor(text) {
  return [LATIN_FONT[1], ...SCRIPT_FONTS.filter(([re]) => re.test(text)).map(([, , file]) => file)];
}

function familyFor(word) {
  for (const [re, family] of SCRIPT_FONTS) if (re.test(word)) return family;
  return LATIN_FONT[0];
}

/**
 * Caption text with the right face named for every word.
 *
 * ── WHY NOT ONE FONT, AND WHY NOT FALLBACK ───────────────────────────────────
 * Two approaches were rendered and looked at. Naming Noto Sans Telugu for the
 * whole caption shaped the Telugu correctly but drew "2026" from that face's own
 * digits, visibly smaller than the English beside them. Naming Noto Sans and
 * letting libass fall back per glyph kept the Latin right but broke Telugu
 * conjuncts apart ("డేట్స్" lost its joined ్స), because a per-glyph fallback
 * shapes without the neighbouring letters.
 *
 * Code-mixed speech switches language at word boundaries, so each word gets its
 * own face with an inline \fn override: a Telugu word is shaped whole in the
 * Telugu face, an English word or a number sits in Noto Sans.
 */
function richText(text) {
  let out = "";
  let current = null;
  for (const part of String(text || "").split(/(\s+)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      out += " ";
      continue;
    }
    const family = familyFor(part);
    if (family !== current) {
      out += `{\\fn${family}}`;
      current = family;
    }
    out += assText(part);
  }
  return out;
}

/**
 * The subtitle file for captions and text overlays.
 *
 * Colours are ASS's &HAABBGGRR, where 00 alpha is opaque. Sizes are fractions
 * of the frame's short side, so a 9:16 and a 16:9 export look like the same
 * design rather than one of them shouting, and a 4K export like the 1080p one.
 *
 * ── PLACED, NOT ALIGNED ──────────────────────────────────────────────────────
 * Every line is centred on a point with \an5\pos, and wraps inside the event's
 * own left and right margins. That is what lets a caption be dragged anywhere:
 * the point is where it was dropped, and the margins are the wrap width the
 * preview used (timeline.js captionPlacement), so both break lines alike.
 *
 * @param {object} tl
 * @param {object} frame  { width, height, captions: false to leave captions out }
 */
const HEX = /^#([0-9a-f]{6})$/i;
/** "#FFD400" as ASS's &HBBGGRR&. */
const assColor = (hex) => {
  const m = HEX.exec(String(hex || ""));
  const h = (m ? m[1] : "FFFFFF").toUpperCase();
  return `&H${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}&`;
};

/** Each caption look's colours, border style, outline and shadow, for a font size. */
const LOOKS = {
  bold: (px) => ({ colours: "&H00FFFFFF,&H000000FF,&H00000000,&H64000000", border: 1, bord: Math.round(px * 0.09), shad: 0 }),
  clean: (px) => ({ colours: "&H00FFFFFF,&H000000FF,&H40000000,&H80000000", border: 1, bord: Math.round(px * 0.04), shad: Math.round(px * 0.05) }),
  box: (px) => ({ colours: "&H00FFFFFF,&H000000FF,&H59000000,&H59000000", border: 3, bord: Math.round(px * 0.22), shad: 0 }),
};

export function buildAss(tl, { width, height, captions = true }) {
  const cues = captions ? captionCues(tl) : [];
  const texts = tl.texts || [];
  const segById = new Map(segmentsOf(tl).map((s) => [s.id, s]));

  const sample = [...cues.map((c) => c.text), ...texts.map((t) => t.text)].join(" ");
  const family = LATIN_FONT[0];
  const base = captionPlacement(tl, width, height).size;
  const edge = Math.round(width * 0.08);

  const lines = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
  ];

  // One style per look, because the box look's border style cannot be switched
  // by an inline tag. Size, outline, shadow and colour can, so those are set on
  // every line, which is what lets one caption section differ from the rest.
  for (const [name, look] of Object.entries(LOOKS)) {
    const l = look(base);
    lines.push(`Style: Cap_${name},${family},${base},${l.colours},-1,0,0,0,100,100,0,0,${l.border},${l.bord},${l.shad},5,${edge},${edge},0,1`);
  }

  for (const size of ["s", "m", "l"]) {
    const px = textPlacement({ size }, width, height).size;
    lines.push(
      `Style: Text_${size},${family},${px},&H00FFFFFF,&H000000FF,&H1A000000,&H1A000000,-1,0,0,0,100,100,0,0,3,${Math.round(px * 0.3)},0,5,${edge},${edge},0,1`
    );
  }

  // An event margin of 0 means "use the style's", so the smallest is 1.
  const margins = (p) => `${Math.max(1, Math.round(p.left))},${Math.max(1, Math.round(width - p.left - p.boxW))}`;

  lines.push("", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text");
  for (const c of cues) {
    const seg = c.seg ? segById.get(c.seg) : null;
    const look = captionLook(tl, seg);
    const name = LOOKS[look.style] ? look.style : "bold";
    const p = captionPlacement(tl, width, height, seg);
    const l = LOOKS[name](p.size);
    lines.push(
      `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Cap_${name},,${margins(p)},0,,{\\an5\\pos(${p.cx},${p.cy})\\fs${p.size}\\bord${l.bord}\\shad${l.shad}\\c${assColor(look.color)}}${richText(c.text)}`
    );
  }
  for (const t of texts) {
    const tp = textPlacement(t, width, height);
    lines.push(`Dialogue: 1,${assTime(t.start)},${assTime(t.start + t.duration)},Text_${t.size || "m"},,${margins(tp)},0,,{\\an5\\pos(${tp.cx},${tp.cy})}${richText(t.text)}`);
  }

  return { ass: lines.join("\n") + "\n", fonts: fontsFor(sample), count: cues.length + texts.length, cues: cues.length, texts: texts.length };
}

const cover = (w, h) => `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1`;

/**
 * A cutaway fitted to a w×h box, ending in `out`. Cover crops it to fill;
 * contain shows all of it over a blurred, darkened copy of itself. The picture
 * keeps an alpha plane, so a transparent PNG (a price tag, a logo, a "VALID TILL"
 * graphic) shows the video through it instead of black.
 */
function fitChain(input, w, h, fit, out, shift, fps) {
  if (fit === "cover") return [`[${input}]${cover(w, h)},fps=${fps},format=yuva420p,${shift}[${out}]`];
  return [
    `[${input}]split[${out}f][${out}b]`,
    `[${out}b]${cover(w, h)},boxblur=${Math.max(2, Math.min(24, Math.floor(Math.min(w, h) / 8)))}:2,eq=brightness=-0.06,format=yuv420p[${out}bb]`,
    `[${out}f]scale=${w}:${h}:force_original_aspect_ratio=decrease,setsar=1,format=yuva420p[${out}ff]`,
    `[${out}bb][${out}ff]overlay=(W-w)/2:(H-h)/2,fps=${fps},format=yuv420p,${shift}[${out}]`,
  ];
}

/** Constant quality for "Auto", a little looser as the frame grows (more pixels hide more). */
function crfFor(o) {
  const h264 = o.resolution >= 2160 ? 22 : o.resolution >= 1440 ? 21 : 20;
  return o.codec === "hevc" ? h264 + 5 : h264;
}

/** The final picture encode: codec, speed, and either a bitrate or constant quality. */
function videoArgs(o) {
  const x265 = o.codec === "hevc";
  const args = ["-c:v", x265 ? "libx265" : "libx264", "-preset", SPEEDS[o.speed] || "veryfast", "-pix_fmt", "yuv420p"];
  if (o.video_mbps > 0) {
    args.push("-b:v", `${o.video_mbps}M`, "-maxrate", `${Math.round(o.video_mbps * 1.5)}M`, "-bufsize", `${o.video_mbps * 2}M`);
  } else {
    args.push("-crf", String(crfFor(o)));
  }
  // A keyframe every two seconds: what YouTube and Instagram ask uploads for.
  args.push("-g", String(o.fps * 2));
  // hvc1 is the tag Apple devices need to play H.265 at all.
  if (x265) args.push("-tag:v", "hvc1", "-x265-params", "log-level=error");
  else args.push("-profile:v", "high");
  return args;
}

const audioArgs = (o) => ["-c:a", "aac", "-b:a", `${o.audio_kbps}k`, "-ar", "48000", "-ac", "2"];

/** EBU R128 to −14 LUFS, the level YouTube, Instagram and Spotify play back at. */
const LOUDNORM = "loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000";

/**
 * Render.
 *
 * @param {object}   args
 * @param {object}   args.timeline   sanitized
 * @param {Map}      args.mediaById  id -> media row (type, duration, has_audio, width, height)
 * @param {Function} args.pathOf     async (mediaId) => local path of the ORIGINAL
 * @param {string}   args.workDir    scratch directory, owned by the caller
 * @param {object}   [args.options]  export options (exportOptions.js), cleaned again here
 * @param {Function} [args.onProgress]  (0..1, stage)
 * @returns {Promise<{ output, srt, duration, width, height, fps, options, drew }>}
 */
export async function renderTimeline({ timeline, mediaById, pathOf, workDir, options = null, onProgress = () => {} }) {
  const o = cleanExportOptions(options, { hevc: options?.codec === "hevc", maxResolution: 2160 });
  const [W, H] = frameSize(timeline, o.resolution);
  const FPS = o.fps;
  const lay = layout(timeline);
  const clips = lay.clips.filter((c) => c.start !== null);
  if (!clips.length) {
    throw Object.assign(new Error("empty timeline"), { userMessage: "There is nothing in this edit to export. Turn on at least one part of your video." });
  }
  const total = lay.duration;

  // Everything that goes on top, known before anything is encoded.
  const broll = lay.broll.filter((b) => b.start !== null && b.media && mediaById.get(b.media) && b.end - b.start > 0.05);
  const { ass, fonts, count, cues, texts } = buildAss(timeline, { width: W, height: H, captions: o.captions !== "none" });
  const music = (timeline.audio || []).filter((a) => a.start < total);
  const voice = Math.max(0, Number(timeline.voice_volume ?? 1));

  if (count > 0) {
    const missing = await missingFonts(fonts);
    if (missing.length) {
      console.error(`[edit] render: caption fonts missing in ${FONTS_DIR}: ${missing.join(", ")}`);
      throw userError("Captions can't be drawn because this server is missing its caption fonts. Your credits are back.");
    }
  }

  // With nothing on top, pass 1 IS the export's picture, so it is made at the
  // export's quality and copied, instead of being encoded twice.
  const direct = !broll.length && !count && !music.length && voice === 1 && o.codec === "h264" && !o.video_mbps;

  // ── Pass 1: one normalised file per clip ──────────────────────────────────
  const segs = [];
  let done = 0;
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    const m = mediaById.get(c.media);
    const src = await pathOf(c.media);
    const d = c.out - c.in;
    const out = path.join(workDir, `seg_${String(i).padStart(4, "0")}.mp4`);
    const fade = Math.min(0.015, d / 4);

    const args = ["-ss", String(c.in), "-t", String(d), "-i", src];
    if (!m?.has_audio) args.push("-f", "lavfi", "-t", String(d), "-i", "anullsrc=r=48000:cl=stereo");
    args.push(
      "-map", "0:v:0", "-map", m?.has_audio ? "0:a:0" : "1:a:0",
      "-vf", `${cover(W, H)},fps=${FPS},format=yuv420p`,
      "-af", `aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,afade=t=in:d=${fade},afade=t=out:st=${Math.max(0, d - fade)}:d=${fade}`,
      "-t", String(d),
      "-c:v", "libx264", "-preset", direct ? SPEEDS[o.speed] : "veryfast", "-crf", String(direct ? crfFor(o) : 16), "-pix_fmt", "yuv420p",
      ...(direct ? ["-g", String(FPS * 2), "-profile:v", "high"] : []),
      "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-ac", "2",
      "-video_track_timescale", String(FPS * 1000),
      out
    );
    await ffmpeg(args, {
      duration: d,
      onProgress: (p) => onProgress(0.6 * ((done + p * d) / total), "Cutting your video"),
    });
    done += d;
    segs.push(out);
  }

  // ── Pass 2: join ──────────────────────────────────────────────────────────
  onProgress(0.6, "Joining");
  const list = path.join(workDir, "segments.txt");
  await fsp.writeFile(list, segs.map((s) => `file '${path.basename(s)}'`).join("\n"));
  const base = path.join(workDir, "base.mp4");
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", "segments.txt", "-c", "copy", "base.mp4"], { cwd: workDir });

  // ── Pass 3: everything on top ─────────────────────────────────────────────
  const inputs = ["-i", "base.mp4"];
  const graph = [];
  let vLabel = "0:v";
  let n = 1;
  const layouts = { full: 0, split: 0, pip: 0 };

  for (let i = 0; i < broll.length; i++) {
    const b = broll[i];
    const m = mediaById.get(b.media);
    const src = await pathOf(b.media);
    const d = b.end - b.start;
    const S = b.start.toFixed(3);
    const on = `enable='between(t,${S},${b.end.toFixed(3)})'`;
    const shift = `setpts=PTS-STARTPTS+${S}/TB`;

    if (m.type === "image") inputs.push("-loop", "1", "-framerate", String(FPS), "-t", String(d), "-i", src);
    else inputs.push("-ss", String(b.media_in || 0), "-t", String(d), "-i", src);
    const cut = n++;

    if (b.layout === "pip") {
      const g = pipPlacement(b, m, W, H);
      graph.push(
        `[${cut}:v]scale=${g.pw}:${g.ph},setsar=1,fps=${FPS},format=yuva420p,${shift}[b${i}]`,
        `[${vLabel}][b${i}]overlay=${g.left}:${g.top}:eof_action=pass:${on}[v${i}]`
      );
      layouts.pip++;
    } else if (b.layout === "split") {
      const P = splitPanes(b, W, H);
      inputs.push("-ss", S, "-t", String(d), "-i", "base.mp4");
      const self = n++;
      graph.push(
        ...fitChain(`${cut}:v`, P.broll.w, P.broll.h, b.fit, `b${i}`, shift, FPS),
        `[${self}:v]crop=${P.crop.w}:${P.crop.h}:${P.crop.x}:${P.crop.y},setsar=1,${shift}[c${i}]`,
        `[${vLabel}][b${i}]overlay=${P.broll.x}:${P.broll.y}:eof_action=pass:${on}[vb${i}]`,
        `[vb${i}][c${i}]overlay=${P.creator.x}:${P.creator.y}:eof_action=pass:${on}[v${i}]`
      );
      layouts.split++;
    } else {
      graph.push(
        ...fitChain(`${cut}:v`, W, H, b.fit, `b${i}`, shift, FPS),
        `[${vLabel}][b${i}]overlay=0:0:eof_action=pass:${on}[v${i}]`
      );
      layouts.full++;
    }
    vLabel = `v${i}`;
  }

  if (count > 0) {
    await fsp.writeFile(path.join(workDir, "overlay.ass"), ass, "utf8");
    await fsp.mkdir(path.join(workDir, "fonts"), { recursive: true });
    for (const f of fonts) await fsp.copyFile(path.join(FONTS_DIR, f), path.join(workDir, "fonts", f));
    // Relative paths, with cwd set to the work directory: filter arguments treat
    // ':' and '\' specially, and a Windows or a spaced path would need escaping
    // that is easy to get subtly wrong.
    graph.push(`[${vLabel}]ass=overlay.ass:fontsdir=fonts[vass]`);
    vLabel = "vass";
  }

  let aLabel = "0:a";
  if (music.length || voice !== 1) {
    graph.push(`[0:a]volume=${voice.toFixed(2)}[a0]`);
    const mix = ["[a0]"];
    for (let i = 0; i < music.length; i++) {
      const a = music[i];
      const src = await pathOf(a.media);
      const d = Math.min(a.duration, total - a.start);
      inputs.push("-ss", String(a.in || 0), "-t", String(d), "-i", src);
      const fi = Math.min(a.fade_in || 0, d / 2);
      const fo = Math.min(a.fade_out || 0, d / 2);
      const ms = Math.round(a.start * 1000);
      graph.push(
        `[${n}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=0:${d.toFixed(3)},asetpts=PTS-STARTPTS` +
          (fi > 0 ? `,afade=t=in:d=${fi.toFixed(3)}` : "") +
          (fo > 0 ? `,afade=t=out:st=${Math.max(0, d - fo).toFixed(3)}:d=${fo.toFixed(3)}` : "") +
          `,volume=${Number(a.volume ?? 0.3).toFixed(2)},adelay=${ms}|${ms}[m${i}]`
      );
      mix.push(`[m${i}]`);
      n++;
    }
    graph.push(
      mix.length > 1
        ? `${mix.join("")}amix=inputs=${mix.length}:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[aout]`
        : `[a0]alimiter=limit=0.95[aout]`
    );
    aLabel = "aout";
  }

  const output = path.join(workDir, "export.mp4");
  onProgress(0.62, direct ? "Finishing" : "Adding media and captions");

  if (direct) {
    // The picture is already the export's; only the sound may still change.
    await ffmpeg(
      ["-i", "base.mp4", "-map", "0:v", "-map", "0:a", "-c:v", "copy", ...(o.loudness ? ["-af", LOUDNORM] : []), ...audioArgs(o), "-movflags", "+faststart", "export.mp4"],
      { cwd: workDir, duration: total, onProgress: (p) => onProgress(0.62 + 0.38 * p, "Finishing") }
    );
  } else {
    if (o.loudness) {
      graph.push(`[${aLabel}]${LOUDNORM}[aloud]`);
      aLabel = "aloud";
    }
    const mapV = vLabel === "0:v" ? "0:v" : `[${vLabel}]`;
    const mapA = aLabel === "0:a" ? "0:a" : `[${aLabel}]`;
    await ffmpeg(
      [
        ...inputs,
        ...(graph.length ? ["-filter_complex", graph.join(";")] : []),
        "-map", mapV, "-map", mapA,
        "-t", total.toFixed(3),
        "-r", String(FPS),
        ...videoArgs(o),
        ...audioArgs(o),
        "-movflags", "+faststart",
        "export.mp4",
      ],
      {
        cwd: workDir,
        duration: total,
        // A long 4K export on a small server takes hours, not the default one.
        timeoutMs: 6 * 3600 * 1000,
        onProgress: (p) => onProgress(0.62 + 0.38 * p, "Adding media and captions"),
      }
    );
  }

  let srt = null;
  if (o.srt) {
    const body = buildSrt(timeline);
    if (body.trim()) {
      srt = path.join(workDir, "export.srt");
      await fsp.writeFile(srt, body, "utf8");
    }
  }

  onProgress(1, "Done");
  await fsp.rm(base, { force: true }).catch(() => {});
  return {
    output,
    srt,
    duration: total,
    width: W,
    height: H,
    fps: FPS,
    options: o,
    drew: { captions: cues, texts, media: broll.length, ...layouts, music: music.length, subtitles: !!srt },
  };
}

export default { renderTimeline, buildAss, frameSize, missingFonts, FONTS_DIR, ALL_FONTS };

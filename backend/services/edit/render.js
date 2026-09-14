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
 *      joined voice track.
 *
 * The alternative, one giant filter graph with a trim per clip, decodes every
 * recording from its first frame for every clip and falls over somewhere past a
 * hundred lines. Three passes cost a little disk and scale to the eight-minute
 * scripts this product writes.
 *
 * ── CAPTIONS ARE ASS, RENDERED BY LIBASS ─────────────────────────────────────
 * drawtext does not shape complex scripts in most builds: Telugu and Devanagari
 * come out as disconnected letters. libass shapes with HarfBuzz, falls back
 * across fonts per glyph, so "iPhone 17 ధర" renders both halves, and handles
 * outlines, boxes and positioning in one subtitle file. The fonts ship in
 * assets/fonts (Noto, OFL) so the result does not depend on what the server
 * happens to have installed.
 */
import fsp from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { ffmpeg } from "../media/ffmpeg.js";
import { ASPECTS, layout, captionCues } from "./timeline.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FONTS_DIR = path.resolve(process.env.EDIT_FONTS_DIR || path.join(HERE, "..", "..", "assets", "fonts"));

const FPS = 30;

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

/** The output frame for an aspect, or the first clip's own shape for "source". */
export function frameSize(tl) {
  return ASPECTS[tl.aspect] || ASPECTS["9:16"];
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
 * design rather than one of them shouting.
 */
export function buildAss(tl, { width, height }) {
  const cap = tl.captions || {};
  const short = Math.min(width, height);
  const sizeMul = { s: 0.8, m: 1, l: 1.25 };
  const cues = captionCues(tl);
  const texts = tl.texts || [];

  const sample = [...cues.map((c) => c.text), ...texts.map((t) => t.text)].join(" ");
  const font = { family: LATIN_FONT[0] };

  const capSize = Math.round(short * (cap.style === "clean" ? 0.062 : 0.075) * (sizeMul[cap.size] || 1));
  const capMarginV = cap.position === "middle" ? 0 : Math.round(height * (height > width ? 0.2 : 0.09));
  const capAlign = cap.position === "middle" ? 5 : 2;

  const capStyle = {
    bold: `&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,${Math.round(capSize * 0.09)},0`,
    clean: `&H00FFFFFF,&H000000FF,&H40000000,&H80000000,-1,0,0,0,100,100,0,0,1,${Math.round(capSize * 0.04)},${Math.round(capSize * 0.05)}`,
    box: `&H00FFFFFF,&H000000FF,&H59000000,&H59000000,-1,0,0,0,100,100,0,0,3,${Math.round(capSize * 0.22)},0`,
  }[cap.style] || "";

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
    `Style: Cap,${font.family},${capSize},${capStyle},${capAlign},${Math.round(width * 0.08)},${Math.round(width * 0.08)},${capMarginV},1`,
  ];

  const textSize = { s: 0.05, m: 0.064, l: 0.085 };
  for (const pos of ["top", "middle", "bottom"]) {
    for (const size of ["s", "m", "l"]) {
      const px = Math.round(short * textSize[size]);
      const align = pos === "top" ? 8 : pos === "middle" ? 5 : 2;
      const marginV = pos === "middle" ? 0 : Math.round(height * (height > width ? 0.12 : 0.07));
      lines.push(
        `Style: Text_${pos}_${size},${font.family},${px},&H00FFFFFF,&H000000FF,&H1A000000,&H1A000000,-1,0,0,0,100,100,0,0,3,${Math.round(px * 0.3)},0,${align},${Math.round(width * 0.07)},${Math.round(width * 0.07)},${marginV},1`
      );
    }
  }

  lines.push("", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text");
  for (const c of cues) {
    lines.push(`Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Cap,,0,0,0,,${richText(c.text)}`);
  }
  for (const t of texts) {
    lines.push(`Dialogue: 1,${assTime(t.start)},${assTime(t.start + t.duration)},Text_${t.position}_${t.size},,0,0,0,,${richText(t.text)}`);
  }

  return { ass: lines.join("\n") + "\n", fonts: fontsFor(sample), count: cues.length + texts.length };
}

const cover = (w, h) => `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1`;

/**
 * Render.
 *
 * @param {object}   args
 * @param {object}   args.timeline   sanitized
 * @param {Map}      args.mediaById  id -> media row (type, duration, has_audio)
 * @param {Function} args.pathOf     async (mediaId) => local path of the ORIGINAL
 * @param {string}   args.workDir    scratch directory, owned by the caller
 * @param {Function} [args.onProgress]  (0..1, stage)
 * @returns {Promise<{ output: string, duration: number, width: number, height: number }>}
 */
export async function renderTimeline({ timeline, mediaById, pathOf, workDir, onProgress = () => {} }) {
  const [W, H] = frameSize(timeline);
  const lay = layout(timeline);
  const clips = lay.clips.filter((c) => c.start !== null);
  if (!clips.length) {
    throw Object.assign(new Error("empty timeline"), { userMessage: "There is nothing in this edit to export. Turn on at least one line." });
  }
  const total = lay.duration;

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
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
      "-video_track_timescale", "30000",
      out
    );
    await ffmpeg(args, {
      duration: d,
      onProgress: (p) => onProgress(0.6 * ((done + p * d) / total), "Cutting your lines"),
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

  const broll = lay.broll.filter((b) => b.start !== null && b.media && b.end - b.start > 0.05);
  for (let i = 0; i < broll.length; i++) {
    const b = broll[i];
    const m = mediaById.get(b.media);
    const src = await pathOf(b.media);
    const d = b.end - b.start;
    if (m.type === "image") inputs.push("-loop", "1", "-framerate", String(FPS), "-t", String(d), "-i", src);
    else inputs.push("-ss", String(b.media_in || 0), "-t", String(d), "-i", src);

    const shift = `setpts=PTS-STARTPTS+${b.start.toFixed(3)}/TB`;
    if (b.fit === "cover") {
      graph.push(`[${n}:v]${cover(W, H)},fps=${FPS},format=yuv420p,${shift}[b${i}]`);
    } else {
      graph.push(
        `[${n}:v]split[bf${i}][bb${i}]`,
        `[bb${i}]${cover(W, H)},boxblur=24:2,eq=brightness=-0.06[bbb${i}]`,
        `[bf${i}]scale=${W}:${H}:force_original_aspect_ratio=decrease,setsar=1[bff${i}]`,
        `[bbb${i}][bff${i}]overlay=(W-w)/2:(H-h)/2,fps=${FPS},format=yuv420p,${shift}[b${i}]`
      );
    }
    graph.push(`[${vLabel}][b${i}]overlay=0:0:eof_action=pass:enable='between(t,${b.start.toFixed(3)},${b.end.toFixed(3)})'[v${i}]`);
    vLabel = `v${i}`;
    n++;
  }

  const { ass, fonts, count } = buildAss(timeline, { width: W, height: H });
  if (count > 0) {
    await fsp.writeFile(path.join(workDir, "overlay.ass"), ass, "utf8");
    await fsp.mkdir(path.join(workDir, "fonts"), { recursive: true });
    for (const f of fonts) {
      await fsp.copyFile(path.join(FONTS_DIR, f), path.join(workDir, "fonts", f)).catch(() => {});
    }
    // Relative paths, with cwd set to the work directory: filter arguments treat
    // ':' and '\' specially, and a Windows or a spaced path would need escaping
    // that is easy to get subtly wrong.
    graph.push(`[${vLabel}]ass=overlay.ass:fontsdir=fonts[vass]`);
    vLabel = "vass";
  }

  const music = (timeline.audio || []).filter((a) => a.start < total);
  const voice = Math.max(0, Number(timeline.voice_volume ?? 1));
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
  onProgress(0.62, "Adding B-roll and captions");

  if (!graph.length) {
    await ffmpeg(["-i", "base.mp4", "-c", "copy", "-movflags", "+faststart", "export.mp4"], { cwd: workDir });
  } else {
    const mapV = vLabel === "0:v" ? "0:v" : `[${vLabel}]`;
    const mapA = aLabel === "0:a" ? "0:a" : `[${aLabel}]`;
    await ffmpeg(
      [
        ...inputs,
        "-filter_complex", graph.join(";"),
        "-map", mapV, "-map", mapA,
        "-t", total.toFixed(3),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        "export.mp4",
      ],
      {
        cwd: workDir,
        duration: total,
        onProgress: (p) => onProgress(0.62 + 0.38 * p, "Adding B-roll and captions"),
      }
    );
  }

  onProgress(1, "Done");
  await fsp.rm(base, { force: true }).catch(() => {});
  return { output, duration: total, width: W, height: H };
}

export default { renderTimeline, buildAss, frameSize, FONTS_DIR };

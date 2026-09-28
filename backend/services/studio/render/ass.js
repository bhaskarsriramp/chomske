/**
 * ass.js: captions, as a subtitle file libass draws.
 *
 * ── WHY ASS AND NOT drawtext ─────────────────────────────────────────────────
 * Same reason the script editor uses it (services/edit/render.js): `drawtext`
 * does not shape complex scripts in most ffmpeg builds, so Telugu and Devanagari
 * come out as disconnected letters, and it has no way to emphasise one word
 * inside a line. libass shapes with HarfBuzz, takes inline overrides per word,
 * and does outlines, boxes and placement in one file.
 *
 * ── FIVE LOOKS, ONE MECHANISM ────────────────────────────────────────────────
 * Every style below is the same thing — a centred line at a placed point, with
 * the emphasised words overridden — differing only in face weight, size,
 * colour, outline and whether there is a box behind it. Adding a sixth is
 * adding an entry to STYLES and nothing else.
 *
 * ── EMPHASIS IS THE POINT ────────────────────────────────────────────────────
 * The caption generator returns which words in each cue carry the meaning
 * (prompts.js). Those words get the accent colour and, in the louder styles, a
 * size bump. That is what makes a caption track feel written rather than
 * transcribed, and it is the single thing the "Hormozi" look is actually made
 * of; the rest is a heavy face and a thick outline.
 *
 * ── SIZES ARE FRACTIONS OF THE FRAME ─────────────────────────────────────────
 * Every number is against the SHORT side, so a 9:16 Short and a 16:9 export are
 * the same design, and a 4K export is the 1080p design with more pixels rather
 * than smaller captions.
 */
import path from "path";
import { fileURLToPath } from "url";
import { placedCues } from "../timeline.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FONTS_DIR = path.resolve(process.env.EDIT_FONTS_DIR || path.join(HERE, "..", "..", "..", "assets", "fonts"));

/** Same table as the script editor's, so one set of font files serves both. */
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
const LATIN = ["Noto Sans", "NotoSans-Bold.ttf"];
export const ALL_FONTS = [LATIN[1], ...SCRIPT_FONTS.map(([, , f]) => f)];

/** Caption size as a fraction of the frame's short side. */
const SIZES = { s: 0.042, m: 0.054, l: 0.068, xl: 0.086 };

/**
 * The looks.
 *
 * `colours` is ASS's Primary, Secondary, Outline, Back — each &HAABBGGRR with
 * 00 alpha meaning opaque, which is backwards from every other colour format
 * and the most common way to get an invisible caption.
 *
 * `border` 1 is outline-and-shadow, 3 is an opaque box behind the text.
 */
const STYLES = {
  trylipi: {
    size: 1,
    accent: "#70FFD2",
    colours: "&H00FFFFFF,&H000000FF,&H00101418,&H90000000",
    border: 1,
    outline: 0.085,
    shadow: 0.05,
    caps: false,
    emphasisScale: 1,
  },
  hormozi: {
    // Loud on purpose: heavy outline, all caps, and a big colour jump on the
    // emphasised word. Made for a phone held at arm's length with no sound.
    size: 1.24,
    accent: "#FFD400",
    colours: "&H00FFFFFF,&H000000FF,&H00000000,&HA0000000",
    border: 1,
    outline: 0.15,
    shadow: 0.04,
    caps: true,
    emphasisScale: 1.1,
  },
  apple: {
    // Quiet, set in the middle of a soft dark slab. Nothing shouts and the
    // emphasis is a weight change rather than a colour.
    size: 0.92,
    accent: "#FFFFFF",
    colours: "&H00FFFFFF,&H000000FF,&H60000000,&H60000000",
    border: 3,
    outline: 0.26,
    shadow: 0,
    caps: false,
    emphasisScale: 1,
  },
  minimal: {
    size: 0.88,
    accent: "#FFFFFF",
    colours: "&H00FFFFFF,&H000000FF,&H50000000,&H80000000",
    border: 1,
    outline: 0.035,
    shadow: 0.06,
    caps: false,
    emphasisScale: 1,
  },
  neon: {
    size: 1.06,
    accent: "#00E5FF",
    colours: "&H00FFFFFF,&H000000FF,&H00A03000,&HB0000000",
    border: 1,
    outline: 0.09,
    shadow: 0.09,
    caps: false,
    emphasisScale: 1.05,
  },
};

const assTime = (t) => {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor(cs / 6000) % 60;
  const s = Math.floor(cs / 100) % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
};

const escape = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/[{}]/g, "").replace(/\r?\n/g, "\\N");

const HEX = /^#?([0-9a-f]{6})$/i;
/** "#FFD400" as ASS's &HBBGGRR&. */
const assColor = (hex) => {
  const m = HEX.exec(String(hex || ""));
  const h = (m ? m[1] : "FFFFFF").toUpperCase();
  return `&H${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}&`;
};
/** ...and as a style row writes it, &HAABBGGRR, opaque. */
const rowColor = (hex) => `&H00${assColor(hex).slice(2, -1)}`;

/**
 * ── THE STRIP BEHIND THE TEXT ────────────────────────────────────────────────
 * A band of solid colour behind a caption, so it reads over whatever the video
 * is showing: the line's own (cue.custom.bg), else the track's (captions.bg),
 * else the look's. "none" takes the band away, even from Quiet, which has one
 * of its own. The same choice as the editor's preview (model.js captionLook).
 *
 * libass draws it as BorderStyle 3, an opaque box in the outline colour, the
 * outline's width out from the text all round. BorderStyle is a property of
 * the style row, so each look-and-strip in use gets a row of its own.
 */
const stripOf = (cap, custom) => {
  const v = custom?.bg ?? cap.bg ?? null;
  return v === "none" || (v && HEX.test(v)) ? v : null;
};
/**
 * How far the strip reaches past the text, as fractions of the size: a
 * little above and below, and more at the two ends, where a band stopping
 * right at the first and last letters read as cut off (the creator's call).
 * The row's outline is the first; each line widens its box with \xbord.
 */
const STRIP_PAD = 0.26;
const STRIP_ENDS = 0.6;

function familyFor(word) {
  for (const [re, family] of SCRIPT_FONTS) if (re.test(word)) return family;
  return LATIN[0];
}

/** The font files this subtitle file needs: Latin plus each script present. */
function fontsFor(text) {
  return [LATIN[1], ...SCRIPT_FONTS.filter(([re]) => re.test(text)).map(([, , f]) => f)];
}

/**
 * A cue's words, with the emphasised ones overridden and each word set in the
 * face that can actually shape it.
 *
 * The per-word face is not fussiness. Naming one Indic face for the whole line
 * draws Latin digits from that face, visibly smaller than the English beside
 * them; letting libass fall back per glyph breaks Telugu conjuncts apart,
 * because a per-glyph fallback shapes without the neighbouring letters. Speech
 * switches language at word boundaries, so the face does too.
 */
function cueText(cue, style, px, custom = null, base = "&HFFFFFF&") {
  const hits = new Set(
    (cue.emphasis || []).flatMap((e) => String(e).toLowerCase().split(/\s+/)).filter(Boolean)
  );
  // The line's own highlight colour, else the look's accent; NOT the line's
  // text colour. When a creator recolours one line, the highlighted words in
  // it still have to stand out from the rest of it; taking the accent from
  // the text colour made them identical to their neighbours and the
  // highlight silently disappeared.
  const accent = assColor(custom?.accent || style.accent);
  let out = "";
  let face = null;

  for (const part of String(cue.text || "").split(/(\s+)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      out += " ";
      continue;
    }
    const family = familyFor(part);
    if (family !== face) {
      out += `{\\fn${family}}`;
      face = family;
    }
    const bare = part.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
    const word = style.caps ? part.toLocaleUpperCase() : part;

    if (bare && hits.has(bare)) {
      const big = style.emphasisScale !== 1 ? `\\fs${Math.round(px * style.emphasisScale)}` : "";
      // Back to the line's own colour after it, not to white: a line set in
      // dark text on a yellow strip went white after its first emphasised
      // word and vanished into the strip.
      out += `{\\c${accent}${big}}${escape(word)}{\\c${base}${style.emphasisScale !== 1 ? `\\fs${px}` : ""}}`;
    } else {
      out += escape(word);
    }
  }
  return out;
}

/** Where the caption line sits, as a point, in output pixels. */
function positionFor(position, W, H) {
  if (position === "top") return { x: Math.round(W / 2), y: Math.round(H * 0.13) };
  if (position === "middle") return { x: Math.round(W / 2), y: Math.round(H / 2) };
  return { x: Math.round(W / 2), y: Math.round(H * 0.84) };
}

/**
 * The subtitle file for a timeline's captions.
 *
 * @returns {{ ass: string, fonts: string[], count: number }} count 0 means
 *          there is nothing to draw and the caller should not add the filter.
 */
export function buildAss(tl, { width, height }) {
  const cues = placedCues(tl);
  if (!cues.length) return { ass: "", fonts: [], count: 0 };

  const cap = tl.captions || {};
  const short = Math.min(width, height);
  const edge = Math.round(width * 0.09);

  /**
   * The size a caption is drawn at, in pixels.
   * `px` is an absolute override the creator dragged to; otherwise it is a
   * fraction of the frame's short side, times whatever the look asks for.
   */
  const sizeOf = (styleName, sizeKey, px) =>
    Math.round(px != null ? px * (short / 1080) : short * (SIZES[sizeKey] || SIZES.m) * (STYLES[styleName] || STYLES.trylipi).size);

  const trackStyle = STYLES[cap.style] ? cap.style : "trylipi";
  const trackPx = sizeOf(trackStyle, cap.size, cap.px);

  // ── ONE ASS STYLE PER LOOK IN USE ────────────────────────────────────────
  // Font size, colour and position are all settable per line with an inline
  // tag. BorderStyle is NOT — an opaque box behind the text versus an outline
  // is a property of the style row — so a line that overrides its look, or
  // its strip, needs a style row of its own. Only the ones used are emitted.
  const rowName = (name, strip) => `Cap_${name}${strip ? `_${strip === "none" ? "none" : strip.slice(1).toLowerCase()}` : ""}`;
  const rows = new Map([[rowName(trackStyle, stripOf(cap, null)), [trackStyle, stripOf(cap, null)]]]);
  for (const c of cues) {
    const name = c.custom?.style && STYLES[c.custom.style] ? c.custom.style : trackStyle;
    const strip = stripOf(cap, c.custom);
    rows.set(rowName(name, strip), [name, strip]);
  }

  const lines = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "YCbCr Matrix: TV.709",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
  ];
  for (const [row, [name, strip]] of rows) {
    const st = STYLES[name];
    const px = name === trackStyle ? trackPx : sizeOf(name, cap.size, cap.px);
    let { colours, border, outline, shadow } = st;
    if (strip && strip !== "none") {
      // The strip: a box in its colour (the outline colour), and no shadow.
      const [primary, secondary] = colours.split(",");
      colours = [primary, secondary, rowColor(strip), rowColor(strip)].join(",");
      border = 3;
      outline = STRIP_PAD;
      shadow = 0;
    } else if (strip === "none" && st.border === 3) {
      // A boxed look with its box taken away: a thin dark edge, as Minimal has,
      // so white text still has something to stand on.
      const [primary, secondary] = colours.split(",");
      colours = [primary, secondary, STYLES.minimal.colours.split(",")[2], STYLES.minimal.colours.split(",")[3]].join(",");
      border = 1;
      outline = STYLES.minimal.outline;
      shadow = STYLES.minimal.shadow;
    }
    lines.push(
      `Style: ${row},${LATIN[0]},${px},${colours},-1,0,0,0,100,100,${st.caps ? 1 : 0},0,${border},${Math.max(1, Math.round(px * outline))},${Math.round(px * shadow)},5,${edge},${edge},0,1`
    );
  }
  lines.push("", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text");

  for (const cue of cues) {
    const custom = cue.custom || null;
    const styleName = custom?.style && STYLES[custom.style] ? custom.style : trackStyle;
    const style = STYLES[styleName];
    const px = sizeOf(styleName, custom?.size || cap.size, custom?.px ?? cap.px);
    const basePx = styleName === trackStyle ? trackPx : sizeOf(styleName, cap.size, cap.px);

    // Where this line sits: its own point if it was dragged, else the track's,
    // else the preset for the chosen position.
    const x = custom?.x ?? cap.x;
    const y = custom?.y ?? cap.y;
    const pos = x != null && y != null
      ? { x: Math.round(x * width), y: Math.round(y * height) }
      : positionFor(cap.position, width, height);

    // Inline overrides. Every one of these is a literal backslash followed by
    // the tag name, so each is written "\\" in source: `\f`, `\b` and `\c` are
    // all real JavaScript escapes, and getting this wrong emits a form feed
    // into the subtitle file instead of a caption tag.
    const over = [];
    if (px !== basePx) over.push(`\\fs${px}`);
    if (custom?.color) over.push(`\\c${assColor(custom.color)}`);
    else if (cap.color) over.push(`\\c${assColor(cap.color)}`);
    if (custom?.bold === false) over.push("\\b0");
    const strip = stripOf(cap, custom);
    if (strip && strip !== "none") over.push(`\\xbord${Math.round(px * STRIP_ENDS)}\\ybord${Math.max(1, Math.round(px * STRIP_PAD))}`);

    // A short rise and fade on every cue. Captions that appear instantly read
    // as a burned-in timecode; 90 milliseconds is enough to look placed and
    // short enough that nobody waits for it.
    lines.push(
      `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},${rowName(styleName, strip)},,0,0,0,,{\\fad(90,90)}{\\an5\\pos(${pos.x},${pos.y})${over.join("")}}${cueText(cue, style, px, custom, assColor(custom?.color || cap.color || "#FFFFFF"))}`
    );
  }

  const sample = cues.map((c) => c.text).join(" ");
  return { ass: lines.join("\n"), fonts: [...new Set(fontsFor(sample))], count: cues.length };
}

/** The same cues as an SRT, shipped beside every export. */
export function buildSrt(tl) {
  const cues = placedCues(tl);
  const time = (t) => {
    const ms = Math.max(0, Math.round(t * 1000));
    const h = Math.floor(ms / 3600000);
    const m = Math.floor(ms / 60000) % 60;
    const s = Math.floor(ms / 1000) % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
  };
  return cues.map((c, i) => `${i + 1}\n${time(c.start)} --> ${time(c.end)}\n${c.text}\n`).join("\n");
}

/** The font files, of those asked about, that are not on this server. */
export async function missingFonts(files = ALL_FONTS) {
  const fsp = await import("fs/promises");
  const out = [];
  for (const f of files) {
    try {
      await fsp.access(path.join(FONTS_DIR, f));
    } catch {
      out.push(f);
    }
  }
  return out;
}

export default { STYLES, FONTS_DIR, ALL_FONTS, buildAss, buildSrt, missingFonts };

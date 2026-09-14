/**
 * timeline.js: the shape of an edit, and the arithmetic every consumer shares.
 *
 * ── ONE DOCUMENT, DERIVED POSITIONS ──────────────────────────────────────────
 * A timeline stores clips in order with their source in/out points, and NOT
 * their positions on the output. Positions are derived (layout below), because
 * the most common edit is trimming a clip, and a stored position would make
 * every trim a rewrite of everything after it. B-roll is anchored to the clip it
 * covers, by offset, so it moves with its line when earlier lines change length.
 * Music and text sit at absolute output times, since they belong to the video
 * rather than to any line.
 *
 * ── CAPTIONS LIVE IN RECORDING TIME ──────────────────────────────────────────
 * `segments` is what was said, with the stretch of the RECORDING it was said in.
 * Captions are placed by mapping each segment through whichever clips play that
 * stretch, so a trim, a cut or a reorder carries the captions with it, and a
 * translation (segment.tr) is shown for exactly the speech it translates.
 * A project analysed before segments existed has none stored; segmentsOf()
 * derives them from what the clips and takes say, with ids that come out the
 * same every time, so the browser and the server name them identically.
 *
 * The browser keeps a copy of this arithmetic for the preview
 * (src/components/Edit/model.js). The server's copy is the one the render uses,
 * so if the two ever disagree, the export is right and the preview is wrong.
 *
 *   clips    [{ id, line, text, roman, media, in, out, enabled, missing,
 *              take_id, said, said_roman, takes: [{ id, media, in, out, score,
 *              said, said_roman }] }]
 *   segments [{ id, media, start, end, text, roman, tr: { [lang]: text } }]
 *   sources  [media id]  recordings already given clips (videos uploaded on their own)
 *   broll    [{ id, shot, label, source, clip, offset, duration, media, media_in,
 *              fit: "contain" | "cover",
 *              layout: "full" | "split" | "pip",
 *              side: "top" | "bottom",   split: which half the B-roll takes
 *              ratio,                    split: the B-roll's share, 0.3..0.7
 *              x, y, w }]                pip: centre and width, fractions of the frame
 *   audio    [{ id, media, start, in, duration, volume, fade_in, fade_out }]
 *   texts    [{ id, text, start, duration, position: "top"|"middle"|"bottom",
 *              size: "s"|"m"|"l", x, y }]
 *   captions { mode: "roman"|"native"|"tr"|"off", lang, source: "said"|"script",
 *              style: "bold"|"clean"|"box", position: "top"|"middle"|"bottom",
 *              size: "s"|"m"|"l", x, y }
 *   unused   [{ id, media, in, out, said, said_roman }]  speech that matched no line
 *   aspect   "9:16" | "16:9" | "1:1" | "4:5"
 *   voice_volume  0..2
 *
 * x and y, wherever they appear, are null until somebody drags the thing; null
 * means "where its position preset puts it".
 */
import crypto from "crypto";
import { LANGUAGE_CODES } from "./languages.js";

export const ASPECTS = {
  "9:16": [1080, 1920],
  "16:9": [1920, 1080],
  "1:1": [1080, 1080],
  "4:5": [1080, 1350],
};

const LIMITS = { clips: 600, broll: 200, audio: 12, texts: 120, unused: 400, takes: 8, segments: 3000, sources: 60 };

export const newId = (prefix) => `${prefix}_${crypto.randomBytes(5).toString("hex")}`;

const r3 = (n) => Math.round(Number(n) * 1000) / 1000;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(Number(n)) ? Number(n) : lo));
const str = (v, max) => String(v ?? "").slice(0, max);
const isSet = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
const num = (v, d) => (isSet(v) ? Number(v) : d);
const frac = (v) => (isSet(v) ? Math.round(clamp(v, 0, 1) * 1000) / 1000 : null);

/**
 * Shots whose "footage" is the creator talking, which is the recording itself
 * and needs no slot. The shot list names these alongside real cutaways.
 */
const A_ROLL = /\b(on[- ]camera|a-?roll|talking head|to camera|face ?cam|selfie|presenter)\b/i;

export const defaultCaptions = (mode = "native") => ({
  mode, lang: "", source: "said", style: "bold", position: "bottom", size: "m", x: null, y: null,
});

/** Transcribed stretches of speech, as caption segments. */
export function segmentsFromPieces(pieces) {
  return (pieces || [])
    .filter((p) => (p.text || p.roman) && Number(p.end) > Number(p.start))
    .slice(0, LIMITS.segments)
    .map((p) => ({
      id: newId("sg"),
      media: p.media,
      start: r3(p.start),
      end: r3(p.end),
      text: str(p.text || p.roman, 1000),
      roman: str(p.roman || p.text, 1000),
      tr: {},
    }));
}

/**
 * The first edit, straight from the matching.
 *
 * @param {object} input
 * @param {object} input.alignment   from alignRecording()
 * @param {Array}  input.shots       the script's shoot pack shots
 * @param {string} input.aspect
 * @param {boolean} input.hasRoman   whether captions can start in Roman
 * @param {Array}  [input.pieces]    the transcribed stretches, for captions
 */
export function buildInitialTimeline({ alignment, shots = [], aspect = "9:16", hasRoman = true, pieces = null }) {
  const clips = alignment.clips.map((c) => {
    const takes = c.takes.slice(0, LIMITS.takes).map((t) => ({ id: newId("tk"), ...t }));
    const chosen = c.chosen >= 0 && c.chosen < takes.length ? takes[c.chosen] : null;
    return {
      id: newId("cl"),
      line: c.line,
      text: c.text,
      roman: c.roman,
      media: chosen ? chosen.media : null,
      in: chosen ? chosen.in : 0,
      out: chosen ? chosen.out : 0,
      enabled: !!chosen,
      missing: !chosen,
      take_id: chosen ? chosen.id : null,
      said: chosen ? chosen.said : "",
      said_roman: chosen ? chosen.said_roman : "",
      takes,
    };
  });

  const byLine = new Map(clips.map((c) => [c.line, c]));
  const broll = [];
  for (const s of shots) {
    if (A_ROLL.test(`${s.what || ""} ${s.source || ""}`)) continue;
    const clip = byLine.get(Number(s.line));
    if (!clip) continue;
    const length = clip.enabled ? clip.out - clip.in : Math.max(1, Number(s.to) - Number(s.from) || 3);
    broll.push({
      id: newId("br"),
      shot: s.n,
      label: str(s.what, 120),
      source: str(s.source, 160),
      clip: clip.id,
      offset: 0,
      duration: r3(Math.max(0.5, length)),
      media: null,
      media_in: 0,
      // Contain, over a blurred copy of itself: shot lists ask for screenshots,
      // spec tables and logos, which a cover crop would cut the edges off.
      fit: "contain",
      layout: "full",
      side: "top",
      ratio: 0.5,
      x: null,
      y: null,
      w: null,
    });
  }

  const tl = {
    aspect: ASPECTS[aspect] ? aspect : "9:16",
    voice_volume: 1,
    captions: defaultCaptions(hasRoman ? "roman" : "native"),
    clips,
    broll,
    audio: [],
    texts: [],
    unused: alignment.unused.slice(0, LIMITS.unused).map((u) => ({ id: newId("un"), ...u })),
  };
  if (Array.isArray(pieces)) tl.segments = segmentsFromPieces(pieces);
  return tl;
}

const freeClip = (r) => ({
  id: newId("cl"), line: null, text: "", roman: "", media: r.id, in: 0, out: r3(r.duration),
  enabled: true, missing: false, take_id: null, said: "", said_roman: "", takes: [],
});

/**
 * The first edit of a video uploaded on its own: every recording whole, in
 * order, with whatever was said as captions.
 */
export function buildFreeTimeline({ recordings, segments = [], aspect = "9:16" }) {
  return {
    aspect: ASPECTS[aspect] ? aspect : "9:16",
    voice_volume: 1,
    captions: defaultCaptions("native"),
    clips: recordings.map(freeClip),
    segments,
    sources: recordings.map((r) => r.id),
    broll: [],
    audio: [],
    texts: [],
    unused: [],
  };
}

/**
 * An existing free edit, with recordings added since appended at the end, and,
 * when given, the captions of newly transcribed recordings.
 *
 * `sources` is what stops a recording the creator cut out entirely from coming
 * back: only recordings the edit has never had are appended.
 */
export function mergeFreeTimeline(tl, { recordings, segments = null }) {
  const known = new Set([...(tl.sources || []), ...(tl.clips || []).map((c) => c.media).filter(Boolean)]);
  const fresh = recordings.filter((r) => !known.has(r.id));
  const next = {
    ...tl,
    clips: [...(tl.clips || []), ...fresh.map(freeClip)],
    sources: [...known, ...fresh.map((r) => r.id)],
  };
  if (Array.isArray(segments)) {
    const replaced = new Set(segments.map((s) => s.media));
    next.segments = [...segmentsOf(tl).filter((s) => !replaced.has(s.media)), ...segments];
  }
  return next;
}

/** Output positions of everything, from the stored order and in/out points. */
export function layout(tl) {
  let t = 0;
  const clips = (tl?.clips || []).map((c) => {
    if (!c.enabled || !c.media || !(c.out > c.in)) return { ...c, start: null, end: null };
    const start = t;
    t += c.out - c.in;
    return { ...c, start, end: t };
  });
  const byId = new Map(clips.map((c) => [c.id, c]));
  const broll = (tl?.broll || []).map((b) => {
    const c = byId.get(b.clip);
    if (!c || c.start === null) return { ...b, start: null, end: null };
    const start = Math.min(c.start + Math.max(0, Number(b.offset) || 0), t);
    return { ...b, start, end: Math.min(start + Math.max(0.1, Number(b.duration) || 0), t) };
  });
  return { duration: t, clips, broll };
}

/**
 * The caption segments: stored ones, or for an edit made before they were
 * stored, the same thing read off its clips, takes and set-aside speech.
 */
export function segmentsOf(tl) {
  if (Array.isArray(tl?.segments)) return tl.segments;
  const out = [];
  const add = (media, a, b, said, roman) => {
    if (!media || !(b > a) || !(said || roman)) return;
    if (out.some((s) => s.media === media && Math.min(s.end, b) - Math.max(s.start, a) > 0.05)) return;
    out.push({ id: `sg_${media}_${Math.round(a * 1000)}_${Math.round(b * 1000)}`, media, start: a, end: b, text: said || roman, roman: roman || said, tr: {} });
  };
  for (const c of tl?.clips || []) {
    const take = (c.takes || []).find((t) => t.id === c.take_id);
    if (take) add(take.media, take.in, take.out, take.said, take.said_roman);
    else add(c.media, c.in, c.out, c.said, c.said_roman);
  }
  for (const c of tl?.clips || []) for (const t of c.takes || []) add(t.media, t.in, t.out, t.said, t.said_roman);
  for (const u of tl?.unused || []) add(u.media, u.in, u.out, u.said, u.said_roman);
  return out;
}

/** Every segment the edit plays, with the stretch of output it lands on. */
export function placedSegments(tl, lay = layout(tl)) {
  const byMedia = new Map();
  for (const s of segmentsOf(tl)) {
    if (!(s.end > s.start)) continue;
    if (!byMedia.has(s.media)) byMedia.set(s.media, []);
    byMedia.get(s.media).push(s);
  }
  for (const list of byMedia.values()) list.sort((a, b) => a.start - b.start);
  const out = [];
  for (const c of lay.clips) {
    if (c.start === null) continue;
    for (const s of byMedia.get(c.media) || []) {
      if (s.end <= c.in + 0.02 || s.start >= c.out - 0.02) continue;
      out.push({ seg: s, clip: c, start: c.start + Math.max(0, s.start - c.in), end: c.start + Math.min(s.end, c.out) - c.in });
    }
  }
  return out;
}

/** The words of a segment in the letters the captions are set to. */
export function captionText(seg, cap = {}) {
  if (cap.mode === "tr") return seg.tr?.[cap.lang] || seg.text || seg.roman || "";
  if (cap.mode === "roman") return seg.roman || seg.text || "";
  return seg.text || seg.roman || "";
}

function groupWords(text, words, chars) {
  const all = String(text || "").split(/\s+/).filter(Boolean);
  const groups = [];
  let cur = [];
  for (const w of all) {
    if (cur.length && (cur.length >= words || [...cur, w].join(" ").length > chars)) {
      groups.push(cur.join(" "));
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length) groups.push(cur.join(" "));
  return groups;
}

/**
 * Caption cues: what is on screen, and when.
 *
 * Each segment's words are split into short groups and spread across the
 * segment in proportion to their length. Short groups are how captions are read
 * on a phone: one line of four or five words, gone before it becomes a
 * paragraph. A group is kept when its middle falls inside a clip, so trimming
 * the start of a sentence takes its first words' caption with it.
 */
export function captionCues(tl, { maxWords, maxChars } = {}) {
  const cap = tl?.captions || {};
  if (cap.mode === "off") return [];
  const wide = tl?.aspect === "16:9";
  const words = maxWords || (wide ? 8 : 4);
  const chars = maxChars || (wide ? 42 : 24);
  const lay = layout(tl);
  const cues = [];

  if (cap.mode === "tr" || cap.source !== "script") {
    for (const { seg, clip } of placedSegments(tl, lay)) {
      const groups = groupWords(captionText(seg, cap), words, chars);
      if (!groups.length) continue;
      const total = groups.reduce((n, g) => n + g.length, 0) || 1;
      let at = seg.start;
      for (const g of groups) {
        const d = (seg.end - seg.start) * (g.length / total);
        const mid = at + d / 2;
        if (mid >= clip.in && mid < clip.out) {
          const start = clip.start + Math.max(at, clip.in) - clip.in;
          const end = clip.start + Math.min(at + d, clip.out) - clip.in;
          if (end - start > 0.04) cues.push({ start, end, text: g, seg: seg.id });
        }
        at += d;
      }
    }
    return cues.sort((a, b) => a.start - b.start);
  }

  // The script, word for word, spread over each line.
  for (const c of lay.clips) {
    if (c.start === null) continue;
    const text = cap.mode === "native" ? c.text : c.roman || c.text;
    const groups = groupWords(text, words, chars);
    if (!groups.length) continue;
    const total = groups.reduce((n, g) => n + g.length, 0) || 1;
    let at = c.start;
    for (const g of groups) {
      const d = (c.end - c.start) * (g.length / total);
      cues.push({ start: at, end: at + d, text: g, seg: null });
      at += d;
    }
  }
  return cues;
}

/* ── Where things sit on the frame ─────────────────────────────────────────
   Shared with the preview (model.js), in output pixels. Captions and text are
   anchored at their centre, with a wrap width that narrows as they are dragged
   towards an edge, so they never run off the frame in the export or the
   preview. */

const SIZE_MUL = { s: 0.8, m: 1, l: 1.25 };
const TEXT_SIZE = { s: 0.05, m: 0.064, l: 0.085 };

function placeBox(x, y, fx, fy, W, H, maxFrac) {
  const rx = clamp(num(x, fx), 0, 1);
  const ry = clamp(num(y, fy), 0.04, 0.96);
  const pad = W * 0.04;
  const half = Math.min(rx, 1 - rx) - 0.04;
  const boxW = Math.round(W * Math.max(0.4, Math.min(maxFrac, half * 2)));
  const cx = Math.round(Math.min(W - boxW / 2 - pad, Math.max(boxW / 2 + pad, rx * W)));
  const cy = Math.round(ry * H);
  return { cx, cy, boxW, left: cx - boxW / 2, x: cx / W, y: cy / H };
}

export function captionPlacement(tl, W, H) {
  const cap = tl?.captions || {};
  const portrait = H > W;
  const fy = cap.position === "middle" ? 0.5 : cap.position === "top" ? (portrait ? 0.2 : 0.14) : portrait ? 0.77 : 0.86;
  const size = Math.round(Math.min(W, H) * (cap.style === "clean" ? 0.062 : 0.075) * (SIZE_MUL[cap.size] || 1));
  return { ...placeBox(cap.x, cap.y, 0.5, fy, W, H, 0.84), size };
}

export function textPlacement(t, W, H) {
  const edge = H > W ? 0.16 : 0.12;
  const fy = t?.position === "middle" ? 0.5 : t?.position === "bottom" ? 1 - edge : edge;
  const size = Math.round(Math.min(W, H) * (TEXT_SIZE[t?.size] || TEXT_SIZE.m));
  return { ...placeBox(t?.x, t?.y, 0.5, fy, W, H, 0.86), size };
}

const even = (n) => Math.max(2, 2 * Math.round(n / 2));

/** An overlay's box: its own shape, `w` of the frame wide, kept inside the frame. */
export function pipPlacement(b, media, W, H) {
  const ratio = media?.width > 0 && media?.height > 0 ? media.width / media.height : 16 / 9;
  let pw = even(W * clamp(num(b?.w, 0.5), 0.15, 1));
  let ph = even(pw / ratio);
  if (ph > H) {
    ph = even(H);
    pw = even(ph * ratio);
  }
  const cx = Math.min(W - pw / 2, Math.max(pw / 2, num(b?.x, 0.5) * W));
  const cy = Math.min(H - ph / 2, Math.max(ph / 2, num(b?.y, 0.32) * H));
  return { pw, ph, left: Math.round(cx - pw / 2), top: Math.round(cy - ph / 2), x: cx / W, y: cy / H, w: pw / W };
}

/**
 * A split screen: the B-roll's pane, the creator's pane, and which band of the
 * full-frame creator shot fills theirs (the middle, where a face usually is).
 * Portrait and square frames split top and bottom; a landscape one, left and
 * right ("top" is then the left).
 */
export function splitPanes(b, W, H) {
  const ratio = clamp(num(b?.ratio, 0.5), 0.3, 0.7);
  const first = b?.side !== "bottom";
  if (W > H) {
    const bw = 2 * Math.round((W * ratio) / 2);
    const cw = W - bw;
    return {
      across: true,
      broll: { x: first ? 0 : cw, y: 0, w: bw, h: H },
      creator: { x: first ? bw : 0, y: 0, w: cw, h: H },
      crop: { x: Math.round((W - cw) / 2), y: 0, w: cw, h: H },
    };
  }
  const bh = 2 * Math.round((H * ratio) / 2);
  const ch = H - bh;
  return {
    across: false,
    broll: { x: 0, y: first ? 0 : ch, w: W, h: bh },
    creator: { x: 0, y: first ? bh : 0, w: W, h: ch },
    crop: { x: 0, y: Math.round((H - ch) / 2), w: W, h: ch },
  };
}

/**
 * Validate a timeline sent by the browser against the project it belongs to.
 *
 * Everything is clamped rather than refused where a clamp is obviously right (a
 * trim a few milliseconds past the end of the file), and refused where it is
 * not (a clip pointing at a file this project does not own). Fields the schema
 * does not name are dropped: this document is fed to ffmpeg.
 *
 * @param {object} input
 * @param {Map<string, object>} mediaById  this project's READY media
 * @throws Error with .userMessage
 */
export function sanitizeTimeline(input, mediaById) {
  const bad = (msg) => Object.assign(new Error(msg), { userMessage: msg });
  if (!input || typeof input !== "object") throw bad("That edit could not be read.");

  const mediaOk = (id, types) => {
    const m = mediaById.get(String(id || ""));
    return m && (!types || types.includes(m.type)) ? m : null;
  };
  const span = (m, a, b) => {
    const max = Number(m?.duration) || 0;
    const inn = clamp(a, 0, Math.max(0, max - 0.05));
    const out = clamp(b, inn + 0.05, max || inn + 0.05);
    return [r3(inn), r3(out)];
  };

  const clips = [];
  for (const c of (Array.isArray(input.clips) ? input.clips : []).slice(0, LIMITS.clips)) {
    const m = mediaOk(c.media, ["video"]);
    const takes = [];
    for (const t of (Array.isArray(c.takes) ? c.takes : []).slice(0, LIMITS.takes)) {
      const tm = mediaOk(t.media, ["video"]);
      if (!tm) continue;
      const [tin, tout] = span(tm, t.in, t.out);
      takes.push({
        id: str(t.id, 40), media: tm.id, in: tin, out: tout,
        score: clamp(t.score, 0, 1), said: str(t.said, 1000), said_roman: str(t.said_roman, 1000),
      });
    }
    const [cin, cout] = m ? span(m, c.in, c.out) : [0, 0];
    clips.push({
      id: str(c.id, 40) || newId("cl"),
      line: c.line === null || c.line === undefined ? null : Number(c.line) || null,
      text: str(c.text, 1000),
      roman: str(c.roman, 1000),
      media: m ? m.id : null,
      in: cin,
      out: cout,
      enabled: !!c.enabled && !!m,
      missing: !m,
      take_id: c.take_id ? str(c.take_id, 40) : null,
      said: str(c.said, 1000),
      said_roman: str(c.said_roman, 1000),
      takes,
    });
  }

  const clipIds = new Set(clips.map((c) => c.id));
  const broll = [];
  for (const b of (Array.isArray(input.broll) ? input.broll : []).slice(0, LIMITS.broll)) {
    if (!clipIds.has(String(b.clip))) continue;
    const m = b.media ? mediaOk(b.media, ["video", "image"]) : null;
    broll.push({
      id: str(b.id, 40) || newId("br"),
      shot: b.shot === null || b.shot === undefined ? null : Number(b.shot) || null,
      label: str(b.label, 120),
      source: str(b.source, 160),
      clip: String(b.clip),
      offset: r3(clamp(b.offset, 0, 3600)),
      duration: r3(clamp(b.duration, 0.3, 600)),
      media: m ? m.id : null,
      media_in: m && m.type === "video" ? r3(clamp(b.media_in, 0, Math.max(0, (m.duration || 0) - 0.1))) : 0,
      fit: b.fit === "cover" ? "cover" : "contain",
      layout: ["split", "pip"].includes(b.layout) ? b.layout : "full",
      side: b.side === "bottom" ? "bottom" : "top",
      ratio: Math.round(clamp(num(b.ratio, 0.5), 0.3, 0.7) * 1000) / 1000,
      x: frac(b.x),
      y: frac(b.y),
      w: isSet(b.w) ? Math.round(clamp(b.w, 0.15, 1) * 1000) / 1000 : null,
    });
  }

  const audio = [];
  for (const a of (Array.isArray(input.audio) ? input.audio : []).slice(0, LIMITS.audio)) {
    const m = mediaOk(a.media, ["audio", "video"]);
    if (!m) continue;
    const max = Number(m.duration) || 0;
    const inn = r3(clamp(a.in, 0, Math.max(0, max - 0.1)));
    audio.push({
      id: str(a.id, 40) || newId("au"),
      media: m.id,
      start: r3(clamp(a.start, 0, 7200)),
      in: inn,
      duration: r3(clamp(a.duration, 0.2, Math.max(0.2, max - inn))),
      volume: Math.round(clamp(a.volume, 0, 2) * 100) / 100,
      fade_in: r3(clamp(a.fade_in, 0, 10)),
      fade_out: r3(clamp(a.fade_out, 0, 10)),
    });
  }

  const texts = [];
  for (const t of (Array.isArray(input.texts) ? input.texts : []).slice(0, LIMITS.texts)) {
    const text = str(t.text, 200).trim();
    if (!text) continue;
    texts.push({
      id: str(t.id, 40) || newId("tx"),
      text,
      start: r3(clamp(t.start, 0, 7200)),
      duration: r3(clamp(t.duration, 0.3, 600)),
      position: ["top", "middle", "bottom"].includes(t.position) ? t.position : "top",
      size: ["s", "m", "l"].includes(t.size) ? t.size : "m",
      x: frac(t.x),
      y: frac(t.y),
    });
  }

  const unused = [];
  for (const u of (Array.isArray(input.unused) ? input.unused : []).slice(0, LIMITS.unused)) {
    const m = mediaOk(u.media, ["video"]);
    if (!m) continue;
    const [uin, uout] = span(m, u.in, u.out);
    unused.push({ id: str(u.id, 40) || newId("un"), media: m.id, in: uin, out: uout, said: str(u.said, 1000), said_roman: str(u.said_roman, 1000) });
  }

  const cap = input.captions || {};
  const lang = LANGUAGE_CODES.has(cap.lang) ? cap.lang : "";
  const out = {
    aspect: ASPECTS[input.aspect] ? input.aspect : "9:16",
    voice_volume: Math.round(clamp(input.voice_volume ?? 1, 0, 2) * 100) / 100,
    captions: {
      mode: ["roman", "native", "off"].includes(cap.mode) ? cap.mode : cap.mode === "tr" && lang ? "tr" : "native",
      lang,
      source: cap.source === "script" ? "script" : "said",
      style: ["bold", "clean", "box"].includes(cap.style) ? cap.style : "bold",
      position: ["top", "middle"].includes(cap.position) ? cap.position : "bottom",
      size: ["s", "m", "l"].includes(cap.size) ? cap.size : "m",
      x: frac(cap.x),
      y: frac(cap.y),
    },
    clips,
    broll,
    audio,
    texts,
    unused,
  };

  // Absent stays absent, so an older edit keeps deriving its captions.
  if (Array.isArray(input.segments)) {
    const seen = new Set();
    out.segments = [];
    for (const s of input.segments.slice(0, LIMITS.segments)) {
      const m = mediaOk(s.media, ["video"]);
      const id = str(s.id, 60);
      if (!m || !id || seen.has(id)) continue;
      seen.add(id);
      const [start, end] = span(m, s.start, s.end);
      const tr = {};
      for (const [k, v] of Object.entries(s.tr && typeof s.tr === "object" ? s.tr : {})) {
        if (LANGUAGE_CODES.has(k) && typeof v === "string") tr[k] = str(v, 1000);
      }
      out.segments.push({ id, media: m.id, start, end, text: str(s.text, 1000), roman: str(s.roman, 1000), tr });
    }
  }
  if (Array.isArray(input.sources)) {
    out.sources = [...new Set(input.sources.map(String))].filter((id) => mediaOk(id, ["video"])).slice(0, LIMITS.sources);
  }
  return out;
}

export default {
  ASPECTS, newId, defaultCaptions, segmentsFromPieces, buildInitialTimeline, buildFreeTimeline, mergeFreeTimeline,
  layout, segmentsOf, placedSegments, captionText, captionCues, captionPlacement, textPlacement, pipPlacement,
  splitPanes, sanitizeTimeline,
};

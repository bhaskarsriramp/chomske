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
 * The browser keeps a copy of layout() and captionCues() for the preview
 * (src/components/Edit/model.js). The server's copy is the one the render uses,
 * so if the two ever disagree, the export is right and the preview is wrong.
 *
 *   clips    [{ id, line, text, roman, media, in, out, enabled, missing,
 *              take_id, said, said_roman, takes: [{ id, media, in, out, score,
 *              said, said_roman }] }]
 *   broll    [{ id, shot, label, source, clip, offset, duration, media,
 *              media_in, fit: "contain" | "cover" }]
 *   audio    [{ id, media, start, in, duration, volume, fade_in, fade_out }]
 *   texts    [{ id, text, start, duration, position: "top"|"middle"|"bottom",
 *              size: "s"|"m"|"l" }]
 *   captions { mode: "roman"|"native"|"off", source: "said"|"script",
 *              style: "bold"|"clean"|"box", position: "bottom"|"middle",
 *              size: "s"|"m"|"l" }
 *   unused   [{ id, media, in, out, said, said_roman }]  speech that matched no line
 *   aspect   "9:16" | "16:9" | "1:1" | "4:5"
 *   voice_volume  0..2
 */
import crypto from "crypto";

export const ASPECTS = {
  "9:16": [1080, 1920],
  "16:9": [1920, 1080],
  "1:1": [1080, 1080],
  "4:5": [1080, 1350],
};

const LIMITS = { clips: 600, broll: 200, audio: 12, texts: 120, unused: 400, takes: 8 };

export const newId = (prefix) => `${prefix}_${crypto.randomBytes(5).toString("hex")}`;

const r3 = (n) => Math.round(Number(n) * 1000) / 1000;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(Number(n)) ? Number(n) : lo));
const str = (v, max) => String(v ?? "").slice(0, max);

/**
 * Shots whose "footage" is the creator talking, which is the recording itself
 * and needs no slot. The shot list names these alongside real cutaways.
 */
const A_ROLL = /\b(on[- ]camera|a-?roll|talking head|to camera|face ?cam|selfie|presenter)\b/i;

/**
 * The first edit, straight from the matching.
 *
 * @param {object} input
 * @param {object} input.alignment   from alignRecording()
 * @param {Array}  input.shots       the script's shoot pack shots
 * @param {string} input.aspect
 * @param {boolean} input.hasRoman   whether captions can start in Roman
 */
export function buildInitialTimeline({ alignment, shots = [], aspect = "9:16", hasRoman = true }) {
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
    });
  }

  return {
    aspect: ASPECTS[aspect] ? aspect : "9:16",
    voice_volume: 1,
    captions: { mode: hasRoman ? "roman" : "native", source: "said", style: "bold", position: "bottom", size: "m" },
    clips,
    broll,
    audio: [],
    texts: [],
    unused: alignment.unused.slice(0, LIMITS.unused).map((u) => ({ id: newId("un"), ...u })),
  };
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
 * Caption cues: what is on screen, and when.
 *
 * Each clip's words are split into short groups and spread across the clip in
 * proportion to their length. Short groups are how captions are read on a
 * phone: one line of four or five words, gone before it becomes a paragraph.
 */
export function captionCues(tl, { maxWords, maxChars } = {}) {
  const cap = tl?.captions || {};
  if (cap.mode === "off") return [];
  const wide = tl?.aspect === "16:9";
  const words = maxWords || (wide ? 8 : 4);
  const chars = maxChars || (wide ? 42 : 24);

  const cues = [];
  for (const c of layout(tl).clips) {
    if (c.start === null) continue;
    const said = cap.source !== "script";
    const text = cap.mode === "native"
      ? (said ? c.said : "") || c.text
      : (said ? c.said_roman : "") || c.roman || c.text;
    const all = String(text || "").split(/\s+/).filter(Boolean);
    if (!all.length) continue;

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

    const total = groups.reduce((n, g) => n + g.length, 0) || 1;
    let at = c.start;
    for (const g of groups) {
      const d = (c.end - c.start) * (g.length / total);
      cues.push({ start: at, end: at + d, text: g });
      at += d;
    }
  }
  return cues;
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
  return {
    aspect: ASPECTS[input.aspect] ? input.aspect : "9:16",
    voice_volume: Math.round(clamp(input.voice_volume ?? 1, 0, 2) * 100) / 100,
    captions: {
      mode: ["roman", "native", "off"].includes(cap.mode) ? cap.mode : "roman",
      source: cap.source === "script" ? "script" : "said",
      style: ["bold", "clean", "box"].includes(cap.style) ? cap.style : "bold",
      position: cap.position === "middle" ? "middle" : "bottom",
      size: ["s", "m", "l"].includes(cap.size) ? cap.size : "m",
    },
    clips,
    broll,
    audio,
    texts,
    unused,
  };
}

export default { ASPECTS, newId, buildInitialTimeline, layout, captionCues, sanitizeTimeline };

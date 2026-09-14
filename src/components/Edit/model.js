/**
 * model.js: the edit's arithmetic, for the preview.
 *
 * ── A COPY, ON PURPOSE, OF backend/services/edit/timeline.js ─────────────────
 * layout(), captionCues() and the placement functions are duplicated from the
 * server because the preview has to answer "what is on screen at 0:12.4, and
 * where" sixty times a second, and no round trip can do that. The server's copy
 * is the one the export uses. If the two ever disagree the export is right and
 * this is the bug, so change them together.
 */

export const ASPECTS = {
  "9:16": [1080, 1920],
  "16:9": [1920, 1080],
  "1:1": [1080, 1080],
  "4:5": [1080, 1350],
};

export const newId = (prefix) => `${prefix}_${Math.random().toString(16).slice(2, 12)}`;

export const clone = (x) => (typeof structuredClone === "function" ? structuredClone(x) : JSON.parse(JSON.stringify(x)));

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(Number(n)) ? Number(n) : lo));
const isSet = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
const num = (v, d) => (isSet(v) ? Number(v) : d);

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

/** An edit with its caption segments stored, so they can be corrected and translated. */
export function withSegments(tl) {
  if (!tl || Array.isArray(tl.segments)) return tl;
  return { ...tl, segments: segmentsOf(tl) };
}

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

export function captionCues(tl) {
  const cap = tl?.captions || {};
  if (cap.mode === "off") return [];
  const wide = tl?.aspect === "16:9";
  const words = wide ? 8 : 4;
  const chars = wide ? 42 : 24;
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

/* ── Sentences ─────────────────────────────────────────────────────────────
   A stretch of speech with no pause in it can hold three sentences, and a
   caption section that long is too coarse to place or style on its own. So a
   stretch is split at its sentence ends, with the time shared out by length:
   the same proportion the caption cues already use, so no word moves. */

/** "One. Two? Three." as ["One.", "Two?", "Three."]. The danda counts. */
export function splitSentences(text) {
  const out = [];
  let cur = "";
  for (const token of String(text || "").split(/(\s+)/)) {
    cur += token;
    if (/[.?!\u0964\u0965]$/.test(token)) {
      out.push(cur.trim());
      cur = "";
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

/** Words shared into parts by weight, each word going where its middle falls. */
function divide(text, weights) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const total = weights.reduce((n, w) => n + w, 0) || 1;
  const chars = words.reduce((n, w) => n + w.length + 1, 0) || 1;
  const out = weights.map(() => []);
  let at = 0;
  for (const w of words) {
    const mid = (at + (w.length + 1) / 2) / chars;
    let k = 0;
    let acc = weights[0] / total;
    while (k < weights.length - 1 && mid >= acc) {
      k++;
      acc += weights[k] / total;
    }
    out[k].push(w);
    at += w.length + 1;
  }
  return out.map((ws) => ws.join(" "));
}

/**
 * A segment holding several sentences, as one segment per sentence (keeping
 * the original's id, for the caller to replace), or null. A sentence too short
 * to read on its own joins its neighbour.
 */
export function sentencePieces(seg, minSeconds = 0.7) {
  const parts = splitSentences(seg?.text);
  if (parts.length < 2 || !(seg.end > seg.start)) return null;
  const dur = seg.end - seg.start;
  const total = parts.reduce((n, p) => n + p.length, 0) || 1;
  const groups = [];
  parts.forEach((p, i) => {
    const d = (dur * p.length) / total;
    const last = groups[groups.length - 1];
    if (last && (d < minSeconds || last.d < minSeconds)) {
      last.to = i;
      last.d += d;
      last.len += p.length;
    } else {
      groups.push({ from: i, to: i, d, len: p.length });
    }
  });
  if (groups.length < 2) return null;
  const weights = groups.map((g) => g.len);
  const alike = (other) => {
    const ps = splitSentences(other);
    return ps.length === parts.length ? groups.map((g) => ps.slice(g.from, g.to + 1).join(" ")) : divide(other, weights);
  };
  const roman = alike(seg.roman);
  const tr = Object.entries(seg.tr || {}).map(([k, v]) => [k, alike(v)]);
  let at = seg.start;
  return groups.map((g, i) => {
    const end = i === groups.length - 1 ? seg.end : at + (dur * g.len) / total;
    const piece = {
      ...seg,
      start: Math.round(at * 1000) / 1000,
      end: Math.round(end * 1000) / 1000,
      text: parts.slice(g.from, g.to + 1).join(" "),
      roman: roman[i],
      tr: Object.fromEntries(tr.map(([k, v]) => [k, v[i]])),
    };
    at = end;
    return piece;
  });
}

/**
 * How one caption looks: the captions' own settings, with whatever that
 * section was given on its own (seg.custom) on top.
 */
export function captionLook(tl, seg = null) {
  const cap = tl?.captions || {};
  const c = seg?.custom || {};
  return {
    style: c.style || cap.style || "bold",
    size: c.size || cap.size || "m",
    color: c.color || cap.color || "#FFFFFF",
    position: cap.position,
    x: isSet(c.x) ? Number(c.x) : cap.x,
    y: isSet(c.y) ? Number(c.y) : cap.y,
  };
}

/** Where a position preset puts the middle of the captions, as a fraction of the height. */
export function captionPresetY(position, W, H) {
  const portrait = H > W;
  return position === "middle" ? 0.5 : position === "top" ? (portrait ? 0.2 : 0.14) : portrait ? 0.77 : 0.86;
}

/* ── Placement, in output pixels (see timeline.js) ─────────────────────── */

const SIZE_MUL = { s: 0.8, m: 1, l: 1.25, xl: 1.55 };
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

/** A caption's box and font size; `seg` for one section's own look and place. */
export function captionPlacement(tl, W, H, seg = null) {
  const look = captionLook(tl, seg);
  const size = Math.round(Math.min(W, H) * (look.style === "clean" ? 0.062 : 0.075) * (SIZE_MUL[look.size] || 1));
  return { ...placeBox(look.x, look.y, 0.5, captionPresetY(look.position, W, H), W, H, 0.84), size };
}

export function textPlacement(t, W, H) {
  const edge = H > W ? 0.16 : 0.12;
  const fy = t?.position === "middle" ? 0.5 : t?.position === "bottom" ? 1 - edge : edge;
  const size = Math.round(Math.min(W, H) * (TEXT_SIZE[t?.size] || TEXT_SIZE.m));
  return { ...placeBox(t?.x, t?.y, 0.5, fy, W, H, 0.86), size };
}

const even = (n) => Math.max(2, 2 * Math.round(n / 2));

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

/* ── Editing helpers ───────────────────────────────────────────────────── */

/** The enabled clip playing at output time t, or the last one at the very end. */
export function activeClipIndex(clips, t) {
  for (let i = 0; i < clips.length; i++) {
    if (t >= clips[i].start && t < clips[i].end) return i;
  }
  return clips.length && t >= clips[clips.length - 1].end - 1e-6 ? clips.length - 1 : -1;
}

/** Which clip is on screen at output time t, for B-roll anchoring. */
export function anchorAt(lay, t) {
  const on = lay.clips.filter((c) => c.start !== null);
  const i = activeClipIndex(on, t);
  if (i < 0) return null;
  return { clip: on[i], offset: Math.max(0, t - on[i].start) };
}

/**
 * Cut the clip under output time t in two, on a draft timeline. B-roll past the
 * cut moves to the second half so it stays where it was on screen. Returns the
 * new clip's id, or null when t is too close to an edge to leave two parts.
 */
export function splitClipAt(d, t) {
  const at = anchorAt(layout(d), t);
  if (!at) return null;
  const { clip, offset } = at;
  const len = clip.out - clip.in;
  if (offset < 0.2 || len - offset < 0.2) return null;
  const i = d.clips.findIndex((c) => c.id === clip.id);
  const cut = Math.round((clip.in + offset) * 1000) / 1000;
  const second = { ...clone(d.clips[i]), id: newId("cl"), in: cut, takes: [], take_id: null };
  d.clips[i].out = cut;
  d.clips.splice(i + 1, 0, second);
  for (const b of d.broll || []) {
    if (b.clip === clip.id && b.offset >= offset) {
      b.clip = second.id;
      b.offset = Math.round((b.offset - offset) * 1000) / 1000;
    }
  }
  return second.id;
}

/**
 * How a cutaway should fill a space by default: fill it when it is roughly the
 * same shape (footage shot for the frame), show all of it when it is not (a
 * screenshot, a table, a logo), which a fill would crop the point out of.
 */
export function fitFor(media, w, h) {
  if (!(media?.width > 0 && media?.height > 0) || !(w > 0 && h > 0)) return "contain";
  const r = media.width / media.height / (w / h);
  return r > 0.82 && r < 1.22 ? "cover" : "contain";
}

/** Every section that holds several sentences, split into one per sentence. Returns how many were split. */
export function splitIntoSentences(d) {
  let split = 0;
  d.segments = segmentsOf(d).flatMap((s) => {
    const parts = sentencePieces(s);
    if (!parts) return [s];
    split++;
    return parts.map((p) => ({ ...p, id: newId("sg") }));
  });
  return split;
}

/**
 * One caption section cut in two at recording time `src`, its words shared by
 * where the cut falls. Returns the two new ids, or null when the cut would
 * leave a part too short or empty.
 */
export function splitSegmentAt(d, id, src) {
  if (!Array.isArray(d.segments)) d.segments = segmentsOf(d);
  const i = d.segments.findIndex((s) => s.id === id);
  const s = d.segments[i];
  if (!s || !(src > s.start + 0.3 && src < s.end - 0.3)) return null;
  const f = (src - s.start) / (s.end - s.start);
  const halves = (t) => divide(t, [f, 1 - f]);
  const text = halves(s.text);
  if (!text[0] || !text[1]) return null;
  const roman = halves(s.roman);
  const tr = Object.entries(s.tr || {}).map(([k, v]) => [k, halves(v)]);
  const cut = Math.round(src * 1000) / 1000;
  const a = { ...s, id: newId("sg"), end: cut, text: text[0], roman: roman[0], tr: Object.fromEntries(tr.map(([k, v]) => [k, v[0]])) };
  const b = { ...s, id: newId("sg"), start: cut, text: text[1], roman: roman[1], tr: Object.fromEntries(tr.map(([k, v]) => [k, v[1]])) };
  d.segments.splice(i, 1, a, b);
  return [a.id, b.id];
}

export function hasIndic(text) {
  return /[ऀ-෿]/.test(String(text || ""));
}

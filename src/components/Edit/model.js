/**
 * model.js: the edit's arithmetic, for the preview.
 *
 * ── A COPY, ON PURPOSE, OF backend/services/edit/timeline.js ─────────────────
 * layout() and captionCues() are duplicated from the server because the
 * preview has to answer "what is on screen at 0:12.4" sixty times a second, and
 * no round trip can do that. The server's copy is the one the export uses. If
 * the two ever disagree the export is right and this is the bug, so change them
 * together.
 */

export const ASPECTS = {
  "9:16": [1080, 1920],
  "16:9": [1920, 1080],
  "1:1": [1080, 1080],
  "4:5": [1080, 1350],
};

export const newId = (prefix) => `${prefix}_${Math.random().toString(16).slice(2, 12)}`;

export const clone = (x) => (typeof structuredClone === "function" ? structuredClone(x) : JSON.parse(JSON.stringify(x)));

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

export function captionCues(tl) {
  const cap = tl?.captions || {};
  if (cap.mode === "off") return [];
  const wide = tl?.aspect === "16:9";
  const words = wide ? 8 : 4;
  const chars = wide ? 42 : 24;

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

/** The enabled clip playing at output time t, or the last one at the very end. */
export function activeClipIndex(clips, t) {
  for (let i = 0; i < clips.length; i++) {
    if (t >= clips[i].start && t < clips[i].end) return i;
  }
  return clips.length && t >= clips[clips.length - 1].end - 1e-6 ? clips.length - 1 : -1;
}

/** Which script-line clip is on screen at output time t, for B-roll anchoring. */
export function anchorAt(lay, t) {
  const on = lay.clips.filter((c) => c.start !== null);
  const i = activeClipIndex(on, t);
  if (i < 0) return null;
  return { clip: on[i], offset: Math.max(0, t - on[i].start) };
}

/** "Telugu-English (Tenglish)" and similar, cut to what fits a chip. */
export function hasIndic(text) {
  return /[ऀ-෿]/.test(String(text || ""));
}

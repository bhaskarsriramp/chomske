/**
 * model.js: the timeline arithmetic, in the browser.
 *
 * ── A DELIBERATE SECOND COPY ─────────────────────────────────────────────────
 * This mirrors backend/services/studio/timeline.js and the camera half of
 * backend/services/studio/render/camera.js. Two copies of the same maths is a
 * real cost and it buys the only thing that makes this editor usable: a preview
 * that moves the way the export will, sixty times a second, with no server in
 * the loop. Asking the server where the camera is for every frame of a scrub is
 * not a thing that can work.
 *
 * If the two ever disagree, THE EXPORT IS RIGHT and this file is the bug.
 * Anything changed there — an easing curve, a ramp length, how a cut maps time —
 * has to be changed here in the same commit.
 *
 * Everything below is pure. No React, no DOM, no fetch: it is called from a
 * render loop and from a canvas painter, and it must not allocate a surprise.
 */

export const ASPECTS = {
  "16:9": [1920, 1080],
  "9:16": [1080, 1920],
  "1:1": [1080, 1080],
  "4:5": [1080, 1350],
};

export const CURSOR_THEMES = ["system", "light", "dark", "ring", "dot", "none"];
export const CAPTION_STYLES = ["trylipi", "hormozi", "apple", "minimal", "neon"];
export const EASINGS = ["smooth", "snappy", "slow", "linear"];
export const BLUR_KINDS = ["blur", "pixelate", "box"];

/** Ids are minted in the browser so a new zoom is selectable before it saves. */
export function newId(prefix) {
  const b = new Uint8Array(5);
  (window.crypto || window.msCrypto).getRandomValues(b);
  return `${prefix}_${[...b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/* ────────────────────────────────────────────────────────────────────────────
   Source time → output time
   ──────────────────────────────────────────────────────────────────────────── */

export function mergedCuts(tl, total = num(tl?.duration)) {
  const raw = (tl?.cuts || [])
    .map((c) => ({ ...c, start: clamp(num(c.start), 0, total), end: clamp(num(c.end), 0, total) }))
    .filter((c) => c.end - c.start > 0.02)
    .sort((a, b) => a.start - b.start);

  const out = [];
  for (const c of raw) {
    const last = out[out.length - 1];
    if (last && c.start <= last.end + 0.001) last.end = Math.max(last.end, c.end);
    else out.push({ ...c });
  }
  return out;
}

export function layout(tl) {
  const total = Math.max(0, num(tl?.duration));
  const cuts = mergedCuts(tl, total);
  const segments = [];
  let cursor = 0;
  let out = 0;
  for (const c of cuts) {
    if (c.start > cursor) {
      const d = c.start - cursor;
      segments.push({ src_start: cursor, src_end: c.start, out_start: out, out_end: out + d });
      out += d;
    }
    cursor = Math.max(cursor, c.end);
  }
  if (cursor < total) {
    const d = total - cursor;
    segments.push({ src_start: cursor, src_end: total, out_start: out, out_end: out + d });
    out += d;
  }
  return { segments, duration: out, removed: total - out };
}

export function toOutput(srcT, lay) {
  for (const s of lay.segments) {
    if (srcT >= s.src_start && srcT <= s.src_end) return s.out_start + (srcT - s.src_start);
  }
  return null;
}

export function toOutputSnapped(srcT, lay) {
  for (const s of lay.segments) {
    if (srcT <= s.src_start) return s.out_start;
    if (srcT <= s.src_end) return s.out_start + (srcT - s.src_start);
  }
  return lay.duration;
}

export function toSource(outT, lay) {
  for (const s of lay.segments) {
    if (outT >= s.out_start && outT <= s.out_end) return s.src_start + (outT - s.out_start);
  }
  return lay.segments.length ? lay.segments[lay.segments.length - 1].src_end : 0;
}

export function spanToOutput(start, end, lay) {
  const out = [];
  for (const s of lay.segments) {
    const a = Math.max(start, s.src_start);
    const b = Math.min(end, s.src_end);
    if (b - a > 0.001) {
      out.push({
        start: s.out_start + (a - s.src_start),
        end: s.out_start + (b - s.src_start),
        src_start: a,
        src_end: b,
      });
    }
  }
  return out;
}

export function placedSpans(items, lay, { min = 0.08 } = {}) {
  const out = [];
  for (const item of items || []) {
    const start = num(item.start);
    const end = num(item.end);
    if (end - start <= 0.02) continue;
    for (const span of spanToOutput(start, end, lay)) {
      if (span.end - span.start > min) {
        out.push({ ...item, start: span.start, end: span.end, src_start: span.src_start, src_end: span.src_end });
      }
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

export function placedCues(tl, lay = layout(tl)) {
  if (!tl?.captions?.enabled) return [];
  return placedSpans(tl.cues || [], lay, { min: 0.05 });
}

/* ────────────────────────────────────────────────────────────────────────────
   The pointer
   ──────────────────────────────────────────────────────────────────────────── */

export function cursorAt(track, t) {
  if (!track?.length) return null;
  const first = track[0];
  const last = track[track.length - 1];
  // Nothing before the first sighting, held after the last. The tracker cannot
  // see a pointer that is not moving, so the first sample is where it ARRIVED,
  // not where it started; holding it backwards draws a second pointer at the
  // top of every demo. Mirrors timeline.js cursorAt, which explains it in full.
  if (t < first.t - EDGE_GRACE) return null;
  if (t <= first.t) return { x: first.x, y: first.y, shape: first.shape || "default" };
  if (t >= last.t) return { x: last.x, y: last.y, shape: last.shape || "default" };

  let lo = 0;
  let hi = track.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = track[lo];
  const b = track[hi];
  const span = b.t - a.t;
  // A gap longer than a few dropped samples is held, not crossed. Mirrors
  // timeline.js cursorAt — see it for why interpolating one draws a second
  // pointer gliding across the picture.
  if (span > GAP_HOLD) {
    const near = t - a.t <= span / 2 ? a : b;
    return { x: near.x, y: near.y, shape: near.shape || "default" };
  }
  const k = span > 0 ? (t - a.t) / span : 0;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, shape: a.shape || "default" };
}

/** Longest gap in the track still worth interpolating across. */
const GAP_HOLD = 0.2;

/** How far before the first sighting the pointer may still be drawn. */
const EDGE_GRACE = 0.1;

/* ────────────────────────────────────────────────────────────────────────────
   The camera
   ──────────────────────────────────────────────────────────────────────────── */

export const EASE = {
  smooth: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  snappy: (t) => 1 - Math.pow(1 - t, 4),
  slow: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  linear: (t) => t,
};
export const RAMP = { smooth: 0.55, snappy: 0.32, slow: 0.9, linear: 0.5 };

export function clampRect(r) {
  const w = clamp(num(r.w, 1), 0.05, 1);
  const h = clamp(num(r.h, 1), 0.05, 1);
  return { x: clamp(num(r.x), 0, 1 - w), y: clamp(num(r.y), 0, 1 - h), w, h };
}

export function activeZooms(tl) {
  const total = num(tl?.duration);
  return (tl?.zooms || [])
    .map((z) => ({ ...z, start: clamp(num(z.start), 0, total), end: clamp(num(z.end), 0, total) }))
    .filter((z) => z.end - z.start > 0.05)
    .sort((a, b) => a.start - b.start);
}

export function zoomRect(z, tl, t, track) {
  const level = Math.max(1, num(z.level, 1.6));
  // Never crop tighter than the zoom's own rectangle: it was sized to hold the
  // clicks this zoom exists to show. Mirrors timeline.js zoomRect.
  const w = clamp(Math.max(1 / level, num(z.w, 0), num(z.h, 0)), 0.05, 1);
  let cx = clamp(num(z.x) + num(z.w) / 2, 0, 1);
  let cy = clamp(num(z.y) + num(z.h) / 2, 0, 1);

  if (z.follow && track?.length) {
    const p = cursorAt(track, t);
    if (p) {
      const k = clamp(num(z.follow_strength, 0.7), 0, 1);
      cx += (p.x - cx) * k;
      cy += (p.y - cy) * k;
    }
  }
  return clampRect({ x: cx - w / 2, y: cy - w / 2, w, h: w });
}

/**
 * A zoom's two ramps. Mirrors timeline.js rampsOf — see it for why going in and
 * coming out are different moves, and why `== null` rather than isFinite.
 */
export function rampsOf(z) {
  const base = RAMP[z?.easing] || RAMP.smooth;
  const given = (v) => v != null && v !== "" && Number.isFinite(Number(v));
  return {
    in: given(z?.ramp_in) ? clamp(Number(z.ramp_in), 0.05, 2) : base,
    out: given(z?.ramp_out) ? clamp(Number(z.ramp_out), 0.05, 2) : base,
    easeIn: EASE[z?.easing] ? z.easing : "smooth",
    easeOut: EASE[z?.ease_out] ? z.ease_out : EASE[z?.easing] ? z.easing : "smooth",
  };
}

/** The camera at a moment of the RECORDING. */
export function cameraAt(tl, t, { track = null } = {}) {
  const FULL = { x: 0, y: 0, w: 1, h: 1 };
  const zooms = activeZooms(tl);
  if (!zooms.length) return FULL;

  let z = null;
  for (const cand of zooms) {
    const r = rampsOf(cand);
    if (t >= cand.start - r.in && t <= cand.end + r.out) z = cand;
  }
  if (!z) return FULL;

  const r = rampsOf(z);
  const target = zoomRect(z, tl, t, track);

  if (t < z.start) return lerpRect(FULL, target, EASE[r.easeIn](clamp((t - (z.start - r.in)) / r.in, 0, 1)));
  if (t > z.end) return lerpRect(target, FULL, EASE[r.easeOut](clamp((t - z.end) / r.out, 0, 1)));
  return target;
}

function lerpRect(a, b, k) {
  return clampRect({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k });
}

/**
 * The camera at a moment of the FINISHED video.
 *
 * Not the same question as cameraAt: this one goes through the cuts. A zoom
 * placed at 40s in a recording with ten seconds removed before it plays at 30s
 * in the export, and the preview has to agree about that or every handle in the
 * timeline points at the wrong frame.
 */
export function cameraAtOutput(tl, outT, lay = layout(tl)) {
  const srcT = toSource(outT, lay);
  return cameraAt(tl, srcT, { track: tl.cursor?.enabled === false ? null : tl.track });
}

/** A point of the source frame, as a fraction of the output frame. */
export function project(pt, cam) {
  return { x: (pt.x - cam.x) / cam.w, y: (pt.y - cam.y) / cam.h, scale: 1 / cam.w };
}

/** A rect of the source frame, as a rect of the output frame. */
export function projectRect(r, cam) {
  return {
    x: (r.x - cam.x) / cam.w,
    y: (r.y - cam.y) / cam.h,
    w: r.w / cam.w,
    h: r.h / cam.h,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   The canvas
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Where the video sits inside the finished frame, as fractions of it.
 *
 * `contain`, never `cover` — same rule as the renderer
 * (backend/services/studio/render/frame.js). Returned as fractions rather than
 * pixels because the preview is whatever size the browser window left for it.
 */
export function videoBox({ aspect, sourceWidth, sourceHeight, padding = 0.06 }) {
  const [AW, AH] = ASPECTS[aspect] || ASPECTS["16:9"];
  const outAr = AW / AH;
  const pad = clamp(num(padding, 0.06), 0, 0.3);
  const srcAr = sourceWidth > 0 && sourceHeight > 0 ? sourceWidth / sourceHeight : 16 / 9;

  // In fractions of the output frame, the available box is (1-2p) on each side.
  const boxW = 1 - pad * 2;
  const boxH = 1 - pad * 2;
  // Widths and heights are fractions of DIFFERENT lengths, so the aspect
  // comparison has to be done in the output's own units.
  let w = boxW;
  let h = (boxW * outAr) / srcAr;
  if (h > boxH) {
    h = boxH;
    w = (boxH * srcAr) / outAr;
  }
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h, aspect: outAr };
}

export const GRADIENTS = {
  dusk: ["#1b2735", "#2d3f52", "#0f1720"],
  ocean: ["#0b2b3a", "#12485c", "#071a24"],
  forest: ["#12281a", "#2A835F", "#0a1a12"],
  ember: ["#2b1a14", "#5a3324", "#180d0a"],
  slate: ["#1c1e22", "#32363d", "#101114"],
  mist: ["#e8edf2", "#f7f9fb", "#dde4ec"],
  paper: ["#f3f1ec", "#faf9f6", "#e8e4dc"],
  aurora: ["#0d1b2a", "#00B7CD", "#0d1b2a"],
  plum: ["#241a2e", "#4a3160", "#140e1c"],
  ink: ["#0a0c10", "#161a22", "#05070a"],
};

export function backgroundCss(bg) {
  if (!bg || bg.kind === "none") return "#000";
  if (bg.kind === "solid") return /^#[0-9a-f]{6}$/i.test(bg.value) ? bg.value : "#12141a";
  const stops = GRADIENTS[bg.value] || GRADIENTS.dusk;
  return `linear-gradient(135deg, ${stops[0]} 0%, ${stops[1]} 55%, ${stops[2]} 100%)`;
}

/* ────────────────────────────────────────────────────────────────────────────
   Captions
   ──────────────────────────────────────────────────────────────────────────── */

/** Caption size as a fraction of the frame's short side. Matches ass.js. */
export const CAPTION_SIZES = { s: 0.042, m: 0.054, l: 0.068, xl: 0.086 };

export const CAPTION_LOOKS = {
  trylipi: { scale: 1, accent: "#70FFD2", color: "#fff", weight: 700, caps: false, box: false, shadow: "0 2px 10px rgba(0,0,0,.6)", stroke: "#101418" },
  hormozi: { scale: 1.24, accent: "#FFD400", color: "#fff", weight: 800, caps: true, box: false, shadow: "0 3px 12px rgba(0,0,0,.7)", stroke: "#000" },
  apple: { scale: 0.92, accent: "#fff", color: "#fff", weight: 600, caps: false, box: true, shadow: "none", stroke: "" },
  minimal: { scale: 0.88, accent: "#fff", color: "#fff", weight: 600, caps: false, box: false, shadow: "0 1px 6px rgba(0,0,0,.75)", stroke: "" },
  neon: { scale: 1.06, accent: "#00E5FF", color: "#fff", weight: 700, caps: false, box: false, shadow: "0 0 14px rgba(0,180,255,.7)", stroke: "#0A3040" },
};

/** Where a caption line sits, as fractions of the output frame. */
export function captionPoint(tl, cue) {
  const cap = tl.captions || {};
  const x = cue?.custom?.x ?? cap.x;
  const y = cue?.custom?.y ?? cap.y;
  if (x != null && y != null) return { x, y };
  if (cap.position === "top") return { x: 0.5, y: 0.13 };
  if (cap.position === "middle") return { x: 0.5, y: 0.5 };
  return { x: 0.5, y: 0.84 };
}

/** The look one line is drawn with, after its own overrides. */
export function captionLook(tl, cue) {
  const cap = tl.captions || {};
  const name = cue?.custom?.style || cap.style || "trylipi";
  const look = CAPTION_LOOKS[name] || CAPTION_LOOKS.trylipi;
  const sizeKey = cue?.custom?.size || cap.size || "m";
  const px = cue?.custom?.px ?? cap.px ?? null;
  return {
    ...look,
    name,
    color: cue?.custom?.color || cap.color || look.color,
    // A fraction of the short side, or an absolute size against the 1080
    // reference the creator's slider is calibrated to.
    frac: px != null ? px / 1080 : (CAPTION_SIZES[sizeKey] || CAPTION_SIZES.m) * look.scale,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   Small shared questions
   ──────────────────────────────────────────────────────────────────────────── */

export function drewCounts(tl, lay = layout(tl)) {
  return {
    duration: lay.duration,
    cuts: mergedCuts(tl).length,
    removed: lay.removed,
    zooms: placedSpans(activeZooms(tl), lay).length,
    clicks: (tl.events || []).filter((e) => e.type === "click" || e.type === "dblclick").length,
    captions: placedCues(tl, lay).length,
    blurs: placedSpans(tl.blurs || [], lay).length,
  };
}

/** "1:07.4" for handles, "1:07" for a duration in a list. */
export function fmtTime(sec, tenths = false) {
  const t = Math.max(0, Math.round((Number(sec) || 0) * 10));
  const m = Math.floor(t / 600);
  const s = (t % 600) / 10;
  return tenths ? `${m}:${s.toFixed(1).padStart(4, "0")}` : `${m}:${String(Math.floor(s)).padStart(2, "0")}`;
}

export function fmtBytes(n) {
  const b = Number(n) || 0;
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`;
  if (b >= 1024 ** 2) return `${Math.round(b / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(b / 1024))} KB`;
}

const model = {
  ASPECTS, CURSOR_THEMES, CAPTION_STYLES, EASINGS, BLUR_KINDS, GRADIENTS,
  newId, clamp, layout, mergedCuts, toOutput, toOutputSnapped, toSource, spanToOutput,
  placedSpans, placedCues, cursorAt, EASE, RAMP, rampsOf, clampRect, activeZooms, zoomRect,
  cameraAt, cameraAtOutput, project, projectRect, videoBox, backgroundCss,
  CAPTION_SIZES, CAPTION_LOOKS, captionPoint, captionLook, drewCounts, fmtTime, fmtBytes,
}
export default model;

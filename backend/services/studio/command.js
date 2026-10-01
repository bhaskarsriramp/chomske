/**
 * command.js: an edit asked for in words ("zoom in on Projects", "remove the
 * zooms in the first 10 seconds") turned into the same edit a creator makes by
 * hand.
 *
 * ── THE MODEL READS THE SENTENCE. IT DOES NOT MAKE THE EDIT ──────────────────
 * Gemini is asked one thing: what did the creator mean, in terms of what is on
 * this recording's timeline and on its screens. It answers with ids from lists
 * it was given (a zoom, a click, a thing on screen) and with times copied
 * exactly as they were typed. Everything after that is this file: which moment,
 * which rectangle, what an ambiguous "1.25" means, what has to move to make
 * room. The research behind this (2026-09-30) found the same complaint about
 * every chat editor on the market: confident edits in the wrong place. So no
 * number the model writes becomes part of an edit without this file checking
 * it against something measured.
 *
 * ── ASK ONLY WHEN THERE IS NO GOOD GUESS ─────────────────────────────────────
 * A zoom is one Undo away, so a reasonable reading is acted on and the other
 * readings are offered as buttons. A question is asked only when the readings
 * are really different ("0.5 to 1.25" is 0:05–1:25, or half a second to a
 * second and a quarter) or when nothing matched at all.
 *
 * ── TIMES ARE THE PLAYER'S ───────────────────────────────────────────────────
 * The creator reads times off the player, which shows the finished video:
 * output time, after cuts. Every time typed or written here is output time. It
 * becomes recording (source) time only at the edge, where zooms are stored.
 *
 * ── THE BROWSER'S ZOOMS, NOT THE STORED ONES ─────────────────────────────────
 * The editor autosaves a second after the last change, so the stored timeline
 * can be behind what the creator is looking at. The zooms and cuts come in the
 * request; everything the editor never changes (the pointer track, the clicks,
 * the frame readings) comes from the stored demo.
 *
 * ── WHEN THE LIST HAS NO NAME FOR IT, LOOK ───────────────────────────────────
 * The frame readings name controls: "Projects", "Install now". A creator
 * describes what they SEE: "the girl image with a play button on the left".
 * The first creator to try it asked for exactly that, at 0:15.7 with the
 * playhead sitting on it, and was told it could not be found, because a
 * picture inside a page is read as an unnamed "image" box and the words in it
 * are not kept at all. So when nothing in the readings matches, the frame at
 * that moment is read from the recording and Gemini is asked where the
 * described thing is in it (findOnFrame). The readings still go first: they
 * are instant, free, and right about named controls.
 */
import crypto from "crypto";
import fsp from "fs/promises";
import os from "os";
import path from "path";
import { generateJson, TEXT_MODEL } from "../edit/gemini.js";
import { MODEL } from "../ai/provider.js";
import { extractFrameAt } from "../media/ffmpeg.js";
import { materialize, storageKind } from "../media/storage.js";
import { layout, toSource, toOutput, toOutputSnapped } from "./timeline.js";
import { containing, containingBox } from "./events.js";
import { cursorAt, zoomOutGap } from "../../../src/components/Studio/camera.mjs";
import { followFor, followAt, heldAt } from "../../../src/components/Studio/follow.mjs";

/** The level Add and the analysis both use. */
const DEFAULT_LEVEL = 1.8;
/** The Zoom level slider's range (panels.js ZoomPanel). */
const LEVEL_MIN = 1.05;
const LEVEL_MAX = 3;
/** How long a zoom runs when nobody said (create.js DEFAULT_LENGTH.zoom). */
const DEFAULT_LENGTH = 2.5;
/** Shorter than this and the camera is still arriving when it leaves (create.js MIN_LENGTH). */
const MIN_LENGTH = 0.4;
/**
 * A zoom on a click starts this long before the press, so the camera has
 * arrived when the button goes down (RAMP_IN is 0.45 s). A viewer's eye should
 * get there first, as intent.js puts it.
 */
const LEAD = 0.5;
/** Where the camera is looked for: a little after the zoom starts, once it has arrived. */
const SETTLE = 0.3;
/** "The zoom at 0:12" may start or end this far from 0:12. */
const NEAR = 1.5;
/** An earlier zoom trimmed to less than this is removed instead. */
const MIN_KEEP = 0.3;
/**
 * Shorter than this, a zoom ended early for the next one is not worth having,
 * and it takes the next one's place instead (create.js MIN_OWN).
 */
const MIN_OWN = 0.8;
/** Two zooms on the same thing starting this close are the same shot: a new one replaces the old (a redo, like "zoom in on Projects" over the automatic zoom on that click). */
const SAME_MOMENT = 0.5;
/** Shortest an added zoom may be when it is ended just before the next one rather than asking. */
const MIN_TIGHT = 0.7;
/** How far before the next zoom one ends when there is no room for the camera to pull out: a few frames, two blocks. */
const EDGE = 0.1;

/**
 * Where zoom `a` (starting at aStart) should end so that zoom `b` (starting at
 * bStart) stays its own shot: early enough for the camera to pull all the way
 * out when that leaves `a` at least `want` seconds, otherwise just before `b`
 * when that leaves at least `min`. Null when neither does.
 */
function endBefore(aStart, a, b, bStart, want, min) {
  const full = round3(bStart - zoomOutGap(a, b));
  if (full - aStart >= want) return full;
  const tight = round3(bStart - EDGE);
  if (tight - aStart >= min) return tight;
  return null;
}
/** Below this a "zoom" does not look like one. */
const MIN_EFFECTIVE = 1.15;
/**
 * A thing too big to hold whole in a zoomed frame (an image as tall as the
 * screen) is zoomed on its middle at this level, with its edges cropped, and
 * the reply says so. Refusing was the first answer, and it refused the exact
 * request that showed this feature was needed.
 */
const CROP_LEVEL = 1.4;
/** A place the model found with less confidence than this is not used. */
const MIN_FOUND = 0.4;

const MAX_TEXT = 400;
const MAX_THINGS = 220;
const MAX_CLICKS = 150;

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round3 = (v) => Math.round(v * 1000) / 1000;
const str = (v, n = 80) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const norm = (v) => str(v, 120).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const newId = (prefix) => `${prefix}_${crypto.randomBytes(5).toString("hex")}`;

/** The player's clock: m:ss.t, the same as the editor's fmtTime(t, true). */
export function fmt(sec) {
  const t = Math.max(0, Math.round(num(sec) * 10));
  const m = Math.floor(t / 600);
  const s = (t % 600) / 10;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

/** A zoom level as the slider shows it: 1.8×, 2.25×. */
const fmtLevel = (v) => `${Number(v.toFixed(2))}×`;

/** "0:03.9, 0:06.4 and 0:08.9" */
function listTimes(items, max = 5) {
  const shown = items.slice(0, max).map((z) => fmt(z.outStart));
  const more = items.length - shown.length;
  if (more > 0) return `${shown.join(", ")} and ${more} more`;
  if (shown.length < 2) return shown[0] || "";
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

/* ────────────────────────────────────────────────────────────────────────────
   Reading a time the creator typed
   ──────────────────────────────────────────────────────────────────────────── */

const UNITS = {
  h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600,
  m: 60, min: 60, mins: 60, minute: 60, minutes: 60,
  s: 1, sec: 1, secs: 1, second: 1, seconds: 1,
};
const UNIT_RE = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)(?![a-z])/g;

/**
 * Every reasonable reading of one typed time, in seconds of output time.
 *
 * A clock ("1:25"), units ("1 min 25 s", "85s", "1.5 min") and words the model
 * was told to pass through ("end", "playhead", "end-5s") have one reading. A
 * bare decimal does not: "1.25" is a second and a quarter to some people and a
 * minute and twenty-five to others, and nothing in the number says which. It
 * gets both readings, tagged, and the caller decides with the other end of the
 * range and the length of the video, or asks.
 *
 * @returns {null | {bad: true} | {list: {sec: number, how: string}[], unit?: number, bare?: boolean}}
 *   null when nothing was typed.
 */
export function readTime(raw, { playhead = 0, total = 0, unit = 0 } = {}) {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^(at|from|to|till|until|upto|up to)\s+/, "")
    .trim();
  if (!t) return null;
  if (/^(playhead|the playhead|here|now|current|this point|this moment)$/.test(t)) return { list: [{ sec: playhead, how: "exact" }] };
  if (/^(end|the end|ending)$/.test(t)) return { list: [{ sec: total, how: "exact" }] };
  if (/^(start|the start|beginning|the beginning|begin)$/.test(t)) return { list: [{ sec: 0, how: "exact" }] };

  let m = t.match(/^end\s*-\s*(.+)$/);
  if (m) {
    const d = readLength(m[1]);
    return d == null ? { bad: true } : { list: [{ sec: total - d, how: "exact" }] };
  }
  m = t.match(/^playhead\s*([+-])\s*(.+)$/);
  if (m) {
    const d = readLength(m[2]);
    return d == null ? { bad: true } : { list: [{ sec: playhead + (m[1] === "-" ? -d : d), how: "exact" }] };
  }

  m = t.match(/^(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
  if (m) return { list: [{ sec: +m[1] * 3600 + +m[2] * 60 + +m[3], how: "exact" }] };
  m = t.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/);
  if (m) return { list: [{ sec: +m[1] * 60 + +m[2], how: "exact" }] };

  const pairs = [...t.matchAll(UNIT_RE)];
  if (pairs.length && t.replace(UNIT_RE, "").replace(/\band\b|[,\s]/g, "") === "") {
    return {
      list: [{ sec: pairs.reduce((a, p) => a + +p[1] * UNITS[p[2]], 0), how: "exact" }],
      unit: pairs.length === 1 ? UNITS[pairs[0][2]] : 0,
    };
  }

  m = t.match(/^(\d+)$/);
  if (m) return { list: [{ sec: +m[1] * (unit || 1), how: "exact" }], bare: true };
  m = t.match(/^(\d+)\.(\d+)$/);
  if (m) {
    if (unit) return { list: [{ sec: parseFloat(t) * unit, how: "exact" }], bare: true };
    const list = [{ sec: parseFloat(t), how: "seconds" }];
    // "1.25" as a clock: the digits after the point are seconds, so they must
    // be a number of seconds a clock could show.
    if (m[2].length <= 2 && +m[2] < 60) list.push({ sec: +m[1] * 60 + +m[2], how: "clock" });
    return { list, bare: true };
  }
  return { bad: true };
}

/** A length ("5s", "5", "1 min", "1:30") in seconds, or null. A bare number is seconds. */
export function readLength(raw) {
  const t = String(raw ?? "").trim().toLowerCase();
  if (!t) return null;
  const r = readTime(t, { unit: 1 });
  if (!r || r.bad) return null;
  const sec = r.list[0].sec;
  return Number.isFinite(sec) && sec > 0 ? sec : null;
}

/**
 * The readings of a start and an end that make a range this video can have.
 *
 * A unit on one end only belongs to both: "from 1 to 2 minutes" is 1:00–2:00.
 * When both ends are ambiguous they are read the same way, because nobody
 * writes a start as seconds and its end as a clock.
 *
 * @returns {{bad?: string, ranges?: {s: number, e: number, how: string}[]}}
 */
export function readRange(startRaw, endRaw, { playhead, total }) {
  let a = readTime(startRaw, { playhead, total });
  let b = readTime(endRaw, { playhead, total });
  if (!a && !b) return { bad: "no time" };
  if (!a) a = { list: [{ sec: 0, how: "exact" }] };
  if (!b) b = { list: [{ sec: total, how: "exact" }] };
  if (a.bad) return { bad: String(startRaw) };
  if (b.bad) return { bad: String(endRaw) };
  if (a.bare && b.unit) a = readTime(startRaw, { playhead, total, unit: b.unit });
  if (b.bare && a.unit) b = readTime(endRaw, { playhead, total, unit: a.unit });

  const both = a.list.length > 1 && b.list.length > 1;
  const out = [];
  for (const x of a.list) {
    for (const y of b.list) {
      if (both && x.how !== y.how) continue;
      const s = x.sec;
      const e = Math.min(y.sec, total);
      if (s < -0.05 || s >= total || e - s < MIN_LENGTH) continue;
      // An end typed past the video by more than a little is a reading of the
      // numbers this video cannot have, not a range to cut short.
      if (y.sec > total + 0.5) continue;
      const how = x.how !== "exact" ? x.how : y.how;
      if (!out.some((r) => Math.abs(r.s - s) < 0.05 && Math.abs(r.e - e) < 0.05)) out.push({ s: Math.max(0, s), e, how });
    }
  }
  return { ranges: out };
}

/** The readings of one moment that this video can have. */
export function readMoment(raw, { playhead, total }) {
  const r = readTime(raw, { playhead, total });
  if (!r) return { bad: "no time" };
  if (r.bad) return { bad: String(raw) };
  const list = r.list.filter((x) => x.sec >= -0.05 && x.sec <= total + 0.05).map((x) => ({ sec: clamp(x.sec, 0, total), how: x.how }));
  return { moments: list };
}

/** How a reading is shown on a button: "0:05 → 1:25", "0.5 s → 1.25 s". */
function rangeLabel(r) {
  if (r.how === "seconds") return `${Number(r.s.toFixed(2))} s → ${Number(r.e.toFixed(2))} s`;
  return `${fmt(r.s)} → ${fmt(r.e)}`;
}
const secText = (sec) => `${round3(sec)}s`;

/* ────────────────────────────────────────────────────────────────────────────
   What the creator can name: zooms, clicks, things on screen
   ──────────────────────────────────────────────────────────────────────────── */

/** Unlabelled things worth naming by what they are: "the chart", "the sidebar". */
const UNLABELLED_OK = new Set(["sidebar", "dialog", "modal", "menu", "toolbar", "table", "chart", "video", "image", "text_field", "avatar", "code_editor", "terminal", "browser_url", "card", "empty_state", "error", "notification"]);

function boxOf(bbox) {
  if (!Array.isArray(bbox) || bbox.length < 4) return null;
  const [x, y, w, h] = bbox.map((v) => num(v, NaN));
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  const bx = clamp(x, 0, 1);
  const by = clamp(y, 0, 1);
  return { x: bx, y: by, w: clamp(w, 0, 1 - bx), h: clamp(h, 0, 1 - by) };
}

/** "left top": where on the screen, in words the creator might use. */
function whereOnScreen(b) {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const h = cx < 0.34 ? "left" : cx > 0.66 ? "right" : "centre";
  const v = cy < 0.34 ? "top" : cy > 0.66 ? "bottom" : "middle";
  return `${h} ${v}`;
}

/** How far apart the frames were read, in seconds. The median gap, not the mean. */
function readingInterval(shots) {
  const ts = shots.map((s) => num(s.t)).sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < ts.length; i++) if (ts[i] - ts[i - 1] > 0.05) gaps.push(ts[i] - ts[i - 1]);
  if (!gaps.length) return 2;
  gaps.sort((a, b) => a - b);
  return clamp(gaps[gaps.length >> 1], 0.25, 10);
}

function cleanZooms(list, duration) {
  return (Array.isArray(list) ? list : [])
    .slice(0, 300)
    .map((z) => ({
      id: str(z?.id, 32),
      start: clamp(num(z?.start), 0, duration),
      end: clamp(num(z?.end), 0, duration),
      x: clamp(num(z?.x, 0.3), 0, 1),
      y: clamp(num(z?.y, 0.3), 0, 1),
      w: clamp(num(z?.w, 0.4), 0, 1),
      h: clamp(num(z?.h, 0.4), 0, 1),
      level: clamp(num(z?.level, DEFAULT_LEVEL), 1, 5),
      label: str(z?.label, 80),
      auto: !!z?.auto,
      // How it ramps, which is how long the camera needs to pull out before
      // the next one (camera.mjs zoomOutGap). Absent means the easing's own.
      easing: str(z?.easing, 16) || "smooth",
      ease_out: z?.ease_out == null ? null : str(z.ease_out, 16),
      ramp_in: z?.ramp_in == null ? null : num(z.ramp_in, null),
      ramp_out: z?.ramp_out == null ? null : num(z.ramp_out, null),
    }))
    .filter((z) => z.id && z.end - z.start > 0.05)
    .sort((a, b) => a.start - b.start);
}

/** The editor's blurs, as they are now: enough to tell where each one is and what it is on. */
function cleanBlurs(list, duration) {
  return (Array.isArray(list) ? list : [])
    .slice(0, 200)
    .map((b) => ({
      id: str(b?.id, 40),
      x: clamp(num(b?.x), 0, 1),
      y: clamp(num(b?.y), 0, 1),
      w: clamp(num(b?.w), 0, 1),
      h: clamp(num(b?.h), 0, 1),
      at: b?.at == null ? null : clamp(num(b.at), 0, duration),
      start: clamp(num(b?.start), 0, duration),
      end: clamp(num(b?.end, duration), 0, duration),
      kind: ["blur", "pixelate", "box"].includes(b?.kind) ? b.kind : "blur",
      label: str(b?.label, 80),
      auto: !!b?.auto,
    }))
    .filter((b) => b.id && b.w > 0 && b.h > 0);
}

function cleanCuts(list, duration) {
  return (Array.isArray(list) ? list : [])
    .slice(0, 300)
    .map((c) => ({ start: clamp(num(c?.start), 0, duration), end: clamp(num(c?.end), 0, duration) }))
    .filter((c) => c.end - c.start > 0.02);
}

/**
 * Everything a command is resolved against.
 *
 * @param {object} demo   the StudioDemo document
 * @param {object} body   { playhead, selected, zooms, cuts } from the editor
 */
export function commandContext(demo, body = {}) {
  const stored = demo.timeline || {};
  const duration = num(stored.duration) || num(demo.recording?.duration);
  const zooms = cleanZooms(body.zooms, duration);
  const cuts = cleanCuts(body.cuts, duration);
  const lay = layout({ duration, cuts });
  const total = lay.duration;
  const playhead = clamp(num(body.playhead), 0, total);
  const selected = zooms.some((z) => z.id === body.selected) ? String(body.selected) : null;
  const blurs = cleanBlurs(body.blurs, duration);
  const selectedBlur = blurs.some((b) => b.id === body.selectedBlur) ? String(body.selectedBlur) : null;
  // The recording's own pixels, for close-ups (refineBox).
  const W = num(demo.recording?.width) || num(stored.source?.width);
  const H = num(demo.recording?.height) || num(stored.source?.height);

  for (const z of zooms) {
    z.outStart = toOutputSnapped(z.start, lay);
    z.outEnd = toOutputSnapped(z.end, lay);
  }

  const shots = Array.isArray(demo.analysis?.elements) ? demo.analysis.elements : [];
  const every = readingInterval(shots);

  // ── Things on screen: the frame readings grouped by what they are ──────────
  const byKey = new Map();
  for (const shot of shots) {
    const t = num(shot?.t, NaN);
    if (!Number.isFinite(t)) continue;
    const out = toOutput(t, lay);
    if (out == null) continue; // inside a cut: not in the finished video
    for (const el of shot.elements || []) {
      const type = str(el?.type, 24) || "element";
      const label = str(el?.label, 60);
      const box = boxOf(el?.bbox);
      if (!box) continue;
      if (!label && !UNLABELLED_OK.has(type)) continue;
      const key = `${type}|${norm(label)}${label ? "" : `|${whereOnScreen(box)}`}`;
      let th = byKey.get(key);
      if (!th) {
        th = { key, type, label, readings: [], clicks: [] };
        byKey.set(key, th);
      }
      th.readings.push({ t, out, box });
    }
  }
  for (const th of byKey.values()) {
    th.readings.sort((a, b) => a.out - b.out);
    th.spans = [];
    for (const r of th.readings) {
      const last = th.spans[th.spans.length - 1];
      if (last && r.out - last.to <= every * 1.6) last.to = r.out;
      else th.spans.push({ from: r.out, to: r.out });
    }
  }

  // ── Clicks: the presses the pipeline confirmed ──────────────────────────────
  const clicks = (stored.events || [])
    .filter((e) => ["click", "dblclick", "rightclick"].includes(e?.type) && e.zoomable !== false)
    .map((e) => ({ t: num(e.t), x: clamp(num(e.x, 0.5), 0, 1), y: clamp(num(e.y, 0.5), 0, 1), label: str(e.control, 60) }))
    .map((c) => ({ ...c, out: toOutput(c.t, lay) }))
    .filter((c) => c.out != null)
    .sort((a, b) => a.t - b.t)
    .slice(0, MAX_CLICKS);

  // A click belongs to the thing it landed on: the smallest thing read near
  // that moment whose box holds the click, or failing that one named the same.
  const tol = every * 0.75 + 0.25;
  for (const c of clicks) {
    let best = null;
    let bestArea = Infinity;
    for (const th of byKey.values()) {
      const r = nearest(th, c.out, tol);
      if (!r) continue;
      const pad = 0.01;
      const inside = c.x >= r.box.x - pad && c.x <= r.box.x + r.box.w + pad && c.y >= r.box.y - pad && c.y <= r.box.y + r.box.h + pad;
      const named = c.label && th.label && norm(c.label) === norm(th.label);
      const area = r.box.w * r.box.h;
      if ((inside || named) && (named ? 0 : area) < bestArea) {
        best = th;
        bestArea = named ? 0 : area;
      }
    }
    if (best) {
      c.thing = best;
      best.clicks.push(c);
      if (!c.label) c.label = best.label;
    }
  }

  // The list the model sees is capped, so what a creator is most likely to
  // name goes first: things that were clicked, then labelled controls.
  const ranked = [...byKey.values()].sort(
    (a, b) =>
      (b.clicks.length > 0) - (a.clicks.length > 0) ||
      (!!b.label) - (!!a.label) ||
      a.readings[0].out - b.readings[0].out
  );
  const things = ranked.slice(0, MAX_THINGS).sort((a, b) => a.readings[0].out - b.readings[0].out);

  return {
    duration, lay, total, playhead, selected, zooms, clicks, things, every, tol,
    blurs, selectedBlur, W, H,
    // Where each applied blur has followed its text to (blurTrack.js): what
    // "already blurred" and "the blur showing here" are read from.
    follows: demo.follows && typeof demo.follows === "object" ? (demo.follows.toObject?.() ?? demo.follows) : {},
    thingByKey: new Map(things.map((th) => [th.key, th])),
    track: Array.isArray(stored.track) ? stored.track : [],
    read: shots.length > 0,
  };
}

/** The reading of a thing nearest an output time, if one is within `tol`. */
function nearest(th, out, tol) {
  let best = null;
  for (const r of th.readings) {
    const d = Math.abs(r.out - out);
    if (d <= tol && (!best || d < Math.abs(best.out - out))) best = r;
  }
  return best;
}

/* ────────────────────────────────────────────────────────────────────────────
   Looking at a frame
   ──────────────────────────────────────────────────────────────────────────── */

const FRAME_TIMEOUT = 25000;
const CACHE_DIR = path.join(os.tmpdir(), "clipo-command");
const CACHE_LIFE = 30 * 60 * 1000;
/** Recordings downloaded for the chat: key → { file: Promise<string>, at }. */
const copies = new Map();
let swept = 0;

/**
 * Copies nobody has used for CACHE_LIFE are deleted: the ones this process
 * knows about, and any a previous run of the server left in the folder.
 */
async function sweep(now) {
  for (const [k, v] of copies) {
    if (now - v.at > CACHE_LIFE) {
      copies.delete(k);
      v.file.then((f) => fsp.rm(f, { force: true }), () => {}).catch(() => {});
    }
  }
  if (now - swept < 10 * 60 * 1000) return;
  swept = now;
  const live = new Set();
  for (const v of copies.values()) live.add(await v.file.catch(() => ""));
  for (const name of await fsp.readdir(CACHE_DIR).catch(() => [])) {
    const f = path.join(CACHE_DIR, name);
    if (live.has(f)) continue;
    const st = await fsp.stat(f).catch(() => null);
    if (st && now - st.mtimeMs > CACHE_LIFE) fsp.rm(f, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * The recording on this disk, downloaded once and kept while it is in use
 * (CACHE_LIFE after the last use).
 *
 * ── WHY NOT READ IT STRAIGHT FROM THE BUCKET ─────────────────────────────────
 * The first version read single frames from a signed bucket link, which on
 * paper is a second of the file instead of all of it. On the production
 * server ffmpeg never finished doing it: every close-up waited out its 25 s
 * limit ("ffmpeg exited with null") and then fell back to a download anyway.
 * Everything else in the product that reads a recording downloads it first
 * (the analysis, the tracker, the export), and a demo is tens of megabytes
 * inside the same cloud. So the chat does too, once, and every look after
 * that (a zoom, a blur, a whole-video scan, its close-ups) reads the copy.
 */
async function localCopy(demo, key) {
  if (storageKind() !== "gcs") return materialize(key, CACHE_DIR); // already on disk: its own path
  const now = Date.now();
  await fsp.mkdir(CACHE_DIR, { recursive: true });
  await sweep(now);
  const hit = copies.get(key);
  if (hit) {
    hit.at = now;
    return hit.file;
  }
  const name = `${String(demo._id)}-${crypto.createHash("sha1").update(key).digest("hex").slice(0, 10)}.mp4`;
  const file = materialize(key, CACHE_DIR, name);
  copies.set(key, { file, at: now });
  file.catch(() => copies.delete(key));
  return file;
}

/**
 * The recording's frame at source time `t`, as a JPEG on disk (the caller
 * deletes it). The file is the one the analysis read (recording.mp4_key), so
 * a box found on it is in the same frame the zooms are stored against, and
 * the one the tracker will cut a blur from.
 */
export async function frameAt(demo, t, { crop = null } = {}) {
  const key = demo.recording?.mp4_key;
  if (!key || demo.purged) throw new Error("the recording's file is not available");
  await fsp.mkdir(CACHE_DIR, { recursive: true });
  const dest = path.join(CACHE_DIR, `${String(demo._id)}-${Math.round(t * 1000)}-${crypto.randomBytes(3).toString("hex")}.jpg`);
  const file = await localCopy(demo, key);
  // `crop` is in the recording's own pixels, cut before any scaling, so a
  // close-up keeps every pixel the recording has.
  await extractFrameAt(file, dest, t, { longEdge: 1280, crop, timeoutMs: FRAME_TIMEOUT });
  if ((await fsp.stat(dest).then((s) => s.size, () => 0)) > 0) return dest;
  throw new Error(`no frame at ${t.toFixed(2)}s`);
}

export const FRAME_FINDER = (description) => `This is one frame of a screen recording of a website or app. The person who made the recording wants the camera to zoom in, and described what on screen to zoom in on, in their own words:

${JSON.stringify(description)}

Find it in this frame, and return the box the camera should hold to show it:
- The box must contain what they described, and anything they specifically pointed at inside it: a button, an icon, text they quoted.
- Keep it as tight as that allows. A zoom shows the box enlarged, so a box much bigger than what they meant zooms in less. If they describe a large thing but single out one part of it ("the section where the play button is"), box that part.
- If it is not in this frame, set "found" to false and return no matches. Do not return the nearest lookalike.
- If more than one thing fits the description, return each, at most 3, best first.

"box_2d" is [ymin, xmin, ymax, xmax], normalized to 0-1000.
"label" says what it is in a few words, the way the person would: "girl image with a play button".
"confidence" is how sure you are, from 0 to 1, that this is what they meant.

Return ONLY valid JSON matching the schema.`;

const FIND_SCHEMA = {
  type: "OBJECT",
  properties: {
    found: { type: "BOOLEAN" },
    matches: {
      type: "ARRAY",
      maxItems: 3,
      items: {
        type: "OBJECT",
        properties: {
          box_2d: { type: "ARRAY", items: { type: "NUMBER" }, minItems: 4, maxItems: 4 },
          label: { type: "STRING" },
          confidence: { type: "NUMBER" },
        },
        required: ["box_2d", "label", "confidence"],
        propertyOrdering: ["box_2d", "label", "confidence"],
      },
    },
  },
  required: ["found", "matches"],
  propertyOrdering: ["found", "matches"],
};

/**
 * Gemini's box_2d, [ymin, xmin, ymax, xmax] in 0–1000 (the form its detection
 * is trained on), as a rect in fractions of the frame. Null when unusable.
 */
export function fromBox2d(b) {
  if (!Array.isArray(b) || b.length < 4) return null;
  let [y0, x0, y1, x1] = b.map((v) => num(v, NaN));
  if (![y0, x0, y1, x1].every(Number.isFinite)) return null;
  // Answered in fractions after all: read as fractions rather than as a box in
  // the top-left corner.
  const scale = Math.max(y0, x0, y1, x1) <= 1.5 ? 1 : 1000;
  [y0, x0, y1, x1] = [y0, x0, y1, x1].map((v) => clamp(v / scale, 0, 1));
  if (x1 < x0) [x0, x1] = [x1, x0];
  if (y1 < y0) [y0, y1] = [y1, y0];
  if (x1 - x0 < 0.004 || y1 - y0 < 0.004) return null;
  return { x: round3(x0), y: round3(y0), w: round3(x1 - x0), h: round3(y1 - y0) };
}

/** A model call that is asked once more without its schema if the schema is refused (see vision.js ask). */
async function askJson(ask, opts) {
  try {
    return await ask(opts);
  } catch (err) {
    if (!opts.schema || !/\b400\b|INVALID_ARGUMENT/.test(String(err?.message || ""))) throw err;
    console.warn(`[studio] ${opts.label}: the response schema was refused (${String(err.message).replace(/\s+/g, " ").slice(0, 400)}); asking without it`);
    return ask({ ...opts, schema: null });
  }
}

/** Where on a frame (a JPEG on disk) the described thing is. */
export async function findOnFrame(file, description, { ask = generateJson } = {}) {
  const data = await fsp.readFile(file);
  const parts = [{ text: FRAME_FINDER(str(description, 300)) }, { inlineData: { mimeType: "image/jpeg", data: data.toString("base64") } }];
  const res = await askJson(ask, { model: MODEL.vision, parts, maxOutputTokens: 1024, schema: FIND_SCHEMA, label: "command find" });
  const j = res.json || {};
  const all = (Array.isArray(j.matches) ? j.matches : []).map((m) => ({
    box: fromBox2d(m?.box_2d),
    label: str(m?.label, 60),
    confidence: clamp(num(m?.confidence, 0.5), 0, 1),
  }));
  const matches =
    j.found === false
      ? []
      : all.filter((m) => m.box && m.confidence >= MIN_FOUND).sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  return { matches, usd: num(res.usd), dropped: all.length - matches.length, raw: redact(j) };
}

/* ── Finding what to blur ─────────────────────────────────────────────────── */

/**
 * The padding every blur the product places gets (vision.js joinRegions): so
 * no glyph sits on its edge, and wider than it looks it needs to be, because
 * text reflows and a number gains a digit. Less above and below, where text
 * does not grow. A blur asked for in words is the same blur as one drawn or
 * found, so it is the same size around the same text.
 */
const BLUR_PAD_X = 0.012;
const BLUR_PAD_Y = 0.01;

const SECRET_RULES = `- They decide what to hide. It may be a secret, or just a button label, a heading, a name or a logo they do not want shown. Do not judge whether it is sensitive: find exactly what they described.
- Each separate occurrence is its own box: two email addresses are two boxes; an email and an API key are two boxes.
- One box per run of text on one line. Never one box around several lines, a whole row or a whole panel, unless what they described IS an image, a photo, a face or a panel.
- Only what they described: the key, not the "API key:" label beside it; the address, not the whole menu.
- The box must include every character, the first and the last. Slightly too big is safe; cutting off a character is not.
- Do not return lookalikes: a placeholder like "your-api-key-here" or "user@example.com" is not a secret unless they asked for it.

"box_2d" is [ymin, xmin, ymax, xmax], normalized to 0-1000.
"label" names what it is in two or three words, like "account email", "Stripe API key" or "Open Editor button". Never repeat a secret itself.
"tail" is the last 3 characters of the text in the box, exactly as shown, so the same text can be told apart from different text in the same place on another frame. "" for a picture, a face or text too small to read.
"confidence" is how sure you are, from 0 to 1, that this is what they described. Not whether it is sensitive: they have already decided that.`;

export const SECRET_FINDER = (description) => `This is one frame of a screen recording that is about to be published. The person who made it wants something on screen hidden, and described it in their own words:

${JSON.stringify(description)}

Find EVERY place on this frame where that is visible, and return one box for each. If it is not on this frame, set "found" to false and return no boxes.
${SECRET_RULES}

Return ONLY valid JSON matching the schema.`;

const SECRET_SCHEMA = {
  type: "OBJECT",
  properties: {
    found: { type: "BOOLEAN" },
    matches: {
      type: "ARRAY",
      maxItems: 12,
      items: {
        type: "OBJECT",
        properties: {
          box_2d: { type: "ARRAY", items: { type: "NUMBER" }, minItems: 4, maxItems: 4 },
          label: { type: "STRING" },
          tail: { type: "STRING" },
          confidence: { type: "NUMBER" },
        },
        required: ["box_2d", "label", "tail", "confidence"],
        propertyOrdering: ["box_2d", "label", "tail", "confidence"],
      },
    },
  },
  required: ["found", "matches"],
  propertyOrdering: ["found", "matches"],
};

export const EDGE_FINDER = (label, description) => `This is a close-up of part of a screen recording. Somewhere in it is ${JSON.stringify(label || description)}, which the person who made the recording asked to hide (they described it as ${JSON.stringify(description)}).

Return the box around exactly that, and only that:
- every character of it, the first and the last, and nothing from the lines above or below;
- if it is cut off by the edge of this image, box the part that is visible.
If it is not in this image, set "found" to false.

"box_2d" is [ymin, xmin, ymax, xmax] of THIS image, normalized to 0-1000.

Return ONLY valid JSON matching the schema.`;

const EDGE_SCHEMA = {
  type: "OBJECT",
  properties: {
    found: { type: "BOOLEAN" },
    box_2d: { type: "ARRAY", items: { type: "NUMBER" }, minItems: 4, maxItems: 4 },
  },
  required: ["found", "box_2d"],
  propertyOrdering: ["found", "box_2d"],
};

/* ── "Everywhere": the whole video, looked through ────────────────────────── */

/**
 * ── WHY A BLUR ON ONE COPY DOES NOT COVER THE OTHERS ─────────────────────────
 * The tracker follows ONE thing through the recording and refuses the same
 * text somewhere else (blurTrack.js STRICT_CONTEXT): a blur on a channel name
 * once jumped to the same name in a search box, and that is the rule that
 * stopped it. So "blur Open Editor on every screen", blurred on the frame at
 * 0:00, covered the hero's button and not the other "Open Editor" at 0:24 in
 * a different section. For "everywhere", the video is looked through: a frame
 * every SCAN_EVERY seconds, each occurrence becomes its own blur anchored
 * where it was seen best, and each is followed like any other.
 *
 * ── ONE FRAME PER QUESTION, LIKE THE BLUR PASS ───────────────────────────────
 * The first version asked about four frames in each call and came back empty
 * on a video with "Open Editor" in plain view, while the same question about
 * one frame had found it a minute earlier. The analysis's own blur pass
 * (vision.js findSensitive) asks about one frame at a time, and so does this:
 * the question that is known to work, asked of every frame.
 */
const SCAN_EVERY = 2;
/** Looking more closely: a frame every second. */
const SCAN_CLOSE = 1;
/** Most frames looked at in one scan: a long video is sampled more sparsely. */
const SCAN_MAX = 60;
const SCAN_MAX_CLOSE = 120;
/** Frames asked about at once. */
const SCAN_PARALLEL = 8;
/** Most blurs one scan makes (the follow route queues at most 24 per demo). */
const SCAN_BLURS = 16;

/** fn over items, at most `n` at a time. */
async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

/** Seconds between the frames a scan looks at. */
export const scanStep = (total, close = false) =>
  Math.max(close ? SCAN_CLOSE : SCAN_EVERY, total / (close ? SCAN_MAX_CLOSE : SCAN_MAX));

/** The output times a scan looks at, and the last moment. */
export function scanTimes(total, { close = false } = {}) {
  if (!(total > 0)) return [];
  const step = scanStep(total, close);
  const out = [];
  for (let t = Math.min(0.25, total / 2); t < total - 0.1; t += step) out.push(round3(t));
  const last = round3(Math.max(0, total - 0.15));
  if (!out.length || last - out[out.length - 1] > step / 2) out.push(last);
  return out;
}

/**
 * Every sighting of the described thing across the video: [{ src, out, box,
 * label, tail, confidence }]. `find(file)` is the one-frame question: where
 * on this frame is it (findSecrets for a blur, findOnFrame for a zoom).
 * Frames come from one downloaded copy of the recording (localCopy), each
 * read as "what was on screen at t" (extractFrameAt), so a sighting's time is
 * the frame the tracker will cut a blur from.
 *
 * @returns {{ sightings: object[], frames: number, missed: number, dropped: number, usd: number, error?: boolean, sample?: string }}
 */
export async function scanFrames(demo, ctx, find, { status = () => {}, what = "", close = false } = {}) {
  const key = demo.recording?.mp4_key;
  if (!key || demo.purged) return { error: true, sightings: [], frames: 0, missed: 0, dropped: 0, usd: 0 };
  const times = scanTimes(ctx.total, { close }).map((out) => ({ out, src: round3(toSource(out, ctx.lay)) }));
  status("Reading the video…");
  await fsp.mkdir(CACHE_DIR, { recursive: true });
  const dir = await fsp.mkdtemp(path.join(CACHE_DIR, "scan-"));
  let usd = 0;
  try {
    const file = await localCopy(demo, key);
    await mapLimit(times, 4, async (f, i) => {
      f.file = path.join(dir, `f${String(i).padStart(3, "0")}.jpg`);
      try {
        await extractFrameAt(file, f.file, f.src, { longEdge: 1280, timeoutMs: FRAME_TIMEOUT });
        f.ok = (await fsp.stat(f.file).then((s) => s.size, () => 0)) > 0;
      } catch {
        f.ok = false;
      }
    });
    const frames = times.filter((f) => f.ok);
    if (!frames.length) return { error: true, sightings: [], frames: 0, missed: times.length, dropped: 0, usd };

    status(`Looking through ${frames.length} frames${what ? ` for “${short(what, 40)}”` : ""}…`);
    let missed = 0;
    let dropped = 0;
    let sample = "";
    const sightings = [];
    await mapLimit(frames, SCAN_PARALLEL, async (f) => {
      try {
        const r = await find(f.file);
        usd += num(r.usd);
        dropped += num(r.dropped);
        if (!sample && r.raw) sample = `t=${f.out}: ${JSON.stringify(r.raw).slice(0, 300)}`;
        for (const m of r.matches) sightings.push({ src: f.src, out: f.out, ...m });
      } catch (err) {
        missed += 1;
        console.warn(`[studio] command: the frame at ${f.out}s could not be asked about: ${String(err?.message).slice(0, 160)}`);
      }
    });
    return { sightings, frames: frames.length, missed, dropped, usd, sample, error: missed >= frames.length };
  } finally {
    fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Sightings grouped into the things they are sightings of.
 *
 * Joined only when a thing is seen again at the next frame looked at, in the
 * same place at the same size, showing the same text: never on a guess
 * (vision.js joinRegions). A thing that scrolled between two frames comes
 * out as two, and both are followed; two blurs over one thing look like one.
 * The other mistake is the one that leaks: in a list scrolling past, a NEW
 * row can arrive exactly where the last one was, and joined to it, it would
 * never get a blur of its own. The text's last characters (`tail`) keep them
 * apart; a sighting without them (a picture, a face) goes by place alone.
 */
export function instancesOf(sightings, step) {
  const same = (a, b) => {
    const cx = Math.abs(a.box.x + a.box.w / 2 - (b.box.x + b.box.w / 2));
    const cy = Math.abs(a.box.y + a.box.h / 2 - (b.box.y + b.box.h / 2));
    const rw = a.box.w / Math.max(1e-6, b.box.w);
    const rh = a.box.h / Math.max(1e-6, b.box.h);
    const text = !a.tail || !b.tail || a.tail === b.tail;
    return text && cx <= Math.max(a.box.w, b.box.w) * 0.25 && cy <= Math.max(a.box.h, b.box.h) * 0.5 && rw > 0.7 && rw < 1.43 && rh > 0.6 && rh < 1.67;
  };
  const out = [];
  for (const s of [...sightings].sort((a, b) => a.src - b.src || b.confidence - a.confidence)) {
    const hit = out.find((i) => i.last.src < s.src && s.src - i.last.src <= step * 1.6 + 0.05 && same(i.last, s));
    if (hit) {
      hit.seen.push(s);
      hit.last = s;
    } else {
      out.push({ seen: [s], last: s });
    }
  }
  return out.map((i) => {
    // Anchored where it was seen most surely, the earliest of those: that
    // frame is where the tracker cuts the picture of it to follow.
    const best = i.seen.reduce((a, b) => (b.confidence > a.confidence + 0.05 ? b : a));
    return { first: i.seen[0], best, seen: i.seen };
  });
}

/** Every place on a frame (a JPEG on disk) where the described thing is. */
export async function findSecrets(file, description, { ask = generateJson } = {}) {
  const data = await fsp.readFile(file);
  const parts = [{ text: SECRET_FINDER(str(description, 300)) }, { inlineData: { mimeType: "image/jpeg", data: data.toString("base64") } }];
  const res = await askJson(ask, { model: MODEL.vision, parts, maxOutputTokens: 2048, schema: SECRET_SCHEMA, label: "command blur" });
  const j = res.json || {};
  const all = (Array.isArray(j.matches) ? j.matches : []).map((m) => ({
    box: fromBox2d(m?.box_2d),
    label: str(m?.label, 40),
    // Only tells sightings apart (instancesOf): never stored or logged, being
    // three characters of what is being hidden.
    tail: String(m?.tail ?? "").trim().slice(-3).toLowerCase(),
    confidence: clamp(num(m?.confidence, 0.5), 0, 1),
  }));
  const matches = j.found === false ? [] : all.filter((m) => m.box && m.confidence >= MIN_FOUND).slice(0, 12);
  // `raw` and `dropped` are for the log when a scan finds nothing: what the
  // model said, and how much of it was thrown away here.
  return { matches, usd: num(res.usd), dropped: all.length - matches.length, raw: redact(j) };
}

/** A model's answer as it can be logged: boxes and scores, never the tails. */
function redact(j) {
  return {
    found: j?.found,
    matches: (Array.isArray(j?.matches) ? j.matches : []).map((m) => ({ box_2d: m?.box_2d, label: m?.label, confidence: m?.confidence })),
  };
}

/**
 * Where a close-up should be cut to check one box's edges: the box with room
 * around it (a line of text either side, and a good margin along it), in the
 * recording's own pixels.
 */
export function closeUp(box, W, H) {
  const bw = box.w * W;
  const bh = box.h * H;
  const padX = Math.max(bw * 0.6, 0.06 * W);
  const padY = Math.max(bh * 2.5, 0.05 * H);
  const x0 = clamp(box.x * W - padX, 0, W);
  const y0 = clamp(box.y * H - padY, 0, H);
  const x1 = clamp((box.x + box.w) * W + padX, 0, W);
  const y1 = clamp((box.y + box.h) * H + padY, 0, H);
  // Even sizes: the scaler after the crop wants them.
  const w = Math.max(16, Math.floor((x1 - x0) / 2) * 2);
  const h = Math.max(16, Math.floor((y1 - y0) / 2) * 2);
  return { x: Math.floor(x0), y: Math.floor(y0), w: Math.min(w, W - Math.floor(x0)), h: Math.min(h, H - Math.floor(y0)) };
}

/**
 * The box a close-up gives, as a box of the whole frame; null when it did not
 * find it or what it found cannot be the same thing.
 *
 * ── WHY A SECOND LOOK ────────────────────────────────────────────────────────
 * Boxes read off a whole frame are a row out often enough on small text that
 * "the element under the pointer" was once the item above it (prompts.js
 * POINTER_TARGET). For a zoom that is nothing; for a blur it is an API key
 * left in plain view with the line above it blurred. The close-up is read at
 * the recording's full resolution, where one line of text is dozens of pixels
 * tall instead of a dozen, and its box is the one used.
 */
export function fromCloseUp(edge, crop, coarse, W, H) {
  if (!edge) return null;
  const r = {
    x: (crop.x + edge.x * crop.w) / W,
    y: (crop.y + edge.y * crop.h) / H,
    w: (edge.w * crop.w) / W,
    h: (edge.h * crop.h) / H,
  };
  // The same thing: its middle within the first box (with half its size to
  // spare), and not wildly bigger or smaller.
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const inside = Math.abs(cx - (coarse.x + coarse.w / 2)) <= coarse.w && Math.abs(cy - (coarse.y + coarse.h / 2)) <= coarse.h * 1.5 + 0.01;
  const ratio = (r.w * r.h) / Math.max(1e-6, coarse.w * coarse.h);
  if (!inside || ratio < 0.1 || ratio > 6) return null;
  // Along the line, never narrower than the first look: a digit it saw and
  // the close-up missed stays under the blur.
  const sameLine = Math.abs(cy - (coarse.y + coarse.h / 2)) <= Math.max(r.h, coarse.h) * 0.75;
  if (sameLine) {
    const x0 = Math.min(r.x, coarse.x);
    const x1 = Math.max(r.x + r.w, coarse.x + coarse.w);
    return { x: x0, y: r.y, w: x1 - x0, h: r.h };
  }
  return r;
}

/** One box's edges, from a close-up at full resolution. The first box when the close-up cannot be read. */
export async function refineBox(demo, t, match, description, { ask = generateJson, W, H } = {}) {
  if (!(W > 0 && H > 0)) return match.box;
  const crop = closeUp(match.box, W, H);
  let file = null;
  try {
    file = await frameAt(demo, t, { crop });
    const data = await fsp.readFile(file);
    const parts = [{ text: EDGE_FINDER(match.label, str(description, 300)) }, { inlineData: { mimeType: "image/jpeg", data: data.toString("base64") } }];
    const res = await askJson(ask, { model: MODEL.vision, parts, maxOutputTokens: 512, schema: EDGE_SCHEMA, label: "command blur edges" });
    const j = res.json || {};
    const edge = j.found === false ? null : fromBox2d(j.box_2d);
    return fromCloseUp(edge, crop, match.box, W, H) || match.box;
  } catch (err) {
    console.warn(`[studio] command: the close-up at ${t.toFixed(2)}s could not be read: ${String(err?.message).slice(0, 160)}`);
    return match.box;
  } finally {
    if (file) fsp.rm(file, { force: true }).catch(() => {});
  }
}

/** A found box as a blur's box: padded like every other blur, and inside the frame. */
export function blurBox(b) {
  const w = clamp(b.w + BLUR_PAD_X * 2, 0.005, 1);
  const h = clamp(b.h + BLUR_PAD_Y * 2, 0.005, 1);
  return {
    x: round4(clamp(b.x - BLUR_PAD_X, 0, 1 - w)),
    y: round4(clamp(b.y - BLUR_PAD_Y, 0, 1 - h)),
    w: round4(w),
    h: round4(h),
  };
}
const round4 = (v) => Math.round(v * 10000) / 10000;

/* ────────────────────────────────────────────────────────────────────────────
   Asking the model what the sentence means
   ──────────────────────────────────────────────────────────────────────────── */

export const COMMAND_READER = `You turn a creator's message into an edit on the timeline of their screen-recording demo. You do not make the edit. You say what they mean, using the ids in the lists you are given.

What can be done for now:
- "add_zoom": zoom the camera in. On something on screen, at a time, over a stretch of time, at the playhead, or when a click happens.
- "remove_zoom": take zooms off the timeline.
- "add_blur": hide something on screen by blurring it: an email, an API key, a password, a name, a phone or card number, a face, a photo. Put what to hide in "look_for". "time" is the moment it is on screen when they say one ("here" is "playhead"); "none" when they did not, and then the whole video is searched.
- "remove_blur": take blurs off.
- "undo": they want the last change undone ("undo", "revert that", "go back", "wapas karo").
- "unsupported": anything else: cuts, captions, voiceover, changing the strength, timing or framing of an existing zoom, moving or resizing an existing blur, speed, music. Put ONE short sentence in "answer" saying where to do it by hand, using only this list:
    zoom strength: the Zoom level slider in the Zoom tab
    a zoom's timing: drag its edges on the timeline
    where a zoom points: drag its rectangle on the preview
    moving or resizing a blur: drag its box on the preview, in the Blur tab
    cuts: "Cut here" on the timeline, or the Video tab
    captions: the Captions tab
    voiceover: the Voice tab
- "unclear": you cannot tell what they want. Put one short question in "answer".

The creator may write in English, Hinglish or another language, casually, with typos. Understand it. Write "answer" in simple English.

TIME ("time.kind")
  "range"    a start and an end: "from 0:05 to 0:20", "between 10 and 15 seconds", "in the first 10 seconds", "after 1:00"
  "moment"   one time: "at 0:12", "at 45 seconds"
  "playhead" here, now, at this point, where I am
  "selected" this zoom, this blur, this one, the selected one
  "all"      every zoom or every blur: "remove all zooms", "remove all blurs"
  "none"     no time was said
Copy times EXACTLY as the creator wrote them into "start", "end" and "at": "0.5", "1.25", "1:25", "10s", "2 min". Do not convert, round or correct them. "0.5" stays "0.5" and "1.25" stays "1.25": the app works out what they mean and asks the creator when a time can be read two ways.
Only these rewrites are allowed:
  "first 10 seconds"                → start "0", end "10s"
  "last 10 seconds"                 → start "end-10s", end "end"
  "after 1:00", "from 1:00 onwards" → start "1:00", end "end"
  "before 0:30", "till 0:30"        → start "0", end "0:30"
  "from here to 0:40"               → start "playhead", end "0:40"
  "to the end"                      → end "end"
  a time in words                   → digits with a unit: "one minute ten" → "1 min 10 s", "dedh minute" → "90 s"
"length": how long, only when they said it: "for 5 seconds" → "5s". Otherwise "".

WHAT
"things": ids from THINGS ON SCREEN that the creator clearly named, best match first, at most 5. Match by meaning as well as spelling: "the projects tab in the sidebar" is a nav_item "Projects" at the left. Empty when nothing in the list is plainly what they mean, and empty when they describe something by how it looks (a picture, a photo, an icon, a colour, a section, text inside an image) rather than by a control's name. Never invent an id.
"look_for": whenever the creator names or describes a thing on screen, describe it here so it can be found by looking at the frame: in English, in their words, short, keeping any text they quoted exactly. "the girl image on the left with a play button, where the text says 'Be the next solo flier'". "the Install now button". "" when they did not name or describe a thing.
"clicks": ids from CLICKS, only when they tie the zoom to a click: "when I click Projects", "on the Billing click". Otherwise empty.
"zooms": ids from ZOOMS ON THE TIMELINE that the creator pointed at by what the zoom is on or by its order: "the zoom on Pricing", "the second zoom", "the last one". When they point at a zoom by time instead, leave this empty and use "time".
"named": the words the creator used for a thing on screen, like "Projects button". "" when they did not name a thing ("zoom here", "zoom at 0:12", "remove this zoom").
"blurs": ids from BLURS ON THE TIMELINE that the creator pointed at by what the blur is on or by its order: "the blur on the email", "the last blur". When they point at a blur by time, or say "this blur", leave this empty and use "time".
"level": how strong a zoom, only when they said it: "2x" → 2, "zoom in a lot" → 2.4, "a little" → 1.4. Otherwise 0.
"blur_kind": for add_blur, "pixelate" when they ask for pixels or a mosaic, "box" when they ask for a black box, a solid box or to cover it completely; otherwise "blur".
"everywhere": true when they ask for it hidden everywhere, throughout, in the whole video, wherever it appears. Otherwise false.

EXAMPLES
"zoom in on projects"                   → add_zoom, time none, things [the Projects item], look_for "Projects"
"add zoom from 0.5 to 1.25"             → add_zoom, range, start "0.5", end "1.25"
"zoom here for 4 sec"                   → add_zoom, playhead, length "4s"
"billing pe click ho tab zoom karo"     → add_zoom, time none, clicks [the click on Billing]
"zoom on the search bar at 0:20"        → add_zoom, moment, at "0:20", things [the search field], look_for "the search bar"
"zoom on the photo with the play icon"  → add_zoom, time none, things [], look_for "the photo with the play icon"
"remove this zoom"                      → remove_zoom, selected
"delete zooms in the first 10 seconds"  → remove_zoom, range, start "0", end "10s"
"remove the zoom on pricing"            → remove_zoom, zooms [the zoom on Pricing]
"remove all zooms"                      → remove_zoom, all
"make this zoom stronger"               → unsupported, answer "Use the Zoom level slider in the Zoom tab."
"blur my email"                         → add_blur, time none, look_for "the email address"
"blur this email here"                  → add_blur, playhead, look_for "the email address"
"blur the api key at 0:12"              → add_blur, moment, at "0:12", look_for "the API key"
"hide the card number with a black box" → add_blur, time none, look_for "the card number", blur_kind "box"
"blur the api keys and email everywhere" → add_blur, time none, look_for "the API keys and the email address", everywhere true
"remove this blur"                      → remove_blur, selected
"remove the blur on the email"          → remove_blur, blurs [the blur on "account email"]
"remove all blurs"                      → remove_blur, all

Return ONLY valid JSON matching the schema.`;

const COMMAND_SCHEMA = {
  type: "OBJECT",
  properties: {
    action: { type: "STRING", enum: ["add_zoom", "remove_zoom", "add_blur", "remove_blur", "undo", "unsupported", "unclear"] },
    time: {
      type: "OBJECT",
      properties: {
        kind: { type: "STRING", enum: ["none", "playhead", "moment", "range", "selected", "all"] },
        at: { type: "STRING" },
        start: { type: "STRING" },
        end: { type: "STRING" },
      },
      required: ["kind", "at", "start", "end"],
      propertyOrdering: ["kind", "at", "start", "end"],
    },
    length: { type: "STRING" },
    things: { type: "ARRAY", maxItems: 5, items: { type: "STRING" } },
    clicks: { type: "ARRAY", maxItems: 5, items: { type: "STRING" } },
    zooms: { type: "ARRAY", maxItems: 40, items: { type: "STRING" } },
    blurs: { type: "ARRAY", maxItems: 40, items: { type: "STRING" } },
    named: { type: "STRING" },
    look_for: { type: "STRING" },
    level: { type: "NUMBER" },
    // Free text, not an enum: the service refused an enum holding "" (the
    // default), with a 400 on every message. cleanIntent keeps only known styles.
    blur_kind: { type: "STRING" },
    everywhere: { type: "BOOLEAN" },
    answer: { type: "STRING" },
  },
  required: ["action", "time", "length", "things", "clicks", "zooms", "blurs", "named", "look_for", "level", "blur_kind", "everywhere", "answer"],
  propertyOrdering: ["action", "time", "length", "things", "clicks", "zooms", "blurs", "named", "look_for", "level", "blur_kind", "everywhere", "answer"],
};

/** The lists, as the model reads them, with the short ids it answers in. */
export function describe(ctx, history = []) {
  const zoomIds = new Map();
  const blurIds = new Map();
  const clickIds = new Map();
  const thingIds = new Map();
  const lines = [];

  lines.push(`The finished video is ${fmt(ctx.total)} long. Every time below is as the creator sees it on the player.`);
  lines.push(`Playhead: ${fmt(ctx.playhead)}.`);

  lines.push("", "ZOOMS ON THE TIMELINE");
  ctx.zooms.forEach((z, i) => {
    const id = `Z${i + 1}`;
    zoomIds.set(id, z.id);
    const sel = z.id === ctx.selected ? " (selected)" : "";
    lines.push(`${id} ${fmt(z.outStart)}–${fmt(z.outEnd)}${z.label ? ` on "${z.label}"` : ""}${z.auto ? " (automatic)" : ""}${sel}`);
  });
  if (!ctx.zooms.length) lines.push("(none)");

  lines.push("", "BLURS ON THE TIMELINE");
  ctx.blurs.forEach((b, i) => {
    const id = `B${i + 1}`;
    blurIds.set(id, b.id);
    const sel = b.id === ctx.selectedBlur ? " (selected)" : "";
    lines.push(`${id} ${b.label ? `on "${b.label}"` : "unnamed"}, placed at ${fmt(toOutputSnapped(b.at ?? b.start, ctx.lay))}${b.kind !== "blur" ? ` (${b.kind})` : ""}${sel}`);
  });
  if (!ctx.blurs.length) lines.push("(none)");

  lines.push("", "CLICKS THE CREATOR MADE");
  ctx.clicks.forEach((c, i) => {
    const id = `C${i + 1}`;
    clickIds.set(id, c.t);
    lines.push(`${id} ${fmt(c.out)} on ${c.label ? `"${c.label}"` : "something unnamed"}`);
  });
  if (!ctx.clicks.length) lines.push("(none found)");

  lines.push("", `THINGS ON SCREEN (read from one frame every ${Number(ctx.every.toFixed(1))} s)`);
  ctx.things.forEach((th, i) => {
    const id = `T${i + 1}`;
    thingIds.set(id, th.key);
    const seen = th.spans
      .slice(0, 4)
      .map((s) => (s.to - s.from < 0.05 ? fmt(s.from) : `${fmt(s.from)}–${fmt(s.to)}`))
      .join(", ");
    const clicked = th.clicks.length
      ? `, clicked (${th.clicks.map((c) => `C${ctx.clicks.indexOf(c) + 1}`).slice(0, 4).join(", ")})`
      : "";
    lines.push(`${id} ${th.type}${th.label ? ` "${th.label}"` : ""} at ${whereOnScreen(th.readings[0].box)}, on screen ${seen}${clicked}`);
  });
  if (!ctx.things.length) lines.push(ctx.read ? "(nothing was read)" : "(the screens of this recording were not read)");

  const past = (Array.isArray(history) ? history : [])
    .slice(-6)
    .map((m) => ({ who: m?.role === "user" ? "creator" : "app", text: str(m?.text, 240) }))
    .filter((m) => m.text);
  if (past.length) {
    lines.push("", "EARLIER IN THIS CONVERSATION");
    for (const m of past) lines.push(`${m.who}: ${m.text}`);
  }

  return { text: lines.join("\n"), zoomIds, clickIds, thingIds, blurIds };
}

/**
 * Ask the model what the creator meant, and translate its answer into stable
 * references: real zoom ids, click times, thing keys. Short ids like "T12" only
 * mean something against the list they were written for, and a button offered
 * now may be pressed after the list has changed.
 */
export async function readCommand(text, ctx, history = [], { ask = generateJson } = {}) {
  const d = describe(ctx, history);
  const parts = [{ text: `${COMMAND_READER}\n\n${d.text}\n\nTHE CREATOR'S MESSAGE\n${JSON.stringify(str(text, MAX_TEXT))}` }];
  const res = await askJson(ask, { model: TEXT_MODEL, parts, maxOutputTokens: 1024, schema: COMMAND_SCHEMA, label: "command" });
  const j = res.json || {};
  const pick = (ids, map) => [...new Set((Array.isArray(ids) ? ids : []).map((id) => map.get(String(id).trim())).filter((v) => v != null))];
  const intent = cleanIntent({
    action: j.action,
    time: j.time,
    length: j.length,
    thingKeys: pick(j.things, d.thingIds),
    clickTimes: pick(j.clicks, d.clickIds),
    zoomIds: pick(j.zooms, d.zoomIds),
    blurIds: pick(j.blurs, d.blurIds),
    blurKind: j.blur_kind,
    everywhere: j.everywhere,
    named: j.named,
    lookFor: j.look_for,
    level: j.level,
    answer: j.answer,
  });
  return { intent, usd: num(res.usd) };
}

const ACTIONS = ["add_zoom", "remove_zoom", "add_blur", "remove_blur", "undo", "unsupported", "unclear"];

function cleanBox(b) {
  if (!b || typeof b !== "object") return null;
  const x = clamp(num(b.x, NaN), 0, 1);
  const y = clamp(num(b.y, NaN), 0, 1);
  const w = clamp(num(b.w, NaN), 0, 1 - x);
  const h = clamp(num(b.h, NaN), 0, 1 - y);
  return [x, y, w, h].every(Number.isFinite) && w > 0.004 && h > 0.004 ? { x, y, w, h } : null;
}
const KINDS = ["none", "playhead", "moment", "range", "selected", "all"];

/** An intent from the model or from a button, held to its shape. */
export function cleanIntent(i = {}) {
  const t = i?.time || {};
  const list = (v, n, f) => (Array.isArray(v) ? v.slice(0, n).map(f).filter((x) => x !== "" && x != null && !Number.isNaN(x)) : []);
  return {
    action: ACTIONS.includes(i?.action) ? i.action : "unclear",
    time: {
      kind: KINDS.includes(t.kind) ? t.kind : "none",
      at: str(t.at, 40),
      start: str(t.start, 40),
      end: str(t.end, 40),
    },
    length: str(i?.length, 40),
    thingKeys: list(i?.thingKeys, 5, (v) => str(v, 200)),
    clickTimes: list(i?.clickTimes, 5, (v) => Number(v)),
    zoomIds: list(i?.zoomIds, 40, (v) => str(v, 32)),
    blurIds: list(i?.blurIds, 40, (v) => str(v, 32)),
    blurKind: ["blur", "pixelate", "box"].includes(i?.blurKind) ? i.blurKind : "",
    everywhere: !!i?.everywhere,
    // Look through the video a frame a second instead of every two.
    close: !!i?.close,
    named: str(i?.named, 80),
    // How to find it by looking, when the readings have no name for it.
    lookFor: str(i?.lookFor, 300),
    // A place already found on a frame: a button offering another of the
    // matches the model saw there, so picking it needs no second look.
    box: cleanBox(i?.box),
    boxLabel: str(i?.boxLabel, 60),
    level: clamp(num(i?.level), 0, 10),
    answer: str(i?.answer, 240),
    // Zooms to take off before this one goes on: the zoom a previous answer
    // added, when the creator picks one of the other moments it offered.
    replace: list(i?.replace, 5, (v) => str(v, 32)),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   Resolving an intent into an edit
   ──────────────────────────────────────────────────────────────────────────── */

const info = (reply, choices = []) => ({ kind: "info", reply, choices });
const ask = (reply, choices) => ({ kind: "ask", reply, choices });

/**
 * @returns {{
 *   kind: "applied"|"ask"|"info"|"undo",
 *   reply: string,
 *   ops?: { add: object[], remove: string[], trim: {id: string, end: number}[] },
 *   select?: string|null, seek?: number|null,
 *   choices?: {label: string, intent: object}[]
 * }}
 */
export async function resolve(intent, ctx) {
  if (intent.action === "undo") return { kind: "undo", reply: "" };
  if (intent.action === "unsupported") {
    return info(`For now I can add and remove zooms and blurs.${intent.answer ? ` ${intent.answer}` : ""}`);
  }
  if (intent.action === "unclear") {
    return info(intent.answer || "I didn't follow that. Try “zoom in on Projects”, “blur the email address” or “remove the zoom at 0:12”.");
  }
  if (intent.action === "remove_zoom") return removeZoom(intent, ctx);
  if (intent.action === "add_blur") return addBlur(intent, ctx);
  if (intent.action === "remove_blur") return removeBlur(intent, ctx);
  return addZoom(intent, ctx);
}

/** A button that asks for the same thing with one part made definite. */
const choice = (label, intent, change) => ({ label, intent: { ...intent, ...change, time: { ...intent.time, ...(change.time || {}) } } });

function badTime(what) {
  return info(`I couldn't read the time “${what}”. Try it like 0:12, 12s or 1 min 5 s.`);
}

/** What to call a thing in a reply and on the zoom: the creator's words when they are short, else what was found. */
function nameFor(intent, found) {
  const own = intent.named;
  if (own && own.length <= 40) return own;
  return found || own.slice(0, 40) || "it";
}

/* ── Add ─────────────────────────────────────────────────────────────────── */

async function addZoom(intent, ctx) {
  const { total, playhead } = ctx;
  const level = intent.level ? clamp(intent.level, LEVEL_MIN, LEVEL_MAX) : DEFAULT_LEVEL;
  const things = intent.thingKeys.map((k) => ctx.thingByKey.get(k)).filter(Boolean);
  const named = intent.named || things[0]?.label || "";
  // What to look for on the frame when the readings have no name for it.
  const lookFor = intent.lookFor || intent.named;
  const canLook = !!(lookFor && ctx.look);
  let length = null;
  if (intent.length) {
    length = readLength(intent.length);
    if (length == null) return badTime(intent.length);
  }
  const span = length ?? DEFAULT_LENGTH;

  // Named, nothing in the readings matched, and no way to look: say so.
  if (!things.length && !intent.clickTimes.length && !intent.box && intent.named && !canLook) {
    return info(notFound(intent.named, ctx));
  }

  // ── When ──────────────────────────────────────────────────────────────────
  let win = null; // { s, e, anchor, why, click? }
  const alts = [];
  const kind = intent.time.kind;

  if (kind === "range") {
    const r = readRange(intent.time.start, intent.time.end, ctx);
    if (r.bad) return badTime(r.bad);
    if (!r.ranges.length) return info(outside(intent.time.start, intent.time.end, total));
    if (r.ranges.length > 1) {
      return ask(
        "Which do you mean?",
        r.ranges.map((x) => choice(rangeLabel(x), intent, { time: { kind: "range", start: secText(x.s), end: secText(x.e) } }))
      );
    }
    win = { s: r.ranges[0].s, e: r.ranges[0].e, anchor: r.ranges[0].s, why: "range" };
  } else if (kind === "moment") {
    const m = readMoment(intent.time.at, ctx);
    if (m.bad) return badTime(m.bad);
    if (!m.moments.length) return info(`${intent.time.at} is past the end of this video (${fmt(total)}).`);
    if (m.moments.length > 1) {
      return ask(
        "Which time do you mean?",
        m.moments.map((x) => choice(x.how === "seconds" ? `${Number(x.sec.toFixed(2))} s` : fmt(x.sec), intent, { time: { kind: "moment", at: secText(x.sec) } }))
      );
    }
    win = { s: m.moments[0].sec, e: m.moments[0].sec + span, anchor: m.moments[0].sec, why: "moment" };
  } else if (kind === "playhead" || kind === "selected" || kind === "all") {
    win = { s: playhead, e: playhead + span, anchor: playhead, why: "playhead" };
  } else {
    // No time. A click, then a thing, then the playhead, like the Add button.
    const clicks = intent.clickTimes.map((t) => ctx.clicks.find((c) => Math.abs(c.t - t) < 0.01)).filter(Boolean);
    if (clicks.length) {
      const c = clicks[0];
      win = clickWindow(c, span, total);
      for (const o of clicks.slice(1, 4)) alts.push({ label: `Use the click at ${fmt(o.out)}`, change: { clickTimes: [o.t], time: { kind: "none" } } });
    } else if (things.length && !intent.box) {
      const pickd = momentFor(things[0], ctx);
      if (pickd.click) win = clickWindow(pickd.click, span, total);
      else win = { s: pickd.at, e: pickd.at + span, anchor: pickd.at, why: pickd.why };
      alts.push(...pickd.alts);
    } else {
      win = { s: playhead, e: playhead + span, anchor: playhead, why: "playhead" };
    }
  }

  win.s = clamp(win.s, 0, total);
  win.e = clamp(win.e, 0, total);
  win.anchor = clamp(win.anchor, 0, total);
  if (win.e - win.s < MIN_LENGTH) {
    if (win.s >= total - MIN_LENGTH) return info(`That's the very end of the video (${fmt(total)}), so there's no room for a zoom there.`);
    return info("That's too short for a zoom. Give it at least half a second.");
  }

  // ── Where ─────────────────────────────────────────────────────────────────
  let box = null;
  let point = null;
  let label = "";
  let where = "";
  let lookedAt = null; // the output time of the frame that was looked at
  let scanned = false; // found by looking through the video, not at the playhead
  const clickThing = win.click?.thing;
  const thing = intent.box ? null : clickThing || things[0] || null;

  if (intent.box) {
    // A place already found on a frame, from a button: the other match it
    // offered, so it goes by what was found there, not by the creator's words
    // (which described the first).
    box = intent.box;
    label = intent.boxLabel || nameFor(intent, "");
    where = "seen";
  } else if (thing) {
    const at = win.click ? win.click.out : win.anchor + SETTLE;
    const r = nearest(thing, at, ctx.tol) || (win.why === "range" ? firstIn(thing, win.s, win.e) : null);
    if (r) {
      box = r.box;
      label = thing.label || thing.type.replace(/_/g, " ");
      where = "thing";
    } else if (!win.click && !canLook) {
      // Named, found, and not on screen at the time asked for.
      return info(
        `“${thing.label || named}” isn't on screen at ${fmt(win.anchor)}. It is on screen ${spansText(thing)}.`,
        momentChoices(thing, intent, ctx)
      );
    }
  }

  // The readings have nothing for it at this moment: look at the frame, and
  // when it isn't on that frame, look through the video for it. Finding it is
  // this feature's job; sending the creator to scrub for it is not.
  if (!box && !win.click && canLook) {
    const at = win.anchor;
    const seen = await ctx.look(at, lookFor);
    if (seen.error) {
      return info(`I couldn't look at the video just now, so I can't find “${nameFor(intent, "")}”. Try again in a moment.`);
    }
    let hit = seen.matches.length ? { matches: seen.matches, at } : null;
    if (!hit) {
      const when = win.why === "playhead" ? "at the playhead" : `at ${fmt(at)}`;
      if (!ctx.scanLook) return info(`“${nameFor(intent, "")}” isn't on screen ${when}, and I can't look through the rest of the video right now. Try again in a moment.`);
      const close = !!intent.close;
      const r = await ctx.scanLook(lookFor, { close });
      if (r.error) return info(`“${nameFor(intent, "")}” isn't on screen ${when}, and I couldn't look through the rest of the video just now. Try again in a moment.`);
      const places = placesOf(r.sightings, scanStep(total, close));
      if (!places.length) {
        const closer = close ? [] : [choice("Look more closely", intent, { close: true })];
        return info(
          `I looked through the whole video (${r.frames} frames) and couldn't find “${nameFor(intent, "")}”. ` +
            (close ? "Try describing it another way, like the words written on it." : "I can look more closely, or you can describe it another way, like the words written on it."),
          closer
        );
      }
      // A time they named is kept: where it really is comes as buttons.
      if (win.why === "moment" || win.why === "range") {
        return info(
          `“${nameFor(intent, "")}” isn't on screen at ${fmt(at)}. I found it at ${places.slice(0, 3).map((p) => fmt(p.from)).join(", ")}.`,
          places.slice(0, 3).map((p) => choice(`Zoom at ${fmt(p.from)}`, intent, placeChange(p)))
        );
      }
      // No time given: the first place it appears, and the others as buttons.
      const first = places[0];
      win = { s: first.from, e: clamp(first.from + span, 0, total), anchor: first.from, why: "seen" };
      if (win.e - win.s < MIN_LENGTH) win.s = Math.max(0, win.e - MIN_LENGTH);
      hit = { matches: [first.best], at: first.from, scanned: true };
      for (const p of places.slice(1, 3)) alts.push({ label: `Use ${fmt(p.from)} instead`, change: placeChange(p) });
    }
    const [best, ...others] = hit.matches;
    box = best.box;
    label = nameFor(intent, best.label);
    where = "seen";
    lookedAt = hit.at;
    scanned = !!hit.scanned;
    for (const o of others) {
      alts.push({ label: `Use: ${o.label || "the other match"}`, change: { box: o.box, boxLabel: o.label } });
    }
  }

  if (!box && win.click) {
    point = { x: win.click.x, y: win.click.y };
    label = win.click.label;
    where = "click";
  }
  if (!box && !point) {
    const p = ctx.track.length ? cursorAt(ctx.track, toSource(Math.min(win.anchor + SETTLE, win.e), ctx.lay)) : null;
    if (p) {
      point = { x: p.x, y: p.y };
      where = "pointer";
    } else {
      point = { x: 0.5, y: 0.5 };
      where = "centre";
    }
  }

  let rect = box ? containingBox([box], level) : containing([point], level);
  let effective = 1 / Math.max(0.01, rect.w);
  let cropped = false;
  // Too big to hold whole in a zoomed frame: zoom on its middle and crop its edges.
  if (box && effective < MIN_EFFECTIVE) {
    const lv = intent.level ? level : CROP_LEVEL;
    rect = containing([{ x: box.x + box.w / 2, y: box.y + box.h / 2 }], lv);
    effective = 1 / Math.max(0.01, rect.w);
    cropped = true;
  }

  // ── Room: a zoom that is added is its own shot ────────────────────────────
  // It never swallows the zoom after it. It ends far enough before the next
  // one for the camera to pull out (camera.mjs zoomOutGap) when that leaves it
  // a real length, and otherwise just before it, as a separate zoom the camera
  // moves straight on from. The first creator to try this added a zoom at
  // 0:28.6 with an automatic one at 0:29.6, and the old rule replaced that one
  // with a single zoom running 0:28.6–0:31.1: "it got merged with the next
  // zoom". Only a zoom at the very same moment (a redo of it), or one wholly
  // inside a stretch of time the creator gave, is replaced.
  const sStart = round3(toSource(win.s, ctx.lay));
  let sEnd = round3(toSource(win.e, ctx.lay));
  const ours = { easing: "smooth" };
  const explicitEnd = win.why === "range" || length != null;
  const replace = new Set(intent.replace);
  const remove = [...replace].filter((id) => ctx.zooms.some((z) => z.id === id));
  const trim = [];
  const replaced = [];
  let shortened = null; // { z, end }: an earlier zoom, cut back
  let stoppedFor = null; // { z, tight }: the next zoom this one now ends before
  const others = ctx.zooms.filter((z) => !replace.has(z.id));
  // A place found by looking goes with every button, so picking one needs no second look.
  const found = where === "seen" && box ? { box, boxLabel: label } : {};

  // The same shot: starting at the same moment AND on the same thing, like
  // "zoom in on Projects" over the automatic zoom on that very click. A zoom
  // on something else is never taken for it, however close.
  const sameShot = (z) => {
    if (Math.abs(z.start - sStart) >= SAME_MOMENT) return false;
    const a = norm(z.label);
    const b = norm(label || named);
    return !!(a && b && (a === b || a.includes(b) || b.includes(a)));
  };

  for (const z of others) {
    if (!(z.start < sEnd && z.end > sStart)) continue;
    if (sameShot(z)) {
      remove.push(z.id);
      replaced.push(z);
      continue;
    }
    if (z.start >= sStart) continue; // a later one: below
    const cut = endBefore(z.start, z, ours, sStart, MIN_OWN, MIN_KEEP);
    if (cut != null) {
      trim.push({ id: z.id, end: cut });
      shortened = { z, end: cut };
    } else {
      remove.push(z.id);
      replaced.push(z);
    }
  }

  const gone = new Set(remove);
  for (const z of others.filter((o) => o.start >= sStart && !gone.has(o.id)).sort((a, b) => a.start - b.start)) {
    if (explicitEnd) {
      // A stretch the creator gave is kept as given, and what is wholly inside
      // it is part of it. Only one that starts inside it and runs on is its own.
      if (z.start >= sEnd - 1e-6) break;
      if (z.end <= sEnd + 1e-6) {
        remove.push(z.id);
        replaced.push(z);
        continue;
      }
    } else if (z.start >= sEnd + zoomOutGap(ours, z)) {
      break;
    }
    const end = endBefore(sStart, ours, z, z.start, MIN_OWN, MIN_TIGHT);
    if (end != null) {
      if (end < sEnd) {
        stoppedFor = { z, tight: end > z.start - zoomOutGap(ours, z) + 1e-6 };
        sEnd = end;
      }
      break;
    }
    // Not even room to end just before it: ask rather than swallow it.
    const after = clamp(z.outEnd + EDGE, 0, total);
    const options = [choice(`Replace the zoom at ${fmt(z.outStart)}`, intent, { ...found, replace: [...intent.replace, z.id] })];
    if (after < total - MIN_LENGTH) {
      options.push(choice(`Zoom right after it, at ${fmt(after)}`, intent, { time: { kind: "moment", at: secText(after), start: "", end: "" } }));
    }
    return ask(
      `There's already a zoom at ${fmt(z.outStart)}, only ${Number((z.outStart - win.s).toFixed(1))} s after ${fmt(win.s)}, so there isn't room for another zoom before it.`,
      options
    );
  }
  if (stoppedFor) win.e = toOutputSnapped(sEnd, ctx.lay);
  if (stoppedFor) alts.unshift({ label: `Replace the zoom at ${fmt(stoppedFor.z.outStart)} instead`, change: { ...found, replace: [stoppedFor.z.id] } });

  const onThing = where === "thing" || where === "click" || where === "seen";
  const zoom = {
    id: newId("z"),
    start: sStart,
    end: sEnd,
    x: rect.x, y: rect.y, w: rect.w, h: rect.h,
    level: round3(cropped ? Math.min(level, effective) : level),
    easing: "smooth",
    camera: onThing ? "element" : "region",
    follow: false,
    follow_strength: 0.7,
    label: str(label, 80),
    intent: where === "click" || win.click ? "click" : "other",
    auto: false,
  };

  // ── What to say ───────────────────────────────────────────────────────────
  const shown = Math.min(level, effective);
  let reply = `Added a ${fmtLevel(shown)} zoom`;
  if (onThing) reply += ` on “${zoom.label || named || "what you clicked"}”`;
  reply += ` from ${fmt(win.s)} to ${fmt(win.e)}`;
  if (win.click) reply += ", when you clicked it";
  else if (win.why === "playhead") reply += ", at the playhead";
  else if (win.why === "seen") reply += ", when it first appears";
  reply += ".";
  if (lookedAt != null && scanned) reply += " It wasn't at the playhead, so I looked through the video for it. If the rectangle on the preview isn't on it, drag it there or describe it differently.";
  else if (lookedAt != null) reply += ` I found it by looking at the frame at ${fmt(lookedAt)}. If the rectangle on the preview isn't on it, drag it there or describe it differently.`;
  if (where === "pointer") reply += ` It's centred on where the pointer was at ${fmt(win.anchor)}. Drag the rectangle on the preview to move it.`;
  if (where === "centre") reply += " It's centred on the middle of the screen, because I couldn't see the pointer then. Drag the rectangle on the preview to move it.";
  if (cropped) reply += ` “${zoom.label}” is bigger than a zoomed-in view can hold, so this zooms on its middle and crops its edges.`;
  else if (effective < level - 0.05) reply += ` That's as close as it can get while keeping all of “${zoom.label}” in view.`;
  if (stoppedFor && !stoppedFor.tight) reply += ` It ends there so the camera can pull out before the next zoom, at ${fmt(stoppedFor.z.outStart)}.`;
  if (stoppedFor && stoppedFor.tight) reply += ` It ends just before the next zoom, at ${fmt(stoppedFor.z.outStart)}, so the camera moves straight from this one to that one.`;
  if (replaced.length === 1) reply += ` It replaces the zoom that was at ${fmt(replaced[0].outStart)}.`;
  if (replaced.length > 1) reply += ` It replaces ${replaced.length} zooms that were inside that time.`;
  if (shortened) reply += ` The zoom before it now ends at ${fmt(toOutputSnapped(shortened.end, ctx.lay))}, so the camera pulls out in between.`;

  const choices = alts.slice(0, 3).map((a) => choice(a.label, intent, { ...a.change, replace: [zoom.id, ...(a.change.replace || [])] }));

  return {
    kind: "applied",
    reply,
    ops: { add: [zoom], remove, trim },
    select: zoom.id,
    seek: round3(Math.min(win.s + 0.6, win.e)),
    choices,
  };
}

/**
 * Sightings of a thing as the stretches of the video it is on screen:
 * [{ from, to, best }], `best` the sighting at `from` (where a zoom on it
 * starts, so its box is the one on screen then).
 */
function placesOf(sightings, step) {
  const byFrame = new Map();
  for (const s of sightings) {
    const cur = byFrame.get(s.out);
    if (!cur || s.confidence > cur.confidence) byFrame.set(s.out, s);
  }
  const out = [];
  for (const s of [...byFrame.values()].sort((a, b) => a.out - b.out)) {
    const last = out[out.length - 1];
    if (last && s.out - last.to <= step * 1.6 + 0.05) last.to = s.out;
    else out.push({ from: s.out, to: s.out, best: s });
  }
  return out;
}

/** A button's change for zooming on one of those places: that moment, and the box already found there. */
const placeChange = (p) => ({ time: { kind: "moment", at: secText(p.from), start: "", end: "" }, box: p.best.box, boxLabel: p.best.label });

/** A zoom around a press: arriving just before it, for `span` seconds. */
function clickWindow(c, span, total) {
  const s = clamp(c.out - LEAD, 0, total);
  return { s, e: s + span, anchor: c.out, why: "click", click: c };
}

/** The first reading of a thing inside a stretch of time. */
function firstIn(th, s, e) {
  return th.readings.find((r) => r.out >= s - 0.25 && r.out <= e) || null;
}

function spansText(th) {
  const list = th.spans.slice(0, 3).map((s) => (s.to - s.from < 0.05 ? `at ${fmt(s.from)}` : `${fmt(s.from)}–${fmt(s.to)}`));
  return list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}` : list[0] || "";
}

/**
 * Which moment "zoom on X", with no time, most likely means.
 *
 * If X is on screen where the playhead is, the creator is probably looking at
 * it: a click on X in that stretch wins, otherwise the playhead itself. If not,
 * the first click on X, then the first time X appears. The other candidates
 * come back as buttons.
 */
function momentFor(th, ctx) {
  const { playhead, every } = ctx;
  const clicks = [...th.clicks].sort((a, b) => a.out - b.out);
  const inSpan = th.spans.find((s) => playhead >= s.from - every / 2 && playhead <= s.to + every / 2);
  const alts = [];
  let picked = null;

  if (inSpan) {
    const c = clicks.find((k) => k.out >= inSpan.from - every && k.out <= inSpan.to + every);
    if (c) picked = { click: c, why: "click" };
    else if (playhead > 0.2) picked = { at: playhead, why: "playhead" };
  }
  if (!picked && clicks.length) picked = { click: clicks[0], why: "click" };
  if (!picked) picked = { at: th.spans[0].from, why: "seen" };

  for (const c of clicks) {
    if (picked.click === c) continue;
    alts.push({ label: `Use the click at ${fmt(c.out)}`, change: { clickTimes: [c.t], time: { kind: "none" } } });
  }
  if (picked.why === "click" && inSpan && playhead > 0.2 && Math.abs(playhead - picked.click.out) > 1) {
    alts.push({ label: `At the playhead (${fmt(playhead)})`, change: { time: { kind: "moment", at: secText(playhead) } } });
  }
  for (const s of th.spans) {
    const near = (picked.at != null && Math.abs(picked.at - s.from) < 1) || clicks.some((c) => c.out >= s.from - every && c.out <= s.to + every);
    if (near) continue;
    alts.push({ label: `At ${fmt(s.from)}`, change: { time: { kind: "moment", at: secText(s.from) } } });
  }
  return { ...picked, alts };
}

/** Buttons for the moments a thing can be zoomed on. */
function momentChoices(th, intent, ctx) {
  const out = [];
  for (const c of th.clicks.slice(0, 2)) {
    out.push(choice(`Zoom when it's clicked (${fmt(c.out)})`, intent, { clickTimes: [c.t], time: { kind: "none", at: "", start: "", end: "" } }));
  }
  for (const s of th.spans.slice(0, 3 - out.length)) {
    if (th.clicks.some((c) => c.out >= s.from - ctx.every && c.out <= s.to + ctx.every)) continue;
    out.push(choice(`Zoom at ${fmt(s.from)}`, intent, { time: { kind: "moment", at: secText(s.from), start: "", end: "" } }));
  }
  return out.slice(0, 3);
}

/**
 * Only when there is nothing to look at: the recording's file is gone. With a
 * file, a name the readings do not have is looked for on the frame instead.
 */
function notFound(named) {
  return `I couldn't find “${named}”, and this recording's video file isn't available for me to look at right now. Try again in a moment.`;
}

function outside(start, end, total) {
  return `${start || "0"} to ${end || "the end"} doesn't fit in this video, which is ${fmt(total)} long.`;
}

/* ── Remove ──────────────────────────────────────────────────────────────── */

/** The zoom playing at an output time, or the nearest one within NEAR. */
function zoomNear(zooms, at) {
  const on = zooms.find((z) => at >= z.outStart - 0.05 && at <= z.outEnd + 0.05);
  if (on) return { zoom: on, exact: true };
  let best = null;
  let bestD = Infinity;
  for (const z of zooms) {
    const d = at < z.outStart ? z.outStart - at : at - z.outEnd;
    if (d < bestD) {
      best = z;
      bestD = d;
    }
  }
  return best ? { zoom: best, exact: false, distance: bestD } : null;
}

/** Zooms that are on a thing: named after it, or framing where it was. */
function zoomsOn(th, zooms, tol) {
  return zooms.filter((z) => {
    if (th.label && z.label && norm(z.label) === norm(th.label)) return true;
    const r = nearest(th, (z.outStart + z.outEnd) / 2, tol);
    if (!r) return false;
    const cx = r.box.x + r.box.w / 2;
    const cy = r.box.y + r.box.h / 2;
    return cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h;
  });
}

function removeZoom(intent, ctx) {
  const zooms = ctx.zooms;
  if (!zooms.length) return info("There are no zooms on the timeline to remove.");
  const kind = intent.time.kind;
  let pick = [];

  if (intent.zoomIds.length) {
    pick = zooms.filter((z) => intent.zoomIds.includes(z.id));
    if (!pick.length) return info("That zoom isn't on the timeline any more.");
  } else if (kind === "all") {
    pick = zooms;
  } else if (kind === "range") {
    const r = readRange(intent.time.start, intent.time.end, ctx);
    if (r.bad) return badTime(r.bad);
    if (!r.ranges.length) return info(outside(intent.time.start, intent.time.end, ctx.total));
    if (r.ranges.length > 1) {
      return ask(
        "Which do you mean?",
        r.ranges.map((x) => choice(rangeLabel(x), intent, { time: { kind: "range", start: secText(x.s), end: secText(x.e) } }))
      );
    }
    const { s, e } = r.ranges[0];
    pick = zooms.filter((z) => z.outStart < e && z.outEnd > s);
    if (!pick.length) return info(`There are no zooms between ${fmt(s)} and ${fmt(e)}.`);
  } else if (kind === "none" && (intent.thingKeys.length || intent.named)) {
    const things = intent.thingKeys.map((k) => ctx.thingByKey.get(k)).filter(Boolean);
    const name = intent.named || things[0]?.label || "";
    pick = things.length
      ? [...new Set(things.flatMap((th) => zoomsOn(th, zooms, ctx.tol)))]
      : zooms.filter((z) => z.label && norm(z.label).includes(norm(name)));
    if (!pick.length) {
      return ask(
        `I couldn't tell which zoom is on “${name}”. Which one?`,
        zooms.slice(0, 5).map((z) => choice(`${fmt(z.outStart)}${z.label ? ` on “${short(z.label, 24)}”` : ""}`, intent, { zoomIds: [z.id] }))
      );
    }
  } else {
    // This one: the selected zoom, the one at a time, or the one at the playhead.
    if ((kind === "selected" || kind === "none") && ctx.selected) {
      pick = zooms.filter((z) => z.id === ctx.selected);
    } else {
      let at = ctx.playhead;
      if (kind === "moment") {
        const m = readMoment(intent.time.at, ctx);
        if (m.bad) return badTime(m.bad);
        if (!m.moments.length) return info(`${intent.time.at} is past the end of this video (${fmt(ctx.total)}).`);
        if (m.moments.length > 1) {
          return ask(
            "Which time do you mean?",
            m.moments.map((x) => choice(x.how === "seconds" ? `${Number(x.sec.toFixed(2))} s` : fmt(x.sec), intent, { time: { kind: "moment", at: secText(x.sec) } }))
          );
        }
        at = m.moments[0].sec;
      }
      const n = zoomNear(zooms, at);
      const where = kind === "moment" ? fmt(at) : `the playhead (${fmt(at)})`;
      if (!n || (!n.exact && n.distance > NEAR)) {
        return info(
          kind === "selected" ? `No zoom is selected, and there's none at ${where}.` : `There's no zoom at ${where}.`,
          n ? [choice(`Remove the one at ${fmt(n.zoom.outStart)}`, intent, { zoomIds: [n.zoom.id] })] : []
        );
      }
      pick = [n.zoom];
    }
  }

  const reply =
    pick.length === 1
      ? `Removed the zoom at ${fmt(pick[0].outStart)}–${fmt(pick[0].outEnd)}${pick[0].label ? ` on “${pick[0].label}”` : ""}.`
      : pick.length === zooms.length
        ? `Removed all ${pick.length} zooms.`
        : `Removed ${pick.length} zooms: ${listTimes(pick)}.`;
  return { kind: "applied", reply, ops: { add: [], remove: pick.map((z) => z.id), trim: [] }, select: null, seek: null, choices: [] };
}

/* ── Blur ────────────────────────────────────────────────────────────────── */

/** Two blurs sharing this much of the smaller one are on the same thing (foundBlurs.js SAME_SHARE). */
const SAME_BLUR = 0.6;

/** How much of the smaller of two boxes they share. */
function shared(a, b) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return (ix * iy) / Math.max(1e-9, Math.min(a.w * a.h, b.w * b.h));
}

/**
 * Where a blur is at recording time t, or null when it is not showing there:
 * where its follow has it once applied, otherwise where it was placed, over its
 * span. `seenOnly` leaves out a follow's held stretches, where the tracker lost
 * sight of its text and is only keeping the blur where it last was: that
 * proves nothing about what is there (foundBlurs.js twinOf).
 */
function blurRectAt(b, t, follows, { seenOnly = false } = {}) {
  const f = followFor(follows, b);
  if (f) {
    if (seenOnly && heldAt(f, t)) return null;
    const p = followAt(f, t);
    return p.on ? { x: p.x, y: p.y, w: b.w * p.s, h: b.h * p.s } : null;
  }
  if (t < b.start - 0.05 || t > b.end + 0.05) return null;
  return { x: b.x, y: b.y, w: b.w, h: b.h };
}

const short = (v, n = 60) => {
  const s = str(v, 200);
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

/** “account email”, “API key” and “card number”; a name found twice says so. */
function names(list) {
  const counts = new Map();
  for (const n of list) counts.set(n, (counts.get(n) || 0) + 1);
  const shown = [...counts].map(([n, c]) => `“${n}”${c > 1 ? ` (${c})` : ""}`);
  if (shown.length < 2) return shown[0] || "";
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

/**
 * "Blur the API key": every place it is on the frame at that moment, each
 * made into the same blur a creator would draw there and applied the same
 * way (the editor follows it through the recording from this frame). The
 * only thing this replaces is drawing the box and putting it in the right
 * place; everything after that is the blur the product already has.
 */
async function addBlur(intent, ctx) {
  const { total, playhead } = ctx;
  const what = intent.lookFor || intent.named;
  if (!what) return info("Tell me what to hide, like “blur the email address” or “blur the API key at 0:12”.");
  if (!ctx.lookSecrets) {
    return info(`I can't look at this recording's video right now, so I can't find “${short(what)}”. Draw the blur in the Blur tab instead.`);
  }
  // No moment given, or "everywhere": the whole video. A secret is rarely on
  // one screen only, and "blur my email" means wherever it is.
  if (intent.everywhere || intent.time.kind === "none") return blurEverywhere(intent, ctx, what);

  // ── When: a moment it is on screen ────────────────────────────────────────
  // A blur is applied over the whole recording and shows wherever its text
  // is, so the time only says which frame to find it on.
  let at = playhead;
  let why = "playhead";
  const kind = intent.time.kind;
  if (kind === "moment") {
    const m = readMoment(intent.time.at, ctx);
    if (m.bad) return badTime(m.bad);
    if (!m.moments.length) return info(`${intent.time.at} is past the end of this video (${fmt(total)}).`);
    if (m.moments.length > 1) {
      return ask(
        "Which time do you mean?",
        m.moments.map((x) => choice(x.how === "seconds" ? `${Number(x.sec.toFixed(2))} s` : fmt(x.sec), intent, { time: { kind: "moment", at: secText(x.sec) } }))
      );
    }
    at = m.moments[0].sec;
    why = "moment";
  } else if (kind === "range") {
    const r = readRange(intent.time.start, intent.time.end, ctx);
    if (r.bad) return badTime(r.bad);
    if (!r.ranges.length) return info(outside(intent.time.start, intent.time.end, total));
    if (r.ranges.length > 1) {
      return ask(
        "Which time do you mean?",
        r.ranges.map((x) => choice(rangeLabel(x), intent, { time: { kind: "moment", at: secText(x.s), start: "", end: "" } }))
      );
    }
    at = r.ranges[0].s;
    why = "moment";
  }
  at = clamp(at, 0, Math.max(0, total - 0.05));
  const tSrc = round3(toSource(at, ctx.lay));

  // ── Where: every place it is on that frame ────────────────────────────────
  const seen = await ctx.lookSecrets(at, what);
  if (seen.error) return info(`I couldn't look at the video just now, so I can't find “${short(what)}”. Try again in a moment.`);
  if (!seen.matches.length) {
    // Not on this frame: find it wherever it is, rather than send the creator
    // looking for a moment it is on screen.
    const when = why === "playhead" ? `at the playhead (${fmt(at)})` : `at ${fmt(at)}`;
    return blurEverywhere({ ...intent, everywhere: true }, ctx, what, { note: `“${short(what)}” isn't on screen ${when}, so I looked through the whole video. ` });
  }
  const boxes = await ctx.refine(at, seen.matches, what);

  const style = intent.blurKind || "blur";
  const made = [];
  const already = [];
  seen.matches.forEach((m, i) => {
    const box = blurBox(boxes[i] || m.box);
    const label = m.label || short(what, 40);
    const twin =
      ctx.blurs.find((b) => {
        const r = blurRectAt(b, tSrc, ctx.follows, { seenOnly: true });
        return r && shared(r, box) >= SAME_BLUR;
      }) || made.find((b) => shared(b, box) >= SAME_BLUR);
    if (twin) {
      already.push(label);
      return;
    }
    made.push({
      id: newId("b"),
      // The applied form (StudioEditor appliedForm, vision.js joinRegions):
      // the whole recording, anchored on this frame, where it shows coming
      // from its follow.
      start: 0,
      end: round3(ctx.duration),
      ...box,
      at: tSrc,
      kind: style,
      strength: style === "box" ? 1 : 0.8,
      label: str(label, 80),
      auto: false,
    });
  });

  if (!made.length) {
    return info(`${names(already)} ${already.length === 1 ? "is" : "are"} already blurred at ${fmt(at)}.`);
  }

  const verb = style === "box" ? "Covered" : style === "pixelate" ? "Pixelated" : "Blurred";
  let reply =
    made.length === 1
      ? `${verb} ${names(made.map((b) => b.label))} at ${fmt(at)}.`
      : `${verb} ${made.length} things at ${fmt(at)}: ${names(made.map((b) => b.label))}.`;
  reply +=
    made.length === 1
      ? " It's being applied now, and it will follow the text wherever it moves on screen."
      : " They're being applied now, and each one follows its text wherever it moves on screen.";
  reply +=
    made.length === 1
      ? " Check the box on the preview; drag it if it doesn't cover everything."
      : " Check the boxes on the preview; drag any that don't cover everything.";
  if (already.length) reply += ` ${names(already)} ${already.length === 1 ? "was" : "were"} already blurred.`;

  return {
    kind: "applied",
    reply,
    ops: { add: [], remove: [], trim: [], addBlurs: made, removeBlurs: [] },
    select: made[0].id,
    selectKind: "blur",
    seek: round3(at),
    // The tracker follows these through the video, not other copies of them
    // elsewhere: the whole video can be looked through for those.
    choices: [choice("Find it everywhere in the video", intent, { everywhere: true, time: { kind: "none", at: "", start: "", end: "" } })],
  };
}

/**
 * "Blur X everywhere": every place X is seen across the video, each its own
 * blur (see scanFrames for why one blur cannot cover the others).
 */
async function blurEverywhere(intent, ctx, what, { note = "" } = {}) {
  if (!ctx.scan) return info(`${note}I can't look through this recording's video right now, so I can't find “${short(what)}”. Try again in a moment.`);
  const close = !!intent.close;
  const r = await ctx.scan(what, { close });
  if (r.error) return info(`${note}I couldn't look through the video just now, so I can't find “${short(what)}”. Try again in a moment.`);
  const step = scanStep(ctx.total, close);
  const every = step === 1 ? "second" : `${Number(step.toFixed(1))} s`;
  // Never "move the playhead to it": finding it is this feature's job.
  const closer = close ? [] : [choice("Look more closely", intent, { close: true, everywhere: true, time: { kind: "none", at: "", start: "", end: "" } })];
  if (!r.sightings.length) {
    return info(
      `${note}I looked through the whole video (${r.frames} frames, one every ${every}) and couldn't find “${short(what)}”. ` +
        (close ? "Try describing it another way, like the words written on it." : "I can look more closely, or you can describe it another way, like the words written on it."),
      closer
    );
  }

  const style = intent.blurKind || "blur";
  const found = instancesOf(r.sightings, step);
  const fresh = [];
  let already = 0;
  for (const inst of found) {
    const covered = ctx.blurs.some((b) => {
      const at = blurRectAt(b, inst.best.src, ctx.follows, { seenOnly: true });
      return at && shared(at, inst.best.box) >= SAME_BLUR;
    });
    if (covered) already += 1;
    else fresh.push(inst);
  }
  if (!fresh.length) {
    return info(`“${short(what)}” is already blurred everywhere I found it (${found.length} ${found.length === 1 ? "place" : "places"}).`);
  }

  // Earliest first; the follow route takes at most 24 at once per demo.
  const kept = fresh.slice(0, SCAN_BLURS);
  const boxes = await ctx.refineMany(kept.map((i) => ({ src: i.best.src, match: i.best })), what);
  const made = kept.map((inst, k) => ({
    id: newId("b"),
    start: 0,
    end: round3(ctx.duration),
    ...blurBox(boxes[k] || inst.best.box),
    at: inst.best.src,
    kind: style,
    strength: style === "box" ? 1 : 0.8,
    label: str(inst.best.label || short(what, 40), 80),
    auto: false,
  }));

  const verb = style === "box" ? "Covered" : style === "pixelate" ? "Pixelated" : "Blurred";
  const when = kept.map((i) => fmt(i.first.out));
  const whenText = when.length > 1 ? `${when.slice(0, -1).join(", ")} and ${when[when.length - 1]}` : when[0];
  let reply =
    made.length === 1
      ? `${verb} ${names(made.map((b) => b.label))}, the one place I found it in the video (first seen at ${whenText}).`
      : `${verb} ${names([...new Set(made.map((b) => b.label))])} wherever I found it in the video: ${made.length} blurs, first seen at ${whenText}.`;
  reply +=
    made.length === 1
      ? " It's being applied now, and it follows its text while it's on screen."
      : " They're being applied now, and each one follows its text while it's on screen.";
  // Seen at the same x, the same size, lower or higher: most likely one thing
  // scrolling, blurred once per place it was seen. Harmless, and said so.
  const scrolled = made.some((a, i) =>
    made.some((b, j) => j > i && Math.abs(a.x + a.w / 2 - (b.x + b.w / 2)) < 0.02 && Math.abs(a.w - b.w) < 0.02 && Math.abs(a.y - b.y) > a.h)
  );
  if (scrolled) reply += " Text that scrolls can get more than one blur; they overlap and look like one.";
  if (already) reply += ` ${already} more ${already === 1 ? "place was" : "places were"} already blurred.`;
  if (fresh.length > kept.length) reply += ` I found ${fresh.length - kept.length} more places; ask again once these finish applying and I'll blur those too.`;
  reply += ` I looked at one frame every ${every}, so something on screen for less than that could be missed.`;
  if (r.missed) reply += ` ${r.missed} of the frames couldn't be read.`;
  if (note) reply = note + reply;

  return {
    kind: "applied",
    reply,
    ops: { add: [], remove: [], trim: [], addBlurs: made, removeBlurs: [] },
    select: made[0].id,
    selectKind: "blur",
    seek: round3(kept[0].best.out),
    choices: closer,
  };
}

function removeBlur(intent, ctx) {
  const blurs = ctx.blurs;
  if (!blurs.length) return info("There are no blurs on the timeline to remove.");
  const kind = intent.time.kind;
  const name = intent.named || intent.lookFor;
  let pick = [];

  if (intent.blurIds.length) {
    pick = blurs.filter((b) => intent.blurIds.includes(b.id));
    if (!pick.length) return info("That blur isn't on the timeline any more.");
  } else if (kind === "all") {
    pick = blurs;
  } else if (kind === "none" && name) {
    const n = norm(name);
    pick = blurs.filter((b) => b.label && (norm(b.label).includes(n) || n.includes(norm(b.label))));
    if (!pick.length) {
      return ask(
        `I couldn't tell which blur is on “${short(name)}”. Which one?`,
        blurs.slice(0, 5).map((b) => choice(`The one on “${short(b.label || "unnamed", 30)}”`, intent, { blurIds: [b.id] }))
      );
    }
  } else if ((kind === "selected" || kind === "none") && ctx.selectedBlur) {
    pick = blurs.filter((b) => b.id === ctx.selectedBlur);
  } else {
    let at = ctx.playhead;
    if (kind === "moment") {
      const m = readMoment(intent.time.at, ctx);
      if (m.bad) return badTime(m.bad);
      if (!m.moments.length) return info(`${intent.time.at} is past the end of this video (${fmt(ctx.total)}).`);
      if (m.moments.length > 1) {
        return ask(
          "Which time do you mean?",
          m.moments.map((x) => choice(x.how === "seconds" ? `${Number(x.sec.toFixed(2))} s` : fmt(x.sec), intent, { time: { kind: "moment", at: secText(x.sec) } }))
        );
      }
      at = m.moments[0].sec;
    }
    const t = toSource(at, ctx.lay);
    const showing = blurs.filter((b) => blurRectAt(b, t, ctx.follows));
    if (!showing.length) {
      // None here: the blurs there are, as buttons, rather than an errand.
      return ask(
        kind === "selected" ? `No blur is selected, and none is showing at ${fmt(at)}. Which one?` : `No blur is showing at ${fmt(at)}. Which one?`,
        blurs.slice(0, 5).map((b) => choice(`The one on “${short(b.label || "unnamed", 30)}”`, intent, { blurIds: [b.id] }))
      );
    }
    if (showing.length > 1) {
      return ask(
        `${showing.length} blurs are showing at ${fmt(at)}. Which one?`,
        [
          ...showing.slice(0, 4).map((b) => choice(`The one on “${short(b.label || "unnamed", 30)}”`, intent, { blurIds: [b.id] })),
          choice("All of them", intent, { blurIds: showing.map((b) => b.id) }),
        ]
      );
    }
    pick = showing;
  }

  const on = (b) => (b.label ? ` on “${b.label}”` : "");
  const reply =
    pick.length === 1
      ? `Removed the blur${on(pick[0])}.`
      : pick.length === blurs.length
        ? `Removed all ${pick.length} blurs.`
        : `Removed ${pick.length} blurs: ${names(pick.map((b) => b.label || "unnamed"))}.`;
  return {
    kind: "applied",
    reply,
    ops: { add: [], remove: [], trim: [], addBlurs: [], removeBlurs: pick.map((b) => b.id) },
    select: null,
    seek: null,
    choices: [],
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   One command, start to finish
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * @param {object} o
 * @param {object} o.demo
 * @param {object} o.body   the request: { text | intent, playhead, selected, zooms, cuts, history }
 */
export async function runCommand({ demo, body, ask, look, lookSecrets, refine, scan, scanLook, refineMany, onStatus }) {
  const cid = newId("cmd");
  const ctx = commandContext(demo, body);
  const text = str(body?.text, MAX_TEXT);
  const status = (s) => {
    try {
      onStatus?.(s);
    } catch {
      /* a status line is never worth failing the command over */
    }
  };
  let intent;
  let usd = 0;
  let looked = "";

  /**
   * Looking at a frame: read it from the recording, ask where the described
   * thing is, and delete the frame. Output time in, matches out; an error is
   * an answer ({ error: true }) rather than a throw, so the reply can say the
   * look failed instead of that the thing is not there.
   */
  const recordingThere = !!(demo.recording?.mp4_key && !demo.purged);
  ctx.look = look || (recordingThere
    ? async (outT, description) => {
        status(`Looking at the frame at ${fmt(outT)}…`);
        let file = null;
        try {
          file = await frameAt(demo, toSource(outT, ctx.lay));
          const r = await findOnFrame(file, description, ask ? { ask } : {});
          usd += r.usd;
          looked = ` looked at ${fmt(outT)}: ${r.matches.length ? r.matches.map((m) => `"${m.label}" ${m.confidence.toFixed(2)}`).join(", ") : "nothing"};`;
          return r;
        } catch (err) {
          console.warn(`[studio] command ${cid} on ${demo._id}: looking at ${fmt(outT)} failed: ${String(err?.message).slice(0, 200)}`);
          looked = ` looking at ${fmt(outT)} failed;`;
          return { error: true, matches: [] };
        } finally {
          if (file) fsp.rm(file, { force: true }).catch(() => {});
        }
      }
    : null);

  // The same, for a blur: every place the thing is on the frame…
  ctx.lookSecrets = lookSecrets || (recordingThere
    ? async (outT, description) => {
        status(`Looking at the frame at ${fmt(outT)}…`);
        let file = null;
        try {
          file = await frameAt(demo, toSource(outT, ctx.lay));
          const r = await findSecrets(file, description, ask ? { ask } : {});
          usd += r.usd;
          looked = ` looked at ${fmt(outT)}: ${r.matches.length ? r.matches.map((m) => `"${m.label}" ${m.confidence.toFixed(2)}`).join(", ") : "nothing"};`;
          return r;
        } catch (err) {
          console.warn(`[studio] command ${cid} on ${demo._id}: looking at ${fmt(outT)} failed: ${String(err?.message).slice(0, 200)}`);
          looked = ` looking at ${fmt(outT)} failed;`;
          return { error: true, matches: [] };
        }
      }
    : null);
  // …and each one's edges from a close-up, all at once. A close-up that
  // cannot be read keeps the box the first look found (refineBox).
  ctx.refine = refine || (async (outT, matches, description) => {
    if (!matches.length) return [];
    status(matches.length === 1 ? "Finding its exact edges…" : `Finding the exact edges of all ${matches.length}…`);
    const t = toSource(outT, ctx.lay);
    return Promise.all(matches.map((m) => refineBox(demo, t, m, description, { ...(ask ? { ask } : {}), W: ctx.W, H: ctx.H })));
  });
  // "Everywhere": the whole video looked through, then each place's edges,
  // each on its own frame.
  const scanWith = (find, what) => async (description, { close = false } = {}) => {
    const r = await scanFrames(demo, ctx, (file) => find(file, description, ask ? { ask } : {}), { status, what: description, close });
    usd += r.usd;
    looked += ` scanned ${r.frames} frames${close ? " closely" : ""} for ${what} (${r.missed} missed, ${r.dropped} dropped): ${r.sightings.length} sightings;`;
    // Nothing anywhere: what the model actually said about one frame, so a
    // miss like "21 frames and no Open Editor" can be read, not guessed at.
    if (!r.sightings.length && r.sample) console.warn(`[studio] command ${cid} on ${demo._id}: scan found nothing; one answer ${r.sample}`);
    return r;
  };
  ctx.scan = scan || (recordingThere ? scanWith(findSecrets, "a blur") : null);
  // The same look through the video for a zoom, when what was described is
  // not at the playhead: it is found rather than the creator being sent to find it.
  ctx.scanLook = scanLook || (recordingThere ? scanWith(findOnFrame, "a zoom") : null);
  ctx.refineMany = refineMany || (async (items, description) => {
    if (!items.length) return [];
    status(items.length === 1 ? "Finding its exact edges…" : `Finding the exact edges of all ${items.length}…`);
    return mapLimit(items, 6, (it) => refineBox(demo, it.src, it.match, description, { ...(ask ? { ask } : {}), W: ctx.W, H: ctx.H }));
  });

  if (body?.intent && typeof body.intent === "object") {
    intent = cleanIntent(body.intent);
  } else {
    try {
      const r = await readCommand(text, ctx, body?.history, ask ? { ask } : {});
      intent = r.intent;
      usd = r.usd;
    } catch (err) {
      console.warn(`[studio] command ${cid} on ${demo._id}: reading failed: ${err?.message}`);
      return { cid, kind: "error", reply: "I couldn't work that out just now. Please try again in a moment." };
    }
  }

  const out = await resolve(intent, ctx);
  console.log(
    `[studio] command ${cid} on ${demo._id}: ${body?.intent ? "(button)" : JSON.stringify(text)} → ${intent.action}/${intent.time.kind}` +
      `${intent.thingKeys.length ? ` things=${intent.thingKeys.length}` : ""}${intent.clickTimes.length ? ` clicks=${intent.clickTimes.length}` : ""}` +
      `${intent.zoomIds.length ? ` zooms=${intent.zoomIds.length}` : ""}${intent.lookFor ? ` look_for=${JSON.stringify(intent.lookFor)}` : ""} →${looked} ${out.kind}` +
      `${out.ops ? ` +${out.ops.add.length} -${out.ops.remove.length} ~${out.ops.trim.length}` : ""}` +
      `${out.ops?.addBlurs?.length ? ` blurs+${out.ops.addBlurs.length} ${out.ops.addBlurs.map((b) => `[${b.x},${b.y},${b.w},${b.h}]@${b.at}`).join(" ")}` : ""}` +
      `${out.ops?.removeBlurs?.length ? ` blurs-${out.ops.removeBlurs.length}` : ""}` +
      `${usd ? ` $${usd.toFixed(5)}` : ""}: ${out.reply}`
  );
  return { cid, ...out };
}

export default {
  runCommand, resolve, readCommand, commandContext, cleanIntent, readTime, readRange, readMoment, readLength, fmt,
  frameAt, findOnFrame, fromBox2d, findSecrets, refineBox, closeUp, fromCloseUp, blurBox,
  scanFrames, scanTimes, scanStep, instancesOf,
};

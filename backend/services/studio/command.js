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
 */
import crypto from "crypto";
import { generateJson, TEXT_MODEL } from "../edit/gemini.js";
import { layout, toSource, toOutput, toOutputSnapped } from "./timeline.js";
import { containing, containingBox } from "./events.js";
import { cursorAt } from "../../../src/components/Studio/camera.mjs";

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
/** Below this a "zoom" does not look like one, and it is not made. */
const MIN_EFFECTIVE = 1.15;

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
    }))
    .filter((z) => z.id && z.end - z.start > 0.05)
    .sort((a, b) => a.start - b.start);
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
   Asking the model what the sentence means
   ──────────────────────────────────────────────────────────────────────────── */

export const COMMAND_READER = `You turn a creator's message into an edit on the timeline of their screen-recording demo. You do not make the edit. You say what they mean, using the ids in the lists you are given.

What can be done for now:
- "add_zoom": zoom the camera in. On something on screen, at a time, over a stretch of time, at the playhead, or when a click happens.
- "remove_zoom": take zooms off the timeline.
- "undo": they want the last change undone ("undo", "revert that", "go back", "wapas karo").
- "unsupported": anything else: blur, cuts, captions, voiceover, changing the strength, timing or framing of an existing zoom, speed, music. Put ONE short sentence in "answer" saying where to do it by hand, using only this list:
    zoom strength: the Zoom level slider in the Zoom tab
    a zoom's timing: drag its edges on the timeline
    where a zoom points: drag its rectangle on the preview
    blur: the Blur tab
    cuts: "Cut here" on the timeline, or the Video tab
    captions: the Captions tab
    voiceover: the Voice tab
- "unclear": you cannot tell what they want. Put one short question in "answer".

The creator may write in English, Hinglish or another language, casually, with typos. Understand it. Write "answer" in simple English.

TIME ("time.kind")
  "range"    a start and an end: "from 0:05 to 0:20", "between 10 and 15 seconds", "in the first 10 seconds", "after 1:00"
  "moment"   one time: "at 0:12", "at 45 seconds"
  "playhead" here, now, at this point, where I am
  "selected" this zoom, this one, the selected one
  "all"      every zoom: "remove all zooms"
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
"things": ids from THINGS ON SCREEN that the creator named, best match first, at most 5. Match by meaning as well as spelling: "the projects tab in the sidebar" is a nav_item "Projects" at the left. Empty when nothing in the list is what they named. Never invent an id.
"clicks": ids from CLICKS, only when they tie the zoom to a click: "when I click Projects", "on the Billing click". Otherwise empty.
"zooms": ids from ZOOMS ON THE TIMELINE that the creator pointed at by what the zoom is on or by its order: "the zoom on Pricing", "the second zoom", "the last one". When they point at a zoom by time instead, leave this empty and use "time".
"named": the words the creator used for a thing on screen, like "Projects button". "" when they did not name a thing ("zoom here", "zoom at 0:12", "remove this zoom").
"level": how strong, only when they said it: "2x" → 2, "zoom in a lot" → 2.4, "a little" → 1.4. Otherwise 0.

EXAMPLES
"zoom in on projects"                   → add_zoom, time none, things [the Projects item]
"add zoom from 0.5 to 1.25"             → add_zoom, range, start "0.5", end "1.25"
"zoom here for 4 sec"                   → add_zoom, playhead, length "4s"
"billing pe click ho tab zoom karo"     → add_zoom, time none, clicks [the click on Billing]
"zoom on the search bar at 0:20"        → add_zoom, moment, at "0:20", things [the search field]
"remove this zoom"                      → remove_zoom, selected
"delete zooms in the first 10 seconds"  → remove_zoom, range, start "0", end "10s"
"remove the zoom on pricing"            → remove_zoom, zooms [the zoom on Pricing]
"remove all zooms"                      → remove_zoom, all
"make this zoom stronger"               → unsupported, answer "Use the Zoom level slider in the Zoom tab."

Return ONLY valid JSON matching the schema.`;

const COMMAND_SCHEMA = {
  type: "OBJECT",
  properties: {
    action: { type: "STRING", enum: ["add_zoom", "remove_zoom", "undo", "unsupported", "unclear"] },
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
    named: { type: "STRING" },
    level: { type: "NUMBER" },
    answer: { type: "STRING" },
  },
  required: ["action", "time", "length", "things", "clicks", "zooms", "named", "level", "answer"],
  propertyOrdering: ["action", "time", "length", "things", "clicks", "zooms", "named", "level", "answer"],
};

/** The lists, as the model reads them, with the short ids it answers in. */
export function describe(ctx, history = []) {
  const zoomIds = new Map();
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

  return { text: lines.join("\n"), zoomIds, clickIds, thingIds };
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
  let res;
  try {
    res = await ask({ model: TEXT_MODEL, parts, maxOutputTokens: 1024, schema: COMMAND_SCHEMA, label: "command" });
  } catch (err) {
    // The service's schema limits are unwritten (see vision.js ask). A refused
    // schema is asked once more without it: the prompt still says the shape.
    if (!/\b400\b|INVALID_ARGUMENT/.test(String(err?.message || ""))) throw err;
    console.warn(`[studio] command: the response schema was refused (${String(err.message).slice(0, 80)}); asking without it`);
    res = await ask({ model: TEXT_MODEL, parts, maxOutputTokens: 1024, label: "command" });
  }
  const j = res.json || {};
  const pick = (ids, map) => [...new Set((Array.isArray(ids) ? ids : []).map((id) => map.get(String(id).trim())).filter((v) => v != null))];
  const intent = cleanIntent({
    action: j.action,
    time: j.time,
    length: j.length,
    thingKeys: pick(j.things, d.thingIds),
    clickTimes: pick(j.clicks, d.clickIds),
    zoomIds: pick(j.zooms, d.zoomIds),
    named: j.named,
    level: j.level,
    answer: j.answer,
  });
  return { intent, usd: num(res.usd) };
}

const ACTIONS = ["add_zoom", "remove_zoom", "undo", "unsupported", "unclear"];
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
    named: str(i?.named, 80),
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
export function resolve(intent, ctx) {
  if (intent.action === "undo") return { kind: "undo", reply: "" };
  if (intent.action === "unsupported") {
    return info(`For now I can add and remove zooms.${intent.answer ? ` ${intent.answer}` : ""}`);
  }
  if (intent.action === "unclear") {
    return info(intent.answer || "I didn't follow that. Try “zoom in on Projects” or “remove the zoom at 0:12”.");
  }
  if (intent.action === "remove_zoom") return removeZoom(intent, ctx);
  return addZoom(intent, ctx);
}

/** A button that asks for the same thing with one part made definite. */
const choice = (label, intent, change) => ({ label, intent: { ...intent, ...change, time: { ...intent.time, ...(change.time || {}) } } });

function badTime(what) {
  return info(`I couldn't read the time “${what}”. Try it like 0:12, 12s or 1 min 5 s.`);
}

/* ── Add ─────────────────────────────────────────────────────────────────── */

function addZoom(intent, ctx) {
  const { total, playhead } = ctx;
  const level = intent.level ? clamp(intent.level, LEVEL_MIN, LEVEL_MAX) : DEFAULT_LEVEL;
  const things = intent.thingKeys.map((k) => ctx.thingByKey.get(k)).filter(Boolean);
  const named = intent.named || things[0]?.label || "";
  let length = null;
  if (intent.length) {
    length = readLength(intent.length);
    if (length == null) return badTime(intent.length);
  }
  const span = length ?? DEFAULT_LENGTH;

  // A thing was named and none of the list matched: say so rather than guess.
  if (!things.length && !intent.clickTimes.length && intent.named) {
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
    } else if (things.length) {
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
  if (win.e - win.s < MIN_LENGTH) {
    if (win.s >= total - MIN_LENGTH) return info(`That's the very end of the video (${fmt(total)}), so there's no room for a zoom there.`);
    return info("That's too short for a zoom. Give it at least half a second.");
  }

  // ── Where ─────────────────────────────────────────────────────────────────
  let box = null;
  let point = null;
  let label = "";
  let where = "";
  const clickThing = win.click?.thing;
  const thing = clickThing || things[0] || null;

  if (thing) {
    const at = win.click ? win.click.out : win.anchor + SETTLE;
    const r = nearest(thing, at, ctx.tol) || (win.why === "range" ? firstIn(thing, win.s, win.e) : null);
    if (r) {
      box = r.box;
      label = thing.label || thing.type.replace(/_/g, " ");
      where = "thing";
    } else if (!win.click) {
      // Named, found, and not on screen at the time asked for.
      return info(
        `“${thing.label || named}” isn't on screen at ${fmt(win.anchor)}. It is on screen ${spansText(thing)}.`,
        momentChoices(thing, intent, ctx)
      );
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

  const rect = box ? containingBox([box], level) : containing([point], level);
  const effective = 1 / Math.max(0.01, rect.w);
  // Only a thing can be too big to zoom on; a point is framed at the level asked.
  if (box && effective < MIN_EFFECTIVE) {
    return info(
      `“${label || named}” takes up most of the screen, so zooming in would crop it. Try naming something inside it.`
    );
  }

  // ── Room: nothing else may cover the same moment ──────────────────────────
  const sStart = round3(toSource(win.s, ctx.lay));
  const sEnd = round3(toSource(win.e, ctx.lay));
  const replace = new Set(intent.replace);
  const remove = [...replace].filter((id) => ctx.zooms.some((z) => z.id === id));
  const trim = [];
  const replaced = [];
  let shortened = null;
  for (const z of ctx.zooms) {
    if (replace.has(z.id)) continue;
    if (!(z.start < sEnd && z.end > sStart)) continue;
    if (z.start < sStart && sStart - z.start >= MIN_KEEP) {
      trim.push({ id: z.id, end: sStart });
      shortened = z;
    } else {
      remove.push(z.id);
      replaced.push(z);
    }
  }

  const zoom = {
    id: newId("z"),
    start: sStart,
    end: sEnd,
    x: rect.x, y: rect.y, w: rect.w, h: rect.h,
    level: round3(level),
    easing: "smooth",
    camera: where === "thing" || where === "click" ? "element" : "region",
    follow: false,
    follow_strength: 0.7,
    label: str(label, 80),
    intent: where === "click" || win.click ? "click" : "other",
    auto: false,
  };

  // ── What to say ───────────────────────────────────────────────────────────
  const shown = Math.min(level, effective);
  let reply = `Added a ${fmtLevel(shown)} zoom`;
  if (where === "thing" || where === "click") reply += ` on “${zoom.label || named || "what you clicked"}”`;
  reply += ` from ${fmt(win.s)} to ${fmt(win.e)}`;
  if (win.click) reply += ", when you clicked it";
  else if (win.why === "playhead") reply += ", at the playhead";
  else if (win.why === "seen") reply += ", when it first appears";
  reply += ".";
  if (where === "pointer") reply += ` It's centred on where the pointer was at ${fmt(win.anchor)}. Drag the rectangle on the preview to move it.`;
  if (where === "centre") reply += " It's centred on the middle of the screen, because I couldn't see the pointer then. Drag the rectangle on the preview to move it.";
  if (effective < level - 0.05) reply += ` That's as close as it can get while keeping all of “${zoom.label}” in view.`;
  if (replaced.length === 1) reply += ` It replaces the zoom that was at ${fmt(replaced[0].outStart)}.`;
  if (replaced.length > 1) reply += ` It replaces ${replaced.length} zooms that were inside that time.`;
  if (shortened) reply += ` The zoom before it now ends at ${fmt(win.s)}.`;

  const choices = alts.slice(0, 3).map((a) => choice(a.label, intent, { ...a.change, replace: [zoom.id] }));

  return {
    kind: "applied",
    reply,
    ops: { add: [zoom], remove, trim },
    select: zoom.id,
    seek: round3(Math.min(win.s + 0.6, win.e)),
    choices,
  };
}

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

function notFound(named, ctx) {
  if (!ctx.read) {
    return `This recording's screens haven't been read, so I can't find “${named}” by name. Give me a time instead, like “zoom at 0:12”, or move the playhead there and say “zoom here”.`;
  }
  return `I couldn't find “${named}” in this recording. I read one frame every ${Number(ctx.every.toFixed(1))} seconds, so something small or brief can be missed. Move the playhead to where it is and say “zoom here”, or give me a time.`;
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
    if (!pick.length) return info(`I couldn't find a zoom on “${name}”.`);
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

/* ────────────────────────────────────────────────────────────────────────────
   One command, start to finish
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * @param {object} o
 * @param {object} o.demo
 * @param {object} o.body   the request: { text | intent, playhead, selected, zooms, cuts, history }
 */
export async function runCommand({ demo, body, ask }) {
  const cid = newId("cmd");
  const ctx = commandContext(demo, body);
  const text = str(body?.text, MAX_TEXT);
  let intent;
  let usd = 0;
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

  const out = resolve(intent, ctx);
  console.log(
    `[studio] command ${cid} on ${demo._id}: ${body?.intent ? "(button)" : JSON.stringify(text)} → ${intent.action}/${intent.time.kind}` +
      `${intent.thingKeys.length ? ` things=${intent.thingKeys.length}` : ""}${intent.clickTimes.length ? ` clicks=${intent.clickTimes.length}` : ""}` +
      `${intent.zoomIds.length ? ` zooms=${intent.zoomIds.length}` : ""} → ${out.kind}` +
      `${out.ops ? ` +${out.ops.add.length} -${out.ops.remove.length} ~${out.ops.trim.length}` : ""}` +
      `${usd ? ` $${usd.toFixed(5)}` : ""}: ${out.reply}`
  );
  return { cid, ...out };
}

export default { runCommand, resolve, readCommand, commandContext, cleanIntent, readTime, readRange, readMoment, readLength, fmt };

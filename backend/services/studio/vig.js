/**
 * vig.js: the Visual Interaction Graph — a recording as screens, the things on
 * them, the pointer, and what the pointer did to what.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────
 * Everything upstream of this reads a recording as moments: the pointer was
 * here, the screen changed there, the model saw these boxes in that frame. Each
 * decision is then made at one moment with what is visible from it, and the
 * hardest ones cannot be made that way. On claude.ai the creator pressed a chat
 * in the sidebar, moved into the empty middle of the page and waited; the chat
 * arrived a second later, and "a page changed under a resting pointer" credited
 * it to the empty spot. Nothing at that moment says otherwise. What says
 * otherwise is a relationship across time: the thing the pointer rested on
 * BEFORE was called "X algorithm changes and founder…", and the screen that
 * arrived is titled "X algorithm changes and founder pain points".
 *
 * That relationship is what this builds. It is the structure the GUI research
 * converged on — screen parsing into element graphs (Wu et al., UIST 2021),
 * the same element recognised across screens (Screen Correspondence, 2023),
 * the element that was tapped to get from one screen to the next (ActionBert),
 * a screen's state tracked over time (ScreenLLM, 2025) — built from what this
 * pipeline already measures: the model's reading of frames (vision.js
 * readFrames), the located pointer, the rests, the navigations, the scroll.
 *
 *   screens      the recording cut at every navigation, each with what it was
 *                called: the model's name for it, its headings, its dialogs,
 *                and whatever it showed as selected
 *   objects      one per real thing on screen, persisted across readings — the
 *                same "Billing" item in five frames is one object, with a state
 *                history (normal, hovered, pressed, focused, selected, disabled)
 *   rests        where the pointer stopped, and which object it was over
 *   edges        hover (pointer over object), press (a press on an object),
 *                opens (pressing this object brought up that screen)
 *
 * ── WHAT IT DECIDES ─────────────────────────────────────────────────────────
 * Two things, both evidence the moment-by-moment rules could not see:
 *
 *   OPENS    A page change is credited to the rest on the thing it is named
 *            after, when there is one — over "the most recent rest", which is
 *            where the hand happened to be waiting.
 *   CHANGED  A press on an object that went from not selected to selected (or
 *            pressed, or focused) and stayed that way is corroborated, unless
 *            the object changes by itself (auto-rotating tabs, carousels).
 *
 * Neither invents a press: OPENS moves or confirms the press a navigation
 * already produced, and CHANGED corroborates one that exists. The gate
 * (events.js confirmClicks) still decides; these are signals it weighs.
 *
 * Without the model's reading of frames (STUDIO_VISION_ON_ANALYSE off) there
 * are no objects, and this changes nothing.
 */
import { scrollAt, isSticky } from "./sync.js";
import { dwells } from "./events.js";
import { newId } from "./timeline.js";

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const round3 = (v) => Math.round(v * 1000) / 1000;
const round4 = (v) => Math.round(v * 10000) / 10000;

/** STUDIO_VIG=off builds nothing and changes nothing. */
export const VIG_MODE = String(process.env.STUDIO_VIG || "on").trim().toLowerCase() === "off" ? "off" : "on";

/** Things a person presses — the same list the gate uses (events.js PRESSABLE). */
const PRESSABLE = new Set([
  "button", "icon_button", "link", "nav_item", "tab", "list_item",
  "text_field", "dropdown", "checkbox", "toggle", "menu", "card",
  "browser_tab", "browser_url",
]);
/** What a screen is called, besides the model's own name for it. */
const TITLES = new Set(["heading", "dialog", "modal"]);
/** States that say "this was just pressed", as opposed to hovered or resting. */
const ACTIVE = new Set(["selected", "pressed", "focused"]);

/** Two readings of one object: this close in page coordinates (a fraction of the frame). */
const LINK_NEAR = 0.04;
/** And this alike in what they are called. */
const LINK_ALIKE = 0.75;
/** A reading describes the screen this long either side of its frame. */
const SEEN_WITHIN = 1.4;
/** How far outside an object's box the pointer may be and still be on it. */
const ON_SLOP = 0.012;
/** An object bigger than this is a panel, not a control. */
const CONTROL_MAX_AREA = 0.2;
/** How long before a page change the press that caused it can have been. */
const OPEN_BEFORE = 3.0;
/** How much of an object's name must appear in the new screen's names. */
const OPEN_MATCH = 0.6;
/** How sure the crop question must be before its answer names a rest. */
const NAMED_SURE = 0.5;
/** Where the readings before and after a press are looked for. */
const STATE_BEFORE = 2.5;
const STATE_AFTER = 3.0;

/* ── Names ───────────────────────────────────────────────────────────────── */

const STOP = new Set([
  "the", "and", "for", "you", "your", "with", "from", "this", "that", "page", "screen", "view",
  "button", "link", "tab", "menu", "item", "icon", "open", "new", "home", "main", "of", "to", "a", "an", "in", "on",
]);

/** The words of a label that say what it is: lower case, three letters or more, not filler. */
function words(label) {
  return String(label || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

/** Whether two labels name the same thing: equal, or most of their words shared. */
function alike(a, b) {
  const x = String(a || "").trim().toLowerCase();
  const y = String(b || "").trim().toLowerCase();
  if (x && x === y) return 1;
  const wa = new Set(words(a));
  const wb = new Set(words(b));
  if (!wa.size || !wb.size) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.max(wa.size, wb.size);
}

/**
 * How much of an object's name appears among a screen's names. Measured over
 * the OBJECT's words — "Billing" is fully inside "Settings — Billing" — and a
 * truncated label ("X algorithm changes and foun…") still counts the words it
 * has. A prefix counts for a truncated last word.
 */
function nameShare(objectLabel, titles) {
  const ow = words(String(objectLabel || "").replace(/[….]+$/, ""));
  if (!ow.length) return 0;
  const tw = titles.flatMap((t) => words(t));
  if (!tw.length) return 0;
  let hit = 0;
  ow.forEach((w, i) => {
    const last = i === ow.length - 1;
    if (tw.includes(w) || (last && w.length >= 3 && tw.some((t) => t.startsWith(w)))) hit++;
  });
  return hit / ow.length;
}

/** The best match of a name against any one of a screen's names, or all of them. */
function relativeNamed(label, titles) {
  let best = nameShare(label, titles);
  for (const t of titles) best = Math.max(best, nameShare(label, [t]));
  return best;
}

/* ── Where things are ────────────────────────────────────────────────────── */

/** A box as the model read it at `shotT`, where it would be at `t` after the page scrolled. */
function boxAt(el, shotT, t, screen, sticky) {
  const [x, y, w, h] = (el.bbox || []).map((v) => num(v));
  if (sticky || !screen) return [x, y, w, h];
  return [x, y - (scrollAt(screen, t) - scrollAt(screen, shotT)), w, h];
}

function inside(box, x, y, slop = ON_SLOP) {
  const [bx, by, bw, bh] = box;
  return x >= bx - slop && x <= bx + bw + slop && y >= by - slop && y <= by + bh + slop;
}

/* ── The graph ───────────────────────────────────────────────────────────── */

/**
 * @param {object} o
 * @param {Array}  o.shots    vision.js readFrames: [{ t, screen, elements: [{type,label,bbox,state,sticky,importance}] }]
 * @param {Array}  o.events   inferEvents' events (navigations and presses)
 * @param {Array}  o.pointer  the merged pointer path, fractions of the frame
 * @param {object} o.screen   sync.js readScreen
 * @returns {object} the graph (see the header)
 */
export function buildVig({ shots = [], events = [], pointer = [], screen = null, duration = 0, named = [] } = {}) {
  const readings = (shots || []).filter((s) => Array.isArray(s?.elements)).sort((a, b) => num(a.t) - num(b.t));

  /* Screens: the recording cut at every navigation. */
  const cuts = (events || []).filter((e) => e.type === "nav").map((e) => num(e.t)).sort((a, b) => a - b);
  const bounds = [0, ...cuts, Math.max(num(duration), ...readings.map((s) => num(s.t)), ...cuts) + 0.001];
  const screens = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const from = bounds[i];
    const to = bounds[i + 1];
    // Readings from just after the cut on: the first frame of a new page is
    // often still the old one.
    const mine = readings.filter((s) => num(s.t) >= from + 0.2 && num(s.t) < to);
    const names = new Map();
    for (const s of mine) if (s.screen) names.set(s.screen, (names.get(s.screen) || 0) + 1);
    const title = [...names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
    const titles = new Set(title ? [title] : []);
    // When each name was first shown, so "was this screen already called that
    // before the press" can be asked of the moment before the press.
    const shownAt = {};
    for (const s of mine) {
      if (s.screen && shownAt[s.screen] == null) shownAt[s.screen] = num(s.t);
      for (const el of s.elements) {
        if (!(TITLES.has(String(el.type)) || el.state === "selected") || !el.label) continue;
        titles.add(String(el.label));
        if (shownAt[el.label] == null) shownAt[el.label] = num(s.t);
      }
    }
    screens.push({ id: "S" + (i + 1), from: round3(from), to: round3(to), title, titles: [...titles].slice(0, 24), shownAt });
  }
  const screenAt = (t) => screens.find((s) => t >= s.from && t < s.to) || screens[screens.length - 1];

  /* Objects: every reading of every element, linked to the object it is. */
  const objects = [];
  const count = {};
  for (const s of readings) {
    const st = num(s.t);
    const sc = screenAt(st);
    for (const el of s.elements) {
      const type = String(el.type || "");
      const [x, y, w, h] = (el.bbox || []).map((v) => num(v));
      if (!(w > 0) || !(h > 0)) continue;
      const sticky = el.sticky === true || (screen ? isSticky(screen, x + w / 2, y + h / 2) : false);
      // Page coordinates: where it sits on the page, whatever the page's scroll.
      const py = sticky ? y : y + (screen ? scrollAt(screen, st) : 0);
      const cx = x + w / 2;
      const cy = py + h / 2;
      let best = null;
      let bestD = Infinity;
      for (const o of objects) {
        if (o.type !== type) continue;
        if (!o.sticky && o.screen !== sc?.id) continue;
        if (alike(o.label, el.label) < LINK_ALIKE) continue;
        const d = Math.hypot(o.cx - cx, o.cy - cy);
        if (d <= LINK_NEAR && d < bestD) { best = o; bestD = d; }
      }
      const reading = { t: round3(st), bbox: [round4(x), round4(y), round4(w), round4(h)], state: String(el.state || "normal") };
      if (best) {
        best.readings.push(reading);
        best.cx = cx; best.cy = cy;
        continue;
      }
      count[type] = (count[type] || 0) + 1;
      objects.push({
        id: (type || "el").toUpperCase() + "_" + count[type],
        type,
        label: String(el.label || ""),
        screen: sc?.id || null,
        sticky,
        importance: el.importance || "medium",
        pressable: PRESSABLE.has(type),
        readings: [reading],
        cx, cy,
      });
    }
  }

  /* Rests, and what each was over. */
  const partial = { objects, screens };
  const rests = dwells(pointer || []).map((r) => {
    const at = Math.min(num(r.end), num(r.start) + 0.6);
    const over = objectAt(partial, at, num(r.x), num(r.y), screen);
    const rest = { from: round3(num(r.start)), to: round3(num(r.end)), x: round4(num(r.x)), y: round4(num(r.y)), shape: r.shape || "", over: over?.id || null };
    // The crop question's answer, where one was asked (vision.js pointerTargets):
    // the element's own text, read at the tip, which the frame-wide boxes get a
    // row wrong often enough to matter.
    const n = (named || []).find((q) => Math.abs(num(q.from) - rest.from) < 0.02 && Math.abs(num(q.x) - rest.x) < 0.005);
    if (n && n.label && n.type !== "none" && num(n.confidence) >= NAMED_SURE) {
      rest.label = n.label;
      rest.label_type = n.type;
      // And the object that IS that, if the readings have it near here.
      const same = objects.find((o) => alike(o.label, n.label) >= LINK_ALIKE && o.readings.some((q) => Math.abs(q.t - at) <= SEEN_WITHIN * 1.5));
      rest.over = same ? same.id : null;
    } else if (n && n.type === "none" && num(n.confidence) >= NAMED_SURE) {
      rest.over = null;
      rest.label_type = "none";
    }
    return rest;
  });

  /* State changes, and whether anybody was there when they happened. */
  const changes = [];
  for (const o of objects) {
    o.readings.sort((a, b) => a.t - b.t);
    for (let i = 1; i < o.readings.length; i++) {
      const a = o.readings[i - 1];
      const b = o.readings[i];
      if (a.state === b.state) continue;
      const attended = rests.some((r) => r.over === o.id && r.to >= a.t - 0.5 && r.from <= b.t + 0.5);
      changes.push({ object: o.id, from: a.state, to: b.state, t0: a.t, t1: b.t, attended });
    }
    // An object that changes state with nobody's pointer on it changes by itself.
    o.autonomous = changes.some((c) => c.object === o.id && !c.attended && (ACTIVE.has(c.to) || ACTIVE.has(c.from)));
  }

  /* Edges. */
  const edges = [];
  for (const r of rests) {
    if (r.over) edges.push({ rel: "hover", from: "pointer", to: r.over, t0: r.from, t1: r.to });
  }
  for (const e of events || []) {
    if (e.type !== "click" && e.type !== "dblclick") continue;
    const o = objectAt({ objects }, num(e.t), num(e.x, 0.5), num(e.y, 0.5), screen);
    if (o) edges.push({ rel: "press", from: "pointer", to: o.id, t: round3(num(e.t)) });
  }
  const opens = [];
  for (let i = 1; i < screens.length; i++) {
    const dest = screens[i];
    const T = dest.from;
    if (!dest.titles.length) continue;
    let best = null;
    const prev = screens[i - 1];
    for (const r of rests) {
      if (r.from >= T || r.to < T - OPEN_BEFORE) continue;
      const o = r.over ? objects.find((q) => q.id === r.over) : null;
      const label = r.label || (o && o.pressable ? o.label : "");
      if (!label || r.label_type === "none") continue;
      /**
       * Pressing the thing that names the screen you are already on opens
       * nothing — asked of what that screen showed BEFORE this rest. Asked of
       * all of it, the chat row the creator pressed was "already" the old
       * screen's selected item: it turned selected the moment it was pressed,
       * while the old screen was still showing and the chat was loading.
       */
      const before = Object.entries(prev.shownAt || {}).filter(([, at]) => at < r.from).map(([k]) => k).filter((k) => k !== dest.title);
      if (nameShare(label, before) >= OPEN_MATCH && nameShare(label, [dest.title]) < OPEN_MATCH) continue;
      const score = relativeNamed(label, dest.titles);
      if (score < OPEN_MATCH) continue;
      if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) < 1e-9 && r.to > best.rest.to)) best = { score, rest: r, object: o, label };
    }
    if (!best) continue;
    const edge = { rel: "opens", from: best.object ? best.object.id : "rest@" + best.rest.from, to: dest.id, t: round3(T), score: round3(best.score), label: best.label, title: dest.title, rest: best.rest };
    edges.push(edge);
    opens.push(edge);
  }

  return {
    version: 1,
    screens,
    objects: objects.map(({ cx, cy, ...o }) => o),
    rests,
    changes,
    edges,
    opens,
  };
}

/** The pressable object under a point at a moment, from the nearest reading of it. */
export function objectAt(vig, t, x, y, screen) {
  let best = null;
  let bestArea = Infinity;
  /**
   * ── FROM THE SCREEN AS IT WAS, NOT THE ONE THE PRESS OPENED ──────────────
   * A reading a second AFTER a press is often of the next screen: the account
   * button was read as "Log out", because the menu it opened was up by then.
   * Readings from the same screen only, and the last one at or before the
   * moment ahead of any after it.
   */
  const sc = (vig.screens || []).find((q) => t >= q.from && t < q.to);
  const within = (r) => !sc || (r.t >= sc.from - 0.05 && r.t < sc.to);
  const rank = (q) => (q.t <= t + 0.05 ? t - q.t : 10 + q.t - t);
  for (const o of vig.objects || []) {
    if (!o.pressable) continue;
    let near = null;
    for (const r of o.readings) {
      if (Math.abs(r.t - t) > SEEN_WITHIN || !within(r)) continue;
      if (!near || rank(r) < rank(near)) near = r;
    }
    if (!near) continue;
    const box = boxAt(near, near.t, t, screen, o.sticky);
    const area = box[2] * box[3];
    if (area > CONTROL_MAX_AREA || !inside(box, x, y)) continue;
    if (area < bestArea) { best = o; bestArea = area; }
  }
  return best;
}

/* ── What it decides ─────────────────────────────────────────────────────── */

/**
 * The two decisions (see the header), applied to inferEvents' events before the
 * gate weighs them. Returns new event objects; the input is not changed.
 */
export function applyVig(events, vig, { screen = null, onNote = () => {} } = {}) {
  if (!vig || !Array.isArray(events)) return events;
  const out = events.map((e) => ({ ...e }));
  const presses = () => out.filter((e) => e.type === "click" || e.type === "dblclick");

  /* OPENS: a page change belongs to the press on the thing it is named after. */
  for (const op of vig.opens || []) {
    const T = op.t;
    const r = op.rest;
    const near = presses().filter((e) => num(e.t) >= T - OPEN_BEFORE - 0.3 && num(e.t) <= T + 0.15);
    const onRest = near.find((e) => Math.hypot(num(e.x) - r.x, num(e.y) - r.y) <= 0.03 && num(e.t) >= r.from - 0.25 && num(e.t) <= r.to + 0.35);
    const fromNav = near.filter((e) => e.source === "nav").sort((a, b) => Math.abs(num(a.t) - (T - 0.12)) - Math.abs(num(b.t) - (T - 0.12)))[0];
    const opened = { label: op.label, title: op.title, score: op.score };
    if (onRest) {
      onRest.opened = opened;
      onRest.corroborated = true;
      if (fromNav && fromNav !== onRest && Math.hypot(num(fromNav.x) - r.x, num(fromNav.y) - r.y) > 0.03) {
        fromNav.opened_elsewhere = { t: round3(num(onRest.t)), label: op.label };
        onNote("the page change at " + T.toFixed(2) + "s was the press on \"" + op.label + "\" at " + num(onRest.t).toFixed(2) + "s, not the rest at " + num(fromNav.t).toFixed(2) + "s");
      } else {
        onNote("the press at " + num(onRest.t).toFixed(2) + "s on \"" + op.label + "\" opened \"" + op.title + "\"");
      }
    } else if (fromNav) {
      if (Math.hypot(num(fromNav.x) - r.x, num(fromNav.y) - r.y) <= 0.03) {
        fromNav.opened = opened;
      } else {
        const at = round3(Math.max(r.from, Math.min(r.to, T - 0.12)));
        onNote("the page change at " + T.toFixed(2) + "s moved from the rest at " + num(fromNav.t).toFixed(2) + "s to the press on \"" + op.label + "\" at " + at.toFixed(2) + "s");
        fromNav.moved_from = { t: num(fromNav.t), x: num(fromNav.x), y: num(fromNav.y) };
        fromNav.t = at;
        fromNav.x = r.x;
        fromNav.y = r.y;
        fromNav.opened = opened;
        fromNav.position_age = 0;
      }
    } else if (!near.some((e) => Math.abs(num(e.t) - T) <= 0.6)) {
      /**
       * ── NOBODY PROPOSED IT, AND THE SCREEN SAYS IT HAPPENED ────────────────
       * The forward rules found no press for this page change at all, and
       * the rest before it was on the thing the new screen is named after.
       * That is a press read backwards from its consequence; the gate still
       * weighs it like any other.
       */
      const at = round3(Math.max(r.from, Math.min(r.to, T - 0.12)));
      out.push(backPress(at, r, { opened }));
      onNote("the page change at " + T.toFixed(2) + "s was a press on \"" + op.label + "\" at " + at.toFixed(2) + "s that nothing else had found");
    }
  }

  /**
   * ── AND BACK FROM EVERY THING THAT TURNED SELECTED ─────────────────────────
   * The same idea for the readings: an object the pointer rested on went from
   * not selected to selected (or pressed, or focused) between two readings.
   * Walking back from the reading that showed it, the rest on it inside that
   * window is where it was pressed. If no press was proposed there — a toggle
   * whose only answer was itself, a tab that changed nothing else — one is,
   * now, with the change as its evidence. Objects that change state with
   * nobody on them (auto-rotating tabs) are not believed.
   */
  for (const c of vig.changes || []) {
    if (!c.attended || !ACTIVE.has(c.to) || ACTIVE.has(c.from)) continue;
    const o = (vig.objects || []).find((q) => q.id === c.object);
    if (!o || !o.pressable || o.autonomous) continue;
    // Still that way at the next reading, if there is one: a blink is not a state.
    const later = o.readings.find((q) => q.t > c.t1 + 0.05);
    if (later && !ACTIVE.has(later.state)) continue;
    const on = (vig.rests || []).filter((r) => r.over === o.id && r.to >= c.t0 - 0.5 && r.from <= c.t1);
    if (!on.length) continue;
    /**
     * ── ANY PRESS ON IT IN THE WINDOW ALREADY EXPLAINS IT ──────────────────
     * The change happened somewhere between two readings, seconds apart, and
     * the pointer can rest on the object more than once in that time — on
     * cap.so the hand rested on "Lifetime", went undrawn while idle, and was
     * found again in the same place: two rests. The press found in the first
     * explains the change; checking only the last rest made a second one.
     */
    const explained = presses().some((e) => {
      const et = num(e.t);
      // A press shortly after the reading that showed the change is the same
      // interaction: the readings are two seconds apart and the model can call
      // a hover "selected" a moment before the press lands.
      if (et < c.t0 - 0.3 || et > c.t1 + 1.0) return false;
      if (e.named?.label && alike(e.named.label, o.label) >= LINK_ALIKE) return true;
      return on.some((r) => Math.hypot(num(e.x) - r.x, num(e.y) - r.y) <= 0.05);
    });
    if (explained) continue;
    // Where the hand arrived on it: a press comes when the pointer gets there,
    // not while it waits afterwards.
    const rest = [...on].sort((a, b) => a.from - b.from)[0];
    const t = round3(Math.max(rest.from, c.t0, Math.min(rest.to, rest.from + 0.5, c.t1 - 0.1)));
    if (presses().some((e) => Math.abs(num(e.t) - t) <= 0.6)) continue;
    out.push(backPress(t, rest, { state_changed: { label: o.label, from: c.from, to: c.to } }));
    onNote("\"" + o.label + "\" went from " + c.from + " to " + c.to + " between " + c.t0.toFixed(1) + "s and " + c.t1.toFixed(1) + "s under the pointer: a press at " + t.toFixed(2) + "s that nothing else had found");
  }

  /* NAMED: a press inside a rest the crop question named carries the name (see events.js confirmClicks). */
  for (const e of presses()) {
    const t = num(e.t);
    const rest = (vig.rests || []).find((r) => t >= r.from - 0.1 && t <= r.to + 0.3 && Math.hypot(r.x - num(e.x), r.y - num(e.y)) <= 0.03);
    if (rest?.label) e.named = { label: rest.label, type: rest.label_type || "button" };
    else if (rest?.label_type === "none") e.named = { label: "", type: "none" };
  }

  /* CHANGED: the object under a press went to selected/pressed/focused and stayed. */
  for (const e of presses()) {
    if (e.state_changed) continue;
    const t = num(e.t);
    const rest = (vig.rests || []).find((r) => t >= r.from - 0.1 && t <= r.to + 0.3 && Math.hypot(r.x - num(e.x), r.y - num(e.y)) <= 0.03);
    const o = rest && (rest.label || rest.label_type === "none")
      ? (rest.over ? vig.objects.find((q) => q.id === rest.over) : null)
      : objectAt(vig, t, num(e.x, 0.5), num(e.y, 0.5), screen);
    if (!o || o.autonomous) continue;
    const before = o.readings.filter((r) => r.t <= t - 0.05 && r.t >= t - STATE_BEFORE);
    const after = o.readings.filter((r) => r.t >= t + 0.2 && r.t <= t + STATE_AFTER);
    if (!before.length || !after.length) continue;
    const was = before[before.length - 1].state;
    const now = after[after.length - 1].state;
    if (ACTIVE.has(was) || !ACTIVE.has(now)) continue;
    e.state_changed = { label: o.label, from: was, to: now };
    e.corroborated = true;
    onNote("the press at " + t.toFixed(2) + "s: \"" + o.label + "\" went from " + was + " to " + now);
  }
  return out.sort((a, b) => num(a.t) - num(b.t));
}

/**
 * The rests worth naming with the crop question: those a page change or a
 * press followed. At most `cap`, the ones before a page change first.
 *
 * @returns {Array<{from,to,x,y,t}>} fractions of the frame; `t` is when to look
 */
export function restsToName({ pointer = [], events = [], cap = 20 } = {}) {
  const navs = (events || []).filter((e) => e.type === "nav").map((e) => num(e.t));
  const presses = (events || []).filter((e) => e.type === "click" || e.type === "dblclick").map((e) => num(e.t));
  const out = [];
  for (const r of dwells(pointer || [])) {
    const from = num(r.start);
    const to = num(r.end);
    const beforeNav = navs.some((T) => from < T && to >= T - OPEN_BEFORE);
    const pressed = presses.some((p) => p >= from - 0.1 && p <= to + 0.3);
    /**
     * And every rest where the pointer was a hand for long enough to press:
     * a press nothing proposed — a switch that changed only itself — can then
     * be read back from the object it was on turning selected (CHANGED below).
     * On cap.so the readings saw "Lifetime" go hovered → selected under a
     * resting hand, and because nothing had been proposed there the rest was
     * never named and the change was never tied to it.
     */
    const hand = (r.shape === "pointer" || r.shape === "hand") && to - from >= 0.3;
    if (!beforeNav && !pressed && !hand) continue;
    // Early in the rest: the element as it was when the hand arrived, before
    // any press had changed it.
    out.push({ from: round3(from), to: round3(to), x: round4(num(r.x)), y: round4(num(r.y)), t: round3(from + Math.min(0.4, (to - from) / 2)), beforeNav, pressed });
  }
  // Before a page change first, then pressed, then the rest; at most `cap`.
  const rank = (r) => (r.beforeNav ? 0 : r.pressed ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b)).slice(0, cap).sort((a, b) => a.from - b.from);
}

/** A press found by reading back from its consequence, at a rest. */
function backPress(t, rest, extra) {
  return {
    id: newId("e"),
    t,
    type: "click",
    x: rest.x,
    y: rest.y,
    dy: 0,
    text: "",
    confidence: 0.8,
    source: "vig",
    shape: rest.shape || "default",
    corroborated: true,
    scrolled: false,
    scroll_shift: 0,
    position_age: 0,
    ...(rest.label ? { named: { label: rest.label, type: rest.label_type || "button" } } : {}),
    ...extra,
  };
}

/** The graph, trimmed for storing with the analysis. */
export function vigForStorage(vig) {
  if (!vig) return null;
  return {
    version: vig.version,
    screens: vig.screens,
    objects: vig.objects.slice(0, 400).map((o) => ({ ...o, readings: o.readings.slice(0, 60) })),
    rests: vig.rests.slice(0, 400),
    changes: vig.changes.slice(0, 400),
    edges: vig.edges.slice(0, 800),
  };
}

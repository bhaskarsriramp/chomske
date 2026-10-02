/**
 * board.mjs: the director's draft (ids and words) made renderable: element
 * ids become measured boxes, shot ids become files, the brand is checked
 * against what was measured, and every scene gets its length from its voice.
 *
 * Anything the draft got wrong degrades rather than fails: an unknown shot
 * falls back to the hero, a box too big to zoom into becomes no zoom, a click
 * on an element in another screenshot is dropped.
 */
import { SCENE_TYPES, ICON_NAMES, FONT_NAMES, MIN_SECONDS } from "../src/library.js";
import { scenesOf } from "./director.mjs";

const FPS = 30;
const VOICE_LEAD = 8 / FPS;
const TAIL = 0.5;
const HEX = /^#[0-9a-f]{6}$/i;
const s = (v, max = 200) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function resolveBoard(draft, capture, { voices = {} } = {}) {
  const shots = new Map(capture.shots.map((x) => [x.id, x]));
  const els = new Map();
  for (const shot of capture.shots) for (const e of shot.elements) els.set(e.id, { ...e, shot: shot.id });
  const hero = capture.shots[0];
  const measured = capture.brand;

  const b = draft.brand || {};
  const mode = b.mode === "light" ? "light" : "dark";
  // The candidate the director chose by looking (capture.mjs collects them);
  // a board from before candidates existed uses the single measured logo.
  const candidates = measured.logos || (measured.logo ? [{ id: "L1", ...measured.logo }] : []);
  const logo = draft.logo === "none" ? null : candidates.find((l) => l.id === draft.logo) || candidates[0] || null;
  const primary = HEX.test(b.primary || "") ? b.primary : logo?.color || measured.colors[0] || measured.buttonColor || "#5B5BFF";
  // A logo that is mostly white vanishes on a light video and a mostly black
  // one on a dark video: those sit on a plate of the opposite colour.
  let logoPlate = null;
  if (logo && !logo.solid) {
    const dark = logo.dark ?? (logo.lum < 0.35 ? 1 : 0);
    const light = logo.light ?? (logo.lum > 0.82 ? 1 : 0);
    if (mode === "dark" && dark > 0.45) logoPlate = "light";
    if (mode === "light" && light > 0.45) logoPlate = "dark";
  }
  const domain = new URL(capture.url).hostname.replace(/^www\./, "");
  const brand = {
    name: s(b.name, 40) || measured.siteName || domain,
    primary,
    accent: HEX.test(b.accent || "") ? b.accent : undefined,
    mode,
    font: FONT_NAMES.includes(b.font) ? b.font : "Inter",
    domain,
    logo: logo ? logo.file : null,
    logoPlate,
    logoHasName: !!(logo && (logo.wordmark || logo.aspect > 2.2)),
    // App icons are square images with filled corners (a phone rounds them);
    // drawn as they are, the corners show. Rounded the way a phone does.
    logoRound: !!(logo && logo.solid && /icon/.test(logo.source || "") && logo.aspect > 0.85 && logo.aspect < 1.18),
  };

  const shotFile = (id) => (shots.get(id) || hero).file;
  const scenes = [];
  for (const [i, raw] of scenesOf(draft).entries()) {
    if (!SCENE_TYPES.includes(raw.type)) continue;
    const sc = { id: `sc${i + 1}`, type: raw.type, voice: s(raw.voice, 400) };
    const copy = (k, max) => {
      if (raw[k]) sc[k] = s(raw[k], max);
    };
    ["headline", "accent", "eyebrow", "sub", "tagline", "kicker", "title", "body", "quote", "author", "role", "button", "url", "note"].forEach((k) => copy(k, 220));
    if (Array.isArray(raw.points)) sc.points = raw.points.map((p) => s(p, 80)).filter(Boolean).slice(0, 4);
    if (Array.isArray(raw.items))
      sc.items = raw.items
        .map((it) => ({ title: s(it.title, 60), body: s(it.body, 120), icon: ICON_NAMES.includes(it.icon) ? it.icon : "sparkle", value: s(it.value, 20), label: s(it.label, 60) }))
        .slice(0, 4);
    if (ICON_NAMES.includes(raw.icon)) sc.icon = raw.icon;

    if (sc.type === "reveal") sc.shot = shotFile(raw.shot);
    if (sc.type === "feature") {
      const focus = els.get(raw.focus);
      const shotId = focus ? focus.shot : shots.has(raw.shot) ? raw.shot : hero.id;
      sc.shot = shotFile(shotId);
      if (focus && focus.w <= 0.85 && focus.h <= 0.75) sc.focus = { x: focus.x, y: focus.y, w: focus.w, h: focus.h };
      const click = els.get(raw.click);
      if (click && click.shot === shotId && click.w < 0.5 && click.h < 0.3) sc.click = { x: click.x + click.w / 2, y: click.y + click.h / 2 };
    }
    if (sc.type === "cta" && !sc.url) sc.url = domain;
    if ((sc.type === "stats" || sc.type === "features") && !(sc.items || []).length) continue;
    if (sc.type === "problem" && !(sc.points || []).length) continue;

    const v = voices[i];
    if (v) {
      sc.audio = v.file;
      sc.voiceSeconds = Math.round(v.seconds * 100) / 100;
    }
    sc.seconds = Math.round(Math.max(MIN_SECONDS[sc.type] || 4, v ? VOICE_LEAD + v.seconds + TAIL : 0) * 100) / 100;
    scenes.push(sc);
  }
  return { aspect: "16:9", brand, captions: false, scenes };
}

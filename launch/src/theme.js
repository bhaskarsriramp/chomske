/**
 * theme.js: one brand colour (and a light or dark mode) turned into every
 * colour a scene draws with.
 *
 * The storyboard carries only what the site told us: its primary colour, an
 * optional second one, and whether the site is light or dark. Everything else
 * is derived here, so a scene never hard-codes a colour and a refinement like
 * "make it light" is one field.
 */

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function rgbOf(hex) {
  const m = HEX.exec(String(hex || "").trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

const toHex = (rgb) => "#" + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

export const mix = (a, b, t) => {
  const A = rgbOf(a);
  const B = rgbOf(b);
  if (!A || !B) return a;
  return toHex(A.map((v, i) => v + (B[i] - v) * t));
};

export const alpha = (hex, a) => {
  const c = rgbOf(hex) || [128, 128, 128];
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
};

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance(hex) {
  const c = rgbOf(hex);
  if (!c) return 0.5;
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rotate a colour's hue, for a second brand colour when the site has only one. */
function hueShift(hex, deg) {
  const c = rgbOf(hex);
  if (!c) return hex;
  const [r, g, b] = c.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  h = (h + deg / 360 + 1) % 1;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return toHex([f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => v * 255));
}

export function themeOf(brand = {}) {
  const primary = rgbOf(brand.primary) ? toHex(rgbOf(brand.primary)) : "#5B5BFF";
  const accent = rgbOf(brand.accent) ? toHex(rgbOf(brand.accent)) : hueShift(primary, 38);
  const dark = brand.mode !== "light";
  const bg = dark ? "#07070B" : "#F6F6F3";
  // A brand colour used as TEXT has to read on the background: a deep blue on
  // near-black does not, so on dark it is lifted toward white until it does.
  let primaryText = primary;
  if (dark) for (let t = 0; t < 0.8 && luminance(primaryText) < 0.18; t += 0.08) primaryText = mix(primary, "#FFFFFF", t);
  else for (let t = 0; t < 0.8 && luminance(primaryText) > 0.35; t += 0.08) primaryText = mix(primary, "#000000", t);
  const accentText = dark ? mix(accent, "#FFFFFF", luminance(accent) < 0.2 ? 0.35 : 0.1) : accent;
  return {
    dark,
    primary,
    accent,
    primaryText,
    accentText,
    onPrimary: luminance(primary) > 0.45 ? "#0B0B0F" : "#FFFFFF",
    bg,
    ink: dark ? "#F4F4F6" : "#0D0D10",
    body: dark ? "rgba(236,236,244,0.66)" : "rgba(18,18,24,0.62)",
    faint: dark ? "rgba(236,236,244,0.38)" : "rgba(18,18,24,0.38)",
    line: dark ? "rgba(255,255,255,0.09)" : "rgba(10,10,20,0.09)",
    card: dark ? "rgba(255,255,255,0.045)" : "rgba(255,255,255,0.92)",
    cardEdge: dark ? "rgba(255,255,255,0.10)" : "rgba(10,10,20,0.08)",
    chrome: dark ? "#16161B" : "#EDEDEA",
    chromeInk: dark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.5)",
    shadow: dark ? "0 40px 120px rgba(0,0,0,0.65), 0 12px 40px rgba(0,0,0,0.45)" : "0 40px 110px rgba(20,20,60,0.20), 0 10px 30px rgba(20,20,60,0.10)",
    gradient: `linear-gradient(100deg, ${dark ? mix(primary, "#FFFFFF", 0.25) : primary} 0%, ${dark ? mix(accent, "#FFFFFF", 0.2) : accent} 100%)`,
  };
}

/**
 * Icon.jsx: the few glyphs a feature card can carry. A fixed set, named by
 * meaning, so the director picks a word ("zoom", "shield") and never draws.
 */
const P = {
  zoom: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.2-4.2M11 8v6M8 11h6",
  cursor: "M5 3l6.5 16 2.2-6.3L20 10.5 5 3Z",
  sparkle: "M12 3v3M12 18v3M3 12h3M18 12h3M6.3 6.3l2.1 2.1M15.6 15.6l2.1 2.1M6.3 17.7l2.1-2.1M15.6 8.4l2.1-2.1",
  shield: "M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3Zm-3 9 2 2 4-4",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7l1-8Z",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3.5 2",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 10a7 7 0 0 1 14 0M17 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4-6.3",
  lock: "M6 11h12v10H6V11Zm3 0V7a3 3 0 1 1 6 0v4",
  wand: "M15 4V2M15 10V8M19 6h2M9 6h2M17.8 3.2l1.4-1.4M3 21 14 10M17.8 8.8l1.4 1.4",
  layers: "M12 3 2 8l10 5 10-5-10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5",
  check: "M5 12.5 10 17 19 7",
  video: "M3 6h12v12H3V6Zm12 4.5L21 7v10l-6-3.5",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 1 0 6 0V6a3 3 0 0 0-3-3Zm-7 9a7 7 0 0 0 14 0M12 19v3",
  text: "M4 6V4h16v2M12 4v16M8 20h8",
  download: "M12 3v12m0 0 5-5m-5 5-5-5M4 21h16",
  share: "M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M12 3v13M7 8l5-5 5 5",
  browser: "M3 5h18v14H3V5Zm0 4h18M6.5 7h.01M9 7h.01",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z",
  code: "M8 8l-5 4 5 4M16 8l5 4-5 4M14 4l-4 16",
  card: "M3 6h18v12H3V6Zm0 4h18",
  x: "M6 6l12 12M18 6 6 18",
};

export const ICONS = Object.keys(P);

export const Icon = ({ name, size = 28, color = "currentColor", stroke = 1.9 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    <path d={P[name] || P.sparkle} />
  </svg>
);

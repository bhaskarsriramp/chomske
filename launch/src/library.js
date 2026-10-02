/**
 * library.js: the names the storyboard may use. Plain data, imported by both
 * the scenes (webpack) and the pipeline (Node), so the director is only ever
 * offered what the renderer can draw.
 */
export const SCENE_TYPES = ["hook", "problem", "reveal", "feature", "features", "stats", "quote", "cta"];

export const ICON_NAMES = [
  "zoom", "cursor", "sparkle", "shield", "globe", "bolt", "chart", "clock", "users", "lock", "wand", "layers",
  "check", "video", "mic", "text", "download", "share", "browser", "heart", "code", "card",
];

export const FONT_NAMES = ["Inter", "Geist", "Manrope", "Plus Jakarta Sans", "DM Sans", "Space Grotesk", "Sora", "Outfit", "Poppins", "Urbanist"];

export const VOICES = [
  { id: "Kore", sub: "female, clear and steady" },
  { id: "Zephyr", sub: "female, bright and warm" },
  { id: "Charon", sub: "male, calm and informative" },
  { id: "Puck", sub: "male, upbeat" },
];

/** The shortest a scene may run, seconds: long enough for its own animation to land and be read. */
export const MIN_SECONDS = { hook: 2.6, problem: 4.2, reveal: 4.8, feature: 4.6, features: 4.6, stats: 3.8, quote: 4.4, cta: 4.2 };

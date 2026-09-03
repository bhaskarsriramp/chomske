/**
 * theme.js — the colour that carries meaning.
 *
 * ── WHY COLOUR AT ALL ────────────────────────────────────────────────────────
 * A creator picks up to three categories. Once their feed mixes "Stock market"
 * with "AI & technology", a monochrome list makes them read every row to work
 * out which world it came from. A hue per category answers that before they
 * read a word, which is the only reason colour is here: it is a label, not
 * decoration. Everything colour touches in this app is either a category or a
 * state. Nothing is tinted because tinting looked nice.
 *
 * Each entry carries four fixed values rather than one hue plus runtime maths.
 * Generated tints drift: a computed 6% of violet and a computed 6% of amber do
 * not read as the same weight to the eye, and the list ends up looking like the
 * amber rows are selected. These were picked by eye against white at the sizes
 * they are actually used.
 *
 *   ink   text and icons on white, at 14px, contrast-checked
 *   solid the dot; full strength, only ever used at 6-8px
 *   tint  card and chip fill; deliberately near-white
 *   line  the border that pairs with tint without becoming a box
 */
export const CATEGORY_COLORS = {
  ai_tech:        { ink: "#5B32D6", solid: "#6C3FE0", tint: "#F5F2FE", line: "#DED4FA" },
  finance:        { ink: "#08733E", solid: "#0B8A4B", tint: "#EDF8F1", line: "#C6E7D3" },
  business:       { ink: "#1A57B8", solid: "#1D63D1", tint: "#EFF4FD", line: "#CFDEF8" },
  crypto:         { ink: "#8F5E07", solid: "#A9700A", tint: "#FBF5E8", line: "#EEDCB6" },
  entertainment:  { ink: "#AC1B7A", solid: "#C4218C", tint: "#FCF0F8", line: "#F3D2E8" },
  sports:         { ink: "#076C6C", solid: "#0A8080", tint: "#ECF7F7", line: "#C2E3E3" },
  science_health: { ink: "#AB2C41", solid: "#C0344A", tint: "#FCF0F2", line: "#F3D3D8" },
  jobs_exams:     { ink: "#414B6B", solid: "#4A5578", tint: "#F1F3F8", line: "#D8DDE9" },
};

/** Neutral fallback, so a category added on the server never renders colourless. */
const NEUTRAL = { ink: "#5A5A5A", solid: "#8A8A8A", tint: "#F7F7F7", line: "#E3E3E3" };

export function categoryColor(id) {
  return CATEGORY_COLORS[id] || NEUTRAL;
}

/**
 * The brand spectrum: violet, red, amber.
 *
 * Not chosen for prettiness. It is the gradient that runs across the two apps
 * these creators live inside all day, and it is warm, which is what keeps this
 * off the cold indigo-on-charcoal that every AI product ships with. It appears
 * on the mark, behind the hero, and nowhere else. A gradient used on buttons,
 * headings and cards at once stops reading as a brand and starts reading as a
 * template.
 */
export const BRAND = {
  violet: "#7B2FF7",
  red: "#F0264C",
  amber: "#FF9E2C",
};

export const BRAND_GRADIENT = `linear-gradient(115deg, ${BRAND.violet} 0%, ${BRAND.red} 52%, ${BRAND.amber} 100%)`;

/**
 * The hero's ground. Three very wide radial washes, all under 20% alpha, on
 * warm white. Soft enough that no edge is visible anywhere, which is the
 * difference between a background and a banner.
 */
export const HERO_WASH = [
  "radial-gradient(1100px 620px at 12% -10%, rgba(123,47,247,.16), transparent 62%)",
  "radial-gradient(900px 560px at 88% 4%, rgba(240,38,76,.13), transparent 60%)",
  "radial-gradient(760px 520px at 62% 88%, rgba(255,158,44,.14), transparent 62%)",
  "linear-gradient(180deg, #FFFFFF 0%, #FCFBFA 100%)",
].join(", ");

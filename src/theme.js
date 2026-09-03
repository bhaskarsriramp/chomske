/**
 * theme.js — the colour that carries meaning, and the colour that carries life.
 *
 * ── NO BLUE. AT ALL. ─────────────────────────────────────────────────────────
 * Not a preference. Pale blue and lavender card tints are the single most
 * recognisable signature of a generated interface, because every AI product
 * ships the same indigo-on-white palette. A creator reading this feed clocks it
 * in under a second and discounts everything on the page. So the whole system
 * below is built from warm hues and greens: rust, clay, amber, olive, sage,
 * sea green, plum, magenta, brown. Nothing here is blue, indigo, or violet, and
 * nothing added later should be. The brand mark in public/ is blue, and that is
 * fine: a logo is an identity, a background tint is a mood.
 *
 * ── TWO SEPARATE JOBS ────────────────────────────────────────────────────────
 * CARD_TINTS make a long list pleasant to look at. They cycle by position and
 * mean nothing, which is exactly why they are safe to be decorative.
 *
 * CATEGORY_COLORS identify a category, and are never decorative. They appear on
 * the filter chips and the story header, so the colour a creator picked at
 * onboarding is the colour that names their feed later.
 *
 * Keeping those two jobs in separate palettes is deliberate. When the card
 * backgrounds also encoded the category, a single-category feed was forty
 * identical cards, and colour that never varies has stopped being information.
 */

/**
 * Twelve card grounds, cycled by index down the feed and repeated past twelve.
 *
 * Each is a near-white top fading to white before the headline starts, so the
 * colour lands where a scanning eye catches the card edge and never behind text
 * that has to be read. Values are fixed rather than computed: a generated 6% of
 * amber and a generated 6% of sage do not read as the same weight, and the list
 * ends up looking like the amber rows are selected.
 */
export const CARD_TINTS = [
  { from: "#FDF0EF", line: "#F2D9D6" },  // blush
  { from: "#FDF2E8", line: "#F4DFCA" },  // peach
  { from: "#FCF5E4", line: "#EDE1BE" },  // amber
  { from: "#F4F6E2", line: "#DEE3BB" },  // olive
  { from: "#EDF5EA", line: "#D2E2CD" },  // sage
  { from: "#E9F5F0", line: "#C6E3D7" },  // sea green
  { from: "#FBEFE9", line: "#EFD7CA" },  // clay
  { from: "#FAEFF4", line: "#EDD7E2" },  // mauve
  { from: "#F7F4EC", line: "#E4DDCD" },  // sand
  { from: "#FBEEF1", line: "#EFD5DB" },  // rosewood
  { from: "#F1F6E9", line: "#DAE4C6" },  // moss
  { from: "#FCF3F0", line: "#F1DCD5" },  // shell
];

export function cardTint(index) {
  return CARD_TINTS[((index % CARD_TINTS.length) + CARD_TINTS.length) % CARD_TINTS.length];
}

/**
 * A card's ground, as a ready-to-use background string.
 * `active` keeps the full tint instead of fading, so the selected row in the
 * split view reads as chosen without needing a heavier border or a shadow.
 */
export function cardBackground(index, active = false) {
  const t = cardTint(index);
  return active ? t.from : `linear-gradient(180deg, ${t.from} 0%, var(--card) 76%)`;
}

/**
 * One hue per category.
 *
 *   ink   text on white at 13-15px, contrast-checked
 *   solid the dot, only ever used at 6-8px
 *   tint  chip fill, deliberately near-white
 *   line  the border that pairs with tint without becoming a box
 */
export const CATEGORY_COLORS = {
  ai_tech:        { ink: "#A64824", solid: "#B5502B", tint: "#FBF0EA", line: "#F0D8C9" },
  finance:        { ink: "#1B6E3F", solid: "#1E7A46", tint: "#ECF6F0", line: "#C7E3D2" },
  business:       { ink: "#6F3057", solid: "#7A3560", tint: "#F9EFF5", line: "#EBD4E2" },
  crypto:         { ink: "#8A6007", solid: "#9A6B08", tint: "#FBF5E4", line: "#EDE0BC" },
  entertainment:  { ink: "#A2206B", solid: "#B32476", tint: "#FCEFF6", line: "#F2D3E4" },
  sports:         { ink: "#0D6E59", solid: "#0F7A63", tint: "#EAF6F2", line: "#C5E4DA" },
  science_health: { ink: "#556916", solid: "#5F7318", tint: "#F3F6E4", line: "#DDE4BE" },
  jobs_exams:     { ink: "#63503F", solid: "#6E5847", tint: "#F6F2ED", line: "#E4DCD2" },
};

/** Neutral fallback, so a category added on the server never renders colourless. */
const NEUTRAL = { ink: "#5A5A5A", solid: "#8A8A8A", tint: "#F7F7F7", line: "#E3E3E3" };

export function categoryColor(id) {
  return CATEGORY_COLORS[id] || NEUTRAL;
}

/**
 * The hero and onboarding ground. Three very wide washes on warm white, all
 * under 15% alpha and soft enough that no edge is visible anywhere, which is
 * the difference between a background and a banner. Rose, amber and sage: warm
 * where the usual product gradient is cold.
 */
export const HERO_WASH = [
  "radial-gradient(1100px 620px at 10% -12%, rgba(214,109,76,.15), transparent 62%)",
  "radial-gradient(900px 560px at 90% 2%, rgba(196,60,110,.11), transparent 60%)",
  "radial-gradient(820px 540px at 58% 92%, rgba(150,160,60,.13), transparent 62%)",
  "linear-gradient(180deg, #FFFFFF 0%, #FDFBF8 100%)",
].join(", ");

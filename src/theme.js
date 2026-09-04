/**
 * theme.js — the colour that carries meaning, and the colour that carries life.
 *
 * ── THE PALETTE IS FIXED BY THE BRAND, NOT CHOSEN HERE ───────────────────────
 * Both palettes below derive from seven brand colours and nothing else:
 *
 *   #2A7C13  #76C457  #2A835F  #00B7CD  #70FFD2  #E3F2FD  #FFA6FB
 *
 * This REPLACES the warm palette that used to live here (rust, clay, amber,
 * peach, rosewood) and the rule that came with it, which read "NO BLUE. AT
 * ALL." — on the reasoning that pale blue and lavender tints are the signature
 * of a generated interface. That rule is retired for the cards and the
 * categories: cyan and ice blue are in the set on purpose, because they are the
 * brand's. Do not "fix" them back to warm.
 *
 * HERO_WASH at the bottom is the one thing still warm, and deliberately so — it
 * is the landing page's ground, seen before anyone signs in, and it is not
 * carrying the app's colour system. Move it too if the brand says so; leaving it
 * behind by accident is the failure mode to watch for.
 *
 * ── TWO PALETTES BECAUSE THEY HAVE DIFFERENT CONSTRAINTS ─────────────────────
 * CARD_TINTS are grounds behind dark text, so every colour is mixed toward
 * white to a fixed lightness. CATEGORY_COLORS include TEXT, so the same colours
 * are taken down in HSL until each clears 4.5:1 on white. Same seven hues, two
 * different jobs, and neither set can be used in the other's place.
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
 * Seven card grounds, cycled by index down the feed and repeated past seven.
 *
 * Each is a near-white top fading to white before the headline starts, so the
 * colour lands where a scanning eye catches the card edge and never behind text
 * that has to be read.
 *
 * ── WHY THESE ARE NOT THE BRAND COLOURS AT FULL STRENGTH ─────────────────────
 * Four of the seven (#2A7C13, #2A835F, #00B7CD, #76C457) are mid-to-dark. A
 * card filled with any of them cannot carry near-black body text — #2A7C13
 * against the ink used here fails contrast outright, and a list that solved
 * that by flipping some cards to white text would read as four different
 * components rather than one feed. So each brand colour is mixed toward white
 * until it lands at a fixed lightness, and the card keeps one text colour
 * throughout. The hue is entirely the brand's; only the strength is ours.
 *
 * ── WHY THE VALUES ARE WRITTEN OUT AND NOT COMPUTED AT RUNTIME ───────────────
 * The same reason as the palette they replaced: mixing every colour at one flat
 * percentage does NOT produce tints that look equally strong. #2A7C13 at 8% is a
 * visibly heavier wash than #E3F2FD at 8%, and the list ends up looking as
 * though the green rows are selected. These were solved individually to land on
 * the same perceptual lightness (L*97 for the ground, L*88 for the border), so
 * every row carries the same weight and no colour reads as a state.
 *
 * The two lightest brand colours are already at or above that border lightness,
 * so #70FFD2 and #E3F2FD appear as borders exactly as given.
 *
 * Ordered to keep neighbours apart: four of the seven are greens, and cycling
 * them in palette order would put three near-identical rows in a row.
 */
export const CARD_TINTS = [
  { from: "#F3F8F2", line: "#D0E2CB" },  // forest  ← #2A7C13
  { from: "#FFF3FE", line: "#FFCDFD" },  // orchid  ← #FFA6FB
  { from: "#EBF9FB", line: "#ABE7EE" },  // cyan    ← #00B7CD
  { from: "#F1F9ED", line: "#C5E6B8" },  // leaf    ← #76C457
  { from: "#EFF8FE", line: "#E3F2FD" },  // ice     ← #E3F2FD
  { from: "#F2F8F5", line: "#CCE2D9" },  // pine    ← #2A835F
  { from: "#D7FFF2", line: "#70FFD2" },  // mint    ← #70FFD2
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
 * One hue per category, drawn from the same seven brand colours as the cards.
 *
 *   ink   text on white at 13-15px, contrast-checked
 *   solid the dot, only ever used at 6-8px
 *   tint  chip fill, deliberately near-white
 *   line  the border that pairs with tint without becoming a box
 *
 * ── THESE ARE NOT THE BRAND COLOURS AS GIVEN, AND CANNOT BE ──────────────────
 * `ink` is TEXT. #70FFD2 and #E3F2FD against white are contrast ratios of about
 * 1.2:1 and 1.1:1 — invisible, not merely faint. So each ink is its brand
 * colour taken down in HSL, hue and saturation held, until it clears 4.5:1.
 * Every value below is at or above that; the ratio is written beside it. Same
 * for `solid`: a 6px dot in #70FFD2 on white is not there, so the dots sit at
 * 3:1, the threshold for a small non-text shape.
 *
 * ── EIGHT CATEGORIES, SEVEN COLOURS, AND FOUR OF THEM GREEN ──────────────────
 * The palette has five hue families, not eight: yellow-green (#2A7C13,
 * #76C457), teal-green (#2A835F, #70FFD2), cyan, ice blue, magenta. Darkened to
 * one contrast level the pairs come out nearly identical, which is useless for
 * something whose whole job is telling categories apart. So same-family pairs
 * are separated by DEPTH instead: finance sits at 7.2:1 and crypto at 4.6:1 off
 * the two greens, business at 5.4:1 and sports at 4.6:1 off the two teals. The
 * eighth (jobs_exams) has no colour left, so it is magenta taken much deeper
 * than entertainment's — a plum against a bright pink, with a deeper chip fill
 * as well, since two categories sharing one hue need every bit of separation
 * they can get.
 *
 * The chip always carries its label. Colour reinforces which category you are
 * reading; it is not asked to carry that alone.
 */
export const CATEGORY_COLORS = {
  ai_tech:        { ink: "#007887", solid: "#00A4B8", tint: "#EBF9FB", line: "#ABE7EE" },  // cyan   5.2:1
  finance:        { ink: "#22640F", solid: "#3AAB1A", tint: "#F3F8F2", line: "#D0E2CB" },  // forest 7.2:1
  business:       { ink: "#267857", solid: "#36A879", tint: "#F2F8F5", line: "#CCE2D9" },  // pine   5.4:1
  crypto:         { ink: "#46832E", solid: "#59A73B", tint: "#F1F9ED", line: "#C5E6B8" },  // leaf   4.6:1
  entertainment:  { ink: "#C800BF", solid: "#FF30F6", tint: "#FFF3FE", line: "#FFCDFD" },  // orchid 5.0:1
  sports:         { ink: "#00865C", solid: "#00AA74", tint: "#D7FFF2", line: "#70FFD2" },  // mint   4.6:1
  science_health: { ink: "#0D70B9", solid: "#279BF0", tint: "#EFF8FE", line: "#E3F2FD" },  // ice    5.2:1
  // Deeper than entertainment on every channel, including the dot: at the same
  // `solid` the two magenta categories were indistinguishable at 6px.
  jobs_exams:     { ink: "#81007B", solid: "#C800BF", tint: "#FFE6FE", line: "#FFBCFC" },  // orchid 9.5:1
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

/**
 * demoSlug.js: the id a demo shows in the address bar.
 *
 * An open recording lives at /app/studio/<slug>, so a reload lands back in the
 * editor and a tab can be bookmarked. The slug is random rather than the
 * record's _id: an ObjectId carries the moment it was made and sits right
 * next to its neighbours, and there is no reason for a link to say either.
 *
 * Every /studio/demos/:id route accepts a slug or an id (routes/studio.js
 * ownDemo), so older links and internal calls keep working.
 */
import crypto from "crypto";
import StudioDemo from "../../models/StudioDemo.js";

// No l, I, 1, 0 or O, the same alphabet as showcase links
// (services/showcaseService.js): a link read off one screen and typed into
// another must not be ambiguous.
const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// Ten characters is 57^10, about 3.6e17. It is also never 12 or 24, the two
// lengths mongoose.Types.ObjectId.isValid accepts, so a slug can never be
// mistaken for an id or the other way round.
export const DEMO_SLUG_LENGTH = 10;
const SHAPE = new RegExp(`^[${ALPHABET}]{${DEMO_SLUG_LENGTH}}$`);

export function newDemoSlug() {
  const bytes = crypto.randomBytes(DEMO_SLUG_LENGTH * 2);
  let out = "";
  for (let i = 0; out.length < DEMO_SLUG_LENGTH && i < bytes.length; i++) {
    const n = bytes[i];
    // Rejection sampling, so no character is fractionally likelier than another.
    if (n < 256 - (256 % ALPHABET.length)) out += ALPHABET[n % ALPHABET.length];
  }
  return out.length === DEMO_SLUG_LENGTH ? out : newDemoSlug();
}

export const isDemoSlug = (v) => typeof v === "string" && SHAPE.test(v);

/**
 * The demo's slug, minting one if it has none: every demo made before slugs
 * existed gets one the first time it is listed or opened.
 *
 * Written only where the field is still missing, so two tabs doing this at
 * once agree on whichever landed first, and a collision (vanishingly rare, but
 * the index is unique) draws again. An update rather than a save on purpose:
 * the save hook would move updated_at, and the library shows that as the time
 * the demo was last edited.
 *
 * Sets `demo.slug` on whatever it is given, a lean object or a document, so the
 * caller can shape it straight away.
 */
export async function ensureDemoSlug(demo) {
  if (demo?.slug) return demo.slug;
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = newDemoSlug();
    try {
      const r = await StudioDemo.updateOne({ _id: demo._id, slug: { $exists: false } }, { $set: { slug } });
      if (r.modifiedCount) {
        demo.slug = slug;
        return slug;
      }
      // Someone else got there first, or the demo is gone.
      const cur = await StudioDemo.findById(demo._id).select("slug").lean();
      if (cur?.slug) demo.slug = cur.slug;
      return cur?.slug || "";
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
  }
  return "";
}

export default { newDemoSlug, isDemoSlug, ensureDemoSlug, DEMO_SLUG_LENGTH };

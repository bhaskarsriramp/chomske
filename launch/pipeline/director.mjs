/**
 * director.mjs: the site's words and screenshots, turned into a storyboard
 * for the scene library; and a storyboard plus a creator's request, turned
 * into the next storyboard.
 *
 * ── THE MODEL WRITES, IT DOES NOT DRAW ───────────────────────────────────────
 * It fills a fixed set of slots (hook, problem, reveal, features, …) with
 * words, picks which real screenshot each one shows and which measured
 * element a feature zooms into, by id. Every pixel is the library's. That is
 * what keeps the result looking designed rather than generated, and what lets
 * a refinement change one word without the video changing style.
 *
 * ── SLOTS, NOT A FREE LIST OF SCENES ─────────────────────────────────────────
 * The first version asked for a list of scenes with every field optional, and
 * the model skipped the fields that make a scene good (no screenshot, no zoom
 * target, a grid with no items). Each slot now has its own required fields,
 * and the order is the launch-video order: hook, problem, reveal, features,
 * then the optional grid, stats and quote, then the call to action.
 *
 * ── NOTHING THE SITE DID NOT SAY ─────────────────────────────────────────────
 * Stats and quotes are only ever the site's own. Landing pages often draw a
 * pretend app inside their hero (Clipo's own does: a made-up analytics product
 * with prices) and the fetched text cannot tell that from the real offer, so
 * the model sees the screenshots and is told to leave sample content alone.
 */
import fsp from "fs/promises";
import path from "path";
import { askJson } from "./gemini.mjs";
import { ICON_NAMES, FONT_NAMES, VOICES, MIN_SECONDS } from "../src/library.js";

const str = { type: "string" };
const icon = { type: "string", enum: ICON_NAMES };
const obj = (properties, required) => ({ type: "object", properties, required });

export const BOARD_SCHEMA = obj(
  {
    brand: obj(
      { name: str, primary: str, accent: str, mode: { type: "string", enum: ["light", "dark"] }, font: { type: "string", enum: FONT_NAMES } },
      ["name", "primary", "mode", "font"]
    ),
    voiceName: { type: "string", enum: VOICES.map((v) => v.id) },
    music: str,
    hook: obj({ headline: str, accent: str, eyebrow: str, sub: str, voice: str }, ["headline", "accent", "voice"]),
    problem: obj({ headline: str, accent: str, points: { type: "array", items: str }, voice: str }, ["headline", "accent", "points", "voice"]),
    reveal: obj({ tagline: str, shot: str, voice: str }, ["tagline", "shot", "voice"]),
    features: {
      type: "array",
      minItems: 2,
      maxItems: 3,
      items: obj({ kicker: str, title: str, accent: str, body: str, icon, shot: str, focus: str, click: str, voice: str }, [
        "kicker",
        "title",
        "body",
        "icon",
        "shot",
        "focus",
        "voice",
      ]),
    },
    grid: obj({ title: str, accent: str, items: { type: "array", items: obj({ title: str, body: str, icon }, ["title", "body", "icon"]) }, voice: str }, [
      "title",
      "items",
      "voice",
    ]),
    stats: obj({ title: str, items: { type: "array", items: obj({ value: str, label: str }, ["value", "label"]) }, voice: str }, ["items", "voice"]),
    quote: obj({ quote: str, author: str, role: str, voice: str }, ["quote", "author", "voice"]),
    cta: obj({ headline: str, accent: str, button: str, note: str, voice: str }, ["headline", "accent", "button", "voice"]),
  },
  ["brand", "voiceName", "music", "hook", "problem", "reveal", "features", "cta"]
);

/** The slots, in the order the video plays them. */
export function scenesOf(draft) {
  const d = draft || {};
  const out = [];
  if (d.hook) out.push({ type: "hook", ...d.hook });
  if (d.problem) out.push({ type: "problem", ...d.problem });
  if (d.reveal) out.push({ type: "reveal", ...d.reveal });
  for (const f of d.features || []) out.push({ type: "feature", ...f });
  if (d.grid && (d.grid.items || []).length >= 2) out.push({ type: "features", ...d.grid });
  if (d.stats && (d.stats.items || []).length >= 1) out.push({ type: "stats", ...d.stats });
  if (d.quote && d.quote.quote) out.push({ type: "quote", ...d.quote });
  if (d.cta) out.push({ type: "cta", ...d.cta });
  return out;
}

const LIBRARY = `THE SLOTS (each is one animated scene; the scenes already look great):
- hook: headline (max 8 words: the sharpest true claim, or the viewer's pain), accent (1-3 words copied from the headline, coloured), optional eyebrow (max 3 words), optional sub (max 12 words).
- problem: headline (max 7 words), accent (words copied from the headline), points (exactly 3 pains, max 6 words each, in the viewer's own words).
- reveal: tagline (max 10 words), shot (the hero shot id, usually s1). The logo and product name are drawn automatically.
- features (2 or 3; each on a different shot, or a clearly different element): kicker (max 3 words, e.g. "No install"), title (max 6 words), accent (words copied from the title), body (max 16 words), icon, shot (shot id), focus (the id of ONE element in that shot that SHOWS the claim: a panel, visual, card or control that demonstrates the feature, not the headline that names it. A heading is a last resort, only when the shot has no visual for it. Never a nav link. Its box must be smaller than 0.8 wide and 0.7 tall), click (the id of a button or control inside or right next to the focus, only when a click makes sense; otherwise an empty string).
- grid (optional): title (max 7 words), accent, items (3, at most 4): title max 4 words, body max 9 words, icon. Use it for further real capabilities not already covered by the features.
- stats (optional): title (optional, max 6 words), items (2-3): value exactly as the site states it ("100", "4K", "60fps"), label max 4 words. Only numbers the site itself states about THIS product.
- quote (optional): quote (word for word from the site, max 30 words), author, role. Only a real testimonial printed on the site.
- cta: headline (max 7 words), accent (words copied from the headline), button (the site's own call-to-action label), note (max 8 words, e.g. the site's own free-offer line, or an empty string).`;

const RULES = `VOICE LINES: every slot has "voice": what the narrator says while that scene is on screen. Natural spoken English, 6 to 15 words (short, punchy sentences), adding to the on-screen words rather than reading them out. Read in order, the lines are ONE story told by one person, each flowing from the last. Never use: "introducing", "game-changer", "revolutionary", "seamless", "unlock", "supercharge", "elevate", "effortless", "in today's world", "look no further", exclamation marks. Total: about 30 to 45 seconds of speech.

ON-SCREEN WORDS: short, concrete, specific to this product. Sentence case.

TRUTH: only facts the site states, in the on-screen words AND in the voice lines. Never invent numbers, customers, logos, testimonials, integrations or features. Landing-page screenshots often contain SAMPLE content inside a product mockup (a pretend app, a made-up dashboard, placeholder names, prices or metrics shown to illustrate the product). That is not this product's offer: never present it as this product's feature, price or statistic. When unsure whether something is sample content, leave it out. Omit grid, stats and quote rather than pad them.

BRAND: name exactly as the site writes it. primary: THE brand colour, normally the logo's colour, from the measured colours. accent: a second brand colour only if the logo or brand clearly uses one (never a third-party colour such as a Google, Apple or social sign-in button); otherwise an empty string. mode: "dark" (more cinematic) unless the brand is clearly light and airy. font: the closest in feel to the site's heading font.
voiceName: ${VOICES.map((v) => `${v.id} (${v.sub})`).join(", ")}: the one that suits the brand.
music: 6 to 14 words on the mood of the background score that suits this brand and audience (e.g. "calm, premium, minimal electronic with soft piano"). Instrumental only.`;

const box = (e) => `[${[e.x, e.y, e.w, e.h].map((v) => v.toFixed(2)).join(", ")}]`;

/** The shots the model may use: a shot that was retaken is replaced by its retake. */
const usable = (capture) => capture.shots.filter((s) => !s.replacedBy);

function catalog(capture) {
  return usable(capture)
    .map((s, i) => {
      const where = [s.key && s.key !== "hero" ? `${s.key} section` : s.key === "hero" ? "top of the page" : "", s.label && s.label !== "hero" ? `"${s.label}"` : "", s.url && s.url !== capture.url ? `on ${s.url}` : ""].filter(Boolean).join(", ");
      const fresh = s.replaces ? ` NEW, retaken to replace ${s.replaces}: use ${s.id} wherever ${s.replaces} was used` : "";
      // A shot taken before the page finished (capture.mjs waitSettled) may be half-loaded: said, so it is used only if it looks right.
      const unsure = s.ready === false ? ` (taken before the page fully settled: ${(s.issues || []).join(", ")}; use it only if the image looks complete)` : "";
      return (
        `${s.id} (image ${i + 1}${where ? `, ${where}` : ""}, scrolled ${s.scrollY}px)${fresh}${unsure}:\n` +
        s.elements.map((e) => `  ${e.id} ${e.kind} ${box(e)}${e.text ? ` "${e.text.replace(/"/g, "'")}"` : ""}`).join("\n")
      );
    })
    .join("\n");
}

const logosOf = (capture) => capture.brand.logos || (capture.brand.logo ? [{ id: "L1", ...capture.brand.logo }] : []);

function logoList(capture) {
  const logos = logosOf(capture);
  if (!logos.length) return "none found (a monogram is drawn instead)";
  return logos
    .map((l) => `${l.id}: ${l.source}, ${l.w}x${l.h}${l.wordmark ? ", wide (includes the name)" : ""}${l.solid ? ", on its own solid tile" : ", transparent"}${l.color ? `, coloured ${l.color}` : ""}`)
    .join("; ");
}

function brandFacts(capture) {
  const b = capture.brand;
  return `measured colours by how much the page uses them: ${(b.colors || []).join(", ") || "none"}; main button fill: ${b.buttonColor || "unknown"} (a near-black or grey fill means a monochrome brand: then primary is that fill); theme-color: ${b.themeColor || "none"}; page background ${b.background || "unknown"} (${b.dark ? "dark" : "light"} site); heading font: ${b.headingFont}.`;
}

/** The screenshots, then the logo candidates, as images in that order. */
async function images(dir, capture) {
  const parts = [];
  for (const s of usable(capture)) {
    const data = await fsp.readFile(path.join(dir, s.preview));
    parts.push({ inlineData: { mimeType: "image/jpeg", data: data.toString("base64") } });
  }
  for (const l of logosOf(capture)) {
    try {
      const data = await fsp.readFile(path.join(dir, l.file));
      parts.push({ inlineData: { mimeType: "image/png", data: data.toString("base64") } });
    } catch {
      /* a candidate whose file is gone is simply not shown */
    }
  }
  return parts;
}

function boardSchema(capture) {
  const ids = logosOf(capture).map((l) => l.id);
  return {
    ...BOARD_SCHEMA,
    properties: { ...BOARD_SCHEMA.properties, logo: { type: "string", enum: [...ids, "none"] } },
    required: [...BOARD_SCHEMA.required, "logo"],
  };
}

const LOGO_RULE = (capture) => `LOGO: the logo candidates are attached as images after the screenshots, in this order: ${logoList(capture)}. Set "logo" to the id of the brand's own logo. The navbar logo (top left of the first screenshot, linking home) IS the brand's logo: choose the candidate that matches it, preferring the cleanest version of it (the navbar image itself, or its square app icon when the navbar version is tiny or unreadable). Never a badge, a partner's or customer's logo, a review-site logo, a photo or an illustration. "none" only if no candidate is the brand's.`;

export async function directBoard({ site, capture, dir, notes = "" }) {
  const prompt = `You are the creative director of a premium product launch video, the kind Linear, Arc or Stripe publish: confident, specific, no fluff. You fill the slots of a library of animated scenes: the story, the words, which real screenshot each scene shows, and which element a feature zooms into.

THE PRODUCT
URL: ${site.url}
Title: ${site.title}
Description: ${site.description}
Site text (markdown of the live page):
<<<
${site.text}
>>>

SCREENSHOTS: ${usable(capture).length} images attached in this order, each the page at 1440x900. For each, the elements you may point at: id, kind, box [x, y, w, h] as fractions of the screenshot, and its text.
${catalog(capture)}

BRAND (measured from the live page): ${brandFacts(capture)}

${LOGO_RULE(capture)}

${LIBRARY}

${RULES}

Use the pricing section (when there is one) as a feature, showing the plans: a creator's audience wants to see the price.
Never put a screenshot in the video that looks empty, half-loaded, faded or cut off: look at the image, not only its elements.
${notes ? `\nTHE CREATOR'S NOTES: ${notes}\n` : ""}
Return the storyboard as JSON.`;
  const parts = [{ text: prompt }, ...(await images(dir, capture))];
  const { json, usage } = await askJson({ parts, schema: boardSchema(capture), label: "director", temperature: 0.8 });
  return { draft: json, usage };
}

/** The board as it actually plays, so a request about length can be met: the model cannot count seconds it is not shown. */
function timing(board) {
  if (!board?.scenes?.length) return "";
  const words = (s) => String(s || "").split(/\s+/).filter(Boolean).length;
  const total = board.scenes.reduce((t, s) => t + s.seconds, 0) - (board.scenes.length - 1) * (10 / 30);
  return `CURRENT LENGTH: ${total.toFixed(1)} seconds. Per scene: ${board.scenes
    .map((s) => `${s.type} ${s.seconds}s (${words(s.voice)} words spoken${s.shot ? `, shows ${s.shot}` : ""})`)
    .join("; ")}. Speech runs at about 2.4 words a second; a scene lasts as long as its line plus about 0.8 s, and never less than its minimum (${Object.entries(MIN_SECONDS).map(([k, v]) => `${k} ${v}s`).join(", ")}). To make the video shorter, shorten voice lines or drop optional scenes or a feature; to make it longer, the reverse.`;
}

const conversation = (turns = []) =>
  turns.length ? turns.map((t) => `Creator: ${t.request}\nYou replied: ${t.reply || "(done)"}`).join("\n") : "(this is the first change)";

const PLAN_SCHEMA = obj(
  {
    understood: str,
    reply: str,
    retake: { type: "array", items: obj({ shot: str, why: str }, ["shot", "why"]) },
    capture: { type: "array", items: obj({ find: str, url: str }, ["find"]) },
    logo: str,
    logo_url: str,
    edit: str,
  },
  ["understood", "reply", "retake", "capture", "logo", "edit"]
);

/**
 * What the creator means, before anything is changed. People describe a
 * problem ("the pricing screen is blank") far more often than the fix, and
 * the first version of this took that as "remove the pricing scene". This
 * reads the request against the video as it is (the storyboard, the shots it
 * uses, the logo candidates) and says what to do: retake a screenshot,
 * photograph a section that was never taken, swap the logo, and what to
 * change in the storyboard; and writes the reply the creator will read.
 */
export async function planChange({ site, capture, dir, draft, board, request, turns = [] }) {
  const links = (capture.brand.navLinks || []).map((l) => `${l.text} → ${l.href}`).join("; ");
  const prompt = `You are the editor of a product launch video, talking with its creator in a chat. Work out what the creator means by their latest message, decide what to do, and write your reply. You do not rewrite the storyboard here; another step does that with your instructions.

WHAT CREATORS SAY: they write casually and usually describe a PROBLEM, not the fix. "X is missing", "X shows blank", "X looks wrong / broken / cut off / empty", "I can't see X" all mean: make X appear properly. Never remove something because the creator complained about it. Remove a scene only when they clearly ask to remove, cut, drop or skip it.

WHAT YOU CAN DO:
- retake: photograph a screenshot again, when one the video uses is blank, half-faded, cut off or shows the wrong part. Give its id and why. Look at the attached screenshots to judge.
- capture: photograph a part of the site that is not among the screenshots. "find" is the words to look for on the page (a heading, e.g. "pricing"); "url" is the page it is on, when it is not the homepage (only addresses on this site; pick from the site links below).
- logo: "keep", or the id of another candidate (look at the logo images) when the creator says the logo is wrong, or "link" with logo_url when they pasted a link to their logo image. If no candidate is their logo and they gave no link, keep it and ask them, in your reply, to paste a link to their logo image.
- edit: plain instructions for the storyboard rewrite: what to change, add or keep. When you retake or capture, say which scene should show the new screenshot (it will be marked NEW in the shot list). Say explicitly to keep every scene the creator did not ask to remove.

REPLY: what you tell the creator, written as done (the work happens before they read it): first person, friendly and plain, one or two short sentences, no version numbers, no promises you cannot keep. If something cannot be done (a page behind a login, a video the site does not have), say so honestly.

THE CONVERSATION SO FAR:
${conversation(turns)}

THE CREATOR'S NEW MESSAGE: ${request}

THE STORYBOARD NOW (scene slots; "shot" is the screenshot each scene shows):
${JSON.stringify(draft, null, 1)}

${timing(board)}

SCREENSHOTS (attached in order) and their elements:
${catalog(capture)}

LOGO: currently ${draft.logo || "L1"}. Candidates (attached after the screenshots): ${logoList(capture)}.

SITE LINKS: ${links || "none found"}
THE PRODUCT: ${site.url}. ${site.title}. ${site.description}

Return JSON.`;
  const parts = [{ text: prompt }, ...(await images(dir, capture))];
  const { json, usage } = await askJson({ parts, schema: PLAN_SCHEMA, label: "plan", temperature: 0.3 });
  return { plan: json, usage };
}

export async function refineBoard({ site, capture, dir, draft, board, request, plan = null, done = [], turns = [] }) {
  const prompt = `You are the creative director of a product launch video. Below is the current storyboard, the slots of a library of animated scenes, and a change the creator has asked for. Return the COMPLETE revised storyboard as JSON.

Change what is asked, and whatever else must change to meet it and keep the video consistent (a length target is met by rewriting lines, all of them if needed). Keep everything else exactly as it is, including voice lines that do not need to change (unchanged lines are reused, not re-recorded). Never drop a scene unless the instructions say to remove it. If something is asked that the library cannot do, do the closest thing it can.

THE CREATOR'S MESSAGE: ${request}
${plan ? `WHAT THEY MEAN: ${plan.understood}\nINSTRUCTIONS: ${plan.edit}\n` : ""}${done.length ? `ALREADY DONE FOR THIS CHANGE: ${done.join("; ")}\n` : ""}${turns.length ? `EARLIER CHANGES (already in the storyboard): ${turns.map((t) => `"${t.request}"`).join("; ")}\n` : ""}
CURRENT STORYBOARD:
${JSON.stringify(draft, null, 1)}

${timing(board)}

THE PRODUCT (for facts)
URL: ${site.url}
Site text:
<<<
${site.text.slice(0, 9000)}
>>>

SCREENSHOTS (attached in order) and their elements:
${catalog(capture)}

BRAND (measured): ${brandFacts(capture)}

${LOGO_RULE(capture)} Keep the current logo (${draft.logo || "L1"}) unless the instructions say otherwise.

${LIBRARY}

${RULES}`;
  const parts = [{ text: prompt }, ...(await images(dir, capture))];
  const { json, usage } = await askJson({ parts, schema: boardSchema(capture), label: "refine", temperature: 0.5 });
  return { draft: json, usage };
}

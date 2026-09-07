/**
 * promptResearchService.js: turn "make something about the RBI rate decision"
 * into real, citable sources.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * Idea mode lets a creator ask for anything, which collides head-on with the
 * rule the rest of this product is built around: every factual claim traces to
 * a source, and the model may not use its training. Held strictly, an Idea can
 * only ever say what the creator already typed, which is right for an opinion
 * piece or a product explainer and useless for "cover today's rate decision".
 *
 * The wrong fix is to relax the rule for this one screen. A hallucinated figure
 * does not become safe because the creator chose the topic, and they are about
 * to read it out loud in their own voice to their own audience.
 *
 * The right fix is to go and get the sources. That is all this file does: a
 * cheap model call to work out what to search for, the free news sources we
 * already run for the feed, then TinyFish to read the best of what comes back.
 * The output is a material block in exactly the shape a Discover story produces,
 * so the writer's fact rule stays strict and unchanged.
 *
 * ── IT IS ALLOWED TO FIND NOTHING ────────────────────────────────────────────
 * Plenty of briefs are not news. "Why founders should ship on Fridays" has no
 * coverage and never will, and neither does a brief about something that has
 * not happened yet. Coming back empty is a normal outcome, not an error: the
 * caller writes from the brief alone and refunds the lookup fee. Nothing here
 * ever throws at the request path, and nothing here is allowed to lose a script.
 */
import { GoogleGenAI } from "@google/genai";
import { fetchGoogleNews } from "./sources/googleNews.js";
import { fetchArticles } from "./tinyfishClient.js";

const MODEL = process.env.GEMINI_TEXT_MODEL || process.env.GEMINI_VIDEO_MODEL || "gemini-3.5-flash";

/** India by default: the creator writing in Hinglish about "the budget" means
 *  the Indian one, and a US-locale search would answer a different question. */
const DEFAULT_LOCALE = { hl: "en-IN", gl: "IN", ceid: "IN:en" };

/** How many stories are considered, and how many are read in full. Matched to
 *  what a single script can use: past four articles a Short repeats itself. */
const CONSIDER = 8;
const READ_IN_FULL = 4;
const PER_SOURCE_CHARS = 2800;

let _client = null;
function client() {
  if (_client) return _client;
  const key = String(process.env.AISTUDIO_KEY || "").split(",")[0].trim();
  if (!key) throw new Error("AISTUDIO_KEY is not set");
  _client = new GoogleGenAI({ apiKey: key });
  return _client;
}

/**
 * What to search for, given what the creator asked for.
 *
 * A model call rather than using the brief as the query directly, because the
 * two are different things. "make a video about how the new IT rules will kill
 * small creators" is an argument; the searchable event inside it is "India IT
 * rules creators". Handing Google News the whole sentence returns nothing, and
 * returning nothing is indistinguishable from a topic with no coverage.
 *
 * It also decides whether searching is worth doing at all. An evergreen brief
 * ("5 habits that make you a better editor") has no news behind it, and the
 * honest answer is to say so rather than to search, find unrelated headlines,
 * and write a script that drifts into somebody else's story.
 */
async function planSearch(brief) {
  const prompt = `A video creator wants to make a video. Here is what they asked for:

"""${String(brief).slice(0, 1500)}"""

Decide whether this needs CURRENT NEWS to write well, and if so, what to search for.

Needs news: a real event, a company, a policy, a launch, a price move, a result, anything where facts and figures from the last few days matter.
Does NOT need news: opinion, advice, how-to, personal story, evergreen explainer, motivation, a general concept with no recent event attached.

Return STRICT JSON only:
{
  "needs_news": true or false,
  "queries": ["1 to 3 short news search queries, 2-5 words each, the way someone would type them into a news site. Empty array if needs_news is false. No quotes, no operators, no company names unless the creator named one."],
  "topic": "a short neutral headline-style phrase naming the subject, in English"
}`;

  const res = await client().models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      temperature: 0.2,
      responseMimeType: "application/json",
      maxOutputTokens: 512,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const p = JSON.parse(res.text || "{}");
  return {
    needsNews: !!p.needs_news,
    queries: (Array.isArray(p.queries) ? p.queries : [])
      .map((q) => String(q || "").trim())
      .filter(Boolean)
      .slice(0, 3),
    topic: String(p.topic || "").trim(),
  };
}

/**
 * Research one brief.
 *
 * @param {string} brief   what the creator typed
 * @param {object} opts
 * @param {object} opts.locale  Google News locale, see services/categories.js
 * @returns {{ ok, facts, sources_used, topic, reason }}
 *   ok:false is a normal answer. `reason` says which normal answer it is, so
 *   the caller can tell the creator something true rather than "no results".
 */
export async function researchPrompt(brief, { locale = DEFAULT_LOCALE } = {}) {
  const empty = (reason) => ({ ok: false, facts: "", sources_used: [], topic: "", reason });

  const text = String(brief || "").trim();
  if (!text) return empty("empty_brief");

  let plan;
  try {
    plan = await planSearch(text);
  } catch (err) {
    console.warn(`[research] planning failed: ${err.message}`);
    return empty("plan_failed");
  }

  if (!plan.needsNews || !plan.queries.length) {
    console.log(`[research] "${text.slice(0, 60)}" needs no news, writing from the brief`);
    return empty("not_news");
  }

  // The same free source the feed's every category uses. No key, real freshness
  // window, and it takes an arbitrary query, which is exactly what we have.
  let items = [];
  try {
    items = await fetchGoogleNews(plan.queries, locale);
  } catch (err) {
    console.warn(`[research] search failed: ${err.message}`);
    return empty("search_failed");
  }

  // Newest first, deduped by headline. Google News answers overlapping queries
  // with overlapping stories, and three copies of one headline is three slots
  // spent saying the same thing.
  const seen = new Set();
  const picked = [];
  for (const it of items.sort((a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0))) {
    const key = String(it.title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    picked.push(it);
    if (picked.length >= CONSIDER) break;
  }

  if (!picked.length) {
    console.log(`[research] no coverage for [${plan.queries.join(", ")}]`);
    return empty("no_coverage");
  }

  // Free, and it fails soft: a page that will not open falls back to its
  // headline and snippet, exactly as the news path does.
  let articles = new Map();
  try {
    articles = await fetchArticles(
      picked.slice(0, READ_IN_FULL).map((i) => i.url).filter(Boolean),
      { maxChars: PER_SOURCE_CHARS }
    );
  } catch (err) {
    console.warn(`[research] article read failed, using snippets: ${err.message}`);
  }

  // ── EVERY HEADLINE AND NOT ONE FULL PAGE IS NOT RESEARCH ──────────────────
  // Google News links are redirectors, and a run where TinyFish opens none of
  // them leaves eight one-line snippets. That is thin enough that a script
  // built on it would be padding around headlines, which is precisely the
  // "written from nothing" outcome the creator is paying the lookup fee to
  // avoid. Better to hand back nothing, refund the fee, and write the honest
  // version from their brief.
  if (!articles.size) {
    console.log(`[research] found ${picked.length} headline(s) but read none in full, treating as no coverage`);
    return empty("unreadable");
  }

  const facts = picked
    .map((c, i) => {
      const full = c.url ? articles.get(c.url) : "";
      const body = full || (c.summary ? String(c.summary).slice(0, 300) : "");
      const kind = full ? "FULL ARTICLE" : "headline only";
      return `[${i + 1}] (${c.source} · ${kind}) ${c.title}${body ? `\n${body}` : ""}`;
    })
    .join("\n\n");

  console.log(
    `[research] "${plan.topic || text.slice(0, 40)}": ${articles.size} of ` +
    `${Math.min(READ_IN_FULL, picked.length)} read in full, ${picked.length} source(s), ~${facts.length} chars`
  );

  return {
    ok: true,
    facts,
    sources_used: picked.map((c) => c.url).filter(Boolean),
    topic: plan.topic,
    reason: "",
  };
}

export default { researchPrompt };

/**
 * sourceMaterial.js: whatever the script is written from, in one shape.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * There are now three ways to order a script, and there must still be exactly
 * one writer. Everything that makes scriptWriterService.js good, the verbatim
 * openings, the measured pace, the anti-tell rules, the grader that rewrites a
 * draft when it drifts off the creator's own numbers, is expensive to get right
 * and impossible to keep in step across three copies. A forked writer does not
 * fail loudly; it quietly produces worse scripts on two of the three screens,
 * and nobody notices for a month.
 *
 * So the writer takes a Material, and this file is the only place that knows
 * how a NewsItem, a YouTube video, five links, a pasted article or a typed idea
 * each turn into one:
 *
 *   { kind, title, angle, facts, factRule, sources_used, grounded }
 *
 * ── THE ONE THING THAT GENUINELY DIFFERS ─────────────────────────────────────
 * `factRule`. Everything else is presentation; this is the product's promise.
 * The news path can say "every claim must trace to the sources below" because
 * there are sources below. An Idea written from a one-line brief has none, and
 * pointing the same rule at an empty block would either produce nothing or,
 * far worse, invite the model to fill the gap from training. Those are two
 * different instructions and this is where they diverge, deliberately, in one
 * readable place rather than by accident across three prompts.
 */
import NewsItem from "../models/NewsItem.js";
import Source from "../models/Source.js";
import { fetchArticles } from "./tinyfishClient.js";
import { transcribeYouTube } from "./geminiClient.js";

// ── HOW MANY SOURCES GET READ IN FULL ────────────────────────────────────────
// Unchanged from where these lived in the writer. Reading pages costs nothing
// (see tinyfishClient.js); what it costs is input tokens and a few seconds, so
// the amount is matched to what the chosen length can actually use.
const DEEP_READ_FROM_SECONDS = parseInt(process.env.SCRIPT_DEEP_READ_FROM_SECONDS || "120", 10);
const SHORT_READ_SOURCES = parseInt(process.env.SCRIPT_SHORT_READ_SOURCES || "3", 10);
const DEEP_READ_SOURCES = parseInt(process.env.SCRIPT_DEEP_READ_SOURCES || "5", 10);
const SHORT_READ_CHARS = parseInt(process.env.SCRIPT_SHORT_READ_CHARS || "2500", 10);
const DEEP_READ_CHARS = parseInt(process.env.SCRIPT_DEEP_READ_CHARS || "3000", 10);

/* ── THE FACT RULES ────────────────────────────────────────────────────────
   Rule 2 of the writer's prompt. Two of them, because there are exactly two
   situations, and pretending otherwise is how a creator ends up reading an
   invented number to their audience. */

/**
 * There IS source material. Used by Discover, by every Import, and by an Idea
 * whose lookup found something. Carried over verbatim from the original prompt.
 */
export const GROUNDED_FACT_RULE = `FACTS. Every factual claim in the script must trace to a sentence in the source
   material above. Specifically:
   - You may not use anything you know about this topic from your training. Not
     background, not context, not "as everyone knows", not the history of the
     company, not what a product normally does, not what happened before this.
     If it is not in the source material, it does not exist for this script.
   - Invent no numbers, dates, prices, versions, percentages, benchmarks, names,
     job titles, quotes or place names.
   - Do not predict what happens next, do not estimate impact, do not say what
     it "means for" anyone. Those are claims too, and they are not in the sources.
   - If the sources are thin, write a shorter script about what IS known. A
     creator reading an invented fact aloud to their audience is the single worst
     thing this can do to them, and a short honest script beats a padded one.
   - Where the sources disagree or call something unconfirmed, say so the way
     this creator would say it.`;

/**
 * There is NO source material, only the creator's own brief. Idea mode, when
 * they did not ask for a lookup or the lookup came back empty.
 *
 * ── WHY THIS IS STILL STRICT ────────────────────────────────────────────────
 * The obvious reading of "just write me something about X" is "use what you
 * know", and that is precisely what this product must not do. A creator saying
 * a hallucinated statistic out loud, in their own voice, to their own audience,
 * is the worst outcome available here, and it does not become acceptable
 * because they typed the topic themselves.
 *
 * So the brief is treated as the source: their claims, their framing, their
 * opinion, expressed in their voice at the length they paid for. What the model
 * may add is language, structure and delivery. What it may not add is facts.
 * A script that is entirely the creator's own argument, well told, is a real
 * deliverable; one salted with plausible invented numbers is a liability.
 */
export const BRIEF_ONLY_FACT_RULE = `FACTS. The creator's brief above is the ONLY material you have, and you must
   not go outside it:
   - Write what THEY said, in their voice, at the length they asked for. Expand
     it with structure, phrasing and delivery, never with new information.
   - Invent no numbers, statistics, dates, prices, percentages, study results,
     company names, product names, people or quotes. Not one. If the brief does
     not contain a figure, the script does not contain a figure.
   - Do not add news, current events, or anything you believe to be recent. You
     have no way to check it and the creator is about to say it out loud.
   - Do not attribute claims to sources, reports, experts or "studies show".
     There are no sources here.
   - If the brief is too thin to fill the requested length honestly, make the
     creator's own point properly rather than padding it with invented detail:
     more examples of what THEY described, more of their reasoning, a better
     opening and close. A shorter honest script beats a padded one.`;

/**
 * The creator wrote and approved this themselves. Idea mode, after the review
 * step in services/sourceService.js.
 *
 * ── WHY IT IS NOT SIMPLY THE GROUNDED RULE ──────────────────────────────────
 * Both forbid invention, and that is the important half. What differs is tone.
 * The grounded rule is written for wire copy from eight outlets, so it tells
 * the model to hedge, to note where sources disagree, and to attribute. Pointed
 * at a creator's own approved explanation of candlestick patterns, that
 * produces a script that sounds unsure of things the creator is certain about
 * and keeps deferring to "sources" that do not exist.
 *
 * So: same prohibition, opposite confidence. This is the creator's own
 * knowledge about their own subject, checked by them, and the script should say
 * it the way they would say it.
 */
export const APPROVED_MATERIAL_FACT_RULE = `FACTS. The material above is the creator's own, written and checked by them
   for this video. Treat it as settled:
   - Say it with their confidence. Do not hedge it, do not attribute it to
     "sources" or "experts", do not add "reportedly" or "it is said that".
     There are no sources here and none are needed; this is what they know.
   - Use it ALL if the length allows. The examples, the comparisons and the
     reasoning in there are the video, not background for it.
   - Add nothing factual that is not above. No statistics, dates, prices,
     percentages, study results, company names or quotes beyond what they
     wrote. They checked what is there and they have not checked anything else,
     and they are about to say it out loud.
   - You may reorder it, tighten it, and choose what a shorter script leaves
     out. You may not extend it with new claims to fill a longer one; if the
     material cannot support the length, make their points properly rather than
     padding with invented detail.`;

/* ── Building one ──────────────────────────────────────────────────────────── */

/**
 * A ranked news story, plus every outlet that carried it.
 *
 * Lifted out of writeScript() unchanged in behaviour, with one improvement that
 * falls out of the move: the English twin and the packaging call now receive
 * THIS material instead of re-querying the coverage themselves. The twin used
 * to be written from 300-character snippets while the main script was written
 * from full articles, which is why it read thinner than the script it was
 * supposed to be a twin of.
 */
export async function materialFromNews(item, { seconds = 60 } = {}) {
  if (!item) throw new Error("Story not found.");

  // Scoped by category as well as cluster. cluster_id is the model's own story
  // key ("openai-astra-safety-risk"), which is only unique WITHIN a category;
  // unscoped, a finance story could pull a tech story's facts into its script.
  // NEWEST FIRST: the earliest write-up is the thinnest, filed before anyone
  // knew the details; the latest carries the numbers, the response and context.
  const coverage = item.cluster_id
    ? await NewsItem.find({ category: item.category, cluster_id: item.cluster_id })
        .select("source title summary url published_at")
        .sort({ published_at: -1 })
        .limit(8)
        .lean()
    : [item];

  // A 45 second Reel makes one point and three articles is already more than it
  // can use. An eight minute explainer needs sections that each say something
  // new, and five gives it enough distinct angles to build them from.
  const deep = seconds >= DEEP_READ_FROM_SECONDS;
  const readCount = deep ? DEEP_READ_SOURCES : SHORT_READ_SOURCES;
  const perSource = deep ? DEEP_READ_CHARS : SHORT_READ_CHARS;

  // Free, and it fails soft: anything unreadable falls back to the snippet the
  // collector already had, so a paywall costs detail, never a script.
  let articles = new Map();
  try {
    articles = await fetchArticles(
      coverage.slice(0, readCount).map((c) => c.url).filter(Boolean),
      { maxChars: perSource }
    );
  } catch (err) {
    console.warn(`[material] article read failed, using snippets: ${err.message}`);
  }

  const facts = coverage
    .map((c, i) => {
      const full = c.url ? articles.get(c.url) : "";
      const body = full || (c.summary ? c.summary.slice(0, 300) : "");
      // Labelled, so the writer can tell a full account from a one-line wire
      // snippet and lean on the one that actually says something.
      const kind = full ? "FULL ARTICLE" : "headline only";
      return `[${i + 1}] (${c.source} · ${kind}) ${c.title}${body ? `\n${body}` : ""}`;
    })
    .join("\n\n");

  console.log(
    `[material] news: ${articles.size} of ${Math.min(readCount, coverage.length)} read in full, ` +
    `${coverage.length} source(s) listed, ~${facts.length} chars`
  );

  return {
    kind: "news",
    title: item.title || "",
    angle: item.ai_angle || "",
    facts,
    factRule: GROUNDED_FACT_RULE,
    sources_used: coverage.map((c) => c.url).filter(Boolean),
    grounded: true,
  };
}

/**
 * Material a creator brought themselves.
 *
 * ── THE EXPENSIVE HALF HAPPENS HERE, ONCE ────────────────────────────────────
 * Links and pasted text are read during the free preview, so by the time this
 * runs their `facts` are already on the document. A video is not: Gemini
 * reading ten minutes of YouTube is the most expensive call this product makes,
 * and it is deliberately deferred until somebody has paid for a script.
 *
 * The result is written back to the Source, which is what makes every later
 * order from the same video free. The creator paid to read it once, at the
 * preview step (readCost in services/creditPricing.js), and this cache is what
 * stops the same material being read again on the second and third script.
 *
 * @param {object} doc  a Source document (lean or hydrated)
 */
export async function materialFromSource(doc) {
  if (!doc) throw new Error("Source not found.");

  const blocks = [];
  const used = [...(doc.sources_used || [])];

  // Already assembled by a previous order, or by the preview. Nothing to buy.
  if (doc.facts) {
    blocks.push(doc.facts);
  } else {
    // Pages and pasted text are assembled at preview time (sourceService.js),
    // so reaching here with neither means this source is video-only.
  }

  // ── The video, read once ──────────────────────────────────────────────────
  const videoUrl = doc.youtube?.url || "";
  if (videoUrl && !doc.video_read_at) {
    let transcript = null;
    try {
      transcript = await transcribeYouTube(videoUrl);
    } catch (err) {
      // Surfaced rather than swallowed. Unlike the news path there is no
      // snippet to fall back on: if the video was the only material, a script
      // written without it would be written from nothing. runScript() refunds
      // the whole order when this throws.
      console.error(`[material] video read failed for ${doc.youtube?.video_id}: ${err.message}`);
      const e = new Error(err.message);
      e.userMessage = err.userMessage ||
        "We couldn't read that video. Check it's public and try again, you haven't been charged.";
      throw e;
    }

    const label = doc.youtube.title || transcript.title || "the video";
    blocks.unshift(
      `[VIDEO] ${label}${doc.youtube.channel ? ` (${doc.youtube.channel})` : ""}\n` +
      `This is a full transcript of what is actually said in the video, in the ` +
      `language it was spoken in:\n${transcript.text}`
    );
    used.push(videoUrl);

    // Persisted so a regenerate at another length reuses it. Written before the
    // script is, so a later failure in the writer cannot cost the read twice.
    const merged = blocks.join("\n\n");
    await Source.updateOne(
      { _id: doc._id },
      {
        $set: {
          facts: merged,
          sources_used: [...new Set(used)],
          video_read_at: new Date(),
          updated_at: new Date(),
          ...(doc.youtube.title ? {} : { "youtube.title": transcript.title || "" }),
        },
      }
    ).catch((err) => console.warn(`[material] couldn't cache video read: ${err.message}`));

    console.log(
      `[material] video read: ${doc.youtube.duration_seconds}s of video, ` +
      `~${transcript.text.length} chars, ${transcript.language_label || "?"}`
    );
  }

  const facts = blocks.join("\n\n").trim();

  // ── Which rule applies ────────────────────────────────────────────────────
  // An Idea with no material of any kind is the one case that gets the brief
  // rule. Everything else has something real to point at, including an Idea
  // whose lookup succeeded.
  const grounded = !!facts;

  // The brief, when there is one, doubles as the angle: it is the creator
  // telling us what they want said, which is exactly what ai_angle is on the
  // news path. It is included in the material block too when it is all we have.
  const brief = String(doc.prompt || "").trim();

  // -- THE LAST GATE BEFORE THE WRITER ---------------------------------------
  // sourceService refuses an unreadable Import at preview time, so this should
  // be unreachable. It is here because the consequence of being wrong is the
  // worst outcome this product has. With no material and no brief, the block
  // below would hand the writer the string "THE CREATOR'S BRIEF:" and nothing
  // after it. That is not empty, so the writer's own guard would pass it, and
  // what comes back is a fluent, confident script made entirely of invention,
  // in the creator's own voice, for them to read out loud. runScript catches
  // this and refunds the whole order.
  if (!grounded && !brief) {
    const e = new Error("No material and no brief");
    e.userMessage = "There was nothing readable to write from. You haven't been charged.";
    throw e;
  }

  return {
    kind: doc.kind === "idea" ? "idea" : "import",
    title: doc.title || "",
    angle: doc.angle || brief || "",
    facts: grounded
      ? (brief ? `${facts}\n\nWHAT THE CREATOR WANTS THIS TO BE ABOUT:\n${brief}` : facts)
      : `THE CREATOR'S BRIEF:\n${brief}`,
    factRule: !grounded
      ? BRIEF_ONLY_FACT_RULE
      : doc.draft_approved_at
        ? APPROVED_MATERIAL_FACT_RULE
        : GROUNDED_FACT_RULE,
    sources_used: [...new Set(used)],
    grounded,
  };
}

/** One entry point, so callers never branch on which kind of order this is. */
export async function buildMaterial({ item = null, source = null, seconds = 60 }) {
  if (source) return materialFromSource(source);
  return materialFromNews(item, { seconds });
}

export default {
  buildMaterial, materialFromNews, materialFromSource,
  GROUNDED_FACT_RULE, BRIEF_ONLY_FACT_RULE, APPROVED_MATERIAL_FACT_RULE,
};

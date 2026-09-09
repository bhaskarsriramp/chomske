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

// Total article reads shared across every story in a bulletin, divided by the
// story count rather than spent per story. Ten stories at five reads each would
// be fifty fetches for a script that gives each of them forty seconds.
const BULLETIN_READ_BUDGET = parseInt(process.env.SCRIPT_BULLETIN_READ_BUDGET || "12", 10);

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
 * Several stories in one script. The grounded rule, plus containment.
 *
 * ── THE FAILURE THIS EXISTS TO STOP ─────────────────────────────────────────
 * A bulletin puts ten stories in one prompt, and a model reading ten adjacent
 * blocks of tech news will cheerfully carry a number from block three into block
 * seven. Both are phones, both have prices, and the sentence it produces is
 * fluent and completely wrong. On a single-story script this cannot happen,
 * because there is nothing else in the prompt to borrow from.
 *
 * It is also the hardest error for a creator to catch: they are reading their
 * own script aloud at speed, and "₹24,999" in the wrong paragraph looks exactly
 * like "₹24,999" in the right one. So the boundary is stated as the first rule,
 * in terms of the numbered blocks the material actually uses.
 */
export const BULLETIN_FACT_RULE = `FACTS. This script covers SEVERAL SEPARATE STORIES, and the single most
   important rule is that they do not leak into each other:
   - Each story block above is numbered. A claim made in the part of the script
     covering story N may come ONLY from the block labelled STORY N. Not from
     the block before it, not from the one after it.
   - Never move a price, a spec, a date, a version number or a company name from
     one story to another. Two of these stories being about phones does not make
     their numbers interchangeable, and this is the most likely way this script
     ends up wrong.
   - Do not invent a connection between two stories. If the sources do not say
     that one caused, resembles or responds to another, they are simply two
     things that happened today.
   - Everything in the grounded rule still applies within each block: no numbers,
     dates, prices, versions, benchmarks, names or quotes that are not written
     there, and nothing from your training about any of these subjects.
   - A story with thin material gets a SHORTER block, not invented detail. An
     honest twelve seconds on story six is correct; forty padded seconds is not.
   - Do not predict what happens next or say what any of it "means for" anyone.`;

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
  if (Array.isArray(item)) return materialFromStories(item, { seconds });
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
 * Several ranked stories, for one bulletin.
 *
 * ── WHY THIS IS NOT materialFromNews IN A LOOP ──────────────────────────────
 * Two reasons, and the second is the one that matters.
 *
 * The cheap reason is budget. A single story reads up to five articles in full.
 * Ten stories doing the same would be fifty article reads and an input block far
 * past what the writer can use well, for a script that gives each story about
 * forty seconds. So the per-story depth is divided by the number of stories:
 * a bulletin reads fewer sources per item, deliberately, because that is all
 * forty seconds of script can carry.
 *
 * The important reason is that the stories must stay SEPARATE. Concatenating ten
 * stories' facts into one block is how a bulletin ends up attributing Samsung's
 * price to the Xiaomi story: nothing in the text says where one story's facts
 * stop. So each arrives as its own labelled, numbered block, and the writer's
 * bulletin format is told to treat the numbering as a hard boundary.
 *
 * The order is the creator's order, preserved exactly. They picked what leads.
 */
export async function materialFromStories(items, { seconds = 60 } = {}) {
  const stories = (Array.isArray(items) ? items : []).filter(Boolean);
  if (!stories.length) throw new Error("No stories selected.");
  if (stories.length === 1) return materialFromNews(stories[0], { seconds });

  // Per story, not per script. Ten stories in eight minutes is roughly forty
  // seconds each, which one good source covers and five would only pad.
  const perStory = Math.max(1, Math.round(BULLETIN_READ_BUDGET / stories.length));
  const perSource = stories.length > 6 ? 1200 : SHORT_READ_CHARS;

  const blocks = [];
  const used = [];
  let readOk = 0;

  for (let i = 0; i < stories.length; i++) {
    const it = stories[i];

    const coverage = it.cluster_id
      ? await NewsItem.find({ category: it.category, cluster_id: it.cluster_id })
          .select("source title summary url published_at")
          .sort({ published_at: -1 })
          .limit(Math.max(2, perStory))
          .lean()
      : [it];

    let articles = new Map();
    try {
      articles = await fetchArticles(
        coverage.slice(0, perStory).map((c) => c.url).filter(Boolean),
        { maxChars: perSource }
      );
      readOk += articles.size;
    } catch (err) {
      console.warn(`[material] bulletin story ${i + 1} read failed: ${err.message}`);
    }

    const lines = coverage.map((c) => {
      const full = c.url ? articles.get(c.url) : "";
      const body = full || (c.summary ? c.summary.slice(0, 260) : "");
      return `  (${c.source}${full ? " · FULL ARTICLE" : " · headline only"}) ${c.title}${body ? `\n  ${body}` : ""}`;
    });

    // The numbered header is load-bearing, not decoration: it is what the
    // bulletin format points at when it says a story may only use its own facts.
    blocks.push(
      `━━━━━━ STORY ${i + 1} of ${stories.length} ━━━━━━\n` +
      `HEADLINE: ${it.title || ""}\n` +
      (it.ai_angle ? `ANGLE: ${it.ai_angle}\n` : "") +
      `FACTS FOR STORY ${i + 1} (nothing here belongs to any other story):\n` +
      lines.join("\n")
    );

    used.push(...coverage.map((c) => c.url).filter(Boolean));
  }

  console.log(
    `[material] bulletin: ${stories.length} stories, ${readOk} article(s) read in full, ` +
    `${perStory} source(s) per story, ~${blocks.join("").length} chars`
  );

  return {
    kind: "bulletin",
    title: stories[0]?.title || "",
    // No single angle: a bulletin's angle IS its running order, which the
    // creator already decided by choosing the order they selected in.
    angle: "",
    facts: blocks.join("\n\n"),
    factRule: BULLETIN_FACT_RULE,
    sources_used: [...new Set(used)],
    grounded: true,
    story_count: stories.length,
    story_titles: stories.map((s) => s.title || ""),
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
export async function buildMaterial({ item = null, source = null, items = null, seconds = 60 }) {
  if (source) return materialFromSource(source);
  // `items` is the bulletin path: several ranked stories, in the creator's own
  // chosen order. Falls through to the single-story path when only one arrived,
  // so the caller never has to branch on the count.
  if (Array.isArray(items) && items.length) return materialFromStories(items, { seconds });
  return materialFromNews(item, { seconds });
}

export default {
  buildMaterial, materialFromNews, materialFromStories, materialFromSource,
  GROUNDED_FACT_RULE, BRIEF_ONLY_FACT_RULE, APPROVED_MATERIAL_FACT_RULE,
  BULLETIN_FACT_RULE,
};

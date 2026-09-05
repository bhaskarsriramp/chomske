/**
 * newsBriefService.js — the 100-120 words a creator reads before deciding.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * The feed used to show a headline and a one-line angle, then a button that
 * spends a script generation. That asks someone to commit without knowing what
 * the story actually says. Nobody does that twice: they click once, get a script
 * about something they did not care about, and stop trusting the button.
 *
 * So every feed-visible story gets a short brief assembled from the coverage we
 * already hold. Enough to decide, not so much that reading the brief replaces
 * watching the sources.
 *
 * ── GROUNDING ────────────────────────────────────────────────────────────────
 * The model gets the collected titles and summaries and nothing else, and is
 * told in three places that its own knowledge is off limits. This is the same
 * rule the script writer runs under and it matters more here, because the brief
 * is what the creator BELIEVES before they read the sources. A confident
 * sentence invented from training data is worse than no brief at all: it is a
 * fact they will repeat on camera.
 *
 * Cost: roughly 800 input + 180 output tokens per story, once, then cached
 * forever on the cluster. Generated for feed-visible stories only.
 */
import { GoogleGenAI } from "@google/genai";
import NewsItem from "../models/NewsItem.js";
import { publishNewsEvent } from "./newsEvents.js";

const MODEL = process.env.GEMINI_BRIEF_MODEL || process.env.GEMINI_TEXT_MODEL || "gemini-3.5-flash";

// Below this there is not enough collected text to say anything a headline
// doesn't already say, and a model asked to write 110 words from two headlines
// will pad the gap with invention. Those stories keep an empty brief and the UI
// falls back to showing the summary it does have.
const MIN_SOURCE_CHARS = 180;

// A story gets this many attempts, ever. Two is enough to ride out a blip and
// few enough that a story the model simply cannot summarise stops costing money
// after the second try. The reader loses nothing: the pane falls back to the
// collected summary, which is what it shows for thin stories anyway.
const MAX_TRIES = parseInt(process.env.NEWS_BRIEF_MAX_TRIES || "2", 10);

// The score at which a story becomes worth writing a brief for. MUST match the
// feed's own floor (MIN_SCORE in src/components/News/NewsFeed.js). It was 6
// while the feed showed 5, so a story scoring exactly 5 was visible to readers
// and invisible to this — it never got a brief prepared, and generated one from
// scratch every single time somebody opened it.
const BRIEF_MIN_SCORE = parseInt(process.env.NEWS_BRIEF_MIN_SCORE || "5", 10);

let _client = null;
function client() {
  if (_client) return _client;
  const key = String(process.env.AISTUDIO_KEY || "").split(",")[0].trim();
  if (!key) throw new Error("AISTUDIO_KEY is not set");
  _client = new GoogleGenAI({ apiKey: key });
  return _client;
}

/**
 * In-flight generations, keyed by cluster. Two people opening the same story at
 * the same moment, or one pane remounting, would otherwise pay twice for the
 * identical brief. Process-local on purpose: the database cache is what makes
 * this correct across instances, this only trims the obvious duplicate.
 */
const inFlight = new Map();

function keyOf(item) {
  return item.cluster_id ? `${item.category}|${item.cluster_id}` : String(item._id);
}

/** Every row we hold for this story, oldest first. */
async function coverageFor(item) {
  if (!item.cluster_id) return [item];
  const rows = await NewsItem.find({ category: item.category, cluster_id: item.cluster_id })
    .select("source title summary url published_at")
    .sort({ published_at: 1 })
    .limit(10)
    .lean();
  return rows.length ? rows : [item];
}

function buildPrompt(item, coverage) {
  const facts = coverage
    .map((c, i) => `[${i + 1}] (${c.source}) ${c.title}${c.summary ? `\n    ${c.summary.slice(0, 500)}` : ""}`)
    .join("\n");

  return `You are a news desk assistant. Write a short brief on ONE story for a video creator who is deciding whether to cover it.

════════ THE ONLY MATERIAL YOU MAY USE ════════
Headline: ${item.title}

${facts}
════════ END OF MATERIAL ════════

Write 100-120 words of plain prose explaining what actually happened.

HARD RULES:
1. Use ONLY the material above. You have no other knowledge of this story. If you
   know something about this topic from anywhere else, you must not use it.
2. Invent nothing. No numbers, dates, names, quotes, percentages or company
   details that are not written above. If the material does not say who, when or
   how much, do not fill the gap.
3. If the sources disagree or something is unconfirmed, say so plainly.
4. Do not speculate about consequences, do not predict, do not give an opinion,
   and do not suggest what the video should say.
5. No headline, no title, no bullet points, no bold. One or two paragraphs of
   prose a person can read in twenty seconds.
6. Neutral reporting voice. Never address the reader, never write "this story",
   "this article", "the sources say" or "in today's world".

If the material genuinely does not contain enough to write 100 words, write fewer
words rather than padding. Accuracy beats length.

Return STRICT JSON only:
{"brief": "the prose"}`;
}

/**
 * Get the brief for a story, generating and caching it if needed.
 *
 * @param {object} item  a NewsItem (lean doc is fine)
 * @returns {Promise<string>} the brief, or "" when there was too little to say
 */
export async function ensureBrief(item) {
  if (!item) return "";
  if (item.brief) return item.brief;

  // Out of attempts. One rule, covering every way a story ends up without a
  // brief: too little source text, a model failure, an unparseable reply. An
  // unrecorded failure is indistinguishable from never having tried, which is
  // what turned one broken story into a permanent line item on the bill.
  if ((item.brief_tries || 0) >= MAX_TRIES) return "";

  const key = keyOf(item);
  if (inFlight.has(key)) return inFlight.get(key);

  const job = generate(item).finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}

async function generate(item) {
  const coverage = await coverageFor(item);

  const sourceChars = coverage.reduce((n, c) => n + (c.summary || "").length, 0);
  if (sourceChars < MIN_SOURCE_CHARS) {
    // Stamped so we don't reconsider this story on every open. An empty brief is
    // a decision, not a missing value.
    await stamp(item, "");
    return "";
  }

  let res;
  try {
    res = await client().models.generateContent({
      model: MODEL,
      contents: buildPrompt(item, coverage),
      config: {
        // Low, but not zero: this is prose, and 0 produces the same four
        // sentence shapes for every story in the feed.
        temperature: 0.3,
        responseMimeType: "application/json",
        // 1024 was tight enough that a brief running slightly long came back as
        // truncated JSON, failed to parse, and — before the attempt counter
        // above — was retried forever. Headroom is free: only what is actually
        // generated is billed.
        maxOutputTokens: 4096,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
  } catch (err) {
    console.error(`[news-brief] Gemini call failed for ${item._id}:`, err.message);
    await stamp(item, "", { failed: true });
    return "";
  }

  let brief = "";
  try {
    brief = String(JSON.parse(res.text || "{}").brief || "").trim();
  } catch {
    const finish = res?.candidates?.[0]?.finishReason || "unknown";
    console.error(`[news-brief] unparseable response for ${item._id} · finishReason=${finish}`);
    await stamp(item, "", { failed: true });
    return "";
  }

  if (!brief) {
    await stamp(item, "", { failed: true });
    return "";
  }
  brief = brief.slice(0, 1200);

  await stamp(item, brief);

  const u = res.usageMetadata || {};
  console.log(
    `[news-brief] ${item.category}/${item.cluster_id || item._id} · ` +
    `${u.promptTokenCount || 0}+${u.candidatesTokenCount || 0} tokens`
  );

  return brief;
}

/**
 * Record the outcome on every row in the cluster, so whichever one represents
 * the story serves it — and so a failure is remembered rather than rediscovered.
 *
 * The attempt counter increments whether or not there is anything to show. That
 * is the whole point: an unrecorded failure is indistinguishable from never
 * having tried, which is what turned one broken story into a permanent line item.
 */
async function stamp(item, brief, { failed = false } = {}) {
  const filter = item.cluster_id
    ? { category: item.category, cluster_id: item.cluster_id }
    : { _id: item._id };
  await NewsItem.updateMany(filter, {
    $set: { brief, brief_at: new Date() },
    $inc: { brief_tries: 1 },
  }).catch(() => {});
  if (failed) console.warn(`[news-brief] attempt recorded as failed for ${item._id}`);
}

/**
 * Pre-generate briefs for the stories a feed will actually show.
 *
 * hasPendingBriefs() is the same question as a cheap existence check, asked
 * before a paid slot is claimed — a pass with nothing to rank may still have
 * briefs owed from a previous one that hit its per-pass cap, and skipping on the
 * ranking answer alone would strand those. See ensureRanked in newsScheduler.js.
 *
 * Called after each ranking pass so the brief is already there when someone
 * opens the story, instead of the pane sitting on a spinner. Capped per pass:
 * this is the one place in the collector loop that scales with content rather
 * than with a fixed batch, and an uncapped version would be the bill nobody
 * predicted on a busy news day.
 */
export async function hasPendingBriefs(categoryId, { minScore = BRIEF_MIN_SCORE, hours = 48 } = {}) {
  const since = new Date(Date.now() - hours * 3600000);
  return !!(await NewsItem.exists({
    category: categoryId,
    first_seen_at: { $gte: since },
    ai_score: { $gte: minScore },
    $or: [{ brief: { $exists: false } }, { brief: "" }],
    $and: [{ $or: [{ brief_tries: { $exists: false } }, { brief_tries: { $lt: MAX_TRIES } }] }],
  }));
}

export async function backfillBriefs(categoryId, { limit = 10, minScore = BRIEF_MIN_SCORE, hours = 48 } = {}) {
  const since = new Date(Date.now() - hours * 3600000);

  const rows = await NewsItem.find({
    category: categoryId,
    first_seen_at: { $gte: since },
    ai_score: { $gte: minScore },
    $or: [{ brief: { $exists: false } }, { brief: "" }],
    // Never re-pick a story that has already used its attempts. This was
    // `brief_at: null`, which excluded successes but not failures — so every
    // story the model choked on came back round on the next pass, and the one
    // after that, at six per category per pass, indefinitely.
    $and: [{ $or: [{ brief_tries: { $exists: false } }, { brief_tries: { $lt: MAX_TRIES } }] }],
  })
    .sort({ ai_score: -1, first_seen_at: -1 })
    .limit(limit * 3)          // room to skip duplicate cluster members
    .lean();

  const seen = new Set();
  let made = 0;

  for (const row of rows) {
    if (made >= limit) break;
    const key = keyOf(row);
    if (seen.has(key)) continue;
    seen.add(key);
    const brief = await ensureBrief(row);
    if (!brief) continue;
    made++;

    // ── PUSH IT, DON'T MAKE THEM WAIT FOR THE PASS ───────────────────────────
    // Briefs are written one at a time and the pass runs to fifteen, so under a
    // plain request the fifteenth story's reader waits on the other fourteen for
    // prose that was ready minutes ago. This hands each one over the moment it
    // exists.
    //
    // Keyed on the CLUSTER, matching what the feed sends as `story` — the brief
    // is written across every member (see the updateMany in ensureBrief), and
    // the row the feed happened to pick as representative is often not the row
    // the backfill happened to brief. `id` rides along for the unclustered case.
    publishNewsEvent({
      type: "news:brief",
      category: categoryId,
      story: row.cluster_id || String(row._id),
      id: String(row._id),
      brief,
    }).catch(() => {});
  }

  if (made) console.log(`[news-brief:${categoryId}] pre-generated ${made} brief(s)`);
  return made;
}

export default { ensureBrief, backfillBriefs };

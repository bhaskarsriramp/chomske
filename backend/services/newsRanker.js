/**
 * newsRanker.js — decide what an AI/tech creator should actually cover today.
 *
 * The collector's raw_score only knows recency, source type and upvotes. It has
 * no idea whether a story is *interesting*, and it can't tell "Google ships a new
 * Gemini model" from "Apple renames a lake on Maps" — both were in the top 12 of
 * a real run.
 *
 * That judgement is what this does, in ONE text call over the day's candidates.
 *
 * ── WHY ONE BATCHED CALL, NOT ONE PER ITEM ───────────────────────────────────
 * Per-item calls would be ~60 requests per pass. Batched, the whole ranking is a
 * few thousand input tokens — cents a day. It also lets the model see the items
 * TOGETHER, which is the only way it can tell that six of them are the same
 * launch and rank the cluster once.
 *
 * Thinking is off for the same measured reason as transcription (see
 * geminiClient.js): scoring headlines is judgement, not multi-step reasoning, and
 * thinking billed at the output rate for no quality gain.
 */
import { GoogleGenAI } from "@google/genai";
import NewsItem from "../models/NewsItem.js";

const MODEL = process.env.GEMINI_RANK_MODEL || process.env.GEMINI_VIDEO_MODEL || "gemini-3.5-flash";
const BATCH = parseInt(process.env.NEWS_RANK_BATCH || "60", 10);
const WINDOW_HOURS = parseInt(process.env.NEWS_RANK_WINDOW_HOURS || "36", 10);

let _client = null;
function client() {
  if (_client) return _client;
  const key = String(process.env.AISTUDIO_KEY || "").split(",")[0].trim();
  if (!key) throw new Error("AISTUDIO_KEY is not set");
  _client = new GoogleGenAI({ apiKey: key });
  return _client;
}

const PROMPT_HEAD = `You are the editor for a channel that covers AI and tech news for a general, curious audience — not researchers.

For EACH item below, decide how much it deserves a video TODAY.

score 0-10:
  9-10  A major, concrete event a lot of people will search for. A frontier model launch, a big acquisition, a serious outage/breach, a landmark lawsuit ruling.
  6-8   Genuinely interesting and specific: a notable release, a real benchmark result, a credible leak, a surprising study.
  3-5   Real but narrow — incremental updates, niche tooling, minor funding.
  0-2   Not video material: routine papers, listicles, opinion pieces, ads, press releases with no news, anything not actually about AI/tech.

Judge the EVENT, not the headline's excitement. Rules:
- A rumour or speculation piece scores well below a confirmed event.
- If several items are the same story, give them the SAME score — do not reward repetition.
- An item that is not about AI or tech at all scores 0, whatever its source.
- Prefer things with a concrete, demonstrable "what changed" over commentary about the industry.

For each item also give:
  "angle": one short line on what the video would actually be ABOUT — the hook, in plain words. Empty string if score < 3.
  "why": a few words on the reasoning behind the score.
  "story": a short lowercase-hyphenated key naming the underlying EVENT, not the headline. Items reporting the same event MUST get the exact same key, however differently they are worded — "OpenAI's Astra Model" and "OpenAI's Astra Sparks Safety Alarm" are both "openai-astra-safety-risk". Keep it 2-5 words.

Return STRICT JSON, an array with one object per item, in the same order:
[{"i": 0, "score": 7, "story": "openai-astra-safety-risk", "angle": "...", "why": "..."}]

ITEMS:`;

/**
 * Rank the current unranked candidates.
 * @returns {{ considered, ranked, usd, skipped }}
 */
export async function rankNews({ force = false } = {}) {
  const since = new Date(Date.now() - WINDOW_HOURS * 3600000);

  const query = { first_seen_at: { $gte: since } };
  if (!force) query.ai_score = -1;   // only what hasn't been judged yet

  // One representative per cluster: ranking six copies of one launch wastes
  // tokens and produces six near-identical scores. The score is applied back to
  // the whole cluster afterwards.
  const candidates = await NewsItem.find(query)
    .sort({ raw_score: -1 })
    .limit(BATCH * 3)
    .lean();

  const byCluster = new Map();
  for (const c of candidates) {
    const key = c.cluster_id || c.title_sig || String(c._id);
    if (!byCluster.has(key)) byCluster.set(key, c);
  }
  const items = [...byCluster.values()].slice(0, BATCH);

  if (!items.length) return { considered: 0, ranked: 0, usd: 0, skipped: 0 };

  const list = items
    .map((it, i) => {
      const src = it.source_kind === "primary" ? `${it.source}, official` : it.source;
      const pts = it.meta?.points ? `, ${it.meta.points} pts` : "";
      return `[${i}] (${src}${pts}) ${it.title}${it.summary ? ` — ${it.summary.slice(0, 160)}` : ""}`;
    })
    .join("\n");

  let res;
  try {
    res = await client().models.generateContent({
      model: MODEL,
      contents: `${PROMPT_HEAD}\n${list}`,
      config: {
        temperature: 0.2,
        responseMimeType: "application/json",
        maxOutputTokens: 32768,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
  } catch (err) {
    console.error("[news-rank] Gemini call failed:", err.message);
    return { considered: items.length, ranked: 0, usd: 0, skipped: items.length, error: err.message };
  }

  let verdicts;
  try {
    verdicts = JSON.parse(res.text || "[]");
    if (!Array.isArray(verdicts)) throw new Error("not an array");
  } catch (err) {
    console.error("[news-rank] unparseable response:", err.message);
    return { considered: items.length, ranked: 0, usd: 0, skipped: items.length };
  }

  let ranked = 0;
  for (const v of verdicts) {
    const item = items[Number(v?.i)];
    if (!item) continue;
    const score = Math.max(0, Math.min(10, Number(v.score) || 0));

    // Applied to the whole lexical cluster, so every copy of one story carries
    // the same verdict and the feed can collapse them without the score
    // depending on which copy happened to be the representative.
    const filter = item.cluster_id
      ? { cluster_id: item.cluster_id }
      : { _id: item._id };

    const set = {
      ai_score: score,
      ai_angle: String(v.angle || "").slice(0, 300),
      ai_reason: String(v.why || "").slice(0, 200),
      ranked_at: new Date(),
    };

    // RE-CLUSTER ON THE MODEL'S STORY KEY. titleSignature only catches stories
    // whose WORDING overlaps, so "OpenAI's Astra Model" and "OpenAI's Astra
    // Sparks AI Safety Alarm Bells" stayed two clusters and both surfaced at
    // 9/10 — the same story twice at the top of the feed. The model already knew
    // they were one event (it wrote both the same angle), so its key is a better
    // cluster than anything lexical. Overwrites cluster_id when supplied.
    const story = String(v.story || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
    if (story) set.cluster_id = story;

    await NewsItem.updateMany(filter, { $set: set }).catch(() => {});
    ranked++;
  }

  const u = res.usageMetadata || {};
  const inTok = u.promptTokenCount || 0;
  const outTok = (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0);
  const usd =
    (inTok / 1e6) * parseFloat(process.env.GEMINI_USD_PER_M_INPUT || "1.50") +
    (outTok / 1e6) * parseFloat(process.env.GEMINI_USD_PER_M_OUTPUT || "9.00");

  console.log(
    `[news-rank] ${ranked}/${items.length} clusters scored · ${inTok}+${outTok} tokens · $${usd.toFixed(4)}`
  );

  return { considered: items.length, ranked, usd, skipped: items.length - ranked };
}

export default { rankNews };

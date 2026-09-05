/**
 * newsRanker.js — decide what a creator should actually cover today.
 *
 * The collector's raw_score only knows recency, source type and upvotes. It has
 * no idea whether a story is *interesting*, and it can't tell "Google ships a new
 * Gemini model" from "Apple renames a lake on Maps" — both were in the top 12 of
 * a real run.
 *
 * ── TWO STAGES, AND WHY ──────────────────────────────────────────────────────
 * This used to be one call that asked, for every candidate, a score AND a story
 * key AND an angle AND a reason. About 45 output tokens each. Output is billed
 * at six times the input rate, so nearly all the money went on writing editorial
 * copy — and roughly seven items in ten score below 3 and are never shown to
 * anyone. We were paying to write angles for noise.
 *
 *   Stage 1 (triage)  every candidate, `{i, score}` only. ~10 output tokens.
 *   Stage 2 (detail)  only what cleared the bar, the story key, angle and why.
 *
 * Same feed, roughly a third of the ranking cost. It also degrades better than
 * the single call did: if stage 2 fails, every item still carries a real score,
 * so the feed works and only the one-line angles are missing. Before, one bad
 * response lost the whole pass.
 *
 * Thinking is off for the same measured reason as transcription (see
 * geminiClient.js): scoring headlines is judgement, not multi-step reasoning, and
 * thinking billed at the output rate for no quality gain.
 */
import { GoogleGenAI } from "@google/genai";
import NewsItem from "../models/NewsItem.js";
import { getCategory } from "./categories.js";

const MODEL = process.env.GEMINI_RANK_MODEL || process.env.GEMINI_VIDEO_MODEL || "gemini-3.5-flash";
const BATCH = parseInt(process.env.NEWS_RANK_BATCH || "60", 10);
const WINDOW_HOURS = parseInt(process.env.NEWS_RANK_WINDOW_HOURS || "36", 10);

// The floor for earning stage 2. Deliberately one below the feed's own cut, so
// a story sitting on the boundary still gets an angle written and a borderline
// judgement never costs a creator the context.
const DETAIL_MIN = parseInt(process.env.NEWS_DETAIL_MIN_SCORE || "4", 10);

const USD_IN = parseFloat(process.env.GEMINI_USD_PER_M_INPUT || "1.50");
const USD_OUT = parseFloat(process.env.GEMINI_USD_PER_M_OUTPUT || "9.00");

let _client = null;
function client() {
  if (_client) return _client;
  const key = String(process.env.AISTUDIO_KEY || "").split(",")[0].trim();
  if (!key) throw new Error("AISTUDIO_KEY is not set");
  _client = new GoogleGenAI({ apiKey: key });
  return _client;
}

/**
 * The editorial brief is built per category, because "does this deserve a video"
 * is a domain judgement, not a general one. An RBI rate decision is a 10 to a
 * finance channel and a 0 to a film channel, and a single generic prompt would
 * flatten both into "is this interesting" — which is how a ranker ends up putting
 * a lake being renamed on Apple Maps in the top twelve.
 */
export function buildPrompt(cat) {
  return `You are the editor for a channel that covers ${cat.editor}.

For EACH item below, decide how much it deserves a video TODAY.

score 0-10:
  9-10  A major, concrete event a lot of people will search for. ${cat.top}
  6-8   Genuinely interesting and specific. ${cat.mid}
  3-5   Real but narrow — incremental updates, minor developments.
  0-2   Not video material. ${cat.low} Also anything outside this channel's subject.

Judge the EVENT, not the headline's excitement. Rules:
- A rumour or speculation piece scores well below a confirmed event.
- If several items are the same story, give them the SAME score — do not reward repetition.
- An item outside this channel's subject scores 0, whatever its source.
- Prefer things with a concrete, demonstrable "what changed" over commentary.
${cat.caution ? `\n${cat.caution}\n` : ""}
Return STRICT JSON, an array with one object per item, in the same order, and
NOTHING else. No angle, no explanation, no prose — only the number:
[{"i": 0, "score": 7}, {"i": 1, "score": 2}]

ITEMS:`;
}

/**
 * Stage 2 only ever sees items that already scored. It is not asked to
 * reconsider the score: re-deciding here would let an item's rank change
 * depending on which of two calls happened to look at it last.
 */
export function buildDetailPrompt(cat, existingKeys = []) {
  // ── WHY THE MODEL IS SHOWN THE KEYS IT ALREADY COINED ──────────────────────
  // The story key IS the cluster, and it is invented fresh on every pass. Asked
  // twice about the same event four hours apart, the model would coin
  // "nvidia-buys-hugging-face" once and "nvidia-hugging-face-acquisition" the
  // next time — and since nothing ever re-merges clusters, one acquisition
  // became three cards carrying 4, 18 and 20 sources, all near the top of the
  // feed. Handing back the keys already in use turns the second pass into a
  // lookup rather than a fresh invention. Costs a few dozen input tokens.
  const known = existingKeys.length
    ? `\nSTORY KEYS ALREADY IN USE for recent items in this category. If an item
below is the SAME EVENT as one of these, return that key EXACTLY as written —
character for character — rather than inventing a new one. Only coin a new key
when the event genuinely is not in this list:
${existingKeys.map((k) => `  ${k}`).join("\n")}\n`
    : "";

  return `You are the editor for a channel that covers ${cat.editor}.

These items have already been judged worth covering. For EACH one give:

  "story": a short lowercase-hyphenated key naming the underlying EVENT, not the
           headline. Items reporting the same event MUST get the exact same key,
           however differently they are worded — "OpenAI's Astra Model" and
           "OpenAI's Astra Sparks Safety Alarm" are both
           "openai-astra-safety-risk". Keep it 2-5 words.
${known}
  "angle": one short line on what the video would actually be ABOUT — the hook,
           in plain words.
  "why":   a few words on why it is worth covering.

Do not re-score anything. Do not add items. Do not drop items.

Return STRICT JSON, an array with one object per item, in the same order:
[{"i": 0, "story": "openai-astra-safety-risk", "angle": "...", "why": "..."}]

ITEMS:`;
}

/** One line per item, in the shape both stages read. */
function renderList(items) {
  return items
    .map((it, i) => {
      const src = it.source_kind === "primary" ? `${it.source}, official` : it.source;
      const pts = it.meta?.points ? `, ${it.meta.points} pts` : "";
      return `[${i}] (${src}${pts}) ${it.title}${it.summary ? ` — ${it.summary.slice(0, 160)}` : ""}`;
    })
    .join("\n");
}

function costOf(res) {
  const u = res?.usageMetadata || {};
  const inTok = u.promptTokenCount || 0;
  const outTok = (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0);
  return { inTok, outTok, usd: (inTok / 1e6) * USD_IN + (outTok / 1e6) * USD_OUT };
}

async function askJson(contents, maxOutputTokens) {
  return client().models.generateContent({
    model: MODEL,
    contents,
    config: {
      temperature: 0.2,
      responseMimeType: "application/json",
      maxOutputTokens,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
}

function parseArray(res, label, categoryId) {
  try {
    const out = JSON.parse(res.text || "[]");
    if (!Array.isArray(out)) throw new Error("not an array");
    return out;
  } catch (err) {
    console.error(`[news-rank:${categoryId}] ${label} response unparseable: ${err.message}`);
    return null;
  }
}

/**
 * Is there anything here that has been collected but not yet judged?
 *
 * ── WHY THIS IS ASKED BEFORE THE COOLDOWN IS TAKEN ───────────────────────────
 * rankNews already returns for free when it finds nothing — the early return
 * above the first API call means an empty pass costs a Mongo query and no
 * tokens. What it does NOT do is give the cooldown back, and ensureRanked claims
 * that cooldown before it knows whether there is any work. So an empty pass used
 * to burn the category's ten-minute slot, and a story landing a minute later
 * waited nine minutes for a pass that had already been spent on nothing.
 *
 * That was survivable while ranking only fired from a button. It is not now that
 * a sign-in and a stale feed can both trigger it: the likeliest sequence is a
 * page load claiming the slot for zero items, immediately followed by the fetch
 * that actually brings news in — and finding itself throttled.
 *
 * One indexed existence check, covered by { category, first_seen_at, ai_score }.
 */
export async function hasUnranked(categoryId) {
  const since = new Date(Date.now() - WINDOW_HOURS * 3600000);
  return !!(await NewsItem.exists({
    category: categoryId,
    first_seen_at: { $gte: since },
    ai_score: -1,
  }));
}

/**
 * Rank the current unranked candidates.
 * @returns {{ considered, ranked, detailed, usd, skipped }}
 */
export async function rankNews(categoryId, { force = false } = {}) {
  const cat = getCategory(categoryId);
  if (!cat) return { considered: 0, ranked: 0, detailed: 0, usd: 0, skipped: 0 };

  const since = new Date(Date.now() - WINDOW_HOURS * 3600000);

  // Scoped to the category so one domain's stories are never judged by another
  // domain's editorial bar, and so each pass stays inside one batch.
  const query = { category: categoryId, first_seen_at: { $gte: since } };
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

  if (!items.length) return { considered: 0, ranked: 0, detailed: 0, usd: 0, skipped: 0 };

  /* ── Stage 1: score everything ──────────────────────────────────────── */

  let res1;
  try {
    // ~12 output tokens an item; the ceiling is generous because a truncated
    // JSON array is salvaged as nothing, and a silent truncation would look
    // exactly like the model declining to rank the tail of the list.
    res1 = await askJson(`${buildPrompt(cat)}\n${renderList(items)}`, 8192);
  } catch (err) {
    console.error(`[news-rank:${categoryId}] triage call failed:`, err.message);
    return { considered: items.length, ranked: 0, detailed: 0, usd: 0, skipped: items.length, error: err.message };
  }

  const verdicts = parseArray(res1, "triage", categoryId);
  if (!verdicts) {
    const c = costOf(res1);
    return { considered: items.length, ranked: 0, detailed: 0, usd: c.usd, skipped: items.length };
  }

  const scored = [];          // [{ item, score }] in the order the model returned
  const ops = [];
  for (const v of verdicts) {
    const item = items[Number(v?.i)];
    if (!item) continue;
    const score = Math.max(0, Math.min(10, Number(v.score) || 0));
    scored.push({ item, score });

    // Applied to the whole lexical cluster, so every copy of one story carries
    // the same verdict and the feed can collapse them without the score
    // depending on which copy happened to be the representative.
    ops.push({
      updateMany: {
        filter: item.cluster_id
          ? { category: categoryId, cluster_id: item.cluster_id }
          : { _id: item._id },
        update: { $set: { ai_score: score, ranked_at: new Date() } },
      },
    });
  }

  // One round trip instead of one per story. At 60 clusters the loop version was
  // 60 sequential awaits, which took longer than the model call it followed.
  if (ops.length) await NewsItem.bulkWrite(ops, { ordered: false }).catch(() => {});

  /* ── Stage 2: write angles for what cleared the bar ─────────────────── */

  const keep = scored.filter((s) => s.score >= DETAIL_MIN);
  let detailed = 0;
  let res2 = null;

  if (keep.length) {
    const keepItems = keep.map((k) => k.item);

    // The keys already standing in this category's recent window. Model-coined
    // keys only: a lexical title_sig would flood the list with near-duplicates
    // and teach it the wrong shape. Capped, because this is a hint, not a
    // catalogue — and the newest are the ones a fresh item is likely to match.
    let existingKeys = [];
    try {
      const recent = await NewsItem.find({
        category: categoryId,
        first_seen_at: { $gte: since },
        ai_score: { $gte: DETAIL_MIN },
        ai_angle: { $ne: "" },          // written by stage 2, so the key is one of ours
        cluster_id: { $ne: "" },
      })
        .sort({ first_seen_at: -1 })
        .limit(200)
        .select("cluster_id")
        .lean();
      existingKeys = [...new Set(recent.map((r) => r.cluster_id).filter(Boolean))].slice(0, 40);
    } catch (err) {
      // A hint that fails to load is a hint we go without.
      console.warn(`[news-rank:${categoryId}] couldn't read existing story keys: ${err.message}`);
    }

    try {
      res2 = await askJson(`${buildDetailPrompt(cat, existingKeys)}\n${renderList(keepItems)}`, 16384);
      const details = parseArray(res2, "detail", categoryId);

      if (details) {
        const ops2 = [];
        for (const d of details) {
          const item = keepItems[Number(d?.i)];
          if (!item) continue;

          const set = {
            ai_angle: String(d.angle || "").slice(0, 300),
            ai_reason: String(d.why || "").slice(0, 200),
          };

          // RE-CLUSTER ON THE MODEL'S STORY KEY. titleSignature only catches
          // stories whose WORDING overlaps, so "OpenAI's Astra Model" and
          // "OpenAI's Astra Sparks AI Safety Alarm Bells" stayed two clusters and
          // both surfaced at 9/10 — the same story twice at the top of the feed.
          // The model already knows they are one event, so its key is a better
          // cluster than anything lexical.
          const story = String(d.story || "").trim().toLowerCase()
            .replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
          if (story) set.cluster_id = story;

          ops2.push({
            updateMany: {
              filter: item.cluster_id
                ? { category: categoryId, cluster_id: item.cluster_id }
                : { _id: item._id },
              update: { $set: set },
            },
          });
          detailed++;
        }
        if (ops2.length) await NewsItem.bulkWrite(ops2, { ordered: false }).catch(() => {});
      }
    } catch (err) {
      // Scores are already written. The feed still ranks correctly; the cards
      // just show no angle line until the next forced pass.
      console.error(`[news-rank:${categoryId}] detail call failed (scores kept):`, err.message);
    }
  }

  const c1 = costOf(res1);
  const c2 = res2 ? costOf(res2) : { inTok: 0, outTok: 0, usd: 0 };
  const usd = c1.usd + c2.usd;

  console.log(
    `[news-rank:${categoryId}] ${scored.length}/${items.length} scored, ${detailed} detailed · ` +
    `${c1.inTok}+${c1.outTok} then ${c2.inTok}+${c2.outTok} tokens · $${usd.toFixed(4)}`
  );

  return {
    considered: items.length,
    ranked: scored.length,
    detailed,
    usd,
    skipped: items.length - scored.length,
  };
}

export default { rankNews };

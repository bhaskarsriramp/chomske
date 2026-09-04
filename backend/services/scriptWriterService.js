/**
 * scriptWriterService.js — today's story, written in one creator's voice.
 *
 * This is the product. Everything upstream (reading videos, collecting news,
 * ranking it) exists to make this one call good.
 *
 * ── THE TWO WAYS THIS FAILS ──────────────────────────────────────────────────
 * 1. It writes a correct script that sounds like nobody. Guarded by feeding the
 *    creator's VERBATIM openings and closings as anchors, not just a description
 *    of their style — a described style produces the average of all creators.
 * 2. It writes in the wrong language. A Hinglish creator receiving polished Hindi
 *    or English gets something they cannot read aloud. The language rule is stated
 *    three separate ways below for the same reason geminiClient.js repeats itself:
 *    "translate it nicely" is the single most likely helpful-but-fatal instinct.
 *
 * Facts come only from the coverage rows we already collected. The model is told
 * not to invent numbers, because a creator reading a fabricated benchmark aloud
 * to their audience is the worst thing this product could do to them.
 */
import { GoogleGenAI } from "@google/genai";
import NewsItem from "../models/NewsItem.js";
import { metricsBlock, gradeDraft } from "./voiceMetrics.js";
import { wordTarget } from "./creditPricing.js";

const MODEL = process.env.GEMINI_TEXT_MODEL || process.env.GEMINI_VIDEO_MODEL || "gemini-3.5-flash";

// Length is no longer a constant. It used to be a fixed 180-260 words for every
// script (SCRIPT_TARGET_WORDS), which could not serve a long-form order at all
// and was wrong per creator even for a Short — a word count is only a duration
// if you know the speaking rate. It is now derived per request from the seconds
// ordered and that creator's own measured pace: see the lengthRule block below.

let _client = null;
function client() {
  if (_client) return _client;
  const key = String(process.env.AISTUDIO_KEY || "").split(",")[0].trim();
  if (!key) throw new Error("AISTUDIO_KEY is not set");
  _client = new GoogleGenAI({ apiKey: key });
  return _client;
}

/**
 * Rules against the tells that make writing read as machine-made. Lifted from the
 * same problem in the reference project: models reach for a small set of
 * constructions ("it's not just X, it's Y", "in today's fast-paced world") that
 * are individually fine and collectively a signature. A creator's audience spots
 * this instantly, and it is the fastest way to make a good product feel cheap.
 */
const ANTI_TELL = `NEVER write like an AI. Specifically banned:
- "It's not just X, it's Y" and every variant of that construction.
- "In today's world", "in the fast-paced world of", "the landscape of".
- "Let's dive in", "buckle up", "game-changer", "revolutionary", "unprecedented".
- Starting with "So," as a filler unless the creator provably does it.
- Neat three-item lists where a real person would say two things or four.
- Perfectly balanced sentences. Real speech is lopsided.
- Summarising at the end what you just said.
- Any sentence that could appear in any video about any topic.`;

/**
 * Write one script.
 * @param {object} args
 * @param {object} args.profile   VoiceProfile document
 * @param {object} args.item      NewsItem document (the cluster representative)
 * @param {number} args.seconds   how long it should run when spoken. Priced per
 *   two seconds, so this is the number the creator paid against — writing 40
 *   seconds of script for an eight-minute order is a refund, not a style choice.
 * @returns {{ text, hook, title_suggestions, language, language_label, sources_used, usage }}
 */
export async function writeScript({ profile, item, seconds = 60 }) {
  if (!profile) throw new Error("No voice profile — transcribe a video first.");
  if (!item) throw new Error("Story not found.");

  // Every outlet that carried this story. More angles than the one headline, and
  // the only facts the model is allowed to use.
  // Scoped by category as well as cluster. cluster_id is the model's own story
  // key ("openai-astra-safety-risk"), which is only unique WITHIN a category —
  // unscoped, a finance story could pull a tech story's facts into its script.
  const coverage = item.cluster_id
    ? await NewsItem.find({ category: item.category, cluster_id: item.cluster_id })
        .select("source title summary url published_at")
        .sort({ published_at: 1 })
        .limit(8)
        .lean()
    : [item];

  const facts = coverage
    .map((c, i) => `[${i + 1}] (${c.source}) ${c.title}${c.summary ? `\n    ${c.summary.slice(0, 300)}` : ""}`)
    .join("\n");

  const language = profile.language_label || profile.language || "the creator's language";

  // ── LENGTH IS NOW MEASURED IN THEIR SECONDS, NOT IN WORDS ─────────────────
  // The old rule was a fixed 180-260 words for every script, which was two
  // separate mistakes. It could not serve an eight-minute order at all, and
  // even for a Short it was wrong per creator: a word count is only a duration
  // if you know the speaking rate, and the measured rate across these creators
  // runs from about 2 to nearly 5 words a second. At the fast end, 260 words is
  // under a minute; at the slow end it is nearly two, and a Short that runs
  // over is one that gets cut off mid-sentence.
  //
  // So the target is derived from the duration they ORDERED and their own
  // measured pace. The band is ±10% because a model told to hit an exact count
  // pads to reach it, and padding is the first thing an audience notices.
  const target = wordTarget(seconds, profile.metrics?.words_per_second);
  const mins = seconds >= 120 ? `${Math.round(seconds / 60)} minutes` : `${seconds} seconds`;
  const lengthRule =
    `${target.low}-${target.high} words — this script must run about ${mins} when spoken ` +
    `at their measured pace of ${target.wps} words per second. ` +
    (seconds >= 180
      ? `This is a LONG-FORM script: it needs real structure — an opening, two or three ` +
        `developed sections that each add something new from the source material, and their ` +
        `usual close. Do not pad, and do not repeat a point in different words to reach the ` +
        `count; if the sources cannot support this length, write the honest shorter version.`
      : `Every sentence has to earn its place at this length.`) +
    ` A spoken script, not an article: no headings, no bullet points, no stage directions, no "[pause]".`;

  const prompt = `You are ghostwriting a short video script for a specific creator. It must be indistinguishable from something they wrote themselves.

════════ THE CREATOR'S VOICE ════════
${profile.style_brief || "(no brief available)"}
${profile.metrics ? `
MEASURED FROM THEIR OWN VIDEOS — match these, they are not suggestions:
${metricsBlock(profile.metrics)}
` : ""}

They speak: ${language}${profile.language ? ` (${profile.language})` : ""}
Their usual stance: ${profile.sentiment || "unknown"}
Pacing: ${profile.pacing || "unknown"}
Talking to: ${profile.audience || "their audience"}

HOW THEY OPEN — study these, they are real openings from their own videos:
${bullets(profile.sample_openings) || "(none captured)"}

Opening patterns: ${list(profile.opening_patterns)}

HOW THEY CLOSE — real endings from their own videos:
${bullets(profile.sample_closings) || "(none captured)"}

Closing patterns: ${list(profile.closing_patterns)}

Phrases and fillers they genuinely use (work several in naturally, do not force all):
${list(profile.signature_phrases)}

Moves they reuse: ${list(profile.recurring_moves)}
How they mix languages: ${profile.vocabulary_notes || "match the transcripts exactly"}
How they structure a topic: ${profile.narration_arc || "unknown"}
They never: ${list(profile.avoid)}

════════ TODAY'S STORY ════════
Headline: ${item.title}
The angle to take: ${item.ai_angle || "(pick the strongest angle from the facts)"}

SOURCE MATERIAL BEGINS. This is the complete and only record of this story that
exists for you. Anything not written between these markers did not happen.
${facts}
SOURCE MATERIAL ENDS.

════════ RULES ════════
1. LANGUAGE. Write in ${language}, in the SAME script and the SAME code-mixing as the samples above. If their openings are in Devanagari with English words mixed in, the whole script must be Devanagari with English words mixed in. Do NOT translate. Do NOT transliterate into English letters. Do NOT write a cleaner or more formal version of how they talk.
2. FACTS. Every factual claim in the script must trace to a sentence in the source
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
     this creator would say it.
3. VOICE. Open the way THEY open — same energy and structure as their real openings, about today's story. Close the way THEY close. This is the whole job.
4. LENGTH. ${lengthRule}
5. ${ANTI_TELL}

Return STRICT JSON only:
{
  "hook": "the opening line(s), in their language and script — this must sound like them",
  "script": "the full script including the hook, in their language and script, paragraph breaks at natural pauses",
  "title_suggestions": ["3 video titles in their language, in their style"]
}`;

  // ── Write, grade, and correct ───────────────────────────────────────────
  //
  // The grader is the reason this is more than a good prompt. A draft is
  // measured on the same axes the profile was measured on — how much English is
  // in it, how long the sentences run, whether it asks the viewer anything — and
  // compared to the creator's own numbers. Where it has drifted, the specific
  // gap is handed back and the draft is rewritten once.
  //
  // This catches the failure that is hardest to see and most damaging: a script
  // that is fluent, accurate, on-topic, and sounds like a different person. No
  // human is checking every generation, and "match their style" in a prompt is
  // unfalsifiable. A number is not.
  let attempt = 0;
  let correction = "";
  let parsed = null;
  let text = "";
  let res = null;
  let usage = { input_tokens: 0, output_tokens: 0, thinking_tokens: 0, total_tokens: 0, usd: 0 };
  let drift = [];

  while (attempt < 2) {
    attempt++;

    try {
      res = await client().models.generateContent({
        model: MODEL,
        contents: correction ? `${prompt}\n\n${correction}` : prompt,
        config: {
          // Higher than the analysis passes: this is writing, and a near-zero
          // temperature here produces flat, safe copy that reads as generic.
          temperature: 0.9,
          responseMimeType: "application/json",
          maxOutputTokens: 8192,
          // Thinking off by default, matching the measured finding elsewhere in
          // this codebase. Script quality is the one place it might genuinely pay
          // for itself — set GEMINI_SCRIPT_THINKING to a budget and compare
          // output side by side before leaving it on, because it bills at the
          // output rate.
          thinkingConfig: {
            thinkingBudget: parseInt(process.env.GEMINI_SCRIPT_THINKING || "0", 10),
          },
        },
      });
    } catch (err) {
      console.error("[script] Gemini call failed:", err.message);
      const e = new Error(err.message);
      e.userMessage = "Couldn't write the script right now. Please try again.";
      throw e;
    }

    const u = readUsage(res);
    for (const k of Object.keys(usage)) usage[k] += u[k] || 0;

    const raw = res?.text || "";
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Same salvage logic as transcription: a long generation that stops
      // mid-JSON still contains a usable script, and throwing it away bills the
      // user twice.
      const salvaged = raw.match(/"script"\s*:\s*"([\s\S]*)$/);
      if (!salvaged) {
        const e = new Error("Unparseable script response");
        e.userMessage = "The script came back malformed. Please try again.";
        throw e;
      }
      parsed = { script: unescapeJsonish(salvaged[1]), hook: "", title_suggestions: [] };
    }

    text = String(parsed.script || "").trim();
    if (!text) {
      const e = new Error("Empty script");
      e.userMessage = "The model returned an empty script. Please try again.";
      throw e;
    }

    // Nothing to grade against on a profile built before metrics existed.
    if (!profile.metrics) break;

    const grade = gradeDraft(text, profile.metrics);
    drift = grade.drift;
    if (grade.ok) break;

    if (attempt >= 2) {
      // Kept anyway. A script that drifts on one axis is still usable, and a
      // second failed rewrite means the creator waits twice as long for nothing.
      console.warn(`[script] style drift persisted after retry: ${drift.join(" / ")}`);
      break;
    }

    console.log(`[script] rewriting once — ${drift.length} style gap(s)`);
    correction = [
      "════════ THAT DRAFT MISSED THEIR VOICE ════════",
      "You already wrote this once and it did not match how this person actually",
      "talks. Measured against their own videos:",
      "",
      ...drift.map((d) => `- ${d}`),
      "",
      "Write it again, same facts, same angle, fixing exactly these. Change nothing else.",
    ].join("\n");
  }

  return {
    text,
    hook: String(parsed.hook || "").trim(),
    title_suggestions: Array.isArray(parsed.title_suggestions)
      ? parsed.title_suggestions.map((t) => String(t || "").trim()).filter(Boolean).slice(0, 5)
      : [],
    language: profile.language || "",
    language_label: profile.language_label || "",
    sources_used: coverage.map((c) => c.url).filter(Boolean),
    // Accumulated across attempts, so a rewrite is visible in the bill rather
    // than reported as though it were a single call.
    usage,
    style_drift: drift,
  };
}

function list(a) {
  return Array.isArray(a) && a.length ? a.join(" · ") : "(unknown)";
}
function bullets(a) {
  return Array.isArray(a) && a.length ? a.map((s) => `  • "${s}"`).join("\n") : "";
}

function unescapeJsonish(s) {
  return s
    .replace(/"\s*[},\]]*\s*$/, "")
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .trim();
}

function readUsage(res) {
  const u = res?.usageMetadata || {};
  const input = Number(u.promptTokenCount) || 0;
  const output = Number(u.candidatesTokenCount) || 0;
  const thinking = Number(u.thoughtsTokenCount) || 0;
  const total = Number(u.totalTokenCount) || input + output + thinking;
  const inRate = parseFloat(process.env.GEMINI_USD_PER_M_INPUT || "1.50");
  const outRate = parseFloat(process.env.GEMINI_USD_PER_M_OUTPUT || "9.00");
  return {
    input_tokens: input,
    output_tokens: output,
    thinking_tokens: thinking,
    total_tokens: total,
    usd: (input / 1e6) * inRate + ((output + thinking) / 1e6) * outRate,
  };
}

/**
 * The English twin — the same story, for a global audience.
 *
 * ── WHY THIS EXISTS, IN ONE NUMBER ──────────────────────────────────────────
 * India-facing content earns roughly ₹50-200 per thousand views. The same story
 * in English, reaching US viewers, earns ₹650-3,300. Five to ten times, for one
 * more model call over research that has already been paid for. It is the
 * single most valuable thing this product can hand a creator, which is why it
 * is priced at half and not full.
 *
 * ── IT IS A REWRITE, NOT A TRANSLATION ──────────────────────────────────────
 * Translating the Hindi script word for word produces something no English
 * speaker would say — the idioms, the code-switching and the direct address all
 * arrive mangled. Worse, the references land wrong: an audience in the US does
 * not know the Indian brands, prices in rupees, or "as you know" framing that
 * assumed an Indian viewer. So the model is given the FACTS and the creator's
 * structural habits, and told to write the same story fresh for a different
 * room. Their energy survives; their language does not have to.
 *
 * @returns {{ text, hook, usage }|null} null on failure — the primary script is
 *   already written and delivered, and a failed twin must not lose it.
 */
export async function writeEnglishTwin({ profile, item, seconds = 60, sourceScript = "" }) {
  if (!item) return null;

  const coverage = item.cluster_id
    ? await NewsItem.find({ category: item.category, cluster_id: item.cluster_id })
        .select("source title summary url published_at")
        .sort({ published_at: 1 })
        .limit(8)
        .lean()
    : [item];

  const facts = coverage
    .map((c, i) => `[${i + 1}] (${c.source}) ${c.title}${c.summary ? `\n    ${c.summary.slice(0, 300)}` : ""}`)
    .join("\n");

  // English is measured at its own pace, not the creator's Hindi/Telugu rate.
  // Indic speech at 3 words a second is not 3 English words a second, and using
  // their measured figure here would produce a script that runs long.
  const target = wordTarget(seconds, 2.4);
  const mins = seconds >= 120 ? `${Math.round(seconds / 60)} minutes` : `${seconds} seconds`;

  const prompt = `Write a video script in ENGLISH for an international audience, covering the story below.

This creator already has a version in their own language. You are NOT translating it — you are writing the same story for a different room. Keep their energy and their structure; write natural English a US or global viewer would hear as normal.

════════ THE CREATOR'S HABITS (structure only, not language) ════════
How they open: ${list(profile?.opening_patterns) || "direct, straight into the story"}
How they close: ${list(profile?.closing_patterns) || "a short sign-off"}
Their stance: ${profile?.sentiment || "plain-spoken"}
Their audience: ${profile?.audience || "people who follow this topic"}
${sourceScript ? `\nTheir version of this script, for structure and emphasis ONLY — do not translate it:\n"""${String(sourceScript).slice(0, 2000)}"""\n` : ""}
SOURCE MATERIAL BEGINS. This is the complete and only record of this story.
${facts}
SOURCE MATERIAL ENDS.

════════ RULES ════════
1. ENGLISH ONLY. Natural, spoken, contemporary. No Hindi or Telugu words, no transliteration.
2. FACTS. Every claim must trace to the source material above. Invent no numbers, dates, prices, versions, names or quotes. Nothing from your training about this topic.
3. AUDIENCE. Written for someone with no Indian context. Do not assume they know Indian brands, prices, or references. Do not mention India unless the sources do.
4. LENGTH. ${target.low}-${target.high} words — about ${mins} spoken. A script, not an article: no headings, no bullets, no stage directions.
5. ${ANTI_TELL}

Return STRICT JSON only:
{
  "hook": "the opening line(s) in English",
  "script": "the full English script including the hook, paragraph breaks at natural pauses"
}`;

  try {
    const res = await client().models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        temperature: 0.85,
        responseMimeType: "application/json",
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    const parsed = JSON.parse(res.text || "{}");
    const text = String(parsed.script || "").trim();
    if (!text) return null;
    return { text, hook: String(parsed.hook || "").trim(), usage: readUsage(res) };
  } catch (err) {
    console.error("[script] english twin failed:", err.message);
    return null;
  }
}

/**
 * The packaging pack — everything the upload form asks for.
 *
 * The tedious twenty minutes after the script is finished: a title that earns
 * the click, a description nobody wants to write, hashtags, and the three or
 * four words that go on the thumbnail. vidIQ and TubeBuddy monetise exactly
 * this at $7.50-39 a month; here it is one call for a flat fifteen credits.
 *
 * Titles come back in BOTH languages because that is how these channels
 * actually publish — the title in their script's language, and an English one
 * for search, which is where discovery happens even for Indic-language videos.
 *
 * @returns {{ titles, description, hashtags, thumbnail_lines }|null}
 */
export async function writePackaging({ profile, item, script = "", language = "" }) {
  if (!script && !item) return null;

  const sources = item?.cluster_id
    ? await NewsItem.find({ category: item.category, cluster_id: item.cluster_id })
        .select("url source")
        .limit(6)
        .lean()
    : [];

  const prompt = `Write the upload package for this creator's video.

THE SCRIPT (this is what the video says):
"""${String(script).slice(0, 4000)}"""

They speak: ${language || profile?.language_label || "their own language"}
Story headline: ${item?.title || ""}

Return STRICT JSON only:
{
  "titles": ["5 title options. Mix: some in their language, at least 2 in English for search. Under 70 characters each. No clickbait they'd be embarrassed by, no ALL CAPS, no '(SHOCKING)'."],
  "description": "A YouTube description: 2-3 short paragraphs summarising what the video covers, written plainly. Then a blank line. Do NOT invent links, timestamps, or social handles.",
  "hashtags": ["8-12 hashtags, no # symbol, lowercase, mixing their language and English. Relevant to this story specifically, not generic 'viral trending' tags."],
  "thumbnail_lines": ["4 thumbnail text options. Three to five words MAX each — they have to be readable at phone size. In their language where it fits."]
}

Rules: every factual claim traces to the script above. Invent nothing. ${ANTI_TELL}`;

  try {
    const res = await client().models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        temperature: 0.85,
        responseMimeType: "application/json",
        maxOutputTokens: 3072,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    const p = JSON.parse(res.text || "{}");

    // The source links are appended by US, not written by the model — asked for
    // URLs it will happily invent plausible ones, and a description full of dead
    // links is worse than a description with none.
    const links = sources.map((s) => s.url).filter(Boolean).slice(0, 5);
    const description = [
      String(p.description || "").trim(),
      links.length ? `\nSources:\n${links.join("\n")}` : "",
    ].filter(Boolean).join("\n");

    return {
      titles: (Array.isArray(p.titles) ? p.titles : []).map((t) => String(t).slice(0, 100)).slice(0, 5),
      description: description.slice(0, 4000),
      hashtags: (Array.isArray(p.hashtags) ? p.hashtags : [])
        .map((h) => String(h).replace(/^#/, "").trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 12),
      thumbnail_lines: (Array.isArray(p.thumbnail_lines) ? p.thumbnail_lines : [])
        .map((t) => String(t).slice(0, 40))
        .slice(0, 4),
      usage: readUsage(res),
    };
  } catch (err) {
    console.error("[script] packaging failed:", err.message);
    return null;
  }
}

export default { writeScript, writeEnglishTwin, writePackaging };

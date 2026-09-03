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

const MODEL = process.env.GEMINI_TEXT_MODEL || process.env.GEMINI_VIDEO_MODEL || "gemini-3.5-flash";

// Roughly a 60-90 second script. Long enough to be a real video, short enough
// that a creator reads the whole thing instead of skimming and rewriting it.
const TARGET_WORDS = process.env.SCRIPT_TARGET_WORDS || "180-260";

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
 * @returns {{ text, hook, title_suggestions, language, language_label, sources_used, usage }}
 */
export async function writeScript({ profile, item }) {
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

  const prompt = `You are ghostwriting a short video script for a specific creator. It must be indistinguishable from something they wrote themselves.

════════ THE CREATOR'S VOICE ════════
${profile.style_brief || "(no brief available)"}

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
4. LENGTH. ${TARGET_WORDS} words, unless rule 2 forces it shorter. A spoken script, not an article: no headings, no bullet points, no stage directions, no "[pause]".
5. ${ANTI_TELL}

Return STRICT JSON only:
{
  "hook": "the opening line(s), in their language and script — this must sound like them",
  "script": "the full script including the hook, in their language and script, paragraph breaks at natural pauses",
  "title_suggestions": ["3 video titles in their language, in their style"]
}`;

  let res;
  try {
    res = await client().models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        // Higher than the analysis passes: this is writing, and a near-zero
        // temperature here produces flat, safe copy that reads as generic.
        temperature: 0.9,
        responseMimeType: "application/json",
        maxOutputTokens: 8192,
        // Thinking off by default, matching the measured finding elsewhere in this
        // codebase. Script quality is the one place it might genuinely pay for
        // itself — set GEMINI_SCRIPT_THINKING to a budget and compare output
        // side by side before leaving it on, because it bills at the output rate.
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

  const raw = res?.text || "";
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Same salvage logic as transcription: a long generation that stops mid-JSON
    // still contains a usable script, and throwing it away bills the user twice.
    const salvaged = raw.match(/"script"\s*:\s*"([\s\S]*)$/);
    if (!salvaged) {
      const e = new Error("Unparseable script response");
      e.userMessage = "The script came back malformed. Please try again.";
      throw e;
    }
    parsed = { script: unescapeJsonish(salvaged[1]), hook: "", title_suggestions: [] };
  }

  const text = String(parsed.script || "").trim();
  if (!text) {
    const e = new Error("Empty script");
    e.userMessage = "The model returned an empty script. Please try again.";
    throw e;
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
    usage: readUsage(res),
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

export default { writeScript };

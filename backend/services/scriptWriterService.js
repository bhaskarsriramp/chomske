/**
 * scriptWriterService.js: today's story, written in one creator's voice.
 *
 * This is the product. Everything upstream (reading videos, collecting news,
 * ranking it) exists to make this one call good.
 *
 * ── THE TWO WAYS THIS FAILS ──────────────────────────────────────────────────
 * 1. It writes a correct script that sounds like nobody. Guarded by feeding the
 *    creator's VERBATIM openings and closings as anchors, not just a description
 *    of their style, a described style produces the average of all creators.
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
import { metricsBlock, gradeDraft } from "./voiceMetrics.js";
import { wordTarget } from "./creditPricing.js";
import { noEmDash, noEmDashAll, dropDashes, trimTo } from "../utils/prose.js";

const MODEL = process.env.GEMINI_TEXT_MODEL || process.env.GEMINI_VIDEO_MODEL || "gemini-3.5-flash";

// Length is no longer a constant. It used to be a fixed 180-260 words for every
// script (SCRIPT_TARGET_WORDS), which could not serve a long-form order at all
// and was wrong per creator even for a Short: a word count is only a duration
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
- Any sentence that could appear in any video about any topic.
- Em-dashes. Not one, anywhere. A creator reads this out loud and a dash has
  no spoken form, and it is the clearest tell that a machine wrote it. Use a
  comma, a full stop, or start a new sentence.`;

/**
 * Write one script.
 *
 * ── IT NO LONGER KNOWS WHERE THE STORY CAME FROM ────────────────────────────
 * This used to take a NewsItem and fetch its own coverage, which quietly made
 * "a ranked news story" the only thing that could ever be written. It now takes
 * a Material (see services/sourceMaterial.js), so a video the creator pasted,
 * five links, an article they copied in and an idea they typed all arrive here
 * as the same shape and get the same voice, the same measured length, the same
 * anti-tell rules and the same grader.
 *
 * That is the whole point of the split. Every one of those behaviours took real
 * work to get right, and three screens each with their own writer would mean
 * three places to keep them right in.
 *
 * @param {object} args
 * @param {object} args.profile    VoiceProfile document
 * @param {object} args.material   what to write from, see sourceMaterial.js:
 *   { title, angle, facts, factRule, sources_used, grounded }
 * @param {number} args.seconds    how long it should run when spoken. Priced per
 *   two seconds, so this is the number the creator paid against, writing 40
 *   seconds of script for an eight-minute order is a refund, not a style choice.
 * @param {boolean} [opts.titles]  ask for title options too.
 *
 * ── WHY TITLES ARE AN OPTION AND NOT ALWAYS ON ───────────────────────────────
 * They used to come with every script, free, because they cost almost nothing
 * to add to a call that was being made anyway. That quietly undercut the paid
 * add-on: "Title, description & hashtags" is one option with one price, and
 * handing the titles over to somebody who chose not to buy it left that option
 * selling two of the three things its own label names. So the titles are part
 * of the package now, and a script ordered without it is not asked for them,
 * which also keeps them out of the response rather than merely off the screen.
 *
 * @returns {{ text, hook, title_suggestions, language, language_label, sources_used, usage }}
 */
export async function writeScript({ profile, material, seconds = 60, titles = false }) {
  if (!profile) throw new Error("No voice profile. Transcribe a video first.");
  if (!material) throw new Error("Nothing to write from.");

  const facts = material.facts || "";
  if (!facts.trim()) {
    // Reaching here means every read failed and nothing was caught upstream.
    // Writing anyway would produce invention, which is the one output this
    // product must never hand a creator to read aloud.
    const e = new Error("No material");
    e.userMessage = "There was nothing readable to write from. You haven't been charged.";
    throw e;
  }

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
    `${target.low}-${target.high} words. This script must run about ${mins} when spoken ` +
    `at their measured pace of ${target.wps} words per second. ` +
    (seconds >= 180
      ? `This is a LONG-FORM script: it needs real structure: an opening, two or three ` +
        `developed sections that each add something new from the source material, and their ` +
        `usual close. Do not pad, and do not repeat a point in different words to reach the ` +
        `count; if the sources cannot support this length, write the honest shorter version.`
      : `Every sentence has to earn its place at this length.`) +
    ` A spoken script, not an article: no headings, no bullet points, no stage directions, no "[pause]".`;

  const prompt = `You are ghostwriting a short video script for a specific creator. It must be indistinguishable from something they wrote themselves.

════════ THE CREATOR'S VOICE ════════
${profile.style_brief || "(no brief available)"}
${profile.metrics ? `
MEASURED FROM THEIR OWN VIDEOS. Match these, they are not suggestions:
${metricsBlock(profile.metrics)}
` : ""}

They speak: ${language}${profile.language ? ` (${profile.language})` : ""}
Their usual stance: ${profile.sentiment || "unknown"}
Pacing: ${profile.pacing || "unknown"}
Talking to: ${profile.audience || "their audience"}

HOW THEY OPEN. Study these, they are real openings from their own videos:
${bullets(profile.sample_openings) || "(none captured)"}

Opening patterns: ${list(profile.opening_patterns)}

HOW THEY CLOSE: real endings from their own videos:
${bullets(profile.sample_closings) || "(none captured)"}

Closing patterns: ${list(profile.closing_patterns)}

Phrases and fillers they genuinely use (work several in naturally, do not force all):
${list(profile.signature_phrases)}

Moves they reuse: ${list(profile.recurring_moves)}
How they mix languages: ${profile.vocabulary_notes || "match the transcripts exactly"}
How they structure a topic: ${profile.narration_arc || "unknown"}
They never: ${list(profile.avoid)}

════════ ${material.grounded ? "TODAY'S STORY" : "WHAT THEY WANT TO MAKE"} ════════
${material.title ? `Headline: ${material.title}
` : ""}The angle to take: ${material.angle || "(pick the strongest angle from the material)"}

SOURCE MATERIAL BEGINS. This is the complete and only record of this subject that
exists for you. Anything not written between these markers did not happen.
${facts}
SOURCE MATERIAL ENDS.

════════ RULES ════════
1. LANGUAGE. Write in ${language}, in the SAME script and the SAME code-mixing as the samples above. If their openings are in Devanagari with English words mixed in, the whole script must be Devanagari with English words mixed in. Do NOT translate. Do NOT transliterate into English letters. Do NOT write a cleaner or more formal version of how they talk.
2. ${material.factRule}
3. VOICE. Open the way THEY open, same energy and structure as their real openings, about this subject. Close the way THEY close. This is the whole job.
4. LENGTH. ${lengthRule}
5. ${ANTI_TELL}

Return STRICT JSON only:
{
  "hook": "the opening line(s), in their language and script. This must sound like them",
  "script": "the full script including the hook, in their language and script, paragraph breaks at natural pauses"${titles ? `,
  "title_suggestions": ["3 video titles in their language, in their style"]` : ""}
}`;

  // ── Write, grade, and correct ───────────────────────────────────────────
  //
  // The grader is the reason this is more than a good prompt. A draft is
  // measured on the same axes the profile was measured on (how much English is
  // in it, how long the sentences run, whether it asks the viewer anything) and
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
          // for itself, set GEMINI_SCRIPT_THINKING to a budget and compare
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

    text = noEmDash(parsed.script);
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

    console.log(`[script] rewriting once, ${drift.length} style gap(s)`);
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
    hook: noEmDash(parsed.hook),
    title_suggestions: titles ? noEmDashAll(parsed.title_suggestions).slice(0, 5) : [],
    language: profile.language || "",
    language_label: profile.language_label || "",
    sources_used: material.sources_used || [],
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
 * The English twin, the same story, for a global audience.
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
 * speaker would say, the idioms, the code-switching and the direct address all
 * arrive mangled. Worse, the references land wrong: an audience in the US does
 * not know the Indian brands, prices in rupees, or "as you know" framing that
 * assumed an Indian viewer. So the model is given the FACTS and the creator's
 * structural habits, and told to write the same story fresh for a different
 * room. Their energy survives; their language does not have to.
 *
 * @returns {{ text, hook, usage }|null} null on failure, the primary script is
 *   already written and delivered, and a failed twin must not lose it.
 */
export async function writeEnglishTwin({ profile, material, seconds = 60, sourceScript = "" }) {
  if (!material?.facts) return null;

  // -- IT READS THE SAME MATERIAL THE SCRIPT DID -----------------------------
  // This used to re-query the coverage itself and build its facts out of
  // 300-character summaries, while the main script was written from the full
  // articles TinyFish had already fetched. So the twin, sold as the same story
  // for a different audience and priced at half, was in fact written from
  // materially less: thinner, vaguer, and missing every number the script had.
  //
  // Sharing the material fixes that, removes a database round trip, and is what
  // lets the twin work at all for an Import, where the "coverage" is a video
  // transcript or a pasted article that no NewsItem query could ever find.
  const facts = material.facts;

  // English is measured at its own pace, not the creator's Hindi/Telugu rate.
  // Indic speech at 3 words a second is not 3 English words a second, and using
  // their measured figure here would produce a script that runs long.
  const target = wordTarget(seconds, 2.4);
  const mins = seconds >= 120 ? `${Math.round(seconds / 60)} minutes` : `${seconds} seconds`;

  const prompt = `Write a video script in ENGLISH for an international audience, covering the story below.

This creator already has a version in their own language. You are NOT translating it. You are writing the same story for a different room. Keep their energy and their structure; write natural English a US or global viewer would hear as normal.

════════ THE CREATOR'S HABITS (structure only, not language) ════════
How they open: ${list(profile?.opening_patterns) || "direct, straight into the story"}
How they close: ${list(profile?.closing_patterns) || "a short sign-off"}
Their stance: ${profile?.sentiment || "plain-spoken"}
Their audience: ${profile?.audience || "people who follow this topic"}
${sourceScript ? `\nTheir version of this script, for structure and emphasis ONLY. Do not translate it:\n"""${String(sourceScript).slice(0, 2000)}"""\n` : ""}
SOURCE MATERIAL BEGINS. This is the complete and only record of this subject.
${facts}
SOURCE MATERIAL ENDS.

════════ RULES ════════
1. ENGLISH ONLY. Natural, spoken, contemporary. No Hindi or Telugu words, no transliteration.
2. ${material.grounded
  ? "FACTS. Every claim must trace to the source material above. Invent no numbers, dates, prices, versions, names or quotes. Nothing from your training about this topic."
  : "FACTS. The creator's brief above is the only material you have. Make THEIR point, in English. Invent no numbers, statistics, dates, names, quotes or study results, and add no news or current events. Not one figure that is not already in the brief."}
3. AUDIENCE. Written for someone with no Indian context. Do not assume they know Indian brands, prices, or references. Do not mention India unless the sources do.
4. LENGTH. ${target.low}-${target.high} words, about ${mins} spoken. A script, not an article: no headings, no bullets, no stage directions.
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
    const text = noEmDash(parsed.script);
    if (!text) return null;
    return { text, hook: noEmDash(parsed.hook), usage: readUsage(res) };
  } catch (err) {
    console.error("[script] english twin failed:", err.message);
    return null;
  }
}

/**
 * The packaging pack, everything the upload form asks for.
 *
 * The tedious twenty minutes after the script is finished: a title that earns
 * the click, a description nobody wants to write, hashtags, and the three or
 * four words that go on the thumbnail. vidIQ and TubeBuddy monetise exactly
 * this at $7.50-39 a month; here it is one call for a flat fifteen credits.
 *
 * Titles come back in BOTH languages because that is how these channels
 * actually publish, the title in their script's language, and an English one
 * for search, which is where discovery happens even for Indic-language videos.
 *
 * @returns {{ titles, description, hashtags, thumbnail_lines }|null}
 */
export async function writePackaging({ profile, material, script = "", language = "" }) {
  if (!script) return null;

  // The links appended to the description come from whatever the script was
  // actually written from, so an Import's description cites the pages the
  // creator pasted and an Idea written from a brief alone cites nothing, which
  // is correct: there is nothing to cite. This used to run its own NewsItem
  // query, which meant it could only ever produce sources for a news story.
  const links = (material?.sources_used || []).filter(Boolean).slice(0, 5);

  const prompt = `Write the upload package for this creator's video.

THE SCRIPT (this is what the video says):
"""${String(script).slice(0, 4000)}"""

They speak: ${language || profile?.language_label || "their own language"}
Story headline: ${material?.title || ""}

════════ HOW THIS GETS FOUND ════════
This is what decides whether the video is discovered at all, so write it for
YouTube search and suggestion, not as a summary for somebody who has already
clicked.

TITLES. Whatever a viewer would actually TYPE goes at the FRONT. YouTube
truncates around 60 characters in search results and on mobile, so the words
that matter cannot be at the end. Name the actual subject: the product, the
company, the number. No "you won't believe", no ALL CAPS, no "(SHOCKING)".

DESCRIPTION. The first 150 characters are what shows in search results and above
the "more" fold, so they must name the subject in plain words and say what the
video answers. The detail comes after. Write it as this creator would, in their
language, mixing English the way the script does.

HASHTAGS. Three broad enough to have an audience, the rest specific to this
story. Lowercase, no spaces, no punctuation, no # symbol.

Return STRICT JSON only:
{
  "titles": ["5 title options. At least 2 in ${language || "their language"} and at least 2 in English, so the video is searchable in both. Keyword first. Aim for 50-60 characters, never over 70."],
  "description": "800 to 1000 characters. Open with 1-2 sentences naming the subject plainly, for search. Then 2-3 short paragraphs on what the video covers. Then one line inviting a comment or a subscribe, the way this creator would say it. Plain text, blank line between paragraphs. Do NOT invent links, timestamps, social handles, or a channel name.",
  "hashtags": ["8-12 hashtags, no # symbol, lowercase, mixing ${language || "their language"} and English. Specific to this story, not generic 'viral trending shorts' tags."],
  "thumbnail_lines": ["4 thumbnail text options. Three to five words MAX each. They have to be readable at phone size. In their language where it fits."]
}

Rules: every factual claim traces to the script above. Invent nothing. ${ANTI_TELL}`;

  try {
    const res = await client().models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        temperature: 0.85,
        responseMimeType: "application/json",
        maxOutputTokens: 4096,   // the description alone is now up to 1000 characters, and Indic scripts tokenise densely
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    const p = JSON.parse(res.text || "{}");

    // The source links are appended by US, not written by the model: asked for
    // URLs it will happily invent plausible ones, and a description full of dead
    // links is worse than a description with none.
    //
    // The written half is capped at 1000 characters BEFORE the links go on, so
    // the cap means the same thing for a story with five sources as for one
    // with none. Cut at a sentence end where there is one within reach: a
    // description that stops mid-word reads as a bug in the product rather
    // than as a length limit.
    const description = [
      trimTo(noEmDash(p.description), 1000),
      links.length ? `\nSources:\n${links.join("\n")}` : "",
    ].filter(Boolean).join("\n");

    return {
      titles: noEmDashAll(p.titles).map((t) => t.slice(0, 100)).slice(0, 5),
      description,
      // A dash inside a hashtag is not a pause, so it is dropped rather than
      // turned into a comma that would split one tag into two.
      hashtags: (Array.isArray(p.hashtags) ? p.hashtags : [])
        .map((h) => dropDashes(h).replace(/^#/, "").trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 12),
      thumbnail_lines: noEmDashAll(p.thumbnail_lines).map((t) => t.slice(0, 40)).slice(0, 4),
      usage: readUsage(res),
    };
  } catch (err) {
    console.error("[script] packaging failed:", err.message);
    return null;
  }
}

export default { writeScript, writeEnglishTwin, writePackaging };

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
 * ── EXAMPLE CONTAMINATION ────────────────────────────────────────────────────
 * The single most damaging failure this prompt has, and it is caused by the
 * thing that makes the prompt good. Feeding verbatim lines from a creator's own
 * videos is what puts a script in their actual voice instead of an average of
 * all creators. It also hands the model complete, fluent sentences about OTHER
 * products, and the cheapest way to sound like someone is to reuse one.
 *
 * Both failures below are real, observed on live generations:
 *
 *   His Honor video:  "ఫ్రంట్ కూడా 50 megapixel కెమెరా ఉంటది కానీ అనవసరం అది"
 *   The draft:        "ఫ్రంట్ కూడా 8 megapixel కెమెరా ఉంటది కానీ అనవసరం అది"
 *
 * One number swapped, and the opinion carried over whole. On the Honor phone
 * the front camera genuinely was pointless, because its gimbal camera could
 * face forwards; on this phone nothing of the sort is true and no source says
 * anything like it. The creator would be reading his own catchphrase attached
 * to a judgement he never made.
 *
 * The second is worse. Given his pen-fight opener, "tell me honestly, in school
 * you definitely played this game", a draft about a battery invented a
 * childhood memory of phone charging anxiety to fill the same shape. It
 * manufactured an experience and put it in his mouth.
 *
 * The grounded fact rule did not stop either one, and was not going to: neither
 * is an invented NUMBER, which is what that rule is written about and what it
 * successfully prevents. This is its own rule, stated with the actual failures
 * named, for the same reason ANTI_TELL below names its banned constructions
 * rather than asking for "natural writing".
 */
const BORROW_MANNER_NOT_CONTENT = `EXAMPLES ARE MANNER, NOT CONTENT. Every quoted line above came from a DIFFERENT
   video about a DIFFERENT product. Copy how those lines are built. Never copy
   what they are about.
   - Do not rewrite an example sentence with the subject swapped. If an example
     calls a front camera pointless, that was true of that phone for a reason
     that is not in front of you now, and reusing it invents an opinion.
   - Do not manufacture a memory, a childhood, an experience or an anecdote to
     fill the shape of one in the examples. If nothing in THIS material genuinely
     reminds them of something, do not pretend it does. An invented memory in
     their own voice is the worst thing on this page.
   - A phrase is safe to reuse when it carries only TONE: a greeting, a sign-off,
     a filler, a way of pointing at the screen, a turn of phrase. A phrase that
     carries a CLAIM about a product may appear only where this material supports
     that exact claim.
   - When in doubt, say the thing plainly in their register. A plain sentence in
     their voice is theirs. A borrowed sentence about the wrong product is not.`;

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
export async function writeScript({
  profile, material, seconds = 60, titles = false, category = "", format = null,
  // The creator's last few scripts, newest first. Optional: every caller worked
  // without it before, and a first script has nothing to vary from.
  recentScripts = null,
}) {
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
    (material.story_count > 1
      // ── A BULLETIN'S LENGTH IS A BUDGET, NOT A TARGET ────────────────────
      // Left as a single total, a model writing ten stories spends four hundred
      // words on the one with the richest source block and forty on the rest,
      // because that is what the material invites. The creator then reads a
      // script where story two runs a minute and story nine is a sentence.
      // Stating the per-story share, and stating that it is allowed to VARY
      // with what the sources actually support, is what keeps the running order
      // the creator chose from collapsing into whichever story had the best
      // press release.
      ? `This covers ${material.story_count} stories. Budget roughly ` +
        `${Math.round(target.mid / material.story_count)} words each, after allowing for the ` +
        `opening and the close. A story with richer sources may run somewhat longer and a ` +
        `thin one shorter, but no single story may take more than about twice the share of ` +
        `another, and none may be reduced to a single clause. Every story the creator ` +
        `selected has to actually appear.`
      : seconds >= 180
      ? `This is a LONG-FORM script: it needs real structure: an opening, two or three ` +
        `developed sections that each add something new from the source material, and their ` +
        `usual close. Do not pad, and do not repeat a point in different words to reach the ` +
        `count; if the sources cannot support this length, write the honest shorter version.`
      : `Every sentence has to earn its place at this length.`) +
    ` A spoken script, not an article: no headings, no bullet points, no stage directions, no "[pause]".`;

  // ── THE TWO NEW BLOCKS ────────────────────────────────────────────────────
  // Everything above this point is category-blind and always has been, which is
  // why a phone launch and a job notification used to reach a byte-identical
  // prompt. These are what make the prompt know what kind of video this is
  // (`format`) and what this creator sounds like when talking about THIS
  // subject (`category_voice`). Both degrade to empty strings, so a category
  // with no config configured yet writes exactly as it did before.
  const formatBlock = renderFormat(format, material);
  const categoryVoiceBlock = renderCategoryVoice(profile, format);
  const performanceRule = renderPerformanceRule(profile);
  const shootableTruthRule = renderShootableTruthRule(material, format, profile);
  const addressRule = renderAddressRule(profile, target);
  const phraseDiscipline = renderPhraseDiscipline(profile, recentScripts);
  const varietyRule = renderVarietyRule(profile, recentScripts);

  const prompt = `You are ghostwriting a short video script for a specific creator. It must be indistinguishable from something they wrote themselves.

════════ THE CREATOR'S VOICE ════════
${profile.style_brief || "(no brief available)"}${categoryVoiceBlock}
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
${list(habitualPhrases(profile))}

Moves they reuse: ${list(profile.recurring_moves)}
How they mix languages: ${profile.vocabulary_notes || "match the transcripts exactly"}
How they structure a topic: ${profile.narration_arc || "unknown"}
They never: ${list(profile.avoid)}

════════ ${material.story_count > 1 ? "TODAY'S STORIES" : material.grounded ? "TODAY'S STORY" : "WHAT THEY WANT TO MAKE"} ════════
${material.story_count > 1
  // The running order is the creator's editorial decision, not a suggestion,
  // and it is listed up front so the model treats it as given rather than
  // re-sorting by whichever story it finds most interesting.
  ? `The creator chose these ${material.story_count} stories, in THIS ORDER. Keep the order exactly:
${(material.story_titles || []).map((t, i) => `  ${i + 1}. ${t}`).join("\n")}`
  : `${material.title ? `Headline: ${material.title}\n` : ""}The angle to take: ${material.angle || "(pick the strongest angle from the material)"}`}

SOURCE MATERIAL BEGINS. This is the complete and only record of this subject that
exists for you. Anything not written between these markers did not happen.
${facts}
SOURCE MATERIAL ENDS.
${formatBlock}
════════ RULES ════════
${[
  `LANGUAGE. Write in ${language}, in the SAME script and the SAME code-mixing as the samples above. If their openings are in Devanagari with English words mixed in, the whole script must be Devanagari with English words mixed in. Do NOT translate. Do NOT transliterate into English letters. Do NOT write a cleaner or more formal version of how they talk.`,
  material.factRule,
  // Sits immediately after the fact rule because it IS a fact rule: it governs
  // the claims a script makes about itself rather than about the product.
  shootableTruthRule,
  `VOICE. Open the way THEY open, same energy and structure as their real openings, about this subject. Close the way THEY close. This is the whole job.`,
  BORROW_MANNER_NOT_CONTENT,
  `LENGTH. ${lengthRule}`,
  performanceRule,
  ANTI_TELL,
  addressRule,
  phraseDiscipline,
  varietyRule,
]
  // Numbered here rather than by hand. The list has grown from five rules to
  // eleven, several of them conditional, and hand-numbering a template around
  // optional entries is how a prompt ends up with two rule 8s.
  .filter((r) => String(r || "").trim())
  .map((r, i) => `${i + 1}. ${r}`)
  .join("\n")}

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

    // The cue check needs to know what the format asked for and which phrases
    // are this creator's own; neither is a property of the draft.
    const grade = gradeDraft(text, profile.metrics, {
      onScreenDensity: format?.onScreen?.density || null,
      showMePhrases: profile.category_voice?.show_me_phrases || [],
      // The connective tissue, checked rather than hoped for. Every one of
      // these came off this creator's own transcripts, so the check carries no
      // assumption about which language they speak.
      registerMarkers: profile.category_voice?.register_markers || [],
      discourseParticles: profile.category_voice?.discourse_particles || [],
      viewerAddress: profile.category_voice?.viewer_address || "",
      // The openings we already sent this channel, and the parts of an opening
      // that are theirs rather than ours and may legitimately recur.
      recentOpenings: (recentScripts || [])
        .map((t) => String(t || "").split(/\n+/).map((l) => l.trim()).find(Boolean) || "")
        .filter(Boolean),
      // Phrases the creator used once that have already gone out recently. The
      // model reproduces these from its own priors even when the prompt does
      // not contain them, so they are caught on the way out.
      restingPhrases: (() => {
        const r = phraseRecurrence(profile);
        const spent = (recentScripts || []).map((t) => String(t || ""));
        return r.oneOffs().filter((p) => spent.some((t) => t.includes(p)));
      })(),
      materialFacts: material.facts || "",
      // Only when the script is written from coverage. A creator writing about
      // material they brought may well be making exactly that kind of video.
      forbiddenVideoWord: material.grounded
        ? profile.category_voice?.closing_video_word || ""
        : "",
      openingSafe: [
        ...(Array.isArray(profile.sample_openings) ? profile.sample_openings : []),
        ...(Array.isArray(profile.opening_patterns) ? profile.opening_patterns : []),
        ...habitualPhrases(profile),
      ],
      ...exampleAndSafeSpans(profile),
    });
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
      // ── WHAT MAY CHANGE, AND WHAT MAY NOT ────────────────────────────────
      // This used to read "same facts, same angle, fixing exactly these.
      // Change nothing else", and that instruction contradicted half the notes
      // above it. Told both to open on a different move AND to keep the same
      // angle and change nothing else, the rewrite kept the opening: it is the
      // only reading that satisfies the last sentence, which is also the most
      // recent and most absolute one. Structural corrections could not be
      // obeyed by a rewrite forbidden to restructure.
      //
      // The facts are the thing that must not move, and they are stated on
      // their own so nothing dilutes them. Everything else is fair game,
      // because everything else is what the notes are asking to change.
      "Write it again. Every fact, number, price, date and name stays exactly as it is, and",
      "you may not add any that were not in the source material.",
      "",
      "Everything else is yours to change: the opening, the order, the wording, which of their",
      "phrases you reach for. Fix every point above. If a note asks you to open differently, that",
      "means a different first move, not the same opening reworded.",
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

/**
 * The shape of video this is, stated as ordered beats.
 *
 * ── THE RULE THAT KEEPS THIS FROM RUINING THE PRODUCT ───────────────────────
 * A beat list is a template, and a template is identical for every creator who
 * uses it. Pushed hard enough it overwhelms the voice profile and every tech
 * channel's script converges on the same five paragraphs, which is precisely
 * what this product exists not to do. Pushed too softly it is decoration.
 *
 * The resolution is a hierarchy stated explicitly to the model, because left
 * implicit it picks the wrong one: the format owns WHAT IS COVERED AND IN WHAT
 * ORDER, the voice owns HOW IT IS SAID, and where they conflict the voice wins.
 * Technical Guruji's own chapter list contains "Chaliye Shuru Karte Hain", which
 * looks like structure and is actually a catchphrase; a format that claimed that
 * beat would be overwriting the very thing the creator is recognised for.
 *
 * The second rule is the fact discipline restated at the structural level. An
 * empty beat is the most dangerous thing in a template, because a model handed
 * "price and availability" with no price in the sources will produce a
 * plausible one, and it will be read aloud.
 */
export function renderFormat(format, material) {
  if (!format || !Array.isArray(format.beats) || !format.beats.length) return "";

  const n = material?.story_count || 0;
  const beats = format.beats.map((b, i) => `${i + 1}. ${b}`).join("\n");

  return `
════════ THE SHAPE OF THIS VIDEO ════════
This is a ${format.label}${n > 1 ? `, covering ${n} separate stories` : ""}.

Cover these, in this order:
${beats}

${format.discipline ? `${format.discipline}\n` : ""}
HOW THIS INTERACTS WITH THEIR VOICE, which matters more than the list above:
- This list decides WHAT the script covers and in WHAT ORDER. It does NOT decide
  how any of it is worded. Every sentence is still written the way THIS person
  talks, using their phrases, their rhythm, their code-mixing.
- Where a beat and their habits disagree, THEIR HABITS WIN. If one of their
  catchphrases happens to look like a structural step, it is theirs, keep it.
- These are beats, not headings. Never write the beat names into the script, and
  never announce a section. It is spoken continuously.
- A beat the source material cannot support is DROPPED, silently. Do not write a
  sentence about a price that is not in the sources, or a verdict on something
  the sources do not describe. A shorter honest script is the correct outcome.
`;
}

/**
 * What this creator sounds like on THIS subject, as opposed to in general.
 *
 * The style_brief above is category-blind: it captures openings, closings,
 * fillers and code-mixing, all of which two tech creators can share while
 * sounding nothing alike the moment either of them reaches a spec sheet. These
 * fields are the difference, and they are worth their tokens precisely because
 * they are the ones a generic analysis never asks for.
 *
 * `bulletin_transitions` gets its own paragraph rather than being listed with
 * the rest, because it is the one field that is not a texture note but a
 * structural instruction: it is what stops a fourteen-story script reading as
 * fourteen unrelated paragraphs.
 */
export function renderCategoryVoice(profile, format) {
  const cv = profile?.category_voice;
  if (!cv || typeof cv !== "object") return "";

  const LABELS = {
    spec_delivery: "How they say specs",
    price_talk: "How they say prices",
    verdict_vocabulary: "The words they use to judge something",
    comparison_habit: "What they compare against",
    brand_handling: "How they handle brand and model names",
    hype_calibration: "Their excitement level, and how they admit uncertainty",
    deal_callout: "How they mention deals or links",
    viewer_address: "What they call the viewer",
    compression: "How they fit a subject into very little time",
    segment_names: "Named segments they use",
    running_order: "How they sequence a multi-story video",
    personal_anecdote: "How they bring in their own experience",
    explainer_move: "How they explain something the audience may not know",
    viewer_advice: "What they tell the viewer to DO",
    native_metaphor: "Figures of speech in their own language",
    reaction_beats: "Short standalone lines that carry feeling",
    speech_register: "Which register of their language they speak",
    section_transitions: "How they move between sections of one subject",
    cross_promo: "How they point viewers at their own other videos",
  };

  // ── ONE PHRASE, ONE MENTION ─────────────────────────────────────────────
  // The analyst answers each question independently, so the same line can come
  // back under two headings: on a real profile "మైండ్ పోద్ది" was filed as both
  // a reaction beat and a native metaphor. Rendered twice it reads to the model
  // as twice as characteristic, which is the opposite of true, and it was said
  // once in four videos.
  const seen = new Set();
  const rec = phraseRecurrence(profile);

  const lines = [];
  for (const [key, label] of Object.entries(LABELS)) {
    const v = cv[key];
    let text;
    if (Array.isArray(v)) {
      const kept = v
        .map((x) => String(x || "").trim())
        .filter(Boolean)
        .filter((x) => !seen.has(x) && seen.add(x))
        // A line the creator used once is not a habit and must not be handed
        // over as one. It stays available, in its own block below, under a rule.
        .filter((x) => !rec.isOneOff(x));
      text = kept.join(" · ");
    } else {
      text = String(v || "").trim();
    }
    if (text) lines.push(`${label}: ${text}`);
  }

  const transitions = Array.isArray(cv.bulletin_transitions)
    ? cv.bulletin_transitions.filter(Boolean)
    : [];

  // Computed before the emptiness check, not after it. The connective tissue
  // has no entry in LABELS (it gets its own imperative block below rather than
  // a bullet), so a profile carrying ONLY register markers and particles would
  // otherwise fall through this guard and lose the one part of itself the
  // writer most reliably drops.
  const tissue = renderConnectiveTissue(cv);

  if (!lines.length && !transitions.length && !tissue) return "";

  let block = `

HOW THEY TALK ABOUT THIS SUBJECT SPECIFICALLY. These are measured from their own
videos and they are what separates them from every other creator covering the
same story. Match them:
${lines.map((l) => `  • ${l}`).join("\n")}

  ── THESE ARE EXAMPLES, NOT SLOTS TO FILL ──
  Every phrase above was said about a DIFFERENT product, in a context that made
  it true. Use one only where its meaning genuinely applies here, and leave the
  rest out. A script that works all of them in is a worse impression of this
  person than one that uses two well.
  Above all: several of these phrases carry a CLAIM, not just a tone. "That one
  is unnecessary", "it is a good phone", "doubtful whether it arrives" are
  judgements, and a judgement is a factual assertion exactly like a number is.
  You may only make one where the source material supports it. Do not reach for
  a phrase because it sounds like them and then invent the reason it is true.`;

  if (transitions.length) {
    block +=
      `\n\nTHEIR OWN TRANSITIONS between stories, verbatim. Use THESE to move from one
story to the next, never a generic connective, and never the same one twice in
a row:\n${transitions.map((t) => `  • "${t}"`).join("\n")}`;
  } else if (format?.id === "bulletin") {
    // Reached when the long voice was built but the analyst found no repeated
    // joins. Inventing a house style here would be worse than admitting it:
    // asking for plain, varied joins in their own idiom at least stays honest
    // to what we actually observed.
    block +=
      `\n\nWe did not capture a repeated transition phrase for this creator. Move between
stories plainly, in their own words, varying the join each time. Do not invent a
catchphrase for them.`;
  }

  block += tissue;
  block += renderOnScreen(cv, format);
  return block;
}

/**
 * The words between the words.
 *
 * ── WHY THIS IS AN INSTRUCTION AND NOT ANOTHER BULLET ───────────────────────
 * Everything renderCategoryVoice emits above is DESCRIPTION, and description is
 * demonstrably enough for content moves: the creator's specs, prices, verdicts
 * and on-screen cues all came back in the drafts, because each of them is a
 * thing to say and the model had an example of it.
 *
 * It is demonstrably NOT enough for function words. Measured on one creator's
 * four transcripts against the scripts written for him: his commonest particle
 * ran at 1.76 per 100 words and the drafts used it zero times; he opens 12% of
 * his sentences with one particular connector and the drafts opened none; 69%
 * of his verb forms were the colloquial spoken ones and the drafts were 100%
 * formal written. Roughly 35 expected occurrences, 2 delivered.
 *
 * The reason is mechanical rather than mysterious. A model writing in a
 * language it knows well defaults to that language's WRITTEN register, because
 * that is what most text is, and no amount of "match their style" moves it: the
 * draft is clean, correct prose, and clean correct prose is precisely what a
 * person talking does not produce. Being told the forms exist does not compete
 * with that pull. Being told to use them, with the forms in hand and a grader
 * counting them afterwards, does.
 *
 * Nothing here is language-specific. Whatever the analyst read off this
 * creator's own transcripts is what gets quoted back.
 */
/**
 * Everything this creator is SUPPOSED to repeat, as one blob to test against.
 *
 * Their sign-off, their particles, their register, their on-screen cues and the
 * openings they genuinely reuse all recur by design, and a repetition check
 * that flagged those would be arguing with the rest of this file.
 */
function exemptFromRepeat(profile) {
  const cv = profile?.category_voice || {};
  const flat = (v) => (Array.isArray(v) ? v : [v]).map((x) => String(x || "").trim()).filter(Boolean);
  return [
    ...flat(profile?.sample_openings),
    ...flat(profile?.sample_closings),
    ...flat(profile?.closing_patterns),
    ...flat(cv.show_me_phrases),
    ...flat(cv.register_markers),
    ...flat(cv.discourse_particles),
    ...flat(cv.section_transitions),
    ...flat(cv.bulletin_transitions),
    ...flat(cv.segment_names),
    ...flat(cv.viewer_address),
    // Only the phrases they demonstrably repeat in their own videos. A one-off
    // is not exempt, which is the whole point.
    ...flat(profile?.signature_phrases).filter((p) => !phraseRecurrence(profile).isOneOff(p)),
  ];
}

/**
 * Do two phrases share a distinctive word?
 *
 * Used to tell "this repeated span IS the one-off phrase we are resting" from
 * "this is an unrelated repetition". Word-level rather than substring, so it
 * survives the inflection that defeats exact matching: "మైండ్ పోద్ది" and
 * "మైండ్ బ్లాక్ అయ్యే" share no common suffix but do share a whole word.
 *
 * Short tokens are ignored because in most languages they are pronouns and
 * particles that appear in half of everything.
 */
function shareWords(a, b, minLen = 4) {
  const toks = (s) => new Set(
    String(s || "").toLowerCase().replace(/[।.,!?;:"'“”‘’()]/g, " ").split(/\s+/)
      .filter((w) => w.length >= minLen)
  );
  const A = toks(a);
  for (const w of toks(b)) if (A.has(w)) return true;
  return false;
}

/**
 * Runs of words that keep turning up across this creator's recent scripts.
 *
 * ── WHY THIS LOOKS AT THE SCRIPTS AND NOT AT THE PROFILE ────────────────────
 * The profile-side check compares a draft against stored phrases by exact
 * string, and that misses the case that actually reached a creator. The stored
 * one-off was "మైండ్ పోద్ది"; the scripts kept saying "మైండ్ పోయే". Same image,
 * different inflection, no string match, four scripts in a row.
 *
 * Every language this product serves inflects, most of them far more than
 * English, so a mechanism that only catches a phrase in the exact form the
 * analyst happened to quote will keep missing the thing the creator complains
 * about. Comparing the scripts to EACH OTHER sidesteps it entirely: whatever
 * form the repetition took, it repeated, and it shows up here with no stemmer,
 * no word list and nothing language-specific.
 *
 * It also catches repetition the profile never predicted, which is most of it.
 *
 * @param {string[]} recent   previous scripts, newest first
 * @param {string[]} exempt   phrases the creator is meant to repeat
 */
function repeatedSpans(recent, exempt, { minWords = 2, maxWords = 6, minDocs = 2 } = {}) {
  const norm = (s) => String(s || "").replace(/[।.,!?;:"'“”‘’()]/g, " ").replace(/\s+/g, " ").trim();
  const safe = " " + exempt.map(norm).filter(Boolean).join(" | ") + " ";

  // One set of n-grams per script, so a phrase repeated ten times inside a
  // single script counts once. What matters is appearing in SEPARATE scripts.
  const perScript = recent.map((t) => {
    const w = norm(t).split(" ").filter(Boolean);
    const grams = new Set();
    for (let n = minWords; n <= maxWords; n++) {
      for (let i = 0; i + n <= w.length; i++) grams.add(w.slice(i, i + n).join(" "));
    }
    return grams;
  });

  const docs = new Map();
  for (const set of perScript) for (const g of set) docs.set(g, (docs.get(g) || 0) + 1);

  let hits = [...docs.entries()]
    .filter(([g, n]) => n >= minDocs && g.length >= 6 && !safe.includes(g))
    .map(([p, n]) => ({ p, n }));

  // Keep the longest form of each repetition. Without this one six-word repeat
  // reports as a dozen overlapping windows of itself, and an instruction listing
  // the same phrase eight ways is one the model skims.
  //
  // Containment alone is not enough, because the windows are SHIFTED rather than
  // nested: "type Link and the DM", "Link and the DM will", "and the DM will
  // come" are three separate strings describing one repeated sentence. So a
  // candidate is dropped when it shares a run of words with something already
  // kept, not only when it sits inside it.
  const OVERLAP = 4;
  hits.sort((a, b) => b.p.split(" ").length - a.p.split(" ").length || b.n - a.n);

  const kept = [];
  for (const h of hits) {
    const w = h.p.split(" ");
    const runs = [];
    for (let i = 0; i + OVERLAP <= w.length; i++) runs.push(w.slice(i, i + OVERLAP).join(" "));
    const overlaps = kept.some((k) =>
      k.p.includes(h.p) || (runs.length ? runs.some((r) => k.p.includes(r)) : k.p.includes(h.p)));
    if (overlaps) continue;
    kept.push(h);
    if (kept.length >= 6) break;
  }
  return kept;
}

/**
 * What this creator has already been handed, so they are not handed it again.
 *
 * ── WHY RECURRENCE ALONE IS NOT ENOUGH ──────────────────────────────────────
 * phraseRecurrence stops a one-off becoming a catchphrase. It cannot stop the
 * other half of the problem, because that one is not a defect in the profile at
 * all: a phrase the creator genuinely says in three of four videos is CORRECT
 * to use, and using it in ten consecutive scripts is still ten identical
 * scripts. Every script is written in ignorance of every other one, so the
 * model reaches for the strongest available line every time and is right every
 * time, and the creator is the only person who can see the pattern.
 *
 * They see it immediately. Four scripts opening the same way is the moment a
 * voice model stops reading as "this understands me" and starts reading as a
 * template with the nouns swapped.
 *
 * So the last few scripts are shown to the writer, as openings and as the lines
 * it leaned on, with instructions to reach for something else. Not a ban:
 * varying an opening is a thing this creator does across their own videos, and
 * the profile holds several real openings precisely so there is somewhere else
 * to go.
 *
 * Language-neutral: these are the creator's own previous scripts, whatever
 * language they were written in, quoted back.
 */
/**
 * The longest run of words two lines share, ignoring punctuation.
 *
 * Used to decide WHICH of a creator's several openings a given line was
 * modelled on. Word runs rather than stems, so it behaves the same in every
 * language this serves.
 */
function sharedRun(a, b) {
  const w = (s) => String(s || "").toLowerCase()
    .replace(/[।.,!?;:"'“”‘’()]/g, " ").split(/\s+/).filter(Boolean);
  const A = w(a), B = w(b);
  let best = 0;
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < B.length; j++) {
      let n = 0;
      while (i + n < A.length && j + n < B.length && A[i + n] === B[j + n]) n++;
      if (n > best) best = n;
    }
  }
  return best;
}

/**
 * Which of the creator's own openings has each recent script been following?
 *
 * ── THE FAILURE THIS ANSWERS ────────────────────────────────────────────────
 * A creator with four videos had four genuinely different opening moves: one
 * announced the video, one asked the viewer a direct question, two led with
 * what people keep asking for. Three consecutive scripts all used the same one
 * of those four, and the opening-repetition check in gradeDraft passed every
 * time, correctly: the repeated words WERE in his own sample openings, so they
 * were exempt as his habit.
 *
 * The exemption is right and it was answering the wrong question. Repeating a
 * move this creator really uses is not the defect. Never using the other three
 * is. A creator who varies their opening across their own videos and gets the
 * same one from us every time is watching us flatten them.
 *
 * So instead of asking "is this opening too close to the last one", this asks
 * which of their openings each recent script drew on, and the rule below hands
 * the writer the ones that have gone unused. Positive framing on purpose: the
 * unused openings can be quoted freely, because quoting them is the point,
 * whereas quoting the over-used one would just invite it again.
 */
// Three words, not four. These creators open with a greeting that is itself one
// or two words, so the run that identifies WHICH move follows it is short by
// construction: "hi friends, many people" is three, and the fourth word is
// already the part that varies between the moves. At four this matched nothing
// and reported every opening as unused.
function openingsRecentlyUsed(profile, recentOpenings, minRun = 3) {
  const samples = (Array.isArray(profile?.sample_openings) ? profile.sample_openings : [])
    .map((s) => String(s || "").trim()).filter(Boolean);
  if (samples.length < 2) return { samples, used: new Set() };

  const used = new Set();
  for (const line of recentOpenings) {
    let bestIdx = -1;
    let bestRun = minRun - 1;
    samples.forEach((s, i) => {
      const run = sharedRun(line, s);
      if (run > bestRun) { bestRun = run; bestIdx = i; }
    });
    if (bestIdx >= 0) used.add(bestIdx);
  }
  return { samples, used };
}

export function renderVarietyRule(profile, recentScripts) {
  const recent = (Array.isArray(recentScripts) ? recentScripts : [])
    .map((t) => String(t || "").trim())
    .filter(Boolean)
    .slice(0, 4);
  if (!recent.length) return "";

  // ── THE PREVIOUS OPENINGS ARE DELIBERATELY NOT QUOTED ───────────────────
  // They were, and it backfired precisely. This block listed the last four
  // openings verbatim under "open this one differently", and the model read
  // "ఈరోජ నేను మీకు ఒక మైండ్ పోయే…" four times and opened with a reworded
  // version of it. Told not to reuse a phrase, a model still needs the phrase
  // in context to know what not to do, and having it in context is most of the
  // way to writing it.
  //
  // So the openings are counted, not shown. What IS shown is the far shorter
  // list of runs that actually repeated, framed as forbidden rather than as
  // examples, which is the same information with none of the invitation.
  const openings = recent
    .map((t) => t.split(/\n+/).map((l) => l.trim()).find(Boolean) || "")
    .filter(Boolean);
  if (!openings.length) return "";

  // ── DO NOT NAME THE PHRASE WE ARE TRYING TO STARVE ──────────────────────
  // A repeated span that came from a one-off expressive phrase is already
  // handled twice over: renderPhraseDiscipline withdraws it from the prompt
  // once it has been used, and gradeDraft rejects an opening that reuses it.
  // Quoting it here as "do not say this" undoes both, because it is then the
  // only place in the whole prompt where the phrase still appears, and the
  // model wrote it back three runs in a row from this list alone.
  //
  // Structural repeats, a call to action, a stock transition, have no such
  // safety net and are worth naming. So the list keeps those and drops
  // anything overlapping a phrase we are deliberately resting.
  const rec = phraseRecurrence(profile);
  const resting = rec.oneOffs();
  const overused = repeatedSpans(recent, exemptFromRepeat(profile))
    .filter((x) => !resting.some((p) => shareWords(p, x.p)));

  // Which of their own openings are still unspent. Quoted, unlike everything
  // else in this block, because these are the ones we want reached for.
  const { samples, used } = openingsRecentlyUsed(profile, openings);
  const unused = samples.filter((_, i) => !used.has(i));

  const rotate = samples.length < 2 || !used.size
    // Either they only have one opening on file, or the recent scripts did not
    // follow any of them closely enough to say which. Claiming they "leaned on
    // the same move" would then be a guess dressed as a measurement.
    ? ""
    : unused.length
      ? `\n   This creator does not open every video the same way. The last ` +
        `${recent.length === 1 ? "script" : `${recent.length} scripts`} all followed the same one ` +
        `of their ${samples.length} opening moves, and these are the ones we have NOT used. ` +
        `Model this opening on one of them instead:\n${unused.map((o) => `   - "${o}"`).join("\n")}`
      : `\n   Every one of their opening moves has been used in a recent script. Do not repeat ` +
        `the most recent one: pick whichever of their openings is furthest back, or open on the ` +
        `story itself in their register.`;

  return (
    `DO NOT REPEAT YOURSELF ACROSS SCRIPTS. We have already sent this creator ` +
    `${recent.length} script${recent.length === 1 ? "" : "s"}, and they read them one after ` +
    `another. Open this one on a different move from the last ones. Do not start with a ` +
    `superlative about how astonishing this is if that is the obvious choice, it is the one ` +
    `they have had repeatedly.` +
    rotate +
    (overused.length
      ? `\n   And these exact runs of words already appear in more than one of those scripts, ` +
        `without being anything this creator habitually says:\n` +
        overused.map((x) => `   - "${x.p}" (in ${x.n} of them)`).join("\n") +
        `\n   Do not use any of them again, in any form. Say that idea a different way, or ` +
        `leave it out. Their real catchphrases and sign-offs are exempt from this and should ` +
        `still appear as usual.`
      : "")
  );
}

/**
 * How habitual is each of this creator's stored phrases?
 *
 * Reads `phrase_docs`, written at analysis time by counting the phrase in the
 * creator's own transcripts (services/voiceProfileService.js). A phrase found
 * in one video out of four is not a catchphrase, and handing it to the writer
 * as one is how four consecutive scripts came back all saying the same line.
 *
 * ── WHY THREE VIDEOS IS THE FLOOR FOR JUDGING THIS ──────────────────────────
 * With one video every phrase is 1 of 1; with two, 1 of 2 is as likely to mean
 * "said in half their videos" as "said once". Below three there is no evidence
 * to demote anything on, and demoting on no evidence would strip a thin
 * profile of the little voice it has. So the whole mechanism switches off, and
 * the creator gets exactly the behaviour they had before.
 */
function phraseRecurrence(profile) {
  const docs = profile?.phrase_docs && typeof profile.phrase_docs === "object" ? profile.phrase_docs : null;
  const videos = Number(profile?.transcript_count) || 0;
  const usable = !!docs && videos >= 3;

  return {
    videos,
    usable,
    isOneOff: (phrase) => {
      if (!usable) return false;
      const n = docs[String(phrase || "").trim()];
      return typeof n === "number" && n <= 1;
    },
    /** Every stored phrase the creator used exactly once, deduplicated. */
    oneOffs: () => (usable
      ? [...new Set(Object.keys(docs).filter((k) => docs[k] <= 1))]
      : []),
  };
}

/**
 * Their catchphrases, minus the ones they only said once.
 *
 * The list is labelled "phrases they genuinely use" and invites the writer to
 * work several in. That invitation is right for a sign-off appearing in three
 * of four videos and wrong for a line appearing in one, and the two were
 * arriving in the same array.
 */
function habitualPhrases(profile) {
  const rec = phraseRecurrence(profile);
  const all = Array.isArray(profile?.signature_phrases) ? profile.signature_phrases : [];
  if (!rec.usable) return all;
  const kept = all.filter((p) => !rec.isOneOff(p));
  // Never hand back nothing. If the analysis found only one-offs, the creator
  // still talks like that, and the discipline block is what keeps them rare.
  return kept.length ? kept : all;
}

/**
 * The phrases they said once, and the rule that keeps them rare.
 *
 * ── WHY THESE ARE SHOWN AT ALL RATHER THAN DROPPED ──────────────────────────
 * Because they are real. A creator who once called something a "gold product"
 * genuinely talks that way, and deleting the line would flatten them toward the
 * average of every tech channel, which is the failure this whole product
 * exists to avoid. The defect was never that the phrase was available; it was
 * that it was indistinguishable from a sign-off they use every week, so the
 * writer reached for it every time.
 *
 * So they stay, with the one fact that changes how they are used attached: he
 * said this once. That is a budget, not a ban.
 */
function renderPhraseDiscipline(profile, recentScripts) {
  const rec = phraseRecurrence(profile);
  const recent = (Array.isArray(recentScripts) ? recentScripts : []).map((t) => String(t || ""));

  // ── A PHRASE ALREADY SPENT IS NOT SHOWN AT ALL ──────────────────────────
  // Listing it under "use at most one of these" still puts it in front of the
  // model, and in front of the model is most of the way to in the script: three
  // runs in a row opened on a reworded version of a phrase this block was
  // warning about. Withdrawing it is the only version of this instruction that
  // cannot be negotiated with. It becomes available again once it drops out of
  // the recent window, which is exactly the behaviour wanted: rare, not banned.
  const oneOffs = rec.oneOffs().filter((p) => !recent.some((t) => t.includes(p)));
  if (!oneOffs.length) return "";

  return (
    `SAID ONCE, NOT A CATCHPHRASE. Each of these appears in exactly ONE of this ` +
    `creator's ${rec.videos} videos. They are real, and they are not habits: they were ` +
    `reactions to one particular product on one particular day. Treat them as a budget. ` +
    `Use AT MOST ONE of them in this script, only if this subject genuinely earns the same ` +
    `reaction, and never as the opening or the closing line. Using several, or using one ` +
    `every time, turns the strongest thing about this creator into a verbal tic they do not ` +
    `have:\n${oneOffs.map((p) => `   - "${p}"`).join("\n")}`
  );
}

/**
 * The script may not lie about what kind of video it is.
 *
 * ── THE BUG ─────────────────────────────────────────────────────────────────
 * A creator's real sign-off was "see you tomorrow in another unboxing, bye".
 * It went out, verbatim and correctly quoted, on the end of three scripts: a
 * guide to watching tonight's Apple event, an ASUS launch announcement, and a
 * teaser for a OnePlus phone that does not exist yet. None of the three is an
 * unboxing. One of them is about a product nobody outside the factory has
 * touched.
 *
 * The same script said "here on my desk you can see" about a laptop that has
 * not launched.
 *
 * ── WHY EVERY EXISTING GUARD MISSED IT ──────────────────────────────────────
 * The fact rules govern claims about the PRODUCT: its price, its specs, its
 * launch date, all checked against the source material. Nothing governed the
 * claims a script makes about ITSELF, and those are just as false and rather
 * more embarrassing, because the creator has to say them out loud about their
 * own video.
 *
 * The sign-off in particular was protected by every mechanism at once. It is a
 * genuine habit, so the recurrence check exempts it; it is in safePhrases, so
 * the contamination check exempts it; and the prompt explicitly instructs
 * "close the way THEY close". Everything worked as designed and the output was
 * still wrong, because a phrase can be perfectly in-voice and factually false
 * at the same time. Their catchphrases were recorded in videos that WERE
 * unboxings.
 *
 * ── WHY THIS IS NOT A WORD LIST ─────────────────────────────────────────────
 * The obvious fix is to look for "unboxing" and friends in the draft. That
 * would work for one word in one language and fail for every creator who signs
 * off promising a review, a giveaway, a comparison or a build, in any of the
 * languages this product serves. What is stated instead is the TEST: does this
 * line claim something about this video that is not true? A model can apply
 * that to its own draft in any language; it cannot apply a list it does not
 * have.
 */
export function renderShootableTruthRule(material, format, profile) {
  // The news path is the one where this is guaranteed: the creator is writing
  // from coverage of something they have not seen. Material they brought
  // themselves may well be a product in their hands, and telling them they do
  // not have it would be its own wrong claim.
  if (!material?.grounded) return "";

  const what = material.story_count > 1
    ? "a news bulletin covering several stories"
    : format?.id === "explainer"
      ? "an explainer built from reporting"
      : "a news item about something that has been announced or leaked";

  return (
    `DO NOT LIE ABOUT WHAT THIS VIDEO IS. This script is ${what}, written from the coverage ` +
    `above. The creator has not seen, held, opened, used or tested anything in it, and for an ` +
    `unreleased product nobody outside the company has. Every guard further up governs claims ` +
    `about the PRODUCT; this one governs claims about the VIDEO, and those are just as false ` +
    `when they are wrong.\n` +
    `   - Do not call this, or imply it is, an unboxing, a review, a hands-on, a first look, a ` +
    `test, a comparison or a giveaway. It is none of those.\n` +
    `   - Do not place the product anywhere: not in their hands, not on their desk, not in ` +
    `front of them. Do not say they have been using it, or how it felt.\n` +
    (String(profile?.category_voice?.closing_video_word || "").trim()
      // Named explicitly when the analysis found it, because "check your
      // sign-off" is a thing to notice and "the word is X, do not write X" is a
      // thing to do. The word came off this creator's own transcripts, so this
      // stays language-neutral.
      ? `   - THEIR SIGN-OFF NAMES A KIND OF VIDEO, and this is not one. The word is ` +
        `"${String(profile.category_voice.closing_video_word).trim()}". Do NOT write it anywhere ` +
        `in this script. Keep their closing otherwise word for word, its rhythm and its warmth, ` +
        `and put in its place what this video actually is, or drop that clause and end on the ` +
        `part of their sign-off that is always true.\n`
      : `   - THEIR SIGN-OFF NEEDS CHECKING. Creators sign off by naming the kind of video they ` +
        `usually make, and theirs was recorded on a video that genuinely was one. If their ` +
        `closing promises the next video is a particular kind, or describes this one as a kind, ` +
        `keep its rhythm, its warmth and its exact wording everywhere else, and change only the ` +
        `word that is no longer true, to whatever this video actually is. If nothing fits, end ` +
        `on the part of their sign-off that is always true.\n`) +
    `   This is not a licence to flatten them. Everything about how they talk stays. What ` +
    `changes is only a claim that would make them look like they had not watched their own video.`
  );
}

/**
 * Talk TO the viewer, as often as they actually do.
 *
 * ── WHY A MEASURED NUMBER WAS NOT ENOUGH ────────────────────────────────────
 * metricsBlock has always reported this: "Address: talks to the viewer (second
 * person 4.9/100 words)". Reporting is not instructing, and the drafts came
 * back at 1.6 — a third of his rate — with the grader flagging it and the
 * rewrite failing to fix it. The same shape as the particle failure: a fact
 * about the creator loses to the model's default, and the default here is
 * strong, because the source material is news prose written in the third
 * person and a model summarising it naturally keeps that register.
 *
 * Three things make it act instead:
 *
 *   1. A COUNT, NOT A RATE. "4.9 per 100 words" is arithmetic the model has to
 *      do about a script it has not written yet. "About nine times in this
 *      script" is a target it can check itself against as it writes.
 *   2. THEIR OWN WORD FOR THE VIEWER, quoted, so this cannot be satisfied by
 *      whatever second-person form the model reaches for first.
 *   3. A TRANSFORM, not an exhortation. The gap is concentrated in one place:
 *      specs and facts arrive as properties of a product and get written back
 *      as properties of a product. Saying the same fact as something the viewer
 *      GETS, CAN DO or WILL SEE is a mechanical rewrite of a sentence they
 *      already have, which is a far easier instruction to follow than "be more
 *      personal".
 *
 * Floor-checked before it is asked for: measured across this creator's four
 * videos the rate ranges 3.0 to 7.8, so even his least viewer-directed video
 * clears twice what the drafts produced. This is not a demand the material
 * cannot support.
 *
 * Language-neutral: the rate and the word both come from this creator's own
 * transcripts.
 */
export function renderAddressRule(profile, target) {
  const rate = Number(profile?.metrics?.second_person_per_100) || 0;

  // Below this a creator genuinely reports rather than addresses, and pushing
  // them toward the viewer would be inventing a trait rather than matching one.
  if (rate < 2) return "";

  const mid = Number(target?.mid) || 0;
  const times = Math.round((rate * mid) / 100);
  if (!times) return "";

  const own = (Array.isArray(profile?.category_voice?.viewer_address)
    ? profile.category_voice.viewer_address
    : [profile?.category_voice?.viewer_address])
    .map((v) => String(v || "").trim())
    .filter(Boolean);

  return (
    `TALK TO THEM. This creator addresses the viewer directly ${rate} times per 100 words, ` +
    `which in a script this length is about ${times} times. That is a measured fact about ` +
    `how they talk, and it is the single thing drafts for them get most wrong: the draft ` +
    `describes the subject where they would be speaking to somebody.` +
    (own.length ? ` Use their own word for the viewer: ${own.map((w) => `"${w}"`).join(", ")}.` : "") +
    ` The fix is mechanical. The source material is written in the third person, about a ` +
    `product. They do not talk that way. Wherever you would state a fact ABOUT the thing, ` +
    `state it as what the viewer GETS, what they CAN DO with it, or what they are ABOUT TO ` +
    `SEE. Same fact, same accuracy, addressed to a person. Do not manufacture the count with ` +
    `filler questions at the end; it belongs spread through the body, on the specs and the ` +
    `price, exactly where they put it.`
  );
}

function renderConnectiveTissue(cv) {
  const flat = (v) => (Array.isArray(v) ? v : [v]).map((x) => String(x || "").trim()).filter(Boolean);
  const register = flat(cv.register_markers);
  const particles = flat(cv.discourse_particles);
  const never = flat(cv.never_does);

  const parts = [];

  if (register.length || particles.length) {
    parts.push(
`════ THE WORDS THEY ACTUALLY SPEAK WITH ════
This is the part a written draft loses first, and it is the part a listener
notices first. Do not write clean prose in this language. Write the way this
person talks.`);

    if (register.length) {
      parts.push(
`Their REGISTER. These are their own forms, and the formal written equivalents
are NOT interchangeable with them. Use theirs, never the tidied-up version,
every time the choice comes up:
${register.map((r) => `  • "${r}"`).join("\n")}`);
    }

    if (particles.length) {
      parts.push(
`Their CONNECTIVES AND PARTICLES, with where each one sits. These are among the
most frequent words in their speech, and a script without them reads as
somebody else reading their notes:
${particles.map((r) => `  • ${r}`).join("\n")}`);
    }

    parts.push(
`These carry no meaning, so they can never make a claim and can never be wrong
about the facts. That makes them the one thing here you should reuse freely, at
the rate they use them.`);
  }

  if (never.length) {
    parts.push(
`════ THINGS THIS PERSON NEVER DOES ════
Confirmed absent from every one of their transcripts. Writing any of these in is
the fastest way to make the script sound like a different creator, and it is the
kind of error they notice in the first line:
${never.map((n) => `  • ${n}`).join("\n")}`);
  }

  return parts.length ? `\n\n${parts.join("\n\n")}` : "";
}

/**
 * The lines that point at what is on screen.
 *
 * ── WHY THIS IS SEPARATE FROM EVERY OTHER VOICE FIELD ───────────────────────
 * Everything else in the profile describes how a sentence SOUNDS. This one
 * decides whether the script can be recorded at all. Measured across four of
 * one creator's videos, 13% of their sentences point at something on screen,
 * and in a feature demo it reaches 44%. A script with none of them is an essay:
 * correct, in their voice, and impossible to stand in front of a camera and
 * perform, because the moment they say "and the camera rotates" there is
 * nothing cut to and no instruction for whoever is editing.
 *
 * ── THE RULE THAT MATTERS MORE THAN THE CUES THEMSELVES ─────────────────────
 * A cue is a PROMISE THAT FOOTAGE EXISTS. In their own videos the creator was
 * holding the device. A script written from a news story is not: nobody has the
 * phone. Emitting "look, the gimbal turns like this" for hardware they have
 * never touched hands them something they cannot shoot, and they find out
 * halfway through recording, which is worse than no cue at all because the cue
 * read as a plan.
 *
 * So the density comes from the FORMAT, not from the creator (the same person's
 * price list is 4% and their demo 44%), and what may be pointed at is an
 * explicit allow-list per format. Hands-on demonstration is never on it.
 */
function renderOnScreen(cv, format) {
  const on = format?.onScreen;
  if (!on) return "";

  const phrases = Array.isArray(cv?.show_me_phrases) ? cv.show_me_phrases.filter(Boolean) : [];

  const howOften = {
    high: "Point at the screen often, several times in this script.",
    some: "Point at the screen two or three times across this script, at the moments where there is genuinely something to look at.",
    low: "Point at the screen sparingly, once or twice in the whole script.",
  }[on.density] || "Point at the screen only where there is genuinely something to look at.";

  return `

════════ WHAT IS ON SCREEN ════════
This person does not just narrate, they SHOW things, and the script has to carry
that or it cannot be recorded. ${howOften}

${phrases.length
  ? `Use THEIR OWN words for it where one fits, verbatim:\n${phrases.map((p) => `  • "${p}"`).join("\n")}
Each fits a particular kind of shot. Use one only where it matches what is on
screen at that moment; where none fits, point plainly in their own idiom.`
  : `We did not capture their pointing phrases, so keep these plain and in their own
idiom rather than inventing a catchphrase.`}

YOU MAY ONLY POINT AT: ${on.cueTo}.

NEVER write a cue for something nobody has filmed. Do not describe holding the
product, turning it, pressing it, or demonstrating it working. Do not PLACE it
either: not on their desk, not in front of them, not next to anything. A draft
for an unreleased laptop said "here on my desk you can see" and passed this
rule, because it never touched the thing, which is the loophole this sentence
closes. Pointing at a picture is fine; pointing at an object in the room is not.
The creator is writing about news, they do not have this device, and a cue they
cannot shoot is worse than no cue: they discover it halfway through recording.
If there is nothing real to look at for a point, just say the point.`;
}

/**
 * The rule that makes the script a performance rather than an essay.
 *
 * ── WHY LISTING THE FIELDS IS NOT ENOUGH ────────────────────────────────────
 * renderCategoryVoice puts these in front of the model as description, and a
 * model reading "how they bring in their own experience: they open with a
 * childhood memory" will happily produce a script containing none of it. The
 * fields say what is TRUE of the creator; this says what the draft must DO.
 *
 * Stated as a proportion rather than a count because the right number depends
 * on length, and a count would produce four reaction beats in a forty-second
 * Short. The proportions are the measured ones: across four of this creator's
 * videos, 12% of sentences carried a personal reaction and 6% stopped to
 * explain something. Asking for "about one in eight" reproduces the texture
 * without pretending to a precision the measurement does not have.
 *
 * Degrades to a bare string when a profile has no category voice, which is what
 * every profile built before this change looks like until it is re-analysed.
 */
export function renderPerformanceRule(profile) {
  const cv = profile?.category_voice;
  const has = (k) => {
    const v = cv?.[k];
    return Array.isArray(v) ? v.length > 0 : !!String(v || "").trim();
  };
  if (!cv || !(has("personal_anecdote") || has("explainer_move") || has("reaction_beats") ||
               has("viewer_advice") || has("native_metaphor"))) {
    return `PERFORMANCE. This is spoken out loud by a person on camera, not read off a page.
   Let some sentences carry a reaction rather than a fact, and explain anything
   the audience plausibly has not heard of instead of assuming it.`;
  }

  const bits = [];
  if (has("personal_anecdote") || has("reaction_beats")) {
    bits.push(
      `- REACT, do not only report. About one sentence in eight should carry a feeling
     rather than a fact, and several of theirs are a short standalone sentence
     rather than a clause bolted onto a longer one. Their reaction lines quoted
     above are safe to reuse as they stand, because they carry tone and nothing
     else.
     Their personal anecdote is NOT. It is there to show you the shape of the
     move, and the move only works when this material genuinely calls for it. Do
     not invent a memory or an experience to reach the count. Reacting to what is
     actually in front of you is the point; a fabricated childhood is not a
     reaction, it is a lie in their voice.`
    );
  }
  if (has("explainer_move")) {
    bits.push(
      `- EXPLAIN WHAT THEY WOULD EXPLAIN. Whenever a company, an acronym or a unit comes
     up that this audience plausibly does not know, stop and say what it is, in one
     short line, using their own explaining move quoted above. A viewer who does not
     know the name gets nothing from the sentence otherwise. Do NOT explain things
     they obviously know, and never add a fact the sources do not contain in order
     to explain something.`
    );
  }
  if (has("viewer_advice")) {
    bits.push(
      `- TELL THEM WHAT TO DO. Where the material supports it, say what the viewer should
     actually do about this, in their words. That is a different thing from judging
     the product and it is what their audience comes back for.`
    );
  }
  if (has("native_metaphor")) {
    bits.push(
      `- Use their own turns of phrase where one fits. Do not force one into every
     paragraph; one landing well beats three that do not.`
    );
  }

  return `PERFORMANCE. This is spoken out loud by a person on camera, not read off a page.
   A script that only states facts is correct and unusable.
${bits.join("\n")}`;
}

/**
 * Split what the model was shown into "this is theirs, repeat it" and "this
 * happened in another video, do not carry it over".
 *
 * ── THE LINE BETWEEN THEM IS WHETHER IT CARRIES A CLAIM ─────────────────────
 * A sign-off, a filler, a way of pointing at the screen and a turn of phrase
 * all carry TONE, and they are supposed to appear in every script; catching
 * those would be flagging the product working correctly.
 *
 * The descriptive fields are the opposite. The analyst writes them by quoting a
 * real sentence from a real video, so `spec_delivery` on this profile contains
 * a complete judgement about the front camera of a phone this script is not
 * about. That is the sentence the model keeps reusing, and it is the sentence
 * this split exists to isolate.
 */
function exampleAndSafeSpans(profile) {
  const cv = profile?.category_voice || {};
  const flat = (v) => (Array.isArray(v) ? v : [v]).map((x) => String(x || "").trim()).filter(Boolean);

  // Meant to recur. Never flagged.
  const safePhrases = [
    ...flat(profile.signature_phrases),
    ...flat(profile.sample_closings),
    ...flat(cv.show_me_phrases),
    ...flat(cv.reaction_beats),
    ...flat(cv.native_metaphor),
    ...flat(cv.viewer_advice),
    ...flat(cv.verdict_vocabulary),
    ...flat(cv.bulletin_transitions),
    ...flat(cv.segment_names),
    ...flat(cv.viewer_address),
    // The connective tissue is meant to recur, by definition: a particle used
    // once is not a particle. Flagging its reuse as contamination would fight
    // the block above that asks for it.
    ...flat(cv.register_markers),
    ...flat(cv.discourse_particles),
    ...flat(cv.section_transitions),
    ...flat(cv.cross_promo),
  ];

  // Illustrations of a habit, quoting other videos about other products.
  const exampleSpans = [
    ...flat(cv.spec_delivery),
    ...flat(cv.price_talk),
    ...flat(cv.comparison_habit),
    ...flat(cv.brand_handling),
    ...flat(cv.hype_calibration),
    ...flat(cv.personal_anecdote),
    ...flat(cv.explainer_move),
    ...flat(cv.compression),
    ...flat(cv.running_order),
    ...flat(cv.deal_callout),
    ...flat(profile.sample_openings),
  ];

  return { safePhrases, exampleSpans };
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

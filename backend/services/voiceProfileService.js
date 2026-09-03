/**
 * voiceProfileService.js — learn how a creator talks, from their own transcripts.
 *
 * ── WHY THE TRANSCRIPT IS SAMPLED HEAD/MIDDLE/TAIL, NOT TRUNCATED ────────────
 * The two highest-signal parts of any video are the first fifteen seconds and the
 * last twenty: the hook that decides whether anyone keeps watching, and the
 * sign-off, both of which a creator repeats almost verbatim across every upload.
 * Naive truncation ("first 3000 characters") keeps the hook and throws the entire
 * closing away, which is exactly half of what this file exists to capture. So each
 * transcript contributes a labelled head, a middle slice and a tail.
 *
 * That also keeps cost flat: five long videos cost the same to analyse as five
 * Shorts, because only ~2.2k characters of each is ever sent.
 */
import { GoogleGenAI } from "@google/genai";
import Transcript from "../models/Transcript.js";
import VoiceProfile from "../models/VoiceProfile.js";

const MODEL = process.env.GEMINI_TEXT_MODEL || process.env.GEMINI_VIDEO_MODEL || "gemini-3.5-flash";

// How many transcripts feed one profile. Beyond about eight the marginal signal is
// small and the input cost is not.
const MAX_TRANSCRIPTS = parseInt(process.env.VOICE_MAX_TRANSCRIPTS || "8", 10);

const HEAD_CHARS = 900;   // the hook, plus how they get into the topic
const MID_CHARS = 600;    // how they explain something mid-flow
const TAIL_CHARS = 700;   // the close and call to action

let _client = null;
function client() {
  if (_client) return _client;
  const key = String(process.env.AISTUDIO_KEY || "").split(",")[0].trim();
  if (!key) throw new Error("AISTUDIO_KEY is not set");
  _client = new GoogleGenAI({ apiKey: key });
  return _client;
}

/**
 * Pull the three parts of one transcript that actually carry voice.
 * Short transcripts are sent whole — slicing a 900-character Short into three
 * overlapping pieces would just repeat it.
 */
function sample(text) {
  const t = String(text || "").trim();
  if (t.length <= HEAD_CHARS + MID_CHARS + TAIL_CHARS) return { whole: t };

  const midStart = Math.floor(t.length / 2) - Math.floor(MID_CHARS / 2);
  return {
    head: t.slice(0, HEAD_CHARS),
    mid: t.slice(midStart, midStart + MID_CHARS),
    tail: t.slice(-TAIL_CHARS),
  };
}

const PROMPT_HEAD = `You are a voice analyst. Below are transcripts from ONE creator's videos, in the language they actually speak.

Your job: describe how THIS SPECIFIC PERSON talks, precisely enough that a writer could produce a new script nobody could tell apart from theirs.

Be concrete and specific. "Energetic and engaging" is useless — every creator sounds like that in a description. "Opens by addressing the viewer as भाई and asking a question that assumes they already disagree" is useful.

CRITICAL RULES:
- Quote verbatim. Every example you give must be copied EXACTLY from the transcripts, in the original script (Devanagari stays Devanagari). Never translate, never transliterate, never tidy up.
- If the creator mixes English into another language, record WHICH kinds of words stay English. This is the most distinctive thing about Indian tech creators and the easiest thing to get wrong.
- Base everything on evidence in the transcripts. If there is only one video, say what you can see and do not invent patterns you have no evidence for.
- Note their filler words and verbal tics. These are what make a script sound human rather than written.

Return STRICT JSON only:
{
  "language": "BCP-47-ish code of how they speak — hi-en for Hinglish, te-en, hi, en",
  "language_label": "human-readable, e.g. Hinglish (Hindi-English)",
  "opening_patterns": ["how they start, described concretely — 2 to 4 items"],
  "sample_openings": ["VERBATIM first sentence(s) from each transcript, original script"],
  "narration_arc": "how they move through a topic start to finish, in 2-3 sentences",
  "recurring_moves": ["rhetorical devices they reuse — 3 to 6 items"],
  "closing_patterns": ["how they end, described concretely"],
  "sample_closings": ["VERBATIM final sentence(s), original script"],
  "signature_phrases": ["VERBATIM catchphrases, fillers and connectors they repeat"],
  "vocabulary_notes": "which words stay English vs the base language, with real examples",
  "sentiment": "their habitual stance — skeptical, hyped, contrarian, explanatory, alarmed",
  "pacing": "sentence length, rhythm, use of questions, how they address the viewer",
  "audience": "who they are clearly talking to",
  "topics": ["what subjects they gravitate toward"],
  "avoid": ["things this creator never does — be specific"],
  "style_brief": "A dense instruction block, written TO a ghostwriter, telling them exactly how to write as this person. 150-250 words. Include the concrete details: how to open, what to keep in English, tics to include, how to close, what to never do. This is the single most important field."
}

TRANSCRIPTS:`;

/**
 * Build (or rebuild) the voice profile for one user.
 * @returns {{ profile, built, reason? }}
 */
export async function buildVoiceProfile(userId) {
  const transcripts = await Transcript.find({ user: userId, status: "done", text: { $ne: "" } })
    .sort({ created_at: -1 })
    .limit(MAX_TRANSCRIPTS)
    .lean();

  if (!transcripts.length) {
    return { profile: null, built: false, reason: "no_transcripts" };
  }

  const blocks = transcripts.map((t, i) => {
    const s = sample(t.text);
    const header = `--- VIDEO ${i + 1}${t.title ? `: ${t.title}` : ""} (${t.language_label || t.language || "unknown language"}) ---`;
    if (s.whole) return `${header}\n${s.whole}`;
    return (
      `${header}\n` +
      `[OPENING]\n${s.head}\n\n` +
      `[MIDDLE]\n${s.mid}\n\n` +
      `[ENDING]\n${s.tail}`
    );
  });

  let res;
  try {
    res = await client().models.generateContent({
      model: MODEL,
      contents: `${PROMPT_HEAD}\n\n${blocks.join("\n\n")}`,
      config: {
        temperature: 0.3,
        responseMimeType: "application/json",
        maxOutputTokens: 8192,
        // Thinking off, consistent with the measured finding in geminiClient.js.
        // This is pattern-spotting over text that is already in front of the model,
        // not multi-step reasoning. Raise deliberately and re-measure if the
        // profiles ever come back generic.
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
  } catch (err) {
    console.error("[voice] Gemini call failed:", err.message);
    throw new Error("Couldn't analyse your videos right now. Please try again.");
  }

  let parsed;
  try {
    parsed = JSON.parse(res.text || "{}");
  } catch {
    console.error("[voice] unparseable response");
    throw new Error("Couldn't read the voice analysis. Please try again.");
  }

  // Fall back to the transcripts' own language rather than whatever the analyser
  // decided — the transcriber saw the actual audio, this pass only saw text.
  const language = parsed.language || transcripts[0].language || "";
  const languageLabel = parsed.language_label || transcripts[0].language_label || "";

  const usage = readUsage(res);
  const confidence = transcripts.length >= 5 ? "good" : transcripts.length >= 3 ? "fair" : "thin";

  const doc = await VoiceProfile.findOneAndUpdate(
    { user: userId },
    {
      $set: {
        built_from: transcripts.map((t) => t._id),
        transcript_count: transcripts.length,
        language,
        language_label: languageLabel,
        opening_patterns: arr(parsed.opening_patterns),
        sample_openings: arr(parsed.sample_openings),
        narration_arc: str(parsed.narration_arc),
        recurring_moves: arr(parsed.recurring_moves),
        closing_patterns: arr(parsed.closing_patterns),
        sample_closings: arr(parsed.sample_closings),
        signature_phrases: arr(parsed.signature_phrases),
        vocabulary_notes: str(parsed.vocabulary_notes),
        sentiment: str(parsed.sentiment),
        pacing: str(parsed.pacing),
        audience: str(parsed.audience),
        topics: arr(parsed.topics),
        avoid: arr(parsed.avoid),
        style_brief: str(parsed.style_brief, 4000),
        confidence,
        usage,
        built_at: new Date(),
      },
      $setOnInsert: { user: userId, created_at: new Date() },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log(
    `[voice] profile for ${userId} from ${transcripts.length} transcript(s) · ` +
    `${languageLabel || language || "?"} · ${confidence} · $${usage.usd.toFixed(4)}`
  );

  return { profile: doc, built: true };
}

/**
 * The profile to write with, rebuilding only when it is missing or has never seen
 * transcripts the user has since added. Generation must not silently pay for a
 * rebuild on every script.
 */
export async function getUsableProfile(userId, { autoBuild = true } = {}) {
  const existing = await VoiceProfile.findOne({ user: userId });
  if (!existing) {
    if (!autoBuild) return null;
    const { profile } = await buildVoiceProfile(userId);
    return profile;
  }

  if (autoBuild) {
    const total = await Transcript.countDocuments({ user: userId, status: "done", text: { $ne: "" } });
    const seen = existing.transcript_count || 0;
    // Only rebuild when there is genuinely more to learn from, and stop counting
    // past the cap — otherwise every new video past the eighth triggers a rebuild
    // that reads the same eight transcripts.
    if (total > seen && seen < MAX_TRANSCRIPTS) {
      const { profile } = await buildVoiceProfile(userId);
      return profile || existing;
    }
  }

  return existing;
}

/** Is the stored profile behind the user's transcripts? Drives the UI nudge. */
export async function profileStatus(userId) {
  const [profile, total] = await Promise.all([
    VoiceProfile.findOne({ user: userId }).lean(),
    Transcript.countDocuments({ user: userId, status: "done", text: { $ne: "" } }),
  ]);
  return {
    profile,
    transcripts_available: total,
    stale: !!profile && total > (profile.transcript_count || 0) && (profile.transcript_count || 0) < MAX_TRANSCRIPTS,
  };
}

function arr(v) {
  return Array.isArray(v) ? v.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 12) : [];
}
function str(v, max = 1200) {
  return String(v || "").trim().slice(0, max);
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

export default { buildVoiceProfile, getUsableProfile, profileStatus };

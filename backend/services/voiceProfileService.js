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
import { measureVoice, metricsBlock } from "./voiceMetrics.js";

const MODEL = process.env.GEMINI_TEXT_MODEL || process.env.GEMINI_VIDEO_MODEL || "gemini-3.5-flash";

// How many transcripts feed one profile. Beyond about eight the marginal signal is
// small and the input cost is not.
const MAX_TRANSCRIPTS = parseInt(process.env.VOICE_MAX_TRANSCRIPTS || "8", 10);

// How long a failed automatic rebuild is left alone before it is worth trying
// again. Only affects the silent path; pressing "Analyse my voice" always runs.
const REBUILD_COOLDOWN_MS = parseInt(process.env.VOICE_REBUILD_COOLDOWN_MIN || "60", 10) * 60000;

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
  "sample_openings": ["ONE verbatim opening sentence per transcript, original script, at most 25 words each"],
  "narration_arc": "how they move through a topic start to finish, in 2-3 sentences",
  "recurring_moves": ["rhetorical devices they reuse — 3 to 6 items"],
  "closing_patterns": ["how they end, described concretely"],
  "sample_closings": ["ONE verbatim closing sentence per transcript, original script, at most 25 words each"],
  "signature_phrases": ["VERBATIM catchphrases, fillers and connectors they repeat — up to 10"],
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
 * The retry schema. Same analysis, none of the long-form fields.
 *
 * style_brief is the field the script writer actually leans on, so it survives;
 * what goes is the descriptive prose that a ghostwriter could infer from the
 * brief anyway. Roughly a third of the output tokens of the full form, which is
 * the point: this exists for the case where the full form did not fit.
 */
const PROMPT_COMPACT = `You are a voice analyst. Below are transcripts from ONE creator's videos, in the language they actually speak.

Describe how THIS SPECIFIC PERSON talks, precisely enough that a writer could produce a new script nobody could tell apart from theirs.

Quote verbatim, in the original script. Never translate, never transliterate, never tidy up. Record which kinds of words they keep in English.

Keep every field SHORT. Return STRICT JSON only, no markdown fences:
{
  "language": "BCP-47-ish code — hi-en, te-en, hi, en",
  "language_label": "human-readable, e.g. Telugu-English",
  "sample_openings": ["one verbatim opening per transcript, max 20 words each"],
  "sample_closings": ["one verbatim closing per transcript, max 20 words each"],
  "signature_phrases": ["up to 8 verbatim fillers and catchphrases"],
  "vocabulary_notes": "which words stay English vs the base language, one sentence",
  "sentiment": "their habitual stance, a few words",
  "pacing": "rhythm and how they address the viewer, one sentence",
  "audience": "who they are talking to, a few words",
  "style_brief": "A dense instruction block written TO a ghostwriter: how to open, what to keep in English, tics to include, how to close, what never to do. 120-180 words. This is the most important field."
}

TRANSCRIPTS:`;

/**
 * One analysis call, with the response parsed as leniently as it can safely be.
 *
 * @returns {{ parsed: object|null, res: object|null }}
 */
async function analyse(body, compact) {
  const head = compact ? PROMPT_COMPACT : PROMPT_HEAD;

  let res;
  try {
    res = await client().models.generateContent({
      model: MODEL,
      contents: `${head}\n\n${body}`,
      config: {
        temperature: compact ? 0.1 : 0.3,
        responseMimeType: "application/json",
        // Was 8192, which is where this broke. A profile quoting Telugu or
        // Devanagari verbatim runs several times the tokens of the same profile
        // in English, and the overflow was silent: the model returned a JSON
        // object cut off mid-string, JSON.parse threw, and the only thing logged
        // was "unparseable response" with none of the evidence.
        maxOutputTokens: 32768,
        // Thinking off, consistent with the measured finding in geminiClient.js.
        // This is pattern-spotting over text that is already in front of the
        // model, not multi-step reasoning. thoughtsTokenCount is logged below so
        // that a model quietly ignoring this is visible rather than inferred.
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
  } catch (err) {
    console.error(`[voice] Gemini call failed (compact=${compact}):`, err.message);
    return { parsed: null, res: null };
  }

  const raw = res?.text || "";
  const finish = res?.candidates?.[0]?.finishReason || "unknown";
  const u = res?.usageMetadata || {};

  const parsed = parseLooseJson(raw);

  if (!parsed) {
    // Everything needed to tell truncation from a refusal from a fenced reply,
    // without dumping a creator's transcript into the logs.
    console.error(
      `[voice] unparseable response (compact=${compact}) · finishReason=${finish} · ` +
      `in=${u.promptTokenCount || 0} out=${u.candidatesTokenCount || 0} thoughts=${u.thoughtsTokenCount || 0} · ` +
      `${raw.length} chars · starts: ${JSON.stringify(raw.slice(0, 120))} · ends: ${JSON.stringify(raw.slice(-120))}`
    );
  } else if (finish && finish !== "STOP") {
    console.warn(`[voice] salvaged a ${finish} response (compact=${compact}) — ${Object.keys(parsed).length} fields recovered`);
  }

  return { parsed, res };
}

/**
 * Parse JSON that may be fenced, prefixed with prose, or cut off mid-write.
 *
 * The salvage matters because the tokens are already paid for. A response that
 * stopped at MAX_TOKENS still holds most of a usable profile, and throwing it
 * away bills the user twice for the same analysis — the same reasoning as the
 * transcription salvage in geminiClient.js.
 */
export function parseLooseJson(raw) {
  let s = String(raw || "").trim();
  if (!s) return null;

  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const start = s.indexOf("{");
  if (start > 0) s = s.slice(start);
  if (start === -1) return null;

  try { return JSON.parse(s); } catch { /* truncated — fall through */ }

  // Walk the text tracking string state and nesting, and remember the last comma
  // that separated two TOP-LEVEL fields. Everything before it is a run of
  // complete key/value pairs, so cutting there and closing the brace yields
  // valid JSON holding every field that finished writing.
  let inStr = false, esc = false, depth = 0, lastTopComma = -1;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;

    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") depth--;
    else if (c === "," && depth === 1) lastTopComma = i;
  }

  if (lastTopComma === -1) return null;   // died inside the very first field

  try {
    return JSON.parse(s.slice(0, lastTopComma) + "}");
  } catch {
    return null;
  }
}

/**
 * Is this parse good enough to write scripts from?
 *
 * A salvage can succeed at the JSON level and still be worthless — recovering
 * `{"language": "te-en"}` is valid JSON and tells a ghostwriter nothing. Storing
 * that would be worse than failing, because the user would see a built profile
 * and get generic scripts from it with no idea why. style_brief is what the
 * writer actually leans on; failing that, enough raw voice to work from.
 */
function usable(p) {
  if (!p) return false;
  if (String(p.style_brief || "").trim().length >= 80) return true;
  return (
    Array.isArray(p.sample_openings) && p.sample_openings.length > 0 &&
    Array.isArray(p.signature_phrases) && p.signature_phrases.length > 0
  );
}

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

  const body = blocks.join("\n\n");

  let { parsed, res } = await analyse(body, false);

  // One retry, and only when the first response could not be salvaged at all.
  // Almost always a truncation: a profile full of verbatim Telugu or Devanagari
  // is several times more output tokens than the same profile in English,
  // because Indic scripts tokenise far denser than Latin. The retry asks for the
  // short form, which fits comfortably even in the worst case.
  if (!usable(parsed)) {
    console.warn("[voice] first pass unusable — retrying with the compact schema");
    ({ parsed, res } = await analyse(body, true));
  }

  if (!usable(parsed)) {
    throw new Error("Couldn't read the voice analysis. Please try again.");
  }

  // Fall back to the transcripts' own language rather than whatever the analyser
  // decided — the transcriber saw the actual audio, this pass only saw text.
  const language = parsed.language || transcripts[0].language || "";
  const languageLabel = parsed.language_label || transcripts[0].language_label || "";

  const usage = readUsage(res);
  const confidence = transcripts.length >= 5 ? "good" : transcripts.length >= 3 ? "fair" : "thin";

  // Always written: these describe the build itself, not what was learned.
  const set = {
    built_from: transcripts.map((t) => t._id),
    transcript_count: transcripts.length,
    language,
    language_label: languageLabel,
    confidence,
    usage,
    metrics,
    built_at: new Date(),
    build_failed_at: null,
  };

  // Written only when this pass actually produced something.
  //
  // A salvaged or compact result carries fewer fields than the full schema, and
  // blindly $set-ing the missing ones to "" would let a degraded rebuild ERASE a
  // good profile built last week. Skipping the empties means a partial result
  // can only ever improve what is stored.
  const learned = {
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
  };
  for (const [k, v] of Object.entries(learned)) {
    if (Array.isArray(v) ? v.length : v) set[k] = v;
  }

  const doc = await VoiceProfile.findOneAndUpdate(
    { user: userId },
    { $set: set, $setOnInsert: { user: userId, created_at: new Date() } },
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
      // A rebuild that failed a minute ago will fail again now: same transcripts,
      // same prompt, same outcome, same bill. Before this, a profile the analyser
      // could not parse meant EVERY subsequent script generation paid for two
      // more analysis calls and still produced nothing.
      const failedAt = existing.build_failed_at ? new Date(existing.build_failed_at).getTime() : 0;
      if (Date.now() - failedAt < REBUILD_COOLDOWN_MS) return existing;

      try {
        const { profile } = await buildVoiceProfile(userId);
        return profile || existing;
      } catch (err) {
        console.error("[voice] auto-rebuild failed, writing with the existing profile:", err.message);
        await VoiceProfile.updateOne(
          { user: userId },
          { $set: { build_failed_at: new Date() } }
        ).catch(() => {});
        // A slightly out-of-date voice beats no script at all. The explicit
        // "Analyse my voice" button is still there and still reports failures.
        return existing;
      }
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

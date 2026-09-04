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
 *
 * ── VOICE SETS ───────────────────────────────────────────────────────────────
 * Everything here is scoped to ONE voice set (see models/VoiceProfile.js). A
 * creator can keep several — their Hindi channel and their English one — and
 * each owns its own videos, its own analysis and its own name. The functions in
 * the first block below manage the sets; the rest analyses one of them.
 */
import mongoose from "mongoose";
import { GoogleGenAI } from "@google/genai";
import Transcript from "../models/Transcript.js";
import Script from "../models/Script.js";
import VoiceProfile from "../models/VoiceProfile.js";
import { measureVoice } from "./voiceMetrics.js";

const MODEL = process.env.GEMINI_TEXT_MODEL || process.env.GEMINI_VIDEO_MODEL || "gemini-3.5-flash";

// How many voice sets one account may keep.
//
// This is a spend ceiling, not a tidiness rule. Every set carries its own slots
// of videos, and reading a video is the single expensive thing this product
// does — an unbounded number of sets is an unbounded transcription bill from one
// account. The daily cap in routes/transcribe.js limits the rate; this limits
// the total.
export const MAX_VOICES = Math.max(1, parseInt(process.env.MAX_VOICE_PROFILES || "5", 10));

// How many transcripts feed one profile. Beyond about eight the marginal signal is
// small and the input cost is not.
const MAX_TRANSCRIPTS = parseInt(process.env.VOICE_MAX_TRANSCRIPTS || "8", 10);

// How long a failed automatic rebuild is left alone before it is worth trying
// again. Only affects the silent path; pressing "Analyse my voice" always runs.
const REBUILD_COOLDOWN_MS = parseInt(process.env.VOICE_REBUILD_COOLDOWN_MIN || "60", 10) * 60000;

const HEAD_CHARS = 900;   // the hook, plus how they get into the topic
const MID_CHARS = 600;    // how they explain something mid-flow
const TAIL_CHARS = 700;   // the close and call to action

/* ── Voice sets ─────────────────────────────────────────────────────────────
   Creating, listing, naming and removing the containers. Nothing here calls a
   model or costs anything. */

/**
 * Adopt rows written before voice sets existed.
 *
 * A transcript or script with no `voice` predates this feature. Left alone it
 * would vanish from every per-set list — a creator would open "My voice" after
 * the deploy and find their five videos gone. So the first set a user has takes
 * ownership of everything unclaimed.
 *
 * Idempotent, and cheap when there is nothing to do: the count is an index hit
 * and the updates only run when it is non-zero. Safe to call on every request
 * that needs a set, which is what makes the migration script optional rather
 * than load-bearing.
 */
async function adoptOrphans(userId, voiceId) {
  const orphans = await Transcript.countDocuments({ user: userId, voice: null });
  if (orphans > 0) {
    await Transcript.updateMany({ user: userId, voice: null }, { $set: { voice: voiceId } });
    console.log(`[voice] adopted ${orphans} pre-existing video(s) into voice ${voiceId}`);
  }
  // Scripts too, or "My scripts" filtered by voice would show an empty history
  // to someone who has written thirty.
  await Script.updateMany(
    { user: userId, $or: [{ voice: null }, { voice: { $exists: false } }] },
    { $set: { voice: voiceId } }
  ).catch(() => {});
}

/**
 * The user's voice sets, oldest first, each with the counts the UI needs.
 *
 * One aggregate for the video counts rather than two queries per set: a creator
 * with five sets would otherwise cost ten round trips to render a dropdown.
 */
export async function listVoices(userId) {
  const uid = new mongoose.Types.ObjectId(String(userId));
  const [voices, counts] = await Promise.all([
    VoiceProfile.find({ user: userId }).sort({ created_at: 1 }).lean(),
    Transcript.aggregate([
      { $match: { user: uid } },
      {
        $group: {
          _id: "$voice",
          // "Held" is what fills a slot: anything not failed, including a video
          // still processing. "Ready" is what analysis can actually read.
          held: { $sum: { $cond: [{ $ne: ["$status", "failed"] }, 1, 0] } },
          ready: {
            $sum: { $cond: [{ $and: [{ $eq: ["$status", "done"] }, { $ne: ["$text", ""] }] }, 1, 0] },
          },
        },
      },
    ]).catch(() => []),
  ]);

  const byVoice = new Map(counts.map((c) => [String(c._id), c]));
  return voices.map((v) => shapeVoice(v, byVoice.get(String(v._id))));
}

/** The list shape every screen renders from. Never includes the style brief. */
export function shapeVoice(v, count) {
  const held = count?.held || 0;
  const ready = count?.ready || 0;
  const built = !!v.built_at;
  const maxVideos = parseInt(process.env.MAX_VOICE_VIDEOS || "5", 10);

  return {
    id: String(v._id),
    name: v.name || "",
    is_default: !!v.is_default,
    built,
    // The one thing the UI blocks on: a set that has been analysed but never
    // named needs a name before it is any use in a dropdown.
    needs_name: built && !String(v.name || "").trim(),
    videos: { used: held, ready, max: maxVideos, left: Math.max(0, maxVideos - held) },
    transcript_count: v.transcript_count || 0,
    language: v.language || "",
    language_label: v.language_label || "",
    confidence: v.confidence || "thin",
    // Behind if the set holds videos the analysis never saw. Counted against
    // what is READY, since a still-processing video was never analysable.
    stale: built && (v.transcript_count || 0) !== ready,
    built_at: v.built_at || null,
    created_at: v.created_at,
  };
}

/**
 * The set to act on when the caller didn't name one, creating the first one if
 * this account has never had any.
 */
export async function ensureVoice(userId) {
  let voices = await VoiceProfile.find({ user: userId }).sort({ created_at: 1 });

  if (!voices.length) {
    const created = await VoiceProfile.create({
      user: userId,
      name: "",
      is_default: true,
      created_at: new Date(),
    });
    // Re-read rather than trusting the insert: two requests arriving together
    // can both find nothing and both create. Whoever is second sees both rows
    // here and the repair below settles on the older one, so the worst case is
    // one spare empty set rather than a user with two conflicting defaults.
    voices = await VoiceProfile.find({ user: userId }).sort({ created_at: 1 });
    if (!voices.length) voices = [created];
  }

  // Exactly one default. Repaired rather than assumed — a stale flag decides
  // which set a script gets written in, so "probably right" is not good enough.
  const defaults = voices.filter((v) => v.is_default);
  let active = defaults[0] || voices[0];
  if (defaults.length !== 1 || !active.is_default) {
    await VoiceProfile.updateMany({ user: userId, _id: { $ne: active._id } }, { $set: { is_default: false } });
    await VoiceProfile.updateOne({ _id: active._id }, { $set: { is_default: true } });
    active.is_default = true;
  }

  await adoptOrphans(userId, active._id);
  return active;
}

/**
 * Resolve a caller-supplied voice id to one of this user's sets.
 *
 * Falls back to the default rather than erroring: an id from a stale tab, or a
 * set deleted in another window, should land the creator on a working screen,
 * not on "not found". Returns { voice, requested_missing }.
 */
export async function resolveVoice(userId, voiceId) {
  const id = String(voiceId || "").trim();
  if (id && mongoose.Types.ObjectId.isValid(id)) {
    const found = await VoiceProfile.findOne({ _id: id, user: userId });
    if (found) return { voice: found, requested_missing: false };
    return { voice: await ensureVoice(userId), requested_missing: true };
  }
  return { voice: await ensureVoice(userId), requested_missing: false };
}

/** A new, empty set. Refuses past the ceiling rather than silently capping. */
export async function createVoice(userId, name = "") {
  const held = await VoiceProfile.countDocuments({ user: userId });
  if (held >= MAX_VOICES) {
    const err = new Error(`You can keep ${MAX_VOICES} voices. Delete one to add another.`);
    err.limit_reached = true;
    throw err;
  }
  return VoiceProfile.create({
    user: userId,
    name: String(name || "").trim().slice(0, 60),
    // Never steals the default from an existing set — switching which voice
    // writes is the creator's choice, not a side effect of making a new one.
    is_default: held === 0,
    created_at: new Date(),
  });
}

export async function renameVoice(userId, voiceId, name) {
  const clean = String(name || "").trim().slice(0, 60);
  if (!clean) throw new Error("Give this voice a name.");
  return VoiceProfile.findOneAndUpdate(
    { _id: voiceId, user: userId },
    { $set: { name: clean } },
    { new: true }
  );
}

/** Make this the set the app opens on. */
export async function setDefaultVoice(userId, voiceId) {
  const target = await VoiceProfile.findOne({ _id: voiceId, user: userId });
  if (!target) return null;
  await VoiceProfile.updateMany({ user: userId, _id: { $ne: target._id } }, { $set: { is_default: false } });
  await VoiceProfile.updateOne({ _id: target._id }, { $set: { is_default: true } });
  return target;
}

/**
 * Delete a set and the videos that taught it.
 *
 * Scripts are NOT deleted. They are the thing the creator paid for, and losing
 * six months of writing because they tidied up a voice would be unforgivable —
 * they keep the copied voice_name and simply stop matching that filter.
 *
 * The last set cannot be deleted: with none left there is nowhere for the next
 * video to go, and the app would be creating one back a moment later anyway.
 */
export async function deleteVoice(userId, voiceId) {
  // Ownership is checked BEFORE the "is this your last one" rule, and both are
  // checked before anything is removed. The other order answers "this is your
  // only voice" to someone deleting a set that isn't theirs — a confusing reply
  // to the wrong question, and one that reports on their own account instead of
  // simply saying the id was not found.
  const target = await VoiceProfile.findOne({ _id: voiceId, user: userId });
  if (!target) return null;

  const count = await VoiceProfile.countDocuments({ user: userId });
  if (count <= 1) {
    const err = new Error("This is your only voice. Delete its videos instead, or make another first.");
    err.last_one = true;
    throw err;
  }

  const doc = await VoiceProfile.findOneAndDelete({ _id: target._id, user: userId });
  if (!doc) return null;

  await Transcript.deleteMany({ user: userId, voice: doc._id });
  // Detach rather than delete, so the scripts survive with their labels intact.
  await Script.updateMany({ user: userId, voice: doc._id }, { $set: { voice: null } }).catch(() => {});

  if (doc.is_default) await ensureVoice(userId);   // promotes the next one
  return doc;
}

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
 * Build (or rebuild) one voice set's profile, from the videos in THAT set.
 *
 * @param {string} userId
 * @param {string} [voiceId]  which set. Omitted means the user's default.
 * @returns {{ profile, built, reason? }}
 */
export async function buildVoiceProfile(userId, voiceId) {
  const { voice } = await resolveVoice(userId, voiceId);

  const transcripts = await Transcript.find({
    user: userId,
    voice: voice._id,
    status: "done",
    text: { $ne: "" },
  })
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

  // Counted, not described — code-mixing ratio, sentence lengths, the English
  // words they actually keep, their measured speaking rate. This line was
  // MISSING while `metrics` was still referenced in the $set below, so every
  // call to this function threw a ReferenceError before it could write anything:
  // voice analysis could not succeed at all. It is also what supplies
  // words_per_second, which is how a chosen duration becomes a word target in
  // scriptWriterService.js.
  const metrics = measureVoice(transcripts);

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

  // Scoped to the set AND the user: a voice id alone must never be enough to
  // overwrite someone else's profile.
  const doc = await VoiceProfile.findOneAndUpdate(
    { _id: voice._id, user: userId },
    { $set: set },
    { new: true }
  );

  console.log(
    `[voice] profile ${voice._id} for ${userId} from ${transcripts.length} transcript(s) · ` +
    `${languageLabel || language || "?"} · ${confidence} · $${usage.usd.toFixed(4)}`
  );

  return { profile: doc, built: true };
}

/**
 * The profile to write with, rebuilding only when it is missing or has never seen
 * transcripts the user has since added. Generation must not silently pay for a
 * rebuild on every script.
 *
 * @param {string} userId
 * @param {{ voiceId?: string, autoBuild?: boolean }} opts
 */
export async function getUsableProfile(userId, { voiceId, autoBuild = true } = {}) {
  const { voice } = await resolveVoice(userId, voiceId);

  // A set with nothing learned yet is not a profile. built_at is the marker:
  // the row exists from the moment the set is created, so its mere presence
  // says nothing about whether anything has been analysed.
  const existing = voice.built_at ? voice : null;

  if (!existing) {
    if (!autoBuild) return null;
    const { profile } = await buildVoiceProfile(userId, voice._id);
    return profile;
  }

  if (autoBuild) {
    const total = await Transcript.countDocuments({
      user: userId, voice: voice._id, status: "done", text: { $ne: "" },
    });
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
        const { profile } = await buildVoiceProfile(userId, voice._id);
        return profile || existing;
      } catch (err) {
        console.error("[voice] auto-rebuild failed, writing with the existing profile:", err.message);
        await VoiceProfile.updateOne(
          { _id: voice._id, user: userId },
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

/**
 * Is one set's profile behind the videos in it? Drives the UI nudge.
 * @param {string} [voiceId]  omitted means the user's default set
 */
export async function profileStatus(userId, voiceId) {
  const { voice } = await resolveVoice(userId, voiceId);
  const total = await Transcript.countDocuments({
    user: userId, voice: voice._id, status: "done", text: { $ne: "" },
  });
  const profile = voice.built_at ? voice.toObject?.() ?? voice : null;

  return {
    voice,
    profile,
    transcripts_available: total,
    stale:
      !!profile &&
      total > (profile.transcript_count || 0) &&
      (profile.transcript_count || 0) < MAX_TRANSCRIPTS,
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

export default {
  buildVoiceProfile, getUsableProfile, profileStatus,
  listVoices, ensureVoice, resolveVoice, createVoice, renameVoice, setDefaultVoice, deleteVoice,
  shapeVoice, MAX_VOICES,
};

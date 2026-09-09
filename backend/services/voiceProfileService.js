/**
 * voiceProfileService.js: learn how a creator talks, from their own transcripts.
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
 * ── ONE PROFILE AT A TIME ────────────────────────────────────────────────────
 * Everything here is scoped to ONE profile (models/Profile.js), a single
 * channel, with a single voice, learned from the videos in that profile only.
 * The containers themselves are managed in services/profileService.js; this file
 * only analyses one of them.
 */
import { GoogleGenAI } from "@google/genai";
import Transcript from "../models/Transcript.js";
import VoiceProfile from "../models/VoiceProfile.js";
import { resolveProfile, voiceFor } from "./profileService.js";
import { measureVoice } from "./voiceMetrics.js";
import { transcribeYouTube } from "./geminiClient.js";
import { publishUserEvent } from "./newsEvents.js";
import { voiceSpecFor } from "./categories.js";
import {
  SHORT, LONG, laneQuery, laneForScript, laneReady, voiceForLane, laneStatus, LONG_MIN_VIDEOS,
} from "./voiceLanes.js";

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

// The long lane's interior budget, split across several slices rather than
// taken as one block. See sample() for why: transitions live at story
// boundaries, and one centre slice catches at most one of them.
const LONG_MID_CHARS = parseInt(process.env.VOICE_LONG_MID_CHARS || "750", 10);
const LONG_MID_SLICES = parseInt(process.env.VOICE_LONG_MID_SLICES || "3", 10);


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
 * Short transcripts are sent whole, slicing a 900-character Short into three
 * overlapping pieces would just repeat it.
 */
function sample(text, lane = SHORT) {
  const t = String(text || "").trim();
  if (t.length <= HEAD_CHARS + MID_CHARS + TAIL_CHARS) return { whole: t };

  const head = t.slice(0, HEAD_CHARS);
  const tail = t.slice(-TAIL_CHARS);

  if (lane !== LONG) {
    const midStart = Math.floor(t.length / 2) - Math.floor(MID_CHARS / 2);
    return { head, mid: t.slice(midStart, midStart + MID_CHARS), tail };
  }

  // ── THE LONG LANE NEEDS THE MIDDLE, PLURAL ────────────────────────────────
  // One centre slice is the right sample for a Short, where the middle is just
  // "how they explain something". It is the wrong sample for a bulletin, where
  // the thing we are here to learn, the join from one story to the next, happens
  // at every boundary between items and nowhere else.
  //
  // A fourteen-story video has thirteen of those joins spread evenly through it,
  // and a single centre slice catches at most one, by luck. Three evenly spaced
  // slices catch three or four, which is enough for the analyst to see a repeated
  // habit rather than one instance it might mistake for a rule. Costs about 150
  // extra characters per transcript, against an input budget of thousands.
  const body = t.slice(HEAD_CHARS, t.length - TAIL_CHARS);
  const each = Math.round(LONG_MID_CHARS / LONG_MID_SLICES);
  const mids = [];
  for (let i = 0; i < LONG_MID_SLICES; i++) {
    // Spread across the interior at 1/4, 2/4, 3/4 rather than at the very edges,
    // which would overlap the head and tail we already have.
    const at = Math.floor((body.length * (i + 1)) / (LONG_MID_SLICES + 1)) - Math.floor(each / 2);
    const from = Math.max(0, Math.min(at, body.length - each));
    const slice = body.slice(from, from + each).trim();
    if (slice) mids.push(slice);
  }

  return { head, mids, tail };
}

const PROMPT_HEAD = `You are a voice analyst. Below are transcripts from ONE creator's videos, in the language they actually speak.

Your job: describe how THIS SPECIFIC PERSON talks, precisely enough that a writer could produce a new script nobody could tell apart from theirs.

Be concrete and specific. "Energetic and engaging" is useless, every creator sounds like that in a description. "Opens by addressing the viewer as भाई and asking a question that assumes they already disagree" is useful.

CRITICAL RULES:
- Quote verbatim. Every example you give must be copied EXACTLY from the transcripts, in the original script (Devanagari stays Devanagari). Never translate, never transliterate, never tidy up.
- If the creator mixes English into another language, record WHICH kinds of words stay English. This is the most distinctive thing about Indian tech creators and the easiest thing to get wrong.
- Base everything on evidence in the transcripts. If there is only one video, say what you can see and do not invent patterns you have no evidence for.
- Note their filler words and verbal tics. These are what make a script sound human rather than written.

Return STRICT JSON only:
{
  "language": "BCP-47-ish code of how they speak, hi-en for Hinglish, te-en, hi, en",
  "language_label": "human-readable, e.g. Hinglish (Hindi-English)",
  "opening_patterns": ["how they start, described concretely, 2 to 4 items"],
  "sample_openings": ["ONE verbatim opening sentence per transcript, original script, at most 25 words each"],
  "narration_arc": "how they move through a topic start to finish, in 2-3 sentences",
  "recurring_moves": ["rhetorical devices they reuse, 3 to 6 items"],
  "closing_patterns": ["how they end, described concretely"],
  "sample_closings": ["ONE verbatim closing sentence per transcript, original script, at most 25 words each"],
  "signature_phrases": ["VERBATIM catchphrases, fillers and connectors they repeat, up to 10"],
  "vocabulary_notes": "which words stay English vs the base language, with real examples",
  "sentiment": "their habitual stance, skeptical, hyped, contrarian, explanatory, alarmed",
  "pacing": "sentence length, rhythm, use of questions, how they address the viewer",
  "audience": "who they are clearly talking to",
  "topics": ["what subjects they gravitate toward"],
  "avoid": ["things this creator never does, be specific"],
  "style_brief": "A dense instruction block, written TO a ghostwriter, telling them exactly how to write as this person. 150-250 words. Include the concrete details: how to open, what to keep in English, tics to include, how to close, what to never do. This is the single most important field."
}

TRANSCRIPTS:`;

/**
 * What this lane is being analysed FOR, stated to the analyst.
 *
 * ── WHY THE LANES GET DIFFERENT INSTRUCTIONS AND NOT JUST DIFFERENT INPUT ────
 * Handing long transcripts to the short-form prompt produces a competent
 * analysis of the wrong thing. The prompt asks about openings and sign-offs, so
 * that is what it reports on, and a fourteen-story bulletin has exactly one of
 * each across eight minutes: the analyst dutifully describes 5% of the video and
 * ignores the structure that fills the other 95%.
 *
 * So the long lane is told what it is looking at and what matters in it. The
 * transitions field in categories.js is where the answer lands; this is what
 * makes the model go looking.
 */
const LANE_BRIEF = {
  [SHORT]: `
THESE ARE SHORT-FORM VIDEOS, under ninety seconds each. One subject per video,
start to finish. The hook and the sign-off are most of the voice here, because
there is no room for anything else, so weight them accordingly.`,

  [LONG]: `
THESE ARE LONG-FORM VIDEOS, several minutes each, and they are almost certainly
NOT one subject. This creator is covering several products or stories in
sequence in a single video.

That changes what you are looking for. The opening and the sign-off still
matter, but they are now a small fraction of the video, and the thing that
actually carries it is how this person MOVES BETWEEN ITEMS: the words they say
to close one story and start the next, whether they number them, whether they
signpost what is coming, how they signal that the last one has finished.

The excerpts below include several slices from the MIDDLE of each video for
exactly this reason. Read them for joins, not just for content. If you find a
phrase that recurs at more than one boundary, that is the single most valuable
thing in this analysis: quote every distinct one you find, verbatim.

Do not invent transitions that would be plausible for a creator like this. If
the excerpts do not show them, say so with an empty array.`,
};

/**
 * The analysis prompt for one lane of one category.
 *
 * The shared schema above is the floor. On top of it go the fields the category
 * itself defines (services/categories.js, `voice`), which is where the questions
 * that actually separate two tech creators live: how they say a spec, how they
 * say a price, the exact words they use to tell somebody not to buy something.
 *
 * A category with no voice config produces exactly the prompt that existed
 * before any of this, which is what makes this safe to add ahead of the other
 * six categories being built out.
 */
function promptFor(lane, categoryId, compact) {
  const base = compact ? PROMPT_COMPACT : PROMPT_HEAD;
  const spec = voiceSpecFor(categoryId, lane);
  const brief = LANE_BRIEF[lane] || "";

  // The compact form exists to fit inside a token budget that the full one
  // overflowed, so it does not get the category extras piled back on top.
  if (compact) return `${base}${brief ? `\n${brief}\n` : ""}`;

  const entries = Object.entries(spec.fields || {});
  if (!entries.length) return `${base}${brief ? `\n${brief}\n` : ""}`;

  // Spliced in BEFORE "TRANSCRIPTS:" so the schema stays one object rather than
  // becoming two things the model has to reconcile.
  const marker = "\nTRANSCRIPTS:";
  const head = base.endsWith(marker) ? base.slice(0, -marker.length) : base;

  const extra = entries
    .map(([k, desc]) => `  "${k}": ${JSON.stringify(desc)}`)
    .join(",\n");

  return (
    `${head}\n` +
    `${brief}\n\n` +
    `════════ THIS CREATOR'S SUBJECT ════════\n` +
    `${spec.guidance}\n\n` +
    `ALSO return these fields, in the SAME JSON object as everything above. They\n` +
    `are the ones that separate this creator from every other creator covering the\n` +
    `same subject, so answer them concretely and quote verbatim. Where you genuinely\n` +
    `cannot tell from the transcripts, return an empty string or empty array rather\n` +
    `than a guess:\n{\n${extra}\n}\n` +
    marker
  );
}

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
  "language": "BCP-47-ish code, hi-en, te-en, hi, en",
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
async function analyse(body, compact, lane = SHORT, categoryId = "") {
  const head = promptFor(lane, categoryId, compact);

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
    console.warn(`[voice] salvaged a ${finish} response (compact=${compact}), ${Object.keys(parsed).length} fields recovered`);
  }

  return { parsed, res };
}

/**
 * Parse JSON that may be fenced, prefixed with prose, or cut off mid-write.
 *
 * The salvage matters because the tokens are already paid for. A response that
 * stopped at MAX_TOKENS still holds most of a usable profile, and throwing it
 * away bills the user twice for the same analysis, the same reasoning as the
 * transcription salvage in geminiClient.js.
 */
export function parseLooseJson(raw) {
  let s = String(raw || "").trim();
  if (!s) return null;

  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const start = s.indexOf("{");
  if (start > 0) s = s.slice(start);
  if (start === -1) return null;

  try { return JSON.parse(s); } catch { /* truncated, fall through */ }

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
 * A salvage can succeed at the JSON level and still be worthless, recovering
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
 * Build (or rebuild) one profile's voice, from the videos in THAT profile.
 *
 * @param {string} userId
 * @param {string} [profileId]  which channel. Omitted means the user's default.
 * @returns {{ profile, built, reason? }}
 */
/**
 * Read every video this channel has added but not yet had read.
 *
 * ── WHY THIS RUNS HERE AND NOT WHEN THE LINK WAS PASTED ─────────────────────
 * Transcription is the most expensive call this product makes, and pasting a
 * link is the cheapest thing a person can do. Tying them together meant paying
 * for videos nobody ever analysed. They are now separated: adding is free, and
 * this is the moment the creator actually asked for the work.
 *
 * Read in parallel because they are independent and a creator waiting on five
 * sequential video reads waits five times as long for no reason. A failure is
 * recorded on its own row and does not stop the others: four good videos still
 * make a voice, and refusing to build one because the fifth link was private
 * would be the wrong trade.
 */
/**
 * Say where the build has got to, to the one browser waiting on it.
 *
 * ── WHY A BUILD NARRATES ITSELF ──────────────────────────────────────────────
 * This runs to minutes: it reads up to five videos end to end and then makes a
 * model call over all of them. For that whole time the creator had a greyed
 * button saying "Analysing…" and no evidence anything was happening, which is
 * indistinguishable from a hang, and it is the FIRST thing they ever ask this
 * product to do. The stages are real, not a timer pretending: `reading` counts
 * videos actually finished, and `analysing` starts when the model call does.
 *
 * Fire and forget, and never awaited. A dropped progress line costs a second of
 * a nicer wait; a throw here would cost the build it was reporting on.
 */
function announce(userId, profileId, stage, extra = {}) {
  publishUserEvent({
    type: "voice:progress",
    user: String(userId),
    profile: String(profileId),
    stage,
    ...extra,
  }).catch(() => {});
}

/**
 * "It is built", for the paths that finish a build without a `building` flag.
 *
 * The Analyse button's route owns that flag and publishes its own terminal
 * event after clearing it (see routes/profiles.js). This is for the OTHER way a
 * voice gets built: the first script a creator orders builds it as a side
 * effect, and a My voice tab open in the background would otherwise sit in the
 * progress state this file just put it in, with nothing ever arriving to end it.
 */
function announceBuilt(userId, profileId, doc) {
  publishUserEvent({
    type: "voice:built",
    user: String(userId),
    profile: String(profileId),
    transcript_count: doc?.transcript_count || 0,
    language_label: doc?.language_label || "",
    confidence: doc?.confidence || "",
  }).catch(() => {});
}

async function readPendingVideos(userId, profileId, lane = SHORT) {
  // Scoped to the lane being built. Reading video is the expensive call, and
  // building the short voice must not silently pay to read five long videos
  // that this analysis will then filter straight back out.
  const pending = await Transcript.find({
    user: userId,
    profile: profileId,
    status: "pending",
    ...laneQuery(lane),
  }).limit(MAX_TRANSCRIPTS).lean();

  if (!pending.length) return { read: 0, failed: 0 };

  console.log(`[voice] reading ${pending.length} pending video(s) for profile ${profileId}`);
  announce(userId, profileId, "reading", { done: 0, total: pending.length });

  // Claimed before the work starts, so a second Analyse press arriving while
  // this one runs does not read the same videos again.
  await Transcript.updateMany(
    { _id: { $in: pending.map((p) => p._id) } },
    { $set: { status: "processing", updated_at: new Date() } }
  );

  // Counted here rather than from the results array, because the point of the
  // number is to move WHILE the reads are in flight; the array only exists once
  // every one of them has settled.
  let finished = 0;

  const results = await Promise.all(pending.map(async (row) => {
    const started = Date.now();
    try {
      const out = await transcribeYouTube(row.url);
      await Transcript.updateOne({ _id: row._id }, {
        $set: {
          status: "done",
          text: out.text,
          language: out.language,
          language_label: out.language_label,
          // Only overwrite the title when the read produced one. The metadata
          // lookup already gave us a good title at add time, and an empty
          // string here would blank a name the creator has been looking at.
          ...(out.title ? { title: out.title } : {}),
          usage: out.usage || {},
          ms_taken: Date.now() - started,
          updated_at: new Date(),
        },
      });
      const u = out.usage || {};
      console.log(
        `[voice] read ${row.video_id} in ${((Date.now() - started) / 1000).toFixed(1)}s · ` +
        `${out.text.length} chars · ${out.language_label || out.language || "?"} · ` +
        `$${(u.usd || 0).toFixed(4)}`
      );
      announce(userId, profileId, "reading", {
        done: ++finished,
        total: pending.length,
        title: out.title || row.title || "",
        language_label: out.language_label || "",
      });
      return true;
    } catch (err) {
      await Transcript.updateOne({ _id: row._id }, {
        $set: {
          status: "failed",
          error: err.userMessage || "We couldn't read this video.",
          ms_taken: Date.now() - started,
          updated_at: new Date(),
        },
      }).catch(() => {});
      console.error(`[voice] read failed for ${row.video_id}: ${err.message}`);
      announce(userId, profileId, "reading", {
        done: ++finished,
        total: pending.length,
        failed: true,
      });
      return false;
    }
  }));

  const read = results.filter(Boolean).length;
  return { read, failed: results.length - read };
}

export async function buildVoiceProfile(userId, profileId, { lane = SHORT } = {}) {
  const { profile } = await resolveProfile(userId, profileId);
  const voice = await voiceFor(userId, profile._id);

  // One profile now holds one category, so this is unambiguous. It decides which
  // extra questions the analyst is asked, and it is recorded on the row so a
  // later category change can be seen as staleness rather than silently
  // producing answers about the wrong subject.
  const categoryId = (profile.categories || [])[0] || "";

  // Everything added since the last build gets read now, at the one moment the
  // creator has asked for a voice. Scoped to this lane: analysing the short
  // voice must not pay to read five long videos it will not look at.
  await readPendingVideos(userId, profile._id, lane);

  const transcripts = await Transcript.find({
    user: userId,
    profile: profile._id,
    status: "done",
    text: { $ne: "" },
    ...laneQuery(lane),
  })
    .sort({ created_at: -1 })
    .limit(MAX_TRANSCRIPTS)
    .lean();

  if (!transcripts.length) {
    return { profile: null, built: false, reason: "no_transcripts", lane };
  }

  // The long lane refuses to build on too little. One long video shows one
  // episode's running order, which a model will happily generalise into a rule
  // it then applies to every script. Three is where a repeated habit becomes
  // distinguishable from a one-off, and building on less would produce a
  // confident profile of something we have not actually observed.
  if (lane === LONG && transcripts.length < LONG_MIN_VIDEOS) {
    return {
      profile: null,
      built: false,
      reason: "not_enough_long",
      lane,
      have: transcripts.length,
      need: LONG_MIN_VIDEOS,
    };
  }

  const blocks = transcripts.map((t, i) => {
    const s = sample(t.text, lane);
    const header = `--- VIDEO ${i + 1}${t.title ? `: ${t.title}` : ""} (${t.language_label || t.language || "unknown language"}) ---`;
    if (s.whole) return `${header}\n${s.whole}`;

    // The long lane's several interior slices are labelled by position, so the
    // analyst can tell "this is a different part of the same video" from "this
    // is a different video", which is what makes a recurring join visible as
    // recurring rather than as one phrase seen twice.
    const middle = s.mids
      ? s.mids.map((m, j) => `[MIDDLE ${j + 1} of ${s.mids.length}]\n${m}`).join("\n\n")
      : `[MIDDLE]\n${s.mid}`;

    return `${header}\n[OPENING]\n${s.head}\n\n${middle}\n\n[ENDING]\n${s.tail}`;
  });

  const body = blocks.join("\n\n");

  announce(userId, profile._id, "analysing", { videos: transcripts.length, lane });

  let { parsed, res } = await analyse(body, false, lane, categoryId);

  // One retry, and only when the first response could not be salvaged at all.
  // Almost always a truncation: a profile full of verbatim Telugu or Devanagari
  // is several times more output tokens than the same profile in English,
  // because Indic scripts tokenise far denser than Latin. The retry asks for the
  // short form, which fits comfortably even in the worst case.
  if (!usable(parsed)) {
    console.warn("[voice] first pass unusable, retrying with the compact schema");
    ({ parsed, res } = await analyse(body, true, lane, categoryId));
  }

  if (!usable(parsed)) {
    throw new Error("Couldn't read the voice analysis. Please try again.");
  }

  announce(userId, profile._id, "finishing", { videos: transcripts.length });

  // Fall back to the transcripts' own language rather than whatever the analyser
  // decided, the transcriber saw the actual audio, this pass only saw text.
  const language = parsed.language || transcripts[0].language || "";
  const languageLabel = parsed.language_label || transcripts[0].language_label || "";

  const usage = readUsage(res);
  const confidence = transcripts.length >= 5 ? "good" : transcripts.length >= 3 ? "fair" : "thin";

  // Counted, not described, code-mixing ratio, sentence lengths, the English
  // words they actually keep, their measured speaking rate. This line was
  // MISSING while `metrics` was still referenced in the $set below, so every
  // call to this function threw a ReferenceError before it could write anything:
  // voice analysis could not succeed at all. It is also what supplies
  // words_per_second, which is how a chosen duration becomes a word target in
  // scriptWriterService.js.
  const metrics = measureVoice(transcripts);

  // ── WHERE THIS LANE'S ANSWERS LAND ────────────────────────────────────────
  // The short lane writes to the top level, which is where it has always
  // written and where every existing profile already is. The long lane writes
  // into the `long` sub-document. One prefix, applied to every key below, so
  // there is exactly one place that knows about the split rather than two
  // parallel write paths that can drift.
  const P = lane === LONG ? "long." : "";

  // Always written: these describe the build itself, not what was learned.
  const set = {
    [`${P}built_from`]: transcripts.map((t) => t._id),
    [`${P}transcript_count`]: transcripts.length,
    [`${P}language`]: language,
    [`${P}language_label`]: languageLabel,
    [`${P}confidence`]: confidence,
    [`${P}metrics`]: metrics,
    [`${P}built_at`]: new Date(),
    [`${P}build_failed_at`]: null,
    // Which category's questions were asked. Written for both lanes because
    // either one going stale is a reason to re-ask.
    built_for_category: categoryId,
  };

  // Usage and the free-build counter stay at the top level in both lanes: they
  // are about the account's spend, not about one voice, and a creator who has
  // used both free builds has used both regardless of which lane they spent
  // them on.
  set.usage = usage;

  // The short lane keeps writing the top-level language even when it is also
  // the prefix, but the long lane must NOT overwrite the parent's copy: a
  // creator whose long videos were misdetected would otherwise lose the
  // language on the lane that was right.
  if (lane === LONG) {
    delete set.language;
    delete set.language_label;
    set["long.language"] = language;
    set["long.language_label"] = languageLabel;
  }

  // ── The category-specific answers ─────────────────────────────────────────
  // Collected by name from the category's own field list rather than by
  // diffing against the shared schema, so a model that invents an extra key
  // cannot smuggle it into storage.
  const catFields = Object.keys(voiceSpecFor(categoryId, lane).fields || {});
  if (catFields.length) {
    const cv = {};
    for (const k of catFields) {
      const v = parsed[k];
      if (Array.isArray(v)) { if (v.length) cv[k] = arr(v); }
      else if (typeof v === "string" && v.trim()) cv[k] = str(v, 1200);
    }
    if (Object.keys(cv).length) set[`${P}category_voice`] = cv;
  }

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
    // `topics` has no long-lane counterpart on the sub-schema: what a creator
    // covers is a fact about them, not about one format, so it stays where the
    // rest of the product already reads it from.
    if (lane === LONG && k === "topics") {
      if (v.length) set.topics = v;
      continue;
    }
    if (Array.isArray(v) ? v.length : v) set[`${P}${k}`] = v;
  }

  // Scoped to the row AND the user: a profile id alone must never be enough to
  // overwrite somebody else's voice.
  const doc = await VoiceProfile.findOneAndUpdate(
    { _id: voice._id, user: userId },
    // `builds` counts SUCCESSFUL analyses, and it is incremented here rather
    // than at the route because every path that produces a voice ends up on
    // this line: the Analyse button, and the auto-build the first script does.
    // A failed build never reaches here, so it cannot consume a free one.
    { $set: set, $inc: { builds: 1, ...(lane === LONG ? { "long.builds": 1 } : {}) } },
    { new: true }
  );

  console.log(
    `[voice] "${profile.name}" (${profile._id}) ${lane}-form for ${userId} from ` +
    `${transcripts.length} transcript(s) · ${languageLabel || language || "?"} · ` +
    `${confidence} · $${usage.usd.toFixed(4)}` +
    (lane === LONG
      ? ` · ${(set["long.category_voice"]?.bulletin_transitions || []).length} transition(s) captured`
      : "")
  );

  return { profile: doc, built: true, lane };
}

/**
 * The profile to write with, rebuilding only when it is missing or has never seen
 * transcripts the user has since added. Generation must not silently pay for a
 * rebuild on every script.
 *
 * @param {string} userId
 * @param {{ profileId?: string, autoBuild?: boolean }} opts
 */
export async function getUsableProfile(userId, { profileId, autoBuild = true, seconds = 0 } = {}) {
  const { profile: channel } = await resolveProfile(userId, profileId);
  const voice = await voiceFor(userId, channel._id);

  // ── WHICH VOICE THIS ORDER NEEDS ──────────────────────────────────────────
  // Derived from the length they bought, because that is the thing that decides
  // whether they are getting one product explained or fourteen of them in
  // sequence. See services/voiceLanes.js.
  const lane = seconds ? laneForScript(seconds) : SHORT;

  // ── THE LONG LANE IS NEVER AUTO-BUILT ─────────────────────────────────────
  // The short lane may be built silently by a creator's first order, and that
  // is a good surprise: they asked for a script and got one. The long lane
  // cannot work the same way. It needs three long videos the creator may simply
  // not have added, and building it silently would either fail mid-order or
  // spend a free build on material they never chose to give us.
  //
  // So an unbuilt long lane is refused here and reported, not papered over by
  // falling back to the short voice. Falling back is the specific failure this
  // whole lane split exists to prevent: it would return a fluent eight-minute
  // script that repeats one gesture fourteen times, and it would look fine
  // right up until the creator read it aloud.
  if (lane === LONG) {
    const ready = voiceForLane(voice, LONG);
    if (ready) return ready;

    const e = new Error("long-form voice not built");
    e.userMessage = laneReady(voice, SHORT)
      ? `Scripts over two minutes are multi-story, and we haven't learned how you move ` +
        `between stories yet. Add ${LONG_MIN_VIDEOS} of your longer videos in My Voice and ` +
        `run the long-form analysis. You haven't been charged.`
      : "Analyse your voice first, starting with your short videos. You haven't been charged.";
    e.needsLane = LONG;
    throw e;
  }

  // A voice with nothing learned yet is not a profile. built_at is the marker:
  // the row exists from the moment the channel is created, so its mere presence
  // says nothing about whether anything has been analysed.
  const existing = voice.built_at ? voice : null;

  if (!existing) {
    if (!autoBuild) return null;
    const { profile } = await buildVoiceProfile(userId, channel._id, { lane: SHORT });
    if (profile) announceBuilt(userId, channel._id, profile);
    return profile;
  }

  if (autoBuild) {
    // Counted within the lane. A creator who added three long videos has not
    // given the SHORT voice anything new to learn, and rebuilding it because
    // the total moved would charge them for an analysis of the same material.
    const total = await Transcript.countDocuments({
      user: userId, profile: channel._id, status: "done", text: { $ne: "" }, ...laneQuery(SHORT),
    });
    const seen = existing.transcript_count || 0;
    // Only rebuild when there is genuinely more to learn from, and stop counting
    // past the cap, otherwise every new video past the eighth triggers a rebuild
    // that reads the same eight transcripts.
    if (total > seen && seen < MAX_TRANSCRIPTS) {
      // A rebuild that failed a minute ago will fail again now: same transcripts,
      // same prompt, same outcome, same bill. Before this, a profile the analyser
      // could not parse meant EVERY subsequent script generation paid for two
      // more analysis calls and still produced nothing.
      const failedAt = existing.build_failed_at ? new Date(existing.build_failed_at).getTime() : 0;
      if (Date.now() - failedAt < REBUILD_COOLDOWN_MS) return existing;

      try {
        const { profile } = await buildVoiceProfile(userId, channel._id, { lane: SHORT });
        if (profile) announceBuilt(userId, channel._id, profile);
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
 * Is one channel's voice behind the videos in it? Drives the UI nudge.
 * @param {string} [profileId]  omitted means the user's default channel
 */
export async function profileStatus(userId, profileId) {
  const { profile: channel } = await resolveProfile(userId, profileId);
  const voice = await voiceFor(userId, channel._id);

  // Analysable, which includes videos that have been added but not yet read.
  // Counting only "done" would tell a creator who has just added three videos
  // that there is nothing to analyse, which is the opposite of true.
  const analysable = {
    $or: [{ status: "pending" }, { status: "processing" }, { status: "done", text: { $ne: "" } }],
  };
  const base = { user: userId, profile: channel._id };

  const [total, shortCount, longCount] = await Promise.all([
    Transcript.countDocuments({ ...base, ...analysable }),
    Transcript.countDocuments({ ...base, ...analysable, ...laneQuery(SHORT) }),
    Transcript.countDocuments({ ...base, ...analysable, ...laneQuery(LONG) }),
  ]);

  const profile = voice.built_at ? voice.toObject?.() ?? voice : null;

  // Staleness is per lane, because the lanes go stale independently: adding
  // three long videos gives the LONG voice something new to learn and the short
  // voice nothing at all, and a single flag would push the creator to rebuild
  // the one that has not changed.
  const staleIn = (built, count) =>
    !!built && count > (built.transcript_count || 0) && (built.transcript_count || 0) < MAX_TRANSCRIPTS;

  const longBuilt = voice.long?.built_at ? (voice.long.toObject?.() ?? voice.long) : null;

  // ── THE ONE FREE REBUILD ──────────────────────────────────────────────────
  // A voice built before category-aware analysis existed has never been asked
  // the questions that make it specific to what this creator covers, and that
  // is our doing, not theirs. Surfaced so the UI can offer the upgrade without
  // it looking like an upsell, and honoured in creditPricing.voiceAnalysisCost.
  const category = (channel.categories || [])[0] || "";
  const needsCategoryRebuild =
    !!profile && !!category && (voice.built_for_category || "") !== category;

  return {
    channel,
    voice,
    profile,
    category,
    transcripts_available: total,
    stale: staleIn(profile, shortCount),
    needs_category_rebuild: needsCategoryRebuild,
    lanes: laneStatus(voice, { short: shortCount, long: longCount }),
    lane_counts: { short: shortCount, long: longCount },
    lane_stale: {
      short: staleIn(profile, shortCount),
      long: staleIn(longBuilt, longCount),
    },
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

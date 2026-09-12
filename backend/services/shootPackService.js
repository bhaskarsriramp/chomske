/**
 * shootPackService.js: turn a finished script into something shootable.
 *
 * ── THE PROBLEM THIS SOLVES ──────────────────────────────────────────────────
 * A script that reads well is not a script you can record. A creator sitting
 * down with one still has to work out, line by line, where to cut away, what
 * footage that cutaway needs, and what to have open on the desktop before the
 * camera rolls. That is the gap between a document and a shoot, and every
 * script tool in this market stops at the document.
 *
 * ── ALMOST NONE OF THIS IS INFERENCE ─────────────────────────────────────────
 * Three of the four parts are arithmetic or lookup over data the product has
 * already paid to compute:
 *
 *   timecodes    seconds = words so far / metrics.words_per_second. THIS
 *                creator's measured pace, not 150wpm. A generic rate is wrong
 *                by several seconds by the end of a minute, which makes a shot
 *                list actively misleading.
 *   cues         category_voice.show_me_phrases, matched against the script.
 *                These are the creator's OWN pointing phrases, captured from
 *                their videos. We are finding where they already said one.
 *   held back    category_voice.demo_only_phrases. Phrases that only work with
 *                the product physically present. A script written from news
 *                coverage must not have the creator pointing at a phone they
 *                do not have, so these are reported as withheld rather than
 *                silently dropped: seeing that we know the difference is the
 *                most convincing thing on the page.
 *
 * Only the fourth needs a model: naming the footage each cue calls for. That is
 * one small call over text we already hold, which is why the pack is priced
 * flat (see SHOOT_PACK_CREDITS).
 *
 * ── WHY demo_only_phrases FINALLY DOES SOMETHING ─────────────────────────────
 * It has been extracted, stored and read by nothing since the day it was
 * added. The analysis was already paying for it. This is the screen it was
 * always for.
 */
import { GoogleGenAI } from "@google/genai";
import { sentences, words } from "./voiceMetrics.js";
import { FALLBACK_WORDS_PER_SECOND } from "./creditPricing.js";

const MODEL = process.env.GEMINI_TEXT_MODEL || process.env.GEMINI_VIDEO_MODEL || "gemini-3.5-flash";

let _client = null;
function client() {
  if (!_client) {
    const key = String(process.env.AISTUDIO_KEY || "").split(",")[0].trim();
    if (!key) throw new Error("AISTUDIO_KEY is not set");
    _client = new GoogleGenAI({ apiKey: key });
  }
  return _client;
}

/** Normalised for matching: punctuation and spacing must not decide a match. */
function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[।॥.,!?;:"'“”‘’()\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split the script into timecoded lines.
 *
 * The clock advances by the words in each line divided by the creator's own
 * words-per-second, so a line's start time is where they will actually reach
 * it rather than where an average speaker would.
 */
export function timeline(text, wps) {
  const rate = Number(wps) > 0 ? Number(wps) : FALLBACK_WORDS_PER_SECOND;
  let elapsed = 0;

  return sentences(text).map((line, i) => {
    const at = elapsed;
    const n = words(line).length;
    elapsed += n / rate;
    return {
      n: i + 1,
      at: Math.round(at),
      until: Math.round(elapsed),
      words: n,
      text: line,
    };
  });
}

/** mm:ss, because a shot list is read at a glance and 73.4 is not. */
export function stamp(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Which lines carry one of this creator's own on-screen cues.
 *
 * Substring match on the normalised text, longest phrase first so
 * "ఇక్కడ చూడండి" wins over "చూడండి" and a line is credited to the most
 * specific cue it contains rather than the first one that happens to fit.
 */
export function findCues(lines, showMePhrases = []) {
  const phrases = (showMePhrases || [])
    .map((p) => ({ raw: String(p || "").trim(), key: norm(p) }))
    .filter((p) => p.key.length >= 3)
    .sort((a, b) => b.key.length - a.key.length);

  const hits = [];
  for (const line of lines) {
    const hay = norm(line.text);
    const found = phrases.find((p) => hay.includes(p.key));
    if (found) hits.push({ line: line.n, phrase: found.raw });
  }
  return hits;
}

/**
 * The cues we deliberately did not use.
 *
 * Reported with a reason rather than dropped. A creator seeing their own
 * "look at the phone in my hand" held back, because this script came from news
 * rather than a review unit, learns more about what the product understands
 * than any amount of copy on a landing page.
 */
export function heldBack(demoOnlyPhrases = []) {
  return (demoOnlyPhrases || [])
    .map((p) => String(p || "").trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((phrase) => ({ phrase, why: "Needs the product in front of you" }));
}

const PROMPT_HEAD = `You are a video producer preparing a shoot from a finished script.

The script below is already written and must NOT be changed. Your only job is to say what should be ON SCREEN, and what footage has to be ready before recording.

You are given the lines where the creator says one of their own pointing phrases ("look at this", "see the price here"). Those lines are where a cutaway belongs, because the creator has already verbally pointed at something.

RULES:
- Name footage that can actually be obtained from news coverage, press material or a screen recording: a product render, an official page, a spec table, a price card, a chart, a logo, a previous-model comparison.
- NEVER suggest footage that requires the physical product: unboxing, hands-on, holding it, using it, two units side by side. The creator does not have this product.
- Keep each description short enough to read on a phone while setting up. Under twelve words.
- Every shot must name the line number that triggers it.
- The first shot and the last shot are the creator on camera. Do not put footage over the sign-off.

Return STRICT JSON only:
{
  "shots": [
    { "line": 3, "what": "Apple India pre-order page", "source": "screen recording of the official page" }
  ],
  "broll": [
    { "item": "Price card, 256GB", "note": "make in Canva, on screen 0:21 to 0:28" }
  ]
}`;

/**
 * Build the pack.
 *
 * @param {object} input
 * @param {string} input.text        the finished script
 * @param {object} input.voice       the VoiceProfile document (lean is fine)
 * @param {number} input.seconds     the ordered duration, for sanity only
 * @returns {{ pack, usage }}
 */
export async function buildShootPack({ text, romanText = "", voice, seconds = 60 }) {
  const script = String(text || "").trim();
  if (!script) throw Object.assign(new Error("no script"), { userMessage: "This script is empty." });

  const cv = voice?.category_voice || {};
  const wps = voice?.metrics?.words_per_second || FALLBACK_WORDS_PER_SECOND;

  const lines = timeline(script, wps);

  // ── The same lines, in Roman letters ──────────────────────────────────────
  // Split with the SAME sentence splitter, so index i of one is index i of the
  // other, and paired by position rather than by matching text: there is no
  // text to match, the two are different alphabets.
  //
  // Guarded by a length check even though routes/script.js only passes an
  // aligned transliteration. The splitter runs here on the raw strings, and a
  // transliteration that gained or lost a full stop somewhere would silently
  // shift every line after it, putting the wrong words on the wrong timecode
  // for the rest of the shoot. A missing Roman toggle is a small
  // disappointment; a prompter reading the wrong line is a ruined take.
  const romanLines = romanText ? sentences(String(romanText)) : [];
  const romanOk = romanLines.length === lines.length && lines.length > 0;
  if (romanText && !romanOk) {
    console.warn(`[shoot] roman lines ${romanLines.length} != ${lines.length}, omitting roman from pack`);
  }
  const cues = findCues(lines, cv.show_me_phrases);
  const held = heldBack(cv.demo_only_phrases);

  // ── THE ONE MODEL CALL ────────────────────────────────────────────────────
  // Everything above is deterministic. This asks only "what footage does each
  // cued line need", over a script and a list of line numbers we already have.
  const cueBlock = cues.length
    ? cues.map((c) => `  line ${c.line}: the creator says "${c.phrase}"`).join("\n")
    : "  (none: the creator used no pointing phrases in this script)";

  const numbered = lines.map((l) => `${l.n}. [${stamp(l.at)}] ${l.text}`).join("\n");

  const prompt =
    `${PROMPT_HEAD}\n\n` +
    `LINES WITH A POINTING PHRASE:\n${cueBlock}\n\n` +
    `THE SCRIPT (${Math.round(seconds)}s, ${lines.length} lines):\n${numbered}\n`;

  let parsed = {};
  let usage = null;
  try {
    const res = await client().models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        temperature: 0.4,   // a shot list is a plan, not prose
        responseMimeType: "application/json",
        maxOutputTokens: 2048,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    parsed = JSON.parse(res.text || "{}");
    usage = readUsage(res);
  } catch (err) {
    console.error("[shoot] generation failed:", err.message);
    throw Object.assign(new Error("shoot pack failed"), {
      userMessage: "Couldn't build the shoot pack. Please try again.",
    });
  }

  const byLine = new Map(lines.map((l) => [l.n, l]));
  const cuedLines = new Set(cues.map((c) => c.line));

  // Shots are numbered here, not by the model: the model proposes footage, the
  // ordering and the timecodes are ours, so a hallucinated line number cannot
  // produce a shot that sits outside the script.
  const shots = (Array.isArray(parsed.shots) ? parsed.shots : [])
    .map((s) => {
      const line = byLine.get(Number(s?.line));
      if (!line) return null;
      return {
        line: line.n,
        from: line.at,
        to: line.until,
        what: String(s?.what || "").trim().slice(0, 90),
        source: String(s?.source || "").trim().slice(0, 120),
        phrase: cues.find((c) => c.line === line.n)?.phrase || "",
      };
    })
    .filter((s) => s && s.what)
    .sort((a, b) => a.from - b.from)
    .map((s, i) => ({ ...s, n: i + 1 }));

  const broll = (Array.isArray(parsed.broll) ? parsed.broll : [])
    .map((b) => ({
      item: String(b?.item || "").trim().slice(0, 80),
      note: String(b?.note || "").trim().slice(0, 100),
    }))
    .filter((b) => b.item)
    .slice(0, 10);

  return {
    pack: {
      words_per_second: Number(wps),
      total_seconds: lines.length ? lines[lines.length - 1].until : 0,
      // Whether the Roman view can be offered at all. Read by the client so a
      // toggle is drawn only where there is something behind it.
      has_roman: romanOk,
      lines: lines.map((l, i) => ({
        ...l,
        // Empty string rather than absent when there is no Roman, so the shape
        // of a line does not change between packs and the client can read the
        // field unconditionally.
        roman: romanOk ? romanLines[i] : "",
        cue: cuedLines.has(l.n) ? cues.find((c) => c.line === l.n).phrase : "",
        shot: shots.find((s) => s.line === l.n)?.n || null,
      })),
      shots,
      broll,
      held,
      built_at: new Date(),
    },
    usage,
  };
}

/** Same shape routes/script.js already records for every other model call. */
function readUsage(res) {
  const m = res?.usageMetadata || {};
  const input = m.promptTokenCount || 0;
  const output = m.candidatesTokenCount || 0;
  const thinking = m.thoughtsTokenCount || 0;
  const inRate = parseFloat(process.env.GEMINI_USD_PER_M_INPUT || "1.50");
  const outRate = parseFloat(process.env.GEMINI_USD_PER_M_OUTPUT || "9.00");
  return {
    input_tokens: input,
    output_tokens: output,
    thinking_tokens: thinking,
    total_tokens: input + output + thinking,
    usd: (input / 1e6) * inRate + ((output + thinking) / 1e6) * outRate,
  };
}

export default { buildShootPack, timeline, stamp, findCues, heldBack };

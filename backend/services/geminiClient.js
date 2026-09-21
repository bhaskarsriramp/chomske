/**
 * geminiClient.js: read a YouTube video and return what was actually said.
 *
 * Gemini accepts a YouTube URL directly (fileData.fileUri), so there is no
 * download, no ffmpeg, no audio hosting anywhere in this product. Constraints
 * that come with that, straight from the API docs, worth knowing because each
 * one becomes a user-facing error rather than a mystery:
 *   • the video must be PUBLIC (unlisted and private both fail)
 *   • one video per request on pre-2.5 models; later models allow more, but we
 *     deliberately send one so a failure maps to a single row
 *   • on the free tier there is a cap of ~8 hours of YouTube video per day
 *     across the whole key, which is a per-KEY ceiling, not per-user
 *
 * ── THE ONE RULE THIS FILE EXISTS TO ENFORCE ─────────────────────────────────
 * Transcribe in the language SPOKEN. A Hindi video returns Devanagari, a Telugu
 * video returns Telugu script, and a Hinglish video keeps the code-mixing exactly
 * as spoken ("basically हम इसको deploy कर देंगे"). Translating to English is the
 * single most likely way for a model to be helpful and destroy the entire value
 * of the product, so the prompt forbids it several different ways.
 */

import { generate, isVertex } from "./ai/provider.js";

const VIDEO_MODEL = process.env.GEMINI_VIDEO_MODEL || "gemini-3.5-flash";

/**
 * ── THE KEY POOL THAT USED TO LIVE HERE IS GONE ──────────────────────────────
 * It rotated across AI Studio keys so one key's per-minute (and per-day video)
 * limit was not the whole app's ceiling. That was the right idea and the wrong
 * place for it: this file had no idea what the editor or the studio were doing
 * with the same keys at the same moment, so three round-robins shared one
 * ceiling and none of them knew it.
 *
 * It now goes through services/ai/provider.js, which owns the rotation, the
 * request budget and the waiting — and which is also where the choice between
 * AI Studio and Vertex lives, so this file needs to know nothing about either.
 *
 * ── ONE THING TO WATCH ON VERTEX ─────────────────────────────────────────────
 * The YouTube URL below is handed straight to the model as fileData, with no
 * download anywhere in this product. That works on both APIs but the terms are
 * not identical — the per-day ceiling on public video is an AI Studio notion,
 * and Vertex has its own limits on what it will fetch. If a video that plays
 * fine in a browser comes back refused after the move, this is the first place
 * to look.
 */

const PROMPT = `You are transcribing a video. Return ONLY what the speaker actually says.

ABSOLUTE RULES. Breaking any one of these makes the output useless:
1. Transcribe in the SPOKEN language, in that language's OWN script, whichever language it is. Never substitute a different script.
2. DO NOT translate. DO NOT transliterate into English letters. Write the speaker's own words in their own script: never spell them out phonetically in the Latin alphabet, and never replace them with an English rendering of what they meant.
3. Keep code-mixing EXACTLY as spoken. Indian creators mix English words into their own language constantly, and which words they keep in English is the single most distinctive thing about how they talk. Keep the English words in the Latin alphabet and everything else in the speaker's own script, precisely as said. Do not "clean up" the mixing in either direction. If the speaker is talking English throughout, transcribe English throughout.
4. Keep their real speech: filler words, repeated words, their catchphrases, the way they open and close. Do not smooth it into written prose. This transcript exists to capture how THIS person actually talks.
5. Break into readable paragraphs at natural pauses or topic changes. No timestamps, no speaker labels, no bullet points, no commentary of your own.
6. Transcribe the WHOLE video from start to finish. Do not summarise, do not stop early, do not write "[continues]".

Return STRICT JSON, nothing else:
{
  "language": "BCP-47-ish code of the dominant spoken language: hi, te, bn, ta, mr, en. Use hi-en for Hindi-English code-mixing (Hinglish), te-en for Telugu-English, and so on.",
  "language_label": "human-readable name, e.g. Hindi, Hinglish (Hindi-English), Telugu, Bengali",
  "title": "the video's apparent title or subject, in the spoken language",
  "text": "the full transcript, following every rule above"
}`;

/**
 * Transcribe one public YouTube video.
 * @returns {{ text, language, language_label, title }}
 * @throws  Error with a `.userMessage` when the cause is something the user can fix.
 */
export async function transcribeYouTube(watchUrl) {
  let res;
  try {
    ({ res } = await generate({
      model: VIDEO_MODEL,
      parts: [
        { fileData: { fileUri: watchUrl } },
        { text: PROMPT },
      ],
      temperature: 0.1,          // transcription, not writing, near-deterministic
      json: true,
      // Long videos produce long transcripts. Too small a ceiling truncates
      // mid-sentence and the JSON then fails to parse, which reads to the user
      // as a total failure rather than "the video was long".
      maxOutputTokens: 65536,
      // THINKING OFF, measured, not assumed. Transcription is mechanical: the
      // model is writing down what it hears, not reasoning about it. With
      // thinking on, a 60s Short burned 1,596 thinking tokens against just 630
      // real output tokens, and thinking bills at the OUTPUT rate, so it was
      // 44% of the bill for no benefit. Measured on the same video:
      //   thinking on : 11.4s, ₹2.90, 1,993 chars
      //   thinking off:  4.1s, ₹1.53, 1,976 chars  ← same transcript
      // Half the cost and nearly 3x faster. If a future model needs reasoning
      // here (it shouldn't), raise this deliberately and re-measure.
      thinkingBudget: 0,
    }));
  } catch (err) {
    throw mapProviderError(err);
  }

  const raw = res?.text || "";
  if (!raw.trim()) {
    const finish = res?.candidates?.[0]?.finishReason || "unknown";
    const e = new Error(`Gemini returned nothing (finishReason: ${finish})`);
    e.userMessage =
      finish === "SAFETY"
        ? "This video was blocked by the model's safety filters."
        : "We couldn't read this video. It may be very long, or unavailable to the model.";
    throw e;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Truncation is the usual cause: valid JSON that simply stops. Salvage the
    // transcript with a string match rather than throwing away a long, expensive
    // read over a missing closing brace.
    const salvaged = raw.match(/"text"\s*:\s*"([\s\S]*)$/);
    if (!salvaged) {
      const e = new Error("Gemini returned unparseable output");
      e.userMessage = "We couldn't read this video cleanly. Please try again.";
      throw e;
    }
    parsed = { text: unescapeJsonish(salvaged[1]), language: "", language_label: "", title: "" };
  }

  const text = String(parsed.text || "").trim();
  if (!text) {
    const e = new Error("Gemini returned an empty transcript");
    e.userMessage = "No speech was detected in this video.";
    throw e;
  }

  return {
    text,
    language: String(parsed.language || "").trim(),
    language_label: String(parsed.language_label || "").trim(),
    title: String(parsed.title || "").trim(),
    usage: readUsage(res),
  };
}

/**
 * What this call actually cost, from the response's own metadata.
 *
 * Recorded per transcript on purpose. Reading video is the ONLY real cost in this
 * product, and video tokenizes far heavier than text (roughly 260-300 tokens per
 * SECOND of footage), so a "cheap" flat subscription can invert on a single user
 * who feeds it long videos. Storing the true numbers per row means the unit
 * economics are a query, not a guess, and you find out in week one, not when
 * the invoice lands.
 *
 * Prices are per MILLION tokens, in USD, and live in env because they change.
 */
function readUsage(res) {
  const u = res?.usageMetadata || {};
  const input = Number(u.promptTokenCount) || 0;
  const output = Number(u.candidatesTokenCount) || 0;
  // Thinking tokens bill at the OUTPUT rate but are reported separately, miss
  // them and every cost figure is quietly low.
  const thinking = Number(u.thoughtsTokenCount) || 0;
  const total = Number(u.totalTokenCount) || input + output + thinking;

  const inRate = parseFloat(process.env.GEMINI_USD_PER_M_INPUT || "1.50");
  const outRate = parseFloat(process.env.GEMINI_USD_PER_M_OUTPUT || "9.00");
  const usd = (input / 1e6) * inRate + ((output + thinking) / 1e6) * outRate;

  return { input_tokens: input, output_tokens: output, thinking_tokens: thinking, total_tokens: total, usd };
}

// Best-effort recovery of a truncated JSON string value.
function unescapeJsonish(s) {
  return s
    .replace(/"\s*[},\]]*\s*$/, "")
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .trim();
}

/**
 * Turn a provider error into something a person can act on. Everything the user
 * can actually fix (private video, bad link, daily cap) should say so plainly;
 * everything else stays generic so we never leak keys or internals to the client.
 */
function mapProviderError(err) {
  const status = err?.status ?? err?.response?.status;
  const msg = String(err?.message || "").toLowerCase();
  const out = new Error(err?.message || "Gemini request failed");

  /**
   * ── A 401 OR 403 MEANS SOMETHING DIFFERENT ON VERTEX ──────────────────────
   * On AI Studio it is nearly always the video: private, unlisted, or blocked.
   * On Vertex the request is authenticated with a service account, so the
   * overwhelmingly likely cause is that the account cannot reach Vertex at all
   * — no credentials, the wrong project, or the API not enabled. Telling that
   * operator "this video isn't public" sends them to look at the one thing that
   * is fine.
   */
  if (isVertex() && (status === 401 || status === 403) && !msg.includes("video")) {
    out.userMessage = "We couldn't reach the model. This looks like a configuration problem on our side, not with your video.";
    console.error("[gemini] Vertex refused the request — check ADC, the project and that the Vertex AI API is enabled:", err?.message);
  } else if (msg.includes("private") || msg.includes("unlisted") || msg.includes("not accessible") || msg.includes("forbidden")) {
    out.userMessage = "This video isn't public. Gemini can only read public YouTube videos. Unlisted and private ones don't work.";
  } else if (status === 429 || msg.includes("quota") || msg.includes("rate limit") || msg.includes("resource_exhausted")) {
    out.userMessage = "We've hit today's video-processing limit. Please try again later.";
    out.retryable = true;
  } else if (status === 400 && (msg.includes("url") || msg.includes("uri") || msg.includes("video"))) {
    out.userMessage = "Gemini couldn't open this video. Check the link is a public YouTube video.";
  } else if (status === 404) {
    out.userMessage = "That video doesn't exist or has been removed.";
  } else if (status >= 500 || msg.includes("unavailable") || msg.includes("overloaded")) {
    out.userMessage = "The model is busy right now. Please try again in a moment.";
    out.retryable = true;
  } else {
    out.userMessage = "We couldn't read this video. Please try again.";
  }
  return out;
}

export default { transcribeYouTube };

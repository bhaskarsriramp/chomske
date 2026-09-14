/**
 * gemini.js: the editor's one way of asking the model for JSON.
 *
 * Transcription (transcribeSpeech.js) and caption translation
 * (translateCaptions.js) share the key rotation, the cost arithmetic and the
 * judgement of which failures are worth a retry. Kept apart from the script
 * writer's client because the editor's calls are mechanical: no thinking budget,
 * low temperature, strict JSON.
 */
import { GoogleGenAI } from "@google/genai";

export const AUDIO_MODEL = process.env.GEMINI_AUDIO_MODEL || process.env.GEMINI_TEXT_MODEL || process.env.GEMINI_VIDEO_MODEL || "gemini-3.5-flash";
export const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || process.env.GEMINI_AUDIO_MODEL || "gemini-3.5-flash";

let _keys = null;
let _cursor = 0;
function nextKey() {
  if (!_keys) {
    _keys = String(process.env.AISTUDIO_KEY || "").split(",").map((k) => k.trim()).filter(Boolean);
  }
  if (!_keys.length) throw new Error("AISTUDIO_KEY is not set");
  return _keys[_cursor++ % _keys.length];
}
const _clients = new Map();
function client(key) {
  if (!_clients.has(key)) _clients.set(key, new GoogleGenAI({ apiKey: key }));
  return _clients.get(key);
}

/**
 * One request, parsed.
 * @returns {Promise<{ json: object, usd: number, input: number, output: number }>}
 */
export async function generateJson({ model, parts, maxOutputTokens = 16384, temperature = 0.1 }) {
  const res = await client(nextKey()).models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: {
      temperature,
      responseMimeType: "application/json",
      maxOutputTokens,
      // Transcribing and translating are mechanical. Same measured finding as
      // geminiClient.js: thinking costs output-rate tokens and changes nothing.
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  const raw = res?.text || "";
  const json = JSON.parse(raw || "{}");
  const u = res?.usageMetadata || {};
  const inRate = parseFloat(process.env.GEMINI_USD_PER_M_INPUT || "1.50");
  const outRate = parseFloat(process.env.GEMINI_USD_PER_M_OUTPUT || "9.00");
  const input = Number(u.promptTokenCount) || 0;
  const output = (Number(u.candidatesTokenCount) || 0) + (Number(u.thoughtsTokenCount) || 0);
  return { json, usd: (input / 1e6) * inRate + (output / 1e6) * outRate, input, output };
}

export function retryable(err) {
  const status = err?.status ?? err?.response?.status;
  const msg = String(err?.message || "").toLowerCase();
  return status === 429 || status >= 500 || /unavailable|overloaded|resource_exhausted|deadline|unexpected end|json/.test(msg);
}

/** Runs `fn` over items, `size` at a time. */
export async function pool(items, size, fn) {
  const queue = items.map((item, i) => [item, i]);
  await Promise.all(
    Array.from({ length: Math.min(size, queue.length) }, async () => {
      while (queue.length) {
        const [item, i] = queue.shift();
        await fn(item, i);
      }
    })
  );
}

export default { AUDIO_MODEL, TEXT_MODEL, generateJson, retryable, pool };

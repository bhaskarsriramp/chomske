// Gemini AI Studio client — the only LLM provider used in this project. No
// Vertex AI: AI Studio needs just an API key (AISTUDIO_KEY), not a service-account
// key file, which is the whole point of running this off a GCE VM.
//
// Scoped to what chomske actually calls today (one JSON-mode classification call
// in realtime/socket.js). Mirrors betaFounderProduction's geminiSmartClient.js
// pattern (Redis-backed rate limiter, multi-key support) without the parts that
// have no caller here (embeddings, vision, grounded search).

import { GoogleGenAI } from "@google/genai";
import { createHash } from "crypto";
import { createRedisLimiter, callWithRateLimitProtection } from "../utils/apiRateLimiter.js";

const AI_STUDIO_MODEL = process.env.AISTUDIO_MODEL || "gemini-3.1-flash-lite";

// Chomske's only call site is "classify the first message of a new conversation"
// — a handful of calls per new conversation, nowhere near betaFounderProduction's
// high-volume budget. These defaults are generous for that load.
const AI_STUDIO_RPM     = Number(process.env.AISTUDIO_RPM)     || 100;
const AI_STUDIO_MIN_GAP = Number(process.env.AISTUDIO_MIN_GAP) || 0;

function _keyIdFor(prefix, secret) {
  return `${prefix}_${createHash("sha256").update(secret).digest("hex").slice(0, 8)}`;
}

function parseAIStudioCandidates() {
  const raw = process.env.AISTUDIO_KEY || "";
  return raw
    .split(",")
    .map(k => k.trim())
    .filter(Boolean)
    .map(apiKey => ({
      keyId: _keyIdFor("aistudio", apiKey),
      apiKey,
    }));
}

const _clients = new Map();
function getClient(candidate) {
  const cached = _clients.get(candidate.keyId);
  if (cached) return cached;
  const client = new GoogleGenAI({ apiKey: candidate.apiKey });
  _clients.set(candidate.keyId, client);
  return client;
}

const aiStudioLimiter = createRedisLimiter({
  service: "gemini_aistudio",
  limit: AI_STUDIO_RPM,
  windowMs: 60_000,
  minGapMs: AI_STUDIO_MIN_GAP,
  getCandidates: async () => parseAIStudioCandidates(),
});

function parseJSONResponse(raw) {
  try { return JSON.parse(raw); } catch {}
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch {} }
  throw new Error(`callGeminiJSON: no JSON in response: ${raw.slice(0, 200)}`);
}

/**
 * Call Gemini (AI Studio) in JSON mode and return the parsed object.
 *
 * @param {string} prompt
 * @param {object} [opts]
 * @param {number} [opts.temperature=0.3]
 * @param {number} [opts.maxOutputTokens=1024]
 * @param {number} [opts.maxWaitMs] — give up waiting for a rate-limit slot after this long
 */
export async function callGeminiJSON(prompt, opts = {}) {
  const { temperature = 0.3, maxOutputTokens = 1024, maxWaitMs = 30_000 } = opts;

  const won = await aiStudioLimiter.acquire({ maxWaitMs, onAllCooled: "wait" });
  const client = getClient(won);

  const result = await callWithRateLimitProtection({
    service: "gemini_aistudio",
    keyId: won.keyId,
    fn: () => client.models.generateContent({
      model: AI_STUDIO_MODEL,
      contents: prompt,
      config: {
        temperature,
        maxOutputTokens,
        responseMimeType: "application/json",
      },
    }),
  });

  const raw = result.text || "";
  if (!raw) {
    const finishReason = result.candidates?.[0]?.finishReason || "UNKNOWN";
    throw new Error(`callGeminiJSON: empty response (finishReason: ${finishReason})`);
  }
  return parseJSONResponse(raw);
}

const _keyCount = parseAIStudioCandidates().length;
console.log(
  `[gemini] Initialized | AI Studio (${AI_STUDIO_MODEL}, ${AI_STUDIO_RPM} RPM, ${_keyCount} key${_keyCount === 1 ? "" : "s"})`
);

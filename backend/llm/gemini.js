/**
 * Gemini via Vertex AI — FounderDB LLM client
 *
 * Two tiers:
 *   Flash  (gemini-2.0-flash-001)  — cheap, fast classification tasks
 *   Pro    (gemini-1.5-pro-002)    — complex multi-step reasoning
 *
 * IMPORTANT: generationConfig is set ONLY in the request, never on the model.
 * Setting it in both places causes @google-cloud/vertexai to merge them
 * unpredictably, which can silently ignore maxOutputTokens.
 *
 * PRIMARY JSON SAFETY: pass a `schema` option to enable Vertex AI Controlled
 * Generation (responseSchema). This constrains token sampling so the output is
 * always valid, well-formed JSON — even when maxOutputTokens is hit the model
 * closes all open brackets instead of truncating mid-string.
 *
 * FALLBACK: recoverJson() handles legacy calls without schema using bracket-
 * matching and jsonrepair for partial recovery.
 */

import { VertexAI, SchemaType } from '@google-cloud/vertexai';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { jsonrepair } from 'jsonrepair';

export { SchemaType };  // re-export so agents don't need a second import

const __dirname = dirname(fileURLToPath(import.meta.url));
const CREDS_PATH = join(__dirname, '../routes/service-account-key.json');

let credentials;
try {
  credentials = JSON.parse(readFileSync(CREDS_PATH, 'utf8'));
} catch (e) {
  throw new Error(`[Gemini] Cannot load GCS credentials at ${CREDS_PATH}: ${e.message}`);
}

const PROJECT_ID = credentials.project_id;
const LOCATION   = process.env.VERTEX_LOCATION || 'us-central1';

const vertexAI = new VertexAI({
  project: PROJECT_ID,
  location: LOCATION,
  googleAuthOptions: { credentials },
});

// ── Model handles ─────────────────────────────────────────────────────────────
//
// IMPORTANT: generationConfig lives ONLY in the request (built in callGemini),
// NOT on the model object. When generationConfig exists at BOTH levels the SDK
// merges them and silently drops maxOutputTokens — causing unbounded 20k+ char
// garbage responses even when maxTokens=600 is specified.
// Single-source rule: model has NO generationConfig; everything is in the request.

const FLASH_MODEL = 'gemini-2.0-flash-001';
// gemini-1.5-pro-002 returned 404 for this project — use Flash 2.0 for all calls.
// Upgrade to a Pro model here once the project is granted access.
const PRO_MODEL   = 'gemini-2.0-flash-001';

function getModel(useFlash) {
  return vertexAI.getGenerativeModel({
    model: useFlash ? FLASH_MODEL : PRO_MODEL,
    // No generationConfig here — it must all live in the request.
  });
}

// ── Bracket-matching object extractor ─────────────────────────────────────────
//
// Fallback recovery for responses WITHOUT responseSchema.
// Walks through `text` and extracts every complete { ... } block it finds,
// regardless of nesting depth, with proper string-escape tracking.
//
// Returns an array of parsed objects. Stops at the first truncated block
// (unmatched open brace) so the result is always valid.

function extractCompleteObjects(text, fromIndex = 0) {
  const objects = [];
  let   i       = fromIndex;

  while (i < text.length) {
    // Skip whitespace and commas between objects
    while (i < text.length && /[\s,]/.test(text[i])) i++;

    if (i >= text.length || text[i] === ']' || text[i] === '}') break;
    if (text[i] !== '{') { i++; continue; }

    // Track depth with proper string escaping
    let depth    = 0;
    let inStr    = false;
    let escaped  = false;
    let objStart = i;
    let closed   = false;

    for (let j = i; j < text.length; j++) {
      const ch = text[j];

      if (escaped)             { escaped = false; continue; }
      if (ch === '\\' && inStr) { escaped = true;  continue; }
      if (ch === '"')           { inStr = !inStr;  continue; }
      if (inStr)                 continue;

      if      (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          const fragment = text.slice(objStart, j + 1);
          try       { objects.push(JSON.parse(fragment)); }
          catch     { try { objects.push(JSON.parse(jsonrepair(fragment))); } catch { /* skip malformed */ } }
          i      = j + 1;
          closed = true;
          break;
        }
      }
    }

    if (!closed) break; // Truncated mid-object — stop here, don't emit partial data
  }

  return objects;
}

// ── Scalar value extractor (for strings in truncated objects) ──────────────────

function extractStringField(text, key) {
  const re = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*?)"`);
  return re.exec(text)?.[1] ?? null;
}

// ── Multi-pass JSON recovery ───────────────────────────────────────────────────
//
// Only used when responseSchema is NOT provided (legacy/fallback path).
// Recovery chain (stops at first success):
//
//   Pass 1 — JSON.parse (normal case)
//   Pass 2 — jsonrepair then JSON.parse (unquoted keys, trailing commas)
//   Pass 3 — Array responses: bracket-match to extract complete elements
//   Pass 4 — Object with named array field (e.g. "pipeline"): extract stages
//             via bracket-matching + reconstruct the object with scalar fields
//   Pass 5 — Object: try appending common closing suffixes then jsonrepair
//
// Returns null only when all passes fail — the caller decides what to do.

function recoverJson(text) {
  if (!text || text.trim() === '') return null;
  const trimmed = text.trimStart();

  // Pass 1
  try { return JSON.parse(text); } catch { /* continue */ }

  // Pass 2
  try { return JSON.parse(jsonrepair(text)); } catch { /* continue */ }

  // Pass 3 — truncated top-level array
  if (trimmed.startsWith('[')) {
    const arrayContentStart = text.indexOf('[') + 1;
    const objects = extractCompleteObjects(text, arrayContentStart);
    if (objects.length > 0) {
      console.warn(`[Gemini] Recovered ${objects.length} objects from truncated array`);
      return objects;
    }
  }

  // Pass 4 — truncated object containing a named array (e.g. "pipeline", "stages")
  // Reconstruct by bracket-matching the inner array and re-extracting scalar fields.
  if (trimmed.startsWith('{')) {
    for (const arrayKey of ['pipeline', 'stages', 'aggregation', 'termMappings', 'equivalences', 'statusMappings', 'resolutions']) {
      const keyIdx   = text.indexOf(`"${arrayKey}"`);
      if (keyIdx === -1) continue;

      const arrStart = text.indexOf('[', keyIdx);
      if (arrStart === -1) continue;

      const items = extractCompleteObjects(text, arrStart + 1);
      if (items.length === 0) continue;

      // Re-assemble the object with whatever scalar fields we can find
      const recovered = { [arrayKey]: items };
      for (const field of ['collection', 'explanation', 'name', 'role', 'anchorEntity', 'semanticSignature']) {
        const val = extractStringField(text, field);
        if (val !== null) recovered[field] = val;
      }

      console.warn(`[Gemini] Recovered ${items.length} items in "${arrayKey}" from truncated object`);
      return recovered;
    }

    // Pass 5 — try simple suffix appending for short truncations
    for (const suffix of ['"}', '"}]}', '}', ']}', '"}}']) {
      try { return JSON.parse(jsonrepair(text + suffix)); } catch { /* continue */ }
    }
  }

  return null; // all passes exhausted
}

// ── Rate-limit helpers ────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * is429(err) — true if the Vertex AI SDK error is a rate-limit (429) response.
 * The SDK wraps the HTTP error in a ClientError whose message contains the raw
 * JSON body, so we detect by string-scanning rather than instanceof.
 */
function is429(err) {
  const msg = err?.message ?? '';
  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('Too Many Requests')
  );
}

// ── Core call ─────────────────────────────────────────────────────────────────

/**
 * callGemini(prompt, options) → parsed JSON | plain string
 *
 * @param {string}  prompt
 * @param {object}  options
 * @param {boolean} options.useFlash   - Flash model (default false = Pro)
 * @param {boolean} options.jsonMode   - expect JSON output (default true)
 * @param {number}  options.maxTokens  - max output tokens
 *                                       default 6144 for Pro, 2048 for Flash
 * @param {object}  options.schema     - Vertex AI responseSchema for controlled
 *                                       generation (STRONGLY RECOMMENDED for all
 *                                       JSON calls — guarantees valid output even
 *                                       at token limit)
 *
 * Retry policy (429 only):
 *   Attempt 1 — immediate
 *   Attempt 2 — wait 5 s
 *   Attempt 3 — wait 15 s
 *   Attempt 4 — wait 30 s
 *   After 4 failures → re-throw so the caller's catch block can log and skip
 */
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000]; // waits before attempts 2, 3, 4

export async function callGemini(prompt, { useFlash = false, jsonMode = true, maxTokens, schema, tag = 'unknown' } = {}) {
  const tokens = maxTokens ?? (useFlash ? 2048 : 6144);
  const model  = getModel(useFlash);

  // All generation settings go here — single source of truth, no SDK merge.
  const requestConfig = {
    temperature:     0.1,
    maxOutputTokens: tokens,
  };
  if (jsonMode) requestConfig.responseMimeType = 'application/json';
  if (schema)   requestConfig.responseSchema   = schema;

  const request = {
    contents:       [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: requestConfig,
  };

  console.log(`[Gemini:${tag}] → ${useFlash ? 'flash' : 'pro'} maxTokens:${tokens} schema:${!!schema}`);

  // ── SDK call with exponential retry on 429 ───────────────────────────────
  // Only 429 (RESOURCE_EXHAUSTED) triggers retries — other errors (blocked
  // content, malformed schema, network issues) are re-thrown immediately.
  let result;
  let lastErr;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      const waitMs = RETRY_DELAYS_MS[attempt - 1];
      console.warn(`[Gemini:${tag}] 429 rate-limit — waiting ${waitMs / 1000}s before retry ${attempt}/${RETRY_DELAYS_MS.length}…`);
      await sleep(waitMs);
    }

    try {
      result = await model.generateContent(request);
      lastErr = null;
      break; // success — exit retry loop
    } catch (sdkErr) {
      lastErr = sdkErr;
      if (!is429(sdkErr)) {
        // Non-retriable error — fail immediately with a tagged message
        throw new Error(`[Gemini:${tag}] SDK error (${useFlash ? 'flash' : 'pro'}, ${tokens}tok): ${sdkErr.message}`);
      }
      // 429 — will retry (or fall through to throw below after last attempt)
    }
  }

  if (lastErr) {
    // All retries exhausted on a 429
    throw new Error(`[Gemini:${tag}] SDK error (${useFlash ? 'flash' : 'pro'}, ${tokens}tok): ${lastErr.message}`);
  }

  const candidate = result.response?.candidates?.[0];
  if (!candidate) throw new Error(`[Gemini:${tag}] No candidates in response`);

  const finishReason = candidate.finishReason;
  if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
    throw new Error(`[Gemini] Blocked: finishReason=${finishReason}`);
  }

  const text = candidate.content?.parts?.[0]?.text ?? '';

  if (!jsonMode) return text;

  if (finishReason === 'MAX_TOKENS') {
    if (schema) {
      // With responseSchema, Vertex AI closes all brackets before stopping —
      // the output should still be valid JSON (just a shorter pipeline/array).
      console.warn(`[Gemini:${tag}] Hit token limit (${tokens}) — responseSchema should produce valid JSON with fewer items`);
    } else {
      console.warn(`[Gemini:${tag}] Hit token limit (${tokens}), attempting partial recovery…`);
    }
  }

  console.log(`[Gemini:${tag}] response: ${text.length} chars, finish=${finishReason ?? 'STOP'}, model=${useFlash ? 'flash' : 'pro'}`);

  const parsed = recoverJson(text);
  if (parsed !== null) return parsed;

  throw new Error(
    `[Gemini:${tag}] Could not parse response (${text.length} chars, finish=${finishReason}): ` +
    text.slice(0, 200),
  );
}

export { PROJECT_ID, LOCATION };

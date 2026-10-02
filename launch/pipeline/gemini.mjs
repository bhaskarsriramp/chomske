/**
 * gemini.mjs: one JSON answer from Gemini, retried through rate limits.
 */
import { aiKey, TEXT_MODEL } from "./env.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function askJson({ parts, schema, model = TEXT_MODEL, temperature = 0.7, label = "gemini" }) {
  if (!aiKey()) throw new Error("AISTUDIO_KEY is not set");
  let last;
  for (let attempt = 1; attempt <= 5; attempt++) {
    let res;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": aiKey(), "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { responseMimeType: "application/json", ...(schema ? { responseSchema: schema } : {}), temperature },
        }),
        signal: AbortSignal.timeout(240_000),
      });
    } catch (err) {
      last = err;
      await sleep(1500 * attempt);
      continue;
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      last = new Error(`${label} ${res.status}: ${JSON.stringify(body).slice(0, 400)}`);
      if (res.status === 429 || res.status >= 500) {
        await sleep(3000 * attempt);
        continue;
      }
      throw last;
    }
    const text = (body.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    try {
      return { json: JSON.parse(text), usage: body.usageMetadata || null };
    } catch {
      last = new Error(`${label}: the answer was not JSON: ${text.slice(0, 200)}`);
    }
  }
  throw last;
}

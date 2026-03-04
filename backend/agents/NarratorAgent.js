/**
 * NarratorAgent — generates a business-focused natural language answer
 * from raw MongoDB results.
 *
 * Called AFTER the pipeline executes. Receives the question + actual data
 * and produces a concise, insight-driven answer (not a template string).
 *
 * Always runs when there are results — even pure $count results get a proper
 * sentence instead of "N records in collection".
 * Falls back gracefully — the caller uses the template answer if this fails.
 */

import { callGemini } from '../llm/gemini.js';

export class NarratorAgent {
  /**
   * synthesize(question, collection, results, recordCount) → string | null
   *
   * Returns a 2-5 sentence NL answer, or null on LLM failure (caller falls
   * back to the template answer string).
   */
  async synthesize(question, collection, results, recordCount) {
    if (!results?.length) return null;

    console.log(`[NarratorAgent] synthesizing: ${results.length} doc(s) from "${collection}"`);

    // Strip internal MongoDB fields and large nested objects for a clean sample
    const sample = results.slice(0, 15).map((doc) => {
      const clean = {};
      for (const [k, v] of Object.entries(doc)) {
        if (k === '__v') continue;
        if (Array.isArray(v)) {
          clean[k] = `[${v.length} items]`; // summarise arrays
        } else if (typeof v === 'object' && v !== null) {
          const json = JSON.stringify(v);
          if (json.length < 120) clean[k] = v; // keep small nested objects, skip large ones
        } else {
          clean[k] = v;
        }
      }
      return clean;
    });

    const dataBlock = JSON.stringify(sample, null, 2).slice(0, 4000);

    const prompt = `You are a SaaS analytics assistant helping a founder understand their business.

Founder's question: "${question}"

The system queried the "${collection}" collection and retrieved ${recordCount} record${recordCount !== 1 ? 's' : ''}.

Data sample (up to 15 records):
${dataBlock}

Write a direct, concise business answer (2-5 sentences):
- Answer the question as specifically as possible using the data
- Highlight patterns, rankings, outliers, or actionable insights
- If you see a "total" field from a count query, state that number clearly in context
- If the data only partially answers the question (e.g. missing related data), say what you CAN conclude and what extra data would give the full picture
- Speak like a business analyst, not a database engineer
- Do NOT repeat field names as-is, JSON structure, or say "the data shows" / "based on the data"
- Do NOT start with "Based on" or "According to"`;

    try {
      const answer = await callGemini(prompt, {
        useFlash:  true,
        jsonMode:  false,
        maxTokens: 400,
        tag:       'narrator',
      });
      const text = typeof answer === 'string' ? answer.trim() : null;
      if (text) {
        console.log(`[NarratorAgent] done: ${text.length} chars`);
      } else {
        console.warn('[NarratorAgent] empty response from Gemini');
      }
      return text || null;
    } catch (err) {
      console.warn('[NarratorAgent] synthesis failed (using template fallback):', err.message);
      return null;
    }
  }
}

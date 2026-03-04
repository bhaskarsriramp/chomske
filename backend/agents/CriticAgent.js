/**
 * CriticAgent — reviews the Analyst's pipeline for SaaS-specific logic errors.
 *
 * Schema uses ONLY primitive types (no free-form objects) so Vertex AI
 * Controlled Generation fully constrains output. revisedPipeline removed
 * from schema — the Critic approves/rejects but doesn't rewrite (that would
 * require open-ended objects and re-introduce truncation risk).
 */

import { callGemini, SchemaType } from '../llm/gemini.js';

const SAAS_TRAP_GUIDE = `
1. Zombie accounts: filter out status=cancelled/inactive/deleted BEFORE counting
2. Trial confusion: "trialing" ≠ "paid" — check if trial users are excluded from revenue
3. Double-count: if subscriptions has both parent and item rows, ensure $group deduplicates
4. Missing time filter: metrics like "signups this month" need a date $match
5. Cents vs dollars: if amount looks like 999 for $9.99, results should be divided by 100
6. Null amounts: $sum includes null as 0 — need amount > 0 filter first
7. $lookup without $unwind: results are arrays — always $unwind (preserveNullAndEmptyArrays)
8. Churn rate denominator: divide by TOTAL active at START of period, not end
`.trim();

// ── Controlled-generation schema — all primitives ─────────────────────────────
// revisedPipeline intentionally omitted: rewriting MongoDB pipeline JSON would
// require open-ended object schema, re-introducing truncation risk.

const CRITIC_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    approved:    { type: SchemaType.BOOLEAN },
    confidence:  { type: SchemaType.NUMBER },
    issues:      { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    suggestions: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
  },
  required: ['approved', 'confidence', 'issues', 'suggestions'],
};

export class CriticAgent {
  constructor(kg) {
    this.kg = kg;
  }

  /**
   * review(pipeline, plan) → CriticResult
   */
  async review(pipeline, plan) {
    const fastIssues = this._fastChecks(pipeline);

    const prompt = `SaaS DB engineer reviewing a MongoDB pipeline.

Question: "${plan.originalQuestion}"
Collection: "${plan.primaryCollection}"

Pipeline (${pipeline.length} stages):
${JSON.stringify(pipeline)}

SaaS traps: ${SAAS_TRAP_GUIDE.replace(/\n/g, ' | ')}

Flag real logical errors only. If the pipeline is sound, set approved:true and leave issues empty.`;

    try {
      const result = await callGemini(prompt, { useFlash: true, maxTokens: 1024, schema: CRITIC_SCHEMA, tag: 'critic' });

      const allIssues = [...fastIssues, ...(result.issues ?? [])];

      return {
        approved:        fastIssues.length === 0 && (result.approved ?? true),
        confidence:      result.confidence  ?? 0.75,
        issues:          allIssues,
        suggestions:     result.suggestions ?? [],
        revisedPipeline: null,
      };
    } catch (err) {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('[CriticAgent] Review FAILED — approving based on fast checks only');
      console.error('  Error     :', err.message);
      console.error('  Stack     :', err.stack ?? '(no stack)');
      console.error('  Collection:', plan.primaryCollection);
      console.error('  Pipeline  :', pipeline.length, 'stages');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return {
        approved:        fastIssues.length === 0,
        confidence:      0.6,
        issues:          fastIssues,
        suggestions:     [],
        revisedPipeline: null,
      };
    }
  }

  _fastChecks(pipeline) {
    const issues = [];
    if (!Array.isArray(pipeline) || pipeline.length === 0) {
      issues.push('Pipeline is empty or not an array');
      return issues;
    }

    const FORBIDDEN = ['$out', '$merge', '$currentOp', '$listLocalSessions', '$function', '$where'];
    pipeline.forEach((stage, i) => {
      for (const op of FORBIDDEN) {
        if (stage[op] !== undefined) issues.push(`Forbidden operation at stage ${i}: ${op}`);
      }
    });

    const hasLookup = pipeline.some((s) => s.$lookup);
    const hasUnwind = pipeline.some((s) => s.$unwind);
    if (hasLookup && !hasUnwind) {
      issues.push('$lookup without $unwind — joined arrays will not be flattened');
    }

    return issues;
  }
}

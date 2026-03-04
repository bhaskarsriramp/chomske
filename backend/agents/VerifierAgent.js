/**
 * VerifierAgent — final safety gate before execution. Pure rule-based, no LLM.
 *
 * Enforces:
 *   - No write/destructive operations
 *   - Pipeline size within bounds
 *   - $limit always present (auto-inserts if missing)
 *   - No deeply-nested $out / $merge buried inside $facet
 *
 * Returns { safe, issues, pipeline } where pipeline may have auto-fixes applied.
 */

const FORBIDDEN_OPS = new Set([
  '$out', '$merge', '$currentOp', '$listLocalSessions',
  '$function', '$where', '$accumulator',
]);

const MAX_STAGES = 25;
const MAX_LIMIT  = 500;
const DEFAULT_LIMIT = 100;

export class VerifierAgent {
  /**
   * verify(pipeline) → { safe, issues, pipeline }
   *
   * Always returns a pipeline (possibly auto-fixed).
   */
  verify(pipeline) {
    const issues = [];

    if (!Array.isArray(pipeline)) {
      return { safe: false, issues: ['Pipeline must be an array'], pipeline: [] };
    }

    // Stage count check
    if (pipeline.length > MAX_STAGES) {
      issues.push(`Pipeline too long: ${pipeline.length} stages (max ${MAX_STAGES})`);
    }

    // Inspect each stage
    for (let i = 0; i < pipeline.length; i++) {
      const stage = pipeline[i];

      for (const op of FORBIDDEN_OPS) {
        if (stage[op] !== undefined) {
          issues.push(`Forbidden op at stage ${i}: ${op}`);
        }
      }

      // Auto-cap oversized $limit
      if (stage.$limit !== undefined) {
        if (typeof stage.$limit !== 'number' || stage.$limit > MAX_LIMIT) {
          issues.push(`$limit at stage ${i} capped to ${MAX_LIMIT} (was ${stage.$limit})`);
          pipeline[i] = { $limit: MAX_LIMIT };
        }
      }

      // Check for nested forbidden ops inside $facet
      if (stage.$facet) {
        for (const [facetName, facetPipeline] of Object.entries(stage.$facet)) {
          if (Array.isArray(facetPipeline)) {
            for (const fs of facetPipeline) {
              for (const op of FORBIDDEN_OPS) {
                if (fs[op] !== undefined) {
                  issues.push(`Forbidden op inside $facet.${facetName}: ${op}`);
                }
              }
            }
          }
        }
      }
    }

    // Ensure a $limit exists (safety net — always bound result sets)
    const hasLimit = pipeline.some((s) => s.$limit !== undefined);
    if (!hasLimit) {
      pipeline.push({ $limit: DEFAULT_LIMIT });
    }

    const safe = issues.filter((i) => !i.startsWith('$limit at')).length === 0;
    return { safe, issues, pipeline };
  }
}

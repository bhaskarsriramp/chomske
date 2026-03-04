/**
 * AliasResolver — deterministic field→collection matching from natural language.
 *
 * Replaces LLM guesswork for "which collection + field does this question refer to?"
 * Uses the alias dictionary built by SchemaFingerprinter Pass 4.5 (stored in
 * node.fields[fieldName].aliases) to resolve human phrases to exact DB fields.
 *
 * Three resolution levels (fastest to slowest, stops at first match per field):
 *
 *   L1 — Exact field name     confidence: 1.0
 *        "igFollowersCount" appears literally in the question.
 *
 *   L2 — Exact alias phrase   confidence: 0.9
 *        A stored alias phrase (e.g. "instagram followers") appears in the question.
 *
 *   L3 — Word-fragment match  confidence: 0.7
 *        Most significant words (>4 chars) from any alias appear in the question.
 *        e.g. question "instagram follower count" matches alias "instagram followers"
 *        because "instagram" and "follower" are both present.
 *
 * Results are deduplicated (best confidence wins per collection.field pair) and
 * sorted by confidence descending.
 *
 * Usage:
 *   const resolver = new AliasResolver(kg);
 *   const matches  = resolver.resolveFields(question);
 *   // → [{ collection, field, matchedTerm, confidence }]
 */

export class AliasResolver {
  constructor(kg) {
    this.kg = kg;
  }

  /**
   * resolveFields(question) → FieldMatch[]
   *
   * FieldMatch: { collection, field, matchedTerm, confidence }
   *
   * Returns all fields that match the question, sorted by confidence desc.
   * Returns [] if no aliases are stored yet (fingerprint hasn't run Pass 4.5).
   */
  resolveFields(question) {
    const q       = question.toLowerCase();
    const best    = new Map();   // "collection.field" → FieldMatch (highest confidence)

    const update = (collection, field, matchedTerm, confidence) => {
      const key  = `${collection}.${field}`;
      const prev = best.get(key);
      if (!prev || prev.confidence < confidence) {
        best.set(key, { collection, field, matchedTerm, confidence });
      }
    };

    for (const [collName, node] of Object.entries(this.kg.nodes)) {
      for (const [fieldName, field] of Object.entries(node.fields ?? {})) {
        if (field.isPii) continue;

        // ── L1: exact field name in question ───────────────────────────────────
        if (q.includes(fieldName.toLowerCase())) {
          update(collName, fieldName, fieldName, 1.0);
          continue; // best possible — no need to check aliases
        }

        const aliases = field.aliases ?? [];
        if (aliases.length === 0) continue;

        let foundL2 = false;

        // ── L2: exact alias phrase ──────────────────────────────────────────────
        for (const alias of aliases) {
          if (q.includes(alias)) {
            update(collName, fieldName, alias, 0.9);
            foundL2 = true;
            break;
          }
        }

        if (foundL2) continue;

        // ── L3: word-fragment match ─────────────────────────────────────────────
        // An alias matches if ≥70% of its significant words (>4 chars) appear in
        // the question. "instagram followers" matches "how many instagram follower"
        // because both "instagram" (9 chars) and "follower" (8 chars) are present.
        for (const alias of aliases) {
          const sigWords = alias.split(/\s+/).filter((w) => w.length > 4);
          if (sigWords.length === 0) continue;

          const hits = sigWords.filter((w) => q.includes(w));
          if (hits.length >= Math.ceil(sigWords.length * 0.7)) {
            update(collName, fieldName, alias, 0.7);
            break; // take first L3 match per field
          }
        }
      }
    }

    return [...best.values()].sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * topCollections(matches) → Set<string>
   *
   * Convenience: extracts the collection names from resolveFields() results.
   * Used by PlannerAgent to boost alias-identified collections in scoring.
   */
  topCollections(matches) {
    return new Set(matches.map((m) => m.collection));
  }

  /**
   * formatHint(matches) → string
   *
   * Builds the "Pre-identified fields" section injected into the planner prompt.
   * Shows the LLM exactly what was resolved so it doesn't have to guess.
   *
   * Example output:
   *   "instagram followers" → users.igFollowersCount [number] (100% confidence)
   *   "connected instagram" → users.instagramConnected [boolean] (90% confidence)
   */
  formatHint(matches, kg) {
    if (matches.length === 0) return '  none';
    return matches.slice(0, 6).map((m) => {
      const fType = kg.nodes[m.collection]?.fields?.[m.field]?.type ?? 'unknown';
      const pct   = Math.round(m.confidence * 100);
      return `  "${m.matchedTerm}" → ${m.collection}.${m.field} [${fType}] (${pct}% confidence)`;
    }).join('\n');
  }
}

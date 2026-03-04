/**
 * GraphTraversal — BFS over the Semantic Knowledge Graph.
 *
 * Used by PlannerAgent to answer questions like:
 *   "How do I join users → payments if there's no direct edge?"
 *
 * Algorithm: undirected BFS finds the shortest hop-path between any two
 * collections in the KG, even through intermediate collections.
 * The result is a list of $lookup stages ready to inject into an aggregation.
 */

export class GraphTraversal {
  constructor(kg) {
    this.kg = kg;
  }

  // ── BFS path finder ──────────────────────────────────────────────────────────

  /**
   * findPath(from, to) → edge[] | null
   *
   * Returns the SHORTEST ordered list of edges that connect `from` to `to`.
   * Edges may have `reversed: true` meaning the traversal goes against
   * the declared FK direction.
   * Returns null when no path exists.
   */
  findPath(from, to) {
    if (from === to) return [];
    const adj = this.kg.buildAdjacency();
    if (!adj[from] || !adj[to]) return null;

    const visited = new Set([from]);
    const queue   = [{ node: from, path: [] }];

    while (queue.length > 0) {
      const { node, path } = queue.shift();
      for (const { neighbor, edge } of (adj[node] ?? [])) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        const newPath = [...path, edge];
        if (neighbor === to) return newPath;
        queue.push({ node: neighbor, path: newPath });
      }
    }
    return null;
  }

  /**
   * findAllPaths(from, to, maxHops = 3) → edge[][]
   *
   * Returns ALL simple paths (no repeated nodes) from `from` to `to`
   * up to maxHops edges long, sorted shortest-first.
   *
   * Used by PlannerAgent to show Gemini EVERY available route between
   * collection pairs — so it can pick the semantically correct one
   * (e.g. "received by" → via-conversations path, not direct senderId path).
   */
  findAllPaths(from, to, maxHops = 3) {
    if (from === to) return [[]];
    const adj = this.kg.buildAdjacency();
    if (!adj[from] || !adj[to]) return [];

    const allPaths = [];
    const queue    = [{ node: from, path: [], visited: new Set([from]) }];

    while (queue.length > 0) {
      const { node, path, visited } = queue.shift();
      if (path.length >= maxHops) continue;

      for (const { neighbor, edge } of (adj[node] ?? [])) {
        if (visited.has(neighbor)) continue;
        const newPath = [...path, edge];
        if (neighbor === to) {
          allPaths.push(newPath);
        } else {
          const newVisited = new Set([...visited, neighbor]);
          queue.push({ node: neighbor, path: newPath, visited: newVisited });
        }
      }
    }

    // Sort shortest-first so the most direct path is listed first
    allPaths.sort((a, b) => a.length - b.length);
    return allPaths;
  }

  /**
   * findJoinPaths(collections) → JoinPath[]
   *
   * Given a set of collection names that a query needs, find the minimal
   * set of join paths to connect them all.
   *
   * Priority (chained-first):
   *   1. If another collection in the set forms a valid two-leg path to the
   *      target, USE that chained path — even if a direct path also exists.
   *      This is critical for schemas like users→conversations→messages where
   *      a direct users→messages (via senderId) exists but is semantically wrong
   *      for "received by" queries.
   *   2. Fall back to the direct BFS shortest path when no valid chain exists.
   *   3. If neither works, mark as unreachable.
   *
   * JoinPath: { from, to, path: edge[], via?: string }
   */
  findJoinPaths(collections) {
    if (!collections || collections.length <= 1) return [];

    const paths   = [];
    const seen    = new Set();
    const anchor  = collections[0];

    for (let i = 1; i < collections.length; i++) {
      const target = collections[i];
      const key    = [anchor, target].sort().join('||');
      if (seen.has(key)) continue;
      seen.add(key);

      // ── Priority 1: chained path through another collection in the set ──────
      // When intermediary collections are explicitly in the plan it means Gemini
      // (or the planner) determined they are semantically required — respect that
      // by preferring the chain over any shorter direct path.
      let found = false;
      for (const mid of collections) {
        if (mid === anchor || mid === target) continue;
        const p1 = this.findPath(anchor, mid);
        const p2 = this.findPath(mid, target);
        if (p1 !== null && p2 !== null) {
          paths.push({ from: anchor, to: target, path: [...p1, ...p2], via: mid });
          found = true;
          break;
        }
      }
      if (found) continue;

      // ── Priority 2: direct BFS shortest path ────────────────────────────────
      const direct = this.findPath(anchor, target);
      if (direct !== null) {
        paths.push({ from: anchor, to: target, path: direct });
        continue;
      }

      // ── Priority 3: unreachable ──────────────────────────────────────────────
      // Record an empty path — Analyst agent will handle gracefully
      paths.push({ from: anchor, to: target, path: [], unreachable: true });
    }

    return paths;
  }

  /**
   * buildLookupStages(joinPaths) → MongoDB $lookup stage[]
   *
   * Converts a list of join paths into an array of $lookup aggregation stages.
   * Deduplicates stages so the same collection isn't joined twice.
   */
  buildLookupStages(joinPaths) {
    const stages = [];
    const joined = new Set();

    for (const { path } of joinPaths) {
      for (const edge of path) {
        const localColl  = edge.reversed ? edge.to   : edge.from;
        const foreignColl = edge.reversed ? edge.from : edge.to;
        const localField  = edge.reversed ? edge.toField   : edge.fromField;
        const foreignField = edge.reversed ? edge.fromField : edge.toField;

        const key = `${localColl}>${foreignColl}`;
        if (joined.has(key)) continue;
        joined.add(key);

        stages.push({
          $lookup: {
            from:         foreignColl,
            localField:   localField,
            foreignField: foreignField,
            as:           `_j_${foreignColl}`,
          },
        });
      }
    }

    return stages;
  }

  /**
   * describeJoinPaths(joinPaths) → string[]
   * Human-readable path descriptions for LLM prompts.
   */
  describeJoinPaths(joinPaths) {
    return joinPaths
      .filter((jp) => jp.path.length > 0)
      .map(({ from, to, path, via }) => {
        const hops = path.map((e) =>
          e.reversed
            ? `${e.to}.${e.toField} → ${e.from}.${e.fromField}`
            : `${e.from}.${e.fromField} → ${e.to}.${e.toField}`,
        );
        return `${from} to ${to}${via ? ` (via ${via})` : ''}: ${hops.join(' > ')}`;
      });
  }
}

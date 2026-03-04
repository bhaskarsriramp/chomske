/**
 * KnowledgeGraph — the persistent "meta-database" that sits between
 * the founder's MongoDB and every LLM agent.
 *
 * Stores on disk as backend/graphs/{sessionId}.json so the system
 * survives restarts without re-running the expensive fingerprint phase.
 *
 * Data model:
 *   nodes      — one entry per collection (role, fields, signature, ...)
 *   edges      — directional FK relationships between collections
 *   semanticEq — groups of fields that mean the same thing (e.g. price_cents ≡ cost)
 *   metrics    — canonical metric definitions (MRR, churn, ...) so agents don't guess
 *   businessCtx — role → collection name (confirmed by the founder)
 *   websiteTerms — business terms from the marketing site → collection name
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GRAPHS_DIR = join(__dirname, '../graphs');

if (!existsSync(GRAPHS_DIR)) mkdirSync(GRAPHS_DIR, { recursive: true });

export class KnowledgeGraph {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.filePath  = join(GRAPHS_DIR, `${sessionId}.json`);

    this._data = {
      version:      2,
      sessionId,
      createdAt:    new Date().toISOString(),
      updatedAt:    new Date().toISOString(),
      nodes:        {},   // collectionName → CollectionNode
      edges:        [],   // RelationshipEdge[]
      semanticEq:   [],   // SemanticEquivalence[]
      metrics:      {},   // metricName → MetricDefinition
      businessCtx:  {},   // role → collectionName
      websiteTerms: {},   // businessTerm → collectionName
    };
  }

  // ── Persistence ─────────────────────────────────────────────────────────────

  load() {
    if (!existsSync(this.filePath)) return false;
    try {
      this._data = JSON.parse(readFileSync(this.filePath, 'utf8'));
      return true;
    } catch {
      return false;
    }
  }

  save() {
    this._data.updatedAt = new Date().toISOString();
    writeFileSync(this.filePath, JSON.stringify(this._data, null, 2));
  }

  // ── Node API ────────────────────────────────────────────────────────────────

  setNode(name, node) {
    this._data.nodes[name] = { name, ...node };
  }

  getNode(name) {
    return this._data.nodes[name] ?? null;
  }

  getNodes() {
    return Object.values(this._data.nodes);
  }

  // ── Edge API ────────────────────────────────────────────────────────────────

  addEdge(edge) {
    const dup = this._data.edges.some(
      (e) =>
        e.from === edge.from && e.to === edge.to &&
        e.fromField === edge.fromField && e.toField === edge.toField,
    );
    if (!dup) this._data.edges.push(edge);
  }

  // ── Semantic equivalences ───────────────────────────────────────────────────

  setSemanticEq(eq) {
    this._data.semanticEq = eq;
  }

  // ── Business context (confirmed role mapping) ───────────────────────────────

  setBusinessCtx(ctx) {
    this._data.businessCtx = ctx;
  }

  setWebsiteTerms(terms) {
    this._data.websiteTerms = terms;
  }

  // ── Metric definitions ──────────────────────────────────────────────────────

  setMetrics(metrics) {
    this._data.metrics = metrics;
  }

  // ── Graph adjacency (for BFS) ───────────────────────────────────────────────

  /**
   * Returns an undirected adjacency list.
   * { collectionName: [{ neighbor, edge }] }
   */
  buildAdjacency() {
    const adj = {};
    for (const name of Object.keys(this._data.nodes)) adj[name] = [];

    for (const edge of this._data.edges) {
      if (!adj[edge.from]) adj[edge.from] = [];
      if (!adj[edge.to])   adj[edge.to]   = [];
      adj[edge.from].push({ neighbor: edge.to,   edge });
      adj[edge.to].push({   neighbor: edge.from, edge: { ...edge, reversed: true } });
    }
    return adj;
  }

  // ── Token-efficient summaries for LLM calls ─────────────────────────────────

  /**
   * toCompactSummary() — minimal representation sent to Planner agent.
   * Keeps token count low: no raw field values, only shape + relationships.
   */
  toCompactSummary() {
    const nodes = this.getNodes().map((n) => {
      const importantFields = Object.entries(n.fields || {})
        .filter(([, f]) => f.isFk || f.isDate || f.isStatus || f.isAmount || f.nullable === false)
        .slice(0, 8)
        .map(([fname, f]) => {
          let s = `${fname}:${f.type}`;
          if (f.isFk)              s += '[FK]';
          if (f.isDate)            s += '[date]';
          if (f.isStatus)          s += '[status]';
          if (f.isAmount)          s += '[amount]';
          if (f.values?.length)    s += `[${f.values.slice(0, 3).join('|')}]`;
          return s;
        });

      return {
        name:          n.name,
        role:          n.role,
        anchorEntity:  n.anchorEntity,
        docCount:      n.docCount,
        velocity:      n.velocity,
        signature:     n.semanticSignature,
        keyFields:     importantFields,
      };
    });

    const edges = this._data.edges.map(
      (e) => `${e.from}.${e.fromField} -[${e.cardinality}]-> ${e.to}.${e.toField} (conf:${e.confidence?.toFixed(2)})`,
    );

    return {
      nodes,
      edges,
      metrics:     Object.keys(this._data.metrics),
      businessCtx: this._data.businessCtx,
    };
  }

  /**
   * getSubgraph(collections) — slice of the KG relevant to a specific query.
   * Used by AnalystAgent to send only what's needed.
   */
  getSubgraph(collections) {
    const names = new Set(collections);
    const nodes = {};
    for (const name of names) {
      if (this._data.nodes[name]) nodes[name] = this._data.nodes[name];
    }
    const edges = this._data.edges.filter(
      (e) => names.has(e.from) && names.has(e.to),
    );
    return { nodes, edges };
  }

  // ── Accessors ───────────────────────────────────────────────────────────────

  get nodes()        { return this._data.nodes; }
  get edges()        { return this._data.edges; }
  get metrics()      { return this._data.metrics; }
  get businessCtx()  { return this._data.businessCtx; }
  get websiteTerms() { return this._data.websiteTerms; }
  get semanticEq()   { return this._data.semanticEq; }

  /** Convenience: collection name for a given role (users/subscriptions/payments/events) */
  collectionForRole(role) {
    return this._data.businessCtx[role] ?? null;
  }

  /** Quick field lookup in a specific collection */
  findField(collectionName, patterns, typeFilter = null) {
    const node = this._data.nodes[collectionName];
    if (!node?.fields) return null;
    for (const pattern of patterns) {
      const entry = Object.entries(node.fields).find(([fname, f]) => {
        const nameOk = fname.toLowerCase().includes(pattern.toLowerCase());
        const typeOk = typeFilter ? f.type === typeFilter : true;
        return nameOk && typeOk;
      });
      if (entry) return entry[0];
    }
    if (typeFilter) {
      const entry = Object.entries(node.fields).find(([, f]) => f.type === typeFilter);
      return entry?.[0] ?? null;
    }
    return null;
  }
}

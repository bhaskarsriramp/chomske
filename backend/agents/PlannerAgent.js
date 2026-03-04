/**
 * PlannerAgent — the "brain" of the multi-agent reasoning loop.
 *
 * Uses Vertex AI Controlled Generation (responseSchema) with ONLY primitive
 * types — no free-form objects. entityFilters is a typed array instead of
 * { collection: { field: value } } to avoid open-ended object schema.
 */

import { callGemini, SchemaType } from '../llm/gemini.js';
import { GraphTraversal } from '../graph/GraphTraversal.js';
import { AliasResolver } from '../graph/AliasResolver.js';

// Regex to detect proper nouns (capitalized multi-word names) in questions
const PROPER_NOUN_RE = /\b([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\b/g;

// ── Controlled-generation schema — all primitives ─────────────────────────────

// NOTE: explanation is FIRST so it's generated before the arrays.
// If the token limit is hit, the decoder properly closes arrays (structured types)
// rather than leaving a string unterminated.
// explanation is NOT in required so it can be omitted if token budget is tight.
const PLAN_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    explanation:         { type: SchemaType.STRING },
    lookupIntent:        { type: SchemaType.BOOLEAN },
    antiJoin:            { type: SchemaType.BOOLEAN },
    steps:               { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    relevantCollections: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    primaryCollection:   { type: SchemaType.STRING },
    timeRange:           { type: SchemaType.STRING,
                           enum: [
                             'today', 'yesterday',
                             'this_week', 'last_week',
                             'last_7_days', 'last_14_days', 'last_30_days', 'last_60_days', 'last_90_days',
                             'this_month', 'last_month',
                             'this_year', 'last_year',
                             'all_time',
                           ] },
    metrics:             { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    // entityFilters as a typed array instead of open-ended object
    entityFilters: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          collection: { type: SchemaType.STRING },
          field:      { type: SchemaType.STRING },
          value:      { type: SchemaType.STRING },
        },
        required: ['collection', 'field', 'value'],
      },
    },
  },
  required: ['steps', 'relevantCollections', 'primaryCollection', 'timeRange', 'metrics'],
};

export class PlannerAgent {
  constructor(kg) {
    this.kg            = kg;
    this.traversal     = new GraphTraversal(kg);
    this.aliasResolver = new AliasResolver(kg);
  }

  /**
   * plan(question) → QueryPlan
   */
  async plan(question) {
    const summary    = this.kg.toCompactSummary();
    const nameFields = this._extractNameFields();

    // Pre-filter: score collections by keyword relevance to the question.
    // This keeps the prompt small regardless of DB size (100+ collections).
    // The LLM always sees at most MAX_COLLECTIONS_IN_PROMPT entries.
    const MAX_COLLECTIONS_IN_PROMPT = 10;

    // ── Alias resolution (deterministic, zero-LLM) ───────────────────────────
    // Runs BEFORE collection scoring so alias-matched collections get a hard boost
    // that overrides weak keyword signals ("IG followers" → users.igFollowersCount).
    const aliasMatches = this.aliasResolver.resolveFields(question);
    if (aliasMatches.length > 0) {
      console.log('[PlannerAgent] Alias matches:', aliasMatches.map(
        (m) => `${m.collection}.${m.field}="${m.matchedTerm}"(${Math.round(m.confidence * 100)}%)`
      ).join(', '));
    }

    const relevantNodes = this._scoreAndFilterCollections(question, summary.nodes, MAX_COLLECTIONS_IN_PROMPT, aliasMatches);

    const nodeLines = relevantNodes.map((n) => {
      const nameField   = nameFields[n.name];
      // Include top numeric/count fields so the model knows WHERE metric fields live.
      // Without this, "which user has most followers?" picks the wrong collection.
      // n.fields is undefined on compact summary nodes — must read from the full KG.
      const kgNodeFields = this.kg.nodes[n.name]?.fields ?? {};
      const metricFields = Object.entries(kgNodeFields)
        .filter(([, f]) => f.type === 'number' && !f.isPii)
        .map(([fn]) => fn)
        .slice(0, 4)
        .join(', ');
      return [
        `  ${n.name} [${n.role}] "${n.signature}"`,
        `| key: ${n.keyFields?.join(', ') || '—'}`,
        nameField   ? `| nameField:${nameField}` : '',
        metricFields ? `| metrics:${metricFields}` : '',
      ].filter(Boolean).join(' ');
    });

    // Pre-compute ALL reachable join paths between the filtered collections.
    // Using findAllPaths (not just findPath) so Gemini sees EVERY route between
    // collection pairs — up to 2 alternatives, max 3 hops each.
    //
    // This is critical when multiple semantically different paths exist, e.g.:
    //   users → messages: users._id=messages.senderId          ← sender path
    //   users → messages (via conversations): users._id=conversations.creatorId,
    //                        conversations._id=messages.conversationId  ← receiver path
    // Showing both lets Gemini pick the semantically appropriate one.
    const relevantNames     = new Set(relevantNodes.map((n) => n.name));
    const relevantNamesList = [...relevantNames];
    const pathLines         = [];
    const seenPair          = new Set();

    for (let i = 0; i < relevantNamesList.length; i++) {
      for (let j = i + 1; j < relevantNamesList.length; j++) {
        const a = relevantNamesList[i];
        const b = relevantNamesList[j];
        const key = `${a}||${b}`;
        if (seenPair.has(key)) continue;
        seenPair.add(key);

        const allPaths = this.traversal.findAllPaths(a, b, 3);
        if (allPaths.length === 0) continue;

        // Show up to 2 paths per pair (shortest first) — more than that adds noise
        for (const path of allPaths.slice(0, 2)) {
          if (path.length === 0) {
            pathLines.push(`  ${a} ↔ ${b}: same collection`);
          } else {
            const hops = path.map((e) =>
              e.reversed
                ? `${e.to}.${e.toField}=${e.from}.${e.fromField}`
                : `${e.from}.${e.fromField}=${e.to}.${e.toField}`,
            );
            const via = path.length > 1
              ? path.slice(0, -1).map((e) => (e.reversed ? e.from : e.to)).join(' → ')
              : '';
            pathLines.push(`  ${a} → ${b}${via ? ` (via ${via})` : ''}: ${hops.join(', ')}`);
          }
        }
      }
    }

    const properNouns = [...question.matchAll(PROPER_NOUN_RE)].map((m) => m[1]);

    const aliasHint = this.aliasResolver.formatHint(aliasMatches, this.kg);

    const prompt = `You are a MongoDB query planner for a SaaS analytics platform.

Available collections (name [role] "description" | key fields | nameField | metrics):
${nodeLines.join('\n')}

Verified join paths (up to 2 routes per pair — pick the semantically correct one):
${pathLines.join('\n') || '  No join paths discovered yet'}

Business roles: ${Object.entries(summary.businessCtx).map(([r, c]) => `${r}→${c}`).join(', ') || 'none'}

Pre-identified fields (resolved deterministically — trust these, do not guess alternatives):
${aliasHint}

Founder question: "${question}"
${properNouns.length > 0 ? `Detected entity names: ${properNouns.map((n) => `"${n}"`).join(', ')}` : ''}

Plan the query:
1. When multiple paths exist for a pair, choose by semantics:
   - Field name "senderId/authorId/createdBy" = the SENDER/CREATOR of that document
   - "received by X" / "messages to X" / "inbox of X" → avoid senderId path, use the path via the conversation/thread collection that links to X as owner/creator
   - "sent by X" / "messages from X" → use the senderId path
   - Always include intermediate collections (e.g. conversations) in relevantCollections when using a multi-hop path
2. ONLY include collections that are connected via listed paths
3. If a metric/count field already exists on a collection (shown under "metrics:"), use ONLY that collection and sort by it — do not join to count from another collection
4. Decompose into 3-5 concrete steps — be SPECIFIC: state the field, sort order, and limit
5. If a specific person/entity name is mentioned, add to entityFilters. For MULTIPLE entities (e.g. "compare X and Y"), add ONE entry per name for the same (collection, field):
   Single:   [{collection:"users", field:"name", value:"Siddartha"}]
   Multiple: [{collection:"users", field:"name", value:"Siddartha"}, {collection:"users", field:"name", value:"Rahul"}]
6. Choose the best timeRange (pick the MOST SPECIFIC match):
   today | yesterday | this_week | last_week
   last_7_days | last_14_days | last_30_days | last_60_days | last_90_days
   this_month | last_month | this_year | last_year | all_time
   ("last 28 days" → last_30_days, "last 2 weeks" → last_14_days, "this quarter" → last_90_days)
7. Set lookupIntent=true when the question asks to VIEW/DISPLAY document content rather than compute a number:
   true  → "show me", "get", "fetch", "display", "what is the [thing]", "give me details", "latest [thing] of/by/for"
   false → "how many", "count", "total", "average", "which X has most Y", "top N by", "compare"
   Example: "show me one latest message received by Siddartha" → lookupIntent=true, relevantCollections includes both conversations AND messages, sort by date desc, limit 1
8. Set antiJoin=true when the question asks for entities that have ZERO/NO related records:
   "users with zero messages", "users who haven't sent any", "users with no activity", "inactive users",
   "creators who never posted", "users without a subscription", "list users with 0 purchases"
   antiJoin uses LEFT JOIN + empty-array check — NOT a normal join. Always include the related collection.
   Example: "list users who have zero messages in the last week" → antiJoin=true, include messages collection
9. List relevant SaaS metrics (mrr, churn, conversion, signups, etc.)`;

    let plan;
    try {
      // maxTokens: 2048 — plan output is compact (~100-200 tokens for collections/steps).
      // 6144 (old default) left thousands of tokens for the explanation string →
      // model filled them → hit limit mid-string → "Unterminated string in JSON".
      plan = await callGemini(prompt, { useFlash: false, maxTokens: 2048, schema: PLAN_SCHEMA, tag: 'planner' });
    } catch (err) {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('[PlannerAgent] Gemini call FAILED — falling back to heuristic plan');
      console.error('  Error :', err.message);
      console.error('  Stack :', err.stack ?? '(no stack)');
      console.error('  Question:', question.slice(0, 120));
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      plan = this._heuristicPlan(question, summary, properNouns, nameFields);
    }

    // Convert entityFilters early — needed for routing decisions before BFS
    // [{collection, field, value}] → { collectionName: { fieldName: value | value[] } }
    // Multi-entity queries (e.g. "compare X and Y") produce multiple entries for the
    // same (collection, field) — stored as an array so AnalystAgent can emit $or/$in.
    const entityFiltersObj = {};
    for (const ef of plan.entityFilters ?? []) {
      if (!ef.collection || !ef.field || !ef.value) continue;
      if (!entityFiltersObj[ef.collection]) entityFiltersObj[ef.collection] = {};
      const existing = entityFiltersObj[ef.collection][ef.field];
      if (existing !== undefined && existing !== ef.value) {
        entityFiltersObj[ef.collection][ef.field] = Array.isArray(existing)
          ? [...existing, ef.value]
          : [existing, ef.value];
      } else {
        entityFiltersObj[ef.collection][ef.field] = ef.value;
      }
    }

    // Validate collections exist in KG
    let finalCollections = (plan.relevantCollections ?? []).filter((c) => this.kg.nodes[c]);
    if (finalCollections.length === 0) finalCollections = Object.keys(this.kg.nodes).slice(0, 3);

    // Entity-first routing: when a named entity is identified (e.g. "Siddartha Kesiraju" → users),
    // that collection MUST be the BFS anchor (position 0) and the pipeline primary collection.
    // Without this, the pipeline starts from the target collection (messages) and can never
    // apply the name filter — returning 0 results for valid multi-hop queries.
    //
    // Disambiguation: if multiple collections were assigned the same entity filter
    // (e.g. both "users" and "participant_user" have a name field), pick the one with
    // the highest role priority. This prevents the arbitrary first-match behaviour.
    const entityCollection = this._pickEntityCollection(entityFiltersObj);
    if (entityCollection) {
      finalCollections = [entityCollection, ...finalCollections.filter((c) => c !== entityCollection)];
    } else if (finalCollections.length > 1) {
      // Cardinality-aware anchor: when there is no entity filter forcing an anchor,
      // start from the collection with the fewest documents. This minimises the size
      // of intermediate results in multi-hop $lookup chains and mirrors how a human
      // query optimiser would order joins (smaller tables drive the outer loop).
      finalCollections.sort((a, b) => {
        const countA = this.kg.nodes[a]?.docCount ?? Infinity;
        const countB = this.kg.nodes[b]?.docCount ?? Infinity;
        return countA - countB;
      });
      console.log(
        '[PlannerAgent] Cardinality anchor:',
        finalCollections.map((c) => `${c}(${this.kg.nodes[c]?.docCount ?? '?'})`).join(' < '),
      );
    }

    // BFS join paths rooted at finalCollections[0] (entity collection when present)
    const joinPaths        = this.traversal.findJoinPaths(finalCollections);
    const joinDescriptions = this.traversal.describeJoinPaths(joinPaths);
    const joinChain        = this._buildJoinChain(finalCollections, joinPaths);

    // Collect intermediate collections discovered through join path traversal.
    // e.g. "users → messages" resolves through "conversations" — even if the LLM
    // omitted conversations from relevantCollections, we must include it so the
    // AnalystAgent sees its field schema and can build correct $lookup stages.
    const allCollections = new Set(finalCollections);
    for (const { path } of joinPaths) {
      for (const edge of path) {
        if (this.kg.nodes[edge.from]) allCollections.add(edge.from);
        if (this.kg.nodes[edge.to])   allCollections.add(edge.to);
      }
    }

    return {
      originalQuestion:    question,
      steps:               plan.steps             ?? [],
      relevantCollections: [...allCollections],
      primaryCollection:   entityCollection
                            ?? (this.kg.nodes[plan.primaryCollection]
                                ? plan.primaryCollection
                                : finalCollections[0]),
      filters:             {},
      entityFilters:       entityFiltersObj,
      timeRange:           plan.timeRange          ?? 'all_time',
      metrics:             plan.metrics            ?? [],
      lookupIntent:        plan.lookupIntent       ?? false,
      antiJoin:            plan.antiJoin           ?? false,
      joinPaths,
      joinDescriptions,
      joinChain,
      explanation:         plan.explanation        ?? '',
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * _scoreAndFilterCollections(question, nodes, limit)
   *
   * Keyword-scores every collection and returns the top `limit` most relevant.
   * This keeps the prompt token budget fixed regardless of how many collections
   * exist in the database (10, 50, or 100+).
   *
   * Scoring:
   *   +5  exact collection name appears in the question
   *   +2  per keyword (>3 chars) that appears in name/role/signature/fields
   *   +1  collection has a known business role (not "other")
   */
  _scoreAndFilterCollections(question, nodes, limit, aliasMatches = []) {
    const q        = question.toLowerCase();
    const keywords = q.split(/\W+/).filter((w) => w.length > 3);

    // Build a per-collection alias boost from deterministic resolution results.
    // Best confidence per collection wins (L1=1.0 → +10, L2=0.9 → +9, L3=0.7 → +7).
    // This is larger than any keyword-match score (+5 max) so alias wins decisively.
    const aliasBoost = new Map();
    for (const m of aliasMatches) {
      const prev = aliasBoost.get(m.collection) ?? 0;
      if (m.confidence > prev) aliasBoost.set(m.collection, m.confidence);
    }

    const scored = nodes.map((n) => {
      // n is a compact summary node (from toCompactSummary) — it has NO .fields key.
      // Must reach into the full KG node to get all field names for keyword matching.
      const kgFields = this.kg.nodes[n.name]?.fields ?? {};
      const searchText = [
        n.name,
        n.role ?? '',
        n.signature ?? '',
        n.anchorEntity ?? '',
        (n.keyFields ?? []).join(' '),
        Object.keys(kgFields).join(' '),  // all field names — critical for metric queries
      ].join(' ').toLowerCase();

      // Business-role boost — ensures primary entity collections (users, orgs, etc.)
      // always appear in the LLM prompt even when query keywords don't match their
      // field names (e.g. "show me message received by Siddartha" has no "user" keyword
      // but users MUST be present so the entity filter can be built).
      const ROLE_BOOSTS = { users: 6, organizations: 5, subscriptions: 4, payments: 4, events: 3, products: 2 };

      let score = 0;
      if (q.includes(n.name.toLowerCase())) score += 5;         // exact name match
      for (const kw of keywords) {
        if (searchText.includes(kw)) score += 2;                // keyword match
      }
      score += ROLE_BOOSTS[n.role] ?? (n.role && n.role !== 'other' ? 2 : 0); // role priority

      // Alias boost: deterministic field→collection match overrides keyword guessing.
      // e.g. "IG followers" resolves to users.igFollowersCount → users gets +10.
      const conf = aliasBoost.get(n.name);
      if (conf !== undefined) score += Math.round(conf * 10);   // +10/+9/+7 for L1/L2/L3

      return { node: n, score };
    });

    // Always include collections with score > 0; fill remaining slots by score
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.node);
  }

  _extractNameFields() {
    const namePatterns = ['name', 'fullname', 'displayname', 'username', 'title', 'firstName', 'lastName'];
    const result = {};

    for (const [collName, node] of Object.entries(this.kg.nodes)) {
      if (!node.fields) continue;
      const found = Object.keys(node.fields).find((fn) =>
        namePatterns.some((p) => fn.toLowerCase().includes(p.toLowerCase())),
      );
      if (found) result[collName] = found;
    }

    return result;
  }

  /**
   * _pickEntityCollection(entityFiltersObj)
   *
   * When multiple collections were assigned the same entity filter
   * (e.g. both "users" and "participant_user" have a name field for "Siddartha"),
   * picks the one with the highest business-role priority.
   *
   * Priority order: users > organizations > events > subscriptions > payments > products > other
   * Ties broken by document count (more docs = more likely to be the canonical collection).
   */
  _pickEntityCollection(entityFiltersObj) {
    const ROLE_PRIORITY = {
      users: 10, organizations: 8, events: 5,
      subscriptions: 3, payments: 3, products: 2, other: 1,
    };

    const candidates = Object.keys(entityFiltersObj).filter((c) => this.kg.nodes[c]);
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    const scored = candidates.map((c) => {
      const node      = this.kg.nodes[c];
      const roleScore = ROLE_PRIORITY[node.role] ?? 1;
      const countScore = Math.log10(Math.max(node.docCount ?? 1, 1));
      return { collection: c, score: roleScore * 2 + countScore };
    });

    scored.sort((a, b) => b.score - a.score);
    console.log(
      '[PlannerAgent] Entity ambiguity resolved:',
      scored.map((s) => `${s.collection}(score=${s.score.toFixed(1)})`).join(' > '),
    );
    return scored[0].collection;
  }

  _buildJoinChain(_collections, joinPaths) {
    const chain   = [];
    const seen    = new Set();

    // Track which alias a collection lives under after being joined via $lookup+$unwind.
    // The primary (anchor) collection lives at the document root — no alias prefix.
    //
    // Example for users → conversations → messages:
    //   Step 1: join conversations as _j_conversations  → aliasOf['conversations'] = '_j_conversations'
    //   Step 2: join messages using localField '_j_conversations._id' (NOT '_id' which is the user's _id)
    //           → aliasOf['messages'] = '_j_messages'
    const aliasOf = {};

    for (const { path } of joinPaths) {
      for (const edge of path) {
        const key = `${edge.from}>${edge.to}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const isReversed = edge.reversed;
        // sourceColl: already present in the current document (at root or under an alias)
        // targetColl: being joined — will live under `as` alias after $unwind
        const sourceColl     = isReversed ? edge.to   : edge.from;
        const targetColl     = isReversed ? edge.from : edge.to;
        const rawLocalField  = isReversed ? edge.toField   : edge.fromField;
        const foreignField   = isReversed ? edge.fromField : edge.toField;

        // When sourceColl was itself joined (lives under an alias), its fields must be
        // referenced as '<alias>.<field>' — not the bare field name from the root doc.
        const sourceAlias = aliasOf[sourceColl];
        const localField  = sourceAlias ? `${sourceAlias}.${rawLocalField}` : rawLocalField;

        const as = `_j_${targetColl}`;
        aliasOf[targetColl] = as;  // record alias so subsequent hops can reference it

        chain.push({
          from:         targetColl,   // the collection being $lookup'd
          to:           sourceColl,   // the collection we're joining from (context only)
          localField,
          foreignField,
          as,
        });
      }
    }

    return chain;
  }

  _heuristicPlan(question, summary, properNouns, nameFields) {
    const q   = question.toLowerCase();
    const ctx = summary.businessCtx ?? {};
    const collections = [];

    if (/user|signup|register|customer|person|name/.test(q) && ctx.users)   collections.push(ctx.users);
    if (/message|chat|inbox|dm|conversation|received|sent/.test(q)) {
      const msgColl  = Object.values(this.kg.nodes).find((n) => n.name?.toLowerCase().includes('message'))?.name;
      const convColl = Object.values(this.kg.nodes).find((n) => n.name?.toLowerCase().includes('conversation'))?.name;
      if (convColl) collections.push(convColl);
      if (msgColl)  collections.push(msgColl);
    }
    if (/subscri|plan|tier|mrr|revenue/.test(q) && ctx.subscriptions) collections.push(ctx.subscriptions);
    if (/payment|invoice|billing/.test(q) && ctx.payments)            collections.push(ctx.payments);

    const entityFilters = [];
    if (properNouns.length > 0 && collections.length > 0) {
      const nameField = nameFields[collections[0]];
      if (nameField) {
        entityFilters.push({ collection: collections[0], field: nameField, value: properNouns[0] });
      }
    }

    return {
      steps:               ['Find entity', 'Traverse relationships', 'Calculate metric'],
      relevantCollections: collections.length > 0 ? collections : Object.keys(this.kg.nodes).slice(0, 3),
      primaryCollection:   collections[0] ?? Object.keys(this.kg.nodes)[0],
      timeRange:           'all_time',
      metrics:             [],
      entityFilters,
      explanation:         'Heuristic plan (Gemini unavailable)',
    };
  }
}

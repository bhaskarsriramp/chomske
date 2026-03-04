/**
 * AnalystAgent — converts a QueryPlan into a MongoDB aggregation pipeline.
 *
 * ARCHITECTURE: Three narrow, focused calls instead of one large call.
 *
 *   Call 1 — _buildMatchStages()  Flash, 600 tokens max
 *     Generates $match conditions for entity search, status, and date filters
 *     on the primary collection only. Output: ~100-200 tokens.
 *
 *   Call 2 — _buildJoinStages()   ZERO LLM (deterministic)
 *     Converts plan.joinChain directly to $lookup/$unwind stages.
 *     No token budget, no truncation risk.
 *
 *   Call 3 — _buildAggStages()    Flash, 600 tokens max
 *     Generates $group/$count/$sort/$limit for the question's metric.
 *     Output: ~50-150 tokens.
 *
 * Maximum total: 1200 tokens across 3 calls. Scales to 100+ collections.
 * No single call ever sees the full schema — each sees only what it needs.
 */

import { callGemini, SchemaType } from '../llm/gemini.js';

// ── Deterministic date range computation ──────────────────────────────────────
//
// Returns a MongoDB date condition object (e.g. { $gte: Date } or { $gte: Date, $lt: Date })
// for any supported timeRange value. All math is done here — no LLM involvement.
// Returns null for 'all_time' or unrecognised values (= no date filter).

function computeDateRange(timeRange) {
  const now = new Date();
  switch (timeRange) {
    case 'today': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { $gte: start };
    }
    case 'yesterday': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { $gte: start, $lt: end };
    }
    case 'this_week': {
      // Week starts on Sunday (getDay() === 0)
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
      return { $gte: start };
    }
    case 'last_week': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() - 7);
      const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
      return { $gte: start, $lt: end };
    }
    case 'last_7_days':  return { $gte: new Date(now - 7   * 86400000) };
    case 'last_14_days': return { $gte: new Date(now - 14  * 86400000) };
    case 'last_30_days': return { $gte: new Date(now - 30  * 86400000) };
    case 'last_60_days': return { $gte: new Date(now - 60  * 86400000) };
    case 'last_90_days': return { $gte: new Date(now - 90  * 86400000) };
    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { $gte: start };
    }
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end   = new Date(now.getFullYear(), now.getMonth(), 1);
      return { $gte: start, $lt: end };
    }
    case 'this_year': {
      const start = new Date(now.getFullYear(), 0, 1);
      return { $gte: start };
    }
    case 'last_year': {
      const start = new Date(now.getFullYear() - 1, 0, 1);
      const end   = new Date(now.getFullYear(), 0, 1);
      return { $gte: start, $lt: end };
    }
    default: return null; // 'all_time' or unknown — no filter
  }
}

// ── Shared primitive schemas ───────────────────────────────────────────────────

const CONDITION_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    field:     { type: SchemaType.STRING },
    op:        { type: SchemaType.STRING,
                 enum: ['eq', 'ne', 'in', 'nin', 'regex', 'gt', 'gte', 'lt', 'lte', 'exists', 'null', 'gt0'] },
    value:     { type: SchemaType.STRING },
    values:    { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    flags:     { type: SchemaType.STRING },
    dayOffset: { type: SchemaType.INTEGER },
  },
  required: ['field', 'op'],
};

const ACCUMULATOR_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    outputField: { type: SchemaType.STRING },
    op:          { type: SchemaType.STRING, enum: ['count', 'sum', 'avg', 'min', 'max', 'first', 'last'] },
    inputField:  { type: SchemaType.STRING },
  },
  required: ['outputField', 'op'],
};

// Call 1 schema — only match conditions, tiny output
const MATCH_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    conditions: { type: SchemaType.ARRAY, items: CONDITION_SCHEMA },
    logic:      { type: SchemaType.STRING, enum: ['and', 'or'] },
  },
  required: ['conditions'],
};

// Call 3 schema — only aggregation config, tiny output
// maxLength on string fields prevents the model from dumping garbage into them
// when it hits the token limit mid-generation.
const AGG_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    countOnly:    { type: SchemaType.BOOLEAN },
    groupBy:      { type: SchemaType.STRING, maxLength: 80 },
    accumulators: { type: SchemaType.ARRAY, items: ACCUMULATOR_SCHEMA },
    sortField:    { type: SchemaType.STRING, maxLength: 80 },
    sortAsc:      { type: SchemaType.BOOLEAN },
    limitN:       { type: SchemaType.INTEGER },
  },
  required: ['countOnly'],
};

// ── Condition DSL → MongoDB expression (shared helper) ────────────────────────

// Coerce a condition value to the right JS type before building MongoDB queries.
// The schema forces all values to strings; booleans and numbers must be cast back.
function coerceValue(v) {
  if (v === 'true')  return true;
  if (v === 'false') return false;
  const n = Number(v);
  if (!Number.isNaN(n) && v !== '') return n;
  return v;
}

function condToMongo(c) {
  const cond = {};
  switch (c.op) {
    case 'eq':     cond[c.field] = coerceValue(c.value); break;
    case 'ne':     cond[c.field] = { $ne: coerceValue(c.value) }; break;
    case 'in':     cond[c.field] = { $in: c.values ?? [] }; break;
    case 'nin':    cond[c.field] = { $nin: c.values ?? [] }; break;
    case 'regex':  cond[c.field] = { $regex: c.value, $options: c.flags ?? 'i' }; break;
    case 'gt':     cond[c.field] = { $gt: c.value }; break;
    case 'gte':    cond[c.field] = c.dayOffset != null
                     ? { $gte: new Date(Date.now() + c.dayOffset * 86400000) }
                     : c.value && /^\d{4}-\d{2}-\d{2}/.test(c.value)
                       ? { $gte: new Date(c.value) }
                       : { $gte: c.value }; break;
    case 'lt':     cond[c.field] = c.value && /^\d{4}-\d{2}-\d{2}/.test(c.value)
                     ? { $lt: new Date(c.value) }
                     : { $lt: c.value }; break;
    case 'lte':    cond[c.field] = c.dayOffset != null
                     ? { $lte: new Date(Date.now() + c.dayOffset * 86400000) }
                     : c.value && /^\d{4}-\d{2}-\d{2}/.test(c.value)
                       ? { $lte: new Date(c.value) }
                       : { $lte: c.value }; break;
    case 'exists': cond[c.field] = { $exists: true, $ne: null }; break;
    case 'null':   cond[c.field] = null; break;
    case 'gt0':    cond[c.field] = { $gt: 0 }; break;
  }
  return cond;
}

// ── Agent ─────────────────────────────────────────────────────────────────────

export class AnalystAgent {
  constructor(kg) {
    this.kg = kg;
  }

  /**
   * buildPipeline(plan) → { pipeline, collection, explanation }
   *
   * Orchestrates 3 focused sub-calls:
   *   match stages (Flash) → join stages (deterministic) → agg stages (Flash)
   */
  async buildPipeline(plan) {
    try {
      // Anti-join path: "users with zero X in period" — LEFT JOIN + empty-array check.
      // Must bypass the normal $unwind-based pipeline which would DROP zero-match docs.
      if (plan.antiJoin && (plan.joinChain ?? []).length > 0) {
        return await this._buildAntiJoinResult(plan);
      }

      const matchStages      = await this._buildMatchStages(plan);
      const primaryDateMatch = this._buildPrimaryDateMatch(plan);
      const joinStages       = this._buildJoinStages(plan.joinChain ?? []);
      const piiProject       = this._buildPiiProjection(plan);
      const aggStages        = await this._buildAggStages(plan);

      // Pipeline order:
      //   1. entity/status $match on primary collection
      //   2. date $match on primary collection (no-join only — deterministic)
      //   3. $lookup/$unwind join chain
      //   4. PII $project exclusion
      //   5. date $match on final joined collection + agg ($group/$count/$sort/$limit)
      const pipeline = [
        ...matchStages,
        ...(primaryDateMatch ? [primaryDateMatch] : []),
        ...joinStages,
        ...(piiProject ? [{ $project: piiProject }] : []),
        ...aggStages,
      ];

      if (pipeline.length === 0) {
        return {
          collection:  plan.primaryCollection,
          pipeline:    this._buildFallbackPipeline(plan),
          explanation: 'Fallback — empty pipeline from sub-calls',
        };
      }

      return { collection: plan.primaryCollection, pipeline, explanation: '' };
    } catch (err) {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('[AnalystAgent] buildPipeline FAILED — returning fallback pipeline');
      console.error('  Error     :', err.message);
      console.error('  Stack     :', err.stack ?? '(no stack)');
      console.error('  Collection:', plan.primaryCollection);
      console.error('  Question  :', plan.originalQuestion?.slice(0, 120));
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return {
        collection:  plan.primaryCollection,
        pipeline:    this._buildFallbackPipeline(plan),
        explanation: 'Fallback retrieval — analyst error',
      };
    }
  }

  // ── Call 1: Match conditions (entity / status / date) ─────────────────────
  //
  // Only looks at the PRIMARY collection's fields. Small prompt, small output.

  async _buildMatchStages(plan) {
    const node = this.kg.nodes[plan.primaryCollection];
    if (!node) return [];

    const fields = Object.entries(node.fields ?? {})
      .filter(([, f]) => !f.isPii)
      .slice(0, 20)
      .map(([fn, f]) => {
        let d = fn + ':' + f.type;
        if (f.isDate)   d += '[date]';
        if (f.isStatus) d += '[status]';
        if (f.values)   d += '{' + f.values.slice(0, 4).join('|') + '}';
        return d;
      })
      .join(' | ');

    // Entity filters on the primary collection only
    const primaryFilters = plan.entityFilters?.[plan.primaryCollection] ?? {};
    const entityHint = Object.entries(primaryFilters)
      .map(([f, v]) => Array.isArray(v)
        ? `${f} matches ANY OF: ${v.map((x) => `"${x}"`).join(', ')}`
        : `${f} matches "${v}"`)
      .join(', ') || 'none';

    // Planner steps tell the model WHAT to filter — include up to 3 steps
    const stepsHint = (plan.steps ?? []).slice(0, 3)
      .map((s) => s.slice(0, 100)).join('; ') || '';

    // Date filtering is handled 100% deterministically (computeDateRange) — never by Gemini.
    // _buildPrimaryDateMatch handles no-join queries; _buildJoinedDateMatch handles joined ones.

    const prompt = `MongoDB $match generator. Generate ONLY filter conditions.

Question: "${plan.originalQuestion}"
Steps: ${stepsHint || '(none)'}
Collection: "${plan.primaryCollection}"
Fields: ${fields}
Entity to find: ${entityHint}

Rules:
- Entity search (name/email) → op:regex, flags:"i"
- Multiple entity values (compare X and Y) → one op:regex per name, logic:"or"
- Boolean flag filter (e.g. instagramConnected=true, isActive=true) → op:eq, value:"true" or value:"false"
- Active/paid status → op:nin, values:["cancelled","canceled","deleted","inactive"]
- Read the Question and Steps to determine which field filters to apply
- If no filters apply, return empty conditions array
- Do NOT include join, aggregation, or date filter stages (date is handled externally)

EXAMPLES (question → conditions):
"How many followers does Siddartha have?" → [{field:"name",op:"regex",value:"Siddartha",flags:"i"}]
"Active users only" → [{field:"status",op:"nin",values:["cancelled","inactive","deleted"]}]
"How many messages did Siddartha receive in last 30 days?" → [{field:"name",op:"regex",value:"Siddartha",flags:"i"}]
"Compare Siddartha and Rahul" → [{field:"name",op:"regex",value:"Siddartha",flags:"i"},{field:"name",op:"regex",value:"Rahul",flags:"i"}], logic:"or"
"All creator plan users" → [{field:"subscription_plan",op:"eq",value:"creator"}]
"Users with Instagram connected" → [{field:"instagramConnected",op:"eq",value:"true"}]`;

    try {
      const result = await callGemini(prompt, {
        useFlash: true, maxTokens: 600, schema: MATCH_SCHEMA, tag: 'analyst-match',
      });

      const condList = (result?.conditions ?? [])
        .map(condToMongo)
        .filter((c) => Object.keys(c).length > 0);

      if (condList.length === 0) return [];

      return result?.logic === 'or' && condList.length > 1
        ? [{ $match: { $or: condList } }]
        : [{ $match: Object.assign({}, ...condList) }];
    } catch (err) {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('[AnalystAgent] _buildMatchStages FAILED — using entity-filter fallback');
      console.error('  Error     :', err.message);
      console.error('  Stack     :', err.stack ?? '(no stack)');
      console.error('  Collection:', plan.primaryCollection);
      console.error('  Entity    :', JSON.stringify(plan.entityFilters ?? {}));
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      // Deterministic fallback: apply entity filters directly
      return this._fallbackMatchFromEntityFilters(plan);
    }
  }

  // ── Call 2: Join stages — DETERMINISTIC, zero LLM ────────────────────────
  //
  // plan.joinChain already has alias-aware localField from PlannerAgent._buildJoinChain.
  // No LLM needed — just convert to MongoDB syntax.

  _buildJoinStages(joinChain) {
    const stages = [];
    for (const hop of joinChain) {
      stages.push({
        $lookup: {
          from:         hop.from,
          localField:   hop.localField,
          foreignField: hop.foreignField,
          as:           hop.as,
        },
      });
      stages.push({
        $unwind: {
          path:                       `$${hop.as}`,
          preserveNullAndEmptyArrays: false,
        },
      });
    }
    return stages;
  }

  // ── Call 3: Aggregation (group / count / sort / limit) ───────────────────
  //
  // After all joins, decide how to aggregate the result.
  // Receives only the FINAL collection's relevant fields — not the full schema.
  //
  // SHORT-CIRCUIT: entity lookups with no metrics (e.g. "who is X?", "show me user Y")
  // don't need any aggregation — just return the matching documents with a $limit.
  // This avoids the model misinterpreting an empty metrics list as "count" and
  // generating $count instead of a document fetch.

  async _buildAggStages(plan) {
    const isEntityLookup =
      Object.keys(plan.entityFilters ?? {}).length > 0 &&
      (plan.joinChain ?? []).length === 0 &&
      (plan.metrics ?? []).length === 0;

    // Multi-entity comparison (e.g. "compare X and Y") needs grouping — don't short-circuit
    const isMultiEntity = Object.values(plan.entityFilters ?? {}).some((filters) =>
      Object.values(filters).some((v) => Array.isArray(v) && v.length > 1),
    );

    if (isEntityLookup && !isMultiEntity) {
      return [{ $limit: 20 }];
    }

    // Identify the final collection (last joined, or primary if no joins)
    const joinChain = plan.joinChain ?? [];

    // lookupIntent fast path: question asks to VIEW document content ("show me", "fetch", "get").
    // When there's a join chain, skip Gemini entirely — deterministically sort by the final
    // collection's date field and return a small batch. This avoids Gemini generating $count
    // or $group when the user just wants to read the joined documents.
    if (plan.lookupIntent && joinChain.length > 0) {
      const finalAlias_ = joinChain[joinChain.length - 1].as;
      const finalColl_  = joinChain[joinChain.length - 1].from;
      const node_       = this.kg.nodes[finalColl_];
      const dateField_  = this._bestDateField(node_);
      const sortField_  = dateField_
        ? (finalAlias_ ? `${finalAlias_}.${dateField_}` : dateField_)
        : (finalAlias_ ? `${finalAlias_}._id` : '_id');

      const stages_ = [];
      const dateMatchStage = this._buildJoinedDateMatch(plan, finalColl_, finalAlias_);
      if (dateMatchStage) stages_.push(dateMatchStage);
      stages_.push({ $sort: { [sortField_]: -1 } });
      stages_.push({ $limit: 10 });
      console.log(`[AnalystAgent] lookupIntent fast path → sort ${sortField_} desc, limit 10`);
      return stages_;
    }
    const finalAlias = joinChain.length > 0 ? joinChain[joinChain.length - 1].as : null;
    const finalColl  = joinChain.length > 0 ? joinChain[joinChain.length - 1].from : plan.primaryCollection;

    const node = this.kg.nodes[finalColl];
    const fieldPrefix = finalAlias ? `${finalAlias}.` : '';

    const fields = Object.entries(node?.fields ?? {})
      .filter(([, f]) => !f.isPii && (f.isAmount || f.isStatus || f.isDate || f.type === 'number'))
      .slice(0, 12)
      .map(([fn, f]) => {
        let d = fieldPrefix + fn;
        if (f.isAmount) d += '[amount]';
        if (f.isStatus) d += '[status]';
        if (f.type === 'number' && !f.isAmount) d += '[number]';
        return d;
      })
      .join(', ') || `${fieldPrefix}_id`;

    // Planner steps tell the model HOW to aggregate — honour them.
    // Keep short (2 steps max) to avoid inflating the output.
    const stepsHint = (plan.steps ?? []).slice(0, 2)
      .map((s) => s.slice(0, 120)).join('; ') || '';

    const prompt = `MongoDB aggregation for: "${plan.originalQuestion}"
Steps: ${stepsHint || '(none)'}
Fields: ${fields}

Pick ONE type:
A) countOnly:true — simple total count only ("how many X total?")
B) groupBy + accumulators + sortField + sortAsc + limitN — ranking where you must COUNT from a joined collection ("which user created most automations?")
C) accumulators only, no groupBy — grand total/avg across all docs
D) sortField + sortAsc + limitN only (no groupBy, no accumulators) — fetch or rank by a field on the document or a joined document ("latest message", "highest follower count", "most recent payment")

Rule: "show me", "fetch", "get", "display", "latest [thing]" → type D, sortField=the date/rank field (use joined alias prefix if needed, e.g. "_j_messages.createdAt"), sortAsc=false, limitN=1 for "one/latest/most recent" else limitN=10
Rule: Steps say "sort by [field]" and that field is in the Fields list → type D, set sortField=[field], sortAsc=false, limitN=10
Rule: Steps say "group by, count" and the metric must be computed → type B, groupBy=the id field, op=count, sortAsc=false, limitN=10
Rule: "how many total?" → type A, countOnly=true

EXAMPLES (question → output):
"How many users total?" → {countOnly:true}
"Which user has most followers?" (igFollowersCount in Fields) → {sortField:"igFollowersCount",sortAsc:false,limitN:10}
"Show me one latest message received by Siddartha" (_j_messages.createdAt[date] in Fields) → {sortField:"_j_messages.createdAt",sortAsc:false,limitN:1}
"Get the most recent payment by Rahul" (_j_payments.createdAt[date] in Fields) → {sortField:"_j_payments.createdAt",sortAsc:false,limitN:1}
"Show me last 5 conversations for this user" (_j_conversations.createdAt[date] in Fields) → {sortField:"_j_conversations.createdAt",sortAsc:false,limitN:5}
"Which creator sent most messages?" (count must be computed from joined messages) → {groupBy:"_id",accumulators:[{outputField:"count",op:"count"}],sortField:"count",sortAsc:false,limitN:10}
"Total revenue this month?" → {accumulators:[{outputField:"total",op:"sum",inputField:"amount"}]}
"Average leads per creator?" → {accumulators:[{outputField:"avg_leads",op:"avg",inputField:"leads_found"}]}
"Compare Siddartha and Rahul follower counts" → {groupBy:"name",accumulators:[{outputField:"followers",op:"first",inputField:"igFollowersCount"}],sortField:"followers",sortAsc:false,limitN:10}`;

    try {
      const result = await callGemini(prompt, {
        useFlash: true, maxTokens: 600, schema: AGG_SCHEMA, tag: 'analyst-agg',
      });

      const stages = [];

      // Deterministic date filter on the final joined collection.
      // _buildMatchStages handles date filters for the primary collection only.
      // When there are joins and a time range is set, insert a $match on the
      // final collection's date field (e.g. messages.createdAt) BEFORE the count/group.
      // This is zero-LLM: we read the field directly from the KG.
      const joinedDateMatch = this._buildJoinedDateMatch(plan, finalColl, finalAlias);
      if (joinedDateMatch) {
        stages.push(joinedDateMatch);
        console.log(`[AnalystAgent] Date filter on ${finalColl}: ${JSON.stringify(joinedDateMatch.$match)}`);
      }

      if (result?.countOnly) {
        stages.push({ $count: 'total' });
      } else {
        // Validate groupBy: must be a short, identifier-like field name.
        // Reject anything > 80 chars or containing characters that aren't
        // valid in MongoDB field paths — this guards against the model
        // dumping prompt text into the field when it hits max_tokens.
        const rawGroupBy = result?.groupBy ?? '';
        const safeGroupBy = rawGroupBy.length > 0 &&
          rawGroupBy.length <= 80 &&
          rawGroupBy !== 'null' &&
          /^[\w.]+$/.test(rawGroupBy)
            ? rawGroupBy : null;
        const groupId = safeGroupBy ? `$${safeGroupBy}` : null;
        const accums = {};
        for (const acc of (result?.accumulators ?? [])) {
          accums[acc.outputField] = acc.op === 'count'
            ? { $sum: 1 }
            : { [`$${acc.op}`]: acc.inputField ? `$${acc.inputField}` : 1 };
        }
        if (Object.keys(accums).length > 0) {
          stages.push({ $group: { _id: groupId, ...accums } });
        }
        if (result?.sortField) {
          stages.push({ $sort: { [result.sortField]: result.sortAsc ? 1 : -1 } });
        }
        stages.push({ $limit: Math.min(result?.limitN ?? 100, 1000) });
      }

      return stages;
    } catch (err) {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('[AnalystAgent] _buildAggStages FAILED — using $limit:100 fallback');
      console.error('  Error    :', err.message);
      console.error('  Stack    :', err.stack ?? '(no stack)');
      console.error('  FinalColl:', finalColl);
      console.error('  Metrics  :', (plan.metrics ?? []).join(', ') || 'none');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return [{ $limit: 100 }];
    }
  }

  // ── Shared date-field picker ───────────────────────────────────────────────
  //
  // Returns the best date field name on a KG node.
  // Priority: createdAt > sentAt > receivedAt > timestamp > date > time > updatedAt
  // Falls back to any remaining isDate field, or null if none found.

  _bestDateField(node) {
    if (!node?.fields) return null;
    const PREFERRED = ['createdat', 'sentat', 'receivedat', 'timestamp', 'date', 'time', 'updatedat'];
    const dateEntries = Object.entries(node.fields)
      .filter(([, f]) => f.isDate)
      .sort(([a], [b]) => {
        const ai = PREFERRED.findIndex((p) => a.toLowerCase().includes(p));
        const bi = PREFERRED.findIndex((p) => b.toLowerCase().includes(p));
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
    return dateEntries.length > 0 ? dateEntries[0][0] : null;
  }

  // ── Primary collection date filter (no-join queries, deterministic) ────────
  //
  // For queries that don't join (e.g. "how many users signed up today?"), the
  // date filter goes directly on the primary collection's best date field.

  _buildPrimaryDateMatch(plan) {
    if ((plan.joinChain ?? []).length > 0) return null; // joins handled in _buildJoinedDateMatch
    if (!plan.timeRange || plan.timeRange === 'all_time') return null;

    const node = this.kg.nodes[plan.primaryCollection];
    const dateField = this._bestDateField(node);
    if (!dateField) return null;

    const cond = computeDateRange(plan.timeRange);
    if (!cond) return null;

    return { $match: { [dateField]: cond } };
  }

  // ── Joined collection date filter (deterministic, zero LLM) ──────────────
  //
  // When a query traverses joins (e.g. users → conversations → messages) and
  // has a time range, the date filter must be applied to the FINAL joined
  // collection — not the primary anchor (users). This method finds the best
  // date field on that collection and builds a $match stage for it.

  _buildJoinedDateMatch(plan, finalColl, finalAlias) {
    if ((plan.joinChain ?? []).length === 0) return null;
    if (!plan.timeRange || plan.timeRange === 'all_time') return null;

    const node = this.kg.nodes[finalColl];
    const dateField = this._bestDateField(node);
    if (!dateField) return null;

    const cond = computeDateRange(plan.timeRange);
    if (!cond) return null;

    const fieldPath = finalAlias ? `${finalAlias}.${dateField}` : dateField;
    return { $match: { [fieldPath]: cond } };
  }

  // ── PII projection ─────────────────────────────────────────────────────────
  //
  // Builds a MongoDB $project exclusion object that strips PII-flagged fields
  // from the primary collection and from all joined collections (via their alias).
  // Inserted AFTER all $lookup/$unwind stages so both roots and joined docs are covered.
  // When $group follows, this is effectively a no-op for grouped fields — but it
  // protects entity-lookup results (isEntityLookup → $limit 20) from leaking PII.

  _buildPiiProjection(plan) {
    const exclusions = {};

    // Primary collection PII fields (live at document root)
    const primaryNode = this.kg.nodes[plan.primaryCollection];
    for (const [field, f] of Object.entries(primaryNode?.fields ?? {})) {
      if (f.isPii) exclusions[field] = 0;
    }

    // Joined collections' PII fields (live under their _j_<coll> alias after $unwind)
    for (const hop of plan.joinChain ?? []) {
      const node = this.kg.nodes[hop.from];
      for (const [field, f] of Object.entries(node?.fields ?? {})) {
        if (f.isPii) exclusions[`${hop.as}.${field}`] = 0;
      }
    }

    return Object.keys(exclusions).length > 0 ? exclusions : null;
  }

  // ── Fallbacks ──────────────────────────────────────────────────────────────

  _fallbackMatchFromEntityFilters(plan) {
    const primaryFilters = plan.entityFilters?.[plan.primaryCollection] ?? {};
    const matchObj = {};
    for (const [field, value] of Object.entries(primaryFilters)) {
      if (Array.isArray(value)) {
        // Multi-entity comparison: match any of the named entities
        matchObj[field] = { $in: value.map((v) => new RegExp(String(v), 'i')) };
      } else {
        matchObj[field] = { $regex: String(value), $options: 'i' };
      }
    }
    return Object.keys(matchObj).length > 0 ? [{ $match: matchObj }] : [];
  }

  _buildFallbackPipeline(plan) {
    const stages = this._fallbackMatchFromEntityFilters(plan);
    stages.push({ $limit: 50 });
    return stages;
  }

  // ── Anti-join pipeline ("users with zero X") ───────────────────────────────
  //
  // Standard $lookup + $unwind(preserveNullAndEmptyArrays:false) DROPS documents
  // with no matching records — exactly the opposite of what "zero X" queries need.
  //
  // Instead, use a pipeline-form $lookup that:
  //   1. Filters inside the subquery (date range, FK match) using $expr
  //   2. Stops at $limit:1 once a match is found (early exit, efficient)
  //   3. Produces an empty array [] for docs with no matches
  // Then filter for documents where that array is empty → users with ZERO X.
  //
  // Supports 1-hop (users → messages) and 2-hop (users → conversations → messages).

  async _buildAntiJoinResult(plan) {
    const matchStages  = await this._buildMatchStages(plan);
    const antiPipeline = this._buildAntiJoinPipeline(plan);

    if (!antiPipeline) {
      console.error('[AnalystAgent] Anti-join: unsupported hop count — falling back');
      return {
        collection:  plan.primaryCollection,
        pipeline:    this._buildFallbackPipeline(plan),
        explanation: 'Anti-join fallback — unsupported chain length',
      };
    }

    const chain = (plan.joinChain ?? []).map((h) => h.from).join('→');
    console.log(`[AnalystAgent] Anti-join: ${plan.primaryCollection} → ${chain}`);

    return {
      collection:  plan.primaryCollection,
      pipeline:    [...matchStages, ...antiPipeline],
      explanation: 'Anti-join: entities with zero matching records',
    };
  }

  _buildAntiJoinPipeline(plan) {
    const joinChain = plan.joinChain ?? [];
    if (joinChain.length === 0) return null;

    const stages = [];

    const antiLookup = joinChain.length === 1
      ? this._singleHopAntiLookup(joinChain[0], plan)
      : joinChain.length === 2
        ? this._twoHopAntiLookup(joinChain[0], joinChain[1], plan)
        : null;

    if (!antiLookup) return null;
    stages.push(antiLookup);

    // Keep ONLY primary-collection docs where the subquery found ZERO matches
    stages.push({ $match: { _j_anti: { $size: 0 } } });

    // Project identifier fields (name, email) — omit internals and PII
    const primaryNode = this.kg.nodes[plan.primaryCollection];
    const identFields = this._identifierFields(primaryNode);
    if (identFields.length > 0) {
      const proj = { _id: 0 };
      for (const f of identFields) proj[f] = 1;
      stages.push({ $project: proj });
    }

    stages.push({ $limit: 100 });
    return stages;
  }

  /** 1-hop anti-join: e.g. users who have zero payments */
  _singleHopAntiLookup(hop, plan) {
    const targetNode = this.kg.nodes[hop.from];
    const dateField  = this._bestDateField(targetNode);
    const dateRange  = computeDateRange(plan.timeRange);

    // Merge FK match ($expr) with optional date filter in one $match
    // Note: MongoDB let-variable names must start with a lowercase letter (not _)
    const innerMatch = { $expr: { $eq: [`$${hop.foreignField}`, '$$localId'] } };
    if (dateField && dateRange) innerMatch[dateField] = dateRange;

    return {
      $lookup: {
        from:     hop.from,
        let:      { localId: `$${hop.localField}` },
        pipeline: [{ $match: innerMatch }, { $limit: 1 }],
        as:       '_j_anti',
      },
    };
  }

  /**
   * 2-hop anti-join: e.g. users who have zero messages (via conversations).
   * hop1: users → conversations (users._id = conversations.creatorId)
   * hop2: conversations → messages (conversations._id = messages.conversationId)
   *
   * We only want to keep users where NO conversation of theirs has ANY message
   * in the requested time period. Pipeline structure:
   *   $lookup conversations (for this user)
   *     → nested $lookup messages (for each conversation, date-filtered)
   *     → $match: keep only conversations with ≥1 recent message
   *     → $limit: 1   ← stop as soon as we find ONE active conversation
   *   $match: _j_anti.size === 0  ← user has zero active conversations
   */
  _twoHopAntiLookup(hop1, hop2, plan) {
    // In the nested context, the intermediate document is at root (not under alias).
    // hop2.localField may be "_j_conversations._id" — strip the alias prefix to "_id".
    const bareHop2Local = hop2.localField.includes('.')
      ? hop2.localField.split('.').pop()
      : hop2.localField;

    const finalNode = this.kg.nodes[hop2.from];
    const dateField = this._bestDateField(finalNode);
    const dateRange = computeDateRange(plan.timeRange);

    const finalMatch = { $expr: { $eq: [`$${hop2.foreignField}`, '$$convId'] } };
    if (dateField && dateRange) finalMatch[dateField] = dateRange;

    return {
      $lookup: {
        from:     hop1.from,
        let:      { localId: `$${hop1.localField}` },
        pipeline: [
          // Match conversations belonging to this user
          { $match: { $expr: { $eq: [`$${hop1.foreignField}`, '$$localId'] } } },
          // Nested lookup: does this conversation have any recent messages?
          {
            $lookup: {
              from:     hop2.from,
              let:      { convId: `$${bareHop2Local}` },
              pipeline: [{ $match: finalMatch }, { $limit: 1 }],
              as:       '_j_inner',
            },
          },
          // Keep only conversations that DO have recent messages (at least 1)
          { $match: { '_j_inner.0': { $exists: true } } },
          { $limit: 1 },  // stop as soon as one active conversation is found
        ],
        as: '_j_anti',
      },
    };
  }

  /** Picks non-PII name/email/username fields from a KG node for projection */
  _identifierFields(node) {
    if (!node?.fields) return [];
    const IDENT = ['name', 'email', 'username', 'displayname', 'fullname'];
    return Object.keys(node.fields)
      .filter((f) => IDENT.some((p) => f.toLowerCase().includes(p)) && !node.fields[f].isPii)
      .slice(0, 3);
  }

}


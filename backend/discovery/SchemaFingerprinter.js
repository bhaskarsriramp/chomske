/**
 * SchemaFingerprinter — Phase 1 & 2 of the multi-agent pipeline.
 *
 * Six-pass agentic discovery. Each pass is intentionally narrow so we
 * never blow up the LLM context window with raw schema dumps.
 *
 *  Pass 1 — DB sample extraction  (MongoDB only, no LLM)
 *  Pass 2 — Implicit FK detection  (regex, no LLM)
 *  Pass 3 — FK validation          (MongoDB ID overlap check, no LLM)
 *  Pass 4 — Semantic enrichment     (Gemini Flash, batches of 5 collections)
 *  Pass 5 — Cross-collection semantic equivalence (Gemini Flash, one call)
 *  Pass 6 — Website term alignment  (Gemini Flash, trimmed to 1500 chars)
 *
 * The result feeds directly into KnowledgeGraph.setNode / addEdge.
 */

import { MongoClient, ObjectId } from 'mongodb';
import { callGemini, SchemaType } from '../llm/gemini.js';

// ── Controlled-generation schemas for each Gemini pass ────────────────────────

// NOTE: Vertex AI responseSchema root MUST be type OBJECT — top-level ARRAY is
// silently rejected, causing the model to generate unconstrained output with
// unquoted keys. Both array schemas are wrapped in a root object.

const SEMANTIC_FK_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    resolutions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          collection:    { type: SchemaType.STRING },
          field:         { type: SchemaType.STRING },
          refCollection: { type: SchemaType.STRING },
          confidence:    { type: SchemaType.NUMBER },
        },
        required: ['collection', 'field', 'refCollection', 'confidence'],
      },
    },
  },
  required: ['resolutions'],
};

const ENRICHMENT_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    collections: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name:              { type: SchemaType.STRING },
          role:              { type: SchemaType.STRING,
                               enum: ['users', 'subscriptions', 'payments', 'events', 'organizations', 'products', 'other'] },
          // anchorEntity: 1-3 words max (e.g. "user", "subscription")
          anchorEntity:      { type: SchemaType.STRING },
          // semanticSignature: ≤8 words (e.g. "stores user account data")
          semanticSignature: { type: SchemaType.STRING },
          keyBusinessFields: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        },
        required: ['name', 'role', 'anchorEntity', 'semanticSignature'],
      },
    },
  },
  required: ['collections'],
};

const EQUIVALENCE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    equivalences: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          fields:  { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          meaning: { type: SchemaType.STRING },
          unit:    { type: SchemaType.STRING },
        },
        required: ['fields', 'meaning'],
      },
    },
    statusMappings: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          collection:      { type: SchemaType.STRING },
          field:           { type: SchemaType.STRING },
          activeValues:    { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          cancelledValues: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          trialValues:     { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        },
        required: ['collection', 'field', 'activeValues'],
      },
    },
  },
  required: ['equivalences', 'statusMappings'],
};

// Pass 4.5 — field-level alias dictionary
// Flat array: each item carries the collection name so one call covers a whole batch.
// Only covers non-trivial fields (number, boolean, amount, status) because those are
// the ones founders phrase differently from the raw DB field name.
const FIELD_ALIAS_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    fields: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          collection: { type: SchemaType.STRING },
          fieldName:  { type: SchemaType.STRING },
          aliases:    { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        },
        required: ['collection', 'fieldName', 'aliases'],
      },
    },
  },
  required: ['fields'],
};

const TERM_MAPPING_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    termMappings: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          term:       { type: SchemaType.STRING },
          collection: { type: SchemaType.STRING },
          confidence: { type: SchemaType.NUMBER },
        },
        required: ['term', 'collection', 'confidence'],
      },
    },
  },
  required: ['termMappings'],
};

// ── Field-name regex classifiers ─────────────────────────────────────────────

const FK_RE      = /^(.+?)(Id|_id|Ref|ref|Key|key|Uuid|uuid)$/;
const DATE_RE    = /^(created|updated|modified|deleted|signup|registered|joined|started|ended|expired|trial|renewal|period|canceled|cancelled|timestamp|date).*$|^.*(At|On|Date|Time|Stamp|_at|_on)$/i;
const STATUS_RE  = /^(status|state|phase|stage|type|kind|role|plan|tier|level|category)$/i;
const AMOUNT_RE  = /^(amount|price|cost|mrr|arr|value|total|revenue|fee|charge|rate|cents|usd|eur|billing).*$|^.*(Amount|Price|Cost|Revenue|Value|Total|Cents)$/i;
const EMAIL_RE   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PII_RE     = /email|phone|mobile|password|passwd|token|secret|hash|salt|address|firstname|lastname|fullname|ssn|creditcard/i;

// ── MongoDB helpers ───────────────────────────────────────────────────────────

function makeClient(uri) {
  return new MongoClient(uri, {
    readPreference:             'secondaryPreferred',
    serverSelectionTimeoutMS:   10000,
    connectTimeoutMS:           10000,
  });
}

function makeMinOid(date) {
  return new ObjectId(
    Math.floor(date.getTime() / 1000).toString(16).padStart(8, '0') + '0000000000000000',
  );
}

// ── Type detection (handles BSON types in deserialized docs) ──────────────────

function detectType(val) {
  if (val === null || val === undefined)       return 'null';
  if (val instanceof Date)                     return 'date';
  if (Array.isArray(val))                      return 'array';
  if (typeof val === 'object') {
    const c = val.constructor?.name ?? '';
    if (c === 'ObjectId' || c === 'ObjectID' || val._bsontype) return 'ObjectId';
    if (val.$oid)                              return 'ObjectId';
    if (val.$date)                             return 'date';
    return 'object';
  }
  return typeof val; // string | number | boolean
}

// ── Field extractor (recursive, depth-limited) ────────────────────────────────

function extractFields(obj, fields = {}, prefix = '', depth = 0) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || depth > 2) return fields;

  for (const [key, val] of Object.entries(obj)) {
    const fname = prefix ? `${prefix}.${key}` : key;
    const type  = detectType(val);

    if (!fields[fname]) {
      fields[fname] = {
        type,
        nullable:  false,
        isFk:      FK_RE.test(key),
        isDate:    DATE_RE.test(key),
        isStatus:  STATUS_RE.test(key),
        isAmount:  AMOUNT_RE.test(key),
        isEmail:   false,
        isPii:     PII_RE.test(key),
        samples:   [],
      };
    }

    const f = fields[fname];

    if (val === null || val === undefined) {
      f.nullable = true;
    } else {
      if (typeof val === 'string' && EMAIL_RE.test(val)) f.isEmail = true;

      // Collect sample values for enum detection (non-PII strings only)
      if (!f.isPii && typeof val === 'string' && val.length <= 60 && f.samples.length < 7) {
        if (!f.samples.includes(val)) f.samples.push(val);
      }

      // Recurse into nested objects
      if (type === 'object') extractFields(val, fields, fname, depth + 1);
    }
  }

  return fields;
}

// Called ONCE after all sample docs have been merged into `fields`.
// Promotes low-cardinality string fields to enum values and removes the
// temporary `samples` array (which was only needed during extraction).
//
// BUG NOTE: This must NOT run inside extractFields() itself because extractFields()
// is called once per document. Running it mid-loop deletes `field.samples` before
// subsequent documents can push to it, causing "Cannot read properties of
// undefined (reading 'length')" on the second document.
function finalizeFields(fields) {
  for (const [, field] of Object.entries(fields)) {
    const samples = field.samples ?? [];
    if (samples.length >= 2 && samples.length <= 6) {
      field.values      = samples;
      field.cardinality = 'low';
    } else if (samples.length > 6) {
      field.cardinality = 'high';
    }
    delete field.samples;
  }
  return fields;
}

// ─────────────────────────────────────────────────────────────────────────────

export class SchemaFingerprinter {
  constructor(mongoUri, websiteContent = '') {
    this.mongoUri       = mongoUri;
    this.websiteContent = websiteContent;
  }

  /**
   * fingerprint() → { profiles, edges, semanticEq, websiteTerms, metrics }
   *
   * Main entry point. Runs all 6 passes and returns everything the
   * KnowledgeGraph constructor needs.
   */
  async fingerprint() {
    const client = makeClient(this.mongoUri);
    await client.connect();
    const db = client.db();

    try {
      // ── Pass 1 — structural profile extraction (no LLM) ─────────────────────
      console.log('[Fingerprinter] ── Pass 1: extracting structural profiles...');
      const profiles = await this._extractProfiles(db);
      const collectionNames = Object.keys(profiles);
      console.log(`[Fingerprinter] ✓ Pass 1 done: ${collectionNames.length} collections → [${collectionNames.join(', ')}]`);

      // ── Pass 2 — FK detection by naming convention (no LLM) ─────────────────
      console.log('[Fingerprinter] ── Pass 2: detecting FK edges by naming convention...');
      const { resolved: rawEdges, unresolved: unresolvedFKs } = this._detectForeignKeys(profiles);
      console.log(`[Fingerprinter] ✓ Pass 2 done: ${rawEdges.length} name-matched FKs, ${unresolvedFKs.length} unresolved`);

      // ── Pass 2.5 — typeRef pattern detection (no LLM) ───────────────────────
      const typeRefEdges = this._detectTypeRefFields(profiles);
      console.log(`[Fingerprinter] ✓ Pass 2.5: ${typeRefEdges.length} typeRef edges`);

      // ── Pass 3 — FK validation via MongoDB ID overlap (no LLM) ──────────────
      console.log('[Fingerprinter] ── Pass 3: validating FK edges via MongoDB ID overlap...');
      const allRaw = [...rawEdges, ...typeRefEdges];
      const edges = await this._validateEdges(db, profiles, allRaw);
      console.log(`[Fingerprinter] ✓ Pass 3 done: ${edges.length} validated edges`);

      // ── Pass 3.5 — semantic FK resolution via Gemini Flash ──────────────────
      console.log(`[Fingerprinter] ── Pass 3.5: semantically resolving ${unresolvedFKs.length} unresolved FKs via Gemini...`);
      const semanticEdges = await this._resolveSemanticFKs(profiles, unresolvedFKs);
      const validatedSemantic = await this._validateEdges(db, profiles, semanticEdges);
      console.log(`[Fingerprinter] ✓ Pass 3.5 done: ${validatedSemantic.length} semantic edges added`);

      const allEdges = [...edges, ...validatedSemantic];
      console.log(`[Fingerprinter]   Total edges: ${allEdges.length}`);

      // ── Pass 4 — semantic enrichment via Gemini Flash (batched) ─────────────
      const batchSize = 3;
      const totalBatches = Math.ceil(collectionNames.length / batchSize);
      console.log(`[Fingerprinter] ── Pass 4: semantic enrichment (${collectionNames.length} collections, ${totalBatches} batches of ${batchSize})...`);
      const enriched = await this._semanticEnrichment(profiles);
      console.log(`[Fingerprinter] ✓ Pass 4 done`);

      // ── Pass 4.5 — field alias generation via Gemini Flash ──────────────────
      // Generates human-language aliases for every non-trivial field (number,
      // boolean, amount, status) so the AliasResolver can do deterministic
      // field→collection matching at query time without any LLM call.
      console.log('[Fingerprinter] ── Pass 4.5: generating field aliases...');
      await this._generateFieldAliases(enriched, Object.keys(enriched));
      const aliasCount = Object.values(enriched)
        .flatMap((p) => Object.values(p.fields ?? {}))
        .filter((f) => f.aliases?.length > 0).length;
      console.log(`[Fingerprinter] ✓ Pass 4.5 done: ${aliasCount} fields with aliases`);

      // ── Pass 5 — cross-collection equivalences via Gemini Flash ─────────────
      console.log('[Fingerprinter] ── Pass 5: finding cross-collection semantic equivalences...');
      const semanticEq = await this._findEquivalences(enriched);
      const eqCount = (semanticEq?.equivalences?.length ?? 0) + (semanticEq?.statusMappings?.length ?? 0);
      console.log(`[Fingerprinter] ✓ Pass 5 done: ${eqCount} equivalences found`);

      // ── Pass 6 — website term alignment via Gemini Flash ────────────────────
      let websiteTerms = {};
      if (this.websiteContent) {
        console.log('[Fingerprinter] ── Pass 6: aligning website terms to collections...');
        websiteTerms = await this._alignWebsiteTerms(enriched);
        console.log(`[Fingerprinter] ✓ Pass 6 done: ${Object.keys(websiteTerms).length} terms mapped`);
      } else {
        console.log('[Fingerprinter] ── Pass 6: skipped (no website content)');
      }

      // ── Metric derivation (deterministic) ───────────────────────────────────
      const metrics = this._deriveMetrics(enriched);
      // Capture doc counts for registry caching (enables incremental re-fingerprint)
      const docCounts = Object.fromEntries(
        Object.entries(enriched).map(([n, p]) => [n, p.docCount ?? 0]),
      );
      console.log(`[Fingerprinter] ✓ Done — ${Object.keys(metrics).length} metrics derived, ${allEdges.length} edges total`);

      return { profiles: enriched, edges: allEdges, semanticEq, websiteTerms, metrics, docCounts };
    } finally {
      await client.close();
    }
  }

  // ── Incremental fingerprint — reuses cache for unchanged collections ───────────
  //
  // fingerprintIncremental(cachedData) is called when SchemaRegistry returns a
  // previously computed fingerprint for this MongoDB URI. It:
  //
  //   1. Fetches current doc counts for every collection in the database
  //   2. Compares against cachedData.docCounts (stored at last fingerprint time)
  //   3. Collections with a >5% or >100-doc delta are flagged as "changed"
  //   4. Changed/new collections go through the full extraction + enrichment pipeline
  //   5. Removed collections are deleted from the merged profiles
  //   6. FK detection (Passes 2, 2.5, 3, 3.5) always re-runs on the merged set
  //      because a new collection might introduce new FK edges to existing ones
  //   7. Equivalence detection (Pass 5) always re-runs on the merged enriched set
  //   8. Website terms (Pass 6) re-runs only if changed.length > 0
  //
  // If nothing changed → returns cachedData directly (zero LLM calls, ~50ms).

  async fingerprintIncremental(cachedData) {
    const client = makeClient(this.mongoUri);
    await client.connect();
    const db = client.db();

    try {
      const infos    = await db.listCollections().toArray();
      const allNames = infos.map((i) => i.name).filter((n) => !n.startsWith('system.'));
      const cachedCounts = cachedData.docCounts ?? {};

      // ── Current doc counts (parallel fetch) ─────────────────────────────────
      const currentCounts = {};
      await Promise.all(allNames.map(async (name) => {
        try {
          currentCounts[name] = await db.collection(name).estimatedDocumentCount();
        } catch {
          currentCounts[name] = 0;
        }
      }));

      // ── Classify collections ─────────────────────────────────────────────────
      const changed = allNames.filter((n) => {
        const cached = cachedCounts[n];
        if (cached == null) return true; // new collection — must fingerprint
        const delta = Math.abs(currentCounts[n] - cached);
        return delta > 100 || delta / Math.max(cached, 1) > 0.05;
      });

      const removed = Object.keys(cachedData.profiles ?? {}).filter(
        (n) => !allNames.includes(n),
      );

      const unchanged = allNames.length - changed.length;
      console.log(`[Fingerprinter] ── Incremental: ${changed.length} changed, ${removed.length} removed, ${unchanged} unchanged (cached)`);

      // ── Fast path: nothing changed ───────────────────────────────────────────
      if (changed.length === 0 && removed.length === 0) {
        console.log('[Fingerprinter] ✓ All collections unchanged — returning cached fingerprint');
        return {
          profiles:    cachedData.profiles,
          edges:       cachedData.edges,
          semanticEq:  cachedData.semanticEq  ?? { equivalences: [], statusMappings: [] },
          websiteTerms: cachedData.websiteTerms ?? {},
          metrics:     cachedData.metrics     ?? {},
          docCounts:   currentCounts,
          fromCache:   true,
        };
      }

      // ── Merge: start from cached, apply removals ─────────────────────────────
      const mergedProfiles = { ...cachedData.profiles };
      for (const n of removed) delete mergedProfiles[n];

      // ── Re-extract structural profiles for changed/new collections ───────────
      if (changed.length > 0) {
        console.log(`[Fingerprinter] ── Re-extracting ${changed.length} changed: [${changed.join(', ')}]`);
        const sevenAgo = makeMinOid(new Date(Date.now() - 7 * 86400000));

        for (const name of changed) {
          try {
            const coll    = db.collection(name);
            const samples = await coll.find({}).limit(5).toArray();

            if (samples.length === 0) {
              mergedProfiles[name] = { name, docCount: 0, fields: {}, velocity: 'empty' };
              continue;
            }

            const docCount     = currentCounts[name];
            const recentCount  = await coll.countDocuments({ _id: { $gt: sevenAgo } }).catch(() => 0);
            const velocity     = recentCount > 100 ? 'high' : recentCount > 0 ? 'medium' : 'low';
            const fields       = {};
            for (const doc of samples) extractFields(doc, fields);
            finalizeFields(fields);
            mergedProfiles[name] = { name, docCount, velocity, fields };
          } catch (err) {
            console.warn(`[Fingerprinter] Skip ${name}:`, err.message);
          }
        }
      }

      // ── Re-run FK detection on merged profiles ───────────────────────────────
      console.log('[Fingerprinter] ── Re-detecting FK edges on merged profiles...');
      const { resolved: rawEdges, unresolved: unresolvedFKs } = this._detectForeignKeys(mergedProfiles);
      const typeRefEdges     = this._detectTypeRefFields(mergedProfiles);
      const allRaw           = [...rawEdges, ...typeRefEdges];
      const edges            = await this._validateEdges(db, mergedProfiles, allRaw);
      const semanticEdges    = await this._resolveSemanticFKs(mergedProfiles, unresolvedFKs);
      const validatedSemantic = await this._validateEdges(db, mergedProfiles, semanticEdges);
      const allEdges         = [...edges, ...validatedSemantic];
      console.log(`[Fingerprinter] ── FK re-detection done: ${allEdges.length} edges`);

      // ── Enrich + alias only changed/new collections; reuse cached ────────────
      const enriched = { ...mergedProfiles };
      if (changed.length > 0) {
        const toEnrich = changed.filter((n) => mergedProfiles[n]);
        console.log(`[Fingerprinter] ── Enriching ${toEnrich.length} changed collections...`);
        await this._enrichCollections(toEnrich, mergedProfiles, enriched);
        console.log(`[Fingerprinter] ── Generating field aliases for ${toEnrich.length} changed collections...`);
        await this._generateFieldAliases(enriched, toEnrich);
      }

      // ── Re-run equivalences + website terms ───────────────────────────────────
      const semanticEq = await this._findEquivalences(enriched);

      let websiteTerms = cachedData.websiteTerms ?? {};
      if (this.websiteContent && changed.length > 0) {
        websiteTerms = await this._alignWebsiteTerms(enriched);
      }

      const metrics   = this._deriveMetrics(enriched);
      const docCounts = Object.fromEntries(
        Object.entries(enriched).map(([n, p]) => [n, p.docCount ?? 0]),
      );

      console.log(`[Fingerprinter] ✓ Incremental done — ${allEdges.length} edges, ${Object.keys(enriched).length} collections`);
      return { profiles: enriched, edges: allEdges, semanticEq, websiteTerms, metrics, docCounts };

    } finally {
      await client.close();
    }
  }

  // ── Pass 1: structural profile extraction ────────────────────────────────────

  async _extractProfiles(db) {
    const infos   = await db.listCollections().toArray();
    const names   = infos.map((i) => i.name).filter((n) => !n.startsWith('system.'));
    const sevenAgo = makeMinOid(new Date(Date.now() - 7 * 86400000));
    const profiles = {};

    for (const name of names) {
      try {
        const coll    = db.collection(name);
        const samples = await coll.find({}).limit(5).toArray();
        if (samples.length === 0) {
          profiles[name] = { name, docCount: 0, fields: {}, velocity: 'empty' };
          continue;
        }

        const [docCount, recentCount] = await Promise.all([
          coll.estimatedDocumentCount(),
          coll.countDocuments({ _id: { $gt: sevenAgo } }).catch(() => 0),
        ]);

        const velocity = recentCount > 100 ? 'high' : recentCount > 0 ? 'medium' : 'low';
        const fields   = {};
        for (const doc of samples) extractFields(doc, fields);
        finalizeFields(fields); // promote samples→enum AFTER all docs are merged

        profiles[name] = { name, docCount, velocity, fields };
      } catch (err) {
        console.warn(`[Fingerprinter] Skip ${name}:`, err.message);
      }
    }

    return profiles;
  }

  // ── Pass 2: FK detection by naming convention ─────────────────────────────────
  //
  // Returns { resolved: edge[], unresolved: fkHint[] }
  //
  // "resolved" = FK field where the name-hint matched a real collection
  // "unresolved" = FK field where no collection matched by name
  //   → e.g. conversations.creatorId: hint="creator" → no "creator"/"creators" collection
  //   → needs Pass 3.5 (Gemini semantic resolution) to link it to "users"

  _detectForeignKeys(profiles) {
    const names    = Object.keys(profiles);
    const resolved   = [];
    const unresolved = [];

    for (const [collName, profile] of Object.entries(profiles)) {
      for (const [fname, field] of Object.entries(profile.fields)) {
        if (!field.isFk) continue;

        const match = FK_RE.exec(fname);
        if (!match) continue;

        const refHint = match[1].toLowerCase();

        // Fuzzy match: exact, plural, underscore-stripped variants
        const target = names.find((n) => {
          const nl = n.toLowerCase();
          return (
            nl === refHint ||
            nl === refHint + 's' ||
            nl === refHint.replace(/_/g, '') ||
            nl.replace(/_/g, '') === refHint
          );
        });

        if (target && target !== collName) {
          resolved.push({
            from:        collName,
            to:          target,
            fromField:   fname,
            toField:     '_id',
            cardinality: 'M:1',
            confidence:  0.65,
            validated:   false,
          });
        } else if (!target) {
          // Couldn't resolve by name — queue for Gemini semantic resolution
          unresolved.push({
            collection: collName,
            field:      fname,
            hint:       refHint,
            type:       field.type,         // usually ObjectId
          });
        }
      }
    }

    return { resolved, unresolved };
  }

  // ── Pass 2.5: typeRef pattern detection (no LLM) ──────────────────────────────
  //
  // Detects polymorphic FK patterns like:
  //   senderId: ObjectId  +  senderTypeRef: "participants"
  //   authorId: ObjectId  +  authorTypeRef: "users"
  //
  // When a *TypeRef field has a string value that matches a collection name,
  // we can wire the FK directly without LLM help.

  _detectTypeRefFields(profiles) {
    const names = Object.keys(profiles);
    const edges = [];

    for (const [collName, profile] of Object.entries(profiles)) {
      const fieldEntries = Object.entries(profile.fields);

      for (const [fname, field] of fieldEntries) {
        // Look for *TypeRef or *Ref string fields with enum values
        const typeRefMatch = /^(.+?)TypeRef$|^(.+?)Ref$/.exec(fname);
        if (!typeRefMatch || field.type !== 'string') continue;

        const baseField = (typeRefMatch[1] || typeRefMatch[2]).toLowerCase();

        // Find a corresponding FK field (e.g., senderId alongside senderTypeRef)
        const fkFieldName = Object.keys(profile.fields).find((fn) => {
          const fnl = fn.toLowerCase();
          return fnl === baseField + 'id' || fnl === baseField + '_id';
        });

        if (!fkFieldName) continue;

        // The typeRef enum values tell us which collections are referenced
        const refValues = field.values ?? [];
        for (const refVal of refValues) {
          const target = names.find((n) => {
            const nl = n.toLowerCase();
            const rl = refVal.toLowerCase();
            return nl === rl || nl === rl.replace(/_/g, '') || nl.replace(/_/g, '') === rl;
          });
          if (target && target !== collName) {
            edges.push({
              from:        collName,
              to:          target,
              fromField:   fkFieldName,
              toField:     '_id',
              cardinality: 'M:1',
              confidence:  0.80,
              validated:   false,
              note:        `via ${fname}="${refVal}"`,
            });
          }
        }
      }
    }

    return edges;
  }

  // ── Pass 3.5: semantic FK resolution — Gemini Flash ──────────────────────────
  //
  // For FK fields that couldn't be matched by name convention, use Gemini to
  // infer the target collection based on business context.
  //
  // Examples this catches:
  //   conversations.creatorId  → users   ("creator of a conversation is a user")
  //   messages.senderId        → participants / users
  //   posts.authorId           → users
  //   tickets.assigneeId       → users or agents

  async _resolveSemanticFKs(profiles, unresolvedFKs) {
    if (unresolvedFKs.length === 0) return [];

    // Build compact collection list for Gemini context
    const collList = Object.entries(profiles)
      .map(([name, p]) => `${name}(role:${p.role ?? '?'},docs:${p.docCount})`)
      .join(', ');

    const BATCH   = 10;
    const newEdges = [];

    for (let i = 0; i < unresolvedFKs.length; i += BATCH) {
      const batch = unresolvedFKs.slice(i, i + BATCH);
      const batchNum = Math.floor(i / BATCH) + 1;
      const totalBatches = Math.ceil(unresolvedFKs.length / BATCH);
      console.log(`[Fingerprinter]   semFK batch ${batchNum}/${totalBatches}: [${batch.map((f) => `${f.collection}.${f.field}`).join(', ')}]`);

      const fkLines = batch.map((fk, idx) =>
        `${idx + 1}. ${fk.collection}.${fk.field} (name-hint:"${fk.hint}", type:${fk.type})`,
      );

      const prompt = `You are a database schema expert. Infer which MongoDB collection each FK field references.

Available collections: ${collList}

FK fields to resolve (collection.field, name-hint is the prefix before "Id"):
${fkLines.join('\n')}

Reasoning rules:
- "creatorId" → the user who created something → likely "users"
- "ownerId", "authorId", "userId", "memberId" → likely "users"
- "organizationId", "orgId", "accountId", "companyId" → likely organizations/accounts/companies/orgs
- "conversationId" → likely "conversations"
- "participantId", "senderId" → likely "participants" or "users"
- "workspaceId", "teamId" → likely workspaces/teams

For each field, pick the BEST matching collection from the available list. Skip if confidence < 0.65.`;

      try {
        const results = await callGemini(prompt, { useFlash: true, maxTokens: 800, schema: SEMANTIC_FK_SCHEMA, tag: 'fp-semfk' });
        const arr     = Array.isArray(results?.resolutions) ? results.resolutions
                      : Array.isArray(results) ? results : [];

        for (const r of arr) {
          if (!r.refCollection || !profiles[r.refCollection]) continue;
          if ((r.confidence ?? 0) < 0.65) continue;

          const fk = batch.find((f) => f.field === r.field && f.collection === r.collection);
          if (!fk) continue;

          newEdges.push({
            from:        fk.collection,
            to:          r.refCollection,
            fromField:   fk.field,
            toField:     '_id',
            cardinality: 'M:1',
            confidence:  r.confidence,
            validated:   false,
            semantic:    true,   // flag: inferred by Gemini, not name-matching
          });
        }
      } catch (err) {
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('[Fingerprinter] Semantic FK resolution FAILED — batch skipped');
        console.error('  Error :', err.message);
        console.error('  Stack :', err.stack ?? '(no stack)');
        console.error('  Batch :', batch.map((fk) => `${fk.collection}.${fk.field}`).join(', '));
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      }
    }

    console.log(`[Fingerprinter] Semantic resolution produced ${newEdges.length} new edges`);
    return newEdges;
  }

  // ── Pass 3: validate FK edges via MongoDB ID overlap ─────────────────────────

  async _validateEdges(db, profiles, rawEdges) {
    const validated = [];

    for (const edge of rawEdges) {
      try {
        const src = db.collection(edge.from);
        const tgt = db.collection(edge.to);

        // Sample 5 ID values from the FK field
        const pipeline = [
          { $match: { [edge.fromField]: { $ne: null } } },
          { $sample: { size: 5 } },
          { $project: { _id: 0, v: `$${edge.fromField}` } },
        ];
        const rows = await src.aggregate(pipeline).toArray();
        if (rows.length === 0) { validated.push(edge); continue; }

        const ids      = rows.map((r) => r.v).filter(Boolean);
        const matched  = await tgt.countDocuments({ _id: { $in: ids } });
        const ratio    = matched / ids.length;

        validated.push({
          ...edge,
          confidence: Math.min(0.97, edge.confidence + ratio * 0.30),
          validated:  ratio >= 0.5,
          matchRatio: ratio,
        });
      } catch {
        validated.push(edge);
      }
    }

    return validated;
  }

  // ── Pass 4: semantic enrichment — Gemini Flash, batches of 3 ─────────────────
  // Batch of 3 (down from 5) keeps the output small enough to stay under the
  // token limit even when the model pretty-prints the JSON response.

  async _semanticEnrichment(profiles) {
    const names   = Object.keys(profiles);
    const enriched = { ...profiles };
    await this._enrichCollections(names, profiles, enriched);
    return enriched;
  }

  /**
   * _enrichCollections(namesToEnrich, allProfiles, enriched)
   *
   * Sends batches of collections to Gemini for semantic classification.
   * Writes results into the `enriched` map in-place.
   * Called by both _semanticEnrichment() (full pass) and fingerprintIncremental()
   * (changed-collections-only pass).
   */
  async _enrichCollections(namesToEnrich, allProfiles, enriched) {
    const BATCH          = 3;
    const INTER_BATCH_MS = 1000; // 1 s between batches — keeps Flash QPM well under limit

    for (let i = 0; i < namesToEnrich.length; i += BATCH) {
      // Pause between batches (not before the first one) to respect Vertex AI QPM limits.
      if (i > 0) await new Promise((r) => setTimeout(r, INTER_BATCH_MS));

      const batch = namesToEnrich.slice(i, i + BATCH);
      const batchNum = Math.floor(i / BATCH) + 1;
      const totalBatches = Math.ceil(namesToEnrich.length / BATCH);
      console.log(`[Fingerprinter]   enrich batch ${batchNum}/${totalBatches}: [${batch.join(', ')}]`);

      // Build a token-efficient representation:
      // Only send field names + compact type annotation, no actual values
      const batchLines = batch.map((name) => {
        const p = allProfiles[name];
        const fieldDescs = Object.entries(p.fields ?? {})
          .slice(0, 12) // cap per collection
          .map(([fn, f]) => {
            let d = `${fn}:${f.type}`;
            if (f.isFk)     d += '[FK]';
            if (f.isDate)   d += '[date]';
            if (f.isStatus) d += '[status]';
            if (f.isAmount) d += '[amount]';
            if (f.values)   d += `[${f.values.slice(0, 3).join('|')}]`;
            return d;
          })
          .join(', ');
        return `${name}(${p.docCount} docs, ${p.velocity}): ${fieldDescs}`;
      });

      const prompt = `SaaS DB expert. Classify MongoDB collections.

Collections (name, docCount, fields):
${batchLines.join('\n')}

Return a collections array of exactly ${batch.length} items.
CRITICAL — be brief:
- semanticSignature: ≤6 words (e.g. "stores active user subscriptions")
- anchorEntity: 1-2 words only (e.g. "user", "subscription")
- keyBusinessFields: ≤3 field names
- role: one of users|subscriptions|payments|events|organizations|products|other`;

      try {
        const results = await callGemini(prompt, { useFlash: true, maxTokens: 2048, schema: ENRICHMENT_SCHEMA, tag: 'fp-enrich' });
        const arr     = Array.isArray(results?.collections) ? results.collections
                      : Array.isArray(results) ? results : [];

        for (let j = 0; j < batch.length; j++) {
          const name = batch[j];
          const r    = arr[j] ?? {};
          enriched[name] = {
            ...allProfiles[name],
            role:              r.role             ?? 'other',
            anchorEntity:      r.anchorEntity     ?? name,
            semanticSignature: r.semanticSignature ?? '',
            keyBusinessFields: r.keyBusinessFields ?? [],
          };
          console.log(`[Fingerprinter]     ${name} → role:${enriched[name].role} sig:"${enriched[name].semanticSignature}"`);
        }
      } catch (err) {
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error(`[Fingerprinter] Enrichment batch [${i}–${i + BATCH}] FAILED — collections skipped`);
        console.error('  Error       :', err.message);
        console.error('  Stack       :', err.stack ?? '(no stack)');
        console.error('  Collections :', batch.join(', '));
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      }
    }
  }

  // ── Pass 4.5: field alias generation ─────────────────────────────────────────
  //
  // Sends batches of 4 collections to Gemini Flash, asking it to generate 2-4
  // natural-language aliases per field. Aliases are stored directly in the
  // profile's field object as field.aliases = ["instagram followers", ...].
  //
  // Only generates aliases for fields where the name doesn't speak for itself:
  //   - number  fields (e.g. igFollowersCount, totalRevenue)
  //   - boolean fields (e.g. instagramConnected, isVerified)
  //   - amount  fields (e.g. mrr, price, cost)
  //   - status  fields with known values (e.g. subscriptionStatus)
  //
  // FK, date, and PII fields are skipped — their names are already canonical
  // or irrelevant for natural-language query matching.

  async _generateFieldAliases(profiles, namesToProcess) {
    const BATCH          = 4;
    const INTER_BATCH_MS = 1000;

    // Build list of collections that actually have alias-worthy fields
    const workList = namesToProcess.filter((name) => {
      const p = profiles[name];
      return Object.entries(p?.fields ?? {}).some(
        ([, f]) => !f.isPii && !f.isFk && !f.isDate &&
          (f.type === 'number' || f.type === 'boolean' || f.isAmount || f.isStatus),
      );
    });

    if (workList.length === 0) return;

    for (let i = 0; i < workList.length; i += BATCH) {
      if (i > 0) await new Promise((r) => setTimeout(r, INTER_BATCH_MS));

      const batch = workList.slice(i, i + BATCH);
      const batchNum = Math.floor(i / BATCH) + 1;
      console.log(`[Fingerprinter]   alias batch ${batchNum}: [${batch.join(', ')}]`);

      // Build a compact description of each collection's alias-worthy fields
      const lines = batch.flatMap((name) => {
        const p = profiles[name];
        const eligible = Object.entries(p.fields ?? {})
          .filter(([, f]) => !f.isPii && !f.isFk && !f.isDate &&
            (f.type === 'number' || f.type === 'boolean' || f.isAmount || f.isStatus));

        // Prioritise number/amount fields (metrics) over plain booleans — they are
        // more likely to need meaningful aliases (e.g. igFollowersCount, leads_found).
        // Within each group, filter out low-signal internal fields like __v.
        const numbers  = eligible.filter(([fn, f]) => f.type === 'number' && fn !== '__v');
        const booleans = eligible.filter(([,   f]) => f.type === 'boolean');
        const statuses = eligible.filter(([,   f]) => f.isStatus);
        // Merge: numbers first, then booleans, then statuses; dedup by field name
        const seen = new Set();
        const ordered = [...numbers, ...booleans, ...statuses].filter(([fn]) => {
          if (seen.has(fn)) return false;
          seen.add(fn);
          return true;
        });

        const fields = ordered
          .slice(0, 12)   // increased from 10 to catch metric fields that appear late in schema
          .map(([fn, f]) => {
            let d = `${fn}:${f.type}`;
            if (f.isAmount) d += '[amount]';
            if (f.isStatus && f.values?.length) d += `[${f.values.slice(0, 3).join('|')}]`;
            return d;
          });
        if (fields.length === 0) return [];
        return [`Collection "${name}" (${p.role ?? 'other'}): ${fields.join(', ')}`];
      });

      if (lines.length === 0) continue;

      const prompt = `You are building a semantic dictionary for a SaaS analytics platform.
For each field below, generate 2-4 natural-language aliases a non-technical founder would use when asking about this metric in plain English.

${lines.join('\n')}

Rules:
- aliases must be lowercase phrases (2-5 words)
- aliases should cover common phrasings (e.g. igFollowersCount → "instagram followers", "ig followers", "instagram follower count")
- for boolean fields: include both state phrasings (e.g. "connected instagram", "instagram account linked")
- for status fields: alias the concept not the values (e.g. "subscription state", "account status")
- return empty aliases [] for fields whose name is already obvious (e.g. "count", "total", "score")
- include the collection name exactly as given in each output item`;

      try {
        const result = await callGemini(prompt, {
          useFlash: true, maxTokens: 1200, schema: FIELD_ALIAS_SCHEMA, tag: 'fp-alias',
        });

        for (const entry of result?.fields ?? []) {
          if (!entry.collection || !entry.fieldName || !entry.aliases?.length) continue;
          const p = profiles[entry.collection];
          if (!p?.fields?.[entry.fieldName]) continue;
          p.fields[entry.fieldName].aliases = entry.aliases.map((a) => a.toLowerCase());
          console.log(`[Fingerprinter]     ${entry.collection}.${entry.fieldName} → [${entry.aliases.join(', ')}]`);
        }
      } catch (err) {
        console.error(`[Fingerprinter] Alias batch ${batchNum} FAILED — fields will have no aliases`);
        console.error('  Error:', err.message);
        // Non-fatal: queries still work, just with LLM-only resolution
      }
    }
  }

  // ── Pass 5: cross-collection semantic equivalence ────────────────────────────

  async _findEquivalences(profiles) {
    const amountFields = [];
    const statusEntries = [];

    for (const [coll, p] of Object.entries(profiles)) {
      for (const [fn, f] of Object.entries(p.fields)) {
        if (f.isAmount) amountFields.push(`${coll}.${fn}`);
        if (f.isStatus && f.values?.length) {
          statusEntries.push({ path: `${coll}.${fn}`, values: f.values });
        }
      }
    }

    if (amountFields.length < 2 && statusEntries.length < 2) return { equivalences: [], statusMappings: [] };

    const prompt = `Identify semantic equivalences across MongoDB collections.
Amount fields: ${amountFields.join(', ')}
Status fields: ${statusEntries.slice(0, 10).map((s) => s.path + ':[' + s.values.join('|') + ']').join(' | ')}
List which amount fields mean the same thing and which status values mean active/cancelled/trialing.`;

    try {
      return await callGemini(prompt, { useFlash: true, maxTokens: 800, schema: EQUIVALENCE_SCHEMA, tag: 'fp-equiv' });
    } catch (err) {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('[Fingerprinter] _findEquivalences FAILED — returning empty result');
      console.error('  Error:', err.message);
      console.error('  Stack:', err.stack ?? '(no stack)');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return { equivalences: [], statusMappings: [] };
    }
  }

  // ── Pass 6: website term alignment ───────────────────────────────────────────

  async _alignWebsiteTerms(profiles) {
    const trimmed = this.websiteContent.slice(0, 1200);
    const collSummaries = Object.entries(profiles)
      .slice(0, 12)
      .map(([n, p]) => `${n}: ${p.semanticSignature || p.anchorEntity}`)
      .join('\n');

    const prompt = `Map website terms to DB collections.
Website: "${trimmed}"
Collections: ${collSummaries}
Map product terms from the website text to their corresponding database collections.`;

    try {
      const r = await callGemini(prompt, { useFlash: true, maxTokens: 500, schema: TERM_MAPPING_SCHEMA, tag: 'fp-terms' });
      return (r?.termMappings ?? [])
        .filter((m) => m.confidence > 0.7)
        .reduce((acc, m) => { acc[m.term] = m.collection; return acc; }, {});
    } catch (err) {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('[Fingerprinter] _alignWebsiteTerms FAILED — returning empty map');
      console.error('  Error:', err.message);
      console.error('  Stack:', err.stack ?? '(no stack)');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return {};
    }
  }

  // ── Metric derivation (deterministic from enriched profiles) ─────────────────

  _deriveMetrics(profiles) {
    const metrics = {};

    // MRR — look for subscription collection with an amount field
    const subColl = Object.values(profiles).find((p) => p.role === 'subscriptions');
    if (subColl) {
      const amountField = Object.entries(subColl.fields ?? {})
        .find(([, f]) => f.isAmount)?.[0] ?? null;
      const statusField = Object.entries(subColl.fields ?? {})
        .find(([, f]) => f.isStatus)?.[0] ?? 'status';

      metrics.mrr = {
        description: 'Monthly Recurring Revenue',
        collection:  subColl.name,
        aggregation: amountField ? { $sum: `$${amountField}` } : null,
        filter:      { [statusField]: { $in: ['active', 'trialing'] } },
        amountField,
        statusField,
      };

      metrics.churn = {
        description: 'Subscription cancellations',
        collection:  subColl.name,
        statusField,
        cancelledValues: ['cancelled', 'canceled', 'inactive', 'churned', 'deleted'],
      };
    }

    return metrics;
  }
}

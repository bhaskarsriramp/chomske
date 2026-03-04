import express      from 'express';
import crypto       from 'crypto';
import fs           from 'fs';
import path         from 'path';
import { fileURLToPath } from 'url';
import WaitListUser from '../models/WaitListUsers.js';
import { SchemaFingerprinter } from '../discovery/SchemaFingerprinter.js';
import { SchemaRegistry }      from '../registry/SchemaRegistry.js';
import { KnowledgeGraph }      from '../graph/KnowledgeGraph.js';
import { PlannerAgent }        from '../agents/PlannerAgent.js';
import { AnalystAgent }        from '../agents/AnalystAgent.js';
import { CriticAgent }         from '../agents/CriticAgent.js';
import { VerifierAgent }       from '../agents/VerifierAgent.js';
import { NarratorAgent }       from '../agents/NarratorAgent.js';
import { InsightEngine }       from '../insights/InsightEngine.js';
import { MongoClient }         from 'mongodb';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = path.join(__dirname, '..', 'sessions.json');

const router = express.Router();

// ── Session persistence ──────────────────────────────────────────────────────

function loadSessions() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      return new Map(Object.entries(JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'))));
    }
  } catch (e) {
    console.warn('[sessions] Could not load sessions.json:', e.message);
  }
  return new Map();
}

function saveSessions(store) {
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(Object.fromEntries(store), null, 2));
  } catch (e) {
    console.warn('[sessions] Could not save sessions.json:', e.message);
  }
}

const sessionStore = loadSessions();

function sessionSet(id, data) {
  sessionStore.set(id, data);
  saveSessions(sessionStore);
}

function sessionGet(id) {
  return sessionStore.get(id) ?? null;
}

// ── Website scraper ──────────────────────────────────────────────────────────

async function scrapeWebsite(url) {
  try {
    const ctrl    = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 6000);
    const res     = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FounderDB/1.0)' },
    });
    clearTimeout(timeout);
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 2500) || null;
  } catch (e) {
    console.warn('[scrape]', e.message);
    return null;
  }
}

// ── MongoDB read-only helper ──────────────────────────────────────────────────

function makeClient(uri) {
  return new MongoClient(uri, {
    readPreference:           'secondaryPreferred',
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS:         10000,
  });
}

// ── POST /api/connect ─────────────────────────────────────────────────────────
//
// Phase 1+2: fingerprint the database and build the Semantic Knowledge Graph.
// Returns enough data for the Confirmation page.

router.post('/connect', async (req, res) => {

  console.log('This got hit:::::::::');
  const { mongoUri, websiteUrl, forceRefresh } = req.body;
  if (!mongoUri) return res.status(400).json({ error: 'mongoUri is required' });

  try {
    // Scrape website in parallel with connection test
    const [websiteContent, dbName] = await Promise.all([
      websiteUrl ? scrapeWebsite(websiteUrl) : Promise.resolve(null),
      (async () => {
        const c = makeClient(mongoUri);
        await c.connect();
        const name = c.db().databaseName;
        await c.close();
        return name;
      })(),
    ]);

    // ── Schema Registry: incremental fingerprinting ──────────────────────────
    // Check if we have a cached fingerprint for this database URI.
    // If yes → run fingerprintIncremental() which only re-processes changed
    // collections (typically < 5 seconds vs. 30+ seconds for a full run).
    // If no (or forceRefresh=true) → run the full 6-pass fingerprint.

    const fingerprinter = new SchemaFingerprinter(mongoUri, websiteContent ?? '');
    let fingerprintResult;

    const cached = forceRefresh ? null : await SchemaRegistry.load(mongoUri);

    if (cached) {
      console.log('[connect] Cache found — running incremental fingerprint...');
      fingerprintResult = await fingerprinter.fingerprintIncremental(cached);
    } else {
      console.log('[connect] No cache — running full schema fingerprint...');
      fingerprintResult = await fingerprinter.fingerprint();
    }

    const { profiles, edges, semanticEq, websiteTerms, metrics, docCounts } = fingerprintResult;

    // Persist updated fingerprint to registry (fire-and-forget — don't block response)
    SchemaRegistry.save(mongoUri, { profiles, edges, semanticEq, websiteTerms, metrics, docCounts })
      .catch((e) => console.warn('[connect] SchemaRegistry save failed:', e.message));

    // Build KnowledgeGraph
    const sessionId = crypto.randomUUID();
    const kg        = new KnowledgeGraph(sessionId);

    for (const [name, profile] of Object.entries(profiles)) {
      kg.setNode(name, profile);
    }
    for (const edge of edges) {
      kg.addEdge(edge);
    }
    kg.setSemanticEq(semanticEq);
    kg.setWebsiteTerms(websiteTerms);
    kg.setMetrics(metrics);

    // Derive initial business context from enriched roles
    const autoCtx = {};
    for (const [, p] of Object.entries(profiles)) {
      if (p.role && p.role !== 'other' && !autoCtx[p.role]) {
        autoCtx[p.role] = p.name;
      }
    }
    kg.setBusinessCtx(autoCtx);
    kg.save();

    // Persist session
    sessionSet(sessionId, { mongoUri, websiteUrl, kgPath: kg.filePath });

    // Build response — field names must match what Confirmation.js destructures.
    //
    // Confirmation.js expects:
    //   semanticMap   { [role]: { collection, confidence, keyFields[] } }
    //   allCollections  string[]
    //   productSummary  string

    const semanticMap = Object.fromEntries(
      Object.entries(autoCtx).map(([role, coll]) => {
        const node       = kg.getNode(coll);
        const confidence = node?.role === role ? 'high' : 'medium';
        return [role, { collection: coll, confidence, keyFields: node?.keyBusinessFields ?? [] }];
      }),
    );

    // Flat list of all collection names for the correction dropdowns
    const allCollections = Object.keys(profiles).sort();

    const topRelationships = edges
      .filter((e) => e.confidence >= 0.7)
      .slice(0, 10)
      .map((e) => `${e.from}.${e.fromField} → ${e.to}.${e.toField} (${e.cardinality})`);

    const entityMap = Object.fromEntries(
      Object.values(profiles)
        .filter((p) => p.anchorEntity)
        .map((p) => [p.anchorEntity, p.name]),
    );

    // productSummary: one-liner per collection, joined into a paragraph
    const productSummary = Object.values(profiles)
      .map((p) => p.semanticSignature)
      .filter(Boolean)
      .join('. ');

    res.json({
      sessionId,
      dbName,
      semanticMap,
      allCollections,
      entityMap,
      topRelationships,
      semanticEq,
      websiteTerms,
      productSummary,
    });

  } catch (err) {
    console.error('[connect] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/confirm ─────────────────────────────────────────────────────────
//
// Founder corrects role assignments. Updates the KG's businessCtx.

router.post('/confirm', async (req, res) => {
  // Accept either field name: frontend sends `corrections`, legacy sends `confirmedMap`
  const { sessionId, corrections, confirmedMap } = req.body;
  const roleMap = corrections ?? confirmedMap ?? {};
  const session = sessionGet(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  try {
    const kg = new KnowledgeGraph(sessionId);
    kg.load();

    // roleMap: { role: collectionName (string) } from Confirmation.js corrections state
    const ctx = {};
    for (const [role, val] of Object.entries(roleMap)) {
      ctx[role] = typeof val === 'string' ? val : (val?.collection ?? val);
    }
    kg.setBusinessCtx(ctx);
    kg.save();

    sessionSet(sessionId, { ...session, confirmed: true });
    res.json({ message: 'ok' });
  } catch (err) {
    console.error('[confirm] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/situations ───────────────────────────────────────────────────────
//
// Generates the SituationFeed dashboard cards using InsightEngine.

router.get('/situations', async (req, res) => {
  const { sessionId } = req.query;
  const session       = sessionGet(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  try {
    const kg = new KnowledgeGraph(sessionId);
    if (!kg.load()) return res.status(400).json({ error: 'Knowledge graph not found; re-connect.' });

    const engine = new InsightEngine(kg, session.mongoUri);
    const cards  = await engine.generateAll();

    res.json({ insights: cards });
  } catch (err) {
    console.error('[situations] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/ask ─────────────────────────────────────────────────────────────
//
// Multi-agent reasoning loop:
//   PlannerAgent → AnalystAgent → CriticAgent → VerifierAgent → Execute
//
// Returns: { answer, query, pipeline, recordCount, agentTrace }

router.post('/ask', async (req, res) => {
  const { sessionId, question } = req.body;
  if (!question) return res.status(400).json({ error: 'question is required' });

  const session = sessionGet(sessionId);
  if (!session)  return res.status(404).json({ error: 'Session not found' });

  try {
    const kg = new KnowledgeGraph(sessionId);
    if (!kg.load()) return res.status(400).json({ error: 'Knowledge graph not found; re-connect.' });

    const trace = [];

    // ── Step 1: Planner ──────────────────────────────────────────────────────
    console.log('[ask] PlannerAgent running...');
    const planner = new PlannerAgent(kg);
    const plan    = await planner.plan(question);
    trace.push({ agent: 'Planner', collections: plan.relevantCollections, steps: plan.steps });
    console.log('[ask] Plan:', plan.relevantCollections, '|', plan.steps?.slice(0, 2));

    // ── Step 2: Analyst ──────────────────────────────────────────────────────
    console.log('[ask] AnalystAgent running...');
    const analyst        = new AnalystAgent(kg);
    const analystResult  = await analyst.buildPipeline(plan);
    let   { pipeline, collection, explanation } = analystResult;
    trace.push({ agent: 'Analyst', collection, pipelineLength: pipeline?.length });

    // ── Step 3: Critic ───────────────────────────────────────────────────────
    console.log('[ask] CriticAgent running...');
    const critic       = new CriticAgent(kg);
    const criticResult = await critic.review(pipeline, plan);
    if (criticResult.revisedPipeline?.length > 0) {
      pipeline = criticResult.revisedPipeline;
    }
    trace.push({
      agent:      'Critic',
      approved:   criticResult.approved,
      confidence: criticResult.confidence,
      issues:     criticResult.issues,
    });

    // ── Step 4: Verifier ─────────────────────────────────────────────────────
    const verifier       = new VerifierAgent();
    const verifierResult = verifier.verify(pipeline);
    pipeline = verifierResult.pipeline; // may have auto-fixes applied
    trace.push({ agent: 'Verifier', safe: verifierResult.safe, issues: verifierResult.issues });

    if (!verifierResult.safe && verifierResult.issues.some((i) => i.includes('Forbidden'))) {
      return res.status(400).json({
        error: 'Pipeline blocked by safety verifier',
        issues: verifierResult.issues,
      });
    }

    // ── Step 5: Execute ───────────────────────────────────────────────────────
    console.log(`[ask] Executing on collection "${collection}" (${pipeline.length} stages)`);
    const client = makeClient(session.mongoUri);
    let results, recordCount;

    try {
      await client.connect();
      const db    = client.db();
      const docs  = await db.collection(collection).aggregate(pipeline).toArray();
      results     = docs;
      recordCount = docs.length;
    } finally {
      await client.close();
    }

    // ── Response ──────────────────────────────────────────────────────────────
    // Detect $count aggregate result: pipeline used $count → [{total: N}]
    const aggregateCount =
      results.length === 1 &&
      typeof results[0]?.total === 'number' &&
      Object.keys(results[0]).length === 1
        ? results[0].total
        : null;

    const hasEntityFilter = Object.keys(plan.entityFilters ?? {}).length > 0;
    const hasJoin         = (plan.joinChain ?? []).length > 0;

    // plan.explanation is internal planning reasoning ("The question asks…").
    // Only use it when it is concise enough to be user-facing (< 120 chars).
    const rawAnswer = explanation ||
      (plan.explanation && plan.explanation.length < 120 ? plan.explanation : '');

    let answerText;
    if (rawAnswer) {
      answerText = rawAnswer;
    } else if (aggregateCount !== null) {
      // Count query (e.g. "how many automations by Siddartha?")
      const entityName = Object.values(plan.entityFilters ?? {})
        .flatMap((f) => Object.values(f))[0] ?? '';
      const targetColl = hasJoin
        ? plan.joinChain[plan.joinChain.length - 1].from
        : collection;
      answerText = entityName
        ? `${entityName} has ${aggregateCount} ${targetColl} record${aggregateCount !== 1 ? 's' : ''}.`
        : `${aggregateCount} record${aggregateCount !== 1 ? 's' : ''} in ${targetColl}.`;
    } else if (hasEntityFilter && !hasJoin) {
      // Simple entity lookup (e.g. "who is Siddartha?")
      const entityValue = Object.values(plan.entityFilters)
        .flatMap((f) => Object.values(f))[0] ?? '';
      answerText = recordCount > 0
        ? `Found ${recordCount} result${recordCount !== 1 ? 's' : ''} for "${entityValue}".`
        : `No records found matching "${entityValue}".`;
    } else {
      answerText = recordCount > 0
        ? `Found ${recordCount} record${recordCount !== 1 ? 's' : ''} in ${collection}.`
        : `No records found in ${collection} for your query.`;
    }

    // displayCount / displayCollection drive the count chip in the frontend.
    // For $count aggregate results, expose the actual total (not results.length = 1)
    // and the target/joined collection rather than the anchor collection.
    const displayCount      = aggregateCount ?? recordCount;
    const displayCollection = aggregateCount !== null && hasJoin
      ? plan.joinChain[plan.joinChain.length - 1].from
      : collection;

    // ── Step 6: Narrator ─────────────────────────────────────────────────────
    // NarratorAgent reads the actual results and generates a business-focused
    // NL answer. Runs only when there are real documents to analyse (not pure
    // count results). Falls back to the template answerText on failure.
    console.log('[ask] NarratorAgent running...');
    const narrator       = new NarratorAgent();
    const narratedAnswer = await narrator.synthesize(
      question, displayCollection, results, displayCount,
    );
    trace.push({ agent: 'Narrator', synthesized: !!narratedAnswer });

    res.json({
      answer:            narratedAnswer || answerText,
      collection:        displayCollection,
      query:             `db.${collection}.aggregate(pipeline)`,
      pipeline,
      recordCount:       displayCount,
      results:           results.slice(0, 50), // cap payload
      agentTrace:        trace,
      plan: {
        steps:       plan.steps,
        collections: plan.relevantCollections,
        timeRange:   plan.timeRange,
      },
    });

  } catch (err) {
    console.error('[ask] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/insights (legacy compat) ────────────────────────────────────────

router.get('/insights', async (req, res) => {
  res.redirect(`/api/situations?${new URLSearchParams(req.query)}`);
});

// ── POST /api/waitlist ────────────────────────────────────────────────────────
//
// Saves a waitlist signup { email, pricing } to the waitlist_users collection.
// Returns 409 if the email is already registered.

router.post('/waitlist', async (req, res) => {
  const { email, pricing } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const entry = new WaitListUser({ email: email.trim().toLowerCase(), pricing });
    await entry.save();
    res.status(201).json({ message: 'Added to waitlist' });
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate email — still treat as success so users aren't confused
      return res.status(200).json({ message: 'Already on waitlist' });
    }
    console.error('[waitlist] Error:', err.message);
    res.status(500).json({ error: 'Failed to save. Please try again.' });
  }
});

export default router;

/**
 * InsightEngine — generates the SituationFeed dashboard cards.
 *
 * Each insight card is derived from real MongoDB queries against the
 * founder's database. Gemini Flash generates the narrative text only
 * (short, 1-2 sentence summaries). Heavy numeric work is done in MongoDB.
 *
 * Card shapes match exactly what SituationFeed.js components expect:
 *   mrr_estimate         → { mrrValue, planBreakdown, aiSummary }
 *   churn_this_month     → { thisMonth, lastMonth, trend, aiSummary }
 *   trial_conversion     → { rate, converted, trialsEnded, aiSummary }
 *   user_growth_28d      → { totalLast28d, totalPrior28d, trend, aiSummary }
 *   paid_growth_28d      → { totalLast28d, totalPrior28d, trend, aiSummary }
 *   plan_distribution    → { plans:[{plan,count,pct}], aiSummary }
 *   revenue_concentration → { concentrationPct, topAmounts, totalRevenue, aiSummary }
 *   signup_activation    → { rate, activated, signupsLast30, aiSummary }
 *   data_quality         → { issues:[{role,collection,field,nullPct}], aiSummary }
 *   stale_collections    → { collections:[{collection,documentCount,daysSinceLastWrite}], aiSummary }
 *   db_growth            → { growthData:[{role,collection,thisMonth,trend}], aiSummary }
 */

import { MongoClient, ObjectId } from 'mongodb';
import { callGemini } from '../llm/gemini.js';

const PII_RE = /email|phone|mobile|password|passwd|token|secret|hash|salt|address|firstname|lastname|fullname/i;

// ── MongoDB client ─────────────────────────────────────────────────────────────

function makeClient(uri) {
  return new MongoClient(uri, {
    readPreference:           'secondaryPreferred',
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS:         10000,
  });
}

function makeMinOid(date) {
  return new ObjectId(
    Math.floor(date.getTime() / 1000).toString(16).padStart(8, '0') + '0000000000000000',
  );
}

// ── Gemini Flash narrative helper ─────────────────────────────────────────────

async function generateNarrative(type, data) {
  const prompt = `You are a SaaS growth advisor. Write a 1-2 sentence actionable insight about this metric for a founder.
Metric type: ${type}
Data: ${JSON.stringify(data)}
Be specific, use the numbers, suggest one action. No fluff.
Return plain text (not JSON).`;

  try {
    return await callGemini(prompt, { useFlash: true, jsonMode: false, maxTokens: 150, tag: 'insight' });
  } catch (err) {
    console.error(`[InsightEngine] generateNarrative FAILED for type="${type}"`);
    console.error('  Error:', err.message);
    return null;
  }
}

// ── InsightEngine class ───────────────────────────────────────────────────────

export class InsightEngine {
  constructor(kg, mongoUri) {
    this.kg       = kg;
    this.mongoUri = mongoUri;
    this.client   = null;
    this.db       = null;
  }

  async connect() {
    this.client = makeClient(this.mongoUri);
    await this.client.connect();
    this.db = this.client.db();
  }

  async disconnect() {
    if (this.client) { await this.client.close(); this.client = null; }
  }

  /**
   * generateAll() → InsightCard[]
   *
   * Runs all insight builders and returns the cards that succeeded.
   * Failed builders are skipped silently to avoid blocking the feed.
   */
  async generateAll() {
    await this.connect();
    const cards = [];
    const builders = [
      this._mrrInsight.bind(this),
      this._churnInsight.bind(this),
      this._trialConversionInsight.bind(this),
      this._userGrowthInsight.bind(this),
      this._paidGrowthInsight.bind(this),
      this._planDistributionInsight.bind(this),
      this._revenueConcentrationInsight.bind(this),
      this._activationInsight.bind(this),
      this._dataQualityInsight.bind(this),
      this._staleCollectionsInsight.bind(this),
      this._dbGrowthInsight.bind(this),
    ];

    for (const builder of builders) {
      try {
        const card = await builder();
        if (card) cards.push(card);
      } catch (err) {
        console.warn('[InsightEngine] Builder failed:', err.message);
      }
    }

    await this.disconnect();
    return cards;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _collForRole(role) {
    const name = this.kg.collectionForRole(role);
    return name ? this.db.collection(name) : null;
  }

  _nodeForRole(role) {
    const name = this.kg.collectionForRole(role);
    return name ? this.kg.getNode(name) : null;
  }

  _findField(collName, ...patterns) {
    return this.kg.findField(collName, patterns.flat());
  }

  // ── MRR Estimate ──────────────────────────────────────────────────────────

  async _mrrInsight() {
    const node = this._nodeForRole('subscriptions');
    if (!node) return null;
    const coll = this.db.collection(node.name);

    const statusField = this._findField(node.name, ['status', 'subscriptionStatus', 'state']);
    const amountField = this._findField(node.name, ['amount', 'mrr', 'price', 'cost', 'monthlyAmount', 'value']);
    const planField   = this._findField(node.name, ['plan', 'planName', 'tier', 'level', 'product']);

    if (!amountField) return null;

    const match = statusField
      ? { [statusField]: { $in: ['active', 'ACTIVE', 'enabled', 'trialing'] } }
      : {};

    const [mrrResult, breakdown] = await Promise.all([
      coll.aggregate([
        { $match: match },
        { $group: { _id: null, total: { $sum: `$${amountField}` }, count: { $sum: 1 } } },
      ]).toArray(),

      planField
        ? coll.aggregate([
            { $match: match },
            { $group: { _id: `$${planField}`, count: { $sum: 1 }, revenue: { $sum: `$${amountField}` } } },
            { $sort: { revenue: -1 } },
            { $limit: 5 },
          ]).toArray()
        : Promise.resolve([]),
    ]);

    const raw   = mrrResult[0]?.total ?? 0;
    const count = mrrResult[0]?.count ?? 0;
    // Heuristic: if MRR looks like cents (> $10k and divisible by common cent values), normalise
    const mrr   = raw > 100000 ? Math.round(raw / 100) : raw;

    const planBreakdown = breakdown.map((p) => ({
      plan:    p._id ?? 'unknown',
      count:   p.count,
      revenue: p.revenue != null ? (p.revenue > 100000 ? Math.round(p.revenue / 100) : p.revenue) : null,
    }));

    const narrative = await generateNarrative('mrr_estimate', { mrr, paidAccounts: count, planBreakdown });

    return {
      type:          'mrr_estimate',
      title:         'MRR Estimate',
      mrrValue:      mrr,
      planBreakdown,
      aiSummary:     narrative ?? `${count} active accounts contributing ~$${mrr.toLocaleString()}/mo`,
    };
  }

  // ── Churn ─────────────────────────────────────────────────────────────────

  async _churnInsight() {
    const node = this._nodeForRole('subscriptions');
    if (!node) return null;
    const coll = this.db.collection(node.name);

    const statusField    = this._findField(node.name, ['status', 'subscriptionStatus', 'state']);
    const cancelledField = this._findField(node.name, ['cancelledAt', 'canceledAt', 'endedAt', 'deletedAt', 'updatedAt', 'updated_at']);

    if (!statusField) return null;

    const CANCELLED = ['cancelled', 'canceled', 'inactive', 'churned', 'deleted', 'CANCELLED'];
    const now             = new Date();
    const thisMonthStart  = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart  = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const dateFilter = cancelledField
      ? (start, end) => ({ [statusField]: { $in: CANCELLED }, [cancelledField]: { $gte: start, $lt: end } })
      : (start) => ({ [statusField]: { $in: CANCELLED }, _id: { $gte: makeMinOid(start) } });

    const [thisMonth, lastMonth] = await Promise.all([
      coll.countDocuments(dateFilter(thisMonthStart, now)),
      coll.countDocuments(dateFilter(lastMonthStart, thisMonthStart)),
    ]);

    const trend     = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null;
    const narrative = await generateNarrative('churn_this_month', { thisMonth, lastMonth, trend });

    return {
      type:      'churn_this_month',
      title:     'Churn This Month',
      thisMonth,
      lastMonth,
      trend,
      aiSummary: narrative ?? `${thisMonth} cancellations this month vs ${lastMonth} last month`,
    };
  }

  // ── Trial Conversion ───────────────────────────────────────────────────────

  async _trialConversionInsight() {
    const node = this._nodeForRole('subscriptions');
    if (!node) return null;
    const coll = this.db.collection(node.name);

    const trialField  = this._findField(node.name, ['trialEndsAt', 'trialEnd', 'trial_end', 'trialEndDate', 'trialExpiry']);
    const statusField = this._findField(node.name, ['status', 'subscriptionStatus']);

    if (!trialField) return null;

    const thirtyAgo = new Date(Date.now() - 30 * 86400000);
    const now       = new Date();

    const [trialsEnded, converted] = await Promise.all([
      coll.countDocuments({ [trialField]: { $gte: thirtyAgo, $lte: now } }),
      coll.countDocuments({
        [trialField]: { $gte: thirtyAgo, $lte: now },
        ...(statusField ? { [statusField]: { $in: ['active', 'paid', 'ACTIVE'] } } : {}),
      }),
    ]);

    if (trialsEnded === 0) return null;
    const rate      = Math.round((converted / trialsEnded) * 100);
    const narrative = await generateNarrative('trial_conversion', { trialsEnded, converted, rate });

    return {
      type:        'trial_conversion',
      title:       'Trial → Paid Conversion (30d)',
      rate,
      converted,
      trialsEnded,
      aiSummary:   narrative ?? `${converted} of ${trialsEnded} trials converted (${rate}%)`,
    };
  }

  // ── User Growth 28d ───────────────────────────────────────────────────────

  async _userGrowthInsight() {
    const node = this._nodeForRole('users');
    if (!node) return null;
    const coll = this.db.collection(node.name);

    const dateField = this._findField(node.name, ['createdAt', 'created_at', 'signedUpAt', 'registeredAt', 'joinedAt', 'signupAt']);

    const now   = new Date();
    const ago28 = new Date(Date.now() - 28 * 86400000);
    const ago56 = new Date(Date.now() - 56 * 86400000);

    const matchField = dateField
      ? (start, end) => ({ [dateField]: { $gte: start, $lt: end } })
      : (start) => ({ _id: { $gte: makeMinOid(start) } });

    const [totalLast28d, totalPrior28d] = await Promise.all([
      coll.countDocuments(matchField(ago28, now)),
      coll.countDocuments(matchField(ago56, ago28)),
    ]);

    const trend     = totalPrior28d > 0 ? Math.round(((totalLast28d - totalPrior28d) / totalPrior28d) * 100) : null;
    const narrative = await generateNarrative('user_growth_28d', { totalLast28d, totalPrior28d, trend });

    return {
      type:          'user_growth_28d',
      title:         'New Signups (28d)',
      totalLast28d,
      totalPrior28d,
      trend,
      aiSummary:     narrative ?? `${totalLast28d} new signups in the last 28 days`,
    };
  }

  // ── Paid Growth 28d ───────────────────────────────────────────────────────

  async _paidGrowthInsight() {
    const node = this._nodeForRole('subscriptions');
    if (!node) return null;
    const coll = this.db.collection(node.name);

    const dateField   = this._findField(node.name, ['createdAt', 'created_at', 'startDate', 'startedAt', 'activatedAt']);
    const statusField = this._findField(node.name, ['status', 'subscriptionStatus']);

    const now   = new Date();
    const ago28 = new Date(Date.now() - 28 * 86400000);
    const ago56 = new Date(Date.now() - 56 * 86400000);

    const baseFilter = statusField ? { [statusField]: { $in: ['active', 'paid', 'ACTIVE'] } } : {};

    const matchField = dateField
      ? (start, end) => ({ ...baseFilter, [dateField]: { $gte: start, $lt: end } })
      : (start) => ({ ...baseFilter, _id: { $gte: makeMinOid(start) } });

    const [totalLast28d, totalPrior28d] = await Promise.all([
      coll.countDocuments(matchField(ago28, now)),
      coll.countDocuments(matchField(ago56, ago28)),
    ]);

    const trend = totalPrior28d > 0 ? Math.round(((totalLast28d - totalPrior28d) / totalPrior28d) * 100) : null;

    return {
      type:          'paid_growth_28d',
      title:         'New Paid (28d)',
      totalLast28d,
      totalPrior28d,
      trend,
      aiSummary:     `${totalLast28d} new paid subscriptions in the last 28 days`,
    };
  }

  // ── Plan Distribution ─────────────────────────────────────────────────────

  async _planDistributionInsight() {
    const node = this._nodeForRole('subscriptions');
    if (!node) return null;
    const coll = this.db.collection(node.name);

    const planField   = this._findField(node.name, ['plan', 'planName', 'tier', 'product', 'level']);
    const statusField = this._findField(node.name, ['status', 'subscriptionStatus']);

    if (!planField) return null;

    const match = statusField ? { [statusField]: { $in: ['active', 'ACTIVE'] } } : {};

    const breakdown = await coll.aggregate([
      { $match: match },
      { $group: { _id: `$${planField}`, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]).toArray();

    if (breakdown.length === 0) return null;

    const total = breakdown.reduce((s, p) => s + p.count, 0);
    const plans = breakdown.map((p) => ({
      plan:  p._id ?? 'unknown',
      count: p.count,
      pct:   total > 0 ? Math.round((p.count / total) * 100) : 0,
    }));

    const narrative = await generateNarrative('plan_distribution', { plans });

    return {
      type:      'plan_distribution',
      title:     'Plan Distribution',
      plans,
      aiSummary: narrative ?? `Distribution across ${plans.length} plans`,
    };
  }

  // ── Revenue Concentration ─────────────────────────────────────────────────

  async _revenueConcentrationInsight() {
    const node = this._nodeForRole('subscriptions');
    if (!node) return null;
    const coll = this.db.collection(node.name);

    const amountField = this._findField(node.name, ['amount', 'mrr', 'price', 'monthlyAmount', 'value']);
    const statusField = this._findField(node.name, ['status', 'subscriptionStatus']);
    const userField   = this._findField(node.name, ['userId', 'user_id', 'accountId', 'customerId']);

    if (!amountField || !userField) return null;

    const match = statusField ? { [statusField]: { $in: ['active', 'ACTIVE'] } } : {};

    const [top5, totalResult] = await Promise.all([
      coll.aggregate([
        { $match: { ...match, [amountField]: { $gt: 0 } } },
        { $sort: { [amountField]: -1 } },
        { $limit: 5 },
        { $project: { _id: 0, amount: `$${amountField}` } },
      ]).toArray(),

      coll.aggregate([
        { $match: match },
        { $group: { _id: null, total: { $sum: `$${amountField}` } } },
      ]).toArray(),
    ]);

    const totalRevenue    = totalResult[0]?.total ?? 0;
    const top5Total       = top5.reduce((s, r) => s + (r.amount ?? 0), 0);
    const concentrationPct = totalRevenue > 0 ? Math.round((top5Total / totalRevenue) * 100) : 0;
    const topAmounts      = top5.map((r) => r.amount ?? 0);

    const narrative = await generateNarrative('revenue_concentration', { concentrationPct, topAmounts, totalRevenue });

    return {
      type:             'revenue_concentration',
      title:            'Revenue Concentration',
      concentrationPct,
      topAmounts,
      totalRevenue,
      aiSummary:        narrative ?? `Top 5 customers represent ${concentrationPct}% of total revenue`,
    };
  }

  // ── Activation Rate ───────────────────────────────────────────────────────

  async _activationInsight() {
    const node = this._nodeForRole('users');
    if (!node) return null;
    const coll = this.db.collection(node.name);

    const signupField   = this._findField(node.name, ['createdAt', 'created_at', 'signedUpAt', 'registeredAt']);
    const activityField = this._findField(node.name, ['lastSeenAt', 'lastActive', 'lastActivityAt', 'updatedAt', 'lastLoginAt']);

    if (!signupField || !activityField) return null;

    const thirtyAgo = new Date(Date.now() - 30 * 86400000);
    const dayMs     = 86400000;

    const [signupsLast30, activated] = await Promise.all([
      coll.countDocuments({ [signupField]: { $gte: thirtyAgo } }),
      coll.countDocuments({
        [signupField]: { $gte: thirtyAgo },
        $expr: { $gt: [
          { $subtract: [`$${activityField}`, `$${signupField}`] },
          dayMs,
        ]},
      }),
    ]);

    const rate      = signupsLast30 > 0 ? Math.round((activated / signupsLast30) * 100) : null;
    const narrative = await generateNarrative('signup_activation', { signupsLast30, activated, rate });

    return {
      type:          'signup_activation',
      title:         'Activation Rate (returned 24h+)',
      rate:          rate ?? 0,
      activated,
      signupsLast30,
      aiSummary:     narrative ?? `${rate ?? '?'}% of last 30d signups returned within 24h`,
    };
  }

  // ── Data Quality ───────────────────────────────────────────────────────────

  async _dataQualityInsight() {
    const issues   = [];
    const CRITICAL = ['status', 'plan', 'userId', 'user_id', 'createdAt', 'created_at', 'subscriptionStatus'];

    for (const node of this.kg.getNodes()) {
      if (node.docCount < 10) continue;
      const coll = this.db.collection(node.name);

      for (const fname of CRITICAL) {
        if (!node.fields?.[fname]) continue;
        try {
          const nullCount = await coll.countDocuments({ [fname]: { $in: [null, ''] } });
          const pct       = Math.round((nullCount / node.docCount) * 100);
          if (pct > 15) {
            issues.push({ role: node.role ?? 'other', collection: node.name, field: fname, nullPct: pct });
          }
        } catch { /* skip */ }
      }
    }

    if (issues.length === 0) return null;

    const narrative = await generateNarrative('data_quality', { issueCount: issues.length, issues: issues.slice(0, 5) });

    return {
      type:      'data_quality',
      title:     'Data Quality Issues',
      issues,
      aiSummary: narrative ?? `${issues.length} critical fields have >15% null values`,
    };
  }

  // ── Stale Collections ─────────────────────────────────────────────────────

  async _staleCollectionsInsight() {
    const thirtyAgo = makeMinOid(new Date(Date.now() - 30 * 86400000));
    const result    = [];

    for (const node of this.kg.getNodes()) {
      if (node.velocity === 'empty') continue;
      const coll = this.db.collection(node.name);
      try {
        const recent = await coll.countDocuments({ _id: { $gt: thirtyAgo } });
        if (recent === 0 && node.docCount > 50) {
          // Find the actual last write via the latest _id
          const lastDoc = await coll.find({}).sort({ _id: -1 }).limit(1).project({ _id: 1 }).toArray();
          const lastTs  = lastDoc[0]?._id?.getTimestamp?.() ?? null;
          const daysSinceLastWrite = lastTs
            ? Math.round((Date.now() - lastTs.getTime()) / 86400000)
            : null;
          result.push({ collection: node.name, documentCount: node.docCount, daysSinceLastWrite });
        }
      } catch { /* skip */ }
    }

    if (result.length === 0) return null;

    const narrative = await generateNarrative('stale_collections', { count: result.length, collections: result.map((c) => c.collection) });

    return {
      type:        'stale_collections',
      title:       'Stale Collections',
      collections: result,
      aiSummary:   narrative ?? `${result.length} collections have had no new documents in 30+ days`,
    };
  }

  // ── DB Growth ─────────────────────────────────────────────────────────────

  async _dbGrowthInsight() {
    const now       = new Date();
    const thisStart = makeMinOid(new Date(now.getFullYear(), now.getMonth(), 1));
    const lastStart = makeMinOid(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const growthData = [];

    for (const node of this.kg.getNodes()) {
      if (node.velocity === 'empty' || node.velocity === 'low') continue;
      const coll = this.db.collection(node.name);
      try {
        const [thisMonth, lastMonth] = await Promise.all([
          coll.countDocuments({ _id: { $gte: thisStart } }),
          coll.countDocuments({ _id: { $gte: lastStart, $lt: thisStart } }),
        ]);
        if (lastMonth > 0) {
          const trend = Math.round(((thisMonth - lastMonth) / lastMonth) * 100);
          growthData.push({ role: node.role ?? 'other', collection: node.name, thisMonth, trend });
        }
      } catch { /* skip */ }
    }

    if (growthData.length === 0) return null;
    growthData.sort((a, b) => Math.abs(b.trend) - Math.abs(a.trend));

    const narrative = await generateNarrative('db_growth', { topCollections: growthData.slice(0, 3) });

    return {
      type:       'db_growth',
      title:      'Database Growth (MoM)',
      growthData,
      aiSummary:  narrative ?? `Month-over-month growth across ${growthData.length} active collections`,
    };
  }
}

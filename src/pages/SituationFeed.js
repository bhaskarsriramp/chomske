import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  IconButton,
  LinearProgress,
  Paper,
  Skeleton,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import { getInsights } from '../services/api';

// ─── Shared primitives ────────────────────────────────────────────────────────

function AiSummary({ text }) {
  return (
    <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, px: 2, py: 1.5, mt: 0.5 }}>
      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 0.25 }}>
        AI analysis
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
        {text}
      </Typography>
    </Box>
  );
}

function TrendChip({ trend, invertColor }) {
  if (trend === null || trend === undefined) return null;
  const zero = trend === 0;
  // invertColor=true means up is bad (e.g. churn)
  const positive = invertColor ? trend < 0 : trend > 0;
  const negative = invertColor ? trend > 0 : trend < 0;
  return (
    <Chip
      icon={zero ? <TrendingFlatIcon fontSize="small" /> : trend > 0 ? <TrendingUpIcon fontSize="small" /> : <TrendingDownIcon fontSize="small" />}
      label={`${trend > 0 ? '+' : ''}${trend}% vs prior`}
      size="small"
      sx={{
        bgcolor: zero ? 'action.hover' : positive ? '#1b5e2022' : negative ? '#b71c1c22' : 'action.hover',
        color: zero ? 'text.secondary' : positive ? '#66bb6a' : negative ? '#ef5350' : 'text.secondary',
        fontWeight: 600, fontSize: '0.72rem',
      }}
    />
  );
}

function CardShell({ children, accent = '#555' }) {
  return (
    <Paper elevation={2} sx={{ borderLeft: `4px solid ${accent}`, p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {children}
    </Paper>
  );
}

function CardTitle({ icon, title, badge }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
      {icon}
      <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>
        {title}
      </Typography>
      {badge}
    </Box>
  );
}

function BigStat({ value, label, accent }) {
  return (
    <Box>
      <Typography variant="h3" fontWeight={800} sx={{ lineHeight: 1, color: accent }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.disabled">{label}</Typography>
    </Box>
  );
}

// ─── Card: Churn This Month ───────────────────────────────────────────────────

function ChurnCard({ insight }) {
  const accent = insight.thisMonth > insight.lastMonth ? '#f44336' : '#4caf50';
  return (
    <CardShell accent={accent}>
      <CardTitle title={insight.title} />
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, flexWrap: 'wrap' }}>
        <BigStat value={insight.thisMonth} label="cancellations this month" accent={accent} />
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <TrendChip trend={insight.trend} invertColor />
          {insight.lastMonth > 0 && (
            <Typography variant="caption" color="text.disabled">
              {insight.lastMonth} last month
            </Typography>
          )}
        </Box>
      </Box>
      <AiSummary text={insight.aiSummary} />
    </CardShell>
  );
}

// ─── Card: MRR Estimate ───────────────────────────────────────────────────────

function MrrCard({ insight }) {
  const accent = '#4caf50';
  const hasMrr = insight.mrrValue !== null;
  return (
    <CardShell accent={accent}>
      <CardTitle title={insight.title} />
      {hasMrr && (
        <BigStat value={insight.mrrValue.toLocaleString()} label="total active subscriptions value (raw units)" accent={accent} />
      )}
      {insight.planBreakdown.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {insight.planBreakdown.map((p, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.5, px: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
              <Typography variant="caption" fontWeight={600} color="text.primary" sx={{ minWidth: 80 }}>
                {p.plan || 'unknown'}
              </Typography>
              <Typography variant="caption" color="text.disabled">{p.count} users</Typography>
              {p.revenue !== null && (
                <Typography variant="caption" color="success.main" sx={{ ml: 'auto', fontWeight: 600 }}>
                  {p.revenue.toLocaleString()}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      )}
      <AiSummary text={insight.aiSummary} />
    </CardShell>
  );
}

// ─── Card: Trial → Paid Conversion ───────────────────────────────────────────

function TrialConversionCard({ insight }) {
  const good = insight.rate >= 20;
  const accent = good ? '#4caf50' : insight.rate >= 10 ? '#ff9800' : '#f44336';
  return (
    <CardShell accent={accent}>
      <CardTitle title={insight.title} />
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, flexWrap: 'wrap' }}>
        <BigStat value={`${insight.rate}%`} label="conversion rate" accent={accent} />
        <Typography variant="caption" color="text.disabled">
          {insight.converted} of {insight.trialsEnded} trials converted
        </Typography>
      </Box>
      <AiSummary text={insight.aiSummary} />
    </CardShell>
  );
}

// ─── Card: Revenue Concentration ─────────────────────────────────────────────

function RevenueConcentrationCard({ insight }) {
  const risky = insight.concentrationPct >= 50;
  const accent = risky ? '#f44336' : '#ff9800';
  return (
    <CardShell accent={accent}>
      <CardTitle
        title={insight.title}
        badge={
          <Chip
            label={risky ? 'high risk' : 'moderate'}
            size="small"
            sx={{ bgcolor: `${accent}22`, color: accent, fontWeight: 700, fontSize: '0.65rem' }}
          />
        }
      />
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, flexWrap: 'wrap' }}>
        <BigStat value={`${insight.concentrationPct}%`} label="of revenue from top 5 customers" accent={accent} />
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
        {insight.topAmounts.map((amt, i) => (
          <Chip key={i} label={amt.toLocaleString()} size="small" variant="outlined" sx={{ fontFamily: 'monospace', fontSize: '0.72rem' }} />
        ))}
        <Typography variant="caption" color="text.disabled" sx={{ alignSelf: 'center', ml: 0.5 }}>
          of {insight.totalRevenue.toLocaleString()} total
        </Typography>
      </Box>
      <AiSummary text={insight.aiSummary} />
    </CardShell>
  );
}

// ─── Card: Data Quality ───────────────────────────────────────────────────────

function DataQualityCard({ insight }) {
  const accent = '#ff9800';
  return (
    <CardShell accent={accent}>
      <CardTitle
        title={insight.title}
        icon={<WarningAmberIcon sx={{ color: accent, fontSize: 20 }} />}
      />
      <AiSummary text={insight.aiSummary} />
      <Divider sx={{ opacity: 0.3 }} />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {insight.issues.map((issue, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.5, px: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
            <Typography variant="caption" color="text.disabled" sx={{ minWidth: 90, textTransform: 'capitalize' }}>{issue.role}</Typography>
            <Typography variant="caption" fontFamily="monospace" color="text.primary" fontWeight={600}>{issue.collection}</Typography>
            <Typography variant="caption" color="text.disabled">·</Typography>
            <Typography variant="caption" fontFamily="monospace" color="warning.main">{issue.field}</Typography>
            <Chip label={`${issue.nullPct}% null`} size="small" sx={{ ml: 'auto', fontSize: '0.6rem', height: 18, bgcolor: '#ff980022', color: '#ff9800' }} />
          </Box>
        ))}
      </Box>
    </CardShell>
  );
}

// ─── Card: Missing Indexes ────────────────────────────────────────────────────

function MissingIndexesCard({ insight }) {
  const accent = insight.severity === 'high' ? '#f44336' : '#ff9800';
  return (
    <CardShell accent={accent}>
      <CardTitle
        title={insight.title}
        icon={<WarningAmberIcon sx={{ color: accent, fontSize: 20 }} />}
        badge={
          <Chip label={insight.severity} size="small"
            sx={{ bgcolor: `${accent}22`, color: accent, fontWeight: 700, textTransform: 'capitalize', fontSize: '0.65rem', ml: 'auto' }} />
        }
      />
      <AiSummary text={insight.aiSummary} />
      <Divider sx={{ opacity: 0.3 }} />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {insight.issues.map((issue, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.5, px: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
            <Typography variant="caption" color="text.disabled" sx={{ minWidth: 90, textTransform: 'capitalize' }}>{issue.role}</Typography>
            <Typography variant="caption" fontFamily="monospace" color="text.primary" fontWeight={600}>{issue.collection}</Typography>
            <Typography variant="caption" color="text.disabled">·</Typography>
            <Typography variant="caption" fontFamily="monospace" color="warning.main">{issue.field}</Typography>
            <Chip label={issue.type} size="small" variant="outlined" sx={{ ml: 'auto', fontSize: '0.6rem', height: 18 }} />
          </Box>
        ))}
      </Box>
    </CardShell>
  );
}

// ─── Card: Signup Activation ──────────────────────────────────────────────────

function ActivationCard({ insight }) {
  const good = insight.rate >= 40;
  const accent = good ? '#4caf50' : insight.rate >= 20 ? '#ff9800' : '#f44336';
  return (
    <CardShell accent={accent}>
      <CardTitle title={insight.title} />
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, flexWrap: 'wrap' }}>
        <BigStat value={`${insight.rate}%`} label="activation rate" accent={accent} />
        <Typography variant="caption" color="text.disabled">
          {insight.activated} of {insight.signupsLast30} new users returned after 24h
        </Typography>
      </Box>
      <AiSummary text={insight.aiSummary} />
    </CardShell>
  );
}

// ─── Card: User / Paid Growth (shared) ───────────────────────────────────────

function GrowthCard({ insight }) {
  const isPaid = insight.type === 'paid_growth_28d';
  const accent = isPaid ? '#6C63FF' : '#29b6f6';
  return (
    <CardShell accent={accent}>
      <CardTitle title={insight.title} />
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, flexWrap: 'wrap' }}>
        <BigStat value={insight.totalLast28d.toLocaleString()} label={isPaid ? 'new paid users' : 'new signups'} accent={accent} />
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <TrendChip trend={insight.trend} />
          {insight.totalPrior28d > 0 && (
            <Typography variant="caption" color="text.disabled">
              {insight.totalPrior28d.toLocaleString()} in prior 28d
            </Typography>
          )}
        </Box>
      </Box>
      <AiSummary text={insight.aiSummary} />
    </CardShell>
  );
}

// ─── Card: Plan Distribution ──────────────────────────────────────────────────

function PlanDistributionCard({ insight }) {
  const accent = '#9c27b0';
  const max = Math.max(...insight.plans.map((p) => p.count));
  return (
    <CardShell accent={accent}>
      <CardTitle title={insight.title} />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {insight.plans.map((p, i) => (
          <Box key={i}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" fontWeight={600}>{p.plan || 'unknown'}</Typography>
              <Typography variant="caption" color="text.disabled">{p.count} · {p.pct}%</Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={(p.count / max) * 100}
              sx={{ height: 6, borderRadius: 3, bgcolor: 'action.hover', '& .MuiLinearProgress-bar': { bgcolor: accent, borderRadius: 3 } }}
            />
          </Box>
        ))}
      </Box>
      <AiSummary text={insight.aiSummary} />
    </CardShell>
  );
}

// ─── Card: Stale Collections ──────────────────────────────────────────────────

function StaleCollectionsCard({ insight }) {
  const accent = '#607d8b';
  return (
    <CardShell accent={accent}>
      <CardTitle title={insight.title} icon={<WarningAmberIcon sx={{ color: accent, fontSize: 20 }} />} />
      <AiSummary text={insight.aiSummary} />
      <Divider sx={{ opacity: 0.3 }} />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {insight.collections.map((c, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.5, px: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
            <Typography variant="caption" fontFamily="monospace" fontWeight={600} color="text.primary">{c.collection}</Typography>
            <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto' }}>
              {c.documentCount.toLocaleString()} docs
            </Typography>
            <Chip label={`${c.daysSinceLastWrite}d ago`} size="small" sx={{ fontSize: '0.6rem', height: 18, bgcolor: '#607d8b22', color: '#90a4ae' }} />
          </Box>
        ))}
      </Box>
    </CardShell>
  );
}

// ─── Card: DB Growth MoM ─────────────────────────────────────────────────────

function DbGrowthCard({ insight }) {
  const accent = '#26a69a';
  return (
    <CardShell accent={accent}>
      <CardTitle title={insight.title} />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {insight.growthData.map((row, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.5, px: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
            <Typography variant="caption" color="text.disabled" sx={{ minWidth: 90, textTransform: 'capitalize' }}>{row.role}</Typography>
            <Typography variant="caption" fontFamily="monospace" fontWeight={600} color="text.primary">{row.collection}</Typography>
            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" color="text.disabled">{row.thisMonth} this mo.</Typography>
              {row.trend !== null && <TrendChip trend={row.trend} />}
            </Box>
          </Box>
        ))}
      </Box>
      <AiSummary text={insight.aiSummary} />
    </CardShell>
  );
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <Paper elevation={2} sx={{ borderLeft: '4px solid #333', p: 3 }}>
      <Skeleton variant="text" width="45%" height={28} sx={{ mb: 1.5 }} />
      <Skeleton variant="rounded" width="100%" height={60} sx={{ mb: 2 }} />
      <Skeleton variant="text" width="70%" />
      <Skeleton variant="text" width="55%" sx={{ mt: 0.75 }} />
    </Paper>
  );
}

// ─── Insight card router ──────────────────────────────────────────────────────

function InsightCard({ insight }) {
  switch (insight.type) {
    case 'churn_this_month':      return <ChurnCard insight={insight} />;
    case 'mrr_estimate':          return <MrrCard insight={insight} />;
    case 'trial_conversion':      return <TrialConversionCard insight={insight} />;
    case 'revenue_concentration': return <RevenueConcentrationCard insight={insight} />;
    case 'data_quality':          return <DataQualityCard insight={insight} />;
    case 'missing_indexes':       return <MissingIndexesCard insight={insight} />;
    case 'signup_activation':     return <ActivationCard insight={insight} />;
    case 'user_growth_28d':       return <GrowthCard insight={insight} />;
    case 'paid_growth_28d':       return <GrowthCard insight={insight} />;
    case 'plan_distribution':     return <PlanDistributionCard insight={insight} />;
    case 'stale_collections':     return <StaleCollectionsCard insight={insight} />;
    case 'db_growth':             return <DbGrowthCard insight={insight} />;
    default:                      return null;
  }
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SituationFeed() {
  const navigate = useNavigate();
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const sessionId = localStorage.getItem('mh_session_id');
  const productSummary = localStorage.getItem('mh_product_summary') || '';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await getInsights(sessionId);
      setInsights(data.insights || []);
    } catch (err) {
      if (err.response?.status === 404) {
        setError('Session expired. Please reconnect your database.');
      } else {
        setError(err.response?.data?.error || err.message || 'Failed to load insights.');
      }
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) { navigate('/'); return; }
    load();
  }, [sessionId, navigate, load]);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <Container maxWidth="md" sx={{ mt: 6, mb: 8 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 4 }}>
        <Box>
          <Typography variant="h4" fontWeight={700} gutterBottom>What&apos;s Happening</Typography>
          <Typography color="text.secondary">{today}</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<QuestionAnswerIcon />}
            onClick={() => navigate('/ask')}
            sx={{ fontWeight: 600, borderRadius: 2 }}
          >
            Ask
          </Button>
          {!loading && (
            <Tooltip title="Refresh">
              <IconButton onClick={load}><RefreshIcon /></IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {productSummary && (
        <Paper elevation={0} sx={{ p: 2, mb: 3, bgcolor: 'action.hover', borderRadius: 2, borderLeft: '4px solid', borderColor: 'primary.main' }}>
          <Typography variant="caption" color="primary" fontWeight={700} sx={{ display: 'block', mb: 0.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Your Product
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
            {productSummary}
          </Typography>
        </Paper>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}
          action={
            error.includes('reconnect')
              ? <Button color="inherit" size="small" onClick={() => navigate('/')}>Reconnect</Button>
              : <Button color="inherit" size="small" onClick={load}>Retry</Button>
          }
        >{error}</Alert>
      )}

      {loading && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
            <CircularProgress size={16} />
            <Typography variant="body2" color="text.secondary">Analyzing your database…</Typography>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </Box>
        </>
      )}

      {!loading && insights.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {insights.map((insight, i) => <InsightCard key={insight.type ?? i} insight={insight} />)}
        </Box>
      )}

      {!loading && !error && insights.length === 0 && (
        <Box sx={{ textAlign: 'center', mt: 8 }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>No insights available yet</Typography>
          <Typography variant="body2" color="text.disabled">
            Make sure your collection mappings are correct and your database has recent data.
          </Typography>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={load} sx={{ mt: 3 }}>Refresh</Button>
        </Box>
      )}
    </Container>
  );
}

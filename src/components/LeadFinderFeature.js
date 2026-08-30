import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Container, Chip, Grid, Paper, Stack, Avatar } from "@mui/material";
import WebhookIcon from '@mui/icons-material/Webhook';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import BoltIcon from '@mui/icons-material/Bolt';
import Navbar from './Navbar';
import Footer from './Footer';
import { Helmet } from "react-helmet";

const INTEGRATIONS = [
  {
    name: "Stripe",
    category: "Payments",
    desc: "Payment failed, subscription cancelled, chargeback created, new customer — all on WhatsApp.",
    color: "#635BFF",
    events: ["payment_intent.payment_failed", "customer.subscription.deleted", "charge.dispute.created"],
  },
  {
    name: "Vercel",
    category: "Deployments",
    desc: "Deployment failed, build errors, domain issues — know before your users tweet at you.",
    color: "#000000",
    events: ["deployment.error", "deployment.canceled", "domain.configuration_error"],
  },
  {
    name: "Sentry",
    category: "Error Monitoring",
    desc: "New issues, regression alerts, and error spike notifications sent directly to your WhatsApp.",
    color: "#362D59",
    events: ["issue.created", "issue.regression", "metric_alert.critical"],
  },
  {
    name: "GitHub",
    category: "Code & CI",
    desc: "Failed CI runs, workflow errors, and security vulnerability alerts when they matter most.",
    color: "#24292E",
    events: ["workflow_run.failed", "check_run.failure", "security_advisory"],
  },
  {
    name: "PagerDuty",
    category: "Incident Management",
    desc: "Route PagerDuty incidents to WhatsApp for instant acknowledgement without opening another app.",
    color: "#06AC38",
    events: ["incident.trigger", "incident.escalate", "incident.resolve"],
  },
  {
    name: "Grafana",
    category: "Observability",
    desc: "Alert manager webhooks from Grafana — CPU spikes, latency breaches, disk space warnings.",
    color: "#F46800",
    events: ["alerting.state_change", "alerting.firing", "alerting.no_data"],
  },
  {
    name: "Any Custom Service",
    category: "Your Own Code",
    desc: "Fire a POST request from your own backend. Works with any language, any framework, any event.",
    color: "#25D366",
    events: ["POST /your-webhook-url", "JSON body", "Any trigger you define"],
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Generate a webhook URL",
    desc: "Create a webhook endpoint in your MyHandle dashboard. Takes 10 seconds.",
    color: "#25D366",
  },
  {
    step: "02",
    title: "Paste it into your tool",
    desc: "Go to Stripe, Vercel, Sentry, or wherever — paste your URL into their webhook settings.",
    color: "#60A5FA",
  },
  {
    step: "03",
    title: "Get WhatsApp alerts",
    desc: "The moment an event fires, you get a formatted WhatsApp message on your phone.",
    color: "#A78BFA",
  },
];

const IntegrationCard = ({ item }) => (
  <Paper sx={{
    p: { xs: 3, md: 4 },
    borderRadius: '20px',
    bgcolor: '#0F172A',
    border: '1px solid rgba(255,255,255,0.07)',
    height: '100%',
    display: 'flex', flexDirection: 'column',
    transition: 'all 0.25s ease',
    fontFamily: "'Inter', sans-serif",
    '&:hover': {
      borderColor: `${item.color}60`,
      transform: 'translateY(-4px)',
      boxShadow: `0 16px 40px -12px ${item.color}30`,
    }
  }}>
    <Stack direction="row" alignItems="center" spacing={2} mb={2}>
      <Box sx={{
        width: 44, height: 44, borderRadius: '12px',
        bgcolor: `${item.color}20`,
        border: `1px solid ${item.color}40`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <WebhookIcon sx={{ color: item.color, fontSize: 22 }} />
      </Box>
      <Box>
        <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '1rem', fontFamily: 'inherit' }}>
          {item.name}
        </Typography>
        <Chip
          label={item.category}
          size="small"
          sx={{
            bgcolor: `${item.color}15`, color: item.color,
            fontWeight: 700, fontSize: '0.65rem', height: 20,
            fontFamily: 'inherit',
          }}
        />
      </Box>
    </Stack>

    <Typography sx={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.9rem', lineHeight: 1.6, mb: 3, flex: 1, fontFamily: 'inherit' }}>
      {item.desc}
    </Typography>

    <Stack spacing={0.75}>
      {item.events.map((e, i) => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: item.color, flexShrink: 0 }} />
          <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', fontFamily: 'monospace' }}>
            {e}
          </Typography>
        </Box>
      ))}
    </Stack>
  </Paper>
);

export default function LeadFinderFeature() {
  const navigate = useNavigate();

  return (
    <>
      <Helmet>
        <title>Integrations | MyHandle</title>
        <meta name="description" content="Connect Stripe, Vercel, Sentry, GitHub, PagerDuty, Grafana, and any custom webhook to WhatsApp alerts. No API required. Live in 5 minutes." />
      </Helmet>

      <Navbar />

      <Box sx={{ bgcolor: '#020617', minHeight: '100vh', fontFamily: "'Inter', sans-serif", overflowX: 'hidden' }}>

        {/* Hero */}
        <Container maxWidth="lg" sx={{ pt: { xs: 14, md: 20 }, pb: { xs: 8, md: 12 }, textAlign: 'center' }}>
          <Chip
            label="INTEGRATIONS"
            sx={{ bgcolor: 'rgba(37,211,102,0.1)', color: '#25D366', fontWeight: 800, mb: 3, fontFamily: 'inherit', border: '1px solid rgba(37,211,102,0.2)' }}
          />
          <Typography variant="h1" sx={{
            fontWeight: 900, color: '#F8FAFC',
            fontSize: { xs: '2.4rem', md: '4.2rem' },
            letterSpacing: '-0.04em', lineHeight: 1.1, mb: 3, fontFamily: 'inherit'
          }}>
            Works with the tools<br />
            <Box component="span" sx={{ color: '#25D366' }}>you already use.</Box>
          </Typography>
          <Typography sx={{
            color: '#64748B', fontSize: { xs: '1rem', md: '1.25rem' },
            maxWidth: 580, mx: 'auto', lineHeight: 1.7, fontFamily: 'inherit'
          }}>
            If it has a webhook, MyHandle can alert you on WhatsApp. No API keys, no OAuth flows, no SDK. Just paste a URL.
          </Typography>
        </Container>

        {/* How it works */}
        <Box sx={{ bgcolor: '#0B1120', py: { xs: 8, md: 12 }, borderTop: '1px solid #1E293B', borderBottom: '1px solid #1E293B' }}>
          <Container maxWidth="lg">
            <Typography sx={{
              textAlign: 'center', fontWeight: 800, color: '#fff',
              fontSize: { xs: '1.8rem', md: '2.6rem' }, letterSpacing: '-0.03em', mb: 2, fontFamily: 'inherit'
            }}>
              How it works
            </Typography>
            <Typography sx={{ textAlign: 'center', color: '#64748B', mb: { xs: 6, md: 10 }, fontSize: '1rem', fontFamily: 'inherit' }}>
              Three steps. Less than five minutes.
            </Typography>

            <Grid container spacing={4} alignItems="stretch">
              {HOW_IT_WORKS.map((step, i) => (
                <Grid size={{ xs: 12, md: 4 }} key={i}>
                  <Box sx={{
                    p: 4, borderRadius: '20px',
                    bgcolor: '#0F172A', border: '1px solid #1E293B',
                    height: '100%', position: 'relative', overflow: 'hidden',
                    fontFamily: 'inherit',
                  }}>
                    <Typography sx={{
                      position: 'absolute', top: -10, right: 16,
                      fontSize: '7rem', fontWeight: 900, color: '#fff', opacity: 0.03,
                      lineHeight: 1, fontFamily: 'inherit',
                    }}>
                      {step.step}
                    </Typography>
                    <Box sx={{
                      width: 48, height: 48, borderRadius: '14px',
                      bgcolor: `${step.color}15`, border: `1px solid ${step.color}30`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3
                    }}>
                      {i === 0 && <WebhookIcon sx={{ color: step.color, fontSize: 24 }} />}
                      {i === 1 && <BoltIcon sx={{ color: step.color, fontSize: 24 }} />}
                      {i === 2 && <WhatsAppIcon sx={{ color: step.color, fontSize: 24 }} />}
                    </Box>
                    <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: '1.15rem', mb: 1.5, fontFamily: 'inherit' }}>
                      {step.title}
                    </Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.65, fontSize: '0.95rem', fontFamily: 'inherit' }}>
                      {step.desc}
                    </Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* Integration cards */}
        <Container maxWidth="lg" sx={{ py: { xs: 8, md: 14 } }}>
          <Typography sx={{
            textAlign: 'center', fontWeight: 800, color: '#fff',
            fontSize: { xs: '1.8rem', md: '2.6rem' }, letterSpacing: '-0.03em', mb: 2, fontFamily: 'inherit'
          }}>
            Supported integrations
          </Typography>
          <Typography sx={{ textAlign: 'center', color: '#64748B', mb: { xs: 6, md: 10 }, fontSize: '1rem', fontFamily: 'inherit' }}>
            Works with any service that sends HTTP POST webhooks.
          </Typography>

          <Grid container spacing={3}>
            {INTEGRATIONS.map((item, i) => (
              <Grid size={{ xs: 12, sm: 6, lg: 4 }} key={i}>
                <IntegrationCard item={item} />
              </Grid>
            ))}
          </Grid>
        </Container>

        {/* No API callout */}
        <Box sx={{ bgcolor: '#0B1120', py: { xs: 8, md: 10 }, borderTop: '1px solid #1E293B' }}>
          <Container maxWidth="md" sx={{ textAlign: 'center' }}>
            <Box sx={{
              display: 'inline-flex', alignItems: 'center', gap: 1.5,
              bgcolor: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.2)',
              borderRadius: 50, px: 3, py: 1, mb: 4
            }}>
              <CheckCircleIcon sx={{ color: '#25D366', fontSize: 18 }} />
              <Typography sx={{ color: '#25D366', fontWeight: 700, fontSize: '0.85rem', fontFamily: 'inherit' }}>
                No WhatsApp Business API required
              </Typography>
            </Box>
            <Typography variant="h3" sx={{
              color: '#F8FAFC', fontWeight: 900,
              fontSize: { xs: '1.8rem', md: '2.8rem' },
              letterSpacing: '-0.03em', mb: 2, fontFamily: 'inherit'
            }}>
              Most tools need weeks of setup.<br />
              <Box component="span" sx={{ color: '#25D366' }}>MyHandle needs 5 minutes.</Box>
            </Typography>
            <Typography sx={{ color: '#64748B', fontSize: '1.1rem', mb: 5, lineHeight: 1.7, fontFamily: 'inherit' }}>
              No Meta Business approval. No verified number. No API keys to manage. Just your personal WhatsApp and one webhook URL.
            </Typography>
            <Box
              component="button"
              onClick={() => navigate("/professional/login")}
              sx={{
                background: '#25D366', color: '#fff', border: 'none',
                py: 2, px: 6, borderRadius: '50px', fontSize: '1.1rem', fontWeight: 700,
                fontFamily: "'Inter', sans-serif", cursor: 'pointer', transition: '0.2s',
                boxShadow: '0 10px 30px -10px rgba(37,211,102,0.5)',
                '&:hover': { background: '#1ebe5a', transform: 'scale(1.05)' }
              }}
            >
              Get Your Webhook URL →
            </Box>
          </Container>
        </Box>

      </Box>

      <Footer />
    </>
  );
}

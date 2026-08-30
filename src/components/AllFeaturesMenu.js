import React from 'react';
import { Box, Typography, Container, Chip, Grid } from "@mui/material";
import WebhookOutlinedIcon from "@mui/icons-material/WebhookOutlined";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import PriorityHighOutlinedIcon from "@mui/icons-material/PriorityHighOutlined";
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import FlashOnOutlinedIcon from "@mui/icons-material/FlashOnOutlined";
import Navbar from './Navbar';
import Footer from './Footer';
import { Helmet } from "react-helmet";
import { useNavigate } from "react-router-dom";

const categories = [
  {
    id: "01",
    title: "Alert Delivery",
    subtitle: "Get notified on WhatsApp before your users even notice something is wrong.",
    bgColor: "#021c0f",
    bgGradient: "linear-gradient(180deg, #021c0f 0%, #0F172A 100%)",
    accentColor: "#25D366",
    glowColor: "rgba(37, 211, 102, 0.12)",
    features: [
      { title: "WhatsApp Delivery", desc: "Receive alerts directly on your personal WhatsApp — no Meta API, no business number required.", icon: <NotificationsActiveOutlinedIcon />, color: "#25D366" },
      { title: "Unlimited Webhooks", desc: "Connect as many webhook sources as you need. One per service, or one per environment — no cap.", icon: <WebhookOutlinedIcon />, color: "#34D399" },
      { title: "5-Minute Setup", desc: "Generate a webhook URL, paste it into your tool, and receive your first alert before your coffee gets cold.", icon: <FlashOnOutlinedIcon />, color: "#FCD34D" },
      { title: "P0 / P1 Priority Tiers", desc: "Tag every webhook as critical (P0) or important (P1). Different urgency levels, different escalation paths.", icon: <PriorityHighOutlinedIcon />, color: "#F87171" },
      { title: "Instant Routing", desc: "Each webhook routes to its designated primary recipient the moment the event fires. Zero latency queuing.", icon: <LayersOutlinedIcon />, color: "#A78BFA" },
    ]
  },
  {
    id: "02",
    title: "Escalation & Team",
    subtitle: "Build a chain of accountability so critical incidents are never silently missed.",
    bgColor: "#020617",
    bgGradient: "linear-gradient(180deg, #020617 0%, #0F172A 100%)",
    accentColor: "#60A5FA",
    glowColor: "rgba(59, 130, 246, 0.1)",
    features: [
      { title: "Escalation Chain", desc: "If a P0 alert goes unacknowledged within your configured window, it auto-escalates to a backup recipient.", icon: <GroupOutlinedIcon />, color: "#60A5FA" },
      { title: "Backup Recipients", desc: "Assign a secondary team member per alert. They step in automatically when primary goes unresponsive.", icon: <CheckCircleOutlineOutlinedIcon />, color: "#34D399" },
      { title: "Team Members", desc: "Add your co-founder, on-call engineer, or support lead. Each gets alerts routed directly to their WhatsApp.", icon: <GroupOutlinedIcon />, color: "#FBBF24" },
      { title: "Quiet Hours", desc: "Non-critical P1 alerts respect your team's sleep. P0 incidents always go through, even at 3am.", icon: <AccessTimeOutlinedIcon />, color: "#A78BFA" },
      { title: "Acknowledgement Tracking", desc: "Know who received and responded to each alert. If nobody does, the escalation chain kicks in automatically.", icon: <CheckCircleOutlineOutlinedIcon />, color: "#FB923C" },
    ]
  },
  {
    id: "03",
    title: "Monitoring & Control",
    subtitle: "Full visibility into every alert sent, every delivery status, and every event that fired.",
    bgColor: "#0F172A",
    bgGradient: "linear-gradient(180deg, #0F172A 0%, #1E1B4B 100%)",
    accentColor: "#A78BFA",
    glowColor: "rgba(139, 92, 246, 0.12)",
    features: [
      { title: "Webhook Logs", desc: "Every inbound webhook payload is logged with a timestamp, source, and delivery status.", icon: <HistoryOutlinedIcon />, color: "#A78BFA" },
      { title: "Delivery Status", desc: "See instantly whether your WhatsApp alert was delivered, failed, or is pending retry.", icon: <CheckCircleOutlineOutlinedIcon />, color: "#34D399" },
      { title: "Alert History", desc: "Browse your full incident log — filter by source, priority, recipient, or date range.", icon: <ArticleOutlinedIcon />, color: "#60A5FA" },
      { title: "Payload Preview", desc: "Inspect the raw JSON payload that triggered each alert directly from your dashboard.", icon: <TuneOutlinedIcon />, color: "#F472B6" },
    ]
  }
];

const FeatureCard = ({ item }) => (
  <Box sx={{
    p: { xs: 3, md: 4 },
    height: '100%',
    bgcolor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '24px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    backdropFilter: 'blur(10px)',
    transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: "'Inter', sans-serif",
    '&:hover': {
      transform: 'translateY(-8px)',
      bgcolor: 'rgba(255, 255, 255, 0.07)',
      borderColor: item.color,
      boxShadow: `0 20px 40px -10px ${item.color}25`,
      '& .icon-box': {
        bgcolor: item.color,
        color: '#FFF',
        transform: 'rotate(6deg) scale(1.1)'
      }
    }
  }}>
    <Box className="icon-box" sx={{
      width: 52, height: 52,
      borderRadius: '14px',
      bgcolor: 'rgba(255,255,255,0.08)',
      color: item.color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      mb: 3,
      transition: 'all 0.3s ease'
    }}>
      {React.cloneElement(item.icon, { sx: { fontSize: 28 } })}
    </Box>
    <Typography variant="h6" sx={{
      fontFamily: "'Inter', sans-serif", fontWeight: 700,
      color: '#FFFFFF',
      mb: 1, fontSize: '1.2rem',
      letterSpacing: '-0.01em'
    }}>
      {item.title}
    </Typography>
    <Typography sx={{
      fontFamily: "'Inter', sans-serif",
      color: 'rgba(255,255,255,0.65)',
      lineHeight: 1.6, fontSize: '0.95rem'
    }}>
      {item.desc}
    </Typography>
  </Box>
);

const SectionBlock = ({ category }) => (
  <Box sx={{
    width: '100%',
    py: { xs: 8, md: 14 },
    background: category.bgGradient,
    position: 'relative',
    overflow: 'hidden'
  }}>
    <Box sx={{
      position: 'absolute', top: 0, left: '50%', transform: 'translate(-50%)',
      width: '120vw', height: '600px',
      background: `radial-gradient(circle, ${category.glowColor} 0%, transparent 70%)`,
      zIndex: 0, pointerEvents: 'none'
    }} />
    <Typography sx={{
      position: 'absolute',
      top: { xs: '2%', md: '5%' },
      right: { xs: '-5%', md: '5%' },
      fontSize: { xs: '12rem', md: '20rem' },
      fontWeight: 900,
      color: '#FFFFFF',
      opacity: 0.03,
      fontFamily: "'Inter', sans-serif",
      lineHeight: 1, zIndex: 0, pointerEvents: 'none'
    }}>
      {category.id}
    </Typography>

    <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
      <Box sx={{
        mb: 8,
        borderLeft: { xs: `4px solid ${category.accentColor}`, md: 'none' },
        pl: { xs: 3, md: 0 },
        textAlign: { xs: 'left', md: 'center' }
      }}>
        <Chip
          label={`SECTION ${category.id}`}
          sx={{
            bgcolor: 'rgba(255,255,255,0.1)',
            color: category.accentColor,
            border: `1px solid ${category.accentColor}40`,
            fontWeight: 800, mb: 2,
            fontFamily: "'Inter', sans-serif",
            letterSpacing: 1.5, fontSize: '0.75rem'
          }}
        />
        <Typography variant="h3" sx={{
          fontFamily: "'Inter', sans-serif", fontWeight: 900,
          color: '#FFFFFF', mb: 2,
          fontSize: { xs: '2.2rem', md: '3.5rem' },
          letterSpacing: '-0.02em'
        }}>
          {category.title}
        </Typography>
        <Typography sx={{
          fontFamily: "'Inter', sans-serif",
          color: 'rgba(255,255,255,0.7)',
          fontSize: { xs: '1.1rem', md: '1.3rem' },
          maxWidth: 650, mx: { md: 'auto' }, lineHeight: 1.6
        }}>
          {category.subtitle}
        </Typography>
      </Box>

      <Grid container spacing={{ xs: 3, md: 4 }}>
        {category.features.map((item, i) => (
          <Grid size={{ xs: 12, md: 6, lg: 4 }} key={i}>
            <FeatureCard item={item} />
          </Grid>
        ))}
      </Grid>
    </Container>
  </Box>
);

export default function AllFeaturesMenu() {
  const navigate = useNavigate();

  return (
    <>
      <Helmet>
        <title>All Features | MyHandle</title>
        <meta name="description" content="Every feature MyHandle offers — WhatsApp webhook alerts, P0/P1 priority tiers, escalation chains, team members, quiet hours, and more." />
      </Helmet>

      <Navbar />

      <Box sx={{ bgcolor: '#0F172A', minHeight: '100vh', fontFamily: "'Inter', sans-serif" }}>

        {/* Hero */}
        <Box sx={{
          pt: { xs: 12, md: 18 },
          pb: { xs: 8, md: 10 },
          textAlign: 'center',
          bgcolor: '#FFFFFF',
          backgroundImage: 'radial-gradient(#E2E8F0 1px, transparent 1px)',
          backgroundSize: '32px 32px'
        }}>
          <Container maxWidth="lg">
            <Chip
              label="FULL BREAKDOWN"
              icon={<LayersOutlinedIcon sx={{ fontSize: '16px !important' }} />}
              sx={{
                bgcolor: '#FFFFFF', border: '1px solid #E2E8F0', color: '#16A34A',
                fontWeight: 700, mb: 3,
                fontFamily: "'Inter', sans-serif", letterSpacing: 1
              }}
            />
            <Typography variant="h1" sx={{
              fontFamily: "'Inter', sans-serif", fontWeight: 900,
              fontSize: { xs: 'clamp(2.3rem, 8vw, 3.5rem)', md: '4rem' },
              letterSpacing: '-0.05em', color: '#0F172A', lineHeight: 1.1, mb: 3
            }}>
              Platform <Box component="span" sx={{ color: '#25D366' }}>Capabilities</Box>
            </Typography>
            <Typography sx={{
              fontFamily: "'Inter', sans-serif", color: '#64748B',
              fontSize: { xs: '1.1rem', md: '1.35rem' },
              maxWidth: 680, mx: 'auto', lineHeight: 1.6
            }}>
              Every feature that powers real-time WhatsApp alerting — from the first webhook ping to a 3am escalation.
            </Typography>
          </Container>
        </Box>

        {categories.map((cat, index) => (
          <SectionBlock key={index} category={cat} />
        ))}

        {/* Bottom CTA */}
        <Box sx={{ py: 12, bgcolor: '#0B0F19', borderTop: '1px solid #1E293B' }}>
          <Container maxWidth="md" sx={{ textAlign: 'center' }}>
            <Typography variant="h3" sx={{ fontFamily: "'Inter', sans-serif", fontWeight: 900, color: '#FFF', mb: 2 }}>
              Ready to stop flying blind?
            </Typography>
            <Typography sx={{ fontFamily: "'Inter', sans-serif", color: '#94A3B8', fontSize: '1.2rem', mb: 5 }}>
              Paste one webhook. Get your first alert in 5 minutes. $9/mo.
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
              Get Started Now
            </Box>
          </Container>
        </Box>

      </Box>

      <Footer />
    </>
  );
}

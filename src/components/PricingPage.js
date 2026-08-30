import React, { useState } from 'react';
import {
  Box, Grid, Typography, Card, CardContent, Button, Stack,
  useMediaQuery, useTheme, alpha, Divider, Tooltip, ClickAwayListener
} from '@mui/material';
import Navbar from './Navbar';
import Footer from './Footer';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { Helmet } from "react-helmet";

const FeatureRow = ({ item, isMobile }) => {
  const [open, setOpen] = useState(false);
  const isObject = typeof item === 'object';
  const text = isObject ? item.text : item;
  const tooltipText = isObject ? item.tooltip : null;

  const tooltipStyles = {
    tooltip: {
      bgcolor: '#1e293b', color: '#fff', fontSize: '0.85rem',
      padding: '12px', borderRadius: '8px',
      border: `1px solid ${alpha('#fff', 0.1)}`,
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      fontFamily: 'Inter', maxWidth: 220, textAlign: 'center'
    },
    arrow: { sx: { color: '#1e293b' } }
  };

  return (
    <Box display="flex" gap={1.5} alignItems="center">
      <Box sx={{ minWidth: 20, display: 'flex', justifyContent: 'center' }}>
        <CheckCircleOutlineRoundedIcon sx={{ fontSize: 20, color: alpha('#FFFFFF', 0.5) }} />
      </Box>
      <Typography fontSize={isMobile ? 14 : 16} color={alpha('#FFFFFF', 1.0)} sx={{ fontFamily: 'Inter', flex: 1 }}>
        {text}
      </Typography>
      {tooltipText && (
        <>
          {isMobile ? (
            <ClickAwayListener onClickAway={() => setOpen(false)}>
              <Box>
                <Tooltip title={tooltipText} arrow placement="top" open={open} onClose={() => setOpen(false)}
                  disableFocusListener disableHoverListener disableTouchListener componentsProps={tooltipStyles}>
                  <Box onClick={() => setOpen(p => !p)} sx={{ display: 'flex', cursor: 'pointer', opacity: open ? 1 : 0.6 }}>
                    <InfoOutlinedIcon sx={{ fontSize: 18, color: '#25D366' }} />
                  </Box>
                </Tooltip>
              </Box>
            </ClickAwayListener>
          ) : (
            <Tooltip title={tooltipText} arrow placement="top" componentsProps={tooltipStyles}>
              <Box sx={{ display: 'flex', cursor: 'pointer', opacity: 0.6, '&:hover': { opacity: 1 } }}>
                <InfoOutlinedIcon sx={{ fontSize: 18, color: '#25D366' }} />
              </Box>
            </Tooltip>
          )}
        </>
      )}
    </Box>
  );
};

export default function PricingPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const ltdFounderFeatures = [
    '400 alerts /month',
    'Unlimited webhooks',
    '5 team contacts',
    { text: 'P0 / P1 priority tiers', tooltip: 'Tag each webhook as critical (P0) or important (P1) to control alert behavior.' },
    'All integrations (Stripe, Vercel + more)',
    'Pay once, yours forever',
  ];

  const ltdTeamFeatures = [
    'Everything in Founder',
    '1,000 alerts /month',
    '10 team contacts',
    { text: 'Quiet hours config', tooltip: 'P1 alerts respect your quiet hours. P0 critical alerts always go through.' },
    'Priority support',
    'Pay once, yours forever',

  ];

  const commonCardStyles = {
    height: '100%', width: '100%',
    borderRadius: '24px',
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    transition: 'transform 0.3s ease-in-out, box-shadow 0.3s ease',
  };

  return (
    <>
      <Helmet>
        <title>Pricing | MyHandle — WhatsApp Webhook Alerts</title>
        <meta name="description" content="Lifetime deal pricing for WhatsApp webhook alerts. Founder LTD at $49, Team LTD at $79. No monthly fees. No WhatsApp API required. Try free — no card needed." />
      </Helmet>

      <Navbar />

      <Box sx={{
        minHeight: '100vh', position: 'relative', overflow: 'hidden',
        pt: 12, pb: 12, px: isMobile ? 2 : 4,
        bgcolor: '#020617',
        backgroundImage: `
          radial-gradient(at 50% 0%, ${alpha('#25D366', 0.1)} 0px, transparent 50%),
          radial-gradient(at 10% 20%, ${alpha('#60A5FA', 0.06)} 0px, transparent 40%),
          radial-gradient(at 90% 20%, ${alpha('#A78BFA', 0.06)} 0px, transparent 40%)
        `,
      }}>

        {/* Header */}
        <Box textAlign="center" mb={8} position="relative" zIndex={1}>
         
          <Typography component="h1" sx={{
            color: '#F8FAFC', fontWeight: 800,
            fontSize: isMobile ? '2.25rem' : '3.5rem',
            fontFamily: 'Inter', letterSpacing: '-0.02em',
            lineHeight: 1.1, mb: 3,
          }}>
            Pay once.<br />
            <Box component="span" sx={{ color: '#25D366' }}>Never miss a critical alert.</Box>
          </Typography>
          <Typography sx={{
            color: '#64748B', fontSize: isMobile ? 14 : 16,
            fontFamily: 'Inter', maxWidth: 480, mx: 'auto', lineHeight: 1.7
          }}>
           No monthly fees. One payment, lifetime access for first 100 SaaS founders.</Typography>
        </Box>

        {/* Cards */}
        <Grid
          container spacing={3} justifyContent="center" alignItems="stretch"
          sx={{ maxWidth: '860px', mx: 'auto', position: 'relative', zIndex: 1 }}
        >

          {/* Starter */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{
              ...commonCardStyles,
              background: alpha('#1E293B', 1),
              backdropFilter: 'blur(20px)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.08)',
              '&:hover': { borderColor: alpha('#fff', 0.15) }
            }}>
              <CardContent sx={{ p: 4 }}>
                <Typography fontSize={isMobile ? 18 : 20} fontWeight={600} color={alpha('#fff', 0.9)} sx={{ fontFamily: 'Inter' }}>
                  Founder LTD
                </Typography>
                <Typography variant="body2" sx={{ color: alpha('#94a3b8', 1), mt: 1, mb: 3, minHeight: '40px', fontFamily: 'Inter', fontSize: isMobile ? '0.875rem' : '1rem' }}>
                  Everything you need to stop flying blind. Paid once, yours forever.
                </Typography>

                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.5 }}>
                  <Typography component="span" fontSize={isMobile ? 36 : 48} fontWeight={800} sx={{ fontFamily: 'Inter' }}>
                    $49
                  </Typography>
                  <Typography component="span" sx={{ color: alpha('#94a3b8', 1), fontFamily: 'Inter', fontSize: isMobile ? '0.9rem' : '1rem' }}>
                    one-time
                  </Typography>
                </Box>

                <Button
                  fullWidth variant="outlined" size="large"
                  onClick={() => (window.location.href = '/professional/login')}
                  sx={{
                    py: 1.5, borderRadius: '12px',
                    borderColor: alpha('#fff', 0.2), color: '#fff',
                    textTransform: 'none', fontWeight: 600,
                    fontSize: isMobile ? '0.9rem' : '1rem', fontFamily: 'Inter',
                    '&:hover': { borderColor: '#fff', bgcolor: alpha('#fff', 0.05) }
                  }}
                >
                  Get Lifetime Access
                </Button>

                <Divider sx={{ my: 4, borderColor: alpha('#fff', 0.1) }} />

                <Stack spacing={2}>
                  {ltdFounderFeatures.map((item, i) => (
                    <FeatureRow key={i} item={item} isMobile={isMobile} />
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          {/* Pro */}
          <Grid size={{ xs: 12, md: 6 }} sx={{ pt: isMobile ? 0 : '14px !important' }}>
            <Card sx={{
              ...commonCardStyles,
              background: 'linear-gradient(145deg, rgba(37,211,102,0.12) 0%, rgba(37,211,102,0.04) 100%)',
              backdropFilter: 'blur(20px)',
              border: '1.5px solid rgba(37,211,102,0.3)',
              boxShadow: `0 0 40px -10px ${alpha('#25D366', 0.25)}`,
              position: 'relative',
              overflow: 'visible',
              transform: isMobile ? 'none' : 'scale(1.02)',
              zIndex: 2,
              '&:hover': { borderColor: 'rgba(37,211,102,0.5)' }
            }}>
            {/* Best Value badge */}
            <div style={{
              position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)",
              background: "#25D366", borderRadius: 50,
              padding: "5px 18px",
              fontSize: 10, fontWeight: 700, color: "#fff",
              letterSpacing: ".07em", textTransform: "uppercase",
              whiteSpace: "nowrap",
              boxShadow: "0 4px 16px rgba(37,211,102,.4)",
            }}>
              Best Value
            </div>

              <CardContent sx={{ p: 4 }}>
                <Typography fontSize={isMobile ? 18 : 20} fontWeight={600} sx={{ color: '#86EFAC', display: 'flex', alignItems: 'center', gap: 1, fontFamily: 'Inter' }}>
                  Team LTD <AutoAwesomeIcon sx={{ fontSize: 18, color: '#25D366' }} />
                </Typography>
                <Typography variant="body2" sx={{ color: '#86EFAC', mt: 1, mb: 3, minHeight: '40px', fontFamily: 'Inter', fontSize: isMobile ? '0.875rem' : '1rem', fontWeight: 500 }}>
                  For teams where one person can't be the single point of failure.
                </Typography>

                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.5 }}>
                  <Typography component="span" fontSize={isMobile ? 36 : 48} fontWeight={800} color="#fff" sx={{ fontFamily: 'Inter' }}>
                    $79
                  </Typography>
                  <Typography component="span" sx={{ color: alpha('#cbd5e1', 1), fontFamily: 'Inter', fontSize: isMobile ? '0.9rem' : '1rem' }}>
                    one-time
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: 11, color: '#4ADE80', mb: 3, fontFamily: 'Inter' }}>
                  3x the alerts + team backup contacts
                </Typography>

                <Button
                  fullWidth size="large"
                  onClick={() => (window.location.href = '/professional/login')}
                  sx={{
                    py: 1.5, borderRadius: '12px',
                    background: '#25D366', color: '#fff',
                    textTransform: 'none', fontWeight: 600,
                    fontSize: isMobile ? '0.9rem' : '1rem', fontFamily: 'Inter',
                    boxShadow: '0 8px 24px rgba(37,211,102,.3)',
                    '&:hover': { background: '#1ebe5a', boxShadow: '0 12px 32px rgba(37,211,102,.4)' }
                  }}
                >
                  Get Lifetime Access →
                </Button>

                <Divider sx={{ my: 4, borderColor: alpha('#fff', 0.15) }} />

                <Stack spacing={2}>
                  {ltdTeamFeatures.map((item, i) => (
                    <FeatureRow key={i} item={item} isMobile={isMobile} />
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Free Trial Strip */}
        <Box sx={{
          maxWidth: '860px', mx: 'auto', mt: 3, mb: 0,
          position: 'relative', zIndex: 1,
          background: 'rgba(255,255,255,0.025)',
          border: '1px dashed rgba(255,255,255,0.1)',
          borderRadius: '20px',
          p: isMobile ? '20px 22px' : '22px 32px',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'flex-start' : 'center',
          gap: isMobile ? 2 : 3,
        }}>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#475569', mb: 0.5, letterSpacing: '.05em', textTransform: 'uppercase', fontFamily: 'Inter' }}>
              Not ready to commit?
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Typography sx={{ fontSize: 15, fontWeight: 700, color: '#CBD5E1', fontFamily: 'Inter' }}>
                Try it free
              </Typography>
              <Box sx={{ width: 5, height: 5, borderRadius: '50%', background: '#25D366', flexShrink: 0 }} />
              <Typography sx={{ fontSize: 15, fontWeight: 700, color: '#CBD5E1', fontFamily: 'Inter' }}>
                No card needed.
              </Typography>
            </Box>
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              {['1 Free Webhook', '2 Test Messages', 'No credit card'].map((f, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Box sx={{ width: 5, height: 5, borderRadius: '50%', background: '#25D366', flexShrink: 0 }} />
                  <Typography sx={{ fontSize: 12, color: '#64748B', fontFamily: 'Inter' }}>{f}</Typography>
                </Box>
              ))}
            </Stack>
          </Box>
          <Button
            onClick={() => (window.location.href = '/professional/login')}
            variant="outlined"
            sx={{
              color: '#4ADE80', borderColor: 'rgba(37,211,102,0.3)',
              borderRadius: '12px', px: 3, py: 1.25,
              textTransform: 'none', fontWeight: 700, fontSize: 13,
              fontFamily: 'Inter', whiteSpace: 'nowrap', flexShrink: 0,
              '&:hover': { borderColor: 'rgba(37,211,102,0.6)', background: 'rgba(37,211,102,0.06)' }
            }}
          >
            Try Free →
          </Button>
        </Box>

        {/* Trust line */}
        <Box sx={{ textAlign: 'center', mt: 6, position: 'relative', zIndex: 1 }}>
          <Typography sx={{ color: '#475569', fontSize: 13, fontFamily: 'Inter' }}>
            One-time payment · No subscriptions · Meta verified sender
          </Typography>
          <Stack direction="row" spacing={3} justifyContent="center" mt={2} flexWrap="wrap">
            {[
              { icon: "🔒", text: "No Meta API signup" },
              { icon: "⚡", text: "Live in 5 minutes" },
              { icon: "🌍", text: "Works worldwide" },
            ].map((t, i) => (
              <Typography key={i} sx={{ color: '#64748B', fontSize: 13, fontWeight: 500, fontFamily: 'Inter', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <span>{t.icon}</span> {t.text}
              </Typography>
            ))}
          </Stack>
        </Box>
      </Box>

      <Footer />
    </>
  );
}

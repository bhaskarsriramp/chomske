// PricingPage.js
import React, { useState } from 'react';
import {
  Box,
  Grid,
  Typography,
  Card,
  CardContent,
  Button,
  Stack,
  useMediaQuery,
  useTheme,
  alpha,
  Divider,
  Tooltip,
  ClickAwayListener
} from '@mui/material';

import Navbar from './Navbar';
import Footer from './Footer';

import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import DiamondOutlinedIcon from '@mui/icons-material/DiamondOutlined'; // Added for Pro Plan
import { Helmet } from "react-helmet";
// --- SUB-COMPONENT FOR INDIVIDUAL FEATURE ROWS ---
const FeatureRow = ({ item, isMobile }) => {
  const [open, setOpen] = useState(false);

  const isObject = typeof item === 'object';
  const text = isObject ? item.text : item;
  const tooltipText = isObject ? item.tooltip : null;

  const handleMobileClick = () => {
    setOpen((prev) => !prev);
  };

  const handleClickAway = () => {
    setOpen(false);
  };

  const tooltipStyles = {
    tooltip: {
      bgcolor: '#1e293b',
      color: '#fff',
      fontSize: '0.85rem',
      padding: '12px',
      borderRadius: '8px',
      border: `1px solid ${alpha('#fff', 0.1)}`,
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      fontFamily: 'Inter',
      maxWidth: 220,
      textAlign: 'center'
    },
    arrow: {
      sx: { color: '#1e293b' }
    }
  };

  return (
    <Box display="flex" gap={1.5} alignItems="center">
      <Box 
        sx={{ 
          minWidth: 20, 
          display: 'flex', 
          justifyContent: 'center' 
        }}
      >
        <CheckCircleOutlineRoundedIcon sx={{ fontSize: 20, color: alpha('#FFFFFF', 0.5) }} />
      </Box>
      
      <Typography 
        fontSize={isMobile ? 14 : 16} 
        color={alpha('#FFFFFF', 1.0)} 
        sx={{ fontFamily: 'Inter', flex: 1 }}
      >
        {text}
      </Typography>

      {tooltipText && (
        <>
          {isMobile ? (
            <ClickAwayListener onClickAway={handleClickAway}>
              <Box>
                <Tooltip
                  title={tooltipText}
                  arrow
                  placement="top"
                  open={open}
                  onClose={handleClickAway}
                  disableFocusListener
                  disableHoverListener
                  disableTouchListener
                  componentsProps={tooltipStyles}
                >
                  <Box 
                    onClick={handleMobileClick} 
                    sx={{ display: 'flex', cursor: 'pointer', opacity: open ? 1 : 0.6 }}
                  >
                    <InfoOutlinedIcon sx={{ fontSize: 18, color: '#3b82f6' }} />
                  </Box>
                </Tooltip>
              </Box>
            </ClickAwayListener>
          ) : (
            <Tooltip 
              title={tooltipText} 
              arrow 
              placement="top"
              componentsProps={tooltipStyles}
            >
              <Box sx={{ display: 'flex', cursor: 'pointer', opacity: 0.6, '&:hover': { opacity: 1 } }}>
                <InfoOutlinedIcon sx={{ fontSize: 18, color: '#3b82f6' }} />
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

  // --- DATA CONFIGURATION ---
  const freeFeatures = [
    { text: '5 Leads per month', tooltip: 'You will receive 5 high-quality leads vetted by our AI system every month.' },
    '1,000 DMs per month',
    { text: 'Send Leads to WhatsApp', tooltip: 'Automatically forward verified leads directly to your WhatsApp.' },
    'Comment Auto-Reply',
    'Flow Automation',
    'Ask to Follow',
    'Share PDF · Excel · Photo',
    'Link Click Analytics',
    'Link-in-Bio Store',
  ];

  const creatorFeatures = [
    { text: '500 Leads per month', tooltip: 'Scale up! Get 500 premium leads every month to explode your growth.' },
    '1,00,000 DMs per month',
    'Send Leads to WhatsApp',
    { text: 'Comment Auto-Reply', tooltip: 'AI-powered smart replies that engage with your audience 24/7.' },
    'Flow Automation',
    'Ask to Follow',
    'Share PDF · Excel · Photo',
    'Link Click Analytics',
    'Link-in-Bio Store',
  ];

  // Identical features to Creator, but logically higher limits for "Pro"
  const proFeatures = [
    { text: '2500 Leads per month', tooltip: 'Maximum volume for agencies and power users.' },
    'Unlimited DMs per month',
    'Send Leads to WhatsApp',
    { text: 'Comment Auto-Reply', tooltip: 'AI-powered smart replies that engage with your audience 24/7.' },
    'Flow Automation',
    'Ask to Follow',
    'Share PDF · Excel · Photo',
    'Link Click Analytics',
    'Link-in-Bio Store',
  ];

  // Common card styles
  const commonCardStyles = {
    height: '100%',
    width: '100%',
    borderRadius: '24px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    transition: 'transform 0.3s ease-in-out, box-shadow 0.3s ease',
  };

  return (
    <>

   <Helmet>
        <title>Pricing and Packages | MyHandle</title>
        <meta name="description" content="Checkout the prices and rates for MyHandle." />
      </Helmet>

      
      <Navbar />

      <Box
        sx={{
          minHeight: '100vh',
          position: 'relative',
          overflow: 'hidden',
          pt: 12,
          pb: 12,
          px: isMobile ? 2 : 4,
          bgcolor: '#EEEEEE',
          backgroundImage: `
            radial-gradient(at 50% 0%, ${alpha('#7e22ce', 0.15)} 0px, transparent 50%),
            radial-gradient(at 10% 20%, ${alpha('#ec4899', 0.1)} 0px, transparent 40%),
            radial-gradient(at 90% 20%, ${alpha('#3b82f6', 0.1)} 0px, transparent 40%)
          `,
        }}
      >
        {/* --- HEADER SECTION --- */}
        <Box textAlign="center" mb={8} position="relative" zIndex={1}>
          <Typography
            sx={{
              color: '#3b82f6', 
              fontWeight: 700,
              fontSize: isMobile ? '0.75rem' : '0.875rem',
              fontFamily: 'Inter',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              mb: 2,
              display: 'block'
            }}
          >
            Pricing Made Simple
          </Typography>

          <Typography
            component="h1"
            sx={{
              color: '#660B05',
              fontWeight: 800,
              fontSize: isMobile ? '2.25rem' : '3.5rem',
              fontFamily: 'Inter',
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
              mb: 3,
            }}
          >
            Choose a plan that’s right for you.
          </Typography>

          <Box 
            sx={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: 1, 
              alignItems: 'center',
              color: alpha('#94a3b8', 1),
              fontSize: isMobile ? 14 : 16,
              fontFamily: 'Inter',
            }}
          >
            <Box display="flex" alignItems="center" gap={1} textAlign="center">
              <Typography color="inherit" fontSize="inherit" sx={{ fontFamily: 'Inter', color: '#37353E' }}>
                Get started with a free account and upgrade as your DMs take off. No hidden fees, no surprise costs.
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* --- PRICING CARDS --- */}
        {/* Changed maxWidth to 1200px to accommodate 3 cards comfortably */}
        <Grid 
          container 
          spacing={3} 
          justifyContent="center" 
          alignItems="stretch" 
          sx={{ maxWidth: '1200px', mx: 'auto', position: 'relative', zIndex: 1 }}
        >

          {/* 1. FREE PLAN */}
            <Grid size= {{ xs : 12, md: 4 }}>
            <Card
              sx={{
                ...commonCardStyles,
                background: alpha('#44444E', 1),
                backdropFilter: 'blur(20px)',
                color: '#fff',
                '&:hover': {
                  borderColor: alpha('#fff', 0.2),
                }
              }}
            >
              <CardContent sx={{ p: 4 }}>
                <Typography fontSize={isMobile ? 18 : 20} fontWeight={600} color={alpha('#fff', 0.9)} sx={{ fontFamily: 'Inter' }}>
                  Free Forever
                </Typography>
                <Typography variant="body2" sx={{ color: alpha('#94a3b8', 1), mt: 1, mb: 3, minHeight: '40px', fontFamily: 'Inter', fontSize: isMobile ? '0.875rem' : '1rem' }}>
                  Test drive the power of automated lead finder for free.
                </Typography>

                <Box sx={{ display: 'flex', alignItems: 'baseline', mb: 4 }}>
                  <Typography component="span" fontSize={isMobile ? 36 : 48} fontWeight={800} sx={{ fontFamily: 'Inter' }}>
                    $0
                  </Typography>
                  <Typography component="span" sx={{ color: alpha('#94a3b8', 1), ml: 1, fontFamily: 'Inter', fontSize: isMobile ? '0.9rem' : '1rem' }}>
                    / month
                  </Typography>
                </Box>

                <Button
                  fullWidth
                  variant="outlined"
                  size="large"
                  onClick={() => (window.location.href = '/professional/login')}
                  sx={{
                    py: 1.5,
                    borderRadius: '12px',
                    borderColor: alpha('#fff', 0.2),
                    color: '#fff',
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: isMobile ? '0.9rem' : '1rem',
                    fontFamily: 'Inter',
                    '&:hover': {
                      borderColor: '#fff',
                      bgcolor: alpha('#fff', 0.05)
                    }
                  }}
                >
                  Get Started
                </Button>

                <Divider sx={{ my: 4, borderColor: alpha('#fff', 0.1) }} />

                <Stack spacing={2}>
                  {freeFeatures.map((item, i) => (
                    <FeatureRow key={i} item={item} isMobile={isMobile} />
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          {/* 2. CREATOR PLAN (Dominant/Highlighted) */}
                    <Grid size= {{ xs : 12, md: 4 }}>
            <Card
              sx={{
                ...commonCardStyles,
                background: alpha('#0f172a', 1),
                backdropFilter: 'blur(20px)',
                backgroundImage: `linear-gradient(${alpha('#0f172a', 0.8)}, ${alpha('#0f172a', 0.8)}), linear-gradient(135deg, #F63049, #000000)`,
                backgroundOrigin: 'border-box',
                backgroundClip: 'padding-box, border-box',
                // Strong shadow to make it pop
                boxShadow: `0 0 40px -10px ${alpha('#F63049', 0.3)}`,
                position: 'relative',
                transform: isMobile ? 'none' : 'scale(1.02)', // Slight scale to emphasize importance
                zIndex: 2,
              }}
            >
              <CardContent sx={{ p: 4 }}>
                <Typography fontSize={isMobile ? 18 : 20} fontWeight={600} sx={{ color: '#fff', display: 'flex', alignItems: 'center', gap: 1, fontFamily: 'Inter' }}>
                  Creator <AutoAwesomeIcon sx={{ fontSize: 18, color: '#F63049' }} />
                </Typography>
                <Typography variant="body2" sx={{ color: alpha('#cbd5e1', 1), mt: 1, mb: 3, minHeight: '40px', fontFamily: 'Inter', fontSize: isMobile ? '0.875rem' : '1rem' }}>
                  Powerful capacity ready to automate at scale.
                </Typography>

                <Box sx={{ display: 'flex', alignItems: 'baseline', mb: 2.5 }}>
                   <Typography 
                    component="span" 
                    sx={{ 
                      textDecoration: 'line-through', 
                      color: alpha('#fff', 0.4), 
                      mr: 2,
                      fontSize: isMobile ? 16 : 20, 
                      fontFamily: 'Inter'
                    }}
                  >
                    $49
                  </Typography>
                  <Typography component="span" fontSize={isMobile ? 36 : 48} fontWeight={800} color="#fff" sx={{ fontFamily: 'Inter'}}>
                    $29
                  </Typography>
                  <Typography component="span" sx={{ color: alpha('#cbd5e1', 1), ml: 1, fontFamily: 'Inter', fontSize: isMobile ? '0.9rem' : '1rem' }}>
                    / month
                  </Typography>
                </Box>

                <Button
                  fullWidth
                  size="large"
                  onClick={() => (window.location.href = '/professional/login')}
                  sx={{
                    mt: 1.5,
                    py: 1.5,
                    borderRadius: '12px',
                    background: 'linear-gradient(90deg, #F63049, #000000)',
                    color: '#fff',
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: isMobile ? '0.9rem' : '1rem',
                    fontFamily: 'Inter',
                    boxShadow: '0 4px 14px #000000',
                    '&:hover': {
                      filter: 'brightness(110%)',
                      boxShadow: '0 6px 20px #F63049',
                    }
                  }}
                >
                  Upgrade to Creator
                </Button>

                <Divider sx={{ my: 4, borderColor: alpha('#fff', 0.15) }} />

                <Stack spacing={2}>
                  {creatorFeatures.map((item, i) => (
                    <FeatureRow key={i} item={item} isMobile={isMobile} />
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          {/* 3. PRO PLAN (New) */}
          <Grid size= {{ xs : 12, md: 4 }}>
            <Card
              sx={{
                ...commonCardStyles,
                // Subtle Blue/Cyan theme - Professional but less aggressive than Creator
                background: alpha('#0f172a', 1),
                backdropFilter: 'blur(20px)',
                backgroundImage: `linear-gradient(${alpha('#0f172a', 0.9)}, ${alpha('#0f172a', 0.9)}), linear-gradient(135deg, #9929EA, #574964)`,
                backgroundOrigin: 'border-box',
                backgroundClip: 'padding-box, border-box',
                // Subtle glow, not as strong as Creator
                boxShadow: `0 0 20px -5px ${alpha('#9929EA', 0.15)}`, 
                position: 'relative',
              }}
            >
              <CardContent sx={{ p: 4 }}>
                <Typography fontSize={isMobile ? 18 : 20} fontWeight={600} sx={{ color: '#fff', display: 'flex', alignItems: 'center', gap: 1, fontFamily: 'Inter' }}>
                  Pro <DiamondOutlinedIcon sx={{ fontSize: 18, color: '#9929EA' }} />
                </Typography>
                <Typography variant="body2" sx={{ color: alpha('#cbd5e1', 1), mt: 1, mb: 3, minHeight: '40px', fontFamily: 'Inter', fontSize: isMobile ? '0.875rem' : '1rem' }}>
                  Maximum power for agencies and professionals.
                </Typography>

                <Box sx={{ display: 'flex', alignItems: 'baseline', mb: 2.5 }}>
                   <Typography 
                    component="span" 
                    sx={{ 
                      textDecoration: 'line-through', 
                      color: alpha('#fff', 0.4), 
                      mr: 2,
                      fontSize: isMobile ? 16 : 20, 
                      fontFamily: 'Inter'
                    }}
                  >
                    $99
                  </Typography>
                  <Typography component="span" fontSize={isMobile ? 36 : 48} fontWeight={800} color="#fff" sx={{ fontFamily: 'Inter'}}>
                    $59
                  </Typography>
                  <Typography component="span" sx={{ color: alpha('#cbd5e1', 1), ml: 1, fontFamily: 'Inter', fontSize: isMobile ? '0.9rem' : '1rem' }}>
                    / month
                  </Typography>
                </Box>

                <Button
                  fullWidth
                  size="large"
                  onClick={() => (window.location.href = '/professional/login')}
                  sx={{
                    mt: 1.5,
                    py: 1.5,
                    borderRadius: '12px',
                    // Cyan/Blue gradient
                    background: 'linear-gradient(90deg, #9929EA, #574964)',
                    color: '#fff',
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: isMobile ? '0.9rem' : '1rem',
                    fontFamily: 'Inter',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
                    '&:hover': {
                      filter: 'brightness(110%)',
                      boxShadow: '0 6px 20px rgba(8, 145, 178, 0.4)',
                    }
                  }}
                >
                  Get Pro
                </Button>

                <Divider sx={{ my: 4, borderColor: alpha('#fff', 0.15) }} />

                <Stack spacing={2}>
                  {proFeatures.map((item, i) => (
                    <FeatureRow key={i} item={item} isMobile={isMobile} />
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>

        </Grid>
      </Box>
      <Footer />
    </>
  );
}
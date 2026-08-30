import React, { useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Grid,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  useTheme,
  useMediaQuery,
  alpha,
  Divider
} from '@mui/material';
import Navbar from './Navbar';
import Footer from './Footer';

// Icons
import GppGoodOutlinedIcon from '@mui/icons-material/GppGoodOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

function GoogleApiDisclosure() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  useEffect(() => {
    // Ensure dataLayer is defined before calling gtag
    window.dataLayer = window.dataLayer || [];
    function gtag() {
      window.dataLayer.push(arguments);
    }
    gtag('js', new Date());
    gtag('config', 'G-D1X0WBG5EL');
  }, []);

  // Common card style for consistency
  const cardStyle = {
    height: '100%',
    background: alpha('#1e293b', 0.4), // Semi-transparent dark slate
    backdropFilter: 'blur(12px)',
    border: `1px solid ${alpha('#fff', 0.08)}`,
    borderRadius: '16px',
    color: '#e2e8f0',
    transition: 'transform 0.2s ease-in-out',
    '&:hover': {
      borderColor: alpha('#3b82f6', 0.4), // Blue glow on hover
    }
  };

  return (
    <>
      <header>
        <title>Google API Disclosure & Security | MyHandle</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Details on how MyHandle securely uses Google APIs and Gemini models." />
        <link rel="icon" href="/favicon.ico" />
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-D1X0WBG5EL"></script>
      </header>

      <Navbar />

      <Box
        sx={{
          minHeight: '100vh',
          pt: { xs: 12, md: 16 },
          pb: 12,
          px: 2,
          bgcolor: '#020617', // Deep Slate Background
          fontFamily: 'Inter, sans-serif',
          backgroundImage: `
            radial-gradient(at 50% 0%, ${alpha('#3b82f6', 0.1)} 0px, transparent 50%),
            radial-gradient(at 80% 10%, ${alpha('#7e22ce', 0.05)} 0px, transparent 40%)
          `,
        }}
      >
        <Container maxWidth="lg">
          {/* --- HERO SECTION --- */}
          <Box textAlign="center" mb={8}>
            <Typography
              variant="h1"
              sx={{
                fontSize: { xs: '2rem', md: '3rem' },
                fontWeight: 800,
                color: '#fff',
                mb: 2,
                letterSpacing: '-0.02em',
                background: 'linear-gradient(to right, #fff, #94a3b8)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Google API Disclosure
            </Typography>
            <Typography
              variant="subtitle1"
              sx={{
                color: '#94a3b8',
                fontSize: { xs: '1rem', md: '1.125rem' },
                maxWidth: '700px',
                mx: 'auto',
                lineHeight: 1.6,
              }}
            >
              Transparency is our core value. Here is how we handle your data, utilize AI securely, and adhere to Google's strict usage policies.
            </Typography>
          </Box>

          {/* --- MAIN DISCLOSURE CARD --- */}
          <Card
            sx={{
              mb: 6,
              background: 'linear-gradient(180deg, rgba(59, 130, 246, 0.1) 0%, rgba(15, 23, 42, 0.4) 100%)',
              border: `1px solid ${alpha('#3b82f6', 0.3)}`,
              borderRadius: '20px',
              backdropFilter: 'blur(20px)',
            }}
          >
            <CardContent sx={{ p: { xs: 3, md: 5 } }}>
              <Box display="flex" alignItems="center" gap={2} mb={2}>
                <ShieldOutlinedIcon sx={{ fontSize: 32, color: '#60a5fa' }} />
                <Typography variant="h5" fontWeight={700} color="#fff">
                  Limited Use Disclosure
                </Typography>
              </Box>
              <Typography variant="body1" sx={{ color: '#cbd5e1', lineHeight: 1.7, fontSize: '1.05rem' }}>
                MyHandle's use and transfer of information received from Google APIs to any other app will adhere to{' '}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#60a5fa', textDecoration: 'underline', textUnderlineOffset: '4px' }}
                >
                  Google API Services User Data Policy
                </a>
                , including the Limited Use requirements.
              </Typography>
            </CardContent>
          </Card>

          {/* --- DETAILS GRID --- */}
          <Grid container spacing={4}>
            
            {/* 1. AI & Gemini Usage */}
            <Grid item xs={12} md={6}>
              <Card sx={cardStyle}>
                <CardContent sx={{ p: 4 }}>
                  <Box display="flex" alignItems="center" gap={2} mb={3}>
                    <SmartToyOutlinedIcon sx={{ fontSize: 28, color: '#a78bfa' }} />
                    <Typography variant="h6" fontWeight={700} color="#fff">
                      AI & Gemini Models
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="#94a3b8" mb={3}>
                    We utilize Google's advanced <strong>Gemini models</strong> to process text for intent detection (e.g., identifying if a DM is a lead).
                  </Typography>
                  <List disablePadding>
                    {[
                      'Data is processed transiently to generate insights.',
                      'We do NOT use your data to train public AI models.',
                      'Input/Output data is encrypted in transit and at rest.',
                    ].map((item, i) => (
                      <ListItem key={i} disablePadding sx={{ mb: 1.5, alignItems: 'flex-start' }}>
                        <ListItemIcon sx={{ minWidth: 32, mt: 0.5 }}>
                          <CheckCircleOutlineIcon sx={{ fontSize: 18, color: '#a78bfa' }} />
                        </ListItemIcon>
                        <ListItemText primary={item} primaryTypographyProps={{ fontSize: '0.9rem', color: '#e2e8f0' }} />
                      </ListItem>
                    ))}
                  </List>
                </CardContent>
              </Card>
            </Grid>

            {/* 2. Data Security */}
            <Grid item xs={12} md={6}>
              <Card sx={cardStyle}>
                <CardContent sx={{ p: 4 }}>
                  <Box display="flex" alignItems="center" gap={2} mb={3}>
                    <LockOutlinedIcon sx={{ fontSize: 28, color: '#34d399' }} />
                    <Typography variant="h6" fontWeight={700} color="#fff">
                      Data Security
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="#94a3b8" mb={3}>
                    Your trust is paramount. We employ industry-standard security measures to protect the information accessed via Google APIs.
                  </Typography>
                  <List disablePadding>
                    {[
                      'AES-256 Encryption for data at rest.',
                      'TLS 1.3 Encryption for data in transit.',
                      'Strict access controls (Least Privilege Principle).',
                    ].map((item, i) => (
                      <ListItem key={i} disablePadding sx={{ mb: 1.5, alignItems: 'flex-start' }}>
                        <ListItemIcon sx={{ minWidth: 32, mt: 0.5 }}>
                          <CheckCircleOutlineIcon sx={{ fontSize: 18, color: '#34d399' }} />
                        </ListItemIcon>
                        <ListItemText primary={item} primaryTypographyProps={{ fontSize: '0.9rem', color: '#e2e8f0' }} />
                      </ListItem>
                    ))}
                  </List>
                </CardContent>
              </Card>
            </Grid>

            {/* 3. Data Usage & Privacy */}
            <Grid item xs={12}>
              <Card sx={cardStyle}>
                <CardContent sx={{ p: 4 }}>
                  <Box display="flex" alignItems="center" gap={2} mb={2}>
                    <GppGoodOutlinedIcon sx={{ fontSize: 28, color: '#fbbf24' }} />
                    <Typography variant="h6" fontWeight={700} color="#fff">
                      How we use your data
                    </Typography>
                  </Box>
                  <Divider sx={{ mb: 2, borderColor: alpha('#fff', 0.1) }} />
                  <Grid container spacing={4}>
                    <Grid item xs={12} md={6}>
                      <Typography variant="subtitle2" color="#fff" gutterBottom>
                        Permitted Actions
                      </Typography>
                      <Typography variant="body2" color="#94a3b8">
                        We only access data required to provide the service: reading incoming comments/DMs to identify leads and NO replying on your behalf.
                      </Typography>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Typography variant="subtitle2" color="#fff" gutterBottom>
                        No Unauthorized Sharing
                      </Typography>
                      <Typography variant="body2" color="#94a3b8">
                        We do not share your raw Google user data with third-party tools (other than our AI processor, Google Vertex AI) without your explicit consent.
                      </Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>

          </Grid>

          {/* Footer Note */}
          <Box mt={8} textAlign="center">
            <Typography variant="caption" color="#64748b">
              Last Updated: January 15, 2026 | If you have questions about this policy, please contact <a href="mailto:support@chomske.com" style={{ color: '#94a3b8' }}>support@chomske.com</a>
            </Typography>
          </Box>

        </Container>
      </Box>
      <Footer />
    </>
  );
}

export default GoogleApiDisclosure;
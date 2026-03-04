import React from 'react';
import {
  Container,
  Typography,
  Box,
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
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import CardGiftcardOutlinedIcon from '@mui/icons-material/CardGiftcardOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';

const DisclosurePolicy = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Light Theme Card Style
  const cardStyle = {
    background: '#FFFFFF', // Clean White
    border: `1px solid ${alpha('#cbd5e1', 0.4)}`, // Subtle Slate border
    borderRadius: '16px',
    height: '100%',
    boxShadow: '0 4px 20px rgba(0,0,0,0.03)', // Very soft shadow for depth
    transition: 'all 0.2s ease-in-out',
    '&:hover': {
      borderColor: alpha('#3b82f6', 0.5), // Blue border on hover
      boxShadow: '0 10px 25px rgba(59, 130, 246, 0.08)', // Subtle colored glow
      transform: 'translateY(-2px)'
    }
  };

  // Custom List Item Component
  const PolicyListItem = ({ text }) => (
    <ListItem disablePadding sx={{ mb: 1.5, alignItems: 'flex-start' }}>
      <ListItemIcon sx={{ minWidth: 32, mt: 0.5 }}>
        <CheckCircleOutlineIcon sx={{ fontSize: 18, color: '#3b82f6' }} /> {/* Bright Blue Check */}
      </ListItemIcon>
      <ListItemText 
        primary={text} 
        primaryTypographyProps={{ 
          fontSize: '0.95rem', 
          color: '#475569', // Slate-600 (Dark Gray) for readability
          fontFamily: 'Inter',
          lineHeight: 1.6
        }} 
      />
    </ListItem>
  );

  return (
    <>
      <Navbar />
      
      <Box
        sx={{
          minHeight: '100vh',
          pt: { xs: 12, md: 16 },
          pb: 12,
          px: 2,
          bgcolor: '#F8FAFC', // Slate-50 (Very light gray background)
          fontFamily: 'Inter, sans-serif',
          backgroundImage: `
            radial-gradient(at 0% 0%, ${alpha('#3b82f6', 0.05)} 0px, transparent 50%),
            radial-gradient(at 100% 0%, ${alpha('#7e22ce', 0.05)} 0px, transparent 50%)
          `, // Extremely subtle top corners glow
        }}
      >
        <Container maxWidth="lg">
          
          {/* --- HERO HEADER --- */}
          <Box textAlign="center" mb={8}>
            <Box 
              sx={{ 
                display: 'inline-flex', 
                p: 1.5, 
                borderRadius: '50%', 
                bgcolor: '#EFF6FF', // Blue-50
                mb: 3,
                border: `1px solid ${alpha('#3b82f6', 0.2)}`
              }}
            >
              <ShieldOutlinedIcon sx={{ fontSize: 32, color: '#3b82f6' }} />
            </Box>
            
            <Typography
              variant="h1"
              sx={{
                fontSize: { xs: '2rem', md: '3rem' },
                fontWeight: 800,
                color: '#0f172a', // Slate-900 (Deep Black)
                mb: 2,
                letterSpacing: '-0.02em',
              }}
            >
              Disclosure Policy
            </Typography>
            
            <Typography
              variant="subtitle1"
              sx={{
                color: '#64748b', // Slate-500
                fontSize: { xs: '1rem', md: '1.125rem' },
                maxWidth: '700px',
                mx: 'auto',
                lineHeight: 1.6,
              }}
            >
              At MyHandle, we are committed to maintaining the highest standards of security. We welcome researchers to report potential vulnerabilities responsibly.
            </Typography>
          </Box>

          <Grid container spacing={4}>

            {/* --- 1. OUR COMMITMENT --- */}
            <Grid item xs={12} md={6}>
              <Card sx={cardStyle}>
                <CardContent sx={{ p: 4 }}>
                  <Box display="flex" alignItems="center" gap={2} mb={3}>
                    <VerifiedUserOutlinedIcon sx={{ fontSize: 28, color: '#10b981' }} /> {/* Green Icon */}
                    <Typography variant="h6" fontWeight={700} color="#1e293b">
                      What You Can Expect from Us
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="#64748b" mb={3}>
                    When you report a vulnerability in good faith, MyHandle commits to:
                  </Typography>
                  <List disablePadding>
                    <PolicyListItem text="Keeping your identity and report confidential." />
                    <PolicyListItem text="Acknowledging your report promptly." />
                    <PolicyListItem text="Investigating and assessing the issue thoroughly." />
                    <PolicyListItem text="Notifying you once it's resolved." />
                    <PolicyListItem text="Crediting your contribution publicly, if you wish." />
                  </List>
                </CardContent>
              </Card>
            </Grid>

            {/* --- 2. SCOPE & RULES --- */}
            <Grid item xs={12} md={6}>
              <Card sx={cardStyle}>
                <CardContent sx={{ p: 4 }}>
                  <Box display="flex" alignItems="center" gap={2} mb={3}>
                    <BugReportOutlinedIcon sx={{ fontSize: 28, color: '#f43f5e' }} /> {/* Red/Pink Icon */}
                    <Typography variant="h6" fontWeight={700} color="#1e293b">
                      Scope and Testing Rules
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="#64748b" mb={3}>
                    Please ensure that your testing adheres to the following guidelines:
                  </Typography>
                  <List disablePadding>
                    <PolicyListItem text="Test only with accounts you own or are authorized to use." />
                    <PolicyListItem text="Do not run DoS/DDoS attacks or performance stress tests." />
                    <PolicyListItem text="No phishing, social engineering, or deceptive methods." />
                    <PolicyListItem text="Never upload or spread malware or harmful software." />
                    <PolicyListItem text="Do not test physical infrastructure (offices, servers)." />
                  </List>
                </CardContent>
              </Card>
            </Grid>

            {/* --- 3. SAFE HARBOR (Highlighted) --- */}
            <Grid item xs={12}>
              <Card 
                sx={{ 
                  ...cardStyle, 
                  background: 'linear-gradient(to right, #ffffff, #f0fdf4)', // Subtle fade to green tint
                  borderColor: alpha('#10b981', 0.2)
                }}
              >
                <CardContent sx={{ p: { xs: 3, md: 5 } }}>
                  <Box display="flex" alignItems="center" gap={2} mb={2}>
                    <GavelOutlinedIcon sx={{ fontSize: 32, color: '#10b981' }} />
                    <Typography variant="h5" fontWeight={700} color="#1e293b">
                      Safe Harbor Statement
                    </Typography>
                  </Box>
                  <Typography variant="body1" sx={{ color: '#475569', lineHeight: 1.7 }}>
                    MyHandle will <strong>not pursue legal action</strong> against those who identify and report security issues in good faith and within the boundaries of this policy. We appreciate your help in keeping our platform safe and reserve all legal rights if these boundaries are not respected.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* --- 4. HOW TO REPORT --- */}
            <Grid item xs={12} md={6}>
              <Card sx={cardStyle}>
                <CardContent sx={{ p: 4 }}>
                  <Box display="flex" alignItems="center" gap={2} mb={3}>
                    <EmailOutlinedIcon sx={{ fontSize: 28, color: '#3b82f6' }} />
                    <Typography variant="h6" fontWeight={700} color="#1e293b">
                      How to Report
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="#475569" mb={2} lineHeight={1.6}>
                    To report a vulnerability, please submit a detailed report via our official disclosure channel (email below). Include all relevant information that would help us replicate and understand the issue.
                  </Typography>
                  <Typography variant="body2" color="#475569" lineHeight={1.6}>
                    Please <strong>do not disclose findings publicly</strong> without our prior written approval. Ensure sensitive data obtained during testing is deleted immediately.
                  </Typography>
                  <Box mt={3}>
                    <a href="mailto:security@myhandle.in" style={{ textDecoration: 'none' }}>
                      <Typography 
                        component="span" 
                        sx={{ 
                          color: '#3b82f6', 
                          fontWeight: 600, 
                          fontSize: '1.1rem',
                          borderBottom: '2px solid transparent',
                          transition: 'all 0.2s',
                          '&:hover': { borderBottomColor: '#3b82f6' }
                        }}
                      >
                        security@myhandle.in
                      </Typography>
                    </a>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* --- 5. REWARDS --- */}
            <Grid item xs={12} md={6}>
              <Card sx={cardStyle}>
                <CardContent sx={{ p: 4 }}>
                  <Box display="flex" alignItems="center" gap={2} mb={3}>
                    <CardGiftcardOutlinedIcon sx={{ fontSize: 28, color: '#f59e0b' }} /> {/* Amber Icon */}
                    <Typography variant="h6" fontWeight={700} color="#1e293b">
                      Rewards & Recognition
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="#64748b" mb={3}>
                    You may be eligible for a reward if:
                  </Typography>
                  <List disablePadding>
                    <PolicyListItem text="You are the first to report the issue." />
                    <PolicyListItem text="The vulnerability is valid and verified by our team." />
                    <PolicyListItem text="You’ve followed all terms and guidelines outlined here." />
                  </List>
                  <Divider sx={{ my: 2, borderColor: '#e2e8f0' }} />
                  <Typography variant="caption" color="#94a3b8">
                    Note: Rewards are at our sole discretion and not guaranteed.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

          </Grid>
        </Container>
      </Box>
      <Footer />
    </>
  );
};

export default DisclosurePolicy;
import React from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Box,
  Stack,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  useTheme,
  useMediaQuery,
  Avatar
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import BoltIcon from '@mui/icons-material/Bolt';

export default function Support() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  // Configuration
  const WHATSAPP_NUMBER = "8143187697"; // Replace with real number
  const EMAIL_ADDRESS = "support@chomske.com";

  const handleWhatsAppClick = () => {
    // Opens WhatsApp in a new tab
    window.open(`https://wa.me/${WHATSAPP_NUMBER}`, '_blank');
  };

  const handleEmailClick = () => {
    window.location.href = `mailto:${EMAIL_ADDRESS}`;
  };

  return (
    <Box sx={{ 
      py: isMobile ? 6 : 10, 
      px: isMobile ? 2 : 4,
      background: 'linear-gradient(180deg, #FFFFFF 0%, #F8F9FA 100%)' // Subtle gradient background
    }}>
      
      {/* --- Header Section --- */}
      <Box sx={{ mb: 6, textAlign: 'center', maxWidth: 600, mx: 'auto' }}>
        <Typography 
          component="h2" 
          sx={{ 
            fontWeight: 700, 
            fontSize: isMobile ? '20px' : '36px',
            fontFamily: 'Inter',
            color: '#1a1a1a',
            mb: 1
          }}
        >
          We're here to help
        </Typography>
        <Typography 
          variant="body1" 
          color="text.secondary" 
          sx={{ fontSize: isMobile ? '14px' : '16px', lineHeight: 1.6, fontFamily: 'Inter' }}
        >
          Choose the channel that suits you best.
        </Typography>
      </Box>

      {/* --- Cards Grid --- */}
      <Grid container spacing={isMobile ? 3 : 4} justifyContent="center" alignItems="stretch">
        
        {/* --- Option 1: WhatsApp (Faster) --- */}
        <Grid size={{ xs: 12, md: 5, lg: 4 }}>
          <Card 
            elevation={0} 
            sx={{ 
              height: '100%',
              borderRadius: 5,
              border: '1px solid #E0E0E0',
              position: 'relative',
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'translateY(-8px)',
                boxShadow: '0 12px 30px rgba(0,0,0,0.08)',
                borderColor: '#25D366' // WhatsApp Green Border on Hover
              }
            }}
          >
            <CardContent sx={{ p: isMobile ? 3 : 5, display: 'flex', flexDirection: 'column', height: '100%' }}>
              
              {/* Badge */}
              <Box sx={{ mb: 3 }}>
                 <Chip 
                    icon={<BoltIcon sx={{ fontSize: 16 }} />} 
                    label="Fastest Response" 
                    size="small"
                    sx={{ 
                        backgroundColor: '#E7FBF0', 
                        color: '#0F7B40', 
                        fontWeight: 600,
                        border: '1px solid #C4F2D8'
                    }} 
                 />
              </Box>

              <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
                <Avatar sx={{ bgcolor: '#25D366', width: 56, height: 56 }}>
                    <WhatsAppIcon sx={{ fontSize: 32, color: '#fff' }} />
                </Avatar>
                <Box>
                    <Typography sx={{ fontFamily : 'inter', fontWeight : 700, fontSize : isMobile ? '20px' : '20px'}}>WhatsApp Support</Typography>
                    <Typography color="text.secondary" sx={{ fontFamily : 'inter', fontWeight : 400, fontSize : isMobile ? '14px' : '14px', mt: 0.25}}>Avg. response time: &lt; 15 mins</Typography>
                </Box>
              </Stack>

              <Typography variant="body2" color="text.secondary" sx={{ mb: 4, flexGrow: 1 }}>
                Great for quick questions, bug reports, feature updates, or checking status updates on the go.
              </Typography>

              <Button
                fullWidth
                variant="contained"
                onClick={handleWhatsAppClick}
                startIcon={<WhatsAppIcon />}
                sx={{
                  py: 1.5,
                  borderRadius: 3,
                  textTransform: 'none',
                  fontSize: '16px',
                  fontWeight: 600,
                  backgroundColor: '#25D366',
                  boxShadow: '0 4px 14px 0 rgba(37, 211, 102, 0.39)',
                  '&:hover': {
                    backgroundColor: '#1da851',
                    boxShadow: '0 6px 20px 0 rgba(37, 211, 102, 0.23)',
                  }
                }}
              >
                Chat on WhatsApp
              </Button>
            </CardContent>
          </Card>
        </Grid>

        {/* --- Option 2: Email (Detailed) --- */}
        <Grid  size={{ xs: 12, md: 5, lg: 4 }}>
          <Card 
            elevation={0} 
            sx={{ 
              height: '100%',
              borderRadius: 5,
              border: '1px solid #E0E0E0',
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'translateY(-8px)',
                boxShadow: '0 12px 30px rgba(0,0,0,0.08)',
                borderColor: '#2D2A69' // Brand Blue Border on Hover
              }
            }}
          >
            <CardContent sx={{ p: isMobile ? 3 : 5, display: 'flex', flexDirection: 'column', height: '100%' }}>
              
               {/* Spacer for visual alignment with the chip on the other card */}
               <Box sx={{ mb: 3, height: 24 }} /> 

              <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
                <Avatar sx={{ bgcolor: '#F5F5FA', width: 56, height: 56 }}>
                    <MailOutlineIcon sx={{ fontSize: 30, color: '#2D2A69' }} />
                </Avatar>
                <Box>
                    <Typography variant="h6" fontWeight={700} color="#2D2A69">Priority Email</Typography>
                    <Typography variant="body2" color="text.secondary">Comprehensive solutions</Typography>
                </Box>
              </Stack>

              <List disablePadding sx={{ mb: 4, flexGrow: 1 }}>
                {[
                  "In-depth Account Setup",
                  "Bug Resolutions & Tech Support",
                  "Guaranteed 48hr Resolution Window",
                  "Detailed Feature Walkthroughs"
                ].map((text, index) => (
                  <ListItem key={index} disableGutters sx={{ py: 0.75 }}>
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <CheckCircleIcon sx={{ fontSize: 20, color: '#2D2A69' }} />
                    </ListItemIcon>
                    <ListItemText 
                        primary={text} 
                        primaryTypographyProps={{ 
                            fontSize: '14px', 
                            color: 'text.secondary',
                            fontWeight: 500
                        }} 
                    />
                  </ListItem>
                ))}
              </List>

              <Button
                fullWidth
                variant="outlined"
                onClick={handleEmailClick}
                startIcon={<MailOutlineIcon />}
                sx={{
                  py: 1.5,
                  borderRadius: 3,
                  textTransform: 'none',
                  fontSize: '16px',
                  fontWeight: 600,
                  color: '#2D2A69',
                  borderColor: '#2D2A69',
                  borderWidth: '2px',
                  '&:hover': {
                    borderWidth: '2px',
                    borderColor: '#2D2A69',
                    backgroundColor: '#F5F5FA',
                  }
                }}
              >
                {EMAIL_ADDRESS}
              </Button>
            </CardContent>
          </Card>
        </Grid>

      </Grid>
    </Box>
  );
}
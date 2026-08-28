import React from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  useMediaQuery,
  useTheme,
  Stack,
  Grid,
  Chip,
  Divider,
  Avatar,
  Paper,
  Container,
} from '@mui/material';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import KeyboardOutlinedIcon from '@mui/icons-material/KeyboardOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import FavoriteOutlinedIcon from '@mui/icons-material/FavoriteOutlined';
import ReplyOutlinedIcon from '@mui/icons-material/ReplyOutlined';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import FlashOnOutlinedIcon from '@mui/icons-material/FlashOnOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useNavigate } from 'react-router-dom';

/**
 * InstagramAutomationBlock (Aligned + Mobile Responsive, JS)
 * - Cards are equal height and perfectly centered
 * - Grids use stretch alignment; cards flex to fill
 * - Ribbons are consistent; content spacing normalized
 * - Use-cases are equal height and centered
 */

export default function InstagramAutomationBlock() {
  const theme = useTheme();
  const isXs = useMediaQuery(theme.breakpoints.down('sm'));
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const navigate = useNavigate();

  return (
    <Box
      component="section"
      sx={{
        width: '100%',
        py: { xs: 6, md: 10 },
        background: 'linear-gradient(180deg, #450693, #FFF5F5)',
      }}
    >
      <Container maxWidth="lg">
        <Card elevation={0} sx={{ bgcolor: 'transparent' }}>
          <CardContent sx={{ p: { xs: 0, md: 2 } }}>
            <Stack spacing={{ xs: 4, md: 6 }} alignItems="center">
              {/* Header Badge */}
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                aria-label="Smart Automation badge"
                sx={{
                  background: 'linear-gradient(135deg, #FDF4E3, #6F00FF)',
                  border: '1px solid rgba(225,48,108,0.2)',
                  px: 2,
                  py: 0.85,
                  borderRadius: 999,
                }}
              >
                <BoltOutlinedIcon sx={{ fontSize: 20, color: '#0046FF' }} />
                <Typography sx={{ fontWeight: 700, fontSize: 14, color: '#FFFFFF'}}>Smart Automation</Typography>
              </Stack>

              {/* Main Headline */}
              <Stack spacing={2} alignItems="center" sx={{ textAlign: 'center', maxWidth: 840 }}>
                <Typography
                  variant={isXs ? 'h4' : 'h3'}
                  component="h2"
                  sx={{
                    fontWeight: 900,
                    lineHeight: 1.15,
                    letterSpacing: -0.3,
                    background: 'linear-gradient(135deg, #EEEEEE, #0046FF)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  Never miss a conversation
                </Typography>
                <Typography
                  variant="body1"
                  sx={{
                    fontSize: { xs: 16, md: 18 },
                    color: '#F5F5F0',
                    maxWidth: 680,
                    lineHeight: 1.6,
                  }}
                >
                  Respond instantly to comments and DMs with intelligent, keyword-based automation that keeps your audience engaged 24/7.
                </Typography>
              </Stack>

              {/* Value Props Row */}
              <Stack
                direction="row"
                spacing={1.25}
                useFlexGap
                flexWrap="wrap"
                justifyContent="center"
                sx={{ width: '100%' }}
              >
                <Chip icon={<AccessTimeOutlinedIcon />} label="Save hours every day" sx={valueChipStyle()} />
                <Chip icon={<TrendingUpOutlinedIcon />} label="Boost engagement rate" sx={valueChipStyle()} />
                <Chip icon={<FavoriteOutlinedIcon />} label="Build stronger connections" sx={valueChipStyle()} />
              </Stack>

              {/* Visual Automation Flow */}
              <Box sx={{ width: '100%',  mx: 'auto' }}>
                <Grid container spacing={{ xs: 2, md: 3 }} alignItems="center" justifyContent="center">
                  {/* Comment Automation Card */}
                  <Grid item xs={12} md={6} sx={{ display: 'flex' }}>
                    <Card
                      variant="outlined"
                      sx={{
                        borderRadius: 4,
                        borderWidth: 2,
                        borderColor: 'rgba(225,48,108,0.2)',
                        display: 'flex',
                        flexDirection: 'column',
                        flex: 1,
                        position: 'relative',
                        overflow: 'visible',
                        height: '100%',
                        minHeight: { md: 460 },
                        transition: reduceMotion ? 'border-color 0.2s ease' : 'all 0.3s ease',
                        '&:hover': {
                          borderColor: '#E1306C',
                          transform: reduceMotion ? 'none' : 'translateY(-4px)',
                          boxShadow: reduceMotion ? 'none' : '0 12px 24px rgba(225,48,108,0.15)',
                        },
                      }}
                    >
                      <Ribbon color="#E1306C" icon={<ForumOutlinedIcon sx={{ fontSize: 18 }} />} label="Comment Replies" />

                      <CardContent sx={{ pt: 5, px: { xs: 2, md: 3 }, pb: 3, display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <Stack spacing={3} sx={{ width: '100%', flex: 1 }}>
                          <Typography sx={{ fontSize: 18, fontWeight: 700, lineHeight: 1.4 }}>
                            Auto-respond to comments intelligently
                          </Typography>

                          {/* Flow visualization */}
                          <Stack spacing={2} sx={{ flex: 1 }}>
                            <FlowStep
                              icon={<KeyboardOutlinedIcon />}
                              title="Set keyword triggers"
                              description='Like "price", "shipping", "available"'
                              color="#E1306C"
                            />
                            <ArrowDown />
                            <FlowStep
                              icon={<SmartToyOutlinedIcon />}
                              title="Craft smart responses"
                              description="Personalized, on-brand replies"
                              color="#C13584"
                            />
                            <ArrowDown />
                            <FlowStep
                              icon={<ReplyOutlinedIcon />}
                              title="Instant engagement"
                              description="Reply within seconds, every time"
                              color="#833AB4"
                            />
                          </Stack>

                          <Box sx={{ mt: 'auto' }}>
                            <FeatureList
                              items={[
                                'Works on all your posts',
                                'Multiple keyword rules',
                                'Customize per campaign',
                              ]}
                              color="#E1306C"
                            />
                          </Box>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>

                  {/* DM Automation Card */}
                  <Grid item xs={12} md={6} sx={{ display: 'flex' }}>
                    <Card
                      variant="outlined"
                      sx={{
                        borderRadius: 4,
                        borderWidth: 2,
                        borderColor: 'rgba(131,58,180,0.2)',
                        display: 'flex',
                        flexDirection: 'column',
                        width: '100%',
                        flex: 1,
                        position: 'relative',
                        overflow: 'visible',
                        height: '100%',
                        minHeight: { md: 460 },
                        transition: reduceMotion ? 'border-color 0.2s ease' : 'all 0.3s ease',
                        '&:hover': {
                          borderColor: '#833AB4',
                          transform: reduceMotion ? 'none' : 'translateY(-4px)',
                          boxShadow: reduceMotion ? 'none' : '0 12px 24px rgba(131,58,180,0.15)',
                        },
                      }}
                    >
                      <Ribbon color="#833AB4" icon={<SendOutlinedIcon sx={{ fontSize: 18 }} />} label="Direct Messages" />

                      <CardContent sx={{ pt: 5, px: { xs: 2, md: 3 }, pb: 3, display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <Stack spacing={3} sx={{ width: '100%', flex: 1 }}>
                          <Typography sx={{ fontSize: 18, fontWeight: 700, lineHeight: 1.4 }}>
                            Auto DM commented users intelligently
                          </Typography>

                          {/* Flow visualization */}
                          <Stack spacing={2} sx={{ flex: 1 }}>
                            <FlowStep
                              icon={<NotificationsActiveOutlinedIcon />}
                              title="Detect keywords in comments"
                              description='Spot "interested", "more info", etc.'
                              color="#833AB4"
                            />
                            <ArrowDown />
                            <FlowStep
                              icon={<MailOutlineIcon />}
                              title="Send personalized DM"
                              description="Share links, details, or offers"
                              color="#5851DB"
                            />
                            <ArrowDown />
                            <FlowStep
                              icon={<TrendingUpOutlinedIcon />}
                              title="Convert instantly"
                              description="Turn interest into action"
                              color="#405DE6"
                            />
                          </Stack>

                          <Box sx={{ mt: 'auto' }}>
                            <FeatureList items={[ 'Privacy-first approach', 'Smart rate limiting', 'Track conversions' ]} color="#833AB4" />
                          </Box>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              </Box>

              {/* Use Cases Grid */}
              <Box sx={{ width: '100%', maxWidth: 1040, mx: 'auto' }}>
                <Typography component="h3" sx={{ fontSize: 20, fontWeight: 700, textAlign: 'center', mb: 2.5, color: 'text.primary' }}>
                  Perfect for every creator
                </Typography>

                <Grid container spacing={{ xs: 2, md: 3 }} alignItems="stretch" justifyContent="center">
                  {useCases.map((useCase, idx) => (
                    <Grid item xs={12} sm={6} md={4} key={idx} sx={{ display: 'flex' }}>
                      <Paper
                        elevation={0}
                        sx={{
                          p: 2.5,
                          borderRadius: 3,
                          bgcolor: 'white',
                          border: '1px solid',
                          borderColor: 'rgba(0,0,0,0.08)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 1.25,
                          flex: 1,
                          transition: reduceMotion ? 'border-color 0.2s ease' : 'all 0.2s ease',
                          '&:hover': {
                            borderColor: useCase.color,
                            transform: reduceMotion ? 'none' : 'translateY(-2px)',
                            boxShadow: reduceMotion ? 'none' : `0 8px 16px ${useCase.color}15`,
                          },
                        }}
                      >
                        <Avatar sx={{ bgcolor: `${useCase.color}15`, color: useCase.color, width: 44, height: 44 }}>
                          {useCase.icon}
                        </Avatar>
                        <Typography sx={{ fontWeight: 700, fontSize: 15 }}>{useCase.title}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                          {useCase.description}
                        </Typography>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              </Box>

              <Divider sx={{ width: '100%' }} />

              {/* Bottom CTA Section */}
              <Stack spacing={2.5} alignItems="center" sx={{ textAlign: 'center', width: '100%' }}>
                <Stack spacing={1} sx={{ maxWidth: 560 }}>
                  <Typography sx={{ fontSize: 24, fontWeight: 800 }}>Stay connected, effortlessly</Typography>
                  <Typography color="text.secondary">
                    Set up your automation rules once and watch your engagement soar while you focus on creating great content.
                  </Typography>
                </Stack>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ width: '100%', maxWidth: 560 }}>
                  <Button
                    onClick={() => navigate('/professional/login')}
                    variant="contained"
                    size="large"
                    endIcon={<FlashOnOutlinedIcon />}
                    fullWidth={isXs}
                    sx={{
                      textTransform: 'none',
                      borderRadius: 999,
                      px: 4,
                      py: 1.5,
                      fontWeight: 800,
                      fontSize: 16,
                      background: 'linear-gradient(135deg, #E1306C, #C13584, #833AB4)',
                      boxShadow: reduceMotion ? 0 : '0 4px 14px rgba(225,48,108,0.4)',
                      '&:hover': {
                        background: 'linear-gradient(135deg, #C13584, #833AB4, #5851DB)',
                        boxShadow: reduceMotion ? 0 : '0 6px 20px rgba(225,48,108,0.5)',
                      },
                    }}
                  >
                    Start Automating
                  </Button>
                  <Button
                    onClick={() => navigate('/trust-center')}
                    variant="outlined"
                    size="large"
                    endIcon={<ArrowForwardIcon />}
                    fullWidth={isXs}
                    sx={{
                      textTransform: 'none',
                      borderRadius: 999,
                      px: 4,
                      py: 1.5,
                      fontWeight: 700,
                      fontSize: 16,
                      borderColor: 'rgba(0,0,0,0.2)',
                      color: 'text.primary',
                      '&:hover': {
                        borderColor: '#E1306C',
                        bgcolor: 'rgba(225,48,108,0.05)',
                      },
                    }}
                  >
                    Trust Center
                  </Button>
                </Stack>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}

// Helper Components
function Ribbon({ color, icon, label }) {
  return (
    <Box
      sx={{
        position: 'absolute',
        top: -16,
        left: { xs: 16, md: 24 },
        bgcolor: color,
        color: 'white',
        px: 2,
        py: 0.75,
        borderRadius: 999,
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        boxShadow: `0 4px 12px ${color}4D`,
        whiteSpace: 'nowrap',
      }}
    >
      {icon}
      <Typography sx={{ fontWeight: 700, fontSize: 13 }}>{label}</Typography>
    </Box>
  );
}

function FlowStep({ icon, title, description, color }) {
  return (
    <Paper elevation={0} sx={{ p: 2, borderRadius: 2, bgcolor: 'white', border: '1.5px solid', borderColor: `${color}30` }}>
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <Avatar sx={{ bgcolor: `${color}15`, color: color, width: 36, height: 36 }}>{icon}</Avatar>
        <Stack spacing={0.25} sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{title}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13 }}>
            {description}
          </Typography>
        </Stack>
      </Stack>
    </Paper>
  );
}

function ArrowDown() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', my: -0.5 }} aria-hidden>
      <Box
        sx={{
          width: 2,
          height: 20,
          bgcolor: 'rgba(0,0,0,0.12)',
          position: 'relative',
          '&::after': {
            content: '""',
            position: 'absolute',
            bottom: -4,
            left: -3,
            width: 0,
            height: 0,
            borderLeft: '4px solid transparent',
            borderRight: '4px solid transparent',
            borderTop: '6px solid rgba(0,0,0,0.12)',
          },
        }}
      />
    </Box>
  );
}

function FeatureList({ items, color }) {
  return (
    <Paper elevation={0} sx={{ bgcolor: `${color}0F`, p: 2, borderRadius: 2, border: `1px solid ${color}26` }}>
      <Stack spacing={0.75}>
        {items.map((text, i) => (
          <Stack key={i} direction="row" spacing={1} alignItems="center">
            <CheckCircleIcon sx={{ fontSize: 16, color }} />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {text}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
}

// Styling helper
function valueChipStyle() {
  return {
    borderRadius: 999,
    fontSize: 14,
    fontWeight: 600,
    bgcolor: 'white',
    border: '1.5px solid rgba(0,0,0,0.08)',
    px: 0.5,
    height: 36,
    '& .MuiChip-icon': { ml: 0.5, fontSize: 18, color: '#E1306C' },
  };
}

// Use cases data
const useCases = [
  {
    icon: <AutoAwesomeOutlinedIcon />,
    title: 'Product launches',
    description: 'Auto-reply with launch details and send DMs with exclusive access links',
    color: '#E1306C',
  },
  {
    icon: <TrendingUpOutlinedIcon />,
    title: 'Growing accounts',
    description: 'Respond to every comment instantly to boost engagement and algorithmic reach',
    color: '#C13584',
  },
  {
    icon: <MailOutlineIcon />,
    title: 'Lead generation',
    description: 'Send pricing info or booking links automatically when someone shows interest',
    color: '#833AB4',
  },
  {
    icon: <FavoriteOutlinedIcon />,
    title: 'Community building',
    description: 'Thank followers, answer FAQs, and nurture relationships at scale',
    color: '#5851DB',
  },
  {
    icon: <NotificationsActiveOutlinedIcon />,
    title: 'Event promotion',
    description: 'Share event details and RSVP links instantly when people ask',
    color: '#405DE6',
  },
  {
    icon: <FlashOnOutlinedIcon />,
    title: 'Time-sensitive offers',
    description: 'Deliver discount codes and limited-time deals while the moment is hot',
    color: '#FD1D1D',
  },
];
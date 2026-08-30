import { Box, Typography, useMediaQuery, Grid, Card, CardContent, Avatar, Link } from '@mui/material';
import Navbar from './Navbar';
import Footer from './Footer';
import BoltIcon from '@mui/icons-material/Bolt';
import WebhookIcon from '@mui/icons-material/Webhook';
import ShieldIcon from '@mui/icons-material/Shield';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import GroupIcon from '@mui/icons-material/Group';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { Helmet } from 'react-helmet';

const AboutUs = () => {
  const isMobile = useMediaQuery('(max-width:600px)');

  return (
    <>
      <Helmet>
        <title>About Us | MyHandle</title>
        <meta
          name="description"
          content="MyHandle sends instant WhatsApp alerts when your server goes down, a payment fails, or a critical event fires. No WhatsApp API required — paste one webhook and you're live in 5 minutes."
        />
        <link rel="canonical" href="https://chomske.com/about-us" />
        <meta property="og:title" content="About Us | MyHandle" />
        <meta
          property="og:description"
          content="We built the fastest way for SaaS founders to get WhatsApp alerts from any webhook source — Stripe, Vercel, Sentry, and more. No API setup. $9/mo."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://chomske.com/about-us" />
        <meta property="og:image" content="https://storage.googleapis.com/postlnbucketcom/products/maximize.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="About Us | MyHandle" />
        <meta
          name="twitter:description"
          content="WhatsApp alerts for server downtime, failed payments, and critical events. Paste one webhook. Sleep soundly. No WhatsApp API required."
        />
        <meta name="twitter:image" content="https://storage.googleapis.com/postlnbucketcom/products/maximize.png" />
      </Helmet>

      <Navbar />

      <Box sx={{ padding: isMobile ? 3 : 8, mt: 10 }}>
        <Typography sx={{ fontWeight: 700, fontSize: isMobile ? '32px' : '40px', mb: 2 }}>
          About MyHandle
        </Typography>

        <Typography sx={{ fontWeight: 400, fontSize: isMobile ? '18px' : '22px', mb: 6, color: 'text.secondary' }}>
          MyHandle is the fastest way for SaaS founders and developers to receive WhatsApp alerts from any
          webhook source. No WhatsApp Business API, no complex setup — paste one URL and you're live in under
          5 minutes. We handle the routing, escalation, and delivery so you can focus on building.
        </Typography>

        <Grid container spacing={4}>
          <Grid item xs={12} md={4}>
            <Card sx={{ borderRadius: 4, boxShadow: 3, height: '100%' }}>
              <CardContent>
                <Avatar sx={{ bgcolor: '#0ea5e9', mb: 2 }}>
                  <BoltIcon />
                </Avatar>
                <Typography sx={{ fontSize: '18px', fontWeight: 700 }}>
                  5-Minute Setup
                </Typography>
                <Typography variant="body1" sx={{ mt: 1 }}>
                  Generate a webhook URL, paste it into Stripe, Vercel, Sentry, or any platform that supports
                  webhooks, and receive your first WhatsApp alert before your coffee gets cold.
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card sx={{ borderRadius: 4, boxShadow: 3, height: '100%' }}>
              <CardContent>
                <Avatar sx={{ bgcolor: '#25D366', mb: 2 }}>
                  <NotificationsActiveIcon />
                </Avatar>
                <Typography sx={{ fontSize: '18px', fontWeight: 700 }}>
                  P0 / P1 Priority Tiers
                </Typography>
                <Typography variant="body1" sx={{ mt: 1 }}>
                  Not every alert is a fire. Tag webhooks as P0 (critical) or P1 (important) so your team
                  gets the right level of urgency — including phone call escalation for incidents that can't wait.
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card sx={{ borderRadius: 4, boxShadow: 3, height: '100%' }}>
              <CardContent>
                <Avatar sx={{ bgcolor: '#6366f1', mb: 2 }}>
                  <WebhookIcon />
                </Avatar>
                <Typography sx={{ fontSize: '18px', fontWeight: 700 }}>
                  No WhatsApp API Required
                </Typography>
                <Typography variant="body1" sx={{ mt: 1 }}>
                  Most WhatsApp notification tools require Meta Business approval, a verified number, and weeks of
                  setup. MyHandle needs none of that — you receive alerts on your personal WhatsApp instantly.
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Box sx={{ mt: 8, maxWidth: 1000 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
            Our Mission
          </Typography>
          <Typography sx={{ fontSize: '18px', color: 'text.primary' }}>
            No founder should be the last to know when their product breaks. We're building the simplest,
            most reliable bridge between the tools you already use and the WhatsApp you already have open —
            so critical events reach you in seconds, not hours.
          </Typography>
        </Box>

        <Box sx={{ mt: 8, maxWidth: 1000 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>
            How it works
          </Typography>

          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <Typography sx={{ fontWeight: 800 }}>Any Webhook Source</Typography>
              <Typography sx={{ color: '#374151' }}>
                Works with Stripe, Vercel, Sentry, GitHub, PagerDuty, Grafana, or any custom service that
                can fire an HTTP POST. If it has a webhook, MyHandle can alert you.
              </Typography>
            </Grid>

            <Grid item xs={12} md={4}>
              <Typography sx={{ fontWeight: 800 }}>Smart Escalation Chain</Typography>
              <Typography sx={{ color: '#374151' }}>
                Set primary and backup recipients. If a P0 alert goes unacknowledged within your configured
                window, it automatically escalates — up to a phone call if needed.
              </Typography>
            </Grid>

            <Grid item xs={12} md={4}>
              <Typography sx={{ fontWeight: 800 }}>Quiet Hours & Team Controls</Typography>
              <Typography sx={{ color: '#374151' }}>
                Configure quiet hours so non-critical alerts don't wake your team at 2am. Add team members,
                assign alert ownership, and keep everyone in the loop without the noise.
              </Typography>
            </Grid>
          </Grid>
        </Box>

        <Box sx={{ mt: 8 }}>
          <Grid container spacing={4}>
            <Grid item xs={12} md={6}>
              <Card sx={{ borderRadius: 4, boxShadow: 2, height: '100%' }}>
                <CardContent>
                  <Avatar sx={{ bgcolor: '#f59e0b', mb: 2 }}>
                    <GroupIcon />
                  </Avatar>
                  <Typography sx={{ fontSize: '18px', fontWeight: 700 }}>Built for Small Teams</Typography>
                  <Typography sx={{ mt: 1 }}>
                    Whether you're a solo founder or a team of ten, MyHandle scales with you. Add team members,
                    share alert channels, and make sure no critical event slips through the cracks.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card sx={{ borderRadius: 4, boxShadow: 2, height: '100%' }}>
                <CardContent>
                  <Avatar sx={{ bgcolor: '#0d9488', mb: 2 }}>
                    <ShieldIcon />
                  </Avatar>
                  <Typography sx={{ fontSize: '18px', fontWeight: 700 }}>Privacy & Security</Typography>
                  <Typography sx={{ mt: 1 }}>
                    Your webhook payloads are processed and discarded — we don't store sensitive event data.
                    Encrypted in transit, no third-party data sharing, and full control to revoke access anytime.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>

        <Box sx={{ mt: 8, maxWidth: 1000 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>
            Say hello
          </Typography>
          <Typography sx={{ color: 'text.secondary' }}>
            Questions, partnerships, or press? Write to us at{' '}
            <Link href="mailto:support@chomske.com">support@chomske.com</Link>.
          </Typography>
        </Box>
      </Box>

      <Footer />
    </>
  );
};

export default AboutUs;

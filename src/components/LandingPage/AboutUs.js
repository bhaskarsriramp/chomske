import { Box, Typography, useMediaQuery, Grid, Card, CardContent, Avatar, Link } from '@mui/material';
import Navbar from './Navbar';
import Footer from './Footer';
import BoltIcon from '@mui/icons-material/Bolt';
import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupee';
import VerifiedIcon from '@mui/icons-material/Verified';
import ShieldIcon from '@mui/icons-material/Shield';
import InsightsIcon from '@mui/icons-material/Insights';
import SmartphoneIcon from '@mui/icons-material/Smartphone';
import { Helmet } from 'react-helmet';

const AboutUs = () => {
  const isMobile = useMediaQuery('(max-width:600px)');

  return (
    <>
      <Helmet>
        <title>About Us | MyHandle</title>
        <meta
          name="description"
          content="MyHandle is a link-in-bio and creator tools platform built in India: fast pages, UPI & WhatsApp actions, realtime follower trust badges, and clear analytics."
        />

        {/* Canonical URL */}
        <link rel="canonical" href="https://myhandle.in/about-us" />

        {/* Open Graph */}
        <meta property="og:title" content="About Us | MyHandle" />
        <meta
          property="og:description"
          content="We help creators and small businesses turn profile traffic into customers with trusted, fast, and India-first link-in-bio pages."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://myhandle.in/about-us" />
        <meta property="og:image" content="https://storage.googleapis.com/postlnbucketcom/products/maximize.png" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="About Us | MyHandle" />
        <meta
          name="twitter:description"
          content="MyHandle gives you a beautiful bio page with UPI/WhatsApp actions, smart blocks, and privacy-first analytics. Made in India for creators everywhere."
        />
        <meta name="twitter:image" content="https://storage.googleapis.com/postlnbucketcom/products/maximize.png" />
      </Helmet>

      <Navbar />

      <Box sx={{ padding: isMobile ? 3 : 8, mt: 10 }}>
        <Typography sx={{ fontWeight: 700, fontSize: isMobile ? '32px' : '40px', mb: 2 }}>
          About MyHandle
        </Typography>

        <Typography sx={{ fontWeight: 400, fontSize: isMobile ? '18px' : '22px', mb: 6, color: 'text.secondary' }}>
          MyHandle helps creators and small businesses turn profile views into actions. We built an India‑first
          link‑in‑bio and mini‑site that feels fast, looks great, and earns trust — with real‑time follower badges,
          UPI & WhatsApp actions, and clean analytics you actually understand.
        </Typography>

        <Grid container spacing={4}>
          <Grid item xs={12} md={4}>
            <Card sx={{ borderRadius: 4, boxShadow: 3, height: '100%' }}>
              <CardContent>
                <Avatar sx={{ bgcolor: '#0ea5e9', mb: 2 }}>
                  <BoltIcon />
                </Avatar>
                <Typography sx={{ fontSize: '18px', fontWeight: 700 }}>
                  Fast, Beautiful, Reliable
                </Typography>
                <Typography variant="body1" sx={{ mt: 1 }}>
                  Pages load in a blink and work on every device. Prebuilt themes, smart blocks (links, media, socials,
                  shoppable items) and automatic image optimization keep things crisp and quick.
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card sx={{ borderRadius: 4, boxShadow: 3, height: '100%' }}>
              <CardContent>
                <Avatar sx={{ bgcolor: '#22c55e', mb: 2 }}>
                  <VerifiedIcon />
                </Avatar>
                <Typography sx={{ fontSize: '18px', fontWeight: 700 }}>
                  Trust That Converts
                </Typography>
                <Typography variant="body1" sx={{ mt: 1 }}>
                  Optional real‑time follower count badges and verified social links help visitors trust your page. Clear
                  CTAs like <strong>WhatsApp</strong> and <strong>UPI</strong> drive action, not just clicks.
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card sx={{ borderRadius: 4, boxShadow: 3, height: '100%' }}>
              <CardContent>
                <Avatar sx={{ bgcolor: '#ef4444', mb: 2 }}>
                  <CurrencyRupeeIcon />
                </Avatar>
                <Typography sx={{ fontSize: '18px', fontWeight: 700 }}>
                  Fair, India‑First Pricing
                </Typography>
                <Typography variant="body1" sx={{ mt: 1 }}>
                  Why pay 10× more for foreign tools? Get locally‑priced plans, GST invoices, and payment methods that
                  work here.
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
            Give every creator and small business a trustworthy home on the internet that converts attention into
            outcomes — sales, sign‑ups, bookings, and conversations — without complexity.
          </Typography>
        </Box>

        <Box sx={{ mt: 8, maxWidth: 1000 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>
            Our approach
          </Typography>

          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <Typography sx={{ fontWeight: 800 }}>Own Your Funnel</Typography>
              <Typography sx={{ color: '#374151' }}>
                Move traffic from bios and stories to a page you control. Add store links, forms, and messaging actions
                so every visit has a clear next step.
              </Typography>
            </Grid>

            <Grid item xs={12} md={4}>
              <Typography sx={{ fontWeight: 800 }}>Convert With Native Actions</Typography>
              <Typography sx={{ color: '#374151' }}>
                One‑tap <strong>WhatsApp</strong>, <strong>UPI</strong>, and <strong>Call</strong> buttons reduce
                friction for buyers and clients. Auto‑formatted links for Instagram, YouTube, and more.
              </Typography>
            </Grid>

            <Grid item xs={12} md={4}>
              <Typography sx={{ fontWeight: 800 }}>Measure What Matters</Typography>
              <Typography sx={{ color: '#374151' }}>
                Privacy‑respecting analytics with views, CTR, and top referrers. Export data and integrate pixels when
                you need deeper attribution.
              </Typography>
            </Grid>
          </Grid>
        </Box>

        <Box sx={{ mt: 8 }}>
          <Grid container spacing={4}>
            <Grid item xs={12} md={6}>
              <Card sx={{ borderRadius: 4, boxShadow: 2, height: '100%' }}>
                <CardContent>
                  <Avatar sx={{ bgcolor: '#6366f1', mb: 2 }}>
                    <SmartphoneIcon />
                  </Avatar>
                  <Typography sx={{ fontSize: '18px', fontWeight: 700 }}>Built for Speed</Typography>
                  <Typography sx={{ mt: 1 }}>
                    CDN delivery, image compression, and lightweight pages keep things lightning‑fast even on 3G.
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
                  <Typography sx={{ fontSize: '18px', fontWeight: 700 }}>Privacy & Control</Typography>
                  <Typography sx={{ mt: 1 }}>
                    You own your data. We never sell it. Simple controls to disable tracking, export your page, and
                    disconnect integrations.
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
            <Link href="mailto:support@myhandle.in">support@myhandle.in</Link>.
          </Typography>
        </Box>
      </Box>

      <Footer />
    </>
  );
};

export default AboutUs;

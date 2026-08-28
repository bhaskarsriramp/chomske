import { Box, Typography, Container, Grid } from '@mui/material';
import saveTimeImage from '../images/startup-3267505_1280.jpg'; // Update path if you change image
import Navbar from './Navbar';
import Footer from './Footer';
import { Helmet } from "react-helmet";

export default function SaveTimePage() {
  return (
    <>
      <Helmet>
        <title>Save 43+ Hours Every Month | PostLn</title>
        <meta
          name="description"
          content="PostLn helps public speakers, founders, and creators save over 43 hours every month by automating LinkedIn post creation in your tone and style."
        />
        <meta
          property="og:title"
          content="Save 43+ Hours Every Month | PostLn"
        />
        <meta
          property="og:description"
          content="PostLn helps you skip the research and rewrite process. Go from idea to scheduled LinkedIn post in 3 minutes—saving 86+ minutes per day."
        />
        <meta property="og:type" content="website" />

          {/* Canonical URL */}
  <link rel="canonical" href="https://www.postln.com/save-time" />


      </Helmet>

      <Navbar />

      <Container maxWidth="lg" sx={{ py: 10 }}>
        {/* Title Section */}
        <Box textAlign="center" mb={6}>
          <Typography variant="h4" fontWeight="bold" gutterBottom>
            Save 43+ Hours Every Month
          </Typography>
          <Typography variant="h6" color="text.secondary">
            Automate your content. Keep your voice. Reclaim your time.
          </Typography>
        </Box>

        {/* Content Section */}
        <Grid container spacing={6} alignItems="center">
          {/* Image Section */}
          <Grid item xs={12} md={6}>
            <Box
              component="img"
              src={saveTimeImage}
              alt="Time-saving productivity illustration"
              sx={{ width: '100%', borderRadius: 3, boxShadow: 3 }}
            />
          </Grid>

          {/* Text Section */}
          <Grid item xs={12} md={6}>
            <Typography variant="h5" fontWeight="medium" gutterBottom>
              Create LinkedIn Posts in Minutes, Not Hours
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              If you’re a public speaker, founder, or creator, you know the effort that goes into one great post—researching, drafting, editing, rewriting. On average, it takes over 60–90 minutes.
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              PostLn reduces that to just 3–4 minutes. You select a trending topic, let our AI rewrite it in your voice and style, and schedule it—all in one flow.
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              The result? Up to <strong>86 minutes saved per day</strong>, or <strong>43+ hours every month</strong>. That’s time you can now invest in your stage, your product, or your next idea.
            </Typography>
          </Grid>
        </Grid>
      </Container>

      <Footer />
    </>
  );
}

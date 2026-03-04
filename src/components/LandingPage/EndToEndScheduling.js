import { Box, Typography, Container, Grid } from '@mui/material';
import directEmployerImage from '../../images/business-7768170_1280.jpg';
import Navbar from './Navbar';
import Footer from './Footer';
import { Helmet } from "react-helmet";

export default function EndToEndScheduling() {
  return (
    <>
      <Helmet>
        <title>End-to-End Scheduling & Publishing | PostLn</title>
        <meta
          name="description"
          content="Go from idea to scheduled LinkedIn post in minutes with PostLn. Discover trending topics, rewrite in your tone, and schedule—all in one place."
        />
        <meta
          property="og:title"
          content="End-to-End Scheduling & Publishing | PostLn"
        />
        <meta
          property="og:description"
          content="PostLn handles your entire LinkedIn content flow—from topic inspiration to tone-accurate rewrite to scheduled publishing. All in one clean workflow."
        />
        <meta property="og:type" content="website" />
      </Helmet>

      <Navbar />

      <Container maxWidth="lg" sx={{ py: 10 }}>
        {/* Title Section */}
        <Box textAlign="center" mb={6}>
          <Typography variant="h4" fontWeight="bold" gutterBottom>
            End-to-End Scheduling & Publishing
          </Typography>
          <Typography variant="h6" color="text.secondary">
            Go from idea to scheduled post in minutes. Select a trending topic, rewrite in your style, and schedule it—all from one place.
          </Typography>
        </Box>

        {/* Content Section */}
        <Grid container spacing={6} alignItems="center">
          {/* Image or Illustration */}
          <Grid item xs={12} md={6}>
            <Box
              component="img"
              src={directEmployerImage}
              alt="Scheduling LinkedIn Posts"
              sx={{ width: '100%', borderRadius: 3, boxShadow: 3 }}
            />
          </Grid>

          {/* Text Content */}
          <Grid item xs={12} md={6}>
            <Typography variant="h5" fontWeight="medium" gutterBottom>
              From Idea to Post in Under 5 Minutes
            </Typography>

            <Typography variant="body1" color="text.secondary" paragraph>
              Creating a high-quality LinkedIn post usually means switching between tabs, researching topics, rewriting multiple drafts, and then setting up scheduling tools. PostLn brings all of that under one roof.
            </Typography>

            <Typography variant="body1" color="text.secondary" paragraph>
              You choose a trending topic (we fetch them for you), personalize it in your tone using AI trained on your past writing, and schedule it instantly with our built-in LinkedIn publisher.
            </Typography>

            <Typography variant="body1" color="text.secondary" paragraph>
              No more blank pages. No more juggling tools. Just smooth, fast, professional content creation—built for founders, speakers, and busy creators who want to stay consistent without sacrificing quality.
            </Typography>
          </Grid>
        </Grid>
      </Container>

      <Footer />
    </>
  );
}

import { useEffect } from 'react';
import { Box, Typography, Container, Grid } from '@mui/material';
import profilebasedImage from '../images/man-6086273_1280.jpg';
import Navbar from './Navbar';
import Footer from './Footer';
import { Helmet } from "react-helmet";

export default function ProfileBasedDiscovery() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <>
      <Helmet>
        <title>Personalized LinkedIn Content That Sounds Like You | PostLn</title>
        <meta
          name="description"
          content="PostLn doesn't just generate posts—it mirrors your tone, voice, and structure. It's content that sounds like you, not a robot."
        />
        <meta
          property="og:title"
          content="Personalized LinkedIn Content That Sounds Like You | PostLn"
        />
        <meta
          property="og:description"
          content="Every post crafted by PostLn captures your tone, structure, and storytelling style—because your voice is your brand."
        />
        <meta property="og:type" content="website" />
      </Helmet>

      <Navbar />

      <Container maxWidth="lg" sx={{ py: 10 }}>
        {/* Title Section */}
        <Box textAlign="center" mb={6}>
          <Typography variant="h4" fontWeight="bold" gutterBottom>
            Personalized Like Never Before
          </Typography>
          <Typography variant="h6" color="text.secondary">
            Every post mirrors your tone, structure, and storytelling — because your voice matters more than generic automation.
          </Typography>
        </Box>

        {/* Content Section */}
        <Grid container spacing={6} alignItems="center">
          {/* Image or Illustration */}
          <Grid item xs={12} md={6}>
            <Box
              component="img"
              src={profilebasedImage}
              alt="personalized content"
              sx={{ width: '100%', borderRadius: 3, boxShadow: 3 }}
            />
          </Grid>

          {/* Text Content */}
          <Grid item xs={12} md={6}>
            <Typography variant="h5" fontWeight="medium" gutterBottom>
              Say Goodbye to Robotic Posts
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              Most AI tools generate generic content that sounds the same for everyone. But with PostLn, every post is rewritten to reflect your personal tone, your sentence structure, and your storytelling rhythm.
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              Whether you're humorous, insightful, concise, or bold—our system learns from your past content and mirrors it consistently. It's like having your ghostwriter who knows your voice better than anyone else.
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              Your audience connects with authenticity. That’s why PostLn is built not to replace your voice—but to amplify it at scale.
            </Typography>
          </Grid>
        </Grid>
      </Container>

      <Footer />
    </>
  );
}

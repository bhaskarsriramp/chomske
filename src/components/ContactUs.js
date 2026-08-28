import Navbar from './Navbar';
import Footer from './Footer';
import { Container, Typography, Grid, Paper, Divider, Link } from '@mui/material';
import { LocationOn } from '@mui/icons-material';
  import { Helmet } from "react-helmet";


function SupportContact() {


  return (
    <>
  

<Helmet>
  <title>Contact Us & Support | Chomske</title>
  <meta
    name="description"
    content="Get in touch with Chomske. Reach our support team at support@chomske.com, sales inquiries at support@chomske.com, or visit our Hyderabad office. We're here to help you."
  />

  {/* Canonical URL */}
  <link rel="canonical" href="https://chomske.com/contact" />

  {/* Open Graph */}
  <meta property="og:title" content="Contact Us & Support | Chomske" />
  <meta
    property="og:description"
    content="Need help or have questions? Contact Chomske support at support@chomske.com, sales@chomske.com, or visit our Hyderabad office."
  />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://chomske.com/contact" />
  <meta
    property="og:image"
    content="https://storage.googleapis.com/postlnbucketcom/products/maximize.png"
  />

  {/* Twitter */}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Contact Us & Support | Chomske" />
  <meta
    name="twitter:description"
    content="Get support from Chomske: email support@chomske.com, sales@chomske.com, or visit our Hyderabad office."
  />
  <meta
    name="twitter:image"
    content="https://storage.googleapis.com/postlnbucketcom/products/maximize.png"
  />
</Helmet>


      <Navbar />

      <Container sx={{ py: 10 }}>
        <Typography variant="h3" fontWeight="bold" gutterBottom>
          Contact Us
        </Typography>
        <Typography variant="body1" mb={4}>
          Have questions, need support, or want to report a security issue? We're here to help.
        </Typography>

        <Grid container spacing={4}>
          <Grid item xs={12} md={6}>
            <Paper elevation={3} sx={{ p: 4, borderRadius: 4 }}>
              <Typography variant="h5" fontWeight="medium" gutterBottom>
                General Inquiries & Support
              </Typography>
              <Typography variant="body1">
                Email: <Link href="mailto:support@chomske.com">support@chomske.com</Link>
              </Typography>
              <Divider sx={{ my: 3 }} />
              <Typography variant="h5" fontWeight="medium" gutterBottom>
                Sales Inquiries
              </Typography>
              <Typography variant="body1">
                Email: <Link href="mailto:sales@chomske.com">sales@chomske.com</Link>
              </Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            <Paper elevation={3} sx={{ p: 4, borderRadius: 4 }}>
              <Typography variant="h5" fontWeight="medium" gutterBottom>
                Office Address
              </Typography>
              <Typography variant="body1" display="flex" alignItems="center">
                <LocationOn sx={{ mr: 1 }} />
                Registered & Operational:
              </Typography>
              <Typography variant="body2" mt={1}>
                Plot no - 20, 2nd Floor, 302, <br />
                Behind Lucid Hospital, Kukatpally, <br />
                Hyderabad, Telangana 500072, India.
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Typography variant="caption" color="text.secondary">
                Linck One Enterprises
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      </Container>

      <Footer />
    </>
  );
}

export default SupportContact;
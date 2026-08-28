import { Box, Typography, useMediaQuery, Grid, Card, CardContent, List, ListItem, ListItemIcon, ListItemText, Avatar } from '@mui/material';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import SecurityIcon from '@mui/icons-material/Security';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Navbar from './Navbar';
import Footer from './Footer';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';

const YouTubeDisclosure = () => {
  const isMobile = useMediaQuery('(max-width:600px)');

  return (
    <>
      <Navbar />
      <Box sx={{ padding: isMobile ? 3 : 8, mt: 10 }}>
        <Typography variant="h3" sx={{ fontWeight: 600, fontSize: isMobile ? '34px' : '48px', mb: 4 }}>
          YouTube API Services Disclosure
        </Typography>

        <Typography variant="h5" sx={{ fontWeight: 400, fontSize: isMobile ? '18px' : '26px', mb: 6}}>
          Creator Console uses the YouTube API Services to deliver meaningful insights and features to content creators. We follow all necessary guidelines and compliance policies outlined by Google and YouTube to ensure transparency, safety, and ethical usage of user data.
        </Typography>

        <Grid container spacing={4}>
          <Grid item xs={12} md={4}>
            <Card sx={{ borderRadius: 4, boxShadow: 3, height: '100%' }}>
              <CardContent>
                <Avatar sx={{ bgcolor: '#1976d2', mb: 2 }}>
                  <VerifiedUserIcon />
                </Avatar>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>Full Transparency</Typography>
                <List>
                  <ListItem>
                    <ListItemIcon><FiberManualRecordIcon fontSize="small" /></ListItemIcon>
                    <ListItemText primary="We clearly display how and where user data is used." />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><FiberManualRecordIcon fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Our OAuth consent screen includes a detailed scope explanation." />
                  </ListItem>
                </List>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card sx={{ borderRadius: 4, boxShadow: 3, height: '100%' }}>
              <CardContent>
                <Avatar sx={{ bgcolor: '#388e3c', mb: 2 }}>
                  <SecurityIcon />
                </Avatar>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>Data Security</Typography>
                <List>
                  <ListItem>
                    <ListItemIcon><FiberManualRecordIcon fontSize="small" /></ListItemIcon>
                    <ListItemText primary="OAuth 2.0 for secure and scoped authentication." />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><FiberManualRecordIcon fontSize="small" /></ListItemIcon>
                    <ListItemText primary="No sensitive data is stored on our servers." />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><FiberManualRecordIcon fontSize="small" /></ListItemIcon>
                    <ListItemText primary="All fetched data is used in real-time, securely and responsibly." />
                  </ListItem>
                </List>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card sx={{ borderRadius: 4, boxShadow: 3, height: '100%' }}>
              <CardContent>
                <Avatar sx={{ bgcolor: '#f57c00', mb: 2 }}>
                  <VisibilityIcon />
                </Avatar>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>User Control & Rights</Typography>
                <List>
                  <ListItem>
                    <ListItemIcon><FiberManualRecordIcon fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Users can revoke access anytime via Google security settings." />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><FiberManualRecordIcon fontSize="small" /></ListItemIcon>
                    <ListItemText primary="We do not share, sell, or misuse any user data." />
                  </ListItem>
                </List>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Box sx={{ mt: 8, maxWidth: 800 }}>
          <Typography variant="h5" sx={{ fontWeight: 500, mb: 2 }}>
            Compliance & Documentation
          </Typography>
          <Typography variant="body1" sx={{ fontSize: '18px' }}>
            We've taken every measure to comply with YouTube’s API Services Terms of Service. Our app has:
          </Typography>
          <List>
            <ListItem>
              <ListItemIcon><FiberManualRecordIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="A comprehensive Privacy Policy clearly linked on our OAuth consent screen." />
            </ListItem>
            <ListItem>
              <ListItemIcon><FiberManualRecordIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Detailed API scopes usage explained with user-first language." />
            </ListItem>
            <ListItem>
              <ListItemIcon><FiberManualRecordIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Fully functional disclosure and removal process as required by Google." />
            </ListItem>
          </List>
        </Box>

        <Box sx={{ mt: 6, maxWidth: 800 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>Need More Info?</Typography>
          <Typography variant="body1">
            If you're from the YouTube team or a user looking for more detail, please feel free to contact us directly. We're transparent, responsive, and committed to user-first policies.
          </Typography>
        </Box>
      </Box>
      <Footer />
    </>
  );
};

export default YouTubeDisclosure;

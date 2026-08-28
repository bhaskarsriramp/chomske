import { Box, Typography, useMediaQuery, Button, Grid, Link } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import gifDemo from '../images/topicsGrid.mp4';
import calendarView from '../images/calendarView.png';
import { useNavigate } from 'react-router-dom';



export default function GifShowcase() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();


  return (
  <>
    <Box
      sx={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        px: 2,
        py: 6,
      }}
    >
     <Box
  component="video"
  src={gifDemo}
  autoPlay
  loop
  muted
  playsInline
  alt="Demo of generating LinkedIn post from article"
  sx={{
    width: isMobile ? '100%' : '50%',
    height: '100%',
    borderRadius: 2,
    boxShadow: 3,
    objectFit: 'cover',
  }}
/>

      <Box maxWidth={isMobile ? '100%' : 420}>
        <Typography gutterBottom sx={{ fontFamily : 'Inter', fontSize : isMobile ? '22px' : '26px', fontWeight : 600}}>
          Fresh Topics, Personalized Posts — Instantly
        </Typography>
        <Typography mb={3} sx={{ fontFamily : 'Inter', fontSize : isMobile ? '15px' : '16px', fontWeight : 400}}>
          Fetch trending, real-time articles based on the keyword you choose — not generic ideas. It helps you turn them into authentic LinkedIn posts in your own tone and structure.
        </Typography>

      <Link href="/join-waitlist" target="_blank" rel="noopener noreferrer" underline="none" sx={{ textDecoration: 'none' }}>

        <Button
          variant="contained"
          color="primary"
          size="large"
          startIcon={<PlayCircleOutlineIcon />}
            
          sx={{ textTransform : 'none', color: '#FFFFFF', background: 'linear-gradient(to right, #000000, #8b5cf6)' }}
        >
          Get Early Access
        </Button>
        </Link>
      </Box>
    </Box>

     <Box sx={{ px: { xs: 2, md: 9 }, py: { xs: 6, md: 12 }, mb: { xs: 4, md: 4 }}}>
      <Grid container spacing={4} alignItems="center">
        {/* Left Side: Text */}
        <Grid item xs={12} md={6}>
          <Typography gutterBottom sx={{ fontFamily: 'Inter', fontSize : '26px', fontWeight : 600}}>
            📅 Schedule, Publish & Track Your Posts on Reddit, Linkedin & Twitter
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Plan and manage your content effortlessly across Reddit, LinkedIn, and Twitter. Visual calendar organizes all your{' '}
            <strong>Scheduled</strong>, <strong>Published</strong>, <strong>Draft</strong>{' '}
            posts by date. Just click a day to see what’s going live, what’s pending, or what needs attention — keeping you consistent and ahead across every platform.
          </Typography>
        </Grid>

        {/* Right Side: Image */}
        <Grid item xs={12} md={6}>
          <Box
            component="img"
            src={calendarView}
            alt="Post scheduling calendar view"
            sx={{
              width: '100%',
              borderRadius: 2,
              boxShadow: 3,
            }}
          />
        </Grid>
      </Grid>
    </Box>
    </>
  );
}

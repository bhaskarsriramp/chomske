import {
  Typography,
  Stack,
  Box,
  Grid,
  useMediaQuery,
  useTheme,
  Link
} from "@mui/material";
import ArrowRightAltOutlinedIcon from "@mui/icons-material/ArrowRightAltOutlined";
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';


function BodyMain1() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm")); 


  return (
   <>
 

<Grid container spacing={isMobile ? 1 : 4} sx={{ px: isMobile ? 4 : 10, mb: isMobile ? 6 : 8, alignItems: 'center' }}>
  <Grid item xs={12} md={6}>
    <Typography
      sx={{
        fontSize: isMobile ? '26px' : '36px',
        fontWeight: 500,
        background: '#F1EAFF',
        borderLeft: '6px solid #4535C1',
        pl: 2,
        py: 3
      }}
    >
   Built for <strong>Founders</strong> & <strong>Solopreneurs</strong>
    </Typography>
  </Grid>

  <Grid item xs={12} md={6} sx={{ mt: isMobile ? 2 : 0 }}>
    <Typography
      sx={{
        fontSize: '18px',
        borderRight: '6px solid #4535C1',
        pr: 2,
        py: 1
      }}
    >
      No blank pages. No generic AI fluff. Just relevant ideas, your authentic tone, and automated scheduling — all in one place.
    </Typography>
  </Grid>
</Grid>



<Grid container spacing={isMobile ? 4 : 4} sx={{ px: isMobile ? 4 : 10 }}>

  {/* Slide 1 */}
  <Grid item xs={12} md={4} lg={4}>
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '12px',
        py: 8,
        gap: 2,
        px: 3,
        background: 'linear-gradient(to right, #000000, #8b5cf6)',

      }}
    >
      <AccessTimeOutlinedIcon sx={{ fontSize: '44px', color: '#FFFFFF' }} />
      <Typography sx={{ fontSize: '22px', fontWeight: 500, color: '#FFFFFF' }}>
        Save 43+ Hours every month
      </Typography>
      <Typography sx={{ fontSize: '18px', color: '#F2F9FF' }}>
        No longer need to spend hours crafting posts. <br/><br/>Reduces content creation time by 86 minutes/day.
      </Typography>

      <Link href="/save-time" target="_blank" rel="noopener noreferrer" underline="none" sx={{ textDecoration: 'none' }}>
        <Stack
          sx={{ display: 'flex', flexDirection: 'row', gap: 2, color: '#FFFFFF', alignItems: 'center', mt: 2, cursor: 'pointer' }}
        >
          <Typography sx={{ color: '#FFFFFF' }}>Learn more</Typography>
          <ArrowRightAltOutlinedIcon />
        </Stack>
      </Link>
    </Box>
  </Grid>

  {/* Slide 2 */}
  <Grid item xs={12} md={4} lg={4}>
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '12px',
        border: '1px solid #BCCCDC',
        py: 8,
        gap: 2,
        px: 3,
      }}
    >
      <RecordVoiceOverIcon sx={{ fontSize: '44px' }} />
      <Typography sx={{ fontSize: '22px', fontWeight: 500 }}>
        Personalized Like Never Before
      </Typography>
      <Typography sx={{ fontSize: '18px' }}>
        Every post mirrors your tone, structure, and storytelling<br/><br/>—because your voice matters more than generic automation.
      </Typography>

      <Link href="/personalised-user-tone" target="_blank" rel="noopener noreferrer" underline="none" sx={{ textDecoration: 'none' }}>
        <Stack
          sx={{ display: 'flex', flexDirection: 'row', gap: 2, alignItems: 'center', mt: 2, cursor: 'pointer' }}
        >
          <Typography sx={{ color: '#000000' }}>Learn more</Typography>
          <ArrowRightAltOutlinedIcon sx={{ color: '#000000' }} />
        </Stack>
      </Link>
    </Box>
  </Grid>

  {/* Slide 3 */}
  <Grid item xs={12} md={4} lg={4}>
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '12px',
        border: '1px solid #BCCCDC',
        py: 8,
        gap: 2,
        px: 3,
      }}
    >
      <CalendarMonthIcon sx={{ fontSize: '44px' }} />
      <Typography sx={{ fontSize: '22px', fontWeight: 500 }}>
        End-to-End Scheduling & Publishing
      </Typography>
      <Typography sx={{ fontSize: '18px' }}>
        Go from idea to scheduled post in minutes.<br/> Select a trending topic, rewrite in your style, and schedule it—all from one place.
      </Typography>

      <Link href="/schedule-publish" target="_blank" rel="noopener noreferrer" underline="none" sx={{ textDecoration: 'none' }}>
        <Stack
          sx={{ display: 'flex', flexDirection: 'row', gap: 2, alignItems: 'center', mt: 2, cursor: 'pointer' }}
        >
          <Typography sx={{ color: '#000000' }}>Learn more</Typography>
          <ArrowRightAltOutlinedIcon sx={{ color: '#000000' }} />
        </Stack>
      </Link>
    </Box>
  </Grid>

</Grid>

   
   </>
  );
}

export default BodyMain1;

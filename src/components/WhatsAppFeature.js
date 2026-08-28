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
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Link as MuiLink
} from '@mui/material';
import InstagramIcon from '@mui/icons-material/Instagram';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ArrowOutwardOutlinedIcon from '@mui/icons-material/ArrowOutwardOutlined';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import TimelineOutlinedIcon from '@mui/icons-material/TimelineOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import FavoriteBorderOutlinedIcon from '@mui/icons-material/FavoriteBorderOutlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import LockPersonOutlinedIcon from '@mui/icons-material/LockPersonOutlined';
import { useNavigate } from 'react-router-dom';

/**
 * InstagramDataUseBlock_Compact.js (influencer-first version)
 *
 * Landing page block designed for creators first, yet reviewer-clear.
 * No device mock. Uses visual layout (chips, steps, cards) instead of long paragraphs.
 */

export default function InstagramDataUseBlock_Compact() {
  const theme = useTheme();
  const isSm = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        px: { xs: 2, md: 6 },
        background: 'linear-gradient(180deg,#ffffff, #FFBDBD)'
      }}
    >
      <Card
        elevation={0}
        sx={{
          width: '100%',
          bgcolor: 'transparent',
          px: { xs: 2, md: 6 },
          py: { xs: 6, md: 8 }
        }}
      >
        <CardContent sx={{ p: 0 }}>
          <Stack spacing={4} alignItems="center" sx={{ textAlign: 'center' }}>
            {/* Header row */}
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{
                background: 'rgba(64,93,230,0.08)',
                border: '1px solid rgba(64,93,230,0.18)',
                px: 1.25,
                py: 0.75,
                borderRadius: 999
              }}
            >
              <InstagramIcon sx={{ fontSize: 22, color: '#E1306C' }} />
              <Typography sx={{ fontWeight: 700 }}>Instagram Connect</Typography>
             
            </Stack>

            {/* Big title */}
            <Typography
              sx={{
                fontFamily: 'Inter',
                fontSize: isSm ? 22 : 40,
                fontWeight: isSm ? 700 : 900,
                lineHeight: 1.25
              }}
            >
              Grow faster —with your authentic Instagram at the center
            </Typography>

            {/* Three value chips */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={ isSm ? "flex-start" : "center"}>
              <Chip icon={<RocketLaunchOutlinedIcon />} label="Turn Instagram into a growth hub" sx={chipStyle()} />
              <Chip icon={<VerifiedOutlinedIcon />} label="Show verified handle & follower count" sx={chipStyle()} />
              <Chip icon={<TimelineOutlinedIcon />} label="See what performs — then double down" sx={chipStyle()} />
            </Stack>

            {/* Two feature cards: Bio page + Dashboard */}
            <Stack sx={{ gap: 2, alignItems : 'center'}}>

            <Grid container spacing={2.5} sx={{ width: '100%', alignItems : 'center'}}>
              <Grid item xs={12} md={6}>
                <Card variant="outlined" sx={{ borderRadius: 3, height: 320}}>
                  <CardContent sx={{ p: { xs: 2.25, md: 4 } }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                      <LinkOutlinedIcon />
                      <Typography variant="overline">On your link-in-bio</Typography>
                    </Stack>
                    <Typography sx={{fontFamily : 'Inter', fontSize : isSm ? '22px' : '28px', fontWeight: 800, mb: 1 }}>
                      Instagram presence
                    </Typography>
                    <List dense>
                      {[
                        { icon: <VerifiedOutlinedIcon />, text: 'Your verified handle & profile picture' },
                        { icon: <PeopleAltOutlinedIcon />, text: 'Live follower count for credibility' },
                        { icon: <FavoriteBorderOutlinedIcon />, text: 'Direct path for fans to follow on Instagram' }
                      ].map((row) => (
                        <ListItem key={row.text} sx={{ py: 0.5 }}>
                          <ListItemIcon sx={{ minWidth: 30 }}>{row.icon}</ListItemIcon>
                          <ListItemText primaryTypographyProps={{ fontSize: 14 }} primary={row.text} />
                        </ListItem>
                      ))}
                    </List>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={6}>
                <Card variant="outlined" sx={{ borderRadius: 3, height: 320 }}>
                  <CardContent sx={{ p: { xs: 2.25, md: 3 } }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                      <InsightsOutlinedIcon />
                      <Typography variant="overline">Inside your dashboard</Typography>
                    </Stack>
                    <Typography sx={{fontFamily : 'Inter', fontSize : isSm ? '22px' : '28px', fontWeight: 800, mb: 1 }}>

                      Actionable insights
                    </Typography>
                    <List dense>
                      {[
                        { icon: <BarChartOutlinedIcon />, text: 'See engagement on your posts' },
                        { icon: <LinkOutlinedIcon />, text: 'Track link-in-bio clicks and conversions' },
                        { icon: <TimelineOutlinedIcon />, text: 'Know what to feature to grow faster' }
                      ].map((row) => (
                        <ListItem key={row.text} sx={{ py: 0.5 }}>
                          <ListItemIcon sx={{ minWidth: 30 }}>{row.icon}</ListItemIcon>
                          <ListItemText primaryTypographyProps={{ fontSize: 14 }} primary={row.text} />
                        </ListItem>
                      ))}
                    </List>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Visual steps */}
        
<Stack sx={{ gap: 2 }}>

<Grid container spacing={1.5} sx={{ width: '100%' }}>
  {[
    { icon: <InstagramIcon />, title: 'Connect', sub: 'Secure OAuth — revoke anytime' },
    { icon: <VerifiedOutlinedIcon />, title: 'Showcase', sub: 'Followers on your bio page' },
    { icon: <TimelineOutlinedIcon />, title: 'Grow', sub: 'Use insights to double down' }
  ].map((s, i) => (
    <Grid key={s.title} item xs={12} sm={4} sx={{ display: 'flex' }}>
      <Card variant="outlined" sx={{ borderRadius: 3, width: '100%', height: '100%' }}>
        <CardContent sx={{ py: 2.25, height: '100%' }}>
          <Stack spacing={0.5} alignItems="center">
            {s.icon}
            <Typography sx={{ fontWeight: 800 }}>
              {i + 1}. {s.title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {s.sub}
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Grid>
  ))}
</Grid>


            </Stack>


            <Divider sx={{ width: '100%', maxWidth: 1000 }} />

            {/* Friendly transparency strip (reviewer-clear, creator-friendly) */}
            <Grid container spacing={1.25} justifyContent="center" alignItems="center" sx={{ maxWidth: 1000 }}>
              <Grid item>
                <Chip icon={<LockPersonOutlinedIcon />} label="Your data stays yours" variant="outlined" />
              </Grid>
              <Grid item>
                <Tooltip title="Used only to provide features to the account owner.">
                  <Chip icon={<CheckCircleRoundedIcon color="success" />} label="No selling or sharing" variant="outlined" />
                </Tooltip>
              </Grid>
              <Grid item>
                <Chip icon={<ShieldOutlinedIcon />} label="Disconnect anytime" variant="outlined" />
              </Grid>
              <Grid item>
                <Chip icon={<ShieldOutlinedIcon />} label="Delete within 24h" variant="outlined" />
              </Grid>
            </Grid>

            {/* CTA */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              <Button
                onClick={() => navigate('/professional/login')}
                variant="contained"
                endIcon={<ArrowOutwardOutlinedIcon />}
                sx={{
                  textTransform: 'none',
                  borderRadius: 6,
                  px: 3,
                  py: 1.05,
                  fontWeight: 800,
                  background: 'linear-gradient(90deg,#E1306C,#C13584,#833AB4,#5851DB,#405DE6)'
                }}
              >
                Connect Instagram
              </Button>
              <Button
                onClick={() => navigate('/privacy-policy')}
                variant="outlined"
                sx={{ textTransform: 'none', borderRadius: 6 }}
                startIcon={<LockOutlinedIcon />}
              >
                Privacy & Deletion
              </Button>
            </Stack>

          
          </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

function chipStyle() {
  
  return {
    borderRadius: 999,
    fontFamily : 'Inter',
    fontSize: '14px',
    fontWeight : 500,
    bgcolor: 'rgba(0,0,0,0.03)',
    '& .MuiChip-icon': { ml: 0.25 }
  };
}

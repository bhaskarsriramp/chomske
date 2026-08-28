import { Box, Typography, Grid, Paper, useTheme } from '@mui/material';
import useMediaQuery from "@mui/material/useMediaQuery";


const comparisons = [
  {
    platform: 'Naakri',
    color: '#ffe8e0',
    points: [
      'Open to everyone including freelancers & freshers',
      'Resume flooding by recruiters',
      'No anonymity — anyone can view your profile',
      'Mostly job applications, not discovery',
    ],
  },
  {
    platform: 'Endeed',
    color: '#e8f0fe',
    points: [
      'Bulk job listings — difficult to filter relevant roles',
      'You apply. No guarantee of visibility',
      'No identity protection for working professionals',
      'Open access — not curated for professionals only',
    ],
  },
  {
    platform: 'Newrole.in',
    color: '#e0f8ec',
    highlight: true,
    points: [
      'Only verified working professionals allowed',
      'Stay anonymous — your employer never knows',
      'No applications — top companies reach out to you',
      'Curated and secure — focused on serious hiring only',
    ],
  },
];

export default function PlatformComparison() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));


  return (
    <Box
      sx={{
        py: { xs: 6, md: 10 },
        px: 2,
        textAlign: 'center',
        mt: 3
      }}
    >
        
      <Typography sx={{ fontSize : isMobile ? '34px' : '44px', fontWeight : 500}} gutterBottom>
        How Newrole.in is <span style={{ display : 'inline-block', textDecoration : 'underline', color: '#11009E'}}>different</span>
      </Typography>
      <Typography sx={{ fontSize : isMobile ? '16px' : '20px', mb: 8, px: isMobile ? 2 : 3}}>
        Not just another job board. A safer, smarter way to switch jobs for working professionals.
      </Typography>

      <Grid container spacing={4} justifyContent="center" mb={2} sx={{ px: isMobile ? 1 : 5}}>
        {comparisons.map((item, index) => (
          <Grid item xs={12} sm={6} md={4} key={index} sx={{ px: isMobile ? 1: 2}}>
            <Paper
              elevation={item.highlight ? 6 : 3}
              sx={{
                p: 3,
                height: '100%',
                borderRadius: 3,
                backgroundColor: item.color,
                border: item.highlight ? `2px solid ${theme.palette.success.main}` : 'none',
                transition: 'transform 0.3s ease',
                '&:hover': {
                  transform: 'translateY(-5px)',
                },
              }}
            >
              <Typography variant="h6" fontWeight="bold" gutterBottom mb={2}>
                {item.platform}
              </Typography>
              <Box component="ul" sx={{ pl: 2, textAlign: 'left', color: 'text.secondary' }}>
                {item.points.map((point, i) => (
                  <li key={i}>
                    <Typography sx={{ fontSize : '16px', mb: 1}}>{point}</Typography>
                  </li>
                ))}
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Typography variant="caption" color="text.secondary">
  *Comparisons are based on publicly observable features and typical user experiences. "Naakri" and "Endeed" are used as parody references and are not affiliated with Newrole.in.
</Typography>


    </Box>
  );
}

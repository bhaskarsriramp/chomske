// FeatureCardsShowcase.js
import React from "react";
import {
  Box,
  Grid,
  Typography,
  Button,
  useTheme,
  useMediaQuery,
  Card,
  CardContent,
  Stack,
  Avatar,
} from "@mui/material";
import InsightsIcon from "@mui/icons-material/Insights";
import ForumIcon from "@mui/icons-material/Forum";
import HighlightIcon from "@mui/icons-material/Highlight";
import ElectricBoltOutlinedIcon from '@mui/icons-material/ElectricBoltOutlined';

const features = [
  {
    title: "Automatic Insights",
    desc: "Stop wasting hours reading every comment —insights are surfaced automatically.",
    icon: <InsightsIcon sx={{ color : '#9112BC', fontSize : '26px'}}/>,
    cardBackground: '#EBD6FB'
  },
  {
    title: "Feedback Grouping",
    desc: "Feedback, concerns, and suggestions are grouped clearly so you see what matters.",
    icon: <ForumIcon fontSize="small" sx={{ color : '#1E93AB'}}/>,
    cardBackground: '#ADEED9'

  },
  {
    title: "Theme Detection",
    desc: "Recurring themes are highlighted, so real user needs stand out fast.",
    icon: <HighlightIcon fontSize="small" sx={{ color : '#67C090'}}/>,
    cardBackground: '#BFECFF'

  },
  {
    title: "Faster Refinement",
    desc: "Actionable insights helps you refine features faster before losing momentum.",
    icon: <ElectricBoltOutlinedIcon fontSize="small" sx={{ color : '#3338A0'}}/>,
    cardBackground: '#D9EAFD'

  },
];


export default function FeatureCardsShowcase() {
  const theme = useTheme();
  const mdUp = useMediaQuery(theme.breakpoints.up("md"));

  return (
    <Box
      sx={{
        py: { xs: 6, sm: 8, md: 10 },
        // px: { xs: 3, sm: 6, md: 12 },
      }}
    >
      <Grid
        container
        spacing={6}
        alignItems="center"
        justifyContent="space-between"
        sx={{ maxWidth: "100%", mx: "auto", px: { xs : 0, sm: 4, md : 6} }}
      >
        {/* LEFT COLUMN */}
        <Grid item xs={12} md={5}>
          <Box>
            {/* Description above heading (mobile order respected) */}
          

            {/* Heading next below description */}
            <Typography
             
              sx={{
                fontFamily: 'Inter',
                fontWeight: 700,
                color: "text.primary",
                fontSize: { xs: 22, sm: 28, md: 36 },
                mb: { xs: 2, sm: 3 },
                letterSpacing: -0.5,
                lineHeight: 1.5
              }}
            >
              Know What Matters Most 
              <br/>to Users.
            </Typography>


              <Typography
              variant="body1"
              sx={{
                color: "text.secondary",
                fontSize: { xs: 14, sm: 15 },
                mb: { xs: 2, sm: 3 },
                maxWidth: '90%',
              }}
            >
              Manually scanning comment threads takes hours. We analyze community replies, surface clear themes, and deliver insights you can act on.
            </Typography>

            <Button
              variant="contained"
              sx={{
                mt: 1,
                backgroundColor: "#C8F08A",
                color: "#072014",
                textTransform: "none",
                fontWeight: 600,
                px: 3,
                py: 1,
                "&:hover": { backgroundColor: "#bfe06f" },
              }}
            >
              Explore Sections
            </Button>
          </Box>
        </Grid>

        {/* RIGHT COLUMN: Cards */}
        <Grid item xs={12} md={7}>
          {mdUp ? (
            // Desktop 2x2 grid
            <Grid container spacing={3}>
              {features.map((f, i) => (
                <Grid item xs={12} sm={6} key={i}>
                  <Card
                    elevation={0}
                    sx={{
                      borderRadius: 2,
                      border: "1px solid rgba(16,24,40,0.06)",
                      height: "100%",
                      p: 1,
                      background: f.cardBackground
                    }}
                  >
                    <CardContent>
                      <Stack direction="row" spacing={2} alignItems="flex-start">
                        <Avatar
                          variant="rounded"
                          sx={{
                            width: 44,
                            height: 44,
                            border: '1px solid #EEEEEE',
                            background : 'transparent'
                          }}
                        >
                          {f.icon}
                        </Avatar>
                        <Box>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                            {f.title}
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{ color: "text.secondary", mt: 0.5 }}
                          >
                            {f.desc}
                          </Typography>
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          ) : (
            // Mobile: Left-to-right scroll
            <Box
              sx={{
                mt: 3,
                overflowX: "auto",
                WebkitOverflowScrolling: "touch",
                display: "flex",
                gap: 2,
                px: 0.5,
                "&::-webkit-scrollbar": { height: 8 },
                "&::-webkit-scrollbar-thumb": {
                  backgroundColor: "rgba(0,0,0,0.12)",
                  borderRadius: 8,
                },
              }}
            >
              {features.map((f, i) => (
                <Card
                  key={i}
                  elevation={0}
                  sx={{
                    minWidth: 260,
                    maxWidth: '85%',
                    borderRadius: 2,
                    border: "1px solid rgba(16,24,40,0.06)",
                    flex: "0 0 auto",
                    pl: 1.5,
                    py: 1.5,
                    background: f.cardBackground
                  }}
                >
                  <CardContent>
                    <Stack direction="row" spacing={2} alignItems="flex-start">
                      <Avatar
                        variant="rounded"
                        sx={{
                          width: 34,
                          height: 34,
                           border: '1px solid #EEEEEE',
                            background : 'transparent'
                        }}
                      >
                        {f.icon}
                      </Avatar>
                      <Box>
                        <Typography sx={{ fontFamily : 'Inter', fontSize : '18px', fontWeight : 600 }}>
                          {f.title}
                        </Typography>
                        <Typography sx={{ color: "text.secondary", mt: 0.5, fontFamily : 'Inter', fontSize : '14px', fontWeight : 300 }}
                        >
                          {f.desc}
                        </Typography>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}
        </Grid>
      </Grid>
    </Box>
  );
}

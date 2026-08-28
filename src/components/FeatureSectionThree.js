// AdvantagesSection.js
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Divider,
  useMediaQuery,
  useTheme
} from "@mui/material";
import featureImage from '../images/IntelligentScan.jpg';

const FeatureSectionThree = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <Box sx={{ px: { xs: 2, md: 6 }, pt: 6, pb: 2 }}>
      {/* Section Header */}
      <Box mb={6} sx={{ textAlign : isMobile ? '' : 'center', px: isMobile ? 3 : 0}}>
        <Typography
          sx={{
            fontFamily: "Inter",
            fontSize: isMobile ? 12 : 14,
            fontWeight: 500,
            color: "text.secondary",
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          #Smart Tracking
        </Typography>
        <Typography
          sx={{
            fontFamily: "Inter",
            fontSize: isMobile ? 22 : 32,
            fontWeight: 700,
            mt: 1,
            mb: 2,
          }}
        >
          Don't Miss When People Talk About You.
        </Typography>
        <Typography
          sx={{
            fontFamily: "Inter",
            fontSize: isMobile ? 14 : 16,
            fontWeight: 400,
            color: "text.secondary",
            maxWidth: "900px",
            mx: "auto",
          }}
        >
          Your users and competitors are already being discussed online. Monitor
          competitors across Reddit and other platforms with AI-powered alerts.
        </Typography>
      </Box>

      {/* Cards */}
      <Grid container spacing={3}>
        {/* Card 1 */}
     <Grid item xs={12} md={4}>
  <Card
    sx={{
      p: 2,
      borderRadius: 3,
      height: "100%",
      background: `linear-gradient(135deg, #EBF3E8 0%, white 100%)`,
    }}
  >
    <CardContent>
      <Typography
        sx={{
          fontFamily: "Inter",
          fontSize: 13,
          fontWeight: 500,
          color: "text.secondary",
          mb: 1,
        }}
      >
        01
      </Typography>
      <Typography
        sx={{
          fontFamily: "Inter",
          fontSize: isMobile ? 18 : 20,
          fontWeight: 600,
          mb: 1,
        }}
      >
        Intelligent Scan
      </Typography>
      <Typography
        sx={{
          fontFamily: "Inter",
          fontSize: 14,
          fontWeight: 400,
          color: "text.secondary",
          mb: 2,
        }}
      >
        Continuously scans competitor mentions and activity across key communities.
      </Typography>

      {/* 🔽 Replaced with image */}
      <Box
        component="img"
        src={featureImage}
        alt="Feature visual"
        sx={{
          width: "100%",
          height: "auto",
          borderRadius: 2,
          objectFit: "cover",
          mb: 2,
        }}
      />
    </CardContent>
  </Card>
</Grid>


        {/* Card 2 */}
        <Grid item xs={12} md={4}>
          <Card sx={{ p: 2, borderRadius: 3, height: "100%",  background: `linear-gradient(135deg, #F1EAFF 0%, white 100%)` }}>
            <CardContent>
              <Typography
                sx={{
                  fontFamily: "Inter",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "text.secondary",
                  mb: 1,
                }}
              >
                02
              </Typography>
              <Typography
                sx={{
                  fontFamily: "Inter",
                  fontSize: isMobile ? 18 : 20,
                  fontWeight: 600,
                  mb: 1,
                }}
              >
                Smart Alerts
              </Typography>
              <Typography
                sx={{
                  fontFamily: "Inter",
                  fontSize: 14,
                  fontWeight: 400,
                  color: "text.secondary",
                  mb: 2,
                }}
              >
                Sends you automated alerts when rivals launch features or gain traction.
              </Typography>

              <Box
                sx={{
                  p: 2,
                  mb: 2,
                  border: "1px solid",
                  borderColor: "grey.200",
                  borderRadius: 2,
                }}
              >
                <Typography
                  sx={{
                    fontFamily: "Inter",
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  Emerging Trends
                </Typography>
                <Typography
                  sx={{
                    fontFamily: "Inter",
                    fontSize: 12,
                    fontWeight: 400,
                    color: "text.secondary",
                  }}
                >
                  Highlights emerging trends so you can react before the market moves.
                </Typography>
              </Box>

              <Box
                sx={{
                  p: 2,
                  border: "1px solid",
                  borderColor: "grey.200",
                  borderRadius: 2,
                }}
              >
                <Typography
                  sx={{
                    fontFamily: "Inter",
                    fontSize: 14,
                    fontWeight: 500,
                  }}
                >
                  Competitor Focus
                </Typography>
                <Typography
                  sx={{
                    fontFamily: "Inter",
                    fontSize: 12,
                    fontWeight: 400,
                    color: "text.secondary",
                  }}
                >
                  Gives you a clearer picture of where competitors are focusing their efforts.
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Card 3 */}
        <Grid item xs={12} md={4}>
          <Card sx={{ p: 2, borderRadius: 3, height: "100%",  background: `linear-gradient(135deg, #CDF5FD 0%, white 100%)` }}>
            <CardContent>
              <Typography
                sx={{
                  fontFamily: "Inter",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "text.secondary",
                  mb: 1,
                }}
              >
                03
              </Typography>
              <Typography
                sx={{
                  fontFamily: "Inter",
                  fontSize: isMobile ? 18 : 20,
                  fontWeight: 600,
                  mb: 1,
                }}
              >
                Opportunities
              </Typography>
              <Typography
                sx={{
                  fontFamily: "Inter",
                  fontSize: 14,
                  fontWeight: 400,
                  color: "text.secondary",
                  mb: 2,
                }}
              >
                Automated monitoring of competitor activity & Uncover gaps and emerging trends to act on.
              </Typography>

              <Box textAlign="center">
                <Typography
                  sx={{
                    fontFamily: "Inter",
                    fontSize: isMobile ? 26 : 36,
                    fontWeight: 700,
                  }}
                >
                  360
                </Typography>
                <Typography
                  sx={{
                    fontFamily: "Inter",
                    fontSize: 14,
                    fontWeight: 400,
                    color: "text.secondary",
                  }}
                >
                  Opportunities Found
                </Typography>
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* Dummy chart */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "space-around",
                  height: 100,
                }}
              >
                {[40, 70, 50, 80, 60].map((h, i) => (
                  <Box
                    key={i}
                    sx={{
                      width: 20,
                      height: h,
                      bgcolor: i === 3 ? "primary.main" : "grey.400",
                      borderRadius: 1,
                    }}
                  />
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default FeatureSectionThree;

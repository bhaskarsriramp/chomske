// FeaturesShowcase.jsx
import {
  Box,
  Grid,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import GeneratedImageReddit from "../images/GeneratePostsImage.png"

/**
 * FeaturesShowcase
 * - features: array of { id, title, subtitle, bullets: [str], stats: [{label, value}], image }
 * - options: { alternate: boolean } - alternate image left/right on large screens
 */
export default function FeaturesShowcase({
  features = [
    // Example default data (replace images with your real screenshot URLs)
    {
      id: "timing",
      title: "Stop Building Features Nobody Wants.",
      subtitle:
        "Validate Features with Real Community Feedback. Transform your ideas into natural Reddit posts & tweets, shares them with the right audiences, and delivers clear insights. ",
      bullets: [
        "Posts are automatically optimized for subreddit culture and rules, so you don’t have to guess what works.",
        "Each post follows community guidelines, reducing the chances of rejection or bans.",
        "Multiple ready-to-post drafts are generated in seconds, saving you hours of manual writing.",
        "Designed to spark conversations that help you collect meaningful feedback and validate your feature.",
      ],
     stats: [
  // { value: "0 hrs", label: "Time spent reading all subreddit rules" },
  // { value: "Real feedback", label: "Validate features directly from active communities" },
],

      image: GeneratedImageReddit,
      // optionally set accent color per feature
      accent: "#064e3b",
      
      
    },

//      {
//   id: "insights",
//   title: "Know What Matters Most to Users.",
//   subtitle:
//     "Manually scanning comment threads takes hours. We analyze community replies, surface clear themes, and deliver insights you can act on.",
//   bullets: [
//     "Stop wasting hours reading every reply — insights are surfaced automatically.",
//     "Feedback, concerns, and suggestions are grouped clearly so you see what matters.",
//     "Recurring themes are highlighted, so real user needs stand out fast.",
//     "Actionable insights land in under 48 hours, helping you refine features before losing momentum.",
//   ],
//   stats: [
//     { value: "90% less effort", label: "Compared to reading comments manually" },
//     { value: "100%", label: "Feedback automatically analyzed and categorized" },
//   ],
//       image: GeneratedImageReddit,
//       // optionally set accent color per feature
//       accent: "#064e3b",
//       background: "#D2E0FB"

//     },

//   {
//   id: "competitor-tracking",
//   title: "Don’t Miss When People Talk About You.",
//   subtitle:
//     "Your users and competitors are already being discussed online. Monitor competitors across Reddit and other platforms with AI-powered alerts, so you can stay ahead of market shifts and spot new opportunities early.",
//   bullets: [
//     "Continuously scans competitor mentions and activity across key communities.",
//     "Sends you automated alerts when rivals launch features or gain traction.",
//     "Highlights emerging trends so you can react before the market moves.",
//     "Gives you a clearer picture of where competitors are focusing their efforts.",
//   ],
//   stats: [
//     { value: "Real-time", label: "Automated monitoring of competitor activity" },
//     { value: "Opportunities", label: "Uncover gaps and emerging trends to act on" },
//   ],
//    image: GeneratedImageReddit,
//       // optionally set accent color per feature
//       accent: "#064e3b",
//       background: "#E0FBE2"
// },

// {
//   id: "engagement",
//   title: "Stay Visible While You Build.",
//   subtitle:
//     "FoundersPage repurposes your drafts into platform-ready posts, schedules them at peak times, and keeps them human, rule-friendly, and engaging.",
//   bullets: [
//     "Generates platform-ready posts that feel natural, not promotional.",
//     "Helps you respond quickly without sounding generic or automated.",
//     "Transforms casual interactions into trust-building conversations.",
//     "Converts engaged users into loyal customers through authentic dialogue.",
//   ],
//   stats: [
//     { value: "Consistent", label: "Replies always reflect your brand’s voice" },
//     { value: "Faster", label: "Engage with communities in less time" },
//   ],

//    image: GeneratedImageReddit,
//       // optionally set accent color per feature
//       accent: "#064e3b",
//       background: "#D0BFFF"
      
// }

  ],
  alternate = true,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm")); 
  const isSm = useMediaQuery(theme.breakpoints.down("sm"));
  const isMd = useMediaQuery(theme.breakpoints.down("md"));

  return (

<>
      {features.map((f, idx) => {
        const imageFirst = alternate ? idx % 2 === 0 : true; // alternate on desktop
        // On mobile, always image first (stacked)
        const imageOnTop = isSm ? true : imageFirst;

        return (

              <Box
      component="section"
      sx={{
        background: "linear-gradient(90deg,#E5E1DA 0%, #F5EFFF 100%)",
        py: { xs: 3.5, sm: 8, md: 8 },
        px: { xs: 3.5, sm: 4, md: 12 },
        mx: { xs: 1, sm: 6, md: 6},
        borderRadius : 6,
        mb: 1
      }}
    >
          <Grid
            container
            key={f.id}
            spacing={4}
            alignItems="center"
            sx={{
              // spacing between feature sections
              mb: idx === features.length - 1 ? 0 : { xs: 4, md: 10 },
              // small subtle background band for alternating rows (optional)
              // background: idx % 2 ? "transparent" : "transparent",
            }}
            direction={isSm ? "column" : "row"}
          >
            {/* IMAGE COLUMN */}
            <Grid
              item
              xs={12}
              md={6}
              order={imageOnTop ? 0 : 1}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                px: { xs: 0, md: 2 },
              }}
            >
              <Box
                sx={{
                  width: "100%",
                  maxWidth: 720,
                  // make the image card have rounded mask on desktop pair edges
                  borderRadius: { xs: 2, md: 3 },
                  overflow: "hidden",
                  boxShadow: { md: "0 20px 50px rgba(2,6,23,0.12)" },
                  // visual frame background (keeps contrast for screenshots)
                  background:
                    "linear-gradient(135deg, rgba(255,255,255,0.9), rgba(250,250,252,1))",
                }}
              >
                {/* Decorative container for screenshot; use img or picture */}
                <Box
                  component="img"
                  src={f.image}
                  alt={f.title}
                  loading="lazy"
                  sx={{
                    width: "100%",
                    height: { xs: "auto", md: 360 },
                    objectFit: "contain",
                    display: "block",
                  }}
                />
              </Box>
            </Grid>

            {/* CONTENT COLUMN */}
            <Grid
              item
              xs={12}
              md={6}
              order={imageOnTop ? 1 : 0}
              sx={{
                px: { xs: 0, md: 3 },
                pt: { xs: 2, md: 0 },
              }}
            >
              <Box>
                <Typography
                  sx={{
                    fontFamily : 'Inter',
                    fontSize : isMobile ? '22px' : '32px',
                    fontWeight: 800,
                    color: f.accent || "text.primary",
                    lineHeight: 1.25,
                    mb: 2,
                  }}
                >
                  {f.title}
                </Typography>

                <Typography
                  color="text.secondary"
                  sx={{ mb: { xs: 2, md: 3 } , fontSize : isMobile ? '15px' : '16px' }}
                >
                  {f.subtitle}
                </Typography>

                {/* bullets */}
                <Box
                  component="ul"
                  sx={{
                    listStyle: "none",
                    p: 0,
                    m: 0,
                    mb: 3,
                    display: "flex",
                    flexDirection: "column",
                    gap: { xs: 1.25, md: 1.75 },
                  }}
                >
                  {f.bullets.map((b, i) => (
                    <Box
                      component="li"
                      key={i}
                      sx={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 2,
                      }}
                    >
                      <Box
                        sx={{
                          mt: "6px",
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          bgcolor: f.accent || theme.palette.primary.main,
                          flexShrink: 0,
                          boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
                        }}
                        aria-hidden
                      />
                      <Typography color="text.primary" sx={{ fontFamily : 'Inter', fontSize : isMobile ? '15px' : '16px'}}>
                        {b}
                      </Typography>
                    </Box>
                  ))}
                </Box>

                {/* Stats row */}
                {f.stats && f.stats.length > 0 && (
                  <Box
                    sx={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 2,
                    }}
                  >
                    {f.stats.map((s, i) => (
                      <Box
                        key={i}
                        sx={{
                          bgcolor: f.accent ? `${f.accent}20` : "primary.100",
                          borderRadius: 2,
                          px: 1.8,
                          py: 1,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-start",
                        }}
                      >
                        <Typography sx={{ fontFamily : 'Inter', fontWeight: 800, fontSize: isMobile ? '1rem' : '1.4rem', lineHeight: 1 }}>
                          {s.value}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                          {s.label}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                )}

              </Box>
            </Grid>
          </Grid>
          </Box>
        );
      })}

      </>
  );
}

// StatsShowcase.js
import React from "react";
import {
  Box,
  Grid,
  Typography,
  useTheme,
  useMediaQuery,
  Stack,
} from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";

const stats = [
  { value: "72", suffix: "%", label: "Features succeed moreee.. when validated with users first." },
  { value: "42", suffix: "%", label: "Boost in survival by solving real market needs." },
  { value: "≈2",  suffix: "x", label: "Higher success likelihood when features are validated." },
  { value: "≈3",  suffix: "mo", label: "Average time saved by avoiding unwanted features." },
];


export default function Feature21({ data = stats }) {
  const theme = useTheme();
  const mdUp = useMediaQuery(theme.breakpoints.up("md"));

  return (
    <Box
      sx={{
        px: { xs: 1, sm: 4, md: 6 },
        display: "flex",
        justifyContent: "center",
      }}
    >
      <Box
        sx={{
          width: "100%",
          background: "#fff",
          borderRadius: { xs: 2, sm: 3, md: 4 },
        background: "linear-gradient(90deg,#F5EFFF 0%, #E5E1DA 100%)",
        borderRadius: { xs: 3, sm: 4, md: 6 },
          boxShadow: "0 6px 30px rgba(16,24,40,0.06)",
          px: { xs: 2, sm: 6 },
          py: { xs: 4, sm: 5, md: 6 },
        }}
      >
        <Grid
          container
          columns={12}
          spacing={{ xs: 3, sm: 4, md: 2 }}
        >
          {data.map((s, idx) => {
            const isLast = idx === data.length - 1;
            return (
              <Grid
                key={idx}
                item
                xs={6}
                sm={6}
                md={3}
                sx={{
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {/* use an inner box to hold the border so the Grid item width isn't affected */}
                <Box
                  sx={{
                    width: "100%",
                    pr: { md: 3 },
                    // show a thin vertical line on md+ except for last item
                    borderRight: {
                      md: !isLast ? "1px solid rgba(11,11,26,0.08)" : "none",
                    },
                    // add some inner padding to visually separate the border
                    pr: { xs: 0, md: 3 },
                  }}
                >
                  <Stack
                    direction="row"
                    alignItems="flex-start"
                    spacing={2}
                    sx={{ width: "100%" }}
                  >
                    <Box>
                      <Box sx={{ display: "flex", alignItems: "center" }}>
                        <Typography
                          component="span"
                          sx={{
                            fontFamily: "'Inter', sans-serif",
                            fontWeight: 700,
                            fontSize: { xs: 32, sm: 32, md: 54 },
                            lineHeight: 1,
                            color: "#0B0B1A",
                          }}
                        >
                          {s.value}
                        </Typography>
                        <Typography
                          component="span"
                          sx={{
                            fontFamily: "'Inter', sans-serif",
                            fontWeight: 500,
                            fontSize: { xs: 15, sm: 18, md: 20 },
                            color: "#0B0B1A",
                            opacity: 0.9,
                            mt: 1.2,
                          }}
                        >
                          {s.suffix}
                        </Typography>

                        <Box
                          sx={{
                            ml: 1.5,
                            mt: 0.6,
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            border: "1px solid rgba(11,11,26,0.12)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                          aria-hidden
                        >
                          <ArrowUpwardIcon sx={{ fontSize: 16 }} />
                        </Box>
                      </Box>

                      <Typography
                        sx={{
                          mt: 1.6,
                          fontSize: 14,
                          fontWeight: 400,
                          color: "rgba(11,11,26,0.7)",
                        }}
                      >
                        {s.label}
                      </Typography>
                    </Box>
                  </Stack>
                </Box>
              </Grid>
            );
          })}
        </Grid>
      </Box>
    </Box>
  );
}

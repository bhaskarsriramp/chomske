import React from "react";
import { Box, Grid, Typography } from "@mui/material";

export default function ContentShowcase() {
  const sections = [
    {
      bg: "#F4B6E5", // pink
      text: "Share anything, anywhere, any way",
      images: [
        "https://storage.googleapis.com/postlnbucketcom/products/ChatGPT%20Image%20Oct%206%2C%202025%2C%2010_47_07%20PM.png",
        "https://storage.googleapis.com/postlnbucketcom/products/ChatGPT%20Image%20Oct%206%2C%202025%2C%2010_51_14%20PM.png"
      ]
    },
    {
      bg: "#D8F94D", // lime green
      text: "Sell anything and collect payments—no friction",
      images: [
        "https://storage.googleapis.com/postlnbucketcom/products/ChatGPT%20Image%20Oct%206%2C%202025%2C%2010_57_16%20PM.png",
        "https://storage.googleapis.com/postlnbucketcom/products/ChatGPT%20Image%20Oct%206%2C%202025%2C%2011_00_29%20PM.png",
        "https://storage.googleapis.com/postlnbucketcom/products/ChatGPT%20Image%20Oct%206%2C%202025%2C%2010_53_35%20PM.png"
      ]
    },
    {
      bg: "#0D1EF0", // blue
      text: "Grow your audience, own the relationship everywhere",
      images: [
        "https://storage.googleapis.com/postlnbucketcom/products/ChatGPT%20Image%20Oct%206%2C%202025%2C%2011_05_29%20PM.png"
        
      ]
    }
  ];

  const Card = ({ s, i }) => {
    const isRight = i === 2; // right-side tall card
    return (
      <Box
        sx={{
          backgroundColor: s.bg,
          borderRadius: "24px",
          px: { xs: 3, md: 6 },
          py: { xs: 3, md: 6 },
          height: "100%",
          color: isRight ? "#FFFFFF" : "#000000",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          alignItems: "flex-start",
          boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
          overflow: "hidden"
        }}
      >
        {/* Media */}
        {isRight ? (
          // ONE big image filling width
          <Box
            sx={{
              mb: 3,
              width: "100%",
              borderRadius: "20px",
              overflow: "hidden"
            }}
          >
            <Box
              component="img"
              src={s.images[0]}
              alt={`section-${i}-hero`}
              sx={{
                display: "block",
                width: "100%",
                height: { xs: 240, sm: 320, md: 480 },
                objectFit: "cover"
              }}
            />
          </Box>
        ) : (
          // Multiple thumbnails for left cards
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 3 }}>
            {s.images.map((img, j) => (
              <Box
                key={j}
                component="img"
                src={img}
                alt={`section-${i}-img-${j}`}
                sx={{
                  width: { xs: "70px", sm: "90px", md: "160px" },
                  height: { xs: "70px", sm: "90px", md: "160px" },
                  borderRadius: "16px",
                  objectFit: "cover",
                  backgroundColor: "#fff",
                  flexShrink: 0
                }}
              />
            ))}
          </Box>
        )}

        {/* Text */}
        <Typography
          variant="h6"
          sx={{
            fontWeight: 600,
            fontSize: { xs: "1.1rem", md: "1.25rem" },
            lineHeight: 1.4,
            mt: isRight ? 1 : 0
          }}
        >
          {s.text}
        </Typography>
      </Box>
    );
  };

  return (
    <Box
      sx={{
        width: "100%",
        py: { xs: 6, md: 10 },
        px: { xs: 2, sm: 4, md: 8 },
        display: "flex",
        flexDirection: "column",
        gap: { xs: 4, md: 6 },
        backgroundColor: "#F9FAFB"
      }}
    >
      <Grid container spacing={3} alignItems="stretch">
        {/* Left column: two stacked grids */}
        <Grid item xs={12} md={6}>
          <Grid container spacing={3} direction="column">
            <Grid item xs={12}>
              <Card s={sections[0]} i={0} />
            </Grid>
            <Grid item xs={12}>
              <Card s={sections[1]} i={1} />
            </Grid>
          </Grid>
        </Grid>

        {/* Right column: single tall grid with one big image */}
        <Grid item xs={12} md={6} sx={{ display: "flex" }}>
          <Card s={sections[2]} i={2} />
        </Grid>
      </Grid>
    </Box>
  );
}

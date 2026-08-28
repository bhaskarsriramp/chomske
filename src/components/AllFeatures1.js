import React from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Container,
  useMediaQuery,
} from "@mui/material";
import { styled, useTheme } from "@mui/material/styles";

// How much of the viewport to use as "peek" on each side (vw units)
const PEEK_VW = 10; // try 8-12 to tune

const StyledCard = styled(Card)(({ theme }) => ({
  height: "100%",
  width: "100%",
  display: "flex",
  flexDirection: "column",
  borderRadius: "24px",
  padding: theme.spacing(2),
  boxShadow: "0 0px 0px rgba(0,0,0,0.08)",
  transition: "transform 0.3s ease",
  "&:hover": {
    transform: "translateY(-8px)",
  },
}));

const ImageContainer = styled(Box)(({ theme }) => ({
  width: "100%",
  height: "300px",
  borderRadius: "24px",
  overflow: "hidden",
  backgroundSize: "cover",
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
  boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
  marginBottom: theme.spacing(2),
}));

const ScrollContainer = styled(Box)(({ theme }) => {
  const gap = theme.spacing(3);
  const padding = `${PEEK_VW}vw`;
  const cardWidth = `calc(100vw - ${PEEK_VW * 2}vw)`;

  return {
    display: "flex",
    gap,
    alignItems: "stretch",
    [theme.breakpoints.down("md")]: {
      overflowX: "auto",
      scrollSnapType: "x mandatory",
      WebkitOverflowScrolling: "touch",
      paddingLeft: padding,
      paddingRight: padding,
      scrollbarWidth: "none",
      "&::-webkit-scrollbar": { display: "none" },
      "& > *": {
        scrollSnapAlign: "start",
        minWidth: cardWidth,
        flexShrink: 0,
      },
    },
    [theme.breakpoints.up("md")]: {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap,
      alignItems: "stretch",
    },
  };
});

const FullWidthCard = styled(Card)(({ theme }) => ({
  borderRadius: "24px",
  padding: theme.spacing(4),
  marginTop: theme.spacing(4),
  background: "#C8AAAA",
  boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
  display: "flex",
  gap: theme.spacing(4),
  [theme.breakpoints.down("md")]: {
    flexDirection: "column",
  },
}));

const FeatureCards = () => {
  const theme = useTheme();
  const isMdUp = useMediaQuery(theme.breakpoints.up("md"));

  const topCards = [
    {
      image:
        "https://storage.googleapis.com/myhandlebucket/landingPageImg/Bio_page_img_main.webp",
      heading: "Bio Page",
      description:
        "Turn profile visitors into customers with a high-converting bio page that brings together your links, offers, products, and CTAs — all in one place.",
      bg: "#9ACBD0",
    },
    {
      image:
        "https://storage.googleapis.com/myhandlebucket/landingPageImg/AutoDM_Img_Main-min.png",
      heading: "Auto DM",
      description:
        "Automate replies, private message, and convert conversations into customers with Instagram DM Automation. Unlimited Contacts.",
      bg: "#D76C82",
    },
    {
      image:
        "https://storage.googleapis.com/myhandlebucket/landingPageImg/Book_consultation_img_main-min.png",
      heading: "1:1 Consultation",
      description:
        "Schedule paid consultations, connect with clients directly, and deliver personalized value through seamless 1:1 bookings. Automate Bookings.",
      bg: "#DBDBDB",
    },
  ];

  const bottomCard = {
    image:
      "https://storage.googleapis.com/myhandlebucket/landingPageImg/Digital_store_img_main-min.png",
    heading: "Sell Digital Products",
    description:
      "Sell ebooks, courses, templates, and digital downloads with a simple one-page checkout — no drop-offs, no website needed.",
  };

  return (
    <Container maxWidth="lg" sx={{ py: 6 }}>
      {/* Parent heading */}
      <Box sx={{ mb: 4, textAlign: { xs: "center", md: "left" } }}>
        <Typography
          component="h2"
          sx={{
            fontFamily: "Inter",
            fontSize: { xs: "20px", md: "28px" },
            fontWeight: 700,
            lineHeight: 1.1,
          }}
        >
          Everything you need to grow your audience & income
        </Typography>
      </Box>

      {/* Top cards */}
      <Box sx={{ width: "100%", overflow: "visible" }}>
        <ScrollContainer>
          {topCards.map((card, index) => (
            <StyledCard key={index} sx={{ backgroundColor: card.bg }}>
              <ImageContainer sx={{ backgroundImage: `url(${card.image})` }} />
              <CardContent
                sx={{
                  flexGrow: 1,
                  display: "flex",
                  flexDirection: "column",
                  p: 0,
                }}
              >
                <Typography
                  gutterBottom
                  sx={{
                    fontFamily: "Inter",
                    fontSize: isMdUp ? "24px" : "16px",
                    fontWeight: 700,
                  }}
                >
                  {card.heading}
                </Typography>
                <Typography
                  sx={{
                    fontFamily: "Inter",
                    fontSize: isMdUp ? "15px" : "14px",
                    fontWeight: 600,
                    mb: 3,
                    lineHeight: 1.7,
                  }}
                >
                  {card.description}
                </Typography>
              </CardContent>
            </StyledCard>
          ))}
        </ScrollContainer>
      </Box>

      {/* Bottom Full Width Card */}
      <FullWidthCard>
        <Box
          sx={{
            flex: { md: 1 },
            display: "flex",
            flexDirection: "column",
            justifyContent: "center", // vertically centered
            alignItems: "flex-start", // left aligned text
            textAlign: "left",
            px: { xs: 2, md: 0 }, // small horizontal padding on mobile
            py: { xs: 3, md: 0 },
          }}
        >
          <Typography
            variant="h4"
            component="h3"
            fontWeight="700"
            gutterBottom
            sx={{ textAlign: "left", fontSize: { xs: "20px", md: "28px" } }}
          >
            {bottomCard.heading}
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ mb: 3, lineHeight: 1.8 }}
          >
            {bottomCard.description}
          </Typography>
        </Box>

        <Box
          sx={{
            flex: { md: 1 },
            borderRadius: "16px",
            overflow: "hidden",
            height:'300px'
          }}
        >
          <img
            src={bottomCard.image}
            alt={bottomCard.heading}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </Box>
      </FullWidthCard>
    </Container>
  );
};

export default FeatureCards;

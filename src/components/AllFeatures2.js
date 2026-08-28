// AllFeatures2.jsx
import React, { useState, useRef, useEffect } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { styled, useTheme } from "@mui/material/styles";
import { useNavigate } from "react-router-dom";

// tweak this to control peek on both sides (in vw)
const PEEK_VW = 10; // try 8-12 to tune

// ----- Constants -----
const OPTIONS = [
  {
    id: "digital",
    title: "Lead Magnet",
    heading: "Lead Magnet",
    description:
      "Build beautiful, high-converting forms to capture emails, phone numbers, and audience insights — all in one place.",
    cta: "Try it Free",
    image:
      "https://storage.googleapis.com/myhandlebucket/landingPageImg/LeadMagnet_img_main-min.png",
    bg: "#2F7D60",
  },
  {
    id: "courses",
    title: "Courses",
    heading: "Sell online courses",
    description:
      "Build, publish and sell video courses with student management, payments and instant access.",
    cta: "Create Course",
    image:
      "https://storage.googleapis.com/myhandlebucket/landingPageImg/Digital_courses_img_main-min.png",
    bg: "#4A70A9",
  },
  {
    id: "events",
    title: "Events",
    heading: "Run Events & Webinars",
    description:
      "Sell tickets, handle registrations, and keep attendees updated — all in one simple dashboard.",
    cta: "Create Event",
    image:
      "https://storage.googleapis.com/myhandlebucket/landingPageImg/Tickets_image_main-min.png",
    bg: "#D76C82",
  },
];

// ----- Styled components -----
const Nav = styled("nav")(({ theme }) => ({
  display: "flex",
  gap: theme.spacing(4),
  flexWrap: "wrap",
  marginBottom: theme.spacing(4),
}));

const NavButton = styled(Button, {
  shouldForwardProp: (p) => p !== "active",
})(({ theme, active }) => ({
  textTransform: "none",
  color: active ? theme.palette.text.primary : theme.palette.text.secondary,
  fontWeight: active ? 700 : 600,
  background: "transparent",
  padding: theme.spacing(1),
  minWidth: 0,
  borderRadius: theme.shape.borderRadius,
  "&:hover": {
    background: "transparent",
    opacity: 0.9,
  },
}));

const DesktopHero = styled(Card)(({ theme, bgcolor }) => ({
  display: "flex",
  gap: theme.spacing(4),
  borderRadius: 20,
  overflow: "hidden",
  alignItems: "stretch",
  background: bgcolor || theme.palette.background.paper,
  color: "#fff",
  boxShadow: "0 10px 40px rgba(15,23,42,0.08)",
}));

const HeroTextWrap = styled(Box)(({ theme }) => ({
  flex: 1,
  padding: theme.spacing(6),
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
}));

const HeroImageWrap = styled(Box)(({ theme }) => ({
  flex: 1,
  minHeight: 280,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  position: "relative",
}));

// MobileScroll now uses PEEK_VW to size cards smaller than viewport
const MobileScroll = styled(Box)(({ theme }) => {
  const padding = `${PEEK_VW}vw`;
  const cardWidth = `calc(100vw - ${PEEK_VW * 2}vw)`; // card smaller than viewport
  return {
    display: "flex",
    gap: theme.spacing(3),
    overflowX: "auto",
    paddingBottom: theme.spacing(1),
    paddingLeft: padding,
    paddingRight: padding,
    WebkitOverflowScrolling: "touch",
    scrollbarWidth: "none",
    "&::-webkit-scrollbar": { display: "none" },
    "& > *": {
      flexShrink: 0,
      minWidth: cardWidth, // KEY: ensures each card is smaller than viewport
      maxWidth: cardWidth,
      scrollSnapAlign: "start",
      boxSizing: "border-box",
    },
    scrollSnapType: "x mandatory",
  };
});

const MobileCard = styled(Card)(({ theme }) => ({
  borderRadius: 16,
  overflow: "hidden",
  boxShadow: "0 6px 24px rgba(0,0,0,0.06)",
  scrollSnapAlign: "start",
  display: "flex",
  flexDirection: "column",
}));

// ----- Component -----
export default function AllFeatures2() {
  const theme = useTheme();
  const isMdUp = useMediaQuery(theme.breakpoints.up("md"));
  const navigate = useNavigate();
  const [selected, setSelected] = useState(OPTIONS[0].id);

  const selectedItem = OPTIONS.find((o) => o.id === selected) || OPTIONS[0];

  // for mobile snapping: focus selected card into view when selected via tabs
  const scrollRef = useRef(null);
  useEffect(() => {
    if (!isMdUp && scrollRef.current) {
      const el = scrollRef.current.querySelector(`[data-id="${selected}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", inline: "start" });
    }
  }, [selected, isMdUp]);

  const handleCta = (e) => {
    e?.stopPropagation?.();
    // navigate to professional login page
    navigate("/professional/login");
  };

  return (
    <Container maxWidth="lg" sx={{ py: 6 }}>
      {/* main hero heading/subheading */}
      <Box sx={{ mb: 3, textAlign: { xs: "center", md: "left" } }}>
        <Typography
          component="h1"
          sx={{
            fontFamily: "Inter",
            fontSize: { xs: "22px", md: "36px" },
            fontWeight: 700,
            lineHeight: 1.05,
          }}
        >
          Grow your earnings faster
        </Typography>
        <Typography
          component="p"
          sx={{
            fontFamily: "Inter",
            fontSize: { xs: "18px", md: "24px" },
            fontWeight: 700,
            mt: 0.5,
            color: theme.palette.text.primary,
          }}
        >
          with powerful tools built for monetization
        </Typography>
      </Box>

      {/* Options nav */}
      <Nav aria-label="Monetization options" role="tablist">
        {OPTIONS.map((opt) => (
          <NavButton
            key={opt.id}
            onClick={() => setSelected(opt.id)}
            active={opt.id === selected ? 1 : 0}
            aria-pressed={opt.id === selected}
            aria-selected={opt.id === selected}
            sx={{ fontFamily : 'Inter', fontSize : '16px'}}
          >
            {opt.title}
          </NavButton>
        ))}
      </Nav>

      {/* Desktop: large hero card for selected option */}
      {isMdUp ? (
        <DesktopHero bgcolor={selectedItem.bg}>
          <HeroTextWrap>
            <Typography
              variant="h4"
              component="h2"
              sx={{
                fontFamily: 'Inter',
                color: "#fff",
                fontWeight: 800,
                fontSize: { md: "34px" },
                mb: 2              }}
            >
              {selectedItem.heading}
            </Typography>

            <Typography
              variant="body1"
              sx={{ color: "rgba(255,255,255,0.9)", mb: 3, lineHeight: 1.7, fontFamily : 'Inter' }}
            >
              {selectedItem.description}
            </Typography>

            <Box sx={{ mt: 1 }}>
              <Button
                variant="contained"
                size="large"
                onClick={handleCta}
                sx={{
                  background: "#fff",
                  color: selectedItem.bg ? selectedItem.bg : "black",
                  textTransform: "none",
                  fontWeight: 700,
                  fontFamily : 'Inter'
                }}
              >
                {selectedItem.cta}
              </Button>
            </Box>
          </HeroTextWrap>

          <HeroImageWrap>
            <img
              src={selectedItem.image}
              alt={selectedItem.heading}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          </HeroImageWrap>
        </DesktopHero>
      ) : (
        // Mobile: show horizontal swipable cards for all options (fixed sizing so next card peeks)
        <Box sx={{ mt: 3 }}>
          <MobileScroll ref={scrollRef}>
            {OPTIONS.map((opt) => (
              <MobileCard
                key={opt.id}
                data-id={opt.id}
                sx={{
                  border: "none",
                  height: '500px',
                }}
                onClick={() => setSelected(opt.id)}
              >
                {/* image on top */}
                <Box
                  sx={{
                    width: "100%",
                    height: 260,
                    backgroundImage: `url(${opt.image})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
                <CardContent sx={{ flexGrow: 1, py: 2 }}>
                  <Typography
                    variant="h6"
                    component="h3"
                    sx={{ fontWeight: 700, mb: 1, mt: 2, fontFamily : 'Inter', fontSize : '20px' }}
                  >
                    {opt.heading}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.primary"
                    sx={{ mb: 2, fontFamily : 'Inter', fontWeight : 400, fontSize : '15px' }}
                  >
                    {opt.description}
                  </Typography>
                  <Button
                    size="medium"
                    variant="contained"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCta();
                    }}
                    sx={{ textTransform: "none", fontFamily : 'Inter', fontWeight : 500, fontSize : '14px', background : '#1D546C'}}
                  >
                    {opt.cta}
                  </Button>
                </CardContent>
              </MobileCard>
            ))}
          </MobileScroll>
        </Box>
      )}
    </Container>
  );
}

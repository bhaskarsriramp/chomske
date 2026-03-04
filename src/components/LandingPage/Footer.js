import { Box, Container, Grid, Typography, IconButton, Divider, Stack, Link as MuiLink } from "@mui/material";
import { Link } from "react-router-dom";
import chomskeIcon from "../../images/Chomske_icon.png";
import LinkedInIcon from "@mui/icons-material/LinkedIn";
import TwitterIcon from "@mui/icons-material/Twitter";

const footerSections = {
  product: [
    { name: "Problem", path: "/problem" },
    { name: "How It Works", path: "/how-it-works" },
    { name: "4 Engines", path: "/engines" },
  ],
  company: [
    { name: "About Us", path: "/about-us" },
    { name: "Contact Us", path: "/contact" },
    { name: "Disclosure Policy", path: "/disclosure-policy" },
    { name: "Google API Disclosure", path: "/google-api-disclosure" },
  ],
  legal: [
    { name: "Privacy Policy", path: "/privacy-policy" },
    { name: "Terms & Conditions", path: "/terms" },
    { name: "Refund Policy", path: "/refund-cancellation-policy" },
    { name: "Shipping Policy", path: "/shipping-policy" },
  ],
};

const Footer = () => {
  return (
    <Box
      component="footer"
      sx={{
        backgroundColor: "#020617",
        color: "#fff",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        pt: { xs: 8, md: 10 },
        pb: 4,
        position: "relative",
        overflow: "hidden",
        fontFamily: "Inter, sans-serif",
      }}
    >
      {/* Top border glow */}
      <Box sx={{
        position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
        width: "70%", height: "1px",
        background: "linear-gradient(90deg, transparent 0%, rgba(99,102,246,0.5) 50%, transparent 100%)",
        opacity: 0.6,
      }} />

      <Container maxWidth="lg">
        <Box sx={{
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: { xs: 6, md: 0 },
        }}>

          {/* Brand column */}
          <Box sx={{ maxWidth: 300 }}>
            <Link to="/" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <img
                src={chomskeIcon}
                alt=""
                style={{ height: 32, width: 32, borderRadius: 8, display: "block", flexShrink: 0 }}
              />
              <Typography sx={{
                fontSize: "18px", fontWeight: 800, color: "#fff",
                letterSpacing: "-0.03em", fontFamily: "Inter",
              }}>
                Chomske
              </Typography>
            </Link>

            <Typography variant="body2" sx={{
              color: "#64748b", lineHeight: 1.65, fontSize: "14px", mt: 0.5,
            }}>
              Operational intelligence for SaaS founders. Know who needs you before they leave. Built for SaaS founders.
            </Typography>

            <Stack direction="row" spacing={1.5} sx={{ mt: 3 }}>
              {[
                { href: "https://www.linkedin.com/in/bhaskarsriram/", label: "LinkedIn", Icon: LinkedInIcon },
                { href: "https://x.com/ibhaskarsriram",                  label: "Twitter",  Icon: TwitterIcon  },
              ].map(({ href, label, Icon }) => (
                <IconButton
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  sx={{
                    color: "#64748b",
                    border: "1px solid rgba(255,255,255,0.08)",
                    transition: "all 0.2s ease",
                    "&:hover": { color: "#fff", borderColor: "rgba(99,102,241,0.4)", bgcolor: "rgba(99,102,241,0.08)" },
                  }}
                >
                  <Icon fontSize="small" />
                </IconButton>
              ))}
            </Stack>
          </Box>

          {/* Product links */}
          <Box>
            <Typography sx={{
              fontWeight: 700, color: "#fff",
              mb: 3, fontSize: "14px", letterSpacing: "0.3px", fontFamily: "Inter",
            }}>
              Product
            </Typography>
            <Stack spacing={1.5}>
              {footerSections.product.map(link => (
                <Link key={link.name} to={link.path} style={{ textDecoration: "none" }}>
                  <Typography variant="body2" sx={{
                    color: "#64748b", fontSize: "13.5px", fontFamily: "Inter",
                    transition: "all 0.18s ease", display: "inline-block",
                    "&:hover": { color: "#A5B4FC", transform: "translateX(3px)" },
                  }}>
                    {link.name}
                  </Typography>
                </Link>
              ))}
            </Stack>
          </Box>
        </Box>

        <Divider sx={{ borderColor: "rgba(255,255,255,0.06)", mt: 8, mb: 4 }} />

        <Box sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          justifyContent: "space-between",
          alignItems: "center",
          gap: 2,
        }}>
          <Typography variant="caption" sx={{ color: "#334155", fontSize: "12.5px", fontFamily: "Inter" }}>
            &copy; {new Date().getFullYear()} Chomske. All rights reserved.
          </Typography>
         
        </Box>
      </Container>

      {/* Big brand wordmark */}
      <Box sx={{ overflow: "hidden", lineHeight: 0, mt: 2, pb: 0 }}>
        <Typography sx={{
          fontSize: "clamp(3.5rem, 19vw, 20rem)",
          fontWeight: 900,
          letterSpacing: "-0.04em",
          lineHeight: 0.82,
          display: "block",
          textAlign: "center",
          fontFamily: "Inter, sans-serif",
          userSelect: "none",
          background: "linear-gradient(180deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.02) 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}>
          CHOMSKE
        </Typography>
      </Box>
    </Box>
  );
};

export default Footer;

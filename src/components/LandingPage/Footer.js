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
    { name: "Security", path: "/security" },
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
        <Grid container spacing={8}>

          {/* Brand column */}
          <Grid item xs={12} md={4}>
            <Box sx={{ mb: 3 }}>
              <Link to="/" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 }}>
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
                color: "#64748b",
                lineHeight: 1.65,
                maxWidth: "300px",
                fontSize: "14px",
                mt: 2,
              }}>
                Operational intelligence for SaaS founders.
                Know who needs you before they leave. Built for SaaS founders.
              </Typography>
            </Box>

            <Stack direction="row" spacing={1.5} sx={{ mt: 3 }}>
              {[
                {
                  href: "https://www.linkedin.com/company/myhandle-in/",
                  label: "LinkedIn",
                  Icon: LinkedInIcon,
                },
                {
                  href: "https://x.com/ibhaskarsriram",
                  label: "Twitter",
                  Icon: TwitterIcon,
                },
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
                    "&:hover": {
                      color: "#fff",
                      borderColor: "rgba(99,102,241,0.4)",
                      bgcolor: "rgba(99,102,241,0.08)",
                    },
                  }}
                >
                  <Icon fontSize="small" />
                </IconButton>
              ))}
            </Stack>
          </Grid>

          {/* Link columns */}
          {[
            { title: "Product", items: footerSections.product },
            { title: "Company", items: footerSections.company },
            { title: "Legal", items: footerSections.legal },
          ].map(({ title, items }) => (
            <Grid item xs={6} md={2.5} key={title}>
              <Typography sx={{
                fontWeight: 700, color: "#fff",
                mb: 3, fontSize: "14px", letterSpacing: "0.3px",
                fontFamily: "Inter",
              }}>
                {title}
              </Typography>
              <Stack spacing={1.5}>
                {items.map(link => (
                  <Link key={link.name} to={link.path} style={{ textDecoration: "none" }}>
                    <Typography variant="body2" sx={{
                      color: "#64748b",
                      fontSize: "13.5px",
                      fontFamily: "Inter",
                      transition: "all 0.18s ease",
                      display: "inline-block",
                      "&:hover": { color: "#A5B4FC", transform: "translateX(3px)" },
                    }}>
                      {link.name}
                    </Typography>
                  </Link>
                ))}
              </Stack>
            </Grid>
          ))}
        </Grid>

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
          <Typography variant="caption" sx={{
            color: "#334155", fontSize: "12.5px", fontFamily: "Inter",
            display: "flex", alignItems: "center", gap: 0.5,
          }}>
            Built for SaaS founders who want answers, not charts.
          </Typography>
        </Box>
      </Container>
    </Box>
  );
};

export default Footer;

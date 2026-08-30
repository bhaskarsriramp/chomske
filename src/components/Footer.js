import React from "react";
import {
  Box,
  Container,
  Grid,
  Typography,
  IconButton,
  Divider,
  Stack,
  Link as MuiLink,
} from "@mui/material";
import { Link } from "react-router-dom";
import LinkedInIcon from "@mui/icons-material/LinkedIn";
import TwitterIcon from "@mui/icons-material/Twitter";
import logo from "../images/myhandle_logo.svg"; // Ensure path is correct

// Organized Data Structure
const footerSections = {
  product: [
    { name: "Pricing", path: "/pricing" },
    { name: "Trust Center", path: "/trust-center" },
    { name: "Security", path: "/security" },
    { name: "Sitemap", path: "/sitemap.xml" },
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
        backgroundColor: "#020617", // Matches your Hero/Process sections
        color: "#fff",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        pt: { xs: 8, md: 10 },
        pb: 4,
        position: "relative",
        overflow: "hidden",
        fontFamily: "Inter, sans-serif",
      }}
    >
      {/* Top Border Glow Effect */}
      <Box
        sx={{
          position: "absolute",
          top: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "80%",
          height: "1px",
          background:
            "linear-gradient(90deg, transparent 0%, rgba(37, 211, 102, 0.4) 50%, transparent 100%)",
          opacity: 0.6,
        }}
      />

      <Container maxWidth="lg">
        <Grid container spacing={8}>
          {/* 1. Brand Identity Column */}
          <Grid item xs={12} md={4}>
            <Box sx={{ mb: 3 }}>
              {/* Logo Link */}
              <Link to="/" style={{ textDecoration: "none", display: 'inline-block' }}>
                 {/* NOTE: If you want the logo white, use filter. 
                    If using an SVG component, pass color props.
                 */}
                 <img 
                   src={logo} 
                   alt="MyHandle" 
                   style={{ 
                     height: "46px", 
                     marginBottom: "16px", 
                     filter: "brightness(0) invert(1)" // Forces white logo
                   }} 
                 />
              </Link>
              <Typography
                variant="body1"
                sx={{
                  color: "#94a3b8", // Slate-400
                  lineHeight: 1.6,
                  maxWidth: "320px",
                  fontSize: "15px",
                  mt: 1,
                }}
              >
                WhatsApp alerts for server downtime, failed payments, and critical events. Paste one webhook. Sleep soundly.
              </Typography>
            </Box>

            {/* Social Icons */}
            <Stack direction="row" spacing={1.5}>
              <IconButton
                href="https://www.linkedin.com/company/myhandle-in/"
                target="_blank"
                aria-label="LinkedIn"
                sx={{
                  color: "#94a3b8",
                  border: "1px solid rgba(255,255,255,0.1)",
                  transition: "all 0.2s",
                  "&:hover": { 
                    color: "#fff", 
                    borderColor: "#fff", 
                    bgcolor: "rgba(255,255,255,0.05)" 
                  },
                }}
              >
                <LinkedInIcon fontSize="small" />
              </IconButton>
              <IconButton
                href="https://x.com/ibhaskarsriram"
                target="_blank"
                aria-label="Twitter"
                sx={{
                  color: "#94a3b8",
                  border: "1px solid rgba(255,255,255,0.1)",
                  transition: "all 0.2s",
                  "&:hover": { 
                    color: "#fff", 
                    borderColor: "#fff", 
                    bgcolor: "rgba(255,255,255,0.05)" 
                  },
                }}
              >
                <TwitterIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Grid>

          {/* 2. Link Columns (Mapped dynamically) */}
          {[
            { title: "Product", items: footerSections.product },
            { title: "Company", items: footerSections.company },
            { title: "Legal", items: footerSections.legal }
          ].map((section) => (
            <Grid item xs={6} md={2.5} key={section.title}>
              <Typography
                variant="subtitle1"
                sx={{
                  fontWeight: 700,
                  color: "#fff",
                  mb: 3,
                  fontSize: "15px",
                  letterSpacing: "0.5px"
                }}
              >
                {section.title}
              </Typography>
              <Stack spacing={1.5}>
                {section.items.map((link) => (
                  <Link
                    key={link.name}
                    to={link.path}
                    style={{ textDecoration: "none" }}
                  >
                    <Typography
                      variant="body2"
                      sx={{
                        color: "#94a3b8",
                        fontSize: "14px",
                        transition: "all 0.2s ease",
                        display: "inline-block",
                        "&:hover": {
                          color: "#fff",
                          transform: "translateX(4px)", // Subtle slide effect
                        },
                      }}
                    >
                      {link.name}
                    </Typography>
                  </Link>
                ))}
              </Stack>
            </Grid>
          ))}
        </Grid>

        {/* 3. Bottom Bar */}
        <Divider
          sx={{
            borderColor: "rgba(255,255,255,0.08)",
            mt: 8,
            mb: 4,
          }}
        />

        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            justifyContent: "space-between",
            alignItems: "center",
            gap: 2,
          }}
        >
          <Typography
            variant="caption"
            sx={{ color: "#64748b", fontSize: "13px" }}
          >
            &copy; {new Date().getFullYear()} MyHandle.in. All rights reserved.
          </Typography>

          <Box sx={{ display: "flex", gap: 3 }}>
            <Typography
              variant="caption"
              sx={{ 
                color: "#64748b", 
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                gap: 0.5
              }}
            >
              Built for SaaS founders who hate being last to know.
            </Typography>
          </Box>
        </Box>
      </Container>

      {/* Large brand watermark */}
      <Box
        sx={{
          overflow: "hidden",
          mt: 2,
          lineHeight: 0.85,
          userSelect: "none",
          pointerEvents: "none",
        }}
      >
        <Typography
          sx={{
            fontFamily: "'Inter', sans-serif",
            fontWeight: 900,
            fontSize: "clamp(5rem, 18vw, 16rem)",
            letterSpacing: "-0.04em",
            color: "rgba(255,255,255,0.04)",
            textAlign: "center",
            whiteSpace: "nowrap",
            lineHeight: 0.9,
          }}
        >
          MyHandle
        </Typography>
      </Box>
    </Box>
  );
};

export default Footer;
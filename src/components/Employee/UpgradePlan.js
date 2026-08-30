import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Box,
  Card,
  Typography,
  TextField,
  Stack,
  Button,
  Chip,
  InputAdornment,
  Snackbar,
  Alert,
  useMediaQuery,
  Container,
  Fade,
  Divider,
  Dialog,
  Zoom,
  Grow,
} from "@mui/material";
import { alpha, useTheme, keyframes } from "@mui/material/styles";
import PersonIcon from "@mui/icons-material/PersonOutline";
import EmailIcon from "@mui/icons-material/EmailOutlined";
import PhoneIphoneIcon from "@mui/icons-material/PhoneIphone";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CircularProgress from "@mui/material/CircularProgress";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import RecentActorsIcon from '@mui/icons-material/RecentActors';
import ForwardToInboxIcon from '@mui/icons-material/ForwardToInbox';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import DownloadingIcon from '@mui/icons-material/Downloading';
import FileOpenIcon from '@mui/icons-material/FileOpen';

const RZP_KEY_ID = "rzp_live_SENsALYkMMXrhk";

const FEATURES = [
  { icon: <RecentActorsIcon />, title: "500 Leads per month." },
  { icon: <ForwardToInboxIcon />, title: "Unlimited DMs per month." },
  { icon: <WhatsAppIcon />, title: "Send leads to WhatsApp." },
  { icon: <BookmarkIcon />, title: "Ask to Follow" },
  { icon: <DownloadingIcon />, title: "Share PDFs, Excel Sheets, Photos." },
  { icon: <FileOpenIcon />, title: "More Features →", link: "https://chomske.com/pricing" },
];

export default function UpgradePlan() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const isSmall = useMediaQuery(theme.breakpoints.down("sm"));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(true);
  const [snack, setSnack] = useState({
    open: false,
    message: "",
    severity: "info",
  });
  const [showSuccess, setShowSuccess] = useState(false);

  const PLAN_ID = "plan_SEOAPFbKY9r128";
  const baseUrl = "/api/usersOn";


  useEffect(() => {
    const id = "razorpay-checkout";
    if (document.getElementById(id)) return;
    const s = document.createElement("script");
    s.id = id;
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onerror = () => {
      setSnack({
        open: true,
        severity: "error",
        message: "Failed to load payment gateway. Check connection.",
      });
    };
    document.body.appendChild(s);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await axios.get(`${baseUrl}/details-for-mandate`, {
          withCredentials: true,
        });
        if (!active) return;
        setName(data?.name || "");
        setEmail(data?.email || "");
        setPhone(data?.phone || "");
      } catch (err) {
        console.error("Prefill failed", err);
      } finally {
        if (active) setPrefillLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!showSuccess) return;
    const timer = setTimeout(() => {
      window.location.href = "/professional/profile";
    }, 4500);
    return () => clearTimeout(timer);
  }, [showSuccess]);

  const emailValid = useMemo(() => /\S+@\S+\.\S+/.test(email), [email]);
  const phoneValid = useMemo(
    () => /^\d{10}$/.test((phone || "").trim()),
    [phone]
  );
  const nameValid = useMemo(() => name.trim().length >= 2, [name]);
  const formValid = nameValid && emailValid && phoneValid;

  const createSubscription = async () => {
    if (!formValid) {
      setSnack({
        open: true,
        severity: "warning",
        message: "Please complete the form correctly.",
      });
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(
        baseUrl + "/create-subscription",
        { plan_id: PLAN_ID },
        { withCredentials: true }
      );

      const data = res.data;
      if (!data?.subscription_id)
        throw new Error(data?.error || "Failed to create subscription.");
      launchCheckout(data.subscription_id);
    } catch (e) {
      console.error(e);
      setSnack({
        open: true,
        severity: "error",
        message: e?.message || "Something went wrong.",
      });
    } finally {
      setLoading(false);
    }
  };

  const launchCheckout = (subscription_id) => {
    if (!window.Razorpay) {
      setSnack({
        open: true,
        severity: "error",
        message: "Payment gateway not ready.",
      });
      return;
    }

    const rzp = new window.Razorpay({
      key: RZP_KEY_ID,
      name: "MyHandle",
      description: "Premium Subscription",
      subscription_id,
      recurring: 1,
      method: { upi: true },
      prefill: { name, email, contact: phone },
      notes: { plan: "MyHandle Premium" },
      theme: { color: "#6366f1" },
      handler: async function (resp) {
        try {
          await axios.post(
            baseUrl + "/subscription/verify",
            {
              payment_id: resp.razorpay_payment_id,
              subscription_id: resp.razorpay_subscription_id,
              signature: resp.razorpay_signature,
            },
            { withCredentials: true }
          );
          setShowSuccess(true);
        } catch (err) {
          const msg =
            err?.response?.data?.error || "Payment verification failed.";
          setSnack({ open: true, severity: "error", message: msg });
        }
      },
    });

    rzp.open();
  };

  /* ── Keyframe animations ── */
  const pulseRing = keyframes`
    0% { transform: scale(0.8); opacity: 1; }
    100% { transform: scale(2.4); opacity: 0; }
  `;
  const checkPop = keyframes`
    0% { transform: scale(0); opacity: 0; }
    50% { transform: scale(1.2); }
    70% { transform: scale(0.95); }
    100% { transform: scale(1); opacity: 1; }
  `;
  const shimmer = keyframes`
    0% { background-position: -200% center; }
    100% { background-position: 200% center; }
  `;
  const floatUp = keyframes`
    0% { transform: translateY(0) scale(1); opacity: 1; }
    100% { transform: translateY(-120px) scale(0.5); opacity: 0; }
  `;
  const fadeSlideUp = keyframes`
    0% { transform: translateY(16px); opacity: 0; }
    100% { transform: translateY(0); opacity: 1; }
  `;
  const progressBar = keyframes`
    0% { width: 0%; }
    100% { width: 100%; }
  `;

  /* ── Accent colors ── */
  const accent = "#6366f1";
  const accentDark = "#4f46e5";
  const accentLight = alpha(accent, 0.08);
  const gradientBg = `linear-gradient(135deg, ${accent} 0%, #8b5cf6 50%, #a855f7 100%)`;

  /* ── Input styling ── */
  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "14px",
      backgroundColor: "#fff",
      fontFamily: "Inter, sans-serif",
      fontSize: isSmall ? "16px" : "0.95rem",
      transition: "all 0.2s ease",
      "& fieldset": {
        borderColor: "#e5e7eb",
        borderWidth: "1.5px",
      },
      "&:hover fieldset": {
        borderColor: alpha(accent, 0.4),
      },
      "&.Mui-focused fieldset": {
        borderColor: accent,
        borderWidth: "2px",
        boxShadow: `0 0 0 4px ${alpha(accent, 0.08)}`,
      },
    },
    "& .MuiInputLabel-root": {
      fontFamily: "Inter, sans-serif",
      color: "#9ca3af",
      "&.Mui-focused": { color: accent },
    },
  };

  /* ── Feature Item ── */
  const FeatureItem = ({ icon, title, link }) => {
    const content = (
    <Stack
  direction="row"
  spacing={1}
  alignItems="flex-start"
  sx={{
    alignItems: "center",
    cursor: link ? "pointer" : "default",
    textDecoration: "none",
    color: "inherit", // Ensures text doesn't turn default link blue
    "&:hover": link ? { opacity: 0.85 } : {},
    "& *": { textDecoration: "none" }, // Forces children (like Typography) to remove underline
  }}
  onClick={
    link ? () => window.open(link, "_blank", "noopener,noreferrer") : undefined
  }
>
        <Box
          sx={{
            width: 22,
            height: 22,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            "& .MuiSvgIcon-root": { fontSize: 20, color: "#fff" },
          }}
        >
          {icon}
        </Box>
        <Typography
          sx={{
            fontFamily: "Inter, sans-serif",
            fontWeight: 600,
            fontSize: "0.95rem",
            color: "#fff",
            lineHeight: 1.3,
            textDecoration: "none",
          }}
        >
          {title}
        </Typography>
      </Stack>
    );
    return content;
  };

  return (
    <Box
      sx={{
        minHeight: "99vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Decorative background orbs (desktop only) */}
      {!isMobile && (
        <>
          <Box
            sx={{
              position: "absolute",
              // top: "-15%",
              right: "-8%",
              width: 500,
              height: 500,
              borderRadius: "50%",
              background: alpha(accent, 0.06),
              filter: "blur(80px)",
              pointerEvents: "none",
            }}
          />
          <Box
            sx={{
              position: "absolute",
              bottom: "-10%",
              left: "-5%",
              width: 400,
              height: 400,
              borderRadius: "50%",
              background: alpha("#a855f7", 0.05),
              filter: "blur(60px)",
              pointerEvents: "none",
            }}
          />
        </>
      )}

      <Container
        maxWidth="lg"
        disableGutters={isMobile}
        sx={{ position: "relative", zIndex: 1, px: isMobile ? 0 : 3, py: isMobile ? 0 : 5 }}
      >
        <Fade in={!prefillLoading} timeout={600}>
          <Card
            elevation={0}
            sx={{
              borderRadius: isMobile ? 0 : "28px",
              overflow: "hidden",
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              minHeight: isMobile ? "100vh" : 580,
              maxWidth: 960,
              mx: "auto",
              border: isMobile ? "none" : "1px solid rgba(0,0,0,0.06)",
              boxShadow: isMobile
                ? "none"
                : "0 25px 60px -12px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.02)",
            }}
          >
            {/* ═══════════ LEFT PANEL — Value Proposition ═══════════ */}
            <Box
              sx={{
                flex: isMobile ? "none" : "1 1 48%",
                background: gradientBg,
                px: isSmall ? 3 : 5,
                py: isSmall ? 4 : 5,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Subtle pattern overlay */}
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  opacity: 0.05,
                  backgroundImage:
                    "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
                  backgroundSize: "24px 24px",
                  pointerEvents: "none",
                }}
              />

              <Box sx={{ position: "relative", zIndex: 1 }}>
                {/* Badge */}
                <Chip
                  icon={<AutoAwesomeIcon sx={{ fontSize: 15, color: "#fbbf24 !important" }} />}
                  label="Creator Plan"
                  size="small"
                  sx={{
                    bgcolor: "rgba(255,255,255,0.15)",
                    color: "#fff",
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 700,
                    fontSize: "0.7rem",
                    letterSpacing: "0.08em",
                    borderRadius: "8px",
                    height: 28,
                    mb: 3,
                    backdropFilter: "blur(4px)",
                  }}
                />

                {/* Headline */}
                <Typography
                  sx={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 800,
                    fontSize: isSmall ? "1.6rem" : "2rem",
                    color: "#fff",
                    lineHeight: 1.2,
                    letterSpacing: "0.02em",
                    mb: 1,
                  }}
                >
                  Ready for 100x More Leads?
                </Typography>
                <Typography
                  sx={{
                    fontFamily: "Inter, sans-serif",
                    fontSize: "0.95rem",
                    color: "rgba(255,255,255,0.7)",
                    lineHeight: 1.6,
                    mb: 2,
                    maxWidth: 340,
                  }}
                >
                  Now scale up to 500 leads per month and maximize your revenue potential.
                </Typography>

                {/* Price */}
                <Box sx={{ mb: 4 }}>
                  <Stack direction="row" alignItems="baseline" spacing={0.5}>
                    <Typography
                      sx={{
                        fontFamily: "Inter, sans-serif",
                        fontWeight: 800,
                        fontSize: isSmall ? "2.2rem" : "2.8rem",
                        color: "#fff",
                        lineHeight: 1,
                      }}
                    >
                      $29
                    </Typography>
                    <Typography
                      sx={{
                        fontFamily: "Inter, sans-serif",
                        fontSize: "1rem",
                        color: "rgba(255,255,255,0.6)",
                        fontWeight: 500,
                      }}
                    >
                      / month
                    </Typography>
                  </Stack>
                  <Chip
                    label="Approx. ₹ 2650/-"
                    size="small"
                    sx={{
                      mt: 1,
                      height: 24,
                      bgcolor: "rgba(255,255,255,0.12)",
                      color: "rgba(255,255,255,0.85)",
                      fontFamily: "Inter, sans-serif",
                      fontWeight: 600,
                      fontSize: "0.7rem",
                      borderRadius: "6px",
                    }}
                  />
                </Box>

                {/* Features grid */}
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "1fr",
                    gap: isMobile ? 2 : 2.5,
                  }}
                >
                  {FEATURES.map((f) => (
                    <FeatureItem key={f.title} {...f} />
                  ))}
                </Box>
              </Box>
            </Box>

            {/* ═══════════ RIGHT PANEL — Checkout Form ═══════════ */}
            <Box
              sx={{
                flex: isMobile ? "none" : "1 1 52%",
                bgcolor: "#fff",
                px: isSmall ? 3 : 5,
                py: isSmall ? 4 : 5,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              {/* Section header */}
              <Box sx={{ mb: 4 }}>
                <Typography
                  sx={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 700,
                    fontSize: isSmall ? "1.35rem" : "1.5rem",
                    color: "#1f2937",
                    letterSpacing: "-0.01em",
                    mb: 0.5,
                  }}
                >
                  Proceed to upgrade
                </Typography>
                <Typography
                  sx={{
                    fontFamily: "Inter, sans-serif",
                    fontSize: "0.9rem",
                    color: "#9ca3af",
                    lineHeight: 1.5,
                  }}
                >
                  Enter your details to activate premium features instantly.
                </Typography>
              </Box>

              {/* Form */}
              <Stack spacing={2.5}>
                <TextField
                  label="Full Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  fullWidth
                  sx={inputSx}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <PersonIcon sx={{ color: "#9ca3af", fontSize: 20 }} />
                      </InputAdornment>
                    ),
                    endAdornment: nameValid && (
                      <InputAdornment position="end">
                        <CheckCircleIcon sx={{ color: "#22c55e", fontSize: 18 }} />
                      </InputAdornment>
                    ),
                  }}
                />

                <TextField
                  label="Email Address"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  fullWidth
                  sx={inputSx}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <EmailIcon sx={{ color: "#9ca3af", fontSize: 20 }} />
                      </InputAdornment>
                    ),
                    endAdornment: emailValid && (
                      <InputAdornment position="end">
                        <CheckCircleIcon sx={{ color: "#22c55e", fontSize: 18 }} />
                      </InputAdornment>
                    ),
                  }}
                />

                <TextField
                  label="Mobile Number"
                  value={phone}
                  onChange={(e) =>
                    setPhone(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))
                  }
                  fullWidth
                  sx={inputSx}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <PhoneIphoneIcon sx={{ color: "#9ca3af", fontSize: 20 }} />
                      </InputAdornment>
                    ),
                    endAdornment: phoneValid && (
                      <InputAdornment position="end">
                        <CheckCircleIcon sx={{ color: "#22c55e", fontSize: 18 }} />
                      </InputAdornment>
                    ),
                  }}
                />
              </Stack>

              {/* CTA Button */}
              <Button
                variant="contained"
                size="large"
                onClick={createSubscription}
                disabled={loading || !formValid || prefillLoading}
                disableElevation
                fullWidth
                endIcon={
                  !loading && (
                    <ArrowForwardIcon sx={{ fontSize: 20, ml: 0.5 }} />
                  )
                }
                sx={{
                  mt: 4,
                  py: 1.8,
                  borderRadius: "14px",
                  textTransform: "none",
                  fontFamily: "Inter, sans-serif",
                  fontSize: "1.05rem",
                  fontWeight: 700,
                  color: "#fff",
                  background: gradientBg,
                  boxShadow: `0 8px 24px -4px ${alpha(accent, 0.45)}`,
                  transition: "all 0.25s ease",
                  "&:hover": {
                    background: gradientBg,
                    boxShadow: `0 12px 32px -4px ${alpha(accent, 0.55)}`,
                    transform: "translateY(-1px)",
                  },
                  "&:active": {
                    transform: "translateY(0)",
                  },
                  "&.Mui-disabled": {
                    background: "#e5e7eb",
                    color: "#9ca3af",
                    boxShadow: "none",
                  },
                }}
              >
                {loading ? (
                  <CircularProgress size={24} color="inherit" />
                ) : (
                  "Activate Premium"
                )}
              </Button>

              {/* Trust signals */}
              <Divider sx={{ my: 3, borderColor: "#f3f4f6" }} />

              <Stack
                direction="row"
                justifyContent="center"
                spacing={isSmall ? 1.5 : 3}
                flexWrap="wrap"
                useFlexGap
              >
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <LockOutlinedIcon sx={{ fontSize: 15, color: "#9ca3af" }} />
                  <Typography
                    sx={{
                      fontFamily: "Inter, sans-serif",
                      fontSize: "0.75rem",
                      color: "#9ca3af",
                      fontWeight: 500,
                    }}
                  >
                    256-bit SSL
                  </Typography>
                </Stack>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <VerifiedUserOutlinedIcon
                    sx={{ fontSize: 15, color: "#9ca3af" }}
                  />
                  <Typography
                    sx={{
                      fontFamily: "Inter, sans-serif",
                      fontSize: "0.75rem",
                      color: "#9ca3af",
                      fontWeight: 500,
                    }}
                  >
                    Razorpay Secured
                  </Typography>
                </Stack>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <CheckCircleIcon sx={{ fontSize: 15, color: "#9ca3af" }} />
                  <Typography
                    sx={{
                      fontFamily: "Inter, sans-serif",
                      fontSize: "0.75rem",
                      color: "#9ca3af",
                      fontWeight: 500,
                    }}
                  >
                    Instant Activation
                  </Typography>
                </Stack>
              </Stack>
            </Box>
          </Card>
        </Fade>
      </Container>

      {/* ═══════════ Success Overlay ═══════════ */}
      <Dialog
        open={showSuccess}
        fullScreen
        TransitionComponent={Fade}
        TransitionProps={{ timeout: 600 }}
        PaperProps={{
          sx: {
            background: `linear-gradient(135deg, #6366f1 0%, #8b5cf6 40%, #a855f7 100%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            position: "relative",
          },
        }}
      >
        {/* Subtle dot pattern */}
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            opacity: 0.06,
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "28px 28px",
            pointerEvents: "none",
          }}
        />

        {/* Floating particles */}
        {[...Array(8)].map((_, i) => (
          <Box
            key={i}
            sx={{
              position: "absolute",
              bottom: "30%",
              left: `${12 + i * 11}%`,
              width: 8 + (i % 3) * 4,
              height: 8 + (i % 3) * 4,
              borderRadius: "50%",
              bgcolor: `rgba(255,255,255,${0.15 + (i % 3) * 0.1})`,
              animation: `${floatUp} ${2 + (i % 3) * 0.8}s ease-out ${0.3 + i * 0.15}s forwards`,
              opacity: 0,
              animationFillMode: "backwards",
            }}
          />
        ))}

        <Stack alignItems="center" spacing={1} sx={{ position: "relative", zIndex: 1, px: 3 }}>
          {/* Pulse ring behind check */}
          <Box sx={{ position: "relative", mb: 2 }}>
            <Box
              sx={{
                position: "absolute",
                inset: -16,
                borderRadius: "50%",
                border: "3px solid rgba(255,255,255,0.25)",
                animation: `${pulseRing} 1.8s ease-out 0.4s infinite`,
              }}
            />
            <Box
              sx={{
                position: "absolute",
                inset: -8,
                borderRadius: "50%",
                border: "2px solid rgba(255,255,255,0.15)",
                animation: `${pulseRing} 1.8s ease-out 0.7s infinite`,
              }}
            />
            {/* Check circle */}
            <Zoom in={showSuccess} timeout={500} style={{ transitionDelay: "200ms" }}>
              <Box
                sx={{
                  width: 88,
                  height: 88,
                  borderRadius: "50%",
                  bgcolor: "rgba(255,255,255,0.18)",
                  backdropFilter: "blur(8px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  animation: `${checkPop} 0.6s ease-out 0.3s both`,
                }}
              >
                <CheckCircleIcon sx={{ fontSize: 52, color: "#fff" }} />
              </Box>
            </Zoom>
          </Box>

          {/* Title */}
          <Grow in={showSuccess} timeout={600} style={{ transitionDelay: "500ms" }}>
            <Typography
              sx={{
                fontFamily: "Inter, sans-serif",
                fontWeight: 800,
                fontSize: isSmall ? "1.6rem" : "2rem",
                color: "#fff",
                textAlign: "center",
                letterSpacing: "-0.01em",
                animation: `${fadeSlideUp} 0.6s ease-out 0.5s both`,
              }}
            >
              Creator Plan Activated!
            </Typography>
          </Grow>

          {/* Subtitle with shimmer */}
          <Grow in={showSuccess} timeout={600} style={{ transitionDelay: "800ms" }}>
            <Typography
              sx={{
                fontFamily: "Inter, sans-serif",
                fontWeight: 500,
                fontSize: isSmall ? "0.95rem" : "1.1rem",
                textAlign: "center",
                maxWidth: 340,
                lineHeight: 1.5,
                background: "linear-gradient(90deg, rgba(255,255,255,0.7) 0%, #fff 50%, rgba(255,255,255,0.7) 100%)",
                backgroundSize: "200% auto",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                animation: `${fadeSlideUp} 0.6s ease-out 0.8s both, ${shimmer} 3s linear 1.5s infinite`,
              }}
            >
              Welcome to the Creator tier. Your premium features are now live.
            </Typography>
          </Grow>

          {/* Sparkle chip */}
          <Grow in={showSuccess} timeout={500} style={{ transitionDelay: "1100ms" }}>
            <Chip
              icon={<AutoAwesomeIcon sx={{ fontSize: 16, color: "#fbbf24 !important" }} />}
              label="All features unlocked"
              sx={{
                mt: 2,
                bgcolor: "rgba(255,255,255,0.15)",
                color: "#fff",
                fontFamily: "Inter, sans-serif",
                fontWeight: 600,
                fontSize: "0.8rem",
                borderRadius: "10px",
                height: 32,
                backdropFilter: "blur(4px)",
                animation: `${fadeSlideUp} 0.5s ease-out 1.1s both`,
              }}
            />
          </Grow>

          {/* Progress bar — visual cue for redirect */}
          <Grow in={showSuccess} timeout={400} style={{ transitionDelay: "1300ms" }}>
            <Box sx={{ mt: 4, width: 180 }}>
              <Typography
                sx={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: "0.7rem",
                  color: "rgba(255,255,255,0.5)",
                  textAlign: "center",
                  mb: 0.8,
                  fontWeight: 500,
                  letterSpacing: "0.04em",
                }}
              >
                Redirecting to dashboard...
              </Typography>
              <Box
                sx={{
                  height: 3,
                  borderRadius: 2,
                  bgcolor: "rgba(255,255,255,0.15)",
                  overflow: "hidden",
                }}
              >
                <Box
                  sx={{
                    height: "100%",
                    borderRadius: 2,
                    bgcolor: "#fff",
                    animation: `${progressBar} 4.5s linear forwards`,
                  }}
                />
              </Box>
            </Box>
          </Grow>
        </Stack>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={snack.severity}
          variant="filled"
          sx={{
            borderRadius: "12px",
            fontFamily: "Inter, sans-serif",
            fontWeight: 600,
          }}
        >
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

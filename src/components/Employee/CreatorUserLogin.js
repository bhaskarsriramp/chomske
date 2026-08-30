import { useState, useEffect } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Paper,
  Stack,
  Button,
  Divider,
  Link as MLink,
  CircularProgress,
  keyframes,
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { login } from "../../store/professionalSlice";
import { useDispatch } from "react-redux";
import { toast } from "react-toastify";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useGoogleLogin } from "@react-oauth/google";
import GmailIcon from "../../images/google.png";
import wallBack from "../../images/4159942_89781.jpg";
import logo from "../../images/myhandle_logo.svg";
import { Helmet } from "react-helmet";
import Navbar from "../Navbar";


/* ── keyframe animations ── */
const fadeInUp = keyframes`
  0%   { opacity: 0; transform: translateY(30px) scale(0.96); }
  100% { opacity: 1; transform: translateY(0)    scale(1);    }
`;
const popIn = keyframes`
  0%   { opacity: 0; transform: scale(0.3); }
  60%  { opacity: 1; transform: scale(1.15); }
  100% { transform: scale(1); }
`;
const shimmer = keyframes`
  0%   { background-position: -200% center; }
  100% { background-position: 200% center; }
`;
const pulseGlow = keyframes`
  0%, 100% { box-shadow: 0 0 20px rgba(102,126,234,0.3); }
  50%      { box-shadow: 0 0 40px rgba(102,126,234,0.6); }
`;
const confettiBurst = keyframes`
  0%   { opacity: 1; transform: translateY(0) rotate(0deg); }
  100% { opacity: 0; transform: translateY(-60px) rotate(360deg); }
`;


/**
 * Influencer-focused auth screen
 * - Polished hero on the left (desktop) + glass card on the right
 * - Single prominent Google button
 * - Preserves your original login flow and redirects
 */
export default function CreatorUserLogin() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [isLoading, setIsLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const baseUrl = "/api/usersOn";
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down("md"));

  // Lock body scroll while mounted (fullscreen background)
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Verify existing session and redirect if valid
  useEffect(() => {
    const verifyToken = async () => {
      try {
        const res = await axios.get(`${baseUrl}/verify-login-token`, { withCredentials: true });
        if (res.data?.valid === true) {
  navigate("/professional/dashboard/instagram", { replace: true });
}

      } catch (error) {
        // ignore -> show login
      }
    };
    verifyToken();
  }, []);

  const handleLoginSuccess = async (email_gm, firstName, lastName, picture) => {
    setIsLoading(true);
    try {
      const res = await axios.post(
        baseUrl + "/user-login-gmail",
        { email: email_gm, firstName, lastName, picture },
        { withCredentials: true }
      );

      const data = res?.data || {};
    if (data.success) {
  dispatch(login({
    user_email: data.user.user_email,
    user_id: data.user.user_id,
  }));

  if (data.wasNew) {
    setShowWelcome(true);
  } else {
    navigate("/professional/dashboard/instagram", { replace: true });
  }
}
      
      else {
        toast.error("Something went wrong. Please login again.");
        setTimeout(() => navigate("/professional/login"), 1200);
      }
    } catch (err) {
      if (err?.response?.status === 429) {
        toast.error("Too many login attempts. Please wait a moment and try again.");
      } else {
        toast.error("Something went wrong. Please try again.");
        setTimeout(() => navigate("/professional/login"), 1200);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGoogle = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const accessToken = tokenResponse?.access_token;
        if (!accessToken) {
          toast.error("Google sign-in did not return an access token. Please try again.");
          return;
        }
        const profileRes = await axios.get("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` },
          withCredentials: false,
          timeout: 8000
        });
        const { email: gmEmail, given_name, family_name, picture } = profileRes.data || {};
        handleLoginSuccess(gmEmail, given_name, family_name, picture);
      } catch (err) {
        toast.error("Google sign-in failed. Please try again.");
      }
    },
    onError: () => {
      toast.error("Google sign-in failed. Please try again.");
    }
  });

  const GoogleButton = (
    <Button
      onClick={() => loginWithGoogle()}
      fullWidth
      disabled={isLoading}
      sx={{
        textTransform: "none",
        borderRadius: 2,
        py: 1.5,
        gap: 1.5,
        fontWeight: 600,
        fontSize: 16,
        background: "#246be9",
        color: "#fff",
        "&:hover": { background: "#1c54b3" },
        boxShadow: "0 8px 20px rgba(36,107,233,0.35)"
      }}
    >
      <Box component="img" src={GmailIcon} alt="Google" sx={{ width: 24, height: 24, bgcolor: "#fff", p: 0.5, borderRadius: 1 }} />
     <Typography sx={{ fontFamily : 'Inter', fontSize : isSmallScreen ? '15px' : '18px'}}>
      {isLoading ? "Signing you in…" : "Sign Up with Google"}

     </Typography>
      {isLoading && <CircularProgress size={18} sx={{ ml: 1 }} />}
    </Button>
  );

  return (

    <>
     <Helmet>
            <title>Log in to MyHandle</title>
            <meta name="description" content="Login and find why you're missing clients." />
          </Helmet>
    
          
          <Navbar />
    <Box
      sx={{
        position: "fixed",
        inset: 0,
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "1.1fr 0.9fr" },
        minHeight: "100dvh",
        backgroundImage: `linear-gradient( to bottom right, #F4F4F4, #468A9A ), url(${wallBack})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* Left hero (hidden on small) */}
      <Box
        sx={{
          display: { xs: "none", md: "flex" },
          alignItems: "center",
          px: 8,
          color: "#fff",
        }}
      >
        <Box maxWidth={560}>
        
      
          <img
            src={logo}
            alt="MyHandle Logo"
            width="140"
            height="60"
            loading="eager"
            decoding="async"
            style={{ display: "block" }}
          />

          <Typography variant="h3" sx={{ fontWeight: 700, lineHeight: 1.1, mb: 2, fontFamily : 'Inter', color: '#450693' }}>
            Slack buried it. Email missed it. WhatsApp didn't.
          </Typography>
          <Typography variant="h6" sx={{ opacity: 0.9, fontWeight: 400, mb: 4, fontFamily : 'Inter', color: '#44444E' }}>
            Paste one webhook. Get pinged on WhatsApp the moment your server crashes, a payment fails, or a customer churns. No API setup. No noise.
          </Typography>

          <Stack direction="row" spacing={3} sx={{ opacity: 0.9 }}>
            <Stack>
              <Typography variant="h4" fontWeight={800}>5 min</Typography>
              <Typography variant="body2">Setup Time</Typography>
            </Stack>
            <Divider orientation="vertical" flexItem sx={{ borderColor: "rgba(255,255,255,0.2)" }} />
            <Stack>
              <Typography variant="h4" fontWeight={800}>4.9★</Typography>
              <Typography variant="body2">Satisfaction</Typography>
            </Stack>
          </Stack>
        </Box>
      </Box>

      {/* Right auth card */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", p: { xs: 2.5, md: 6 }, height : '100vh' }}>
        <Paper
          elevation={0}
          sx={{
            width: "100%",
            maxWidth: 420,
            borderRadius: 4,
            px: { xs: 4, md: 6 },
            py: { xs: 4, md: 6 },
            bgcolor: "rgba(255,255,255,0.9)",
            backdropFilter: "blur(8px)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
            display : 'flex',
            justifyContent : 'center'
          }}
        >
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 700, letterSpacing: 1.6, fontFamily : 'Inter', fontSize : isSmallScreen ? '10px' : '16px' }}>
                Fitness — Creators
              </Typography>
              <Typography variant="h4" sx={{fontFamily : 'Inter', fontSize : isSmallScreen ? '22px' : '36px', fontWeight: 700, mt: 0.5, mb: 3 }}>
                Sign in or create your account
              </Typography>
            
            </Box>

            {GoogleButton}

            <Divider>or</Divider>

            <Button
              onClick={() => loginWithGoogle()}
              fullWidth
              disabled={isLoading}
              sx={{
                textTransform: "none",
                borderRadius: 2,
                py: 1.5,
                gap: 1.5,
                fontWeight: 600,
                fontSize: 16,
                background: "#44444E",
                color: "#fff",
                "&:hover": { background: "#44444E" },
                boxShadow: "0 8px 20px rgba(36,107,233,0.35)"
              }}
            >
              <Box component="img" src={GmailIcon} alt="Google" sx={{ width: 24, height: 24, bgcolor: "#fff", p: 0.5, borderRadius: 1 }} />
              <Typography sx={{ fontFamily: 'Inter', fontSize: isSmallScreen ? '15px' : '18px' }}>
                {isLoading ? "Signing you in…" : "Login with Google"}
              </Typography>
              {isLoading && <CircularProgress size={18} sx={{ ml: 1 }} />}
            </Button>

            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1 }}>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                By continuing you agree to our {" "}
                <MLink href="https://chomske.com/terms" underline="hover">Terms</MLink> & {" "}
                <MLink href="https://chomske.com/privacy-policy" underline="hover">Privacy Policy</MLink>.
              </Typography>
            </Stack>
          </Stack>
        </Paper>
      </Box>

      <ToastContainer autoClose={2000} />

      {/* ===== WELCOME OVERLAY (first-time users) ===== */}
      {showWelcome && (
        <Box
          sx={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(12px)",
            animation: `${fadeInUp} 0.4s ease-out`,
            p: 2,
          }}
        >
          <Paper
            elevation={0}
            sx={{
              position: "relative",
              overflow: "hidden",
              width: "100%",
              maxWidth: { xs: 360, sm: 420 },
              borderRadius: "20px",
              background: "linear-gradient(145deg, #FFFFFF 0%, #F8F9FF 100%)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.25)",
              animation: `${fadeInUp} 0.6s ease-out, ${pulseGlow} 2.5s ease-in-out infinite 0.8s`,
              px: { xs: 3, sm: 4 },
              py: { xs: 3.5, sm: 4.5 },
              textAlign: "center",
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {/* Decorative confetti dots */}
            {["#667EEA", "#764BA2", "#F97316", "#10B981", "#F43F5E", "#3B82F6"].map(
              (c, i) => (
                <Box
                  key={i}
                  sx={{
                    position: "absolute",
                    width: { xs: 6, sm: 8 },
                    height: { xs: 6, sm: 8 },
                    borderRadius: "50%",
                    backgroundColor: c,
                    top: `${10 + i * 8}%`,
                    left: i % 2 === 0 ? `${8 + i * 6}%` : "auto",
                    right: i % 2 !== 0 ? `${5 + i * 5}%` : "auto",
                    animation: `${confettiBurst} ${1.2 + i * 0.2}s ease-out ${0.3 + i * 0.1}s forwards`,
                    opacity: 0,
                  }}
                />
              )
            )}

            {/* Sparkle icon */}
            <Box
              sx={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: { xs: 56, sm: 64 },
                height: { xs: 56, sm: 64 },
                borderRadius: "50%",
                background: "linear-gradient(135deg, #667EEA, #764BA2)",
                mb: 2,
                animation: `${popIn} 0.6s ease-out 0.2s both`,
              }}
            >
              <AutoAwesomeIcon sx={{ color: "#FFF", fontSize: { xs: 28, sm: 32 } }} />
            </Box>

            {/* Heading */}
            <Typography
              sx={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 800,
                fontSize: { xs: "1.3rem", sm: "1.6rem" },
                background: "linear-gradient(135deg, #667EEA 0%, #764BA2 100%)",
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                mb: 0.5,
                animation: `${fadeInUp} 0.5s ease-out 0.3s both`,
              }}
            >
              You're All Set!
            </Typography>

            {/* Shimmer subtitle */}
            <Typography
              sx={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 600,
                fontSize: { xs: "0.8rem", sm: "0.9rem" },
                background: "linear-gradient(90deg, #667EEA 0%, #C084FC 25%, #667EEA 50%, #C084FC 75%, #667EEA 100%)",
                backgroundSize: "200% auto",
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                animation: `${shimmer} 3s linear infinite, ${fadeInUp} 0.5s ease-out 0.4s both`,
                mb: 2.5,
              }}
            >
              Free Plan Activated
            </Typography>

            {/* Benefits card */}
            <Box
              sx={{
                background: "linear-gradient(135deg, #F0EDFF 0%, #E8F4FD 100%)",
                borderRadius: "14px",
                p: { xs: 2, sm: 2.5 },
                mb: 2.5,
                animation: `${fadeInUp} 0.5s ease-out 0.5s both`,
              }}
            >
              <Typography
                sx={{
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 700,
                  fontSize: { xs: "0.68rem", sm: "0.75rem" },
                  color: "#6B7280",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  mb: 1.5,
                }}
              >
                What you get
              </Typography>

              {/* Benefit rows */}
              {[
                { label: "WhatsApp Lead Alerts", value: "5", delay: "0.6s" },
                { label: "Auto DMs / month", value: "1,000", delay: "0.7s" },
              ].map((item) => (
                <Box
                  key={item.label}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.25,
                    mb: 1,
                    animation: `${fadeInUp} 0.45s ease-out ${item.delay} both`,
                  }}
                >
                  <CheckCircleOutlineIcon
                    sx={{ color: "#667EEA", fontSize: { xs: 18, sm: 20 } }}
                  />
                  <Typography
                    sx={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 400,
                      fontSize: { xs: "0.78rem", sm: "0.85rem" },
                      color: "#374151",
                      flex: 1,
                      textAlign: "left",
                    }}
                  >
                    {item.label}
                  </Typography>
                  <Typography
                    sx={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 800,
                      fontSize: { xs: "0.9rem", sm: "1rem" },
                      color: "#667EEA",
                    }}
                  >
                    {item.value}
                  </Typography>
                </Box>
              ))}
            </Box>

            {/* Upgrade hint */}
            <Typography
              sx={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 400,
                fontSize: { xs: "0.7rem", sm: "0.76rem" },
                color: "#9CA3AF",
                mb: 2.5,
                lineHeight: 1.5,
                animation: `${fadeInUp} 0.5s ease-out 0.8s both`,
              }}
            >
              Need more leads? You can upgrade anytime.
              <br />
              For now, just explore the platform!
            </Typography>

            {/* CTA button */}
            <Button
              fullWidth
              onClick={() => navigate("/professional/dashboard/instagram", { replace: true })}
              sx={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 700,
                fontSize: { xs: "0.85rem", sm: "0.95rem" },
                textTransform: "none",
                borderRadius: "12px",
                py: { xs: 1.2, sm: 1.4 },
                background: "linear-gradient(135deg, #667EEA 0%, #764BA2 100%)",
                color: "#FFFFFF",
                boxShadow: "0 8px 24px rgba(102,126,234,0.35)",
                animation: `${fadeInUp} 0.5s ease-out 0.9s both`,
                transition: "transform 0.2s, box-shadow 0.2s",
                "&:hover": {
                  background: "linear-gradient(135deg, #5A72D4 0%, #6A3F96 100%)",
                  transform: "translateY(-2px)",
                  boxShadow: "0 12px 32px rgba(102,126,234,0.45)",
                },
              }}
            >
              Explore Now
            </Button>
          </Paper>
        </Box>
      )}
    </Box>
    </>
  );
}

// UpiMandate.modern.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Box,
  Card,
  CardContent,
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
  Avatar,
  Paper,
  Divider,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import PersonIcon from "@mui/icons-material/PersonOutline";
import EmailIcon from "@mui/icons-material/EmailOutlined";
import PhoneIphoneIcon from "@mui/icons-material/PhoneIphone";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CircularProgress from "@mui/material/CircularProgress";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import WorkspacePremiumIcon from "@mui/icons-material/WorkspacePremium";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch"; // Visual flair

import { useDispatch } from "react-redux";
import { logout } from "../../store/professionalSlice";

const RZP_KEY_ID = "rzp_live_RbZ0rhbWlR25Cl";

export default function UpgradePlan() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const dispatch = useDispatch();

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

  const PLAN_ID = "plan_RiFtJIer0s57AN";
  const baseUrl = "/api/usersOn";

  const handleLogout = async () => {
    try {
      await axios.post(baseUrl + "/logout", {}, { withCredentials: true });
      dispatch(logout());
      window.location.href = "/professional/login";
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

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
          window.location.href = "/professional/dashboard/analytics";
        } catch (err) {
          const msg =
            err?.response?.data?.error || "Payment verification failed.";
          setSnack({ open: true, severity: "error", message: msg });
        }
      },
    });

    rzp.open();
  };

  // Custom Input Style
  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "12px",
      backgroundColor: "#fff",
      "& fieldset": { borderColor: alpha(theme.palette.grey[300], 0.8) },
      "&:hover fieldset": { borderColor: theme.palette.primary.main },
      "&.Mui-focused fieldset": {
        borderColor: theme.palette.primary.main,
        boxShadow: `0 0 0 4px ${alpha(theme.palette.primary.main, 0.1)}`,
      },
    },
    "& .MuiInputLabel-root": { color: theme.palette.text.secondary },
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
        py: 4,
      }}
    >
      <Container maxWidth="xs" disableGutters>
        <Fade in={!prefillLoading} timeout={500}>
          <Stack spacing={3}>
            
            {/* Main Card */}
            <Card
              elevation={0}
              sx={{
                borderRadius: "24px",
                backdropFilter: "blur(20px)",
                backgroundColor: "rgba(255, 255, 255, 0.8)",
                border: "1px solid rgba(255, 255, 255, 0.9)",
                boxShadow: "0 20px 40px -10px rgba(0,0,0,0.1)",
                overflow: "visible", // For badges that might pop out
              }}
            >
              {/* Top Banner/Header */}
              <Box
                sx={{
                  background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                  pt: 4,
                  pb: 6,
                  px: 3,
                  borderTopLeftRadius: "24px",
                  borderTopRightRadius: "24px",
                  color: "white",
                  textAlign: "center",
                  position: "relative",
                  mb: -3 // Overlap effect
                }}
              >
                {/* <Avatar
                  sx={{
                    bgcolor: "rgba(255,255,255,0.2)",
                    width: 56,
                    height: 56,
                    mx: "auto",
                    mb: 2,
                  }}
                >
                  <RocketLaunchIcon sx={{ color: "#fff", fontSize: 28 }} />
                </Avatar> */}
                <Typography variant="h5" fontWeight={700} gutterBottom sx={{ mb: '10%'}}>
                  Right Choice to Upgrade
                </Typography>
               
              </Box>

              <CardContent sx={{ px: 3, pb: 4, pt: 0 }}>
                
                {/* Pricing Pill - Floating overlap */}
                <Paper
                  elevation={3}
                  sx={{
                    mx: "auto",
                    maxWidth: 240,
                    p: 2,
                    borderRadius: "16px",
                    textAlign: "center",
                    bgcolor: "white",
                    position: "relative",
                    top: -24, // Pull up to overlap header
                    mb: 0,
                  }}
                >
                  {/* <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase">
                    Premium Plan
                  </Typography> */}
                  <Stack direction="row" alignItems="baseline" justifyContent="center" spacing={0.5}>
                    <Typography sx={{ fontFamily : "Inter", fontSize : isMobile ? '22px' : '26px', fontWeight : 600}}>
                      ₹399
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ fontFamily : "Inter"}}>
                      / month
                    </Typography>
                  </Stack>
                  <Chip 
                    label="Cancel Anytime" 
                    size="small" 
                    color="success" 
                    variant="soft" // If using MUI Joy, otherwise keep default styling below
                    sx={{ mt: 1, bgcolor: alpha(theme.palette.success.main, 0.1), color: "success.main", fontWeight: 600, fontSize: '0.7rem' }} 
                  />
                </Paper>

                {/* Form Fields */}
                <Stack spacing={2.5} sx={{ mt: 1 }}>
                  <TextField
                    label="Full Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    fullWidth
                    sx={inputSx}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <PersonIcon color="action" />
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
                          <EmailIcon color="action" />
                        </InputAdornment>
                      ),
                    }}
                  />

                  <TextField
                    label="Mobile Number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
                    fullWidth
                    sx={inputSx}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <PhoneIphoneIcon color="action" />
                        </InputAdornment>
                      ),
                      endAdornment: phoneValid && (
                        <InputAdornment position="end">
                          <CheckCircleIcon color="success" fontSize="small" />
                        </InputAdornment>
                      )
                    }}
                  />
                </Stack>

                {/* Main Action */}
                <Button
                  variant="contained"
                  size="large"
                  onClick={createSubscription}
                  disabled={loading || !formValid || prefillLoading}
                  fullWidth
                  sx={{
                    mt: 4,
                    py: 1.8,
                    borderRadius: "14px",
                    textTransform: "none",
                    fontSize: "1.1rem",
                    fontWeight: 700,
                    boxShadow: "0 10px 20px -5px rgba(99, 102, 241, 0.4)", // Custom shadow
                    background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                    "&:hover": {
                      boxShadow: "0 15px 25px -5px rgba(99, 102, 241, 0.5)",
                    }
                  }}
                >
                  {loading ? (
                    <CircularProgress size={24} color="inherit" />
                  ) : (
                    "Activate Subscription"
                  )}
                </Button>

                {/* Trust Footer */}
                <Stack 
                    direction="row" 
                    justifyContent="center" 
                    spacing={2} 
                    sx={{ mt: 3, opacity: 0.7 }}
                >
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                        <VerifiedUserOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                        <Typography variant="caption" color="text.secondary">Razorpay Secured</Typography>
                    </Stack>
                    <Divider orientation="vertical" flexItem sx={{ height: 12, my: 'auto' }} />
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                        <LockOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                        <Typography variant="caption" color="text.secondary">SSL Encrypted</Typography>
                    </Stack>
                </Stack>
              </CardContent>
            </Card>

           
          </Stack>
        </Fade>

        <Snackbar
          open={snack.open}
          autoHideDuration={4000}
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert severity={snack.severity} variant="filled" sx={{ borderRadius: 3 }}>
            {snack.message}
          </Alert>
        </Snackbar>
      </Container>
    </Box>
  );
}
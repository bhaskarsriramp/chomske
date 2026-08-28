// UpiMandate.modern.jsx — refactored with modern UX patterns
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Typography,
  TextField,
  Divider,
  Stack,
  Button,
  Chip,
  Tooltip,
  InputAdornment,
  Snackbar,
  Alert,
  useMediaQuery,
  LinearProgress,
  Container,
  Paper,
  Fade,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import LockIcon from "@mui/icons-material/Lock";
import VerifiedUserIcon from "@mui/icons-material/VerifiedUser";
import PersonIcon from "@mui/icons-material/Person";
import EmailIcon from "@mui/icons-material/Email";
import PhoneIphoneIcon from "@mui/icons-material/PhoneIphone";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CircularProgress from "@mui/material/CircularProgress";
import { logout } from "../../store/professionalSlice";
import { useDispatch } from "react-redux";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";


const RZP_KEY_ID = "rzp_live_RbZ0rhbWlR25Cl";

export default function UpiMandateModern() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const dispatch = useDispatch();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(true);
  const [snack, setSnack] = useState({ open: false, message: "", severity: "info" });

  const PLAN_ID = "plan_RiFtJIer0s57AN";
  // const PLAN_ID = "plan_RiFwt9UcnSnpkM";
  const baseUrl = "/api/usersOn";


    const handleLogout = async () => {
    try {
      await axios.post(baseUrl + "/logout", {}, { withCredentials: true });
      dispatch(logout()); // Clear Redux state
      window.location.href = "/professional/login"; // Ensures full logout
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  // Load Razorpay script
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
        message: "Failed to load Razorpay. Please check your connection.",
      });
    };
    document.body.appendChild(s);
  }, []);

  // Prefill user profile from backend
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
        setSnack({
          open: true,
          severity: "warning",
          message:
            err?.response?.data?.error ||
            "Couldn't prefill profile. You can type it manually.",
        });
      } finally {
        if (active) setPrefillLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Validators
  const emailValid = useMemo(() => /\S+@\S+\.\S+/.test(email), [email]);
  const phoneValid = useMemo(() => /^\d{10}$/.test((phone || "").trim()), [phone]);
  const nameValid = useMemo(() => name.trim().length >= 2, [name]);

  const formValid = nameValid && emailValid && phoneValid;

  const createSubscription = async () => {
    if (!formValid) {
      setSnack({
        open: true,
        severity: "warning",
        message: "Please fill all fields correctly.",
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
        message: e?.message || "Something went wrong. Try again.",
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
        message: "Razorpay script not ready yet. Please try again.",
      });
      return;
    }

    const rzp = new window.Razorpay({
      key: RZP_KEY_ID,
      name: "MyHandle",
      description: "₹399 Monthly Subscription",
      subscription_id,
      recurring: 1,
      method: { upi: true },
      prefill: { name, email, contact: phone },
      notes: { plan: "MyHandle 399 Subscription" },
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
          console.error(err);
          const msg =
            err?.response?.data?.error ||
            "Payment verification failed. Please try again.";
          setSnack({ open: true, severity: "error", message: msg });
        }
      },
      modal: { ondismiss: () => console.log("Checkout closed") },
    });

    rzp.open();
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        py: { xs: 1, sm: 3, md: 4 }
      }}
    >
      <Container maxWidth="sm">
        <Fade in={!prefillLoading} timeout={300}>
          <Card
            elevation={0}
            sx={{
              borderRadius: 3,
              backdropFilter: "blur(20px)",
              boxShadow: `0 8px 32px ${alpha(theme.palette.common.black, 0.1)}`,
              border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
              overflow: "hidden",
              opacity: prefillLoading ? 0.6 : 1,
              transition: "opacity 0.3s ease",
                background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.08)} 0%, ${alpha(
          theme.palette.secondary.main,
          0.08
        )} 100%)`,
            }}
          >
            {/* Header */}
            <CardHeader
              title={
                <Stack spacing={1}>
                  <Typography
                    sx={{
                      fontSize: { xs: 24, sm: 28, md: 28 },
                      fontWeight: 700,
                      fontFamily : 'Inter',
                      color: "text.primary",
                    }}
                  >
                    Please Activate Subscription
                  </Typography>
                  <Typography
                    sx={{
                      color: "text.secondary",
                      fontSize: { xs: "0.9rem", md: "1rem" },
                      fontFamily : 'Inter',
                      lineHeight: 1.5,
                    }}
                  >
                    Your subscription or free-trial has been ended.
                  </Typography>
                </Stack>
              }
              sx={{
                px: { xs: 3, md: 4 },
                pb: { xs: 2, md: 3 },
              }}
            />

            {/* Content */}
            <CardContent
              sx={{
                px: { xs: 3, md: 4 },
                py: { xs: 1, md: 2 },
                display: "flex",
                flexDirection: "column",
                gap: 3,
              }}
            >
              {/* Security badges */}
              {/* {isMobile ? ('') : (
 <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <Tooltip title="Processed by Razorpay" placement="top" arrow>
                  <Chip
                    icon={
                      <VerifiedUserIcon sx={{ fontSize: 16, color: "#10b981" }} />
                    }
                    label="Verified by Razorpay"
                    variant="outlined"
                    size="small"
                    sx={{
                      fontWeight: 500,
                      p:1,
                      border: "1px solid",
                      borderColor: "success.light",
                      bgcolor: alpha(theme.palette.success.main, 0.08),
                    }}
                  />
                </Tooltip>
                <Tooltip title="Bank-grade security" placement="top" arrow>
                  <Chip
                    icon={<LockIcon sx={{ fontSize: 16 }} />}
                    label="256-bit SSL Encrypted"
                    variant="outlined"
                    size="small"
                    sx={{
                      fontWeight: 500,
                      p:1,
                      border: "1px solid",
                      borderColor: "primary.light",
                      bgcolor: alpha(theme.palette.primary.main, 0.08),
                    }}
                  />
                </Tooltip>
              </Stack>
              )} */}
             

              {/* Form fields */}
              <Stack spacing={2.5}>
                {/* Full name */}
                <Box>
                  <TextField
                    label="Full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    fullWidth
                    error={!nameValid && name !== ""}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <PersonIcon
                            sx={{
                              fontSize: 20,
                              color: nameValid && name ? "success.main" : "text.secondary",
                            }}
                          />
                        </InputAdornment>
                      ),
                      endAdornment: nameValid && name && (
                        <InputAdornment position="end">
                          <CheckCircleIcon sx={{ fontSize: 20, color: "success.main" }} />
                        </InputAdornment>
                      ),
                    }}
                    helperText={
                      !nameValid && name !== ""
                        ? "At least 2 characters"
                        : nameValid && name
                        ? "✓ Looks good"
                        : " "
                    }
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        transition: "all 0.2s ease",
                        "&:hover fieldset": {
                          borderColor: "primary.light",
                        },
                        "&.Mui-focused fieldset": {
                          borderColor: "primary.main",
                          boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.1)}`,
                        },
                      },
                    }}
                  />
                </Box>

                {/* Email */}
                <Box>
                  <TextField
                    label="Email address"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    fullWidth
                    error={!emailValid && email !== ""}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <EmailIcon
                            sx={{
                              fontSize: 20,
                              color: emailValid && email ? "success.main" : "text.secondary",
                            }}
                          />
                        </InputAdornment>
                      ),
                      endAdornment: emailValid && email && (
                        <InputAdornment position="end">
                          <CheckCircleIcon sx={{ fontSize: 20, color: "success.main" }} />
                        </InputAdornment>
                      ),
                    }}
                    helperText={
                      !emailValid && email !== ""
                        ? "Enter a valid email"
                        : emailValid && email
                        ? "✓ Email verified"
                        : " "
                    }
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        transition: "all 0.2s ease",
                        "&:hover fieldset": {
                          borderColor: "primary.light",
                        },
                        "&.Mui-focused fieldset": {
                          borderColor: "primary.main",
                          boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.1)}`,
                        },
                      },
                    }}
                  />
                </Box>

                {/* Phone */}
                <Box>
                  <TextField
                    label="Mobile number"
                    inputMode="numeric"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
                    fullWidth
                    error={!phoneValid && phone !== ""}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <PhoneIphoneIcon
                            sx={{
                              fontSize: 20,
                              color: phoneValid && phone ? "success.main" : "text.secondary",
                            }}
                          />
                        </InputAdornment>
                      ),
                      endAdornment: phoneValid && phone && (
                        <InputAdornment position="end">
                          <CheckCircleIcon sx={{ fontSize: 20, color: "success.main" }} />
                        </InputAdornment>
                      ),
                    }}
                    helperText={
                      !phoneValid && phone !== ""
                        ? "10-digit mobile number"
                        : phoneValid && phone
                        ? "✓ Valid number"
                        : " "
                    }
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        transition: "all 0.2s ease",
                        "&:hover fieldset": {
                          borderColor: "primary.light",
                        },
                        "&.Mui-focused fieldset": {
                          borderColor: "primary.main",
                          boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.1)}`,
                        },
                      },
                    }}
                  />
                </Box>
              </Stack>

              {/* CTA Button */}
              <Button
                variant="contained"
                size="large"
                onClick={createSubscription}
                disabled={loading || !formValid || prefillLoading}
                fullWidth
                sx={{
                  py: { xs: 1.75, md: 2 },
                  borderRadius: 2,
                  textTransform: "none",
                  fontSize: { xs: "1rem", md: "1.0625rem" },
                  fontWeight: 700,
                  boxShadow: "none",
                  transition: "all 0.2s ease",
                  "&:hover:not(:disabled)": {
                    transform: "translateY(-1px)",
                    boxShadow: `0 12px 24px ${alpha(theme.palette.primary.main, 0.25)}`,
                  },
                  "&:disabled": {
                    bgcolor: "grey.200",
                    color: "grey.500",
                  },
                }}
              >
                {loading ? (
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <CircularProgress size={20} thickness={5} />
                    <span>Processing…</span>
                  </Stack>
                ) : (
                  "Subscribe"
                )}
              </Button>

              {/* Info section */}
              {/* <Paper
                elevation={0}
                sx={{
                  p: 2.5,
                  borderRadius: 2,
                  bgcolor: alpha(theme.palette.primary.main, 0.04),
                  border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
                }}
              >
                <Stack spacing={1.5}>
                  <Typography
                    sx={{
                      fontSize: "0.8125rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      color: "text.secondary",
                    }}
                  >
                    How it works
                  </Typography>
                  <Stack spacing={1}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontSize: "0.9375rem",
                        color: "text.secondary",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 1.5,
                      }}
                    >
                      <CheckCircleIcon
                        sx={{
                          fontSize: 18,
                          color: "success.main",
                          flexShrink: 0,
                          mt: 0.25,
                        }}
                      />
                      <span>Authorize UPI mandate (no charge today)</span>
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        fontSize: "0.9375rem",
                        color: "text.secondary",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 1.5,
                      }}
                    >
                      <CheckCircleIcon
                        sx={{
                          fontSize: 18,
                          color: "success.main",
                          flexShrink: 0,
                          mt: 0.25,
                        }}
                      />
                      <span>Get 7 days FREE full access</span>
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        fontSize: "0.9375rem",
                        color: "text.secondary",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 1.5,
                      }}
                    >
                      <CheckCircleIcon
                        sx={{
                          fontSize: 18,
                          color: "success.main",
                          flexShrink: 0,
                          mt: 0.25,
                        }}
                      />
                      <span>₹399/month charged after 7 days</span>
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        fontSize: "0.9375rem",
                        color: "text.secondary",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 1.5,
                      }}
                    >
                      <CheckCircleIcon
                        sx={{
                          fontSize: 18,
                          color: "success.main",
                          flexShrink: 0,
                          mt: 0.25,
                        }}
                      />
                      <span>Cancel anytime, no hidden fee</span>
                    </Typography>
                  </Stack>
                </Stack>
              </Paper> */}

    <Button
                onClick={handleLogout}
                startIcon={<LogoutRoundedIcon />}
                variant="text"
                color="error"
                fullWidth
                sx={{
                  mt: 1.5,
                  textTransform: "none",
                  fontWeight: 700,
                }}
              >
                Log out
              </Button>

            </CardContent>
          </Card>
        </Fade>

        {/* Snackbar notifications */}
        <Snackbar
          autoHideDuration={5000}
          open={snack.open}
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert
            elevation={3}
            onClose={() => setSnack((s) => ({ ...s, open: false }))}
            severity={snack.severity}
            sx={{
              width: "100%",
              borderRadius: 2,
              fontWeight: 500,
            }}
          >
            {snack.message}
          </Alert>
        </Snackbar>
      </Container>
    </Box>
  );
}

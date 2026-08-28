// Onboarding.js
import React, { useRef, useState, useEffect } from "react";
import {
  Box,
  Button,
  Container,
  Grid,
  TextField,
  InputAdornment,
  Typography,
  Paper,
  Avatar,
  useMediaQuery,
  IconButton,
  Stack,
  Fade,
  LinearProgress,
  Chip
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import axios from "axios";
import { useNavigate } from "react-router-dom";

export default function Onboarding() {
  const theme = useTheme();
  const navigate = useNavigate();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const steps = 2;
  const [step, setStep] = useState(0);
  const progress = ((step + 1) / (steps + 1)) * 100;

  const [username, setUsername] = useState("");
  const [goal, setGoal] = useState("");
  const apiBase = "/api/usersOn";
  const [isSaving, setIsSaving] = useState(false);

  // Availability state
  const [availability, setAvailability] = useState("idle");
  const [availMsg, setAvailMsg] = useState("");
  const abortRef = useRef(null);
  const debounceRef = useRef(null);

  const sanitizeUsername = (raw) =>
    raw.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 20);

  const usernameIsValid =
    /^[a-z0-9](?:[a-z0-9._-]{1,18}[a-z0-9])$/.test(username) && username.length >= 3;

  // Status Icons
  const StatusIndicator = () => {
    if (availability === "checking") {
      return (
        <Box sx={{ display: "flex", alignItems: "center" }}>
          <Box
            sx={{
              width: 16,
              height: 16,
              border: "2px solid",
              borderColor: "primary.main",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 0.6s linear infinite",
              "@keyframes spin": {
                "0%": { transform: "rotate(0deg)" },
                "100%": { transform: "rotate(360deg)" }
              }
            }}
          />
        </Box>
      );
    }
    if (availability === "available") {
      return <CheckCircleIcon sx={{ fontSize: 20, color: "success.main" }} />;
    }
    if (availability === "taken" || availability === "invalid") {
      return (
        <Box
          sx={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            bgcolor: availability === "taken" ? "error.main" : "warning.main",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: 14,
            fontWeight: 700
          }}
        >
          !
        </Box>
      );
    }
    return null;
  };

  // Debounced availability check
  useEffect(() => {
    if (!username) {
      setAvailability("idle");
      setAvailMsg("");
      if (abortRef.current) abortRef.current.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      return;
    }

    if (!usernameIsValid) {
      setAvailability("invalid");
      setAvailMsg("3-20 characters. Letters, numbers, dots, underscores, hyphens only");
      if (abortRef.current) abortRef.current.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      return;
    }

    setAvailability("checking");
    setAvailMsg("Checking availability...");

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await axios.post(
          `${apiBase}/subdomain/check`,
          { subdomain: username },
          { signal: controller.signal }
        );

        const available = !!res?.data?.available;
        if (available) {
          setAvailability("available");
          setAvailMsg(`${username}.myhandle.in is available`);
        } else {
          setAvailability("taken");
          setAvailMsg("This subdomain is already taken");
        }
      } catch (err) {
        if (axios.isCancel?.(err) || err?.name === "CanceledError" || err?.name === "AbortError") {
          return;
        }
        setAvailability("error");
        setAvailMsg("Unable to verify. Please try again");
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [username]);

  const handleNext = async () => {
    if (step === 0) {
      if (!username || !usernameIsValid || availability !== "available") {
        return;
      }
      setStep(1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (!username || !usernameIsValid || availability !== "available") {
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        handleUserName: username.trim().toLowerCase(),
        goal: goal || null
      };

      const res = await axios.post(`${apiBase}/save-username`, payload, {
        withCredentials: true,
        headers: { "Content-Type": "application/json" }
      });

      const data = res.data || {};
      if (data.success) {
        navigate("/professional/user/bio");
      } else {
        alert(data.message || "Could not save username. Please try again.");
      }
    } catch (err) {
      console.error("Save username error:", err);
      const msg = err?.response?.data?.message || err?.message || "Something went wrong";
      alert(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const GoalCard = ({ title, desc, emoji, active, onClick }) => (
    <Paper
      onClick={onClick}
      elevation={0}
      sx={{
        cursor: "pointer",
        p: { xs: 2.5, md: 3 },
        borderRadius: 3,
        border: active ? "2px solid" : "2px solid",
        borderColor: active ? "primary.main" : "divider",
        bgcolor: active ? "primary.50" : "background.paper",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        "&:hover": {
          borderColor: active ? "primary.main" : "primary.light",
          transform: "translateY(-2px)",
          boxShadow: active ? 3 : 1
        }
      }}
    >
      <Stack direction="row" alignItems="center" spacing={2}>
        <Box
          sx={{
            width: { xs: 48, md: 56 },
            height: { xs: 48, md: 56 },
            borderRadius: 2,
            bgcolor: active ? "primary.main" : "grey.100",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: { xs: 24, md: 28 },
            flexShrink: 0
          }}
        >
          {emoji}
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5, fontSize: { xs: "1rem", md: "1.125rem" } }}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: "0.875rem", md: "0.9375rem" } }}>
            {desc}
          </Typography>
        </Box>
        {active && (
          <CheckCircleIcon sx={{ color: "primary.main", fontSize: { xs: 24, md: 28 }, flexShrink: 0 }} />
        )}
      </Stack>
    </Paper>
  );

  const statusColor =
    availability === "available"
      ? "success.main"
      : availability === "taken"
      ? "error.main"
      : availability === "invalid"
      ? "warning.main"
      : "text.secondary";

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "grey.50", display: "flex", flexDirection: "column" }}>
      {/* Progress bar - fixed at top */}
      <LinearProgress
        variant="determinate"
        value={progress}
        sx={{
          height: 4,
          bgcolor: "grey.200",
          "& .MuiLinearProgress-bar": {
            bgcolor: "primary.main",
            transition: "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)"
          }
        }}
      />

      <Container maxWidth="sm" sx={{ flex: 1, display: "flex", flexDirection: "column", py: { xs: 3, md: 6 } }}>
        {/* Step indicator */}
        <Stack direction="row" alignItems="center" justifyContent="center" spacing={1} sx={{ mb: { xs: 4, md: 6 } }}>
          <Chip
            label={`Step ${step + 1} of ${steps}`}
            size="small"
            sx={{
              fontWeight: 600,
              bgcolor: "primary.50",
              color: "primary.main",
              border: "1px solid",
              borderColor: "primary.100"
            }}
          />
        </Stack>

        {/* Step 0: Username */}
        <Fade in={step === 0} timeout={400}>
          <Box sx={{ display: step === 0 ? "block" : "none" }}>
            <Typography
              variant="h1"
              sx={{
                fontSize: { xs: 28, sm: 36, md: 42 },
                fontWeight: 800,
                lineHeight: 1.2,
                mb: 2,
                color: "text.primary"
              }}
            >
              Choose your handle
            </Typography>

            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, fontSize: { xs: "1rem", md: "1.125rem" } }}>
              Your unique username on myHandle. Don't worry, you can change it later.
            </Typography>

            {/* Subdomain Input with Preview */}
            <Box sx={{ mb: 2 }}>
              {/* Live preview of full subdomain */}
              <Box
                sx={{
                  mb: 2,
                  p: 2,
                  borderRadius: 2,
                  bgcolor: "primary.50",
                  border: "1px solid",
                  borderColor: "primary.100",
                  minHeight: 52,
                  display: "flex",
                  alignItems: "center"
                }}
              >
                <Typography
                  sx={{
                    fontFamily: "monospace",
                    fontWeight: 600,
                    fontSize: { xs: "0.95rem", md: "1.125rem" },
                    wordBreak: "break-all"
                  }}
                >
                  <Typography
                    component="span"
                    sx={{
                      color: "primary.main",
                      fontWeight: 700,
                      fontFamily: "monospace"
                    }}
                  >
                    {username || "yourname"}
                  </Typography>
                  <Typography
                    component="span"
                    sx={{
                      color: "text.secondary",
                      fontFamily: "monospace"
                    }}
                  >
                    .myhandle.in
                  </Typography>
                </Typography>
              </Box>

              {/* Input field */}
              <TextField
                fullWidth
                autoFocus
                value={username}
                onChange={(e) => setUsername(sanitizeUsername(e.target.value))}
                placeholder="yourname"
                inputProps={{ maxLength: 20, "aria-describedby": "username-status" }}
                InputProps={{
                  endAdornment: availability !== "idle" && (
                    <InputAdornment position="end">
                      <StatusIndicator />
                    </InputAdornment>
                  ),
                  sx: {
                    fontSize: { xs: "1rem", md: "1.125rem" },
                    fontWeight: 600
                  }
                }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    bgcolor: "background.paper",
                    "& fieldset": {
                      borderWidth: 2,
                      borderColor: "divider"
                    },
                    "&:hover fieldset": {
                      borderColor: "primary.light"
                    },
                    "&.Mui-focused fieldset": {
                      borderColor: "primary.main"
                    }
                  }
                }}
              />

              {/* Helper text */}
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  mt: 1.5,
                  fontSize: "0.8125rem",
                  color: "text.secondary"
                }}
              >
                3-20 characters. Only letters & numbers are allowed.
              </Typography>
            </Box>

            {/* Status message */}
            {availability !== "idle" && (
              <Fade in timeout={200}>
                <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ mb: 4 }}>
                  <Box sx={{ width: 20, display: "flex", alignItems: "center", justifyContent: "center", mt: 0.25 }}>
                    <StatusIndicator />
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 500, color: statusColor, fontSize: "0.9375rem" }}>
                    {availMsg}
                  </Typography>
                </Stack>
              </Fade>
            )}

            <Button
              fullWidth
              variant="contained"
              size="large"
              onClick={handleNext}
              disabled={!username || !usernameIsValid || availability !== "available"}
              sx={{
                py: 1.75,
                borderRadius: 2,
                textTransform: "none",
                fontSize: "1.0625rem",
                fontWeight: 700,
                boxShadow: "none",
                "&:hover": {
                  boxShadow: 2
                },
                "&.Mui-disabled": {
                  bgcolor: "grey.200",
                  color: "grey.500"
                }
              }}
            >
              Continue
            </Button>
          </Box>
        </Fade>

        {/* Step 1: Goal selection */}
        <Fade in={step === 1} timeout={400}>
          <Box sx={{ display: step === 1 ? "block" : "none" }}>
            <IconButton
              onClick={handleBack}
              sx={{
                mb: 3,
                border: "2px solid",
                borderColor: "divider",
                borderRadius: 2,
                "&:hover": {
                  borderColor: "primary.light",
                  bgcolor: "primary.50"
                }
              }}
            >
              <ArrowBackIcon />
            </IconButton>

            <Typography
              variant="h1"
              sx={{
                fontSize: { xs: 24, sm: 32, md: 38 },
                fontWeight: 800,
                lineHeight: 1.2,
                mb: 2,
                color: "text.primary"
              }}
            >
              What's your main goal?
            </Typography>

            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, fontSize: { xs: "1rem", md: "1.125rem" } }}>
              We'll personalize your experience based on your selection.
            </Typography>

            <Stack spacing={2} sx={{ mb: 4 }}>
              <GoalCard
                title="Creator"
                desc="Build my following and monetize my audience"
                emoji="🎨"
                active={goal === "Creator"}
                onClick={() => setGoal("Creator")}
              />
              <GoalCard
                title="Business"
                desc="Grow my business and reach more customers"
                emoji="💼"
                active={goal === "Business"}
                onClick={() => setGoal("Business")}
              />
            </Stack>

            <Button
              fullWidth
              variant="contained"
              size="large"
              onClick={handleNext}
              disabled={!goal || isSaving}
              sx={{
                py: 1.75,
                borderRadius: 2,
                textTransform: "none",
                fontSize: "1.0625rem",
                fontWeight: 700,
                boxShadow: "none",
                "&:hover": {
                  boxShadow: 2
                },
                "&.Mui-disabled": {
                  bgcolor: "grey.200",
                  color: "grey.500"
                }
              }}
            >
              {isSaving ? "Setting up your profile..." : "Continue"}
            </Button>
          </Box>
        </Fade>
      </Container>
    </Box>
  );
}

import { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Paper,
  Button,
  CircularProgress,
} from "@mui/material";
import { adminLogin } from "../../store/adminSlice";
import { useDispatch } from "react-redux";
import { toast } from "react-toastify";
import { useGoogleLogin } from "@react-oauth/google";
import GmailIcon from "../../images/google.png";

export default function AdminLogin() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [isLoading, setIsLoading] = useState(false);
  const baseUrl = "/api/usersOn";

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Check existing session
  useEffect(() => {
    const verifyToken = async () => {
      try {
        const res = await axios.get(`${baseUrl}/verify-admin-token`, {
          withCredentials: true,
        });
        if (res.data.valid) {
          navigate("/admin/dashboard");
        }
      } catch {
        // not logged in
      }
    };
    verifyToken();
  }, []);

  const handleLoginSuccess = async (email, firstName, lastName, picture) => {
    setIsLoading(true);
    try {
      const res = await axios.post(
        `${baseUrl}/admin-login-gmail`,
        { email, firstName, lastName, picture },
        { withCredentials: true }
      );

      const data = res?.data || {};
      if (data.success) {
        dispatch(
          adminLogin({
            admin_email: data.admin.admin_email,
            admin_id: data.admin.admin_id,
          })
        );
        navigate("/admin/dashboard");
      }
    } catch (err) {
      if (err?.response?.status === 429) {
        toast.error("Too many login attempts. Please wait a moment and try again.");
      } else {
        const msg =
          err?.response?.data?.error || "Something went wrong. Please try again.";
        toast.error(msg);
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
          toast.error("Google sign-in did not return an access token.");
          return;
        }
        const profileRes = await axios.get(
          "https://www.googleapis.com/oauth2/v3/userinfo",
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            withCredentials: false,
            timeout: 8000,
          }
        );
        const { email, given_name, family_name, picture } =
          profileRes.data || {};
        handleLoginSuccess(email, given_name, family_name, picture);
      } catch {
        toast.error("Google sign-in failed. Please try again.");
      }
    },
    onError: () => {
      toast.error("Google sign-in failed. Please try again.");
    },
  });

  return (
    <Box
      sx={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
        minHeight: "100dvh",
      }}
    >
      <Paper
        elevation={6}
        sx={{
          p: 5,
          maxWidth: 420,
          width: "90%",
          borderRadius: 3,
          textAlign: "center",
        }}
      >
        <Typography
          variant="h5"
          sx={{ fontWeight: 700, mb: 1, fontFamily: "Inter" }}
        >
          Admin Panel
        </Typography>

        <Typography
          variant="body2"
          sx={{ color: "text.secondary", mb: 4, fontFamily: "Inter" }}
        >
          Sign in with your authorised Google account
        </Typography>

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
            boxShadow: "0 8px 20px rgba(36,107,233,0.35)",
          }}
        >
          <Box
            component="img"
            src={GmailIcon}
            alt="Google"
            sx={{
              width: 24,
              height: 24,
              bgcolor: "#fff",
              p: 0.5,
              borderRadius: 1,
            }}
          />
          <Typography sx={{ fontFamily: "Inter", fontSize: "16px" }}>
            {isLoading ? "Signing you in..." : "Continue with Google"}
          </Typography>
          {isLoading && <CircularProgress size={18} sx={{ ml: 1 }} />}
        </Button>
      </Paper>
    </Box>
  );
}

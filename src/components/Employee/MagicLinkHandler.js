import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { login } from "../../store/professionalSlice";
import axios from "axios";
import { Box, CircularProgress, Typography, Button } from "@mui/material";

const baseUrl = "/api/usersOn";

export default function MagicLinkHandler({ children }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const token = searchParams.get("token");
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [status, setStatus] = useState(token ? "loading" : "ready"); // loading | ready | error
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) return;

    const verifyMagicLink = async () => {
      try {
        const res = await axios.post(
          `${baseUrl}/magic-login`,
          { token },
          { withCredentials: true }
        );

        if (res.data.success) {
          // Set Redux state so the app treats user as logged in
          dispatch(
            login({
              user_email: res.data.user.user_email,
              user_id: res.data.user.user_id,
            })
          );

          // Remove token from URL, preserve/add chat username
          searchParams.delete("token");
          if (res.data.chatUsername) {
            searchParams.set("chat", res.data.chatUsername);
          }
          setSearchParams(searchParams, { replace: true });

          setStatus("ready");
        } else {
          setStatus("error");
          setErrorMsg("Invalid or expired link.");
        }
      } catch (err) {
        setStatus("error");
        const msg =
          err.response?.data?.message || "This link is invalid or has expired.";
        setErrorMsg(msg);
      }
    };

    verifyMagicLink();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "loading") {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
          gap: 2,
        }}
      >
        <CircularProgress />
        <Typography variant="body1" color="text.secondary">
          Verifying your link...
        </Typography>
      </Box>
    );
  }

  if (status === "error") {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
          gap: 2,
          px: 3,
          textAlign: "center",
        }}
      >
        <Typography variant="h6" color="error">
          {errorMsg}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Please request a new link or log in manually.
        </Typography>
        <Button
          variant="contained"
          onClick={() => navigate("/professional/login")}
          sx={{ mt: 1 }}
        >
          Go to Login
        </Button>
      </Box>
    );
  }

  // status === "ready" → render the actual inbox
  return children;
}

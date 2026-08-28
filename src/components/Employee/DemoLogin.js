
import React, { useState } from "react";
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  TextField,
  Button,
  Typography,
  IconButton,
  InputAdornment,
  CircularProgress,
  Alert,
} from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { login } from "../../store/professionalSlice";
import { useDispatch } from "react-redux";
import { toast } from "react-toastify";



export default function DemoLogin({ onSuccess }) {
  const [email, setEmail] = useState("");
   const navigate = useNavigate();
    const dispatch = useDispatch();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const baseUrl = "/api/usersOn";


  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setOk(false);

    if (!email || !password) {
      setError("Please enter email and password.");
      return;
    }

    try {
      setLoading(true);
     const res = await axios.post(
                baseUrl + "/demo-login",
                { demoEmail: email, demoPass: password },
                { withCredentials : true}
                );

      const data = res?.data || {};


     if (data.success) {
            dispatch(login({ user_email: data.user.user_email, user_id: data.user.user_id }));
        navigate("/professional/dashboard/analytics");

          } else {
            toast.error("Something went wrong. Please login again.");
            setTimeout(() => navigate("/professional/login"), 1200);
          }

    
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "#f7f7fb", p: 2 }}>
      <Card sx={{ width: "100%", maxWidth: 420, borderRadius: 4, boxShadow: "0 10px 30px rgba(0,0,0,0.08)" }}>
        <CardHeader title="Reviewer Demo Login" subheader="Use the test Gmail credentials provided in the Reviewer Instructions" sx={{ textAlign: "center" }} />
        <CardContent>
          <form onSubmit={handleSubmit}>
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
              margin="normal"
              required
              autoFocus
            />

            <TextField
              label="Password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
              margin="normal"
              required
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShowPassword((s) => !s)} edge="end" aria-label="toggle password visibility">
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
            )}
            {ok && (
              <Alert severity="success" sx={{ mt: 2 }}>Login successful. Redirecting…</Alert>
            )}

            <Button
              variant="contained"
              type="submit"
              fullWidth
              sx={{ mt: 3, py: 1.2, borderRadius: 2 }}
              disabled={loading}
            >
              {loading ? <CircularProgress size={22} /> : "Login"}
            </Button>

            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2, textAlign: "center" }}>
              For Meta review only. Do not use personal credentials.
            </Typography>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}

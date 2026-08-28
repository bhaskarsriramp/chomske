import { useState, useEffect, useRef } from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Grid,
  Button,
  Paper,
  Stack
} from '@mui/material';
import { login } from '../../store/participantSlice';
import { useDispatch } from 'react-redux';
import { toast } from 'react-toastify';
import CircularProgress from '@mui/material/CircularProgress';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useGoogleLogin } from '@react-oauth/google';
import GmailIcon from '../../images/google.png';
import wallBack from '../../images/wallback.jpg';

function UserParticipant() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [isLoading, setIsLoading] = useState(false);
  const baseUrl = "/api/usersOn";
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const subdomainRef = useRef("");

  // Extract subdomain (or ?subdomain=) once
  useEffect(() => {
    let computed = "";
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("subdomain")?.trim();
      if (q) {
        computed = q;
      } else {
        const host = window.location?.hostname || "";
        const firstLabel = host.split(".")[0] || "";
        const isIP = /^\d+\.\d+\.\d+\.\d+$/.test(host);
        if (firstLabel && firstLabel !== "localhost" && !isIP) {
          computed = firstLabel;
        } else {
          computed = "";
        }
      }
    } catch (err) {
      console.warn("subdomain extraction error", err);
      computed = "";
    }
    subdomainRef.current = computed;
  }, []);

  // Lock body scroll while mounted
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Verify token and fast-redirect if already logged in
  useEffect(() => {
    const verifyToken = async () => {
      try {
        const res = await axios.get(`${baseUrl}/verify-participant-login-token`, { withCredentials: true });
        if (res.data.valid) {
          const subdomainToSend = subdomainRef.current;
          navigate(`/chat-window?subdomain=${encodeURIComponent(subdomainToSend)}`);
        } else {
          setIsLoading(false);
        }
      } catch (error) {
        setIsLoading(false);
      }
    };
    verifyToken();
  }, [navigate]);

  const handleLoginSuccess = async (email_gm, firstName, lastName, picture) => {
    setIsLoading(true);
    try {
      const subdomainToSend = subdomainRef.current;
      const res = await axios.post(
        baseUrl + "/participant-user-login-gmail",
        { email: email_gm, firstName, lastName, picture },
        { withCredentials: true }
      );

      setIsLoading(false);
      const data = res?.data || {};

      if (data.success) {
        dispatch(login({ user_email: data.user.user_email, user_id: data.user.user_id }));
        const subdomainToSend2 = subdomainRef.current;
        navigate(`/chat-window?subdomain=${encodeURIComponent(subdomainToSend2)}`);
      } else {
        toast.error("Something went wrong. Please login again.");
        setTimeout(() => {
          navigate('/professional/login');
        }, 1500);
      }
    } catch (err) {
      setIsLoading(false);
      console.log('Error : ', err);
      toast.error("Something went wrong. Please try again.");
      setTimeout(() => {
        navigate('/professional/login');
      }, 1500);
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
        const profileRes = await axios.get(
          "https://www.googleapis.com/oauth2/v3/userinfo",
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            withCredentials: false,
            timeout: 8000,
          }
        );
        const { email: gmEmail, given_name, family_name, picture } = profileRes.data || {};
        handleLoginSuccess(gmEmail, given_name, family_name, picture);
      } catch (err) {
        console.error("client-side userinfo failed:", err);
        toast.error("Google sign-in failed. Please try again.");
      }
    },
    onError: () => {
      toast.error("Google sign-in failed. Please try again.");
    },
  });

  return (
    <>
      {/* Background layer */}
      <Box
        sx={{
          position: 'fixed',
          inset: 0,
          backgroundImage: `linear-gradient(rgba(10,10,10,0.35), rgba(10,10,10,0.55)), url(${wallBack})`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: { xs: 2, sm: 3, md: 4 }
        }}
      >
        {/* Content container */}
        <Grid container justifyContent="center">
          <Grid item xs={12} sm={10} md={6} lg={4}>
            <Paper
              elevation={0}
              sx={{
                backdropFilter: 'blur(12px)',
                backgroundColor: 'rgba(255,255,255,0.75)',
                borderRadius: 3,
                p: { xs: 3, sm: 4 },
                boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
                border: '1px solid rgba(255,255,255,0.6)'
              }}
            >
              <Stack spacing={2.5} alignItems="center">
                <Typography
                  variant={isSmallScreen ? 'h5' : 'h4'}
                  sx={{
                    fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto',
                    fontWeight: 700,
                    letterSpacing: 0.2,
                    color: '#0F172A',
                    textAlign: 'center',
                    lineHeight: 1.2
                  }}
                >
                  Sign in to chat
                </Typography>

                <Typography
                  variant="body2"
                  sx={{
                    color: '#334155',
                    textAlign: 'center',
                    maxWidth: 420
                  }}
                >
                  Use your Google account to connect and start a secure conversation with {subdomainRef.current}.
                </Typography>

                {/* Google Sign-in */}
                <Button
                  onClick={() => !isLoading && loginWithGoogle()}
                  fullWidth
                  size="large"
                  disableElevation
                  variant="contained"
                  aria-busy={isLoading ? 'true' : 'false'}
                  sx={{
                    mt: 1,
                    py: 1.4,
                    gap: 1.2,
                    fontWeight: 600,
                    textTransform: 'none',
                    borderRadius: 2,
                    background: 'linear-gradient(90deg, #246be9 0%, #1c54b3 100%)',
                    '&:hover': { background: 'linear-gradient(90deg, #1f5fd0 0%, #184a9e 100%)' }
                  }}
                >
                  <Box
                    component="img"
                    src={GmailIcon}
                    alt="Google"
                    sx={{
                      width: 24,
                      height: 24,
                      objectFit: 'contain',
                      bgcolor: '#fff',
                      borderRadius: 1,
                      p: 0.5
                    }}
                  />
                  {isLoading ? (
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <CircularProgress size={20} sx={{ color: '#fff' }} />
                      <span>Signing you in…</span>
                    </Stack>
                  ) : (
                    'Continue with Google'
                  )}
                </Button>

                <Typography variant="caption" sx={{ color: '#475569', textAlign: 'center' }}>
                  You’ll be redirected to the chat.
                </Typography>

                {/* Divider-like subtle line */}
                <Box
                  sx={{
                    width: '100%',
                    height: 1,
                    bgcolor: 'rgba(15, 23, 42, 0.08)',
                    my: 0.5
                  }}
                />

                <Typography
                  variant="caption"
                  sx={{
                    color: '#64748B',
                    textAlign: 'center'
                  }}
                >
                  By continuing, you agree to our Terms and acknowledge our Privacy Policy.
                </Typography>
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </Box>

      {/* Global toasts */}
      <ToastContainer autoClose={2000} />
    </>
  );
}

export default UserParticipant;

import { useState, useEffect } from 'react'
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  TextField,
  Button,
  Typography,
  Grid
} from '@mui/material';
import { toast } from "react-toastify";
import CircularProgress from '@mui/material/CircularProgress';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useGoogleLogin } from '@react-oauth/google';
import ArrowRightAltOutlinedIcon from '@mui/icons-material/ArrowRightAltOutlined';
import GmailIcon from '../images/google.png';
import wallBack from '../images/wallback.jpg';

function WaitlistSignup() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const baseUrl = "http://localhost:8001/usersOn";
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'));

  // validation state
  const [emailTouched, setEmailTouched] = useState(false);

  const emailRegex = /^\S+@\S+\.\S+$/;
  const isEmailValid = emailRegex.test(email.trim());

  useEffect(() => {
    // lock body scroll while component is mounted
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);


const handleLoginSuccess = async (email_gm, firstName, lastName, picture) => {
  setIsLoading(true);
  try {
    const res = await axios.post(
      baseUrl + "/waitlist-join-gmail",
      { email: email_gm, firstName, lastName, picture },
      { withCredentials: true }
    );

    setIsLoading(false);

    // safe guard: check data object
    const data = res?.data || {};

    if (data.wasNew) {
      navigate("/waitlist-success");
    } else {
      // Existing user / already joined
      toast.info(data.message || "You're already on the waitlist. Thanks!");
    }

  } catch (err) {
    setIsLoading(false);

    // If server responded with a message, show it
    const serverMessage = err?.response?.data?.message || err?.message || "An error occurred. Please try again later.";
    toast.error(serverMessage);
    console.error("Waitlist join error:", err);
  }
};


  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const profileRes = await axios.get(
          "https://www.googleapis.com/oauth2/v3/userinfo",
          {
            headers: {
              Authorization: `Bearer ${tokenResponse.access_token}`,
            },
          }
        );
        const { email: gmEmail, given_name, family_name, picture } = profileRes.data;
        handleLoginSuccess(gmEmail, given_name, family_name, picture);
      } catch (err) {
        console.error("Failed fetching Google profile:", err);
        toast.error("Google sign-in failed. Please try again.");
      }
    },
    onError: () => {
      toast.error("Google sign-in failed. Please try again.");
    },
  });


  const handleEmailChange = (e) => {
    setEmail(e.target.value);
    if (!emailTouched) setEmailTouched(true);
  };

  const handleEmailBlur = () => {
    setEmailTouched(true);
  };

  async function submit(e) {
    e.preventDefault();

    // set touched so helperText shows if invalid
    setEmailTouched(true);

    if (!email.trim()) {
      toast.warning("All fields are mandatory");
      return;
    }

    if (!isEmailValid) {
      toast.warning("Invalid email address");
      return;
    }

    setIsLoading(true);

    try {
      const response = await axios.post(baseUrl + "/waitlist-join-email", {
        email
      });

      if (response.data.success) {
        setIsLoading(false);
      navigate("/waitlist-success");
      } else {
        setIsLoading(false);
        toast.error("An error occurred. Please try again later.");
      }
    } catch (error) {
      setIsLoading(false);
      if (error.response && error.response.data.error === "User already exists") {
        toast.warning("User already exists. Please login to continue...");
      } else if (error.response && error.response.data.error === "All fields are mandatory") {
        toast.warning("All fields are mandatory");
      } else {
        toast.error("Technical Error. Please try again later.");
      }
    }
  }


  return (
    <>
      {isSmallScreen ? (
<Box
sx={{
        position: 'fixed',   // keep it pinned
        inset: 0,
        boxSizing: 'border-box',
        backgroundImage: `linear-gradient(rgba(255,255,255,0.6), rgba(255,255,255,0.6)), url(${wallBack})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        p: { xs: 2, sm: 4 },
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
>
  <Grid item xs={12} paddingX={2} sx={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
    <form action='#' method='post' onSubmit={submit} noValidate style={{ width: '100%', maxWidth: 480 }}>
      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
          <CircularProgress color='success' />
        </div>
      ) : (
        <Box
          display='flex'
          flexDirection={'column'}
          margin='0 auto'
          padding={1}
          alignItems="center"
          sx={{ width: '100%' }}
        >
          <Typography textAlign='center' mb={2} sx={{ fontFamily : 'Inter', fontWeight : 400, fontSize : '20px', color: '#7F8CAA'}}>Get Early Access</Typography>

          {/* Google button + divider */}
          <Box display="flex" flexDirection="column" alignItems="center" width="100%">
            <Box
              onClick={() => login()}
              sx={{
                border: '1px solid #ccc',
                backgroundColor: '#246be9',
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                justifyContent: 'center',
                gap: 1.5,
                py: 1,
                px: 3,
                cursor: 'pointer',
                '&:hover': { backgroundColor: '#1c54b3' }
              }}
            >
              <img
                src={GmailIcon}
                alt="Google"
                style={{ width: 28, height: 28, objectFit: 'contain', padding: 6, background: '#fff', borderRadius: 4 }}
              />
              <Typography sx={{ fontFamily: 'Inter', fontWeight: 500, fontSize: 15, color: '#FFFFFF' }}>
                Proceed with Google
              </Typography>
            </Box>

            <Box display="flex" alignItems="center" justifyContent="center" width="100%" mt={2}>
              <hr style={{ flex: 1, borderTop: '1px solid #ccc', margin: 0 }} />
              <Typography variant="body2" color="textSecondary" sx={{ px: 1 }}>or</Typography>
              <hr style={{ flex: 1, borderTop: '1px solid #ccc', margin: 0 }} />
            </Box>
          </Box>

          <TextField
            type='email'
            id='email'
            sx={{ mt: 2, width: "100%" }}
            onChange={handleEmailChange}
            onBlur={handleEmailBlur}
            variant='outlined'
            label='Email Address'
            value={email}
            error={emailTouched && !isEmailValid}
            helperText={emailTouched && !isEmailValid ? "Invalid email address" : " "}
          />

          <Button
            type='submit'
            variant='contained'
            sx={{textTransform: 'capitalize', fontWeight: '400', fontSize: 16, background: '#362FD9', width: "100%" }}
            size='large'
            disabled={!email.trim() || !isEmailValid}
          >
            Proceed with Email
          </Button>
        </Box>
      )}

      <ToastContainer autoClose={2000} />
    </form>
  </Grid>
</Box>

  
      ) : (
        <Box sx={{ mx: 2, my: 2 }}>
          <Grid container spacing="1" >
          

<Box
sx={{
        position: 'fixed',   // keep it pinned
        inset: 0,
        boxSizing: 'border-box',
        backgroundImage: `linear-gradient(rgba(255,255,255,0.6), rgba(255,255,255,0.6)), url(${wallBack})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        p: { xs: 2, sm: 4 },
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
>
            <Grid item xs={12} md={12} lg={12}>
              <form action='#' method='post' onSubmit={submit} noValidate>
                {isLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%' }}>
                    <CircularProgress color='success' />
                  </div>
                ) : (
                  <Box display='flex' flexDirection={'column'} maxWidth={350} margin='auto' marginTop={8}>
                    <Typography textAlign='center' marginBottom={4} sx={{ fontFamily : 'Inter', fontWeight : 400, fontSize : '26px', color: '#7F8CAA'}}>Get Early Access</Typography>

                    <Box display="flex" justifyContent="center">
                      <Box
                        minWidth={350}
                        onClick={() => login()}
                        sx={{
                          border: '1px solid #ccc',
                          backgroundColor: '#246be9',
                          borderRadius: 2,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 1.5,
                          paddingY: 1,
                          paddingX: 3,
                          cursor: 'pointer',
                          '&:hover': {
                            backgroundColor: '#1c54b3',
                          },
                        }}
                      >
                        <img
                          src={GmailIcon}
                          alt="Google"
                          style={{ width: 28, height: 28, objectFit: 'contain', padding: 6, background: '#FFFFFF', borderRadius: 4 }}
                        />
                        <Typography sx={{ fontFamily: 'Inter', fontWeight: 500, fontSize: 15, color: '#FFFFFF' }}>
                          Proceed with Google
                        </Typography>
                      </Box>
                    </Box>

                    <Box display="flex" alignItems="center" justifyContent="center" marginTop={2}>
                      <hr style={{ flex: '1', borderTop: '1px solid #ccc' }} />
                      <Typography variant="body2" color="textSecondary" sx={{ paddingX: 2 }}>or</Typography>
                      <hr style={{ flex: '1', borderTop: '1px solid #ccc' }} />
                    </Box>

                    <TextField
                      type='email'
                      id='email'
                      margin='normal'
                      onChange={handleEmailChange}
                      onBlur={handleEmailBlur}
                      variant='outlined'
                      label='Email Address'
                      value={email}
                      error={emailTouched && !isEmailValid}
                      helperText={emailTouched && !isEmailValid ? "Invalid email address" : " "}
                    />

                    <Button
                      type='submit'
                      variant='contained'
                      endIcon={<ArrowRightAltOutlinedIcon />}
                      sx={{
                        textTransform: 'capitalize',
                        fontWeight: '400',
                        fontSize: 14,
                        background: '#362FD9'
                      }}
                      size='large'
                      disabled={!email.trim() || !isEmailValid}
                    >
                      Proceed with Email
                    </Button>
                  </Box>
                )}

                <ToastContainer autoClose={2000} />
              </form>
            </Grid>

            </Box>
          </Grid>
        </Box>
      )}

    </>
  )
}

export default WaitlistSignup

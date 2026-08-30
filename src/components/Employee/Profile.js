import { useState, useEffect } from "react";
import {
  Button,
  Typography,
  Grid,
  Box,
  Skeleton
} from "@mui/material";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast, ToastContainer } from "react-toastify";
import 'react-toastify/dist/ReactToastify.css';
import { logout } from "../../store/professionalSlice";

function Profile() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userDetails, setUserDetails] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  
  // const baseUrl = "http://localhost:8001/usersOn";
  const baseUrl = "/api/usersOn";

  const handleSignOut = async () => {
    if (loggingOut) return; // Prevent double-clicks
    
    try {
      setLoggingOut(true);
      
      // Call logout endpoint
      await axios.post(
        baseUrl + "/logout", 
        {}, 
        { 
          withCredentials: true,
          timeout: 5000 
        }
      );
      
      // Clear Redux state
      dispatch(logout());
      
      toast.success("Logged out successfully");
      
      // Small delay to show toast, then redirect
      setTimeout(() => {
        window.location.href = "/professional/login";
      }, 500);
      
    } catch (err) {
      console.error("Logout error:", err);
      setLoggingOut(false);
      
      // Even if backend fails, clear frontend state
      dispatch(logout());
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      sessionStorage.clear();
      
      toast.error("Logout failed, but clearing local session");
      
      setTimeout(() => {
        window.location.href = "/professional/login";
      }, 1000);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(baseUrl + '/get-user-details', {
          withCredentials: true
        });
        setUserDetails(res.data);
        setLoading(false);
      } catch (e) {
        console.error(e);
        // If unauthorized, redirect to login
        if (e.response?.status === 401) {
          navigate("/professional/login");
        }
      }
    };
    fetchData();
  }, [navigate]);

  return (
    <>
      <Grid container>
        <Grid size={{ xs: 12, sm: 6, md: 8}}>
          <Box sx={{ mt: 3 }}>
            {/* Name */}
            <Box sx={{ mb: 3 }}>
              <Typography mb={1.5} sx={{ fontSize: '16px', fontWeight: 500 }}>
                Name
              </Typography>
              {loading ? (
                <Skeleton variant="text" width="60%" height={30} />
              ) : (
                <Typography variant="body1">{userDetails?.data?.name || 'N/A'}</Typography>
              )}
            </Box>

            <hr />

            {/* LinkedIn URL */}
            <Box sx={{ my: 3 }}>
              <Typography mb={1.5} sx={{ fontSize: '16px', fontWeight: 500 }}>
                LinkedIn URL
              </Typography>
              {loading ? (
                <Skeleton variant="text" width="80%" height={30} />
              ) : (
                <Typography variant="body1">{userDetails?.data?.linkedInUrl || 'N/A'}</Typography>
              )}
            </Box>

            <hr />

            {/* Last Login */}
            <Box sx={{ my: 3 }}>
              <Typography mb={1.5} sx={{ fontSize: '16px', fontWeight: 500 }}>
                Last Login
              </Typography>
              {loading ? (
                <Skeleton variant="text" width="50%" height={30} />
              ) : (
                <Typography variant="body1">
                  {userDetails?.data?.lastLogin 
                    ? new Date(userDetails.data.lastLogin).toLocaleString() 
                    : 'N/A'}
                </Typography>
              )}
            </Box>

            <hr />

            {/* Signout Button */}
            <Box sx={{ textAlign: 'start', mt: 3 }}>
              <Button 
                variant="outlined" 
                color="secondary" 
                onClick={handleSignOut} 
                disabled={loggingOut}
                sx={{ textTransform: 'none' }}
              >
                {loggingOut ? "Logging out..." : "Log Out"}
              </Button>
            </Box>
          </Box>
        </Grid>
      </Grid>

      <ToastContainer autoClose={2000} />
    </>
  );
}

export default Profile;
import { useState, useEffect } from "react";
import {
  Button,
  Typography,
  Grid,
  Stack,
  Box,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  DialogActions,
  CircularProgress,
  ClickAwayListener,
  Avatar,
  Alert,
  Card,
  CardContent,
  Chip,
  Divider,
  IconButton,
  LinearProgress,
  Tooltip
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { logout } from "../../store/professionalSlice";
import { useDispatch } from "react-redux";
import LogoutIcon from "@mui/icons-material/Logout";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import LinkOffOutlinedIcon from "@mui/icons-material/LinkOffOutlined";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import InstagramIcon from "@mui/icons-material/Instagram";
import WorkspacePremiumIcon from "@mui/icons-material/WorkspacePremium";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import MessageIcon from "@mui/icons-material/Message";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";

const AccountDetailsPage1 = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [deleteRequestLoading, setDeleteRequestLoading] = useState(false);
  const [deleteCodeLoading, setDeleteCodeLoading] = useState(false);
  const [userDetails, setUserDetails] = useState({});
  const [deleteAccountDialog, setDeleteAccountDialog] = useState(false);
  const [enterCodeDialog, setEnterCodeDialog] = useState(false);
  const [emailCode, setEmailCode] = useState("");

  // DMs usage state
  const [dmsUsage, setDmsUsage] = useState({ total_dms_sent: 0, dms_plan_limit: 0 });
  const [dmsUsageLoading, setDmsUsageLoading] = useState(true);

  // Instagram state
  const [igLoading, setIgLoading] = useState(false);
  const [igUnlinkLoading, setIgUnlinkLoading] = useState(false);
  const [igDialogOpen, setIgDialogOpen] = useState(false);
  const [subscriptionDet, setSubscriptionDet] = useState({});
  const [instagram, setInstagram] = useState({
    connected: false,
    username: "",
    imageUrl: "",
  });

  const baseUrl = "/api/usersOn";
  // const baseUrl="/api/usersOn";

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isTablet = useMediaQuery(theme.breakpoints.down("md"));

  const formatISTDate = (isoString) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    const istDate = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
    const dd = String(istDate.getDate()).padStart(2, "0");
    const mm = String(istDate.getMonth() + 1).padStart(2, "0");
    const yyyy = istDate.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  };

  const handleClickAway = () => {};

  const handleSignOut = async () => {
    try {
      await axios.post(baseUrl + "/logout", {}, { withCredentials: true });
      dispatch(logout());
      window.location.href = "/professional/login";
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleDialogAccountDeleteClose = () => {
    setDeleteAccountDialog(false);
  };

  const checkPin = async (e) => {
    e.preventDefault();
    setDeleteCodeLoading(true);

    if (!emailCode) {
      toast.warning("Enter valid 6-digit Pin");
      setDeleteCodeLoading(false);
    } else {
      await axios
        .post(
          baseUrl + "/check-deleteCode-withDb",
          { pin: emailCode },
          { withCredentials: true }
        )
        .then((res) => {
          if (!res.data.matching) {
            setDeleteCodeLoading(false);
            toast.error("Invalid Code");
          } else if (res.data.matching) {
            setDeleteCodeLoading(false);
            toast.success("Account and data has been deleted successfully!");
            dispatch(logout());
            setTimeout(() => {
              navigate("/");
            }, 2500);
          }
        })
        .catch((err) => {
          setDeleteCodeLoading(false);
          if (err.response && err.response.data.error === "User does not exists!") {
            toast.warning("User does not exists");
          } else if (err.response && err.response.data.error === "email, password mismatch") {
            toast.warning("Invalid email or password");
          } else {
            toast.error("An error occurred. Please try again later.");
          }
        });
    }
  };

  const deleteAccount = async (e) => {
    e.preventDefault();
    setDeleteRequestLoading(true);

    try {
      const res = await axios.post(
        `${baseUrl}/delete-account-permanently-with-code`,
        {},
        { withCredentials: true }
      );

      if (res.data?.emailSent) {
        toast.success("Code sent to your email");
        setDeleteRequestLoading(false);
        setEnterCodeDialog(true);
      } else {
        setDeleteRequestLoading(false);
        toast.error("Technical error. Try again.");
      }
    } catch (err) {
      if (err.response) {
        const { error } = err.response.data;
        if (error === "User does not exist") {
          setDeleteRequestLoading(false);
          toast.warning("User does not exist");
        } else {
          setDeleteRequestLoading(false);
          toast.error(error || "Something went wrong. Try again.");
        }
      } else {
        setDeleteRequestLoading(false);
        toast.error("Network error. Please try again.");
      }
    }
  };

  const handleSessionExpired = () => {
    toast.error("Session expired. Please log in again.");
    setTimeout(() => {
      navigate("/professional/login");
    }, 2000);
  };

  const fetchData = async () => {
    try {
      await axios
        .get(baseUrl + "/get-user-details", { withCredentials: true })
        .then((ress) => {
          if (ress.data.success) {
            setUserDetails(ress.data.data);
          } else {
            setLoading(false);
            toast.error("Session expired. Please log in again.");
            setTimeout(() => {
              navigate("/professional/login");
            }, 2000);
          }
        })
        .catch(() => {});
    } catch (error) {
      setLoading(false);
      toast.error("Network error. Please log in again.");
      setTimeout(() => {
        navigate("/professional/login");
      }, 2000);
    }
  };

  const fetchSubscriptionDetails = async () => {
    setSubscriptionLoading(true);
    try {
      const res = await axios.get(
        `${baseUrl}/subscription/details`,
        { withCredentials: true }
      );

      if (res.data?.success) {
        setSubscriptionDet(res.data.response || {});
      } else {
        handleSessionExpired();
      }
    } catch (e) {
      handleSessionExpired();
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const fetchDmsUsage = async () => {
    setDmsUsageLoading(true);
    try {
      const res = await axios.get(`${baseUrl}/dms-usage/current`, {
        withCredentials: true,
      });
      if (res.data?.success) {
        setDmsUsage(res.data.data);
      }
    } catch (e) {
      console.error("Error fetching DMs usage:", e);
    } finally {
      setDmsUsageLoading(false);
    }
  };

  const fetchInstagramDetails = async () => {
    setIgLoading(true);
    try {
      const res = await axios.post(
        `${baseUrl}/instagram/get-details`,
        {},
        { withCredentials: true }
      );

      if (res.data?.success) {
        const data = res.data.data || {};
        setInstagram({
          connected: !!data.connected,
          username: data.username || "",
          imageUrl: data.imageUrl || "",
        });
        await fetchSubscriptionDetails();
      } else {
        setInstagram((prev) => ({ ...prev, connected: false }));
      }
    } catch (e) {
      setInstagram((prev) => ({ ...prev, connected: false }));
    } finally {
      setIgLoading(false);
    }
  };

  useEffect(() => {
    const verifyToken = async () => {
      setLoading(true);

      try {
        const res = await axios.get(`${baseUrl}/verify-login-token`, { withCredentials: true });

        if (res.data.valid) {
          fetchData();
          fetchInstagramDetails();
          fetchDmsUsage();
        } else {
          handleSessionExpired();
        }
      } catch (error) {
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
          handleSessionExpired();
        } else {
          toast.error("Network error, please try again later.");
          handleSessionExpired();
        }
      } finally {
        setLoading(false);
      }
    };

    verifyToken();
  }, []);

  const handleOpenUnlinkDialog = () => setIgDialogOpen(true);
  const handleCloseUnlinkDialog = () => setIgDialogOpen(false);

  const handleUnlinkInstagram = async () => {
    setIgUnlinkLoading(true);
    try {
      const res = await axios.post(
        `${baseUrl}/instagram/unlink`,
        {},
        { withCredentials: true }
      );

      if (res.data?.success) {
        toast.success("Instagram account has been unlinked.");
        setInstagram({ connected: false, username: "", imageUrl: "" });
      } else {
        toast.error(res.data?.message || "Failed to unlink Instagram.");
      }
    } catch (e) {
      toast.error("Network error unlinking Instagram.");
    } finally {
      setIgUnlinkLoading(false);
      setIgDialogOpen(false);
    }
  };

  const handleConnectInstagram = () => {
    navigate("/professional/automations");
  };

  // Calculate usage percentages
  const leadsUsagePercent = subscriptionDet.leads_plan_limit 
    ? ((subscriptionDet.leads_found) / subscriptionDet.leads_plan_limit) * 100 
    : 0;
  
  const dmsUsagePercent = dmsUsage.dms_plan_limit
    ? (dmsUsage.total_dms_sent / dmsUsage.dms_plan_limit) * 100
    : 0;

  return (
    <Box sx={{ 
      maxWidth: 1200, 
      mx: "auto", 
      px: { xs: 2, sm: 3, md: 4 }, 
      py: { xs: 3, md: 4 },
      fontFamily: 'Inter, sans-serif'
    }}>
      {/* Header Section */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" sx={{ 
          fontWeight: 600, 
          mb: 1, 
          color: "#1a1a1a",
          fontFamily: 'Inter, sans-serif',
          fontSize: { xs: '1.25rem', sm: '1.5rem', md: '1.75rem' }
        }}>
          Account Settings
        </Typography>
        <Typography variant="body2" sx={{ 
          color: "text.secondary",
          fontFamily: 'Inter, sans-serif',
          fontSize: { xs: '0.813rem', sm: '0.875rem' }
        }}>
          Manage your profile, subscription, and integrations
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {/* Left Column - Profile & Instagram */}
        <Grid size={{ xs: 12, md: 7}}>
          {/* Profile Information Card */}
          <Card sx={{ mb: 3, boxShadow: "0 2px 8px rgba(0,0,0,0.08)", border: "1px solid #f0f0f0" }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ 
                mb: 3, 
                fontWeight: 600, 
                color: "#1a1a1a",
                fontFamily: 'Inter, sans-serif',
                fontSize: { xs: '1rem', sm: '1.125rem', md: '1.25rem' }
              }}>
                Profile Information
              </Typography>

              {/* Name */}
              <Box sx={{ mb: 3 }}>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
                  <PersonOutlineIcon sx={{ fontSize: { xs: 18, sm: 20 }, color: "text.secondary" }} />
                  <Typography variant="body2" sx={{ 
                    fontWeight: 500, 
                    color: "text.secondary",
                    fontFamily: 'Inter, sans-serif',
                    fontSize: { xs: '0.813rem', sm: '0.875rem' }
                  }}>
                    Full Name
                  </Typography>
                </Stack>
                {loading ? (
                  <Skeleton variant="text" width="60%" height={32} />
                ) : (
                  <Typography variant="body1" sx={{ 
                    ml: 4.5, 
                    fontWeight: 500, 
                    color: "#1a1a1a",
                    fontFamily: 'Inter, sans-serif',
                    fontSize: { xs: '0.938rem', sm: '1rem' }
                  }}>
                    {userDetails.name}
                  </Typography>
                )}
              </Box>

              <Divider sx={{ my: 2.5 }} />

              {/* Email */}
              <Box>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
                  <EmailOutlinedIcon sx={{ fontSize: { xs: 18, sm: 20 }, color: "text.secondary" }} />
                  <Typography variant="body2" sx={{ 
                    fontWeight: 500, 
                    color: "text.secondary",
                    fontFamily: 'Inter, sans-serif',
                    fontSize: { xs: '0.813rem', sm: '0.875rem' }
                  }}>
                    Email Address
                  </Typography>
                </Stack>
                {loading ? (
                  <Skeleton variant="text" width="70%" height={32} />
                ) : (
                  <Typography variant="body1" sx={{ 
                    ml: 4.5, 
                    fontWeight: 500, 
                    color: "#1a1a1a",
                    fontFamily: 'Inter, sans-serif',
                    fontSize: { xs: '0.938rem', sm: '1rem' }
                  }}>
                    {userDetails.email}
                  </Typography>
                )}
              </Box>
            </CardContent>
          </Card>

          {/* Instagram Integration Card */}
          <Card sx={{ boxShadow: "0 2px 8px rgba(0,0,0,0.08)", border: "1px solid #f0f0f0" }}>
            <CardContent sx={{ p: 3 }}>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2.5 }}>
                <InstagramIcon sx={{ fontSize: { xs: 22, sm: 24 }, color: "#E4405F" }} />
                <Typography variant="h6" sx={{ 
                  fontWeight: 600, 
                  color: "#1a1a1a",
                  fontFamily: 'Inter, sans-serif',
                  fontSize: { xs: '1rem', sm: '1.125rem', md: '1.25rem' }
                }}>
                  Instagram Connection
                </Typography>
              </Stack>

              {igLoading ? (
                <Skeleton variant="rectangular" height={80} sx={{ borderRadius: 2 }} />
              ) : instagram.connected ? (
                <Box sx={{ 
                  bgcolor: "#f8f9fa", 
                  borderRadius: 2, 
                  p: 2.5,
                  border: "1px solid #e9ecef"
                }}>
                  <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Avatar
                        src={instagram.imageUrl || ""}
                        alt={instagram.username || "Instagram"}
                        sx={{ width: { xs: 40, sm: 48 }, height: { xs: 40, sm: 48 } }}
                      />
                      <Box>
                        <Typography variant="body1" sx={{ 
                          fontWeight: 600, 
                          color: "#1a1a1a",
                          fontFamily: 'Inter, sans-serif',
                          fontSize: { xs: '0.938rem', sm: '1rem' }
                        }}>
                          @{instagram.username || "connected_user"}
                        </Typography>
                        <Chip 
                          label="Connected" 
                          size="small" 
                          sx={{ 
                            bgcolor: "#d4edda", 
                            color: "#155724",
                            fontWeight: 500,
                            height: 22,
                            fontFamily: 'Inter, sans-serif',
                            fontSize: { xs: '0.688rem', sm: '0.75rem' }
                          }} 
                        />
                      </Box>
                    </Stack>

                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<LinkOffOutlinedIcon />}
                      onClick={handleOpenUnlinkDialog}
                      sx={{ 
                        textTransform: "none",
                        borderColor: "#dc3545",
                        color: "#dc3545",
                        fontFamily: 'Inter, sans-serif',
                        fontSize: { xs: '0.813rem', sm: '0.875rem' },
                        "&:hover": {
                          borderColor: "#c82333",
                          bgcolor: "#fff5f5"
                        }
                      }}
                    >
                      Unlink
                    </Button>
                  </Stack>
                </Box>
              ) : (
                <Box sx={{ 
                  bgcolor: "#fff9f0", 
                  borderRadius: 2, 
                  p: 2.5,
                  border: "1px dashed #ffc107"
                }}>
                  <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
                    <Typography variant="body2" sx={{ 
                      color: "text.secondary",
                      fontFamily: 'Inter, sans-serif',
                      fontSize: { xs: '0.813rem', sm: '0.875rem' }
                    }}>
                      Connect your Instagram account to enable automations
                    </Typography>
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={<LinkOutlinedIcon />}
                      onClick={handleConnectInstagram}
                      sx={{ 
                        textTransform: "none",
                        px: 3,
                        bgcolor: "#E4405F",
                        fontFamily: 'Inter, sans-serif',
                        fontSize: { xs: '0.813rem', sm: '0.875rem' },
                        "&:hover": {
                          bgcolor: "#d6355a"
                        }
                      }}
                    >
                      Connect
                    </Button>
                  </Stack>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Right Column - Subscription */}
        <Grid size={{ xs: 12, md: 5}}>
          <Card sx={{ boxShadow: "0 2px 8px rgba(0,0,0,0.08)", border: "1px solid #f0f0f0" }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
                <WorkspacePremiumIcon sx={{ fontSize: { xs: 20, sm: 24 }, color: "#6366f1" }} />
                <Typography variant="h6" sx={{ 
                  fontWeight: 600, 
                  color: "#1a1a1a",
                  fontFamily: 'Inter, sans-serif',
                  fontSize: { xs: '1rem', sm: '1.125rem', md: '1.25rem' }
                }}>
                  Subscription Plan
                </Typography>
              </Stack>

              {subscriptionLoading ? (
                <Stack spacing={2}>
                  <Skeleton height={40} />
                  <Skeleton height={80} />
                  <Skeleton height={80} />
                  <Skeleton height={40} />
                </Stack>
              ) : (
                <>
                  <Box sx={{ 
                    bgcolor: "#f8f9fa", 
                    borderRadius: 2, 
                    p: { xs: 2, sm: 2.5 }, 
                    mb: 3,
                    border: "1px solid #e9ecef"
                  }}>
                    <Typography variant="h5" sx={{ 
                      fontWeight: 700, 
                      textTransform: "capitalize",
                      color: "#6366f1",
                      mb: 0.5,
                      fontFamily: 'Inter, sans-serif',
                      fontSize: { xs: '1.25rem', sm: '1.5rem' }
                    }}>
                      {subscriptionDet.subscription_plan || "Free"}
                    </Typography>
                    <Typography variant="caption" sx={{ 
                      color: "text.secondary",
                      fontFamily: 'Inter, sans-serif',
                      fontSize: { xs: '0.688rem', sm: '0.75rem' }
                    }}>
                      Current Plan
                    </Typography>
                  </Box>

                  {/* Leads Usage */}
                  <Box sx={{ mb: 3 }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                      <TrendingUpIcon sx={{ fontSize: { xs: 16, sm: 18 }, color: "#10b981" }} />
                      <Typography variant="body2" sx={{ 
                        fontWeight: 600, 
                        color: "#1a1a1a",
                        fontFamily: 'Inter, sans-serif',
                        fontSize: { xs: '0.813rem', sm: '0.875rem' }
                      }}>
                        Leads Usage
                      </Typography>
                    </Stack>
                    <Box sx={{ bgcolor: "#f8f9fa", borderRadius: 1.5, p: { xs: 1.5, sm: 2 } }}>
                      <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                        <Typography variant="body2" sx={{ 
                          color: "text.secondary",
                          fontFamily: 'Inter, sans-serif',
                          fontSize: { xs: '0.75rem', sm: '0.875rem' }
                        }}>
                          Used
                        </Typography>
                        <Typography variant="body2" sx={{ 
                          fontWeight: 600,
                          fontFamily: 'Inter, sans-serif',
                          fontSize: { xs: '0.75rem', sm: '0.875rem' }
                        }}>
                          {(subscriptionDet.leads_found) || 0} / {subscriptionDet.leads_plan_limit || 0}
                        </Typography>
                      </Stack>
                      <LinearProgress 
                        variant="determinate" 
                        value={leadsUsagePercent} 
                        sx={{ 
                          height: { xs: 6, sm: 8 }, 
                          borderRadius: 4,
                          bgcolor: "#e9ecef",
                          "& .MuiLinearProgress-bar": {
                            bgcolor: leadsUsagePercent > 80 ? "#ef4444" : "#10b981",
                            borderRadius: 4
                          }
                        }} 
                      />
                    </Box>
                  </Box>

                  {/* DMs Usage */}
                  <Box sx={{ mb: 3 }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                      <MessageIcon sx={{ fontSize: { xs: 16, sm: 18 }, color: "#3b82f6" }} />
                      <Typography variant="body2" sx={{
                        fontWeight: 600,
                        color: "#1a1a1a",
                        fontFamily: 'Inter, sans-serif',
                        fontSize: { xs: '0.813rem', sm: '0.875rem' }
                      }}>
                        DMs Usage
                      </Typography>
                    </Stack>
                    {dmsUsageLoading ? (
                      <Skeleton height={60} sx={{ borderRadius: 1.5 }} />
                    ) : (
                    <Box sx={{ bgcolor: "#f8f9fa", borderRadius: 1.5, p: { xs: 1.5, sm: 2 } }}>
                      <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                        <Typography variant="body2" sx={{
                          color: "text.secondary",
                          fontFamily: 'Inter, sans-serif',
                          fontSize: { xs: '0.75rem', sm: '0.875rem' }
                        }}>
                          Sent
                        </Typography>
                        <Typography variant="body2" sx={{
                          fontWeight: 600,
                          fontFamily: 'Inter, sans-serif',
                          fontSize: { xs: '0.75rem', sm: '0.875rem' }
                        }}>
                          {dmsUsage.total_dms_sent} / {subscriptionDet.subscription_plan === 'free' ? dmsUsage.dms_plan_limit : 'Unlimited'}
                        </Typography>
                      </Stack>
                      {subscriptionDet.subscription_plan === 'free' && (
                        <LinearProgress
                          variant="determinate"
                          value={dmsUsagePercent}
                          sx={{
                            height: { xs: 6, sm: 8 },
                            borderRadius: 4,
                            bgcolor: "#e9ecef",
                            "& .MuiLinearProgress-bar": {
                              bgcolor: dmsUsagePercent > 80 ? "#ef4444" : "#3b82f6",
                              borderRadius: 4
                            }
                          }}
                        />
                      )}
                    </Box>
                    )}
                  </Box>

                  {subscriptionDet.subscription_plan === 'creator' ? (
                    <Tooltip
                      title="More Plans are coming soon!"
                      arrow
                      disableHoverListener={isMobile}
                      disableFocusListener={isMobile}
                    >
                      <span style={{ width: '100%' }}>
                        <Button
                          variant="contained"
                          fullWidth
                          disabled
                          onClick={() => {
                            if (isMobile) {
                              toast.info("More Plans are coming soon!");
                            }
                          }}
                          sx={{
                            textTransform: "none",
                            py: { xs: 1.25, sm: 1.5 },
                            fontWeight: 600,
                            fontFamily: 'Inter, sans-serif',
                            fontSize: { xs: '0.875rem', sm: '1rem' },
                            pointerEvents: "auto"
                          }}
                        >
                          Upgrade Plan
                        </Button>
                      </span>
                    </Tooltip>
                  ) : (
                    <Button
                      variant="contained"
                      fullWidth
                      onClick={() => navigate("/professional/upgrade/plan")}
                      sx={{
                        textTransform: "none",
                        py: { xs: 1.25, sm: 1.5 },
                        fontWeight: 600,
                        fontFamily: 'Inter, sans-serif',
                        fontSize: { xs: '0.875rem', sm: '1rem' },
                        bgcolor: "#6366f1",
                        "&:hover": {
                          bgcolor: "#4f46e5"
                        }
                      }}
                    >
                      Upgrade Plan
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Actions Card */}
          <Card sx={{ mt: 3, boxShadow: "0 2px 8px rgba(0,0,0,0.08)", border: "1px solid #f0f0f0" }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Typography variant="h6" sx={{ 
                mb: 2.5, 
                fontWeight: 600, 
                color: "#1a1a1a",
                fontFamily: 'Inter, sans-serif',
                fontSize: { xs: '1rem', sm: '1.125rem', md: '1.25rem' }
              }}>
                Account Actions
              </Typography>
              
              <Button
                variant="outlined"
                fullWidth
                startIcon={<LogoutIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />}
                onClick={handleSignOut}
                sx={{ 
                  textTransform: "none",
                  py: { xs: 1, sm: 1.25 },
                  fontFamily: 'Inter, sans-serif',
                  fontSize: { xs: '0.875rem', sm: '1rem' },
                  borderColor: "#6b7280",
                  color: "#6b7280",
                  "&:hover": {
                    borderColor: "#4b5563",
                    bgcolor: "#f9fafb"
                  }
                }}
              >
                Sign Out
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

   

      {/* Instagram Unlink Dialog */}
      <Dialog
        open={igDialogOpen}
        onClose={handleCloseUnlinkDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 2 }
        }}
      >
        <DialogTitle sx={{ pb: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Box sx={{ 
              bgcolor: "#fee", 
              p: 1, 
              borderRadius: 1.5,
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <LinkOffOutlinedIcon sx={{ fontSize: 24, color: "#dc3545" }} />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Unlink Instagram?
            </Typography>
          </Stack>
        </DialogTitle>
        <DialogContent>
          {igUnlinkLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              <Typography sx={{ mb: 2 }}>
                You're about to disconnect <strong>@{instagram.username || "your_instagram"}</strong>. You can reconnect anytime.
              </Typography>
              <Alert severity="warning" variant="outlined">
                Disconnecting will immediately stop Lead detection, All Instagram automations (Comment & DM responders).
              </Alert>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 2 }}>
          <Button
            onClick={handleCloseUnlinkDialog}
            variant="outlined"
            sx={{ textTransform: "none" }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleUnlinkInstagram}
            variant="contained"
            disabled={igUnlinkLoading}
            sx={{ 
              textTransform: "none",
              bgcolor: "#dc3545",
              "&:hover": {
                bgcolor: "#c82333"
              }
            }}
          >
            {igUnlinkLoading ? "Disconnecting..." : "Disconnect"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Account Dialog */}
      {deleteAccountDialog && (
        <Dialog
          open={deleteAccountDialog}
          onClose={handleDialogAccountDeleteClose}
          maxWidth="sm"
          fullWidth
          PaperProps={{
            sx: { borderRadius: 2 }
          }}
        >
          <DialogTitle sx={{ pb: 2 }}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Box sx={{ 
                bgcolor: "#fee", 
                p: 1, 
                borderRadius: 1.5,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}>
                <DeleteOutlineOutlinedIcon sx={{ fontSize: 24, color: "#dc3545" }} />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Delete Account?
              </Typography>
            </Stack>
          </DialogTitle>
          <DialogContent>
            {deleteRequestLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                <CircularProgress />
              </Box>
            ) : (
              <>
                <Typography sx={{ mb: 2 }}>
                  All your data and account will be deleted permanently. This action cannot be undone.
                </Typography>
                <Alert severity="info" variant="outlined">
                  A delete code will be sent to: <strong>{userDetails.email}</strong>
                </Alert>
              </>
            )}
          </DialogContent>
          <DialogActions sx={{ p: 3, pt: 2 }}>
            <Button
              onClick={() => setDeleteAccountDialog(false)}
              variant="outlined"
              sx={{ textTransform: "none" }}
            >
              Cancel
            </Button>
            <Button
              onClick={deleteAccount}
              variant="contained"
              sx={{ 
                textTransform: "none",
                bgcolor: "#dc3545",
                "&:hover": {
                  bgcolor: "#c82333"
                }
              }}
            >
              Proceed
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Enter Code Dialog */}
      {enterCodeDialog && (
        <ClickAwayListener onClickAway={handleClickAway}>
          <Dialog
            open={enterCodeDialog}
            onClose={handleDialogAccountDeleteClose}
            maxWidth="sm"
            fullWidth
            PaperProps={{
              sx: { borderRadius: 2 }
            }}
          >
            <DialogTitle>Delete Confirmation</DialogTitle>
            <DialogContent>
              {deleteCodeLoading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                  <CircularProgress />
                </Box>
              ) : (
                <>
                  <Typography sx={{ mb: 2 }}>
                    Enter the 6-digit code sent to <strong>{userDetails.email}</strong>
                  </Typography>
                  <TextField
                    fullWidth
                    type="text"
                    label="6-digit code"
                    value={emailCode}
                    onChange={(e) => setEmailCode(e.target.value)}
                    variant="outlined"
                  />
                </>
              )}
            </DialogContent>
            <DialogActions sx={{ p: 3, pt: 2 }}>
              <Button
                onClick={() => setEnterCodeDialog(false)}
                variant="outlined"
                sx={{ textTransform: "none" }}
              >
                Cancel
              </Button>
              <Button
                onClick={checkPin}
                variant="contained"
                sx={{ 
                  textTransform: "none",
                  bgcolor: "#dc3545",
                  "&:hover": {
                    bgcolor: "#c82333"
                  }
                }}
              >
                Submit
              </Button>
            </DialogActions>
          </Dialog>
        </ClickAwayListener>
      )}
    </Box>
  );
};

export default AccountDetailsPage1;
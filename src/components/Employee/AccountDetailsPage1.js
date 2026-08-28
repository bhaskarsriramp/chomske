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
  Alert
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
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";

const AccountDetailsPage1 = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  // Delete account flows
  const [deleteRequestLoading, setDeleteRequestLoading] = useState(false);
  const [deleteCodeLoading, setDeleteCodeLoading] = useState(false);
  const [userDetails, setUserDetails] = useState({});
  const [deleteAccountDialog, setDeleteAccountDialog] = useState(false);
  const [enterCodeDialog, setEnterCodeDialog] = useState(false);
  const [emailCode, setEmailCode] = useState("");

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

  // const baseUrl = "http://localhost:8001/usersOn";
  const baseUrl="/api/usersOn";

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const formatISTDate = (isoString) => {
  if (!isoString) return "";

  const date = new Date(isoString);

  // Convert to IST manually (UTC + 5:30)
  const istDate = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);

  const dd = String(istDate.getDate()).padStart(2, "0");
  const mm = String(istDate.getMonth() + 1).padStart(2, "0");
  const yyyy = istDate.getFullYear();

  return `${dd}-${mm}-${yyyy}`;
};


  const handleClickAway = () => {
    //this function keeps the dialogue open, even when user clicks outside the dialogue. dont delete this function
  };

  const handleSignOut = async () => {
    try {
      await axios.post(baseUrl + "/logout", {}, { withCredentials: true });
      dispatch(logout()); // Clear Redux state
      window.location.href = "/professional/login"; // Ensures full logout
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
            dispatch(logout()); // Clear Redux state

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
    setIgLoading(true);
    try {
      // Backend should respond with: { success: true, data: { connected: boolean, username: string, imageUrl: string } }
      const res = await axios.get(
        `${baseUrl}/subscription/details`,
        { withCredentials: true }
      );

      if (res.data?.success) {
        const data = res.data.response || {};
        setSubscriptionDet(data);
      } else {
            setLoading(false);
            toast.error("Session expired. Please log in again.");
            setTimeout(() => {
              navigate("/professional/login");
            }, 2000);
          }
    } catch (e) {
      // If it fails, assume disconnected (don't block page)
     setLoading(false);
      toast.error("Network error. Please log in again.");
      setTimeout(() => {
        navigate("/professional/login");
      }, 2000);
    } finally {
      setIgLoading(false);
    }
  };

  // ============== Instagram: get details (username, imageUrl, status) ==============
  const fetchInstagramDetails = async () => {
    setIgLoading(true);
    try {
      // Backend should respond with: { success: true, data: { connected: boolean, username: string, imageUrl: string } }
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
      // If it fails, assume disconnected (don't block page)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============== Instagram: unlink ==============
  const handleOpenUnlinkDialog = () => setIgDialogOpen(true);
  const handleCloseUnlinkDialog = () => setIgDialogOpen(false);

  const handleUnlinkInstagram = async () => {
    setIgUnlinkLoading(true);
    try {
      // Backend should set instagramConnected:false and unlink tokens/sessions if any
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

  // Connect instagram (front-end redirect)
  const handleConnectInstagram = () => {
    // Replace with your real connect route/page
    navigate("/connect-instagram");
  };

  // Small reusable IG block
  const InstagramBlock = () => {
    if (igLoading) {
      return (
        <Grid
          container
          fullWidth
          sx={{ borderStyle: "solid", borderWidth: "1px", borderColor: "#BCCCDC", mb: "22px", py: "12px", px: "12px" }}
        >
          <Grid size={{ md: 4 }}>
            <Typography sx={{ fontSize: "14px", fontWeight: "500" }}>Instagram</Typography>
          </Grid>
          <Grid size={{ md: 8 }}>
            <Skeleton variant="rectangular" width={320} height={24} />
          </Grid>
        </Grid>
      );
    }

    // Connected state
    if (instagram.connected) {
      return (
        <Grid
          container
          fullWidth
          sx={{
            borderStyle: "solid",
            borderWidth: "1px",
            borderColor: "#BCCCDC",
            mb: "22px",
            py: "12px",
            px: "12px",
            alignItems: "center",
          }}
        >
          <Grid size={{ md: 4 }}>
            <Typography sx={{ fontSize: "14px", fontWeight: "500" }}>Instagram</Typography>
          </Grid>

          <Grid size={{ md: 8 }}>
            <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Avatar
                  src={instagram.imageUrl || ""}
                  alt={instagram.username || "Instagram"}
                  sx={{ width: 36, height: 36 }}
                />
                <Box>
                  <Typography sx={{ fontSize: "14px", fontWeight: 500 }}>
                    @{instagram.username || "connected_user"}
                  </Typography>
                  <Typography sx={{ fontSize: "12px", color: "grey" }}>Connected</Typography>
                </Box>
              </Stack>

              <Button
                variant="outlined"
                startIcon={<LinkOffOutlinedIcon />}
                sx={{ textTransform: "none" }}
                onClick={handleOpenUnlinkDialog}
              >
                Unlink Instagram
              </Button>
            </Stack>
          </Grid>
        </Grid>
      );
    }

    // Not connected state
    return (
      <Grid
        container
        fullWidth
        sx={{
          borderStyle: "solid",
          borderWidth: "1px",
          borderColor: "#BCCCDC",
          mb: "22px",
          py: "12px",
          px: "12px",
          alignItems: "center",
        }}
      >
        <Grid size={{ md: 4 }}>
          <Typography sx={{ fontSize: "14px", fontWeight: "500" }}>Instagram</Typography>
        </Grid>

        <Grid size={{ md: 8 }}>
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
            <Typography sx={{ fontSize: "14px", color: "grey" }}>
              Link Instagram Account.
            </Typography>

            <Button
              variant="contained"
              startIcon={<LinkOutlinedIcon />}
              sx={{ textTransform: "none" }}
              onClick={()=> navigate('/professional/automations')}
            >
              Connect Instagram
            </Button>
          </Stack>
        </Grid>
      </Grid>
    );
  };

  // Mobile version IG block
  const MobileInstagramBlock = () => {
    if (igLoading) {
      return <Skeleton variant="rectangular" height={48} />;
    }

    if (instagram.connected) {
      return (
        <Box
          sx={{
            border: "1px solid #BCCCDC",
            borderRadius: "6px",
            p: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1.5,
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar
              src={instagram.imageUrl || ""}
              alt={instagram.username || "Instagram"}
              sx={{ width: 32, height: 32 }}
            />
            <Box>
              <Typography sx={{ fontSize: "14px", fontWeight: 500 }}>
                @{instagram.username || "connected_user"}
              </Typography>
              <Typography sx={{ fontSize: "12px", color: "grey" }}>Connected</Typography>
            </Box>
          </Stack>

          <Button
            size="small"
            variant="outlined"
            startIcon={<LinkOffOutlinedIcon />}
            sx={{ textTransform: "none" }}
            onClick={handleOpenUnlinkDialog}
          >
            Disconnect
          </Button>
        </Box>
      );
    }

    return (
      <Box
        sx={{
          border: "1px solid #BCCCDC",
          borderRadius: "6px",
          p: 1.25,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1.5,
        }}
      >
        <Typography sx={{ fontSize: "14px", color: "grey" }}>
          Link Instagram Account.
        </Typography>

        <Button
          size="small"
          variant="contained"
          startIcon={<LinkOutlinedIcon />}
          sx={{ textTransform: "none" }}
          onClick={handleConnectInstagram}
        >
          Connect
        </Button>
      </Box>
    );
  };

  return (
    <>
      <>
        {isMobile ? (
          <>
            <Stack sx={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Instagram (mobile) */}
         
              <Box sx={{ display: "flex", flexDirection: "column", gap: "4px", py: "4px" }}>
                <Typography sx={{ fontSize: "14px", fontWeight: "500" }}>Name</Typography>

                {loading ? (
                  <Skeleton variant="rectangular" height={20} />
                ) : (
                  <Typography sx={{ fontSize: "14px", fontWeight: "400" }}>
                    {userDetails.name}
                  </Typography>


                )}
              </Box>

               <Box sx={{ display: "flex", flexDirection: "column", gap: "4px", py: "4px" }}>
                <Typography sx={{ fontSize: "14px", fontWeight: "500" }}>Email</Typography>

                {loading ? (
                  <Skeleton variant="rectangular" height={20} />
                ) : (
                  <Typography sx={{ fontSize: "14px", fontWeight: "400" }}>
                    {userDetails.email}
                  </Typography>
                )}
              </Box>

               <Box sx={{ display: "flex", flexDirection: "column", gap: "4px", py: "4px" }}>
                <Typography sx={{ fontSize: "14px", fontWeight: "500" }}>Subscription</Typography>

                {loading ? (
                  <Skeleton variant="rectangular" height={20} />
                ) : (
                  <Typography sx={{ fontSize: "14px", fontWeight: "400" }}>
                    {subscriptionDet.status === 'active' ? 'Active' : 'Free Trial'}
                  </Typography>


                )}
              </Box>

              {subscriptionDet?.freeTrial && (

               <Box sx={{ display: "flex", flexDirection: "column", gap: "4px", py: "4px" }}>
                <Typography sx={{ fontSize: "14px", fontWeight: "500" }}>Subscription</Typography>

                {loading ? (
                  <Skeleton variant="rectangular" height={20} />
                ) : (
                  <Typography sx={{ fontSize: "14px", fontWeight: "400" }}>
                    {subscriptionDet.status === 'active' ? 'Active' : 'Free Trial'}
                  </Typography>


                )}
              </Box>
              )}

                   <Box sx={{ display: "flex", flexDirection: "column", gap: "4px", py: "4px" }}>
                <Typography sx={{ fontSize: "14px", fontWeight: "500" }}>
                  Instagram
                </Typography>
                <MobileInstagramBlock />
              </Box>




            
              <div style={{ textAlign: "start" }}>
                <Button
                  startIcon={<LogoutIcon />}
                  sx={{ color: "grey", textTransform: "none" }}
                  variant="outlined"
                  color="warning"
                  onClick={handleSignOut}
                  size="small"
                >
                  Sign Out
                </Button>
              </div>

            
            </Stack>

          
          </>
        ) : (
          <>
          <Grid container mt={5}>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Typography sx={{ fontSize: "18px", fontWeight: "500" }}>
                Your Account
              </Typography>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 8 }}>
              {/* Instagram (desktop) */}
           

              <Grid
                container
                fullWidth
                sx={{
                  borderStyle: "solid",
                  borderWidth: "1px",
                  borderColor: "#BCCCDC",
                  marginBottom: "22px",
                  paddingY: "12px",
                  paddingX: "12px",
                }}
              >
                <Grid size={{ md: 4 }}>
                  <Typography sx={{ fontSize: "14px", fontWeight: "500" }}>Name</Typography>
                </Grid>

                <Grid size={{ md: 8 }}>
                  {loading ? (
                    <Skeleton variant="rectangular" width={300} height={20} />
                  ) : (
                    <Typography sx={{ fontSize: "14px", fontWeight: "400" }}>
                      {userDetails.name}
                    </Typography>
                  )}
                </Grid>
              </Grid>

              <Grid
                container
                fullWidth
                sx={{
                  borderStyle: "solid",
                  borderWidth: "1px",
                  borderColor: "#BCCCDC",
                  marginBottom: "22px",
                  paddingY: "12px",
                  paddingX: "12px",
                }}
              >
                <Grid size={{ md: 4 }}>
                  <Typography sx={{ fontSize: "14px", fontWeight: "500" }}>Email</Typography>
                </Grid>

                <Grid size={{ md: 8 }}>
                  {loading ? (
                    <Skeleton variant="rectangular" width={300} height={20} />
                  ) : (
                    <Typography sx={{ fontSize: "14px", fontWeight: "400" }}>
                      {userDetails.email}
                    </Typography>
                  )}
                </Grid>
              </Grid>

                 <InstagramBlock />

              <div style={{ textAlign: "start" }}>
                <Button
                  startIcon={<LogoutIcon />}
                  sx={{ color: "grey", textTransform: "none" }}
                  variant="outlined"
                  color="warning"
                  onClick={handleSignOut}
                >
                  Sign Out
                </Button>
              </div>
            </Grid>

          </Grid>

           <Grid container mt={5}>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Typography sx={{ fontSize: "18px", fontWeight: "500" }}>
                Subscriptions
              </Typography>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 8 }}>

              <Grid
                container
                fullWidth
                sx={{
                  borderStyle: "solid",
                  borderWidth: "1px",
                  borderColor: "#BCCCDC",
                  marginBottom: "22px",
                  paddingY: "12px",
                  paddingX: "12px",
                }}
              >
                <Grid size={{ md: 4 }}>
                  <Typography sx={{ fontSize: "14px", fontWeight: "500" }}>Status</Typography>
                </Grid>

                <Grid size={{ md: 8 }}>
                  {loading ? (
                    <Skeleton variant="rectangular" width={300} height={20} />
                  ) : (
                    <Typography sx={{ fontSize: "14px", fontWeight: "400" }}>
                      {subscriptionDet.status === 'active' ? 'Active' : 'Free Trial'}
                    </Typography>
                  )}
                </Grid>
              </Grid>
{subscriptionDet?.freeTrial && (
              <Grid
                container
                fullWidth
                sx={{
                  borderStyle: "solid",
                  borderWidth: "1px",
                  borderColor: "#BCCCDC",
                  marginBottom: "22px",
                  paddingY: "12px",
                  paddingX: "12px",
                }}
              >
                <Grid size={{ md: 4 }}>
                  <Typography sx={{ fontSize: "14px", fontWeight: "500" }}>Paid starts At</Typography>
                </Grid>

                <Grid size={{ md: 8 }}>
                  {loading ? (
                    <Skeleton variant="rectangular" width={300} height={20} />
                  ) : (
                    <Typography sx={{ fontSize: "14px", fontWeight: "400" }}>
                      {formatISTDate(subscriptionDet.subscription_starts_at)}

                    </Typography>
                  )}
                </Grid>
              </Grid>
)}

            
            </Grid>

            
          </Grid>
          </>
        )}
      </>

      {/* ===== IG Unlink Dialog ===== */}
      <Dialog
        open={igDialogOpen}
        onClose={handleCloseUnlinkDialog}
        disableEscapeKeyDown
        keepMounted
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          <Stack direction="row" gap={2} alignItems="center">
            <Box sx={{ backgroundColor: "#FFF3F3", px: "6px", py: "2px", borderRadius: "6px" }}>
              <LinkOffOutlinedIcon sx={{ fontSize: isMobile ? "20px" : "26px", color: "red" }} />
            </Box>
            <Typography sx={{ fontSize: isMobile ? "15px" : "16px", fontWeight: 500 }}>
              Unlink Instagram account?
            </Typography>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          {igUnlinkLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: 150 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
  <Typography sx={{ fontSize: isMobile ? "15px" : "16px", mt: "5px", mb: "10px" }}>
    You're about to disconnect <strong>@{instagram.username || "your_instagram"}</strong>.
    You can reconnect any time. Continue?
  </Typography>

  <Alert severity="warning" variant="outlined" sx={{ mt: 1.5 }}>
    Heads up: Unlinking Instagram account will immediately stop all your
    existing Instagram automations (Comment, DM responders, etc.).
   
  </Alert>

            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleCloseUnlinkDialog}
            sx={{ borderRadius: "18px", backgroundColor: "#EC5228", color: "#FFFFFF", px: 3, textTransform: "none" }}
          >
            Cancel
          </Button>
          <Button color="success" onClick={handleUnlinkInstagram} sx={{ textTransform: "none", fontFamily : 'Inter', fontWeight : 600 }} disabled={igUnlinkLoading}>
            {igUnlinkLoading ? "Unlinking..." : "Unlink"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===== Delete Account Dialogs (unchanged behaviour) ===== */}
      {deleteAccountDialog && (
        <Dialog
          open={deleteAccountDialog}
          onClose={handleDialogAccountDeleteClose}
          disableEscapeKeyDown
          keepMounted
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>
            <Stack sx={{ display: "flex", flexDirection: "row", gap: 2, alignItems: "center" }}>
              <Box
                sx={{
                  backgroundColor: "#F8E8EE",
                  px: "6px",
                  py: "2px",
                  borderRadius: "6px",
                  alignItems: "center",
                }}
              >
                <DeleteOutlineOutlinedIcon
                  sx={{ fontSize: isMobile ? "20px" : "26px", color: "red" }}
                />
              </Box>
              <Typography sx={{ fontSize: isMobile ? "15px" : "16px", fontWeight: 500 }}>
                Delete account & erase data ?
              </Typography>
            </Stack>
          </DialogTitle>
          <DialogContent dividers>
            {deleteRequestLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: 150 }}>
                <CircularProgress />
              </Box>
            ) : (
              <>
                <Typography sx={{ fontSize: isMobile ? "15px" : "16px", marginTop: "5px", marginBottom: "22px" }}>
                  All your data and account will be deleted permanently. This cannot be undone. Are
                  you sure you want to proceed?
                </Typography>

                <div style={{ display: "flex", flexDirection: "row", gap: "2%", alignItems: "center" }}>
                  <Typography sx={{ fontSize: "14px", fontWeight: "400", color: "grey" }}>
                    A delete code will be sent to your email address : {userDetails.email}
                  </Typography>
                </div>
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => setDeleteAccountDialog(false)}
              sx={{
                borderRadius: "18px",
                backgroundColor: "#EC5228",
                color: "#FFFFFF",
                px: 3,
                textTransform: "none",
              }}
            >
              Cancel
            </Button>
            <Button color="success" onClick={deleteAccount} sx={{ textTransform: "none" }}>
              Proceed
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {enterCodeDialog && (
        <ClickAwayListener onClickAway={handleClickAway}>
          <Dialog
            open={enterCodeDialog}
            onClose={handleDialogAccountDeleteClose}
            disableEscapeKeyDown
            keepMounted
            maxWidth="sm"
            fullWidth
          >
            <DialogTitle sx={{ fontSize: isMobile ? "16px" : "16px" }}>
              Delete Confirmation
            </DialogTitle>
            <DialogContent dividers>
              {deleteCodeLoading ? (
                <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: 150 }}>
                  <CircularProgress />
                </Box>
              ) : (
                <>
                  <Typography sx={{ fontSize: isMobile ? "15px" : "16px", marginTop: "5px" }}>
                    Enter the 6-digit delete code that was sent to {userDetails.email}
                  </Typography>

                  <TextField
                    type="email"
                    id="email"
                    onChange={(e) => {
                      setEmailCode(e.target.value);
                    }}
                    margin="normal"
                    variant="outlined"
                    label="6-digit code"
                    value={emailCode}
                  ></TextField>
                </>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setEnterCodeDialog(false)} color="primary" sx={{ textTransform: "none" }}>
                Cancel
              </Button>
              <Button
                color="success"
                onClick={checkPin}
                sx={{ borderRadius: "18px", backgroundColor: "#EC5228", color: "#FFFFFF", px: 3, textTransform: "none" }}
              >
                Submit
              </Button>
            </DialogActions>
          </Dialog>
        </ClickAwayListener>
      )}

    </>
  );
};

export default AccountDetailsPage1;

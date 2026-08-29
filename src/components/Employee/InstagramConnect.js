import { useEffect, useState, useCallback } from "react";
import {
  Box, Button, Card, CardContent, CircularProgress, Alert, Chip, Tooltip,
  Fade, Zoom, Dialog, DialogTitle, DialogContent, DialogActions, Avatar,
  Typography, Stack, DialogContentText
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import {
  VerifiedUser as VerifiedIcon, TrendingUp as TrendingUpIcon, Visibility as VisibilityIcon,
  Instagram as InstagramIcon, LinkOff as LinkOffIcon, CheckCircle as CheckCircleIcon,
  Warning as WarningIcon, ArrowForward as ArrowForwardRoundedIcon,
  InfoOutlined as InfoOutlinedIcon
} from "@mui/icons-material";
import axios from "axios";
import { toast } from "react-toastify";
import FeaturedPlayListOutlinedIcon from '@mui/icons-material/FeaturedPlayListOutlined';

// import "react-toastify/dist/ReactToastify.css"; // Commented out to prevent build errors

/** Facebook Login for Business — user authenticates via Facebook, then the
 * backend looks up their linked Instagram Business/Creator account via the Page. */
const FB_APP_ID = "1360956302356492"; // same App ID usersOn.js hardcodes as META_APP_ID
const FB_LOGIN_CONFIG_ID = "742713598693584"; // Meta App Dashboard → Facebook Login for Business → Configurations
const REDIRECT_URI = "https://chomske.com/api/usersOn/meta-callback";
const BACKEND_STATUS_URL  = "/api/usersOn/instagram-status";
const BACKEND_UNLINK_URL  = "/api/usersOn/unlink-instagram";
const BACKEND_SAVE_URL     = "/api/usersOn/save-instagram-account";

export default function InstagramConnect() {
  const theme = useTheme();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [checkingStatus, setCheckingStatus] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [connectedAccount, setConnectedAccount] = useState(null);
  const [selectOpen, setSelectOpen] = useState(false);
  const [candidates, setCandidates] = useState([]);


  const [unlinkDialogOpen, setUnlinkDialogOpen] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  const [savedIgUserId, setSavedIgUserId] = useState(null);

  // --- NEW: Duplicate Dialog State ---
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateMessage, setDuplicateMessage] = useState("");

  // --- Check connection on mount
  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get(BACKEND_STATUS_URL, { withCredentials: true });
        if (data?.instagramConnected) {
          setIsConnected(true);
          setConnectedAccount({
            username: data.igUsername,
            profilePic: data.igProfilePic,
            followersCount: data.followersCount,
          });
        }
      } catch (e) {
        console.error(e);
      } finally {
        setCheckingStatus(false);
      }
    })();
  }, []);


  

  /** --- NEW: open Business Login popup and wait for postMessage --- */
// InstagramConnect.jsx (only inside openBusinessLogin)
const openBusinessLogin = useCallback(async () => {
  setError("");
  setLoading(true);

  try {
    // 1) Ask backend for a signed state bound to this user
    const stateResp = await axios.post("/api/usersOn/meta-state", {}, { withCredentials: true });
    const state = stateResp.data?.state;
    console.log('state : ', state);
    if (!state) throw new Error("Unable to start Meta login");

    // 2) Build OAuth URL with signed state (no random state now)
    const q = new URLSearchParams({
      client_id: FB_APP_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      config_id: FB_LOGIN_CONFIG_ID,
      state, // <-- signed, user-bound
    });

    const authUrl = `https://www.facebook.com/v24.0/dialog/oauth?${q.toString()}`;
    const w = 680, h = 760;
    const y = window.top.outerHeight / 2 + window.top.screenY - (h / 2);
    const x = window.top.outerWidth / 2 + window.top.screenX - (w / 2);

    const popup = window.open(
      authUrl,
      "metaBusinessLogin",
      `width=${w},height=${h},left=${x},top=${y},resizable=yes,scrollbars=yes`
    );
    if (!popup) throw new Error("Popup blocked. Please allow popups and try again.");

    const onMessage = async (event) => {
      const msg = event.data || {};
      if (msg.type !== "meta-auth") return;
      
      // IMPORTANT: Don't remove listener immediately. 
      // We handle the message then stop listening.
      window.removeEventListener("message", onMessage);

      try {
        if (!msg.success) {
           // --- NEW: Check for DUPLICATE_CONNECTION from the popup ---
           if (msg.errorCode === "DUPLICATE_CONNECTION") {
             // Set the error message and open the dialog
             setDuplicateMessage(msg.error);
             setDuplicateDialogOpen(true);
             // The popup is closing itself via backend script, 
             // but this Dialog remains in the main window state.
           } else {
             setError(msg.error || "Facebook Business Login failed.");
           }
           return;
        }
        
        const arr = msg.candidates || [];
        if (arr.length === 1) {
          handleSelect(arr[0]);
        } else if (arr.length > 1) {
          setCandidates(arr);
          setSelectOpen(true);
        }
      } catch (err) {
        setError(err?.response?.data?.error || err.message || "Failed after login.");
      } finally {
        // Ensure loading spinner stops
        setLoading(false);
      }
    };

    window.addEventListener("message", onMessage);

    const poll = setInterval(() => {
      if (popup.closed) {
        clearInterval(poll);
        // If window closed manually or via script, ensure we clean up
        setTimeout(() => {
            window.removeEventListener("message", onMessage);
            setLoading(false);
        }, 1000);
      }
    }, 500);
  } catch (e) {
    setError(e.message || "Failed to start Meta login");
    setLoading(false);
  }
}, []);


  /** Save one selected IG account (same as your previous logic) */
const handleSelect = useCallback((acc) => {
  setError("");

  axios.post(
    BACKEND_SAVE_URL,
    {
      pageId: acc.pageId,
      igUserId: acc.igUserId,
      username: acc.username,
      pageAccessToken: acc.pageAccessToken, // keep if your backend expects it
    },
    { withCredentials: true }
  )
  .then((result) => {
    if (result?.data?.success) {
      setSavedIgUserId(acc.igUserId);
      setIsConnected(true);
      setConnectedAccount({
        username: acc.username,
        profilePic: acc.profilePic,
        followersCount: acc.followersCount,
      });
      // Close select dialog if open
      setSelectOpen(false);
    } else {
      setError(result?.data?.error || "Failed to save Instagram account");
    }
  })
  .catch((err) => {
    console.error(err);
    
    // --- NEW: Handle Duplicate Connection Error (409) ---
    if (err.response && err.response.status === 409 && err.response.data.error === "DUPLICATE_CONNECTION") {
      setDuplicateMessage(err.response.data.message);
      setDuplicateDialogOpen(true);
      setSelectOpen(false); // Close selection dialog so user sees the conflict dialog
    } else {
      setError(err?.response?.data?.error || err.message || "Failed to save Instagram account");
    }
  });
}, []); 


  const handleUnlinkClick = () => setUnlinkDialogOpen(true);
  const handleCloseDialog = () => setUnlinkDialogOpen(false);

  const handleUnlink = useCallback(async () => {
    setUnlinking(true);
    try {
      const r = await axios.post(BACKEND_UNLINK_URL, {}, { withCredentials: true });
      if (r.status) {
        setUnlinkDialogOpen(false);
        toast.success("Instagram is Disconnected!");
        setTimeout(() => {
          setIsConnected(false);
          setConnectedAccount(null);
          setError("");
        }, 600);
      }
    } catch (err) {
      console.error("Unlink failed:", err);
      setError(err?.response?.data?.error || err.message || "Failed to unlink Instagram");
    } finally {
      setUnlinking(false);
    }
  }, []);

  // --------- UI (unchanged except the Connect button now calls openBusinessLogin) ---------

  if (checkingStatus) {
    return (
      <Card elevation={0} sx={{ maxWidth: 860, mx: "auto", borderRadius: 4, overflow: "hidden" }}>
        <CardContent>
          <Box display="flex" justifyContent="center" alignItems="center" py={6}>
            <CircularProgress />
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (isConnected && connectedAccount) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', height: '100vh' }}>
        {/* ... your existing Connected card ... */}
          <Card elevation={0} sx={{ maxWidth: 860, mx: "auto", borderRadius: 4, color: "white",
        position: "relative", overflow: "hidden",
        background: "linear-gradient(135deg, #C9CDCF 0%, #67C090 45%, #08CB00 100%)",
        boxShadow: "0 20px 60px rgba(29, 17, 86, 0.35)" }}>
          
          <CardContent sx={{ p: { xs: 3, md: 6 }, position: "relative", zIndex: 2 }}>
            <Stack direction={{ xs: "column", md: "row" }} alignItems="center" spacing={4}>
              <Box sx={{ position: "relative" }}>
                <Box sx={{ position: "absolute", inset: -4, borderRadius: "50%", background: "linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)", opacity: 0.8, filter: "blur(8px)" }} />
                <Avatar src={connectedAccount.profilePic} sx={{ width: 120, height: 120, border: "4px solid white", boxShadow: "0 8px 24px rgba(0,0,0,0.2)" }} />
                <Box sx={{ position: "absolute", bottom: 4, right: 4, bgcolor: "#fff", borderRadius: "50%", p: 0.5, boxShadow: "0 4px 8px rgba(0,0,0,0.15)" }}>
                  <CheckCircleIcon color="success" sx={{ fontSize: 32 }} />
                </Box>
              </Box>

              <Box textAlign={{ xs: "center", md: "left" }} flex={1}>
                <Chip icon={<VerifiedIcon sx={{ fontSize: 16 }} />} label="Connected & Active" size="small" sx={{ bgcolor: "rgba(255,255,255,0.25)", color: "white", mb: 2, fontWeight: 600, backdropFilter: "blur(4px)" }} />
                <Typography variant="h3" fontWeight={800} sx={{ mb: 1, textShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                  @{connectedAccount.username}
                </Typography>
                <Stack direction="row" spacing={3} justifyContent={{ xs: "center", md: "flex-start" }} sx={{ opacity: 0.9 }}>
                  <Box display="flex" alignItems="center" gap={0.8}>
                    <TrendingUpIcon sx={{ fontSize: 20 }} />
                    <Typography fontWeight={600}>{connectedAccount.followersCount || 0}</Typography>
                    <Typography variant="body2">Followers</Typography>
                  </Box>
                  <Box display="flex" alignItems="center" gap={0.8}>
                     <FeaturedPlayListOutlinedIcon sx={{ fontSize: 20 }} />
                    <Typography fontWeight={600}>Auto-Reply</Typography>
                    <Typography variant="body2">Active</Typography>
                  </Box>
                </Stack>
              </Box>
            </Stack>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} mt={5}>
              <Button variant="contained" size="large" endIcon={<ArrowForwardRoundedIcon />} sx={{ flex: 1, bgcolor: "white", color: "#08CB00", fontWeight: 700, py: 1.5, borderRadius: 2.5, boxShadow: "0 8px 20px rgba(0,0,0,0.15)", "&:hover": { bgcolor: "#f8fff9", transform: "translateY(-2px)" } }}>
                Manage Automations
              </Button>
              <Button onClick={handleUnlinkClick} variant="outlined" size="large" startIcon={unlinking ? <CircularProgress size={20} color="inherit" /> : <LinkOffIcon />} disabled={unlinking} sx={{ flex: 1, borderColor: "rgba(255,255,255,0.5)", color: "white", borderWidth: 2, fontWeight: 600, py: 1.5, borderRadius: 2.5, "&:hover": { borderColor: "white", bgcolor: "rgba(255,255,255,0.1)" } }}>
                {unlinking ? "Disconnecting..." : "Disconnect Account"}
              </Button>
            </Stack>
          </CardContent>
        </Card>

        {/* Unlink Confirmation Dialog */}
        <Dialog open={unlinkDialogOpen} onClose={handleCloseDialog} PaperProps={{ sx: { borderRadius: 3, p: 1 } }}>
           <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.5, color: "warning.main" }}>
             <WarningIcon /> Disconnect Instagram?
           </DialogTitle>
           <DialogContent>
             <Typography>
               Are you sure you want to disconnect <b>@{connectedAccount.username}</b>?
               <br /><br />
               <span style={{ opacity: 0.7 }}>Automations will stop running immediately. You can reconnect anytime.</span>
             </Typography>
           </DialogContent>
           <DialogActions sx={{ px: 3, pb: 2 }}>
             <Button onClick={handleCloseDialog} variant="outlined" sx={{ borderRadius: 2, textTransform: 'none' }}>
               Cancel
             </Button>
             <Button onClick={handleUnlink} variant="contained" color="error" disabled={unlinking} sx={{ borderRadius: 2, px: 3, textTransform: 'none', boxShadow: "0 4px 12px rgba(211, 47, 47, 0.3)" }}>
               {unlinking ? "Disconnecting..." : "Yes, Disconnect"}
             </Button>
           </DialogActions>
        </Dialog>
      </Box>
    );
  }

  // Not Connected state
  return (
    <>
    <Box sx={{ display: 'flex', alignItems: 'center', height: '100vh' }}>
      <Card elevation={0} sx={{ maxWidth: 860, mx: "auto", borderRadius: 4, color: "white",
        position: "relative", overflow: "hidden",
        background: "linear-gradient(135deg, #C9CDCF 0%, #67C090 45%, #08CB00 100%)",
        boxShadow: "0 20px 60px rgba(29, 17, 86, 0.35)" }}>
        
        <CardContent sx={{ p: { xs: 3, md: 8 }, textAlign: "center", position: "relative", zIndex: 2 }}>
          <Stack spacing={3} alignItems="center">
             <Box sx={{ position: "relative", mb: 2 }}>
               <Box sx={{ position: "absolute", inset: -20, background: "radial-gradient(circle, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 70%)", opacity: 0.6, animation: "pulse 3s infinite" }} />
               <InstagramIcon sx={{ fontSize: 80, filter: "drop-shadow(0 8px 16px rgba(0,0,0,0.2))" }} />
             </Box>
             <Box>
               <Typography variant="h3" fontWeight={800} sx={{ mb: 1.5, letterSpacing: -0.5, textShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
                 Connect Instagram Professional
               </Typography>
               <Typography variant="h6" sx={{ opacity: 0.9, maxWidth: 500, mx: "auto", lineHeight: 1.6, fontWeight: 500 }}>
                 Unlock powerful automation features. Auto-reply to comments, manage DMs, and grow your audience 24/7.
               </Typography>
             </Box>

             {/* Features Grid */}
             <Stack direction={{ xs: "column", sm: "row" }} spacing={2} width="100%" justifyContent="center" sx={{ py: 2 }}>
                <FeatureChip icon={<VisibilityIcon sx={{ color: "#08CB00" }} />} title="Story Mentions" subtitle="Auto-reply instantly" />
                <FeatureChip icon={<TrendingUpIcon sx={{ color: "#08CB00" }} />} title="Post Comments" subtitle="Boost engagement" />
             </Stack>
          </Stack>
        </CardContent>

        {error && (
          <Fade in>
            <Alert severity="error" sx={{ bgcolor: alpha("#ffffff", 0.96), color: theme.palette.error.dark, borderRadius: 2, mx: 4, mb: 2 }}>
              {error}
            </Alert>
          </Fade>
        )}

        <Box textAlign="center" pb={6}>
          <Tooltip title={loading ? "Connecting..." : ""}>
            <span>
              <Button
                variant="contained"
                size="large"
                disabled={loading}
                onClick={openBusinessLogin}          // <-- changed
                startIcon={!loading ? <InstagramIcon sx={{ color: '#E1306C' }} /> : null}
                sx={{
                  minWidth: 300, py: 1.6, fontSize: "1.05rem", fontWeight: 800, letterSpacing: 0.2,
                  bgcolor: "white", color: "#5b7fff", borderRadius: 2.5,
                  boxShadow: "0 14px 30px rgba(0,0,0,0.28)",
                  "&:hover": { bgcolor: alpha("#ffffff", 0.95), transform: "translateY(-2px)", boxShadow: "0 18px 40px rgba(0,0,0,0.3)" },
                }}
              >
                {loading ? <CircularProgress size={22} /> :
                  <Typography sx={{ fontFamily: 'Inter', fontSize: '18px', fontWeight: 600, textTransform: 'none', color: '#E1306C' }}>
                    Connect Instagram
                  </Typography>}
              </Button>
            </span>
          </Tooltip>
          <Typography variant="caption" display="block" mt={2} sx={{ opacity: 0.85 }}>
            Secure via Facebook Business Login • Takes 10 seconds
          </Typography>
        </Box>

      </Card>
    </Box>

    <Dialog open={selectOpen} onClose={() => setSelectOpen(false)} maxWidth="sm" fullWidth>
  <DialogTitle>Select an Instagram account</DialogTitle>
  <DialogContent dividers>
    <Stack spacing={1.5}>
      {candidates.map((acc) => (
        <Button
          key={acc.igUserId}
          onClick={() => handleSelect(acc)}
          variant="outlined"
          sx={{ justifyContent: "flex-start", textTransform: "none" }}
          startIcon={
            <Avatar src={acc.profilePic} alt={acc.username} sx={{ width: 32, height: 32 }} />
          }
        >
          @{acc.username}
          <Typography component="span" sx={{ ml: 1, opacity: 0.7 }}>
            • {acc.followersCount ?? 0} followers
          </Typography>
          <Typography component="span" sx={{ ml: "auto", opacity: 0.6 }}>
            {acc.pageName}
          </Typography>
        </Button>
      ))}
    </Stack>
  </DialogContent>
  <DialogActions>
    <Button onClick={() => setSelectOpen(false)}>Cancel</Button>
  </DialogActions>
</Dialog>

      {/* Duplicate Account Conflict Dialog */}
      <Dialog
        open={duplicateDialogOpen}
        onClose={() => setDuplicateDialogOpen(false)}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title" sx={{ color: "error.main", display: "flex", alignItems: "center", gap: 1 }}>
          <InfoOutlinedIcon /> Account Conflict
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-description" sx={{ color: "text.primary" }}>
            {duplicateMessage || "This Instagram account is already connected to another user."}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDuplicateDialogOpen(false)}
            autoFocus
            variant="contained"
          >
            Okay
          </Button>
        </DialogActions>
      </Dialog>

</>

  );
}

/** Unchanged */
function FeatureChip({ icon, title, subtitle }) {
  return (
    <Stack direction="row" spacing={1.5} alignItems="center"
      sx={{ flex: "1 1 240px", minWidth: 0, p: 1.25, pr: 1.5, borderRadius: 2,
        bgcolor: (t) => alpha("#ffffff", 0.18),
        border: "1px solid rgba(255,255,255,0.22)", backdropFilter: "blur(6px)" }}>
      <Box sx={{ minWidth: 40, height: 40, borderRadius: 1.5, bgcolor: "white",
        display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 20px rgba(0,0,0,0.25)" }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontFamily: 'Inter', fontSize: 15, fontWeight: 600, lineHeight: 1.1 }}>{title}</Typography>
        <Typography sx={{ fontFamily: 'Inter', fontSize: 13, mt: 0.25 }} noWrap>{subtitle}</Typography>
      </Box>
    </Stack>
  );
}
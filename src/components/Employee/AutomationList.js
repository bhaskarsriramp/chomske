import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  Box,
  Stack,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Chip,
  Avatar,
  Card,
  CardContent,
  CardActionArea,
  Skeleton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  ClickAwayListener,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  IconButton,
  Menu,
  MenuItem,
  Zoom,
  LinearProgress
} from "@mui/material";
import { useTheme, keyframes } from "@mui/material/styles";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import ElectricBoltIcon from '@mui/icons-material/ElectricBolt';
import AddIcon from "@mui/icons-material/Add";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import PolylineOutlinedIcon from '@mui/icons-material/PolylineOutlined';
import InstagramIcon from "@mui/icons-material/Instagram";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import { logout } from "../../store/professionalSlice";
import { useDispatch } from "react-redux";
import LogoutIcon from "@mui/icons-material/Logout";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { toast } from "react-toastify"; 
import "react-toastify/dist/ReactToastify.css";

/* ---------------- Animations ---------------- */
const pulseGlow = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
  70% { box-shadow: 0 0 0 12px rgba(239, 68, 68, 0); }
  100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
`;

const fadeSlideUp = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
`;

/* ---------------- DM Limit Dialog ---------------- */
function DmLimitReachedDialog({ open, onClose, onUpgrade, dmUsageData }) {
  const usagePercent = dmUsageData.dms_plan_limit > 0
    ? Math.min((dmUsageData.total_dms_sent / dmUsageData.dms_plan_limit) * 100, 100)
    : 100;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      TransitionComponent={Zoom}
      TransitionProps={{ timeout: 350 }}
      PaperProps={{
        sx: {
          borderRadius: 4,
          overflow: "hidden",
          boxShadow: "0 24px 48px rgba(0,0,0,0.15)",
        },
      }}
    >
      {/* Top accent bar */}
      <Box sx={{
        height: 4,
        background: "linear-gradient(90deg, #ef4444, #f97316, #ef4444)",
        backgroundSize: "200% 100%",
        animation: "shimmer 2s ease infinite",
        "@keyframes shimmer": {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
      }} />

      <Box sx={{ px: 3, pt: 3, pb: 1, textAlign: "center" }}>
        {/* Animated warning icon */}
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #FEE2E2, #FEF3C7)",
            display: "grid",
            placeItems: "center",
            mx: "auto",
            mb: 2,
            animation: `${pulseGlow} 2s ease-in-out infinite`,
          }}
        >
          <WarningAmberRoundedIcon sx={{ fontSize: 32, color: "#ef4444" }} />
        </Box>

        <Typography
          sx={{
            fontFamily: "Inter",
            fontWeight: 700,
            fontSize: { xs: "1.1rem", sm: "1.25rem" },
            color: "#1a1a1a",
            mb: 0.5,
            animation: `${fadeSlideUp} 0.4s ease 0.1s both`,
          }}
        >
          DM Limit Reached
        </Typography>

        <Typography
          sx={{
            fontFamily: "Inter",
            fontSize: { xs: "0.813rem", sm: "0.875rem" },
            color: "#6b7280",
            lineHeight: 1.6,
            mb: 2.5,
            animation: `${fadeSlideUp} 0.4s ease 0.2s both`,
          }}
        >
          You've used all your DMs for this month. Automations are paused until your limit resets or you upgrade.
        </Typography>

        {/* Usage bar */}
        <Box
          sx={{
            bgcolor: "#f9fafb",
            border: "1px solid #f3f4f6",
            borderRadius: 2.5,
            p: 2,
            mb: 2.5,
            animation: `${fadeSlideUp} 0.4s ease 0.3s both`,
          }}
        >
          <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography sx={{ fontFamily: "Inter", fontSize: "0.75rem", color: "#6b7280" }}>
              DMs Sent
            </Typography>
            <Typography sx={{ fontFamily: "Inter", fontSize: "0.75rem", fontWeight: 600, color: "#ef4444" }}>
              {dmUsageData.total_dms_sent.toLocaleString()} / {dmUsageData.dms_plan_limit.toLocaleString()}
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={usagePercent}
            sx={{
              height: 8,
              borderRadius: 4,
              bgcolor: "#fee2e2",
              "& .MuiLinearProgress-bar": {
                borderRadius: 4,
                background: "linear-gradient(90deg, #ef4444, #f97316)",
              },
            }}
          />
        </Box>
      </Box>

      {/* Action buttons */}
      <Box
        sx={{
          px: 3,
          pb: 3,
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          animation: `${fadeSlideUp} 0.4s ease 0.4s both`,
        }}
      >
        <Button
          variant="contained"
          fullWidth
          startIcon={<ElectricBoltIcon />}
          onClick={onUpgrade}
          sx={{
            textTransform: "none",
            fontFamily: "Inter",
            fontWeight: 600,
            fontSize: "0.938rem",
            py: 1.25,
            borderRadius: 2.5,
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            boxShadow: "0 4px 14px rgba(99, 102, 241, 0.35)",
            transition: "all 0.2s ease",
            "&:hover": {
              background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
              boxShadow: "0 6px 20px rgba(99, 102, 241, 0.45)",
              transform: "translateY(-1px)",
            },
          }}
        >
          Upgrade Plan
        </Button>

        <Button
          fullWidth
          onClick={onClose}
          sx={{
            textTransform: "none",
            fontFamily: "Inter",
            fontWeight: 500,
            fontSize: "0.875rem",
            color: "#9ca3af",
            borderRadius: 2.5,
            "&:hover": {
              bgcolor: "#f9fafb",
              color: "#6b7280",
            },
          }}
        >
          Maybe Later
        </Button>
      </Box>
    </Dialog>
  );
}

/* ---------------- Small components ---------------- */
function EmptyState({ onCreate, dmLimitExceeded, onDmLimitClick }) {
  return (
    <Box
      sx={{
        py: 8,
        px: 3,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2.5,
        border: "1px dashed",
        borderColor: "divider",
        borderRadius: 3,
        bgcolor: "background.default",
        textAlign: "center",
      }}
    >
      <Box
        sx={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          bgcolor: "action.hover",
        }}
      >
        <PolylineOutlinedIcon fontSize="large" />
      </Box>

      <Stack spacing={0.5}>
        <Typography sx={{ fontFamily: "Inter", fontSize: 20, fontWeight: 600, letterSpacing: 0.2 }}>
          Create your first automation
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", maxWidth: 520, mx: "auto" }}>
          You don't have any automations yet. Set up your first one to auto-DM,
          track status, and manage everything from one place.
        </Typography>
      </Stack>

      <Button
        variant="contained"
        startIcon={<AddIcon />}
        disabled={dmLimitExceeded}
        onClick={dmLimitExceeded ? onDmLimitClick : onCreate}
        sx={{ textTransform: "none", borderRadius: 2, px: 2.5, pointerEvents: "auto" }}
      >
        New Automation
      </Button>
    </Box>
  );
}

/* ---------------- Mobile card (xs/sm) ---------------- */
function AutomationCard({ row, onDetails }) {
  return (
    <Card 
      variant="outlined" 
      sx={{ 
        borderRadius: 2.5, 
        overflow: "hidden", 
        borderColor: "divider", 
        mb: 1.5,
        opacity: row.postLive === false ? 0.6 : 1,
      }}
    >
      <CardActionArea 
        onClick={() => onDetails(row)} // Pass entire row object instead of just postId
        disableRipple
      >
        <Box sx={{ display: "flex", gap: 1.25, p: 1.25 }}>
          <Avatar
            variant="rounded"
            src={row.thumbnail}
            alt={row.caption || "thumbnail"}
            sx={{ width: 64, height: 64, flexShrink: 0 }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.5, flexWrap: "wrap" }}>
              <Chip
                size="small"
                label={String(row.status || "").toUpperCase()}
                color={row.status === "active" ? "success" : "default"}
                variant="outlined"
                sx={{ fontSize: "10px", height: 20, "& .MuiChip-label": { px: 0.75 } }}
              />
              <Tooltip title={row.postLive ? "Post is live on Instagram" : "Post deleted from Instagram"}>
                <Chip
                  size="small"
                  icon={row.postLive ? <CheckCircleOutlineIcon sx={{ fontSize: "12px !important" }} /> : <CancelOutlinedIcon sx={{ fontSize: "12px !important" }} />}
                  label={row.postLive ? "LIVE" : "DELETED"}
                  color={row.postLive ? "success" : "error"}
                  variant="outlined"
                  sx={{ fontSize: "10px", height: 20, "& .MuiChip-label": { px: 0.75 } }}
                />
              </Tooltip>
              <Typography
                variant="caption"
                sx={{ color: "text.secondary", fontSize: "10px" }}
                title={new Date(row.createdAt).toLocaleString()}
              >
                {new Date(row.createdAt).toLocaleDateString("en-GB")}
              </Typography>
            </Stack>

            <Typography
              variant="body2"
              sx={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
              title={row.caption || ""}
            >
              {row.caption?.trim() || "—"}
            </Typography>

            <Stack direction="row" alignItems="center" justifyContent="flex-end" sx={{ mt: 1 }}>
              <Typography
                variant="caption"
                sx={{
                  fontFamily: "Inter",
                  fontWeight: 600,
                  fontSize: "11px",
                  color: "#667eea",
                  letterSpacing: "0.2px",
                }}
              >
                Details &rsaquo;
              </Typography>
            </Stack>
          </Box>
        </Box>
      </CardActionArea>
    </Card>
  );
}

/* ---------------- Main Screen ---------------- */
export default function AutomationList() {
  const navigate = useNavigate();
  const theme = useTheme();
    const dispatch = useDispatch();

  // Desktop detection state
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia(`(min-width: ${theme.breakpoints.values.md}px)`).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${theme.breakpoints.values.md}px)`);
    const handler = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme.breakpoints.values.md]);

  const baseUrl = "/api/usersOn";

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

  
  const handleDuplicateDialogClose = () => {
    setDuplicateDialogOpen(false);
  };


  /* ---- Backend endpoints ---- */
  const STATUS_URL = baseUrl + "/instagram-status";
  const META_STATE_URL = baseUrl + "/meta-state";
  const AUTOMATIONS_URL = baseUrl + "/automations";

  /* ---- Meta app constants ---- */
  const FB_APP_ID = "1360956302356492";
  const FB_LOGIN_CONFIG_ID = "742713598693584";
  const REDIRECT_URI = "https://chomske.com/api/usersOn/meta-callback";

  /* ---- IG connect state ---- */
  const [igConnected, setIgConnected] = useState(null);
  const [igCheckErr, setIgCheckErr] = useState("");
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectError, setConnectError] = useState("");

  /* ---- Data state ---- */
  const [rows, setRows] = useState([]);
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);
  const [initializing, setInitializing] = useState(true);

  // Table pagination (desktop)
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  // Mobile "Load more"
  const [mobilePage, setMobilePage] = useState(0);
  const [mobileHasMore, setMobileHasMore] = useState(true);

  // NEW: Duplicate Dialog State
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [proCheckDialogOpen, setProCheckDialogOpen] = useState(false);
  const [duplicateMessage, setDuplicateMessage] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // DM Limit state
  const [dmLimitExceeded, setDmLimitExceeded] = useState(false);
  const [dmLimitDialogOpen, setDmLimitDialogOpen] = useState(false);
  const [dmUsageData, setDmUsageData] = useState({ total_dms_sent: 0, dms_plan_limit: 0 });

  const mobileInitialLoadedRef = useRef(false);
  const controllerRef = useRef(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);
  const openMenu = Boolean(anchorEl);

  /* ---- Helpers ---- */
  function formatNumber(input, { digits = 1 } = {}) {
    if (input == null || isNaN(input)) return "0";
    const sign = input < 0 ? "-" : "";
    let n = Math.abs(Number(input));

    const units = ["", "k", "m", "b", "t"];
    let u = 0;
    while (n >= 1000 && u < units.length - 1) {
      n /= 1000;
      u++;
    }
    const useDecimals = u > 0 && n < 100;
    const fixed = useDecimals ? n.toFixed(digits) : Math.round(n).toString();
    const trimmed = fixed.replace(/\.0+$|(\.\d*[1-9])0+$/g, "$1");
    return sign + trimmed + units[u];
  }


  const handleMenuClick = (event, row) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setSelectedRow(row);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedRow(null);
  };

  const handleEditAutomation = () => {
  if (!selectedRow?.postId) return;
  
  navigate(`/professional/setup-automation/${encodeURIComponent(selectedRow.postId)}`, {
    state: {
      isEditMode: true,
      editData: {
        postId: selectedRow.postId,
        dmMessage: selectedRow.dmMessage || "",
        buttonText: selectedRow.buttonText || "Send Link",
        flowNodes: selectedRow.flowNodes || [],
        keywords: selectedRow.keywords || [],
        hasReply: selectedRow.hasReply || false,
        replyComments: selectedRow.replyComments || [],
        caption: selectedRow.caption || "",
        thumbnail: selectedRow.thumbnail || "",
        status: selectedRow.status || "inactive"
      },
      post_id: selectedRow.postId,
      id: selectedRow.postId,
      caption: selectedRow.caption || "",
      thumbnail_url: selectedRow.thumbnail || ""
    }
  });
  
  handleMenuClose();
};

const handleStopAutomation = async () => {
  if (!selectedRow?.postId) return;
  
  const currentStatus = selectedRow.status;
  const newStatus = currentStatus === "active" ? "inactive" : "active";
  
  try {
    await axios.post(
      `${baseUrl}/automation/stop`, 
      { postId: selectedRow.postId, status: newStatus }, 
      { withCredentials: true }
    );
    
    // Show success message (toast would be better, but using alert for now)
   // Show success toast with appropriate color
if (newStatus === "active") {
  toast.success(`Automation Resumed ✅`, {
    position: "top-right",
    autoClose: 3000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    style: {
      background: "#10b981", // green
      color: "#ffffff",
    },
    progressStyle: {
      background: "#059669",
    },
  });
} else {
  toast.warning(`Automation Stopped ⏸️`, {
    position: "top-right",
    autoClose: 3000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    style: {
      background: "#f97316", // orange
      color: "#ffffff",
    },
    progressStyle: {
      background: "#ea580c",
    },
  });
}
    // Refresh the data
    if (isDesktop) {
      await fetchPage(page, pageSize);
    } else {
      mobileInitialLoadedRef.current = false;
      setMobilePage(0);
      await fetchMobile(0);
    }
    
    handleMenuClose();
  } catch (error) {
    console.error("Error changing automation status:", error);
    alert("Failed to change automation status");
    handleMenuClose();
  }
};

const handleDeleteAutomation = async () => {
  if (!selectedRow?.postId) return;
  
  // Show confirmation dialog first (DON'T close menu yet)
  setDeleteDialogOpen(true);
  // Keep selectedRow intact - don't call handleMenuClose() here
};

const confirmDeleteAutomation = async () => {
  if (!selectedRow?.postId) return;
  
  setLoading(true);
  setDeleteDialogOpen(false);
  handleMenuClose(); // Close menu immediately when confirming
  
  try {
    await axios.post(
      `${baseUrl}/automation/delete`, 
      { postId: selectedRow.postId }, 
      { withCredentials: true }
    );
    
    toast.success(`Automation deleted successfully! 🗑️`, {
      position: "top-right",
      autoClose: 3000,
      style: {
        background: "#10b981",
        color: "#ffffff",
      },
    });
    // Refresh the data
    if (isDesktop) {
      await fetchPage(page, pageSize);
    } else {
      mobileInitialLoadedRef.current = false;
      setMobilePage(0);
      await fetchMobile(0);
    }
  } catch (error) {
    console.error("Error deleting automation:", error);
    toast.error("Failed to delete automation", {
      position: "top-right",
      autoClose: 3000,
    });
  } finally {
    setLoading(false);
    setSelectedRow(null);
  }
};


  const openCenteredPopup = (url) => {
    const w = 680,
      h = 760;
    const topWin = window.top || window;
    const y = topWin.outerHeight / 2 + topWin.screenY - h / 2;
    const x = topWin.outerWidth / 2 + topWin.screenX - w / 2;

    const features = [
      `width=${w}`,
      `height=${h}`,
      `left=${Math.max(0, x)}`,
      `top=${Math.max(0, y)}`,
      "resizable=yes",
      "scrollbars=yes",
    ].join(",");

    const popup = window.open(url, "metaBusinessLogin", features);
    if (!popup || popup.closed || typeof popup.closed === "undefined") {
      window.location.href = url;
      return null;
    }
    return popup;
  };

  /* ---- IG connection check ---- */
const checkIgConnection = useCallback(async () => {
  setIgCheckErr("");
  setIgConnected(null);

  try {
    const res = await axios.get(STATUS_URL, { withCredentials: true });

    const {
      instagramConnected,
      duplicateInfo,
      duplicateExists
    } = res.data || {};

    if (duplicateExists) {
      const { igUsername, maskedEmail } = duplicateInfo;

      setDuplicateMessage(
        `This Instagram account (@${igUsername}) is already connected to ${maskedEmail}.`
      );
      setDuplicateDialogOpen(true);
    }

    setIgConnected(instagramConnected);
    return instagramConnected;
  } catch (e) {
    setIgCheckErr(
      e?.response?.data?.message || e.message || "Failed to verify Instagram link"
    );
    setIgConnected(false);
    return false;
  }
}, [STATUS_URL]);


  /* ---- Desktop fetcher ---- */
  const fetchPage = useCallback(
    async (pageArg, limitArg) => {
      setLoading(true);
      setErr("");

      if (controllerRef.current) controllerRef.current.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      try {
        const res = await axios.get(AUTOMATIONS_URL, {
          withCredentials: true,
          signal: controller.signal,
          params: { page: (pageArg ?? page) + 1, limit: limitArg ?? pageSize },
        });

        const {
          items = [],
          total = 0,
          page: serverPage = (pageArg ?? page) + 1,
          limit = limitArg ?? pageSize,
        } = res.data || {};
        const startIndex = (serverPage - 1) * limit;

        const withSno = items.map((it, idx) => {
          const totalReplies = Number(it.totalReplies || 0);
          return {
            id: it._id || it.postId || `${it.thumbnail}-${idx}`,
            ...it,
            prettyReplies: formatNumber(totalReplies, { digits: 1 }),
            sno: startIndex + idx + 1,
            postLive: it.postLive !== false, // Default to true if undefined
          };
        });

        setRows(withSno);
        setRowCount(total);
      } catch (e) {
        if (!axios.isCancel(e)) {
          const status = e?.response?.status;
          if (status === 401 || status === 403) {
            setIgConnected(false);
          }
          setErr(e?.response?.data?.message || e.message || "Failed to load automations");
        }
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
        setHasFetchedOnce(true);
        setLoading(false);
      }
    },
    [AUTOMATIONS_URL, page, pageSize]
  );

  /* ---- Mobile fetcher (load more) ---- */
  const fetchMobile = useCallback(
    async (pageArg = 0, limitArg = 10) => {
      if (pageArg === 0 && mobileInitialLoadedRef.current) {
        setLoading(false);
        return;
      }
      if (pageArg === 0) mobileInitialLoadedRef.current = true;

      setLoading(true);
      setErr("");

      if (controllerRef.current) controllerRef.current.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      try {
        const res = await axios.get(AUTOMATIONS_URL, {
          withCredentials: true,
          signal: controller.signal,
          params: { page: pageArg + 1, limit: limitArg },
        });

        const { items = [], total = 0, page: serverPage = 1, limit = limitArg } = res.data || {};

        const mapped = items.map((it, idx) => {
          const totalReplies = Number(it.totalReplies || 0);
          return {
            id: it._id || it.postId || `${it.thumbnail}-${idx}-${serverPage}`,
            ...it,
            prettyReplies: formatNumber(totalReplies, { digits: 1 }),
            postLive: it.postLive !== false,
          };
        });

        if (pageArg === 0) setRows(mapped);
        else setRows((prev) => [...prev, ...mapped]);

        setRowCount(total);
        const fetchedCount = (pageArg + 1) * limit;
        setMobileHasMore(fetchedCount < total);
      } catch (e) {
        if (!axios.isCancel(e)) {
          const status = e?.response?.status;
          if (status === 401 || status === 403) {
            setIgConnected(false);
          }
          setErr(e?.response?.data?.message || e.message || "Failed to load automations");
        }
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
        setHasFetchedOnce(true);
        setLoading(false);
      }
    },
    [AUTOMATIONS_URL]
  );

  /* ---- DM Limit check ---- */
  const checkDmLimit = useCallback(async () => {
    try {
      const res = await axios.get(`${baseUrl}/dms-usage/current`, { withCredentials: true });
      if (res.data?.success) {
        const { total_dms_sent = 0, dms_plan_limit = 0 } = res.data.data;
        setDmUsageData({ total_dms_sent, dms_plan_limit });
        if (dms_plan_limit > 0 && total_dms_sent >= dms_plan_limit) {
          setDmLimitExceeded(true);
          setDmLimitDialogOpen(true);
        }
      }
    } catch (e) {
      console.error("Error checking DM limit:", e);
    }
  }, [baseUrl]);

  /* ---- Initial mount-only bootstrap ---- */
  useEffect(() => {
    (async () => {
      const ok = await checkIgConnection();
      console.log('ok? : ', ok);
      if (!ok) {
        setHasFetchedOnce(true);
        setInitializing(false);
        setLoading(false);
        return;
      }
      await checkDmLimit();
      if (isDesktop) {
        await fetchPage(0, pageSize);
      } else {
        mobileInitialLoadedRef.current = false;
        setMobilePage(0);
        await fetchMobile(0);
      }
      setInitializing(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop]);

  /* ---- Desktop refetch on pagination ---- */
  useEffect(() => {
    if (!isDesktop) return;
    fetchPage(page, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, isDesktop]);



  /* ---- Business Login handler ---- */
// const handleConnectInstagram = useCallback(async () => {
//   setConnectError("");
//   setConnectLoading(true);

//   try {
//     // 1. Ask backend for signed state (JWT)
//     const { data: stateResp } = await axios.post(
//       META_STATE_URL,
//       {},
//       { withCredentials: true }
//     );
//     const state = stateResp?.state;
//     if (!state) throw new Error("Unable to start Meta login");

//     // 2. Build the INNER OAuth URL (same as before)
//     const innerParams = new URLSearchParams({
//       client_id: FB_APP_ID,
//       redirect_uri: REDIRECT_URI,
//       state,
//       response_type: "code",
//       config_id: FB_LOGIN_CONFIG_ID,
//     });

//     const innerOAuthUrl = `https://business.facebook.com/dialog/oauth?${innerParams.toString()}`;

//     // 3. Wrap it with the Business Login shell (ManyChat-style)
//     const outerParams = new URLSearchParams({
//       next: innerOAuthUrl,
//       "login_options[0]": "IG",
//       app: FB_BUSINESS_APP_ID,
//       is_ig_oidc_with_redirect: "1",
//       display: "popup",
//       full_page_redirect_experimental: "1",
//       show_back_button: "0",
//     });

//     const authUrl = `https://business.facebook.com/business/loginpage/?${outerParams.toString()}`;

//     // 4. Open centered popup and poll until closed (same as before)
//     const popup = openCenteredPopup(authUrl);
//     if (!popup) {
//       // we navigated current window, status will be checked on page load
//       return;
//     }

// const poll = setInterval(async () => {
//       if (popup.closed) {
//         clearInterval(poll);

//         // Add a delay to let backend process the callback
//         await new Promise(resolve => setTimeout(resolve, 2000));

//         try {
//           // Retry logic: check status up to 5 times with delays
//           let ok = false;
//           for (let attempt = 0; attempt < 5; attempt++) {
//             console.log(`🔍 Connection check attempt ${attempt + 1}/5`);
            
//             // Force a fresh check by calling the API directly
//             try {
//               const res = await axios.get(STATUS_URL, { 
//                 withCredentials: true,
//                 headers: { 'Cache-Control': 'no-cache' }
//               });
              
//               const { instagramConnected, duplicateExists } = res.data || {};
              
//               console.log(`Attempt ${attempt + 1}: instagramConnected=${instagramConnected}, duplicateExists=${duplicateExists}`);
              
//               if (duplicateExists) {
//                 const { duplicateInfo } = res.data;
//                 const { igUsername, maskedEmail } = duplicateInfo;
//                 setDuplicateMessage(
//                   `This Instagram account (@${igUsername}) is already connected to ${maskedEmail}.`
//                 );
//                 setDuplicateDialogOpen(true);
//                 setConnectLoading(false);
//                 return; // Exit early - don't continue polling
//               }
              
//               if (instagramConnected) {
//                 ok = true;
//                 console.log("✅ Instagram connected successfully!");
                
//                 // Update state
//                 setIgConnected(true);
//                 setIgCheckErr("");
                
//                 // Force page reload to reset all state
//                 window.location.reload();
//                 return;
//               }
//             } catch (e) {
//               console.error(`Attempt ${attempt + 1} error:`, e);
//             }
            
//             // Wait before retrying (increasing delays)
//             if (attempt < 4) {
//               const delay = 2000 + (attempt * 1000); // 2s, 3s, 4s, 5s, 6s
//               console.log(`⏳ Waiting ${delay/1000}s before retry...`);
//               await new Promise(resolve => setTimeout(resolve, delay));
//             }
//           }
          
//           if (!ok) {
//             console.warn("❌ Instagram connection verification failed after 5 retries");
//             setConnectError("Connection verification failed. Please refresh the page and try again.");
//           }
//         } catch (error) {
//           console.error("Error during connection verification:", error);
//           setConnectError("Failed to verify connection. Please refresh and try again.");
//         } finally {
//           setConnectLoading(false);
//         }
//       }
//     }, 500);

//     // safety-close popup after 5 minutes
//     setTimeout(() => {
//       try {
//         if (!popup.closed) popup.close();
//       } catch {}
//     }, 5 * 60 * 1000);
//   } catch (e) {
//     setConnectError(e.message || "Failed to start Meta login");
//     setConnectLoading(false);
//   }
// }, [
//   META_STATE_URL,
//   checkIgConnection,
//   fetchPage,
//   fetchMobile,
//   pageSize,
//   isDesktop,
//   FB_APP_ID,
//   FB_BUSINESS_APP_ID,
//   FB_LOGIN_CONFIG_ID,
//   REDIRECT_URI,
// ]);

/* ---- Business Login handler ---- */
const handleConnectInstagram = useCallback(async () => {
  setConnectError("");
  setConnectLoading(true);

  try {
    // 1. Ask backend for signed state (JWT)
    const { data: stateResp } = await axios.post(
      META_STATE_URL,
      {},
      { withCredentials: true }
    );
    const state = stateResp?.state;
    if (!state) throw new Error("Unable to start Meta login");

    // 2. Build the Facebook OAuth URL with proper parameters
    const params = new URLSearchParams({
      client_id: FB_APP_ID,
      redirect_uri: REDIRECT_URI,
      state,
      response_type: "code",
      config_id: FB_LOGIN_CONFIG_ID,
    });

    // Use standard Facebook OAuth endpoint
    const authUrl = `https://www.facebook.com/v24.0/dialog/oauth?${params.toString()}`;

    console.log("🔗 Opening OAuth popup:", authUrl);

    // 3. Open centered popup
    const popup = openCenteredPopup(authUrl);
    if (!popup) {
      // Navigated current window, status will be checked on page load
      return;
    }

    // 4. Poll until popup closes
    const poll = setInterval(async () => {
      if (popup.closed) {
        clearInterval(poll);

        // Add a delay to let backend process the callback
        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
          // Retry logic: check status up to 5 times with delays
          let ok = false;
          for (let attempt = 0; attempt < 5; attempt++) {
            console.log(`🔍 Connection check attempt ${attempt + 1}/5`);
            
            // Force a fresh check by calling the API directly
            try {
              const res = await axios.get(STATUS_URL, { 
                withCredentials: true,
                headers: { 'Cache-Control': 'no-cache' }
              });
              
              const { instagramConnected, duplicateExists } = res.data || {};
              
              console.log(`Attempt ${attempt + 1}: instagramConnected=${instagramConnected}, duplicateExists=${duplicateExists}`);
              
              if (duplicateExists) {
                const { duplicateInfo } = res.data;
                const { igUsername, maskedEmail } = duplicateInfo;
                setDuplicateMessage(
                  `This Instagram account (@${igUsername}) is already connected to ${maskedEmail}.`
                );
                setDuplicateDialogOpen(true);
                setConnectLoading(false);
                return; // Exit early - don't continue polling
              }
              
              if (instagramConnected) {
                ok = true;
                console.log("✅ Instagram connected successfully!");
                
                // Update state
                setIgConnected(true);
                setIgCheckErr("");
                
                // Force page reload to reset all state
                window.location.reload();
                return;
              }
            } catch (e) {
              console.error(`Attempt ${attempt + 1} error:`, e);
            }
            
            // Wait before retrying (increasing delays)
            if (attempt < 4) {
              const delay = 2000 + (attempt * 1000); // 2s, 3s, 4s, 5s, 6s
              console.log(`⏳ Waiting ${delay/1000}s before retry...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
          
          if (!ok) {
            console.warn("❌ Instagram connection verification failed after 5 retries");
            setConnectError("Connection verification failed. Please refresh the page and try again.");
          }
        } catch (error) {
          console.error("Error during connection verification:", error);
          setConnectError("Failed to verify connection. Please refresh and try again.");
        } finally {
          setConnectLoading(false);
        }
      }
    }, 500);

    // safety-close popup after 5 minutes
    setTimeout(() => {
      try {
        if (!popup.closed) popup.close();
      } catch {}
    }, 5 * 60 * 1000);
  } catch (e) {
    setConnectError(e.message || "Failed to start Meta login");
    setConnectLoading(false);
  }
}, [
  META_STATE_URL,
  STATUS_URL,
  FB_APP_ID,
  FB_LOGIN_CONFIG_ID,
  REDIRECT_URI,
]);

  /* ---- Columns (desktop) ---- */
  const columns = useMemo(() => {
    return [
      { field: "sno", headerName: "S.No", width: 90, align: "center" },
      {
        field: "thumbnail",
        headerName: "Thumbnail",
        width: 110,
        renderCell: (params) => (
          <Avatar
            variant="rounded"
            src={params.value}
            alt={params.row.caption || "thumbnail"}
            sx={{ 
              width: 72, 
              height: 72,
              opacity: params.row.postLive === false ? 0.5 : 1,
            }}
          />
        ),
      },
    {
  field: "caption",
  headerName: "Caption",
  width: 180, // 🔑 increase width or 2 lines won’t be visible
  renderCell: ({ value, row }) => {
    const full = (value || "").trim();

    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          height: "100%",
          width: "100%",
        }}
      >
        <Typography
          variant="body2"
          title={full}
          sx={{
            opacity: row.postLive === false ? 0.6 : 1,

            display: "-webkit-box",
            WebkitLineClamp: 2,          // 👈 EXACTLY 2 lines
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "normal",
            lineHeight: 1.6,
          }}
        >
          {full || "—"}
        </Typography>
      </Box>
    );
  },
},

      {
        field: "status",
        headerName: "Status",
        width: 110,
        renderCell: (params) => (
         <Chip
  size="small"
  label={String(params.value || "").toUpperCase()}
  variant="outlined"
  sx={{
    fontWeight: 600,
    letterSpacing: "0.5px",
    textTransform: "none",
    fontFamily: 'Inter',
    fontSize: '12px',

    ...(params.value === "active"
      ? {
          backgroundColor: "#E6F4EA",   // light green bg
          color: "#137333",             // dark green text
          borderColor: "#34A853",
        }
      : {
          backgroundColor: "#F1F3F4",   // light gray bg
          color: "#5F6368",             // gray text
          borderColor: "#DADCE0",
        }),
  }}
/>

        ),
      },
      {
        field: "postLive",
        headerName: "Post Live",
        width: 100,
        renderCell: (params) => (
          <Tooltip title={params.value ? "Post is live on Instagram" : "Post deleted from Instagram"}>
            <Chip
              size="small"
              icon={params.value ? <CheckCircleOutlineIcon /> : <CancelOutlinedIcon />}
              label={params.value ? "LIVE" : "DELETED"}
              color={params.value ? "success" : "error"}
              variant="outlined"
            />
          </Tooltip>
        ),
      },
      // {
      //   field: "totalReplies",
      //   headerName: "Replies Sent",
      //   width: 140,
      //   renderCell: (params) => {
      //     const raw = Number(params.value || 0);
      //     const pretty = formatNumber(raw, { digits: 1 });
      //     return (
      //       <Typography
      //         sx={{ textAlign: "center", alignItems: "center", mt: 1.5 }}
      //         title={raw.toLocaleString()}
      //         aria-label={`Replies sent ${raw}`}
      //       >
      //         {pretty}
      //       </Typography>
      //     );
      //   },
      // },
    {
      field: "createdAt",
      headerName: "Created Date",
      width: 130,
      renderCell: (params) => (
        <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "Inter", whiteSpace: "nowrap" }}>
          {params.value ? new Date(params.value).toLocaleDateString("en-GB") : "—"}
        </Typography>
      ),
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 100,
      align: "center",
      renderCell: (params) => {
        const row = params.row;
        
        return (
          <IconButton
            onClick={(e) => handleMenuClick(e, row)}
            size="small"
            aria-label="more actions"
          >
            <MoreVertIcon />
          </IconButton>
        );
      },
    }
    ];
  }, [navigate]);

  /* ---- Top-level renders ---- */
  if (igConnected === null) {
    return (
      <Box sx={{ p: 3 }}>
        {igCheckErr ? (
          <Alert severity="error">{igCheckErr}</Alert>
        ) : (
          <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}>
            <CircularProgress />
          </Box>
        )}
      </Box>
    );
  }

  if (!igConnected) {
    return (
      <Box sx={{ p: { xs: 2, md: 10 } }}>

        <Card
          elevation={0}
          sx={{
            border: "1px solid",
            borderColor: "#e0e0e0",
            borderRadius: 3,
            bgcolor: "#fff",
            overflow: "hidden",
          }}
        >
          <CardContent sx={{ p: { xs: 3, sm: 4, md: 4 } }}>
            <Stack alignItems="center" spacing={3} sx={{ py: { xs: 2, sm: 3 }, textAlign: "center" }}>
              {/* Instagram icon */}
              <Box
                sx={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  background: "linear-gradient(135deg, #f9ce34, #ee2a7b, #6228d7)",
                }}
              >
                <InstagramIcon sx={{ fontSize: 36, color: "#fff" }} />
              </Box>

              <Stack spacing={1} sx={{ textAlign : isDesktop ? 'center' : 'left', mb: 4}}>
                <Typography sx={{ fontFamily: "Inter", fontSize: { xs: 16, sm: 22 }, fontWeight: 600, color: "#1a1a1a" }}>
                  Connect your Instagram to get started.
                </Typography>
                <Typography sx={{ color: "text.secondary", maxWidth: isDesktop ? 620 : "100%", mx: "auto", fontFamily: "Inter", lineHeight: 1.5, fontSize : isDesktop ? 16 : 14}}>
                  Link your Instagram Creator(Professional) or Business account to unlock automations — auto-reply to comments, send DMs, capture leads, and manage everything from one dashboard.
                </Typography>
              </Stack>

              {connectError && <Alert severity="error" sx={{ maxWidth: 560 }}>{connectError}</Alert>}

              {/* Connect button */}
              <Button
                variant="contained"
                startIcon={!connectLoading && <InstagramIcon />}
                onClick={() => setProCheckDialogOpen(true)}
                disabled={connectLoading}
                sx={{
                  mt: "42px !important",
                  textTransform: "none",
                  borderRadius: 2,
                  px: 3.5,
                  py: 1.25,
                  minWidth: 240,
                  fontSize: isDesktop ? "1rem" : "0.85rem",
                  fontWeight: 600,
                  fontFamily: "Inter",
                  color: "white",
                  background: "linear-gradient(45deg, #405de6, #5851db, #833ab4, #c13584, #e1306c, #fd1d1d)",
                  boxShadow: "0 4px 14px rgba(131, 58, 180, 0.3)",
                  "&:hover": {
                    boxShadow: "0 6px 20px rgba(131, 58, 180, 0.4)",
                  }
                }}
              >
                {connectLoading ? <CircularProgress size={22} sx={{ color: "white" }} /> : "Connect Instagram"}
              </Button>

              {/* Trust indicators */}
              <Stack spacing={1.5} alignItems="center" sx={{ mt: 1 }}>
                {/* Meta Approved badge */}
                <Stack direction="row" alignItems="center" spacing={1} sx={{
                  bgcolor: "#f0f2ff",
                  border: "1px solid #d0d5f5",
                  borderRadius: 2,
                  px: 2,
                  py: 0.75
                }}>
                   <Typography variant="caption" sx={{ fontFamily: "Inter", fontWeight: 600, color: "#3c4ac0" }}>
                    Approved by Meta
                  </Typography>
                  <Box
                    component="img"
                    src={require("../../images/meta.png")}
                    alt="Meta"
                    sx={{ height: 18, width: "auto" }}
                  />
                 
                </Stack>

               
              </Stack>

          
            </Stack>

                <Box sx={{ display : "flex", justifyContent : isDesktop ? "center" : ""}}>
                 {/* Trust points */}
                <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 0.5, sm: 2 }} sx={{ alignItems : isDesktop ? "center" : "left"}}>
                  <Stack direction="row" spacing={0.5} sx={{ textAlign : isDesktop ? "center" : "left"}}>
                    <CheckCircleOutlineIcon sx={{ fontSize: 14, color: "#10b981" }} />
                    <Typography variant="caption" sx={{ color: "text.secondary", fontFamily: "Inter" }}>
                      Secure Facebook Business Login.
                    </Typography>
                  </Stack>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <CheckCircleOutlineIcon sx={{ fontSize: 14, color: "#10b981" }} />
                    <Typography variant="caption" sx={{ color: "text.secondary", fontFamily: "Inter" }}>
                      Meta approved flows.
                    </Typography>
                  </Stack>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <CheckCircleOutlineIcon sx={{ fontSize: 14, color: "#10b981" }} />
                    <Typography variant="caption" sx={{ color: "text.secondary", fontFamily: "Inter" }}>
                      Disconnect anytime.
                    </Typography>
                  </Stack>
                   <Stack direction="row" alignItems="center" spacing={0.5}>
                    <CheckCircleOutlineIcon sx={{ fontSize: 14, color: "#10b981" }} />
                    <Typography variant="caption" sx={{ color: "text.secondary", fontFamily: "Inter" }}>
                      Takes about 10 seconds to connect.
                    </Typography>
                  </Stack>
                </Stack>

              </Box>


          </CardContent>
        </Card>

        {/* Professional Account Check Dialog */}
        <Dialog
          open={proCheckDialogOpen}
          onClose={() => setProCheckDialogOpen(false)}
          maxWidth="sm"
          fullWidth
          fullScreen={!isDesktop}
          PaperProps={{
            sx: isDesktop
              ? { borderRadius: 3 }
              : {
                  borderRadius: "16px 16px 0 0",
                  mt: "15vh",
                  maxHeight: "76vh",
                  alignSelf: "flex-end"
                }
          }}
        >
          <DialogTitle sx={{ pb: 1 }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
            
              <Typography variant="h6" sx={{ fontWeight: 700, fontFamily: "Inter", fontSize: { xs: 16, sm: 18 } }}>
                Is your Instagram a Professional account?
              </Typography>
            </Stack>
          </DialogTitle>

          <DialogContent>
            <Typography sx={{ color: "text.secondary", fontFamily: "Inter", lineHeight: 1.7, mb: 2.5, fontSize: { xs: "0.813rem", sm: "0.875rem" } }}>
              To connect with our platform, your Instagram account must be a <strong>Business</strong> or <strong>Creator</strong> account (Professional account). Personal accounts cannot be connected through Meta's Business Login.
            </Typography>

            {/* Info box */}
            <Box sx={{
              bgcolor: "#fff8e1",
              border: "1px solid #ffe082",
              borderRadius: 2,
              p: 2,
              mb: 2
            }}>
              <Typography sx={{ fontFamily: "Inter", fontWeight: 600, color: "#f57f17", mb: 1, fontSize: { xs: "0.813rem", sm: "0.875rem" } }}>
                Not sure? Here's how to check:
              </Typography>
              <Typography sx={{ fontFamily: "Inter", color: "text.secondary", lineHeight: 1.6, fontSize: { xs: "0.813rem", sm: "0.875rem" } }}>
                Open Instagram → Settings → Account type and tools → Switch to Professional account. If you already see "Switch to Personal account", you're good to go!
              </Typography>
            </Box>

            {/* YouTube video link */}
            <Box
              component="a"
              href="https://www.youtube.com/watch?v=5Od0v0jVpSU"
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                bgcolor: "#f5f5f5",
                border: "1px solid #e0e0e0",
                borderRadius: 2,
                p: 2,
                textDecoration: "none",
                color: "inherit",
                transition: "all 0.2s",
                "&:hover": {
                  bgcolor: "#eeeeee",
                  borderColor: "#bdbdbd"
                }
              }}
            >
              <PlayCircleOutlineIcon sx={{ fontSize: { xs: 30, sm: 36 }, color: "#ff0000" }} />
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontFamily: "Inter", fontWeight: 600, color: "#1a1a1a", fontSize: { xs: "0.813rem", sm: "0.875rem" } }}>
                  Switch To Professional Account On Instagram
                </Typography>
                <Typography sx={{ fontFamily: "Inter", color: "text.secondary", fontSize: { xs: "0.688rem", sm: "0.75rem" } }}>
                  Step-by-step video guide — takes less than 2 minutes
                </Typography>
              </Box>
              <OpenInNewIcon sx={{ fontSize: { xs: 16, sm: 18 }, color: "text.disabled" }} />
            </Box>
          </DialogContent>

          <DialogActions sx={{ px: 2, py: 3, gap: 1 }}>
            <Button
              onClick={() => setProCheckDialogOpen(false)}
              variant="outlined"
              sx={{ textTransform: "none", fontFamily: "Inter", borderColor: "#d0d0d0", color: "text.secondary", fontSize: { xs: "0.813rem", sm: "0.875rem" } }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={() => {
                setProCheckDialogOpen(false);
                handleConnectInstagram();
              }}
              sx={{
                textTransform: "none",
                fontFamily: "Inter",
                fontWeight: 600,
                fontSize: { xs: "0.813rem", sm: "0.875rem" },
                background: "linear-gradient(45deg, #405de6, #5851db, #833ab4, #c13584, #e1306c, #fd1d1d)",
                color: "white",
                px: 2
              }}
            >
              Connect Instagram →
            </Button>
          </DialogActions>
        </Dialog>

        {/* Duplicate Account Conflict Dialog */}
         <ClickAwayListener onClickAway={handleClickAway}>
        <Dialog
          open={duplicateDialogOpen}
          onClose={handleDuplicateDialogClose}
           disableEscapeKeyDown
            keepMounted
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
            <Stack sx={{ display : 'flex', flexDirection : 'row', gap: 2, pb: 2}}>

            <Button
              startIcon={<LogoutIcon />}
              onClick={handleSignOut}
              autoFocus
              variant="contained"
              sx={{ textTransform : 'none', background : '#70B2B2'}}
            >
              Logout
            </Button>
             <Button
              onClick={() => setDuplicateDialogOpen(false)}
              autoFocus
              variant="contained"
              sx={{ backrgound : '#8C00FF', textTransform : 'none'}}
            >
              Okay
            </Button>
            </Stack>

          </DialogActions>
        </Dialog>
        </ClickAwayListener>
      </Box>
    );
  }

  if (err) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        <Alert severity="error">{err}</Alert>
      </Box>
    );
  }

  const HeaderBar = (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      alignItems={{ xs: "flex-start", sm: "center" }}
      justifyContent="space-between"
      sx={{ mb: 2.5, gap: 1.25 }}
    >
      <Typography sx={{ fontFamily: "Inter", fontSize: isDesktop ? "20px" : "18px", fontWeight: 600, letterSpacing: 0.2 }}>
        Automation Section
      </Typography>
      <Tooltip
        title={dmLimitExceeded ? "DM limit reached. Upgrade your plan." : ""}
        disableHoverListener={!dmLimitExceeded || !isDesktop}
        onOpen={() => { if (dmLimitExceeded && isDesktop) setDmLimitDialogOpen(true); }}
      >
        <span
          style={{ alignSelf: isDesktop ? "auto" : "stretch" }}
          onClick={() => {
            if (dmLimitExceeded) {
              setDmLimitDialogOpen(true);
            }
          }}
        >
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            disabled={dmLimitExceeded}
            onClick={() => {
              if (dmLimitExceeded) {
                setDmLimitDialogOpen(true);
              } else {
                navigate("/professional/fetch_media");
              }
            }}
            sx={{
              fontFamily: "Inter",
              fontSize: "15px",
              fontWeight: 500,
              textTransform: "none",
              width: { xs: "100%", sm: "auto" },
              pointerEvents: "auto",
            }}
          >
            New Automation
          </Button>
        </span>
      </Tooltip>
    </Stack>
  );

  const showInitialSpinner = initializing || (loading && rows.length === 0);
  const showEmpty = !initializing && hasFetchedOnce && !loading && rowCount === 0;

  // Desktop (DataGrid Replacement)
  if (isDesktop) {
    return (
      <Box sx={{ p: { xs: 2, md: 2 } }}>
        {HeaderBar}
        <div style={{ width: "100%" }}>
          {showInitialSpinner ? (
            <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}>
              <CircularProgress />
            </Box>
          ) : showEmpty ? (
            <EmptyState onCreate={() => navigate("/professional/fetch_media")} dmLimitExceeded={dmLimitExceeded} onDmLimitClick={() => setDmLimitDialogOpen(true)} />
          ) : (
            <Paper sx={{ width: '100%', overflow: 'hidden' }}>
              <TableContainer sx={{ maxHeight: 640 }}>
                <Table stickyHeader aria-label="sticky table">
                  <TableHead>
                    <TableRow>
                      {columns.map((column) => (
                        <TableCell
                          key={column.field}
                          align={column.align || 'left'}
                          style={{ minWidth: column.width }}
                          sx={{ fontWeight: 'bold' }}
                        >
                          {column.headerName}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((row) => {
                      return (
                        <TableRow 
                          hover 
                          role="checkbox" 
                          tabIndex={-1} 
                          key={row.id}
                          sx={{ 
                            opacity: row.postLive === false ? 0.7 : 1,
                            bgcolor: row.postLive === false ? "action.hover" : "inherit"
                          }}
                        >
                          {columns.map((column) => {
                            const value = row[column.field];
                            return (
                              <TableCell key={column.field} align={column.align || 'left'}>
                                {column.renderCell 
                                  ? column.renderCell({ value, row }) 
                                  : value}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
             <TablePagination
                rowsPerPageOptions={[]}         // <-- hide the select
                component="div"
                count={rowCount}
                rowsPerPage={pageSize}
                page={page}
                onPageChange={(e, newPage) => setPage(newPage)}
                onRowsPerPageChange={(e) => {    // this can remain (safe to keep)
                  setPageSize(parseInt(e.target.value, 10));
                  setPage(0);
                }}
                labelRowsPerPage=""             // <-- hide the "Rows per page" label
              />

            </Paper>
          )}
        </div>

        {/* Actions Menu */}
        <Menu
          anchorEl={anchorEl}
          open={openMenu}
          onClose={handleMenuClose}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'right',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'right',
          }}
        >
        <MenuItem onClick={handleEditAutomation}>
  Edit Automation
</MenuItem>

<MenuItem onClick={handleStopAutomation}>
  {selectedRow?.status === "active" ? "Stop Automation" : "Resume Automation"}
</MenuItem>

<MenuItem onClick={handleDeleteAutomation} sx={{ color: 'error.main' }}>
  Delete Automation
</MenuItem>

         

     </Menu>

        {/* Delete Confirmation Dialog */}
        <Dialog 
          open={deleteDialogOpen} 
          onClose={() => setDeleteDialogOpen(false)} 
          maxWidth="xs" 
          fullWidth
        >
          <DialogTitle sx={{ color: 'error.main', fontWeight: 700 }}>
            Confirm Deletion
          </DialogTitle>
          <DialogContent>
            <Alert severity="warning" sx={{ mb: 2 }}>
              This action cannot be undone. Are you sure you want to delete the automation for Post ID: <strong>{selectedRow?.postId}</strong>?
            </Alert>
            <Typography variant="body2">
              Deleting the automation will immediately stop the service and remove all associated data and configurations.
            </Typography>
          </DialogContent>
         <DialogActions>
  <Button 
    onClick={() => {
      setDeleteDialogOpen(false);
      handleMenuClose(); // Close menu when canceling
    }} 
    color="inherit"
  >
    Cancel
  </Button>
  <Button 
    variant="contained" 
    color="error" 
    onClick={confirmDeleteAutomation}
    sx={{ textTransform: 'none' }}
  >
    Yes, Delete Permanently
  </Button>
</DialogActions>
        </Dialog>

        <DmLimitReachedDialog
          open={dmLimitDialogOpen}
          onClose={() => setDmLimitDialogOpen(false)}
          onUpgrade={() => navigate("/professional/upgrade/plan")}
          dmUsageData={dmUsageData}
        />

      </Box>
    );
  }

  // Mobile (cards)
  return (
    <Box sx={{ px: 2, py: 1 }}>
      {HeaderBar}

      {showInitialSpinner ? (
        <Box>
          {[...Array(5)].map((_, i) => (
            <Card key={i} variant="outlined" sx={{ borderRadius: 2.5, mb: 1.5 }}>
              <Box sx={{ display: "flex", gap: 1.25, p: 1.25 }}>
                <Skeleton variant="rounded" width={64} height={64} />
                <Box sx={{ flex: 1 }}>
                  <Skeleton width="50%" />
                  <Skeleton width="80%" />
                  <Skeleton width="30%" />
                </Box>
              </Box>
            </Card>
          ))}
        </Box>
      ) : rows.length === 0 ? (
        <EmptyState onCreate={() => navigate("/professional/fetch_media")} dmLimitExceeded={dmLimitExceeded} onDmLimitClick={() => setDmLimitDialogOpen(true)} />
      ) : (
        <>
          <Box>
            {rows.map((row) => (
              <AutomationCard
                key={row.id}
                row={row}
               onDetails={(rowData) => {
        if (!rowData?.postId) return;
        
        // Navigate with edit mode enabled
        navigate(`/professional/setup-automation/${encodeURIComponent(rowData.postId)}`, {
          state: {
            isEditMode: true,
            editData: {
              postId: rowData.postId,
              dmMessage: rowData.dmMessage || "",
              buttonText: rowData.buttonText || "Send Link",
              flowNodes: rowData.flowNodes || [],
              keywords: rowData.keywords || [],
              hasReply: rowData.hasReply || false,
              replyComments: rowData.replyComments || [],
              caption: rowData.caption || "",
              thumbnail: rowData.thumbnail || "",
              status: rowData.status || "inactive"
            },
            post_id: rowData.postId,
            id: rowData.postId,
            caption: rowData.caption || "",
            thumbnail_url: rowData.thumbnail || ""
          }
        });
      }}
              />
            ))}
          </Box>

          {mobileHasMore && (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
              <Button
                variant="outlined"
                onClick={async () => {
                  const next = mobilePage + 1;
                  setMobilePage(next);
                  await fetchMobile(next);
                }}
                disabled={loading}
                sx={{ textTransform: "none", borderRadius: 2, px: 2.5, minWidth: 220 }}
              >
                {loading ? <CircularProgress size={20} /> : "Load more"}
              </Button>
            </Box>
          )}

          {loading && !mobileHasMore && (
            <Box sx={{ display: "flex", justifyContent: "center", my: 1 }}>
              <CircularProgress size={20} />
            </Box>
          )}
        </>
      )}

      <DmLimitReachedDialog
        open={dmLimitDialogOpen}
        onClose={() => setDmLimitDialogOpen(false)}
        onUpgrade={() => navigate("/professional/upgrade/plan")}
        dmUsageData={dmUsageData}
      />

    </Box>
  );
}
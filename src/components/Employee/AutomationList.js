import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
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
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import InstagramIcon from "@mui/icons-material/Instagram";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import { logout } from "../../store/professionalSlice";
import { useDispatch } from "react-redux";
import LogoutIcon from "@mui/icons-material/Logout";
import { useNavigate } from "react-router-dom";
import axios from "axios";
// import { toast } from "react-toastify"; // Commented out to prevent build errors in this env
// import "react-toastify/dist/ReactToastify.css";

/* ---------------- Small components ---------------- */
function EmptyState({ onCreate }) {
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
        <InfoOutlinedIcon fontSize="large" />
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
        onClick={onCreate}
        sx={{ textTransform: "none", borderRadius: 2, px: 2.5 }}
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
      <CardActionArea onClick={() => onDetails(row?.postId)} disableRipple>
        <Box sx={{ display: "flex", gap: 1.25, p: 1.25 }}>
          <Avatar
            variant="rounded"
            src={row.thumbnail}
            alt={row.caption || "thumbnail"}
            sx={{ width: 64, height: 64, flexShrink: 0 }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5, flexWrap: "wrap" }}>
              <Chip
                size="small"
                label={String(row.status || "").toUpperCase()}
                color={row.status === "active" ? "success" : "default"}
                variant="outlined"
              />
              <Tooltip title={row.postLive ? "Post is live on Instagram" : "Post deleted from Instagram"}>
                <Chip
                  size="small"
                  icon={row.postLive ? <CheckCircleOutlineIcon /> : <CancelOutlinedIcon />}
                  label={row.postLive ? "LIVE" : "DELETED"}
                  color={row.postLive ? "success" : "error"}
                  variant="outlined"
                />
              </Tooltip>
              <Typography
                variant="caption"
                sx={{ color: "text.secondary" }}
                title={new Date(row.createdAt).toLocaleString()}
              >
                {new Date(row.createdAt).toLocaleDateString()}
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

            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1 }}>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Replies Sent: <strong>{row.prettyReplies}</strong>
              </Typography>
              <ArrowForwardIosIcon sx={{ fontSize: 16, color: "text.disabled" }} />
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
  const FB_LOGIN_CONFIG_ID = "1309356804298214";
  const REDIRECT_URI = "https://myhandle.in/api/usersOn/meta-callback";

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
  const [duplicateMessage, setDuplicateMessage] = useState("");

  const mobileInitialLoadedRef = useRef(false);
  const controllerRef = useRef(null);

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

  /* ---- Initial mount-only bootstrap ---- */
  useEffect(() => {
    (async () => {
      const ok = await checkIgConnection();
      if (!ok) {
        setHasFetchedOnce(true);
        setInitializing(false);
        setLoading(false);
        return;
      }
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
const handleConnectInstagram = useCallback(async () => {
  setConnectError("");
  setConnectLoading(true);

  try {
    const { data: stateResp } = await axios.post(META_STATE_URL, {}, { withCredentials: true });
    const state = stateResp?.state;
    if (!state) throw new Error("Unable to start Meta login");

    const q = new URLSearchParams({
      client_id: FB_APP_ID,
      redirect_uri: REDIRECT_URI,
      state,
      response_type: "code",
      config_id: FB_LOGIN_CONFIG_ID,
    });
    const authUrl = `https://www.facebook.com/v24.0/dialog/oauth?${q.toString()}`;

    const popup = openCenteredPopup(authUrl);
    if (!popup) {
      // fallback: we navigated current window, so message path won’t work
      // you could optionally show a banner on the /meta-callback page instead
      return;
    }

    const poll = setInterval(async () => {
      if (popup.closed) {
        clearInterval(poll);

        try {
          const ok = await checkIgConnection();
          if (ok) {
            if (isDesktop) {
              await fetchPage(0, pageSize);
            } else {
              mobileInitialLoadedRef.current = false;
              setMobilePage(0);
              await fetchMobile(0);
            }
          }
        } finally {
          setConnectLoading(false);
        }
      }
    }, 500);

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
  checkIgConnection,
  fetchPage,
  fetchMobile,
  pageSize,
  isDesktop,
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
        width: 300,
        renderCell: ({ value, row }) => {
          const full = (value || "").trim();
          const text = full.length > 100 ? `${full.slice(0, 100)}…` : full;
          return (
            <Box sx={{ display: "flex", alignItems: "center", height: "100%", width: "100%" }}>
              <Typography 
                variant="body2" 
                noWrap 
                title={full} 
                sx={{ 
                  maxWidth: "100%",
                  opacity: row.postLive === false ? 0.6 : 1,
                }}
              >
                {text || "—"}
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
            color={params.value === "active" ? "success" : "default"}
            variant="outlined"
          />
        ),
      },
      {
        field: "postLive",
        headerName: "Post Live",
        width: 130,
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
      {
        field: "totalReplies",
        headerName: "Replies Sent",
        width: 140,
        renderCell: (params) => {
          const raw = Number(params.value || 0);
          const pretty = formatNumber(raw, { digits: 1 });
          return (
            <Typography
              sx={{ textAlign: "center", alignItems: "center", mt: 1.5 }}
              title={raw.toLocaleString()}
              aria-label={`Replies sent ${raw}`}
            >
              {pretty}
            </Typography>
          );
        },
      },
      {
        field: "details",
        headerName: "Details",
        width: 140,
        renderCell: (params) => {
          const id = params.row?.postId;
          const handleClick = (e) => {
            e.stopPropagation();
            if (id) navigate(`/professional/automation/details/${encodeURIComponent(id)}`);
          };
          return (
            <Button
              size="small"
              variant="outlined"
              onClick={handleClick}
              disabled={!id}
              sx={{ textTransform: "none", borderRadius: 2, px: 1.5 }}
            >
              Details
            </Button>
          );
        },
      },
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
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          alignItems={{ xs: "flex-start", sm: "center" }}
          justifyContent="space-between"
          sx={{ mb: 3, gap: 1.5 }}
        >
          <Typography sx={{ fontFamily: "Inter", fontSize: 20, fontWeight: 600, letterSpacing: 0.2 }}>
            Automation Section
          </Typography>
        </Stack>

        <Card
          elevation={0}
          sx={{ border: "1px dashed", borderColor: "divider", borderRadius: 3, bgcolor: "background.default" }}
        >
          <CardContent>
            <Stack alignItems="center" spacing={2.5} sx={{ py: 3, textAlign: "center" }}>
              <Box
                sx={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  bgcolor: "action.hover",
                }}
              >
                <InstagramIcon fontSize="large" />
              </Box>
              <Stack spacing={0.5}>
                <Typography sx={{ fontFamily: "Inter", fontSize: 20, fontWeight: 600 }}>
                  Connect your Instagram to continue
                </Typography>
                <Typography variant="body2" sx={{ color: "text.secondary", maxWidth: 560, mx: "auto" }}>
                  To set up automations, connect an Instagram account. Once connected, you can create
                  auto-replies, DMs, and track everything here.
                </Typography>
              </Stack>

              {connectError && <Alert severity="error" sx={{ maxWidth: 560 }}>{connectError}</Alert>}

              <Button
                variant="contained"
                startIcon={!connectLoading && <InstagramIcon />}
                onClick={handleConnectInstagram}
                disabled={connectLoading}
                sx={{ textTransform: "none", borderRadius: 2, px: 2.5, minWidth: 220 }}
              >
                {connectLoading ? <CircularProgress size={20} sx={{ color: "white" }} /> : "Connect Instagram"}
              </Button>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Secure via Facebook Business Login • Takes ~10 seconds
              </Typography>
            </Stack>
          </CardContent>
        </Card>

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
      <Typography sx={{ fontFamily: "Inter", fontSize: "20px", fontWeight: 600, letterSpacing: 0.2 }}>
        Automation Section
      </Typography>
      <Button
        variant="outlined"
        startIcon={<AddIcon />}
        onClick={() => navigate("/professional/fetch_media")}
        sx={{
          fontFamily: "Inter",
          fontSize: "15px",
          fontWeight: 500,
          textTransform: "none",
          alignSelf: { xs: "stretch", sm: "auto" },
        }}
      >
        New Automation
      </Button>
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
            <EmptyState onCreate={() => navigate("/professional/fetch_media")} />
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
                rowsPerPageOptions={[5, 10, 25, 50]}
                component="div"
                count={rowCount}
                rowsPerPage={pageSize}
                page={page}
                onPageChange={(e, newPage) => setPage(newPage)}
                onRowsPerPageChange={(e) => {
                  setPageSize(parseInt(e.target.value, 10));
                  setPage(0);
                }}
              />
            </Paper>
          )}
        </div>
      </Box>
    );
  }

  // Mobile (cards)
  return (
    <Box sx={{ px: 0.5, py: 1 }}>
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
        <EmptyState onCreate={() => navigate("/professional/fetch_media")} />
      ) : (
        <>
          <Box>
            {rows.map((row) => (
              <AutomationCard
                key={row.id}
                row={row}
                onDetails={(postId) =>
                  postId && navigate(`/professional/automation/details/${encodeURIComponent(postId)}`)
                }
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
    </Box>
  );
}
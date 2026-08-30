import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { adminLogout } from "../../store/adminSlice";
import { toast } from "react-toastify";
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  TextField,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  Stack,
  InputAdornment,
  Avatar,
  useMediaQuery,
  useTheme,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Fade,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import PeopleAltRoundedIcon from "@mui/icons-material/PeopleAltRounded";
import VerifiedRoundedIcon from "@mui/icons-material/VerifiedRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import FilterListRoundedIcon from "@mui/icons-material/FilterListRounded";
import CalendarTodayRoundedIcon from "@mui/icons-material/CalendarTodayRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

const baseUrl = "/api/usersOn";

// Instagram SVG icon component
const InstagramIcon = ({ size = 20, connected = false }) => (
  <Box
    sx={{
      width: size + 10,
      height: size + 10,
      borderRadius: "8px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: connected
        ? "linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)"
        : "#bdbdbd",
      flexShrink: 0,
    }}
  >
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="2" width="20" height="20" rx="5" stroke="white" strokeWidth="2" />
      <circle cx="12" cy="12" r="5" stroke="white" strokeWidth="2" />
      <circle cx="17.5" cy="6.5" r="1.5" fill="white" />
    </svg>
  </Box>
);

// Date helpers
function getDateRange(preset) {
  const now = new Date();
  const to = now.toISOString().split("T")[0];
  if (preset === "7d") {
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    return { from: from.toISOString().split("T")[0], to };
  }
  if (preset === "30d") {
    const from = new Date(now);
    from.setDate(from.getDate() - 30);
    return { from: from.toISOString().split("T")[0], to };
  }
  return { from: "", to: "" }; // lifetime
}

const DATE_OPTIONS = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "lifetime", label: "Lifetime" },
  { value: "custom", label: "Custom" },
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalUsers: 0, totalSubscriptions: 0 });
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  // Date filter
  const [datePreset, setDatePreset] = useState("lifetime");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // Filters
  const [igFilter, setIgFilter] = useState("all"); // "all" | "true" | "false"
  const [filterAnchor, setFilterAnchor] = useState(null);
  const filterOpen = Boolean(filterAnchor);

  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDetails, setUserDetails] = useState(null);

  // Verify session
  useEffect(() => {
    const verify = async () => {
      try {
        const res = await axios.get(`${baseUrl}/verify-admin-token`, { withCredentials: true });
        if (!res.data.valid) throw new Error();
      } catch {
        toast.error("Session expired. Please log in again.");
        dispatch(adminLogout());
        navigate("/admin/login");
      }
    };
    verify();
  }, []);

  // Compute date params
  const getDateParams = useCallback(() => {
    if (datePreset === "custom") {
      return { from: customFrom, to: customTo };
    }
    return getDateRange(datePreset);
  }, [datePreset, customFrom, customTo]);

  // Fetch stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { from, to } = getDateParams();
        const params = {};
        if (from) params.from = from;
        if (to) params.to = to;
        const res = await axios.get(`${baseUrl}/dashboard-stats`, {
          params,
          withCredentials: true,
        });
        if (res.data.success) setStats(res.data);
      } catch (err) {
        console.error("Stats fetch error:", err);
      }
    };
    fetchStats();
  }, [getDateParams]);

  // Fetch users
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = getDateParams();
      const params = { page, limit: 10, search };
      if (igFilter !== "all") params.igConnected = igFilter;
      if (from) params.from = from;
      if (to) params.to = to;

      const res = await axios.get(`${baseUrl}/users-list`, {
        params,
        withCredentials: true,
      });
      if (res.data.success) {
        setUsers(res.data.users);
        setTotalPages(res.data.totalPages);
        setTotalCount(res.data.totalCount);
      }
    } catch (err) {
      console.error("Users fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [page, search, igFilter, getDateParams]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Fetch user details
  const handleMoreDetails = async (user) => {
    setSelectedUser(user);
    setDetailOpen(true);
    setDetailLoading(true);
    setUserDetails(null);
    try {
      const res = await axios.get(`${baseUrl}/user-details/${user._id}`, { withCredentials: true });
      if (res.data.success) setUserDetails(res.data);
    } catch {
      toast.error("Failed to fetch user details");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${baseUrl}/admin-logout`, {}, { withCredentials: true });
    } catch {}
    dispatch(adminLogout());
    navigate("/admin/login");
  };

  const activeFilterCount = igFilter !== "all" ? 1 : 0;

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "#0f0f11",
        color: "#e4e4e7",
        fontFamily: "Inter, sans-serif",
      }}
    >
      {/* Top bar */}
      <Box
        sx={{
          px: { xs: 2, md: 5 },
          py: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #1e1e24",
          backdropFilter: "blur(12px)",
          position: "sticky",
          top: 0,
          zIndex: 10,
          bgcolor: "rgba(15,15,17,0.85)",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: "10px",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              fontWeight: 800,
              color: "#fff",
            }}
          >
            M
          </Box>
          <Typography sx={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.3px" }}>
            Admin
          </Typography>
        </Box>

        <Tooltip title="Logout" arrow>
          <IconButton
            onClick={handleLogout}
            sx={{ color: "#71717a", "&:hover": { color: "#ef4444", bgcolor: "rgba(239,68,68,0.08)" } }}
          >
            <LogoutRoundedIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ px: { xs: 2, md: 5 }, py: { xs: 3, md: 4 }, maxWidth: 1360, mx: "auto" }}>
        {/* Date filter row */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 3, flexWrap: "wrap" }}>
          <CalendarTodayRoundedIcon sx={{ fontSize: 16, color: "#71717a" }} />
          <Stack direction="row" spacing={0.5}>
            {DATE_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                size="small"
                onClick={() => { setDatePreset(opt.value); setPage(1); }}
                sx={{
                  textTransform: "none",
                  fontFamily: "Inter",
                  fontSize: 13,
                  fontWeight: datePreset === opt.value ? 600 : 400,
                  borderRadius: "8px",
                  px: 1.8,
                  py: 0.5,
                  color: datePreset === opt.value ? "#fff" : "#a1a1aa",
                  bgcolor: datePreset === opt.value ? "#27272a" : "transparent",
                  border: datePreset === opt.value ? "1px solid #3f3f46" : "1px solid transparent",
                  "&:hover": { bgcolor: "#27272a", color: "#fff" },
                  minWidth: 0,
                }}
              >
                {opt.label}
              </Button>
            ))}
          </Stack>

          {datePreset === "custom" && (
            <Fade in>
              <Stack direction="row" spacing={1} sx={{ ml: { md: 1 } }}>
                <TextField
                  type="date"
                  size="small"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  sx={dateInputSx}
                  InputLabelProps={{ shrink: true }}
                  label="From"
                />
                <TextField
                  type="date"
                  size="small"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  sx={dateInputSx}
                  InputLabelProps={{ shrink: true }}
                  label="To"
                />
              </Stack>
            </Fade>
          )}
        </Box>

        {/* Stat cards */}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 4 }}>
          <StatCard
            icon={<PeopleAltRoundedIcon sx={{ fontSize: 24 }} />}
            label="Total Users"
            value={stats.totalUsers}
            gradient="linear-gradient(135deg, #6366f1, #8b5cf6)"
          />
          <StatCard
            icon={<VerifiedRoundedIcon sx={{ fontSize: 24 }} />}
            label="Active Subscriptions"
            value={stats.totalSubscriptions}
            gradient="linear-gradient(135deg, #10b981, #34d399)"
          />
        </Stack>

        {/* Search + Filters bar */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            mb: 3,
            flexWrap: "wrap",
          }}
        >
          <TextField
            size="small"
            placeholder="Search users..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            sx={{
              flex: 1,
              minWidth: 220,
              "& .MuiOutlinedInput-root": {
                bgcolor: "#18181b",
                borderRadius: "10px",
                color: "#e4e4e7",
                fontFamily: "Inter",
                fontSize: 14,
                "& fieldset": { borderColor: "#27272a" },
                "&:hover fieldset": { borderColor: "#3f3f46" },
                "&.Mui-focused fieldset": { borderColor: "#6366f1" },
              },
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: "#52525b", fontSize: 20 }} />
                </InputAdornment>
              ),
            }}
          />

          {/* Filter button */}
          <Button
            size="small"
            startIcon={<FilterListRoundedIcon sx={{ fontSize: 18 }} />}
            onClick={(e) => setFilterAnchor(e.currentTarget)}
            sx={{
              textTransform: "none",
              fontFamily: "Inter",
              fontSize: 13,
              fontWeight: 500,
              borderRadius: "10px",
              px: 2,
              py: 0.9,
              color: activeFilterCount > 0 ? "#a78bfa" : "#a1a1aa",
              bgcolor: activeFilterCount > 0 ? "rgba(139,92,246,0.1)" : "#18181b",
              border: activeFilterCount > 0 ? "1px solid #6366f1" : "1px solid #27272a",
              "&:hover": { bgcolor: "#27272a" },
            }}
          >
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </Button>
          <Menu
            anchorEl={filterAnchor}
            open={filterOpen}
            onClose={() => setFilterAnchor(null)}
            PaperProps={{
              sx: {
                bgcolor: "#18181b",
                border: "1px solid #27272a",
                borderRadius: "12px",
                minWidth: 200,
                mt: 1,
              },
            }}
          >
            <Typography
              sx={{
                px: 2,
                py: 1,
                fontSize: 12,
                color: "#71717a",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Instagram
            </Typography>
            {[
              { val: "all", label: "All users" },
              { val: "true", label: "Connected" },
              { val: "false", label: "Not connected" },
            ].map((opt) => (
              <MenuItem
                key={opt.val}
                selected={igFilter === opt.val}
                onClick={() => {
                  setIgFilter(opt.val);
                  setPage(1);
                  setFilterAnchor(null);
                }}
                sx={{
                  fontFamily: "Inter",
                  fontSize: 14,
                  color: igFilter === opt.val ? "#a78bfa" : "#d4d4d8",
                  "&.Mui-selected": { bgcolor: "rgba(139,92,246,0.1)" },
                  "&:hover": { bgcolor: "#27272a" },
                }}
              >
                {opt.label}
              </MenuItem>
            ))}
          </Menu>

          {/* Active filter chips */}
          {igFilter !== "all" && (
            <Box
              onClick={() => {
                setIgFilter("all");
                setPage(1);
              }}
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
                px: 1.5,
                py: 0.5,
                borderRadius: "8px",
                bgcolor: "rgba(139,92,246,0.1)",
                border: "1px solid rgba(139,92,246,0.25)",
                cursor: "pointer",
                "&:hover": { bgcolor: "rgba(139,92,246,0.18)" },
              }}
            >
              <Typography sx={{ fontSize: 12, color: "#a78bfa", fontFamily: "Inter" }}>
                IG: {igFilter === "true" ? "Connected" : "Not connected"}
              </Typography>
              <CloseRoundedIcon sx={{ fontSize: 14, color: "#a78bfa" }} />
            </Box>
          )}

          {/* Count badge */}
          <Typography sx={{ fontSize: 13, color: "#52525b", fontFamily: "Inter", ml: "auto" }}>
            {totalCount.toLocaleString()} user{totalCount !== 1 ? "s" : ""}
          </Typography>
        </Box>

        {/* Users Table / Cards */}
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
            <CircularProgress size={32} sx={{ color: "#6366f1" }} />
          </Box>
        ) : isMobile ? (
          <Stack spacing={1.5}>
            {users.length === 0 ? (
              <EmptyState />
            ) : (
              users.map((user, i) => (
                <UserCardMobile
                  key={user._id}
                  user={user}
                  index={(page - 1) * 10 + i}
                  onDetails={() => handleMoreDetails(user)}
                />
              ))
            )}
          </Stack>
        ) : (
          <Paper
            sx={{
              bgcolor: "#18181b",
              borderRadius: "14px",
              border: "1px solid #27272a",
              overflow: "hidden",
            }}
            elevation={0}
          >
            <Table>
              <TableHead>
                <TableRow>
                  {["#", "Name", "Instagram", "Followers", "Profile", ""].map((h, idx) => (
                    <TableCell
                      key={h + idx}
                      sx={{
                        fontFamily: "Inter",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#71717a",
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        borderBottom: "1px solid #27272a",
                        bgcolor: "#141416",
                        py: 1.5,
                      }}
                    >
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ borderBottom: "none" }}>
                      <EmptyState />
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user, i) => (
                    <TableRow
                      key={user._id}
                      sx={{
                        "&:hover": { bgcolor: "#1c1c20" },
                        "& td": { borderBottom: "1px solid #1e1e24" },
                      }}
                    >
                      <TableCell sx={{ fontFamily: "Inter", fontSize: 13, color: "#71717a", width: 50 }}>
                        {(page - 1) * 10 + i + 1}
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                          <Avatar
                            src={user.igProfilePic}
                            sx={{ width: 34, height: 34, bgcolor: "#27272a", fontSize: 14 }}
                          >
                            {(user.name || "?")[0]?.toUpperCase()}
                          </Avatar>
                          <Box>
                            <Typography
                              sx={{ fontSize: 14, fontWeight: 500, color: "#e4e4e7", fontFamily: "Inter" }}
                            >
                              {user.name || "—"}
                            </Typography>
                            <Typography sx={{ fontSize: 12, color: "#52525b", fontFamily: "Inter" }}>
                              {user.email}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <InstagramIcon size={18} connected={!!user.instagramConnected} />
                      </TableCell>
                      <TableCell sx={{ fontFamily: "Inter", fontSize: 14, color: "#a1a1aa" }}>
                        {user.instagramConnected
                          ? (user.igFollowersCount || 0).toLocaleString()
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {user.igUsername ? (
                          <Typography
                            component="a"
                            href={`https://www.instagram.com/${user.igUsername}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{
                              fontSize: 13,
                              fontFamily: "Inter",
                              fontWeight: 500,
                              color: "#a78bfa",
                              textDecoration: "none",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 0.5,
                              "&:hover": { color: "#c4b5fd", textDecoration: "underline" },
                            }}
                          >
                            @{user.igUsername}
                            <OpenInNewRoundedIcon sx={{ fontSize: 13 }} />
                          </Typography>
                        ) : (
                          <Typography sx={{ fontSize: 13, color: "#3f3f46" }}>—</Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ width: 110 }}>
                        <Button
                          size="small"
                          onClick={() => handleMoreDetails(user)}
                          sx={{
                            textTransform: "none",
                            fontFamily: "Inter",
                            fontSize: 12,
                            fontWeight: 500,
                            borderRadius: "8px",
                            px: 1.5,
                            py: 0.5,
                            color: "#a1a1aa",
                            border: "1px solid #27272a",
                            "&:hover": { bgcolor: "#27272a", borderColor: "#3f3f46", color: "#e4e4e7" },
                          }}
                        >
                          Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Paper>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 2, mt: 3 }}>
            <Button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              sx={{
                textTransform: "none",
                fontFamily: "Inter",
                fontSize: 13,
                fontWeight: 500,
                borderRadius: "8px",
                px: 2.5,
                py: 0.7,
                color: page <= 1 ? "#3f3f46" : "#a1a1aa",
                border: "1px solid #27272a",
                "&:hover": { bgcolor: "#27272a", color: "#e4e4e7" },
                "&.Mui-disabled": { color: "#3f3f46", borderColor: "#1e1e24" },
              }}
            >
              Prev
            </Button>
            <Typography sx={{ fontSize: 13, color: "#52525b", fontFamily: "Inter" }}>
              {page} / {totalPages}
            </Typography>
            <Button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              sx={{
                textTransform: "none",
                fontFamily: "Inter",
                fontSize: 13,
                fontWeight: 500,
                borderRadius: "8px",
                px: 2.5,
                py: 0.7,
                color: page >= totalPages ? "#3f3f46" : "#a1a1aa",
                border: "1px solid #27272a",
                "&:hover": { bgcolor: "#27272a", color: "#e4e4e7" },
                "&.Mui-disabled": { color: "#3f3f46", borderColor: "#1e1e24" },
              }}
            >
              Next
            </Button>
          </Box>
        )}
      </Box>

      {/* User Details Dialog */}
      <Dialog
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: "#18181b",
            border: "1px solid #27272a",
            borderRadius: "16px",
            color: "#e4e4e7",
            backgroundImage: "none",
          },
        }}
      >
        <DialogTitle
          sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1 }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Avatar
              src={selectedUser?.igProfilePic}
              sx={{ width: 40, height: 40, bgcolor: "#27272a" }}
            >
              {(selectedUser?.name || "?")[0]?.toUpperCase()}
            </Avatar>
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: 16, fontFamily: "Inter" }}>
                {selectedUser?.name || "User"}
              </Typography>
              {selectedUser?.igUsername && (
                <Typography sx={{ fontSize: 12, color: "#71717a", fontFamily: "Inter" }}>
                  @{selectedUser.igUsername}
                </Typography>
              )}
            </Box>
          </Box>
          <IconButton onClick={() => setDetailOpen(false)} sx={{ color: "#52525b" }}>
            <CloseRoundedIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ pt: 2 }}>
          {detailLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 5 }}>
              <CircularProgress size={28} sx={{ color: "#6366f1" }} />
            </Box>
          ) : userDetails ? (
            <Stack spacing={0}>
              <DetailCard
                icon={<SendRoundedIcon sx={{ fontSize: 18 }} />}
                label="DMs Sent (This Month)"
                value={userDetails.dmsSentThisMonth.toLocaleString()}
                color="#6366f1"
              />
              <DetailCard
                icon={<SmartToyRoundedIcon sx={{ fontSize: 18 }} />}
                label="Active Automations"
                value={userDetails.automationsCount.toLocaleString()}
                color="#10b981"
              />
              <DetailCard
                icon={<TrendingUpRoundedIcon sx={{ fontSize: 18 }} />}
                label="Leads Found"
                value={userDetails.leadsFound.toLocaleString()}
                color="#f59e0b"
              />
            </Stack>
          ) : (
            <Typography sx={{ py: 3, textAlign: "center", color: "#52525b", fontFamily: "Inter" }}>
              Failed to load details
            </Typography>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}

// ─── Sub-components ───────────────────────────────────────────

function StatCard({ icon, label, value, gradient }) {
  return (
    <Paper
      elevation={0}
      sx={{
        flex: 1,
        minWidth: 200,
        p: 0,
        borderRadius: "14px",
        bgcolor: "#18181b",
        border: "1px solid #27272a",
        overflow: "hidden",
      }}
    >
      <Box sx={{ p: 2.5, display: "flex", alignItems: "center", gap: 2 }}>
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: gradient,
            color: "#fff",
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Box>
          <Typography
            sx={{
              fontSize: 12,
              color: "#71717a",
              fontFamily: "Inter",
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {label}
          </Typography>
          <Typography
            sx={{ fontSize: 28, fontWeight: 700, fontFamily: "Inter", color: "#fafafa", lineHeight: 1.2 }}
          >
            {value.toLocaleString()}
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
}

function UserCardMobile({ user, index, onDetails }) {
  return (
    <Paper
      elevation={0}
      sx={{
        bgcolor: "#18181b",
        border: "1px solid #27272a",
        borderRadius: "12px",
        p: 2,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5 }}>
        <Avatar
          src={user.igProfilePic}
          sx={{ width: 38, height: 38, bgcolor: "#27272a", fontSize: 14, mt: 0.3 }}
        >
          {(user.name || "?")[0]?.toUpperCase()}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
            <Typography
              sx={{ fontSize: 14, fontWeight: 600, color: "#e4e4e7", fontFamily: "Inter" }}
              noWrap
            >
              {index + 1}. {user.name || "—"}
            </Typography>
            <InstagramIcon size={16} connected={!!user.instagramConnected} />
          </Box>
          <Typography sx={{ fontSize: 12, color: "#52525b", fontFamily: "Inter", mt: 0.2 }} noWrap>
            {user.email}
          </Typography>

          {user.instagramConnected && (
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 1 }}>
              <Typography sx={{ fontSize: 12, color: "#71717a", fontFamily: "Inter" }}>
                {(user.igFollowersCount || 0).toLocaleString()} followers
              </Typography>
              {user.igUsername && (
                <Typography
                  component="a"
                  href={`https://www.instagram.com/${user.igUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    fontSize: 12,
                    color: "#a78bfa",
                    textDecoration: "none",
                    fontFamily: "Inter",
                    fontWeight: 500,
                  }}
                >
                  @{user.igUsername}
                </Typography>
              )}
            </Box>
          )}

          <Button
            size="small"
            fullWidth
            onClick={onDetails}
            sx={{
              mt: 1.5,
              textTransform: "none",
              fontFamily: "Inter",
              fontSize: 12,
              fontWeight: 500,
              borderRadius: "8px",
              py: 0.6,
              color: "#a1a1aa",
              border: "1px solid #27272a",
              "&:hover": { bgcolor: "#27272a", color: "#e4e4e7" },
            }}
          >
            More Details
          </Button>
        </Box>
      </Box>
    </Paper>
  );
}

function DetailCard({ icon, label, value, color }) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        py: 1.8,
        borderBottom: "1px solid #1e1e24",
        "&:last-child": { borderBottom: "none" },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Box
          sx={{
            width: 34,
            height: 34,
            borderRadius: "9px",
            bgcolor: `${color}18`,
            color: color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </Box>
        <Typography sx={{ fontSize: 14, color: "#a1a1aa", fontFamily: "Inter" }}>
          {label}
        </Typography>
      </Box>
      <Typography sx={{ fontSize: 18, fontWeight: 700, color: "#fafafa", fontFamily: "Inter" }}>
        {value}
      </Typography>
    </Box>
  );
}

function EmptyState() {
  return (
    <Box sx={{ textAlign: "center", py: 6 }}>
      <InfoOutlinedIcon sx={{ fontSize: 36, color: "#27272a", mb: 1 }} />
      <Typography sx={{ fontSize: 14, color: "#52525b", fontFamily: "Inter" }}>
        No users found
      </Typography>
    </Box>
  );
}

const dateInputSx = {
  width: 160,
  "& .MuiOutlinedInput-root": {
    bgcolor: "#18181b",
    borderRadius: "8px",
    color: "#e4e4e7",
    fontFamily: "Inter",
    fontSize: 13,
    "& fieldset": { borderColor: "#27272a" },
    "&:hover fieldset": { borderColor: "#3f3f46" },
    "&.Mui-focused fieldset": { borderColor: "#6366f1" },
  },
  "& .MuiInputLabel-root": { color: "#52525b", fontFamily: "Inter", fontSize: 13 },
  "& .MuiInputLabel-root.Mui-focused": { color: "#6366f1" },
};

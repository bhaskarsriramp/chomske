// components/DashboardAnalytics.js
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  useTheme,
  useMediaQuery,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
} from "@mui/material";
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import axios from "axios";
import dayjs from "dayjs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  LabelList,
} from "recharts";
import { useNavigate } from "react-router-dom";
import EmojiPeopleOutlinedIcon from '@mui/icons-material/EmojiPeopleOutlined';
import ShowChartOutlinedIcon from '@mui/icons-material/ShowChartOutlined';
import ViewAgendaOutlinedIcon from '@mui/icons-material/ViewAgendaOutlined';
import DoneAllOutlinedIcon from '@mui/icons-material/DoneAllOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import MessageOutlinedIcon from '@mui/icons-material/MessageOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';

export default function DashboardAnalytics({
  apiBase = "/api",
  barColors = { city: "#4F46E5", region: "#10B981" },
  fontSize = 12,
  showLegend = false,
  tooltipFormatter,
  cardSx,
  showBarLabels = true,
}) {
  const [duration, setDuration] = useState("28d");
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState({
    summary: {
      totalViews: 0,
      totalClicks: 0,
      totalAutomations: 0,
      totalPrivateReplies: 0,
    },
    cities: [],
    regions: [],
  });

  // Custom date range states
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [customStartDate, setCustomStartDate] = useState(null);
  const [customEndDate, setCustomEndDate] = useState(null);
  const [appliedCustomDates, setAppliedCustomDates] = useState({ start: null, end: null });

  const theme = useTheme();
  const isXs = useMediaQuery(theme.breakpoints.down("sm"));
  const isSm = useMediaQuery(theme.breakpoints.between("sm", "md"));

  const yAxisWidth = isXs ? 80 : isSm ? 120 : 160;

  const DURATION_OPTIONS = [
    { value: "today", label: "Today" },
    { value: "7d", label: "Last 7 days" },
    { value: "28d", label: "Last 28 days" },
    { value: "90d", label: "Last 90 days" },
    { value: "custom", label: "Custom Date" },
  ];

  const { startDate, endDate } = useMemo(() => {
    const end = dayjs().endOf("day");
    let start;

    if (duration === "custom") {
      // Use applied custom dates
      if (appliedCustomDates.start && appliedCustomDates.end) {
        return {
          startDate: dayjs(appliedCustomDates.start).startOf("day").toISOString(),
          endDate: dayjs(appliedCustomDates.end).endOf("day").toISOString(),
        };
      }
      // Fallback to last 28 days if custom not set
      start = end.subtract(27, "day").startOf("day");
    } else if (duration === "today") {
      start = dayjs().startOf("day");
    } else if (duration === "7d") {
      start = end.subtract(6, "day").startOf("day");
    } else if (duration === "90d") {
      start = end.subtract(89, "day").startOf("day");
    } else {
      // default 28d
      start = end.subtract(27, "day").startOf("day");
    }

    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }, [duration, appliedCustomDates]);

  useEffect(() => {
    let ignore = false;
    async function fetchData() {
      setLoading(true);
      setError("");
      try {
        const res = await axios.post(
          `${apiBase}/usersOn/dashboard-analytics`,
          { startDate, endDate },
          { withCredentials: true }
        );
        if (!ignore) setData(res.data || {});
      } catch (e) {
        console.error(e);
        if (!ignore)
          setError(e?.response?.data?.message || "Failed to load analytics");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    fetchData();
    return () => {
      ignore = true;
    };
  }, [apiBase, startDate, endDate]);

const handleDurationChange = (e) => {
  const value = e.target.value;
  
  // If selecting custom, always open dialog
  if (value === "custom") {
    setCustomDialogOpen(true);
  } else {
    // For preset ranges, update immediately
    setDuration(value);
    setAppliedCustomDates({ start: null, end: null });
  }
};

// Add this handler for when the select is clicked while custom is already selected
const handleSelectClick = () => {
  if (duration === "custom") {
    setCustomDialogOpen(true);
  }
};


  const handleCustomDateApply = () => {
    if (customStartDate && customEndDate) {
      setAppliedCustomDates({
        start: customStartDate,
        end: customEndDate,
      });
      setDuration("custom");
      setCustomDialogOpen(false);
    }
  };

  const handleCustomDateCancel = () => {
    setCustomDialogOpen(false);
    // Reset to previous selection if custom was not applied
    if (duration === "custom" && !appliedCustomDates.start) {
      setDuration("28d");
    }
  };

  const getDisplayLabel = () => {
    if (duration === "custom" && appliedCustomDates.start && appliedCustomDates.end) {
      return `${dayjs(appliedCustomDates.start).format("MMM DD")} - ${dayjs(appliedCustomDates.end).format("MMM DD, YYYY")}`;
    }
    return DURATION_OPTIONS.find((opt) => opt.value === duration)?.label || "Last 28 days";
  };

  const numberFmt = (v) => Intl.NumberFormat().format(v ?? 0);
  const defaultTooltipFormatter = (value, name) => [numberFmt(value), name];

  const cityData = useMemo(
    () =>
      (data?.cities || []).map((c) => ({
        name: c.city || "Unknown",
        Visitors: c.visitors || 0,
      })),
    [data]
  );

  const regionData = useMemo(
    () =>
      (data?.regions || []).map((r) => ({
        name: r.region || "Unknown",
        Visitors: r.visitors || 0,
      })),
    [data]
  );

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ p: { xs: 0, md: 1 }, maxWidth: 1400, mx: "auto", my: 2 }}>
        <Grid container alignItems="center" sx={{ mb: 2 }}>
          <Grid size={{ xs: 6, sm: 6, md: 6 }}>
            <Typography
              sx={{ fontFamily: "Inter", fontWeight: 600, fontSize: { xs: 16, sm: 16, md: 22 } }}
            >
              Dashboard Analytics
            </Typography>
          </Grid>

          <Grid
            size={{ xs: 6, sm: 6, md: 6 }}
            sx={{ display: "flex", justifyContent: { xs: "flex-start", md: "flex-end" }, mt: { xs: 1, md: 0 } }}
          >
            <FormControl size="small" sx={{ minWidth: { xs: 180, md: 220 } }}>
              <InputLabel id="duration-label" sx={{ fontFamily: "Inter" }}>
                Range
              </InputLabel>
             <Select
  labelId="duration-label"
  id="duration-select"
  value={duration}
  label="Range"
  onChange={handleDurationChange}
  onClick={handleSelectClick} // Add this
  disabled={loading}
  sx={{ fontFamily: "Inter", fontSize: { xs: 14, sm: 14, md: 12 } }}
  renderValue={() => (
    <Typography sx={{ fontFamily: "Inter", fontSize: { xs: 13, md: 14 } }}>
      {getDisplayLabel()}
    </Typography>
  )}
>
  {DURATION_OPTIONS.map((opt) => (
    <MenuItem key={opt.value} value={opt.value} sx={{ fontFamily: "Inter" }}>
      {opt.label}
    </MenuItem>
  ))}
</Select>

            </FormControl>
          </Grid>
        </Grid>

        <Grid container spacing={2} sx={{ mb: 2 }}>
          {/* Bio Page Visitors */}
          <Grid size={{ xs: 6, sm: 6, md: 3 }}>
            <Card
              elevation={3}
              sx={{ background: "#16C47F", borderRadius: 3, ...cardSx, cursor: "pointer" }}
              onClick={() => navigate("/professional/my/page/analytics")}
            >
              <CardContent>
                <Stack sx={{ display: "flex", flexDirection: "row", justifyContent: "space-between", mb: 2 }}>
                  <EmojiPeopleOutlinedIcon sx={{ color: "#D9EAFD" }} />
                  <ShowChartOutlinedIcon sx={{ color: "#D9EAFD" }} />
                </Stack>
                <Typography sx={{ fontFamily: "Inter", fontSize: { xs: 14, md: 14 }, mb: 0.5, color: "#FFFFFF", pl: 1 }}>
                  Bio Page
                </Typography>
                <Typography sx={{ fontFamily: "Inter", fontSize: { xs: 18, md: 32 }, fontWeight: 700, color: "#FFFFFF", pl: 1 }}>
                  {loading ? "—" : numberFmt(data?.summary?.totalViews)}
                </Typography>
                <Typography sx={{ fontFamily: "Inter", fontSize: { xs: 14, md: 14 }, mb: 0.5, color: "#FFFFFF", pl: 1 }}>
                  Visitors
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Block Clicks */}
          <Grid size={{ xs: 6, sm: 6, md: 3 }}>
            <Card
              elevation={3}
              sx={{ background: "#1055C9", borderRadius: 3, ...cardSx, cursor: "pointer" }}
              onClick={() => navigate("/professional/my/page/analytics")}
            >
              <CardContent>
                <Stack sx={{ display: "flex", flexDirection: "row", justifyContent: "space-between", mb: 2 }}>
                  <ViewAgendaOutlinedIcon sx={{ color: "#D9EAFD" }} />
                  <DoneAllOutlinedIcon sx={{ color: "#D9EAFD" }} />
                </Stack>
                <Typography sx={{ fontFamily: "Inter", fontSize: { xs: 14, md: 14 }, mb: 0.5, color: "#FFFFFF", pl: 1 }}>
                  Block Clicks
                </Typography>
                <Typography sx={{ fontFamily: "Inter", fontSize: { xs: 18, md: 32 }, fontWeight: 700, color: "#FFFFFF", pl: 1 }}>
                  {loading ? "—" : numberFmt(data?.summary?.totalClicks)}
                </Typography>
                <Typography sx={{ fontFamily: "Inter", fontSize: { xs: 14, md: 14 }, mb: 0.5, color: "#FFFFFF", pl: 1 }}>
                  Total
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Automations Created */}
          <Grid size={{ xs: 6, sm: 6, md: 3 }}>
            <Card
              elevation={3}
              sx={{ background: "#FE7743", borderRadius: 3, ...cardSx, cursor: "pointer" }}
              onClick={() => navigate("/professional/automations")}
            >
              <CardContent>
                <Stack sx={{ display: "flex", flexDirection: "row", justifyContent: "space-between", mb: 2 }}>
                  <SmartToyOutlinedIcon sx={{ color: "#D9EAFD" }} />
                  <AutoAwesomeOutlinedIcon sx={{ color: "#D9EAFD" }} />
                </Stack>
                <Typography sx={{ fontFamily: "Inter", fontSize: { xs: 14, md: 14 }, mb: 0.5, color: "#FFFFFF", pl: 1 }}>
                  Automations
                </Typography>
                <Typography sx={{ fontFamily: "Inter", fontSize: { xs: 18, md: 32 }, fontWeight: 700, color: "#FFFFFF", pl: 1 }}>
                  {loading ? "—" : numberFmt(data?.summary?.totalAutomations)}
                </Typography>
                <Typography sx={{ fontFamily: "Inter", fontSize: { xs: 14, md: 14 }, mb: 0.5, color: "#FFFFFF", pl: 1 }}>
                  Created
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Private DMs Sent */}
          <Grid size={{ xs: 6, sm: 6, md: 3 }}>
            <Card
              elevation={3}
              sx={{ background: "#640D5F", borderRadius: 3, ...cardSx, cursor: "pointer" }}
              onClick={() => navigate("/professional/automations")}
            >
              <CardContent>
                <Stack sx={{ display: "flex", flexDirection: "row", justifyContent: "space-between", mb: 2 }}>
                  <MessageOutlinedIcon sx={{ color: "#D9EAFD" }} />
                  <SendOutlinedIcon sx={{ color: "#D9EAFD" }} />
                </Stack>
                <Typography sx={{ fontFamily: "Inter", fontSize: { xs: 14, md: 14 }, mb: 0.5, color: "#FFFFFF", pl: 1 }}>
                  Automated DMs
                </Typography>
                <Typography sx={{ fontFamily: "Inter", fontSize: { xs: 18, md: 32 }, fontWeight: 700, color: "#FFFFFF", pl: 1 }}>
                  {loading ? "—" : numberFmt(data?.summary?.totalPrivateReplies)}
                </Typography>
                <Typography sx={{ fontFamily: "Inter", fontSize: { xs: 14, md: 14 }, mb: 0.5, color: "#FFFFFF", pl: 1 }}>
                  Sent
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {loading && (
          <Box sx={{ py: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CircularProgress />
          </Box>
        )}

        {!loading && !error && (
          <>
            {/* Top 10 Cities */}
            <Card elevation={3} sx={{ borderRadius: 3, height: 460, mb: 2, ...cardSx }}>
              <CardContent sx={{ height: "100%", width: "100%" }}>
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                  Top 10 Cities by Visitors
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <ResponsiveContainer width="100%" height={360}>
                  <BarChart
                    data={cityData}
                    layout="vertical"
                    margin={{
                      top: 8,
                      right: 16,
                      left: isXs ? 0 : 8,
                      bottom: 8,
                    }}
                    barCategoryGap={isXs ? 10 : 20}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize }} domain={[0, "dataMax"]} tickMargin={4} />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={yAxisWidth}
                      tick={{ fontSize }}
                      tickMargin={4}
                      tickFormatter={(v) => (isXs && String(v).length > 12 ? `${String(v).slice(0, 12)}…` : v)}
                    />
                    <Tooltip formatter={tooltipFormatter || defaultTooltipFormatter} />
                    {showLegend && <Legend />}
                    <Bar dataKey="Visitors" fill={barColors.city} radius={[4, 4, 4, 4]}>
                      {showBarLabels && <LabelList dataKey="Visitors" position="right" formatter={numberFmt} />}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Top 10 Regions */}
            <Card elevation={3} sx={{ borderRadius: 3, height: 460, ...cardSx }}>
              <CardContent sx={{ height: "100%" }}>
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                  Top 10 States/Regions by Visitors
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <ResponsiveContainer width="100%" height={360}>
                  <BarChart
                    data={regionData}
                    margin={{ top: 8, right: 16, left: isXs ? 0 : 8, bottom: 32 }}
                    barCategoryGap={isXs ? 8 : 16}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize }} interval={0} angle={-30} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize }} />
                    <Tooltip formatter={tooltipFormatter || defaultTooltipFormatter} />
                    {showLegend && <Legend />}
                    <Bar dataKey="Visitors" fill={barColors.region} radius={[4, 4, 0, 0]}>
                      {showBarLabels && <LabelList dataKey="Visitors" position="top" formatter={numberFmt} />}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </>
        )}

        {!loading && error && (
          <Card sx={{ mt: 2, borderRadius: 3 }}>
            <CardContent>
              <Typography color="error">{error}</Typography>
            </CardContent>
          </Card>
        )}

        {/* Custom Date Range Dialog */}
        <Dialog
          open={customDialogOpen}
          onClose={handleCustomDateCancel}
          maxWidth="sm"
          fullWidth
          PaperProps={{
            sx: { borderRadius: 3 },
          }}
        >
          <DialogTitle sx={{ fontFamily: "Inter", fontWeight: 600, fontSize: 18 }}>
            Select Custom Date Range
          </DialogTitle>
          <DialogContent sx={{ pt: 3 }}>
            <Stack spacing={3} mt={1}>
              <DatePicker
                label="From Date"
                value={customStartDate}
                onChange={(newValue) => setCustomStartDate(newValue)}
                maxDate={dayjs()}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    sx: { fontFamily: "Inter" },
                  },
                }}
              />
              <DatePicker
                label="To Date"
                value={customEndDate}
                onChange={(newValue) => setCustomEndDate(newValue)}
                minDate={customStartDate}
                maxDate={dayjs()}
                disabled={!customStartDate}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    sx: { fontFamily: "Inter" },
                  },
                }}
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 3, pt: 2 }}>
            <Button
              onClick={handleCustomDateCancel}
              sx={{
                textTransform: "none",
                fontFamily: "Inter",
                fontWeight: 600,
                color: "#6B7280",
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCustomDateApply}
              variant="contained"
              disabled={!customStartDate || !customEndDate}
              sx={{
                textTransform: "none",
                fontFamily: "Inter",
                fontWeight: 600,
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                "&:hover": {
                  background: "linear-gradient(135deg, #5568d3 0%, #6941a5 100%)",
                },
              }}
            >
              Apply
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </LocalizationProvider>
  );
}

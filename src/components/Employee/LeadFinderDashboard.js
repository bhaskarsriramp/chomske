import React, { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import {
  Box,
  Typography,
  Select,
  MenuItem,
  FormControl,
  CircularProgress,
  Paper,
  Checkbox,
  ListItemText,
  Popover,
  Button,
  Chip,
  Stack,
} from "@mui/material";
import LeaderboardOutlinedIcon from "@mui/icons-material/LeaderboardOutlined";
import MailOutlineOutlinedIcon from "@mui/icons-material/MailOutlineOutlined";
import TrackChangesOutlinedIcon from "@mui/icons-material/TrackChangesOutlined";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const BASE_URL = "/api/usersOn";
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const getLast12Months = () => {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return months;
};

const toParamString = (monthList) =>
  monthList.map((m) => `${m.year}-${m.month}`).join(",");

const monthLabel = ({ year, month }) => `${MONTH_NAMES[month - 1]} ${year}`;

const sortMonths = (list) =>
  [...list].sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);

export default function LeadFinderDashboard() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthYear = lastMonthDate.getFullYear();
  const lastMonthVal = lastMonthDate.getMonth() + 1;

  const [filter, setFilter] = useState("current");
  const [customMonths, setCustomMonths] = useState([]);
  const [pendingCustom, setPendingCustom] = useState([]);
  const [anchorEl, setAnchorEl] = useState(null);

  const [usageRecords, setUsageRecords] = useState([]);
  const [leadsLimit, setLeadsLimit] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lockedTooltip, setLockedTooltip] = useState(null);

  const last12 = getLast12Months();

  const getMonthsForFilter = useCallback(() => {
    if (filter === "current") return [{ year: currentYear, month: currentMonth }];
    if (filter === "last") return [{ year: lastMonthYear, month: lastMonthVal }];
    return customMonths.length > 0 ? customMonths : [{ year: currentYear, month: currentMonth }];
  }, [filter, customMonths, currentYear, currentMonth, lastMonthYear, lastMonthVal]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const months = getMonthsForFilter();
      const [subRes, rangeRes] = await Promise.all([
        axios.get(`${BASE_URL}/subscription/details`, { withCredentials: true }),
        axios.get(`${BASE_URL}/dms-usage/range?months=${toParamString(months)}`, { withCredentials: true }),
      ]);
      if (subRes.data?.success) {
        setLeadsLimit(subRes.data.response?.leads_plan_limit || 0);
      }
      if (rangeRes.data?.success) {
        setUsageRecords(rangeRes.data.data || []);
      }
    } catch (e) {
      console.error("UsageDashboard fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [getMonthsForFilter]);

  useEffect(() => {
    if (filter !== "custom" || customMonths.length > 0) {
      fetchData();
    }
  }, [filter, customMonths, fetchData]);

  // Aggregate totals across all selected months
  const totalLeads = usageRecords.reduce((s, r) => s + (r.lead_alerts_sent || 0), 0);
  const totalDms = usageRecords.reduce((s, r) => s + (r.total_dms_sent || 0), 0);

  // Build chart data: one entry per selected month, merged with fetched records
  const selectedMonths = sortMonths(getMonthsForFilter());
  const chartData = selectedMonths.map((m) => {
    const record = usageRecords.find((r) => r.year === m.year && r.month === m.month);
    return {
      name: monthLabel(m),
      "Leads Found": record?.lead_alerts_sent || 0,
      "DMs Sent": record?.total_dms_sent || 0,
    };
  });

  // Custom month picker handlers
  const openPicker = (e) => {
    setPendingCustom(customMonths);
    setAnchorEl(e.currentTarget);
  };
  const closePicker = () => setAnchorEl(null);

  const toggleMonth = (m) => {
    const key = `${m.year}-${m.month}`;
    setPendingCustom((prev) => {
      const exists = prev.some((x) => x.year === m.year && x.month === m.month);
      return exists
        ? prev.filter((x) => !(x.year === m.year && x.month === m.month))
        : [...prev, m];
    });
  };

  const applyCustom = () => {
    setCustomMonths(sortMonths(pendingCustom));
    closePicker();
  };

  const isMonthSelected = (m) =>
    pendingCustom.some((x) => x.year === m.year && x.month === m.month);

  const statCards = [
    {
      label: "Leads Found",
      value: totalLeads,
      icon: <LeaderboardOutlinedIcon sx={{ fontSize: "1.6rem", color: "#8B5CF6" }} />,
      bg: "linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)",
      border: "#ddd6fe",
      valueColor: "#7C3AED",
    },
    {
      label: "Leads Plan Limit",
      value: leadsLimit,
      icon: <TrackChangesOutlinedIcon sx={{ fontSize: "1.6rem", color: "#0891B2" }} />,
      bg: "linear-gradient(135deg, #ecfeff 0%, #cffafe 100%)",
      border: "#a5f3fc",
      valueColor: "#0891B2",
    },
    {
      label: "Auto DMs Sent",
      value: totalDms,
      icon: <MailOutlineOutlinedIcon sx={{ fontSize: "1.6rem", color: "#F59E0B" }} />,
      bg: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
      border: "#fde68a",
      valueColor: "#D97706",
    },
  ];

  const renderTooltip = ({ active, payload, label }) => {
    const isLocked = lockedTooltip !== null;
    const visible = isLocked || active;
    const displayPayload = isLocked ? lockedTooltip.payload : payload;
    const displayLabel = isLocked ? lockedTooltip.label : label;
    if (!visible || !displayPayload?.length) return null;
    return (
      <Box sx={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: "10px", p: 1.5, boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}>
        <Typography sx={{ fontFamily: "Inter", fontSize: "0.78rem", fontWeight: 600, color: "#374151", mb: 0.75 }}>
          {displayLabel}
        </Typography>
        {displayPayload.map((entry) => (
          <Box key={entry.dataKey} sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.25 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: "2px", flexShrink: 0, backgroundColor: entry.fill || entry.color }} />
            <Typography sx={{ fontFamily: "Inter", fontSize: "0.78rem", color: "#6B7280" }}>
              {entry.name}:{" "}
              <Box component="span" sx={{ fontWeight: 600, color: "#111827" }}>{entry.value.toLocaleString()}</Box>
            </Typography>
          </Box>
        ))}
      </Box>
    );
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 900, mx: "auto", overflowX: "clip" }}>

      {/* Sticky Header */}
      <Box
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          backgroundColor: "#fff",
          mx: { xs: -2, sm: -3 },
          px: { xs: 2, sm: 3 },
          mt: { xs: -2, sm: -3 },
          pt: { xs: 2, sm: 3 },
          pb: 2,
          mb: 3,
          borderBottom: "1px solid #F3F4F6",
        }}
      >
        {/* Header + Filter */}
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 2 }}>
        <Box>
          <Typography sx={{ fontFamily: "Inter", fontWeight: 700, fontSize: { xs: "1.05rem", sm: "1.25rem" }, color: "#111827" }}>
            Leads Dashboard
          </Typography>
          <Typography sx={{ fontFamily: "Inter", fontSize: { xs: "0.73rem", sm: "0.8rem" }, color: "#6B7280", mt: 0.25 }}>
            Track your leads and DMs usage
          </Typography>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
          <FormControl size="small" sx={{ minWidth: 170 }}>
            <Select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                if (e.target.value !== "custom") setCustomMonths([]);
              }}
              sx={{
                fontFamily: "Inter",
                fontSize: "0.85rem",
                borderRadius: "8px",
                "& .MuiOutlinedInput-notchedOutline": { borderColor: "#E5E7EB" },
              }}
            >
              <MenuItem value="current" sx={{ fontFamily: "Inter", fontSize: "0.85rem" }}>Current Month</MenuItem>
              <MenuItem value="last" sx={{ fontFamily: "Inter", fontSize: "0.85rem" }}>Last Month</MenuItem>
              <MenuItem value="custom" sx={{ fontFamily: "Inter", fontSize: "0.85rem" }}>Custom Selection</MenuItem>
            </Select>
          </FormControl>

          {filter === "custom" && (
            <Button
              variant="outlined"
              size="small"
              onClick={openPicker}
              sx={{
                fontFamily: "Inter",
                fontSize: "0.8rem",
                textTransform: "none",
                borderColor: "#8B5CF6",
                color: "#7C3AED",
                borderRadius: "8px",
                "&:hover": { borderColor: "#7C3AED", backgroundColor: "#f5f3ff" },
              }}
            >
              {customMonths.length > 0 ? `${customMonths.length} month${customMonths.length > 1 ? "s" : ""} selected` : "Pick months"}
            </Button>
          )}
        </Box>
      </Box>

      {/* Custom month picker popover */}
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={closePicker}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        PaperProps={{ sx: { borderRadius: "12px", p: 2, minWidth: 260, boxShadow: "0 8px 30px rgba(0,0,0,0.12)" } }}
      >
        <Typography sx={{ fontFamily: "Inter", fontWeight: 600, fontSize: "0.85rem", color: "#374151", mb: 1.5 }}>
          Select months
        </Typography>
        <Stack spacing={0.5}>
          {last12.map((m) => {
            const selected = isMonthSelected(m);
            return (
              <Box
                key={`${m.year}-${m.month}`}
                onClick={() => toggleMonth(m)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  px: 1,
                  py: 0.5,
                  borderRadius: "8px",
                  cursor: "pointer",
                  backgroundColor: selected ? "#f5f3ff" : "transparent",
                  "&:hover": { backgroundColor: "#f5f3ff" },
                  transition: "background-color 0.15s ease",
                }}
              >
                <Checkbox
                  checked={selected}
                  size="small"
                  sx={{ p: 0, color: "#C4B5FD", "&.Mui-checked": { color: "#8B5CF6" } }}
                  onChange={() => {}}
                />
                <Typography sx={{ fontFamily: "Inter", fontSize: "0.85rem", color: selected ? "#7C3AED" : "#374151", fontWeight: selected ? 600 : 400 }}>
                  {monthLabel(m)}
                </Typography>
              </Box>
            );
          })}
        </Stack>
        <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
          <Button
            size="small"
            onClick={closePicker}
            sx={{ fontFamily: "Inter", fontSize: "0.78rem", textTransform: "none", color: "#6B7280", flex: 1, borderRadius: "8px" }}
          >
            Cancel
          </Button>
          <Button
            size="small"
            variant="contained"
            disabled={pendingCustom.length === 0}
            onClick={applyCustom}
            sx={{
              fontFamily: "Inter",
              fontSize: "0.78rem",
              textTransform: "none",
              flex: 1,
              borderRadius: "8px",
              background: "linear-gradient(135deg, #8B5CF6, #7C3AED)",
              "&:hover": { background: "linear-gradient(135deg, #7C3AED, #6D28D9)" },
              boxShadow: "none",
            }}
          >
            Apply
          </Button>
        </Box>
      </Popover>

        {/* Custom months pills */}
        {filter === "custom" && customMonths.length > 0 && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 2 }}>
            {sortMonths(customMonths).map((m) => (
              <Chip
                key={`${m.year}-${m.month}`}
                label={monthLabel(m)}
                size="small"
                onDelete={() => setCustomMonths((prev) => sortMonths(prev.filter((x) => !(x.year === m.year && x.month === m.month))))}
                sx={{
                  fontFamily: "Inter",
                  fontSize: "0.75rem",
                  backgroundColor: "#ede9fe",
                  color: "#7C3AED",
                  "& .MuiChip-deleteIcon": { color: "#A78BFA" },
                }}
              />
            ))}
          </Box>
        )}
      </Box>{/* /Sticky Header */}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 300 }}>
          <CircularProgress size={36} sx={{ color: "#8B5CF6" }} />
        </Box>
      ) : (
        <>
          {/* Stat Cards */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
              gap: 2,
              mb: 3,
            }}
          >
            {statCards.map((card) => (
              <Paper
                key={card.label}
                elevation={0}
                sx={{
                  p: 2.5,
                  borderRadius: "14px",
                  background: card.bg,
                  border: `1px solid ${card.border}`,
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
                  <Box
                    sx={{
                      width: 38,
                      height: 38,
                      borderRadius: "10px",
                      background: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                    }}
                  >
                    {card.icon}
                  </Box>
                  <Typography sx={{ fontFamily: "Inter", fontWeight: 500, fontSize: "0.82rem", color: "#6B7280" }}>
                    {card.label}
                  </Typography>
                </Box>
                <Typography sx={{ fontFamily: "Inter", fontWeight: 700, fontSize: "1.75rem", color: card.valueColor, lineHeight: 1 }}>
                  {card.value.toLocaleString()}
                </Typography>
                {filter !== "current" && card.label !== "Leads Plan Limit" && (
                  <Typography sx={{ fontFamily: "Inter", fontSize: "0.7rem", color: "#9CA3AF", mt: 0.5 }}>
                    {filter === "last" ? "Last month" : `${customMonths.length} month${customMonths.length > 1 ? "s" : ""} total`}
                  </Typography>
                )}
              </Paper>
            ))}
          </Box>

          {/* Bar Chart */}
          <Paper
            elevation={0}
            sx={{
              p: { xs: 2, sm: 3 },
              borderRadius: "14px",
              border: "1px solid #E5E7EB",
              background: "#fff",
            }}
          >
            <Typography sx={{ fontFamily: "Inter", fontWeight: 600, fontSize: "0.95rem", color: "#111827", mb: 2.5 }}>
              Leads vs DMs Sent
            </Typography>
            {chartData.length === 0 || (chartData.length === 1 && chartData[0]["Leads Found"] === 0 && chartData[0]["DMs Sent"] === 0) ? (
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: 220 }}>
                <Typography sx={{ fontFamily: "Inter", fontSize: "0.85rem", color: "#9CA3AF" }}>
                  No data for the selected period
                </Typography>
              </Box>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={chartData}
                  barCategoryGap="30%"
                  barGap={4}
                  onClick={(state) => {
                    if (!state?.activePayload?.length) {
                      setLockedTooltip(null);
                    } else {
                      setLockedTooltip((prev) =>
                        prev?.label === state.activeLabel
                          ? null
                          : { payload: state.activePayload, label: state.activeLabel }
                      );
                    }
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontFamily: "Inter", fontSize: 12, fill: "#6B7280" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontFamily: "Inter", fontSize: 12, fill: "#6B7280" }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip
                    content={renderTooltip}
                    cursor={{ fill: "rgba(0,0,0,0.03)" }}
                  />
                  <Legend
                    wrapperStyle={{ fontFamily: "Inter", fontSize: "0.8rem", paddingTop: "12px" }}
                  />
                  <Bar dataKey="Leads Found" fill="#8B5CF6" radius={[6, 6, 0, 0]} maxBarSize={48} />
                  <Bar dataKey="DMs Sent" fill="#F59E0B" radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Paper>
        </>
      )}
    </Box>
  );
}

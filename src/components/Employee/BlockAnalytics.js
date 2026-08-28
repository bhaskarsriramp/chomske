// components/BlocksAnalytics.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Grid,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
  Typography,
  Stack,
  CircularProgress,
  useMediaQuery,
  useTheme,
  Divider,
} from "@mui/material";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import VisibilityIcon from "@mui/icons-material/Visibility";
import axios from "axios";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  ResponsiveContainer,
} from "recharts";

axios.defaults.withCredentials = true;

// Enhanced Metric Card - Similar to DashboardAnalytics
const MetricCard = ({ label, value, icon: Icon, color }) => (
  <Card
    elevation={3}
    sx={{
      borderRadius: 3,
      background: color,
      color: "white",
      cursor: "pointer",
      transition: "all 0.3s ease",
      "&:hover": {
        transform: "translateY(-2px)",
        boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
      },
    }}
  >
    <CardContent sx={{ position: "relative" }}>
      <Stack sx={{ display: "flex", flexDirection: "row", justifyContent: "space-between", mb: 2 }}>
        {Icon && <Icon sx={{ color: "#D9EAFD" }} />}
      </Stack>
      <Typography
        sx={{
          fontFamily: "Inter",
          fontSize: { xs: 14, md: 14 },
          mb: 0.5,
          color: "#FFFFFF",
          pl: 1,
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontFamily: "Inter",
          fontSize: { xs: 18, md: 32 },
          fontWeight: 700,
          color: "#FFFFFF",
          pl: 1,
        }}
      >
        {(value ?? 0).toLocaleString()}
      </Typography>
    </CardContent>
  </Card>
);

// Helper functions
const toISO = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();

const makeRange = (key) => {
  const now = new Date();
  const local = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfToday = local;
  const startOfTomorrow = new Date(local);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  if (key === "today") {
    return { startDate: toISO(startOfToday), endDate: toISO(startOfTomorrow) };
  }
  if (key === "7d") {
    const start = new Date(startOfTomorrow);
    start.setDate(start.getDate() - 7);
    return { startDate: toISO(start), endDate: toISO(startOfTomorrow) };
  }
  if (key === "28d") {
    const start = new Date(startOfTomorrow);
    start.setDate(start.getDate() - 28);
    return { startDate: toISO(start), endDate: toISO(startOfTomorrow) };
  }
  return { startDate: toISO(startOfToday), endDate: toISO(startOfTomorrow) };
};

const RANGE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "28d", label: "Last 28 days" },
];

const CARD_COLORS = {
  visitors: "#16C47F",
  views: "#1055C9",
};

const numberFmt = (v) => Intl.NumberFormat().format(v ?? 0);

export default function BlocksAnalytics() {
  const theme = useTheme();
  const isXs = useMediaQuery(theme.breakpoints.down("sm")); // <600px
  const isSm = useMediaQuery(theme.breakpoints.between("sm", "md")); // 600–900px

  const yAxisWidth = isXs ? 70 : isSm ? 100 : 140;
  const fontSize = isXs ? 10 : 12;

  const [options, setOptions] = useState([]);
  const [selectedBlockId, setSelectedBlockId] = useState("");
  const [rangeKey, setRangeKey] = useState("7d");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({
    perBlock: [],
    totals: { clicks: 0, visitors: 0 },
    topCities: [],
    topStates: [],
  });

  const apiBase = "/api/usersOn";

  // Load dropdown options
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(apiBase + "/blocks/options", { withCredentials: true });
        const list = res.data.blocks || [];
        setOptions(list);
        if (list.length > 0) {
          setSelectedBlockId(list[0]._id);
        }
      } catch (error) {
        console.error("Failed to load blocks:", error);
      }
    })();
  }, []);

  // Fetch analytics
  const fetchAnalytics = async (blockId, key) => {
    setLoading(true);
    try {
      const { startDate, endDate } = makeRange(key);
      const body = {
        blockId: blockId || undefined,
        startDate,
        endDate,
      };
      const res = await axios.post(apiBase + "/analytics/blocks", body, { withCredentials: true });
      setData(res.data);
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  // Refetch on block or range change
  useEffect(() => {
    if (!selectedBlockId) return;
    fetchAnalytics(selectedBlockId, rangeKey);
  }, [selectedBlockId, rangeKey]);

  const perBlockOrdered = useMemo(
    () => (data.perBlock || []).slice().sort((a, b) => a.order - b.order),
    [data.perBlock]
  );

  return (
    <Box sx={{ p: { xs: 0, md: 1 }, maxWidth: 1400, mx: "auto", my: 2 }}>
      {/* Header with Title and Range Selector */}
      <Grid container alignItems="center" sx={{ mb: 2, px: { xs: 2, md: 0 } }}>
        <Grid size={{ xs: 6, sm: 6, md: 6 }}>
          <Typography
            sx={{
              fontFamily: "Inter",
              fontWeight: 600,
              fontSize: { xs: 16, sm: 16, md: 22 },
            }}
          >
            Block Analytics
          </Typography>
        </Grid>

        <Grid
          size={{ xs: 6, sm: 6, md: 6 }}
          sx={{
            display: "flex",
            justifyContent: { xs: "flex-start", md: "flex-end" },
            mt: { xs: 1, md: 0 },
            px: { xs: 2, md: 0 },
          }}
        >
          <FormControl size="small" sx={{ minWidth: { xs: 140, md: 180 } }}>
            <InputLabel id="range-label" sx={{ fontFamily: "Inter" }}>
              Range
            </InputLabel>
            <Select
              labelId="range-label"
              id="range-select"
              value={rangeKey}
              label="Range"
              onChange={(e) => setRangeKey(e.target.value)}
              disabled={loading}
              sx={{ fontFamily: "Inter", fontSize: { xs: 14, sm: 14, md: 12 } }}
            >
              {RANGE_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value} sx={{ fontFamily: "Inter" }}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
      </Grid>

      {/* Block Selection */}
      <Box sx={{ px: { xs: 2, md: 0 }, mb: 2 }}>
        <FormControl fullWidth size="small">
          <InputLabel id="block-select-label" sx={{ fontFamily: "Inter", fontWeight: 600 }}>
            Select Block
          </InputLabel>
          <Select
            labelId="block-select-label"
            label="Select Block"
            value={selectedBlockId}
            onChange={(e) => setSelectedBlockId(e.target.value)}
            disabled={loading}
            sx={{
              borderRadius: 1.5,
              fontFamily: "Inter",
              "& .MuiOutlinedInput-root": {
                fontWeight: 600,
              },
            }}
          >
            {options.map((b) => (
              <MenuItem key={b._id} value={b._id} sx={{ fontFamily: "Inter" }}>
                #{b.order} — {b.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 2, px: { xs: 2, md: 0 } }}>
        <Grid size={{ xs: 6, sm: 6, md: 6 }}>
          <MetricCard
            label="Total Visitors"
            value={numberFmt(data?.totals?.visitors || 0)}
            icon={TrendingUpIcon}
            color={CARD_COLORS.visitors}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 6, md: 6 }}>
          <MetricCard
            label="Total Views"
            value={numberFmt(data?.totals?.clicks || 0)}
            icon={VisibilityIcon}
            color={CARD_COLORS.views}
          />
        </Grid>
      </Grid>

      {/* Loading State */}
      {loading && (
        <Box sx={{ py: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && (
        <>
          {/* Per-Block Summary Table */}
          {perBlockOrdered?.length > 1 && (
            <Card elevation={3} sx={{ borderRadius: 3, mb: 2, mx: { xs: 2, md: 0 } }}>
              <CardContent>
                <Typography
                  variant="subtitle1"
                  fontWeight={700}
                  sx={{ mb: 1, fontFamily: "Inter" }}
                >
                  📊 Blocks Performance
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: isXs ? "1fr" : "2fr 1fr 1fr",
                    gap: { xs: 1, md: 1.5 },
                  }}
                >
                  {/* Headers */}
                  {!isXs && (
                    <>
                      <Typography
                        variant="overline"
                        sx={{ opacity: 0.6, fontWeight: 700, fontSize: "0.7rem", fontFamily: "Inter" }}
                      >
                        Block Name
                      </Typography>
                      <Typography
                        variant="overline"
                        sx={{
                          opacity: 0.6,
                          fontWeight: 700,
                          textAlign: "right",
                          fontSize: "0.7rem",
                          fontFamily: "Inter",
                        }}
                      >
                        Views
                      </Typography>
                      <Typography
                        variant="overline"
                        sx={{
                          opacity: 0.6,
                          fontWeight: 700,
                          textAlign: "right",
                          fontSize: "0.7rem",
                          fontFamily: "Inter",
                        }}
                      >
                        Visitors
                      </Typography>
                    </>
                  )}

                  {/* Data Rows */}
                  {perBlockOrdered.map((b) => (
                    <React.Fragment key={b._id}>
                      {isXs ? (
                        <Card elevation={0} sx={{ p: 1.5, borderRadius: 1.5, mb: 1, backgroundColor: "#f5f5f5" }}>
                          <Box sx={{ mb: 1 }}>
                            <Typography fontWeight={700} sx={{ fontSize: "0.9rem", fontFamily: "Inter" }}>
                              #{b.order} {b.name}
                            </Typography>
                          </Box>
                          <Box sx={{ display: "flex", gap: 2, fontSize: "0.8rem" }}>
                            <Box>
                              <Typography variant="caption" sx={{ opacity: 0.6, fontFamily: "Inter" }}>
                                Views
                              </Typography>
                              <Typography fontWeight={600} sx={{ fontFamily: "Inter" }}>
                                {numberFmt(b.clicks)}
                              </Typography>
                            </Box>
                            <Box>
                              <Typography variant="caption" sx={{ opacity: 0.6, fontFamily: "Inter" }}>
                                Visitors
                              </Typography>
                              <Typography fontWeight={600} sx={{ fontFamily: "Inter" }}>
                                {numberFmt(b.visitors)}
                              </Typography>
                            </Box>
                          </Box>
                        </Card>
                      ) : (
                        <>
                          <Typography sx={{ fontSize: "0.95rem", fontFamily: "Inter" }}>
                            #{b.order} — {b.name}
                          </Typography>
                          <Typography align="right" fontWeight={600} sx={{ fontSize: "0.95rem", fontFamily: "Inter" }}>
                            {numberFmt(b.clicks)}
                          </Typography>
                          <Typography align="right" fontWeight={600} sx={{ fontSize: "0.95rem", fontFamily: "Inter" }}>
                            {numberFmt(b.visitors)}
                          </Typography>
                        </>
                      )}
                    </React.Fragment>
                  ))}
                </Box>
              </CardContent>
            </Card>
          )}

          {/* Top Cities Chart */}
          <Card elevation={3} sx={{ borderRadius: 3, height: 460, mb: 2, mx: { xs: 2, md: 0 } }}>
            <CardContent sx={{ height: "100%", width: "100%" }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1, fontFamily: "Inter" }}>
                🏙️ Top Cities by Visitors
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <ResponsiveContainer width="100%" height={360}>
                <BarChart
                  data={[...(data.topCities || [])]}
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
                    tickFormatter={(v) =>
                      isXs && String(v).length > 12 ? `${String(v).slice(0, 12)}…` : v
                    }
                  />
                  <Tooltip
                    formatter={(value) => numberFmt(value)}
                    contentStyle={{
                      borderRadius: 8,
                      border: "none",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    }}
                  />
                  <Bar dataKey="count" fill="#4F46E5" radius={[4, 4, 4, 4]}>
                    <LabelList dataKey="count" position="right" formatter={numberFmt} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Top States Chart */}
          <Card elevation={3} sx={{ borderRadius: 3, height: 460, mx: { xs: 2, md: 0 } }}>
            <CardContent sx={{ height: "100%" }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1, fontFamily: "Inter" }}>
                <LocationOnIcon sx={{ fontSize: 20, mr: 1, verticalAlign: "middle" }} /> Top States by
                Visitors
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <ResponsiveContainer width="100%" height={360}>
                <BarChart
                  data={[...(data.topStates || [])]}
                  margin={{ top: 8, right: 16, left: isXs ? 0 : 8, bottom: 32 }}
                  barCategoryGap={isXs ? 8 : 16}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize }}
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis tick={{ fontSize }} />
                  <Tooltip
                    formatter={(value) => numberFmt(value)}
                    contentStyle={{
                      borderRadius: 8,
                      border: "none",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    }}
                  />
                  <Bar dataKey="count" fill="#10B981" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="count" position="top" formatter={numberFmt} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  );
}

// InstagramAnalytics.jsx
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import axios from "axios";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Stack,
  MenuItem,
  Select,
  TextField,
  Button,
  Divider,
  Avatar,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  Paper,
  CircularProgress,
  Skeleton,
  IconButton,
} from "@mui/material";
import {
  DateRange,
  ArrowUpward,
  ArrowDownward,
  TrendingUp,
  Send,
  Reply,
  TouchApp,
  People,
  CheckCircle as CheckCircleIcon,
  ChevronLeft,
  ChevronRight,
} from "@mui/icons-material";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import { useNavigate } from "react-router-dom";


const RANGE_OPTIONS = {
  7: "Last 7 Days",
  28: "Last 28 Days",
  90: "Last 90 Days",
  custom: "Custom Range",
};

const GRADIENT_COLORS = [
  { start: "#4D2B8C", end: "#764ba2" },
  { start: "#9E2A3A", end: "#f5576c" },
  { start: "#4988C4", end: "#00F7FF" },
  { start: "#0D4715", end: "#38f9d7" },
  { start: "#fa709a", end: "#fee140" },
];

const ROWS_PER_PAGE = 10;

function formatNumber(input, { digits = 1 } = {}) {
  if (input == null || isNaN(input)) return "0";
  const sign = input < 0 ? "-" : "";
  let n = Math.abs(Number(input));
  const units = ["", "k", "m", "b", "t"];
  let u = 0;
  while (n >= 1000 && u < units.length - 1) { n /= 1000; u++; }
  const useDecimals = u > 0 && n < 100;
  const fixed = useDecimals ? n.toFixed(digits) : Math.round(n).toString();
  const trimmed = fixed.replace(/\.0+$|(\.\d*[1-9])0+$/g, "$1");
  return sign + trimmed + units[u];
}

export default function AutomationAnalytics() {
  const [range, setRange] = useState(7);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [data, setData] = useState(null);
  const [automationData, setAutomationData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [automationLoading, setAutomationLoading] = useState(false);
  const [showPlanBanner, setShowPlanBanner] = useState(false);
  const [bannerClosing, setBannerClosing] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const [visibleCount, setVisibleCount] = useState(ROWS_PER_PAGE);

  const thumbnailRefreshDoneRef = useRef(false);

  const navigate = useNavigate();

  const api = useMemo(() =>
    axios.create({
      baseURL: "/api/usersOn",
      withCredentials: true,
    }), []
  );

  const fetchAnalytics = async (payload) => {
    try {
      setLoading(true);
      const res = await api.post("/automation-analytics", payload);
      setData(res.data);
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAutomationPerformance = async (payload) => {
    try {
      setAutomationLoading(true);
      const res = await api.post("/automation-performance", payload);
      setAutomationData(res.data);
    } catch (error) {
      console.error("Failed to fetch automation performance:", error);
    } finally {
      setAutomationLoading(false);
    }
  };

  // Refresh stale post thumbnails — called once per component mount.
  // The backend only hits the Meta API for automations whose thumbnailRefreshedAt
  // is older than 24 hours, so this is safe to call on every page load.
  const refreshThumbnails = useCallback(async () => {
    try {
      const res = await api.post("/refresh-post-thumbnails");
      if (res.data?.success && Object.keys(res.data.thumbnails || {}).length > 0) {
        setAutomationData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            automationBreakdown: prev.automationBreakdown.map((item) => {
              const fresh = res.data.thumbnails[item.automationId?.toString()];
              if (fresh) {
                return {
                  ...item,
                  thumbnail: fresh.thumbnail != null ? fresh.thumbnail : item.thumbnail,
                  caption: fresh.caption != null ? fresh.caption : item.caption,
                };
              }
              return item;
            }),
          };
        });
      }
    } catch (err) {
      console.error("Failed to refresh thumbnails:", err);
    }
  }, [api]);

  const fetchIgConnectionStatus = async () => {
    try {
      setLoading(true);
      const res = await api.get("/instagram-status");
      if (!res.data.instagramConnected) {
        navigate('/professional/automations');
      }
    } catch (error) {
      console.error("Failed to fetch connection status:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIgConnectionStatus();
  }, []);

  useEffect(() => {
    if (range === "custom") return;
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (range - 1));
    const payload = { startDate: start, endDate: end };

    // Fetch both in parallel
    fetchAnalytics(payload);
    fetchAutomationPerformance(payload);
  }, [range]);

  // Check if plan banner should be shown
  useEffect(() => {
    const checkPlanBannerStatus = async () => {
      try {
        const res = await api.get("/plan-banner-status");
        if (res.data.success && res.data.shouldShowBanner) {
          setShowPlanBanner(true);
        }
      } catch (error) {
        console.error("Failed to check plan banner status:", error);
      }
    };

    checkPlanBannerStatus();
  }, [api]);

  // Reset pagination when new automation data arrives
  useEffect(() => {
    if (!automationData) return;
    setCurrentPage(0);
    setVisibleCount(ROWS_PER_PAGE);
  }, [automationData]);

  // Trigger thumbnail refresh once per component mount (after data is ready)
  useEffect(() => {
    if (!automationData?.automationBreakdown?.length) return;
    if (thumbnailRefreshDoneRef.current) return;
    thumbnailRefreshDoneRef.current = true;
    refreshThumbnails();
  }, [automationData, refreshThumbnails]);

  // Handle closing the plan banner
  const handleClosePlanBanner = async () => {
    setBannerClosing(true);

    try {
      await api.patch("/plan-banner-shown");

      // Wait for animation before hiding
      setTimeout(() => {
        setShowPlanBanner(false);
        setBannerClosing(false);
      }, 300);
    } catch (error) {
      console.error("Failed to update plan banner status:", error);
      setBannerClosing(false);
    }
  };

  const handleCustomRange = () => {
    if (startDate && endDate) {
      const payload = {
        startDate: new Date(startDate),
        endDate: new Date(endDate)
      };
      fetchAnalytics(payload);
      fetchAutomationPerformance(payload);
    }
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <Paper sx={{ p: 1.5, bgcolor: "rgba(255,255,255,0.95)", boxShadow: 3 }}>
          <Typography variant="body2" fontWeight={600}>
            {new Date(payload[0].payload.date).toLocaleDateString()}
          </Typography>
          <Typography variant="body2" sx={{ color: '#FF0087' }}>
            DMs Sent: {payload[0].value}
          </Typography>
        </Paper>
      );
    }
    return null;
  };

  // Derived pagination values
  const allRows = automationData?.automationBreakdown || [];
  const totalItems = allRows.length;
  const totalPages = Math.ceil(totalItems / ROWS_PER_PAGE);
  const paginatedRows = allRows.slice(currentPage * ROWS_PER_PAGE, (currentPage + 1) * ROWS_PER_PAGE);
  const mobileRows = allRows.slice(0, visibleCount);

  if (loading && !data) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress size={60} />
      </Box>
    );
  }

  return (
    <Box p={3} sx={{ bgcolor: "#f8f9fa", minHeight: "100vh" }}>
      {/* Plan Activation Full-Screen Overlay */}
      {showPlanBanner && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            bgcolor: 'rgba(248, 249, 250, 0.98)',
            backdropFilter: 'blur(8px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            p: { xs: 2, sm: 3 },
            animation: bannerClosing ? 'fadeOut 0.3s ease-out' : 'fadeIn 0.4s ease-out',
            '@keyframes fadeIn': {
              '0%': { opacity: 0 },
              '100%': { opacity: 1 }
            },
            '@keyframes fadeOut': {
              '0%': { opacity: 1 },
              '100%': { opacity: 0 }
            }
          }}
        >
          <Box
            sx={{
              maxWidth: 900,
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              bgcolor: 'white',
              borderRadius: { xs: 0, sm: 3 },
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.08)',
              animation: bannerClosing ? 'slideOut 0.3s ease-out' : 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
              '@keyframes slideUp': {
                '0%': {
                  opacity: 0,
                  transform: 'translateY(30px) scale(0.96)'
                },
                '100%': {
                  opacity: 1,
                  transform: 'translateY(0) scale(1)'
                }
              },
              '@keyframes slideOut': {
                '0%': {
                  opacity: 1,
                  transform: 'translateY(0) scale(1)'
                },
                '100%': {
                  opacity: 0,
                  transform: 'translateY(-30px) scale(0.96)'
                }
              }
            }}
          >
            {/* Close Button */}
            <Box
              onClick={handleClosePlanBanner}
              sx={{
                position: 'absolute',
                top: { xs: 16, sm: 20 },
                right: { xs: 16, sm: 20 },
                width: 40,
                height: 40,
                borderRadius: '50%',
                bgcolor: '#F1F5F9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                zIndex: 10,
                '&:hover': {
                  bgcolor: '#E2E8F0',
                  transform: 'rotate(90deg)'
                },
                '&:active': {
                  transform: 'rotate(90deg) scale(0.95)'
                }
              }}
            >
              <Typography sx={{ color: '#64748B', fontSize: 24, fontWeight: 600, lineHeight: 1 }}>×</Typography>
            </Box>

            <Box sx={{ p: { xs: 3, sm: 4, md: 5 } }}>
              {/* Header */}
              <Box sx={{ textAlign: 'center', mb: { xs: 3, sm: 4 } }}>
                <Typography
                  sx={{
                    fontFamily: 'Inter',
                    fontSize: { xs: '24px', sm: '28px', md: '32px' },
                    fontWeight: 700,
                    color: '#0F172A',
                    letterSpacing: '-0.02em',
                    mb: 1
                  }}
                >
                  Free Forever
                </Typography>
                <Typography
                  sx={{
                    fontFamily: 'Inter',
                    fontSize: { xs: '14px', sm: '15px', md: '16px' },
                    color: '#64748B',
                    fontWeight: 400,
                    maxWidth: 600,
                    mx: 'auto'
                  }}
                >
                  Plan has been activated. Start automating your Instagram engagement with powerful features at ZERO cost.
                </Typography>
              </Box>

              {/* Features */}
              <Box sx={{ mb: { xs: 3, sm: 4 } }}>
                <Typography
                  sx={{
                    fontFamily: 'Inter',
                    fontSize: { xs: '15px', sm: '16px' },
                    fontWeight: 600,
                    color: '#0F172A',
                    mb: 2.5
                  }}
                >
                  What's Included
                </Typography>

                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
                    gap: 2
                  }}
                >
                  {[
                    { text: '5 Leads per month', desc: 'AI-verified quality leads' },
                    { text: '1000 DMs per month', desc: 'Automated messaging' },
                    { text: 'WhatsApp Integration', desc: 'Forward leads instantly' },
                    { text: 'Comment Auto-Reply', desc: 'Engage automatically' },
                    { text: 'Flow Automation', desc: 'Build custom workflows' },
                    { text: 'Follow Detection', desc: 'Track follower actions' },
                    { text: 'PDF Sharing', desc: 'Share documents easily' },
                    { text: 'Link Analytics', desc: 'Track link performance' },
                  ].map((feature, index) => (
                    <Box
                      key={index}
                      sx={{
                        display: 'flex',
                        gap: 2,
                        p: 2,
                        borderRadius: 2,
                        bgcolor: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        transition: 'all 0.2s ease',
                        animation: `fadeInUp 0.4s ease-out ${index * 0.05}s both`,
                        '@keyframes fadeInUp': {
                          '0%': {
                            opacity: 0,
                            transform: 'translateY(10px)'
                          },
                          '100%': {
                            opacity: 1,
                            transform: 'translateY(0)'
                          }
                        },
                        '&:hover': {
                          bgcolor: '#F1F5F9',
                          borderColor: '#CBD5E1'
                        }
                      }}
                    >
                      <Box
                        sx={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          bgcolor: '#DBEAFE',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          mt: 0.25
                        }}
                      >
                        <CheckCircleIcon sx={{ fontSize: 14, color: '#0EA5E9' }} />
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <Typography
                          sx={{
                            fontFamily: 'Inter',
                            fontSize: { xs: '13px', sm: '14px' },
                            fontWeight: 600,
                            color: '#0F172A',
                            mb: 0.25
                          }}
                        >
                          {feature.text}
                        </Typography>
                        <Typography
                          sx={{
                            fontFamily: 'Inter',
                            fontSize: { xs: '12px', sm: '13px' },
                            color: '#64748B',
                            fontWeight: 400
                          }}
                        >
                          {feature.desc}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>

              {/* CTA */}
              <Box
                sx={{
                  p: { xs: 2.5, sm: 3 },
                  borderRadius: 2,
                  bgcolor: '#F8FAFC',
                  border: '1px solid #E2E8F0'
                }}
              >
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  alignItems={{ xs: 'flex-start', sm: 'center' }}
                  justifyContent="space-between"
                  spacing={2}
                >
                  <Box>
                    <Typography
                      sx={{
                        fontFamily: 'Inter',
                        fontSize: { xs: '14px', sm: '15px' },
                        fontWeight: 600,
                        color: '#0F172A',
                        mb: 0.5
                      }}
                    >
                      Need more power?
                    </Typography>
                    <Typography
                      sx={{
                        fontFamily: 'Inter',
                        fontSize: { xs: '13px', sm: '14px' },
                        color: '#64748B',
                        fontWeight: 400
                      }}
                    >
                      Upgrade anytime from profile section.
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={2}>
                    <Button
                      variant="outlined"
                      onClick={handleClosePlanBanner}
                      sx={{
                        py: 1.25,
                        px: 3,
                        borderRadius: 2,
                        textTransform: 'none',
                        fontSize: '14px',
                        fontWeight: 600,
                        fontFamily: 'Inter',
                        borderColor: '#E2E8F0',
                        bgcolor: '#1A2CA3',
                        color: '#FFFFFF',
                        '&:hover': {
                          borderColor: '#CBD5E1',
                          bgcolor: '#FFFFFF',
                          color: '#1A2CA3'
                        }
                      }}
                    >
                      Continue to Dashboard
                    </Button>
                  </Stack>
                </Stack>
              </Box>
            </Box>
          </Box>
        </Box>
      )}

      {/* ── Sticky Header ─────────────────────────────────────────────────────── */}
      <Box
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          bgcolor: "#f8f9fa",
          mx: -3,
          px: 3,
          pt: 2,
          pb: 2,
          mb: 3,
          borderBottom: "1px solid rgba(102,126,234,0.15)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}
      >
        <Stack direction="row" justifyContent="space-between" flexWrap="wrap" gap={2}>
          <Box>
            <Typography sx={{
              fontFamily: 'Inter',
              fontSize: { xs: '22px', md: "26px", lg: "28px" },
              fontWeight: 700,
              background: "linear-gradient(135deg, #001BB7 0%, #667eea 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              Analytics Dashboard
            </Typography>
            <Typography sx={{ fontFamily: 'Inter', fontSize: { xs: '14px', md: "15px" }, fontWeight: 400 }} color="text.secondary">
              Automation performance &amp; growth insights
            </Typography>
          </Box>

          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <DateRange sx={{ color: "#667eea" }} />
            <Select
              size="small"
              value={range}
              onChange={(e) => setRange(e.target.value)}
              sx={{ minWidth: 150 }}
            >
              {Object.entries(RANGE_OPTIONS).map(([k, v]) => (
                <MenuItem key={k} value={k}>{v}</MenuItem>
              ))}
            </Select>

            {range === "custom" && (
              <>
                <TextField
                  type="date"
                  size="small"
                  label="Start Date"
                  InputLabelProps={{ shrink: true }}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <TextField
                  type="date"
                  size="small"
                  label="End Date"
                  InputLabelProps={{ shrink: true }}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
                <Button
                  variant="contained"
                  onClick={handleCustomRange}
                  sx={{
                    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                    "&:hover": {
                      background: "linear-gradient(135deg, #5568d3 0%, #66348d 100%)",
                    }
                  }}
                >
                  Apply
                </Button>
              </>
            )}
          </Stack>
        </Stack>
      </Box>

      {/* Metrics Cards */}
      {data && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} mb={3}>
          <MetricCard
            title="Auto Replies"
            value={formatNumber(data.summary.totalRepliesSent)}
            delta={data.comparison.totalRepliesSent}
            icon={<Reply />}
            gradient={GRADIENT_COLORS[0]}
          />
          <MetricCard
            title="DMs Sent"
            value={formatNumber(data.summary.totalDmsSent)}
            delta={data.comparison.totalDmsSent}
            icon={<Send />}
            gradient={GRADIENT_COLORS[1]}
          />
          <MetricCard
            title="Clicks"
            value={formatNumber(data.summary.totalClicks)}
            delta={data.comparison.totalClicks}
            icon={<TouchApp />}
            gradient={GRADIENT_COLORS[3]}
          />
          <MetricCard
            title="CTR"
            value={`${data.summary.ctr}%`}
            delta={data.comparison.ctr}
            icon={<TrendingUp />}
            gradient={GRADIENT_COLORS[2]}
          />
        </Stack>
      )}

      {/* Chart */}
      <Card
        sx={{
          mb: 3,
          boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
          borderRadius: 3,
          overflow: "hidden"
        }}
      >
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight={700} mb={3} sx={{
            background: "linear-gradient(135deg, #FA5C5C 0%, #764ba2 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>
            DMs Sent – Daily Trend
          </Typography>
          {data ? (
            <ResponsiveContainer width="100%" height={360}>
              <AreaChart
                data={data.chartData || []}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorDm" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FFD41D" stopOpacity={1} />
                    <stop offset="95%" stopColor="#F5F2F2" stopOpacity={1} />
                  </linearGradient>
                  <filter id="shadow" height="200%">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
                    <feOffset dx="0" dy="2" result="offsetblur" />
                    <feComponentTransfer>
                      <feFuncA type="linear" slope="0.3" />
                    </feComponentTransfer>
                    <feMerge>
                      <feMergeNode />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis
                  dataKey="date"
                  stroke="#666"
                  style={{ fontSize: "12px" }}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return `${date.getMonth() + 1}/${date.getDate()}`;
                  }}
                />
                <YAxis stroke="#666" style={{ fontSize: "12px" }} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="dmsSent"
                  stroke="#FF0087"
                  strokeWidth={2}
                  fill="url(#colorDm)"
                  filter="url(#shadow)"
                  animationDuration={1000}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <Skeleton variant="rectangular" width="100%" height={360} />
          )}
        </CardContent>
      </Card>

      {/* Automation Performance — table (desktop) / cards (mobile) */}
      <Card sx={{
        boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
        borderRadius: 3,
        overflow: "hidden"
      }}>
        <CardContent sx={{ py: 3, px: 1 }}>
          <Typography fontWeight={600} mb={2} sx={{
            fontFamily: "Inter",
            fontSize: { xs: "16px", sm: "18px", md: "20px" },
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>
            Top Automation Performance
          </Typography>
          <Divider sx={{ mb: 3 }} />

          {automationLoading ? (
            <Box display="flex" justifyContent="center" alignItems="center" py={8}>
              <Stack spacing={2} alignItems="center">
                <CircularProgress size={50} />
                <Typography variant="body2" color="text.secondary">
                  Loading automation performance...
                </Typography>
              </Stack>
            </Box>
          ) : totalItems > 0 ? (
            <>
              {/* ── Mobile: Card list ─────────────────────────────────────────── */}
              <Box sx={{ display: { xs: "block", sm: "none" } }}>
                {mobileRows.map((row) => (
                  <AutomationCard key={row.automationId} row={row} />
                ))}
                {visibleCount < totalItems && (
                  <Box display="flex" justifyContent="center" mt={2}>
                    <Button
                      variant="outlined"
                      onClick={() => setVisibleCount((v) => v + ROWS_PER_PAGE)}
                      sx={{
                        borderRadius: 2,
                        textTransform: "none",
                        fontFamily: "Inter",
                        fontWeight: 600,
                        borderColor: "#667eea",
                        color: "#667eea",
                        "&:hover": { bgcolor: "#f0f2ff", borderColor: "#5568d3" },
                      }}
                    >
                      Load More
                    </Button>
                  </Box>
                )}
              </Box>

              {/* ── Desktop: Table with pagination ───────────────────────────── */}
              <Box sx={{ display: { xs: "none", sm: "block" }, overflowX: "auto" }}>
                <Table>
                  <TableHead>
                    <TableRow sx={{ bgcolor: "#f8f9fa" }}>
                      <TableCell sx={{ fontWeight: 700 }}>S.No</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Post</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Caption</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Auto Replies</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>DMs Sent</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Clicks</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>CTR %</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedRows.map((row, i) => {
                      const globalIndex = currentPage * ROWS_PER_PAGE + i;
                      return (
                        <TableRow
                          key={row.automationId}
                          sx={{
                            "&:hover": { bgcolor: "#f8f9fa" },
                            transition: "background-color 0.2s"
                          }}
                        >
                          <TableCell>
                            <Chip
                              label={globalIndex + 1}
                              size="small"
                              sx={{
                                fontWeight: 700,
                                background: `linear-gradient(135deg, ${GRADIENT_COLORS[globalIndex % 5].start}, ${GRADIENT_COLORS[globalIndex % 5].end})`,
                                color: "#fff"
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            {row.thumbnail ? (
                              <Avatar
                                variant="rounded"
                                src={row.thumbnail}
                                sx={{ width: 56, height: 56, boxShadow: 2 }}
                              />
                            ) : (
                              <Chip
                                label="AutoDM"
                                color="primary"
                                variant="outlined"
                                size="small"
                              />
                            )}
                          </TableCell>
                          <TableCell sx={{ maxWidth: 300 }}>
                            <Typography variant="body2" noWrap>
                              {row.caption || <em style={{ color: "#999" }}>No caption</em>}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ whiteSpace: "nowrap" }}>
                            <Typography variant="body2" color="text.secondary">
                              {row.createdAt
                                ? new Date(row.createdAt).toLocaleDateString("en-GB")
                                : "—"}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Chip
                              label={formatNumber(row.repliesSent)}
                              size="small"
                              sx={{ bgcolor: "#e3f2fd", color: "#1976d2", fontWeight: 600 }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Chip
                              label={formatNumber(row.totalDms)}
                              size="small"
                              sx={{ bgcolor: "#f3e5f5", color: "#9c27b0", fontWeight: 600 }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Chip
                              label={formatNumber(row.totalClicks)}
                              size="small"
                              sx={{ bgcolor: "#e8f5e9", color: "#2e7d32", fontWeight: 600 }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Chip
                              label={`${row.ctr}%`}
                              size="small"
                              sx={{
                                bgcolor: row.ctr > 50 ? "#e8f5e9" : "#fff3e0",
                                color: row.ctr > 50 ? "#2e7d32" : "#e65100",
                                fontWeight: 700
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <Stack
                    direction="row"
                    justifyContent="center"
                    alignItems="center"
                    spacing={2}
                    mt={2}
                  >
                    <IconButton
                      onClick={() => setCurrentPage((p) => p - 1)}
                      disabled={currentPage === 0}
                      sx={{
                        color: currentPage === 0 ? "#ccc" : "#667eea",
                        bgcolor: currentPage === 0 ? "#f5f5f5" : "#f0f2ff",
                        "&:hover": {
                          bgcolor: currentPage === 0 ? "#f5f5f5" : "#e8ebff",
                        },
                        "&.Mui-disabled": { color: "#ccc", bgcolor: "#f5f5f5" },
                      }}
                    >
                      <ChevronLeft />
                    </IconButton>
                    <Typography variant="body2" color="text.secondary" fontFamily="Inter" fontWeight={600}>
                      {currentPage + 1} / {totalPages}
                    </Typography>
                    <IconButton
                      onClick={() => setCurrentPage((p) => p + 1)}
                      disabled={currentPage === totalPages - 1}
                      sx={{
                        color: currentPage === totalPages - 1 ? "#ccc" : "#667eea",
                        bgcolor: currentPage === totalPages - 1 ? "#f5f5f5" : "#f0f2ff",
                        "&:hover": {
                          bgcolor: currentPage === totalPages - 1 ? "#f5f5f5" : "#e8ebff",
                        },
                        "&.Mui-disabled": { color: "#ccc", bgcolor: "#f5f5f5" },
                      }}
                    >
                      <ChevronRight />
                    </IconButton>
                  </Stack>
                )}
              </Box>
            </>
          ) : (
            <Box display="flex" justifyContent="center" alignItems="center" py={8}>
              <Typography variant="body2" color="text.secondary">
                No automation data available for this period
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

// ── Mobile automation card ────────────────────────────────────────────────────
function AutomationCard({ row }) {
  return (
    <Card
      sx={{
        mb: 2,
        borderRadius: 2,
        boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
        border: "1px solid rgba(102,126,234,0.1)",
      }}
    >
      <CardContent sx={{ p: 2 }}>
        {/* Row 1: Thumbnail + Caption + Date */}
        <Stack direction="row" spacing={2} alignItems="flex-start" mb={1.5}>
          {/* Thumbnail */}
          <Box sx={{ flexShrink: 0 }}>
            {row.thumbnail ? (
              <Avatar
                variant="rounded"
                src={row.thumbnail}
                sx={{ width: 64, height: 64, boxShadow: 2 }}
              />
            ) : (
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: 2,
                  bgcolor: "#f0f0f0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Chip label="AutoDM" color="primary" variant="outlined" size="small" />
              </Box>
            )}
          </Box>

          {/* Caption + date */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              noWrap
              sx={{ color: "#333", fontFamily: "Inter", fontWeight: 500, mb: 0.5 }}
            >
              {row.caption || <em style={{ color: "#999" }}>No caption</em>}
            </Typography>
            <Typography variant="caption" color="text.secondary" fontFamily="Inter">
              Created:{" "}
              {row.createdAt
                ? new Date(row.createdAt).toLocaleDateString("en-GB")
                : "—"}
            </Typography>
          </Box>
        </Stack>

        {/* Row 2: Stats chips */}
        <Stack direction="row" flexWrap="wrap" gap={0.75}>
          <Chip
            label={`Auto Replies: ${formatNumber(row.repliesSent)}`}
            size="small"
            sx={{ bgcolor: "#e3f2fd", color: "#1976d2", fontWeight: 600, fontSize: "11px" }}
          />
          <Chip
            label={`DMs Sent: ${formatNumber(row.totalDms)}`}
            size="small"
            sx={{ bgcolor: "#f3e5f5", color: "#9c27b0", fontWeight: 600, fontSize: "11px" }}
          />
          <Chip
            label={`Clicks: ${formatNumber(row.totalClicks)}`}
            size="small"
            sx={{ bgcolor: "#e8f5e9", color: "#2e7d32", fontWeight: 600, fontSize: "11px" }}
          />
          <Chip
            label={`CTR: ${row.ctr}%`}
            size="small"
            sx={{
              bgcolor: row.ctr > 50 ? "#e8f5e9" : "#fff3e0",
              color: row.ctr > 50 ? "#2e7d32" : "#e65100",
              fontWeight: 700,
              fontSize: "11px",
            }}
          />
        </Stack>
      </CardContent>
    </Card>
  );
}

// ── Metric card ───────────────────────────────────────────────────────────────
function MetricCard({ title, value, delta, icon, gradient }) {
  const positive = delta >= 0;

  return (
    <Card
      sx={{
        flex: 1,
        background: `linear-gradient(135deg, ${gradient.start} 0%, ${gradient.end} 100%)`,
        color: "#fff",
        position: "relative",
        overflow: "hidden",
        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        transition: "transform 0.3s, box-shadow 0.3s",
        "&:hover": {
          transform: "translateY(-4px)",
          boxShadow: "0 12px 32px rgba(0,0,0,0.16)"
        },
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          right: 0,
          width: "120px",
          height: "120px",
          background: "rgba(255,255,255,0.1)",
          borderRadius: "50%",
          transform: "translate(40%, -40%)",
        }
      }}
    >
      <CardContent sx={{ position: "relative", zIndex: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={2}>
          <Typography variant="body2" sx={{ opacity: 0.9, fontWeight: 500, fontFamily: 'Inter' }}>
            {title}
          </Typography>
          <Box sx={{ opacity: 0.7 }}>
            {icon}
          </Box>
        </Stack>

        <Typography sx={{ fontFamily: 'Inter', fontSize: '32px', fontWeight: 700 }} mb={1.5}>
          {value}
        </Typography>

        <Stack direction="row" spacing={0.5} alignItems="center">
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              bgcolor: positive ? "rgba(76, 175, 80, 0.3)" : "rgba(244, 67, 54, 0.3)",
              borderRadius: 1,
              px: 1,
              py: 0.5,
            }}
          >
            {positive ? (
              <ArrowUpward fontSize="small" sx={{ mr: 0.5 }} />
            ) : (
              <ArrowDownward fontSize="small" sx={{ mr: 0.5 }} />
            )}
            <Typography sx={{ fontWeight: 600, fontFamily: 'Inter', fontSize: '12px' }}>
              {Math.abs(delta).toFixed(1)}%
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

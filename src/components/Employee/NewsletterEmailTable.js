// components/NewsletterEmailsTable.js
import { useEffect, useState, useMemo } from "react";
import axios from "axios";
import {
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Pagination,
  CircularProgress,
  Stack,
  Divider,
  useTheme,
  useMediaQuery,
  alpha
} from "@mui/material";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, LabelList } from "recharts";

const API_BASE = "/api/usersOn";

const BAR_COLORS = [
  "#6366F1",
  "#22C55E",
  "#F59E0B",
  "#EF4444",
  "#3B82F6",
  "#A855F7",
  "#14B8A6",
  "#EAB308",
  "#F97316",
  "#10B981",
];

// Stat Card Component
const StatCard = ({ label, value, icon: Icon }) => (
  <Card
    elevation={0}
    sx={{
      borderRadius: 2.5,
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      color: "white",
      transition: "all 0.3s ease",
      "&:hover": {
        transform: "translateY(-2px)",
        boxShadow: "0 8px 20px rgba(102, 126, 234, 0.4)",
      },
    }}
  >
    <CardContent sx={{ p: { xs: 1.5, md: 2 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Typography
            sx={{
              fontSize: { xs: "0.7rem", md: "0.75rem" },
              opacity: 0.9,
              fontWeight: 600,
              mb: 0.5,
            }}
          >
            {label}
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: "1.5rem", md: "2rem" },
              fontWeight: 800,
              letterSpacing: "-0.5px",
            }}
          >
            {value}
          </Typography>
        </Box>
        {Icon && <Icon sx={{ fontSize: { xs: 28, md: 36 }, opacity: 0.2 }} />}
      </Stack>
    </CardContent>
  </Card>
);

export default function NewsletterEmailsTable({ blockId = null }) {
  const theme = useTheme();
  const isXs = useMediaQuery(theme.breakpoints.down("sm"));
  const isSm = useMediaQuery(theme.breakpoints.between("sm", "md"));

  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({ totalSubscribers: 0, last7Days: 0, last28Days: 0 });
  const [page, setPage] = useState(1); // 1-based for pagination
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [topCities, setTopCities] = useState([]);
  const [topRegions, setTopRegions] = useState([]);

  const totalPages = Math.ceil(total / limit);
  const yAxisWidth = isXs ? 70 : isSm ? 100 : 140;
  const fontSize = isXs ? 10 : 12;

  {/* Custom Tooltip Component */}
const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <Box
        sx={{
          backgroundColor: "rgba(0, 0, 0, 0.95)",
          color: "#FFFFFF",
          padding: "12px 16px",
          borderRadius: 2,
          border: "1px solid rgba(255,255,255,0.2)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          fontFamily: "Inter",
          fontSize: "14px",
          fontWeight: 600,
          zIndex: 9999,
        }}
      >
        <Typography sx={{ color: "white", fontFamily: "Inter", fontWeight: 600 }}>
          {numberFmt(payload[0].value)}
        </Typography>
      </Box>
    );
  }
  return null;
};




  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      try {
        const res = await axios.post(
          `${API_BASE}/newsletter-list-emails`,
          { page, limit, blockId },
          { withCredentials: true }
        );

        if (!cancelled) {
          setRows(res.data.rows || []);
          setStats(res.data.stats || { totalSubscribers: 0, last7Days: 0, last28Days: 0 });
          setTotal(res.data.total || 0);

          const cities = (res.data.topCities || [])
            .sort((a, b) => (b.count || 0) - (a.count || 0))
            .slice(0, 10);
          const regions = (res.data.topRegions || [])
            .sort((a, b) => (b.count || 0) - (a.count || 0))
            .slice(0, 10);

          setTopCities(cities);
          setTopRegions(regions);
        }
      } catch (e) {
        console.error("Fetch emails failed:", e);
        if (!cancelled) {
          setRows([]);
          setStats({ totalSubscribers: 0, last7Days: 0, last28Days: 0 });
          setTotal(0);
          setTopCities([]);
          setTopRegions([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [page, limit, blockId]);

  const handlePageChange = (e, value) => {
    setPage(value);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const numberFmt = (v) => Intl.NumberFormat().format(v ?? 0);

  return (
    <Box sx={{ p: { xs: 1.5, md: 2 }, maxWidth: 1400, mx: "auto" }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography
          sx={{
            fontFamily: "Inter",
            fontWeight: 700,
            fontSize: { xs: "1.5rem", md: "2rem" },
            mb: 0.5,
          }}
        >
          📧 Newsletter Subscribers
        </Typography>
        <Typography
          sx={{
            fontFamily: "Inter",
            fontSize: { xs: "0.875rem", md: "1rem" },
            opacity: 0.7,
          }}
        >
          Manage and analyze your subscriber list
        </Typography>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard label="Total Subscribers" value={numberFmt(stats.totalSubscribers)} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard label="Last 7 Days" value={numberFmt(stats.last7Days)} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatCard label="Last 28 Days" value={numberFmt(stats.last28Days)} />
        </Grid>
      </Grid>

      {/* Email Table */}
      <Card elevation={0} sx={{ borderRadius: 2.5, mb: 3, border: `1px solid ${alpha(theme.palette.divider, 0.5)}` }}>
        <CardContent sx={{ p: { xs: 0, md: 2 } }}>
          <Typography
            variant="subtitle1"
            fontWeight={700}
            sx={{ mb: 2, px: { xs: 1.5, md: 0 }, pt: { xs: 1.5, md: 0 }, fontFamily: "Inter" }}
          >
            Subscribers List
          </Typography>
          <Divider sx={{ mb: 2, display: { xs: "none", md: "block" } }} />

          {/* Table - Desktop View */}
          {!isXs && (
            <TableContainer>
              <Table size={isXs ? "small" : "medium"}>
                <TableHead>
                  <TableRow sx={{ backgroundColor: alpha(theme.palette.primary.main, 0.05) }}>
                    <TableCell sx={{ fontWeight: 700, fontFamily: "Inter" }}>S.No</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontFamily: "Inter" }}>Email</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontFamily: "Inter" }}>Subscribed Date</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={3} align="center" sx={{ py: 4 }}>
                        <CircularProgress size={32} />
                      </TableCell>
                    </TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} align="center" sx={{ py: 3 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "Inter" }}>
                          No subscribers yet
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((r, idx) => {
                      const serial = (page - 1) * limit + idx + 1;
                      const dateStr = r.subscribed_at
                        ? new Date(r.subscribed_at).toLocaleDateString("en-IN")
                        : "-";
                      return (
                        <TableRow
                          key={`${r.email}-${serial}`}
                          sx={{
                            "&:hover": { backgroundColor: alpha(theme.palette.primary.main, 0.02) },
                            fontFamily: "Inter",
                          }}
                        >
                          <TableCell sx={{ fontFamily: "Inter" }}>{serial}</TableCell>
                          <TableCell sx={{ fontFamily: "Inter", wordBreak: "break-all" }}>
                            {r.email}
                          </TableCell>
                          <TableCell sx={{ fontFamily: "Inter" }}>{dateStr}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* Mobile Card View */}
          {isXs && (
            <Box sx={{ px: 1.5 }}>
              {loading ? (
                <Box sx={{ py: 4, display: "flex", justifyContent: "center" }}>
                  <CircularProgress size={32} />
                </Box>
              ) : rows.length === 0 ? (
                <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 3, fontFamily: "Inter" }}>
                  No subscribers yet
                </Typography>
              ) : (
                rows.map((r, idx) => {
                  const serial = (page - 1) * limit + idx + 1;
                  const dateStr = r.subscribed_at
                    ? new Date(r.subscribed_at).toLocaleDateString("en-IN")
                    : "-";
                  return (
                    <Paper
                      key={`${r.email}-${serial}`}
                      elevation={0}
                      sx={{
                        p: 1.5,
                        mb: 1.5,
                        borderRadius: 1.5,
                        backgroundColor: alpha(theme.palette.primary.main, 0.03),
                        border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
                      }}
                    >
                      <Stack spacing={0.5}>
                        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, fontFamily: "Inter" }}>
                            #{serial}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "Inter" }}>
                            {dateStr}
                          </Typography>
                        </Box>
                        <Typography
                          sx={{
                            fontSize: "0.875rem",
                            fontWeight: 600,
                            wordBreak: "break-all",
                            fontFamily: "Inter",
                          }}
                        >
                          {r.email}
                        </Typography>
                      </Stack>
                    </Paper>
                  );
                })
              )}
            </Box>
          )}
        </CardContent>

        {/* Pagination */}
        {rows.length > 0 && (
          <Box sx={{ display: "flex", justifyContent: "center", pt: 2, pb: 2, px: 2 }}>
            <Pagination
              count={totalPages}
              page={page}
              onChange={handlePageChange}
              color="primary"
              size={isXs ? "small" : "medium"}
              sx={{ fontFamily: "Inter" }}
            />
          </Box>
        )}
      </Card>

      {/* Charts Section */}
      {(topCities.length > 0 || topRegions.length > 0) && (
        <>

{/* Top Cities Chart */}
<Card elevation={0} sx={{ borderRadius: 2.5, mb: 3, border: `1px solid ${alpha(theme.palette.divider, 0.5)}`, overflow: "visible" }}>
  <CardContent sx={{ p: { xs: 1.5, md: 2 }, overflow: "visible" }}>
    <Typography
      variant="subtitle1"
      fontWeight={700}
      sx={{ mb: 2, fontFamily: "Inter" }}
    >
      🏙️ Top Cities
    </Typography>
    <Divider sx={{ mb: 2 }} />
    
    {/* Dark Background Box for Chart */}
    <Box 
      sx={{ 
        width: "100%", 
        height: { xs: 280, md: 360 },
        backgroundColor: "#70B2B2",
        borderRadius: 2,
        p: 1.5,
        overflow: "visible"
      }}
    >
      <ResponsiveContainer>
        <BarChart
          data={topCities}
          layout="vertical"
          margin={{
            top: 8,
            right: 16,
            left: isXs ? 0 : 8,
            bottom: 8,
          }}
          barCategoryGap={isXs ? 10 : 20}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
          <XAxis
            type="number"
            tick={{ fontSize, fill: "#FFFFFF" }}
            tickLine={false}
            axisLine={false}
            domain={[0, "dataMax"]}
          />
          <YAxis
            dataKey="name"
            type="category"
            width={yAxisWidth}
            tick={{ fontSize, fill: "#FFFFFF" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) =>
              isXs && String(v).length > 12 ? `${String(v).slice(0, 12)}…` : v
            }
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: "rgba(255,255,255,0.15)" }}
            wrapperStyle={{ outline: "none" }}
          />
          <Bar dataKey="count" radius={[0, 8, 8, 0]}>
            <LabelList 
              dataKey="count" 
              position="right" 
              formatter={numberFmt}
            />
            {topCities.map((_, idx) => (
              <Cell key={`city-${idx}`} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Box>
  </CardContent>
</Card>

{/* Top States Chart */}
<Card elevation={0} sx={{ borderRadius: 2.5, border: `1px solid ${alpha(theme.palette.divider, 0.5)}`, overflow: "visible" }}>
  <CardContent sx={{ p: { xs: 1.5, md: 2 }, overflow: "visible" }}>
    <Typography
      variant="subtitle1"
      fontWeight={700}
      sx={{ mb: 2, fontFamily: "Inter" }}
    >
      📍 Top States
    </Typography>
    <Divider sx={{ mb: 2 }} />
    
    {/* Dark Background Box for Chart */}
    <Box 
      sx={{ 
        width: "100%", 
        height: { xs: 280, md: 360 },
        backgroundColor: "#70B2B2",
        borderRadius: 2,
        p: 1.5,
        overflow: "visible"
      }}
    >
      <ResponsiveContainer>
        <BarChart
          data={topRegions}
          margin={{
            top: 8,
            right: 16,
            left: 8,
            bottom: isXs ? 40 : 32,
          }}
          barCategoryGap={isXs ? 8 : 16}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
          <XAxis
            dataKey="name"
            tick={{ fontSize, fill: "#FFFFFF" }}
            angle={-30}
            textAnchor="end"
            height={isXs ? 50 : 60}
            tickLine={false}
            axisLine={false}
            interval={0}
          />
          <YAxis
            tick={{ fontSize, fill: "#FFFFFF" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: "rgba(255,255,255,0.15)" }}
            wrapperStyle={{ outline: "none" }}
          />
          <Bar dataKey="count" radius={[8, 8, 0, 0]}>
            <LabelList 
              dataKey="count" 
              position="top" 
              formatter={numberFmt}
            />
            {topRegions.map((_, idx) => (
              <Cell key={`region-${idx}`} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Box>
  </CardContent>
</Card>





        </>
      )}
    </Box>
  );
}

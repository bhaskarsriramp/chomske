import React, { useEffect, useMemo, useState } from "react";
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Chip,
  Container,
  Dialog,
  IconButton,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Toolbar,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Paper,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import axios from "axios";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";

const truncate = (str = "", n = 30) => (str.length > n ? str.slice(0, n - 1) + "…" : str);

const COLORS = [
  "#7C4DFF", "#29B6F6", "#FF7043", "#66BB6A", "#AB47BC",
  "#26A69A", "#FFCA28", "#EC407A", "#42A5F5", "#8D6E63",
];

function DurationSelector({ value, onChange }) {
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={value}
      onChange={(e, v) => v && onChange(v)}
    >
      <ToggleButton value="today">Today</ToggleButton>
      <ToggleButton value="last7">Last 7 days</ToggleButton>
      <ToggleButton value="last28">Last 28 days</ToggleButton>
    </ToggleButtonGroup>
  );
}

function AnalyticsDialog({ open, onClose, product, rangeKey, setRangeKey, details, loading }) {
  const cities = (details?.topCities || []).map((d) => ({
    name: d.name || "Unknown",
    visitors: d.visitors,
  }));
  const states = (details?.topStates || []).map((d) => ({
    name: d.name || "Unknown",
    visitors: d.visitors,
  }));

  return (
    <Dialog fullScreen open={open} onClose={onClose}>
      <AppBar elevation={0} color="default" sx={{ position: "sticky" }}>
        <Toolbar>
          <IconButton edge="start" onClick={onClose} aria-label="close">
            <CloseIcon />
          </IconButton>
          <Typography sx={{ ml: 2, flex: 1 }} variant="h6" component="div">
            {product?.title || "Product"} – Analytics
          </Typography>
          <DurationSelector value={rangeKey} onChange={setRangeKey} />
        </Toolbar>
        {loading && <LinearProgress />}
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 3 }}>
        {/* Summary */}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 3 }}>
          <Paper sx={{ p: 2, flex: 1 }}>
            <Typography variant="subtitle2">Clicks</Typography>
            <Typography variant="h5" fontWeight={700}>
              {details?.summary?.clicks ?? 0}
            </Typography>
          </Paper>
          <Paper sx={{ p: 2, flex: 1 }}>
            <Typography variant="subtitle2">Visitors (unique IPs)</Typography>
            <Typography variant="h5" fontWeight={700}>
              {details?.summary?.visitors ?? 0}
            </Typography>
          </Paper>
        </Stack>

        {/* Charts (stacked vertically & colorful) */}
        <Stack direction="column" spacing={2}>
          <Paper sx={{ p: 2, width: "100%", minHeight: 360 }}>
            <Typography variant="subtitle1" sx={{ mb: 2 }}>
              Top 10 Cities by Visitors
            </Typography>
            <Box sx={{ width: "100%", height: 300 }}>
              <ResponsiveContainer>
                <BarChart
                  data={cities}
                  margin={{ left: 10, right: 10, top: 10, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="name"
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="visitors">
                    {cities.map((_, idx) => (
                      <Cell key={`city-${idx}`} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Paper>

          <Paper sx={{ p: 2, width: "100%", minHeight: 360 }}>
            <Typography variant="subtitle1" sx={{ mb: 2 }}>
              Top 10 States by Visitors
            </Typography>
            <Box sx={{ width: "100%", height: 300 }}>
              <ResponsiveContainer>
                <BarChart
                  data={states}
                  margin={{ left: 10, right: 10, top: 10, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="name"
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="visitors">
                    {states.map((_, idx) => (
                      <Cell key={`state-${idx}`} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Stack>
      </Container>
    </Dialog>
  );
}

export default function StoreAnalytics() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [rangeKey, setRangeKey] = useState("last7");
  const [details, setDetails] = useState(null);
  const [clicksSort, setClicksSort] = useState("desc"); // 'asc' | 'desc'
  const baseUrl = "/api/usersOn";

  const userId = typeof window !== "undefined" ? window.localStorage.getItem("user_id") : null;

  const fetchTable = async () => {
    setLoading(true);
    try {
      const res = await axios.post(
        baseUrl + "/product-analytics/table",
        {},
        {
          withCredentials: true
        }
      );
      setRows(res.data?.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchDetails = async (productId, rk) => {
    setLoading(true);
    try {
      const res = await axios.post(
        baseUrl + "/product-analytics/details",
        { productId, rangeKey: rk },
        {
          withCredentials: true
        }
      );
      setDetails(res.data?.data || null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (dialogOpen && selectedProduct?._id) {
      fetchDetails(selectedProduct._id, rangeKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, rangeKey, selectedProduct?._id]);

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) =>
      clicksSort === "asc"
        ? (a.clicks ?? 0) - (b.clicks ?? 0)
        : (b.clicks ?? 0) - (a.clicks ?? 0)
    );
    return arr;
  }, [rows, clicksSort]);

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>
          Store Analytics
        </Typography>
        {loading && <LinearProgress sx={{ width: 200 }} />}
      </Stack>

      <Paper sx={{ width: "100%", overflow: "hidden" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>S.No</TableCell>
              <TableCell>Product Title</TableCell>
              <TableCell>Product Image</TableCell>
              <TableCell>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <Typography>Clicks</Typography>
                  <IconButton
                    size="small"
                    aria-label="sort by clicks"
                    onClick={() => setClicksSort((p) => (p === "asc" ? "desc" : "asc"))}
                    sx={{ ml: 0.5 }}
                  >
                    {clicksSort === "asc" ? (
                      <ArrowUpwardIcon fontSize="inherit" />
                    ) : (
                      <ArrowDownwardIcon fontSize="inherit" />
                    )}
                  </IconButton>
                </Stack>
              </TableCell>
              <TableCell>Visitors</TableCell>
              <TableCell align="right">Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedRows.map((row, idx) => (
              <TableRow key={row._id || idx} hover>
                <TableCell>{idx + 1}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography title={row.title} sx={{ maxWidth: 360 }}>
                      {truncate(row.title, 30)}
                    </Typography>
                  </Stack>
                </TableCell>
                <TableCell>
                  {row.imageUrl ? (
                    <Avatar
                      variant="rounded"
                      src={row.imageUrl}
                      alt={row.title}
                      sx={{ width: 48, height: 48 }}
                    />
                  ) : (
                    <Avatar variant="rounded" sx={{ width: 48, height: 48 }}>
                      {(row.title || "?").slice(0, 1).toUpperCase()}
                    </Avatar>
                  )}
                </TableCell>
                <TableCell >
                  {row.clicks ?? 0}
                </TableCell>
                <TableCell>
                {row.visitors ?? 0}
                </TableCell>
                <TableCell align="right">
                  <Button
                    variant="contained"
                    onClick={() => {
                      setSelectedProduct(row);
                      setDialogOpen(true);
                    }}
                    sx={{ background : '#59AC77'}}
                  >
                    Show Analytics
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 && !loading && (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <Typography variant="body2">No products found.</Typography>
          </Box>
        )}
      </Paper>

      <AnalyticsDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        product={selectedProduct}
        rangeKey={rangeKey}
        setRangeKey={setRangeKey}
        details={details}
        loading={loading}
      />
    </Container>
  );
}

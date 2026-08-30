import  { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Box,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Typography,
  TextField,
  Chip,
  Divider,
  Button,
  Avatar
} from "@mui/material";
import ShoppingBagIcon from "@mui/icons-material/ShoppingBag";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import MonetizationOnIcon from "@mui/icons-material/MonetizationOn";
import { useNavigate } from "react-router-dom";

function formatINR(paise) {
  if (typeof paise !== "number") return "-";
  const rupees = paise / 100;
  return rupees.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
}

function toISODateString(d) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function DigitalTransactions() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const baseUrl = "/api/usersOn";

  const navigate = useNavigate();

  // Date range state
  const [preset, setPreset] = useState("last30");
  const [start, setStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return toISODateString(d);
  });
  const [end, setEnd] = useState(() => toISODateString(new Date()));

  // Compute request params
  const params = useMemo(() => {
    const p = { page: page + 1, limit };
    if (preset === "custom") {
      p.start = new Date(start).toISOString();
      const endDate = new Date(end);
      endDate.setHours(23, 59, 59, 999);
      p.end = endDate.toISOString();
    } else {
      if (preset === "last30") {
        const d = new Date(); d.setDate(d.getDate() - 30);
        p.start = d.toISOString();
        p.end = new Date().toISOString();
      } else if (preset === "last90") {
        const d = new Date(); d.setDate(d.getDate() - 90);
        p.start = d.toISOString();
        p.end = new Date().toISOString();
      }
      // last7 => rely on server default
    }
    return p;
  }, [page, limit, preset, start, end]);

  const fetchData = async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await axios.get(baseUrl + "/get-my-transactions", {
        params,
        withCredentials: true,
      });
      setRows(res.data?.data || []);
      setTotal(res.data?.total || 0);
    } catch (e) {
      console.error(e);
      setErr(e?.response?.data?.error || "Failed to load transactions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.page, params.limit, params.start, params.end]);

  const handlePresetChange = (e) => {
    const v = e.target.value;
    setPreset(v);
    if (v !== "custom") setPage(0);
  };

  const RightDateControls = (
    <Stack direction="row" spacing={1} alignItems="center">
      <FormControl size="small" sx={{ minWidth: 160 }}>
        <InputLabel id="range-label">Date Range</InputLabel>
        <Select
          labelId="range-label"
          label="Date Range"
          value={preset}
          onChange={handlePresetChange}
        >
          <MenuItem value="last7">Last 7 Days</MenuItem>
          <MenuItem value="last30">Last 30 Days</MenuItem>
          <MenuItem value="last90">Last 90 Days</MenuItem>
          <MenuItem value="custom">Custom</MenuItem>
        </Select>
      </FormControl>

      {preset === "custom" && (
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            size="small"
            label="Start"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            size="small"
            label="End"
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        </Stack>
      )}
    </Stack>
  );

  const EmptyState = () => (
    <Box
      sx={{
        py: 8,
        px: 2,
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
      }}
    >
      {/* Colorful icon cluster */}
      <Stack direction="row" spacing={2} justifyContent="center">
        <Avatar sx={{
          width: 56, height: 56,
          background: "linear-gradient(135deg, #6366F1, #22D3EE)"
        }}>
          <ShoppingBagIcon />
        </Avatar>
        <Avatar sx={{
          width: 56, height: 56,
          background: "linear-gradient(135deg, #F59E0B, #EF4444)"
        }}>
          <RocketLaunchIcon />
        </Avatar>
        <Avatar sx={{
          width: 56, height: 56,
          background: "linear-gradient(135deg, #10B981, #34D399)"
        }}>
          <MonetizationOnIcon />
        </Avatar>
      </Stack>

      <Typography variant="h6" fontWeight={700} sx={{ mt: 1 }}>
        No Orders Yet
      </Typography>
      <Typography variant="body2" color="text.secondary" maxWidth={520}>
        You haven't received any orders or payments in the selected date range. Start selling your digital products and your orders will appear here in real time.
      </Typography>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 1 }}>
        <Button
          variant="contained"
          onClick={() => navigate("/professional/store/products")}
        >
          Add a Product
        </Button>
        <Button
          variant="text"
          onClick={() => {
            setPreset("last30");
          }}
        >
          Try Last 30 Days
        </Button>
      </Stack>
    </Box>
  );

  return (
    <Card elevation={1}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h5" fontWeight={700}>My Orders</Typography>
          {RightDateControls}
        </Stack>

        <Divider sx={{ mb: 2 }} />

        {loading ? (
          <Box display="flex" justifyContent="center" py={8}><CircularProgress /></Box>
        ) : err ? (
          <Box color="error.main" py={4}>{err}</Box>
        ) : (
          <>
            {rows.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                <TableContainer sx={{ borderRadius: 2, overflow: "hidden" }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell align="center">S.No</TableCell>
                        <TableCell>Product Title</TableCell>
                        <TableCell>Transaction Date</TableCell>
                        <TableCell>Amount</TableCell>
                        <TableCell>Email</TableCell>
                        <TableCell>Phone</TableCell>
                        <TableCell>Payment</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((r, idx) => {
                        const serial = page * limit + idx + 1;
                        const dateStr = r.paidAt ? new Date(r.paidAt).toLocaleString() : "-";
                        const email = r.customer?.email || "-";
                        const phone = r.customer?.phone || "-";
                        const success = r.status === "paid";
                        return (
                          <TableRow hover key={r._id || r.orderId}>
                            <TableCell align="center">{serial}</TableCell>
                            <TableCell>{r.productTitle || "-"}</TableCell>
                            <TableCell>{dateStr}</TableCell>
                            <TableCell>{formatINR(r.amount)}</TableCell>
                            <TableCell>{email}</TableCell>
                            <TableCell>{phone}</TableCell>
                            <TableCell>
                              <Chip
                                label={success ? "Success" : (r.status || "—")}
                                color={success ? "success" : "default"}
                                size="small"
                                variant="filled"
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>

                <TablePagination
                  component="div"
                  count={total}
                  page={page}
                  onPageChange={(_, newPage) => setPage(newPage)}
                  rowsPerPage={limit}
                  onRowsPerPageChange={(e) => {
                    setLimit(parseInt(e.target.value, 10));
                    setPage(0);
                  }}
                  rowsPerPageOptions={[10, 25, 50, 100]}
                />
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

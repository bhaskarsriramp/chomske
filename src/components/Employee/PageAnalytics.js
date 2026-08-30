// =============================
// Frontend: PageAnalytics.jsx
// =============================
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Card,
  CardContent,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  useTheme,
  useMediaQuery,
  Grid,
  CircularProgress,
  Divider,
  Stack,
} from "@mui/material";
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
  LabelList,          // ⬅️ NEW
} from "recharts";
import EmojiPeopleOutlinedIcon from '@mui/icons-material/EmojiPeopleOutlined';
import ShowChartOutlinedIcon from '@mui/icons-material/ShowChartOutlined';
import ViewAgendaOutlinedIcon from '@mui/icons-material/ViewAgendaOutlined';
import DoneAllOutlinedIcon from '@mui/icons-material/DoneAllOutlined';
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function PageAnalytics({
  apiBase = "/api",
  barColors = { city: "#4F46E5", region: "#10B981" },
  fontSize = 12,
  showLegend = false,
  tooltipFormatter,
  cardSx,
  showBarLabels = true, // ⬅️ NEW (in case you want to toggle later)
}) {
  const [duration, setDuration] = useState("28d"); // today|7d|28d
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const [data, setData] = useState({
    summary: { visitors: 0, pageViews: 0 },
    cities: [],  // [{ city, visitors, pageViews }]
    regions: [], // [{ region, visitors, pageViews }]
  });

      const handleSessionExpired = () => {
          toast.error("Session expired. Please log in again.");
          setTimeout(() => {
            navigate("/professional/login");
          }, 2000);
        };

  const { startDate, endDate } = useMemo(() => {
    const end = dayjs().endOf("day");
    let start;
    if (duration === "today") start = dayjs().startOf("day");
    else if (duration === "28d") start = end.subtract(27, "day").startOf("day");
    else start = end.subtract(6, "day").startOf("day"); // default 7d
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }, [duration]);

      useEffect(() => {
        const verifyToken = async () => {
          setLoading(true);
          try {
            
            const res = await axios.get(`${apiBase}/usersOn/verify-login-token`, {
              withCredentials: true,
            });
            if (res.data.valid) {
    
                 const creatorHandleRes = await axios.get(
                        `${apiBase}/usersOn/check-handle-created`,
                        { withCredentials: true }
                      );
              
                      if(!creatorHandleRes.data.success){
  
            navigate("/professional/creator/onboarding");
              
                      }
            } else {
              handleSessionExpired();
            }
          } catch (error) {
            if (
              error.response &&
              (error.response.status === 401 || error.response.status === 403)
            ) {
              handleSessionExpired();
            } else {
              toast.error("Network error, please try again later.");
              handleSessionExpired();
            }
          } finally {
            setLoading(false);
          }
        };
        verifyToken();
      }, []);



  useEffect(() => {
    let ignore = false;
    async function fetchData() {
      setLoading(true);
      setError("");
      try {
        const res = await axios.post(
          `${apiBase}/usersOn/page-analytics`,
          { startDate, endDate },
          { withCredentials: true }
        );
        if (!ignore) setData(res.data || {});
      } catch (e) {
        console.error(e);
        if (!ignore) setError(e?.response?.data?.message || "Failed to load analytics");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    fetchData();
    return () => { ignore = true; };
  }, [apiBase, startDate, endDate]);

  const numberFmt = (v) => Intl.NumberFormat().format(v ?? 0);
  const defaultTooltipFormatter = (value, name) => [numberFmt(value), name];
    const DURATION_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "28d", label: "Last 28 days" },
];

  const theme = useTheme();
  const isXs = useMediaQuery(theme.breakpoints.down("sm")); // <600px
  const isSm = useMediaQuery(theme.breakpoints.between("sm", "md")); // 600–900px
  const yAxisWidth = isXs ? 80 : isSm ? 120 : 160;



  // Top 10 Cities (by Visitors, DESC)
  const cityData = useMemo(() => {
    const arr = (data?.cities || []).map((c) => ({
      name: c.city || "Unknown",
      Visitors: c.visitors || 0,
      PageViews: c.pageViews || 0,
    }));
    return arr.sort((a, b) => b.Visitors - a.Visitors).slice(0, 10);
  }, [data]);

  // Top 10 Regions (by Visitors, DESC)
  const regionData = useMemo(() => {
    const arr = (data?.regions || []).map((r) => ({
      name: r.region || "Unknown",
      Visitors: r.visitors || 0,
      PageViews: r.pageViews || 0,
    }));
    return arr.sort((a, b) => b.Visitors - a.Visitors).slice(0, 10);
  }, [data]);

  return (
    // <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: "auto" }}>
          <Box sx={{ p: { xs: 0, md: 1 }, maxWidth: 1400, mx: "auto", my: 2 }}>

{loading ?  (<Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
                                  <CircularProgress size={28} />
                                </Box>  
                    ) :
                    (
                      <>
      <Grid container alignItems="center" sx={{ mb: 2 }}>
     <Grid size={{ xs: 6, sm: 6, md: 6 }}>
       <Typography
         sx={{ fontFamily: "Inter", fontWeight: 600, fontSize: { xs: 16, sm: 16, md: 22 } }}
       >
         Page Analytics
       </Typography>
     </Grid>
   
     <Grid
       size={{ xs: 6, sm: 6, md: 6 }}
       sx={{ display: "flex", justifyContent: { xs: "flex-start", md: "flex-end" }, mt: { xs: 1, md: 0 } }}
     >
       <FormControl size="small" sx={{ minWidth: 180 }}>
         <InputLabel id="duration-label" sx={{ fontFamily: "Inter" }}>Range</InputLabel>
         <Select
           labelId="duration-label"
           id="duration-select"
           value={duration}
           label="Range"
           onChange={(e) => setDuration(e.target.value)}
           disabled={loading}
           sx={{ fontFamily: "Inter", fontSize: { xs: 14, sm: 14, md: 12 } }}
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


           <Grid size={{ xs: 6, sm: 6, md : 3}}>
                  <Card elevation={3} sx={{background : '#16C47F', borderRadius: 3, ...cardSx, cursor : 'pointer' }} >
                    <CardContent>
                      <Stack sx={{ display : 'flex', flexDirection : 'row', justifyContent : 'space-between', mb: 2}}>
                        <EmojiPeopleOutlinedIcon sx={{ color: '#D9EAFD'}}/>
                        <ShowChartOutlinedIcon sx={{ color: '#D9EAFD'}}/>
                      </Stack>
                      <Typography sx={{fontFamily: 'Inter', fontSize : { xs: 14, md: 14}, mb: 0.5, color: '#FFFFFF', pl: 1 }}>Bio Page Visitors</Typography>
                      <Typography sx={{ fontFamily : 'Inter', fontSize : {xs : 18, md: 32}, fontWeight : 700, color: '#FFFFFF', pl: 1}}>
                        {loading ? "—" : numberFmt(data?.summary?.visitors)}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                  <Grid size={{ xs: 6, sm: 6, md : 3}}>
                  <Card elevation={3} sx={{background : '#450693', borderRadius: 3, ...cardSx, cursor : 'pointer' }}>
                    <CardContent>
                      <Stack sx={{ display : 'flex', flexDirection : 'row', justifyContent : 'space-between', mb: 2}}>
                        <ViewAgendaOutlinedIcon sx={{ color: '#D9EAFD'}}/>
                        <DoneAllOutlinedIcon sx={{ color: '#D9EAFD'}}/>
                      </Stack>
                      <Typography sx={{fontFamily: 'Inter', fontSize : { xs: 14, md: 14}, mb: 0.5, color: '#FFFFFF', pl: 1 }}>Page Views</Typography>
                      <Typography sx={{ fontFamily : 'Inter', fontSize : {xs : 18, md: 32}, fontWeight : 700, color: '#FFFFFF', pl: 1}}>
                        {loading ? "—" : numberFmt(data?.summary?.pageViews)}
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
        {/* <Grid container spacing={2} mb={8}> */}
        <Grid container spacing={2} sx={{ mb: isXs ? 4 : 4}}>

         
          <Grid size={{ xs: 12, md: 12}}>
            <Card elevation={1} sx={{ borderRadius: 2, height: '100%', ...cardSx }}>
              <CardContent sx={{ height: "100%" }}>
                <Typography sx={{ mb: 1, fontFamily : 'Inter', fontSize : isXs ? '15px' : '16px', fontWeight : 600 }}>
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
                      left: isXs ? 0 : 8, // reduce left margin on small screens
                      bottom: 8,
                    }}
                    barCategoryGap={isXs ? 10 : 20}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize }} domain={[0, "dataMax"]} tickMargin={4} />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={yAxisWidth}             // 👈 responsive
                      tick={{ fontSize }}
                      tickMargin={4}
                      // optional: truncate very long labels on small screens
                      tickFormatter={(v) => (isXs && String(v).length > 12 ? `${String(v).slice(0, 12)}…` : v)}
                    />
                    <Tooltip formatter={tooltipFormatter || defaultTooltipFormatter} />
                    {showLegend && <Legend />}
                    <Bar dataKey="Visitors" fill={barColors.city} radius={[4, 4, 4, 4]}>
                      {showBarLabels && (
                        <LabelList dataKey="Visitors" position="right" formatter={numberFmt} />
                      )}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                
              </CardContent>
            </Card>
          </Grid>


           <Grid size={{ xs: 12, md: 12}}>
            <Card elevation={1} sx={{ borderRadius: 2, height: '100%', ...cardSx }}>
              <CardContent sx={{ height: "100%" }}>
                <Typography sx={{ mb: 1, fontFamily : 'Inter', fontSize : isXs ? '15px' : '16px', fontWeight : 600 }}>
                Top 10 States by Visitors
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
                      {showBarLabels && (
                        <LabelList
                          dataKey="Visitors"
                          position="top"              // ⬅️ number above each bar
                          formatter={numberFmt}
                        />
                      )}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
          </Grid>
          </>
      )}
</>
                    )}
    
    </Box>
  );
}

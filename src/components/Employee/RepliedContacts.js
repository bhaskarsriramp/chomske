import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Box,
    Stack,
    Typography,
    CircularProgress,
    Alert,
    Avatar,
    Chip,
    Card,
    CardActionArea,
    useMediaQuery,
    useTheme,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Link,
    Tooltip,
    Select,
    MenuItem,
    Button,
    Pagination,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Grid
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import dayjs from 'dayjs';
import axios from 'axios';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import SearchOffIcon from '@mui/icons-material/SearchOff';
import InstagramIcon from '@mui/icons-material/Instagram';

const NoContactsYet = () => (
    <Box sx={{ py: 6, px: 3, display: "flex", flexDirection: "column", alignItems: "center", gap: 2.5, border: "2px dashed", borderColor: "grey.300", borderRadius: 3, bgcolor: "grey.50", textAlign: "center", mt: 3 }}>
        <Box sx={{ width: 64, height: 64, borderRadius: "50%", display: "grid", placeItems: "center", bgcolor: "primary.main", color: 'white' }}>
            <InstagramIcon fontSize="large" />
        </Box>
        <Typography variant="h6" fontWeight={700}>No Contacts Created Yet</Typography>
        <Typography variant="body1" color="text.secondary" maxWidth={400}>
            Users who comment with keywords on your automated Instagram posts will be saved here. Start an automation now!
        </Typography>
    </Box>
);

const NoContactsInFilter = ({ dateRange }) => (
    <Box sx={{ py: 6, px: 3, display: "flex", flexDirection: "column", alignItems: "center", gap: 2.5, border: "1px solid", borderColor: "warning.main", borderRadius: 3, bgcolor: "warning.lighter", textAlign: "center", mt: 3 }}>
        <Box sx={{ width: 64, height: 64, borderRadius: "50%", display: "grid", placeItems: "center", bgcolor: "warning.main", color: 'white' }}>
            <SearchOffIcon fontSize="large" />
        </Box>
        <Typography variant="h6" fontWeight={700}>No Contacts Saved in the Selected Range</Typography>
        <Typography variant="body1" color="text.secondary" maxWidth={400}>
            No unique contacts interacted with your business during the period: **{dateRange}**. Try adjusting the date filter.
        </Typography>
    </Box>
);

// --- Constants ---
const PAGE_SIZE = 10;
const BASE_URL = "/api/usersOn";

// Helper function to format boolean to YES/NO
const formatBoolean = (value) => (value ? 'YES' : 'NO');

// Helper function to format date
const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date)) return 'Invalid Date';
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

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

// Helper component for status chip
const StatusChip = ({ label, value }) => {
    const isYes = value === 'YES';
    return (
        <Chip
            size="small"
            label={label}
            icon={isYes ? <CheckIcon fontSize="small" /> : <CloseIcon fontSize="small" />}
            color={isYes ? 'success' : 'error'}
            variant="outlined"
            sx={{ fontSize: 11, height: 22 }}
        />
    );
};

// --- Mobile Card Renderer ---
const UserCard = ({ user }) => (
  <Card variant="outlined" sx={{ mb: 1.5, borderRadius: 2 }}>
    <CardActionArea 
        onClick={() => window.open(`https://www.instagram.com/${user.username}`, '_blank')}
        sx={{ p: 2 }}
    >
        <Stack direction="row" spacing={2} alignItems="center">
            <Avatar src={user.profilePic} alt={user.username} sx={{ width: 48, height: 48 }} />
            
            <Box flexGrow={1} minWidth={0}>
                <Typography variant="subtitle1" fontWeight="bold">
                    @{user.username} 
                </Typography>
                <Typography variant="body2" color="text.primary" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 'medium' }}>
                    "{user.text || 'N/A'}"
                </Typography>
                <Typography variant="caption" color="text.secondary">
                    Last: {formatDate(user.lastInteracted)} | Interactions: {user.interactionCount}
                </Typography>
            </Box>

            <Stack spacing={0.5} alignItems="flex-end">
                <StatusChip label={`Following: ${user.followsBusiness}`} value={user.followsBusiness} />
                <Chip label={`Saved: ${formatDate(user.lastInteracted)}`} size="small" variant="outlined" sx={{ fontSize: 11, height: 22 }} />
            </Stack>
        </Stack>
    </CardActionArea>
  </Card>
);

// --- Main Component ---
export default function RepliedContacts() { 
    const theme = useTheme();
    const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
    
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [totalCount, setTotalCount] = useState(0); // Count in selected date range
    const [totalAllTimeCount, setTotalAllTimeCount] = useState(0); // NEW: All time total
    
    // --- Pagination State ---
    const [page, setPage] = useState(1);
    const [mobileUsers, setMobileUsers] = useState([]);
    
    // --- Filter State ---
    const [dateRange, setDateRange] = useState('Last 28 days'); 
    const [customStart, setCustomStart] = useState(null);
    const [customEnd, setCustomEnd] = useState(null);
    const [isCustomDialogOpen, setIsCustomDialogOpen] = useState(false);
    
    const calculateDates = useMemo(() => {
        const today = dayjs().endOf('day');
        let start = null;
        let end = today;

        switch (dateRange) {
            case 'Last 7 days': start = today.subtract(7, 'day').startOf('day'); break;
            case 'Last 28 days': start = today.subtract(28, 'day').startOf('day'); break;
            case 'Last 90 days': start = today.subtract(90, 'day').startOf('day'); break;
            case 'Custom Range':
                start = customStart ? dayjs(customStart).startOf('day') : null;
                end = customEnd ? dayjs(customEnd).endOf('day') : today;
                break;
            default: start = null; break; // All Time
        }

        if (start && end.isBefore(start)) end = start;

        return {
            startDate: start ? start.toISOString() : null,
            endDate: end.toISOString(),
        };
    }, [dateRange, customStart, customEnd]);

    const fetchUsers = useCallback(async (currentPage, isLoadMore = false) => {
        setLoading(true);
        setError(null);

        const currentLimit = PAGE_SIZE;
        const currentPageForRequest = isLoadMore ? (currentPage) : currentPage;

        const payload = {
            startDate: calculateDates.startDate,
            endDate: calculateDates.endDate,
            page: currentPageForRequest,
            limit: currentLimit
        };

        try {
            const response = await axios.post(`${BASE_URL}/automation/replied-users`, payload, { withCredentials: true });
            const data = response.data;
            
            const formattedUsers = data.users.map(user => ({
                ...user,
                followsBusiness: formatBoolean(user.followsBusiness),
            }));
            
            // Update total counts
            setTotalCount(data.totalCount); // Filtered count
            setTotalAllTimeCount(data.totalAllTimeCount || 0); // NEW: All-time count

            if (isLoadMore) {
                setMobileUsers(prev => [...prev, ...formattedUsers]);
            } else {
                if (!isDesktop) {
                    setMobileUsers(formattedUsers);
                }
                setUsers(formattedUsers);
            }

        } catch (err) {
            console.error("API Fetch Error:", err);
            setError(err.response?.data?.message || "Failed to load user data.");
        } finally {
            setLoading(false);
        }
    }, [calculateDates, isDesktop]); 

    // --- Effects & Handlers ---

    useEffect(() => {
        setPage(1);
        setMobileUsers([]);
        fetchUsers(1);
    }, [dateRange, customStart, customEnd, fetchUsers]); 

    const handlePageChange = (event, value) => {
        setPage(value);
        fetchUsers(value);
    };

    const handleLoadMore = () => {
        const nextPage = Math.ceil(mobileUsers.length / PAGE_SIZE) + 1;
        fetchUsers(nextPage, true);
    };
    
    const handleApplyCustomFilter = () => {
        if (customStart && customEnd && dayjs(customEnd).isBefore(dayjs(customStart))) {
            setError("End date must be after start date.");
            return;
        }
        setIsCustomDialogOpen(false);
        setDateRange('Custom Range');
        setError(null);
    };

    const maxPages = Math.ceil(totalCount / PAGE_SIZE);
    
    if (error) return <Alert severity="error" sx={{ m: 3 }}>{error}</Alert>;

    const displayUsers = isDesktop ? users : mobileUsers;
    const isMobileFullyLoaded = mobileUsers.length >= totalCount;

    const tableRows = displayUsers.map((user) => (
      <TableRow key={user.username} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
        <TableCell component="th" scope="row">
          <Stack direction="row" spacing={2} alignItems="center">
            <Avatar src={user.profilePic} alt={user.username} />
            <Link href={`https://www.instagram.com/${user.username}`} target="_blank" rel="noopener noreferrer" variant="body1" fontWeight="medium">
              @{user.username}
            </Link>
          </Stack>
        </TableCell>
        <TableCell>{user.interactionCount}</TableCell>
        
        <TableCell sx={{ maxWidth: 250, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <Tooltip title={user.text}>
              <Typography variant="body2">{user.text}</Typography>
          </Tooltip>
        </TableCell>

        <TableCell>
          <Typography variant="body2" color="text.secondary">{formatDate(user.lastInteracted)}</Typography>
        </TableCell>

        <TableCell>
          <StatusChip label="Following" value={user.followsBusiness} />
        </TableCell>
        
        <TableCell>
            <Typography variant="body2" color="text.secondary">
                {formatDate(user.lastInteracted)}
            </Typography>
        </TableCell>
      </TableRow>
    ));
    
    return (
      <Box sx={{ p: 3 }}>
        {/* --- HEADER: Total Count & Date Filter --- */}
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center">
                <Typography sx={{ fontFamily : 'Inter', fontSize : isDesktop ? '22px' : '18px', fontWeight : 600}}>
                    All Contacts ({formatNumber(totalAllTimeCount)})
                </Typography>
                           </Stack>

            <Select
                value={dateRange}
                onChange={(e) => {
                    const value = e.target.value;
                    setDateRange(value);
                    if (value === 'Custom Range') {
                        setIsCustomDialogOpen(true);
                    } else {
                        setCustomStart(null);
                        setCustomEnd(null);
                    }
                }}
                size="small"
                sx={{ minWidth: isDesktop ? 150 : 90 }}
                disabled={loading}
            >
                <MenuItem value="Last 7 days">Last 7 days</MenuItem>
                <MenuItem value="Last 28 days">Last 28 days</MenuItem>
                <MenuItem value="Last 90 days">Last 90 days</MenuItem>
                <MenuItem value="All Time">All Time</MenuItem>
                <MenuItem value="Custom Range">Custom Range...</MenuItem>
            </Select>
        </Stack>
        <hr />

        {/* 🚀 NEW: Filtered Range Count (Above the table/cards) */}
       {users.length > 0 && (
    <Typography color="text.secondary" sx={{ mt: 1.5, mb: 1, fontWeight: 400, fontFamily : 'Inter', fontSize : '14px' }}>
        Total <Box component="span" sx={{ fontWeight: 700, fontFamily : 'Inter', fontSize : '16px', color: '#000000' }}>{formatNumber(totalCount)}</Box> contacts created in the selected range.
    </Typography>
)}
        
        {/* --- Main Content --- */}
       {loading && displayUsers.length === 0 ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}><CircularProgress size={30} /></Box>
        ) : totalAllTimeCount === 0 ? (
            // 1. Case: NO CONTACTS EVER (Show educational empty state)
            <Box sx={{ mt: 3 }}>
                <NoContactsYet />
            </Box>
        ) : totalCount === 0 ? (
            // 2. Case: CONTACTS EXIST, BUT NONE IN FILTERED RANGE (Show filter empty state)
            <Box sx={{ mt: 3 }}>
                <NoContactsInFilter dateRange={dateRange} />
            </Box>
        ) : isDesktop ? (
          <>
            <TableContainer component={Paper} sx={{ mt: 2, boxShadow: 3, borderRadius: 2 }}>
              <Table aria-label="user interaction table">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 'bold' }}>Username</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Interactions</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Last Message Sent</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Last Interacted</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Follows Business</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Contact Saved</TableCell> 
                  </TableRow>
                </TableHead>
                <TableBody>{tableRows}</TableBody>
              </Table>
            </TableContainer>
            
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                <Pagination count={maxPages} page={page} onChange={handlePageChange} color="primary" />
            </Box>
          </>
        ) : (
          <>
            <Stack spacing={1.5} sx={{ mt: 2 }}>
              {displayUsers.map(user => <UserCard key={user.username} user={user} />)}
            </Stack>
            {/* Show Load More if not all data is fetched for mobile */}
            {!isMobileFullyLoaded && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                    <Button variant="outlined" onClick={handleLoadMore} disabled={loading}>
                        {loading ? <CircularProgress size={20} /> : `Load More (${displayUsers.length} of ${totalCount})`}
                    </Button>
                </Box>
            )}
            {loading && displayUsers.length > 0 && <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={20} /></Box>}
          </>
        )}
        
        {/* --- Custom Range Dialog --- */}
        <LocalizationProvider dateAdapter={AdapterDayjs}>
            <Dialog open={isCustomDialogOpen} onClose={() => setIsCustomDialogOpen(false)}>
                <DialogTitle>Select Custom Date Range</DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid item xs={12}>
                            <DatePicker
                                label="Start Date"
                                value={customStart}
                                onChange={(newValue) => setCustomStart(newValue)}
                                slotProps={{ textField: { fullWidth: true } }}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <DatePicker
                                label="End Date"
                                value={customEnd}
                                onChange={(newValue) => setCustomEnd(newValue)}
                                slotProps={{ textField: { fullWidth: true } }}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setIsCustomDialogOpen(false)} color="inherit">Cancel</Button>
                    <Button onClick={handleApplyCustomFilter} variant="contained" disabled={!customStart || !customEnd}>Apply Filter</Button>
                </DialogActions>
            </Dialog>
        </LocalizationProvider>
      </Box>
    );
}
// components/CreatorBookings.jsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  Avatar,
  Stack,
  Tab,
  Tabs,
  IconButton,
  Tooltip,
  Button,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  useTheme,
  useMediaQuery,
  Grid,
  Divider,
  alpha,
  Paper,
  Badge,
  Menu,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  CalendarMonth,
  VideoCall,
  Phone,
  Person,
  AccessTime,
  AttachMoney,
  CheckCircle,
  Cancel,
  Event,
  MoreVert,
  FilterList,
  Refresh,
  ArrowBack,
  ChevronRight,
  CheckCircleOutline,
  CancelOutlined,
  Campaign as CampaignIcon,
  Payments as PaymentsIcon,
} from '@mui/icons-material';
import { format, parseISO, isPast, isFuture, isToday, addHours, addMinutes } from 'date-fns';
import axios from 'axios';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';

// Import the TransactionsPage component
import TransactionsPage from './TransactionsPage'; // Adjust path as needed

const CreatorBookings = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const baseUrl = "/api/usersOn";
  const IST_TIMEZONE = 'Asia/Kolkata';

  // State
  const [mainTab, setMainTab] = useState('campaigns'); // 'campaigns' or 'payments'
  const [step, setStep] = useState('campaigns'); // 'campaigns' or 'bookings'
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState('all');
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    action: '',
    title: '',
    message: '',
  });

  // Add new state for menu dialog
  const [menuDialogOpen, setMenuDialogOpen] = useState(false);

  const IST_OFFSET_HOURS = 5;
  const IST_OFFSET_MINUTES = 30;

  // Helper function to convert UTC date to IST
  const convertToIST = (dateString) => {
    const utcDate = parseISO(dateString);
    let istDate = addHours(utcDate, IST_OFFSET_HOURS);
    istDate = addMinutes(istDate, IST_OFFSET_MINUTES);
    return istDate;
  };

  // Helper function to get current time in IST
  const getNowIST = () => {
    const now = new Date();
    let istNow = addHours(now, IST_OFFSET_HOURS);
    istNow = addMinutes(istNow, IST_OFFSET_MINUTES);
    return istNow;
  };

  // Helper function to check if date is today in IST
  const isTodayIST = (dateString) => {
    const istDate = convertToIST(dateString);
    const nowIST = getNowIST();
    return format(istDate, 'yyyy-MM-dd') === format(nowIST, 'yyyy-MM-dd');
  };

  // Helper function to check if date is future in IST (after today)
  const isFutureIST = (dateString) => {
    const istDate = convertToIST(dateString);
    const nowIST = getNowIST();
    const istDateOnly = format(istDate, 'yyyy-MM-dd');
    const nowISTOnly = format(nowIST, 'yyyy-MM-dd');
    return istDateOnly > nowISTOnly;
  };

  // Helper function to check if date is past in IST (before today)
  const isPastIST = (dateString) => {
    const istDate = convertToIST(dateString);
    const nowIST = getNowIST();
    const istDateOnly = format(istDate, 'yyyy-MM-dd');
    const nowISTOnly = format(nowIST, 'yyyy-MM-dd');
    return istDateOnly < nowISTOnly;
  };

  // Update handlers
  const handleMenuOpen = (event, booking) => {
    event.stopPropagation();
    setSelectedBooking(booking);
    setMenuDialogOpen(true);
  };

  const handleMenuDialogClose = () => {
    setMenuDialogOpen(false);
    setSelectedBooking(null);
  };

  const handleMenuAction = (action) => {
    setMenuDialogOpen(false);
    
    const dialogConfig = {
      completed: {
        title: 'Mark as Completed',
        message: 'Are you sure you want to mark this booking as completed? This action will update the session status.',
      },
      cancelled: {
        title: 'Cancel Booking',
        message: 'Are you sure you want to cancel this booking? This action cannot be undone.',
      },
    };

    setConfirmDialog({
      open: true,
      action,
      ...dialogConfig[action],
    });
  };

  const handleConfirmAction = async () => {
    try {
      const response = await axios.post(
        `${baseUrl}/bookings/update-status`,
        {
          booking_id: selectedBooking._id,
          action: confirmDialog.action,
        },
        { withCredentials: true }
      );

      if (response.data.success) {
        setBookings((prevBookings) =>
          prevBookings.map((booking) =>
            booking._id === selectedBooking._id
              ? { ...booking, ...response.data.data }
              : booking
          )
        );

        setConfirmDialog({ open: false, action: '', title: '', message: '' });
        setSelectedBooking(null);
      }
    } catch (error) {
      console.error('Error updating booking status:', error);
      alert('Failed to update booking status');
    }
  };

  const handleCancelDialog = () => {
    setConfirmDialog({ open: false, action: '', title: '', message: '' });
    setSelectedBooking(null);
  };

  // Updated session status config
  const getSessionStatusConfig = (sessionStatus) => {
    const configs = {
      active: { color: 'success', label: 'Active', bgColor: alpha(theme.palette.success.main, 0.08) },
      completed: { color: 'default', label: 'Completed', bgColor: alpha(theme.palette.grey[500], 0.08) },
      expired: { color: 'error', label: 'Expired', bgColor: alpha(theme.palette.error.main, 0.08) },
      cancelled: { color: 'error', label: 'Cancelled', bgColor: alpha(theme.palette.error.main, 0.08) },
    };
    return configs[sessionStatus] || configs.active;
  };

  // Helper to get card background color
  const getCardBackgroundColor = (booking) => {
    if (booking.session_status === 'completed') {
      return '#EEEEEE';
    }
    
    if (booking.session_status === 'cancelled') {
      return '#FFD8D8';
    }
    
    if (booking.session_status === 'active') {
      if (isTodayIST(booking.selected_date) || isFutureIST(booking.selected_date)) {
        return '#DDF4E7';
      }
    }
    
    return 'transparent';
  };

  const getTabCounts = () => {
    return {
      all: bookings.length,
      today: bookings.filter(b => 
        isTodayIST(b.selected_date) && b.session_status === 'active'
      ).length,
      upcoming: bookings.filter(b => 
        isFutureIST(b.selected_date) && b.session_status === 'active'
      ).length,
      completed: bookings.filter(b => 
        b.session_status === 'completed'
      ).length,
      cancelled: bookings.filter(b => 
        b.session_status === 'cancelled'
      ).length,
    };
  };

  const tabCounts = getTabCounts();

  // Fetch campaigns (Step 1)
  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const response = await axios.get(baseUrl + '/bookings/campaigns', {
        withCredentials: true
      });

      if (response.data.success) {
        setCampaigns(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching campaigns:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch bookings for selected campaign (Step 2)
  const fetchBookings = async (campaignId) => {
    setLoading(true);
    try {
      const response = await axios.post(
        baseUrl + '/bookings/creator',
        {
          block_id: campaignId,
        },
        {
          withCredentials: true
        }
      );

      if (response.data.success) {
        setBookings(response.data.data.bookings);
      }
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  // Initial load - fetch campaigns
  useEffect(() => {
    if (mainTab === 'campaigns') {
      fetchCampaigns();
    }
  }, [mainTab]);

  // When campaign is selected
  useEffect(() => {
    if (selectedCampaign) {
      fetchBookings(selectedCampaign._id);
    }
  }, [selectedCampaign]);

  // Handle campaign selection
  const selectCampaign = (campaign) => {
    setSelectedCampaign(campaign);
    setStep('bookings');
  };

  // Go back to campaigns list
  const backToCampaigns = () => {
    setStep('campaigns');
    setSelectedCampaign(null);
    setBookings([]);
  };

  // Filter bookings by tab
  const getFilteredBookings = () => {
    switch (selectedTab) {
      case 'upcoming':
        return bookings.filter(b =>
          isFutureIST(b.selected_date) && b.session_status === 'active'
        );
      case 'today':
        return bookings.filter(b =>
          isTodayIST(b.selected_date) && b.session_status === 'active'
        );
      case 'completed':
        return bookings.filter(b => b.session_status === 'completed');
      case 'cancelled':
        return bookings.filter(b => b.session_status === 'cancelled');
      default:
        return bookings;
    }
  };

  const filteredBookings = getFilteredBookings();

  // Campaign Card Component
  const CampaignCard = ({ campaign }) => {
    return (
      <Card
        elevation={0}
        onClick={() => selectCampaign(campaign)}
        sx={{
          borderRadius: 3,
          border: `2px solid ${theme.palette.divider}`,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          '&:hover': {
            borderColor: theme.palette.primary.main,
            boxShadow: `0 8px 24px ${alpha(theme.palette.primary.main, 0.12)}`,
            transform: 'translateY(-4px)',
          },
        }}
      >
        <CardContent sx={{ px: 2, py: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: 2.5,
                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <Event sx={{ fontSize: 28, color: theme.palette.primary.main }} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="h6"
                    sx={{
                      fontFamily: 'Inter',
                      fontSize: 18,
                      fontWeight: 700,
                      color: theme.palette.text.primary,
                      mb: 0.5,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {campaign.name}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      fontFamily: 'Inter',
                      fontSize: 13,
                      color: theme.palette.text.secondary,
                    }}
                  >
                    {campaign.duration} mins • {campaign.interactionType === 'video' ? 'Video' : 'Voice'} Call
                    {campaign.pricing > 0 && ` • ₹${campaign.pricing}`}
                  </Typography>
                </Box>
              </Box>

              {campaign.description && (
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: 'Inter',
                    fontSize: 14,
                    color: theme.palette.text.secondary,
                    mb: 2,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {campaign.description}
                </Typography>
              )}

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Chip
                  label={`${campaign.bookingCount || 0} Bookings`}
                  size="small"
                  sx={{
                    fontFamily: 'Inter',
                    fontWeight: 600,
                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                    color: theme.palette.primary.main,
                  }}
                />
                {campaign.pricing > 0 && (
                  <Chip
                    label="Paid"
                    size="small"
                    color="success"
                    sx={{ fontFamily: 'Inter', fontWeight: 600 }}
                  />
                )}
              </Box>
            </Box>

            <IconButton
              sx={{
                bgcolor: alpha(theme.palette.primary.main, 0.1),
                '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.2) },
              }}
            >
              <ChevronRight sx={{ color: theme.palette.primary.main }} />
            </IconButton>
          </Box>
        </CardContent>
      </Card>
    );
  };

  // Booking Card Component
  const BookingCard = ({ booking }) => {
    const sessionConfig = getSessionStatusConfig(booking.session_status);
    const bookingDateIST = convertToIST(booking.selected_date);
    const cardBgColor = getCardBackgroundColor(booking);

    return (
      <Card
        elevation={0}
        sx={{
          borderRadius: 3,
          border: `1px solid ${theme.palette.divider}`,
          backgroundColor: cardBgColor,
          transition: 'all 0.2s ease',
          '&:hover': {
            borderColor: theme.palette.primary.main,
            boxShadow: `0 8px 24px ${alpha(theme.palette.primary.main, 0.12)}`,
            transform: 'translateY(-2px)',
          },
        }}
      >
        <CardContent sx={{ p: 2.5}}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
            <Chip
              label={sessionConfig.label}
              color={sessionConfig.color}
              size="small"
              sx={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 600 }}
            />
            <IconButton 
              size="small" 
              onClick={(e) => handleMenuOpen(e, booking)}
            >
              <MoreVert fontSize="small" />
            </IconButton>
          </Box>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 3, md: 6, lg: 6}}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 2,
                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <CalendarMonth sx={{ fontSize: 20, color: theme.palette.primary.main }} />
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontFamily: 'Inter' }}>
                    Date & Time
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'Inter' }}>
                    {format(bookingDateIST, 'MMM dd, yyyy')}
                  </Typography>
                  <Typography sx={{ fontFamily: 'Inter', fontSize: '12px', fontWeight: 500, mt: 0.5 }}>
                    {booking.selected_timeSlot}
                  </Typography>
                </Box>
              </Stack>
            </Grid>

            <Grid size={{ xs: 12, sm: 3, md: 6, lg: 6}}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Avatar
                  sx={{
                    width: 40,
                    height: 40,
                    bgcolor: alpha(theme.palette.secondary.main, 0.1),
                    color: theme.palette.secondary.main,
                  }}
                >
                  <Person fontSize="small" />
                </Avatar>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontFamily: 'Inter' }}>
                    Customer
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      fontFamily: 'Inter',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {booking.customer_name}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: theme.palette.text.secondary,
                      fontFamily: 'Inter',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'block',
                    }}
                  >
                    {booking.customer_email}
                  </Typography>
                </Box>
              </Stack>
            </Grid>

            <Grid size={{ xs: 6, sm: 2, md: 4, lg: 4}}>
              <Stack direction="column" spacing={1} alignItems="flex-start">
                <Stack direction="row" spacing={1}>
                  <AccessTime sx={{ fontSize: 18, color: theme.palette.text.secondary }} />
                  <Stack direction="column" spacing={1}>
                    <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontFamily: 'Inter', display: 'block' }}>
                      Duration
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'Inter' }}>
                      {booking.duration || booking.block_id?.duration || 30} mins
                    </Typography>
                  </Stack>
                </Stack>
              </Stack>
            </Grid>

            <Grid size={{ xs: 6, sm: 2, md: 4, lg: 4}}>
              <Stack direction="column" spacing={1} alignItems="flex-start">
                <Stack direction="row" spacing={1}>
                  {booking.interaction_type === 'video' ? (
                    <VideoCall sx={{ fontSize: 18, color: theme.palette.text.secondary }} />
                  ) : (
                    <Phone sx={{ fontSize: 18, color: theme.palette.text.secondary }} />
                  )}
                  <Stack direction="column" spacing={1} >
                    <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontFamily: 'Inter', display: 'block' }}>
                      Session Type
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'Inter' }}>
                      {booking.interaction_type === 'video' ? 'Video' : 'Voice'}
                    </Typography>
                  </Stack>
                </Stack>
              </Stack>
            </Grid>

            <Grid size={{ xs: 6, sm: 2, md: 4, lg: 4}}>
              <Stack direction="column" spacing={1} alignItems="flex-start">
                <Stack direction="row" spacing={1}>
                  <Phone sx={{ fontSize: 18, color: theme.palette.text.secondary }} />
                  <Stack direction="column" spacing={1} >
                    <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontFamily: 'Inter', display: 'block' }}>
                      Mobile
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'Inter' }}>
                      {booking.customer_mobile}
                    </Typography>
                  </Stack>
                </Stack>
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    );
  };

  // Main Tab Change Handler
  const handleMainTabChange = (event, newValue) => {
    setMainTab(newValue);
    if (newValue === 'campaigns') {
      setStep('campaigns');
      setSelectedCampaign(null);
      setBookings([]);
    }
  };

  // RENDER: Main Container with Top-Level Tabs
  return (
    <Box sx={{ mx: 'auto', px: { xs: 1, sm: 3 }, pt: { xs: 2, sm: 3 } }}>
      {/* Top Level Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs 
          value={mainTab} 
          onChange={handleMainTabChange}
          sx={{
            '& .MuiTab-root': {
              fontFamily: 'Inter',
              fontWeight: 600,
              textTransform: 'none',
              fontSize: 16,
              minHeight: 56,
            }
          }}
        >
          <Tab 
            icon={<GroupsOutlinedIcon />} 
            iconPosition="start" 
            label="Campaigns" 
            value="campaigns"
          />
          {/* <Tab 
            icon={<PaymentsIcon />} 
            iconPosition="start" 
            label="Payments" 
            value="payments"
          /> */}
        </Tabs>
      </Box>

      {/* Campaigns Tab Content */}
      {mainTab === 'campaigns' && (
        <>
          {step === 'campaigns' ? (
            // RENDER: Campaigns List (Step 1)
            <>
              <Box sx={{ mb: 4 }}>
               
                <Typography variant="body2" sx={{ color: theme.palette.text.secondary, fontFamily: 'Inter' }}>
                  Select a campaign to view bookings and analytics
                </Typography>
              </Box>

              {loading ? (
                <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 400 }}>
                  <CircularProgress />
                </Box>
              ) : campaigns.length === 0 ? (
                <Alert severity="info" sx={{ borderRadius: 2 }}>
                  No booking campaigns found. Create your first booking block to get started!
                </Alert>
              ) : (
                <Grid container spacing={2}>
                  {campaigns.map((campaign) => (
                    <Grid size={{ xs: 12, sm: 6, md: 6}} key={campaign._id}>
                      <CampaignCard campaign={campaign} />
                    </Grid>
                  ))}
                </Grid>
              )}
            </>
          ) : (
            // RENDER: Bookings View (Step 2)
            <>
              <Box sx={{ mb: 4 }}>
                <Button
                  startIcon={<ArrowBack />}
                  onClick={backToCampaigns}
                  sx={{
                    textTransform: 'none',
                    fontFamily: 'Inter',
                    fontWeight: 600,
                    mb: 2,
                    color: theme.palette.text.secondary,
                  }}
                >
                  Back to Campaigns
                </Button>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                  <Typography
                    variant="h4"
                    sx={{
                      fontFamily: 'Inter',
                      fontWeight: 700,
                      fontSize: { xs: 20, sm: 24 },
                      mb: 1,
                    }}
                  >
                    {selectedCampaign?.name}
                  </Typography>
                  
                  <Chip
                    label={selectedCampaign?.pricing > 0 ? `₹${selectedCampaign.pricing}` : 'FREE'}
                    size="medium"
                    sx={{
                      fontFamily: 'Inter',
                      fontWeight: 700,
                      fontSize: { xs: 13, sm: 14 },
                      height: { xs: 28, sm: 32 },
                      bgcolor: selectedCampaign?.pricing > 0 
                        ? alpha(theme.palette.success.main, 0.15) 
                        : alpha(theme.palette.info.main, 0.15),
                      color: selectedCampaign?.pricing > 0 
                        ? theme.palette.success.main 
                        : theme.palette.info.main,
                      border: `1.5px solid ${selectedCampaign?.pricing > 0 
                        ? alpha(theme.palette.success.main, 0.3) 
                        : alpha(theme.palette.info.main, 0.3)}`,
                    }}
                  />
                </Box>

                <Typography 
                  variant="body2" 
                  sx={{ 
                    color: theme.palette.text.secondary, 
                    fontFamily: 'Inter',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {selectedCampaign?.description || 'Manage and track bookings for this campaign'}
                </Typography>
              </Box>

              {/* Bookings Tabs */}
              <Box sx={{ width: '100%', mb: 3 }}>
                <Tabs
                  value={selectedTab}
                  onChange={(e, val) => setSelectedTab(val)}
                  variant="scrollable"
                  scrollButtons="auto"
                  allowScrollButtonsMobile
                  sx={{
                    '& .MuiTab-root': {
                      fontFamily: 'Inter',
                      fontWeight: 600,
                      textTransform: 'none',
                      fontSize: 14,
                      minWidth: { xs: 'auto', sm: 90 },
                      px: { xs: 2, sm: 3 },
                    },
                    '& .MuiTabs-scrollButtons': {
                      color: theme.palette.primary.main,
                      '&.Mui-disabled': {
                        opacity: 0.3,
                      },
                    },
                    '& .MuiTabs-indicator': {
                      height: 3,
                      borderRadius: '3px 3px 0 0',
                    },
                    '& .MuiTabs-scroller': {
                      '&::-webkit-scrollbar': {
                        display: 'none',
                      },
                      scrollbarWidth: 'none',
                      msOverflowStyle: 'none',
                    },
                  }}
                >
                  <Tab 
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <span>All</span>
                        <Badge
                          badgeContent={tabCounts.all}
                          sx={{
                            '& .MuiBadge-badge': {
                              bgcolor: alpha(theme.palette.primary.main, 0.15),
                              color: theme.palette.primary.main,
                              fontWeight: 700,
                              fontSize: 11,
                              height: 20,
                              minWidth: 20,
                              borderRadius: '10px',
                            }
                          }}
                        />
                      </Box>
                    } 
                    value="all" 
                  />
                  
                  <Tab 
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <span>Today</span>
                        <Badge
                          badgeContent={tabCounts.today}
                          sx={{
                            '& .MuiBadge-badge': {
                              bgcolor: alpha(theme.palette.success.main, 0.15),
                              color: theme.palette.success.main,
                              fontWeight: 700,
                              fontSize: 11,
                              height: 20,
                              minWidth: 20,
                              borderRadius: '10px',
                            }
                          }}
                        />
                      </Box>
                    } 
                    value="today" 
                  />
                  
                  <Tab 
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <span>Upcoming</span>
                        <Badge
                          badgeContent={tabCounts.upcoming}
                          sx={{
                            '& .MuiBadge-badge': {
                              bgcolor: alpha(theme.palette.info.main, 0.15),
                              color: theme.palette.info.main,
                              fontWeight: 700,
                              fontSize: 11,
                              height: 20,
                              minWidth: 20,
                              borderRadius: '10px',
                            }
                          }}
                        />
                      </Box>
                    } 
                    value="upcoming" 
                  />
                  
                  <Tab 
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <span>Completed</span>
                        <Badge
                          badgeContent={tabCounts.completed}
                          sx={{
                            '& .MuiBadge-badge': {
                              bgcolor: alpha(theme.palette.grey[600], 0.15),
                              color: theme.palette.grey[700],
                              fontWeight: 700,
                              fontSize: 11,
                              height: 20,
                              minWidth: 20,
                              borderRadius: '10px',
                            }
                          }}
                        />
                      </Box>
                    } 
                    value="completed" 
                  />

                  <Tab 
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <span>Cancelled</span>
                        <Badge
                          badgeContent={tabCounts.cancelled}
                          sx={{
                            '& .MuiBadge-badge': {
                              bgcolor: alpha(theme.palette.error.main, 0.15),
                              color: theme.palette.error.main,
                              fontWeight: 700,
                              fontSize: 11,
                              height: 20,
                              minWidth: 20,
                              borderRadius: '10px',
                            }
                          }}
                        />
                      </Box>
                    } 
                    value="cancelled" 
                  />
                </Tabs>
              </Box>

              {/* Bookings List */}
              {loading ? (
                <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 400 }}>
                  <CircularProgress />
                </Box>
              ) : filteredBookings.length === 0 ? (
                <Alert severity="info" sx={{ borderRadius: 2 }}>
                  No bookings found.
                </Alert>
              ) : (
                <Grid container spacing={2}>
                  {filteredBookings.map((booking) => (
                    <Grid 
                      size={{ 
                        xs: 12,
                        sm: 6,
                        md: 6,
                        lg: 6,
                        xl: 3
                      }} 
                      key={booking._id}
                    >
                      <BookingCard booking={booking} />
                    </Grid>
                  ))}
                </Grid>
              )}
            </>
          )}
        </>
      )}

      {/* Payments Tab Content */}
      {mainTab === 'payments' && (
        <TransactionsPage />
      )}

      {/* Action Selection Dialog */}
      <Dialog
        open={menuDialogOpen}
        onClose={handleMenuDialogClose}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
          }
        }}
      >
        <DialogTitle sx={{ fontFamily: 'Inter', fontWeight: 600, pb: 1 }}>
          Select Action
        </DialogTitle>
        <DialogContent sx={{ pb: 1 }}>
          <Stack spacing={1}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<CheckCircleOutline />}
              onClick={() => handleMenuAction('completed')}
              sx={{
                justifyContent: 'flex-start',
                textTransform: 'none',
                fontFamily: 'Inter',
                fontWeight: 500,
                py: 1.5,
                px: 2,
                borderColor: alpha(theme.palette.success.main, 0.3),
                color: theme.palette.success.main,
                '&:hover': {
                  borderColor: theme.palette.success.main,
                  bgcolor: alpha(theme.palette.success.main, 0.1),
                }
              }}
            >
              Mark as Completed
            </Button>
            
            <Button
              fullWidth
              variant="outlined"
              startIcon={<CancelOutlined />}
              onClick={() => handleMenuAction('cancelled')}
              sx={{
                justifyContent: 'flex-start',
                textTransform: 'none',
                fontFamily: 'Inter',
                fontWeight: 500,
                py: 1.5,
                px: 2,
                borderColor: alpha(theme.palette.error.main, 0.3),
                color: theme.palette.error.main,
                '&:hover': {
                  borderColor: theme.palette.error.main,
                  bgcolor: alpha(theme.palette.error.main, 0.1),
                }
              }}
            >
              Mark as Cancelled
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={handleMenuDialogClose}
            sx={{ 
              textTransform: 'none', 
              fontFamily: 'Inter', 
              fontWeight: 600,
              color: theme.palette.text.secondary,
            }}
          >
            Cancel
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirmation Dialog */}
      <Dialog
        open={confirmDialog.open}
        onClose={handleCancelDialog}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontFamily: 'Inter', fontWeight: 600 }}>
          {confirmDialog.title}
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontFamily: 'Inter', color: theme.palette.text.secondary }}>
            {confirmDialog.message}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={handleCancelDialog}
            sx={{ textTransform: 'none', fontFamily: 'Inter', fontWeight: 600 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmAction}
            variant="contained"
            color={confirmDialog.action === 'cancelled' ? 'error' : 'primary'}
            sx={{ textTransform: 'none', fontFamily: 'Inter', fontWeight: 600 }}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CreatorBookings;

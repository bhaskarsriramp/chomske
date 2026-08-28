import { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Stack,
  Alert,
  IconButton,
  Divider,
  useTheme,
  useMediaQuery,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Skeleton,
  Pagination,
  Menu,
  MenuItem,
} from '@mui/material';
import {
  AccountBalanceWallet as WalletIcon,
  Receipt as ReceiptIcon,
  CheckCircle as CheckCircleIcon,
  Close as CloseIcon,
  Person as PersonIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  CurrencyRupee as RupeeIcon,
  CreditCard as CreditCardIcon,
  AccountBalance as BankIcon,
  AccountBalanceWallet as UpiIcon,
  KeyboardArrowDown as ArrowDownIcon,
  DateRange as DateRangeIcon,
} from '@mui/icons-material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import axios from 'axios';
import { format } from 'date-fns';

const TransactionsPage = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState({
    totalRevenue: 0,
    totalTransactions: 0,
    currency: 'INR',
    monthlyData: {},
    paymentMethods: []
  });
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalRecords: 0,
    limit: 10
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  
  // Date filter state
  const [dateFilter, setDateFilter] = useState('last28days');
  const [customStartDate, setCustomStartDate] = useState(null);
  const [customEndDate, setCustomEndDate] = useState(null);
  const [dateMenuAnchor, setDateMenuAnchor] = useState(null);
  const [customDateDialogOpen, setCustomDateDialogOpen] = useState(false);

  const baseUrl = "/api/usersOn";

  const dateFilterOptions = [
    { value: 'last7days', label: 'Last 7 days' },
    { value: 'last28days', label: 'Last 28 days' },
    { value: 'lifetime', label: 'Lifetime' },
    { value: 'custom', label: 'Custom Date Range' },
  ];


  const formatIndianCurrency = (amount, decimals = 2) => {
  if (!amount || amount === 0) return '0';
  
  const absAmount = Math.abs(amount);
  const isNegative = amount < 0;
  
  let formatted = '';
  
  // Crores (1,00,00,000 and above)
  if (absAmount >= 10000000) {
    formatted = (absAmount / 10000000).toFixed(decimals) + 'Cr';
  }
  // Lakhs (1,00,000 to 99,99,999)
  else if (absAmount >= 100000) {
    formatted = (absAmount / 100000).toFixed(decimals) + 'L';
  }
  // Thousands (1,000 to 99,999)
  else if (absAmount >= 1000) {
    formatted = (absAmount / 1000).toFixed(decimals) + 'K';
  }
  // Below 1000, show as is with commas
  else {
    formatted = absAmount.toLocaleString('en-IN');
  }
  
  return isNegative ? '-' + formatted : formatted;
};

  useEffect(() => {
    fetchTransactions(1);
  }, [dateFilter, customStartDate, customEndDate]);

  const fetchTransactions = async (page = 1) => {
    try {
      setLoading(true);
      
      const requestBody = {
        page,
        limit: 10,
        dateFilter,
        ...(dateFilter === 'custom' && customStartDate && customEndDate && {
          startDate: customStartDate.toISOString(),
          endDate: customEndDate.toISOString()
        })
      };

      const response = await axios.post(
        baseUrl + '/transactions/paid',
        requestBody,
        { withCredentials: true }
      );

      if (response.data.success) {
        setTransactions(response.data.data.transactions);
        setSummary(response.data.data.summary);
        setPagination(response.data.data.pagination);
      }
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setError(err.response?.data?.error || 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (transaction) => {
    setSelectedTransaction(transaction);
    setDetailsOpen(true);
  };

  const handleCloseDetails = () => {
    setDetailsOpen(false);
    setSelectedTransaction(null);
  };

  const handlePageChange = (event, value) => {
    fetchTransactions(value);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDateFilterClick = (event) => {
    setDateMenuAnchor(event.currentTarget);
  };

  const handleDateFilterClose = () => {
    setDateMenuAnchor(null);
  };

  const handleDateFilterSelect = (value) => {
    if (value === 'custom') {
      setCustomDateDialogOpen(true);
    } else {
      setDateFilter(value);
    }
    handleDateFilterClose();
  };

  const handleCustomDateApply = () => {
    if (customStartDate && customEndDate) {
      setDateFilter('custom');
      setCustomDateDialogOpen(false);
      fetchTransactions(1);
    }
  };

  const handleCustomDateCancel = () => {
    setCustomDateDialogOpen(false);
    setCustomStartDate(null);
    setCustomEndDate(null);
  };

  const getDateFilterLabel = () => {
    const option = dateFilterOptions.find(opt => opt.value === dateFilter);
    if (dateFilter === 'custom' && customStartDate && customEndDate) {
      return `${format(customStartDate, 'MMM dd')} - ${format(customEndDate, 'MMM dd, yyyy')}`;
    }
    return option?.label || 'Last 28 days';
  };

  const filteredTransactions = transactions.filter(txn => {
    const query = searchQuery.toLowerCase();
    return (
      txn.customer?.name?.toLowerCase().includes(query) ||
      txn.customer?.email?.toLowerCase().includes(query) ||
      txn.productTitle?.toLowerCase().includes(query) ||
      txn.orderId?.toLowerCase().includes(query) ||
      txn.customerBookingId?.toLowerCase().includes(query)
    );
  });

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0
    }).format(amount / 100);
  };

  const formatDate = (date) => {
    return format(new Date(date), 'MMM dd, yyyy • hh:mm a');
  };

  const getPaymentMethodIcon = (paymentMethod) => {
    if (!paymentMethod?.type) return <RupeeIcon />;
    
    switch (paymentMethod.type) {
      case 'card':
        return <CreditCardIcon />;
      case 'netbanking':
        return <BankIcon />;
      case 'upi':
        return <UpiIcon />;
      case 'wallet':
        return <WalletIcon />;
      default:
        return <RupeeIcon />;
    }
  };

  const getPaymentMethodLabel = (paymentMethod) => {
    if (!paymentMethod?.type) return 'Unknown';
    
    switch (paymentMethod.type) {
      case 'card':
        if (paymentMethod.card?.last4) {
          return `${paymentMethod.card.network || 'Card'} •••• ${paymentMethod.card.last4}`;
        }
        return 'Card';
      case 'netbanking':
        return paymentMethod.bank || 'Net Banking';
      case 'upi':
        return paymentMethod.vpa ? `UPI (${paymentMethod.vpa})` : 'UPI';
      case 'wallet':
        return paymentMethod.wallet || 'Wallet';
      default:
        return paymentMethod.type.toUpperCase();
    }
  };

  // Enhanced Loading Skeleton Component
  const LoadingSkeleton = () => (
    <Box sx={{ bgcolor: '#F8F9FA', minHeight: '100vh', py: { xs: 3, md: 5 } }}>
      <Container maxWidth="xl">
        {/* Header Skeleton */}
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Skeleton variant="text" width={280} height={48} sx={{ borderRadius: 1 }} />
            <Skeleton variant="rectangular" width={180} height={40} sx={{ borderRadius: 2 }} />
          </Box>
          <Skeleton variant="text" width={320} height={24} sx={{ borderRadius: 1 }} />
        </Box>

        {/* Summary Cards Skeleton */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {[1, 2, 3].map((item) => (
            <Grid size={{ xs: 12, sm: 6, md: 4}} key={item}>
              <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ flex: 1 }}>
                      <Skeleton variant="text" width={120} height={20} sx={{ mb: 1 }} />
                      <Skeleton variant="text" width={100} height={40} />
                    </Box>
                    <Skeleton variant="circular" width={56} height={56} />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Search Bar Skeleton */}
        <Card sx={{ mb: 3, borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
          <CardContent sx={{ p: { xs: 2, md: 3 } }}>
            <Grid container spacing={2} alignItems="center">
              <Grid size={{ xs: 12, sm: 6, md: 8}}>
                <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 2 }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 4}}>
                <Stack direction="row" spacing={1} justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
                  <Skeleton variant="rectangular" width={100} height={40} sx={{ borderRadius: 2 }} />
                  <Skeleton variant="rectangular" width={100} height={40} sx={{ borderRadius: 2 }} />
                </Stack>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Table Skeleton */}
        <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <TableCell key={i}>
                      <Skeleton variant="text" width={80} height={20} />
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => (
                  <TableRow key={item}>
                    <TableCell><Skeleton variant="text" width={100} height={20} /></TableCell>
                    <TableCell>
                      <Skeleton variant="text" width={140} height={20} sx={{ mb: 0.5 }} />
                      <Skeleton variant="text" width={180} height={16} />
                    </TableCell>
                    <TableCell><Skeleton variant="text" width={120} height={20} /></TableCell>
                    <TableCell><Skeleton variant="rectangular" width={120} height={28} sx={{ borderRadius: 2 }} /></TableCell>
                    <TableCell><Skeleton variant="text" width={80} height={24} /></TableCell>
                    <TableCell>
                      <Skeleton variant="text" width={100} height={18} sx={{ mb: 0.5 }} />
                      <Skeleton variant="text" width={80} height={16} />
                    </TableCell>
                    <TableCell><Skeleton variant="rectangular" width={60} height={28} sx={{ borderRadius: 2 }} /></TableCell>
                    <TableCell><Skeleton variant="rectangular" width={60} height={32} sx={{ borderRadius: 1 }} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      </Container>
    </Box>
  );

  // Show loading skeleton
  if (loading) {
    return <LoadingSkeleton />;
  }

  // Show error state
  if (error) {
    return (
      <Box sx={{ bgcolor: '#F8F9FA', minHeight: '100vh', py: { xs: 3, md: 5 } }}>
        <Container maxWidth="xl">
          <Alert
            severity="error"
            sx={{ borderRadius: 2 }}
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => fetchTransactions(1)}
                sx={{ textTransform: 'none', fontWeight: 600 }}
              >
                Retry
              </Button>
            }
          >
            {error}
          </Alert>
        </Container>
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: '#F8F9FA', minHeight: '100vh', py: { xs: 1, md: 1 } }}>
      <Container maxWidth="xl">
        {/* Header with Date Filter */}
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 1 }}>
            <Typography
              variant="h4"
              sx={{
                fontFamily: 'Inter',
                fontWeight: 600,
                color: '#1A1A1A',
                fontSize: { xs: '18px', md: '22px' }
              }}
            >
              Payments
            </Typography>
            
            {/* Date Range Filter */}
            <Button
              variant="outlined"
              endIcon={<ArrowDownIcon />}
              onClick={handleDateFilterClick}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                borderColor: '#E5E7EB',
                color: '#374151',
                fontWeight: 600,
                px: 2,
                py: 1,
                '&:hover': { borderColor: '#9CA3AF', bgcolor: '#F9FAFB' }
              }}
            >
              <DateRangeIcon sx={{ mr: 1, fontSize: 20 }} />
              {getDateFilterLabel()}
            </Button>

            {/* Date Filter Menu */}
            <Menu
              anchorEl={dateMenuAnchor}
              open={Boolean(dateMenuAnchor)}
              onClose={handleDateFilterClose}
              PaperProps={{
                sx: { borderRadius: 2, mt: 1, minWidth: 200 }
              }}
            >
              {dateFilterOptions.map((option) => (
                <MenuItem
                  key={option.value}
                  selected={dateFilter === option.value}
                  onClick={() => handleDateFilterSelect(option.value)}
                  sx={{
                    fontFamily: 'Inter',
                    fontSize: 14,
                    py: 1.5,
                    '&.Mui-selected': {
                      bgcolor: 'rgba(102, 126, 234, 0.08)',
                      '&:hover': {
                        bgcolor: 'rgba(102, 126, 234, 0.12)',
                      }
                    }
                  }}
                >
                  {option.label}
                </MenuItem>
              ))}
            </Menu>
          </Box>
          <Typography
            variant="body2"
            sx={{ color: '#6B7280', fontSize: { xs: '14px', md: '16px' } }}
          >
            Track and manage all your booking payments
          </Typography>
        </Box>

        {/* Summary Cards */}
        <Grid container spacing={1} sx={{ mb: 4 }}>
          {/* Total Revenue */}
          <Grid size={{ xs: 6, sm: 6, md: 4}}>
            <Card
              sx={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: 3,
                boxShadow: '0 8px 24px rgba(102, 126, 234, 0.25)',
                transition: 'transform 0.2s ease',
                '&:hover': { transform: 'translateY(-4px)' }
              }}
            >
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography sx={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, mb: 1 }}>
                      Total Revenue
                    </Typography>
                    <Typography sx={{ color: '#fff', fontSize: { xs: 24, md: 28 }, fontWeight: 700 }}>
                       ₹{formatIndianCurrency(summary.totalRevenue)}
                    </Typography>
                  </Box>
                 
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Total Transactions */}
          <Grid size={{ xs: 6, sm: 6, md: 4}}>
            <Card
              sx={{
                background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                borderRadius: 3,
                boxShadow: '0 8px 24px rgba(240, 147, 251, 0.25)',
                transition: 'transform 0.2s ease',
                '&:hover': { transform: 'translateY(-4px)' }
              }}
            >
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography sx={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, mb: 1 }}>
                      Transactions
                    </Typography>
                    <Typography sx={{ color: '#fff', fontSize: { xs: 24, md: 28 }, fontWeight: 700 }}>
                      {/* {summary.totalTransactions} */}
                       {formatIndianCurrency(summary.totalTransactions)}

                    </Typography>
                  </Box>
                 
                </Box>
              </CardContent>
            </Card>
          </Grid>

         
        </Grid>


        {/* Transactions List */}
        <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)', mb: 3 }}>
          {filteredTransactions.length === 0 ? (
            <Box sx={{ p: 6, textAlign: 'center' }}>
              <ReceiptIcon sx={{ fontSize: 64, color: '#E5E7EB', mb: 2 }} />
              <Typography variant="h6" sx={{ color: '#6B7280', mb: 1 }}>
                No transactions found
              </Typography>
              <Typography variant="body2" sx={{ color: '#9CA3AF' }}>
                {searchQuery ? 'Try adjusting your search' : 'Transactions will appear here once you receive payments'}
              </Typography>
            </Box>
          ) : isMobile ? (
            // Mobile Card View
            <Box>
              {filteredTransactions.map((transaction, index) => (
                <Box key={transaction._id}>
                  <Box
                    sx={{
                      p: 2.5,
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                      '&:hover': { bgcolor: '#F9FAFB' }
                    }}
                    onClick={() => handleViewDetails(transaction)}
                  >
                    <Stack spacing={2}>
                      {/* Header */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Box sx={{ flex: 1 }}>
                          <Typography sx={{ fontWeight: 600, fontSize: 15, color: '#1A1A1A', mb: 0.5 }}>
                            {transaction.customer?.name || 'N/A'}
                          </Typography>
                          <Typography sx={{ fontSize: 13, color: '#6B7280' }}>
                            {transaction.productTitle || 'Booking Session'}
                          </Typography>
                        </Box>
                        <Chip
                          icon={<CheckCircleIcon sx={{ fontSize: 16 }} />}
                          label="Paid"
                          size="small"
                          sx={{
                            bgcolor: '#D1FAE5',
                            color: '#065F46',
                            fontWeight: 600,
                            fontSize: 12,
                            height: 28
                          }}
                        />
                      </Box>

                      {/* Amount & Payment Method */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <RupeeIcon sx={{ fontSize: 18, color: '#667eea' }} />
                          <Typography sx={{ fontSize: 20, fontWeight: 700, color: '#667eea' }}>
                            {(transaction.amount / 100).toFixed(0)}
                          </Typography>
                        </Box>
                        {transaction.customerBookingId && (
                        <Typography sx={{ fontSize: 12, color: '#667eea', fontWeight: 500 }}>
                          ID: #{transaction.customerBookingId}
                        </Typography>
                      )}
                      </Box>


                      {/* Footer */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography sx={{ fontSize: 12, color: '#9CA3AF' }}>
                          {formatDate(transaction.paidAt || transaction.createdAt)}
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: '#667eea', fontWeight: 500 }}>
                          View Details →
                        </Typography>
                      </Box>
                    </Stack>
                  </Box>
                  {index < filteredTransactions.length - 1 && <Divider />}
                </Box>
              ))}
            </Box>
          ) : (
            // Desktop Table View
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                    <TableCell sx={{ fontWeight: 600, color: '#374151' }}>Booking ID</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#374151' }}>Customer</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#374151' }}>Service</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#374151' }}>Amount</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#374151' }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#374151' }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#374151' }}>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredTransactions.map((transaction) => (
                    <TableRow
                      key={transaction._id}
                      sx={{
                        '&:hover': { bgcolor: '#F9FAFB' },
                        transition: 'background 0.2s'
                      }}
                    >
                      <TableCell>
                        <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#667eea' }}>
                          #{transaction.customerBookingId || transaction.orderId?.slice(-8)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography sx={{ fontSize: 14, fontWeight: 500, color: '#1A1A1A' }}>
                            {transaction.customer?.name || 'N/A'}
                          </Typography>
                          <Typography sx={{ fontSize: 12, color: '#6B7280' }}>
                            {transaction.customer?.email}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontSize: 14, color: '#374151' }}>
                          {transaction.productTitle || 'Booking Session'}
                        </Typography>
                      </TableCell>
                    
                      <TableCell>
                        <Typography sx={{ fontSize: 15, fontWeight: 600, color: '#1A1A1A' }}>
                          {formatCurrency(transaction.amount)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontSize: 13, color: '#6B7280' }}>
                          {format(new Date(transaction.paidAt || transaction.createdAt), 'MMM dd, yyyy')}
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: '#9CA3AF' }}>
                          {format(new Date(transaction.paidAt || transaction.createdAt), 'hh:mm a')}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          icon={<CheckCircleIcon sx={{ fontSize: 16 }} />}
                          label="Paid"
                          size="small"
                          sx={{
                            bgcolor: '#D1FAE5',
                            color: '#065F46',
                            fontWeight: 600,
                            fontSize: 12
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          onClick={() => handleViewDetails(transaction)}
                          sx={{
                            textTransform: 'none',
                            color: '#667eea',
                            fontWeight: 500,
                            fontSize: 13
                          }}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Card>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mb: 4 }}>
            <Stack spacing={2} alignItems="center">
              <Pagination
                count={pagination.totalPages}
                page={pagination.currentPage}
                onChange={handlePageChange}
                color="primary"
                size={isMobile ? 'small' : 'medium'}
                showFirstButton
                showLastButton
                sx={{
                  '& .MuiPaginationItem-root': {
                    fontFamily: 'Inter',
                    fontWeight: 600,
                  }
                }}
              />
              <Typography variant="body2" sx={{ color: '#6B7280', fontFamily: 'Inter' }}>
                Showing {((pagination.currentPage - 1) * pagination.limit) + 1} to {Math.min(pagination.currentPage * pagination.limit, pagination.totalRecords)} of {pagination.totalRecords} transactions
              </Typography>
            </Stack>
          </Box>
        )}

        {/* Custom Date Range Dialog */}
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <Dialog
            open={customDateDialogOpen}
            onClose={handleCustomDateCancel}
            maxWidth="xs"
            fullWidth
            PaperProps={{
              sx: { borderRadius: 3 }
            }}
          >
            <DialogTitle sx={{ fontFamily: 'Inter', fontWeight: 600 }}>
              Select Custom Date Range
            </DialogTitle>
            <DialogContent sx={{ pt: 3 }}>
              <Stack spacing={3} mt={2}>
                <DatePicker
                  mt={2}
                  label="Start Date"
                  value={customStartDate}
                  onChange={(newValue) => setCustomStartDate(newValue)}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      sx: {
                        '& .MuiOutlinedInput-root': {
                          borderRadius: 2,
                        },
                      }
                    }
                  }}
                />
                <DatePicker
                  label="End Date"
                  value={customEndDate}
                  onChange={(newValue) => setCustomEndDate(newValue)}
                  minDate={customStartDate}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      sx: {
                        '& .MuiOutlinedInput-root': {
                          borderRadius: 2,
                        }
                      }
                    }
                  }}
                />
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 3 }}>
              <Button
                onClick={handleCustomDateCancel}
                sx={{
                  textTransform: 'none',
                  fontFamily: 'Inter',
                  fontWeight: 600,
                  color: '#6B7280'
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCustomDateApply}
                variant="contained"
                disabled={!customStartDate || !customEndDate}
                sx={{
                  textTransform: 'none',
                  fontFamily: 'Inter',
                  fontWeight: 600,
                  borderRadius: 2,
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                }}
              >
                Apply
              </Button>
            </DialogActions>
          </Dialog>
        </LocalizationProvider>

        {/* Transaction Details Dialog */}
        <Dialog
          open={detailsOpen}
          onClose={handleCloseDetails}
          maxWidth="sm"
          fullWidth
          fullScreen={isMobile}
          PaperProps={{
            sx: {
              borderRadius: { xs: 0, sm: 3 },
              maxHeight: { xs: '100%', sm: '90vh' }
            }
          }}
        >
          <DialogTitle sx={{ p: 3, pb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography sx={{ fontSize: 20, fontWeight: 700, color: '#1A1A1A' }}>
                Transaction Details
              </Typography>
              <IconButton onClick={handleCloseDetails} size="small">
                <CloseIcon />
              </IconButton>
            </Box>
          </DialogTitle>
          <DialogContent sx={{ p: 3 }}>
            {selectedTransaction && (
              <Stack spacing={3}>
                {/* Status Badge */}
                <Box sx={{ textAlign: 'center', py: 2 }}>
                  <CheckCircleIcon sx={{ fontSize: 64, color: '#10B981', mb: 2 }} />
                  <Typography sx={{ fontSize: 18, fontWeight: 600, color: '#1A1A1A', mb: 1 }}>
                    Payment Successful
                  </Typography>
                  <Typography sx={{ fontSize: 32, fontWeight: 700, color: '#667eea' }}>
                    {formatCurrency(selectedTransaction.amount)}
                  </Typography>
                </Box>

                <Divider />

                {/* Order Info */}
                <Box>
                  <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#9CA3AF', mb: 2, textTransform: 'uppercase' }}>
                    Transaction Information
                  </Typography>
                  <Stack spacing={2}>
                    {selectedTransaction.customerBookingId && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontSize: 14, color: '#6B7280' }}>Booking ID</Typography>
                        <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#667eea' }}>
                          #{selectedTransaction.customerBookingId}
                        </Typography>
                      </Box>
                    )}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography sx={{ fontSize: 14, color: '#6B7280' }}>Order ID</Typography>
                      <Typography sx={{ fontSize: 14, fontWeight: 500, color: '#1A1A1A', wordBreak: 'break-all' }}>
                        {selectedTransaction.orderId}
                      </Typography>
                    </Box>
                    {selectedTransaction.paymentId && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontSize: 14, color: '#6B7280' }}>Payment ID</Typography>
                        <Typography sx={{ fontSize: 14, fontWeight: 500, color: '#1A1A1A', wordBreak: 'break-all' }}>
                          {selectedTransaction.paymentId}
                        </Typography>
                      </Box>
                    )}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography sx={{ fontSize: 14, color: '#6B7280' }}>Service</Typography>
                      <Typography sx={{ fontSize: 14, fontWeight: 500, color: '#1A1A1A' }}>
                        {selectedTransaction.productTitle || 'Booking Session'}
                      </Typography>
                    </Box>
                  
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography sx={{ fontSize: 14, color: '#6B7280' }}>Date & Time</Typography>
                      <Typography sx={{ fontSize: 14, fontWeight: 500, color: '#1A1A1A' }}>
                        {formatDate(selectedTransaction.paidAt || selectedTransaction.createdAt)}
                      </Typography>
                    </Box>
                  </Stack>
                </Box>

                <Divider />

                {/* Customer Info */}
                <Box>
                  <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#9CA3AF', mb: 2, textTransform: 'uppercase' }}>
                    Customer Information
                  </Typography>
                  <Stack spacing={2}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <PersonIcon sx={{ color: '#9CA3AF', fontSize: 20 }} />
                      <Typography sx={{ fontSize: 14, color: '#1A1A1A' }}>
                        {selectedTransaction.customer?.name || selectedTransaction.userName || 'N/A'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <EmailIcon sx={{ color: '#9CA3AF', fontSize: 20 }} />
                      <Typography sx={{ fontSize: 14, color: '#1A1A1A' }}>
                        {selectedTransaction.customer?.email || selectedTransaction.userEmail || 'N/A'}
                      </Typography>
                    </Box>
                    {selectedTransaction.customer?.phone && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <PhoneIcon sx={{ color: '#9CA3AF', fontSize: 20 }} />
                        <Typography sx={{ fontSize: 14, color: '#1A1A1A' }}>
                          {selectedTransaction.customer.phone}
                        </Typography>
                      </Box>
                    )}
                  </Stack>
                </Box>

             
              </Stack>
            )}
          </DialogContent>
          <DialogActions sx={{ p: 3, pt: 0 }}>
         
          </DialogActions>
        </Dialog>
      </Container>
    </Box>
  );
};

export default TransactionsPage;

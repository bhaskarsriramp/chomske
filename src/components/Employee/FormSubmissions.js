import { useState, useEffect } from 'react';
import { useNavigate } from "react-router-dom";
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Stack,
  Button,
  IconButton,
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
  Pagination,
  Skeleton,
  useTheme,
  useMediaQuery,
  alpha,
  Divider,
  Tooltip,
} from '@mui/material';
import {
  Assignment as FormIcon,
  Visibility as VisibilityIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { format } from 'date-fns';
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const baseUrl = "/api/usersOn";

const FormSubmissions = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState([]);
  const [formBlocks, setFormBlocks] = useState([]);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalRecords: 0,
    limit: 20
  });

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFormId, setSelectedFormId] = useState('all');

  // Detail dialog
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState(null);

    const handleSessionExpired = () => {
        toast.error("Session expired. Please log in again.");
        setTimeout(() => {
          navigate("/professional/login");
        }, 2000);
      };

  useEffect(() => {
      const verifyToken = async () => {
        setLoading(true);
        try {
          
          const res = await axios.get(`${baseUrl}/verify-login-token`, {
            withCredentials: true,
          });
          if (res.data.valid) {
  
               const creatorHandleRes = await axios.get(
                      `${baseUrl}/check-handle-created`,
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
    fetchSubmissions(1);
  }, [selectedFormId, searchQuery]);

  const fetchSubmissions = async (page = 1) => {
    try {
      setLoading(true);
      
      const requestBody = {
        page,
        limit: 20,
        ...(selectedFormId !== 'all' && { blockId: selectedFormId }),
        ...(searchQuery && { searchQuery })
      };

      const response = await axios.post(
        baseUrl + '/form-submissions',
        requestBody,
        { withCredentials: true }
      );

      console.log('Submissions : ', response.data.data.submissions);

      if (response.data.success) {
        setSubmissions(response.data.data.submissions);
        setFormBlocks(response.data.data.formBlocks);
        setPagination(response.data.data.pagination);
      }
    } catch (error) {
      console.error('Error fetching submissions:', error);
    } finally {
      setLoading(false);
    }
  };

const handleViewDetails = async (submission) => {
  try {
    // Fetch full submission details with field labels
    const response = await axios.get(
      `${baseUrl}/form-submissions/${submission._id}`,
      { withCredentials: true }
    );

    if (response.data.success) {
      setSelectedSubmission(response.data.data);
      setDetailsOpen(true);
    }
  } catch (error) {
    console.error('Error fetching submission details:', error);
    alert('Failed to load submission details');
  }
};


  const handleDelete = async (submissionId) => {
    if (!window.confirm('Are you sure you want to delete this submission?')) {
      return;
    }

    try {
      await axios.delete(
        `${baseUrl}/form-submissions/${submissionId}`,
        { withCredentials: true }
      );

      setSubmissions(submissions.filter(s => s._id !== submissionId));
      alert('Submission deleted successfully');
    } catch (error) {
      console.error('Error deleting submission:', error);
      alert('Failed to delete submission');
    }
  };

  const handlePageChange = (event, value) => {
    fetchSubmissions(value);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const formatDate = (date) => {
    return format(new Date(date), 'MMM dd, yyyy • hh:mm a');
  };

  const renderFieldValue = (value) => {
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    return value || 'N/A';
  };

  // Loading Skeleton
  const LoadingSkeleton = () => (
    <Box>
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {[1, 2, 3].map((item) => (
          <Grid item xs={12} sm={6} md={4} key={item}>
            <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
          </Grid>
        ))}
      </Grid>
      {[1, 2, 3, 4, 5].map((item) => (
        <Skeleton key={item} variant="rectangular" height={80} sx={{ mb: 2, borderRadius: 2 }} />
      ))}
    </Box>
  );

  return (
    <Box sx={{ bgcolor: '#F8F9FA', minHeight: '100vh', py: { xs: 3, md: 5 } }}>
      <Container maxWidth="xl">
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              fontFamily: 'Inter',
              color: '#1A1A1A',
              fontSize: { xs: '18px', md: '22px' },
              mb: 1
            }}
          >
            Form Submissions
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: '#6B7280', fontFamily: 'Inter' }}
          >
            View and manage all form responses
          </Typography>
        </Box>

        {/* Summary Cards */}
        {!loading && (
          <Grid container spacing={3} sx={{ mb: 4 }}>
            {/* Total Submissions */}
            <Grid size={{ xs: 6, sm: 6, md: 4 }}>
              <Card
                sx={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  borderRadius: 3,
                  boxShadow: '0 8px 24px rgba(102, 126, 234, 0.25)',
                }}
              >
                <CardContent sx={{ p: 3 }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Box>
                      <Typography sx={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, mb: 1 }}>
                        Total Submissions
                      </Typography>
                      <Typography sx={{ color: '#fff', fontSize: 32, fontWeight: 700 }}>
                        {pagination.totalRecords}
                      </Typography>
                    </Box>
                   
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            {/* Total Forms */}
            <Grid size={{ xs: 6, sm: 6, md: 4 }}>
              <Card
                sx={{
                  background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                  borderRadius: 3,
                  boxShadow: '0 8px 24px rgba(240, 147, 251, 0.25)',
                }}
              >
                <CardContent sx={{ p: 3 }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Box>
                      <Typography sx={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, mb: 1 }}>
                        Total Active Forms
                      </Typography>
                      <Typography sx={{ color: '#fff', fontSize: 32, fontWeight: 700 }}>
                        {formBlocks.length}
                      </Typography>
                    </Box>
                  
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

           
          </Grid>
        )}

    

        {/* Submissions List */}
        {loading ? (
          <LoadingSkeleton />
        ) : submissions.length === 0 ? (
          <Card sx={{ borderRadius: 3, p: 6, textAlign: 'center' }}>
            <FormIcon sx={{ fontSize: 64, color: '#E5E7EB', mb: 2 }} />
            <Typography variant="h6" sx={{ color: '#6B7280', mb: 1, fontFamily: 'Inter' }}>
              No submissions yet
            </Typography>
            <Typography variant="body2" sx={{ color: '#9CA3AF', fontFamily: 'Inter' }}>
              Form submissions will appear here once users start submitting
            </Typography>
          </Card>
        ) : isMobile ? (
          // Mobile Card View
       // Mobile Card View
<Stack spacing={2}>
  {submissions.map((submission) => (
    <Card
      key={submission._id}
      sx={{
        borderRadius: 2,
        border: '1px solid #E5E7EB',
        cursor: 'pointer',
        transition: 'all 0.2s',
        '&:hover': {
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          borderColor: '#667eea',
        }
      }}
      onClick={() => handleViewDetails(submission)}
    >
      <CardContent sx={{ p: 2 }}>
        <Stack spacing={1.5}>
          {/* Header */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: 15, fontWeight: 600, fontFamily: 'Inter', color: '#1A1A1A', mb: 0.5 }}>
                {submission.block_name || 'Form Submission'}
              </Typography>
              <Typography sx={{ fontSize: 12, color: '#6B7280', fontFamily: 'Inter' }}>
                {formatDate(submission.submitted_at)}
              </Typography>
              
              {/* Location for mobile */}
              {submission.city && submission.country && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                  <Box
                    sx={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      bgcolor: '#10B981',
                      flexShrink: 0
                    }}
                  />
                  <Typography sx={{ fontSize: 11, fontFamily: 'Inter', color: '#6B7280' }}>
                    {submission.city}, {submission.country}
                  </Typography>
                </Box>
              )}
            </Box>
            {/* <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(submission._id);
              }}
              sx={{ color: '#EF4444' }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton> */}
          </Box>

          <Divider />

          {/* Preview Values */}
          <Box>
           
              <Typography sx={{ fontSize: 12, color: '#667eea', fontFamily: 'Inter', mt: 1 }}>
               Details
              </Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  ))}
</Stack>

        ) : (
          // Desktop Table View
       // Desktop Table View
<Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
  <TableContainer>
    <Table>
      <TableHead>
        <TableRow sx={{ bgcolor: '#F9FAFB' }}>
          <TableCell sx={{ fontWeight: 600, color: '#374151', fontFamily: 'Inter' }}>
            Form Name
          </TableCell>
          <TableCell sx={{ fontWeight: 600, color: '#374151', fontFamily: 'Inter' }}>
            Date
          </TableCell>
          <TableCell sx={{ fontWeight: 600, color: '#374151', fontFamily: 'Inter' }}>
            Location
          </TableCell>
          <TableCell sx={{ fontWeight: 600, color: '#374151', fontFamily: 'Inter' }}>
            Actions
          </TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {submissions.map((submission) => (
          <TableRow
            key={submission._id}
            sx={{
              '&:hover': { bgcolor: '#F9FAFB' },
              cursor: 'pointer'
            }}
            onClick={() => handleViewDetails(submission)}
          >
            {/* Form Name */}
            <TableCell>
              <Typography sx={{ fontSize: 14, fontWeight: 600, fontFamily: 'Inter', color: '#1A1A1A' }}>
                {submission.block_name || 'Form'}
              </Typography>
            </TableCell>

            {/* Date & Time */}
            <TableCell>
              <Typography sx={{ fontSize: 13, fontFamily: 'Inter', color: '#6B7280' }}>
                {format(new Date(submission.submitted_at), 'MMM dd, yyyy')}
              </Typography>
              <Typography sx={{ fontSize: 12, fontFamily: 'Inter', color: '#9CA3AF' }}>
                {format(new Date(submission.submitted_at), 'hh:mm a')}
              </Typography>
            </TableCell>

            {/* Location */}
            <TableCell>
              {submission.city && submission.country ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      bgcolor: '#10B981',
                      flexShrink: 0
                    }}
                  />
                  <Box>
                    <Typography sx={{ fontSize: 13, fontFamily: 'Inter', color: '#374151', fontWeight: 500 }}>
                      {submission.city}
                    </Typography>
                    <Typography sx={{ fontSize: 12, fontFamily: 'Inter', color: '#9CA3AF' }}>
                      {submission.country}
                    </Typography>
                  </Box>
                </Box>
              ) : submission.country ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      bgcolor: '#6B7280',
                      flexShrink: 0
                    }}
                  />
                  <Typography sx={{ fontSize: 13, fontFamily: 'Inter', color: '#6B7280' }}>
                    {submission.country}
                  </Typography>
                </Box>
              ) : (
                <Chip
                  label="Unknown"
                  size="small"
                  sx={{
                    bgcolor: alpha('#9CA3AF', 0.1),
                    color: '#9CA3AF',
                    fontWeight: 500,
                    fontSize: 12,
                    height: 24
                  }}
                />
              )}
            </TableCell>

            {/* Actions */}
            <TableCell>
              <Stack direction="row" spacing={1}>
                <Tooltip title="View Details">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewDetails(submission);
                    }}
                    sx={{ color: '#667eea' }}
                  >
                    <VisibilityIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                {/* <Tooltip title="Delete">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(submission._id);
                    }}
                    sx={{ color: '#EF4444' }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip> */}
              </Stack>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </TableContainer>
</Card>

        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
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
                Showing {((pagination.currentPage - 1) * pagination.limit) + 1} to {Math.min(pagination.currentPage * pagination.limit, pagination.totalRecords)} of {pagination.totalRecords} submissions
              </Typography>
            </Stack>
          </Box>
        )}

      {/* Details Dialog */}
<Dialog
  open={detailsOpen}
  onClose={() => setDetailsOpen(false)}
  maxWidth="md"
  fullWidth
  fullScreen={isMobile}
  PaperProps={{
    sx: {
      borderRadius: { xs: 0, sm: 3 },
      maxHeight: { xs: '100%', sm: '90vh' }
    }
  }}
>
  <DialogTitle sx={{ p: 3, pb: 2, borderBottom: '1px solid #E5E7EB' }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Box>
        <Typography sx={{ fontSize: 20, fontWeight: 700, fontFamily: 'Inter', color: '#1A1A1A' }}>
          Submission Details
        </Typography>
        <Typography sx={{ fontSize: 13, color: '#6B7280', fontFamily: 'Inter', mt: 0.5 }}>
          {selectedSubmission && formatDate(selectedSubmission.submitted_at)}
        </Typography>
      </Box>
      <IconButton onClick={() => setDetailsOpen(false)} size="small">
        <CloseIcon />
      </IconButton>
    </Box>
  </DialogTitle>

  <DialogContent sx={{ p: 3 }}>
    {selectedSubmission && (
      <Stack spacing={3}>
        {/* Meta Info */}
        <Card sx={{ bgcolor: '#F9FAFB', borderRadius: 2 }}>
          <CardContent sx={{ p: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography sx={{ fontSize: 12, color: '#6B7280', fontFamily: 'Inter', mb: 0.5 }}>
                  Form Name
                </Typography>
                <Typography sx={{ fontSize: 14, fontWeight: 600, fontFamily: 'Inter' }}>
                  {selectedSubmission.block_name || 'N/A'}
                </Typography>
              </Grid>
            
              <Grid item xs={12} sm={6}>
                <Typography sx={{ fontSize: 12, color: '#6B7280', fontFamily: 'Inter', mb: 0.5 }}>
                  Location
                </Typography>
                <Typography sx={{ fontSize: 14, fontWeight: 600, fontFamily: 'Inter' }}>
                  {selectedSubmission.city ? `${selectedSubmission.city}, ${selectedSubmission.country}` : 'N/A'}
                </Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        <Divider />

        {/* Form Values with Proper Labels */}
        <Box>
          <Typography sx={{ fontSize: 16, fontWeight: 600, fontFamily: 'Inter', mb: 2 }}>
            Form Responses
          </Typography>
          <Stack spacing={2.5}>
            {selectedSubmission.transformedValues ? (
              // Use transformed values with labels
              Object.entries(selectedSubmission.transformedValues).map(([key, data]) => (
                <Box 
                  key={key}
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    bgcolor: '#F9FAFB',
                    border: '1px solid #E5E7EB'
                  }}
                >
                  <Typography 
                    sx={{ 
                      fontSize: 13, 
                      fontWeight: 600, 
                      color: '#667eea', 
                      fontFamily: 'Inter', 
                      mb: 1,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}
                  >
                    {data.label}
                  </Typography>
                  <Typography 
                    sx={{ 
                      fontSize: 15, 
                      color: '#1A1A1A', 
                      fontFamily: 'Inter',
                      fontWeight: 500,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word'
                    }}
                  >
                    {renderFieldValue(data.value)}
                  </Typography>
                </Box>
              ))
            ) : (
              // Fallback to showing keys
              Object.entries(selectedSubmission.values || {}).map(([key, value]) => (
                <Box 
                  key={key}
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    bgcolor: '#F9FAFB',
                    border: '1px solid #E5E7EB'
                  }}
                >
                  <Typography 
                    sx={{ 
                      fontSize: 13, 
                      fontWeight: 600, 
                      color: '#667eea', 
                      fontFamily: 'Inter', 
                      mb: 1,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}
                  >
                    {selectedSubmission.fieldLabels?.[key] || key}
                  </Typography>
                  <Typography 
                    sx={{ 
                      fontSize: 15, 
                      color: '#1A1A1A', 
                      fontFamily: 'Inter',
                      fontWeight: 500,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word'
                    }}
                  >
                    {renderFieldValue(value)}
                  </Typography>
                </Box>
              ))
            )}
          </Stack>
        </Box>
      </Stack>
    )}
  </DialogContent>

  <DialogActions sx={{ p: 3, pt: 2, borderTop: '1px solid #E5E7EB' }}>
    <Button
      onClick={() => setDetailsOpen(false)}
      variant="outlined"
      sx={{
        textTransform: 'none',
        fontWeight: 600,
        fontFamily: 'Inter',
        borderRadius: 2,
        borderColor: '#E5E7EB',
        color: '#374151',
        '&:hover': { borderColor: '#9CA3AF', bgcolor: '#F9FAFB' }
      }}
    >
      Close
    </Button>
  
  </DialogActions>
</Dialog>

      </Container>
    </Box>
  );
};

export default FormSubmissions;

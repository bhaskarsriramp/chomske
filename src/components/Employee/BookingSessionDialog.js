import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  Box,
  Typography,
  Button,
  IconButton,
  Stack,
  alpha,
  Tooltip,
  CircularProgress,
  TextField,
  Divider,
  Collapse,
  useTheme,
  DialogActions,
  InputAdornment
} from '@mui/material';
import { 
  Close as CloseIcon, 
  CalendarToday as CalendarMonth, 
  Block as BlockIcon,
  Person as PersonIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  KeyboardArrowDown as ArrowDownIcon,
  KeyboardArrowUp as ArrowUpIcon,
} from '@mui/icons-material';
import Person from '@mui/icons-material/PersonOutlineOutlined';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutlineOutlined';
import CheckCircle from '@mui/icons-material/CheckCircleOutlineOutlined';
import BookingSuccessDialog from './BookingSuccessDialog'; // Add this import
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import WatchLaterIcon from '@mui/icons-material/WatchLater';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider, StaticDatePicker } from '@mui/x-date-pickers';
import dayjs from 'dayjs';
import axios from 'axios';
import { CurrencyRupee } from '@mui/icons-material';

// Load Razorpay script
const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

// TIME SLOTS GENERATOR (10:00 AM to 11:00 PM, 30-min intervals)
const generateTimeSlots = (sessionDuration, bufferTime) => {
  const slots = [];
  const intervalMinutes = sessionDuration + bufferTime;
  
  let currentMinutes = 10 * 60;
  const endMinutes = 23 * 60;
  
  while (currentMinutes <= endMinutes) {
    const hour = Math.floor(currentMinutes / 60);
    const min = currentMinutes % 60;
    
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    const period = hour >= 12 ? 'PM' : 'AM';
    const timeStr = `${String(displayHour).padStart(2, '0')}:${String(min).padStart(2, '0')} ${period}`;
    
    slots.push(timeStr);
    currentMinutes += intervalMinutes;
  }
  
  return slots;
};

// DATE BUTTONS COMPONENT
const DateButtons = ({ selectedDate, onDateChange, isDateFromCalendar, onOpenCalendar }) => {
  const today = dayjs();
  const dates = [];

  for (let i = 1; i <= 3; i++) {
    dates.push(today.add(i, 'day'));
  }

  if (isDateFromCalendar) {
    return (
      <Box sx={{ display: 'flex', gap: 1, pb: 1 }}>
        <Button
          onClick={() => onOpenCalendar()}
          sx={{
            px: 3,
            py: 2,
            borderRadius: 2,
            border: 'none',
            width: '100%',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: '#fff',
            fontFamily: 'Inter',
            fontWeight: 600,
            fontSize: 14,
            textTransform: 'none',
            transition: 'all .15s ease',
            cursor: 'pointer',
            '&:hover': {
              transform: 'scale(1.02)',
              boxShadow: '0 8px 20px rgba(102, 126, 234, 0.3)',
            },
            '&:active': {
              transform: 'scale(0.98)',
            },
          }}
        >
          <Box sx={{ textAlign: 'center' }}>
            <Box sx={{ fontSize: 12, fontWeight: 400, mb: 0.5 }}>
              {selectedDate.format('ddd')}
            </Box>
            <Box sx={{ fontSize: 16, fontWeight: 700 }}>
              {selectedDate.format('DD MMM YYYY')}
            </Box>
          </Box>
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1 }}>
      {dates.map((date) => (
        <Button
          key={date.format('YYYY-MM-DD')}
          onClick={() => onDateChange(date)}
          sx={{
            px: 2,
            py: 1.5,
            borderRadius: 2,
            minWidth: 80,
            border: '2px solid #41A67E',
            bgcolor: selectedDate?.format('YYYY-MM-DD') === date.format('YYYY-MM-DD')
              ? '#41A67E'
              : '#F9FAFB',
            borderColor: selectedDate?.format('YYYY-MM-DD') === date.format('YYYY-MM-DD')
              ? '#41A67E'
              : '#E5E7EB',
            color: '#1F2937',
            fontFamily: 'Inter',
            fontWeight: selectedDate?.format('YYYY-MM-DD') === date.format('YYYY-MM-DD') ? 700 : 600,
            fontSize: 14,
            textTransform: 'none',
            whiteSpace: 'nowrap',
            transition: 'all .15s ease',
            boxShadow: selectedDate?.format('YYYY-MM-DD') === date.format('YYYY-MM-DD')
              ? '0 4px 12px rgba(212, 165, 116, 0.15)'
              : 'none',
            '&:hover': {
              borderColor: '#D4A574',
              bgcolor: '#fff',
            },
          }}
        >
          <Box sx={{ textAlign: 'left' }}>
            <Box sx={{ fontSize: 12, fontWeight: 400, color: '#000000' }}>
              {date.format('ddd')}
            </Box>
            <Box sx={{ fontSize: 14, fontWeight: 600 }}>
              {date.format('DD MMM')}
            </Box>
          </Box>
        </Button>
      ))}

      <Button
        onClick={onOpenCalendar}
        sx={{
          px: 2,
          py: 1.5,
          borderRadius: 2,
          minWidth: 100,
          border: '2px solid #E5E7EB',
          bgcolor: '#F9FAFB',
          borderColor: '#E5E7EB',
          color: '#1F2937',
          fontFamily: 'Inter',
          fontWeight: 600,
          fontSize: 14,
          textTransform: 'none',
          whiteSpace: 'nowrap',
          transition: 'all .15s ease',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.5,
          '&:hover': {
            borderColor: '#D4A574',
            bgcolor: '#fff',
          },
        }}
      >
        <CalendarMonthIcon sx={{ fontSize: 24, color: '#6B7280' }} />
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>
          More
        </Typography>
      </Button>
    </Box>
  );
};

// CALENDAR DIALOG
const CalendarDialog = ({ open, onClose, selectedDate, onDateSelect }) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: { xs: '24px 24px 0 0', sm: '16px' },
          position: { xs: 'fixed', sm: 'relative' },
          bottom: { xs: 0, sm: 'auto' },
          animation: { xs: 'slideUp 0.3s ease-out', sm: 'fadeIn 0.3s ease-out' },
          '@keyframes slideUp': {
            from: { transform: 'translateY(100%)' },
            to: { transform: 'translateY(0)' },
          },
          '@keyframes fadeIn': {
            from: { opacity: 0, transform: 'scale(0.9)' },
            to: { opacity: 1, transform: 'scale(1)' },
          },
        },
      }}
    >
      <DialogContent sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography sx={{ fontFamily: 'Inter', fontSize: 18, fontWeight: 700 }}>
            When should we meet?
          </Typography>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>

        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <StaticDatePicker
            displayStaticWrapperAs="desktop"
            value={selectedDate}
            onChange={(newDate) => {
              onDateSelect(newDate);
              onClose();
            }}
            minDate={dayjs().add(1, 'day')}
            sx={{
              width: '100%',
              '& .MuiPickersDay-root': {
                fontFamily: 'Inter',
              },
              '& .MuiPickersDay-root.Mui-selected': {
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              },
            }}
          />
        </LocalizationProvider>
      </DialogContent>
    </Dialog>
  );
};

// CUSTOMER DETAILS DIALOG
const CustomerDetailsDialog = ({ 
  open, 
  onClose, 
  selectedDate, 
  selectedTime, 
  onSubmit, 
  submitting, 
  bookingData 
}) => {
  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    email: '',
  });
  const [errors, setErrors] = useState({});
  const [expanded, setExpanded] = useState(false);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.mobile.trim()) {
      newErrors.mobile = 'Mobile number is required';
    } else if (!/^\d{10}$/.test(formData.mobile.replace(/\D/g, ''))) {
      newErrors.mobile = 'Please enter a valid 10-digit mobile number';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validateForm()) {
      onSubmit(formData);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: { xs: '24px 24px 0 0', sm: '16px' },
          position: { xs: 'fixed', sm: 'relative' },
          bottom: { xs: 0, sm: 'auto' },
          left: { xs: 0, sm: 'auto' },        // ✅ Fix alignment
          right: { xs: 0, sm: 'auto' },       // ✅ Fix alignment
          width: { xs: '100%', sm: 'auto' },
          margin: { xs: 0, sm: 'auto' },
          maxHeight: { xs: '90vh', sm: 'calc(100% - 64px)' },
          animation: { xs: 'slideUp 0.3s ease-out', sm: 'fadeIn 0.3s ease-out' },
          '@keyframes slideUp': {
            from: { transform: 'translateY(100%)' },
            to: { transform: 'translateY(0)' },
          },
          '@keyframes fadeIn': {
            from: { opacity: 0, transform: 'scale(0.9)' },
            to: { opacity: 1, transform: 'scale(1)' },
          },
        },
      }}
    >
      <DialogContent 
        sx={{ 
          p: 3,
          overflowY: 'auto',                    // ✅ Enable vertical scroll
          overflowX: 'hidden',                  // ✅ Prevent horizontal scroll
          maxHeight: '100%',                    // ✅ Constrain height
          WebkitOverflowScrolling: 'touch',     // ✅ Smooth iOS scrolling
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography sx={{ fontFamily: 'Inter', fontSize: 20, fontWeight: 700 }}>
            Complete Your Booking
          </Typography>
          <IconButton size="small" onClick={onClose} disabled={submitting}>
            <CloseIcon />
          </IconButton>
        </Box>

        <Stack spacing={3}>
          {/* Selected Slot Display */}
          <Box
            sx={{
              p: 2,
              borderRadius: 2,
              background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.08) 0%, rgba(118, 75, 162, 0.08) 100%)',
              border: '1px solid #D4A574',
            }}
          >
            <Typography sx={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 400, color: '#6B7280', mb: 0.5 }}>
              Your Selected Slot
            </Typography>
            <Typography
              sx={{
                fontFamily: 'Inter',
                fontSize: 16,
                fontWeight: 600,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {selectedDate.format('ddd, DD MMM YYYY')} at {selectedTime}
            </Typography>
          </Box>

          <Typography sx={{ fontSize: 13, color: '#6B7280', fontFamily: 'Inter' }}>
            <strong>Required</strong> to share booking details
          </Typography>

          {/* Name Field */}
          <TextField
            fullWidth
            label="Name"
            placeholder="Enter name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            error={!!errors.name}
            helperText={errors.name}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <PersonIcon sx={{ color: '#9CA3AF' }} />
                </InputAdornment>
              ),
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                fontFamily: 'Inter',
                borderRadius: 2,
                fontSize: '16px'
              },
              '& .MuiInputBase-input': {
                fontSize: '16px',
                lineHeight: 1.5,
              },
            }}
          />

          {/* Mobile Field */}
       <TextField
  fullWidth
  label="Mobile Number"
  placeholder="Enter mobile number"
  type="tel"                          // ✅ phone keypad on mobile
  autoComplete="tel"                  // ✅ helps autofill & OS hints
  inputProps={{
    inputMode: 'numeric',             // ✅ numeric keypad hint
    pattern: '[0-9]*',                // ✅ restricts to digits on mobile keyboards
    maxLength: 10,                    // ✅ hard cap in the input itself
  }}
  value={formData.mobile}
  onChange={(e) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length <= 10) {
      setFormData({ ...formData, mobile: value });
    }
  }}
  error={!!errors.mobile}
  helperText={errors.mobile}
  InputProps={{
    startAdornment: (
      <InputAdornment position="start">
        <PhoneIcon sx={{ color: '#9CA3AF' }} />
      </InputAdornment>
    ),
  }}
  sx={{
    '& .MuiOutlinedInput-root': {
      fontFamily: 'Inter',
      borderRadius: 2,
      fontSize: '16px',
    },
    '& .MuiInputBase-input': { fontSize: '16px', lineHeight: 1.5 },
  }}
/>

          {/* Email Field */}
          <TextField
            fullWidth
            label="Email Address"
            placeholder="Enter email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            error={!!errors.email}
            helperText={errors.email}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <EmailIcon sx={{ color: '#9CA3AF' }} />
                </InputAdornment>
              ),
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                fontFamily: 'Inter',
                borderRadius: 2,
                fontSize: '16px'
              },
              '& .MuiInputBase-input': {
                fontSize: '16px',
                lineHeight: 1.5,
              },
            }}
          />

          {/* Order Summary */}
          <Box
            sx={{
              border: '1px solid #E5E7EB',
              borderRadius: 2,
              overflow: 'hidden',
              bgcolor: '#F0F0F0',
            }}
          >
            {/* Header - Always Visible */}
            <Box
              onClick={() => setExpanded(!expanded)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                p: 2,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                '&:hover': {
                  bgcolor: '#F3F4F6',
                },
              }}
            >
              <Typography
                sx={{
                  fontFamily: 'Inter',
                  fontSize: 15,
                  fontWeight: 600,
                  color: '#1F2937',
                }}
              >
                Order Summary
              </Typography>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {bookingData.pricing != 0 ? (
                  <Stack sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                    <CurrencyRupee sx={{ fontSize: '16px', color: '#1F2937' }} />
                    <Typography sx={{ fontFamily: 'Inter', fontSize: '16px', fontWeight: 500, color: '#1F2937' }}>
                      {bookingData.pricing}
                    </Typography>
                  </Stack>
                ) : (
                  <Typography sx={{ fontFamily: 'Inter', fontSize: '16px', fontWeight: 500, color: '#1F2937' }}>
                    FREE
                  </Typography>
                )}
                <IconButton size="small" sx={{ color: '#6B7280' }}>
                  {expanded ? <ArrowUpIcon /> : <ArrowDownIcon />}
                </IconButton>
              </Box>
            </Box>

            {/* Collapsible Content */}
            <Collapse in={expanded}>
              <Box sx={{ px: 2, pb: 2 }}>
                <Divider sx={{ mb: 1 }} />

                {/* Item 1: Session Title + Price */}
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    py: 1.5,
                  }}
                >
                  <Typography
                    sx={{
                      fontFamily: 'Inter',
                      fontSize: 14,
                      fontWeight: 500,
                      color: '#4B5563',
                    }}
                  >
                    {bookingData.title || 'Consultation'}
                  </Typography>
                  {bookingData.pricing != 0 ? (
                    <Stack sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                      <CurrencyRupee sx={{ fontSize: '16px', color: '#1F2937' }} />
                      <Typography sx={{ fontFamily: 'Inter', fontSize: '16px', fontWeight: 500, color: '#1F2937' }}>
                        {bookingData.pricing}
                      </Typography>
                    </Stack>
                  ) : (
                    <Typography sx={{ fontFamily: 'Inter', fontSize: '16px', fontWeight: 500, color: '#1F2937' }}>
                      FREE
                    </Typography>
                  )}
                </Box>

                <Divider sx={{ my: 0 }} />

                {/* Item 2: Platform Fee */}
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    py: 1.5,
                  }}
                >
                  <Typography
                    sx={{
                      fontFamily: 'Inter',
                      fontSize: 14,
                      fontWeight: 500,
                      color: '#4B5563',
                    }}
                  >
                    Platform fee
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography
                      sx={{
                        fontFamily: 'Inter',
                        fontSize: 14,
                        fontWeight: 500,
                        color: '#9CA3AF',
                        textDecoration: 'line-through',
                      }}
                    >
                      ₹12
                    </Typography>
                    <Typography
                      sx={{
                        fontFamily: 'Inter',
                        fontSize: 14,
                        fontWeight: 600,
                        color: '#10B981',
                      }}
                    >
                      FREE
                    </Typography>
                  </Box>
                </Box>

                <Divider sx={{ my: 1 }} />

                {/* Item 3: Total */}
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    py: 1.5,
                    bgcolor: 'rgba(102, 126, 234, 0.08)',
                    px: 2,
                    borderRadius: 1.5,
                    mt: 1,
                  }}
                >
                  <Typography
                    sx={{
                      fontFamily: 'Inter',
                      fontSize: 16,
                      fontWeight: 600,
                      color: '#1F2937',
                    }}
                  >
                    Total
                  </Typography>
                  {bookingData.pricing != 0 ? (
                    <Stack sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                      <CurrencyRupee sx={{ fontSize: '16px', color: '#1F2937' }} />
                      <Typography sx={{ fontFamily: 'Inter', fontSize: '16px', fontWeight: 600, color: '#1F2937' }}>
                        {bookingData.pricing}
                      </Typography>
                    </Stack>
                  ) : (
                    <Typography sx={{ fontFamily: 'Inter', fontSize: '16px', fontWeight: 600, color: '#1F2937' }}>
                      FREE
                    </Typography>
                  )}
                </Box>
              </Box>
            </Collapse>
          </Box>

          {/* Submit Button */}
          <Box
            sx={{
              display: 'flex',
              gap: 1.5,
              width: '100%',
            }}
          >
            {/* Left: Price Button (30%) */}
            <Box
              sx={{
                width: '30%',
                py: 1.75,
                borderRadius: 1,
                border: '1px solid #000000',
                bgcolor: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'Inter',
                fontWeight: 700,
                fontSize: 18,
                color: '#667eea',
              }}
            >
              {bookingData.pricing != 0 ? (
                <Stack sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                  <CurrencyRupee sx={{ fontSize: '16px', color: '#1F2937' }} />
                  <Typography sx={{ fontFamily: 'Inter', fontSize: '16px', fontWeight: 600, color: '#1F2937' }}>
                    {bookingData.pricing}
                  </Typography>
                </Stack>
              ) : (
                <Typography sx={{ fontFamily: 'Inter', fontSize: '16px', fontWeight: 600, color: '#1F2937' }}>
                  FREE
                </Typography>
              )}
            </Box>

            {/* Right: Confirm Booking Button (70%) */}
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              sx={{
                width: '70%',
                py: 1.75,
                borderRadius: 1,
                background: '#000000',
                color: '#FFFFFF',
                fontFamily: 'Inter',
                fontWeight: 600,
                fontSize: 15,
                textTransform: 'none',
                transition: 'all .2s ease',
                '&:hover': {
                  transform: 'scale(1.02)',
                  boxShadow: '0 8px 20px #000000',
                },
                '&:disabled': {
                  background: '#9CA3AF',
                  color: '#fff',
                },
              }}
            >
              {submitting ? (
                <CircularProgress size={24} sx={{ color: '#fff' }} />
              ) : (
                'Book Session'
              )}
            </Button>
          </Box>
        </Stack>
      </DialogContent>
    </Dialog>
  );
};


// TIME SLOTS COMPONENT
const TimeSlots = ({ selectedTime, onTimeSelect, bookedSlots, loading, bufferTime, sessionDuration }) => {
  const slots = generateTimeSlots(sessionDuration, bufferTime);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  return (
    <Box>
      <Typography
        sx={{
          fontFamily: 'Inter',
          fontSize: 16,
          fontWeight: 700,
          mb: 2,
          color: '#1F2937',
        }}
      >
        Select time of day
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 1.5,
          maxHeight: '100%',
          overflowY: 'auto',
          pr: 1,
          '&::-webkit-scrollbar': {
            width: '6px',
          },
          '&::-webkit-scrollbar-track': {
            background: '#F3F4F6',
            borderRadius: '10px',
          },
          '&::-webkit-scrollbar-thumb': {
            background: '#D1D5DB',
            borderRadius: '10px',
            '&:hover': {
              background: '#9CA3AF',
            },
          },
        }}
      >
        {slots.map((slot) => {
          const isBooked = bookedSlots.includes(slot);
          const isSelected = selectedTime === slot;

          return (
            <Tooltip
              key={slot}
              title={isBooked ? 'This slot is already booked' : ''}
              arrow
              placement="top"
            >
              <span>
                <Button
                  onClick={() => !isBooked && onTimeSelect(slot)}
                  disabled={isBooked}
                  sx={{
                    p: 1.5,
                    borderRadius: 1.5,
                    border: isSelected
                      ? 'none'
                      : isBooked
                      ? '1px solid #DD0303'
                      : '1px solid #E5E7EB',
                    background: isSelected
                      ? 'linear-gradient(135deg, #41A67E 0%, #41A67E 100%)'
                      : isBooked
                      ? 'linear-gradient(135deg, #FFFFFF 0%, #FFFFFF 50%)'
                      : '#F9FAFB',
                    color: isSelected ? '#fff' : isBooked ? '#CBCBCB' : '#1F2937',
                    fontFamily: 'Inter',
                    fontWeight: isSelected ? 700 : 500,
                    fontSize: 13,
                    textTransform: 'none',
                    transition: 'all .15s ease',
                    boxShadow: isSelected
                      ? '0 4px 12px rgba(102, 126, 234, 0.3)'
                      : 'none',
                    opacity: isBooked ? 0.6 : 1,
                    cursor: isBooked ? 'not-allowed' : 'pointer',
                    position: 'relative',
                    '&:hover': {
                      borderColor: isSelected
                        ? 'transparent'
                        : isBooked
                        ? '#FCA5A5'
                        : '#D4A574',
                      bgcolor: isSelected
                        ? undefined
                        : isBooked
                        ? undefined
                        : '#fff',
                      transform: isBooked ? 'none' : 'scale(1.02)',
                    },
                    '&.Mui-disabled': {
                      color: '#DD0303',
                      opacity: 0.8,
                    },
                  }}
                >
                  {slot}
                </Button>
              </span>
            </Tooltip>
          );
        })}
      </Box>
    </Box>
  );
};


// MAIN BOOKING DIALOG
const BookingSessionDialog = ({ open, onClose, bookingData, onBookingSuccess }) => {
  
  
  
  const [selectedDate, setSelectedDate] = useState(dayjs().add(1, 'day'));
  const [selectedTime, setSelectedTime] = useState(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [isDateFromCalendar, setIsDateFromCalendar] = useState(false);
  const [bookedSlots, setBookedSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [successDialog, setSuccessDialog] = useState({
  open: false,
  bookingDetails: null,
});




  const baseUrl = "/api/usersOn";

  // Load Razorpay script on component mount
  useEffect(() => {
    loadRazorpayScript();
  }, []);

  // Fetch booked slots
  const fetchBookedSlots = async (date) => {
    if (!bookingData?.user_id) return;

    setLoading(true);
    try {
      const response = await axios.get(`${baseUrl}/bookings/available-slots`, {
        params: {
          user_id: bookingData.user_id,
          date: date.format('YYYY-MM-DD'),
        }
      });

      if (response.data.success) {
        setBookedSlots(response.data.bookedSlots || []);
      }
    } catch (error) {
      console.error('Error fetching booked slots:', error);
      setBookedSlots([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && bookingData?.block_id) {
      fetchBookedSlots(selectedDate);
    }
  }, [open]);

  const handleContinue = () => {
    if (!selectedTime) {
      alert('Please select a time slot');
      return;
    }
    setCustomerDialogOpen(true);
  };

  // Helper: close success dialog then close parent
  const handleSuccessClose = () => {
    setSuccessDialog({ open: false, bookingDetails: null });
    onClose();
  };

  // Handle payment with Razorpay
  const handleRazorpayPayment = async (orderData, customerData, bookingId, booking_id) => {
    const options = {
      key: "rzp_live_RbZ0rhbWlR25Cl", // Replace with your actual Razorpay Key ID
      amount: orderData.order.amount,
      currency: orderData.order.currency,
      name: bookingData.title || "Booking Session",
      description: `Session on ${selectedDate.format('DD MMM YYYY')} at ${selectedTime}`,
      order_id: orderData.order.id,
      prefill: {
        name: customerData.name,
        email: customerData.email,
        contact: customerData.mobile,
      },
      theme: {
        color: "#667eea"
      },
      handler: async function (response) {
        // Payment successful - verify on backend
        try {
          const verifyResponse = await axios.post(
            `${baseUrl}/bookings/verify-payment`,
            {
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
              bookingId: bookingId,
              booking_id: booking_id,
              title: bookingData.title

            }
          );

          if (verifyResponse.data.ok) {
            // close details dialog and show success (keep parent mounted)
            setCustomerDialogOpen(false);
            setSuccessDialog({
              open: true,
              bookingDetails: {
                name: customerData.name,
                date: selectedDate.format('ddd, DD MMM YYYY'),
                time: selectedTime,
                email: customerData.email,
              },
            });
          } else {
            // Payment verification failed - booking already deleted by backend
            alert('Payment verification failed. Your slot has been released. Please try again.');
          }
        } catch (error) {
          console.error('Payment verification error:', error);
          // Try to delete booking if it exists
          try {
            await axios.delete(`${baseUrl}/bookings/${bookingId}`);
          } catch (deleteError) {
            console.error('Error cleaning up booking:', deleteError);
          }
          alert('Payment verification failed. Please contact support.');
        } finally {
          setSubmitting(false);
        }
      },
      modal: {
        ondismiss: async function () {
          // Payment cancelled - immediately delete pending booking
          setSubmitting(false);
          
          try {
            const deleteResponse = await axios.delete(`${baseUrl}/bookings/${bookingId}`);
            alert('Payment cancelled. Your slot has been released.');
          } catch (error) {
            console.error('Error deleting cancelled booking:', error);
            alert('Payment cancelled');
          }
        }
      }
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
  };

  // Handle booking submission
const handleBookingSubmit = async (customerData) => {
  setSubmitting(true);

  try {
    // Check if it's a free booking
    if (bookingData.pricing === 0) {
      // Free booking - direct creation
      const response = await axios.post(
        `${baseUrl}/bookings/create`,
        {
          block_id: bookingData.block_id,
          interaction_type: bookingData.interactionType,
          userId: bookingData.user_id,
          title: bookingData.title,
          customer_name: customerData.name,
          customer_mobile: customerData.mobile,
          customer_email: customerData.email,
          selected_date: selectedDate.format('YYYY-MM-DD'),
          selected_timeSlot: selectedTime,
        }
      );

      if (response.data.success) {
        // Close customer dialog
        setCustomerDialogOpen(false);
        
        // Show success dialog (keep parent mounted; do NOT close here)
        setSuccessDialog({
          open: true,
          bookingDetails: {
            name: customerData.name,
            date: selectedDate.format('ddd, DD MMM YYYY'),
            time: selectedTime,
            email: customerData.email,
          },
        });

        // Call onBookingSuccess if provided (optional)
        if (onBookingSuccess) {
          onBookingSuccess({
            name: customerData.name,
            date: selectedDate.format('ddd, DD MMM YYYY'),
            time: selectedTime,
            email: customerData.email,
          });
        }
      }
      setSubmitting(false);
    } else {
      // Paid booking logic remains the same
      const orderResponse = await axios.post(
        `${baseUrl}/bookings/create-order`,
        {
          block_id: bookingData.block_id,
          user_id: bookingData.user_id,
          customer_name: customerData.name,
          customer_mobile: customerData.mobile,
          customer_email: customerData.email,
          selected_date: selectedDate.format('YYYY-MM-DD'),
          selected_timeSlot: selectedTime,
        }
      );

      if (orderResponse.data.order && orderResponse.data.bookingId) {
        handleRazorpayPayment(orderResponse.data, customerData, orderResponse.data.bookingId, orderResponse.data.booking_id);
      }
    }
  } catch (error) {
    console.error('Booking error:', error);
    const errorMsg = error?.response?.data?.error || 'Failed to create booking. Please try again.';
    
    if (error?.response?.data?.bookingId) {
      try {
        await axios.delete(`${baseUrl}/bookings/${error.response.data.bookingId}`);
      } catch (deleteError) {
        console.error('Error cleaning up failed booking:', deleteError);
      }
    }
    
    alert(errorMsg);
    setSubmitting(false);
  }
};




  const handleCalendarDateSelect = (date) => {
    setSelectedDate(date);
    setSelectedTime(null);
    setIsDateFromCalendar(true);
    fetchBookedSlots(date);
  };

  const handleQuickDateSelect = (date) => {
    setSelectedDate(date);
    setSelectedTime(null);
    setIsDateFromCalendar(false);
    fetchBookedSlots(date);
  };

  const handleOpenCalendar = () => {
    setCalendarOpen(true);
  };

  const isMeetingType = bookingData.interactionType === 'voice'
    ? 'Voice Meeting'
    : 'Video Meeting';

  return (
    <>
      <Dialog 
        open={open} 
        onClose={onClose} 
        fullWidth 
        maxWidth="sm"
        fullScreen={window.innerWidth < 600}
        keepMounted
      >
        <Box sx={{ position: 'absolute', top: 16, right: 16, zIndex: 1 }}>
          <IconButton onClick={onClose} size="small" sx={{ color: '#FFFFFF' }}>
            <CloseIcon />
          </IconButton>
        </Box>

        <Box
          sx={{
            background: 'linear-gradient(135deg, #70B2B2 0%, #313647 100%)',
            px: 2,
            pt: 5,
            color: '#fff',
            textAlign: 'center',
          }}
        >
          <Typography
            sx={{
              fontFamily: 'Inter',
              fontSize: { xs: 20, sm: 20 },
              fontWeight: 600,
              textAlign: 'left',
              mb: 1,
            }}
          >
            {bookingData.title || '1:1 Booking'}
          </Typography>
        </Box>

        <DialogContent sx={{ p: 3 }}>
          <Stack spacing={3}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'space-between' }}>
              <Box
                sx={{
                  px: 2,
                  py: 1,
                  borderRadius: 1,
                  background: '#1F2937',
                  display: 'flex',
                  flexDirection: 'row',
                  gap: 0.5,
                  alignItems: 'center'
                }}
              >
                {bookingData.pricing != 0 ? (
                  <>
                    <CurrencyRupee sx={{ fontSize: '16px', color: '#FFFFFF' }} />
                    <Typography sx={{ fontFamily: 'Inter', fontSize: '16px', fontWeight: 500, color: '#FFFFFF' }}>
                      {bookingData.pricing}
                    </Typography>
                  </>
                ) : (
                  <Typography sx={{ fontFamily: 'Inter', fontSize: '16px', fontWeight: 500, color: '#FFFFFF' }}>
                    FREE
                  </Typography>
                )}
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <WatchLaterIcon sx={{ fontSize: 20, color: '#6B7280' }} />
                <Typography sx={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 500 }}>
                  {bookingData.duration || 30} Mins • {isMeetingType}
                </Typography>
              </Box>
            </Box>

            {bookingData.description && (
              <Typography
                sx={{
                  fontFamily: 'Inter',
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: '#4B5563',
                }}
              >
                {bookingData.description}
              </Typography>
            )}

            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography
                  sx={{
                    fontFamily: 'Inter',
                    fontSize: 16,
                    fontWeight: 700,
                    color: '#1F2937',
                  }}
                >
                  Book your session
                </Typography>
                <CalendarMonthIcon  
                  onClick={handleOpenCalendar}
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 1.5,
                    cursor: 'pointer',
                    color: '#6B7280',
                    transition: 'all .15s ease',
                    '&:hover': {
                      borderColor: '#D4A574',
                      bgcolor: alpha('#D4A574', 0.08),
                    },
                  }} 
                />
              </Box>

              <DateButtons
                selectedDate={selectedDate}
                onDateChange={handleQuickDateSelect}
                isDateFromCalendar={isDateFromCalendar}
                onOpenCalendar={handleOpenCalendar}
              />
            </Box>

            <TimeSlots
              selectedTime={selectedTime}
              onTimeSelect={setSelectedTime}
              bookedSlots={bookedSlots}
              loading={loading}
              bufferTime={bookingData.buffer_time}
              sessionDuration={bookingData.duration}
            />

            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                background: selectedTime
                  ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.08) 0%, rgba(118, 75, 162, 0.08) 100%)'
                  : '#F3F4F6',
                border: selectedTime ? '1px solid #D4A574' : 'none',
                fontFamily: 'Inter',
                fontSize: 14,
                color: '#6B7280',
              }}
            >
              <Typography sx={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 400, mb: 0.5 }}>
                {selectedTime ? 'Selected Slot' : 'Next available'}
              </Typography>
              <Typography
                sx={{
                  fontFamily: 'Inter',
                  fontSize: 15,
                  fontWeight: 600,
                  color: '#1F2937',
                  background: selectedTime
                    ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                    : 'transparent',
                  backgroundClip: selectedTime ? 'text' : 'unset',
                  WebkitBackgroundClip: selectedTime ? 'text' : 'unset',
                  WebkitTextFillColor: selectedTime ? 'transparent' : '#1F2937',
                }}
              >
                {selectedDate.format('ddd, DD MMM')} at {selectedTime || '10:00 AM'}
              </Typography>
            </Box>

            <Button
              onClick={handleContinue}
              fullWidth
              sx={{
                py: 1.75,
                borderRadius: 2,
                background: 'linear-gradient(135deg, #1F2937 0%, #111827 100%)',
                color: '#fff',
                fontFamily: 'Inter',
                fontWeight: 600,
                fontSize: 15,
                textTransform: 'none',
                transition: 'all .2s ease',
                '&:hover': {
                  transform: 'scale(1.02)',
                  boxShadow: '0 8px 20px rgba(31, 41, 55, 0.3)',
                },
              }}
            >
              Continue
            </Button>
          </Stack>
        </DialogContent>
      </Dialog>

      <CalendarDialog
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        selectedDate={selectedDate}
        onDateSelect={handleCalendarDateSelect}
      />

   <CustomerDetailsDialog
      open={customerDialogOpen}
      onClose={() => setCustomerDialogOpen(false)}
      selectedDate={selectedDate}
      selectedTime={selectedTime}
      onSubmit={handleBookingSubmit}
      submitting={submitting}
      bookingData={bookingData}
    />

    {/* Add this - Success Dialog */}
    <BookingSuccessDialog
      open={successDialog.open}
      onClose={handleSuccessClose}
      bookingDetails={successDialog.bookingDetails}
    />


    </>
  );
};

export default BookingSessionDialog;

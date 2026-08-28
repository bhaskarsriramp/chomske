// BookingSuccessDialog.jsx (separate file)
import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  Stack,
  Divider,
  alpha,
  useTheme,
} from '@mui/material';
import {
  CheckCircle,
  Person,
  CalendarMonth,
  CheckCircleOutline,
} from '@mui/icons-material';

const BookingSuccessDialog = ({ open, onClose, bookingDetails }) => {
  const theme = useTheme();
  
  if (!bookingDetails) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          overflow: 'hidden',
        }
      }}
    >
      {/* Success Header */}
      <Box
        sx={{
          bgcolor: alpha(theme.palette.success.main, 0.1),
          py: 4,
          px: 2,
          textAlign: 'center',
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Box
          sx={{
            width: 66,
            height: 66,
            borderRadius: '50%',
            bgcolor: theme.palette.success.main,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 2,
            animation: 'scaleIn 0.3s ease-out',
            '@keyframes scaleIn': {
              '0%': { transform: 'scale(0)' },
              '50%': { transform: 'scale(1.1)' },
              '100%': { transform: 'scale(1)' },
            },
          }}
        >
          <CheckCircle sx={{ fontSize: 34, color: 'white' }} />
        </Box>
        <Typography
          sx={{
            fontFamily: 'Inter',
            fontSize: '22px',
            fontWeight: 700,
            color: theme.palette.success.main,
            mb: 1,
          }}
        >
          Booking Confirmed!
        </Typography>
        <Typography
          variant="body2"
          sx={{
            fontFamily: 'Inter',
            color: theme.palette.text.secondary,
          }}
        >
          Your booking has been successfully confirmed
        </Typography>
      </Box>

      {/* Booking Details */}
      <DialogContent sx={{ p: 3 }}>
        <Stack spacing={2.5}>
          {/* Customer Name */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Person sx={{ fontSize: 20, color: theme.palette.primary.main }} />
              <Typography
                variant="caption"
                sx={{
                  fontFamily: 'Inter',
                  fontWeight: 600,
                  color: theme.palette.text.secondary,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Name
              </Typography>
            </Box>
            <Typography
              variant="body1"
              sx={{
                fontFamily: 'Inter',
                fontWeight: 600,
                color: theme.palette.text.primary,
                pl: 3.5,
              }}
            >
              {bookingDetails.name}
            </Typography>
          </Box>

          <Divider />

          {/* Date & Time */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <CalendarMonth sx={{ fontSize: 20, color: theme.palette.primary.main }} />
              <Typography
                variant="caption"
                sx={{
                  fontFamily: 'Inter',
                  fontWeight: 600,
                  color: theme.palette.text.secondary,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Date & Time
              </Typography>
            </Box>
            <Typography
              variant="body1"
              sx={{
                fontFamily: 'Inter',
                fontWeight: 600,
                color: theme.palette.text.primary,
                pl: 3.5,
              }}
            >
              {bookingDetails.date}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                fontFamily: 'Inter',
                color: theme.palette.text.secondary,
                pl: 3.5,
                mt: 0.5,
              }}
            >
              {bookingDetails.time}
            </Typography>
          </Box>

          <Divider />

          {/* Email Confirmation */}
          <Box
            sx={{
              bgcolor: alpha(theme.palette.info.main, 0.05),
              px: 1,
              py: 2,
              borderRadius: 2,
              border: `1px dashed ${alpha(theme.palette.info.main, 0.3)}`,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 1.5,
                  bgcolor: alpha(theme.palette.info.main, 0.1),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <CheckCircleOutline sx={{ fontSize: 20, color: theme.palette.info.main }} />
              </Box>
              <Box>
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: 'Inter',
                    fontWeight: 600,
                    color: theme.palette.text.primary,
                    mb: 0.5,
                  }}
                >
                  Confirmation Email Sent
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    fontFamily: 'Inter',
                    color: theme.palette.text.secondary,
                    display: 'block',
                  }}
                >
                  A confirmation email has been sent to{' '}
                  <strong>{bookingDetails.email}</strong>
                </Typography>
              </Box>
            </Box>
          </Box>
        </Stack>
      </DialogContent>

      {/* Actions */}
      <DialogActions
        sx={{
          px: 3,
          pb: 3,
          gap: 1,
          flexDirection: { xs: 'column', sm: 'row' },
        }}
      >
       
        <Button
          fullWidth
          variant="contained"
          onClick={onClose}
          sx={{
            textTransform: 'none',
            fontFamily: 'Inter',
            fontWeight: 600,
            py: 1.5,
            borderRadius: 2,
            background: '#5D866C',

          }}
        >
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BookingSuccessDialog;

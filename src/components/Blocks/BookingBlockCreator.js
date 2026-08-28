import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Stack,
  Box,
  Typography,
  Paper,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  InputAdornment,
  CircularProgress,
  useTheme,
  useMediaQuery,
  IconButton,
  alpha,
} from '@mui/material';
import {
  CalendarMonth as CalendarIcon,
  AccessTime as TimeIcon,
  VideoCall as VideoIcon,
  Phone as PhoneIcon,
  CurrencyRupee as RupeeIcon,
  Save as SaveIcon,
  Event as EventIcon,
  ArrowForwardIos as ArrowForwardIosIcon,
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';

const PrimaryBtn = styled('button')(({ theme }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  border: 'none',
  cursor: 'pointer',
  padding: '10px 16px',
  borderRadius: 6,
  color: '#fff',
  fontWeight: 700,
  background: '#077A7D',
  transition: 'transform .12s ease, box-shadow .12s ease',
  fontSize: 14,
  textTransform: 'none',
  [theme.breakpoints.down('sm')]: {
    width: '100%',
    justifyContent: 'center',
    padding: '12px 14px',
  },
}));

// Helper function to truncate text
const truncate = (str = "", max = 100) => {
  if (!str) return "";
  if (str.length <= max) return str;
  const slice = str.slice(0, max);
  const cutAt = slice.lastIndexOf(" ");
  const safe = cutAt > max * 0.6 ? slice.slice(0, cutAt) : slice;
  return safe.replace(/[.,;:!?-]+$/, "").trimEnd() + "...";
};

const MAX_TITLE = 40;
const MAX_DESC = 90;

const BookingBlockCreator = ({ open, onClose, onSave }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(30);
  const [bufferTime, setBufferTime] = useState(0);
  const [interactionType, setInteractionType] = useState('voice');
  const [pricing, setPricing] = useState(0);
  const [saving, setSaving] = useState(false);

  const durationOptions = [15, 30, 45, 60, 90, 120];
  const bufferOptions = [0, 5, 10, 15, 30];

  const handleSave = async () => {
    if (!name.trim()) return;

    setSaving(true);
    try {
      await onSave({
        type: 'booking',
        name: name.trim(),
        description: description.trim(),
        duration,
        bufferTime,
        interactionType,
        pricing,
      });
      
      // Reset form
      setName('');
      setDescription('');
      setDuration(30);
      setBufferTime(0);
      setInteractionType('voice');
      setPricing(0);
    } catch (error) {
      console.error('Error saving booking:', error);
    } finally {
      setSaving(false);
    }
  };

  const isMeetingType = interactionType === "voice" ? "Voice Meeting" : "Video Meeting";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      fullScreen={fullScreen}
    >
      <DialogTitle sx={{ fontFamily: 'Inter', fontSize: '18px', fontWeight: 600 }}>
        Create Booking Block
      </DialogTitle>

      <DialogContent>
        <Stack spacing={3} mt={1}>
          {/* Session Name */}
          <TextField
            fullWidth
            label="Session Name"
            placeholder="e.g., 1-on-1 Consultation, Career Coaching"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          {/* Description */}
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Description"
            placeholder="Describe what this session is about..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          {/* Duration and Buffer Time */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <FormControl fullWidth>
              <InputLabel>Duration</InputLabel>
              <Select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                label="Duration"
                startAdornment={
                  <InputAdornment position="start">
                    <TimeIcon fontSize="small" />
                  </InputAdornment>
                }
              >
                {durationOptions.map((min) => (
                  <MenuItem key={min} value={min}>
                    {min} minutes
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>Buffer Time</InputLabel>
              <Select
                value={bufferTime}
                onChange={(e) => setBufferTime(e.target.value)}
                label="Buffer Time"
                startAdornment={
                  <InputAdornment position="start">
                    <TimeIcon fontSize="small" />
                  </InputAdornment>
                }
              >
                {bufferOptions.map((min) => (
                  <MenuItem key={min} value={min}>
                    {min === 0 ? 'No buffer' : `${min} minutes`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

             <FormControl fullWidth>
              <InputLabel>Session Type</InputLabel>
              <Select
                value={interactionType}
                onChange={(e) => setInteractionType(e.target.value)}
                label="Session Type"
              >
                <MenuItem value="voice">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PhoneIcon fontSize="small" />
                    <span>Voice Call</span>
                  </Box>
                </MenuItem>
                <MenuItem value="video">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <VideoIcon fontSize="small" />
                    <span>Video Call</span>
                  </Box>
                </MenuItem>
              </Select>
            </FormControl>


          </Stack>

          {/* Interaction Type and Pricing */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            {/* <FormControl fullWidth>
              <InputLabel>Session Type</InputLabel>
              <Select
                value={interactionType}
                onChange={(e) => setInteractionType(e.target.value)}
                label="Session Type"
              >
                <MenuItem value="voice">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PhoneIcon fontSize="small" />
                    <span>Voice Call</span>
                  </Box>
                </MenuItem>
                <MenuItem value="video">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <VideoIcon fontSize="small" />
                    <span>Video Call</span>
                  </Box>
                </MenuItem>
              </Select>
            </FormControl> */}

            {/* <TextField
              fullWidth
              type="number"
              label="Pricing"
              placeholder="0"
              value={pricing}
              onChange={(e) => setPricing(Math.max(0, parseInt(e.target.value) || 0))}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <RupeeIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            /> */}
          </Stack>

          {/* Preview - MATCHING renderPreviewBlock style */}
          <Box>
            <Typography variant="overline" sx={{ opacity: 0.7, display: 'block', mb: 1 }}>
              Preview
            </Typography>
            <Paper
              elevation={0}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1.5,
                p: 1.25,
                borderRadius: 2,
                bgcolor: "#fff",
                boxShadow: "0 10px 30px rgba(2,6,23,0.12)",
                cursor: "pointer",
                transition: "transform .12s ease, box-shadow .12s ease",
                "&:hover": {
                  transform: "translateY(-2px)",
                  boxShadow: "0 12px 30px rgba(2,6,23,0.16)",
                },
              }}
            >
              {/* Left: Icon + Title + Description */}
              <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.25, minWidth: 0, flex: 1 }}>
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: 1.25,
                    display: "grid",
                    placeItems: "center",
                    bgcolor: alpha("#3b82f6", 0.06),
                    color: "#3b82f6",
                    flexShrink: 0,
                  }}
                >
                  <EventIcon sx={{ fontSize: 18 }} />
                </Box>

                <Box sx={{ display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0, flex: 1 }}>
                  {/* Title */}
                  <Typography
                    sx={{
                      fontFamily: "Inter",
                      fontWeight: 600,
                      fontSize: 15,
                      mb: 0.25,
                    }}
                  >
                    {truncate(name || "1:1 Booking", MAX_TITLE)}
                  </Typography>

                  {/* Description */}
                  {description && (
                    <Typography
                      sx={{
                        fontFamily: "Inter",
                        fontSize: 12,
                        color: "#9CA3AF",
                        mt: 0.25,
                      }}
                    >
                      {truncate(description, MAX_DESC)}
                    </Typography>
                  )}

                  {/* Duration + Meeting Type */}
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
                    <Typography
                      sx={{
                        fontFamily: "Inter",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#6B7280",
                      }}
                    >
                      {duration || 30} mins
                    </Typography>
                    <Box sx={{ width: 4, height: 4, borderRadius: "50%", bgcolor: "#D1D5DB" }} />
                    <Typography
                      sx={{
                        fontFamily: "Inter",
                        fontSize: 12,
                        fontWeight: 400,
                        color: "#6B7280",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isMeetingType}
                    </Typography>
                  </Box>
                </Box>
              </Box>

              {/* Right: Action Button */}
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
                <IconButton
                  aria-label="open booking"
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: 1,
                    bgcolor: alpha("#3b82f6", 0.06),
                    color: "#3b82f6",
                    "&:hover": { bgcolor: alpha("#3b82f6", 0.14) },
                  }}
                  size="small"
                >
                  <ArrowForwardIosIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Box>
            </Paper>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ gap: 1, p: 2 }}>
        <button
          onClick={onClose}
          style={{
            border: 'none',
            background: 'transparent',
            padding: '8px 12px',
            borderRadius: 8,
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          Cancel
        </button>

        <PrimaryBtn onClick={handleSave} disabled={!name.trim() || saving}>
          {saving ? <CircularProgress size={18} /> : <SaveIcon />}
          <span style={{ marginLeft: 6 }}>{saving ? 'Saving...' : 'Save'}</span>
        </PrimaryBtn>
      </DialogActions>
    </Dialog>
  );
};

export default BookingBlockCreator;

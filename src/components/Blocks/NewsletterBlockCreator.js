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
  CircularProgress,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  MailOutlined as MailIcon,
  Save as SaveIcon,
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

const NewsletterBlockCreator = ({ open, onClose, onSave }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  
  const [newsletterText, setNewsletterText] = useState('Subscribe to Newsletter');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!newsletterText.trim()) return;

    setSaving(true);
    try {
      await onSave({
        type: 'newsletter',
        name: newsletterText.trim(),
        newsletterText: newsletterText.trim(),
      });
      
      setNewsletterText('Subscribe to Newsletter');
    } catch (error) {
      console.error('Error saving newsletter:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      fullScreen={fullScreen}
    >
      <DialogTitle sx={{ fontFamily: 'Inter', fontSize: '18px', fontWeight: 600 }}>
        Create Newsletter Block
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2} mt={1}>
          <TextField
            fullWidth
            label="Newsletter Title"
            placeholder="Subscribe to Newsletter"
            value={newsletterText}
            onChange={(e) => setNewsletterText(e.target.value)}
          />

          {/* Preview */}
          <Box>
            <Typography variant="overline" sx={{ opacity: 0.7, display: 'block', mb: 1 }}>
              Preview
            </Typography>
            <Paper
              elevation={0}
              sx={{
                borderRadius: 2,
                border: (t) => `1px solid ${t.palette.divider}`,
                p: 2,
              }}
            >
              <Stack spacing={1.5}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: 1.5,
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: '#F3F4F6',
                    }}
                  >
                    <MailIcon sx={{ fontSize: 18, color: '#1F2937' }} />
                  </Box>
                  <Typography variant="subtitle2">
                    {newsletterText || 'Subscribe to Newsletter'}
                  </Typography>
                </Box>

                <TextField
                  fullWidth
                  label="Your Email"
                  placeholder="your@email.com"
                  disabled
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                    },
                  }}
                />
              </Stack>
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

        <PrimaryBtn onClick={handleSave} disabled={!newsletterText.trim() || saving}>
          {saving ? <CircularProgress size={18} /> : <SaveIcon />}
          <span style={{ marginLeft: 6 }}>{saving ? 'Saving...' : 'Save'}</span>
        </PrimaryBtn>
      </DialogActions>
    </Dialog>
  );
};

export default NewsletterBlockCreator;

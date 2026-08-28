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
  IconButton,
  CircularProgress,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Link as LinkIcon,
  ChevronRightRounded as ChevronRightIcon,
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

const LinkBlockCreator = ({ open, onClose, onSave }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !url.trim()) return;

    setSaving(true);
    try {
      await onSave({
        type: 'link',
        name: name.trim(),
        action: url.trim(),
      });
      
      // Reset form
      setName('');
      setUrl('');
    } catch (error) {
      console.error('Error saving link:', error);
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
        Create Link Block
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2} mt={1}>
          <TextField
            fullWidth
            label="Link Title"
            placeholder="e.g., My Portfolio, Contact Me"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <TextField
            fullWidth
            label="URL"
            placeholder="https://your-website.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            type="url"
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
                p: 1,
              }}
            >
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: 2,
                    display: 'grid',
                    placeItems: 'center',
                    bgcolor: '#eef2ff',
                  }}
                >
                  <LinkIcon fontSize="small" />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2" noWrap>
                    {name || 'Link title'}
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.7 }} noWrap>
                    {url || 'https://your-link.com'}
                  </Typography>
                </Box>
                <IconButton size="small">
                  <ChevronRightIcon />
                </IconButton>
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

        <PrimaryBtn onClick={handleSave} disabled={!name.trim() || !url.trim() || saving}>
          {saving ? <CircularProgress size={18} /> : <SaveIcon />}
          <span style={{ marginLeft: 6 }}>{saving ? 'Saving...' : 'Save'}</span>
        </PrimaryBtn>
      </DialogActions>
    </Dialog>
  );
};

export default LinkBlockCreator;

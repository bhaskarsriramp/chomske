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
  Divider,
  IconButton,
  CircularProgress,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Movie as MovieIcon,
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

const VideoBlockCreator = ({ open, onClose, onSave }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const getYouTubeId = (url) => {
    if (!url) return null;
    try {
      const u = new URL(url);
      if (u.hostname.includes('youtube.com')) return u.searchParams.get('v');
      if (u.hostname === 'youtu.be') return u.pathname.slice(1);
    } catch (e) {
      return null;
    }
    return null;
  };

  const renderYouTubePreview = (url) => {
    const id = getYouTubeId(url);
    if (!id) {
      return (
        <Box sx={{ p: 2 }}>
          <Typography variant="body2" sx={{ opacity: 0.75, fontSize: 13 }}>
            Paste a YouTube URL (e.g., https://youtu.be/xxxx or https://www.youtube.com/watch?v=xxxx)
          </Typography>
        </Box>
      );
    }

    const src = `https://www.youtube.com/embed/${id}`;
    return (
      <Box sx={{ position: 'relative', pt: '56.25%' }}>
        <iframe
          title="youtube-preview"
          src={src}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            borderRadius: 8,
          }}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </Box>
    );
  };

  const handleSave = async () => {
    if (!name.trim() || !url.trim()) return;

    setSaving(true);
    try {
      await onSave({
        type: 'video',
        name: name.trim(),
        action: url.trim(),
      });
      
      setName('');
      setUrl('');
    } catch (error) {
      console.error('Error saving video:', error);
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
        Create Video Block
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2} mt={1}>
          <TextField
            fullWidth
            label="Video Name"
            placeholder="e.g., Product Demo, Tutorial"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <TextField
            fullWidth
            label="YouTube URL"
            placeholder="https://youtu.be/xxxx or https://www.youtube.com/watch?v=xxxx"
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
                overflow: 'hidden',
              }}
            >
              {renderYouTubePreview(url)}

              <Divider />

              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ p: 1 }}>
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
                  <MovieIcon fontSize="small" />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2" noWrap>
                    {name || 'Video title'}
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.7 }} noWrap>
                    {url || 'Paste a YouTube URL'}
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

export default VideoBlockCreator;

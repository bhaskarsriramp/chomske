import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Collapse,
  Container,
  Divider,
  IconButton,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import api from '../services/api';

function ReadOnlyGuide() {
  const [open, setOpen] = useState(false);

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
      <Box
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1, cursor: 'pointer' }}
        onClick={() => setOpen((v) => !v)}
      >
        <Typography variant="caption" fontWeight={600} color="primary">
          How to create a safe read-only user (recommended)
        </Typography>
        <IconButton size="small">{open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}</IconButton>
      </Box>

      <Collapse in={open}>
        <Divider />
        <Box sx={{ px: 2, py: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            A read-only user <strong>cannot write, delete, or modify anything</strong> — safe to share.
          </Typography>

          {[
            { step: '1', text: 'Atlas → Security → Database & Network Access (left sidebar)' },
            { step: '2', text: 'Click "Database Access" tab → "+ Add New Database User"' },
            { step: '3', text: 'Authentication: Password. Username: founderdb_readonly' },
            { step: '4', text: 'Built-in Role: select "Read Any Database"' },
            { step: '5', text: 'Click "Add User" and copy the password' },
            { step: '6', text: 'Your URI → Atlas → Clusters → Connect → "Connect your application" → copy the URI, replace <password> and add your database name at the end' },
          ].map(({ step, text }) => (
            <Box key={step} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
              <Box
                sx={{
                  minWidth: 22, height: 22, borderRadius: '50%',
                  bgcolor: 'primary.main', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', mt: 0.1,
                }}
              >
                <Typography variant="caption" fontWeight={700} color="white" fontSize={10}>
                  {step}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                {text}
              </Typography>
            </Box>
          ))}

          <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 1.5, mt: 0.5 }}>
            <Typography variant="caption" fontFamily="monospace" color="text.secondary">
              mongodb+srv://founderdb_readonly:PASS@cluster0.xyz.mongodb.net/<strong>mydbname</strong>
            </Typography>
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}

export default function ConnectDB() {
  const [mongoUri, setMongoUri] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleConnect = async () => {
    if (!mongoUri.trim()) { setError('Please enter a MongoDB URI.'); return; }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/connect', {
        mongoUri: mongoUri.trim(),
        ...(websiteUrl.trim() && { websiteUrl: websiteUrl.trim() }),
      });
      if (data.autoConfirmed) {
        localStorage.setItem('mh_session_id', data.sessionId);
        localStorage.setItem('mh_product_summary', data.productSummary || '');
        navigate('/feed');
      } else {
        navigate('/confirm', { state: data });
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Connection failed. Check your URI and try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadingText = websiteUrl.trim()
    ? 'Analyzing your website and database…'
    : 'Analyzing your database…';

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Paper elevation={3} sx={{ p: { xs: 3, sm: 5 }, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h4" fontWeight={700} gutterBottom>FounderDB</Typography>
          <Typography variant="body2" color="text.secondary">
            Connect your MongoDB and get instant SaaS insights — no analytics setup required.
          </Typography>
        </Box>

        <ReadOnlyGuide />

        <TextField
          label="Website URL"
          fullWidth
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          disabled={loading}
          placeholder="https://myhandle.in"
          autoComplete="off"
          helperText="Optional — helps AI understand your product and map collections automatically"
        />

        <TextField
          label="MongoDB URI"
          type="password"
          fullWidth
          value={mongoUri}
          onChange={(e) => setMongoUri(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !loading && handleConnect()}
          disabled={loading}
          placeholder="mongodb+srv://founderdb_readonly:pass@cluster0.xyz.mongodb.net/myapp"
          autoComplete="off"
        />

        {error && <Alert severity="error">{error}</Alert>}

        {loading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center', py: 1 }}>
            <CircularProgress size={22} />
            <Typography color="text.secondary">{loadingText}</Typography>
          </Box>
        ) : (
          <Button
            variant="contained"
            size="large"
            fullWidth
            onClick={handleConnect}
            disabled={!mongoUri.trim()}
            sx={{ py: 1.5, fontWeight: 600 }}
          >
            Connect &amp; Analyze
          </Button>
        )}

        <Divider />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center' }}>
          <LockOutlinedIcon sx={{ fontSize: 15, color: 'text.disabled' }} />
          <Typography variant="caption" color="text.disabled">
            Read-only access. Field names sampled only — never actual data values.
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
}

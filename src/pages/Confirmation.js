import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Typography,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import api from '../services/api';

// The four semantic roles we always display
const ROLES = [
  { key: 'users', label: 'Users / Accounts' },
  { key: 'subscriptions', label: 'Subscriptions / Plans' },
  { key: 'events', label: 'Events / Activity' },
  { key: 'payments', label: 'Payments' },
];

const CONFIDENCE_COLOR = {
  high: 'success',
  medium: 'warning',
  low: 'error',
};

export default function Confirmation() {
  const { state } = useLocation();
  const navigate = useNavigate();

  const [corrections, setCorrections] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Guard: if someone lands here without state, send them back
  if (!state) {
    navigate('/');
    return null;
  }

  const { sessionId, semanticMap, allCollections, productSummary } = state;

  const handleCorrection = (role, value) => {
    setCorrections((prev) => ({ ...prev, [role]: value }));
  };

  const handleConfirm = async () => {
    setLoading(true);
    setError('');
    try {
      await api.post('/confirm', { sessionId, corrections });
      localStorage.setItem('mh_session_id', sessionId);
      localStorage.setItem('mh_product_summary', productSummary || '');
      navigate('/feed');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ mt: 6, mb: 8 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          What AI Found
        </Typography>
        <Typography color="text.secondary">
          AI mapped your collections to their semantic roles. Correct any mismatches below,
          then confirm to start monitoring.
        </Typography>
      </Box>

      {/* Product summary */}
      {productSummary && (
        <Paper elevation={0} sx={{ p: 2.5, mb: 3, bgcolor: 'action.hover', borderRadius: 2, borderLeft: '4px solid', borderColor: 'primary.main' }}>
          <Typography variant="caption" color="primary" fontWeight={700} sx={{ display: 'block', mb: 0.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Your Product
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
            {productSummary}
          </Typography>
        </Paper>
      )}

      {/* Role rows */}
      {ROLES.map(({ key, label }) => {
        const info = semanticMap[key] || {};
        const confidence = info.confidence;
        // Use founder correction if provided, otherwise fall back to Claude's guess
        const activeCollection = corrections[key] ?? info.collection;
        const needsDropdown = confidence === 'medium' || confidence === 'low' || !info.collection;

        return (
          <Paper key={key} elevation={2} sx={{ p: 3, mb: 2 }}>
            {/* Role title + confidence badge */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
              <Typography variant="h6" fontWeight={600}>
                {label}
              </Typography>
              {confidence && (
                <Chip
                  label={confidence}
                  color={CONFIDENCE_COLOR[confidence] || 'default'}
                  size="small"
                  sx={{ textTransform: 'capitalize', fontWeight: 600 }}
                />
              )}
              {!confidence && (
                <Chip label="not found" color="default" size="small" />
              )}
            </Box>

            {/* Collection selector or display */}
            {needsDropdown ? (
              <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
                <InputLabel>Select collection</InputLabel>
                <Select
                  value={activeCollection || ''}
                  label="Select collection"
                  onChange={(e) => handleCorrection(key, e.target.value)}
                >
                  <MenuItem value="">
                    <em>None</em>
                  </MenuItem>
                  {allCollections.map((col) => (
                    <MenuItem key={col} value={col}>
                      {col}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Collection:{' '}
                <Box component="span" fontWeight={600} color="text.primary">
                  {activeCollection || '—'}
                </Box>
                {corrections[key] && (
                  <Chip
                    label="corrected"
                    size="small"
                    color="info"
                    sx={{ ml: 1, fontSize: '0.65rem' }}
                  />
                )}
              </Typography>
            )}

            {/* Key fields */}
            {info.keyFields?.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {info.keyFields.map((field) => (
                  <Chip
                    key={field}
                    label={field}
                    size="small"
                    variant="outlined"
                    sx={{ fontFamily: 'monospace', fontSize: '0.72rem' }}
                  />
                ))}
              </Box>
            )}

            {/* Reasoning tooltip */}
            {info.reasoning && (
              <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
                {info.reasoning}
              </Typography>
            )}
          </Paper>
        );
      })}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Confirm button */}
      <Button
        variant="contained"
        size="large"
        fullWidth
        onClick={handleConfirm}
        disabled={loading}
        startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <CheckCircleOutlineIcon />}
        sx={{ mt: 1, py: 1.5, fontWeight: 600 }}
      >
        {loading ? 'Saving…' : 'Looks Good — Start Monitoring'}
      </Button>
    </Container>
  );
}

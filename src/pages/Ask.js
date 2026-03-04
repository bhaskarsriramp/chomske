import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Container,
  IconButton,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SendIcon from '@mui/icons-material/Send';
import CodeIcon from '@mui/icons-material/Code';
import PsychologyIcon from '@mui/icons-material/Psychology';
import api from '../services/api';

const SUGGESTED_QUESTIONS = [
  'How many users signed up last month?',
  'Which plan do most paid users subscribe to?',
  'How many users upgraded from free to paid this month?',
  'How many active subscriptions do I have right now?',
  'Which collections have the most documents?',
  'Show me users who signed up but never paid',
];

// ─── Understanding pill ───────────────────────────────────────────────────────

function UnderstandingPill({ text }) {
  if (!text) return null;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
      <PsychologyIcon sx={{ fontSize: 14, color: 'primary.main' }} />
      <Typography variant="caption" color="primary" sx={{ fontStyle: 'italic' }}>
        {text}
      </Typography>
    </Box>
  );
}

// ─── Results viewer ────────────────────────────────────────────────────────────

function formatDocValue(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') {
    if (v.$oid) return String(v.$oid);
    if (v.$date) return new Date(v.$date).toLocaleDateString();
    return null; // skip complex nested objects / arrays
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    return new Date(v).toLocaleDateString();
  }
  const s = String(v);
  return s.length > 100 ? s.slice(0, 100) + '…' : s;
}

function ResultsViewer({ results }) {
  const [showAll, setShowAll] = useState(false);
  if (!results?.length) return null;

  // Pure $count result e.g. [{ total: 42 }] — already shown in count chip, skip
  if (results.length === 1 && 'total' in results[0] && Object.keys(results[0]).length === 1) return null;

  const SKIP = new Set(['__v', '_id']);
  const visible = showAll ? results : results.slice(0, 3);
  const hidden  = results.length - visible.length;

  return (
    <Box sx={{ mt: 1.5 }}>
      {visible.map((doc, i) => {
        const rows = Object.entries(doc)
          .filter(([k]) => !SKIP.has(k))
          .map(([k, v]) => [k, formatDocValue(v)])
          .filter(([, v]) => v !== null)
          .slice(0, 12);
        if (rows.length === 0) return null;
        return (
          <Paper key={i} variant="outlined" sx={{ p: 1.5, mb: 1, borderRadius: 1.5 }}>
            {rows.map(([k, v]) => (
              <Box key={k} sx={{ display: 'flex', gap: 1.5, mb: 0.4 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontFamily: 'monospace', minWidth: 120, flexShrink: 0, fontSize: '0.7rem' }}
                >
                  {k}
                </Typography>
                <Typography variant="caption" color="text.primary" sx={{ wordBreak: 'break-word', fontSize: '0.78rem' }}>
                  {v}
                </Typography>
              </Box>
            ))}
          </Paper>
        );
      })}
      {hidden > 0 && !showAll && (
        <Typography
          variant="caption"
          color="primary"
          sx={{ cursor: 'pointer', display: 'block', mt: 0.25 }}
          onClick={() => setShowAll(true)}
        >
          Show {hidden} more result{hidden !== 1 ? 's' : ''}
        </Typography>
      )}
    </Box>
  );
}

// ─── Query code viewer ────────────────────────────────────────────────────────

function QueryViewer({ collection, pipeline }) {
  const [open, setOpen] = useState(false);
  if (!pipeline?.length) return null;

  return (
    <Box sx={{ mt: 1 }}>
      <Chip
        icon={<CodeIcon fontSize="small" />}
        label={open ? 'Hide query' : 'Show query'}
        size="small"
        variant="outlined"
        onClick={() => setOpen((v) => !v)}
        sx={{ cursor: 'pointer', fontSize: '0.7rem' }}
      />
      <Collapse in={open}>
        <Box
          sx={{
            mt: 1,
            p: 1.5,
            bgcolor: 'action.hover',
            borderRadius: 1,
            fontFamily: 'monospace',
            fontSize: '0.72rem',
            color: 'text.secondary',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {`db.${collection}.aggregate(`}
          {'\n'}
          {JSON.stringify(pipeline, null, 2)}
          {'\n)'}
        </Box>
      </Collapse>
    </Box>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg }) {
  if (msg.role === 'user') {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Box
          sx={{
            maxWidth: '75%',
            bgcolor: 'primary.main',
            color: 'white',
            borderRadius: '18px 18px 4px 18px',
            px: 2.5,
            py: 1.5,
          }}
        >
          <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
            {msg.content}
          </Typography>
        </Box>
      </Box>
    );
  }

  if (msg.role === 'error') {
    return (
      <Box sx={{ mb: 2 }}>
        <Alert severity="error" sx={{ borderRadius: 2 }}>{msg.content}</Alert>
      </Box>
    );
  }

  // Assistant message
  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: 2 }}>
      <Box sx={{ maxWidth: '85%' }}>
        <Paper
          elevation={2}
          sx={{ px: 2.5, py: 1.5, borderRadius: '4px 18px 18px 18px', bgcolor: 'background.paper' }}
        >
          {/* What the system understood */}
          <UnderstandingPill text={msg.understanding} />

          {/* Main explanation */}
          <Typography variant="body2" sx={{ lineHeight: 1.7 }}>
            {msg.explanation}
          </Typography>

          {/* Result document cards */}
          <ResultsViewer results={msg.results} />

          {/* Record count */}
          {msg.count !== undefined && (
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.75 }}>
              {msg.count} record{msg.count !== 1 ? 's' : ''}
              {msg.collection && ` from ${msg.collection}`}
            </Typography>
          )}

          {/* Query toggle */}
          <QueryViewer collection={msg.collection} pipeline={msg.pipeline} />
        </Paper>
      </Box>
    </Box>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Ask() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  const sessionId = localStorage.getItem('mh_session_id');

  useEffect(() => {
    if (!sessionId) { navigate('/'); }
  }, [sessionId, navigate]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendQuestion = async (question) => {
    const q = question.trim();
    if (!q || loading) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setLoading(true);
    try {
      const { data } = await api.post('/ask', { sessionId, question: q });
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          explanation: data.answer,
          collection: data.collection,
          pipeline: data.pipeline,
          results: data.results,
          count: data.recordCount,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'error', content: err.response?.data?.error || err.message || 'Something went wrong.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
      {/* Top bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
        <IconButton size="small" onClick={() => navigate('/feed')}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>
          Ask Your Database
        </Typography>
      </Box>

      {/* Message thread */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 2, pt: 3, pb: 2 }}>
        <Container maxWidth="md" disableGutters>

          {isEmpty && (
            <Box sx={{ textAlign: 'center', mt: 6, mb: 4 }}>
              <Typography variant="h5" fontWeight={700} gutterBottom>
                Ask anything about your data
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                Type a question in plain English. FounderDB figures out the right collections,
                runs multi-step queries when needed, and explains the result.
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center' }}>
                {SUGGESTED_QUESTIONS.map((q) => (
                  <Chip
                    key={q}
                    label={q}
                    onClick={() => sendQuestion(q)}
                    variant="outlined"
                    sx={{
                      cursor: 'pointer',
                      fontSize: '0.78rem',
                      py: 2.5,
                      px: 0.5,
                      height: 'auto',
                      '& .MuiChip-label': { whiteSpace: 'normal', textAlign: 'left' },
                    }}
                  />
                ))}
              </Box>
            </Box>
          )}

          {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}

          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: 2 }}>
              <Paper elevation={2} sx={{ px: 2.5, py: 1.5, borderRadius: '4px 18px 18px 18px', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <CircularProgress size={14} />
                <Typography variant="body2" color="text.secondary">Thinking…</Typography>
              </Paper>
            </Box>
          )}

          <div ref={bottomRef} />
        </Container>
      </Box>

      {/* Input bar */}
      <Box sx={{ borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', px: 2, py: 1.5 }}>
        <Container maxWidth="md" disableGutters>
          <Box
            component="form"
            onSubmit={(e) => { e.preventDefault(); sendQuestion(input); }}
            sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-end' }}
          >
            <TextField
              fullWidth
              multiline
              maxRows={4}
              placeholder="Ask a question about your data…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuestion(input); }
              }}
              size="small"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={!input.trim() || loading}
              sx={{ minWidth: 48, height: 40, borderRadius: 3, px: 2 }}
            >
              <SendIcon fontSize="small" />
            </Button>
          </Box>
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.75, textAlign: 'center' }}>
            Read-only queries only — results are never stored or shared.
          </Typography>
        </Container>
      </Box>
    </Box>
  );
}

import { useEffect, useState, useCallback, useRef, useMemo, useLayoutEffect } from "react";
import axios from "axios";
import EmojiPicker from "emoji-picker-react";
import {
  Box,
  Avatar,
  Button,
  Chip,
  Dialog,
  DialogContent,
  IconButton,
  Menu,
  MenuItem,
  TextField,
  Typography,
  Badge,
  CircularProgress,
  InputAdornment,
  Popover,
  Skeleton,
  Tooltip,
  useMediaQuery,
  useTheme,
  Slide,
  Select,
  FormControl,
  InputLabel,
  LinearProgress,
  Checkbox,
  ClickAwayListener
} from "@mui/material";
import {
  Search,
  Send,
  MoreVert,
  EmojiEmotions,
  Image as ImageIcon,
  Check,
  DoneAll,
  Close as CloseIcon,
  ArrowBack,
  AutoAwesome,
  PriorityHigh,
  WhatsApp,
  Psychology,
  Inbox as InboxIcon,
  FiberNew,
  Chat,
  Business,
  Instagram as InstagramIcon,
  Launch as LaunchIcon,
  Bolt,
  Reply as ReplyIcon,
  Add,
  PictureAsPdf,
  TableChart,
} from "@mui/icons-material";
import { getSocket } from "../../realtime/socket";
import { useNavigate, useSearchParams } from "react-router-dom";


/* ---------- CONSTANTS ---------- */
// 🔥 UPDATED: New tab labels - removed General, added Follow Up
const CATEGORY_TABS = [
  { key: "new_leads", label: "New Leads", icon: <FiberNew /> },
  { key: "ongoing", label: "Ongoing", icon: <Chat /> },
  { key: "business", label: "Business", icon: <Business /> },
];

const SUB_FILTERS = {
  new_leads: [
    { key: "hot", label: "🔥 Hot Leads" },
    { key: "warm", label: "🟡 Warm Leads" },
  ],
  ongoing: [
    { key: "hot", label: "🔥 Hot Leads" },
    { key: "warm", label: "🟡 Warm Leads" },
  ],
  business: [], // No sub-filters
};

const HOT_LEAD_THRESHOLD = 0.65;

// Labels that can be assigned to conversations
const ASSIGNABLE_LABELS = ["General", "Lead", "Business"];

// 🔥 UPDATED: Label styles
const LABEL_STYLES = {
  Lead: { bg: "#41A67E", text: "#FFFFFF" },
  General: { bg: "#F1F3F4", text: "#4B5563" },
  Business: { bg: "#F97316", text: "#FFFFFF" },
  HotLead: { bg: "#F1F3F4", text: "#FF5555" },  // Red for hot
  WarmLead: { bg: "#F1F3F4", text: "#F59E0B" }, // Orange for warm
  "Follow Up": { bg: "#F1F3F4", text: "#8B5CF6" }, // Purple for follow up
};

const getLastMessagePreview = (msg) => {
  if (!msg) return "No messages yet";
  if (msg.type === "system") return "Shared a reel";
  if (msg.type === "image") return "📷 Image";
  if (msg.type === "video") return "🎥 Video";
  if (msg.text?.trim()) return msg.text;
  return "New message";
};


const EMPTY_STATE_TIPS = [
  "Tip: Replying within 1 hour increases conversion by 3×",
  "Tip: A personalized first message wins every time",
  "Tip: Hot leads go cold fast — strike while interest is high",
];

// Returns { label, urgent } or null
const getWaitingTime = (conv) => {
  if (!conv || conv.creatorHasReplied) return null;
  const lastMsgAt = conv.lastParticipantMessageAt || conv.lastActivityAt;
  if (!lastMsgAt) return null;
  const diffMins = Math.floor((Date.now() - new Date(lastMsgAt).getTime()) / 60000);
  if (diffMins < 1) return null;
  if (diffMins < 60) return { label: `${diffMins}m waiting`, urgent: diffMins >= 30 };
  const hrs = Math.floor(diffMins / 60);
  return { label: `${hrs}h waiting`, urgent: hrs >= 3 };
};

// Returns { label, urgent } or null — 24h reply window countdown
const get24hCountdown = (conv) => {
  if (!conv?.lastParticipantMessageAt) return null;
  const remaining = 24 * 60 * 60 * 1000 - (Date.now() - new Date(conv.lastParticipantMessageAt).getTime());
  if (remaining <= 0 || remaining > 23.5 * 60 * 60 * 1000) return null; // only show when < 23.5h remain
  const hrs = Math.floor(remaining / (60 * 60 * 1000));
  const mins = Math.floor((remaining % (60 * 60 * 1000)) / 60000);
  const urgent = hrs < 3;
  return { label: hrs > 0 ? `${hrs}h left` : `${mins}m left`, urgent };
};

function WhatsAppBanner({ onComplete, isMobile }) {
  const [countryCodes, setCountryCodes] = useState([
    { code: "91", country: "India", flag: "🇮🇳" },
    { code: "1", country: "United States", flag: "🇺🇸" },
    // ... more codes
  ]);
  const [selectedCode, setSelectedCode] = useState("91");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  const baseUrl = "/api/usersOn";

  useEffect(() => {
    axios.get(`${baseUrl}/inbox/country-codes`, { withCredentials: true })
      .then((res) => {
        if (res.data?.data) setCountryCodes(res.data.data);
      })
      .catch((err) => console.error("Failed to fetch country codes", err));
  }, []);

  const handleSubmit = async () => {
    const cleanPhone = phoneNumber.replace(/\D/g, "");
    if (cleanPhone.length !== 10) {
      setError("Please enter a valid 10-digit phone number");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await axios.post(
        `${baseUrl}/inbox/save-whatsapp`,
        { countryCode: selectedCode, phoneNumber: cleanPhone },
        { withCredentials: true }
      );
      onComplete();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to save WhatsApp number");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", bgcolor: "#fff", p: isMobile ? 3 : 6, textAlign: "center" }}>
      {/* WhatsApp Icon */}
      <Box sx={{ width: 80, height: 80, borderRadius: "50%", background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)", display: "flex", alignItems: "center", justifyContent: "center", mb: 3, boxShadow: "0 8px 32px rgba(37, 211, 102, 0.3)" }}>
        <WhatsApp sx={{ fontSize: 40, color: "#fff" }} />
      </Box>

      <Typography variant="h5" fontWeight={700} sx={{ mb: 1, fontFamily: "Inter", color: "#1e293b" }}>
        Get Leads on WhatsApp
      </Typography>

      <Typography variant="body1" color="text.secondary" sx={{ mb: 4, maxWidth: 400, lineHeight: 1.6 }}>
        We'll send you instant WhatsApp notifications whenever a high-intent lead messages you on Instagram.
      </Typography>

      {/* Phone Input */}
      <Box sx={{ display: "flex", gap: 1.5, width: "100%", maxWidth: 400, mb: 2, flexDirection: isMobile ? "column" : "row" }}>
        <FormControl size="small" sx={{ minWidth: isMobile ? "100%" : 140 }}>
          <InputLabel>Country</InputLabel>
          <Select value={selectedCode} onChange={(e) => setSelectedCode(e.target.value)} label="Country" sx={{ bgcolor: "#f8fafc" }}>
            {countryCodes.map((c) => (
              <MenuItem key={c.code} value={c.code}>{c.flag} +{c.code}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          size="small"
          placeholder="10-digit phone number"
          value={phoneNumber}
          onChange={(e) => { setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 10)); setError(""); }}
          fullWidth
          inputProps={{ inputMode: "numeric" }}
          sx={{ "& .MuiOutlinedInput-root": { bgcolor: "#f8fafc" } }}
        />
      </Box>

      {error && <Typography color="error" variant="caption" sx={{ mb: 2 }}>{error}</Typography>}

      <Box sx={{ display: "flex", alignItems: "center", maxWidth: 400, width: "100%", mb: 2 }}>
        <Checkbox
          checked={termsAccepted}
          onChange={(e) => setTermsAccepted(e.target.checked)}
          size="small"
          sx={{ p: 0.5, mr: 1, color: "#25D366", "&.Mui-checked": { color: "#25D366" } }}
        />
        <Typography variant="caption" color="text.secondary">
          I agree to{" "}
          <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: "#25D366", textDecoration: "underline" }}>
            Terms & Conditions
          </a>
        </Typography>
      </Box>

      <Button
        variant="contained"
        onClick={handleSubmit}
        disabled={loading || phoneNumber.length !== 10 || !termsAccepted}
        sx={{ bgcolor: "#25D366", color: "#fff", px: 4, py: 1.5, borderRadius: "12px", fontWeight: 600, textTransform: "none", "&:hover": { bgcolor: "#128C7E" } }}
      >
        {loading ? <CircularProgress size={24} sx={{ color: "#fff" }} /> : "Continue"}
      </Button>

      <Typography variant="caption" color="text.disabled" sx={{ mt: 3, maxWidth: 350 }}>
        🔒 Your number is secure. We only use it to send lead notifications.
      </Typography>
    </Box>
  );
}

  function SyncingBanner({ onStartPull, isProcessing, progress, isMobile }) {
  const [started, setStarted] = useState(false);

  const handleStart = () => { setStarted(true); onStartPull(); };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", bgcolor: "#fff", p: isMobile ? 3 : 6, textAlign: "center" }}>
      {/* AI Icon */}
      <Box sx={{ width: 80, height: 80, borderRadius: "50%", background: "linear-gradient(135deg, #4D2B8C 0%, #7C3AED 100%)", display: "flex", alignItems: "center", justifyContent: "center", mb: 3, boxShadow: "0 8px 32px rgba(77, 43, 140, 0.3)", animation: isProcessing ? "pulse 2s infinite" : "none", "@keyframes pulse": { "0%": { transform: "scale(1)" }, "50%": { transform: "scale(1.05)" }, "100%": { transform: "scale(1)" } } }}>
        {isProcessing ? <Psychology sx={{ fontSize: 40, color: "#fff" }} /> : <InboxIcon sx={{ fontSize: 40, color: "#fff" }} />}
      </Box>

      <Typography variant="h5" fontWeight={700} sx={{ mb: 1, fontFamily: "Inter", color: "#1e293b" }}>
        {isProcessing ? "Analyzing Your Inbox..." : "Ready to Find Your Leads"}
      </Typography>

      <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 450, lineHeight: 1.6 }}>
        {isProcessing
          ? "Our AI is scanning your Instagram DMs to identify potential leads and follow-ups. This usually takes 2-3 minutes."
          : "We'll analyze your recent Instagram conversations to find hot leads and people who need follow-up."}
      </Typography>

      {isProcessing && (
        <Box sx={{ width: "100%", maxWidth: 400, mb: 3 }}>
          <LinearProgress variant="indeterminate" sx={{ height: 8, borderRadius: 4, bgcolor: "#E8E0F0", "& .MuiLinearProgress-bar": { bgcolor: "#4D2B8C", borderRadius: 4 } }} />
          <Box display="flex" justifyContent="space-between" mt={1}>
            <Typography variant="caption" color="text.secondary">Conversations: {progress.conversationsFound || 0}</Typography>
            <Typography variant="caption" color="text.secondary">Analyzed: {progress.conversationsAnalyzed || 0}</Typography>
          </Box>
        </Box>
      )}

      {/* Feature Cards */}
      <Box sx={{ display: "flex", gap: 2, mb: 4, flexDirection: isMobile ? "column" : "row", width: "100%", maxWidth: 500 }}>
        <Box sx={{ flex: 1, p: 2, bgcolor: "#F0FDF4", borderRadius: "12px", border: "1px solid #BBF7D0" }}>
          <Typography variant="body2" fontWeight={600} color="#166534">🎯 Lead Detection</Typography>
          <Typography variant="caption" color="#166534">Identifies users asking about your services</Typography>
        </Box>
        <Box sx={{ flex: 1, p: 2, bgcolor: "#FEF3C7", borderRadius: "12px", border: "1px solid #FDE68A" }}>
          <Typography variant="body2" fontWeight={600} color="#92400E">🔔 Follow-up Alerts</Typography>
          <Typography variant="caption" color="#92400E">Reminds you to respond to waiting users</Typography>
        </Box>
      </Box>

      {!isProcessing && !started && (
        <Button variant="contained" onClick={handleStart} sx={{ bgcolor: "#4D2B8C", color: "#fff", px: 4, py: 1.5, borderRadius: "12px", fontWeight: 600, textTransform: "none", "&:hover": { bgcolor: "#3E2271" } }}>
          <AutoAwesome sx={{ mr: 1 }} /> Start Analyzing
        </Button>
      )}

      {(isProcessing || started) && (
        <Box display="flex" alignItems="center" gap={1}>
          <CircularProgress size={20} sx={{ color: "#4D2B8C" }} />
          <Typography variant="body2" color="text.secondary">Please wait, this may take a minute...</Typography>
        </Box>
      )}

      <Typography variant="caption" color="text.disabled" sx={{ mt: 4, maxWidth: 400 }}>
        🔒 Your conversations are analyzed securely. Data refreshes every 24 hours.
      </Typography>
    </Box>
  );
}

function EmptyStateUI({ category, isMobile }) {
  const [tipIndex] = useState(() => Math.floor(Math.random() * EMPTY_STATE_TIPS.length));

  const configs = {
    new_leads: {
      icon: <FiberNew sx={{ fontSize: 48, color: "#22C55E" }} />,
      title: "You're all caught up! 🎉",
      subtitle: "New hot leads will land here the moment they message you.",
      bgColor: "#F0FDF4",
      borderColor: "#BBF7D0",
      ringColor: "rgba(34, 197, 94, 0.2)",
    },
    ongoing: {
      icon: <Chat sx={{ fontSize: 48, color: "#4D2B8C" }} />,
      title: "No active chats yet",
      subtitle: "Conversations you've replied to will live here — keep engaging!",
      bgColor: "#F3E8FF",
      borderColor: "#E9D5FF",
      ringColor: "rgba(77, 43, 140, 0.15)",
    },
    business: {
      icon: <Business sx={{ fontSize: 48, color: "#F97316" }} />,
      title: "No business inquiries yet",
      subtitle: "Collab and sponsorship requests will appear here when they arrive.",
      bgColor: "#FFF7ED",
      borderColor: "#FED7AA",
      ringColor: "rgba(249, 115, 22, 0.15)",
    },
  };

  const config = configs[category] || configs.new_leads;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        py: 6,
        px: 3,
        textAlign: "center",
        height: "100%",
        minHeight: 300,
      }}
    >
      {/* Icon with animated pulse ring */}
      <Box sx={{ position: "relative", mb: 3 }}>
        {/* Outer pulse ring */}
        <Box
          sx={{
            position: "absolute",
            inset: -10,
            borderRadius: "50%",
            border: `2px solid ${config.ringColor}`,
            animation: "emptyPing 2.5s ease-in-out infinite",
            "@keyframes emptyPing": {
              "0%": { transform: "scale(1)", opacity: 0.8 },
              "70%": { transform: "scale(1.25)", opacity: 0 },
              "100%": { transform: "scale(1.25)", opacity: 0 },
            },
          }}
        />
        <Box
          sx={{
            width: 100,
            height: 100,
            borderRadius: "50%",
            bgcolor: config.bgColor,
            border: `2px solid ${config.borderColor}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {config.icon}
        </Box>
      </Box>

      <Typography
        variant="h6"
        fontWeight={700}
        color="text.primary"
        sx={{ mb: 1, fontFamily: "Inter" }}
      >
        {config.title}
      </Typography>

      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ maxWidth: 260, lineHeight: 1.6, mb: 3 }}
      >
        {config.subtitle}
      </Typography>

      {/* Tip card */}
      <Box
        sx={{
          maxWidth: 280,
          px: 2,
          py: 1.25,
          borderRadius: "10px",
          bgcolor: "#F8F7FC",
          border: "1px solid #E8E0F0",
        }}
      >
        <Typography
          sx={{
            fontSize: "0.75rem",
            color: "#6B7280",
            fontFamily: "Inter",
            lineHeight: 1.5,
            fontStyle: "italic",
          }}
        >
          {EMPTY_STATE_TIPS[tipIndex]}
        </Typography>
      </Box>
    </Box>
  );
}

function LeadsLimitDialog({ open, leadsLimit, isMobile, onClose, onUpgrade }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: isMobile ? "16px" : "20px",
          overflow: "hidden",
          m: isMobile ? 2 : 3,
          maxWidth: 460,
        },
      }}
    >
      <DialogContent sx={{ p: 0, position: "relative" }}>
        {/* Close button */}
        <IconButton
          onClick={onClose}
          sx={{
            position: "absolute",
            top: 10,
            right: 10,
            zIndex: 2,
            bgcolor: "#F3F4F6",
            width: 32,
            height: 32,
            "&:hover": { bgcolor: "#E5E7EB" },
          }}
        >
          <CloseIcon sx={{ fontSize: 16, color: "#6B7280" }} />
        </IconButton>

        {/* Gradient top bar */}
        <Box
          sx={{
            height: 4,
            background: "linear-gradient(90deg, #4D2B8C, #7C3AED, #A78BFA)",
            backgroundSize: "200% 100%",
            animation: "limitShimmer 2.5s ease-in-out infinite",
            "@keyframes limitShimmer": {
              "0%": { backgroundPosition: "200% 0" },
              "100%": { backgroundPosition: "-200% 0" },
            },
          }}
        />

        <Box sx={{ p: isMobile ? 3 : 4, pt: isMobile ? 3 : 3.5, textAlign: "center" }}>
          {/* Icon */}
          <Box
            sx={{
              width: isMobile ? 64 : 76,
              height: isMobile ? 64 : 76,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #F3E8FF 0%, #E9D5FF 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mx: "auto",
              mb: 2.5,
              animation: "limitPulse 2.5s ease-in-out infinite",
              "@keyframes limitPulse": {
                "0%, 100%": { transform: "scale(1)" },
                "50%": { transform: "scale(1.06)" },
              },
            }}
          >
            <AutoAwesome sx={{ fontSize: isMobile ? 28 : 34, color: "#7C3AED" }} />
          </Box>

          {/* Title */}
          <Typography
            sx={{
              fontFamily: "Inter",
              fontWeight: 700,
              fontSize: isMobile ? "1.15rem" : "1.35rem",
              color: "#1e293b",
              mb: 1.5,
              lineHeight: 1.3,
            }}
          >
            Lead Limit Reached!
          </Typography>

          {/* Subtitle */}
          <Typography
            sx={{
              fontFamily: "Inter",
              fontWeight: 400,
              fontSize: isMobile ? "0.85rem" : "0.9rem",
              color: "#64748b",
              lineHeight: 1.6,
              mb: 2.5,
              maxWidth: 340,
              mx: "auto",
            }}
          >
            Lead detection is currently paused because you’ve hit{" "}
            <Box component="span" sx={{ fontWeight: 700, color: "#4D2B8C" }}>
              {leadsLimit}
            </Box>{" "}
            leads on your current plan. Upgrade your plan to resume detection immediately and stop missing out on new prospects.
          </Typography>

          {/* Limit badge */}
          <Box
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 1,
              bgcolor: "#FEF3C7",
              border: "1px solid #FDE68A",
              borderRadius: "10px",
              px: 2,
              py: 0.75,
              mb: 3,
            }}
          >
            <PriorityHigh sx={{ fontSize: 16, color: "#D97706" }} />
            <Typography
              sx={{
                fontFamily: "Inter",
                fontWeight: 600,
                fontSize: isMobile ? "0.7rem" : "0.78rem",
                color: "#92400E",
              }}
            >
              {leadsLimit} / {leadsLimit} leads used
            </Typography>
          </Box>

          {/* CTA */}
          <Box>
            <Button
              variant="contained"
              onClick={onUpgrade}
              sx={{
                background: "linear-gradient(135deg, #4D2B8C 0%, #7C3AED 100%)",
                color: "#fff",
                fontFamily: "Inter",
                fontWeight: 600,
                fontSize: isMobile ? "0.85rem" : "0.95rem",
                textTransform: "none",
                px: isMobile ? 3.5 : 4.5,
                py: 1.25,
                borderRadius: "12px",
                boxShadow: "0 4px 16px rgba(77, 43, 140, 0.3)",
                backgroundSize: "200% 200%",
                animation: "limitBtnShimmer 3s ease-in-out infinite",
                "@keyframes limitBtnShimmer": {
                  "0%, 100%": { backgroundPosition: "0% 50%" },
                  "50%": { backgroundPosition: "100% 50%" },
                },
                "&:hover": {
                  boxShadow: "0 6px 24px rgba(77, 43, 140, 0.4)",
                  transform: "translateY(-1px)",
                },
                transition: "all 0.2s ease",
              }}
            >
              Upgrade Plan
            </Button>
          </Box>

          {/* Footer */}
          <Typography
            sx={{
              fontFamily: "Inter",
              fontWeight: 400,
              fontSize: isMobile ? "0.68rem" : "0.73rem",
              color: "#94a3b8",
              mt: 2.5,
            }}
          >
            Unlock 500 more leads, Unlimited DMs/month & more
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

export default function InboxManagement() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const isXs = useMediaQuery(theme.breakpoints.down("sm")); // < 600px — mobile AppBar visible
  const isSmallMobile = useMediaQuery("(max-width:400px)");
  const [inboxStatus, setInboxStatus] = useState(null);
  const [pullProgress, setPullProgress] = useState({ conversationsFound: 0, conversationsAnalyzed: 0 });
  const [leadsLimitData, setLeadsLimitData] = useState(null);
  const [showLeadsLimitDialog, setShowLeadsLimitDialog] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const baseUrl = "/api/usersOn";

  /* ---------- STATE ---------- */
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [selectedConversationId, setSelectedConversationId] = useState(null);

  const [rawMessages, setRawMessages] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const searchTimerRef = useRef(null);
  const [activeCategory, setActiveCategory] = useState("new_leads");
const [activeSubFilter, setActiveSubFilter] = useState("all");
const [categoryCounts, setCategoryCounts] = useState({
  new_leads: { total: 0, hot: 0, warm: 0 },
  ongoing: { total: 0, hot: 0, warm: 0 },
  business: { total: 0 },
});
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(null);

  // Mobile-specific state
  const [showChat, setShowChat] = useState(false);

  // Menus & Popups
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [labelAnchor, setLabelAnchor] = useState(null);
  const [emojiAnchor, setEmojiAnchor] = useState(null);

  // 🔥 NEW: AI Insight popup state (replaces notes)
  const [showAiInsight, setShowAiInsight] = useState(true);

  // Refs
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const pdfInputRef = useRef(null);
  const excelInputRef = useRef(null);
  const prevScrollHeightRef = useRef(null);

  const messageIdSetRef = useRef(new Set());
  const [isSyncing, setIsSyncing] = useState(false);
  const syncingOlderRef = useRef(false);

  const [creatorId, setCreatorId] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [whatsappPhoneDialog, setWhatsappPhoneDialog] = useState(null); // stores phone number string or null

  const [quickReplyAnchor, setQuickReplyAnchor] = useState(null);
  const [aiQuickReplies, setAiQuickReplies] = useState([]);
  const [plusMenuAnchor, setPlusMenuAnchor] = useState(null);
  const [selectedFileType, setSelectedFileType] = useState(null); // "image" | "pdf" | "excel"
  const [showSentToast, setShowSentToast] = useState(false);
  const [sendError, setSendError] = useState(null);

  // File Upload State
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [hydratingFromMeta, setHydratingFromMeta] = useState(false);

  // Per-category pagination: each tab has its own cursor and hasMore flag so that
  // scrolling under "New Leads" loads more new leads (not a mixed-category page).
  const [categoryCursors, setCategoryCursors] = useState({ new_leads: null, ongoing: null, business: null });
  const [categoryHasMore, setCategoryHasMore] = useState({ new_leads: true, ongoing: true, business: true });
  // Tracks which tabs have had their first page fetched (lazy-load on tab switch)
  const loadedCategoriesRef = useRef(new Set());
  const [loadingOlderConversations, setLoadingOlderConversations] = useState(false);

  const convListRef = useRef(null);
  const prevConvScrollHeightRef = useRef(null);

  const [loadingMetaConversations, setLoadingMetaConversations] = useState(false);
  const [inboxError, setInboxError] = useState(false);

  const loadingConversationsRef = useRef(false);
  const conversationIdSetRef = useRef(new Set());
  const appendedInLastFetchRef = useRef(false);
  const fetchModeRef = useRef("initial");
  const isFetchingMessagesRef = useRef(false);
  const didInitialScrollRef = useRef(false);

  const cursorRef = useRef(null);
  const isPaginatingRef = useRef(false);
  // Set to true just before auto-open calls setActiveCategory so the
  // activeCategory-cleanup effect knows to skip URL-clearing and mobile-close.
  const isAutoOpeningRef = useRef(false);

  const classifyConversation = (conv) => {
  const label = conv.label || "General";
  const leadSeriousness = conv.labelLeadSeriousness || 0;
  const followUpNeeded = conv.followUpStatus?.needed === true;




  // Business is always Business
  if (label === "Business") {
    return {
      effectiveLabel: "Business",
      isHotLead: false,
      isFollowUp: false,
      displayLabel: "Business",
      tabCategory: "Business",
    };
  }

  // Check if it's a Lead
  if (label === "Lead") {
    const isHotLead = leadSeriousness > HOT_LEAD_THRESHOLD;
    
    // 🔥 KEY LOGIC: Follow Up = Hot Lead + followUpStatus.needed
    // Only hot leads (seriousness > 0.65) qualify for Follow Up tab
    const isFollowUp = isHotLead && followUpNeeded;

    if (isFollowUp) {
      return {
        effectiveLabel: "Lead",
        isHotLead: true,
        isFollowUp: true,
        displayLabel: "Follow Up",
        tabCategory: "Follow Up",
      };
    }

    // Regular Lead or Hot Lead without follow-up needed
    return {
      effectiveLabel: "Lead",
      isHotLead,
      isFollowUp: false,
      displayLabel: isHotLead ? "🔥 Lead" : "Lead",
      tabCategory: "Lead",
    };
  }

  // General - no tab category (only shows in "All")
  return {
    effectiveLabel: "General",
    isHotLead: false,
    isFollowUp: false,
    displayLabel: "General",
    tabCategory: null,
  };
};

  useEffect(() => {
  // Default sub-filter: "hot" for new_leads/ongoing, "all" for others
  setActiveSubFilter((activeCategory === "ongoing" || activeCategory === "new_leads") ? "hot" : "all");
  // Reset scroll so newly loaded conversations are visible from the top
  if (convListRef.current) convListRef.current.scrollTop = 0;
}, [activeCategory]);



useEffect(() => {
  const checkInboxStatus = async () => {
    try {
      const res = await axios.get(`${baseUrl}/inbox/status`, { withCredentials: true });
      setInboxStatus(res.data);

      // Call loadInbox whenever the inbox is in a displayable state — i.e. not
      // waiting for WhatsApp setup, initial pull, or an active processing job.
      // Previously only `isReady === true` triggered this, which caused an empty
      // inbox on first load when the server returned `{ status: "ready" }` without
      // an explicit `isReady` field.
      const needsOnboarding =
        res.data.needsWhatsApp ||
        res.data.status === "needs_whatsapp" ||
        res.data.needsInitialPull ||
        res.data.isProcessing ||
        res.data.status === "needs_initial_pull" ||
        res.data.status === "processing";

      if (!needsOnboarding) {
        loadInbox();
        // Check leads limit after inbox is ready
        try {
          const limitRes = await axios.get(`${baseUrl}/inbox/leads-limit-status`, { withCredentials: true });
          setLeadsLimitData(limitRes.data);
          if (limitRes.data?.limitReached) {
            setShowLeadsLimitDialog(true);
          }
        } catch (limitErr) {
          console.error("Failed to check leads limit:", limitErr);
        }
      }
    } catch (err) {
      console.error("Failed to check inbox status:", err);
      loadInbox(); // Fallback
    }
  };
  checkInboxStatus();
}, []);

useEffect(() => {
  if (inboxStatus?.isProcessing || inboxStatus?.status === "processing") {
    const pollInterval = setInterval(async () => {
      try {
        const res = await axios.get(`${baseUrl}/inbox/pull-progress`, { withCredentials: true });
        setPullProgress({
          conversationsFound: res.data.conversationsFound || 0,
          conversationsAnalyzed: res.data.conversationsAnalyzed || 0,
        });
        if (res.data.isComplete) {
          setInboxStatus(prev => ({ ...prev, status: "ready", isReady: true, isProcessing: false }));
          clearInterval(pollInterval);
          loadInbox();
        }
      } catch (err) { console.error("Progress poll failed:", err); }
    }, 3000);
    return () => clearInterval(pollInterval);
  }
}, [inboxStatus?.isProcessing, inboxStatus?.status]);

const handleWhatsAppComplete = () => {
  setInboxStatus(prev => ({ ...prev, needsWhatsApp: false, status: "needs_initial_pull", needsInitialPull: true }));
};

const handleStartPull = async () => {
  try {
    await axios.post(`${baseUrl}/inbox/start-initial-pull`, {}, { withCredentials: true });
    setInboxStatus(prev => ({ ...prev, status: "processing", isProcessing: true, needsInitialPull: false }));
  } catch (err) { console.error("Failed to start initial pull:", err); }
};



  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);


  const CHAT_MEDIA_STYLE = {
    maxWidth: isMobile ? "220px" : "300px",
    maxHeight: isMobile ? "260px" : "340px",
    objectFit: "contain",
    cursor: "pointer",
    display: "block",
    borderRadius: "12px",
  };

  // 🔥 UPDATED: Label counts calculation for new tabs
  const labelCounts = useMemo(() => {
  const counts = { Lead: 0, "Follow Up": 0, Business: 0 };
  
  for (const c of conversations) {
    const classification = classifyConversation(c);
    
    if (classification.tabCategory === "Business") {
      counts.Business++;
    } else if (classification.tabCategory === "Follow Up") {
      counts["Follow Up"]++;
    } else if (classification.tabCategory === "Lead") {
      counts.Lead++;
    }
    // General doesn't get counted
  }
  
  return counts;
}, [conversations]);

// 🔥 Helper function to get label display config for conversation list
const getConversationLabelConfig = (conv) => {
  const label = conv.label || "General";
  const leadSeriousness = conv.labelLeadSeriousness || 0;
  const followUpNeeded = conv.followUpStatus?.needed === true;
  
  // Business
  if (label === "Business") {
    return {
      displayText: "Business",
      style: LABEL_STYLES.Business,
      showFollowUp: false,
    };
  }
  
  // Lead — only two tiers: Hot or Warm (no plain "Lead")
  if (label === "Lead") {
    const isHot = leadSeriousness > HOT_LEAD_THRESHOLD;

    return {
      displayText: isHot ? "🔥 Lead" : "Warm Lead",
      style: isHot ? LABEL_STYLES.HotLead : LABEL_STYLES.WarmLead,
      showFollowUp: followUpNeeded,
    };
  }
  
  // General - don't show label chip
  return null;
};

  const messages = useMemo(
    () =>
      [...rawMessages].sort(
        (a, b) => new Date(a.createdAtPlatform) - new Date(b.createdAtPlatform)
      ),
    [rawMessages]
  );

  const markReadTimeoutRef = useRef(null);

  const markConversationAsRead = useCallback((conversationId) => {
    if (markReadTimeoutRef.current) return;
    markReadTimeoutRef.current = setTimeout(async () => {
      try {
        await axios.post(
          `${baseUrl}/conversations/${conversationId}/mark-read`,
          {},
          { withCredentials: true }
        );
        
       setConversations((prev) =>
  prev.map((c) => (c._id === conversationId ? { ...c, unreadCount: 0 } : c))
);
        
        setSelectedConversation((prev) =>
          prev?._id === conversationId ? { ...prev, unreadCount: 0 } : prev
        );
      } catch (e) {
        console.error("mark-read failed", e);
      } finally {
        markReadTimeoutRef.current = null;
      }
    }, 300);
  }, []);

  const handleFileSelect = (e, fileType = "image") => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setSelectedFileType(fileType);
    if (fileType === "image") {
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
    } else {
      setPreviewUrl(null);
    }
  };

  const handlePdfSelect = (e) => handleFileSelect(e, "pdf");
  const handleExcelSelect = (e) => handleFileSelect(e, "excel");

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setSelectedFileType(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (pdfInputRef.current) pdfInputRef.current.value = "";
    if (excelInputRef.current) excelInputRef.current.value = "";
  };


  const handleEmojiClick = (emojiData) => {
    setMessageText((prev) => prev + emojiData.emoji);
  };

  const loadOlderConversations = async (category = activeCategory) => {
    if (loadingConversationsRef.current || !categoryHasMore[category]) {
      return;
    }

    try {
      loadingConversationsRef.current = true;
      setLoadingOlderConversations(true);

      const res = await axios.get(`${baseUrl}/conversations`, {
        withCredentials: true,
        params: {
          cursor: categoryCursors[category],
          limit: 20,
          category: category,
        },
      });

      const newConvos = res.data.data || [];

      setConversations((prev) => {
        const unique = [];
        for (const conv of newConvos) {
          if (!conversationIdSetRef.current.has(conv._id)) {
            conversationIdSetRef.current.add(conv._id);
            unique.push(conv);
          }
        }
        appendedInLastFetchRef.current = unique.length > 0;
        return [...prev, ...unique];
      });

      // categoryCounts is null on paginated requests (backend skips the aggregation)
      if (res.data.categoryCounts) {
        setCategoryCounts(res.data.categoryCounts);
      }
      setCategoryCursors((prev) => ({ ...prev, [category]: res.data.nextCursor }));
      setCategoryHasMore((prev) => ({ ...prev, [category]: res.data.hasMore }));
    } catch (err) {
      console.error("Failed to load conversations:", err);
    } finally {
      loadingConversationsRef.current = false;
      setLoadingOlderConversations(false);
    }
  };

  const loadCategoryFirstPage = async (category) => {
    if (loadedCategoriesRef.current.has(category)) return;
    if (loadingConversationsRef.current) return;

    try {
      loadingConversationsRef.current = true;
      setLoadingOlderConversations(true);

      const res = await axios.get(`${baseUrl}/conversations`, {
        withCredentials: true,
        params: { category, limit: 20 },
      });

      const newConvos = res.data.data || [];

      setConversations((prev) => {
        const unique = [];
        for (const conv of newConvos) {
          if (!conversationIdSetRef.current.has(conv._id)) {
            conversationIdSetRef.current.add(conv._id);
            unique.push(conv);
          }
        }
        return [...prev, ...unique];
      });

      if (res.data.categoryCounts) setCategoryCounts(res.data.categoryCounts);
      setCategoryCursors((prev) => ({ ...prev, [category]: res.data.nextCursor }));
      setCategoryHasMore((prev) => ({ ...prev, [category]: res.data.hasMore }));
      loadedCategoriesRef.current.add(category);
    } catch (err) {
      console.error("Failed to load category first page:", err);
    } finally {
      loadingConversationsRef.current = false;
      setLoadingOlderConversations(false);
    }
  };

  const handleConvScroll = async (e) => {
    const el = e.target;
    if (syncingOlderRef.current) return;

    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (!nearBottom) return;
    if (loadingOlderConversations || loadingMetaConversations) return;

    if (categoryHasMore[activeCategory] && categoryCursors[activeCategory]) {
      prevConvScrollHeightRef.current = el.scrollHeight;
      await loadOlderConversations(activeCategory);
      return;
    }

    if (!categoryHasMore[activeCategory] && !syncingOlderRef.current) {
      syncingOlderRef.current = true;
      setLoadingMetaConversations(true);

      try {
        await axios.post(
          `${baseUrl}/conversations/load-more-from-meta`,
          {},
          { withCredentials: true }
        );

        await new Promise((resolve) => setTimeout(resolve, 1500));

        const res = await axios.get(`${baseUrl}/conversations`, {
          withCredentials: true,
          params: {
            cursor: categoryCursors[activeCategory],
            limit: 20,
            category: activeCategory,
          },
        });

        const newConvos = res.data?.data || [];

        if (newConvos.length > 0) {
          setConversations((prev) => {
            const unique = [];
            for (const conv of newConvos) {
              if (!conversationIdSetRef.current.has(conv._id)) {
                conversationIdSetRef.current.add(conv._id);
                unique.push(conv);
              }
            }
            appendedInLastFetchRef.current = unique.length > 0;
            return [...prev, ...unique];
          });

          if (res.data.categoryCounts) {
            setCategoryCounts(res.data.categoryCounts);
          }
          setCategoryCursors((prev) => ({ ...prev, [activeCategory]: res.data.nextCursor }));
          setCategoryHasMore((prev) => ({ ...prev, [activeCategory]: res.data.hasMore }));
        } else {
          setCategoryHasMore((prev) => ({ ...prev, [activeCategory]: false }));
        }
      } catch (err) {
        console.error("Meta sync failed", err);
      } finally {
        setLoadingMetaConversations(false);
        setTimeout(() => {
          syncingOlderRef.current = false;
        }, 500);
      }
    }
  };

  useEffect(() => {
    if (appendedInLastFetchRef.current) {
      requestAnimationFrame(() => {
        appendedInLastFetchRef.current = false;
      });
    }
  }, [conversations]);

  // Auto-open conversation from ?chat=username URL param
  const urlChatHandledRef = useRef(false);
  // Capture the initial chat param from the URL on mount (before any effect can clear it)
  const initialChatUsernameRef = useRef(new URLSearchParams(window.location.search).get("chat"));

  useEffect(() => {
    if (urlChatHandledRef.current) return;
    // FIX: only block during active loading — NOT on conversations.length === 0,
    // because with our loadInbox fix, conversations can legitimately be empty when
    // the user has 0 new_leads but has conversations in other categories.
    if (loading) return;

    const chatUsername = initialChatUsernameRef.current;
    if (!chatUsername) return;

    console.log(`[AutoOpen] Looking for "${chatUsername}" in ${conversations.length} conversations`);

    // Phase 1: search in already-loaded conversations (covers any category already fetched)
    const targetConv = conversations.find(
      (c) => c.participant?.username?.toLowerCase() === chatUsername.toLowerCase()
    );

    if (targetConv) {
      urlChatHandledRef.current = true;
      console.log(`[AutoOpen] Found in memory, opening: ${targetConv._id}`);

      const convCategory = computeCategory(targetConv);
      if (convCategory && convCategory !== activeCategory) {
        // Signal the activeCategory cleanup effect to skip URL-clear + mobile-close
        isAutoOpeningRef.current = true;
        setActiveCategory(convCategory);
      }

      setTimeout(() => handleConversationClick(targetConv), 150);
      return;
    }

    // Phase 2: not in loaded memory — hit the search API which covers ALL categories/pages.
    // Mark as handled immediately to prevent this async block from firing multiple times
    // if conversations state changes while the API call is in-flight.
    urlChatHandledRef.current = true;
    console.log(`[AutoOpen] Not in memory, trying server search for "${chatUsername}"`);

    (async () => {
      try {
        const res = await axios.get(`${baseUrl}/conversations/search`, {
          withCredentials: true,
          params: { q: chatUsername },
        });
        const found = (res.data.data || []).find(
          (c) => c.participant?.username?.toLowerCase() === chatUsername.toLowerCase()
        );

        if (!found) {
          console.log(`[AutoOpen] "${chatUsername}" not found anywhere`);
          return;
        }

        console.log(`[AutoOpen] Found via search, opening: ${found._id}`);

        // Inject the found conversation into the conversations list immediately so it
        // appears highlighted in the left panel without waiting for the full page fetch.
        if (!conversationIdSetRef.current.has(found._id)) {
          conversationIdSetRef.current.add(found._id);
          setConversations((prev) => [found, ...prev]);
        }

        const convCategory = computeCategory(found);

        if (convCategory && convCategory !== activeCategory) {
          // Signal the activeCategory cleanup effect to skip URL-clear + mobile-close
          isAutoOpeningRef.current = true;
          setActiveCategory(convCategory);

          // Also kick off the full page load for that tab so the rest of the
          // conversation list populates (found conv is already injected above).
          if (!loadedCategoriesRef.current.has(convCategory)) {
            loadCategoryFirstPage(convCategory);
          }
        }

        setTimeout(() => handleConversationClick(found), 300);
      } catch (err) {
        console.error("[AutoOpen] Search fallback failed:", err);
        // Reset so a page refresh can retry
        urlChatHandledRef.current = false;
      }
    })();
  }, [conversations, loading]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${baseUrl}/fetch-creatorid`, {
          withCredentials: true,
        });
        if (!cancelled) {
          setCreatorId(res.data?.user?._id || null);
        }
      } catch (err) {
        console.error("Failed to fetch creatorId", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // When the browser tab regains focus after being hidden, reset the loaded-categories
  // cache for the currently active tab so any missed socket events are recovered by
  // re-fetching the first page (new conversations will be appended; duplicates are
  // deduplicated via conversationIdSetRef).
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      loadedCategoriesRef.current.delete(activeCategory);
      loadCategoryFirstPage(activeCategory);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [activeCategory]);

  useEffect(() => {
    if (!creatorId) return;
    const socket = getSocket();

    if (socket.connected) {
      socket.emit("join_creator", { creatorId });
    } else {
      socket.once("connect", () => {
        socket.emit("join_creator", { creatorId });
      });
    }

    return () => {
      socket.emit("leave_creator", { creatorId });
    };
  }, [creatorId]);

  useEffect(() => {
    if (!creatorId) return;
    const socket = getSocket();

    const handleCreatorEvent = (payload) => {
      if (payload.type === "participant:updated") {
        const { igUserId, name, profilePic } = payload.data;

        setConversations((prev) =>
          prev.map((c) =>
            c.participant?.igUserId === igUserId
              ? {
                  ...c,
                  participant: {
                    ...c.participant,
                    name: name || c.participant.name,
                    profilePic: profilePic || c.participant.profilePic,
                  },
                }
              : c
          )
        );

        setSelectedConversation((prev) =>
          prev?.participant?.igUserId === igUserId
            ? {
                ...prev,
                participant: {
                  ...prev.participant,
                  name: name || prev.participant.name,
                  profilePic: profilePic || prev.participant.profilePic,
                },
              }
            : prev
        );
      }

      if (payload.type === "conversation:updated") {
        const { conversationId, data } = payload;
       setConversations((prev) => {
  const updated = prev.map((c) => {
    if (c._id !== conversationId) return c;
    const newConv = { ...c, ...data };
    setCategoryCounts((counts) => applyCountDelta(counts, c, newConv));
    return newConv;
  });
  return updated;
});
        
        setSelectedConversation((prev) =>
          prev?._id === conversationId ? { ...prev, ...data } : prev
        );
      }

      if (payload.type === "conversation:created") {
        const newConv = payload.data;
       setConversations((prev) => {
  if (conversationIdSetRef.current.has(newConv._id)) {
    return prev;
  }
  conversationIdSetRef.current.add(newConv._id);
  const cat = computeCategory(newConv);
  if (cat) {
    const temp = cat !== "business" ? computeLeadTemperature(newConv) : null;
    setCategoryCounts((counts) => ({
      ...counts,
      [cat]: {
        ...counts[cat],
        total: (counts[cat]?.total || 0) + 1,
        ...(temp ? { [temp]: (counts[cat]?.[temp] || 0) + 1 } : {}),
      },
    }));
  }
  return [newConv, ...prev];
});
      }
    };

    socket.on("inbox:event", handleCreatorEvent);
    return () => {
      socket.off("inbox:event", handleCreatorEvent);
    };
  }, [creatorId]);

  useEffect(() => {
    const socket = getSocket();

    const handler = (payload) => {
      if (
        ![
          "message:new",
          "conversation:updated",
          "participant:updated",
          "older-messages:ready",
        ].includes(payload.type)
      ) {
        return;
      }

      if (payload.type === "participant:updated") {
        setConversations((prev) =>
          prev.map((c) =>
            c.participant?.igUserId === payload.data.igUserId
              ? {
                  ...c,
                  participant: { ...c.participant, ...payload.data },
                }
              : c
          )
        );

        setSelectedConversation((prev) =>
          prev?.participant?.igUserId === payload.data.igUserId
            ? {
                ...prev,
                participant: { ...prev.participant, ...payload.data },
              }
            : prev
        );
      }

      // 🔥 FIX: Preserve label fields when updating conversation
      if (payload.type === "conversation:updated") {
        const { conversationId, data, reason } = payload;
        if (reason === "older-sync") return;

        if (data) {
          setConversations((prev) => {
           const updated =  prev.map((c) => {
              if (c._id !== conversationId) return c;
              const lastParticipantMessageAt =
                data.lastParticipantMessageAt ?? c.lastParticipantMessageAt;
              const canReply = computeCanReply(lastParticipantMessageAt);

              // 🔥 FIX: Preserve label-related fields if not provided in update
              const newConv = {
                ...c,
                ...data,
                // Preserve these fields if not explicitly updated
                label: data.label ?? c.label,
                labelIntentConfidence: data.labelIntentConfidence ?? c.labelIntentConfidence,
                labelLeadSeriousness: data.labelLeadSeriousness ?? c.labelLeadSeriousness,
                followUpStatus: data.followUpStatus ?? c.followUpStatus,
                lastParticipantMessageAt,
                canReply,
                replyDisabledReason: canReply ? null : "waiting_for_reply",
              };
              setCategoryCounts((counts) => applyCountDelta(counts, c, newConv));
              return newConv;
            });
  return updated;
        });

          setSelectedConversation((prev) => {
            if (!prev || prev._id !== conversationId) return prev;
            const lastParticipantMessageAt =
              data.lastParticipantMessageAt ?? prev.lastParticipantMessageAt;
            const canReply = computeCanReply(lastParticipantMessageAt);
            
            // 🔥 FIX: Preserve label-related fields if not provided in update
            return {
              ...prev,
              ...data,
              label: data.label ?? prev.label,
              labelIntentConfidence: data.labelIntentConfidence ?? prev.labelIntentConfidence,
              labelLeadSeriousness: data.labelLeadSeriousness ?? prev.labelLeadSeriousness,
              followUpStatus: data.followUpStatus ?? prev.followUpStatus,
              lastParticipantMessageAt,
              canReply,
              replyDisabledReason: canReply ? null : "waiting_for_reply",
            };
          });
        }
        return;
      }

      if (payload.type === "message:new") {
        if (isPaginatingRef.current) return;
        const { conversationId, data, conversation } = payload;
        const isActiveConversation = conversationId === selectedConversationId;
        const isFromThem = data?.sender === "them";
        
        const isChatVisible = isMobile 
          ? (isActiveConversation && showChat) 
          : isActiveConversation;

        if (isActiveConversation) {
          const msgId = String(data._id);
          if (!messageIdSetRef.current.has(msgId)) {
            messageIdSetRef.current.add(msgId);
            setRawMessages((prev) => [...prev, data]);
          }
        }

        if (isChatVisible && isFromThem) {
          markConversationAsRead(conversationId);
        }

        setConversations((prev) =>
          prev.map((c) => {
            if (c._id !== conversationId) return c;
            const lastParticipantMessageAt =
              conversation?.lastParticipantMessageAt ??
              (isFromThem ? data.createdAtPlatform : c.lastParticipantMessageAt);
            const canReply = computeCanReply(lastParticipantMessageAt);
            // 🔥 FIX: Preserve label-related fields
            // Note: message arrival never changes category (label/creatorHasReplied unchanged)
            return {
              ...c,
              lastMessage: conversation?.lastMessage ?? c.lastMessage,
              lastActivityAt:
                conversation?.lastActivityAt ??
                data.createdAtPlatform ??
                c.lastActivityAt,
              unreadCount: isChatVisible
                ? 0
                : conversation?.unreadCount ?? c.unreadCount,
              lastParticipantMessageAt,
              canReply,
              replyDisabledReason: canReply ? null : "waiting_for_reply",
              // 🔥 FIX: Explicitly preserve these fields
              label: c.label,
              labelIntentConfidence: c.labelIntentConfidence,
              labelLeadSeriousness: c.labelLeadSeriousness,
              followUpStatus: c.followUpStatus,
            };
          })
        );

        setSelectedConversation((prev) => {
          if (!prev || prev._id !== conversationId) return prev;
          const lastParticipantMessageAt =
            conversation?.lastParticipantMessageAt ??
            (isFromThem ? data.createdAtPlatform : prev.lastParticipantMessageAt);
          const canReply = computeCanReply(lastParticipantMessageAt);
          
          // 🔥 FIX: Preserve label-related fields
          return {
            ...prev,
            lastMessage: conversation?.lastMessage ?? prev.lastMessage,
            lastActivityAt:
              conversation?.lastActivityAt ??
              data.createdAtPlatform ??
              prev.lastActivityAt,
            unreadCount: isChatVisible ? 0 : prev.unreadCount,
            lastParticipantMessageAt,
            canReply,
            replyDisabledReason: canReply ? null : "waiting_for_reply",
            // 🔥 FIX: Explicitly preserve these fields
            label: prev.label,
            labelIntentConfidence: prev.labelIntentConfidence,
            labelLeadSeriousness: prev.labelLeadSeriousness,
            followUpStatus: prev.followUpStatus,
          };
        });
      }
    };

    socket.on("inbox:event", handler);
    return () => socket.off("inbox:event", handler);
  }, [selectedConversationId, isMobile, showChat, markConversationAsRead]);

  useEffect(() => {
    const i = setInterval(async () => {
      const res = await axios.get(`${baseUrl}/conversations/sync-status`, {
        withCredentials: true,
      });
      setIsSyncing(res.data.syncing);
    }, 10000);
    return () => clearInterval(i);
  }, []);

    // Compute category for a conversation
const computeCategory = (conv) => {
  const label = conv.label || "General";
  // Ensure we treat null/undefined as false
  const creatorHasReplied = conv.creatorHasReplied === true;

  // Business always goes to business tab
  if (label === "Business") return "business";
  
  // Only Lead conversations go to these tabs
  if (label !== "Lead") return null; 
  
  // 🟢 1. New Leads: Creator has NEVER replied (regardless of read/unread)
  if (!creatorHasReplied) {
    return "new_leads";
  }

  // 🟣 2. Ongoing: Creator HAS replied
  // (Everything else falls here, including active chats with unread messages)
  return "ongoing"; 
};

// Compute lead temperature — only two tiers: hot or warm (no cold)
const computeLeadTemperature = (conv) => {
  const seriousness = conv.labelLeadSeriousness || 0;
  if (seriousness > HOT_LEAD_THRESHOLD) return "hot";
  return "warm";
};

  // Recalculate counts
const recalculateCategoryCounts = (convs) => {
  const counts = {
    new_leads: { total: 0, hot: 0, warm: 0 },
    ongoing: { total: 0, hot: 0, warm: 0 },
    business: { total: 0 },
  };

  for (const conv of convs) {
    // Always recompute category on frontend (backend may still send "unanswered")
    const cat = computeCategory(conv);

    // Skip if category is null (General conversations)
    if (!cat) continue;

    // Always recompute temperature (backend may still send "cold" which we removed)
    const temp = computeLeadTemperature(conv);
    const isHot = temp === "hot";

    if (cat === "new_leads") {
      counts.new_leads.total++;
      if (isHot) counts.new_leads.hot++;
      else if (temp === "warm") counts.new_leads.warm++;
    } else if (cat === "ongoing") {
      counts.ongoing.total++;
      if (isHot) counts.ongoing.hot++;
      else if (temp === "warm") counts.ongoing.warm++;
    } else if (cat === "business") {
      counts.business.total++;
    }
  }

  return counts;
};

// Apply a ±1 delta when a single conversation changes category.
// Used by local mutations (label change, message send, etc.) so that tab badge
// counts stay accurate even when only a page of conversations is loaded in memory.
const applyCountDelta = (prevCounts, oldConv, newConv) => {
  const oldCat = computeCategory(oldConv);
  const newCat = computeCategory(newConv);
  const oldTemp = computeLeadTemperature(oldConv); // "hot" | "warm"
  const newTemp = computeLeadTemperature(newConv);
  if (oldCat === newCat && oldTemp === newTemp) return prevCounts;
  const next = {
    new_leads: { ...prevCounts.new_leads },
    ongoing: { ...prevCounts.ongoing },
    business: { ...prevCounts.business },
  };
  // Remove from old category
  if (oldCat && next[oldCat]) {
    next[oldCat] = { ...next[oldCat], total: Math.max(0, (next[oldCat].total || 0) - 1) };
    if (oldCat !== "business" && oldTemp) {
      next[oldCat] = { ...next[oldCat], [oldTemp]: Math.max(0, (next[oldCat][oldTemp] || 0) - 1) };
    }
  }
  // Add to new category
  if (newCat && next[newCat]) {
    next[newCat] = { ...next[newCat], total: (next[newCat].total || 0) + 1 };
    if (newCat !== "business" && newTemp) {
      next[newCat] = { ...next[newCat], [newTemp]: (next[newCat][newTemp] || 0) + 1 };
    }
  }
  return next;
};

  // Debounced, server-driven search — covers all conversations, not just the loaded page
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (!value.trim()) {
      setSearchResults([]);
      setIsSearchLoading(false);
      return;
    }

    setIsSearchLoading(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await axios.get(`${baseUrl}/conversations/search`, {
          withCredentials: true,
          params: { q: value.trim() },
        });
        setSearchResults(res.data.data || []);
      } catch (err) {
        console.error("Search failed:", err);
        setSearchResults([]);
      } finally {
        setIsSearchLoading(false);
      }
    }, 300);
  };

   const fetchIgConnectionStatus = async () => {
      try {
          const res = await axios.get(`${baseUrl}/instagram-status`, {
          withCredentials: true,
        });
        if(!res.data.instagramConnected){
          navigate('/professional/automations');
        }
      } catch (error) {
        console.error("Failed to fetch connection status:", error);
      }
    };
  
    useEffect(() => {
      fetchIgConnectionStatus();
    }, []);

   const loadInbox = async () => {
      try {
        setLoading(true);
        setInboxError(false);

         setInboxStatus(prev => ({
      ...prev,
      status: "ready",
      isReady: true,
      isProcessing: false,
      needsInitialPull: false,
      needsWhatsApp: false
    }));


        const res = await axios.get(`${baseUrl}/conversations`, {
          withCredentials: true,
          params: { category: "new_leads" },
        });

        const data = res.data?.data || [];

        setConversations(data);
        // Use server-provided counts (aggregation across ALL conversations, not just this page)
        setCategoryCounts(res.data.categoryCounts || recalculateCategoryCounts(data));
        conversationIdSetRef.current = new Set(data.map((c) => c._id));
        setCategoryCursors((prev) => ({ ...prev, new_leads: res.data.nextCursor }));
        setCategoryHasMore((prev) => ({ ...prev, new_leads: res.data.hasMore }));
        loadedCategoriesRef.current.add("new_leads");

        if (data.length === 0) {
          // Conversations may exist in other categories (ongoing/business) even if new_leads is empty.
          // The backend always returns categoryCounts across ALL categories, so check before hydrating.
          const counts = res.data.categoryCounts;
          const hasConversationsElsewhere =
            (counts?.ongoing?.total || 0) > 0 ||
            (counts?.business?.total || 0) > 0;

          if (hasConversationsElsewhere) {
            // Inbox is not empty — user just has no new_leads.
            // Let the tab-switch logic load the correct category. Nothing to hydrate.
            return;
          }

          // Genuinely empty inbox — sync from Meta then retry.
          setHydratingFromMeta(true);
          await axios.post(
            `${baseUrl}/conversations/sync`,
            {},
            { withCredentials: true }
          );

          const retry = async (attempts = 0) => {
            if (attempts >= 5) {
              // Give up after 5 attempts — don't spin forever.
              setHydratingFromMeta(false);
              return;
            }

            const r = await axios.get(`${baseUrl}/conversations`, {
              withCredentials: true,
              params: { category: "new_leads" },
            });

            const fresh = r.data?.data || [];
            const freshCounts = r.data?.categoryCounts;
            const totalAcrossAll =
              (freshCounts?.new_leads?.total || 0) +
              (freshCounts?.ongoing?.total || 0) +
              (freshCounts?.business?.total || 0);

            if (fresh.length > 0 || totalAcrossAll > 0) {
              if (fresh.length > 0) {
                setConversations(fresh);
                conversationIdSetRef.current = new Set(fresh.map((c) => c._id));
                setCategoryCursors((prev) => ({ ...prev, new_leads: r.data.nextCursor }));
                setCategoryHasMore((prev) => ({ ...prev, new_leads: r.data.hasMore }));
                loadedCategoriesRef.current.add("new_leads");
              }
              setCategoryCounts(freshCounts || recalculateCategoryCounts(fresh));
              setHydratingFromMeta(false);
            } else {
              setTimeout(() => retry(attempts + 1), 1500);
            }
          };

          retry();
          return;
        }

        // Don't auto-select any conversation on initial load.
        // User must click a conversation to see its chat history.
      } catch (err) {
        console.error("Load inbox failed:", err);
        setInboxError(true);
      } finally {
        setLoading(false);
      }
    };


  useEffect(() => {
    if (!selectedConversationId) return;
    const socket = getSocket();

    if (socket.connected) {
      socket.emit("join_conversation", { conversationId: selectedConversationId });
    } else {
      socket.once("connect", () => {
        socket.emit("join_conversation", { conversationId: selectedConversationId });
      });
    }

    return () => {
      socket.emit("leave_conversation", { conversationId: selectedConversationId });
    };
  }, [selectedConversationId]);

  useEffect(() => {
    setSelectedConversation(null);
    setSelectedConversationId(null);
    setRawMessages([]); // Clear the messages from memory too

    if (isAutoOpeningRef.current) {
      // Tab switch was triggered by auto-open (?chat= param).
      // handleConversationClick will set the URL and open mobile chat — skip those here
      // to avoid a visible flash (URL gone + chat closed) in the ~300ms gap.
      isAutoOpeningRef.current = false;
      return;
    }

    // Clear chat param from URL only if we've already handled the initial URL param
    // (otherwise we'd wipe ?chat=username before conversations load)
    if (urlChatHandledRef.current || !searchParams.get("chat")) {
      setSearchParams({}, { replace: true });
    }

    // Optional: If on mobile, also close the chat view
    if (isMobile) {
      setShowChat(false);
    }
  }, [activeCategory]);

  const fetchMessages = useCallback(
    async (conversationId, cursorParam = null, isPagination = false) => {
      if (isFetchingMessagesRef.current) return;
      isFetchingMessagesRef.current = true;

      try {
        setLoadingMessages(true);

        const res = await axios.get(
          `${baseUrl}/conversations/${conversationId}/messages`,
          {
            withCredentials: true,
            params: cursorParam
              ? { cursor: JSON.stringify(cursorParam), limit: 25 }
              : { limit: 25 },
          }
        );

        const payload = res.data?.data;
        if (!payload) {
          isFetchingMessagesRef.current = false;
          setLoadingMessages(false);
          return;
        }

        const incomingMessages = payload.messages || [];
        
        if (isPagination) {
          setRawMessages((prevMessages) => {
            const existingIds = new Set(prevMessages.map(m => String(m._id)));
            const uniqueNewMessages = incomingMessages.filter(msg => {
              const id = String(msg._id);
              if (existingIds.has(id)) return false;
              messageIdSetRef.current.add(id);
              return true;
            });
            
            console.log(`📄 Pagination: Adding ${uniqueNewMessages.length} older messages to ${prevMessages.length} existing`);
            
            return [...uniqueNewMessages, ...prevMessages];
          });
        } else {
          messageIdSetRef.current.clear();
          incomingMessages.forEach(msg => messageIdSetRef.current.add(String(msg._id)));
          setRawMessages(incomingMessages);
          console.log(`📥 Initial load: ${incomingMessages.length} messages`);
        }

        setCursor(payload.nextCursor);
        setHasMore(payload.hasMore);
      } catch (err) {
        console.error("Message fetch failed", err);
      } finally {
        setLoadingMessages(false);
        isFetchingMessagesRef.current = false;
      }
    },
    []
  );

  // 🔥 UPDATED: Reset AI insight visibility when conversation changes
  useEffect(() => {
    if (!selectedConversation?._id) return;
    setShowAiInsight(true); // Show AI insight by default when opening a new conversation
  }, [selectedConversation?._id]);

  const firstVisibleMessageRef = useRef(null);
  const scrollPositionBeforePaginateRef = useRef(null);

  useLayoutEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    if (
      fetchModeRef.current === "initial" &&
      messages.length > 0 &&
      !loadingConversation
    ) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight;
          didInitialScrollRef.current = true;
          fetchModeRef.current = "ready";
          console.log("📜 Scrolled to bottom after initial load");
        });
      });
      return;
    }

    if (
      fetchModeRef.current === "paginate" &&
      !loadingMessages &&
      messages.length > 0
    ) {
      requestAnimationFrame(() => {
        if (firstVisibleMessageRef.current) {
          const messageElement = container.querySelector(
            `[data-message-id="${firstVisibleMessageRef.current}"]`
          );
          
          if (messageElement) {
            const messageTop = messageElement.offsetTop;
            const offsetFromTop = scrollPositionBeforePaginateRef.current || 50;
            
            container.scrollTop = messageTop - offsetFromTop;
            console.log(`📜 Restored scroll to message: ${firstVisibleMessageRef.current}`);
          }
          
          firstVisibleMessageRef.current = null;
          scrollPositionBeforePaginateRef.current = null;
        } 
        else if (prevScrollHeightRef.current !== null) {
          const prevHeight = prevScrollHeightRef.current;
          const newScrollHeight = container.scrollHeight;
          const heightDiff = newScrollHeight - prevHeight;
          
          container.scrollTop = heightDiff;
          console.log(`📜 Scroll restore via height: diff=${heightDiff}`);
          
          prevScrollHeightRef.current = null;
        }
        
        fetchModeRef.current = "ready";
      });
    }
  }, [messages.length, loadingMessages, loadingConversation]);

  // Conversations are appended at the BOTTOM (older items), so the browser naturally
  // preserves the viewport — no scrollTop adjustment needed. Just clear the ref.
  useLayoutEffect(() => {
    if (!loadingOlderConversations && prevConvScrollHeightRef.current) {
      prevConvScrollHeightRef.current = null;
    }
  }, [conversations, loadingOlderConversations]);

  const handleScroll = async (e) => {
    const el = e.target;
    
    if (el.scrollTop > 50) return;
    
    if (loadingMessages || syncingOlderRef.current || isFetchingMessagesRef.current) return;

    const captureScrollState = () => {
      const messageElements = el.querySelectorAll('[data-message-id]');
      for (const msgEl of messageElements) {
        const rect = msgEl.getBoundingClientRect();
        const containerRect = el.getBoundingClientRect();
        
        if (rect.top >= containerRect.top && rect.top < containerRect.bottom) {
          firstVisibleMessageRef.current = msgEl.getAttribute('data-message-id');
          scrollPositionBeforePaginateRef.current = rect.top - containerRect.top;
          console.log(`📌 Captured first visible message: ${firstVisibleMessageRef.current}`);
          break;
        }
      }
      
      prevScrollHeightRef.current = el.scrollHeight;
    };

    if (hasMore && cursor) {
      console.log("📄 Paginating from DB with cursor:", cursor);
      
      fetchModeRef.current = "paginate";
      captureScrollState();
      
      await fetchMessages(selectedConversationId, cursor, true);
      return;
    }

    if (!hasMore && !syncingOlderRef.current) {
      console.log("🌐 DB exhausted → fetching older messages from Instagram");
      
      syncingOlderRef.current = true;
      fetchModeRef.current = "paginate";
      captureScrollState();

      setLoadingMessages(true);

      try {
        const res = await axios.post(
          `${baseUrl}/conversations/${selectedConversationId}/sync-older`,
          {},
          { withCredentials: true }
        );

        const older = res.data?.data?.messages || [];

        if (older.length > 0) {
          setRawMessages((prevMessages) => {
            const existingIds = new Set(prevMessages.map(m => String(m._id)));
            const uniqueNewMessages = older.filter(msg => {
              const id = String(msg._id);
              if (existingIds.has(id)) return false;
              messageIdSetRef.current.add(id);
              return true;
            });
            
            console.log(`🌐 Meta sync: Adding ${uniqueNewMessages.length} older messages to ${prevMessages.length} existing`);
            
            return [...uniqueNewMessages, ...prevMessages];
          });

          setCursor(res.data.data.nextCursor);
          setHasMore(res.data.data.hasMore !== false);
        } else {
          console.log("ℹ️ Meta returned no older messages");
          setHasMore(false);
        }
      } catch (err) {
        console.error("❌ Meta sync failed:", err);
      } finally {
        syncingOlderRef.current = false;
        setLoadingMessages(false);
      }
    }
  };

  const sendMessage = async () => {
    if (sending || !selectedConversation) return;
    if (!messageText.trim() && !selectedFile) return;

    setSending(true);

    const textToSend = messageText.trim();
    const fileToSend = selectedFile;
    const fileTypeToSend = selectedFileType;

    setMessageText("");
    handleRemoveFile();

    try {
      if (fileToSend) {
        if (fileTypeToSend === "pdf" || fileTypeToSend === "excel") {
          // Step 1: upload file to GCS, get public URL
          const uploadForm = new FormData();
          uploadForm.append("file", fileToSend);
          const uploadRes = await axios.post(
            `${baseUrl}/inbox/upload-pdf`,
            uploadForm,
            { withCredentials: true, headers: { "Content-Type": "multipart/form-data" } }
          );
          const fileUrl = uploadRes.data.url;
          const textLabel = fileTypeToSend === "excel" ? "Here is the Excel" : "Here is the PDF";
          // Step 2: send as a plain text message
          await axios.post(
            `${baseUrl}/conversations/${selectedConversation._id}/messages`,
            { text: `${textLabel}: ${fileUrl}`, type: "text" },
            { withCredentials: true }
          );
        } else {
          // Image / video upload (unchanged)
          const formData = new FormData();
          formData.append("file", fileToSend);
          formData.append("type", fileToSend.type.startsWith("video") ? "video" : "image");
          await axios.post(
            `${baseUrl}/conversations/${selectedConversation._id}/messages`,
            formData,
            { withCredentials: true, headers: { "Content-Type": "multipart/form-data" } }
          );
        }
      }

      if (textToSend) {
        await axios.post(
          `${baseUrl}/conversations/${selectedConversation._id}/messages`,
          { text: textToSend, type: "text" },
          { withCredentials: true }
        );
      }

setConversations((prev) => {
        const updated = prev.map((c) => {
          if (c._id === selectedConversation._id) {
            // 1. Construct the updated conversation object
            const updatedConv = {
              ...c,
              creatorHasReplied: true, // You replied!
              unreadCount: 0,          // It's definitely read now
              lastActivityAt: new Date(),
              lastMessage: {
                text: fileTypeToSend === "pdf" ? "Sent a PDF" : fileTypeToSend === "excel" ? "Sent an Excel" : (textToSend || "Sent an attachment"),
                type: fileToSend && fileTypeToSend !== "pdf" && fileTypeToSend !== "excel" ? "image" : "text",
                sender: "me",
                timestamp: new Date(),
              }
            };

            // 2. 🔥 CRITICAL: Recalculate category immediately (new_leads → ongoing)
            updatedConv.category = computeCategory(updatedConv);

            // 3. Apply delta to counts (accurate even with partial page loaded)
            setCategoryCounts((counts) => applyCountDelta(counts, c, updatedConv));

            return updatedConv;
          }
          return c;
        });

        return updated;
      });

    // Sent confirmation toast
    setShowSentToast(true);
    setTimeout(() => setShowSentToast(false), 1800);

    } catch (err) {
      console.error("Send message failed", err);
      const errMsg = err?.response?.data?.error === "DM_RATE_LIMIT"
        ? "Meta DM rate limit reached (180/hr). Please wait a moment."
        : "Failed to send. Please try again.";
      setSendError(errMsg);
      setTimeout(() => setSendError(null), 4000);
      // Restore text
      setMessageText(textToSend);
      // Restore file if one was selected
      if (fileToSend) {
        setSelectedFile(fileToSend);
        setSelectedFileType(fileTypeToSend);
        if (fileTypeToSend === "image") {
          setPreviewUrl(URL.createObjectURL(fileToSend));
        }
      }
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const WINDOW_MS = 24 * 60 * 60 * 1000;

  function computeCanReply(lastParticipantMessageAt) {
    if (!lastParticipantMessageAt) return false;
    return Date.now() - new Date(lastParticipantMessageAt).getTime() <= WINDOW_MS;
  }

  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      const ta = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
      const tb = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
      return tb - ta;
    });
  }, [conversations]);



  // 🔥 UPDATED: Filter conversations based on new tab logic

// NEW
const filteredConversations = useMemo(() => {
  const query = searchQuery.trim();

  // When searching, use server-side results (covers ALL conversations, not just loaded page)
  if (query) {
    return searchResults;
  }

  // No search query — apply category & sub-filter as before
  return sortedConversations
    .filter((c) => {
      const convCategory = computeCategory(c);
      if (!convCategory) return false;
      if (convCategory !== activeCategory) return false;

      if (activeSubFilter === "all") return true;
      if (activeSubFilter === "hot") return computeLeadTemperature(c) === "hot";
      if (activeSubFilter === "warm") return computeLeadTemperature(c) === "warm";
      return true;
    });
}, [sortedConversations, activeCategory, activeSubFilter, searchQuery, searchResults, selectedConversationId]);

  // Auto-paginate when a hot/warm sub-filter shows fewer than 20 conversations.
  // Warm and hot leads are interleaved in the time-sorted page, so a single page of 20
  // "ongoing" conversations might be 17 hot + 3 warm. Keep fetching pages until we have
  // ≥20 visible for the active sub-filter, or all pages are exhausted.
  useEffect(() => {
    if (activeSubFilter === "all") return;
    if (filteredConversations.length >= 20) return;
    // If we've already loaded all available items for this sub-filter (per server counts),
    // stop fetching — even if categoryHasMore is true and more pages exist in the category.
    // e.g. 4 hot + 2 warm total: warm shows 2, subFilterTotal=2, 2>=2 → stop.
    const subFilterTotal = categoryCounts?.[activeCategory]?.[activeSubFilter];
    if (subFilterTotal > 0 && filteredConversations.length >= subFilterTotal) return;

    // Race-condition fix: if this category's first page was never successfully loaded
    // (e.g. loadCategoryFirstPage was blocked by a concurrent loadingConversationsRef lock
    // when the user switched tabs), retry it now. Once it completes, conversations.length
    // will change and this effect will re-fire with a valid cursor.
    if (!loadedCategoriesRef.current.has(activeCategory)) {
      if (!loadingConversationsRef.current) {
        loadCategoryFirstPage(activeCategory);
      }
      return; // Wait — effect will re-run when conversations.length changes
    }

    if (!categoryHasMore[activeCategory] || !categoryCursors[activeCategory]) return;
    if (loadingConversationsRef.current) return;

    loadOlderConversations(activeCategory);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredConversations.length, conversations.length, activeCategory, activeSubFilter, categoryCounts]);

  const handleLabelChange = async (label) => {
    if (!selectedConversation) return;

    const convId = selectedConversation._id;

   setConversations((prev) => {
  const updated = prev.map((c) => {
    if (c._id !== convId) return c;
    const newConv = { ...c, label, labelSource: "manual" };
    setCategoryCounts((counts) => applyCountDelta(counts, c, newConv));
    return newConv;
  });
  return updated;
});

    setSelectedConversation((prev) =>
      prev ? { ...prev, label, labelSource: "manual" } : prev
    );

    setLabelAnchor(null);
    setMenuAnchor(null);

    try {
      await axios.patch(
        `${baseUrl}/conversations/${convId}/label`,
        { label },
        { withCredentials: true }
      );
    } catch (err) {
      console.error("Failed to save label", err);
      alert("Failed to save label. Please retry.");
    }
  };

  const displayName =
    selectedConversation?.participant?.name ||
    selectedConversation?.participant?.username ||
    "Instagram User";

  const showUsername =
    selectedConversation?.participant?.username || "Instagram User";
  const canReply = selectedConversation?.canReply === true;

  const waitingMessage = `24h window closed. Reply on Instagram to re-open: ${showUsername}`;

  const formatPreviewTime = (date) => {
    const d = new Date(date);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    return isToday
      ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString([], { day: "2-digit", month: "short" });
  };

const handleConversationClick = async (conv) => {
    const isSameConversation = selectedConversationId === conv._id;

    if (isSameConversation && !isMobile) {
      return;
    }

    setLoadingConversation(true);
    
    // 1. Reset Message View State
    setRawMessages([]);
    messageIdSetRef.current.clear();
    setCursor(null);
    setHasMore(true);
    fetchModeRef.current = "initial";
    setAiQuickReplies([]);
    
    // 2. Set Selection (Optimistic UI)
    // We trust 'conv' initially because it already has the correct Name & Avatar
    setSelectedConversation(conv);
    setSelectedConversationId(conv._id);

    // 2b. Update URL with chat param
    const username = conv.participant?.username;
    if (username) {
      setSearchParams({ chat: username }, { replace: true });
    }

    if (isMobile) {
      setShowChat(true);
    }

    // 3. Optimistic Read Mark
    if (conv.unreadCount > 0) {
      setConversations((prev) =>
        prev.map((c) => (c._id === conv._id ? { ...c, unreadCount: 0 } : c))
      );
      
      axios.post(
        `${baseUrl}/conversations/${conv._id}/mark-read`,
        {},
        { withCredentials: true }
      ).catch(e => console.error("mark-read failed", e));
    }

    try {
      // 4. THE OPTIMIZED CALL
      const res = await axios.post(
        `${baseUrl}/conversations/${conv._id}/sync-latest`,
        {},
        { withCredentials: true }
      );

      let updatedConvData = res.data?.data?.conversation; 
      const syncedMessages = res.data?.data?.messages;

      // 5. SAFETY NET: Frontend Authority Override for Follow Up
   // 5. SAFETY NET: Frontend Authority Override for Follow Up
// Check the LAST message to determine if creator has replied
if (syncedMessages && Array.isArray(syncedMessages) && syncedMessages.length > 0) {
   // Sort to ensure we get the actual latest message
   const sortedMessages = [...syncedMessages].sort(
     (a, b) => new Date(b.createdAtPlatform) - new Date(a.createdAtPlatform)
   );
   const lastMessage = sortedMessages[0]; // Newest message after sorting
   
   if (lastMessage.sender === 'me') {
      console.log('[handleConversationClick] Creator replied last, clearing followUp status');
      updatedConvData = {
         ...updatedConvData, 
         followUpStatus: { 
           needed: false,
           reason: null,
           clearedAt: new Date(),
           clearedReason: "creator_replied"
         },
         unreadCount: 0,
         creatorHasReplied: true
      };
   }
}

      // 6. 🔥 FIX: Safe Merge & Re-Calculation
      // We don't just set updatedConvData. We merge it carefully.
      if (updatedConvData) {
        // A. Re-calculate the 24h window (Backend doesn't send 'canReply' boolean)
        const lastParticipantMsg = updatedConvData.lastParticipantMessageAt || conv.lastParticipantMessageAt;
        const isWithinWindow = computeCanReply(lastParticipantMsg);

        // B. Construct the final object
        // NOTE: sync-latest returns the raw DB document. Raw field names differ from
        // the enriched names used by GET /conversations (and expected by computeCategory,
        // computeLeadTemperature, etc.). We must re-map them here to avoid overwriting
        // the correctly-enriched values that came from the initial load.
        const finalConvData = {
            ...conv,               // 1. Keep existing UI data (Good Name, Avatar)
            ...updatedConvData,    // 2. Overwrite with fresh backend data (New Status)
            // 3. Re-map raw DB field names → enriched names used by the UI
            label: updatedConvData?.conversationIntent || conv.label,
            labelIntentConfidence: updatedConvData?.conversationIntentConfidence ?? conv.labelIntentConfidence,
            labelLeadSeriousness: updatedConvData?.conversationLeadSeriousness ?? conv.labelLeadSeriousness,
            // 4. Ensure critical fields are set correctly
            canReply: isWithinWindow,
            replyDisabledReason: isWithinWindow ? null : "waiting_for_reply",
            participant: updatedConvData.participant?.username ? updatedConvData.participant : conv.participant, // prevent "Instagram User"
            unreadCount: 0
        };

        setConversations((prev) => {
          return prev.map((c) => {
            if (c._id !== conv._id) return c;
            setCategoryCounts((counts) => applyCountDelta(counts, c, finalConvData));
            return finalConvData;
          });
        });

        // Update the header with the FIXED object
        setSelectedConversation(finalConvData);

        // Load AI-generated quick replies cached on the conversation document
        const suggestions = finalConvData?.quickReplies?.suggestions || [];
        setAiQuickReplies(suggestions);
      }

      // 7. Handle Messages
      if (syncedMessages && Array.isArray(syncedMessages)) {
         messageIdSetRef.current.clear();
         syncedMessages.forEach(msg => messageIdSetRef.current.add(String(msg._id)));
         setRawMessages(syncedMessages);
         // Set cursor/hasMore so scroll-up pagination works immediately
         setCursor(res.data.data.nextCursor || null);
         setHasMore(res.data.data.hasMore !== false);
      } else {
         await fetchMessagesForConversation(conv._id);
      }
      
    } catch (err) {
      console.error("Sync failed:", err);
      await fetchMessagesForConversation(conv._id);
    } finally {
      setLoadingConversation(false);
    }
  };
  
const fetchMessagesForConversation = async (conversationId) => {
  try {
    const res = await axios.get(
      `${baseUrl}/conversations/${conversationId}/messages`,
      {
        withCredentials: true,
        params: { limit: 25 },
      }
    );

    const payload = res.data?.data;
    if (!payload) {
      setLoadingConversation(false);
      return;
    }

    const newMessages = payload.messages || [];
    
    messageIdSetRef.current.clear();
    newMessages.forEach(msg => messageIdSetRef.current.add(String(msg._id)));
    
    setRawMessages(newMessages);
    setCursor(payload.nextCursor);
    setHasMore(payload.hasMore);

    // 🔥 NEW: Safety check - if last message is from creator, clear followUp
    if (newMessages.length > 0) {
      const sortedMessages = [...newMessages].sort(
        (a, b) => new Date(b.createdAtPlatform) - new Date(a.createdAtPlatform)
      );
      const lastMessage = sortedMessages[0];
      
      if (lastMessage.sender === 'me') {
        setSelectedConversation(prev => {
          if (!prev || prev._id !== conversationId) return prev;
          if (prev.followUpStatus?.needed !== true) return prev; // No change needed
          
          return {
            ...prev,
            followUpStatus: {
              needed: false,
              reason: null
            },
            creatorHasReplied: true
          };
        });
        
        setConversations(prev =>
          prev.map(c => {
            if (c._id !== conversationId) return c;
            if (c.followUpStatus?.needed !== true) return c; // No change needed
            const newConv = {
              ...c,
              followUpStatus: { needed: false, reason: null },
              creatorHasReplied: true,
            };
            setCategoryCounts((counts) => applyCountDelta(counts, c, newConv));
            return newConv;
          })
        );
      }
    }
    
  } catch (err) {
    console.error("Message fetch failed", err);
  } finally {
    setLoadingConversation(false);
  }
};

  const handleBackToList = () => {
    setShowChat(false);
    // Clear chat param from URL when going back to conversation list
    setSearchParams({}, { replace: true });
  };

  // 🔥 UPDATED: Helper function to get label display text and style
const getLabelConfig = (conv) => {
  const classification = classifyConversation(conv);
  
  return {
    label: classification.effectiveLabel,
    isHotLead: classification.isHotLead,
    displayText: classification.displayLabel,
    style: classification.isFollowUp 
      ? LABEL_STYLES["Follow Up"]
      : classification.isHotLead 
        ? LABEL_STYLES.HotLead 
        : LABEL_STYLES[classification.effectiveLabel] || LABEL_STYLES.General,
  };
};

  // 🔥 NEW: Check if conversation needs follow-up (and is not Business)
  const isFollowUpConversation = (conv) => {
    return conv?.followUpStatus?.needed === true && conv?.label !== "Business";
  };

  // 🔥 NEW: Get AI insight reason text
  const getAiInsightReason = (conv) => {
     return conv?.followUpStatus?.needed === true && conv?.followUpStatus?.reason;
  };

  // Renders message text with clickable URLs (open in new tab) and clickable phone numbers
  const renderMessageText = (text, isMe) => {
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
    const phoneRegex = /(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3,5}[\s-]?\d{3,5}/g;

    // Collect all matches with their type and position
    const matches = [];
    let m;

    while ((m = urlRegex.exec(text)) !== null) {
      matches.push({ type: "url", index: m.index, end: m.index + m[0].length, value: m[0] });
    }

    while ((m = phoneRegex.exec(text)) !== null) {
      const digits = m[0].replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 13) continue;
      // Skip if this position is already inside a URL match
      const insideUrl = matches.some((u) => u.type === "url" && m.index >= u.index && m.index < u.end);
      if (!insideUrl) {
        matches.push({ type: "phone", index: m.index, end: m.index + m[0].length, value: m[0], digits });
      }
    }

    if (matches.length === 0) return text;

    // Sort by appearance order
    matches.sort((a, b) => a.index - b.index);

    const parts = [];
    let lastIndex = 0;

    for (const match of matches) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }

      if (match.type === "url") {
        parts.push(
          <Box
            component="a"
            key={`url-${match.index}`}
            href={match.value}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            sx={{
              color: isMe ? "#C4B5FD" : "#4D2B8C",
              textDecoration: "underline",
              wordBreak: "break-all",
              cursor: "pointer",
              "&:hover": { opacity: 0.75 },
            }}
          >
            {match.value}
          </Box>
        );
      } else {
        parts.push(
          <Box
            component="span"
            key={`phone-${match.index}`}
            onClick={(e) => {
              e.stopPropagation();
              setWhatsappPhoneDialog(match.digits);
            }}
            sx={{
              color: isMe ? "#C4B5FD" : "#4D2B8C",
              textDecoration: "underline",
              textDecorationStyle: "dotted",
              cursor: "pointer",
              fontWeight: 600,
              "&:hover": { textDecorationStyle: "solid" },
            }}
          >
            {match.value}
          </Box>
        );
      }

      lastIndex = match.end;
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts;
  };

  /* ========================================================= */
  /* RENDER - CONVERSATION LIST                                 */
  /* ========================================================= */
  const renderConversationList = () => (
    <Box
      sx={{
        width: isMobile ? "100%" : 360,
        height: "100%",
        maxHeight: "100%",
        bgcolor: "#FAFBFD",
        borderRight: isMobile ? "none" : "1px solid #E8EAF0",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Search - Fixed at top */}
      <Box
        px={2}
        pt={isMobile ? 1 : 2}
        pb={1}
        sx={{
          flexShrink: 0,
          background: "linear-gradient(180deg, #F3F0FA 0%, #FAFBFD 100%)",
        }}
      >
        <TextField
          fullWidth
          size="small"
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={handleSearchChange}
          InputProps={{
            startAdornment: (
              <Search sx={{ mr: 1, color: "text.secondary", fontSize: 20 }} />
            ),
          }}
          sx={{
            "& .MuiOutlinedInput-root": {
              borderRadius: "24px",
              bgcolor: "#f8fafc",
              fontSize: isMobile ? "16px" : "0.9rem",
              "& fieldset": { border: "none" },
            },
            "& .MuiInputBase-input": {
              fontSize: isMobile ? "16px" : "0.9rem",
            },
          }}
        />
      </Box>

      {/* 🔥 UPDATED: Filter Chips with new tabs */}
      {/* 1. Main Category Tabs */}
      <Box
        px={2}
        pb={1}
        sx={{
          display: "flex",
          gap: 0.75,
          overflowX: "auto",
          flexShrink: 0,
          bgcolor: "transparent",
          "&::-webkit-scrollbar": { display: "none" },
          scrollbarWidth: "none",
        }}
      >
        {CATEGORY_TABS.map((tab) => {
          const isActive = activeCategory === tab.key;
          const count = categoryCounts[tab.key]?.total || 0;
          const hasHotLeads = tab.key === "new_leads" && (categoryCounts.new_leads?.hot || 0) > 0;

          // Per-tab active colors
          const activeColor =
            tab.key === "new_leads" ? "#16A34A" :
            tab.key === "business"  ? "#EA6C00" :
            "#4D2B8C";
          const activeHover =
            tab.key === "new_leads" ? "#15803D" :
            tab.key === "business"  ? "#C2540A" :
            "#3E2271";

          return (
            <Chip
              key={tab.key}
              clickable
              size="small"
              onClick={() => {
                setActiveCategory(tab.key);
                setActiveSubFilter((tab.key === "ongoing" || tab.key === "new_leads") ? "hot" : "all");
                setSelectedConversation(null);
                setSelectedConversationId(null);
                setRawMessages([]);
                if (!loadedCategoriesRef.current.has(tab.key)) {
                  loadCategoryFirstPage(tab.key);
                }
              }}
              sx={{
                bgcolor: isActive ? activeColor : "#F1F3F4",
                color: isActive ? "#fff" : "#374151",
                fontFamily: "Inter",
                fontSize: isSmallMobile ? "0.7rem" : "0.8rem",
                height: isSmallMobile ? 32 : 36,
                flexShrink: 0,
                transition: "all 0.2s ease",
                "&:hover": {
                  bgcolor: isActive ? activeHover : "#E5E7EB",
                },
              }}
              label={
                <Box display="flex" alignItems="center" gap={0.75}>
                  <span>{tab.label}</span>

                  {/* Pulsing hot dot — only on New Leads when there are hot leads and tab is inactive */}
                  {hasHotLeads && !isActive && (
                    <Box
                      sx={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        bgcolor: "#EF4444",
                        flexShrink: 0,
                        animation: "hotDotPulse 1.5s ease-in-out infinite",
                        "@keyframes hotDotPulse": {
                          "0%, 100%": { opacity: 1, transform: "scale(1)" },
                          "50%": { opacity: 0.5, transform: "scale(1.5)" },
                        },
                      }}
                    />
                  )}

                  {/* Count badge */}
                  {count > 0 && (
                    <Box
                      component="span"
                      sx={{
                        bgcolor: isActive ? "#fff" : activeColor,
                        color: isActive ? activeColor : "#fff",
                        fontSize: "0.6rem",
                        fontWeight: 700,
                        height: 18,
                        minWidth: 18,
                        px: 0.5,
                        borderRadius: "999px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {count}
                    </Box>
                  )}
                </Box>
              }
            />
          );
        })}
      </Box>

      {/* 2. Sub-Filters (Dynamic based on selected Category) */}
      {SUB_FILTERS[activeCategory] && SUB_FILTERS[activeCategory].length > 0 && (
        <Box
          px={2}
          pb={1}
          sx={{
            display: "flex",
            gap: 0.75,
            overflowX: "auto",
            flexShrink: 0,
            bgcolor: "transparent",
            "&::-webkit-scrollbar": { display: "none" },
            scrollbarWidth: "none",
          }}
        >
          {SUB_FILTERS[activeCategory].map((filter) => {
            const isActive = activeSubFilter === filter.key;
            
            // Get specific count (e.g., categoryCounts.new_leads.hot)
            const currentCategoryData = categoryCounts[activeCategory] || {};
            const count = currentCategoryData[filter.key] || 0;

            return (
              <Chip
                key={filter.key}
                clickable
                size="small"
                onClick={() => {
                  setActiveSubFilter(filter.key);
                  if (convListRef.current) convListRef.current.scrollTop = 0;
                }}
                sx={{
                  bgcolor: isActive ? "#F3E8FF" : "rgba(255,255,255,0.8)", // Light purple bg for active sub-filter
                  color: isActive ? "#4D2B8C" : "#6B7280",
                  border: isActive ? "1px solid #4D2B8C" : "1px solid #E5E7EB",
                  fontFamily: "Inter",
                  fontSize: "0.75rem",
                  height: 28,
                  flexShrink: 0,
                  "&:hover": {
                    bgcolor: isActive ? "#E9D5FF" : "#F9FAFB",
                  },
                }}
                label={
                  <Box display="flex" alignItems="center" gap={0.5}>
                    <span>{filter.label}</span>
                    {count > 0 && (
                      <Box
                        component="span"
                        sx={{
                          bgcolor: isActive ? "#4D2B8C" : "#6B7280",
                          color: "#fff",
                          fontSize: "0.6rem",
                          fontWeight: 700,
                          height: 16,
                          minWidth: 16,
                          px: 0.4,
                          borderRadius: "999px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {count}
                      </Box>
                    )}
                  </Box>
                }
              />
            );
          })}
        </Box>
      )}

      {/* Conversation List - Only this part scrolls */}
      <Box
        ref={convListRef}
        sx={{ 
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          WebkitOverflowScrolling: "touch",
        }}
        onScroll={handleConvScroll}
      >
        {loading || hydratingFromMeta || isSearchLoading ? (
          <Box px={2}>
            {[...Array(6)].map((_, i) => (
              <Box key={i} display="flex" gap={2} py={2}>
                <Skeleton variant="circular" width={48} height={48} />
                <Box flex={1}>
                  <Skeleton width="60%" height={18} />
                  <Skeleton width="80%" height={14} sx={{ mt: 0.5 }} />
                </Box>
              </Box>
            ))}
          </Box>
      ) : inboxError ? (
          <Box px={3} py={6} display="flex" flexDirection="column" alignItems="center" gap={2}>
            <Typography variant="body2" color="error" textAlign="center">
              Failed to load conversations
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={() => loadInbox()}
              sx={{ borderRadius: "20px", textTransform: "none", fontSize: "0.8rem" }}
            >
              Retry
            </Button>
          </Box>
      ) : filteredConversations.length === 0 && !loadingOlderConversations &&
          (activeSubFilter !== "all"
            ? (categoryCounts?.[activeCategory]?.[activeSubFilter] ?? -1) === 0
            : (categoryCounts?.[activeCategory]?.total ?? -1) === 0) ? (
  activeSubFilter !== "all" ? (
    // Sub-filter is active but has no results — don't show the generic category empty state,
    // which would mislead the user into thinking there are no conversations at all.
    <Box px={3} py={6} display="flex" flexDirection="column" alignItems="center" gap={1.5}>
      <Typography variant="body2" color="text.secondary" textAlign="center" fontWeight={500}>
        No {activeSubFilter === "hot" ? "🔥 hot" : "🟡 warm"} leads here
      </Typography>
      <Typography variant="caption" color="text.disabled" textAlign="center">
        {activeSubFilter === "hot"
          ? "Switch to Warm Leads to see less urgent conversations"
          : "Switch to Hot Leads to see your most urgent conversations"}
      </Typography>
    </Box>
  ) : (
    <EmptyStateUI category={activeCategory} isMobile={isMobile} />
  )
) : filteredConversations.length === 0 ? (
  // Conversations exist on server (count > 0) but none in memory yet for this sub-filter.
  // Show a skeleton while auto-paginate loads more pages — never show a blank screen.
  <Box px={2} py={2}>
    {[...Array(3)].map((_, i) => (
      <Box key={`subfilter-sk-${i}`} display="flex" gap={2} py={1.5}>
        <Skeleton variant="circular" width={48} height={48} />
        <Box flex={1}>
          <Skeleton width="60%" height={16} sx={{ mb: 0.5 }} />
          <Skeleton width="80%" height={14} />
        </Box>
      </Box>
    ))}
  </Box>
) : (
  <>
    {filteredConversations.map((conv) => {
              const uname =
                conv.participant?.name ||
                conv.participant?.username ||
                "Instagram User";
              const isSelected = selectedConversation?._id === conv._id;
              const previewDate =
                conv.lastActivityAt || conv.lastMessage?.timestamp || null;

              // Get label configuration
              const labelConfig = getLabelConfig(conv);
              const isHotCard = computeLeadTemperature(conv) === "hot";
              const waitingInfo = getWaitingTime(conv);
              const countdown = get24hCountdown(conv);

              return (
                <Box
                  key={conv._id}
                  px={2}
                  py={1.5}
                  onClick={() => handleConversationClick(conv)}
                  sx={{
                    cursor: "pointer",
                    position: "relative",
                    bgcolor: isSelected && !isMobile ? "#EDE7F9" : "transparent",
                    transition: "all 0.2s ease",
                    borderLeft: isSelected && !isMobile
                      ? "3px solid #4D2B8C"
                      : isHotCard
                      ? "3px solid #EF4444"
                      : "3px solid transparent",
                    boxShadow: isHotCard && !isSelected
                      ? "inset 3px 0 10px rgba(239, 68, 68, 0.07)"
                      : "none",
                    "&:hover": {
                      bgcolor: isSelected ? "#EDE7F9" : "rgba(77, 43, 140, 0.04)",
                    },
                    "&:active": {
                      bgcolor: "#EDE7F9",
                      transform: "scale(0.99)",
                    },
                  }}
                >
                  <Box display="flex" gap={1.5} alignItems="center">
                    <Badge
                      overlap="circular"
                      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                      badgeContent={
                        conv.unreadCount > 0 ? (
                          <Box
                            sx={{
                              width: 12,
                              height: 12,
                              borderRadius: "50%",
                              bgcolor: "#4D2B8C",
                              border: "2px solid #fff",
                            }}
                          />
                        ) : null
                      }
                    >
                      <Avatar
                        src={conv.participant?.profilePic || undefined}
                        sx={{
                          width: isMobile ? 48 : 44,
                          height: isMobile ? 48 : 44,
                          border: conv.unreadCount > 0 ? "2px solid #4D2B8C" : "none",
                        }}
                      >
                        {!conv.participant?.profilePic && uname[0]?.toUpperCase()}
                      </Avatar>
                    </Badge>

                    <Box flex={1} minWidth={0}>
                      <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Typography
                          fontWeight={conv.unreadCount > 0 ? 700 : 500}
                          fontSize={isMobile ? "0.95rem" : "0.9rem"}
                          noWrap
                          sx={{ color: conv.unreadCount > 0 ? "#1e293b" : "#374151" }}
                        >
                          {uname}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          fontSize="0.7rem"
                        >
                          {previewDate && formatPreviewTime(previewDate)}
                        </Typography>
                      </Box>

                      <Box display="flex" justifyContent="space-between" alignItems="center" mt={0.25}>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          noWrap
                          sx={{
                            maxWidth: isMobile ? "200px" : "180px",
                            fontSize: "0.8rem",
                            fontWeight: conv.unreadCount > 0 ? 500 : 400,
                          }}
                        >
                          {getLastMessagePreview(conv.lastMessage)}
                        </Typography>

                        {conv.unreadCount > 0 && (
                          <Box
                            sx={{
                              bgcolor: "#4D2B8C",
                              color: "#fff",
                              fontSize: "0.65rem",
                              fontWeight: 700,
                              minWidth: 18,
                              height: 18,
                              borderRadius: "9px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              px: 0.5,
                            }}
                          >
                            {conv.unreadCount}
                          </Box>
                        )}
                      </Box>

                      {/* Label chips + urgency signals */}
{(() => {
  const convLabelConfig = getConversationLabelConfig(conv);
  return (
    <Box display="flex" gap={0.5} mt={0.75} flexWrap="wrap" alignItems="center">
      {/* Main label chip */}
      {convLabelConfig && (
        <Chip
          size="small"
          label={convLabelConfig.displayText}
          sx={{
            bgcolor: convLabelConfig.style.bg,
            color: convLabelConfig.style.text,
            fontSize: "0.65rem",
            fontFamily: "Inter",
            fontWeight: 600,
            height: "20px",
            "& .MuiChip-label": { px: 0.75 },
          }}
        />
      )}

      {/* Pulsing "● Reply Needed" indicator */}
      {convLabelConfig?.showFollowUp && (
        <Box display="flex" alignItems="center" gap={0.4}>
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              bgcolor: "#EF4444",
              flexShrink: 0,
              animation: "replyNeededPulse 1.2s ease-in-out infinite",
              "@keyframes replyNeededPulse": {
                "0%, 100%": { opacity: 1 },
                "50%": { opacity: 0.3 },
              },
            }}
          />
          <Typography
            component="span"
            sx={{ fontSize: "0.65rem", fontFamily: "Inter", fontWeight: 700, color: "#EF4444" }}
          >
            Reply Needed
          </Typography>
        </Box>
      )}

      {/* Waiting time chip — shown when creator hasn't replied yet */}
      {waitingInfo && (
        <Chip
          size="small"
          label={`⏳ ${waitingInfo.label}`}
          sx={{
            bgcolor: waitingInfo.urgent ? "#FEF2F2" : "#FFFBEB",
            color: waitingInfo.urgent ? "#DC2626" : "#92400E",
            fontSize: "0.6rem",
            fontFamily: "Inter",
            fontWeight: 600,
            height: "18px",
            border: `1px solid ${waitingInfo.urgent ? "#FECACA" : "#FDE68A"}`,
            "& .MuiChip-label": { px: 0.6 },
          }}
        />
      )}

      {/* 24h countdown chip — only shows when reply window is narrowing */}
      {countdown && !waitingInfo && (
        <Chip
          size="small"
          label={`🕐 ${countdown.label}`}
          sx={{
            bgcolor: countdown.urgent ? "#FEF2F2" : "#F0FDF4",
            color: countdown.urgent ? "#DC2626" : "#166534",
            fontSize: "0.6rem",
            fontFamily: "Inter",
            fontWeight: 600,
            height: "18px",
            border: `1px solid ${countdown.urgent ? "#FECACA" : "#BBF7D0"}`,
            animation: countdown.urgent ? "countdownUrgent 1.8s ease-in-out infinite" : "none",
            "@keyframes countdownUrgent": {
              "0%, 100%": { opacity: 1 },
              "50%": { opacity: 0.6 },
            },
            "& .MuiChip-label": { px: 0.6 },
          }}
        />
      )}
    </Box>
  );
})()}

{/* Lead seriousness heat bar at card bottom */}
{conv.labelLeadSeriousness > 0 && (
  <Box
    sx={{
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      height: 3,
      bgcolor: "rgba(0,0,0,0.04)",
    }}
  >
    <Box
      sx={{
        height: "100%",
        width: `${Math.min((conv.labelLeadSeriousness || 0) * 100, 100)}%`,
        background: (conv.labelLeadSeriousness || 0) > HOT_LEAD_THRESHOLD
          ? "linear-gradient(90deg, #FCD34D, #F97316, #EF4444)"
          : "linear-gradient(90deg, #86EFAC, #FCD34D)",
        borderRadius: "0 2px 0 0",
        transition: "width 0.8s ease",
      }}
    />
  </Box>
)}
                    </Box>
                  </Box>
                </Box>
              );
            })}

            {(loadingOlderConversations || loadingMetaConversations) && (
              <Box px={2} py={2}>
                {[...Array(2)].map((_, i) => (
                  <Box key={`skeleton-${i}`} display="flex" gap={2} py={1.5}>
                    <Skeleton variant="circular" width={48} height={48} />
                    <Box flex={1}>
                      <Skeleton width="60%" height={16} />
                      <Skeleton width="80%" height={14} />
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </>
        )}
      </Box>
    </Box>
  );

  /* ========================================================= */
  /* RENDER - AI INSIGHT POPUP (Now rendered outside scroll)   */
  /* ========================================================= */
  const renderAiInsightPopup = () => {
    const reason = getAiInsightReason(selectedConversation);
    const isFollowUp = isFollowUpConversation(selectedConversation);
    
    if (!isFollowUp || !reason || !showAiInsight) return null;

    return (
      <Box
        sx={{
          position: "absolute",
          top: isMobile ? 64 : 72,
          left: isMobile ? 12 : 16,
          right: isMobile ? 12 : 16,
          zIndex: 100,
          bgcolor: "rgba(255, 250, 250, 0.98)",
          borderRadius: "12px",
          boxShadow: "0 4px 20px rgba(239, 68, 68, 0.12)",
          border: "1px solid rgba(239, 68, 68, 0.25)",
          borderLeft: "3px solid #EF4444",
          p: isMobile ? 1.5 : 2,
          display: "flex",
          alignItems: "flex-start",
          gap: 1.5,
          backdropFilter: "blur(8px)",
          animation: "slideDown 0.3s ease-out",
          "@keyframes slideDown": {
            from: { opacity: 0, transform: "translateY(-10px)" },
            to: { opacity: 1, transform: "translateY(0)" },
          },
        }}
      >
        {/* Contextual icon — fire emoji for urgency */}
        <Box
          sx={{
            width: isMobile ? 28 : 32,
            height: isMobile ? 28 : 32,
            borderRadius: "8px",
            background: "linear-gradient(135deg, #DC2626 0%, #EF4444 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            fontSize: isMobile ? "0.85rem" : "1rem",
          }}
        >
          🔥
        </Box>

        {/* Reason + Reply Now CTA */}
        <Box flex={1} minWidth={0}>
          <Typography
            sx={{
              fontSize: isMobile ? "0.78rem" : "0.83rem",
              color: "#374151",
              lineHeight: 1.5,
              fontFamily: "Inter",
              mb: 0.75,
            }}
          >
            {reason}
          </Typography>
          <Box
            onClick={() => {
              setShowAiInsight(false);
              setTimeout(() => inputRef.current?.focus(), 100);
            }}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.5,
              bgcolor: "#EF4444",
              color: "#fff",
              px: 1.25,
              py: 0.4,
              borderRadius: "20px",
              cursor: "pointer",
              fontSize: "0.72rem",
              fontWeight: 700,
              fontFamily: "Inter",
              transition: "all 0.15s ease",
              "&:hover": { bgcolor: "#DC2626", transform: "scale(1.03)" },
            }}
          >
            <ReplyIcon sx={{ fontSize: 13 }} />
            Reply Now
          </Box>
        </Box>

        {/* Close Button */}
        <IconButton
          size="small"
          onClick={() => setShowAiInsight(false)}
          sx={{ width: 24, height: 24, bgcolor: "#FEE2E2", "&:hover": { bgcolor: "#FECACA" } }}
        >
          <CloseIcon sx={{ fontSize: 14, color: "#EF4444" }} />
        </IconButton>
      </Box>
    );
  };

  /* ========================================================= */
  /* RENDER - CHAT VIEW                                         */
  /* ========================================================= */
  const renderChatView = () => (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "linear-gradient(165deg, #F0EDF6 0%, #EEF1F5 40%, #F5F3F8 100%)",
        height: "100%",
        maxHeight: "100%",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {hydratingFromMeta ? (
        <Box flex={1} p={3} overflow="hidden">
          {[...Array(5)].map((_, i) => (
            <Skeleton
              key={i}
              variant="rounded"
              height={48}
              width={`${60 + i * 5}%`}
              sx={{ mb: 2 }}
            />
          ))}
        </Box>
      ) : selectedConversation ? (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            maxHeight: "100%",
            overflow: "hidden",
          }}
        >
          {/* Chat Header - Fixed/Sticky */}
          <Box
            px={isMobile ? 1.5 : 3}
            py={isMobile ? 1 : 1.5}
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            sx={{
              background: "linear-gradient(180deg, #FFFFFF 0%, #F8F7FC 100%)",
              borderBottom: "1px solid #E8EAF0",
              boxShadow: "0 1px 4px rgba(77, 43, 140, 0.06)",
              flexShrink: 0,
              minHeight: isMobile ? 56 : 64,
              zIndex: 10,
            }}
          >
            <Box display="flex" gap={isMobile ? 1 : 2} alignItems="center">
              {isMobile && (
                <IconButton
                  onClick={handleBackToList}
                  size="small"
                  sx={{ mr: -0.5 }}
                >
                  <ArrowBack />
                </IconButton>
              )}

              <Avatar
                src={selectedConversation?.participant?.profilePic || undefined}
                onClick={() => {
                  if (selectedConversation?.participant?.profilePic) {
                    setAvatarPreview(selectedConversation.participant.profilePic);
                  }
                }}
                sx={{
                  width: isMobile ? 36 : 44,
                  height: isMobile ? 36 : 44,
                  cursor: selectedConversation?.participant?.profilePic ? "pointer" : "default",
                  transition: "transform 0.2s ease",
                  "&:hover": {
                    transform: selectedConversation?.participant?.profilePic ? "scale(1.05)" : "none",
                  },
                }}
              >
                {!selectedConversation?.participant?.profilePic &&
                  displayName[0]?.toUpperCase()}
              </Avatar>

              <Box>
                <Typography
                  fontWeight={500}
                  fontSize={isMobile ? "0.9rem" : "1rem"}
                  noWrap
                  sx={{ maxWidth: isMobile ? 150 : "none" }}
                >
                  {displayName}
                </Typography>
                <Typography
                  sx={{
                    fontFamily: "Inter",
                    fontSize: isMobile ? "0.75rem" : "0.85rem",
                    cursor: "pointer",
                    color: "#E83C91",
                    "&:hover": { textDecoration: "underline" },
                  }}
                  onClick={() =>
                    window.open(
                      `https://www.instagram.com/${showUsername}/`,
                      "_blank",
                      "noopener,noreferrer"
                    )
                  }
                >
                  @{showUsername}
                </Typography>
              </Box>
            </Box>

            <Box display="flex" gap={0.5} alignItems="center">
              {/* 🔥 NEW: Show AI icon for follow-up conversations */}
              {isFollowUpConversation(selectedConversation) && !showAiInsight && (
                <Tooltip title="View AI insight">
                  <IconButton
                    size="small"
                    onClick={() => setShowAiInsight(true)}
                    sx={{
                      color: "#7C3AED",
                      width: 32,
                      height: 32,
                      "&:hover": {
                        bgcolor: "rgba(124, 58, 237, 0.08)",
                      },
                    }}
                  >
                    <AutoAwesome sx={{ fontSize: 22 }} />
                  </IconButton>
                </Tooltip>
              )}

              {/* <IconButton
                size="small"
                onClick={(e) => setMenuAnchor(e.currentTarget)}
              >
                <MoreVert fontSize={isMobile ? "small" : "medium"} />
              </IconButton> */}
            </Box>
          </Box>

          {/* Menus */}
          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={() => setMenuAnchor(null)}
          >
            <MenuItem onMouseEnter={(e) => setLabelAnchor(e.currentTarget)}>
              Label conversation as
            </MenuItem>
          </Menu>
          <Menu
            anchorEl={labelAnchor}
            open={Boolean(labelAnchor)}
            onClose={() => setLabelAnchor(null)}
          >
            {ASSIGNABLE_LABELS.map((label) => (
              <MenuItem key={label} onClick={() => handleLabelChange(label)}>
                <Typography flex={1}>{label}</Typography>
                {selectedConversation.label === label && (
                  <Check fontSize="small" />
                )}
              </MenuItem>
            ))}
          </Menu>

          {/* 🔥 AI Insight Popup - Fixed position below header */}
          {renderAiInsightPopup()}

          {/* Messages Area - Only this part scrolls */}
          <Box
            ref={messagesContainerRef}
            onScroll={handleScroll}
            sx={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              overflowX: "hidden",
              px: isMobile ? 1.5 : 3,
              py: 1.5,
              display: "flex",
              flexDirection: "column",
              gap: 0.5,
              WebkitOverflowScrolling: "touch",
              position: "relative",
              // Add top padding when AI insight is shown to prevent content overlap
              pt: (isFollowUpConversation(selectedConversation) && showAiInsight) 
                ? (isMobile ? 10 : 9) 
                : 1.5,
            }}
          >
            {loadingConversation && (
              <Box px={1} py={2}>
                {[...Array(6)].map((_, i) => (
                  <Box
                    key={i}
                    display="flex"
                    justifyContent={i % 3 === 0 ? "flex-end" : "flex-start"}
                    mb={2}
                  >
                    {i % 3 !== 0 && (
                      <Skeleton 
                        variant="circular" 
                        width={32} 
                        height={32} 
                        sx={{ mr: 1, flexShrink: 0 }} 
                      />
                    )}
                    <Skeleton
                      variant="rounded"
                      width={`${45 + (i % 3) * 15}%`}
                      height={i % 2 === 0 ? 48 : 36}
                      sx={{ 
                        borderRadius: i % 3 === 0 
                          ? "18px 18px 4px 18px" 
                          : "18px 18px 18px 4px" 
                      }}
                    />
                  </Box>
                ))}
              </Box>
            )}

            {loadingMessages && !loadingConversation && (
              <Box
                display="flex"
                justifyContent="center"
                alignItems="center"
                gap={1}
                py={1}
              >
                <CircularProgress size={16} />
                <Typography variant="caption" color="text.secondary">
                  Loading...
                </Typography>
              </Box>
            )}

          {/* Break-the-ice banner for fresh new leads */}
          {!loadingConversation &&
            selectedConversation &&
            !selectedConversation.creatorHasReplied &&
            messages.length > 0 &&
            messages.length <= 4 && (
            <Box
              sx={{
                mx: isMobile ? 0.5 : 1,
                mb: 1.5,
                p: isMobile ? 1.5 : 2,
                borderRadius: "14px",
                background: "linear-gradient(135deg, #FFF7ED 0%, #FFFBF0 100%)",
                border: "1px solid #FED7AA",
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                animation: "bannerSlideIn 0.4s ease-out",
                "@keyframes bannerSlideIn": {
                  from: { opacity: 0, transform: "translateY(-8px)" },
                  to: { opacity: 1, transform: "translateY(0)" },
                },
              }}
            >
              <Box sx={{ fontSize: isMobile ? "1.6rem" : "1.8rem", flexShrink: 0, lineHeight: 1 }}>🎯</Box>
              <Box>
                <Typography sx={{ fontSize: isMobile ? "0.8rem" : "0.85rem", fontWeight: 700, color: "#92400E", mb: 0.25, fontFamily: "Inter" }}>
                  Hot lead — reply fast!
                </Typography>
                <Typography sx={{ fontSize: isMobile ? "0.72rem" : "0.76rem", color: "#B45309", lineHeight: 1.4, fontFamily: "Inter" }}>
                  Creators who reply within 1 hour convert 3× more leads.
                </Typography>
              </Box>
            </Box>
          )}

         {!loadingConversation && messages.map((msg, index) => {
  const isMe = msg.sender === "me";
  const prevMsg = messages[index - 1];
  const showAvatar = !isMe && (!prevMsg || prevMsg.sender !== msg.sender);
  const showTimestamp = !prevMsg || new Date(msg.createdAtPlatform) - new Date(prevMsg.createdAtPlatform) > 300000;
  
  // 1. Define the system messages that should count as "Reels"
  const placeholderTexts = [
    "Shared an attachment", 
    "Shared screenshot", 
    "Shared reel", 
    "Attachment unavailable"
  ];

  // 2. Check if it is a reel (Empty text/media OR matching placeholder text)
  const isSharedReel = 
    (!msg.text && !msg.mediaUrl) || 
    (msg.text && placeholderTexts.includes(msg.text));

  const isMediaOnly = (msg.type === "image" || msg.type === "video") && !msg.text;

  // 3. Determine URL: If ME -> My Home. If THEM -> Their Profile.
  const reelTargetUrl = isMe 
    ? "https://www.instagram.com/direct/inbox/" 
    : `https://www.instagram.com/${showUsername}/`;

  return (
    <Box 
      key={msg._id} 
      data-message-id={msg._id}
      display="flex" 
      flexDirection="column"
    >
      {showTimestamp && (
        <Box display="flex" alignItems="center" gap={1.5} my={2} px={1}>
          <Box sx={{ flex: 1, height: "1px", background: "linear-gradient(90deg, transparent, #D8D0E8)" }} />
          <Typography
            variant="caption"
            sx={{
              color: "#9CA3AF",
              fontSize: "0.68rem",
              whiteSpace: "nowrap",
              fontFamily: "Inter",
              flexShrink: 0,
            }}
          >
            {new Date(msg.createdAtPlatform).toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Typography>
          <Box sx={{ flex: 1, height: "1px", background: "linear-gradient(90deg, #D8D0E8, transparent)" }} />
        </Box>
      )}

      <Box
        display="flex"
        justifyContent={isMe ? "flex-end" : "flex-start"}
        alignItems="flex-end"
        mb={showAvatar ? 1 : 0.2}
      >
        {!isMe && (
          <Box width={isMobile ? 28 : 32} mr={0.75}>
            {showAvatar && (
              <Avatar
                src={selectedConversation?.participant?.profilePic || undefined}
                sx={{
                  width: isMobile ? 28 : 32,
                  height: isMobile ? 28 : 32,
                  bgcolor: "primary.main",
                  fontSize: "0.75rem",
                }}
              >
                {!selectedConversation?.participant?.profilePic && displayName[0]?.toUpperCase()}
              </Avatar>
            )}
          </Box>
        )}

        <Box
          maxWidth={isMobile ? "80%" : "60%"}
          sx={{
            background: (isMediaOnly || isSharedReel)
              ? "transparent"
              : isMe
              ? "linear-gradient(135deg, #5B35A0 0%, #7C3AED 100%)"
              : undefined,
            bgcolor: (isMediaOnly || isSharedReel)
              ? "transparent"
              : isMe
              ? undefined
              : "#FFFFFF",
            color: (isMe && !isSharedReel) ? "#fff" : "#1e293b",
            borderRadius: (isMediaOnly || isSharedReel)
              ? 0
              : isMe
              ? "18px 18px 4px 18px"
              : "18px 18px 18px 4px",
            boxShadow: (isMediaOnly || isSharedReel)
              ? "none"
              : isMe
              ? "0 2px 8px rgba(91, 53, 160, 0.35)"
              : "0 1px 6px rgba(0,0,0,0.08)",
            p: (isMediaOnly || isSharedReel) ? 0 : isMobile ? 1.25 : 1.5,
            position: "relative",
            wordBreak: "break-word",
          }}
        >
          {/* MEDIA RENDER (Images/Videos) */}
          {msg.type === "image" && msg.mediaUrl && (
            <Box
              component="img"
              src={msg.mediaUrl}
              alt="attachment"
              sx={CHAT_MEDIA_STYLE}
              onClick={() => setMediaPreview({ type: "image", url: msg.mediaUrl })}
            />
          )}

          {msg.type === "video" && msg.mediaUrl && (
            <video
              src={msg.mediaUrl}
              controls
              playsInline
              style={{
                ...CHAT_MEDIA_STYLE,
                maxHeight: isMobile ? "220px" : "300px",
                cursor: "default",
              }}
            />
          )}

          {/* TEXT OR SHARED REEL CARD */}
          {/* Logic: Show Text ONLY if it exists AND it is not a placeholder */}
          {msg.text && !isSharedReel ? (
            <Typography
              variant="body2"
              fontSize={isMobile ? "0.9rem" : "0.95rem"}
              lineHeight={1.5}
            >
              {renderMessageText(msg.text, isMe)}
            </Typography>
          ) : (
            /* Logic: Show Card if it is a Shared Reel (Empty OR Placeholder) */
            isSharedReel && (
              <Box
                onClick={() => window.open(reelTargetUrl, '_blank')}
              sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  px: isMobile ? 1 : 1.5,
                  py: isMobile ? 3 : 6,
                  borderRadius: 2,
                  bgcolor: 'action.hover',
                  border: '1px solid',
                  borderColor: 'divider',
                  cursor: 'pointer',
                  width: 'fit-content',
                  maxWidth: isMobile ? '100px' : '140px',
                  transition: '0.2s',
                  '&:hover': {
                    bgcolor: 'action.selected',
                            },

                      }}


              >
               <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, fontSize: isMobile ? '0.5rem' : '0.75rem' }}>
                  Shared Reel
                </Typography>

                <LaunchIcon sx={{ fontSize: isMobile ? 24 : 28, color: 'text.disabled', mb: 0.5 }} />

      <Box display="flex" alignItems="center" gap={0.5}>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: isMobile ? '0.5rem' : '0.75rem' }}>
          View in Instagram
        </Typography>
      </Box>
              </Box>
            )
          )}

          {/* Action Buttons (if any) */}
          {msg.action?.url && (
            <Typography
              variant="body2"
              sx={{
                mt: 0.5,
                color: isMe ? "#BFDBFE" : "#4D2B8C",
                fontSize: "0.8rem",
                cursor: "pointer",
                fontWeight: 500,
                "&:hover": { textDecoration: "underline" },
              }}
              onClick={() => window.open(msg.action.url, "_blank", "noopener,noreferrer")}
            >
              {msg.action.label}
            </Typography>
          )}

          {/* Message Meta (Time & Read Receipts) */}
          <Box
            display="flex"
            justifyContent="flex-end"
            alignItems="center"
            gap={0.5}
            mt={0.5}
          >
            <Typography
              variant="caption"
              fontSize="0.6rem"
              sx={{ opacity: 0.7 }}
            >
              {new Date(msg.createdAtPlatform).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Typography>
            {isMe && (
              <DoneAll
                sx={{
                  fontSize: 13,
                  color: msg.isRead ? "#93c5fd" : "#cbd5e1",
                }}
              />
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
})}
          </Box>

          {/* Input Area - Fixed at bottom */}
          <Box
            px={isMobile ? 1.5 : 2}
            py={1.25}
            sx={{
              flexShrink: 0,
              zIndex: 10,
              position: "relative",
              background: "linear-gradient(0deg, #FFFFFF 0%, #F8F7FC 100%)",
              borderTop: "1px solid #E8EAF0",
            }}
          >
            {/* Sent confirmation toast */}
            {showSentToast && (
              <Box
                sx={{
                  position: "absolute",
                  bottom: "calc(100% + 8px)",
                  right: isMobile ? 12 : 16,
                  bgcolor: "#4D2B8C",
                  color: "#fff",
                  px: 1.75,
                  py: 0.6,
                  borderRadius: "20px",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  fontFamily: "Inter",
                  display: "flex",
                  alignItems: "center",
                  gap: 0.6,
                  boxShadow: "0 4px 14px rgba(77, 43, 140, 0.35)",
                  animation: "sentToastIn 0.25s ease-out",
                  "@keyframes sentToastIn": {
                    from: { opacity: 0, transform: "translateY(6px) scale(0.95)" },
                    to: { opacity: 1, transform: "translateY(0) scale(1)" },
                  },
                  zIndex: 20,
                  pointerEvents: "none",
                }}
              >
                ✓ Sent
              </Box>
            )}

            {/* Send error toast */}
            {sendError && (
              <Box
                sx={{
                  position: "absolute",
                  bottom: "calc(100% + 8px)",
                  left: isMobile ? 12 : 16,
                  right: isMobile ? 12 : 16,
                  bgcolor: "#FEF2F2",
                  color: "#B91C1C",
                  border: "1px solid #FECACA",
                  px: 1.75,
                  py: 0.75,
                  borderRadius: "10px",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  fontFamily: "Inter",
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                  boxShadow: "0 4px 14px rgba(185,28,28,0.12)",
                  animation: "sentToastIn 0.25s ease-out",
                  zIndex: 20,
                  pointerEvents: "none",
                }}
              >
                ⚠️ {sendError}
              </Box>
            )}
            {/* Quick Replies strip — shown above input row, only when 24h window open AND AI replies exist */}
            {canReply && aiQuickReplies.length > 0 && (
              <Box display="flex" justifyContent="flex-start" mb={0.75}>
                <Box
                  onClick={(e) => setQuickReplyAnchor(e.currentTarget)}
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 0.6,
                    px: 1.5,
                    py: 0.5,
                    borderRadius: "20px",
                    bgcolor: "rgba(124, 58, 237, 0.07)",
                    cursor: "pointer",
                    transition: "background 0.15s",
                    "&:hover": { bgcolor: "rgba(124, 58, 237, 0.14)" },
                  }}
                >
                  <Bolt sx={{ fontSize: 15, color: "#7C3AED" }} />
                  <Typography sx={{ fontSize: "0.78rem", fontWeight: 600, color: "#7C3AED", fontFamily: "Inter" }}>
                    Quick Replies
                  </Typography>
                </Box>
              </Box>
            )}

            {/* File preview (image or PDF) */}
            {(previewUrl || (selectedFile && (selectedFileType === "pdf" || selectedFileType === "excel"))) && (
              <Box
                mb={1.5}
                p={1}
                bgcolor="#f1f5f9"
                borderRadius={2}
                display="inline-flex"
                position="relative"
                border="1px solid #e2e8f0"
                sx={{ opacity: sending ? 0.6 : 1 }}
              >
                {selectedFileType === "pdf" ? (
                  <Box display="flex" alignItems="center" gap={1} px={1} py={0.5}>
                    <PictureAsPdf sx={{ color: "#E53E3E", fontSize: 28 }} />
                    <Typography variant="caption" sx={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#374151" }}>
                      {selectedFile?.name}
                    </Typography>
                  </Box>
                ) : selectedFileType === "excel" ? (
                  <Box display="flex" alignItems="center" gap={1} px={1} py={0.5}>
                    <TableChart sx={{ color: "#217346", fontSize: 28 }} />
                    <Typography variant="caption" sx={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#374151" }}>
                      {selectedFile?.name}
                    </Typography>
                  </Box>
                ) : (
                  <Box
                    component="img"
                    src={previewUrl}
                    height={isMobile ? 60 : 80}
                    borderRadius={1}
                    alt="Preview"
                  />
                )}
                <IconButton
                  size="small"
                  onClick={handleRemoveFile}
                  disabled={sending}
                  sx={{
                    position: "absolute",
                    top: -8,
                    right: -8,
                    bgcolor: "#fff",
                    border: "1px solid #cbd5e1",
                    width: 24,
                    height: 24,
                    "&:hover": { bgcolor: "#f1f1f1" },
                    "&:disabled": {
                      bgcolor: "#e5e7eb",
                      color: "#9CA3AF",
                    },
                  }}
                >
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Box>
            )}

            <Box
              display="flex"
              alignItems="center"
              gap={1}
            >
              {/* + button — only shown when 24h window is open */}
              {canReply && (
                <ClickAwayListener onClickAway={() => setPlusMenuAnchor(null)}>
                <Box
                  sx={{ position: "relative", flexShrink: 0 }}
                  onMouseEnter={!isMobile ? () => setPlusMenuAnchor(true) : undefined}
                  onMouseLeave={!isMobile ? () => setPlusMenuAnchor(null) : undefined}
                >
                  <IconButton
                    onClick={isMobile ? () => setPlusMenuAnchor((v) => (v ? null : true)) : undefined}
                    disabled={sending}
                    sx={{
                      color: sending ? "#9CA3AF" : "#4D2B8C",
                      width: 44,
                      height: 44,
                      minWidth: 44,
                      minHeight: 44,
                      bgcolor: plusMenuAnchor ? "#EEF4FF" : (sending ? "#f1f5f9" : "#f8fafc"),
                      border: "1px solid #e5e7eb",
                      borderRadius: "50%",
                      transition: "all 0.2s ease",
                      "&:hover": { bgcolor: sending ? "#f1f5f9" : "#EEF4FF" },
                      "&:disabled": { color: "#9CA3AF", bgcolor: "#f1f5f9" },
                    }}
                  >
                    <Add sx={{ fontSize: 22 }} />
                  </IconButton>

                  {/* Dropdown — absolutely positioned above the button, no portal/backdrop */}
                  {Boolean(plusMenuAnchor) && (
                    <Box
                      sx={{
                        position: "absolute",
                        bottom: "100%",
                        left: 0,
                        bgcolor: "#fff",
                        borderRadius: "12px",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.13)",
                        border: "1px solid rgba(0,0,0,0.06)",
                        overflow: "hidden",
                        minWidth: 170,
                        zIndex: 1300,
                        mb: "4px",
                      }}
                    >
                      <Box p={1}>
                        {/* Add Image */}
                        <Box
                          onClick={() => { fileInputRef.current.click(); setPlusMenuAnchor(null); }}
                          sx={{
                            display: "flex", alignItems: "center", gap: 1.25,
                            px: 1.5, py: 1, borderRadius: "8px", cursor: "pointer",
                            transition: "background 0.15s",
                            "&:hover": { bgcolor: "#EEF4FF" },
                          }}
                        >
                          <ImageIcon sx={{ fontSize: 18, color: "#4D2B8C" }} />
                          <Typography variant="body2" fontWeight={500} fontFamily="Inter" color="#374151">Share Image</Typography>
                        </Box>
                        {/* Share PDF */}
                        <Box
                          onClick={() => { pdfInputRef.current.click(); setPlusMenuAnchor(null); }}
                          sx={{
                            display: "flex", alignItems: "center", gap: 1.25,
                            px: 1.5, py: 1, borderRadius: "8px", cursor: "pointer",
                            transition: "background 0.15s",
                            "&:hover": { bgcolor: "#FFF5F5" },
                          }}
                        >
                          <PictureAsPdf sx={{ fontSize: 18, color: "#E53E3E" }} />
                          <Typography variant="body2" fontWeight={500} fontFamily="Inter" color="#374151">Share PDF</Typography>
                        </Box>
                        {/* Share Excel */}
                        <Box
                          onClick={() => { excelInputRef.current.click(); setPlusMenuAnchor(null); }}
                          sx={{
                            display: "flex", alignItems: "center", gap: 1.25,
                            px: 1.5, py: 1, borderRadius: "8px", cursor: "pointer",
                            transition: "background 0.15s",
                            "&:hover": { bgcolor: "#F0FFF4" },
                          }}
                        >
                          <TableChart sx={{ fontSize: 18, color: "#217346" }} />
                          <Typography variant="body2" fontWeight={500} fontFamily="Inter" color="#374151">Share Excel</Typography>
                        </Box>
                      </Box>
                    </Box>
                  )}
                </Box>
                </ClickAwayListener>
              )}

              {/* Hidden file inputs */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                hidden
                onChange={handleFileSelect}
              />
              <input
                ref={pdfInputRef}
                type="file"
                accept="application/pdf"
                hidden
                onChange={handlePdfSelect}
              />
              <input
                ref={excelInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                hidden
                onChange={handleExcelSelect}
              />

          <TextField
  fullWidth
  multiline
  maxRows={4}
  placeholder={
    sending
      ? "Sending..."
      : canReply
      ? "Type a message..."
      : ""
  }
  value={canReply ? messageText : ""}
  disabled={sending}
  inputProps={{
    readOnly: !canReply,
  }}
  onChange={(e) => setMessageText(e.target.value)}
  onKeyPress={handleKeyPress}
  inputRef={inputRef}
  sx={{
    "& .MuiOutlinedInput-root": {
      borderRadius: "22px",
      bgcolor: canReply && !sending ? "#f8fafc" : "#f1f5f9",
      color: canReply && !sending ? "inherit" : "#64748b",
      fontStyle: "normal",
      fontSize: "16px",
      minHeight: 44,
      py: 1, // Added vertical padding to look good if text wraps
      px: 0.5,
      alignItems: "center",
      "& fieldset": {
        borderColor: "#e5e7eb",
      },
      cursor: canReply ? "text" : "default",
    },
    "& .MuiInputBase-input": {
      fontSize: "16px",
      py: 0.25, // Reduced slightly since we added root padding
      px: 1,
      caretColor: canReply ? "auto" : "transparent",
    },
  }}
  InputProps={{
    startAdornment:
      !canReply && !sending ? (
        <InputAdornment
          position="start"
          sx={{
            width: "100%",
            m: 0,
            pl: 1,
            mr: 1,
          }}
        >
          <Typography
            variant="body1"
            sx={{
              color: "#64748b",
              fontSize: isMobile ? "12px" : "15px",
              fontStyle: "italic",
              whiteSpace: "nowrap",       
              overflow: "hidden",         
              textOverflow: "ellipsis",
            }}
          >
            Reply on{" "}
            <a
              href={`https://www.instagram.com/${showUsername}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "#3b82f6",
                textDecoration: "underline",
                fontWeight: 600,
                cursor: "pointer",
                position: "relative",
                zIndex: 10,
              }}
            >
              Instagram
            </a>
            {" "}24h window closed.
          </Typography>
        </InputAdornment>
      ) : null,

    endAdornment: !isMobile ? (
      <InputAdornment position="end">
        <IconButton
          size="small"
          disabled={!canReply}
          onClick={(e) => setEmojiAnchor(e.currentTarget)}
        >
          <EmojiEmotions
            sx={{
              color: canReply ? "#64748b" : "#cbd5e1",
              fontSize: 24,
            }}
          />
        </IconButton>
      </InputAdornment>
    ) : null,
  }}
/>

              <Tooltip
                title={!canReply ? waitingMessage : ""}
                disableHoverListener={canReply}
              >
                <span style={{ flexShrink: 0 }}>
                  <IconButton
                    onClick={sendMessage}
                    disabled={!canReply || sending}
                    sx={{
                      background: canReply
                        ? "linear-gradient(135deg, #5B35A0 0%, #7C3AED 100%)"
                        : undefined,
                      bgcolor: canReply ? undefined : "#cbd5e1",
                      color: "#fff",
                      width: 44,
                      height: 44,
                      minWidth: 44,
                      minHeight: 44,
                      transition: "all 0.2s ease",
                      "&:hover": {
                        background: canReply
                          ? "linear-gradient(135deg, #4D2B8C 0%, #6D28D9 100%)"
                          : undefined,
                        bgcolor: canReply ? undefined : "#cbd5e1",
                        transform: canReply ? "scale(1.08)" : "none",
                        boxShadow: canReply ? "0 4px 16px rgba(91,53,160,0.45)" : "none",
                      },
                      "&:disabled": {
                        bgcolor: "#cbd5e1",
                        color: "#fff",
                      },
                    }}
                  >
                    {sending ? (
                      <CircularProgress size={20} sx={{ color: "#fff" }} />
                    ) : (
                      <Send sx={{ fontSize: 22 }} />
                    )}
                  </IconButton>
                </span>
              </Tooltip>
            </Box>

            {!isMobile && (
              <Popover
                open={Boolean(emojiAnchor)}
                anchorEl={emojiAnchor}
                onClose={() => setEmojiAnchor(null)}
                anchorOrigin={{ vertical: "top", horizontal: "right" }}
                transformOrigin={{ vertical: "bottom", horizontal: "right" }}
              >
                <EmojiPicker
                  onEmojiClick={handleEmojiClick}
                  width={300}
                  height={400}
                />
              </Popover>
            )}

            {/* Quick Reply Popover */}
            <Popover
              open={Boolean(quickReplyAnchor)}
              anchorEl={quickReplyAnchor}
              onClose={() => setQuickReplyAnchor(null)}
              anchorOrigin={{ vertical: "top", horizontal: "left" }}
              transformOrigin={{ vertical: "bottom", horizontal: "left" }}
              PaperProps={{
                sx: { borderRadius: "14px", boxShadow: "0 8px 28px rgba(0,0,0,0.13)", width: 264, overflow: "hidden" },
              }}
            >
              <Box p={1.5}>
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={1} px={0.5}>
                  <Typography
                    sx={{
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      color: "#6B7280",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      fontFamily: "Inter",
                    }}
                  >
                    ⚡ Quick Replies
                  </Typography>
                  {aiQuickReplies.length > 0 && (
                    <Typography
                      sx={{
                        fontSize: "0.62rem",
                        fontWeight: 600,
                        color: "#7C3AED",
                        fontFamily: "Inter",
                        bgcolor: "rgba(124,58,237,0.08)",
                        px: 0.75,
                        py: 0.25,
                        borderRadius: "10px",
                      }}
                    >
                      ✨ AI
                    </Typography>
                  )}
                </Box>
                {aiQuickReplies.map((s) => s.text).map((reply, i) => (
                  <Box
                    key={i}
                    onClick={() => {
                      setMessageText(reply);
                      setQuickReplyAnchor(null);
                      setTimeout(() => inputRef.current?.focus(), 50);
                    }}
                    sx={{
                      px: 1.25,
                      py: 1,
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                      color: "#374151",
                      fontFamily: "Inter",
                      lineHeight: 1.4,
                      transition: "all 0.15s ease",
                      mb: 0.25,
                      "&:hover": { bgcolor: "#F3E8FF", color: "#4D2B8C" },
                    }}
                  >
                    {reply}
                  </Box>
                ))}
              </Box>
            </Popover>
          </Box>
        </Box>
      ) : (
        <Box
          flex={1}
          display="flex"
          alignItems="center"
          justifyContent="center"
          flexDirection="column"
          gap={2}
          sx={{
            background: "linear-gradient(165deg, #F0EDF6 0%, #EEF1F5 40%, #F5F3F8 100%)",
          }}
        >
          <Box
            sx={{
              width: 88,
              height: 88,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #EDE7F9 0%, #F3E8FF 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 16px rgba(77, 43, 140, 0.1)",
            }}
          >
            <Send sx={{ fontSize: 36, color: "#4D2B8C" }} />
          </Box>
          <Typography variant="h6" color="text.secondary" fontWeight={600}>
            Select a conversation
          </Typography>
          <Typography variant="body2" color="text.disabled">
            Choose from your existing conversations
          </Typography>
        </Box>
      )}
    </Box>
  );

  /* ========================================================= */
  /* MAIN RENDER                                                */
  /* ========================================================= */

if (inboxStatus === null) {
  return (
    <Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <CircularProgress sx={{ color: "#4D2B8C" }} />
    </Box>
  );
}

if (inboxStatus?.needsWhatsApp || inboxStatus?.status === "needs_whatsapp") {
  return (
    <Box sx={{ height: isXs ? "calc(100dvh - 56px)" : "100dvh", bgcolor: "#f8fafc" }}>
      <WhatsAppBanner onComplete={handleWhatsAppComplete} isMobile={isMobile} />
    </Box>
  );
}

if (inboxStatus?.needsInitialPull || inboxStatus?.isProcessing || inboxStatus?.status === "needs_initial_pull" || inboxStatus?.status === "processing") {
  return (
    <Box sx={{ height: isXs ? "calc(100dvh - 56px)" : "100dvh", bgcolor: "#f8fafc" }}>
      <SyncingBanner onStartPull={handleStartPull} isProcessing={inboxStatus?.isProcessing || inboxStatus?.status === "processing"} progress={pullProgress} isMobile={isMobile} />
    </Box>
  );
}

  return (
    
    <Box
      sx={{
        height: isXs ? "calc(100dvh - 56px)" : "100dvh",
        maxHeight: isXs ? "calc(100dvh - 56px)" : "100dvh",
        display: "flex",
        overflow: "hidden",
        bgcolor: "#F5F3F8",
        position: "relative",
      }}
    >
      {isMobile ? (
        <>
          <Slide direction="right" in={!showChat} mountOnEnter unmountOnExit>
            <Box sx={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0, overflow: "hidden" }}>
              {renderConversationList()}
            </Box>
          </Slide>

          <Slide direction="left" in={showChat} mountOnEnter unmountOnExit>
            <Box sx={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0, overflow: "hidden" }}>
              {renderChatView()}
            </Box>
          </Slide>
        </>
      ) : (
        <>
          {renderConversationList()}
          
          {/* 🔥 POLISHED UX: Show Empty State on the right if list is empty */}
          {filteredConversations.length === 0 ? (
             <Box
               flex={1}
               display="flex"
               alignItems="center"
               justifyContent="center"
               sx={{
                 height: "100%",
                 background: "linear-gradient(165deg, #F0EDF6 0%, #EEF1F5 40%, #F5F3F8 100%)",
               }}
             >
               {/* Reuse your existing beautiful EmptyStateUI */}
               <EmptyStateUI category={activeCategory} isMobile={false} />
             </Box>
          ) : (
             renderChatView()
          )}
        </>
      )}

      {/* Media Preview Dialog */}
      <Dialog
        open={mediaPreview?.type === "image" || mediaPreview?.type === "video"}
        onClose={() => setMediaPreview(null)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: "transparent",
            boxShadow: "none",
            m: isMobile ? 1 : 2,
          },
        }}
      >
        <DialogContent
          sx={{
            position: "relative",
            bgcolor: "rgba(0,0,0,0.95)",
            p: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <IconButton
            onClick={() => setMediaPreview(null)}
            sx={{
              position: "absolute",
              top: 12,
              right: 12,
              color: "#fff",
              bgcolor: "rgba(255,255,255,0.1)",
              zIndex: 2,
              "&:hover": {
                bgcolor: "rgba(255,255,255,0.2)",
              },
            }}
          >
            <CloseIcon />
          </IconButton>

          {mediaPreview?.url && (
            <IconButton
              onClick={() =>
                window.open(mediaPreview.url, "_blank", "noopener,noreferrer")
              }
              sx={{
                position: "absolute",
                top: 12,
                right: 56,
                color: "#fff",
                bgcolor: "rgba(255,255,255,0.1)",
                zIndex: 2,
                fontSize: "1rem",
                "&:hover": {
                  bgcolor: "rgba(255,255,255,0.2)",
                },
              }}
            >
              ⬇️
            </IconButton>
          )}

          {mediaPreview?.type === "image" && (
            <img
              src={mediaPreview.url}
              alt="preview"
              style={{
                maxWidth: "100%",
                maxHeight: isMobile ? "80vh" : "90vh",
                objectFit: "contain",
              }}
            />
          )}

          {mediaPreview?.type === "video" && (
            <video
              src={mediaPreview.url}
              controls
              autoPlay
              playsInline
              style={{
                maxWidth: "100%",
                maxHeight: isMobile ? "80vh" : "90vh",
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Avatar Preview Dialog */}
      <Dialog
        open={Boolean(avatarPreview)}
        onClose={() => setAvatarPreview(null)}
        maxWidth="sm"
        PaperProps={{
          sx: {
            bgcolor: "transparent",
            boxShadow: "none",
            m: 2,
          },
        }}
        onClick={() => setAvatarPreview(null)}
      >
        <DialogContent
          sx={{
            position: "relative",
            bgcolor: "rgba(0,0,0,0.9)",
            p: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <IconButton
            onClick={() => setAvatarPreview(null)}
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
              color: "#fff",
              bgcolor: "rgba(255,255,255,0.1)",
              zIndex: 2,
              "&:hover": {
                bgcolor: "rgba(255,255,255,0.2)",
              },
            }}
          >
            <CloseIcon />
          </IconButton>

          {avatarPreview && (
            <img
              src={avatarPreview}
              alt="Profile"
              style={{
                width: isMobile ? 280 : 320,
                height: isMobile ? 280 : 320,
                objectFit: "cover",
                borderRadius: "50%",
                border: "3px solid #fff",
              }}
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Leads Limit Upgrade Dialog */}
      <LeadsLimitDialog
        open={showLeadsLimitDialog}
        leadsLimit={leadsLimitData?.leadsLimit || 0}
        isMobile={isMobile}
        onClose={() => setShowLeadsLimitDialog(false)}
        onUpgrade={() => navigate("/professional/upgrade/plan")}
      />

      {/* WhatsApp Phone Number Dialog */}
      <Dialog
        open={Boolean(whatsappPhoneDialog)}
        onClose={() => setWhatsappPhoneDialog(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: "16px",
            overflow: "hidden",
            m: isMobile ? 2 : 3,
          },
        }}
      >
        <DialogContent sx={{ p: 0 }}>
          {/* Green top bar */}
          <Box sx={{ height: 4, bgcolor: "#25D366" }} />

          <Box sx={{ p: isMobile ? 2.5 : 3, textAlign: "center" }}>
            {/* WhatsApp Icon */}
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                mx: "auto",
                mb: 2,
              }}
            >
              <WhatsApp sx={{ fontSize: 28, color: "#fff" }} />
            </Box>

            <Typography
              sx={{
                fontFamily: "Inter",
                fontWeight: 700,
                fontSize: "1.1rem",
                color: "#1e293b",
                mb: 1,
              }}
            >
              Continue to WhatsApp?
            </Typography>

            <Typography
              sx={{
                fontFamily: "Inter",
                fontSize: "0.9rem",
                color: "#64748b",
                mb: 0.5,
              }}
            >
              Open a chat with
            </Typography>

            <Typography
              sx={{
                fontFamily: "Inter",
                fontWeight: 600,
                fontSize: "1.15rem",
                color: "#1e293b",
                mb: 3,
                letterSpacing: "0.5px",
              }}
            >
              {whatsappPhoneDialog}
            </Typography>

            <Box display="flex" gap={1.5} justifyContent="center">
              <Button
                variant="outlined"
                onClick={() => setWhatsappPhoneDialog(null)}
                sx={{
                  flex: 1,
                  borderRadius: "10px",
                  textTransform: "none",
                  fontWeight: 600,
                  fontFamily: "Inter",
                  color: "#64748b",
                  borderColor: "#E5E7EB",
                  "&:hover": { borderColor: "#cbd5e1", bgcolor: "#f8fafc" },
                }}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={() => {
                  setWhatsappPhoneDialog(null);
                  window.location.href = `https://wa.me/${whatsappPhoneDialog}`;
                }}
                sx={{
                  flex: 1,
                  bgcolor: "#25D366",
                  borderRadius: "10px",
                  textTransform: "none",
                  fontWeight: 600,
                  fontFamily: "Inter",
                  "&:hover": { bgcolor: "#128C7E" },
                }}
              >
                Continue
              </Button>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
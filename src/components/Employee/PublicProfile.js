import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Grid from "@mui/material/Grid";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Tooltip from "@mui/material/Tooltip";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Divider from "@mui/material/Divider";
import CloseIcon from '@mui/icons-material/CloseOutlined';
import Stack from "@mui/material/Stack";
import { alpha } from "@mui/material/styles";
import YouTubeIcon from "@mui/icons-material/YouTube";
import TwitterIcon from "@mui/icons-material/Twitter";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import InstagramIcon from "@mui/icons-material/Instagram";
import LinkedInIcon from "@mui/icons-material/LinkedIn";
import LinkIcon from "@mui/icons-material/Link";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import MovieIcon from "@mui/icons-material/Movie";
import AddIcon from "@mui/icons-material/Add";
import FormControl from "@mui/material/FormControl";
import FormLabel from "@mui/material/FormLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import SmsOutlinedIcon from '@mui/icons-material/SmsOutlined';
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import IndiaFlag from "../../images/flag.png";
import StorefrontIcon from "@mui/icons-material/Storefront";
import { Checkbox } from "@mui/material";
import newsletterBg from "../../images/newsLetterBg.jpg";
import MailOutlinedIcon from '@mui/icons-material/MailOutlined';
import 'react-toastify/dist/ReactToastify.css';
import { toast } from "react-toastify";
import EventIcon from '@mui/icons-material/CalendarMonth';
import BookingSessionDialog from "./BookingSessionDialog";
import {
Select,
  MenuItem,
  useTheme,
  useMediaQuery,
} from "@mui/material";


export default function PublicProfile({ handle, initialProfile = null }) {
  
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [profile, setProfile] = useState(initialProfile);
  const [loading, setLoading] = useState(!initialProfile);
  const [error, setError] = useState(null);

  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [currentFormBlock, setCurrentFormBlock] = useState(null);
  const [formValues, setFormValues] = useState({});
  const [formErrors, setFormErrors] = useState({});
  const [formSubmitting, setFormSubmitting] = useState(false);

  const [snack, setSnack] = useState({ open: false, message: "" });
  const [newsletterDialogOpen, setNewsletterDialogOpen] = useState(false);
  const [newsletterDialogText, setNewsletterDialogText] = useState("");
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterAccept, setNewsletterAccept] = useState(true);
  const [newsletterDialogBlock, setNewsletterDialogBlock] = useState(null); // store block opened
  const [newsletterSubmitting, setNewsletterSubmitting] = useState(false);

  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
const [selectedBooking, setSelectedBooking] = useState(null);

  const API_BASE = "/api/usersOn";


  
function openNewsletterDialog(block) {
  setNewsletterDialogBlock(block || null);
  setNewsletterDialogText(block?.action || block?.title || "Subscribe to Newsletter");
  setNewsletterEmail("");
  setNewsletterAccept(true);
  setNewsletterDialogOpen(true);
}

  
  function closeNewsletterDialog() {
    setNewsletterDialogOpen(false);
  }


    const makeWaUrl = (input, message = "") => {
  if (!input) return "";

  let raw = String(input).trim();

  // If it's already a WA link, just append message if provided
  if (/^https?:\/\/(wa\.me|api\.whatsapp\.com)/i.test(raw)) {
    if (message) {
      const sep = raw.includes("?") ? "&" : "?";
      return `${raw}${sep}text=${encodeURIComponent(message)}`;
    }
    return raw;
  }

  // Strip everything except digits and a leading +
  raw = raw.replace(/[^\d+]/g, "");
  // wa.me path should NOT contain '+'
  raw = raw.replace(/^\+/, "");

  let url = `https://wa.me/${raw}`;
  if (message) url += `?text=${encodeURIComponent(message)}`;
  return url;
};




  function extractHandleFromHostname(hostname, roots = ["chomske.com"]) {
  if (!hostname) return "";
  const raw = String(hostname).toLowerCase();

  for (const root of roots) {
    if (raw === root || raw.endsWith("." + root)) {
      const left = raw.replace(new RegExp("\\." + root.replace(/\./g, "\\.") + "$"), "");
      if (!left) return "";
      const parts = left.split(".");
      const last = parts[0] === "www" ? parts.slice(1) : parts;
      return last.length ? last[last.length - 1] : "";
    }
  }

  const parts = raw.split(".");
  if (parts.length >= 3) return parts[0] === "www" ? parts[1] : parts[0];
  return "";
}


const derivedHandle = handle || extractHandleFromHostname(typeof window !== "undefined" ? window.location.hostname : "", ["chomske.com"]);

   async function handleSubscribe() {
  // basic checks
  if (!newsletterEmail || !String(newsletterEmail).trim()) {
    return setSnack?.({ open: true, message: "Please enter your email" }) || alert("Please enter your email");
  }

  const email = String(newsletterEmail).trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return setSnack?.({ open: true, message: "Please enter a valid email" }) || alert("Invalid email");
  }

  if (!newsletterAccept) {
    return setSnack?.({ open: true, message: "Please accept terms & conditions" }) || alert("Accept terms");
  }

  setNewsletterSubmitting(true);

  try {
    // payload includes optional metadata (blockId / newsletter text)
const payload = {
  email,
  newsletterText: newsletterDialogText || "",
  blockId: newsletterDialogBlock?._id || newsletterDialogBlock?.id || null,
  submittedAt: new Date().toISOString(),
  handle: derivedHandle || null, // <-- send handle so backend can resolve user_id
};


    // POST to your newsletter subscribe endpoint
    const res = await axios.post(`${API_BASE}/newsletters-subscribe`, payload, {
      headers: { "Content-Type": "application/json" },
    });

    // success feedback
    const message = res?.data?.message || "Successfully subscribed";
    toast.success(message);
    setNewsletterDialogOpen(false);
    setNewsletterEmail("");
    setNewsletterDialogBlock(null);
  } catch (err) {
    console.error("Newsletter subscribe error:", err);
    const msg = err?.response?.data?.message || err?.message || "Failed to subscribe";
    setSnack?.({ open: true, message: msg });
  } finally {
    setNewsletterSubmitting(false);
  }
}

useEffect(() => {
    if (!derivedHandle) return;
    if (profile) return;

    const controller = new AbortController();
    const signal = controller.signal;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await axios.get(`${API_BASE}/profile`, {
          params: { handle: derivedHandle }, // <= pass it explicitly
          signal,
        });
        setProfile(resp.data);
      } catch (err) {
        if (axios.isCancel && axios.isCancel(err)) return;
        if (err.response && err.response.status === 404) setError("notfound");
        else {
          setError("network");
          console.error("Profile fetch error:", err);
        }
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivedHandle]);


  async function handleLinkClick(block, url, opts = { newTab: true, awaitPost: false }) {
    if (!url) return;
    const apiEndpoint = `${API_BASE}/link-click-analytics`;
    const linkKey = block?._id || block?.id || block?.key || block?.actionKey || block?.slug || block?.name || url;

    const payload = {
      handle: derivedHandle || block?.ownerHandle || (profile && profile.handleUserName) || undefined,
      link_key: String(linkKey),
      block_name: block?.name || block?.title || undefined,
    };

  // 1) Try navigator.sendBeacon first (best for navigation/unload)
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      const ok = navigator.sendBeacon(apiEndpoint, blob);
      // sendBeacon is fire-and-forget; we don't get a response
      // continue to navigation below
    } catch (beErr) {
      console.warn("sendBeacon failed, falling back to axios POST:", beErr);
      // fall through to axios below
      try {
        // fire-and-forget axios (not awaited) so navigation isn't blocked
        axios.post(apiEndpoint, payload, { headers: { "Content-Type": "application/json" }, timeout: 2500 })
          .catch((e) => console.warn("axios POST (fallback) failed:", e?.message || e));
      } catch (e) {
        // ignore
      }
    } finally {
      // navigate immediately — sendBeacon already queued the payload
      if (opts.newTab) window.open(url, "_blank");
      else window.location.href = url;
      return;
    }
  }

  // 2) If sendBeacon not available, use axios. If opts.awaitPost is true we will await it (safer), otherwise fire-and-forget.
  try {
    const postPromise = axios.post(apiEndpoint, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 2500, // short timeout to avoid long waits if we do await
    });

    if (opts.awaitPost) {
      // wait for the POST to finish (may add latency)
      try {
        await postPromise;
      } catch (err) {
        console.warn("axios POST failed (await):", err?.message || err);
      }
      // then navigate
      if (opts.newTab) window.open(url, "_blank");
      else window.location.href = url;
      return;
    } else {
      // fire-and-forget: don't await; still handle rejection to avoid unhandled rejections
      postPromise.catch((err) => console.warn("axios POST failed (non-blocking):", err?.message || err));
    }
  } catch (err) {
    // final fallback ignore
    console.warn("axios POST error (unexpected):", err?.message || err);
  } finally {
    // navigation (if not already done)
    if (opts.newTab) window.open(url, "_blank");
    else window.location.href = url;
  }
}


  if (!handle) return <div style={{ padding: 24 }}>Invalid profile handle</div>;
  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;
  if (error) {
    if (error === "notfound") return <div style={{ padding: 24 }}>Profile not found</div>;
    if (error === "network") return <div style={{ padding: 24 }}>Network/CORS error — check backend</div>;
    return <div style={{ padding: 24 }}>Error: {String(error)}</div>;
  }
  if (!profile) return <div style={{ padding: 24 }}>Profile not found</div>;

  // normalize user fields
  const userDetails = {
    name: profile.name || profile.displayName || "",
    picture: profile.picture || profile.avatarUrl || profile.ogImage || "",
    handleUserName: profile.handleUserName || profile.handle || handle,
    socials: profile.socials || profile.links || [],
    intro: profile.intro || profile.bio || profile.description || "",
  };


  // pick store flag from profile variations
const storeEnabled = profile.store_enabled ?? profile.storeEnabled ?? profile.storeEnabledFlag ?? false;
const dmEnabled = profile.dm_enabled ?? profile.dmEnabled ?? profile.dmEnabledFlag ?? false;

  // header images (use the fields you asked for; fallback to other likely names)
  const leftImage =
    profile.leftHeadImage ||
    profile.leftImage ||
    profile.headerImage1 ||
    profile.headerLeft ||
    profile.leftHead ||
    "";
  const rightTopImage =
    profile.rightTopImage ||
    profile.headerImage2 ||
    profile.headerRightTop ||
    profile.rightTop ||
    "";
  const rightBottomImage =
    profile.rightBottomImage ||
    profile.headerImage3 ||
    profile.headerRightBottom ||
    profile.rightBottom ||
    "";

  const avatarUrl = userDetails.picture || "";
  const name = userDetails.name || userDetails.handleUserName || handle;
  const socials = Array.isArray(userDetails.socials) ? userDetails.socials : [];
  const blocks = Array.isArray(profile.blocks) ? profile.blocks : [];

  const getYouTubeId = (url) => {
    if (!url) return null;
    try {
      const u = new URL(url);
      if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
      if (u.hostname === "youtu.be") return u.pathname.slice(1);
    } catch (e) {
      return null;
    }
    return null;
  };

  function openFormDialog(block) {
    let fields = block.fields;
    if (!fields && typeof block.action === "string") {
      try {
        const parsed = JSON.parse(block.action);
        fields = parsed?.fields || parsed;
      } catch (e) {}
    }
    fields = fields || [];

    const values = {};
    const normalized = fields.map((f, i) => {
      const key = f.key || f.name || (f.label ? f.label.toLowerCase().replace(/\s+/g, "_") : `f_${i}`);
      let options = undefined;
      if (f && f.options !== undefined) {
        if (Array.isArray(f.options)) {
          options = f.options.map((o) => String(o).trim()).filter(Boolean);
        } else if (typeof f.options === "string") {
          options = f.options.split(",").map((s) => s.trim()).filter(Boolean);
        } else {
          options = [String(f.options)];
        }
      }
      values[key] = "";
      return { ...f, _key: key, options };
    });

    setCurrentFormBlock({ ...block, _renderFields: normalized });
    setFormValues(values);
    setFormErrors({});
    setFormDialogOpen(true);
  }

  function closeFormDialog() {
    setFormDialogOpen(false);
    setCurrentFormBlock(null);
    setFormValues({});
    setFormErrors({});
    setFormSubmitting(false);
  }

async function submitForm() {
  if (!currentFormBlock) return;
  
  const fields = currentFormBlock._renderFields || [];
  const errors = {};

  // Validate each field
  fields.forEach((f) => {
    const key = f._key;
    const value = formValues[key];

    // Required field validation
    if (f.required) {
      if (f.type === 'checkbox') {
        const selectedCount = Array.isArray(value) ? value.length : 0;
        const minSel = f.minSelections || 1;
        if (selectedCount < minSel) {
          errors[key] = `Please select at least ${minSel} option(s)`;
        }
      } else if (!value || String(value).trim() === "") {
        errors[key] = `${f.label || "This field"} is required`;
      }
    }

    // Checkbox max selections validation
    if (f.type === 'checkbox' && f.maxSelections) {
      const selectedCount = Array.isArray(value) ? value.length : 0;
      if (selectedCount > f.maxSelections) {
        errors[key] = `Please select at most ${f.maxSelections} option(s)`;
      }
    }
  });

  setFormErrors(errors);
  if (Object.keys(errors).length > 0) return;

  const payload = {
    blockId: currentFormBlock._id || currentFormBlock.id,
    blockName: currentFormBlock.name || currentFormBlock.title || "Form",
    values: formValues,
    meta: { 
      submittedAt: new Date().toISOString(), 
      fromHandle: handle,
      userAgent: navigator.userAgent || null,
    },
  };

  setFormSubmitting(true);
  try {
    // Make sure the URL matches your backend route
    const res = await axios.post(`${API_BASE}/submit-form`, payload, { 
      withCredentials: false 
    });
    
    if (res.data.success) {
      toast.success(res.data.message || "Form submitted successfully!");
      setFormValues({}); // Reset form values
      setFormErrors({}); // Reset errors
      closeFormDialog();
    } else {
      toast.error(res.data.message || "Submission failed");
      setFormSubmitting(false);
    }
  } catch (err) {
    console.error("Form submit error:", err);
    console.error("Error response:", err.response); // Debug log
    const msg = err?.response?.data?.message || "Failed to submit form";
    toast.error(msg);
    setFormSubmitting(false);
  }
}


const truncate = (str = "", max = 100) => {
  if (!str) return "";
  if (str.length <= max) return str;
  const slice = str.slice(0, max);
  // try to avoid cutting mid-word (fallback to hard cut)
  const cutAt = slice.lastIndexOf(" ");
  const safe = cutAt > max * 0.6 ? slice.slice(0, cutAt) : slice;
  // avoid trailing punctuation before ellipsis
  return safe.replace(/[.,;:!?-]+$/,"").trimEnd() + "...";
};

// tweak limits here
const MAX_TITLE = 40;
const MAX_DESC  = 90;

function renderPreviewBlock(b) {
  if (!b) return null;

  const title = b.name || b.title || "untitled";
  const url = b.action || b.actionUrl || b.link;
  const type = (b.type || "").toLowerCase();

  // ===== FORM BLOCK =====
  if (type === "form") {
    let fields = b.fields;
    if (!fields && typeof b.action === "string") {
      try {
        fields = JSON.parse(b.action).fields;
      } catch {
        // ignore
      }
    }
    return (
      <Paper
        key={b._id || title}
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
        }}
        onClick={() => openFormDialog(b)}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 1.25,
              display: "grid",
              placeItems: "center",
              bgcolor: alpha("#10b981", 0.06),
              color: "#10b981",
              flexShrink: 0,
            }}
          >
            <AddIcon sx={{ fontSize: 18 }} />
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
            <Typography
              sx={{
                fontFamily: "Inter",
                fontWeight: 600,
                fontSize: 15,
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                overflow: "hidden",
              }}
            >
              {title}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <IconButton
            aria-label="open"
            onClick={() => openFormDialog(b)}
            sx={{
              width: 36,
              height: 36,
              borderRadius: 1,
              bgcolor: alpha("#10b981", 0.06),
              color: "#10b981",
              "&:hover": { bgcolor: alpha("#10b981", 0.14) },
            }}
            size="small"
          >
            <ArrowForwardIosIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>
      </Paper>
    );
  }

  // ===== BOOKING BLOCK =====
  if (type === "booking") {
    // Extract booking data from b.raw or parse from b.action
    let bookingConfig;
    if (b.raw?.duration) {
      bookingConfig = {
        duration: b.raw.duration,
        title: b.raw.name,
        description: b.raw.description,
        interactionType: b.raw.interactionType || "voice",
      };
    } else if (typeof b.action === "string") {
      try {
        bookingConfig = JSON.parse(b.action);
      } catch {
        bookingConfig = {};
      }
    }

    const isMeetingType =
      bookingConfig.interactionType === "voice" ? "Voice Meeting" : "Video Meeting";

    return (
      <Paper
        key={b._id || title}
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
        onClick={(e) => {
          e.stopPropagation();
          setSelectedBooking(b);
          setBookingDialogOpen(true);
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
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                overflow: "hidden",
                mb: 0.25,
              }}
              title={title}
            >
              {truncate(title, MAX_TITLE)}
            </Typography>

            {/* Description */}
            {bookingConfig.description && (
              <Typography
                sx={{
                  fontFamily: "Inter",
                  fontSize: 12,
                  color: "#9CA3AF",
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  mt: 0.25,
                }}
                title={bookingConfig.description}
              >
                {truncate(bookingConfig.description, MAX_DESC)}
              </Typography>
            )}

            {/* Duration + Meeting Type */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
              <Typography
                sx={{
                  fontFamily: "Inter",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#6B7280",
                }}
              >
                {bookingConfig.duration || 30} mins
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
    );
  }

  // ===== LINK/CTA BLOCK =====
  if (type === "link" || type === "cta" || !type) {
    return (
      <Paper
        key={b._id || url || title}
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
          cursor: url ? "pointer" : "default",
        }}
        onClick={() => url && handleLinkClick(b, url, { newTab: true })}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 1.25,
              display: "grid",
              placeItems: "center",
              bgcolor: alpha("#6366f1", 0.06),
              color: "#6366f1",
              flexShrink: 0,
            }}
          >
            <LinkIcon sx={{ fontSize: 18 }} />
          </Box>
          <Box sx={{ display: "flex", overflow: "hidden", minWidth: 0 }}>
            <Typography
              sx={{
                fontFamily: "Inter",
                fontWeight: 600,
                fontSize: 15,
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                overflow: "hidden",
              }}
            >
              {title}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <IconButton
            aria-label="open"
            sx={{
              width: 36,
              height: 36,
              borderRadius: 1,
              bgcolor: alpha("#6d28d9", 0.06),
              color: "#6d28d9",
              "&:hover": { bgcolor: alpha("#6d28d9", 0.14) },
            }}
            size="small"
          >
            <ArrowForwardIosIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>
      </Paper>
    );
  }

  // ===== VIDEO BLOCK =====
  if (type === "video") {
    const ytId = getYouTubeId(url);
    const thumb = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null;

    return (
      <Paper
        key={b._id || url || title}
        elevation={0}
        sx={{
          borderRadius: 2,
          overflow: "hidden",
          boxShadow: "0 10px 30px rgba(2,6,23,0.12)",
          cursor: url ? "pointer" : "default",
        }}
        onClick={() => url && handleLinkClick(b, url, { newTab: true })}
      >
        <Box sx={{ position: "relative", width: "100%", aspectRatio: "16/9", bgcolor: "#000" }}>
          {thumb ? (
            <Box component="img" src={thumb} alt={title} sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          ) : (
            <Box sx={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "#F3F4F6" }}>
              <MovieIcon sx={{ fontSize: 28, color: "rgba(15,23,42,0.6)" }} />
            </Box>
          )}
          <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <Box sx={{ width: 48, height: 48, borderRadius: "50%", bgcolor: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                <path d="M8 5v14l11-7L8 5z" fill="#fff" />
              </svg>
            </Box>
          </Box>
        </Box>
      </Paper>
    );
  }

  // ===== NEWSLETTER BLOCK =====
if (type === "newsletter") {
  return (
    <Paper
      key={b._id || title}
      sx={{
        p: 2,
        borderRadius: 2,
        bgcolor: "#FFFFFF",
        border: "2px solid #E5E7EB",
        boxShadow: "none",
        cursor: "pointer",
        transition: "all .2s ease",
        "&:hover": {
          borderColor: "#1F2937",
          transform: "translateY(-2px)",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.08)",
        },
      }}
      onClick={() => openNewsletterDialog(b)}
      elevation={0}
    >
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, flex: 1, minWidth: 0 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 1.5,
              display: "grid",
              placeItems: "center",
              bgcolor: "#F3F4F6",
              flexShrink: 0,
            }}
          >
            <MailOutlinedIcon sx={{ fontSize: 18, color: "#1F2937" }} />
          </Box>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              sx={{
                fontFamily: "Inter",
                fontSize: 14,
                fontWeight: 600,
                color: "#1F2937",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                mb: 0.25,
              }}
              title={b.action || b.title || "Subscribe to Newsletter"}
            >
              {b.action || b.title || "Newsletter"}
            </Typography>
            <Typography
              sx={{
                fontFamily: "Inter",
                fontSize: 12,
                fontWeight: 400,
                color: "#6B7280",
              }}
            >
              For latest updates
            </Typography>
          </Box>
        </Box>

        {/* Right Arrow */}
        <Box sx={{ display: "flex", alignItems: "center", ml: 1 }}>
          <ArrowForwardIosIcon sx={{ fontSize: 16, color: "rgba(15,23,42,0.5)" }} />
        </Box>
      </Box>
    </Paper>
  );
}

  // ===== FALLBACK =====
  return (
    <Paper
      key={b._id || url || title}
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
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: 1.25,
            display: "grid",
            placeItems: "center",
            bgcolor: alpha("#6366f1", 0.06),
            color: "#6366f1",
            flexShrink: 0,
          }}
        >
          <LinkIcon sx={{ fontSize: 18 }} />
        </Box>
        <Typography sx={{ fontFamily: "Inter", fontWeight: 600, fontSize: 15 }}>{title}</Typography>
      </Box>
      <IconButton
        aria-label="open"
        onClick={() => url && handleLinkClick(b, url, { newTab: true })}
        sx={{
          width: 36,
          height: 36,
          borderRadius: 1,
          bgcolor: alpha("#6d28d9", 0.06),
          color: "#6d28d9",
          "&:hover": { bgcolor: alpha("#6d28d9", 0.14) },
        }}
        size="small"
      >
        <ArrowForwardIosIcon sx={{ fontSize: 14 }} />
      </IconButton>
    </Paper>
  );
}

  function SocialIconFor(platform) {
    const key = (platform || "").toLowerCase();
    if (key === "youtube") return YouTubeIcon;
    if (key === "twitter") return TwitterIcon;
    if (key === "whatsapp") return WhatsAppIcon;
    if (key === "instagram") return InstagramIcon;
    if (key === "linkedin") return LinkedInIcon;
    return LinkIcon;
  }

  return (
    <Box sx={{ display : 'flex', justifyContent : 'center'}}>
    
   <Grid
  container
  justifyContent="center"
  sx={{background: "#0b0b0b", 
  maxWidth : { xs: "100%", sm: "85%", md: "30%"} }}
>


 
<Box
  sx={{
    width: "100%",
    boxShadow: "0 20px 60px rgba(15,23,42,0.12)",
    overflow: "hidden",
    background:
      "linear-gradient(135deg, #0f0c29 0%, #0b0b0b 40%, #0b0b0b 100%)",
    position: "relative", // ✅ must be relative for overlay to anchor
  }}
>
  {/* hero image */}
  <Box
    component="img"
    src={leftImage || avatarUrl}
    alt="hero"
    sx={{
      width: "100%",
      height: "360px",
      objectFit: "cover",
      objectPosition: { xs: "center 15%", sm: "center 25%" },
      display: "block",
      background:
        "linear-gradient(135deg, #0f0c29 0%, #0b0b0b 60%, #0b0b0b 60%)",
    }}
  />

  {/* bottom gradient overlay */}
  <Box
    sx={{
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: "25%", // ✅ must have height, controls how far the fade goes up
      background:
        "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(8,8,12,0.55) 45%, #0b0b0b 85%, #0b0b0b 100%)",
      pointerEvents: "none",
      zIndex: 2,
    }}
  />
</Box>

            {/* Name + socials row (no avatar) */}
           <Grid container spacing={1} sx={{ mt: 0, px: 3.5, pb:2, textAlign : 'left', background: " #0b0b0b"}}>
              {/* Left: name */}
             
              <Grid size={{ xs: 12, sm: 12, md: 12}}>
                <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
                  <Typography sx={{ color: "#FFFFFF", fontFamily: "Inter", fontWeight: 600, fontSize: { xs: 16, sm: 18 } }}>
                    {name}
                  </Typography>
                </Box>
              </Grid>

              {/* Intro: full width below the row */}
                  <Grid size={{ xs: 12, sm: 12, md: 12}}>
                {userDetails.intro ? (
                  <Typography sx={{ color: "rgba(255,255,255,0.88)", fontFamily: "Inter", fontWeight: 400, fontSize: 13, mt: 0.5, textAlign: "left" }}>
                    {userDetails.intro}
                  </Typography>
                ) : null}
              </Grid>

             {/* Right: social icons */}
              <Grid size={{ xs: 12, sm: 12, md: 12}}>
                <Box sx={{ display: "flex", justifyContent: "flex-start", gap: 1, alignItems: "center" }}>
                  {socials && socials.length > 0 ? (
                    <>
                      {socials.map((s) => {
                        const key = (s.platform || s.name || "").toLowerCase();
                        const IconComp = SocialIconFor(key);

                        const BRAND = {
                          youtube: "#FF0000",
                          twitter: "#1DA1F2",
                          whatsapp: "#25D366",
                          instagram: "#E1306C",
                          linkedin: "#0077B5",
                          default: "#6366f1",
                        };
                        const color = BRAND[key] || BRAND.default;
                        const bg = alpha(color, 0.03);
                        const hoverBg = alpha(color, 0.18);

                        const rawUrl = s.url || s.link || s.href || s.number || "";
                        const url = key === "whatsapp" ? makeWaUrl(rawUrl, s.message || "") : rawUrl;


                        return (
                          <Tooltip key={s._id || url} title={(key && key.charAt(0).toUpperCase() + key.slice(1)) || "Link"} arrow>
                            <IconButton
                              onClick={() => url && window.open(url, "_blank")}
                              sx={{
                                bgcolor: bg,
                                borderRadius: 1,
                                "&:hover": { bgcolor: hoverBg },
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                              aria-label={`open ${key}`}
                              size="small"
                            >
                              <IconComp sx={{ fontSize: 28, color: color }} />
                              {/* {key==='instagram' ? (
                                <Typography sx={{ color : '#FFFFFF', ml: 1, fontFamily : 'Inter', fontSize : '14px'}}>22.5K</Typography>
                              ) : ('')} */}
                            </IconButton>
                          </Tooltip>
                        );
                      })}

                      {/* Store icon (appended after socials) */}
                      {storeEnabled && (
          <Tooltip title="Visit store" arrow>
            <IconButton
         onClick={() => {
  const url = "https://chomske.com/products-affiliate?subdomain=" + encodeURIComponent(derivedHandle || "");
  window.location.href = url;
}}


              sx={{
                // bgcolor: "rgba(255,255,255,0.03)",
                borderRadius: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                // border: "1px solid rgba(255,255,255,0.06)",
                // "&:hover": { bgcolor: "rgba(255,255,255,0.06)" },
              }}
              aria-label="open store"
              size="small"
            >
              <StorefrontIcon sx={{ fontSize: 28, color: "#FFFFFF" }} />
            </IconButton>
          </Tooltip>
        )}

        
          {dmEnabled && (
          <Tooltip title="Direct Message" arrow>
            <IconButton
 onClick={() => {
  const url = "https://chomske.com/influencer/participant/login?subdomain=" + encodeURIComponent(derivedHandle || "");
  window.open(url, "_blank", "noopener,noreferrer");
}}



              sx={{
                // bgcolor: "rgba(255,255,255,0.03)",
                borderRadius: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                // border: "1px solid rgba(255,255,255,0.06)",
                // "&:hover": { bgcolor: "rgba(255,255,255,0.06)" },
              }}
              aria-label="open store"
              size="small"
            >
              <SmsOutlinedIcon sx={{ fontSize: 28, color: "#FFFFFF" }} />
            </IconButton>
          </Tooltip>
        )}
                    </>
                  ) : (
                    <Paper elevation={0} sx={{ px: 2, py: 1, borderRadius: 2, border: "1px dashed rgba(255,255,255,0.06)", bgcolor: "transparent" }}>
                      <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.75)" }}>
                        Social accounts will appear here when you add them.
                      </Typography>
                    </Paper>
                  )}
                </Box>
              </Grid>


          
              
            </Grid>


 <Grid size={{ xs: 12, md: 4}}>
          <Box sx={{ px: { xs: 1.5, sm: 2 }, alignItems: 'center', justifyContent : 'center'}}>


            {/* blocks area */}
            <Box sx={{   
           
         
            px: 2,
            pt: 1
           
           }}>
            <Stack spacing={1.25} sx={{ mt: 1, mb: 1 }}>
              {blocks && blocks.length > 0 ? (
                blocks.map((b) => renderPreviewBlock(b))
              ) : (
                <Box sx={{ py: 2 }}>
                  <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.7)" }}>
                    No links / blocks added yet.
                  </Typography>
                </Box>
              )}
            </Stack>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1, justifyContent: "center", mt: 3 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, ml: 1, mb: 1 }}>
                <Typography sx={{ fontFamily: "Inter", fontWeight: 400, color: "rgba(255,255,255,0.8)", fontSize: { xs: 12, sm: 12 }, mb: 0.25 }}>Made in India</Typography>
                <Box component="img" src={IndiaFlag} alt="India flag" sx={{ width: 18, height: "auto", display: "block", borderRadius: "2px" }} aria-hidden={false} />
              </Box>
            </Box>
            </Box>


        </Box>
      </Grid>

      {/* Form dialog (unchanged) */}
    <Dialog 
  open={formDialogOpen} 
  onClose={closeFormDialog} 
  fullWidth 
  maxWidth="sm"
  fullScreen={isMobile} // Add fullScreen for mobile
  PaperProps={{
    sx: { 
      borderRadius: { xs: 0, sm: 3 },
      maxHeight: { xs: '100vh', sm: '90vh' }
    }
  }}
>
  {/* Header */}
  <DialogTitle 
    sx={{ 
      fontFamily: 'Inter', 
      fontSize: { xs: 20, sm: 22 }, 
      fontWeight: 700,
      p: { xs: 2, sm: 3 },
      pb: 2,
      borderBottom: '1px solid #E5E7EB',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }}
  >
    <Box>
      <Typography sx={{ fontSize: { xs: 18, sm: 20 }, fontWeight: 700, fontFamily: 'Inter' }}>
        {currentFormBlock?.name || currentFormBlock?.title || "Submit Form"}
      </Typography>
      <Typography variant="caption" sx={{ color: '#6B7280', fontFamily: 'Inter', mt: 0.5, display: 'block' }}>
        Please fill out all required fields
      </Typography>
    </Box>
    <IconButton 
      onClick={closeFormDialog}
      sx={{ 
        display: { xs: 'flex', sm: 'none' },
        color: '#6B7280'
      }}
    >
      <CloseIcon />
    </IconButton>
  </DialogTitle>

  <DialogContent sx={{ p: { xs: 2, sm: 3 } }}>
    <Box sx={{ mt: 1, display: "flex", flexDirection: "column", gap: 3 }}>
      {currentFormBlock?._renderFields?.length === 0 && (
        <Box sx={{ 
          p: 4, 
          textAlign: 'center', 
          bgcolor: '#F9FAFB', 
          borderRadius: 2,
          border: '1px dashed #E5E7EB'
        }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'Inter' }}>
            This form has no fields to display.
          </Typography>
        </Box>
      )}

      {currentFormBlock?._renderFields?.map((f) => {
        const key = f._key;
        const value = formValues[key] ?? "";
        const error = formErrors[key];
        const fieldType = f.type || "text";

        // TEXTAREA
        if (fieldType === "textarea") {
          return (
            <Box key={key}>
              <Typography 
                sx={{ 
                  fontFamily: 'Inter',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#1F2937',
                  mb: 1
                }}
              >
                {f.label || "Field"} {f.required && <span style={{ color: '#EF4444' }}>*</span>}
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={4}
                placeholder={f.placeholder || "Type your answer here..."}
                value={value}
                onChange={(e) => setFormValues((s) => ({ ...s, [key]: e.target.value }))}
                error={!!error}
                helperText={error || (f.required && !error ? "This field is required" : "")}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    bgcolor: '#F9FAFB',
                    '&:hover': {
                      bgcolor: '#F3F4F6',
                    },
                    '&.Mui-focused': {
                      bgcolor: '#fff',
                    }
                  }
                }}
              />
            </Box>
          );
        }

        // RADIO (Single Choice)
        if (fieldType === "radio") {
          const opts = Array.isArray(f.options) 
            ? f.options 
            : (typeof f.options === "string" ? f.options.split(',').map(s => s.trim()).filter(Boolean) : []);
          
          return (
            <Box key={key}>
              <Typography 
                sx={{ 
                  fontFamily: 'Inter',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#1F2937',
                  mb: 1.5
                }}
              >
                {f.label} {f.required && <span style={{ color: '#EF4444' }}>*</span>}
              </Typography>
              <RadioGroup 
                value={formValues[key] ?? ""} 
                onChange={(e) => setFormValues((s) => ({ ...s, [key]: e.target.value }))}
              >
                <Stack spacing={0.5}>
                  {opts.map((opt, idx) => (
                    <Box
                      key={idx}
                      sx={{
                        border: '1px solid #E5E7EB',
                        borderRadius: 2,
                        transition: 'all 0.2s',
                        '&:hover': {
                          bgcolor: '#F9FAFB',
                          borderColor: '#667eea'
                        }
                      }}
                    >
                      <FormControlLabel 
                        value={opt} 
                        control={
                          <Radio 
                            sx={{
                              color: '#9CA3AF',
                              '&.Mui-checked': {
                                color: '#667eea',
                              }
                            }}
                          />
                        } 
                        label={
                          <Typography sx={{ fontFamily: 'Inter', fontSize: 14, color: '#374151' }}>
                            {opt}
                          </Typography>
                        }
                        sx={{ 
                          m: 0,
                          p: 1.5,
                          width: '100%'
                        }}
                      />
                    </Box>
                  ))}
                </Stack>
              </RadioGroup>
              {error && (
                <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block', fontFamily: 'Inter' }}>
                  {error}
                </Typography>
              )}
            </Box>
          );
        }

        // CHECKBOX (Multiple Choice)
        if (fieldType === "checkbox") {
          const opts = Array.isArray(f.options) 
            ? f.options 
            : (typeof f.options === "string" ? f.options.split(',').map(s => s.trim()).filter(Boolean) : []);
          
          const selectedValues = Array.isArray(formValues[key]) ? formValues[key] : [];

          const handleCheckboxChange = (optValue) => {
            setFormValues((s) => {
              const current = Array.isArray(s[key]) ? s[key] : [];
              const updated = current.includes(optValue)
                ? current.filter(v => v !== optValue)
                : [...current, optValue];
              return { ...s, [key]: updated };
            });
          };

          return (
            <Box key={key}>
              <Typography 
                sx={{ 
                  fontFamily: 'Inter',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#1F2937',
                  mb: 1.5
                }}
              >
                {f.label} {f.required && <span style={{ color: '#EF4444' }}>*</span>}
              </Typography>
              
              {/* Selection hint */}
              {(f.minSelections > 0 || f.maxSelections > 0) && (
                <Typography 
                  variant="caption" 
                  sx={{ 
                    color: '#6B7280',
                    fontFamily: 'Inter',
                    display: 'block',
                    mb: 1
                  }}
                >
                  {f.minSelections > 0 && f.maxSelections > 0
                    ? `Select ${f.minSelections} to ${f.maxSelections} options`
                    : f.minSelections > 0
                    ? `Select at least ${f.minSelections} option(s)`
                    : `Select up to ${f.maxSelections} option(s)`}
                </Typography>
              )}

              <Stack spacing={0.5}>
                {opts.map((opt, idx) => (
                  <Box
                    key={idx}
                    sx={{
                      border: '1px solid #E5E7EB',
                      borderRadius: 2,
                      transition: 'all 0.2s',
                      '&:hover': {
                        bgcolor: '#F9FAFB',
                        borderColor: '#667eea'
                      }
                    }}
                  >
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={selectedValues.includes(opt)}
                          onChange={() => handleCheckboxChange(opt)}
                          sx={{
                            color: '#9CA3AF',
                            '&.Mui-checked': {
                              color: '#667eea',
                            }
                          }}
                        />
                      }
                      label={
                        <Typography sx={{ fontFamily: 'Inter', fontSize: 14, color: '#374151' }}>
                          {opt}
                        </Typography>
                      }
                      sx={{ 
                        m: 0,
                        p: 1.5,
                        width: '100%'
                      }}
                    />
                  </Box>
                ))}
              </Stack>
              
              {error && (
                <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block', fontFamily: 'Inter' }}>
                  {error}
                </Typography>
              )}
            </Box>
          );
        }

        // SELECT (Dropdown)
        if (fieldType === "select") {
          const opts = Array.isArray(f.options) 
            ? f.options 
            : (typeof f.options === "string" ? f.options.split(',').map(s => s.trim()).filter(Boolean) : []);
          
          return (
            <Box key={key}>
              <Typography 
                sx={{ 
                  fontFamily: 'Inter',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#1F2937',
                  mb: 1
                }}
              >
                {f.label} {f.required && <span style={{ color: '#EF4444' }}>*</span>}
              </Typography>
              <FormControl fullWidth error={!!error}>
                <Select
                  value={formValues[key] ?? ""}
                  onChange={(e) => setFormValues((s) => ({ ...s, [key]: e.target.value }))}
                  displayEmpty
                  sx={{ 
                    borderRadius: 2,
                    bgcolor: '#F9FAFB',
                    fontFamily: 'Inter',
                    '&:hover': {
                      bgcolor: '#F3F4F6',
                    },
                    '&.Mui-focused': {
                      bgcolor: '#fff',
                    }
                  }}
                >
                  <MenuItem value="" disabled>
                    <em style={{ color: '#9CA3AF' }}>-- Select an option --</em>
                  </MenuItem>
                  {opts.map((opt, idx) => (
                    <MenuItem key={idx} value={opt} sx={{ fontFamily: 'Inter' }}>
                      {opt}
                    </MenuItem>
                  ))}
                </Select>
                {error && (
                  <Typography variant="caption" color="error" sx={{ mt: 0.5, fontFamily: 'Inter' }}>
                    {error}
                  </Typography>
                )}
                {!error && f.required && (
                  <Typography variant="caption" sx={{ mt: 0.5, color: '#6B7280', fontFamily: 'Inter' }}>
                    This field is required
                  </Typography>
                )}
              </FormControl>
            </Box>
          );
        }

        // DEFAULT: TEXT, EMAIL, TEL, NUMBER
        return (
          <Box key={key}>
            <Typography 
              sx={{ 
                fontFamily: 'Inter',
                fontSize: 14,
                fontWeight: 600,
                color: '#1F2937',
                mb: 1
              }}
            >
              {f.label || "Field"} {f.required && <span style={{ color: '#EF4444' }}>*</span>}
            </Typography>
            <TextField
              fullWidth
              placeholder={f.placeholder || "Type your answer here..."}
              type={
                fieldType === "tel" ? "tel" :
                fieldType === "email" ? "email" :
                fieldType === "number" ? "number" :
                "text"
              }
              value={value}
              onChange={(e) => setFormValues((s) => ({ ...s, [key]: e.target.value }))}
              error={!!error}
              helperText={error || (f.required && !error ? "This field is required" : "")}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                  bgcolor: '#F9FAFB',
                  '&:hover': {
                    bgcolor: '#F3F4F6',
                  },
                  '&.Mui-focused': {
                    bgcolor: '#fff',
                  }
                }
              }}
            />
          </Box>
        );
      })}
    </Box>
  </DialogContent>

  <DialogActions 
    sx={{ 
      gap: 1.5, 
      p: { xs: 2, sm: 3 },
      borderTop: '1px solid #E5E7EB',
      flexDirection: { xs: 'column', sm: 'row' }
    }}
  >
    <Button 
      onClick={closeFormDialog} 
      variant="outlined"
      fullWidth={isMobile}
      sx={{ 
        textTransform: 'none', 
        fontWeight: 600,
        fontFamily: 'Inter',
        borderRadius: 2,
        borderColor: '#E5E7EB',
        color: '#374151',
        py: 1.25,
        '&:hover': {
          borderColor: '#9CA3AF',
          bgcolor: '#F9FAFB'
        }
      }}
    >
      Cancel
    </Button>
    <Button 
      onClick={submitForm} 
      variant="contained" 
      disabled={formSubmitting}
      fullWidth={isMobile}
      sx={{
        textTransform: 'none',
        fontWeight: 600,
        fontFamily: 'Inter',
        borderRadius: 2,
        py: 1.25,
        px: 4,
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
        '&:hover': {
          background: 'linear-gradient(135deg, #5568d3 0%, #6941a5 100%)',
          boxShadow: '0 6px 16px rgba(102, 126, 234, 0.4)',
        },
        '&:disabled': {
          background: '#E5E7EB',
          color: '#9CA3AF'
        }
      }}
    >
      {formSubmitting ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <CircularProgress size={18} sx={{ color: '#fff' }} />
          <span>Submitting...</span>
        </Box>
      ) : (
        "Submit Form"
      )}
    </Button>
  </DialogActions>
</Dialog>


   <Dialog open={newsletterDialogOpen} onClose={() => { if (!newsletterSubmitting) closeNewsletterDialog(); }} fullWidth maxWidth="sm">
  <DialogTitle sx={{ fontWeight: 700 }}>{newsletterDialogText || "Subscribe to Newsletter"}</DialogTitle>

  <DialogContent dividers>
    <Stack spacing={2}>
      <TextField
        label="Your email"
        type="email"
        fullWidth
        value={newsletterEmail}
        onChange={(e) => setNewsletterEmail(e.target.value)}
        placeholder="you@company.com"
        InputProps={{ sx: { borderRadius: 2 } }}
        disabled={newsletterSubmitting}
      />

      <FormControlLabel
        control={
          <Checkbox
            checked={newsletterAccept}
            onChange={(e) => setNewsletterAccept(e.target.checked)}
            size="small"
            disabled={newsletterSubmitting}
          />
        }
        label={<Typography sx={{ fontSize: 13 }}>I accept all terms &amp; conditions</Typography>}
      />
    </Stack>
  </DialogContent>

  <DialogActions sx={{ px: 2, py: 1 }}>
    <Box sx={{ flex: 1 }} /> {/* pushes subscribe to right */}
    <Button onClick={() => { if (!newsletterSubmitting) closeNewsletterDialog(); }} sx={{ mr: 1 }} disabled={newsletterSubmitting}>
      Cancel
    </Button>

    <Button
      variant="contained"
      onClick={handleSubscribe}
      disabled={!newsletterAccept || newsletterSubmitting}
      sx={{ borderRadius: 2, minWidth: 120, position: "relative" }}
    >
      {newsletterSubmitting ? (
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
          <CircularProgress size={18} thickness={5} />
          <span>Subscribing...</span>
        </Box>
      ) : (
        "Subscribe"
      )}
    </Button>
  </DialogActions>
</Dialog>


      <Snackbar open={snack.open} autoHideDuration={3500} onClose={() => setSnack({ open: false, message: "" })} message={snack.message} />
    </Grid>

      {selectedBooking && (
        <BookingSessionDialog
          open={bookingDialogOpen}
          onClose={() => {
            setBookingDialogOpen(false);
            setSelectedBooking(null);
          }}
          bookingData={{
            title: selectedBooking.name,
            block_id: selectedBooking._id,
            user_id: selectedBooking.user_id,
            pricing: selectedBooking.pricing,
            buffer_time: selectedBooking.bufferTime,
            duration: selectedBooking.raw?.duration || selectedBooking.duration,
            description: selectedBooking.raw?.description || selectedBooking.description,
            interactionType: selectedBooking.raw?.interactionType || selectedBooking.interactionType,
          }}
        />
      )}
    </Box>
  );
}

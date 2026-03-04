// ProfileBlocksEditor.js (UserBioDashboard)
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
  useTheme,
  Snackbar,
  Grid,
  CircularProgress,
  Tooltip,
  Menu,
  MenuItem,
  Dialog,
  DialogContent,
  DialogTitle,
  Slide,
  Card,
  CardActionArea,
  useMediaQuery,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { styled } from "@mui/material/styles";
import EditIcon from "@mui/icons-material/Edit";
import LinkIcon from "@mui/icons-material/Link";
import AddIcon from "@mui/icons-material/Add";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import DeleteIcon from "@mui/icons-material/Delete";
import StorefrontIcon from "@mui/icons-material/Storefront";
import SmsOutlinedIcon from '@mui/icons-material/SmsOutlined';
import IndiaFlag from "../../images/flag.png";
import SaveIcon from "@mui/icons-material/Save";
import ShareIcon from "@mui/icons-material/Share";
import YouTubeIcon from "@mui/icons-material/YouTube";
import TwitterIcon from "@mui/icons-material/Twitter";
import InstagramIcon from "@mui/icons-material/Instagram";
import LinkedInIcon from "@mui/icons-material/LinkedIn";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import MovieIcon from "@mui/icons-material/Movie";
import EmailIcon from '@mui/icons-material/EmailOutlined';
import DescriptionIcon from '@mui/icons-material/DescriptionOutlined';
import axios from "axios";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import MailOutlinedIcon from '@mui/icons-material/MailOutlined';
import EventIcon from '@mui/icons-material/CalendarMonth';
import LinkBlockCreator from "./Blocks/LinkBlockCreator";
import VideoBlockCreator from "./Blocks/VideoBlockCreator";
import FormBlockCreator from "./Blocks/FormBlockCreator";
import NewsletterBlockCreator from "./Blocks/NewsletterBlockCreator";
import BookingBlockCreator from "./Blocks/BookingBlockCreator";
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import CloseIcon from "@mui/icons-material/Close";

// Styled buttons (keep all your existing styled components)
const PrimaryBtn = styled("button")(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  border: "none",
  cursor: "pointer",
  padding: "10px 16px",
  borderRadius: 6,
  color: "#fff",
  fontWeight: 700,
  background: "#077A7D",
  transition: "transform .12s ease, box-shadow .12s ease",
  fontSize: 14,
  textTransform: "none",
  [theme.breakpoints.down("sm")]: {
    width: "100%",
    justifyContent: "center",
    padding: "12px 14px",
  },
}));


const ShareUrlBtn = styled("button")(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  border: "none",
  cursor: "pointer",
  padding: "8px 14px",
  borderRadius: 999,
  color: "#fff",
  fontFamily: "Inter",
  fontWeight: 600,
  background: "linear-gradient(90deg,#7c3aed,#9f7aea)",
  boxShadow: "0 8px 24px rgba(124,58,237,0.14)",
  transition: "transform .12s ease, box-shadow .12s ease",
  fontSize: 12,
  textTransform: "none",
  [theme.breakpoints.down("sm")]: {
    width: "100%",
    justifyContent: "center",
    padding: "10px 12px",
  },
}));



const HandleBtn = styled("button")(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  border: "1px solid rgba(99,102,241,0.14)",
  padding: "8px 14px",
  borderRadius: 4,
  color: "#374151",
  background: "#FFF",
  textTransform: "none",
  [theme.breakpoints.down("sm")]: {
    width: "100%",
    justifyContent: "center",
    padding: "10px 12px",
  },
}));

const AddPill = styled("button")(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  border: "none",
  cursor: "pointer",
  padding: "10px 18px",
  borderRadius: 999,
  color: "#fff",
  fontWeight: 700,
  background: "#6d28d9",
  boxShadow: "0 12px 30px rgba(99,102,241,0.12)",
  fontSize: 14,
  [theme.breakpoints.down("sm")]: {
    width: "100%",
    justifyContent: "center",
    padding: "12px 14px",
  },
}));


const truncate = (str = "", max = 100) => {
  if (!str) return "";
  if (str.length <= max) return str;
  const slice = str.slice(0, max);
  const cutAt = slice.lastIndexOf(" ");
  const safe = cutAt > max * 0.6 ? slice.slice(0, cutAt) : slice;
  return safe.replace(/[.,;:!?-]+$/,"").trimEnd() + "...";
};

const MAX_TITLE = 40;
const MAX_DESC = 90;

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

export default function ProfileBlocksEditor() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingIntro, setIsEditingIntro] = useState(false);
  const [name, setName] = useState("");
  const [userIntro, setUserIntro] = useState("");
  const [link, setLink] = useState("");
  const [copySnackOpen, setCopySnackOpen] = useState(false);
  // const baseUrl = "/api/usersOn";
  const baseUrl = "/api/usersOn";

  const [userDetails, setUserDetails] = useState({});

  // **NEW: Child dialog states**
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [newsletterDialogOpen, setNewsletterDialogOpen] = useState(false);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);

  // Social state
  const [socials, setSocials] = useState([]);
  const [loadingSocials, setLoadingSocials] = useState(false);
  const [addingSocial, setAddingSocial] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [socialUrl, setSocialUrl] = useState("");
  const [socialApiMsg, setSocialApiMsg] = useState(null);

  const [isAddBlockOpen, setIsAddBlockOpen] = useState(false);
const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
const handleAddBlockClick = () => {
  setIsAddBlockOpen(true);
};

const handleAddBlockClose = () => {
  setIsAddBlockOpen(false);
};

  const PLATFORMS = [
    { key: "youtube", label: "YouTube", Icon: YouTubeIcon },
    { key: "twitter", label: "Twitter", Icon: TwitterIcon },
    { key: "linkedin", label: "LinkedIn", Icon: LinkedInIcon },
    { key: "whatsapp", label: "WhatsApp", Icon: WhatsAppIcon },
    { key: "instagram", label: "Instagram", Icon: InstagramIcon },
  ];

  const availablePlatforms = PLATFORMS.filter(
    (p) =>
      !socials.some(
        (s) => String(s.platform).toLowerCase() === String(p.key).toLowerCase()
      )
  );

  // blocks + drag & drop
  const [blocks, setBlocks] = useState([]);
  const [draggingId, setDraggingId] = useState(null);

  // Header image uploading
  const [uploadingHeader, setUploadingHeader] = useState({
    headerImage1: false,
    headerImage2: false,
    headerImage3: false,
  });


  // API/loading states
  const [loadingBlocks, setLoadingBlocks] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [apiSnack, setApiSnack] = useState({ open: false, message: "" });

  const api = axios.create({ baseURL: baseUrl || "", withCredentials: true });

  // All your existing utility functions
  const makeWaUrl = (input, message = "") => {
    if (!input) return "";
    let raw = String(input).trim();
    if (/^https?:\/\/(wa\.me|api\.whatsapp\.com)/i.test(raw)) {
      if (message) {
        const sep = raw.includes("?") ? "&" : "?";
        return `${raw}${sep}text=${encodeURIComponent(message)}`;
      }
      return raw;
    }
    raw = raw.replace(/[^\d+]/g, "");
    raw = raw.replace(/^\+/, "");
    let url = `https://wa.me/${raw}`;
    if (message) url += `?text=${encodeURIComponent(message)}`;
    return url;
  };

  function positionForKey(key) {
    switch (key) {
      case "headerImage1":
      case "leftHeadImage":
        return "left";
      case "headerImage2":
      case "rightTopImage":
        return "rightTop";
      case "headerImage3":
      case "rightBottomImage":
        return "rightBottom";
      default:
        return null;
    }
  }




  async function handleHeaderImageChange(e, key) {
    const file = e?.target?.files?.[0];
    if (!file) return;

    const slotKey = key || "headerImage1";
    const position = positionForKey(slotKey);
    if (!position) {
      console.warn("Unknown header image key", slotKey);
      return;
    }

    try {
      setUploadingHeader((s) => ({ ...s, [slotKey]: true }));

      const fd = new FormData();
      fd.append("image", file);
      fd.append("position", position);

      const res = await axios.post(`${baseUrl}/upload-header-image`, fd, {
        withCredentials: true,
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res?.data?.success) {
        const returnedUser = res.data.user;
        if (returnedUser) {
          setUserDetails((prev) => ({
            ...prev,
            leftHeadImage: returnedUser.leftHeadImage ?? prev.leftHeadImage,
            rightTopImage: returnedUser.rightTopImage ?? prev.rightTopImage,
            rightBottomImage: returnedUser.rightBottomImage ?? prev.rightBottomImage,
          }));
        } else if (res.data.url) {
          const returnedField = res.data.updatedField;
          if (returnedField) {
            setUserDetails((prev) => ({ ...prev, [returnedField]: res.data.url }));
          }
        }
        setApiSnack({ open: true, message: "Image uploaded" });
      } else {
        setApiSnack({ open: true, message: res?.data?.message || "Upload failed" });
      }
    } catch (err) {
      console.error("upload error", err);
      setApiSnack({ open: true, message: err?.response?.data?.message || err.message || "Upload failed" });
    } finally {
      setUploadingHeader((s) => ({ ...s, [slotKey]: false }));
      try { e.target.value = ""; } catch (ignore) {}
    }
  }

  // Keep all your fetch functions
  useEffect(() => {
    fetchSocials();
  }, []);

  async function fetchSocials() {
    setLoadingSocials(true);
    try {
      const res = await api.get("/user/socials");
      setSocials(res.data.socials || []);
    } catch (err) {
      console.error("fetchSocials", err);
      setSocialApiMsg("Failed to load socials");
    } finally {
      setLoadingSocials(false);
    }
  }

  async function saveSocial() {
    if (!selectedPlatform || !socialUrl.trim()) {
      setSocialApiMsg("Pick a platform and enter a URL");
      return;
    }
    setAddingSocial(true);
    try {
      const payload = { platform: selectedPlatform, url: socialUrl.trim() };
      const res = await api.post("/user/socials", payload);
      const added = res.data.social;
      if (added) {
        setSocials((s) => [...s, added]);
      } else {
        await fetchSocials();
      }
      setSelectedPlatform(null);
      setSocialUrl("");
      setSocialApiMsg("Saved");
    } catch (err) {
      console.error("saveSocial", err);
      setSocialApiMsg(err?.response?.data?.message || "Failed to save");
    } finally {
      setAddingSocial(false);
      setTimeout(() => setSocialApiMsg(null), 2000);
    }
  }

  async function deleteSocial(id) {
    try {
      await api.delete(`/user/socials/${id}`);
      setSocials((s) => s.filter((x) => String(x._id || x.id) !== String(id)));
    } catch (err) {
      console.error("deleteSocial", err);
      setSocialApiMsg("Delete failed");
      setTimeout(() => setSocialApiMsg(null), 2000);
    }
  }

  const handleSessionExpired = () => {
    toast.error("Session expired. Please log in again.");
    setTimeout(() => {
      navigate("/professional/login");
    }, 2000);
  };

  useEffect(() => {
    const verifyToken = async () => {
      setLoading(true);
      try {
        
        const res = await axios.get(`${baseUrl}/verify-login-token`, {
          withCredentials: true,
        });
        if (res.data.valid) {

             const creatorHandleRes = await axios.get(
                    `${baseUrl}/check-handle-created`,
                    { withCredentials: true }
                  );
          
                  if(creatorHandleRes.data.success){
          
          fetchData();
                  }
                  else{
        navigate("/professional/creator/onboarding");

                  }
        } else {
          handleSessionExpired();
        }
      } catch (error) {
        if (
          error.response &&
          (error.response.status === 401 || error.response.status === 403)
        ) {
          handleSessionExpired();
        } else {
          toast.error("Network error, please try again later.");
          handleSessionExpired();
        }
      } finally {
        setLoading(false);
      }
    };
    verifyToken();
  }, []);

  const fetchData = async () => {
    try {
      const ress = await axios.get(baseUrl + "/get-user-details", {
        withCredentials: true,
      });
      if (ress.data.success) {
        setUserDetails(ress.data.data);
        setName(ress.data.data.name || "");
        setUserIntro(ress.data.data.intro || "");
      } else {
        setLoading(false);
        toast.error("Session expired. Please log in again.");
        setTimeout(() => {
          navigate("/professional/login");
        }, 2000);
      }
    } catch (e) {
      setLoading(false);
      toast.error("Network error. Please log in again.");
      setTimeout(() => {
        navigate("/professional/login");
      }, 2000);
    }
  };

  useEffect(() => {
    fetchBlocks();
  }, []);

  async function fetchBlocks() {
    setLoadingBlocks(true);
    try {
      const res = await axios.get(baseUrl + "/fetch-blocks", {
        withCredentials: true,
      });
      const data = res.data;

      const normalized = (data || []).map((b) => ({
        id: b._id || b.id,
        title: b.name || b.title || "",
        action: b.action || b.url || "",
        type: b.type || "link",
        image: b.image,
        raw: b,
      }));

      setBlocks(
        normalized.sort((a, b) => {
          const ao = a.raw?.order ?? 0;
          const bo = b.raw?.order ?? 0;
          return ao - bo;
        })
      );
    } catch (err) {
      console.error("fetchBlocks error:", err);
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        "Failed to load blocks";
      setApiSnack({ open: true, message: msg });
    } finally {
      setLoadingBlocks(false);
    }
  }

  // **NEW: Universal save handler for child components**
  const handleSaveBlock = async (blockData) => {
    try {
      const response = await axios.post(
        baseUrl + '/save-blocks',
        blockData,
        { withCredentials: true }
      );

      if (response.data) {
        const saved = response.data;
        const normalized = {
          id: saved._id || saved.id || `temp-${Date.now()}`,
          title: saved.name || blockData.name,
          action: saved.action || blockData.action,
          type: saved.type || blockData.type,
          image: saved.image,
          raw: saved,
        };

        setBlocks((s) => [...s, normalized]);
        setApiSnack({ open: true, message: "Block created successfully!" });
        
        // Close all dialogs
        setLinkDialogOpen(false);
        setVideoDialogOpen(false);
        setFormDialogOpen(false);
        setNewsletterDialogOpen(false);
        setBookingDialogOpen(false);
        
        return response.data;
      }
    } catch (error) {
      console.error('Error saving block:', error);
      const msg = error?.response?.data?.error || 'Failed to create block';
      setApiSnack({ open: true, message: msg });
      throw error;
    }
  };

// Add block menu anchor state (should be at top with other states)
const [addBlockMenuAnchor, setAddBlockMenuAnchor] = useState(null);

// Block type configurations
const blockTypes = [
  { type: 'link', label: 'Link', description: 'Boost your income by adding product and affiliate links that generate commissions.', icon: <LinkIcon />, color: '#667eea' },
  { type: 'video', label: 'Video', description: 'Grow your channel by embedding your YouTube videos directly on your page.', icon: <MovieIcon />, color: '#f093fb' },
  { type: 'form', label: 'Form', description: 'Easily collect emails, phone numbers, and other key details with a customizable form.', icon: <DescriptionIcon />, color: '#fa709a' },
  { type: 'booking', label: 'Booking', description: 'Allow your audience to schedule personalized 1:1 sessions at their convenience.', icon: <EventIcon />, color: '#7132CA' },
  // { type: 'newsletter', label: 'Newsletter', description: 'Build stronger relationships by delivering valuable content and updates straight to your subscribers.', icon: <EmailIcon />, color: '#30cfd0' },
];


const handleAddBlockMenuClose = () => {
  setAddBlockMenuAnchor(null);
};

const handleBlockTypeSelect = (blockType) => {
  handleAddBlockClose(); // Close the selection dialog
  
  // existing switch case logic...
  switch(blockType) {
    case 'link':
      setLinkDialogOpen(true);
      break;
    case 'video':
      setVideoDialogOpen(true);
      break;
    case 'form':
      setFormDialogOpen(true);
      break;
    case 'newsletter':
      setNewsletterDialogOpen(true);
      break;
    case 'booking':
      setBookingDialogOpen(true);
      break;
    default:
      break;
  }
};



  async function deleteBlock(id) {
    setDeletingId(id);
    try {
      const res = await api.delete(`/delete-block/${id}`);
      if (res.status === 200 && res.data.success !== false) {
        setBlocks((s) => s.filter((b) => b.id !== id));
        setApiSnack({ open: true, message: "Block deleted" });
      } else {
        const msg = (res.data && (res.data.message || res.data.error)) || "Delete failed";
        setApiSnack({ open: true, message: msg });
      }
    } catch (err) {
      console.error("deleteBlock error:", err);
      const msg = err?.response?.data?.message || "Failed to delete";
      setApiSnack({ open: true, message: msg });
    } finally {
      setDeletingId(null);
    }
  }

  function onDragStart(e, id) {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", id);
    } catch {}
  }

  function onDragOver(e, overId) {
    e.preventDefault();
    if (!draggingId || draggingId === overId) return;
    setBlocks((prev) => {
      const arr = [...prev];
      const from = arr.findIndex((x) => x.id === draggingId);
      const to = arr.findIndex((x) => x.id === overId);
      if (from === -1 || to === -1) return prev;
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr;
    });
  }

  async function onDragEnd() {
    setDraggingId(null);
    await saveBlocksOrder();
  }

  async function saveBlocksOrder() {
    try {
      const payload = blocks.map((b, idx) => ({
        id: b.id,
        order: idx + 1,
      }));

      await api.post("/update-block-order", { order: payload }, { headers: { "Content-Type": "application/json" } });
      setApiSnack({ open: true, message: "Order saved" });
    } catch (err) {
      console.error("saveBlocksOrder", err);
      setApiSnack({ open: true, message: "Failed to save order" });
    }
  }

  async function copyToClipboard() {
    const text = "https://"+userDetails.handleUserName + ".myhandle.in" || "";
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopySnackOpen(true);
    } catch (err) {
      setCopySnackOpen(true);
      console.error("Copy failed", err);
    }
  }

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

  const renderYouTubePreview = (url) => {
    const id = getYouTubeId(url);
    if (!id) {
      return (
        <Box sx={{ p: 2 }}>
          <Typography variant="body2" sx={{ opacity: 0.75 }}>
            Paste a YouTube URL to preview it here.
          </Typography>
          {url && (
            <Typography variant="caption" sx={{ display: "block", mt: 1, wordBreak: "break-all" }}>
              {url}
            </Typography>
          )}
        </Box>
      );
    }

    const src = `https://www.youtube.com/embed/${id}`;
    return (
      <Box sx={{ position: "relative", pt: "56.25%" }}>
        <iframe
          title="youtube-preview"
          src={src}
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </Box>
    );
  };

  async function saveProfileField(payload) {
    try {
      const res = await api.post("/update-profile", payload, { withCredentials : true });
      if (res.data.success) {
        setUserDetails((prev) => ({ ...prev, ...payload }));
        if (payload.name !== undefined) setName(payload.name);
        if (payload.intro !== undefined) setUserIntro(payload.intro);
        setApiSnack({ open: true, message: "Saved" });
      } else {
        setApiSnack({ open: true, message: res.data.message || "Save failed" });
      }
    } catch (err) {
      console.error("saveProfileField", err);
      setApiSnack({ open: true, message: "Failed to save" });
    }
  }

  const handleSaveName = async () => {
    setIsEditingName(false);
    if ((userDetails.name || "") === name) return;
    await saveProfileField({ name });
  };

  const handleSaveIntro = async () => {
    setIsEditingIntro(false);
    if ((userDetails.intro || "") === userIntro) return;
    await saveProfileField({ intro: userIntro });
  };



  // Keep ALL your existing render functions (renderPreviewBlock, etc.)
  function renderPreviewBlock(b) {
    if (b.type === "link" || b.type === "cta") {
      return (
        <Paper
          key={b.id}
          sx={{
            p: 1.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderRadius: 2,
            color: "#0f1724",
            boxShadow: "0 10px 30px rgba(2,6,23,0.35)",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 2, sm: 3, md: 3 } }}>
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: 1.5,
                bgcolor: "#F0F0F0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <LinkIcon sx={{ fontSize: 16 }} />
            </Box>

            <Box>
              <Typography sx={{ fontFamily: "Inter", fontSize: "14px", fontWeight: 500 }}>{b.title}</Typography>
            </Box>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <ArrowForwardIosIcon sx={{ fontSize: 16, color: "rgba(15,23,42,0.5)" }} />
          </Box>
        </Paper>
      );
    }

    if (b.type === "video") {
      const ytId = getYouTubeId(b.action || "");
      const thumb = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null;

      return (
        <Paper
          key={b.id}
          sx={{
            p: 0,
            borderRadius: 2,
            border: "1px solid #37353E",
            boxShadow: "0 10px 30px rgba(2,6,23,0.12)",
            cursor: b.action ? "pointer" : "default",
            overflow: "hidden",
          }}
          onClick={() => {
            if (b.action) window.open(b.action, "_blank");
          }}
          elevation={0}
        >
          <Box sx={{ position: "relative", width: "100%", aspectRatio: "16/9", bgcolor: "#000" }}>
            {thumb ? (
              <Box
                component="img"
                src={thumb}
                alt={b.title || "video thumbnail"}
                sx={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "center",
                  display: "block",
                }}
              />
            ) : (
              <Box
                sx={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  bgcolor: "#F3F4F6",
                }}
              >
                <MovieIcon sx={{ fontSize: 28, color: "rgba(15,23,42,0.6)" }} />
              </Box>
            )}

            <Box
              sx={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}
            >
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  bgcolor: "rgba(0,0,0,0.55)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 6px 18px rgba(2,6,23,0.28)",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                  <path d="M8 5v14l11-7L8 5z" fill="#fff" />
                </svg>
              </Box>
            </Box>
          </Box>
        </Paper>
      );
    }

    if (b.type === "form") {
      return (
        <Paper key={b.id} sx={{ p: 1.5, borderRadius: 2, cursor: "pointer" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
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
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontFamily: "Inter", fontSize: "14px", fontWeight: 600 }}>{b.title || "Contact form"}</Typography>
            </Box>
            <Box>
              <ArrowForwardIosIcon sx={{ fontSize: 16, color: "rgba(15,23,42,0.5)" }} />
            </Box>
          </Box>
        </Paper>
      );
    }

    if (b.type === "newsletter") {
      return (
        <Paper
          key={b.id}
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
          elevation={0}
        >
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

            <Box sx={{ display: "flex", alignItems: "center", ml: 1 }}>
              <ArrowForwardIosIcon sx={{ fontSize: 16, color: "rgba(15,23,42,0.5)" }} />
            </Box>
          </Box>
        </Paper>
      );
    }

    if (b.type === "booking") {
      let bookingConfig = {};
      if (b.raw?.duration) {
        bookingConfig = {
          duration: b.raw.duration,
          description: b.raw.description || "",
          interactionType: b.raw.interactionType || "voice",
        };
      } else if (typeof b.action === "string") {
        try {
          bookingConfig = JSON.parse(b.action);
        } catch {}
      }

      const isMeetingType = bookingConfig.interactionType === "voice"
        ? "Voice Meeting"
        : "Video Meeting";

      return (
        <Paper
          key={b.id}
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
              <Typography
                sx={{
                  fontFamily: "Inter",
                  fontWeight: 600,
                  fontSize: 15,
                  mb: 0.25,
                }}
              >
                {truncate(b.title || "1:1 Booking", MAX_TITLE)}
              </Typography>

              {bookingConfig.description && (
                <Typography
                  sx={{
                    fontFamily: "Inter",
                    fontSize: 12,
                    color: "#9CA3AF",
                    mt: 0.25,
                  }}
                >
                  {truncate(bookingConfig.description, MAX_DESC)}
                </Typography>
              )}

              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
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

          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
            <IconButton
              aria-label="open booking"
              onClick={(e) => {
                e.stopPropagation();
              }}
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

    return (
      <Paper key={b.id} sx={{ p: 1.5 }}>
        <Typography>{b.title}</Typography>
      </Paper>
    );
  }

  return (
    <>
      <Box sx={{ p: { xs: 0, sm: 0, md: 1 }, py: 1, minHeight: '100dvh', overflowY: 'auto', mb: 2 }}>

        { loading ? 
      (<Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
                    <CircularProgress size={28} />
                  </Box>  
      ) : (
      
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 8}}>

              {/* Your complete existing header with profile images */}
        <Paper
          sx={{
            p: { xs: 2, sm: 3 },
            background: "#FFFFFF",
          }}
        >
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 2}}>
              <Box
                sx={{
                  width: "100%",
                  height: 140,
                  borderRadius: 2,
                  bgcolor: "#f4f4f4",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  overflow: "hidden",
                }}
                onClick={() => document.getElementById("image-upload-1")?.click()}
              >
                {uploadingHeader.headerImage1 ? (
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
                    <CircularProgress size={28} />
                  </Box>
                ) : userDetails?.leftHeadImage ? (
                  <Box
                    component="img"
                    src={userDetails.leftHeadImage}
                    alt="Header Left"
                    sx={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      objectPosition: "center",
                      backgroundColor: "#f4f4f4",
                    }}
                  />
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Add Image
                  </Typography>
                )}
                <input
                  id="image-upload-1"
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => handleHeaderImageChange(e, "headerImage1")}
                />
              </Box>
            </Grid>

            <Grid size={{ xs: 12, md: 10}}>
              <Box sx={{ display: "flex", flexDirection: "column" }}>
                <Box sx={{ flex: 1, width: "100%" }}>
                  {!isEditingName ? (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                      <Typography
                        sx={{ fontFamily: "Inter", fontSize: "18px", fontWeight: 600, cursor: "pointer", wordBreak: "break-word" }}
                        onClick={() => setIsEditingName(true)}
                      >
                        {name || "Your name"}
                      </Typography>
                      <IconButton onClick={() => setIsEditingName(true)} aria-label="edit-name">
                        <EditIcon sx={{ fontSize: "16px" }} />
                      </IconButton>
                    </Box>
                  ) : (
                    <Box sx={{ display: "flex", gap: 1, alignItems: "center", width: "100%" }}>
                      <TextField
                        size="small"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={handleSaveName}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleSaveName();
                          }
                        }}
                        inputProps={{ maxLength: 60 }}
                        sx={{ flex: 1 }}
                      />
                      <IconButton color="primary" onClick={handleSaveName} aria-label="save-name">
                        <SaveIcon />
                      </IconButton>
                    </Box>
                  )}
                </Box>

                <Box>
                  {!isEditingIntro ? (
                    <Stack sx={{ display : 'flex', flexDirection : 'column', justifyContent : 'space-between'}}>
                    <Box sx={{ display: "flex", gap: 1, flexDirection: "row" }}>
                      <Typography
                        sx={{ fontFamily: "Inter", fontSize: "15px", fontWeight: 500, cursor: "pointer", wordBreak: "break-word", color: "grey" }}
                        onClick={() => setIsEditingIntro(true)}
                      >
                        {userIntro || "Write a short intro..."}
                      </Typography>
                      <IconButton onClick={() => setIsEditingIntro(true)} aria-label="edit-intro">
                        <EditIcon sx={{ fontSize: "16px" }} />
                      </IconButton>
                    </Box>

                      <Box
                  sx={{
                    display: "flex",
                    gap: 1,
                    alignItems: "center",
                    mt: 1,
                    flexDirection: { xs: "column", sm: "row" },
                  }}
                >
                  <Box sx={{ width: { xs: "100%", sm: "auto" } }}>

                    <HandleBtn title="Customize Link" onClick={copyToClipboard}>
                    <Stack sx={{ display : 'flex', flexDirection : 'row', gap: 3, alignItems : 'center'}}>
                     
                     <Box sx={{ display : 'flex', flexDirection : 'row', gap: 1, alignItems : 'center'}}>
                      <LanguageOutlinedIcon style={{ fontSize: 18, cursor: "pointer" }} />

                      <Typography sx={{ fontFamily: "Inter", fontSize: 14, fontWeight: 500, wordBreak: "break-all", color: "#000000" }}>
                        {userDetails.handleUserName ? userDetails.handleUserName + ".myhandle.in" : "yourhandle.myhandle.in"}
                      </Typography>

                      </Box>
                      <ContentCopyOutlinedIcon style={{ fontSize: 18, cursor: "pointer" }} />

                    </Stack>

                    </HandleBtn>




                  </Box>

                  <Box sx={{ width: { xs: "100%", sm: "auto" } }}>
                    <ShareUrlBtn onClick={copyToClipboard} aria-label="copy-link">
                      <ShareIcon style={{ fontSize: 16 }} />
                      Share
                    </ShareUrlBtn>
                  </Box>
                </Box>
                    </Stack>
                  ) : (
                  
                    <Box sx={{ display: "flex", gap: 1, flexDirection: 'row' }}>
                      <TextField
                        size="small"
                        value={userIntro}
                        onChange={(e) => setUserIntro(e.target.value)}
                        onBlur={handleSaveIntro}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveIntro();
                        }}
                        inputProps={{ maxLength: 160 }}
                        sx={{ flex: 1 }}
                      />
                      <IconButton color="primary" onClick={handleSaveIntro} aria-label="save-intro">
                        <SaveIcon />
                      </IconButton>
                    </Box>

                  )}
                </Box>
              </Box>
            </Grid>

        
          </Grid>
        </Paper>

            {/* Your complete socials section */}
            <Paper sx={{ p: { xs: 1, sm: 3, md: 3 }, mt: 1.5 }}>
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle1" sx={{ mb: 2 }}>
                  Social accounts
                </Typography>

                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 2 }}>
                  {availablePlatforms.length === 0 ? (
                    <Typography variant="caption" color="text.secondary">
                      You've added all available platforms.
                    </Typography>
                  ) : (
                    availablePlatforms.map(({ key, label, Icon }) => {
                      const selected = selectedPlatform === key;
                      return (
                        <Box
                          key={key}
                          onClick={() => {
                            setSelectedPlatform(selected ? null : key);
                            setSocialUrl("");
                          }}
                          sx={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 1,
                            cursor: "pointer",
                            px: 1.25,
                            py: 0.5,
                            borderRadius: 999,
                            border: selected ? `1px solid ${theme.palette.primary.main}` : "1px solid rgba(0,0,0,0.06)",
                            bgcolor: selected ? "background.paper" : "transparent",
                            minHeight: 36,
                          }}
                        >
                          <Icon sx={{ fontSize: 20, color: selected ? theme.palette.primary.main : "text.secondary" }} />
                          <Typography sx={{ fontFamily: "Inter", fontSize: "14px", fontWeight: 600 }}>{label}</Typography>
                        </Box>
                      );
                    })
                  )}
                </Box>

                {selectedPlatform && (
                  <Paper sx={{ p: 1, mb: 1, borderRadius: 2 }}>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems="center">
                      <TextField
                        fullWidth
                        size="small"
                        placeholder={
                          selectedPlatform === "whatsapp"
                            ? "Enter 10 Digit WhatsApp Number"
                            : `Enter ${selectedPlatform} URL`
                        }
                        type={selectedPlatform === "whatsapp" ? "tel" : "url"}
                        value={socialUrl}
                        onChange={(e) => setSocialUrl(e.target.value)}
                        inputProps={
                          selectedPlatform === "whatsapp"
                            ? { pattern: "^[+0-9]{10,15}$", inputMode: "tel" }
                            : {}
                        }
                      />
                      <PrimaryBtn onClick={saveSocial} disabled={addingSocial} style={{ display: "inline-flex", alignItems: "center" }}>
                        {addingSocial ? <CircularProgress size={18} /> : <SaveIcon />}
                        <span style={{ marginLeft: 8 }}>{addingSocial ? "Saving..." : "Save"}</span>
                      </PrimaryBtn>
                    </Stack>
                    {socialApiMsg && <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>{socialApiMsg}</Typography>}
                  </Paper>
                )}

                <Stack spacing={1}>
                  {loadingSocials ? (
                    <Box sx={{ py: 2, display: "flex", justifyContent: "center" }}>
                      <CircularProgress size={24} />
                    </Box>
                  ) : socials.length === 0 ? (
                    <Typography variant="caption" color="text.secondary">No socials saved yet — pick one above to add.</Typography>
                  ) : (
                    socials.map((s) => {
                      const Plat = PLATFORMS.find((p) => p.key === s.platform)?.Icon || LinkIcon;
                      return (
                        <Paper key={s._id || s.id || s.url} variant="outlined" sx={{ p: 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Plat sx={{ fontSize: 18 }} />
                            <Box>
                              <Typography variant="body2" sx={{ fontFamily: "Inter", fontWeight: 500, textTransform: "capitalize" }}>{s.platform}</Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all" }}>{s.url}</Typography>
                            </Box>
                          </Box>
                          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                            <IconButton onClick={() => window.open(s.url, "_blank")} size="small" title="Open">
                              <ChevronRightRoundedIcon fontSize="small" />
                            </IconButton>
                            <IconButton onClick={() => deleteSocial(s._id || s.id)} size="small" title="Delete">
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </Paper>
                      );
                    })
                  )}
                </Stack>
              </Box>
            </Paper>

            {/* Your complete blocks list section */}
            <Paper sx={{ p: { xs: 1, sm: 3, md: 3 }, mt: 1.5 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, flexDirection: { xs: "column", sm: "row" }, gap: { xs: 1, sm: 0 } }}>
                <Typography variant="subtitle1">Block List</Typography>
                <Box sx={{ width: { xs: "100%", sm: "auto" } }}>
               {/* Add Button */}
<AddPill onClick={handleAddBlockClick}>
  <AddIcon />
  Add New Block
</AddPill>

{/* NEW: Responsive Dialog for Block Selection */}
<Dialog
  open={isAddBlockOpen}
  TransitionComponent={isMobile ? Transition : undefined} // Only slide up on mobile
  keepMounted
  maxWidth="md"
  onClose={handleAddBlockClose}
  scroll="paper"
  // Specific styling for the "Bottom Sheet" look on mobile
  PaperProps={{
    sx: isMobile
      ? {
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          m: 0,
          width: "100%",
          maxHeight: "85vh", // Don't take full height
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          borderRadius: "24px 24px 0 0", // Explicitly square off bottom
        }
      : {
          borderRadius: 3,
          width: "100%",
        },
  }}
>
  <DialogTitle sx={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center',
      pb: 1,
      mb: 1
    }}>
    <Typography sx={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 18 }}>
      What would you like to add?
    </Typography>
    <IconButton onClick={handleAddBlockClose} size="small">
      <CloseIcon fontSize="small" />
    </IconButton>
  </DialogTitle>

  <DialogContent sx={{ p: 2 }}>
    <Grid container spacing={2} mt={1}>
      {blockTypes.map((block) => (
        <Grid size={{ xs: 12, sm: 6}} key={block.type}>
          <Card
            elevation={0}
            sx={{
              border: "1px solid #E5E7EB",
              borderRadius: 3,
              overflow: "hidden",
              transition: "all 0.2s ease",
              "&:hover": {
                borderColor: block.color,
                bgcolor: alpha(block.color, 0.04),
                transform: "translateY(-2px)",
                boxShadow: `0 4px 12px ${alpha(block.color, 0.15)}`,
              },
            }}
          >
            <CardActionArea 
              onClick={() => handleBlockTypeSelect(block.type)}
              sx={{ p: 2, display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 2 }}
            >
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 2,
                  bgcolor: alpha(block.color, 0.1),
                  color: block.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}
              >
                {/* Clone element to increase icon size if needed */}
                {React.cloneElement(block.icon, { sx: { fontSize: 32 } })}
              </Box>
              
              <Box>
                <Typography sx={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 16 }}>
                  {block.label}
                </Typography>
                <Typography color="text.secondary" sx={{ fontFamily: 'Inter', fontWeight: 400, fontSize: 13, mt: 0.5 }}>
                  {block.description}
                </Typography>
              </Box>
            </CardActionArea>
          </Card>
        </Grid>
      ))}
    </Grid>
  </DialogContent>
</Dialog>

                </Box>
              </Box>

              <Stack spacing={1}>
                {loadingBlocks ? (
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 6 }}>
                    <CircularProgress />
                  </Box>
                ) : (
                  blocks.map((b) => (
                    <Paper
                      key={b.id}
                      variant="outlined"
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        p: 1.25,
                        cursor: "grab",
                        bgcolor: b.id === draggingId ? "action.selected" : "background.paper",
                      }}
                      draggable
                      onDragStart={(e) => onDragStart(e, b.id)}
                      onDragOver={(e) => onDragOver(e, b.id)}
                      onDragEnd={onDragEnd}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", pr: 1 }}>
                        <DragIndicatorIcon fontSize="small" color="action" />
                      </Box>

                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body1">{b.title}</Typography>
                      </Box>

                      <Box sx={{ display: "flex", gap: 1 }}>
                        <button
                          onClick={() => deleteBlock(b.id)}
                          style={{
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            padding: 8,
                            borderRadius: 8,
                          }}
                          title="Delete block"
                          disabled={deletingId === b.id}
                        >
                          {deletingId === b.id ? <CircularProgress size={18} /> : <DeleteIcon fontSize="small" />}
                        </button>
                      </Box>
                    </Paper>
                  ))
                )}

                {!loadingBlocks && blocks.length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    No blocks yet — click "Add New Blocks".
                  </Typography>
                )}
              </Stack>
            </Paper>
          </Grid>

       {/* Modified Preview Pane - iPhone Look */}
          <Grid size={{ xs: 12, md: 4 }}>
            {/* Sticky container so the phone stays in view while scrolling the editor on the left */}
            <Box sx={{ position: { md: "sticky" }, top: { md: 24 }, pb: 4 }}>
              
              {/* The Phone Frame / Bezel */}
              <Box
                sx={{
                  margin: "0 auto",
                  width: { xs: "100%", sm: 360 }, // Standard mobile width
                  height: { xs: 600, sm: 720 },   // Fixed height for the "Phone"
                  border: "6px solid #313647",   // Dark grey bezel
                  borderRadius: "45px",           // Heavy rounding
                  overflow: "hidden",             // Clips the content to the rounded corners
                  position: "relative",
                  bgcolor: "#000",
                  boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)", // Deep shadow for depth
                }}
              >
                {/* The "Notch" or Dynamic Island (Visual flair) */}
                <Box
                  sx={{
                    position: "absolute",
                    top: 0,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 100,
                    height: 12,
                    bgcolor: "#2d2d2d",
                    borderBottomLeftRadius: 14,
                    borderBottomRightRadius: 14,
                    zIndex: 10,
                  }}
                />

                {/* The Scrollable Screen Area */}
                <Box
                  sx={{
                    height: "100%",
                    overflowY: "auto", // Makes content scrollable
                    background: "linear-gradient(135deg, #0f0c29 0%, #0b0b0b 40%, #0b0b0b 100%)",
                    // Hide scrollbar for Chrome/Safari/Opera
                    "&::-webkit-scrollbar": {
                      display: "none",
                    },
                    // Hide scrollbar for IE, Edge and Firefox
                    msOverflowStyle: "none",
                    scrollbarWidth: "none",
                  }}
                >
                  <Box
                    sx={{
                      position: "relative",
                      height: { xs: 200, sm: 240 }, // Slightly adjusted header height for phone prop
                      bgcolor: "#0b0b0b",
                    }}
                  >
                    <Box
                      component="img"
                      src={userDetails.leftHeadImage}
                      alt="hero"
                      sx={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        objectPosition: { xs: "center 10%", sm: "center 25%" },
                        display: "block",
                      }}
                    />

                    <Box
                      sx={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: "30%",
                        background:
                          "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(8,8,12,0.55) 45%, rgba(8,8,12,0.85) 75%, #08080c 100%)",
                        pointerEvents: "none",
                      }}
                    />
                  </Box>

                  <Box sx={{ p: 2, pb: 6 }}>
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        mt: 1,
                      }}
                    >
                      <Typography
                        sx={{
                          color: "#FFFFFF",
                          fontFamily: "Inter",
                          fontWeight: 500,
                          fontSize: 18,
                        }}
                      >
                        {name}
                      </Typography>

                      <Typography
                        sx={{
                          color: "#FFFFFF",
                          fontFamily: "Inter",
                          fontWeight: 400,
                          fontSize: 13,
                          mt: 1,
                        }}
                      >
                        {userIntro}
                      </Typography>

                      {/* Social Icons Render Logic (Kept exactly as yours) */}
                      <Box sx={{ display: "flex", gap: 1, alignItems: "center", mt: 1, flexWrap: "wrap" }}>
                        {socials.map((s) => {
                          const key = (s.platform || s.name || "").toLowerCase();
                          const IconComp =
                            key === "youtube"
                              ? YouTubeIcon
                              : key === "twitter"
                              ? TwitterIcon
                              : key === "whatsapp"
                              ? WhatsAppIcon
                              : key === "instagram"
                              ? InstagramIcon
                              : key === "linkedin"
                              ? LinkedInIcon
                              : LinkIcon;

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
                          const url =
                            key === "whatsapp"
                              ? makeWaUrl(rawUrl, s.message || "")
                              : rawUrl;

                          return (
                            <Tooltip
                              key={s._id || rawUrl}
                              title={(key && key.charAt(0).toUpperCase() + key.slice(1)) || "Link"}
                              arrow
                            >
                              <IconButton
                                onClick={() => url && window.open(url, "_blank", "noopener, noreferrer")}
                                sx={{
                                  bgcolor: bg,
                                  borderRadius: 1,
                                  width: 34,
                                  height: 34,
                                  "&:hover": { bgcolor: hoverBg },
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                                aria-label={`open ${key}`}
                                size="small"
                              >
                                <IconComp sx={{ fontSize: 28, color: color }} />
                              </IconButton>
                            </Tooltip>
                          );
                        })}
                        {/* Store/DM Icons logic kept same... */}
                         {userDetails?.store_enabled ? (
                            <IconButton onClick={() => alert("Store is enabled")} sx={{ color: "#fff", ml: 0.5 }}>
                              <StorefrontIcon sx={{ fontSize: 22 }} />
                            </IconButton>
                          ) : null}
                          {userDetails?.dm_enabled ? (
                            <IconButton onClick={() => alert("DM is enabled")} sx={{ color: "#fff", ml: 0.5 }}>
                              <SmsOutlinedIcon sx={{ fontSize: 22 }} />
                            </IconButton>
                          ) : null}
                      </Box>
                    </Box>

                    {/* Preview Blocks */}
                    <Stack spacing={1.25} sx={{ mt: 2, mb: 1 }}>
                      {loadingBlocks ? (
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            py: 4,
                          }}
                        >
                          <CircularProgress />
                        </Box>
                      ) : (
                        blocks.map((b) => renderPreviewBlock(b))
                      )}
                    </Stack>

                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        {link}
                      </Typography>
                    </Box>

                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, justifyContent: "center", mt: 3, mb: 2 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        <Typography
                          sx={{
                            fontFamily: "Inter",
                            fontWeight: 400,
                            color: "rgba(255,255,255,0.8)",
                            fontSize: 12,
                            mb: 0.25,
                          }}
                        >
                          Made in India
                        </Typography>
                        <Box
                          component="img"
                          src={IndiaFlag}
                          alt="India flag"
                          sx={{ width: 18, height: "auto", display: "block", borderRadius: "2px" }}
                        />
                      </Box>
                    </Box>
                  </Box>
                </Box>
              </Box>
            </Box>
          </Grid>
        </Grid>
        )}
      </Box>

      {/* **NEW: Child Creator Dialogs** */}
      <LinkBlockCreator
        open={linkDialogOpen}
        onClose={() => setLinkDialogOpen(false)}
        onSave={handleSaveBlock}
      />

      <VideoBlockCreator
        open={videoDialogOpen}
        onClose={() => setVideoDialogOpen(false)}
        onSave={handleSaveBlock}
      />

      <FormBlockCreator
        open={formDialogOpen}
        onClose={() => setFormDialogOpen(false)}
        onSave={handleSaveBlock}
      />

      <NewsletterBlockCreator
        open={newsletterDialogOpen}
        onClose={() => setNewsletterDialogOpen(false)}
        onSave={handleSaveBlock}
      />

      <BookingBlockCreator
        open={bookingDialogOpen}
        onClose={() => setBookingDialogOpen(false)}
        onSave={handleSaveBlock}
      />


      {/* Snackbars */}
      <Snackbar
        open={apiSnack.open}
        autoHideDuration={3000}
        onClose={() => setApiSnack({ ...apiSnack, open: false })}
        message={apiSnack.message}
      />

      <Snackbar
        open={copySnackOpen}
        autoHideDuration={2000}
        onClose={() => setCopySnackOpen(false)}
        message="Link copied!"
      />
    </>
  );
}

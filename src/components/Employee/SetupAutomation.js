import React, { useState, useEffect } from "react";
import {
  Box,
  Card,
  CardContent,
  CardMedia,
  Collapse,
  Typography,
  Stack,
  TextField,
  Chip,
  Button,
  IconButton,
  useMediaQuery,
  useTheme,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Alert,
  Tooltip,
  FormControlLabel,
  RadioGroup,
  Radio,
  InputAdornment,
  Slide,
  Switch,
  Avatar,
  Divider,
  CircularProgress,
  Fade

} from "@mui/material";
import { useSnackbar } from "./SnackbarProvider";
import KeyboardArrowLeftIcon from "@mui/icons-material/KeyboardArrowLeft";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import SendIcon from "@mui/icons-material/Send";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import PersonIcon from "@mui/icons-material/Person";
import DownloadIcon from "@mui/icons-material/Download";
import QuizIcon from "@mui/icons-material/Quiz";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import CloseIcon from "@mui/icons-material/Close";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import AddIcon from "@mui/icons-material/Add";
import LinkIcon from "@mui/icons-material/Link";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import InstagramIcon from "@mui/icons-material/Instagram";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import { TransformWrapper, TransformComponent, useControls } from "react-zoom-pan-pinch";
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import axios from "axios";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import RotateLeftOutlinedIcon from '@mui/icons-material/RotateLeftOutlined';
import LinearProgress from '@mui/material/LinearProgress';
import PublicIcon from '@mui/icons-material/Public';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import MessageIcon from '@mui/icons-material/MessageOutlined';
import PinchRounded from '@mui/icons-material/PinchRounded';
import SwipeRounded from '@mui/icons-material/SwipeRounded';
import MouseRounded from '@mui/icons-material/MouseRounded';
import TouchAppRounded from '@mui/icons-material/TouchAppRounded';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';


// --- FINAL UPDATED PHONE SIMULATOR ---
const PhoneSimulator = ({ 
  dmMessage, 
  buttonText, 
  flowNodes, 
  theme,
  isMobileDialog = false
}) => {
  const [isFollowing, setIsFollowing] = useState(false);
  const [history, setHistory] = useState([]);
  // We no longer need currentStep to hide/show the main button, as it's now part of the history
  const [showRestart, setShowRestart] = useState(false);

  // Simulation States
  const [browserUrl, setBrowserUrl] = useState(null); 
  const [downloadState, setDownloadState] = useState(null); 
  const [igName, setIgName] = useState(''); 
  const [igProfilePic, setIgProfilePic] = useState(''); 

  // Container Ref for Slide Animation
  const [containerNode, setContainerNode] = useState(null);
  const baseUrl = "/api/usersOn";
  // const baseUrl = "http://localhost:8001/usersOn";
  const api = axios.create({ baseURL: baseUrl || "", withCredentials: true });
  

    async function fetchIgDetails() {
    // setLoadingSocials(true);
    try {
      const res = await api.get("/user/insta-details");
      setIgName(res.data.igName || []);
      setIgProfilePic(res.data.igProfilePic || []);
    } catch (err) {
      console.error("fetIgDetails", err);
    } finally {
    }
  }


  

  useEffect(() => {
    resetSimulation();
    fetchIgDetails();
  }, [dmMessage, buttonText, flowNodes]);



  const resetSimulation = () => {
    // CHANGE 1: Initialize history WITH the button inside the message object
    setHistory([{ 
      type: 'system', 
      text: dmMessage,
      buttons: [{ 
        id: 'init-btn', 
        text: buttonText, 
        specialAction: 'start_flow' // Special marker to trigger the main flow
      }]
    }]);
    setShowRestart(false);
    setBrowserUrl(null);
    setDownloadState(null);
  };

  // --- 1. SHARED ACTION EXECUTOR ---
  const executeAction = (action) => {
    const newMessages = [];

    // REDIRECT
    if (action.type === 'redirectLink') {
      newMessages.push({ type: 'system', text: `Ã°Å¸â€â€” Opening Link...` });
      setTimeout(() => {
          let url = action.config.redirectUrl || "";
          if (url.startsWith("wa:")) {
  url = `https://wa.me/${url.replace("wa:", "")}`;
} else if (!url.startsWith("http")) {
  url = `https://${url}`;
}
          setBrowserUrl(url);
      }, 1000);
    } 
    // DOWNLOAD (CHANGE 2: Show Button instead of auto-download)
    else if (action.type === 'downloadFile') {
      const fileName = action.config.downloadFile?.name || 'file.pdf';
      newMessages.push({ 
        type: 'system', 
        text: "Click below to download:", // Requested text
        buttons: [{
          id: `dl-${Date.now()}`,
          text: "Download Now",
          specialAction: 'manual_download',
          fileName: fileName
        }]
      });
    }
    // FOLLOW CHECK
  else if (action.type === 'followCheck') {
  if (isFollowing) {
  // ✅ Already following → silently run actions inside following buttons
  if (action.followingButtons && action.followingButtons.length > 0) {
    action.followingButtons.forEach(btn => {
      if (btn.actions && btn.actions.length > 0) {
        btn.actions.forEach(childAction => {
          const result = executeAction(childAction);
          newMessages.push(...result);
        });
      }
    });
  }
}
 else {
    // ❌ NOT FOLLOWING → show verification UI
    const verifyButtons = action.notFollowingButtons.map(btn => ({
      ...btn,
      specialAction: 'verify_follow',
      failureMessage: action.config.followCheckNoMessage,
      successButtons: action.followingButtons // only buttons, no message
    }));

    newMessages.push({ 
      type: 'system', 
      text: action.config.followCheckNoMessage || "Please follow to continue.",
      buttons: verifyButtons 
    });
  }
}

    // QUICK REPLY
    else if (action.type === 'quickReply') {
      newMessages.push({ 
          type: 'system', 
          text: action.config.quickReplyQuestion,
          image: action.config.quickReplyImage,
          buttons: action.replyOptions 
      });
    }
    // ASK FOLLOW
    else if (action.type === 'askToFollow') {
      newMessages.push({ type: 'system', text: `Ã°Å¸â€˜Â¤ Please follow @${action.config.instagramPage}` });
    }

      else if (action.type === 'finishingMessage') {
    newMessages.push({ 
      type: 'system', 
      text: action.config.finishingMessage || "Thank you!" 
    });
  }

    return newMessages;
  };

  // --- 2. HANDLE ROOT FLOW ---
  // Modified to accept the text of the button clicked
  const handleMainButtonClick = (clickedBtnText) => {
    setHistory(prev => [...prev, { type: 'user', text: clickedBtnText }]);
    
    let upcomingMessages = [];
    if (flowNodes.length === 0) {
        upcomingMessages.push({ type: 'system', text: "Ã¢Å“â€¦ End of automation" });
    } else {
        flowNodes.forEach(node => {
            const result = executeAction(node);
            upcomingMessages = [...upcomingMessages, ...result];
        });
    }

    setTimeout(() => {
        setHistory(prev => [...prev, ...upcomingMessages]);
        setShowRestart(true);
    }, 500);
  };

  // --- 3. HANDLE NESTED BUTTON CLICKS ---
  const handleSimulatedOptionClick = (btnData) => {
    
    // CHECK: Is this the Start Button?
    if (btnData.specialAction === 'start_flow') {
      handleMainButtonClick(btnData.text);
      return;
    }

    // CHECK: Is this the Download Button?
    if (btnData.specialAction === 'manual_download') {
      // Show user clicked "Download Now"
      setHistory(prev => [...prev, { type: 'user', text: btnData.text }]);
      setTimeout(() => simulateDownload(btnData.fileName), 500);
      return;
    }

    // 1. Add User Click to History
    setHistory(prev => [...prev, { type: 'user', text: btnData.text }]);

    // 2. CHECK: Is this a Verification Button?
 if (btnData.specialAction === 'verify_follow') {
  setTimeout(() => {
    if (!isFollowing) {
      setHistory(prev => [...prev, { 
        type: 'system', 
        text: btnData.failureMessage || "❌ Check failed. Please follow to continue.",
        buttons: [btnData]
      }]);
    } else {
      // ✅ SUCCESS → silently continue flow
    let upcomingMessages = [];

btnData.successButtons?.forEach(btn => {
  if (btn.actions && btn.actions.length > 0) {
    btn.actions.forEach(childAction => {
      const result = executeAction(childAction);
      upcomingMessages.push(...result);
    });
  }
});

if (upcomingMessages.length > 0) {
  setHistory(prev => [...prev, ...upcomingMessages]);
}

    }
  }, 600);
  return;
}


    // 3. Standard Action Processing
    if (btnData.actions && btnData.actions.length > 0) {
        let upcomingMessages = [];
        btnData.actions.forEach(action => {
            const result = executeAction(action);
            upcomingMessages = [...upcomingMessages, ...result];
        });

        setTimeout(() => {
            setHistory(prev => [...prev, ...upcomingMessages]);
        }, 600);
    } 
    else {
        setTimeout(() => {
            // setHistory(prev => [...prev, { type: 'system', text: "Ã¢Å“â€¦ Done" }]);
        }, 600);
    }
  };

  const simulateDownload = (fileName) => {
      setDownloadState({ name: fileName, progress: 0, complete: false });
      let progress = 0;
      const interval = setInterval(() => {
          progress += 10;
          if (progress >= 100) {
              clearInterval(interval);
              setDownloadState({ name: fileName, progress: 100, complete: true });
              setTimeout(() => setDownloadState(null), 3000);
          } else {
              setDownloadState({ name: fileName, progress: progress, complete: false });
          }
      }, 100);
  };

  return (
    <Box
      ref={setContainerNode}
      sx={{
      position: isMobileDialog ? "relative" : "absolute",
        right: isMobileDialog ? "auto" : 40,
        top: isMobileDialog ? "auto" : "50vh",
        transform: isMobileDialog ? "none" : "translateY(-50%)",
        width: isMobileDialog ? '100%' : '40vh',
        height: isMobileDialog ? '100%' : '80vh',
        maxWidth: isMobileDialog ? '400px' : 'none',
        maxHeight: isMobileDialog ? '85vh' : 'none',
        margin: isMobileDialog ? '0 auto' : 0,
        bgcolor: "#57595B",
        borderRadius: "40px",
        boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
        border: "6px solid #57595B",
        zIndex: isMobileDialog ? 1 : 1100,
        overflow: "hidden", 
        display: isMobileDialog ? "flex" : { xs: "none", lg: "flex" },
        flexDirection: "column", 
      }}
    >
      {/* iPhone Notch */}
      <Box sx={{ height: 30, bgcolor: "#fff", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1200 }}>
        <Box sx={{ width: 80, height: 18, bgcolor: "#000", borderRadius: "10px 10px 10px 10px" }} />
      </Box>

      {/* Header */}
      <Box sx={{ bgcolor: "#fff", p: 1.5, borderBottom: "1px solid #eee", display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
             <Avatar
        alt="Profile Pic"
        src={igProfilePic || 'M'}
        sx={{ width: 30, height: 30 }}
      />
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{igName || 'MyHandle.in' }</Typography>
        </Stack>
        {/* Toggle Check Logic Visual */}
        {flowNodes.some(n => n.type === 'followCheck') && (
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ bgcolor: '#F3F4F6', px: 1, py:0.5, borderRadius: 2 }}>
                <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 600, color: isFollowing ? '#10B981' : '#6B7280' }}>
                    {isFollowing ? "Following" : "Not Following"}
                </Typography>
                <Switch size="small" checked={isFollowing} onChange={(e) => setIsFollowing(e.target.checked)} sx={{ transform: "scale(0.7)" }} />
            </Stack>
        )}
      </Box>

      {/* Chat Area */}
      <Box sx={{ flex: 1, bgcolor: "#fff", p: 2, overflowY: "auto", display: "flex", flexDirection: "column", gap: 1.5 }}>
        {history.map((msg, index) => (
          <Box key={index} sx={{ alignSelf: msg.type === 'user' ? "flex-end" : "flex-start", maxWidth: "85%" }}>
            
            {/* CHANGE 3: Combined Box logic. If System, render buttons INSIDE. */}
            <Box sx={{ 
                p: 1.5, 
                bgcolor: msg.type === 'user' ? "#3B82F6" : "#F5F5F5", // Lighter gray for system messages
                color: msg.type === 'user' ? "#fff" : "#000", 
                borderRadius: msg.type === 'user' ? "18px 18px 0 18px" : "18px 18px 18px 0", 
                fontSize: "14px", 
                lineHeight: 1.4, 
                mb: 0.5 
            }}>

               {/* Image if exists */}
        {msg.image && (
          <Box sx={{ mb: 1.5, borderRadius: 2, overflow: "hidden" }}>
            <img 
              src={msg.image} 
              alt="Message" 
              style={{ 
                width: "100%", 
                maxHeight: "200px", 
                objectFit: "cover",
                display: "block",
                borderRadius: "8px"
              }} 
            />
          </Box>
        )}


              {/* Message Text */}
              <Box sx={{ mb: (msg.buttons && msg.buttons.length > 0) ? 1.5 : 0,  whiteSpace: "pre-line" }}>
                {msg.text}
              </Box>
           
              {/* Render Buttons INSIDE the bubble if they exist */}
              {msg.buttons && (
                <Stack spacing={1}>
                    {msg.buttons.map(btn => (
                        <Button 
                            key={btn.id || btn.text}
                            fullWidth 
                            variant="contained" // Solid button
                            size="small"
                            onClick={() => handleSimulatedOptionClick(btn)}
                            sx={{ 
                                textTransform: 'none', 
                                borderRadius: 2, 
                                bgcolor: 'white', // White button inside gray bubble
                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                color: '#000',
                                fontWeight: 600,
                                border: '1px solid transparent',
                                '&:hover': { bgcolor: '#f9f9f9', borderColor: '#ddd', boxShadow: 'none' }
                            }}
                        >
                            {btn.text}
                        </Button>
                    ))}
                </Stack>
              )}
            </Box>

          </Box>
        ))}
      </Box>

      {/* Footer */}
      <Box sx={{ p: 2, borderTop: "1px solid #eee", bgcolor: "#fff" }}>
         {showRestart ? (
             <Button sx={{ fontFamily : 'Inter', fontSize : '14px', textTransform : 'none'}}fullWidth variant="text" size="medium" onClick={resetSimulation} startIcon={<RotateLeftOutlinedIcon />}>Restart Preview</Button>
         ) : (
            <Box sx={{ width: "100%", height: 36, borderRadius: 18, border: "1px solid #ddd", display: 'flex', alignItems: 'center', px: 2 }}>
                <Typography variant="caption" color="#aaa">Message...</Typography>
            </Box>
         )}
      </Box>
      <Box sx={{ height: 20, bgcolor: "#fff", display: "flex", justifyContent: "center", pt: 1 }}><Box sx={{ width: 100, height: 4, bgcolor: "#000", borderRadius: 2 }} /></Box>

      {/* --- OVERLAYS --- */}
      <Slide direction="up" in={Boolean(browserUrl)} container={containerNode}>
        <Box sx={{ position: 'absolute', top: 30, bottom: 0, left: 0, right: 0, bgcolor: 'white', zIndex: 1300, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 1, bgcolor: '#f0f0f0', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption" sx={{ flex: 1, bgcolor: '#fff', px: 1, py: 0.5, borderRadius: 1, textAlign: 'center', fontSize: '10px', color: '#333', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}><PublicIcon sx={{ fontSize: 10, mr: 0.5, verticalAlign: 'middle' }} />{browserUrl}</Typography>
                <Typography variant="caption" onClick={() => setBrowserUrl(null)} sx={{ color: '#007AFF', fontWeight: 600, cursor: 'pointer' }}>Done</Typography>
            </Box>
            <Box sx={{ flex: 1, bgcolor: '#fff', position: 'relative' }}>
                <iframe src={browserUrl} title="Preview" style={{ width: '100%', height: '100%', border: 'none', position: 'relative', zIndex: 2 }} sandbox="allow-scripts allow-same-origin" />
                <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', zIndex: 1 }}><Typography variant="caption" color="text.secondary">Loading...<br/>(If blank, site blocks embeds)</Typography></Box>
            </Box>
        </Box>
      </Slide>

      <Slide direction="up" in={Boolean(downloadState)} container={containerNode}>
          <Box sx={{ position: 'absolute', bottom: 40, left: 16, right: 16, bgcolor: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(10px)', borderRadius: 3, p: 2, zIndex: 1400, color: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
              <Stack direction="row" spacing={2} alignItems="center">
                  <Box sx={{ width: 40, height: 40, bgcolor: downloadState?.complete ? '#10B981' : '#3B82F6', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {downloadState?.complete ? <CheckCircleOutlineIcon sx={{ color: 'white' }} /> : <FileDownloadIcon sx={{ color: 'white' }} />}
                  </Box>
                  <Box sx={{ flex: 1 }}>
                      <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, mb: 0.5 }}>{downloadState?.complete ? 'Download Complete' : 'Downloading File...'}</Typography>
                      <Typography variant="caption" sx={{ display: 'block', color: '#aaa', fontSize: '10px', mb: 0.5 }}>{downloadState?.name}</Typography>
                      {!downloadState?.complete && (
                          <LinearProgress variant="determinate" value={downloadState?.progress || 0} sx={{ height: 4, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.2)', '& .MuiLinearProgress-bar': { bgcolor: '#3B82F6' } }} />
                      )}
                  </Box>
              </Stack>
          </Box>
      </Slide>
    </Box>
  );
};

// Zoom Controls Component
const ZoomControls = () => {
  const { zoomIn, zoomOut, resetTransform, centerView } = useControls();

  return (
    <Box
      sx={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 1001,
        display: { xs: "none", md: "flex" },
        flexDirection: "row",
        gap: 1,
        bgcolor: "white",
        borderRadius: 2,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        p: 1,
      }}
    >
      <Tooltip title="Zoom In" placement="left">
        <IconButton
          onClick={() => zoomIn()}
          size="small"
          sx={{
            bgcolor: "#F3F4F6",
            "&:hover": { bgcolor: "#E5E7EB" },
          }}
        >
          <ZoomInIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Tooltip title="Zoom Out" placement="left">
        <IconButton
          onClick={() => zoomOut()}
          size="small"
          sx={{
            bgcolor: "#F3F4F6",
            "&:hover": { bgcolor: "#E5E7EB" },
          }}
        >
          <ZoomOutIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Tooltip title="Reset Zoom" placement="left">
        <IconButton
          onClick={() => resetTransform()}
          size="small"
          sx={{
            bgcolor: "#F3F4F6",
            "&:hover": { bgcolor: "#E5E7EB" },
          }}
        >
          <CenterFocusStrongIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Tooltip title="Fit to Screen" placement="left">
        <IconButton
          onClick={() => {
            resetTransform();
            centerView(0.8);
          }}
          size="small"
          sx={{
            bgcolor: "#F3F4F6",
            "&:hover": { bgcolor: "#E5E7EB" },
          }}
        >
          <FitScreenIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
};






export default function SetupAutomation() {
  const { post_id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const isEditMode = location.state?.isEditMode || false;
  const [originalData, setOriginalData] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  const { caption, thumbnail_url, id } = location.state || {};
  const [confDialogOpen, setConfDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingAutomation, setIsLoadingAutomation] = useState(false);

  const baseUrl = "/api/usersOn";
  // const baseUrl = "http://localhost:8001/usersOn";


  const api = axios.create({ baseURL: baseUrl || "", withCredentials: true });
  const [loading, setLoading] = useState(true);
  

  // State
  const [dmMessage, setDmMessage] = useState("Hey! 👋 Thanks for your interest!. Tap the button below, and I'll send you the details right away.");
  const [buttonText, setButtonText] = useState("Get Details ➡️");
  const [flowNodes, setFlowNodes] = useState([]);
  const [keywords, setKeywords] = useState(['Diet', 'Link']);
  const [dialogOpen, setDialogOpen] = useState(false);
  const showSnackbar = useSnackbar();

  // three replies (prefilled)
  const [replies, setReplies] = useState([
    "Thanks for the comment, Please check DM 🙂",
    "Please check DMs!",
    "Thank you! Please check DM"
  ]);

    const [isReplyAvailable, setIsReplyAvailable] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [selectedNodeType, setSelectedNodeType] = useState(null);
 
 const [inputValue, setInputValue] = useState("");

 const [showPhoneSimulator, setShowPhoneSimulator] = useState(false);
  const [showGestureGuide, setShowGestureGuide] = useState(false);
  const [showDesktopGuide, setShowDesktopGuide] = useState(false);

  // Template states
  const [templates, setTemplates] = useState([]);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [saveTemplateDialogOpen, setSaveTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  const handleAddKeyword = () => {
    const newKeyword = inputValue.trim();
    if (newKeyword && !keywords.includes(newKeyword)) {
      setKeywords([...keywords, newKeyword]);
    }
    setInputValue("");
  };

   const handleReplyChange = (index, value) => {
    setReplies(prev => {
      const copy = [...prev];
      copy[index] = value;
      return copy;
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddKeyword();
    }
  };

  const handleDeleteKeyword = (keywordToDelete) => {
    setKeywords(keywords.filter((kw) => kw !== keywordToDelete));
  };

  // ==================== TEMPLATE FUNCTIONS ====================

  const fetchTemplates = async () => {
    try {
      const res = await api.get("/automation/templates");
      if (res.data.success) {
        setTemplates(res.data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch templates:", err);
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!templateName.trim()) {
      showSnackbar("Please enter a template name", "error");
      return;
    }
    try {
      setSavingTemplate(true);
      const payload = {
        name: templateName.trim(),
        dmMessage,
        buttonText,
        flowNodes,
        hasReply: isReplyAvailable,
        replyComments: isReplyAvailable ? replies : [],
      };
      const res = await api.post("/automation/template", payload);
      if (res.data.success) {
        showSnackbar("Template saved successfully!", "success");
        setSaveTemplateDialogOpen(false);
        setTemplateName("");
        fetchTemplates();
      }
    } catch (err) {
      console.error("Failed to save template:", err);
      showSnackbar("Failed to save template", "error");
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleApplyTemplate = (template) => {
    setDmMessage(template.dmMessage || "");
    setButtonText(template.buttonText || "");
    setFlowNodes(JSON.parse(JSON.stringify(template.flowNodes || [])));
    setIsReplyAvailable(template.hasReply || false);
    if (template.replyComments && template.replyComments.length === 3) {
      setReplies([...template.replyComments]);
    }
    setTemplateDialogOpen(false);
    showSnackbar(`Template "${template.name}" applied!`, "success");
  };

  const handleDeleteTemplate = async (templateId) => {
    try {
      const res = await api.delete(`/automation/template/${templateId}`);
      if (res.data.success) {
        setTemplates(prev => prev.filter(t => t._id !== templateId));
        showSnackbar("Template deleted", "success");
      }
    } catch (err) {
      console.error("Failed to delete template:", err);
      showSnackbar("Failed to delete template", "error");
    }
  };

  // Track context for nested action additions
  const [actionContext, setActionContext] = useState(null);

  // Node configuration states for dialog-based actions
  const [nodeConfig, setNodeConfig] = useState({
    redirectUrl: "",
    downloadFile: null,
    instagramPage: "thisis.ram",
    finishingMessage: ""
  });

  const data = {
    id: post_id || id || "",
    thumbnail: thumbnail_url || "",
    caption: caption || "",
  };

     const fetchIgConnectionStatus = async () => {
        try {
          setLoading(true);
            const res = await axios.get(`${baseUrl}/instagram-status`, {
            withCredentials: true,
          });
          if(!res.data.instagramConnected){
            navigate('/professional/automations');
    
          }
        } catch (error) {
          console.error("Failed to fetch connection status:", error);
        } finally {
          setLoading(false);
        }
      };
    
      useEffect(() => {
        fetchIgConnectionStatus();
        fetchTemplates();
      }, []);

      
 const loadAutomationForEdit = async () => {
    try {
      setIsLoadingAutomation(true);
      const response = await api.get(`/automation/config/${post_id}`);
      
      if (response.data.success && response.data.data) {
        const automation = response.data.data;
        
        // Store original data for comparison
        const originalState = {
          dmMessage: automation.dmMessage || "",
          buttonText: automation.buttonText || "Send Link",
          flowNodes: JSON.parse(JSON.stringify(automation.flowNodes || [])), // Deep copy
          keywords: [...(automation.keywords || ['Link'])],
          isReplyAvailable: automation.hasReply || false,
          replies: [...(automation.replyComments || [
            "Thanks for the comment, Please check DM 🙂",
            "Love this — thank you for sharing!",
            "Great point — totally agree with you."
          ])]
        };
        
        setOriginalData(originalState);
        
        // Populate all fields
        setDmMessage(originalState.dmMessage);
        setButtonText(originalState.buttonText);
        setFlowNodes(originalState.flowNodes);
        setKeywords(originalState.keywords);
        setIsReplyAvailable(originalState.isReplyAvailable);
        setReplies(originalState.replies);
        
        // toast.success("Automation loaded for editing");
      }
    } catch (error) {
      // console.error("Error loading automation:", error);
      // toast.error("Failed to load automation data");
    } finally {
      setIsLoadingAutomation(false);
    }
  };

  

useEffect(() => {
    if (!isEditMode || !originalData) {
      setHasChanges(false);
      return;
    }

    // Deep comparison function
    const hasDataChanged = () => {
      // Check simple fields
      if (dmMessage !== originalData.dmMessage) return true;
      if (buttonText !== originalData.buttonText) return true;
      if (isReplyAvailable !== originalData.isReplyAvailable) return true;

      // Check keywords array
      if (keywords.length !== originalData.keywords.length) return true;
      if (!keywords.every((kw, idx) => kw === originalData.keywords[idx])) return true;

      // Check replies array
      if (replies.length !== originalData.replies.length) return true;
      if (!replies.every((reply, idx) => reply === originalData.replies[idx])) return true;

      // Check flowNodes (deep comparison)
      if (JSON.stringify(flowNodes) !== JSON.stringify(originalData.flowNodes)) return true;

      return false;
    };

    setHasChanges(hasDataChanged());
  }, [
    dmMessage, 
    buttonText, 
    flowNodes, 
    keywords, 
    isReplyAvailable, 
    replies, 
    originalData, 
    isEditMode
  ]);


     useEffect(() => {
    if ( post_id) {
      loadAutomationForEdit();
    }
  }, [isEditMode, post_id]);

  // Gesture guide - show once on mobile
  useEffect(() => {
    if (isMobile && !localStorage.getItem('setup_gesture_guide_seen')) {
      const timer = setTimeout(() => setShowGestureGuide(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [isMobile]);

  // Desktop controls guide - show once on desktop
  useEffect(() => {
    if (!isMobile && !localStorage.getItem('setup_desktop_gesture_guide_seen')) {
      const timer = setTimeout(() => setShowDesktopGuide(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [isMobile]);

  // Action type configurations
  const actionTypes = [
    {
      type: "followCheck",
      title: "Follow Check",
      description: "Check whether user is following your Instagram page or not.",
      icon: <PersonIcon />,
      color: "#10B981",
      bgColor: "#F0FDF4",
    },
    {
      type: "redirectLink",
      title: "Redirect to WhatsApp or Website",
      description: "Redirect user to your WhatsApp or external website.",
      icon: <LinkIcon />,
      color: "#8B5CF6",
      bgColor: "#F5F3FF",
    },
    {
      type: "downloadFile",
      title: "Upload File",
      description: "User will be able to download this file (Image | PDF | Excel Sheet).",
      icon: <DownloadIcon />,
      color: "#3B82F6",
      bgColor: "#EFF6FF",
    },
   
   {
         type: "quickReply",
         title: "Quick Options", 
         description: "Display a message with clickable buttons. Use for questions, menus, or simple navigation.",
         icon: <QuizIcon />,
         color: "#F59E0B",
         bgColor: "#FFFBEB",
       },

    {
  type: "finishingMessage",
  title: "Finishing Message",
  description: "Send a final message to complete the conversation flow.",
  icon: <MessageIcon />,
  color: "#EC4899",
  bgColor: "#FCE7F3",
}
  ];

  // Check if Follow Check is already used
  const isFollowCheckUsed = flowNodes.some((node) => node.type === "followCheck");

  const hasQuickReplyInMainFlow = flowNodes.some(
  (node) => node.type === "quickReply"
);

  const hasFinishingMessageInMainFlow = flowNodes.some(
    (node) => node.type === "finishingMessage"
  );

    // Count total Quick Reply blocks in the flow (including nested ones)
  const countQuickReplies = (nodes) => {
    let count = 0;
    
    for (const node of nodes) {
      if (node.type === "quickReply") {
        count++;
        // Also check nested Quick Replies inside this Quick Reply's options
        if (node.replyOptions) {
          for (const opt of node.replyOptions) {
            if (opt.actions?.some((a) => a.type === "quickReply")) {
              count++;
            }
          }
        }
      }

      // Check FollowCheck buttons for Quick Replies
      if (node.type === "followCheck") {
        const allButtons = [
          ...(node.followingButtons || []),
          ...(node.notFollowingButtons || []),
        ];

        for (const btn of allButtons) {
          if (btn.actions?.some((a) => a.type === "quickReply")) {
            count++;
            // Check nested Quick Replies inside this Quick Reply
            const qr = btn.actions.find((a) => a.type === "quickReply");
            if (qr?.replyOptions) {
              for (const opt of qr.replyOptions) {
                if (opt.actions?.some((a) => a.type === "quickReply")) {
                  count++;
                }
              }
            }
          }
        }
      }
    }
    return count;
  };

  const quickReplyCount = countQuickReplies(flowNodes);
  // Allow up to 2 Quick Replies total (one main + one nested)
  const quickReplyAlreadyUsed = quickReplyCount >= 2;


const getAvailableActionTypes = () => {
    // Check if Follow Check is already used anywhere in the main flow.
    // This handles scenarios where a Follow Check node might have been added and later deleted,
    // although in your current logic, it mainly guards against accidental placement.
    const isFollowCheckUsed = flowNodes.some(node => node.type === 'followCheck');

    // Ã¢Å¡Â¡Ã¯Â¸Â Define the state: Is this the very first action selection?
    const isInitialSelection = !actionContext && flowNodes.length === 0;

    // --- Scenario 1: Initial Selection (Flow is empty) ---
    if (isInitialSelection) {
        // Show Follow Check, Quick Replies, and Finishing Message for the very first step.
      return actionTypes.filter(type =>
  type.type === 'followCheck' ||
  (!quickReplyAlreadyUsed && type.type === 'quickReply') ||
  type.type === 'finishingMessage'
);

    }

    // --- Scenario 2: Nested Selection (Inside a button or quick reply option) ---
    if (actionContext) {
        // Check if we're inside a Follow Check branch (following/notFollowing)
        if (actionContext.branchType) {
          // If we're inside a QuickReply option or button action within Follow Check,
          // allow all types except followCheck (so downloadFile, redirectUrl etc. are available)
          if (actionContext.type === 'nestedQuickReply' ||
              actionContext.type === 'deepNestedButtonQuickReply' ||
              actionContext.type === 'nestedFollowCheckButton') {
            return actionTypes.filter(type =>
              type.type !== 'followCheck' &&
              (!quickReplyAlreadyUsed || type.type !== 'quickReply')
            );
          }
          // Direct Follow Check branch: Only show Quick Replies and Finishing Message
          return actionTypes.filter(type =>
            (type.type === 'quickReply' && !quickReplyAlreadyUsed) ||
            type.type === 'finishingMessage'
          );
        }

        // Other nested contexts: show all except Follow Check
        // Nested actions should only be non-structural elements (Links, Download, etc.).
        // Follow Check nodes are structural and should not be nested.
      return actionTypes.filter(type =>
  type.type !== 'followCheck' &&
  (!quickReplyAlreadyUsed || type.type !== 'quickReply')
);

    }

    // --- Scenario 3: Subsequent Main Flow Selection (FlowNodes > 0, Context null) ---
    // User is adding an action *after* the initial node, at the main flow level.
    // We prevent adding Follow Check here, whether it was used or not.
 return actionTypes.filter(type =>
  type.type !== 'followCheck' &&
  (!quickReplyAlreadyUsed || type.type !== 'quickReply')
);


    /* Note: The logic for Scenario 2 and 3 results in the same filter (excluding Follow Check), 
    meaning the use of the `isFollowCheckUsed` variable became redundant in this final design 
    because the logic simply blocks 'FollowCheck' after the very first step. 
    */
};


  // Reset node config when opening dialog
  const resetNodeConfig = () => {
    setNodeConfig({
      redirectUrl: "",
      downloadFile: null,
      instagramPage: "thisis.ram",
      finishingMessage: ""
    });
  };

  // UPDATED: Handle action selection with full recursive support
  const handleActionSelect = (type) => {

    if (type === "quickReply" && quickReplyCount >= 2) {
  toast.warning("Maximum of 2 Quick Reply blocks allowed (one main + one nested).");
  return;
}



    if (type === "followCheck") {
      const newNode = {
        id: Date.now(),
        type: "followCheck",
        config: {
          followCheckNoMessage: "Almost there! 💪 \nPlease Follow me first to explore my Fitness Programs and choose what suits you best. \n\nThen click Following button below."

        },
        followingButtons: [{ id: Date.now(), text: "", actions: [] }],
        notFollowingButtons: [
          { id: Date.now() + 1, text: "Following", actions: [] },
        ],
      };
      setFlowNodes([...flowNodes, newNode]);
      setDialogOpen(false);
      setActionContext(null);
      resetNodeConfig();
      toast.success("Follow Check added!");
    } else if (type === "quickReply") {
      const newNode = {
        id: Date.now(),
        type: "quickReply",
        config: {
          quickReplyQuestion: "What's your primary fitness goal right now?",
          quickReplyImage: null,
        },
        replyOptions: [{ id: Date.now(), text: "Option 1", actions: [] }],
      };

      if (actionContext) {
        addQuickReplyToContext(newNode);
      } else {
        setFlowNodes([...flowNodes, newNode]);
      }

      setDialogOpen(false);
      setActionContext(null);
      resetNodeConfig();
      toast.success("Quick Options added!");
    } else {
      resetNodeConfig();
      setSelectedNodeType(type);
    }
  };

const handleQuickReplyImageUpload = async (nodeId, file, context = null) => {
  if (!file) return;

  const validTypes = ["image/png", "image/jpeg", "image/jpg"];
  if (!validTypes.includes(file.type)) {
    toast.error("Please upload a valid image file");
    return;
  }

  try {
    // Show loading state
    toast.info("Uploading image...");

    // Create FormData
    const formData = new FormData();
    formData.append("image", file);

    // Upload to backend
    const response = await api.post("/automation/upload-quickreply-image", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    if (response.data?.success && response.data.publicUrl) {
      const publicUrl = response.data.publicUrl;

      if (context) {
        // Handle nested Quick Reply image
        updateNestedQuickReplyImage(nodeId, publicUrl, context);
      } else {
        // Handle main flow Quick Reply image
        const updatedNodes = flowNodes.map((node) =>
          node.id === nodeId && node.type === "quickReply"
            ? {
                ...node,
                config: {
                  ...node.config,
                  quickReplyImage: publicUrl,
                },
              }
            : node
        );
        setFlowNodes(updatedNodes);
      }

      toast.success("Image uploaded successfully!");
    } else {
      throw new Error("Upload failed");
    }
  } catch (error) {
    console.error("Image upload error:", error);
    toast.error("Failed to upload image. Please try again.");
  }
};

const updateNestedQuickReplyImage = (nodeId, imageData, context) => {
  const { buttonId, branchType, quickReplyActionId, parentOptionId } = context;
  
  const updatedNodes = flowNodes.map((node) => {
    if (node.id === nodeId && node.type === "followCheck") {
      const updateButtons = (buttons) =>
        buttons.map((btn) =>
          btn.id === buttonId
            ? {
                ...btn,
                actions: btn.actions.map((action) =>
                  action.id === quickReplyActionId
                    ? {
                        ...action,
                        config: {
                          ...action.config,
                          quickReplyImage: imageData,
                        },
                      }
                    : action
                ),
              }
            : btn
        );

      if (branchType === "following") {
        return {
          ...node,
          followingButtons: updateButtons(node.followingButtons),
        };
      } else {
        return {
          ...node,
          notFollowingButtons: updateButtons(node.notFollowingButtons),
        };
      }
    }
    
    // Handle main flow nested Quick Reply
    if (node.id === nodeId && node.type === "quickReply" && parentOptionId) {
      return {
        ...node,
        replyOptions: node.replyOptions.map((opt) =>
          opt.id === parentOptionId
            ? {
                ...opt,
                actions: opt.actions.map((action) =>
                  action.id === quickReplyActionId
                    ? {
                        ...action,
                        config: {
                          ...action.config,
                          quickReplyImage: imageData,
                        },
                      }
                    : action
                ),
              }
            : opt
        ),
      };
    }
    
    return node;
  });
  
  setFlowNodes(updatedNodes);
};

const handleRemoveQuickReplyImage = (nodeId, context = null) => {
  if (context) {
    updateNestedQuickReplyImage(nodeId, null, context);
  } else {
    const updatedNodes = flowNodes.map((node) =>
      node.id === nodeId && node.type === "quickReply"
        ? {
            ...node,
            config: {
              ...node.config,
              quickReplyImage: null,
            },
          }
        : node
    );
    setFlowNodes(updatedNodes);
  }
  toast.info("Image removed");
};

  // HELPER: Recursively update nested Quick Reply (must be defined before addQuickReplyToContext)
  const updateNestedQuickReply = (
    options,
    parentOptionId,
    quickReplyActionId,
    targetOptionId,
    newNode
  ) => {
    return options.map((opt) =>
      opt.id === parentOptionId
        ? {
            ...opt,
            actions: (opt.actions || []).map((action) =>
              action.id === quickReplyActionId
                ? {
                    ...action,
                    replyOptions: (action.replyOptions || []).map((nestedOpt) =>
                      nestedOpt.id === targetOptionId
                        ? {
                            ...nestedOpt,
                            actions: [...(nestedOpt.actions || []), newNode],
                          }
                        : nestedOpt
                    ),
                  }
                : action
            ),
          }
        : opt
    );
  };


  // HELPER: Add Quick Reply to any context (recursive support)
const addQuickReplyToContext = (newNode) => {
  const ctx = actionContext;

  if (ctx.type === "quickReply" && !ctx.parentOptionId) {
    // Main-flow Quick Reply Ã¢â€ â€™ option
    const updatedNodes = flowNodes.map((node) =>
      node.id === ctx.nodeId && node.type === "quickReply"
        ? {
            ...node,
            replyOptions: node.replyOptions.map((opt) =>
              opt.id === ctx.optionId
                ? { ...opt, actions: [...(opt.actions || []), newNode] }
                : opt
            ),
          }
        : node
    );
    setFlowNodes(updatedNodes);
  } else if (ctx.type === "quickReply" && ctx.parentOptionId) {
    // Nested Quick Reply inside main-flow Quick Reply
    const updatedNodes = flowNodes.map((node) =>
      node.id === ctx.nodeId && node.type === "quickReply"
        ? {
            ...node,
            replyOptions: updateNestedQuickReply(
              node.replyOptions,
              ctx.parentOptionId,
              ctx.quickReplyActionId,
              ctx.optionId,
              newNode
            ),
          }
        : node
    );
    setFlowNodes(updatedNodes);
  } else if (ctx.type === "deepNestedQuickReply") {
    // NEW: Deep nested Quick Reply (3+ levels)
    const updatedNodes = flowNodes.map((node) => {
      if (node.id === ctx.nodeId && node.type === "quickReply") {
        return {
          ...node,
          replyOptions: node.replyOptions.map((parentOpt) =>
            parentOpt.id === ctx.parentOptionId
              ? {
                  ...parentOpt,
                  actions: parentOpt.actions.map((act) =>
                    act.id === ctx.parentQRActionId
                      ? {
                          ...act,
                          replyOptions: act.replyOptions.map((middleOpt) =>
                            middleOpt.id === ctx.middleOptionId
                              ? {
                                  ...middleOpt,
                                  actions: middleOpt.actions.map((a) =>
                                    a.id === ctx.nestedQRId
                                      ? {
                                          ...a,
                                          replyOptions: a.replyOptions.map((deepOpt) =>
                                            deepOpt.id === ctx.optionId
                                              ? { ...deepOpt, actions: [...(deepOpt.actions || []), newNode] }
                                              : deepOpt
                                          ),
                                        }
                                      : a
                                  ),
                                }
                              : middleOpt
                          ),
                        }
                      : act
                  ),
                }
              : parentOpt
          ),
        };
      }
      return node;
    });
    setFlowNodes(updatedNodes);
  } else if (ctx.type === "deepNestedButtonQuickReply") {
    // NEW: Deep nested Quick Reply inside Follow Check button
    const updatedNodes = flowNodes.map((node) => {
      if (node.id === ctx.nodeId && node.type === "followCheck") {
        const updateButtons = (buttons) =>
          buttons.map((btn) =>
            btn.id === ctx.buttonId
              ? {
                  ...btn,
                  actions: btn.actions.map((action) =>
                    action.id === ctx.quickReplyActionId
                      ? {
                          ...action,
                          replyOptions: action.replyOptions.map((parentOpt) =>
                            parentOpt.id === ctx.parentOptionId
                              ? {
                                  ...parentOpt,
                                  actions: parentOpt.actions.map((a) =>
                                    a.id === ctx.nestedQRId
                                      ? {
                                          ...a,
                                          replyOptions: a.replyOptions.map((deepOpt) =>
                                            deepOpt.id === ctx.optionId
                                              ? { ...deepOpt, actions: [...(deepOpt.actions || []), newNode] }
                                              : deepOpt
                                          ),
                                        }
                                      : a
                                  ),
                                }
                              : parentOpt
                          ),
                        }
                      : action
                  ),
                }
              : btn
          );

        if (ctx.branchType === "following") {
          return {
            ...node,
            followingButtons: updateButtons(node.followingButtons),
          };
        } else {
          return {
            ...node,
            notFollowingButtons: updateButtons(node.notFollowingButtons),
          };
        }
      }
      return node;
    });
    setFlowNodes(updatedNodes);
  } else if (ctx.type === "nestedQuickReply") {
    // Quick Reply inside Follow Check button
    const updatedNodes = flowNodes.map((node) => {
      if (node.id === ctx.nodeId && node.type === "followCheck") {
        const updateButtons = (buttons) =>
          buttons.map((btn) =>
            btn.id === ctx.buttonId
              ? {
                  ...btn,
                  actions: btn.actions.map((action) =>
                    action.id === ctx.quickReplyActionId
                      ? {
                          ...action,
                          replyOptions: action.replyOptions.map((opt) =>
                            opt.id === ctx.optionId
                              ? { ...opt, actions: [...(opt.actions || []), newNode] }
                              : opt
                          ),
                        }
                      : action
                  ),
                }
              : btn
          );

        if (ctx.branchType === "following") {
          return {
            ...node,
            followingButtons: updateButtons(node.followingButtons),
          };
        } else {
          return {
            ...node,
            notFollowingButtons: updateButtons(node.notFollowingButtons),
          };
        }
      }
      return node;
    });
    setFlowNodes(updatedNodes);
  } else {
    // Follow Check button (no Quick Reply nested yet)
    const updatedNodes = flowNodes.map((node) => {
      if (node.id === ctx.nodeId && node.type === "followCheck") {
        const updateButtons = (buttons) =>
          buttons.map((btn) =>
            btn.id === ctx.buttonId
              ? { ...btn, actions: [...btn.actions, newNode] }
              : btn
          );

        if (ctx.branchType === "following") {
          return {
            ...node,
            followingButtons: updateButtons(node.followingButtons),
          };
        } else {
          return {
            ...node,
            notFollowingButtons: updateButtons(node.notFollowingButtons),
          };
        }
      }
      return node;
    });
    setFlowNodes(updatedNodes);
  }
};

  // Open dialog for adding action to a specific button
  const handleOpenAddActionDialog = (nodeId, branchType, buttonId) => {
    setActionContext({ nodeId, branchType, buttonId });
    resetNodeConfig();
    setDialogOpen(true);
  };

  // Quick Reply functions
  const handleAddQuickReplyOption = (nodeId) => {
    const updatedNodes = flowNodes.map((node) => {
      if (node.id === nodeId && node.type === "quickReply") {
        const newOption = {
          id: Date.now(),
          text: `Option ${node.replyOptions.length + 1}`,
          actions: [],
        };
        return {
          ...node,
          replyOptions: [...node.replyOptions, newOption],
        };
      }
      return node;
    });
    setFlowNodes(updatedNodes);
    toast.success("Option added!");
  };

  const handleUpdateQuickReplyOption = (nodeId, optionId, newText) => {
    const updatedNodes = flowNodes.map((node) => {
      if (node.id === nodeId && node.type === "quickReply") {
        return {
          ...node,
          replyOptions: node.replyOptions.map((opt) =>
            opt.id === optionId ? { ...opt, text: newText } : opt
          ),
        };
      }
      return node;
    });
    setFlowNodes(updatedNodes);
  };

  const handleDeleteQuickReplyOption = (nodeId, optionId) => {
    const updatedNodes = flowNodes.map((node) => {
      if (node.id === nodeId && node.type === "quickReply") {
        if (node.replyOptions.length <= 1) {
          toast.warning("At least one option is required");
          return node;
        }
        return {
          ...node,
          replyOptions: node.replyOptions.filter((opt) => opt.id !== optionId),
        };
      }
      return node;
    });
    setFlowNodes(updatedNodes);
    toast.info("Option removed");
  };

  const handleOpenQuickReplyActionDialog = (nodeId, optionId) => {
    setActionContext({ nodeId, optionId, type: "quickReply" });
    resetNodeConfig();
    setDialogOpen(true);
  };

  const handleDeleteQuickReplyAction = (nodeId, optionId, actionId) => {
    const updatedNodes = flowNodes.map((node) => {
      if (node.id === nodeId && node.type === "quickReply") {
        return {
          ...node,
          replyOptions: node.replyOptions.map((opt) =>
            opt.id === optionId
              ? {
                  ...opt,
                  actions: opt.actions.filter((action) => action.id !== actionId),
                }
              : opt
          ),
        };
      }
      return node;
    });
    setFlowNodes(updatedNodes);
    toast.info("Action removed");
  };

  // HELPER: Update nested action recursively (must be defined before updateFlowNodesWithNewAction)
  const updateNestedAction = (
    options,
    parentOptionId,
    quickReplyActionId,
    targetOptionId,
    newAction
  ) => {
    return options.map((opt) =>
      opt.id === parentOptionId
        ? {
            ...opt,
            actions: (opt.actions || []).map((action) =>
              action.id === quickReplyActionId
                ? {
                    ...action,
                    replyOptions: (action.replyOptions || []).map((nestedOpt) =>
                      nestedOpt.id === targetOptionId
                        ? {
                            ...nestedOpt,
                            actions: [...(nestedOpt.actions || []), newAction],
                          }
                        : nestedOpt
                    ),
                  }
                : action
            ),
          }
        : opt
    );
  };


// Ã°Å¸â€ºÂ Ã¯Â¸Â FIXED: Handles updates for ALL node types (FollowCheck, QuickReply, and Nested variations)
const updateFlowNodesWithNewAction = (newAction) => {
  const ctx = actionContext;

  if (!ctx) {
    console.error("Context missing for nested action update.");
    return;
  }

  const updatedNodes = flowNodes.map((node) => {
    
    // CASE 1: Main-flow Quick Reply (Top level)
    if (ctx.type === "quickReply" && !ctx.parentOptionId) {
      if (node.id === ctx.nodeId && node.type === "quickReply") {
        return {
          ...node,
          replyOptions: node.replyOptions.map((opt) =>
            opt.id === ctx.optionId
              ? { ...opt, actions: [...(opt.actions || []), newAction] }
              : opt
          ),
        };
      }
    } 
    
    // CASE 2: Nested Quick Reply (inside another Quick Reply)
    else if (ctx.type === "quickReply" && ctx.parentOptionId) {
      if (node.id === ctx.nodeId && node.type === "quickReply") {
        return {
          ...node,
          replyOptions: updateNestedAction(
            node.replyOptions,
            ctx.parentOptionId,
            ctx.quickReplyActionId,
            ctx.optionId,
            newAction
          ),
        };
      }
    } 
    
    // CASE 3: Deep Nested Quick Reply (3+ levels)
    else if (ctx.type === "deepNestedQuickReply") {
      if (node.id === ctx.nodeId && node.type === "quickReply") {
        return {
          ...node,
          replyOptions: node.replyOptions.map((parentOpt) =>
            parentOpt.id === ctx.parentOptionId
              ? {
                  ...parentOpt,
                  actions: parentOpt.actions.map((act) =>
                    act.id === ctx.parentQRActionId
                      ? {
                          ...act,
                          replyOptions: act.replyOptions.map((middleOpt) =>
                            middleOpt.id === ctx.middleOptionId
                              ? {
                                  ...middleOpt,
                                  actions: middleOpt.actions.map((a) =>
                                    a.id === ctx.nestedQRId
                                      ? {
                                          ...a,
                                          replyOptions: a.replyOptions.map((deepOpt) =>
                                            deepOpt.id === ctx.optionId
                                              ? { ...deepOpt, actions: [...(deepOpt.actions || []), newAction] }
                                              : deepOpt
                                          ),
                                        }
                                      : a
                                  ),
                                }
                              : middleOpt
                          ),
                        }
                      : act
                  ),
                }
              : parentOpt
          ),
        };
      }
    } 
    
    // CASE 4: Deep Nested Quick Reply inside a Button
    else if (ctx.type === "deepNestedButtonQuickReply") {
      if (node.id === ctx.nodeId && node.type === "followCheck") {
        const updateButtons = (buttons) =>
          buttons.map((btn) =>
            btn.id === ctx.buttonId
              ? {
                  ...btn,
                  actions: btn.actions.map((action) =>
                    action.id === ctx.quickReplyActionId
                      ? {
                          ...action,
                          replyOptions: action.replyOptions.map((parentOpt) =>
                            parentOpt.id === ctx.parentOptionId
                              ? {
                                  ...parentOpt,
                                  actions: parentOpt.actions.map((a) =>
                                    a.id === ctx.nestedQRId
                                      ? {
                                          ...a,
                                          replyOptions: a.replyOptions.map((deepOpt) =>
                                            deepOpt.id === ctx.optionId
                                              ? { ...deepOpt, actions: [...(deepOpt.actions || []), newAction] }
                                              : deepOpt
                                          ),
                                        }
                                      : a
                                  ),
                                }
                              : parentOpt
                          ),
                        }
                      : action
                  ),
                }
              : btn
          );

        if (ctx.branchType === "following") {
          return { ...node, followingButtons: updateButtons(node.followingButtons) };
        } else {
          return { ...node, notFollowingButtons: updateButtons(node.notFollowingButtons) };
        }
      }
    } 
    
    // CASE 5: Quick Reply inside a Follow Check Button
    else if (ctx.type === "nestedQuickReply") {
      if (node.id === ctx.nodeId && node.type === "followCheck") {
        const updateButtons = (buttons) =>
          buttons.map((btn) =>
            btn.id === ctx.buttonId
              ? {
                  ...btn,
                  actions: btn.actions.map((action) =>
                    action.id === ctx.quickReplyActionId
                      ? {
                          ...action,
                          replyOptions: action.replyOptions.map((opt) =>
                            opt.id === ctx.optionId
                              ? { ...opt, actions: [...(opt.actions || []), newAction] }
                              : opt
                          ),
                        }
                      : action
                  ),
                }
              : btn
          );

        if (ctx.branchType === "following") {
          return { ...node, followingButtons: updateButtons(node.followingButtons) };
        } else {
          return { ...node, notFollowingButtons: updateButtons(node.notFollowingButtons) };
        }
      }
    } 
    
    // CASE 6: Standard Button Action (FollowCheck)
    else {
      if (node.id === ctx.nodeId && node.type === "followCheck") {
        const updateButtons = (buttons) =>
          buttons.map((btn) => {
            if (btn.id === ctx.buttonId) {
              return {
                ...btn,
                actions: [...(btn.actions || []), newAction],
              };
            }
            return btn;
          });

        if (ctx.branchType === "following") {
          return { ...node, followingButtons: updateButtons(node.followingButtons) };
        } else if (ctx.branchType === "notFollowing") {
          return { ...node, notFollowingButtons: updateButtons(node.notFollowingButtons) };
        }
      }
    }

    return node;
  });

  // Commit changes
  setFlowNodes(updatedNodes);
};

  // Validate and add node to flow
  const handleAddNode = async (type) => {
    // Validation
    if (type === "redirectLink") {
      if (!nodeConfig.redirectUrl.trim()) {
        toast.error("Please enter a WhatsApp number or a redirect URL");
        return;
      }
      try {
        new URL(nodeConfig.redirectUrl);
      } catch (e) {
        toast.error("Please enter a valid URL starting with https://");
        return;
      }
    }

     if (type === "finishingMessage") {
    if (!nodeConfig.finishingMessage.trim()) {
      toast.error("Please enter a finishing message");
      return;
    }
  }

    let finalConfig = { ...nodeConfig };
    let successMessage = "Action added!";

  if (type === "downloadFile") {
        const file = nodeConfig.downloadFile;
        if (!file || !(file instanceof File)) {
            toast.error("Please upload a file");
            return;
        }

        try {
            setIsUploading(true); // Start loading spinner
            
            const formData = new FormData();
            formData.append("file", file); // 'file' matches the backend's upload.single("file")

            // Call the new dedicated upload endpoint
            const response = await axios.post(`${baseUrl}/automation/upload-asset`, formData, {
                withCredentials: true,
                headers: { "Content-Type": "multipart/form-data" },
            });
            
           if (response.data?.success && response.data.publicUrl) {
        const publicUrl = response.data.publicUrl;
        
        // Populate the config for the new action object
        finalConfig.redirectUrl = publicUrl;
        finalConfig.downloadFile = {
            name: file.name,
            url: publicUrl 
        };

        // Ã°Å¸â€™Â¡ CRITICAL: Now, instead of immediately calling addActionToContext, 
        // we prepare the final action object and update the state explicitly.
        
        const newAction = {
            id: Date.now(), // Generate the new Action ID here
            type,
            config: finalConfig,
        };

        // The target action is nested. Use a function to find and update the state.
        updateFlowNodesWithNewAction(newAction); // Ã¢Â¬â€¦Ã¯Â¸Â NEW EXPLICIT CALL

        // Skip the common 'setFlowNodes([...flowNodes, newAction])' block later
        // and return immediately if the action was nested.
        setDialogOpen(false);
        setSelectedNodeType(null);
        setActionContext(null);
        resetNodeConfig();
        toast.success("File uploaded and action saved!");
        return; // Important: Exit here if the action was nested
    }
            else {
                throw new Error(response.data?.message || "File upload failed on the server.");
            }

        } catch (err) {
            console.error("File upload failed:", err);
            toast.error(err.message || "Failed to upload file. Check console.");
            return; // Stop execution if upload fails
        } finally {
            setIsUploading(false); // Stop loading spinner regardless of outcome
        }
    }

    const newAction = {
      id: Date.now(),
      type,
      config: { ...nodeConfig },
    };

    if (actionContext) {
      addActionToContext(newAction);
    } else {
      setFlowNodes([...flowNodes, newAction]);
    }

    setDialogOpen(false);
    setSelectedNodeType(null);
    setActionContext(null);
    resetNodeConfig();
    toast.success("Action added!");
  };

  // HELPER: Add non-QuickReply action to context
const addActionToContext = (newAction) => {
  const ctx = actionContext;

  if (ctx.type === "quickReply" && !ctx.parentOptionId) {
    // Main-flow Quick Reply
    const updatedNodes = flowNodes.map((node) =>
      node.id === ctx.nodeId && node.type === "quickReply"
        ? {
            ...node,
            replyOptions: node.replyOptions.map((opt) =>
              opt.id === ctx.optionId
                ? { ...opt, actions: [...(opt.actions || []), newAction] }
                : opt
            ),
          }
        : node
    );
    setFlowNodes(updatedNodes);
  } else if (ctx.type === "quickReply" && ctx.parentOptionId) {
    // Nested Quick Reply
    const updatedNodes = flowNodes.map((node) =>
      node.id === ctx.nodeId && node.type === "quickReply"
        ? {
            ...node,
            replyOptions: updateNestedAction(
              node.replyOptions,
              ctx.parentOptionId,
              ctx.quickReplyActionId,
              ctx.optionId,
              newAction
            ),
          }
        : node
    );
    setFlowNodes(updatedNodes);
  } else if (ctx.type === "deepNestedQuickReply") {
    // NEW: Deep nested Quick Reply (3+ levels)
    const updatedNodes = flowNodes.map((node) => {
      if (node.id === ctx.nodeId && node.type === "quickReply") {
        return {
          ...node,
          replyOptions: node.replyOptions.map((parentOpt) =>
            parentOpt.id === ctx.parentOptionId
              ? {
                  ...parentOpt,
                  actions: parentOpt.actions.map((act) =>
                    act.id === ctx.parentQRActionId
                      ? {
                          ...act,
                          replyOptions: act.replyOptions.map((middleOpt) =>
                            middleOpt.id === ctx.middleOptionId
                              ? {
                                  ...middleOpt,
                                  actions: middleOpt.actions.map((a) =>
                                    a.id === ctx.nestedQRId
                                      ? {
                                          ...a,
                                          replyOptions: a.replyOptions.map((deepOpt) =>
                                            deepOpt.id === ctx.optionId
                                              ? { ...deepOpt, actions: [...(deepOpt.actions || []), newAction] }
                                              : deepOpt
                                          ),
                                        }
                                      : a
                                  ),
                                }
                              : middleOpt
                          ),
                        }
                      : act
                  ),
                }
              : parentOpt
          ),
        };
      }
      return node;
    });
    setFlowNodes(updatedNodes);
  } else if (ctx.type === "deepNestedButtonQuickReply") {
    // NEW: Deep nested Quick Reply inside Follow Check button
    const updatedNodes = flowNodes.map((node) => {
      if (node.id === ctx.nodeId && node.type === "followCheck") {
        const updateButtons = (buttons) =>
          buttons.map((btn) =>
            btn.id === ctx.buttonId
              ? {
                  ...btn,
                  actions: btn.actions.map((action) =>
                    action.id === ctx.quickReplyActionId
                      ? {
                          ...action,
                          replyOptions: action.replyOptions.map((parentOpt) =>
                            parentOpt.id === ctx.parentOptionId
                              ? {
                                  ...parentOpt,
                                  actions: parentOpt.actions.map((a) =>
                                    a.id === ctx.nestedQRId
                                      ? {
                                          ...a,
                                          replyOptions: a.replyOptions.map((deepOpt) =>
                                            deepOpt.id === ctx.optionId
                                              ? { ...deepOpt, actions: [...(deepOpt.actions || []), newAction] }
                                              : deepOpt
                                          ),
                                        }
                                      : a
                                  ),
                                }
                              : parentOpt
                          ),
                        }
                      : action
                  ),
                }
              : btn
          );

        if (ctx.branchType === "following") {
          return {
            ...node,
            followingButtons: updateButtons(node.followingButtons),
          };
        } else {
          return {
            ...node,
            notFollowingButtons: updateButtons(node.notFollowingButtons),
          };
        }
      }
      return node;
    });
    setFlowNodes(updatedNodes);
  } else if (ctx.type === "nestedQuickReply") {
    // Inside Follow Check button's Quick Reply
    const updatedNodes = flowNodes.map((node) => {
      if (node.id === ctx.nodeId && node.type === "followCheck") {
        const updateButtons = (buttons) =>
          buttons.map((btn) =>
            btn.id === ctx.buttonId
              ? {
                  ...btn,
                  actions: btn.actions.map((action) =>
                    action.id === ctx.quickReplyActionId
                      ? {
                          ...action,
                          replyOptions: action.replyOptions.map((opt) =>
                            opt.id === ctx.optionId
                              ? { ...opt, actions: [...(opt.actions || []), newAction] }
                              : opt
                          ),
                        }
                      : action
                  ),
                }
              : btn
          );

        if (ctx.branchType === "following") {
          return {
            ...node,
            followingButtons: updateButtons(node.followingButtons),
          };
        } else {
          return {
            ...node,
            notFollowingButtons: updateButtons(node.notFollowingButtons),
          };
        }
      }
      return node;
    });
    setFlowNodes(updatedNodes);
  } else {
    // Follow Check button
    const updatedNodes = flowNodes.map((node) => {
      if (node.id === ctx.nodeId && node.type === "followCheck") {
        const updateButtons = (buttons) =>
          buttons.map((btn) =>
            btn.id === ctx.buttonId
              ? { ...btn, actions: [...btn.actions, newAction] }
              : btn
          );

        if (ctx.branchType === "following") {
          return {
            ...node,
            followingButtons: updateButtons(node.followingButtons),
          };
        } else {
          return {
            ...node,
            notFollowingButtons: updateButtons(node.notFollowingButtons),
          };
        }
      }
      return node;
    });
    setFlowNodes(updatedNodes);
  }
};
  // Delete node
  const handleDeleteNode = (nodeId) => {
    setFlowNodes(flowNodes.filter((node) => node.id !== nodeId));
    toast.info("Action removed");
  };

  // Delete action from button
  const handleDeleteButtonAction = (nodeId, branchType, buttonId, actionId) => {
    const updatedNodes = flowNodes.map((node) => {
      if (node.id === nodeId && node.type === "followCheck") {
        const updateButtons = (buttons) =>
          buttons.map((btn) =>
            btn.id === buttonId
              ? {
                  ...btn,
                  actions: btn.actions.filter((action) => action.id !== actionId),
                }
              : btn
          );

        if (branchType === "following") {
          return {
            ...node,
            followingButtons: updateButtons(node.followingButtons),
          };
        } else {
          return {
            ...node,
            notFollowingButtons: updateButtons(node.notFollowingButtons),
          };
        }
      }
      return node;
    });
    setFlowNodes(updatedNodes);
    toast.info("Action removed");
  };

  // Render actions for a button
  const renderButtonActions = (nodeId, branchType, button, color) => {
    if (button.actions.length === 0) return null;

    const hasQuickReply = button.actions.some((action) => action.type === "quickReply");
    
    if (hasQuickReply) {
      return null;
    }

    return (
      <Box sx={{ mt: 2 }}>
        <Stack spacing={1}>
          {button.actions.map((action) => {
            const actionType = actionTypes.find((at) => at.type === action.type);
            if (!actionType) return null;

            return (
              <Card
                key={action.id}
                elevation={0}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: actionType.color,
                  bgcolor: actionType.bgColor,
                  position: "relative",
                }}
              >
                <IconButton
                  size="small"
                  onClick={() =>
                    handleDeleteButtonAction(nodeId, branchType, button.id, action.id)
                  }
                  sx={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    bgcolor: "white",
                    "&:hover": { bgcolor: "#FEE2E2", color: "#EF4444" },
                    width: 24,
                    height: 24,
                  }}
                >
                  <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>

                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: 1.5,
                      bgcolor: actionType.color,
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {actionType.icon}
                  </Box>
                  <Box flex={1}>
                    <Typography sx={{ fontWeight: 600, fontSize: "13px", mb: 0.5 }}>
                      {actionType.title}
                    </Typography>
                    {action.type === "redirectLink" && (
                      <Typography
                        variant="caption"
                        sx={{ color: "#64748B", fontSize: "11px" }}
                      >
                        {action.config.redirectUrl}
                      </Typography>
                    )}
                    {action.type === "downloadFile" && (
                      <Typography
                        variant="caption"
                        sx={{ color: "#64748B", fontSize: "11px" }}
                      >
                        {action.config.downloadFile?.name}
                      </Typography>
                    )}
                    {action.type === "askToFollow" && (
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <InstagramIcon sx={{ fontSize: 14, color: "#64748B" }} />
                        <Typography
                          variant="caption"
                          sx={{ color: "#64748B", fontSize: "11px" }}
                        >
                          @{action.config.instagramPage}
                        </Typography>
                      </Stack>
                    )}
                      {action.type === "finishingMessage" && (
  <Box sx={{ mt: 1 }}>
    <Typography
      variant="caption"
      sx={{ 
        color: "#64748B", 
        fontSize: "12px", 
        display: "block",
        // wordBreak: "break-word",
        whiteSpace: "pre-wrap",
        maxWidth: "100%"
      }}
    >
    {action.config.finishingMessage}
    </Typography>
  </Box>
                  )}
                  </Box>
                </Stack>
              </Card>
            );
          })}
        </Stack>
      </Box>
    );
  };

  // Render Quick Reply node for button actions
  const renderButtonQuickReply = (nodeId, branchType, button) => {
    const quickReplyAction = button.actions.find((action) => action.type === "quickReply");
    
    if (!quickReplyAction) return null;

    const isMaxReached = (quickReplyAction.replyOptions?.length || 0) >= 3;

    return (
      <Box sx={{ width: "100%" }}>
        {/* Quick Reply Node - no connection line here, parent handles it */}
        <Card
          elevation={0}
          sx={{
            p: 2.5,
            borderRadius: 3,
            border: "2px solid #F59E0B",
            bgcolor: "#FFFBEB",
            position: "relative",
          }}
        >
          <IconButton
            size="small"
            onClick={() =>
              handleDeleteButtonAction(nodeId, branchType, button.id, quickReplyAction.id)
            }
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
              bgcolor: "white",
              "&:hover": { bgcolor: "#FEE2E2", color: "#EF4444" },
            }}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>

          <Stack direction="row" spacing={2} alignItems="flex-start" mb={2}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2,
                bgcolor: "#F59E0B",
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <QuizIcon />
            </Box>
            <Box flex={1}>
              <Typography sx={{ fontWeight: 700, fontSize: "16px", mb: 0.5 }}>
                Quick Options
              </Typography>
              <Typography variant="caption" sx={{ color: "#64748B" }}>
                Add up to 3 buttons for the user to tap.
              </Typography>
            </Box>
          </Stack>

          <Stack spacing={2}>
             <Box>
            <Typography variant="caption" sx={{ color: "#64748B", fontWeight: 600, mb: 1, display: "block" }}>
              Optional: Cover Image
            </Typography>
            
            {!quickReplyAction.config.quickReplyImage ? (
              <Box
                sx={{
                  border: "2px dashed #FCD34D",
                  borderRadius: 2,
                  p: 2,
                  textAlign: "center",
                  bgcolor: "#FFFBEB",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  "&:hover": {
                    borderColor: "#F59E0B",
                    bgcolor: "#FEF3C7",
                  },
                }}
                component="label"
              >
                <input
                  type="file"
                  hidden
                  accept="image/*"
                  onChange={(e) => 
                    handleQuickReplyImageUpload(nodeId, e.target.files[0], {
                      buttonId: button.id,
                      branchType: branchType,
                      quickReplyActionId: quickReplyAction.id
                    })
                  }
                />
                <CloudUploadIcon sx={{ fontSize: 32, color: "#F59E0B", mb: 0.5 }} />
                <Typography sx={{ fontWeight: 600, fontSize: "13px" }}>
                  Click to upload image
                </Typography>
              </Box>
            ) : (
              <Box
                sx={{
                  position: "relative",
                  borderRadius: 2,
                  overflow: "hidden",
                  border: "2px solid #F59E0B",
                }}
              >
                <img
                  src={quickReplyAction.config.quickReplyImage}
                  alt="Quick Reply"
                  style={{
                    width: "100%",
                    maxHeight: "200px",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
                <IconButton
                  size="small"
                  onClick={() => handleRemoveQuickReplyImage(nodeId, {
                    buttonId: button.id,
                    branchType: branchType,
                    quickReplyActionId: quickReplyAction.id
                  })}
                  sx={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    bgcolor: "rgba(0,0,0,0.6)",
                    color: "white",
                    "&:hover": {
                      bgcolor: "#EF4444",
                    },
                  }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            )}
          </Box>

            <TextField
              fullWidth
              multiline
              rows={2}
              size="small"
              label="Message Text"
              placeholder="What's your primary fitness goal right now?"
              value={quickReplyAction.config.quickReplyQuestion}
              onChange={(e) => {
                const value = e.target.value;
                if (value.length <= 200) {
                  const updatedNodes = flowNodes.map((node) => {
                    if (node.id === nodeId && node.type === "followCheck") {
                      const updateButtons = (buttons) =>
                        buttons.map((btn) =>
                          btn.id === button.id
                            ? {
                                ...btn,
                                actions: btn.actions.map((action) =>
                                  action.id === quickReplyAction.id
                                    ? {
                                        ...action,
                                        config: {
                                          ...action.config,
                                          quickReplyQuestion: value,
                                        },
                                      }
                                    : action
                                ),
                              }
                            : btn
                        );

                      if (branchType === "following") {
                        return {
                          ...node,
                          followingButtons: updateButtons(node.followingButtons),
                        };
                      } else {
                        return {
                          ...node,
                          notFollowingButtons: updateButtons(node.notFollowingButtons),
                        };
                      }
                    }
                    return node;
                  });
                  setFlowNodes(updatedNodes);
                }
              }}
              error={quickReplyAction.config.quickReplyQuestion.length > 180}
              helperText={
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <span style={{ fontSize: '12px' }}>
                    {quickReplyAction.config.quickReplyQuestion.length > 180
                      ? `Warning: ${200 - quickReplyAction.config.quickReplyQuestion.length} characters remaining`
                      : 'Max 200 characters'}
                  </span>
                  <span style={{
                    fontSize: '12px',
                    color: quickReplyAction.config.quickReplyQuestion.length > 180 ? '#EF4444' : '#64748B',
                    fontWeight: quickReplyAction.config.quickReplyQuestion.length > 180 ? 600 : 400
                  }}>
                    {quickReplyAction.config.quickReplyQuestion.length}/200
                  </span>
                </Box>
              }
            />

         <Tooltip title={isMaxReached ? "You can add max 3 options" : ""} arrow placement="top">
              <span>
                <Button
                  size="small"
                  variant="text"
                  startIcon={<AddIcon />}
                  disabled={isMaxReached}
                  onClick={() => {
                    const updatedNodes = flowNodes.map((node) => {
                      if (node.id === nodeId && node.type === "followCheck") {
                        const updateButtons = (buttons) =>
                          buttons.map((btn) =>
                            btn.id === button.id
                              ? {
                                  ...btn,
                                  actions: btn.actions.map((action) =>
                                    action.id === quickReplyAction.id
                                      ? {
                                          ...action,
                                          replyOptions: [
                                            ...action.replyOptions,
                                            {
                                              id: Date.now(),
                                              text: `Option ${action.replyOptions.length + 1}`,
                                              actions: [],
                                            },
                                          ],
                                        }
                                      : action
                                  ),
                                }
                              : btn
                          );

                        if (branchType === "following") {
                          return {
                            ...node,
                            followingButtons: updateButtons(node.followingButtons),
                          };
                        } else {
                          return {
                            ...node,
                            notFollowingButtons: updateButtons(node.notFollowingButtons),
                          };
                        }
                      }
                      return node;
                    });
                    setFlowNodes(updatedNodes);
                    toast.success("Option added!");
                  }}
                  sx={{
                    textTransform: "none",
                    color: isMaxReached ? "grey.400" : "#F59E0B",
                    justifyContent: "flex-start",
                    "&:hover": {
                      bgcolor: "#FFFBEB",
                    },
                  }}
                >
                  Add Option
                </Button>
              </span>
            </Tooltip>
          </Stack>
        </Card>

        {/* Render Quick Reply Options */}
        {renderQuickReplyOptionsForButton(nodeId, branchType, button.id, quickReplyAction)}
      </Box>
    );
  };




const renderQuickReplyOptionsForButton = (nodeId, branchType, buttonId, quickReplyAction) => {
  const options = quickReplyAction.replyOptions ?? [];
  const totalOptions = options.length;
  const splitY = 60, downHeight = 100;

  // Calculate anchors to match flexbox card centers
  // For n equal cards, centers are at (2i+1)/(2n) for i=0,1,...,n-1
 let anchors = [];
  if (totalOptions === 1) {
    anchors = ["50%"];
  } else if (totalOptions === 2) {
    anchors = ["20%", "80%"];
  }
  else if (totalOptions === 3) {
    anchors = ["0%", "50%", "100%"];
  } else if (totalOptions > 3) {
    const step = 70 / (totalOptions - 1);
    anchors = Array.from({ length: totalOptions }, (_, i) => `${15 + step * i}%`);
  }

  if (totalOptions === 0) return null;

  // Calculate horizontal line extent
  const firstAnchor = anchors[0];
  const lastAnchor = anchors[anchors.length - 1];

  // Find options with nested Quick Reply
  const optionsWithNestedQR = options.map((opt, idx) => ({
    opt,
    index: idx,
    hasNestedQR: opt.actions?.some(a => a.type === "quickReply"),
    anchor: anchors[idx]
  })).filter(item => item.hasNestedQR);

  return (
    <Box sx={{ width: "100%", mt: 0, overflow: "visible" }}>
      <Box sx={{ position: "relative", height: splitY + downHeight, mb: 0 }}>
        {/* For single option: one continuous vertical line from center */}
        {totalOptions === 1 ? (
          <Box sx={{ position: "absolute", left: "50%", top: 0, width: 3, height: splitY + downHeight, bgcolor: "#F59E0B", transform: "translateX(-50%)", zIndex: 2 }}/>
        ) : (
          <>
            <Box sx={{ position: "absolute", left: "50%", top: 0, width: 3, height: splitY, bgcolor: "#F59E0B", transform: "translateX(-50%)", zIndex: 2 }}/>
            <Box sx={{ position: "absolute", left: firstAnchor, width: `calc(${lastAnchor} - ${firstAnchor})`, top: splitY - 2, height: 3, bgcolor: "#F59E0B", zIndex: 1 }}/>
            {anchors.map(anchor => (
              <Box key={anchor} sx={{ position: "absolute", left: anchor, top: splitY, width: 3, height: downHeight, bgcolor: "#F59E0B", transform: "translateX(-50%)", zIndex: 1 }}/>
            ))}
          </>
        )}
      </Box>
      
      {/* Options row - use flexbox for better width control */}
      <Box sx={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "nowrap", overflow: "visible" }}>
        {options.map((opt, idx) => {
          const hasNestedQR = opt.actions?.some(a => a.type === "quickReply");
          const hasActions = opt.actions && opt.actions.length > 0;
          
          return (
            <Box 
              key={opt.id} 
              sx={{ 
                flex: "1 1 0",
                minWidth: 340,
                maxWidth: 350,
              }}
            >
              <Card elevation={0} sx={{ p: 2, borderRadius: 2, border: "2px solid #F59E0B", bgcolor: "white", position: "relative", height: "100%" }}>
                {options.length > 1 && (
                  <IconButton
                    size="small"
                    onClick={() => {
                      const updatedNodes = flowNodes.map((node) => {
                        if (node.id === nodeId && node.type === "followCheck") {
                          const updateButtons = (buttons) =>
                            buttons.map((btn) =>
                              btn.id === buttonId
                                ? {
                                    ...btn,
                                    actions: btn.actions.map((action) =>
                                      action.id === quickReplyAction.id
                                        ? {
                                            ...action,
                                            replyOptions: action.replyOptions.filter(
                                              (o) => o.id !== opt.id
                                            ),
                                          }
                                        : action
                                    ),
                                  }
                                : btn
                            );

                          if (branchType === "following") {
                            return {
                              ...node,
                              followingButtons: updateButtons(node.followingButtons),
                            };
                          } else {
                            return {
                              ...node,
                              notFollowingButtons: updateButtons(node.notFollowingButtons),
                            };
                          }
                        }
                        return node;
                      });
                      setFlowNodes(updatedNodes);
                      toast.info("Option removed");
                    }}
                    sx={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      bgcolor: "white",
                      "&:hover": { bgcolor: "#FEE2E2", color: "#EF4444" },
                    }}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                )}

                <Stack spacing={1.5}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Option Text"
                    value={opt.text}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value.length <= 20) {
                        const updatedNodes = flowNodes.map((node) => {
                          if (node.id === nodeId && node.type === "followCheck") {
                            const updateButtons = (buttons) =>
                              buttons.map((btn) =>
                                btn.id === buttonId
                                  ? {
                                      ...btn,
                                      actions: btn.actions.map((action) =>
                                        action.id === quickReplyAction.id
                                          ? {
                                              ...action,
                                              replyOptions: action.replyOptions.map((o) =>
                                                o.id === opt.id
                                                  ? { ...o, text: value }
                                                  : o
                                              ),
                                            }
                                          : action
                                      ),
                                    }
                                  : btn
                              );

                            if (branchType === "following") {
                              return {
                                ...node,
                                followingButtons: updateButtons(node.followingButtons),
                              };
                            } else {
                              return {
                                ...node,
                                notFollowingButtons: updateButtons(node.notFollowingButtons),
                              };
                            }
                          }
                          return node;
                        });
                        setFlowNodes(updatedNodes);
                      }
                    }}
                    error={opt.text.length > 14}
                    helperText={
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <span style={{ fontSize: '11px' }}>
                          {opt.text.length > 14
                            ? `⚠️ ${20 - opt.text.length} chars left`
                            : 'Max 20 chars'}
                        </span>
                        <span style={{
                          fontSize: '11px',
                          color: opt.text.length > 14 ? '#EF4444' : '#64748B',
                          fontWeight: opt.text.length > 14 ? 600 : 400
                        }}>
                          {opt.text.length}/20
                        </span>
                      </Box>
                    }
                  />

                  {renderNestedQuickReplyOptionActions(nodeId, branchType, buttonId, quickReplyAction, opt)}

                  {/* Show indicator if has nested Quick Reply */}
                  {hasNestedQR && (
                    <Box sx={{ p: 1, bgcolor: "#FFFBEB", borderRadius: 1, border: "1px dashed #F59E0B" }}>
                      <Typography variant="caption" sx={{ color: "#B45309", fontWeight: 600 }}>
                        ↓ Quick Reply below
                      </Typography>
                    </Box>
                  )}

                  {/* Only show Add Action button when option has no actions */}
                  {(!opt.actions || opt.actions.length === 0) && (
                    <Box>
                      <Typography
                        variant="caption"
                        sx={{ color: "#64748B", display: "block", mb: 1 }}
                      >
                        When user selects "{opt.text}"
                      </Typography>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<AddCircleOutlineIcon />}
                        fullWidth
                        onClick={() => {
                          setActionContext({
                            nodeId: nodeId,
                            branchType: branchType,
                            buttonId: buttonId,
                            quickReplyActionId: quickReplyAction.id,
                            optionId: opt.id,
                            type: "nestedQuickReply"
                          });
                          resetNodeConfig();
                          setDialogOpen(true);
                        }}
                        sx={{
                          textTransform: "none",
                          borderStyle: "dashed",
                          color: "#F59E0B",
                          borderColor: "#F59E0B",
                          "&:hover": {
                            bgcolor: "#FFFBEB",
                            borderColor: "#F59E0B",
                          },
                        }}
                      >
                        Add Action
                      </Button>
                    </Box>
                  )}
                </Stack>
              </Card>
            </Box>
          );
        })}
      </Box>
      
      {/* Render nested Quick Reply BELOW the options row, with full width available */}
      {optionsWithNestedQR.map(({ opt, index, anchor }) => {
        const anchorNum = parseFloat(anchor);
        
        return (
          <Box key={`nested-${opt.id}`} sx={{ width: "100%", mt: 0 }}>
            {/* Connection line from the specific option down to center, then to nested content */}
            <Box sx={{ position: "relative", height: 60 }}>
              {/* Vertical line from the specific option */}
              <Box sx={{ 
                position: "absolute", 
                left: anchor, 
                top: 0, 
                width: 3, 
                height: 30, 
                bgcolor: "#F59E0B", 
                transform: "translateX(-50%)" 
              }}/>
              {/* Horizontal line connecting to center */}
              {anchorNum !== 50 && (
                <Box sx={{ 
                  position: "absolute", 
                  left: anchorNum < 50 ? anchor : "50%",
                  width: anchorNum < 50 ? `calc(50% - ${anchor})` : `calc(${anchor} - 50%)`,
                  top: 28, 
                  height: 3, 
                  bgcolor: "#F59E0B",
                }}/>
              )}
              {/* Vertical line from center down to nested content */}
              <Box sx={{ 
                position: "absolute", 
                left: "50%", 
                top: 28, 
                width: 3, 
                height: 32, 
                bgcolor: "#F59E0B", 
                transform: "translateX(-50%)" 
              }}/>
            </Box>
            
            {/* Nested Quick Reply - full width */}
            <Box sx={{ width: "100%", display: "flex", justifyContent: "center" }}>
              <Box sx={{ width: "100%", maxWidth: 600 }}>
                {renderNestedQuickReplyInButtonOutside(nodeId, branchType, buttonId, quickReplyAction, opt)}
              </Box>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};


// NEW FUNCTION: Render nested options for button Quick Reply
const renderNestedQuickReplyOptionsInButton = (
  nodeId,
  branchType,
  buttonId,
  parentQR,
  parentOptionId,
  nestedQR
) => {
  const options = nestedQR.replyOptions || [];
  if (options.length === 0) return null;

  const totalOptions = options.length;

  // Anchor positions for connector lines
  let anchors = [];
  if (totalOptions === 1) {
    anchors = ["50%"];
  } else if (totalOptions === 2) {
    anchors = ["20%", "80%"];
  }

  else if (totalOptions === 3) {
    anchors = ["0%", "50%", "100%"];
  }
   else if (totalOptions > 3) {
    const step = 70 / (totalOptions - 1);
    anchors = Array.from({ length: totalOptions }, (_, i) => `${15 + step * i}%`);
  }

  return (
    <Box sx={{ width: "100%", mt: 0 }}>
      {/* 🔶 Connector Lines */}
      <Box sx={{ position: "relative", height: 160, mb: 0 }}>
        {/* Vertical line from parent */}
        <Box
          sx={{
            position: "absolute",
            left: "50%",
            top: 0,
            width: 3,
            height: 60,
            bgcolor: "#F59E0B",
            transform: "translateX(-50%)",
          }}
        />

        {/* Horizontal splitter */}
        {totalOptions > 1 && (
          <Box
            sx={{
              position: "absolute",
              left: anchors[0],                 // start at first option
              width: `calc(${anchors[anchors.length - 1]} - ${anchors[0]})`, // end at last option
              top: 58,
              height: 3,
              bgcolor: "#F59E0B",
            }}
          />
        )}

        {/* Downward lines to each option */}
        {anchors.map((anchor) => (
          <Box
            key={anchor}
            sx={{
              position: "absolute",
              left: anchor,
              top: 60,
              width: 3,
              height: 100,
              bgcolor: "#F59E0B",
              transform: "translateX(-50%)",
            }}
          />
        ))}
      </Box>

      {/* 🔶 Options Row (Flex, not Grid) */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          gap: 2,
          flexWrap: "nowrap",
          width: "100%",
        }}
      >
        {options.map((opt) => (
          <Box
            key={opt.id}
            sx={{
              flex: totalOptions === 1 ? "0 0 auto" : "1 1 0",
              minWidth: 340,
              maxWidth: totalOptions === 1 ? 450 : 350,
            }}
          >
            <Card
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 2,
                border: "2px solid #F59E0B",
                bgcolor: "white",
                position: "relative",
                height: "100%",
              }}
            >
              {totalOptions > 1 && (
                <IconButton
                  size="small"
                  onClick={() => {
                    const updatedNodes = flowNodes.map((node) => {
                      if (node.id === nodeId && node.type === "followCheck") {
                        const updateButtons = (buttons) =>
                          buttons.map((btn) =>
                            btn.id === buttonId
                              ? {
                                  ...btn,
                                  actions: btn.actions.map((action) =>
                                    action.id === parentQR.id
                                      ? {
                                          ...action,
                                          replyOptions: action.replyOptions.map((parentOpt) =>
                                            parentOpt.id === parentOptionId
                                              ? {
                                                  ...parentOpt,
                                                  actions: parentOpt.actions.map((a) =>
                                                    a.id === nestedQR.id
                                                      ? {
                                                          ...a,
                                                          replyOptions: a.replyOptions.filter(
                                                            (o) => o.id !== opt.id
                                                          ),
                                                        }
                                                      : a
                                                  ),
                                                }
                                              : parentOpt
                                          ),
                                        }
                                      : action
                                  ),
                                }
                              : btn
                          );

                        return branchType === "following"
                          ? { ...node, followingButtons: updateButtons(node.followingButtons) }
                          : { ...node, notFollowingButtons: updateButtons(node.notFollowingButtons) };
                      }
                      return node;
                    });

                    setFlowNodes(updatedNodes);
                    toast.info("Option removed");
                  }}
                  sx={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    bgcolor: "white",
                    "&:hover": { bgcolor: "#FEE2E2", color: "#EF4444" },
                  }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              )}

              <Stack spacing={1.5}>
                <TextField
                  fullWidth
                  size="small"
                  label="Option Text"
                  value={opt.text}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value.length <= 20) {
                      const updatedNodes = flowNodes.map((node) => {
                        if (node.id === nodeId && node.type === "followCheck") {
                          const updateButtons = (buttons) =>
                            buttons.map((btn) =>
                              btn.id === buttonId
                                ? {
                                    ...btn,
                                    actions: btn.actions.map((action) =>
                                      action.id === parentQR.id
                                        ? {
                                            ...action,
                                            replyOptions: action.replyOptions.map((parentOpt) =>
                                              parentOpt.id === parentOptionId
                                                ? {
                                                    ...parentOpt,
                                                    actions: parentOpt.actions.map((a) =>
                                                      a.id === nestedQR.id
                                                        ? {
                                                            ...a,
                                                            replyOptions: a.replyOptions.map((o) =>
                                                              o.id === opt.id
                                                                ? { ...o, text: value }
                                                                : o
                                                            ),
                                                          }
                                                        : a
                                                    ),
                                                  }
                                                : parentOpt
                                            ),
                                          }
                                        : action
                                    ),
                                  }
                                : btn
                            );

                          return branchType === "following"
                            ? { ...node, followingButtons: updateButtons(node.followingButtons) }
                            : { ...node, notFollowingButtons: updateButtons(node.notFollowingButtons) };
                        }
                        return node;
                      });

                      setFlowNodes(updatedNodes);
                    }
                  }}
                  error={opt.text.length > 14}
                  helperText={
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                      <span style={{ fontSize: '11px' }}>
                        {opt.text.length > 14
                          ? `⚠️ ${20 - opt.text.length} chars left`
                          : 'Max 20 chars'}
                      </span>
                      <span style={{
                        fontSize: '11px',
                        color: opt.text.length > 14 ? '#EF4444' : '#64748B',
                        fontWeight: opt.text.length > 14 ? 600 : 400
                      }}>
                        {opt.text.length}/20
                      </span>
                    </Box>
                  }
                />

                {renderDeepNestedButtonOptionActions(
                  nodeId,
                  branchType,
                  buttonId,
                  parentQR,
                  parentOptionId,
                  nestedQR,
                  opt
                )}

                {(!opt.actions || opt.actions.length === 0) && (
                  <Box>
                    <Typography variant="caption" sx={{ color: "#64748B", display: "block", mb: 1 }}>
                      When user selects "{opt.text}"
                    </Typography>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<AddCircleOutlineIcon />}
                      fullWidth
                      onClick={() => {
                        setActionContext({
                          nodeId,
                          branchType,
                          buttonId,
                          quickReplyActionId: parentQR.id,
                          parentOptionId,
                          nestedQRId: nestedQR.id,
                          optionId: opt.id,
                          type: "deepNestedButtonQuickReply",
                        });
                        resetNodeConfig();
                        setDialogOpen(true);
                      }}
                      sx={{
                        textTransform: "none",
                        borderStyle: "dashed",
                        color: "#F59E0B",
                        borderColor: "#F59E0B",
                        "&:hover": { bgcolor: "#FFFBEB", borderColor: "#F59E0B" },
                      }}
                    >
                      Add Action
                    </Button>
                  </Box>
                )}
              </Stack>
            </Card>
          </Box>
        ))}
      </Box>
    </Box>
  );
};


// NEW: Render actions for deep nested button Quick Reply options
const renderDeepNestedButtonOptionActions = (nodeId, branchType, buttonId, parentQR, parentOptionId, nestedQR, option) => {
  if (!option.actions || option.actions.length === 0) return null;

  // Filter out Quick Reply (it's rendered separately)
  const nonQRActions = option.actions.filter((a) => a.type !== "quickReply");
  if (nonQRActions.length === 0) return null;

  return (
    <Box sx={{ mt: 2 }}>
      <Stack spacing={1}>
        {nonQRActions.map((action) => {
          const actionType = actionTypes.find((at) => at.type === action.type);
          if (!actionType) return null;

          return (
            <Card
              key={action.id}
              elevation={0}
              sx={{
                p: 1.5,
                borderRadius: 2,
                border: "1px solid",
                borderColor: actionType.color,
                bgcolor: actionType.bgColor,
                position: "relative",
              }}
            >
              <IconButton
                size="small"
                onClick={() => {
                  const updatedNodes = flowNodes.map((node) => {
                    if (node.id === nodeId && node.type === "followCheck") {
                      const updateButtons = (buttons) =>
                        buttons.map((btn) =>
                          btn.id === buttonId
                            ? {
                                ...btn,
                                actions: btn.actions.map((act) =>
                                  act.id === parentQR.id
                                    ? {
                                        ...act,
                                        replyOptions: act.replyOptions.map((parentOpt) =>
                                          parentOpt.id === parentOptionId
                                            ? {
                                                ...parentOpt,
                                                actions: parentOpt.actions.map((a) =>
                                                  a.id === nestedQR.id
                                                    ? {
                                                        ...a,
                                                        replyOptions: a.replyOptions.map((o) =>
                                                          o.id === option.id
                                                            ? {
                                                                ...o,
                                                                actions: o.actions.filter(
                                                                  (x) => x.id !== action.id
                                                                ),
                                                              }
                                                            : o
                                                        ),
                                                      }
                                                    : a
                                                ),
                                              }
                                            : parentOpt
                                        ),
                                      }
                                    : act
                                ),
                              }
                            : btn
                        );

                      if (branchType === "following") {
                        return {
                          ...node,
                          followingButtons: updateButtons(node.followingButtons),
                        };
                      } else {
                        return {
                          ...node,
                          notFollowingButtons: updateButtons(node.notFollowingButtons),
                        };
                      }
                    }
                    return node;
                  });
                  setFlowNodes(updatedNodes);
                  toast.info("Action removed");
                }}
                sx={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  bgcolor: "white",
                  "&:hover": { bgcolor: "#FEE2E2", color: "#EF4444" },
                  width: 24,
                  height: 24,
                }}
              >
                <CloseIcon sx={{ fontSize: 16 }} />
              </IconButton>

              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: 1.5,
                    bgcolor: actionType.color,
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {actionType.icon}
                </Box>
                <Box flex={1}>
                  <Typography sx={{ fontWeight: 600, fontSize: "13px", mb: 0.5 }}>
                    {actionType.title}
                  </Typography>
                  {action.type === "redirectLink" && (
                    <Typography
                      variant="caption"
                      sx={{ color: "#64748B", fontSize: "11px" }}
                    >
                      {action.config.redirectUrl}
                    </Typography>
                  )}
                  {action.type === "downloadFile" && (
                    <Typography
                      variant="caption"
                      sx={{ color: "#64748B", fontSize: "11px" }}
                    >
                      {action.config.downloadFile?.name}
                    </Typography>
                  )}
                  {action.type === "finishingMessage" && (
                    <Typography
                      variant="caption"
                      sx={{ color: "#64748B", fontSize: "11px" }}
                    >
                      {action.config.finishingMessage}
                    </Typography>
                  )}
                </Box>
              </Stack>
            </Card>
          );
        })}
      </Stack>
    </Box>
  );
};

// NEW: Render nested Quick Reply OUTSIDE the option card (for better layout in Follow Check branch)
const renderNestedQuickReplyInButtonOutside = (nodeId, branchType, buttonId, parentQR, option) => {
  const nestedQR = option.actions?.find((a) => a.type === "quickReply");
  if (!nestedQR) return null;
  const isMaxReached = (nestedQR.replyOptions?.length || 0) >= 3;

  return (
    <Box sx={{ width: "100%" }}>
      {/* Nested Quick Reply Card - connection line handled by parent */}
      <Card
        elevation={0}
        sx={{
          p: 2.5,
          borderRadius: 3,
          border: "2px solid #F59E0B",
          bgcolor: "#FFFBEB",
          position: "relative",
        }}
      >
        <IconButton
          size="small"
          onClick={() => {
            const updatedNodes = flowNodes.map((node) => {
              if (node.id === nodeId && node.type === "followCheck") {
                const updateButtons = (buttons) =>
                  buttons.map((btn) =>
                    btn.id === buttonId
                      ? {
                          ...btn,
                          actions: btn.actions.map((action) =>
                            action.id === parentQR.id
                              ? {
                                  ...action,
                                  replyOptions: action.replyOptions.map((opt) =>
                                    opt.id === option.id
                                      ? {
                                          ...opt,
                                          actions: opt.actions.filter(
                                            (a) => a.id !== nestedQR.id
                                          ),
                                        }
                                      : opt
                                  ),
                                }
                              : action
                          ),
                        }
                      : btn
                  );

                if (branchType === "following") {
                  return {
                    ...node,
                    followingButtons: updateButtons(node.followingButtons),
                  };
                } else {
                  return {
                    ...node,
                    notFollowingButtons: updateButtons(node.notFollowingButtons),
                  };
                }
              }
              return node;
            });
            setFlowNodes(updatedNodes);
            toast.info("Nested Quick Reply removed");
          }}
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            bgcolor: "white",
            "&:hover": { bgcolor: "#FEE2E2", color: "#EF4444" },
          }}
        >
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>

        <Stack direction="row" spacing={2} alignItems="flex-start" mb={2}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 2,
              bgcolor: "#F59E0B",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <QuizIcon />
          </Box>
          <Box flex={1}>
            <Typography sx={{ fontWeight: 700, fontSize: "16px", mb: 0.5 }}>
              Quick Options
            </Typography>
            <Typography variant="caption" sx={{ color: "#64748B" }}>
                Add up to 3 buttons for the user to tap.
            </Typography>
          </Box>
        </Stack>

        <Stack spacing={2}>
          <TextField
            fullWidth
            multiline
            rows={2}
            size="small"
            label="Message Text"
            placeholder="What's your primary fitness goal right now?"
            value={nestedQR.config.quickReplyQuestion}
            onChange={(e) => {
              const value = e.target.value;
              if (value.length <= 200) {
                const updatedNodes = flowNodes.map((node) => {
                  if (node.id === nodeId && node.type === "followCheck") {
                    const updateButtons = (buttons) =>
                      buttons.map((btn) =>
                        btn.id === buttonId
                          ? {
                              ...btn,
                              actions: btn.actions.map((action) =>
                                action.id === parentQR.id
                                  ? {
                                      ...action,
                                      replyOptions: action.replyOptions.map((opt) =>
                                        opt.id === option.id
                                          ? {
                                              ...opt,
                                              actions: opt.actions.map((a) =>
                                                a.id === nestedQR.id
                                                  ? {
                                                      ...a,
                                                      config: {
                                                        ...a.config,
                                                        quickReplyQuestion: value,
                                                      },
                                                    }
                                                  : a
                                              ),
                                            }
                                          : opt
                                      ),
                                    }
                                  : action
                              ),
                            }
                          : btn
                      );

                    if (branchType === "following") {
                      return {
                        ...node,
                        followingButtons: updateButtons(node.followingButtons),
                      };
                    } else {
                      return {
                        ...node,
                        notFollowingButtons: updateButtons(node.notFollowingButtons),
                      };
                    }
                  }
                  return node;
                });
                setFlowNodes(updatedNodes);
              }
            }}
            error={nestedQR.config.quickReplyQuestion.length > 180}
            helperText={
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <span style={{ fontSize: '12px' }}>
                  {nestedQR.config.quickReplyQuestion.length > 180
                    ? `Warning: ${200 - nestedQR.config.quickReplyQuestion.length} characters remaining`
                    : 'Max 200 characters'}
                </span>
                <span style={{
                  fontSize: '12px',
                  color: nestedQR.config.quickReplyQuestion.length > 180 ? '#EF4444' : '#64748B',
                  fontWeight: nestedQR.config.quickReplyQuestion.length > 180 ? 600 : 400
                }}>
                  {nestedQR.config.quickReplyQuestion.length}/200
                </span>
              </Box>
            }
          />

          <Tooltip title={isMaxReached ? "You can add max 3 options" : ""} arrow placement="top">
            <span>
              <Button
                size="small"
                variant="text"
                startIcon={<AddIcon />}
                disabled={isMaxReached}
                onClick={() => {
                  const updatedNodes = flowNodes.map((node) => {
                    if (node.id === nodeId && node.type === "followCheck") {
                      const updateButtons = (buttons) =>
                        buttons.map((btn) =>
                          btn.id === buttonId
                            ? {
                                ...btn,
                                actions: btn.actions.map((action) =>
                                  action.id === parentQR.id
                                    ? {
                                        ...action,
                                        replyOptions: action.replyOptions.map((opt) =>
                                          opt.id === option.id
                                            ? {
                                                ...opt,
                                                actions: opt.actions.map((a) =>
                                                  a.id === nestedQR.id
                                                    ? {
                                                        ...a,
                                                        replyOptions: [
                                                          ...(a.replyOptions || []),
                                                          {
                                                            id: Date.now(),
                                                            text: `Option ${(a.replyOptions?.length || 0) + 1}`,
                                                            actions: [],
                                                          },
                                                        ],
                                                      }
                                                    : a
                                                ),
                                              }
                                            : opt
                                        ),
                                      }
                                    : action
                                ),
                              }
                            : btn
                        );

                      if (branchType === "following") {
                        return {
                          ...node,
                          followingButtons: updateButtons(node.followingButtons),
                        };
                      } else {
                        return {
                          ...node,
                          notFollowingButtons: updateButtons(node.notFollowingButtons),
                        };
                      }
                    }
                    return node;
                  });
                  setFlowNodes(updatedNodes);
                  toast.success("Option added!");
                }}
                sx={{
                  textTransform: "none",
                  color: isMaxReached ? "grey.400" : "#F59E0B",
                  justifyContent: "flex-start",
                  "&:hover": {
                    bgcolor: "#FFFBEB",
                  },
                }}
              >
                Add Option
              </Button>
            </span>
          </Tooltip>
        </Stack>
      </Card>

      {/* Render nested options for button-based Quick Reply */}
      {renderNestedQuickReplyOptionsInButton(nodeId, branchType, buttonId, parentQR, option.id, nestedQR)}
    </Box>
  );
};


  // Render actions for nested Quick Reply options
  const renderNestedQuickReplyOptionActions = (nodeId, branchType, buttonId, quickReplyAction, option) => {
    if (!option.actions || option.actions.length === 0) return null;

    // Filter out Quick Reply (it's rendered separately)
    const nonQRActions = option.actions.filter((a) => a.type !== "quickReply");
    if (nonQRActions.length === 0) return null;

    return (
      <Box sx={{ mt: 2 }}>
        <Stack spacing={1}>
          {nonQRActions.map((action) => {
            const actionType = actionTypes.find((at) => at.type === action.type);
            if (!actionType) return null;

            return (
              <Card
                key={action.id}
                elevation={0}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: actionType.color,
                  bgcolor: actionType.bgColor,
                  position: "relative",
                }}
              >
                <IconButton
                  size="small"
                  onClick={() => {
                    const updatedNodes = flowNodes.map((node) => {
                      if (node.id === nodeId && node.type === "followCheck") {
                        const updateButtons = (buttons) =>
                          buttons.map((btn) =>
                            btn.id === buttonId
                              ? {
                                  ...btn,
                                  actions: btn.actions.map((act) =>
                                    act.id === quickReplyAction.id
                                      ? {
                                          ...act,
                                          replyOptions: act.replyOptions.map((opt) =>
                                            opt.id === option.id
                                              ? {
                                                  ...opt,
                                                  actions: opt.actions.filter(
                                                    (a) => a.id !== action.id
                                                  ),
                                                }
                                              : opt
                                          ),
                                        }
                                      : act
                                  ),
                                }
                              : btn
                          );

                        if (branchType === "following") {
                          return {
                            ...node,
                            followingButtons: updateButtons(node.followingButtons),
                          };
                        } else {
                          return {
                            ...node,
                            notFollowingButtons: updateButtons(node.notFollowingButtons),
                          };
                        }
                      }
                      return node;
                    });
                    setFlowNodes(updatedNodes);
                    toast.info("Action removed");
                  }}
                  sx={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    bgcolor: "white",
                    "&:hover": { bgcolor: "#FEE2E2", color: "#EF4444" },
                    width: 24,
                    height: 24,
                  }}
                >
                  <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>

                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: 1.5,
                      bgcolor: actionType.color,
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {actionType.icon}
                  </Box>
                  <Box flex={1}>
                    <Typography sx={{ fontWeight: 600, fontSize: "13px", mb: 0.5 }}>
                      {actionType.title}
                    </Typography>
                    {action.type === "redirectLink" && (
                      <Typography
                        variant="caption"
                        sx={{ color: "#64748B", fontSize: "11px" }}
                      >
                        {action.config.redirectUrl}
                      </Typography>
                    )}
                    {action.type === "downloadFile" && (
                      <Typography
                        variant="caption"
                        sx={{ color: "#64748B", fontSize: "11px" }}
                      >
                        {action.config.downloadFile?.name}
                      </Typography>
                    )}
                    {action.type === "askToFollow" && (
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <InstagramIcon sx={{ fontSize: 14, color: "#64748B" }} />
                        <Typography
                          variant="caption"
                          sx={{ color: "#64748B", fontSize: "11px" }}
                        >
                          @{action.config.instagramPage}
                        </Typography>
                      </Stack>
                    )}
                        {action.type === "finishingMessage" && (
  <Box sx={{ mt: 1 }}>
    <Typography
      variant="caption"
      sx={{ 
        color: "#64748B", 
        fontSize: "12px", 
        display: "block",
        wordBreak: "break-word",
        whiteSpace: "pre-wrap",
        maxWidth: "100%"
      }}
    >
    {action.config.finishingMessage}
    </Typography>
  </Box>
                  )}
                  </Box>
                </Stack>
              </Card>
            );
          })}
        </Stack>
      </Box>
    );
  };

  // Render Quick Reply option actions
const renderQuickReplyOptionActions = (nodeId, option) => {
  if (!option.actions || option.actions.length === 0) return null;

  const hasQuickReply = option.actions.some((action) => action.type === "quickReply");
  const hasFollowCheck = option.actions.some((action) => action.type === "followCheck");
  
  if (hasQuickReply || hasFollowCheck) {
    return null;
  }

  return (
    <Box sx={{ mt: 2 }}>
      <Stack spacing={1}>
        {option.actions.map((action) => {
          const actionType = actionTypes.find((at) => at.type === action.type);
          if (!actionType) return null;

          return (
            <Card
              key={action.id}
              elevation={0}
              sx={{
                p: 1.5,
                borderRadius: 2,
                border: "1px solid",
                borderColor: actionType.color,
                bgcolor: actionType.bgColor,
                position: "relative",
              }}
            >
              <IconButton
                size="small"
                onClick={() =>
                  handleDeleteQuickReplyAction(nodeId, option.id, action.id)
                }
                sx={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  bgcolor: "white",
                  "&:hover": { bgcolor: "#FEE2E2", color: "#EF4444" },
                  width: 24,
                  height: 24,
                }}
              >
                <CloseIcon sx={{ fontSize: 16 }} />
              </IconButton>

              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: 1.5,
                    bgcolor: actionType.color,
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {actionType.icon}
                </Box>
                <Box flex={1}>
                  <Typography sx={{ fontWeight: 600, fontSize: "13px", mb: 0.5 }}>
                    {actionType.title}
                  </Typography>
                  {action.type === "redirectLink" && (
                    <Typography
                      variant="caption"
                      sx={{ color: "#64748B", fontSize: "11px" }}
                    >
                      {action.config.redirectUrl}
                    </Typography>
                  )}
                  {action.type === "downloadFile" && (
                    <Typography
                      variant="caption"
                      sx={{ color: "#64748B", fontSize: "11px" }}
                    >
                      {action.config.downloadFile?.name}
                    </Typography>
                  )}
                  {action.type === "askToFollow" && (
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <InstagramIcon sx={{ fontSize: 14, color: "#64748B" }} />
                      <Typography
                        variant="caption"
                        sx={{ color: "#64748B", fontSize: "11px" }}
                      >
                        @{action.config.instagramPage}
                      </Typography>
                    </Stack>
                  )}
                 {action.type === "finishingMessage" && (
  <Box sx={{ mt: 1 }}>
    <Typography
      variant="caption"
      sx={{ 
        color: "#64748B", 
        fontSize: "12px", 
        display: "block",
        wordBreak: "break-word",
        whiteSpace: "pre-wrap",
        maxWidth: "100%"
      }}
    >
    {action.config.finishingMessage}
    </Typography>
  </Box>
                  )}
                </Box>
              </Stack>
            </Card>
          );
        })}
      </Stack>
    </Box>
  );
};


const renderButtonFlowNodes = (node, branchType, buttons, color) => {
  const totalOptions = buttons.length;
  const splitY = 60, downHeight = 100;

  // Check if single following button has Quick Reply action
  const hasQuickReplyOnly = branchType === "following" && 
    totalOptions === 1 && 
    buttons[0].actions.length > 0 && 
    buttons[0].actions.some(a => a.type === "quickReply");

  // Check if single following button has no actions
  const hasNoActions = branchType === "following" && 
    totalOptions === 1 && 
    buttons[0].actions.length === 0;

  // Check if single following button has non-QuickReply actions
  const hasOtherActions = branchType === "following" && 
    totalOptions === 1 && 
    buttons[0].actions.length > 0 && 
    !buttons[0].actions.some(a => a.type === "quickReply");

  return (
    <Box sx={{ width: "100%", mt: 0 }}>
      {/* Connection line - single vertical line going down */}
      <Box sx={{ position: "relative", height: splitY + downHeight, mb: 0 }}>
        <Box
          sx={{
            position: "absolute",
            left: "50%",
            top: 0,
            width: 3,
            height: splitY + downHeight,
            bgcolor: color,
            transform: "translateX(-50%)",
            zIndex: 2,
          }}
        />
      </Box>

      {/* Content rendering based on state */}
      {hasNoActions ? (
        /* Case 1: No actions - show Add Action button centered */
        <Box sx={{ display: "flex", justifyContent: "center", width: "100%" }}>
          <Button
            variant="outlined"
            startIcon={<AddCircleOutlineIcon />}
            onClick={() => handleOpenAddActionDialog(node.id, branchType, buttons[0].id)}
            sx={{
              textTransform: "none",
              borderStyle: "dashed",
              color: color,
              borderColor: color,
              py: 1.5,
              px: 4,
              fontSize: "14px",
              fontWeight: 600,
              borderWidth: 2,
              borderRadius: 2,
              "&:hover": {
                bgcolor: branchType === "following" ? "#F0FDF4" : "#FEF2F2",
                borderColor: color,
                borderWidth: 2,
              },
            }}
          >
            Add Action
          </Button>
        </Box>
      ) : hasQuickReplyOnly ? (
        /* Case 2: Quick Reply action - render it directly centered */
        <Box sx={{ width: "100%" }}>
          {renderButtonQuickReply(node.id, branchType, buttons[0])}
        </Box>
      ) : hasOtherActions ? (
        /* Case 3: Other actions (like Redirect Link) - render centered without extra Add Action */
        <Box sx={{ display: "flex", justifyContent: "center", width: "100%" }}>
          <Box sx={{ width: "100%", maxWidth: 350 }}>
            {renderButtonActions(node.id, branchType, buttons[0], color)}
          </Box>
        </Box>
      ) : (
        /* Case 4: notFollowing branch or multiple buttons - render as before */
        <Box sx={{ display: "flex", justifyContent: "center", width: "100%" }}>
          <Card
            elevation={0}
            sx={{
              p: 2,
              borderRadius: 2,
              border: `2px solid ${color}`,
              bgcolor: "white",
              width: "100%",
              maxWidth: 350,
            }}
          >
            <Stack spacing={1.5}>
              {branchType === "notFollowing" && (
                <>
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: 1,
                      bgcolor: "#FEF2F2",
                      border: "1px solid #FECACA",
                      textAlign: "center",
                    }}
                  >
                    <Typography
                      sx={{
                        fontWeight: 600,
                        color: "#DC2626",
                        fontSize: "14px",
                      }}
                    >
                      Following
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      p: 2,
                      borderRadius: 1,
                      bgcolor: "#FFFBEB",
                      border: "1px dashed #FBBF24",
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        color: "#64748B",
                        display: "block",
                        fontSize: "11px",
                      }}
                    >
                      User clicks Following button after following
                    </Typography>
                  </Box>
                </>
              )}
            </Stack>
          </Card>
        </Box>
      )}
    </Box>
  );
};



  // Render Quick Reply options as branching nodes
const renderQuickReplyOptions = (node) => {
  const options = node.replyOptions ?? [];
  const totalOptions = options.length;
  
  const splitY = 60, downHeight = 100;

  let anchors = [];
  if (totalOptions === 1) {
    anchors = ["50%"];
  } else if (totalOptions === 2) {
    anchors = ["25%", "75%"];
  } else if (totalOptions > 2) {
    const step = 70 / (totalOptions - 1);
    anchors = Array.from({ length: totalOptions }, (_, i) => `${15 + step * i}%`);
  }

  // Find options with nested content
  const optionsWithNestedContent = options.map((opt, idx) => ({
    opt,
    index: idx,
    hasNestedQR: opt.actions?.some(a => a.type === "quickReply"),
    hasNestedFollowCheck: opt.actions?.some(a => a.type === "followCheck"),
    anchor: anchors[idx]
  })).filter(item => item.hasNestedQR || item.hasNestedFollowCheck);

  return (
    <Box sx={{ width: "100%", mt: 0 }}>
      {/* Connection lines from Quick Reply to options */}
      <Box sx={{ position: "relative", height: splitY + downHeight, mb: 0 }}>
        <Box sx={{ position: "absolute", left: "50%", top: 0, width: 3, height: splitY, bgcolor: "#F59E0B", transform: "translateX(-50%)", zIndex: 2 }}/>
        {totalOptions > 1 && (
          <Box sx={{ position: "absolute", left: totalOptions === 2 ? "25%" : "15%", width: totalOptions === 2 ? "50%" : "70%", top: splitY - 2, height: 3, bgcolor: "#F59E0B", zIndex: 1 }}/>
        )}
        {anchors.map(anchor => (
          <Box key={anchor} sx={{ position: "absolute", left: anchor, top: splitY, width: 3, height: downHeight, bgcolor: "#F59E0B", transform: "translateX(-50%)", zIndex: 1 }}/>
        ))}
      </Box>
      
      {/* Options row - ONLY the option cards, no nested content */}
      <Box sx={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "nowrap" }}>
        {options.map((opt, idx) => {
          const hasNestedQR = opt.actions?.some(a => a.type === "quickReply");
          const hasNestedFollowCheck = opt.actions?.some(a => a.type === "followCheck");
          const hasActions = opt.actions && opt.actions.length > 0;
          
          return (
            <Box 
              key={opt.id} 
              sx={{ 
                flex: totalOptions === 1 ? "0 0 auto" : "1 1 0",
                minWidth: hasActions ? 340 : 340,
                maxWidth: totalOptions === 1 ? 450 : 350,
                width: totalOptions === 1 ? "auto" : undefined,
              }}
            >
              <Card elevation={0} sx={{ p: 2, borderRadius: 2, border: "2px solid #F59E0B", bgcolor: "white", position: "relative", height: "100%" }}>
                {totalOptions > 1 && (
                  <IconButton size="small" onClick={() => handleDeleteQuickReplyOption(node.id, opt.id)}
                    sx={{ position: "absolute", top: 4, right: 4, bgcolor: "white", "&:hover": { bgcolor: "#FEE2E2", color: "#EF4444" } }}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                )}
                <Stack spacing={1.5}>
                  <TextField fullWidth size="small" label="Option Text" value={opt.text}
                    onChange={e => {
                      const value = e.target.value;
                      if (value.length <= 20) {
                        handleUpdateQuickReplyOption(node.id, opt.id, value);
                      }
                    }}
                    error={opt.text.length > 14}
                    helperText={
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <span style={{ fontSize: '11px' }}>
                          {opt.text.length > 14
                            ? `⚠️ ${20 - opt.text.length} chars left`
                            : 'Max 20 chars'}
                        </span>
                        <span style={{
                          fontSize: '11px',
                          color: opt.text.length > 14 ? '#EF4444' : '#64748B',
                          fontWeight: opt.text.length > 14 ? 600 : 400
                        }}>
                          {opt.text.length}/20
                        </span>
                      </Box>
                    }
                  />
                  
                  {/* Show other actions (not Quick Reply or Follow Check) */}
                  {renderQuickReplyOptionActions(node.id, opt)}
                  
                  {/* Show indicator if has nested Quick Reply */}
                  {hasNestedQR && (
                    <Box sx={{ p: 1, bgcolor: "#FFFBEB", borderRadius: 1, border: "1px dashed #F59E0B" }}>
                      <Typography variant="caption" sx={{ color: "#B45309", fontWeight: 600 }}>
                        ↓ Quick Reply below
                      </Typography>
                    </Box>
                  )}
                  
                  {/* Show indicator if has nested Follow Check */}
                  {hasNestedFollowCheck && (
                    <Box sx={{ p: 1, bgcolor: "#F0FDF4", borderRadius: 1, border: "1px dashed #10B981" }}>
                      <Typography variant="caption" sx={{ color: "#059669", fontWeight: 600 }}>
                        ↓ Follow Check below
                      </Typography>
                    </Box>
                  )}
                  
                  {/* Show Add Action only if no actions */}
                  {(!opt.actions || opt.actions.length === 0) && (
                    <Box>
                      <Typography variant="caption" sx={{ color: "#64748B", display: "block", mb: 1 }}>
                        When user selects "{opt.text}"
                      </Typography>
                      <Button size="small" variant="outlined" startIcon={<AddCircleOutlineIcon />} fullWidth
                        onClick={() => handleOpenQuickReplyActionDialog(node.id, opt.id)}
                        sx={{
                          textTransform: "none", borderStyle: "dashed", color: "#F59E0B", borderColor: "#F59E0B",
                          "&:hover": { bgcolor: "#FFFBEB", borderColor: "#F59E0B" }
                        }}>
                        Add Action
                      </Button>
                    </Box>
                  )}
                </Stack>
              </Card>
            </Box>
          );
        })}
      </Box>
      
      {/* Render nested content BELOW the options row, with full width available */}
      {optionsWithNestedContent.map(({ opt, index, hasNestedQR, hasNestedFollowCheck, anchor }) => {
        // Calculate the anchor as a number for positioning logic
        const anchorNum = parseFloat(anchor);
        const lineColor = hasNestedQR ? "#F59E0B" : "#10B981";
        
        return (
          <Box key={`nested-${opt.id}`} sx={{ width: "100%", mt: 0 }}>
            {/* Connection line from the specific option down to center, then to nested content */}
            <Box sx={{ position: "relative", height: 60 }}>
              {/* Vertical line from the specific option */}
              <Box sx={{ 
                position: "absolute", 
                left: anchor, 
                top: 0, 
                width: 3, 
                height: 30, 
                bgcolor: lineColor, 
                transform: "translateX(-50%)" 
              }}/>
              {/* Horizontal line connecting to center */}
              {anchorNum !== 50 && (
                <Box sx={{ 
                  position: "absolute", 
                  left: anchorNum < 50 ? anchor : "50%",
                  width: anchorNum < 50 ? `calc(50% - ${anchor})` : `calc(${anchor} - 50%)`,
                  top: 28, 
                  height: 3, 
                  bgcolor: lineColor,
                }}/>
              )}
              {/* Vertical line from center down to nested content */}
              <Box sx={{ 
                position: "absolute", 
                left: "50%", 
                top: 28, 
                width: 3, 
                height: 32, 
                bgcolor: lineColor, 
                transform: "translateX(-50%)" 
              }}/>
            </Box>
            
            {/* Nested Quick Reply - full width */}
            {hasNestedQR && (
              <Box sx={{ width: "100%", display: "flex", justifyContent: "center" }}>
                <Box sx={{ width: "100%", maxWidth: 600 }}>
                  {renderQuickReplyOptionQuickReplyOutside(node.id, opt)}
                </Box>
              </Box>
            )}
            
            {/* Nested Follow Check - full width */}
            {hasNestedFollowCheck && (
              <Box sx={{ width: "100%" }}>
                {renderQuickReplyOptionFollowCheck(node.id, opt)}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
};

// NEW: Render nested Quick Reply OUTSIDE the option card (for better layout)
const renderQuickReplyOptionQuickReplyOutside = (nodeId, option) => {
  const quickReplyAction = option.actions?.find(action => action.type === "quickReply");
  if (!quickReplyAction) return null;
  
  const isMaxReached = (quickReplyAction.replyOptions?.length || 0) >= 3;

  return (
    <Box sx={{ width: "100%" }}>
      {/* Nested Quick Reply Card - connection line handled by parent */}
      <Card
        elevation={0}
        sx={{
          p: 2.5,
          borderRadius: 3,
          border: "2px solid #F59E0B",
          bgcolor: "#FFFBEB",
          position: "relative",
        }}
      >
        <IconButton
          size="small"
          onClick={() => handleDeleteQuickReplyAction(nodeId, option.id, quickReplyAction.id)}
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            bgcolor: "white",
            "&:hover": { bgcolor: "#FEE2E2", color: "#EF4444" },
          }}
        >
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
        
        <Stack direction="row" spacing={2} alignItems="flex-start" mb={2}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              bgcolor: "#F59E0B",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <QuizIcon sx={{ fontSize: 20 }} />
          </Box>
          <Box flex={1}>
            <Typography sx={{ fontWeight: 700, fontSize: "14px", mb: 0.5 }}>
              Quick Options
            </Typography>
            <Typography variant="caption" sx={{ color: "#64748B", fontSize: "11px" }}>
                Add up to 3 buttons for the user to tap.
            </Typography>
          </Box>
        </Stack>
        
        <Stack spacing={2}>
          <TextField
            fullWidth
            multiline
            rows={2}
            size="small"
            label="Message Text"
            value={quickReplyAction.config.quickReplyQuestion}
            onChange={e => {
              const value = e.target.value;
              if (value.length <= 200) {
                const updatedNodes = flowNodes.map(node => {
                  if (node.id === nodeId && node.type === "quickReply") {
                    return {
                      ...node,
                      replyOptions: node.replyOptions.map(opt =>
                        opt.id === option.id
                          ? {
                              ...opt,
                              actions: opt.actions.map(action =>
                                action.id === quickReplyAction.id
                                  ? { ...action, config: { ...action.config, quickReplyQuestion: value } }
                                  : action
                              )
                            }
                          : opt
                      )
                    };
                  }
                  return node;
                });
                setFlowNodes(updatedNodes);
              }
            }}
            error={quickReplyAction.config.quickReplyQuestion.length > 180}
            helperText={
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <span style={{ fontSize: '12px' }}>
                  {quickReplyAction.config.quickReplyQuestion.length > 180
                    ? `Warning: ${200 - quickReplyAction.config.quickReplyQuestion.length} characters remaining`
                    : 'Max 200 characters'}
                </span>
                <span style={{
                  fontSize: '12px',
                  color: quickReplyAction.config.quickReplyQuestion.length > 180 ? '#EF4444' : '#64748B',
                  fontWeight: quickReplyAction.config.quickReplyQuestion.length > 180 ? 600 : 400
                }}>
                  {quickReplyAction.config.quickReplyQuestion.length}/200
                </span>
              </Box>
            }
          />
          
          <Tooltip title={isMaxReached ? "You can add max 3 options" : ""} arrow placement="top">
            <span>
              <Button
                size="small"
                variant="text"
                startIcon={<AddIcon />}
                disabled={isMaxReached}
                onClick={() => {
                  const updatedNodes = flowNodes.map(node => {
                    if (node.id === nodeId && node.type === "quickReply") {
                      return {
                        ...node,
                        replyOptions: node.replyOptions.map(opt =>
                          opt.id === option.id
                            ? {
                                ...opt,
                                actions: opt.actions.map(action =>
                                  action.id === quickReplyAction.id
                                    ? {
                                        ...action,
                                        replyOptions: [
                                          ...(action.replyOptions || []),
                                          { id: Date.now(), text: `Option ${(action.replyOptions?.length || 0) + 1}`, actions: [] }
                                        ]
                                      }
                                    : action
                                )
                              }
                            : opt
                        )
                      };
                    }
                    return node;
                  });
                  setFlowNodes(updatedNodes);
                  toast.success("Option added!");
                }}
                sx={{
                  textTransform: "none",
                  color: isMaxReached ? "grey.400" : "#F59E0B",
                  justifyContent: "flex-start",
                  "&:hover": { bgcolor: "#FFFBEB" }
                }}
              >
                Add Option
              </Button>
            </span>
          </Tooltip>
        </Stack>
      </Card>
      
      {/* Render nested Quick Reply's options */}
      {renderNestedQuickReplyOptionsForMainFlow(nodeId, option.id, quickReplyAction)}
    </Box>
  );
};


// NEW: Render Follow Check inside Quick Reply option with full button rendering
const renderQuickReplyOptionFollowCheck = (nodeId, option) => {
  const followCheckAction = option.actions?.find((action) => action.type === "followCheck");
  
  if (!followCheckAction) return null;

  // Helper function to render buttons for nested Follow Check
  const renderNestedFollowCheckButtons = (branchType, buttons, color) => {
    
    const totalButtons = buttons.length;
    const splitY = 60, downHeight = 100;

     let anchors = [];
  if (totalButtons === 1) {
    anchors = ["50%"];
  } else if (totalButtons === 2) {
    anchors = ["25%", "75%"];
  } else if (totalButtons > 2) {
    const step = 70 / (totalButtons - 1);
    anchors = Array.from({ length: totalButtons }, (_, i) => `${15 + step * i}%`);
  }

  if (totalButtons === 0) return null;

    return (
      <Box sx={{ width: "100%", mt: 0 }}>
        <Box sx={{ position: "relative", height: splitY + downHeight, mb: 0 }}>
          <Box sx={{ position: "absolute", left: "50%", top: 0, width: 3, height: splitY, bgcolor: color, transform: "translateX(-50%)", zIndex: 2 }}/>
          {totalButtons > 1 && (
            <Box sx={{ position: "absolute", left: "15%", width: "70%", top: splitY - 2, height: 3, bgcolor: color, zIndex: 1 }}/>
          )}
          {anchors.map(anchor => (
            <Box key={anchor} sx={{ position: "absolute", left: anchor, top: splitY, width: 3, height: downHeight, bgcolor: color, transform: "translateX(-50%)", zIndex: 1 }}/>
          ))}
        </Box>
        <Grid container spacing={2} justifyContent="space-between">
          {buttons.map((btn) => (
            <Grid size= {{ xs : 12, md: totalButtons === 1 ? 12 : totalButtons === 2 ? 6 : totalButtons === 3 ? 4 : 4 }} key={btn.id}>
              <Card elevation={0} sx={{ p: 2, borderRadius: 2, border: `2px solid ${color}`, bgcolor: "white", position: "relative" }}>
                {buttons.length > 1 && branchType !== "following" && (
                  <IconButton
                    size="small"
                    onClick={() => {
                      const updatedNodes = flowNodes.map((node) => {
                        if (node.id === nodeId && node.type === "quickReply") {
                          return {
                            ...node,
                            replyOptions: node.replyOptions.map((opt) =>
                              opt.id === option.id
                                ? {
                                    ...opt,
                                    actions: opt.actions.map((action) =>
                                      action.id === followCheckAction.id
                                        ? {
                                            ...action,
                                            [branchType === "following" ? "followingButtons" : "notFollowingButtons"]:
                                              action[branchType === "following" ? "followingButtons" : "notFollowingButtons"].filter(
                                                (b) => b.id !== btn.id
                                              ),
                                          }
                                        : action
                                    ),
                                  }
                                : opt
                            ),
                          };
                        }
                        return node;
                      });
                      setFlowNodes(updatedNodes);
                      toast.info("Button removed");
                    }}
                    sx={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      bgcolor: "white",
                      "&:hover": { bgcolor: "#FEE2E2", color: "#EF4444" },
                    }}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                )}

                <Stack spacing={1.5}>
                  {branchType === "following" ? (
                    // For following branch - show Add Action button
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<AddCircleOutlineIcon />}
                      fullWidth
                      onClick={() => {
                        setActionContext({
                          nodeId: nodeId,
                          optionId: option.id,
                          followCheckActionId: followCheckAction.id,
                          buttonId: btn.id,
                          branchType: "following",
                          type: "nestedFollowCheckButton"
                        });
                        resetNodeConfig();
                        setDialogOpen(true);
                      }}
                      sx={{
                        textTransform: "none",
                        borderStyle: "dashed",
                        color: color,
                        borderColor: color,
                        "&:hover": {
                          bgcolor: "#F0FDF4",
                          borderColor: color,
                        },
                      }}
                    >
                      Add Action
                    </Button>
                  ) : (
                    // For notFollowing branch - read-only display
                    <Box
                      sx={{
                        p: 1.5,
                        borderRadius: 1,
                        bgcolor: "#FEF2F2",
                        border: "1px solid #FECACA",
                        textAlign: "center",
                      }}
                    >
                      <Typography
                        sx={{
                          fontWeight: 600,
                          color: "#DC2626",
                          fontSize: "14px",
                        }}
                      >
                        Following
                      </Typography>
                    </Box>
                  )}
                </Stack>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  };

  return (
    <Box sx={{ width: "100%", mt: 0 }}>
      {/* Connection line */}
      <Box sx={{ position: "relative", height: 60, mb: 2 }}>
        <Box
          sx={{
            position: "absolute",
            left: "50%",
            top: 0,
            width: 3,
            height: 60,
            bgcolor: "#10B981",
            transform: "translateX(-50%)",
          }}
        />
      </Box>

      {/* Follow Check Node */}
      <Card
        elevation={0}
        sx={{
          p: 2.5,
          borderRadius: 3,
          border: "2px solid #10B981",
          bgcolor: "#F0FDF4",
          position: "relative",
        }}
      >
        <IconButton
          size="small"
          onClick={() =>
            handleDeleteQuickReplyAction(nodeId, option.id, followCheckAction.id)
          }
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            bgcolor: "white",
            "&:hover": { bgcolor: "#FEE2E2", color: "#EF4444" },
          }}
        >
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>

        <Stack direction="row" spacing={2} alignItems="flex-start" mb={2}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 2,
              bgcolor: "#10B981",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <PersonIcon />
          </Box>
          <Box flex={1}>
            <Typography sx={{ fontWeight: 700, fontSize: "16px", mb: 0.5 }}>
              Follow Check
            </Typography>
            <Typography variant="caption" sx={{ color: "#64748B" }}>
              Check whether user is following or not
            </Typography>
          </Box>
        </Stack>
      </Card>

      {/* Render Follow Check branches */}
      <Box sx={{ width: "100%", mt: 0 }}>
        <Box sx={{ position: "relative", height: 90, mb: 2 }}>
          {/* Vertical line down */}
          <Box
            sx={{
              position: "absolute",
              left: "50%",
              top: 0,
              width: 3,
              height: 30,
              bgcolor: "#10B981",
              transform: "translateX(-50%)",
              zIndex: 2,
            }}
          />
          {/* Horizontal split line */}
          <Box
            sx={{
              position: "absolute",
              left: "10%",
              width: "80%",
              top: 28,
              height: 3,
              bgcolor: "#10B981",
              zIndex: 1,
            }}
          />
          {/* Left branch (Following) */}
          <Box
            sx={{
              position: "absolute",
              left: "25%",
              top: 30,
              width: 3,
              height: 60,
              bgcolor: "#10B981",
              transform: "translateX(-50%)",
              zIndex: 1,
            }}
          />
          {/* Right branch (Not Following) */}
          <Box
            sx={{
              position: "absolute",
              left: "75%",
              top: 30,
              width: 3,
              height: 60,
              bgcolor: "#10B981",
              transform: "translateX(-50%)",
              zIndex: 1,
            }}
          />
        </Box>

        <Grid container spacing={3}>
          {/* LEFT: User Following */}
          <Grid size= {{ xs :12, md : 6}}>
            <Card
              elevation={0}
              sx={{
                p: 2.5,
                borderRadius: 3,
                border: "2px solid #10B981",
                bgcolor: "#F0FDF4",
              }}
            >
              <Stack direction="row" spacing={1.5} alignItems="center" mb={2}>
                <CheckCircleIcon sx={{ color: "#10B981", fontSize: 28 }} />
                <Typography sx={{ fontWeight: 700, fontSize: "15px" }}>
                  User Following
                </Typography>
              </Stack>

              <Typography variant="body2" sx={{ color: "#64748B", fontSize: "13px" }}>
                User is already following. Add actions to continue the flow.
              </Typography>
            </Card>

            {/* Render following buttons */}
            {followCheckAction.followingButtons && followCheckAction.followingButtons.length > 0 &&
              renderNestedFollowCheckButtons("following", followCheckAction.followingButtons, "#10B981")}
          </Grid>

          {/* RIGHT: User Not Following */}
          <Grid size = {{ xs : 12, md : 6}}>
            <Card
              elevation={0}
              sx={{
                p: 2.5,
                borderRadius: 3,
                border: "2px solid #EF4444",
                bgcolor: "#FEF2F2",
              }}
            >
              <Stack direction="row" spacing={1.5} alignItems="center" mb={2}>
                <CancelIcon sx={{ color: "#EF4444", fontSize: 28 }} />
                <Typography sx={{ fontWeight: 700, fontSize: "15px" }}>
                  User Not Following
                </Typography>
              </Stack>

              <Stack spacing={2}>
                <TextField
                  fullWidth
                  multiline
                  rows={4}
                  size="small"
                  label="Message"
                  value={followCheckAction.config?.followCheckNoMessage || ""}
                  onChange={(e) => {
                    const updatedNodes = flowNodes.map((node) => {
                      if (node.id === nodeId && node.type === "quickReply") {
                        return {
                          ...node,
                          replyOptions: node.replyOptions.map((opt) =>
                            opt.id === option.id
                              ? {
                                  ...opt,
                                  actions: opt.actions.map((action) =>
                                    action.id === followCheckAction.id
                                      ? {
                                          ...action,
                                          config: {
                                            ...action.config,
                                            followCheckNoMessage: e.target.value,
                                          },
                                        }
                                      : action
                                  ),
                                }
                              : opt
                          ),
                        };
                      }
                      return node;
                    });
                    setFlowNodes(updatedNodes);
                  }}
                />

                <Button
                  size="small"
                  variant="text"
                  startIcon={<AddIcon />}
                  onClick={() => {
                    const updatedNodes = flowNodes.map((node) => {
                      if (node.id === nodeId && node.type === "quickReply") {
                        return {
                          ...node,
                          replyOptions: node.replyOptions.map((opt) =>
                            opt.id === option.id
                              ? {
                                  ...opt,
                                  actions: opt.actions.map((action) =>
                                    action.id === followCheckAction.id
                                      ? {
                                          ...action,
                                          notFollowingButtons: [
                                            ...(action.notFollowingButtons || []),
                                            {
                                              id: Date.now(),
                                              text: `Button ${(action.notFollowingButtons?.length || 0) + 1}`,
                                              actions: [],
                                            },
                                          ],
                                        }
                                      : action
                                  ),
                                }
                              : opt
                          ),
                        };
                      }
                      return node;
                    });
                    setFlowNodes(updatedNodes);
                    toast.success("Button added!");
                  }}
                  sx={{
                    textTransform: "none",
                    color: "#EF4444",
                    justifyContent: "flex-start",
                    "&:hover": {
                      bgcolor: "#FEF2F2",
                    },
                  }}
                >
                  Add Button
                </Button>
              </Stack>
            </Card>

            {/* Render not following buttons */}
            {followCheckAction.notFollowingButtons && followCheckAction.notFollowingButtons.length > 0 &&
              renderNestedFollowCheckButtons("notFollowing", followCheckAction.notFollowingButtons, "#EF4444")}
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
};


  // NEW: Render nested Quick Reply options for main-flow Quick Replies (supports infinite nesting)
const renderNestedQuickReplyOptionsForMainFlow = (nodeId, parentOptionId, quickReplyAction) => {
  const options = quickReplyAction.replyOptions ?? [];
  const totalOptions = options.length;
  if (totalOptions === 0) return null;
  const splitY = 60, downHeight = 100;

  let anchors = [];
  if (totalOptions === 1) {
    anchors = ["50%"];
  } else if (totalOptions === 2) {
    anchors = ["20%", "80%"];
  } 
  else if (totalOptions === 3) {
    anchors = ["0%", "50%", "100%"];
  } 
  else if (totalOptions > 3) {
    const step = 70 / (totalOptions - 1);
    anchors = Array.from({ length: totalOptions }, (_, i) => `${15 + step * i}%`);
  }

  // Find options with nested Quick Reply
  const optionsWithNestedQR = options.map((opt, idx) => ({
    opt,
    index: idx,
    hasNestedQR: opt.actions?.some(a => a.type === "quickReply"),
    anchor: anchors[idx]
  })).filter(item => item.hasNestedQR);

  return (
    <Box sx={{ width: "100%", mt: 0, overflow: "visible" }}>
      <Box sx={{ position: "relative", height: splitY + downHeight, mb: 0 }}>
        {/* For single option: one continuous vertical line from center */}
        {totalOptions === 1 ? (
          <Box sx={{ position: "absolute", left: "50%", top: 0, width: 3, height: splitY + downHeight, bgcolor: "#F59E0B", transform: "translateX(-50%)", zIndex: 2 }}/>
        ) : (
          <>
            <Box sx={{ position: "absolute", left: "50%", top: 0, width: 3, height: splitY, bgcolor: "#F59E0B", transform: "translateX(-50%)", zIndex: 2 }}/>
            <Box sx={{ position: "absolute", left: totalOptions === 2 ? "20%" : "0%", width: totalOptions === 2 ? "60%" : "100%", top: splitY - 2, height: 3, bgcolor: "#F59E0B", zIndex: 1 }}/>
            {anchors.map(anchor => (
              <Box key={anchor} sx={{ position: "absolute", left: anchor, top: splitY, width: 3, height: downHeight, bgcolor: "#F59E0B", transform: "translateX(-50%)", zIndex: 1 }}/>
            ))}
          </>
        )}
      </Box>
      
      {/* Options row - use flexbox for better width control */}
      <Box sx={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "nowrap", overflow: "visible" }}>
        {options.map((opt, idx) => {
          const hasNestedQR = opt.actions?.some(a => a.type === "quickReply");
          const hasActions = opt.actions && opt.actions.length > 0;
          
          return (
            <Box 
              key={opt.id} 
              sx={{ 
                flex: totalOptions === 1 ? "0 0 auto" : "1 1 0",
                minWidth: hasActions ? 340 : 340,
                maxWidth: totalOptions === 1 ? 450 : 350,
                width: totalOptions === 1 ? "auto" : undefined,
              }}
            >
              <Card elevation={0} sx={{ p: 2, borderRadius: 2, border: "2px solid #F59E0B", bgcolor: "white", position: "relative", height: "100%" }}>
                {totalOptions > 1 && (
                  <IconButton size="small" onClick={() => {
                      const updatedNodes = flowNodes.map((node) => {
                        if (node.id === nodeId && node.type === "quickReply") {
                          return {
                            ...node,
                            replyOptions: node.replyOptions.map((parentOpt) =>
                              parentOpt.id === parentOptionId
                                ? {
                                    ...parentOpt,
                                    actions: parentOpt.actions.map((action) =>
                                      action.id === quickReplyAction.id
                                        ? {
                                            ...action,
                                            replyOptions: action.replyOptions.filter((o) => o.id !== opt.id)
                                          }
                                        : action
                                    )
                                  }
                                : parentOpt
                            )
                          };
                        }
                        return node;
                      });
                      setFlowNodes(updatedNodes);
                      toast.info("Option removed");
                    }}
                    sx={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      bgcolor: "white",
                      "&:hover": { bgcolor: "#FEE2E2", color: "#EF4444" },
                    }}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                )}
                <Stack spacing={1.5}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Option Text"
                    value={opt.text}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value.length <= 20) {
                        const updatedNodes = flowNodes.map((node) => {
                          if (node.id === nodeId && node.type === "quickReply") {
                            return {
                              ...node,
                              replyOptions: node.replyOptions.map((parentOpt) =>
                                parentOpt.id === parentOptionId
                                  ? {
                                      ...parentOpt,
                                      actions: parentOpt.actions.map((action) =>
                                        action.id === quickReplyAction.id
                                          ? {
                                              ...action,
                                              replyOptions: action.replyOptions.map((o) =>
                                                o.id === opt.id ? { ...o, text: value } : o
                                              )
                                            }
                                          : action
                                      )
                                    }
                                  : parentOpt
                              )
                            };
                          }
                          return node;
                        });
                        setFlowNodes(updatedNodes);
                      }
                    }}
                    error={opt.text.length > 14}
                    helperText={
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <span style={{ fontSize: '11px' }}>
                          {opt.text.length > 14
                            ? `⚠️ ${20 - opt.text.length} chars left`
                            : 'Max 20 chars'}
                        </span>
                        <span style={{
                          fontSize: '11px',
                          color: opt.text.length > 14 ? '#EF4444' : '#64748B',
                          fontWeight: opt.text.length > 14 ? 600 : 400
                        }}>
                          {opt.text.length}/20
                        </span>
                      </Box>
                    }
                  />
                  {/* Render any non-quickReply actions for this nested option */}
                  {renderNestedOptionActions(nodeId, parentOptionId, quickReplyAction, opt)}

                  {/* Show indicator if has nested Quick Reply */}
                  {hasNestedQR && (
                    <Box sx={{ p: 1, bgcolor: "#FFFBEB", borderRadius: 1, border: "1px dashed #F59E0B" }}>
                      <Typography variant="caption" sx={{ color: "#B45309", fontWeight: 600 }}>
                        ↓ Quick Reply below
                      </Typography>
                    </Box>
                  )}

                  {/* Show Add Action only if no actions */}
                  {(!opt.actions || opt.actions.length === 0) && (
                    <Box>
                      <Typography
                        variant="caption"
                        sx={{ color: "#64748B", display: "block", mb: 1 }}
                      >
                        When user selects "{opt.text}"
                      </Typography>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<AddCircleOutlineIcon />}
                        fullWidth
                        onClick={() => {
                          setActionContext({
                            nodeId: nodeId,
                            parentOptionId: parentOptionId,
                            quickReplyActionId: quickReplyAction.id,
                            optionId: opt.id,
                            type: "quickReply"
                          });
                          resetNodeConfig();
                          setDialogOpen(true);
                        }}
                        sx={{
                          textTransform: "none",
                          borderStyle: "dashed",
                          color: "#F59E0B",
                          borderColor: "#F59E0B",
                          "&:hover": {
                            bgcolor: "#FFFBEB",
                            borderColor: "#F59E0B",
                          },
                        }}
                      >
                        Add Action
                      </Button>
                    </Box>
                  )}
                </Stack>
              </Card>
            </Box>
          );
        })}
      </Box>
      
      {/* Render nested Quick Reply BELOW the options row, with full width available */}
      {optionsWithNestedQR.map(({ opt, index, anchor }) => {
        const anchorNum = parseFloat(anchor);
        
        return (
          <Box key={`nested-${opt.id}`} sx={{ width: "100%", mt: 0 }}>
            {/* Connection line from the specific option down to center, then to nested content */}
            <Box sx={{ position: "relative", height: 60 }}>
              {/* Vertical line from the specific option */}
              <Box sx={{ 
                position: "absolute", 
                left: anchor, 
                top: 0, 
                width: 3, 
                height: 30, 
                bgcolor: "#F59E0B", 
                transform: "translateX(-50%)" 
              }}/>
              {/* Horizontal line connecting to center */}
              {anchorNum !== 50 && (
                <Box sx={{ 
                  position: "absolute", 
                  left: anchorNum < 50 ? anchor : "50%",
                  width: anchorNum < 50 ? `calc(50% - ${anchor})` : `calc(${anchor} - 50%)`,
                  top: 28, 
                  height: 3, 
                  bgcolor: "#F59E0B",
                }}/>
              )}
              {/* Vertical line from center down to nested content */}
              <Box sx={{ 
                position: "absolute", 
                left: "50%", 
                top: 28, 
                width: 3, 
                height: 32, 
                bgcolor: "#F59E0B", 
                transform: "translateX(-50%)" 
              }}/>
            </Box>
            
            {/* Nested Quick Reply - full width */}
            <Box sx={{ width: "100%", display: "flex", justifyContent: "center" }}>
              <Box sx={{ width: "100%", maxWidth: 600 }}>
                {renderDeepNestedQuickReplyOutside(nodeId, parentOptionId, quickReplyAction, opt)}
              </Box>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};



  // NEW: Render non-quickReply actions for deeply nested options
  const renderNestedOptionActions = (nodeId, parentOptionId, quickReplyAction, option) => {
    if (!option.actions || option.actions.length === 0) return null;

    const nonQuickReplyActions = option.actions.filter((action) => action.type !== "quickReply");
    
    if (nonQuickReplyActions.length === 0) return null;

    return (
      <Box sx={{ mt: 2 }}>
        <Stack spacing={1}>
          {nonQuickReplyActions.map((action) => {
            const actionType = actionTypes.find((at) => at.type === action.type);
            if (!actionType) return null;

            return (
              <Card
                key={action.id}
                elevation={0}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: actionType.color,
                  bgcolor: actionType.bgColor,
                  position: "relative",
                }}
              >
                <IconButton
                  size="small"
                  onClick={() => {
                    const updatedNodes = flowNodes.map((node) => {
                      if (node.id === nodeId && node.type === "quickReply") {
                        return {
                          ...node,
                          replyOptions: node.replyOptions.map((parentOpt) =>
                            parentOpt.id === parentOptionId
                              ? {
                                  ...parentOpt,
                                  actions: parentOpt.actions.map((act) =>
                                    act.id === quickReplyAction.id
                                      ? {
                                          ...act,
                                          replyOptions: act.replyOptions.map((opt) =>
                                            opt.id === option.id
                                              ? {
                                                  ...opt,
                                                  actions: opt.actions.filter(
                                                    (a) => a.id !== action.id
                                                  ),
                                                }
                                              : opt
                                          ),
                                        }
                                      : act
                                  ),
                                }
                              : parentOpt
                          ),
                        };
                      }
                      return node;
                    });
                    setFlowNodes(updatedNodes);
                    toast.info("Action removed");
                  }}
                  sx={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    bgcolor: "white",
                    "&:hover": { bgcolor: "#FEE2E2", color: "#EF4444" },
                    width: 24,
                    height: 24,
                  }}
                >
                  <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>

                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: 1.5,
                      bgcolor: actionType.color,
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {actionType.icon}
                  </Box>
                  <Box flex={1}>
                    <Typography sx={{ fontWeight: 600, fontSize: "13px", mb: 0.5 }}>
                      {actionType.title}
                    </Typography>
                    {action.type === "redirectLink" && (
                      <Typography
                        variant="caption"
                        sx={{ color: "#64748B", fontSize: "11px" }}
                      >
                        {action.config.redirectUrl}
                      </Typography>
                    )}
                    {action.type === "downloadFile" && (
                      <Typography
                        variant="caption"
                        sx={{ color: "#64748B", fontSize: "11px" }}
                      >
                        {action.config.downloadFile?.name}
                      </Typography>
                    )}
                    {action.type === "askToFollow" && (
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <InstagramIcon sx={{ fontSize: 14, color: "#64748B" }} />
                        <Typography
                          variant="caption"
                          sx={{ color: "#64748B", fontSize: "11px" }}
                        >
                          @{action.config.instagramPage}
                        </Typography>
                      </Stack>
                    )}

                       {action.type === "finishingMessage" && (
  <Box sx={{ mt: 1 }}>
    <Typography
      variant="caption"
      sx={{ 
        color: "#64748B", 
        fontSize: "12px", 
        display: "block",
        wordBreak: "break-word",
        whiteSpace: "pre-wrap",
        maxWidth: "100%"
      }}
    >
    {action.config.finishingMessage}
    </Typography>
  </Box>
                  )}
                  </Box>
                </Stack>
              </Card>
            );
          })}
        </Stack>
      </Box>
    );
  };



// NEW: Render nested Quick Reply OUTSIDE the option card (for better layout in main flow)
const renderDeepNestedQuickReplyOutside = (nodeId, parentOptionId, parentQRAction, option) => {
  const nestedQuickReply = option.actions?.find((action) => action.type === "quickReply");
  
  if (!nestedQuickReply) return null;
  const isMaxReached = (nestedQuickReply.replyOptions?.length || 0) >= 3;

  return (
    <Box sx={{ width: "100%" }}>
      {/* Nested Quick Reply Card - connection line handled by parent */}
      <Card
        elevation={0}
        sx={{
          p: 2.5,
          borderRadius: 3,
          border: "2px solid #F59E0B",
          bgcolor: "#FFFBEB",
          position: "relative",
        }}
      >
        <IconButton
          size="small"
          onClick={() => {
            const updatedNodes = flowNodes.map((node) => {
              if (node.id === nodeId && node.type === "quickReply") {
                return {
                  ...node,
                  replyOptions: node.replyOptions.map((parentOpt) =>
                    parentOpt.id === parentOptionId
                      ? {
                          ...parentOpt,
                          actions: parentOpt.actions.map((act) =>
                            act.id === parentQRAction.id
                              ? {
                                  ...act,
                                  replyOptions: act.replyOptions.map((opt) =>
                                    opt.id === option.id
                                      ? {
                                          ...opt,
                                          actions: opt.actions.filter(
                                            (a) => a.id !== nestedQuickReply.id
                                          ),
                                        }
                                      : opt
                                  ),
                                }
                              : act
                          ),
                        }
                      : parentOpt
                  ),
                };
              }
              return node;
            });
            setFlowNodes(updatedNodes);
            toast.info("Nested Quick Reply removed");
          }}
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            bgcolor: "white",
            "&:hover": { bgcolor: "#FEE2E2", color: "#EF4444" },
          }}
        >
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>

        <Stack direction="row" spacing={2} alignItems="flex-start" mb={2}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 2,
              bgcolor: "#F59E0B",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <QuizIcon />
          </Box>
          <Box flex={1}>
            <Typography sx={{ fontWeight: 700, fontSize: "16px", mb: 0.5 }}>
              Quick Options
            </Typography>
            <Typography variant="caption" sx={{ color: "#64748B" }}>
                Add up to 3 buttons for the user to tap.
            </Typography>
          </Box>
        </Stack>

        <Stack spacing={2}>
          <TextField
            fullWidth
            multiline
            rows={2}
            size="small"
            label="Message Text"
            placeholder="What's your primary fitness goal right now?"
            value={nestedQuickReply.config.quickReplyQuestion}
            onChange={(e) => {
              const value = e.target.value;
              if (value.length <= 200) {
                const updatedNodes = flowNodes.map((node) => {
                  if (node.id === nodeId && node.type === "quickReply") {
                    return {
                      ...node,
                      replyOptions: node.replyOptions.map((parentOpt) =>
                        parentOpt.id === parentOptionId
                          ? {
                              ...parentOpt,
                              actions: parentOpt.actions.map((act) =>
                                act.id === parentQRAction.id
                                  ? {
                                      ...act,
                                      replyOptions: act.replyOptions.map((opt) =>
                                        opt.id === option.id
                                          ? {
                                              ...opt,
                                              actions: opt.actions.map((a) =>
                                                a.id === nestedQuickReply.id
                                                  ? {
                                                      ...a,
                                                      config: {
                                                        ...a.config,
                                                        quickReplyQuestion: value,
                                                      },
                                                    }
                                                  : a
                                              ),
                                            }
                                          : opt
                                      ),
                                    }
                                  : act
                              ),
                            }
                          : parentOpt
                      ),
                    };
                  }
                  return node;
                });
                setFlowNodes(updatedNodes);
              }
            }}
            error={nestedQuickReply.config.quickReplyQuestion.length > 180}
            helperText={
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <span style={{ fontSize: '12px' }}>
                  {nestedQuickReply.config.quickReplyQuestion.length > 180
                    ? `Warning: ${200 - nestedQuickReply.config.quickReplyQuestion.length} characters remaining`
                    : 'Max 200 characters'}
                </span>
                <span style={{
                  fontSize: '12px',
                  color: nestedQuickReply.config.quickReplyQuestion.length > 180 ? '#EF4444' : '#64748B',
                  fontWeight: nestedQuickReply.config.quickReplyQuestion.length > 180 ? 600 : 400
                }}>
                  {nestedQuickReply.config.quickReplyQuestion.length}/200
                </span>
              </Box>
            }
          />

          <Tooltip title={isMaxReached ? "You can add max 3 options" : ""} arrow placement="top">
            <span>
              <Button
                size="small"
                variant="text"
                startIcon={<AddIcon />}
                disabled={isMaxReached}
                onClick={() => {
                  const updatedNodes = flowNodes.map((node) => {
                    if (node.id === nodeId && node.type === "quickReply") {
                      return {
                        ...node,
                        replyOptions: node.replyOptions.map((parentOpt) =>
                          parentOpt.id === parentOptionId
                            ? {
                                ...parentOpt,
                                actions: parentOpt.actions.map((act) =>
                                  act.id === parentQRAction.id
                                    ? {
                                        ...act,
                                        replyOptions: act.replyOptions.map((opt) =>
                                          opt.id === option.id
                                            ? {
                                                ...opt,
                                                actions: opt.actions.map((a) =>
                                                  a.id === nestedQuickReply.id
                                                    ? {
                                                        ...a,
                                                        replyOptions: [
                                                          ...(a.replyOptions || []),
                                                          {
                                                            id: Date.now(),
                                                            text: `Option ${(a.replyOptions?.length || 0) + 1}`,
                                                            actions: [],
                                                          },
                                                        ],
                                                      }
                                                    : a
                                                ),
                                              }
                                            : opt
                                        ),
                                      }
                                    : act
                                ),
                              }
                            : parentOpt
                        ),
                      };
                    }
                    return node;
                  });
                  setFlowNodes(updatedNodes);
                  toast.success("Option added!");
                }}
                sx={{
                  textTransform: "none",
                  color: isMaxReached ? "grey.400" : "#F59E0B",
                  justifyContent: "flex-start",
                  "&:hover": {
                    bgcolor: "#FFFBEB",
                  },
                }}
              >
                Add Option
              </Button>
            </span>
          </Tooltip>
        </Stack>
      </Card>

      {/* Render nested options */}
      {renderDeepNestedQuickReplyOptions(nodeId, parentOptionId, parentQRAction, option.id, nestedQuickReply)}
    </Box>
  );
};

// NEW FUNCTION: Render options for deeply nested Quick Reply
const renderDeepNestedQuickReplyOptions = (nodeId, parentOptionId, parentQRAction, optionId, nestedQuickReply) => {
  const options = nestedQuickReply.replyOptions || [];
  const totalOptions = options.length;

  if (totalOptions === 0) return null;

  const splitY = 60, downHeight = 100;

  let anchors = [];
  if (totalOptions === 1) {
    anchors = ["50%"];
  } else if (totalOptions === 2) {
    anchors = ["25%", "75%"];
  } else if (totalOptions > 2) {
    const step = 70 / (totalOptions - 1);
    anchors = Array.from({ length: totalOptions }, (_, i) => `${15 + step * i}%`);
  }

  return (
    <Box sx={{ width: "100%", mt: 0 }}>
      {/* Branching lines */}
      <Box sx={{ position: "relative", height: splitY + downHeight, mb: 0 }}>
        <Box sx={{ position: "absolute", left: "50%", top: 0, width: 3, height: splitY, bgcolor: "#F59E0B", transform: "translateX(-50%)", zIndex: 2 }}/>
        {totalOptions > 1 && (
          <Box sx={{ position: "absolute", left: totalOptions === 2 ? "25%" : "15%", width: totalOptions === 2 ? "50%" : "70%", top: splitY - 2, height: 3, bgcolor: "#F59E0B", zIndex: 1 }}/>
        )}
        {anchors.map(anchor => (
          <Box key={anchor} sx={{ position: "absolute", left: anchor, top: splitY, width: 3, height: downHeight, bgcolor: "#F59E0B", transform: "translateX(-50%)", zIndex: 1 }}/>
        ))}
      </Box>

      {/* Option nodes - use flexbox for better width control */}
      <Box sx={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "nowrap" }}>
        {options.map((opt) => {
          const hasActions = opt.actions && opt.actions.length > 0;
          
          return (
            <Box 
              key={opt.id}
              sx={{ 
                flex: totalOptions === 1 ? "0 0 auto" : "1 1 0",
                minWidth: hasActions ? 340 : 340,
                maxWidth: totalOptions === 1 ? 450 : 350,
                width: totalOptions === 1 ? "auto" : undefined,
              }}
            >
              <Card
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 2,
                  border: "2px solid #F59E0B",
                  bgcolor: "white",
                  position: "relative",
                  height: "100%",
                }}
              >
                {totalOptions > 1 && (
                <IconButton
                  size="small"
                  onClick={() => {
                    const updatedNodes = flowNodes.map((node) => {
                      if (node.id === nodeId && node.type === "quickReply") {
                        return {
                          ...node,
                          replyOptions: node.replyOptions.map((parentOpt) =>
                            parentOpt.id === parentOptionId
                              ? {
                                  ...parentOpt,
                                  actions: parentOpt.actions.map((act) =>
                                    act.id === parentQRAction.id
                                      ? {
                                          ...act,
                                          replyOptions: act.replyOptions.map((middleOpt) =>
                                            middleOpt.id === optionId
                                              ? {
                                                  ...middleOpt,
                                                  actions: middleOpt.actions.map((a) =>
                                                    a.id === nestedQuickReply.id
                                                      ? {
                                                          ...a,
                                                          replyOptions: a.replyOptions.filter(
                                                            (o) => o.id !== opt.id
                                                          ),
                                                        }
                                                      : a
                                                  ),
                                                }
                                              : middleOpt
                                          ),
                                        }
                                      : act
                                  ),
                                }
                              : parentOpt
                          ),
                        };
                      }
                      return node;
                    });
                    setFlowNodes(updatedNodes);
                    toast.info("Option removed");
                  }}
                  sx={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    bgcolor: "white",
                    "&:hover": { bgcolor: "#FEE2E2", color: "#EF4444" },
                  }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              )}

              <Stack spacing={1.5}>
                <TextField
                  fullWidth
                  size="small"
                  label="Option Text"
                  value={opt.text}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value.length <= 20) {
                      const updatedNodes = flowNodes.map((node) => {
                        if (node.id === nodeId && node.type === "quickReply") {
                          return {
                            ...node,
                            replyOptions: node.replyOptions.map((parentOpt) =>
                              parentOpt.id === parentOptionId
                                ? {
                                    ...parentOpt,
                                    actions: parentOpt.actions.map((act) =>
                                      act.id === parentQRAction.id
                                        ? {
                                            ...act,
                                            replyOptions: act.replyOptions.map((middleOpt) =>
                                              middleOpt.id === optionId
                                                ? {
                                                    ...middleOpt,
                                                    actions: middleOpt.actions.map((a) =>
                                                      a.id === nestedQuickReply.id
                                                        ? {
                                                            ...a,
                                                            replyOptions: a.replyOptions.map((o) =>
                                                              o.id === opt.id
                                                                ? { ...o, text: value }
                                                                : o
                                                            ),
                                                          }
                                                        : a
                                                    ),
                                                  }
                                                : middleOpt
                                            ),
                                          }
                                        : act
                                    ),
                                  }
                                : parentOpt
                            ),
                          };
                        }
                        return node;
                      });
                      setFlowNodes(updatedNodes);
                    }
                  }}
                  error={opt.text.length > 14}
                  helperText={
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                      <span style={{ fontSize: '11px' }}>
                        {opt.text.length > 14
                          ? `⚠️ ${20 - opt.text.length} chars left`
                          : 'Max 20 chars'}
                      </span>
                      <span style={{
                        fontSize: '11px',
                        color: opt.text.length > 14 ? '#EF4444' : '#64748B',
                        fontWeight: opt.text.length > 14 ? 600 : 400
                      }}>
                        {opt.text.length}/20
                      </span>
                    </Box>
                  }
                />

                {/* Show Add Action for nested option */}
                {(!opt.actions || opt.actions.length === 0) && (
                  <Box>
                    <Typography
                      variant="caption"
                      sx={{ color: "#64748B", display: "block", mb: 1 }}
                    >
                      When user selects "{opt.text}"
                    </Typography>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<AddCircleOutlineIcon />}
                      fullWidth
                      onClick={() => {
                        // Create a special context for deeply nested options
                        setActionContext({
                          nodeId: nodeId,
                          parentOptionId: parentOptionId,
                          parentQRActionId: parentQRAction.id,
                          middleOptionId: optionId,
                          nestedQRId: nestedQuickReply.id,
                          optionId: opt.id,
                          type: "deepNestedQuickReply"
                        });
                        resetNodeConfig();
                        setDialogOpen(true);
                      }}
                      sx={{
                        textTransform: "none",
                        borderStyle: "dashed",
                        color: "#F59E0B",
                        borderColor: "#F59E0B",
                        "&:hover": {
                          bgcolor: "#FFFBEB",
                          borderColor: "#F59E0B",
                        },
                      }}
                    >
                      Add Action
                    </Button>
                  </Box>
                )}
              </Stack>
            </Card>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};


  // Render Follow Check Branch
  const renderFollowCheckBranch = (node) => {
  const splitY = 60, downHeight = 80;
  
  return (
    <Box sx={{ width: "100%", mt: 0 }}>
      {/* Connection lines container */}
      <Box sx={{ position: "relative", height: splitY + downHeight, mb: 0 }}>
        {/* Vertical line from Follow Check (center) */}
        <Box sx={{ 
          position: "absolute", 
          left: "50%", 
          top: 0, 
          width: 3, 
          height: splitY, 
          bgcolor: "#10B981", 
          transform: "translateX(-50%)", 
          zIndex: 2 
        }}/>
        {/* Horizontal line connecting both branches */}
        <Box sx={{ 
          position: "absolute", 
          left: "25%", 
          width: "50%", 
          top: splitY - 2, 
          height: 3, 
          bgcolor: "#10B981", 
          zIndex: 1 
        }}/>
        {/* Left vertical line (to User Following) */}
        <Box sx={{ 
          position: "absolute", 
          left: "25%", 
          top: splitY, 
          width: 3, 
          height: downHeight, 
          bgcolor: "#10B981", 
          transform: "translateX(-50%)", 
          zIndex: 1 
        }}/>
        {/* Right vertical line (to User Not Following) */}
        <Box sx={{ 
          position: "absolute", 
          left: "75%", 
          top: splitY, 
          width: 3, 
          height: downHeight, 
          bgcolor: "#EF4444", 
          transform: "translateX(-50%)", 
          zIndex: 1 
        }}/>
      </Box>
      
      {/* Two-column layout with flexbox for better control */}
      <Box sx={{ display: "flex", gap: 8, width: "100%", alignItems: "flex-start" }}>
        {/* LEFT: User Following Branch */}
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}>
          <Card
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 3,
              border: "2px solid #10B981",
              bgcolor: "#F0FDF4",
              width: "100%",
              maxWidth: 400,
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center" mb={2}>
              <CheckCircleIcon sx={{ color: "#10B981", fontSize: 28 }} />
              <Typography sx={{ fontWeight: 700, fontSize: "15px" }}>
                User Following
              </Typography>
            </Stack>

            <Typography variant="body2" sx={{ color: "#64748B", fontSize: "13px" }}>
              User is already following. Add actions to continue the flow.
            </Typography>
          </Card>

          {/* Child content for User Following - allow to expand */}
          <Box sx={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
            {renderButtonFlowNodes(
              node,
              "following",
              node.followingButtons,
              "#10B981"
            )}
          </Box>
        </Box>

        {/* RIGHT: User Not Following Branch */}
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}>
          <Card
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 3,
              border: "2px solid #EF4444",
              bgcolor: "#FEF2F2",
              width: "100%",
              maxWidth: 400,
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center" mb={2}>
              <CancelIcon sx={{ color: "#EF4444", fontSize: 28 }} />
              <Typography sx={{ fontWeight: 700, fontSize: "15px" }}>
                User Not Following
              </Typography>
            </Stack>

            <Stack spacing={2}>
              <TextField
                fullWidth
                multiline
                rows={4}
                size="small"
                label="Message"
                value={node.config.followCheckNoMessage}
                onChange={(e) => {
                  const updatedNodes = flowNodes.map((n) =>
                    n.id === node.id
                      ? {
                          ...n,
                          config: {
                            ...n.config,
                            followCheckNoMessage: e.target.value,
                          },
                        }
                      : n
                  );
                  setFlowNodes(updatedNodes);
                }}
              />
            </Stack>
          </Card>

          {/* Child content for User Not Following */}
          <Box sx={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
            {renderButtonFlowNodes(
              node,
              "notFollowing",
              node.notFollowingButtons,
              "#EF4444"
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

  // Render node based on type
  const renderNode = (node) => {
    const actionType = actionTypes.find((at) => at.type === node.type);
    if (!actionType) return null;

    if (node.type === "followCheck") {
      return (
        <Box key={node.id} sx={{ width: "100%", position: "relative" }}>
          <Card
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 3,
              border: "2px solid",
              borderColor: actionType.color,
              bgcolor: actionType.bgColor,
              position: "relative",
              maxWidth: 600,
              mx: "auto",
            }}
          >
            <IconButton
              size="small"
              onClick={() => handleDeleteNode(node.id)}
              sx={{
                position: "absolute",
                top: 8,
                right: 8,
                bgcolor: "white",
                "&:hover": { bgcolor: "#FEE2E2", color: "#EF4444" },
              }}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>

            <Stack direction="row" spacing={2} alignItems="flex-start">
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 2,
                  bgcolor: actionType.color,
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {actionType.icon}
              </Box>
              <Box flex={1}>
                <Typography sx={{ fontWeight: 700, fontSize: "16px", mb: 0.5 }}>
                  {actionType.title}
                </Typography>
                <Typography variant="caption" sx={{ color: "#64748B" }}>
                  {actionType.description}
                </Typography>
              </Box>
            </Stack>
          </Card>

          {renderFollowCheckBranch(node)}
        </Box>
      );
    }

    if (node.type === "quickReply") {
      const isMaxReached = (node.replyOptions?.length || 0) >= 3;

      return (
        <Box key={node.id} sx={{ width: "100%", position: "relative" }}>
          <Card
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: 3,
              border: "2px solid #F59E0B",
              bgcolor: "#FFFBEB",
              position: "relative",
              maxWidth: 600,
              mx: "auto",
            }}
          >
            <IconButton
              size="small"
              onClick={() => handleDeleteNode(node.id)}
              sx={{
                position: "absolute",
                top: 8,
                right: 8,
                bgcolor: "white",
                "&:hover": { bgcolor: "#FEE2E2", color: "#EF4444" },
              }}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>

            <Stack direction="row" spacing={2} alignItems="flex-start" mb={2}>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 2,
                  bgcolor: "#F59E0B",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <QuizIcon />
              </Box>
              <Box flex={1}>
                <Typography sx={{ fontWeight: 700, fontSize: "16px", mb: 0.5 }}>
                  Quick Options
                </Typography>
                <Typography variant="caption" sx={{ color: "#64748B" }}>
                Add up to 3 buttons for the user to tap.
                </Typography>
              </Box>
            </Stack>

            <Stack spacing={2}>

              <Box>
            <Typography variant="caption" sx={{ color: "#64748B", fontWeight: 600, mb: 1, display: "block" }}>
              Optional: Cover Image
            </Typography>
            
            {!node.config.quickReplyImage ? (
              <Box
                sx={{
                  border: "2px dashed #FCD34D",
                  borderRadius: 2,
                  p: 2,
                  textAlign: "center",
                  bgcolor: "#FFFBEB",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  "&:hover": {
                    borderColor: "#F59E0B",
                    bgcolor: "#FEF3C7",
                  },
                }}
                component="label"
              >
                <input
                  type="file"
                  hidden
                  accept="image/*"
                  onChange={(e) => handleQuickReplyImageUpload(node.id, e.target.files[0])}
                />
                <CloudUploadIcon sx={{ fontSize: 32, color: "#F59E0B", mb: 0.5 }} />
                <Typography sx={{ fontWeight: 600, fontSize: "13px" }}>
                  Click to upload image
                </Typography>
              </Box>
            ) : (
              <Box
                sx={{
                  position: "relative",
                  borderRadius: 2,
                  overflow: "hidden",
                  border: "2px solid #F59E0B",
                }}
              >
                <img
                  src={node.config.quickReplyImage}
                  alt="Quick Reply"
                  style={{
                    width: "100%",
                    maxHeight: "200px",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
                <IconButton
                  size="small"
                  onClick={() => handleRemoveQuickReplyImage(node.id)}
                  sx={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    bgcolor: "rgba(0,0,0,0.6)",
                    color: "white",
                    "&:hover": {
                      bgcolor: "#EF4444",
                    },
                  }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            )}
          </Box>



              <TextField
                fullWidth
                multiline
                rows={2}
                size="small"
                label="Message Text"
                placeholder="What's your primary fitness goal right now?"
                value={node.config.quickReplyQuestion}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value.length <= 200) {
                    const updatedNodes = flowNodes.map((n) =>
                      n.id === node.id
                        ? {
                            ...n,
                            config: {
                              ...n.config,
                              quickReplyQuestion: value,
                            },
                          }
                        : n
                    );
                    setFlowNodes(updatedNodes);
                  }
                }}
                error={node.config.quickReplyQuestion.length > 180}
                helperText={
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <span style={{ fontSize: '12px' }}>
                      {node.config.quickReplyQuestion.length > 180
                        ? `Warning: ${200 - node.config.quickReplyQuestion.length} characters remaining`
                        : 'Max 200 characters'}
                    </span>
                    <span style={{
                      fontSize: '12px',
                      color: node.config.quickReplyQuestion.length > 180 ? '#EF4444' : '#64748B',
                      fontWeight: node.config.quickReplyQuestion.length > 180 ? 600 : 400
                    }}>
                      {node.config.quickReplyQuestion.length}/200
                    </span>
                  </Box>
                }
              />

           {/* DISABLED LOGIC HERE */}
              <Tooltip title={isMaxReached ? "You can add max 3 options" : ""} arrow placement="top">
                <span>
                  <Button
                    size="small"
                    variant="text"
                    startIcon={<AddIcon />}
                    disabled={isMaxReached}
                    onClick={() => handleAddQuickReplyOption(node.id)}
                    sx={{
                      textTransform: "none",
                      color: isMaxReached ? "grey.400" : "#F59E0B",
                      justifyContent: "flex-start",
                      "&:hover": {
                        bgcolor: "#FFFBEB",
                      },
                    }}
                  >
                    Add Option
                  </Button>
                </span>
              </Tooltip>
            </Stack>
          </Card>

          {renderQuickReplyOptions(node)}
        </Box>
      );
    }

    return (
      <Card
        key={node.id}
        elevation={0}
        sx={{
          p: 2.5,
          borderRadius: 3,
          border: "2px solid",
          borderColor: actionType.color,
          bgcolor: actionType.bgColor,
          position: "relative",
        }}
      >
        <IconButton
          size="small"
          onClick={() => handleDeleteNode(node.id)}
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            bgcolor: "white",
            "&:hover": { bgcolor: "#FEE2E2", color: "#EF4444" },
          }}
        >
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>

        <Stack direction="row" spacing={2} alignItems="flex-start">
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 2,
              bgcolor: actionType.color,
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {actionType.icon}
          </Box>
          <Box flex={1}>
            <Typography sx={{ fontWeight: 700, fontSize: "16px", mb: 0.5 }}>
              {actionType.title}
            </Typography>
            <Typography variant="caption" sx={{ color: "#64748B" }}>
              {actionType.description}
            </Typography>
          </Box>
        </Stack>

        {node.type === "redirectLink" && (
          <Box sx={{ mt: 2, pl: 8 }}>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              URL: {node.config.redirectUrl}
            </Typography>
          </Box>
        )}

        {node.type === "downloadFile" && (
          <Box sx={{ mt: 2, pl: 8 }}>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              File: {node.config.downloadFile?.name || "No file uploaded"}
            </Typography>
          </Box>
        )}

        {node.type === "askToFollow" && (
          <Box sx={{ mt: 2, pl: 8 }}>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              Page: @{node.config.instagramPage}
            </Typography>
          </Box>
        )}

         {node.type === "finishingMessage" && (
        <Box sx={{ mt: 2, pl: 8 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: "#EC4899" }}>
            Final Message:
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5, color: "#64748B" }}>
            {node.config.finishingMessage || "No message set"}
          </Typography>
        </Box>
      )}
      </Card>
    );
  };

  // Action configuration dialog content
  const renderDialogContent = () => {
    if (!selectedNodeType) return null;

    switch (selectedNodeType) {
   case "redirectLink":
  const isWhatsapp = nodeConfig.redirectUrl.startsWith("https://wa.me/");

  const whatsappNumber = isWhatsapp
    ? nodeConfig.redirectUrl.replace("https://wa.me/", "")
    : "";

  const websiteUrl = !isWhatsapp
    ? nodeConfig.redirectUrl.replace(/^https?:\/\//, "")
    : "";

  const finalUrl = whatsappNumber.length === 10
    ? `https://wa.me/${whatsappNumber}`
    : websiteUrl
    ? `https://${websiteUrl.replace(/^https?:\/\//, "")}`
    : "";

  return (
    <Stack spacing={3}>
      {/* Header */}
      <Box>
         <Typography fontWeight={600} fontSize={16}>
                 Choose one destination.
               </Typography>
               <Typography fontSize={13} color="text.secondary">
                 The user will be redirected automatically.
               </Typography>
      </Box>

      {/* WhatsApp */}
      <Card
        variant="outlined"
        sx={{
          borderRadius: 2,
          borderColor: isWhatsapp ? "success.main" : "divider",
          bgcolor: isWhatsapp ? "#F0FDF4" : "transparent",
        }}
      >
        <CardContent>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Avatar
                sx={{ width: 28, height: 28, bgcolor: "#22C55E" }}
              >
                <WhatsAppIcon sx={{ fontSize: 16 }} />
              </Avatar>
              <Typography fontWeight={600}>WhatsApp</Typography>
            </Stack>

            <TextField
              fullWidth
              placeholder="Enter 10-digit WhatsApp number"
              value={whatsappNumber}
              onChange={(e) => {
                const digits = e.target.value
                  .replace(/\D/g, "")
                  .slice(0, 10);

                setNodeConfig({
                  ...nodeConfig,
                  redirectUrl: digits
                    ? `https://wa.me/${digits}`
                    : "",
                });
              }}
               type="tel"
               inputMode="numeric"
               pattern="[0-9]*"
              error={whatsappNumber.length > 0 && whatsappNumber.length < 10}
            />
          </Stack>
        </CardContent>
      </Card>

      {/* OR */}
      <Divider
        sx={{
          fontSize: 14,
          fontWeight: 700,
          fontFamily: "Inter",
          color: "#000",
        }}
      >
        OR
      </Divider>

      {/* Website */}
      <Card
        variant="outlined"
        sx={{
          borderRadius: 2,
          borderColor: !isWhatsapp && websiteUrl ? "primary.main" : "divider",
          bgcolor: !isWhatsapp && websiteUrl ? "#EFF6FF" : "transparent",
        }}
      >
        <CardContent>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Avatar
                sx={{ width: 28, height: 28, bgcolor: "#3B82F6" }}
              >
                <PublicIcon sx={{ fontSize: 16 }} />
              </Avatar>
              <Typography fontWeight={600}>Website</Typography>
            </Stack>

            <TextField
              fullWidth
              placeholder="example.com or www.example.com"
              value={websiteUrl}
              onChange={(e) =>
                setNodeConfig({
                  ...nodeConfig,
                  redirectUrl: e.target.value
                    ? `https://${e.target.value.replace(/^https?:\/\//, "")}`
                    : "",
                })
              }
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    https://
                  </InputAdornment>
                ),
              }}
            />
          </Stack>
        </CardContent>
      </Card>

    </Stack>
  );

      case "downloadFile":
        return (
          <Stack spacing={3}>
            <Alert severity="info">
              Upload a file (Image | PDF | Excel Sheet) that will be downloaded by the user on an action.
            </Alert>
            <Box
              sx={{
                border: "2px dashed",
                borderColor: nodeConfig.downloadFile ? "#3B82F6" : "#CBD5E1",
                borderRadius: 2,
                p: 4,
                textAlign: "center",
                bgcolor: nodeConfig.downloadFile ? "#EFF6FF" : "#F8FAFC",
                cursor: "pointer",
                transition: "all 0.2s",
                "&:hover": {
                  borderColor: "#3B82F6",
                  bgcolor: "#EFF6FF",
                },
              }}
              component="label"
            >
              <input
                type="file"
                hidden
                accept="application/pdf,image/*,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    const validTypes = [
                      "application/pdf",
                      "image/png",
                      "image/jpeg",
                      "image/jpg",
                      "image/gif",
                      "application/vnd.ms-excel",
                      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    ];
                    if (validTypes.includes(file.type)) {
                      setNodeConfig({ ...nodeConfig, downloadFile: file });
                      toast.success("File selected!");
                    } else {
                      toast.error("Please upload a PDF, Image, or Excel file");
                    }
                  }
                }}
              />
              <CloudUploadIcon sx={{ fontSize: 48, color: "#3B82F6", mb: 2 }} />
              <Typography sx={{ fontWeight: 600, mb: 0.5 }}>
                {nodeConfig.downloadFile
                  ? nodeConfig.downloadFile.name
                  : "Click to upload file"}
              </Typography>
              <Typography variant="caption" sx={{ color: "#64748B" }}>
                PDF, Image, or Excel files
              </Typography>
              {nodeConfig.downloadFile && (
                <Box sx={{ mt: 2 }}>
                  <Chip
                    icon={<InsertDriveFileIcon />}
                    label={`${(nodeConfig.downloadFile.size / 1024).toFixed(2)} KB`}
                    color="primary"
                    variant="outlined"
                  />
                </Box>
              )}
            </Box>
          </Stack>
        );

      case "askToFollow":
        return (
          <Stack spacing={3}>
            <Alert severity="info">
              The user will be asked to follow your Instagram page before proceeding.
            </Alert>
            <Box
              sx={{
                p: 3,
                borderRadius: 2,
                border: "2px solid #EC4899",
                bgcolor: "#FCE7F3",
              }}
            >
              <Stack direction="row" spacing={2} alignItems="center">
                <Box
                  sx={{
                    width: 56,
                    height: 56,
                    borderRadius: 2,
                    bgcolor: "#EC4899",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <InstagramIcon sx={{ fontSize: 32 }} />
                </Box>
                <Box flex={1}>
                  <Typography
                    variant="caption"
                    sx={{ color: "#64748B", display: "block", mb: 0.5 }}
                  >
                    Instagram Page
                  </Typography>
                  <Typography sx={{ fontWeight: 700, fontSize: "18px" }}>
                    @{nodeConfig.instagramPage}
                  </Typography>
                </Box>
              </Stack>
            </Box>
            <Alert severity="warning">
              This username cannot be changed and is linked to your account.
            </Alert>
          </Stack>
        );

      case "finishingMessage":
      return (
        <Stack spacing={3}>
          <Alert severity="info">
            This message will be sent as the final step in your automation. 
            No buttons or further actions will be available after this message.
          </Alert>
           <Box
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        bgcolor: "#FCE7F3",
                        border: "1px solid #EC4899",
                      }}
                    >
                      <Stack direction="row" spacing={1.5} alignItems="flex-start">
                        <MessageIcon sx={{ color: "#EC4899", mt: 0.5 }} />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                            Best Practices
                          </Typography>
                           <Typography variant="caption" sx={{ color: "#64748B" }}>
                                           • Keep it friendly and professional<br />
                                           • Thank the user for their engagement<br />
                                           • Set clear expectations if needed<br />
                                           • Use emojis to add personality 😊 
                                         </Typography>
                        </Box>
                      </Stack>
                    </Box>
          <TextField
            fullWidth
            multiline
            rows={4}
            label="Final Message"
            placeholder="Thank you for your interest! We'll be in touch soon."
            value={nodeConfig.finishingMessage}
            onChange={(e) => {
              const value = e.target.value;
              if (value.length <= 500) {
                setNodeConfig({ ...nodeConfig, finishingMessage: value });
              }
            }}
            error={nodeConfig.finishingMessage.length > 450}
            helperText={
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <span>
                  {nodeConfig.finishingMessage.length > 450
                    ? `Warning: ${500 - nodeConfig.finishingMessage.length} characters remaining`
                    : 'Maximum 500 characters'}
                </span>
                <span style={{
                  color: nodeConfig.finishingMessage.length > 450 ? '#EF4444' : '#64748B',
                  fontWeight: nodeConfig.finishingMessage.length > 450 ? 600 : 400
                }}>
                  {nodeConfig.finishingMessage.length}/500
                </span>
              </Box>
            }
          />
        
        </Stack>
      );

      default:
        return null;
    }
  };


const handleLaunchAutomation = async () => {
    setConfDialogOpen(false);

    if (!dmMessage.trim()) {
      showSnackbar("Please enter a DM message", "error");
      return;
    }

     if (!keywords || keywords.length === 0) {
    showSnackbar("At least one keyword is mandatory", "error");
    return;
  }

  if (
  !replies ||
  replies.length !== 3 ||
  replies.some((reply) => !reply || !reply.trim())
) {
  showSnackbar("Please add all 3 reply messages", "error");
  return;
}

  // Validate Quick Options nodes — message text and option texts must not be empty
  if (flowNodes && flowNodes.length > 0) {
    for (const node of flowNodes) {
      if (node.type === "quickReply") {
        if (!node.config?.quickReplyQuestion?.trim()) {
          showSnackbar("Quick Options: Message Text cannot be empty", "error");
          return;
        }
        for (const opt of node.replyOptions || []) {
          if (!opt.text?.trim()) {
            showSnackbar("Quick Options: Option Text cannot be empty", "error");
            return;
          }
          // Check nested quickReply inside this option's actions
          for (const action of opt.actions || []) {
            if (action.type === "quickReply") {
              if (!action.config?.quickReplyQuestion?.trim()) {
                showSnackbar("Nested Quick Options: Message Text cannot be empty", "error");
                return;
              }
              for (const nestedOpt of action.replyOptions || []) {
                if (!nestedOpt.text?.trim()) {
                  showSnackbar("Nested Quick Options: Option Text cannot be empty", "error");
                  return;
                }
              }
            }
          }
        }
      }
    }
  }

    try {
      const payload = {
        postId: data.id,
        dmMessage: dmMessage.trim(),
        buttonText: buttonText.trim(),
        flowNodes,
        caption: data.caption,
        thumbnail: data.thumbnail,
        keywords: keywords,
        hasReply: isReplyAvailable,
        replyComments: isReplyAvailable ? replies : [],
        isEdit: isEditMode, // NEW: Send edit flag
      };

      await api.post("/automation/config", payload);

      toast.success(isEditMode ? "Automation updated successfully!" : "Automation started successfully!");
      
      setTimeout(() => {
        navigate("/professional/automations");
      }, 1400);
    } catch (error) {
      console.error("Error saving automation:", error);
      
      // Handle specific error for active automation
      if (error.response?.data?.message === "Please stop the automation before editing") {
        toast.error("Please stop the automation before editing");
      } else {
        toast.error("Error! Please Try Again");
      }
    }
  };

    if (loading) {
        return (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
            <CircularProgress size={60} />
          </Box>
        );
      }

    return (
          <Box sx={{
            maxHeight: "90vh",
            bgcolor: "#F8FAFC",
            overflowX: 'hidden',
            overflowY: { xs: 'auto', lg: 'hidden' },
            overscrollBehavior: 'contain',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            '&::-webkit-scrollbar': {
              display: 'none',
            },
          }}>
      

      {/* Header */}
      <Box
        sx={{
          position: { xs: "sticky", lg: "relative" },
          top: 0,
          zIndex: 10,
          p: 1,
          borderBottom: "1px solid #E5E7EB",
          bgcolor: "#F8FAFC",
        }}
      >
        {isEditMode ? (
          <>
           {/* Phone Simulator Toggle Button - Fixed Position */}
<Tooltip title={showPhoneSimulator ? "Hide Preview" : "Show Preview"} placement="left">
  <IconButton
    onClick={() => setShowPhoneSimulator(!showPhoneSimulator)}
    sx={{
      position: "fixed",
      right: isMobile ? (showPhoneSimulator ? 'calc(40vh + 56px)' : 14) : (showPhoneSimulator ? 'calc(40vh + 56px)' : 24),
      top: isMobile? 146 : 100,
      zIndex: 1200,
      bgcolor: "white",
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      transition: "all 0.3s ease",
      "&:hover": {
        bgcolor: "#F3F4F6",
        transform: "scale(1.05)",
      },
    }}
  >
    {showPhoneSimulator ? <VisibilityOffIcon /> : <PhoneAndroidIcon />}
  </IconButton>
</Tooltip>
          <Stack spacing={isMobile ? 1 : 0}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Stack direction="row" alignItems="center" spacing={isMobile ? 1 : 2}>
                <IconButton
                  onClick={() => navigate("/professional/automations")}
                  size={isMobile ? "small" : "medium"}
                  sx={{ bgcolor: "#F3F4F6", "&:hover": { bgcolor: "#E5E7EB" } }}
                >
                  <KeyboardArrowLeftIcon fontSize={isMobile ? "small" : "medium"} />
                </IconButton>
                <Typography sx={{ fontWeight: 600, fontSize: isMobile ? "14px" : "16px", fontFamily: 'Inter' }}>
                  Automation Details
                </Typography>
              </Stack>

              {/* Desktop: Save Template + Update in same row */}
              {!isMobile && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <Tooltip title="Save current flow as template" arrow placement="top">
                    <span>
                      <Button
                        variant="outlined"
                        size="medium"
                        onClick={() => setSaveTemplateDialogOpen(true)}
                        startIcon={<BookmarkBorderIcon sx={{ fontSize: '18px !important' }} />}
                        disabled={flowNodes.length === 0}
                        sx={{
                          textTransform: "none",
                          fontFamily: 'Inter',
                          fontSize: "13px",
                          fontWeight: 600,
                          borderRadius: 2,
                          borderColor: "#F59E0B",
                          color: "#D97706",
                          whiteSpace: "nowrap",
                          lineHeight: 1.5,
                          "&:hover": {
                            borderColor: "#D97706",
                            bgcolor: "rgba(245, 158, 11, 0.04)",
                          },
                          "&.Mui-disabled": {
                            borderColor: "#E2E8F0",
                            color: "#94A3B8",
                          },
                        }}
                      >
                        Save as Template
                      </Button>
                    </span>
                  </Tooltip>

                  <Tooltip
                    title={!hasChanges ? "Make changes to update automation" : ""}
                    arrow
                    placement="top"
                  >
                    <span>
                      <Button
                        variant="contained"
                        size="medium"
                        onClick={() => setConfDialogOpen(true)}
                        startIcon={<CheckCircleIcon sx={{ fontSize: '18px !important' }} />}
                        disabled={!dmMessage.trim() || !hasChanges}
                        sx={{
                          textTransform: "none",
                          fontFamily: 'Inter',
                          fontSize: "14px",
                          fontWeight: 600,
                          borderRadius: 2,
                          lineHeight: 1.5,
                          background: dmMessage.trim() && hasChanges
                            ? "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)"
                            : "linear-gradient(135deg, #E2E8F0 0%, #CBD5E1 100%)",
                          color: dmMessage.trim() && hasChanges ? "white" : "#94A3B8",
                          "&:hover": {
                            background: dmMessage.trim() && hasChanges
                              ? "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)"
                              : "linear-gradient(135deg, #E2E8F0 0%, #CBD5E1 100%)",
                          },
                          "&.Mui-disabled": {
                            background: "linear-gradient(135deg, #E2E8F0 0%, #CBD5E1 100%)",
                            color: "#94A3B8",
                          }
                        }}
                      >
                        Update
                      </Button>
                    </span>
                  </Tooltip>
                </Stack>
              )}

              {/* Mobile: Update button in row 1 next to title */}
              {isMobile && (
                <Tooltip
                  title={!hasChanges ? "Make changes to update automation" : ""}
                  arrow
                  placement="top"
                >
                  <span>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => setConfDialogOpen(true)}
                      startIcon={<CheckCircleIcon sx={{ fontSize: '16px !important' }} />}
                      disabled={!dmMessage.trim() || !hasChanges}
                      sx={{
                        textTransform: "none",
                        fontFamily: 'Inter',
                        fontSize: "12px",
                        fontWeight: 600,
                        borderRadius: 2,
                        lineHeight: 1.5,
                        background: dmMessage.trim() && hasChanges
                          ? "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)"
                          : "linear-gradient(135deg, #E2E8F0 0%, #CBD5E1 100%)",
                        color: dmMessage.trim() && hasChanges ? "white" : "#94A3B8",
                        "&:hover": {
                          background: dmMessage.trim() && hasChanges
                            ? "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)"
                            : "linear-gradient(135deg, #E2E8F0 0%, #CBD5E1 100%)",
                        },
                        "&.Mui-disabled": {
                          background: "linear-gradient(135deg, #E2E8F0 0%, #CBD5E1 100%)",
                          color: "#94A3B8",
                        }
                      }}
                    >
                      Update
                    </Button>
                  </span>
                </Tooltip>
              )}
            </Stack>

            {/* Mobile: Save as Template in row 2 */}
            {isMobile && (
              <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
                <Tooltip title="Save current flow as template" arrow placement="top">
                  <span>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => setSaveTemplateDialogOpen(true)}
                      startIcon={<BookmarkBorderIcon sx={{ fontSize: '16px !important' }} />}
                      disabled={flowNodes.length === 0}
                      sx={{
                        textTransform: "none",
                        fontFamily: 'Inter',
                        fontSize: "12px",
                        fontWeight: 600,
                        borderRadius: 2,
                        borderColor: "#F59E0B",
                        color: "#D97706",
                        whiteSpace: "nowrap",
                        lineHeight: 1.5,
                        "&:hover": {
                          borderColor: "#D97706",
                          bgcolor: "rgba(245, 158, 11, 0.04)",
                        },
                        "&.Mui-disabled": {
                          borderColor: "#E2E8F0",
                          color: "#94A3B8",
                        },
                      }}
                    >
                      Save as Template
                    </Button>
                  </span>
                </Tooltip>
              </Stack>
            )}
          </Stack>
          </>
        ) : (
           <>
           {/* Phone Simulator Toggle Button - Fixed Position */}
<Tooltip title={showPhoneSimulator ? "Hide Preview" : "Show Preview"} placement="left">
  <IconButton
    onClick={() => setShowPhoneSimulator(!showPhoneSimulator)}
    sx={{
      position: "fixed",
      right: isMobile ? (showPhoneSimulator ? 'calc(40vh + 56px)' : 14) : (showPhoneSimulator ? 'calc(40vh + 56px)' : 24),
      top: isMobile? 146 : 100,
      zIndex: 1200,
      bgcolor: "white",
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      transition: "all 0.3s ease",
      "&:hover": {
        bgcolor: "#F3F4F6",
        transform: "scale(1.05)",
      },
    }}
  >
    {showPhoneSimulator ? <VisibilityOffIcon /> : <PhoneAndroidIcon />}
  </IconButton>
</Tooltip>
          <Stack spacing={isMobile ? 1 : 0}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Stack direction="row" alignItems="center" spacing={isMobile ? 1 : 2}>
                <IconButton
                  onClick={() => navigate("/professional/automations")}
                  size={isMobile ? "small" : "medium"}
                  sx={{ bgcolor: "#F3F4F6", "&:hover": { bgcolor: "#E5E7EB" } }}
                >
                  <KeyboardArrowLeftIcon fontSize={isMobile ? "small" : "medium"} />
                </IconButton>
                <Typography sx={{ fontWeight: 600, fontSize: isMobile ? "14px" : "16px", fontFamily: 'Inter' }}>
                  Setup Automation
                </Typography>
              </Stack>

              {/* Desktop: all buttons in same row */}
              {!isMobile && (
                <Stack direction="row" spacing={1} alignItems="center">
                  {/* Use Template Button */}
                  <Tooltip title="Use a saved template" arrow placement="top">
                    <Button
                      variant="outlined"
                      size="medium"
                      onClick={() => setTemplateDialogOpen(true)}
                      startIcon={<ContentCopyIcon sx={{ fontSize: '18px !important' }} />}
                      sx={{
                        textTransform: "none",
                        fontFamily: 'Inter',
                        fontSize: "13px",
                        fontWeight: 600,
                        borderRadius: 2,
                        borderColor: "#7C3AED",
                        color: "#7C3AED",
                        whiteSpace: "nowrap",
                        lineHeight: 1.5,
                        "&:hover": {
                          borderColor: "#6D28D9",
                          bgcolor: "rgba(124, 58, 237, 0.04)",
                        },
                      }}
                    >
                      Use Template
                    </Button>
                  </Tooltip>

                  {/* Save as Template Button */}
                  <Tooltip title="Save current flow as template" arrow placement="top">
                    <span>
                      <Button
                        variant="outlined"
                        size="medium"
                        onClick={() => setSaveTemplateDialogOpen(true)}
                        startIcon={<BookmarkBorderIcon sx={{ fontSize: '18px !important' }} />}
                        disabled={flowNodes.length === 0}
                        sx={{
                          textTransform: "none",
                          fontFamily: 'Inter',
                          fontSize: "13px",
                          fontWeight: 600,
                          borderRadius: 2,
                          borderColor: "#F59E0B",
                          color: "#D97706",
                          whiteSpace: "nowrap",
                          lineHeight: 1.5,
                          "&:hover": {
                            borderColor: "#D97706",
                            bgcolor: "rgba(245, 158, 11, 0.04)",
                          },
                          "&.Mui-disabled": {
                            borderColor: "#E2E8F0",
                            color: "#94A3B8",
                          },
                        }}
                      >
                        Save as Template
                      </Button>
                    </span>
                  </Tooltip>

                  {/* Launch Button */}
                  <Tooltip title="" arrow placement="top">
                    <span>
                      <Button
                        variant="contained"
                        size="medium"
                        onClick={() => setConfDialogOpen(true)}
                        startIcon={<RocketLaunchIcon sx={{ fontSize: '18px !important' }} />}
                        disabled={!dmMessage.trim()}
                        sx={{
                          textTransform: "none",
                          fontFamily: 'Inter',
                          fontSize: "14px",
                          fontWeight: 600,
                          borderRadius: 2,
                          lineHeight: 1.5,
                          background: dmMessage.trim()
                            ? "linear-gradient(135deg, #10B981 0%, #059669 100%)"
                            : "linear-gradient(135deg, #E2E8F0 0%, #CBD5E1 100%)",
                          color: dmMessage.trim() ? "white" : "#94A3B8",
                          "&:hover": {
                            background: dmMessage.trim()
                              ? "linear-gradient(135deg, #059669 0%, #047857 100%)"
                              : "linear-gradient(135deg, #E2E8F0 0%, #CBD5E1 100%)",
                          },
                          "&.Mui-disabled": {
                            background: "linear-gradient(135deg, #E2E8F0 0%, #CBD5E1 100%)",
                            color: "#94A3B8",
                          }
                        }}
                      >
                        Launch Now
                      </Button>
                    </span>
                  </Tooltip>
                </Stack>
              )}

              {/* Mobile: Launch Now in row 1 next to title */}
              {isMobile && (
                <span>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => setConfDialogOpen(true)}
                    startIcon={<RocketLaunchIcon sx={{ fontSize: '16px !important' }} />}
                    disabled={!dmMessage.trim()}
                    sx={{
                      textTransform: "none",
                      fontFamily: 'Inter',
                      fontSize: "12px",
                      fontWeight: 600,
                      borderRadius: 2,
                      lineHeight: 1.5,
                      background: dmMessage.trim()
                        ? "linear-gradient(135deg, #10B981 0%, #059669 100%)"
                        : "linear-gradient(135deg, #E2E8F0 0%, #CBD5E1 100%)",
                      color: dmMessage.trim() ? "white" : "#94A3B8",
                      "&:hover": {
                        background: dmMessage.trim()
                          ? "linear-gradient(135deg, #059669 0%, #047857 100%)"
                          : "linear-gradient(135deg, #E2E8F0 0%, #CBD5E1 100%)",
                      },
                      "&.Mui-disabled": {
                        background: "linear-gradient(135deg, #E2E8F0 0%, #CBD5E1 100%)",
                        color: "#94A3B8",
                      }
                    }}
                  >
                    Launch Now
                  </Button>
                </span>
              )}
            </Stack>

            {/* Mobile: Use Template + Save as Template in row 2 */}
            {isMobile && (
              <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
                <Tooltip title="Use a saved template" arrow placement="top">
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => setTemplateDialogOpen(true)}
                    startIcon={<ContentCopyIcon sx={{ fontSize: '16px !important' }} />}
                    sx={{
                      textTransform: "none",
                      fontFamily: 'Inter',
                      fontSize: "12px",
                      fontWeight: 600,
                      borderRadius: 2,
                      borderColor: "#7C3AED",
                      color: "#7C3AED",
                      whiteSpace: "nowrap",
                      lineHeight: 1.5,
                      "&:hover": {
                        borderColor: "#6D28D9",
                        bgcolor: "rgba(124, 58, 237, 0.04)",
                      },
                    }}
                  >
                    Use Template
                  </Button>
                </Tooltip>

                <Tooltip title="Save current flow as template" arrow placement="top">
                  <span>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => setSaveTemplateDialogOpen(true)}
                      startIcon={<BookmarkBorderIcon sx={{ fontSize: '16px !important' }} />}
                      disabled={flowNodes.length === 0}
                      sx={{
                        textTransform: "none",
                        fontFamily: 'Inter',
                        fontSize: "12px",
                        fontWeight: 600,
                        borderRadius: 2,
                        borderColor: "#F59E0B",
                        color: "#D97706",
                        whiteSpace: "nowrap",
                        lineHeight: 1.5,
                        "&:hover": {
                          borderColor: "#D97706",
                          bgcolor: "rgba(245, 158, 11, 0.04)",
                        },
                        "&.Mui-disabled": {
                          borderColor: "#E2E8F0",
                          color: "#94A3B8",
                        },
                      }}
                    >
                      Save as Template
                    </Button>
                  </span>
                </Tooltip>
              </Stack>
            )}
          </Stack>
          </>


        )}
      </Box>

      {/* ============ ZOOM/PAN WRAPPER STARTS ============ */}
<Box sx={{
   display: "flex",
  alignItems: "center",
  justifyContent: "center",
}}>

{/* 1. Desktop PhoneSimulator - side panel */}
        {showPhoneSimulator && !isMobile && (
          <PhoneSimulator 
            dmMessage={dmMessage}
            buttonText={buttonText}
            flowNodes={flowNodes}
            theme={theme}
            isMobileDialog={false}
          />
        )}

        {/* 2. Mobile PhoneSimulator - Dialog */}
        <Dialog
          open={showPhoneSimulator && isMobile}
          onClose={() => setShowPhoneSimulator(false)}
          fullScreen
          PaperProps={{
            sx: {
              bgcolor: '#F8FAFC',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              p: 2,
            }
          }}
        >
          <Box sx={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}>
            <IconButton
              onClick={() => setShowPhoneSimulator(false)}
              sx={{ bgcolor: 'white', boxShadow: 2, '&:hover': { bgcolor: '#f5f5f5' } }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
          <Typography sx={{ mb: 2, fontWeight: 600, fontSize: isMobile ? '15px' : '18px', fontFamily: 'Inter' }}>
            Automation Preview
          </Typography>
          <PhoneSimulator 
            dmMessage={dmMessage}
            buttonText={buttonText}
            flowNodes={flowNodes}
            theme={theme}
            isMobileDialog={true}
          />
        </Dialog>

    <TransformWrapper
     initialScale={1}
     minScale={0.3}
     maxScale={3}
     onInit={(utils) => {
       if (isMobile) {
         utils.centerView(0.7, 0); 
       } else {
         utils.centerView(0.8, 0); 
       }
     }}
     wheel={{ step: 0.1 }}
     panning={{
       disabled: false,
       velocityDisabled: false,
       excluded: ["input", "textarea"],
     }}
     doubleClick={{ disabled: true }}
     limitToBounds={false}
     centerZoomedOut={false}
   >



        <>
          {/* <ZoomControls /> */}
          
        <TransformComponent
                   wrapperStyle={{
                     height: '100%',
                     minWidth: '200vw'
                   }}
                   contentStyle={{
                     minWidth: "max-content",
                   }}
                 >
                   {/* Main Content */}
                   <Box
                     sx={{
                       minWidth: "max-content",
                       justifyContent : 'center',
                       px: { xs: 2, sm: 3, md: 2 },
                       py: { xs: 4, md: 4 },
                     }}
                   >

        <Stack spacing={0} alignItems="center">
          {/* 1. Post Thumbnail */}
          <Card
            elevation={0}
            sx={{
              width: "100%",
              maxWidth: 400,
              borderRadius: 3,
              overflow: "hidden",
              border: "2px solid",
              borderColor: "grey.200",
            }}
          >
            {data.thumbnail ? (
              <CardMedia
                component="img"
                image={data.thumbnail}
                alt={data.caption || "Post"}
                sx={{ aspectRatio: "1 / 1", objectFit: "cover" }}
              />
            ) : (
              <Box
                sx={{
                  aspectRatio: "1 / 1",
                  bgcolor: "grey.100",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  No thumbnail
                </Typography>
              </Box>
            )}
            <CardContent sx={{ p: 2 }}>
              <Typography
                variant="body2"
                sx={{
                  color: "#475569",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {data.caption?.trim() || "No caption"}
              </Typography>
            </CardContent>
          </Card>

          {/* Arrow */}
          <Box sx={{ py: 2 }}>
            <ArrowDownwardIcon sx={{ fontSize: 32, color: "#8B5CF6" }} />
          </Box>

       <Box sx={{ maxWidth: 600, mx: "auto", p: 3 }}>
      {/* Keywords Input */}
      <Box
        sx={{
          p: 3,
          borderRadius: "16px",
          border: "2px solid #8B5CF6",
          bgcolor: "rgba(139, 92, 246, 0.1)",
          backdropFilter: "blur(10px)",
          mb: 3,
        }}
      >
        <Typography sx={{fontFamily : 'Inter', fontWeight: 600, fontSize: 20, mb: 0.5 }}>
          Keywords
        </Typography>
        <Typography color="textSecondary" mb={1} sx={{ fontFamily : 'Inter', fontSize : '14px'}}>
        The automation will trigger when a comment includes the following specific keywords.
        </Typography>
        <TextField
          fullWidth
          size="small"
          placeholder="Type a keyword and hit Enter"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          InputProps={{
            endAdornment: inputValue && (
              <InputAdornment position="end">
                <IconButton onClick={handleAddKeyword} edge="end" size="small" aria-label="add keyword">
                  +
                </IconButton>
              </InputAdornment>
            ),
          }}
        />

         <Typography
      sx={{
        fontFamily: "Inter",
        fontSize: "14px",
        color: "text.secondary",
        opacity: 0.8,
        mt: 0.5
      }}
    >
      Keywords are not case-sensitive, e.g. "Hello" and "hello" are recognized as the same.
    </Typography>

        <Stack direction="row" spacing={1} mt={2} flexWrap="wrap">
        {keywords.map((keyword) => (
  <Chip
    key={keyword}
    label={keyword}
    onDelete={() => handleDeleteKeyword(keyword)}
    sx={{
      mb: 1,
      backgroundColor: "#37353E",        // custom bg
      color: "#FFFFFF",  
      fontFamily: 'Inter',                // text color
      fontWeight: 500,                   // bold
      fontSize: "14px",                  // custom font size
      padding: "6px 6px",               // 🔥 custom padding for bigger chip
      borderRadius: "8px",               // smoother corners

      // delete (x) icon color
      "& .MuiChip-deleteIcon": {
        color: "#FFFFFF",
        ml: 0.5,
        "&:hover": {
          color: "#E62727",
        }
      }
    }}
  />
))}

        </Stack>
      </Box>

    


      {/* Arrow Down */}
      <Box sx={{ display: "flex", justifyContent: "center", mb: 3 }}>
        <ArrowDownwardIcon sx={{ fontSize: 36, color: "#8B5CF6" }} />
      </Box>

      {/* Reply to Comment */}
    <Box
      sx={{
        p: 3,
        borderRadius: "16px",
        border: "2px solid #8B5CF6",
        bgcolor: "rgba(139, 92, 246, 0.1)",
        backdropFilter: "blur(10px)",
        mb: 4,
      }}
    >
      <Typography sx={{ fontFamily: "Inter", fontWeight: 600, fontSize: 20, mb: 0.5 }}>
        Reply to a comment
      </Typography>

      <Typography color="textSecondary" mb={1} sx={{ fontFamily: "Inter", fontSize: "14px" }}>
        Would you like to reply to the comments as well?
      </Typography>

      <RadioGroup
        row
        value={isReplyAvailable ? "yes" : "no"}
        onChange={(e) => {
          const on = e.target.value === "yes";
          setIsReplyAvailable(on);
          if (!on) setExpanded(false);
        }}
        sx={{ mb: 2 }}
      >
        <FormControlLabel value="yes" control={<Radio />} label="Yes" />
        <FormControlLabel value="no" control={<Radio />} label="No" />
      </RadioGroup>

      {isReplyAvailable && (
        <>
          {/* Single-line description with collapse icon on the right (closed by default) */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              p: 1,
              mb: 1,
              gap: 2
            }}
          >
              <Typography color="text.secondary" sx={{ fontFamily : 'Inter', fontSize : '14px'}}>
                Below 3 replies will be sent in a random order so that your replies don't look like a bot.
                <br />
              </Typography>

            <Divider sx={{ mb: 2 }} />

            <IconButton
              onClick={() => setExpanded(s => !s)}
              aria-label={expanded ? "collapse" : "expand"}
              size="small"
              sx={{
                transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 200ms ease",
                background: '#8B5CF6'
              }}
            >
              <ExpandMoreIcon />
            </IconButton>
          </Box>

          {/* Collapsible description + three reply fields */}
          <Collapse in={expanded} timeout="auto" unmountOnExit>

            <Stack spacing={2} mt={1}>
              <TextField
                label="Reply 1"
                fullWidth
                size="small"
                value={replies[0]}
                onChange={(e) => handleReplyChange(0, e.target.value)}
              />
              <TextField
                label="Reply 2"
                fullWidth
                size="small"
                value={replies[1]}
                onChange={(e) => handleReplyChange(1, e.target.value)}
              />
              <TextField
                label="Reply 3"
                fullWidth
                size="small"
                value={replies[2]}
                onChange={(e) => handleReplyChange(2, e.target.value)}
              />
            </Stack>
          </Collapse>
        </>
      )}
    </Box>

      {/* Arrow Down to next block can be added similarly */}
    </Box>


      {/* Arrow Down */}
      <Box sx={{ display: "flex", justifyContent: "center", mb: 3 }}>
        <ArrowDownwardIcon sx={{ fontSize: 36, color: "#8B5CF6" }} />
      </Box>

          {/* 2. Initial DM */}
          <Card
            elevation={0}
            sx={{
              width: "100%",
              maxWidth: 600,
              p: 3,
              borderRadius: 3,
              border: "2px solid",
              borderColor: "#8B5CF6",
              bgcolor: "white",
            }}
          >
            <Stack direction="row" spacing={2} alignItems="flex-start" mb={2}>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 2,
                  bgcolor: "#8B5CF6",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <SendIcon />
              </Box>
              <Box flex={1}>
                <Typography sx={{fontFamily: 'Inter', fontWeight: 600, fontSize: "20px", mb: 0.5 }}>
                  Initial DM Message
                </Typography>
                <Typography sx={{ color: "#64748B", mb: 1, fontFamily : 'Inter', fontSize : '14px' }}>
                  This message will be sent to users who comment
                </Typography>
              </Box>
            </Stack>

            <Stack spacing={2}>
              <TextField
                fullWidth
                multiline
                rows={3}
                placeholder="Write your DM message..."
                value={dmMessage}
                onChange={(e) => setDmMessage(e.target.value)}
              />
              <TextField
                fullWidth
                size="small"
                label="Button Text"
                placeholder="e.g., Send Link"
                value={buttonText}
                onChange={(e) => setButtonText(e.target.value)}
              />
            </Stack>
          </Card>

          {/* Arrow */}
          <Box sx={{ py: 2 }}>
           
      {/* Arrow Down */}
      <Box sx={{ display: "flex", justifyContent: "center", mb: 3 }}>
        <ArrowDownwardIcon sx={{ fontSize: 36, color: "#8B5CF6" }} />
      </Box>
            <Typography
              variant="caption"
              sx={{
                display: "block",
                textAlign: "center",
                color: "#64748B",
                mt: 1,
                fontWeight: 600,
              }}
            >
              When user clicks "{buttonText}"
            </Typography>
          </Box>

       {/* 3. Flow Nodes */}
{flowNodes.map((node, index) => (
  <Box key={node.id} sx={{ width: "100%" }}>
    {renderNode(node)}
    {node.type !== "followCheck" &&
      node.type !== "quickReply" &&
      index < flowNodes.length - 1 && (
        <Box sx={{ py: 2, textAlign: "center" }}>
          <ArrowDownwardIcon sx={{ fontSize: 32, color: "#8B5CF6" }} />
        </Box>
      )}
  </Box>
))}

{/* Add Action Button - Only show if no Follow Check, Quick Reply, or Finishing Message exists */}
{flowNodes.length > 0 && !isFollowCheckUsed && !hasQuickReplyInMainFlow && !hasFinishingMessageInMainFlow && (
  <Button
    variant="outlined"
    startIcon={<AddCircleOutlineIcon />}
    onClick={() => {
      setActionContext(null);
      resetNodeConfig();
      setDialogOpen(true);
    }}
    sx={{
      textTransform: "none",
      borderStyle: "dashed",
      color: "#8B5CF6",
      borderColor: "#8B5CF6",
      "&:hover": {
        bgcolor: "#F5F3FF",
        borderColor: "#8B5CF6",
      },
    }}
  >
    Add Action
  </Button>
)}



          {/* Add Action Button - Only show if no Follow Check, Quick Reply, or Finishing Message exists */}
{!isFollowCheckUsed && !hasQuickReplyInMainFlow && !hasFinishingMessageInMainFlow && (
  <Button
    variant="outlined"
    size="large"
    startIcon={<AddCircleOutlineIcon />}
    onClick={() => {
      setActionContext(null);
      setDialogOpen(true);
    }}
    sx={{
      width: "100%",
      maxWidth: 600,
      py: 2,
      mt: flowNodes.length > 0 ? 2 : 0,
      borderRadius: 3,
      borderStyle: "dashed",
      borderWidth: 2,
      borderColor: "#8B5CF6",
      color: "#8B5CF6",
      textTransform: "none",
      fontSize: "16px",
      fontWeight: 600,
      "&:hover": {
        borderWidth: 2,
        bgcolor: "#F5F3FF",
      },
    }}
  >
    Add Action
  </Button>
)}


        </Stack>
               </Box>
          </TransformComponent>
        </>
      </TransformWrapper>

</Box>
      {/* Action Selection Dialog */}
    <Dialog
      open={dialogOpen}
      onClose={() => { setDialogOpen(false); setSelectedNodeType(null); setActionContext(null); }}
      maxWidth="lg"
      fullWidth={!isMobile}
      fullScreen={false}
      PaperProps={{
        sx: isMobile
          ? {
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              m: 0,
              width: "100%",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              maxHeight: "80vh", // leaves a little space at top
              pointerEvents: "auto",
            }
          : {
              borderRadius: 3,
            },
      }}
    >
        <DialogTitle>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography sx={{ fontWeight: 600, fontSize: isMobile ? "16px" : "18px", fontFamily : 'Inter' }}>
              {selectedNodeType ? "" : "Choose Action Type"}
            </Typography>
            <IconButton
              size="small"
              onClick={() => {
                setDialogOpen(false);
                setSelectedNodeType(null);
                setActionContext(null);
              }}
            >
              <CloseIcon />
            </IconButton>
          </Stack>
        </DialogTitle>

        <DialogContent sx={{ overflowY: "auto" }}>
          {!selectedNodeType ? (
            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              {getAvailableActionTypes().map((action) => (
                <Grid size={{ xs: 12, sm : 6, md: 4 }} key={action.type}>
                  <Card
                    elevation={0}
                    sx={{
                      border: "2px solid",
                      borderColor: action.color,
                      bgcolor: action.bgColor,
                      borderRadius: 3,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      "&:hover": {
                        transform: "translateY(-4px)",
                        boxShadow: 3,
                      },
                    }}
                    onClick={() => handleActionSelect(action.type)}
                  >
                    <CardContent sx={{ p: 3 }}>
                      <Stack spacing={2}>
                        <Box
                          sx={{
                            width: 56,
                            height: 56,
                            borderRadius: 2,
                            bgcolor: action.color,
                            color: "white",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {action.icon}
                        </Box>
                        <Box>
                          <Typography
                            sx={{ fontWeight: 700, fontSize: "16px", mb: 0.5 }}
                          >
                            {action.title}
                          </Typography>
                          <Typography variant="body2" sx={{ color: "#64748B" }}>
                            {action.description}
                          </Typography>
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          ) : (
            <Box sx={{ mt: 1 }}>{renderDialogContent()}</Box>
          )}
        </DialogContent>

        {selectedNodeType && (
          <DialogActions sx={{ p: 3, pt: 0,
            position: isMobile ? "sticky" : "static",
    bottom: 0,
    bgcolor: "background.paper",
    borderTop: isMobile ? "1px solid #eee" : "none",
           }}>
            <Button
              onClick={() => setSelectedNodeType(null)}
              sx={{ textTransform: "none", color: "#64748B" }}
            >
              Cancel
            </Button>
          <Button
              variant="contained"
              onClick={() => handleAddNode(selectedNodeType)}
              sx={{ textTransform: "none" }}
              disabled={isUploading} // Disable while uploading
            >
              {isUploading ? "Uploading..." : (selectedNodeType === "downloadFile" ? "Upload & Save" : "Save")}
            </Button>
          </DialogActions>
        )}
      </Dialog>


       {/* CONFIRMATION DIALOG */}
           <Dialog open={confDialogOpen} onClose={() => setConfDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ color: isEditMode ? 'primary.main' : 'error.main', fontWeight: 700 }}>
          {isEditMode ? "Confirm Update" : "Confirm Launch"}
        </DialogTitle>
        <DialogContent>
          {!isEditMode && (
            <Alert severity="warning" sx={{ mb: 2 }}>
            Once an automation is launched, it can be edited while active. You may stop or delete it at any time.
            </Alert>
          )}
          {isEditMode && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Your automation will be updated with the new configuration. You may Edit, Stop or Delete any time.
            </Alert>
          )}
          <Typography variant="body2">
            {isEditMode 
              ? "Please review your changes and click 'Update Now' to save, or go back to make more changes."
              : "Please review your automation flow and click 'Launch Now' to proceed, or go back to make changes."}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfDialogOpen(false)} color="inherit" sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button 
            variant="contained" 
            color={isEditMode ? "primary" : "error"} 
            onClick={handleLaunchAutomation} 
            startIcon={isEditMode ? <CheckCircleIcon /> : <RocketLaunchOutlinedIcon />} 
            sx={{ textTransform: 'none' }}
          >
            {isEditMode ? "Update Now" : "Launch Now"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ==================== SAVE AS TEMPLATE DIALOG ==================== */}
      <Dialog open={saveTemplateDialogOpen} onClose={() => { setSaveTemplateDialogOpen(false); setTemplateName(""); }} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, fontFamily: 'Inter', fontSize: '16px' }}>
          Save as Template
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2, color: '#64748B', fontFamily: 'Inter' }}>
            Save your current automation flow as a reusable template. You can apply it to future posts.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="Template Name"
            placeholder="e.g., Lead Magnet Flow, Welcome DM..."
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveAsTemplate(); }}
            sx={{ mt: 1 }}
            inputProps={{ maxLength: 50 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setSaveTemplateDialogOpen(false); setTemplateName(""); }} color="inherit" sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveAsTemplate}
            disabled={!templateName.trim() || savingTemplate}
            startIcon={savingTemplate ? <CircularProgress size={16} color="inherit" /> : <BookmarkBorderIcon />}
            sx={{
              textTransform: 'none',
              background: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
              "&:hover": { background: "linear-gradient(135deg, #D97706 0%, #B45309 100%)" },
              "&.Mui-disabled": { background: "#E2E8F0", color: "#94A3B8" },
            }}
          >
            {savingTemplate ? "Saving..." : "Save Template"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ==================== USE TEMPLATE DIALOG ==================== */}
      <Dialog open={templateDialogOpen} onClose={() => setTemplateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, fontFamily: 'Inter', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>My Templates</span>
          <IconButton size="small" onClick={() => setTemplateDialogOpen(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {templates.length === 0 ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <ContentCopyIcon sx={{ fontSize: 48, color: '#CBD5E1', mb: 2 }} />
              <Typography sx={{ color: '#64748B', fontFamily: 'Inter', fontSize: '14px' }}>
                No templates saved yet
              </Typography>
              <Typography sx={{ color: '#94A3B8', fontFamily: 'Inter', fontSize: '12px', mt: 0.5 }}>
                Set up a flow and click "Save Template" to create one
              </Typography>
            </Box>
          ) : (
            <Stack spacing={0}>
              {templates.map((template) => (
                <Box
                  key={template._id}
                  sx={{
                    px: 2.5,
                    py: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid #F1F5F9',
                    transition: 'background 0.15s',
                    '&:hover': { bgcolor: '#F8FAFC' },
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: '14px', fontFamily: 'Inter', color: '#1E293B' }}>
                      {template.name}
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                      <Chip
                        label={`${(template.flowNodes || []).length} action${(template.flowNodes || []).length !== 1 ? 's' : ''}`}
                        size="small"
                        sx={{ fontSize: '11px', height: 22, bgcolor: '#EEF2FF', color: '#4F46E5' }}
                      />
                      {template.hasReply && (
                        <Chip label="Auto Reply" size="small" sx={{ fontSize: '11px', height: 22, bgcolor: '#F0FDF4', color: '#16A34A' }} />
                      )}
                    
                    </Stack>
                  </Box>
                  <Stack direction="row" spacing={0.5}>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => handleApplyTemplate(template)}
                      sx={{
                        textTransform: 'none',
                        fontSize: '12px',
                        fontWeight: 600,
                        fontFamily: 'Inter',
                        borderRadius: 1.5,
                        px: 2,
                        minWidth: 0,
                        background: "linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)",
                        "&:hover": { background: "linear-gradient(135deg, #6D28D9 0%, #5B21B6 100%)" },
                      }}
                    >
                      Apply
                    </Button>
                    <Tooltip title="Delete template" placement="top">
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteTemplate(template._id)}
                        sx={{ color: '#EF4444', '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.08)' } }}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </DialogContent>
      </Dialog>

      {/* Mobile Gesture Guide */}
      <Slide direction="up" in={showGestureGuide} mountOnEnter unmountOnExit>
        <Box
          sx={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1300,
            bgcolor: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(8px)',
            borderRadius: 3,
            px: 3,
            py: 2,
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1.5,
            minWidth: 240,
          }}
        >
          <Stack direction="row" spacing={3} alignItems="center">
            <Stack alignItems="center" spacing={0.5}>
              <PinchRounded sx={{ color: '#fff', fontSize: 28 }} />
              <Typography sx={{ color: '#fff', fontSize: 11, fontWeight: 500 }}>
                Pinch to zoom
              </Typography>
            </Stack>
            <Box sx={{ width: '1px', height: 32, bgcolor: 'rgba(255,255,255,0.2)' }} />
            <Stack alignItems="center" spacing={0.5}>
              <SwipeRounded sx={{ color: '#fff', fontSize: 28 }} />
              <Typography sx={{ color: '#fff', fontSize: 11, fontWeight: 500 }}>
                Swipe to navigate
              </Typography>
            </Stack>
          </Stack>
          <Button
            size="small"
            onClick={() => {
              setShowGestureGuide(false);
              localStorage.setItem('setup_gesture_guide_seen', 'true');
            }}
            sx={{
              color: 'rgba(255,255,255,0.7)',
              fontSize: 11,
              textTransform: 'none',
              minHeight: 'auto',
              py: 0,
              '&:hover': { color: '#fff', bgcolor: 'transparent' },
            }}
          >
            Got it
          </Button>
        </Box>
      </Slide>

      {/* Desktop Controls Guide */}
      <Fade in={showDesktopGuide} unmountOnExit>
        <Box
          sx={{
            position: 'fixed',
            bottom: 32,
            right: 32,
            zIndex: 1300,
            bgcolor: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(12px)',
            borderRadius: 3,
            px: 3.5,
            py: 2.5,
            boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            minWidth: 380,
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <Typography sx={{ color: '#fff', fontSize: 13, fontWeight: 600, letterSpacing: 0.3 }}>
            Canvas Controls
          </Typography>

          <Stack direction="row" spacing={4} alignItems="flex-start">
            {/* Mouse Column */}
            <Stack alignItems="center" spacing={1}>
              <MouseRounded sx={{ color: '#94a3b8', fontSize: 30 }} />
              <Typography sx={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>Mouse</Typography>
              <Stack spacing={0.5}>
                <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
                  Scroll Up &rarr; Zoom Out
                </Typography>
                <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
                  Scroll Down &rarr; Zoom In
                </Typography>
                <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
                  Click + Drag &rarr; Move
                </Typography>
              </Stack>
            </Stack>

            <Box sx={{ width: '1px', alignSelf: 'stretch', bgcolor: 'rgba(255,255,255,0.12)' }} />

            {/* Trackpad Column */}
            <Stack alignItems="center" spacing={1}>
              <TouchAppRounded sx={{ color: '#94a3b8', fontSize: 30 }} />
              <Typography sx={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>Trackpad</Typography>
              <Stack spacing={0.5}>
                <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
                  Two-finger &uarr; &rarr; Zoom Out
                </Typography>
                <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
                  Two-finger &darr; &rarr; Zoom In
                </Typography>
                <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>
                  Click + Drag &rarr; Move
                </Typography>
              </Stack>
            </Stack>
          </Stack>

          <Button
            size="small"
            onClick={() => {
              setShowDesktopGuide(false);
              localStorage.setItem('setup_desktop_gesture_guide_seen', 'true');
            }}
            sx={{
              color: 'rgba(255,255,255,0.7)',
              fontSize: 11,
              textTransform: 'none',
              minHeight: 'auto',
              py: 0.5,
              '&:hover': { color: '#fff', bgcolor: 'transparent' },
            }}
          >
            Got it
          </Button>
        </Box>
      </Fade>

    </Box>
  );
}

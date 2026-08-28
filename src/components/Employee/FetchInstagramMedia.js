import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  Box,
  Card,
  CardContent,
  CardMedia,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Stack,
  IconButton,
  Tabs,
  Tab,
  Dialog,
} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import WestOutlinedIcon from '@mui/icons-material/WestOutlined';
import InstagramIcon from '@mui/icons-material/Instagram';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary'; // Icon for Photos
import MovieCreationIcon from '@mui/icons-material/MovieCreation'; // Icon for Reels
import HistoryToggleOffIcon from '@mui/icons-material/HistoryToggleOff'; // Icon for Stories
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "react-toastify";

// --- Empty State ---
const NoMediaFound = ({ type }) => (
  <Box sx={{ py: 6, px: 3, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, border: "2px dashed", borderColor: "grey.300", borderRadius: 3, bgcolor: "grey.50", textAlign: "center", mt: 3 }}>
    <InstagramIcon sx={{ fontSize: 48, color: 'text.secondary' }} />
    <Typography variant="h6" fontWeight={600}>No {type} Found</Typography>
    <Typography variant="body2" color="text.secondary">
      We couldn't find any active {type.toLowerCase()} for this account.
    </Typography>
  </Box>
);

export default function FetchInstagramMedia() {
  // Data State
  const [items, setItems] = useState([]);
  const [after, setAfter] = useState(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // UI State
  const [activeTab, setActiveTab] = useState("reels"); // 'reels', 'stories', 'photos'
  const [playerOpen, setPlayerOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);

  const navigate = useNavigate();
  const location = useLocation();
  const { automationType, followUpType } = location.state || {};

  const baseUrl = "/api/usersOn/instagram";

  // --- Main Fetch Function ---
  const fetchMedia = async (opts = { reset: false }) => {
    const { reset } = opts;
    try {
      setLoading(true);
      if (reset) setError("");

      // --- DYNAMIC ENDPOINT SELECTION ---
      let endpoint = "";
      if (activeTab === "reels") endpoint = "/reels";
      else if (activeTab === "stories") endpoint = "/stories";
      else if (activeTab === "photos") endpoint = "/photos";
      
      const cursorToUse = reset ? null : after;
      const url = `${baseUrl}${endpoint}?${cursorToUse ? `after=${encodeURIComponent(cursorToUse)}` : ''}`;
      
      const res = await axios.get(url, { withCredentials: true, timeout: 20000 });
      
      const payload = res?.data || {};
      const newItems = Array.isArray(payload.data) ? payload.data : [];

      setItems((prev) => (reset ? newItems : [...prev, ...newItems]));
      setAfter(payload?.paging?.cursors?.after || null);
      setHasNext(Boolean(payload?.paging?.next));
      
      if (reset) setSelectedItem(null);

    } catch (err) {
      console.error(err);
      const apiMsg = err?.response?.data?.message || err?.message || "Failed to load media";
      setError(apiMsg);
      toast.error(apiMsg);
    } finally {
      setLoading(false);
    }
  };

  // --- Tab Change Handler ---
  const handleTabChange = (event, newValue) => {
    if (newValue === activeTab) return;
    setActiveTab(newValue);
    setItems([]); 
    setAfter(null);
    setHasNext(false);
    setSelectedItem(null);
    // Fetch will trigger via useEffect
  };

  useEffect(() => {
    fetchMedia({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleSetupAutomation = () => {
    if (!selectedItem) return;
    navigate(`/professional/automation/setup/${selectedItem.id}`, {
      state: { ...selectedItem, automationType, followUpType },
    });
  };

  // --- Render Logic ---
  const renderGrid = () => (
    <Box sx={{ 
      display: "grid", 
      gap: 2, 
      gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)", lg: "repeat(4, 1fr)" },
      mt: 3 
    }}>
      {items.map((m) => {
        const isSelected = selectedItem?.id === m.id;
        // Only show Play button for Reels/Video types
        const canPlay = m.media_type === 'VIDEO' || m.media_type === 'REEL';

        return (
          <Card
            key={m.id}
            variant="outlined"
            onClick={() => setSelectedItem(prev => prev?.id === m.id ? null : m)}
            sx={{
              position: 'relative',
              cursor: "pointer",
              outline: isSelected ? "3px solid" : "1px solid",
              outlineColor: isSelected ? "primary.main" : "divider",
              transition: "all 0.2s",
              "&:hover": { transform: "translateY(-2px)", boxShadow: 3 }
            }}
          >
             {/* Aspect Ratio: Stories are taller, others square */}
             <Box sx={{ position: "relative", aspectRatio: activeTab === 'stories' ? "9/16" : "1/1" }}>
                <CardMedia
                  component="img"
                  image={m.thumbnail_url || m.media_url}
                  alt="Media"
                  sx={{ width: '100%', height: '100%', objectFit: "cover" }}
                />
                
                {/* Play Button Overlay - Only if it's a video/reel */}
                {canPlay && (
                  <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", bgcolor: "rgba(0,0,0,0.2)" }}>
                     <IconButton 
                        onClick={(e) => { e.stopPropagation(); setCurrentItem(m); setPlayerOpen(true); }} 
                        sx={{ bgcolor: "rgba(0,0,0,0.5)", color: "white", "&:hover": { bgcolor: "rgba(0,0,0,0.7)" } }}
                     >
                        <PlayArrowIcon />
                     </IconButton>
                  </Box>
                )}

                {/* Multi-photo Indicator (Carousel) */}
                {m.media_type === 'CAROUSEL_ALBUM' && (
                    <Box sx={{ position: "absolute", top: 8, right: 8, bgcolor: "rgba(0,0,0,0.6)", borderRadius: 1, p: 0.5 }}>
                        <PhotoLibraryIcon sx={{ color: 'white', fontSize: 16 }} />
                    </Box>
                )}
             </Box>
             
             <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden'}}>
                   {m.caption || "No Caption"}
                </Typography>
             </CardContent>
          </Card>
        );
      })}
    </Box>
  );

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: "auto" }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Stack direction="row" gap={2} alignItems="center">
           <IconButton onClick={() => navigate("/professional/automations")}>
             <WestOutlinedIcon />
           </IconButton>
           <Typography variant="h5" fontWeight={600}>Select Media</Typography>
        </Stack>
        
        <Button 
          variant="contained" 
          disabled={!selectedItem} 
          onClick={handleSetupAutomation}
          sx={{ borderRadius: 10 }}
        >
          Setup Automation
        </Button>
      </Stack>

      {/* Tabs */}
      <Tabs 
        value={activeTab} 
        onChange={handleTabChange} 
        textColor="primary" 
        indicatorColor="primary"
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab icon={<MovieCreationIcon />} iconPosition="start" label="Reels" value="reels" />
        <Tab icon={<PhotoLibraryIcon />} iconPosition="start" label="Photos" value="photos" />
        {/* <Tab icon={<HistoryToggleOffIcon />} iconPosition="start" label="Stories" value="stories" /> */}
      </Tabs>

      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

      {/* Content */}
      {loading && items.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
           <CircularProgress />
        </Box>
      ) : items.length > 0 ? (
        renderGrid()
      ) : (
        !loading && <NoMediaFound type={activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} />
      )}

      {/* Load More */}
      {items.length > 0 && hasNext && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <Button onClick={() => fetchMedia({ reset: false })} disabled={loading} variant="outlined">
             {loading ? "Loading..." : "Load More"}
          </Button>
        </Box>
      )}

      {/* Video Player Modal */}
      <Dialog open={playerOpen} onClose={() => setPlayerOpen(false)} maxWidth="md" fullWidth>
         <Box sx={{ bgcolor: "black", display: 'flex', justifyContent: 'center' }}>
            {currentItem && (
               <video src={currentItem.media_url} controls autoPlay style={{ maxHeight: '80vh', maxWidth: '100%' }} />
            )}
         </Box>
      </Dialog>
    </Box>
  );
}
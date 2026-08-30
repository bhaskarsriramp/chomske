import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  Box,
  Card,
  CardContent,
  CardMedia,
  Typography,
  Button,
  Skeleton,
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
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import MovieCreationIcon from '@mui/icons-material/MovieCreation';
import SlowMotionVideoOutlinedIcon from '@mui/icons-material/SlowMotionVideoOutlined';
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "react-toastify";

// Helper — format date like "November 28th"
function getOrdinal(day) {
  if (day > 3 && day < 21) return "th";
  switch (day % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}
function formatDateOrdinal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const month = d.toLocaleString("default", { month: "long" });
  const day = d.getDate();
  return `${month} ${day}${getOrdinal(day)}`;
}

// Empty state
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
  const [cursor, setCursor] = useState(null); // composite cursor from /posts
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // UI State
  const [activeTab, setActiveTab] = useState("posts"); // 'posts' or 'stories'
  const [playerOpen, setPlayerOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);

  const navigate = useNavigate();
  const location = useLocation();
  const { automationType, followUpType } = location.state || {};

  const baseUrl = "/api/usersOn/instagram";

  // --- Utility: append unique items by id (preserve order newest-first)
  const appendUnique = (existing, incoming) => {
    const map = new Map();
    // keep existing first
    existing.forEach(i => map.set(i.id, i));
    // then incoming overwrite / add
    incoming.forEach(i => map.set(i.id, i));
    // convert map to array preserving insertion order but we need newest-first
    const arr = Array.from(map.values());
    // Sort by timestamp desc (safe)
    arr.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return arr;
  };

  // --- Main Fetch Function (uses unified /posts endpoint) ---
  const fetchMedia = async (opts = { reset: false }) => {
    const { reset } = opts;

    // prevent duplicate parallel calls
    if (loading) return;
    try {
      setLoading(true);
      if (reset) setError("");

      if (activeTab === "posts") {
        // if reset, clear cursor and request first page
        const cursorParam = reset ? null : cursor;
        const paramsStr = cursorParam ? `?cursor=${encodeURIComponent(cursorParam)}` : "";

        const res = await axios.get(`${baseUrl}/posts${paramsStr}`, { withCredentials: true, timeout: 25000 });
        const payload = res?.data || {};
        const newItems = Array.isArray(payload.data) ? payload.data : [];

        // backend should return compositeCursor OR paging
        const compositeCursor = payload.compositeCursor || null;
        const paging = payload.paging || null;

        // Determine next existence:
        const nextExists = Boolean(
          compositeCursor ||
          (paging && ((paging.reels && paging.reels.next) || (paging.photos && paging.photos.next)))
        );

        // If not reset, append but dedupe
        if (reset) {
          setItems(newItems);
        } else {
          // if compositeCursor is same as current cursor (or both null) then this is a repeated page -> treat as end
          if (compositeCursor && compositeCursor === cursor) {
            setHasNext(false);
            setLoading(false);
            return;
          }
          const merged = appendUnique(items, newItems);
          setItems(merged);
        }

        // Update cursor and hasNext logic:
        if (compositeCursor) {
          if (!reset && compositeCursor === cursor) {
            setHasNext(false);
          } else {
            setCursor(compositeCursor);
            setHasNext(Boolean(nextExists));
          }
        } else {
          setCursor(null);
          setHasNext(Boolean(nextExists));
        }

        if (reset) setSelectedItem(null);

      } else if (activeTab === "stories") {
        const cursorToUse = reset ? null : cursor;
        const url = `${baseUrl}/stories${cursorToUse ? `?after=${encodeURIComponent(cursorToUse)}` : ''}`;
        const res = await axios.get(url, { withCredentials: true, timeout: 20000 });

        const payload = res?.data || {};
        const newItems = Array.isArray(payload.data) ? payload.data : [];

        newItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        if (reset) setItems(newItems);
        else {
          const merged = appendUnique(items, newItems);
          setItems(merged);
        }

        setCursor(payload?.paging?.cursors?.after || null);
        setHasNext(Boolean(payload?.paging?.next));
        if (reset) setSelectedItem(null);
      }
    } catch (err) {
      console.error("Fetch media error:", err);
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
    setCursor(null);
    setHasNext(false);
    setSelectedItem(null);
    // fetch triggered by effect
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

  // --- Skeletons helper (renders N placeholder cards) ---
  const renderSkeletons = (count = 8) => (
    <Box sx={{
      display: "grid",
      gap: 2,
      gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)", lg: "repeat(4, 1fr)" },
      mt: 3
    }}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={`sk-${i}`} variant="outlined" sx={{ overflow: "hidden" }}>
          {/* image skeleton */}
          <Box sx={{ aspectRatio: activeTab === 'stories' ? "9/16" : "1/1", width: "100%" }}>
            <Skeleton variant="rectangular" width="100%" height="100%" />
          </Box>

          {/* caption skeleton area */}
          <CardContent sx={{ p: 1.25, "&:last-child": { pb: 1.25 } }}>
            <Skeleton variant="text" width="80%" height={18} />
            <Skeleton variant="text" width="40%" height={14} sx={{ mt: 0.5 }} />
          </CardContent>
        </Card>
      ))}
    </Box>
  );

  // --- Render Grid ---
  const renderGrid = () => (
    <Box sx={{
      display: "grid",
      gap: 2,
      px: 1,
      gridTemplateColumns: { 
      xs: "repeat(2, 1fr)", 
      sm: "repeat(2, 1fr)", 
      md: "repeat(3, 1fr)", 
      lg: "repeat(4, 1fr)" 
    },
      mt: 2
    }}>
      {items.map((m) => {
        const isSelected = selectedItem?.id === m.id;
        const canPlay = m.media_type === 'VIDEO' || m.media_type === 'REEL';
        const aspectRatio = activeTab === 'stories' ? "9/16" : "1/1";

        const captionExists = Boolean(m.caption && m.caption.trim().length > 0);

        return (
          <Card
            key={m.id}
            variant="outlined"
            onClick={() => setSelectedItem(prev => prev?.id === m.id ? null : m)}
            sx={{
              position: 'relative',
              cursor: "pointer",
              outline: isSelected ? "3px solid" : "1px solid",
              outlineColor: isSelected ? "#016B61" : "divider",
              transition: "all 0.2s",
              "&:hover": { transform: "translateY(-2px)", boxShadow: 3 }
            }}
          >
            <Box sx={{ position: "relative", aspectRatio }}>
              <CardMedia
                component="img"
                image={m.thumbnail_url || m.media_url}
                alt="Media"
                sx={{ width: '100%', height: '100%', objectFit: "cover" }}
              />

              {canPlay && (
                <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", bgcolor: "rgba(0,0,0,0.15)" }}>
                  <IconButton
                    onClick={(e) => { e.stopPropagation(); setCurrentItem(m); setPlayerOpen(true); }}
                    sx={{ bgcolor: "rgba(0,0,0,0.55)", color: "white", "&:hover": { bgcolor: "rgba(0,0,0,0.75)" } }}
                  >
                    <PlayArrowIcon />
                  </IconButton>
                </Box>
              )}

              {m.media_type === 'CAROUSEL_ALBUM' && (
                <Box sx={{ position: "absolute", top: 8, right: 8, bgcolor: "rgba(0,0,0,0.6)", borderRadius: 1, p: 0.5 }}>
                  <PhotoLibraryIcon sx={{ color: 'white', fontSize: 16 }} />
                </Box>
              )}
            </Box>

            <CardContent sx={{ p: 1.25, "&:last-child": { pb: 1.25 } }}>
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  minHeight: "3.4em",
                  justifyContent: captionExists ? "flex-start" : "center"
                }}
              >
                {captionExists && (
                  <Typography
                    sx={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      fontFamily: 'Inter',
                      fontWeight: 600,
                      fontSize: '14px'
                    }}
                  >
                    {m.caption}
                  </Typography>
                )}

                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: captionExists ? 0.5 : 0, fontFamily : 'Inter', fontSize: '14px', fontWeight : 400 }}
                >
                 Posted on: {formatDateOrdinal(m.timestamp)}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', maxWidth: 1400, mx: "auto", px: 1 }}>
      {/* Sticky Header + Tabs */}
      <Box sx={{ flexShrink: 0, pt: 1, bgcolor: '#FAFBFC', zIndex: 5 }}>
        {/* Header */}
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack direction="row" gap={2} alignItems="center">
            <IconButton onClick={() => navigate("/professional/automations")}>
              <WestOutlinedIcon />
            </IconButton>
            <Typography sx={{ fontFamily: 'Inter', fontSize : {xs: '14px', sm: '14px', md: '20px'}, fontWeight : 600 }}>Select Media</Typography>
          </Stack>

          <Button
            variant="contained"
            disabled={!selectedItem}
            onClick={handleSetupAutomation}
            sx={{ fontFamily: 'Inter', fontSize : {xs: '14px', sm: '14px', md: '14px'}, fontWeight : 600, borderRadius: 10, textTransform : 'none', background : '#016B61' }}
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
         sx={{
          borderBottom: 1,
          borderColor: "#E0E0E0", // keep normal bottom border if you want
          "& .MuiTabs-indicator": {
            backgroundColor: '#7132CA',   // 🔥 selected underline color
            height: "3px",                    // optional thickness
            borderRadius: "3px",              // optional rounded line
          }
        }}
      >
        {[
          { icon: <MovieCreationIcon />, label: "Posts/Reels", value: "posts" },
          { icon: <SlowMotionVideoOutlinedIcon />, label: "Stories", value: "stories" }
        ].map((t) => (
          <Tab
            key={t.value}
            icon={React.cloneElement(t.icon, {
              sx: {
                fontSize: 20,
                transition: "color 0.2s",
              }
            })}
            iconPosition="start"
            label={t.label}
            value={t.value}
            sx={{
              textTransform: "none",
              transition: "color 0.2s",

              "& .MuiTab-wrapper": {
                flexDirection: "row",
                gap: "6px",
                fontSize: "16px",
              },

              // 🔥 active tab text + icon color
              "&.Mui-selected": {
                color: "#7132CA !important",
              },

              // 🔥 active icon color (special selector)
              "&.Mui-selected svg": {
                color: "#7132CA !important",
              }
            }}
          />
        ))}
      </Tabs>
      </Box>

      {/* Scrollable Content Area */}
      <Box sx={{ flexGrow: 1, overflowY: 'auto', pb: 3, scrollbarWidth: 'thin' }}>
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

        {/* Content */}
        {loading && items.length === 0 ? (
          renderSkeletons(8)
        ) : items.length > 0 ? (
          renderGrid()
        ) : (
          !loading && <NoMediaFound type={activeTab === 'posts' ? 'Posts / Reels' : 'Stories'} />
        )}

        {/* Load More / End of List */}
        {items.length > 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
            {hasNext ? (
              <Button
                onClick={() => fetchMedia({ reset: false })}
                disabled={loading}
                sx={{ color: '#7132CA', textTransform : 'none', fontFamily : 'Inter', fontSize : '14px', border: '1px solid #7132CA'}}
              >
                {loading ? "Loading..." : "Load More"}
              </Button>
            ) : (
              <Button variant="outlined" disabled sx={{ color: '#7132CA', textTransform : 'none', fontFamily : 'Inter', fontSize : '14px'}}>
                End of List
              </Button>
            )}
          </Box>
        )}
      </Box>

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

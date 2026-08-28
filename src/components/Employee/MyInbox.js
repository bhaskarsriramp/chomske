import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  Box,
  Grid,
  Card,
  CardContent,
  CardActionArea,
  CircularProgress,
  Typography,
  Avatar,
  TextField,
  InputAdornment,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
  IconButton,
  useTheme,
  useMediaQuery,
  AppBar,
  Toolbar,
  Container,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Divider
} from "@mui/material";
import { 
  Search, 
  Handshake, 
  Chat, 
  ArrowBack
} from "@mui/icons-material";
import { toast } from "react-toastify";
import MyChatWindow from "./MyChatWindow";

const API_BASE = "/api";

function formatTime(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
}

function truncate(text = "", n = 50) {
  if (!text || text.length <= n) return text;
  return text.slice(0, n - 1) + "…";
}

function getCategoryChipProps(category) {
  switch (category) {
    case "Collaboration":
      return {
        label: "Collaboration",
        icon: <Handshake sx={{ fontSize: { xs: 14, sm: 16 } }} />,
        bgcolor: "#9c27b0",
        textColor: "#fff"
      };
    case "General":
      return {
        label: "General",
        icon: <Chat sx={{ fontSize: { xs: 12, sm: 14 } }} />,
        bgcolor: "#757575",
        textColor: "#fff"
      };
    default:
      return {
        label: "Uncategorized",
        icon: null,
        bgcolor: "#e0e0e0",
        textColor: "#666"
      };
  }
}

export default function MyInbox() {
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    setLoading(true);
    try {
      const res = await axios.post(
        `${API_BASE}/usersOn/influencer/messages`,
        { limit: 200, skip: 0 },
        { withCredentials: true }
      );
      
      if (!res.data?.ok) {
        toast.error("Failed to fetch conversations");
        setConversations([]);
      } else {
        setConversations(res.data.conversations || []);
      }
    } catch (err) {
      console.error("fetch conversations error:", err);
      toast.error("Unable to fetch conversations");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectConversation = (conv) => {
    setSelectedConv(conv);
  };

  const handleCategoryFilter = (event, newFilter) => {
    if (newFilter !== null) {
      setCategoryFilter(newFilter);
    }
  };

  const handleBackToList = () => {
    setSelectedConv(null);
  };

  const filteredConversations = conversations.filter(conv => {
    if (categoryFilter !== "all" && conv.category !== categoryFilter) {
      return false;
    }
    
    const searchLower = searchTerm.toLowerCase();
    return (
      conv.from_name?.toLowerCase().includes(searchLower) ||
      conv.text?.toLowerCase().includes(searchLower) ||
      conv.category?.toLowerCase().includes(searchLower)
    );
  });

  const categoryCounts = conversations.reduce((acc, conv) => {
    const cat = conv.category || "Uncategorized";
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  // Desktop: Split view with list on left and chat on right
  if (!isMobile) {
    return (
      <Box sx={{ display: "flex", height: "100vh", bgcolor: "#f5f5f5", overflow: "hidden" }}>
        {/* Left Sidebar - Conversations List */}
        <Paper
          elevation={2}
          sx={{
            width: { md: 380, lg: 420 },
            display: "flex",
            flexDirection: "column",
            borderRadius: 0,
            borderRight: "1px solid #e0e0e0",
            flexShrink: 0
          }}
        >
          {/* Header */}
          <Box 
            sx={{ 
              p: 2.5, 
              bgcolor: "#1976d2", 
              color: "white",
              position: "sticky",
              top: 0,
              zIndex: 1
            }}
          >
            <Typography fontWeight="bold">
              Messages
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.9, fontSize: "0.85rem" }}>
              {filteredConversations.length} conversation{filteredConversations.length !== 1 ? 's' : ''}
            </Typography>
          </Box>

          {/* Search Bar */}
          <Box sx={{ p: 2 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search conversations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search />
                  </InputAdornment>
                ),
              }}
            />
          </Box>

          {/* Category Filter */}
          <Box sx={{ px: 2, pb: 2 }}>
            <ToggleButtonGroup
              value={categoryFilter}
              exclusive
              onChange={handleCategoryFilter}
              size="small"
              fullWidth
              sx={{ 
                display: "flex",
                "& .MuiToggleButton-root": {
                  fontSize: "0.75rem",
                  py: 0.75,
                  textTransform: "none",
                  flex: 1,
                  "&.Mui-selected": {
                    bgcolor: "#1976d2",
                    color: "white",
                    "&:hover": {
                      bgcolor: "#1565c0"
                    }
                  }
                }
              }}
            >
              <ToggleButton value="all">
                All ({conversations.length})
              </ToggleButton>
              <ToggleButton value="Collaboration">
                <Handshake sx={{ fontSize: 14, mr: 0.5 }} />
                {categoryCounts.Collaboration || 0}
              </ToggleButton>
              <ToggleButton value="General">
                <Chat sx={{ fontSize: 14, mr: 0.5 }} />
                {categoryCounts.General || 0}
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Divider />

          {/* Conversation List */}
          <Box 
            sx={{ 
              flexGrow: 1, 
              overflow: "auto",
              WebkitOverflowScrolling: "touch",
              '&::-webkit-scrollbar': {
                width: '6px',
              },
              '&::-webkit-scrollbar-track': {
                backgroundColor: '#F3F4F6',
                borderRadius: '10px',
              },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: '#CBD5E1',
                borderRadius: '10px',
                '&:hover': {
                  backgroundColor: '#94A3B8',
                },
              },
              scrollbarWidth: 'thin',
              scrollbarColor: '#CBD5E1 #F3F4F6',
            }}
          >
            {loading ? (
              <Box display="flex" justifyContent="center" alignItems="center" sx={{ py: 4 }}>
                <CircularProgress />
              </Box>
            ) : filteredConversations.length === 0 ? (
              <Box sx={{ p: 3, textAlign: "center" }}>
                <Typography color="text.secondary">
                  {searchTerm || categoryFilter !== "all" 
                    ? "No conversations match your filters" 
                    : "No conversations found"}
                </Typography>
              </Box>
            ) : (
              <List disablePadding>
                {filteredConversations.map((conv) => {
                  const chipProps = getCategoryChipProps(conv.category);
                  
                  return (
                    <React.Fragment key={conv._id}>
                      <ListItemButton
                        selected={selectedConv?._id === conv._id}
                        onClick={() => handleSelectConversation(conv)}
                        sx={{
                          py: 2,
                          px: 2,
                          "&.Mui-selected": {
                            bgcolor: "#e3f2fd",
                            "&:hover": { bgcolor: "#bbdefb" }
                          }
                        }}
                      >
                        <Avatar 
                          sx={{ 
                            mr: 2, 
                            bgcolor: "#1976d2",
                            width: 48,
                            height: 48
                          }}
                        >
                          {(conv.from_name || "U")[0].toUpperCase()}
                        </Avatar>
                        <ListItemText
                          primary={
                            <Box display="flex" alignItems="center" justifyContent="space-between" gap={1}>
                              <Typography 
                                variant="subtitle2" 
                                fontWeight="600"
                                sx={{ 
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  flex: 1
                                }}
                              >
                                {conv.from_name || "Unknown"}
                              </Typography>
                              <Typography 
                                variant="caption" 
                                color="text.disabled"
                                sx={{ flexShrink: 0 }}
                              >
                                {formatTime(conv.created_at)}
                              </Typography>
                            </Box>
                          }
                          secondary={
                            <Box sx={{ mt: 0.5 }}>
                              <Chip
                                icon={chipProps.icon}
                                label={chipProps.label}
                                size="small"
                                sx={{
                                  height: 20,
                                  fontSize: "0.7rem",
                                  fontWeight: 600,
                                  bgcolor: chipProps.bgcolor,
                                  color: chipProps.textColor,
                                  mb: 0.5,
                                  "& .MuiChip-icon": {
                                    color: chipProps.textColor,
                                    marginLeft: "4px"
                                  }
                                }}
                              />
                              
                              <Typography 
                                variant="body2" 
                                color="text.secondary" 
                                sx={{
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap"
                                }}
                              >
                                {truncate(conv.text, 45)}
                              </Typography>
                            </Box>
                          }
                        />
                      </ListItemButton>
                      <Divider />
                    </React.Fragment>
                  );
                })}
              </List>
            )}
          </Box>
        </Paper>

        {/* Right Panel - Chat Window */}
        <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column", bgcolor: "white", overflow: "hidden" }}>
          {!selectedConv ? (
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                height: "100%",
                color: "text.secondary",
                p: 3,
                textAlign: "center"
              }}
            >
              <Box>
                <Chat sx={{ fontSize: 64, color: "#e0e0e0", mb: 2 }} />
                <Typography variant="h6">Select a conversation to view messages</Typography>
                <Typography variant="body2" color="text.disabled" sx={{ mt: 1 }}>
                  Choose from your conversations on the left
                </Typography>
              </Box>
            </Box>
          ) : (
            <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <MyChatWindow
                conversationId={selectedConv.conversation_id}
                participantId={selectedConv.from_id}
                embedded={true}
              />
            </Box>
          )}
        </Box>
      </Box>
    );
  }

  // Mobile: Full screen chat when conversation selected
  if (selectedConv) {
    return (
      <Box 
        sx={{ 
          height: "86vh",
          width: "100%",
          display: "flex", 
          flexDirection: "column",
          bgcolor: "white",
          overflow: "hidden",
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0
        }}
      >
        {/* Top App Bar - Sticky */}
        <AppBar 
          position="sticky" 
          elevation={1} 
          sx={{ 
            bgcolor: '#1976d2', 
            zIndex: theme.zIndex.appBar,
            flexShrink: 0,
            mt: '14%'
          }}
        >
          <Toolbar sx={{ minHeight: { xs: 56, sm: 64 } }}>
            <IconButton
              edge="start"
              color="inherit"
              onClick={handleBackToList}
              sx={{ mr: 2 }}
            >
              <ArrowBack />
            </IconButton>
            <Avatar 
              sx={{ 
                mr: 2, 
                width: { xs: 36, sm: 40 }, 
                height: { xs: 36, sm: 40 },
                fontSize: { xs: "0.95rem", sm: "1.1rem" }
              }}
            >
              {(selectedConv.from_name || "U")[0].toUpperCase()}
            </Avatar>
            <Box sx={{ flexGrow: 1 }}>
              <Typography 
                variant="subtitle1" 
                sx={{ 
                  fontSize: { xs: "0.95rem", sm: "1.1rem" },
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }}
              >
                {selectedConv.from_name || "Unknown"}
              </Typography>
              {selectedConv.category && (
                <Typography 
                  variant="caption" 
                  sx={{ 
                    fontSize: { xs: "0.7rem", sm: "0.75rem" },
                    opacity: 0.9
                  }}
                >
                  {selectedConv.category}
                </Typography>
              )}
            </Box>
          </Toolbar>
        </AppBar>

        {/* Chat Content - Takes remaining space */}
        <Box 
          sx={{ 
            flexGrow: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            minHeight: 0
          }}
        >
          <MyChatWindow
            conversationId={selectedConv.conversation_id}
            participantId={selectedConv.from_id}
            embedded={true}
          />
        </Box>
      </Box>
    );
  }

  // Mobile: Grid view for conversation cards
  return (
    <Box 
      sx={{ 
        minHeight: "100vh", 
        bgcolor: "#f5f5f5",
        pb: 4
      }}
    >
      {/* Header Section */}
      <Box 
        sx={{ 
          bgcolor: "#1976d2", 
          color: "white",
          py: { xs: 1, sm: 2 },
          px: { xs: 2, sm: 2 },
          position: "sticky",
          top: 0,
          zIndex: 10,
          boxShadow: 2
        }}
      >
        <Container maxWidth="xl">
          <Typography 
            fontWeight="bold"
            gutterBottom
            sx={{ fontFamily: 'Inter', fontSize: '18px'}}

          >
            Messages
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.9 }}>
            {filteredConversations.length} conversation{filteredConversations.length !== 1 ? 's' : ''}
          </Typography>
        </Container>
      </Box>

      <Container maxWidth="xl" sx={{ mt: 3 }}>
        {/* Search and Filter Section */}
        <Box sx={{ mb: 3 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search conversations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            }}
            sx={{
              bgcolor: "white",
              borderRadius: 1,
              mb: 2,
              '& .MuiInputBase-input': {
                fontSize: { xs: '0.875rem', sm: '1rem' }
              }
            }}
          />

          {/* Category Filter */}
          <ToggleButtonGroup
            value={categoryFilter}
            exclusive
            onChange={handleCategoryFilter}
            size="small"
            sx={{ 
              display: "flex",
              bgcolor: "white",
              borderRadius: 1,
              "& .MuiToggleButton-root": {
                fontSize: { xs: "0.7rem", sm: "0.75rem" },
                py: { xs: 1, sm: 1.25 },
                textTransform: "none",
                flex: 1,
                border: "none",
                "&.Mui-selected": {
                  bgcolor: "#1976d2",
                  color: "white",
                  "&:hover": {
                    bgcolor: "#1565c0"
                  }
                }
              }
            }}
          >
            <ToggleButton value="all">
              All ({conversations.length})
            </ToggleButton>
            <ToggleButton value="Collaboration">
              <Handshake sx={{ fontSize: { xs: 14, sm: 16 }, mr: 0.5 }} />
              {categoryCounts.Collaboration || 0}
            </ToggleButton>
            <ToggleButton value="General">
              <Chat sx={{ fontSize: { xs: 14, sm: 16 }, mr: 0.5 }} />
              {categoryCounts.General || 0}
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Conversation Cards Grid */}
        {loading ? (
          <Box display="flex" justifyContent="center" alignItems="center" sx={{ py: 8 }}>
            <CircularProgress size={40} />
          </Box>
        ) : filteredConversations.length === 0 ? (
          <Box 
            sx={{ 
              textAlign: "center", 
              py: 8,
              bgcolor: "white",
              borderRadius: 2,
              boxShadow: 1
            }}
          >
            <Typography 
              color="text.secondary" 
              variant="h6"
              sx={{ fontSize: "1rem" }}
            >
              {searchTerm || categoryFilter !== "all" 
                ? "No conversations match your filters" 
                : "No conversations found"}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: { xs: 2, sm: 2.5 } }}>
            {filteredConversations.map((conv) => {
              const chipProps = getCategoryChipProps(conv.category);
              
              return (
                <Card 
                  key={conv._id}
                  elevation={2}
                  sx={{
                    width: "100%",
                    transition: "all 0.3s ease",
                    "&:hover": {
                      transform: "translateY(-4px)",
                      boxShadow: 6
                    }
                  }}
                >
                  <CardActionArea 
                    onClick={() => handleSelectConversation(conv)}
                    sx={{ 
                      width: "100%"
                    }}
                  >
                    <CardContent sx={{ p: 2.5 }}>
                      {/* Header with Avatar and Time */}
                      <Box 
                        sx={{ 
                          display: "flex", 
                          alignItems: "center", 
                          mb: 2,
                          gap: 1.5
                        }}
                      >
                        <Avatar 
                          sx={{ 
                            bgcolor: "#1976d2",
                              width: { xs: 36, sm: 46 },
                            height: { xs: 36, sm: 46 },
                            fontSize: { xs: "1.1rem", sm: "1.3rem" },
                            flexShrink: 0
                          }}
                        >
                          {(conv.from_name || "U")[0].toUpperCase()}
                        </Avatar>
                        
                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                          <Typography 
                            sx={{ 
                              fontSize: { xs: "14px", sm: "1.1rem" },
                              fontWeight: 600,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap"
                            }}
                          >
                            {conv.from_name || "Unknown"}
                          </Typography>
                          <Typography 
                            variant="caption" 
                            color="text.secondary"
                            sx={{ fontSize: { xs: "0.7rem", sm: "0.75rem" } }}
                          >
                            {formatTime(conv.created_at)}
                          </Typography>
                        </Box>
                      </Box>

                      {/* Category Chip */}
                      <Box sx={{ mb: 1.5 }}>
                        <Chip
                          icon={chipProps.icon}
                          label={chipProps.label}
                          size="small"
                          sx={{
                            height: { xs: 22, sm: 24 },
                            fontSize: { xs: "0.7rem", sm: "0.75rem" },
                            fontWeight: 600,
                            bgcolor: chipProps.bgcolor,
                            color: chipProps.textColor,
                            "& .MuiChip-icon": {
                              color: chipProps.textColor,
                              marginLeft: "4px"
                            }
                          }}
                        />
                      </Box>

                      {/* Message Preview */}
                      <Typography 
                        variant="body2" 
                        color="text.secondary"
                        sx={{
                          fontSize: { xs: "0.85rem", sm: "0.9rem" },
                          lineHeight: 1.6,
                          display: "-webkit-box",
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          wordBreak: "break-word"
                        }}
                      >
                        {conv.text || "No message preview"}
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              );
            })}
          </Box>
        )}
      </Container>
    </Box>
  );
}

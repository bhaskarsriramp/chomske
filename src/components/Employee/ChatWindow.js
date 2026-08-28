import React, { useEffect, useState, useRef } from "react";
import io from "socket.io-client";
import axios from "axios";
import { Box, Paper, TextField, IconButton, Avatar, Typography } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import { useLocation } from "react-router-dom";

const API_BASE = "/api";


function useQuery() {
  return new URLSearchParams(useLocation().search);
}

function messageConversationId(message) {
  if (!message) return null;
  if (message.conversation && typeof message.conversation === "object" && message.conversation._id) return String(message.conversation._id);
  if (message.conversation && typeof message.conversation === "string") return String(message.conversation);
  if (message.conversation_id) return String(message.conversation_id);
  if (message.conversationId) return String(message.conversationId);
  return null;
}

function messageCreatedAt(message) {
  return new Date(message.created_at || message.createdAt || Date.now());
}

export default function ChatWindow() {
  const q = useQuery();
  const subdomain = q.get("subdomain") || "";
  const [influencer, setInfluencer] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [typingFromInfluencer, setTypingFromInfluencer] = useState(false);
  const socketRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const pendingMessagesRef = useRef(new Set()); // Track optimistic message IDs
  const messagesEndRef = useRef(null);

  // fetch influencer
  useEffect(() => {
    if (!subdomain) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API_BASE}/usersOn/influencer/${encodeURIComponent(subdomain)}`);
        if (!cancelled) setInfluencer(res.data.influencer);
      } catch (err) {
        console.error("fetch influencer failed:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [subdomain]);

  // find-or-create conversation
  useEffect(() => {
    if (!influencer) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.post(`${API_BASE}/usersOn/conversations/find-or-create`, { subdomain }, { withCredentials: true });
        if (!cancelled) {
          setConversation(res.data.conversation);
          if (res.data.conversation && res.data.conversation._id) {
            const msgRes = await axios.get(`${API_BASE}/usersOn/messages/${res.data.conversation._id}`, { withCredentials: true });
            const normalized = (msgRes.data.messages || []).map(m => {
              if (m.senderRole) return m;
              if (m?.sender?.model === "User") return { ...m, senderRole: "influencer" };
              if (m?.sender?.model === "ParticipantUser") return { ...m, senderRole: "participant" };
              return m;
            });
            setMessages(normalized);
          }
        }
      } catch (err) {
        console.error("find-or-create convo failed:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [influencer, subdomain]);

  // create socket once when influencer is available
  useEffect(() => {
    if (!influencer) return;

     const socket = io("https://myhandle.in", {
   path: "/socket.io",
   transports: ["websocket", "polling"], // ok to start with both
   withCredentials: true, // keep ONLY if you actually rely on cookies (you do for participant token)
   query: { subdomain },
 });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[ChatWidget] socket connected", socket.id);
    });

    socket.on("message:received", ({ message }) => {
      try {
        if (!message) return;
        const msgConvId = messageConversationId(message);
        if (conversation && String(msgConvId) !== String(conversation._id)) {
          console.log("[ChatWidget] ignoring message for other conversation:", msgConvId);
          return;
        }
        
        // Add or update message (don't duplicate)
        setMessages(prev => {
          const exists = prev.some(m => String(m._id) === String(message._id));
          if (exists) return prev;
          
          // Check if this is replacing an optimistic message
          const optimisticIndex = prev.findIndex(m => 
            String(m._id).startsWith("temp-") && 
            m.text === message.text &&
            pendingMessagesRef.current.has(m._id)
          );
          
          if (optimisticIndex !== -1) {
            // Replace optimistic with real message
            const newMessages = [...prev];
            newMessages[optimisticIndex] = message;
            pendingMessagesRef.current.delete(prev[optimisticIndex]._id);
            return newMessages;
          }
          
          return [...prev, message];
        });
      } catch (err) {
        console.error("[ChatWidget] message:received handler error:", err);
      }
    });

    socket.on("message:saved", ({ message }) => {
      try {
        if (!message) return;
        
        // Replace optimistic message with saved one
        setMessages(prev => {
          const exists = prev.some(m => String(m._id) === String(message._id));
          if (exists) return prev;
          
          // Find and replace the optimistic message
          const optimisticIndex = prev.findIndex(m => 
            String(m._id).startsWith("temp-") && 
            m.text === message.text &&
            pendingMessagesRef.current.has(m._id)
          );
          
          if (optimisticIndex !== -1) {
            const newMessages = [...prev];
            newMessages[optimisticIndex] = message;
            pendingMessagesRef.current.delete(prev[optimisticIndex]._id);
            return newMessages;
          }
          
          return [...prev, message];
        });
      } catch (err) {
        console.error("[ChatWidget] message:saved handler error:", err);
      }
    });

    socket.on("typing", (payload) => {
      try {
        if (!payload) return;
        if (!conversation || String(conversation._id) !== String(payload.conversationId)) return;
        if (payload.fromSocketId && payload.fromSocketId === socket.id) return;

        let isFromInfluencer = false;
        if (typeof payload.senderRole === "string") {
          isFromInfluencer = payload.senderRole.toLowerCase() === "influencer";
        } else if (payload.from && typeof payload.from === "object") {
          if (payload.from.model === "User") isFromInfluencer = true;
          else if (payload.from.model === "ParticipantUser") isFromInfluencer = false;
          else if (payload.from.id && influencer?._id) {
            isFromInfluencer = String(payload.from.id) === String(influencer._id);
          }
        }
        setTypingFromInfluencer(Boolean(payload.isTyping) && isFromInfluencer);
      } catch (err) {
        console.error("[ChatWidget] typing handler error:", err);
      }
    });

    socket.on("connect_error", (err) => {
      console.error("[ChatWidget] socket connect_error:", err);
    });

    socket.on("disconnect", (reason) => {
      console.log("[ChatWidget] socket disconnect:", reason);
    });

    return () => {
      try { socket.disconnect(); } catch (e) {}
      socketRef.current = null;
    };
  }, [influencer, subdomain]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !conversation || !conversation._id) return;
    if (socket.connected) {
      console.log("[ChatWidget] emitting join_conversation", conversation._id);
      socket.emit("join_conversation", { conversationId: conversation._id });
    } else {
      socket.once("connect", () => {
        socket.emit("join_conversation", { conversationId: conversation._id });
      });
    }
  }, [conversation && conversation._id]);

  const emitTyping = (isTyping) => {
    const socket = socketRef.current;
    if (!socket || !conversation || !conversation._id) {
      console.warn("[ChatWidget] emitTyping skipped — no socket or conversation yet", { isTyping, socketId: socket?.id, conversationId: conversation?._id });
      return;
    }
    const payload = { conversationId: conversation._id, isTyping, fromSocketId: socket.id };
    socket.emit("typing", payload);
  };

  const sendMessage = async () => {
    if (!text.trim()) return;
    const socket = socketRef.current;
    if (!socket || !influencer || !conversation) {
      console.warn("[ChatWidget] sendMessage skipped — missing socket/influencer/conversation");
      return;
    }

    const optimisticId = "temp-" + Date.now() + "-" + Math.random();
    const optimistic = {
      _id: optimisticId,
      text: text.trim(),
      createdAt: new Date().toISOString(),
      conversation: { _id: conversation._id },
      senderRole: "participant",
      sender: { model: "ParticipantUser", id: "__me__" },
    };
    
    // Track this optimistic message
    pendingMessagesRef.current.add(optimisticId);
    setMessages(prev => [...prev, optimistic]);

    socket.emit("message:send", { 
      conversationId: conversation._id, 
      text: text.trim(),
      as: "participant"
    });

    console.debug("[ChatWidget] emitted message:send", { conversationId: conversation._id, to_influencer_id: influencer._id });

    const clearPayload = { conversationId: conversation._id, isTyping: false, fromSocketId: socket.id };
    socket.emit("typing", clearPayload);

    setText("");
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    setTypingFromInfluencer(false);
  };

  const isFromInfluencer = (m) => {
    if (!m) return false;
    if (typeof m.senderRole === "string") {
      return m.senderRole.toLowerCase() === "influencer";
    }
    if (m.sender && typeof m.sender === "object") {
      if (m.sender.model === "User") return true;
      if (m.sender.model === "ParticipantUser") return false;
      if (m.sender.id && influencer?._id) {
        return String(m.sender.id) === String(influencer._id);
      }
    }
    if (m.from_user && influencer && String(m.from_user) === String(influencer._id)) return true;
    return false;
  };

  return (
  <Box sx={{ bgcolor: "#FFFFFF", margin: 'auto', height: '100vh', display: 'flex', flexDirection: 'column' }}>
  <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: "column" }}>
    {/* Fixed Header - Sticky at top */}
    <Box 
      display="flex" 
      alignItems="center" 
      gap={1} 
      sx={{ 
        p: 2, 
        borderBottom: '1px solid #e0e0e0', 
        flexShrink: 0,
        bgcolor: 'white',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}
    >
      <Avatar src={influencer?.picture || ""} />
      <Box>
        <Typography fontSize={14} fontWeight={600}>
          {influencer?.name || influencer?.handleUserName || "Influencer"}
        </Typography>
        <Typography fontSize={12} color="text.secondary">
          Chat with {influencer?.handleUserName}
        </Typography>
      </Box>
    </Box>

    {/* Scrollable Messages Area - Only this scrolls */}
    <Box 
      sx={{ 
        flex: 1, 
        overflowY: "auto", 
        overflowX: "hidden",
        p: 2, 
        bgcolor: "#fafafa",
        minHeight: 0 // Important for flex scrolling
      }}
    >
      {messages.map((m) => {
        const align = isFromInfluencer(m) ? "left" : "right";
        return (
          <Box 
            key={m._id} 
            sx={{ 
              display: "flex", 
              justifyContent: align === "right" ? "flex-end" : "flex-start", 
              mb: 1.5 
            }}
          >
            <Box 
              sx={{ 
                maxWidth: "80%", 
                p: 1.5, 
                borderRadius: 2, 
                bgcolor: align === "right" ? "#DCF8C6" : "#BADFDB", 
                boxShadow: 1 
              }}
            >
              <Typography variant="body2">{m.text}</Typography>
              <Typography 
                variant="caption" 
                sx={{ 
                  display: "block", 
                  textAlign: "right", 
                  mt: 0.5, 
                  opacity: 0.7 
                }}
              >
                {messageCreatedAt(m).toLocaleTimeString()}
              </Typography>
            </Box>
          </Box>
        );
      })}
      <div ref={messagesEndRef} />
    </Box>

    {/* Fixed Input Area - Sticky at bottom */}
    <Box 
      sx={{ 
        p: 2, 
        borderTop: '1px solid #e0e0e0', 
        bgcolor: 'white', 
        flexShrink: 0,
        position: 'sticky',
        bottom: 0,
        zIndex: 10
      }}
    >
      {typingFromInfluencer && (
        <Typography 
          variant="caption" 
          sx={{ 
            display: 'block', 
            mb: 1, 
            color: 'text.secondary' 
          }}
        >
          {influencer?.name || "Influencer"} is typing...
        </Typography>
      )}
      <Box display="flex" gap={1}>
        <TextField
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            emitTyping(true);
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => emitTyping(false), 900);
          }}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          variant="outlined"
          size="small"
          fullWidth
          placeholder="Write a message..."
        />
        <IconButton onClick={sendMessage} color="primary">
          <SendIcon />
        </IconButton>
      </Box>
    </Box>
  </Box>
</Box>
  );
}
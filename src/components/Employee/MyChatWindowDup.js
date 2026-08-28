import React, { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import io from "socket.io-client";
import {
  Box, Paper, Avatar, Typography, TextField, Button, CircularProgress, Alert
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";

const API_BASE = "/api";


function initials(name = "") {
  return (name || "").split(" ").map(s => s[0]).join("").slice(0, 2).toUpperCase();
}

function toIdString(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && (v._id || v.id)) return String(v._id || v.id);
  return String(v);
}

// Modified to accept props for embedded usage
export default function MyChatWindow({ 
  conversationId: propConversationId, 
  participantId: propParticipantId,
  embedded = false 
}) {
  // Get params from URL (for standalone route usage)
  const params = useParams();
  const { conversationId: paramConversationId, participantId: paramParticipantId } = params || {};
  
  // Use props if provided (embedded mode), otherwise use URL params
  const conversationId = propConversationId || paramConversationId;
  const participantId = propParticipantId || paramParticipantId;

  const [conversation, setConversation] = useState(null);
  const [participant, setParticipant] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [typingFromParticipant, setTypingFromParticipant] = useState(false);
  const socketRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const scrollRef = useRef(null);
  const debugEmittedRef = useRef(false);
  const pendingMessagesRef = useRef(new Set()); // Track optimistic messages
  const messagesEndRef = useRef(null);

  // derived ids
  const influencerIdRef = useRef(null);
  const participantIdRef = useRef(null);

  // load conversation & messages
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setErrorMsg(null);
        setLoading(true);

        let convoResp = null;
        if (conversationId) {
          convoResp = await axios.get(`${API_BASE}/usersOn/conversations/${conversationId}`, { withCredentials: true });
        } else if (participantId) {
          convoResp = await axios.post(`${API_BASE}/usersOn/conversations/find-or-create-by-participant`, { participantId: participantId }, { withCredentials: true });
        } else {
          setErrorMsg("No conversationId or participantId provided.");
          return;
        }

        if (cancelled) return;

        const convoData = convoResp?.data?.conversation || convoResp?.data || null;
        const participantData = convoResp?.data?.participant || null;

        if (!convoData) {
          setErrorMsg("Conversation not found");
          setConversation(null);
          setParticipant(participantData);
          setMessages([]);
          return;
        }

        setConversation(convoData);
        if (participantData) setParticipant(participantData);

        // derive influencer and participant ids from conversation & participant
        const derived = deriveParticipantInfluencerIds(convoData, participantData);
        influencerIdRef.current = derived.influencerId;
        participantIdRef.current = derived.participantId;

        const convIdToFetch = conversationId || convoData._id || convoData.conversation_id;
        if (!convIdToFetch) {
          setMessages([]);
          return;
        }

        const messagesRes = await axios.get(`${API_BASE}/usersOn/conversations/${convIdToFetch}/messages`, { withCredentials: true });
        if (cancelled) return;

        const msgs = messagesRes?.data?.messages || [];
        setMessages(msgs);

        // one-time debug log
        if (!debugEmittedRef.current && msgs.length > 0) {
          console.group("MyChatWindow - first message debug");
          console.log("first message example:", msgs[0]);
          console.log("participant object:", participantData);
          console.log("derived ids:", derived);
          console.groupEnd();
          debugEmittedRef.current = true;
        }
      } catch (err) {
        console.error("MyChatWindow: load error", err);
        setErrorMsg("Failed to load conversation. See console.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [conversationId, participantId]);

  // socket
  useEffect(() => {
    if (!conversation) return;
  
       const socket = io("https://chomske.com", {
       path: "/socket.io",
       transports: ["websocket", "polling"], // ok to start with both
       withCredentials: true, // keep ONLY if you actually rely on cookies (you do for participant token)
      query: { subdomain: conversation?.subdomain || "" }

     });

    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join_conversation", { conversationId: conversation._id });
    });

    socket.on("message:received", ({ message }) => {
      if (!message) return;

      const msgConvId =
        (message.conversation && typeof message.conversation === "object" && message.conversation._id)
          ? String(message.conversation._id)
          : message.conversation_id || message.conversationId || message.conversation;

      if (!msgConvId || String(msgConvId) !== String(conversation._id)) return;

      setMessages(prev => {
        // Check if message already exists
        if (prev.some(m => String(m._id) === String(message._id))) return prev;
        
        // Check if this is replacing an optimistic message
        const optimisticIndex = prev.findIndex(m => 
          String(m._id).startsWith("tmp-") && 
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
    });

    socket.on("typing", (payload) => {
      try {
        if (!payload) return;
        if (!conversation || String(conversation._id) !== String(payload.conversationId)) return;
        if (payload.fromSocketId && payload.fromSocketId !== socket.id) {
          setTypingFromParticipant(Boolean(payload.isTyping));
        } else {
          setTypingFromParticipant(false);
        }
      } catch (err) {
        console.error("typing handler error", err);
      }
    });

    socket.on("disconnect", () => {});
    socket.on("connect_error", (err) => { console.error("socket connect_error", err); });

    return () => {
      try { socket.disconnect(); } catch (e) {}
      socketRef.current = null;
      if (typingTimeoutRef.current) { clearTimeout(typingTimeoutRef.current); typingTimeoutRef.current = null; }
    };
  }, [conversation]);

  // ensure join
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !conversation || !conversation._id) return;
    if (socket.connected) socket.emit("join_conversation", { conversationId: conversation._id });
    else socket.once("connect", () => socket.emit("join_conversation", { conversationId: conversation._id }));
  }, [conversation?._id]);

  // auto scroll
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, typingFromParticipant]);

  // send message
  const sendMessage = async () => {
    const t = (text || "").trim();
    if (!t || !conversation) return;
    setText("");

    // optimistic - with unique ID
    const optimisticId = `tmp-${Date.now()}-${Math.random()}`;
    const tmp = {
      _id: optimisticId,
      text: t,
      createdAt: new Date().toISOString(),
      sender: { _id: influencerIdRef.current || null },
      from_influencer: true,
      status: "sending"
    };
    
    // Track this optimistic message
    pendingMessagesRef.current.add(optimisticId);
    setMessages(prev => [...prev, tmp]);

    const socket = socketRef.current;
    if (socket && socket.connected) {
      socket.emit("message:send", { conversationId: conversation._id, text: t, as: "influencer" });
      socket.emit("typing", { conversationId: conversation._id, isTyping: false, fromSocketId: socket.id });
      setTypingFromParticipant(false);
      return;
    }
  };

  if (loading) return <Box display="flex" alignItems="center" justifyContent="center" sx={{ py: 6 }}><CircularProgress /></Box>;

  // Helper functions
  function deriveParticipantInfluencerIds(convo, participantObj) {
    // Prefer explicit ids returned by the API
    let participantId = participantObj?._id ? String(participantObj._id) : null;
    let influencerId =
      (convo?.influencer && convo.influencer._id) ? String(convo.influencer._id) : null;

    const parts = Array.isArray(convo?.participants) ? convo.participants : [];

    for (const p of parts) {
      const model = String(p?.actor?.model || "").toLowerCase();
      const uid = p?.actor?.id ? String(p.actor.id) : null;
      const role = String(p?.role || "").toLowerCase();
      if (!uid) continue;

      if (!influencerId && model === "user") {
        influencerId = uid;
        continue;
      }
      if (!participantId && model === "participantuser") {
        participantId = uid;
        continue;
      }

      if (!influencerId && (role === "influencer" || role === "admin")) {
        influencerId = uid;
        continue;
      }
      if (!participantId && (role === "member" || role === "participant" || role === "user")) {
        participantId = uid;
        continue;
      }
    }

    if (!influencerId) {
      if (convo?.influencer_id) influencerId = toIdString(convo.influencer_id);
      else if (convo?.influencer) influencerId = toIdString(convo.influencer._id || convo.influencer);
    }

    if ((!influencerId || !participantId) && parts.length >= 2) {
      const ids = parts
        .map(p => (p?.actor?.id ? String(p.actor.id) : null))
        .filter(Boolean);

      if (!participantId && influencerId) {
        participantId = ids.find(id => id !== influencerId) || participantId;
      } else if (!influencerId && participantId) {
        influencerId = ids.find(id => id !== participantId) || influencerId;
      }
    }

    if (convo?.participant_ids_sorted) {
      const sorted = String(convo.participant_ids_sorted).split("|").filter(Boolean);
      if (!influencerId && participantId && sorted.length === 2) {
        influencerId = sorted.find(x => x !== participantId) || influencerId;
      }
      if (!participantId && influencerId && sorted.length === 2) {
        participantId = sorted.find(x => x !== influencerId) || participantId;
      }
    }

    return { influencerId: influencerId || null, participantId: participantId || null };
  }

  function isFromInfluencer(m) {
    const infId = influencerIdRef.current;

    if (m?.senderRole && String(m.senderRole).toLowerCase() === "influencer") return true;
    if (m?.sender_type && String(m.sender_type).toLowerCase() === "influencer") return true;
    if (m?.from_influencer === true || m?.fromInfluencer === true) return true;

    if (!infId) return false;
    const sid = getSenderIdFromMessage(m);
    return !!(sid && String(sid) === String(infId));
  }

  function isFromParticipant(m) {
    const pId = participantIdRef.current;

    if (m?.senderRole && String(m.senderRole).toLowerCase() === "participant") return true;
    if (m?.sender_type && String(m.sender_type).toLowerCase() === "participant") return true;
    if (m?.from_participant === true || m?.fromParticipant === true) return true;

    if (!pId) return false;
    const sid = getSenderIdFromMessage(m);
    return !!(sid && String(sid) === String(pId));
  }

  function getSenderIdFromMessage(m) {
    if (!m) return null;
    if (m?.sender && (m.sender._id || m.sender.id)) return String(m.sender._id || m.sender.id);
    if (m?.user && (m.user._id || m.user.id)) return String(m.user._id || m.user.id);
    if (m?.author && (m.author._id || m.author.id)) return String(m.author._id || m.author.id);
    if (m?.senderId) return String(m.senderId);
    if (m?.from_user) return String(m.from_user);
    if (m?.fromUser) return String(m.fromUser);
    return null;
  }

  // Render
  const containerSx = embedded 
    ? { p: 2 } 
    : { p: 2 };

  return (
    <Paper sx={containerSx} elevation={embedded ? 0 : 3}>
      {!!errorMsg && <Alert severity="error" sx={{ mb: 2 }}>{errorMsg}</Alert>}

      <Box display="flex" alignItems="center" gap={2} sx={{ mb: 2 }}>
        <Avatar src={participant?.picture || ""}>{!participant?.picture && initials(participant?.name || participant?.email || "P")}</Avatar>
        <Box>
          <Typography variant="h6">{participant?.name || participant?.email || "Participant"}</Typography>
          <Typography variant="body2" color="textSecondary">Conversation</Typography>
        </Box>
      </Box>

      {/* Messages container - WhatsApp style */}
      <Box
        ref={scrollRef}
        sx={{
          height: embedded ? "calc(100vh - 200px)" : 420,
          overflowY: "auto",
          bgcolor: "#e5ddd5",
          p: 2,
          borderRadius: 1,
          display: "flex",
          flexDirection: "column",
          gap: 1
        }}
      >
        {messages.length === 0 ? (
          <Typography color="text.secondary" sx={{ textAlign: "center" }}>No messages yet</Typography>
        ) : (
          messages.map((m) => {
            const left = isFromParticipant(m);
            const right = isFromInfluencer(m) || (!left);

            const bubbleBg = right ? "#dcf8c6" : "#ffffff";
            const borderRadius = right ? "8px 8px 0px 8px" : "8px 8px 8px 0px";
            const msgKey = m._id || m.id || `${m.createdAt || m.created_at || Date.now()}-${Math.random()}`;

            return (
              <Box key={msgKey}
                   sx={{ display: "flex", justifyContent: right ? "flex-end" : "flex-start", mb: 0.5 }}>
                {/* left */}
                {!right && (
                  <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1, maxWidth: "70%" }}>
                    <Avatar src={participant?.picture || ""} sx={{ width: 32, height: 32, fontSize: 12 }}>
                      {!participant?.picture && initials(participant?.name || participant?.email || "P")}
                    </Avatar>
                    <Box>
                      <Box sx={{ p: 1.5, bgcolor: bubbleBg, boxShadow: "0 1px 0.5px rgba(0,0,0,.13)",
                                 borderRadius, wordBreak: "break-word", overflowWrap: "anywhere" }}>
                        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                          {m.text || m.message || m.body}
                        </Typography>
                      </Box>
                      <Typography variant="caption" sx={{ color: "text.secondary", pl: 1, display: "block", mt: 0.25 }}>
                        {m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                      : m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                      : ""}
                        {m.status && ` • ${m.status}`}
                      </Typography>
                    </Box>
                  </Box>
                )}

                {/* right */}
                {right && (
                  <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1, maxWidth: "70%" }}>
                    <Box>
                      <Box sx={{ p: 1.5, bgcolor: bubbleBg, boxShadow: "0 1px 0.5px rgba(0,0,0,.13)",
                                 borderRadius, wordBreak: "break-word", overflowWrap: "anywhere" }}>
                        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                          {m.text || m.message || m.body}
                        </Typography>
                      </Box>
                      <Typography variant="caption" sx={{ color: "text.secondary", pr: 1, display: "block", mt: 0.25, textAlign: "right" }}>
                        {m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                      : m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                      : ""}
                        {m.status && ` • ${m.status}`}
                      </Typography>
                    </Box>
                    <Avatar src={conversation?.influencer_picture || ""} sx={{ width: 32, height: 32, fontSize: 12 }}>
                      {!conversation?.influencer_picture && initials(conversation?.influencer_name || conversation?.influencer?.name || "M")}
                    </Avatar>
                  </Box>
                )}
              </Box>
            );
          })
        )}

        {typingFromParticipant && (
          <Box sx={{ display: "flex", justifyContent: "flex-start", alignItems: "center", gap: 1 }}>
            <Avatar
              src={participant?.picture || ""}
              sx={{ width: 32, height: 32, fontSize: 12 }}
            >
              {!participant?.picture && initials(participant?.name || participant?.email || "P")}
            </Avatar>
            <Typography variant="caption" sx={{ fontStyle: "italic", color: "text.secondary" }}>
              {participant?.name || "Participant"} is typing...
            </Typography>
          </Box>
        )}
      </Box>

      <Box display="flex" gap={1} sx={{ mt: 2 }}>
        <TextField
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const socket = socketRef.current;
            if (socket && conversation && conversation._id) {
              socket.emit("typing", { conversationId: conversation._id, isTyping: true, fromSocketId: socket.id });
              if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
              typingTimeoutRef.current = setTimeout(() => {
                if (socket && conversation && conversation._id) socket.emit("typing", { conversationId: conversation._id, isTyping: false, fromSocketId: socket.id });
                typingTimeoutRef.current = null;
              }, 900);
            }
          }}
          fullWidth
          placeholder="Type a message..."
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          sx={{
            "& .MuiOutlinedInput-root": {
              borderRadius: "24px"
            }
          }}
        />
        <Button 
          variant="contained" 
          endIcon={<SendIcon />} 
          onClick={sendMessage}
          sx={{ borderRadius: "24px", minWidth: "100px" }}
        >
          Send
        </Button>
      </Box>
    </Paper>
  );
}
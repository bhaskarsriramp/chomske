// realtime/socket.js
import { Server as IOServer } from "socket.io";
import cookie from "cookie";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Conversation from "../../backend/models/Conversation.js";
import Message from "../../backend/models/Message.js";
import USER from "../../backend/models/User.js";
import OpenAI from "openai";


const JWT_SECRET = process.env.JWT_SECRET || "NidkPwke9485hfKDLAndu9*#&$&$jcbPOqkPkshEYfk3848Asj";

// ---- helpers ----
const OID = (v) => new mongoose.Types.ObjectId(String(v));
const actorKey = (model, id) => `${model}:${id.toString()}`;
const isValidId = (v) => v && mongoose.Types.ObjectId.isValid(v);
const s = (v) => (v == null ? null : String(v));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


async function categorizeFirstMessage(messageText) {
  try {
    if (!messageText || typeof messageText !== "string" || !messageText.trim()) {
      return { category: "Uncategorized", confidence: 0 };
    }

    const systemPrompt = `You are an expert at categorizing customer messages into one of two categories:

1. **General**: Messages seeking information, asking questions, expressing interest, making inquiries, requesting help, or general conversations.

2. **Collaboration**: Messages proposing partnerships, brand deals, sponsorships, business proposals, collaboration opportunities, influencer marketing, or professional engagements.

Analyze the message and respond with ONLY a JSON object in this exact format:
{
  "category": "General" or "Collaboration",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation"
}

Be decisive. If unclear, default to "General" with lower confidence.`;

    const userPrompt = `Categorize this first message from a user:\n\n"${messageText}"`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o", // Using GPT-4o (best model as of now)
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3, // Lower temperature for more consistent categorization
      max_tokens: 150,
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      console.warn("[Categorizer] No response from GPT");
      return { category: "Uncategorized", confidence: 0 };
    }

    const parsed = JSON.parse(responseText);
    const category = parsed.category === "Collaboration" ? "Collaboration" : "General";
    const confidence = Math.max(0, Math.min(1, parseFloat(parsed.confidence) || 0));

    console.log(`[Categorizer] Message categorized as "${category}" (confidence: ${confidence.toFixed(2)})`);
    if (parsed.reasoning) {
      console.log(`[Categorizer] Reasoning: ${parsed.reasoning}`);
    }

    return { category, confidence };
  } catch (error) {
    console.error("[Categorizer] Error categorizing message:", error.message);
    // Fallback to Uncategorized on error
    return { category: "Uncategorized", confidence: 0 };
  }
}


function shouldCategorizeConversation(conversation) {
  if (!conversation) return false;
  
  // Already categorized (not Uncategorized)
  if (conversation.category && conversation.category !== "Uncategorized") {
    return false;
  }
  
  // Has exactly 0 messages (about to receive first message)
  if (conversation.message_count === 0) {
    return true;
  }
  
  return false;
}

function extractCookieIds(handshake) {
  try {
    const parsed = cookie.parse(handshake.headers?.cookie || "");
    const pTok = parsed.tokenParticipantMyHandle || null;
    const iTok = parsed.tokenMyhandleProf || null;

    let participantId = null;
    let influencerId = null;

    if (pTok) {
      const p = jwt.verify(pTok, JWT_SECRET);
      participantId = p.userId || p.user_id || p.id || null;
    }
    if (iTok) {
      const q = jwt.verify(iTok, JWT_SECRET);
      influencerId = q.userId || q.user_id || q.id || null;
    }
    return { participantId: s(participantId), influencerId: s(influencerId) };
  } catch {
    return { participantId: null, influencerId: null };
  }
}


function resolveSenderActor({ socket, convo, prefer }) {
  const participantId = socket.data.participantId && isValidId(socket.data.participantId) ? s(socket.data.participantId) : null;
  const influencerId  = socket.data.influencerId  && isValidId(socket.data.influencerId)  ? s(socket.data.influencerId)  : null;

  const parts = Array.isArray(convo?.participants) ? convo.participants : [];

  const partIsMember = participantId
    ? parts.some((p) => p?.actor?.model === "ParticipantUser" && s(p.actor.id) === s(participantId))
    : false;

  const infIsMember = influencerId
    ? parts.some((p) => p?.actor?.model === "User" && s(p.actor.id) === s(influencerId))
    : false;

  const preferLower = (prefer || "").toLowerCase();

  // 1) explicit override
  if (preferLower === "influencer" && infIsMember) return { model: "User", id: OID(influencerId), role: "influencer" };
  if (preferLower === "participant" && partIsMember) return { model: "ParticipantUser", id: OID(participantId), role: "participant" };

  // 2) widget sockets (have subdomain) default participant if possible
  if (socket.handshake.subdomain && partIsMember) {
    return { model: "ParticipantUser", id: OID(participantId), role: "participant" };
  }

  // 3) dashboard sockets (have influencer cookie) default influencer if possible
  if (!socket.handshake.subdomain && infIsMember) {
    return { model: "User", id: OID(influencerId), role: "influencer" };
  }

  // 4) only one membership present
  if (infIsMember && !partIsMember) return { model: "User", id: OID(influencerId), role: "influencer" };
  if (partIsMember && !infIsMember) return { model: "ParticipantUser", id: OID(participantId), role: "participant" };

  // 5) ambiguous or not a member
  return null;
}

export default function attachSocket(server, expressApp) {
  const io = new IOServer(server, {
    cors: {
      origin: expressApp.get("cors_origins") || "*",
      credentials: true,
    },
  });

  // enrich handshake
  io.use((socket, next) => {
    const { subdomain } = socket.handshake.query || {};
    socket.handshake.subdomain = subdomain ? String(subdomain).toLowerCase() : null;

    const { participantId, influencerId } = extractCookieIds(socket.handshake);
    if (participantId) socket.data.participantId = participantId;
    if (influencerId)  socket.data.influencerId  = influencerId;

    next();
  });

  io.on("connection", async (socket) => {
    try {
      console.log("socket connected", socket.id, "subdomain:", socket.handshake.subdomain);

      // If subdomain present, resolve influencer for the public room (meta only)
      if (socket.handshake.subdomain) {
        try {
          const user = await USER.findOne({ handleUserName: socket.handshake.subdomain }).lean();
          if (user?._id) {
            socket.join(`influencer:${s(user._id)}`);
            // meta used for display; not used for actor auth
            socket.data.influencerMeta = {
              id: s(user._id),
              handle: socket.handshake.subdomain,
              name: user.name,
              picture: user.picture,
            };
          }
        } catch (err) {
          console.warn("influencer lookup (subdomain) failed:", err?.message || err);
        }
      }

      // Join private rooms if cookies present
      if (socket.data.influencerId) {
        socket.join(`influencer:${s(socket.data.influencerId)}`);
      }
      if (socket.data.participantId) {
        socket.join(`participant:${s(socket.data.participantId)}`);
      }

      socket.on("join_conversation", async ({ conversationId }) => {
        try {
          if (!conversationId || !isValidId(conversationId)) return;
          socket.join(`conversation:${conversationId}`);
        } catch (err) {
          console.error("join_conversation error:", err);
        }
      });

      // find-or-create DM
      async function findOrCreateDM({ influencerId, participantId }) {
        const infActor = { model: "User", id: OID(influencerId) };
        const memActor = { model: "ParticipantUser", id: OID(participantId) };
        const keys = [actorKey(infActor.model, infActor.id), actorKey(memActor.model, memActor.id)].sort();
        const participant_keys_sorted = keys.join("|");

        let convo = await Conversation.findOne({
          participant_keys_sorted,
          conversation_type: "dm",
          is_deleted: { $ne: true },
        });

        if (convo) return convo;

        try {
          convo = await Conversation.create({
            participants: [
              { actor: infActor, role: "influencer", joined_at: new Date(), last_read_at: null, last_read_message_id: null, muted: false },
              { actor: memActor, role: "member", joined_at: new Date(), last_read_at: null, last_read_message_id: null, muted: false },
            ],
            participant_keys_sorted,
            conversation_type: "dm",
            last_message: null,
            last_message_text: "",
            last_message_at: null,
            message_count: 0,
            unread_counts: { [keys[0]]: 0, [keys[1]]: 0 },
            metadata: { title: null, tags: [], pinned: false },
            is_deleted: false,
          });
        } catch (err) {
          if (err?.code === 11000) {
            convo = await Conversation.findOne({
              participant_keys_sorted,
              conversation_type: "dm",
              is_deleted: { $ne: true },
            });
          } else {
            throw err;
          }
        }
        return convo;
      }

      // typing
      socket.on("typing", ({ conversationId, isTyping, fromSocketId, as }) => {
        if (!conversationId) return;

        // we don’t need the convo to relay typing, but we include senderRole hint
        const role =
          (as && String(as).toLowerCase()) ||
          (socket.handshake.subdomain ? "participant" : (socket.data.influencerId ? "influencer" : undefined));

        const from =
          role === "influencer" && socket.data.influencerId
            ? { model: "User", id: s(socket.data.influencerId) }
            : role === "participant" && socket.data.participantId
            ? { model: "ParticipantUser", id: s(socket.data.participantId) }
            : null;

        socket.to(`conversation:${conversationId}`).emit("typing", {
          conversationId,
          isTyping: !!isTyping,
          from,
          fromSocketId: fromSocketId || socket.id,
          senderRole: role,
        });
      });

      // message:send (supports payload.as override)
      // payload: { conversationId? , to_influencer_id? , text, attachments? , as? }
   socket.on("message:send", async (payload = {}) => {
  try {
    const { conversationId, to_influencer_id, text, attachments, as } = payload || {};
    const trimmed = (text || "").trim();
    if (!trimmed) return;

    const participantId = socket.data.participantId && isValidId(socket.data.participantId) ? s(socket.data.participantId) : null;
    const influencerCtxId = socket.data.influencerId && isValidId(socket.data.influencerId) ? s(socket.data.influencerId) : null;

    let convo = null;

    if (conversationId && isValidId(conversationId)) {
      convo = await Conversation.findById(conversationId).lean();
    } else {
      const influencerId = isValidId(to_influencer_id) ? s(to_influencer_id) : influencerCtxId;
      if (!influencerId || !participantId) {
        socket.emit("error", { message: "conversationId or (to_influencer_id + participant auth) required" });
        return;
      }
      convo = await findOrCreateDM({ influencerId, participantId });
      if (!convo) {
        socket.emit("error", { message: "failed to resolve or create conversation" });
        return;
      }
    }

    // *** CRITICAL: resolve exactly one sender ***
    const senderResolved = resolveSenderActor({
      socket,
      convo,
      prefer: as,
    });

    if (!senderResolved) {
      socket.emit("error", { message: "cannot resolve sender (ambiguous or not a member)" });
      return;
    }

    const sender = { model: senderResolved.model, id: senderResolved.id };
    const senderRole = senderResolved.role;

    const parts = Array.isArray(convo.participants) ? convo.participants : [];
    const recipients = parts
      .map((p) => p.actor)
      .filter((a) => !(a?.model === sender.model && String(a?.id) === String(sender.id)))
      .map((a) => ({ model: a.model, id: OID(String(a.id)) }));

    if (convo.conversation_type === "dm") {
      if (sender.model === "User") {
        if (!(recipients.length === 1 && recipients[0].model === "ParticipantUser")) {
          return socket.emit("error", { message: "DM invariant failed: influencer must target participant" });
        }
      } else if (sender.model === "ParticipantUser") {
        if (!(recipients.length === 1 && recipients[0].model === "User")) {
          return socket.emit("error", { message: "DM invariant failed: participant must target influencer" });
        }
      }
    }

    // *** NEW: Check if this is the first message from participant and needs categorization ***
    const isFirstParticipantMessage = 
      senderRole === "participant" && 
      shouldCategorizeConversation(convo);

    let categoryResult = null;
    if (isFirstParticipantMessage) {
      console.log("[Socket] First participant message detected, categorizing...");
      categoryResult = await categorizeFirstMessage(trimmed);
      console.log(`[Socket] Category: ${categoryResult.category}, Confidence: ${categoryResult.confidence}`);
    }

    // Save message
    const msgDoc = await Message.create({
      conversation: OID(convo._id),
      sender,
      recipients,
      text: trimmed,
      attachments: Array.isArray(attachments) ? attachments : [],
      status: "sent",
      categories: [],
      delivery: {},
      meta: {},
      is_deleted: false,
    });

    // Update convo denorms
    const incPaths = {};
    for (const r of recipients) {
      incPaths[`unread_counts.${actorKey(r.model, r.id)}`] = 1;
    }

    const updateFields = {
      $set: {
        last_message: msgDoc._id,
        last_message_text: trimmed.slice(0, 500),
        last_message_at: msgDoc.createdAt || new Date(),
      },
      $inc: { message_count: 1, ...incPaths },
    };

    // *** NEW: Add category fields if this was categorized ***
    if (categoryResult) {
      updateFields.$set.category = categoryResult.category;
      updateFields.$set.category_analyzed_at = new Date();
      updateFields.$set.category_confidence = categoryResult.confidence;
    }

    await Conversation.findByIdAndUpdate(convo._id, updateFields).catch((e) =>
      console.warn("convo update warn:", e?.message || e)
    );

    // ensure sender is in room
    socket.join(`conversation:${s(convo._id)}`);

    const payloadMessage = {
      _id: s(msgDoc._id),
      conversation: { _id: s(convo._id) },
      sender: { model: sender.model, id: s(sender.id) },
      recipients: recipients.map((r) => ({ model: r.model, id: s(r.id) })),
      text: msgDoc.text,
      attachments: msgDoc.attachments || [],
      status: msgDoc.status,
      createdAt: msgDoc.createdAt,
      senderRole,
    };

    // Emit
    for (const r of recipients) {
      const rid = s(r.id);
      if (!rid) continue;
      if (r.model === "User") io.to(`influencer:${rid}`).emit("message:received", { message: payloadMessage });
      else if (r.model === "ParticipantUser") io.to(`participant:${rid}`).emit("message:received", { message: payloadMessage });
    }
    io.to(`conversation:${s(convo._id)}`).emit("message:received", { message: payloadMessage });

    // ack
    socket.emit("message:saved", { message: payloadMessage });
  } catch (err) {
    console.error("message:send error:", err);
    socket.emit("error", { message: "message send failed", details: err?.message || null });
  }
});


      socket.on("disconnect", () => {
        console.log("socket disconnected", socket.id);
      });
    } catch (outerErr) {
      console.error("socket connection handler error:", outerErr);
    }
  });

  return io;
}

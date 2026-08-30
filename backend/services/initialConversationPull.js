// ==================== UPDATED: initialConversationPull.js ====================
// Key changes:
// 1. Added recalculateConversationMetrics helper to fix unread/reply status race conditions
// 2. Removed premature state updates in Step 7 to prevent overwriting correct data
// 3. Forced metric recalculation after message save to ensure DB consistency

// services/initialConversationPull.js
// Handles first-time inbox pull: fetches conversations from Meta, saves messages, analyzes with Gemini

import axios from "axios";
import Conversation from "../models/Conversation.js";
import Participant from "../models/Participant.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { analyzeConversationIntent } from "./geminiConversationAnalyser.js";
import agenda from "../utils/agenda.js";
import { ensureFreshPageTokenForUser } from "./tokenService.js";

const GRAPH_API_BASE = "https://graph.facebook.com/v24.0";
const DAY_MS = 24 * 60 * 60 * 1000;

// Rate limiting helpers
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Meta API rate limit: ~200 calls/hour per user, be conservative
const META_DELAY_MS = 500;
const GEMINI_DELAY_MS = 300;
const GEMINI_MAX_RETRIES = 3;

/**
 * 🔥 HELPER: Recalculate unread count & reply status from DB
 * Ensures strict consistency between stored Messages and Conversation state
 */
async function recalculateConversationMetrics(conversationId) {
  const messages = await Message.find({
    conversationId,
    isDeleted: false,
  })
    .sort({ createdAtPlatform: -1 }) // Newest first
    .lean();

  if (messages.length === 0) {
    await Conversation.updateOne(
      { _id: conversationId },
      {
        $set: {
          unreadCount: 0,
          creatorHasReplied: false,
          lastParticipantMessageAt: null,
        },
      }
    );
    return { unreadCount: 0, creatorHasReplied: false, lastParticipantMessageAt: null };
  }

  // Find creator's latest message timestamp
  let creatorLatestMessageTime = null;
  for (const m of messages) {
    if (m.sender === "me") {
      creatorLatestMessageTime = new Date(m.createdAtPlatform);
      break; // Messages are sorted newest first, so first "me" is the latest
    }
  }

  let unreadCount = 0;
  let lastParticipantMessageAt = null;

  // Count user messages newer than creator's latest message
  for (const m of messages) {
    if (m.sender === "them") {
      const msgTime = new Date(m.createdAtPlatform);

      // Track latest participant message (first one since sorted newest first)
      if (!lastParticipantMessageAt) {
        lastParticipantMessageAt = msgTime;
      }

      // Count as unread if creator never replied OR message is newer than creator's latest
      // 🔥 FIX: Use >= to catch messages in the same second
      if (!creatorLatestMessageTime || msgTime >= creatorLatestMessageTime) {
        unreadCount++;
      }
    }
  }

  const creatorHasReplied = messages.some((m) => m.sender === "me" && m.type === "text");

  await Conversation.updateOne(
    { _id: conversationId },
    {
      $set: {
        unreadCount,
        creatorHasReplied,
        lastParticipantMessageAt,
      },
    }
  );

  console.log(
    `📊 [recalculateMetrics] Conv ${conversationId}: unread=${unreadCount}, creatorReplied=${creatorHasReplied}`
  );

  return { unreadCount, creatorHasReplied, lastParticipantMessageAt };
}

/**
 * Main function to perform initial conversation pull
 * Called when first_conv_pull is false
 */
export async function performInitialConversationPull(userId) {
  const startTime = Date.now();
  console.log(`🚀 [InitialPull] Starting for user: ${userId}`);

  try {
    // 1. Mark as processing
    await User.findByIdAndUpdate(userId, {
      $set: { conv_pull: "processing" },
    });

    // 2. Get user credentials
    const { fbPageAccessToken, fbPageId, igUserId } = await ensureFreshPageTokenForUser(userId);

    if (!fbPageAccessToken || !fbPageId) {
      throw new Error("Missing Facebook credentials");
    }

    // 3. Fetch conversations from Meta (last 24 hours activity)
    console.log(`📡 [InitialPull] Fetching conversations from Meta...`);
    const conversations = await fetchRecentConversationsFromMeta({
      fbPageId,
      accessToken: fbPageAccessToken,
      businessIgUserId: igUserId,
    });

    console.log(`✅ [InitialPull] Found ${conversations.length} recent conversations`);

    if (conversations.length === 0) {
      await User.findByIdAndUpdate(userId, {
        $set: {
          first_conv_pull: true,
          conv_pull: "processed",
        },
      });
      return { success: true, conversationsProcessed: 0, timeMs: Date.now() - startTime };
    }

    // 4. Process each conversation: save to DB + fetch messages + analyze
    const results = [];

    for (let i = 0; i < conversations.length; i++) {
      const conv = conversations[i];
      console.log(`📝 [InitialPull] Processing conversation ${i + 1}/${conversations.length}`);

      try {
        const result = await processConversation({
          metaConversation: conv,
          userId,
          fbPageAccessToken,
          fbPageId,
          businessIgUserId: igUserId,
        });
        results.push(result);
      } catch (err) {
        console.error(`❌ [InitialPull] Error processing conversation:`, err.message);
        results.push({ error: err.message });
      }

      if (i < conversations.length - 1) {
        await sleep(META_DELAY_MS);
      }
    }

    // 5. Mark as completed
    await User.findByIdAndUpdate(userId, {
      $set: {
        first_conv_pull: true,
        conv_pull: "processed",
      },
    });

    const timeMs = Date.now() - startTime;
    console.log(
      `✅ [InitialPull] Completed in ${timeMs}ms. Processed: ${results.length} conversations`
    );

    return {
      success: true,
      conversationsProcessed: results.length,
      results,
      timeMs,
    };
  } catch (error) {
    console.error(`❌ [InitialPull] Fatal error:`, error.message);

    await User.findByIdAndUpdate(userId, {
      $set: { conv_pull: "idle" },
    });

    throw error;
  }
}

/**
 * Fetch recent conversations from Meta API
 * Only returns conversations with activity within the last 24 hours.
 * Does NOT assume Meta returns conversations in strict updated_time order —
 * instead, filters each conversation individually and stops pagination
 * when an entire page has zero qualifying conversations.
 */
async function fetchRecentConversationsFromMeta({
  fbPageId,
  accessToken,
  businessIgUserId,
  maxConversations = 50,
}) {
  const conversations = [];
  let after = null;
  let attempts = 0;
  const maxAttempts = 10;
  const cutoffTime = Date.now() - DAY_MS;

  while (attempts < maxAttempts && conversations.length < maxConversations) {
    try {
      const params = {
        access_token: accessToken,
        platform: "instagram",
        limit: 10,
        fields: "id,participants,updated_time",
      };

      if (after) {
        params.after = after;
      }

      const res = await axios.get(`${GRAPH_API_BASE}/${fbPageId}/conversations`, {
        params,
        timeout: 15000,
      });

      const data = res.data?.data || [];
      const paging = res.data?.paging;

      if (data.length === 0) {
        break;
      }

      let qualifiedInPage = 0;

      for (const conv of data) {
        const updatedTime = new Date(conv.updated_time).getTime();

        // Skip conversations older than 24 hours
        if (updatedTime < cutoffTime) {
          console.log(
            `⏭️ [InitialPull] Skipping conversation older than 24h (${new Date(
              updatedTime
            ).toISOString()})`
          );
          continue;
        }

        const participant = conv.participants?.data?.find((p) => p.id !== businessIgUserId);

        if (participant) {
          conversations.push({
            metaConversationId: conv.id,
            participantIgUserId: participant.id,
            participantUsername: participant.username,
            updatedTime: conv.updated_time,
          });
          qualifiedInPage++;
        }
      }

      // If no conversations in this entire page qualified, stop pagination.
      // Meta generally returns newest first, so if a full page is all old,
      // subsequent pages will be even older.
      if (qualifiedInPage === 0) {
        console.log(
          `⏹️ [InitialPull] No qualifying conversations in this page, stopping pagination`
        );
        break;
      }

      if (!paging?.next) {
        break;
      }

      after = paging.cursors?.after;
      attempts++;

      await sleep(META_DELAY_MS);
    } catch (error) {
      console.error(`❌ [InitialPull] Meta API error:`, error.response?.data || error.message);

      if (error.response?.status === 429) {
        console.log(`⏳ [InitialPull] Rate limited, waiting 60s...`);
        await sleep(60000);
        continue;
      }

      break;
    }
  }

  return conversations;
}

/**
 * Process a single conversation: create/update in DB, fetch messages, analyze with Gemini
 */
async function processConversation({
  metaConversation,
  userId,
  fbPageAccessToken,
  fbPageId,
  businessIgUserId,
}) {
  const { metaConversationId, participantIgUserId, participantUsername } = metaConversation;

  // 1. Create standardized conversation ID
  const igConversationId = `igdm:${businessIgUserId}:${participantIgUserId}`;

  // 2. Create or update participant
  const participant = await Participant.findOneAndUpdate(
    { platform: "instagram", igUserId: participantIgUserId },
    {
      $set: {
        username: participantUsername || null,
        lastSeenAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  // 3. Fetch participant profile
  let profileData = null;
  try {
    const profileRes = await axios.get(`${GRAPH_API_BASE}/${participantIgUserId}`, {
      params: {
        access_token: fbPageAccessToken,
        fields: "id,username,name,profile_pic,follower_count",
      },
      timeout: 10000,
    });
    profileData = profileRes.data;

    await Participant.updateOne(
      { _id: participant._id },
      {
        $set: {
          name: profileData.name || null,
          profilePic: profileData.profile_pic || null,
          followerCount: profileData.follower_count || 0,
        },
      }
    );
  } catch (err) {
    console.warn(`⚠️ [InitialPull] Could not fetch profile for ${participantIgUserId}`);
  }

  await sleep(META_DELAY_MS);

  // 4. Fetch last 10 text messages
  const messages = await fetchRecentMessages({
    metaConversationId,
    accessToken: fbPageAccessToken,
    businessIgUserId,
    limit: 10,
  });


  let lastMessage = null;

  if (messages.length > 0) {
    const recentMsg = messages[0];
    const isFromBusiness = recentMsg.from?.id === businessIgUserId;
    lastMessage = {
      text: recentMsg.message || (recentMsg.attachments ? "Sent an attachment" : ""),
      type: recentMsg.attachments?.length ? "image" : "text",
      sender: isFromBusiness ? "me" : "them",
      timestamp: new Date(recentMsg.created_time),
    };
  }

  // 7. Create or update conversation in DB
  // 🔥 UPDATED: Removed unreadCount/creatorHasReplied from here to prevent race conditions.
  // We will let recalculateConversationMetrics handle those fields after messages are saved.
  const conversation = await Conversation.findOneAndUpdate(
    {
      creatorId: userId,
      platform: "instagram",
      igConversationId,
    },
    {
      $setOnInsert: {
        platform: "instagram",
        igConversationId,
        metaThreadId: metaConversationId,
        creatorId: userId,
        participantId: participant._id,
        label: "General",
        labelSource: "auto",
        unreadCount: 0, // Default for new inserts
        creatorHasReplied: false, // Default for new inserts
      },
      $set: {
        lastMessage,
        lastActivityAt: lastMessage?.timestamp || new Date(),
        lastSyncedAt: new Date(),
        // 🔥 REMOVED: unreadCount, lastParticipantMessageAt, creatorHasReplied
        // These are calculated accurately in Step 10
      },
    },
    { upsert: true, new: true }
  );

  // 8. Save messages to database
  await saveMessagesToDatabase({
    messages,
    conversationId: conversation._id,
    participantId: participant._id,
    creatorId: userId,
    businessIgUserId,
  });

  // 9. 🔥 RECALCULATE METRICS
  // This reads the DB *after* saving messages to ensure unreadCount and creatorHasReplied are perfect
  const metrics = await recalculateConversationMetrics(conversation._id);
  const creatorHasReplied = metrics.creatorHasReplied; // Use this authentic value for analysis

  // 10. Analyze with Gemini (only real text messages, exclude system/unsupported)
  const textMessages = messages
    .filter((m) => m.message && m.message.trim() && !m.is_unsupported)
    .map((m) => ({
      sender: m.from?.id === businessIgUserId ? "me" : "them",
      text: m.message,
      createdAtPlatform: new Date(m.created_time),
    }))
    .reverse();

  if (textMessages.length > 0) {
    await analyzeAndUpdateConversation({
      conversationId: conversation._id,
      creatorId: userId,
      participantId: participant._id,
      messages: textMessages,
      creatorHasReplied, // 🔥 Pass the verified DB status
    });
  }

  return {
    conversationId: conversation._id,
    participantUsername,
    messagesCount: messages.length,
    analyzed: textMessages.length > 0,
    creatorHasReplied,
  };
}

/**
 * Fetch recent messages from a Meta conversation
 */
async function fetchRecentMessages({
  metaConversationId,
  accessToken,
  businessIgUserId,
  limit = 25,
}) {
  try {
    const res = await axios.get(`${GRAPH_API_BASE}/${metaConversationId}/messages`, {
      params: {
        access_token: accessToken,
        limit,
        fields:
          "id,created_time,from,to,message,attachments{mime_type,file_url,image_data,video_data}",
      },
      timeout: 15000,
    });

    return res.data?.data || [];
  } catch (error) {
    console.error(
      `❌ [InitialPull] Failed to fetch messages:`,
      error.response?.data || error.message
    );
    return [];
  }
}

/**
 * Save messages to database
 */
async function saveMessagesToDatabase({
  messages,
  conversationId,
  participantId,
  creatorId,
  businessIgUserId,
}) {
  try {
    const messageDocs = messages.map((msg) => {
      const isFromBusiness = msg.from?.id === businessIgUserId;

      let type = "text";
      let text = msg.message || null;
      let mediaUrl = null;
      let mediaType = null;

      if (msg.attachments && msg.attachments.length > 0) {
        const attachment = msg.attachments[0];
        if (attachment.image_data) {
          type = "image";
          mediaType = "image";
          mediaUrl = attachment.image_data?.url || attachment.file_url;
        } else if (attachment.video_data) {
          type = "video";
          mediaType = "video";
          mediaUrl = attachment.video_data?.url || attachment.file_url;
        }
      }

      return {
        conversationId,
        platform: "instagram",
        igMessageId: msg.id,
        sender: isFromBusiness ? "me" : "them",
        senderType: isFromBusiness ? "creator" : "participant",
        senderId: isFromBusiness ? creatorId : participantId,
        senderTypeRef: isFromBusiness ? "users" : "participants",
        type,
        text,
        mediaUrl,
        mediaType,
        isRead: isFromBusiness,
        createdAtPlatform: new Date(msg.created_time),
      };
    });

    await Message.insertMany(messageDocs, { ordered: false });
  } catch (error) {
    if (error.code === 11000) {
      console.log(`ℹ️ [InitialPull] Some messages already exist`);
    } else {
      throw error;
    }
  }
}

/**
 * Analyze conversation with Gemini and update DB
 */
async function analyzeAndUpdateConversation({
  conversationId,
  creatorId,
  participantId,
  messages,
  creatorHasReplied = false,
}) {
  let retries = 0;

  while (retries < GEMINI_MAX_RETRIES) {
    try {
      await sleep(GEMINI_DELAY_MS);

      // 🔥 Pass creatorHasReplied to Gemini analyzer
      const result = await analyzeConversationIntent(messages, creatorHasReplied);

      if (result.error) {
        retries++;
        console.warn(
          `⚠️ [InitialPull] Gemini analysis failed, retry ${retries}/${GEMINI_MAX_RETRIES}`
        );
        await sleep(1000 * retries);
        continue;
      }

      const now = new Date();

      // Update conversation with analysis results (including leadUserContext)
      await Conversation.updateOne(
        { _id: conversationId },
        {
          $set: {
            conversationIntent: result.intent,
            conversationIntentConfidence: result.confidence,
            conversationIntentUpdatedAt: now,
            conversationLeadSeriousness: result.leadScore || 0,
            conversationLeadSeriousnessUpdatedAt: now,
            conversationLeadQuality: result.leadQuality || "none",
            leadFactors: result.factors || [],
            leadUserContext: result.intent === "Lead" ? (result.userContext || null) : null,
            followUpStatus: result.followUp,
            followUpAnalyzedAt: now,
            labelSource: "ai",
          },
        }
      );

      console.log(
        `✅ [InitialPull] Analyzed: Intent=${result.intent}, LeadScore=${result.leadScore}, UserContext=${result.userContext || "none"}, FollowUp=${result.followUp?.needed}, CreatorHasReplied=${creatorHasReplied}`
      );

      // ─────────────────────────────────────────────────────
      // WhatsApp Lead Alert — queue via Agenda
      // ─────────────────────────────────────────────────────
      if (result.intent === "Lead" && result.leadScore > 0.65) {
        const freshConv = await Conversation.findById(conversationId)
          .select("whatsappAlertMessageId")
          .lean();

        if (freshConv && !freshConv.whatsappAlertMessageId) {
          await agenda.now("send-whatsapp-alert", {
            conversationId: conversationId.toString(),
            creatorId: creatorId.toString(),
            participantId: participantId.toString(),
            attempt: 0,
          });
          console.log(`[InitialPull] 📋 WhatsApp alert queued for conversation ${conversationId}`);
        }
      }

      return;
    } catch (error) {
      retries++;
      console.error(`❌ [InitialPull] Gemini error:`, error.message);

      if (retries < GEMINI_MAX_RETRIES) {
        await sleep(2000 * retries);
      }
    }
  }

  console.warn(`⚠️ [InitialPull] Gemini analysis failed after ${GEMINI_MAX_RETRIES} retries`);
}

/**
 * Check the status of initial conversation pull
 */
export async function getInitialPullStatus(userId) {
  const user = await User.findById(userId)
    .select("first_conv_pull conv_pull creator_whatsapp_num")
    .lean();

  if (!user) {
    return { error: "User not found" };
  }

  return {
    hasWhatsApp: !!user.creator_whatsapp_num,
    firstPullDone: user.first_conv_pull === true,
    pullStatus: user.conv_pull || "idle",
    needsWhatsApp: !user.creator_whatsapp_num,
    needsInitialPull: !user.first_conv_pull && user.conv_pull !== "processing",
    isProcessing: user.conv_pull === "processing",
  };
}

/**
 * Save creator's WhatsApp number
 */
export async function saveCreatorWhatsApp(userId, countryCode, phoneNumber) {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  if (cleanPhone.length !== 10) {
    throw new Error("Phone number must be 10 digits");
  }

  const cleanCode = countryCode.replace(/\D/g, "");
  if (!cleanCode || cleanCode.length < 1 || cleanCode.length > 4) {
    throw new Error("Invalid country code");
  }

  const fullNumber = `+${cleanCode}${cleanPhone}`;

  await User.findByIdAndUpdate(userId, {
    $set: {
      creator_whatsapp_num: fullNumber,
      updated_at: new Date(),
    },
  });

  return { success: true, whatsappNumber: fullNumber };
}
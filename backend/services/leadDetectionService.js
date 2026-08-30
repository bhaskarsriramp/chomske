// services/leadDetectionService.js
import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";
import { analyzeConversationIntent } from "./geminiConversationAnalyser.js";
import { publishConversationUpdate } from "./realtimePublisher.js";
import agenda from "../utils/agenda.js";


const CONTEXT_MESSAGE_LIMIT = 15;

/**
 * Re-analyze a conversation (called from syncLatestConversation)
 */
export async function reanalyzeConversation({
  conversationId,
  creatorId,
  reason = "manual",
}) {
  const startTime = Date.now();

  try {
    console.log(`[ReAnalyze] Starting for conversation: ${conversationId} | Reason: ${reason}`);

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return {
        success: false,
        reason: "CONVERSATION_NOT_FOUND",
        executionMs: Date.now() - startTime,
      };
    }

    const recentMessages = await Message.find({
      conversationId,
      text: { $exists: true, $ne: null },
      isDeleted: false,
      type: { $ne: "system" }, // Exclude system messages — they aren't real conversation
    })
      .sort({ createdAtPlatform: -1 })
      .limit(CONTEXT_MESSAGE_LIMIT)
      .select("sender text type createdAtPlatform")
      .lean();

    if (recentMessages.length === 0) {
      console.log(`[ReAnalyze] No messages to analyze`);
      return {
        success: false,
        reason: "NO_MESSAGES",
        executionMs: Date.now() - startTime,
      };
    }

    const contextMessages = recentMessages.reverse();
    const creatorHasReplied = recentMessages.some(m => m.sender === "me" && m.type === "text");
    const lastMessage = contextMessages[contextMessages.length - 1];
    const lastSenderIsUser = lastMessage?.sender !== "me";

    // 🔥 Update creatorHasReplied in DB if needed
    if (creatorHasReplied && !conversation.creatorHasReplied) {
      await Conversation.updateOne(
        { _id: conversationId },
        { $set: { creatorHasReplied: true } }
      );
      conversation.creatorHasReplied = true;
    }

    console.log(`[ReAnalyze] Analyzing ${contextMessages.length} messages | CreatorReplied: ${creatorHasReplied} | LastMsgFromUser: ${lastSenderIsUser}`);

    const geminiResult = await analyzeConversationIntent(contextMessages, creatorHasReplied);

    if (geminiResult.error) {
      console.log(`[ReAnalyze] ⚠️ Gemini error - preserving existing data`);
      return {
        success: false,
        reason: "GEMINI_ERROR",
        preservedExistingData: true,
        executionMs: Date.now() - startTime,
      };
    }

    const previousIntent = conversation.conversationIntent || "General";
    const intentChanged = previousIntent !== geminiResult.intent;
    const now = new Date();

    // Never downgrade from Lead to General — once a lead, only a human can change it back
    const isDowngrade = previousIntent === "Lead" && geminiResult.intent === "General";
    if (isDowngrade) {
      console.log(`[ReAnalyze] 🛡️ Skipping downgrade from Lead to General for conversation ${conversationId}`);
    }

    const shouldUpdateIntent =
      (intentChanged && !isDowngrade) ||
      (geminiResult.intent === "Lead" &&
        geminiResult.leadScore > (conversation.conversationLeadSeriousness || 0));

    const previousFollowUpNeeded = conversation.followUpStatus?.needed || false;
    const newFollowUpNeeded = geminiResult.followUp.needed;
    const followUpChanged = previousFollowUpNeeded !== newFollowUpNeeded ||
      conversation.followUpStatus?.priority !== geminiResult.followUp.priority;

    if (shouldUpdateIntent || followUpChanged) {
      if (shouldUpdateIntent) {
        conversation.conversationIntent = geminiResult.intent;
        conversation.conversationIntentConfidence = geminiResult.confidence;
        conversation.conversationIntentUpdatedAt = now;

        if (geminiResult.intent === "Lead") {
          conversation.conversationLeadSeriousness = geminiResult.leadScore;
          conversation.conversationLeadSeriousnessUpdatedAt = now;
          conversation.conversationLeadQuality = geminiResult.leadQuality;
          conversation.leadFactors = geminiResult.factors;
          conversation.leadUserContext = geminiResult.userContext || null;
        } else {
          conversation.conversationLeadSeriousness = 0;
          conversation.conversationLeadQuality = "none";
          conversation.leadFactors = [];
          conversation.leadUserContext = null;
        }

        conversation.labelSource = "ai";
      }

      if (newFollowUpNeeded) {
        conversation.followUpStatus = {
          needed: true,
          priority: geminiResult.followUp.priority,
          reason: geminiResult.followUp.reason,
          suggestedAction: geminiResult.followUp.suggestedAction,
          detectedAt: conversation.followUpStatus?.needed ? conversation.followUpStatus.detectedAt : now,
          dismissedAt: null,
          completedAt: null,
        };
      } else {
        conversation.followUpStatus = {
          needed: false,
          priority: null,
          reason: geminiResult.followUp.reason || "No follow-up needed",
          suggestedAction: null,
          detectedAt: null,
          dismissedAt: null,
          completedAt: null,
        };
      }
      conversation.followUpAnalyzedAt = now;

      await conversation.save();

      publishConversationUpdate({
        creatorId: creatorId.toString(),
        conversationId: conversationId.toString(),
        update: {
          label: conversation.conversationIntent,
          labelIntentConfidence: geminiResult.confidence,
          labelLeadSeriousness: geminiResult.leadScore || 0,
          labelLeadQuality: geminiResult.leadQuality || "none",
          factors: geminiResult.factors || [],
          followUpStatus: conversation.followUpStatus,
          lastParticipantMessageAt: conversation.lastParticipantMessageAt,
          creatorHasReplied: conversation.creatorHasReplied,
        },
      });

      console.log(
        `[ReAnalyze] ✅ Intent: ${previousIntent} → ${geminiResult.intent} | LeadScore: ${geminiResult.leadScore?.toFixed(2)} (${geminiResult.leadQuality}) | FollowUp: ${conversation.followUpStatus.needed ? conversation.followUpStatus.priority : "not needed"}`
      );
    } else {
      console.log(
        `[ReAnalyze] ℹ️ No changes: Intent=${previousIntent}, FollowUp=${previousFollowUpNeeded ? "needed" : "not needed"}`
      );
    }

    // ─────────────────────────────────────────────────────
    // WhatsApp Lead Alert (fire-and-forget)
    // Runs independently of whether intent/followup changed —
    // so existing leads that lost their alert still get notified.
    // ─────────────────────────────────────────────────────
    if (
      geminiResult.intent === "Lead" &&
      geminiResult.leadScore > 0.65 &&
      !conversation.whatsappAlertMessageId
    ) {
      await agenda.now("send-whatsapp-alert", {
        conversationId: conversationId.toString(),
        creatorId: creatorId.toString(),
        participantId: conversation.participantId.toString(),
        attempt: 0,
      });
      console.log(`[ReAnalyze] 📋 WhatsApp alert queued for conversation ${conversationId}`);
    }

    return {
      success: true,
      intent: geminiResult.intent,
      followUp: geminiResult.followUp,
      intentChanged: shouldUpdateIntent,
      followUpChanged,
      executionMs: Date.now() - startTime,
    };

  } catch (err) {
    console.error("[ReAnalyze] ❌ Error:", err.message);
    return {
      success: false,
      error: err.message,
      executionMs: Date.now() - startTime,
    };
  }
}


export async function detectLeadRealtime({
  conversationId,
  messageId,
  messageText,
  creatorId,
  isNewConversation = false,
}) {
  const startTime = Date.now();

  try {
    // ─────────────────────────────────────────────────────
    // STEP 1: Skip only truly empty messages
    // ─────────────────────────────────────────────────────
    if (!messageText || messageText.trim() === "") {
      console.log(`[LeadDetect] Skipping empty message`);

      await Message.updateOne(
        { _id: messageId },
        {
          $set: {
            aiProcess: "skipped",
            processedAt: new Date(),
            skipReason: "empty_message",
          },
        }
      );

      return {
        processed: false,
        reason: "EMPTY_MESSAGE",
        executionMs: Date.now() - startTime,
      };
    }

    // Mark as processing
    await Message.updateOne(
      { _id: messageId },
      { $set: { aiProcess: "processing" } }
    );

    // ─────────────────────────────────────────────────────
    // STEP 2: Build Conversation Context
    // Include ALL recent messages for full context
    // ─────────────────────────────────────────────────────
    let contextMessages = [];
    let creatorHasReplied = false;

    if (isNewConversation) {
      console.log(`[LeadDetect] New conversation - analyzing single message`);
      contextMessages = [
        {
          sender: "them",
          text: messageText,
          createdAtPlatform: new Date(),
        },
      ];
      creatorHasReplied = false; // New conversation = creator hasn't replied
    } else {
      // Fetch recent messages (BOTH sides for full context)
      const recentMessages = await Message.find({
        conversationId,
        text: { $exists: true, $ne: null },
        type: { $ne: "system" }, // Exclude system messages — they aren't real conversation
      })
        .sort({ createdAtPlatform: -1 })
        .limit(CONTEXT_MESSAGE_LIMIT)
        .select("sender text type createdAtPlatform")
        .lean();

      if (recentMessages.length === 0) {
        contextMessages = [
          {
            sender: "them",
            text: messageText,
            createdAtPlatform: new Date(),
          },
        ];
        creatorHasReplied = false;
      } else {
        // Reverse to chronological order (oldest first)
        contextMessages = recentMessages.reverse();

        // 🔥 CRITICAL: Check if creator has replied at least once (system messages don't count)
        creatorHasReplied = recentMessages.some(m => m.sender === "me" && m.type === "text");
      }
    }

    // Determine who sent the last message
    const lastMessage = contextMessages[contextMessages.length - 1];
    const lastSenderIsUser = lastMessage?.sender !== "me";

    console.log(`[LeadDetect] Analyzing ${contextMessages.length} messages | CreatorHasReplied: ${creatorHasReplied} | LastMsgFromUser: ${lastSenderIsUser}`);

    // ─────────────────────────────────────────────────────
    // STEP 3: Gemini Analysis (Intent + Follow-up)
    // 🔥 Pass creatorHasReplied to Gemini
    // ─────────────────────────────────────────────────────
    const geminiResult = await analyzeConversationIntent(contextMessages, creatorHasReplied);

    // 🔥 CRITICAL: If Gemini failed, DON'T downgrade existing lead data
    if (geminiResult.error) {
      console.log(`[LeadDetect] ⚠️ Gemini error - preserving existing conversation data`);

      await Message.updateOne(
        { _id: messageId },
        {
          $set: {
            aiProcess: "failed",
            processedAt: new Date(),
            aiProcessError: "Gemini analysis failed",
          },
        }
      );

      return {
        processed: false,
        reason: "GEMINI_ERROR",
        preservedExistingData: true,
        executionMs: Date.now() - startTime,
      };
    }

    // Mark message as processed
    await Message.updateOne(
      { _id: messageId },
      {
        $set: {
          aiProcess: "completed",
          processedAt: new Date(),
          intentSource: "gemini",
          geminiIntent: geminiResult.intent,
          geminiConfidence: geminiResult.confidence,
          geminiLeadScore: geminiResult.leadScore,
          geminiLeadQuality: geminiResult.leadQuality,
        },
      }
    );

    // ─────────────────────────────────────────────────────
    // STEP 4: Update Conversation (Intent + Follow-up)
    // ─────────────────────────────────────────────────────
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    const previousIntent = conversation.conversationIntent || "General";
    const intentChanged = previousIntent !== geminiResult.intent;
    const now = new Date();

    // Never downgrade from Lead to General — once a lead, only a human can change it back
    const isDowngrade = previousIntent === "Lead" && geminiResult.intent === "General";
    if (isDowngrade) {
      console.log(`[LeadDetect] 🛡️ Skipping downgrade from Lead to General for conversation ${conversationId}`);
    }

    // Check if intent should update
    const shouldUpdateIntent =
      isNewConversation ||
      (intentChanged && !isDowngrade) ||
      (geminiResult.intent === "Lead" &&
        geminiResult.leadScore > (conversation.conversationLeadSeriousness || 0));

    // Check if follow-up status changed
    const previousFollowUpNeeded = conversation.followUpStatus?.needed || false;
    const newFollowUpNeeded = geminiResult.followUp.needed;
    const followUpChanged = previousFollowUpNeeded !== newFollowUpNeeded ||
      conversation.followUpStatus?.priority !== geminiResult.followUp.priority;

    // Update conversation if anything changed
    if (shouldUpdateIntent || followUpChanged) {

      // Update intent fields
      if (shouldUpdateIntent) {
        conversation.conversationIntent = geminiResult.intent;
        conversation.conversationIntentConfidence = geminiResult.confidence;
        conversation.conversationIntentUpdatedAt = now;

        if (geminiResult.intent === "Lead") {
          conversation.conversationLeadSeriousness = geminiResult.leadScore;
          conversation.conversationLeadSeriousnessUpdatedAt = now;
          conversation.conversationLeadQuality = geminiResult.leadQuality;
          conversation.leadFactors = geminiResult.factors;
          conversation.leadUserContext = geminiResult.userContext || null;
        } else {
          // Clear lead fields if not a lead
          conversation.conversationLeadSeriousness = 0;
          conversation.conversationLeadQuality = "none";
          conversation.leadFactors = [];
          conversation.leadUserContext = null;
        }

        conversation.labelSource = "ai";
      }

      // 🔥 Update follow-up status
      if (newFollowUpNeeded) {
        conversation.followUpStatus = {
          needed: true,
          priority: geminiResult.followUp.priority,
          reason: geminiResult.followUp.reason,
          suggestedAction: geminiResult.followUp.suggestedAction,
          detectedAt: conversation.followUpStatus?.needed ? conversation.followUpStatus.detectedAt : now,
          dismissedAt: null,
          completedAt: null,
        };
      } else {
        conversation.followUpStatus = {
          needed: false,
          priority: null,
          reason: geminiResult.followUp.reason || "No follow-up needed",
          suggestedAction: null,
          detectedAt: null,
          dismissedAt: null,
          completedAt: null,
        };
      }
      conversation.followUpAnalyzedAt = now;

      await conversation.save();

      // ─────────────────────────────────────────────────────
      // STEP 5: Publish to UI (Fire-and-forget - NO await)
      // ─────────────────────────────────────────────────────
      publishConversationUpdate({
        creatorId: creatorId.toString(),
        conversationId: conversationId.toString(),
        update: {
          // Intent fields
          label: conversation.conversationIntent,
          labelIntentConfidence: geminiResult.confidence,
          labelLeadSeriousness: geminiResult.leadScore || 0,
          labelLeadQuality: geminiResult.leadQuality || "none",
          factors: geminiResult.factors || [],

          // Follow-up fields
          followUpStatus: conversation.followUpStatus,

          // 🔥 CRITICAL: Include these so frontend can compute category correctly
          lastParticipantMessageAt: conversation.lastParticipantMessageAt,
          creatorHasReplied: creatorHasReplied,
        },
      });

      console.log(
        `[LeadDetect] ✅ ${isNewConversation ? "[NEW] " : ""}Intent: ${previousIntent} → ${geminiResult.intent} | LeadScore: ${geminiResult.leadScore?.toFixed(2)} (${geminiResult.leadQuality}) | CreatorReplied: ${creatorHasReplied} | LastMsgFromUser: ${lastSenderIsUser} | FollowUp: ${conversation.followUpStatus.needed ? conversation.followUpStatus.priority : "not needed"}`
      );
    } else {
      console.log(
        `[LeadDetect] ℹ️ No changes: Intent=${previousIntent}, LeadScore=${geminiResult.leadScore?.toFixed(2)}, CreatorReplied=${creatorHasReplied}, FollowUp=${previousFollowUpNeeded ? "needed" : "not needed"}`
      );
    }

    // ─────────────────────────────────────────────────────
    // STEP 4.5: WhatsApp Lead Alert — queue via Agenda
    // ─────────────────────────────────────────────────────
    if (
      geminiResult.intent === "Lead" &&
      geminiResult.leadScore > 0.65 &&
      !conversation.whatsappAlertMessageId
    ) {
      await agenda.now("send-whatsapp-alert", {
        conversationId: conversationId.toString(),
        creatorId: creatorId.toString(),
        participantId: conversation.participantId.toString(),
        attempt: 0,
      });
      console.log(`[LeadDetect] 📋 WhatsApp alert queued for conversation ${conversationId}`);
    }

    return {
      processed: true,
      isNewConversation,
      previousIntent,
      newIntent: geminiResult.intent,
      intentChanged: shouldUpdateIntent,
      confidence: geminiResult.confidence,
      leadScore: geminiResult.leadScore,
      leadQuality: geminiResult.leadQuality,
      factors: geminiResult.factors,
      followUp: geminiResult.followUp,
      followUpChanged,
      creatorHasReplied,
      lastSenderIsUser,
      messagesAnalyzed: contextMessages.length,
      executionMs: Date.now() - startTime,
    };
  } catch (err) {
    console.error("[LeadDetect] ❌ Error:", err.message);

    try {
      await Message.updateOne(
        { _id: messageId },
        { $set: { aiProcess: "failed", aiProcessError: err.message } }
      );
    } catch (updateErr) {
      // Ignore
    }

    return {
      processed: false,
      error: err.message,
      executionMs: Date.now() - startTime,
    };
  }
}

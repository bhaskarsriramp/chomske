import crypto from "crypto";
import Conversation from "../models/Conversation.js";
import User from "../models/User.js";
import Participant from "../models/Participant.js";
import DmsUsage from "../models/DmsUsage.js";
import MagicToken from "../models/MagicToken.js";
import { sendWhatsAppAlert } from "../services/whatsappMessage.js";
import redis from "../../src/realtime/redis.js";

const MAX_ATTEMPTS = 3;
const WABA_24H_LIMIT = 1900;

function randomRescheduleSeconds() {
  const buckets = [30, 45, 60, 90, 120];
  const bucket = buckets[Math.floor(Math.random() * buckets.length)];
  return Math.floor(Math.random() * bucket) + 1;
}

// Returns a Redis key for the given Date, bucketed by UTC hour
function wabaHourKey(date) {
  return `waba:global:${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}-${date.getUTCHours()}`;
}

// Sum all 24 hourly buckets to get the rolling 24h total
async function getWaba24hTotal() {
  const now = new Date();
  const pipeline = redis.pipeline();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getTime() - i * 3600 * 1000);
    pipeline.get(wabaHourKey(d));
  }
  const results = await pipeline.exec();
  let total = 0;
  for (const [err, count] of results) {
    if (!err && count) total += parseInt(count, 10);
  }
  return total;
}

// Increment the current hour's bucket after a successful send
async function incrementWabaCounter() {
  const key = wabaHourKey(new Date());
  await redis.incr(key);
  await redis.expire(key, 25 * 3600); // 25h TTL so it stays for the full rolling window
}

export const defineSendWhatsAppAlertJob = (agenda) => {
  agenda.define("send-whatsapp-alert", async (job) => {
    const { conversationId, creatorId, participantId, attempt = 0 } = job.attrs.data;

    console.log(`[WA-Alert] Processing | Conv: ${conversationId} | Attempt: ${attempt + 1}/${MAX_ATTEMPTS}`);

    // ── Max attempts guard ──────────────────────────────────────────────────
    if (attempt >= MAX_ATTEMPTS) {
      console.log(`[WA-Alert] ❌ Max attempts reached for conversation ${conversationId} — giving up`);
      return;
    }

    // ── Idempotency: skip if already sent ──────────────────────────────────
    const conversation = await Conversation.findById(conversationId)
      .select("whatsappAlertMessageId leadUserContext participantId")
      .lean();

    if (!conversation) {
      console.log(`[WA-Alert] Conversation ${conversationId} not found — skipping`);
      return;
    }

    if (conversation.whatsappAlertMessageId) {
      console.log(`[WA-Alert] Already sent (wamid: ${conversation.whatsappAlertMessageId}) — skipping`);
      return;
    }

    // ── Platform 24h limit (rolling window across ALL creators) ────────────
    const waba24hTotal = await getWaba24hTotal();
    if (waba24hTotal >= WABA_24H_LIMIT) {
      // Don't consume an attempt — reschedule for 1 hour (when oldest bucket drops off)
      await agenda.schedule(
        new Date(Date.now() + 3600 * 1000),
        "send-whatsapp-alert",
        { conversationId, creatorId, participantId, attempt }
      );
      console.log(`[WA-Alert] ⚠️ Platform 24h limit hit (${waba24hTotal}/${WABA_24H_LIMIT}) — rescheduled in 1h`);
      return;
    }

    // ── Per-creator monthly quota ───────────────────────────────────────────
    const now = new Date();
    const user = await User.findById(creatorId).select("creator_whatsapp_num leads_plan_limit");

    if (!user?.creator_whatsapp_num) {
      console.log(`[WA-Alert] Creator ${creatorId} has no WhatsApp number — skipping`);
      return;
    }

    const currentUsage = await DmsUsage.findOne({
      user_id: creatorId,
      year: now.getFullYear(),
      month: now.getMonth() + 1,
    }).select("lead_alerts_sent").lean();

    const currentLeadAlerts = currentUsage?.lead_alerts_sent || 0;

    if (currentLeadAlerts >= user.leads_plan_limit) {
      console.log(`[WA-Alert] ⚠️ Creator monthly limit reached (${currentLeadAlerts}/${user.leads_plan_limit}) — skipping`);
      return;
    }

    // ── Build message payload ──────────────────────────────────────────────
    const resolvedParticipantId = participantId || conversation.participantId;
    const participant = await Participant.findById(resolvedParticipantId).select("name username").lean();
    const leadName = participant?.name || participant?.username || "Someone";
    const leadMessage = conversation.leadUserContext || "Interested in your services";

    // ── Generate magic token ───────────────────────────────────────────────
    const magicTokenStr = crypto.randomBytes(32).toString("hex");
    await MagicToken.create({
      token: magicTokenStr,
      user_id: creatorId,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      chatUsername: participant?.username || null,
    });

    // ── Send ───────────────────────────────────────────────────────────────
    try {
      const result = await sendWhatsAppAlert(
        user.creator_whatsapp_num,
        leadName,
        leadMessage,
        magicTokenStr
      );

      const wamid = result?.messages?.[0]?.id;
      if (wamid) {
        // Increment platform counter first
        await incrementWabaCounter();

        await Conversation.updateOne(
          { _id: conversationId },
          { $set: { whatsappAlertMessageId: wamid, whatsappAlertSentAt: now } }
        );

        const updatedUsage = await DmsUsage.findOneAndUpdate(
          { user_id: creatorId, year: now.getFullYear(), month: now.getMonth() + 1 },
          { $inc: { lead_alerts_sent: 1 } },
          { new: true, upsert: true }
        );

        if (updatedUsage.lead_alerts_sent >= user.leads_plan_limit) {
          await User.updateOne({ _id: creatorId }, { $set: { lead_agent: false } });
          console.log(`[WA-Alert] 🛑 Creator limit reached (${updatedUsage.lead_alerts_sent}/${user.leads_plan_limit}) — lead_agent disabled`);
        }

        console.log(`[WA-Alert] ✅ Sent | wamid: ${wamid} | Conv: ${conversationId} | Platform 24h total: ${waba24hTotal + 1}/${WABA_24H_LIMIT}`);
      } else {
        console.log(`[WA-Alert] ⚠️ No wamid in response for conversation ${conversationId}`);
      }
    } catch (err) {
      const delaySec = randomRescheduleSeconds();
      console.error(`[WA-Alert] ❌ Failed (attempt ${attempt + 1}/${MAX_ATTEMPTS}): ${err.message}`);

      if (attempt + 1 < MAX_ATTEMPTS) {
        await agenda.schedule(
          new Date(Date.now() + delaySec * 1000),
          "send-whatsapp-alert",
          { conversationId, creatorId, participantId, attempt: attempt + 1 }
        );
        console.log(`[WA-Alert] 🔄 Rescheduled in ${delaySec}s`);
      } else {
        console.log(`[WA-Alert] ❌ Max attempts exhausted for conversation ${conversationId}`);
      }
    }
  });
};

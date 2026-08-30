// services/metaSender.js
import axios from "axios";
import qs from "qs";
import ConversationState from "../models/ConversationState.js";
const FB_API = "https://graph.facebook.com/v24.0";

/**
 * Shared axios instance with sane defaults
 */
const http = axios.create({
  timeout: 15000,
  validateStatus: (s) => s >= 200 && s < 500,
});

http.interceptors.response.use(
  (r) => r,
  (e) => {
    const cfg = e.config || {};
    const urlWithQuery =
      cfg.url + (cfg.params ? `?${qs.stringify(cfg.params)}` : "");
    const body = e.response?.data || { message: e.message };
    console.error("[META HTTP ERROR]", urlWithQuery, JSON.stringify(body, null, 2));
    return Promise.reject(e);
  }
);

/* =========================================================
   PUBLIC COMMENT REPLY
   ========================================================= */
export async function replyToCommentPublic(
  commentId,
  replyText,
  pageAccessToken
) {
  if (!commentId || !replyText || !pageAccessToken) {
    throw new Error("Missing required params for public comment reply");
  }

  const url = `${FB_API}/${commentId}/replies`;

  const { data, status } = await http.post(
    url,
    { message: replyText },
    {
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
      },
    }
  );

  if (status >= 400) {
    const err = new Error("Public comment reply failed");
    err.details = data?.error || data;
    throw err;
  }

  console.log("✅ Public reply sent:", {
    commentId,
    replyText,
  });

  return data;
}

/* =========================================================
   PRIVATE DM (COMMENT_ID OR USER_ID)
   ========================================================= */

export async function sendInitialDM({
  fbPageId,
  commentId,
  automation,
  pageAccessToken,
  igUserId,
  igUsername,
}) {
  try {
    // ONLY send button DM, nothing else
    const buttonPayload = {
      type: "postback",
      title: automation.buttonText,
      payload: `FLOW_START_${automation._id}`,
    };

    const url = `${FB_API}/${fbPageId}/messages`;
    const buttonBody = {
      recipient: { comment_id: String(commentId) },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: automation.dmMessage,
            buttons: [buttonPayload],
          },
        },
      },
    };

    // Create ConversationState FIRST before sending DM
    const firstNode = automation.flowNodes?.[0];

    await ConversationState.create({
      userId: automation.userId,
      automationId: automation._id,
      commentId: commentId,
      igUserId: igUserId,
      igUsername: igUsername,
      currentFlowId: String(automation.flowNodes[0]?.id),
      flowConfig: automation.flowNodes,
      conversationHistory: [
        {
          flowId: String(firstNode?.id),
          flowName: "INITIAL",
          messageSent: automation.dmMessage,
          timestamp: new Date(),
        },
      ],
      status: "active",
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    console.log("✅ ConversationState created");

    const { data: btnData, status: btnStatus } = await http.post(
      url,
      buttonBody,
      { params: { access_token: pageAccessToken } }
    );

    if (btnStatus >= 400) {
      throw new Error(`Button send failed: ${JSON.stringify(btnData)}`);
    }

    console.log("✅ Initial DM button sent");

    return { ok: true };
  } catch (err) {
    console.error("❌ Error in sendInitialDM:", err.message);
    throw err;
  }
}

/*
   GENERIC FLOW MESSAGE SENDER
   (Used by Agenda Worker + Flow Engine)
   ========================================================= */
export async function sendFlowMessage({
  recipient,
  flowNode,
  pageAccessToken,
  fbPageId,
}) {
  if (!recipient || !flowNode || !pageAccessToken || !fbPageId) {
    throw new Error("sendFlowMessage: missing required parameters");
  }

  const { type } = flowNode;
  const url = `${FB_API}/${fbPageId}/messages`;

  const doPost = async (body) => {
    const { data, status } = await http.post(url, body, {
      params: { access_token: pageAccessToken },
    });

    if (status >= 400) {
      const err = new Error(`Flow message failed: ${type}`);
      err.details = data?.error || data;
      throw err;
    }

    return data;
  };

  switch (type) {
    case "text": {
      return doPost({
        recipient,
        message: { text: flowNode.message || "" },
      });
    }

    case "button": {
      const buttons = (flowNode.buttons || []).slice(0, 3).map((b) => {
        if (b.type === "postback" || b.payload) {
          return {
            type: "postback",
            title: (b.text || b.title || "Select").slice(0, 20),
            payload: b.payload || "EMPTY_PAYLOAD",
          };
        }

        return {
          type: "web_url",
          title: (b.text || b.title || "Open").slice(0, 20),
          url: b.url || b.link,
        };
      });

      return doPost({
        recipient,
        message: {
          attachment: {
            type: "template",
            payload: {
              template_type: "button",
              text: flowNode.message || "Choose one:",
              buttons,
            },
          },
        },
      });
    }

    case "generic": {
      const elements = (flowNode.cards || []).slice(0, 10).map((c) => ({
        title: c.title,
        subtitle: c.subtitle,
        image_url: c.image_url,
        buttons: c.button
          ? [
              {
                type: "web_url",
                url: c.button.url,
                title: (c.button.text || "Open").slice(0, 20),
              },
            ]
          : undefined,
      }));

      return doPost({
        recipient,
        message: {
          attachment: {
            type: "template",
            payload: {
              template_type: "generic",
              elements,
            },
          },
        },
      });
    }

    case "media": {
      if (!flowNode.media_url) {
        throw new Error("media_url is required for media message");
      }

      return doPost({
        recipient,
        message: {
          attachment: {
            type: "image",
            payload: { url: flowNode.media_url },
          },
        },
      });
    }

    default:
      throw new Error(`Unknown flow node type: ${type}`);
  }
}

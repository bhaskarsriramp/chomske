import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import axios from "axios";
const router = express.Router();
import USER from "../models/User.js";
import cookie from "cookie";
import Subscriptions from "../models/Subscriptions.js";
import Automation from "../models/Automation.js";
import RepliedComment from "../models/RepliedComment.js";
import mongoose from 'mongoose';
router.use(cookieParser());
import authenticateToken from "../middleware/authenticateTokenProfessional.js";
import generateJWTtoken  from "../middleware/generateJWTtoken.js";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import Razorpay from "razorpay";
import { Storage } from '@google-cloud/storage';

// No keyFilename: credentials come from Application Default Credentials — the
// GCE VM's attached service account (short-lived, auto-rotated tokens, nothing
// on disk). Locally it's whatever `gcloud auth application-default login` wrote.
const storage = new Storage();

const bucketName = "myhandlebucket"; 
const bucket = storage.bucket(bucketName);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB - adjust based on your needs
    files: 1, // Only allow 1 file per request
  },
  fileFilter: (req, file, cb) => {
    // Optional but recommended: validate file types
    const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf'

    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images are allowed.'));
    }
  },
});
const IPDATA_KEY = process.env.IPDATA_KEY;
// Not a secret — this is the same public App ID InstagramConnect.js sends to
// Facebook's own /dialog/oauth on the frontend, so it's hardcoded here too
// rather than depending on an env var that isn't set on the VM.
const META_APP_ID = "1360956302356492";
const META_APP_SECRET = process.env.META_APP_SECRET;
const META_REDIRECT_URI = "https://chomske.com/api/usersOn/meta-callback";
const META_STATE_SECRET = "change_me_super_secret";

// Instagram Business Login — separate app identity from the Facebook Login
// for Business app above (App → Instagram → API setup with Instagram login).
// Not a secret, same reasoning as META_APP_ID.
const INSTAGRAM_APP_ID = "4361873620712464";
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET;

const OID = (v) => new mongoose.Types.ObjectId(String(v));
const actorKey = (model, id) => `${model}:${id.toString()}`;


const RZP_KEY_ID = process.env.RZP_KEY_ID;
const RZP_KEY_SECRET = process.env.RZP_KEY_SECRET;

const rz = new Razorpay({
  key_id: RZP_KEY_ID,
  key_secret: RZP_KEY_SECRET,
});





async function getWithRetries(url, { retries = 3, timeout = 5000 } = {}) {
  let lastErr = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await axios.get(url, { timeout });
      return resp.data;
    } catch (err) {
      lastErr = err;
      const status = err?.response?.status;
      const transient =
        status === 429 ||
        (status >= 500 && status < 600) ||
        err.code === "ECONNABORTED";
      if (attempt < retries && transient) {
        const delayMs = 500 * attempt; // 500, 1000, 1500
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      break;
    }
  }

  // Surface a clean error
  const apiError = lastErr?.response?.data?.error;
  const message =
    apiError?.message || lastErr?.message || "Failed to fetch Instagram media";
  const e = new Error(message);
  if (apiError) {
    e.details = {
      type: apiError.type,
      code: apiError.code,
      fbtrace_id: apiError.fbtrace_id,
    };
  }
  throw e;
}
function isValidUrl(str) {
  try { new URL(str); return true; } catch { return false; }
}
const ALLOWED = new Set([
  "keywords",
  "hasPublicReply",
  "publicReply",
  "dm.enabled",
  "dm.message",
  "dm.button",
  "dm.button.text",
  "dm.button.url",
]);


const IG_API_VERSION = "v21.0"; // bump if you’re targeting a newer Graph version

// Axios client
const ig = axios.create({
  baseURL: `https://graph.facebook.com/${IG_API_VERSION}`,
  timeout: 20000,
});


const FB_API = "https://graph.facebook.com/v24.0";
const MS_DAY = 24 * 60 * 60 * 1000;
const FALLBACK_58_DAYS_MS = 58 * MS_DAY;

async function verifyPostsExist(postIds, fbPageAccessToken) {
  if (!postIds || postIds.length === 0) return {};
  
  // Meta Graph API batch requests support up to 50 requests per batch
  const BATCH_SIZE = 50;
  const results = {};
  
  // Split into chunks of 50
  for (let i = 0; i < postIds.length; i += BATCH_SIZE) {
    const chunk = postIds.slice(i, i + BATCH_SIZE);
    
    // Build batch request array
    const batchRequests = chunk.map((postId) => ({
      method: "GET",
      relative_url: `${postId}?fields=id,media_type,caption,media_url,thumbnail_url,timestamp`,
    }));
    
    try {
      const response = await axios.post(
        `https://graph.facebook.com/v24.0/`,
        null,
        {
          params: {
            batch: JSON.stringify(batchRequests),
            access_token: fbPageAccessToken,
          },
        }
      );
      
      // Process batch response
      if (response.data && Array.isArray(response.data)) {
        response.data.forEach((item, index) => {
          const postId = chunk[index];
          const code = item.code || 200;
          
          if (code === 200 && item.body) {
            try {
              const body = JSON.parse(item.body);
              results[postId] = {
                exists: true,
                data: {
                  caption: body.caption || null,
                  thumbnail: body.thumbnail_url || body.media_url || null,
                  timestamp: body.timestamp || null,
                },
              };
            } catch (e) {
              results[postId] = { exists: false, error: "Parse error" };
            }
          } else {
            // Post not found or error (404, 403, etc.)
            results[postId] = { exists: false, error: item.body || "Not found" };
          }
        });
      }
    } catch (error) {
      console.error("Batch request error:", error?.response?.data || error.message);
      // Mark all posts in this chunk as unknown (don't change their status)
      chunk.forEach((postId) => {
        results[postId] = { exists: null, error: "API error" };
      });
    }
  }
  
  return results;
}

function daysLeft(expiry) {
  if (!expiry) return -Infinity; // force refresh if unknown
  return Math.floor((new Date(expiry).getTime() - Date.now()) / MS_DAY);
}

async function refreshFacebookTokensIfNeeded(user) {
  // Only attempt if we have a user token on file
  if (!user?.fbLongLivedToken) return null;

  const remaining = daysLeft(user.fbLongLivedTokenExpiry);
  if (remaining >= 28) return null; // still plenty of time

  // Refresh long-lived user token
  const llResp = await axios.get(`${FB_API}/oauth/access_token`, {
    params: {
      grant_type: "fb_exchange_token",
      client_id: META_APP_ID,
      client_secret: META_APP_SECRET,
      fb_exchange_token: user.fbLongLivedToken,
    },
  });

  const newUserLL = llResp.data?.access_token;
  if (!newUserLL) throw new Error("Failed to refresh long-lived user token");

  const newUserExpiry = new Date(Date.now() + FALLBACK_58_DAYS_MS);
  
  // Re-fetch Page token (ties to the user token)
  let newPageToken = user.fbPageAccessToken || null;
  if (user.fbPageId) {
    const pageTokResp = await axios.get(`${FB_API}/${user.fbPageId}`, {
      params: { fields: "access_token", access_token: newUserLL },
    });
    newPageToken = pageTokResp.data?.access_token || newPageToken;
  }

  const patch = {
    fbLongLivedToken: newUserLL,
    fbLongLivedTokenExpiry: newUserExpiry,
    fbPageAccessToken: newPageToken,
    fbLastRefreshAt: new Date(),
    fbNeedsReconnect: false,
    updated_at: new Date(),
  };

  await USER.findByIdAndUpdate(user._id, patch);
  return patch; // optional return if you want to use in-memory
}





async function uploadBufferToGCS(buffer, filename, mimetype) {
  try {
    console.log('uploadBufferToGCS called:', { 
      bufferSize: buffer.length, 
      filename, 
      mimetype 
    });

    const bucket = storage.bucket(bucketName);
    const blob = bucket.file(`uploads/${Date.now()}-${filename}`);
    
    const blobStream = blob.createWriteStream({
      resumable: false,
      metadata: {
        contentType: mimetype,
      },
    });

    return new Promise((resolve, reject) => {
      blobStream.on('error', (err) => {
        console.error('GCS stream error:', err);
        reject(err);
      });

      blobStream.on('finish', async () => {
        try {
          await blob.makePublic();
          const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
          console.log('GCS upload successful:', publicUrl);
          resolve({ publicUrl, objectName: blob.name });
        } catch (err) {
          console.error('Error making file public:', err);
          reject(err);
        }
      });

      blobStream.end(buffer);
    });
  } catch (err) {
    console.error('uploadBufferToGCS error:', err);
    throw err;
  }
}
// Choose which Graph API version you want to lock to:
const GRAPH_VERSION = process.env.FB_GRAPH_VERSION || "v24.0";

// Pick a usable token: prefer long-lived IG token, then page access token
function pickInstagramToken(user) {
  if (user.igLongLivedToken) return user.igLongLivedToken;
  if (user.fbPageAccessToken) return user.fbPageAccessToken;
  return null;
}

// Hit IG Graph to get fresh profile picture and username
async function fetchInstagramProfile({ igUserId, accessToken }) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}`;
  const params = { fields: "profile_picture_url,username", access_token: accessToken };
  const { data } = await axios.get(url, { params });
  // data: { id, username, profile_picture_url }
  return {
    username: data?.username || "",
    profile_picture_url: data?.profile_picture_url || "",
  };
}

// 6h TTL to avoid spamming Graph API (adjust as you like)
function needsRefresh(lastChecked, ttlMs = 1000 * 60 * 60 * 6) {
  if (!lastChecked) return true;
  return Date.now() - new Date(lastChecked).getTime() > ttlMs;
}




function normalizePosition(pos) {
  if (!pos) return null;
  const p = String(pos).trim().toLowerCase();
  if (["left", "headerimage1", "headerimage_1", "1"].includes(p)) return "leftHeadImage";
  if (["righttop", "right_top", "headerimage2", "headerimage_2", "2"].includes(p)) return "rightTopImage";
  if (["rightbottom", "right_bottom", "headerimage3", "headerimage_3", "3"].includes(p)) return "rightBottomImage";
  return null;
}

async function makeReceipt(productId) {
  const pid = String(productId || "na").replace(/[^a-zA-Z0-9_-]/g, "").slice(-8); // last 8 safe chars
  const ts = Date.now().toString(36);        // compact timestamp
  const rnd = Math.random().toString(36).slice(2, 6); // 4-char randomness
  // e.g. r_pidAbcd_ts4fzgc_rndk9x2
  const receipt = `r_${pid}_${ts}_${rnd}`;
  return receipt.slice(0, 40);
}

router.post("/logout", authenticateToken, (req, res) => {
  res.clearCookie("tokenChomskeProf", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    domain: ".chomske.com",  // CRITICAL: Must match cookie creation
    path: "/",
  });
  
  res.status(200).json({ message: "Logged out successfully" });
});

const DEMO_EMAIL = "demoaccount@chomske.com";
const DEMO_PASS = "demoaccount";

router.post("/demo-login", async (req, res) => {
try {
const { demoEmail, demoPass } = req.body || {};


if (!demoEmail || !demoPass) {
return res.status(400).json({ success: false, message: "Missing email or password" });
}


// Constant-time-ish comparison for tiny hardcoded creds
const ok = demoEmail.trim().toLowerCase() === DEMO_EMAIL.toLowerCase() && demoPass === DEMO_PASS;


if (!ok) {
return res.status(401).json({ success: false, message: "Invalid demo credentials" });
}


   const DEMO_USER_ID = new mongoose.Types.ObjectId("68cbc39db5f421a8a043046f");

    await USER.updateOne(
      { _id: DEMO_USER_ID },
      {
        $set: {
          demo_logged_in: true,
          demo_logged_date: new Date(),
        },
      }
    );


    const token = await generateJWTtoken('68cbc39db5f421a8a043046f', 'techiebhaskar7@gmail.com');

    // Cookie options: adjust for your environment (see notes below)
      res.cookie("tokenChomskeProf", token, {
  httpOnly: true,
  secure: true,                  // required when SameSite=None
  sameSite: "none",              // critical for iOS/Safari & any cross-site/iframe usage
   domain: ".chomske.com",// needed if crossing subdomains
  path: "/",             // ensure all routes get it
  maxAge: 7 * 24 * 60 * 60 * 1000
});

    return res.status(200).json({
      success: true,
      user: {
        user_id: '68cbc39db5f421a8a043046f',
        user_email: 'techiebhaskar7@gmail.com',
      },
      token
    });
} catch (err) {
console.error("demo-login error", err);
return res.status(500).json({ success: false, message: "Server error" });
}
});

router.post("/instagram/get-details", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;

    // include tokens if they're select:false in the schema
    const user = await USER.findById(userId)
      .select("+fbLongLivedToken +fbPageAccessToken")
      .lean();

    if (!user) return res.status(404).json({ success: false, error: "User not found" });

    // If not connected or missing IG user id, just return what's stored
    if (!user.instagramConnected || !user.igUserId) {
      return res.json({
        success: true,
        data: {
          connected: !!user.instagramConnected,
          username: user.igUsername || "",
          imageUrl: user.igProfilePic || "",
        },
      });
    }

    let updatedUsername = user.igUsername || "";
    let updatedPic = user.igProfilePic || "";

    const token = pickInstagramToken(user);

    // Try to refresh if we have a token and TTL says it's time
    if (token && needsRefresh(user.igPicLastChecked)) {
      try {
        const fresh = await fetchInstagramProfile({
          igUserId: user.igUserId,
          accessToken: token,
        });

        // Only write if something changed (or we had nothing)
        const shouldUpdate =
          fresh.username && fresh.username !== user.igUsername
            ? true
            : fresh.profile_picture_url && fresh.profile_picture_url !== user.igProfilePic;

        if (shouldUpdate) {
          await USER.findByIdAndUpdate(
            userId,
            {
              $set: {
                igUsername: fresh.username || user.igUsername || "",
                igProfilePic: fresh.profile_picture_url || user.igProfilePic || "",
                igPicLastChecked: new Date(),
              },
            },
            { new: false }
          );
          updatedUsername = fresh.username || updatedUsername;
          updatedPic = fresh.profile_picture_url || updatedPic;
        } else {
          // Just bump the last-checked time so we don't keep calling
          await USER.findByIdAndUpdate(
            userId,
            { $set: { igPicLastChecked: new Date() } },
            { new: false }
          );
        }
      } catch (err) {
        // If token is invalid/expired, you may mark as disconnected or keep stale values
        // Here we log and fall back to stored values
        console.error("IG refresh failed:", err?.response?.data || err.message);
      }
    }

    return res.json({
      success: true,
      data: {
        connected: true,
        username: updatedUsername,
        imageUrl: updatedPic,
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});




router.post("/instagram/unlink", authenticateToken, async (req, res) => {
  const userId = req.user?.user_id;
  if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });

  const session = await mongoose.startSession();
  try {
    let automationsResult = { matchedCount: 0, modifiedCount: 0 };

    await session.withTransaction(async () => {
      // 1) Mark the user as disconnected from Instagram
      const updatedUser = await USER.findByIdAndUpdate(
        userId,
        { $set: { instagramConnected: false } },
        { new: true, session }
      );

      if (!updatedUser) {
        // Causes the transaction to abort
        const err = new Error("User not found");
        err.statusCode = 404;
        throw err;
      }

      // 2) Inactivate all Instagram automations for this user
      const updateRes = await Automation.updateMany(
        {
          userId,
          platform: "instagram",
          status: { $ne: "inactive" },
        },
        { $set: { status: "inactive" } },
        { session }
      );

      // For response payload
      automationsResult.matchedCount = updateRes.matchedCount ?? updateRes.n ?? 0;
      automationsResult.modifiedCount = updateRes.modifiedCount ?? updateRes.nModified ?? 0;
    });

    return res.json({
      success: true,
      message: "Instagram unlinked. All your Instagram automations were set to inactive.",
      automations: automationsResult,
    });
  } catch (e) {
    console.error(e);
    const code = e.statusCode || 500;
    const msg = e.statusCode === 404 ? "User not found" : "Server error";
    return res.status(code).json({ success: false, error: msg });
  } finally {
    session.endSession();
  }
});


router.post("/connect-instagram", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data } = req.body || {};
    if (!data || !data.accessToken || !data.userID) {
      return res.status(400).json({ error: "Missing authentication data" });
    }

    const FB_APP_ID = process.env.FB_APP_ID;
    const FB_APP_SECRET = process.env.FB_APP_SECRET;

    const shortLivedUserToken = data.accessToken;

    // 1) Exchange short-lived user token -> long-lived (recommended)
    let longLivedUserToken = shortLivedUserToken;
    try {
      const { data: tokenExchange } = await axios.get(
        "https://graph.facebook.com/v20.0/oauth/access_token",
        {
          params: {
            grant_type: "fb_exchange_token",
            client_id: FB_APP_ID,
            client_secret: FB_APP_SECRET,
            fb_exchange_token: shortLivedUserToken,
          },
          timeout: 15000,
        }
      );
      if (tokenExchange?.access_token) {
        longLivedUserToken = tokenExchange.access_token;
      }
    } catch (e) {
      console.warn("Token exchange failed, using short-lived token:", e?.message);
    }

    // 2) Derive token expiry using debug_token
    let userTokenExpiryISO = null;
    try {
      const appAccessToken = `${FB_APP_ID}|${FB_APP_SECRET}`;
      const { data: debugResp } = await axios.get(
        "https://graph.facebook.com/debug_token",
        {
          params: {
            input_token: longLivedUserToken,
            access_token: appAccessToken,
          },
          timeout: 15000,
        }
      );
      const expiresAt = debugResp?.data?.expires_at; // unix seconds
      if (expiresAt) userTokenExpiryISO = new Date(expiresAt * 1000).toISOString();
    } catch (e) {
      console.warn("debug_token failed:", e?.message);
    }

    // 3) Pages (need access_token + instagram_business_account)
    const { data: pagesResponse } = await axios.get(
      "https://graph.facebook.com/v20.0/me/accounts",
      {
        params: {
          fields: "name,id,access_token,instagram_business_account{id}",
          access_token: longLivedUserToken,
        },
        timeout: 15000,
      }
    );

    const pages = pagesResponse?.data || [];
    const pageWithIG = pages.find(
      (p) => p?.instagram_business_account?.id && p?.access_token
    );

    const igAccounts = [];
    let fbPageId = null;
    let fbPageAccessToken = null;

    // IG profile fields we’ll fill
    let igUserId = null;      // canonical IG user id
    let igId = null;          // kept for schema compatibility; same as igUserId
    let igUsername = null;
    let igName = null;        // best-effort (see below)
    let igProfilePic = null;
    let igFollowersCount = null;
    let igFollowsCount = null;
    let igMediaCount = null;
    let igBiography = null;
    let has_profile_pic_ig = false;

    if (pageWithIG) {
      fbPageId = pageWithIG.id;
      fbPageAccessToken = pageWithIG.access_token;
      igUserId = pageWithIG.instagram_business_account.id;
      igId = igUserId; // mirror for legacy field usage

      // 3b) Fetch IG user details (either user token or page token works)
      const { data: igDetail } = await axios.get(
        `https://graph.facebook.com/v20.0/${igUserId}`,
        {
          params: {
            fields:
              "username,profile_picture_url,followers_count,follows_count,media_count,biography",
            access_token: longLivedUserToken,
          },
          timeout: 15000,
        }
      );

      igUsername = igDetail?.username || null;
      igProfilePic = igDetail?.profile_picture_url || null;
      igFollowersCount =
        typeof igDetail?.followers_count === "number" ? igDetail.followers_count : 0;
      igFollowsCount =
        typeof igDetail?.follows_count === "number" ? igDetail.follows_count : 0;
      igMediaCount =
        typeof igDetail?.media_count === "number" ? igDetail.media_count : 0;
      igBiography = igDetail?.biography || null;

      // IG Graph API doesn’t expose a separate "name" for the IG user.
      // Reasonable fallback: use the connected Page name (brand) or the username.
      igName = pageWithIG?.name || igUsername || null;

      has_profile_pic_ig = Boolean(igProfilePic);

      igAccounts.push({
        pageId: fbPageId,
        pageName: pageWithIG.name,
        igUserId,
        username: igUsername,
        profilePic: igProfilePic,
        followersCount: igFollowersCount,
        mediaCount: igMediaCount,
      });

      // 4) Persist ALL requested fields
      await USER.updateOne(
        { _id: userId },
        {
          $set: {
            instagramConnected: true,

            // IG identifiers & names
            igUserId,         // canonical IG user id
            igId,             // duplicate for schema compatibility
            igName,           // best-effort (Page name or username)
            igUsername,

            // Profile & counts
            igProfilePic,
            has_profile_pic_ig,
            igFollowersCount,
            igFollowsCount,
            igMediaCount,
            igBiography,

            // Tokens & expiry
            fbLongLivedToken: longLivedUserToken,
            fbTokenExpiry: userTokenExpiryISO ? new Date(userTokenExpiryISO) : null,

            // Page token (needed for DMs) & id
            fbPageAccessToken,
            fbPageId,

            // Optional capability flag
            dm_enabled: true,
          },
        }
      );
    } else {
      // No IG-linked page found — clear IG-related fields
      await USER.updateOne(
        { _id: userId },
        {
          $set: { instagramConnected: false, dm_enabled: false },
          $unset: {
            igUserId: 1,
            igId: 1,
            igName: 1,
            igUsername: 1,
            igProfilePic: 1,
            has_profile_pic_ig: 1,
            igFollowersCount: 1,
            igFollowsCount: 1,
            igMediaCount: 1,
            igBiography: 1,
            fbLongLivedToken: 1,
            fbTokenExpiry: 1,
            fbPageAccessToken: 1,
            fbPageId: 1,
          },
        }
      );
    }

    return res.json({
      success: true,
      message: pageWithIG
        ? `Connected @${igUsername} via Page ${pageWithIG.name}`
        : "No Facebook Page with a linked Instagram Business/Creator account was found.",
      igAccounts,
      igUsername,
      igProfilePic,
      igFollowersCount,
      igMediaCount,
      fbPageId: fbPageId || null,
      // Do NOT send tokens to the client.
    });
  } catch (err) {
    console.error("IG connect error:", err?.response?.data || err.message);
    return res.status(500).json({
      error: err?.response?.data?.error?.message || err.message || "Server error",
      details: err?.response?.data,
    });
  }
});

const FRONTEND_ORIGIN = "https://chomske.com"; // your app origin
const OPENER_URL = `${FRONTEND_ORIGIN}/professional/automations?connected=1`;




/** 1) FE asks for a signed state token (no cookies involved) */
router.post("/meta-state", authenticateToken, async (req, res) => {
  try {

    const userId = req.user?.user_id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const token = jwt.sign({ uid: String(userId) }, META_STATE_SECRET, { expiresIn: "10m" });
    res.json({ state: token });
  } catch (e) {
    res.status(500).json({ error: "Failed to start Meta login" });
  }
});


// router.get(["/meta-callback", "/meta-callback/"], async (req, res) => {
//   const { code, state } = req.query;

//   try {
//     if (!code) throw new Error("Missing OAuth code");
//     if (!state) throw new Error("Missing state");

//     // 1️⃣ Verify state → userId
//     let payload;
//     try {
//       payload = jwt.verify(state, META_STATE_SECRET);
//     } catch {
//       throw new Error("Invalid or expired state");
//     }

//     const userId = payload.uid;
//     if (!userId) throw new Error("Invalid user state");

//     // 2️⃣ Exchange code → short-lived token
//     const tokenResp = await axios.get("https://graph.facebook.com/v24.0/oauth/access_token", {
//       params: {
//         client_id: META_APP_ID,
//         client_secret: META_APP_SECRET,
//         redirect_uri: META_REDIRECT_URI,
//         code,
//       },
//     });

//     const shortUserToken = tokenResp.data?.access_token;
//     if (!shortUserToken) throw new Error("Token exchange failed");

//     // 3️⃣ Exchange short-lived token → long-lived token
//     const llResp = await axios.get("https://graph.facebook.com/v24.0/oauth/access_token", {
//       params: {
//         grant_type: "fb_exchange_token",
//         client_id: META_APP_ID,
//         client_secret: META_APP_SECRET,
//         fb_exchange_token: shortUserToken,
//       },
//     });

//     console.log("long token response:", llResp.data);

//     const fbLongLivedToken = llResp.data?.access_token;
//     if (!fbLongLivedToken) throw new Error("Failed to obtain long-lived token");

//     // ✅ Compute expiry: use API expires_in if present, else fallback to 58 days.
//     const expiresInSecRaw = llResp.data?.expires_in;
//     const expiresInSec = Number.isFinite(Number(expiresInSecRaw)) ? Number(expiresInSecRaw) : null;

//     const nowMs = Date.now();
//     let fbLongLivedTokenExpiry;

//     if (expiresInSec && expiresInSec > 0) {
//       fbLongLivedTokenExpiry = new Date(nowMs + expiresInSec * 1000);
      
//     } else {
//       // ~60 days typical validity; set conservative 58 days
//       const FIFTY_EIGHT_DAYS_MS = 58 * 24 * 60 * 60 * 1000;
//       fbLongLivedTokenExpiry = new Date(nowMs + FIFTY_EIGHT_DAYS_MS);
     
//     }

//     // Save early so we always persist tokens even if next step fails
//     await USER.findByIdAndUpdate(
//       userId,
//       {
//         fbLongLivedToken,
//         fbLongLivedTokenExpiry,
      
//         updated_at: new Date(),
//       },
//       { new: false }
//     );

//     // 4️⃣ Fetch user pages (with linked IG)
//     const pagesResp = await axios.get("https://graph.facebook.com/v24.0/me/accounts", {
//       params: {
//         fields: "id,name,instagram_business_account{id,username,profile_picture_url}",
//         access_token: fbLongLivedToken,
//       },
//     });

//     const pages = pagesResp.data?.data || [];
//     if (!pages.length) throw new Error("No Facebook Pages found for this user.");

//     // Pick first Page that has linked IG account
//     const pageWithIG = pages.find((p) => p?.instagram_business_account?.id);
//     if (!pageWithIG) throw new Error("No Page with a linked Instagram Business/Creator account found.");

//     const fbPageId = pageWithIG.id;
//     const igUserId = pageWithIG.instagram_business_account.id;

//     // 5️⃣ Fetch Page access token explicitly
//     const pageTokResp = await axios.get(`https://graph.facebook.com/v24.0/${fbPageId}`, {
//       params: {
//         fields: "access_token",
//         access_token: fbLongLivedToken, // user token must have pages_* scopes
//       },
//     });

//     const fbPageAccessToken = pageTokResp.data?.access_token;

//     console.log('fbPageAccessToken :', pageTokResp.data);
//     if (!fbPageAccessToken) {
//       throw new Error("Unable to fetch Page access token. Check your pages_* permissions.");
//     }

//     // 6️⃣ Fetch Instagram details using Page token
//     const igResp = await axios.get(`https://graph.facebook.com/v24.0/${igUserId}`, {
//       params: {
//         fields: "id,username,profile_picture_url,biography,followers_count,follows_count,media_count",
//         access_token: fbPageAccessToken,
//       },
//     });

//     const ig = igResp.data || {};
//     const igUsername = ig.username || null;
//     const igProfilePic = ig.profile_picture_url || null;
//     const igFollowersCount = ig.followers_count ?? 0;
//     const igFollowsCount = ig.follows_count ?? 0;
//     const igMediaCount = ig.media_count ?? 0;
//     const igBiography = ig.biography || null;
//     const has_profile_pic_ig = Boolean(igProfilePic);

//     // 7️⃣ Save all data to USER
//    await USER.findByIdAndUpdate(
//       userId,
//       {
//         instagramConnected: true,
//         fbPageId,
//         igUserId: ig.id,
//         igId: ig.id,
//         igName: pageWithIG.name || igUsername || null,
//         igUsername,
//         igProfilePic,
//         igFollowersCount,
//         igFollowsCount,
//         igMediaCount,
//         igBiography,
//         fbPageAccessToken,
//         has_profile_pic_ig,
//         updated_at: new Date(),
//       },
//       { new: true }
//     );

//     // 8️⃣ Return to opener
//     const preview = {
//       igUsername,
//       igProfilePic,
//       followersCount: igFollowersCount,
//     };

//     res
//       .type("html")
//       .send(`<!doctype html>
// <html><head><meta charset="utf-8"><title>Connected</title></head>
// <body>
// <script>
//   try {
//     if (window.opener && !window.opener.closed) {
//       window.opener.location.replace(${JSON.stringify(OPENER_URL)});
//     }
//   } catch (e) {}
//   try { window.close(); } catch (e) {}
//   document.write('<p>Connected. <a href=${JSON.stringify(OPENER_URL)}>Return to the app</a></p>');
// </script>
// </body></html>`);

//   } catch (err) {
//     console.error("Meta OAuth error:", err?.response?.data || err?.message || err);
//     res.set("Content-Type", "text/html");
//     res.send(`<!doctype html><script>
//       (function () {
//         var payload = { type: "meta-auth", success: false, error: ${JSON.stringify(
//           err?.message || "Meta OAuth error"
//         )} };
//         if (window.opener) window.opener.postMessage(payload, "${FRONTEND_ORIGIN}");
//         window.close();
//       })();
//     </script>`);
//   }
// });


router.get(["/meta-callback", "/meta-callback/"], async (req, res) => {
  const { code, state, error, error_reason, error_description, error_code } = req.query;

  try {
    if (error || error_reason || error_description) {
      // Facebook redirects here with these instead of `code` when the user
      // denies/cancels the dialog, or the app/config rejects the request —
      // surface what Facebook actually said instead of a generic message.
      console.error("Meta OAuth denied by Facebook:", {
        error, error_reason, error_description, error_code,
      });
      throw new Error(error_description || error_reason || error || "Facebook denied the request");
    }
    if (!code) {
      console.error("Meta OAuth callback hit with no code and no error param. Full query:", req.query);
      throw new Error("Missing OAuth code");
    }
    if (!state) throw new Error("Missing state");

    // 1️⃣ Verify state → userId
    let payload;
    try {
      payload = jwt.verify(state, META_STATE_SECRET);
    } catch {
      throw new Error("Invalid or expired state");
    }

    const userId = payload.uid;
    console.log('userId : ', userId);
    if (!userId) throw new Error("Invalid user state");

    // 2️⃣ Exchange code → short-lived token (Instagram Business Login — no Facebook Page involved)
    const tokenResp = await axios.post(
      "https://api.instagram.com/oauth/access_token",
      new URLSearchParams({
        client_id: INSTAGRAM_APP_ID,
        client_secret: INSTAGRAM_APP_SECRET,
        grant_type: "authorization_code",
        redirect_uri: META_REDIRECT_URI,
        code,
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const shortIgToken = tokenResp.data?.access_token;
    if (!shortIgToken) throw new Error("Token exchange failed");

    // 3️⃣ Exchange short-lived token → long-lived token
    const llResp = await axios.get("https://graph.instagram.com/access_token", {
      params: {
        grant_type: "ig_exchange_token",
        client_secret: INSTAGRAM_APP_SECRET,
        access_token: shortIgToken,
      },
    });

    const igLongLivedToken = llResp.data?.access_token;
    if (!igLongLivedToken) throw new Error("Failed to obtain long-lived token");

    // ✅ Compute expiry
    const expiresInSecRaw = llResp.data?.expires_in;
    const expiresInSec = Number.isFinite(Number(expiresInSecRaw)) ? Number(expiresInSecRaw) : null;
    const nowMs = Date.now();
    let igLongLivedTokenExpiry;

    if (expiresInSec && expiresInSec > 0) {
      igLongLivedTokenExpiry = new Date(nowMs + expiresInSec * 1000);
    } else {
      const FIFTY_EIGHT_DAYS_MS = 58 * 24 * 60 * 60 * 1000;
      igLongLivedTokenExpiry = new Date(nowMs + FIFTY_EIGHT_DAYS_MS);
    }

    // Save early
    await USER.findByIdAndUpdate(
      userId,
      {
        igLongLivedToken,
        igLongLivedTokenExpiry,
        updated_at: new Date(),
      },
      { new: false }
    );

    // 4️⃣ Fetch the connected Instagram professional account's own profile directly —
    // no Facebook Page lookup, the authenticated account IS the target account.
    const igResp = await axios.get("https://graph.instagram.com/v21.0/me", {
      params: {
        fields: "user_id,username,profile_picture_url,biography,followers_count,follows_count,media_count",
        access_token: igLongLivedToken,
      },
    });

    const ig = igResp.data || {};
    const igUserId = ig.user_id || null;
    if (!igUserId) throw new Error("Could not resolve the connected Instagram account's user id.");
    const igUsername = ig.username || null;
    const igProfilePic = ig.profile_picture_url || null;
    const igFollowersCount = ig.followers_count ?? 0;
    const igFollowsCount = ig.follows_count ?? 0;
    const igMediaCount = ig.media_count ?? 0;
    const igBiography = ig.biography || null;
    const has_profile_pic_ig = Boolean(igProfilePic);


    // ============================================================
    // [NEW LOGIC] CHECK FOR DUPLICATE CONNECTION
    // ============================================================
// [NEW LOGIC] CHECK FOR DUPLICATE CONNECTION
const existingUser = await USER.findOne({ 
  igUserId: igUserId, duplicateExists: false,
  _id: { $ne: userId } 
});


// Import mongoose at the top if you haven't already
// import mongoose from 'mongoose'; 

if (existingUser) {
  console.log('User exists::::::::::::::::::: FOUND:', existingUser._id);

  const email = existingUser.email || "unknown@user.com";
  const [localPart, domain] = email.split("@");
  let maskedEmail;
  if (localPart && localPart.length <= 4) {
    maskedEmail = `${localPart}****@${domain}`;
  } else if (localPart) {
    maskedEmail = `${localPart.slice(0, 4)}****${localPart.slice(-1)}@${domain}`;
  } else {
    maskedEmail = "******";
  }

  console.log("Attempting to update User:", userId); // Debug Log 1

  // 🔴 FIXED: Capture the result to debug & Force ObjectId
  const updateResult = await USER.findByIdAndUpdate(
    new mongoose.Types.ObjectId(userId), // 1. Force cast string ID to ObjectId
    {
      $set: { // 2. Use explicit $set (good practice for partial updates)
        igUserId: igUserId,
        duplicateExists: true,
        duplicateInfo: {
          igUsername: igUsername || "Unknown", // Ensure this isn't undefined
          maskedEmail: maskedEmail,
        },
        updated_at: new Date(),
      }
    },
    { new: true, runValidators: true } // 3. Enable validator to catch schema errors
  );

  if (!updateResult) {
    console.error("❌ FATAL: Update failed. User not found or not updated:", userId);
  } else {
    console.log("✅ SUCCESS: Duplicate flag set. duplicateExists:", updateResult.duplicateExists);
  }

  // ... rest of your HTML response ...
  res
    .type("html")
    .send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Connected</title></head>
<body>
<script>
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.location.replace(${JSON.stringify(OPENER_URL)});
    }
  } catch (e) {}
  try { window.close(); } catch (e) {}
  document.write('<p>Connected. <a href=${JSON.stringify(OPENER_URL)}>Return to the app</a></p>');
</script>
</body></html>`);
}

else{
  // 7️⃣ Save all data to USER
await USER.findByIdAndUpdate(
  userId,
  {
    instagramConnected: true,
    igUserId,
    igId: igUserId,
    igName: igUsername || null,
    igUsername,
    igProfilePic,
    igFollowersCount,
    igFollowsCount,
    igMediaCount,
    igBiography,
    has_profile_pic_ig,
    duplicateExists: false,
    duplicateInfo: null,
    updated_at: new Date(),
  },
  { new: true }
);



    res
      .type("html")
      .send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Connected</title></head>
<body>
<script>
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.location.replace(${JSON.stringify(OPENER_URL)});
    }
  } catch (e) {}
  // Fallback close
  try { window.close(); } catch (e) {}
  document.write('<p>Connected. <a href=${JSON.stringify(OPENER_URL)}>Return to the app</a></p>');
</script>
</body></html>`);


}



  } catch (err) {
    console.error("Meta OAuth error:", err?.response?.data || err?.message || err);
    res.set("Content-Type", "text/html");
    // Use "*" for error reporting to ensure it shows up
    res.send(`<!doctype html><script>
      (function () {
        var payload = { type: "meta-auth", success: false, error: ${JSON.stringify(
          err?.message || "Meta OAuth error"
        )} };
        if (window.opener) window.opener.postMessage(payload, "*");
        setTimeout(function() { window.close(); }, 300);
      })();
    </script>`);
  }
});



router.post("/save-instagram-account", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    const { pageId, igUserId } = req.body;

    console.log('body : ', req.body);
    console.log('userId : ', userId);

    if (!pageId || !igUserId) return res.status(400).json({ success: false, error: "pageId and igUserId are required" });

    const user = await USER.findById(userId).lean();
    if (!user) return res.status(404).json({ success: false, error: "User not found" });
    if (!user.fbLongLivedToken) return res.status(401).json({ success: false, error: "Meta session missing. Please connect again." });

    // Page access token (from long-lived *user* token)
    const pageTokResp = await axios.get(`https://graph.facebook.com/v24.0/${pageId}`, {
      params: { fields: "access_token", access_token: user.fbLongLivedToken },
    });
    const fbPageAccessToken = pageTokResp.data?.access_token;
    if (!fbPageAccessToken) return res.status(400).json({ success: false, error: "Unable to fetch Page access token" });

    // Fetch IG details with page token
    const igResp = await axios.get(`https://graph.facebook.com/v24.0/${igUserId}`, {
      params: {
        fields: "id,username,profile_picture_url,biography,followers_count,follows_count,media_count",
        access_token: fbPageAccessToken,
      },
    });
    const ig = igResp.data;

    const update = {
      instagramConnected: true,
      fbPageId: pageId,
      igUserId: ig.id,
      igId: ig.id,
      igName: ig.username || null,                // IG doesn't expose separate 'name' for biz
      igUsername: ig.username || null,
      igProfilePic: ig.profile_picture_url || null,
      igFollowersCount: ig.followers_count ?? null,
      igFollowsCount: ig.follows_count ?? null,
      igMediaCount: ig.media_count ?? null,
      igBiography: ig.biography || null,
      fbPageAccessToken,
      has_profile_pic_ig: Boolean(ig.profile_picture_url),
      updated_at: new Date(),
    };

    const saved = await USER.findByIdAndUpdate(userId, update, { new: true });
    return res.json({
      success: true,
      user: {
        instagramConnected: saved.instagramConnected,
        igUsername: saved.igUsername,
        igProfilePic: saved.igProfilePic,
        igFollowersCount: saved.igFollowersCount,
      },
    });
  } catch (err) {
    console.error("save-instagram-account error:", err?.response?.data || err?.message || err);
    return res.status(500).json({ success: false, error: "Failed to save Instagram account" });
  }
});


/** (Optional) status route your FE already calls */
router.get('/instagram-status', authenticateToken, async function (req, res) {
  try {
    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(400).json({ message: "Username is invalid." });
    }

    const user = await USER.findById(userId).lean();

    if (!user) {
      return res.status(200).json({ success: false, data: null });
    }

     const instagramConnected = user.instagramConnected;
    const igProfilePic = user.igProfilePic || null;
    const igUsername = user.igUsername || null;
    const followersCount = user.igFollowersCount ?? 0;
    const duplicateExists = user.duplicateExists;
    const duplicateInfo = user.duplicateInfo;

    return res.status(200).json({
      instagramConnected,
      igProfilePic,
      igUsername,
      followersCount,
      duplicateExists,
      duplicateInfo,
    });

  } catch (e2) {
    console.error("❌ Error fetching instagram status:", e2);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});





  // router.get('/instagram-status', authenticateToken, async function (req, res){

  //   const userId = req.user?.user_id;

  //       if (!userId) {
  //         return res.status(400).json({ message: "Username is invalid." });
  //       }
  
  //   USER.findById(userId).then((result)=>{
  
  //     if(result){
  
  //     res.status(200).send({ instagramConnected : result.instagramConnected, igProfilePic : result.igProfilePic, igUsername : result.igUsername, followersCount : result.igFollowersCount});
  //     res.end();

  
  //     }
  
  //     else{
  //     res.status(200).send({ success: false, data: null });
  //     res.end();
  
  //     }
  
  //   }).catch(e2=>{
  
  //     console.error("❌ Error fetching campaign details:", e2);
  //     return res.status(500).json({ error: "Internal Server Error" });
  
  //   })
  // });

  router.post('/unlink-instagram', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Fields we typically set during Instagram linking.
    // Adjust this list if your schema uses different names.
    const fieldsToClear = {
      instagramConnected: false,
      igUserId: null,
      fbPageAccessToken: null,
      igUsername: null,
      igProfilePic: null,
      igFollowersCount: null,
      igMediaCount: null,
      fbLongLivedToken: null,
      fbTokenExpiry: null,
    };

    // You can either $set nulls, or $unset.
    // Using $set to null is nice because the shape stays visible.
    const updated = await USER.findByIdAndUpdate(
      userId,
      { $set: fieldsToClear },
      { new: true, projection: { fbPageAccessToken: 0, fbLongLivedToken: 0 } } // don't echo tokens even if null
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.status(200).json({
      success: true,
    });
  } catch (err) {
    console.error('❌ Error unlinking Instagram:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post("/automation/config-duplicate", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id; // or req.user._id depending on your auth middleware
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { postId, keywords, action } = req.body || {};

    // Basic validation
    if (!postId || !String(postId).trim()) {
      return res.status(400).json({ success: false, message: "postId is required" });
    }
    if (!Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({ success: false, message: "At least one keyword is required" });
    }
    if (!action || typeof action !== "object") {
      return res.status(400).json({ success: false, message: "action object is required" });
    }

    const type = action.type;
    const title = action.title?.trim();
    const url = action.url?.trim();
    const fileName = action.fileName?.trim();

    if (!["Affiliate Link", "Download Link"].includes(type)) {
      return res.status(400).json({ success: false, message: "Invalid action.type" });
    }
    if (!title) {
      return res.status(400).json({ success: false, message: "action.title is required" });
    }
    if (!url || !isValidUrl(url)) {
      return res.status(400).json({ success: false, message: "Valid action.url is required" });
    }
    if (type === "Download Link" && !fileName) {
      // Optional, but nice to have for logs/UX
      console.warn("Download Link provided without fileName");
    }

    // Normalize keywords: trim + dedupe + remove empties
    const normalizedKeywords = [...new Set(
      keywords.map(k => String(k || "").trim()).filter(Boolean)
    )];

    // LOGGING (condition-based)
    console.log("=== Automation Config ===");
    console.log("User ID:", userId);
    console.log("Post ID:", postId);
    console.log("Keywords:", normalizedKeywords);

    if (type === "Download Link") {
      console.log("[Download Link]");
      console.log("Title:", title);
      console.log("Public URL (GCS):", url);
      if (fileName) console.log("File Name:", fileName);
    } else {
      console.log("[Affiliate Link]");
      console.log("Title:", title);
      console.log("Affiliate URL:", url);
    }

    // Persist to DB (create new; or upsert if you want one per postId)
    // const doc = await AutomationConfig.create({
    //   userId,
    //   postId: String(postId),
    //   keywords: normalizedKeywords,
    //   action: { type, title, url, fileName },
    //   status: "active",
    // });

    return res.json({
      success: true,
      // automationId: doc._id,
      message: "Automation configuration saved",
      // data: doc,
    });
  } catch (err) {
    console.error("POST /automation/config error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to save automation config",
      error: err?.message || String(err),
    });
  }
});



async function filterAutomatedPosts(userId, mediaItems) {
    if (!mediaItems || mediaItems.length === 0) return { filtered: [], excludedCount: 0 };
    
    const postIds = mediaItems.map((m) => m.id);
    const automations = await Automation.find({
        userId,
        postId: { $in: postIds },
    }).select("postId").lean();

    const automatedSet = new Set(automations.map((a) => String(a.postId)));
    const filtered = mediaItems.filter((m) => !automatedSet.has(String(m.id)));
    
    return {
        filtered,
        excludedCount: mediaItems.length - filtered.length
    };
}

router.get("/instagram/reels", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    const user = await USER.findById(userId).select("igUserId igLongLivedToken fbLongLivedToken fbPageAccessToken").lean();
    if (!user || !user.igUserId) return res.status(400).json({ error: "Instagram not connected" });

    const fields = "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp";
    const limit = 20; // Fetch slightly more since we might filter out non-videos
    const after = req.query.after ? `&after=${encodeURIComponent(req.query.after)}` : "";

    const url = `https://graph.instagram.com/v21.0/${user.igUserId}/media?fields=${fields}&limit=${limit}${after}&access_token=${pickInstagramToken(user)}`;

    // Fetch
    const response = await getWithRetries(url, { retries: 3, timeout: 15000 });
    let rawData = response.data || [];

    // Filter for VIDEOS only (Reels)
    // Note: We filter in memory. API doesn't strictly allow filtering by type in the GET call easily.
    const videoOnly = rawData.filter(m => m.media_type === 'VIDEO' || m.media_type === 'REEL');

    // Filter Automation
    const { filtered, excludedCount } = await filterAutomatedPosts(userId, videoOnly);

    // Normalize
    const normalized = filtered.map(m => ({
        ...m,
        thumbnail_url: m.thumbnail_url || m.media_url // Use media_url if thumbnail missing
    }));

    res.json({
        data: normalized,
        paging: response.paging ? { next: Boolean(response.paging.next), cursors: response.paging.cursors } : null,
        meta: { totalFetched: rawData.length, excludedForAutomation: excludedCount }
    });

  } catch (err) {
    console.error("Reels Fetch Error:", err.message);
    res.status(500).json({ error: "Failed to fetch Reels" });
  }
});

router.get("/instagram/stories", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    const user = await USER.findById(userId).select("igUserId igLongLivedToken fbLongLivedToken fbPageAccessToken").lean();
    if (!user || !user.igUserId) return res.status(400).json({ error: "Instagram not connected" });

    const fields = "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp";
    // Stories endpoint does not always support standard cursor pagination perfectly, but we attempt it
    const after = req.query.after ? `&after=${encodeURIComponent(req.query.after)}` : "";

    const url = `https://graph.instagram.com/v21.0/${user.igUserId}/stories?fields=${fields}${after}&access_token=${pickInstagramToken(user)}`;

    const response = await getWithRetries(url, { retries: 3, timeout: 15000 });
    let rawData = response.data || [];

    // Stories are always type STORY, no type filtering needed

    // Filter Automation
    const { filtered, excludedCount } = await filterAutomatedPosts(userId, rawData);

    // Normalize
    const normalized = filtered.map(m => ({
        ...m,
        thumbnail_url: m.thumbnail_url || m.media_url // Usually stories don't have separate thumbs, but good fallback
    }));

    res.json({
        data: normalized,
        paging: response.paging ? { next: Boolean(response.paging.next), cursors: response.paging.cursors } : null,
        meta: { totalFetched: rawData.length, excludedForAutomation: excludedCount }
    });

  } catch (err) {
    console.error("Stories Fetch Error:", err.message);
    res.status(500).json({ error: "Failed to fetch Stories" });
  }
});


router.get("/instagram/photos", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    const user = await USER.findById(userId).select("igUserId igLongLivedToken fbLongLivedToken fbPageAccessToken").lean();
    if (!user || !user.igUserId) return res.status(400).json({ error: "Instagram not connected" });

    const fields = "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp";
    const limit = 25; // Fetch slightly more to account for filtering out videos
    const after = req.query.after ? `&after=${encodeURIComponent(req.query.after)}` : "";

    const url = `https://graph.instagram.com/v21.0/${user.igUserId}/media?fields=${fields}&limit=${limit}${after}&access_token=${pickInstagramToken(user)}`;

    // 1. Fetch Data
    const response = await getWithRetries(url, { retries: 3, timeout: 15000 });
    let rawData = response.data || [];

    // 2. Filter for PHOTOS Only (Image or Carousel)
    const photosOnly = rawData.filter(m => 
        m.media_type === 'IMAGE' || m.media_type === 'CAROUSEL_ALBUM'
    );

    // 3. Filter out already automated posts
    const { filtered, excludedCount } = await filterAutomatedPosts(userId, photosOnly);

    // 4. Normalize
    const normalized = filtered.map(m => ({
        ...m,
        // For photos, media_url is the image. 
        thumbnail_url: m.media_url 
    }));

    res.json({
        data: normalized,
        paging: response.paging ? { next: Boolean(response.paging.next), cursors: response.paging.cursors } : null,
        meta: { totalFetched: rawData.length, excludedForAutomation: excludedCount }
    });

  } catch (err) {
    console.error("Photos Fetch Error:", err.message);
    res.status(500).json({ error: "Failed to fetch Photos" });
  }
});


// Instagram Business Login has no Facebook Page in the picture — you subscribe
// the connected Instagram account itself, directly on graph.instagram.com.
// This is the piece flagged as needing live verification: unlike the Facebook
// Page version above (well-documented, long-proven), Meta's docs on the exact
// subscribed_fields values accepted here for Instagram Login accounts are thin.
// "comments" matches the field you enabled on the app's Instagram webhook
// config — if this call 400s, check the Instagram product's webhook fields
// list for the exact accepted value.
async function subscribeInstagramAccountToWebhooks(igUserId, igAccessToken) {
  if (!igUserId) throw new Error("igUserId is required");
  if (!igAccessToken) throw new Error("igAccessToken is required");

  try {
    const subResp = await axios.post(
      `https://graph.instagram.com/v21.0/${igUserId}/subscribed_apps`,
      null,
      {
        params: {
          subscribed_fields: "comments",
          access_token: igAccessToken,
        },
      }
    );

    const success = subResp?.data?.success;
    if (success) {
      console.log(`✅ Instagram account ${igUserId} subscribed to Webhooks!`);
    } else {
      console.warn("⚠️ Subscription response unclear:", subResp?.data);
    }

    return { success, raw: subResp?.data };

  } catch (error) {
    console.error("❌ subscribeInstagramAccountToWebhooks failed", error?.response?.data || error.message);
    // Don't crash the whole auth flow if this fails, just log it
    return { success: false, error: error.message };
  }
}

router.get("/subscription/details", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;

    // Get subscription + user details
    const subscription = await Subscriptions.findOne({ user_id: userId })
      .populate({ path: "user_id", strictPopulate: false });

    if (!subscription || !subscription.user_id) {
      return res.status(404).json({
        message: "Subscription or user not found",
      });
    }

    const user = subscription.user_id;

    // --- Free trial check (7 days from free_trial_started_date) ---
    const now = new Date();
    const freeTrialStart = new Date(user.free_trial_started_date);
    const freeTrialEnd = new Date(freeTrialStart);
    freeTrialEnd.setDate(freeTrialEnd.getDate() + 7);

    let response;

    if (now <= freeTrialEnd) {
      // Still in free trial
      response = {
        freeTrial: true,
        subscription_starts_at: subscription.subscription_starts_at,
      };
    } else {
      // Free trial over
      response = {
        freeTrial: false,
        status: subscription.status,
      };
    }

    return res.json({ success: true, response });
  } catch (err) {
    console.error("Error in /subscription/details:", err);
    const e = err?.response?.data?.error || { message: "Something went wrong" };
    const status = err?.response?.status || 500;
    return res.status(status).json(e);
  }
});


router.post("/automation/upload-asset", authenticateToken, upload.single("file"), async (req, res) => {
  try {
    const userId = req.user?.user_id || req.user?._id;
    
    // 1. Validation
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    
    const allowedMimes = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
    if (!allowedMimes.includes(req.file.mimetype)) {
      return res.status(400).json({ message: "Invalid file type. Only PDF, PNG, JPG allowed." });
    }

    // 2. Get igUserId for folder name
    const user = await USER.findById(userId).select("igUserId").lean();
    
    // Fallback: if no igUserId yet, use the database _id or a 'temp' folder
    const folderName = user?.igUserId || String(userId);

    // 3. Upload to GCS with folder structure
    const { publicUrl } = await uploadBufferToGCSFolder(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      folderName // Pass folder name
    );

    return res.json({ success: true, publicUrl });



  } catch (err) {
    console.error("Upload asset error:", err);
    return res.status(500).json({ message: "Upload failed" });
  }
});

async function uploadBufferToGCSFolder(buffer, originalName, mimeType, folderName) {

  const ext = path.extname(originalName) || "";
  const cleanFileName = path.basename(originalName, ext).replace(/[^a-zA-Z0-9]/g, "_"); // Sanitize filename
  
  // Logic: GCS doesn't have real "folders", just paths with slashes
  const objectName = `${folderName}/${Date.now()}-${cleanFileName}${ext}`;

  const file = bucket.file(objectName);



  return new Promise((resolve, reject) => {
    const stream = file.createWriteStream({
      metadata: { contentType: mimeType },
      resumable: false,
    });

    stream.on("error", (err) => reject(err));
    
    stream.on("finish", async () => {
      try {
        // Make public (ensure your bucket allows this or use signed URLs)
        // Note: 'makePublic' might fail if Uniform Bucket Level Access is on. 
        // If so, you just rely on the bucket being public read.
        try { await file.makePublic(); } catch(e) { console.warn("Make public skipped/failed"); }
        
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${objectName}`;

        resolve({ publicUrl, objectName });
      } catch (err) {
        reject(err);
      }
    });

    stream.end(buffer);
  });
}

router.post("/automation/config", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const {
      postId,
      dmMessage,
      buttonText,
      caption,
      thumbnail,
      status,
      flowNodes,
      keywords,
      hasReply,
      replyComment
    } = req.body || {};

    // ===== BASIC VALIDATION =====
    if (!postId || !String(postId).trim()) {
      return res.status(400).json({ success: false, message: "postId is required" });
    }

    // 1️⃣ FETCH USER CONTEXT (New Step)
    // We need the tokens and the flag to decide if we should subscribe
    const user = await USER.findById(userId).select("igUserId igLongLivedToken automationFeedSubscribed");
    
    if (!user) {
      return res.status(404).json({ success: false, message: "User profile not found." });
    }

    // ===== PREPARE DOCUMENT FOR UPSERT =====
    const update = {
      platform: "instagram",
      caption,
      thumbnail,
      dmMessage,
      buttonText,
      flowNodes,
      keywords,
      hasReply,
      replyComment,
      ...(status ? { status } : {}),
    };

    // ===== UPSERT AUTOMATION =====
    const doc = await Automation.findOneAndUpdate(
      { userId, postId: String(postId) },
      { $set: update, $setOnInsert: { userId, postId: String(postId) } },
      { upsert: true, new: true }
    );

    // 2️⃣ CHECK & SUBSCRIBE (The Logic You Requested)
    let webhookStatus = "already_active";

    // If the user has a token BUT has not been marked as subscribed yet
    if (user.igUserId && user.igLongLivedToken && !user.automationFeedSubscribed) {
        console.log(`🔌 Initializing Webhooks for User ${userId}...`);

        try {
            // Run the helper function
            const subResult = await subscribeInstagramAccountToWebhooks(
                user.igUserId,
                user.igLongLivedToken
            );

            if (subResult.success) {
                // Update the flag so we don't run this every time
                await USER.findByIdAndUpdate(userId, { automationFeedSubscribed: true });
                webhookStatus = "activated_now";
                console.log("✅ Webhook initialized successfully.");
            } else {
                webhookStatus = "activation_failed";
            }
        } catch (subErr) {
            console.error("⚠️ Webhook auto-subscription failed:", subErr.message);
            webhookStatus = "error";
            // We do NOT crash the request here. The automation is saved, which is the primary goal.
        }
    }

    return res.json({
      success: true,
      message: "Automation configuration saved",
      webhook_status: webhookStatus, // Useful for frontend debugging
      data: doc
    });

  } catch (err) {
    console.error("POST /automation/config error:", err);
    
    // Handle unique index race condition
    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An automation for this post already exists for this user",
      });
    }
    
    return res.status(500).json({
      success: false,
      message: "Failed to save automation config",
      error: err?.message || String(err),
    });
  }
});



router.get("/automations", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // 🔁 Check & refresh FB tokens if expiring in < 28 days (or missing)
    let user;
    try {
      user = await USER.findById(userId)
        .select("_id fbLongLivedToken fbLongLivedTokenExpiry fbPageId fbPageAccessToken instagramConnected")
        .lean();

      if (user?.instagramConnected) {
        await refreshFacebookTokensIfNeeded(user);
        // Refetch user to get updated tokens
        user = await USER.findById(userId)
          .select("_id fbLongLivedToken fbLongLivedTokenExpiry fbPageId fbPageAccessToken instagramConnected")
          .lean();
      }
    } catch (e) {
      console.error("FB token refresh check failed:", e?.response?.data || e.message || e);
    }

    // ⬇️ Pagination + aggregation logic
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const skip = (page - 1) * limit;

    const query = { userId };
    const projection = "postId status createdAt caption thumbnail postLive lastCheckedAt";
    const sort = { createdAt: -1 };

    const [total, docs] = await Promise.all([
      Automation.countDocuments(query),
      Automation.find(query).select(projection).sort(sort).skip(skip).limit(limit).lean(),
    ]);

    // Verify posts exist via batch request
    const postIds = docs.map((d) => d.postId);
    let verificationResults = {};
    
    if (user?.fbPageAccessToken && postIds.length > 0) {
      verificationResults = await verifyPostsExist(postIds, user.fbPageAccessToken);
      
      // Update postLive and status in DB for posts that changed
      const bulkOps = [];
      docs.forEach((doc) => {
        const result = verificationResults[doc.postId];
        if (result && result.exists !== null) {
          const isLive = result.exists === true;
          
          // Only update if status changed
          if (doc.postLive !== isLive) {
            const updateFields = {
              postLive: isLive,
              lastCheckedAt: new Date(),
            };

            // 🔥 If post is deleted, also set status to inactive
            if (!isLive) {
              updateFields.status = "inactive";
            }

            // Update thumbnail/caption if post exists and data is available
            if (isLive && result.data?.thumbnail) {
              updateFields.thumbnail = result.data.thumbnail;
            }
            if (isLive && result.data?.caption) {
              updateFields.caption = result.data.caption;
            }

            bulkOps.push({
              updateOne: {
                filter: { _id: doc._id },
                update: updateFields,
              },
            });
          } else {
            // Just update lastCheckedAt
            bulkOps.push({
              updateOne: {
                filter: { _id: doc._id },
                update: { lastCheckedAt: new Date() },
              },
            });
          }
        }
      });
      
      if (bulkOps.length > 0) {
        await Automation.bulkWrite(bulkOps);
      }
    }

    // Get reply counts
    const automationIds = docs.map((d) => d._id);
    let countsByAutomationId = {};
    
    if (automationIds.length > 0) {
      const counts = await RepliedComment.aggregate([
        { $match: { automationId: { $in: automationIds } } },
        { $group: { _id: { automationId: "$automationId", commentId: "$commentId" } } },
        { $group: { _id: "$_id.automationId", totalReplies: { $sum: 1 } } },
      ]);

      countsByAutomationId = counts.reduce((acc, row) => {
        acc[String(row._id)] = row.totalReplies || 0;
        return acc;
      }, {});
    }

    // Build response items with updated data
    const items = (docs || []).map((d) => {
      const verifyResult = verificationResults[d.postId];
      const isLive = verifyResult?.exists === true ? true : (verifyResult?.exists === false ? false : d.postLive);
      
      // 🔥 If post was just found to be deleted, status should be inactive
      let finalStatus = d.status;
      if (verifyResult?.exists === false) {
        finalStatus = "inactive";
      }
      
      return {
        _id: d._id,
        postId: d.postId,
        status: finalStatus,
        caption: (verifyResult?.data?.caption || d.caption) ?? null,
        thumbnail: (verifyResult?.data?.thumbnail || d.thumbnail) ?? null,
        createdAt: d.createdAt,
        totalReplies: countsByAutomationId[String(d._id)] ?? 0,
        postLive: isLive,
        lastCheckedAt: d.lastCheckedAt || new Date(),
      };
    });

    return res.json({ success: true, items, total, page, limit });
  } catch (err) {
    console.error("GET /usersOn/automations error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch automations" });
  }
});


router.post("/automation/details", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id || req.user?._id;
    const { postId } = req.body || {};

    if (!postId) {
      return res.status(400).json({ message: "postId is required" });
    }

    // 1) Load the Automation
    const doc = await Automation.findOne({ userId, postId }).lean();
    if (!doc) {
      return res.status(404).json({ message: "Automation not found" });
    }

    // --- Extracted Data for Payload ---
    const sharedPayload = {
      postId: doc.postId,
      caption: doc.caption || "",
      thumbnail: doc.thumbnail || "",
      keywords: Array.isArray(doc.keywords) ? doc.keywords : [],
      replyComment: doc.replyComment || "",
      hasReply: !!doc.hasReply,
      dmMessage: doc.dmMessage || "", 
      buttonText: doc.buttonText || "",
      // 🔥 CRITICAL: Include the flow nodes array
      flowNodes: Array.isArray(doc.flowNodes) ? doc.flowNodes : [],
    };
    // ----------------------------------

    // 🔥 If post is not live, return immediately with limited data
    if (doc.postLive === false) {
      const payload = {
        ...sharedPayload,
        status: "inactive", // Force inactive
        postLive: false,
      };
      return res.json(payload);
    }

    // 2) Get user's FB token for Graph calls (only if post is live)
    const user = await USER.findById(userId)
      .select("fbLongLivedToken")
      .lean();
    if (!user?.fbLongLivedToken) {
      // Return with DB/cached data if token is missing
      return res.json({
         ...sharedPayload,
         status: doc.status || "inactive",
         postLive: doc.postLive !== false,
         message: "Warning: Instagram token missing. Using cached media data.",
      });
    }

    // 3) Fetch the post details from Graph API
    const fields = "id,caption,media_type,media_url,thumbnail_url";
    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(
      postId
    )}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(
      user.fbLongLivedToken
    )}`;

    let fetchedCaption = null;
    let fetchedThumbnail = null;
    let fetchedMediaType = null;
    let postStillExists = true;

    try {
      const ig = await getWithRetries(url, { retries: 3, timeout: 5000 });
      fetchedCaption = typeof ig?.caption === "string" ? ig.caption : null;
      fetchedMediaType = ig?.media_type || null;

      if (ig) {
        fetchedThumbnail = (ig.media_type === "VIDEO") 
          ? ig.thumbnail_url || ig.media_url || null
          : ig.media_url || null;
      }
    } catch (graphErr) {
      const errorCode = graphErr?.response?.data?.error?.code;
      const errorMessage = graphErr?.response?.data?.error?.message || "";
      
      if (
        graphErr?.response?.status === 404 || errorCode === 100 || errorCode === 10 || 
        errorMessage.includes("does not exist") || errorMessage.includes("not found")
      ) {
        postStillExists = false;
        
        await Automation.updateOne(
          { _id: doc._id },
          { $set: { postLive: false, status: "inactive", lastCheckedAt: new Date() } }
        );
        
        // Return response indicating post is deleted
        return res.json({
          ...sharedPayload,
          status: "inactive",
          postLive: false, // Mark as deleted
        });
      }
      
      console.warn("Graph fetch failed for post", postId, graphErr?.message);
    }

    // 4) Persist the fetched fields back to Automation (only if fetched)
    const updateSet = { lastCheckedAt: new Date(), postLive: postStillExists };
    if (fetchedCaption !== null) updateSet.caption = fetchedCaption;
    if (fetchedThumbnail !== null) updateSet.thumbnail = fetchedThumbnail;

    if (Object.keys(updateSet).length > 1) { // > 1 because lastCheckedAt is always there
      await Automation.updateOne({ _id: doc._id }, { $set: updateSet });
    }

    // 5) Build final payload using freshest values (Graph > DB > fallback)
    const payload = {
      ...sharedPayload,
      caption: (fetchedCaption ?? doc.caption ?? "").trim(),
      thumbnail: fetchedThumbnail ?? (doc.thumbnail && doc.thumbnail.trim()),
      status: doc.status || "inactive",
      postLive: postStillExists,
      mediaType: fetchedMediaType || doc.mediaType || "",
    };

    return res.json(payload);
  } catch (err) {
    console.error("POST /automation/details error:", err);
    return res.status(500).json({ message: "Failed to load automation" });
  }
});


router.post("/automation/delete", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id || req.user?._id;
    const { postId } = req.body || {};

    if (!postId) {
      return res.status(400).json({ message: "postId is required" });
    }

    // Attempt to delete the automation record
    const result = await Automation.findOneAndDelete({
      userId: userId,
      postId: postId,
    });

    if (!result) {
      // If result is null, no document matched the criteria
      return res.status(404).json({ message: "Automation not found for this post." });
    }

    // Success response
    res.status(200).json({ 
      message: `Automation deleted successfully for Post ID: ${postId}.`,
      deletedCount: 1 
    });

  } catch (err) {
    console.error("POST /automation/delete error:", err);
    res.status(500).json({ message: "Failed to delete automation." });
  }
});

router.post("/automation/replied-users", authenticateToken, async (req, res) => {
  try {
    const ownerUserId = req.user?.user_id || req.user?._id;
    const { startDate, endDate, page = 1, limit = 10 } = req.body || {};

    const pageInt = parseInt(page);
    const limitInt = parseInt(limit);
    const skip = (pageInt - 1) * limitInt;

    const ownerObjectId = new mongoose.Types.ObjectId(ownerUserId);

    // --- 1. COUNT ALL-TIME UNIQUE USERS (No date filter) ---
    const allTimeCountPipeline = [
      { $match: { userId: ownerObjectId } },
      { $group: { _id: "$username" } }, // Group to get unique users
      { $count: "totalAllTimeCount" }
    ];
    
    const allTimeResult = await RepliedComment.aggregate(allTimeCountPipeline);
    const totalAllTimeCount = allTimeResult[0]?.totalAllTimeCount || 0;

    // --- 2. Build Filtered Match Criteria ---
    const matchCriteria = {
      userId: ownerObjectId,
    };

    const dateQuery = {};
    if (startDate) {
        dateQuery.$gte = new Date(startDate);
    }
    if (endDate) {
        // We use the adjusted end date from the frontend's calculation for consistency
        dateQuery.$lt = new Date(endDate); 
    }

    if (Object.keys(dateQuery).length > 0) {
        matchCriteria.createdAt = dateQuery;
    }

    // --- 3. Pipeline Construction (Filtered Data) ---
    const dataPipeline = [
      { $match: matchCriteria },
      { $sort: { createdAt: -1 } },

      // Group by username to get unique contacts in the filtered range
      {
        $group: {
          _id: "$username",
          profilePic: { $first: "$profilePic" },
          followsBusiness: { $first: "$followsBusiness" },
          text: { $first: "$text" }, 
          lastInteracted: { $max: "$createdAt" }, 
          interactionCount: { $sum: 1 }, 
        },
      },
      
      // Sort the unique results by lastInteracted (newest users first)
      { $sort: { lastInteracted: -1 } },
      
      // --- $facet for Count and Paging ---
      {
          $facet: {
              metadata: [
                  { $count: "totalCount" } // Count of unique users in the FILTERED range
              ],
              data: [
                  { $skip: skip },
                  { $limit: limitInt },
                  { $project: {
                      _id: 0, 
                      username: "$_id", 
                      profilePic: 1,
                      followsBusiness: 1,
                      interactionCount: 1,
                      lastInteracted: 1, 
                      text: 1, 
                  }}
              ]
          }
      }
    ];

    const result = await RepliedComment.aggregate(dataPipeline);
    const aggregatedData = result[0];
    const totalFilteredCount = aggregatedData.metadata[0]?.totalCount || 0;
    
    // Return paginated data
    res.json({
        users: aggregatedData.data,
        totalCount: totalFilteredCount, // Count within filter range
        totalAllTimeCount: totalAllTimeCount, // Count across all time
        page: pageInt,
        limit: limitInt
    });

  } catch (err) {
    console.error("POST /automation/replied-users error:", err);
    res.status(500).json({ message: "Failed to fetch user interaction data." });
  }
});


router.post("/automation/update", authenticateToken, async (req, res) => {
  try {
    const { postId, patch } = req.body || {};
    if (!postId) return res.status(400).json({ message: "postId is required" });
    if (!patch || typeof patch !== "object")
      return res.status(400).json({ message: "patch object is required" });

    const userId = req.user?.user_id || req.user?._id;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // Filter to allowed keys only
    const setObj = {};
    for (const [k, v] of Object.entries(patch)) {
      if (ALLOWED.has(k)) setObj[k] = v;
    }

    if (Object.keys(setObj).length === 0) {
      return res.status(200).json({ message: "No changes" });
    }

    // If patch sets dm.button to null, $unset the subdoc
    const unsetObj = {};
    if ("dm.button" in setObj && setObj["dm.button"] === null) {
      unsetObj["dm.button"] = ""; // remove the whole subdocument
      delete setObj["dm.button"];  // prevent $set: { "dm.button": null }
    }

    const update = { $currentDate: { updatedAt: true } };
    if (Object.keys(setObj).length) update.$set = setObj;
    if (Object.keys(unsetObj).length) update.$unset = unsetObj;

    // Match by BOTH userId and postId
    const query = { userId, postId };

    const result = await Automation.updateOne(query, update, { upsert: false });

    // Mongoose v6: { acknowledged, matchedCount, modifiedCount }
    // Mongoose v5 compat: { n, nModified, ok }
    const matched =
      typeof result.matchedCount === "number" ? result.matchedCount : result.n;
    if (!matched) {
      return res.status(404).json({ message: "Automation not found" });
    }

    const modified =
      typeof result.modifiedCount === "number" ? result.modifiedCount : result.nModified;

    return res.status(200).json({ message: "Updated", modifiedCount: modified });
  } catch (err) {
    console.error("automation/update error:", err);
    return res.status(500).json({ message: "Internal error", error: err.message });
  }
});



// Toggle or set status: "active" | "inactive"
router.post("/automation/stop", authenticateToken, async (req, res) => {
  try {
    const { postId, status } = req.body || {};
    const userId = req.user?.user_id || req.user?._id;

    if (!postId) return res.status(400).json({ message: "postId is required" });
    if (!userId) return res.status(400).json({ message: "userId is required" });

    // If status explicitly provided, use it; otherwise toggle
    let nextStatus;
    if (status === "active" || status === "inactive") {
      nextStatus = status;
    } else {
      const existing = await Automation.findOne({ userId, postId });
      if (!existing) {
        return res
          .status(404)
          .json({ message: "Automation not found for the given userId/postId" });
      }
      nextStatus = existing.status === "active" ? "inactive" : "active";
    }

    const updated = await Automation.findOneAndUpdate(
      { userId, postId },
      { $set: { status: nextStatus, updatedAt: new Date() } },
      { new: true }
    );

    if (!updated) {
      return res
        .status(404)
        .json({ message: "Automation not found for the given userId/postId" });
    }

    return res.json({
      message: `Automation status updated to ${nextStatus}`,
      automation: updated,
    });
  } catch (err) {
    console.error("Stop/Resume automation error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});


router.post("/automation/upload-pdf", authenticateToken, upload.single("pdf"),
  async (req, res) => {
    try {
      const userId = req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      console.log('Body : ', req.body);

      // Multer memoryStorage provides file.buffer
      const file = req.file;
      const title = req.body?.title;

      // Basic validation
      if (!file || !file.buffer) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded. Ensure you send multipart/form-data with field name 'pdf'.",
        });
      }

      // Validate PDF file type
      if (file.mimetype !== "application/pdf") {
        return res.status(400).json({
          success: false,
          message: "Only PDF files are allowed.",
        });
      }

      if (!title || !title.trim()) {
        return res.status(400).json({
          success: false,
          message: "Title is required.",
        });
      }

      // Upload buffer to GCS (your helper) - it should return { publicUrl, objectName }
      const { publicUrl, objectName } = await uploadBufferToGCS(
        file.buffer,
        file.originalname || `automation-pdf-${Date.now()}.pdf`,
        file.mimetype || "application/pdf"
      );

      if (!publicUrl) {
        return res.status(500).json({ success: false, message: "Failed to upload to storage" });
      }

      // Log the final URL
      console.log("PDF uploaded successfully!");
      console.log("Public URL:", publicUrl);
      console.log("Object Name:", objectName);
      console.log("File Name:", file.originalname);
      console.log("Title:", title);
      console.log("User ID:", userId);

      // Optional: Save automation config to database here
      // const automationConfig = await AutomationConfig.create({
      //   userId,
      //   title,
      //   fileUrl: publicUrl,
      //   fileName: file.originalname,
      //   objectName,
      //   createdAt: new Date()
      // });

      return res.json({
        success: true,
        publicUrl,
        fileName: file.originalname,
        objectName,
        title,
        message: "PDF uploaded successfully",
      });
    } catch (err) {
      console.error("upload-pdf error:", err);
      return res.status(500).json({
        success: false,
        message: "Upload failed",
        error: err?.message || String(err),
      });
    }
  }
);

router.get("/payments/razorpay-key", async (req, res) => {
  return res.json({ key: RZP_KEY_ID });
});


router.get('/details-for-mandate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await USER.findById(userId).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    return res.json({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
    });
  } catch (err) {
    console.error('GET /usersOn/me/profile error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post("/create-subscription", authenticateToken, async (req, res) => {
  try {
    const { plan_id } = req.body;
      const userId = req.user?.user_id;

    const sub = await rz.subscriptions.create({
      plan_id,
      total_count: 48,             // ~83 years if monthly
      customer_notify: 1,           // Razorpay can send emails/SMS if configured
      notes: { userId: userId || "anonymous" },
    });

    res.json({ subscription_id: sub.id, plan_id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.post("/subscription/verify", authenticateToken, async (req, res) => {
  try {

    const userId = req.user?.user_id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { payment_id, subscription_id, signature } = req.body;
    if (!payment_id || !subscription_id || !signature) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const body = `${payment_id}|${subscription_id}`;
    const expected = crypto
      .createHmac("sha256", RZP_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expected !== signature) {
      return res.status(400).json({ error: "Invalid signature" });
    }

    const update = {
      user_id: userId,
      razorpay_payment_id: payment_id,
      razorpay_subscription_id: subscription_id,
      razorpay_signature: signature,
      status: "active",
      updatedAt: new Date(),
    };

    await Subscriptions.updateOne(
      { user_id : userId },                 // unique per user
      { $set: update, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});


router.get('/fetch-payment-details', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;

    if (!userId) {
      return res.json({ 
        hasAccess: false, 
        free_trial_active: false, 
        free_trial_ends_in: 0 
      });
    }

    // 1. Fetch user
    const user = await USER.findById(userId);

    if (!user) {
      return res.json({ 
        hasAccess: false, 
        free_trial_active: false, 
        free_trial_ends_in: 0 
      });
    }

    const freeTrialStart = user.free_trial_started_date ? new Date(user.free_trial_started_date) : null;
    const now = new Date();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

    let hasAccess = false;
    let free_trial_active = false;
    let free_trial_ends_in = 0;

    // --- STEP 1: Check Free Trial Status ---
    if (freeTrialStart) {
      const diffMs = now.getTime() - freeTrialStart.getTime();

      // Check if within 7 days
      if (diffMs < sevenDaysMs) {
        hasAccess = true;
        free_trial_active = true;
        
        // Calculate remaining time
        const remainingMs = sevenDaysMs - diffMs;
        // Convert to days (Math.ceil ensures that 4.1 days shows as "5 days left")
        free_trial_ends_in = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
      }
    }

    // --- STEP 2: Check Subscription Status ---
    const subscription = await Subscriptions
      .findOne({ user_id: userId, is_del: false })
      .sort({ created_at: -1 });

    // If user has an active paid subscription, they have access, 
    // and we should effectively "hide" the free trial banner logic
    if (subscription && subscription.status === 'active') {
      hasAccess = true;
      free_trial_active = false; // Override: User is paid, so trial UI shouldn't show
      free_trial_ends_in = 0;
    }


    return res.json({ 
      hasAccess, 
      free_trial_active, 
      free_trial_ends_in 
    });

  } catch (err) {
    console.error('GET /fetch-payment-details error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});


router.get("/verify-login-token", authenticateToken, (req, res) => {
  if (!req.user) {
    return res.status(401).json({ valid: false });
  }
  return res.status(200).json({ valid: true, user: req.user });
  
});

router.post("/user-login-gmail", async (req, res) => {
  try {
    const { email, firstName, lastName, picture } = req.body;
    console.log("email : ", email);

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    let user = await USER.findOne({ email });
    let wasNew = false;

    if (!user) {
      user = await USER.create({
        email,
        name: `${firstName || ""} ${lastName || ""}`.trim(),
        picture,
        is_google_user: true,
      });
      wasNew = true;
    }

    const token = await generateJWTtoken(user._id, user.email);



    res.cookie("tokenChomskeProf", token, {
  httpOnly: true,
  secure: true,                  // required when SameSite=None
  sameSite: "none",              // critical for iOS/Safari & any cross-site/iframe usage
   domain: ".chomske.com",// needed if crossing subdomains
  path: "/",             // ensure all routes get it
  maxAge: 7 * 24 * 60 * 60 * 1000
});


    return res.status(200).json({
      success: true,
      message: wasNew ? "User registered successfully" : "User logged in successfully",
      user: {
        user_id: user._id,
        user_email: user.email,
      },
      token,
      wasNew
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Internal server error", message: "An error occurred" });
  }
});

  router.get('/get-user-details', authenticateToken, async function (req, res){

    const userId = req.user?.user_id;

        if (!userId) {
          return res.status(400).json({ message: "Username is invalid." });
        }
  
    USER.findById(userId).then((result)=>{
  
      if(result){
  
      res.status(200).send({ success: true, data: { name: result.name, handleUserName: result.handleUserName, picture : result.picture, intro: result.intro, leftHeadImage: result.leftHeadImage, rightTopImage: result.rightTopImage, rightBottomImage: result.rightBottomImage, store_enabled: result.store_enabled, dm_enabled: result.dm_enabled, email: result.email}});
      res.end();

  
      }
  
      else{
      res.status(200).send({ success: false, data: null });
      res.end();
  
      }
  
    }).catch(e2=>{
  
      console.error("❌ Error fetching campaign details:", e2);
      return res.status(500).json({ error: "Internal Server Error" });
  
    })
  });

export default router;

import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import axios from "axios";
const router = express.Router();
import USER from "../models/User.js";
import ParticipantUser from "../models/ParticipantUser.js";
import Conversation from "../models/Conversation.js";
import Subscriptions from "../models/Subscriptions.js";
import DmsUsage from "../models/DmsUsage.js";
import InstagramService from "../middleware/instagramService.js";
import Message from "../models/Message.js";
import AutomationTemplate from "../models/AutomationTemplate.js";
import Participant from "../models/Participant.js"
import Bookings from "../models/Bookings.js";
import Block from "../models/Blocks.js";
import ActionLock from "../models/ActionLock.js";
import ConversationState from "../models/ConversationState.js";
import FormsData from "../models/FormsData.js";
import BankDetails from "../models/BankDetails.js";
import Transaction from "../models/Transaction.js";
import Automation from "../models/Automation.js";
import RepliedComment from "../models/RepliedComment.js";
import MagicToken from "../models/MagicToken.js";
import Product from "../models/ProductsCatalogue.js";
import PageAnalytics from "../models/PageAnalytics.js";
import NewsletterModel from "../models/Newsletter.js";
import ProductCategory from "../models/ProductCategory.js";
import Admin from "../models/Admin.js";
import RevokedToken from "../models/RevokedToken.js";
import * as cheerio from 'cheerio';
import mongoose from 'mongoose';
router.use(cookieParser());
import authenticateToken from "../middleware/authenticateTokenProfessional.js";
import authenticateParticipant from "../middleware/authenticateParticipant.js";
import authenticateAdmin from "../middleware/authenticateAdmin.js";

import generateJWTtoken  from "../middleware/generateJWTtoken.js";
import sendMailForBookings from "../utils/sendEmailBooking.js";
import sendEmailToCreator from "../utils/sendEmailToCreator.js";
import { canSendDM, checkRateLimit } from "../utils/rateLimiter.js";
import { encryptToken, decryptUserTokens } from "../utils/tokenCrypto.js";
import { ensureFreshPageTokenForUser } from "../services/tokenService.js";
import fs from "fs";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import util from "util";
import Razorpay from "razorpay";
const unlinkAsync = util.promisify(fs.unlink);
import NodeCache from "node-cache";
const metaCache = new NodeCache({ stdTTL: 86400 });
import { Storage } from '@google-cloud/storage';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import redisBridge from "../../src/realtime/redisBridge.js";
const { redisGet, redisSet, redisDel } = redisBridge;
import redis from "../../src/realtime/redis.js";

import igProfileCache from "../../src/realtime/igProfileCache.js";
const { fetchAndCacheProfileSafely, getCachedProfile } = igProfileCache;
import { performInitialConversationPull, getInitialPullStatus, saveCreatorWhatsApp } from "../services/initialConversationPull.js";


// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const storage = new Storage({
  keyFilename: join(__dirname, 'service-account-key.json')});
  
const bucketName = "myhandlewebbucket"; 
const bucket = storage.bucket(bucketName);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB - adjust based on your needs
    files: 1, // Only allow 1 file per request
  },
  fileFilter: (req, file, cb) => {
    // Use the LAST extension — catches double-extension tricks like "malware.pdf.exe"
    const ext = (file.originalname || "").split(".").pop().toLowerCase();
    const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/quicktime',
      'video/webm',
      'application/pdf',
      'application/x-pdf',     // alternate PDF MIME (some OS/browsers)
      'application/vnd.ms-excel',                                          // .xls
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'text/csv',                                                          // .csv
    ];

    const allowedExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'webm', 'pdf', 'xls', 'xlsx', 'csv'];

    // Extension is the hard gate — must always be in the allowlist regardless of MIME type.
    // This prevents "malware.exe" uploaded with mimetype "image/jpeg" from slipping through.
    if (!allowedExts.includes(ext)) {
      return cb(new Error('Invalid file type. Only images, videos, PDFs, and Excel files are allowed.'));
    }

    // MIME must also be valid. Allow application/octet-stream as a browser fallback
    // (some mobile browsers send this for all files when the specific MIME is unavailable).
    if (!allowedMimes.includes(file.mimetype) && file.mimetype !== 'application/octet-stream') {
      return cb(new Error('Invalid file type. Only images, videos, PDFs, and Excel files are allowed.'));
    }

    cb(null, true);
  },
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
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${objectName}`;

        resolve({ publicUrl, objectName });
      } catch (err) {
        reject(err);
      }
    });

    stream.end(buffer);
  });
}
const IPDATA_KEY = process.env.IPDATA_KEY;
const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const META_REDIRECT_URI = "https://chomske.com/api/usersOn/meta-callback";
const META_STATE_SECRET = process.env.META_STATE_SECRET;

const OID = (v) => new mongoose.Types.ObjectId(String(v));
const actorKey = (model, id) => `${model}:${id.toString()}`;


const RZP_KEY_ID = process.env.RZP_KEY_ID;
const RZP_KEY_SECRET = process.env.RZP_KEY_SECRET;

const rz = new Razorpay({
  key_id: RZP_KEY_ID,
  key_secret: RZP_KEY_SECRET,
});



function escapeRegex(str = "") {
  // escape special regex chars to keep regex search safe
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const LINKPREVIEW_API_KEY = process.env.LINKPREVIEW_API_KEY;

async function lookupGeo_ipdata(ip) {
  if (!IPDATA_KEY) {
    console.warn("IPDATA_API_KEY not set; skipping ipdata lookup");
    return null;
  }

  try {
    const ipSegment = ip ? `/${encodeURIComponent(ip)}` : "";
    const url = `https://api.ipdata.co${ipSegment}?api-key=${encodeURIComponent(IPDATA_KEY)}`;

    const resp = await axios.get(url, { timeout: 3000 }); // 3s timeout
    const d = resp.data;

    return {
      ip: d.ip,
      country: d.country_code || d.country,
      country_name: d.country_name,
      region: d.region,
      city: d.city,
      postal: d.postal,
      latitude: d.latitude,
      longitude: d.longitude,
      timezone: d.time_zone?.name || d.time_zone,
      raw: d
    };
  } catch (err) {
    // log but don't throw (caller should handle null)
    console.warn("ipdata lookup failed:", err?.response?.status, err?.message || err);
    return null;
  }
}

 function isPrivateIp(ip) {
  if (!ip) return false;
  // remove IPv6 zone id if present (e.g. fe80::1%lo0)
  const clean = ip.split("%")[0];

  // normalize IPv6 mapped IPv4
  const normalized = clean.startsWith("::ffff:") ? clean.split("::ffff:")[1] : clean;

  // quick private checks (IPv4)
  if (/^127\./.test(normalized)) return true; // loopback
  if (/^10\./.test(normalized)) return true;
  if (/^192\.168\./.test(normalized)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(normalized)) return true;

  // IPv6 local/unique-local/loopback
  if (normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique-local
  if (normalized.startsWith("fe80")) return true; // link-local

  return false;
}

async function normalizeIp(ip) {
  if (!ip) return null;
  const cleaned = ip.split("%")[0]; // drop zone id
  if (cleaned.startsWith("::ffff:")) return cleaned.split("::ffff:")[1];
  return cleaned;
}

async function getClientIp(req) {
  // common proxy headers (X-Forwarded-For can be a comma list)
  const headerChecks = [
    "x-client-ip",
    "x-forwarded-for",
    "x-real-ip",
    "cf-connecting-ip", // Cloudflare
    "fastly-client-ip",
    "true-client-ip",
    "x-appengine-user-ip",
  ];

  let ip = null;
  for (const h of headerChecks) {
    const val = req.headers[h];
    if (!val) continue;
    // X-Forwarded-For may contain a list of IPs; take the first non-empty one
    const candidate = val.split(",")[0].trim();
    if (candidate) {
      ip = candidate;
      break;
    }
  }

  // fallback to Express/Node remote address
  if (!ip) {
    ip = req.connection?.remoteAddress || req.socket?.remoteAddress || req.ip || null;
  }

  ip = await normalizeIp(ip);

  // if local/private, return null (so callers know not to call external geo APIs)
  if (isPrivateIp(ip)) return null;

  return ip;
}

const UA ="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36";

async function generateUniqueOrderId() {
  const maxAttempts = 10;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Generate date-based prefix (last 6 digits of YYYYMMDD)
    const now = new Date();
    const dateStr = now.getFullYear().toString().slice(-2) + 
                   (now.getMonth() + 1).toString().padStart(2, '0') + 
                   now.getDate().toString().padStart(2, '0');
    
    // Generate 2 random digits
    const randomPart = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    
    // Combine to create 8-digit order ID
    const orderId = dateStr + randomPart;
    
    // Check if this order_id already exists
    const existingOrder = await Bookings.findOne({ booking_id: orderId });
    
    if (!existingOrder) {
      return orderId;
    }
  }
  
  // Fallback: Use timestamp-based approach if all attempts fail
  const timestamp = Date.now().toString();
  return timestamp.slice(-8);
}


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
// Helper function to check if image URL is valid
async function isImageUrlValid(url) {
  if (!url) return false;
  
  try {
    const response = await axios.head(url, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    // Check if response is OK and content type is image
    const contentType = response.headers['content-type'];
    return response.status === 200 && contentType && contentType.startsWith('image/');
  } catch (error) {
    return false;
  }
}

// Helper function to scrape fresh image URL from product page
async function scrapeProductImage(productUrl) {
  try {
    // Add your scraping logic here
    // This is a placeholder - implement based on your scraping method
    const response = await axios.get(productUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    // Parse HTML and extract image URL
    // Example for Amazon (adjust based on your needs)
    const $ = cheerio.load(response.data);
    
    // Amazon main image selector (may need updating)
    const imageUrl = $('#landingImage').attr('src') || 
                    $('.a-dynamic-image').first().attr('src') ||
                    $('img[data-old-hires]').first().attr('data-old-hires');
    
    return imageUrl;
  } catch (error) {
    console.error('Error scraping image:', error.message);
    return null;
  }
}




// Helper: parse date range from key
async function getDateRange(rangeKey) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (rangeKey) {
    case "today":
      return { start: startOfToday, end: new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000) };
    case "last7": {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 6); // include today => 7 days
      const end = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
      return { start, end };
    }
    case "last28": {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 27);
      const end = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
      return { start, end };
    }
    default:
      return null; // no filter
  }
}

// utils/extractSubdomain.js
async function extractHandleFromHost(host, roots = ["chomske.com"]) {
  if (!host) return "";
  const raw = String(host).toLowerCase().split(":")[0]; // strip :3000, etc.

  // If the host matches any known root (or is a subdomain of it)
  for (const root of roots) {
    if (raw === root || raw.endsWith("." + root)) {
      // remove ".root" from the end to get the left part(s)
      const left = raw.replace(new RegExp("\\." + root.replace(/\./g, "\\.") + "$"), "");
      if (!left) return "";

      // e.g. "sid4real" or "www.sid4real"
      const parts = left.split(".");
      // If there's a leading "www", drop it and pick the next label
      const last = parts[0] === "www" ? parts.slice(1) : parts;
      return last.length ? last[last.length - 1] : "";
    }
  }

  // Generic fallback: sub.domain.tld => take first label (with www handling)
  const parts = raw.split(".");
  if (parts.length >= 3) return parts[0] === "www" ? parts[1] : parts[0];
  return "";
}

// --- helpers ---
const RESERVED = new Set([
  "www","admin","root","api","mail","support","help","blog","status","app","cdn",
  "static","images","dev","test","staging","beta"
]);

const isValidSubdomain = (s) =>
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s);


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


const IG_API_VERSION = "v24.0"; // bump if you’re targeting a newer Graph version

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
  // Decrypt stored tokens before use
  decryptUserTokens(user);
  // Only attempt if we have a user token on file
  if (!user?.fbLongLivedToken) return null;

  const remaining = daysLeft(user.fbLongLivedTokenExpiry);
  // Refresh if less than 28 days remaining (or whatever your threshold is)
  if (remaining >= 28) return null; 

  console.log(`Token expiring in ${remaining} days. Refreshing...`);

  // 1️⃣ Refresh long-lived USER token
  const llResp = await axios.get(`${FB_API}/oauth/access_token`, {
    params: {
      grant_type: "fb_exchange_token",
      client_id: process.env.META_APP_ID || META_APP_ID,
      client_secret: process.env.META_APP_SECRET || META_APP_SECRET,
      fb_exchange_token: user.fbLongLivedToken,
    },
  });

  const newUserLL = llResp.data?.access_token;
  if (!newUserLL) throw new Error("Failed to refresh long-lived user token");

  // Calculate new expiry (API usually returns expires_in, otherwise fallback)
  const expiresInSec = llResp.data?.expires_in; 
  let newUserExpiry;
  if (expiresInSec) {
      newUserExpiry = new Date(Date.now() + expiresInSec * 1000);
  } else {
      newUserExpiry = new Date(Date.now() + FALLBACK_58_DAYS_MS);
  }
  
  // 2️⃣ Re-fetch PAGE token using the Workaround (List accounts -> Find match)
  let newPageToken = user.fbPageAccessToken || null;

  if (user.fbPageId) {
    try {
        // We use /me/accounts because we might not have permission to query /<page-id> directly
        const accountsResp = await axios.get(`${FB_API}/me/accounts`, {
            params: { 
                access_token: newUserLL,
                fields: "id,name,access_token",
                limit: 100 // Fetch up to 100 pages to ensure we find ours
            },
        });

        const pages = accountsResp.data?.data || [];
        
        // Find the specific page connected to this user
        const targetPage = pages.find(p => p.id === user.fbPageId);

        if (targetPage && targetPage.access_token) {
            newPageToken = targetPage.access_token;
            console.log("✅ Successfully refreshed Page Access Token via accounts list");
        } else {
            console.warn(`⚠️ User refreshed token, but Page ID ${user.fbPageId} was not found in their /me/accounts list.`);
        }

    } catch (pageErr) {
        console.error("❌ Failed to fetch /me/accounts during refresh:", pageErr?.response?.data || pageErr.message);
        // We do NOT throw here. We still want to save the new User Token even if Page Token fetch failed.
    }
  }

  const patch = {
    fbLongLivedToken: encryptToken(newUserLL),
    fbLongLivedTokenExpiry: newUserExpiry,
    fbPageAccessToken: encryptToken(newPageToken),
    fbLastRefreshAt: new Date(),
    fbNeedsReconnect: false, // Reset this flag since we succeeded
    updated_at: new Date(),
  };

  await USER.findByIdAndUpdate(user._id, patch);
  return patch;
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
// Upload from a local file path (works with multer({ dest: "uploads/" }))
async function uploadFilePathToGCS(filePath, originalName, mimeType) {
  if (!bucket) throw new Error("GCS bucket not configured.");
  const ext = path.extname(originalName) || path.extname(filePath) || "";
  const objectName = `products/${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
  const file = bucket.file(objectName);

  return new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(filePath);
    const writeStream = file.createWriteStream({
      metadata: { contentType: mimeType || "application/octet-stream" },
      resumable: false,
    });

    readStream.on("error", (err) => {
      reject(err);
    });

    writeStream.on("error", (err) => {
      reject(err);
    });

    writeStream.on("finish", async () => {
      try {
        await file.makePublic();
        const publicUrl = `https://storage.googleapis.com/${bucketName}/${objectName}`;

        // cleanup local file - don't block the response if deletion fails, but attempt it
        try {
          await unlinkAsync(filePath);
        } catch (unlinkErr) {
          console.warn("Failed to remove local upload file:", unlinkErr.message);
        }

        resolve({ publicUrl, objectName });
      } catch (err) {
        reject(err);
      }
    });

    // pipe the local file into GCS write stream
    readStream.pipe(writeStream);
  });
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


  function normalizeMessage(msg, igConversationId) {

  // 1. Unsupported (shared reel, post, etc.)
if (msg.is_unsupported) {
  return {
    type: "system",
    text: "Shared a reel",
    action: {
      label: "View on Instagram",
      url: igConversationId
        ? `https://www.instagram.com/direct/inbox/`
        : null
    },
    media: null
  };
}


  // 2. Attachments (image / video sent manually)
  if (msg.attachments?.data?.length) {
    const attachment = msg.attachments.data[0];

    if (attachment.image_data?.url) {
      return {
        type: "image",
        text: "",
        media: {
          url: attachment.image_data.url,
          previewUrl: attachment.image_data.preview_url || attachment.image_data.url,
          width: attachment.image_data.width,
          height: attachment.image_data.height
        }
      };
    }

    if (attachment.video_data?.url) {
      return {
        type: "video",
        text: "",
        media: {
          url: attachment.video_data.url
        }
      };
    }

    return {
      type: "system",
      text: "Sent an attachment",
      media: null
    };
  }

  // 3. Plain text message
  if (msg.message && msg.message.trim()) {
    return {
      type: "text",
      text: msg.message,
      media: null
    };
  }

  // 4. Fallback (should be rare)
  return {
    type: "system",
    text: "",
    media: null
  };
}


 function buildInstagramPayload({
  type,
  text,
  mediaUrl,
  recipientIgUserId,
}) {
  // TEXT + EMOJI
  if (type === "text") {
    if (!text || text.trim() === "") {
      throw new Error("Text message requires non-empty text");
    }
    return {
      recipient: { id: recipientIgUserId },
      message: { text: text.trim() },
    };
  }

  // IMAGE or VIDEO
  if (type === "image" || type === "video") {
    if (!mediaUrl) {
      throw new Error(`${type} message requires mediaUrl`);
    }
    return {
      recipient: { id: recipientIgUserId },
      message: {
        attachment: {
          type,
          payload: {
            url: mediaUrl,
            is_reusable: true,
          },
        },
      },
    };
  }

  throw new Error("Unsupported message type");
}

// Add 'participantIgUserId' as a 3rd argument
function normalizeInstagramMessage(metaMsg, conversationId, participantIgUserId) {
  const attachment = metaMsg.attachments?.data?.[0];

  let type = "text";
  let mediaUrl = null;
  let mediaType = null;

  // Handle Attachments
  if (attachment) {
    if (attachment.image_data) {
      type = "image";
      mediaType = "image";
      mediaUrl = attachment.image_data.url;
    } else if (attachment.video_data) {
      type = "video";
      mediaType = "video";
      mediaUrl = attachment.video_data.url;
    }
  }

  // Handle "Sticker" or other types gracefully so text isn't null
  // (Instagram sometimes sends stickers with no text)
  const textContent = metaMsg.message || (type === "text" ? "" : null);

  // FIX 1: Sender Logic
  // Check if the sender ID matches the Participant's ID. 
  // If yes, it's 'them'. If no (it's the Page ID), it's 'me'.
  const isFromParticipant = metaMsg.from?.id === participantIgUserId;

  return {
    conversationId,
    platform: "instagram",
    igMessageId: metaMsg.id, 
    sender: isFromParticipant ? "them" : "me", // <--- FIXED
    senderType: "instagram",
    type,
    text: textContent,
    mediaUrl,
    mediaType,
    createdAtPlatform: new Date(metaMsg.created_time),
    metaCursor: metaMsg.id, 
    isRead: true, 
    isDeleted: false,
    // Note: We do NOT generate _id here yet to keep it pure, 
    // but we will handle it in the route.
  };
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

router.post("/logout", authenticateToken, async (req, res) => {
  // Revoke the token so it cannot be reused even before its natural expiry
  try {
    const { jti, exp } = req.user;
    if (jti && exp) {
      await RevokedToken.create({ jti, expiresAt: new Date(exp * 1000) });
    }
  } catch (err) {
    // Don't fail the logout if blacklist write fails
    console.error("Token revocation failed:", err.message);
  }

  res.clearCookie("tokenMyhandleProf", { path: "/" });
  res.clearCookie("tokenMyhandleProf", {
    path: "/",
    domain: ".chomske.com",
    secure: true,
    sameSite: "none",
  });

  res.status(200).json({ message: "Logged out successfully" });
});

const DEMO_EMAIL = "demoaccount@chomske.com";
const DEMO_PASS = "demoaccount";

router.post("/demo-login", async (req, res) => {
try {
  // Rate limit: 5 attempts per 15 minutes per IP
  const _demoIp = await getClientIp(req);
  const _demoAllowed = await checkRateLimit(`auth:demo-login:${_demoIp}`, 5, 15 * 60 * 1000);
  if (!_demoAllowed) return res.status(429).json({ success: false, message: "Too many login attempts. Please try again later." });

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
      res.cookie("tokenMyhandleProf", token, {
  httpOnly: true,
  secure: true,                  // required when SameSite=None
  sameSite: "none",              // critical for iOS/Safari & any cross-site/iframe usage
   domain: ".chomske.com",// needed if crossing subdomains
  path: "/",             // ensure all routes get it
  maxAge: 3 * 24 * 60 * 60 * 1000   // 3 days — matches JWT expiry
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
    const { fbPageAccessToken: freshToken } = await ensureFreshPageTokenForUser(userId);

    const user = await USER.findById(userId)
      .select("instagramConnected igUserId igUsername igProfilePic igPicLastChecked")
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

    const token = freshToken;

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


router.get("/get-my-transactions", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // 1) Find user's handle/ subdomain
    const user = await USER.findById(userId).select("handleUserName email name").lean();
    if (!user || !user.handleUserName) {
      return res.status(404).json({ error: "User or handle not found" });
    }
    const subdomain = user.handleUserName;

    // 2) Parse query
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const perPage = Math.min(Math.max(parseInt(req.query.limit || "10", 10), 1), 100);

    const now = new Date();
    const defaultStart = new Date(now);
    defaultStart.setDate(defaultStart.getDate() - 7); // last 7 days by default

    const start = req.query.start ? new Date(req.query.start) : defaultStart;
    const end = req.query.end ? new Date(req.query.end) : now;
    // normalize end to end-of-day
    end.setHours(23, 59, 59, 999);

    const match = {
      subdomain,
      status: "paid",
      paidAt: { $gte: start, $lte: end },
    };

    // 3) Count + fetch (project only what UI needs + a few audit fields)
    const [total, rows] = await Promise.all([
      Transaction.countDocuments(match),
      Transaction.find(match)
        .sort({ paidAt: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage)
        .select({
          productTitle: 1,
          paidAt: 1,
          amount: 1,
          currency: 1,
          customer: 1,
          paymentMethod: 1,
          orderId: 1,
          paymentId: 1,
          subdomain: 1,
          status: 1,
        })
        .lean()
    ]);

    res.json({
      page,
      limit: perPage,
      total,
      hasMore: page * perPage < total,
      range: { start, end },
      subdomain,
      data: rows,
    });
  } catch (err) {
    console.error("GET /api/transactions/mine error:", err);
    res.status(500).json({ error: "Something went wrong" });
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

      // 4) Subscribe page to webhooks so automations fire on new posts
      const subscribeResult = await subscribePageToInstagramWebhooks(
        fbPageId,
        fbPageAccessToken,
        FB_APP_SECRET
      );

      // 5) Persist ALL requested fields
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

            // Tokens & expiry (encrypted at rest)
            fbLongLivedToken: encryptToken(longLivedUserToken),
            fbTokenExpiry: userTokenExpiryISO ? new Date(userTokenExpiryISO) : null,

            // Page token (needed for DMs) & id (encrypted at rest)
            fbPageAccessToken: encryptToken(fbPageAccessToken),
            fbPageId,

            // Optional capability flag
            dm_enabled: true,

            // Webhook feed subscription status
            automationFeedSubscribed: subscribeResult.success === true,
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



router.get(["/meta-callback", "/meta-callback/"], async (req, res) => {
  const { code, state } = req.query;

  try {
    if (!code) throw new Error("Missing OAuth code");
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

    // 2️⃣ Exchange code → short-lived token
    const tokenResp = await axios.get("https://graph.facebook.com/v24.0/oauth/access_token", {
      params: {
        client_id: META_APP_ID,
        client_secret: META_APP_SECRET,
        redirect_uri: META_REDIRECT_URI,
        code,
      },
    });

    const shortUserToken = tokenResp.data?.access_token;
    if (!shortUserToken) throw new Error("Token exchange failed");

    // 3️⃣ Exchange short-lived token → long-lived token
    const llResp = await axios.get("https://graph.facebook.com/v24.0/oauth/access_token", {
      params: {
        grant_type: "fb_exchange_token",
        client_id: META_APP_ID,
        client_secret: META_APP_SECRET,
        fb_exchange_token: shortUserToken,
      },
    });

    const fbLongLivedToken = llResp.data?.access_token;
    if (!fbLongLivedToken) throw new Error("Failed to obtain long-lived token");

    // ✅ Compute expiry
    const expiresInSecRaw = llResp.data?.expires_in;
    const expiresInSec = Number.isFinite(Number(expiresInSecRaw)) ? Number(expiresInSecRaw) : null;
    const nowMs = Date.now();
    let fbLongLivedTokenExpiry;

    if (expiresInSec && expiresInSec > 0) {
      fbLongLivedTokenExpiry = new Date(nowMs + expiresInSec * 1000);
    } else {
      const FIFTY_EIGHT_DAYS_MS = 58 * 24 * 60 * 60 * 1000;
      fbLongLivedTokenExpiry = new Date(nowMs + FIFTY_EIGHT_DAYS_MS);
    }

    // Save early (encrypt at rest)
    await USER.findByIdAndUpdate(
      userId,
      {
        fbLongLivedToken: encryptToken(fbLongLivedToken),
        fbLongLivedTokenExpiry,
        updated_at: new Date(),
      },
      { new: false }
    );

    // 4️⃣ Fetch user pages (with linked IG)
    const pagesResp = await axios.get("https://graph.facebook.com/v24.0/me/accounts", {
      params: {
        fields: "id,name,access_token,instagram_business_account{id,username,profile_picture_url}",
        access_token: fbLongLivedToken,
      },
    });

    console.log('pageResp : ', pagesResp.data);
    console.log('pageResp Data : ', pagesResp.data.data);

    const pages = pagesResp.data?.data || [];
    if (!pages.length) throw new Error("No Facebook Pages found for this user.");

    // Pick first Page that has linked IG account
    const pageWithIG = pages.find((p) => p?.instagram_business_account?.id);
    if (!pageWithIG) throw new Error("No Page with a linked Instagram Business/Creator account found.");

    const fbPageId = pageWithIG.id;
    const igUserId = pageWithIG.instagram_business_account.id;

  const fbPageAccessToken = pageWithIG.access_token;


    if (!fbPageAccessToken) {
      throw new Error("Unable to fetch Page access token. Check your pages_* permissions.");
    }

    // 6️⃣ Fetch Instagram details using Page token
    const igResp = await axios.get(`https://graph.facebook.com/v24.0/${igUserId}`, {
      params: {
        fields: "id,username,profile_picture_url,biography,followers_count,follows_count,media_count",
        access_token: fbPageAccessToken,
      },
    });

    const ig = igResp.data || {};
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
  // 7️⃣ Subscribe page to Instagram webhooks so automations fire on new posts
  const subscribeResult = await subscribePageToInstagramWebhooks(
    fbPageId,
    fbPageAccessToken,
    META_APP_SECRET
  );

  // 8️⃣ Save all data to USER
await USER.findByIdAndUpdate(
  userId,
  {
    instagramConnected: true,
    fbPageId,
    igUserId: ig.id,
    igId: ig.id,
    igName: pageWithIG.name || igUsername || null,
    igUsername,
    igProfilePic,
    igFollowersCount,
    igFollowsCount,
    igMediaCount,
    igBiography,
    fbPageAccessToken: encryptToken(fbPageAccessToken),
    has_profile_pic_ig,
    duplicateExists: false,
    duplicateInfo: null,
    automationFeedSubscribed: subscribeResult.success === true,
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
    decryptUserTokens(user);
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
      fbPageAccessToken: encryptToken(fbPageAccessToken),
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


router.get('/fetch-creatorid', authenticateToken, async function (req, res) {
    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(400).json({ message: "Username is invalid." });
    }

      res.json({
    success: true,
    user: {
      _id: userId
    }
  });

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

async function saveBankDetails(req, res) {
  try {
    const rawUserId = req.user?.user_id;
    const userId = mongoose.isValidObjectId(rawUserId)
      ? new mongoose.Types.ObjectId(rawUserId)
      : rawUserId;

    let { name, bankName, accountNumber, ifsc } = req.body || {};
    name = (name || "").trim();
    bankName = (bankName || "").trim();
    accountNumber = (accountNumber || "").trim();
    ifsc = (ifsc || "").trim().toUpperCase();

    if (!name || !bankName || !accountNumber || !ifsc) {
      return res.status(400).json({ message: "All fields are required." });
    }
    if (!/^\d{6,18}$/.test(accountNumber)) {
      return res.status(400).json({ message: "Account Number should be 6–18 digits." });
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
      return res.status(400).json({ message: "Invalid IFSC code." });
    }

    const doc = await BankDetails.findOneAndUpdate(
      { user_id: userId },
      {
        $set: {
          name_on_bank: name,
          bank_name: bankName,
          account_number: accountNumber,
          bank_ifsc: ifsc,
          is_del: false,
        },
        $setOnInsert: { user_id: userId },
      },
      { new: true, upsert: true }
    ).lean();

    return res.json({
      bankDetails: {
        name: doc.name_on_bank,
        bankName: doc.bank_name,
        accountNumber: doc.account_number,
        ifsc: doc.bank_ifsc,
      },
    });
  } catch (e) {
    console.error("saveBankDetails error:", e);
    return res.status(500).json({ message: "Server error" });
  }
}





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

// GET /instagram/posts
router.get("/instagram/posts", authenticateToken, async (req, res) => {
  try {
    const tokenUserId = req.user?.user_id;
    const { fbLongLivedToken, igUserId } = await ensureFreshPageTokenForUser(tokenUserId);
    if (!igUserId) return res.status(400).json({ error: "Instagram not connected" });

    const fields = "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp";
    const limit = Number(req.query.limit) || 12;

    // --- Accept either a composite `cursor` OR explicit reels_after/photos_after ---
    let reelsAfterParam = req.query.reels_after || null;
    let photosAfterParam = req.query.photos_after || null;

    if (req.query.cursor) {
      try {
        const decoded = Buffer.from(req.query.cursor, "base64").toString("utf8");
        const parsed = JSON.parse(decoded);
        reelsAfterParam = parsed.reels_after ?? reelsAfterParam;
        photosAfterParam = parsed.photos_after ?? photosAfterParam;
      } catch (err) {
        console.warn("Invalid composite cursor provided, ignoring and loading first page");
      }
    }

    const reelsAfter = reelsAfterParam ? `&after=${encodeURIComponent(reelsAfterParam)}` : "";
    const photosAfter = photosAfterParam ? `&after=${encodeURIComponent(photosAfterParam)}` : "";

    const reelsUrl = `https://graph.facebook.com/v21.0/${igUserId}/media?fields=${fields}&limit=${limit}${reelsAfter}&access_token=${fbLongLivedToken}`;
    const photosUrl = `https://graph.facebook.com/v21.0/${igUserId}/media?fields=${fields}&limit=${limit}${photosAfter}&access_token=${fbLongLivedToken}`;

    // fetch concurrently (defensive)
    const [reelsResp, photosResp] = await Promise.allSettled([
      getWithRetries(reelsUrl, { retries: 3, timeout: 15000 }),
      getWithRetries(photosUrl, { retries: 3, timeout: 15000 }),
    ]);

    // Defensive extraction of arrays
    const extractArray = (resp) => {
      if (!resp || resp.status !== "fulfilled") return [];
      const payload = resp.value?.data ?? resp.value ?? resp;
      if (Array.isArray(payload?.data)) return payload.data;
      if (Array.isArray(payload)) return payload;
      return [];
    };

    const reelsData = extractArray(reelsResp);
    const photosData = extractArray(photosResp);

    // filter by type
    const videoLike = reelsData.filter(m => m.media_type === "VIDEO" || m.media_type === "REEL");
    const photoLike = photosData.filter(m => m.media_type === "IMAGE" || m.media_type === "CAROUSEL_ALBUM");

    // merge + dedupe by id, then sort by timestamp desc
    const byId = new Map();
    [...videoLike, ...photoLike].forEach(item => {
      byId.set(String(item.id), { ...(byId.get(String(item.id)) || {}), ...item });
    });
    const merged = Array.from(byId.values()).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // --- Automation lookup: match postId and userId (defensive casting) ---
    const postIds = merged.map(m => String(m.id));
    let automatedSet = new Set();
    try {
      let ownerId = null;
      try {
        ownerId = new mongoose.Types.ObjectId(tokenUserId);
      } catch (idErr) {
        ownerId = null;
      }

      // Check against Automation collection
      const query = { userId: tokenUserId, postId: { $in: postIds } };
      const automations = await Automation.find(query).select("postId").lean();

      automations.forEach(a => {
        if (a.postId) automatedSet.add(String(a.postId));
      });
    } catch (dbErr) {
      console.warn("Failed to query Automation collection:", dbErr?.message || dbErr);
      automatedSet = new Set();
    }

    // ============================================================
    // UPDATED LOGIC: Filter out posts that are already automated
    // ============================================================
    const filteredData = merged
      .filter(item => !automatedSet.has(String(item.id))) // Exclude if in set
      .map(item => ({
        ...item,
        thumbnail_url: item.thumbnail_url || item.media_url || null,
        // isAutomated property removed since we aren't sending them back
      }));

    // Build combined paging info from raw responses
    const extractPaging = (resp) => {
      if (!resp || resp.status !== "fulfilled") return null;
      const payload = resp.value?.data ?? resp.value ?? resp;
      return payload?.paging ?? resp.paging ?? null;
    };

    const paging = {
      reels: extractPaging(reelsResp),
      photos: extractPaging(photosResp),
    };

    const reelsAfterCursor = paging.reels?.cursors?.after || null;
    const photosAfterCursor = paging.photos?.cursors?.after || null;

    let compositeCursor = null;
    if (reelsAfterCursor || photosAfterCursor) {
      compositeCursor = Buffer.from(JSON.stringify({
        reels_after: reelsAfterCursor || null,
        photos_after: photosAfterCursor || null
      })).toString("base64");
    }

    res.json({
      data: filteredData, // Sending only non-automated posts
      paging,
      compositeCursor,
      meta: {
        reelsOk: reelsResp.status === "fulfilled",
        photosOk: photosResp.status === "fulfilled",
        totalFetched: filteredData.length, // Count of visible posts
        hiddenAutomatedCount: automatedSet.size, // Helpful for debugging
        reelsCount: videoLike.length,
        photosCount: photoLike.length,
      }
    });
  } catch (err) {
    console.error("Posts Fetch Error:", err?.message || err);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});




router.get("/instagram/stories", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    const { fbLongLivedToken, igUserId } = await ensureFreshPageTokenForUser(userId);
    if (!igUserId) return res.status(400).json({ error: "Instagram not connected" });

    const fields = "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp";
    const afterQuery = req.query.after ? `&after=${encodeURIComponent(req.query.after)}` : "";
    const url = `https://graph.facebook.com/v21.0/${igUserId}/stories?fields=${fields}${afterQuery}&access_token=${fbLongLivedToken}`;

    // call FB (your getWithRetries wrapper)
    const response = await getWithRetries(url, { retries: 3, timeout: 15000 });

    // --- Robust extraction of payload and paging ---
    const rawPayload = response?.data ?? response; // prefer response.data, fallback to response
    const rawData = Array.isArray(rawPayload?.data) ? rawPayload.data : Array.isArray(rawPayload) ? rawPayload : [];
    const rawPaging = rawPayload?.paging || response?.paging || null;

    // ============================================================
    // UPDATED LOGIC: Filter out stories that are already automated
    // ============================================================
    
    // 1. Collect all Story IDs from the fetch
    const storyIds = rawData.map(s => String(s.id));
    let automatedSet = new Set();

    // 2. Check against Automation collection
    try {
      // We assume your schema stores story IDs in 'postId' just like regular posts
      const query = { userId, postId: { $in: storyIds } };
      const automations = await Automation.find(query).select("postId").lean();

      automations.forEach(a => {
        if (a.postId) automatedSet.add(String(a.postId));
      });
    } catch (dbErr) {
      console.warn("Failed to query Automation collection for stories:", dbErr?.message || dbErr);
      automatedSet = new Set();
    }

    // 3. Filter and Normalize
    const filteredData = rawData
      .filter(item => !automatedSet.has(String(item.id))) // Exclude if found in DB
      .map(m => ({
        ...m,
        thumbnail_url: m.thumbnail_url || m.media_url
      }));

    // Normalize paging for frontend
    const pagingNormalized = rawPaging
      ? {
          next: Boolean(rawPaging.next),
          cursors: rawPaging.cursors || null
        }
      : null;

    // Provide a simpler nextCursor field that the client can use (?after=...)
    const nextCursor = pagingNormalized?.cursors?.after || null;

    res.json({
      data: filteredData,
      paging: pagingNormalized,
      nextCursor, 
      meta: {
        totalFetched: filteredData.length,
        hiddenAutomatedCount: automatedSet.size // Helpful for debugging
      }
    });
  } catch (err) {
    console.error("Stories Fetch Error:", err?.message || err);
    res.status(500).json({ error: "Failed to fetch Stories" });
  }
});


async function subscribePageToInstagramWebhooks(fbPageId, fbPageAccessToken, appSecret) {
  if (!fbPageId) throw new Error("fbPageId is required");
  if (!fbPageAccessToken) throw new Error("fbPageAccessToken is required");

  try {
    const params = {
      subscribed_fields: "feed",
      access_token: fbPageAccessToken,
    };

    if (appSecret) {
      params.appsecret_proof = crypto
        .createHmac("sha256", appSecret)
        .update(fbPageAccessToken)
        .digest("hex");
    }

    const subResp = await axios.post(
      `https://graph.facebook.com/v24.0/${encodeURIComponent(fbPageId)}/subscribed_apps`,
      null,
      { params, timeout: 15000 }
    );

    const success = subResp?.data?.success;
    console.log('Data:::::::::::::::::::', subResp?.data);
    console.log('Success:::::::::::::::::::', success);
    if (success) {
      console.log(`✅ Page ${fbPageId} subscribed to Webhooks!`);
    } else {
      console.warn("⚠️ Subscription response unclear:", subResp?.data);
    }

    return { success, raw: subResp?.data };

  } catch (error) {
    console.error("❌ subscribePageToInstagramWebhooks failed", error?.response?.data || error.message);
    // Don't crash the whole auth flow if this fails, just log it
    return { success: false, error: error.message }; 
  }
}


router.get("/subscription/details", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const [userDetails, usage] = await Promise.all([
      USER.findById(userId)
        .select("subscription_plan leads_plan_limit dms_plan_limit")
        .lean(),

      DmsUsage.findOne({ user_id: userId, year, month })
        .select("lead_alerts_sent total_dms_sent")
        .lean(),
    ]);

    if (!userDetails) {
      return res.status(404).json({
        message: "Subscription or user not found",
      });
    }

    return res.json({
      success: true,
      response: {
        ...userDetails,
        leads_found: usage?.lead_alerts_sent || 0,
        dms_used: usage?.total_dms_sent || 0,
      },
    });
  } catch (err) {
    console.error("Error in /subscription/details:", err);
    return res.status(500).json({ message: "Something went wrong" });
  }
});

router.get("/dms-usage/current", authenticateToken, async (req, res) => {
  try {

    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const [usage, user] = await Promise.all([
      DmsUsage.findOne({
        user_id : userId,
        year,
        month,
      }).lean(),

      USER.findById(userId).select("dms_plan_limit").lean(),
    ]);

    return res.json({
      success: true,
      data: {
        total_dms_sent: usage?.total_dms_sent || 0,
        dms_plan_limit: user?.dms_plan_limit || 0,
        year,
        month,
      },
    });
  } catch (err) {
    console.error("Error in /dms-usage/current:", err);
    return res.status(500).json({ message: "Something went wrong" });
  }
});


router.get("/dms-usage/range", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const monthsParam = req.query.months;
    if (!monthsParam) {
      return res.status(400).json({ message: "months param is required (e.g. '2025-1,2025-2')" });
    }

    const monthList = monthsParam.split(",").map((m) => {
      const [year, month] = m.split("-").map(Number);
      return { year, month };
    });

    const records = await DmsUsage.find({
      user_id: userId,
      $or: monthList.map(({ year, month }) => ({ year, month })),
    })
      .select("year month total_dms_sent lead_alerts_sent")
      .lean();

    return res.json({ success: true, data: records });
  } catch (err) {
    console.error("Error in /dms-usage/range:", err);
    return res.status(500).json({ message: "Something went wrong" });
  }
});


router.post("/automation/upload-asset", authenticateToken, upload.single("file"), async (req, res) => {
  try {
    const userId = req.user?.user_id || req.user?._id;
    
    // 1. Validation
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    
    const allowedMimes = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/jpg",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
    ];
    if (!allowedMimes.includes(req.file.mimetype)) {
      return res.status(400).json({ message: "Invalid file type. Only PDF, Images, and Excel files allowed." });
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



// GET automation by postId for editing
router.get("/automation/config/:postId", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id || req.user?._id;
    const { postId } = req.params;

    if (!postId) {
      return res.status(400).json({ success: false, message: "postId is required" });
    }

    const automation = await Automation.findOne({ 
      userId, 
      postId: String(postId) 
    }).lean();

    if (!automation) {
      return res.status(404).json({ 
        success: false, 
        message: "Automation not found" 
      });
    }

    return res.json({
      success: true,
      data: automation
    });
  } catch (err) {
    console.error("GET /automation/config/:postId error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch automation config",
      error: err?.message || String(err),
    });
  }
});

// Update the existing POST endpoint to handle edit mode
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
      flowNodes,
      keywords,
      hasReply,
      replyComments,
      isEdit
    } = req.body || {};

    if (!postId || !String(postId).trim()) {
      return res.status(400).json({ success: false, message: "postId is required" });
    }

    // 🔹 Fetch fbPageId ONLY once
    const user = await USER.findById(userId)
      .select("igUserId")
      .lean();

    if (!user?.igUserId) {
      return res.status(400).json({
        success: false,
        message: "Facebook Page not connected",
      });
    }

    const update = {
      platform: "instagram",
      caption,
      thumbnail,
      dmMessage,
      buttonText,
      flowNodes,
      keywords,
      hasReply,
      replyComments,
      updatedAt: new Date(),
    };

    const doc = await Automation.findOneAndUpdate(
      { userId, postId: String(postId) },
      {
        $set: update,
        $setOnInsert: {
          userId,
          postId: String(postId),
          igUserId: user.igUserId, // ✅ INSERT ONLY
          createdAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    return res.json({
      success: true,
      message: isEdit
        ? "Automation updated successfully"
        : "Automation configuration saved",
      data: doc,
    });
  } catch (err) {
    console.error("POST /automation/config error:", err);

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

// Save flow as a reusable template
router.post("/automation/template", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { name, dmMessage, buttonText, flowNodes, hasReply, replyComments } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: "Template name is required" });
    }

    const template = await AutomationTemplate.create({
      userId,
      name: String(name).trim(),
      dmMessage,
      buttonText,
      flowNodes: flowNodes || [],
      hasReply: hasReply || false,
      replyComments: replyComments || [],
      createdAt: new Date(),
    });

    return res.json({ success: true, message: "Template saved", data: template });
  } catch (err) {
    console.error("POST /automation/template error:", err);
    return res.status(500).json({ success: false, message: "Failed to save template" });
  }
});

// List all templates for the user
router.get("/automation/templates", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const templates = await AutomationTemplate.find({ userId })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, data: templates });
  } catch (err) {
    console.error("GET /automation/templates error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch templates" });
  }
});

// Delete a template
router.delete("/automation/template/:templateId", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { templateId } = req.params;
    const result = await AutomationTemplate.findOneAndDelete({ _id: templateId, userId });

    if (!result) {
      return res.status(404).json({ success: false, message: "Template not found" });
    }

    return res.json({ success: true, message: "Template deleted" });
  } catch (err) {
    console.error("DELETE /automation/template error:", err);
    return res.status(500).json({ success: false, message: "Failed to delete template" });
  }
});

// Upload Quick Reply Image endpoint
router.post("/automation/upload-quickreply-image", authenticateToken, upload.single("image"), async (req, res) => {
    try {
      const userId = req.user?.user_id || req.user?._id;
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const file = req.file;

      if (!file || !file.buffer) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded. Ensure you send multipart/form-data with field name 'image'.",
        });
      }

      // Validate file type
      const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];
      if (!validTypes.includes(file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: "Invalid file type. Only PNG, JPEG, GIF, and WebP images are allowed.",
        });
      }

      // Upload to GCS
      const { publicUrl, objectName } = await uploadBufferToGCS(
        file.buffer,
        file.originalname || `quickreply-${Date.now()}.jpg`,
        file.mimetype
      );

      if (!publicUrl) {
        return res.status(500).json({ 
          success: false, 
          message: "Failed to upload to storage" 
        });
      }

      console.log(`✅ Quick Reply image uploaded: ${publicUrl}`);

      return res.json({
        success: true,
        publicUrl,
        objectName,
        message: "Image uploaded successfully"
      });
    } catch (err) {
      console.error("upload-quickreply-image error:", err);
      return res.status(500).json({
        success: false,
        message: "Upload failed",
        error: err?.message || String(err),
      });
    }
  }
);

router.post("/autodm/automation/config", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const {
      postType, // REQUIRED (e.g. "autodm")
      dmMessage,
      buttonText,
      status,
      flowNodes,
      keywords,
      isEdit,
    } = req.body || {};

    if (!postType || !String(postType).trim()) {
      return res.status(400).json({
        success: false,
        message: "postType is required for AutoDM automation",
      });
    }

    // 🔹 Fetch fbPageId once
    const user = await USER.findById(userId)
      .select("igUserId")
      .lean();

    if (!user?.igUserId) {
      return res.status(400).json({
        success: false,
        message: "Facebook Page not connected",
      });
    }

    /* ─────────────────────────────────────────────
       UPDATE PAYLOAD (NO IDENTITY FIELDS)
    ───────────────────────────────────────────── */
    const update = {
      platform: "instagram",
      dmMessage,
      buttonText,
      flowNodes,
      keywords,
      ...(status ? { status } : {}),
      updatedAt: new Date(),
    };

    /* ─────────────────────────────────────────────
       UPSERT
       Identity fields ONLY on insert
    ───────────────────────────────────────────── */
    const doc = await Automation.findOneAndUpdate(
      { userId, postType: String(postType) },
      {
        $set: update,
        $setOnInsert: {
          userId,
          postType: String(postType),
          igUserId: user.igUserId, // ✅ INSERT ONLY
          createdAt: new Date(),
        },
      },
      {
        upsert: true,
        new: true,
      }
    );

    return res.json({
      success: true,
      message: isEdit
        ? "Automation updated successfully"
        : "Automation configuration saved",
      data: doc,
    });
  } catch (err) {
    console.error("POST /autodm/automation/config error:", err);

    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An AutoDM automation already exists for this user",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to save AutoDM automation config",
      error: err?.message || String(err),
    });
  }
});



// GET: Check if automation exists and return config
router.get('/autodm/automation/config', authenticateToken, async (req, res) => {
  
    const userId = req.user?.user_id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

  try {
    const automation = await Automation.findOne({ 
      userId, 
      postType: 'autodm' 
    });

    if (!automation) {
      return res.status(200).json({ exists: false });
    }

    return res.status(200).json({ 
      exists: true, 
      data: automation 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
});


// PATCH: Toggle Status (Stop/Resume)
router.patch('/autodm/automation/status', authenticateToken, async (req, res) => {
  try {

      const userId = req.user?.user_id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { isActive } = req.body; // Expect boolean

    console.log('isActive : ', isActive);
    
    const automation = await Automation.findOneAndUpdate(
      { userId, postType: 'autodm' },
      { status: isActive ? 'active' : 'inactive' },
      { new: true }
    );

    res.status(200).json({ success: true, isActive: automation.isActive });
  } catch (error) {
    res.status(500).json({ message: "Status change failed" });
  }
});



// ------------------Automation for all future posts--------------

router.post("/future/automation/config", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const {
      postType,
      dmMessage,
      buttonText,
      status,
      flowNodes,
      keywords,
      hasReply,
      replyComments,
      isEdit,
    } = req.body || {};

    if (!postType || !String(postType).trim()) {
      return res.status(400).json({
        success: false,
        message: "postType is required for AutoDM automation",
      });
    }

    // 🔹 Fetch fbPageId once
    const user = await USER.findById(userId)
      .select("igUserId")
      .lean();

    if (!user?.igUserId) {
      return res.status(400).json({
        success: false,
        message: "Facebook Page not connected",
      });
    }

    /* ─────────────────────────────────────────────
       UPDATE PAYLOAD (NO IDENTITY FIELDS)
    ───────────────────────────────────────────── */
    const update = {
      platform: "instagram",
      dmMessage,
      buttonText,
      flowNodes,
      keywords,
      hasReply,
      replyComments,
      ...(status ? { status } : {}),
      updatedAt: new Date(),
    };

    /* ─────────────────────────────────────────────
       UPSERT
       Identity fields ONLY on insert
    ───────────────────────────────────────────── */
    const doc = await Automation.findOneAndUpdate(
      { userId, postType: String(postType) },
      {
        $set: update,
        $setOnInsert: {
          userId,
          postType: String(postType),
          igUserId: user.igUserId, // ✅ INSERT ONLY
          createdAt: new Date(),
        },
      },
      {
        upsert: true,
        new: true,
      }
    );

    return res.json({
      success: true,
      message: isEdit
        ? "Automation updated successfully"
        : "Automation configuration saved",
      data: doc,
    });
  } catch (err) {
    console.error("POST /future/automation/config error:", err);

    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An automation already exists for this user",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to save automation config",
      error: err?.message || String(err),
    });
  }
});


// GET: Check if automation exists and return config
router.get('/future/automation/config', authenticateToken, async (req, res) => {
  
    const userId = req.user?.user_id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

  try {
    const automation = await Automation.findOne({ 
      userId, 
      postType: 'futurepost' 
    });

    if (!automation) {
      return res.status(200).json({ exists: false });
    }

    return res.status(200).json({ 
      exists: true, 
      data: automation 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
});

// PATCH: Toggle Status (Stop/Resume)
router.patch('/future/automation/status', authenticateToken, async (req, res) => {
  try {

      const userId = req.user?.user_id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { isActive } = req.body; // Expect boolean

    console.log('isActive : ', isActive);
    
    const automation = await Automation.findOneAndUpdate(
      { userId, postType: 'futurepost' },
      { status: isActive ? 'active' : 'inactive' },
      { new: true }
    );

    res.status(200).json({ success: true, isActive: automation.isActive });
  } catch (error) {
    res.status(500).json({ message: "Status change failed" });
  }
});

router.post("/automation-analytics", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    // const userId = "69209d811ead7fc0c348128f";

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { startDate, endDate } = req.body || {};
    const now = new Date();

    // Setup date range (default to last 28 days)
    const start = startDate ? new Date(startDate) : new Date(now);
    if (!startDate) start.setDate(start.getDate() - 27);
    start.setHours(0, 0, 0, 0);

    const end = endDate ? new Date(endDate) : new Date(now);
    end.setHours(23, 59, 59, 999);

    // Calculate previous period for comparison
    const periodDuration = end - start;
    const prevStart = new Date(start.getTime() - periodDuration);
    const prevEnd = new Date(start.getTime() - 1);
    prevEnd.setHours(23, 59, 59, 999);

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // ---------------------------
    // Current Period Promises
    // ---------------------------

    // 1. Total DMs Sent
    const totalDmsSentPromise = ActionLock.countDocuments({
      "payload.creatorId": userObjectId,
      channel: "private",
      state: { $in: ["sent", "queued"] },
      createdAt: { $gte: start, $lte: end },
    });

    // 2. Total Replies Sent
    const totalRepliesSentPromise = ActionLock.countDocuments({
      "payload.creatorId": userObjectId,
      channel: "public",
      state: { $in: ["sent", "queued"] },
      createdAt: { $gte: start, $lte: end },
    });

    // 3a. Total DMs for CTR calculation
    const totalDmsForCtrPromise = ActionLock.countDocuments({
      "payload.creatorId": userObjectId,
      channel: "private",
      state: { $in: ["sent", "queued"] },
      createdAt: { $gte: start, $lte: end },
    });

    // 3b. Total Clicks/Opens
    const totalClicksPromise = ConversationState.countDocuments({
      userId: userObjectId,
      startedAt: { $gte: start, $lte: end },
    });

    // ---------------------------
    // Previous Period Promises
    // ---------------------------

    const prevDmsSentPromise = ActionLock.countDocuments({
      "payload.creatorId": userObjectId,
      channel: "private",
      state: { $in: ["sent", "queued"] },
      createdAt: { $gte: prevStart, $lte: prevEnd },
    });

    const prevRepliesSentPromise = ActionLock.countDocuments({
      "payload.creatorId": userObjectId,
      channel: "public",
      state: { $in: ["sent", "queued"] },
      createdAt: { $gte: prevStart, $lte: prevEnd },
    });

    const prevDmsForCtrPromise = ActionLock.countDocuments({
      "payload.creatorId": userObjectId,
      channel: "private",
      state: { $in: ["sent", "queued"] },
      createdAt: { $gte: prevStart, $lte: prevEnd },
    });

    const prevClicksPromise = ConversationState.countDocuments({
      userId: userObjectId,
      startedAt: { $gte: prevStart, $lte: prevEnd },
    });

    // 4. Get user data
    const userDataPromise = USER.findById(userObjectId).select(
      "igFollowersCount igMediaCount igProfilePic igName igUsername"
    );

    // 5. Day-wise DMs sent for chart
    const dmsByDayPromise = ActionLock.aggregate([
      {
        $match: {
          "payload.creatorId": userObjectId,
          channel: "private",
          state: { $in: ["sent", "queued"] },
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          date: {
            $dateFromParts: {
              year: "$_id.year",
              month: "$_id.month",
              day: "$_id.day",
            },
          },
          count: 1,
        },
      },
      { $sort: { date: 1 } },
    ]);

    // Run all in parallel
    const [
      totalDmsSent,
      totalRepliesSent,
      totalDmsForCtr,
      totalClicks,
      prevDmsSent,
      prevRepliesSent,
      prevDmsForCtr,
      prevClicks,
      userData,
      dmsByDay,
    ] = await Promise.all([
      totalDmsSentPromise,
      totalRepliesSentPromise,
      totalDmsForCtrPromise,
      totalClicksPromise,
      prevDmsSentPromise,
      prevRepliesSentPromise,
      prevDmsForCtrPromise,
      prevClicksPromise,
      userDataPromise,
      dmsByDayPromise,
    ]);

    // Calculate CTR
    const ctr = totalDmsForCtr > 0 
      ? ((totalClicks / totalDmsForCtr) * 100).toFixed(2) 
      : 0;

    const prevCtr = prevDmsForCtr > 0
      ? ((prevClicks / prevDmsForCtr) * 100).toFixed(2)
      : 0;

    // Calculate percentage changes
    const calculateChange = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return (((current - previous) / previous) * 100).toFixed(2);
    };

    // Format chart data - fill in missing dates with 0
    const chartData = [];
    const dateMap = new Map(dmsByDay.map(item => [
      item.date.toISOString().split('T')[0],
      item.count
    ]));

    const currentDate = new Date(start);
    while (currentDate <= end) {
      const dateStr = currentDate.toISOString().split('T')[0];
      chartData.push({
        date: dateStr,
        dmsSent: dateMap.get(dateStr) || 0,
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return res.json({
      success: true,
      dateRange: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      creator: {
        name: userData?.igName || "Unknown",
        username: userData?.igUsername || "unknown",
        profilePic: userData?.igProfilePic || "",
      },
      summary: {
        totalDmsSent,
        totalRepliesSent,
        ctr: parseFloat(ctr),
        totalClicks,
        activeFollowers: userData?.igFollowersCount || 0,
        totalPosts: userData?.igMediaCount || 0,
      },
      comparison: {
        totalDmsSent: parseFloat(calculateChange(totalDmsSent, prevDmsSent)),
        totalRepliesSent: parseFloat(calculateChange(totalRepliesSent, prevRepliesSent)),
        ctr: parseFloat(calculateChange(parseFloat(ctr), parseFloat(prevCtr))),
        totalClicks: parseFloat(calculateChange(totalClicks, prevClicks)),
      },
      chartData,
    });

  } catch (err) {
    console.error("automation-analytics error:", err);
    return res.status(500).json({ 
      success: false,
      message: "Failed to load Instagram analytics",
      error: err.message 
    });
  }
});


router.post("/automation-performance", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    // const userId = "69209d811ead7fc0c348128f";

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // 1️⃣ Fetch all automations (exclude future posts)
    const automations = await Automation.find({
      userId: userObjectId,
      postType: { $ne: "futurepost" },
    })
      .select("_id caption thumbnail postType createdAt")
      .lean();

    if (!automations.length) {
      return res.json({
        success: true,
        automationBreakdown: [],
      });
    }

    const automationIds = automations.map(a => a._id);

    // 2️⃣ Total DMs sent per automation
    const dmsData = await ActionLock.aggregate([
      {
        $match: {
          automationId: { $in: automationIds },
          "payload.creatorId": userObjectId,
          channel: "private",
          state: { $in: ["sent", "queued"] },
        },
      },
      {
        $group: {
          _id: "$automationId",
          totalDms: { $sum: 1 },
        },
      },
    ]);

    // 3️⃣ Total Replies sent per automation
    const repliesData = await ActionLock.aggregate([
      {
        $match: {
          automationId: { $in: automationIds },
          "payload.creatorId": userObjectId,
          channel: "public",
          state: { $in: ["sent", "queued"] },
        },
      },
      {
        $group: {
          _id: "$automationId",
          totalReplies: { $sum: 1 },
        },
      },
    ]);

    // 4️⃣ Total Clicks per automation
    const clicksData = await ConversationState.aggregate([
      {
        $match: {
          automationId: { $in: automationIds },
          userId: userObjectId,
        },
      },
      {
        $group: {
          _id: "$automationId",
          totalClicks: { $sum: 1 },
        },
      },
    ]);

    // 5️⃣ Create lookup maps for fast access
    const dmsMap = new Map(dmsData.map(d => [d._id.toString(), d.totalDms]));
    const repliesMap = new Map(repliesData.map(r => [r._id.toString(), r.totalReplies]));
    const clicksMap = new Map(clicksData.map(c => [c._id.toString(), c.totalClicks]));

    // 6️⃣ Combine everything into final response
    const automationBreakdown = automations
      .map(automation => {
        const id = automation._id.toString();

        const totalDms = dmsMap.get(id) || 0;
        const repliesSent =
          automation.postType === "autodm"
            ? 0
            : repliesMap.get(id) || 0;

        const totalClicks = clicksMap.get(id) || 0;
        const ctr =
          totalDms > 0
            ? parseFloat(((totalClicks / totalDms) * 100).toFixed(2))
            : 0;

        return {
          automationId: automation._id,
          caption: automation.caption
            ? automation.caption.length > 100
              ? `${automation.caption.slice(0, 100)}...`
              : automation.caption
            : null,
          thumbnail: automation.thumbnail || null,
          postType: automation.postType,
          createdAt: automation.createdAt,
          repliesSent,
          totalDms,
          totalClicks,
          ctr,
        };
      })
      // show only automations that actually did something
      .filter(a => a.totalDms > 0 || a.repliesSent > 0)
      // most recently created first
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.json({
      success: true,
      automationBreakdown,
    });

  } catch (err) {
    console.error("automation-performance error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to load automation performance",
      error: err.message,
    });
  }
});




// ─── Refresh stale post thumbnails (max once per 24 hrs per automation) ──────
router.post("/refresh-post-thumbnails", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    const staleThreshold = new Date(Date.now() - TWENTY_FOUR_HOURS);

    // Find automations whose thumbnails are missing or stale
    const automations = await Automation.find({
      userId: new mongoose.Types.ObjectId(userId),
      postId: { $exists: true, $ne: null },
      postType: { $ne: "futurepost" },
      $or: [
        { thumbnailRefreshedAt: null },
        { thumbnailRefreshedAt: { $exists: false } },
        { thumbnailRefreshedAt: { $lt: staleThreshold } },
      ],
    })
      .select("_id postId")
      .lean();

    if (!automations.length) {
      return res.json({ success: true, updated: 0, thumbnails: {} });
    }

    // Need a valid page access token
    const { fbPageAccessToken } = await ensureFreshPageTokenForUser(userId);
    if (!fbPageAccessToken) {
      return res.json({ success: true, updated: 0, thumbnails: {} });
    }

    // Build postId → automationId lookup
    const postIdToAutomation = new Map();
    automations.forEach((a) => {
      if (a.postId) postIdToAutomation.set(a.postId, a._id);
    });

    const postIds = [...postIdToAutomation.keys()];
    const results = await verifyPostsExist(postIds, fbPageAccessToken);

    const thumbnailMap = {}; // automationId → { thumbnail, caption }
    const bulkOps = [];
    const now = new Date();

    for (const [postId, result] of Object.entries(results)) {
      const automationId = postIdToAutomation.get(postId);
      if (!automationId) continue;

      const idStr = automationId.toString();

      if (result.exists && result.data) {
        const { thumbnail, caption } = result.data;
        thumbnailMap[idStr] = { thumbnail: thumbnail || null, caption: caption || null };
        bulkOps.push({
          updateOne: {
            filter: { _id: automationId },
            update: {
              $set: {
                thumbnail: thumbnail || null,
                caption: caption || null,
                thumbnailRefreshedAt: now,
              },
            },
          },
        });
      } else {
        // Post gone or API error — bump the timestamp so we don't hammer the API
        bulkOps.push({
          updateOne: {
            filter: { _id: automationId },
            update: { $set: { thumbnailRefreshedAt: now } },
          },
        });
      }
    }

    if (bulkOps.length) {
      await Automation.bulkWrite(bulkOps);
    }

    return res.json({ success: true, updated: bulkOps.length, thumbnails: thumbnailMap });
  } catch (err) {
    console.error("refresh-post-thumbnails error:", err);
    return res.status(500).json({ success: false, message: "Failed to refresh thumbnails" });
  }
});

router.get("/automations", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    /* ─────────────────────────────────────────────
       1️⃣ Refresh Facebook tokens if needed
    ───────────────────────────────────────────── */
    let user;
    try {
      user = await USER.findById(userId)
        .select(
          "_id fbLongLivedToken fbLongLivedTokenExpiry fbPageId fbPageAccessToken instagramConnected"
        )
        .lean();
      decryptUserTokens(user);

      if (user?.instagramConnected) {
        await refreshFacebookTokensIfNeeded(user);
        user = await USER.findById(userId)
          .select(
            "_id fbLongLivedToken fbLongLivedTokenExpiry fbPageId fbPageAccessToken instagramConnected"
          )
          .lean();
        decryptUserTokens(user);
      }
    } catch (e) {
      console.error(
        "FB token refresh check failed:",
        e?.response?.data || e.message || e
      );
    }

    /* ─────────────────────────────────────────────
       2️⃣ Pagination
    ───────────────────────────────────────────── */
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const skip = (page - 1) * limit;


    const query = {
  userId,
  postType: { $nin: ["autodm", "futurepost"] }, // exclude both
};


    const projection =
      "postId status createdAt caption thumbnail postLive lastCheckedAt";
    const sort = { createdAt: -1 };

    const [total, docs] = await Promise.all([
      Automation.countDocuments(query),
      Automation.find(query)
        .select(projection)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    /* ─────────────────────────────────────────────
       3️⃣ Verify posts still exist on Instagram
    ───────────────────────────────────────────── */
    const postIds = docs.map((d) => d.postId);
    let verificationResults = {};

    if (user?.fbPageAccessToken && postIds.length > 0) {
      verificationResults = await verifyPostsExist(
        postIds,
        user.fbPageAccessToken
      );

      const bulkOps = [];

      docs.forEach((doc) => {
        const result = verificationResults[doc.postId];
        if (!result || result.exists === null) return;

        const isLive = result.exists === true;

        const updateFields = {
          lastCheckedAt: new Date(),
        };

        if (doc.postLive !== isLive) {
          updateFields.postLive = isLive;
          if (!isLive) updateFields.status = "inactive";
        }

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
      });

      if (bulkOps.length > 0) {
        await Automation.bulkWrite(bulkOps);
      }
    }

    /* ─────────────────────────────────────────────
       4️⃣ Count replies from ActionLock (SOURCE OF TRUTH)
    ───────────────────────────────────────────── */
    const automationIds = docs.map((d) => d._id);
    let countsByAutomationId = {};

    if (automationIds.length > 0) {
      const counts = await ActionLock.aggregate([
        {
          $match: {
            automationId: { $in: automationIds },
            channel: "public",
            state: "sent",
          },
        },
        {
          $group: {
            _id: "$automationId",
            totalReplies: { $sum: 1 },
          },
        },
      ]);

      countsByAutomationId = counts.reduce((acc, row) => {
        acc[String(row._id)] = row.totalReplies;
        return acc;
      }, {});
    }

    /* ─────────────────────────────────────────────
       5️⃣ Build response
    ───────────────────────────────────────────── */
    const items = docs.map((d) => {
      const verifyResult = verificationResults[d.postId];

      const isLive =
        verifyResult?.exists === true
          ? true
          : verifyResult?.exists === false
          ? false
          : d.postLive;

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

    return res.json({
      success: true,
      items,
      total,
      page,
      limit,
    });
  } catch (err) {
    console.error("GET /automations error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch automations",
    });
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
    const { fbLongLivedToken } = await ensureFreshPageTokenForUser(userId);
    if (!fbLongLivedToken) {
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
      fbLongLivedToken
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



router.put("/bank-details", authenticateToken, saveBankDetails);
router.post("/bank-details", authenticateToken, saveBankDetails);

router.get("/bank-details", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    const doc = await BankDetails.findOne({ user_id: userId }).lean();
    if (!doc) return res.json({ bankDetails: null });
    return res.json({
      bankDetails: {
        name: doc.name_on_bank,
        bankName: doc.bank_name,
        accountNumber: doc.account_number,
        ifsc: doc.bank_ifsc,
      },
    });
  } catch (e) {
    console.error("getBankDetails error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});


router.get("/payments/razorpay-key", async (req, res) => {
  return res.json({ key: RZP_KEY_ID });
});

router.post("/payments/create-order", async (req, res) => {
  try {
    // Rate limit: 10 orders per 10 minutes per IP
    const _orderIp = await getClientIp(req);
    const _orderAllowed = await checkRateLimit(`payment:create-order:${_orderIp}`, 10, 10 * 60 * 1000);
    if (!_orderAllowed) return res.status(429).json({ error: "Too many requests. Please wait before creating another order." });

    const { amount, currency = "INR", productId, title, imageUrl, subdomain, payer } = req.body;

    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt <= 0) {
      return res.status(400).json({ error: "Invalid amount (must be integer paise)" });
    }

    const receipt = await makeReceipt(productId);

    const order = await rz.orders.create({
      amount: amt,
      currency,
      receipt,
      notes: {
        productId: String(productId || ""),
        title: String(title || ""),
        subdomain: String(subdomain || ""),
        // optional: echo buyer info into notes
        buyer_name: payer?.name || "",
        buyer_email: payer?.email || "",
        buyer_phone: payer?.phone || ""
      }
    });

    await Transaction.create({
      userId: req.user?._id,
      userEmail: req.user?.email,
      userName: req.user?.name,

      productId: productId || null,
      productTitle: title || null,
      productImage: imageUrl || null,
      subdomain: subdomain || null,

      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      status: "created",

      customer: {
        name: payer?.name || req.user?.name || null,
        email: payer?.email || req.user?.email || null,
        phone: payer?.phone || null
      },

      razorpay: { order },
      rawOrder: order
    });

    res.json({
      order,
      user: { name: req.user?.name, email: req.user?.email }
    });
  } catch (e) {
    const status = e?.statusCode || 500;
    const msg = e?.error?.description || "Failed to create order";
    console.error("create-order error:", e?.error?.description || e?.message || "unknown");
    res.status(status).json({ error: msg });
  }
});



router.post("/payments/verify", async (req, res) => {
  try {
    // Rate limit: 20 verifications per 10 minutes per IP
    const _verifyIp = await getClientIp(req);
    const _verifyAllowed = await checkRateLimit(`payment:verify:${_verifyIp}`, 10, 10 * 60 * 1000);
    if (!_verifyAllowed) return res.status(429).json({ error: "Too many requests. Please wait." });

    const { orderId, paymentId, signature, productId, payer } = req.body;

    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const body = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac("sha256", RZP_KEY_SECRET)
      .update(body)
      .digest("hex");

    const valid = expectedSignature === signature;

    // Fetch canonical payment info from Razorpay
    let payment = null;
    try {
      payment = await rz.payments.fetch(paymentId); // ← gives method, bank, card last4, vpa, email, contact, status, fees, tax, etc.
    } catch (err) {
      console.warn("Could not fetch payment from Razorpay:", err?.message || err);
    }

    // Build method snapshot
    const method = payment?.method || null;
    const methodDetails = {
      type: method || null,
      bank: payment?.bank || null,
      wallet: payment?.wallet || null,
      vpa: payment?.vpa || null,
      card: payment?.card
        ? {
            last4: payment.card.last4 || null,
            network: payment.card.network || null,
            issuer: payment.card.issuer || null,
            type: payment.card.type || null,
            international: payment.card.international || false
          }
        : undefined
    };

    // Prefer Razorpay-provided buyer contact if available
    const canonicalCustomer = {
      name: payer?.name || undefined,
      email: payment?.email || payer?.email || undefined,
      phone: payment?.contact || payer?.phone || undefined
    };

    const update = {
      paymentId,
      signature,
      status: valid ? "paid" : "failed",
      rawVerifyPayload: req.body,
      productId: productId || undefined,
      paidAt: valid ? new Date() : undefined,
      customer: { ...canonicalCustomer },
      paymentMethod: methodDetails,
      razorpay: {
        payment: payment || undefined
      },
      // amount/currency from payment if present (sometimes fees/tax included)
      amount: payment?.amount || undefined,
      currency: payment?.currency || undefined
    };

    let tx = await Transaction.findOneAndUpdate({ orderId }, { $set: update }, { new: true });

    if (!tx) {
      tx = await Transaction.create({
        userId: req.user?._id,
        userEmail: req.user?.email,
        userName: req.user?.name,

        productId: productId || null,

        orderId,
        ...update
      });
    }

    return res.json({ ok: !!valid, txId: tx?._id });
  } catch (e) {
    console.error("verify error:", e?.message || "unknown");
    return res.status(500).json({ error: "Verification failed" });
  }
});

// Route 1: Create order with slot reservation
router.post("/bookings/create-order", async (req, res) => {
  try {
    const {
      block_id,
      customer_name,
      customer_mobile,
      customer_email,
      selected_date,
      selected_timeSlot
    } = req.body;

    // Validate required fields (user_id is no longer accepted from body —
    // it is derived from the block to prevent spoofing)
    if (!block_id || !customer_name || !customer_email || !customer_mobile) {
      return res.status(400).json({ error: "Missing required booking fields" });
    }

    // ✅ STEP 1: Fetch block first — derive the creator's user_id from it
    const bookingBlock = await Block.findById(block_id);
    if (!bookingBlock) {
      return res.status(404).json({ error: "Booking block not found" });
    }
    // Use the block owner as the authoritative creator ID
    const user_id = bookingBlock.user_id;

    // ✅ STEP 2: Check slot availability FIRST
    const existingBooking = await Bookings.findOne({
      block_id,
      selected_date,
      selected_timeSlot,
      is_del: false,
      status: { $in: ['confirmed', 'pending'] } // Include pending reservations
    });

    if (existingBooking) {
      return res.status(409).json({
        error: "This time slot is already booked. Please select another slot."
      });
    }

    const pricing = bookingBlock.pricing;
    
    // If free booking, reject (should use direct booking route)
    if (pricing === 0) {
      return res.status(400).json({ error: "This is a free booking. Use direct booking endpoint." });
    }

    // Convert rupees to paise
    const amountInPaise = pricing * 100;
    
    if (!Number.isInteger(amountInPaise) || amountInPaise <= 0) {
      return res.status(400).json({ error: "Invalid booking amount" });
    }

    // Generate unique receipt
    const receipt = await makeReceipt(block_id);

    // ✅ Generate unique 8-digit order ID
    const bookingId = await generateUniqueOrderId();

    // ✅ STEP 2: Create Razorpay order
    const order = await rz.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt,
      notes: {
        booking_type: "session_booking",
        block_id: String(block_id),
        user_id: String(user_id),
        booking_id: String(bookingId), // ✅ Add order_id to Razorpay notes
        title: String(bookingBlock.title || ""),
        customer_name: String(customer_name || ""),
        customer_email: String(customer_email || ""),
        customer_phone: String(customer_mobile || ""),
        selected_date: String(selected_date || ""),
        selected_timeSlot: String(selected_timeSlot || "")
      }
    });

    // ✅ STEP 3: Create Transaction record
    const transaction = await Transaction.create({
      userId: user_id,
      userEmail: customer_email,
      userName: customer_name,

      productId: block_id,
      productTitle: bookingBlock.title || null,
      productImage: null,
      subdomain: null,

      orderId: order.id,
      customerBookingId: bookingId,
      amount: order.amount,
      currency: order.currency,
      status: "created",

      customer: {
        name: customer_name,
        email: customer_email,
        phone: customer_mobile
      },

      bookingDetails: {
        block_id,
        selected_date,
        selected_timeSlot,
        duration: bookingBlock.duration,
        interaction_type: bookingBlock.interactionType
      },

      razorpay: { order },
      rawOrder: order
    });

    // ✅ STEP 4: Create PENDING booking to reserve the slot
    const pendingBooking = await Bookings.create({
      block_id,
      user_id,
      booking_id: bookingId, // ✅ Add custom order_id
      customer_name,
      customer_mobile,
      customer_email,
      selected_date,
      selected_timeSlot,
      duration: bookingBlock.duration,
      interaction_type: bookingBlock.interactionType,
      payment_status: "pending",
      status: "pending", // Reserve slot but not confirmed yet
      transaction_id: transaction._id,
      razorpay_order_id: order.id, // Razorpay's order ID
      payment_id: null, // Will be added after payment
      created_at: new Date()
    });

    res.json({
      order,
      booking_id: bookingId, // ✅ Return custom order_id
      bookingId: pendingBooking._id,
      customer: { 
        name: customer_name, 
        email: customer_email,
        phone: customer_mobile 
      }
    });
  } catch (e) {
    const status = e?.statusCode || 500;
    const msg = e?.error?.description || "Failed to create order";
    console.error("create-order error:", JSON.stringify(e, null, 2));
    res.status(status).json({ error: msg });
  }
});

// POST route to create a booking
router.post("/bookings/create", async (req, res) => {
  try {
    const {
      block_id,
      customer_name,
      customer_mobile,
      customer_email,
      selected_date,
      selected_timeSlot,
      title,
      meeting_link,
      venue,
      interaction_type
    } = req.body;
    // userId is no longer accepted from the body — it is derived from the block
    // to prevent a caller from attributing a booking to an arbitrary creator.

    // ---- Validation ----
    if (!block_id) return res.status(400).json({ error: "block_id is required" });
    if (!customer_name || !customer_name.trim()) return res.status(400).json({ error: "Customer name is required" });
    if (!customer_mobile) return res.status(400).json({ error: "Customer mobile is required" });
    if (!customer_email || !customer_email.trim()) return res.status(400).json({ error: "Customer email is required" });
    if (!selected_date) return res.status(400).json({ error: "Selected date is required" });
    if (!selected_timeSlot) return res.status(400).json({ error: "Selected time slot is required" });

    // Derive the authoritative creator ID from the block
    const bookingBlock = await Block.findById(block_id).lean();
    if (!bookingBlock) return res.status(404).json({ error: "Booking block not found" });
    const userId = String(bookingBlock.user_id);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customer_email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    // Normalize date once
    const selectedDateObj = new Date(selected_date);
    if (isNaN(selectedDateObj.getTime())) {
      return res.status(400).json({ error: "selected_date must be a valid date/ISO string" });
    }

    // ---- Slot clash check ----
    const existingBooking = await Bookings.findOne({
      block_id,
      selected_date: selectedDateObj,
      selected_timeSlot,
      is_del: false,
    }).lean();

    if (existingBooking) {
      return res.status(409).json({ error: "This time slot is already booked" });
    }

    // ---- Fetch creator (from USER collection) ----
    const creator = await USER.findById(userId).select("email name").lean();
    if (!creator) {
      return res.status(404).json({ error: "Creator (userId) not found" });
    }
    const creatorEmail = (creator.email || "").trim().toLowerCase();
    const creatorName = creator.name || "Creator";

    // ---- Generate booking id ----
    const bookingId = await generateUniqueOrderId();

    // ---- Create booking ----
    const newBooking = await Bookings.create({
      user_id: userId,
      block_id,
      booking_id: bookingId,
      customer_name: customer_name.trim(),
      interaction_type,
      customer_mobile,
      customer_email: customer_email.trim().toLowerCase(),
      selected_date: selectedDateObj,
      selected_timeSlot,
      meeting_link: meeting_link || "",       // store if you want
      venue: venue || "Online",               // store if you want
      payment_status: "free",
      status: "confirmed",
      is_del: false,
      created_at: new Date(),
      updatedAt: new Date(),
    });

    // ---- Email to customer ----
    const customerEmailOptions = {
      to: newBooking.customer_email,
      customer_name: newBooking.customer_name,
      selected_date: newBooking.selected_date,
      selected_timeSlot: newBooking.selected_timeSlot,
      subject: "Booking Confirmation for " + (title || "Consultation"),
      service_title: title || "Consultation",
      meeting_link: newBooking.meeting_link || "",
      manage_url: "https://chomske.com/booking/details/customer",
      support_email: "support@chomske.com",
      logo_url: "https://storage.googleapis.com/myhandlebucket/MyHandle%20Hori_logo.png",
      brand_name: "MyHandle",
      brand_url: "https://chomske.com",
      venue: newBooking.venue || "Online",
      timezone: "IST",
      booking_id: newBooking.booking_id,
    };

    // ---- Email to creator (from USER collection) ----
    const creatorEmailOptions = {
      to: creatorEmail,                       // <-- from User collection
      creator_name: creatorName,              // <-- from User collection
      selected_date: newBooking.selected_date,
      selected_timeSlot: newBooking.selected_timeSlot,
      subject: `New Registration for ${title || "Consultation"}`,
      meeting_link: newBooking.meeting_link || "",
      service_title: title || "Consultation",
      manage_url: "https://chomske.com/professional/booking/sessions",
      support_email: "support@chomske.com",
      logo_url: "https://storage.googleapis.com/myhandlebucket/MyHandle%20Hori_logo.png",
      brand_name: "MyHandle",
      brand_url: "https://chomske.com",
      venue: newBooking.venue || "Online",
      timezone: "IST",
      booking_id: newBooking.booking_id,
    };

    // ---- Send emails in parallel (don’t fail booking if an email fails) ----
    const [customerMail, creatorMail] = await Promise.allSettled([
      sendMailForBookings(customerEmailOptions),
      creatorEmail ? sendEmailToCreator(creatorEmailOptions) : Promise.resolve("skipped"),
    ]);

    if (customerMail.status === "rejected") {
      console.error("Failed to email customer:", customerMail.reason);
    }
    if (creatorMail.status === "rejected") {
      console.error("Failed to email creator:", creatorMail.reason);
    }

    return res.status(201).json({
      success: true,
      message: "Booking created successfully",
      booking: {
        id: newBooking._id,
        booking_id: newBooking.booking_id,
        customer_name: newBooking.customer_name,
        customer_email: newBooking.customer_email,
        selected_date: newBooking.selected_date,
        selected_timeSlot: newBooking.selected_timeSlot,
      },
      email_status: {
        customer: customerMail.status,
        creator: creatorEmail ? creatorMail.status : "skipped_no_creator_email",
      },
    });
  } catch (err) {
    console.error("POST /bookings/create error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});


// Route 2: Verify payment and confirm booking
router.post("/bookings/verify-payment", async (req, res) => {
  try {
    const { 
      orderId, 
      paymentId, 
      signature, 
      bookingId,
      booking_id,
      title,
      interaction_type
    } = req.body;

    // ✅ Validation
    if (!orderId || !paymentId || !signature || !bookingId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // ✅ Verify Razorpay signature
    const body = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac("sha256", RZP_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== signature) {
      // ❌ Invalid payment → clean up booking + transaction
      await Bookings.findByIdAndDelete(bookingId);
      await Transaction.findOneAndUpdate(
        { orderId },
        {
          $set: {
            status: "failed",
            paymentId,
            signature,
            rawVerifyPayload: req.body
          }
        }
      );

      return res.status(400).json({ ok: false, error: "Payment signature verification failed" });
    }

    // ✅ Fetch payment details from Razorpay
    let payment = null;
    try {
      payment = await rz.payments.fetch(paymentId);
    } catch (err) {
      console.warn("Could not fetch payment from Razorpay:", err?.message || err);
    }

    // ✅ Build method details
    const method = payment?.method || null;
    const methodDetails = {
      type: method || null,
      bank: payment?.bank || null,
      wallet: payment?.wallet || null,
      vpa: payment?.vpa || null,
      card: payment?.card
        ? {
            last4: payment.card.last4 || null,
            network: payment.card.network || null,
            issuer: payment.card.issuer || null,
            type: payment.card.type || null,
            international: payment.card.international || false,
          }
        : undefined,
    };

    const canonicalCustomer = {
      name: payment?.email || undefined,
      email: payment?.email || undefined,
      phone: payment?.contact || undefined,
    };

    // ✅ Update transaction record
    const txUpdate = {
      paymentId,
      signature,
      status: "paid",
      paidAt: new Date(),
      customBookingId: booking_id,
      paymentMethod: methodDetails,
      razorpay: { payment },
      amount: payment?.amount,
      currency: payment?.currency,
      rawVerifyPayload: req.body,
    };

    const tx = await Transaction.findOneAndUpdate(
      { orderId },
      { $set: txUpdate },
      { new: true }
    );

    if (!tx) {
      await Bookings.findByIdAndDelete(bookingId);
      return res.status(404).json({ error: "Transaction not found" });
    }

    // ✅ Update booking to confirmed
    const booking = await Bookings.findByIdAndUpdate(
      bookingId,
      {
        $set: {
          payment_status: "paid",
          status: "confirmed",
          booking_id: booking_id,
          interaction_type,
          payment_id: paymentId,
          customer_mobile: canonicalCustomer.phone || undefined,
          customer_email: canonicalCustomer.email || undefined,
          updatedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!booking) {
      return res.status(404).json({ error: "Booking record not found" });
    }

    // ✅ Fetch Creator details from USER collection
    const creator = await USER.findById(booking.user_id).select("email name").lean();
    const creatorEmail = (creator?.email || "").trim().toLowerCase();
    const creatorName = creator?.name || "Creator";

    // ✅ Send Email to Customer
    const customerEmailOptions = {
      to: booking.customer_email,
      customer_name: booking.customer_name,
      selected_date: booking.selected_date,
      selected_timeSlot: booking.selected_timeSlot,
      subject: "Booking Confirmation for " + (title || "Consultation"),
      service_title: title || "Consultation",
      meeting_link: booking.meeting_link || "",
      manage_url: "https://chomske.com/booking/details/customer",
      support_email: "support@chomske.com",
      logo_url: "https://storage.googleapis.com/myhandlebucket/MyHandle%20Hori_logo.png",
      brand_name: "MyHandle",
      brand_url: "https://chomske.com",
      venue: booking.venue || "Online",
      timezone: "IST",
      booking_id: booking.booking_id,
    };

    // ✅ Send Email to Creator
    const creatorEmailOptions = {
      to: creatorEmail,
      creator_name: creatorName,
      selected_date: booking.selected_date,
      selected_timeSlot: booking.selected_timeSlot,
      subject: `New Registration for ${title || "Consultation"}`,
      meeting_link: booking.meeting_link || "",
      service_title: title || "Consultation",
      manage_url: "https://chomske.com/professional/booking/sessions",
      support_email: "support@chomske.com",
      logo_url: "https://storage.googleapis.com/myhandlebucket/MyHandle%20Hori_logo.png",
      brand_name: "MyHandle",
      brand_url: "https://chomske.com",
      venue: booking.venue || "Online",
      timezone: "IST",
      booking_id: booking.booking_id,
    };

    // ✅ Send both emails in parallel
    const [customerMail, creatorMail] = await Promise.allSettled([
      sendMailForBookings(customerEmailOptions),
      creatorEmail ? sendEmailToCreator(creatorEmailOptions) : Promise.resolve("skipped"),
    ]);

    if (customerMail.status === "rejected") {
      console.error("❌ Failed to email customer:", customerMail.reason);
    }
    if (creatorMail.status === "rejected") {
      console.error("❌ Failed to email creator:", creatorMail.reason);
    }

    return res.json({
      ok: true,
      txId: tx._id,
      bookingId: booking._id,
      message: "Payment verified and booking confirmed successfully",
      email_status: {
        customer: customerMail.status,
        creator: creatorEmail ? creatorMail.status : "skipped_no_creator_email",
      },
    });
  } catch (e) {
    console.error("verify-payment error:", e);
    return res.status(500).json({ error: "Payment verification failed" });
  }
});

router.post("/form-submissions", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    if (!userId) return res.status(401).json({ error: "Unauthenticated" });

    const { 
      page = 1, 
      limit = 20, 
      blockId,
      startDate,
      endDate,
      searchQuery
    } = req.body;

    // Build query
    let query = { 
      user_id: userId,
      is_del: false 
    };

    // Filter by specific form block - convert to ObjectId if valid
    if (blockId && blockId !== 'all') {
      // Handle both ObjectId and string formats
      if (mongoose.Types.ObjectId.isValid(blockId)) {
        query.block_id = new mongoose.Types.ObjectId(blockId);
      } else {
        // If it's stored as string in database
        query.block_id = blockId;
      }
    }

    // Date range filter
    if (startDate || endDate) {
      query.submitted_at = {};
      if (startDate) query.submitted_at.$gte = new Date(startDate);
      if (endDate) query.submitted_at.$lte = new Date(endDate);
    }

    // Search in values (partial match)
    if (searchQuery) {
      const safeSearchQuery = escapeRegex(String(searchQuery));
      query.$or = [
        { block_name: { $regex: safeSearchQuery, $options: 'i' } },
        { 'meta.fromHandle': { $regex: safeSearchQuery, $options: 'i' } },
      ];
    }

    // Get total count
    const totalCount = await FormsData.countDocuments(query);

    // Calculate pagination
    const skip = (page - 1) * limit;
    const totalPages = Math.ceil(totalCount / limit);

    // Fetch submissions
    const submissions = await FormsData.find(query)
      .sort({ submitted_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get all form blocks for this user (include is_del: false filter)
    const formBlocks = await Block.find({
      user_id: userId,
      type: 'form',
      is_del: false
    }).select('_id name').lean();

    // Get submission counts per form - need to handle both ObjectId and string
    const submissionCounts = await FormsData.aggregate([
      {
        $match: {
          user_id: userId,
          is_del: false
        }
      },
      {
        $group: {
          _id: "$block_id",
          count: { $sum: 1 }
        }
      }
    ]);

    // Build counts map - handle both ObjectId and string
    const countsMap = {};
    submissionCounts.forEach(item => {
      const blockIdStr = item._id ? String(item._id) : null;
      if (blockIdStr) {
        countsMap[blockIdStr] = item.count;
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        submissions,
        formBlocks: formBlocks.map(fb => ({
          ...fb,
          submissionCount: countsMap[String(fb._id)] || 0
        })),
        pagination: {
          currentPage: page,
          totalPages,
          totalRecords: totalCount,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
          limit
        }
      }
    });
  } catch (error) {
    console.error("Error fetching form submissions:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch form submissions",
      details: error.message
    });
  }
});


router.get("/form-submissions/:submissionId", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    const { submissionId } = req.params;

    const submission = await FormsData.findOne({
      _id: submissionId,
      user_id: userId,
      is_del: false
    }).lean();

    if (!submission) {
      return res.status(404).json({
        success: false,
        error: "Submission not found"
      });
    }

    // Fetch the Block to get field labels
    let fieldLabels = {};
    if (submission.block_id) {
      const block = await Block.findOne({
        _id: submission.block_id,
        type: 'form',
        is_del: false
      }).select('fields').lean();

      if (block && block.fields && Array.isArray(block.fields)) {
        // Create a map of key -> label
        block.fields.forEach(field => {
          if (field.key && field.label) {
            fieldLabels[field.key] = field.label;
          }
        });
      }
    }

    // Transform values to include labels
    const transformedValues = {};
    Object.entries(submission.values || {}).forEach(([key, value]) => {
      const label = fieldLabels[key] || key; // Use label if found, otherwise use key
      transformedValues[key] = {
        label,
        value
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        ...submission,
        transformedValues, // Send both original and transformed
        fieldLabels // Send the mapping
      }
    });
  } catch (error) {
    console.error("Error fetching submission:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch submission"
    });
  }
});



router.delete("/form-submissions/:submissionId", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    const { submissionId } = req.params;

    const result = await FormsData.findOneAndUpdate(
      {
        _id: submissionId,
        user_id: userId
      },
      {
        is_del: true,
        updated_at: new Date()
      },
      { new: true }
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        error: "Submission not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Submission deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting submission:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to delete submission"
    });
  }
});


// Route 3: Delete pending booking (immediate slot release)
// Requires customer_email to match the booking so only the booking owner can cancel.
router.delete("/bookings/:bookingId", async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { customer_email } = req.body;

    if (!bookingId) {
      return res.status(400).json({ error: "Booking ID is required" });
    }

    // Reject clearly invalid IDs before touching the DB
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ error: "Invalid booking ID" });
    }

    if (!customer_email) {
      return res.status(400).json({ error: "customer_email is required to cancel a booking" });
    }

    // Rate limit: 5 cancellation attempts per 10 minutes per IP to prevent brute-forcing
    const _cancelIp = await getClientIp(req);
    const _cancelAllowed = await checkRateLimit(`booking:delete:${_cancelIp}`, 5, 10 * 60 * 1000);
    if (!_cancelAllowed) return res.status(429).json({ error: "Too many cancellation attempts. Please try again later." });

    // Find and validate booking
    const booking = await Bookings.findById(bookingId);

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    // Verify the requester is the customer who made this booking
    if (booking.customer_email.toLowerCase() !== customer_email.trim().toLowerCase()) {
      return res.status(403).json({ error: "Forbidden: email does not match booking" });
    }

    // Only allow deletion of pending bookings
    if (booking.status !== 'pending' || booking.payment_status !== 'pending') {
      return res.status(400).json({
        error: "Only pending bookings can be deleted. Contact support for confirmed bookings."
      });
    }

    // Delete the pending booking
    await Bookings.findByIdAndDelete(bookingId);

    // Update associated transaction if exists
    if (booking.transaction_id) {
      await Transaction.findByIdAndUpdate(
        booking.transaction_id,
        { 
          $set: { 
            status: "cancelled",
            cancelledAt: new Date(),
            cancellationReason: "User cancelled payment"
          } 
        }
      );
    }

    return res.json({ 
      success: true, 
      message: "Pending booking deleted successfully",
      bookingId: bookingId 
    });

  } catch (error) {
    console.error("Delete booking error:", error);
    return res.status(500).json({ error: "Failed to delete booking" });
  }
});

// Route 1: Fetch all booking campaigns (blocks)
router.get('/bookings/campaigns', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user?.user_id;

    // Fetch all booking blocks for this user
    const campaigns = await Block.find({
      user_id,
      type: 'booking',
      is_del: false
    })
      .select('name description duration interactionType pricing created_at')
      .sort({ created_at: -1 })
      .lean();

    // Get booking count for each campaign
    const campaignsWithCount = await Promise.all(
      campaigns.map(async (campaign) => {
        const bookingCount = await Bookings.countDocuments({
          block_id: campaign._id,
          is_del: false
        });

        return {
          ...campaign,
          bookingCount
        };
      })
    );

    res.status(200).json({
      success: true,
      data: campaignsWithCount
    });

  } catch (error) {
    console.error('Error fetching booking campaigns:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booking campaigns',
      error: error.message
    });
  }
});

// Route 2: Fetch bookings for a specific campaign
router.post('/bookings/creator', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user?.user_id;
    const { block_id, status, payment_status, page = 1, limit = 20 } = req.body;

    // Build query - block_id is now required
    if (!block_id) {
      return res.status(400).json({
        success: false,
        message: 'block_id is required'
      });
    }

    const query = {
      user_id,
      block_id,
      is_del: false,
      status: status || { $in: ['confirmed', 'completed', 'pending'] },
      session_status: status || { $in: ['active', 'completed', 'cancelled', 'expired'] },
      payment_status: payment_status || { $in: ['free', 'paid'] }
    };

    // Pagination
    const skip = (page - 1) * limit;

    // Fetch bookings with block details
    const bookings = await Bookings.find(query)
      .populate({
        path: 'block_id',
        select: 'name duration description interactionType pricing'
      })
      .sort({ selected_date: -1, created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get total count for pagination
    const total = await Bookings.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        bookings,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching creator bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings',
      error: error.message
    });
  }
});

// Route: Update booking status (Mark as Completed/Cancelled)
router.post('/bookings/update-status', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user?.user_id;
    const { booking_id, action } = req.body;

    // Validate inputs
    if (!booking_id || !action) {
      return res.status(400).json({
        success: false,
        message: 'booking_id and action are required'
      });
    }

    if (!['completed', 'cancelled'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Must be "completed" or "cancelled"'
      });
    }

    // Find booking and verify ownership
    const booking = await Bookings.findOne({
      _id: booking_id,
      user_id,
      is_del: false
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found or you do not have permission'
      });
    }

    // Prepare update data based on action
    const updateData = {
      updatedAt: new Date()
    };

    if (action === 'completed') {
      updateData.session_status = 'completed';
      updateData.status = 'completed';
    } else if (action === 'cancelled') {
      updateData.session_status = 'cancelled';
      updateData.status = 'cancelled';
      updateData.cancelled_at = new Date();
      updateData.cancelled_by = 'host';
      updateData.cancellation_reason = 'Cancelled by creator';
    }

    // Update booking
    const updatedBooking = await Bookings.findByIdAndUpdate(
      booking_id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate({
      path: 'block_id',
      select: 'name duration description interactionType pricing'
    });

    // Log the action
    console.log(`Booking ${booking_id} marked as ${action} by user ${user_id}`);

    res.status(200).json({
      success: true,
      message: `Booking marked as ${action} successfully`,
      data: updatedBooking
    });

  } catch (error) {
    console.error('Error updating booking status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update booking status',
      error: error.message
    });
  }
});

router.post("/transactions/paid", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    const { 
      page = 1, 
      limit = 10, 
      dateFilter = 'last28days',
      startDate,
      endDate 
    } = req.body;

    // Build date filter query
    let dateQuery = {};
    const now = new Date();
    
    switch(dateFilter) {
      case 'last7days':
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 7);
        dateQuery = { createdAt: { $gte: sevenDaysAgo } };
        break;
      
      case 'last28days':
        const twentyEightDaysAgo = new Date(now);
        twentyEightDaysAgo.setDate(now.getDate() - 28);
        dateQuery = { createdAt: { $gte: twentyEightDaysAgo } };
        break;
      
      case 'lifetime':
        // No date filter
        dateQuery = {};
        break;
      
      case 'custom':
        if (startDate && endDate) {
          dateQuery = {
            createdAt: {
              $gte: new Date(startDate),
              $lte: new Date(endDate)
            }
          };
        }
        break;
      
      default:
        const defaultDaysAgo = new Date(now);
        defaultDaysAgo.setDate(now.getDate() - 28);
        dateQuery = { createdAt: { $gte: defaultDaysAgo } };
    }

    // Base query
    const baseQuery = {
      userId: userId,
      status: "paid",
      cancelledAt: null,
      ...dateQuery
    };

    // Get total count for pagination
    const totalCount = await Transaction.countDocuments(baseQuery);

    // Calculate pagination
    const skip = (page - 1) * limit;
    const totalPages = Math.ceil(totalCount / limit);

    // Query transactions with pagination
    const transactions = await Transaction.find(baseQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Calculate summary statistics (for all filtered data, not just current page)
    const allFilteredTransactions = await Transaction.find(baseQuery).lean();
    const totalRevenue = allFilteredTransactions.reduce((sum, txn) => sum + (txn.amount || 0), 0);
    const totalTransactions = allFilteredTransactions.length;

    // Group by month for analytics
    const monthlyStats = await Transaction.aggregate([
      {
        $match: baseQuery
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" }
          },
          count: { $sum: 1 },
          revenue: { $sum: "$amount" }
        }
      },
      {
        $sort: { "_id.year": -1, "_id.month": -1 }
      }
    ]);

    // Format monthly data
    const monthlyData = monthlyStats.reduce((acc, stat) => {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const key = `${monthNames[stat._id.month - 1]} ${stat._id.year}`;
      acc[key] = {
        count: stat.count,
        revenue: (stat.revenue / 100).toFixed(2)
      };
      return acc;
    }, {});

    // Get payment method breakdown
    const paymentMethodStats = await Transaction.aggregate([
      {
        $match: baseQuery
      },
      {
        $group: {
          _id: "$paymentMethod.type",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" }
        }
      }
    ]);

    return res.status(200).json({
      success: true,
      data: {
        transactions,
        summary: {
          totalRevenue: (totalRevenue / 100).toFixed(2),
          totalTransactions,
          currency: 'INR',
          monthlyData,
          paymentMethods: paymentMethodStats
        },
        pagination: {
          currentPage: page,
          totalPages,
          totalRecords: totalCount,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
          limit
        }
      }
    });
  } catch (error) {
    console.error("POST /transactions/paid error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch transactions"
    });
  }
});

router.get("/transactions/:transactionId", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    const { transactionId } = req.params;

    const transaction = await Transaction.findOne({
      _id: transactionId,
      userId: userId
    }).lean();

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: "Transaction not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: transaction
    });
  } catch (error) {
    console.error("GET /transactions/:id error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch transaction details"
    });
  }
});



router.get("/transactions/stats", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;


    const stats = await Transaction.aggregate([
      {
        $match: {
          userId: userId,
          status: "paid",
          cancelledAt: null
        }
      },
      {
        $facet: {
          // Total revenue and count
          overview: [
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: "$amount" },
                totalCount: { $sum: 1 },
                avgTransaction: { $avg: "$amount" }
              }
            }
          ],
          // Recent transactions
          recentTransactions: [
            { $sort: { createdAt: -1 } },
            { $limit: 5 }
          ],
          // Payment method breakdown
          paymentMethods: [
            {
              $group: {
                _id: "$paymentMethod.type",
                count: { $sum: 1 }
              }
            }
          ]
        }
      }
    ]);

    return res.status(200).json({
      success: true,
      data: stats[0]
    });
  } catch (error) {
    console.error("GET /transactions/stats error:", error);
    return res.status(500).json({ 
      success: false, 
      error: "Failed to fetch transaction statistics" 
    });
  }
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

    // 1. Verify Signature
    const body = `${payment_id}|${subscription_id}`;
    const expected = crypto
      .createHmac("sha256", RZP_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expected !== signature) {
      return res.status(400).json({ error: "Invalid signature" });
    }

    // 2. Calculate next subscription date
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 30);

    // 3. Prepare Database Updates
    const subscriptionUpdateData = {
      user_id: userId,
      razorpay_payment_id: payment_id,
      razorpay_subscription_id: subscription_id,
      razorpay_signature: signature,
      recurring: true,
      next_subscription_date: nextDate,
      status: "active",
      updatedAt: new Date(),
    };

    // Promise 1: Update Subscriptions Collection
    const updateSubscription = Subscriptions.updateOne(
      { user_id: userId },
      { $set: subscriptionUpdateData, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );

    // Promise 2: Update User Collection (Limits & Plan)
    // Note: Ensure your User model is imported (e.g., const User = require('../models/User'))
    const updateUser = USER.updateOne(
      { _id: userId }, // Assuming '_id' is the primary key in your User collection
      {
        $set: {
          dms_plan_limit: 2500000,
          leads_plan_limit: 500,
          subscription_plan: "creator",
        },
      }
    );

    // 4. Execute both updates in parallel
    await Promise.all([updateSubscription, updateUser]);

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

router.get("/influencer/:subdomain", async (req, res) => {
  try {
    const sub = String(req.params.subdomain || "").toLowerCase();
    if (!sub) return res.status(400).json({ error: "subdomain required" });
    const influencer = await USER.findOne({ handleUserName: sub }).select("_id name picture handleUserName").lean();
    if (!influencer) return res.status(404).json({ error: "not found" });
    return res.json({ influencer });
  } catch (err) {
    console.error("GET /influencer error:", err);
    return res.status(500).json({ error: "internal" });
  }
});



router.post("/conversations/:id/refresh-profile", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const conversationId = req.params.id;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      creatorId: userId,
    })
      .populate("participantId")
      .lean();

    if (!conversation) {
      return res.status(404).json({ success: false, error: "Not found" });
    }

    const { fbPageAccessToken } = await ensureFreshPageTokenForUser(userId);

    if (!fbPageAccessToken) {
      return res.status(400).json({ success: false, error: "No access token" });
    }

    const igUserId = conversation.participantId?.igUserId;
    if (!igUserId) {
      return res.status(400).json({ success: false, error: "No participant" });
    }

    // 🔥 Force refresh by deleting cache first
    await redisDel(`ig:user:${igUserId}`);

    // Fetch fresh profile
    const profile = await fetchAndCacheProfileSafely({
      igUserId,
      accessToken: fbPageAccessToken,
      conversationId: conversation._id,
      publishSocketEvent,
    });

    res.json({ success: true, profile });
  } catch (err) {
    console.error("Profile refresh failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


async function syncOlderMessages({ userId, conversationId }) {
  const lockKey = `ig:sync:older:${conversationId}`;
  
  // 🔥 Check lock but don't hold it for long
  if (await redisGet(lockKey)) {
    console.log('⏭️ Sync already in progress');
    return { messages: [], hasMore: false };
  }

  await redisSet(lockKey, "1", 30); // Shorter TTL since we're blocking

  try {
    const { fbPageAccessToken } = await ensureFreshPageTokenForUser(userId);

    if (!fbPageAccessToken) {
      return { messages: [], hasMore: false };
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      creatorId: userId,
    }).lean();

    if (!conversation?.metaThreadId) {
      return { messages: [], hasMore: false };
    }

    // 🔥 Fetch from Instagram
    const result = await InstagramService.fetchOlderMessages({
      igConversationId: conversation.metaThreadId,
      pageAccessToken: fbPageAccessToken,
      afterCursor: conversation.lastMetaAfterCursor || null,
      limit: 25,
    });

    if (!result.messages.length) {
      console.log("ℹ️ No more messages from Meta");
      
      // Mark as exhausted if no messages returned
      await Conversation.updateOne(
        { _id: conversationId },
        {
          $set: {
            lastMetaAfterCursor: null,
            metaSyncCompleted: true,
            lastSyncedAt: new Date()
          }
        }
      );
      
      return { messages: [], hasMore: false };
    }

     const user = await USER.findById(userId).lean();

    const insertedMessages = [];

    // 🔥 Insert messages into DB
    for (const msg of result.messages) {
      const normalized = await upsertMessage(
        msg,
        conversation,
        user,
        { isHydration: true }
      );

      if (normalized) {
        insertedMessages.push(normalized);
      }
    }

    // 🔥 Update cursor based on Meta response
    let nextCursor = conversation.lastMetaAfterCursor;
    
    if (result.paging?.cursors?.after) {
      // More pages available - update cursor
      nextCursor = result.paging.cursors.after;
      
      await Conversation.updateOne(
        { _id: conversationId },
        {
          $set: {
            lastMetaAfterCursor: nextCursor,
            lastSyncedAt: new Date()
          }
        }
      );
    } else {
      // No more pages from Meta - mark as exhausted
      await Conversation.updateOne(
        { _id: conversationId },
        {
          $set: {
            lastMetaAfterCursor: null,
            metaSyncCompleted: true,
            lastSyncedAt: new Date()
          }
        }
      );
    }

    console.log(`✅ Inserted ${insertedMessages.length} older messages`);

    // 🔥 Return messages to frontend
    return {
      messages: insertedMessages,
      hasMore: Boolean(result.paging?.cursors?.after), // More pages available only if Meta provides cursor
      nextCursor
    };

  } catch (err) {
    console.error("❌ syncOlderMessages failed", err);
    throw err; // Propagate error to route handler
  } finally {
    await redisDel(lockKey);
  }
}



async function scoreConversationStage1(messages) {
  let score = 0;

  // 1️⃣ Message count
  if (messages.length >= 4) score += 20;
  else if (messages.length >= 2) score += 12;
  else score += 5;

  const text = messages
    .map(m => m.text || "")
    .join(" ")
    .toLowerCase();

  const wordCount = text.split(/\s+/).filter(Boolean).length;

  // 2️⃣ Message length / intent density
  if (wordCount >= 15) score += 30;
  else if (wordCount >= 8) score += 20;
  else if (wordCount >= 4) score += 10;

  // 3️⃣ Intent keywords
  if (/(price|cost|fees|program|plan|coaching|training|join|enroll)/.test(text)) {
    score += 30;
  }

  if (/(urgent|today|now|asap)/.test(text)) {
    score += 5;
  }

  // 4️⃣ Question signal
  if (text.includes("?")) score += 10;

  // 5️⃣ Non-English / Hinglish
  if (/[^\x00-\x7F]/.test(text)) {
    score += 15;
  }

  return Math.min(score, 100);
}

const COUNTRY_CODES = [
  { code: "91", country: "India", flag: "🇮🇳" },
  { code: "1", country: "United States", flag: "🇺🇸" },
  { code: "44", country: "United Kingdom", flag: "🇬🇧" },
  { code: "61", country: "Australia", flag: "🇦🇺" },
  { code: "971", country: "UAE", flag: "🇦🇪" },
  { code: "966", country: "Saudi Arabia", flag: "🇸🇦" },
  { code: "65", country: "Singapore", flag: "🇸🇬" },
  { code: "60", country: "Malaysia", flag: "🇲🇾" },
  { code: "62", country: "Indonesia", flag: "🇮🇩" },
  { code: "63", country: "Philippines", flag: "🇵🇭" },
  { code: "49", country: "Germany", flag: "🇩🇪" },
  { code: "33", country: "France", flag: "🇫🇷" },
  { code: "39", country: "Italy", flag: "🇮🇹" },
  { code: "34", country: "Spain", flag: "🇪🇸" },
  { code: "31", country: "Netherlands", flag: "🇳🇱" },
  { code: "7", country: "Russia", flag: "🇷🇺" },
  { code: "81", country: "Japan", flag: "🇯🇵" },
  { code: "82", country: "South Korea", flag: "🇰🇷" },
  { code: "86", country: "China", flag: "🇨🇳" },
  { code: "55", country: "Brazil", flag: "🇧🇷" },
  { code: "52", country: "Mexico", flag: "🇲🇽" },
  { code: "27", country: "South Africa", flag: "🇿🇦" },
  { code: "234", country: "Nigeria", flag: "🇳🇬" },
  { code: "254", country: "Kenya", flag: "🇰🇪" },
  { code: "20", country: "Egypt", flag: "🇪🇬" },
  { code: "92", country: "Pakistan", flag: "🇵🇰" },
  { code: "880", country: "Bangladesh", flag: "🇧🇩" },
  { code: "94", country: "Sri Lanka", flag: "🇱🇰" },
  { code: "977", country: "Nepal", flag: "🇳🇵" },
  { code: "64", country: "New Zealand", flag: "🇳🇿" },
];


router.get("/inbox/status", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await USER.findById(userId)
      .select("first_conv_pull conv_pull creator_whatsapp_num instagramConnected")
      .lean();

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if Instagram is connected
    if (!user.instagramConnected) {
      return res.json({
        success: true,
        status: "instagram_not_connected",
        needsInstagramConnect: true,
        needsWhatsApp: false,
        needsInitialPull: false,
        isProcessing: false,
        isReady: false,
      });
    }

    const hasWhatsApp = !!user.creator_whatsapp_num;
    const firstPullDone = user.first_conv_pull === true;
    const pullStatus = user.conv_pull || "idle";
    const isProcessing = pullStatus === "processing";

    // Determine current status
    let status = "ready";
    if (!hasWhatsApp) {
      status = "needs_whatsapp";
    } else if (!firstPullDone && !isProcessing) {
      status = "needs_initial_pull";
    } else if (isProcessing) {
      status = "processing";
    }

    return res.json({
      success: true,
      status,
      needsWhatsApp: !hasWhatsApp,
      needsInitialPull: !firstPullDone && !isProcessing,
      isProcessing,
      isReady: firstPullDone,
      whatsappNumber: user.creator_whatsapp_num || null,
    });

  } catch (error) {
    console.error("GET /inbox/status error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});


router.get("/inbox/leads-limit-status", authenticateToken, async (req, res) => {
  try {

    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await USER.findById(userId)
      .select("leads_found leads_plan_limit subscription_plan")
      .lean();

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const leadsFound = user.leads_found || 0;
    const leadsLimit = user.leads_plan_limit || 5;
    const limitReached = leadsFound >= leadsLimit;

    return res.json({
      success: true,
      limitReached,
      leadsFound,
      leadsLimit,
      plan: user.subscription_plan || "free",
    });
  } catch (error) {
    console.error("GET /inbox/leads-limit-status error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});


// POST /inbox/upload-pdf  — upload a PDF to GCS and return its public URL
router.post("/inbox/upload-pdf", authenticateToken, upload.single("file"), async (req, res) => {
  try {
    console.log('Hit inbox/upload-pdf');

    const userId = req.user?.user_id;
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file received" });
    }

    // Use igUserId as folder (same architecture as all other creator asset uploads)
    const user = await USER.findById(userId).select("igUserId").lean();
    const folderName = user?.igUserId || String(userId);

    const uploadResult = await uploadBufferToGCSFolder(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      folderName
    );

    console.log('upload result : ', uploadResult.publicUrl);

    return res.json({ success: true, url: uploadResult.publicUrl });
  } catch (err) {
    console.error("[upload-pdf] error:", err);
    return res.status(500).json({ success: false, error: "Upload failed" });
  }
});

router.get("/inbox/country-codes", authenticateToken, async (req, res) => {
  return res.json({
    success: true,
    data: COUNTRY_CODES,
  });
});


router.post("/inbox/save-whatsapp", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { countryCode, phoneNumber } = req.body;

    // Validate inputs
    if (!countryCode || !phoneNumber) {
      return res.status(400).json({ 
        error: "Country code and phone number are required" 
      });
    }

    // Clean and validate phone number (must be 10 digits)
    const cleanPhone = phoneNumber.replace(/\D/g, "");
    if (cleanPhone.length !== 10) {
      return res.status(400).json({ 
        error: "Phone number must be exactly 10 digits" 
      });
    }

    // Validate country code
    const cleanCode = countryCode.replace(/\D/g, "");
    const validCode = COUNTRY_CODES.find((c) => c.code === cleanCode);
    if (!validCode) {
      return res.status(400).json({ 
        error: "Invalid country code" 
      });
    }

    // Build full number
    const fullNumber = `+${cleanCode}${cleanPhone}`;

    // Update user
    await USER.findByIdAndUpdate(userId, {
      $set: {
        creator_whatsapp_num: fullNumber,
        updated_at: new Date(),
      },
    });

    return res.json({
      success: true,
      whatsappNumber: fullNumber,
      message: "WhatsApp number saved successfully",
    });

  } catch (error) {
    console.error("POST /inbox/save-whatsapp error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});


router.post("/inbox/start-initial-pull", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Check current status
    const user = await USER.findById(userId)
      .select("first_conv_pull conv_pull creator_whatsapp_num instagramConnected")
      .lean();

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Validations
    if (!user.instagramConnected) {
      return res.status(400).json({ error: "Instagram not connected" });
    }

    if (!user.creator_whatsapp_num) {
      return res.status(400).json({ error: "WhatsApp number required first" });
    }

    const { fbPageAccessToken } = await ensureFreshPageTokenForUser(userId);
    if (!fbPageAccessToken) {
      return res.status(400).json({ error: "Facebook token missing" });
    }

    if (user.first_conv_pull === true) {
      return res.json({ 
        success: true, 
        message: "Initial pull already completed",
        alreadyDone: true,
      });
    }

    if (user.conv_pull === "processing") {
      return res.json({ 
        success: true, 
        message: "Initial pull already in progress",
        inProgress: true,
      });
    }

    // Mark as processing immediately
    await USER.findByIdAndUpdate(userId, {
      $set: { conv_pull: "processing" },
    });

    // Start the pull in background (don't await)
    // Import dynamically to avoid circular dependencies
    import("../services/initialConversationPull.js").then(({ performInitialConversationPull }) => {
      performInitialConversationPull(userId).catch((err) => {
        console.error("Background initial pull failed:", err);
      });
    });

    return res.json({
      success: true,
      message: "Initial pull started",
      started: true,
    });

  } catch (error) {
    console.error("POST /inbox/start-initial-pull error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});


router.get("/inbox/pull-progress", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await USER.findById(userId)
      .select("first_conv_pull conv_pull")
      .lean();

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Count conversations to show progress
    const conversationCount = await Conversation.countDocuments({ 
      creatorId: userId 
    });

    // Count analyzed conversations
    const analyzedCount = await Conversation.countDocuments({
      creatorId: userId,
      conversationIntent: { $exists: true, $ne: null },
    });

    return res.json({
      success: true,
      isComplete: user.first_conv_pull === true,
      isProcessing: user.conv_pull === "processing",
      status: user.conv_pull || "idle",
      conversationsFound: conversationCount,
      conversationsAnalyzed: analyzedCount,
    });

  } catch (error) {
    console.error("GET /inbox/pull-progress error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});


// ==================== UPDATED: GET /conversations ====================
// Drop-in replacement for your existing route

router.get("/conversations", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;

    const { fbPageAccessToken } = await ensureFreshPageTokenForUser(userId);

    if (!fbPageAccessToken) {
      return res.status(400).json({
        success: false,
        error: "No Facebook Page access token",
      });
    }

    const user = await USER.findById(userId)
      .select("first_conv_pull conv_pull creator_whatsapp_num")
      .lean();

    // Check if initial pull is needed
    if (user.first_conv_pull === false) {
      if (user.conv_pull === "processing") {
        return res.json({
          success: true,
          data: [],
          categoryCounts: {
            new_leads: { total: 0, hot: 0, warm: 0 },
            ongoing: { total: 0, action_needed: 0 },
            unanswered: { total: 0, hot: 0, warm: 0 },
            business: { total: 0 },
          },
          status: "processing",
          message: "Analyzing your inbox...",
          needsInitialPull: false,
          isProcessing: true,
        });
      }

      if (!user.creator_whatsapp_num) {
        return res.json({
          success: true,
          data: [],
          categoryCounts: {
            new_leads: { total: 0, hot: 0, warm: 0 },
            ongoing: { total: 0, action_needed: 0 },
            unanswered: { total: 0, hot: 0, warm: 0 },
            business: { total: 0 },
          },
          status: "needs_whatsapp",
          needsWhatsApp: true,
          needsInitialPull: true,
          isProcessing: false,
        });
      }

      return res.json({
        success: true,
        data: [],
        categoryCounts: {
          new_leads: { total: 0, hot: 0, warm: 0 },
          ongoing: { total: 0, action_needed: 0 },
          unanswered: { total: 0, hot: 0, warm: 0 },
          business: { total: 0 },
        },
        status: "needs_initial_pull",
        needsWhatsApp: false,
        needsInitialPull: true,
        isProcessing: false,
      });
    }

    // Normal flow: fetch from DB
    // Parse pagination params
    const rawLimit = parseInt(req.query.limit, 10);
    const PAGE_LIMIT = !isNaN(rawLimit) && rawLimit > 0 && rawLimit <= 50 ? rawLimit : 20;
    let cursorFilter = {};
    if (req.query.cursor) {
      try {
        const cursor = JSON.parse(Buffer.from(req.query.cursor, "base64").toString("utf8"));
        if (cursor.lastActivityAt && cursor._id) {
          cursorFilter = {
            $or: [
              { lastActivityAt: { $lt: new Date(cursor.lastActivityAt) } },
              { lastActivityAt: new Date(cursor.lastActivityAt), _id: { $lt: new mongoose.Types.ObjectId(cursor._id) } },
            ],
          };
        }
      } catch (_) {
        // ignore malformed cursor
      }
    }

    // Category-aware filtering: each tab fetches only its own conversations so the user
    // sees a full page of the relevant category instead of a mixed-category page.
    let categoryFilter = {};
    const categoryParam = req.query.category;
    if (categoryParam === "new_leads") {
      categoryFilter = { conversationIntent: "Lead", creatorHasReplied: false };
    } else if (categoryParam === "ongoing") {
      categoryFilter = { conversationIntent: "Lead", creatorHasReplied: true };
    } else if (categoryParam === "business") {
      categoryFilter = { conversationIntent: "Business" };
    }

    // FIX 1: Filter at DB level — only fetch Lead/Business, skip General/Personal entirely
    // FIX 2: True pagination — fetch one extra doc to detect hasMore
    const baseFilter = {
      creatorId: userId,
      conversationIntent: { $in: ["Lead", "Business"] },
      ...categoryFilter,
    };

    // FIX 4: Compute category counts via aggregation across ALL conversations (not just this page)
    // Only run on first-page loads (no cursor) — counts don't change between scroll pages
    // Matches the frontend's computeCategory logic:
    //   new_leads = Lead && !creatorHasReplied (regardless of unreadCount)
    //   ongoing   = Lead && creatorHasReplied
    //   business  = Business
    // Run aggregation and paginated fetch in parallel
    const shouldFetchCounts = !req.query.cursor;
    const [countAggResult, docs] = await Promise.all([
      shouldFetchCounts ? Conversation.aggregate([
        { $match: { creatorId: new mongoose.Types.ObjectId(userId), conversationIntent: { $in: ["Lead", "Business"] } } },
        {
          $facet: {
            new_leads_total: [
              { $match: { conversationIntent: "Lead", creatorHasReplied: false } },
              { $count: "total" },
            ],
            new_leads_hot: [
              { $match: { conversationIntent: "Lead", creatorHasReplied: false, conversationLeadSeriousness: { $gt: 0.65 } } },
              { $count: "total" },
            ],
            new_leads_warm: [
              { $match: { conversationIntent: "Lead", creatorHasReplied: false, conversationLeadSeriousness: { $lte: 0.65 } } },
              { $count: "total" },
            ],
            ongoing_total: [
              { $match: { conversationIntent: "Lead", creatorHasReplied: true } },
              { $count: "total" },
            ],
            ongoing_hot: [
              { $match: { conversationIntent: "Lead", creatorHasReplied: true, conversationLeadSeriousness: { $gt: 0.65 } } },
              { $count: "total" },
            ],
            ongoing_warm: [
              { $match: { conversationIntent: "Lead", creatorHasReplied: true, conversationLeadSeriousness: { $lte: 0.65 } } },
              { $count: "total" },
            ],
            business_total: [
              { $match: { conversationIntent: "Business" } },
              { $count: "total" },
            ],
          },
        },
      ]) : Promise.resolve([{}]),
      Conversation.find({ ...baseFilter, ...cursorFilter })
        .sort({ lastActivityAt: -1, _id: -1 })
        .limit(PAGE_LIMIT + 1)
        .populate({ path: "participantId", select: "igUserId username" })
        .lean(),
    ]);

    const hasMore = docs.length > PAGE_LIMIT;
    const pageDocs = hasMore ? docs.slice(0, PAGE_LIMIT) : docs;
    const lastDoc = pageDocs[pageDocs.length - 1];
    const nextCursor = hasMore && lastDoc
      ? Buffer.from(JSON.stringify({ lastActivityAt: lastDoc.lastActivityAt, _id: lastDoc._id })).toString("base64")
      : null;

    // Build categoryCounts from aggregation result (matches frontend computeCategory logic)
    // null when skipped (paginated requests) — frontend keeps its existing counts
    const agg = countAggResult[0] || {};
    const categoryCounts = shouldFetchCounts ? {
      new_leads: {
        total: agg.new_leads_total?.[0]?.total || 0,
        hot: agg.new_leads_hot?.[0]?.total || 0,
        warm: agg.new_leads_warm?.[0]?.total || 0,
      },
      ongoing: {
        total: agg.ongoing_total?.[0]?.total || 0,
        hot: agg.ongoing_hot?.[0]?.total || 0,
        warm: agg.ongoing_warm?.[0]?.total || 0,
      },
      business: { total: agg.business_total?.[0]?.total || 0 },
    } : null;

    // FIX 3: Batch all profile lookups in parallel instead of sequential awaits in a loop
    const igUserIds = pageDocs.map((c) => c.participantId?.igUserId).filter(Boolean);
    const profileResults = await Promise.all(igUserIds.map((id) => getCachedProfile(id)));
    const profileMap = Object.fromEntries(igUserIds.map((id, i) => [id, profileResults[i]]));

    // For any cache misses, fire fetchAndCacheProfileSafely in the background (non-blocking)
    // The socket will push the updated profile to the client when ready
    for (let i = 0; i < igUserIds.length; i++) {
      if (!profileResults[i]) {
        fetchAndCacheProfileSafely({
          igUserId: igUserIds[i],
          accessToken: fbPageAccessToken,
          conversationId: pageDocs.find((c) => c.participantId?.igUserId === igUserIds[i])?._id,
          creatorId: userId,
          publishSocketEvent,
        }).catch(() => {});
      }
    }

    const enriched = [];
    const WINDOW_MS = 24 * 60 * 60 * 1000;
    const HOT_LEAD_THRESHOLD = 0.65;
    const WARM_LEAD_THRESHOLD = 0.3;

    for (const c of pageDocs) {
      const intent = c.conversationIntent || "General";
      const igUserId = c.participantId?.igUserId;
      const profile = profileMap[igUserId] || null;

      const lastParticipantMessageAt = c.lastParticipantMessageAt;
      let canReply = false;
      let replyDisabledReason = null;

      if (lastParticipantMessageAt) {
        const diff = Date.now() - new Date(lastParticipantMessageAt).getTime();
        canReply = diff <= WINDOW_MS;
        if (!canReply) replyDisabledReason = "window_expired";
      } else {
        replyDisabledReason = "waiting_for_reply";
      }

      const creatorHasReplied = c.creatorHasReplied ?? false;
      const leadSeriousness = c.conversationLeadSeriousness || 0;
      const isHotLead = intent === "Lead" && leadSeriousness > HOT_LEAD_THRESHOLD;
      let leadTemperature = "cold";
      if (leadSeriousness > HOT_LEAD_THRESHOLD) {
        leadTemperature = "hot";
      } else if (leadSeriousness > WARM_LEAD_THRESHOLD) {
        leadTemperature = "warm";
      }

      const unreadCount = c.unreadCount || 0;
      let category = null;
      if (intent === "Business") {
        category = "business";
      } else if (intent === "Lead") {
        if (unreadCount > 0 && !creatorHasReplied) {
          category = "new_leads";
        } else if (!creatorHasReplied) {
          category = "unanswered";
        } else {
          category = "ongoing";
        }
      }

      enriched.push({
        _id: c._id,
        igConversationId: c.igConversationId,
        label: intent,
        labelIntentConfidence: c.conversationIntentConfidence || 0,
        labelLeadSeriousness: leadSeriousness,
        labelLeadQuality: c.conversationLeadQuality || "none",
        leadTemperature,
        isHotLead,
        category,
        creatorHasReplied,
        followUpStatus: c.followUpStatus || null,
        unreadCount,
        lastMessage: c.lastMessage,
        lastActivityAt: c.lastActivityAt,
        lastParticipantMessageAt,
        canReply,
        replyDisabledReason,
        notes: c.notes || { text: "", updatedAt: null },
        participant: {
          igUserId,
          username: c.participantId?.username || null,
          name: profile?.name || null,
          profilePic: profile?.profilePic || null,
        },
      });
    }

    res.json({
      success: true,
      data: enriched,
      categoryCounts,
      hasMore,
      nextCursor,
      status: "ready",
      needsWhatsApp: false,
      needsInitialPull: false,
      isProcessing: false,
    });
  } catch (err) {
    console.error("❌ Fetch conversations error:", err);
    res.status(500).json({ success: false });
  }
});



// Search conversations by participant username or name (server-side — covers all pages)
router.get("/conversations/search", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const rawQuery = (req.query.q || "").trim();

    if (!rawQuery) {
      return res.json({ success: true, data: [] });
    }

    const { fbPageAccessToken } = await ensureFreshPageTokenForUser(userId);

    // Escape regex special chars to avoid injection
    const safeQuery = rawQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(safeQuery, "i");

    // Step 1: Find participant IDs whose username or name match
    const matchingParticipants = await Participant.find({
      $or: [{ username: regex }, { name: regex }],
    })
      .select("_id")
      .lean();

    if (matchingParticipants.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const participantIds = matchingParticipants.map((p) => p._id);

    // Step 2: Find conversations for this creator with those participants
    const docs = await Conversation.find({
      creatorId: userId,
      conversationIntent: { $in: ["Lead", "Business"] },
      participantId: { $in: participantIds },
    })
      .sort({ lastActivityAt: -1, _id: -1 })
      .limit(30)
      .populate({ path: "participantId", select: "igUserId username" })
      .lean();

    if (docs.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // Step 3: Batch profile lookups in parallel
    const igUserIds = docs.map((c) => c.participantId?.igUserId).filter(Boolean);
    const profileResults = await Promise.all(igUserIds.map((id) => getCachedProfile(id)));
    const profileMap = Object.fromEntries(igUserIds.map((id, i) => [id, profileResults[i]]));

    // Background-fetch any missing profiles (non-blocking)
    for (let i = 0; i < igUserIds.length; i++) {
      if (!profileResults[i]) {
        fetchAndCacheProfileSafely({
          igUserId: igUserIds[i],
          accessToken: fbPageAccessToken,
          conversationId: docs.find((c) => c.participantId?.igUserId === igUserIds[i])?._id,
          creatorId: userId,
          publishSocketEvent,
        }).catch(() => {});
      }
    }

    const WINDOW_MS = 24 * 60 * 60 * 1000;
    const HOT_LEAD_THRESHOLD = 0.65;
    const WARM_LEAD_THRESHOLD = 0.3;

    const enriched = docs.map((c) => {
      const intent = c.conversationIntent || "General";
      const igUserId = c.participantId?.igUserId;
      const profile = profileMap[igUserId] || null;

      const lastParticipantMessageAt = c.lastParticipantMessageAt;
      let canReply = false;
      let replyDisabledReason = null;
      if (lastParticipantMessageAt) {
        const diff = Date.now() - new Date(lastParticipantMessageAt).getTime();
        canReply = diff <= WINDOW_MS;
        if (!canReply) replyDisabledReason = "window_expired";
      } else {
        replyDisabledReason = "waiting_for_reply";
      }

      const creatorHasReplied = c.creatorHasReplied ?? false;
      const leadSeriousness = c.conversationLeadSeriousness || 0;
      const isHotLead = intent === "Lead" && leadSeriousness > HOT_LEAD_THRESHOLD;
      let leadTemperature = "cold";
      if (leadSeriousness > HOT_LEAD_THRESHOLD) leadTemperature = "hot";
      else if (leadSeriousness > WARM_LEAD_THRESHOLD) leadTemperature = "warm";

      const unreadCount = c.unreadCount || 0;
      let category = null;
      if (intent === "Business") category = "business";
      else if (intent === "Lead") category = creatorHasReplied ? "ongoing" : "new_leads";

      return {
        _id: c._id,
        igConversationId: c.igConversationId,
        label: intent,
        labelIntentConfidence: c.conversationIntentConfidence || 0,
        labelLeadSeriousness: leadSeriousness,
        labelLeadQuality: c.conversationLeadQuality || "none",
        leadTemperature,
        isHotLead,
        category,
        creatorHasReplied,
        followUpStatus: c.followUpStatus || null,
        unreadCount,
        lastMessage: c.lastMessage,
        lastActivityAt: c.lastActivityAt,
        lastParticipantMessageAt,
        canReply,
        replyDisabledReason,
        notes: c.notes || { text: "", updatedAt: null },
        participant: {
          igUserId,
          username: c.participantId?.username || null,
          name: profile?.name || null,
          profilePic: profile?.profilePic || null,
        },
      };
    });

    res.json({ success: true, data: enriched });
  } catch (err) {
    console.error("❌ Search conversations error:", err);
    res.status(500).json({ success: false });
  }
});



router.post("/conversations/sync", authenticateToken, async (req, res) => {
  const userId = req.user.user_id;
  const mode = req.query.mode || "blocking";

  if (mode === "background") {
    process.nextTick(() => syncInstagramConversations(userId));
    return res.json({ success: true, started: true });
  }

  await syncInstagramConversations(userId);

  const conversations = await Conversation.find({ creatorId: userId }).lean();
  res.json({ success: true, hydrated: true, data: conversations });
});



router.post("/conversations/:id/sync-older", authenticateToken, async (req, res) => {
  const conversationId = req.params.id;
  const userId = req.user.user_id;

  console.log('🔄 SYNC OLDER STARTED');

  try {
  const result = await syncOlderMessages({ userId, conversationId });

// 🔥 IMPORTANT: ensure messages are ordered oldest → newest
const insertedMessages = result.messages || [];
insertedMessages.sort(
  (a, b) =>
    new Date(a.createdAtPlatform) - new Date(b.createdAtPlatform)
);

// 🔥 Cursor MUST move backward
const oldest = insertedMessages[0];

res.json({
  success: true,
  data: {
    messages: insertedMessages,
    hasMore: result.hasMore,
    nextCursor: oldest
      ? {
          createdAtPlatform: oldest.createdAtPlatform,
          _id: oldest._id
        }
      : null
  }
});

  } catch (err) {
    console.error('❌ SYNC OLDER FAILED:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});


// GET /conversations/sync-status
router.get("/conversations/sync-status", authenticateToken, async (req, res) => {
  const userId = req.user.user_id;

  const active = await redisGet(`ig:sync:running:${userId}`);
  res.json({ syncing: Boolean(active) });
});

// GET /conversations/:id/messages (DB ONLY)
router.get("/conversations/:id/messages", authenticateToken, async (req, res) => {
    try {
      const userId = req.user.user_id;
      const conversationId = req.params.id;

      const limit = Math.min(Number(req.query.limit) || 25, 50);

      let cursor = null;
      if (req.query.cursor) {
        try {
          cursor = JSON.parse(req.query.cursor);
        } catch {
          return res.status(400).json({ success: false, error: "Invalid cursor" });
        }
      }


      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid id" });
      }

      // 🔒 Ownership check
      const conversation = await Conversation.findOne({
        _id: conversationId,
        creatorId: userId,
      }).lean();

      if (!conversation) {
        return res
          .status(404)
          .json({ success: false, error: "Not found" });
      }

      /* ================= CURSOR PAGINATION ================= */

   const query = {
  conversationId,
  isDeleted: false,
  ...(cursor && {
    $or: [
      {
        createdAtPlatform: {
          $lt: new Date(cursor.createdAtPlatform),
        },
      },
      {
        createdAtPlatform: new Date(cursor.createdAtPlatform),
        _id: { $lt: new mongoose.Types.ObjectId(cursor._id) },
      },
    ],
  }),
};


      // Fetch newest → oldest
      const docs = await Message.find(query)
        .sort({ createdAtPlatform: -1 })
        .limit(limit + 1) // 🔥 fetch one extra to detect hasMore
        .lean();

      const hasMore = docs.length > limit;
      const page = hasMore ? docs.slice(0, limit) : docs;

      // Order for UI (oldest → newest)
      const messages = page.sort(
        (a, b) =>
          new Date(a.createdAtPlatform) -
          new Date(b.createdAtPlatform)
      );

    const nextCursor = hasMore
  ? {
      createdAtPlatform: page[page.length - 1].createdAtPlatform,
      _id: page[page.length - 1]._id
    }
  : null;


      /* ================= READ SIDE EFFECTS ================= */

      // Only mark read on FIRST page load (not on scroll-up pagination)
      if (!cursor) {
        Message.updateMany(
          {
            conversationId,
            sender: "them",
            isRead: false,
          },
          { $set: { isRead: true } }
        ).catch(() => {});

        Conversation.updateOne(
          { _id: conversationId },
          { $set: { unreadCount: 0 } }
        ).catch(() => {});
      }

      /* ================= RESPONSE ================= */

const hasMoreOnMeta = Boolean(
  conversation.lastMetaAfterCursor || 
  (!conversation.metaSyncCompleted && !conversation.lastMetaAfterCursor)
);
res.json({
  success: true,
  data: {
    messages,
    nextCursor,
    hasMore,
    dbExhausted: !hasMore,
    hasMoreOnMeta
  }
});


    } catch (err) {
      console.error("Fetch messages failed", err);
      res.status(500).json({ success: false });
    }
  }
);


router.post("/conversations/:id/sync-latest", authenticateToken, async (req, res) => {
    const userId = req.user.user_id;
    const conversationId = req.params.id;

    try {
      // 1. Run the sync (fetches new messages from IG and saves to DB)
      await syncLatestConversation({ userId, conversationId });

      // 2. Fetch the latest messages from DB to return to frontend
      const SYNC_LIMIT = 25;
      const docs = await Message.find({ conversationId })
        .sort({ createdAtPlatform: -1 }) // Newest first
        .limit(SYNC_LIMIT + 1) // +1 to detect hasMore
        .lean();

      const hasMore = docs.length > SYNC_LIMIT;
      const page = hasMore ? docs.slice(0, SYNC_LIMIT) : docs;

      // nextCursor = oldest message in the page (last element in newest-first order)
      const nextCursor = hasMore
        ? { createdAtPlatform: page[page.length - 1].createdAtPlatform, _id: page[page.length - 1]._id }
        : null;

      // 3. PIGGYBACK AUTO-CORRECTION LOGIC
      // Check the very last message to see if *we* replied
      const latestMessage = page[0]; // newest message (page is still newest-first here)
      let conversationUpdate = {};

      // If the latest message is from 'me', the Follow Up is DONE.
      if (latestMessage && latestMessage.sender === 'me') {
        conversationUpdate = {
          'followUpStatus.needed': false,
          'followUpStatus.reason': null, // Clear the reason
          unreadCount: 0, // Since we are viewing it, it's read
          ...(latestMessage.type === 'text' ? { creatorHasReplied: true } : {}),
        };
        
        // Update DB immediately
        await Conversation.updateOne(
          { _id: conversationId, creatorId: userId },
          { $set: conversationUpdate }
        );
      }

      // 4. Fetch the final, fully updated Conversation object
      const updatedConversation = await Conversation.findOne({ _id: conversationId, creatorId: userId }).lean();

      // 5. Return everything the frontend expects
      res.json({
        success: true,
        data: {
          conversation: updatedConversation,
          messages: page.slice().reverse(), // chronological order for frontend
          nextCursor,
          hasMore,
        }
      });

    } catch (err) {
      console.error('Sync failed:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);


async function syncLatestConversation({ userId, conversationId }) {
  const conversation = await Conversation.findOne({
    _id: conversationId,
    creatorId: userId,
  }).lean();

  if (!conversation?.metaThreadId) return { hasNewMessages: false };

  const { fbPageAccessToken, igUserId } = await ensureFreshPageTokenForUser(userId);

   const user = await USER.findById(userId).lean();

  if (!fbPageAccessToken || !igUserId) return { hasNewMessages: false };

  /**
   * 🔥 Fetch latest messages (Meta returns newest first)
   */
  const latestPage = await InstagramService.fetchLatestMessages({
    igConversationId: conversation.metaThreadId,
    accessToken: fbPageAccessToken,
    limit: 25, 
  });

  let latestInsertedMessage = null;
  let hasNewMessages = false;
  let hasNewCreatorMessages = false; 
  let hasNewUserMessages = false;    

  // 🔥 Process messages if any returned from Meta
  if (latestPage.messages.length > 0) {
    for (const msg of latestPage.messages) {
      // Let upsertMessage's igMessageId unique-index check handle deduplication.
      // Do NOT skip based on lastActivityAt — that would silently drop creator
      // messages (sent from the IG app) whose timestamps fall before the latest
      // participant message that updated lastActivityAt via webhook.
      const inserted = await upsertMessage(msg, conversation, user);

      if (inserted) {
        hasNewMessages = true;

        // 🔥 Track message sender type
        if (inserted.sender === "me") {
          hasNewCreatorMessages = true;
        } else {
          hasNewUserMessages = true;
        }

        // Track the absolute latest message
        if (
          !latestInsertedMessage ||
          new Date(inserted.createdAtPlatform) >
            new Date(latestInsertedMessage.createdAtPlatform)
        ) {
          latestInsertedMessage = inserted;
        }
      }
    }
  }

  /**
   * 🔥 Update conversation ONLY if we inserted new messages
   */
  if (latestInsertedMessage && hasNewMessages) {
    const update = {
      lastMessage: {
        text: latestInsertedMessage.text,
        type: latestInsertedMessage.type,
        sender: latestInsertedMessage.sender,
        timestamp: latestInsertedMessage.createdAtPlatform,
      },
      lastActivityAt: latestInsertedMessage.createdAtPlatform,
    };

    if (latestInsertedMessage.sender === "them") {
      update.lastParticipantMessageAt = latestInsertedMessage.createdAtPlatform;
    }

    await Conversation.updateOne(
      { _id: conversation._id },
      { $set: update }
    );

    await publishSocketEvent({
      conversationId: conversation._id,
      payload: {
        type: "conversation:updated",
        conversationId: conversation._id.toString(),
        data: update
      }
    });
  }

  /**
   * 🔥 CRITICAL FIX: ALWAYS check the actual last message in DB
   * This handles cases where creator replied via native app but message was already synced
   */
  const actualLastMessage = await Message.findOne({
    conversationId: conversation._id,
    isDeleted: false,
  })
    .sort({ createdAtPlatform: -1 })
    .lean();

  if (actualLastMessage) {
    // CASE 1: Last message is from creator - clear follow-up status
    if (actualLastMessage.sender === 'me') {
      // Only update if followUpStatus.needed is currently true
      if (conversation.followUpStatus?.needed === true) {
        console.log(`[SyncLatest] 🛑 Creator replied last. Clearing Follow Up status for conversation: ${conversation._id}`);

        const syncUpdate = {
          "followUpStatus.needed": false,
          "followUpStatus.reason": null,
          "followUpStatus.clearedAt": new Date(),
          "followUpStatus.clearedReason": "creator_replied_native_app",
          "unreadCount": 0
        };
        // Only mark creatorHasReplied for text messages
        if (actualLastMessage.type === 'text') {
          syncUpdate["creatorHasReplied"] = true;
        }

        await Conversation.updateOne(
          { _id: conversation._id },
          { $set: syncUpdate }
        );

        // Emit socket event so frontend updates immediately
        const socketData = {
          followUpStatus: {
            needed: false,
            reason: null,
            clearedAt: new Date(),
            clearedReason: "creator_replied_native_app"
          },
          unreadCount: 0
        };
        if (actualLastMessage.type === 'text') {
          socketData.creatorHasReplied = true;
        }

        await publishSocketEvent({
          conversationId: conversation._id,
          payload: {
            type: "conversation:updated",
            conversationId: conversation._id.toString(),
            data: socketData
          }
        });
      }
    } 
    // CASE 2: Last message is from user - potentially trigger re-analysis
    else if (hasNewUserMessages) {
      console.log(`[SyncLatest] 🔄 New user message detected, triggering re-analysis...`);
      
      // Import dynamically to avoid circular dependencies
      const { reanalyzeConversation } = await import("../services/leadDetectionService.js");

      // Fire-and-forget
      reanalyzeConversation({
        conversationId: conversation._id,
        creatorId: userId,
        reason: hasNewCreatorMessages ? "native_app_sync" : "missed_webhook_sync",
      }).then(result => {
        if (result.success) {
          console.log(`[SyncLatest] ✅ Re-analysis complete`);
        }
      }).catch(err => {
        console.error(`[SyncLatest] ❌ Re-analysis error:`, err.message);
      });
    }
  }

  return { hasNewMessages, hasNewCreatorMessages, hasNewUserMessages };
}


async function upsertParticipant(igUser) {
  if (!igUser?.id) {
    throw new Error("Invalid Instagram participant");
  }

  const update = {
    platform: "instagram",
    igUserId: igUser.id,
    username: igUser.username || null,
    updatedAt: new Date(),
  };

  const participant = await Participant.findOneAndUpdate(
    {
      platform: "instagram",
      igUserId: igUser.id,
    },
    {
      $set: update,
      $setOnInsert: {
        createdAt: new Date(),
      },
    },
    {
      upsert: true,
      new: true,
    }
  );

  return participant._id;
}



const REDIS_BRIDGE_URL = "http://34.180.49.15:3000";

/**
 * Publish a message event via Redis Bridge
 */
async function publishMessageEvent({ creatorId, conversationId, message }) {
  try {
    await axios.post(`${REDIS_BRIDGE_URL}/publish/inbox`, {
      creatorId: creatorId.toString(),
      conversationId: conversationId.toString(),
      message
    });
    console.log(`✅ Published message event for conversation: ${conversationId}`);
  } catch (err) {
    console.error('❌ Failed to publish message event:', err.message);
  }
}

/**
 * Publish other event types (participant updates, conversation updates)
 */
async function publishSocketEvent({ conversationId, payload }) {
  try {
    // Use Redis directly for non-message events
    await redis.publish(
      `inbox:conversation:${conversationId}`,
      JSON.stringify(payload)
    );
    console.log(`✅ Published socket event for conversation: ${conversationId}`);
  } catch (err) {
    console.error('❌ Failed to publish socket event:', err.message);
  }
}


// ==================== UPDATE: syncInstagramConversations ====================

async function syncInstagramConversations(userId) {
  const lockKey = `ig:sync:running:${userId}`;
  if (await redisGet(lockKey)) return;

  await redisSet(lockKey, "1", 90);

  try {
    const { fbPageId, fbPageAccessToken, igUserId } = await ensureFreshPageTokenForUser(userId);

    if (!fbPageId || !fbPageAccessToken || !igUserId) return;

    const user = await USER.findById(userId).lean();
    if (!user) return;
    decryptUserTokens(user);


const metaRes = await InstagramService.fetchConversations({
  pageId: fbPageId,
  accessToken: fbPageAccessToken,
  limit: 10,
  after: user.igConversationsSync?.afterCursor || null
});

if (!metaRes.data.length) {
  console.log("ℹ️ No more Meta conversations to sync");
  return;
}


const metaConversations = metaRes.data;

await USER.updateOne(
  { _id: userId },
  {
    $set: {
      "igConversationsSync.afterCursor":
        metaRes.paging?.cursors?.after || null,

      "igConversationsSync.hasMore":
        Boolean(metaRes.paging?.next),

      "igConversationsSync.lastSyncedAt": new Date()
    }
  }
);



    for (const conv of metaConversations) {
      const metaThreadId = conv.id;

      const participant = conv.participants?.data?.find(
        (p) => p.id !== user.igUserId
      );
      if (!participant) continue;

      const igConversationId = `igdm:${user.igUserId}:${participant.id}`;

    const conversation = await Conversation.findOneAndUpdate(
  { creatorId: userId, igConversationId },
  {
    creatorId: userId,
    igConversationId,
    metaThreadId,
    participantId: await upsertParticipant(participant),
    platform: "instagram",
    $setOnInsert: {
      unreadCount: 0
    }
  },
  { upsert: true, new: true }
);


      /* ---------- Profile prefetch ---------- */
      const cached = await redisGet(`ig:user:${participant.id}`);
      if (!cached) {
        fetchAndCacheProfileSafely({
          igUserId: participant.id,
          accessToken: fbPageAccessToken,
          conversationId: conversation._id,
          creatorId: userId,
          publishSocketEvent,
        }).catch(() => {});
      }

      /* ---------- LATEST MESSAGE SYNC ---------- */
      const result = await InstagramService.fetchLatestMessages({
        igConversationId: metaThreadId,
        accessToken: fbPageAccessToken,
        afterCursor: conversation.lastMetaAfterCursor || null,
        limit: 25,
      });

      const insertedMessages = [];

      for (const msg of result.messages) {
const normalized = await upsertMessage(
  msg,
  conversation,
  user,
  { isHydration: true }
);

        if (normalized) {
          insertedMessages.push(normalized);

          // 🔥 realtime message event
          await publishMessageEvent({
            creatorId: userId,
            conversationId: conversation._id,
            message: normalized,
          });
        }
      }

      /* ---------- Update conversation preview ---------- */
      /* ---------- Update conversation preview ---------- */
      if (insertedMessages.length > 0) {
        const latestMessage = insertedMessages.reduce((latest, current) =>
          new Date(current.createdAtPlatform) >
          new Date(latest.createdAtPlatform)
            ? current
            : latest
        );

        const update = {
          lastMessage: {
            text: latestMessage.text,
            type: latestMessage.type,
            sender: latestMessage.sender,
            timestamp: latestMessage.createdAtPlatform,
          },
          lastActivityAt: latestMessage.createdAtPlatform,
        };

        if (latestMessage.sender === "them") {
          update.lastParticipantMessageAt = latestMessage.createdAtPlatform;
        }

        await Conversation.updateOne(
          {
            _id: conversation._id,
            $or: [
              { lastActivityAt: { $exists: false } },
              { lastActivityAt: { $lt: latestMessage.createdAtPlatform } },
            ],
          },
          { $set: update }
        );

        // 🔥 NEW: Recalculate unreadCount and creatorHasReplied accurately
        await recalculateConversationMetrics(conversation._id, user.igUserId);
      }

      // ================= SAFETY: ensure lastActivityAt always exists =================
if (!conversation.lastActivityAt && insertedMessages.length === 0) {
  await Conversation.updateOne(
    { _id: conversation._id },
    {
      $set: {
        lastActivityAt: new Date(0), // fallback for stable sorting
      },
    }
  );
}


      /* ---------- Update AFTER cursor ONLY ---------- */
    // After fetching messages, ALWAYS update cursor if Meta provides one
const nextAfterCursor = result.paging?.cursors?.after;
if (nextAfterCursor) {
  await Conversation.updateOne(
    { _id: conversation._id },
    {
      $set: {
        lastMetaAfterCursor: nextAfterCursor,
        lastSyncedAt: new Date(),
      },
    }
  );
} else if (result.messages.length < 25) {
  // If less than full page AND no cursor, explicitly mark as exhausted
  await Conversation.updateOne(
    { _id: conversation._id },
    {
      $set: {
        lastMetaAfterCursor: null,  // Explicitly null = no more
        lastSyncedAt: new Date(),
      },
    }
  );
}
    }
  } catch (err) {
    console.error("❌ syncInstagramConversations failed", err);
  } finally {
    await redisDel(lockKey);
  }
}


async function recalculateConversationMetrics(conversationId) {
  // 1. Fetch all valid messages, newest first
  const messages = await Message.find({
    conversationId,
    isDeleted: false,
  })
    .sort({ createdAtPlatform: -1 }) 
    .lean();

  // 2. Handle empty conversation case
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

  // 3. Find the timestamp of the Creator's latest message
  let creatorLatestMessageTime = null;
  for (const m of messages) {
    if (m.sender === "me") {
      creatorLatestMessageTime = new Date(m.createdAtPlatform);
      break; // Since sorted by newest, the first "me" is the latest
    }
  }

  let unreadCount = 0;
  let lastParticipantMessageAt = null;

  // 4. Count User messages that are NEWER than the Creator's last reply
  for (const m of messages) {
    if (m.sender === "them") {
      const msgTime = new Date(m.createdAtPlatform);
      
      // Track the very last message from the user
      if (!lastParticipantMessageAt) {
        lastParticipantMessageAt = msgTime;
      }
      
      // 🔥 CRITICAL LOGIC: 
      // Count as unread if:
      // A) Creator has NEVER replied (creatorLatestMessageTime is null)
      // B) OR User message is newer (or same time) as creator's last message
      if (!creatorLatestMessageTime || msgTime >= creatorLatestMessageTime) {
        unreadCount++;
      }
    }
  }

  const creatorHasReplied = messages.some((m) => m.sender === "me" && m.type === "text");

  // 5. Update the Conversation Document
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

  console.log(`📊 [recalculateMetrics] Conv ${conversationId}: unread=${unreadCount}, creatorReplied=${creatorHasReplied}`);

  return { unreadCount, creatorHasReplied, lastParticipantMessageAt };
}

router.post("/conversations/load-more-from-meta", authenticateToken, async (req, res) => {
  const userId = req.user.user_id;

  process.nextTick(() => syncInstagramConversations(userId));

  res.json({ success: true, started: true });
});


async function upsertMessage(metaMsg, conversation, user, options = {}) {
  const { isHydration = false } = options;

   const { fbPageAccessToken } = await ensureFreshPageTokenForUser(user._id);

  if (!metaMsg?.id) return null;

  // ---------- Idempotency ----------
  const exists = await Message.findOne(
    { igMessageId: metaMsg.id },
    { _id: 1 }
  ).lean();
  if (exists) return null;

  // ---------- Sender detection ----------
  const isFromMe = metaMsg.from?.id === user.igUserId;

  const sender = isFromMe ? "me" : "them";
  const senderType = isFromMe ? "creator" : "participant";
  const senderTypeRef = isFromMe ? "users" : "participants";
  const senderId = isFromMe ? user._id : conversation.participantId;

  // ---------- Content detection ----------
  let type = "text";
  let text = metaMsg.message || null;
  let mediaUrl = null;
  let mediaType = null;
  let action = null;

  const attachment = metaMsg.attachments?.data?.[0];

  if (attachment?.image_data?.url) {
    type = "image";
    mediaType = "image";
    mediaUrl = attachment.image_data.url;
  } else if (attachment?.video_data?.url) {
    type = "video";
    mediaType = "video";
    mediaUrl = attachment.video_data.url;
  } else if (attachment) {
    type = "system";
    text = "Shared an attachment";
  }

  // ---------- System messages (reel / post / story) ----------
  if (metaMsg.is_unsupported) {
    type = "system";
    text = "Shared a reel";
    action = {
      label: "View on Instagram",
      url: `https://www.instagram.com/direct/t/${conversation.metaThreadId}`,
    };
  }

  // ---------- Timestamp ----------
  const createdAtPlatform = metaMsg.created_time
    ? new Date(metaMsg.created_time)
    : new Date();

  // ---------- Insert message ----------
  const inserted = await Message.create({
    conversationId: conversation._id,
    platform: "instagram",
    igMessageId: metaMsg.id,

    sender,
    senderType,
    senderTypeRef,
    senderId,

    type,
    text,
    mediaUrl,
    mediaType,
    action,

    createdAtPlatform,

    isRead: sender === "me",
    isDeleted: false,
  });

  // ---------- Update unread count ----------
  if (
    sender === "them" &&
    !isHydration &&
    (
      !conversation.lastActivityAt ||
      createdAtPlatform > new Date(conversation.lastActivityAt)
    )
  ) {
    await Conversation.updateOne(
      { _id: conversation._id },
      { $inc: { unreadCount: 1 } }
    );
  }

  // 🔥 NEW: Update creatorHasReplied when creator sends a TEXT message
  // This handles messages synced from Instagram native app
  // Only text messages count - system/image/video/reaction don't qualify
  if (sender === "me" && type === "text" && !conversation.creatorHasReplied) {
    await Conversation.updateOne(
      { _id: conversation._id },
      { $set: { creatorHasReplied: true } }
    );
    console.log(`[upsertMessage] 📤 Set creatorHasReplied=true for conversation: ${conversation._id}`);
  }

  // ================= STAGE 1: CONVERSATION SCORING (TESTING) =================
  if (sender === "them" && !isHydration) {
    try {
      const recentMessages = await Message.find({
        conversationId: conversation._id,
        sender: "them",
        isDeleted: false,
      })
        .sort({ createdAtPlatform: -1 })
        .limit(5)
        .lean();

      recentMessages.reverse();

      const stage1Score = await scoreConversationStage1(recentMessages);

      console.log("🧠 STAGE-1 SCORE", {
        conversationId: conversation._id.toString(),
        score: stage1Score,
        messageCount: recentMessages.length,
      });

    } catch (err) {
      console.error("❌ Stage-1 scoring failed:", err.message);
    }
  }

  // ---------- Refresh profile if needed ----------
  if (sender === "them") {
    fetchAndCacheProfileSafely({
      igUserId: metaMsg.from.id,
      accessToken: fbPageAccessToken,
      conversationId: conversation._id,
      creatorId: user._id,
      publishSocketEvent,
    }).catch(() => {});
  }

  // ---------- Return normalized message ----------
  const normalizedMessage = {
    _id: inserted._id.toString(),
    sender,
    type,
    text,
    mediaUrl,
    mediaType,
    action,
    createdAtPlatform,
    isRead: inserted.isRead,
  };

  return normalizedMessage;
}


router.post("/conversations/:id/messages", authenticateToken, upload.single("file"), async (req, res) => {
    try {
      const userId = req.user?.user_id;
      const { id: conversationId } = req.params;
      const { text = "", type = "text" } = req.body;

      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid conversation id",
        });
      }

      /* ================= FETCH CONVERSATION ================= */
      const conversation = await Conversation.findOne({
        _id: conversationId,
        creatorId: userId,
      })
        .populate("participantId")
        .lean();

      if (!conversation) {
        return res.status(404).json({
          success: false,
          error: "Conversation not found",
        });
      }

      /* ================= 🔒 24-HOUR WINDOW CHECK ================= */
      const lastUserMessage = await Message.findOne({
        conversationId,
        sender: "them",
      })
        .sort({ createdAtPlatform: -1 })
        .lean();

      const WINDOW_MS = 24 * 60 * 60 * 1000;

      if (
        !lastUserMessage ||
        !lastUserMessage.createdAtPlatform ||
        Date.now() - new Date(lastUserMessage.createdAtPlatform).getTime() > WINDOW_MS
      ) {
        return res.status(403).json({
          success: false,
          error: "MESSAGE_WINDOW_CLOSED",
          message: "Waiting for participant reply",
        });
      }

      /* ================= FETCH CREATOR ================= */
      const { fbPageId, fbPageAccessToken } = await ensureFreshPageTokenForUser(userId);

      if (!fbPageId || !fbPageAccessToken) {
        return res.status(400).json({
          success: false,
          error: "Instagram not connected",
        });
      }

      /* ================= NORMALIZE INPUT ================= */
      let normalizedType = type;
      let normalizedText = text?.trim() || null;
      let mediaUrl = null;
      let mediaType = null;

      if ((type === "image" || type === "video") && req.file) {
        normalizedText = null;
      }

      if (type === "text") {
        normalizedType = "text";
      }

      /* ================= UPLOAD MEDIA TO GCS ================= */
      if ((normalizedType === "image" || normalizedType === "video") && req.file) {
        const uploadResult = await uploadBufferToGCSFolder(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype,
          "instagram-messages"
        );

        mediaUrl = uploadResult.publicUrl;
        mediaType = normalizedType;
      }

      /* ================= VALIDATE CONTENT ================= */
      if (normalizedType === "text" && !normalizedText) {
        return res.status(400).json({
          success: false,
          error: "NO_TEXT_CONTENT",
        });
      }

      if ((normalizedType === "image" || normalizedType === "video") && !mediaUrl) {
        return res.status(400).json({
          success: false,
          error: "NO_MEDIA_UPLOADED",
        });
      }

      /* ================= RECIPIENT ================= */
      const recipientIgUserId = conversation.participantId?.igUserId;

      if (!recipientIgUserId) {
        return res.status(400).json({
          success: false,
          error: "Recipient Instagram user id not found",
        });
      }

      /* ================= 🔒 META DM RATE LIMIT CHECK ================= */
      const allowed = await canSendDM(userId);
      if (!allowed) {
        return res.status(429).json({
          success: false,
          error: "DM_RATE_LIMIT",
          message: "You've reached the DM rate limit (180 DMs/hour imposed by Meta). Please wait a moment before sending again.",
        });
      }

      /* ================= BUILD IG PAYLOAD ================= */
      const payload = buildInstagramPayload({
        type: normalizedType,
        text: normalizedText,
        mediaUrl,
        recipientIgUserId,
      });

      /* ================= SEND TO INSTAGRAM ================= */
      const igResponse = await InstagramService.sendMessage({
        pageId: fbPageId,
        accessToken: fbPageAccessToken,
        payload,
      });

      if (!igResponse?.message_id) {
        throw new Error("Instagram did not return message_id");
      }

      /* ================= SAVE MESSAGE ================= */
      const createdAtPlatform = new Date();

      const message = await Message.create({
        conversationId,
        platform: "instagram",
        igMessageId: igResponse.message_id,
        sender: "me",
        senderType: "creator",
        senderTypeRef: "users",
        senderId: userId,
        type: normalizedType,
        text: normalizedText,
        mediaUrl,
        mediaType,
        createdAtPlatform,
        isRead: true,
        isDeleted: false,
      });

      /* ================= MARK PREVIOUS USER MESSAGES AS READ ================= */
      await Message.updateMany(
        {
          conversationId,
          sender: "them",
          isRead: false,
        },
        {
          $set: { isRead: true },
        }
      );

      /* ================= UPDATE CONVERSATION ================= */
      // 🔥 IMPORTANT: Set creatorHasReplied to true when creator sends a message
      const updatedConv = await Conversation.findByIdAndUpdate(
        conversationId,
        {
          $set: {
            unreadCount: 0,
            creatorHasReplied: true,
            "followUpStatus.needed": false,
            "followUpStatus.priority": null, 
            "followUpStatus.reason": null, // Or "Replied manually"
            "followUpStatus.completedAt": createdAtPlatform,
            lastMessage: {
              text: normalizedText,
              type: normalizedType,
              sender: "me",
              timestamp: createdAtPlatform,
            },
            lastActivityAt: createdAtPlatform,
          },
        },
        { new: true }
      )
        .populate({
          path: "participantId",
          select: "igUserId username",
        })
        .lean();

        // 🔥 NEW: Re-analyze conversation after creator sends message
// This will update followUpStatus.needed to false since creator replied
try {
  const { reanalyzeConversation } = await import("../services/leadDetectionService.js");
  
  // Fire and forget - don't block the response
  reanalyzeConversation({
    conversationId: conversationId,
    creatorId: userId,
    reason: "creator_replied",
  }).then((result) => {
    console.log(`[SendMessage] Re-analyzed after creator reply: followUp=${result.followUp?.needed}`);
  }).catch((err) => {
    console.error("[SendMessage] Re-analysis failed:", err.message);
  });
} catch (err) {
  console.error("[SendMessage] Failed to trigger re-analysis:", err.message);
}

      const normalized = {
        _id: message._id.toString(),
        sender: "me",
        type: normalizedType,
        text: normalizedText,
        mediaUrl,
        mediaType,
        createdAtPlatform,
        isRead: true,
      };

      /* ================= SOCKET EVENTS ================= */

      await redis.publish(
        `inbox:conversation:${conversationId}`,
        JSON.stringify({
          type: "message:new",
          creatorId: userId,
          conversationId,
          data: normalized,
        })
      );

      const igUserId = updatedConv.participantId?.igUserId;
      const profile = igUserId
        ? await redisGet(`ig:user:${igUserId}`)
        : null;

      // 🔥 UPDATED: Include creatorHasReplied in the socket event
      await redis.publish(
        `inbox:conversation:${conversationId}`,
        JSON.stringify({
          type: "conversation:updated",
          creatorId: userId,
          conversationId,
          data: {
            _id: updatedConv._id,
            igConversationId: updatedConv.igConversationId,
            
            // Label fields
            label: updatedConv.conversationIntent || "General",
            labelIntentConfidence: updatedConv.conversationIntentConfidence || 0,
            labelLeadSeriousness: updatedConv.conversationLeadSeriousness || 0,
            followUpStatus: updatedConv.followUpStatus || null,
            
            // 🔥 NEW: Include creatorHasReplied
            creatorHasReplied: true,
            
            unreadCount: updatedConv.unreadCount,
            lastMessage: updatedConv.lastMessage,
            lastActivityAt: updatedConv.lastActivityAt,
            participant: {
              igUserId,
              username: updatedConv.participantId?.username || null,
              name: profile?.name || null,
              profilePic: profile?.profilePic || null,
              restricted: profile?.restricted || false,
            },
          },
        })
      );

      return res.status(201).json({
        success: true,
        data: normalized,
      });
    } catch (err) {
      console.error("Send message error:", err);
      return res.status(500).json({
        success: false,
        error: "FAILED_TO_SEND",
      });
    }
  }
);

router.post("/conversations/:id/mark-read", authenticateToken, async (req, res) => {
    const userId = req.user.user_id;
    const conversationId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ success: false });
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      creatorId: userId,
    });

    if (!conversation) {
      return res.status(404).json({ success: false });
    }

    // 1️⃣ Mark messages as read (creator-side)
    await Message.updateMany(
      {
        conversationId,
        sender: "them",
        isRead: false,
      },
      { $set: { isRead: true } }
    );

    // 2️⃣ Reset unread count
    conversation.unreadCount = 0;
    await conversation.save();

    // 3️⃣ Realtime update
    await redis.publish(
      `inbox:conversation:${conversationId}`,
      JSON.stringify({
        type: "conversation:updated",
        creatorId: userId,
        conversationId,
        data: {
          unreadCount: 0,
        },
      })
    );

    await redis.publish(
      `inbox:creator:${userId}`,
      JSON.stringify({
        type: "conversation:updated",
        conversationId,
        data: {
          unreadCount: 0,
        },
      })
    );

    res.json({ success: true });
  }
);


router.patch("/conversations/:id/label", authenticateToken, async (req, res) => {
    try {
      const creatorId = req.user.user_id;
      const conversationId = req.params.id;
      const { label } = req.body;

      if (!["Personal", "Leads", "General"].includes(label)) {
        return res.status(400).json({
          success: false,
          error: "INVALID_LABEL",
        });
      }

      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        return res.status(400).json({
          success: false,
          error: "INVALID_CONVERSATION_ID",
        });
      }

      /* ================= UPDATE DB ================= */

      const conversation = await Conversation.findOneAndUpdate(
        { _id: conversationId, creatorId },
        {
          $set: {
            label,
            labelSource: "manual",
          },
        },
        { new: true }
      ).lean();

      if (!conversation) {
        return res.status(404).json({
          success: false,
          error: "CONVERSATION_NOT_FOUND",
        });
      }

      /* ================= REALTIME: CONVERSATION ================= */

      await redis.publish(
        `inbox:conversation:${conversationId}`,
        JSON.stringify({
          type: "conversation:updated",
          creatorId: creatorId.toString(),
          conversationId: conversationId.toString(),
          data: {
            label: conversation.label,
            labelSource: conversation.labelSource,
          },
        })
      );

      /* ================= REALTIME: CREATOR SIDEBAR ================= */

      await redis.publish(
        `inbox:creator:${creatorId}`,
        JSON.stringify({
          type: "conversation:updated",
          conversationId: conversationId.toString(),
          data: {
            label: conversation.label,
            labelSource: conversation.labelSource,
          },
        })
      );

      return res.json({
        success: true,
        data: {
          conversationId,
          label: conversation.label,
          labelSource: conversation.labelSource,
        },
      });
    } catch (err) {
      console.error("❌ Update label failed:", err);
      return res.status(500).json({
        success: false,
        error: "FAILED_TO_UPDATE_LABEL",
      });
    }
  }
);

router.patch("/conversations/:id/notes", authenticateToken, async (req, res) => {
    try {
      const creatorId = req.user.user_id;
      const conversationId = req.params.id;
      const { text } = req.body;

      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        return res.status(400).json({ success: false });
      }

      const conversation = await Conversation.findOneAndUpdate(
        { _id: conversationId, creatorId },
        {
          $set: {
            "notes.text": text || "",
            "notes.updatedAt": new Date(),
          },
        },
        { new: true }
      ).lean();

      if (!conversation) {
        return res.status(404).json({ success: false });
      }

      // 🔁 Realtime update (conversation scoped)
      await redis.publish(
        `inbox:conversation:${conversationId}`,
        JSON.stringify({
          type: "conversation:updated",
          conversationId,
          data: {
            notes: conversation.notes,
          },
        })
      );

      res.json({
        success: true,
        data: conversation.notes,
      });
    } catch (err) {
      console.error("Update notes failed", err);
      res.status(500).json({ success: false });
    }
  }
);




router.post("/page-analytics", authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.body || {};
    const userIdStr = req.user?.user_id;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: "startDate and endDate are required" });
    }
    if (!userIdStr || !mongoose.Types.ObjectId.isValid(userIdStr)) {
      return res.status(401).json({ message: "Unauthorized: invalid user" });
    }

    const userObjectId = new mongoose.Types.ObjectId(userIdStr);

    const matchStage = {
      $match: {
        user_id: userObjectId,
        created_at: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
        is_del: { $ne: true },
      },
    };

    // Total page views (records) for this user
    const pageViewsPromise = PageAnalytics.countDocuments(matchStage.$match);

    // Unique visitors by IP across the whole range
    const visitorsPromise = PageAnalytics.aggregate([
      matchStage,
      { $group: { _id: "$ip" } },
      { $count: "uniqueIps" },
    ]);

    // Unique visitors & page views by city
    const citiesPromise = PageAnalytics.aggregate([
      matchStage,
      {
        $group: {
          _id: { city: "$city" },
          pageViews: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          city: "$_id.city",
          pageViews: 1,
        },
      },
    ]);

    // Unique visitors per city (dedupe IP within each city)
    const cityVisitorsPromise = PageAnalytics.aggregate([
      matchStage,
      { $group: { _id: { city: "$city", ip: "$ip" } } },
      { $group: { _id: "$_id.city", visitors: { $sum: 1 } } },
      { $project: { _id: 0, city: "$_id", visitors: 1 } },
    ]);

    // Regions: page views & unique visitors
    const regionsPromise = PageAnalytics.aggregate([
      matchStage,
      { $group: { _id: { region: "$region" }, pageViews: { $sum: 1 } } },
      { $project: { _id: 0, region: "$_id.region", pageViews: 1 } },
    ]);

    const regionVisitorsPromise = PageAnalytics.aggregate([
      matchStage,
      { $group: { _id: { region: "$region", ip: "$ip" } } },
      { $group: { _id: "$_id.region", visitors: { $sum: 1 } } },
      { $project: { _id: 0, region: "$_id", visitors: 1 } },
    ]);

    const [pageViews, visitorsArr, citiesPV, citiesUV, regionsPV, regionsUV] = await Promise.all([
      pageViewsPromise,
      visitorsPromise,
      citiesPromise,
      cityVisitorsPromise,
      regionsPromise,
      regionVisitorsPromise,
    ]);

    const visitors = visitorsArr?.[0]?.uniqueIps || 0;

    // Merge city metrics
    const cityMap = new Map();
    for (const c of citiesPV) {
      cityMap.set(c.city || "", { city: c.city || "", pageViews: c.pageViews || 0, visitors: 0 });
    }
    for (const c of citiesUV) {
      const cur = cityMap.get(c.city || "") || { city: c.city || "", pageViews: 0, visitors: 0 };
      cur.visitors = c.visitors || 0;
      cityMap.set(c.city || "", cur);
    }
    const cities = Array.from(cityMap.values());

    // Merge region metrics
    const regionMap = new Map();
    for (const r of regionsPV) {
      regionMap.set(r.region || "", { region: r.region || "", pageViews: r.pageViews || 0, visitors: 0 });
    }
    for (const r of regionsUV) {
      const cur = regionMap.get(r.region || "") || { region: r.region || "", pageViews: 0, visitors: 0 };
      cur.visitors = r.visitors || 0;
      regionMap.set(r.region || "", cur);
    }
    const regions = Array.from(regionMap.values());

    res.json({
      summary: { visitors, pageViews },
      cities,
      regions,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/newsletters-subscribe", async (req, res) => {
  try {
    // Rate limit: 5 subscriptions per hour per IP to prevent spam flooding
    const _nlIp = await getClientIp(req);
    const _nlAllowed = await checkRateLimit(`newsletter:subscribe:${_nlIp}`, 5, 60 * 60 * 1000);
    if (!_nlAllowed) return res.status(429).json({ message: "Too many requests. Please try again later." });

    const {
      email,
      newsletterText = "",
      blockId = null,
      submittedAt = null,
      handle = null,
      meta = {},
    } = req.body || {};

    // validate email
    if (!email || !String(email).trim()) {
      return res.status(400).json({ message: "email is required" });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ message: "invalid email" });
    }

    // collect request context (ip, ua, referrer), and geo
    const ip = await getClientIp(req);
    const ua = req.headers["user-agent"] || "";
    const ref = req.headers["referer"] || req.headers["referrer"] || "";
    const geo = await lookupGeo_ipdata(ip);

    // resolve user_id by handle (if provided)
    let userId = null;
    if (handle && String(handle).trim()) {
      const maybeUser = await USER.findOne({
        handleUserName: String(handle).trim(),
      })
        .select("_id")
        .lean()
        .exec();
      if (maybeUser) userId = maybeUser._id;
    }

    // Build query to locate the correct newsletter doc
    const baseQuery = { user_id: userId || null, is_del: false };

    if (blockId) {
      // if blockId provided, prefer doc for that block
      baseQuery.blockId = blockId;
    } else if (newsletterText && String(newsletterText).trim()) {
      // otherwise try to match by newsletterText
      baseQuery.newsletterText = String(newsletterText).trim();
      baseQuery.blockId = null;
    } else {
      baseQuery.blockId = null;
    }

    // prepare the email subdocument with geo fields
    const emailEntry = {
      email: normalizedEmail,
      subscribed_at: submittedAt ? new Date(submittedAt) : new Date(),
      ip: geo?.ip || ip || undefined,
      referrer: ref || undefined,
      country: geo?.country || undefined,
      region: geo?.region || undefined,
      city: geo?.city || undefined,
      postal: geo?.postal || undefined,
      latitude: geo?.latitude ? String(geo.latitude) : undefined,
      longitude: geo?.longitude ? String(geo.longitude) : undefined,
      meta: {
        ...meta,
        user_agent: ua, // keep UA in meta as well for convenience
      },
    };

    // find existing doc
    let doc = await NewsletterModel.findOne(baseQuery).exec();

    if (doc) {
      // check duplicate email
      const exists =
        Array.isArray(doc.emails) &&
        doc.emails.some((e) => String(e.email).toLowerCase() === normalizedEmail);
      if (exists) {
        return res.status(200).json({ message: "Already subscribed" });
      }

      // push with geo fields
      doc.emails.push(emailEntry);
      doc.updatedAt = new Date();
      await doc.save();

      return res.status(201).json({ message: "Successfully subscribed", id: doc._id });
    }

    // create new doc with first email
    const newDoc = await NewsletterModel.create({
      user_id: userId || null,
      handle: handle || null,
      blockId: blockId || null,
      newsletterText: String(newsletterText || ""),
      emails: [emailEntry],
    });

    return res.status(201).json({ message: "Successfully subscribed", id: newDoc._id });
  } catch (err) {
    console.error("POST /newsletters/subscribe error:", err);
    if (err && err.code === 11000) {
      // defensive for rare race on unique indexes (if you add one later)
      return res.status(200).json({ message: "Already subscribed" });
    }
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/newsletter-list-emails", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { page = 1, limit = 10, blockId = null } = req.body || {};
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const perPage = Math.max(parseInt(limit, 10) || 10, 1);
    const skip = (pageNum - 1) * perPage;

    const matchStage = {
      user_id: new mongoose.Types.ObjectId(String(userId)),
      is_del: false,
      ...(blockId ? { blockId: new mongoose.Types.ObjectId(String(blockId)) } : {}),
    };

    const now = new Date();
    const last7 = new Date(now); last7.setDate(now.getDate() - 7);
    const last28 = new Date(now); last28.setDate(now.getDate() - 28);

    const [result] = await NewsletterModel.aggregate([
      { $match: matchStage },
      {
        $facet: {
          // 1) Paginated rows
          rows: [
            { $unwind: "$emails" },
            { $sort: { "emails.subscribed_at": -1 } },
            { $skip: skip },
            { $limit: perPage },
            {
              $project: {
                _id: 0,
                email: "$emails.email",
                subscribed_at: "$emails.subscribed_at",
              },
            },
          ],

          // 2) Stats for counts
          stats: [
            { $unwind: "$emails" },
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                last7: {
                  $sum: {
                    $cond: [{ $gte: ["$emails.subscribed_at", last7] }, 1, 0],
                  },
                },
                last28: {
                  $sum: {
                    $cond: [{ $gte: ["$emails.subscribed_at", last28] }, 1, 0],
                  },
                },
              },
            },
          ],

          // 3) Top Cities
          topCities: [
            { $unwind: "$emails" },
            {
              $project: {
                city: {
                  $trim: { input: { $ifNull: ["$emails.city", "Unknown"] } },
                },
              },
            },
            { $group: { _id: "$city", count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $limit: 10 },
            { $project: { _id: 0, name: "$_id", count: 1 } },
          ],

          // 4) Top Regions (State/Region)
          topRegions: [
            { $unwind: "$emails" },
            {
              $project: {
                region: {
                  $trim: {
                    input: {
                      $ifNull: [
                        { $ifNull: ["$emails.region", "$emails.state"] },
                        "Unknown",
                      ],
                    },
                  },
                },
              },
            },
            { $group: { _id: "$region", count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $limit: 10 },
            { $project: { _id: 0, name: "$_id", count: 1 } },
          ],
        },
      },
    ]);

    const rows = result?.rows || [];
    const statsDoc = (result?.stats && result.stats[0]) || { total: 0, last7: 0, last28: 0 };
    const topCities = result?.topCities || [];
    const topRegions = result?.topRegions || [];

    return res.json({
      rows,                            // [{ email, subscribed_at }]
      pagination: { page: pageNum, limit: perPage },
      total: statsDoc.total || 0,      // for TablePagination
      stats: {
        totalSubscribers: statsDoc.total || 0,
        last7Days: statsDoc.last7 || 0,
        last28Days: statsDoc.last28 || 0,
      },
      topCities,
      topRegions,
    });
  } catch (err) {
    console.error("list-emails error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});


router.post("/dashboard-analytics", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { startDate, endDate } = req.body || {};
    const now = new Date();

    const start = startDate ? new Date(startDate) : new Date(now);
    if (!startDate) start.setDate(start.getDate() - 27);
    start.setHours(0, 0, 0, 0);

    const end = endDate ? new Date(endDate) : new Date(now);
    end.setHours(23, 59, 59, 999);

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // ---------------------------
    // Build parallel promises
    // ---------------------------
    const totalViewsPromise = PageAnalytics.countDocuments({
      user_id: userObjectId,
      is_del: { $ne: true },
      created_at: { $gte: start, $lte: end },
    });

    const totalClicksAggPromise = Block.aggregate([
      { $match: { user_id: userObjectId, is_del: { $ne: true } } },
      { $unwind: "$link_click_analytics" },
      {
        $match: {
          "link_click_analytics.created_at": { $gte: start, $lte: end },
        },
      },
      { $count: "total" },
    ]);

    const totalAutomationsPromise = Automation.countDocuments({
      userId: userObjectId,
      createdAt: { $gte: start, $lte: end },
    });

    // OPTIMIZED: Use aggregation with $lookup to count private replies
// --- MODIFIED totalPrivateRepliesAggPromise ---
const totalPrivateRepliesAggPromise = RepliedComment.aggregate([
    // Stage 1: Filter comments by time range, channel, status, and your userId
    {
        $match: {
            // Match the current user's ID
            userId: userObjectId,
           
        },
    },
    // Stage 2: Group by the unique Instagram User ID (igUserId)
    {
        $group: {
            _id: "$igUserId", // Group by the unique commenter ID
            // We don't need to count anything here, just establish the unique group
        },
    },
    // Stage 3: Count the number of unique groups found in Stage 2
    {
        $count: "total"
    },
]);

    const topCitiesAggPromise = PageAnalytics.aggregate([
      {
        $match: {
          user_id: userObjectId,
          is_del: { $ne: true },
          created_at: { $gte: start, $lte: end },
        },
      },
      { $group: { _id: { city: "$city" }, visitors: { $sum: 1 } } },
      { $project: { _id: 0, city: "$_id.city", visitors: 1 } },
      { $sort: { visitors: -1 } },
      { $limit: 10 },
    ]);

    const topRegionsAggPromise = PageAnalytics.aggregate([
      {
        $match: {
          user_id: userObjectId,
          is_del: { $ne: true },
          created_at: { $gte: start, $lte: end },
        },
      },
      { $group: { _id: { region: "$region" }, visitors: { $sum: 1 } } },
      { $project: { _id: 0, region: "$_id.region", visitors: 1 } },
      { $sort: { visitors: -1 } },
      { $limit: 10 },
    ]);

    // Run all in parallel
    const [
      totalViews,
      totalClicksAgg,
      totalAutomations,
      totalPrivateRepliesAgg,
      topCitiesAgg,
      topRegionsAgg,
    ] = await Promise.all([
      totalViewsPromise,
      totalClicksAggPromise,
      totalAutomationsPromise,
      totalPrivateRepliesAggPromise,
      topCitiesAggPromise,
      topRegionsAggPromise,
    ]);

    // Normalize results
    const totalClicks = totalClicksAgg?.[0]?.total || 0;
    const totalPrivateReplies = totalPrivateRepliesAgg?.[0]?.total || 0;

    const cities = (topCitiesAgg || []).map((c) => ({
      city: c.city || "Unknown",
      visitors: c.visitors || 0,
    }));

    const regions = (topRegionsAgg || []).map((r) => ({
      region: r.region || "Unknown",
      visitors: r.visitors || 0,
    }));

    return res.json({
      summary: {
        totalViews,
        totalClicks,
        totalAutomations,
        totalPrivateReplies,
      },
      cities,
      regions,
    });
  } catch (err) {
    console.error("dashboard-analytics error:", err);
    return res.status(500).json({ message: "Failed to load dashboard analytics" });
  }
});


router.get("/blocks/options", authenticateToken, async (req, res) => {
  try {
    const userId =
      req.user?.id ||
      req.user?.user_id ||
      req.headers["x-user-id"];

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized: missing user_id" });
    }

    const blocks = await Block.aggregate([
      {
        $match: {
          user_id: new mongoose.Types.ObjectId(userId),
          is_del: { $ne: true },
          archived: { $ne: true },
          type: { $in: ["link", "video"] }, // ← ADD THIS LINE
        },
      },
      { $sort: { order: 1, created_at: 1 } },
      {
        $project: {
          name: 1,
          order: 1,
          clicks: { $size: { $ifNull: ["$link_click_analytics", []] } },
          visitors: {
            $size: {
              $setUnion: [
                {
                  $map: {
                    input: { $ifNull: ["$link_click_analytics", []] },
                    as: "a",
                    in: "$$a.ip",
                  },
                },
                [],
              ],
            },
          },
        },
      },
    ]);

    res.json({ blocks });
  } catch (err) {
    console.error("GET /blocks/options error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// UPDATED: now accepts startDate & endDate, filters events by created_at
router.post("/analytics/blocks", authenticateToken, async (req, res) => {
  try {
    const userId =
      req.user?.id ||
      req.user?.user_id ||
      req.headers["x-user-id"];

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized: missing user_id" });
    }

    const { blockId, startDate, endDate } = req.body || {};

    // Safety: require valid dates
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;

    if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: "Invalid or missing date range" });
    }

    const baseMatch = {
      user_id: new mongoose.Types.ObjectId(userId),
      is_del: { $ne: true },
      archived: { $ne: true },
    };
    if (blockId) baseMatch._id = new mongoose.Types.ObjectId(blockId);

    const results = await Block.aggregate([
      { $match: baseMatch },
      { $sort: { order: 1, created_at: 1 } },

      // Filter the nested events by created_at into a new array "events"
      {
        $addFields: {
          events: {
            $filter: {
              input: { $ifNull: ["$link_click_analytics", []] },
              as: "e",
              cond: {
                $and: [
                  { $gte: ["$$e.created_at", start] },
                  { $lt: ["$$e.created_at", end] },
                ],
              },
            },
          },
        },
      },

      {
        $facet: {
          // still useful to show order-wise info when "All" is selected
          perBlock: [
            {
              $project: {
                name: 1,
                order: 1,
                clicks: { $size: { $ifNull: ["$events", []] } }, // Views
                visitors: {
                  $size: {
                    $setUnion: [
                      {
                        $map: {
                          input: { $ifNull: ["$events", []] },
                          as: "a",
                          in: "$$a.ip",
                        },
                      },
                      [],
                    ],
                  },
                },
              },
            },
            { $sort: { order: 1 } },
          ],

          // Totals for the selected scope (All blocks or a single block)
          totals: [
            { $unwind: { path: "$events", preserveNullAndEmptyArrays: true } },
            {
              $group: {
                _id: null,
                clicks: {
                  $sum: {
                    $cond: [{ $ifNull: ["$events", false] }, 1, 0],
                  },
                },
                ips: { $addToSet: "$events.ip" },
              },
            },
            {
              $project: {
                _id: 0,
                clicks: 1,
                visitors: { $size: { $ifNull: ["$ips", []] } },
              },
            },
          ],

          // Top Cities (within range)
          topCities: [
            { $unwind: { path: "$events", preserveNullAndEmptyArrays: false } },
            {
              $match: {
                "events.city": { $nin: [null, "", "Unknown", "undefined"] },
              },
            },
            {
              $group: {
                _id: "$events.city",
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1, _id: 1 } },
            { $limit: 10 },
            { $project: { _id: 0, name: "$_id", count: 1 } },
          ],

          // Top States/Regions (within range)
          topStates: [
            { $unwind: { path: "$events", preserveNullAndEmptyArrays: false } },
            {
              $match: {
                "events.region": { $nin: [null, "", "Unknown", "undefined"] },
              },
            },
            {
              $group: {
                _id: "$events.region",
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1, _id: 1 } },
            { $limit: 10 },
            { $project: { _id: 0, name: "$_id", count: 1 } },
          ],
        },
      },
      {
        $project: {
          perBlock: 1,
          totals: {
            $ifNull: [{ $arrayElemAt: ["$totals", 0] }, { clicks: 0, visitors: 0 }],
          },
          topCities: 1,
          topStates: 1,
        },
      },
    ]);

    res.json(
      results[0] || {
        perBlock: [],
        totals: { clicks: 0, visitors: 0 },
        topCities: [],
        topStates: [],
      }
    );
  } catch (err) {
    console.error("POST /analytics/blocks error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


// Index sync For all models
// const models = [User, Bookings, Block, FormsData, ActionLock];
// for (const model of models) {
//   await model.syncIndexes();
//   console.log(`✓ Synced indexes for ${model.collection.name}`);
// }

router.post("/product-analytics/table", authenticateToken, async (req, res) => {
  try {
    const userId =
      req.user?.id ||
      req.user?.user_id ||
      req.headers["x-user-id"];

    if (!userId) return res.status(400).json({ message: "user_id header is required" });

    const pipeline = [
      { $match: { is_del: { $ne: true }, user_id: new mongoose.Types.ObjectId(userId) } },
      {
        $project: {
          title: 1,
          imageUrl: 1,
          productUrl: 1,
          image_last_checked: 1,
          updated_at: 1,
          created_at: 1,
          clicks: { $size: { $ifNull: ["$link_click_analytics", []] } },
          visitors: {
            $size: {
              $setDifference: [
                {
                  $setUnion: [
                    {
                      $map: {
                        input: { $ifNull: ["$link_click_analytics", []] },
                        as: "lc",
                        in: "$$lc.ip",
                      },
                    },
                    [],
                  ],
                },
                [null, ""],
              ],
            },
          },
        },
      },
      { $sort: { created_at: -1 } },
    ];

    const docs = await Product.aggregate(pipeline);

    // Return data immediately
    res.json({ ok: true, data: docs });

    // Validate and refresh images in background (non-blocking)
    setImmediate(async () => {
      try {
        const bulkOperations = [];
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        for (const doc of docs) {
          // Only check images that haven't been validated in last 7 days
          if (!doc.imageUrl || (doc.image_last_checked && doc.image_last_checked > sevenDaysAgo)) {
            continue;
          }

          // Wrap per-doc work in try/catch so a single failure can't create a malformed op
          try {
            const isValid = await isImageUrlValid(doc.imageUrl);

            if (!isValid && doc.productUrl) {
              const newImageUrl = await scrapeProductImage(doc.productUrl);

              if (newImageUrl && newImageUrl !== doc.imageUrl) {
                bulkOperations.push({
                  updateOne: {
                    filter: { _id: doc._id },
                    update: {
                      $set: {
                        imageUrl: newImageUrl,
                        image_last_checked: new Date(),
                        updated_at: new Date()
                      }
                    }
                  }
                });
              } else {
                // Mark as checked even if scrape failed
                bulkOperations.push({
                  updateOne: {
                    filter: { _id: doc._id },
                    update: {
                      $set: {
                        image_last_checked: new Date()
                      }
                    }
                  }
                });
              }
            } else if (isValid) {
              // Mark valid images as checked
              bulkOperations.push({
                updateOne: {
                  filter: { _id: doc._id },
                  update: {
                    $set: {
                      image_last_checked: new Date()
                    }
                  }
                }
              });
            } else {
              // Case: !isValid && !doc.productUrl -> still mark checked
              bulkOperations.push({
                updateOne: {
                  filter: { _id: doc._id },
                  update: {
                    $set: {
                      image_last_checked: new Date()
                    }
                  }
                }
              });
            }
          } catch (perDocErr) {
            // Log but continue processing other docs
            console.error(`Error checking image for product ${doc._id}:`, perDocErr);
            // As a fallback, mark image as checked to avoid repeated failures,
            // or you could skip this — choose what's best for your product.
            bulkOperations.push({
              updateOne: {
                filter: { _id: doc._id },
                update: {
                  $set: { image_last_checked: new Date() }
                }
              }
            });
          }
        }

        // Sanitize operations: remove any malformed ops that don't have update operators
        const sanitized = bulkOperations.filter(op => {
          try {
            if (!op || !op.updateOne || !op.updateOne.update) return false;
            const updateKeys = Object.keys(op.updateOne.update);
            // At least one update key must start with $
            return updateKeys.some(k => typeof k === "string" && k.startsWith("$"));
          } catch (e) {
            return false;
          }
        });

        // Log the count difference so you can detect lost/invalid ops
        if (sanitized.length !== bulkOperations.length) {
          console.warn(`Dropped ${bulkOperations.length - sanitized.length} malformed bulk ops before bulkWrite.`);
          // Optional: persist malformed ops somewhere for inspection
          // console.log('Malformed ops:', bulkOperations.filter(op => !sanitized.includes(op)));
        }

        if (sanitized.length > 0) {
          await Product.bulkWrite(sanitized);
          console.log(`Background: Updated ${sanitized.length} product images`);
        } else {
          console.log("Background: No valid product image updates to apply");
        }
      } catch (bgErr) {
        console.error("Background image refresh error:", bgErr);
      }
    });

  } catch (err) {
    console.error("/product-analytics/table error", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});



router.post("/product-analytics/details", authenticateToken, async (req, res) => {
  try {
     const userId =
      req.user?.id ||
      req.user?.user_id ||
      req.headers["x-user-id"];
    const { productId, rangeKey = "last7" } = req.body || {};
    if (!userId) return res.status(400).json({ message: "user_id header is required" });
    if (!productId) return res.status(400).json({ message: "productId is required" });

    const range = await getDateRange(rangeKey);
    const matchBase = { _id: new mongoose.Types.ObjectId(productId), user_id: new mongoose.Types.ObjectId(userId), is_del: { $ne: true } };

    // Fetch basic product
    const product = await Product.findOne(matchBase, { title: 1 }).lean();
    if (!product) return res.status(404).json({ message: "Product not found" });

    const dateMatch = range
      ? { "link_click_analytics.created_at": { $gte: range.start, $lt: range.end } }
      : {};

    // clicks (count events) + visitors (unique IPs)
    const clicksVisitors = await Product.aggregate([
      { $match: matchBase },
      { $unwind: "$link_click_analytics" },
      ...(range ? [{ $match: dateMatch }] : []),
      {
        $group: {
          _id: null,
          clicks: { $sum: 1 },
          ips: { $addToSet: "$link_click_analytics.ip" },
        },
      },
      { $project: { _id: 0, clicks: 1, visitors: { $size: "$ips" } } },
    ]);

    const summary = clicksVisitors[0] || { clicks: 0, visitors: 0 };

    // Top 10 Cities (by unique visitors/IP)
    const topCities = await Product.aggregate([
      { $match: matchBase },
      { $unwind: "$link_click_analytics" },
      ...(range ? [{ $match: dateMatch }] : []),
      {
        $group: {
          _id: { city: "$link_click_analytics.city", ip: "$link_click_analytics.ip" },
        },
      },
      { $group: { _id: "$_id.city", visitors: { $sum: 1 } } },
      { $project: { _id: 0, name: { $ifNull: ["$_id", "Unknown"] }, visitors: 1 } },
      { $sort: { visitors: -1 } },
      { $limit: 10 },
    ]);

    // Top 10 States/Regions (by unique visitors/IP)
    const topStates = await Product.aggregate([
      { $match: matchBase },
      { $unwind: "$link_click_analytics" },
      ...(range ? [{ $match: dateMatch }] : []),
      {
        $group: {
          _id: { state: "$link_click_analytics.region", ip: "$link_click_analytics.ip" },
        },
      },
      { $group: { _id: "$_id.state", visitors: { $sum: 1 } } },
      { $project: { _id: 0, name: { $ifNull: ["$_id", "Unknown"] }, visitors: 1 } },
      { $sort: { visitors: -1 } },
      { $limit: 10 },
    ]);

    res.json({
      ok: true,
      data: {
        product: { id: productId, title: product.title },
        range: rangeKey,
        summary,
        topCities,
        topStates,
      },
    });
  } catch (err) {
    console.error("/product-analytics/details error", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});



router.get('/store-status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id || req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing user id' });
    }

    // Only fetch the one field; use bracket notation because of the hyphen in the key.
    const user = await USER.findById(
      userId,
      { ['store_enabled']: 1 }, // projection
    ).lean();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const enabled = Boolean(user?.['store_enabled']);
    return res.json({ enabled });
  } catch (err) {
    console.error('GET /store-status failed:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/dm-inbox-status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id || req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing user id' });
    }

    // Only fetch the one field; use bracket notation because of the hyphen in the key.
    const user = await USER.findById(
      userId,
      { ['dm_enabled']: 1 },
    ).lean();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const enabled = Boolean(user?.['dm_enabled']);
    return res.json({ enabled });
  } catch (err) {
    console.error('GET /store-status failed:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post("/enable-dm-inbox", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Accept { enabled: true/false } in body; default to true if not provided
    const { enabled = true } = req.body ?? {};

    // validate boolean-ish values
    const dmEnabled = enabled === true || enabled === "true" || enabled === 1 || enabled === "1";

    // Update the user's document
    const update = { $set: { dm_enabled: dmEnabled } };

    // findOneAndUpdate returns the previous by default; pass { new: true } to get updated document
    const updated = await USER.findOneAndUpdate(
      { _id: userId },
      update,
      { new: true, projection: { dm_enabled: 1, _id: 0 } }
    ).lean();

    if (!updated) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({ success: true, enabled: Boolean(updated.dm_enabled) });
  } catch (err) {
    console.error("POST /enable-dm-inbox error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/conversations/find-or-create", authenticateParticipant, async (req, res) => {
  try {
    const { subdomain } = req.body || {};
    if (!subdomain) return res.status(400).json({ error: "subdomain required" });

    const influencer = await USER.findOne({ handleUserName: subdomain }).lean();
    if (!influencer) return res.status(404).json({ error: "influencer not found" });

    // participant id strictly from authenticateParticipant (ParticipantUser)
    const participantIdRaw = req.user?.user_id;
    if (!participantIdRaw || !mongoose.Types.ObjectId.isValid(participantIdRaw)) {
      return res.status(401).json({ error: "participant not authenticated" });
    }

    const influencerId = String(influencer._id);
    const participantId = String(participantIdRaw);

    if (influencerId === participantId) {
      return res.status(400).json({ error: "cannot create conversation with yourself" });
    }

    // Build actor keys and sorted key used by the unique index
    const infKey = actorKey("User", influencerId);
    const memKey = actorKey("ParticipantUser", participantId);
    const participant_keys_sorted = [infKey, memKey].sort().join("|");

    // Find existing DM by unique compound index
    const existing = await Conversation.findOne({
      participant_keys_sorted,
      conversation_type: "dm",
      is_deleted: { $ne: true },
    }).lean();

    if (existing) {
      return res.json({ conversation: existing });
    }

    // Create DM participants using new ActorSubSchema shape
    const participants = [
      {
        actor: { model: "User", id: new mongoose.Types.ObjectId(influencerId) },
        role: "influencer",
        joined_at: new Date(),
        last_read_at: null,
        last_read_message_id: null,
        muted: false,
      },
      {
        actor: { model: "ParticipantUser", id: new mongoose.Types.ObjectId(participantId) },
        role: "member",
        joined_at: new Date(),
        last_read_at: null,
        last_read_message_id: null,
        muted: false,
      },
    ];

    const toInsert = {
      participants,
      participant_keys_sorted,
      conversation_type: "dm",
      last_message: null,
      last_message_text: "",
      last_message_at: null,
      message_count: 0,
      // unread_counts map must use the actorKey strings as keys
      unread_counts: {
        [infKey]: 0,
        [memKey]: 0,
      },
      metadata: { title: null, tags: [], pinned: false },
      is_deleted: false,
    };

    let convo = null;
    try {
      convo = await Conversation.create(toInsert);
    } catch (err) {
      // Handle race: unique index on (participant_keys_sorted, conversation_type)
      if (err && err.code === 11000) {
        const again = await Conversation.findOne({
          participant_keys_sorted,
          conversation_type: "dm",
          is_deleted: { $ne: true },
        }).lean();
        if (again) return res.json({ conversation: again });
      }
      throw err;
    }

    return res.json({ conversation: convo });
  } catch (err) {
    console.error("POST /usersOn/conversations/find-or-create error:", err);
    return res.status(500).json({ error: "internal", details: err.message });
  }
});

router.get("/messages/:conversationId", authenticateParticipant, async (req, res) => {
  try {
    const { conversationId } = req.params;

    if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ error: "invalid conversation id" });
    }

    // ParticipantUser id from auth
    const participantId = req.user?.user_id;
    if (!participantId || !mongoose.Types.ObjectId.isValid(participantId)) {
      return res.status(401).json({ error: "unauthenticated" });
    }

    // Ensure requester is a participant (by ActorSubSchema fields)
    const convo = await Conversation.findOne({
      _id: conversationId,
      "participants.actor.model": "ParticipantUser",
      "participants.actor.id": new mongoose.Types.ObjectId(participantId),
      is_deleted: { $ne: true },
    })
      .select("_id participants conversation_type metadata")
      .lean();

    if (!convo) {
      return res.status(403).json({ error: "not authorized for this conversation" });
    }

    // Identify influencer & member from participants
    const participantsArr = Array.isArray(convo.participants) ? convo.participants : [];

    // Influencer: role === "influencer" OR actor.model === "User"
    const influencerEntry =
      participantsArr.find((p) => p.role === "influencer") ||
      participantsArr.find((p) => p.actor?.model === "User");

    // Member: actor.model === "ParticipantUser" && id == requester
    const participantEntry = participantsArr.find(
      (p) =>
        p.actor?.model === "ParticipantUser" &&
        String(p.actor?.id) === String(participantId)
    );

    const influencerId = influencerEntry ? String(influencerEntry.actor?.id) : null;
    const memberId = participantEntry ? String(participantEntry.actor?.id) : String(participantId);

    if (!influencerId || !memberId) {
      return res.status(500).json({ error: "conversation participants malformed" });
    }

    // Fetch messages for this conversation
    const docs = await Message.find({
      conversation: new mongoose.Types.ObjectId(conversationId),
      is_deleted: { $ne: true },
    })
      .sort({ createdAt: 1 })
      .select("_id text createdAt conversation sender sender_key attachments status")
      .lean();

    const messages = docs.map((d) => {
      const s = d.sender || null; // { model, id }
      const sModel = s?.model;
      const sId = s?.id ? String(s.id) : null;

      const senderRole =
        sModel === "User" && sId === influencerId
          ? "influencer"
          : sModel === "ParticipantUser" && sId === memberId
          ? "member"
          : undefined;

      return {
        _id: d._id,
        text: d.text || "",
        createdAt: d.createdAt,
        conversation: { _id: String(conversationId) },
        sender: s
          ? { model: sModel, id: sId }
          : undefined,
        senderRole,
        // include if you want on client:
        // attachments: d.attachments || [],
        // status: d.status,
      };
    });

    return res.json({ messages });
  } catch (err) {
    console.error("GET /usersOn/messages/:conversationId error:", err);
    return res.status(500).json({ error: "internal", details: err.message });
  }
});


router.post("/influencer/messages", authenticateToken, async (req, res) => {
  try {
    const user_id = req.user?.user_id || req.user?.id || req.user?._id;
    let { limit = 200, skip = 0 } = req.body || {};
    limit = Math.min(parseInt(limit, 10) || 200, 1000);
    skip = parseInt(skip, 10) || 0;

    if (!user_id || !mongoose.Types.ObjectId.isValid(user_id)) {
      return res.status(400).json({ error: "user_id required and must be valid" });
    }

    const influencerObjectId = new mongoose.Types.ObjectId(user_id);
    const participantCollection = "participant_user";

    const pipeline = [
      { $match: { is_deleted: false } },

      // Join the conversation
      {
        $lookup: {
          from: "conversations",
          localField: "conversation",
          foreignField: "_id",
          as: "conversation"
        }
      },
      { $unwind: { path: "$conversation", preserveNullAndEmptyArrays: false } },

      // Filter to only messages in conversations owned by the authenticated creator
      // and only incoming messages (not sent by the creator themselves)
      {
        $match: {
          $and: [
            // Ownership check: conversation must belong to the authenticated user
            { "conversation.creatorId": influencerObjectId },
            {
              $or: [
                {
                  recipients: {
                    $elemMatch: {
                      model: "User",
                      id: influencerObjectId
                    }
                  }
                },
                {
                  "conversation.participants": {
                    $elemMatch: {
                      "actor.model": "User",
                      "actor.id": influencerObjectId
                    }
                  }
                }
              ]
            },
            {
              $or: [
                { "sender.model": { $ne: "User" } },
                { "sender.id": { $ne: influencerObjectId } }
              ]
            }
          ]
        }
      },

      // Sort newest first, then group to pick the latest per conversation
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$conversation._id",
          doc: { $first: "$$ROOT" }
        }
      },
      { $replaceRoot: { newRoot: "$doc" } },

      // Pagination
      { $skip: skip },
      { $limit: limit },

      // Look up sender details
      {
        $lookup: {
          from: "users",
          let: { sid: "$sender.id", smodel: "$sender.model" },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ["$$smodel", "User"] }, { $eq: ["$_id", "$$sid"] }] } } },
            { $project: { _id: 1, name: 1, fullName: 1, handleUserName: 1, email: 1 } }
          ],
          as: "user_sender"
        }
      },
      { $unwind: { path: "$user_sender", preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: participantCollection,
          let: { sid: "$sender.id", smodel: "$sender.model" },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ["$$smodel", "ParticipantUser"] }, { $eq: ["$_id", "$$sid"] }] } } },
            { $project: { _id: 1, name: 1, fullName: 1, username: 1, email: 1 } }
          ],
          as: "participant_sender"
        }
      },
      { $unwind: { path: "$participant_sender", preserveNullAndEmptyArrays: true } },

      // Build robust name fallback
      {
        $addFields: {
          from_name: {
            $ifNull: [
              { $ifNull: ["$participant_sender.name", "$participant_sender.fullName"] },
              {
                $ifNull: [
                  { $ifNull: ["$user_sender.name", "$user_sender.fullName"] },
                  {
                    $ifNull: [
                      "$participant_sender.username",
                      { $ifNull: ["$user_sender.handleUserName", { $ifNull: ["$participant_sender.email", "$user_sender.email"] }] }
                    ]
                  }
                ]
              }
            ]
          }
        }
      },

      {
        $project: {
          _id: 1,
          conversation_id: "$conversation._id",
          sender: "$sender",
          text: 1,
          createdAt: 1,
          from_name: 1,
          // NEW: Include category fields
          category: "$conversation.category",
          category_confidence: "$conversation.category_confidence",
          category_analyzed_at: "$conversation.category_analyzed_at"
        }
      }
    ];

    const results = await Message.aggregate(pipeline).exec();

    const rows = results.map((m) => ({
      _id: m._id,
      conversation_id: m.conversation_id ? String(m.conversation_id) : null,
      from_id: m?.sender?.id ? String(m.sender.id) : null,
      from_model: m?.sender?.model || null,
      from_name: m.from_name || "Unknown",
      text: m.text || "",
      created_at: m.createdAt || null,
      // NEW: Include category data
      category: m.category || "Uncategorized",
      category_confidence: m.category_confidence || null,
      category_analyzed_at: m.category_analyzed_at || null
    }));

    return res.json({ ok: true, conversations: rows, total: rows.length });
  } catch (err) {
    console.error("POST /influencer/messages error:", err);
    return res.status(500).json({ error: "internal", details: err.message });
  }
});

router.post("/enable-store", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Accept { enabled: true/false } in body; default to true if not provided
    const { enabled = true } = req.body ?? {};

    // validate boolean-ish values
    const storeEnabled = enabled === true || enabled === "true" || enabled === 1 || enabled === "1";

    // Update the user's document
    const update = { $set: { store_enabled: storeEnabled } };

    // findOneAndUpdate returns the previous by default; pass { new: true } to get updated document
    const updated = await USER.findOneAndUpdate(
      { _id: userId },
      update,
      { new: true, projection: { store_enabled: 1, _id: 0 } }
    ).lean();

    if (!updated) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({ success: true, enabled: Boolean(updated.store_enabled) });
  } catch (err) {
    console.error("POST /enable-store error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/product-click-analytics", async (req, res) => {
  try {

    const { link_key } = req.body || {};
    if (!link_key) return res.status(400).json({ error: "link_key required" });

    // find block exists (quick check). You can also do the update blindly and check modifiedCount.
    const productExists = await Product.exists({ _id: link_key });
    if (!productExists) return res.status(404).json({ error: "block not found" });

    // get client info
    const ip = await getClientIp(req);
    const userAgent = req.headers["user-agent"] || null;
    const referrer = req.headers["referer"] || req.headers["referrer"] || null;
    const geo = await lookupGeo_ipdata(ip);

    const analyticsEntry = {
      ip: geo.ip || null,
      user_agent: userAgent,
      referrer: referrer,
      country: geo?.country || null,
      country_code: geo?.country || geo?.country_code || null,
      region: geo?.region || null,
      city: geo?.city || null,
      postal: geo?.postal || null,
      latitude: geo?.latitude || null,
      longitude: geo?.longitude || null,
    };

    // atomic push into the array
    const updateResult = await Product.updateOne(
      { _id: link_key },
      { $push: { link_click_analytics: analyticsEntry } }
    );

    if (updateResult.matchedCount === 0) {
      return res.status(404).json({ error: "block not found (race?)" });
    }

    return res.status(201).json({ ok: true, analytics: analyticsEntry });
  } catch (err) {
    console.error("Error saving link click analytics:", err);
    return res.status(500).json({ message: "Failed to save link click analytics" });
  }
});

router.get("/product-categories", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const search = (req.query.search || "").trim();
    const safe = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const q = {
      user_id: userId,
      is_del: { $ne: true },
      ...(search ? { name: { $regex: safe, $options: "i" } } : {}),
    };

    const items = await ProductCategory.find(q)
      .sort({ name: 1 })
      .limit(50)
      .lean();

    res.json({ data: items });
  } catch (e) {
    res.status(500).json({ message: "Failed to fetch categories" });
  }
});

router.post("/product-categories", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const name = (req.body?.name || "").trim();
    if (!name) return res.status(400).json({ message: "name required" });

    // Check if category exists for THIS user (active one; allow reusing soft-deleted name by reviving it)
    let existing = await ProductCategory.findOne({
      user_id: userId,
      name: new RegExp(`^${escapeRegex(name)}$`, "i"),
    });

    if (existing) {
      // If it was soft-deleted, revive it
      if (existing.is_del) {
        existing.is_del = false;
        existing.updatedAt = new Date();
        await existing.save();
      }
      return res.json({ category: existing });
    }

    const created = await ProductCategory.create({
      user_id: userId,
      name,
    });

    res.json({ category: created });
  } catch (e) {
    // If you adopt a compound unique index, surfacing 11000 is useful
    if (e?.code === 11000) {
      return res.status(409).json({ message: "Category already exists" });
    }
    res.status(500).json({ message: e.message || "Failed to create category" });
  }
});


router.get("/fetch-blocks", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;

    if (!userId) return res.status(401).json({ error: "Unauthenticated" });

    const q = { user_id: userId, archived: false, is_del: false };
    if (req.query.type) q.type = req.query.type;

    const blocks = await Block.find(q).sort({ order: 1 }).lean().exec();

    // Normalize to frontend-friendly shape if you like
    const normalized = blocks.map((b) => ({
      id: b._id,
      name: b.name,
      action: b.action,
      type: b.type,
      order: b.order,
      created_at: b.created_at,
      updated_at: b.updated_at,
      raw: b,
    }));

    return res.json(normalized);
  } catch (err) {
    console.error("GET /api/blocks error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/save-blocks", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    if (!userId) return res.status(401).json({ error: "Unauthenticated" });

    const { name, action, type = "link", fields, newsletterText, duration, description, bufferTime, interactionType, pricing } = req.body;

    // Basic validation: name always required
    if (!name || !name.trim()) return res.status(400).json({ error: "name is required" });

    // Update allowed types to include booking
    const allowed = ["link", "video", "product", "store", "form", "cta", "newsletter", "booking"];
    if (!allowed.includes(type)) return res.status(400).json({ error: "invalid type" });

    // If it's a form, expect an array of fields
    let normalizedFields = undefined;
    if (type === "form") {
      if (fields !== undefined) {
        if (!Array.isArray(fields)) return res.status(400).json({ error: "fields must be an array" });
        
        normalizedFields = fields.map((f, i) => {
          const key = (f.key || f.name || `field_${i}`).toString();
          const label = (f.label || "").toString();
          const ftype = (f.type || "text").toString();
          const placeholder = f.placeholder ? String(f.placeholder) : "";
          const required = !!f.required;

          if (!label || !label.trim()) throw { status: 400, message: `field ${i} missing label` };

          // Updated supported types to include checkbox and select
          const supportedTypes = ["text", "email", "tel", "textarea", "number", "radio", "checkbox", "select"];
          if (!supportedTypes.includes(ftype)) throw { status: 400, message: `field ${i} has invalid type: ${ftype}` };

          let options = undefined;
          // Handle options for radio, checkbox, and select
          if (ftype === "radio" || ftype === "checkbox" || ftype === "select") {
            if (f.options === undefined) {
              throw { status: 400, message: `field ${i} (${ftype}) missing options` };
            }
            if (Array.isArray(f.options)) {
              options = f.options.map((o) => String(o).trim()).filter(Boolean);
            } else if (typeof f.options === "string") {
              options = f.options.split(",").map((s) => s.trim()).filter(Boolean);
            } else {
              throw { status: 400, message: `field ${i} (${ftype}) options must be array or comma string` };
            }
            if (options.length === 0) throw { status: 400, message: `field ${i} (${ftype}) requires at least one option` };
          }

          const normalized = { 
            key, 
            label: label.trim(), // Supports multiline questions now
            type: ftype, 
            placeholder, 
            required 
          };
          
          if (options !== undefined) normalized.options = options;
          
          // For checkbox type, add multiple selection config
          if (ftype === "checkbox") {
            normalized.multiple = true;
            if (f.minSelections !== undefined) {
              normalized.minSelections = parseInt(f.minSelections) || 0;
            }
            if (f.maxSelections !== undefined) {
              normalized.maxSelections = parseInt(f.maxSelections) || (options ? options.length : undefined);
            }
          }
          
          return normalized;
        });
      } else {
        normalizedFields = [];
      }
    } 
    // Handle booking type
    else if (type === "booking") {
      // Validate booking-specific fields
      if (!duration) {
        return res.status(400).json({ error: "Duration is required for booking block" });
      }

      const bookingConfig = {
        duration: String(duration),
        description: description ? String(description).trim() : "",
        bufferTime: bufferTime ? String(bufferTime) : "0",
        interactionType: interactionType ? String(interactionType) : "voice",
        pricing: pricing ? Number(pricing) : 0,
      };

      // Store as normalized fields
      normalizedFields = fields && Array.isArray(fields) ? fields.map((f) => ({
        label: f.label || "",
        value: f.value || "",
        type: f.type || "text",
      })) : [
        { label: "Duration", value: bookingConfig.duration, type: "duration" },
        { label: "Description", value: bookingConfig.description, type: "text" },
        { label: "Buffer Time", value: bookingConfig.bufferTime, type: "buffer" },
        { label: "Interaction Type", value: bookingConfig.interactionType, type: "text" },
      ];
    }
    else {
      // non-form/non-booking: action required except for newsletter
      if (type !== "newsletter") {
        if (!action || !action.trim()) return res.status(400).json({ error: "action (URL or text) is required for this block type" });
      }
    }

    // If newsletter: newsletterText is required
    if (type === "newsletter") {
      if (!newsletterText || !String(newsletterText).trim()) {
        return res.status(400).json({ error: "newsletterText is required for newsletter block" });
      }
    }

    // Compute new order: put at the end
    const last = await Block.findOne({ user_id: userId }).sort({ order: -1 }).select("order").lean().exec();
    const newOrder = last ? last.order + 100 : 100;

    const payload = {
      user_id: userId,
      name: name.trim(),
      action: (action && action.trim()) || (type === "newsletter" ? String(newsletterText).trim() : ""),
      type,
      order: newOrder,
      created_at: new Date(),
      updated_at: new Date(),
    };

    if (type === "form") {
      payload.fields = normalizedFields;
      payload.action = JSON.stringify({ fields: normalizedFields });
    }

    if (type === "booking") {
      payload.fields = normalizedFields;
      payload.duration = parseInt(duration);
      payload.bufferTime = parseInt(bufferTime || "0");
      payload.description = description || "";
      payload.interactionType = interactionType || "voice";
      payload.pricing = pricing || 0;
      
      payload.action = JSON.stringify({
        duration: duration,
        description: description || "",
        bufferTime: bufferTime || "0",
        interactionType: interactionType || "voice",
        pricing: pricing || 0,
        fields: normalizedFields,
      });
    }

    // If newsletter, create newsletters collection entry
    if (type === "newsletter") {
      try {
        await NewsletterModel.create({
          user_id: userId,
          newsletterText: String(newsletterText).trim(),
          created_at: new Date(),
          updatedAt: new Date(),
        });
      } catch (e) {
        console.error("Failed to create newsletter record:", e);
        return res.status(500).json({ error: "Failed to save newsletter" });
      }
    }

    // Create the block document
    const doc = await Block.create(payload);

    // Return normalized created block
    return res.status(201).json({
      _id: doc._id,
      id: doc._id,
      name: doc.name,
      action: doc.action,
      type: doc.type,
      order: doc.order,
      fields: doc.fields, // Include fields in response
      duration: doc.duration,
      bufferTime: doc.bufferTime,
      interactionType: doc.interactionType,
      pricing: doc.pricing,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    });
  } catch (err) {
    if (err && err.status && err.message) {
      return res.status(err.status).json({ error: err.message });
    }

    console.error("POST /api/blocks error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// router.get for fetching booked slots
router.get("/bookings/available-slots", async (req, res) => {
  try {
    const { user_id, date } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: "block_id is required" });
    }

    if (!date) {
      return res.status(400).json({ error: "date is required" });
    }

    // Parse the date and get start and end of day
    const selectedDate = new Date(date);
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Find all bookings for this block_id on the selected date
    const bookedSlots = await Bookings.find({
      user_id,
      selected_date: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
      is_del: false,
    })
      .select("selected_timeSlot")
      .lean();

    // Extract just the time slots
    const bookedTimeSlots = bookedSlots.map((booking) => booking.selected_timeSlot);

    return res.status(200).json({
      success: true,
      date: date,
      bookedSlots: bookedTimeSlots,
    });
  } catch (err) {
    console.error("GET /bookings/available-slots error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});



router.delete('/delete-block/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const blockId = req.params.id;
    if (!blockId) return res.status(400).json({ success: false, message: 'Block id missing' });

    const block = await Block.findOne({ _id: blockId, user_id: userId }).lean();
    if (!block) return res.status(404).json({ success: false, message: 'Block not found' });

    await Block.deleteOne({ _id: blockId, user_id: userId });

    return res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    console.error('delete-block error', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get("/verify-login-token", authenticateToken, (req, res) => {
  if (!req.user) {
    return res.status(401).json({ valid: false });
  }
  return res.status(200).json({ valid: true, user: req.user });
  
});

router.get("/verify-participant-login-token", authenticateParticipant, (req, res) => {
  if (!req.user) {
    return res.status(401).json({ valid: false });
  }
  return res.status(200).json({ valid: true, user: req.user });
  
});


router.post("/user-login-gmail", async (req, res) => {
  try {
    // Rate limit: 10 logins per 15 minutes per IP
    const _loginIp = await getClientIp(req);
    const _loginAllowed = await checkRateLimit(`auth:user-login:${_loginIp}`, 10, 15 * 60 * 1000);
    if (!_loginAllowed) return res.status(429).json({ message: "Too many login attempts. Please try again later." });

    const { email, firstName, lastName, picture } = req.body;

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

    res.cookie("tokenMyhandleProf", token, {
  httpOnly: true,
  secure: true,                  // required when SameSite=None
  sameSite: "none",              // critical for iOS/Safari & any cross-site/iframe usage
   domain: ".chomske.com",// needed if crossing subdomains
  path: "/",             // ensure all routes get it
  maxAge: 3 * 24 * 60 * 60 * 1000   // 3 days — matches JWT expiry
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
    console.error("Login error:", error.message);
    return res.status(500).json({ error: "Internal server error", message: "An error occurred" });
  }
});

// ── Magic Link: Generate token for WhatsApp template links ──
router.post("/generate-magic-token", authenticateToken, async (req, res) => {
  try {
    const { user_id, chatUsername } = req.body;

    if (!user_id) {
      return res.status(400).json({ message: "user_id is required" });
    }

    const user = await USER.findById(user_id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000); // 2 hours

    await MagicToken.create({
      token,
      user_id: user._id,
      expires_at,
      chatUsername: chatUsername || null,
    });

    const magicLink = `https://chomske.com/professional/business/inbox?token=${token}`;

    return res.status(200).json({ success: true, magicLink, token });
  } catch (error) {
    console.error("Generate magic token error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── Magic Link: Validate token and issue short-lived session ──
router.post("/magic-login", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Token is required" });
    }

    const magicToken = await MagicToken.findOne({ token });

    if (!magicToken) {
      return res.status(401).json({ message: "Invalid or expired link" });
    }

    if (magicToken.used) {
      return res.status(401).json({ message: "This link has already been used" });
    }

    if (new Date() > magicToken.expires_at) {
      return res.status(401).json({ message: "This link has expired" });
    }

    // Mark token as used (one-time use)
    magicToken.used = true;
    await magicToken.save();

    const user = await USER.findById(magicToken.user_id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate a short-lived JWT (2 hours)
    const { randomUUID: _uuid } = await import("crypto");
    const jwtToken = jwt.sign(
      { user_id: user._id, user_email: user.email, jti: _uuid() },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    res.cookie("tokenMyhandleProf", jwtToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      domain: ".chomske.com",
      path: "/",
      maxAge: 2 * 60 * 60 * 1000, // 2 hours
    });

    return res.status(200).json({
      success: true,
      message: "Magic link login successful",
      user: {
        user_id: user._id,
        user_email: user.email,
      },
      chatUsername: magicToken.chatUsername || null,
    });
  } catch (error) {
    console.error("Magic login error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/participant-user-login-gmail", async (req, res) => {
  try {
    // Rate limit: 10 logins per 15 minutes per IP
    const _partIp = await getClientIp(req);
    const _partAllowed = await checkRateLimit(`auth:participant-login:${_partIp}`, 10, 15 * 60 * 1000);
    if (!_partAllowed) return res.status(429).json({ message: "Too many login attempts. Please try again later." });

    const { email, firstName, lastName, picture } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    let user = await ParticipantUser.findOne({ email });
    let wasNew = false;

    if (!user) {
      user = await ParticipantUser.create({
        email,
        name: `${firstName || ""} ${lastName || ""}`.trim(),
        picture,
        is_google_user: true,
      });
      wasNew = true;
    }

    const token = await generateJWTtoken(user._id, user.email);

    // Cookie options: adjust for your environment (see notes below)
  res.cookie("tokenParticipantMyHandle", token, {
  httpOnly: true,
  secure: true,                  // required when SameSite=None
  sameSite: "none",              // critical for iOS/Safari & any cross-site/iframe usage
   domain: ".chomske.com",// needed if crossing subdomains
  path: "/",             // ensure all routes get it
  maxAge: 3 * 24 * 60 * 60 * 1000   // 3 days — matches JWT expiry
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
    console.error("Login error:", error.message);
    return res.status(500).json({ error: "Internal server error", message: "An error occurred" });
  }
});

router.post("/save-username", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;

    if (!userId) return res.status(401).json({ success: false, message: "Unauthenticated" });

    let { handleUserName, goal } = req.body || {};
    if (!handleUserName || typeof handleUserName !== "string") {
      return res.status(400).json({ success: false, message: "handleUserName is required" });
    }

    // sanitize & normalize
    handleUserName = handleUserName.trim().toLowerCase();

    // validate same pattern as frontend
    const usernameRegex = /^[a-zA-Z0-9._-]{3,30}$/;
    if (!usernameRegex.test(handleUserName)) {
      return res.status(400).json({ success: false, message: "Invalid username format" });
    }

    // check uniqueness (exclude current user)
    const existing = await USER.findOne({ handleUserName });
    if (existing && String(existing._id) !== String(userId)) {
      return res.status(409).json({ success: false, message: "Username already taken" });
    }

    // update current user
    const updated = await USER.findByIdAndUpdate(
      userId,
      { handleUserName, goal, updated_at: new Date(), handle_created:true },
      { new: true }
    ).select("-password"); // remove sensitive fields if any

    return res.json({ success: true, message: "Username saved", user: updated });
  } catch (err) {
    console.error("handle-username error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.get("/user/insta-details", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;

    if (!userId) return res.status(401).json({ error: "Unauthenticated" });

    const user = await USER.findById(userId).select("igName igProfilePic").lean();
    return res.json({ igName: user?.igName || [], igProfilePic: user?.igProfilePic || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/user/socials", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;

    if (!userId) return res.status(401).json({ error: "Unauthenticated" });

    const user = await USER.findById(userId).select("socials").lean();
    return res.json({ socials: user?.socials || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/user/socials", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;

    const { platform, url } = req.body;
    if (!platform || !url) return res.status(400).json({ error: "platform and url required" });

    const allowed = ["youtube", "twitter", "instagram", "linkedin", "whatsapp"];
    if (!allowed.includes(platform)) return res.status(400).json({ error: "invalid platform" });

    const user = await USER.findById(userId).select("socials");
    if (!user) return res.status(404).json({ error: "user not found" });

    // Case-insensitive duplicate check
    const exists = user.socials.some(s => String(s.platform).toLowerCase() === platform.toLowerCase());
    if (exists) return res.status(409).json({ error: "platform already added" });

    const socialObj = { platform, url, created_at: new Date() };
    user.socials.push(socialObj);
    await user.save();

    // return the new social (last item)
    const added = user.socials[user.socials.length - 1];
    return res.status(201).json({ social: added });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});


router.delete("/user/socials/:id", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;

    if (!userId) return res.status(401).json({ error: "Unauthenticated" });

    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "invalid id" });

    const user = await USER.findById(userId).exec();
    if (!user) return res.status(404).json({ error: "user not found" });

    user.socials = user.socials.filter((s) => String(s._id) !== String(id));
    await user.save();

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
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

      router.get('/check-handle-created', authenticateToken, async function (req, res){

    const userId = req.user?.user_id;

        if (!userId) {
          return res.status(400).json({ message: "Username is invalid." });
        }
  
    USER.findById(userId).then((result)=>{
  
      if(result.handle_created){
  
      res.status(200).send({ success: true });
      res.end();

  
      }
  
      else{
      res.status(200).send({ success: false });
      res.end();
  
      }
  
    }).catch(e2=>{
  
      console.error("❌ Error fetching campaign details:", e2);
      return res.status(500).json({ error: "Internal Server Error" });
  
    })
  });

  router.post('/update-profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;

    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { name, intro } = req.body;
    if (name === undefined && intro === undefined) return res.status(400).json({ success: false, message: 'Nothing to update' });

    const update = {};
    if (name !== undefined) update.name = String(name).trim();
    if (intro !== undefined) update.intro = String(intro).trim();
    update.updated_at = new Date();

    const user = await USER.findByIdAndUpdate(userId, update, { new: true, upsert: false }).lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    return res.json({ success: true, user });
  } catch (err) {
    console.error('update-profile error', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

  router.post('/update-block-order', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;

    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ success: false, message: 'Invalid payload' });

    // For safety only allow updating blocks belonging to this user
    const bulkOps = order.map((item) => {
      return {
        updateOne: {
          filter: { _id: item.id, user_id: userId },
          update: { $set: { order: parseInt(item.order, 10) || 0, updated_at: new Date() } },
        },
      };
    });

    if (bulkOps.length === 0) return res.json({ success: true, message: 'No changes' });

    const result = await Block.bulkWrite(bulkOps);
    return res.json({ success: true, result });
  } catch (err) {
    console.error('update-block-order error', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});


router.get("/profile", async (req, res) => {
  try {
    const host = req.headers["x-forwarded-host"] || req.headers.host || "";
    const inferred = extractHandleFromHost(host, ["chomske.com"]);
    const handle = (req.query.handle || inferred || "").trim().toLowerCase();

    if (!handle) return res.status(400).json({ error: "handle required" });

    const user = await USER.findOne({ handleUserName: handle }).lean();
    if (!user) return res.status(404).json({ error: "not found" });

    const blocks = await Block.find({ user_id: user._id, is_del: false })
      .sort({ order: 1, created_at: -1 })
      .lean();

    const { _id, __v, ...userRest } = user;
    const payload = {
      ...userRest,
      id: String(_id),
      blocks: blocks || [],
      socials: user.socials || [],
    };

    // === Analytics logging ===
    (async () => {
      try {
        const ip = await getClientIp(req);
        const ua = req.headers["user-agent"] || "";
        const ref = req.headers["referer"] || req.headers["referrer"] || "";

        const geo = await lookupGeo_ipdata(ip);

        let geoLanguages = [];
        try {
          const rawLangs = geo?.raw?.languages;
          if (Array.isArray(rawLangs) && rawLangs.length) {
            geoLanguages = rawLangs
              .map((l) => ({
                name: l?.name || l?.language || null,
                native: l?.native || null,
                code: l?.code || l?.iso || null,
              }))
              .filter(Boolean);
          }
        } catch (langErr) {
          console.warn("Failed to parse geo languages:", langErr?.message || langErr);
        }

        const eventDoc = {
          user_id: user._id,
          user_agent: ua,
          referrer: ref,
          ip: geo?.ip,
          country: geo?.country,
          region: geo?.region,
          city: geo?.city,
          postal: geo?.postal,
          latitude: geo?.latitude,
          longitude: geo?.longitude,
          geo_languages: geoLanguages,
        };

        await PageAnalytics.create(eventDoc);
      } catch (aerr) {
        console.warn("analytics logging error (profile):", aerr?.message || aerr);
      }
    })();

    return res.json(payload);
  } catch (err) {
    console.error("GET /api/profile error:", err);
    return res.status(500).json({ error: "internal" });
  }
});


router.post("/submit-form", async (req, res) => {
  try {
    const {
      blockId,
      blockName,
      values = {},
      meta = {},
    } = req.body || {};

    // Basic validation
    if (!blockId) {
      return res.status(400).json({ 
        success: false,
        message: "blockId is required" 
      });
    }

    if (values == null || typeof values !== "object") {
      return res.status(400).json({ 
        success: false,
        message: "Invalid values payload; expected an object." 
      });
    }

    // Convert blockId to ObjectId if valid
    let blockIdToStore = blockId;
    if (mongoose.Types.ObjectId.isValid(blockId)) {
      blockIdToStore = new mongoose.Types.ObjectId(blockId);
    }

    // Fetch the block to get user_id
    const block = await Block.findOne({ 
      _id: blockIdToStore,
      type: 'form',
      is_del: false 
    }).select('user_id name').lean();

    if (!block) {
      return res.status(404).json({ 
        success: false,
        message: "Form block not found or has been deleted" 
      });
    }

    // Get user_id from the block
    const userId = block.user_id;

    // Collect IP, user agent, and geo location
    let ip = null;
    let ua = null;
    let ref = null;
    let geo = null;

    try {
      ip = await getClientIp(req);
      ua = req.headers["user-agent"] || "";
      ref = req.headers["referer"] || req.headers["referrer"] || "";
      
      // Get geo location
      geo = await lookupGeo_ipdata(ip);
    } catch (geoErr) {
      console.warn("Geo lookup error:", geoErr?.message || geoErr);
    }

    // Create form submission document
    const doc = new FormsData({
      block_id: blockIdToStore,
      user_id: userId,
      block_name: blockName || block.name || "Form",
      values,
      meta,
      ip: ip || geo?.ip || req.ip || null,
      user_agent: ua,
      referrer: ref,
      country: geo?.country || null,
      region: geo?.region || null,
      city: geo?.city || null,
      postal: geo?.postal || null,
      latitude: geo?.latitude || null,
      longitude: geo?.longitude || null,
      submitted_at: meta?.submittedAt ? new Date(meta.submittedAt) : new Date(),
    });

    // Save the document
    await doc.save();

    console.log('✅ Form submission saved:', {
      submissionId: doc._id,
      blockId: blockIdToStore,
      userId: userId,
      city: geo?.city,
      country: geo?.country
    });

    return res.status(201).json({ 
      success: true,
      message: "Form submitted successfully",
      id: doc._id 
    });

  } catch (err) {
    console.error("❌ Error saving form submission:", err);
    return res.status(500).json({ 
      success: false,
      message: "Failed to save submission",
      error: err.message
    });
  }
});


router.post("/link-click-analytics", async (req, res) => {
  try {
    const { link_key } = req.body || {};
    if (!link_key) return res.status(400).json({ error: "link_key required" });

    // find block exists (quick check). You can also do the update blindly and check modifiedCount.
    const blockExists = await Block.exists({ _id: link_key });
    if (!blockExists) return res.status(404).json({ error: "block not found" });

    // get client info
    const ip = await getClientIp(req);
    const userAgent = req.headers["user-agent"] || null;
    const referrer = req.headers["referer"] || req.headers["referrer"] || null;
    const geo = await lookupGeo_ipdata(ip);

    const analyticsEntry = {
      ip: geo.ip || null,
      user_agent: userAgent,
      referrer: referrer,
      country: geo?.country || null,
      country_code: geo?.country || geo?.country_code || null,
      region: geo?.region || null,
      city: geo?.city || null,
      postal: geo?.postal || null,
      latitude: geo?.latitude || null,
      longitude: geo?.longitude || null,
    };

    // atomic push into the array
    const updateResult = await Block.updateOne(
      { _id: link_key },
      { $push: { link_click_analytics: analyticsEntry } }
    );

    if (updateResult.matchedCount === 0) {
      return res.status(404).json({ error: "block not found (race?)" });
    }

    return res.status(201).json({ ok: true, analytics: analyticsEntry });
  } catch (err) {
    console.error("Error saving link click analytics:", err);
    return res.status(500).json({ message: "Failed to save link click analytics" });
  }
});

router.post("/subdomain/check", async (req, res) => {
  try {
    const raw = (req.body?.subdomain ?? "").toString().trim();
    const subdomain = raw.toLowerCase();

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");


    // Basic validations (the frontend also does this, but never trust the client)
    if (!subdomain || !isValidSubdomain(subdomain) || RESERVED.has(subdomain)) {
      // You can also include a reason if you want
      return res.json({ available: false });
    }

    // Case-insensitive exact match on handleUserName
    // Prefer storing a normalized field (e.g., handleUserNameLower) and indexing that.
    // This regex approach is safe & exact but slower without an index.
    const rx = new RegExp(`^${escapeRegex(subdomain)}$`, "i");

    const exists = await USER.exists({ handleUserName: rx });
    return res.json({ available: !Boolean(exists) });
  } catch (err) {
    console.error("subdomain check error:", err);
    return res.status(500).json({ available: false });
  }
});



router.post("/url-metadata", authenticateToken, async (req, res) => {
  try {
    const url = req.body?.url;
    if (!url) return res.status(400).json({ message: "url required" });

    // Validate URL format
    try {
      const parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return res.status(400).json({ message: "Invalid URL protocol" });
      }
    } catch {
      return res.status(400).json({ message: "Invalid URL format" });
    }

    // Check cache first
    const cached = metaCache.get(url);
    if (cached) {
      console.log('Returning cached metadata for:', url);
      return res.json(cached);
    }
    
    if (!LINKPREVIEW_API_KEY) {
      console.error("LINKPREVIEW_API_KEY not set in environment variables");
      return res.status(500).json({ message: "API configuration error" });
    }

    console.log('Fetching metadata from LinkPreview.net for:', url);

    const response = await axios.post(
      'https://api.linkpreview.net',
      { q: url },
      {
        headers: {
          'X-Linkpreview-Api-Key': LINKPREVIEW_API_KEY,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const data = response.data;

    // LinkPreview.net returns: title, description, image, url
    let image = data.image || null;

    // Force HTTPS for images if available
    if (image && image.startsWith('http://')) {
      image = image.replace(/^http:\/\//, 'https://');
    }

    const result = {
      title: data.title || null,
      image: image,
      description: data.description || null,
    };

    // Cache successful results
    if (result.title || result.image) {
      metaCache.set(url, result);
    }

    res.json(result);

  } catch (e) {
    console.error("url-metadata error:", e?.response?.data || e?.message);
    
    // Handle LinkPreview.net specific errors
    if (e?.response?.status === 429) {
      return res.status(200).json({
        title: null,
        image: null,
        description: null,
        error: "Rate limit exceeded. Please try again later."
      });
    }

    if (e?.response?.status === 401) {
      console.error("LinkPreview API authentication failed. Check your API key.");
      return res.status(500).json({
        message: "API authentication failed"
      });
    }

    // Return graceful fallback for other errors
    res.status(200).json({
      title: null,
      image: null,
      description: null,
      error: "Could not fetch metadata"
    });
  }
});



router.post("/upload-product", upload.single("image"), authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.user_id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const {
        type,               // 'affiliate' | 'digital' | etc.
        title,
        link,
        description,
        price,
        category_id,        // optional: ObjectId string
        category_name,      // optional: string (e.g., "Fitness")
        imageUrlFromMeta,   // optional
      } = req.body;

      // Basic validation
      if (!type) return res.status(400).json({ message: "type is required" });
      if (type === "affiliate") {
        if (!title || !link)
          return res.status(400).json({ message: "title and link required for affiliate" });
      } else if (type === "digital") {
        if (!title)
          return res.status(400).json({ message: "product name (title) required for digital" });
      } else {
        if (!title) return res.status(400).json({ message: "title is required" });
      }

      // ---------- Image handling (upload to GCS / or use meta) ----------
      let imageUrl = null;
      let imagePublicId = null;

      if (req.file) {
        if (req.file.path) {
          const uploaded = await uploadFilePathToGCS(
            req.file.path,
            req.file.originalname,
            req.file.mimetype
          );
          imageUrl = uploaded.publicUrl;
          imagePublicId = uploaded.objectName;
          if (fs.existsSync(req.file.path)) {
            try { await unlinkAsync(req.file.path); } catch {}
          }
        } else if (req.file.buffer) {
          const uploaded = await uploadBufferToGCS(
            req.file.buffer,
            req.file.originalname,
            req.file.mimetype
          );
          imageUrl = uploaded.publicUrl;
          imagePublicId = uploaded.objectName;
        }
      } else if (imageUrlFromMeta) {
        imageUrl = imageUrlFromMeta; // allow affiliate thumbnail w/o upload
      }

      // ---------- Resolve/ensure category (ObjectId on productCategory) ----------
      let productCategoryId = null;

      // Priority 1: explicit category_id (validate it belongs to this user)
      if (category_id) {
        const cat = await ProductCategory.findOne(
          { _id: category_id, user_id: userId, is_del: false },
          { _id: 1, name: 1 }
        ).lean();
        if (!cat) {
          return res.status(400).json({ message: "Invalid category_id for this user" });
        }
        productCategoryId = cat._id;
      }
      // Priority 2: category_name -> find or create (case-insensitive, per-user unique)
      else if (category_name && String(category_name).trim()) {
        const name = String(category_name).trim();
        // Try find same name (case-insensitive) for this user
        let cat = await ProductCategory.findOne(
          { user_id: userId, is_del: false, name: new RegExp("^" + escapeRegex(name) + "$", "i") },
          { _id: 1, name: 1 }
        ).lean();

        if (!cat) {
          // Create a new category for this user
          const created = await ProductCategory.create({
            user_id: userId,
            name,
            is_del: false,
          });
          productCategoryId = created._id;
        } else {
          productCategoryId = cat._id;
        }
      }

      // ---------- Create product ----------
      const productDoc = {
        user_id: userId,
        type,
        title,
        link: link || null,
        description: description || null,
        price:
          price !== undefined && price !== null && String(price).trim() !== ""
            ? Number(price)
            : undefined,
        imageUrl,
        imagePublicId,
        productCategory: productCategoryId || null,
        // DO NOT persist legacy fields anymore:
        // category_id, category_name
      };

      const created = await Product.create(productDoc);

      // Return populated + flat category string (for easy UI)
      const saved = await Product.findById(created._id)
        .populate({ path: "productCategory", select: "name", strictPopulate: false })
        .lean();

      const response = {
        ...saved,
        category: saved?.productCategory?.name || null,
      };

      return res.json({ product: response });
    } catch (err) {
      console.error("Create product error:", err);
      return res
        .status(500)
        .json({ message: "Error creating product", error: err.message });
    }
  }
);


router.post("/edit-product/:id", upload.single("image"), authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.user_id;
    
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const {
      type,
      title,
      link,
      description,
      price,
      category_id,
      category_name,
      imageUrlFromMeta,
    } = req.body;

    // Find existing product and verify ownership
    const existingProduct = await Product.findOne({ _id: id, user_id: userId });
    if (!existingProduct) {
      return res.status(404).json({ message: "Product not found or unauthorized" });
    }

    // Build update object
    const update = { updated_at: new Date() };
    
    if (type) update.type = type;
    if (title !== undefined) update.title = title;
    if (link !== undefined) update.link = link;
    if (description !== undefined) update.description = description;
    
    // Handle price (allow null/empty to clear it)
    if (price !== undefined && price !== null && String(price).trim() !== "") {
      update.price = Number(price);
    } else if (price === null || price === "") {
      update.price = null;
    }

    // ---------- Image handling (same priority as upload) ----------
    if (req.file) {
      // Priority 1: New manual upload
      if (req.file.path) {
        const uploaded = await uploadFilePathToGCS(
          req.file.path,
          req.file.originalname,
          req.file.mimetype
        );
        update.imageUrl = uploaded.publicUrl;
        update.imagePublicId = uploaded.objectName;
        
        // Clean up temp file
        if (fs.existsSync(req.file.path)) {
          try { await unlinkAsync(req.file.path); } catch {}
        }
        
        // Optional: Delete old image from GCS if it exists
        if (existingProduct.imagePublicId) {
          try {
            await deleteFromGCS(existingProduct.imagePublicId);
          } catch (err) {
            console.warn("Failed to delete old image:", err);
          }
        }
      } else if (req.file.buffer) {
        const uploaded = await uploadBufferToGCS(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype
        );
        update.imageUrl = uploaded.publicUrl;
        update.imagePublicId = uploaded.objectName;
        
        // Optional: Delete old image from GCS
        if (existingProduct.imagePublicId) {
          try {
            await deleteFromGCS(existingProduct.imagePublicId);
          } catch (err) {
            console.warn("Failed to delete old image:", err);
          }
        }
      }
    } else if (imageUrlFromMeta) {
      // Priority 2: Auto-fetched URL from metadata
      update.imageUrl = imageUrlFromMeta;
      // Note: Don't set imagePublicId since this is an external URL
      update.imagePublicId = null;
    }

    // ---------- Category handling (same logic as upload) ----------
    let productCategoryId = existingProduct.productCategory; // Keep existing by default

    // Priority 1: explicit category_id
    if (category_id) {
      const cat = await ProductCategory.findOne(
        { _id: category_id, user_id: userId, is_del: false },
        { _id: 1, name: 1 }
      ).lean();
      
      if (!cat) {
        return res.status(400).json({ message: "Invalid category_id for this user" });
      }
      productCategoryId = cat._id;
    }
    // Priority 2: category_name -> find or create
    else if (category_name && String(category_name).trim()) {
      const name = String(category_name).trim();
      
      // Try find same name (case-insensitive) for this user
      let cat = await ProductCategory.findOne(
        { 
          user_id: userId, 
          is_del: false, 
          name: new RegExp("^" + escapeRegex(name) + "$", "i") 
        },
        { _id: 1, name: 1 }
      ).lean();

      if (!cat) {
        // Create a new category for this user
        const created = await ProductCategory.create({
          user_id: userId,
          name,
          is_del: false,
        });
        productCategoryId = created._id;
      } else {
        productCategoryId = cat._id;
      }
    }
    // If category_name is explicitly empty string, clear the category
    else if (category_name === "") {
      productCategoryId = null;
    }

    update.productCategory = productCategoryId;

    // Update product
    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      update,
      { new: true }
    )
      .populate({ path: "productCategory", select: "name", strictPopulate: false })
      .lean();

    // Return with flat category field for UI compatibility
    const response = {
      ...updatedProduct,
      category: updatedProduct?.productCategory?.name || null,
    };

    return res.json({ product: response });
    
  } catch (err) {
    console.error("Edit product error:", err);
    return res.status(500).json({ 
      message: "Error editing product", 
      error: err.message 
    });
  }
});


router.get("/fet-user-products", authenticateToken, async (req, res) => {
  const userId = req.user?.user_id;
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.max(parseInt(req.query.limit || "10", 10), 1);
  const skip = (page - 1) * limit;

  try {
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: no user id" });
    }

    const filter = { user_id: userId, is_del: false };

    const [data, total] = await Promise.all([
      Product.find(filter)
        .populate('productCategory')  // ← ADD THIS LINE
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);

    return res.json({ data, total });
  } catch (err) {
    console.error("List user products error:", err);
    return res.status(500).json({ message: "Error fetching products" });
  }
});



router.delete("/delete-product/:id", authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.user_id;
      const id = req.params.id;

      // validate id
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid product id" });
      }

      // find product
      const product = await Product.findOne({_id: id, user_id : userId});

      if (!product) return res.status(404).json({ message: "Product not found" });


      // if already soft-deleted
      if (product.is_del) {
        return res.status(400).json({ message: "Product already deleted" });
      }

      // Soft-delete: mark flags but keep DB row and GCS object intact
      product.is_del = true;
      product.updated_at = new Date();
      await product.save();

      return res.json({ message: "Product soft-deleted", productId: id });
    } catch (err) {
      console.error("Delete product error:", err);
      return res.status(500).json({ message: "Error deleting product" });
    }
  }
);

// router.post("/upload-header-image", authenticateToken, upload.single("image"),
//   async (req, res) => {
//     try {
//       const userId = req.user?.user_id;
//       if (!userId) {
//         return res.status(401).json({ success: false, message: "Unauthorized" });
//       }

//       // Multer memoryStorage provides file.buffer
//       const file = req.file;
//       const rawPosition = req.body?.position;

//       // Basic validation
//       if (!file || !file.buffer) {
//         return res.status(400).json({
//           success: false,
//           message: "No file uploaded. Ensure you send multipart/form-data with field name 'image'.",
//         });
//       }

//       const targetField = normalizePosition(rawPosition);
//       if (!targetField) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "Invalid position value. Acceptable values: left | headerImage1 | 1, rightTop | headerImage2 | 2, rightBottom | headerImage3 | 3",
//         });
//       }

//       // Upload buffer to GCS (your helper) - it should return { publicUrl, objectName }
//       const { publicUrl, objectName } = await uploadBufferToGCS(
//         file.buffer,
//         file.originalname || `upload-${Date.now()}`,
//         file.mimetype || "application/octet-stream"
//       );

//       if (!publicUrl) {
//         return res.status(500).json({ success: false, message: "Failed to upload to storage" });
//       }

//       // Update user doc
//       const update = { [targetField]: publicUrl, updated_at: new Date() };
//       const updatedUser = await USER.findByIdAndUpdate(userId, { $set: update }, { new: true }).lean();

//       if (!updatedUser) {
//         return res.status(404).json({ success: false, message: "User not found" });
//       }

//       return res.json({
//         success: true,
//         url: publicUrl,
//         updatedField: targetField,
//         objectName,
//         user: {
//           _id: updatedUser._id,
//           leftHeadImage: updatedUser.leftHeadImage,
//           rightTopImage: updatedUser.rightTopImage,
//           rightBottomImage: updatedUser.rightBottomImage,
//         },
//       });
//     } catch (err) {
//       console.error("upload-header-image error:", err);
//       return res.status(500).json({
//         success: false,
//         message: "Upload failed",
//         error: err?.message || String(err),
//       });
//     }
//   }
// );


router.post("/upload-header-image", 
  authenticateToken, 
  (req, res, next) => {
    console.log('=== Upload Request Started ===');
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Content-Length:', req.headers['content-length']);
    console.log('User:', req.user?.user_id);
    next();
  },
  upload.single("image"),
  async (req, res) => {
    try {
      console.log('=== After Multer Middleware ===');
      console.log('File received:', !!req.file);
      console.log('File details:', req.file ? {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        hasBuffer: !!req.file.buffer,
        bufferLength: req.file.buffer?.length
      } : 'NO FILE');
      console.log('Body:', req.body);
      
      const userId = req.user?.user_id;
      if (!userId) {
        console.error('No userId found');
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const file = req.file;
      const rawPosition = req.body?.position;

      if (!file || !file.buffer) {
        console.error('File validation failed:', { hasFile: !!file, hasBuffer: !!file?.buffer });
        return res.status(400).json({
          success: false,
          message: "No file uploaded. Ensure you send multipart/form-data with field name 'image'.",
        });
      }

      const targetField = normalizePosition(rawPosition);
      if (!targetField) {
        console.error('Invalid position:', rawPosition);
        return res.status(400).json({
          success: false,
          message:
            "Invalid position value. Acceptable values: left | headerImage1 | 1, rightTop | headerImage2 | 2, rightBottom | headerImage3 | 3",
        });
      }

      console.log('Uploading to GCS...', {
        bufferSize: file.buffer.length,
        filename: file.originalname,
        mimetype: file.mimetype
      });

      // Upload buffer to GCS
      const { publicUrl, objectName } = await uploadBufferToGCS(
        file.buffer,
        file.originalname || `upload-${Date.now()}`,
        file.mimetype || "application/octet-stream"
      );

      console.log('GCS upload result:', { publicUrl, objectName });

      if (!publicUrl) {
        console.error('GCS upload failed - no publicUrl returned');
        return res.status(500).json({ success: false, message: "Failed to upload to storage" });
      }

      console.log('Updating user document...', { userId, targetField, publicUrl });

      // Update user doc
      const update = { [targetField]: publicUrl, updated_at: new Date() };
      const updatedUser = await USER.findByIdAndUpdate(userId, { $set: update }, { new: true }).lean();

      if (!updatedUser) {
        console.error('User not found:', userId);
        return res.status(404).json({ success: false, message: "User not found" });
      }

      console.log('Upload successful!');

      return res.json({
        success: true,
        url: publicUrl,
        updatedField: targetField,
        objectName,
        user: {
          _id: updatedUser._id,
          leftHeadImage: updatedUser.leftHeadImage,
          rightTopImage: updatedUser.rightTopImage,
          rightBottomImage: updatedUser.rightBottomImage,
        },
      });
    } catch (err) {
      console.error("=== UPLOAD ERROR ===");
      console.error("Error name:", err.name);
      console.error("Error message:", err.message);
      console.error("Error stack:", err.stack);
      console.error("Full error:", err);
      
      return res.status(500).json({
        success: false,
        message: "Upload failed",
        error: err?.message || String(err),
        errorName: err?.name,
      });
    }
  }
);

router.get("/fetch-influencer-products", async (req, res) => {
  try {
    console.log("Incoming URL:", req.originalUrl);

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.max(parseInt(req.query.limit || "10", 10), 1);
    const skip = (page - 1) * limit;

    const qRaw = (req.query.q || "").trim();
    const subdomainRaw = (req.query.subdomain || "").trim();
    const categoryRaw = (req.query.category || "").trim(); // e.g. "Fitness"

    if (!subdomainRaw) {
      console.log("No subdomain provided");
      return res.json({ data: [], total: 0 });
    }

    // Resolve subdomain/handle -> user
    const handleRegex = new RegExp("^" + escapeRegex(subdomainRaw) + "$", "i");
    const user = await USER.findOne(
      { $or: [{ handleUserName: handleRegex }, { handle: handleRegex }] },
      { _id: 1 }
    ).lean();

    if (!user) {
      console.log("No user found for subdomain:", subdomainRaw);
      return res.json({ data: [], total: 0 });
    }
    const userId = user._id;

    // Build product filter
    const filter = { user_id: userId, is_del: false };

    if (qRaw) {
      const safe = escapeRegex(qRaw);
      const re = new RegExp(safe, "i");
      filter.$or = [{ title: re }, { name: re }, { link: re }];
    }

    // If a category NAME is provided, resolve it to that user's category _id
    if (categoryRaw && categoryRaw.toLowerCase() !== "all") {
      const nameRegex = new RegExp("^" + escapeRegex(categoryRaw) + "$", "i");
      const catDoc = await ProductCategory.findOne(
        { user_id: userId, is_del: false, name: nameRegex },
        { _id: 1 }
      ).lean();

      if (!catDoc) {
        // No such category for this user -> empty result
        return res.json({ data: [], total: 0 });
      }

      filter.productCategory = catDoc._id;
    }

    // Fetch products and populate category; then add plain `category` string into each item
    const [rawData, total] = await Promise.all([
      Product.find(filter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        // strictPopulate:false guards while you ensure Product schema has `productCategory` ref
        .populate({ path: "productCategory", select: "name", strictPopulate: false })
        .lean(),
      Product.countDocuments(filter),
    ]);

    const data = rawData.map((doc) => {
      const categoryName = doc?.productCategory?.name || null;
      return { ...doc, category: categoryName };
    });

    return res.json({ data, total });
  } catch (err) {
    console.error("List influencer products error:", err);
    return res.status(500).json({ message: "Error fetching products" });
  }
});

router.post("/enable-store", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Accept { enabled: true/false } in body; default to true if not provided
    const { enabled = true } = req.body ?? {};

    // validate boolean-ish values
    const storeEnabled = enabled === true || enabled === "true" || enabled === 1 || enabled === "1";

    // Update the user's document
    const update = { $set: { store_enabled: storeEnabled } };

    // findOneAndUpdate returns the previous by default; pass { new: true } to get updated document
    const updated = await USER.findOneAndUpdate(
      { _id: userId },
      update,
      { new: true, projection: { store_enabled: 1, _id: 0 } }
    ).lean();

    if (!updated) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({ success: true, enabled: Boolean(updated.store_enabled) });
  } catch (err) {
    console.error("POST /enable-store error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/plan-banner-status", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    const user = await USER.findById(userId).select('planBannerShowed');

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({
      success: true,
      shouldShowBanner: !user.planBannerShowed
    });
  } catch (error) {
    console.error("Error checking plan banner status:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PATCH: Mark plan banner as shown
router.patch("/plan-banner-shown", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.user_id;
    const user = await USER.findByIdAndUpdate(
      userId,
      { planBannerShowed: true },
      { new: true }
    ).select('planBannerShowed');

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({
      success: true,
      message: "Plan banner marked as shown",
      planBannerShowed: user.planBannerShowed
    });
  } catch (error) {
    console.error("Error updating plan banner status:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});




// ═══════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════════════════════════

const ADMIN_JWT_SECRET = process.env.JWT_SECRET;

router.post("/admin-login-gmail", async (req, res) => {
  try {
    // Rate limit: 5 attempts per 15 minutes per IP (stricter for admin)
    const _adminIp = await getClientIp(req);
    const _adminAllowed = await checkRateLimit(`auth:admin-login:${_adminIp}`, 5, 15 * 60 * 1000);
    if (!_adminAllowed) return res.status(429).json({ success: false, error: "Too many login attempts. Please try again later." });

    const { email, firstName, lastName, picture } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: "Email is required" });
    }

    let admin = await Admin.findOne({ email });
    let wasNew = false;

    if (!admin) {
      admin = await Admin.create({
        email,
        name: `${firstName || ""} ${lastName || ""}`.trim(),
        picture,
        is_google_user: true,
      });
      wasNew = true;
    }

    if (!admin.hasAccess) {
      return res.status(403).json({
        success: false,
        error: "Access denied. Contact the system administrator.",
      });
    }

    const { randomUUID: _adminUUID } = await import("crypto");
    const token = jwt.sign(
      { admin_id: admin._id, admin_email: admin.email, jti: _adminUUID() },
      ADMIN_JWT_SECRET,
      { expiresIn: "8h" }   // Admin sessions are short-lived
    );

    res.cookie("tokenMyhandleAdmin", token, {
  httpOnly: true,
  secure: true,                  // required when SameSite=None
  sameSite: "none",              // critical for iOS/Safari & any cross-site/iframe usage
   domain: ".chomske.com",// needed if crossing subdomains
  path: "/",             // ensure all routes get it
  maxAge: 8 * 60 * 60 * 1000    // 8h — matches JWT expiry
});

    return res.status(200).json({
      success: true,
      message: wasNew ? "Admin registered successfully" : "Admin logged in successfully",
      admin: { admin_id: admin._id, admin_email: admin.email },
      token,
      wasNew,
    });
  } catch (err) {
    console.error("Admin login error:", err);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.get("/verify-admin-token", authenticateAdmin, (req, res) => {
  return res.json({ valid: true });
});

router.post("/admin-logout", authenticateAdmin, async (req, res) => {
  try {
    const { jti, exp } = req.admin;
    if (jti && exp) {
      await RevokedToken.create({ jti, expiresAt: new Date(exp * 1000) });
    }
  } catch (err) {
    console.error("Admin token revocation failed:", err.message);
  }

  res.clearCookie("tokenMyhandleAdmin");
  return res.json({ success: true, message: "Logged out" });
});

router.get("/dashboard-stats", authenticateAdmin, async (req, res) => {
  try {
    const { from, to } = req.query;

    const dateFilter = {};
    if (from || to) {
      dateFilter.created_at = {};
      if (from) dateFilter.created_at.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        dateFilter.created_at.$lte = toDate;
      }
    }

    const userFilter = { is_del: { $ne: true }, ...dateFilter };
    const subFilter = { is_del: false, status: "active" };
    if (dateFilter.created_at) subFilter.created_at = dateFilter.created_at;

    const [totalUsers, totalSubscriptions] = await Promise.all([
      USER.countDocuments(userFilter),
      Subscriptions.countDocuments(subFilter),
    ]);

    return res.json({ success: true, totalUsers, totalSubscriptions });
  } catch (err) {
    console.error("Dashboard stats error:", err);
    return res.status(500).json({ success: false, error: "Something went wrong" });
  }
});

router.get("/users-list", authenticateAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
    const search = (req.query.search || "").trim();
    const igConnected = req.query.igConnected; // "true" | "false" | undefined
    const { from, to } = req.query;
    const skip = (page - 1) * limit;

    const filter = { is_del: { $ne: true } };

    if (from || to) {
      filter.created_at = {};
      if (from) filter.created_at.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        filter.created_at.$lte = toDate;
      }
    }

    if (igConnected === "true") filter.instagramConnected = true;
    else if (igConnected === "false") filter.instagramConnected = { $ne: true };

    if (search) {
      const regex = new RegExp(search, "i");
      filter.$or = [
        { name: regex },
        { email: regex },
        { igUsername: regex },
      ];
    }

    const [users, totalCount] = await Promise.all([
      USER.find(filter)
        .select("name email instagramConnected igFollowersCount igUsername igProfilePic created_at")
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      USER.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      users,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
    });
  } catch (err) {
    console.error("Users list error:", err);
    return res.status(500).json({ success: false, error: "Something went wrong" });
  }
});

router.get("/user-details/:userId", authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const [user, dmsThisMonth, automationsCount] = await Promise.all([
      USER.findById(userId).select("name email").lean(),

      DmsUsage.findOne({
        user_id: userId,
        year: currentYear,
        month: currentMonth,
      }).lean(),

      Automation.countDocuments({ userId, status: "active" }),
    ]);

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    return res.json({
      success: true,
      dmsSentThisMonth: dmsThisMonth?.total_dms_sent || 0,
      automationsCount,
      leadsFound: dmsThisMonth?.lead_alerts_sent || 0,
    });
  } catch (err) {
    console.error("User details error:", err);
    return res.status(500).json({ success: false, error: "Something went wrong" });
  }
});


export default router;

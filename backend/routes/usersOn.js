import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import axios from "axios";
const router = express.Router();
import USER from "../models/User.js";
import cookie from "cookie";
import ParticipantUser from "../models/ParticipantUser.js";
import Conversation from "../models/Conversations.js";
import Subscriptions from "../models/Subscriptions.js";
import Message from "../models/Messages.js";
import Bookings from "../models/Bookings.js";
import Block from "../models/Blocks.js";
import FormsData from "../models/FormsData.js";
import BankDetails from "../models/BankDetails.js";
import Transaction from "../models/Transaction.js";
import Automation from "../models/Automation.js";
import RepliedComment from "../models/RepliedComment.js";
import Product from "../models/ProductsCatalogue.js";
import PageAnalytics from "../models/PageAnalytics.js";
import NewsletterModel from "../models/Newsletter.js";
import ProductCategory from "../models/ProductCategory.js";
import * as cheerio from 'cheerio';
import mongoose from 'mongoose';
router.use(cookieParser());
import authenticateToken from "../middleware/authenticateTokenProfessional.js";
import authenticateParticipant from "../middleware/authenticateParticipant.js";
import generateJWTtoken  from "../middleware/generateJWTtoken.js";
import sendMailForBookings from "../utils/sendEmailBooking.js";
import sendEmailToCreator from "../utils/sendEmailToCreator.js";
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

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const storage = new Storage({
  keyFilename: join(__dirname, 'service-account-key.json')});
  
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
const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const META_REDIRECT_URI = "https://myhandle.in/api/usersOn/meta-callback";
const META_STATE_SECRET = "change_me_super_secret";

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
async function extractHandleFromHost(host, roots = ["myhandle.in"]) {
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
      client_id: process.env.META_APP_ID || META_APP_ID,
      client_secret: process.env.META_APP_SECRET || META_APP_SECRET,
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
  res.clearCookie("tokenMyhandleProf", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    domain: ".myhandle.in",  // CRITICAL: Must match cookie creation
    path: "/",
  });
  
  res.status(200).json({ message: "Logged out successfully" });
});

const DEMO_EMAIL = "demoaccount@myhandle.in";
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
      res.cookie("tokenMyhandleProf", token, {
  httpOnly: true,
  secure: true,                  // required when SameSite=None
  sameSite: "none",              // critical for iOS/Safari & any cross-site/iframe usage
   domain: ".myhandle.in",// needed if crossing subdomains
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

const FRONTEND_ORIGIN = "https://myhandle.in"; // your app origin
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

    // Save early
    await USER.findByIdAndUpdate(
      userId,
      {
        fbLongLivedToken,
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
  // 7️⃣ Save all data to USER
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
    fbPageAccessToken,
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
    const user = await USER.findById(userId).select("igUserId fbLongLivedToken").lean();
    if (!user || !user.igUserId) return res.status(400).json({ error: "Instagram not connected" });

    const fields = "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp";
    const limit = 20; // Fetch slightly more since we might filter out non-videos
    const after = req.query.after ? `&after=${encodeURIComponent(req.query.after)}` : "";

    const url = `https://graph.facebook.com/v21.0/${user.igUserId}/media?fields=${fields}&limit=${limit}${after}&access_token=${user.fbLongLivedToken}`;

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
    const user = await USER.findById(userId).select("igUserId fbLongLivedToken").lean();
    if (!user || !user.igUserId) return res.status(400).json({ error: "Instagram not connected" });

    const fields = "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp";
    // Stories endpoint does not always support standard cursor pagination perfectly, but we attempt it
    const after = req.query.after ? `&after=${encodeURIComponent(req.query.after)}` : "";
    
    const url = `https://graph.facebook.com/v21.0/${user.igUserId}/stories?fields=${fields}${after}&access_token=${user.fbLongLivedToken}`;

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
    const user = await USER.findById(userId).select("igUserId fbLongLivedToken").lean();
    if (!user || !user.igUserId) return res.status(400).json({ error: "Instagram not connected" });

    const fields = "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp";
    const limit = 25; // Fetch slightly more to account for filtering out videos
    const after = req.query.after ? `&after=${encodeURIComponent(req.query.after)}` : "";

    const url = `https://graph.facebook.com/v21.0/${user.igUserId}/media?fields=${fields}&limit=${limit}${after}&access_token=${user.fbLongLivedToken}`;

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


async function subscribePageToInstagramWebhooks(fbPageId, fbPageAccessToken, userId) {
  if (!fbPageId) throw new Error("fbPageId is required");
  if (!fbPageAccessToken) throw new Error("fbPageAccessToken is required");

  try {
    
    const subResp = await axios.post(
      `https://graph.facebook.com/v24.0/${fbPageId}/subscribed_apps`,
      null, 
      {
        params: {
            subscribed_fields: "feed", 
            access_token: fbPageAccessToken, 
        },
      }
    );

    const success = subResp?.data?.success;
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
    const user = await USER.findById(userId).select("fbPageId fbPageAccessToken automationFeedSubscribed");
    
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
    if (user.fbPageId && user.fbPageAccessToken && !user.automationFeedSubscribed) {
        console.log(`🔌 Initializing Webhooks for User ${userId}...`);
        
        try {
            // Run the helper function
            const subResult = await subscribePageToInstagramWebhooks(
                user.fbPageId, 
                user.fbPageAccessToken, 
                userId
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
    console.error("create-order error:", JSON.stringify(e, null, 2));
    res.status(status).json({ error: msg });
  }
});



router.post("/payments/verify", async (req, res) => {
  try {
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
    console.error("verify error:", e);
    return res.status(500).json({ error: "Verification failed" });
  }
});

// Route 1: Create order with slot reservation
router.post("/bookings/create-order", async (req, res) => {
  try {
    const { 
      block_id, 
      user_id, 
      customer_name, 
      customer_mobile, 
      customer_email, 
      selected_date, 
      selected_timeSlot 
    } = req.body;

    // Validate required fields
    if (!block_id || !user_id || !customer_name || !customer_email || !customer_mobile) {
      return res.status(400).json({ error: "Missing required booking fields" });
    }

    // ✅ STEP 1: Check slot availability FIRST
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

    // Fetch booking block to get pricing
    const bookingBlock = await Block.findOne({ _id: block_id, user_id });
    if (!bookingBlock) {
      return res.status(404).json({ error: "Booking block not found" });
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
      userId,
      title,
      meeting_link, // if you pass this in req.body, we’ll forward it
      venue,        // optional
      interaction_type
    } = req.body;


    // ---- Validation ----
    if (!block_id) return res.status(400).json({ error: "block_id is required" });
    if (!customer_name || !customer_name.trim()) return res.status(400).json({ error: "Customer name is required" });
    if (!customer_mobile) return res.status(400).json({ error: "Customer mobile is required" });
    if (!customer_email || !customer_email.trim()) return res.status(400).json({ error: "Customer email is required" });
    if (!selected_date) return res.status(400).json({ error: "Selected date is required" });
    if (!selected_timeSlot) return res.status(400).json({ error: "Selected time slot is required" });
    if (!userId) return res.status(400).json({ error: "userId is required" });

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
      manage_url: "https://myhandle.in/booking/details/customer",
      support_email: "support@myhandle.in",
      logo_url: "https://storage.googleapis.com/myhandlebucket/MyHandle%20Hori_logo.png",
      brand_name: "MyHandle",
      brand_url: "https://myhandle.in",
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
      manage_url: "https://myhandle.in/professional/booking/sessions",
      support_email: "support@myhandle.in",
      logo_url: "https://storage.googleapis.com/myhandlebucket/MyHandle%20Hori_logo.png",
      brand_name: "MyHandle",
      brand_url: "https://myhandle.in",
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
      manage_url: "https://myhandle.in/booking/details/customer",
      support_email: "support@myhandle.in",
      logo_url: "https://storage.googleapis.com/myhandlebucket/MyHandle%20Hori_logo.png",
      brand_name: "MyHandle",
      brand_url: "https://myhandle.in",
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
      manage_url: "https://myhandle.in/professional/booking/sessions",
      support_email: "support@myhandle.in",
      logo_url: "https://storage.googleapis.com/myhandlebucket/MyHandle%20Hori_logo.png",
      brand_name: "MyHandle",
      brand_url: "https://myhandle.in",
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
      query.$or = [
        { block_name: { $regex: searchQuery, $options: 'i' } },
        { 'meta.fromHandle': { $regex: searchQuery, $options: 'i' } },
      ];
    }

    console.log('Query:', JSON.stringify(query, null, 2)); // Debug log

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

    console.log('Found submissions:', submissions.length); // Debug log

    // Get all form blocks for this user (include is_del: false filter)
    const formBlocks = await Block.find({
      user_id: userId,
      type: 'form',
      is_del: false
    }).select('_id name').lean();

    console.log('Form blocks:', formBlocks); // Debug log

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

    console.log('Submission counts:', submissionCounts); // Debug log

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
router.delete("/bookings/:bookingId", async (req, res) => {
  try {
    const { bookingId } = req.params;

    // Validate bookingId
    if (!bookingId) {
      return res.status(400).json({ error: "Booking ID is required" });
    }

    // Find and validate booking
    const booking = await Bookings.findById(bookingId);

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
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

router.get("/conversations/:conversationId", authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ error: "conversationId required and must be a valid ObjectId" });
    }

    const requesterId = req.user?.user_id;
    if (!requesterId || !mongoose.Types.ObjectId.isValid(requesterId)) {
      return res.status(401).json({ error: "unauthenticated" });
    }

    const OID = (v) => new mongoose.Types.ObjectId(String(v));

    // Pull raw conversation
    const convo = await Conversation.findOne({
      _id: conversationId,
      is_deleted: { $ne: true },
    })
      .select(
        "_id participants conversation_type metadata last_message last_message_text last_message_at message_count createdAt updatedAt"
      )
      .lean();

    if (!convo) return res.status(404).json({ error: "conversation not found" });

    const parts = Array.isArray(convo.participants) ? convo.participants : [];

    // Ensure requester is in this conversation (allow either User or ParticipantUser)
    const requesterInConvo = parts.some(
      (p) =>
        (p?.actor?.model === "User" && String(p.actor?.id) === String(requesterId)) ||
        (p?.actor?.model === "ParticipantUser" && String(p.actor?.id) === String(requesterId))
    );
    if (!requesterInConvo) {
      return res.status(403).json({ error: "forbidden - you are not a participant of this conversation" });
    }

    // Collect ids by model
    const userIds = parts
      .filter((p) => p?.actor?.model === "User" && p?.actor?.id)
      .map((p) => OID(p.actor.id));
    const participantUserIds = parts
      .filter((p) => p?.actor?.model === "ParticipantUser" && p?.actor?.id)
      .map((p) => OID(p.actor.id));

    // Fetch docs via Mongoose models (NOT req.app.get('db'))
    const [users, participants] = await Promise.all([
      userIds.length
        ? USER.find({ _id: { $in: userIds } })
            .select("_id name fullName handleUserName picture email")
            .lean()
        : [],
      participantUserIds.length
        ? ParticipantUser.find({ _id: { $in: participantUserIds } })
            .select("_id name fullName username picture email")
            .lean()
        : [],
    ]);

    const userMap = Object.fromEntries(users.map((u) => [String(u._id), u]));
    const participantMap = Object.fromEntries(participants.map((u) => [String(u._id), u]));

    // Hydrate participants with their profile doc
    const hydratedParticipants = parts.map((p) => {
      const model = p?.actor?.model;
      const idStr = p?.actor?.id ? String(p.actor.id) : null;
      const base = {
        actor: { model, id: idStr },
        role: p.role,
        joined_at: p.joined_at,
        last_read_at: p.last_read_at,
        last_read_message_id: p.last_read_message_id,
        muted: p.muted,
      };
      if (!model || !idStr) return { ...base, profile: null };

      const profile =
        model === "User" ? userMap[idStr] || null
        : model === "ParticipantUser" ? participantMap[idStr] || null
        : null;

      return { ...base, profile };
    });

    // Identify follower (ParticipantUser) and influencer (User)
    const followerEntry = hydratedParticipants.find((p) => p.actor.model === "ParticipantUser");
    const influencerEntry = hydratedParticipants.find((p) => p.actor.model === "User");

    return res.json({
      ok: true,
      conversation: {
        _id: String(convo._id),
        conversation_type: convo.conversation_type,
        metadata: convo.metadata,
        last_message: convo.last_message ? String(convo.last_message) : null,
        last_message_text: convo.last_message_text || "",
        last_message_at: convo.last_message_at || null,
        message_count: convo.message_count || 0,
        participants: hydratedParticipants,
        createdAt: convo.createdAt,
        updatedAt: convo.updatedAt,
      },
      participant: followerEntry?.profile || null,  // follower profile doc
      influencer: influencerEntry?.profile || null, // influencer (User) profile doc
      participantRole: followerEntry?.role || "member",
      participantMetadata: {
        role: followerEntry?.role || "member",
        last_read_at: followerEntry?.last_read_at || null,
        joined_at: followerEntry?.joined_at || null,
        muted: !!followerEntry?.muted,
      },
      others: hydratedParticipants
        .filter((p) => p.actor.model === "User" && p.actor.id !== String(influencerEntry?.actor?.id))
        .map((p) => p.profile)
        .filter(Boolean),
    });
  } catch (err) {
    console.error("DEBUG: GET conversation error:", err);
    return res.status(500).json({ error: "internal", details: err.message });
  }
});

  router.get("/conversations/:conversationId/messages", authenticateToken, async (req, res) => {
    try {
      const { conversationId } = req.params;
      if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
        return res.status(400).json({ error: "conversationId required and must be a valid ObjectId" });
      }

      const requesterId = req.user?.user_id;
      if (!requesterId || !mongoose.Types.ObjectId.isValid(requesterId)) {
        return res.status(401).json({ error: "unauthenticated" });
      }

      // Load convo just to confirm membership (as a User)
      const convo = await Conversation.findOne({
        _id: conversationId,
        "participants.actor.model": "User",
        "participants.actor.id": new mongoose.Types.ObjectId(requesterId),
        is_deleted: { $ne: true },
      })
        .select("_id participants")
        .lean();

      if (!convo) return res.status(403).json({ error: "forbidden - you are not a participant of this conversation" });

      // Fetch messages (new schema)
      const docs = await Message.find({
        conversation: new mongoose.Types.ObjectId(conversationId),
        is_deleted: { $ne: true },
      })
        .sort({ createdAt: 1 })
        .select("_id text attachments status createdAt sender recipients")
        .lean();

     const messages = docs.map((m) => {
        const s = m.sender || null; // { model, id }
        const sModel = s?.model || null;
        const sId = s?.id ? String(s.id) : null;

        const senderRole =
          sModel === "User" ? "influencer"
          : sModel === "ParticipantUser" ? "participant"
          : undefined;

        return {
          _id: String(m._id),
          conversation: { _id: String(conversationId) },
          text: m.text || "",
          createdAt: m.createdAt,
          sender: s ? { model: sModel, id: sId } : null,
          senderRole,
          attachments: m.attachments || [],
          status: m.status || "sent",
        };
      });

      return res.json({
        ok: true,
        conversation: { _id: String(conversationId) },
        messages,
      });
    } catch (err) {
      console.error("GET conversation messages error:", err);
      return res.status(500).json({ error: "internal", details: err.message });
    }
  });

router.post("/messages/send", authenticateParticipant, async (req, res) => {
  try {
    const { conversationId, text, attachments } = req.body || {};
    const OID = (v) => new mongoose.Types.ObjectId(String(v));
    const actorKey = (model, id) => `${model}:${id.toString()}`;

    // ---- validate inputs ----
    if (!conversationId) {
      return res.status(400).json({ error: "conversationId required and must be a valid ObjectId" });
    }
    const trimmed = String(text ?? "").trim();
    if (!trimmed) {
      return res.status(400).json({ error: "text required" });
    }

    // ---- participant auth ----
    const participantId = req.user?.user_id || req.user?.id;
    if (!participantId) {
      return res.status(401).json({ error: "unauthenticated" });
    }
    const participantOID = OID(participantId);

    // ---- load conversation & membership check ----
    const convo = await Conversation.findById(conversationId).lean();
    if (!convo) return res.status(404).json({ error: "conversation not found" });

    const parts = Array.isArray(convo.participants) ? convo.participants : [];
    const isInConvo = parts.some(
      (p) => p?.actor?.model === "ParticipantUser" && String(p.actor?.id) === String(participantOID)
    );
    if (!isInConvo) {
      return res.status(403).json({ error: "forbidden - you are not a participant of this conversation" });
    }

    // ---- recipients: everyone except the participant sender ----
    const recipients = parts
      .map((p) => p.actor)
      .filter(Boolean)
      .filter((a) => !(a.model === "ParticipantUser" && String(a.id) === String(participantOID)))
      .map((a) => ({ model: a.model, id: OID(String(a.id)) }));

    // ---- persist message ----
    const created = await Message.create({
      conversation: OID(conversationId),
      sender: { model: "ParticipantUser", id: participantOID },
      recipients,
      text: trimmed,
      attachments: Array.isArray(attachments) ? attachments : [],
      status: "sent",
      categories: [],
      delivery: {},
      meta: {},
      is_deleted: false,
    });

    // ---- denorm updates (unread_counts) ----
    const incPaths = {};
    for (const r of recipients) {
      incPaths[`unread_counts.${actorKey(r.model, r.id)}`] = 1;
    }
    await Conversation.findByIdAndUpdate(convo._id, {
      $set: {
        last_message: created._id,
        last_message_text: trimmed.slice(0, 500),
        last_message_at: created.createdAt || new Date(),
      },
      $inc: { message_count: 1, ...incPaths },
    });

    // ---- response payload (same shape as socket) ----
    const responseMessage = {
      _id: String(created._id),
      conversation: { _id: String(conversationId) },
      sender: { model: "ParticipantUser", id: String(participantOID) },
      recipients: recipients.map((r) => ({ model: r.model, id: String(r.id) })),
      text: created.text,
      attachments: created.attachments || [],
      status: created.status,
      createdAt: created.createdAt,
      senderRole: "participant",
    };

    // ---- realtime fanout ----
    const io = req.app.get("io");
    if (io) {
      io.to(`conversation:${String(convo._id)}`).emit("message:received", { message: responseMessage });
      for (const r of recipients) {
        const rid = String(r.id);
        if (r.model === "User") io.to(`influencer:${rid}`).emit("message:received", { message: responseMessage });
        if (r.model === "ParticipantUser") io.to(`participant:${rid}`).emit("message:received", { message: responseMessage });
      }
    }

    return res.json({ ok: true, message: responseMessage });
  } catch (err) {
    console.error("POST /messages/send error:", err);
    return res.status(500).json({ error: "internal", details: err?.message || String(err) });
  }
});


router.post("/messages/send-as-influencer", authenticateToken, async (req, res) => {
  try {
    const { conversationId, text, attachments } = req.body || {};

    // 1) input validation
    if (!conversationId ) {
      return res.status(400).json({ error: "conversationId required and must be a valid ObjectId" });
    }
    const trimmed = String(text ?? "").trim();
    if (!trimmed) return res.status(400).json({ error: "text required" });

    // 2) requester (influencer) identity
    const requesterId = req.user?.user_id || req.user?.id;
    if (!requesterId) {
      return res.status(401).json({ error: "unauthenticated" });
    }
    const requesterOID = OID(requesterId);

    // 3) ensure requester is a 'User' participant in the conversation
    const convo = await Conversation.findOne({
      _id: OID(conversationId),
      "participants.actor.model": "User",
      "participants.actor.id": requesterOID,
      is_deleted: { $ne: true },
    }).lean();

    if (!convo) {
      return res.status(403).json({ error: "forbidden - you are not a participant of this conversation" });
    }

    const participantsArr = Array.isArray(convo.participants) ? convo.participants : [];

    // 4) compute recipients = everyone except the influencer sender
    const recipients = participantsArr
      .map((p) => p?.actor)
      .filter(Boolean)
      .filter((a) => !(a.model === "User" && String(a.id) === String(requesterOID)))
      .map((a) => ({ model: a.model, id: OID(String(a.id)) }));

    // 5) persist message
    const created = await Message.create({
      conversation: OID(conversationId),
      sender: { model: "User", id: requesterOID },
      recipients,
      text: trimmed,
      attachments: Array.isArray(attachments) ? attachments : [],
      status: "sent",
      categories: [],
      delivery: {},
      meta: {},
      is_deleted: false,
    });

    // 6) denorm updates (IMPORTANT: use actorKey for unread_counts to match schema)
    const incPaths = {};
    for (const r of recipients) {
      incPaths[`unread_counts.${actorKey(r.model, r.id)}`] = 1;
    }

    await Conversation.findByIdAndUpdate(convo._id, {
      $set: {
        last_message: created._id,
        last_message_text: trimmed.slice(0, 500),
        last_message_at: created.createdAt || new Date(),
      },
      $inc: { message_count: 1, ...incPaths },
    });

    // 7) build response payload consistent with socket path
    const responseMessage = {
      _id: String(created._id),
      conversation: { _id: String(conversationId) },
      sender: { model: "User", id: String(requesterOID) },
      recipients: recipients.map((r) => ({ model: r.model, id: String(r.id) })),
      text: created.text,
      attachments: created.attachments || [],
      status: created.status,
      createdAt: created.createdAt,
      senderRole: "influencer",
    };

    // 8) realtime fanout
    const io = req.app.get("io");
    if (io) {
      io.to(`conversation:${String(convo._id)}`).emit("message:received", { message: responseMessage });
      for (const r of recipients) {
        const rid = String(r.id);
        if (r.model === "User") io.to(`influencer:${rid}`).emit("message:received", { message: responseMessage });
        if (r.model === "ParticipantUser") io.to(`participant:${rid}`).emit("message:received", { message: responseMessage });
      }
    }

    return res.json({ ok: true, message: responseMessage });
  } catch (err) {
    console.error("POST /messages/send-as-influencer error:", err);
    return res.status(500).json({ error: "internal", details: err?.message || String(err) });
  }
});

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

      // Filter to only "incoming to influencer"
      {
        $match: {
          $and: [
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
      name: new RegExp(`^${name}$`, "i"),
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



    res.cookie("tokenMyhandleProf", token, {
  httpOnly: true,
  secure: true,                  // required when SameSite=None
  sameSite: "none",              // critical for iOS/Safari & any cross-site/iframe usage
   domain: ".myhandle.in",// needed if crossing subdomains
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

router.post("/participant-user-login-gmail", async (req, res) => {
  try {
    const { email, firstName, lastName, picture } = req.body;
    console.log("email : ", email);

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
   domain: ".myhandle.in",// needed if crossing subdomains
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
      { handleUserName, goal, updated_at: new Date() },
      { new: true }
    ).select("-password"); // remove sensitive fields if any

    return res.json({ success: true, message: "Username saved", user: updated });
  } catch (err) {
    console.error("handle-username error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
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
    const inferred = extractHandleFromHost(host, ["myhandle.in"]);
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


export default router;

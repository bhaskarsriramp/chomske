import axios from "axios";
import User from "../models/User.js";
import { encryptToken, decryptUserTokens } from "../utils/tokenCrypto.js";


const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const FB_API = "https://graph.facebook.com/v24.0";
const DAY_MS = 24 * 60 * 60 * 1000;



async function daysLeft(expiry) {
  if (!expiry) return -Infinity;
  return Math.floor((new Date(expiry).getTime() - Date.now()) / DAY_MS);
}

export async function refreshFbTokensForUser(user) {
  // 1️⃣ Exchange for a fresh Long-Lived User Token
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

  // Calculate expiry (Prefer API 'expires_in', fallback to 58 days)
  const expiresInSec = llResp.data?.expires_in;
  let newUserExpiry;
  if (expiresInSec && Number(expiresInSec) > 0) {
    newUserExpiry = new Date(Date.now() + Number(expiresInSec) * 1000);
  } else {
    newUserExpiry = new Date(Date.now() + 58 * DAY_MS);
  }

  // 2️⃣ Refresh Page Token (Using /me/accounts Workaround)
  let newPageToken = user.fbPageAccessToken || null;

  if (user.fbPageId) {
    try {
      // Query /me/accounts instead of /<page_id> to avoid pages_read_engagement requirement
      const accountsResp = await axios.get(`${FB_API}/me/accounts`, {
        params: {
          access_token: newUserLL,
          fields: "id,access_token",
          limit: 100, // Fetch enough pages to ensure we find ours
        },
      });

      const pages = accountsResp.data?.data || [];
      
      // Find the page matching the user's stored fbPageId
      const targetPage = pages.find((p) => p.id === user.fbPageId);

      if (targetPage && targetPage.access_token) {
        newPageToken = targetPage.access_token;
        console.log(`✅ Page Token refreshed via /me/accounts for Page ID: ${user.fbPageId}`);
      } else {
        console.warn(`⚠️ Page ID ${user.fbPageId} not found in user's account list during refresh.`);
      }
    } catch (pageErr) {
      console.error("❌ Failed to fetch /me/accounts during refresh:", pageErr?.response?.data || pageErr.message);
      // We do not throw here; we still want to save the fresh User Token even if Page Token fetch fails
    }
  }

  // 3️⃣ Save updates to DB (encrypt tokens at rest)
  await User.findByIdAndUpdate(user._id, {
    fbLongLivedToken: encryptToken(newUserLL),
    fbLongLivedTokenExpiry: newUserExpiry,
    fbPageAccessToken: encryptToken(newPageToken),
    fbLastRefreshAt: new Date(),
    fbNeedsReconnect: false,
    updated_at: new Date(),
  });

  return {
    fbPageAccessToken: newPageToken,
    fbPageId: user.fbPageId,
  };
}

export async function ensureFreshPageTokenForUser(userId) {
  const user = await User.findById(userId)
    .select("_id instagramConnected fbLongLivedToken fbLongLivedTokenExpiry fbPageId fbPageAccessToken igUserId")
    .lean();
  decryptUserTokens(user);

  const base = {
    fbPageAccessToken: null,
    fbPageId: user?.fbPageId || null,
    fbLongLivedToken: null,
    igUserId: user?.igUserId || null,
  };

  if (!user || !user.instagramConnected) return base;
  if (!user.fbLongLivedToken) return { ...base, fbPageAccessToken: null };

  const remain = await daysLeft(user.fbLongLivedTokenExpiry);

  if (remain < 28) {
    try {
      const refreshed = await refreshFbTokensForUser(user);
      // Re-fetch to get the updated fbLongLivedToken from DB after refresh
      const updated = await User.findById(userId)
        .select("fbLongLivedToken fbPageAccessToken fbPageId igUserId")
        .lean();
      decryptUserTokens(updated);
      return {
        fbPageAccessToken: refreshed.fbPageAccessToken || null,
        fbPageId: refreshed.fbPageId || null,
        fbLongLivedToken: updated?.fbLongLivedToken || null,
        igUserId: updated?.igUserId || null,
      };
    } catch (e) {
      console.error("⚠️ FB refresh failed:", e?.response?.data || e.message);
      await User.findByIdAndUpdate(userId, { fbNeedsReconnect: true });
      return {
        fbPageAccessToken: user.fbPageAccessToken || null,
        fbPageId: user.fbPageId || null,
        fbLongLivedToken: user.fbLongLivedToken || null,
        igUserId: user.igUserId || null,
      };
    }
  }

  return {
    fbPageAccessToken: user.fbPageAccessToken || null,
    fbPageId: user.fbPageId || null,
    fbLongLivedToken: user.fbLongLivedToken || null,
    igUserId: user.igUserId || null,
  };
}
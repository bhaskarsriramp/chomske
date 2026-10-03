/**
 * geo.js: which country a request comes from, for the currency it pays in.
 *
 * ── WHY IT MATTERS ───────────────────────────────────────────────────────────
 * Credits are sold in rupees inside India and in dollars everywhere else. A
 * rupee order is what makes Razorpay offer UPI and netbanking, which is how
 * India pays; a dollar order is what an international card can actually be
 * charged in. Same packs, same credits, two price tags.
 *
 * ── IN ORDER OF AUTHORITY ────────────────────────────────────────────────────
 *   1. Cloudflare's cf-ipcountry, if the site is ever put behind Cloudflare.
 *   2. The visitor's own IP, looked up in geoip-lite's bundled database: no
 *      key, no network call, and the address never leaves this server.
 *      `trust proxy` (server.js) makes req.ip the address nginx forwarded.
 *   3. The browser's timezone, sent as a hint. ONLY when the address is
 *      private or unknown (localhost, a test box): a hint can be typed by
 *      anyone, so it is never allowed to overrule a real address.
 *
 * Same idea as betaFounderProduction's detectCountry (routes/usersOn.js),
 * without the paid lookup.
 */
import geoip from "geoip-lite";

/** 10/8, 172.16/12, 192.168/16, loopback, link-local, and their IPv6 forms. */
function isPrivate(ip) {
  if (!ip) return true;
  if (ip === "::1" || ip === "127.0.0.1" || ip.startsWith("127.")) return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("169.254.")) return true;
  const m = ip.match(/^172\.(\d+)\./);
  if (m && +m[1] >= 16 && +m[1] <= 31) return true;
  const low = ip.toLowerCase();
  return low.startsWith("fc") || low.startsWith("fd") || low.startsWith("fe80");
}

/** The caller's address, without the IPv4-in-IPv6 wrapper Node puts on it. */
export function clientIp(req) {
  const raw = String(req.ip || req.socket?.remoteAddress || "").trim();
  return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
}

/**
 * An uppercase ISO country code, or "" when nothing could tell.
 * @param {import("express").Request} req
 * @param {string} [hint] the browser's guess ("IN"), used only for private addresses
 */
export function detectCountry(req, hint = "") {
  const cf = String(req.headers["cf-ipcountry"] || "").toUpperCase();
  if (cf && cf !== "XX" && cf !== "T1") return cf;

  const ip = clientIp(req);
  if (!isPrivate(ip)) {
    try {
      const c = geoip.lookup(ip)?.country;
      if (c) return String(c).toUpperCase();
    } catch {
      /* an address the database cannot parse: unknown */
    }
    // A public address the database does not know: dollars, not a guess.
    return "";
  }

  const h = String(hint || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(h) ? h : "";
}

/** "INR" for India, "USD" for everyone else, including anyone we cannot place. */
export function currencyFor(country) {
  return country === "IN" ? "INR" : "USD";
}

export default { detectCountry, currencyFor, clientIp };

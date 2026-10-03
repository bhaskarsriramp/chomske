/**
 * routes/launch.js: product demos generated from a website address
 * (models/LaunchVideo.js, made by services/launch/launchRunner.js).
 *
 *   GET    /studio/launch                 the creator's generated videos, and what is left today
 *   POST   /studio/launch        { url }  start one
 *   GET    /studio/launch/:id             one, with its versions and chat
 *   POST   /studio/launch/:id/refine { message }   ask for a change
 *   POST   /studio/launch/:id/retry       a first cut that failed, again
 *   GET    /studio/launch/:id/download?v=N         a download link for one version
 *   POST   /studio/launch/:id/unlock      pay for a free demo's clean file
 *   DELETE /studio/launch/:id             the video and every file of it
 *
 * ── PAID, OUT OF BETA (2026-10-03) ──────────────────────────────────────────
 * A demo costs DEMO_CREDITS, taken when it is asked for and given back if the
 * first cut never comes out (launchRunner.js); there is no daily allowance.
 * A first-time creator (never bought credits, never had a demo) gets one free:
 * it is made like any other but plays with the Clipo watermark burned in
 * (services/launch/watermark.js), and its clean file is paid for, at the same
 * price, when it is downloaded (POST /:id/unlock). That is separate from the
 * free recording in the editor (services/studio/videoBilling.js).
 *
 * Changes asked for in the chat: an account that has never bought credits
 * gets LAUNCH_FREE_CHANGES of them, ever; every change after that, and every
 * change from an account that has bought credits, costs LAUNCH_CHANGE_CREDITS.
 * A change that fails is given back. Admins are not charged.
 *
 * ── THE ADDRESS IS CHECKED BEFORE ANYTHING OPENS IT ──────────────────────────
 * The page is read by TinyFish and photographed in their browser. A browser
 * on our own machine is used only when LAUNCH_LOCAL_FALLBACK=1 (off in the
 * app). Even so, an address that names, or resolves to, a private or local
 * network is refused here: nobody gets to point us at ourselves or at the
 * metadata service.
 */
import express from "express";
import mongoose from "mongoose";
import dns from "dns/promises";
import net from "net";
import LaunchVideo from "../models/LaunchVideo.js";
import User from "../models/User.js";
import authenticateToken from "../middleware/authenticateToken.js";
import { newDemoSlug } from "../services/studio/demoSlug.js";
import { readUrl } from "../services/media/storage.js";
import { stableUrl } from "../services/studio/demoService.js";
import { launchAvailable, removeLaunchFiles } from "../services/launch/launchRunner.js";
import { spend, refund, getBalance, getWallet, InsufficientCredits } from "../services/creditsService.js";
import CreditWallet from "../models/CreditWallet.js";
import { hasPurchased } from "../services/studio/videoBilling.js";

const router = express.Router();
router.use(authenticateToken);

const int = (v, d) => (parseInt(v, 10) >= 0 ? parseInt(v, 10) : d);
/** What one generated demo costs: a minute of video (creditPricing.js). */
const DEMO_CREDITS = int(process.env.LAUNCH_DEMO_CREDITS, 60);
/** Changes an account that has never bought credits may ask for, in total. */
const FREE_CHANGES = int(process.env.LAUNCH_FREE_CHANGES, 3);
/** What every other change costs. */
const CHANGE_CREDITS = int(process.env.LAUNCH_CHANGE_CREDITS, 10);
const MESSAGE_MAX = 600;

const baseUrlOf = () => String(process.env.PUBLIC_API_URL || "").replace(/\/$/, "");
const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    console.error(`[launch] ${req.method} ${req.originalUrl} failed:`, err);
    if (!res.headersSent) fail(res, 500, err.userMessage || "Something went wrong. Please try again.");
  }
};

/* ── The address ─────────────────────────────────────────────────────────── */

function privateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:");
}

/** A public http(s) page, normalised; or null with the reason. */
export async function checkUrl(raw) {
  let s = String(raw || "").trim();
  if (!s) return { error: "Paste your website's address." };
  if (s.length > 500) return { error: "That address is too long." };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  let u;
  try {
    u = new URL(s);
  } catch {
    return { error: "That doesn't look like a website address." };
  }
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) return { error: "Use a normal web address, starting with https://." };
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".") || net.isIP(host.replace(/^\[|\]$/g, "")) || /(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/.test(host)) {
    return { error: "Use your website's public address, not a local or internal one." };
  }
  if (u.port && !["80", "443"].includes(u.port)) return { error: "Use your website's public address." };
  try {
    const addrs = await dns.lookup(host, { all: true });
    if (!addrs.length || addrs.some((a) => privateAddress(a.address))) return { error: "Use your website's public address, not a local or internal one." };
  } catch {
    return { error: "We couldn't find that website. Check the address." };
  }
  u.hash = "";
  return { url: u.toString(), domain: host.replace(/^www\./, "") };
}

/* ── The allowance ───────────────────────────────────────────────────────── */

/**
 * The free generated demo, as this account stands: available until it has
 * been given to one. An account that has bought credits, or that had a demo
 * come out during the free beta, has had its free one.
 */
async function freeDemo(userId) {
  const wallet = await getWallet(userId);
  if (wallet?.launch_trial) return { available: false, demo: String(wallet.launch_trial) };
  if (await hasPurchased(userId, wallet)) return { available: false, demo: null };
  if (await LaunchVideo.exists({ user: userId, "versions.0": { $exists: true } })) return { available: false, demo: null };
  return { available: true, demo: null };
}

const isPaid = (doc) => doc?.billing?.paid !== false;

/**
 * What this creator can do now.
 *   demo_cost          what generating a demo costs
 *   free_demo          the next demo is their free one
 *   free_changes_left  free chat changes left, for an account that has never bought credits
 *   change_cost        what the next change costs: 0 while a free one is left
 *   changes_left       how many changes can be asked for right now, free or paid
 */
async function allowance(userId) {
  const user = await User.findById(userId).select("admin").lean();
  if (user?.admin) {
    return { admin: true, demo_cost: 0, free_demo: false, changes_left: 99, free_changes_left: 99, change_cost: 0, change_credits: CHANGE_CREDITS, balance: 0 };
  }
  const [free, purchased, balance] = await Promise.all([freeDemo(userId), hasPurchased(userId), getBalance(userId)]);
  // Free changes are for an account that has never bought credits, counted
  // over its whole life: every change it has had that did not fail.
  const used = purchased
    ? FREE_CHANGES
    : await LaunchVideo.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(String(userId)) } },
      { $unwind: "$chat" },
      { $match: { "chat.role": "user", "chat.kind": "refine", "chat.failed": { $ne: true } } },
      { $count: "n" },
    ]).then((r) => r[0]?.n || 0);
  const freeLeft = Math.max(0, FREE_CHANGES - used);
  const cost = freeLeft > 0 ? 0 : CHANGE_CREDITS;
  return {
    admin: false,
    demo_cost: DEMO_CREDITS,
    free_demo: free.available,
    free_changes_left: freeLeft,
    change_cost: cost,
    change_credits: CHANGE_CREDITS,
    changes_left: freeLeft > 0 ? freeLeft : Math.floor(balance / Math.max(1, CHANGE_CREDITS)),
    balance,
  };
}

/* ── Shapes ──────────────────────────────────────────────────────────────── */

const media = (key) => (key ? stableUrl(key, { baseUrl: baseUrlOf(), optional: true }) : "");

async function shapeCard(d) {
  const last = (d.versions || [])[d.versions.length - 1];
  return {
    id: d.slug,
    url: d.url,
    domain: d.domain,
    title: d.title || d.domain,
    status: d.status,
    stage: d.stage,
    progress: d.progress,
    error: d.error,
    busy: d.status === "queued" || d.status === "running",
    // A free demo not yet paid for plays with the watermark (watermark.js).
    billing: { paid: isPaid(d), trial: !!d.billing?.trial, price: DEMO_CREDITS },
    versions: (d.versions || []).length,
    seconds: last?.seconds || 0,
    thumb_url: await media(d.thumb_key),
    created_at: d.created_at,
    updated_at: d.updated_at,
  };
}

async function shapeVideo(d) {
  return {
    ...(await shapeCard(d)),
    pending: d.pending?.kind ? { kind: d.pending.kind, text: d.pending.text } : null,
    versions: await Promise.all(
      // Unpaid: the watermarked copy, never the clean file.
      (d.versions || []).map(async (v) => ({ v: v.v, seconds: v.seconds, scenes: v.scenes, voiced: v.voiced, request: v.request, created_at: v.created_at, url: await media(isPaid(d) ? v.key : v.preview_key) }))
    ),
    chat: (d.chat || []).map((c) => ({ role: c.role, text: c.text, v: c.v, failed: !!c.failed, at: c.at })),
  };
}

async function ownVideo(req, res) {
  const doc = await LaunchVideo.findOne({ slug: String(req.params.id || ""), user: req.user.id });
  if (!doc) {
    fail(res, 404, "Video not found.");
    return null;
  }
  return doc;
}

/* ── Routes ──────────────────────────────────────────────────────────────── */

router.get("/", wrap(async (req, res) => {
  const docs = await LaunchVideo.find({ user: req.user.id }).sort({ created_at: -1 }).limit(30).lean();
  res.json({
    success: true,
    available: launchAvailable(),
    limits: await allowance(req.user.id),
    videos: await Promise.all(docs.map(shapeCard)),
  });
}));

router.post("/", wrap(async (req, res) => {
  if (!launchAvailable()) return fail(res, 503, "Generating demos isn't available right now. Please try again later.");
  const checked = await checkUrl(req.body?.url);
  if (checked.error) return fail(res, 400, checked.error);
  const limits = await allowance(req.user.id);
  const notes = String(req.body?.notes || "").replace(/\s+/g, " ").trim().slice(0, MESSAGE_MAX);
  const now = new Date();
  // Free (a first-time creator's one), or paid for now; given back if the
  // first cut never comes out (launchRunner.js).
  let billing;
  if (limits.admin) billing = { paid: true, credits: 0, via: "admin" };
  else if (limits.free_demo) billing = { paid: false, trial: true };
  else {
    try {
      await spend(req.user.id, DEMO_CREDITS, { reason: "launch", note: `demo of ${checked.domain}` });
    } catch (err) {
      if (!(err instanceof InsufficientCredits)) throw err;
      return fail(res, 402, `Generating a demo uses ${DEMO_CREDITS} credits and you have ${err.balance}.`, {
        insufficient_credits: true, needed: err.needed, balance: err.balance, limits,
      });
    }
    billing = { paid: true, credits: DEMO_CREDITS, via: "create", paid_at: now };
  }
  const doc = await LaunchVideo.create({
    user: req.user.id,
    slug: newDemoSlug(),
    url: checked.url,
    domain: checked.domain,
    title: checked.domain,
    notes,
    status: "queued",
    pending: { kind: "create", text: checked.url, at: now },
    stage: "Waiting to start",
    chat: [{ role: "user", kind: "create", text: notes ? `${checked.url}\n${notes}` : checked.url, at: now }],
    billing,
  });
  // The free one is stamped on the wallet, once: a second request racing this
  // one finds it taken and is not a second free demo.
  if (billing.trial) {
    const r = await CreditWallet.updateOne({ user: req.user.id, launch_trial: null }, { $set: { launch_trial: doc._id } });
    if (r.modifiedCount !== 1) {
      await LaunchVideo.deleteOne({ _id: doc._id });
      return fail(res, 409, "Your free demo is already being made.", { limits: await allowance(req.user.id) });
    }
  }
  res.json({ success: true, video: await shapeVideo(doc.toObject()), limits: await allowance(req.user.id) });
}));

router.get("/:id", wrap(async (req, res) => {
  const doc = await ownVideo(req, res);
  if (!doc) return;
  res.json({ success: true, video: await shapeVideo(doc.toObject()), limits: await allowance(req.user.id) });
}));

router.post("/:id/refine", wrap(async (req, res) => {
  const doc = await ownVideo(req, res);
  if (!doc) return;
  if (doc.status === "queued" || doc.status === "running") return fail(res, 409, "Wait for this version to finish, then ask for the next change.");
  if (!(doc.versions || []).length) return fail(res, 409, "There's no video to change yet.");
  if (!launchAvailable()) return fail(res, 503, "Changes aren't available right now. Please try again later.");
  const message = String(req.body?.message || "").replace(/\s+/g, " ").trim().slice(0, MESSAGE_MAX);
  if (message.length < 3) return fail(res, 400, "Say what you'd like changed.");
  const limits = await allowance(req.user.id);
  // Paid for before it is queued; given back if it fails (launchRunner.js).
  let charged = 0;
  if (limits.change_cost > 0) {
    try {
      await spend(req.user.id, limits.change_cost, { reason: "launch", refType: "LaunchVideo", refId: doc._id, note: "change" });
      charged = limits.change_cost;
    } catch (err) {
      if (!(err instanceof InsufficientCredits)) throw err;
      return fail(res, 402, `Each change uses ${limits.change_cost} credits and you have ${err.balance}.`, {
        insufficient_credits: true, needed: err.needed, balance: err.balance, limits,
      });
    }
  }
  const now = new Date();
  const updated = await LaunchVideo.findOneAndUpdate(
    { _id: doc._id, status: { $in: ["done", "failed"] } },
    {
      $set: { status: "queued", pending: { kind: "refine", text: message, at: now }, stage: "Waiting to start", progress: 0, error: "", attempts: 0, updated_at: now },
      $push: { chat: { role: "user", kind: "refine", text: message, charged, at: now } },
    },
    { new: true }
  ).lean();
  if (!updated) {
    if (charged) await refund(req.user.id, charged, { refType: "LaunchVideo", refId: doc._id, note: "change not started" }).catch(() => {});
    return fail(res, 409, "Wait for this version to finish, then ask for the next change.");
  }
  res.json({ success: true, video: await shapeVideo(updated), limits: await allowance(req.user.id) });
}));

router.post("/:id/retry", wrap(async (req, res) => {
  const doc = await ownVideo(req, res);
  if (!doc) return;
  if (doc.status !== "failed" || (doc.versions || []).length) return fail(res, 409, "There's nothing to retry.");
  if (!launchAvailable()) return fail(res, 503, "Generating demos isn't available right now. Please try again later.");
  // A failed first cut gave its credits back; trying again pays again. The
  // free demo stays free.
  const limits = await allowance(req.user.id);
  let paidNow = 0;
  if (!limits.admin && !doc.billing?.trial && !isPaid(doc)) {
    try {
      await spend(req.user.id, DEMO_CREDITS, { reason: "launch", refType: "LaunchVideo", refId: doc._id, note: `demo of ${doc.domain}, again` });
      paidNow = DEMO_CREDITS;
    } catch (err) {
      if (!(err instanceof InsufficientCredits)) throw err;
      return fail(res, 402, `Generating a demo uses ${DEMO_CREDITS} credits and you have ${err.balance}.`, {
        insufficient_credits: true, needed: err.needed, balance: err.balance, limits,
      });
    }
  }
  const now = new Date();
  const updated = await LaunchVideo.findOneAndUpdate(
    { _id: doc._id, status: "failed" },
    {
      $set: {
        status: "queued", pending: { kind: "create", text: doc.url, at: now }, stage: "Waiting to start", progress: 0, error: "", attempts: 0, created_at: now, updated_at: now,
        ...(paidNow ? { "billing.paid": true, "billing.credits": paidNow, "billing.via": "create", "billing.paid_at": now } : {}),
      },
      $push: { chat: { role: "user", kind: "create", text: `Try again: ${doc.url}`, at: now } },
    },
    { new: true }
  ).lean();
  if (!updated) {
    if (paidNow) await refund(req.user.id, paidNow, { refType: "LaunchVideo", refId: doc._id, note: "retry not started" }).catch(() => {});
    return fail(res, 409, "There's nothing to retry.");
  }
  res.json({ success: true, video: await shapeVideo(updated), limits: await allowance(req.user.id) });
}));

router.get("/:id/download", wrap(async (req, res) => {
  const doc = await ownVideo(req, res);
  if (!doc) return;
  const v = parseInt(req.query.v, 10);
  const entry = (doc.versions || []).find((x) => x.v === v) || (doc.versions || [])[doc.versions.length - 1];
  if (!entry) return fail(res, 404, "There's no video to download yet.");
  if (!isPaid(doc)) {
    return fail(res, 402, `Downloading this demo uses ${DEMO_CREDITS} credits.`, { unlock: true, needed: DEMO_CREDITS, balance: await getBalance(req.user.id) });
  }
  const safe = String(doc.title || doc.domain || "demo").replace(/[^\w\s-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "demo";
  const url = await readUrl(entry.key, { baseUrl: baseUrlOf(), filename: `${safe}-demo-v${entry.v}.mp4`, contentType: "video/mp4" });
  res.json({ success: true, url });
}));

/**
 * POST /studio/launch/:id/unlock
 *
 * Pay for a free demo's clean file: DEMO_CREDITS, once. From then on it plays
 * and downloads without the watermark, every version of it. Atomic on
 * billing.paid: false, so two presses pay once.
 */
router.post("/:id/unlock", wrap(async (req, res) => {
  const doc = await ownVideo(req, res);
  if (!doc) return;
  if (isPaid(doc)) return res.json({ success: true, video: await shapeVideo(doc.toObject()), limits: await allowance(req.user.id) });
  try {
    await spend(req.user.id, DEMO_CREDITS, { reason: "launch", refType: "LaunchVideo", refId: doc._id, note: `clean file of ${doc.domain}` });
  } catch (err) {
    if (!(err instanceof InsufficientCredits)) throw err;
    // A second press that lost to the first: the credits went on this demo.
    const now = await LaunchVideo.findById(doc._id).lean();
    if (isPaid(now)) return res.json({ success: true, video: await shapeVideo(now), limits: await allowance(req.user.id) });
    return fail(res, 402, `Downloading this demo uses ${DEMO_CREDITS} credits and you have ${err.balance}.`, {
      insufficient_credits: true, needed: err.needed, balance: err.balance,
    });
  }
  const now = new Date();
  const won = await LaunchVideo.findOneAndUpdate(
    { _id: doc._id, "billing.paid": false },
    { $set: { "billing.paid": true, "billing.credits": DEMO_CREDITS, "billing.via": "unlock", "billing.paid_at": now, updated_at: now } },
    { new: true }
  ).lean();
  if (!won) await refund(req.user.id, DEMO_CREDITS, { refType: "LaunchVideo", refId: doc._id, note: "already unlocked" }).catch(() => {});
  const fresh = won || (await LaunchVideo.findById(doc._id).lean());
  res.json({ success: true, video: await shapeVideo(fresh), limits: await allowance(req.user.id) });
}));

router.delete("/:id", wrap(async (req, res) => {
  const doc = await ownVideo(req, res);
  if (!doc) return;
  if (doc.status === "queued" || doc.status === "running") return fail(res, 409, "This video is still being made. Delete it once it's finished.");
  // A free demo that never came out was not had: the next one is free again.
  if (doc.billing?.trial && !(doc.versions || []).length) {
    await CreditWallet.updateOne({ user: req.user.id, launch_trial: doc._id }, { $set: { launch_trial: null } }).catch(() => {});
  }
  await LaunchVideo.deleteOne({ _id: doc._id });
  removeLaunchFiles(doc).catch((err) => console.error(`[launch] removing files of ${doc.slug}:`, err.message));
  res.json({ success: true });
}));

export default router;

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
 *   DELETE /studio/launch/:id             the video and every file of it
 *
 * ── FREE, WITH A DAILY ALLOWANCE ─────────────────────────────────────────────
 * Free while it is in beta. Each creator may start LAUNCH_DAILY_VIDEOS videos
 * and ask for LAUNCH_DAILY_CHANGES changes in any 24 hours; a request whose
 * work failed is not counted. Admins are not limited. The allowance also keeps
 * one creator from spending the day's voice quota for everyone.
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

const router = express.Router();
router.use(authenticateToken);

const int = (v, d) => (parseInt(v, 10) >= 0 ? parseInt(v, 10) : d);
const DAILY_VIDEOS = int(process.env.LAUNCH_DAILY_VIDEOS, 2);
const DAILY_CHANGES = int(process.env.LAUNCH_DAILY_CHANGES, 10);
const MESSAGE_MAX = 600;
const DAY_MS = 24 * 60 * 60 * 1000;

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

async function allowance(userId) {
  const user = await User.findById(userId).select("admin").lean();
  if (user?.admin) return { admin: true, videos_left: 99, changes_left: 99, daily_videos: DAILY_VIDEOS, daily_changes: DAILY_CHANGES };
  const since = new Date(Date.now() - DAY_MS);
  const [videos, changes] = await Promise.all([
    LaunchVideo.countDocuments({ user: userId, created_at: { $gte: since }, status: { $ne: "failed" } }),
    LaunchVideo.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(String(userId)), updated_at: { $gte: since } } },
      { $unwind: "$chat" },
      { $match: { "chat.role": "user", "chat.kind": "refine", "chat.failed": { $ne: true }, "chat.at": { $gte: since } } },
      { $count: "n" },
    ]).then((r) => r[0]?.n || 0),
  ]);
  return {
    admin: false,
    videos_left: Math.max(0, DAILY_VIDEOS - videos),
    changes_left: Math.max(0, DAILY_CHANGES - changes),
    daily_videos: DAILY_VIDEOS,
    daily_changes: DAILY_CHANGES,
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
      (d.versions || []).map(async (v) => ({ v: v.v, seconds: v.seconds, scenes: v.scenes, voiced: v.voiced, request: v.request, created_at: v.created_at, url: await media(v.key) }))
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
  if (limits.videos_left <= 0) {
    return fail(res, 429, `You've generated ${DAILY_VIDEOS} demos in the last 24 hours, the most while this is in beta. Try again tomorrow.`, { limits });
  }
  const notes = String(req.body?.notes || "").replace(/\s+/g, " ").trim().slice(0, MESSAGE_MAX);
  const now = new Date();
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
  });
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
  if (limits.changes_left <= 0) {
    return fail(res, 429, `You've asked for ${DAILY_CHANGES} changes in the last 24 hours, the most while this is in beta. Try again tomorrow.`, { limits });
  }
  const now = new Date();
  const updated = await LaunchVideo.findOneAndUpdate(
    { _id: doc._id, status: { $in: ["done", "failed"] } },
    {
      $set: { status: "queued", pending: { kind: "refine", text: message, at: now }, stage: "Waiting to start", progress: 0, error: "", attempts: 0, updated_at: now },
      $push: { chat: { role: "user", kind: "refine", text: message, at: now } },
    },
    { new: true }
  ).lean();
  if (!updated) return fail(res, 409, "Wait for this version to finish, then ask for the next change.");
  res.json({ success: true, video: await shapeVideo(updated), limits: await allowance(req.user.id) });
}));

router.post("/:id/retry", wrap(async (req, res) => {
  const doc = await ownVideo(req, res);
  if (!doc) return;
  if (doc.status !== "failed" || (doc.versions || []).length) return fail(res, 409, "There's nothing to retry.");
  if (!launchAvailable()) return fail(res, 503, "Generating demos isn't available right now. Please try again later.");
  const limits = await allowance(req.user.id);
  if (limits.videos_left <= 0) return fail(res, 429, "You've reached today's limit for new demos. Try again tomorrow.", { limits });
  const now = new Date();
  const updated = await LaunchVideo.findOneAndUpdate(
    { _id: doc._id, status: "failed" },
    {
      $set: { status: "queued", pending: { kind: "create", text: doc.url, at: now }, stage: "Waiting to start", progress: 0, error: "", attempts: 0, created_at: now, updated_at: now },
      $push: { chat: { role: "user", kind: "create", text: `Try again: ${doc.url}`, at: now } },
    },
    { new: true }
  ).lean();
  if (!updated) return fail(res, 409, "There's nothing to retry.");
  res.json({ success: true, video: await shapeVideo(updated), limits: await allowance(req.user.id) });
}));

router.get("/:id/download", wrap(async (req, res) => {
  const doc = await ownVideo(req, res);
  if (!doc) return;
  const v = parseInt(req.query.v, 10);
  const entry = (doc.versions || []).find((x) => x.v === v) || (doc.versions || [])[doc.versions.length - 1];
  if (!entry) return fail(res, 404, "There's no video to download yet.");
  const safe = String(doc.title || doc.domain || "demo").replace(/[^\w\s-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "demo";
  const url = await readUrl(entry.key, { baseUrl: baseUrlOf(), filename: `${safe}-demo-v${entry.v}.mp4`, contentType: "video/mp4" });
  res.json({ success: true, url });
}));

router.delete("/:id", wrap(async (req, res) => {
  const doc = await ownVideo(req, res);
  if (!doc) return;
  if (doc.status === "queued" || doc.status === "running") return fail(res, 409, "This video is still being made. Delete it once it's finished.");
  await LaunchVideo.deleteOne({ _id: doc._id });
  removeLaunchFiles(doc).catch((err) => console.error(`[launch] removing files of ${doc.slug}:`, err.message));
  res.json({ success: true });
}));

export default router;

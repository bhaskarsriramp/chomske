/**
 * routes/autodemo.js: the auto product demo (services/studio/autodemo/).
 *
 *   POST /studio/autodemo/:id        { brief, voice }   ask for one (replaces any in progress)
 *   GET  /studio/autodemo/:id                           where it is
 *   POST /studio/autodemo/:id/undo                      put back what the last one replaced
 *
 * Its own router, mounted beside routes/studio.js, so the studio's routes are
 * untouched by it. `:id` is the demo's slug or its id, as everywhere else.
 *
 * Free for now, like the voiceover and the chat: the automatic edit it builds
 * on is the paid action, and it is paid for through the usual route.
 */
import express from "express";
import mongoose from "mongoose";
import StudioDemo from "../models/StudioDemo.js";
import authenticateToken from "../middleware/authenticateToken.js";
import { isDemoSlug, ensureDemoSlug } from "../services/studio/demoSlug.js";
import { requestAutodemo, undoAutodemo, shapeAutodemo, cleanBrief, BRIEF_MIN } from "../services/studio/autodemo/job.js";

const router = express.Router();
router.use(authenticateToken);

const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    console.error(`[autodemo] ${req.method} ${req.originalUrl} failed:`, err);
    if (!res.headersSent) fail(res, 500, err.userMessage || "Something went wrong. Please try again.");
  }
};

/** The caller's own demo, by slug or by id (the same lookup routes/studio.js makes). */
async function ownDemo(req, res) {
  const key = String(req.params.id || "");
  const by = isDemoSlug(key) ? { slug: key } : mongoose.Types.ObjectId.isValid(key) ? { _id: key } : null;
  const demo = by ? await StudioDemo.findOne({ ...by, user: req.user.id }) : null;
  if (!demo) {
    fail(res, 404, "Recording not found.");
    return null;
  }
  await ensureDemoSlug(demo);
  return demo;
}

router.post("/:id", wrap(async (req, res) => {
  const demo = await ownDemo(req, res);
  if (!demo) return;
  if (demo.purged) return fail(res, 410, "This recording's files have been deleted.");
  const brief = cleanBrief(req.body?.brief);
  if (brief.length < BRIEF_MIN) {
    return fail(res, 400, "Describe what this demo should show in a few words, e.g. who it's for and what they should learn.");
  }
  const autodemo = await requestAutodemo(demo, { brief, voice: String(req.body?.voice || ""), user: req.user.id });
  res.json({ success: true, autodemo });
}));

router.get("/:id", wrap(async (req, res) => {
  const demo = await ownDemo(req, res);
  if (!demo) return;
  res.json({ success: true, autodemo: shapeAutodemo(demo.autodemo) });
}));

router.post("/:id/undo", wrap(async (req, res) => {
  const demo = await ownDemo(req, res);
  if (!demo) return;
  const done = await undoAutodemo(demo._id);
  if (!done.ok) return fail(res, 409, done.message);
  res.json({ success: true });
}));

export default router;

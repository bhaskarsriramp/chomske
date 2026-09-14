/**
 * routes/media.js: the HTTP half of LOCAL media storage.
 *
 * Only live when MEDIA_BUCKET is empty. With a bucket, the browser talks to
 * Cloud Storage directly and these answer 404.
 *
 * Mounted in server.js BEFORE the global rate limiter, on purpose. A 1 GB upload
 * is ~130 chunk requests and a <video> scrubbing through a preview issues a
 * range request per seek; both would trip a per-minute ceiling meant for API
 * calls. Every request here carries a signed, expiring token naming exactly one
 * file and one operation, which is the actual guard.
 */
import express from "express";
import { storageKind, handleLocalUpload, handleLocalRead } from "../services/media/storage.js";

const router = express.Router();

const localOnly = (handler) => (req, res, next) => {
  if (storageKind() !== "local") return res.status(404).end();
  return Promise.resolve(handler(req, res)).catch(next);
};

router.put("/upload/:token", localOnly(handleLocalUpload));
router.get("/file/:token", localOnly(handleLocalRead));
router.head("/file/:token", localOnly(handleLocalRead));

export default router;

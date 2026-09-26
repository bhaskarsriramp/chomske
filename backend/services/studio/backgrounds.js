/**
 * backgrounds.js: images a creator uploads to put behind their demo.
 *
 * ── EVERY UPLOAD IS RE-DRAWN, NEVER STORED AS SENT ───────────────────────────
 * The file is decoded and drawn again as a JPEG no larger than 4K on its long
 * side, plus a small thumbnail for the picker. That does three jobs at once: a
 * 12,000 pixel photo does not become a 12,000 pixel input to every export; the
 * camera's metadata (location included) is dropped rather than republished; and
 * whatever else was riding inside the file does not survive, because only the
 * pixels are kept. Transparent PNGs are flattened onto a dark ground, the one a
 * backdrop with no image would have.
 *
 * ── THE SIZE IS CHECKED BEFORE ANYTHING IS DECODED ───────────────────────────
 * Ten megabytes of PNG can describe a 30,000 × 30,000 image, which is gigabytes
 * once decoded. The dimensions are read from the file's own header first and
 * anything unreasonable is refused before the decoder is asked to allocate.
 */
import os from "os";
import path from "path";
import fsp from "fs/promises";
import mongoose from "mongoose";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import StudioAsset from "../../models/StudioAsset.js";
import { KEY_ROOT, putFile, materialize, removeObject } from "../media/storage.js";
import { stableUrl } from "./demoService.js";

const int = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export const BACKGROUND_LIMITS = {
  maxBytes: int(process.env.STUDIO_BACKGROUND_MAX_MB, 10) * 1024 * 1024,
  maxPerUser: int(process.env.STUDIO_BACKGROUNDS_PER_USER, 100),
  // What is stored: 4K on the long side is the largest export there is.
  storeSide: 3840,
  thumbSide: 480,
  // What is accepted: past this the file is refused unread (see the header).
  maxSide: 12000,
  maxPixels: 60_000_000,
  minSide: 64,
};

export const BACKGROUND_TYPES = ["image/png", "image/jpeg", "image/webp"];

const userError = (message, status = 400) => Object.assign(new Error(message), { userMessage: message, status });

/** Which of the three formats this really is, from its first bytes, or null. */
function sniff(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return "png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length > 16 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

/** Width and height from the header alone, without decoding. Null if unreadable. */
function headerSize(buf, type) {
  try {
    if (type === "png") return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    if (type === "webp") {
      const chunk = buf.toString("ascii", 12, 16);
      if (chunk === "VP8X") return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
      if (chunk === "VP8L") {
        const b = buf.readUInt32LE(21);
        return { w: (b & 0x3fff) + 1, h: ((b >>> 14) & 0x3fff) + 1 };
      }
      if (chunk === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      return null;
    }
    // JPEG: walk the segments to the first start-of-frame.
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const m = buf[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) {
        i += m === 0xff ? 1 : 2;
        continue;
      }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  } catch {
    /* a truncated header is an unreadable one */
  }
  return null;
}

/** The image redrawn as a JPEG no longer than `side` on its long edge. */
async function redraw(img, side, quality) {
  const k = Math.min(1, side / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * k));
  const h = Math.max(1, Math.round(img.height * k));
  const cv = createCanvas(w, h);
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#0b0d12";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return { buf: await cv.encode("jpeg", quality), w, h };
}

/**
 * Check an upload and redraw it. Throws an error carrying `userMessage` and a
 * `status` for anything the creator should be told about.
 */
export async function prepareBackground(buf) {
  const L = BACKGROUND_LIMITS;
  if (!Buffer.isBuffer(buf) || !buf.length) throw userError("Choose a PNG, JPEG or WebP image.");
  if (buf.length > L.maxBytes) throw userError(`That image is over ${Math.round(L.maxBytes / 1048576)} MB.`, 413);

  const type = sniff(buf);
  if (!type) throw userError("That file isn't a PNG, JPEG or WebP image.", 415);

  const dims = headerSize(buf, type);
  if (!dims || !(dims.w > 0 && dims.h > 0)) throw userError("That image couldn't be read. Try saving it again as a PNG or JPEG.");
  if (dims.w > L.maxSide || dims.h > L.maxSide || dims.w * dims.h > L.maxPixels) {
    throw userError(`That image is ${dims.w} × ${dims.h}. Use one under ${L.maxSide.toLocaleString("en-US")} pixels on its longest side.`);
  }
  if (dims.w < L.minSide || dims.h < L.minSide) throw userError("That image is too small to use as a background.");

  let img;
  try {
    img = await loadImage(buf);
  } catch {
    throw userError("That image couldn't be read. Try saving it again as a PNG or JPEG.");
  }

  const full = await redraw(img, L.storeSide, 90);
  const thumb = await redraw(img, L.thumbSide, 80);
  return { full, thumb };
}

const keyFor = (user, id, suffix) => `${KEY_ROOT}/studio/${user}/backgrounds/${id}${suffix}.jpg`;

/** Store a prepared image as the user's new background. Returns the asset row. */
export async function saveBackground(user, prepared) {
  const asset = new StudioAsset({ user, kind: "background" });
  asset.key = keyFor(user, asset._id, "");
  asset.thumb_key = keyFor(user, asset._id, "_thumb");
  asset.width = prepared.full.w;
  asset.height = prepared.full.h;
  asset.size = prepared.full.buf.length;

  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "clipo-bg-"));
  try {
    const fullPath = path.join(dir, "full.jpg");
    const thumbPath = path.join(dir, "thumb.jpg");
    await fsp.writeFile(fullPath, prepared.full.buf);
    await fsp.writeFile(thumbPath, prepared.thumb.buf);
    await putFile(fullPath, asset.key, "image/jpeg");
    await putFile(thumbPath, asset.thumb_key, "image/jpeg");
  } finally {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }

  await asset.save();
  return asset;
}

/**
 * Delete one of the user's backgrounds: the row, then both files.
 *
 * The row goes first, so the image stops being listed or rendered at once even
 * if the storage call then fails; a file left behind is logged, never shown.
 * A demo that still names it simply has no background from then on: the
 * renderer and the preview both treat a missing image that way.
 *
 * @returns {Promise<boolean>} false when there was no such image of theirs
 */
export async function deleteBackground(user, id) {
  if (!mongoose.Types.ObjectId.isValid(String(id || ""))) return false;
  const asset = await StudioAsset.findOneAndDelete({ _id: id, user, kind: "background" }).lean();
  if (!asset) return false;
  for (const key of [asset.key, asset.thumb_key]) {
    await removeObject(key).catch((err) => console.warn(`[studio] background ${id}: could not remove ${key}: ${err.message}`));
  }
  return true;
}

/** What the browser is told about one background: an id and two URLs. */
export async function shapeBackground(a, { baseUrl } = {}) {
  return {
    id: String(a._id),
    url: await stableUrl(a.key, { baseUrl }),
    thumb_url: await stableUrl(a.thumb_key || a.key, { baseUrl }),
    width: a.width || 0,
    height: a.height || 0,
  };
}

/**
 * The image behind a demo's export, ready for the canvas, or null.
 *
 * Looked up with the demo's owner, never by id alone: the id comes from a
 * timeline the browser wrote. Null when it is gone or unreadable, and the
 * caller draws no background rather than failing the export.
 */
export async function loadBackgroundImage({ id, user, workDir }) {
  if (!user || !mongoose.Types.ObjectId.isValid(String(id || ""))) return null;
  const asset = await StudioAsset.findOne({ _id: id, user, kind: "background" }).lean();
  if (!asset) return null;
  try {
    const file = await materialize(asset.key, workDir, "background-image.jpg");
    return await loadImage(file);
  } catch (err) {
    console.warn(`[studio] background image ${id} could not be loaded: ${err.message}`);
    return null;
  }
}

export default {
  BACKGROUND_LIMITS, BACKGROUND_TYPES, prepareBackground, saveBackground, deleteBackground, shapeBackground, loadBackgroundImage,
};

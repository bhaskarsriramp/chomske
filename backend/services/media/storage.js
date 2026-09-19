/**
 * storage.js: where uploaded footage and finished videos live.
 *
 * ── TWO BACKENDS, ONE SURFACE ────────────────────────────────────────────────
 *   gcs    MEDIA_BUCKET is set. The browser uploads STRAIGHT to Cloud Storage
 *          over a resumable session, and reads through short-lived signed URLs.
 *          Footage never passes through this server or nginx, which is the only
 *          way a 1 GB phone recording on a mobile connection is survivable.
 *   local  MEDIA_BUCKET is empty. Files sit under MEDIA_LOCAL_DIR and the same
 *          chunked protocol is served by routes/media.js. For development and
 *          for a single-VM install; it is not a CDN and does not pretend to be.
 *
 * Callers never branch on which one is active. They ask for an upload session,
 * a local path to hand to ffmpeg, a URL to put in a <video>, or a prefix to
 * delete, and this file answers in whichever terms apply.
 *
 * ── THE KEYS ─────────────────────────────────────────────────────────────────
 *   lipi/edit/<user>/<project>/src/<media>.<ext>     what was uploaded
 *   lipi/edit/<user>/<project>/proxy/<media>.mp4     the 540p copy the editor plays
 *   lipi/edit/<user>/<project>/audio/<media>.mp3     the speech track analysis reads
 *   lipi/edit/<user>/<project>/thumb/<media>.jpg
 *   lipi/edit/<user>/<project>/renders/<render>.mp4  exports
 * Everything a project owns shares one prefix, so deleting a project is one call.
 *
 * ── THE BUCKET IS SHARED ─────────────────────────────────────────────────────
 * solosaas-bucket also holds betaFounderProduction's files, the same way the
 * Redis node is shared and every key there carries `hg:`. So every key here
 * starts with KEY_ROOT, and every delete refuses a prefix outside it: a bug in
 * this project's retention sweep must not be able to reach the other project's
 * objects at all, not merely be unlikely to.
 */
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const BUCKET = String(process.env.MEDIA_BUCKET || "").trim();
const LOCAL_ROOT = path.resolve(process.env.MEDIA_LOCAL_DIR || path.join(HERE, "..", "..", ".media"));

/**
 * Upload chunk size. A multiple of 256 KiB, which Cloud Storage's resumable
 * protocol requires of every chunk but the last. Eight megabytes is small
 * enough that a dropped connection loses seconds, not minutes.
 */
export const CHUNK_BYTES = 8 * 1024 * 1024;

export const storageKind = () => (BUCKET ? "gcs" : "local");

/** The top-level folder every key of this project lives under. */
export const KEY_ROOT = String(process.env.MEDIA_PREFIX || "lipi").replace(/^\/+|\/+$/g, "") || "lipi";

let _bucket = null;
async function bucket() {
  if (!_bucket) {
    // Loaded on first use, so a local install never pays for the client.
    const { Storage } = await import("@google-cloud/storage");
    _bucket = new Storage().bucket(BUCKET);
  }
  return _bucket;
}

/** A key as a path on disk, refusing anything that could climb out of the root. */
function localFile(key) {
  const clean = String(key || "").replace(/\\/g, "/");
  if (!clean || clean.startsWith("/") || clean.split("/").some((p) => p === ".." || p === "")) {
    throw new Error(`invalid storage key: ${key}`);
  }
  return path.join(LOCAL_ROOT, ...clean.split("/"));
}

const secret = () => process.env.JWT_SECRET;

/**
 * Start an upload.
 *
 * @returns {{ kind, url, chunk_bytes }}  the browser PUTs chunks to `url` with a
 *   Content-Range header, in both modes. See src/components/Edit/uploads.js.
 */
export async function createUploadSession({ key, contentType, size, origin, baseUrl }) {
  if (storageKind() === "gcs") {
    const b = await bucket();
    // `origin` is what makes Cloud Storage answer the browser's chunk PUTs with
    // CORS headers. The bucket's own CORS policy must also allow it; see
    // scripts/configureMediaBucket.js.
    const [url] = await b.file(key).createResumableUpload({
      origin,
      metadata: { contentType: contentType || "application/octet-stream" },
    });
    return { kind: "gcs", url, chunk_bytes: CHUNK_BYTES };
  }

  const token = jwt.sign({ k: key, op: "put", max: size, ct: contentType }, secret(), { expiresIn: "24h" });
  return { kind: "local", url: `${baseUrl}/media/upload/${token}`, chunk_bytes: CHUNK_BYTES };
}

/** Size of a stored object, or null when it is not there. */
export async function statObject(key) {
  if (storageKind() === "gcs") {
    try {
      const [meta] = await (await bucket()).file(key).getMetadata();
      return { size: Number(meta.size) || 0 };
    } catch (err) {
      if (err?.code === 404) return null;
      throw err;
    }
  }
  try {
    const st = await fsp.stat(localFile(key));
    return { size: st.size };
  } catch {
    return null;
  }
}

/**
 * A path ffmpeg can read.
 *
 * Local mode hands back the file where it already is. Cloud mode downloads it
 * into the job's working directory, which the runner deletes afterwards.
 */
export async function materialize(key, workDir, name) {
  if (storageKind() === "local") return localFile(key);
  const dest = path.join(workDir, name || path.basename(key));
  await (await bucket()).file(key).download({ destination: dest });
  return dest;
}

/** Store a file this server produced. */
export async function putFile(localPath, key, contentType) {
  if (storageKind() === "gcs") {
    const st = await fsp.stat(localPath);
    await (await bucket()).upload(localPath, {
      destination: key,
      resumable: st.size > CHUNK_BYTES,
      metadata: { contentType },
    });
    return;
  }
  const dest = localFile(key);
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.copyFile(localPath, dest);
}

/**
 * A URL a browser can fetch this object from.
 *
 * `filename` turns it into a download ("Save as") rather than something to play
 * inline, which is what an export link wants and a preview does not.
 */
export async function readUrl(key, { baseUrl, filename, contentType, expiresSec = 12 * 3600 } = {}) {
  const safeName = filename ? String(filename).replace(/["\\\r\n]/g, "").slice(0, 120) : "";
  if (storageKind() === "gcs") {
    const [url] = await (await bucket()).file(key).getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + expiresSec * 1000,
      ...(safeName ? { responseDisposition: `attachment; filename="${safeName}"` } : {}),
      ...(contentType ? { responseType: contentType } : {}),
    });
    return url;
  }
  const token = jwt.sign({ k: key, op: "get", ct: contentType, fn: safeName }, secret(), { expiresIn: expiresSec });
  return `${baseUrl}/media/file/${token}`;
}

/**
 * The only prefixes a delete is ever allowed to name.
 *
 * Exactly one product's folder for exactly one user's one project — never the
 * section, never the user, never the root. The bucket is shared with another
 * project entirely (see the header), so a bug in a retention sweep must not be
 * ABLE to reach anything else, rather than merely be unlikely to.
 *
 * `studio` was added beside `edit` when the demo recorder arrived. Adding a
 * section here is the deliberate act; that is the point of the list.
 */
const DELETABLE_SECTIONS = ["edit", "studio"];

/** Remove everything under a prefix. */
export async function removePrefix(prefix) {
  // Never anything shallower than one project's own folder: the bucket is shared.
  const allowed = new RegExp(`^${KEY_ROOT}/(${DELETABLE_SECTIONS.join("|")})/[^/]+/[^/]+/?$`);
  if (!prefix || !allowed.test(String(prefix))) {
    throw new Error(`refusing to delete prefix ${prefix}`);
  }
  if (storageKind() === "gcs") {
    await (await bucket()).deleteFiles({ prefix: String(prefix).replace(/\/?$/, "/"), force: true });
    return;
  }
  await fsp.rm(localFile(String(prefix).replace(/\/$/, "")), { recursive: true, force: true });
}

/** Remove one object. Missing is not an error. */
export async function removeObject(key) {
  if (!key) return;
  if (!String(key).startsWith(`${KEY_ROOT}/`)) throw new Error(`refusing to delete ${key}`);
  if (storageKind() === "gcs") {
    await (await bucket()).file(key).delete({ ignoreNotFound: true });
    return;
  }
  await fsp.rm(localFile(key), { force: true });
}

/* ── Local mode's HTTP half ─────────────────────────────────────────────────
   Mounted by routes/media.js. The token in the path is the whole credential:
   it names one key, one operation and a size ceiling, and expires. No cookie is
   involved, which is what lets a <video> element and a cross-origin XHR use it
   without credentials. */

function verify(token, op) {
  try {
    const claims = jwt.verify(token, secret());
    return claims.op === op ? claims : null;
  } catch {
    return null;
  }
}

/**
 * PUT one chunk: `Content-Range: bytes <start>-<end>/<total>`, or a status
 * query: `Content-Range: bytes * /<total>` with no body.
 *
 * Answers `{ complete, received }` as JSON rather than Cloud Storage's 308,
 * and the client understands both.
 */
export async function handleLocalUpload(req, res) {
  const claims = verify(req.params.token, "put");
  if (!claims) return res.status(403).json({ message: "Upload link expired. Start the upload again." });

  const file = localFile(claims.k);
  await fsp.mkdir(path.dirname(file), { recursive: true });

  let have = 0;
  try { have = (await fsp.stat(file)).size; } catch { /* nothing yet */ }

  const cr = String(req.headers["content-range"] || "");
  const query = cr.match(/^bytes \*\/(\d+)$/);
  if (query) return res.json({ complete: have >= Number(query[1]), received: have });

  const m = cr.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
  if (!m) return res.status(400).json({ message: "Content-Range is required." });

  const start = Number(m[1]);
  const end = Number(m[2]);
  const total = Number(m[3]);
  if (total > Number(claims.max || 0) || end >= total || end < start) {
    return res.status(413).json({ message: "That file is larger than this upload allows." });
  }
  if (start > have) return res.status(409).json({ complete: false, received: have });

  const limit = end - start + 1;
  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(file, { flags: start === 0 ? "w" : "r+", start });
    let seen = 0;
    req.on("data", (d) => {
      seen += d.length;
      if (seen > limit) req.destroy(new Error("chunk larger than its Content-Range"));
    });
    req.on("error", reject);
    ws.on("error", reject);
    ws.on("finish", resolve);
    req.pipe(ws);
  });

  const received = Math.max(have, end + 1);
  const complete = received >= total;
  if (complete) await fsp.truncate(file, total).catch(() => {});
  return res.json({ complete, received: Math.min(received, total) });
}

/** GET with Range support, which is what makes a <video> seekable. */
export async function handleLocalRead(req, res) {
  const claims = verify(req.params.token, "get");
  if (!claims) return res.status(403).end();

  const file = localFile(claims.k);
  let size;
  try { size = (await fsp.stat(file)).size; } catch { return res.status(404).end(); }

  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", claims.ct || "application/octet-stream");
  res.setHeader("Cache-Control", "private, max-age=3600");
  if (claims.fn) res.setHeader("Content-Disposition", `attachment; filename="${claims.fn}"`);

  const range = String(req.headers.range || "");
  const m = range.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    let end = m[1] && m[2] ? Number(m[2]) : size - 1;
    end = Math.min(end, size - 1);
    if (start >= size || end < start) {
      res.setHeader("Content-Range", `bytes */${size}`);
      return res.status(416).end();
    }
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
    res.setHeader("Content-Length", end - start + 1);
    return fs.createReadStream(file, { start, end }).pipe(res);
  }

  res.setHeader("Content-Length", size);
  return fs.createReadStream(file).pipe(res);
}

export default {
  CHUNK_BYTES, storageKind, createUploadSession, statObject, materialize, putFile,
  readUrl, removePrefix, removeObject, handleLocalUpload, handleLocalRead,
};

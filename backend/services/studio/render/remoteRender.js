/**
 * remoteRender.js: the export, made by Cloud Run instead of this machine.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────
 * An export keeps a few cores busy for about as long as the video runs, and on
 * one VM every export after the first waits for the one before it. Cloud Run
 * gives each export a machine of its own, started in seconds and gone when it
 * is done (services/studio/render/cloudRender.js, deploy/render/).
 *
 * ── WHAT STAYS HERE ──────────────────────────────────────────────────────────
 * Everything that is not the picture: the queue, the credits, the database,
 * the editor's progress bar. This writes the request into the bucket, asks the
 * service to render it, relays the progress it writes, and hands back what it
 * made — the same file at the same key the local render would have written.
 *
 * ── SETTINGS ─────────────────────────────────────────────────────────────────
 *   STUDIO_RENDER_CLOUD_URL        the service's URL. Unset: exports are made
 *                                  here, exactly as before.
 *   STUDIO_RENDER_CLOUD_URL_HIGH   optional second service for 1440p and 4K
 *                                  exports (bigger machines); defaults to the first
 *   STUDIO_RENDER_CLOUD_FALLBACK   "local" (default): an export Cloud Run could
 *                                  not make is made here instead. "off": it fails.
 *   STUDIO_RENDER_CLOUD_BUSY_WAIT_S how long to keep asking while every Cloud
 *                                  Run instance is busy (default 600)
 *
 * The VM's service account needs roles/run.invoker on the service; it proves
 * who it is with an ID token from the metadata server. A localhost URL
 * (`gcloud run services proxy`, for testing) is called without one.
 */
import fsp from "fs/promises";
import path from "path";
import { GoogleAuth } from "google-auth-library";
import { putFile, materialize, removeObject } from "../../media/storage.js";

const trim = (v) => String(v || "").trim().replace(/\/+$/, "");
const num = (v, d) => (Number.isFinite(Number(v)) && String(v).trim() !== "" ? Number(v) : d);

export const CLOUD_URL = trim(process.env.STUDIO_RENDER_CLOUD_URL);
export const CLOUD_URL_HIGH = trim(process.env.STUDIO_RENDER_CLOUD_URL_HIGH) || CLOUD_URL;
export const CLOUD_FALLBACK = String(process.env.STUDIO_RENDER_CLOUD_FALLBACK || "local").trim().toLowerCase() !== "off";
const BUSY_WAIT_MS = Math.max(30, num(process.env.STUDIO_RENDER_CLOUD_BUSY_WAIT_S, 600)) * 1000;
/** Cloud Run holds a request for at most an hour; a little over, so its own answer arrives first. */
const REQUEST_TIMEOUT_MS = 62 * 60_000;

/** Whether exports go to Cloud Run. */
export const renderInCloud = () => !!CLOUD_URL;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const userError = (msg) => Object.assign(new Error(msg), { userMessage: msg });

let auth = null;
const idClients = new Map();
/** The Authorization header for the service: an ID token for its origin. */
async function authHeaders(url) {
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url + "/")) return {};
  const audience = new URL(url).origin;
  auth ||= new GoogleAuth();
  let client = idClients.get(audience);
  if (!client) {
    client = await auth.getIdTokenClient(audience);
    idClients.set(audience, client);
  }
  const h = await client.getRequestHeaders();
  return typeof h?.get === "function" ? { Authorization: h.get("authorization") } : h;
}

async function putJson(workDir, key, value) {
  const file = path.join(workDir, `cloud-${path.posix.basename(key)}`);
  await fsp.writeFile(file, JSON.stringify(value));
  await putFile(file, key, "application/json");
}

async function readJson(workDir, key) {
  const file = await materialize(key, workDir, `cloud-read-${path.posix.basename(key)}`);
  return JSON.parse(await fsp.readFile(file, "utf8"));
}

/**
 * Render on Cloud Run.
 *
 * @param {object} o
 * @param {string} o.dir         a storage folder of its own for this export's
 *                               request, progress and result
 * @param {string} o.workDir     local scratch
 * @param {object} o.request     { source_key, voice_key, background_key,
 *                               timeline, options, follows, output_key, srt_key }
 *                               (see cloudRender.js)
 * @param {number} o.resolution  picks the service (STUDIO_RENDER_CLOUD_URL_HIGH at 1440 and up)
 * @param {Function} o.onProgress (fraction, stage)
 * @returns {Promise<{ width, height, duration, drew, size, srt_key, ms }>}
 *   Throws the export's own user-facing error (err.userMessage) when the
 *   export itself refused, and any other error when Cloud Run could not make it.
 */
export async function renderRemote({ dir, workDir, request, resolution = 1080, onProgress = () => {} }) {
  const url = (resolution >= 1440 ? CLOUD_URL_HIGH : CLOUD_URL) + "/render";
  const requestKey = `${dir}/request.json`;
  await putJson(workDir, requestKey, request);

  // The progress bar, from what the renderer writes beside the request.
  let done = false;
  let rendering = false;
  const poller = (async () => {
    while (!done) {
      await sleep(3000);
      if (done) break;
      const p = await readJson(workDir, `${dir}/progress.json`).catch(() => null);
      if (p && !done) {
        rendering = true;
        onProgress(Number(p.progress) || 0.01, String(p.stage || "Rendering"));
      }
    }
  })();

  const started = Date.now();
  try {
    for (let attempt = 1; ; attempt++) {
      let res = null;
      let body = null;
      let failure = "";
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders(url)) },
          body: JSON.stringify({ request: requestKey }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const text = await res.text();
        try { body = JSON.parse(text); } catch { failure = `HTTP ${res.status}: ${text.slice(0, 160)}`; }
      } catch (err) {
        failure = String(err?.message || err);
      }
      if (res?.ok && body?.ok) {
        // Only the request, progress and result: the export itself stays.
        await Promise.all(["request", "progress", "result"].map((n) => removeObject(`${dir}/${n}.json`).catch(() => {})));
        return body;
      }
      // The export itself refused (nothing to export, a missing font): it
      // would refuse here too, so it is not tried again anywhere.
      if (body && body.ok === false && body.userMessage) throw userError(body.userMessage);
      // The renderer ran and failed.
      if (body && body.ok === false) throw new Error(`Cloud Run could not make this export: ${body.error}`);
      // Cloud Run had no free instance (all busy, or one still starting), or
      // the network dropped: asked again, for up to BUSY_WAIT_MS.
      if (Date.now() - started > BUSY_WAIT_MS) throw new Error(`Cloud Run was not available for ${Math.round(BUSY_WAIT_MS / 1000)}s: ${failure || `HTTP ${res?.status}`}`);
      if (!rendering) onProgress(0.01, "Waiting for a free renderer");
      console.warn(`[studio] cloud export ${dir}: try ${attempt} not taken (${failure || `HTTP ${res?.status}`}); asking again`);
      await sleep(Math.min(30_000, 5000 * attempt));
    }
  } finally {
    done = true;
    await poller;
  }
}

export default { CLOUD_URL, CLOUD_URL_HIGH, CLOUD_FALLBACK, renderInCloud, renderRemote };

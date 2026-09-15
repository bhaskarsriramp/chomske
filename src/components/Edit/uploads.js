/**
 * uploads.js: send a large file in resumable chunks.
 *
 * ── ONE PROTOCOL FOR BOTH STORAGE MODES ──────────────────────────────────────
 * Each chunk is a PUT with `Content-Range: bytes <start>-<end>/<total>` to the
 * session URL the server handed out. Cloud Storage answers an incomplete upload
 * with 308 and a Range header saying how much it holds; local storage answers
 * with JSON saying the same thing. Either way the next chunk starts where the
 * server says, not where the browser thinks, which is what makes a retry after
 * a dropped connection correct rather than hopeful.
 *
 * ── A DROPPED CONNECTION PAUSES AN UPLOAD, IT DOES NOT END IT ────────────────
 * Losing the network halfway (a lift, a train, wifi handing over to 4G) is
 * normal on a phone, so a network failure is never final while the page is
 * open. The upload waits, wakes the moment the browser says it is back online
 * (or on a backoff capped at 30 s, for a network that is attached but not
 * working), asks the server how much it holds, and carries on from there. A
 * request that stops moving without failing, which a half-dead connection does,
 * is abandoned after STALL_MS and treated the same way. Only the server refusing
 * (an expired link, a file too large) ends an upload, and a server that keeps
 * answering with errors.
 *
 * ── WHY XHR AND NOT fetch ────────────────────────────────────────────────────
 * Upload progress. fetch has no way to report bytes sent, and a progress bar
 * that jumps eight megabytes at a time on a slow connection looks stuck.
 */

const STALL_MS = 45000;
const MAX_WAIT_MS = 30000;
const MAX_SERVER_ERRORS = 8;

const isOnline = () => typeof navigator === "undefined" || navigator.onLine !== false;
const networkError = (why, server = false) => Object.assign(new Error(why), { network: true, server });
const abortError = () => Object.assign(new Error("aborted"), { aborted: true });

/**
 * Resolves when trying again is worth it: the browser is back online, `ms` has
 * passed, or `signal` aborted. Offline, only coming back is worth waking for,
 * with a minute as a safety net for a browser that never says so.
 */
export function waitForNetwork(ms, signal) {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener("online", done);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, isOnline() ? ms : Math.max(ms, 60000));
    window.addEventListener("online", done);
    signal?.addEventListener("abort", done);
  });
}

function put(url, body, headers, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const xhr = new XMLHttpRequest();
    let moved = Date.now();
    let why = "";
    const stop = (reason) => { why = reason; xhr.abort(); };
    const onAbort = () => stop("aborted");
    const onOffline = () => stop("offline");
    const watchdog = setInterval(() => { if (Date.now() - moved > STALL_MS) stop("stalled"); }, 5000);
    const settle = (fn) => () => {
      clearInterval(watchdog);
      window.removeEventListener("offline", onOffline);
      signal?.removeEventListener("abort", onAbort);
      fn();
    };

    xhr.open("PUT", url);
    xhr.withCredentials = false;
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (e) => {
        moved = Date.now();
        onProgress(e.loaded);
      };
    }
    xhr.onprogress = () => { moved = Date.now(); };
    xhr.onload = settle(() => resolve(xhr));
    xhr.onerror = settle(() => reject(networkError("network")));
    xhr.ontimeout = settle(() => reject(networkError("timeout")));
    xhr.onabort = settle(() => reject(why === "aborted" ? abortError() : networkError(why || "aborted")));
    window.addEventListener("offline", onOffline);
    signal?.addEventListener("abort", onAbort, { once: true });
    xhr.send(body);
  });
}

/** How many bytes the server holds, from whichever answer it gave. */
function received(xhr, total) {
  if (xhr.status === 308) {
    const range = xhr.getResponseHeader("Range");
    const m = range && range.match(/bytes=0-(\d+)/);
    return { complete: false, received: m ? Number(m[1]) + 1 : 0 };
  }
  if (xhr.status >= 200 && xhr.status < 300) {
    try {
      const json = JSON.parse(xhr.responseText || "null");
      if (json && typeof json.received === "number") return { complete: !!json.complete, received: json.received };
    } catch {
      /* Cloud Storage answers the final chunk with the object's metadata. */
    }
    return { complete: true, received: total };
  }
  return null;
}

/** The server's answer as a failure: one worth waiting out, or a refusal. */
function answerError(xhr) {
  const s = xhr.status;
  // Busy, restarting, or out of step with us (409): ask again later.
  if (s === 0 || s >= 500 || s === 408 || s === 409 || s === 429) return networkError(`status ${s}`, true);
  let message = "The upload was refused. Try again.";
  try { message = JSON.parse(xhr.responseText).message || message; } catch { /* not JSON */ }
  return Object.assign(new Error(message), { fatal: true });
}

/**
 * @param {File} file
 * @param {{ url, chunk_bytes }} session   from POST /edit/projects/:id/media (or …/resume)
 * @param {object} opts
 * @param {(fraction:number) => void} [opts.onProgress]
 * @param {(waiting:boolean) => void} [opts.onWaiting]  true while it waits for the network
 * @param {AbortSignal} [opts.signal]
 */
export async function uploadFile(file, session, { onProgress = () => {}, onWaiting = () => {}, signal } = {}) {
  const total = file.size;
  const chunk = Math.max(256 * 1024, Number(session.chunk_bytes) || 8 * 1024 * 1024);
  let offset = 0;
  let failures = 0;
  let serverErrors = 0;
  // Ask first, every time: a session handed back for a stopped upload may
  // already hold most of the file.
  let ask = true;

  for (;;) {
    if (signal?.aborted) throw abortError();
    try {
      if (ask) {
        const xhr = await put(session.url, null, { "Content-Range": `bytes */${total}` }, { signal });
        const state = received(xhr, total);
        if (!state) throw answerError(xhr);
        ask = false;
        offset = state.received;
        onProgress(offset / total);
        if (state.complete) break;
      }
      if (offset >= total) break;

      const from = offset;
      const end = Math.min(from + chunk, total) - 1;
      const xhr = await put(
        session.url,
        file.slice(from, end + 1),
        { "Content-Range": `bytes ${from}-${end}/${total}` },
        { signal, onProgress: (sent) => onProgress(Math.min(1, (from + sent) / total)) }
      );
      const state = received(xhr, total);
      if (!state) throw answerError(xhr);
      if (failures) onWaiting(false);
      failures = 0;
      serverErrors = 0;
      offset = state.received;
      onProgress(offset / total);
      if (state.complete) break;
    } catch (err) {
      if (err.server && ++serverErrors > MAX_SERVER_ERRORS) err.fatal = true;
      if (err.aborted || err.fatal) {
        if (failures) onWaiting(false);
        throw err.fatal && err.server ? Object.assign(new Error("The server kept failing to take the upload. Try again in a few minutes."), { fatal: true }) : err;
      }
      failures++;
      onWaiting(true);
      await waitForNetwork(Math.min(MAX_WAIT_MS, 1000 * 2 ** Math.min(failures, 5)), signal);
      ask = true;
    }
  }
  if (failures) onWaiting(false);
  onProgress(1);
}

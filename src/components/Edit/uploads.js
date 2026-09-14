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
 * ── WHY XHR AND NOT fetch ────────────────────────────────────────────────────
 * Upload progress. fetch has no way to report bytes sent, and a progress bar
 * that jumps eight megabytes at a time on a slow connection looks stuck.
 */

const MAX_RETRIES = 6;

function put(url, body, headers, { onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.withCredentials = false;
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    if (onProgress && xhr.upload) xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => resolve(xhr);
    xhr.onerror = () => reject(Object.assign(new Error("network"), { network: true }));
    xhr.ontimeout = () => reject(Object.assign(new Error("timeout"), { network: true }));
    xhr.onabort = () => reject(Object.assign(new Error("aborted"), { aborted: true }));
    if (signal) {
      if (signal.aborted) return xhr.abort();
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {File} file
 * @param {{ url, chunk_bytes }} session   from POST /edit/projects/:id/media
 * @param {object} opts
 * @param {(fraction:number) => void} [opts.onProgress]
 * @param {AbortSignal} [opts.signal]
 */
export async function uploadFile(file, session, { onProgress = () => {}, signal } = {}) {
  const total = file.size;
  const chunk = Math.max(256 * 1024, Number(session.chunk_bytes) || 8 * 1024 * 1024);
  let offset = 0;
  let retries = 0;

  while (offset < total) {
    if (signal?.aborted) throw Object.assign(new Error("aborted"), { aborted: true });
    const from = offset;
    const end = Math.min(from + chunk, total) - 1;
    try {
      const xhr = await put(
        session.url,
        file.slice(from, end + 1),
        { "Content-Range": `bytes ${from}-${end}/${total}` },
        { signal, onProgress: (sent) => onProgress(Math.min(1, (from + sent) / total)) }
      );
      const state = received(xhr, total);
      if (!state) {
        if (xhr.status >= 500 || xhr.status === 409 || xhr.status === 429) throw Object.assign(new Error(`status ${xhr.status}`), { network: true });
        let message = "The upload was refused. Try again.";
        try { message = JSON.parse(xhr.responseText).message || message; } catch { /* not JSON */ }
        throw Object.assign(new Error(message), { fatal: true });
      }
      retries = 0;
      if (state.complete) {
        onProgress(1);
        return;
      }
      offset = state.received;
      onProgress(offset / total);
    } catch (err) {
      if (err.aborted || err.fatal) throw err;
      if (++retries > MAX_RETRIES) throw new Error("The connection kept dropping. Try the upload again on a steadier network.");
      await wait(Math.min(15000, 1000 * 2 ** retries));
      // Ask the server where it got to before sending anything else.
      try {
        const xhr = await put(session.url, null, { "Content-Range": `bytes */${total}` }, { signal });
        const state = received(xhr, total);
        if (state?.complete) {
          onProgress(1);
          return;
        }
        if (state) offset = state.received;
      } catch (e) {
        if (e.aborted) throw e;
      }
    }
  }
  onProgress(1);
}

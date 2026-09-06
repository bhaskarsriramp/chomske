/**
 * api.js: the one HTTP client.
 *
 * ── WHY THIS IS FETCH AND NOT AXIOS ──────────────────────────────────────────
 * axios was ~40KB of the landing page's JavaScript, and the landing page makes
 * exactly one request with it (`GET /auth/me`). What the rest of the app
 * actually uses is `params`, `signal`, `{ data }` on the way out and
 * `err.response.{status,data}` on the way back: four things, all of which
 * fetch gives us in about fifty lines. Nothing about the 37 call sites changed;
 * they were written against this module's surface, not against axios's.
 *
 * credentials: "include" is the important line, the same one `withCredentials`
 * was: the session lives in an httpOnly cookie, so without it every
 * authenticated call is anonymous and 401s.
 */

export const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8001";

/** Matches the timeout axios was configured with. */
const TIMEOUT_MS = 30000;

function buildUrl(path, params) {
  const url = new URL(path.replace(/^\//, ""), API_URL.replace(/\/?$/, "/"));
  // Skipping undefined/null is what axios did, and several callers lean on it:
  // `{ profile: profileId }` with no profile must not become `?profile=undefined`.
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/**
 * The error shape the whole app catches against, and the reason errorMessage
 * below can stay unchanged:
 *   - the server answered, badly → `.response = { status, data }`
 *   - we gave up waiting        → `.code = "ECONNABORTED"`, no `.response`
 *   - the caller aborted        → `.code = "ERR_CANCELED"`, no `.response`
 *   - the network never landed  → no `.response` at all
 * A caller distinguishes "server said no" from "never reached the server" by
 * the presence of `.response`, exactly as before.
 */
function httpError(message, extra) {
  return Object.assign(new Error(message), extra);
}

async function request(method, path, body, config = {}) {
  const controller = new AbortController();
  // A flag rather than abort(reason), because we need to tell OUR timeout apart
  // from the caller's own abort, and abort reasons are not universally readable.
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, TIMEOUT_MS);

  const outer = config.signal;
  const relay = () => controller.abort();
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener("abort", relay, { once: true });
  }

  const headers = { Accept: "application/json" };
  // Only when there IS a body: a bare POST /auth/logout stays a simple request
  // rather than growing a CORS preflight it never needed.
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res;
  try {
    res = await fetch(buildUrl(path, config.params), {
      method,
      headers,
      credentials: "include",
      signal: controller.signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (timedOut) throw httpError("timeout", { code: "ECONNABORTED" });
    if (err?.name === "AbortError") throw httpError("canceled", { code: "ERR_CANCELED", name: "CanceledError" });
    throw httpError("Network Error", { code: "ERR_NETWORK" });
  } finally {
    clearTimeout(timer);
    if (outer) outer.removeEventListener("abort", relay);
  }

  // Parsed before the status check on purpose: a 402 carries the message and
  // the balance that ScriptPanel and BuyCredits read off `err.response.data`.
  const text = await res.text();
  let data = text;
  if (text) { try { data = JSON.parse(text); } catch { /* keep the raw text */ } }

  if (!res.ok) {
    throw httpError(
      (data && data.message) || `Request failed with status code ${res.status}`,
      { response: { status: res.status, data, headers: res.headers } }
    );
  }
  return { data, status: res.status, headers: res.headers };
}

const api = {
  get: (path, config) => request("GET", path, undefined, config),
  delete: (path, config) => request("DELETE", path, undefined, config),
  post: (path, body, config) => request("POST", path, body, config),
  put: (path, body, config) => request("PUT", path, body, config),
  patch: (path, body, config) => request("PATCH", path, body, config),
};

/** Pull the human-readable message out of whatever shape the failure took. */
export function errorMessage(err, fallback = "Something went wrong. Please try again.") {
  return (
    err?.response?.data?.message ||
    (err?.code === "ECONNABORTED" ? "That took too long. Please try again." : null) ||
    (!err?.response ? "Can't reach the server. Check your connection." : null) ||
    fallback
  );
}

export default api;

/**
 * transient.js: is this failure the network's, and so worth waiting out?
 *
 * Storage downloads and uploads, the model's API and the database all fail in
 * the same few ways when a connection drops or a service is briefly down: a
 * socket error code, a 5xx or 429, a fetch that never landed. Those are worth
 * trying again after a pause (editRunner.js). A file ffmpeg cannot read, or a
 * refusal that says why, is not: it fails the same way every time.
 */
const CODES = new Set([
  "ECONNRESET", "ECONNREFUSED", "ECONNABORTED", "ETIMEDOUT", "ESOCKETTIMEDOUT", "EPIPE", "ENOTFOUND", "EAI_AGAIN",
  "ENETUNREACH", "ENETDOWN", "EHOSTUNREACH", "ERR_STREAM_PREMATURE_CLOSE",
  "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT",
]);
const STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const MESSAGE = /fetch failed|socket hang up|network ?error|getaddrinfo|connection (reset|refused|closed)/i;

export function transient(err, depth = 0) {
  if (!err || depth > 3) return false;
  if (err.transient === true) return true;
  if (CODES.has(err.code)) return true;
  // Cloud Storage puts the HTTP status in `code`; the model's client in `status`.
  const status = Number(err.status ?? err.response?.status ?? (typeof err.code === "number" ? err.code : NaN));
  if (STATUSES.has(status)) return true;
  if (/^Mongo(Network|ServerSelection)/.test(String(err.name || ""))) return true;
  if (MESSAGE.test(String(err.message || ""))) return true;
  return transient(err.cause, depth + 1);
}

export default { transient };

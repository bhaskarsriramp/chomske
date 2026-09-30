/**
 * renderService.js: exports as a Cloud Run service (deploy/render/).
 *
 *     POST /render { request: "<storage key of request.json>" }
 *       → 200 { ok: true, width, height, ... }   (also written as result.json)
 *       → 500 { ok: false, error, userMessage }
 *     GET  /      → { ok: true } (health)
 *
 * One export per instance at a time (deploy with --concurrency 1): an export
 * wants every core it is given. The request stays open while it renders;
 * progress goes to progress.json beside the request (cloudRender.js).
 * Private: only callers with run.invoker on the service (the VM's service
 * account) get past Cloud Run.
 */
import http from "http";

process.env.REDIS_DISABLED = process.env.REDIS_DISABLED || "true";

const { renderFromRequest } = await import("./services/studio/render/cloudRender.js");

const PORT = Number(process.env.PORT) || 8080;
let busy = false;

const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

http
  .createServer((req, res) => {
    if (req.method === "GET" && (req.url === "/" || req.url === "/health")) return send(res, 200, { ok: true, busy });
    if (req.method !== "POST" || req.url !== "/render") return send(res, 404, { ok: false, error: "not found" });
    let body = "";
    req.on("data", (d) => {
      body += d;
      if (body.length > 64 * 1024) req.destroy();
    });
    req.on("end", async () => {
      let key = "";
      try {
        key = String(JSON.parse(body || "{}").request || "");
      } catch { /* checked below */ }
      if (!key.endsWith(".json")) return send(res, 400, { ok: false, error: "request must name a .json in the bucket" });
      // Cloud Run sends one request per instance (concurrency 1); refusing a
      // second makes a misconfigured service fail loudly instead of slowly.
      if (busy) return send(res, 429, { ok: false, error: "this instance is already rendering" });
      busy = true;
      try {
        send(res, 200, await renderFromRequest(key));
      } catch (err) {
        send(res, 500, { ok: false, error: String(err?.message || err).slice(0, 500), userMessage: err?.userMessage || "" });
      } finally {
        busy = false;
      }
    });
  })
  .listen(PORT, () => console.log(`[render] service listening on ${PORT}`));

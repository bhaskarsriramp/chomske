/**
 * renderJob.js: one export, run as a Cloud Run job (deploy/render/).
 *
 *     RENDER_REQUEST=<storage key of request.json> node renderJob.js
 *
 * The batch form of services/studio/render/cloudRender.js, for exports longer
 * than a Cloud Run service may hold a request (60 minutes). A job takes a
 * few minutes to start, so the service (renderService.js) is the usual way.
 */
process.env.REDIS_DISABLED = process.env.REDIS_DISABLED || "true";

const { renderFromRequest } = await import("./services/studio/render/cloudRender.js");

try {
  await renderFromRequest(String(process.env.RENDER_REQUEST || "").trim());
  process.exit(0);
} catch (err) {
  // A failure the export itself reported (a missing font, nothing left to
  // export) will fail the same way again: exit 0 so the job is not retried.
  process.exit(err?.userMessage ? 0 : 1);
}

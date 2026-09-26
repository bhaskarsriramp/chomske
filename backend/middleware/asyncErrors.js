/**
 * asyncErrors.js: an async route that rejects reaches the error handler.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * Express 4 hands a THROWN error to the error handler, but an async handler
 * does not throw — it returns a promise that rejects, and Express 4 ignores the
 * promise. Nothing catches it, and Node's default for an unhandled rejection is
 * to crash. So `GET /auth/me`, which every page load calls and which awaits
 * User.findById with no try/catch, took the whole API down whenever the shared
 * Atlas cluster dropped out under it (db.js) — every open socket and upload
 * with it — and the page that asked never got an answer.
 *
 * This is Express 4's own dispatch (express/lib/router/layer.js) with the one
 * line Express 5 added: a returned promise that rejects goes to next(err),
 * exactly as a throw always has. It only changes what happens on a failure
 * path that used to crash. Import it once, before the app serves anything.
 */
import Layer from "express/lib/router/layer.js";

Layer.prototype.handle_request = function handle(req, res, next) {
  const fn = this.handle;
  if (fn.length > 3) {
    // not a standard request handler
    return next();
  }
  try {
    const ret = fn(req, res, next);
    if (ret && typeof ret.then === "function") ret.then(undefined, (err) => next(err || new Error("rejected")));
  } catch (err) {
    next(err);
  }
};

/**
 * shared/canvasKey.js: a canvas drawing, named by what was drawn.
 *
 * The pointer locator draws its templates on a canvas and reads them back
 * (locate.js buildTemplate). Chrome's canvas anti-aliases differently from the
 * server's (@napi-rs/canvas) — measured: 904 of 912 templates differed — and
 * a template a pixel different finds a pointer a hair differently. So the
 * server's pixels are what the browser uses:
 *
 *   the build   draws every template on the server's canvas through this
 *               recorder, and saves each getImageData under its key
 *   the worker  records the same calls on its own canvas and, at
 *               getImageData, loads the saved pixels for that key
 *
 * The key is every method call and property set, in order, with its
 * arguments, as JSON — the same string in both engines, since they are the
 * same numbers from the same code.
 */
export function recordingContext(ctx, w, h, onRead) {
  const ops = [];
  return new Proxy(ctx, {
    get(target, prop) {
      const v = target[prop];
      if (typeof v !== "function") return v;
      if (prop === "getImageData") {
        return (...args) => onRead(JSON.stringify([w, h, ops, args]), () => v.apply(target, args), args);
      }
      return (...args) => {
        ops.push([prop, ...args]);
        return v.apply(target, args);
      };
    },
    set(target, prop, value) {
      ops.push(["=" + String(prop), value]);
      target[prop] = value;
      return true;
    },
  });
}

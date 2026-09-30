/**
 * shims/globals.js: the Node globals the analysis modules touch, and the one
 * piece of shared state every shim reports to.
 *
 * Imported first by worker.js, before anything that reads them.
 *
 *   Buffer        Buffer.from (copy; an ArrayBuffer is wrapped), alloc,
 *                 allocUnsafe, concat, isBuffer, buf.copy, buf.equals
 *   process.env   filled from the server's own settings before the analysis
 *                 modules load (several read them at import time)
 *   setImmediate  the locator yields with it between frames; a message
 *                 channel, because setTimeout(0) is clamped to 4 ms
 *
 * ── BROKEN ───────────────────────────────────────────────────────────────────
 * The analysis degrades rather than fails: a pass that throws is caught and
 * the edit is made without it. On the server that is right. Here it would be
 * wrong, because a shim failing (a missing template, a lost question to the
 * server) is not something the server would have met, and the edit would
 * quietly be a different one. So a shim that cannot do exactly what the server
 * does marks the run broken, and the worker then refuses to hand in a result
 * and gives the job back to the server.
 */
class Buffer extends Uint8Array {
  static from(x, offset, length) {
    if (typeof x === "string") return new Buffer(new TextEncoder().encode(x));
    if (x instanceof ArrayBuffer) return new Buffer(x, offset || 0, length ?? x.byteLength - (offset || 0));
    const copy = new Buffer(x.length);
    copy.set(x);
    return copy;
  }
  static alloc(n, fill = 0) {
    const b = new Buffer(n);
    if (fill) b.fill(fill);
    return b;
  }
  static allocUnsafe(n) { return new Buffer(n); }
  static isBuffer(x) { return x instanceof Buffer; }
  static concat(list, total) {
    const size = total ?? list.reduce((a, b) => a + b.length, 0);
    const out = new Buffer(size);
    let o = 0;
    for (const b of list) {
      out.set(b.subarray(0, Math.min(b.length, size - o)), o);
      o += b.length;
      if (o >= size) break;
    }
    return out;
  }
  copy(target, targetStart = 0, sourceStart = 0, sourceEnd = this.length) {
    const n = Math.min(sourceEnd - sourceStart, target.length - targetStart);
    target.set(this.subarray(sourceStart, sourceStart + n), targetStart);
    return n;
  }
  equals(other) {
    if (this.length !== other.length) return false;
    for (let i = 0; i < this.length; i++) if (this[i] !== other[i]) return false;
    return true;
  }
}

self.Buffer = Buffer;
self.process = self.process || { env: {} };

if (!self.setImmediate) {
  const ch = new MessageChannel();
  const queue = [];
  ch.port1.onmessage = () => {
    const f = queue.shift();
    if (f) f[0](...f[1]);
  };
  self.setImmediate = (fn, ...args) => {
    queue.push([fn, args]);
    ch.port2.postMessage(0);
    return queue.length;
  };
  self.clearImmediate = () => {};
}

self.__analysis = { broken: null, providerReady: false, templates: "" };

/** Mark the run as not the server's, and why. The first reason is kept. */
export function broken(reason) {
  if (!self.__analysis.broken) self.__analysis.broken = String(reason);
  return new Error(String(reason));
}

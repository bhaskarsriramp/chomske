/**
 * shims/canvas.js: @napi-rs/canvas's createCanvas, with the server's pixels.
 *
 * Every drawing the analysis makes (the locator's pointer templates) is
 * recorded, and getImageData answers with the pixels the server's canvas drew
 * for that exact drawing, from a file the build made (shared/canvasKey.js).
 * A drawing the build did not make breaks the run rather than let Chrome's
 * own anti-aliasing stand in for the server's.
 *
 * getImageData must answer at once, so the file is read with a synchronous
 * request — allowed in a worker, and each file is fetched once and cached
 * (and the HTTP cache keeps it for the next analysis).
 */
import { recordingContext } from "../shared/canvasKey.js";
import { sha1Hex } from "../shared/sha1.js";
import { decodeImage } from "../shared/templateFile.js";
import { broken } from "./globals.js";

const cache = new Map();
export const canvasStats = { hits: 0, fetched: 0 };

function serverPixels(key) {
  const name = sha1Hex(key);
  if (cache.has(name)) { canvasStats.hits++; return cache.get(name); }
  const x = new XMLHttpRequest();
  x.open("GET", self.__analysis.templates + name + ".bin", false);
  x.responseType = "arraybuffer";
  try {
    x.send();
  } catch (e) {
    throw broken("a pointer template could not be fetched: " + e.message);
  }
  if (x.status !== 200) throw broken("no pointer template for this drawing (" + name + ")");
  const img = decodeImage(new Uint8Array(x.response));
  cache.set(name, img);
  canvasStats.fetched++;
  return img;
}

export function createCanvas(w, h) {
  const c = new OffscreenCanvas(w, h);
  const getContext = c.getContext.bind(c);
  c.getContext = (kind, opts) => {
    const ctx = getContext(kind, { willReadFrequently: true, ...(opts || {}) });
    return recordingContext(ctx, w, h, (key, read, args) => {
      const img = serverPixels(key);
      if (img.width !== args[2] || img.height !== args[3]) throw broken("a pointer template is the wrong size");
      return img;
    });
  };
  return c;
}

export default { createCanvas };

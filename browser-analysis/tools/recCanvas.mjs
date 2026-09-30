/**
 * tools/recCanvas.mjs: @napi-rs/canvas, the server's own, with every
 * getImageData remembered under its drawing's key (shared/canvasKey.js).
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { recordingContext } from "../shared/canvasKey.js";

// The backend's copy of the canvas — the one the server draws with.
const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../backend/package.json"));
const real = require("@napi-rs/canvas");

export const DRAWN = new Map();
globalThis.__drawn = DRAWN;

export function createCanvas(w, h) {
  const c = real.createCanvas(w, h);
  const getContext = c.getContext.bind(c);
  c.getContext = (kind, opts) => recordingContext(getContext(kind, opts), w, h, (key, read) => {
    const img = read();
    if (!DRAWN.has(key)) DRAWN.set(key, img);
    return img;
  });
  return c;
}
export const { loadImage, Image, GlobalFonts, ImageData } = real;
export default { ...real, createCanvas };

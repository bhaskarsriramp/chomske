/**
 * env.mjs: the pipeline's keys and models.
 *
 * Read when they are used, not when this file loads: in the app the worker
 * loads its own .env first and hands over the TinyFish key from its key pool
 * (setKeys); from a terminal, launch/.env (local only, never committed) fills
 * in whatever the environment has not.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const file = path.join(ROOT, ".env");
if (fs.existsSync(file)) {
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

let tinyfishOverride = "";
/** The app's worker passes the TinyFish key it took from its pool. */
export function setKeys({ tinyfish } = {}) {
  if (tinyfish) tinyfishOverride = String(tinyfish).trim();
}
export const tinyfishKey = () => tinyfishOverride || String(process.env.TINYFISH_API_KEY || "").trim();

/** AI Studio keys, comma-separated like the backend's AISTUDIO_KEY, taken in turn. */
let turn = 0;
export function aiKey() {
  const keys = String(process.env.AISTUDIO_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  return keys.length ? keys[turn++ % keys.length] : "";
}

export const TEXT_MODEL = process.env.LAUNCH_TEXT_MODEL || "gemini-3.8-flash";
export const VOICE_MODEL = process.env.LAUNCH_VOICE_MODEL || "gemini-3.8-flash-tts";

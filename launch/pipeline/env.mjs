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

/**
 * TinyFish keys, taken in turn so requests spread across accounts (each has
 * its own rate limit), and a retry after a refusal goes out on the next key.
 * The app's worker hands over its whole pool (setKeys); a terminal uses
 * TINYFISH_API_KEY, comma-separated for more than one.
 */
let tinyfishPool = [];
let tfTurn = 0;
export function setKeys({ tinyfish, aistudio } = {}) {
  const list = (Array.isArray(tinyfish) ? tinyfish : String(tinyfish || "").split(",")).map((k) => String(k).trim()).filter(Boolean);
  if (list.length) tinyfishPool = list;
  const ai = (Array.isArray(aistudio) ? aistudio : String(aistudio || "").split(",")).map((k) => String(k).trim()).filter(Boolean);
  if (ai.length) aistudioPool = ai;
}
export function tinyfishKey() {
  const pool = tinyfishPool.length ? tinyfishPool : String(process.env.TINYFISH_API_KEY || "").split(",").map((k) => k.trim()).filter(Boolean);
  return pool.length ? pool[tfTurn++ % pool.length] : "";
}
export const tinyfishCount = () => (tinyfishPool.length || String(process.env.TINYFISH_API_KEY || "").split(",").filter((k) => k.trim()).length);

/**
 * AI Studio keys, taken in turn, so a retry after a refusal goes out on the
 * next key. The app's worker hands over its pool (setKeys: the aistudio_keys
 * collection, then its environment); a terminal uses AISTUDIO_KEY,
 * comma-separated for more than one.
 */
let aistudioPool = [];
let turn = 0;
export function aiKey() {
  const keys = aistudioPool.length
    ? aistudioPool
    : String(process.env.AISTUDIO_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "")
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
  return keys.length ? keys[turn++ % keys.length] : "";
}

export const TEXT_MODEL = process.env.LAUNCH_TEXT_MODEL || "gemini-3.8-flash";
export const VOICE_MODEL = process.env.LAUNCH_VOICE_MODEL || "gemini-3.8-flash-tts";

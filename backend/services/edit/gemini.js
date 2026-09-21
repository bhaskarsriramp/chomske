/**
 * gemini.js: the editor's one way of asking the model for JSON.
 *
 * ── THIS FILE USED TO BE THE CLIENT. NOW IT IS A NAME FOR ONE ────────────────
 * The key rotation, the cost arithmetic, the retry judgement and the pool all
 * moved to services/ai/provider.js, because they stopped being the editor's
 * business the moment the account moved to Vertex. On Vertex there are no keys
 * to rotate and the quota belongs to the project, so a per-file client cannot
 * pace itself — it has no idea what the other files are doing. One client,
 * one budget, one place to switch provider.
 *
 * What is left here is what was always specific to the editor: which models its
 * calls use. Transcription (transcribeSpeech.js), caption translation
 * (translateCaptions.js) and the studio passes all import from here, and none
 * of them should have to know how the client is built.
 */
import { generateJson, retryable, pool } from "../ai/provider.js";

export { generateJson, retryable, pool };

export const AUDIO_MODEL =
  process.env.GEMINI_AUDIO_MODEL || process.env.GEMINI_TEXT_MODEL || process.env.GEMINI_VIDEO_MODEL || "gemini-3.5-flash";
export const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || process.env.GEMINI_AUDIO_MODEL || "gemini-3.5-flash";

export default { AUDIO_MODEL, TEXT_MODEL, generateJson, retryable, pool };

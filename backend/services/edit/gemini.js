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
import { generateJson, retryable, pool, MODEL } from "../ai/provider.js";

export { generateJson, retryable, pool };

/**
 * ── THE NAMES COME FROM THE PROVIDER NOW ─────────────────────────────────────
 * These used to end in `|| "gemini-3.5-flash"`, as did ten other files, and
 * that is an AI Studio name: on Vertex it is in the catalogue and 404s on every
 * call. A default has to know which API it will be sent to, so it is chosen in
 * services/ai/provider.js beside the thing that knows. The environment variables
 * still win, and still have the same names.
 */
export const AUDIO_MODEL = MODEL.audio;
export const TEXT_MODEL = MODEL.text;

export default { AUDIO_MODEL, TEXT_MODEL, generateJson, retryable, pool };

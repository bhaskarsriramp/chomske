/**
 * videoMetadata.js: the one place that answers "how long is this video".
 *
 * ── WHY A FACADE AND NOT THREE IMPORTS ───────────────────────────────────────
 * Three separate paths measure a video before anything expensive happens to it:
 * adding a video to a voice profile (routes/transcribe.js), building a showcase
 * from an admin's list of urls (showcaseService.js), and reading a video as
 * source material for a script (sourceService.js). All three were importing the
 * provider directly, which meant swapping providers was the same edit made three
 * times, and any future difference between them would be an accident rather
 * than a decision.
 *
 * They now all call getVideoMetadata. Which provider served it is this file's
 * business and nobody else's.
 *
 * ── YOUTUBE FIRST, APIDIRECT AS A NET ────────────────────────────────────────
 * YouTube Data API v3 is the provider: free inside a 10,000 unit daily
 * allowance, one unit per call, and it returns the real title rather than a
 * translated summary of it. See services/youtubeDataClient.js for the full
 * comparison against what it replaced.
 *
 * apidirect stays wired up behind it, and this is the one piece of the swap
 * that was a judgement call rather than an instruction. The reason is written
 * in .env.example in capital letters: WITHOUT A WORKING KEY, ADDING A VIDEO IS
 * REFUSED. That gate fails closed on purpose, and correctly, but it means a
 * single provider having a bad hour takes the product's main action down with
 * it. apidirect is already configured for news and cannot be removed anyway, so
 * the fallback costs nothing while YouTube is healthy and costs half a cent a
 * video when it is not.
 *
 * It is deliberately LOUD. A silent fallback to a paid API is how a free
 * migration quietly stops being free, so every use of it logs a warning naming
 * the reason. To turn it off entirely, set VIDEO_META_FALLBACK=false.
 */
import {
  getVideoDetails as youtubeGetVideoDetails,
  isYouTubeDataConfigured,
} from "./youtubeDataClient.js";
import {
  getYouTubeVideoDetails as apidirectGetVideoDetails,
  isApidirectConfigured,
} from "./apidirectClient.js";

/** Whether a failed YouTube lookup may spend money finishing the job. */
function fallbackEnabled() {
  return String(process.env.VIDEO_META_FALLBACK || "true").trim().toLowerCase() !== "false";
}

/**
 * Is there any provider at all that can measure a video right now?
 *
 * Read by the two call sites that refuse BEFORE attempting a lookup, so the
 * user gets "paused, try later" instead of a failure that looks like their link
 * was bad. True when either provider could serve.
 */
export function isVideoMetadataConfigured() {
  return isYouTubeDataConfigured() || (fallbackEnabled() && isApidirectConfigured());
}

/**
 * Metadata for one video, from whichever provider answers.
 *
 * @param {string} input  a watch URL, a youtu.be or /shorts link, or a bare id.
 * @returns {Promise<object|null>} null means the video is genuinely unavailable
 *   (deleted, private, or never existed). Callers treat null and a thrown error
 *   differently: null is a bad link, a throw is our problem.
 * @throws {Error} with `keyExhausted` true when no provider could be reached,
 *   which is the flag both call sites already branch on to choose their wording.
 */
export async function getVideoMetadata(input) {
  let firstError = null;

  if (isYouTubeDataConfigured()) {
    try {
      return await youtubeGetVideoDetails(input);
    } catch (err) {
      firstError = err;
      console.warn(`[video-meta] youtube lookup failed: ${err.message}`);
    }
  } else {
    console.warn("[video-meta] API_KEY_YOUTUBE is not set, no free provider available");
  }

  // ── Paid net ──────────────────────────────────────────────────────────────
  // Reached only when YouTube could not answer. A video that came back as a
  // clean null is NOT an error and never lands here: it returned above.
  if (fallbackEnabled() && isApidirectConfigured()) {
    console.warn("[video-meta] falling back to apidirect, this call costs $0.005");
    try {
      return await apidirectGetVideoDetails(input);
    } catch (err) {
      // Prefer YouTube's error when we have one: it is the provider that is
      // supposed to be working, so it is the one worth reading in the logs.
      throw firstError || err;
    }
  }

  if (firstError) throw firstError;

  const err = new Error("No video metadata provider is configured");
  err.keyExhausted = true;
  throw err;
}

export default { getVideoMetadata, isVideoMetadataConfigured };

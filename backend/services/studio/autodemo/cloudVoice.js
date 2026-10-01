/**
 * autodemo/cloudVoice.js: the auto demo's second voice, Gemini-TTS through
 * Google Cloud Text-to-Speech.
 *
 * ── WHY A SECOND VOICE ───────────────────────────────────────────────────────
 * The first voice (narrator.js, AI Studio, gemini-3.8-flash-tts) is limited per
 * Google project to 10 requests a minute and 100 a DAY on Tier 1 — measured on
 * 2026-10-01 from its own 429s — and an auto demo spends 8–15 of them, so a
 * dozen demos a day across every creator used it up. Cloud Text-to-Speech
 * serves the same voices (Kore, Zephyr, Charon, Puck) with its own quota (150
 * requests a minute for gemini-2.5-flash-tts, no daily cap listed,
 * docs.cloud.google.com/text-to-speech/quotas), billed to the Cloud project.
 *
 * ── WHAT IT NEEDS ────────────────────────────────────────────────────────────
 * The project's Text-to-Speech API and Vertex AI API enabled (Gemini-TTS runs
 * on Vertex: without it every call is "Agent Platform API has not been used in
 * project…"), and Google credentials: the VM's own service account, or a
 * developer's application-default login. No key is stored.
 *
 *   STUDIO_CLOUD_TTS_MODEL     gemini-2.5-flash-tts (default) | gemini-2.5-pro-tts |
 *                              gemini-3.1-flash-tts-preview
 *   STUDIO_CLOUD_TTS_LANGUAGE  a BCP-47 code; default en-US, hi-IN for Devanagari
 *   STUDIO_CLOUD_TTS_PROJECT   the project billed; default the credentials' own
 *   STUDIO_CLOUD_TTS_RPM       requests a minute from this process (default 120)
 */
import { GoogleAuth } from "google-auth-library";

const ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";
export const CLOUD_MODEL = String(process.env.STUDIO_CLOUD_TTS_MODEL || "gemini-2.5-flash-tts").trim();
const LANGUAGE = String(process.env.STUDIO_CLOUD_TTS_LANGUAGE || "").trim();
const RPM = Math.max(1, Number(process.env.STUDIO_CLOUD_TTS_RPM) || 120);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let auth = null;
let project = null;

async function credentials() {
  if (!auth) auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("no Google credentials for Cloud Text-to-Speech");
  if (project === null) {
    project = String(
      process.env.STUDIO_CLOUD_TTS_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT ||
        (await auth.getProjectId().catch(() => "")) || ""
    ).trim();
  }
  return { token, project };
}

/** The language the voice speaks in: set, or Hindi for Devanagari text, else US English. */
export const languageOf = (text) => LANGUAGE || (/[ऀ-ॿ]/.test(String(text)) ? "hi-IN" : "en-US");

const sentAt = [];
async function slot() {
  for (;;) {
    const now = Date.now();
    while (sentAt.length && now - sentAt[0] >= 60_000) sentAt.shift();
    if (sentAt.length < RPM) {
      sentAt.push(now);
      return;
    }
    await sleep(sentAt[0] + 60_000 - now + 50);
  }
}

/**
 * One line, spoken: a 24 kHz mono 16-bit WAV, as the first voice answers, so
 * narrator.js reads both alike. Retried when the service is busy or the
 * connection drops; a refusal (no API, no permission, bad request) is not.
 */
export async function askCloud(text, { voice, style }) {
  let last = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    await slot();
    const { token, project: billed } = await credentials();
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...(billed ? { "x-goog-user-project": billed } : {}),
        },
        body: JSON.stringify({
          input: { prompt: style, text },
          voice: { languageCode: languageOf(text), name: voice, modelName: CLOUD_MODEL },
          audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: 24000 },
        }),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (err) {
      last = err;
      await sleep(800 * 2 ** (attempt - 1));
      continue;
    }
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.audioContent) return Buffer.from(body.audioContent, "base64");
    const err = new Error(`cloud speech ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
    if (res.status === 429 || res.status >= 500 || (res.ok && !body.audioContent)) {
      last = err;
      await sleep(1500 * 2 ** (attempt - 1));
      continue;
    }
    throw err;
  }
  throw last || new Error("cloud speech failed");
}

export default { askCloud, languageOf, CLOUD_MODEL };

/**
 * autodemo/cloudVoice.js: the auto demo's second voice, Gemini-TTS through
 * Google Cloud Text-to-Speech.
 *
 * ── WHY A SECOND VOICE ───────────────────────────────────────────────────────
 * The first voice (narrator.js, AI Studio, gemini-3.8-flash-tts) is limited per
 * Google project to 10 requests a minute and 100 a DAY on Tier 1 — measured on
 * 2026-10-01 from its own 429s — and an auto demo spends 8–15 of them, so a
 * dozen demos a day across every creator used it up. Cloud Text-to-Speech
 * serves the same voices (Kore, Zephyr, Charon, Puck), billed to the Cloud
 * project.
 *
 * ── ITS OWN LIMITS, MEASURED ON THIS PROJECT (2026-10-01) ────────────────────
 * Gemini-TTS runs on Vertex AI, and Vertex gives a new project 5 requests a
 * minute per voice model (aiplatform global_generate_content_requests_per_
 * minute_per_project_per_base_model = 5 for gemini-2.5-flash-tts and -pro-tts)
 * — far under the 150 the Text-to-Speech docs list. It allows short bursts
 * (10 at once went through) but refused a re-fitting pass a minute later.
 * gemini-3.1-flash-tts-preview has no such row: it runs on Google's shared
 * pay-as-you-go capacity, answered 10 at once in ~4 s each (2.5-flash: ~7 s),
 * and is the newest generation, nearest the first voice. So it is tried first,
 * and the stable 2.5-flash after it (paced at the project's quota).
 *
 * ── WHAT IT NEEDS ────────────────────────────────────────────────────────────
 * The project's Text-to-Speech API and Vertex AI API enabled (without Vertex
 * every call is "Agent Platform API has not been used in project…"), and Google
 * credentials: the VM's own service account, or a developer's
 * application-default login. No key is stored.
 *
 *   STUDIO_CLOUD_TTS_MODELS    models to try, in order, comma-separated
 *                              (default gemini-3.1-flash-tts-preview,gemini-2.5-flash-tts)
 *   STUDIO_CLOUD_TTS_LANGUAGE  a BCP-47 code; default en-US, hi-IN for Devanagari
 *   STUDIO_CLOUD_TTS_PROJECT   the project billed; default the credentials' own
 *   STUDIO_CLOUD_TTS_RPM       requests a minute for a model with a fixed
 *                              Vertex quota (default 5, this project's quota)
 */
import { GoogleAuth } from "google-auth-library";

const ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";
export const CLOUD_MODELS = String(process.env.STUDIO_CLOUD_TTS_MODELS || process.env.STUDIO_CLOUD_TTS_MODEL || "gemini-3.1-flash-tts-preview,gemini-2.5-flash-tts")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
/** Kept for anything that wants "the" cloud model: the first one tried. */
export const CLOUD_MODEL = CLOUD_MODELS[0];
const LANGUAGE = String(process.env.STUDIO_CLOUD_TTS_LANGUAGE || "").trim();
const FIXED_RPM = Math.max(1, Number(process.env.STUDIO_CLOUD_TTS_RPM) || 5);
/** Pay-as-you-go models (no fixed per-project row): paced only to be polite. */
const PAYGO_RPM = 60;
const rpmOf = (model) => (/preview/i.test(model) ? PAYGO_RPM : FIXED_RPM);

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

const sentAt = new Map();
async function slot(model) {
  const rpm = rpmOf(model);
  for (;;) {
    const now = Date.now();
    const recent = (sentAt.get(model) || []).filter((t) => now - t < 60_000);
    sentAt.set(model, recent);
    if (recent.length < rpm) {
      recent.push(now);
      return;
    }
    await sleep(recent[0] + 60_000 - now + 50);
  }
}

/**
 * One line, spoken by `model`: a 24 kHz mono 16-bit WAV, as the first voice
 * answers, so narrator.js reads both alike. A per-minute quota refusal waits
 * for the minute to turn; a busy service or a dropped connection backs off; a
 * refusal of another kind (no API, no permission, no such model) is thrown at
 * once so the narrator can try the next voice.
 */
export async function askCloud(text, { voice, style, model = CLOUD_MODEL }) {
  let last = null;
  for (let attempt = 1; attempt <= 6; attempt++) {
    await slot(model);
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
          voice: { languageCode: languageOf(text), name: voice, modelName: model },
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
    const err = new Error(`cloud speech ${model} ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
    if (res.status === 429) {
      last = err;
      // "Quota exceeded for …per_minute…": the window turns within a minute.
      await sleep(/per_minute|per minute/i.test(String(body?.error?.message || "")) ? Math.min(60_000, 20_000 * attempt) : 1500 * 2 ** (attempt - 1));
      continue;
    }
    if (res.status >= 500 || (res.ok && !body.audioContent)) {
      last = err;
      await sleep(1500 * 2 ** (attempt - 1));
      continue;
    }
    throw err;
  }
  throw last || new Error("cloud speech failed");
}

export default { askCloud, languageOf, CLOUD_MODEL, CLOUD_MODELS };

/**
 * voice.js: an AI voiceover, spoken from the captions (the editor's Voice tab).
 *
 * ── WHAT IT MAKES ────────────────────────────────────────────────────────────
 * One audio track as long as the recording, in the recording's own time, with
 * each sentence of the captions spoken where its first line starts. One track
 * rather than a file per line so the editor plays it beside the video with a
 * single <audio> element, and the export cuts it exactly as it cuts the
 * recording (render/compose.js). What is spoken is the captions grouped into
 * sentences (voices.mjs sentencesOf), because captions are cut for reading
 * and spoken line by line they sound read off cards.
 *
 * ── SPOKEN BY THE PRODUCT DEMO'S NARRATOR ────────────────────────────────────
 * It used to be spoken here, its own way: every sentence on its own in a
 * plain style, one that ran long spoken again "briskly" and sped up to 1.2x,
 * and sentences that ran into each other 0.12 s apart with the model's own
 * padding left in. The product demo's narrator (autodemo/narrator.js) was
 * tuned past exactly that, on the creator's word that it sounded "cluttered
 * and brittle": the padding taken off every take with a breath kept, a real
 * pause between sentences, no faster re-takes and no audible speed-up, one
 * voice service for the whole track (the backup when the first is out for the
 * day). The creator asked (2026-10-03) for the Voice tab to sound like the
 * demo, so the voiceover is now made by that same narrator: one presenter,
 * not cards read aloud. What it is given is the captions' sentences.
 *
 * ── EVERY SENTENCE KEPT, SO AN UPDATE SPEAKS ONLY WHAT CHANGED ───────────────
 * An edit to the captions after a voiceover is made changes a sentence or
 * two. Each take (one sentence, one voice service, one voice, the narrator's
 * delivery) is kept in the bucket as its 24 kHz samples, already trimmed,
 * under <MEDIA_PREFIX>/voice-takes/, named by a hash of all four. They are
 * handed to the narrator before it speaks, so remaking a voiceover speaks
 * only sentences never spoken before, and one whose captions only moved is
 * placed again with no model call at all. The service that already holds the
 * most of this voiceover's sentences is tried first, so an update keeps its
 * voice and its takes.
 *
 * ── SAMPLES ──────────────────────────────────────────────────────────────────
 * A voice's sample in the Voice tab is one sentence, spoken here directly
 * (ask) and kept as an MP3 (voiceSampleUrl).
 */
import crypto from "crypto";
import fsp from "fs/promises";
import os from "os";
import path from "path";
import { aistudioKeys, pool } from "../ai/provider.js";
import { withKey } from "../ai/aistudioPool.js";
import { ffmpeg } from "../media/ffmpeg.js";
import { KEY_ROOT, statObject, putFile, readUrl, isRelayUrl, materialize } from "../media/storage.js";
import { sentencesOf } from "../../../src/components/Studio/voices.mjs";
import { VOICE_MODEL } from "./voiceModel.js";
import { buildNarration, engineOrder, engineLabel, PRESENTER } from "./autodemo/narrator.js";

export { VOICE_MODEL };
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
/** The narrator's sample rate: 24 kHz, mono, 16-bit. */
const RATE = 24000;
/** How a sample is spoken (the voiceover itself is spoken in the narrator's PRESENTER style). */
const NARRATION = "clear, friendly product-demo narration";

const userError = (msg) => Object.assign(new Error(msg), { userMessage: msg });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One sentence, spoken: the model's WAV, as it came. The key comes from the
 * pool (ai/aistudioPool.js), which rests a refused key and goes on with the
 * next at once; a dropped connection or an overloaded service is tried again.
 */
async function ask(text, { voice, style = NARRATION }) {
  if (!aistudioKeys().length) throw userError("The voice-over isn't available right now. Try again later.");
  return withKey("tts", async (key) => {
    let last = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      let res;
      try {
        res = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: VOICE_MODEL,
            input: [{ type: "user_input", content: [{ type: "text", text, annotations: [{ type: "speech_metadata", style }] }] }],
            response_format: { type: "audio" },
            generation_config: { speech_config: [{ voice }] },
          }),
          signal: AbortSignal.timeout(90_000),
        });
      } catch (err) {
        last = err;
        await sleep(800 * 2 ** (attempt - 1));
        continue;
      }
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        const audio = (body.steps || []).flatMap((s) => s.content || []).find((c) => c.type === "audio" && c.data);
        if (audio) return Buffer.from(audio.data, "base64");
        last = new Error("the model answered without audio");
        continue;
      }
      const err = Object.assign(new Error(`speech ${res.status}: ${String(body?.error?.message || JSON.stringify(body)).slice(0, 400)}`), { status: res.status });
      if (res.status >= 500) {
        last = err;
        await sleep(1500 * 2 ** (attempt - 1));
        continue;
      }
      throw err;
    }
    throw last || new Error("speech failed");
  }).catch((err) => {
    if (err.daily) throw Object.assign(err, { userMessage: "Voices are busy right now. Try again in a little while." });
    throw err;
  });
}

/**
 * A short sample of a voice, for the Voice tab: the model's WAV as it came.
 * Spoken the way the voiceover will be.
 */
export async function sampleVoice(text, voice) {
  return ask(text, { voice });
}

/**
 * ── A SAMPLE IS MADE ONCE, THEN KEPT ─────────────────────────────────────────
 * A sample is the same sound every time it is asked for: one voice saying one
 * sentence. It used to be remembered only in this process (gone on every
 * restart and deploy) and in the open Voice tab (gone on every tab change and
 * reload), so a creator who came back to compare voices paid for the same
 * model call again, against the TTS model's small daily allowance.
 *
 * Now it is spoken once, made into a small MP3, and kept in the bucket under
 * <MEDIA_PREFIX>/voice-samples/, named by a hash of the model, the voice and
 * the words. Coming back an hour or a week later, reloading, or opening the
 * same demo in another tab plays that file; only a voice and a sentence never
 * heard before reach the model. Two requests for the same new sample at once
 * share one call. The link handed out is reused for a few hours too, so a
 * revisit costs neither a model call nor a signature.
 */
const SAMPLE_LINK_MS = 6 * 3600 * 1000;
const SAMPLE_LINKS_KEPT = 500;
const sampleLinks = new Map();
const sampling = new Map();

export async function voiceSampleUrl(text, voice, { baseUrl } = {}) {
  const hash = crypto.createHash("sha1").update(`${VOICE_MODEL}|${voice}|${text}`).digest("hex").slice(0, 24);
  const key = `${KEY_ROOT}/voice-samples/${hash}.mp3`;
  const hit = sampleLinks.get(key);
  if (hit && Date.now() - hit.at < SAMPLE_LINK_MS) return hit.url;

  if (!(await statObject(key))) {
    if (!sampling.has(key)) {
      const made = (async () => {
        const wav = await sampleVoice(text, voice);
        const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "voice-sample-"));
        try {
          await fsp.writeFile(path.join(dir, "sample.wav"), wav);
          await ffmpeg(["-y", "-i", "sample.wav", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "64k", "sample.mp3"], { cwd: dir });
          await putFile(path.join(dir, "sample.mp3"), key, "audio/mpeg");
        } finally {
          fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
        }
      })();
      sampling.set(key, made.finally(() => sampling.delete(key)));
    }
    await sampling.get(key);
  }

  const url = await readUrl(key, { baseUrl, contentType: "audio/mpeg", expiresSec: 12 * 3600 });
  // A relayed link (storage.js's fallback when signing fails) is short-lived.
  if (!isRelayUrl(url)) {
    sampleLinks.set(key, { url, at: Date.now() });
    while (sampleLinks.size > SAMPLE_LINKS_KEPT) sampleLinks.delete(sampleLinks.keys().next().value);
  }
  return url;
}

/* ── Kept takes ──────────────────────────────────────────────────────────── */

const TAKES = `${KEY_ROOT}/voice-takes`;
const takeKey = (engine, voice, text) =>
  `${TAKES}/${crypto.createHash("sha1").update(`${engineLabel(engine)}|${voice}|${PRESENTER}|${text}`).digest("hex").slice(0, 32)}.pcm`;

/** A kept take, or null: its samples, as the narrator holds them. */
async function keptTake(engine, voice, text, workDir, tag) {
  const key = takeKey(engine, voice, text);
  try {
    if (!(await statObject(key))) return null;
    const buf = await fsp.readFile(await materialize(key, workDir, `${tag}.kept.pcm`));
    if (buf.length < RATE / 10) return null;
    // Copied to a fresh buffer: a Buffer's offset into its pool can be odd.
    const pcm = new Int16Array(Uint8Array.from(buf).buffer, 0, buf.length >> 1);
    return { pcm, seconds: pcm.length / RATE };
  } catch (err) {
    console.warn(`[voice] kept take unreadable, it will be spoken again: ${err.message}`);
    return null;
  }
}

async function keepTake(engine, voice, text, take, workDir, tag) {
  try {
    const file = path.join(workDir, `${tag}.take.pcm`);
    await fsp.writeFile(file, Buffer.from(take.pcm.buffer, take.pcm.byteOffset, take.pcm.byteLength));
    await putFile(file, takeKey(engine, voice, text), "application/octet-stream");
  } catch (err) {
    console.warn(`[voice] could not keep a take: ${err.message}`);
  }
}

/**
 * The voiceover for a set of captions.
 *
 * @param {object} o
 * @param {Array} o.cues        { id, start, end, text }, recording time
 * @param {string} o.voice      a voices.mjs id
 * @param {number} o.duration   the recording's length, seconds
 * @param {string} o.workDir
 * @param {object} [o.speakers] the narrator's voice services, replaceable by a test
 * @returns {Promise<{ file, seconds, sentences: Array<{ start, end, text, rate }>, fresh, engine }>}
 *   file an MP3 as long as the recording; sentences where each was placed;
 *   fresh how many sentences were spoken now rather than kept from before;
 *   engine the voice service that spoke it
 */
export async function buildVoiceover({ cues, voice, duration, workDir, speakers, onProgress = () => {} }) {
  const lines = sentencesOf(cues).map((s) => ({ start: s.start, end: s.end, text: s.text }));
  if (!lines.length) throw userError("There are no captions to speak.");

  // 1. What is already spoken, for every service this voiceover may use.
  const engines = engineOrder();
  const cache = new Map();
  const kept = new Set();
  const held = {};
  await pool(
    engines.flatMap((e) => lines.map((l) => [e, l.text])),
    8,
    async ([e, text], i) => {
      const id = `${e}|${voice}|${text}`;
      if (cache.has(id)) return;
      const take = await keptTake(e, voice, text, workDir, `k${i}`);
      if (!take) return;
      cache.set(id, take);
      kept.add(id);
      held[e] = (held[e] || 0) + 1;
    }
  );
  onProgress(0.05);

  // 2. Spoken by the narrator: first by the service holding the most of it
  //    (an update keeps its voice and its takes), else in the usual order.
  const best = engines.filter((e) => held[e]).sort((a, b) => held[b] - held[a])[0];
  let result = null;
  let failed = null;
  if (best && best !== engines[0]) {
    result = await buildNarration({ lines, voice, duration, workDir, cache, engine: best, speakers, onProgress }).catch((err) => {
      failed = err;
      return null;
    });
  }
  if (!result) {
    try {
      result = await buildNarration({ lines, voice, duration, workDir, cache, speakers, onProgress });
    } catch (err) {
      failed = err;
    }
  }
  if (!result) {
    console.warn(`[voice] voiceover failed: ${String(failed?.message || failed).slice(0, 300)}`);
    throw userError(
      failed?.daily
        ? "Voices are busy right now. Try the voice-over again in a little while."
        : "The voice-over couldn't be made right now. Try again in a little while."
    );
  }

  // 3. What was spoken now, kept for the next time.
  let fresh = 0;
  await pool(lines, 4, async (l, i) => {
    const id = `${result.engine}|${voice}|${l.text}`;
    if (kept.has(id) || !cache.has(id)) return;
    fresh++;
    await keepTake(result.engine, voice, l.text, cache.get(id), workDir, `t${i}`);
  });

  return { file: result.file, seconds: result.seconds, sentences: result.sentences, fresh, engine: result.engine };
}

export default { VOICE_MODEL, sampleVoice, voiceSampleUrl, buildVoiceover };

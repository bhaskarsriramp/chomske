/**
 * voice.js: an AI voiceover, spoken from the captions.
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
 * ── FITTING THE TIME IT HAS ──────────────────────────────────────────────────
 * Each sentence has until the next one starts. Measured on a real demo, 13
 * lines spoken as written: 5 fitted, 6 more fitted when asked to be brisk, and
 * 2 were still a tenth of a second long. So a sentence that does not fit is
 * spoken again, briskly (the model's own pace, which sounds natural); what
 * still does not fit is sped up a little with the pitch kept (MAX_RATE); and
 * what is still long runs on and pushes the next sentence along, rather than
 * being cut or talking over it.
 *
 * ── THE MODEL ────────────────────────────────────────────────────────────────
 * gemini-3.8-flash-tts, through the Interactions endpoint, which is the only
 * one that takes a delivery style separately from the words: put in the words,
 * "Say it warmly: …" is read out loud (measured). This project's SDK (1.52)
 * predates the endpoint's current schema, so it is called directly.
 */
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { aistudioKeys, pool } from "../ai/provider.js";
import { ffmpeg } from "../media/ffmpeg.js";
import { sentencesOf } from "../../../src/components/Studio/voices.mjs";

export const VOICE_MODEL = String(process.env.STUDIO_VOICE_MODEL || "gemini-3.8-flash-tts").trim();
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
/** The model's own sample rate: 24 kHz, mono, 16-bit. */
const RATE = 24000;
/** How a demo is narrated. */
const NARRATION = "clear, friendly product-demo narration";
/** ...and a sentence that has to be quicker to fit. */
const BRISK = "clear, friendly product-demo narration, speaking briskly, a little faster than normal";
/** Sped up at most this much, pitch kept: past it a voice starts to sound hurried. */
const MAX_RATE = 1.2;
/** Breath between two sentences that run into each other. */
const GAP = 0.12;
/** Sentences spoken at once. */
const AT_ONCE = 3;

const userError = (msg) => Object.assign(new Error(msg), { userMessage: msg });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round3 = (v) => Math.round(v * 1000) / 1000;

let turn = 0;

/**
 * One sentence, spoken: the model's WAV, as it came. Retried when the service
 * is busy or the connection drops; a refusal (bad key, bad request) is not.
 */
async function ask(text, { voice, style = NARRATION }) {
  const keys = aistudioKeys();
  if (!keys.length) throw userError("The voice-over isn't available right now. Try again later.");
  let last = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const key = keys[turn++ % keys.length];
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
    if (!res.ok) {
      const err = new Error(`speech ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
      if (res.status === 429 || res.status >= 500) {
        last = err;
        await sleep(1500 * 2 ** (attempt - 1));
        continue;
      }
      throw err;
    }
    const audio = (body.steps || []).flatMap((s) => s.content || []).find((c) => c.type === "audio" && c.data);
    if (audio) return Buffer.from(audio.data, "base64");
    last = new Error("the model answered without audio");
  }
  throw last || new Error("speech failed");
}

/** A WAV's samples and rate, whatever chunks it carries. */
function samplesOf(wav) {
  let rate = RATE;
  for (let at = 12; at + 8 <= wav.length; ) {
    const id = wav.toString("ascii", at, at + 4);
    const size = wav.readUInt32LE(at + 4);
    if (id === "fmt ") rate = wav.readUInt32LE(at + 12);
    if (id === "data") {
      const end = Math.min(wav.length, at + 8 + size);
      const pcm = new Int16Array((end - at - 8) >> 1);
      for (let i = 0; i < pcm.length; i++) pcm[i] = wav.readInt16LE(at + 8 + i * 2);
      return { pcm, rate };
    }
    at += 8 + size + (size & 1);
  }
  throw new Error("no audio data in the model's answer");
}

/** A sentence spoken, as 24 kHz samples and a length. */
async function speak(text, { voice, style, workDir, tag }) {
  const wav = await ask(text, { voice, style });
  let { pcm, rate } = samplesOf(wav);
  if (rate !== RATE) pcm = await transform(pcm, rate, [], workDir, `${tag}-rate`);
  return { pcm, seconds: pcm.length / RATE };
}

/** Samples through ffmpeg (a sample rate change, a tempo), back as 24 kHz samples. */
async function transform(pcm, rate, filters, workDir, tag) {
  const src = path.join(workDir, `${tag}.in.pcm`);
  const dst = path.join(workDir, `${tag}.out.pcm`);
  await fsp.writeFile(src, Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
  await ffmpeg([
    "-f", "s16le", "-ar", String(rate), "-ac", "1", "-i", src,
    ...(filters.length ? ["-af", filters.join(",")] : []),
    "-f", "s16le", "-ar", String(RATE), "-ac", "1", dst,
  ]);
  const out = await fsp.readFile(dst);
  await Promise.all([fsp.rm(src, { force: true }), fsp.rm(dst, { force: true })]);
  return new Int16Array(out.buffer, out.byteOffset, out.length >> 1).slice();
}

/**
 * A short sample of a voice, for the Voice tab: the model's WAV as it came.
 * Spoken the way the voiceover will be.
 */
export async function sampleVoice(text, voice) {
  return ask(text, { voice });
}

/**
 * The voiceover for a set of captions.
 *
 * @param {object} o
 * @param {Array} o.cues        { id, start, end, text }, recording time
 * @param {string} o.voice      a voices.mjs id
 * @param {number} o.duration   the recording's length, seconds
 * @param {string} o.workDir
 * @returns {Promise<{ file, seconds, sentences: Array<{ start, end, text, rate }> }>}
 *   file an MP3 as long as the recording; sentences where each was placed
 */
export async function buildVoiceover({ cues, voice, duration, workDir, onProgress = () => {} }) {
  const sentences = sentencesOf(cues);
  if (!sentences.length) throw userError("There are no captions to speak.");
  const total = Math.max(0.5, duration || 0, sentences[sentences.length - 1].end);
  const until = (i) => (sentences[i + 1] ? sentences[i + 1].start : total);

  // 1. Every sentence, as written, a few at a time.
  let done = 0;
  const spoken = new Array(sentences.length);
  await pool(sentences, AT_ONCE, async (s, i) => {
    spoken[i] = await speak(s.text, { voice, workDir, tag: `s${i}` });
    onProgress(0.05 + 0.7 * (++done / sentences.length));
  });

  // 2. What does not fit the time it has, again, briskly; kept only if shorter.
  const long = sentences.map((s, i) => i).filter((i) => spoken[i].seconds > until(i) - sentences[i].start + 0.05);
  await pool(long, AT_ONCE, async (i) => {
    const again = await speak(sentences[i].text, { voice, style: BRISK, workDir, tag: `b${i}` });
    if (again.seconds < spoken[i].seconds) spoken[i] = again;
  });
  onProgress(0.85);

  // 3. In order: each where its first line starts, or just after the one
  //    before if that ran on; sped up a little if it still would not fit.
  const mix = new Int16Array(Math.ceil((total + 5) * RATE));
  const placed = [];
  let free = 0;
  let last = 0;
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const at = Math.max(s.start, free > 0 ? free + GAP : 0);
    const room = Math.max(0.3, until(i) - at);
    let clip = spoken[i];
    const rate = Math.min(MAX_RATE, Math.max(1, clip.seconds / room));
    if (rate > 1.02) {
      const pcm = await transform(clip.pcm, RATE, [`atempo=${rate.toFixed(3)}`], workDir, `t${i}`);
      clip = { pcm, seconds: pcm.length / RATE };
    }
    const from = Math.round(at * RATE);
    for (let k = 0; k < clip.pcm.length && from + k < mix.length; k++) {
      mix[from + k] = Math.max(-32768, Math.min(32767, mix[from + k] + clip.pcm[k]));
    }
    free = at + clip.seconds;
    last = Math.max(last, free);
    placed.push({ start: round3(at), end: round3(free), text: s.text, rate: Math.round(rate * 100) / 100 });
  }

  // 4. One track, as long as the recording (or as long as the last sentence
  //    ran, if it ran past the end: the export stops at the video's end).
  const seconds = Math.max(total, last);
  const raw = path.join(workDir, "voice.pcm");
  const file = path.join(workDir, "voice.mp3");
  await fsp.writeFile(raw, Buffer.from(mix.buffer, 0, Math.ceil(seconds * RATE) * 2));
  await ffmpeg(["-f", "s16le", "-ar", String(RATE), "-ac", "1", "-i", raw, "-c:a", "libmp3lame", "-b:a", "96k", file]);
  await fsp.rm(raw, { force: true });
  if (!fs.existsSync(file)) throw new Error("the voiceover did not encode");
  onProgress(1);
  return { file, seconds: round3(seconds), sentences: placed };
}

export default { VOICE_MODEL, sampleVoice, buildVoiceover };

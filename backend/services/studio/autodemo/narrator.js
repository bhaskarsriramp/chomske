/**
 * autodemo/narrator.js: the auto demo's voice, as one continuous presenter.
 *
 * ── WHY NOT voice.js ─────────────────────────────────────────────────────────
 * voice.js voices the CAPTIONS for the Voice tab: sentences grouped from
 * caption lines, read in a neutral "clear, friendly" style. The auto demo has
 * something better to speak from — its own script, already written as spoken
 * lines — and a different job: to sound like a person walking a customer
 * through the product, without a pause each time the screen changes. Its own
 * file, so tuning how the demo sounds can never change the Voice tab, and the
 * other way round. It speaks to the same model the same way (voice.js's
 * endpoint and model, measured there).
 *
 * ── TWO VOICES, ONE PER DEMO ─────────────────────────────────────────────────
 *   gemini   AI Studio, gemini-3.8-flash-tts (voice.js's model): 10 a minute and
 *            100 a DAY per project on Tier 1
 *   cloud:…  Cloud Text-to-Speech, Gemini-TTS (cloudVoice.js), one engine per
 *            model in STUDIO_CLOUD_TTS_MODELS (3.1-flash-preview, then the
 *            stable 2.5-flash): their own quota, billed to the Cloud project
 * A demo is spoken by ONE of them, never a mix: two models reading alternate
 * lines would sound like two people. "auto" (the default) tries gemini and,
 * if it fails for any reason, speaks the whole demo again with cloud. A daily
 * limit is remembered until it lifts, so later demos go straight to cloud
 * instead of spending a refused request each.
 *   STUDIO_AUTODEMO_VOICE   auto (default) | gemini | cloud
 *
 * ── WHAT MAKES IT SOUND CONTINUOUS ───────────────────────────────────────────
 *   one take per script line   a line is a thought; split in two it gets two
 *                              falling endings and sounds read off cards
 *   the model's padding taken  the model pads every take with ~0.2–0.4 s at
 *                              each end; the breath (KEEP) is left, faded
 *   a breath between lines     GAP; a line that runs over pushes the next
 *                              along, never talks over it, is never cut or
 *                              hurried (see PRESENTER for why)
 */
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { aistudioKeys, pool } from "../../ai/provider.js";
import { ffmpeg } from "../../media/ffmpeg.js";
import { VOICE_MODEL } from "../voice.js";
import { PAUSE } from "./prompts.js";
import { askCloud, CLOUD_MODELS } from "./cloudVoice.js";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const RATE = 24000;
/**
 * How the demo is presented. Passed as the delivery style, never in the words
 * (it would be read out).
 *
 * ── PLAIN ON PURPOSE ─────────────────────────────────────────────────────────
 * The first version asked for "an engaging presenter … natural energy and
 * light emphasis … flowing on from the line before", spoke lines that did not
 * fit again "a little faster", stretched them up to 1.15x and placed them
 * 0.1 s apart. The creator heard it as "cluttered and brittle… getting stuck
 * and not at all clear", while the Voice tab's plain style (voice.js
 * NARRATION) had sounded clear to them. So: that plain style, a real breath
 * between lines, no faster re-takes, and speed changes kept inaudible. Words
 * are what change to fit (director.js refit), never the voice.
 */
export const PRESENTER = "clear, friendly product-demo narration, natural and unhurried";
/** Sped up at most this much, pitch kept: below what anyone hears as a change. */
const MAX_RATE = 1.06;
/** The breath between two lines, at least (prompts.js PAUSE, shared with the fitting). */
const GAP = PAUSE;
/** Lines spoken at once. */
const AT_ONCE = 3;
/** Quieter than this, at the ends of a take, is padding (about -46 dBFS). */
const QUIET = 160;
/** Kept either side of the speech: the breath before a line and the decay after it. */
const KEEP = 0.15;
/** Faded in and out at the edges of a take, so no cut is ever a click. */
const FADE = 0.015;

const userError = (msg) => Object.assign(new Error(msg), { userMessage: msg });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round3 = (v) => Math.round(v * 1000) / 1000;

/**
 * ── THE SPEECH MODEL'S OWN LIMIT ─────────────────────────────────────────────
 * Measured on 2026-10-01 with a Tier 1 AI Studio key: "Rate limit exceeded for
 * model gemini-3.8-flash-tts (limit: 10 requests per minute on Tier 1). Please
 * retry in 56s". A demo is seven to fifteen takes, so requests are paced here
 * (STUDIO_TTS_RPM, per key, this process) and a refusal waits as long as the
 * service says rather than retrying into the same closed window.
 */
const RPM = Math.max(1, Number(process.env.STUDIO_TTS_RPM) || 9);
const sentAt = new Map();
async function slot(key) {
  for (;;) {
    const now = Date.now();
    const recent = (sentAt.get(key) || []).filter((t) => now - t < 60_000);
    sentAt.set(key, recent);
    if (recent.length < RPM) {
      recent.push(now);
      return;
    }
    await sleep(recent[0] + 60_000 - now + 50);
  }
}
/** "Please retry in 56s" → 56000, capped. */
const retryAfter = (message) => {
  const m = String(message || "").match(/retry in ([\d.]+)\s*s/i);
  return m ? Math.min(70_000, Math.ceil(Number(m[1]) * 1000) + 1000) : 0;
};

/** "retry in 15h13m31s" → its length in ms (the daily limit's own word for when it lifts). */
export function waitOf(message) {
  const m = String(message || "").match(/retry in\s+((?:\d+(?:\.\d+)?[hms]\s*)+)/i);
  if (!m) return 0;
  let ms = 0;
  for (const [, n, u] of m[1].matchAll(/(\d+(?:\.\d+)?)([hms])/g)) ms += Number(n) * { h: 3600_000, m: 60_000, s: 1000 }[u];
  return Math.round(ms);
}

let turn = 0;

async function askGemini(text, { voice, style }) {
  const keys = aistudioKeys();
  if (!keys.length) {
    console.error("[autodemo] no AI Studio key is set (AISTUDIO_KEY / GEMINI_API_KEY): the voice cannot be made");
    throw userError("The voice isn't available right now. Your script and captions are ready.");
  }
  let last = null;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const key = keys[turn++ % keys.length];
    await slot(key);
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
      // A DAILY limit (measured 2026-10-01: "limit: 100 requests per day on
      // Tier 1… retry in 15h13m") does not reopen in a minute: say so at once
      // instead of retrying for minutes. The script and captions still land.
      if (res.status === 429 && /per day/i.test(String(body?.error?.message || ""))) {
        // For the operator, in the log; the creator is told what to do, not
        // whose plan ran out (no vendor or plan names in what creators see).
        console.error(`[autodemo] speech DAILY quota reached for ${VOICE_MODEL}: ${String(body?.error?.message || "").slice(0, 200)}`);
        throw Object.assign(err, {
          daily: true,
          waitMs: waitOf(body?.error?.message) || 6 * 3600_000,
          userMessage: "The voice couldn't be added right now because voices are busy today. Your script and captions are ready. Add the voice from the Voice tab a little later.",
        });
      }
      if (res.status === 429 || res.status >= 500) {
        last = err;
        await sleep(retryAfter(body?.error?.message) || 1500 * 2 ** (attempt - 1));
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

/** The take without the quiet the model pads it with, keeping KEEP seconds either side. */
export function trimQuiet(pcm) {
  const win = Math.round(RATE * 0.01);
  const loud = (i) => {
    let peak = 0;
    for (let k = i; k < Math.min(pcm.length, i + win); k++) peak = Math.max(peak, Math.abs(pcm[k]));
    return peak > QUIET;
  };
  let a = 0;
  while (a < pcm.length && !loud(a)) a += win;
  let b = pcm.length - win;
  while (b > a && !loud(b)) b -= win;
  if (a >= b) return pcm;
  const keep = Math.round(KEEP * RATE);
  const out = pcm.slice(Math.max(0, a - keep), Math.min(pcm.length, b + win + keep));
  const fade = Math.min(Math.round(FADE * RATE), out.length >> 2);
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    out[i] = Math.round(out[i] * g);
    out[out.length - 1 - i] = Math.round(out[out.length - 1 - i] * g);
  }
  return out;
}

/* ── Which voice ────────────────────────────────────────────────────────────── */

const CLOUD_ENGINES = CLOUD_MODELS.map((m) => `cloud:${m}`);
const ENGINES = {
  gemini: askGemini,
  ...Object.fromEntries(CLOUD_MODELS.map((m) => [`cloud:${m}`, (text, o) => askCloud(text, { ...o, model: m })])),
};
const MODE = String(process.env.STUDIO_AUTODEMO_VOICE || "auto").trim().toLowerCase();
/** Until when the first voice is known to refuse (its daily limit), ms since epoch. */
let geminiPausedUntil = 0;

/** The voices to try for one demo, in order. */
export function engineOrder(now = Date.now()) {
  if (MODE === "cloud") return CLOUD_ENGINES;
  if (MODE === "gemini") return ["gemini"];
  return now < geminiPausedUntil ? CLOUD_ENGINES : ["gemini", ...CLOUD_ENGINES];
}
/** What the voiceover records about who spoke it: "gemini:<model>" or "cloud:<model>". */
export const engineLabel = (engine) => (engine === "gemini" ? `gemini:${VOICE_MODEL}` : String(engine));

async function speak(text, { engine, speakers, voice, style, workDir, tag }) {
  const wav = await speakers[engine](text, { voice, style });
  let { pcm, rate } = samplesOf(wav);
  if (rate !== RATE) pcm = await transform(pcm, rate, [], workDir, `${tag}-rate`);
  pcm = trimQuiet(pcm);
  return { pcm, seconds: pcm.length / RATE };
}

/**
 * The voiceover, spoken from the script.
 *
 * @param {object} o
 * @param {Array}  o.lines     the script: { start, end, text }, recording time, in order
 * @param {string} o.voice     a voices.mjs id
 * @param {number} o.duration  the recording's length
 * @param {string} o.workDir
 * @param {Map}    [o.cache]   takes already made, by voice and text: a second build
 *                             after some lines were rewritten speaks only those again
 * @param {string} [o.engine]  "gemini" or "cloud:<model>": speak with this one only. A
 *                             rebuild after refitting passes the first build's,
 *                             so a demo keeps one voice from start to finish
 * @param {object} [o.speakers] the two voices, replaceable by a test
 * @returns {Promise<{ file, seconds, sentences: Array<{ start, end, text, rate }>, takes: Array<{ text, seconds }>, engine }>}
 *   the same shape voice.js answers with, so the editor and the export read it
 *   alike; `takes` is each line's own length as first spoken, before any fitting
 */
export async function buildNarration({ lines, voice, duration, workDir, cache = new Map(), engine = null, speakers = ENGINES, onProgress = () => {} }) {
  const said = (lines || []).filter((l) => String(l.text || "").trim());
  if (!said.length) throw userError("There is no script to speak.");
  const order = engine ? [engine] : engineOrder();
  let failed = null;
  for (const [n, e] of order.entries()) {
    try {
      return await speakWith(e, { said, voice, duration, workDir, cache, speakers, onProgress });
    } catch (err) {
      failed = err;
      if (e === "gemini" && err.daily) geminiPausedUntil = Date.now() + (err.waitMs || 6 * 3600_000);
      const next = order[n + 1];
      console.warn(`[autodemo] voice: ${engineLabel(e)} failed (${String(err.message).slice(0, 160)})${next ? `; speaking the whole demo with ${engineLabel(next)}` : ""}`);
    }
  }
  throw failed;
}

async function speakWith(engine, { said, voice, duration, workDir, cache, speakers, onProgress }) {
  const total = Math.max(0.5, duration || 0, said[said.length - 1].end);
  const until = (i) => (said[i + 1] ? said[i + 1].start : total);

  // 1. Every line, as written (or as already spoken, when it has not changed).
  let done = 0;
  const spoken = new Array(said.length);
  await pool(said, AT_ONCE, async (l, i) => {
    const key = `${engine}|${voice}|${l.text}`;
    if (!cache.has(key)) cache.set(key, await speak(l.text, { engine, speakers, voice, style: PRESENTER, workDir, tag: `n${i}-${done}` }));
    spoken[i] = cache.get(key);
    onProgress(0.05 + 0.7 * (++done / said.length));
  });
  const takes = said.map((l, i) => ({ text: l.text, seconds: round3(spoken[i].seconds) }));

  onProgress(0.85);

  // 2. In order, each at its line's start, or a breath after the one before.
  //    A line that does not fit runs on into the next one's time rather than
  //    being hurried; director.js refit() shortens its words instead.
  const mix = new Int16Array(Math.ceil((total + 8) * RATE));
  const placed = [];
  let free = 0;
  let last = 0;
  for (let i = 0; i < said.length; i++) {
    const at = Math.max(said[i].start, free > 0 ? free + GAP : 0);
    const room = Math.max(0.3, until(i) - at);
    let clip = spoken[i];
    const rate = Math.min(MAX_RATE, Math.max(1, clip.seconds / room));
    if (rate > 1.02) {
      const pcm = await transform(clip.pcm, RATE, [`atempo=${rate.toFixed(3)}`], workDir, `nt${i}`);
      clip = { pcm, seconds: pcm.length / RATE };
    }
    const from = Math.round(at * RATE);
    for (let k = 0; k < clip.pcm.length && from + k < mix.length; k++) {
      mix[from + k] = Math.max(-32768, Math.min(32767, mix[from + k] + clip.pcm[k]));
    }
    free = at + clip.seconds;
    last = Math.max(last, free);
    placed.push({ start: round3(at), end: round3(free), text: said[i].text, rate: Math.round(rate * 100) / 100 });
  }

  // 3. One track, as long as the recording (or as long as the last line ran).
  const seconds = Math.max(total, last);
  const raw = path.join(workDir, "narration.pcm");
  const file = path.join(workDir, "narration.mp3");
  await fsp.writeFile(raw, Buffer.from(mix.buffer, 0, Math.ceil(seconds * RATE) * 2));
  await ffmpeg(["-f", "s16le", "-ar", String(RATE), "-ac", "1", "-i", raw, "-c:a", "libmp3lame", "-b:a", "96k", file]);
  await fsp.rm(raw, { force: true });
  if (!fs.existsSync(file)) throw new Error("the narration did not encode");
  onProgress(1);
  return { file, seconds: round3(seconds), sentences: placed, takes, engine };
}

export default { buildNarration, trimQuiet, engineOrder, engineLabel, waitOf, PRESENTER };

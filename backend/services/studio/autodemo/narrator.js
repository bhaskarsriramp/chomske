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
 * ── WHAT MAKES IT SOUND CONTINUOUS ───────────────────────────────────────────
 *   one take per script line   a line is a thought; split in two it gets two
 *                              falling endings and sounds read off cards
 *   a presenter's style        warm, engaged, one part of a longer walkthrough
 *   silence trimmed            the model pads every take with ~0.2–0.4 s at
 *                              each end; between lines that is dead air twice
 *   placed back to back        a line that runs over pushes the next along by
 *                              a breath, never talks over it, never is cut
 */
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { aistudioKeys, pool } from "../../ai/provider.js";
import { ffmpeg } from "../../media/ffmpeg.js";
import { VOICE_MODEL } from "../voice.js";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const RATE = 24000;
/** How the demo is presented. Passed as the delivery style, never in the words (it would be read out). */
export const PRESENTER =
  "an engaging product-demo presenter walking a viewer through the product live: warm, confident and conversational, " +
  "with natural energy and light emphasis on the key words; one continuous walkthrough, flowing on from the line before";
/** ...and for a line that has to be quicker to fit its moment. */
const PRESENTER_BRISK = `${PRESENTER}; speaking a little faster than usual, still natural`;
/** Sped up at most this much, pitch kept. */
const MAX_RATE = 1.15;
/** Breath between two lines that run into each other. */
const GAP = 0.1;
/** Lines spoken at once. */
const AT_ONCE = 3;
/** Quieter than this, at the ends of a take, is padding (about -46 dBFS). */
const QUIET = 160;
/** Kept either side of the speech, so a soft first consonant is not clipped. */
const KEEP = 0.05;

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

let turn = 0;

async function ask(text, { voice, style }) {
  const keys = aistudioKeys();
  if (!keys.length) throw userError("The voice needs an AI Studio key on this server.");
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
  return pcm.slice(Math.max(0, a - keep), Math.min(pcm.length, b + win + keep));
}

async function speak(text, { voice, style, workDir, tag }) {
  const wav = await ask(text, { voice, style });
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
 * @param {Map}    [o.cache]   takes already made, by text: a second build after
 *                             some lines were rewritten speaks only those again
 * @param {boolean} [o.brisk]  speak a line that does not fit again, briskly. Off
 *                             for a first build that is about to be measured and
 *                             refitted (the words are the better fix, and every
 *                             take counts against the model's per-minute limit)
 * @returns {Promise<{ file, seconds, sentences: Array<{ start, end, text, rate }>, takes: Array<{ text, seconds }> }>}
 *   the same shape voice.js answers with, so the editor and the export read it
 *   alike; `takes` is each line's own length as first spoken, before any fitting
 */
export async function buildNarration({ lines, voice, duration, workDir, cache = new Map(), brisk = true, onProgress = () => {} }) {
  const said = (lines || []).filter((l) => String(l.text || "").trim());
  if (!said.length) throw userError("There is no script to speak.");
  const total = Math.max(0.5, duration || 0, said[said.length - 1].end);
  const until = (i) => (said[i + 1] ? said[i + 1].start : total);

  // 1. Every line, as written (or as already spoken, when it has not changed).
  let done = 0;
  const spoken = new Array(said.length);
  await pool(said, AT_ONCE, async (l, i) => {
    const key = `${voice}|${l.text}`;
    if (!cache.has(key)) cache.set(key, await speak(l.text, { voice, style: PRESENTER, workDir, tag: `n${i}-${done}` }));
    spoken[i] = cache.get(key);
    onProgress(0.05 + 0.7 * (++done / said.length));
  });
  const takes = said.map((l, i) => ({ text: l.text, seconds: round3(spoken[i].seconds) }));

  // 2. What does not fit its moment, again, a little brisker; kept only if shorter.
  const long = brisk ? said.map((l, i) => i).filter((i) => spoken[i].seconds > until(i) - said[i].start + 0.05) : [];
  await pool(long, AT_ONCE, async (i) => {
    const key = `${voice}|brisk|${said[i].text}`;
    if (!cache.has(key)) cache.set(key, await speak(said[i].text, { voice, style: PRESENTER_BRISK, workDir, tag: `nb${i}` }));
    const again = cache.get(key);
    if (again.seconds < spoken[i].seconds) spoken[i] = again;
  });
  onProgress(0.85);

  // 3. In order, each at its line's start, or a breath after the one before.
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

  // 4. One track, as long as the recording (or as long as the last line ran).
  const seconds = Math.max(total, last);
  const raw = path.join(workDir, "narration.pcm");
  const file = path.join(workDir, "narration.mp3");
  await fsp.writeFile(raw, Buffer.from(mix.buffer, 0, Math.ceil(seconds * RATE) * 2));
  await ffmpeg(["-f", "s16le", "-ar", String(RATE), "-ac", "1", "-i", raw, "-c:a", "libmp3lame", "-b:a", "96k", file]);
  await fsp.rm(raw, { force: true });
  if (!fs.existsSync(file)) throw new Error("the narration did not encode");
  onProgress(1);
  return { file, seconds: round3(seconds), sentences: placed, takes };
}

export default { buildNarration, trimQuiet, PRESENTER };

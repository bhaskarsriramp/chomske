/**
 * voice.mjs: each scene's line, spoken. Gemini TTS through the same
 * Interactions endpoint and model the Studio narrator uses
 * (backend/services/studio/autodemo/narrator.js), one take per line.
 *
 * Takes are cached by voice + style + words, so a refinement that changes one
 * line re-records one line. The model pads every take with silence at both
 * ends; that is trimmed to a short breath so the scene's length is the line's
 * real length.
 *
 * Tier 1 allows 10 requests a minute: takes are paced under it.
 */
import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { aiKey, VOICE_MODEL } from "./env.mjs";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
export const STYLE = "a confident, warm product-launch narrator: clear, natural and unhurried, with quiet energy";
const RPM = Number(process.env.LAUNCH_TTS_RPM) || 9;
const QUIET = 220;
const KEEP = 0.12;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sent = [];
async function slot() {
  for (;;) {
    const now = Date.now();
    while (sent.length && now - sent[0] > 60_000) sent.shift();
    if (sent.length < RPM) {
      sent.push(now);
      return;
    }
    await sleep(60_000 - (now - sent[0]) + 50);
  }
}

/**
 * The speech models, best first. Each has its own daily quota (Tier 1: 100 a
 * day per model per project), so when one is spent the whole video moves to
 * the next: one video is always one model, or it sounds like two people.
 * The newest speaks through the Interactions endpoint (with a style
 * annotation); the older ones through generateContent, style in the prompt.
 */
const MODELS = [VOICE_MODEL, "gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"].filter((m, i, a) => a.indexOf(m) === i);
const spent = new Set();

function request(model, text, voice) {
  if (model === "gemini-3.8-flash-tts") {
    return {
      url: ENDPOINT,
      body: {
        model,
        input: [{ type: "user_input", content: [{ type: "text", text, annotations: [{ type: "speech_metadata", style: STYLE }] }] }],
        response_format: { type: "audio" },
        generation_config: { speech_config: [{ voice }] },
      },
      audio: (b) => (b.steps || []).flatMap((s) => s.content || []).find((c) => c.type === "audio" && c.data)?.data,
    };
  }
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    body: {
      contents: [{ parts: [{ text: `Read this aloud as ${STYLE}:\n${text}` }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
    },
    audio: (b) => (b.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data)?.inlineData.data,
  };
}

async function take(model, text, voice) {
  const r = request(model, text, voice);
  let last;
  for (let attempt = 1; attempt <= 6; attempt++) {
    await slot();
    let res;
    try {
      res = await fetch(r.url, {
        method: "POST",
        headers: { "x-goog-api-key": aiKey(), "Content-Type": "application/json" },
        body: JSON.stringify(r.body),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (err) {
      last = err;
      await sleep(1000 * attempt);
      continue;
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      last = new Error(`speech ${model} ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
      if (res.status === 429 && /per day/i.test(String(body?.error?.message || ""))) throw Object.assign(last, { daily: true });
      if (res.status === 429 || res.status >= 500) {
        const m = /retry in ([\d.]+)s/i.exec(String(body?.error?.message || ""));
        await sleep(m ? Number(m[1]) * 1000 + 300 : 2000 * attempt);
        continue;
      }
      throw last;
    }
    const data = r.audio(body);
    if (data) return Buffer.from(data, "base64");
    last = new Error(`${model} answered without audio`);
  }
  throw last;
}

/** WAV → mono 16-bit samples (the model answers 24 kHz mono PCM in a RIFF wrapper, or raw PCM). */
function samplesOf(buf) {
  if (buf.toString("ascii", 0, 4) !== "RIFF") return { pcm: new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + (buf.length & ~1))), rate: 24000 };
  let rate = 24000;
  for (let at = 12; at + 8 <= buf.length; ) {
    const id = buf.toString("ascii", at, at + 4);
    const size = buf.readUInt32LE(at + 4);
    if (id === "fmt ") rate = buf.readUInt32LE(at + 12);
    if (id === "data") {
      const end = Math.min(buf.length, at + 8 + size);
      const pcm = new Int16Array((end - at - 8) >> 1);
      for (let i = 0; i < pcm.length; i++) pcm[i] = buf.readInt16LE(at + 8 + i * 2);
      return { pcm, rate };
    }
    at += 8 + size + (size & 1);
  }
  throw new Error("no audio data");
}

function wavOf(pcm, rate) {
  const out = Buffer.alloc(44 + pcm.length * 2);
  out.write("RIFF", 0, "ascii");
  out.writeUInt32LE(36 + pcm.length * 2, 4);
  out.write("WAVEfmt ", 8, "ascii");
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36, "ascii");
  out.writeUInt32LE(pcm.length * 2, 40);
  for (let i = 0; i < pcm.length; i++) out.writeInt16LE(pcm[i], 44 + i * 2);
  return out;
}

/** The take with its silent padding cut to a breath, and a few ms of fade so no edge clicks. */
function trim({ pcm, rate }) {
  let a = 0;
  let b = pcm.length - 1;
  while (a < pcm.length && Math.abs(pcm[a]) < QUIET) a++;
  while (b > a && Math.abs(pcm[b]) < QUIET) b--;
  a = Math.max(0, a - Math.round(KEEP * rate));
  b = Math.min(pcm.length - 1, b + Math.round(KEEP * rate));
  const cut = pcm.slice(a, b + 1);
  const fade = Math.round(0.012 * rate);
  for (let i = 0; i < fade && i < cut.length; i++) {
    cut[i] = Math.round((cut[i] * i) / fade);
    cut[cut.length - 1 - i] = Math.round((cut[cut.length - 1 - i] * i) / fade);
  }
  return { pcm: cut, rate };
}

async function speakWith(model, scenes, { dir, voice, log, onProgress = () => {} }) {
  const out = {};
  let done = 0;
  const lines = scenes.filter((s) => String(s.voice || "").trim()).length || 1;
  await Promise.all(
    scenes.map(async (s, i) => {
      const text = String(s.voice || "").trim();
      if (!text) return;
      const key = crypto.createHash("sha1").update(`${model}|${voice}|${STYLE}|${text}`).digest("hex").slice(0, 16);
      const file = `audio/${key}.wav`;
      const abs = path.join(dir, file);
      if (!fs.existsSync(abs)) {
        const raw = await take(model, text, voice);
        const t = trim(samplesOf(raw));
        await fsp.writeFile(abs, wavOf(t.pcm, t.rate));
        log(`voice ${i + 1}/${scenes.length} (${model}): ${(t.pcm.length / t.rate).toFixed(2)}s "${text.slice(0, 60)}"`);
      }
      const { pcm, rate } = samplesOf(await fsp.readFile(abs));
      out[i] = { file, seconds: pcm.length / rate };
      onProgress(++done / lines);
    })
  );
  return out;
}

/** Speak every scene's line into dir/audio. Returns { [index]: { file, seconds } }. */
export async function speakAll(scenes, { dir, voice = "Kore", log = () => {}, onProgress = () => {} }) {
  await fsp.mkdir(path.join(dir, "audio"), { recursive: true });
  let last;
  for (const model of MODELS) {
    if (spent.has(model)) continue;
    try {
      return await speakWith(model, scenes, { dir, voice, log, onProgress });
    } catch (err) {
      last = err;
      if (!err.daily) throw err;
      spent.add(model);
      log(`${model}: daily limit reached, the whole video moves to the next voice model`);
    }
  }
  throw last;
}

/**
 * music.mjs: a score for this video, composed for it by Lyria 3.
 *
 * Asked for a little longer than the video will run (the length is estimated
 * from the voice lines, so it can be composed while they are being spoken);
 * the composition fades it out at the end. Cached by prompt, so a refinement
 * that does not change the mood or outgrow the track keeps the same music.
 */
import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { aiKey } from "./env.mjs";

const MODEL = process.env.LAUNCH_MUSIC_MODEL || "lyria-3-pro-preview";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function musicPrompt(mood, seconds) {
  return `A ${Math.round(seconds)} second instrumental background track for a product launch video. Mood: ${mood || "modern, confident and optimistic"}. Polished and minimal, made to sit under a voiceover: a steady pulse, warm pads, light percussion that builds gently, a lift in the last quarter and a clean, resolved ending. No vocals, no spoken words.`;
}

export async function makeMusic({ dir, mood, seconds, log = () => {} }) {
  const prompt = musicPrompt(mood, seconds);
  const key = crypto.createHash("sha1").update(`${MODEL}|${prompt}`).digest("hex").slice(0, 12);
  const file = `music-${key}.mp3`;
  const abs = path.join(dir, file);
  if (fs.existsSync(abs)) return { file, cached: true };
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": aiKey(), "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["AUDIO"] } }),
        signal: AbortSignal.timeout(300_000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`music ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
      const part = (body.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
      if (!part) throw new Error("music: the model answered without audio");
      await fsp.writeFile(abs, Buffer.from(part.inlineData.data, "base64"));
      log(`music: ${Math.round(seconds)}s asked, "${(mood || "").slice(0, 60)}"`);
      return { file, cached: false };
    } catch (err) {
      last = err;
      await sleep(3000 * attempt);
    }
  }
  throw last;
}

/** How long the video will run, before the voice exists: each line at ~2.5 words a second, never under its scene's minimum. */
export function estimateSeconds(scenes, minSeconds) {
  const words = (s) => String(s || "").split(/\s+/).filter(Boolean).length;
  return scenes.reduce((t, s) => t + Math.max(minSeconds[s.type] || 4, words(s.voice) / 2.5 + 0.9), 0) - (scenes.length - 1) * (10 / 30);
}

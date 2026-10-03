/**
 * music.mjs: a score for this video, picked from Clipo's music library.
 *
 * The library is public-domain (CC0) music Clipo hosts, the same tracks the
 * Studio editor's Music tab offers (backend/services/studio/music.js), so a
 * video costs nothing for its music and needs no credit line. Composing a
 * score per video (Lyria) cost about $0.08 a track with no free tier.
 *
 * The director describes the mood in a few words (draft.music); that is
 * matched to one of the library's moods by its words, and a track picked from
 * it: one at least as long as the video if there is one, otherwise the
 * longest, looped by the video. The pick depends only on the mood's words, so
 * a refinement that keeps the mood keeps the same music.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MUSIC_JS = path.join(ROOT, "backend", "services", "studio", "music.js");
// Loaded on first use: it brings the backend's storage, which reads the bucket.
let library = null;
const loadLibrary = async () => (library ||= await import(pathToFileURL(MUSIC_JS).href));

/** Words that point at each of the library's moods (picks.mjs MOODS). */
const MOOD_WORDS = {
  Upbeat: ["upbeat", "energetic", "energy", "happy", "playful", "fun", "bright", "optimistic", "bouncy", "cheerful", "lively", "positive", "ukulele", "pop", "catchy", "friendly", "confident"],
  Calm: ["calm", "soft", "gentle", "piano", "ambient", "relaxed", "relaxing", "peaceful", "serene", "chill", "lo-fi", "lofi", "warm", "quiet", "soothing", "acoustic"],
  Tech: ["electronic", "tech", "synth", "synths", "futuristic", "digital", "pulse", "pulsing", "sleek", "innovative", "techy", "minimal", "edm", "beat"],
  Cinematic: ["cinematic", "epic", "orchestral", "emotional", "dramatic", "grand", "inspiring", "inspirational", "uplifting", "heroic", "strings", "premium", "ambitious", "bold"],
  Jazzy: ["jazz", "jazzy", "funky", "funk", "groovy", "groove", "lounge", "retro", "swing", "smooth", "soulful", "bass"],
};

/** The library mood a few words describe; Upbeat when nothing matches. */
export function moodOf(text, moods = Object.keys(MOOD_WORDS)) {
  const words = String(text || "").toLowerCase().split(/[^a-z-]+/).filter(Boolean);
  let best = "Upbeat";
  let top = 0;
  for (const mood of moods) {
    const list = MOOD_WORDS[mood] || [];
    // Earlier words weigh a little more: "calm, minimal electronic" is calm first.
    const score = words.reduce((s, w, i) => s + (list.includes(w) ? 1 + 1 / (i + 2) : 0), 0);
    if (score > top) {
      top = score;
      best = mood;
    }
  }
  return best;
}

/**
 * The track for a mood and a length: one long enough if the mood has any (the
 * shortest few of those, so the music still has an ending in sight), else the
 * longest, to be looped. Among them, the same mood text always gets the same.
 */
export function pickTrack(tracks, mood, seconds, seed = "") {
  const inMood = tracks.filter((t) => t.mood === mood);
  const pool = inMood.length ? inMood : tracks;
  if (!pool.length) return null;
  const long = pool.filter((t) => t.duration >= seconds).sort((a, b) => a.duration - b.duration);
  const choices = long.length ? long.slice(0, 4) : [...pool].sort((a, b) => b.duration - a.duration).slice(0, 2);
  const n = parseInt(crypto.createHash("sha1").update(`${mood}|${seed}`).digest("hex").slice(0, 8), 16);
  return choices[n % choices.length];
}

export async function makeMusic({ dir, mood, seconds, log = () => {} }) {
  const lib = await loadLibrary();
  const tracks = lib.musicTracks();
  const want = moodOf(mood, lib.musicMoods());
  const track = pickTrack(tracks, want, seconds, String(mood || "").toLowerCase().trim());
  if (!track) throw new Error("music: the library is empty");
  const file = `music-${track.id}.mp3`;
  const abs = path.join(dir, file);
  const loop = track.duration < seconds;
  if (fs.existsSync(abs)) return { file, cached: true, loop, track: track.id };
  const got = await lib.loadMusicTrack({ media: track.id, workDir: dir });
  if (!got) throw new Error(`music: ${track.id} could not be read`);
  // Local storage hands back the stored file itself: copied, never moved.
  if (path.resolve(got) !== path.resolve(abs)) fs.copyFileSync(got, abs);
  log(`music: "${track.title}" (${want}, ${Math.round(track.duration)}s for ~${Math.round(seconds)}s${loop ? ", looped" : ""}) for "${String(mood || "").slice(0, 60)}"`);
  return { file, cached: false, loop, track: track.id };
}

/** How long the video will run, before the voice exists: each line at ~2.5 words a second, never under its scene's minimum. */
export function estimateSeconds(scenes, minSeconds) {
  const words = (s) => String(s || "").split(/\s+/).filter(Boolean).length;
  return scenes.reduce((t, s) => t + Math.max(minSeconds[s.type] || 4, words(s.voice) / 2.5 + 0.9), 0) - (scenes.length - 1) * (10 / 30);
}

/**
 * music.js: Clipo's music library and the creator's own tracks, for the editor
 * and for the export.
 *
 * ── A LIBRARY WE HOST, NOT AN API WE CALL ────────────────────────────────────
 * No free music API offers good, commercially usable music to an app like
 * this (the free tiers of Jamendo and Freesound are non-commercial; Pixabay and
 * Mixkit forbid exactly this use), and generating a track per video with Lyria
 * costs about $0.08 each. So the library is a fixed set of public-domain (CC0)
 * tracks from FreePD, prepared once by scripts/music/buildLibrary.mjs and kept
 * in the bucket beside everything else, under <MEDIA_PREFIX>/music/. The
 * catalogue (music/catalog.json) is part of the code, so the VM and the Cloud
 * Run renderer always agree on what a track id means.
 *
 * ── AND THE CREATOR'S OWN ────────────────────────────────────────────────────
 * A creator can upload a track of their own (up to UPLOAD.maxSeconds). It is
 * checked, made into the same kind of file as the library's (MP3, one
 * loudness, so the volume slider means the same thing for both) and kept on
 * their account like a background image (StudioAsset, kind "music"), under
 * <root>/studio/<user>/music/. Its id on a timeline is "u:<asset id>", and it
 * is only ever read with the demo's owner, so one account can never reach
 * another's file by naming it. The rights to an uploaded track are the
 * creator's to have; nothing here can check them.
 *
 * A timeline names a track by its id (timeline.audio.music[].media); the file
 * itself is only ever read here.
 */
import fs from "fs";
import fsp from "fs/promises";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import StudioAsset from "../../models/StudioAsset.js";
import { KEY_ROOT, readUrl, materialize, putFile, removeObject } from "../media/storage.js";
import { ffmpeg, probe, FFMPEG_PATH } from "../media/ffmpeg.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CATALOG = JSON.parse(fs.readFileSync(path.join(HERE, "music", "catalog.json"), "utf8"));
const BY_ID = new Map(CATALOG.tracks.map((t) => [t.id, t]));

/** What a creator may upload. 60 MB holds eight minutes of any compressed audio. */
export const UPLOAD = {
  maxBytes: 60 * 1024 * 1024,
  maxSeconds: 8 * 60,
  maxPerUser: 40,
};
/** The mood the creator's own tracks are filed under in the editor. */
export const YOURS = "Yours";
const UPLOAD_PREFIX = "u:";

export const musicMoods = () => CATALOG.moods || [];
/** Every track in the library (not uploads): for the link generator's pick. */
export const musicTracks = () => CATALOG.tracks;
export const trackById = (id) => BY_ID.get(String(id || "")) || null;
const objectKey = (t) => `${KEY_ROOT}/${t.key}`;
const userError = (message, status = 400) => Object.assign(new Error(message), { userMessage: message, status });

/**
 * ── SIGNED ONCE, NOT ON EVERY VISIT ──────────────────────────────────────────
 * Each signed link is a signing call on the VM, and the library is sixty
 * tracks. Links are signed for twelve hours and handed out for six, so one
 * signing serves every editor opened in that time.
 */
const SIGN_FOR = 12 * 3600;
const REUSE_FOR_MS = 6 * 3600 * 1000;
const signed = new Map();

async function urlFor(key, baseUrl) {
  const hit = signed.get(key);
  if (hit && Date.now() - hit.at < REUSE_FOR_MS) return hit.url;
  const url = await readUrl(key, { baseUrl, contentType: "audio/mpeg", expiresSec: SIGN_FOR });
  // A relayed link (the signing fallback in storage.js) is short-lived: not kept.
  if (!/\/media\/file\//.test(url)) {
    signed.set(key, { url, at: Date.now() });
    if (signed.size > 2000) signed.delete(signed.keys().next().value);
  }
  return url;
}

/** What the browser is told about one of the creator's own tracks. */
async function shapeUpload(a, baseUrl) {
  return {
    id: `${UPLOAD_PREFIX}${a._id}`,
    title: a.title || "My track",
    artist: "",
    mood: YOURS,
    duration: a.duration || 0,
    bpm: null,
    peaks: a.peaks || [],
    uploaded: true,
    url: await urlFor(a.key, baseUrl).catch(() => ""),
  };
}

/** The library and the creator's own tracks, each with a link to play it. */
export async function listMusic({ baseUrl, user } = {}) {
  const library = await Promise.all(
    CATALOG.tracks.map(async (t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      mood: t.mood,
      duration: t.duration,
      bpm: t.bpm,
      peaks: t.peaks,
      url: await urlFor(objectKey(t), baseUrl).catch(() => ""),
    }))
  );
  const rows = user
    ? await StudioAsset.find({ user, kind: "music" }).sort({ created_at: -1 }).limit(UPLOAD.maxPerUser).lean()
    : [];
  const uploads = await Promise.all(rows.map((a) => shapeUpload(a, baseUrl)));
  return {
    moods: musicMoods(),
    tracks: [...uploads.filter((t) => t.url), ...library.filter((t) => t.url)],
    limits: { max_bytes: UPLOAD.maxBytes, max_seconds: UPLOAD.maxSeconds },
  };
}

/* ── The creator's own ─────────────────────────────────────────────────────── */

function run(argv) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG_PATH, argv, { windowsHide: true });
    const out = [];
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", () => {});
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg exited ${code}`))));
  });
}

/** 160 loudest moments, 0–100, for the music lane (as buildLibrary.mjs draws them). */
async function peaksOf(file, count = 160) {
  const pcm = await run(["-hide_banner", "-nostdin", "-i", file, "-ac", "1", "-ar", "4000", "-f", "s16le", "-"]);
  const n = Math.floor(pcm.length / 2);
  const per = Math.max(1, Math.floor(n / count));
  const out = [];
  for (let b = 0; b < count; b++) {
    let mx = 0;
    for (let i = b * per; i < Math.min(n, (b + 1) * per); i++) mx = Math.max(mx, Math.abs(pcm.readInt16LE(i * 2)));
    out.push(mx);
  }
  const top = Math.max(1, ...out);
  return out.map((v) => Math.round((v / top) * 100));
}

/** "My Song.final.mp3" → "My Song.final": what the creator called it. */
export function titleOf(filename) {
  const base = String(filename || "").split(/[\\/]/).pop().replace(/\.[a-z0-9]{1,5}$/i, "");
  return base.replace(/[\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "My track";
}

/**
 * Check an uploaded file and store it as one of the creator's tracks. Throws
 * an error carrying `userMessage` and `status` for anything they should be told.
 * Any audio ffmpeg can read is accepted (MP3, M4A, WAV, OGG, FLAC, WebM…);
 * what is kept is always a 160k MP3 at the library's loudness.
 */
export async function saveUploadedMusic(user, buf, filename) {
  if (!Buffer.isBuffer(buf) || !buf.length) throw userError("Choose an audio file, like an MP3.");
  if (buf.length > UPLOAD.maxBytes) throw userError(`That file is over ${Math.round(UPLOAD.maxBytes / 1048576)} MB. Use an MP3 or M4A, or a shorter clip.`, 413);
  const held = await StudioAsset.countDocuments({ user, kind: "music" });
  if (held >= UPLOAD.maxPerUser) throw userError(`You have ${held} uploaded tracks, which is the most there can be. Delete one first.`, 429);

  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "clipo-music-"));
  try {
    const src = path.join(dir, "upload");
    const out = path.join(dir, "track.mp3");
    await fsp.writeFile(src, buf);
    const meta = await probe(src).catch(() => null);
    if (!meta?.has_audio) throw userError("That file has no sound we can read. Try an MP3, M4A or WAV.", 415);
    if (!(meta.duration > 1)) throw userError("That track is too short to use.");
    if (meta.duration > UPLOAD.maxSeconds + 0.5) {
      throw userError(`That track is ${Math.floor(meta.duration / 60)} min ${Math.round(meta.duration % 60)} s long. Tracks can be up to ${UPLOAD.maxSeconds / 60} minutes.`);
    }
    // One pass of loudness normalisation: the library's level (-18 LUFS), so
    // 35% on the slider sounds about the same for every track.
    await ffmpeg(
      ["-y", "-nostdin", "-i", src, "-map", "0:a:0", "-map_metadata", "-1", "-t", String(UPLOAD.maxSeconds),
        "-af", "loudnorm=I=-18:TP=-1.5:LRA=11", "-ar", "44100", "-ac", "2", "-c:a", "libmp3lame", "-b:a", "160k", out],
      { cwd: dir }
    ).catch(() => {
      throw userError("That file couldn't be read as audio. Try saving it again as an MP3.", 415);
    });
    const kept = await probe(out);

    const asset = new StudioAsset({ user, kind: "music" });
    asset.key = `${KEY_ROOT}/studio/${user}/music/${asset._id}.mp3`;
    asset.title = titleOf(filename);
    asset.duration = Math.round((kept.duration || meta.duration) * 1000) / 1000;
    asset.size = (await fsp.stat(out)).size;
    asset.peaks = await peaksOf(out);
    await putFile(out, asset.key, "audio/mpeg");
    await asset.save();
    return { track: await shapeUpload(asset.toObject(), undefined), asset };
  } finally {
    fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Delete one of the creator's tracks: the row first, then the file. */
export async function deleteUploadedMusic(user, id) {
  const raw = String(id || "").replace(UPLOAD_PREFIX, "");
  if (!mongoose.Types.ObjectId.isValid(raw)) return false;
  const asset = await StudioAsset.findOneAndDelete({ _id: raw, user, kind: "music" }).lean();
  if (!asset) return false;
  await removeObject(asset.key).catch((err) => console.warn(`[studio] music ${raw}: could not remove ${asset.key}: ${err.message}`));
  return true;
}

/**
 * Where a track's file is in storage, or "" when there is no such track: the
 * library's by its id, a creator's own by its id AND its owner. The Cloud Run
 * export, which has no database, is handed these (render/remoteRender.js).
 */
export async function musicKey({ media, user }) {
  const id = String(media || "");
  if (id.startsWith(UPLOAD_PREFIX)) {
    const raw = id.slice(UPLOAD_PREFIX.length);
    if (!user || !mongoose.Types.ObjectId.isValid(raw)) return "";
    const asset = await StudioAsset.findOne({ _id: raw, user, kind: "music" }).lean();
    return asset?.key || "";
  }
  const t = trackById(id);
  return t ? objectKey(t) : "";
}

/**
 * A track's file on this machine, for the export (render/compose.js), or null
 * when there is no such track (an upload is looked up with the demo's owner).
 */
export async function loadMusicTrack({ media, workDir, user }) {
  const key = await musicKey({ media, user });
  if (!key) return null;
  return materialize(key, workDir, `music-${path.basename(key)}`);
}

const music = { listMusic, loadMusicTrack, musicKey, trackById, musicMoods, musicTracks, saveUploadedMusic, deleteUploadedMusic, titleOf, UPLOAD, YOURS };
export default music;

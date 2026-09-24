/**
 * ffmpeg.js: every call this product makes to ffmpeg and ffprobe, and nothing else.
 *
 * ── WHY THE BINARIES COME FROM npm ───────────────────────────────────────────
 * ffmpeg-static and ffprobe-static download a pinned build at `npm install`, on
 * whatever platform the install runs on. The alternative, "apt install ffmpeg on
 * the VM", is one more step nobody remembers on the next server, and distro
 * builds differ in exactly the parts this feature leans on: libass with
 * HarfBuzz, without which Telugu and Devanagari captions render as unjoined
 * letters. FFMPEG_PATH / FFPROBE_PATH still win when set, for a server that
 * deliberately wants its own build.
 *
 * ── CHILD PROCESSES, NOT A LIBRARY ───────────────────────────────────────────
 * Every call is a spawn with an argument array, never a shell string. File
 * names come from uploads, and a shell would turn a filename into a command.
 * The event loop is never blocked either: a four-minute render is a child
 * process the server waits on, not work it does.
 */
import os from "os";
import { spawn } from "child_process";
import path from "path";
import fsp from "fs/promises";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

export const FFMPEG_PATH = process.env.FFMPEG_PATH || ffmpegStatic;
export const FFPROBE_PATH = process.env.FFPROBE_PATH || ffprobeStatic.path;

/** How much stderr is kept for an error message. The rest is noise. */
const STDERR_TAIL = 16000;

/**
 * Run one process to completion.
 *
 * @param {object} opts
 * @param {Function} [opts.onStdoutLine]  called per stdout line
 * @param {Function} [opts.onStderrLine]  called per stderr line
 * @param {number}   [opts.keepStdout]    bytes of stdout to return (ffprobe JSON)
 * @param {number}   [opts.timeoutMs]
 * @param {AbortSignal} [opts.signal]
 */
/**
 * ── THE ENCODER MAY USE EVERY CORE, BUT IT MAY NOT HAVE THEM FIRST ───────────
 * ffmpeg runs as a child of the same server that answers the website, on the
 * same machine. A render at x264 "medium" will happily take every core it can
 * see, and on a small VM that leaves nothing for Node or the proxy in front of
 * it: the site stops answering for as long as the export runs.
 *
 * Capping ffmpeg's threads would fix that by making every export slower, even
 * on an idle server. Lowering its priority fixes it without that cost: the
 * encoder still gets every spare cycle, but the moment a request arrives the
 * operating system hands the CPU to the process that has to answer it.
 *
 * 0 is normal, 19 is lowest. STUDIO_FFMPEG_NICE=0 turns this off.
 */
const FFMPEG_NICE = Number.isFinite(Number(process.env.STUDIO_FFMPEG_NICE))
  ? Math.max(0, Math.min(19, Number(process.env.STUDIO_FFMPEG_NICE)))
  : 10;

function yieldCpu(child) {
  if (!FFMPEG_NICE || !child || !child.pid) return;
  try {
    os.setPriority(child.pid, FFMPEG_NICE);
  } catch {
    // Not permitted on some hosts, and never worth failing a render over.
  }
}

export function runProcess(bin, args, { cwd, onStdoutLine, onStderrLine, keepStdout = 64000, timeoutMs = 60 * 60 * 1000, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, windowsHide: true });
    yieldCpu(child);
    let stdout = "";
    let stderr = "";
    let outBuf = "";
    let errBuf = "";

    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    const onAbort = () => child.kill("SIGKILL");
    signal?.addEventListener?.("abort", onAbort, { once: true });

    const split = (buf, chunk, cb) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        cb(buf.slice(0, i).replace(/\r$/, ""));
        buf = buf.slice(i + 1);
      }
      return buf;
    };

    child.stdout.on("data", (d) => {
      const s = d.toString();
      if (stdout.length < keepStdout) stdout += s;
      if (onStdoutLine) outBuf = split(outBuf, s, onStdoutLine);
    });
    child.stderr.on("data", (d) => {
      const s = d.toString();
      stderr = (stderr + s).slice(-STDERR_TAIL);
      if (onStderrLine) errBuf = split(errBuf, s, onStderrLine);
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", onAbort);
      if (outBuf && onStdoutLine) onStdoutLine(outBuf);
      if (errBuf && onStderrLine) onStderrLine(errBuf);
      if (code === 0) return resolve({ stdout, stderr });
      const name = String(bin).split(/[\\/]/).pop();
      reject(Object.assign(new Error(`${name} exited with ${code}: ${stderr.slice(-900)}`), { exitCode: code, stderr }));
    });
  });
}

/**
 * ffmpeg with progress.
 *
 * `-progress pipe:1` writes key=value lines to stdout; out_time_us is how far
 * into the OUTPUT the encoder has got, which against the expected duration is
 * the only honest progress number ffmpeg offers.
 */
export function ffmpeg(args, { duration = 0, onProgress, ...opts } = {}) {
  const full = ["-hide_banner", "-nostdin", "-y", ...(onProgress ? ["-progress", "pipe:1", "-nostats"] : []), ...args];
  let last = -1;
  return runProcess(FFMPEG_PATH, full, {
    ...opts,
    onStdoutLine: onProgress
      ? (line) => {
          const m = line.match(/^out_time_(?:us|ms)=(\d+)/);
          if (!m || !(duration > 0)) return;
          const p = Math.max(0, Math.min(1, Number(m[1]) / 1e6 / duration));
          if (p - last >= 0.01) {
            last = p;
            onProgress(p);
          }
        }
      : undefined,
  });
}

let encoderList = null;

/**
 * Whether this ffmpeg build has an encoder. libx265 is in the npm builds but
 * not in every distro's, and an export dialog should not offer H.265 to a
 * server that will fail on it.
 */
export async function hasEncoder(name) {
  if (!encoderList) {
    encoderList = runProcess(FFMPEG_PATH, ["-hide_banner", "-encoders"], { keepStdout: 400_000, timeoutMs: 20_000 })
      .then(({ stdout }) => stdout)
      .catch(() => "");
  }
  return new RegExp(`\\s${name}\\s`).test(await encoderList);
}

function rate(r) {
  const [a, b] = String(r || "").split("/").map(Number);
  return a && b ? a / b : Number(r) || 0;
}

/**
 * What a file is, as far as editing needs to know.
 *
 * Width and height are the DISPLAYED size. Phones record landscape sensors and
 * tag the file with a rotation; ffmpeg applies it when transcoding, so a
 * portrait recording that reported 1920x1080 would be laid out as landscape
 * everywhere that trusted the raw numbers.
 */
export async function probe(file) {
  const { stdout } = await runProcess(
    FFPROBE_PATH,
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file],
    { keepStdout: 4_000_000, timeoutMs: 60_000 }
  );
  const j = JSON.parse(stdout || "{}");
  const streams = j.streams || [];
  const v = streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  const a = streams.find((s) => s.codec_type === "audio");

  let rotation = 0;
  if (v) {
    if (Number(v.tags?.rotate)) rotation = Number(v.tags.rotate);
    const sd = (v.side_data_list || []).find((d) => d.rotation !== undefined);
    if (sd) rotation = Number(sd.rotation) || 0;
  }
  const swap = Math.abs(rotation) % 180 === 90;
  const format = String(j.format?.format_name || "");

  return {
    duration: Number(j.format?.duration) || Number(v?.duration) || Number(a?.duration) || 0,
    width: v ? Number(swap ? v.height : v.width) || 0 : 0,
    height: v ? Number(swap ? v.width : v.height) || 0 : 0,
    fps: v ? rate(v.avg_frame_rate) || rate(v.r_frame_rate) : 0,
    has_video: !!v,
    has_audio: !!a,
    format,
    is_image: !!v && /image2|_pipe$|png|jpeg|webp/.test(format) && !a,
  };
}

/**
 * The preview copy the editor plays: short side 540, keyframe every second.
 *
 * The keyframe interval is the point. Seeking a phone recording with one
 * keyframe every few seconds lands the scrubber late and makes every trim
 * handle feel broken; one per second makes a seek land where it was asked to.
 */
export function makeVideoProxy(src, dest, { duration, onProgress } = {}) {
  return ffmpeg(
    [
      "-i", src,
      "-map", "0:v:0", "-map", "0:a:0?",
      "-vf", "scale=w='if(gt(iw,ih),-2,min(540,iw))':h='if(gt(iw,ih),min(540,ih),-2)',fps=30,format=yuv420p",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "30",
      "-g", "30", "-keyint_min", "30", "-sc_threshold", "0",
      "-c:a", "aac", "-b:a", "64k", "-ac", "2",
      "-movflags", "+faststart",
      dest,
    ],
    { duration, onProgress }
  );
}

/** Music and voice-overs, re-encoded to something every browser plays. */
export function makeAudioProxy(src, dest, { duration, onProgress } = {}) {
  return ffmpeg(
    ["-i", src, "-vn", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", dest],
    { duration, onProgress }
  );
}

/**
 * The speech track analysis listens to: mono, 16 kHz, 32 kbps MP3.
 *
 * About 4 KB a second. Speech recognition gains nothing above 16 kHz, and this
 * is what gets cut into pieces and sent to the model, so every byte saved here
 * is saved once per piece.
 */
export function extractSpeechAudio(src, dest, { duration, onProgress } = {}) {
  return ffmpeg(
    ["-i", src, "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "32k", dest],
    { duration, onProgress }
  );
}

/** One still, at most 480 wide. */
export function makeThumbnail(src, dest, { at = 0, isImage = false } = {}) {
  return ffmpeg([
    ...(isImage ? [] : ["-ss", String(Math.max(0, at))]),
    "-i", src,
    "-frames:v", "1",
    "-vf", "scale='min(480,iw)':-2",
    "-q:v", "5",
    dest,
  ]);
}

/**
 * Frames for the model to read, written into `destDir` as frame_000001.jpg…
 *
 * ── WHY ONE SPAWN AND NOT ONE PER FRAME ──────────────────────────────────────
 * Sampling a twenty minute recording every two seconds is 600 frames. Six
 * hundred ffmpeg processes, each seeking a fresh copy of the file, takes minutes
 * and most of it is process startup. `fps=1/2` in a single pass decodes the file
 * once and writes all of them, and the numbering is then contiguous, which is
 * what lets the caller map a file name back to a timestamp without asking.
 *
 * ── SIZE IS THE BILL ─────────────────────────────────────────────────────────
 * These go to Gemini, and a frame's token cost scales with its area. 1280 on the
 * long side reads every label a 4K frame does — screen text is large relative to
 * the frame — at roughly a sixth of the tokens. q:v 3 rather than 2 because JPEG
 * ringing around UI text is what actually hurts OCR, and 3 is where the file
 * stops shrinking usefully.
 *
 * @param {number} opts.every  seconds between frames
 * @param {number} [opts.start]
 * @param {number} [opts.duration]
 * @returns {Promise<Array<{ file: string, t: number }>>}
 */
export async function extractFrames(src, destDir, { every = 2, start = 0, duration = 0, longEdge = 1280, onProgress } = {}) {
  const pattern = path.join(destDir, "frame_%06d.jpg");
  const scale = `scale=w='if(gt(iw,ih),min(${longEdge},iw),-2)':h='if(gt(iw,ih),-2,min(${longEdge},ih))'`;
  await ffmpeg(
    [
      ...(start > 0 ? ["-ss", String(start)] : []),
      ...(duration > 0 ? ["-t", String(duration)] : []),
      "-i", src,
      "-vf", `fps=1/${every},${scale}`,
      "-q:v", "3",
      "-fps_mode", "passthrough",
      pattern,
    ],
    { duration, onProgress }
  );

  // ffmpeg's fps filter emits its first frame at the MIDDLE of the first
  // interval, not at zero. Reading the timestamps back from the file names
  // without that offset puts every analysis half an interval early, which is
  // exactly enough to plan a zoom onto the previous screen.
  const names = (await fsp.readdir(destDir)).filter((n) => /^frame_\d{6}\.jpg$/.test(n)).sort();
  return names.map((name, i) => ({
    file: path.join(destDir, name),
    t: round3(start + i * every),
  }));
}

/**
 * One still at an exact moment, at analysis size. For a second look at a frame.
 *
 * `mark` draws a box on it first, in the source's own pixels — for asking a
 * model about ONE thing in a busy frame without describing where it is.
 * `crop` cuts a region out (also in source pixels) for a close-up.
 */
export function extractFrameAt(src, dest, at, { longEdge = 1280, mark = null, crop = null } = {}) {
  const box = mark
    ? `drawbox=x=${Math.round(mark.x)}:y=${Math.round(mark.y)}:w=${Math.round(mark.w)}:h=${Math.round(mark.h)}:color=magenta:t=${mark.t || 5},`
    : "";
  const cut = crop
    ? `crop=${Math.round(crop.w)}:${Math.round(crop.h)}:${Math.max(0, Math.round(crop.x))}:${Math.max(0, Math.round(crop.y))},`
    : "";
  return ffmpeg([
    "-ss", String(Math.max(0, at)),
    "-i", src,
    "-frames:v", "1",
    "-vf", `${box}${cut}scale=w='if(gt(iw,ih),min(${longEdge},iw),-2)':h='if(gt(iw,ih),-2,min(${longEdge},ih))'`,
    "-q:v", "3",
    dest,
  ]);
}

/**
 * ffmpeg reading raw frames from this process, over a pipe.
 *
 * The cursor and annotation layer is drawn frame by frame on a canvas here in
 * Node (services/studio/render/overlay.js) and has to reach ffmpeg somehow.
 * A PNG sequence on disk is ten thousand files for a three minute demo; a pipe
 * is none, and ffmpeg consumes frames as fast as it can encode them, so the
 * writer is throttled by backpressure rather than by a guess at the rate.
 *
 * `write(push)` is called with a function that takes one Buffer of RGBA and
 * resolves when the pipe is ready for the next. It must return a promise that
 * settles when there are no more frames; the pipe is then closed, which is what
 * tells ffmpeg the input has ended.
 */
export function ffmpegFromFrames(args, { width, height, fps, pixelFormat = "rgba", write, ...opts } = {}) {
  const full = [
    "-hide_banner", "-nostdin", "-y",
    "-f", "rawvideo", "-pixel_format", pixelFormat, "-video_size", `${width}x${height}`, "-framerate", String(fps),
    "-i", "pipe:0",
    ...args,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_PATH, full, { cwd: opts.cwd, windowsHide: true });
    yieldCpu(child);
    let stderr = "";
    let settled = false;

    const finish = (fn) => (v) => {
      if (settled) return;
      settled = true;
      fn(v);
    };
    const done = finish(resolve);
    const fail = finish(reject);

    child.stderr.on("data", (d) => { stderr = (stderr + d.toString()).slice(-STDERR_TAIL); });
    child.on("error", fail);
    child.on("close", (code) => {
      if (code === 0) done({ stderr });
      else fail(Object.assign(new Error(`ffmpeg exited with ${code}: ${stderr.slice(-900)}`), { exitCode: code, stderr }));
    });

    // EPIPE is normal here: ffmpeg failing on its arguments closes stdin before
    // the first frame is written. The close handler above carries the real
    // reason, so this one must not overwrite it with "write after end".
    child.stdin.on("error", () => {});

    const push = (buf) =>
      new Promise((res, rej) => {
        if (settled) return rej(new Error("ffmpeg ended early"));
        if (child.stdin.write(buf)) res();
        else child.stdin.once("drain", res);
      });

    Promise.resolve(write(push))
      .then(() => child.stdin.end())
      .catch((err) => {
        try { child.kill("SIGKILL"); } catch { /* already gone */ }
        fail(err);
      });
  });
}

/**
 * ffmpeg handing raw frames BACK to this process, over a pipe.
 *
 * The mirror of ffmpegFromFrames, and it exists for the same reason: some
 * questions can only be answered by looking at the finished pixels. What
 * actually changed between two frames of a recording, and when, is one of them
 * — the browser's tracker answers it live, under recording-time pressure, on a
 * clock of its own, and services/studio/sync.js has to check that answer
 * against the video itself.
 *
 * Decoded, scaled and rate-limited by ffmpeg; `onFrame` is awaited before the
 * next frame is read, so a slow reader throttles the decoder rather than
 * filling memory with frames it has not looked at yet. At 480x270 grey that is
 * 130 kB a frame, which is the whole reason this is affordable on a half hour
 * recording.
 */
export function ffmpegToFrames(src, { width, height, fps, pixelFormat = "gray", start = 0, duration = 0, onFrame, ...opts } = {}) {
  const bytes = width * height * (pixelFormat === "gray" ? 1 : pixelFormat === "rgb24" ? 3 : 4);
  const args = [
    "-hide_banner", "-nostdin",
    ...(start > 0 ? ["-ss", String(start)] : []),
    "-i", src,
    ...(duration > 0 ? ["-t", String(duration)] : []),
    "-an", "-sn",
    "-vf", `fps=${fps},scale=${width}:${height}:flags=bilinear`,
    "-pix_fmt", pixelFormat, "-f", "rawvideo", "pipe:1",
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_PATH, args, { cwd: opts.cwd, windowsHide: true });
    yieldCpu(child);
    let stderr = "";
    let settled = false;
    let held = [];
    let heldBytes = 0;
    let index = 0;
    let pending = Promise.resolve();

    const finish = (fn) => (v) => { if (settled) return; settled = true; fn(v); };
    const done = finish(resolve);
    const fail = finish(reject);

    child.stderr.on("data", (d) => { stderr = (stderr + d.toString()).slice(-STDERR_TAIL); });
    child.on("error", fail);

    child.stdout.on("data", (chunk) => {
      held.push(chunk);
      heldBytes += chunk.length;
      if (heldBytes < bytes) return;

      // One decoded frame is worth more than the reader can usually keep up
      // with, so the decoder is paused for as long as onFrame takes. Without
      // this a half hour recording arrives faster than it can be read and the
      // backlog is measured in gigabytes.
      child.stdout.pause();
      const all = held.length === 1 ? held[0] : Buffer.concat(held, heldBytes);
      const whole = Math.floor(all.length / bytes);
      const rest = all.subarray(whole * bytes);
      held = rest.length ? [Buffer.from(rest)] : [];
      heldBytes = rest.length;

      pending = pending.then(async () => {
        for (let i = 0; i < whole; i++) {
          await onFrame(all.subarray(i * bytes, (i + 1) * bytes), index++);
        }
      });
      pending.then(() => { if (!settled) child.stdout.resume(); }, fail);
    });

    child.on("close", (code) => {
      pending.then(
        () => {
          if (code === 0) done({ frames: index, stderr });
          else fail(Object.assign(new Error(`ffmpeg exited with ${code}: ${stderr.slice(-900)}`), { exitCode: code, stderr }));
        },
        fail
      );
    });
  });
}

/**
 * A browser recording, made into a file the rest of the pipeline can trust.
 *
 * ── WHAT MediaRecorder HANDS OVER ────────────────────────────────────────────
 * A WebM whose header says the duration is unknown, because the browser was
 * writing it live and never went back to fill it in. ffprobe reports 0, or
 * sometimes a number out by an hour. Every downstream step — the proxy, the
 * frame sampling, the timeline, the progress bar — is arithmetic on a duration,
 * so this is the first thing that has to be made true.
 *
 * `-fflags +genpts` rebuilds the timestamps and the remux writes a real header.
 * The picture is copied, never re-encoded: it is already H.264 or VP9 and a
 * second encode at this stage would cost the demo its text sharpness for nothing.
 * The audio is re-encoded to AAC because Opus in MP4 is not something every
 * later filter graph will accept.
 */
export function remuxRecording(src, dest, { duration, onProgress } = {}) {
  return ffmpeg(
    [
      "-fflags", "+genpts",
      "-i", src,
      "-map", "0:v:0", "-map", "0:a:0?",
      "-c:v", "copy",
      "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
      "-movflags", "+faststart",
      dest,
    ],
    { duration, onProgress }
  );
}

/** A stretch of the speech track, re-encoded so it starts on a clean frame. */
export function cutAudio(src, dest, start, end) {
  return ffmpeg([
    "-ss", String(Math.max(0, start)),
    "-t", String(Math.max(0.05, end - start)),
    "-i", src,
    "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "32k",
    dest,
  ]);
}

async function volumeOf(file, { start, duration } = {}) {
  let mean = -30;
  await runProcess(
    FFMPEG_PATH,
    [
      "-hide_banner", "-nostdin",
      ...(start !== undefined ? ["-ss", String(start), "-t", String(duration)] : []),
      "-i", file, "-af", "volumedetect", "-f", "null", "-",
    ],
    {
      onStderrLine: (l) => {
        const m = l.match(/mean_volume:\s*(-?[\d.]+) dB/);
        if (m) mean = Number(m[1]);
      },
    }
  );
  return mean;
}

async function silencesIn(file, { noise, minSilence, start, duration }) {
  const out = [];
  let open = null;
  const offset = start || 0;
  await runProcess(
    FFMPEG_PATH,
    [
      "-hide_banner", "-nostdin",
      ...(start !== undefined ? ["-ss", String(start), "-t", String(duration)] : []),
      "-i", file,
      "-af", `silencedetect=noise=${noise.toFixed(1)}dB:d=${minSilence}`,
      "-f", "null", "-",
    ],
    {
      onStderrLine: (l) => {
        let m = l.match(/silence_start:\s*(-?[\d.]+)/);
        if (m) {
          open = Math.max(0, Number(m[1])) + offset;
          return;
        }
        m = l.match(/silence_end:\s*([\d.]+)/);
        if (m) {
          out.push([open ?? offset, Number(m[1]) + offset]);
          open = null;
        }
      },
    }
  );
  if (open !== null) out.push([open, offset + (duration || Infinity)]);
  return out;
}

function complement(silences, from, to) {
  const islands = [];
  let cursor = from;
  for (const [s, e] of silences) {
    if (s > cursor) islands.push({ start: cursor, end: Math.min(s, to) });
    cursor = Math.max(cursor, e);
  }
  if (to > cursor) islands.push({ start: cursor, end: to });
  return islands.filter((i) => i.end > i.start);
}

/**
 * Where somebody is talking, as a list of stretches between pauses.
 *
 * ── WHY PAUSES AND NOT WORD TIMESTAMPS ───────────────────────────────────────
 * An editor cuts in the gaps. A cut placed from a model's word timestamp lands
 * wherever the model thinks a word ended, which on code-mixed Telugu-English is
 * often a syllable early and clips the word. A cut placed in a detected pause
 * cannot clip anything, because there is nothing there to clip. So the edges of
 * every clip come from the audio itself, and the model is only asked what was
 * said inside each stretch, which it is very good at.
 *
 * The threshold is set from the recording's own loudness rather than a fixed
 * number: a phone in a quiet room and a lapel mic on a street have noise floors
 * twenty decibels apart.
 *
 * Long stretches get a second, finer pass. Somebody who rattles off three
 * sentences without a proper pause still takes a breath, and a 25-second
 * stretch has to be split somewhere for the matching to place lines inside it.
 */
export async function detectSpeech(file, { duration, minSilence = 0.32 } = {}) {
  const mean = await volumeOf(file);
  const noise = Math.max(-55, Math.min(-26, mean - 11));

  const coarse = complement(await silencesIn(file, { noise, minSilence }), 0, duration);

  const refined = [];
  for (const isl of coarse) {
    if (isl.end - isl.start <= 14) {
      refined.push(isl);
      continue;
    }
    const inner = await silencesIn(file, {
      noise: noise + 3,
      minSilence: 0.16,
      start: isl.start,
      duration: isl.end - isl.start,
    });
    refined.push(...complement(inner, isl.start, isl.end));
  }

  return { islands: tidy(refined), noise, mean };
}

/** Joins stretches split by a hair's-breadth gap and drops clicks. */
function tidy(islands) {
  const merged = [];
  for (const isl of islands.sort((a, b) => a.start - b.start)) {
    const prev = merged[merged.length - 1];
    if (prev && isl.start - prev.end < 0.15) prev.end = Math.max(prev.end, isl.end);
    else merged.push({ ...isl });
  }
  return merged
    .filter((i) => i.end - i.start >= 0.18)
    .map((i) => ({ start: round3(i.start), end: round3(i.end) }));
}

const round3 = (n) => Math.round(n * 1000) / 1000;

export default {
  FFMPEG_PATH, FFPROBE_PATH, runProcess, ffmpeg, ffmpegFromFrames, probe,
  makeVideoProxy, makeAudioProxy, extractSpeechAudio, makeThumbnail, cutAudio, detectSpeech,
  extractFrames, extractFrameAt, remuxRecording, ffmpegToFrames,
};

/**
 * capture.js: recording the screen, the way Google Meet shares one.
 *
 * Click Record, the browser's own picker opens, choose a screen, window or tab,
 * and recording starts. No extension, no desktop app, no permission beyond the
 * one the operating system already asks for. That is the whole promise of this
 * product and this file is where it is kept.
 *
 * Three things happen at once while a demo is being recorded:
 *
 *   1. MediaRecorder writes the video, in chunks, into Blobs. Those are backed
 *      by the browser's own storage rather than held in the tab's heap, which is
 *      what makes a thirty minute 4K recording survivable.
 *   2. The tracker watches the captured frames and recovers the pointer
 *      (tracker.worker.js), because the browser will not give it to us.
 *   3. Nothing else. Everything that could wait — uploading, analysing,
 *      thumbnails — waits, because this tab is the thing the creator is
 *      demonstrating and a hitch here is a hitch in the finished video.
 *
 * ── THE AUDIO IS TWO STREAMS AND ONE TRACK ───────────────────────────────────
 * getDisplayMedia can hand over the tab's or the system's sound; getUserMedia
 * hands over the microphone. They arrive as separate tracks and MediaRecorder
 * takes one. They are mixed through a WebAudio graph, which is also the only
 * place a live level meter can come from.
 */
import { uploadFile } from "../Edit/uploads";

/** Reported with every recording, so a demo can be told from a later tracker's. */
export const TRACKER_VERSION = "px-2";

/** Frames a second the tracker looks at. Not the recording's frame rate. */
const TRACK_HZ = 24;
/** Long side the tracker downscales to before looking for the pointer. */
const TRACK_EDGE = 960;
/** How often MediaRecorder hands over a chunk. */
const CHUNK_MS = 3000;

/* ────────────────────────────────────────────────────────────────────────────
   Is this browser going to be able to do it
   ──────────────────────────────────────────────────────────────────────────── */

export function captureSupport() {
  const hasDisplay = !!navigator.mediaDevices?.getDisplayMedia;
  const hasRecorder = typeof window.MediaRecorder !== "undefined";
  const secure = window.isSecureContext !== false;
  return {
    ok: hasDisplay && hasRecorder && secure,
    hasDisplay,
    hasRecorder,
    secure,
    // Recovering the pointer needs to read the frames back. Without a worker
    // and a canvas it would have to happen on the main thread, during the
    // recording, which is exactly when it must not.
    tracking: typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined",
    why: !secure
      ? "Screen recording needs a secure connection (https)."
      : !hasDisplay
        ? "This browser can't share a screen. Chrome, Edge or Firefox on a desktop can."
        : !hasRecorder
          ? "This browser can't record video."
          : "",
  };
}

/**
 * What MediaRecorder should write.
 *
 * MP4 first where Chrome offers it: it needs no remux to be playable and it is
 * what people expect a file called a recording to be. WebM/VP9 everywhere else,
 * which is every browser. Either way the server remuxes on arrival, because
 * neither format carries a usable duration while it is still being written.
 */
export function bestMimeType() {
  const wanted = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const m of wanted) {
    if (window.MediaRecorder?.isTypeSupported?.(m)) return m;
  }
  return "";
}

/* ────────────────────────────────────────────────────────────────────────────
   Opening the picker
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Ask for a screen, and for sound.
 *
 * ── THE PICKER MUST BE THE FIRST THING THAT HAPPENS ──────────────────────────
 * getDisplayMedia only opens from a real click, and only once per click. So it
 * is called before the microphone, before the AudioContext, before anything
 * else: any await in front of it spends the user gesture and the browser
 * refuses with a NotAllowedError that reads exactly like the user declining.
 *
 * @returns {{ display, mic, stream, surface, label, hasSystemAudio, hasMic, stop }}
 */
export async function startCapture({ mic = true, systemAudio = true } = {}) {
  const display = await navigator.mediaDevices.getDisplayMedia({
    video: {
      frameRate: { ideal: 30, max: 60 },
      // Not in every browser's constraint list, and harmless where it is
      // ignored: the cursor is composited in by default. It has to be there —
      // the tracker recovers the pointer FROM those pixels, so a recording
      // without a visible cursor is a recording with no pointer data at all.
      cursor: "always",
    },
    audio: systemAudio,
    // The studio's own tab is not a thing anyone means to record, and offering
    // it invites the infinite hall of mirrors.
    selfBrowserSurface: "exclude",
    // Lets the creator switch to a different window mid-recording without
    // stopping, which is how a real demo across two apps gets made.
    surfaceSwitching: "include",
    systemAudio: systemAudio ? "include" : "exclude",
  });

  const videoTrack = display.getVideoTracks()[0];
  const settings = videoTrack?.getSettings?.() || {};

  /**
   * ── COULD WE HAVE ASKED FOR NO CURSOR AT ALL? ─────────────────────────────
   * Everything painful about the pointer comes from it being composited into
   * the pixels: it has to be recovered from frame differences, and once the
   * drawn path is composed rather than copied it has to be reconstructed away
   * again (backend render/hide.js). A recording that never contained one would
   * make all of that unnecessary.
   *
   * We cannot switch yet — the clicks the whole edit is built from are inferred
   * from watching the pointer, so removing it would remove the evidence. But
   * whether this browser WOULD honour the request is worth knowing, and it
   * costs nothing to ask. Recorded per demo so the decision is made on what
   * real browsers do rather than on what the specification says.
   */
  const cursorControl = (() => {
    try {
      const supported = !!navigator.mediaDevices?.getSupportedConstraints?.().cursor;
      const caps = videoTrack?.getCapabilities?.() || {};
      const offered = Array.isArray(caps.cursor) ? caps.cursor.join(",") : "";
      return { supported, offered, applied: String(settings.cursor || "") };
    } catch {
      return { supported: false, offered: "", applied: "" };
    }
  })();

  let micStream = null;
  if (mic) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      // A refused microphone is not a refused recording. The demo carries on
      // silent, and the setup screen says so afterwards.
      micStream = null;
    }
  }

  const systemTracks = display.getAudioTracks();
  const { track: audioTrack, context, analyser } = mixAudio(display, micStream);

  const stream = new MediaStream();
  if (videoTrack) stream.addTrack(videoTrack);
  if (audioTrack) stream.addTrack(audioTrack);

  const stop = () => {
    for (const t of display.getTracks()) t.stop();
    if (micStream) for (const t of micStream.getTracks()) t.stop();
    if (context && context.state !== "closed") context.close().catch(() => {});
  };

  return {
    display,
    mic: micStream,
    stream,
    analyser,
    surface: ["monitor", "window", "browser"].includes(settings.displaySurface) ? settings.displaySurface : "unknown",
    label: videoTrack?.label || "",
    width: settings.width || 0,
    height: settings.height || 0,
    cursorControl,
    hasSystemAudio: systemTracks.length > 0,
    hasMic: !!micStream,
    videoTrack,
    stop,
  };
}

/**
 * The microphone and the screen's sound, as one track.
 *
 * Returns nothing to mix when there is nothing: a silent recording gets no
 * audio track at all rather than a track of digital silence, which would cost
 * bytes on every upload and make every demo look like it had sound.
 */
function mixAudio(display, micStream) {
  const sources = [];
  const sys = display.getAudioTracks();
  if (sys.length) sources.push(new MediaStream(sys));
  if (micStream?.getAudioTracks().length) sources.push(micStream);
  if (!sources.length) return { track: null, context: null, analyser: null };

  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return { track: sources[0].getAudioTracks()[0], context: null, analyser: null };

  const context = new Ctx();
  const dest = context.createMediaStreamDestination();
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;

  for (const s of sources) {
    const node = context.createMediaStreamSource(s);
    node.connect(dest);
    node.connect(analyser);
  }

  return { track: dest.stream.getAudioTracks()[0], context, analyser };
}

/** How loud it is right now, 0..1, for the level meter on the overlay. */
export function levelOf(analyser, buf) {
  if (!analyser) return 0;
  analyser.getByteTimeDomainData(buf);
  let peak = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = Math.abs(buf[i] - 128) / 128;
    if (v > peak) peak = v;
  }
  return Math.min(1, peak * 1.6);
}

/* ────────────────────────────────────────────────────────────────────────────
   The tracker
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Watches the captured stream and records where the pointer went.
 *
 * ── WHAT IT KEEPS ────────────────────────────────────────────────────────────
 *   track   [{ t, x, y, shape, conf }]  pointer sightings, thinned
 *   motion  [{ t, energy, x, y, w, h, dy }]  what changed on screen, per sample
 *
 * Both are OBSERVATIONS. Clicks, scrolls and typing are inferred from them on
 * the server, so the thresholds that decide what a click looks like can change
 * later and be re-applied to recordings already made.
 *
 * ── IT THINS AS IT GOES ──────────────────────────────────────────────────────
 * Twenty-four samples a second over thirty minutes is 43,000 points, and the
 * pointer spends most of a demo perfectly still. A sighting is kept only when
 * the pointer actually moved, or when a quarter second has passed with no
 * sample at all, so a still pointer costs four points a second instead of
 * twenty-four and the path is unchanged.
 */
export function createTracker() {
  let worker = null;
  let video = null;
  let canvas = null;
  let ctx = null;
  let timer = null;
  let running = false;
  let t0 = 0;
  let paused = 0;
  let pausedAt = 0;
  let busy = false;

  const track = [];
  const motion = [];
  let lastKept = null;

  const now = () => (performance.now() - t0 - paused) / 1000;

  function onMessage(e) {
    const msg = e.data;
    if (!msg || msg.first || msg.error) return;
    const t = msg.t;

    if (msg.motion) {
      // Motion is kept for every sample. It is small — seven numbers — and it
      // is the entire evidence for clicks, scrolls, typing and dead air.
      motion.push({
        t: round3(t),
        energy: round4(msg.motion.energy),
        x: round4(msg.motion.x),
        y: round4(msg.motion.y),
        w: round4(msg.motion.w),
        h: round4(msg.motion.h),
        dy: round3(msg.motion.dy),
      });
    }

    if (msg.cursor) {
      const p = { t: round3(t), x: round4(msg.cursor.x), y: round4(msg.cursor.y), shape: msg.cursor.shape, conf: round3(msg.cursor.conf) };
      const moved = !lastKept || Math.hypot(p.x - lastKept.x, p.y - lastKept.y) > 0.0015;
      const stale = !lastKept || p.t - lastKept.t > 0.25;
      if (moved || stale) {
        track.push(p);
        lastKept = p;
      }
    }
  }

  async function tick() {
    if (!running || busy || !video || video.readyState < 2 || video.videoWidth === 0) return;
    busy = true;
    const t = now();
    try {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const scale = Math.min(1, TRACK_EDGE / Math.max(vw, vh));
      const w = Math.max(2, Math.round((vw * scale) / 2) * 2);
      const h = Math.max(2, Math.round((vh * scale) / 2) * 2);

      // createImageBitmap resizes on the compositor and transfers ownership, so
      // the pixels never touch this thread's heap. The canvas path below is the
      // fallback for browsers without resize options on createImageBitmap; it
      // costs a readback here, which is why it is not the first choice.
      if (typeof createImageBitmap === "function" && typeof OffscreenCanvas !== "undefined") {
        const bitmap = await createImageBitmap(video, { resizeWidth: w, resizeHeight: h, resizeQuality: "low" });
        worker.postMessage({ type: "frame", bitmap, t }, [bitmap]);
      } else {
        if (!canvas || canvas.width !== w || canvas.height !== h) {
          canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          ctx = canvas.getContext("2d", { willReadFrequently: true });
        }
        ctx.drawImage(video, 0, 0, w, h);
        const img = ctx.getImageData(0, 0, w, h);
        worker.postMessage({ type: "frame", data: img.data, width: w, height: h, t }, [img.data.buffer]);
      }
    } catch {
      // A frame that could not be grabbed — the surface changed, the tab went
      // to the background — is one missing sample and nothing more.
    } finally {
      busy = false;
    }
  }

  return {
    async start(stream) {
      worker = new Worker(new URL("./tracker.worker.js", import.meta.url));
      worker.onmessage = onMessage;

      video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = new MediaStream(stream.getVideoTracks());
      await video.play().catch(() => {});

      t0 = performance.now();
      paused = 0;
      running = true;
      timer = setInterval(tick, 1000 / TRACK_HZ);
    },

    pause() {
      if (!running) return;
      running = false;
      pausedAt = performance.now();
    },

    resume() {
      if (running || !timer) return;
      paused += performance.now() - pausedAt;
      running = true;
      // The screen has almost certainly changed while it was paused, and
      // comparing against a frame from before the pause would read as one
      // enormous burst of motion at the moment of resuming.
      worker?.postMessage({ type: "reset" });
    },

    stop() {
      running = false;
      if (timer) clearInterval(timer);
      timer = null;
      worker?.terminate();
      worker = null;
      if (video) {
        video.pause();
        video.srcObject = null;
        video = null;
      }
    },

    /** Everything seen, for POST /studio/demos/:id/upload/complete. */
    report() {
      return { track, motion, tracker: TRACKER_VERSION, samples: track.length };
    },

    get samples() {
      return track.length;
    },
  };
}

const round3 = (v) => Math.round(v * 1000) / 1000;
const round4 = (v) => Math.round(v * 10000) / 10000;

/* ────────────────────────────────────────────────────────────────────────────
   The recorder
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * MediaRecorder, with pause, and chunks kept as Blobs.
 *
 * ── WHY THE CHUNKS ARE NOT UPLOADED AS THEY ARRIVE ───────────────────────────
 * It would be lovely and it does not work: a resumable upload needs to know the
 * total size, and a recording in progress has no total size. Keeping Blob
 * references instead costs the tab almost nothing — the data lives in the
 * browser's blob store, which spills to disk — and the upload starts the moment
 * the last chunk lands.
 */
export function createRecorder(stream, { onChunk = () => {}, onError = () => {} } = {}) {
  const mimeType = bestMimeType();
  const chunks = [];
  let recorder = null;
  let startedAt = 0;
  let paused = 0;
  let pausedAt = 0;

  return {
    mimeType,
    start() {
      recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        // Enough for text to stay sharp. Screen content is flat colour and hard
        // edges, and the thing a viewer will actually judge is whether the
        // interface text is readable; under about 6 Mbps at 1080p it is not.
        videoBitsPerSecond: 8_000_000,
        audioBitsPerSecond: 128_000,
      });
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
          onChunk(chunks.length, e.data.size);
        }
      };
      recorder.onerror = (e) => onError(e.error || new Error("Recording failed"));
      recorder.start(CHUNK_MS);
      startedAt = performance.now();
    },

    pause() {
      if (recorder?.state === "recording") {
        recorder.pause();
        pausedAt = performance.now();
      }
    },

    resume() {
      if (recorder?.state === "paused") {
        paused += performance.now() - pausedAt;
        recorder.resume();
      }
    },

    /** @returns {Promise<Blob>} */
    stop() {
      return new Promise((resolve) => {
        if (!recorder || recorder.state === "inactive") {
          resolve(new Blob(chunks, { type: mimeType || "video/webm" }));
          return;
        }
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType || "video/webm" }));
        recorder.stop();
      });
    },

    get state() {
      return recorder?.state || "inactive";
    },
    get seconds() {
      if (!startedAt) return 0;
      const held = recorder?.state === "paused" ? performance.now() - pausedAt : 0;
      return (performance.now() - startedAt - paused - held) / 1000;
    },
    get bytes() {
      return chunks.reduce((n, c) => n + c.size, 0);
    },
  };
}

/**
 * Send a finished recording, using the script editor's chunked upload.
 *
 * Deliberately the same protocol as every other upload in this product
 * (src/components/Edit/uploads.js): a PUT per chunk with a Content-Range, the
 * server saying how much it holds, and a dropped connection pausing the upload
 * rather than ending it. A thirty minute screen recording on a domestic
 * connection is exactly the case that protocol was written for.
 */
export function sendRecording(blob, session, opts) {
  // uploadFile wants something with .size and .slice, which a Blob has. Giving
  // it a name as well means the browser's network panel says what it is.
  return uploadFile(blob, session, opts);
}

const capture = { captureSupport, bestMimeType, startCapture, createTracker, createRecorder, sendRecording, levelOf, TRACKER_VERSION }
export default capture;

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
export const TRACKER_VERSION = "px-3";

/** Frames a second the tracker looks at. Not the recording's frame rate. */
const TRACK_HZ = 24;
/** Long side the tracker downscales to before looking for the pointer. */
const TRACK_EDGE = 960;
/** How often MediaRecorder hands over a chunk. */
const CHUNK_MS = 3000;

/**
 * ── AND A SECOND, SMALL PICTURE AT FULL RESOLUTION ───────────────────────────
 * The downscale above is what makes the tracker affordable, and it is also what
 * makes the pointer unreadable: on a 1080p recording TRACK_EDGE halves a 19px
 * cursor to nine, and nine pixels cannot say which cursor it is. The server
 * cannot recover it either — it only ever sees the recording after H.264, which
 * smears the one-pixel outline the answer lives in.
 *
 * This is a patch cut around the pointer from the ORIGINAL frame, one to one.
 * It is the only place in this product where a sharp cursor exists.
 *
 * 192 covers a 96px cursor — Windows at 300% on a 4K display, the largest a
 * pointer gets — with room either side for it to have moved. It is also 36,864
 * pixels against the downscaled frame's 518,400, so reading it costs about a
 * fourteenth of the pass it supplements.
 */
const PATCH = 192;
/**
 * The patch origin is snapped to this grid so that consecutive frames usually
 * cut from the same place. The worker finds the glyph by what CHANGED between
 * two patches, which only means anything if they line up; a frame where the
 * origin moves is skipped. Snapping trades one sample each time the pointer
 * travels 64px for never having to register two offset patches against each
 * other, which is arithmetic that can be silently wrong.
 */
const PATCH_GRID = 64;
/** Glyph readings needed before the recording claims to know its own cursor. */
const GLYPH_MIN_SAMPLES = 6;

/* ────────────────────────────────────────────────────────────────────────────
   What machine this is
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The display and the operating system, recorded with the demo.
 *
 * ── WHY THE SERVER CANNOT WORK THIS OUT ──────────────────────────────────────
 * The pointer is found in the recording by drawing a template of it and looking
 * for the match (backend/services/studio/locate.js), and to draw one you must
 * know HOW BIG the pointer is in the picture. The server only has the video, so
 * it measures the size from the frames — which works while the pointer is
 * moving and returns nothing at all on a demo where it mostly sits still. Its
 * fallback is arithmetic on the frame width that quietly assumes the creator
 * has a 1920-wide desktop at 100% zoom.
 *
 * The browser knows the real answer for nothing. A cursor is drawn at a fixed
 * size in CSS pixels and scaled up by the display's pixel ratio, and the
 * capture is that framebuffer, possibly resized on the way. So its height in
 * the recording is
 *
 *     cursorPx  =  glyphCss  x  videoWidth / screenWidthCss
 *
 * and the pixel ratio cancels: a 150% Windows laptop and a Retina MacBook both
 * fall out of the same line. `screen.width` is the one term the server can
 * never see, which is the whole reason this is sent.
 *
 * ── AND THE PLATFORM, BECAUSE THE TWO DRAW DIFFERENT POINTERS ────────────────
 * Windows draws a white arrow with a black outline; macOS draws a black one
 * with a white outline. The locator discovers that from the pixels either way,
 * and telling it which to expect makes the discovery quicker and its tie-breaks
 * better. Reported, never trusted: a wrong guess here must not be able to cost
 * a recording its pointer, so it is a prior and not an instruction.
 *
 * Everything here is non-identifying — a screen size, a scale factor and an OS
 * family. No user agent string is stored.
 */
export function environment() {
  const uaPlatform = navigator.userAgentData?.platform || "";
  const legacy = navigator.platform || "";
  const ua = navigator.userAgent || "";
  const hay = (uaPlatform + " " + legacy + " " + ua).toLowerCase();
  const platform =
    /mac|iphone|ipad|ipod/.test(hay) && !/windows/.test(hay) ? "macos"
      : /windows|win32|win64/.test(hay) ? "windows"
        : /cros/.test(hay) ? "chromeos"
          : /android/.test(hay) ? "android"
            : /linux|x11/.test(hay) ? "linux"
              : "unknown";
  const s = window.screen || {};
  /**
   * ── AND THE COLOUR SCHEME, WHICH IS WEAKER EVIDENCE THAN IT LOOKS ──────────
   * It is tempting to read this as "dark mode, therefore a dark pointer". It is
   * not: Windows draws its white arrow whether or not the desktop is dark, and
   * macOS draws its black one whether or not it is light. Changing the pointer
   * is a separate accessibility setting that almost nobody touches.
   *
   * So it is recorded and not acted on. What it is good for is the case the
   * platform prior cannot cover — a creator who HAS changed their cursor — and
   * telling that apart from an ordinary dark desktop needs the recordings this
   * field will be present on. Storing it now is what makes that possible later;
   * guessing from it now would break the common case to chase the rare one.
   */
  const scheme =
    window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
  return {
    platform,
    scheme,
    // Fractional on a scaled display, and that is the point of it.
    dpr: Number(window.devicePixelRatio) || 1,
    // CSS pixels, which is the unit the cursor's own size is fixed in.
    screen_w: Number(s.width) || 0,
    screen_h: Number(s.height) || 0,
    // Which browser, because what a capture delivers — whether an idle pointer
    // is drawn, how often frames arrive — is the browser's decision, and a
    // recording that behaves differently needs to be traceable to one.
    ...browserOf(ua),
  };
}

/** The browser's name and major version, from client hints where there are any. */
function browserOf(ua) {
  const brands = navigator.userAgentData?.brands || [];
  const named = brands.find((b) => /edge|opera|brave|chrome/i.test(b.brand) && !/not.?a.?brand/i.test(b.brand));
  if (named) {
    const edge = brands.find((b) => /edge/i.test(b.brand));
    const pick = edge || named;
    return { browser: /edge/i.test(pick.brand) ? "edge" : /opera/i.test(pick.brand) ? "opera" : /brave/i.test(pick.brand) ? "brave" : "chrome", browser_version: String(pick.version || "") };
  }
  const m = (re) => (ua.match(re) || [])[1] || "";
  if (/edg\//i.test(ua)) return { browser: "edge", browser_version: m(/edg\/(\d+)/i) };
  if (/firefox\//i.test(ua)) return { browser: "firefox", browser_version: m(/firefox\/(\d+)/i) };
  if (/chrome\//i.test(ua)) return { browser: "chrome", browser_version: m(/chrome\/(\d+)/i) };
  if (/safari\//i.test(ua) && /version\//i.test(ua)) return { browser: "safari", browser_version: m(/version\/(\d+)/i) };
  return { browser: "unknown", browser_version: "" };
}

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
    /**
     * What the capture track actually delivered, as opposed to what was asked
     * for. `cursor: "always"` is requested and Chrome's tab capture draws an
     * idle pointer anyway only sometimes — the setting it reports is the only
     * record of which, and every pointer gap the server finds means something
     * different depending on it.
     */
    device: {
      cursor: String(settings.cursor || ""),
      cursor_offered: cursorControl.offered,
      cursor_supported: cursorControl.supported,
      frame_rate: Number(settings.frameRate) || 0,
      logical_surface: typeof settings.logicalSurface === "boolean" ? settings.logicalSurface : null,
      screen_pixel_ratio: Number(settings.screenPixelRatio) || 0,
      width: settings.width || 0,
      height: settings.height || 0,
    },
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
  let pcanvas = null;
  let pctx = null;
  let timer = null;
  let running = false;
  let t0 = 0;
  let paused = 0;
  let pausedAt = 0;
  let busy = false;

  const track = [];
  const motion = [];
  const glyphs = [];
  let lastKept = null;
  /** Where the pointer was last seen, normalised. Decides where to cut. */
  let lastSeen = null;

  const now = () => (performance.now() - t0 - paused) / 1000;

  function onMessage(e) {
    const msg = e.data;
    if (!msg || msg.first || msg.error) return;
    const t = msg.t;

    // A full-resolution reading of the pointer itself. Kept separately from the
    // track: the track says where it went, these say what it IS, and only one
    // answer is needed for the whole recording.
    if (msg.glyph?.design && glyphs.length < 4000) {
      glyphs.push({ h: msg.glyph.h, design: msg.glyph.design });
    }

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
      lastSeen = { x: p.x, y: p.y };
      const moved = !lastKept || Math.hypot(p.x - lastKept.x, p.y - lastKept.y) > 0.0015;
      const stale = !lastKept || p.t - lastKept.t > 0.25;
      if (moved || stale) {
        track.push(p);
        lastKept = p;
      }
    }
  }

  /**
   * Where to cut the full-resolution patch, in source pixels.
   *
   * Snapped to PATCH_GRID so that a pointer moving normally is cut from the
   * same place two frames running, which is what the worker needs to see what
   * changed. Clamped to the frame, which also snaps it — at an edge the origin
   * simply stops moving, which is the stable case rather than the broken one.
   */
  function patchRect(vw, vh) {
    if (!lastSeen) return null;
    const w = Math.min(PATCH, vw);
    const h = Math.min(PATCH, vh);
    const snap = (v, size, max) =>
      Math.max(0, Math.min(max - size, Math.floor((v - size / 2) / PATCH_GRID) * PATCH_GRID));
    return { x: snap(lastSeen.x * vw, w, vw), y: snap(lastSeen.y * vh, h, vh), w, h };
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

      // Where the pointer is, at full size. Null until the coarse pass has
      // found it once, and after a reset until it finds it again.
      const at = patchRect(vw, vh);

      // createImageBitmap resizes on the compositor and transfers ownership, so
      // the pixels never touch this thread's heap. The canvas path below is the
      // fallback for browsers without resize options on createImageBitmap; it
      // costs a readback here, which is why it is not the first choice.
      if (typeof createImageBitmap === "function" && typeof OffscreenCanvas !== "undefined") {
        // Both cuts are asked for together so they come from as near the same
        // moment as the browser will give: the patch is compared against the
        // previous patch, not against the whole frame, so a few milliseconds of
        // skew between the two costs nothing.
        const [bitmap, patch] = await Promise.all([
          createImageBitmap(video, { resizeWidth: w, resizeHeight: h, resizeQuality: "low" }),
          at ? createImageBitmap(video, at.x, at.y, at.w, at.h) : null,
        ]);
        worker.postMessage(
          { type: "frame", bitmap, patch, at, vw, vh, t },
          patch ? [bitmap, patch] : [bitmap]
        );
      } else {
        if (!canvas || canvas.width !== w || canvas.height !== h) {
          canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          ctx = canvas.getContext("2d", { willReadFrequently: true });
        }
        ctx.drawImage(video, 0, 0, w, h);
        const img = ctx.getImageData(0, 0, w, h);

        let patchData = null;
        if (at) {
          if (!pcanvas || pcanvas.width !== at.w || pcanvas.height !== at.h) {
            pcanvas = document.createElement("canvas");
            pcanvas.width = at.w;
            pcanvas.height = at.h;
            pctx = pcanvas.getContext("2d", { willReadFrequently: true });
          }
          pctx.drawImage(video, at.x, at.y, at.w, at.h, 0, 0, at.w, at.h);
          patchData = pctx.getImageData(0, 0, at.w, at.h).data;
        }

        worker.postMessage(
          { type: "frame", data: img.data, width: w, height: h, patchData, patchW: at?.w, patchH: at?.h, at, vw, vh, t },
          patchData ? [img.data.buffer, patchData.buffer] : [img.data.buffer]
        );
      }
    } catch {
      // A frame that could not be grabbed — the surface changed, the tab went
      // to the background — is one missing sample and nothing more.
    } finally {
      busy = false;
    }
  }

  /* ──────────────────────────────────────────────────────────────────────────
     How often the browser actually hands over a frame
     ────────────────────────────────────────────────────────────────────────── */

  /**
   * ── WHY THE RECORDING'S AVERAGE FRAME RATE CANNOT ANSWER THIS ─────────────
   * A creator watched an export and said the scrolling came out "chunk chunk,
   * step step" rather than the smooth scroll they had performed. The recordings
   * report 13 to 25 frames a second against the 30 every preset exports at, so
   * each captured frame is held for 1.2 to 2.2 output frames — never a whole
   * number, which is exactly what stepping looks like.
   *
   * But that average is frames ÷ duration, and a screen capture only emits a
   * frame when the screen CHANGES. Thirteen a second could be thirty during
   * every scroll and two while the creator talks over a still page — in which
   * case the capture is healthy and the fault is ours, in the resample. Or it
   * could be a flat thirteen throughout, in which case the encoder or this
   * tracker is starving it. The two have opposite fixes and the average cannot
   * tell them apart.
   *
   * `requestVideoFrameCallback` can: it fires once per frame the browser
   * presents, carrying that frame's own `mediaTime`. The gaps between those are
   * the recording's real cadence, and the QUICKEST QUARTER of them is the
   * recording at its busiest — which is the number that says whether smooth
   * motion was captured smoothly.
   *
   * It costs nothing: the callback is hung on the video element the tracker
   * already has, does no pixel work, and where the browser does not implement
   * it (Firefox, at the time of writing) this reports that it could not look
   * rather than guessing.
   */
  const gaps = [];
  let lastMediaS = 0;
  let firstPresented = 0;
  let lastPresented = 0;
  let cadenceOn = false;

  function watchCadence(el) {
    if (typeof el?.requestVideoFrameCallback !== "function") return;
    cadenceOn = true;
    const step = (_now, meta) => {
      // The element is torn down on stop(); asking it for another callback
      // then throws, and there is nothing left to measure anyway.
      if (!video) return;
      const mt = Number(meta?.mediaTime);
      if (Number.isFinite(mt)) {
        // The frame's OWN timestamp, not the wall clock: this is the number
        // that ends up in the file and that the renderer later resamples.
        if (lastMediaS > 0 && mt > lastMediaS) {
          const ms = (mt - lastMediaS) * 1000;
          // A gap of seconds is the creator leaving the screen alone, which is
          // real and worth counting; anything past that is a pause or a tab
          // switch and says nothing about cadence.
          if (ms < 5000) gaps.push(Math.round(ms * 10) / 10);
        }
        lastMediaS = mt;
      }
      const pf = Number(meta?.presentedFrames);
      if (Number.isFinite(pf)) {
        if (!firstPresented) firstPresented = pf;
        lastPresented = pf;
      }
      try { el.requestVideoFrameCallback(step); } catch { /* torn down */ }
    };
    try { el.requestVideoFrameCallback(step); } catch { cadenceOn = false; }
  }

  function cadenceOf() {
    if (!cadenceOn) return { supported: false };
    if (gaps.length < 8) return { supported: true, frames: gaps.length + 1 };

    const sorted = [...gaps].sort((a, b) => a - b);
    const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    const hz = (ms) => (ms > 0 ? Math.round((1000 / ms) * 10) / 10 : 0);
    const quarter = sorted.slice(0, Math.max(1, Math.round(sorted.length / 4)));
    const busyMean = quarter.reduce((a, b) => a + b, 0) / quarter.length;

    return {
      supported: true,
      frames: gaps.length + 1,
      // What the browser says it presented over the same stretch. More than
      // `frames` means this callback missed some, which is itself a reading:
      // the page was too busy to be told about its own frames.
      presented: Math.max(0, lastPresented - firstPresented),
      p10_ms: round3(at(0.1)),
      median_ms: round3(at(0.5)),
      p90_ms: round3(at(0.9)),
      /** The recording at its busiest. Near 30 means smooth motion was caught. */
      fastest_quarter_hz: hz(busyMean),
      median_hz: hz(at(0.5)),
      /**
       * How uneven the spacing is, p90 over p10. A locked frame rate is 1. A
       * capture that only emits on change is high however good its average, and
       * that unevenness is what survives into the export as stepping.
       */
      spread: round3(at(0.9) / Math.max(0.1, at(0.1))),
    };
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

      watchCadence(video);

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
      lastSeen = null;
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
      return {
        track, motion, tracker: TRACKER_VERSION, samples: track.length,
        cursor: profileOf(glyphs),
        frames: cadenceOf(),
      };
    },

    get samples() {
      return track.length;
    },
  };
}

const round3 = (v) => Math.round(v * 1000) / 1000;
const round4 = (v) => Math.round(v * 10000) / 10000;

/**
 * Which pointer this recording has, from many full-resolution readings of it.
 *
 * ── WHY THIS IS WORTH THE TROUBLE ────────────────────────────────────────────
 * The server decides the same two things today — light body or dark, and how
 * tall — by drawing candidate pointers and seeing which fits the recording
 * best (backend/services/studio/locate.js, calibrate). That search runs on
 * compressed, sometimes rescaled frames, and when it picks wrong it picks wrong
 * for the WHOLE recording: every later frame is then matched against the wrong
 * template and the pointer is simply not found. One real recording calibrated
 * as a 21px dark pointer on a machine that draws a 19px light one and located
 * the cursor in 40% of its frames.
 *
 * Neither number can be recovered once the recording is encoded. Both are
 * trivially measurable here, where the pixels are still the ones the operating
 * system drew. So they are measured here and sent as two numbers.
 *
 * ── ONE READING IS NOT TRUSTED; THE AGREEMENT BETWEEN MANY IS ────────────────
 * A single glyph can be read wrong — the rim only shows up where it differed
 * from whatever was underneath, so a pointer crossing black text reads thinner
 * and darker than it is. Across a recording those disagree in different
 * directions, and the majority and the median do not. What is reported with the
 * answer is how much the readings agreed, and the server treats a shaky profile
 * as a hint and a firm one as the answer.
 */
function profileOf(glyphs) {
  if (glyphs.length < GLYPH_MIN_SAMPLES) return null;

  let light = 0;
  let dark = 0;
  for (const g of glyphs) {
    if (g.design === "dark") dark++;
    else light++;
  }
  const design = dark > light ? "dark" : "light";

  // Height is taken only from the readings that agreed about the design. A
  // misread glyph is misread in both, and averaging them in would move the
  // size towards a pointer that is not there.
  const heights = glyphs.filter((g) => g.design === design).map((g) => g.h).sort((a, b) => a - b);
  const height = heights[heights.length >> 1];

  const agree = Math.max(light, dark) / glyphs.length;
  const tight = heights.filter((v) => Math.abs(v - height) <= 1).length / heights.length;
  // Below a couple of dozen readings the agreement is not yet evidence of
  // anything, so few samples cannot produce a confident answer however well
  // they happen to agree.
  const enough = Math.min(1, glyphs.length / 24);

  return {
    design,
    height_px: height,
    samples: glyphs.length,
    confidence: round3(Math.min(agree, tight) * enough),
  };
}

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

const capture = { captureSupport, environment, bestMimeType, startCapture, createTracker, createRecorder, sendRecording, levelOf, TRACKER_VERSION }
export default capture;

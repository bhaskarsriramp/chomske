/**
 * RecordPage.js: a recording in progress, and what happens to it after.
 *
 * It is handed a capture that is ALREADY running: "New recording" opened the
 * browser's tab picker straight from the click (RecordStart.js), and the
 * moment a tab was shared this page mounted and started the recorder. Three
 * states, in order:
 *
 *   recording  the controls float above whatever is being demonstrated.
 *   sending    the capture goes to storage, and meanwhile the creator says
 *              how it should be edited (EditChoice.js).
 *   thinking   saved; the editor is opening.
 *
 * ── NOTHING STANDS BETWEEN THE SHARE AND THE RECORDER ────────────────────────
 * The recorder starts on mount, before any network call. The studio record the
 * upload will belong to is created alongside it and awaited only at the end, so
 * a slow server costs the first seconds of nothing.
 *
 * ── THE CONTROLS FLOAT ABOVE EVERYTHING ──────────────────────────────────────
 * A demo is recorded in a DIFFERENT tab from this one, so an overlay drawn
 * here would be behind the thing being demonstrated and useless. Document
 * Picture-in-Picture gives a browser tab a small always-on-top window, which is
 * the only way to put a stop button over another application without shipping a
 * desktop app. Where that API is missing the overlay stays in the tab, and the
 * creator uses the browser's own "Stop sharing" bar instead.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { captureSupport, environment, createRecorder, createTracker, sendRecording, levelOf } from "./capture";
import { createDemo, startUpload, resumeUpload, completeUpload } from "./studioApi";
import { Icon } from "./ui";
import EditChoice from "./EditChoice";
import { requestAutoDemo } from "./autoDemoApi";
import "./studio.css";

/**
 * ── THREE MINUTES AT MOST ────────────────────────────────────────────────────
 * The longest recording (the creator's decision, 2026-10-03): the recorder
 * stops by itself when it is reached, whether or not Stop is pressed, and
 * counts down the last LAST_WARN seconds. The server says the limit
 * (config limits.max_recording_seconds, backend demoService.js); this is
 * the number used until it has. Stopped a little before it, so a recording
 * never runs past it on a busy machine (a background tab's timers fire about
 * once a second).
 */
export const MAX_RECORDING_SECONDS = 180;
const LAST_WARN = 30;
const STOP_EARLY = 0.4;

const clock = (s) => {
  const t = Math.max(0, Math.floor(s));
  const m = Math.floor(t / 60);
  return `${m}:${String(t % 60).padStart(2, "0")}`;
};

/**
 * `capture`: the running capture (capture.js startCapture). `prefs`: what the
 * creator asked for, { mic, tabSound }, to say so if the capture lacks it.
 * `onOpen(key, { autoAnalyse, captions })` once saved; `onFail(message)` if
 * nothing could be saved, which returns to the library.
 */
/**
 * `freeVideo`: this is a first-time creator's free video (backend
 * videoBilling.js), so `maxSeconds` is the free length and the choice after it
 * asks for no credits.
 */
export default function RecordPage({ capture: cap, prefs, onOpen, onFail, maxSeconds = MAX_RECORDING_SECONDS, freeVideo = false }) {
  const limit = maxSeconds > 0 ? maxSeconds : MAX_RECORDING_SECONDS;
  const [phase, setPhase] = useState("recording");
  const [notice, setNotice] = useState("");

  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0);
  const [sent, setSent] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const [saved, setSaved] = useState(false);
  // Stopped by the limit rather than by the creator: said on the next screen.
  const [hitLimit, setHitLimit] = useState(false);

  const capture = useRef(cap);
  const recorder = useRef(null);
  const tracker = useRef(null);
  // The studio record, being created while the recording runs.
  const demoReq = useRef(null);
  const stopping = useRef(false);
  const started = useRef(false);
  // The answer to "how should Clipo edit it?" (EditChoice.js), asked while the
  // recording uploads.
  const choice = useRef(null);
  const answer = useRef(null);
  const finishRef = useRef(null);

  /* ── Start ────────────────────────────────────────────────────────────── */

  useEffect(() => {
    // Once, even where StrictMode runs effects twice: refs survive that.
    if (started.current || !cap) return;
    started.current = true;

    recorder.current = createRecorder(cap.stream, {
      onError: () => setNotice("The recording stopped unexpectedly. What was captured up to that point is kept."),
    });
    tracker.current = createTracker();
    // Stopping the share from the browser's own bar ends the recording too, or
    // the creator is left with a tab that thinks it is still going.
    cap.videoTrack?.addEventListener("ended", () => finishRef.current?.(), { once: true });

    recorder.current.start();
    tracker.current.start(cap.stream).catch((err) => console.error("[studio] tracker failed to start", err));

    demoReq.current = createDemo("").then((d) => d.demo);
    // Awaited (and retried) when the recording ends; not an error yet.
    demoReq.current.catch(() => {});

    if (!cap.hasMic && prefs?.mic) setNotice("The microphone wasn't available, so this recording has no voice.");
    else if (!cap.hasSystemAudio && prefs?.tabSound) setNotice("This share has no tab sound. Tick “Share tab audio” in the picker next time if you need it.");
    else if (!captureSupport().tracking) setNotice("Click zooms aren't available in this browser. Chrome or Edge on a desktop has them.");
  }, [cap, prefs]);

  /* ── While it runs ────────────────────────────────────────────────────── */

  useEffect(() => {
    if (phase !== "recording") return undefined;
    const buf = new Uint8Array(512);
    const id = setInterval(() => {
      const seconds = recorder.current?.seconds || 0;
      setElapsed(seconds);
      setLevel(levelOf(capture.current?.analyser, buf));
      // The limit: stopped and saved like a press of Stop.
      if (seconds >= limit - STOP_EARLY && !stopping.current) {
        setHitLimit(true);
        finishRef.current?.();
      }
    }, 200);
    return () => clearInterval(id);
  }, [phase, limit]);

  // A recording in progress must not be lost to a stray navigation.
  useEffect(() => {
    if (phase !== "recording" && phase !== "sending") return undefined;
    const onLeave = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [phase]);

  const togglePause = useCallback(() => {
    const r = recorder.current;
    if (!r) return;
    if (r.state === "recording") {
      r.pause();
      tracker.current?.pause();
      setPaused(true);
    } else {
      r.resume();
      tracker.current?.resume();
      setPaused(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    const mic = capture.current?.mic;
    if (!mic) return;
    const next = !muted;
    for (const t of mic.getAudioTracks()) t.enabled = !next;
    setMuted(next);
  }, [muted]);

  /* ── Stop, send, hand over ────────────────────────────────────────────── */

  const finish = useCallback(async () => {
    if (stopping.current) return;
    stopping.current = true;
    // The length as it stands at Stop: the recorder's clock keeps counting
    // after it, and this is what the next screen prices the video by.
    setElapsed(recorder.current?.seconds || 0);
    setSaved(false);
    choice.current = new Promise((resolve) => {
      answer.current = resolve;
    });
    setPhase("sending");

    try {
      const blob = await recorder.current.stop();
      const report = tracker.current?.report() || { track: [], motion: [], tracker: "", samples: 0 };
      tracker.current?.stop();
      const c = capture.current;
      c?.stop();

      if (!blob || blob.size < 1024) {
        onFail("That recording came out empty. Nothing was saved.");
        return;
      }

      let demo;
      try {
        demo = await demoReq.current;
      } catch {
        demo = (await createDemo("")).demo;
      }
      const mime = recorder.current.mimeType || blob.type || "video/webm";
      const clientKey = `${demo.id}:${blob.size}`;

      let session;
      try {
        session = await startUpload(demo.id, { filename: "screen-recording", mime, size: blob.size, clientKey });
      } catch {
        session = await resumeUpload(demo.id);
      }

      await sendRecording(blob, session.upload, {
        onProgress: setSent,
        onWaiting: setWaiting,
      });

      await completeUpload(demo.id, {
        surface: c?.surface || "unknown",
        label: c?.label || "",
        mic: !!c?.hasMic,
        system_audio: !!c?.hasSystemAudio,
        tracker: report.tracker,
        track: report.track,
        motion: report.motion,
        /**
         * Which pointer this machine draws, measured during the recording from
         * the original frames. The server decides the same thing from the
         * encoded video when this is absent, and gets it wrong often enough to
         * lose the cursor for a whole demo. See profileOf() in capture.js.
         */
        cursor: report.cursor,
        // How often frames really arrived while recording (capture.js
        // cadenceOf) — measured all along and, until now, never sent.
        frames: report.frames,
        // What the capture track delivered: the cursor mode it applied, its
        // frame rate, its pixel ratio. See startCapture() in capture.js.
        device: c?.device,
        // The display and the OS. The pointer's size in the recording follows
        // from the screen's width in CSS pixels, and the server has no other
        // way to learn it. See environment() in capture.js.
        env: environment(),
      });

      // The upload is done; the editor opens once the creator has answered.
      setSaved(true);
      const pick = await choice.current;
      let demoAsked = false;
      if (pick?.mode === "demo") {
        try {
          await requestAutoDemo(demo.id, { brief: pick.brief, voice: pick.voice });
          demoAsked = true;
        } catch (err) {
          console.error("[studio] the product demo request failed", err);
        }
      }

      setPhase("thinking");
      // By slug, the id the editor's address uses (StudioPage.js). With a
      // product demo asked for, the editor starts the automatic edit itself
      // once the recording is prepared (StudioEditor.js) and the demo is built
      // after it. "Zoom on clicks" asks the editor for the same automatic edit
      // without the demo; if the demo request failed, that is what it gets.
      onOpen(demo.slug || demo.id, {
        autoAnalyse: pick?.mode === "zoom" || (pick?.mode === "demo" && !demoAsked),
        captions: pick?.mode === "zoom" && !!pick.captions,
      });
    } catch (err) {
      console.error("[studio] finish failed", err);
      onFail(err?.message?.includes("abort") ? "The upload was stopped." : "We couldn't save that recording. Please try again.");
    }
  }, [onOpen, onFail]);
  finishRef.current = finish;

  /**
   * Anything still open when this screen goes away is released. A screen share
   * left running after the tab moved on is the worst bug this feature can have.
   *
   * Released a tick later, and only if the page did not come straight back:
   * StrictMode unmounts and remounts once in development, and stopping the
   * capture then would end every recording the instant it began.
   */
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    const running = capture.current;
    return () => {
      alive.current = false;
      setTimeout(() => {
        if (alive.current) return;
        tracker.current?.stop();
        running?.stop();
      }, 0);
    };
  }, []);

  /* ── Screens ──────────────────────────────────────────────────────────── */

  if (phase === "recording") {
    return (
      <>
        <RecordingStage elapsed={elapsed} limit={limit} label={capture.current?.label} notice={notice} />
        <FloatingControls
          elapsed={elapsed}
          limit={limit}
          paused={paused}
          muted={muted}
          level={level}
          hasMic={!!capture.current?.hasMic}
          onPause={togglePause}
          onMute={toggleMute}
          onStop={finish}
        />
      </>
    );
  }

  if (phase === "sending") {
    return (
      <EditChoice
        note={
          hitLimit
            ? freeVideo
              ? `Your free video can be up to ${Math.round(limit)} seconds, so it stopped there.`
              : `Recordings can be up to ${clock(limit)}, so this one stopped there.`
            : ""
        }
        sent={sent}
        waiting={waiting}
        saved={saved}
        seconds={elapsed}
        freeVideo={freeVideo}
        hasMic={!!capture.current?.hasMic}
        onChoose={(c) => answer.current?.(c)}
      />
    );
  }

  return <SendingStage sent={1} waiting={false} done />;
}

/* ────────────────────────────────────────────────────────────────────────────
   While recording
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * What this tab shows while the creator is somewhere else entirely.
 *
 * Deliberately almost empty. Nobody is looking at it — they are in the app they
 * are demonstrating — and the one job it has is to be unmistakable if they do
 * glance back at it.
 */
function RecordingStage({ elapsed, limit, label, notice }) {
  const left = Math.max(0, limit - elapsed);
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "58vh", textAlign: "center", padding: 20 }}>
      <div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 11, marginBottom: 20 }}>
          <span className="st-dot" />
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--bad)" }}>
            Recording
          </span>
        </div>
        <div style={{ fontSize: 58, fontWeight: 300, letterSpacing: "-0.04em", color: "var(--ink)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
          {clock(elapsed)}
        </div>
        <div
          style={{ marginTop: 10, fontSize: 13, fontWeight: left <= LAST_WARN ? 650 : 500, color: left <= LAST_WARN ? "var(--bad)" : "var(--ink-mute)", fontVariantNumeric: "tabular-nums" }}
        >
          {left <= LAST_WARN ? `Stops by itself in ${clock(left)}` : `of ${clock(limit)}`}
        </div>
        {label && (
          <div style={{ marginTop: 14, fontSize: 13, color: "var(--ink-mute)", maxWidth: 380, marginInline: "auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {label}
          </div>
        )}
        {notice && (
          <div style={{ marginTop: 20, maxWidth: 380, marginInline: "auto", fontSize: 12.5, lineHeight: 1.6, color: "var(--ink-mute)" }}>
            {notice}
          </div>
        )}
        <p style={{ marginTop: 28, fontSize: 12.5, color: "var(--ink-mute)" }}>
          Go to the app you're demonstrating. The controls stay on top.
        </p>
      </div>
    </div>
  );
}

/**
 * The control pill, in an always-on-top window where the browser has one.
 *
 * ── DOCUMENT PICTURE-IN-PICTURE ──────────────────────────────────────────────
 * `documentPictureInPicture.requestWindow()` gives a page a small window that
 * floats above every other application, including ones this browser knows
 * nothing about. It is the single API that makes a browser-native screen
 * recorder feel like a desktop one, and without it the stop button would be
 * behind whatever the creator is demonstrating.
 *
 * The window gets a copy of this document's stylesheets, because it is a
 * separate document and inherits nothing. Where the API is missing — Firefox,
 * Safari, older Chrome — the same markup renders as a fixed overlay in the tab
 * and the creator uses the browser's own sharing bar to stop.
 */
function FloatingControls(props) {
  const [pipBody, setPipBody] = useState(null);
  const pipRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const api = window.documentPictureInPicture;
    if (!api?.requestWindow) return undefined;

    api
      .requestWindow({ width: 310, height: 74, disallowReturnToOpener: true })
      .then((win) => {
        if (cancelled) {
          win.close();
          return;
        }
        pipRef.current = win;
        // A picture-in-picture window is a fresh document: no stylesheet, no
        // custom properties, none of the dark palette. Both kinds of sheet are
        // copied because CRA serves a <link> in production and inline <style>
        // in development, and an overlay that is unstyled in one of the two is
        // a bug nobody sees until they deploy.
        for (const sheet of Array.from(document.styleSheets)) {
          try {
            const css = Array.from(sheet.cssRules).map((r) => r.cssText).join("");
            const style = win.document.createElement("style");
            style.textContent = css;
            win.document.head.appendChild(style);
          } catch {
            if (sheet.href) {
              const link = win.document.createElement("link");
              link.rel = "stylesheet";
              link.href = sheet.href;
              win.document.head.appendChild(link);
            }
          }
        }
        win.document.body.style.margin = "0";
        win.document.body.style.background = "#0C0D14";
        win.document.body.className = "hg-dark";
        win.addEventListener("pagehide", () => setPipBody(null));
        setPipBody(win.document.body);
      })
      .catch(() => {
        // Refused, or already open elsewhere. The in-tab overlay below is the
        // answer, not an error: it is a control that is harder to reach, not a
        // recording that failed.
      });

    return () => {
      cancelled = true;
      try { pipRef.current?.close(); } catch { /* already gone */ }
      pipRef.current = null;
    };
  }, []);

  const pill = <ControlPill {...props} floating={!pipBody} />;
  return pipBody ? createPortal(pill, pipBody) : pill;
}

function ControlPill({ elapsed, limit, paused, muted, level, hasMic, onPause, onMute, onStop, floating }) {
  const bars = [0, 1, 2, 3];
  // The last seconds before the limit: counted down, in red.
  const left = Math.max(0, limit - elapsed);
  const ending = left <= LAST_WARN;
  return (
    <div
      className="st-overlay"
      style={floating ? undefined : { position: "static", transform: "none", margin: "0 auto", width: "fit-content", animation: "none" }}
    >
      <span className="st-dot" style={{ margin: "0 7px 0 5px", opacity: paused ? 0.3 : 1 }} />
      <span
        title={`Recordings stop by themselves at ${clock(limit)}`}
        style={{ minWidth: 46, fontSize: 14, fontWeight: 650, color: ending ? "#FF6B6B" : "var(--ink)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}
      >
        {ending ? `${clock(left)} left` : clock(elapsed)}
      </span>

      <span className="st-overlay-rule" />

      <button type="button" className="st-overlay-btn" onClick={onPause} title={paused ? "Resume" : "Pause"} aria-label={paused ? "Resume" : "Pause"}>
        <Icon name={paused ? "play" : "pause"} size={16} />
      </button>

      {hasMic && (
        <button
          type="button"
          className="st-overlay-btn"
          onClick={onMute}
          title={muted ? "Unmute microphone" : "Mute microphone"}
          aria-label={muted ? "Unmute microphone" : "Mute microphone"}
          style={{ color: muted ? "var(--bad)" : undefined }}
        >
          <Icon name={muted ? "micOff" : "mic"} size={16} />
        </button>
      )}

      {hasMic && !muted && (
        <span className="st-level" aria-hidden>
          {bars.map((i) => {
            const on = level > (i + 1) / 6;
            return <i key={i} style={{ height: on ? 5 + i * 3.5 : 3, opacity: on ? 1 : 0.28 }} />;
          })}
        </span>
      )}

      <span className="st-overlay-rule" />

      <button type="button" className="st-overlay-btn is-stop" onClick={onStop} title="Stop and save" aria-label="Stop and save">
        <Icon name="stop" size={14} />
      </button>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Sending
   ──────────────────────────────────────────────────────────────────────────── */

function SendingStage({ sent, waiting, done, compact = false }) {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: compact ? 0 : "56vh", padding: compact ? "34px 20px 18px" : 20 }}>
      <div style={{ width: "100%", maxWidth: 380, textAlign: "center" }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 19, fontWeight: 680, letterSpacing: "-0.025em", color: "var(--ink)" }}>
          {done ? "Saved" : "Saving your recording"}
        </h2>
        <p style={{ margin: "0 0 22px", fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-mute)" }}>
          {waiting
            ? "Waiting for the network. This will carry on by itself — keep this tab open."
            : done
              ? "Opening the editor…"
              : "Keep this tab open until it finishes."}
        </p>
        <div className="st-bar">
          <i style={{ width: `${Math.round((done ? 1 : sent) * 100)}%` }} />
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--ink-mute)", fontVariantNumeric: "tabular-nums" }}>
          {Math.round((done ? 1 : sent) * 100)}%
        </div>
      </div>
    </div>
  );
}


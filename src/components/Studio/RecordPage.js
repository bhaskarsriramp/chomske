/**
 * RecordPage.js: from "Record" to an edited demo, without a decision in between.
 *
 * Four states, in order, and the creator only acts in the first and the last:
 *
 *   setup      what to record with. Microphone, system sound, captions.
 *   recording  the browser's picker has been answered and it is running.
 *   sending    the capture is going to storage.
 *   thinking   the analysis is running, and saying what it is doing.
 *
 * ── THE PICKER IS THE PRODUCT ────────────────────────────────────────────────
 * One click opens the operating system's own share dialog, exactly as Google
 * Meet does, and recording starts the moment it is answered. No extension, no
 * download, no second permission. Everything else on the setup screen is a
 * toggle with a sensible default, so a creator who reads none of it still gets
 * a good recording.
 *
 * ── THE CONTROLS FLOAT ABOVE EVERYTHING ──────────────────────────────────────
 * A demo is recorded in a DIFFERENT window from this one, so an overlay drawn
 * in this tab would be behind the thing being demonstrated and useless. Document
 * Picture-in-Picture gives a browser tab a small always-on-top window, which is
 * the only way to put a stop button over another application without shipping a
 * desktop app. Where that API is missing the overlay stays in the tab, and the
 * creator uses the browser's own "Stop sharing" bar instead.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { captureSupport, startCapture, createRecorder, createTracker, sendRecording, levelOf } from "./capture";
import { createDemo, startUpload, resumeUpload, completeUpload, startAnalysis } from "./studioApi";
import { Btn, Icon, Toggle, Panel } from "./ui";
import { fmtBytes } from "./model";
import "./studio.css";

const clock = (s) => {
  const t = Math.max(0, Math.floor(s));
  const m = Math.floor(t / 60);
  return `${m}:${String(t % 60).padStart(2, "0")}`;
};

export default function RecordPage({ config, onOpen, onCancel }) {
  const support = useMemo(() => captureSupport(), []);
  const [phase, setPhase] = useState("setup");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [wantMic, setWantMic] = useState(true);
  const [wantSystem, setWantSystem] = useState(true);
  const [wantCaptions, setWantCaptions] = useState(false);
  const [autoAnalyse, setAutoAnalyse] = useState(true);

  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0);
  const [samples, setSamples] = useState(0);
  const [sent, setSent] = useState(0);
  const [waiting, setWaiting] = useState(false);

  const capture = useRef(null);
  const recorder = useRef(null);
  const tracker = useRef(null);
  const demoRef = useRef(null);
  const stopping = useRef(false);

  /* ── Start ────────────────────────────────────────────────────────────── */

  const begin = useCallback(async () => {
    setError("");
    setNotice("");
    let cap = null;
    try {
      // The picker FIRST, before any await that is not itself the picker: it
      // only opens from a live user gesture, and spending the gesture on a
      // network round trip makes the browser refuse with an error that reads
      // exactly like the creator having clicked Cancel.
      cap = await startCapture({ mic: wantMic, systemAudio: wantSystem });
    } catch (err) {
      const denied = err?.name === "NotAllowedError";
      setError(denied ? "" : "We couldn't start the recording. Please try again.");
      if (denied) setNotice("No screen was shared, so nothing was recorded.");
      return;
    }

    try {
      const demo = await createDemo("");
      demoRef.current = demo.demo;

      capture.current = cap;
      recorder.current = createRecorder(cap.stream, {
        onError: () => setError("The recording stopped unexpectedly. What was captured up to that point is kept."),
      });
      tracker.current = createTracker();

      // Stopping the share from the browser's own bar has to end the recording
      // too, or the creator is left with a tab that thinks it is still going.
      cap.videoTrack?.addEventListener("ended", () => finish(), { once: true });

      recorder.current.start();
      await tracker.current.start(cap.stream);

      if (!cap.hasMic && wantMic) setNotice("The microphone wasn't available, so this recording has no voice.");
      else if (!cap.hasSystemAudio && wantSystem) setNotice("This share has no system sound. Choose a tab and tick “Share tab audio” if you need it.");

      setPhase("recording");
    } catch (err) {
      cap?.stop();
      console.error("[studio] start failed", err);
      setError("We couldn't start the recording. Please try again.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantMic, wantSystem]);

  /* ── While it runs ────────────────────────────────────────────────────── */

  useEffect(() => {
    if (phase !== "recording") return undefined;
    const buf = new Uint8Array(512);
    const id = setInterval(() => {
      setElapsed(recorder.current?.seconds || 0);
      setSamples(tracker.current?.samples || 0);
      setLevel(levelOf(capture.current?.analyser, buf));
    }, 200);
    return () => clearInterval(id);
  }, [phase]);

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

  /* ── Stop, send, analyse ──────────────────────────────────────────────── */

  const finish = useCallback(async () => {
    if (stopping.current) return;
    stopping.current = true;
    setPhase("sending");

    try {
      const blob = await recorder.current.stop();
      const report = tracker.current?.report() || { track: [], motion: [], tracker: "", samples: 0 };
      tracker.current?.stop();
      const cap = capture.current;
      cap?.stop();

      if (!blob || blob.size < 1024) {
        setError("That recording came out empty. Nothing was saved.");
        setPhase("setup");
        stopping.current = false;
        return;
      }

      const demo = demoRef.current;
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
        surface: cap?.surface || "unknown",
        label: cap?.label || "",
        mic: !!cap?.hasMic,
        system_audio: !!cap?.hasSystemAudio,
        tracker: report.tracker,
        track: report.track,
        motion: report.motion,
      });

      setPhase("thinking");
      onOpen(demo.id, { autoAnalyse, captions: wantCaptions });
    } catch (err) {
      console.error("[studio] finish failed", err);
      setError(err?.message?.includes("abort") ? "The upload was stopped." : "We couldn't save that recording. Please try again.");
      setPhase("setup");
      stopping.current = false;
    }
  }, [autoAnalyse, wantCaptions, onOpen]);

  // Anything still open when this screen goes away is released. A screen share
  // left running after the tab moved on is the worst bug this feature can have.
  useEffect(
    () => () => {
      tracker.current?.stop();
      capture.current?.stop();
    },
    []
  );

  /* ── Screens ──────────────────────────────────────────────────────────── */

  if (phase === "recording") {
    return (
      <>
        <RecordingStage elapsed={elapsed} samples={samples} label={capture.current?.label} notice={notice} />
        <FloatingControls
          elapsed={elapsed}
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

  if (phase === "sending" || phase === "thinking") {
    return <SendingStage sent={sent} waiting={waiting} done={phase === "thinking"} />;
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "10px 0 40px" }}>
      <header style={{ marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 25, fontWeight: 720, letterSpacing: "-0.035em", color: "var(--d-ink)" }}>
          New recording
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.6, color: "var(--d-mute)" }}>
          Choose a screen, window or tab when your browser asks. Recording starts straight away — everything else is
          decided afterwards.
        </p>
      </header>

      {!support.ok && (
        <div style={{ marginBottom: 18, padding: "13px 15px", borderRadius: 12, border: "1px solid rgba(255,148,130,.3)", background: "rgba(255,90,90,.07)", color: "var(--d-red)", fontSize: 13, lineHeight: 1.55 }}>
          {support.why}
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 18, padding: "13px 15px", borderRadius: 12, border: "1px solid rgba(255,148,130,.3)", background: "rgba(255,90,90,.07)", color: "var(--d-red)", fontSize: 13, lineHeight: 1.55 }}>
          {error}
        </div>
      )}
      {notice && !error && (
        <div style={{ marginBottom: 18, padding: "13px 15px", borderRadius: 12, border: "1px solid var(--d-line)", background: "var(--d-panel)", color: "var(--d-body)", fontSize: 13, lineHeight: 1.55 }}>
          {notice}
        </div>
      )}

      <Panel title="Sound">
        <Toggle
          label="Record my microphone"
          hint="Your narration. You can still add captions or a voiceover script afterwards."
          checked={wantMic}
          onChange={setWantMic}
        />
        <Toggle
          label="Record the screen's sound"
          hint="Tab or system audio, where your browser offers it. On macOS this only works when you share a tab."
          checked={wantSystem}
          onChange={setWantSystem}
        />
      </Panel>

      <div style={{ height: 14 }} />

      <Panel title="After recording">
        <Toggle
          label="Edit it automatically"
          hint="Find the steps, cut the waiting, plan the zooms, and blur anything private. This is what the studio is for."
          checked={autoAnalyse}
          onChange={setAutoAnalyse}
        />
        <Toggle
          label="Write captions from my voice"
          hint={
            wantMic
              ? "Off by default. A silent screen recording gets captions of room tone, which is worse than none — you can turn this on later in the editor at any time."
              : "Needs the microphone on."
          }
          checked={wantCaptions && wantMic}
          onChange={setWantCaptions}
          disabled={!wantMic}
        />
      </Panel>

      <div style={{ marginTop: 22, display: "flex", gap: 10, alignItems: "center" }}>
        <Btn kind="record" size="l" icon={<Icon name="record" size={14} />} onClick={begin} disabled={!support.ok}>
          Start recording
        </Btn>
        {onCancel && (
          <Btn kind="quiet" size="l" onClick={onCancel}>
            Cancel
          </Btn>
        )}
      </div>

      {!support.tracking && support.ok && (
        <p style={{ marginTop: 18, fontSize: 12, lineHeight: 1.6, color: "var(--d-mute)" }}>
          This browser can't recover the pointer from the recording, so cursor effects and click zooms won't be
          available. Everything else will work. Chrome or Edge on a desktop can do it.
        </p>
      )}

      <p style={{ marginTop: 18, fontSize: 12, lineHeight: 1.6, color: "var(--d-mute)" }}>
        Recordings are kept for {config?.limits?.retention_days || 7} days, and can be up to{" "}
        {Math.round((config?.limits?.max_recording_seconds || 1800) / 60)} minutes.
      </p>
    </div>
  );
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
function RecordingStage({ elapsed, samples, label, notice }) {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "58vh", textAlign: "center", padding: 20 }}>
      <div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 11, marginBottom: 20 }}>
          <span className="st-dot" />
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--d-red)" }}>
            Recording
          </span>
        </div>
        <div style={{ fontSize: 58, fontWeight: 300, letterSpacing: "-0.04em", color: "var(--d-ink)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
          {clock(elapsed)}
        </div>
        {label && (
          <div style={{ marginTop: 14, fontSize: 13, color: "var(--d-mute)", maxWidth: 380, marginInline: "auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {label}
          </div>
        )}
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--d-mute)" }}>
          {samples > 0 ? `Following the pointer — ${samples.toLocaleString()} points` : "Watching the screen"}
        </div>
        {notice && (
          <div style={{ marginTop: 20, maxWidth: 380, marginInline: "auto", fontSize: 12.5, lineHeight: 1.6, color: "var(--d-mute)" }}>
            {notice}
          </div>
        )}
        <p style={{ marginTop: 28, fontSize: 12.5, color: "var(--d-mute)" }}>
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

function ControlPill({ elapsed, paused, muted, level, hasMic, onPause, onMute, onStop, floating }) {
  const bars = [0, 1, 2, 3];
  return (
    <div
      className="st-overlay"
      style={floating ? undefined : { position: "static", transform: "none", margin: "0 auto", width: "fit-content", animation: "none" }}
    >
      <span className="st-dot" style={{ margin: "0 7px 0 5px", opacity: paused ? 0.3 : 1 }} />
      <span style={{ minWidth: 46, fontSize: 14, fontWeight: 650, color: "var(--d-ink)", fontVariantNumeric: "tabular-nums" }}>
        {clock(elapsed)}
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
          style={{ color: muted ? "var(--d-red)" : undefined }}
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

function SendingStage({ sent, waiting, done }) {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "56vh", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380, textAlign: "center" }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 19, fontWeight: 680, letterSpacing: "-0.025em", color: "var(--d-ink)" }}>
          {done ? "Saved" : "Saving your recording"}
        </h2>
        <p style={{ margin: "0 0 22px", fontSize: 13.5, lineHeight: 1.6, color: "var(--d-mute)" }}>
          {waiting
            ? "Waiting for the network. This will carry on by itself — keep this tab open."
            : done
              ? "Opening the editor…"
              : "Keep this tab open until it finishes."}
        </p>
        <div className="st-bar">
          <i style={{ width: `${Math.round((done ? 1 : sent) * 100)}%` }} />
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--d-mute)", fontVariantNumeric: "tabular-nums" }}>
          {Math.round((done ? 1 : sent) * 100)}%
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Analysing
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * What the analysis is doing, told honestly.
 *
 * The stages come from the server's own progress messages
 * (backend/services/studio/analyse.js), not from a script here, so a run that
 * spends ninety seconds reading frames says it is reading frames for ninety
 * seconds. A single indeterminate bar over three minutes of work reads as a
 * hang, and the first thing anybody does about a hang is reload.
 */
export function Thinking({ stage, progress, error, onRetry }) {
  const steps = [
    "Sampling the recording",
    "Understanding the interface",
    "Working out the steps",
    "Planning the camera",
    "Writing the annotations",
    "Checking for anything private",
    "Building the edit",
  ];
  const at = Math.max(
    0,
    steps.findIndex((s) => stage && stage.toLowerCase().startsWith(s.slice(0, 12).toLowerCase()))
  );

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "56vh", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <h2 style={{ margin: "0 0 6px", fontSize: 19, fontWeight: 680, letterSpacing: "-0.025em", color: "var(--d-ink)" }}>
          Editing your demo
        </h2>
        <p style={{ margin: "0 0 20px", fontSize: 13.5, lineHeight: 1.6, color: "var(--d-mute)" }}>
          {error || "This takes a minute or two. You can leave this page — it carries on without you."}
        </p>

        {!error && (
          <>
            <div className="st-bar" style={{ marginBottom: 18 }}>
              <i style={{ width: `${Math.round(Math.max(0.02, progress || 0) * 100)}%` }} />
            </div>
            <div>
              {steps.map((s, i) => (
                <div key={s} className={`st-step ${i < at ? "is-done" : i === at ? "is-now" : ""}`}>
                  <span className="st-step-dot">{i < at ? <Icon name="check" size={11} /> : null}</span>
                  <span className="st-step-label">{s}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {error && onRetry && (
          <Btn kind="primary" onClick={onRetry} style={{ marginTop: 6 }}>
            Try again
          </Btn>
        )}
      </div>
    </div>
  );
}

export { startAnalysis, fmtBytes };

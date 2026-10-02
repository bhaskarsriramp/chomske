/**
 * RecordStart.js: "New recording", from the click to a running recording.
 *
 * One click, the browser's tab picker, and it is recording. There is no setup
 * page any more. The two things worth deciding before a recording — the
 * microphone, and the shared tab's own sound — are two switches beside the
 * button, remembered in this browser. Everything about the EDIT is decided
 * after the recording (EditChoice.js), when the creator knows what they made.
 *
 * ── THE MICROPHONE IS ASKED FOR FIRST, HERE ─────────────────────────────────
 * (capture.js requestMic says what went wrong when it was asked after.) When
 * the browser already knows the answer — allowed or blocked — there is nothing
 * to ask and the click goes straight to the picker. When it does not, the
 * click asks for the microphone in this tab, where the creator is looking,
 * with a card saying where the prompt is. Then the picker opens: at once if
 * the click still counts (Chrome honours a click for about five seconds), or
 * from one more press on the card if not, because a browser only opens the
 * picker from a click.
 *
 * A refused microphone turns the Mic switch off, so what the switch says is
 * what the recording will have.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { captureSupport, micPermission, requestMic, startCapture } from "./capture";
import { Btn, Icon } from "./ui";

const PREF_MIC = "clipo:record:mic";
const PREF_TAB = "clipo:record:tab-sound";

const BLOCKED_HELP =
  "Your browser is blocking the microphone for this site. Click the icon at the left of the address bar, allow Microphone, then reload this page.";

function readPref(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

/** A switch remembered in this browser. Storage that throws just forgets. */
function usePref(key, fallback) {
  const [value, setValue] = useState(() => readPref(key, fallback));
  const set = useCallback(
    (next) => {
      setValue(next);
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        /* a convenience only */
      }
    },
    [key]
  );
  return [value, set];
}

const release = (stream) => {
  for (const t of stream?.getTracks?.() || []) t.stop();
};

/**
 * Everything "New recording" needs: the two switches, the microphone's
 * permission, and start(). `onCaptured(capture, { mic, tabSound })` is called
 * with the running capture the moment a tab is shared.
 */
export function useRecordStart({ onCaptured }) {
  const support = useMemo(() => captureSupport(), []);
  const [wantMic, setWantMic] = usePref(PREF_MIC, true);
  const [wantTab, setWantTab] = usePref(PREF_TAB, false);
  // "granted", "denied", "prompt" or "unknown" (capture.js micPermission).
  const [micState, setMicState] = useState("unknown");
  // What the card shows: null, "mic" (the browser is asking) or "pick" (the
  // microphone is answered; one more press opens the picker).
  const [step, setStep] = useState(null);
  // Whether the recording about to be picked has the microphone.
  const [micReady, setMicReady] = useState(false);
  const [notice, setNotice] = useState("");

  // A microphone opened before the picker, handed to it.
  const held = useRef(null);
  // Which microphone request is current. One the creator walked away from is
  // released when it lands, rather than left open.
  const asking = useRef(0);
  const busy = useRef(false);
  const capturedRef = useRef(onCaptured);
  capturedRef.current = onCaptured;

  useEffect(() => {
    let live = true;
    let status = null;
    const onChange = () => status && setMicState(status.state);
    micPermission().then((p) => {
      if (!live) return;
      setMicState(p.state);
      status = p.status;
      status?.addEventListener?.("change", onChange);
    });
    return () => {
      live = false;
      status?.removeEventListener?.("change", onChange);
    };
  }, []);

  // Leaving with a microphone held for a picker that never opened releases it.
  useEffect(
    () => () => {
      release(held.current);
      held.current = null;
    },
    []
  );

  /** Open the picker. Only ever from a click, or straight after one. */
  const pick = useCallback(
    async (mic) => {
      const micStream = held.current;
      held.current = null;
      setStep(null);
      let cap;
      try {
        cap = await startCapture({ mic, micStream, systemAudio: wantTab });
      } catch (err) {
        if (err?.name === "InvalidStateError") {
          // The click had gone stale after all. Keep the microphone and ask
          // for one more press.
          held.current = micStream;
          setMicReady(!!micStream);
          setStep("pick");
          return;
        }
        release(micStream);
        busy.current = false;
        // Cancel in the picker is an answer, not an error.
        if (err?.name !== "NotAllowedError" && err?.name !== "AbortError") {
          setNotice("The tab picker didn't open. Please try again.");
        }
        return;
      }
      busy.current = false;
      capturedRef.current?.(cap, { mic: cap.hasMic, tabSound: wantTab });
    },
    [wantTab]
  );

  const start = useCallback(async () => {
    if (busy.current || !support.ok) return;
    busy.current = true;
    setNotice("");

    const ask = wantMic && micState !== "granted" && micState !== "denied";
    if (!ask) {
      pick(wantMic && micState !== "denied");
      return;
    }

    const id = ++asking.current;
    setStep("mic");
    const got = await requestMic();
    if (id !== asking.current) {
      release(got.stream);
      return;
    }
    // The permission's own change event updates micState; a dismissed prompt
    // is a refusal for now but not a block, and only the browser knows which.
    micPermission().then((p) => setMicState(p.state));
    if (got.stream) {
      held.current = got.stream;
    } else {
      setWantMic(false);
      setNotice(
        got.missing
          ? "No microphone was found, so this recording has no voice."
          : "The microphone wasn't allowed, so Mic is now off and this recording has no voice. Turn it back on any time."
      );
    }
    const mic = !!got.stream;
    if (navigator.userActivation?.isActive) {
      pick(mic);
      return;
    }
    setMicReady(mic);
    setStep("pick");
  }, [support.ok, wantMic, micState, pick, setWantMic]);

  const choose = useCallback(() => pick(micReady), [pick, micReady]);

  // A click, so the picker can open from it straight away. The prompt still
  // on screen is abandoned; if it is answered later its stream is released.
  const skipMic = useCallback(() => {
    asking.current++;
    pick(false);
  }, [pick]);

  const cancel = useCallback(() => {
    asking.current++;
    release(held.current);
    held.current = null;
    busy.current = false;
    setStep(null);
  }, []);

  return {
    support, wantMic, setWantMic, wantTab, setWantTab, micState,
    step, micReady, notice, setNotice, start, choose, skipMic, cancel,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   The button and its two switches
   ──────────────────────────────────────────────────────────────────────────── */

export function RecordControls({ rec, label = "New recording" }) {
  const blocked = rec.micState === "denied";
  const micOn = rec.wantMic && !blocked;
  return (
    <div className="st-rec">
      <div className="st-rec-opts" role="group" aria-label="Recording options">
        <button
          type="button"
          className={`st-rec-opt${micOn ? " is-on" : ""}${blocked ? " is-blocked" : ""}`}
          aria-pressed={micOn}
          onClick={() => (blocked ? rec.setNotice(BLOCKED_HELP) : rec.setWantMic(!rec.wantMic))}
          title={blocked ? BLOCKED_HELP : micOn ? "Your microphone is recorded. Click to turn it off." : "Your microphone isn't recorded. Click to turn it on."}
        >
          <Icon name={micOn ? "mic" : "micOff"} size={15} />
          <span>{blocked ? "Mic blocked" : "Mic"}</span>
        </button>
        <button
          type="button"
          className={`st-rec-opt${rec.wantTab ? " is-on" : ""}`}
          aria-pressed={rec.wantTab}
          onClick={() => rec.setWantTab(!rec.wantTab)}
          title={rec.wantTab ? "The shared tab's own sound is offered in the picker. Click to turn it off." : "The shared tab's own sound isn't recorded. Click to offer it in the picker."}
        >
          <Icon name={rec.wantTab ? "sound" : "soundOff"} size={15} />
          <span>Tab sound</span>
        </button>
      </div>
      <Btn
        kind="record"
        size="l"
        icon={<Icon name="record" size={14} />}
        onClick={rec.start}
        disabled={!rec.support.ok}
        title={rec.support.why || "Choose a tab to record. Recording starts as soon as you share it."}
      >
        {label}
      </Btn>
    </div>
  );
}

/** What the last start had to say: a refused microphone, a picker that failed. */
export function RecordNotice({ rec }) {
  if (!rec.notice) return null;
  return (
    <div role="status" className="st-rec-note">
      <Icon name="alert" size={14} />
      <span style={{ flex: 1 }}>{rec.notice}</span>
      <button type="button" onClick={() => rec.setNotice("")} aria-label="Dismiss">
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   The card while the microphone is asked for
   ──────────────────────────────────────────────────────────────────────────── */

export function RecordStartCard({ rec }) {
  const { step, cancel } = rec;
  const go = useRef(null);

  useEffect(() => {
    if (!step) return undefined;
    if (step === "pick") go.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, cancel]);

  if (!step) return null;

  return createPortal(
    <div className="st-ask hg-fade">
      <div role="dialog" aria-modal="true" aria-labelledby="st-ask-title" className="st-ask-card hg-sheet-up">
        {step === "mic" ? (
          <>
            <div className="st-ask-where" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 17L7 7M7 15V7h8" />
              </svg>
              At the top left of this window
            </div>
            <span className="st-ask-icon">
              <Icon name="mic" size={22} />
            </span>
            <h2 id="st-ask-title">Allow your microphone</h2>
            <p>
              Your browser is asking now. Choose <b>Allow</b>, and the tab picker opens next. Recording starts the
              moment you share a tab.
            </p>
            <div className="st-ask-actions">
              <Btn onClick={rec.skipMic}>Record without the microphone</Btn>
              <Btn kind="quiet" onClick={cancel}>
                Cancel
              </Btn>
            </div>
          </>
        ) : (
          <>
            <span className={`st-ask-icon${rec.micReady ? " is-ok" : ""}`}>
              <Icon name={rec.micReady ? "check" : "micOff"} size={22} />
            </span>
            <h2 id="st-ask-title">{rec.micReady ? "Microphone ready" : "Recording without the microphone"}</h2>
            <p>Now choose the tab to record. Recording starts the moment you share it.</p>
            <div className="st-ask-actions">
              <Btn ref={go} kind="record" size="l" icon={<Icon name="tab" size={15} />} onClick={rec.choose}>
                Choose a tab
              </Btn>
              <Btn kind="quiet" onClick={cancel}>
                Cancel
              </Btn>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

const recordStart = { useRecordStart, RecordControls, RecordNotice, RecordStartCard };
export default recordStart;

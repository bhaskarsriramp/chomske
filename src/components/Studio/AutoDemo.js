/**
 * AutoDemo.js: the auto product demo's screens.
 *
 *   BriefForm        the description and the voice, also asked after recording
 *                    (EditChoice.js)
 *   AutoDemoDialog   in the editor: make one (or make it again) for this demo
 *   AutoDemoStrip    in the editor, under the header: what was made, and Undo
 *
 * While one is being built the editor is not shown at all (Working.js), so
 * nobody watches captions and a voice arrive half-made.
 *
 * Everything the auto demo shows lives here, so the record page and the editor
 * only place these. The work itself is on the server (backend
 * services/studio/autodemo/), and it never changes a click or a zoom.
 */
import { useEffect, useId, useRef, useState } from "react";
import { Btn, Icon, Segmented } from "./ui";
import { VOICES, DEFAULT_VOICE, voiceById } from "./voices.mjs";

const BRIEF_MIN = 8;
const BRIEF_MAX = 1500;
const EXAMPLE = "e.g. Show a new admin how to invite a teammate and give them the Editor role. Friendly, for first-time users.";

/* ── The description and the voice ─────────────────────────────────────────── */

export function BriefForm({ brief, setBrief, voice, setVoice, autoFocus = false }) {
  const id = useId();
  const ref = useRef(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  const v = voiceById(voice) || voiceById(DEFAULT_VOICE);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div>
        <label htmlFor={id} style={{ display: "block", marginBottom: 6, fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-mute)" }}>
          What should this demo show?
        </label>
        <textarea
          id={id}
          ref={ref}
          value={brief}
          maxLength={BRIEF_MAX}
          rows={4}
          placeholder={EXAMPLE}
          onChange={(e) => setBrief(e.target.value)}
          style={{
            width: "100%", fontFamily: "inherit", fontSize: 14, lineHeight: 1.55, padding: "10px 12px",
            borderRadius: 10, resize: "vertical", background: "var(--card)", border: "1px solid var(--line-strong)",
            color: "var(--ink)", outline: "none", boxSizing: "border-box",
          }}
          onFocus={(e) => { e.target.style.borderColor = "var(--ink)"; }}
          onBlur={(e) => { e.target.style.borderColor = "var(--line-strong)"; }}
        />
        <div style={{ marginTop: 6, fontSize: 12, color: "var(--ink-mute)", lineHeight: 1.5 }}>
          Who it's for and what they should learn. Clipo writes the script from this and what's on screen.
        </div>
      </div>
      <div>
        <div style={{ marginBottom: 6, fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-mute)" }}>
          Voice
        </div>
        <Segmented size="s" value={v.id} onChange={setVoice} label="Voice" options={VOICES.map((x) => ({ value: x.id, label: x.label, title: x.sub }))} />
        <div style={{ marginTop: 6, fontSize: 12, color: "var(--ink-mute)" }}>{v.sub}. You can switch it later in the Voice tab.</div>
      </div>
    </div>
  );
}

const ready = (brief) => brief.trim().length >= BRIEF_MIN;
/** Whether a description is long enough to build a demo from. */
export const briefReady = ready;

/* ── In the editor: make one ───────────────────────────────────────────────── */

export function AutoDemoDialog({ ad, hasCaptions, onClose, onStart }) {
  const [brief, setBrief] = useState(ad?.brief || "");
  const [voice, setVoice] = useState(ad?.voice || DEFAULT_VOICE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const key = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const go = async () => {
    setBusy(true);
    setError("");
    try {
      await onStart(brief.trim(), voice);
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || "That didn't start. Try again in a moment.");
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Product demo"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 80, display: "grid", placeItems: "center", padding: 20, background: "rgba(4,5,9,.55)", backdropFilter: "blur(4px)" }}
    >
      <div style={{ width: "min(540px, 100%)", maxHeight: "88vh", overflowY: "auto", borderRadius: 18, border: "1px solid var(--line)", background: "var(--paper)", boxShadow: "0 40px 100px -30px rgba(0,0,0,.6)" }}>
        <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px 12px", borderBottom: "1px solid var(--line)" }}>
          <Icon name="wand" size={16} />
          <h2 style={{ margin: 0, flex: 1, fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--ink)" }}>Product demo</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 30, height: 30, display: "grid", placeItems: "center", borderRadius: 8, border: "none", background: "transparent", color: "var(--ink-mute)", cursor: "pointer" }}>
            <Icon name="close" size={15} />
          </button>
        </header>
        <div style={{ padding: 20, display: "grid", gap: 16 }}>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-mute)" }}>
            Clipo watches this recording and writes a script for what you describe, adds it as captions and a voice, and eases in on what matters where you didn't click. Your click zooms, cuts and blurs stay as they are.
          </p>
          <BriefForm brief={brief} setBrief={setBrief} voice={voice} setVoice={setVoice} autoFocus />
          {hasCaptions && (
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-body)", background: "var(--made-tint)", borderRadius: 10, padding: "9px 12px" }}>
              This replaces the captions and voice this recording has now. You can undo it afterwards.
            </p>
          )}
          {error && <p style={{ margin: 0, fontSize: 13, color: "var(--bad)" }}>{error}</p>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <Btn kind="quiet" onClick={onClose}>Cancel</Btn>
            <Btn kind="primary" icon={<Icon name="wand" size={14} />} disabled={busy || !ready(brief)} onClick={go}>
              {busy ? "Starting…" : ad?.status === "done" ? "Generate again" : "Generate product demo"}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── In the editor: where it is ────────────────────────────────────────────── */

const dismissKey = (demoId, ad) => `clipo:autodemo:dismissed:${demoId}:${ad?.finished_at || ""}`;
function wasDismissed(demoId, ad) {
  try {
    return sessionStorage.getItem(dismissKey(demoId, ad)) === "1";
  } catch {
    return false;
  }
}
function rememberDismissed(demoId, ad) {
  try {
    sessionStorage.setItem(dismissKey(demoId, ad), "1");
  } catch {
    /* a convenience only */
  }
}

/** How long after it finished the "ready" strip is still offered. */
const RECENT_MS = 6 * 3600 * 1000;

export function AutoDemoStrip({ demoId, ad, onUndo, onRetry }) {
  const [hidden, setHidden] = useState(() => wasDismissed(demoId, ad));
  const [undoing, setUndoing] = useState(false);
  const [undoError, setUndoError] = useState("");
  const finishedAt = ad?.finished_at || "";
  useEffect(() => {
    setHidden(wasDismissed(demoId, ad));
    setUndoError("");
    // Only a new run (a new finish time or status) brings the strip back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoId, finishedAt, ad?.status]);

  if (!ad || ad.status === "undone") return null;
  const working = ad.status === "waiting" || ad.status === "running";
  const recent = finishedAt && Date.now() - new Date(finishedAt).getTime() < RECENT_MS;
  if (!working && (hidden || !recent)) return null;

  const dismiss = () => {
    rememberDismissed(demoId, ad);
    setHidden(true);
  };

  const undo = async () => {
    setUndoing(true);
    setUndoError("");
    try {
      await onUndo();
    } catch (err) {
      setUndoError(err?.response?.data?.message || "That didn't undo. Try again.");
    } finally {
      setUndoing(false);
    }
  };

  let body;
  if (working) {
    const stage = ad.status === "waiting" ? "Waiting for the automatic edit to finish" : ad.stage || "Working";
    body = (
      <>
        <span style={{ fontWeight: 650, color: "var(--ink)" }}>Building your product demo</span>
        <span style={{ color: "var(--ink-mute)" }}> · {stage}…</span>
        <div className="st-bar" style={{ marginTop: 7, maxWidth: 360 }}>
          <i style={{ width: `${Math.round(Math.max(0.04, ad.status === "waiting" ? 0.04 : ad.progress || 0) * 100)}%` }} />
        </div>
        <div style={{ marginTop: 5, fontSize: 11.5, color: "var(--ink-mute)" }}>Leave the captions alone until it's done; it replaces them.</div>
      </>
    );
  } else if (ad.status === "done") {
    body = (
      <>
        <span style={{ fontWeight: 650, color: "var(--ink)" }}>Your product demo is ready.</span>
        <span style={{ color: "var(--ink-body)" }}>
          {" "}{ad.cues} caption{ad.cues === 1 ? "" : "s"} from a {ad.lines}-line script
          {ad.voice_ok ? `, read by ${ad.voice}` : ""}
          {(ad.focus || []).length > 0
            ? `, and ${ad.focus.length} close-up${ad.focus.length === 1 ? "" : "s"} where you didn't click (${ad.focus.map((f) => f.label).join("; ")})`
            : ""}
          . Your click zooms are unchanged.
        </span>
        {ad.voice_error && <div style={{ marginTop: 4, color: "var(--bad)" }}>{ad.voice_error}</div>}
        {undoError && <div style={{ marginTop: 4, color: "var(--bad)" }}>{undoError}</div>}
      </>
    );
  } else {
    body = (
      <>
        <span style={{ fontWeight: 650, color: "var(--bad)" }}>The product demo wasn't made.</span>
        <span style={{ color: "var(--ink-body)" }}> {ad.error || "Try again in a moment."}</span>
      </>
    );
  }

  return (
    <div
      role="status"
      style={{
        flexShrink: 0, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        padding: "9px 14px", fontSize: 12.5, lineHeight: 1.5,
        borderBottom: "1px solid var(--line)", background: "var(--made-tint)",
      }}
    >
      <span style={{ color: "var(--made)", display: "grid", placeItems: "center" }}><Icon name="wand" size={15} /></span>
      <div style={{ flex: "1 1 260px", minWidth: 0 }}>{body}</div>
      {ad.status === "done" && ad.can_undo && (
        <Btn size="s" kind="quiet" icon={<Icon name="undo" size={13} />} disabled={undoing} onClick={undo}>
          {undoing ? "Undoing…" : "Undo demo"}
        </Btn>
      )}
      {!working && (
        <Btn size="s" kind="quiet" onClick={onRetry}>
          {ad.status === "failed" ? "Try again" : "Change description"}
        </Btn>
      )}
      {!working && (
        <button type="button" onClick={dismiss} aria-label="Dismiss" style={{ border: "none", background: "transparent", color: "var(--ink-mute)", cursor: "pointer", display: "grid", placeItems: "center" }}>
          <Icon name="close" size={13} />
        </button>
      )}
    </div>
  );
}

const autoDemo = { BriefForm, briefReady, AutoDemoDialog, AutoDemoStrip };
export default autoDemo;

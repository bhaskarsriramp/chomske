import { useState, useEffect, useRef } from "react";
import api, { errorMessage } from "../../api";

/**
 * Name a voice, the moment it is ready.
 *
 * ── WHY THIS ONE CANNOT BE DISMISSED ────────────────────────────────────────
 * Every other dialog in this app closes on Escape, on a backdrop click and on a
 * ×, because interrupting someone to demand an answer is usually rude. This one
 * is the exception, and the reason is what happens next: from here on the voice
 * appears in a dropdown at the moment credits are spent, and "Untitled voice"
 * next to "Untitled voice" is how a creator pays to have a story written in the
 * wrong one.
 *
 * The cost of the interruption is one short field, once per voice. The cost of
 * skipping it is a wrong charge they only discover after reading the script. So
 * there is no ×, Escape does nothing, and the backdrop is inert.
 *
 * It is also asked AFTER the analysis rather than before: until then there is
 * nothing to name, and the language we detected is the most useful hint we can
 * offer for what to call it.
 */
export default function NameVoiceDialog({ voice, onNamed }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Deliberately swallowed. Escape is muscle memory for "close this", and
  // without the handler the browser does nothing anyway — but stopping it here
  // documents that the omission is a decision, not something forgotten.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") e.stopPropagation(); };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const suggestions = buildSuggestions(voice);

  async function save(e) {
    e?.preventDefault();
    const clean = name.trim();
    if (!clean) return setError("Give this voice a name so you can tell it apart later.");
    if (busy) return;

    setBusy(true);
    setError("");
    try {
      const { data } = await api.patch(`/voices/${voice.id}`, { name: clean });
      onNamed?.(data.voices || null);
    } catch (err) {
      setError(errorMessage(err, "Couldn't save that name. Try again."));
      setBusy(false);
    }
  }

  return (
    <>
      {/* Inert: no onClick. See the note above. */}
      <div className="hg-fade" style={{ position: "fixed", inset: 0, background: "rgba(15,15,15,.55)", zIndex: 100 }} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Name this voice"
        className="hg-dialog-in"
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          zIndex: 101, width: "min(440px, calc(100vw - 32px))",
          background: "var(--card)", border: "1px solid var(--line)",
          borderRadius: "var(--radius)", padding: 24,
          boxShadow: "0 30px 70px -30px rgba(15,15,15,.55)",
        }}
      >
        <div
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase",
            color: "var(--made)", background: "var(--made-tint)",
            border: "1px solid var(--made-line)", borderRadius: 999,
            padding: "4px 10px", marginBottom: 12,
          }}
        >
          <span aria-hidden="true">✓</span> Voice ready
        </div>

        <h2 style={{ fontSize: 19, fontWeight: 750, letterSpacing: "-0.025em", color: "var(--ink)", margin: "0 0 8px" }}>
          What should we call this voice?
        </h2>

        <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--ink-body)", margin: "0 0 16px" }}>
          We learned how you talk from{" "}
          <strong style={{ color: "var(--ink)" }}>
            {voice.transcript_count || voice.videos?.ready || 1} video
            {(voice.transcript_count || voice.videos?.ready || 1) === 1 ? "" : "s"}
          </strong>
          {voice.language_label ? <> in <strong style={{ color: "var(--ink)" }}>{voice.language_label}</strong></> : null}.
          You'll pick this name when you write, so make it one you'll recognise.
        </p>

        <form onSubmit={save}>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => { setName(e.target.value); setError(""); }}
            maxLength={60}
            placeholder="Tech channel, client work, English shorts…"
            aria-label="Voice name"
            style={{
              width: "100%", boxSizing: "border-box", fontSize: 15, padding: "12px 14px",
              border: `1px solid ${error ? "var(--bad)" : "var(--line)"}`, borderRadius: 11,
              background: "var(--card)", color: "var(--ink)", outline: "none", fontFamily: "inherit",
            }}
          />

          {suggestions.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setName(s); setError(""); }}
                  className="hg-pill"
                  style={{
                    fontSize: 12.5, padding: "5px 11px", borderRadius: 999, cursor: "pointer",
                    border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink-body)",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {error && (
            <div role="alert" style={{ fontSize: 12.5, color: "var(--bad)", marginTop: 9, lineHeight: 1.5 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !name.trim()}
            className={busy || !name.trim() ? undefined : "hg-btn-primary"}
            style={{
              width: "100%", marginTop: 16, fontSize: 14.5, fontWeight: 650,
              padding: "12px 18px", borderRadius: 11, border: "none",
              background: busy || !name.trim() ? "#E5E5E5" : "var(--primary)",
              color: busy || !name.trim() ? "var(--ink-mute)" : "#fff",
              cursor: busy || !name.trim() ? "default" : "pointer",
            }}
          >
            {busy ? "Saving…" : "Save and start writing"}
          </button>
        </form>
      </div>
    </>
  );
}

/** Starting points, not decisions — every one is still editable. */
function buildSuggestions(voice) {
  const out = [];
  if (voice?.language_label) out.push(`${voice.language_label} channel`);
  out.push("My main channel", "Client work");
  return [...new Set(out)].slice(0, 3);
}

import { useState, useEffect, useRef } from "react";
import api, { errorMessage } from "../../api";
import { categoryColor } from "../../theme";

/**
 * Make another channel.
 *
 * ── WHY THE NAME IS REQUIRED HERE AND NOT DURING ONBOARDING ─────────────────
 * The very first profile is named for them ("My Profile") on the category
 * screen, because a brand new account has nothing to distinguish yet and being
 * stopped to name something you have not seen is a bad first minute.
 *
 * The second one is different. From here on the name is the ONLY thing telling
 * two profiles apart in the dropdown where credits get spent — "Untitled" beside
 * "Untitled" is how a creator pays for a story written for the wrong channel, in
 * the wrong voice, about a category that channel does not cover. So it is typed,
 * and the button stays dead until it is.
 *
 * Categories are asked for in the same breath because a profile without them has
 * no feed. Two questions, one screen, one decision: what is this channel.
 */
export default function NewProfileDialog({ onCreated, onCancel }) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState([]);
  const [cats, setCats] = useState([]);
  const [max, setMax] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    let cancelled = false;
    api.get("/auth/categories")
      .then(({ data }) => {
        if (cancelled) return;
        setCats(data.categories || []);
        setMax(data.max || 3);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // This one CAN be dismissed, unlike the onboarding gate: nothing has been
  // created yet, so backing out leaves the account exactly as it was.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !busy) onCancel?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, busy]);

  function toggle(id) {
    setError("");
    setPicked((p) => {
      if (p.includes(id)) return p.filter((x) => x !== id);
      if (p.length >= max) return p;
      return [...p, id];
    });
  }

  async function save(e) {
    e?.preventDefault();
    if (busy) return;
    const clean = name.trim();
    if (!clean) return setError("Give this profile a name.");
    if (!picked.length) return setError("Pick at least one category for this channel.");

    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/profiles", { name: clean, categories: picked });
      onCreated?.(data.profile);
    } catch (err) {
      setError(errorMessage(err, "Couldn't create that profile."));
      setBusy(false);
    }
  }

  const ready = !!name.trim() && picked.length > 0;

  return (
    <>
      <div
        onClick={busy ? undefined : onCancel}
        className="hg-fade"
        style={{ position: "fixed", inset: 0, background: "rgba(15,15,15,.5)", zIndex: 100 }}
      />

      <form
        onSubmit={save}
        role="dialog"
        aria-modal="true"
        aria-label="New profile"
        className="hg-dialog-in"
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          zIndex: 101, width: "min(520px, calc(100vw - 32px))",
          maxHeight: "min(86vh, 760px)", overflowY: "auto",
          background: "var(--card)", border: "1px solid var(--line)",
          borderRadius: "var(--radius)", padding: 24,
          boxShadow: "0 30px 70px -30px rgba(15,15,15,.55)",
        }}
      >
        <h2 style={{ fontSize: 19, fontWeight: 750, letterSpacing: "-0.025em", color: "var(--ink)", margin: "0 0 7px" }}>
          Add another channel
        </h2>
        <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--ink-body)", margin: "0 0 18px" }}>
          Each profile is one channel: its own topics, its own voice, its own
          scripts. Nothing is shared between them except your credits.
        </p>

        <Label>What's it called?</Label>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => { setName(e.target.value); setError(""); }}
          maxLength={60}
          placeholder="Tech channel, Sports shorts, client work…"
          aria-label="Profile name"
          style={{
            width: "100%", boxSizing: "border-box", fontSize: 15, padding: "12px 14px",
            border: "1px solid var(--line)", borderRadius: 11, marginBottom: 18,
            background: "var(--card)", color: "var(--ink)", outline: "none", fontFamily: "inherit",
          }}
        />

        <Label>What does it cover?</Label>
        <p style={{ fontSize: 12.5, color: "var(--ink-mute)", lineHeight: 1.55, margin: "0 0 10px" }}>
          Up to {max}. Only these stories reach this channel's feed.
        </p>

        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          {cats.map((c) => {
            const on = picked.includes(c.id);
            const blocked = !on && picked.length >= max;
            const col = categoryColor(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                aria-pressed={on}
                disabled={blocked}
                className={on || blocked ? undefined : "hg-pick"}
                style={{
                  textAlign: "left", padding: "10px 12px", borderRadius: 10,
                  cursor: blocked ? "not-allowed" : "pointer",
                  background: on ? col.tint : "var(--card)",
                  border: `1.5px solid ${on ? col.solid : "var(--line)"}`,
                  opacity: blocked ? 0.42 : 1,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                      background: on ? col.solid : "#CFCFCF",
                    }}
                  />
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{c.label}</span>
                </span>
              </button>
            );
          })}
        </div>

        {error && (
          <div role="alert" style={{ fontSize: 13, color: "var(--bad)", marginTop: 13, lineHeight: 1.5 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="hg-btn-ghost"
            style={{
              fontSize: 13.5, fontWeight: 600, padding: "11px 17px", borderRadius: 10,
              border: "1px solid var(--line)", background: "var(--card)",
              color: "var(--ink-body)", cursor: busy ? "default" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!ready || busy}
            className={!ready || busy ? undefined : "hg-btn-primary"}
            style={{
              fontSize: 13.5, fontWeight: 650, padding: "11px 20px", borderRadius: 10, border: "none",
              background: !ready || busy ? "#E5E5E5" : "var(--primary)",
              color: !ready || busy ? "var(--ink-mute)" : "#fff",
              cursor: !ready || busy ? "default" : "pointer",
            }}
          >
            {busy ? "Creating…" : "Create profile"}
          </button>
        </div>
      </form>
    </>
  );
}

function Label({ children }) {
  return (
    <div
      style={{
        fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
        textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Which of the two scripts you are reading.
 *
 * ── WHY A TOGGLE AND NOT TWO CARDS ───────────────────────────────────────────
 * The English twin used to be a second card stacked under the first, on the
 * reasoning that they paid for two scripts so both should be visible at once.
 * In practice they are the SAME script twice, several hundred words each, and
 * stacking them meant scrolling a full screen of Telugu to reach the English of
 * the thing you had just read, with the title ideas and the sources pushed a
 * page and a half down. Nobody reads both at once; they read one and copy it.
 *
 * So it is one card with two states, and the control sits next to Copy, because
 * the choice and the action are the same decision: this is the version I want.
 *
 * Rendered only when there IS a twin. A creator who did not buy the English
 * version should not be shown a switch that does nothing, and one who did
 * should find it exactly where the copy button is.
 */
export default function ScriptToggle({ value, onChange, nativeLabel }) {
  return (
    <div
      role="group"
      aria-label="Script language"
      style={{
        display: "inline-flex", padding: 2, borderRadius: 9, flexShrink: 0,
        background: "var(--paper)", border: "1px solid var(--line)",
      }}
    >
      <Option
        on={value === "native"}
        onClick={() => onChange("native")}
        // Truncated of its parenthetical: the label is "Telugu-English
        // (Tenglish)" and only the first half is doing any work in a pill this
        // size. Falls back to "Your voice" for a script written before the
        // language label existed.
        label={(nativeLabel || "").replace(/\s*\(.*?\)\s*/g, "").trim() || "Your voice"}
      />
      <Option on={value === "english"} onClick={() => onChange("english")} label="English" />
    </div>
  );
}

function Option({ on, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={{
        fontSize: 11.5, fontWeight: 600, fontFamily: "inherit",
        padding: "5px 11px", borderRadius: 7, border: "none", cursor: "pointer",
        whiteSpace: "nowrap",
        background: on ? "var(--card)" : "transparent",
        color: on ? "var(--ink)" : "var(--ink-mute)",
        boxShadow: on ? "0 1px 2px rgba(0,0,0,.07)" : "none",
      }}
    >
      {label}
    </button>
  );
}

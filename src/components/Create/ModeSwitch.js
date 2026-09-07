/**
 * ModeSwitch: where today's story comes from.
 *
 * ── WHY THIS IS ONE ROW AND NOT TWO ──────────────────────────────────────────
 * Discover already opens with a row of category pills (AI & technology, Stock
 * market & finance…). Putting a second tab strip of equal weight directly above
 * it would give the screen two rows of tabs, which is the exact confusion this
 * feature was supposed to avoid: nothing about two identical strips says which
 * one is the big choice and which is the filter inside it.
 *
 * So the mode switch is a segmented control, not tabs, and it sits in the page
 * header beside the title, where a scope control belongs. It changes the whole
 * screen. The category pills live INSIDE Discover, so they read as belonging to
 * it, because they do: Import and Idea have no categories.
 *
 * ── AND WHY IT IS THREE URLS ─────────────────────────────────────────────────
 * Each mode is a real address (/app/discover, /app/import, /app/idea), so back
 * and forward work, a refresh lands where you were, and a mode can be linked to.
 * The app already treats that as a rule rather than a nicety, see the routing
 * note in App.js.
 */
const MODES = [
  { id: "discover", label: "Discover", hint: "Ranked stories from your categories" },
  { id: "import",   label: "Import",   hint: "A video, links, or your own text" },
  { id: "idea",     label: "Idea",     hint: "Tell us what to make" },
];

export { MODES };

export default function ModeSwitch({ mode, onMode, compact }) {
  return (
    <div
      role="tablist"
      aria-label="What to write from"
      className="hg-strip"
      style={{
        display: "inline-flex", padding: 3, gap: 2, maxWidth: "100%",
        background: "#F2F2F2", border: "1px solid var(--line)", borderRadius: 11,
        // On a narrow phone three labels can outgrow the row. Scrolling beats
        // wrapping: a wrapped segmented control stops reading as one control.
        overflowX: "auto", flexShrink: 0,
      }}
    >
      {MODES.map((m) => {
        const on = m.id === mode;
        return (
          <button
            key={m.id}
            role="tab"
            aria-selected={on}
            // The hint is the accessible name's other half. Sighted users get it
            // from the panel heading a moment later; a screen reader user
            // choosing between three tabs gets it here, where the choice is.
            title={m.hint}
            onClick={() => onMode(m.id)}
            style={{
              fontSize: compact ? 13 : 13.5, fontWeight: on ? 650 : 500,
              padding: compact ? "7px 12px" : "8px 15px",
              borderRadius: 9, border: "none", cursor: "pointer", whiteSpace: "nowrap",
              background: on ? "var(--card)" : "transparent",
              color: on ? "var(--ink)" : "var(--ink-mute)",
              boxShadow: on ? "0 1px 2px rgba(15,15,15,.09)" : "none",
              transition: "background .12s ease, color .12s ease",
            }}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Field.js: the layout pieces Import and Idea share.
 *
 * ── WHY THESE TWO SCREENS ARE ONE COLUMN AND NOT A SPLIT ─────────────────────
 * Discover and My scripts use split panes because their job is comparison:
 * choosing between nine stories, or nine scripts, means holding two of them
 * side by side, and a list that replaces itself with a detail view forces that
 * through memory.
 *
 * Nothing here is a comparison. There is one thing being made, and the job is
 * linear: say what it is about, see what we found, choose a length, order. A
 * single measured column is the honest shape for that, and it has the pleasant
 * side effect that these screens need almost no responsive work: the same
 * layout that reads well at 1400px reads well on a phone, because it was never
 * two columns to begin with.
 */

/** Roughly 70 characters of body text. Wider than this and the eye loses the
 *  start of the next line; narrower and the paste box stops feeling usable. */
const MAX_W = 720;

export function Column({ children, compact }) {
  return (
    <div className="hg-scroll" style={{ flex: 1, minHeight: 0, width: "100%", background: "var(--paper)" }}>
      <div
        style={{
          maxWidth: MAX_W,
          margin: "0 auto",
          padding: compact ? "20px 16px 80px" : "28px 26px 90px",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * @param {boolean} hideTitle  On a phone the panel's title moves up into the
 *   bar beside the mode switch (see CreatePage), so repeating it here would
 *   print the same word twice, forty pixels apart. The blurb stays: it is the
 *   part that explains the screen, and the bar has no room for it.
 */
export function Heading({ title, blurb, compact, hideTitle = false }) {
  return (
    <div style={{ marginBottom: compact ? 20 : 26 }}>
      {!hideTitle && (
        <h1
          style={{
            fontSize: compact ? 20 : 23, fontWeight: 750, letterSpacing: "-0.03em",
            color: "var(--ink)", margin: "0 0 6px",
          }}
        >
          {title}
        </h1>
      )}
      <p style={{ fontSize: 13.5, color: "var(--ink-body)", margin: 0, lineHeight: 1.6 }}>
        {blurb}
      </p>
    </div>
  );
}

/**
 * One labelled input.
 *
 * The hint sits under the label rather than as placeholder text, because
 * placeholder text disappears exactly when it is needed: the moment somebody
 * starts typing and has to decide whether what they are typing is right.
 */
export default function Field({ label, hint, count, over, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          display: "flex", alignItems: "baseline", justifyContent: "space-between",
          gap: 10, marginBottom: 6,
        }}
      >
        <label
          style={{
            fontSize: 11, fontWeight: 600, letterSpacing: "0.1em",
            textTransform: "uppercase", color: "var(--ink-mute)",
          }}
        >
          {label}
        </label>
        {count && (
          <span
            style={{
              fontSize: 11.5, fontVariantNumeric: "tabular-nums",
              color: over ? "var(--bad)" : "var(--ink-mute)",
            }}
          >
            {count}
          </span>
        )}
      </div>
      {hint && (
        <p style={{ fontSize: 12.5, color: "var(--ink-mute)", margin: "0 0 8px", lineHeight: 1.55 }}>
          {hint}
        </p>
      )}
      {children}
    </div>
  );
}

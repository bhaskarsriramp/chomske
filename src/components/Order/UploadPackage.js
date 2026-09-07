import { useState } from "react";

/**
 * Everything that gets pasted into the YouTube upload form.
 *
 * ── WHY THIS IS ONE COMPONENT AND NOT TWO COPIES ─────────────────────────────
 * It was rendered inline on the Create screen and NOT AT ALL on My scripts,
 * which meant a creator who paid for the package could see it once, in the
 * minutes after it was written, and never again. A script they came back to the
 * next morning had lost the description and hashtags they had bought. Rendering
 * it from one component in both places is what stops that being possible.
 *
 * ── THE TITLES BELONG IN HERE ────────────────────────────────────────────────
 * They used to sit in their own block outside this card, because they came free
 * with the script whether or not the package was bought. They no longer do
 * (see writeScript's `titles` option, backend/services/scriptWriterService.js):
 * offering title ideas to somebody who deliberately did not buy the titles was
 * giving away the cheap half of a paid add-on, and it made the "Title,
 * description & hashtags" option look like it was only selling two of the
 * three things its own label named.
 *
 * ── EVERY PIECE IS COPYABLE ON ITS OWN ───────────────────────────────────────
 * The four things here go into four different boxes on the upload form, at
 * different moments. One "copy everything" button would just make somebody
 * paste a blob and then edit it apart, and a title with no copy button, which
 * is what the old list was, means selecting a line of Telugu by dragging on a
 * phone.
 */
export default function UploadPackage({ script, compact }) {
  const titles = script.title_suggestions || [];
  const hashtags = script.hashtags || [];
  const thumbs = script.thumbnail_lines || [];

  if (!hasPackage(script)) return null;

  return (
    <div
      style={{
        marginTop: 14, padding: compact ? 15 : 18,
        background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--radius)",
      }}
    >
      <div
        style={{
          fontSize: 11, fontWeight: 600, letterSpacing: "0.1em",
          textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 12,
        }}
      >
        Ready to upload
      </div>

      {/* No field-level copy on Title: pasting five options into the one title
          box is nonsense, so each row copies itself and nothing copies the
          list. */}
      {titles.length > 0 && (
        <Field label="Title" note={`${titles.length} options · tap one to copy`}>
          <div style={{ display: "grid", gap: 6 }}>
            {titles.map((t, i) => (
              <TapToCopy key={i} text={t} indic>
                <span style={{ fontSize: 14, lineHeight: 1.5, color: "var(--ink)" }}>{t}</span>
                <Counter n={t.length} limit={60} />
              </TapToCopy>
            ))}
          </div>
        </Field>
      )}

      {script.description && (
        <Field
          label="Description"
          copy={script.description}
          note={`${script.description.length} characters`}
        >
          <div
            className="indic"
            style={{
              fontSize: 13.5, lineHeight: 1.7, color: "var(--ink-body)",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}
          >
            {script.description}
          </div>
        </Field>
      )}

      {hashtags.length > 0 && (
        <Field
          label="Hashtags"
          copy={hashtags.map((h) => `#${h}`).join(" ")}
          note={`${hashtags.length} tags`}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {hashtags.map((h) => (
              <span
                key={h}
                className="indic"
                style={{
                  fontSize: 12, padding: "4px 9px", borderRadius: 999,
                  background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink-body)",
                }}
              >
                #{h}
              </span>
            ))}
          </div>
        </Field>
      )}

      {thumbs.length > 0 && (
        <Field label="Thumbnail text" note="tap one to copy">
          <div style={{ display: "grid", gap: 6 }}>
            {thumbs.map((t, i) => (
              <TapToCopy key={i} text={t} indic>
                <span style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>{t}</span>
              </TapToCopy>
            ))}
          </div>
        </Field>
      )}
    </div>
  );
}

/**
 * Is there a package to show?
 *
 * Exported because a caller has to decide whether to lay out space around this
 * BEFORE rendering it: a wrapper with a bottom margin around a component that
 * returns null is a gap in the page with nothing in it. One test, one place, so
 * a caller cannot disagree with the component about whether it is empty.
 */
export function hasPackage(script) {
  return !!(
    script?.description ||
    script?.title_suggestions?.length ||
    script?.hashtags?.length ||
    script?.thumbnail_lines?.length
  );
}

/**
 * A labelled block, with its own copy button.
 *
 * ── THE HEADER WRAPS, AND THAT IS THE MOBILE FIX ─────────────────────────────
 * It was a rigid space-between row: label on the left, button on the right. At
 * 360px, with a note between them, that squeezed the button until its label
 * broke across two lines inside a control that is meant to be tapped. Allowing
 * the row to wrap costs nothing at any width where it fits, and on a narrow
 * phone the button drops to its own line at full tap size instead of being
 * crushed.
 */
function Field({ label, note, copy, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 8, flexWrap: "wrap", marginBottom: 7,
        }}
      >
        <span style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>{label}</span>
          {note && <span style={{ fontSize: 11.5, color: "var(--ink-mute)" }}>{note}</span>}
        </span>
        {copy && <CopyButton text={copy} label="Copy" />}
      </div>
      {children}
    </div>
  );
}

/**
 * A row that copies itself.
 *
 * A whole row rather than a small icon at the end of one: this is used for
 * titles and thumbnail lines on a phone, where the alternative is a long-press
 * text selection across a script most keyboards cannot even render. The row is
 * the target, so there is nothing to aim at.
 */
function TapToCopy({ text, indic, children }) {
  const [done, setDone] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(
          () => { setDone(true); setTimeout(() => setDone(false), 1600); },
          () => {}
        );
      }}
      // `hg-row`'s hover rule carries !important, so it wins over an inline
      // background. Dropped while the row is showing "Copied", or hovering the
      // row you just tapped would repaint away the only confirmation there is.
      className={[indic ? "indic" : "", done ? "" : "hg-row"].filter(Boolean).join(" ")}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 10, width: "100%", textAlign: "left", cursor: "pointer",
        fontFamily: "inherit",
        padding: "9px 11px", borderRadius: 9,
        background: done ? "var(--made-tint)" : "var(--paper)",
        border: `1px solid ${done ? "var(--made-line)" : "var(--line)"}`,
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flexWrap: "wrap" }}>
        {children}
      </span>
      <span
        style={{
          fontSize: 11, fontWeight: 600, flexShrink: 0,
          color: done ? "var(--ok)" : "var(--ink-mute)",
        }}
      >
        {done ? "Copied" : "Copy"}
      </span>
    </button>
  );
}

/**
 * How long a title is against the length YouTube will actually show.
 *
 * Search results truncate around 60 characters, so a 90-character title is a
 * title whose second half nobody reads. Amber rather than red past the line:
 * a long title is a judgement call, not an error.
 */
function Counter({ n, limit }) {
  const over = n > limit;
  return (
    <span
      style={{
        fontSize: 11, fontWeight: 600, flexShrink: 0,
        color: over ? "#A76A00" : "var(--ink-mute)",
      }}
      title={over ? `Over ${limit} characters, YouTube will cut it off in search` : undefined}
    >
      {n}/{limit}
    </span>
  );
}

export function CopyButton({ text, label = "Copy" }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(
          () => { setDone(true); setTimeout(() => setDone(false), 2000); },
          () => {}
        );
      }}
      className="hg-btn-ghost"
      style={{
        fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 8,
        border: "1px solid var(--line)", background: "var(--card)",
        color: done ? "var(--ok)" : "var(--ink-mute)", cursor: "pointer", flexShrink: 0,
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}

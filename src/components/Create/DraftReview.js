import { useState, useEffect } from "react";

/**
 * DraftReview: what the video will say, before anyone writes it.
 *
 * ── WHY THERE IS A STEP HERE AT ALL ──────────────────────────────────────────
 * An idea like "explain the difference between candlestick patterns and chart
 * patterns" is a complete thought and almost no material. Written straight into
 * a sixty second script it produced the creator's own sentence, restated four
 * times, because there was nothing else to work with.
 *
 * Searching the news never fixed that: there is no coverage of an evergreen
 * explainer, today or ever. What was missing was content, so the model drafts
 * it and this screen is where the creator checks it.
 *
 * ── AND WHY IT IS AN EDIT BOX, NOT A PREVIEW ─────────────────────────────────
 * The draft is the one thing in this product written from a model's training
 * rather than from a source, and that is only acceptable because it does not
 * reach the script until a person has read it and put their name to it. A
 * read-only preview with an Accept button would collect the signature without
 * the reading. A box with a cursor in it says what this step actually is: your
 * turn, this is your subject, fix what I got wrong.
 *
 * The warning above the box is deliberately plain about where the text came
 * from. The creator is about to say this out loud, in their own voice, to
 * people who trust them, and they should know exactly how much of it we
 * checked, which is none of it.
 */
export default function DraftReview({
  draft,
  onConfirm,
  onRedraft,
  onBack,
  backLabel = "Change the idea",
  busy,
  redrafting,
  error,
  compact,
  maxChars = 6000,
}) {
  const [text, setText] = useState(draft || "");

  // A new draft replaces the box. Keyed on the incoming text rather than done
  // once at mount, because Rewrite swaps it under a mounted component and
  // leaving the rejected draft on screen would make the button look broken.
  useEffect(() => { setText(draft || ""); }, [draft]);

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const ready = text.trim().length >= 80 && !busy && !redrafting;

  return (
    <div className="hg-rise">
      <div
        style={{
          display: "flex", alignItems: "baseline", justifyContent: "space-between",
          gap: 10, marginBottom: 6, flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 11, fontWeight: 600, letterSpacing: "0.1em",
            textTransform: "uppercase", color: "var(--ink-mute)",
          }}
        >
          What the video will say
        </span>
        <span style={{ fontSize: 11.5, color: "var(--ink-mute)", fontVariantNumeric: "tabular-nums" }}>
          {words} word{words === 1 ? "" : "s"}
        </span>
      </div>

      <p style={{ fontSize: 12.5, color: "var(--ink-mute)", margin: "0 0 10px", lineHeight: 1.6 }}>
        We drafted this from your idea. It's a starting point, not research:{" "}
        <strong style={{ fontWeight: 600, color: "var(--ink-body)" }}>
          nothing here has been checked against a source
        </strong>
        , so fix anything that's wrong and cut anything you wouldn't say. This is
        what the script gets written from.
      </p>

      {error && (
        <div
          role="alert"
          style={{
            padding: "11px 13px", borderRadius: 10, marginBottom: 10,
            background: "#FCE8E6", border: "1px solid #F5C7C3",
            color: "var(--bad)", fontSize: 13, lineHeight: 1.55,
          }}
        >
          {error}
        </div>
      )}

      <textarea
        className="indic"
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, maxChars))}
        rows={compact ? 12 : 16}
        aria-label="What the video will say"
        style={{
          width: "100%", boxSizing: "border-box", fontSize: 14.5, fontFamily: "inherit",
          color: "var(--ink)", padding: "13px 14px", borderRadius: 10,
          border: "1px solid var(--line)", background: "var(--card)",
          outline: "none", resize: "vertical", lineHeight: 1.72, minHeight: 240,
          opacity: redrafting ? 0.5 : 1, transition: "opacity .15s ease",
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 12, flexWrap: "wrap" }}>
        <button
          onClick={() => ready && onConfirm(text.trim())}
          disabled={!ready}
          className={ready ? "hg-btn-primary" : undefined}
          style={{
            fontSize: 14, fontWeight: 600, padding: "12px 20px", borderRadius: 11,
            border: ready ? "none" : "1px solid #DCDCDC",
            background: ready ? "var(--primary)" : "#EDEDED",
            color: ready ? "#fff" : "#5F5F5F",
            cursor: ready ? "pointer" : "default",
            opacity: busy ? 0.55 : 1,
          }}
        >
          {busy ? "Saving…" : "Use this"}
        </button>

        {/* Rewrite rather than "regenerate": the creator is asking for a
            different take, not a retry of a request that failed. The previous
            draft goes back to the model so it changes angle instead of
            rewording what was already rejected. */}
        <button
          onClick={onRedraft}
          disabled={busy || redrafting}
          className="hg-btn-ghost"
          style={{
            fontSize: 13.5, fontWeight: 600, padding: "11px 16px", borderRadius: 10,
            border: "1px solid var(--line)", background: "var(--card)",
            color: "var(--ink-body)", cursor: busy || redrafting ? "default" : "pointer",
            opacity: redrafting ? 0.55 : 1,
          }}
        >
          {redrafting ? "Rewriting…" : "Write a different one"}
        </button>

        <button
          onClick={onBack}
          disabled={busy || redrafting}
          style={{
            background: "none", border: "none", padding: "11px 4px", font: "inherit",
            fontSize: 13.5, color: "var(--ink-mute)",
            cursor: busy || redrafting ? "default" : "pointer",
          }}
        >
          {backLabel}
        </button>
      </div>

      {text.trim().length > 0 && text.trim().length < 80 && (
        <p style={{ fontSize: 12.5, color: "var(--ink-mute)", margin: "9px 0 0", lineHeight: 1.6 }}>
          That's too short to build a video from. Add a few more lines, or ask for a new draft.
        </p>
      )}
    </div>
  );
}

import { useEffect, useRef, useId } from "react";
import { createPortal } from "react-dom";
import useIsMobile from "../../hooks/useIsMobile";
import ScriptOrder from "./ScriptOrder";

/**
 * Ordering another version of a script that already exists.
 *
 * ── WHY A DIALOG AND NOT THE PANEL SWAPPING ITSELF OUT ───────────────────────
 * "Write another version" used to replace the finished script with the order
 * panel, so the creator had to decide on a new length with the thing they were
 * deciding about gone from the screen, and back out with a "Back to it" button
 * to see it again. Over the top of it, the script stays where it was, and
 * closing the dialog costs nothing.
 *
 * Everything that decides whether money is spent lives in here and nowhere
 * else: the length, the price on the button, "Not enough credits" and the buy
 * button. It is the same ScriptOrder as the first order, so the two cannot
 * disagree about what a length costs.
 *
 * ── STACKING ─────────────────────────────────────────────────────────────────
 * Portalled to the body at 80: above the story sheet on a phone (60), below the
 * buy dialog (90), which ScriptOrder's own "Buy credits" opens over this one.
 */
export default function VersionDialog({ versionNumber, busy, sourceId, initialSeconds, onGenerate, onClose, onGoVoice }) {
  const isPhone = useIsMobile(600);
  const closeRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      // The buy dialog has no Escape of its own. Closing this one underneath it
      // would leave a payment open over a screen that no longer asked for it.
      if (document.querySelector('[role="dialog"][aria-label="Buy credits"]')) return;
      onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Once, on open. Refocusing whenever the effect above re-ran would pull focus
  // off the slider mid-drag each time the panel behind re-renders on a poll.
  useEffect(() => { closeRef.current?.focus(); }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return createPortal(
    <div
      // Always closable. Closing never cancels an order already sent: the
      // script is written either way and turns up in the version list.
      onClick={onClose}
      className="hg-fade"
      style={{
        position: "fixed", inset: 0, zIndex: 80,
        background: "rgba(15,15,15,.45)",
        display: "flex", justifyContent: "center",
        // A bottom sheet on a phone, where the thumb already is.
        alignItems: isPhone ? "flex-end" : "center",
        padding: isPhone ? 0 : 18,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="hg-sheet-up"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: isPhone ? "100%" : "min(500px, 100%)",
          maxHeight: isPhone ? "92vh" : "88vh", overflowY: "auto",
          background: "var(--card)", border: "1px solid var(--line)",
          borderRadius: isPhone ? "16px 16px 0 0" : 16,
          padding: isPhone ? "18px 16px calc(20px + env(safe-area-inset-bottom))" : 22,
          boxShadow: "0 30px 70px -30px rgba(15,15,15,.55)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
          <h3
            id={titleId}
            style={{
              display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap",
              fontSize: 18, fontWeight: 750, letterSpacing: "-0.02em", color: "var(--ink)", margin: 0,
            }}
          >
            Write another version
            {versionNumber > 1 && (
              <span
                style={{
                  fontSize: 11.5, fontWeight: 700, letterSpacing: ".02em", padding: "3px 8px",
                  borderRadius: 6, background: "var(--made-tint)", border: "1px solid var(--made-line)",
                  color: "var(--ink-body)",
                }}
              >
                v{versionNumber}
              </span>
            )}
          </h3>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            style={{
              flexShrink: 0, width: 34, height: 34, display: "grid", placeItems: "center",
              borderRadius: 9, border: "1px solid var(--line)", background: "var(--card)",
              color: "var(--ink-body)", cursor: "pointer",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-body)", margin: "0 0 18px" }}>
          A fresh take on the same story, at whatever length you pick.
          {versionNumber > 1 && ` Your ${versionNumber === 2 ? "first version stays" : "earlier versions stay"} saved, and you can switch between them any time.`}
        </p>

        <ScriptOrder
          busy={busy}
          onGenerate={onGenerate}
          compact={isPhone}
          sourceId={sourceId}
          cta="Generate now"
          initialSeconds={initialSeconds}
          onGoVoice={onGoVoice ? () => { onClose?.(); onGoVoice(); } : undefined}
        />
      </div>
    </div>,
    document.body
  );
}

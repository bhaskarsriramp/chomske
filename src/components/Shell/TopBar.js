import { useState, useRef, useEffect } from "react";
import { useProfiles } from "../../state/ProfileContext";
import { categoryColor } from "../../theme";
import NewProfileDialog from "../Profile/NewProfileDialog";
import Chevron from "./Chevron";

/**
 * The app bar: which channel you are working in, on every screen.
 *
 * ── WHY THIS IS PERSISTENT AND NOT A CONTROL ON EACH SCREEN ─────────────────
 * Topics, My voice, My scripts and Dashboard all mean something different
 * depending on which channel is selected, and until now the answer lived in a
 * picker that each screen drew for itself. That is a fact you have to go and
 * check, on a screen where getting it wrong costs credits, a story written in
 * the wrong voice, for an audience that is not watching.
 *
 * So it moved up here, above everything, where it is simply always true. The
 * per-screen pickers are gone: one control, one place, never two answers.
 *
 * ── THE NAME IS THE CONTROL ─────────────────────────────────────────────────
 * It used to be the word "PROFILE" beside a tinted chip, which spent the most
 * valuable strip of the screen on a label nobody needed. What the channel is
 * called already says what it is; the word in front of it said nothing twice.
 *
 * So the name IS the button now, with one chevron to say it opens. The menu
 * behind it always has something to offer, which is the other half of the fix:
 * with one channel it offers to make a second, and with several it lists them.
 * A control that is sometimes dead teaches people to stop trying it.
 *
 * ── EXCEPT ON PROFILE ───────────────────────────────────────────────────────
 * The Profile screen is where channels are created, renamed and switched, and
 * it shows all of them as cards with the active one marked. A bar above it
 * saying which is selected would be a second, smaller copy of what the page
 * already is. See Dashboard.js, which does not mount this there.
 */
export default function TopBar({ isNarrow }) {
  const { profiles, active, activeId, setActive, refresh, max } = useProfiles();

  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);

  // Shut on a click anywhere else and on Escape. Both are what a menu is
  // expected to do, and a menu that can only be dismissed by picking something
  // is a menu people are afraid to open.
  useEffect(() => {
    if (!open) return;

    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };

    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Nothing to say yet. Rendering an empty bar during the first load would push
  // the page down and then let it snap back.
  if (!active) return null;

  // The channel's own first category colour. It costs nothing and makes the
  // channels distinguishable at a glance rather than by reading, which is the
  // whole point of a thing you are meant to notice without looking at it.
  const col = categoryColor(active.categories?.[0]);
  const canAdd = profiles.length < (max || 1);

  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "flex-end",
        gap: 10, flexShrink: 0,
        height: isNarrow ? 44 : 54,
        padding: `0 ${isNarrow ? 14 : 24}px`,
        borderBottom: "1px solid var(--line)",
        background: "var(--card)",
      }}
    >
      <div ref={wrapRef} style={{ position: "relative", minWidth: 0 }}>
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Working in ${active.name}. Change channel`}
          className="hg-row"
          style={{
            display: "inline-flex", alignItems: "center", gap: 8, maxWidth: isNarrow ? 210 : 300,
            minWidth: 0, padding: "7px 10px 7px 12px", borderRadius: 10,
            border: `1px solid ${open ? "#D0D0D0" : "transparent"}`,
            background: open ? "#F4F4F4" : "transparent",
            fontFamily: "inherit", cursor: "pointer",
          }}
        >
          <span
            aria-hidden="true"
            style={{ width: 8, height: 8, borderRadius: "50%", background: col.solid, flexShrink: 0 }}
          />
          <span
            style={{
              fontSize: 14, fontWeight: 650, color: "var(--ink)", minWidth: 0,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {active.name}
          </span>
          <Chevron open={open} />
        </button>

        {open && (
          <div
            role="menu"
            aria-label="Channels"
            className="hg-rise"
            style={{
              position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 60,
              minWidth: 240, maxWidth: "min(320px, calc(100vw - 28px))",
              padding: 6, borderRadius: 12,
              background: "var(--card)", border: "1px solid var(--line)",
              boxShadow: "0 24px 50px -24px rgba(15,15,15,.4)",
            }}
          >
            {/* Listed only when there is a choice to make. One channel plus a
                row saying so is a list of one, which reads as a control that
                does nothing. */}
            {profiles.length > 1 && (
              <>
                <MenuLabel>Switch to</MenuLabel>
                {profiles.map((p) => {
                  const c = categoryColor(p.categories?.[0]);
                  const on = p.id === activeId;
                  return (
                    <button
                      key={p.id}
                      role="menuitemradio"
                      aria-checked={on}
                      onClick={() => { setActive(p.id); setOpen(false); }}
                      className="hg-row"
                      style={{
                        display: "flex", alignItems: "center", gap: 9, width: "100%",
                        padding: "9px 10px", borderRadius: 9, border: "none",
                        background: on ? "#F4F4F4" : "transparent",
                        textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{ width: 8, height: 8, borderRadius: "50%", background: c.solid, flexShrink: 0 }}
                      />
                      <span
                        style={{
                          flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: on ? 650 : 500,
                          color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}
                      >
                        {p.name}
                      </span>
                      {on && (
                        <span aria-hidden="true" style={{ fontSize: 13, color: "var(--made)", flexShrink: 0 }}>✓</span>
                      )}
                    </button>
                  );
                })}
                <div style={{ height: 1, background: "var(--line)", margin: "6px 4px" }} />
              </>
            )}

            {canAdd ? (
              <button
                role="menuitem"
                onClick={() => { setOpen(false); setAdding(true); }}
                className="hg-row"
                style={{
                  display: "flex", alignItems: "center", gap: 9, width: "100%",
                  padding: "9px 10px", borderRadius: 9, border: "none", background: "transparent",
                  textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                  fontSize: 13.5, fontWeight: 600, color: "var(--ink)",
                }}
              >
                <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1, color: "var(--ink-mute)" }}>+</span>
                Add channel
              </button>
            ) : (
              <p style={{ fontSize: 12.5, color: "var(--ink-mute)", lineHeight: 1.5, margin: 0, padding: "8px 10px" }}>
                {max} channels is the limit.
              </p>
            )}
          </div>
        )}
      </div>

      {adding && (
        <NewProfileDialog
          onCancel={() => setAdding(false)}
          onCreated={async (created) => {
            setAdding(false);
            await refresh();
            // Switch to it straight away: they made it to work in it, and the
            // next video or script has to land in the right place.
            if (created?.id) setActive(created.id);
          }}
        />
      )}
    </div>
  );
}

function MenuLabel({ children }) {
  return (
    <div
      style={{
        fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em",
        textTransform: "uppercase", color: "var(--ink-mute)",
        padding: "6px 10px 4px",
      }}
    >
      {children}
    </div>
  );
}

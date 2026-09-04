import { useProfiles } from "../../state/ProfileContext";
import { categoryColor } from "../../theme";

/**
 * The app bar — which channel you are working in, on every screen.
 *
 * ── WHY THIS IS PERSISTENT AND NOT A CONTROL ON EACH SCREEN ─────────────────
 * Topics, My voice, My scripts and Dashboard all mean something different
 * depending on which channel is selected, and until now the answer lived in a
 * picker that each screen drew for itself. That is a fact you have to go and
 * check, on a screen where getting it wrong costs credits — a story written in
 * the wrong voice, for an audience that is not watching.
 *
 * So it moved up here, above everything, where it is simply always true. The
 * per-screen pickers are gone: one control, one place, never two answers.
 *
 * ── EXCEPT ON PROFILE ───────────────────────────────────────────────────────
 * The Profile screen is where channels are created, renamed and switched, and
 * it shows all of them as cards with the active one marked. A bar above it
 * saying which is selected would be a second, smaller copy of what the page
 * already is — see Dashboard.js, which does not mount this there.
 */
export default function TopBar({ isNarrow }) {
  const { profiles, active, activeId, setActive } = useProfiles();

  // Nothing to say yet. Rendering an empty bar during the first load would push
  // the page down and then let it snap back.
  if (!active) return null;

  const many = profiles.length > 1;
  // The channel's own first category colour. It costs nothing and makes the two
  // channels distinguishable at a glance rather than by reading — which is the
  // whole point of a thing you are meant to notice without looking at it.
  const col = categoryColor(active.categories?.[0]);

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
      <span
        style={{
          fontSize: 11, fontWeight: 700, letterSpacing: "0.11em",
          textTransform: "uppercase", color: "var(--ink-mute)", whiteSpace: "nowrap",
        }}
      >
        Profile
      </span>

      {many ? (
        <span style={{ position: "relative", display: "inline-flex", alignItems: "center", minWidth: 0 }}>
          <span
            aria-hidden="true"
            style={{
              position: "absolute", left: 11, width: 7, height: 7, borderRadius: "50%",
              background: col.solid, pointerEvents: "none",
            }}
          />
          {/* A native select: on a phone this opens as the platform wheel, and it
              works with a screen reader without a single aria attribute. */}
          <select
            value={activeId || ""}
            onChange={(e) => setActive(e.target.value)}
            aria-label="Working in"
            style={{
              fontSize: 13.5, fontWeight: 650, fontFamily: "inherit",
              color: "var(--ink)", background: "var(--card)",
              border: "1px solid var(--line)", borderRadius: 9,
              padding: "7px 10px 7px 25px",
              cursor: "pointer", outline: "none",
              maxWidth: isNarrow ? 190 : 260, minWidth: 0, textOverflow: "ellipsis",
            }}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </span>
      ) : (
        // One channel: still shown, never as a dropdown. A select with a single
        // option is a control that does nothing, and offering it teaches people
        // to stop trying the ones that do.
        <span
          style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            fontSize: 13.5, fontWeight: 650, color: "var(--ink)",
            padding: "6px 12px", borderRadius: 999,
            background: col.tint, border: `1px solid ${col.line}`,
            minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: col.solid, flexShrink: 0 }} />
          {active.name}
        </span>
      )}
    </div>
  );
}

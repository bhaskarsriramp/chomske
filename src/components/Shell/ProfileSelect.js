import { useProfiles } from "../../state/ProfileContext";

/**
 * Pick which channel a screen is about.
 *
 * ── A NATIVE <select>, DELIBERATELY ─────────────────────────────────────────
 * A custom dropdown here would need focus trapping, arrow-key handling, an
 * outside-click listener and a mobile story, to arrive at what the platform
 * already does better: on a phone this opens as a native wheel, and it works
 * with a screen reader without a single aria attribute of mine.
 *
 * Renders NOTHING when the creator has one profile. A picker with a single
 * option is furniture that teaches nothing and takes a row from the screen — the
 * moment they make a second channel it appears everywhere.
 */
export default function ProfileSelect({
  value,
  onChange,
  allowAll = false,       // "All profiles" — used where a total is a real answer
  label = "Profile",
  size = "md",
  hideWhenSingle = true,
}) {
  const { profiles } = useProfiles();

  if (!profiles.length) return null;
  if (hideWhenSingle && profiles.length < 2 && !allowAll) return null;

  const small = size === "sm";

  return (
    <label
      style={{
        display: "inline-flex", alignItems: "center", gap: label ? 7 : 0,
        fontSize: small ? 11.5 : 12.5, color: "var(--ink-mute)", minWidth: 0,
      }}
    >
      {/* Skipped entirely when empty — an empty span still eats the flex gap,
          which reads as a stray indent next to the control. */}
      {label ? <span style={{ whiteSpace: "nowrap" }}>{label}</span> : null}
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        style={{
          fontSize: small ? 12.5 : 13.5, fontWeight: 600, fontFamily: "inherit",
          color: "var(--ink)", background: "var(--card)",
          border: "1px solid var(--line)", borderRadius: 9,
          padding: small ? "6px 9px" : "8px 11px",
          cursor: "pointer", outline: "none",
          maxWidth: 220, minWidth: 0, textOverflow: "ellipsis",
        }}
      >
        {allowAll && <option value="all">All profiles</option>}
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </label>
  );
}

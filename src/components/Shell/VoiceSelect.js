import { useVoices } from "../../state/VoiceContext";

/**
 * Pick which voice a screen is about.
 *
 * ── A NATIVE <select>, DELIBERATELY ─────────────────────────────────────────
 * A custom dropdown here would need focus trapping, arrow-key handling, an
 * outside-click listener and a mobile story, to arrive at what the platform
 * already does better: on a phone this opens as a native wheel, and it works
 * with a screen reader without a single aria attribute of mine.
 *
 * Renders NOTHING when the creator has one voice. A picker with a single option
 * is furniture that teaches nothing and takes a row from the screen — the moment
 * they make a second one it appears everywhere.
 */
export default function VoiceSelect({
  value,
  onChange,
  allowAll = false,       // "All voices" — used where a total is a real answer
  label = "Voice",
  size = "md",
  hideWhenSingle = true,
}) {
  const { voices } = useVoices();

  if (!voices.length) return null;
  if (hideWhenSingle && voices.length < 2 && !allowAll) return null;

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
          maxWidth: 200, minWidth: 0, textOverflow: "ellipsis",
        }}
      >
        {allowAll && <option value="all">All voices</option>}
        {voices.map((v) => (
          <option key={v.id} value={v.id}>
            {voiceLabel(v)}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * What a voice is called in a list.
 *
 * An unnamed set still has to be pickable — it is where a creator's videos are
 * going right now — so it falls back to its language, then to a plain label.
 */
export function voiceLabel(v) {
  if (!v) return "";
  const name = String(v.name || "").trim();
  if (name) return name;
  if (v.language_label) return `${v.language_label} (unnamed)`;
  return "Untitled voice";
}

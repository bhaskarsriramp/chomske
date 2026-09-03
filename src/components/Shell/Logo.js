/**
 * Logo.js — the mark and the name, in one place.
 *
 * Four screens draw this (landing, onboarding, the sidebar, the mobile header),
 * and before this they each drew their own. That is how a rename ends up half
 * applied and one screen keeps saying the old name for a year.
 *
 * The mark is the real file from public/ rather than a letter in a coloured
 * tile. It ships at 192px and renders at 26-30, so it stays sharp on a retina
 * screen at every size used here.
 */
export default function Logo({ size = 27, text = true, fontSize = 16.5 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
      <img
        src={`${process.env.PUBLIC_URL || ""}/logo192.png`}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        style={{ width: size, height: size, display: "block", flexShrink: 0 }}
      />
      {text && (
        <span
          style={{
            fontWeight: 700,
            fontSize,
            color: "var(--ink)",
            letterSpacing: "-0.02em",
            whiteSpace: "nowrap",
          }}
        >
          Chomske
        </span>
      )}
    </div>
  );
}

/**
 * Chevron.js: the open/shut marker on a disclosure header.
 *
 * Shared rather than copied, because it appears on two lists that do the same
 * job in different screens (the sources under a story in Topics, the sources
 * under a script in My scripts). Two copies drift, and a disclosure control
 * that rotates one way here and another way there is the kind of small
 * inconsistency that reads as carelessness.
 *
 * Points down when the list is shut and up when it is open, so the arrow reads
 * as what the next click does rather than as decoration.
 *
 * Purely visual: the state it marks is already on the button as
 * `aria-expanded`, so this carries `aria-hidden` and a screen reader never
 * meets it twice.
 */
export default function Chevron({ open }) {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        flexShrink: 0, color: "var(--ink-mute)",
        transform: open ? "rotate(180deg)" : "none",
        transition: "transform .16s ease",
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/**
 * Skeleton.js — the placeholder that stands in for data that has not arrived.
 *
 * ── WHY THIS EXISTS RATHER THAN @mui/material ────────────────────────────────
 * The API below is MUI's on purpose: `variant`, `width`, `height`, and text
 * skeletons that size themselves from the line height. Swapping to the real one
 * is changing the import in the files that use it, nothing else.
 *
 * It is not the real one because this app has six dependencies and a 101KB
 * bundle. @mui/material plus its two emotion peers is roughly another 90KB
 * gzipped — doubling what a creator downloads, on a phone, in India, for one
 * component whose entire job is a grey box that pulses. If the rest of the app
 * ever moves to MUI, delete this file and change the imports.
 *
 * ── WHY SKELETONS AND NOT SPINNERS OR ZEROS ──────────────────────────────────
 * The dashboard used to render "—" in every metric until its request landed. A
 * placeholder that looks like a value is worse than no value: for the moment it
 * is on screen it is a claim, and someone glancing at it reads "0 scripts" and
 * believes it. A skeleton cannot be misread as data.
 */

const BASE = {
  backgroundColor: "#EDEDED",
  animation: "hg-pulse 1.5s ease-in-out infinite",
};

/**
 * @param {"text"|"rectangular"|"circular"} variant
 * @param {number|string} width   defaults to 100%
 * @param {number|string} height  defaults per variant
 */
export default function Skeleton({
  variant = "text",
  width,
  height,
  style,
  ...rest
}) {
  const shape =
    variant === "circular"
      ? { borderRadius: "50%" }
      : variant === "rectangular"
      ? { borderRadius: 8 }
      : // Text skeletons get the rounding and the vertical rhythm of a line of
        // type, so a paragraph of them occupies the same space the real text will
        // and nothing shifts when it arrives.
        { borderRadius: 4, marginTop: 2, marginBottom: 2 };

  const h = height ?? (variant === "text" ? "0.9em" : 40);

  return (
    <span
      aria-hidden="true"
      {...rest}
      style={{
        display: "block",
        width: width ?? "100%",
        height: h,
        flexShrink: 0,
        ...BASE,
        ...shape,
        ...style,
      }}
    />
  );
}

/**
 * A block of text skeletons with ragged line lengths.
 *
 * Uniform full-width bars read as a table, not a paragraph. The last line is
 * short because that is what the end of a real paragraph looks like, and the
 * eye recognises the shape before it registers that nothing has loaded.
 */
export function SkeletonText({ lines = 3, width = "100%", gap = 7, lastWidth = "62%" }) {
  return (
    <span style={{ display: "flex", flexDirection: "column", gap, width }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} variant="text" height={11} width={i === lines - 1 ? lastWidth : "100%"} />
      ))}
    </span>
  );
}

/**
 * Words.jsx: a line of kinetic type. Each word rises out of a blur on its own
 * spring, a few frames after the one before, and the words of `accent` carry
 * the brand gradient.
 */
import { useCurrentFrame, useVideoConfig } from "remotion";
import { enter, riseStyle, SETTLE } from "../motion";

const norm = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** Which words of `text` belong to the accent phrase. */
function accentMask(words, accent) {
  const want = String(accent || "").split(/\s+/).map(norm).filter(Boolean);
  const mask = words.map(() => false);
  if (!want.length) return mask;
  for (let i = 0; i + want.length <= words.length; i++) {
    if (want.every((w, j) => norm(words[i + j]) === w)) {
      for (let j = 0; j < want.length; j++) mask[i + j] = true;
      return mask;
    }
  }
  return mask;
}

export const Words = ({
  text,
  accent,
  theme,
  delay = 0,
  stagger = 3,
  size = 96,
  weight = 700,
  color,
  lineHeight = 1.04,
  tracking = -0.04,
  align = "left",
  maxWidth,
  y = 34,
  blur = 12,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const mask = accentMask(words, accent);
  return (
    <div
      style={{
        fontSize: size,
        fontWeight: weight,
        lineHeight,
        letterSpacing: `${tracking}em`,
        color: color || theme.ink,
        textAlign: align,
        maxWidth,
        textWrap: "balance",
        ...style,
      }}
    >
      {words.map((w, i) => {
        const p = enter(frame, fps, delay + i * stagger, SETTLE);
        const lit = mask[i];
        return (
          <span key={i} style={{ display: "inline-block", whiteSpace: "pre", ...riseStyle(p, { y, blur }) }}>
            <span
              style={
                lit
                  ? {
                      backgroundImage: theme.gradient,
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      color: "transparent",
                      // Descenders and italics would clip at the box edge.
                      paddingBottom: "0.08em",
                      paddingRight: "0.02em",
                    }
                  : undefined
              }
            >
              {w}
            </span>
            {i < words.length - 1 ? " " : ""}
          </span>
        );
      })}
    </div>
  );
};

/** A paragraph that arrives as one piece, slightly after the headline. */
export const Fade = ({ children, delay = 0, y = 18, blur = 6, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = enter(frame, fps, delay, SETTLE);
  return <div style={{ ...riseStyle(p, { y, blur }), ...style }}>{children}</div>;
};

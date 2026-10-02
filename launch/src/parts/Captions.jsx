/**
 * Captions.jsx: the voice line under the picture, for the sound-off feeds.
 *
 * The speech model gives no word timings, so the words are spread over the
 * line's measured length by their letters: close enough for a highlight that
 * walks with the voice, and never ahead of the scene the line belongs to.
 */
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { alpha } from "../theme";

const CHUNK = 7;

export const Captions = ({ placed, theme, lead }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const live = placed.find(({ scene, from, dur }) => scene.voice && scene.voiceSeconds && frame >= from + lead && frame < from + dur);
  if (!live) return null;
  const { scene, from } = live;
  const words = String(scene.voice).split(/\s+/).filter(Boolean);
  const weights = words.map((w) => w.length + 2);
  const total = weights.reduce((a, b) => a + b, 0);
  const t = (frame - from - lead) / fps / scene.voiceSeconds;
  let acc = 0;
  let at = words.length - 1;
  for (let i = 0; i < words.length; i++) {
    acc += weights[i] / total;
    if (t < acc) {
      at = i;
      break;
    }
  }
  const start = Math.floor(at / CHUNK) * CHUNK;
  const shown = words.slice(start, start + CHUNK);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 56 }}>
      <div
        style={{
          padding: "14px 26px",
          borderRadius: 16,
          background: theme.dark ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.85)",
          backdropFilter: "blur(12px)",
          fontSize: 36,
          fontWeight: 600,
          letterSpacing: "-0.01em",
        }}
      >
        {shown.map((w, i) => (
          <span key={i} style={{ color: start + i <= at ? theme.ink : alpha(theme.dark ? "#ffffff" : "#000000", 0.4) }}>
            {w}
            {i < shown.length - 1 ? " " : ""}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};

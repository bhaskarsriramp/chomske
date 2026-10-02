/**
 * Background.jsx: the stage every scene stands on, continuous across cuts.
 *
 * It is drawn once for the whole video, under the scenes, so a transition
 * never flashes the background: two slow brand-coloured glows drifting, a
 * faint dot grid fading out toward the edges, and grain so large flat areas
 * never band in the encode.
 */
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { alpha } from "../theme";

export const Background = ({ theme }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const t = frame / fps;
  const a = { x: 0.22 + 0.06 * Math.sin(t * 0.21), y: 0.18 + 0.05 * Math.cos(t * 0.17) };
  const b = { x: 0.82 + 0.05 * Math.cos(t * 0.19), y: 0.86 + 0.05 * Math.sin(t * 0.23) };
  const c = { x: 0.6 + 0.08 * Math.sin(t * 0.13 + 1), y: 0.35 + 0.06 * Math.cos(t * 0.11) };
  const k = theme.dark ? 1 : 0.55;
  const glow = (p, color, r, o) =>
    `radial-gradient(${r * width}px ${r * width * 0.8}px at ${p.x * 100}% ${p.y * 100}%, ${alpha(color, o * k)} 0%, ${alpha(color, 0)} 70%)`;
  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      <AbsoluteFill
        style={{
          background: [glow(a, theme.primary, 0.55, 0.32), glow(b, theme.accent, 0.5, 0.24), glow(c, theme.primary, 0.35, 0.1)].join(","),
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(${theme.dark ? "rgba(255,255,255,0.11)" : "rgba(0,0,0,0.09)"} 1.2px, transparent 1.3px)`,
          backgroundSize: "36px 36px",
          backgroundPosition: `${(t * 6) % 36}px ${(t * 3) % 36}px`,
          WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, black 0%, transparent 100%)",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, black 0%, transparent 100%)",
          opacity: 0.7,
        }}
      />
      <AbsoluteFill style={{ opacity: theme.dark ? 0.06 : 0.04, mixBlendMode: theme.dark ? "screen" : "multiply" }}>
        <svg width={width} height={height}>
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={Math.floor(frame / 2) % 8} stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#grain)" />
        </svg>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

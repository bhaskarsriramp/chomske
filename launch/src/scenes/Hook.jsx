/**
 * Hook: the first two seconds. One sentence, big, nothing else competing.
 */
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Words, Fade } from "../parts/Words";
import { clamp } from "../motion";

const sizeFor = (s) => {
  const n = String(s || "").length;
  return n < 26 ? 156 : n < 42 ? 132 : n < 64 ? 110 : 92;
};

export const Hook = ({ scene, theme, dur }) => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, dur], [1, 1.035], clamp);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 160px" }}>
      <div style={{ transform: `scale(${drift})`, display: "flex", flexDirection: "column", alignItems: "center", gap: 36 }}>
        {scene.eyebrow ? (
          <Fade delay={0} style={{ fontSize: 26, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: theme.primaryText }}>
            {scene.eyebrow}
          </Fade>
        ) : null}
        <Words text={scene.headline} accent={scene.accent} theme={theme} size={sizeFor(scene.headline)} align="center" delay={4} stagger={3} maxWidth={1560} />
        {scene.sub ? (
          <Fade delay={18} style={{ fontSize: 38, lineHeight: 1.35, color: theme.body, textAlign: "center", maxWidth: 1200, letterSpacing: "-0.01em" }}>
            {scene.sub}
          </Fade>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

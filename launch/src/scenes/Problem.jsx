/**
 * Problem: the pain, said in the viewer's words. A headline on the left and
 * the pains arriving on the right like notifications nobody wants.
 */
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Words } from "../parts/Words";
import { Icon } from "../parts/Icon";
import { enter, SETTLE, clamp } from "../motion";
import { alpha } from "../theme";

const PAIN = "#FF5D5D";

export const Problem = ({ scene, theme, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const points = (scene.points || []).slice(0, 4);
  return (
    <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", padding: "0 140px", gap: 110 }}>
      <div style={{ flex: "0 0 760px" }}>
        <Words text={scene.headline} accent={scene.accent} theme={theme} size={92} delay={2} stagger={3} />
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 26 }}>
        {points.map((pt, i) => {
          const p = enter(frame, fps, 14 + i * 7, SETTLE);
          const float = Math.sin((frame + i * 20) / 22) * 3;
          const dim = interpolate(frame, [dur - 30, dur - 12], [1, 0.55], clamp);
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 26,
                padding: "28px 34px",
                borderRadius: 24,
                background: theme.card,
                border: `1px solid ${theme.cardEdge}`,
                boxShadow: theme.dark ? "0 20px 60px rgba(0,0,0,0.35)" : "0 18px 50px rgba(20,20,60,0.10)",
                backdropFilter: "blur(10px)",
                opacity: interpolate(p, [0, 0.6], [0, 1], clamp) * dim,
                transform: `translate3d(${(1 - p) * 90}px, ${float}px, 0) rotate(${(1 - p) * 2}deg)`,
                filter: `blur(${(1 - Math.min(1, p * 1.3)) * 8}px)`,
              }}
            >
              <div
                style={{
                  width: 58,
                  height: 58,
                  flex: "0 0 58px",
                  borderRadius: 16,
                  background: alpha(PAIN, 0.14),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="x" size={28} color={PAIN} stroke={2.6} />
              </div>
              <div style={{ fontSize: 38, fontWeight: 500, color: theme.ink, letterSpacing: "-0.015em", lineHeight: 1.2 }}>{pt}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

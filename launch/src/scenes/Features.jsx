/**
 * Features: three or four short promises at once, as cards. A light passes
 * over them one by one so the eye has a path through the row.
 */
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Words } from "../parts/Words";
import { Icon } from "../parts/Icon";
import { enter, SETTLE, clamp } from "../motion";
import { alpha } from "../theme";

export const Features = ({ scene, theme, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items = (scene.items || []).slice(0, 4);
  const cardW = items.length > 3 ? 380 : 480;
  const sweepFrom = 34;
  const per = Math.max(10, Math.floor((dur - sweepFrom - 16) / Math.max(1, items.length)));
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 70, padding: "0 120px" }}>
      <Words text={scene.title} accent={scene.accent} theme={theme} size={84} align="center" delay={0} stagger={3} maxWidth={1500} />
      <div style={{ display: "flex", gap: 30 }}>
        {items.map((it, i) => {
          const p = enter(frame, fps, 10 + i * 5, SETTLE);
          const lit = interpolate(frame, [sweepFrom + i * per, sweepFrom + i * per + 8, sweepFrom + (i + 1) * per, sweepFrom + (i + 1) * per + 8], [0, 1, 1, 0], clamp);
          return (
            <div
              key={i}
              style={{
                width: cardW,
                padding: "40px 38px 44px",
                borderRadius: 28,
                background: theme.card,
                border: `1px solid ${lit > 0 ? alpha(theme.primary, 0.25 + 0.45 * lit) : theme.cardEdge}`,
                boxShadow: `${theme.dark ? "0 24px 70px rgba(0,0,0,0.4)" : "0 22px 60px rgba(20,20,60,0.10)"}, 0 0 ${60 * lit}px ${alpha(theme.primary, 0.3 * lit)}`,
                opacity: interpolate(p, [0, 0.6], [0, 1], clamp),
                transform: `translate3d(0, ${(1 - p) * 70 - lit * 10}px, 0) scale(${0.94 + 0.06 * p})`,
                filter: `blur(${(1 - Math.min(1, p * 1.3)) * 10}px)`,
                display: "flex",
                flexDirection: "column",
                gap: 22,
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 18,
                  // Longhands only: React clearing a `background` shorthand would wipe the gradient.
                  backgroundColor: alpha(theme.primary, theme.dark ? 0.2 : 0.1),
                  backgroundImage: lit > 0.01 ? theme.gradient : "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={it.icon} size={32} color={lit > 0.5 ? "#fff" : theme.primaryText} />
              </div>
              <div style={{ fontSize: 38, fontWeight: 600, color: theme.ink, letterSpacing: "-0.025em", lineHeight: 1.12 }}>{it.title}</div>
              {it.body ? <div style={{ fontSize: 26, color: theme.body, lineHeight: 1.4 }}>{it.body}</div> : null}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

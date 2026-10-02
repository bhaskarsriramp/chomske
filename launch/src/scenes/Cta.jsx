/**
 * Cta: the last word. The headline, a button the cursor actually presses,
 * and the address to type.
 */
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Words, Fade } from "../parts/Words";
import { Logo } from "../parts/Logo";
import { Cursor } from "../parts/BrowserFrame";
import { enter, POP, clamp, ramp, EASE_IN_OUT } from "../motion";
import { alpha } from "../theme";

export const Cta = ({ scene, theme, brand }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const logoIn = enter(frame, fps, 0, POP);
  const btnIn = enter(frame, fps, 16, POP);
  // The button sits at the centre of the frame, a little below the middle.
  const btn = { x: width / 2, y: height / 2 + 120 };
  const from = { x: width * 0.78, y: height * 0.94 };
  const t = ramp(frame, 26, 50, EASE_IN_OUT);
  const pressAt = 53;
  const press = interpolate(frame, [pressAt, pressAt + 3, pressAt + 9], [0, 1, 0], clamp);
  const ripple = interpolate(frame, [pressAt + 1, pressAt + 24], [0, 1], clamp);
  const cur = { x: from.x + (btn.x + 30 - from.x) * t, y: from.y + (btn.y + 12 - from.y) * t - Math.sin(t * Math.PI) * 40 };
  const glow = 0.5 + 0.5 * Math.sin(frame / 9);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 34, transform: "translateY(-40px)" }}>
          <div style={{ transform: `scale(${0.5 + 0.5 * logoIn})`, opacity: Math.min(1, logoIn * 2) }}>
            <Logo brand={brand} theme={theme} size={84} />
          </div>
          <Words text={scene.headline} accent={scene.accent} theme={theme} size={100} align="center" delay={4} stagger={3} maxWidth={1500} />
          <div style={{ height: 150 }} />
        </div>
      </AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: btn.x,
          top: btn.y,
          transform: `translate(-50%, -50%) scale(${(0.6 + 0.4 * btnIn) * (1 - 0.05 * press)})`,
          opacity: Math.min(1, btnIn * 2),
          padding: "30px 64px",
          borderRadius: 999,
          background: theme.primary,
          color: theme.onPrimary,
          fontSize: 40,
          fontWeight: 600,
          letterSpacing: "-0.015em",
          whiteSpace: "nowrap",
          boxShadow: `0 20px 60px ${alpha(theme.primary, 0.35 + 0.2 * glow)}, inset 0 1px 0 rgba(255,255,255,0.25)`,
        }}
      >
        {scene.button || "Get started"}
      </div>
      <div style={{ position: "absolute", left: 0, top: 0, width, height }}>
        <Cursor x={cur.x} y={cur.y} press={press} ripple={ripple} theme={theme} size={40} />
      </div>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 150 }}>
        <Fade delay={30} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
          <div
            style={{
              fontSize: 34,
              fontWeight: 600,
              color: theme.ink,
              padding: "14px 30px",
              borderRadius: 999,
              border: `1px solid ${theme.cardEdge}`,
              background: theme.card,
              letterSpacing: "-0.01em",
            }}
          >
            {scene.url || brand.domain}
          </div>
          {scene.note ? <div style={{ fontSize: 26, color: theme.faint }}>{scene.note}</div> : null}
        </Fade>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

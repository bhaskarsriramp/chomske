/**
 * Reveal: the product's name, then the product itself. The logo lands, the
 * name and promise follow, and then everything lifts to make room for the
 * real site rising out of the floor in a browser window.
 */
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Words, Fade } from "../parts/Words";
import { Logo } from "../parts/Logo";
import { BrowserFrame } from "../parts/BrowserFrame";
import { enter, POP, GLIDE, clamp } from "../motion";
import { alpha } from "../theme";

export const Reveal = ({ scene, theme, brand, dur }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const shot = scene.shot || null;
  const liftAt = Math.round(Math.min(50, dur * 0.36));
  const logoIn = enter(frame, fps, 2, POP);
  const burst = interpolate(frame, [6, 40], [0, 1], clamp);
  const lift = shot ? enter(frame, fps, liftAt, GLIDE) : 0;
  const rise = shot ? enter(frame, fps, liftAt + 4, GLIDE) : 0;
  const settle = interpolate(frame, [liftAt + 4, dur], [0, 1], clamp);

  const blockShift = -lift * (height / 2 - 175);
  const blockScale = 1 - lift * 0.34;

  const W = 1460;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 30,
            transform: `translateY(${blockShift}px) scale(${blockScale})`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 34, position: "relative" }}>
            <div
              style={{
                position: "absolute",
                left: 60,
                top: "50%",
                width: 360,
                height: 360,
                marginLeft: -180,
                marginTop: -180,
                borderRadius: "50%",
                background: `radial-gradient(circle, ${alpha(theme.primary, 0.55 * (1 - burst))} 0%, ${alpha(theme.primary, 0)} 65%)`,
                transform: `scale(${0.4 + burst * 1.6})`,
              }}
            />
            <div style={{ transform: `scale(${0.4 + 0.6 * logoIn}) rotate(${(1 - logoIn) * -12}deg)`, opacity: Math.min(1, logoIn * 2) }}>
              <Logo brand={brand} theme={theme} size={124} />
            </div>
            {brand.logoHasName ? null : (
              <Words text={brand.name} theme={theme} size={136} delay={8} stagger={2} tracking={-0.05} />
            )}
          </div>
          <Fade delay={16} style={{ fontSize: 46, color: theme.body, letterSpacing: "-0.015em", textAlign: "center", maxWidth: 1300, lineHeight: 1.25 }}>
            {scene.tagline}
          </Fade>
        </div>
      </AbsoluteFill>
      {shot ? (
        <AbsoluteFill style={{ alignItems: "center", perspective: 2400 }}>
          <div
            style={{
              position: "absolute",
              top: 330,
              transformOrigin: "50% 0%",
              transform: `translateY(${(1 - rise) * 760}px) rotateX(${(1 - rise) * 30 + 7 * (1 - settle)}deg) scale(${0.94 + 0.06 * rise})`,
              opacity: interpolate(rise, [0, 0.25], [0, 1], clamp),
            }}
          >
            <BrowserFrame theme={theme} src={shot} domain={brand.domain} width={W} view={{ z: 1 + 0.05 * settle, x: 0.5, y: 0.3 }} />
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

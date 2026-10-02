/**
 * Feature: one thing the product does, shown on the real site. Words on one
 * side; on the other the site in a browser window, where the camera eases in
 * on the element that proves the claim and a cursor clicks it: the same
 * gesture Clipo makes for a recorded demo.
 *
 *   scene.focus  { x, y, w, h }  the element's measured box (fractions of the shot)
 *   scene.click  { x, y }        where the cursor presses, inside it (optional)
 */
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Words, Fade } from "../parts/Words";
import { BrowserFrame } from "../parts/BrowserFrame";
import { Icon } from "../parts/Icon";
import { enter, GLIDE, SETTLE, clamp, ramp, EASE_IN_OUT } from "../motion";
import { alpha } from "../theme";

/** How far in the camera goes on a box: enough to fill ~60% of the window, never past 2.1×. */
const zoomFor = (f) => (f ? Math.max(1, Math.min(2.1, 0.62 / Math.max(f.w, f.h))) : 1);

export const Feature = ({ scene, theme, brand, dur, index = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const right = (scene.side || (index % 2 ? "left" : "right")) === "right";
  const focus = scene.focus && scene.focus.w > 0 ? scene.focus : null;
  // The cursor only appears when there is something to press: a cursor
  // "clicking" a headline reads as a mistake.
  const click = scene.click || null;

  const inP = enter(frame, fps, 0, SETTLE);
  const zoomP = focus ? enter(frame, fps, 16, GLIDE) : 0;
  const z = 1 + (zoomFor(focus) - 1) * zoomP + 0.03 * interpolate(frame, [0, dur], [0, 1], clamp);
  const target = focus ? { x: focus.x + focus.w / 2, y: focus.y + focus.h / 2 } : { x: 0.5, y: 0.35 };
  const view = { z, x: 0.5 + (target.x - 0.5) * zoomP, y: 0.5 + (target.y - 0.5) * zoomP };

  // The cursor arrives once the camera has mostly settled, travels on a
  // shallow arc, presses, and rings out.
  const travelFrom = 30;
  const travelTo = 54;
  const pressAt = travelTo + 3;
  const start = click ? { x: Math.min(0.96, click.x + 0.16), y: Math.min(0.96, click.y + 0.2) } : null;
  const tp = click ? ramp(frame, travelFrom, travelTo, EASE_IN_OUT) : 0;
  const arc = Math.sin(tp * Math.PI) * 0.03;
  const cursor = click
    ? {
        x: start.x + (click.x - start.x) * tp - arc,
        y: start.y + (click.y - start.y) * tp,
        press: interpolate(frame, [pressAt, pressAt + 3, pressAt + 8], [0, 1, 0], clamp),
        ripple: interpolate(frame, [pressAt + 1, pressAt + 22], [0, 1], clamp),
      }
    : null;
  const cursorOn = click ? interpolate(frame, [travelFrom - 6, travelFrom], [0, 1], clamp) : 0;
  const spotFrom = click ? pressAt + 2 : 40;
  const spotO = focus ? interpolate(frame, [spotFrom, spotFrom + 12], [0, 1], clamp) * (scene.spotlight === false ? 0 : 1) : 0;

  const W = 1060;
  const textCol = (
    <div style={{ flex: "0 0 560px", display: "flex", flexDirection: "column", gap: 30 }}>
      <Fade delay={0} style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            width: 54,
            height: 54,
            borderRadius: 16,
            background: alpha(theme.primary, theme.dark ? 0.22 : 0.1),
            border: `1px solid ${alpha(theme.primary, 0.35)}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={scene.icon || "sparkle"} size={28} color={theme.primaryText} />
        </div>
        {scene.kicker ? (
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: theme.primaryText }}>{scene.kicker}</div>
        ) : null}
      </Fade>
      <Words text={scene.title} accent={scene.accent} theme={theme} size={74} delay={3} stagger={3} lineHeight={1.06} />
      {scene.body ? (
        <Fade delay={14} style={{ fontSize: 34, lineHeight: 1.4, color: theme.body, letterSpacing: "-0.01em" }}>
          {scene.body}
        </Fade>
      ) : null}
    </div>
  );
  const frameCol = (
    <div
      style={{
        perspective: 2200,
        opacity: interpolate(inP, [0, 0.5], [0, 1], clamp),
        transform: `translate3d(${(1 - inP) * (right ? 140 : -140)}px, 0, 0)`,
      }}
    >
      <div style={{ transform: `rotateY(${(1 - inP) * (right ? -14 : 14)}deg)` }}>
        <BrowserFrame
          theme={theme}
          src={scene.shot}
          domain={brand.domain}
          width={W}
          view={view}
          spot={focus ? { ...focus, o: spotO } : null}
          cursor={cursor && cursorOn > 0 ? cursor : null}
        />
      </div>
    </div>
  );
  return (
    <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 84, padding: "0 110px" }}>
      {right ? textCol : frameCol}
      {right ? frameCol : textCol}
    </AbsoluteFill>
  );
};

/**
 * BrowserFrame.jsx: a real screenshot of the site, in a browser window, with
 * a camera inside it.
 *
 * Every position here is a FRACTION of the screenshot (0..1), the same rule
 * the Studio timeline follows: the director picks elements by their measured
 * boxes, and the frame turns those into pixels at whatever size it is drawn.
 *
 *   view      { z, x, y }  zoom (≥1) and the point (fractions) at the centre
 *   spot      { x, y, w, h, o }  a ring around one element, the rest dimmed by o
 *   cursor    { x, y, press, ripple }  press 0..1 squeezes it, ripple 0..1 rings out
 */
import { Img, staticFile } from "remotion";
import { alpha } from "../theme";

const CHROME = 0.034;

export const project = (view, cw, ch, fx, fy) => {
  const z = Math.max(1, view?.z || 1);
  const tx = Math.min(0, Math.max(cw - cw * z, cw / 2 - (view?.x ?? 0.5) * cw * z));
  const ty = Math.min(0, Math.max(ch - ch * z, ch / 2 - (view?.y ?? 0.5) * ch * z));
  return { x: tx + fx * cw * z, y: ty + fy * ch * z, z, tx, ty };
};

export const Cursor = ({ x, y, press = 0, ripple = 0, theme, size = 34 }) => (
  <>
    {ripple > 0 && ripple < 1 && (
      <div
        style={{
          position: "absolute",
          left: x,
          top: y,
          width: 120,
          height: 120,
          marginLeft: -60,
          marginTop: -60,
          borderRadius: "50%",
          border: `3px solid ${alpha(theme.primary, 0.9 * (1 - ripple))}`,
          background: alpha(theme.primary, 0.18 * (1 - ripple)),
          transform: `scale(${0.15 + ripple * 0.85})`,
        }}
      />
    )}
    <svg
      width={size}
      height={size * 1.3}
      viewBox="0 0 24 31"
      style={{
        position: "absolute",
        left: x - 3,
        top: y - 2,
        transform: `scale(${1 - 0.16 * press})`,
        transformOrigin: "3px 2px",
        filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.35))",
        overflow: "visible",
      }}
    >
      <path d="M2.5 1.8 L2.5 24.6 L8.1 19.3 L11.9 28.2 L15.9 26.5 L12.2 17.8 L19.9 17.6 Z" fill="#fff" stroke="#0B0B0F" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  </>
);

export const BrowserFrame = ({ theme, src, domain, width, aspect = 1.6, view, spot, cursor, style }) => {
  const bar = Math.round(width * CHROME);
  const cw = width;
  const ch = width / aspect;
  const v = project(view, cw, ch, 0, 0);
  const s = spot && spot.o > 0 ? [project(view, cw, ch, spot.x, spot.y), project(view, cw, ch, spot.x + spot.w, spot.y + spot.h)] : null;
  const c = cursor ? project(view, cw, ch, cursor.x, cursor.y) : null;
  const pad = 10;
  return (
    <div
      style={{
        width,
        borderRadius: Math.round(width * 0.012),
        overflow: "hidden",
        background: theme.chrome,
        boxShadow: theme.shadow,
        border: `1px solid ${theme.cardEdge}`,
        ...style,
      }}
    >
      <div style={{ height: bar, display: "flex", alignItems: "center", padding: `0 ${bar * 0.42}px`, gap: bar * 0.17, position: "relative" }}>
        {["#FF5F57", "#FEBC2E", "#28C840"].map((col) => (
          <div key={col} style={{ width: bar * 0.24, height: bar * 0.24, borderRadius: "50%", background: col, opacity: 0.9 }} />
        ))}
        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            height: bar * 0.58,
            minWidth: width * 0.3,
            padding: `0 ${bar * 0.4}px`,
            borderRadius: bar,
            background: theme.dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: bar * 0.15,
            color: theme.chromeInk,
            fontSize: bar * 0.3,
            fontWeight: 500,
            letterSpacing: "-0.01em",
          }}
        >
          <svg width={bar * 0.26} height={bar * 0.26} viewBox="0 0 16 16" fill="none">
            <rect x="3" y="7" width="10" height="7.5" rx="1.6" fill="currentColor" />
            <path d="M5.2 7V5.2a2.8 2.8 0 1 1 5.6 0V7" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          {domain}
        </div>
      </div>
      <div style={{ width: cw, height: ch, position: "relative", overflow: "hidden", background: "#fff" }}>
        <Img
          src={staticFile(src)}
          style={{ position: "absolute", left: v.tx, top: v.ty, width: cw * v.z, height: ch * v.z, maxWidth: "none" }}
        />
        {s && (
          <div
            style={{
              position: "absolute",
              left: s[0].x - pad,
              top: s[0].y - pad,
              width: s[1].x - s[0].x + pad * 2,
              height: s[1].y - s[0].y + pad * 2,
              borderRadius: 14,
              border: `3px solid ${alpha(theme.primary, spot.o)}`,
              boxShadow: `0 0 0 9999px rgba(8,8,14,${0.38 * spot.o}), 0 0 40px ${alpha(theme.primary, 0.45 * spot.o)}`,
            }}
          />
        )}
        {c && <Cursor x={c.x} y={c.y} press={cursor.press} ripple={cursor.ripple} theme={theme} size={Math.round(width * 0.02 * (0.7 + 0.3 * c.z))} />}
      </div>
    </div>
  );
};

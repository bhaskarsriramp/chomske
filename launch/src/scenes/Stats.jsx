/**
 * Stats: numbers the site itself states, counting up. Never a number the
 * site did not say: the director is told so, and this scene has no default.
 */
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Words } from "../parts/Words";
import { enter, SETTLE, clamp, EASE_OUT } from "../motion";

/** "₹1,299+" → { pre: "₹", n: 1299, dec: 0, post: "+", comma: true } */
function parse(v) {
  const m = /^([^\d]*)([\d,]*\.?\d+)(.*)$/.exec(String(v || "").trim());
  if (!m) return null;
  const raw = m[2];
  return { pre: m[1], n: Number(raw.replace(/,/g, "")), dec: (raw.split(".")[1] || "").length, post: m[3], comma: raw.includes(",") };
}

const show = (p, k) => {
  const v = p.n * k;
  const s = p.dec ? v.toFixed(p.dec) : String(Math.round(v));
  return p.pre + (p.comma ? Number(s).toLocaleString("en-US", { minimumFractionDigits: p.dec, maximumFractionDigits: p.dec }) : s) + p.post;
};

export const Stats = ({ scene, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items = (scene.items || []).slice(0, 3);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 90 }}>
      {scene.title ? <Words text={scene.title} accent={scene.accent} theme={theme} size={72} align="center" delay={0} maxWidth={1400} /> : null}
      <div style={{ display: "flex", alignItems: "stretch" }}>
        {items.map((it, i) => {
          const p = enter(frame, fps, 8 + i * 6, SETTLE);
          const k = interpolate(frame, [8 + i * 6, 8 + i * 6 + 42], [0, 1], { ...clamp, easing: EASE_OUT });
          const num = parse(it.value);
          return (
            <div key={i} style={{ display: "flex", alignItems: "stretch" }}>
              {i > 0 ? <div style={{ width: 1, background: theme.line, margin: "0 80px" }} /> : null}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 18,
                  opacity: interpolate(p, [0, 0.6], [0, 1], clamp),
                  transform: `translateY(${(1 - p) * 50}px)`,
                  minWidth: 360,
                }}
              >
                <div
                  style={{
                    fontSize: 170,
                    fontWeight: 700,
                    letterSpacing: "-0.055em",
                    lineHeight: 1,
                    backgroundImage: theme.gradient,
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                    fontVariantNumeric: "tabular-nums",
                    paddingBottom: 8,
                  }}
                >
                  {num ? show(num, k) : it.value}
                </div>
                <div style={{ fontSize: 32, color: theme.body, letterSpacing: "-0.01em", textAlign: "center", maxWidth: 380 }}>{it.label}</div>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

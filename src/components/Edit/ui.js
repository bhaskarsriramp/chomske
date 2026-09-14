import { forwardRef } from "react";

/**
 * ui.js: the editor's small controls.
 *
 * The editor is dense in a way no other screen here is: dozens of trims, nudges
 * and toggles on one page, on a phone as often as a desk. These keep every one
 * of them the same size, the same touch target and the same look, instead of
 * forty inline variations of a button.
 */

/** "0:07.2" for trims, "0:07" for durations in a list. */
export function fmtTime(sec, tenths = true) {
  const t = Math.max(0, Math.round((Number(sec) || 0) * 10));
  const m = Math.floor(t / 600);
  const s = (t % 600) / 10;
  return tenths ? `${m}:${s.toFixed(1).padStart(4, "0")}` : `${m}:${String(Math.floor(s)).padStart(2, "0")}`;
}

export function fmtBytes(n) {
  const b = Number(n) || 0;
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`;
  if (b >= 1024 ** 2) return `${Math.round(b / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(b / 1024))} KB`;
}

const SIZES = {
  s: { fontSize: 12.5, padding: "6px 10px", borderRadius: 8, minHeight: 32 },
  m: { fontSize: 13.5, padding: "8px 14px", borderRadius: 10, minHeight: 38 },
  l: { fontSize: 14.5, padding: "11px 20px", borderRadius: 11, minHeight: 44 },
};
const KINDS = {
  primary: { border: "none", background: "var(--primary)", color: "#fff" },
  ghost: { border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink-body)" },
  quiet: { border: "1px solid transparent", background: "transparent", color: "var(--ink-body)" },
  danger: { border: "1px solid #F1C4C0", background: "var(--card)", color: "var(--bad)" },
};

// forwardRef so a dialog can put focus on its close button when it opens.
export const Btn = forwardRef(function Btn({ kind = "ghost", size = "m", icon = null, children, style, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      className={disabled ? undefined : kind === "primary" ? "hg-btn-primary" : kind === "ghost" ? "hg-btn-ghost" : undefined}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
        fontFamily: "inherit", fontWeight: 600, whiteSpace: "nowrap", lineHeight: 1.2,
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1,
        ...SIZES[size], ...KINDS[kind], ...style,
      }}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

/** A row of mutually exclusive options. */
export function Segmented({ value, options, onChange, size = "m", full = false, label }) {
  return (
    <div
      role="group"
      aria-label={label}
      style={{
        display: full ? "flex" : "inline-flex", gap: 2, padding: 2, maxWidth: "100%", flexWrap: "wrap",
        borderRadius: 9, background: "var(--paper)", border: "1px solid var(--line)",
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={on}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={o.indic ? "indic" : undefined}
            style={{
              flex: full ? "1 1 0" : undefined,
              fontSize: size === "s" ? 12 : 12.5, fontWeight: 600, lineHeight: 1.3,
              padding: size === "s" ? "5px 9px" : "7px 12px", minHeight: size === "s" ? 30 : 34,
              borderRadius: 7, border: "none", cursor: "pointer", whiteSpace: "nowrap",
              background: on ? "var(--card)" : "transparent",
              color: on ? "var(--ink)" : "var(--ink-mute)",
              boxShadow: on ? "0 1px 2px rgba(0,0,0,.08)" : "none",
              ...(o.indic ? {} : { fontFamily: "inherit" }),
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * − value +, for trims and timings.
 *
 * Buttons rather than a text field: a trim is adjusted by feel, a tenth at a
 * time, watching the preview, and a phone keyboard popping up over the preview
 * on every adjustment is the opposite of that.
 */
export function Nudge({ label, value, onChange, step = 0.1, min = -Infinity, max = Infinity, format = (v) => fmtTime(v) }) {
  const set = (v) => onChange(Math.min(max, Math.max(min, Math.round(v * 1000) / 1000)));
  const btn = {
    width: 34, height: 34, border: "none", background: "transparent", cursor: "pointer",
    fontSize: 17, lineHeight: 1, color: "var(--ink-body)", fontFamily: "inherit",
  };
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
      {label && <span style={{ fontSize: 12, color: "var(--ink-mute)", minWidth: 34 }}>{label}</span>}
      <span style={{ display: "inline-flex", alignItems: "center", border: "1px solid var(--line)", borderRadius: 9, background: "var(--card)" }}>
        <button type="button" aria-label={`${label || "Value"} down`} style={btn} disabled={value - step < min - 1e-9} onClick={() => set(value - step)}>−</button>
        <span style={{ minWidth: 54, textAlign: "center", fontSize: 12.5, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
          {format(value)}
        </span>
        <button type="button" aria-label={`${label || "Value"} up`} style={btn} disabled={value + step > max + 1e-9} onClick={() => set(value + step)}>+</button>
      </span>
    </div>
  );
}

/** The app's range input (index.css .hg-range), with its fill kept in step. */
export function Range({ value, min = 0, max = 1, step = 0.01, onChange, label, onCommit }) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <input
      type="range"
      className="hg-range"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
      onPointerUp={onCommit}
      onKeyUp={onCommit}
      style={{ "--hg-range-pct": `${Math.max(0, Math.min(100, pct))}%`, width: "100%" }}
    />
  );
}

export function Switch({ on, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      style={{
        width: 40, height: 24, borderRadius: 99, border: "none", padding: 2, cursor: "pointer", flexShrink: 0,
        background: on ? "var(--ink)" : "#D5D5D5", transition: "background .15s ease",
      }}
    >
      <span
        style={{
          display: "block", width: 20, height: 20, borderRadius: "50%", background: "#fff",
          transform: on ? "translateX(16px)" : "none", transition: "transform .15s ease",
          boxShadow: "0 1px 2px rgba(0,0,0,.2)",
        }}
      />
    </button>
  );
}

export function Section({ title, right = null, children, style }) {
  return (
    <section style={{ marginBottom: 18, ...style }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 9 }}>
        <h4 style={{ margin: 0, fontSize: 11.5, fontWeight: 650, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-mute)" }}>
          {title}
        </h4>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Spinner({ size = 15 }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0, display: "inline-block",
        border: "2px solid var(--line)", borderTopColor: "var(--made)", animation: "hg-spin .8s linear infinite",
      }}
    />
  );
}

export function Bar({ value }) {
  return (
    <div style={{ height: 6, borderRadius: 99, background: "#ECEAE6", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, background: "var(--made)", transition: "width .3s ease" }} />
    </div>
  );
}

export function Notice({ tone = "info", children, action = null }) {
  const tones = {
    info: { background: "var(--made-tint)", border: "1px solid var(--made-line)", color: "var(--ink-body)" },
    warn: { background: "#FBF5E8", border: "1px solid #EEDCB6", color: "var(--ink-body)" },
    bad: { background: "#FCE8E6", border: "1px solid #F5C7C3", color: "var(--bad)" },
  };
  return (
    <div role={tone === "bad" ? "alert" : "status"} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 13px", borderRadius: 10, fontSize: 13, lineHeight: 1.55, ...tones[tone] }}>
      <span style={{ flex: "1 1 200px", minWidth: 0 }}>{children}</span>
      {action}
    </div>
  );
}

/* ── Icons ─────────────────────────────────────────────────────────────── */

const svg = (size) => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, style: { flexShrink: 0 },
});

export const Icon = {
  Back: ({ size = 17 }) => <svg {...svg(size)}><path d="M15 5l-7 7 7 7" /></svg>,
  Play: ({ size = 17 }) => <svg {...svg(size)}><path d="M7 4.5v15l12-7.5z" fill="currentColor" /></svg>,
  Pause: ({ size = 17 }) => <svg {...svg(size)}><path d="M8 5v14M16 5v14" strokeWidth="3" /></svg>,
  Plus: ({ size = 15 }) => <svg {...svg(size)}><path d="M12 5v14M5 12h14" /></svg>,
  Trash: ({ size = 15 }) => <svg {...svg(size)}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>,
  Up: ({ size = 15 }) => <svg {...svg(size)}><path d="M6 15l6-6 6 6" /></svg>,
  Down: ({ size = 15 }) => <svg {...svg(size)}><path d="M6 9l6 6 6-6" /></svg>,
  Undo: ({ size = 16 }) => <svg {...svg(size)}><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 010 11H11" /></svg>,
  Redo: ({ size = 16 }) => <svg {...svg(size)}><path d="M15 14l5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 000 11H13" /></svg>,
  Film: ({ size = 17 }) => <svg {...svg(size)}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" /></svg>,
  Camera: ({ size = 15 }) => <svg {...svg(size)}><path d="M3 7h13v10H3zM16 10l5-3v10l-5-3" /></svg>,
  Image: ({ size = 15 }) => <svg {...svg(size)}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></svg>,
  Music: ({ size = 15 }) => <svg {...svg(size)}><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></svg>,
  Text: ({ size = 15 }) => <svg {...svg(size)}><path d="M5 6V4h14v2M12 4v16M9 20h6" /></svg>,
  Captions: ({ size = 15 }) => <svg {...svg(size)}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 12h4M13 12h4M7 15.5h7" /></svg>,
  Script: ({ size = 15 }) => <svg {...svg(size)}><path d="M6 3.5h8.5L19 8v12.5H6z" /><path d="M9 12.5h7M9 16h4.5" /></svg>,
  Upload: ({ size = 17 }) => <svg {...svg(size)}><path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4" /></svg>,
  Check: ({ size = 14 }) => <svg {...svg(size)}><path d="M4 12.5l5.5 5.5L20 6.5" /></svg>,
  Close: ({ size = 16 }) => <svg {...svg(size)}><path d="M6 6l12 12M18 6L6 18" /></svg>,
  Download: ({ size = 16 }) => <svg {...svg(size)}><path d="M12 4v12M7 11l5 5 5-5M4 20h16" /></svg>,
  Wave: ({ size = 15 }) => <svg {...svg(size)}><path d="M4 11v2M8 7.5v9M12 4.5v15M16 8.5v7M20 11v2" /></svg>,
};

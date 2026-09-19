/**
 * ui.js: the studio's small controls.
 *
 * ── WHY A SECOND SET AND NOT src/components/Edit/ui.js ───────────────────────
 * The shapes, sizes, tokens and weights are deliberately the script editor's:
 * same paper, same ink, same borders, same segmented control. A creator moving
 * between Edit Videos and the studio in one session should not be able to tell
 * where one design ends. What is here and not there is what only a screen
 * recorder needs — a record button, a level meter, drag maths for a rectangle
 * on a video — and the pieces both products share (the caption colour, size
 * and look pickers) live in src/components/Edit/captionStyle.js and are
 * imported by both rather than written twice.
 *
 * Nothing here knows what a zoom or a blur is. It is sliders, buttons, rows and
 * fields; the panels in panels.js decide what they mean.
 */
import { forwardRef, useCallback, useEffect, useId, useRef, useState } from "react";

export { fmtTime, fmtBytes } from "./model";

/* ────────────────────────────────────────────────────────────────────────────
   Buttons
   ──────────────────────────────────────────────────────────────────────────── */

const SIZES = {
  xs: { fontSize: 11.5, padding: "4px 9px", borderRadius: 7, minHeight: 26 },
  s: { fontSize: 12.5, padding: "6px 11px", borderRadius: 8, minHeight: 32 },
  m: { fontSize: 13.5, padding: "9px 15px", borderRadius: 10, minHeight: 38 },
  l: { fontSize: 15, padding: "12px 22px", borderRadius: 12, minHeight: 46 },
};

const KINDS = {
  primary: { border: "1px solid transparent", background: "var(--primary)", color: "#fff", fontWeight: 700 },
  record: { border: "1px solid transparent", background: "#E5484D", color: "#fff", fontWeight: 700 },
  ghost: { border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink)" },
  quiet: { border: "1px solid transparent", background: "transparent", color: "var(--ink-body)" },
  danger: { border: "1px solid #F1C4C0", background: "var(--card)", color: "var(--bad)" },
};

export const Btn = forwardRef(function Btn(
  { kind = "ghost", size = "m", icon = null, full = false, children, style, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      style={{
        display: full ? "flex" : "inline-flex",
        width: full ? "100%" : undefined,
        alignItems: "center", justifyContent: "center", gap: 7,
        fontFamily: "inherit", fontWeight: 600, whiteSpace: "nowrap", lineHeight: 1.2,
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1,
        transition: "background var(--dur-hover) var(--ease-out), border-color var(--dur-hover) var(--ease-out), transform var(--dur-press) var(--ease-out)",
        ...SIZES[size], ...KINDS[kind], ...style,
      }}
      onPointerDown={(e) => {
        if (!disabled) e.currentTarget.style.transform = "scale(0.975)";
        rest.onPointerDown?.(e);
      }}
      onPointerUp={(e) => {
        e.currentTarget.style.transform = "";
        rest.onPointerUp?.(e);
      }}
      onPointerLeave={(e) => {
        e.currentTarget.style.transform = "";
        rest.onPointerLeave?.(e);
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
  const pad = { xs: "3px 7px", s: "5px 10px", m: "7px 13px" }[size] || "7px 13px";
  const minHeight = { xs: 22, s: 30, m: 34 }[size] || 34;
  return (
    <div
      role="group"
      aria-label={label}
      style={{
        display: full ? "flex" : "inline-flex", gap: 2, padding: 2, maxWidth: "100%", flexWrap: "wrap",
        borderRadius: 10, background: "var(--paper)", border: "1px solid var(--line)",
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={on}
            title={o.title || o.label}
            onClick={() => onChange(o.value)}
            style={{
              flex: full ? "1 1 0" : undefined,
              fontSize: size === "xs" ? 11 : 12.5, fontWeight: 650, lineHeight: 1.3,
              padding: pad, minHeight, borderRadius: 8, border: "none", cursor: "pointer", whiteSpace: "nowrap",
              fontFamily: "inherit",
              // Solid ink for the chosen one, exactly as src/components/Edit/ui.js
              // does it. A tinted-background selection was legible on the dark
              // ground this started on and is nearly invisible on paper.
              background: on ? "var(--ink)" : "transparent",
              color: on ? "#fff" : "var(--ink-mute)",
              transition: "background var(--dur-hover) var(--ease-out), color var(--dur-hover) var(--ease-out)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Values
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * A labelled slider with its value shown.
 *
 * The number on the right is not decoration: every one of these sets something
 * the renderer will use — a zoom factor, a hold in seconds, a blur strength —
 * and "somewhere near the middle" is not a thing a creator can repeat on the
 * next demo.
 */
export function Slider({ label, value, min, max, step = 0.01, onChange, format, hint, disabled }) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ opacity: disabled ? 0.45 : 1 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 7 }}>
        <label htmlFor={id} style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-mute)" }}>
          {label}
        </label>
        <span style={{ fontSize: 12.5, fontWeight: 650, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
          {format ? format(value) : value}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="st-range"
        style={{ "--fill": `${pct}%` }}
      />
      {hint && <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--ink-mute)", lineHeight: 1.45 }}>{hint}</div>}
    </div>
  );
}

export function Toggle({ label, hint, checked, onChange, disabled }) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      style={{
        display: "flex", alignItems: "flex-start", gap: 11, cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.45 : 1, padding: "2px 0",
      }}
    >
      <input
        id={id}
        type="checkbox"
        checked={!!checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
      />
      <span
        aria-hidden
        style={{
          flexShrink: 0, width: 36, height: 21, marginTop: 1, borderRadius: 99,
          background: checked ? "var(--ink)" : "#D5D5D5",
          border: "1px solid", borderColor: checked ? "transparent" : "var(--line)",
          position: "relative", transition: "background var(--dur-hover) var(--ease-out)",
        }}
      >
        <span
          style={{
            position: "absolute", top: 2, left: checked ? 17 : 2, width: 15, height: 15, borderRadius: "50%",
            background: "#fff",
            transition: "left var(--dur-pop) var(--ease-out)",
          }}
        />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13, fontWeight: 620, color: "var(--ink)" }}>{label}</span>
        {hint && <span style={{ display: "block", marginTop: 3, fontSize: 11.5, color: "var(--ink-mute)", lineHeight: 1.45 }}>{hint}</span>}
      </span>
    </label>
  );
}

export function Field({ label, value, onChange, placeholder, hint, multiline, maxLength }) {
  const id = useId();
  const Tag = multiline ? "textarea" : "input";
  return (
    <div>
      {label && (
        <label htmlFor={id} style={{ display: "block", marginBottom: 6, fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-mute)" }}>
          {label}
        </label>
      )}
      <Tag
        id={id}
        value={value ?? ""}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={multiline ? 3 : undefined}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", fontFamily: "inherit", fontSize: 13.5, lineHeight: 1.5,
          padding: "9px 12px", borderRadius: 10, resize: multiline ? "vertical" : undefined,
          background: "rgba(0,0,0,.3)", border: "1px solid var(--line)", color: "var(--ink)",
          outline: "none",
        }}
        onFocus={(e) => { e.target.style.borderColor = "var(--ink)"; }}
        onBlur={(e) => { e.target.style.borderColor = "var(--line)"; }}
      />
      {hint && <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--ink-mute)", lineHeight: 1.45 }}>{hint}</div>}
    </div>
  );
}

/** A small swatch grid. Used for caption colour and the solid background. */
export function Swatches({ value, options, onChange, size = 26 }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
      {options.map((c) => {
        const on = String(value || "").toLowerCase() === c.toLowerCase();
        return (
          <button
            key={c}
            type="button"
            title={c}
            aria-pressed={on}
            onClick={() => onChange(c)}
            style={{
              width: size, height: size, borderRadius: 8, cursor: "pointer", padding: 0,
              background: c,
              border: on ? "2px solid var(--ink)" : "1px solid var(--line)",
              boxShadow: on ? "0 0 0 2px rgba(0,0,0,.5)" : "none",
            }}
          />
        );
      })}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Structure
   ──────────────────────────────────────────────────────────────────────────── */

export function Panel({ title, action, children, style }) {
  return (
    <section
      style={{
        border: "1px solid var(--line)", borderRadius: 16, background: "var(--card)",
        boxShadow: "none", overflow: "hidden", ...style,
      }}
    >
      {title && (
        <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 16px 11px", borderBottom: "1px solid var(--line)" }}>
          <h3 style={{ margin: 0, flex: 1, fontSize: 11, fontWeight: 750, letterSpacing: ".13em", textTransform: "uppercase", color: "var(--ink-mute)" }}>
            {title}
          </h3>
          {action}
        </header>
      )}
      <div style={{ padding: 16, display: "grid", gap: 15 }}>{children}</div>
    </section>
  );
}

/** A selectable row in a list of zooms, blurs, captions or steps. */
export function Row({ selected, onClick, onRemove, accent, title, sub, right, badge }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 11, padding: "9px 11px", borderRadius: 11, cursor: "pointer",
        border: "1px solid", borderColor: selected ? "var(--line-strong)" : "transparent",
        background: selected ? "var(--hover)" : hover ? "var(--hover)" : "transparent",
        transition: "background var(--dur-hover) var(--ease-out)",
      }}
    >
      {accent && <span aria-hidden style={{ flexShrink: 0, width: 3, height: 26, borderRadius: 2, background: accent }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 13, fontWeight: 620, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title}
          </span>
          {badge}
        </div>
        {sub && <div style={{ marginTop: 2, fontSize: 11.5, color: "var(--ink-mute)", fontVariantNumeric: "tabular-nums" }}>{sub}</div>}
      </div>
      {right}
      {onRemove && (
        <button
          type="button"
          title="Remove"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{
            flexShrink: 0, width: 26, height: 26, display: "grid", placeItems: "center", borderRadius: 7,
            border: "none", cursor: "pointer", fontFamily: "inherit",
            background: hover || selected ? "var(--hover)" : "transparent",
            color: hover || selected ? "var(--bad)" : "transparent",
            transition: "color var(--dur-hover) var(--ease-out)",
          }}
        >
          <Icon name="trash" size={14} />
        </button>
      )}
    </div>
  );
}

export function Badge({ children, tone = "mute" }) {
  const tones = {
    mute: { bg: "var(--hover)", fg: "var(--ink-mute)" },
    ai: { bg: "rgba(145,141,255,.16)", fg: "var(--ink)" },
    good: { bg: "rgba(116,221,176,.15)", fg: "var(--ok)" },
    warn: { bg: "#FBF5E8", fg: "var(--bad)" },
  };
  const t = tones[tone] || tones.mute;
  return (
    <span style={{ flexShrink: 0, padding: "2px 7px", borderRadius: 6, fontSize: 9.5, fontWeight: 750, letterSpacing: ".07em", textTransform: "uppercase", background: t.bg, color: t.fg }}>
      {children}
    </span>
  );
}

export function Empty({ icon = "sparkle", title, children, action }) {
  return (
    <div style={{ padding: "26px 18px", textAlign: "center", color: "var(--ink-mute)" }}>
      <div style={{ opacity: 0.5, marginBottom: 10 }}><Icon name={icon} size={22} /></div>
      <div style={{ fontSize: 13.5, fontWeight: 620, color: "var(--ink-body)" }}>{title}</div>
      {children && <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.55, maxWidth: 280, marginInline: "auto" }}>{children}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Icons
   ──────────────────────────────────────────────────────────────────────────── */

const PATHS = {
  record: <circle cx="12" cy="12" r="7" fill="currentColor" stroke="none" />,
  play: <path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" />,
  pause: <path d="M9 5v14M15 5v14" />,
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none" />,
  mic: <><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  micOff: <><path d="M9 9v3a3 3 0 0 0 4.6 2.5M15 11V6a3 3 0 0 0-5.9-.7" /><path d="M5 11a7 7 0 0 0 10.6 6M12 18v3M4 4l16 16" /></>,
  zoom: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.3-4.3M11 8.5v5M8.5 11h5" /></>,
  blur: <><circle cx="12" cy="12" r="8" strokeDasharray="2 3" /><circle cx="12" cy="12" r="3.5" /></>,
  note: <><path d="M4 5.5h16v11H12l-4 3.5v-3.5H4z" /></>,
  cursor: <path d="M6 3.5l12 7.2-5.2 1.2-2 5z" />,
  caption: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M7 14h4M14 14h3" /></>,
  canvas: <><rect x="3" y="4" width="18" height="16" rx="3" /><rect x="7" y="8" width="10" height="8" rx="1.5" /></>,
  steps: <><path d="M4 7h3v13H4zM10.5 4h3v16h-3zM17 11h3v9h-3z" /></>,
  sparkle: <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" />,
  trash: <><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  download: <><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" /><path d="M4 19h16" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  back: <path d="M15 6l-6 6 6 6" />,
  scissors: <><circle cx="7" cy="6" r="2.5" /><circle cx="7" cy="18" r="2.5" /><path d="M9 7.5L19 17M9 16.5L19 7" /></>,
  film: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M3 9h18M3 15h18M8 4v16M16 4v16" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  wand: <><path d="M4 20L15 9M17 4l.9 2.1L20 7l-2.1.9L17 10l-.9-2.1L14 7l2.1-.9z" /></>,
};

export function Icon({ name, size = 16, style }) {
  const p = PATHS[name];
  if (!p) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flexShrink: 0, display: "block", ...style }}
    >
      {p}
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Behaviour
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * A pointer drag on an element, in fractions of its own box.
 *
 * Pointer events rather than mouse events, and setPointerCapture, so a drag
 * that leaves the element — which every drag to an edge does — keeps reporting
 * instead of stopping halfway. This is used for dragging a blur rectangle onto
 * the preview, where stopping halfway means a region that does not cover the
 * thing it was drawn around.
 */
export function useDrag({ onStart, onMove, onEnd }) {
  const state = useRef(null);

  const pos = useCallback((e, el) => {
    const r = el.getBoundingClientRect();
    return {
      x: r.width ? (e.clientX - r.left) / r.width : 0,
      y: r.height ? (e.clientY - r.top) / r.height : 0,
      rect: r,
    };
  }, []);

  const down = useCallback(
    (e) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const el = e.currentTarget;
      el.setPointerCapture?.(e.pointerId);
      const p = pos(e, el);
      state.current = { el, start: p, id: e.pointerId };
      onStart?.(p, e);
      e.preventDefault();
    },
    [onStart, pos]
  );

  const move = useCallback(
    (e) => {
      const s = state.current;
      if (!s || s.id !== e.pointerId) return;
      const p = pos(e, s.el);
      onMove?.({ ...p, dx: p.x - s.start.x, dy: p.y - s.start.y, start: s.start }, e);
    },
    [onMove, pos]
  );

  const up = useCallback(
    (e) => {
      const s = state.current;
      if (!s || s.id !== e.pointerId) return;
      s.el.releasePointerCapture?.(e.pointerId);
      state.current = null;
      onEnd?.(e);
    },
    [onEnd]
  );

  return { onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up };
}

/** The size of an element, kept current. */
export function useBox(ref) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

const ui = { Btn, Segmented, Slider, Toggle, Field, Swatches, Panel, Row, Badge, Empty, Icon, useDrag, useBox }
export default ui;

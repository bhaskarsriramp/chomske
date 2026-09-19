/**
 * captionStyle.js: the caption colour and size controls, shared by both editors.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * These were written once, for the script editor's captions panel, and then the
 * demo studio needed the same thing: four swatches and a hex field, a size in
 * presets or in pixels, and the behaviour around them — a colour applies as
 * soon as six digits are in, the pixel field always shows the size actually in
 * use whether or not it was typed, arrow keys nudge it, Escape gives up.
 *
 * None of that is about captions specifically; all of it is about a creator
 * setting a colour and a size without losing their place. Copying it into the
 * studio would have meant two versions drifting apart, and the studio is the
 * product where a founder styles a caption and then goes to Edit Videos and
 * finds the same control behaving differently. So it moved here, and both
 * import it.
 *
 * What is NOT here is the LOOK picker. The two products have genuinely
 * different caption looks — the script editor draws Bold, Clean and Box; the
 * studio draws TryLipi, Hormozi, Apple, Minimal and Neon — so each one renders
 * its own tiles. Everything else is this file.
 */
import { useEffect, useState } from "react";
import { Segmented } from "./ui";

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/**
 * Bright enough to read over any shot, with the outline or box behind them.
 * Anything else is typed as hex — offering a full colour wheel here produces
 * mid-grey captions on grey screenshots, every time.
 */
export const CAPTION_COLORS = [
  ["#FFFFFF", "White"],
  ["#FFD400", "Yellow"],
  ["#FF8A1F", "Orange"],
  ["#FF3B30", "Red"],
];

export const SIZE_PRESETS = [
  { value: "s", label: "S", title: "Small" },
  { value: "m", label: "M", title: "Medium" },
  { value: "l", label: "L", title: "Large" },
];

export const HEX = /^#[0-9a-f]{6}$/i;

/** The four colours, and a hex code for any other. */
export function ColorPicker({ value, onChange, keyId = "all", compact = false }) {
  const d = compact ? 16 : 30;
  return (
    <div
      role="group"
      aria-label="Caption color"
      style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap", gap: compact ? 6 : 10, flexShrink: 0 }}
    >
      {CAPTION_COLORS.map(([hex, name]) => {
        const on = String(value || "").toUpperCase() === hex;
        return (
          <button
            key={hex}
            type="button"
            aria-label={name}
            aria-pressed={on}
            title={name}
            onClick={() => onChange(hex)}
            style={{
              width: d, height: d, borderRadius: "50%", padding: 0, cursor: "pointer", background: hex, flexShrink: 0,
              border: "1px solid rgba(0,0,0,.2)",
              boxShadow: on
                ? `0 0 0 2px ${compact ? "var(--card)" : "var(--paper)"}, 0 0 0 ${compact ? 3.5 : 4}px var(--ink)`
                : "none",
            }}
          />
        );
      })}
      <HexInput value={value} compact={compact} onChange={(hex) => onChange(hex, `color:${keyId}`)} />
    </div>
  );
}

/** "#" is fixed; only the six digits are typed. A colour applies once all six are in. */
export function HexInput({ value, onChange, compact }) {
  const code = String(value || "#FFFFFF").slice(1).toUpperCase();
  const [draft, setDraft] = useState(code);
  const [focus, setFocus] = useState(false);
  useEffect(() => { setDraft(code); }, [code]);
  const fs = compact ? 11.5 : 13;
  return (
    <label
      title="Hex color"
      style={{
        display: "inline-flex", alignItems: "center", gap: 2, height: compact ? 26 : 34, padding: compact ? "0 6px" : "0 9px",
        borderRadius: compact ? 6 : 8, border: `1px solid ${focus ? "var(--ink)" : "var(--line)"}`,
        background: "var(--card)", cursor: "text", flexShrink: 0,
      }}
    >
      {!compact && (
        <span
          aria-hidden="true"
          style={{ width: 14, height: 14, borderRadius: 4, background: value, border: "1px solid rgba(0,0,0,.2)", marginRight: 5 }}
        />
      )}
      <span aria-hidden="true" style={{ fontSize: fs, color: "var(--ink-mute)", fontFamily: MONO }}>#</span>
      <input
        value={draft}
        maxLength={6}
        spellCheck={false}
        autoComplete="off"
        aria-label="Hex color code"
        onFocus={() => setFocus(true)}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6).toUpperCase();
          setDraft(v);
          if (v.length === 6 && v !== code) onChange(`#${v}`);
        }}
        onBlur={() => { setFocus(false); setDraft(code); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur(); }}
        style={{
          width: "6.3ch", border: "none", outline: "none", padding: 0, background: "transparent",
          color: "var(--ink)", fontSize: fs, fontWeight: 600, fontFamily: MONO,
        }}
      />
    </label>
  );
}

/**
 * S, M, L, or pixels.
 *
 * `px` is the size actually in use — whether it came from a preset or was
 * typed — so the field never goes blank and never disagrees with the picture.
 * `min`/`max` are passed because the two products measure caption pixels
 * against different reference frames.
 */
export function SizePicker({ size, px, onPreset, onPx, min = 8, max = 48, compact = false }) {
  const own = px !== null && px !== undefined;
  return (
    <div role="group" aria-label="Caption size" style={{ display: "inline-flex", alignItems: "center", gap: compact ? 4 : 8, flexShrink: 0 }}>
      <Segmented
        size={compact ? "xs" : "s"}
        label="Size preset"
        value={own ? null : size}
        onChange={onPreset}
        options={SIZE_PRESETS}
      />
      <PxInput value={px} min={min} max={max} compact={compact} onChange={onPx} />
    </div>
  );
}

export function PxInput({ value, onChange, min = 8, max = 48, compact }) {
  const [draft, setDraft] = useState(String(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => { setDraft(String(value)); }, [value]);
  const fit = (n) => Math.min(max, Math.max(min, n));
  const commit = () => {
    const n = parseInt(draft, 10);
    const px = Number.isFinite(n) ? fit(n) : value;
    if (px !== value) onChange(px);
    setDraft(String(px));
  };
  const fs = compact ? 11.5 : 13;
  const digits = String(max).length;
  return (
    <label
      title={`Size in pixels, ${min} to ${max}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 2, height: compact ? 26 : 36, padding: compact ? "0 6px" : "0 9px",
        borderRadius: compact ? 6 : 8, border: `1px solid ${focus ? "var(--ink)" : "var(--line)"}`,
        background: "var(--card)", cursor: "text", flexShrink: 0,
      }}
    >
      <input
        value={draft}
        inputMode="numeric"
        maxLength={digits}
        aria-label="Caption size in pixels"
        onFocus={(e) => { setFocus(true); e.target.select(); }}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, digits);
          setDraft(v);
          const n = parseInt(v, 10);
          if (n >= min && n <= max && n !== value) onChange(n);
        }}
        onBlur={() => { setFocus(false); commit(); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
          else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const n = fit((parseInt(draft, 10) || value) + (e.key === "ArrowUp" ? 1 : -1));
            setDraft(String(n));
            if (n !== value) onChange(n);
          }
        }}
        style={{
          width: `${digits + 0.2}ch`, textAlign: "right", border: "none", outline: "none", padding: 0,
          background: "transparent", color: "var(--ink)", fontSize: fs, fontWeight: 600,
          fontFamily: "inherit", fontVariantNumeric: "tabular-nums",
        }}
      />
      <span aria-hidden="true" style={{ fontSize: fs, color: "var(--ink-mute)" }}>px</span>
    </label>
  );
}

const captionStyle = { CAPTION_COLORS, SIZE_PRESETS, HEX, ColorPicker, HexInput, SizePicker, PxInput };
export default captionStyle;

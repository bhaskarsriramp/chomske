import { useState, useEffect, useRef, useCallback } from "react";

/**
 * The teleprompter.
 *
 * ── IT IS READ FROM ACROSS A ROOM, NOT FROM A DESK ───────────────────────────
 * Everything here follows from that. The type is far larger than anywhere else
 * in the product, the ground is near-black so a phone propped beside a lens is
 * not a lamp pointed at the creator's face, and the controls shrink out of the
 * way once scrolling starts, because a creator who is recording cannot reach
 * over and dismiss a toolbar.
 *
 * ── WHY SIZE IS A CONTROL AND NOT A BREAKPOINT ───────────────────────────────
 * Reading distance is not something the viewport can tell us. The same phone is
 * held at arm's length on a tripod and at thirty centimetres on a desk, and the
 * right type size differs by a factor of two between those. So the size is
 * adjustable and remembered, seeded from the screen width only as a first
 * guess.
 *
 * ── AND WHY THE SCROLL IS MANUAL BY DEFAULT ──────────────────────────────────
 * Auto-scroll at a fixed rate fights the person reading: nobody delivers at a
 * constant pace, and a prompter that runs away is worse than no prompter. It is
 * offered, off by default, at a speed derived from the creator's own measured
 * words-per-second rather than a generic rate, so when it is switched on it is
 * at least starting from their real pace.
 */
export default function Teleprompter({ lines = [], script, onClose }) {
  const [size, setSize] = useState(() => (window.innerWidth < 700 ? 30 : 40));
  const [playing, setPlaying] = useState(false);
  const [mirror, setMirror] = useState(false);
  const [chrome, setChrome] = useState(true);

  const scrollerRef = useRef(null);
  const rafRef = useRef(null);
  const hideRef = useRef(null);

  const wps = script?.shoot_pack?.words_per_second || 2.6;

  // Escape leaves. Space toggles the scroll, because that is the key a hand
  // already resting on a laptop finds without looking.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { onClose?.(); return; }
      if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Try for real fullscreen. Refused in some browsers and on iOS Safari, which
  // is why the overlay is already fixed and full-bleed on its own: fullscreen
  // is an improvement here, never the thing that makes it work.
  useEffect(() => {
    const el = document.documentElement;
    el.requestFullscreen?.().catch(() => {});
    return () => { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); };
  }, []);

  // Auto-scroll. Pixels per second derived from the creator's own pace against
  // the rendered line height, so the text moves at roughly the speed they will
  // actually say it.
  useEffect(() => {
    if (!playing) return undefined;
    const node = scrollerRef.current;
    if (!node) return undefined;

    const pxPerSecond = (wps / 2.6) * (size * 0.62);
    let last = performance.now();
    let carry = 0;

    const step = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      carry += pxPerSecond * dt;
      const whole = Math.floor(carry);
      if (whole > 0) { node.scrollTop += whole; carry -= whole; }
      if (node.scrollTop + node.clientHeight >= node.scrollHeight - 2) setPlaying(false);
      else rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, size, wps]);

  // The bar fades out while reading and comes back on any touch or move, so it
  // is never in the way and never unreachable.
  const wake = useCallback(() => {
    setChrome(true);
    clearTimeout(hideRef.current);
    hideRef.current = setTimeout(() => setChrome(false), 2600);
  }, []);
  useEffect(() => { wake(); return () => clearTimeout(hideRef.current); }, [wake]);

  const btn = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
    height: 38, padding: "0 13px", borderRadius: 10, border: "1px solid #2C3237",
    background: "#191D21", color: "#E8ECEF", fontSize: 13, fontWeight: 600,
    cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Teleprompter"
      onMouseMove={wake}
      onTouchStart={wake}
      style={{
        position: "fixed", inset: 0, zIndex: 320,
        background: "#0C0E10", display: "flex", flexDirection: "column",
      }}
    >
      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute", left: 0, right: 0, top: 0, zIndex: 2,
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          padding: "10px 12px",
          background: "linear-gradient(180deg, rgba(12,14,16,.96), rgba(12,14,16,0))",
          opacity: chrome ? 1 : 0,
          pointerEvents: chrome ? "auto" : "none",
          transition: "opacity .25s ease",
        }}
      >
        <button onClick={() => setPlaying((p) => !p)} style={{ ...btn, background: playing ? "#E8ECEF" : "#191D21", color: playing ? "#0C0E10" : "#E8ECEF" }}>
          {playing ? "Pause" : "Scroll"}
        </button>

        <div style={{ display: "inline-flex", alignItems: "center", gap: 0, border: "1px solid #2C3237", borderRadius: 10, overflow: "hidden" }}>
          <button onClick={() => setSize((s) => Math.max(20, s - 4))} aria-label="Smaller text" style={{ ...btn, border: "none", borderRadius: 0, height: 36 }}>A−</button>
          <span style={{ color: "#7C858C", fontSize: 12, padding: "0 8px", fontVariantNumeric: "tabular-nums", minWidth: 34, textAlign: "center" }}>{size}</span>
          <button onClick={() => setSize((s) => Math.min(80, s + 4))} aria-label="Larger text" style={{ ...btn, border: "none", borderRadius: 0, height: 36 }}>A+</button>
        </div>

        {/* For creators shooting through a beam-splitter rig. Cheap to offer,
            and the ones who need it have no other way to get it. */}
        <button onClick={() => setMirror((m) => !m)} style={{ ...btn, color: mirror ? "#7FE3F0" : "#E8ECEF" }} aria-pressed={mirror}>
          Mirror
        </button>

        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={onClose} style={btn}>Done</button>
        </span>
      </div>

      {/* ── The script ───────────────────────────────────────────────────── */}
      <div
        ref={scrollerRef}
        className="hg-scroll"
        onClick={() => setPlaying((p) => !p)}
        style={{
          flex: 1, minHeight: 0, overflowY: "auto",
          transform: mirror ? "scaleX(-1)" : "none",
          padding: "72px 0 60vh",
          cursor: "pointer",
        }}
      >
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 clamp(16px, 5vw, 56px)" }}>
          {lines.length === 0 && (
            <p style={{ color: "#7C858C", fontSize: 16 }}>Nothing to read.</p>
          )}
          {lines.map((l) => (
            <div key={l.n} style={{ padding: `${Math.round(size * 0.34)}px 0` }}>
              <span
                className="indic"
                style={{
                  display: "block",
                  fontSize: size,
                  lineHeight: 1.46,
                  color: "#F4F7F8",
                  fontWeight: 500,
                  letterSpacing: "-.005em",
                }}
              >
                {l.text}
              </span>
              {l.cue && (
                <span
                  style={{
                    display: "block", marginTop: Math.round(size * 0.22),
                    fontSize: Math.max(12, Math.round(size * 0.38)),
                    fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase",
                    color: "#5BD6E6",
                  }}
                >
                  ▸ Shot {l.shot || "•"}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* One line of help, on the same fade as the bar. */}
      <div
        style={{
          position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 2,
          padding: "10px 14px 14px", textAlign: "center",
          fontSize: 12, color: "#6B7379",
          background: "linear-gradient(0deg, rgba(12,14,16,.96), rgba(12,14,16,0))",
          opacity: chrome ? 1 : 0, pointerEvents: "none", transition: "opacity .25s ease",
        }}
      >
        Tap anywhere to start or stop scrolling
      </div>
    </div>
  );
}

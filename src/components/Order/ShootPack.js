import { useState, useEffect, useCallback, useRef } from "react";
import api, { errorMessage } from "../../api";
import useIsMobile from "../../hooks/useIsMobile";
import Skeleton from "../Shell/Skeleton";
import { useCredits } from "../../state/CreditsContext";
import Teleprompter from "./Teleprompter";
import ScriptToggle from "./ScriptToggle";

/**
 * The shoot pack: what turns a finished script into something recordable.
 *
 * ── WHY IT COVERS THE APP INSTEAD OF SITTING UNDER THE SCRIPT ────────────────
 * This is read while setting up a shoot, not while browsing. A creator has the
 * phone propped up, a light on, and about four seconds of patience for finding
 * which line the cutaway belongs to. Anything competing for that screen is in
 * the way, so the pack takes the whole of it and gives one control back: close.
 *
 * ── THE ORDER OF THE THREE BLOCKS IS THE ORDER OF THE JOB ────────────────────
 * Have ready comes FIRST on a phone, before the script. It is the only part
 * that has to be done before sitting down, and burying a checklist under a
 * sixty-line script means it gets read after the camera is already rolling. On
 * a desktop the script and the rail sit side by side, because there the whole
 * thing fits at once and reading order stops mattering.
 */
export default function ShootPack({ script, roman: romanInitial = false, onClose, onUpdated }) {
  const isPhone = useIsMobile(860);
  const { setBalance, refresh: refreshCredits } = useCredits();

  const [pack, setPack] = useState(script.shoot_pack || null);
  const [state, setState] = useState(script.shoot_pack ? "ready" : "idle");
  const [error, setError] = useState("");
  const [price, setPrice] = useState(null);
  const [done, setDone] = useState({});      // B-roll items ticked off
  const [prompting, setPrompting] = useState(false);

  /**
   * Reading the lines in Roman letters rather than their own script.
   *
   * Seeded from whatever the creator had selected on the script card, because
   * that choice was a statement about how they read, not about that card. See
   * the `view` state in ScriptPanel.
   *
   * It governs the line list AND the teleprompter, which is why it lives up
   * here rather than inside either. The prompter is the screen that actually
   * matters for this: it is read at speed, from a distance, mid-take, and it is
   * the one place where being handed the slower alphabet costs a retake.
   */
  const [roman, setRoman] = useState(!!romanInitial);

  const closeRef = useRef(null);

  // Escape closes, and focus lands on the close control, so a keyboard user is
  // not dropped into a full-screen overlay with no way out but the mouse.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !prompting) onClose?.(); };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, prompting]);

  // The page behind must not scroll while this is over it.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const build = useCallback(async () => {
    setState("building");
    setError("");
    try {
      const { data } = await api.post(`/script/${script.id}/shoot`);
      setPack(data.shoot_pack);
      setState("ready");
      if (typeof data.balance === "number") setBalance(data.balance);
      refreshCredits();
      onUpdated?.({ shoot_pack: data.shoot_pack });
    } catch (err) {
      if (err?.response?.status === 402) {
        setPrice(err.response.data?.needed ?? null);
        setError(err.response.data?.message || "Not enough credits for a shoot pack.");
      } else {
        setError(errorMessage(err, "Couldn't build the shoot pack."));
      }
      setState("idle");
    }
  }, [script.id, setBalance, refreshCredits, onUpdated]);

  const lines = pack?.lines || [];

  /**
   * Whether a Roman view can be offered here at all.
   *
   * Stricter than the script card's test, which only needs `roman_text` to
   * exist. A pack carries the transliteration split line by line, and the
   * server sets `has_roman` only when that split produced exactly one Roman
   * line per script line (see buildShootPack). Anything less and the toggle
   * stays hidden: a whole-script view that reads a little loosely is fine, but
   * a prompter showing line 7's words under line 6's timecode and shot number
   * is a ruined take.
   *
   * False for every pack built before Roman existed, which is correct. Those
   * hold no Roman lines to show.
   */
  const canRoman = !!pack?.has_roman;
  const showRoman = canRoman && roman;

  const shots = pack?.shots || [];
  const broll = pack?.broll || [];
  const held = pack?.held || [];
  const doneCount = broll.filter((_, i) => done[i]).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Shoot pack"
      style={{
        position: "fixed", inset: 0, zIndex: 260,
        background: "var(--paper)", display: "flex", flexDirection: "column",
      }}
    >
      {/* ── Bar ──────────────────────────────────────────────────────────── */}
      <header
        style={{
          flexShrink: 0, display: "flex", alignItems: "center", gap: 10,
          padding: isPhone ? "11px 14px" : "13px 22px",
          borderBottom: "1px solid var(--line)", background: "var(--card)",
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: isPhone ? 15 : 16.5, fontWeight: 700, letterSpacing: "-.02em", color: "var(--ink)", lineHeight: 1.25 }}>
            B-roll and shot list
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {script.headline || "Your script"}
          </div>
        </div>

        {/* Sits before the prompter button, because it decides what the
            prompter will show and a control should come before the thing it
            governs. Renders nothing when this pack has no aligned Roman. */}
        <ScriptToggle
          value={showRoman ? "roman" : "native"}
          onChange={(v) => setRoman(v === "roman")}
          nativeLabel={script.language_label}
          hasRoman={canRoman}
          hasEnglish={false}
        />

        {pack && (
          <button
            onClick={() => setPrompting(true)}
            className="hg-btn-primary"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0,
              fontSize: 13, fontWeight: 650, padding: isPhone ? "9px 13px" : "9px 16px",
              borderRadius: 10, border: "none", background: "var(--primary)",
              color: "#fff", cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2.5" y="4" width="19" height="13" rx="2" /><path d="M8 21h8" />
            </svg>
            {isPhone ? "Prompter" : "Teleprompter"}
          </button>
        )}

        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Close"
          style={{
            flexShrink: 0, width: 36, height: 36, display: "grid", placeItems: "center",
            borderRadius: 10, border: "1px solid var(--line)", background: "var(--card)",
            color: "var(--ink-body)", cursor: "pointer",
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="hg-scroll" style={{ flex: 1, minHeight: 0 }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: isPhone ? "16px 14px 60px" : "22px 22px 80px" }}>

          {state === "idle" && !pack && (
            <Intro isPhone={isPhone} onBuild={build} error={error} price={price} />
          )}

          {state === "building" && <BuildingSkeleton isPhone={isPhone} />}

          {pack && (
            <div
              style={{
                display: "grid", gap: isPhone ? 14 : 18,
                gridTemplateColumns: isPhone ? "1fr" : "minmax(0,1fr) 330px",
                alignItems: "start",
              }}
            >
              {/* On a phone the checklist is FIRST: it is the only part that
                  must happen before recording. Source order does the work, so
                  there is no ordering hack to unwind at the wider breakpoint. */}
              {isPhone && (
                <Ready broll={broll} done={done} setDone={setDone} doneCount={doneCount} isPhone />
              )}

              <ScriptLines lines={lines} isPhone={isPhone} roman={showRoman} />

              <div style={{ display: "grid", gap: isPhone ? 14 : 18, position: isPhone ? "static" : "sticky", top: 0 }}>
                {!isPhone && (
                  <Ready broll={broll} done={done} setDone={setDone} doneCount={doneCount} />
                )}
                <Shots shots={shots} />
                {held.length > 0 && <Held held={held} />}
              </div>
            </div>
          )}

        </div>
      </div>

      {prompting && (
        <Teleprompter
          lines={lines}
          roman={showRoman}
          script={script}
          onClose={() => setPrompting(false)}
        />
      )}
    </div>
  );
}

/* ── Before it is bought ──────────────────────────────────────────────────── */

function Intro({ isPhone, onBuild, error, price }) {
  return (
    <div style={{ maxWidth: 560, margin: isPhone ? "10px auto" : "40px auto", textAlign: "center" }}>
      <h2 style={{ fontSize: isPhone ? 21 : 25, fontWeight: 800, letterSpacing: "-.03em", color: "var(--ink)", margin: "0 0 10px" }}>
        Make this script shootable
      </h2>
      <p style={{ fontSize: isPhone ? 14.5 : 15.5, lineHeight: 1.65, color: "var(--ink-body)", margin: "0 0 6px" }}>
        We time every line to the pace you actually speak at, find the places you
        already point at something on screen, and turn those into a shot list with
        the footage to have ready first.
      </p>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink-mute)", margin: "0 0 22px" }}>
        Built once. Opening it again is free.
      </p>

      <button
        onClick={onBuild}
        className="hg-btn-primary"
        style={{
          fontSize: 14.5, fontWeight: 650, padding: "12px 24px", borderRadius: 11,
          border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer",
        }}
      >
        Build the shoot pack{price ? ` · ${price} credits` : ""}
      </button>

      {error && (
        <div role="alert" style={{ marginTop: 16, fontSize: 13.5, color: "#C0392B", lineHeight: 1.6 }}>
          {error}
        </div>
      )}
    </div>
  );
}

function BuildingSkeleton({ isPhone }) {
  return (
    <div style={{ display: "grid", gap: isPhone ? 14 : 18, gridTemplateColumns: isPhone ? "1fr" : "minmax(0,1fr) 330px" }}>
      <div style={panel}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line-soft, var(--line))" }}>
          <Skeleton variant="text" width={120} height={11} />
        </div>
        <div style={{ padding: "10px 16px", display: "grid", gap: 14 }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "46px 1fr", gap: 12 }}>
              <Skeleton variant="text" height={12} />
              <Skeleton variant="text" width={i % 2 ? "76%" : "92%"} height={14} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ ...panel, padding: 16 }}>
          <Skeleton variant="text" width={96} height={11} />
          <div style={{ height: 12 }} />
          <Skeleton variant="rectangular" height={58} />
          <div style={{ height: 8 }} />
          <Skeleton variant="rectangular" height={58} />
        </div>
      </div>
    </div>
  );
}

/* ── The three blocks ─────────────────────────────────────────────────────── */

function ScriptLines({ lines, isPhone, roman = false }) {
  return (
    <section style={panel}>
      <Head title="Script" right={`${lines.length} lines`} />
      {/* Keyed on the alphabet so switching replaces the list rather than
          mutating sixty text nodes in place, which is what stops a long script
          from visibly re-flowing line by line as it swaps. */}
      <div key={roman ? "roman" : "native"}>
        {lines.map((l) => (
          <div
            key={l.n}
            style={{
              display: "grid",
              gridTemplateColumns: isPhone ? "44px 1fr" : "52px 26px 1fr",
              gap: isPhone ? "0 10px" : "0 12px",
              padding: isPhone ? "9px 14px" : "10px 16px",
              alignItems: "baseline",
              borderTop: "1px solid var(--line)",
              background: l.cue ? "var(--made-tint)" : "transparent",
            }}
          >
            <span style={mono}>{fmt(l.at)}</span>
            {!isPhone && <span style={{ ...mono, textAlign: "right" }}>{l.n}</span>}
            {/* `indic` selects the Noto Indic stack, which a Roman line has no
                use for: it is Latin text and would land in a fallback face. */}
            <span className={roman ? undefined : "indic"} style={{ fontSize: isPhone ? 15.5 : 16, lineHeight: 1.7, color: "var(--ink)" }}>
              {roman ? (l.roman || l.text) : l.text}
              {l.cue && (
                <span
                  style={{
                    display: "inline-flex", alignItems: "center", marginLeft: 7,
                    fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
                    padding: "3px 7px", borderRadius: 5, whiteSpace: "nowrap",
                    background: "var(--made)", color: "#fff", verticalAlign: "middle",
                  }}
                >
                  Shot {l.shot || "•"}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Shots({ shots }) {
  return (
    <section style={panel}>
      <Head title="Shot list" right={`${shots.length} shot${shots.length === 1 ? "" : "s"}`} />
      {shots.length === 0 && <Empty>No cutaways. This one is straight to camera.</Empty>}
      {shots.map((s) => (
        <div key={s.n} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0 12px", padding: "12px 16px", borderTop: "1px solid var(--line)" }}>
          <span
            style={{
              ...mono, color: "#fff", background: "var(--ink)", borderRadius: 5,
              padding: "3px 6px", height: "fit-content", fontWeight: 600,
            }}
          >
            {String(s.n).padStart(2, "0")}
          </span>
          <div style={{ minWidth: 0 }}>
            <span style={{ ...mono, display: "block", marginBottom: 3 }}>{fmt(s.from)} – {fmt(s.to)}</span>
            <div style={{ fontSize: 14, fontWeight: 650, letterSpacing: "-.01em", lineHeight: 1.4, color: "var(--ink)" }}>{s.what}</div>
            {s.source && <div style={{ fontSize: 12.5, color: "var(--ink-body)", lineHeight: 1.5, marginTop: 3 }}>{s.source}</div>}
            {s.phrase && (
              <div className="indic" style={{ fontSize: 12.5, color: "var(--ink-mute)", lineHeight: 1.5, marginTop: 3 }}>
                Line {s.line}, “{s.phrase}”
              </div>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

function Ready({ broll, done, setDone, doneCount, isPhone }) {
  if (!broll.length) return null;
  return (
    <section style={panel}>
      <Head title="Have ready" right={`${doneCount} / ${broll.length}`} />
      {broll.map((b, i) => {
        const on = !!done[i];
        return (
          <div
            key={b.item + i}
            role="checkbox"
            aria-checked={on}
            tabIndex={0}
            onClick={() => setDone((d) => ({ ...d, [i]: !d[i] }))}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                setDone((d) => ({ ...d, [i]: !d[i] }));
              }
            }}
            style={{
              display: "flex", gap: 11, alignItems: "flex-start", cursor: "pointer",
              padding: isPhone ? "12px 14px" : "11px 16px", borderTop: "1px solid var(--line)",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 19, height: 19, borderRadius: 6, flexShrink: 0, marginTop: 1,
                display: "grid", placeItems: "center",
                border: `1.5px solid ${on ? "var(--made)" : "var(--line)"}`,
                background: on ? "var(--made)" : "var(--paper)",
              }}
            >
              {on && (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12.5l5.5 5.5L20 6.5" />
                </svg>
              )}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 13.5, lineHeight: 1.5, color: on ? "var(--ink-mute)" : "var(--ink)", textDecoration: on ? "line-through" : "none" }}>
                {b.item}
              </span>
              {b.note && <span style={{ ...mono, display: "block", marginTop: 2 }}>{b.note}</span>}
            </span>
          </div>
        );
      })}
    </section>
  );
}

/**
 * The cues we did not use.
 *
 * Kept visible rather than silently dropped. These are the creator's own
 * phrases, and seeing that we held back "look at the phone in my hand" because
 * this script came from news coverage rather than a review unit is the clearest
 * proof on the screen that the cues are theirs and not invented.
 */
function Held({ held }) {
  return (
    <section
      style={{
        border: "1px solid var(--warn-line, #EFD9A8)", borderRadius: "var(--radius)",
        background: "var(--warn-tint, #FDF5E7)", padding: "14px 16px",
      }}
    >
      <div style={{ ...mono, fontWeight: 600, color: "var(--warn-ink, #8A5A0F)", marginBottom: 8 }}>
        {held.length} of your cues held back
      </div>
      <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--ink-body)", margin: "0 0 10px" }}>
        Your own phrases, but they only work with the product in front of you.
        This script was written from coverage, not a review unit.
      </p>
      {held.map((h, i) => (
        <div key={i} style={{ paddingTop: 8, borderTop: "1px solid var(--warn-line, #EFD9A8)" }}>
          <span className="indic" style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--ink)" }}>“{h.phrase}”</span>
          <span style={{ display: "block", fontSize: 11.5, color: "var(--warn-ink, #8A5A0F)", marginTop: 2 }}>{h.why}</span>
        </div>
      ))}
    </section>
  );
}

/* ── Bits ─────────────────────────────────────────────────────────────────── */

function Head({ title, right }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, padding: "13px 16px" }}>
      <span style={{ ...mono, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase" }}>{title}</span>
      <span style={mono}>{right}</span>
    </div>
  );
}

function Empty({ children }) {
  return (
    <div style={{ padding: "14px 16px", borderTop: "1px solid var(--line)", fontSize: 13, color: "var(--ink-mute)", lineHeight: 1.6 }}>
      {children}
    </div>
  );
}

function fmt(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const panel = {
  background: "var(--card)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius)",
  overflow: "hidden",
};

const mono = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 11.5,
  color: "var(--ink-mute)",
  fontVariantNumeric: "tabular-nums",
};

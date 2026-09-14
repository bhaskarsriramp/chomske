import { useState } from "react";
import Skeleton from "../Shell/Skeleton";

/**
 * The B-roll plan: the script, line by line, with each cutaway sitting under
 * the line that calls for it. Rendered inside the script card (ScriptCard.js).
 *
 * ── WHY IT IS THE FIRST THING A FINISHED SCRIPT SHOWS ────────────────────────
 * A page of paragraphs looks like every other script tool. The same script,
 * timed to the creator's own pace, with the footage named under the exact line
 * where they already say "look at this", is the moment it reads as written by
 * somebody who knows how they make videos. So the card opens here, and the
 * paragraphs are one tab away.
 *
 * ── ONE COLUMN, INTERLEAVED, AT EVERY WIDTH ──────────────────────────────────
 * This used to be a full-screen overlay with the lines on the left and the shot
 * list in a rail on the right, joined by "Line 4" labels the reader had to match
 * up by eye. A side pane or a phone has no room for a rail, and the matching was
 * the hard part anyway. A shot now sits directly under its line, so where it
 * belongs is where it is, and the layout needs no breakpoint to survive a phone.
 *
 * ── THE ORDER IS STILL THE ORDER OF THE JOB ──────────────────────────────────
 * Have ready comes first. It is the only part that has to be done before the
 * camera rolls, and under a sixty-line script it would be read after.
 *
 * @param {"building"|"failed"|"priced"|"idle"} status  only read while `pack`
 *   is null: what the card is doing about the missing plan.
 */
export default function ShootPack({
  pack, status, error = "", price = null, roman = false, narrow = false,
  onRetry, onConfirm, onReadScript,
}) {
  const [done, setDone] = useState({});   // Have-ready items ticked off

  const pad = narrow ? "14px 14px 18px" : "18px 20px 22px";

  if (!pack) {
    if (status === "priced") {
      return <Offer pad={pad} price={price} error={error} onConfirm={onConfirm} onReadScript={onReadScript} />;
    }
    if (status === "failed") {
      return <Failed pad={pad} error={error} onRetry={onRetry} onReadScript={onReadScript} />;
    }
    return <Building pad={pad} narrow={narrow} />;
  }

  const lines = pack.lines || [];
  const shots = pack.shots || [];
  const broll = pack.broll || [];
  const held = pack.held || [];

  const shotsByLine = new Map();
  for (const s of shots) shotsByLine.set(s.line, [...(shotsByLine.get(s.line) || []), s]);

  const timeCol = narrow ? 40 : 48;

  return (
    <div className="hg-fade" style={{ padding: pad }}>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink-mute)", margin: "0 0 14px" }}>
        {shots.length
          ? `Your script, shot by shot, timed to how fast you speak. ${shots.length} shot${shots.length === 1 ? "" : "s"} over ${fmt(pack.total_seconds)}.`
          : "Your script, timed to how fast you speak. No cutaways: this one is straight to camera."}
      </p>

      {broll.length > 0 && <Ready broll={broll} done={done} setDone={setDone} />}

      {/* Keyed on the alphabet so switching replaces the list rather than
          mutating sixty text nodes in place, which is what stops a long script
          visibly re-flowing line by line as it swaps. */}
      <ol key={roman ? "roman" : "native"} style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {lines.map((l, i) => (
          <li
            key={l.n}
            style={{
              display: "grid",
              gridTemplateColumns: `${timeCol}px minmax(0, 1fr)`,
              columnGap: narrow ? 10 : 14,
              alignItems: "baseline",
              padding: narrow ? "10px 0" : "11px 0",
              borderTop: i ? "1px solid var(--line)" : "none",
            }}
          >
            <span style={mono}>{fmt(l.at)}</span>
            <div style={{ minWidth: 0 }}>
              {/* `indic` selects the Noto Indic stack, which a Roman line has
                  no use for: it is Latin text and would land in a fallback. */}
              <div
                className={roman ? undefined : "indic"}
                style={{ fontSize: narrow ? 15.5 : 16, lineHeight: 1.65, color: "var(--ink)", wordBreak: "break-word" }}
              >
                {roman ? (l.roman || l.text) : l.text}
              </div>
              {(shotsByLine.get(l.n) || []).map((s) => <Shot key={s.n} shot={s} />)}
            </div>
          </li>
        ))}
      </ol>

      {held.length > 0 && <Held held={held} />}
    </div>
  );
}

/* ── The pieces of a plan ─────────────────────────────────────────────────── */

function Shot({ shot }) {
  return (
    <div
      style={{
        display: "flex", gap: 10, alignItems: "flex-start",
        marginTop: 8, padding: "9px 12px", borderRadius: 10,
        background: "var(--made-tint)",
        // Reset first, then the accent edge. React writes these in key order.
        border: "1px solid var(--made-line)", borderLeft: "3px solid var(--made)",
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--made)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }}>
        <path d="M3 7h13v10H3zM16 10l5-3v10l-5-3" />
      </svg>
      <div style={{ minWidth: 0 }}>
        <div style={{ ...mono, fontSize: 10.5, fontWeight: 600, letterSpacing: ".07em", textTransform: "uppercase" }}>
          Shot {shot.n} · {fmt(shot.from)}–{fmt(shot.to)}
        </div>
        <div style={{ fontSize: 14, fontWeight: 650, letterSpacing: "-.01em", lineHeight: 1.4, color: "var(--ink)", marginTop: 2 }}>
          {shot.what}
        </div>
        {shot.source && (
          <div style={{ fontSize: 12.5, color: "var(--ink-body)", lineHeight: 1.5, marginTop: 2 }}>{shot.source}</div>
        )}
      </div>
    </div>
  );
}

function Ready({ broll, done, setDone }) {
  const count = broll.filter((_, i) => done[i]).length;
  const toggle = (i) => setDone((d) => ({ ...d, [i]: !d[i] }));

  return (
    <section
      style={{
        border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden",
        background: "var(--card)", marginBottom: 12,
      }}
    >
      <div
        style={{
          display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10,
          padding: "9px 13px", background: "var(--paper)", borderBottom: "1px solid var(--line)",
        }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 650, color: "var(--ink)" }}>Have these ready before you record</span>
        <span style={mono}>{count} / {broll.length}</span>
      </div>
      {broll.map((b, i) => {
        const on = !!done[i];
        return (
          <div
            key={b.item + i}
            role="checkbox"
            aria-checked={on}
            tabIndex={0}
            onClick={() => toggle(i)}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(i); }
            }}
            style={{
              display: "flex", gap: 11, alignItems: "flex-start", cursor: "pointer",
              padding: "10px 13px", borderTop: i ? "1px solid var(--line)" : "none",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 19, height: 19, borderRadius: 6, flexShrink: 0, marginTop: 1,
                display: "grid", placeItems: "center",
                border: `1.5px solid ${on ? "var(--made)" : "#C6C6C6"}`,
                background: on ? "var(--made)" : "var(--card)",
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
              {b.note && <span style={{ ...mono, display: "block", marginTop: 2, lineHeight: 1.5 }}>{b.note}</span>}
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
        marginTop: 16, padding: "12px 14px", borderRadius: 10,
        border: "1px solid var(--warn-line, #EFD9A8)", background: "var(--warn-tint, #FDF5E7)",
      }}
    >
      <div style={{ fontSize: 12.5, fontWeight: 650, color: "var(--warn-ink, #8A5A0F)", marginBottom: 4 }}>
        {held.length} of your phrases held back
      </div>
      <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--ink-body)", margin: "0 0 8px" }}>
        They only work with the product in front of you, and this script was
        written from coverage, not a review unit.
      </p>
      {held.map((h, i) => (
        <div key={i} style={{ paddingTop: 7, marginTop: 7, borderTop: "1px solid var(--warn-line, #EFD9A8)" }}>
          <span className="indic" style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--ink)" }}>“{h.phrase}”</span>
        </div>
      ))}
    </section>
  );
}

/* ── While there is no plan ───────────────────────────────────────────────── */

/**
 * Shaped like the plan it is waiting for, so the card does not jump when the
 * plan lands. Most scripts never show this: their plan was built with them.
 */
function Building({ pad, narrow }) {
  return (
    <div role="status" style={{ padding: pad }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span
          aria-hidden="true"
          style={{
            width: 15, height: 15, borderRadius: "50%", flexShrink: 0,
            border: "2px solid var(--line)", borderTopColor: "var(--made)",
            animation: "hg-spin .8s linear infinite",
          }}
        />
        <span style={{ fontSize: 13.5, color: "var(--ink-body)" }}>Planning your shots. A few seconds.</span>
      </div>
      <div aria-hidden="true" style={{ display: "grid", gap: 16 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: `${narrow ? 40 : 48}px 1fr`, columnGap: narrow ? 10 : 14 }}>
            <Skeleton variant="text" height={12} />
            <div>
              <Skeleton variant="text" width={i % 2 ? "74%" : "92%"} height={14} />
              {i === 1 && <div style={{ marginTop: 9 }}><Skeleton variant="rectangular" height={56} /></div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Only reachable when SHOOT_PACK_CREDITS is set above zero, for a script that
 * was written without its plan. The price is on the button, as everywhere else.
 */
function Offer({ pad, price, error, onConfirm, onReadScript }) {
  return (
    <div style={{ padding: pad }}>
      <div style={{ fontSize: 15, fontWeight: 650, color: "var(--ink)", marginBottom: 6 }}>
        See this script shot by shot
      </div>
      <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--ink-body)", margin: "0 0 14px" }}>
        We time every line to the pace you speak at, find the places you already
        point at something on screen, and list the footage to have ready first.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <button onClick={onConfirm} className="hg-btn-primary" style={primaryBtn}>
          Plan the B-roll{price ? ` · ${price} credits` : ""}
        </button>
        <TextButton onClick={onReadScript}>Read the full script</TextButton>
      </div>
      {error && (
        <div role="alert" style={{ marginTop: 12, fontSize: 13, color: "var(--bad)", lineHeight: 1.6 }}>
          {error}
        </div>
      )}
    </div>
  );
}

function Failed({ pad, error, onRetry, onReadScript }) {
  return (
    <div style={{ padding: pad }}>
      <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)", marginBottom: 5 }}>
        The B-roll plan didn't come through
      </div>
      <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-body)", margin: "0 0 12px" }}>
        {error || "Something went wrong."} Your script itself is fine.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <button onClick={onRetry} className="hg-btn-ghost" style={ghostBtn}>Try again</button>
        <TextButton onClick={onReadScript}>Read the full script</TextButton>
      </div>
    </div>
  );
}

/* ── Bits ─────────────────────────────────────────────────────────────────── */

function TextButton({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: 0, border: "none", background: "none", font: "inherit", fontSize: 13,
        color: "var(--ink-body)", fontWeight: 600, textDecoration: "underline",
        textUnderlineOffset: 2, cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function fmt(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const mono = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 11.5,
  color: "var(--ink-mute)",
  fontVariantNumeric: "tabular-nums",
};

const primaryBtn = {
  fontSize: 13.5, fontWeight: 650, padding: "10px 18px", borderRadius: 10,
  border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer",
};

const ghostBtn = {
  fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 9,
  border: "1px solid var(--line)", background: "var(--card)",
  color: "var(--ink-body)", cursor: "pointer",
};

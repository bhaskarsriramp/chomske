import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import api from "../../api";
import { useCredits } from "../../state/CreditsContext";

/**
 * ScriptOrder — choose the voice, choose the length, see the price.
 *
 * ── THE PRICE IS ON SCREEN BEFORE THE BUTTON IS PRESSED ─────────────────────
 * Every number here comes from the server (GET /billing/quote and
 * /billing/packs). Nothing is computed in the browser and no rupee figure is
 * hardcoded, because the same arithmetic living in two places disagrees
 * eventually — and the version the customer saw is the one they hold you to.
 *
 * A creator picking "8 min" is agreeing to spend about ten times what a Short
 * costs. Showing that only after the credits are gone is how a product earns a
 * refund request and a bad review in the same afternoon.
 *
 * ── AND SO IS THE REFUSAL ───────────────────────────────────────────────────
 * When a chosen length costs more than they hold, the button says so instead of
 * saying the price. A disabled button labelled with a number a creator cannot
 * afford reads as broken; a button that says "Not enough credits", next to one
 * that fixes it, reads as an answer.
 */
export default function ScriptOrder({ busy, onGenerate, compact }) {
  const { balance, setBalance, openBuy, canBuy, rules } = useCredits();

  const [seconds, setSeconds] = useState(60);
  const [english, setEnglish] = useState(false);
  const [packaging, setPackaging] = useState(false);
  const [q, setQ] = useState(null);              // the live quote
  const quoteReq = useRef(0);

  // Re-quoted on every change. Guarded by a request counter: the responses can
  // arrive out of order when someone drags the slider, and a stale one landing
  // last would display a price for a duration they already moved off.
  const refreshQuote = useCallback(async () => {
    const mine = ++quoteReq.current;
    try {
      const { data } = await api.get("/billing/quote", {
        params: { seconds, english: english ? 1 : 0, packaging: packaging ? 1 : 0 },
      });
      if (mine === quoteReq.current) {
        setQ(data);
        // The quote carries the authoritative balance, so a script generated in
        // another tab shows up here without a second request.
        if (typeof data.balance === "number") setBalance(data.balance);
      }
    } catch { /* the button still works; the server prices it again anyway */ }
  }, [seconds, english, packaging, setBalance]);

  useEffect(() => { refreshQuote(); }, [refreshQuote]);

  // The bounds are the server's, not ours — it clamps to them anyway, and a
  // slider that travels somewhere the API refuses is a control that lies.
  const stops = useMemo(
    () => buildStops(rules?.min_seconds, rules?.max_seconds),
    [rules?.min_seconds, rules?.max_seconds],
  );

  const idx = nearestIndex(stops, seconds);

  // Only fires if the server's bounds moved under a selection that is no longer
  // on the scale. Without it the thumb would sit on one value while a different
  // one gets quoted and billed.
  useEffect(() => {
    if (stops[idx] !== seconds) setSeconds(stops[idx]);
  }, [stops, idx, seconds]);

  // Affordability is decided HERE, against the shared live balance, rather than
  // read off `q.affordable`. The quote's copy of the balance was true when the
  // server priced it — but a top-up from the sidebar happens without any of
  // these three inputs changing, so nothing would re-quote and the button would
  // stay disabled over credits the creator has already paid for.
  //
  // The price itself still comes from the server. Only the comparison is local.
  const have = typeof balance === "number" ? balance : q?.balance;
  const cost = q?.total ?? null;
  const affordable = cost === null || have === undefined || have === null ? true : have >= cost;

  return (
    <div>
      {/* No "write as" picker. Which channel this is for is in the app bar at
          the top of the screen, which never scrolls away — see Shell/TopBar.js.
          A second copy here would be a second control for one value, and the
          moment two controls can disagree about which voice is writing, one of
          them is lying at the exact point where credits get spent. */}

      {/* ── Length ───────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 14 }}>
        <Label>How long should it run?</Label>

        {/* The chosen length, said once and said large. It used to be the
            highlighted pill in a row of six, which made the reader compare
            options when the question at this point is only "how long is the
            one I am about to buy". */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginBottom: 2 }}>
          <span
            style={{
              fontSize: 25, fontWeight: 700, letterSpacing: "-0.025em",
              color: "var(--ink)", lineHeight: 1.1, fontVariantNumeric: "tabular-nums",
            }}
          >
            {durationLabel(seconds)}
          </span>
          <span style={{ fontSize: 12.5, color: "var(--ink-mute)" }}>{formatNote(seconds)}</span>
        </div>

        {/* No price under the thumb. The cost is on the button that spends it,
            where it is read at the moment of the decision instead of tracking a
            second number that changes as you drag. */}
        <input
          type="range"
          className="hg-range"
          min={0}
          max={stops.length - 1}
          step={1}
          value={idx}
          onChange={(e) => setSeconds(stops[Number(e.target.value)])}
          aria-label="How long should it run?"
          aria-valuetext={durationLabel(seconds)}
          style={{ "--hg-range-pct": `${stops.length > 1 ? (idx / (stops.length - 1)) * 100 : 0}%` }}
        />

        <div
          aria-hidden="true"
          style={{
            display: "flex", justifyContent: "space-between",
            fontSize: 11.5, color: "var(--ink-mute)", marginTop: -2,
          }}
        >
          <span>{durationLabel(stops[0])}</span>
          <span>{durationLabel(stops[stops.length - 1])}</span>
        </div>
        {seconds >= 180 && (
          <p style={{ fontSize: 12, color: "var(--ink-mute)", margin: "8px 0 0", lineHeight: 1.55 }}>
            Long-form earns several times what a Short does per view — the script
            gets real sections rather than a stretched Short.
          </p>
        )}
      </div>

      {/* ── Add-ons ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 14 }}>
        <Label>Add</Label>
        <div style={{ display: "grid", gap: 7 }}>
          <Toggle
            on={english}
            onChange={() => setEnglish((v) => !v)}
            title="Also write it in English"
            note="Same story for a global audience — English content earns several times more per view."
            cost={q?.twin}
          />
          <Toggle
            on={packaging}
            onChange={() => setPackaging((v) => !v)}
            title="Title, description, hashtags"
            note="Everything the upload form asks for, written from the finished script."
            cost={q?.packaging}
          />
        </div>
      </div>

      {/* ── The ask ────────────────────────────────────────────────────────
          Two states for one row. When they can afford it, the write button is
          the filled one, carrying the price. When they cannot, the refusal goes
          flat and quiet and BUY becomes the filled button — the only thing on
          the row that still does anything should be the one that looks like it
          does.

          The dead state is deliberately not white-on-grey. Disabled controls are
          exempt from the contrast rules, which is not the same as being readable,
          and this one has to be read: it is the explanation. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={() => onGenerate({ seconds, english, packaging })}
          disabled={busy || !affordable}
          className={busy || !affordable ? undefined : "hg-btn-primary"}
          style={{
            fontSize: 14, fontWeight: 600, padding: "12px 20px", borderRadius: 11,
            border: affordable ? "none" : "1px solid #DCDCDC",
            color: affordable ? "#fff" : "#5F5F5F",
            background: affordable ? "var(--primary)" : "#EDEDED",
            cursor: busy || !affordable ? "default" : "pointer",
            opacity: busy ? 0.55 : 1,
          }}
        >
          {busy
            ? "Writing…"
            : !affordable
            ? "Not enough credits"
            : `Write this in my voice · ${cost ?? "…"} credits`}
        </button>

        {!affordable && canBuy ? (
          <button
            onClick={openBuy}
            className="hg-btn-primary"
            style={{
              fontSize: 14, fontWeight: 650, padding: "12px 20px", borderRadius: 11,
              border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer",
            }}
          >
            Buy credits
          </button>
        ) : compact && typeof have === "number" ? (
          // Phones only. On desktop the sidebar carries the balance permanently,
          // a few centimetres away and always on screen, so repeating it here
          // was one number maintained in two places for no added information.
          <span style={{ fontSize: 12.5, color: "var(--ink-mute)" }}>{have} credits left</span>
        ) : null}
      </div>

      {!affordable && cost !== null && (
        <p style={{ fontSize: 12.5, color: "var(--ink-mute)", margin: "9px 0 0", lineHeight: 1.6 }}>
          This one needs {cost} credits and you have {have ?? 0}. Credits never
          expire and there's no subscription — or pick a shorter length above.
        </p>
      )}
    </div>
  );
}

/* ── Length ───────────────────────────────────────────────────────────────── */

/**
 * The stops the slider can land on.
 *
 * Not free-form seconds. Nobody wants a 137-second script — they want "about
 * two minutes", and a continuous slider makes a creator fight the thumb for a
 * round number they were always going to choose. So: fine steps down where the
 * format is decided by seconds (a Short lives or dies on 45 vs 60), then half
 * minutes once it is long-form and no one is counting.
 *
 * Bounds come from the server so this cannot offer a length the API clamps away.
 */
function buildStops(minSeconds, maxSeconds) {
  const min = Number(minSeconds) > 0 ? Number(minSeconds) : 45;
  const max = Number(maxSeconds) > 0 ? Number(maxSeconds) : 480;

  const out = [45, 60].filter((s) => s >= min && s <= max);
  for (let s = 90; s <= max; s += 30) if (s >= min) out.push(s);

  return out.length ? out : [min];
}

/** The stop nearest a given length — the thumb always has somewhere real to sit. */
function nearestIndex(stops, seconds) {
  let best = 0;
  for (let i = 1; i < stops.length; i++) {
    if (Math.abs(stops[i] - seconds) < Math.abs(stops[best] - seconds)) best = i;
  }
  return best;
}

/**
 * Seconds up to a minute, minutes past it.
 *
 * "150s" is arithmetic the reader has to do; "2 min 30s" is the number they
 * already think in once a script is long enough to have sections.
 */
function durationLabel(seconds) {
  if (seconds <= 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${mins} min ${rest}s` : `${mins} min`;
}

/** What this length is FOR — the one thing the old pills said that a number can't. */
function formatNote(seconds) {
  if (seconds <= 60) return "Reel / Short";
  if (seconds < 180) return "Short-form";
  return "Long-form";
}

/* ── Pieces ───────────────────────────────────────────────────────────────── */

function Label({ children }) {
  return (
    <div
      style={{
        fontSize: 11, fontWeight: 600, letterSpacing: "0.1em",
        textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function Toggle({ on, onChange, title, note, cost }) {
  return (
    <button
      onClick={onChange}
      aria-pressed={on}
      className="hg-pick"
      style={{
        display: "flex", alignItems: "flex-start", gap: 10, width: "100%",
        textAlign: "left", padding: "10px 12px", borderRadius: 10, cursor: "pointer",
        border: `1px solid ${on ? "var(--ink)" : "var(--line)"}`,
        background: on ? "var(--made-tint)" : "var(--card)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 16, height: 16, borderRadius: 5, flexShrink: 0, marginTop: 1,
          border: `1.5px solid ${on ? "var(--ink)" : "#C6C6C6"}`,
          background: on ? "var(--ink)" : "transparent",
          color: "#fff", fontSize: 11, lineHeight: "13px", textAlign: "center",
        }}
      >
        {on ? "✓" : ""}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
          {title}
          {cost > 0 && (
            <span style={{ fontWeight: 500, color: "var(--ink-mute)" }}> · +{cost} cr</span>
          )}
        </span>
        <span style={{ display: "block", fontSize: 12, color: "var(--ink-mute)", lineHeight: 1.5, marginTop: 2 }}>
          {note}
        </span>
      </span>
    </button>
  );
}


import { useState, useEffect, useMemo } from "react";
import api from "../../api";
import { useCredits } from "../../state/CreditsContext";

/**
 * ScriptOrder: choose the voice, choose the length, see the price.
 *
 * ── THE PRICE IS ON SCREEN BEFORE THE BUTTON IS PRESSED ─────────────────────
 * Every number here comes from the server (GET /billing/quote and
 * /billing/packs). Nothing is computed in the browser and no rupee figure is
 * hardcoded, because the same arithmetic living in two places disagrees
 * eventually, and the version the customer saw is the one they hold you to.
 *
 * A creator picking "8 min" is agreeing to spend about ten times what a Short
 * costs. Showing that only after the credits are gone is how a product earns a
 * refund request and a bad review in the same afternoon.
 *
 * ── AND IT IS THE PRICE OF THE ORDER ACTUALLY SELECTED ──────────────────────
 * A price for a length the creator has moved off is not a price, it is the
 * previous answer, and it is worse than showing no number at all: they read it,
 * believe it, and press a button that spends something else. So a quote is held
 * together with the order it was priced for, and the only path a number takes
 * to the screen is through a key check against the current selection.
 *
 * ── AND IT PRICES THE MATERIAL, NOT JUST THE LENGTH ─────────────────────────
 * Discover orders cost what the slider says: the research behind a ranked story
 * was paid for by the collector on its own clock. Import and Idea are not like
 * that. Reading ten minutes of video costs real money and a lookup costs a
 * search, so those orders carry a price the slider alone cannot predict.
 *
 * `sourceId` is therefore part of the quote request and part of the order key.
 * The server prices the material from its own stored copy, never from anything
 * this component sends, and the second order from the same video comes back
 * cheaper because the read is already bought. All this component has to do is
 * ask again whenever the material changes, which is what putting it in the key
 * achieves.
 *
 * ── AND SO IS THE REFUSAL ───────────────────────────────────────────────────
 * When a chosen length costs more than they hold, the button says so instead of
 * saying the price. A disabled button labelled with a number a creator cannot
 * afford reads as broken; a button that says "Not enough credits", next to one
 * that fixes it, reads as an answer.
 */

/** How long the thumb has to sit still before we ask what it costs. */
const QUOTE_SETTLE_MS = 220;

/** Between a failed quote and its one retry. */
const QUOTE_RETRY_MS = 900;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function ScriptOrder({ busy, onGenerate, compact, sourceId = null, cta = "Write this in my voice" }) {
  const { balance, setBalance, openBuy, canBuy, rules } = useCredits();

  const [seconds, setSeconds] = useState(60);
  const [english, setEnglish] = useState(false);
  const [packaging, setPackaging] = useState(false);

  // The bounds are the server's, not ours. It clamps to them anyway, and a
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

  /* ── The quote, and the order it belongs to ────────────────────────────────
     The previous version kept a bare quote plus a request counter that applied
     only the newest response and discarded the rest. That is right while
     requests succeed and silently wrong the moment the newest one does not:
     nothing replaced the last good quote, so the panel went on showing a price
     from a length the creator had already dragged past. A 5 min script sat
     behind a 30 credit button, which is the 60s price.

     Dragging made that likely rather than rare. One request fired per stop
     crossed, so crossing the scale opened a dozen at once, past the browser's
     six-per-host limit, and the newest of them is exactly the one a phone on a
     weak connection drops.

     Three things follow, and together they are the fix: ask once when the thumb
     settles, abort whatever is still in flight, and let no number reach the
     screen unless it was priced for this exact order. */
  const orderKey = `${seconds}|${english ? 1 : 0}|${packaging ? 1 : 0}|${sourceId || ""}`;

  const [quote, setQuote] = useState(null);      // { key, data }
  const [priceFailed, setPriceFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    setPriceFailed(false);

    const timer = setTimeout(async () => {
      // One retry. What this guards against is a phone that lost its connection
      // for a moment, not a server that is down, and a second failure is worth
      // saying out loud rather than papering over.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const { data } = await api.get("/billing/quote", {
            params: {
              seconds,
              english: english ? 1 : 0,
              packaging: packaging ? 1 : 0,
              // Omitted entirely on the Discover path, where api.js drops
              // null params rather than sending "source_id=null".
              source_id: sourceId || undefined,
            },
            signal: controller.signal,
          });
          if (!live) return;
          setQuote({ key: orderKey, data });
          // The quote carries the authoritative balance, so a script generated
          // in another tab shows up here without a second request.
          if (typeof data.balance === "number") setBalance(data.balance);
          return;
        } catch {
          if (!live) return;
        }
        await sleep(QUOTE_RETRY_MS);
        if (!live) return;
      }
      setPriceFailed(true);
    }, QUOTE_SETTLE_MS);

    return () => {
      live = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [orderKey, seconds, english, packaging, sourceId, setBalance, retry]);

  // The one place a price is allowed through, and the reason a stale one cannot
  // be displayed, compared against a balance, or ordered from.
  const priced = quote && quote.key === orderKey ? quote.data : null;
  const cost = priced?.total ?? null;
  const pricing = cost === null && !priceFailed;

  // Affordability is decided HERE, against the shared live balance, rather than
  // read off the quote's `affordable`. The quote's copy of the balance was true
  // when the server priced it, but a top-up from the sidebar happens without
  // any of these three inputs changing, so nothing would re-quote and the
  // button would stay disabled over credits the creator has already paid for.
  //
  // The price itself still comes from the server. Only the comparison is local.
  const have = typeof balance === "number" ? balance : priced?.balance;

  // Known to be short, which is not the same as "not priced yet". Only real
  // numbers on both sides turn the refusal on.
  const tooExpensive = cost !== null && typeof have === "number" && have < cost;

  // Nothing is ordered from a screen that is not showing this order's price.
  const ready = !busy && cost !== null && !tooExpensive;
  const dead = tooExpensive || priceFailed;

  return (
    <div>
      {/* No "write as" picker. The account has one voice, so there is nothing
          to choose and nothing to get wrong at the point where credits are
          actually spent. See state/ProfileContext.js. */}

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
      </div>

      {/* ── Add-ons ──────────────────────────────────────────────────────────
          These prices scale with the duration too, so they are read off the
          same checked quote as the total. A "+45 cr" left over from the last
          length is the same lie in smaller type. */}
      <div style={{ marginBottom: 14 }}>
        <Label>Add</Label>
        <div style={{ display: "grid", gap: 7 }}>
          <Toggle
            on={english}
            onChange={() => setEnglish((v) => !v)}
            title="Also write it in English"
            note="Same story for a global audience. English content earns several times more per view."
            cost={priced?.twin}
          />
          <Toggle
            on={packaging}
            onChange={() => setPackaging((v) => !v)}
            title="Title, description, hashtags"
            note="Everything the upload form asks for, written from the finished script."
            cost={priced?.packaging}
          />
        </div>
      </div>

      {/* ── The ask ────────────────────────────────────────────────────────
          Two states for one row. When they can afford it, the write button is
          the filled one, carrying the price. When they cannot, the refusal goes
          flat and quiet and BUY becomes the filled button: the only thing on
          the row that still does anything should be the one that looks like it
          does.

          The dead state is deliberately not white-on-grey. Disabled controls are
          exempt from the contrast rules, which is not the same as being readable,
          and this one has to be read: it is the explanation. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={() => { if (ready) onGenerate({ seconds, english, packaging }); }}
          disabled={!ready}
          className={ready ? "hg-btn-primary" : undefined}
          style={{
            fontSize: 14, fontWeight: 600, padding: "12px 20px", borderRadius: 11,
            border: dead ? "1px solid #DCDCDC" : "none",
            color: dead ? "#5F5F5F" : "#fff",
            background: dead ? "#EDEDED" : "var(--primary)",
            cursor: ready ? "pointer" : "default",
            // Pricing reads as work in progress rather than as a refusal,
            // because that is what it is: the number is a moment away.
            opacity: busy || pricing ? 0.55 : 1,
          }}
        >
          {busy
            ? "Writing…"
            : priceFailed
            ? "Price unavailable"
            : pricing
            ? "Pricing…"
            : tooExpensive
            ? "Not enough credits"
            : `${cta} · ${cost} credits`}
        </button>

        {tooExpensive && canBuy ? (
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

      {/* Both attempts are spent and we still cannot say what this costs. The
          honest move is to say so and offer the request again, rather than fall
          back to the last number we happened to be holding. */}
      {priceFailed && !busy && (
        <p style={{ fontSize: 12.5, color: "var(--ink-mute)", margin: "9px 0 0", lineHeight: 1.6 }}>
          Couldn't check what this length costs.{" "}
          <button
            onClick={() => setRetry((n) => n + 1)}
            style={{
              background: "none", border: "none", padding: 0, font: "inherit",
              color: "var(--ink)", fontWeight: 600, textDecoration: "underline", cursor: "pointer",
            }}
          >
            Try again
          </button>
        </p>
      )}

      {/* ── WHERE THE EXTRA CREDITS WENT ─────────────────────────────────────
          A 60 second script is 30 credits everywhere in this product, so an
          Import that says 54 has to explain itself at the moment it is read.
          Unexplained, it looks like a bug or a markup; named, it is a line item
          the creator can decide about, and the next order from the same video
          drops it, which is worth knowing before they order the first one. */}
      {priced?.source > 0 && !tooExpensive && (
        <p style={{ fontSize: 12.5, color: "var(--ink-mute)", margin: "9px 0 0", lineHeight: 1.6 }}>
          Includes {priced.source} credits to read your source. Writing again from
          the same material won't cost that twice.
        </p>
      )}

      {tooExpensive && (
        <p style={{ fontSize: 12.5, color: "var(--ink-mute)", margin: "9px 0 0", lineHeight: 1.6 }}>
          This one needs {cost} credits and you have {have ?? 0}. Credits never
          expire and there's no subscription. Or pick a shorter length above.
        </p>
      )}
    </div>
  );
}

/* ── Length ───────────────────────────────────────────────────────────────── */

/**
 * The stops the slider can land on.
 *
 * Not free-form seconds. Nobody wants a 137-second script: they want "about
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

/** The stop nearest a given length, so the thumb always has somewhere real to sit. */
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

/** What this length is FOR: the one thing the old pills said that a number can't. */
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

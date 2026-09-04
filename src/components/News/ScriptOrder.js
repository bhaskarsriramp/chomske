import { useState, useEffect, useCallback, useRef } from "react";
import api from "../../api";
import { useCredits } from "../../state/CreditsContext";
import { useVoices } from "../../state/VoiceContext";
import VoiceSelect from "../Shell/VoiceSelect";

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
export default function ScriptOrder({ busy, onGenerate }) {
  const { balance, setBalance, openBuy, canBuy, rules } = useCredits();
  const { voices, activeId, setActive } = useVoices();

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

  const presets = rules?.durations || [];

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
      {/* ── Which voice ──────────────────────────────────────────────────────
          Only rendered once there is a second voice to choose between — see
          VoiceSelect. It is first because it is the most expensive thing to get
          wrong: the wrong length is a rewrite, the wrong voice is a script that
          sounds like somebody else. */}
      {voices.length > 1 && (
        <div style={{ marginBottom: 14 }}>
          <Label>Write as</Label>
          <VoiceSelect value={activeId} onChange={setActive} label="" hideWhenSingle={false} />
        </div>
      )}

      {/* ── Length ───────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 14 }}>
        <Label>How long should it run?</Label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {presets.map((d) => {
            const on = d.seconds === seconds;
            return (
              <button
                key={d.seconds}
                onClick={() => setSeconds(d.seconds)}
                aria-pressed={on}
                className="hg-pill"
                style={{
                  display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 1,
                  padding: "7px 12px", borderRadius: 10, cursor: "pointer",
                  border: `1px solid ${on ? "var(--ink)" : "var(--line)"}`,
                  background: on ? "var(--ink)" : "var(--card)",
                  color: on ? "#fff" : "var(--ink-body)",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 650 }}>{d.label}</span>
                <span style={{ fontSize: 10.5, opacity: on ? 0.75 : 0.6 }}>{d.credits} cr</span>
              </button>
            );
          })}
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
          the filled one and the balance sits beside it. When they cannot, the
          refusal goes flat and quiet and BUY becomes the filled button — the
          only thing on the row that still does anything should be the one that
          looks like it does.

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
        ) : (
          <span style={{ fontSize: 12.5, color: "var(--ink-mute)" }}>
            {typeof have === "number" ? `${have} credits left` : ""}
          </span>
        )}
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


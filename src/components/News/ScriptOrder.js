import { useState, useEffect, useCallback, useRef } from "react";
import api, { errorMessage } from "../../api";

/**
 * ScriptOrder — choose the length, see the price, pay if the wallet is short.
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
 */

/** Razorpay's widget, loaded on demand — not in index.html, where it would cost
 *  every visitor a script they will mostly never use. */
function loadCheckout() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => reject(new Error("Couldn't load the payment window."));
    document.body.appendChild(s);
  });
}

export default function ScriptOrder({ busy, onGenerate, onBalance }) {
  const [rules, setRules] = useState(null);      // packs + duration presets, from the server
  const [seconds, setSeconds] = useState(60);
  const [english, setEnglish] = useState(false);
  const [packaging, setPackaging] = useState(false);
  const [q, setQ] = useState(null);              // the live quote
  const [buying, setBuying] = useState(false);
  const [showPacks, setShowPacks] = useState(false);
  const [error, setError] = useState("");
  const quoteReq = useRef(0);

  useEffect(() => {
    api.get("/billing/packs").then(({ data }) => setRules(data)).catch(() => {});
  }, []);

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
        onBalance?.(data.balance);
      }
    } catch { /* the button still works; the server prices it again anyway */ }
  }, [seconds, english, packaging, onBalance]);

  useEffect(() => { refreshQuote(); }, [refreshQuote]);

  async function buy(packId) {
    setError("");
    setBuying(true);
    let order;
    try {
      await loadCheckout();
      const { data } = await api.post("/billing/order", { pack_id: packId });
      order = data;
    } catch (err) {
      setBuying(false);
      setError(errorMessage(err, "Couldn't start the payment."));
      return;
    }

    const rzp = new window.Razorpay({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      name: "Lipi",
      description: `${order.pack.label} — ${order.pack.credits} credits`,
      order_id: order.order_id,
      theme: { color: "#FF0000" },
      handler: async (resp) => {
        try {
          const { data } = await api.post("/billing/verify", {
            order_id: resp.razorpay_order_id,
            payment_id: resp.razorpay_payment_id,
            signature: resp.razorpay_signature,
          });
          setBuying(false);
          setShowPacks(false);
          onBalance?.(data.balance);
          refreshQuote();
        } catch (err) {
          // The money may well have left their account — never say "payment
          // failed" here, because we do not know that. Say what we know.
          setBuying(false);
          setError(errorMessage(err, "Payment went through but we couldn't confirm it. Refresh in a moment — if the credits aren't there, contact us with your payment id."));
        }
      },
      modal: {
        ondismiss: () => {
          setBuying(false);
          api.post("/billing/abandoned", { order_id: order.order_id }).catch(() => {});
        },
      },
    });

    rzp.on("payment.failed", () => {
      setBuying(false);
      setError("That payment didn't go through. No credits were used.");
    });

    rzp.open();
  }

  const presets = rules?.durations || [];
  const affordable = q ? q.affordable : true;

  return (
    <div>
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

      {error && (
        <div
          role="alert"
          style={{
            padding: "10px 12px", borderRadius: 9, marginBottom: 11,
            background: "#FCE8E6", border: "1px solid #F5C7C3",
            color: "var(--bad)", fontSize: 13, lineHeight: 1.55,
          }}
        >
          {error}
        </div>
      )}

      {/* ── The ask ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button
          onClick={() => onGenerate({ seconds, english, packaging })}
          disabled={busy || !affordable}
          className={busy || !affordable ? undefined : "hg-btn-primary"}
          style={{
            fontSize: 14, fontWeight: 600, padding: "12px 20px", borderRadius: 11,
            border: "none", background: "var(--primary)", color: "#fff",
            cursor: busy || !affordable ? "default" : "pointer",
            opacity: busy || !affordable ? 0.55 : 1,
          }}
        >
          {busy ? "Writing…" : `Write this in my voice · ${q?.total ?? "…"} credits`}
        </button>

        <span style={{ fontSize: 12.5, color: "var(--ink-mute)" }}>
          {q ? `${q.balance} credits left` : ""}
        </span>
      </div>

      {q && !affordable && (
        <div
          style={{
            marginTop: 12, padding: "12px 14px", borderRadius: 10,
            border: "1px solid var(--line)", background: "var(--paper)",
          }}
        >
          <div style={{ fontSize: 13.5, color: "var(--ink)", fontWeight: 600, marginBottom: 4 }}>
            This one needs {q.total} credits — you have {q.balance}.
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ink-mute)", lineHeight: 1.6, marginBottom: 10 }}>
            Top up once. Credits never expire and there's no subscription.
          </div>
          <button
            onClick={() => setShowPacks(true)}
            className="hg-btn-primary"
            style={{
              fontSize: 13, fontWeight: 600, padding: "9px 16px", borderRadius: 9,
              border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer",
            }}
          >
            Buy credits
          </button>
        </div>
      )}

      {showPacks && rules && (
        <Packs
          rules={rules}
          buying={buying}
          onBuy={buy}
          onClose={() => setShowPacks(false)}
        />
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

/** The pack chooser. Rendered from the server's list — see the note at the top
 *  of this file about why no price is written here. */
function Packs({ rules, buying, onBuy, onClose }) {
  return (
    <div
      role="dialog"
      aria-label="Buy credits"
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: "rgba(15,15,15,.45)", display: "grid", placeItems: "center", padding: 18,
      }}
      onClick={onClose}
    >
      <div
        className="hg-sheet-up"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(460px, 100%)", background: "var(--card)",
          border: "1px solid var(--line)", borderRadius: 16, padding: 22,
          maxHeight: "88vh", overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <h3 style={{ fontSize: 18, fontWeight: 750, color: "var(--ink)", margin: 0, letterSpacing: "-0.02em" }}>
            Buy credits
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ border: "none", background: "none", fontSize: 20, color: "var(--ink-mute)", cursor: "pointer", lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        <p style={{ fontSize: 13, color: "var(--ink-mute)", lineHeight: 1.6, margin: "0 0 16px" }}>
          One-time. No subscription, and credits never expire.
        </p>

        {!rules.configured && (
          <div style={{ fontSize: 13, color: "var(--bad)", marginBottom: 12 }}>
            Payments aren't switched on yet. Please try again later.
          </div>
        )}

        <div style={{ display: "grid", gap: 9 }}>
          {rules.packs.map((p) => (
            <button
              key={p.id}
              onClick={() => onBuy(p.id)}
              disabled={buying || !rules.configured}
              className="hg-pick"
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 12, width: "100%", textAlign: "left", cursor: buying ? "default" : "pointer",
                padding: "13px 15px", borderRadius: 12,
                border: `1px solid ${p.popular ? "var(--ink)" : "var(--line)"}`,
                background: "var(--card)", opacity: buying ? 0.6 : 1,
              }}
            >
              <span>
                <span style={{ display: "block", fontSize: 14.5, fontWeight: 700, color: "var(--ink)" }}>
                  {p.label}
                  {p.popular && (
                    <span
                      style={{
                        marginLeft: 8, fontSize: 10, fontWeight: 700, letterSpacing: ".06em",
                        padding: "2px 7px", borderRadius: 999,
                        background: "var(--made-tint)", color: "var(--made)",
                        border: "1px solid var(--made-line)",
                      }}
                    >
                      POPULAR
                    </span>
                  )}
                </span>
                <span style={{ display: "block", fontSize: 12.5, color: "var(--ink-mute)", marginTop: 3 }}>
                  {p.credits} credits · about {p.shorts} × 60s scripts
                </span>
              </span>
              <span style={{ textAlign: "right", flexShrink: 0 }}>
                <span style={{ display: "block", fontSize: 17, fontWeight: 750, color: "var(--ink)" }}>
                  ₹{p.inr}
                </span>
                <span style={{ display: "block", fontSize: 11, color: "var(--ink-mute)" }}>
                  ≈ ₹{p.per_short_inr}/script
                </span>
              </span>
            </button>
          ))}
        </div>

        <p style={{ fontSize: 11.5, color: "var(--ink-mute)", lineHeight: 1.6, margin: "14px 0 0" }}>
          Pay by UPI, card or netbanking. {rules.rules?.seconds_per_credit
            ? `1 credit = ${rules.rules.seconds_per_credit} seconds of finished script.`
            : ""}
        </p>
      </div>
    </div>
  );
}

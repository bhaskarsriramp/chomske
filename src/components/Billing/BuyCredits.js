import { useState } from "react";
import api, { errorMessage } from "../../api";

/**
 * BuyCredits: the pack chooser and the Razorpay handoff.
 *
 * ── NO PRICE IS WRITTEN IN THIS FILE ─────────────────────────────────────────
 * Every price, credit count and currency comes from GET /billing/packs. The
 * same arithmetic living in two places disagrees eventually, and the version
 * the customer saw is the one they hold you to.
 *
 * ── RUPEES IN INDIA, DOLLARS EVERYWHERE ELSE ─────────────────────────────────
 * The server decides which from where the request comes from (backend
 * services/geo.js) and prices both the list and the order itself. The browser
 * only sends its timezone as a hint, which the server uses when it cannot place
 * the address at all (on localhost).
 *
 * Two shapes: `PackList` is the packs and the checkout with no frame, shown
 * inside the export drawer when a 4K export needs more; the default export is
 * the dialog around it, opened from the sidebar and from "not enough credits".
 */

/** "₹2,999" / "$10": whole units, in the currency the server chose. */
export function money(amount, currency) {
  const n = Number(amount) || 0;
  return currency === "INR" ? `₹${n.toLocaleString("en-IN")}` : `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/** The browser's guess at India, from its timezone. Only ever a hint. */
export function countryHint() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (/^Asia\/(Kolkata|Calcutta)$/i.test(tz)) return "IN";
  } catch {
    /* no Intl: no hint */
  }
  return "";
}

/** Razorpay's widget, loaded on demand, not in index.html, where it would cost
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

const minutesOf = (m) => {
  const n = Math.round((Number(m) || 0) * 10) / 10;
  return `${Number.isInteger(n) ? n : n.toFixed(1)} minute${n === 1 ? "" : "s"} of video`;
};

/**
 * The packs, and buying one.
 * @param {object}   rules     GET /billing/packs
 * @param {Function} onGranted (balance) once the credits have landed
 * @param {Function} [onBusy]  (busy) while the payment window is open
 */
export function PackList({ rules, onGranted, onBusy }) {
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState("");
  // An amount typed instead of a pack (backend creditPricing.js CUSTOM): whole
  // rupees or dollars, credits at the pack rate. The server works it out again.
  const [custom, setCustom] = useState("");
  // The whole field takes the focus ring, not the bare input inside it.
  const [typing, setTyping] = useState(false);
  const busy = (b) => {
    setBuying(b);
    onBusy?.(b);
  };

  /** `what`: { pack_id } for a pack, { amount } for an amount typed in. */
  async function buy(what) {
    setError("");
    busy(true);

    let order;
    try {
      await loadCheckout();
      const { data } = await api.post("/billing/order", { ...what, country_hint: countryHint() || undefined });
      order = data;
    } catch (err) {
      busy(false);
      setError(errorMessage(err, "Couldn't start the payment."));
      return;
    }

    const rzp = new window.Razorpay({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      name: "Clipo",
      description: order.pack.id === "custom" ? `${order.pack.credits} credits` : `${order.pack.label} · ${order.pack.credits} credits`,
      order_id: order.order_id,
      theme: { color: "#FF0000" },
      handler: async (resp) => {
        try {
          const { data } = await api.post("/billing/verify", {
            order_id: resp.razorpay_order_id,
            payment_id: resp.razorpay_payment_id,
            signature: resp.razorpay_signature,
          });
          busy(false);
          onGranted?.(data.balance);
        } catch (err) {
          // The money may well have left their account. Never say "payment
          // failed" here, because we do not know that. Say what we know.
          busy(false);
          setError(errorMessage(
            err,
            "Payment went through but we couldn't confirm it. Refresh in a moment. If the credits aren't there, contact us with your payment id."
          ));
        }
      },
      modal: {
        ondismiss: () => {
          busy(false);
          api.post("/billing/abandoned", { order_id: order.order_id }).catch(() => {});
        },
      },
    });

    rzp.on("payment.failed", () => {
      busy(false);
      setError("That payment didn't go through. No credits were used.");
    });

    rzp.open();
  }

  const configured = !!rules?.configured;
  const perMin = rules?.video?.credits_per_minute || 60;
  const lim = rules?.custom;
  const amount = Number(custom);
  const amountOk = !!lim && custom !== "" && Number.isInteger(amount) && amount >= lim.min && amount <= lim.max;
  const amountCredits = amountOk ? Math.floor((amount * lim.rate.credits) / lim.rate.per + 1e-9) : 0;
  const buyAmount = () => {
    if (amountOk && !buying && configured) buy({ amount });
  };

  return (
    <div>
      {error && (
        <div
          role="alert"
          style={{
            padding: "10px 12px", borderRadius: 9, marginBottom: 12,
            background: "#FCE8E6", border: "1px solid #F5C7C3",
            color: "var(--bad)", fontSize: 13, lineHeight: 1.55,
          }}
        >
          {error}
        </div>
      )}

      {rules && !configured && (
        <div style={{ fontSize: 13, color: "var(--bad)", marginBottom: 12, lineHeight: 1.55 }}>
          Payments aren't switched on yet. Please try again later.
        </div>
      )}

      <div style={{ display: "grid", gap: 9 }}>
        {(rules?.packs || []).map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => buy({ pack_id: p.id })}
            disabled={buying || !configured}
            className="hg-pick"
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 12, width: "100%", textAlign: "left", fontFamily: "inherit",
              cursor: buying || !configured ? "default" : "pointer",
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
                {p.credits} credits · {minutesOf(p.minutes)}
              </span>
            </span>
            <span style={{ fontSize: 17, fontWeight: 750, color: "var(--ink)", flexShrink: 0 }}>
              {money(p.price, p.currency)}
            </span>
          </button>
        ))}
      </div>

      {lim && (
        <div style={{ marginTop: 9, padding: "12px 15px 13px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--card)" }}>
          <label htmlFor="bc-amount" style={{ display: "block", fontSize: 14, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>
            Or enter an amount
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <div
              style={{
                flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, padding: "0 12px",
                borderRadius: 10, border: `1px solid ${typing ? "var(--ink)" : "var(--line-strong)"}`, background: "var(--paper)",
                boxShadow: typing ? "var(--ring)" : "none",
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 16, fontWeight: 650, color: "var(--ink-mute)" }}>
                {lim.currency === "INR" ? "₹" : "$"}
              </span>
              <input
                id="bc-amount"
                inputMode="numeric"
                autoComplete="off"
                placeholder={lim.min.toLocaleString(lim.currency === "INR" ? "en-IN" : "en-US")}
                value={custom}
                disabled={buying || !configured}
                onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, "").slice(0, 7))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") buyAmount();
                }}
                onFocus={() => setTyping(true)}
                onBlur={() => setTyping(false)}
                style={{
                  flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", boxShadow: "none",
                  fontFamily: "inherit", fontSize: 16, fontWeight: 650, color: "var(--ink)", padding: "10px 0",
                }}
              />
            </div>
            <button
              type="button"
              onClick={buyAmount}
              disabled={!amountOk || buying || !configured}
              style={{
                flexShrink: 0, padding: "0 18px", borderRadius: 10, border: "none", fontFamily: "inherit",
                fontSize: 14, fontWeight: 650, background: "var(--ink)", color: "#fff",
                cursor: amountOk && !buying && configured ? "pointer" : "default", opacity: amountOk && !buying ? 1 : 0.4,
              }}
            >
              Buy now
            </button>
          </div>
          <div style={{ marginTop: 7, fontSize: 12, color: amountOk || custom === "" ? "var(--ink-mute)" : "var(--bad)" }}>
            {amountOk
              ? `${amountCredits} credits · ${minutesOf(amountCredits / perMin)}`
              : `From ${money(lim.min, lim.currency)} to ${money(lim.max, lim.currency)}`}
          </div>
        </div>
      )}

      {rules?.packs?.length > 0 && (
        <p style={{ fontSize: 11.5, color: "var(--ink-mute)", lineHeight: 1.6, margin: "12px 0 0" }}>
          {rules.currency === "INR" ? "Pay by UPI, card or netbanking." : "Pay by card."}
          {` A minute of video is ${perMin} credits.`}
        </p>
      )}
    </div>
  );
}

export default function BuyCredits({ rules, balance, onClose, onGranted }) {
  const [buying, setBuying] = useState(false);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Buy credits"
      onClick={buying ? undefined : onClose}
      style={{
        // Above every other layer: it opens from cards and drawers that are
        // themselves on top (the record card, the export drawer).
        position: "fixed", inset: 0, zIndex: 120,
        background: "rgba(15,15,15,.45)", display: "grid", placeItems: "center", padding: 18,
      }}
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, gap: 12 }}>
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
          {typeof balance === "number" && ` You have ${balance} right now.`}
        </p>

        <PackList
          rules={rules}
          onBusy={setBuying}
          onGranted={(b) => {
            onGranted?.(b);
            onClose?.();
          }}
        />
      </div>
    </div>
  );
}

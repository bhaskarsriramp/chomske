import { useState } from "react";
import api, { errorMessage } from "../../api";

/**
 * BuyCredits — the pack chooser and the Razorpay handoff.
 *
 * ── NO RUPEE FIGURE IS WRITTEN IN THIS FILE ─────────────────────────────────
 * Every price, credit count and per-script comparison comes from
 * GET /billing/packs. The same arithmetic living in two places disagrees
 * eventually, and the version the customer saw is the one they hold you to.
 *
 * Lives here rather than inside the script panel because credits are now bought
 * from three places — the sidebar, the order panel, and the "not enough" state.
 * Three copies of a payment flow is three chances to get a payment flow wrong.
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

export default function BuyCredits({ rules, balance, onClose, onGranted }) {
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState("");

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
      name: "Chomske",
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
          onGranted?.(data.balance);
          onClose?.();
        } catch (err) {
          // The money may well have left their account — never say "payment
          // failed" here, because we do not know that. Say what we know.
          setBuying(false);
          setError(errorMessage(
            err,
            "Payment went through but we couldn't confirm it. Refresh in a moment — if the credits aren't there, contact us with your payment id."
          ));
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Buy credits"
      onClick={buying ? undefined : onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 90,
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

        {rules && !rules.configured && (
          <div style={{ fontSize: 13, color: "var(--bad)", marginBottom: 12, lineHeight: 1.55 }}>
            Payments aren't switched on yet. Please try again later.
          </div>
        )}

        <div style={{ display: "grid", gap: 9 }}>
          {(rules?.packs || []).map((p) => (
            <button
              key={p.id}
              onClick={() => buy(p.id)}
              disabled={buying || !rules.configured}
              className="hg-pick"
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 12, width: "100%", textAlign: "left",
                cursor: buying || !rules.configured ? "default" : "pointer",
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
          Pay by UPI, card or netbanking.
          {rules?.rules?.seconds_per_credit
            ? ` 1 credit = ${rules.rules.seconds_per_credit} seconds of finished script.`
            : ""}
        </p>
      </div>
    </div>
  );
}

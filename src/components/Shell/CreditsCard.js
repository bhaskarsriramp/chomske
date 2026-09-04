import { useCredits } from "../../state/CreditsContext";

/**
 * The credits card that sits at the bottom of the nav.
 *
 * ── WHY IT IS PINNED RATHER THAN IN THE LIST ────────────────────────────────
 * Credits are the one number that changes what a creator can do next, and it
 * changes without them acting — every script spends some. Scrolled out of view
 * it becomes something they find out about at the moment they are refused, which
 * is the worst possible time to learn it. So it is outside the scrolling region:
 * the nav list scrolls under it, this stays.
 *
 * ── THE THRESHOLD IS DERIVED, NOT PICKED ────────────────────────────────────
 * "Low" means "fewer than two of the cheapest script", measured against the
 * server's own price list. A hardcoded number goes wrong the moment prices move:
 * with a fixed threshold of 30 and a 23-credit minimum, a balance of 18 was
 * being told it was "enough for about one more short script" — a claim that was
 * simply false, from the one component whose entire job is to say what you can
 * still do.
 */
function thresholds(rules) {
  const costs = (rules?.durations || []).map((d) => d.credits).filter((n) => n > 0);
  // 23 = a 45s script at 1 credit per 2 seconds. Only used before the price
  // list has loaded, and only to decide a colour.
  const cheapest = costs.length ? Math.min(...costs) : 23;
  return { cheapest, low: cheapest * 2 };
}

export default function CreditsCard({ compact = false }) {
  const { balance, openBuy, canBuy, rules } = useCredits();
  const { cheapest, low: LOW } = thresholds(rules);

  const known = typeof balance === "number";
  const low = known && balance < LOW;
  const cantWrite = known && balance < cheapest;

  return (
    <div
      style={{
        flexShrink: 0,
        padding: compact ? "10px 12px 12px" : "12px 12px 14px",
        borderTop: "1px solid var(--line)",
        background: "var(--card)",
      }}
    >
      <div
        style={{
          borderRadius: 12, padding: compact ? "11px 12px" : "13px 14px",
          border: `1px solid ${low ? "#F3D3D8" : "var(--line)"}`,
          background: low
            ? "linear-gradient(170deg, #FCF0F2 0%, var(--card) 72%)"
            : "linear-gradient(170deg, var(--made-tint) 0%, var(--card) 72%)",
        }}
      >
        <div
          style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em",
            textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 5,
          }}
        >
          Credits
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: low ? 4 : 10 }}>
          {/* A dash, never a zero, while the number is unknown. "0 credits" shown
              for half a second is a claim, and a wrong one that says the product
              has stopped working. */}
          <span
            style={{
              fontSize: compact ? 21 : 23, fontWeight: 750, letterSpacing: "-0.03em",
              lineHeight: 1, color: low ? "#AB2C41" : "var(--ink)",
            }}
          >
            {known ? balance : "—"}
          </span>
          <span style={{ fontSize: 11.5, color: "var(--ink-mute)" }}>available</span>
        </div>

        {low && (
          <div style={{ fontSize: 11.5, color: "#AB2C41", lineHeight: 1.5, margin: "0 0 9px" }}>
            {balance === 0
              ? "Top up to keep writing."
              : cantWrite
              // Said plainly. Anything softer here is a promise the next screen
              // has to break.
              ? `Not enough for a script — the shortest costs ${cheapest}.`
              : "Enough for about one more short script."}
          </div>
        )}

        {canBuy && (
          <button
            onClick={openBuy}
            className="hg-btn-primary"
            style={{
              width: "100%", fontSize: 13, fontWeight: 600,
              padding: "9px 12px", borderRadius: 9, border: "none",
              background: "var(--primary)", color: "#fff", cursor: "pointer",
            }}
          >
            Buy credits
          </button>
        )}
      </div>
    </div>
  );
}

/** The compact version for the mobile header. Tapping it opens the same dialog. */
export function CreditsPill() {
  const { balance, openBuy, canBuy, rules } = useCredits();
  const known = typeof balance === "number";
  const low = known && balance < thresholds(rules).low;

  return (
    <button
      onClick={canBuy ? openBuy : undefined}
      aria-label={known ? `${balance} credits. Buy more.` : "Credits"}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        fontSize: 12, fontWeight: 650, whiteSpace: "nowrap",
        padding: "5px 10px", borderRadius: 999,
        border: `1px solid ${low ? "#F3D3D8" : "var(--line)"}`,
        background: low ? "#FCF0F2" : "var(--card)",
        color: low ? "#AB2C41" : "var(--ink-body)",
        cursor: canBuy ? "pointer" : "default",
      }}
    >
      {known ? balance : "—"}
      <span style={{ fontWeight: 500, opacity: 0.75 }}>cr</span>
    </button>
  );
}

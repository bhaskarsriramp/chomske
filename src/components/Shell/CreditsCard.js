import { useCredits } from "../../state/CreditsContext";
import { useShowcase } from "../../state/ShowcaseContext";

/**
 * The credits card that sits at the bottom of the nav.
 *
 * ── WHY IT IS PINNED RATHER THAN IN THE LIST ────────────────────────────────
 * Credits are the one number that changes what a creator can do next, and it
 * changes without them acting: every script spends some. Scrolled out of view
 * it becomes something they find out about at the moment they are refused, which
 * is the worst possible time to learn it. So it is outside the scrolling region:
 * the nav list scrolls under it, this stays.
 *
 * ── THE THRESHOLD IS DERIVED, NOT PICKED ────────────────────────────────────
 * "Low" means "less than a minute of video", measured against the server's
 * own price list (one credit a second since 2026-10-03). A hardcoded number
 * goes wrong the moment prices move, and this is the one component whose
 * entire job is to say what you can still do.
 */
function thresholds(rules) {
  // 60 = a minute at one credit a second. Only used before the price list
  // has loaded, and only to decide a colour.
  const perMin = rules?.video?.credits_per_minute || 60;
  return { perMin, low: perMin };
}

/**
 * @param {boolean} showcase  A visitor holding a private outreach link.
 *   The card still shows the balance, because it still decides whether the next
 *   thing they try will work, but the action underneath it changes: "Buy
 *   credits" is meaningless when there is no account for credits to go into, and
 *   a stranger asked to pay before they have signed up simply leaves. The ask is
 *   to keep the voice we already built for them, which costs them nothing.
 */
/**
 * ── NOT SHOWN UNTIL CREDITS HAVE BEEN BOUGHT ─────────────────────────────────
 * A first-time creator has 0 credits and does not need any: their first video
 * is free to make (backend videoBilling.js). "0 available" in the corner of the
 * screen says the opposite, before they have tried a thing. So the balance
 * appears once credits have been bought, and stays, at 0 too, from then on.
 * An older account still holding credits from before sees them.
 */
export function showsBalance({ purchased, balance }) {
  return purchased === true || (typeof balance === "number" && balance > 0);
}

export default function CreditsCard({ compact = false, showcase = false }) {
  const { balance, openBuy, canBuy, rules, purchased } = useCredits();
  const { openSignUp } = useShowcase();
  const { perMin, low: LOW } = thresholds(rules);

  const known = typeof balance === "number";
  const low = known && balance < LOW;

  if (!showcase && !showsBalance({ purchased, balance })) return null;

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
            {known ? balance : "…"}
          </span>
          <span style={{ fontSize: 11.5, color: "var(--ink-mute)" }}>available</span>
        </div>

        {low && (
          <div style={{ fontSize: 11.5, color: "#AB2C41", lineHeight: 1.5, margin: "0 0 9px" }}>
            {/* Said plainly, in seconds of video: what a credit buys. Anything
                softer here is a promise the next screen has to break. */}
            {balance === 0
              ? showcase ? "Create an account to keep going." : "Top up to edit your next video."
              : `Enough for ${Math.round((balance * 60) / perMin)} seconds of video.`}
          </div>
        )}

        {/* The showcase button is always shown, where Buy is gated on payments
            being configured: this one has nothing to configure, and it is the
            only invitation to sign up anywhere in the rail. */}
        {(showcase || canBuy) && (
          <button
            onClick={showcase ? openSignUp : openBuy}
            className="hg-btn-primary"
            style={{
              width: "100%", fontSize: 13, fontWeight: 600,
              padding: "9px 12px", borderRadius: 9, border: "none",
              background: "var(--primary)", color: "#fff", cursor: "pointer",
            }}
          >
            {showcase ? "Create account" : "Buy credits"}
          </button>
        )}
      </div>
    </div>
  );
}

/** The compact version for the mobile header. Tapping it opens the same dialog. */
export function CreditsPill() {
  const { balance, openBuy, canBuy, rules, purchased } = useCredits();
  const { isShowcase, openSignUp } = useShowcase();
  const known = typeof balance === "number";
  const low = known && balance < thresholds(rules).low;
  if (!isShowcase && !showsBalance({ purchased, balance })) return null;

  // On a phone the whole rail is behind a hamburger, so this pill is the only
  // permanently visible credit control. For a showcase visitor it has to open
  // the same invitation the card does, or the ask is two taps deep on the
  // device most of them will read the email on.
  const onTap = isShowcase ? () => openSignUp("credits") : canBuy ? openBuy : undefined;

  return (
    <button
      onClick={onTap}
      aria-label={known ? `${balance} credits. ${isShowcase ? "Create an account." : "Buy more."}` : "Credits"}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        fontSize: 12, fontWeight: 650, whiteSpace: "nowrap",
        padding: "5px 10px", borderRadius: 999,
        border: `1px solid ${low ? "#F3D3D8" : "var(--line)"}`,
        background: low ? "#FCF0F2" : "var(--card)",
        color: low ? "#AB2C41" : "var(--ink-body)",
        cursor: onTap ? "pointer" : "default",
      }}
    >
      <span style={{ fontWeight: 500, opacity: 0.8 }}>Credits left:</span>
      {known ? balance : "…"}
    </button>
  );
}

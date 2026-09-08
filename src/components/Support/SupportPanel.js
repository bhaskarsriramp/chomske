import useIsMobile from "../../hooks/useIsMobile";
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP, BRAND } from "../Legal/LegalPage";
import { useCredits } from "../../state/CreditsContext";
import { useProfiles } from "../../state/ProfileContext";

/**
 * Support: one tap to a person.
 *
 * ── WHY WHATSAPP IS THE FIRST THING AND EMAIL IS THE SECOND ──────────────────
 * This product's users are Indian creators on phones, and WhatsApp is where
 * they already are. Email is the channel you use when you have accepted that
 * the answer is coming tomorrow; a creator whose script failed at 11pm with a
 * video to publish in the morning is not writing an email. So the WhatsApp
 * button is the page, and everything else on it is secondary.
 *
 * ── THE FIVE MINUTES IS A PROMISE, SO IT IS QUALIFIED ────────────────────────
 * "Replies in under 5 minutes" with nothing beside it is the kind of claim that
 * costs more than it earns the first time somebody messages at 3am and waits
 * eight hours. The hours are stated next to it. A promise with its bounds
 * written down is trusted; the same promise unbounded is a complaint waiting to
 * be filed.
 *
 * ── WHAT THE MESSAGE ARRIVES WITH ────────────────────────────────────────────
 * The link carries a prefilled first line with the account's email in it.
 * Almost every real support question, a payment that did not land, credits that
 * look wrong, a script that failed, cannot be answered without knowing which
 * account is asking, and asking for it is one round trip that also happens to
 * be the round trip during which people give up. Prefilled, the first message
 * is already answerable.
 */
export default function SupportPanel({ user }) {
  const isPhone = useIsMobile(680);
  const { balance } = useCredits();
  const { active } = useProfiles();

  const gut = isPhone ? 16 : 30;

  // ── WHY THE ACCOUNT DETAILS ARE IN THE MESSAGE, NOT JUST ON THIS SCREEN ───
  // A support message that starts with the account email and the balance is one
  // we can answer on the first reply. The creator can delete it before sending,
  // which is the point of prefilling rather than attaching: it is a draft, not
  // a payload.
  const intro =
    `Hi, I need help with ${BRAND}.\n\n` +
    `Account: ${user?.email || "(signed in)"}\n` +
    (active?.name ? `Channel: ${active.name}\n` : "") +
    (typeof balance === "number" ? `Credits: ${balance}\n` : "") +
    `\nMy question: `;

  const waLink = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(intro)}`;

  return (
    <div className="hg-scroll" style={{ flex: 1, minHeight: 0, width: "100%" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: `${isPhone ? 18 : 28}px ${gut}px ${isPhone ? 40 : 60}px` }}>
        <h1 style={{ fontSize: isPhone ? 21 : 25, fontWeight: 750, letterSpacing: "-0.03em", color: "var(--ink)", margin: "0 0 5px" }}>
          Support
        </h1>
        <p style={{ fontSize: isPhone ? 14 : 14.5, color: "var(--ink-body)", margin: "0 0 20px", lineHeight: 1.6 }}>
          One person answers these, and it is usually the person who built the thing
          you are asking about.
        </p>

        {/* ── The card that is the whole point of the page ─────────────────── */}
        <section
          style={{
            padding: isPhone ? 18 : 24, borderRadius: "var(--radius)",
            background: "var(--card)", border: "1px solid var(--line)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <span
              aria-hidden="true"
              style={{
                width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                display: "grid", placeItems: "center",
                background: "#E7F8EC", border: "1px solid #BFE7CB",
              }}
            >
              <WhatsAppMark size={22} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: isPhone ? 16 : 17, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.015em" }}>
                Message us on WhatsApp
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-body)", marginTop: 2, lineHeight: 1.5 }}>
                The fastest way to reach a person.
              </div>
            </div>
          </div>

          {/* ── The promise, and its bounds, on one line ────────────────────
              A green dot rather than a badge: this is a fact about how quickly
              we answer, not a feature to advertise. */}
          <div
            style={{
              display: "flex", alignItems: "flex-start", gap: 9,
              padding: "10px 12px", borderRadius: 10, marginBottom: 16,
              background: "#E7F8EC", border: "1px solid #BFE7CB",
            }}
          >
            {/* Static. `.hg-ping` exists and would have looked good here, but it
                belongs to the landing page's rule set, and the app's rule is
                that nothing moves. A pulsing dot beside a support promise is
                decoration, not information, which is exactly the case that rule
                is for. */}
            <span
              aria-hidden="true"
              style={{ width: 8, height: 8, borderRadius: "50%", background: "#0D8A4F", flexShrink: 0, marginTop: 5 }}
            />
            <span style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-body)" }}>
              <strong style={{ color: "var(--ink)" }}>Replies in under 5 minutes</strong>{" "}
              between 9am and 11pm IST. Outside those hours, first thing the next morning.
            </span>
          </div>

          {/* ── WHY THIS IS AN <a> AND NOT A BUTTON WITH AN onClick ─────────
              A real link opens WhatsApp the way the phone wants to: the app if
              it is installed, web.whatsapp.com if not, and a long-press still
              offers "copy link". A button calling window.open gets caught by
              popup blockers on exactly the desktop browsers where the web
              fallback is the only route that works.

              rel="noreferrer" rather than the usual noopener pair, which it
              already implies, because there is nothing for the opened tab to
              learn from us here. */}
          <a
            href={waLink}
            target="_blank"
            rel="noreferrer"
            className="hg-btn-primary"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              width: "100%", boxSizing: "border-box",
              fontSize: isPhone ? 15 : 15.5, fontWeight: 650,
              padding: "14px 20px", borderRadius: 11,
              background: "var(--primary)", color: "#fff", textDecoration: "none",
            }}
          >
            <WhatsAppMark size={19} mono />
            Open WhatsApp
          </a>

          <p style={{ fontSize: 12.5, color: "var(--ink-mute)", margin: "10px 0 0", lineHeight: 1.6 }}>
            Opens a chat with your account email already filled in, so the first
            reply can be the answer. Delete it if you would rather not send it.
          </p>
        </section>

        {/* ── The other way in ────────────────────────────────────────────────
            Kept quiet and kept second. Email is the right channel for a long
            explanation or a screenshot thread, and the wrong one for "my script
            failed and I am publishing in an hour". */}
        <section
          style={{
            marginTop: 14, padding: isPhone ? 16 : 20, borderRadius: "var(--radius)",
            background: "var(--card)", border: "1px solid var(--line)",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 650, color: "var(--ink)", marginBottom: 4 }}>
            Or email
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-body)", margin: "0 0 12px" }}>
            Better for anything long, or when you want a written record. Same person,
            usually within a few hours.
          </p>
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`${BRAND} support`)}`}
            className="hg-btn-ghost"
            style={{
              display: "inline-block", fontSize: 13.5, fontWeight: 600,
              padding: "10px 16px", borderRadius: 10,
              border: "1px solid var(--line)", background: "var(--card)",
              color: "var(--ink-body)", textDecoration: "none",
              wordBreak: "break-all",
            }}
          >
            {SUPPORT_EMAIL}
          </a>
        </section>

        {/* ── The answers we already have ─────────────────────────────────────
            Three questions, chosen because they are the three this product
            actually generates: a charge that looks wrong, a voice that does not
            sound right, and a script that failed. Answering them here costs a
            message we would otherwise have to answer by hand, and a creator who
            finds their answer in ten seconds is better served than one who gets
            a reply in five minutes. */}
        <section style={{ marginTop: 14 }}>
          <h2
            style={{
              fontSize: 11.5, fontWeight: 600, letterSpacing: "0.13em",
              textTransform: "uppercase", color: "var(--ink-mute)", margin: "0 0 11px",
            }}
          >
            Before you write
          </h2>
          <div style={{ display: "grid", gap: 8 }}>
            {FAQ.map((f) => (
              <details
                key={f.q}
                className="hg-row"
                style={{
                  padding: isPhone ? "12px 13px" : "13px 15px", borderRadius: 6,
                  background: "var(--card)", border: "1px solid var(--line)",
                }}
              >
                <summary
                  style={{
                    cursor: "pointer", listStyle: "none",
                    fontSize: 14, fontWeight: 600, color: "var(--ink)", lineHeight: 1.5,
                  }}
                >
                  {f.q}
                </summary>
                <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--ink-body)", margin: "8px 0 0" }}>
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

const FAQ = [
  {
    q: "A script failed. Was I charged?",
    a: "No. A script that fails is refunded in full, automatically, and the credits are back before you notice. If your balance still looks wrong after a failure, that is worth a message.",
  },
  {
    q: "The scripts don't sound like me yet.",
    a: "Voice gets sharper with more videos. One video is a hint, three or more is where it starts genuinely sounding like you. Add another under My voice and analyse again.",
  },
  {
    q: "A payment went through but credits did not arrive.",
    a: "Message us with the payment id from your bank or UPI app. Credits are added against the payment record, so this is usually fixed in one reply.",
  },
];

/**
 * The WhatsApp glyph.
 *
 * Drawn rather than imported, like every other mark in this app: one path is
 * not worth an icon dependency. `mono` renders it in the current colour for use
 * on the dark button, where the brand green would sit on near-black and lose
 * most of its contrast.
 */
function WhatsAppMark({ size = 20, mono = false }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={mono ? "currentColor" : "#25D366"}
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.16h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.39c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.13-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.53.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.71-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.44.12-.15.16-.25.25-.41.08-.17.04-.31-.02-.44-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.42l-.47-.01c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.09s.9 2.43 1.03 2.59c.12.17 1.77 2.7 4.29 3.79.6.26 1.07.41 1.43.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.19.21-.58.21-1.08.14-1.19-.06-.11-.22-.17-.47-.29Z" />
    </svg>
  );
}

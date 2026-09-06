import LegalPage, {
  Section, P, B,
  ORG, BRAND, SUPPORT_EMAIL, ADDRESS_LINES,
} from "./LegalPage";
import useIsMobile from "../../hooks/useIsMobile";

/**
 * Three ways in, and they all reach the same inbox today.
 *
 * That is stated plainly rather than dressed up as three departments. A person
 * who writes to "sales@" and gets a reply from the founder has learned they were
 * being managed; a person told up front that it is one person answering has
 * learned the company is small, which they could see anyway.
 */
const DESKS = [
  {
    title: "Support",
    note: "Something is broken, a payment did not land, or credits look wrong.",
    tone: { fg: "#0D8A4F", bg: "#E6F4EA", line: "#B7E1C4" },
    icon: (
      <path d="M12 2a7 7 0 0 0-7 7v3.5A2.5 2.5 0 0 0 7.5 15H9V9H7V9a5 5 0 0 1 10 0v6h-3v2h3.5a2.5 2.5 0 0 0 2.5-2.5V9a7 7 0 0 0-7-7Z" />
    ),
  },
  {
    title: "Sales and partnerships",
    note: "Bulk credits, an agency account, or working together.",
    tone: { fg: "#8B5CF6", bg: "#F3EEFF", line: "#DDD0FA" },
    icon: (
      <path d="M3 7h18v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm5 0V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    ),
  },
  {
    title: "Security",
    note: "Report a vulnerability. We will not take it badly.",
    tone: { fg: "#C5221F", bg: "#FCE8E6", line: "#F5C7C3" },
    icon: <path d="M12 3l7 3v6c0 4.4-3 8.2-7 9-4-.8-7-4.6-7-9V6l7-3Z" />,
  },
];

export default function Contact() {
  const isPhone = useIsMobile(680);

  return (
    <LegalPage
      title="Contact us"
      subtitle={`A real person reads these. If you write to us about a payment or a missing script, include the email address on your account and we can usually answer in one reply instead of three.`}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isPhone ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12, marginBottom: 34,
        }}
      >
        {DESKS.map((d) => (
          <a
            key={d.title}
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`${BRAND}: ${d.title}`)}`}
            className="hg-row"
            style={{
              display: "block", padding: 18, borderRadius: "var(--radius)",
              background: "var(--card)", border: "1px solid var(--line)",
              textDecoration: "none",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: "grid", placeItems: "center", width: 38, height: 38,
                borderRadius: 10, marginBottom: 12,
                background: d.tone.bg, border: `1px solid ${d.tone.line}`, color: d.tone.fg,
              }}
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                {d.icon}
              </svg>
            </span>
            <span style={{ display: "block", fontSize: 15, fontWeight: 650, color: "var(--ink)", marginBottom: 4 }}>
              {d.title}
            </span>
            <span style={{ display: "block", fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-mute)", marginBottom: 10 }}>
              {d.note}
            </span>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", wordBreak: "break-all" }}>
              {SUPPORT_EMAIL}
            </span>
          </a>
        ))}
      </div>

      <Section n="1" title="One inbox, on purpose">
        <P>
          All three go to the same address today, because {BRAND} is a small team and
          routing you through departments that do not exist would only slow down the
          reply. We answer within two working days, and usually much sooner.
        </P>
      </Section>

      <Section n="2" title="Registered office">
        <div
          style={{
            padding: 18, borderRadius: "var(--radius)",
            background: "var(--card)", border: "1px solid var(--line)",
            maxWidth: "68ch",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 650, color: "var(--ink)", marginBottom: 10 }}>
            {ORG}
          </div>
          <address style={{ fontStyle: "normal", fontSize: 14.5, lineHeight: 1.9, color: "var(--ink-body)" }}>
            {ADDRESS_LINES.map((l) => (
              <span key={l} style={{ display: "block" }}>{l}</span>
            ))}
          </address>
          <div style={{ fontSize: 12.5, color: "var(--ink-mute)", marginTop: 10 }}>
            Registered and operational address
          </div>
        </div>
      </Section>

      <Section n="3" title="Before you write about a payment">
        <P>
          Have your <B>Razorpay payment id</B> to hand. It is on the receipt email
          Razorpay sends the moment a payment succeeds, and it lets us find the exact
          transaction rather than asking you for more details.
        </P>
      </Section>
    </LegalPage>
  );
}

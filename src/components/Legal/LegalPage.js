import { useEffect } from "react";
import { Link } from "react-router-dom";
import Logo from "../Shell/Logo";
import useIsMobile from "../../hooks/useIsMobile";

/**
 * LegalPage.js: the frame every policy page is drawn in.
 *
 * ── WHY THESE ARE DOCUMENTS AND NOT MARKETING ───────────────────────────────
 * The landing page is dark, animated and selling. These are not that. Someone
 * arrives here for one of two reasons: they are deciding whether to trust us
 * with a payment, or something has gone wrong and they need an address. Both
 * are reading tasks, so the page is light, narrow, and quiet, and the only
 * thing it does well is hold text at a comfortable measure.
 *
 * They share one frame so the five pages read as one document set. Five
 * separately styled policy pages is how a small company looks like it bought
 * its terms from five different places.
 *
 * ── WHY THEY SIT OUTSIDE THE APP SHELL ──────────────────────────────────────
 * No sidebar, no channel bar, no credits. These are public: a payment provider
 * checking us, a creator who has not signed up, and a signed-in user all get
 * the same page, and none of them should need an account to read our refund
 * terms. See App.js, where the routes sit above the auth gate.
 */
export const ORG = "Betafounder Enterprises";
export const BRAND = "Lipi";
export const SITE = "trylipi.online";
export const SUPPORT_EMAIL = "sreeram@trylipi.online";

/**
 * The WhatsApp line, in international format with no +, spaces or dashes.
 *
 * ── THE SHAPE MATTERS, NOT JUST THE DIGITS ───────────────────────────────────
 * wa.me takes the country code and the number as one unbroken run: "919876543210"
 * for an Indian mobile. A leading +, a space or a dash produces a link that opens
 * WhatsApp to a "phone number is invalid" dialog rather than to a chat, which is
 * a worse failure than no button at all because it happens after the tap.
 *
 * It lives here beside the email and the postal address because it is the same
 * kind of fact: one place the company's real contact details are written down,
 * so the support screen, the contact page and anything added later cannot
 * disagree about how to reach us.
 */
export const SUPPORT_WHATSAPP = "917893406517";
export const ADDRESS_LINES = [
  "Plot no - 20, 2nd Floor, 302,",
  "Behind Lucid Hospital, Kukatpally,",
  "Hyderabad, Telangana 500072, India.",
];

/** One date for the whole set, so the pages cannot disagree about their age. */
export const LAST_UPDATED = "7 September 2026";

export default function LegalPage({ title, subtitle, updated = LAST_UPDATED, children }) {
  const isPhone = useIsMobile(680);

  // These are linked from a footer and opened in their own tab, so each one
  // arrives as a fresh page with no title of its own unless it sets one.
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} · ${BRAND}`;
    return () => { document.title = prev; };
  }, [title]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          borderBottom: "1px solid var(--line)", background: "var(--card)",
          padding: `0 ${isPhone ? 18 : 30}px`, flexShrink: 0,
        }}
      >
        <div
          style={{
            maxWidth: 760, margin: "0 auto", height: isPhone ? 56 : 64,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
          }}
        >
          <Link to="/" style={{ textDecoration: "none", minWidth: 0 }}>
            <Logo size={isPhone ? 24 : 26} fontSize={isPhone ? 15 : 16} />
          </Link>
          <Link
            to="/"
            style={{
              fontSize: 13, fontWeight: 600, color: "var(--ink-mute)",
              textDecoration: "none", whiteSpace: "nowrap",
            }}
          >
            Back to {SITE}
          </Link>
        </div>
      </header>

      <main style={{ flex: 1, padding: `${isPhone ? 30 : 52}px ${isPhone ? 18 : 30}px ${isPhone ? 50 : 80}px` }}>
        <article style={{ maxWidth: 760, margin: "0 auto" }}>
          <h1
            style={{
              fontSize: isPhone ? 28 : 38, fontWeight: 750, letterSpacing: "-0.035em",
              color: "var(--ink)", margin: "0 0 10px", lineHeight: 1.12,
            }}
          >
            {title}
          </h1>

          {subtitle && (
            <p
              style={{
                fontSize: isPhone ? 15 : 16.5, color: "var(--ink-body)",
                lineHeight: 1.65, margin: "0 0 16px", maxWidth: "60ch",
              }}
            >
              {subtitle}
            </p>
          )}

          <div
            style={{
              display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center",
              paddingBottom: 26, marginBottom: 30, borderBottom: "1px solid var(--line)",
              fontSize: 12.5, color: "var(--ink-mute)",
            }}
          >
            <span
              style={{
                fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase",
                fontSize: 11, padding: "4px 9px", borderRadius: 999,
                background: "var(--made-tint)", border: "1px solid var(--made-line)", color: "var(--made)",
              }}
            >
              {ORG}
            </span>
            <span>Last updated {updated}</span>
          </div>

          {children}

          {/* Every page ends the same way, because on a policy page the useful
              last line is always "and if this did not answer it, here". */}
          <div
            style={{
              marginTop: 44, padding: isPhone ? 18 : 22, borderRadius: "var(--radius)",
              background: "var(--card)", border: "1px solid var(--line)",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 650, color: "var(--ink)", marginBottom: 6 }}>
              Still need a person?
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--ink-body)", margin: 0 }}>
              Email{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "var(--ink)", fontWeight: 600 }}>
                {SUPPORT_EMAIL}
              </a>{" "}
              and a human will answer. Include the email address on your account
              so we can find it without asking you twice.
            </p>
          </div>
        </article>
      </main>

      <footer
        style={{
          borderTop: "1px solid var(--line)", background: "var(--card)",
          padding: `18px ${isPhone ? 18 : 30}px`, flexShrink: 0,
        }}
      >
        <div
          style={{
            maxWidth: 760, margin: "0 auto", display: "flex", flexWrap: "wrap",
            gap: 12, alignItems: "center", justifyContent: "space-between",
            fontSize: 12.5, color: "var(--ink-mute)",
          }}
        >
          <span>© {new Date().getFullYear()} {ORG}</span>
          <nav style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            {LEGAL_LINKS.map((l) => (
              <Link key={l.to} to={l.to} style={{ color: "var(--ink-mute)", textDecoration: "none" }}>
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}

/**
 * The set, in one place.
 *
 * Read by the landing page's Company column and by the footer above, so a page
 * added here appears in both without anybody remembering to do it twice.
 */
export const LEGAL_LINKS = [
  { to: "/privacy",  label: "Privacy Policy" },
  { to: "/terms",    label: "Terms of Service" },
  { to: "/refunds",  label: "Cancellation & Refunds" },
  { to: "/shipping", label: "Delivery Policy" },
  { to: "/contact",  label: "Contact Us" },
];

/* ── Shared pieces ─────────────────────────────────────────────────────── */

export function Section({ n, title, children }) {
  return (
    <section style={{ marginBottom: 34 }}>
      <h2
        style={{
          fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em",
          color: "var(--ink)", margin: "0 0 12px",
          display: "flex", alignItems: "baseline", gap: 10,
        }}
      >
        {n && (
          <span
            style={{
              fontSize: 12.5, fontWeight: 600, color: "var(--ink-mute)",
              fontVariantNumeric: "tabular-nums", flexShrink: 0,
            }}
          >
            {n}
          </span>
        )}
        {title}
      </h2>
      <div style={{ fontSize: 15, lineHeight: 1.75, color: "var(--ink-body)" }}>{children}</div>
    </section>
  );
}

export function P({ children }) {
  return <p style={{ margin: "0 0 12px", maxWidth: "68ch" }}>{children}</p>;
}

export function List({ children }) {
  return (
    <ul style={{ margin: "0 0 12px", paddingLeft: 20, maxWidth: "68ch" }}>
      {children}
    </ul>
  );
}

export function LI({ children }) {
  return <li style={{ marginBottom: 7 }}>{children}</li>;
}

export function B({ children }) {
  return <strong style={{ color: "var(--ink)", fontWeight: 600 }}>{children}</strong>;
}

/** A fact worth pulling out of the prose, because someone is scanning for it. */
export function Callout({ children, tone = "neutral" }) {
  const tones = {
    neutral: { bg: "var(--made-tint)", border: "var(--made-line)" },
    warn:    { bg: "#FBF5E8",          border: "#EEDCB6" },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <div
      style={{
        margin: "0 0 14px", padding: "13px 15px", borderRadius: 10,
        background: t.bg, border: `1px solid ${t.border}`,
        fontSize: 14.5, lineHeight: 1.65, color: "var(--ink-body)", maxWidth: "68ch",
      }}
    >
      {children}
    </div>
  );
}

/** Label/value rows, for the tables these pages keep needing. */
export function Facts({ rows }) {
  return (
    <div
      style={{
        display: "grid", gap: 1, background: "var(--line)",
        border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden",
        margin: "0 0 14px", maxWidth: "68ch",
      }}
    >
      {rows.map(([k, v]) => (
        <div
          key={k}
          style={{
            display: "grid", gridTemplateColumns: "minmax(140px, 34%) 1fr", gap: 14,
            background: "var(--card)", padding: "12px 15px", fontSize: 14.5,
          }}
        >
          <span style={{ color: "var(--ink-mute)", fontWeight: 500 }}>{k}</span>
          <span style={{ color: "var(--ink-body)", lineHeight: 1.6 }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

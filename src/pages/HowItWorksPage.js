import { useState, useEffect } from "react";
import Navbar from "../components/LandingPage/Navbar";
import Footer from "../components/LandingPage/Footer";

const STEPS = [
  {
    number: "01",
    title: "Connect your MongoDB",
    summary: "Paste your connection string. Read-only access. Done in 60 seconds.",
    detail: "Chomske requests read-only credentials to your MongoDB instance. No write permissions, no stored passwords. Your URI is encrypted at rest and only used during the scheduled analysis window each morning.",
    code: `// What Chomske requests
mongodb+srv://chomske-readonly:<token>@cluster.mongodb.net/

// Permissions granted
readAnyDatabase: true
writeAnyDatabase: false`,
    label: "Connection",
  },
  {
    number: "02",
    title: "Chomske maps your schema",
    summary: "No manual config. Chomske fingerprints your collections automatically.",
    detail: "On first connect, Chomske samples your collections and builds a schema fingerprint — field names, data types, event patterns. It identifies which fields represent user activity, subscription state, and engagement signals. You review and confirm the mapping once.",
    code: `// Auto-detected schema signals
users.last_active_at      → activity timestamp
users.plan                → subscription tier
events.type               → action identifier
events.created_at         → event time
subscriptions.status      → billing state`,
    label: "Schema Map",
  },
  {
    number: "03",
    title: "Analysis runs every morning",
    summary: "Four detection engines run at 6 AM. No cron jobs to configure.",
    detail: "Each morning, Chomske runs four targeted queries against your data. It looks for onboarding gaps, silent paying users, power users on free plans, and feature drop-offs. Each engine applies threshold logic specific to SaaS retention patterns.",
    code: `// Engine: Ghosting Triage
SELECT users WHERE
  subscription_active = true
  AND last_action_at < NOW() - INTERVAL 7 DAYS
ORDER BY mrr DESC
LIMIT 20`,
    label: "Analysis",
  },
  {
    number: "04",
    title: "You get a list, not a dashboard",
    summary: "Names. Context. What to do. Delivered to your inbox by 7 AM.",
    detail: "The output is deliberately not a chart. You get a prioritized list: user name, plan, days since last action, and a one-line context note. No interpretation needed. The first action on each user is suggested — reach out, upgrade nudge, or support follow-up.",
    code: `// Your daily brief (sample)
Ghosting Triage — 3 users
─────────────────────────
Neha T.   · Creator · 18d silent
Sid V.    · Creator · 12d silent
Karan D.  · Pro     · 9d silent

→ Suggested: personal check-in email`,
    label: "Brief",
  },
];

function StepRow({ step, isMobile, isLast }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ display: "flex", gap: isMobile ? 16 : 40, position: "relative" }}>
      {/* Timeline line */}
      {!isLast && (
        <div style={{
          position: "absolute",
          left: isMobile ? 19 : 27,
          top: isMobile ? 40 : 52,
          width: 2,
          bottom: -32,
          background: "linear-gradient(180deg, #E2E8F0 0%, transparent 100%)",
          zIndex: 0,
        }} />
      )}

      {/* Step indicator */}
      <div style={{
        flexShrink: 0,
        width: isMobile ? 40 : 56,
        height: isMobile ? 40 : 56,
        borderRadius: "50%",
        background: "#fff",
        border: "2px solid #E2E8F0",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1,
        marginTop: 2,
      }}>
        <span style={{
          fontSize: isMobile ? 11 : 13,
          fontWeight: 800,
          color: "#94A3B8",
          letterSpacing: "0.02em",
          fontVariantNumeric: "tabular-nums",
        }}>{step.number}</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 40 }}>
        {/* Label pill */}
        <span style={{
          display: "inline-block",
          fontSize: 10,
          fontWeight: 700,
          color: "#6366F1",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}>{step.label}</span>

        <h3 style={{
          fontSize: isMobile ? "1.1rem" : "1.3rem",
          fontWeight: 800,
          color: "#0F172A",
          margin: "0 0 8px",
          letterSpacing: "-0.025em",
          lineHeight: 1.25,
        }}>{step.title}</h3>

        <p style={{
          fontSize: isMobile ? 14 : 15,
          color: "#64748B",
          margin: "0 0 16px",
          lineHeight: 1.65,
        }}>{step.summary}</p>

        {/* Toggle detail */}
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            background: "none", border: "none",
            cursor: "pointer", padding: 0,
            fontSize: 13, fontWeight: 600,
            color: "#6366F1",
            display: "flex", alignItems: "center", gap: 5,
          }}
        >
          <span>{open ? "Hide detail" : "How exactly?"}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            style={{ transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {open && (
          <div style={{ marginTop: 20 }}>
            <p style={{
              fontSize: isMobile ? 13.5 : 14.5,
              color: "#475569",
              lineHeight: 1.75,
              margin: "0 0 16px",
            }}>{step.detail}</p>

            <div style={{
              background: "#0F172A",
              borderRadius: 10,
              padding: isMobile ? "16px 16px" : "18px 22px",
              border: "1px solid #1E293B",
            }}>
              <pre style={{
                margin: 0,
                fontSize: isMobile ? 11 : 12,
                color: "#94A3B8",
                fontFamily: "'JetBrains Mono','Fira Code',monospace",
                lineHeight: 1.7,
                overflowX: "auto",
                whiteSpace: "pre-wrap",
              }}>{step.code}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function HowItWorksPage() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width:900px)").matches
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const h = () => setIsMobile(window.matchMedia("(max-width:900px)").matches);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", background: "#FAFAFA", minHeight: "100vh" }}>
      <Navbar />

      {/* Hero */}
      <section style={{
        padding: isMobile ? "100px 20px 56px" : "140px 60px 80px",
        maxWidth: 760, margin: "0 auto",
      }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: "#6366F1", letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 16px" }}>
          How It Works
        </p>
        <h1 style={{
          fontSize: isMobile ? "clamp(1.8rem, 7vw, 2.5rem)" : "clamp(2.2rem, 3.5vw, 3rem)",
          fontWeight: 800, color: "#0F172A", lineHeight: 1.18,
          letterSpacing: "-0.03em", margin: "0 0 18px",
        }}>
          Four steps.<br />
          <span style={{ color: "#94A3B8", fontWeight: 500 }}>Runs while you sleep.</span>
        </h1>
        <p style={{ fontSize: isMobile ? 14 : 16, color: "#64748B", lineHeight: 1.7, margin: 0, maxWidth: 520 }}>
          Connect once. Chomske handles the rest — schema mapping, daily analysis, and
          a morning brief with the users that actually need your attention.
        </p>
      </section>

      {/* Steps timeline */}
      <section style={{ padding: isMobile ? "0 20px 80px" : "0 60px 100px", maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {STEPS.map((step, i) => (
            <StepRow
              key={i}
              step={step}
              isMobile={isMobile}
              isLast={i === STEPS.length - 1}
            />
          ))}
        </div>
      </section>

      {/* Trust section */}
      <section style={{
        padding: isMobile ? "0 20px 80px" : "0 60px 100px",
        maxWidth: 760, margin: "0 auto",
      }}>
        <div style={{
          background: "#F1F5F9",
          borderRadius: isMobile ? 14 : 18,
          padding: isMobile ? "28px 24px" : "36px 48px",
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
          gap: isMobile ? 20 : 32,
        }}>
          {[
            { stat: "Read-only", label: "MongoDB access — Chomske never writes to your database" },
            { stat: "6 AM", label: "Analysis runs every morning before you start work" },
            { stat: "≤ 3", label: "Users flagged per engine — names, not numbers" },
          ].map((item, i) => (
            <div key={i} style={{ textAlign: isMobile ? "left" : "center" }}>
              <div style={{
                fontSize: isMobile ? "1.4rem" : "1.8rem",
                fontWeight: 800,
                color: "#0F172A",
                letterSpacing: "-0.04em",
                marginBottom: 6,
              }}>{item.stat}</div>
              <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.55 }}>{item.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{
        padding: isMobile ? "0 20px 80px" : "0 60px 100px",
        maxWidth: 760, margin: "0 auto", textAlign: "center",
      }}>
        <div style={{
          background: "#0F172A", borderRadius: isMobile ? 16 : 20,
          padding: isMobile ? "36px 24px" : "48px 60px",
        }}>
          <h2 style={{
            fontSize: isMobile ? "1.4rem" : "1.8rem",
            fontWeight: 800, color: "#fff",
            margin: "0 0 12px", letterSpacing: "-0.025em",
          }}>
            Ready to see your first brief?
          </h2>
          <p style={{ fontSize: isMobile ? 13.5 : 15, color: "rgba(255,255,255,0.5)", margin: "0 0 28px", lineHeight: 1.6 }}>
            Connect your MongoDB. Your first analysis runs overnight.
          </p>
          <button style={{
            background: "#fff", color: "#0F172A",
            fontSize: 15, fontWeight: 700,
            padding: "14px 36px", borderRadius: 10,
            border: "none", cursor: "pointer",
          }}>
            Join Waitlist →
          </button>
        </div>
      </section>

      <Footer />
    </div>
  );
}

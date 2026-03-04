import { useState, useEffect } from "react";
import Navbar from "../components/LandingPage/Navbar";
import Footer from "../components/LandingPage/Footer";
import WaitlistModal from "../components/LandingPage/WaitlistModal";

const ENGINES = [
  {
    number: "01",
    color: "#F59E0B",
    title: "Onboarding Momentum",
    tagline: "Setup complete. Core feature never used.",
    description: "The 48-hour window after signup is the highest-leverage moment in your funnel. Most founders never know when it closes. Chomske surfaces users who completed onboarding but never took a meaningful action — while they still want it to work.",
    signals: [
      { field: "onboarding_completed", value: "true", note: "They finished setup" },
      { field: "last_core_action_at", value: "null", note: "Never used the main feature" },
      { field: "hours_since_signup", value: "> 48", note: "Window is closing" },
    ],
    output: "A short list of users still in the intent window, ranked by time since signup.",
    action: "A 2-line personal email. Offer to help. Response rate: high.",
    why: "They signed up because they had a problem. They still have it. You just have to show up.",
  },
  {
    number: "02",
    color: "#EF4444",
    title: "Ghosting Triage",
    tagline: "Paying users go silent. You find out from Stripe.",
    description: "They were active every day. Then less. Then not at all. You were building. Chomske watches the silence and flags it before Stripe sends the cancellation notification.",
    signals: [
      { field: "subscription_active", value: "true", note: "Still paying" },
      { field: "activity_last_7d", value: "0 events", note: "Zero engagement" },
      { field: "days_since_last_action", value: "> 7", note: "Going cold" },
    ],
    output: "At-risk users ranked by MRR and days since last action.",
    action: "Personal check-in. Not a re-engagement campaign — a message.",
    why: "A user who stops using your product is already half-cancelled. The window to reverse it is 7–14 days.",
  },
  {
    number: "03",
    color: "#10B981",
    title: "Silent Power User",
    tagline: "Your best free user hasn't heard from you.",
    description: "Someone on your free tier used your product 142 times this month. They've hit limits 3 times. They're clearly getting value. Nobody told you. They'll either upgrade or find an alternative — depending on whether you reach out first.",
    signals: [
      { field: "plan", value: "free", note: "Not paying yet" },
      { field: "actions_count_30d", value: "> 100", note: "Heavy usage" },
      { field: "limit_hit_count", value: "> 1", note: "Bumping against ceiling" },
    ],
    output: "Free users ready for an upgrade conversation, ranked by usage intensity.",
    action: "A direct note. Not a drip sequence — a human message.",
    why: "This is the easiest revenue in your pipeline. They already love the product.",
  },
  {
    number: "04",
    color: "#8B5CF6",
    title: "Feature Drop-off",
    tagline: "Users churn at one specific step. Your product isn't the problem.",
    description: "They created 5 items. They never completed the first one. They stalled at the same step for 3 days. The feature works — they're stuck. One contextual nudge at the right moment saves this relationship.",
    signals: [
      { field: "feature_started", value: "true", note: "Began the flow" },
      { field: "feature_completed", value: "false", note: "Never finished" },
      { field: "days_inactive_in_flow", value: "> 3", note: "Stuck" },
    ],
    output: "A support alert with the exact drop-off step and a suggested message.",
    action: "A short in-product nudge or email with a specific offer to help.",
    why: "Most churn isn't about your product. It's about a moment where nobody helped.",
  },
];

function SignalRow({ sig, color }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 120px",
      gap: 12,
      padding: "10px 0",
      borderBottom: "1px solid #F1F5F9",
    }}>
      <div>
        <code style={{
          fontSize: 12,
          color: "#374151",
          fontFamily: "'JetBrains Mono','Fira Code',monospace",
          display: "block",
          marginBottom: 2,
        }}>{sig.field}</code>
        <span style={{ fontSize: 12, color: "#94A3B8" }}>{sig.note}</span>
      </div>
      <div style={{
        textAlign: "right",
        alignSelf: "center",
      }}>
        <code style={{
          fontSize: 12,
          color: color,
          fontFamily: "'JetBrains Mono','Fira Code',monospace",
          background: `${color}10`,
          padding: "2px 8px",
          borderRadius: 4,
        }}>{sig.value}</code>
      </div>
    </div>
  );
}

function EngineCard({ eng, isMobile }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{
      background: "#fff",
      border: "1px solid #E2E8F0",
      borderRadius: isMobile ? 16 : 20,
      overflow: "hidden",
      transition: "box-shadow 0.2s",
      boxShadow: open ? "0 16px 40px -12px rgba(0,0,0,0.1)" : "0 2px 8px -2px rgba(0,0,0,0.04)",
    }}>
      {/* Card header — always visible */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", background: "none", border: "none",
          cursor: "pointer", textAlign: "left",
          padding: isMobile ? "24px 20px" : "28px 36px",
          display: "flex", alignItems: "flex-start", gap: isMobile ? 16 : 24,
        }}
      >
        {/* Number */}
        <span style={{
          fontSize: isMobile ? 32 : 44,
          fontWeight: 900,
          color: `${eng.color}20`,
          letterSpacing: "-0.06em",
          lineHeight: 1,
          flexShrink: 0,
          fontVariantNumeric: "tabular-nums",
          minWidth: isMobile ? 52 : 66,
          paddingTop: 2,
        }}>{eng.number}</span>

        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: isMobile ? "1rem" : "1.2rem",
            fontWeight: 800, color: "#0F172A",
            letterSpacing: "-0.025em", lineHeight: 1.25,
            marginBottom: 6,
          }}>{eng.title}</div>
          <div style={{
            fontSize: isMobile ? 13 : 14,
            color: "#64748B",
            lineHeight: 1.55,
          }}>{eng.tagline}</div>

          {/* Expand indicator */}
          <div style={{
            marginTop: 12,
            fontSize: 12, fontWeight: 600,
            color: eng.color,
            display: "flex", alignItems: "center", gap: 4,
          }}>
            <span>{open ? "Collapse" : "See how it works"}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
              style={{ transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>

        {/* Color accent bar */}
        <div style={{
          width: 4, alignSelf: "stretch",
          borderRadius: 4,
          background: open ? eng.color : `${eng.color}30`,
          flexShrink: 0,
          transition: "background 0.2s",
          minHeight: 56,
        }} />
      </button>

      {/* Expanded content */}
      {open && (
        <div style={{
          padding: isMobile ? "0 20px 28px" : "0 36px 36px",
          borderTop: "1px solid #F1F5F9",
        }}>
          {/* Description */}
          <p style={{
            fontSize: isMobile ? 14 : 15,
            color: "#475569",
            lineHeight: 1.75,
            margin: "24px 0 24px",
            fontStyle: "italic",
          }}>
            "{eng.description}"
          </p>

          {/* Two-col grid on desktop */}
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            gap: isMobile ? 16 : 24,
          }}>
            {/* Signals */}
            <div style={{
              background: "#F8FAFC",
              borderRadius: 12,
              padding: "16px 20px",
              border: "1px solid #E2E8F0",
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700,
                color: "#94A3B8", letterSpacing: "0.07em",
                textTransform: "uppercase", marginBottom: 12,
              }}>What Chomske detects</div>
              {eng.signals.map((sig, i) => (
                <SignalRow key={i} sig={sig} color={eng.color} />
              ))}
            </div>

            {/* Output + action */}
            <div style={{
              background: `${eng.color}06`,
              borderRadius: 12,
              padding: "16px 20px",
              border: `1px solid ${eng.color}18`,
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}>
              <div>
                <div style={{
                  fontSize: 10, fontWeight: 700,
                  color: eng.color, letterSpacing: "0.07em",
                  textTransform: "uppercase", marginBottom: 8,
                }}>Output</div>
                <p style={{ margin: 0, fontSize: isMobile ? 13 : 13.5, color: "#374151", lineHeight: 1.6 }}>
                  {eng.output}
                </p>
              </div>
              <div>
                <div style={{
                  fontSize: 10, fontWeight: 700,
                  color: eng.color, letterSpacing: "0.07em",
                  textTransform: "uppercase", marginBottom: 8,
                }}>Suggested action</div>
                <p style={{ margin: 0, fontSize: isMobile ? 13 : 13.5, color: "#374151", lineHeight: 1.6 }}>
                  {eng.action}
                </p>
              </div>
              <div style={{
                borderTop: `1px solid ${eng.color}20`,
                paddingTop: 12,
              }}>
                <p style={{ margin: 0, fontSize: isMobile ? 12 : 12.5, color: "#64748B", lineHeight: 1.55, fontStyle: "italic" }}>
                  {eng.why}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EnginesPage() {
  const [showWaitlist, setShowWaitlist] = useState(false);
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
        maxWidth: 800, margin: "0 auto",
      }}>
        <p style={{
          fontSize: 12, fontWeight: 700, color: "#6366F1",
          letterSpacing: "0.06em", textTransform: "uppercase",
          margin: "0 0 16px",
        }}>
          4 Engines
        </p>
        <h1 style={{
          fontSize: isMobile ? "clamp(1.8rem, 7vw, 2.5rem)" : "clamp(2.2rem, 3.5vw, 3rem)",
          fontWeight: 800, color: "#0F172A", lineHeight: 1.18,
          letterSpacing: "-0.03em", margin: "0 0 18px",
        }}>
          Chomske runs four detection engines.<br />
          <span style={{ color: "#94A3B8", fontWeight: 500 }}>Every morning. Automatically.</span>
        </h1>
        <p style={{ fontSize: isMobile ? 14 : 16, color: "#64748B", lineHeight: 1.7, margin: 0, maxWidth: 560 }}>
          Each engine targets a specific failure mode in SaaS retention.
          Expand any engine to see what signals it reads and what you get back.
        </p>
      </section>

      {/* Engine list */}
      <section style={{
        padding: isMobile ? "0 20px 80px" : "0 60px 100px",
        maxWidth: 800, margin: "0 auto",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 10 : 12 }}>
          {ENGINES.map((eng, i) => (
            <EngineCard key={i} eng={eng} isMobile={isMobile} />
          ))}
        </div>
      </section>

      {/* What Chomske does NOT do */}
      <section style={{
        padding: isMobile ? "0 20px 80px" : "0 60px 100px",
        maxWidth: 800, margin: "0 auto",
      }}>
        <div style={{
          background: "#F8FAFC",
          border: "1px solid #E2E8F0",
          borderRadius: isMobile ? 14 : 18,
          padding: isMobile ? "28px 24px" : "36px 48px",
        }}>
          <h3 style={{
            fontSize: isMobile ? "1rem" : "1.1rem",
            fontWeight: 800, color: "#0F172A",
            margin: "0 0 20px",
            letterSpacing: "-0.02em",
          }}>
            What the engines don't do
          </h3>
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            gap: isMobile ? 12 : 16,
          }}>
            {[
              { no: "No dashboards", yes: "A list with names" },
              { no: "No cohort charts", yes: "The 3 users behind the drop" },
              { no: "No alerts to configure", yes: "Runs on a fixed morning schedule" },
              { no: "No queries to write", yes: "Schema auto-detected on connect" },
            ].map((item, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 0",
                borderBottom: i < 3 && !isMobile ? "none" : i < 3 ? "1px solid #E2E8F0" : "none",
              }}>
                <div style={{
                  fontSize: 13, color: "#94A3B8",
                  textDecoration: "line-through",
                  flex: 1,
                }}>{item.no}</div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12h14M12 5l7 7-7 7" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div style={{
                  fontSize: 13, fontWeight: 600, color: "#0F172A",
                  flex: 1, textAlign: "right",
                }}>{item.yes}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{
        padding: isMobile ? "0 20px 80px" : "0 60px 100px",
        maxWidth: 800, margin: "0 auto", textAlign: "center",
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
            All four run every morning.<br />You just read the brief.
          </h2>
          <p style={{ fontSize: isMobile ? 13.5 : 15, color: "rgba(255,255,255,0.5)", margin: "0 0 28px", lineHeight: 1.6 }}>
            Connect your MongoDB once. No dashboards to check.
          </p>
          <button
            onClick={() => setShowWaitlist(true)}
            style={{
              background: "#fff", color: "#0F172A",
              fontSize: 15, fontWeight: 700,
              padding: "14px 36px", borderRadius: 10,
              border: "none", cursor: "pointer",
            }}>
            Join Waitlist →
          </button>
        </div>
      </section>

      {showWaitlist && <WaitlistModal onClose={() => setShowWaitlist(false)} />}
      <Footer />
    </div>
  );
}

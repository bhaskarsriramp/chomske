import { useState, useEffect } from "react";
import Navbar from "../components/LandingPage/Navbar";
import Footer from "../components/LandingPage/Footer";

const PROBLEMS = [
  {
    number: "01",
    color: "#F59E0B",
    title: "The Onboarding Gap",
    sentence: "Users finish setup but never use the core feature.",
    story: "They signed up. They clicked through onboarding. They set their profile. Then — nothing. The 48-hour window after setup is the highest-leverage moment in your entire funnel. Most founders never know it happened.",
    trigger: ["onboarding_completed: true", "last_core_action_at: null", "hours_since_signup: > 48"],
    output: "A list of users to reach out to while they're still in the mindset of making it work.",
    why: "A 2-line email sent at the right moment has 10× the impact of any re-engagement campaign.",
  },
  {
    number: "02",
    color: "#EF4444",
    title: "The Ghosting Problem",
    sentence: "Paying users go silent. You find out from Stripe.",
    story: "They were active every day. Then less. Then not at all. You didn't notice because you were building. Now Stripe just sent a cancellation email. This is the problem every solo founder knows on a Sunday night.",
    trigger: ["subscription_active: true", "activity_last_7d: 0", "days_since_last_action: > 7"],
    output: "At-risk users ranked by value and days since last action. Act before they cancel.",
    why: "Retention beats acquisition every time. You just need to see the signal before it's too late.",
  },
  {
    number: "03",
    color: "#10B981",
    title: "The Silent Power User",
    sentence: "Your best users are on the free plan. You haven't noticed.",
    story: "Someone on your free tier has used your product 142 times this month. They've hit your limits 3 times. They're clearly getting value — but nobody ever told you. They'll either upgrade or find an alternative. Which one depends on whether you reach out.",
    trigger: ["plan: free", "actions_count: > 100", "limit_hit_count: > 1"],
    output: "A short list of free users who are ready for an upgrade conversation right now.",
    why: "This is the easiest revenue in your pipeline. They already love the product.",
  },
  {
    number: "04",
    color: "#8B5CF6",
    title: "The Feature Wall",
    sentence: "Users churn at one specific feature. Your product isn't the problem.",
    story: "They created 5 conversations. They never sent a message. They stalled at the exact same step for 3 days. The feature works — they're just stuck. One contextual nudge, sent to the right person at the right time, would have saved this relationship.",
    trigger: ["feature_started: true", "feature_completed: false", "days_inactive: > 3"],
    output: "A support alert with the exact drop-off point and a suggested message to send.",
    why: "Most churn isn't about your product. It's about a moment where nobody helped.",
  },
];

function ProblemCard({ p, isMobile }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      border: "1px solid #E2E8F0",
      borderRadius: isMobile ? 14 : 18,
      overflow: "hidden",
      background: "#fff",
      transition: "box-shadow 0.2s ease",
      boxShadow: open ? "0 12px 32px -8px rgba(0,0,0,0.08)" : "0 2px 8px -2px rgba(0,0,0,0.04)",
    }}>
      {/* Header row */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", background: "none", border: "none", cursor: "pointer",
          padding: isMobile ? "20px 20px" : "24px 32px",
          display: "flex", alignItems: "center", gap: isMobile ? 14 : 20,
          textAlign: "left",
        }}
      >
        <span style={{
          fontSize: isMobile ? 28 : 36, fontWeight: 900,
          color: `${p.color}25`, letterSpacing: "-0.05em",
          flexShrink: 0, fontVariantNumeric: "tabular-nums",
          lineHeight: 1, minWidth: isMobile ? 44 : 54,
        }}>{p.number}</span>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: isMobile ? "1rem" : "1.15rem",
            fontWeight: 700, color: "#0F172A", lineHeight: 1.3,
            marginBottom: 4,
          }}>{p.title}</div>
          <div style={{ fontSize: isMobile ? 13 : 14, color: "#64748B" }}>{p.sentence}</div>
        </div>
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          background: `${p.color}12`, border: `1px solid ${p.color}30`,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, transition: "transform 0.2s ease",
          transform: open ? "rotate(45deg)" : "rotate(0)",
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={p.color} strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </div>
      </button>

      {/* Expanded content */}
      {open && (
        <div style={{
          padding: isMobile ? "0 20px 22px" : "0 32px 28px",
          borderTop: "1px solid #F1F5F9",
        }}>
          <p style={{
            fontSize: isMobile ? 13.5 : 15, color: "#334155",
            lineHeight: 1.75, margin: "20px 0 20px", fontStyle: "italic",
          }}>
            "{p.story}"
          </p>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 12 : 16 }}>
            <div style={{
              background: "#F8FAFC", borderRadius: 10, padding: "14px 16px",
              border: "1px solid #E2E8F0",
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.07em", marginBottom: 8 }}>
                WHAT CHOMSKE LOOKS FOR
              </div>
              {p.trigger.map((t, i) => (
                <code key={i} style={{
                  display: "block", fontSize: isMobile ? 11 : 11.5,
                  color: "#374151", fontFamily: "'JetBrains Mono','Fira Code',monospace",
                  lineHeight: 1.7,
                }}>{t}</code>
              ))}
            </div>
            <div style={{
              background: `${p.color}08`, borderRadius: 10, padding: "14px 16px",
              border: `1px solid ${p.color}20`,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: p.color, letterSpacing: "0.07em", marginBottom: 8 }}>
                WHAT YOU GET
              </div>
              <p style={{ margin: "0 0 10px", fontSize: isMobile ? 13 : 13.5, color: "#374151", lineHeight: 1.6 }}>{p.output}</p>
              <p style={{ margin: 0, fontSize: isMobile ? 12 : 12.5, color: "#64748B", lineHeight: 1.5, fontStyle: "italic" }}>{p.why}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProblemPage() {
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
          The Problems
        </p>
        <h1 style={{
          fontSize: isMobile ? "clamp(1.8rem, 7vw, 2.5rem)" : "clamp(2.2rem, 3.5vw, 3rem)",
          fontWeight: 800, color: "#0F172A", lineHeight: 1.18,
          letterSpacing: "-0.03em", margin: "0 0 18px",
        }}>
          4 problems killing your retention.<br />
          <span style={{ color: "#94A3B8", fontWeight: 500 }}>All of them preventable.</span>
        </h1>
        <p style={{ fontSize: isMobile ? 14 : 16, color: "#64748B", lineHeight: 1.7, margin: 0, maxWidth: 540 }}>
          Every SaaS founder faces these four moments. Most don't notice until
          it's already over. Expand each one to see how Chomske catches it early.
        </p>
      </section>

      {/* Problem list */}
      <section style={{ padding: isMobile ? "0 20px 80px" : "0 60px 100px", maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 10 : 12 }}>
          {PROBLEMS.map((p, i) => <ProblemCard key={i} p={p} isMobile={isMobile} />)}
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
            Chomske catches all four.<br />Every morning.
          </h2>
          <p style={{ fontSize: isMobile ? 13.5 : 15, color: "rgba(255,255,255,0.5)", margin: "0 0 28px", lineHeight: 1.6 }}>
            Connect your MongoDB once. Get your daily action list.
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

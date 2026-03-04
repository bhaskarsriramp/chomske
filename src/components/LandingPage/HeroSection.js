import { useState, useEffect } from "react";
import WaitlistModal from "./WaitlistModal";

const GHOST_USERS = [
  { name: "Neha T.", plan: "Pro", days: 18 },
  { name: "Sid V.",  plan: "Max", days: 12 },
  { name: "Karan D.", plan: "Pro",   days: 9  },
];

function GhostingCard({ isMobile }) {
  return (
    <div style={{
      background: "#111827",
      borderRadius: isMobile ? 16 : 20,
      overflow: "hidden",
      boxShadow: "0 24px 64px -16px rgba(0,0,0,0.18), 0 0 0 1px rgba(255,255,255,0.06)",
    }}>
      {/* Card header */}
      <div style={{
        padding: isMobile ? "11px 16px" : "13px 20px",
        background: "#0F172A",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {["#EF4444","#F59E0B","#10B981"].map((c, i) => (
            <div key={i} style={{ width: 9, height: 9, borderRadius: "50%", background: c, opacity: 0.75 }} />
          ))}
          <span style={{ fontSize: 10.5, fontWeight: 600, color: "rgba(255,255,255,0.35)", marginLeft: 6, letterSpacing: "0.06em" }}>
            Chomske · Today's Briefing
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%", background: "#10B981",
            animation: "pulseDot 2s ease-in-out infinite",
          }} />
          <span style={{ fontSize: 9.5, fontWeight: 700, color: "#10B981", letterSpacing: "0.06em" }}>Live</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: isMobile ? "18px 16px" : "22px 22px" }}>

        {/* Tag + headline */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)",
          borderRadius: 50, padding: "3px 11px 3px 8px", marginBottom: 12,
        }}>
          <span style={{ fontSize: 12 }}>👻</span>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: "#FCA5A5", letterSpacing: "0.04em" }}>Ghosting Triage</span>
        </div>

        <p style={{
          fontSize: isMobile ? 14 : 15, fontWeight: 600,
          color: "rgba(255,255,255,0.92)", margin: "0 0 16px", lineHeight: 1.45,
        }}>
          7 paying subscribers went completely silent this week.
        </p>

        {/* Trigger */}
        <div style={{
          background: "rgba(255,255,255,0.04)", borderRadius: 8,
          padding: "10px 13px", marginBottom: 14,
          border: "1px solid rgba(255,255,255,0.06)",
        }}>
          {[
            "subscription_active: true",
            "activity_last_7d: 0",
            "plan: Pro | Max",
          ].map((line, i) => (
            <code key={i} style={{
              display: "block", fontSize: isMobile ? 10.5 : 11,
              color: "rgba(167,243,208,0.8)",
              fontFamily: "'JetBrains Mono','Fira Code',monospace",
              lineHeight: 1.7,
            }}>{line}</code>
          ))}
        </div>

        {/* User rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
          {GHOST_USERS.map((u, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 11px",
              background: "rgba(239,68,68,0.07)",
              borderRadius: 8,
              borderLeft: "3px solid #EF4444",
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                background: "rgba(239,68,68,0.18)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, color: "#EF4444",
              }}>{u.name[0]}</div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{u.name}</span>
                <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)", marginLeft: 6 }}>{u.plan}</span>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#FCA5A5" }}>{u.days}d</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.04em" }}>silent</div>
              </div>
            </div>
          ))}
        </div>

        {/* Output */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
          borderRadius: 10, padding: "10px 14px",
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: "0.07em", marginBottom: 3 }}>
              Actionable Output
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "#FCA5A5" }}>
              At-Risk Priority List · 7 users
            </div>
            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
              Act before Stripe cancels
            </div>
          </div>
          <span style={{ fontSize: 18, color: "#EF4444" }}>→</span>
        </div>

      </div>
    </div>
  );
}

export default function Hero() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width:900px)").matches
  );
  const [isHovered, setIsHovered] = useState(false);
  const [showWaitlist, setShowWaitlist] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const h = () => setIsMobile(window.matchMedia("(max-width:900px)").matches);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  return (
    <>
      <style>{`
        @keyframes pulseDot { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes heroUp { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {showWaitlist && <WaitlistModal onClose={() => setShowWaitlist(false)} />}

      <section style={{
        position: "relative",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: isMobile ? "96px 20px 64px" : "140px 60px 100px",
        overflow: "hidden",
        background: "#FAFAFA",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}>

        {/* background glow */}
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
          <div style={{
            position: "absolute", top: "-15%", left: "50%", transform: "translateX(-50%)",
            width: isMobile ? 500 : 1000, height: isMobile ? 400 : 800,
            background: "radial-gradient(ellipse, rgba(99,102,241,0.07) 0%, transparent 70%)",
            filter: "blur(80px)", borderRadius: "50%",
          }} />
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0, height: 180,
            background: "linear-gradient(transparent, #FAFAFA)",
          }} />
        </div>

        <div style={{
          position: "relative", zIndex: 2, width: "100%",
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: "center",
          gap: isMobile ? 44 : "7vw",
          maxWidth: isMobile ? "100%" : "86%",
        }}>

          {/* ── LEFT ── */}
          <div style={{
            flex: "0 0 auto",
            width: isMobile ? "100%" : "50%",
            display: "flex", flexDirection: "column",
            alignItems: "flex-start",
          }}>

            <div style={{
              display: "inline-flex", alignItems: "center",
              margin: "0 0 20px",
              padding: isMobile ? "5px 12px" : "6px 14px",
              borderRadius: 999,
              background: "#EEF2FF",
              border: "1px solid #C7D2FE",
              animation: "heroUp 0.5s ease",
            }}>
              <span style={{
                fontSize: isMobile ? 11.5 : 12.5,
                fontWeight: 600,
                color: "#4F46E5",
                letterSpacing: "0.02em",
              }}>
                Operational Intelligence for SaaS Founders
              </span>
            </div>

            <h1 style={{
              fontSize: isMobile ? "clamp(2rem, 8vw, 2.6rem)" : "clamp(2.5rem, 3.5vw, 3.5rem)",
              fontWeight: 800,
              letterSpacing: "-0.028em",
              color: "#0F172A",
              margin: "0 0 20px",
              lineHeight: 1.30,
              textAlign: "left",
              animation: "heroUp 0.5s ease 0.07s backwards",
            }}>
              Stop finding out about churn from
              <span style={{ position: "relative", display: "inline-block", marginLeft: 10 }}>
                <span style={{
                  background: "#E0E7FF",
                  padding: isMobile ? "2px 8px 4px" : "3px 12px 5px",
                  borderRadius: 6,
                  fontStyle: "italic",
                  color: "#3730A3",
                }}>Stripe.</span>
                <span style={{
                  position: "absolute",
                  top: isMobile ? -9 : -12,
                  right: isMobile ? -7 : -9,
                  width: isMobile ? 9 : 12,
                  height: isMobile ? 20 : 25,
                  background: "#6366F1",
                  borderRadius: 3,
                }} />
              </span>
            </h1>

            <p style={{
              fontSize: isMobile ? "0.9rem" : "1.05rem",
              lineHeight: 1.7, color: "#475569",
              margin: "0 0 36px",
              fontWeight: 400,
              maxWidth: "100%",
              animation: "heroUp 0.5s ease 0.14s backwards",
            }}>
              Connect your MongoDB. Chomske reads your data every morning
              and tells you exactly who to reach out to, who's at risk, and
              who's ready to upgrade, before they make the decision.
            </p>

            {!isMobile && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
                <button
                  onMouseEnter={() => setIsHovered(true)}
                  onMouseLeave={() => setIsHovered(false)}
                  onClick={() => setShowWaitlist(true)}
                  style={{
                    background: "#0F172A",
                    color: "#fff",
                    fontSize: 16,
                    fontWeight: 700,
                    padding: "17px 40px",
                    borderRadius: 12,
                    border: "none",
                    cursor: "pointer",
                    boxShadow: isHovered
                      ? "0 20px 48px -8px rgba(15,23,42,0.45)"
                      : "0 8px 24px -4px rgba(15,23,42,0.28)",
                    transform: isHovered ? "translateY(-2px)" : "translateY(0)",
                    transition: "all 0.2s ease",
                    letterSpacing: "-0.01em",
                    animation: "heroUp 0.5s ease 0.21s backwards",
                  }}
                >
                  Join Waitlist →
                </button>
                <span style={{ fontSize: 12.5, color: "#94A3B8", fontWeight: 500 }}>
                  Free during beta · Read-only MongoDB access
                </span>
              </div>
            )}
          </div>

          {/* ── RIGHT ── */}
          <div style={{
            flex: 1,
            width: isMobile ? "100%" : "auto",
            maxWidth: isMobile ? "100%" : 440,
            marginLeft: isMobile ? 0 : "auto",
            animation: "heroUp 0.6s ease 0.18s backwards",
          }}>
            <GhostingCard isMobile={isMobile} />

            {isMobile && (
              <div style={{ marginTop: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <button
                  onClick={() => setShowWaitlist(true)}
                  style={{
                    background: "#0F172A", color: "#fff",
                    fontSize: 15, fontWeight: 700,
                    padding: "15px 28px", borderRadius: 12,
                    border: "none", cursor: "pointer",
                    width: "100%", maxWidth: 360,
                    boxShadow: "0 8px 24px -4px rgba(15,23,42,0.3)",
                  }}>
                  Join Waitlist →
                </button>
                <span style={{ fontSize: 12, color: "#94A3B8" }}>Free during beta · Read-only MongoDB access</span>
              </div>
            )}
          </div>

        </div>
      </section>
    </>
  );
}

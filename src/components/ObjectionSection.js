import { useState, useEffect } from "react";
import metaLogo from "../images/meta.png";

const objections = [
  {
    question: "Won't Instagram ban my account?",
    answer: "No. MyHandle is a Verified Meta Tech Provider. Verified by Meta like how it verified Nike, Adidas, and GymShark. Your account is 100% safe.",
    badge: { text: "Meta Verified", bg: "#EFF6FF", color: "#2563EB", border: "#BFDBFE", hasMeta: true },
    accent: "#2563EB", accentBg: "#EFF6FF",
  },
  {
    question: "Is this just another bot that sends generic messages?",
    answer: "Not even close. MyHandle's AI understands INTENT. It reads 'I want to lose 10kg for my wedding' vs 'nice post bro' — and knows the difference. It detects buying intent, budget, urgency, and goals.",
    accent: "#7C3AED", accentBg: "#F5F3FF",
  },
  // {
  //   question: "Can I actually afford this?",
  //   answer: "One client pays for 6 months of MyHandle. Siddarth got 17 clients in his first 60 days. The real question: can you afford NOT to use it?",
  //   badge: { text: "ROI: 17x", bg: "#F0FDF4", color: "#16A34A", border: "#BBF7D0" },
  //   accent: "#059669", accentBg: "#F0FDF4",
  // },
  {
    question: "Will this replace my personal touch?",
    answer: "No. MyHandle doesn't reply to leads — it FINDS them for you. You still do the selling, the relationship building. You just save 18+ hours per week on sorting through spam.",
    accent: "#D97706", accentBg: "#FFFBEB",
  },
  // {
  //   question: "What if I get too many leads?",
  //   answer: "Good problem to have! You can set daily limits, qualify leads by budget, and pause anytime. You're always in control.",
  //   accent: "#EC4899", accentBg: "#FDF2F8",
  // },
];

export default function ObjectionSection() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width:900px)").matches
  );
  const [openIdx, setOpenIdx] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setIsMobile(window.matchMedia("(max-width:900px)").matches);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <section style={{
      background: "#000000",
      padding: isMobile ? "64px 20px 56px" : "120px 60px 100px",
      fontFamily: "'Inter', sans-serif",
    }}>
      <style>{`
        .obj-card { transition: all 0.3s cubic-bezier(0.4,0,0.2,1); cursor: pointer; }
        .obj-card:hover { transform: translateY(-2px); box-shadow: 0 8px 28px -4px rgba(0,0,0,0.08); }
      `}</style>

      <div style={{ maxWidth: 680, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: isMobile ? 36 : 56 }}>
          <h2 style={{
            fontSize: isMobile ? "clamp(1.7rem, 7vw, 2.4rem)" : "clamp(2.8rem, 4.5vw, 3.2rem)",
            fontWeight: 800, color: "#FFFFFF", lineHeight: 1.08,
            letterSpacing: "-0.04em", marginBottom: isMobile ? 14 : 18,
          }}>
            "But wait..."
          </h2>
          <p style={{
            fontSize: isMobile ? "0.78rem" : "1.1rem", color: "#F7F0F0",
            lineHeight: 1.7, maxWidth: 440, margin: "0 auto", fontWeight: 400,
            padding: isMobile ? "0 8px" : 0,
          }}>
            Every question fitness creators ask — answered honestly.
          </p>
        </div>

        {/* Cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 10 : 14 }}>
          {objections.map((obj, i) => {
            const isOpen = openIdx === i;
            return (
              <div key={i} className="obj-card" style={{
                background: isOpen ? obj.accentBg : "#FAFAFA",
                borderRadius: isMobile ? 14 : 18,
                border: isOpen ? `1.5px solid ${obj.accent}25` : "1.5px solid transparent",
                boxShadow: isOpen ? `0 12px 32px -8px ${obj.accent}15` : "0 1px 4px rgba(0,0,0,0.03)",
                overflow: "hidden",
              }}
              onClick={() => setOpenIdx(isOpen ? null : i)}
              >
                <div style={{
                  padding: isMobile ? "16px 18px" : "24px 30px",
                  display: "flex", alignItems: "center", gap: isMobile ? 12 : 16,
                }}>
                  <div style={{
                    width: isMobile ? 34 : 40, height: isMobile ? 34 : 40,
                    borderRadius: isMobile ? 10 : 12, flexShrink: 0,
                    background: isOpen ? `${obj.accent}15` : "#F1F5F9",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.3s ease",
                  }}>
                    <svg width={isMobile ? "16" : "18"} height={isMobile ? "16" : "18"} viewBox="0 0 24 24" fill="none" stroke={isOpen ? obj.accent : "#94A3B8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </div>
                  <span style={{
                    flex: 1, fontSize: isMobile ? 13 : 16, fontWeight: 600,
                    color: "#0F172A", lineHeight: 1.35,
                  }}>
                    {obj.question}
                  </span>
                  <div style={{
                    width: isMobile ? 24 : 28, height: isMobile ? 24 : 28,
                    borderRadius: 8, flexShrink: 0,
                    background: isOpen ? `${obj.accent}15` : "#F1F5F9",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.3s ease",
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isOpen ? obj.accent : "#94A3B8"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </div>

                <div style={{
                  maxHeight: isOpen ? 250 : 0,
                  opacity: isOpen ? 1 : 0,
                  overflow: "hidden",
                  transition: "all 0.4s cubic-bezier(0.4,0,0.2,1)",
                }}>
                  <div style={{
                    padding: isMobile ? "0 18px 18px 64px" : "0 30px 28px 86px",
                  }}>
                    <p style={{
                      margin: 0, fontSize: isMobile ? 13 : 15,
                      color: "#475569", lineHeight: 1.75,
                    }}>
                      {obj.answer}
                    </p>
                    {obj.badge && (
                      <div style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        background: obj.badge.bg, border: `1px solid ${obj.badge.border}`,
                        borderRadius: 8, padding: "5px 14px", marginTop: 12,
                      }}>
                        {obj.badge.hasMeta && <img src={metaLogo} alt="Meta" style={{ width: 14, height: 14, objectFit: "contain" }} />}
                        <span style={{ fontSize: 12, fontWeight: 700, color: obj.badge.color }}>{obj.badge.text}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

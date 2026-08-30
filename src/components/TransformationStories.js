import { useState, useEffect } from "react";
import avatar1 from "../images/IMG_8696.jpeg";
import avatar2 from "../images/IMG_8697.jpeg";
import avatar4 from "../images/IMG_8698.jpeg";

const stories = [
  {
    name: "Siddarth4real", avatar: avatar1,
    role: "Fitness Coach & Athlete",
    quote: "I closed 17 clients worth ₹3.4L in 30 days. I only talk to serious leads now.",
    bigStat: "₹3.4L", bigLabel: "closed in 30 days",
    highlights: [
      { label: "DM time", before: "4+ hrs/day", after: "30 min/week" },
      { label: "Revenue", before: "₹80K/mo", after: "₹2.2L/mo" },
    ],
    multiplier: "2.75x",
    accent: "#7C3AED",
  },
  {
    name: "Harshalifts", avatar: avatar4,
    role: "Online Fitness Coach",
    quote: "MyHandle finds my clients while I train. Mornings are for workouts, not scrolling DMs.",
    bigStat: "2x", bigLabel: "revenue in 45 days",
    highlights: [
      { label: "DM time", before: "3+ hrs/day", after: "20 min/week" },
      { label: "Revenue", before: "₹1.1L/mo", after: "₹2.2L/mo" },
    ],
    multiplier: "2x",
    accent: "#2563EB",
  },
  {
    name: "FitKalyan", avatar: avatar2,
    role: "Powerlifting Athlete",
    quote: "My diet plan PDFs sell on autopilot. MyHandle sends them instantly when people ask.",
    bigStat: "₹83K", bigLabel: "from ₹35K/mo",
    highlights: [
      { label: "DM time", before: "2+ hrs/day", after: "10 min/week" },
      { label: "Revenue", before: "₹35K/mo", after: "₹83K/mo" },
    ],
    multiplier: "2.4x",
    accent: "#059669",
  },
];

export default function TransformationStories() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width:900px)").matches
  );
  const [activeStory, setActiveStory] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setIsMobile(window.matchMedia("(max-width:900px)").matches);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <section style={{
      background: "linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 100%)",
      padding: isMobile ? "64px 20px 56px" : "120px 60px 100px",
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: isMobile ? 32 : 56 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "#F0FDF4", border: "1px solid #D1FAE5",
            borderRadius: 50, padding: "7px 18px", marginBottom: isMobile ? 20 : 24,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E" }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#16A34A", letterSpacing: "0.02em" }}>Real Results</span>
          </div>
          <h2 style={{
            fontSize: isMobile ? "clamp(1.7rem, 7vw, 2.4rem)" : "clamp(2.8rem, 4.5vw, 3.5rem)",
            fontWeight: 800, color: "#0F172A", lineHeight: 1.08,
            letterSpacing: "-0.02em", marginBottom: isMobile ? 14 : 18,
            textAlign : isMobile ? "left" : "center"
          }}>
            Real fitness creators.{" "}
            <span style={{
              background: "linear-gradient(135deg, #22C55E 0%, #059669 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>Real numbers. </span>
            No fluff.
          </h2>
        
        </div>

        {/* Tab selector */}
        <div style={{
          display: "flex", gap: isMobile ? 8 : 12,
          justifyContent: "center",
          marginBottom: isMobile ? 20 : 28,
        }}>
          {stories.map((s, i) => (
            <button key={i} onClick={() => setActiveStory(i)} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: isMobile ? "8px 14px" : "10px 20px",
              borderRadius: 50, border: "none", cursor: "pointer",
              background: activeStory === i ? "#0F172A" : "#F1F5F9",
              transition: "all 0.25s ease",
              boxShadow: activeStory === i ? "0 4px 16px rgba(15,23,42,0.15)" : "none",
            }}>
              <img src={s.avatar} alt={s.name} style={{
                width: isMobile ? 22 : 26, height: isMobile ? 22 : 26,
                borderRadius: "50%", objectFit: "cover",
                border: activeStory === i ? "2px solid #FFF" : "2px solid #E2E8F0",
              }} />
              {(!isMobile || activeStory === i) && (
                <span style={{
                  fontSize: isMobile ? 12 : 13, fontWeight: 700,
                  color: activeStory === i ? "#FFFFFF" : "#64748B",
                }}>{s.name}</span>
              )}
            </button>
          ))}
        </div>

        {/* Active story card */}
        {stories.map((story, idx) => (
          <div key={idx} style={{
            display: activeStory === idx ? "block" : "none",
          }}>
            {/* Main card */}
            <div style={{
              background: "#FFFFFF",
              borderRadius: isMobile ? 20 : 24,
              border: "1px solid #E2E8F0",
              boxShadow: "0 8px 32px -8px rgba(0,0,0,0.08)",
              overflow: "hidden",
            }}>
              {/* Quote + avatar */}
              <div style={{
                padding: isMobile ? "24px 20px 20px" : "36px 40px 28px",
                display: "flex",
                flexDirection: isMobile ? "column" : "row",
                gap: isMobile ? 16 : 24,
                alignItems: isMobile ? "flex-start" : "center",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 14,
                  ...(isMobile ? {} : { flexShrink: 0 }),
                }}>
                  <img src={story.avatar} alt={story.name} style={{
                    width: isMobile ? 48 : 56, height: isMobile ? 48 : 56,
                    borderRadius: 14, objectFit: "cover",
                    border: `3px solid ${story.accent}20`,
                  }} />
                  {isMobile && (
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A" }}>{story.name}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 500 }}>{story.role}</div>
                    </div>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  {!isMobile && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <span style={{ fontSize: 17, fontWeight: 800, color: "#0F172A" }}>{story.name}</span>
                      <span style={{
                        fontSize: 12, color: "#94A3B8", fontWeight: 500,
                        background: "#F8FAFC", padding: "2px 10px", borderRadius: 6,
                      }}>{story.role}</span>
                    </div>
                  )}
                  <p style={{
                    margin: 0, fontSize: isMobile ? 14 : 17,
                    color: "#334155", lineHeight: 1.65, fontWeight: 500,
                  }}>
                    "{story.quote}"
                  </p>
                </div>
              </div>

              {/* Metrics strip */}
              <div style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : `auto 1fr 1fr`,
                gap: 0,
                borderTop: "1px solid #F1F5F9",
              }}>
                {/* Big stat */}
                <div style={{
                  padding: isMobile ? "20px" : "24px 32px",
                  background: `linear-gradient(135deg, ${story.accent}08, ${story.accent}12)`,
                  borderRight: isMobile ? "none" : "1px solid #F1F5F9",
                  borderBottom: isMobile ? "1px solid #F1F5F9" : "none",
                  display: "flex", alignItems: "center", gap: isMobile ? 14 : 16,
                  justifyContent: isMobile ? "center" : "flex-start",
                }}>
                  <div style={{
                    fontSize: isMobile ? 32 : 38, fontWeight: 900,
                    color: story.accent, letterSpacing: "-0.03em", lineHeight: 1,
                  }}>{story.bigStat}</div>
                  <div>
                    <div style={{ fontSize: isMobile ? 12 : 13, color: "#64748B", fontWeight: 500, lineHeight: 1.3 }}>{story.bigLabel}</div>
                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4,
                      background: "#DCFCE7", padding: "2px 8px", borderRadius: 4,
                      fontSize: 11, fontWeight: 800, color: "#16A34A",
                    }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /></svg>
                      {story.multiplier} growth
                    </div>
                  </div>
                </div>

                {/* Before/After highlights */}
                {story.highlights.map((h, i) => (
                  <div key={i} style={{
                    padding: isMobile ? "16px 20px" : "24px 28px",
                    borderRight: (!isMobile && i === 0) ? "1px solid #F1F5F9" : "none",
                    borderBottom: (isMobile && i === 0) ? "1px solid #F1F5F9" : "none",
                  }}>
                    <div style={{
                      fontSize: 10, fontWeight: 700, color: "#94A3B8",
                      textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: isMobile ? 8 : 10,
                    }}>{h.label}</div>
                    <div style={{
                      display: "flex", alignItems: "center", gap: isMobile ? 8 : 10,
                    }}>
                      {/* Before */}
                      <span style={{
                        fontSize: isMobile ? 13 : 14, fontWeight: 600,
                        color: "#DC2626", textDecoration: "line-through",
                        textDecorationColor: "#FECACA",
                      }}>{h.before}</span>
                      {/* Arrow */}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                      </svg>
                      {/* After */}
                      <span style={{
                        fontSize: isMobile ? 15 : 16, fontWeight: 800,
                        color: "#16A34A",
                      }}>{h.after}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

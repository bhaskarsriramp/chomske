import { useState, useEffect } from "react";

const recentSignups = [
  "Fitness_coach_raj", "shredded_priya", "coach_arjun_fit", "iron_neha",
  "fitlife_vikram", "muscle_master_sam", "yoga_queen_anita", "power_rohit",
  "lean_machine_dev", "abs_by_sneha", "coach_karthik", "fit_guru_meera",
];

export default function SocialProofScale() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width:900px)").matches
  );
  const [currentSignup, setCurrentSignup] = useState(0);
  const [leadsToday, setLeadsToday] = useState(12847);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setIsMobile(window.matchMedia("(max-width:900px)").matches);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setCurrentSignup((prev) => (prev + 1) % recentSignups.length), 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setLeadsToday((prev) => prev + Math.floor(Math.random() * 3) + 1), 2000);
    return () => clearInterval(interval);
  }, []);

  const categories = [
    { count: "1,240+", label: "Online Fitness Coaches", gradient: "linear-gradient(135deg, #FF2DD1 0%, #C084FC 100%)" },
    { count: "890+", label: "Creators with 10K+ followers", gradient: "linear-gradient(135deg, #818CF8 0%, #6366F1 100%)" },
    { count: "505+", label: "Trainers going online", gradient: "linear-gradient(135deg, #34D399 0%, #059669 100%)" },
  ];

  return (
    <section style={{
      background: "linear-gradient(180deg, #0F172A 0%, #1E1B4B 100%)",
      padding: isMobile ? "64px 20px 56px" : "120px 60px 100px",
      fontFamily: "'Inter', sans-serif",
      position: "relative",
      overflow: "hidden",
    }}>
      <style>{`
        @keyframes signupSlide { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .proof-glass { backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); transition: all 0.3s ease; }
        .proof-glass:hover { border-color: rgba(255,255,255,0.18); background: rgba(255,255,255,0.07); }
      `}</style>

      {/* Grid texture */}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.07, pointerEvents: "none",
        backgroundImage: "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
        backgroundSize: "56px 56px",
      }} />

      {/* Glows */}
      <div style={{
        position: "absolute", top: "-10%", left: "30%",
        width: isMobile ? 250 : 500, height: isMobile ? 250 : 500,
        background: "radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)",
        filter: "blur(80px)", pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: "-10%", right: "20%",
        width: isMobile ? 200 : 400, height: isMobile ? 200 : 400,
        background: "radial-gradient(circle, rgba(236,72,153,0.08) 0%, transparent 70%)",
        filter: "blur(60px)", pointerEvents: "none",
      }} />

      <div style={{ maxWidth: 820, margin: "0 auto", position: "relative", zIndex: 1 }}>

        {/* Headline */}
        <div style={{ textAlign: "center", marginBottom: isMobile ? 36 : 60 }}>
          <h2 style={{
            fontSize: isMobile ? "clamp(1.7rem, 7vw, 2.4rem)" : "clamp(2.8rem, 4.5vw, 3.5rem)",
            fontWeight: 800, lineHeight: 1.08, letterSpacing: "-0.04em",
            color: "#FFFFFF", marginBottom: isMobile ? 12 : 16,
          }}>
            <span style={{
              background: "linear-gradient(135deg, #C084FC, #A78BFA)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>2,635+</span>{" "}
            fitness creators closing deals in their sleep
          </h2>
          <p style={{
            fontSize: isMobile ? "0.9rem" : "1.1rem",
            color: "rgba(255,255,255,0.5)", lineHeight: 1.7, maxWidth: 420, margin: "0 auto",
            padding: isMobile ? "0 8px" : 0,
          }}>
            And the number grows every day.
          </p>
        </div>

        {/* Live cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: isMobile ? 10 : 16,
          marginBottom: isMobile ? 28 : 48,
        }}>
          {/* Signup feed */}
          <div className="proof-glass" style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: isMobile ? 14 : 18,
            padding: isMobile ? "18px" : "26px 28px",
          }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)",
              textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12,
            }}>
              Recent Signups
            </div>
            <div key={currentSignup} style={{
              display: "flex", alignItems: "center", gap: 10,
              animation: "signupSlide 0.4s ease-out",
            }}>
              <div style={{
                width: 9, height: 9, borderRadius: "50%", background: "#22C55E",
                boxShadow: "0 0 16px rgba(34,197,94,0.5)", flexShrink: 0,
              }} />
              <span style={{ fontSize: isMobile ? 14 : 15, fontWeight: 600, color: "#FFFFFF" }}>
                @{recentSignups[currentSignup]}
              </span>
              <span style={{ fontSize: isMobile ? 11 : 12, color: "rgba(255,255,255,0.3)", fontWeight: 500 }}>
                joined just now
              </span>
            </div>
          </div>

          {/* Leads counter */}
          <div className="proof-glass" style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: isMobile ? 14 : 18,
            padding: isMobile ? "18px" : "26px 28px",
          }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)",
              textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12,
            }}>
              Leads Detected Today
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{
                fontSize: isMobile ? 26 : 30, fontWeight: 900,
                background: "linear-gradient(135deg, #C084FC, #A78BFA)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                fontVariantNumeric: "tabular-nums",
              }}>
                {leadsToday.toLocaleString()}
              </span>
              <div style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)",
                borderRadius: 50, padding: "3px 10px",
              }}>
                <div style={{
                  width: 6, height: 6, borderRadius: "50%", background: "#22C55E",
                  boxShadow: "0 0 8px rgba(34,197,94,0.6)",
                }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#22C55E" }}>Live</span>
              </div>
            </div>
          </div>
        </div>

        {/* Category Cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
          gap: isMobile ? 10 : 16,
        }}>
          {categories.map((cat, i) => (
            <div key={i} className="proof-glass" style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: isMobile ? 14 : 18,
              padding: isMobile ? "22px 18px" : "32px 24px",
              textAlign: "center",
            }}>
              <div style={{
                fontSize: isMobile ? 26 : 36, fontWeight: 900,
                background: cat.gradient,
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                marginBottom: 8, letterSpacing: "-0.02em",
              }}>{cat.count}</div>
              <div style={{ fontSize: isMobile ? 12 : 13, fontWeight: 500, color: "rgba(255,255,255,0.55)", lineHeight: 1.4 }}>
                {cat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Growth pill */}
        <div style={{ marginTop: isMobile ? 22 : 28, textAlign: "center" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)",
            borderRadius: 50, padding: "9px 22px",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /></svg>
            <span style={{ fontSize: isMobile ? 12 : 13, fontWeight: 600, color: "#4ADE80" }}>
              1,847 creators joined this month
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

import { useState, useEffect } from "react";

export default function WhoIsThisFor() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width:900px)").matches
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setIsMobile(window.matchMedia("(max-width:900px)").matches);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const forYou = [
    "You get 50+ DMs per week but can't keep up",
    "You sell programs/coaching worth ₹15K+ per client",
    "You want to scale without hiring a ₹30K/month VA",
    "Instagram is your primary client acquisition channel",
  ];

  const notForYou = [
    "You just want more followers (we don't do that)",
    "You prefer replying to every DM manually",
    "Your posts get less than 10 comments",
    "You're not serious about converting leads to clients",
  ];

  return (
    <section style={{
      background: "linear-gradient(180deg, #FAFAFA 0%, #F8FAFC 100%)",
      padding: isMobile ? "64px 20px 56px" : "120px 60px 100px",
      fontFamily: "'Inter', sans-serif",
    }}>
      <style>{`
        .qualify-card { transition: all 0.3s ease; }
        .qualify-card:hover { transform: translateY(-4px); }
      `}</style>

      <div style={{ maxWidth: 800, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: isMobile ? 36 : 56 }}>
          <h2 style={{
            fontSize: isMobile ? "clamp(1.7rem, 7vw, 2.4rem)" : "clamp(2.8rem, 4.5vw, 3.2rem)",
            fontWeight: 800, color: "#0F172A", lineHeight: 1.08,
            letterSpacing: "-0.04em", marginBottom: isMobile ? 14 : 18,
          }}>
            This isn't for everyone.
          </h2>
          <p style={{
            fontSize: isMobile ? "0.9rem" : "1.15rem", color: "#64748B",
            lineHeight: 1.7, maxWidth: 460, margin: "0 auto", fontWeight: 400,
            padding: isMobile ? "0 8px" : 0,
          }}>
            Built for fitness creators who want <strong style={{ color: "#0F172A", fontWeight: 700 }}>clients</strong>, not just followers.
          </p>
        </div>

        {/* Two Cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: isMobile ? 14 : 20,
        }}>
          {/* FOR YOU */}
          <div className="qualify-card" style={{
            background: "linear-gradient(145deg, #F0FDF4, #ECFDF5)",
            border: "1.5px solid #D1FAE5",
            borderRadius: isMobile ? 18 : 22,
            padding: isMobile ? "26px 22px" : "40px 34px",
            boxShadow: "0 8px 28px -8px rgba(34,197,94,0.1)",
          }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              marginBottom: isMobile ? 22 : 28,
            }}>
              <div style={{
                width: isMobile ? 28 : 32, height: isMobile ? 28 : 32, borderRadius: 10,
                background: "linear-gradient(135deg, #22C55E, #16A34A)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 4px 12px rgba(34,197,94,0.25)",
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              <span style={{ fontSize: isMobile ? 14 : 16, fontWeight: 800, color: "#166534" }}>This IS for you if</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 14 : 16 }}>
              {forYou.map((text, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: 6, flexShrink: 0, marginTop: 2,
                    background: "#DCFCE7", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  </div>
                  <span style={{ fontSize: isMobile ? 13 : 15, color: "#334155", lineHeight: 1.55, fontWeight: 500 }}>{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* NOT FOR YOU */}
          <div className="qualify-card" style={{
            background: "linear-gradient(145deg, #FEF2F2, #FFF1F2)",
            border: "1.5px solid #FECDD3",
            borderRadius: isMobile ? 18 : 22,
            padding: isMobile ? "26px 22px" : "40px 34px",
            boxShadow: "0 8px 28px -8px rgba(239,68,68,0.08)",
          }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              marginBottom: isMobile ? 22 : 28,
            }}>
              <div style={{
                width: isMobile ? 28 : 32, height: isMobile ? 28 : 32, borderRadius: 10,
                background: "linear-gradient(135deg, #EF4444, #DC2626)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 4px 12px rgba(239,68,68,0.2)",
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </div>
              <span style={{ fontSize: isMobile ? 14 : 16, fontWeight: 800, color: "#991B1B" }}>This is NOT for you if</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 14 : 16 }}>
              {notForYou.map((text, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: 6, flexShrink: 0, marginTop: 2,
                    background: "#FEE2E2", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </div>
                  <span style={{ fontSize: isMobile ? 13 : 15, color: "#334155", lineHeight: 1.55, fontWeight: 500 }}>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

import { useState, useEffect } from "react";

const PAINS = [
  {
    stat: "847",
    unit: "unread",
    headline: "Slack is a noise machine.",
    sub: "Your 500 errors are buried under stand-up jokes, lunch polls, and #random memes.",
    icon: "💬",
    color: "#EF4444",
    bg: "#FEF2F2",
    border: "#FECDD3",
  },
  {
    stat: "20%",
    unit: "open rate",
    headline: "Email sleeps at 2am.",
    sub: "No one checks work email at 2am. Your server doesn't care about business hours.",
    icon: "📧",
    color: "#F97316",
    bg: "#FFF7ED",
    border: "#FFEDD5",
  },
  {
    stat: "3 hrs",
    unit: "avg delay",
    headline: "By then, it's too late.",
    sub: "40 users have seen the 500 page. 3 have tweeted about it. One cancelled.",
    icon: "⏱",
    color: "#DC2626",
    bg: "#FEF2F2",
    border: "#FECDD3",
  },
];

export default function AgitateSection() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width:900px)").matches
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width:900px)");
    const handle = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", handle);
    return () => mq.removeEventListener("change", handle);
  }, []);

  return (
    <section style={{
      background: "#ffffff",
      padding: isMobile ? "64px 20px 56px" : "100px 60px 80px",
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      <style>{`.pain-card:hover { transform:translateY(-3px); box-shadow:0 14px 36px -8px rgba(0,0,0,.09) !important; }`}</style>

      <div style={{ maxWidth: 960, margin: "0 auto" }}>

        {/* Label */}
        <div style={{ textAlign: isMobile ? "left" : "center", marginBottom: isMobile ? 32 : 52 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "#FEF2F2", border: "1px solid #FECDD3",
            borderRadius: 50, padding: "5px 14px", marginBottom: 18,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#EF4444" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#DC2626", letterSpacing: ".06em", textTransform: "uppercase" }}>The Problem</span>
          </div>

          <h2 style={{
            fontSize: isMobile ? "clamp(1.8rem,7vw,2.4rem)" : "clamp(2.2rem,3.8vw,3.2rem)",
            fontWeight: 800, letterSpacing: "-0.04em",
            color: "#0F172A", lineHeight: 1.15, margin: "0 0 14px",
          }}>
            You're the last one to find out.
          </h2>
          <p style={{
            fontSize: isMobile ? ".9rem" : "1rem",
            color: "#64748B", lineHeight: 1.65, maxWidth: 480, margin: "0 auto",
          }}>
            While your server burns, you're in a meeting. Your tools failed you long before you checked.
          </p>
        </div>

        {/* Pain cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
          gap: isMobile ? 14 : 20,
          marginBottom: isMobile ? 40 : 60,
        }}>
          {PAINS.map((p, i) => (
            <div key={i} className="pain-card" style={{
              background: "#fff",
              border: `1.5px solid ${p.border}`,
              borderRadius: 22,
              padding: isMobile ? "24px 20px" : "30px 26px",
              boxShadow: "0 2px 10px -2px rgba(0,0,0,.04)",
              transition: "transform .25s ease, box-shadow .25s ease",
            }}>
              <div style={{ fontSize: 28, marginBottom: 14, lineHeight: 1 }}>{p.icon}</div>
              <div style={{ marginBottom: 10, display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{
                  fontSize: isMobile ? 36 : 42, fontWeight: 900,
                  color: p.color, letterSpacing: "-0.04em", lineHeight: 1,
                }}>{p.stat}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: p.color }}>{p.unit}</span>
              </div>
              <p style={{ margin: "0 0 6px", fontSize: isMobile ? 14 : 15, fontWeight: 700, color: "#0F172A", lineHeight: 1.3 }}>
                {p.headline}
              </p>
              <p style={{ margin: 0, fontSize: isMobile ? 12 : 13, color: "#94A3B8", lineHeight: 1.55, fontWeight: 400 }}>
                {p.sub}
              </p>
            </div>
          ))}
        </div>

        {/* Timeline of disaster */}
        <div style={{
          background: "#0F172A",
          borderRadius: 22,
          padding: isMobile ? "24px 20px" : "32px 36px",
          overflow: "hidden",
          position: "relative",
        }}>
          <div style={{
            position: "absolute", top: "-20%", right: "-5%",
            width: 280, height: 280,
            background: "radial-gradient(circle, rgba(239,68,68,.1) 0%, transparent 70%)",
            filter: "blur(40px)", pointerEvents: "none",
          }} />

          <p style={{
            margin: "0 0 20px", fontSize: 11, fontWeight: 700, color: "#64748B",
            letterSpacing: ".08em", textTransform: "uppercase",
          }}>
            Timeline of a typical incident
          </p>

          <div style={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            gap: isMobile ? 0 : 0,
            position: "relative",
          }}>
            {[
              { time: "T+0", label: "Server crashes", color: "#EF4444", icon: "💥" },
              { time: "T+5 min", label: "Users hit errors", color: "#F97316", icon: "😤" },
              { time: "T+30 min", label: "First tweet about it", color: "#F59E0B", icon: "🐦" },
              { time: "T+3 hrs", label: "You finally check Slack", color: "#94A3B8", icon: "😱" },
            ].map((step, i, arr) => (
              <div key={i} style={{
                display: "flex",
                flexDirection: isMobile ? "row" : "column",
                alignItems: isMobile ? "flex-start" : "center",
                flex: 1,
                position: "relative",
                paddingBottom: isMobile && i < arr.length - 1 ? 20 : 0,
              }}>
                {/* Connector line */}
                {i < arr.length - 1 && !isMobile && (
                  <div style={{
                    position: "absolute",
                    top: 18,
                    left: "50%",
                    width: "100%",
                    height: 1,
                    background: "linear-gradient(90deg, rgba(148,163,184,.3), rgba(148,163,184,.1))",
                    zIndex: 0,
                  }} />
                )}
                {isMobile && i < arr.length - 1 && (
                  <div style={{
                    position: "absolute",
                    left: 17,
                    top: 36,
                    width: 1,
                    height: "calc(100% - 20px)",
                    background: "rgba(148,163,184,.2)",
                  }} />
                )}

                <div style={{
                  display: "flex",
                  flexDirection: isMobile ? "row" : "column",
                  alignItems: isMobile ? "flex-start" : "center",
                  gap: isMobile ? 14 : 8,
                  position: "relative", zIndex: 1,
                  width: isMobile ? "100%" : "auto",
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: i === arr.length - 1 ? "rgba(148,163,184,.1)" : "rgba(239,68,68,.1)",
                    border: `1.5px solid ${i === arr.length - 1 ? "rgba(148,163,184,.3)" : "rgba(239,68,68,.3)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, flexShrink: 0,
                  }}>
                    {step.icon}
                  </div>
                  <div style={{ textAlign: isMobile ? "left" : "center" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: step.color, letterSpacing: ".04em", marginBottom: 3 }}>
                      {step.time}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: i === arr.length - 1 ? "#64748B" : "#E2E8F0", lineHeight: 1.3 }}>
                      {step.label}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{
            marginTop: 24, paddingTop: 20,
            borderTop: "1px solid rgba(255,255,255,.06)",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%", background: "#25D366",
              flexShrink: 0,
            }} />
            <p style={{ margin: 0, fontSize: 13, color: "#94A3B8", fontWeight: 400 }}>
              With MyHandle:{" "}
              <strong style={{ color: "#25D366" }}>WhatsApp pings you at T+0.</strong>{" "}
              Every time. Even at 2am.
            </p>
          </div>
        </div>

      </div>
    </section>
  );
}

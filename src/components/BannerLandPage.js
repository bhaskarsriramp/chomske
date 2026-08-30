import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { trackCTA } from "./GoogleAnalytics";

const LTD_FOUNDER_FEATURES = [
  "400 alerts /month",
  "Unlimited webhooks",
  "5 team contacts",
  "P0 / P1 priority tiers",
  "All integrations (Stripe, Vercel + more)",
  "Pay once, yours forever",
];

const LTD_TEAM_FEATURES = [
  "Everything in Founder",
  "1,000 alerts / month",
  "10 team contacts",
  "Quiet hours config",
  "Priority support",
  "Pay once, yours forever",
];

function CheckIcon({ color = "#25D366" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function BannerLandpage() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width:900px)").matches
  );
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width:900px)");
    const handle = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", handle);
    return () => mq.removeEventListener("change", handle);
  }, []);

  return (
    <section style={{
      background: "#0A0A0A",
      padding: isMobile ? "80px 20px 72px" : "108px 60px 88px",
      fontFamily: "'Inter', -apple-system, sans-serif",
      position: "relative", overflow: "hidden",
    }}>
      <style>{`
        @keyframes greenGlow { 0%,100% { opacity:.5; } 50% { opacity:.9; } }
        .price-card { transition: transform .25s ease, border-color .25s ease; }
        .price-card:hover { transform: translateY(-4px); }
      `}</style>

      {/* Background glows */}
      <div style={{
        position: "absolute", top: "15%", left: "25%", transform: "translateX(-50%)",
        width: 640, height: 400,
        background: "radial-gradient(circle, rgba(37,211,102,.07) 0%, transparent 70%)",
        filter: "blur(80px)", pointerEvents: "none",
        animation: "greenGlow 5s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", bottom: "5%", right: "15%",
        width: 400, height: 400,
        background: "radial-gradient(circle, rgba(99,102,241,.05) 0%, transparent 70%)",
        filter: "blur(60px)", pointerEvents: "none",
      }} />

      <div style={{ maxWidth: 1040, margin: "0 auto", position: "relative", zIndex: 2 }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: isMobile ? 48 : 68 }}>

          <h2 style={{
            fontSize: isMobile ? "clamp(2rem,8vw,2.8rem)" : "clamp(2.6rem,4vw,3.8rem)",
            fontWeight: 800, letterSpacing: "-0.04em",
            color: "#F8FAFC", lineHeight: 1.08, margin: "0 0 18px",
          }}>
            Pay once.<br />
            <span style={{ color: "#25D366" }}>Never miss a critical alert.</span>
          </h2>
          <p style={{
            fontSize: isMobile ? ".95rem" : "1.05rem",
            color: "#64748B", lineHeight: 1.68, maxWidth: 480, margin: "0 auto",
          }}>
            No monthly fees. One payment, lifetime access for first 100 SaaS founders.
          </p>
        </div>

        {/* LTD Pricing cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: isMobile ? 16 : 24,
          marginBottom: isMobile ? 16 : 20,
          maxWidth: 740, marginLeft: "auto", marginRight: "auto",
        }}>

          {/* Founder LTD */}
          <div className="price-card" style={{
            background: "rgba(255,255,255,.04)",
            border: "1.5px solid rgba(255,255,255,.08)",
            borderRadius: 26,
            padding: isMobile ? "30px 24px" : "40px 36px",
            display: "flex", flexDirection: "column",
          }}>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#64748B", marginBottom: 10 }}>Founder LTD</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: isMobile ? 44 : 52, fontWeight: 900, color: "#F8FAFC", letterSpacing: "-0.04em", lineHeight: 1 }}>$49</span>
                <span style={{ fontSize: 14, color: "#475569", fontWeight: 500 }}>one-time</span>
              </div>
            </div>
            <p style={{ fontSize: 13, color: "#64748B", margin: "0 0 28px", lineHeight: 1.55 }}>
              Everything you need to stop flying blind. Paid once, yours forever.
            </p>

            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 11, marginBottom: 32 }}>
              {LTD_FOUNDER_FEATURES.map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <CheckIcon />
                  <span style={{ fontSize: 13, color: "#CBD5E1" }}>{f}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => { trackCTA("banner_ltd_founder", "banner"); navigate("/professional/login"); }}
              style={{
                background: "rgba(255,255,255,.08)",
                color: "#F8FAFC",
                fontSize: 14, fontWeight: 700,
                padding: "15px 24px", borderRadius: 16,
                border: "1.5px solid rgba(255,255,255,.12)",
                cursor: "pointer", transition: "all .2s ease",
                letterSpacing: "-.01em",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,.12)"; e.currentTarget.style.borderColor = "rgba(255,255,255,.2)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,.08)"; e.currentTarget.style.borderColor = "rgba(255,255,255,.12)"; }}
            >
              Get Lifetime Access
            </button>
          </div>

          {/* Team LTD */}
          <div className="price-card" style={{
            background: "linear-gradient(145deg, rgba(37,211,102,.1) 0%, rgba(37,211,102,.03) 100%)",
            border: "1.5px solid rgba(37,211,102,.28)",
            borderRadius: 26,
            padding: isMobile ? "30px 24px" : "40px 36px",
            display: "flex", flexDirection: "column",
            position: "relative",
          }}>
            {/* Best Value badge */}
            <div style={{
              position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)",
              background: "#25D366", borderRadius: 50,
              padding: "5px 18px",
              fontSize: 10, fontWeight: 800, color: "#fff",
              letterSpacing: ".07em", textTransform: "uppercase",
              whiteSpace: "nowrap",
              boxShadow: "0 4px 16px rgba(37,211,102,.4)",
            }}>
              Best Value
            </div>

            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#86EFAC", marginBottom: 10 }}>Team LTD</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: isMobile ? 44 : 52, fontWeight: 900, color: "#F8FAFC", letterSpacing: "-0.04em", lineHeight: 1 }}>$79</span>
                <span style={{ fontSize: 14, color: "#475569", fontWeight: 500 }}>one-time</span>
              </div>
              <div style={{ fontSize: 11, color: "#4ADE80", marginTop: 6 }}>3x the alerts + team backup contacts</div>
            </div>
            <p style={{ fontSize: 13, color: "#86EFAC", margin: "0 0 28px", lineHeight: 1.55, fontWeight: 500 }}>
              For teams where one person can't be the single point of failure.
            </p>

            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 11, marginBottom: 32 }}>
              {LTD_TEAM_FEATURES.map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <CheckIcon color="#4ADE80" />
                  <span style={{ fontSize: 13, color: "#CBD5E1" }}>{f}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => { trackCTA("banner_ltd_team", "banner"); navigate("/professional/login"); }}
              style={{
                background: "#25D366", color: "#fff",
                fontSize: 14, fontWeight: 700,
                padding: "15px 24px", borderRadius: 16,
                border: "none", cursor: "pointer",
                boxShadow: "0 10px 28px rgba(37,211,102,.32)",
                transition: "all .2s ease",
                letterSpacing: "-.01em",
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 16px 36px rgba(37,211,102,.44)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 10px 28px rgba(37,211,102,.32)"; }}
            >
              Get Lifetime Access →
            </button>
          </div>
        </div>

        {/* Free Trial Strip */}
        <div style={{
          maxWidth: 740, margin: "0 auto",
          marginBottom: isMobile ? 32 : 44,
          background: "rgba(255,255,255,.025)",
          border: "1px dashed rgba(255,255,255,.1)",
          borderRadius: 20,
          padding: isMobile ? "20px 22px" : "22px 32px",
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "flex-start" : "center",
          gap: isMobile ? 14 : 24,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 5, letterSpacing: ".05em", textTransform: "uppercase" }}>
              Not ready to commit?
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#CBD5E1", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              Try it free
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#25D366", display: "inline-block", flexShrink: 0 }} />
              No card needed.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              {["1 Free Webhook", "2 Test Messages", "No credit card"].map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748B" }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#25D366", flexShrink: 0 }} />
                  {f}
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={() => { trackCTA("banner_free_trial", "banner"); navigate("/professional/login"); }}
            style={{
              background: "transparent",
              color: "#4ADE80",
              border: "1.5px solid rgba(37,211,102,.3)",
              borderRadius: 12,
              padding: "11px 22px",
              fontSize: 13, fontWeight: 700,
              cursor: "pointer", transition: "all .2s ease",
              whiteSpace: "nowrap", flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(37,211,102,.07)"; e.currentTarget.style.borderColor = "rgba(37,211,102,.5)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "rgba(37,211,102,.3)"; }}
          >
            Try Free →
          </button>
        </div>

        {/* Trust line */}
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
         
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "center", marginTop: 4 }}>
            {[
              { icon: "🔒", text: "No Meta API signup" },
              { icon: "🌍", text: "Works worldwide" },
            ].map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "#64748B", fontWeight: 500 }}>
                <span>{t.icon}</span>{t.text}
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}

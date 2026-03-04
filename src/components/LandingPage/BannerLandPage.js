import { useState, useEffect } from "react";
import WaitlistModal from "./WaitlistModal";

const BannerLandpage = () => {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width:600px)").matches
  );
  const [hovered, setHovered] = useState(false);
  const [showWaitlist, setShowWaitlist] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const h = () => setIsMobile(window.matchMedia("(max-width:600px)").matches);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  return (
    <>
      {showWaitlist && <WaitlistModal onClose={() => setShowWaitlist(false)} />}
    <div style={{
      padding: isMobile ? "0 16px 56px" : "0 40px 80px",
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      <div style={{
        position: "relative",
        background: "linear-gradient(135deg, #0F172A 0%, #1E1B4B 60%, #0F172A 100%)",
        borderRadius: isMobile ? 20 : 28,
        padding: isMobile ? "48px 24px" : "80px 80px",
        textAlign: "center",
        overflow: "hidden",
        boxShadow: "0 32px 80px -20px rgba(99,102,241,0.35), 0 0 0 1px rgba(255,255,255,0.07)",
      }}>
        <style>{`
          @keyframes bannerGlow {
            0%, 100% { opacity: 0.5; transform: translateX(-50%) scale(1); }
            50%       { opacity: 0.8; transform: translateX(-50%) scale(1.08); }
          }
          @keyframes gridDrift {
            0%   { transform: translateY(0); }
            100% { transform: translateY(40px); }
          }
          @keyframes fadeUp {
            from { opacity: 0; transform: translateY(16px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>

        {/* Animated glow */}
        <div style={{
          position: "absolute", top: "-30%", left: "50%",
          transform: "translateX(-50%)",
          width: isMobile ? 400 : 700, height: isMobile ? 400 : 700,
          background: "radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 65%)",
          filter: "blur(60px)",
          animation: "bannerGlow 6s ease-in-out infinite",
          pointerEvents: "none",
        }} />

        {/* Subtle grid */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.06,
          backgroundImage: "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          animation: "gridDrift 20s linear infinite alternate",
          pointerEvents: "none",
        }} />

        {/* Content */}
        <div style={{ position: "relative", zIndex: 2 }}>

          {/* Badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 50, padding: "6px 16px",
            marginBottom: isMobile ? 24 : 32,
            animation: "fadeUp 0.6s ease",
          }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#10B981" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>
              Free during private beta · Connect your own MongoDB
            </span>
          </div>

          {/* Headline */}
          <h2 style={{
            fontWeight: 800,
            fontSize: isMobile ? "clamp(1.7rem, 8vw, 2.4rem)" : "clamp(2.4rem, 4.5vw, 3.8rem)",
            lineHeight: 1.1,
            marginBottom: isMobile ? 16 : 20,
            letterSpacing: "-0.03em",
            background: "linear-gradient(135deg, #ffffff 0%, #C7D2FE 60%, #A5B4FC 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            textAlign: isMobile ? "left" : "center",
            animation: "fadeUp 0.6s ease 0.1s backwards",
          }}>
            Stop guessing.
            <br />Start knowing.
          </h2>

          {/* Sub */}
          <p style={{
            fontSize: isMobile ? 14 : 18,
            color: "rgba(255,255,255,0.6)",
            maxWidth: 540,
            margin: isMobile ? "0 0 32px" : "0 auto 40px",
            lineHeight: 1.65,
            textAlign: isMobile ? "left" : "center",
            animation: "fadeUp 0.6s ease 0.2s backwards",
          }}>
            Chomske connects to your MongoDB and tells you exactly which
            3 users need your attention today. Not a chart. A list.
            Names, context, and what to do.
          </p>

          {/* CTA */}
          <div style={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "stretch" : "center",
            justifyContent: "center",
            gap: isMobile ? 12 : 14,
            animation: "fadeUp 0.6s ease 0.3s backwards",
          }}>
            <button
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
              onClick={() => setShowWaitlist(true)}
              style={{
                background: "#ffffff",
                color: "#0F172A",
                fontSize: isMobile ? 15 : 17,
                fontWeight: 700,
                padding: isMobile ? "16px 28px" : "18px 48px",
                borderRadius: 13,
                border: "none",
                cursor: "pointer",
                boxShadow: hovered
                  ? "0 20px 48px -8px rgba(255,255,255,0.25)"
                  : "0 8px 24px -4px rgba(255,255,255,0.12)",
                transform: hovered ? "translateY(-3px)" : "translateY(0)",
                transition: "all 0.22s ease",
                letterSpacing: "-0.01em",
                width: isMobile ? "100%" : "auto",
              }}
            >
              Join Waitlist →
            </button>
          </div>

          {/* Trust signals */}
          <div style={{
            marginTop: isMobile ? 20 : 28,
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            alignItems: "center",
            justifyContent: "center",
            gap: isMobile ? 8 : 24,
            animation: "fadeUp 0.6s ease 0.4s backwards",
          }}>
            {[
              "No credit card required",
              "Read-only MongoDB access",
              "Cancel any time",
            ].map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17l-5-5" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>{t}</span>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
    </>
  );
};

export default BannerLandpage;

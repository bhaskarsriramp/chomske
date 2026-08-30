import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { trackCTA } from "./GoogleAnalytics";
import myhandleLogo from "../images/myhandle_logo.png";
import metaLogo from "../images/meta.png";

const WA_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const SOURCES = [
 
  {
    name: "Stripe", bg: "#fff",
    icon: <svg viewBox="0 0 24 24" width="34" height="13">
      <path fill="#646FDE" d="M11.106 18.592c-2.215 0-5.077-.914-7.324-2.133v6.022A18.597 18.597 0 0 0 11.102 24c5.564 0 9.398-2.39 9.398-7.198 0-7.976-10.229-6.547-10.229-9.556l-.001-.001c0-1.045.873-1.448 2.271-1.448 2.036 0 4.621.623 6.658 1.72V1.223C16.981.337 14.766 0 12.547 0 7.118 0 3.5 2.83 3.5 7.564c0 7.401 10.173 6.201 10.173 9.392 0 1.238-1.074 1.636-2.567 1.636z"/>
    </svg>,
  },
  {
    name: "Vercel", bg: "#000",
    icon: <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
      <path d="M12 1L24 22H0L12 1Z" fill="#ffffff"/>
    </svg>,
  },
  {
    name: "AWS", bg: "#fff",
    icon: <svg viewBox="0 0 526 315" width="28" height="17">
      <path fill="#252f3e" d="M148.232 114.237a52.931 52.931 0 0 0 1.924 15.57 93.64 93.64 0 0 0 5.6 12.6 7.61 7.61 0 0 1 1.225 4.024c0 1.749-1.05 3.5-3.324 5.248l-11.021 7.348a8.388 8.388 0 0 1-4.548 1.574 8.05 8.05 0 0 1-5.248-2.449 54.121 54.121 0 0 1-6.3-8.222c-1.749-2.974-3.5-6.3-5.423-10.322q-20.468 24.138-51.434 24.138c-14.7 0-26.416-4.2-34.988-12.6s-12.946-19.59-12.946-33.585c0-14.87 5.248-26.941 15.92-36.038s24.841-13.646 42.86-13.646a138.511 138.511 0 0 1 18.544 1.4c6.473.875 13.121 2.274 20.118 3.849V60.355c0-13.3-2.8-22.567-8.222-27.991-5.6-5.423-15.045-8.047-28.516-8.047a79.6 79.6 0 0 0-18.894 2.274 139.4 139.4 0 0 0-18.894 5.948 50.2 50.2 0 0 1-6.123 2.274 10.73 10.73 0 0 1-2.8.525c-2.449 0-3.674-1.749-3.674-5.423v-8.572c0-2.8.35-4.9 1.225-6.123a13.1 13.1 0 0 1 4.9-3.674 100.716 100.716 0 0 1 22.043-7.872A106.062 106.062 0 0 1 87.527.35c20.822 0 36.038 4.723 45.835 14.17 9.622 9.447 14.52 23.792 14.52 43.036v56.681Zm-71.026 26.591a56.7 56.7 0 0 0 18.019-3.149 38.984 38.984 0 0 0 16.619-11.2 27.768 27.768 0 0 0 5.948-11.2 62.8 62.8 0 0 0 1.749-15.22v-7.34a146.1 146.1 0 0 0-16.092-2.974A131.821 131.821 0 0 0 87.002 88.7c-11.721 0-20.293 2.274-26.066 7s-8.572 11.371-8.572 20.118c0 8.222 2.1 14.345 6.473 18.544 4.2 4.374 10.322 6.473 18.369 6.473Zm140.478 18.894c-3.149 0-5.248-.525-6.648-1.749-1.4-1.05-2.624-3.5-3.674-6.823L166.249 15.92a30.644 30.644 0 0 1-1.574-7c0-2.8 1.4-4.374 4.2-4.374h17.144c3.324 0 5.6.525 6.823 1.749 1.4 1.05 2.449 3.5 3.5 6.823l29.39 115.811 27.29-115.808c.875-3.5 1.924-5.773 3.324-6.823s3.849-1.749 7-1.749h14c3.324 0 5.6.525 7 1.749 1.4 1.05 2.624 3.5 3.324 6.823l27.641 117.211 30.255-117.211c1.05-3.5 2.274-5.773 3.5-6.823 1.4-1.05 3.674-1.749 6.823-1.749h16.27c2.8 0 4.374 1.4 4.374 4.374a17.445 17.445 0 0 1-.35 2.8 24.891 24.891 0 0 1-1.225 4.374l-42.161 135.23q-1.574 5.248-3.674 6.823a11.192 11.192 0 0 1-6.648 1.749h-15.046c-3.324 0-5.6-.525-7-1.749s-2.624-3.5-3.324-7L269.991 38.312l-26.942 112.663c-.875 3.5-1.924 5.773-3.324 7s-3.849 1.749-7 1.749Zm224.8 4.723a115.767 115.767 0 0 1-26.941-3.149c-8.747-2.1-15.57-4.374-20.118-7-2.8-1.574-4.723-3.324-5.423-4.9a12.349 12.349 0 0 1-1.05-4.9v-8.916c0-3.674 1.4-5.423 4.024-5.423a9.906 9.906 0 0 1 3.149.525c1.05.35 2.624 1.05 4.374 1.749a95.157 95.157 0 0 0 19.244 6.123 105.06 105.06 0 0 0 20.818 2.1c11.021 0 19.594-1.924 25.542-5.773a18.839 18.839 0 0 0 9.1-16.619 17.037 17.037 0 0 0-4.723-12.246c-3.149-3.324-9.1-6.3-17.669-9.1l-25.372-7.871c-12.771-4.023-22.218-9.971-27.99-17.845a41.68 41.68 0 0 1-8.747-25.367 38.934 38.934 0 0 1 4.723-19.419 44.982 44.982 0 0 1 12.6-14.345 55.525 55.525 0 0 1 18.194-9.1A76.248 76.248 0 0 1 448.257 0a87.822 87.822 0 0 1 11.721.7c4.024.525 7.7 1.225 11.371 1.924 3.5.875 6.823 1.749 9.972 2.8a38.181 38.181 0 0 1 7.348 3.149 15.128 15.128 0 0 1 5.248 4.374 9.428 9.428 0 0 1 1.574 5.773v8.222c0 3.674-1.4 5.6-4.024 5.6-1.4 0-3.674-.7-6.648-2.1q-14.958-6.823-33.589-6.823c-9.972 0-17.844 1.574-23.267 4.9s-8.222 8.4-8.222 15.57a16.52 16.52 0 0 0 5.248 12.421c3.5 3.324 9.972 6.648 19.244 9.622L469.075 74c12.6 4.024 21.693 9.622 27.116 16.794a39.587 39.587 0 0 1 8.047 24.492 44.973 44.973 0 0 1-4.548 20.293 47.049 47.049 0 0 1-12.771 15.395 56.392 56.392 0 0 1-19.419 9.8 83.188 83.188 0 0 1-25.017 3.674Z"/>
      <path fill="#f90" d="M475.548 249.464c-57.556 42.511-141.178 65.078-213.079 65.078-100.767.004-191.562-37.259-260.137-99.188-5.423-4.9-.525-11.546 5.948-7.7 74.175 43.036 165.67 69.1 260.313 69.1 63.854 0 134.005-13.3 198.559-40.587 9.622-4.374 17.844 6.3 8.4 13.3Z"/>
      <path fill="#f90" d="M499.515 222.176c-7.348-9.447-48.634-4.548-67.353-2.274-5.6.7-6.473-4.2-1.4-7.872 32.889-23.092 86.946-16.445 93.244-8.747 6.3 7.872-1.749 61.929-32.539 87.821-4.723 4.024-9.272 1.924-7.173-3.324 6.999-17.32 22.569-56.332 15.221-65.604Z"/>
    </svg>,
  },
   {
    name: "MongoDB", bg: "#fff",
    icon: <svg viewBox="0 0 24 24" width="20" height="22">
      <path fill="#499D4A" d="M12.889 20.852s5.595-3.678 4.286-11.33c-1.262-5.563-4.239-7.387-4.566-8.088-.358-.499-.701-1.371-.701-1.371l.234 15.475c-.001.015-.484 4.737.747 5.314z"/>
      <path fill="#58AA50" d="M11.58 21.054s-5.252-3.584-4.94-9.896c.296-6.312 4.005-9.413 4.722-9.974.468-.498.483-.685.514-1.184.327.701.265 10.488.312 11.641.14 4.442-.249 8.572-.608 9.413z"/>
      <path fill="#499D4A" d="m12.546 24-.639-.218s.078-3.257-1.091-3.491c-.779-.904.125-38.338 2.93-.125 0 0-.966.483-1.138 1.309-.186.811-.062 2.525-.062 2.525z"/>
    </svg>,
  },
  {
    name: "GitHub", bg: "#24292E",
    icon: <svg viewBox="0 0 1792 1792" width="20" height="20" fill="white">
      <path d="M1664 896q0 251-146.5 451.5T1139 1625q-27 5-39.5-7t-12.5-30v-211q0-97-52-142 57-6 102.5-18t94-39 81-66.5 53-105T1386 856q0-121-79-206 37-91-8-204-28-9-81 11t-92 44l-38 24q-93-26-192-26t-192 26q-16-11-42.5-27T578 459.5 492 446q-44 113-7 204-79 85-79 206 0 85 20.5 150t52.5 105 80.5 67 94 39 102.5 18q-40 36-49 103-21 10-45 15t-57 5-65.5-21.5T484 1274q-19-32-48.5-52t-49.5-24l-20-3q-21 0-29 4.5t-5 11.5 9 14 13 12l7 5q22 10 43.5 38t31.5 51l10 23q13 38 44 61.5t67 30 69.5 7 55.5-3.5l23-4q0 38 .5 89t.5 54q0 18-13 30t-40 7q-232-77-378.5-277.5T128 896q0-209 103-385.5T510.5 231 896 128t385.5 103T1561 510.5 1664 896z"/>
    </svg>,
  },
  {
    name: "Custom", bg: "#1a1a1a",
    icon: <svg viewBox="0 0 32 32" width="22" height="22">
      <path fill="#fff" d="M30,16l-9,7v-2.534L26.742,16L21,11.534V9L30,16z M11,20.466L5.258,16L11,11.534V9l-9,7l9,7V20.466z M17.794,9l-6,14h2.177l6-14H17.794z"/>
    </svg>,
  },
];

const ALERTS = [
  {
    label: "P0 · CRITICAL", labelBg: "#FEE2E2", labelColor: "#DC2626",
    source: "Vercel", sourceIcon: "▲", sourceBg: "#000000",
    event: "prod-api returning 500 errors", sublabel: "847 failed requests / min",
    waLines: ["*Production API is Down*", "Error: 500 Internal Server Error.", "Component: Auth Service", "Current Status: Down"],
    time: "2:47 AM", dotColor: "#EF4444",
  },
  {
    label: "P0 · URGENT", labelBg: "#FEF3C7", labelColor: "#D97706",
    source: "Stripe", sourceIcon: "◈", sourceBg: "#6772E5",
    event: "card_declined — arjun@startup.io", sublabel: "$149/mo at risk · reach out now",
    waLines: ["*Payment Failed*", "User: arjun@startup.io", "Plan: $149/mo plan declined", "Action: Reach out before they churn"],
    time: "11:23 AM", dotColor: "#F97316",
  }
];

function parseWABold(text) {
  return text.split(/(\*[^*]+\*)/g).map((part, i) =>
    part.startsWith("*") && part.endsWith("*")
      ? <strong key={i}>{part.slice(1, -1)}</strong>
      : <span key={i}>{part}</span>
  );
}

export default function HeroSection() {
  const [alertIdx, setAlertIdx] = useState(0);
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

  useEffect(() => {
    const id = setInterval(() => {
      setAlertIdx((i) => (i + 1) % ALERTS.length);
    }, 4200);
    return () => clearInterval(id);
  }, []);

  const alert = ALERTS[alertIdx];

  return (
    <>
      <style>{`
        @keyframes heroUp   { from { opacity:0; transform:translateY(28px); } to { opacity:1; transform:translateY(0); } }
        @keyframes dotPulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.6; transform:scale(1.6); } }
        @keyframes msgIn    { from { opacity:0; transform:translateY(10px) scale(.97); } to { opacity:1; transform:translateY(0) scale(1); } }
        .hero-cta:hover     { transform:translateY(-3px) !important; box-shadow:0 24px 52px rgba(0,0,0,.2) !important; }
        @keyframes spark    { 0% { top: 0%; opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { top: 100%; opacity: 0; } }
        @keyframes flowDot  { from { stroke-dashoffset: 102; } to { stroke-dashoffset: 0; } }
        @keyframes hubPulse { 0%,100% { box-shadow: 0 0 0 4px rgba(37,211,102,0.15), 0 0 12px rgba(37,211,102,0.3); } 50% { box-shadow: 0 0 0 10px rgba(37,211,102,0.04), 0 0 24px rgba(37,211,102,0.5); } }
      `}</style>

      <section style={{
        minHeight: "100vh",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: isMobile ? "128px 20px 64px" : "160px 60px 88px",
        background: "#FAF8ED",
        fontFamily: "'Inter', -apple-system, sans-serif",
        position: "relative", overflow: "hidden",
      }}>
        {/* Warm amber glow — top right */}
        <div style={{
          position: "absolute", top: "5%", right: "5%",
          width: 560, height: 560,
          background: "radial-gradient(circle, rgba(251,191,36,.1) 0%, transparent 70%)",
          filter: "blur(90px)", pointerEvents: "none",
        }} />
        {/* Soft green glow — left */}
        <div style={{
          position: "absolute", top: "30%", left: "-5%",
          width: 360, height: 360,
          background: "radial-gradient(circle, rgba(37,211,102,.07) 0%, transparent 70%)",
          filter: "blur(70px)", pointerEvents: "none",
        }} />

        <div style={{
          position: "relative", zIndex: 2,
          width: "100%", maxWidth: 1160,
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: "center",
          gap: isMobile ? 48 : 72,
        }}>

          {/* ── LEFT ── */}
          <div style={{ flex: "0 0 auto", width: isMobile ? "100%" : "48%" }}>

            <p style={{
              fontSize: 13, fontWeight: 600,
              color: "#92722A",
              margin: "0 0 18px",
              letterSpacing: "0.01em",
            }}>
              WhatsApp alerts for SaaS founders.
            </p>

            <h1 style={{
              fontSize: isMobile ? "clamp(2.6rem,10vw,3.2rem)" : "clamp(3rem,5vw,4rem)",
              fontWeight: 800, letterSpacing: "-0.04em",
              color: "#1A1A1A", lineHeight: 1.06, margin: "0 0 24px",
            }}>
              <span style={{ display: "block" }}>Slack buried it.</span>
              <span style={{ display: "block" }}>Email missed it.</span>
              <span style={{ display: "block", color: "#22A35A" }}>WhatsApp didn't.</span>
            </h1>

            <p style={{
              fontSize: isMobile ? "1rem" : "1.08rem",
              color: "#6B7280", lineHeight: 1.72,
              maxWidth: 460, margin: "0 0 36px", fontWeight: 400,
            }}>
              Paste one webhook. Get pinged on WhatsApp the moment your server crashes, a payment fails, or a customer churns.{" "}
              <strong style={{ color: "#1A1A1A", fontWeight: 600 }}>No API setup. No noise. Just the signal that matters.</strong>
            </p>

            {/* CTA */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: isMobile ? "stretch" : "flex-start", gap: 10 }}>
              <button
                className="hero-cta"
                onClick={() => { trackCTA("hero_get_webhook", "hero"); navigate("/professional/login"); }}
                style={{
                  background: "#1A1A1A", color: "#fff",
                  fontSize: isMobile ? 15 : 16, fontWeight: 700,
                  padding: isMobile ? "17px 32px" : "18px 44px",
                  borderRadius: 50, border: "none", cursor: "pointer",
                  transition: "all .25s ease",
                  boxShadow: "0 6px 20px rgba(0,0,0,.16)",
                  letterSpacing: "-.01em",
                  width: isMobile ? "100%" : "auto",
                  animation: "heroUp .6s ease-out .3s backwards",
                  display: "flex", alignItems: "center", gap: 8, justifyContent: "center",
                }}
              >
                Get Started for Free
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Trust chips */}
            <div style={{
              display: "flex", flexWrap: "wrap", gap: isMobile ? 2 : 12,
              marginTop: isMobile ? 28 : 36,
            }}>
              {["Verified by Meta", "No Template Approvals Req."].map((txt, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "rgba(255,255,255,0.7)",
                  border: "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 50, padding: "5px 14px",
                  fontSize: 12, color: "#374151", fontWeight: 500,
                }}>
                  {i === 0
                    ? <img src={metaLogo} alt="Meta" width="14" height="14" style={{ objectFit: "contain" }} />
                    : ""
                  }
                  {txt}
                </div>
              ))}
            </div>
          </div>
          {/* ── END LEFT ── */}

          {/* ── RIGHT ── */}
          <div style={{
            flex: 1,
            background: "rgba(37,211,102,0.06)",
            border: "1.5px solid rgba(37,211,102,0.14)",
            borderRadius: 32,
            padding: isMobile ? "24px 18px" : "28px 24px",
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            {/* ── Integrations Funnel ── */}
            <div style={{
              background: "#0F172A", borderRadius: 18,
              padding: "16px 20px 0",
              border: "1px solid rgba(255,255,255,.06)",
            }}>
              {/* Integration chips row */}
              <div style={{ display: "flex", justifyContent: "space-around" }}>
                {SOURCES.map((s, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                    <div style={{
                      width: 34, height: 34, background: s.bg, borderRadius: 9,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: "1px solid rgba(0,0,0,0.1)",
                      overflow: "hidden",
                    }}>{s.icon}</div>
                    <span style={{ fontSize: 9, color: "#64748B", fontWeight: 600, letterSpacing: "0.04em" }}>{s.name}</span>
                  </div>
                ))}
              </div>

              {/* Converging SVG lines — icons to hub */}
              <svg viewBox="0 0 100 52" width="100%" height="52" style={{ display: "block" }}>
                {[8, 25, 42, 58, 75, 92].map((x, i) => (
                  <path key={`t${i}`} d={`M ${x} 0 C ${x} 26, 50 26, 50 52`}
                    stroke="rgba(37,211,102,0.12)" strokeWidth="1" fill="none" />
                ))}
                {[8, 25, 42, 58, 75, 92].map((x, i) => (
                  <path key={`f${i}`} d={`M ${x} 0 C ${x} 26, 50 26, 50 52`}
                    stroke="#25D366" strokeWidth="1.5" fill="none"
                    strokeDasharray="2 100"
                    style={{ animation: `flowDot 1.8s linear infinite ${i * 280}ms` }} />
                ))}
              </svg>
            </div>

            {/* Hub node + spark line */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0, marginTop: -2 }}>
              {/* Hub */}
              <div style={{
                width: 40, height: 40, borderRadius: "50%",
                background: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                animation: "hubPulse 2s ease-in-out infinite",
                zIndex: 2,
                boxShadow: "0 2px 12px rgba(37,211,102,0.25)",
                overflow: "hidden",
                border: "2px solid rgba(37,211,102,0.3)",
              }}>
                <img src={myhandleLogo} alt="MyHandle" width="26" height="26" style={{ objectFit: "contain" }} />
              </div>
              {/* Spark line down to WhatsApp */}
              <div style={{ position: "relative", width: 2, height: 28 }}>
                <div style={{
                  position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
                  background: "linear-gradient(180deg, rgba(37,211,102,0.15) 0%, rgba(37,211,102,0.5) 50%, rgba(37,211,102,0.15) 100%)",
                  borderRadius: 2,
                }} />
                <div style={{
                  position: "absolute", left: "50%", transform: "translateX(-50%)",
                  width: 6, height: 12,
                  background: "radial-gradient(ellipse at center, #25D366 0%, rgba(37,211,102,0) 100%)",
                  borderRadius: "50%",
                  animation: "spark 1.2s ease-in-out infinite",
                  boxShadow: "0 0 6px 2px rgba(37,211,102,0.6)",
                }} />
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none"
                  style={{ position: "absolute", bottom: -5, left: "50%", transform: "translateX(-50%)" }}>
                  <path d="M1 1l4 4 4-4" stroke="#25D366" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>

            {/* WhatsApp card */}
            <div style={{ background: "#E5DDD5", borderRadius: 18, overflow: "hidden" }}>
              <div style={{ background: "#075E54", padding: "11px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#25D366", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                  {WA_ICON}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>MyHandle</div>
                  <div style={{ fontSize: 11, color: "#B2DFDB" }}>online</div>
                </div>
              </div>
              <div style={{ padding: "12px 10px 8px" }}>
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <div style={{
                    background: "#fff", borderRadius: "16px 16px 16px 4px",
                    maxWidth: "82%",
                    boxShadow: "0 1px 3px rgba(0,0,0,.08)",
                    animation: "msgIn .4s ease-out",
                    overflow: "hidden",
                  }}>
                    <div style={{ padding: "10px 14px 6px" }}>
                      {alert.waLines.map((line, i) => (
                        <div key={i} style={{ fontSize: i === 0 ? 13 : 12, color: "#111827", lineHeight: 1.5, marginBottom: i < alert.waLines.length - 1 ? 3 : 0 }}>
                          {parseWABold(line)}
                        </div>
                      ))}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 5 }}>
                        <span style={{ fontSize: 10, color: "#8CA49B" }}>{alert.time}</span>
                      </div>
                    </div>
                    <div style={{ borderTop: "1px solid #E5E7EB" }} />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px 14px" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0096DE" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                        <polyline points="10 9 9 9 8 9"/>
                      </svg>
                      <span style={{ fontSize: 13, color: "#0096DE", fontWeight: 500 }}>Full Details</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: 5, marginTop: 10 }}>
                  {ALERTS.map((_, i) => (
                    <div key={i} style={{
                      width: i === alertIdx ? 18 : 6, height: 6, borderRadius: 3,
                      background: i === alertIdx ? "#25D366" : "#B0BEC5",
                      transition: "all .35s ease",
                    }} />
                  ))}
                </div>
              </div>
            </div>

            {/* Escalation hint */}
            <div style={{
              background: "#fff", border: "1px solid #FDE68A",
              borderRadius: 14, padding: "11px 16px",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ fontSize: 18, lineHeight: 1 }}>⚡</span>
              <p style={{ margin: 0, fontSize: 12, color: "#92400E", fontWeight: 500, lineHeight: 1.5 }}>
                No acknowledgement in X min?{" "}
                <strong style={{ color: "#D97706" }}>Escalate to a Co-founder or CTO.</strong>{" "}
               
              </p>
            </div>

          </div>
          {/* ── END RIGHT ── */}

        </div>
      </section>
    </>
  );
}

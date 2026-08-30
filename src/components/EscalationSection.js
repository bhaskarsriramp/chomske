import { useState, useEffect } from "react";

const WA_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

function WAProductionCard({ headerTitle, headerSub, headerAvatar, time }) {
  return (
    <div style={{ background: "#E5DDD5", borderRadius: 14, overflow: "hidden", marginTop: 18 }}>
      <div style={{ background: "#075E54", padding: "9px 13px", display: "flex", alignItems: "center", gap: 9 }}>
        <div style={{
          width: 30, height: 30, borderRadius: "50%", background: "#25D366",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", flexShrink: 0,
        }}>
          {headerAvatar || WA_ICON}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{headerTitle}</div>
          {headerSub && <div style={{ fontSize: 9, color: "#B2DFDB" }}>{headerSub}</div>}
        </div>
      </div>
      <div style={{ padding: "10px 8px 10px" }}>
        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          <div style={{
            background: "#fff", borderRadius: "14px 14px 14px 4px",
            maxWidth: "88%", boxShadow: "0 1px 3px rgba(0,0,0,.08)",
            overflow: "hidden",
          }}>
            <div style={{ padding: "9px 13px 6px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#111827", marginBottom: 3 }}>Production API is Down</div>
              <div style={{ fontSize: 11, color: "#111827", lineHeight: 1.5, marginBottom: 2 }}>
                Error: <span style={{ color: "#D97706" }}>500 Internal Server Error.</span>
              </div>
              <div style={{ fontSize: 11, color: "#111827", lineHeight: 1.5, marginBottom: 2 }}>
                Component: <span style={{ color: "#D97706" }}>Auth Service</span>
              </div>
              <div style={{ fontSize: 11, color: "#111827", lineHeight: 1.5 }}>
                Current Status: <span style={{ color: "#D97706" }}>Down</span>
              </div>
              <div style={{ fontSize: 9, color: "#8CA49B", marginTop: 4, textAlign: "right" }}>{time}</div>
            </div>
            <div style={{ borderTop: "1px solid #E5E7EB" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "6px 13px" }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0096DE" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              <span style={{ fontSize: 12, color: "#0096DE", fontWeight: 500 }}>Full Details</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EscalationSection() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width:900px)").matches
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width:900px)");
    const h = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  const CHAIN = [
    {
      time: "T+0", tag: "First alert",
      headline: "WhatsApp message delivered.",
      sub: "Green bubble on your phone. 90% of the time, this is all it takes.",
      color: "#25D366", bg: "rgba(37,211,102,0.07)", border: "rgba(37,211,102,0.15)",
      visual: <WAProductionCard headerTitle="MyHandle" headerSub="online" time="2:47 AM" />,
    },
    {
      time: "T+X min", tag: "Second Alert",
      headline: "👥 Backup contact alerted.",
      sub: "Same alert forwarded to your co-founder or CTO. Either can acknowledge and stop the chain.",
      color: "#E05A00", bg: "rgba(239,68,68,0.07)", border: "rgba(239,68,68,0.15)",
      visual: (
        <WAProductionCard
          headerTitle="Sarah (Co-founder)"
          headerSub="📤 forwarded by MyHandle"
          headerAvatar={
            <span style={{ fontSize: 11, fontWeight: 800, color: "#fff" }}>CTO</span>
          }
          time="2:52 AM"
        />
      ),
    },
  ];

  const cells = [];
  CHAIN.forEach((step, i) => {
    cells.push(
      <div key={`s${i}`} style={{
        background: step.bg, border: `1.5px solid ${step.border}`,
        borderRadius: 20, padding: isMobile ? "24px 20px" : "28px 24px",
      }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "rgba(255,255,255,0.04)", border: `1px solid ${step.border}`,
          borderRadius: 50, padding: "4px 12px", marginBottom: 14,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: step.color }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: step.color }}>{step.time}</span>
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 8 }}>
          {step.tag}
        </div>
        <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#F1F5F9", lineHeight: 1.3, margin: "0 0 8px", letterSpacing: "-0.02em" }}>
          {step.headline}
        </h3>
        <p style={{ fontSize: ".85rem", color: "#64748B", lineHeight: 1.6, margin: 0 }}>{step.sub}</p>
        {step.visual}
      </div>
    );

    if (i < CHAIN.length - 1) {
      cells.push(
        <div key={`c${i}`} style={{
          display: isMobile ? "none" : "flex",
          alignItems: "center", justifyContent: "center",
          alignSelf: "center",
          padding: "0 20px",
        }}>
          <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "stretch", gap: 7 }}>
            {/* Pill */}
            <div style={{
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(148,163,184,0.18)",
              borderRadius: 8, padding: "5px 10px",
              fontSize: 9, fontWeight: 700, color: "#94A3B8",
              textTransform: "uppercase", letterSpacing: ".05em", textAlign: "center", lineHeight: 1.4,
              whiteSpace: "nowrap",
            }}>
              No Acknowledgement
            </div>
            {/* Arrow line — stretches to pill width */}
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ flex: 1, height: 1.5, background: "#64748B", borderRadius: 1 }} />
              <div style={{
                width: 0, height: 0,
                borderTop: "4px solid transparent",
                borderBottom: "4px solid transparent",
                borderLeft: "6px solid #64748B",
              }} />
            </div>
          </div>
        </div>
      );
    }
  });

  return (
    <section style={{
      background: "#0F172A",
      padding: isMobile ? "72px 20px 64px" : "108px 60px 88px",
      fontFamily: "'Inter', -apple-system, sans-serif",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: "40%", left: "50%", transform: "translateX(-50%)",
        width: 700, height: 400,
        background: "radial-gradient(ellipse, rgba(239,68,68,0.05) 0%, transparent 65%)",
        filter: "blur(80px)", pointerEvents: "none",
      }} />

      <div style={{ maxWidth: 1060, margin: "0 auto", position: "relative", zIndex: 1 }}>
        <div style={{ textAlign: isMobile ? "left" : "center", marginBottom: isMobile ? 44 : 64 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#EF4444", margin: "0 0 14px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Intelligent Escalation
          </p>
          <h2 style={{
            fontSize: isMobile ? "clamp(1.9rem,7vw,2.5rem)" : "clamp(2.4rem,4vw,3.2rem)",
            fontWeight: 800, letterSpacing: "-0.04em", color: "#F8FAFC", lineHeight: 1.12, margin: "0 0 16px",
          }}>
            If you miss it, your backup won't.
          </h2>
          <p style={{ fontSize: isMobile ? ".95rem" : "1.05rem", color: "#64748B", lineHeight: 1.68, maxWidth: 460, margin: "0 auto" }}>
            Most tools send one ping and hope for the best. At 2am, hope isn't enough.
          </p>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 360px) 148px minmax(0, 360px)",
          gap: isMobile ? 16 : 0,
          alignItems: "start",
          justifyContent: "center",
        }}>
          {cells}
        </div>

        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          maxWidth: 420, margin: `${isMobile ? 32 : 44}px auto 0`,
          background: "rgba(37,211,102,0.06)", border: "1px solid rgba(37,211,102,0.12)",
          borderRadius: 14, padding: "14px 20px",
        }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#25D366", flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 13, color: "#94A3B8" }}>
            <strong style={{ color: "#25D366" }}>Acknowledge</strong> at any step to stop the chain immediately.
          </p>
        </div>
      </div>
    </section>
  );
}

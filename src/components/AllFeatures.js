import { useState, useEffect } from "react";

const WA_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const FULL_DETAILS_BTN = (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px 14px" }}>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0096DE" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
    <span style={{ fontSize: 13, color: "#0096DE", fontWeight: 500 }}>Full Details</span>
  </div>
);

// Source icon definitions
const SRC = {
  vercel: {
    name: "Vercel", bg: "#000",
    svg: <svg viewBox="0 0 24 24" width="13" height="13" fill="none"><path d="M12 1L24 22H0L12 1Z" fill="#fff"/></svg>,
  },
  stripe: {
    name: "Stripe", bg: "#fff",
    svg: <svg viewBox="0 0 24 24" width="16" height="14"><path fill="#646FDE" d="M11.106 18.592c-2.215 0-5.077-.914-7.324-2.133v6.022A18.597 18.597 0 0 0 11.102 24c5.564 0 9.398-2.39 9.398-7.198 0-7.976-10.229-6.547-10.229-9.556l-.001-.001c0-1.045.873-1.448 2.271-1.448 2.036 0 4.621.623 6.658 1.72V1.223C16.981.337 14.766 0 12.547 0 7.118 0 3.5 2.83 3.5 7.564c0 7.401 10.173 6.201 10.173 9.392 0 1.238-1.074 1.636-2.567 1.636z"/></svg>,
  },
  github: {
    name: "GitHub", bg: "#24292E",
    svg: <svg viewBox="0 0 1792 1792" width="14" height="14" fill="white"><path d="M1664 896q0 251-146.5 451.5T1139 1625q-27 5-39.5-7t-12.5-30v-211q0-97-52-142 57-6 102.5-18t94-39 81-66.5 53-105T1386 856q0-121-79-206 37-91-8-204-28-9-81 11t-92 44l-38 24q-93-26-192-26t-192 26q-16-11-42.5-27T578 459.5 492 446q-44 113-7 204-79 85-79 206 0 85 20.5 150t52.5 105 80.5 67 94 39 102.5 18q-40 36-49 103-21 10-45 15t-57 5-65.5-21.5T484 1274q-19-32-48.5-52t-49.5-24l-20-3q-21 0-29 4.5t-5 11.5 9 14 13 12l7 5q22 10 43.5 38t31.5 51l10 23q13 38 44 61.5t67 30 69.5 7 55.5-3.5l23-4q0 38 .5 89t.5 54q0 18-13 30t-40 7q-232-77-378.5-277.5T128 896q0-209 103-385.5T510.5 231 896 128t385.5 103T1561 510.5 1664 896z"/></svg>,
  },
  custom: {
    name: "Custom", bg: "#1a1a1a",
    svg: <svg viewBox="0 0 32 32" width="13" height="13"><path fill="#fff" d="M30,16l-9,7v-2.534L26.742,16L21,11.534V9L30,16z M11,20.466L5.258,16L11,11.534V9l-9,7l9,7V20.466z M17.794,9l-6,14h2.177l6-14H17.794z"/></svg>,
  },
};

const FEATURES = [
  {
    id: "fire",
    icon: "🔴",
    label: "Fire Alarm",
    tagline: "Server down before your users even notice",
    tag: "P0", tagColor: "#DC2626", tagBg: "#FEE2E2", accentColor: "#DC2626",
    src: SRC.vercel,
    template: {
      title: "Production API is Down",
      fields: [
        { key: "Error", value: "500 Internal Server Error" },
        { key: "Component", value: "prod-api.vercel.app" },
        { key: "Current Status", value: "Down" },
      ],
      time: "2:47 AM",
    },
  },
  {
    id: "save",
    icon: "💳",
    label: "The Save",
    tagline: "Catch failed payments before they churn",
    tag: "P0", tagColor: "#D97706", tagBg: "#FEF3C7", accentColor: "#D97706",
    src: SRC.stripe,
    template: {
      title: "Payment Failed",
      fields: [
        { key: "User", value: "arjun@startup.io" },
        { key: "Plan", value: "$149/mo Growth Plan" },
        { key: "Status", value: "Declined" },
      ],
      time: "11:23 AM",
    },
  },
  {
    id: "sale",
    icon: "🎉",
    label: "New Sale",
    tagline: "New subscription: Revenue growing",
    tag: "P1", tagColor: "#16A34A", tagBg: "#DCFCE7", accentColor: "#22C55E",
    src: SRC.stripe,
    template: {
      title: "New Subscription",
      fields: [
        { key: "User", value: "priya@techco.in" },
        { key: "Plan", value: "$49/mo Growth Plan" },
        { key: "Revenue", value: "+$588/year" },
      ],
      time: "3:14 PM",
    },
  },
  {
    id: "churn",
    icon: "📊",
    label: "Churn Alert",
    tagline: "Cancellation window: Act before it closes",
    tag: "P1", tagColor: "#2563EB", tagBg: "#EFF6FF", accentColor: "#3B82F6",
    src: SRC.stripe,
    template: {
      title: "Subscription Cancelled",
      fields: [
        { key: "User", value: "mike@agency.com" },
        { key: "Plan", value: "$99/mo Pro Plan" },
        { key: "Status", value: "Cancelled" },
      ],
      time: "9:02 AM",
    },
  },
  {
    id: "build",
    icon: "⚙️",
    label: "Build Alert",
    tagline: "Failed deploy caught before it hits prod",
    tag: "P1", tagColor: "#7C3AED", tagBg: "#F3E8FF", accentColor: "#8B5CF6",
    src: SRC.github,
    template: {
      title: "Build Failed",
      fields: [
        { key: "Commit", value: "fix/auth-bypass" },
        { key: "Branch", value: "staging" },
        { key: "Author", value: "@devteam" },
      ],
      time: "4:30 PM",
    },
  },
  {
    id: "webhook",
    icon: "🔗",
    label: "Any Webhook",
    tagline: "Any service, any event, any alert",
    tag: "All plans", tagColor: "#64748B", tagBg: "#F1F5F9", accentColor: "#64748B",
    src: SRC.custom,
    template: {
      title: "Disk Usage Critical",
      fields: [
        { key: "Server", value: "prod-db-01" },
        { key: "Usage", value: "94% of 500GB" },
        { key: "Threshold", value: "90%" },
      ],
      time: "6:15 AM",
    },
  },
];

function WATemplateBubble({ template, featureId }) {
  return (
    <div key={featureId} style={{ padding: "12px 10px 10px" }}>
      <div style={{ display: "flex", justifyContent: "flex-start" }}>
        <div style={{
          background: "#fff",
          borderRadius: "16px 16px 16px 4px",
          maxWidth: "88%",
          boxShadow: "0 1px 3px rgba(0,0,0,.08)",
          overflow: "hidden",
          animation: "featMsgIn .3s ease-out both",
        }}>
          <div style={{ padding: "10px 14px 6px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", lineHeight: 1.5, marginBottom: 4 }}>
              {template.title}
            </div>
            {template.fields.map(({ key, value }, i) => (
              <div key={i} style={{ fontSize: 12, color: "#111827", lineHeight: 1.55, marginBottom: i < template.fields.length - 1 ? 2 : 0 }}>
                {key}: <span style={{ color: "#D97706" }}>{value}</span>
              </div>
            ))}
            <div style={{ fontSize: 10, color: "#8CA49B", marginTop: 5, textAlign: "right" }}>
              {template.time}
            </div>
          </div>
          <div style={{ borderTop: "1px solid #E5E7EB" }} />
          {FULL_DETAILS_BTN}
        </div>
      </div>
    </div>
  );
}

export default function AllFeatures() {
  const [active, setActive] = useState("fire");
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

  const feature = FEATURES.find(f => f.id === active);

  return (
    <section id="features" style={{
      background: "#FAFAF7",
      padding: isMobile ? "72px 20px 64px" : "108px 60px 88px",
      fontFamily: "'Inter', -apple-system, sans-serif",
      overflowX: "hidden",
    }}>
      <style>{`
        @keyframes featMsgIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .feat-tab-btn { transition: all .18s ease; cursor: pointer; border: none; background: transparent; width: 100%; text-align: left; }
        .feat-tab-btn:hover { background: #F1F5F9 !important; }
        .tab-chip { transition: all .18s ease; cursor: pointer; border: none; }
        .tab-chip:hover { opacity: .8; }
        .tab-scroll::-webkit-scrollbar { display: none; }
        .tab-scroll { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div style={{ maxWidth: 1060, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: isMobile ? "left" : "center", marginBottom: isMobile ? 36 : 56 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#22A35A", margin: "0 0 14px", letterSpacing: "0.01em" }}>Features</p>
          <h2 style={{
            fontSize: isMobile ? "clamp(1.9rem,7vw,2.5rem)" : "clamp(2.4rem,4vw,3.4rem)",
            fontWeight: 800, letterSpacing: "-0.04em", color: "#1A1A1A", lineHeight: 1.1, margin: "0 0 14px",
          }}>
            Every alert that matters.
          </h2>
          <p style={{ fontSize: isMobile ? ".95rem" : "1.05rem", color: "#6B7280", lineHeight: 1.68, maxWidth: 460, margin: "0 auto" }}>
            Click any alert type to see exactly what lands on your WhatsApp.
          </p>
        </div>

        {/* Main layout */}
        <div style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          gap: isMobile ? 24 : 52,
          alignItems: isMobile ? "stretch" : "flex-start",
          minWidth: 0,
        }}>
          {/* Left: Tabs */}
          <div style={{ width: isMobile ? "100%" : 290, flexShrink: 0, minWidth: 0 }}>
            {isMobile ? (
              <div className="tab-scroll" style={{ display: "flex", overflowX: "auto", gap: 8, paddingBottom: 12 }}>
                {FEATURES.map(f => (
                  <button key={f.id} onClick={() => setActive(f.id)} className="tab-chip" style={{
                    flexShrink: 0,
                    background: active === f.id ? f.tagBg : "#fff",
                    border: `1.5px solid ${active === f.id ? f.tagColor : "#E2E8F0"}`,
                    borderRadius: 50, padding: "7px 16px",
                    display: "flex", alignItems: "center", gap: 6,
                    fontSize: 12, fontWeight: 600,
                    color: active === f.id ? f.tagColor : "#64748B",
                  }}>
                    <span>{f.icon}</span> {f.label}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {FEATURES.map(f => (
                  <button key={f.id} onClick={() => setActive(f.id)} className="feat-tab-btn" style={{
                    background: active === f.id ? "#fff" : "transparent",
                    borderLeft: `3px solid ${active === f.id ? f.accentColor : "transparent"}`,
                    borderRadius: "0 14px 14px 0",
                    padding: "10px 14px",
                    display: "flex", alignItems: "center", gap: 12,
                    boxShadow: active === f.id ? "0 2px 12px rgba(0,0,0,.06)" : "none",
                  }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: 11,
                      background: active === f.id ? f.tagBg : "#F1F5F9",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 18, flexShrink: 0, transition: "all .18s",
                    }}>{f.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{f.label}</span>
                        <span style={{
                          fontSize: 9, fontWeight: 700, color: f.tagColor,
                          background: f.tagBg, borderRadius: 50, padding: "2px 8px",
                          whiteSpace: "nowrap",
                        }}>{f.tag}</span>
                      </div>
                      <span style={{ fontSize: 11, color: "#94A3B8", lineHeight: 1.4, display: "block" }}>{f.tagline}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: WhatsApp mockup */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", justifyContent: isMobile ? "stretch" : "center" }}>
            <div style={{ width: "100%", maxWidth: isMobile ? "100%" : 380 }}>
              {/* WA Chat */}
              <div style={{
                background: "#E5DDD5", borderRadius: 20, overflow: "hidden",
                boxShadow: "0 12px 48px rgba(0,0,0,.1)", border: "1px solid #D1D5DB",
              }}>
                {/* Header */}
                <div style={{ background: "#075E54", padding: "11px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: "50%", background: "#25D366",
                    display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0,
                  }}>
                    {WA_ICON}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>MyHandle</div>
                    <div style={{ fontSize: 10, color: "#B2DFDB", display: "flex", alignItems: "center", gap: 5 }}>
                      <span>via</span>
                      <div style={{
                        width: 18, height: 18, borderRadius: 4,
                        background: feature.src.bg,
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        overflow: "hidden", flexShrink: 0,
                        border: feature.src.bg === "#fff" ? "1px solid rgba(255,255,255,0.3)" : "none",
                      }}>
                        {feature.src.svg}
                      </div>
                      <span>{feature.src.name}</span>
                    </div>
                  </div>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#25D366", boxShadow: "0 0 6px #25D366", flexShrink: 0 }} />
                </div>

                {/* Template message — key on feature.id reruns animation */}
                <WATemplateBubble key={feature.id} template={feature.template} featureId={feature.id} />

                {/* Input bar */}
                <div style={{ background: "#F0F2F5", padding: "8px 10px", display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    flex: 1, background: "#fff", borderRadius: 20,
                    padding: "8px 14px", fontSize: 11, color: "#A0AEC0",
                    minWidth: 0,
                  }}>
                    Reply OK to acknowledge...
                  </div>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", background: "#25D366",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, flexShrink: 0, color: "#fff",
                  }}>▶</div>
                </div>
              </div>

              {/* Feature caption */}
              <div style={{
                marginTop: 14, background: "#fff", borderRadius: 14,
                padding: "14px 18px",
                border: `1px solid ${feature.tagBg}`,
                borderLeft: `4px solid ${feature.accentColor}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 18 }}>{feature.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{feature.label}</span>
                  <span style={{
                    marginLeft: "auto", fontSize: 10, fontWeight: 700,
                    color: feature.tagColor, background: feature.tagBg,
                    borderRadius: 50, padding: "3px 10px", whiteSpace: "nowrap",
                  }}>{feature.tag}</span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: "#64748B", lineHeight: 1.6 }}>{feature.tagline}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Priority legend */}
        <div style={{
          marginTop: isMobile ? 32 : 48,
          display: "flex", flexWrap: "wrap", gap: isMobile ? 8 : 12,
          alignItems: "center",
          justifyContent: isMobile ? "flex-start" : "center",
        }}>
          <span style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 500, marginRight: 4 }}>Priority tiers:</span>
          {[
            { label: "P0 : breaks through mute, wakes you up anytime", color: "#EF4444", bg: "#FEE2E2" },
            { label: "P1 : respects quiet hours", color: "#D97706", bg: "#FEF3C7" },
          ].map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, background: t.bg, borderRadius: 50, padding: "4px 14px" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: t.color }}>{t.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

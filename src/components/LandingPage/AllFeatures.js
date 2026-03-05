import { useState, useEffect, useRef } from "react";

function useInView(threshold = 0.1) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { threshold });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView];
}

// ── Animated mini-dashboard for each engine ───────────────────────────

function OnboardingDemo({ compact }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep(p => (p + 1) % 5), 1600);
    return () => clearInterval(t);
  }, []);

  const users = [
    { name: "Arjun M.", days: "Day 3", stuck: "Never opened a core feature since setup.." },
    { name: "Priya S.", days: "Day 5", stuck: "Invited team, workspace never activated." },
    { name: "Rahul K.", days: "Day 2", stuck: "Profiling done, but zero actions taken.." },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 5 : 7 }}>
      {users.map((u, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: compact ? "7px 10px" : "9px 12px",
          background: step > i ? "rgba(245,158,11,0.08)" : "rgba(255,255,255,0.04)",
          borderRadius: 8,
          borderLeft: `3px solid ${step > i ? "#F59E0B" : "transparent"}`,
          transition: "all 0.4s ease",
        }}>
          <div style={{
            width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
            background: "rgba(245,158,11,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 700, color: "#F59E0B",
          }}>{u.name[0]}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: compact ? 9.5 : 10, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{u.name}</div>
            {!compact && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{u.stuck}</div>}
          </div>
          <div style={{
            fontSize: compact ? 7.5 : 8, fontWeight: 700,
            color: step > i ? "#FCD34D" : "rgba(255,255,255,0.25)",
            background: step > i ? "rgba(245,158,11,0.15)" : "transparent",
            padding: "2px 6px", borderRadius: 4,
            transition: "all 0.4s ease",
          }}>{step > i ? "Contact" : u.days}</div>
        </div>
      ))}
      <div style={{
        padding: compact ? "6px 10px" : "8px 12px",
        background: "rgba(245,158,11,0.12)",
        border: "1px solid rgba(245,158,11,0.25)",
        borderRadius: 8, fontSize: compact ? 10 : 11, fontWeight: 600, color: "#FCD34D",
        display: "flex", alignItems: "center", gap: 6,
        opacity: step >= 4 ? 1 : 0,
        transition: "opacity 0.4s ease",
        pointerEvents: "none",
      }}>
        <span>⚡</span> Warm outreach list ready · 3 users
      </div>
    </div>
  );
}

function GhostingDemo({ compact }) {
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setPulse(p => !p), 2000);
    return () => clearInterval(t);
  }, []);

  const users = [
    { name: "Neha T.", plan: "Creator", days: 18, value: "High" },
    { name: "Sid V.", plan: "Creator", days: 12, value: "High" },
    { name: "Karan D.", plan: "Pro", days: 9, value: "Med" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 4,
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: "0.06em" }}>
          SILENT PAYING USERS
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{
            width: 7, height: 7, borderRadius: "50%",
            background: pulse ? "#EF4444" : "#dc2626",
            boxShadow: pulse ? "0 0 8px rgba(239,68,68,0.7)" : "none",
            transition: "all 0.4s ease",
          }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: "#FCA5A5" }}>ALERT</span>
        </div>
      </div>
      {users.map((u, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 13px",
          background: "rgba(239,68,68,0.07)",
          borderRadius: 9,
          borderLeft: "3px solid #EF4444",
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
            background: "rgba(239,68,68,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 700, color: "#EF4444",
          }}>{u.name[0]}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{u.name}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{u.plan} plan · {u.value} value</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#FCA5A5" }}>{u.days}d</div>
            <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.3)" }}>silent</div>
          </div>
        </div>
      ))}
      <div style={{
        padding: "10px 14px", borderRadius: 10,
        background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)",
        fontSize: 12, fontWeight: 600, color: "#FCA5A5",
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <span>👻</span> 3 at-risk users · Act before Stripe cancels
      </div>
    </div>
  );
}

function PowerUserDemo({ compact }) {
  const [highlight, setHighlight] = useState(-1);
  useEffect(() => {
    let i = 0;
    const t = setInterval(() => { setHighlight(i % 3); i++; }, 1800);
    return () => clearInterval(t);
  }, []);

  const users = [
    { name: "Divya R.", plan: "Free", actions: 142, limit: "Hit 3×" },
    { name: "Mohan P.", plan: "Free", actions: 118, limit: "Hit 2×" },
    { name: "Ananya S.", plan: "Free", actions: 97, limit: "At limit" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 5 : 7 }}>
      {users.map((u, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: compact ? "7px 10px" : "9px 12px",
          background: highlight === i ? "rgba(16,185,129,0.1)" : "rgba(255,255,255,0.04)",
          borderRadius: 8,
          borderLeft: `3px solid ${highlight === i ? "#10B981" : "transparent"}`,
          transition: "all 0.4s ease",
        }}>
          <div style={{
            width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
            background: "rgba(16,185,129,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 700, color: "#10B981",
          }}>{u.name[0]}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: compact ? 9.5 : 12, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{u.name}</div>
            {!compact && <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.4)" }}>{u.actions} actions · {u.limit}</div>}
            {compact && <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.4)" }}>{u.actions} actions</div>}
          </div>
          <div style={{
            fontSize: compact ? 8 : 10, fontWeight: 700,
            color: "#34D399", background: "rgba(16,185,129,0.15)",
            padding: "2px 6px", borderRadius: 4,
          }}>FREE→PRO?</div>
        </div>
      ))}
      <div style={{
        padding: compact ? "6px 10px" : "8px 12px", borderRadius: 8,
        background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)",
        fontSize: compact ? 10 : 11, fontWeight: 600, color: "#34D399",
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <span>🚀</span> Upsell list ready · Already proven value
      </div>
    </div>
  );
}

function FrictionDemo({ compact }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setFrame(p => (p + 1) % 6), 1400);
    return () => clearInterval(t);
  }, []);

  const funnelSteps = [
    { label: "Signed up", count: 100, pct: 100 },
    { label: "Created first conversation", count: 62, pct: 62 },
    { label: "Sent first message", count: 31, pct: 31 },
    { label: "Got a reply", count: 14, pct: 14 },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 6 : 8 }}>
      <div style={{ fontSize: compact ? 9 : 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: "0.06em", marginBottom: 2 }}>
        FUNNEL · WHERE USERS STALL
      </div>
      {funnelSteps.map((s, i) => (
        <div key={i}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ fontSize: compact ? 10 : 11, color: "rgba(255,255,255,0.6)" }}>{s.label}</span>
            <span style={{
              fontSize: compact ? 10 : 11, fontWeight: 700,
              color: i === 1 && frame > 2 ? "#8B5CF6" : "rgba(255,255,255,0.5)",
              transition: "color 0.4s ease",
            }}>{s.count}</span>
          </div>
          <div style={{ height: compact ? 4 : 6, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
            <div style={{
              height: "100%", borderRadius: 3,
              width: `${s.pct}%`,
              background: i === 1 && frame > 2
                ? "linear-gradient(90deg, #8B5CF6, #A78BFA)"
                : `rgba(139,92,246,${0.2 + i * 0.1})`,
              transition: "background 0.4s ease",
            }} />
          </div>
          {!compact && (
            <div style={{
              fontSize: 10, color: "#A78BFA", marginTop: 3,
              opacity: i === 1 && frame > 2 ? 1 : 0,
              transition: "opacity 0.3s ease",
            }}>
              ↑ 31 users stuck here · 3+ days
            </div>
          )}
        </div>
      ))}
      <div style={{
        padding: compact ? "6px 10px" : "8px 12px", borderRadius: 8,
        background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)",
        fontSize: compact ? 10 : 11, fontWeight: 600, color: "#A78BFA",
        display: "flex", alignItems: "center", gap: 6,
        opacity: frame > 4 ? 1 : 0,
        transition: "opacity 0.4s ease",
        pointerEvents: "none",
      }}>
        <span>🔧</span> Support alert · Send contextual nudge
      </div>
    </div>
  );
}

// ── Engine data ───────────────────────────────────────────────────────
const ENGINES = [
  {
    tag: "Engine 02",
    icon: "👻",
    color: "#EF4444",
    title: "Ghosting Triage",
    featured: true,
    problem: "Paying users going silent. You'll find out from Stripe — usually on a Sunday night when you can't do anything about it.",
    what: "Chomske monitors activity and flags subscribers with zero events in the last 7 days.",
    output: "At-risk list ranked by customer value. Act before the cancellation.",
    Demo: GhostingDemo,
  },
  {
    tag: "Engine 01",
    icon: "⚡",
    color: "#F59E0B",
    title: "Onboarding Momentum",
    problem: "Setup complete. Core feature never used in 48 hours. The window to save them is closing.",
    what: "Chomske flags users who finished onboarding but never took a meaningful action.",
    output: "Warm outreach list. Ready to act while they still want it to work.",
    Demo: OnboardingDemo,
  },
  {
    tag: "Engine 03",
    icon: "🚀",
    color: "#10B981",
    title: "Silent Power Users",
    problem: "Free users maxing out your product every day. You haven't noticed. They haven't upgraded.",
    what: "Chomske surfaces users whose usage consistently outpaces their plan limits.",
    output: "Upsell lead list. These users have already proven value.",
    Demo: PowerUserDemo,
  },
  {
    tag: "Engine 04",
    icon: "🔧",
    color: "#8B5CF6",
    title: "Feature Friction",
    problem: "Users stuck mid-funnel. Not because the product is bad — because no one nudged them.",
    what: "Chomske maps your funnel and pinpoints exactly where users stop progressing.",
    output: "Support alert with drop-off point and a suggested contextual nudge.",
    Demo: FrictionDemo,
  },
];

// ── Featured Hero Card (Ghosting Triage) ─────────────────────────────
function FeaturedEngineCard({ eng, isMobile }) {
  const [ref, inView] = useInView();
  return (
    <div
      ref={ref}
      style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        gap: isMobile ? 24 : 52,
        background: "linear-gradient(135deg, rgba(239,68,68,0.09) 0%, rgba(15,10,20,0.5) 100%)",
        border: "1px solid rgba(239,68,68,0.28)",
        borderRadius: isMobile ? 20 : 28,
        padding: isMobile ? "30px 22px" : "52px 52px",
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(24px)",
        transition: "opacity 0.6s ease, transform 0.6s ease",
        boxShadow: "0 0 80px -24px rgba(239,68,68,0.25)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background glow */}
      <div style={{
        position: "absolute", top: "-30%", left: "-5%",
        width: 500, height: 500,
        background: "radial-gradient(circle, rgba(239,68,68,0.09) 0%, transparent 70%)",
        filter: "blur(60px)", pointerEvents: "none",
      }} />

      {/* Left: text */}
      <div style={{ flex: "0 0 auto", width: isMobile ? "100%" : "46%", position: "relative", zIndex: 1 }}>

        {/* Sunday night badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.32)",
          borderRadius: 50, padding: "5px 14px", marginBottom: 18,
          fontSize: 11, fontWeight: 700, color: "#FCA5A5", letterSpacing: "0.04em",
        }}>
          <span>⚠</span> Most founders feel this every Sunday night
        </div>

        {/* Engine tag */}
        <div style={{ marginBottom: 14 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.22)",
            borderRadius: 50, padding: "4px 12px 4px 9px",
          }}>
            <span style={{ fontSize: 14 }}>{eng.icon}</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "#EF4444", letterSpacing: "0.05em" }}>{eng.tag}</span>
          </div>
        </div>

        {/* Title */}
        <h3 style={{
          fontSize: isMobile ? "1.7rem" : "2.1rem",
          fontWeight: 800, color: "#fff",
          margin: "0 0 18px", lineHeight: 1.15, letterSpacing: "-0.03em",
        }}>{eng.title}</h3>

        {/* Problem */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(239,68,68,0.55)", letterSpacing: "0.08em", marginBottom: 7, textTransform: "uppercase" }}>
            The Problem
          </div>
          <p style={{ margin: 0, fontSize: isMobile ? 14 : 15.5, color: "rgba(255,255,255,0.72)", lineHeight: 1.65 }}>
            {eng.problem}
          </p>
        </div>

        {/* What */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.22)", letterSpacing: "0.08em", marginBottom: 7, textTransform: "uppercase" }}>
            What Chomske Does
          </div>
          <p style={{ margin: 0, fontSize: isMobile ? 13.5 : 14.5, color: "rgba(255,255,255,0.5)", lineHeight: 1.65 }}>
            {eng.what}
          </p>
        </div>

        {/* Output */}
        <div style={{
          padding: "15px 18px",
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12,
        }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: "#EF4444", letterSpacing: "0.08em", marginBottom: 6, textTransform: "uppercase" }}>Output</div>
          <p style={{ margin: 0, fontSize: isMobile ? 13.5 : 14, color: "rgba(255,255,255,0.85)", fontWeight: 600, lineHeight: 1.5 }}>{eng.output}</p>
        </div>
      </div>

      {/* Right: demo */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", position: "relative", zIndex: 1 }}>
        <div style={{
          background: "#080D17", borderRadius: 18,
          padding: isMobile ? "20px 16px" : "26px 24px",
          border: "1px solid rgba(239,68,68,0.2)",
          boxShadow: "0 12px 40px -12px rgba(239,68,68,0.2)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              {["#EF4444","#F59E0B","#10B981"].map((c, i) => (
                <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: c, opacity: 0.7 }} />
              ))}
              <span style={{ fontSize: 10.5, fontWeight: 600, color: "rgba(255,255,255,0.3)", marginLeft: 4 }}>Chomske · Live Feed</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{
                width: 6, height: 6, borderRadius: "50%", background: "#EF4444",
                boxShadow: "0 0 6px rgba(239,68,68,0.6)",
                animation: "pulseDot 2s ease-in-out infinite",
              }} />
              <span style={{ fontSize: 9.5, fontWeight: 700, color: "#FCA5A5", letterSpacing: "0.06em" }}>LIVE</span>
            </div>
          </div>
          {inView && <eng.Demo compact={false} />}
        </div>
      </div>
    </div>
  );
}

// ── Small Engine Card (3-col grid) ────────────────────────────────────
function SmallEngineCard({ eng, i, isMobile }) {
  const [ref, inView] = useInView();
  return (
    <div
      ref={ref}
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: isMobile ? 18 : 20,
        padding: isMobile ? "22px 20px" : "28px 24px",
        display: "flex", flexDirection: "column",
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(20px)",
        transition: "opacity 0.5s ease, transform 0.5s ease, border-color 0.25s ease, box-shadow 0.25s ease",
        transitionDelay: `${i * 0.08}s`,
        cursor: "default",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = `${eng.color}45`;
        e.currentTarget.style.boxShadow = `0 8px 32px -8px ${eng.color}28`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Tag */}
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        background: `${eng.color}14`, border: `1px solid ${eng.color}28`,
        borderRadius: 50, padding: "4px 12px 4px 8px", marginBottom: 14,
        alignSelf: "flex-start",
      }}>
        <span style={{ fontSize: 13 }}>{eng.icon}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: eng.color, letterSpacing: "0.05em" }}>{eng.tag}</span>
      </div>

      {/* Title */}
      <h3 style={{
        fontSize: isMobile ? "1.05rem" : "1.12rem", fontWeight: 700, color: "#fff",
        margin: "0 0 9px", lineHeight: 1.3, letterSpacing: "-0.02em",
      }}>{eng.title}</h3>

      {/* Problem */}
      <p style={{
        margin: "0 0 16px", fontSize: 12.5, color: "rgba(255,255,255,0.48)", lineHeight: 1.65,
      }}>{eng.problem}</p>

      {/* Mini demo */}
      <div style={{
        background: "#0D1117", borderRadius: 12,
        padding: "13px 12px",
        border: `1px solid ${eng.color}18`,
        flex: 1, marginBottom: 14,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: "0.05em" }}>LIVE PREVIEW</span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: eng.color, opacity: 0.85 }} />
            <span style={{ fontSize: 8.5, fontWeight: 700, color: eng.color, letterSpacing: "0.06em" }}>LIVE</span>
          </div>
        </div>
        {inView && <eng.Demo compact={true} />}
      </div>

      {/* Output badge */}
      <div style={{
        padding: "10px 13px",
        background: `${eng.color}0E`, border: `1px solid ${eng.color}22`, borderRadius: 10,
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: eng.color, letterSpacing: "0.08em", marginBottom: 4, textTransform: "uppercase" }}>Output</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: 600, lineHeight: 1.4 }}>{eng.output}</div>
      </div>
    </div>
  );
}

export default function AllFeatures() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width:900px)").matches
  );
  const [headerRef, headerInView] = useInView();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const h = () => setIsMobile(window.matchMedia("(max-width:900px)").matches);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  const featuredEngine = ENGINES.find(e => e.featured);
  const otherEngines = ENGINES.filter(e => !e.featured);

  return (
    <section style={{
      background: "#050A14",
      padding: isMobile ? "72px 20px 80px" : "112px 60px 120px",
      fontFamily: "'Inter', -apple-system, sans-serif",
      position: "relative", overflow: "hidden",
    }}>
      <style>{`
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes pulseDot { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>

      {/* background glows */}
      <div style={{
        position: "absolute", bottom: "-20%", left: "-10%",
        width: 600, height: 600,
        background: "radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)",
        filter: "blur(80px)", pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", top: "30%", right: "-10%",
        width: 400, height: 400,
        background: "radial-gradient(circle, rgba(16,185,129,0.05) 0%, transparent 70%)",
        filter: "blur(60px)", pointerEvents: "none",
      }} />

      <div style={{ maxWidth: 1040, margin: "0 auto", position: "relative", zIndex: 1 }}>

        {/* header */}
        <div
          ref={headerRef}
          style={{
            textAlign: isMobile ? "left" : "center",
            marginBottom: isMobile ? 48 : 64,
            opacity: headerInView ? 1 : 0,
            transform: headerInView ? "translateY(0)" : "translateY(20px)",
            transition: "opacity 0.6s ease, transform 0.6s ease",
          }}
        >
          <p style={{
            margin: "0 0 12px",
            fontSize: isMobile ? 12 : 13,
            fontWeight: 600, color: "#A5B4FC",
            letterSpacing: "0.05em", textTransform: "uppercase",
          }}>4 Engines</p>
          <h2 style={{
            fontSize: isMobile ? "clamp(1.7rem, 7vw, 2.3rem)" : "clamp(2.2rem, 3.5vw, 3rem)",
            fontWeight: 800, color: "#fff", lineHeight: 1.18,
            letterSpacing: "-0.03em", margin: "0 0 14px",
          }}>
            One engine per problem.
            <span style={{ color: "#818CF8" }}> Each delivers a list.</span>
          </h2>
          <p style={{
            fontSize: isMobile ? "0.88rem" : "1rem",
            color: "rgba(255,255,255,0.45)", lineHeight: 1.65,
            maxWidth: 480, margin: "0 auto",
          }}>
            Chomske reads your data, finds the signal, and hands you those users.
            Not a dashboard to interpret.
          </p>
        </div>

        {/* Featured engine: Ghosting Triage */}
        <FeaturedEngineCard eng={featuredEngine} isMobile={isMobile} />

        {/* Divider with label */}
        <div style={{
          display: "flex", alignItems: "center", gap: 16,
          margin: isMobile ? "28px 0 20px" : "32px 0 24px",
        }}>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
          <span style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
            3 More Engines
          </span>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
        </div>

        {/* Other 3 engines: 3-col grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
          gap: isMobile ? 16 : 20,
        }}>
          {otherEngines.map((eng, i) => (
            <SmallEngineCard key={i} eng={eng} i={i} isMobile={isMobile} />
          ))}
        </div>

        {/* bottom note */}
        <div style={{
          marginTop: isMobile ? 44 : 56,
          textAlign: "center",
          padding: isMobile ? "24px 20px" : "32px 40px",
          background: "rgba(99,102,241,0.06)",
          border: "1px solid rgba(99,102,241,0.15)",
          borderRadius: isMobile ? 16 : 20,
        }}>
          <p style={{
            margin: "0 0 6px", fontSize: isMobile ? 14 : 15,
            fontWeight: 700, color: "rgba(255,255,255,0.9)",
          }}>
            All four engines run every morning on your live data.
          </p>
          <p style={{
            margin: 0, fontSize: isMobile ? 12.5 : 13.5,
            color: "rgba(255,255,255,0.4)", lineHeight: 1.6,
          }}>
            No dashboards to check. No queries to write. One action list,
            ready when you start your day.
          </p>
        </div>

      </div>
    </section>
  );
}

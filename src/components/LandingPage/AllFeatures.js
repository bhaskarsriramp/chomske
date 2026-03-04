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

function OnboardingDemo({ isMobile }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep(p => (p + 1) % 5), 1600);
    return () => clearInterval(t);
  }, []);

  const users = [
    { name: "Arjun M.", days: "Day 3", status: "Setup ✓", stuck: "Never opened a core feature so far since.." },
    { name: "Priya S.", days: "Day 5", status: "Setup ✓", stuck: "Invited team, but workspace is never activated." },
    { name: "Rahul K.", days: "Day 2", status: "Setup ✓", stuck: "Profiling is done, but zero actions.." },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {users.map((u, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "9px 12px",
          background: step > i ? "rgba(245,158,11,0.08)" : "rgba(255,255,255,0.04)",
          borderRadius: 9,
          borderLeft: `3px solid ${step > i ? "#F59E0B" : "transparent"}`,
          transition: "all 0.4s ease",
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
            background: "rgba(245,158,11,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, color: "#F59E0B",
          }}>{u.name[0]}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{u.name}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{u.stuck}</div>
          </div>
          <div style={{
            fontSize: 8, fontWeight: 700,
            color: step > i ? "#FCD34D" : "rgba(255,255,255,0.25)",
            background: step > i ? "rgba(245,158,11,0.15)" : "transparent",
            padding: "2px 7px", borderRadius: 4,
            transition: "all 0.4s ease",
          }}>{step > i ? "Contact" : u.days}</div>
        </div>
      ))}
      <div style={{
        padding: "8px 12px",
        background: "rgba(245,158,11,0.12)",
        border: "1px solid rgba(245,158,11,0.25)",
        borderRadius: 8, fontSize: 11, fontWeight: 600, color: "#FCD34D",
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

function GhostingDemo({ isMobile }) {
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
          padding: "9px 12px",
          background: "rgba(239,68,68,0.07)",
          borderRadius: 9,
          borderLeft: "3px solid #EF4444",
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
            background: "rgba(239,68,68,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, color: "#EF4444",
          }}>{u.name[0]}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{u.name}</div>
            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.4)" }}>{u.plan} plan</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#FCA5A5" }}>{u.days}d</div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>silent</div>
          </div>
        </div>
      ))}
      <div style={{
        padding: "8px 12px", borderRadius: 8,
        background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)",
        fontSize: 11, fontWeight: 600, color: "#FCA5A5",
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <span>👻</span> 3 at-risk users · Act before Stripe cancels
      </div>
    </div>
  );
}

function PowerUserDemo({ isMobile }) {
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
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {users.map((u, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "9px 12px",
          background: highlight === i ? "rgba(16,185,129,0.1)" : "rgba(255,255,255,0.04)",
          borderRadius: 9,
          borderLeft: `3px solid ${highlight === i ? "#10B981" : "transparent"}`,
          transition: "all 0.4s ease",
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
            background: "rgba(16,185,129,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, color: "#10B981",
          }}>{u.name[0]}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{u.name}</div>
            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.4)" }}>{u.actions} actions · {u.limit}</div>
          </div>
          <div style={{
            fontSize: 10, fontWeight: 700,
            color: "#34D399", background: "rgba(16,185,129,0.15)",
            padding: "2px 7px", borderRadius: 4,
          }}>FREE → PRO?</div>
        </div>
      ))}
      <div style={{
        padding: "8px 12px", borderRadius: 8,
        background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)",
        fontSize: 11, fontWeight: 600, color: "#34D399",
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <span>🚀</span> Upsell list ready · Already proven value
      </div>
    </div>
  );
}

function FrictionDemo({ isMobile }) {
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
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: "0.06em", marginBottom: 2 }}>
        CONVERSION FUNNEL · WHERE USERS STALL
      </div>
      {funnelSteps.map((s, i) => (
        <div key={i}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{s.label}</span>
            <span style={{
              fontSize: 11, fontWeight: 700,
              color: i === 1 && frame > 2 ? "#8B5CF6" : "rgba(255,255,255,0.5)",
              transition: "color 0.4s ease",
            }}>{s.count}</span>
          </div>
          <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
            <div style={{
              height: "100%", borderRadius: 3,
              width: `${s.pct}%`,
              background: i === 1 && frame > 2
                ? "linear-gradient(90deg, #8B5CF6, #A78BFA)"
                : `rgba(139,92,246,${0.2 + i * 0.1})`,
              transition: "background 0.4s ease",
            }} />
          </div>
          <div style={{
            fontSize: 10, color: "#A78BFA", marginTop: 3,
            opacity: i === 1 && frame > 2 ? 1 : 0,
            transition: "opacity 0.3s ease",
          }}>
            ↑ 31 users stuck here · 3+ days
          </div>
        </div>
      ))}
      <div style={{
        padding: "8px 12px", borderRadius: 8,
        background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)",
        fontSize: 11, fontWeight: 600, color: "#A78BFA",
        display: "flex", alignItems: "center", gap: 6,
        opacity: frame > 4 ? 1 : 0,
        transition: "opacity 0.4s ease",
        pointerEvents: "none",
      }}>
        <span>🔧</span> Support alert · Send contextual nudge now
      </div>
    </div>
  );
}

// ── Feature Engine Card ───────────────────────────────────────────────
const ENGINES = [
  {
    tag: "Engine 01",
    icon: "⚡",
    color: "#F59E0B",
    title: "Onboarding Momentum",
    problem: "Setup complete core feature never used in 48 hours.",
    what: "Chomske flags users who finished onboarding but never took a meaningful action.",
    output: "Warm outreach list. Ready to act while they still want it to work.",
    Demo: OnboardingDemo,
  },
  {
    tag: "Engine 02",
    icon: "👻",
    color: "#EF4444",
    title: "Ghosting Triage",
    problem: "Paying users going silent. You'll find out from Stripe.",
    what: "Chomske monitors activity and flags subscribers with zero events in the last 7 days.",
    output: "At-risk list ranked by customer value. Act before the cancellation.",
    Demo: GhostingDemo,
  },
  {
    tag: "Engine 03",
    icon: "🚀",
    color: "#10B981",
    title: "Silent Power Users",
    problem: "Free users maxing out your product, you haven't noticed.",
    what: "Chomske surfaces users whose usage outpaces their plan limits.",
    output: "Upsell lead list. These users have already proven value.",
    Demo: PowerUserDemo,
  },
  {
    tag: "Engine 04",
    icon: "🔧",
    color: "#8B5CF6",
    title: "Feature Friction",
    problem: "Users stuck on one feature, not because the product is bad.",
    what: "Chomske maps your funnel and pinpoints exactly where users stop progressing.",
    output: "Support alert with drop-off point and a suggested contextual nudge.",
    Demo: FrictionDemo,
  },
];

// ── Engine card (needs own component so it can call useInView legally) ──
function EngineCard({ eng, i, isMobile }) {
  const [ref, inView] = useInView();
  const isEven = i % 2 === 0;
  return (
    <div
      ref={ref}
      style={{
        display: "flex",
        flexDirection: isMobile ? "column" : isEven ? "row" : "row-reverse",
        gap: isMobile ? 20 : 36,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: isMobile ? 20 : 24,
        padding: isMobile ? "24px 20px" : "36px 36px",
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(24px)",
        transition: "opacity 0.6s ease, transform 0.6s ease",
        transitionDelay: `${i * 0.05}s`,
      }}
    >
      {/* left: text */}
      <div style={{ flex: "0 0 auto", width: isMobile ? "100%" : "42%" }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: `${eng.color}15`, border: `1px solid ${eng.color}30`,
          borderRadius: 50, padding: "4px 12px 4px 10px", marginBottom: 14,
        }}>
          <span style={{ fontSize: 13 }}>{eng.icon}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: eng.color, letterSpacing: "0.05em" }}>{eng.tag}</span>
        </div>
        <h3 style={{
          fontSize: isMobile ? "1.1rem" : "1.3rem", fontWeight: 700, color: "#fff",
          margin: "0 0 12px", lineHeight: 1.3, letterSpacing: "-0.02em",
        }}>{eng.title}</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: "0.07em", marginBottom: 5 }}>THE PROBLEM</div>
            <p style={{ margin: 0, fontSize: isMobile ? 13 : 13.5, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>{eng.problem}</p>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: "0.07em", marginBottom: 5 }}>WHAT CHOMSKE DOES</div>
            <p style={{ margin: 0, fontSize: isMobile ? 13 : 13.5, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>{eng.what}</p>
          </div>
          <div style={{
            padding: "10px 14px",
            background: `${eng.color}10`, border: `1px solid ${eng.color}25`, borderRadius: 10,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: eng.color, letterSpacing: "0.06em", marginBottom: 4 }}>OUTPUT</div>
            <p style={{ margin: 0, fontSize: isMobile ? 12.5 : 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>{eng.output}</p>
          </div>
        </div>
      </div>
      {/* right: demo */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{
          background: "#0D1117", borderRadius: 14,
          padding: isMobile ? "16px 14px" : "20px 18px",
          border: `1px solid ${eng.color}20`,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {/* <span style={{ fontSize: 14 }}>{eng.icon}</span> */}
              <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>{eng.title}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: eng.color }} />
              <span style={{ fontSize: 9, fontWeight: 700, color: eng.color, letterSpacing: "0.06em" }}>LIVE</span>
            </div>
          </div>
          {inView && <eng.Demo isMobile={isMobile} />}
        </div>
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

  return (
    <section style={{
      background: "#050A14",
      padding: isMobile ? "72px 20px 80px" : "112px 60px 120px",
      fontFamily: "'Inter', -apple-system, sans-serif",
      position: "relative", overflow: "hidden",
    }}>
      <style>{`
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
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
            marginBottom: isMobile ? 48 : 72,
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

        {/* engine cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 20 : 28 }}>
          {ENGINES.map((eng, i) => (
            <EngineCard key={i} eng={eng} i={i} isMobile={isMobile} />
          ))}
        </div>

        {/* bottom note */}
        <div style={{
          marginTop: isMobile ? 44 : 64,
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

import { useState, useEffect, useRef } from "react";

function useInView(threshold = 0.12) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { threshold });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView];
}

// ── Step 1: Connect card ──────────────────────────────────────────────
function ConnectCard({ isMobile }) {
  const [typed, setTyped] = useState("");
  const uri = "mongodb+srv://readonly:***@cluster0.abc.mongodb.net/prod";
  const [done, setDone] = useState(false);

  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      i++;
      setTyped(uri.slice(0, i));
      if (i >= uri.length) { clearInterval(t); setDone(true); }
    }, 38);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{
      background: "#111827",
      borderRadius: 16,
      padding: isMobile ? "18px 16px" : "22px 20px",
      border: "1px solid rgba(255,255,255,0.08)",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: "0.07em", marginBottom: 10 }}>
        MONGODB CONNECTION
      </div>
      <div style={{
        background: "#0D1117",
        borderRadius: 10,
        padding: "12px 14px",
        border: "1px solid rgba(255,255,255,0.06)",
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: isMobile ? 11 : 12,
        color: "#A5B4FC",
        minHeight: 40,
        display: "flex", alignItems: "center",
      }}>
        <span>{typed}</span>
        <span style={{ display: "inline-block", width: 2, height: 14, background: "#6366F1", marginLeft: 1, animation: "blink 1s step-end infinite" }} />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)",
          borderRadius: 6, padding: "4px 10px",
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981" }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "#6EE7B7" }}>Read-Only Access</span>
        </div>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
          borderRadius: 6, padding: "4px 10px",
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#A5B4FC" }}>We never write to your DB</span>
        </div>
        {done && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)",
            borderRadius: 6, padding: "4px 10px",
            animation: "fadeIn 0.4s ease",
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#6EE7B7" }}>✓ Connected in &lt;60s</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step 2: Discover card ──────────────────────────────────────────────
const SCHEMA_ROWS = [
  { collection: "users", role: "Users / Accounts", color: "#6366F1", delay: 0 },
  { collection: "subscriptions", role: "Subscriptions / Plans", color: "#F59E0B", delay: 200 },
  { collection: "events", role: "Activity / Events", color: "#10B981", delay: 400 },
  { collection: "payments", role: "Payments", color: "#EF4444", delay: 600 },
];

function DiscoverCard({ isMobile }) {
  const [visible, setVisible] = useState([false, false, false, false]);
  useEffect(() => {
    SCHEMA_ROWS.forEach((r, i) => {
      setTimeout(() => setVisible(prev => { const n = [...prev]; n[i] = true; return n; }), r.delay + 300);
    });
  }, []);

  return (
    <div style={{
      background: "#111827",
      borderRadius: 16,
      padding: isMobile ? "18px 16px" : "22px 20px",
      border: "1px solid rgba(255,255,255,0.08)",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: "0.07em", marginBottom: 12 }}>
        SCHEMA FINGERPRINT · AI MAPPING
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {SCHEMA_ROWS.map((r, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 10,
            opacity: visible[i] ? 1 : 0,
            transform: visible[i] ? "translateX(0)" : "translateX(-12px)",
            transition: "opacity 0.4s ease, transform 0.4s ease",
          }}>
            <code style={{
              fontSize: isMobile ? 10.5 : 11.5,
              color: "rgba(167,243,208,0.8)",
              fontFamily: "monospace",
              background: "rgba(255,255,255,0.04)",
              padding: "3px 8px", borderRadius: 4,
              flexShrink: 0, minWidth: isMobile ? 80 : 100,
            }}>{r.collection}</code>
            <div style={{ flex: 1, height: 1, background: `${r.color}40` }} />
            <div style={{
              fontSize: 10, fontWeight: 700,
              color: r.color,
              background: `${r.color}15`,
              border: `1px solid ${r.color}30`,
              padding: "3px 8px", borderRadius: 4,
              whiteSpace: "nowrap",
            }}>{r.role}</div>
          </div>
        ))}
      </div>
      <div style={{
        marginTop: 12, fontSize: 11, color: "rgba(255,255,255,0.35)",
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#6366F1", animation: "blink 1.4s ease-in-out infinite" }} />
        Confidence: High · No manual config required
      </div>
    </div>
  );
}

// ── Step 3: Act card ──────────────────────────────────────────────────
const BRIEFING_ITEMS = [
  { color: "#EF4444", tag: "CHURN RISK", name: "Neha T.", plan: "Creator", note: "18 days silent.", action: "Reach out today" },
  { color: "#10B981", tag: "UPSELL", name: "Divya R.", plan: "Free → Pro?", note: "142 actions this month.", action: "Upgrade conversation" },
  { color: "#F59E0B", tag: "STUCK", name: "Arjun M.", plan: "Pro", note: "Setup complete.", action: "Activation nudge" },
];

function ActCard({ isMobile }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setShown(p => Math.min(p + 1, BRIEFING_ITEMS.length)), 700);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{
      background: "#111827",
      borderRadius: 16,
      padding: isMobile ? "18px 16px" : "22px 20px",
      border: "1px solid rgba(255,255,255,0.08)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: "0.07em" }}>
          TODAY'S ACTION LIST
        </div>
        <div style={{ fontSize: 10, color: "#10B981", fontWeight: 600 }}>
          {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {BRIEFING_ITEMS.slice(0, shown).map((item, i) => (
          <div key={i} style={{
            display: "flex", gap: 10, alignItems: "flex-start",
            background: "rgba(255,255,255,0.04)",
            borderRadius: 10, padding: "10px 12px",
            borderLeft: `3px solid ${item.color}`,
            animation: "slideIn 0.35s ease",
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, color: item.color,
                  background: `${item.color}18`, padding: "1px 6px", borderRadius: 3,
                  letterSpacing: "0.04em",
                }}>{item.tag}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{item.name}</span>
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{item.note}</div>
            </div>
            <div style={{
              fontSize: 10, fontWeight: 600, color: item.color,
              whiteSpace: "nowrap", marginTop: 2,
            }}>→ {item.action}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Step item (needs own component so it can call useInView legally) ──
function StepItem({ step, i, isMobile }) {
  const [ref, inView] = useInView();
  const isEven = i % 2 === 0;
  return (
    <div
      ref={ref}
      style={{
        display: "flex",
        flexDirection: isMobile ? "column" : isEven ? "row" : "row-reverse",
        alignItems: "center",
        gap: isMobile ? 28 : 56,
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(28px)",
        transition: "opacity 0.65s ease, transform 0.65s ease",
      }}
    >
      <div style={{ flex: "0 0 auto", width: isMobile ? "100%" : "38%" }}>
        <div style={{
          fontSize: isMobile ? 48 : 64, fontWeight: 900,
          color: `${step.color}20`, lineHeight: 1,
          letterSpacing: "-0.04em", marginBottom: 6,
          fontVariantNumeric: "tabular-nums",
        }}>{step.number}</div>
        <h3 style={{
          fontSize: isMobile ? "1.25rem" : "1.5rem",
          fontWeight: 700, color: "#fff",
          margin: "0 0 12px", lineHeight: 1.3, letterSpacing: "-0.02em",
        }}>{step.title}</h3>
        <p style={{
          fontSize: isMobile ? 13.5 : 15,
          color: "rgba(255,255,255,0.55)",
          lineHeight: 1.7, margin: 0,
        }}>{step.sub}</p>
        <div style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 0" }}>
          <div style={{ width: 28, height: 2, background: `${step.color}60`, borderRadius: 2 }} />
          <div style={{ width: 8, height: 2, background: `${step.color}30`, borderRadius: 2 }} />
        </div>
      </div>
      <div style={{ flex: 1, width: isMobile ? "100%" : "auto" }}>
        {inView && <step.Card isMobile={isMobile} />}
        {!inView && (
          <div style={{
            background: "#111827", borderRadius: 16, padding: "22px 20px",
            border: "1px solid rgba(255,255,255,0.08)", minHeight: 160,
          }} />
        )}
      </div>
    </div>
  );
}

// ── Use case card (needs own component so it can call useInView legally) ──
function UseCaseCard({ uc, i, isMobile }) {
  const [ref, inView] = useInView();
  return (
    <div
      ref={ref}
      style={{
        background: "#fff",
        border: "1.5px solid #E2E8F0",
        borderRadius: isMobile ? 18 : 22,
        padding: isMobile ? "24px 22px" : "32px 28px",
        boxShadow: "0 2px 16px -4px rgba(0,0,0,0.06)",
        transition: "box-shadow 0.22s ease, transform 0.22s ease, border-color 0.22s ease, opacity 0.6s ease, translate 0.6s ease",
        opacity: inView ? 1 : 0,
        translate: inView ? "0 0" : "0 24px",
        transitionDelay: `${i * 0.08}s`,
        cursor: "default",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = `0 12px 36px -8px ${uc.color}30`;
        e.currentTarget.style.borderColor = `${uc.color}50`;
        e.currentTarget.style.transform = "translateY(-4px)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = "0 2px 16px -4px rgba(0,0,0,0.06)";
        e.currentTarget.style.borderColor = "#E2E8F0";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: `${uc.color}12`, border: `1px solid ${uc.color}30`,
          borderRadius: 50, padding: "4px 12px 4px 8px",
        }}>
          <span style={{ fontSize: 14 }}>{uc.icon}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: uc.color, letterSpacing: "0.04em" }}>{uc.tag}</span>
        </div>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: `${uc.color}10`, border: `1px solid ${uc.color}25`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, flexShrink: 0,
        }}>{uc.icon}</div>
      </div>
      <h3 style={{ fontSize: isMobile ? "1rem" : "1.1rem", fontWeight: 700, color: "#0F172A", margin: "0 0 10px", lineHeight: 1.35 }}>
        {uc.headline}
      </h3>
      <p style={{ fontSize: isMobile ? 13 : 14, color: "#64748B", margin: "0 0 18px", lineHeight: 1.65 }}>
        {uc.body}
      </p>
      <div style={{ background: "#F8FAFC", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.06em", marginBottom: 4 }}>
          DATA TRIGGER
        </div>
        <code style={{
          fontSize: isMobile ? 10.5 : 11, color: "#374151",
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          display: "block", lineHeight: 1.6,
        }}>{uc.trigger}</code>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: uc.color }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: uc.color }}>{uc.output}</span>
        </div>
        <span style={{ fontSize: 12, color: "#94A3B8" }}>Ready every morning →</span>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────
const STEPS = [
  {
    number: "01",
    title: "Connect your MongoDB",
    sub: "Paste your URI. Read-only credentials recommended. We analyze. Never modify your data.",
    color: "#6366F1",
    Card: ConnectCard,
  },
  {
    number: "02",
    title: "Chomske maps your business",
    sub: "Schema fingerprinting automatically identifies your users, subscriptions, events, and payments. No manual config required.",
    color: "#F59E0B",
    Card: DiscoverCard,
  },
  {
    number: "03",
    title: "Get your daily action list",
    sub: "Every morning: who to reach out to, who's ready to upgrade, who's stuck, ranked by urgency with context.",
    color: "#10B981",
    Card: ActCard,
  },
];

export default function ThreeBlockPage() {
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
    <>
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes slideIn { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:translateX(0)} }
        @keyframes stepFadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* ── HOW IT WORKS ── */}
      <section style={{
        background: "#050A14",
        padding: isMobile ? "72px 20px 80px" : "120px 60px 128px",
        fontFamily: "'Inter', -apple-system, sans-serif",
        overflow: "hidden",
        position: "relative",
      }}>
        {/* top glow */}
        <div style={{
          position: "absolute", top: "-10%", left: "50%", transform: "translateX(-50%)",
          width: 800, height: 500,
          background: "radial-gradient(ellipse, rgba(99,102,241,0.08) 0%, transparent 70%)",
          filter: "blur(80px)", pointerEvents: "none",
        }} />

        <div style={{ maxWidth: 1040, margin: "0 auto", position: "relative", zIndex: 1 }}>

          {/* header */}
          <div
            ref={headerRef}
            style={{
              textAlign: isMobile ? "left" : "center",
              marginBottom: isMobile ? 48 : 80,
              opacity: headerInView ? 1 : 0,
              transform: headerInView ? "translateY(0)" : "translateY(20px)",
              transition: "opacity 0.6s ease, transform 0.6s ease",
            }}
          >
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)",
              borderRadius: 50, padding: "5px 16px", marginBottom: 20,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#6366F1", animation: "blink 2s ease-in-out infinite" }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: "#A5B4FC", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                How It Works
              </span>
            </div>
            <h2 style={{
              fontSize: isMobile ? "clamp(1.7rem, 7vw, 2.3rem)" : "clamp(2.2rem, 3.5vw, 3rem)",
              fontWeight: 800, color: "#fff", lineHeight: 1.18,
              letterSpacing: "-0.03em", margin: "0 0 16px",
            }}>
              From MongoDB to action list
              <span style={{ color: "#818CF8" }}> in 60 seconds.</span>
            </h2>
            <p style={{
              fontSize: isMobile ? "0.9rem" : "1.05rem",
              color: "rgba(255,255,255,0.55)", lineHeight: 1.7,
              maxWidth: 520, margin: "0 auto",
            }}>
              No data warehouse. No BI tool. No SQL. Just connect and get your
              daily briefing every morning.
            </p>
          </div>

          {/* 3 steps */}
          <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 48 : 72 }}>
            {STEPS.map((step, i) => (
              <StepItem key={i} step={step} i={i} isMobile={isMobile} />
            ))}
          </div>
        </div>
      </section>

      {/* ── 4 USE CASES PREVIEW ── */}
      <UseCasesSection isMobile={isMobile} />
    </>
  );
}

// ── 4 Use Cases Preview ───────────────────────────────────────────────
const USE_CASES = [
  {
    icon: "⚡",
    tag: "Onboarding Gap",
    color: "#F59E0B",
    headline: "Catch users before they ghost",
    body: "Setup complete but core feature never used after 48 hours. This is the moment, they still want to make it work.",
    trigger: "onboarding_completed: true  ·  last_core_action: null",
    output: "Warm Outreach List",
  },
  {
    icon: "👻",
    tag: "Ghosting Triage",
    color: "#EF4444",
    headline: "Find paying users going silent",
    body: "Subscription active but zero activity for 7+ days. Your Sunday-night anxiety solved before Monday.",
    trigger: "subscription_active: true  ·  activity_last_7d: 0",
    output: "At-Risk Priority List",
  },
  {
    icon: "🚀",
    tag: "Silent Power Users",
    color: "#10B981",
    headline: "Convert your most engaged users",
    body: "Free-tier users crossing 100+ actions. They've already proven value, they just need the right conversation.",
    trigger: "actions_count: >100  ·  plan: free",
    output: "Upsell Lead List",
  },
  {
    icon: "🔧",
    tag: "Feature Friction",
    color: "#8B5CF6",
    headline: "Find where users get stuck",
    body: "Conversations created but no messages sent for 3 days. One contextual nudge prevents churn at the feature level.",
    trigger: "conversation_created: true  ·  messages_sent: 0  ·  stalled: 3d",
    output: "Support Alert",
  },
];

function UseCasesSection({ isMobile }) {
  const [headerRef, inView] = useInView();

  return (
    <section style={{
      background: "#FAFAFA",
      padding: isMobile ? "72px 20px 80px" : "112px 60px 120px",
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>

        <div
          ref={headerRef}
          style={{
            textAlign: isMobile ? "left" : "center",
            marginBottom: isMobile ? 44 : 64,
            opacity: inView ? 1 : 0,
            transform: inView ? "translateY(0)" : "translateY(20px)",
            transition: "opacity 0.6s ease, transform 0.6s ease",
          }}
        >
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "#EEF2FF", border: "1px solid #C7D2FE",
            borderRadius: 50, padding: "5px 16px", marginBottom: 20,
          }}>
            <span style={{ fontSize: 12 }}>📊</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#4338CA", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              4 Operational Engines
            </span>
          </div>
          <h2 style={{
            fontSize: isMobile ? "clamp(1.7rem, 7vw, 2.3rem)" : "clamp(2.2rem, 3.5vw, 3rem)",
            fontWeight: 800, color: "#0F172A", lineHeight: 1.18,
            letterSpacing: "-0.03em", margin: "0 0 16px",
          }}>
            Four problems every SaaS founder
            <span style={{ color: "#6366F1" }}> faces every week.</span>
          </h2>
          <p style={{
            fontSize: isMobile ? "0.9rem" : "1.05rem", color: "#64748B",
            lineHeight: 1.7, maxWidth: 540, margin: "0 auto",
          }}>
            Chomske ships an engine for each one. Not a chart. A list of
            specific users and exactly what to do.
          </p>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
          gap: isMobile ? 14 : 20,
        }}>
          {USE_CASES.map((uc, i) => (
            <UseCaseCard key={i} uc={uc} i={i} isMobile={isMobile} />
          ))}
        </div>
      </div>
    </section>
  );
}

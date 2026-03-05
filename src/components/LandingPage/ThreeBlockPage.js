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
const DB_TYPES = [
  { id: "mongodb",    label: "MongoDB",    color: "#10B981", uri: "mongodb+srv://readonly:***@cluster0.abc.mongodb.net/prod" },
  { id: "postgresql", label: "PostgreSQL", color: "#6366F1", uri: "postgresql://readonly:***@db.example.com:5432/prod" },
  { id: "supabase",   label: "Supabase",   color: "#3ECF8E", uri: "postgresql://readonly:***@db.supabase.co:5432/postgres" },
];

function ConnectCard({ isMobile }) {
  const [selectedDb, setSelectedDb] = useState(0);
  const [typed, setTyped] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    setTyped("");
    setDone(false);
    let i = 0;
    const uri = DB_TYPES[selectedDb].uri;
    const t = setInterval(() => {
      i++;
      setTyped(uri.slice(0, i));
      if (i >= uri.length) { clearInterval(t); setDone(true); }
    }, 32);
    return () => clearInterval(t);
  }, [selectedDb]);

  const db = DB_TYPES[selectedDb];

  return (
    <div style={{
      background: "#111827",
      borderRadius: 16,
      padding: isMobile ? "18px 16px" : "22px 20px",
      border: "1px solid rgba(255,255,255,0.08)",
    }}>
      {/* DB Type Selector */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {DB_TYPES.map((d, i) => (
          <button
            key={d.id}
            onClick={() => setSelectedDb(i)}
            style={{
              fontSize: 11, fontWeight: 600, padding: "4px 10px",
              borderRadius: 6, border: "1px solid",
              cursor: "pointer", fontFamily: "'Inter', sans-serif",
              background: selectedDb === i ? `${d.color}20` : "transparent",
              borderColor: selectedDb === i ? `${d.color}60` : "rgba(255,255,255,0.1)",
              color: selectedDb === i ? d.color : "rgba(255,255,255,0.35)",
              transition: "all 0.2s ease",
            }}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: "0.07em", marginBottom: 10 }}>
        DATABASE CONNECTION
      </div>
      <div style={{
        background: "#0D1117",
        borderRadius: 10,
        padding: "12px 14px",
        border: `1px solid ${db.color}25`,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: isMobile ? 11 : 12,
        color: "#A5B4FC",
        minHeight: 40,
        display: "flex", alignItems: "center",
      }}>
        <span>{typed}</span>
        <span style={{ display: "inline-block", width: 2, height: 14, background: db.color, marginLeft: 1, animation: "blink 1s step-end infinite" }} />
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

// ── Use Case Visual Components ────────────────────────────────────────
function OnboardingVisual({ inView }) {
  const [revealed, setRevealed] = useState(-1);
  useEffect(() => {
    if (!inView) return;
    setRevealed(-1);
    let i = -1;
    const t = setInterval(() => { i++; setRevealed(i); if (i >= 3) clearInterval(t); }, 520);
    return () => clearInterval(t);
  }, [inView]);

  const steps = [
    { label: "Account created", done: true },
    { label: "Profile setup", done: true },
    { label: "Team added", done: true },
    { label: "Core feature", done: false },
  ];
  return (
    <div style={{ padding: "2px 0" }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: "flex", gap: 0, opacity: revealed >= i ? 1 : 0.15, transition: "opacity 0.4s ease" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 22, flexShrink: 0 }}>
            <div style={{
              width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
              background: s.done ? "rgba(245,158,11,0.18)" : "rgba(239,68,68,0.15)",
              border: `2px solid ${s.done ? "#F59E0B" : "#EF4444"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 8, fontWeight: 900, color: s.done ? "#F59E0B" : "#EF4444",
              animation: !s.done && revealed >= i ? "pulseGlow 1.8s ease-in-out infinite" : "none",
            }}>{s.done ? "✓" : "!"}</div>
            {i < steps.length - 1 && (
              <div style={{
                width: 2, height: 18,
                background: revealed > i ? "rgba(245,158,11,0.35)" : "rgba(255,255,255,0.06)",
                transition: "background 0.5s ease",
              }} />
            )}
          </div>
          <div style={{ flex: 1, paddingLeft: 10, display: "flex", alignItems: "center", height: 18, marginBottom: i < steps.length - 1 ? 18 : 0 }}>
            <span style={{
              fontSize: 11.5, fontWeight: s.done ? 500 : 700,
              color: !s.done && revealed >= i ? "#FCA5A5" : "rgba(255,255,255,0.6)",
            }}>{s.label}</span>
            {!s.done && revealed >= i && (
              <span style={{
                marginLeft: 8, fontSize: 9, fontWeight: 700, color: "#FCA5A5",
                background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 4, padding: "1px 6px", animation: "fadeIn 0.3s ease",
              }}>Never opened</span>
            )}
          </div>
        </div>
      ))}
      {revealed >= 3 && (
        <div style={{
          marginTop: 14, padding: "8px 12px",
          background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.22)",
          borderRadius: 8, display: "flex", alignItems: "center", gap: 7,
          animation: "fadeIn 0.4s ease",
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#FCD34D" }}>⏱ 48h window — act while they still want it to work</span>
        </div>
      )}
    </div>
  );
}

function GhostingVisual({ inView }) {
  const [daysCount, setDaysCount] = useState(0);
  useEffect(() => {
    if (!inView) return;
    setDaysCount(0);
    let n = 0;
    const t = setInterval(() => { n = Math.min(n + 1, 18); setDaysCount(n); if (n >= 18) clearInterval(t); }, 130);
    return () => clearInterval(t);
  }, [inView]);

  const bars = [82, 71, 90, 65, 48, 33, 12, 4, 0, 0, 0, 0, 0, 0];
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.22)", letterSpacing: "0.07em", marginBottom: 8 }}>
        ACTIVITY · LAST 14 DAYS
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 42, marginBottom: 12, position: "relative" }}>
        {bars.map((val, i) => (
          <div key={i} style={{
            flex: 1,
            height: val > 0 ? `${val}%` : "3px",
            background: val > 0 ? `rgba(239,68,68,${0.28 + (val / 100) * 0.45})` : "rgba(255,255,255,0.06)",
            borderRadius: "2px 2px 0 0",
            transform: inView ? "scaleY(1)" : "scaleY(0)",
            transformOrigin: "bottom",
            transition: `transform 0.5s ease ${i * 0.04}s`,
          }} />
        ))}
        <div style={{
          position: "absolute", right: 0, top: 0,
          width: `${(7 / 14) * 100}%`, height: "100%",
          background: "rgba(239,68,68,0.05)", borderLeft: "1px dashed rgba(239,68,68,0.3)",
          opacity: inView ? 1 : 0, transition: "opacity 0.4s ease 0.6s",
        }}>
          <span style={{ position: "absolute", top: 2, left: 6, fontSize: 8, fontWeight: 700, color: "rgba(239,68,68,0.45)", textTransform: "uppercase" }}>silent</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: "rgba(239,68,68,0.08)", borderRadius: 9, borderLeft: "3px solid #EF4444" }}>
        <div style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(239,68,68,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#EF4444" }}>N</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>Neha T. · Creator plan</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>Subscription active</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#FCA5A5" }}>{daysCount}d</div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>silent</div>
        </div>
      </div>
    </div>
  );
}

function PowerUserVisual({ inView }) {
  const [count, setCount] = useState(0);
  const FREE_LIMIT = 80;
  const MAX = 142;
  useEffect(() => {
    if (!inView) return;
    setCount(0);
    let n = 0;
    const t = setInterval(() => { n = Math.min(n + 4, MAX); setCount(n); if (n >= MAX) clearInterval(t); }, 28);
    return () => clearInterval(t);
  }, [inView]);

  const pct = (count / MAX) * 100;
  const limitPct = (FREE_LIMIT / MAX) * 100;
  const overLimit = count > FREE_LIMIT;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.25)", letterSpacing: "0.07em" }}>ACTIONS THIS MONTH</span>
        <span style={{ fontSize: 26, fontWeight: 900, lineHeight: 1, color: overLimit ? "#34D399" : "rgba(255,255,255,0.65)", transition: "color 0.4s ease" }}>{count}</span>
      </div>
      <div style={{ position: "relative", height: 10, background: "rgba(255,255,255,0.06)", borderRadius: 5, marginBottom: 6 }}>
        <div style={{
          height: "100%", borderRadius: 5, width: `${pct}%`,
          background: overLimit ? "linear-gradient(90deg, rgba(16,185,129,0.5), #10B981)" : "linear-gradient(90deg, rgba(16,185,129,0.25), rgba(16,185,129,0.45))",
          transition: "width 0.04s linear, background 0.5s ease",
          boxShadow: overLimit ? "0 0 10px rgba(16,185,129,0.4)" : "none",
        }} />
        <div style={{ position: "absolute", top: -5, left: `${limitPct}%`, width: 2, height: "calc(100% + 10px)", background: "#F59E0B", borderRadius: 1 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 8.5, color: "rgba(255,255,255,0.2)" }}>0</span>
        <span style={{ fontSize: 8.5, color: "#F59E0B", fontWeight: 700 }}>↑ Free limit ({FREE_LIMIT})</span>
        <span style={{ fontSize: 8.5, color: "rgba(255,255,255,0.2)" }}>{MAX}</span>
      </div>
      {overLimit && (
        <div style={{ padding: "8px 11px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.22)", borderRadius: 8, animation: "fadeIn 0.4s ease" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#34D399" }}>🚀 {count - FREE_LIMIT} over limit · Upgrade conversation ready</span>
        </div>
      )}
    </div>
  );
}

function FrictionVisual({ inView }) {
  const steps = [
    { label: "Signed up",          count: 100, pct: 100, highlight: false },
    { label: "Created project",    count: 62,  pct: 62,  highlight: false },
    { label: "Sent first message", count: 31,  pct: 31,  highlight: true  },
    { label: "Got a reply",        count: 14,  pct: 14,  highlight: false },
  ];
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.22)", letterSpacing: "0.07em", marginBottom: 10 }}>
        FUNNEL · WHERE USERS STOP
      </div>
      {steps.map((s, i) => (
        <div key={i} style={{ marginBottom: i < steps.length - 1 ? 10 : 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: s.highlight ? 700 : 400, color: s.highlight ? "#A78BFA" : "rgba(255,255,255,0.5)" }}>{s.label}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              {s.highlight && inView && (
                <span style={{
                  fontSize: 9, fontWeight: 700, color: "#A78BFA",
                  background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)",
                  borderRadius: 4, padding: "1px 6px", animation: "fadeIn 0.5s ease 0.8s both",
                }}>31 stuck here</span>
              )}
              <span style={{ fontSize: 11, fontWeight: 600, color: s.highlight ? "#A78BFA" : "rgba(255,255,255,0.35)" }}>{s.count}</span>
            </div>
          </div>
          <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 3,
              width: inView ? `${s.pct}%` : "0%",
              background: s.highlight ? "linear-gradient(90deg, rgba(139,92,246,0.6), #8B5CF6)" : `rgba(139,92,246,${0.1 + i * 0.04})`,
              transition: `width 0.7s cubic-bezier(0.4,0,0.2,1) ${i * 0.1}s`,
              boxShadow: s.highlight ? "0 0 8px rgba(139,92,246,0.5)" : "none",
            }} />
          </div>
        </div>
      ))}
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
        padding: isMobile ? "22px 20px" : "26px 24px",
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
      {/* Header: tag + icon */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: `${uc.color}12`, border: `1px solid ${uc.color}30`,
          borderRadius: 50, padding: "4px 12px 4px 8px",
        }}>
          <span style={{ fontSize: 13 }}>{uc.icon}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: uc.color, letterSpacing: "0.04em" }}>{uc.tag}</span>
        </div>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: `${uc.color}10`, border: `1px solid ${uc.color}22`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
        }}>{uc.icon}</div>
      </div>

      {/* Visual area — the story */}
      <div style={{
        background: "#0F172A", borderRadius: 12,
        padding: "15px 14px", marginBottom: 16,
        border: `1px solid ${uc.color}18`,
        minHeight: 148,
      }}>
        <uc.Visual inView={inView} />
      </div>

      {/* Short headline — just 4-6 words */}
      <h3 style={{
        fontSize: isMobile ? "0.98rem" : "1.05rem", fontWeight: 700,
        color: "#0F172A", margin: "0 0 14px", lineHeight: 1.35,
      }}>
        {uc.headline}
      </h3>

      {/* Output */}
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
    title: "Connect your database",
    sub: "Paste your URI — MongoDB, PostgreSQL, or Supabase. Read-only credentials recommended. We analyze your schema and never modify your data.",
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
        @keyframes pulseGlow { 0%,100%{box-shadow:0 0 0 rgba(239,68,68,0)} 50%{box-shadow:0 0 14px rgba(239,68,68,0.55)} }
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
              From your database to action list
              <span style={{ color: "#818CF8" }}> in 60 seconds.</span>
            </h2>
            <p style={{
              fontSize: isMobile ? "0.9rem" : "1.05rem",
              color: "rgba(255,255,255,0.55)", lineHeight: 1.7,
              maxWidth: 520, margin: "0 auto",
            }}>
              No data warehouse. No BI tool. No SQL. Connect MongoDB, PostgreSQL,
              or Supabase and get your daily briefing every morning.
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
    output: "Warm Outreach List",
    Visual: OnboardingVisual,
  },
  {
    icon: "👻",
    tag: "Ghosting Triage",
    color: "#EF4444",
    headline: "Find paying users going silent",
    output: "At-Risk Priority List",
    Visual: GhostingVisual,
  },
  {
    icon: "🚀",
    tag: "Silent Power Users",
    color: "#10B981",
    headline: "Convert your most engaged free users",
    output: "Upsell Lead List",
    Visual: PowerUserVisual,
  },
  {
    icon: "🔧",
    tag: "Feature Friction",
    color: "#8B5CF6",
    headline: "Find exactly where users get stuck",
    output: "Support Alert",
    Visual: FrictionVisual,
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

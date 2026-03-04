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

// Churn sparkline — rising trend (bad signal)
const PTS = [
  { x: 0,   y: 54 },
  { x: 40,  y: 50 },
  { x: 80,  y: 46 },
  { x: 120, y: 48 },
  { x: 160, y: 28 },
  { x: 200, y: 8  },
];

const LINE_D = PTS.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x},${p.y}`).join(" ");
const AREA_D = `${LINE_D} L 200,62 L 0,62 Z`;

const MONTH_LABELS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN"];

function SparkLine({ color, gradId, inView }) {
  return (
    <svg viewBox="0 0 200 64" style={{ width: "100%", height: 68, display: "block" }} aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={AREA_D} fill={`url(#${gradId})`}
        style={{ opacity: inView ? 1 : 0, transition: "opacity 0.5s ease 0.9s" }} />
      <path d={LINE_D} fill="none" stroke={color} strokeWidth="2.2"
        strokeLinecap="round" strokeLinejoin="round"
        pathLength="1" strokeDasharray="1"
        strokeDashoffset={inView ? 0 : 1}
        style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.4,0,0.2,1) 0.2s" }} />
      {PTS.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === PTS.length - 1 ? 4 : 2.5} fill={color}
          style={{ opacity: inView ? 1 : 0, transition: `opacity 0.3s ease ${0.3 + i * 0.13}s` }} />
      ))}
    </svg>
  );
}

function AnimCount({ to, suffix = "", inView, delay = 0 }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const t = setTimeout(() => {
      let v = 0;
      const tick = () => {
        v += Math.ceil((to - v) / 5) || 1;
        if (v >= to) { setVal(to); return; }
        setVal(v);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, delay);
    return () => clearTimeout(t);
  }, [inView, to, delay]);
  return <>{val}{suffix}</>;
}

const BADGES = [
  { label: "Priya",  left: "53%", top: "16%", delay: "1.3s" },
  { label: "Marcus", left: "72%", top: "2%",  delay: "1.6s" },
  { label: "Julia",  left: "36%", top: "36%", delay: "1.9s" },
];

const STATS = [
  { icon: "🔔", stat: "14 days", label: "earlier than Stripe alerts you." },
  { icon: "👤", stat: "Users",   label: "not percentages, every morning." },
  { icon: "⚡", stat: "1 action", label: "suggested per insight, daily." },
];

export default function AgitateSection() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width:900px)").matches
  );
  const [sectionRef, inView] = useInView();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const h = () => setIsMobile(window.matchMedia("(max-width:900px)").matches);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  const fade = (delay = "0s", extra = {}) => ({
    opacity: inView ? 1 : 0,
    transform: inView ? "none" : "translateY(18px)",
    transition: `opacity 0.55s ease ${delay}, transform 0.55s ease ${delay}`,
    ...extra,
  });

  return (
    <section
      ref={sectionRef}
      style={{
        background: "#fff",
        padding: isMobile ? "72px 20px 64px" : "112px 60px 96px",
        fontFamily: "'Inter', -apple-system, sans-serif",
      }}
    >
      <div style={{ maxWidth: 860, margin: "0 auto" }}>

        {/* ── Headline ── */}
        <div style={{ marginBottom: isMobile ? 44 : 60, textAlign: isMobile ? "left" : "center", ...fade() }}>
          <h2 style={{
            fontSize: isMobile ? "clamp(1.6rem,6.5vw,2.2rem)" : "clamp(2rem,3.2vw,2.8rem)",
            fontWeight: 800, color: "#0F172A",
            lineHeight: 1.2, letterSpacing: "-0.03em", margin: "0 0 12px",
          }}>
            Most tools tell you what happened.
            <br />
            <span style={{ color: "#94A3B8", fontWeight: 500 }}>None tell you who to call about it.</span>
          </h2>
         
        </div>

        {/* ── Comparison cards ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: isMobile ? 16 : 20,
          ...fade("0.15s"),
        }}>

          {/* Left — generic tools */}
          <div style={{
            border: "1px solid #E2E8F0", borderRadius: 18,
            padding: "22px 22px 18px", background: "#FAFAFA",
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: "#94A3B8",
              letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14,
            }}>
              Analytics tools today
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
              {MONTH_LABELS.map(m => (
                <span key={m} style={{ fontSize: 9, color: "#CBD5E1" }}>{m}</span>
              ))}
            </div>

            <SparkLine color="#94A3B8" gradId="grad-gray" inView={inView} />

            <div style={{ marginTop: 14, display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontSize: 38, fontWeight: 800, color: "#0F172A", lineHeight: 1 }}>
                <AnimCount to={12} suffix="%" inView={inView} delay={600} />
              </span>
              <span style={{ fontSize: 12, color: "#EF4444", fontWeight: 600 }}>↑ 4% from last month</span>
            </div>
            <div style={{ marginTop: 4, fontSize: 13, color: "#94A3B8" }}>8 cancellations this month</div>

            <div style={{
              marginTop: 14, padding: "10px 13px",
              background: "#F1F5F9", borderRadius: 9,
              fontSize: 12, color: "#94A3B8", fontStyle: "italic",
            }}>
              Now what? Who do I talk to?
            </div>
          </div>

          {/* Right — Chomske */}
          <div style={{
            border: "1.5px solid #C7D2FE", borderRadius: 18,
            padding: "22px 22px 18px",
            background: "linear-gradient(160deg,#F5F3FF 0%,#F0FDF4 100%)",
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: "#6366F1",
              letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14,
              display: "flex", alignItems: "center", gap: 7,
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%", background: "#6366F1",
                display: "inline-block", boxShadow: "0 0 0 3px #C7D2FE",
              }} />
              Chomske
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
              {MONTH_LABELS.map(m => (
                <span key={m} style={{ fontSize: 9, color: "#A5B4FC" }}>{m}</span>
              ))}
            </div>

            {/* Chart with floating name badges */}
            <div style={{ position: "relative" }}>
              <SparkLine color="#6366F1" gradId="grad-indigo" inView={inView} />
              {BADGES.map(b => (
                <div key={b.label} style={{
                  position: "absolute", left: b.left, top: b.top,
                  background: "#4338CA", color: "#fff",
                  fontSize: 11, fontWeight: 700,
                  padding: "3px 10px", borderRadius: 20,
                  whiteSpace: "nowrap",
                  boxShadow: "0 2px 8px rgba(67,56,202,0.35)",
                  opacity: inView ? 1 : 0,
                  transform: inView ? "translateY(0) scale(1)" : "translateY(6px) scale(0.88)",
                  transition: `opacity 0.4s ease ${b.delay}, transform 0.4s ease ${b.delay}`,
                  pointerEvents: "none",
                }}>
                  {b.label}
                </div>
              ))}
            </div>

            <div style={{ marginTop: 14, display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontSize: 38, fontWeight: 800, color: "#4338CA", lineHeight: 1 }}>
                <AnimCount to={3} inView={inView} delay={800} />
              </span>
              <span style={{ fontSize: 12, color: "#4338CA", fontWeight: 600 }}>users behind that 12%</span>
            </div>
            <div style={{ marginTop: 4, fontSize: 13, color: "#6366F1" }}>Priya · Marcus · Julia</div>

            {/* Action card */}
            <div style={{
              marginTop: 14, padding: "12px 14px",
              background: "#fff", border: "1px solid #E0E7FF",
              borderRadius: 11, boxShadow: "0 2px 10px rgba(99,102,241,0.1)",
              opacity: inView ? 1 : 0,
              transform: inView ? "none" : "translateY(8px)",
              transition: "opacity 0.5s ease 2.1s, transform 0.5s ease 2.1s",
            }}>
              <div style={{
                fontSize: 10.5, fontWeight: 700, color: "#6366F1",
                marginBottom: 5, display: "flex", alignItems: "center", gap: 5,
              }}>
                <span>⚡</span> Today's action
              </div>
              <div style={{ fontSize: 13, color: "#0F172A", fontWeight: 600, lineHeight: 1.5 }}>
                Message Julia | Free trial ends in 2 days.
              </div>
              <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 3 }}>
                Last active 9 days ago · Free plan
              </div>
            </div>
          </div>
        </div>

        {/* ── Stat pills ── */}
        <div style={{
          marginTop: isMobile ? 28 : 36,
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr",
          gap: isMobile ? 10 : 14,
          ...fade("0.5s"),
        }}>
          {STATS.map((s, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 11,
              padding: "13px 16px",
              background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12,
            }}>
              <span style={{ fontSize: 20 }}>{s.icon}</span>
              <div>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: "#0F172A" }}>{s.stat} </span>
                <span style={{ fontSize: 13, color: "#64748B" }}>{s.label}</span>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}

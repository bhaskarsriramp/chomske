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

const GAPS = [
  {
    before: "You see a churn chart going down.",
    after:  "Chomske shows you the 3 users behind it.",
  },
  {
    before: "You see a drop-off percentage.",
    after:  "Chomske shows you where each user got stuck.",
  },
  {
    before: "You wait for Stripe to notify you.",
    after:  "Chomske warns you 14 days earlier.",
  },
];

const TOOLS = [
  { name: "Mixpanel",  gives: "Funnel charts",      missing: "Not who is stuck in the funnel" },
  { name: "Amplitude", gives: "Retention trends",   missing: "Not which user is about to leave" },
  { name: "Grafana",   gives: "Metric dashboards",  missing: "Not which metric belongs to whom" },
  { name: "Metabase",  gives: "SQL query results",  missing: "Requires you to know what to ask" },
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

        {/* ── Statement ── */}
        <div style={{
          marginBottom: isMobile ? 56 : 80,
          opacity: inView ? 1 : 0,
          transform: inView ? "none" : "translateY(18px)",
          transition: "opacity 0.55s ease, transform 0.55s ease",
        }}>
          <h2 style={{
            fontSize: isMobile ? "clamp(1.6rem, 6.5vw, 2.2rem)" : "clamp(2rem, 3.2vw, 2.8rem)",
            fontWeight: 800, color: "#0F172A",
            lineHeight: 1.2, letterSpacing: "-0.03em",
            margin: "0 0 16px",
          }}>
            Most tools tell you what happened.
            <br />
            <span style={{ color: "#94A3B8", fontWeight: 500 }}>None tell you who to call about it.</span>
          </h2>
          <p style={{
            fontSize: isMobile ? 14 : 16, color: "#64748B",
            lineHeight: 1.65, margin: 0, maxWidth: 520, fontWeight: 400,
          }}>
            You already have all the data. The gap is turning it into a
            name, a context, and a reason to reach out today.
          </p>
        </div>

        {/* ── Before / After rows ── */}
        <div style={{
          marginBottom: isMobile ? 56 : 80,
          opacity: inView ? 1 : 0,
          transform: inView ? "none" : "translateY(18px)",
          transition: "opacity 0.55s ease 0.12s, transform 0.55s ease 0.12s",
        }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            gap: isMobile ? 0 : 0,
            border: "1px solid #E2E8F0",
            borderRadius: isMobile ? 16 : 20,
            overflow: "hidden",
          }}>
            {/* Column headers — desktop only */}
            {!isMobile && (
              <>
                <div style={{
                  padding: "12px 24px",
                  background: "#F8FAFC",
                  borderBottom: "1px solid #E2E8F0",
                  borderRight: "1px solid #E2E8F0",
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.07em", textTransform: "uppercase" }}>
                    What your current tools give you
                  </span>
                </div>
                <div style={{
                  padding: "12px 24px",
                  background: "#F0FDF4",
                  borderBottom: "1px solid #E2E8F0",
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#16A34A", letterSpacing: "0.07em", textTransform: "uppercase" }}>
                    What Chomske gives you
                  </span>
                </div>
              </>
            )}
            {GAPS.map((g, i) => (
              isMobile ? (
                <div key={i} style={{
                  borderBottom: i < GAPS.length - 1 ? "1px solid #F1F5F9" : "none",
                  padding: "18px 20px",
                }}>
                  <div style={{ fontSize: 13, color: "#94A3B8", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 18, height: 18, borderRadius: "50%", background: "#FEF2F2", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#EF4444", fontWeight: 700, flexShrink: 0 }}>✕</span>
                    {g.before}
                  </div>
                  <div style={{ fontSize: 13.5, color: "#0F172A", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 18, height: 18, borderRadius: "50%", background: "#F0FDF4", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#16A34A", fontWeight: 700, flexShrink: 0 }}>✓</span>
                    {g.after}
                  </div>
                </div>
              ) : (
                <div key={i} style={{ display: "contents" }}>
                  <div style={{
                    padding: "18px 24px",
                    borderBottom: i < GAPS.length - 1 ? "1px solid #F1F5F9" : "none",
                    borderRight: "1px solid #E2E8F0",
                    background: "#fff",
                  }}>
                    <p style={{ margin: 0, fontSize: 14, color: "#64748B", lineHeight: 1.5 }}>{g.before}</p>
                  </div>
                  <div style={{
                    padding: "18px 24px",
                    borderBottom: i < GAPS.length - 1 ? "1px solid #F0FDF4" : "none",
                    background: "#FAFFF7",
                  }}>
                    <p style={{ margin: 0, fontSize: 14, color: "#15803D", fontWeight: 600, lineHeight: 1.5 }}>{g.after}</p>
                  </div>
                </div>
              )
            ))}
          </div>
        </div>

        {/* ── Tool comparison ── */}
        <div style={{
          opacity: inView ? 1 : 0,
          transform: inView ? "none" : "translateY(18px)",
          transition: "opacity 0.55s ease 0.24s, transform 0.55s ease 0.24s",
        }}>
          <h3 style={{
            fontSize: isMobile ? "1rem" : "1.2rem",
            fontWeight: 700, color: "#0F172A",
            margin: "0 0 6px", letterSpacing: "-0.02em",
          }}>
            Every tool you use has the same blind spot.
          </h3>
          <p style={{ fontSize: isMobile ? 13 : 14, color: "#64748B", margin: "0 0 20px" }}>
            Charts and percentages. But no names or details.
          </p>

          <div style={{
            border: "1px solid #E2E8F0",
            borderRadius: isMobile ? 14 : 18,
            overflow: "hidden",
          }}>
            {TOOLS.map((t, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "140px 1fr 1fr",
                  padding: isMobile ? "14px 16px" : "14px 22px",
                  borderBottom: i < TOOLS.length - 1 ? "1px solid #F1F5F9" : "none",
                  gap: isMobile ? 4 : 12,
                  alignItems: "center",
                  background: "#fff",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "#F8FAFC"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}
              >
                <span style={{ fontSize: isMobile ? 13 : 14, fontWeight: 700, color: "#0F172A" }}>{t.name}</span>
                <span style={{ fontSize: isMobile ? 12 : 13, color: "#64748B" }}>
                  {isMobile ? "" : "→ "}{t.gives}
                </span>
                <span style={{ fontSize: isMobile ? 12 : 13, color: "#EF4444" }}>
                  {isMobile ? "✕ " : "✕ "}{t.missing}
                </span>
              </div>
            ))}
            {/* Chomske row */}
            <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "140px 1fr 1fr",
              padding: isMobile ? "14px 16px" : "14px 22px",
              gap: isMobile ? 4 : 12,
              alignItems: "center",
              background: "linear-gradient(135deg, #EEF2FF 0%, #F0FDF4 100%)",
              borderTop: "2px solid #C7D2FE",
            }}>
              <span style={{ fontSize: isMobile ? 13 : 14, fontWeight: 800, color: "#4338CA" }}>Chomske</span>
              <span style={{ fontSize: isMobile ? 12 : 13, color: "#374151", fontWeight: 600 }}>
                Names, context, what to do
              </span>
              <span style={{ fontSize: isMobile ? 12 : 13, color: "#16A34A", fontWeight: 600 }}>
                ✓ Every morning, automatically
              </span>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}

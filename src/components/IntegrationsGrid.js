import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { trackCTA } from "./GoogleAnalytics";

const INTEGRATIONS = [
  {
    name: "Stripe", category: "Payments", bg: "#fff",
    icon: <svg viewBox="0 0 24 24" width="22" height="20"><path fill="#646FDE" d="M11.106 18.592c-2.215 0-5.077-.914-7.324-2.133v6.022A18.597 18.597 0 0 0 11.102 24c5.564 0 9.398-2.39 9.398-7.198 0-7.976-10.229-6.547-10.229-9.556l-.001-.001c0-1.045.873-1.448 2.271-1.448 2.036 0 4.621.623 6.658 1.72V1.223C16.981.337 14.766 0 12.547 0 7.118 0 3.5 2.83 3.5 7.564c0 7.401 10.173 6.201 10.173 9.392 0 1.238-1.074 1.636-2.567 1.636z"/></svg>,
  },
  {
    name: "Vercel", category: "Deployment", bg: "#000000",
    icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 1L24 22H0L12 1Z" fill="#fff"/></svg>,
  },
  {
    name: "Sentry", category: "Error Monitoring", bg: "#362D59",
    icon: <span style={{ fontSize: 14, color: "#fff", fontWeight: 800 }}>◉</span>,
  },
  {
    name: "AWS", category: "Cloud Infra", bg: "#fff",
    icon: <svg viewBox="0 0 526 315" width="28" height="17"><path fill="#252f3e" d="M148.232 114.237a52.931 52.931 0 0 0 1.924 15.57 93.64 93.64 0 0 0 5.6 12.6 7.61 7.61 0 0 1 1.225 4.024c0 1.749-1.05 3.5-3.324 5.248l-11.021 7.348a8.388 8.388 0 0 1-4.548 1.574 8.05 8.05 0 0 1-5.248-2.449 54.121 54.121 0 0 1-6.3-8.222c-1.749-2.974-3.5-6.3-5.423-10.322q-20.468 24.138-51.434 24.138c-14.7 0-26.416-4.2-34.988-12.6s-12.946-19.59-12.946-33.585c0-14.87 5.248-26.941 15.92-36.038s24.841-13.646 42.86-13.646a138.511 138.511 0 0 1 18.544 1.4c6.473.875 13.121 2.274 20.118 3.849V60.355c0-13.3-2.8-22.567-8.222-27.991-5.6-5.423-15.045-8.047-28.516-8.047a79.6 79.6 0 0 0-18.894 2.274 139.4 139.4 0 0 0-18.894 5.948 50.2 50.2 0 0 1-6.123 2.274 10.73 10.73 0 0 1-2.8.525c-2.449 0-3.674-1.749-3.674-5.423v-8.572c0-2.8.35-4.9 1.225-6.123a13.1 13.1 0 0 1 4.9-3.674 100.716 100.716 0 0 1 22.043-7.872A106.062 106.062 0 0 1 87.527.35c20.822 0 36.038 4.723 45.835 14.17 9.622 9.447 14.52 23.792 14.52 43.036v56.681Zm-71.026 26.591a56.7 56.7 0 0 0 18.019-3.149 38.984 38.984 0 0 0 16.619-11.2 27.768 27.768 0 0 0 5.948-11.2 62.8 62.8 0 0 0 1.749-15.22v-7.34a146.1 146.1 0 0 0-16.092-2.974A131.821 131.821 0 0 0 87.002 88.7c-11.721 0-20.293 2.274-26.066 7s-8.572 11.371-8.572 20.118c0 8.222 2.1 14.345 6.473 18.544 4.2 4.374 10.322 6.473 18.369 6.473Zm140.478 18.894c-3.149 0-5.248-.525-6.648-1.749-1.4-1.05-2.624-3.5-3.674-6.823L166.249 15.92a30.644 30.644 0 0 1-1.574-7c0-2.8 1.4-4.374 4.2-4.374h17.144c3.324 0 5.6.525 6.823 1.749 1.4 1.05 2.449 3.5 3.5 6.823l29.39 115.811 27.29-115.808c.875-3.5 1.924-5.773 3.324-6.823s3.849-1.749 7-1.749h14c3.324 0 5.6.525 7 1.749 1.4 1.05 2.624 3.5 3.324 6.823l27.641 117.211 30.255-117.211c1.05-3.5 2.274-5.773 3.5-6.823 1.4-1.05 3.674-1.749 6.823-1.749h16.27c2.8 0 4.374 1.4 4.374 4.374a17.445 17.445 0 0 1-.35 2.8 24.891 24.891 0 0 1-1.225 4.374l-42.161 135.23q-1.574 5.248-3.674 6.823a11.192 11.192 0 0 1-6.648 1.749h-15.046c-3.324 0-5.6-.525-7-1.749s-2.624-3.5-3.324-7L269.991 38.312l-26.942 112.663c-.875 3.5-1.924 5.773-3.324 7s-3.849 1.749-7 1.749Zm224.8 4.723a115.767 115.767 0 0 1-26.941-3.149c-8.747-2.1-15.57-4.374-20.118-7-2.8-1.574-4.723-3.324-5.423-4.9a12.349 12.349 0 0 1-1.05-4.9v-8.916c0-3.674 1.4-5.423 4.024-5.423a9.906 9.906 0 0 1 3.149.525c1.05.35 2.624 1.05 4.374 1.749a95.157 95.157 0 0 0 19.244 6.123 105.06 105.06 0 0 0 20.818 2.1c11.021 0 19.594-1.924 25.542-5.773a18.839 18.839 0 0 0 9.1-16.619 17.037 17.037 0 0 0-4.723-12.246c-3.149-3.324-9.1-6.3-17.669-9.1l-25.372-7.871c-12.771-4.023-22.218-9.971-27.99-17.845a41.68 41.68 0 0 1-8.747-25.367 38.934 38.934 0 0 1 4.723-19.419 44.982 44.982 0 0 1 12.6-14.345 55.525 55.525 0 0 1 18.194-9.1A76.248 76.248 0 0 1 448.257 0a87.822 87.822 0 0 1 11.721.7c4.024.525 7.7 1.225 11.371 1.924 3.5.875 6.823 1.749 9.972 2.8a38.181 38.181 0 0 1 7.348 3.149 15.128 15.128 0 0 1 5.248 4.374 9.428 9.428 0 0 1 1.574 5.773v8.222c0 3.674-1.4 5.6-4.024 5.6-1.4 0-3.674-.7-6.648-2.1q-14.958-6.823-33.589-6.823c-9.972 0-17.844 1.574-23.267 4.9s-8.222 8.4-8.222 15.57a16.52 16.52 0 0 0 5.248 12.421c3.5 3.324 9.972 6.648 19.244 9.622L469.075 74c12.6 4.024 21.693 9.622 27.116 16.794a39.587 39.587 0 0 1 8.047 24.492 44.973 44.973 0 0 1-4.548 20.293 47.049 47.049 0 0 1-12.771 15.395 56.392 56.392 0 0 1-19.419 9.8 83.188 83.188 0 0 1-25.017 3.674Z"/><path fill="#f90" d="M475.548 249.464c-57.556 42.511-141.178 65.078-213.079 65.078-100.767.004-191.562-37.259-260.137-99.188-5.423-4.9-.525-11.546 5.948-7.7 74.175 43.036 165.67 69.1 260.313 69.1 63.854 0 134.005-13.3 198.559-40.587 9.622-4.374 17.844 6.3 8.4 13.3Z"/><path fill="#f90" d="M499.515 222.176c-7.348-9.447-48.634-4.548-67.353-2.274-5.6.7-6.473-4.2-1.4-7.872 32.889-23.092 86.946-16.445 93.244-8.747 6.3 7.872-1.749 61.929-32.539 87.821-4.723 4.024-9.272 1.924-7.173-3.324 6.999-17.32 22.569-56.332 15.221-65.604Z"/></svg>,
  },
  {
    name: "GitHub", category: "Version Control", bg: "#24292E",
    icon: <svg viewBox="0 0 1792 1792" width="20" height="20" fill="white"><path d="M1664 896q0 251-146.5 451.5T1139 1625q-27 5-39.5-7t-12.5-30v-211q0-97-52-142 57-6 102.5-18t94-39 81-66.5 53-105T1386 856q0-121-79-206 37-91-8-204-28-9-81 11t-92 44l-38 24q-93-26-192-26t-192 26q-16-11-42.5-27T578 459.5 492 446q-44 113-7 204-79 85-79 206 0 85 20.5 150t52.5 105 80.5 67 94 39 102.5 18q-40 36-49 103-21 10-45 15t-57 5-65.5-21.5T484 1274q-19-32-48.5-52t-49.5-24l-20-3q-21 0-29 4.5t-5 11.5 9 14 13 12l7 5q22 10 43.5 38t31.5 51l10 23q13 38 44 61.5t67 30 69.5 7 55.5-3.5l23-4q0 38 .5 89t.5 54q0 18-13 30t-40 7q-232-77-378.5-277.5T128 896q0-209 103-385.5T510.5 231 896 128t385.5 103T1561 510.5 1664 896z"/></svg>,
  },
  {
    name: "Postmark", category: "Email Delivery", bg: "#FFDE00",
    icon: <span style={{ fontSize: 14, color: "#000", fontWeight: 800 }}>✉</span>,
  },
  {
    name: "MongoDB", category: "Database", bg: "#fff",
    icon: <svg viewBox="0 0 24 24" width="26" height="26"><path fill="#499D4A" d="M12.889 20.852s5.595-3.678 4.286-11.33c-1.262-5.563-4.239-7.387-4.566-8.088-.358-.499-.701-1.371-.701-1.371l.234 15.475c-.001.015-.484 4.737.747 5.314z"/><path fill="#58AA50" d="M11.58 21.054s-5.252-3.584-4.94-9.896c.296-6.312 4.005-9.413 4.722-9.974.468-.498.483-.685.514-1.184.327.701.265 10.488.312 11.641.14 4.442-.249 8.572-.608 9.413z"/><path fill="#499D4A" d="m12.546 24-.639-.218s.078-3.257-1.091-3.491c-.779-.904.125-38.338 2.93-.125 0 0-.966.483-1.138 1.309-.186.811-.062 2.525-.062 2.525z"/></svg>,
  },
  {
    name: "PlanetScale", category: "Database", bg: "#9333EA",
    icon: <span style={{ fontSize: 14, color: "#fff", fontWeight: 800 }}>◑</span>,
  },
  {
    name: "Render", category: "Hosting", bg: "#46E3B7",
    icon: <span style={{ fontSize: 14, color: "#111", fontWeight: 800 }}>▣</span>,
  },
  {
    name: "Railway", category: "Deployment", bg: "#7B2BF9",
    icon: <span style={{ fontSize: 14, color: "#fff", fontWeight: 800 }}>◆</span>,
  },
  {
    name: "Custom Hook", category: "Any HTTP endpoint", bg: "#1a1a1a",
    icon: <svg viewBox="0 0 32 32" width="16" height="16"><path fill="#fff" d="M30,16l-9,7v-2.534L26.742,16L21,11.534V9L30,16z M11,20.466L5.258,16L11,11.534V9l-9,7l9,7V20.466z M17.794,9l-6,14h2.177l6-14H17.794z"/></svg>,
  },
  {
    name: "+ More", category: "Any webhooks", bg: "#E2E8F0",
    icon: <span style={{ fontSize: 16, color: "#64748B", fontWeight: 800 }}>∞</span>,
  },
];

export default function IntegrationsGrid() {
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

  return (
    <section style={{
      background: "#F5F5F0",  /* doola-style light warm gray */
      padding: isMobile ? "72px 20px 64px" : "108px 60px 88px",
      fontFamily: "'Inter', -apple-system, sans-serif",
      overflowX: "hidden",
    }}>
      <style>{`
        .integ-card {
          transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease;
          cursor: default;
        }
        .integ-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 30px rgba(0,0,0,.09) !important;
          border-color: #D1D5DB !important;
        }
      `}</style>

      <div style={{ maxWidth: 1160, margin: "0 auto" }}>

        <div style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "flex-start" : "center",
          justifyContent: "space-between",
          gap: isMobile ? 36 : 80,
        }}>

          {/* Left: text block */}
          <div style={{ flex: "0 0 auto", width: isMobile ? "100%" : "32%" }}>
            <p style={{
              fontSize: 13, fontWeight: 600, color: "#92722A",
              margin: "0 0 14px", letterSpacing: "0.01em",
            }}>Integrations</p>

            <h2 style={{
              fontSize: isMobile ? "clamp(1.9rem,7vw,2.4rem)" : "clamp(2rem,3.5vw,3rem)",
              fontWeight: 800, letterSpacing: "-0.04em",
              color: "#1A1A1A", lineHeight: 1.12, margin: "0 0 16px",
            }}>
              Works With Your Entire Stack.
            </h2>
            <p style={{
              fontSize: isMobile ? ".95rem" : "1rem",
              color: "#6B7280", lineHeight: 1.68, margin: "0 0 32px",
            }}>
              If it sends a webhook, we support it. Stripe, Vercel, Sentry, AWS or any custom HTTP endpoint you build.
            </p>

            <button
              onClick={() => { trackCTA("integrations_see_all", "integrations"); navigate("/professional/login"); }}
              style={{
                background: "#1A1A1A", color: "#fff",
                fontSize: 14, fontWeight: 700,
                padding: "14px 32px", borderRadius: 50,
                border: "none", cursor: "pointer",
                transition: "all .2s ease",
                letterSpacing: "-.01em",
                display: "inline-flex", alignItems: "center", gap: 8,
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 12px 28px rgba(0,0,0,.18)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
            >
              Connect Your Tools
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Right: integration card grid */}
          <div style={{
            flex: 1,
            minWidth: 0,
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)",
            gap: isMobile ? 10 : 12,
          }}>
            {INTEGRATIONS.map(({ name, category, icon, bg }) => (
              <div key={name} className="integ-card" style={{
                background: "#ffffff",
                border: "1.5px solid #E5E7EB",
                borderRadius: 16,
                padding: isMobile ? "14px 14px" : "16px 18px",
                display: "flex", alignItems: "center", gap: 12,
                boxShadow: "0 1px 4px rgba(0,0,0,.04)",
              }}>
                {/* Logo */}
                <div style={{
                  width: 32, height: 32, borderRadius: 10,
                  background: bg,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, overflow: "hidden",
                }}>
                  {icon}
                </div>
                {/* Text */}
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 700, color: "#111827",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{name}</div>
                  <div style={{
                    fontSize: 10, color: "#9CA3AF", fontWeight: 500, marginTop: 2,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{category}</div>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}

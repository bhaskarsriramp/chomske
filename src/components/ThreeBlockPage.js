import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { trackCTA } from "./GoogleAnalytics";

function WebhookCodeBlock() {
  const [copied, setCopied] = useState(false);
  const snippet = `curl -X POST "https://chomske.com/hook/xK9m_a2bN" \\
  -H "Content-Type: application/json" \\
  -d '{"title": "$TITLE", "message": "$MESSAGE"}'`;

  const handleCopy = () => {
    navigator.clipboard.writeText(snippet).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ background: "#0F172A", borderRadius: 16, padding: "18px 20px", fontFamily: "monospace", fontSize: 12 }}>
      {/* Traffic lights + label */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
        <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#EF4444" }} />
        <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#F59E0B" }} />
        <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#22C55E" }} />
        <span style={{ marginLeft: 8, fontSize: 11, color: "#475569", fontFamily: "'Inter', sans-serif" }}>
          curl &nbsp;·&nbsp; webhook.sh
        </span>
        <div
          onClick={handleCopy}
          style={{
            marginLeft: "auto",
            background: copied ? "#16A34A" : "#1E293B",
            border: `1px solid ${copied ? "#16A34A" : "rgba(255,255,255,.1)"}`,
            borderRadius: 7, padding: "3px 10px",
            fontSize: 10, fontWeight: 700, color: copied ? "#fff" : "#94A3B8",
            cursor: "pointer", transition: "all .2s",
            fontFamily: "'Inter', sans-serif", letterSpacing: ".01em",
            display: "flex", alignItems: "center", gap: 5,
          }}
        >
          {copied ? (
            <>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy
            </>
          )}
        </div>
      </div>

      {/* Code block */}
      <div style={{
        background: "#020817", borderRadius: 10, padding: "16px 6px",
        border: "1px solid rgba(255,255,255,.06)",
        lineHeight: 1.8, overflowX: "auto",
      }}>
        {/* Line 1 */}
        <div style={{ whiteSpace: "nowrap" }}>
          <span style={{ color: "#34D399" }}>curl</span>
          <span style={{ color: "#94A3B8" }}> -X </span>
          <span style={{ color: "#FCD34D" }}>POST</span>
          <span style={{ color: "#94A3B8" }}> \</span>
        </div>
        {/* Line 2: URL */}
        <div style={{ whiteSpace: "nowrap", paddingLeft: 16 }}>
          <span style={{ color: "#64748B" }}>"</span>
          <span style={{ color: "#7DD3FC" }}>https://chomske.com/hook/</span>
          <span style={{ color: "#A78BFA" }}>xK9m_a2bN</span>
          <span style={{ color: "#64748B" }}>"</span>
          <span style={{ color: "#94A3B8" }}> \</span>
        </div>
        {/* Line 3: Header */}
        <div style={{ whiteSpace: "nowrap", paddingLeft: 16 }}>
          <span style={{ color: "#94A3B8" }}>-H </span>
          <span style={{ color: "#64748B" }}>"</span>
          <span style={{ color: "#FB923C" }}>Content-Type</span>
          <span style={{ color: "#94A3B8" }}>: </span>
          <span style={{ color: "#FDBA74" }}>application/json</span>
          <span style={{ color: "#64748B" }}>"</span>
          <span style={{ color: "#94A3B8" }}> \</span>
        </div>
        {/* Line 4+: Body with variables — multiline JSON */}
        <div style={{ whiteSpace: "nowrap", paddingLeft: 16 }}>
          <span style={{ color: "#94A3B8" }}>-d </span>
          <span style={{ color: "#64748B" }}>'&#123;</span>
        </div>
        <div style={{ whiteSpace: "nowrap", paddingLeft: 32 }}>
          <span style={{ color: "#FB923C" }}>"Error"</span>
          <span style={{ color: "#94A3B8" }}>: </span>
          <span style={{ color: "#4ADE80", fontWeight: 700 }}>"$Error Details"</span>
          <span style={{ color: "#64748B" }}>,</span>
        </div>
        <div style={{ whiteSpace: "nowrap", paddingLeft: 32 }}>
          <span style={{ color: "#FB923C" }}>"Component"</span>
          <span style={{ color: "#94A3B8" }}>: </span>
          <span style={{ color: "#4ADE80", fontWeight: 700 }}>"$Affected Comp"</span>
          <span style={{ color: "#64748B" }}>,</span>
        </div>
        <div style={{ whiteSpace: "nowrap", paddingLeft: 32 }}>
          <span style={{ color: "#FB923C" }}>"Status"</span>
          <span style={{ color: "#94A3B8" }}>: </span>
          <span style={{ color: "#4ADE80", fontWeight: 700 }}>"$Current Status"</span>
        </div>
        <div style={{ whiteSpace: "nowrap", paddingLeft: 16 }}>
          <span style={{ color: "#64748B" }}>&#125;'</span>
        </div>
      </div>

     
    
    </div>
  );
}

const STEPS = [
  {
    number: "01", label: "Connect",
    headline: "Copy your webhook URL.",
    sub: "One unique URL per integration. Takes 30 seconds.",
    detail: "No Meta API approval. No WhatsApp Business account. No waiting. We handle everything.",
    visual: <WebhookCodeBlock />,
    accent: "#7DD3FC", numColor: "#0EA5E9", numBg: "rgba(14,165,233,.1)",
  },
  {
    number: "02", label: "Drop it in",
    headline: "Paste into Stripe, Vercel, or anything.",
    sub: "Works with any service that sends webhooks.",
    detail: "Stripe, Vercel, AWS, MongoDB, GitHub,Sentry, Postmark, or any custom HTTP webhook.",
    visual: (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
        {[
          {
            name: "Stripe", bg: "#fff",
            icon: <svg viewBox="0 0 24 24" width="20" height="18"><path fill="#646FDE" d="M11.106 18.592c-2.215 0-5.077-.914-7.324-2.133v6.022A18.597 18.597 0 0 0 11.102 24c5.564 0 9.398-2.39 9.398-7.198 0-7.976-10.229-6.547-10.229-9.556l-.001-.001c0-1.045.873-1.448 2.271-1.448 2.036 0 4.621.623 6.658 1.72V1.223C16.981.337 14.766 0 12.547 0 7.118 0 3.5 2.83 3.5 7.564c0 7.401 10.173 6.201 10.173 9.392 0 1.238-1.074 1.636-2.567 1.636z"/></svg>,
          },
          {
            name: "Vercel", bg: "#000",
            icon: <svg viewBox="0 0 24 24" width="12" height="12" fill="none"><path d="M12 1L24 22H0L12 1Z" fill="#fff"/></svg>,
          },
           {
            name: "AWS", bg: "#fff",
            icon: <svg viewBox="0 0 526 315" width="20" height="12"><path fill="#252f3e" d="M148.232 114.237a52.931 52.931 0 0 0 1.924 15.57 93.64 93.64 0 0 0 5.6 12.6 7.61 7.61 0 0 1 1.225 4.024c0 1.749-1.05 3.5-3.324 5.248l-11.021 7.348a8.388 8.388 0 0 1-4.548 1.574 8.05 8.05 0 0 1-5.248-2.449 54.121 54.121 0 0 1-6.3-8.222c-1.749-2.974-3.5-6.3-5.423-10.322q-20.468 24.138-51.434 24.138c-14.7 0-26.416-4.2-34.988-12.6s-12.946-19.59-12.946-33.585c0-14.87 5.248-26.941 15.92-36.038s24.841-13.646 42.86-13.646a138.511 138.511 0 0 1 18.544 1.4c6.473.875 13.121 2.274 20.118 3.849V60.355c0-13.3-2.8-22.567-8.222-27.991-5.6-5.423-15.045-8.047-28.516-8.047a79.6 79.6 0 0 0-18.894 2.274 139.4 139.4 0 0 0-18.894 5.948 50.2 50.2 0 0 1-6.123 2.274 10.73 10.73 0 0 1-2.8.525c-2.449 0-3.674-1.749-3.674-5.423v-8.572c0-2.8.35-4.9 1.225-6.123a13.1 13.1 0 0 1 4.9-3.674 100.716 100.716 0 0 1 22.043-7.872A106.062 106.062 0 0 1 87.527.35c20.822 0 36.038 4.723 45.835 14.17 9.622 9.447 14.52 23.792 14.52 43.036v56.681Zm-71.026 26.591a56.7 56.7 0 0 0 18.019-3.149 38.984 38.984 0 0 0 16.619-11.2 27.768 27.768 0 0 0 5.948-11.2 62.8 62.8 0 0 0 1.749-15.22v-7.34a146.1 146.1 0 0 0-16.092-2.974A131.821 131.821 0 0 0 87.002 88.7c-11.721 0-20.293 2.274-26.066 7s-8.572 11.371-8.572 20.118c0 8.222 2.1 14.345 6.473 18.544 4.2 4.374 10.322 6.473 18.369 6.473Zm140.478 18.894c-3.149 0-5.248-.525-6.648-1.749-1.4-1.05-2.624-3.5-3.674-6.823L166.249 15.92a30.644 30.644 0 0 1-1.574-7c0-2.8 1.4-4.374 4.2-4.374h17.144c3.324 0 5.6.525 6.823 1.749 1.4 1.05 2.449 3.5 3.5 6.823l29.39 115.811 27.29-115.808c.875-3.5 1.924-5.773 3.324-6.823s3.849-1.749 7-1.749h14c3.324 0 5.6.525 7 1.749 1.4 1.05 2.624 3.5 3.324 6.823l27.641 117.211 30.255-117.211c1.05-3.5 2.274-5.773 3.5-6.823 1.4-1.05 3.674-1.749 6.823-1.749h16.27c2.8 0 4.374 1.4 4.374 4.374a17.445 17.445 0 0 1-.35 2.8 24.891 24.891 0 0 1-1.225 4.374l-42.161 135.23q-1.574 5.248-3.674 6.823a11.192 11.192 0 0 1-6.648 1.749h-15.046c-3.324 0-5.6-.525-7-1.749s-2.624-3.5-3.324-7L269.991 38.312l-26.942 112.663c-.875 3.5-1.924 5.773-3.324 7s-3.849 1.749-7 1.749Zm224.8 4.723a115.767 115.767 0 0 1-26.941-3.149c-8.747-2.1-15.57-4.374-20.118-7-2.8-1.574-4.723-3.324-5.423-4.9a12.349 12.349 0 0 1-1.05-4.9v-8.916c0-3.674 1.4-5.423 4.024-5.423a9.906 9.906 0 0 1 3.149.525c1.05.35 2.624 1.05 4.374 1.749a95.157 95.157 0 0 0 19.244 6.123 105.06 105.06 0 0 0 20.818 2.1c11.021 0 19.594-1.924 25.542-5.773a18.839 18.839 0 0 0 9.1-16.619 17.037 17.037 0 0 0-4.723-12.246c-3.149-3.324-9.1-6.3-17.669-9.1l-25.372-7.871c-12.771-4.023-22.218-9.971-27.99-17.845a41.68 41.68 0 0 1-8.747-25.367 38.934 38.934 0 0 1 4.723-19.419 44.982 44.982 0 0 1 12.6-14.345 55.525 55.525 0 0 1 18.194-9.1A76.248 76.248 0 0 1 448.257 0a87.822 87.822 0 0 1 11.721.7c4.024.525 7.7 1.225 11.371 1.924 3.5.875 6.823 1.749 9.972 2.8a38.181 38.181 0 0 1 7.348 3.149 15.128 15.128 0 0 1 5.248 4.374 9.428 9.428 0 0 1 1.574 5.773v8.222c0 3.674-1.4 5.6-4.024 5.6-1.4 0-3.674-.7-6.648-2.1q-14.958-6.823-33.589-6.823c-9.972 0-17.844 1.574-23.267 4.9s-8.222 8.4-8.222 15.57a16.52 16.52 0 0 0 5.248 12.421c3.5 3.324 9.972 6.648 19.244 9.622L469.075 74c12.6 4.024 21.693 9.622 27.116 16.794a39.587 39.587 0 0 1 8.047 24.492 44.973 44.973 0 0 1-4.548 20.293 47.049 47.049 0 0 1-12.771 15.395 56.392 56.392 0 0 1-19.419 9.8 83.188 83.188 0 0 1-25.017 3.674Z"/><path fill="#f90" d="M475.548 249.464c-57.556 42.511-141.178 65.078-213.079 65.078-100.767.004-191.562-37.259-260.137-99.188-5.423-4.9-.525-11.546 5.948-7.7 74.175 43.036 165.67 69.1 260.313 69.1 63.854 0 134.005-13.3 198.559-40.587 9.622-4.374 17.844 6.3 8.4 13.3Z"/><path fill="#f90" d="M499.515 222.176c-7.348-9.447-48.634-4.548-67.353-2.274-5.6.7-6.473-4.2-1.4-7.872 32.889-23.092 86.946-16.445 93.244-8.747 6.3 7.872-1.749 61.929-32.539 87.821-4.723 4.024-9.272 1.924-7.173-3.324 6.999-17.32 22.569-56.332 15.221-65.604Z"/></svg>,
          },
           {
            name: "MongoDB", bg: "#fff",
            icon: <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#499D4A" d="M12.889 20.852s5.595-3.678 4.286-11.33c-1.262-5.563-4.239-7.387-4.566-8.088-.358-.499-.701-1.371-.701-1.371l.234 15.475c-.001.015-.484 4.737.747 5.314z"/><path fill="#58AA50" d="M11.58 21.054s-5.252-3.584-4.94-9.896c.296-6.312 4.005-9.413 4.722-9.974.468-.498.483-.685.514-1.184.327.701.265 10.488.312 11.641.14 4.442-.249 8.572-.608 9.413z"/><path fill="#499D4A" d="m12.546 24-.639-.218s.078-3.257-1.091-3.491c-.779-.904.125-38.338 2.93-.125 0 0-.966.483-1.138 1.309-.186.811-.062 2.525-.062 2.525z"/></svg>,
          },
           {
            name: "GitHub", bg: "#24292E",
            icon: <svg viewBox="0 0 1792 1792" width="13" height="13" fill="white"><path d="M1664 896q0 251-146.5 451.5T1139 1625q-27 5-39.5-7t-12.5-30v-211q0-97-52-142 57-6 102.5-18t94-39 81-66.5 53-105T1386 856q0-121-79-206 37-91-8-204-28-9-81 11t-92 44l-38 24q-93-26-192-26t-192 26q-16-11-42.5-27T578 459.5 492 446q-44 113-7 204-79 85-79 206 0 85 20.5 150t52.5 105 80.5 67 94 39 102.5 18q-40 36-49 103-21 10-45 15t-57 5-65.5-21.5T484 1274q-19-32-48.5-52t-49.5-24l-20-3q-21 0-29 4.5t-5 11.5 9 14 13 12l7 5q22 10 43.5 38t31.5 51l10 23q13 38 44 61.5t67 30 69.5 7 55.5-3.5l23-4q0 38 .5 89t.5 54q0 18-13 30t-40 7q-232-77-378.5-277.5T128 896q0-209 103-385.5T510.5 231 896 128t385.5 103T1561 510.5 1664 896z"/></svg>,
          },
          {
            name: "Sentry", bg: "#362D59",
            icon: <span style={{ fontSize: 9, color: "#fff", fontWeight: 800 }}>◉</span>,
          },
         
          {
            name: "Postmark", bg: "#FFDE00",
            icon: <span style={{ fontSize: 9, color: "#000", fontWeight: 800 }}>✉</span>,
          },
         
         
          {
            name: "Custom", bg: "#1a1a1a",
            icon: <svg viewBox="0 0 32 32" width="14" height="14"><path fill="#fff" d="M30,16l-9,7v-2.534L26.742,16L21,11.534V9L30,16z M11,20.466L5.258,16L11,11.534V9l-9,7l9,7V20.466z M17.794,9l-6,14h2.177l6-14H17.794z"/></svg>,
          },
        ].map((s, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 7,
            background: "#fff", border: "1.5px solid #E2E8F0",
            borderRadius: 11, padding: "8px 14px",
            fontSize: 12, fontWeight: 600, color: "#0F172A",
            boxShadow: "0 1px 4px rgba(0,0,0,.04)",
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: 5,
              background: s.bg, display: "flex", alignItems: "center",
              justifyContent: "center", flexShrink: 0, overflow: "hidden",
            }}>{s.icon}</div>
            {s.name}
          </div>
        ))}
      </div>
    ),
    accent: "#A78BFA", numColor: "#8B5CF6", numBg: "rgba(139,92,246,.1)",
  },
  {
    number: "03", label: "Respond",
    headline: "WhatsApp wakes you up. You acknowledge it.",
    sub: "Alert sent. Escalation clock starts. Acknowledge to stop.",
    detail: "No response in X min? Escalate to your co-founder or CTO. Your SaaS is never silent again.",
    visual: (
      <div style={{ background: "#E5DDD5", borderRadius: 18, overflow: "hidden" }}>
        {/* Header */}
        <div style={{ background: "#075E54", padding: "11px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#25D366", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>MyHandle</div>
            <div style={{ fontSize: 11, color: "#B2DFDB" }}>online</div>
          </div>
        </div>
        {/* Chat body */}
        <div style={{ padding: "12px 10px 14px" }}>
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{
              background: "#fff", borderRadius: "16px 16px 16px 4px",
              maxWidth: "82%", boxShadow: "0 1px 3px rgba(0,0,0,.08)",
              overflow: "hidden",
            }}>
              <div style={{ padding: "10px 14px 6px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", lineHeight: 1.5, marginBottom: 3 }}>Production API is Down</div>
                <div style={{ fontSize: 12, color: "#111827", lineHeight: 1.5, marginBottom: 3 }}>Error: <span style={{ color: "#D97706" }}>500 Internal Server Error.</span></div>
                <div style={{ fontSize: 12, color: "#111827", lineHeight: 1.5, marginBottom: 3 }}>Component: <span style={{ color: "#D97706" }}>Auth Service</span></div>
                <div style={{ fontSize: 12, color: "#111827", lineHeight: 1.5 }}>Current Status: <span style={{ color: "#D97706" }}>Down</span></div>
                <div style={{ fontSize: 10, color: "#8CA49B", marginTop: 5, textAlign: "right" }}>2:47 AM</div>
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
        </div>
      </div>
    ),
    accent: "#86EFAC", numColor: "#22C55E", numBg: "rgba(34,197,94,.1)",
  },
];

export default function ThreeBlockPage() {
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
    <section id="how-it-works" style={{
      background: "#FDFCF8",
      padding: isMobile ? "72px 20px 64px" : "108px 60px 88px",
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      <div style={{ maxWidth: 1060, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ textAlign: isMobile ? "left" : "center", marginBottom: isMobile ? 44 : 68 }}>
          <p style={{
            fontSize: 13, fontWeight: 600, color: "#92722A",
            margin: "0 0 14px", letterSpacing: "0.01em",
          }}>How it works</p>

          <h2 style={{
            fontSize: isMobile ? "clamp(1.9rem,7vw,2.5rem)" : "clamp(2.4rem,4vw,3.4rem)",
            fontWeight: 800, letterSpacing: "-0.04em",
            color: "#0F172A", lineHeight: 1.12, margin: "0 0 16px",
          }}>
            From zero to woken up in 5 minutes.
          </h2>
          <p style={{
            fontSize: isMobile ? ".95rem" : "1.05rem",
            color: "#64748B", lineHeight: 1.68, maxWidth: 480, margin: "0 auto",
          }}>
            No Meta API approval. No WhatsApp business setup. No engineering sprint. Just paste and go.
          </p>
        </div>

        {/* Steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 16 : 20 }}>
          {STEPS.map((step, i) => (
            <div key={i} style={{
              display: "flex",
              flexDirection: isMobile ? "column" : i % 2 === 0 ? "row" : "row-reverse",
              gap: isMobile ? 22 : 56,
              alignItems: "center",
              background: "#fff",
              borderRadius: 26,
              padding: isMobile ? "30px 22px" : "40px 44px",
              border: "1.5px solid #F1F5F9",
              boxShadow: "0 4px 20px -4px rgba(0,0,0,.06)",
            }}>
              {/* Text side */}
              <div style={{ flex: "0 0 auto", width: isMobile ? "100%" : "44%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
                  {/* Step number pill */}
                  <div style={{
                    width: 36, height: 36, borderRadius: 12,
                    background: step.numBg,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 800, color: step.numColor,
                    letterSpacing: ".02em", flexShrink: 0,
                  }}>
                    {step.number}
                  </div>
                  <div style={{
                    background: "#F8FAFC", border: "1px solid #E2E8F0",
                    borderRadius: 50, padding: "3px 12px",
                    fontSize: 11, fontWeight: 700, color: "#64748B",
                    letterSpacing: ".02em",
                  }}>{step.label}</div>
                </div>

                <h3 style={{
                  fontSize: isMobile ? "1.2rem" : "1.45rem",
                  fontWeight: 800, color: "#0F172A", lineHeight: 1.22,
                  letterSpacing: "-0.025em", margin: "0 0 10px",
                }}>{step.headline}</h3>
                <p style={{
                  fontSize: isMobile ? ".9rem" : ".97rem",
                  color: "#64748B", lineHeight: 1.68, margin: "0 0 14px",
                }}>{step.sub}</p>
                <p style={{
                  fontSize: isMobile ? ".83rem" : ".88rem",
                  color: "#94A3B8", lineHeight: 1.6, margin: 0,
                  paddingLeft: 14,
                  borderLeft: `2.5px solid ${step.accent}`,
                }}>{step.detail}</p>
              </div>

              {/* Visual side */}
              <div style={{ flex: 1, width: "100%", minWidth: 0 }}>
                {step.visual}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div style={{
          marginTop: isMobile ? 40 : 56,
          textAlign: "center",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
        }}>
          <button
            onClick={() => { trackCTA("howto_get_webhook", "how_it_works"); navigate("/professional/login"); }}
            style={{
              background: "#0A0A0A", color: "#fff",
              fontSize: 15, fontWeight: 700,
              padding: "17px 44px", borderRadius: 24,
              border: "none", cursor: "pointer",
              boxShadow: "0 8px 24px rgba(0,0,0,.14)",
              transition: "all .2s ease",
              letterSpacing: "-.01em",
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 16px 40px rgba(0,0,0,.2)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,.14)"; }}
          >
            Start for Free →
          </button>
          <span style={{ fontSize: 13, color: "#94A3B8" }}>No credit card · No template approval is Req.</span>
        </div>

      </div>
    </section>
  );
}

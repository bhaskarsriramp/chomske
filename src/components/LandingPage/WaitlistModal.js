import { useState, useEffect, useRef } from "react";

const PRICE_TIERS = [
  { amount: 49,  label: "Per month." },
  { amount: 99,  label: "Per month." },
  { amount: 149, label: "Per month." },
];

const CONFETTI_COLORS = ["#6366F1","#F59E0B","#10B981","#EF4444","#3B82F6","#EC4899","#A78BFA","#FBBF24"];

function ConfettiCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const pieces = Array.from({ length: 72 }, (_, i) => ({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height * 0.6,
      w: Math.random() * 9 + 5,
      h: Math.random() * 5 + 3,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.18,
      vx: (Math.random() - 0.5) * 1.8,
      vy: Math.random() * 3 + 2.2,
      shape: i % 3,
    }));

    const startTime = Date.now();
    let animId;

    const draw = () => {
      const elapsed = Date.now() - startTime;
      const fadeAlpha = elapsed > 2800 ? Math.max(0, 1 - (elapsed - 2800) / 700) : 1;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = fadeAlpha;

      pieces.forEach(p => {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        if (p.shape === 0) {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        } else if (p.shape === 1) {
          ctx.beginPath();
          ctx.ellipse(0, 0, p.w / 2, p.h / 2, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(-p.w / 2, 0);
          ctx.lineTo(0, -p.h);
          ctx.lineTo(p.w / 2, 0);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();

        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotSpeed;

        if (p.y > canvas.height + 20) {
          p.y = -20;
          p.x = Math.random() * canvas.width;
        }
      });

      if (elapsed < 3500) {
        animId = requestAnimationFrame(draw);
      }
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
    />
  );
}

function PriceTile({ tier, selected, onSelect }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        padding: "12px 8px 10px",
        borderRadius: 11,
        border: `1.5px solid ${selected ? "#6366F1" : hovered ? "#C7D2FE" : "#E2E8F0"}`,
        background: selected ? "#EEF2FF" : hovered ? "#F5F7FF" : "#fff",
        cursor: "pointer",
        transition: "all 0.15s ease",
        fontFamily: "inherit",
        textAlign: "center",
      }}
    >
      {tier.popular && (
        <div style={{
          position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)",
          background: "#6366F1", color: "#fff",
          fontSize: 8.5, fontWeight: 700, letterSpacing: "0.04em",
          padding: "2px 7px", borderRadius: 20,
          whiteSpace: "nowrap",
        }}>Popular</div>
      )}
      <div style={{
        fontSize: 20, fontWeight: 800,
        color: selected ? "#4F46E5" : "#0F172A",
        lineHeight: 1, marginBottom: 2,
        transition: "color 0.15s",
      }}>
        ${tier.amount}
      </div>
      <div style={{
        fontSize: 9, color: selected ? "#818CF8" : "#B4BEC8",
        fontWeight: 500, lineHeight: 1.3,
      }}>
        {tier.label}
      </div>
    </button>
  );
}

export default function WaitlistModal({ onClose }) {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [price, setPrice] = useState(null);
  const [transitioning, setTransitioning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const emailValid = email.length <= 254 && email.includes("@") && email.includes(".");

  const goNext = () => {
    if (!emailValid) return;
    setTransitioning(true);
    setTimeout(() => { setStep(2); setTransitioning(false); }, 220);
  };

  const goBack = () => {
    setSubmitError("");
    setTransitioning(true);
    setTimeout(() => { setStep(1); setTransitioning(false); }, 220);
  };

  const handleSubmit = async () => {
    if (!price || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/usersOn/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), pricing: price }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Something went wrong. Please try again.");
      }
      setTransitioning(true);
      setTimeout(() => { setStep(3); setTransitioning(false); }, 220);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const isSuccess = step === 3;

  return (
    <>
      <style>{`
        @keyframes wlCircleIn { to { stroke-dashoffset: 0; } }
        @keyframes wlCheckIn  { to { stroke-dashoffset: 0; } }
        @keyframes wlFillIn   { to { opacity: 1; } }
        @keyframes wlFadeUp   { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(15,23,42,0.55)",
          backdropFilter: "blur(10px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20,
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: "#fff",
            borderRadius: 24,
            padding: isSuccess ? "48px 32px 44px" : "36px 32px 32px",
            width: "100%",
            maxWidth: 420,
            boxShadow: "0 40px 80px -20px rgba(15,23,42,0.32), 0 0 0 1px rgba(15,23,42,0.06)",
            position: "relative",
            overflow: "hidden",
            opacity: transitioning ? 0 : 1,
            transform: transitioning ? "translateY(8px) scale(0.98)" : "translateY(0) scale(1)",
            transition: "opacity 0.22s ease, transform 0.22s ease, padding 0.3s ease",
            textAlign: isSuccess ? "center" : "left",
          }}
        >
          {isSuccess && <ConfettiCanvas />}

          <button
            onClick={onClose}
            style={{
              position: "absolute", top: 14, right: 14, zIndex: 10,
              background: isSuccess ? "rgba(255,255,255,0.7)" : "#F1F5F9",
              border: "none", cursor: "pointer",
              width: 28, height: 28, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, color: "#64748B", lineHeight: 1,
              backdropFilter: "blur(4px)",
            }}
          >×</button>

          {!isSuccess && (
            <div style={{ display: "flex", gap: 5, marginBottom: 28 }}>
              {[1, 2].map(s => (
                <div key={s} style={{
                  height: 4, borderRadius: 2,
                  width: s === step ? 28 : 14,
                  background: s <= step ? "#6366F1" : "#E2E8F0",
                  transition: "all 0.3s ease",
                }} />
              ))}
            </div>
          )}

          {step === 1 && (
            <div>
              <div style={{ fontSize: 28, marginBottom: 12 }}>✉️</div>
              <h2 style={{
                fontSize: 21, fontWeight: 800, color: "#0F172A",
                margin: "0 0 6px", letterSpacing: "-0.02em", lineHeight: 1.25,
              }}>
                Where should we drop<br />your early access?
              </h2>
              <p style={{ fontSize: 13, color: "#94A3B8", margin: "0 0 24px", lineHeight: 1.6 }}>
                We'll reach out the moment Chomske is ready for you.
              </p>
              <div style={{ position: "relative", marginBottom: 12 }}>
                <input
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  maxLength={254}
                  onKeyDown={e => e.key === "Enter" && goNext()}
                  autoFocus
                  style={{
                    width: "100%", boxSizing: "border-box",
                    padding: "13px 16px",
                    fontSize: 15, borderRadius: 11,
                    border: "1.5px solid #E2E8F0",
                    outline: "none", color: "#0F172A",
                    fontFamily: "inherit",
                    transition: "border-color 0.15s",
                    background: "#FAFAFA",
                  }}
                  onFocus={e => e.target.style.borderColor = "#6366F1"}
                  onBlur={e => e.target.style.borderColor = "#E2E8F0"}
                />
              </div>
              <button
                onClick={goNext}
                disabled={!emailValid}
                style={{
                  width: "100%",
                  background: emailValid ? "#0F172A" : "#F1F5F9",
                  color: emailValid ? "#fff" : "#CBD5E1",
                  fontSize: 15, fontWeight: 700,
                  padding: "13px", borderRadius: 11, border: "none",
                  cursor: emailValid ? "pointer" : "not-allowed",
                  transition: "all 0.2s ease",
                  fontFamily: "inherit",
                  letterSpacing: "-0.01em",
                }}
              >
                Continue →
              </button>
            </div>
          )}

          {step === 2 && (
            <div>
              <div style={{ fontSize: 28, marginBottom: 12 }}>💵</div>
              <h2 style={{
                fontSize: 21, fontWeight: 800, color: "#0F172A",
                margin: "0 0 6px", letterSpacing: "-0.02em", lineHeight: 1.25,
              }}>
                Help us set the right price
              </h2>
              <p style={{ fontSize: 13, color: "#94A3B8", margin: "0 0 6px", lineHeight: 1.6 }}>
                What would you comfortably pay once we launch?
              </p>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                background: "#F0FDF4", border: "1px solid #BBF7D0",
                borderRadius: 6, padding: "4px 10px", marginBottom: 20,
              }}>
                <span style={{ fontSize: 11, color: "#16A34A", fontWeight: 600 }}>
                  You are not being charged, this is purely for research.
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
                {PRICE_TIERS.map(tier => (
                  <PriceTile key={tier.amount} tier={tier} selected={price === tier.amount} onSelect={() => setPrice(tier.amount)} />
                ))}
              </div>
              {submitError && (
                <div style={{
                  marginBottom: 10, padding: "9px 13px",
                  background: "#FFF1F2", border: "1px solid #FECDD3",
                  borderRadius: 8, fontSize: 12.5, color: "#BE123C", fontWeight: 500,
                }}>
                  {submitError}
                </div>
              )}
              <button
                onClick={handleSubmit}
                disabled={!price || submitting}
                style={{
                  width: "100%",
                  background: price && !submitting ? "#0F172A" : "#F1F5F9",
                  color: price && !submitting ? "#fff" : "#CBD5E1",
                  fontSize: 15, fontWeight: 700,
                  padding: "13px", borderRadius: 11, border: "none",
                  cursor: price && !submitting ? "pointer" : "not-allowed",
                  transition: "all 0.2s ease",
                  marginBottom: 8,
                  fontFamily: "inherit",
                  letterSpacing: "-0.01em",
                }}
              >
                {submitting ? "Saving…" : "Claim my spot"}
              </button>
              <button
                onClick={goBack}
                style={{
                  width: "100%", background: "none", border: "none",
                  color: "#94A3B8", fontSize: 13, cursor: "pointer",
                  padding: "6px", fontFamily: "inherit",
                }}
              >
                ← Back
              </button>
            </div>
          )}

          {step === 3 && (
            <div style={{ position: "relative", zIndex: 2 }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
                <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
                  <circle
                    cx="36" cy="36" r="30"
                    stroke="#6366F1" strokeWidth="2.5"
                    strokeDasharray="188.5" strokeDashoffset="188.5"
                    style={{ animation: "wlCircleIn 0.65s cubic-bezier(0.65,0,0.45,1) 0.1s forwards" }}
                  />
                  <circle
                    cx="36" cy="36" r="30"
                    fill="#EEF2FF"
                    style={{ animation: "wlFillIn 0.3s ease 0.7s both" }}
                    opacity="0"
                  />
                  <polyline
                    points="22,36 31,45 50,26"
                    stroke="#6366F1" strokeWidth="3.5"
                    strokeLinecap="round" strokeLinejoin="round"
                    strokeDasharray="44" strokeDashoffset="44"
                    style={{ animation: "wlCheckIn 0.4s cubic-bezier(0.65,0,0.45,1) 0.65s forwards" }}
                  />
                </svg>
              </div>

              <h2 style={{
                fontSize: 24, fontWeight: 800, color: "#0F172A",
                margin: "0 0 10px", letterSpacing: "-0.02em", lineHeight: 1.2,
                animation: "wlFadeUp 0.5s ease 0.8s both",
              }}>
                You're officially in!
              </h2>

              <p style={{
                fontSize: 14, color: "#475569", lineHeight: 1.7,
                margin: "0 0 24px", maxWidth: 300, marginLeft: "auto", marginRight: "auto",
                animation: "wlFadeUp 0.5s ease 0.95s both",
              }}>
                We've enrolled you in the Chomske beta. Early access will drop
                directly to <strong style={{ color: "#0F172A" }}>{email}</strong>{" "}
                we can't wait to show you what we've built.
              </p>

              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "#F8FAFF", border: "1px solid #C7D2FE",
                borderRadius: 10, padding: "10px 16px",
                animation: "wlFadeUp 0.5s ease 1.1s both",
              }}>
                <span style={{ fontSize: 16 }}>🔔</span>
                <span style={{ fontSize: 12.5, color: "#4F46E5", fontWeight: 600 }}>
                  We'll notify you before anyone else.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

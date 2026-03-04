import { useState, useEffect } from "react";

export default function WhatIfSection() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width:900px)").matches
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setIsMobile(window.matchMedia("(max-width:900px)").matches);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <section style={{
      background: "linear-gradient(180deg, #F8FAFC 0%, #F0EDFF 50%, #F8FAFC 100%)",
      padding: isMobile ? "64px 20px 56px" : "120px 60px 100px",
      fontFamily: "'Inter', sans-serif",
      position: "relative",
    }}>
      <style>{`
        .process-step { transition: all 0.3s ease; }
        .process-step:hover { transform: translateY(-4px); box-shadow: 0 16px 40px -8px rgba(0,0,0,0.1); }
      `}</style>

      {/* Soft glow */}
      <div style={{
        position: "absolute", top: "30%", left: "50%", transform: "translateX(-50%)",
        width: isMobile ? 300 : 600, height: isMobile ? 200 : 400,
        background: "radial-gradient(circle, rgba(124,58,237,0.06) 0%, transparent 70%)",
        filter: "blur(60px)", pointerEvents: "none",
      }} />

      <div style={{ maxWidth: 800, margin: "0 auto", position: "relative", zIndex: 1 }}>

        {/* Headline */}
        <div style={{ textAlign: "center", marginBottom: isMobile ? 36 : 56 }}>
          <h2 style={{
            fontSize: isMobile ? "clamp(1.7rem, 7vw, 2.4rem)" : "clamp(2.8rem, 4.5vw, 3.5rem)",
            fontWeight: 800, lineHeight: 1.08, letterSpacing: "-0.04em",
            color: "#0F172A", marginBottom: isMobile ? 14 : 18,
          }}>
            What if only{" "}
            <span style={{
              background: "linear-gradient(135deg, #FF2DD1 0%, #7C3AED 50%, #4F46E5 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>serious buyers</span>{" "}
            reached you?
          </h2>
          <p style={{
            fontSize: isMobile ? "0.9rem" : "1.15rem",
            color: "#64748B", lineHeight: 1.7, maxWidth: 480, margin: "0 auto", fontWeight: 400,
            padding: isMobile ? "0 8px" : 0,
          }}>
            Here's how MyHandle works — in 3 simple steps.
          </p>
        </div>

        {/* Process Pipeline */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: isMobile ? 16 : 24,
          position: "relative",
        }}>

          {/* ====== STEP 1: DM comes in ====== */}
          <div className="process-step" style={{
            background: "#FFFFFF",
            border: "1.5px solid #DDD6FE",
            borderRadius: isMobile ? 18 : 22,
            padding: isMobile ? "24px 20px" : "32px 36px",
            boxShadow: "0 4px 20px -4px rgba(0,0,0,0.04)",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10, marginBottom: isMobile ? 14 : 18,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 800, color: "#7C3AED",
                background: "#F5F3FF", border: "1px solid #DDD6FE",
                padding: "3px 12px", borderRadius: 50,
                textTransform: "uppercase", letterSpacing: "0.08em",
              }}>Step 1</span>
              <h3 style={{
                margin: 0, fontSize: isMobile ? 17 : 20,
                fontWeight: 800, color: "#0F172A", letterSpacing: "-0.02em",
              }}>
                DM comes in
              </h3>
            </div>

            {/* Mini DM mockup */}
            <div style={{
              background: "#FAFAFA", borderRadius: isMobile ? 12 : 16,
              border: "1px solid #E5E7EB",
              overflow: "hidden",
            }}>
              {/* Mini header */}
              <div style={{
                padding: isMobile ? "8px 14px" : "10px 18px",
                background: "#1E1E1E",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E4405F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="5" /></svg>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#FFFFFF" }}>Direct Messages</span>
                <div style={{
                  marginLeft: "auto", background: "#EF4444", borderRadius: 50,
                  padding: "1px 7px", fontSize: 9, fontWeight: 800, color: "#FFF",
                }}>89</div>
              </div>
              {/* DM items */}
              <div style={{ padding: isMobile ? "4px 12px" : "6px 16px" }}>
                {[
                  { name: "Ravi K.", msg: "What's the price for coaching?", hot: true },
                  { name: "spam_bot", msg: "Get 10K followers fast!! 🚀🚀", hot: false },
                  { name: "Priya M.", msg: "Do you offer 1:1 training?", hot: true },
                  { name: "random_guy", msg: "Nice post bro 🔥", hot: false },
                ].map((dm, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: isMobile ? 8 : 10,
                    padding: isMobile ? "8px 0" : "9px 0",
                    borderBottom: i < 3 ? "1px solid #F1F1F1" : "none",
                    opacity: dm.hot ? 1 : 0.35,
                  }}>
                    <div style={{
                      width: isMobile ? 28 : 32, height: isMobile ? 28 : 32, borderRadius: "50%",
                      background: dm.hot ? "linear-gradient(135deg, #7C3AED, #6D28D9)" : "#D1D5DB",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: isMobile ? 11 : 12, fontWeight: 700, color: "#FFF", flexShrink: 0,
                    }}>{dm.name[0]}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: isMobile ? 11 : 12, fontWeight: dm.hot ? 700 : 500, color: dm.hot ? "#0F172A" : "#9CA3AF" }}>{dm.name}</div>
                      <div style={{ fontSize: isMobile ? 10 : 11, color: dm.hot ? "#475569" : "#CBD5E1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{dm.msg}</div>
                    </div>
                    {dm.hot && <div style={{
                      width: 7, height: 7, borderRadius: "50%", background: "#7C3AED", flexShrink: 0,
                    }} />}
                  </div>
                ))}
              </div>
            </div>
            <p style={{
              margin: isMobile ? "12px 0 0" : "16px 0 0", fontSize: isMobile ? 12 : 14,
              color: "#64748B", lineHeight: 1.6,
            }}>
              Someone DMs you after your reel. MyHandle reads it instantly — even at 3 AM.
            </p>
          </div>

          {/* Connector arrow */}
          <div style={{ display: "flex", justifyContent: "center", margin: isMobile ? "-6px 0" : "-8px 0" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C4B5FD" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
            </svg>
          </div>

          {/* ====== STEP 2: AI scores intent ====== */}
          <div className="process-step" style={{
            background: "#FFFFFF",
            border: "1.5px solid #BFDBFE",
            borderRadius: isMobile ? 18 : 22,
            padding: isMobile ? "24px 20px" : "32px 36px",
            boxShadow: "0 4px 20px -4px rgba(0,0,0,0.04)",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10, marginBottom: isMobile ? 14 : 18,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 800, color: "#2563EB",
                background: "#EFF6FF", border: "1px solid #BFDBFE",
                padding: "3px 12px", borderRadius: 50,
                textTransform: "uppercase", letterSpacing: "0.08em",
              }}>Step 2</span>
              <h3 style={{
                margin: 0, fontSize: isMobile ? 17 : 20,
                fontWeight: 800, color: "#0F172A", letterSpacing: "-0.02em",
              }}>
                AI scores intent
              </h3>
            </div>

            {/* Scoring mockup */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: isMobile ? 10 : 14,
            }}>
              {/* High intent */}
              <div style={{
                background: "#F0FDF4", border: "1.5px solid #86EFAC",
                borderRadius: isMobile ? 12 : 14, padding: isMobile ? "14px 12px" : "18px 16px",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 6, marginBottom: isMobile ? 8 : 10,
                }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%", background: "#22C55E",
                    boxShadow: "0 0 8px rgba(34,197,94,0.4)",
                  }} />
                  <span style={{ fontSize: isMobile ? 10 : 11, fontWeight: 800, color: "#16A34A", textTransform: "uppercase", letterSpacing: "0.05em" }}>High Intent</span>
                </div>
                <div style={{ fontSize: isMobile ? 11 : 13, fontWeight: 600, color: "#0F172A", marginBottom: 4 }}>
                  "Price for coaching?"
                </div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  {/* Score bar */}
                  <div style={{ flex: 1, height: 5, borderRadius: 4, background: "#DCFCE7", overflow: "hidden" }}>
                    <div style={{ width: "92%", height: "100%", borderRadius: 4, background: "linear-gradient(90deg, #22C55E, #16A34A)" }} />
                  </div>
                  <span style={{ fontSize: isMobile ? 10 : 11, fontWeight: 800, color: "#16A34A" }}>92%</span>
                </div>
              </div>

              {/* Spam */}
              <div style={{
                background: "#FEF2F2", border: "1.5px solid #FECACA",
                borderRadius: isMobile ? 12 : 14, padding: isMobile ? "14px 12px" : "18px 16px",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 6, marginBottom: isMobile ? 8 : 10,
                }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%", background: "#EF4444",
                  }} />
                  <span style={{ fontSize: isMobile ? 10 : 11, fontWeight: 800, color: "#DC2626", textTransform: "uppercase", letterSpacing: "0.05em" }}>Spam</span>
                </div>
                <div style={{ fontSize: isMobile ? 11 : 13, fontWeight: 600, color: "#6B7280", marginBottom: 4, textDecoration: "line-through", textDecorationColor: "#FECACA" }}>
                  "Nice post bro"
                </div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  <div style={{ flex: 1, height: 5, borderRadius: 4, background: "#FEE2E2", overflow: "hidden" }}>
                    <div style={{ width: "12%", height: "100%", borderRadius: 4, background: "#EF4444" }} />
                  </div>
                  <span style={{ fontSize: isMobile ? 10 : 11, fontWeight: 800, color: "#EF4444" }}>12%</span>
                </div>
              </div>
            </div>
            <p style={{
              margin: isMobile ? "12px 0 0" : "16px 0 0", fontSize: isMobile ? 12 : 14,
              color: "#64748B", lineHeight: 1.6,
            }}>
              MyHandle's AI reads every DM and scores buyer intent. Spam gets filtered. Real buyers get flagged.
            </p>
          </div>

          {/* Connector arrow */}
          <div style={{ display: "flex", justifyContent: "center", margin: isMobile ? "-6px 0" : "-8px 0" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#93C5FD" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
            </svg>
          </div>

          {/* ====== STEP 3: WhatsApp alert ====== */}
          <div className="process-step" style={{
            background: "#FFFFFF",
            border: "1.5px solid #BBF7D0",
            borderRadius: isMobile ? 18 : 22,
            padding: isMobile ? "24px 20px" : "32px 36px",
            boxShadow: "0 4px 20px -4px rgba(0,0,0,0.04)",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10, marginBottom: isMobile ? 14 : 18,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 800, color: "#16A34A",
                background: "#F0FDF4", border: "1px solid #BBF7D0",
                padding: "3px 12px", borderRadius: 50,
                textTransform: "uppercase", letterSpacing: "0.08em",
              }}>Step 3</span>
              <h3 style={{
                margin: 0, fontSize: isMobile ? 17 : 20,
                fontWeight: 800, color: "#0F172A", letterSpacing: "-0.02em",
              }}>
                You get a WhatsApp alert
              </h3>
            </div>

            {/* WhatsApp notification mockup */}
            <div style={{
              background: "#075E54", borderRadius: isMobile ? 12 : 16,
              overflow: "hidden",
            }}>
              {/* WA header */}
              <div style={{
                padding: isMobile ? "8px 14px" : "10px 18px",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#FFFFFF" }}>MyHandle Bot</span>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", marginLeft: "auto" }}>just now</span>
              </div>
              {/* Lead card inside WA */}
              <div style={{ padding: isMobile ? "0 10px 10px" : "0 14px 14px" }}>
                <div style={{
                  background: "#FFFFFF", borderRadius: isMobile ? 10 : 12,
                  padding: isMobile ? "14px 12px" : "16px 18px",
                }}>
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    marginBottom: isMobile ? 8 : 10,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{
                        width: isMobile ? 28 : 32, height: isMobile ? 28 : 32, borderRadius: "50%",
                        background: "linear-gradient(135deg, #7C3AED, #6D28D9)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: isMobile ? 11 : 13, fontWeight: 700, color: "#FFF",
                      }}>R</div>
                      <div>
                        <div style={{ fontSize: isMobile ? 12 : 14, fontWeight: 700, color: "#0F172A" }}>Ravi K.</div>
                        <div style={{ fontSize: isMobile ? 9 : 10, color: "#9CA3AF" }}>via Instagram DM</div>
                      </div>
                    </div>
                    <div style={{
                      background: "#DCFCE7", border: "1px solid #86EFAC",
                      borderRadius: 6, padding: isMobile ? "3px 8px" : "4px 10px",
                      fontSize: isMobile ? 10 : 11, fontWeight: 800, color: "#15803D",
                    }}>98% intent</div>
                  </div>

                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: isMobile ? 6 : 8,
                    fontSize: isMobile ? 10 : 12,
                  }}>
                    {[
                      { label: "Goal", value: "Fat loss coaching" },
                      { label: "Budget", value: "₹50,000" },
                      { label: "Timeline", value: "Starting next week" },
                      { label: "Source", value: "Reel comment" },
                    ].map((item, i) => (
                      <div key={i} style={{
                        background: "#F8FAFC", borderRadius: 6,
                        padding: isMobile ? "6px 8px" : "8px 10px",
                      }}>
                        <div style={{ fontSize: isMobile ? 9 : 10, color: "#94A3B8", fontWeight: 600, marginBottom: 2 }}>{item.label}</div>
                        <div style={{ fontWeight: 700, color: "#334155" }}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <p style={{
              margin: isMobile ? "12px 0 0" : "16px 0 0", fontSize: isMobile ? 12 : 14,
              color: "#64748B", lineHeight: 1.6,
            }}>
              Only qualified leads reach your WhatsApp — with name, goal, budget, and intent score. Reply in 2 minutes, close the deal.
            </p>
          </div>
        </div>

        {/* Result callout */}
        <div style={{
          marginTop: isMobile ? 32 : 48,
          background: "linear-gradient(135deg, #EEF2FF 0%, #F5F3FF 50%, #FAF5FF 100%)",
          border: "1px solid #E0E7FF",
          borderRadius: isMobile ? 16 : 20,
          padding: isMobile ? "22px 20px" : "32px 40px",
          textAlign: "center",
          boxShadow: "0 4px 20px -4px rgba(79,70,229,0.06)",
        }}>
          <p style={{
            margin: 0, fontSize: isMobile ? 14 : 17, lineHeight: 1.75,
            color: "#475569", fontWeight: 450,
          }}>
            <span style={{ fontWeight: 700, color: "#4F46E5" }}>Zero setup. Zero effort.</span> Connect your Instagram, and MyHandle starts reading every DM 24/7. You just close deals.
          </p>
        </div>
      </div>
    </section>
  );
}

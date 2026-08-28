import { useEffect, useState } from "react";

// Custom SVG Icon Component
const Icon = ({ d, size = 24, color = "currentColor", strokeWidth = 2 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {Array.isArray(d) ? d.map((path, i) => <path key={i} d={path} />) : <path d={d} />}
  </svg>
);

// Icon definitions
const icons = {
  share: "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13",
  trendingUp: "M23 6l-9.5 9.5-5-5L1 18",
  flash: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  instagram: ["M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z", "M17.5 6.5h.01M6 2h12a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4z"],
  youtube: "M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33zM9.75 15.02l0-6.59 5.75 3.3z",
  linkedin: "M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2z M4 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4z",
  qrCode: "M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M8 7h1M8 12h1M12 7h1M12 12h1M16 7h1M16 12h1M7 16h1M12 16h1M16 16h1",
  creditCard: "M21 4H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM1 10h22",
  mail: "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6",
  link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  globe: "M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20z M2 12h20 M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
  barChart: "M18 20V10M12 20V4M6 20v-6",
  sparkles: "M12 2L15 8.5L22 12L15 15.5L12 22L9 15.5L2 12L9 8.5L12 2z M5 3v4M3 5h4M19 17v4M17 19h4",
  arrowRight: "M5 12h14M12 5l7 7-7 7",
};

const ShareIcon = (props) => <Icon d={icons.share} {...props} />;
const TrendingUpIcon = (props) => <Icon d={icons.trendingUp} {...props} />;
const FlashOnIcon = (props) => <Icon d={icons.flash} {...props} />;
const InstagramIcon = (props) => <Icon d={icons.instagram} {...props} />;
const YouTubeIcon = (props) => <Icon d={icons.youtube} {...props} />;
const LinkedInIcon = (props) => <Icon d={icons.linkedin} {...props} />;
const QrCodeIcon = (props) => <Icon d={icons.qrCode} {...props} />;
const CreditCardIcon = (props) => <Icon d={icons.creditCard} {...props} />;
const MailIcon = (props) => <Icon d={icons.mail} {...props} />;
const LinkIcon = (props) => <Icon d={icons.link} {...props} />;
const LanguageIcon = (props) => <Icon d={icons.globe} {...props} />;
const BarChartIcon = (props) => <Icon d={icons.barChart} {...props} />;
const AutoAwesomeIcon = (props) => <Icon d={icons.sparkles} {...props} />;
const ArrowForwardIcon = (props) => <Icon d={icons.arrowRight} {...props} />;

export default function ThreeBlockPage() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" && window.matchMedia("(max-width:900px)").matches
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width:900px)");
    const handler = (e) => setIsMobile(e.matches);
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else mq.addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", handler);
      else mq.removeListener(handler);
    };
  }, []);

  // Section 1: Platform Showcase with animated cards
  const Section1 = () => {
    const platforms = [
      { icon: InstagramIcon, name: "Instagram", users: "2B+", color: "#E1306C", gradient: "linear-gradient(45deg, #E1306C, #FD1D1D)" },
      { icon: YouTubeIcon, name: "YouTube", users: "2B+", color: "#FF0000", gradient: "linear-gradient(45deg, #FF0000, #FF4500)" },
      { icon: LinkedInIcon, name: "LinkedIn", users: "900M+", color: "#0A66C2", gradient: "linear-gradient(45deg, #0A66C2, #0077B5)" },
      { icon: LanguageIcon, name: "Web", users: "∞", color: "#10B981", gradient: "linear-gradient(45deg, #10B981, #059669)" },
    ];

    return (
      <div style={{
        background: "linear-gradient(145deg, #6D0011 0%, #450009 50%, #1a0003 100%)",
        padding: isMobile ? "80px 24px" : "120px 48px",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Animated background elements */}
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "radial-gradient(circle at 20% 50%, rgba(225, 48, 108, 0.15) 0%, transparent 50%), radial-gradient(circle at 80% 50%, rgba(255, 0, 0, 0.15) 0%, transparent 50%)",
          pointerEvents: "none",
        }} />

        <div style={{
          maxWidth: 1280,
          margin: "0 auto",
          position: "relative",
          zIndex: 2,
        }}>
          <div style={{
            textAlign: "center",
            marginBottom: isMobile ? "48px" : "64px",
          }}>
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: "100px",
              padding: "8px 20px",
              marginBottom: "24px",
            }}>
              <AutoAwesomeIcon size={16} color="#FFF" />
              <span style={{ fontSize: 14, fontWeight: 600, color: "#FFF" }}>One Link, Infinite Reach</span>
            </div>
            
            <h2 style={{
              fontSize: isMobile ? "clamp(2rem, 8vw, 3.5rem)" : "clamp(3rem, 6vw, 4rem)",
              lineHeight: 1.1,
              fontWeight: 900,
              letterSpacing: "-0.04em",
              margin: "0 0 24px 0",
              background: "linear-gradient(135deg, #FFFFFF 0%, #FFB6C1 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              textAlign: 'left'
            }}>
              Share everywhere,<br />manage from one place
            </h2>
            
            <p style={{
              fontSize: isMobile ? "1.15rem" : "1.4rem",
              lineHeight: 1.6,
              color: "rgba(255,255,255,0.8)",
              maxWidth: 680,
              margin: "0 auto 40px",
              textAlign: 'left'

            }}>
              Drop your MyHandle link across every platform. Update once, it's live everywhere, from Instagram bios to YouTube descriptions to offline QR codes.
            </p>

           
          </div>

          {/* Platform cards */}
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
            gap: isMobile ? "16px" : "24px",
            marginTop: "64px",
          }}>
            {platforms.map((p, i) => (
              <div
                key={i}
                style={{
                  background: "rgba(255,255,255,0.05)",
                  backdropFilter: "blur(20px)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 20,
                  padding: isMobile ? "24px 16px" : "32px 24px",
                  textAlign: "center",
                  transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.12)";
                  e.currentTarget.style.transform = "translateY(-8px) rotate(1deg)";
                  e.currentTarget.style.borderColor = p.color + "66";
                  e.currentTarget.style.boxShadow = `0 20px 60px ${p.color}44`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                  e.currentTarget.style.transform = "translateY(0) rotate(0deg)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div style={{
                  width: 64,
                  height: 64,
                  borderRadius: 16,
                  background: p.gradient,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px",
                  boxShadow: `0 8px 32px ${p.color}44`,
                }}>
                  <p.icon size={32} color="white" strokeWidth={2} />
                </div>
                <h4 style={{ fontSize: 18, fontWeight: 700, color: "#FFF", margin: "0 0 8px" }}>{p.name}</h4>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", margin: 0 }}>{p.users} users</p>
              </div>
            ))}
          </div>

        </div>
      </div>
    );
  };

  // Section 2: Conversion Dashboard Preview
  const Section2 = () => {
    const stats = [
      { label: "Payment Links", value: "350+", icon: CreditCardIcon, color: "#10B981" },
      { label: "Email Captures", value: "12K", icon: MailIcon, color: "#F59E0B" },
      { label: "Click Rate", value: "94%", icon: BarChartIcon, color: "#3B82F6" },
    ];

    return (
      <div style={{
        background: "linear-gradient(180deg, #0F172A 0%, #1E293B 100%)",
        padding: isMobile ? "80px 24px" : "140px 48px",
        position: "relative",
      }}>
        <div style={{
          maxWidth: 1280,
          margin: "0 auto",
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: "center",
          gap: isMobile ? "48px" : "80px",
        }}>
          {/* Left: Stats Dashboard */}
          <div style={{ flex: "1 1 50%", width: "100%" }}>
            <div style={{
              background: "linear-gradient(145deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              borderRadius: 24,
              padding: isMobile ? "32px 24px" : "48px 40px",
              boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
              position: "relative",
            }}>
              <div style={{
                position: "absolute",
                top: -12,
                left: 40,
                background: "linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)",
                padding: "8px 20px",
                borderRadius: 100,
                fontSize: 13,
                fontWeight: 700,
                color: "#FFF",
                boxShadow: "0 8px 24px rgba(59, 130, 246, 0.4)",
              }}>
                Live Dashboard
              </div>

              <h3 style={{
                fontSize: isMobile ? "1.8rem" : "2.4rem",
                fontWeight: 800,
                color: "#FFF",
                marginTop: 24,
                marginBottom: 32,
              }}>
                Your Performance Hub
              </h3>

              <div style={{
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}>
                {stats.map((s, i) => (
                  <div
                    key={i}
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      borderRadius: 16,
                      padding: "20px 24px",
                      display: "flex",
                      alignItems: "center",
                      gap: "20px",
                      border: "1px solid rgba(255,255,255,0.08)",
                      transition: "all 0.3s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                      e.currentTarget.style.transform = "translateX(8px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                      e.currentTarget.style.transform = "translateX(0)";
                    }}
                  >
                    <div style={{
                      width: 56,
                      height: 56,
                      borderRadius: 14,
                      background: `${s.color}22`,
                      border: `2px solid ${s.color}44`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}>
                      <s.icon size={28} color={s.color} strokeWidth={2.5} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>{s.label}</div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: "#FFF" }}>{s.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Content */}
          <div style={{ flex: "1 1 50%" }}>
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              background: "rgba(59, 130, 246, 0.15)",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              borderRadius: "100px",
              padding: "8px 20px",
              marginBottom: "24px",
            }}>
              <TrendingUpIcon size={16} color="#3B82F6" />
              <span style={{ fontSize: 14, fontWeight: 600, color: "#3B82F6" }}>Conversion Engine</span>
            </div>

            <h2 style={{
              fontSize: isMobile ? "clamp(2rem, 7vw, 3rem)" : "clamp(2.8rem, 5vw, 4rem)",
              lineHeight: 1.15,
              fontWeight: 900,
              letterSpacing: "-0.03em",
              margin: "0 0 24px 0",
              background: "linear-gradient(135deg, #FFFFFF 0%, #93C5FD 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              Turn followers into customers
            </h2>

            <p style={{
              fontSize: isMobile ? "1.1rem" : "1.3rem",
              lineHeight: 1.7,
              color: "rgba(255,255,255,0.75)",
              marginBottom: 32,
            }}>
              Accept payments instantly, capture emails effortlessly, and showcase your best content. Every click becomes an opportunity with built-in conversion tools that actually work.
            </p>

            <button
              style={{
                border: "2px solid rgba(59, 130, 246, 0.5)",
                height: 58,
                padding: "0 36px",
                fontSize: 16,
                fontWeight: 700,
                borderRadius: 12,
                cursor: "pointer",
                background: "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)",
                color: "#FFF",
                boxShadow: "0 16px 40px rgba(59, 130, 246, 0.4)",
                transition: "all 0.3s ease",
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 20px 50px rgba(59, 130, 246, 0.5)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 16px 40px rgba(59, 130, 246, 0.4)";
              }}
              onClick={() => window.location.href = '/professional/login'}
            >
              Create your page
              <TrendingUpIcon size={18} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Section 3: Growth Visualization with animated elements
  const Section3 = () => {
    const channels = [
      { name: "Instagram", growth: "+127%", color: "#E1306C" },
      { name: "YouTube", growth: "+94%", color: "#FF0000" },
      { name: "LinkedIn", growth: "+156%", color: "#0A66C2" },
      { name: "TikTok", growth: "+203%", color: "#00F2EA" },
    ];

    return (
      <div style={{
        background: "linear-gradient(180deg, #052E2B 0%, #064E3B 50%, #022c22 100%)",
        padding: isMobile ? "80px 24px 100px" : "140px 48px 160px",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Decorative grid */}
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "50px 50px",
          pointerEvents: "none",
        }} />

        <div style={{
          maxWidth: 1280,
          margin: "0 auto",
          position: "relative",
          zIndex: 2,
        }}>
          <div style={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row-reverse",
            alignItems: "center",
            gap: isMobile ? "48px" : "80px",
          }}>
            {/* Left: Animated Growth Bars */}
            <div style={{ flex: "1 1 50%", width: "100%" }}>
              <div style={{
                background: "rgba(16, 185, 129, 0.08)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(16, 185, 129, 0.2)",
                borderRadius: 24,
                padding: isMobile ? "32px 24px" : "48px 40px",
                boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
              }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: 32,
                }}>
                  <FlashOnIcon size={28} color="#10B981" strokeWidth={2.5} />
                  <h4 style={{ fontSize: 20, fontWeight: 800, color: "#10B981", margin: 0 }}>
                    Multi-Channel Growth
                  </h4>
                </div>

                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "24px",
                }}>
                  {channels.map((c, i) => (
                    <div key={i}>
                      <div style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 10,
                      }}>
                        <span style={{ fontSize: 15, fontWeight: 600, color: "#FFF" }}>{c.name}</span>
                        <span style={{ fontSize: 15, fontWeight: 800, color: c.color }}>{c.growth}</span>
                      </div>
                      <div style={{
                        width: "100%",
                        height: 12,
                        background: "rgba(255,255,255,0.1)",
                        borderRadius: 100,
                        overflow: "hidden",
                      }}>
                        <div
                          style={{
                            width: `${70 + i * 8}%`,
                            height: "100%",
                            background: `linear-gradient(90deg, ${c.color} 0%, ${c.color}AA 100%)`,
                            borderRadius: 100,
                            boxShadow: `0 0 20px ${c.color}66`,
                            transition: "width 1s ease",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Content */}
            <div style={{ flex: "1 1 50%" }}>
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                background: "rgba(16, 185, 129, 0.15)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                borderRadius: "100px",
                padding: "8px 20px",
                marginBottom: "24px",
              }}>
                <AutoAwesomeIcon size={16} color="#10B981" />
                <span style={{ fontSize: 14, fontWeight: 600, color: "#10B981" }}>Exponential Growth</span>
              </div>

              <h2 style={{
                fontSize: isMobile ? "clamp(2rem, 7vw, 3rem)" : "clamp(2.8rem, 5vw, 4rem)",
                lineHeight: 1.15,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                margin: "0 0 24px 0",
                background: "linear-gradient(135deg, #FFFFFF 0%, #6EE7B7 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}>
              Scale without limits
              </h2>

              <p style={{
                fontSize: isMobile ? "1.1rem" : "1.3rem",
                lineHeight: 1.7,
                color: "rgba(255,255,255,0.8)",
                marginBottom: 20,
              }}>
                One link. Every platform. Unlimited growth potential.
              </p>

              <p style={{
                fontSize: isMobile ? "1.1rem" : "1.3rem",
                lineHeight: 1.7,
                color: "rgba(255,255,255,0.8)",
                marginBottom: 32,
              }}>
                Update your MyHandle once and watch it propagate instantly across Instagram, YouTube, LinkedIn, TikTok, and everywhere else your audience lives. No more updating dozens of bios manually.
              </p>

              <button
                style={{
                  border: "none",
                  height: 58,
                  padding: "0 36px",
                  fontSize: 16,
                  fontWeight: 700,
                  borderRadius: 12,
                  cursor: "pointer",
                  background: "linear-gradient(135deg, #10B981 0%, #059669 100%)",
                  color: "#FFF",
                  boxShadow: "0 16px 40px rgba(16, 185, 129, 0.4)",
                  transition: "all 0.3s ease",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "10px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px) scale(1.02)";
                  e.currentTarget.style.boxShadow = "0 20px 50px rgba(16, 185, 129, 0.5)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0) scale(1)";
                  e.currentTarget.style.boxShadow = "0 16px 40px rgba(16, 185, 129, 0.4)";
                }}
                onClick={() => window.location.href = '/professional/login'}
              >
                Start growing now
                <FlashOnIcon size={18} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ width: "100%" }}>
      <Section2 />
      <Section3 />
    </div>
  );
}
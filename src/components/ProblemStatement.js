import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

export default function TopProblemsSplit({ onExplore = null }) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  const cards = [
    {
      id: "presence",
      icon: (
       <span 
      style={{ 
        fontSize: "28px", 
        width: "36px", 
        height: "36px", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center" 
      }}
    >
     🤫
    </span>
      ),
      title: "Don’t Launch Into Silence.",
      desc:
        "A product online isn’t enough. Make sure you stay visible and keep attracting users after launch.",
      cta: "Explore App Store Analysis",
      to: "/app-store",
    },
    {
    id: "competitor",
    icon: (
      <span 
      style={{ 
        fontSize: "28px", 
        width: "36px", 
        height: "36px", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center" 
      }}
    >
    💹
    </span>
    ),
    title: "Don’t Fall Behind the Market.",
    desc:
      "User needs and competitor moves change fast. Stay in the loop with insights that help you adapt before it’s too late.",
    cta: "View Market Trends",
    to: "/market",
  },
  {
    id: "feedback",
    icon: (
       <span 
      style={{ 
        fontSize: "28px", 
        width: "36px", 
        height: "36px", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center" 
      }}
    >
    🪦
    </span>
    ),
    title: "Startup Graveyard.",
    desc:
      "42% fail due to no market need. 90% of the time founders assume rather than validate. 85% of new product launches fail.",
    cta: "See Feedback Insights",
    to: "/feedback",
  }
  ];

  const wrap = {
    boxSizing: "border-box",
    padding: isMobile ? "16px" : "clamp(24px, 4vw, 56px)",
    margin: "0 auto",
    width: "100%",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
    color: "#0b1220",
  };

  const sectionLabel = {
    fontSize: isMobile ? "0.72rem" : "0.85rem",
    color: "#6b7280",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    marginBottom: isMobile ? 6 : 10,
  };

  const bigTitle = {
    fontSize: isMobile ? "1.35rem" : "clamp(1.6rem, 4.8vw, 2.4rem)",
    fontWeight: isMobile ? 600 : 700,
    textAlign: "center",
    margin: "0 0 12px 0",
    lineHeight: 1.25,
    padding: isMobile ? "0px 16px" : "0px 0px"
  };

  const intro = {
    maxWidth: 860,
    margin: "0 auto",
    textAlign: "center",
    color: "#374151",
    fontSize: isMobile ? "0.92rem" : "clamp(0.92rem, 1.2vw, 1.02rem)",
    marginBottom: isMobile ? 12 : 18,
  };

  const hr = {
    height: 1,
    border: "none",
    background: "#F3F4F6",
    margin: isMobile ? "10px 0 18px" : "16px 0 28px",
    width: "100%",
  };

  // grid container — on desktop show three columns; on mobile stack (wrap)
const grid = {
  display: "flex",
  flexDirection: isMobile ? "column" : "row", // ✅ stack on mobile
  gap: isMobile ? "2px" : "2px",              // ✅ spacing between rows
  alignItems: "stretch",
  justifyContent: "space-between",
  width: "100%",
};


  // each column: we add borderLeft except for first; on mobile they stack and borderLeft becomes none,
  // and we render horizontal divider between stacked items
 const colBase = {
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  gap: isMobile ? 10 : 12,
  background: "linear-gradient(135deg, #CDC1FF 60%, #FFFFFF 40%)",
  borderRadius: 12, // optional, looks nicer
  minWidth: 0,
};


  // On mobile each column is full width
// On mobile each column is full width
const getColStyle = (index) => {
  const dividerColor = "#E6E6E6";

  // Gradients per card
  const gradients = [
    "linear-gradient(135deg, #CDC1FF 0%, #FFFFFF 100%)", // purple → white
    "linear-gradient(135deg, #93C5FD 0%, #FFFFFF 100%)", // blue → white
    "linear-gradient(135deg, #6EE7B7 0%, #FFFFFF 100%)", // green → white
  ];

  const base = {
    ...colBase,
    flex: isMobile ? "1 1 100%" : "1 1 0",
    background: gradients[index % gradients.length],
    padding: isMobile ? "16px 32px" : "66px 42px"
  };

  // 🔹 Desktop (row layout)
  if (!isMobile) {
    if (index === 0) {
      // First card: remove top-right, bottom-right
      return {
        ...base,
        borderRadius: "12px 0 0 12px",
        borderLeft: "none",
      };
    }
    if (index === 1) {
      // Second card: no border radius
      return {
        ...base,
        borderRadius: 0,
        borderLeft: `1px solid ${dividerColor}`,
      };
    }
    if (index === 2) {
      // Third card: remove top-left, bottom-left
      return {
        ...base,
        borderRadius: "0 12px 12px 0",
        borderLeft: `1px solid ${dividerColor}`,
      };
    }
  }

  // 🔹 Mobile (stacked layout)
  if (isMobile) {
    if (index === 0) {
      // First card: no bottom corners
      return { ...base, borderRadius: "12px 12px 0 0" };
    }
    if (index === 1) {
      // Second card: no radius at all
      return { ...base, borderRadius: 0 };
    }
    if (index === 2) {
      // Third card: no top corners
      return { ...base, borderRadius: "0 0 12px 12px" };
    }
  }

  return base;
};



  const titleStyle = {
    display: "flex",
    gap: 12,
    alignItems: "center",
  };

  const iconWrap = {
    width: isMobile ? 44 : 56,
    height: isMobile ? 44 : 64,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    flexShrink: 0,
  };

  const cardTitle = {
    fontSize: isMobile ? "1rem" : "clamp(1.02rem, 1.6vw, 1.2rem)",
    fontWeight: isMobile ? 600 : 700,
    margin: 0,
    color: "#0b1220",
  };

  const cardDesc = {
    fontSize: isMobile ? "0.92rem" : "clamp(0.9rem, 1.2vw, 1rem)",
    color: "#374151",
    marginTop: isMobile ? 8 : 10,
    lineHeight: 1.45,
    flex: "1 1 auto",
  };

  const cardFooter = {
    marginTop: isMobile ? 8 : 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
  };

  const cardLink = {
    fontSize: isMobile ? "0.92rem" : "0.98rem",
    color: "#2563eb",
    textDecoration: "none",
    fontWeight: 700,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  };

  const chevron = (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden style={{ transform: "translateY(1px)" }}>
      <path d="M6 9l6 6 6-6" stroke="#2563eb" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );

  // mobile horizontal divider color
  const mobileDivider = { height: 1, margin: "12px 0" };

  return (
    <section aria-label="Top problems split view" style={wrap}>
      <div style={sectionLabel}>#For Founders</div>
      <h3 style={bigTitle}>Solve the Biggest Roadblocks After Launch</h3>
      <p style={intro}>
        After launch, growth depends on visibility, feedback, and insights. This is where most founders get stuck.
      </p>

      <hr style={hr} />

      {/* GRID */}
      <div style={grid} role="list">
        {cards.map((c, i) => (
          <div key={c.id} style={getColStyle(i)} role="listitem">
            <div style={titleStyle}>
              <div style={iconWrap} aria-hidden>
                {c.icon}
              </div>
              <h4 style={cardTitle}>{c.title}</h4>
            </div>

            <p style={cardDesc}>{c.desc}</p>

            <div style={cardFooter}>
              {/* <Link
                to={c.to}
                onClick={(e) => {
                  if (onExplore) {
                    e.preventDefault();
                    onExplore(c.id);
                  }
                }}
                style={cardLink}
              >
                <span>{c.cta}</span>
                {chevron}
              </Link> */}
            </div>

            {/* mobile horizontal divider between stacked items (render except after last) */}
            {isMobile && i < cards.length - 1 && <div style={mobileDivider} aria-hidden />}
          </div>
        ))}
      </div>
    </section>
  );
}

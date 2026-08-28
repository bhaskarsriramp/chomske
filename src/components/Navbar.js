import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import logo from "../images/myhandle_logo.svg";

export default function Navbar() {
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const [visible, setVisible] = useState(true); // navbar visible or hidden (for scroll)
  const lastScrollY = useRef(typeof window !== "undefined" ? window.scrollY : 0);
  const ticking = useRef(false);
  const location = useLocation();
  const navigate = useNavigate();


  // media query used in JS so all styles are inline (no external CSS)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const handle = () => setIsMobile(mq.matches);
    handle();
    mq.addEventListener?.("change", handle);
    return () => mq.removeEventListener?.("change", handle);
  }, []);

  // Scroll handler: hide on scroll down, show on scroll up
  useEffect(() => {
    const threshold = 10; // minimum px change to consider
    const rafCb = () => {
      const currentY = window.scrollY;
      const lastY = lastScrollY.current;
      const delta = currentY - lastY;

      // If near top, always show
      if (currentY < 60) {
        setVisible(true);
      } else if (Math.abs(delta) > threshold) {
        // scroll down -> hide, scroll up -> show
        if (delta > 0) {
          setVisible(false);
        } else {
          setVisible(true);
        }
      }
      lastScrollY.current = currentY;
      ticking.current = false;
    };

    const onScroll = () => {
      if (!ticking.current) {
        ticking.current = true;
        requestAnimationFrame(rafCb);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close dropdown on outside click
  const featuresRef = useRef(null);
  useEffect(() => {
    const onDocClick = (e) => {
      if (featuresRef.current && !featuresRef.current.contains(e.target)) {
        setFeaturesOpen(false);
      }
    };
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  }, []);

  // --- Inline styles ---
  const headerStyle = {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    backgroundColor: "#f5f7f8",
    // backgroundColor: "#FAB12F",
    padding: "0px 15px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 200,
    boxSizing: "border-box",
    borderBottom: "1px solid rgba(15,23,42,0.04)",
    // hide/show transition
    transform: visible ? "translateY(0)" : "translateY(-120%)",
    transition: "transform 240ms cubic-bezier(.2,.9,.2,1)",
    pointerEvents: visible ? "auto" : "none",
  };

  const leftStyle = {
    display: "flex",
    alignItems: "center",
    textDecoration: "none",
    color: "inherit",
    minWidth: 0,
  };

  const brandTextStyle = {
    fontWeight: 600,
    fontSize: "1.25rem",
    color: "#0b1220",
    whiteSpace: "nowrap",
    marginLeft : '12px'
  };

  const centerWrapStyle = {
    display: isMobile ? "none" : "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "1 1 auto",
    pointerEvents: "auto",
  };

  const navListStyle = {
    display: "flex",
    gap: 18,
    alignItems: "center",
    justifyContent: "center",
  };

  const navItemStyle = {
    fontSize: "1rem",
    color: "#0f1724",
    textDecoration: "none",
    cursor: "pointer",
    padding: "8px 6px",
    borderRadius: 8,
    background: "transparent",
    lineHeight: 1,
    fontWeight: 400
  };

  const featuresBtnStyle = {
    ...navItemStyle,
    display: "inline-flex",
    gap: 8,
    alignItems: "center",
    position: "relative",
  };

  const arrowStyle = (open) => ({
    display: "inline-block",
    transition: "transform 170ms ease",
    transform: open ? "rotate(180deg) translateY(1px)" : "rotate(0deg)",
    width: 14,
    height: 14,
  });

  const dropdownStyle = {
    position: "absolute",
    top: "calc(100% + 8px)",
    left: "50%",
    transform: "translateX(-50%)",
    minWidth: 360,
    maxWidth: 420,
    background: "white",
    borderRadius: 10,
    boxShadow: "0 12px 32px rgba(2,6,23,0.12)",
    padding: "12px",
    border: "1px solid rgba(15,23,42,0.04)",
    zIndex: 90,
  };

  const dropdownItemStyle = {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    padding: "12px 10px",
    borderRadius: 8,
    textDecoration: "none",
    color: "#0f1724",
    cursor: "pointer",
  };

  const itemTitleStyle = {
    fontWeight: 700,
    fontSize: "0.98rem",
    marginBottom: 4,
  };

  const itemDescStyle = {
    fontSize: "0.88rem",
    color: "#6b7280",
    lineHeight: 1.35,
  };

  const rightStyle = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginLeft: '10%',
  };

  const joinBtnStyle = {
    padding: "10px 16px",
    borderRadius: 999,
    background:
      "linear-gradient(90deg, #2563eb 0%, #3b82f6 40%, #60a5fa 100%)",
    color: "white",
    border: "none",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "0.95rem",
    boxShadow: "0 6px 18px rgba(43,108,255,0.12)",
    whiteSpace: "nowrap",
  };

  const mobileMenuStyle = {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    // background: "#FAB12F",
    background: "#f5f7f8",
    borderTop: "1px solid rgba(15,23,42,0.04)",
    boxShadow: "0 10px 30px rgba(2,6,23,0.06)",
    padding: 12,
    display: mobileOpen ? "block" : "none",
    zIndex: 80,
  };

  const mobileLinkStyle = {
    padding: "12px 10px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    textDecoration: "none",
    color: "#0f1724",
    borderRadius: 8,
    fontSize : "1rem"
  };

  // simple inline icons
  const IconBuild = (
    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="#0f1724" strokeWidth="1.2" />
      <path d="M7 13h10M7 9h10" stroke="#0f1724" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const IconReddit = (
    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 2c.7 0 1.3.6 1.3 1.3S12.7 4.6 12 4.6 10.7 4 10.7 3.3 11.3 2 12 2z" fill="#0f1724" />
      <path d="M22 12a9.9 9.9 0 11-20 0 9.9 9.9 0 0120 0z" fill="none" stroke="#0f1724" strokeWidth="1.2" />
      <path d="M7.5 14c0 1.8 3 3.3 4.5 3.3S16.5 15.8 16.5 14" stroke="#0f1724" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );

  const IconApp = (
    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="#0f1724" strokeWidth="1.2" />
      <path d="M8 8l8 8M16 8L8 16" stroke="#0f1724" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const IconBoilerplate = (
    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" stroke="#0f1724" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );

  const submenu = [
    { key: "buildhub", title: "BuildHub AI", desc: "Build & Scale Your SaaS with One Platform", icon: IconBuild, to: "/buildhub" },
    { key: "reddit", title: "Reddit AI Agent", desc: "AI-powered Reddit content analysis tool", icon: IconReddit, to: "/reddit-agent" },
    { key: "appstore", title: "App Store Analysis", desc: "Uncover mobile app market opportunities", icon: IconApp, to: "/app-store" },
    { key: "starter", title: "Micro SaaS Boilerplate", desc: "Complete production-ready starter template", icon: IconBoilerplate, to: "/starter" },
  ];

  return (
    <header style={headerStyle}>
      {/* LEFT: Logo */}
    <Link
  to="/"
  style={leftStyle}
  onClick={(e) => {
    if (mobileOpen) setMobileOpen(false);

    if (location.pathname === "/") {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    e.preventDefault();
    navigate("/");

    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 80);
  }}
>
  <img
    src={logo}
    alt="MyHandle Logo"
    width="140"
    height="60"
    loading="eager"
    decoding="async"
    style={{ display: "block" }}
  />
</Link>



      {/* CENTER: main nav (centered on large screens) */}
      <div style={centerWrapStyle}>
        <nav aria-label="Primary" style={navListStyle}>
          {/* <div
            ref={featuresRef}
            style={featuresBtnStyle}
            onMouseEnter={() => !isMobile && setFeaturesOpen(true)}
            onMouseLeave={() => !isMobile && setFeaturesOpen(false)}
          >
            <a
              href="#features"
              onClick={(e) => {
                if (isMobile) {
                  e.preventDefault();
                  setFeaturesOpen((s) => !s);
                }
              }}
              style={{ textDecoration: "none", color: "inherit", display: "inline-flex", alignItems: "center", gap: 8 }}
              aria-haspopup="true"
              aria-expanded={featuresOpen}
            >
              <span style={{ lineHeight: 1, fontSize: "1rem", fontWeight: 600 }}>Features</span>
              <span style={arrowStyle(featuresOpen)} aria-hidden>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 9l6 6 6-6" stroke="#0f1724" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </a>

            {!isMobile && featuresOpen && (
              <div role="menu" aria-label="Features submenu" style={dropdownStyle}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {submenu.map((s) => (
                    <Link key={s.key} to={s.to} style={dropdownItemStyle}>
                      <div style={{ width: 36, height: 36 }}>{s.icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={itemTitleStyle}>{s.title}</div>
                        <div style={itemDescStyle}>{s.desc}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div> */}

          <Link to="/pricing" style={navItemStyle}>Pricing</Link>
          <Link to="/trust-center" style={navItemStyle}>Trust Center</Link>
        
        </nav>
      </div>

      {/* RIGHT: Join Waitlist (desktop only) and mobile hamburger */}
      <div style={rightStyle}>

        {/* hamburger visible only on mobile */}
        <button
          onClick={() => setMobileOpen((s) => !s)}
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
          style={{
            marginLeft: 6,
            border: "none",
            background: "transparent",
            padding: 8,
            display: isMobile ? "inline-flex" : "none",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            borderRadius: 8,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
            <path d="M3 6h18M3 12h18M3 18h18" stroke="#0f1724" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* MOBILE MENU */}
      {isMobile && (
        <div style={mobileMenuStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* <button onClick={() => setFeaturesOpen((s) => !s)} aria-expanded={featuresOpen} style={mobileLinkStyle}>
              <span style={{ fontWeight: 700, fontSize : '15px' }}>Features</span>
              <span style={{ transform: featuresOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 150ms" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
                  <path d="M6 9l6 6 6-6" stroke="#0f1724" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              </span>
            </button> */}

            {/* {featuresOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 8 }}>
                {submenu.map((s) => (
                  <Link key={s.key} to={s.to} style={{ textDecoration: "none", color: "#0f1724", padding: "10px 8px", borderRadius: 8 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ width: 36, height: 36 }}>{s.icon}</div>
                      <div>
                        <div style={{ fontWeight: 700 }}>{s.title}</div>
                        <div style={{ fontSize: "0.88rem", color: "#6b7280" }}>{s.desc}</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )} */}

            <Link to="/pricing" style={mobileLinkStyle}>Pricing</Link>
            <Link to="/trust-center" style={mobileLinkStyle}>Trust Center</Link>
          </div>
        </div>
      )}
    </header>
  );
}

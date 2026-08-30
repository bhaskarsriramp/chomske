import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import logo from "../images/myhandle_logo.svg";
import { trackCTA } from "./GoogleAnalytics";

const DesktopNavLink = ({ to, children }) => {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <Link
      to={to}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        fontSize: "14px",
        fontWeight: "500",
        color: isHovered ? "#111827" : "#4B5563",
        textDecoration: "none",
        padding: "7px 14px",
        borderRadius: "8px",
        transition: "all 0.2s ease",
        cursor: "pointer",
        fontFamily: "'Inter', sans-serif",
        backgroundColor: isHovered ? "rgba(0,0,0,0.05)" : "transparent",
      }}
    >
      {children}
    </Link>
  );
};

export default function Navbar() {
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [visible, setVisible] = useState(true);
  const [showAnnouncement, setShowAnnouncement] = useState(() => {
    try { return sessionStorage.getItem("mh_ann_dismissed") !== "1"; } catch { return true; }
  });
  const lastScrollY = useRef(typeof window !== "undefined" ? window.scrollY : 0);
  const ticking = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 900px)");
    const handle = () => setIsMobile(mq.matches);
    handle();
    mq.addEventListener("change", handle);
    return () => mq.removeEventListener("change", handle);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateScrollDir = () => {
      const currentY = window.scrollY;
      const lastY = lastScrollY.current;
      const delta = currentY - lastY;
      setIsScrolled(currentY > 20);
      if (currentY < 50) setVisible(true);
      else if (Math.abs(delta) >= 10) setVisible(delta < 0);
      lastScrollY.current = currentY;
      ticking.current = false;
    };
    const onScroll = () => {
      if (!ticking.current) { window.requestAnimationFrame(updateScrollDir); ticking.current = true; }
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const dismissAnnouncement = () => {
    setShowAnnouncement(false);
    try { sessionStorage.setItem("mh_ann_dismissed", "1"); } catch {}
  };

  const announcementH = showAnnouncement ? (isMobile ? 40 : 44) : 0;
  const navH = isMobile ? 64 : 72;

  return (
    <>
      <style>{`
        .ann-bar a:hover { opacity: 0.85; }
        .nav-cta-btn:hover { transform: translateY(-1px) !important; box-shadow: 0 8px 20px rgba(0,0,0,0.18) !important; }
      `}</style>

      <header style={{
        position: "fixed",
        top: 0, left: 0, width: "100%",
        zIndex: 1000,
        transform: visible ? "translateY(0)" : "translateY(-100%)",
        transition: "transform 0.3s cubic-bezier(0.16,1,0.3,1)",
        display: "flex", flexDirection: "column",
        boxSizing: "border-box",
      }}>

        {/* ── Announcement bar ──
        {showAnnouncement && (
          <div className="ann-bar" style={{
            height: announcementH,
            background: "#0A0A0A",
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: isMobile ? 6 : 10,
            padding: "0 16px",
            fontFamily: "'Inter', sans-serif",
            overflow: "hidden",
          }}>
            <div style={{
              background: "#25D366", color: "#fff",
              fontSize: 9, fontWeight: 800,
              padding: "2px 7px", borderRadius: 4,
              letterSpacing: "0.07em", textTransform: "uppercase",
              flexShrink: 0,
            }}>NEW</div>
            <span style={{ fontSize: isMobile ? 11 : 12, color: "rgba(255,255,255,0.82)", fontWeight: 400 }}>
              {isMobile ? "Team escalation is live." : "Team escalation is live — auto-alert your co-founder on missed P0s."}
            </span>
            <button
              onClick={() => { trackCTA("announcement_cta", "announcement_bar"); navigate("/professional/login"); }}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "#25D366", fontSize: isMobile ? 11 : 12, fontWeight: 700,
                padding: "0 2px", flexShrink: 0,
              }}
            >
              Try free →
            </button>
            <button
              onClick={dismissAnnouncement}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "rgba(255,255,255,0.35)", fontSize: 18, lineHeight: 1,
                padding: "0 4px", marginLeft: 4, flexShrink: 0,
              }}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )} */}

        {/* ── Main nav ── */}
        <div style={{
          height: navH,
          background: isScrolled ? "#FAF8ED" : "#FAF8ED",
          backdropFilter: isScrolled ? "blur(20px)" : "blur(8px)",
          WebkitBackdropFilter: isScrolled ? "blur(20px)" : "blur(8px)",
          borderBottom: isScrolled ? "1px solid rgba(0,0,0,0.07)" : "1px solid rgba(0,0,0,0.05)",
          boxShadow: isScrolled ? "0 4px 24px rgba(0,0,0,0.04)" : "none",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: isMobile ? "0 20px" : "0 40px",
          boxSizing: "border-box",
          transition: "background 0.3s ease, border 0.3s ease, box-shadow 0.3s ease",
        }}>
          {/* Logo */}
          <Link
            to="/"
            onClick={() => { setMobileOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            style={{ display: "flex", alignItems: "center", textDecoration: "none", zIndex: 1002 }}
          >
            <img src={logo} alt="MyHandle" style={{ height: "50px", width: "auto", display: "block" }} />
          </Link>

          {/* Desktop nav links */}
          {!isMobile && (
            <nav style={{
              display: "flex", alignItems: "center", gap: "4px",
              position: "absolute", left: "50%", transform: "translateX(-50%)",
            }}>
              <DesktopNavLink to="/all-features">Features</DesktopNavLink>
              <DesktopNavLink to="/lead-finder">Integrations</DesktopNavLink>
              <DesktopNavLink to="/trust-center">Trust Center</DesktopNavLink>
              <DesktopNavLink to="/pricing">Pricing</DesktopNavLink>
            </nav>
          )}

          {/* Right side */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", zIndex: 1002 }}>
            {!isMobile && (
              <button
                className="nav-cta-btn"
                onClick={() => { trackCTA("navbar_get_started", "navbar"); navigate("/professional/login"); }}
                style={{
                  background: "#111827", color: "#FFF",
                  border: "none", borderRadius: "24px",
                  padding: "10px 24px",
                  fontSize: "13px", fontWeight: "700",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                  fontFamily: "'Inter', sans-serif",
                  letterSpacing: "-0.01em",
                }}
              >
                Get Started Free
              </button>
            )}

            {isMobile && (
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                style={{ background: "transparent", border: "none", padding: "8px", cursor: "pointer", display: "flex", alignItems: "center" }}
                aria-label="Menu"
              >
                <div style={{ position: "relative", width: "24px", height: "24px" }}>
                  <span style={{ position: "absolute", left: 0, top: mobileOpen ? "11px" : "5px", width: "100%", height: "2px", background: "#111", borderRadius: "2px", transition: "all 0.3s ease", transform: mobileOpen ? "rotate(45deg)" : "rotate(0)" }} />
                  <span style={{ position: "absolute", left: 0, top: "11px", width: "100%", height: "2px", background: "#111", borderRadius: "2px", transition: "all 0.3s ease", opacity: mobileOpen ? 0 : 1 }} />
                  <span style={{ position: "absolute", left: 0, bottom: mobileOpen ? "11px" : "5px", width: "100%", height: "2px", background: "#111", borderRadius: "2px", transition: "all 0.3s ease", transform: mobileOpen ? "rotate(-45deg)" : "rotate(0)" }} />
                </div>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      <div style={{
        position: "fixed", top: 0, left: 0, width: "100%", height: "100vh",
        background: "rgba(255,255,255,0.98)",
        backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
        padding: "120px 24px 40px",
        zIndex: 999,
        transform: mobileOpen ? "translateY(0)" : "translateY(-100%)",
        opacity: mobileOpen ? 1 : 0,
        transition: "all 0.4s cubic-bezier(0.16,1,0.3,1)",
        pointerEvents: mobileOpen ? "all" : "none",
        display: "flex", flexDirection: "column",
        boxSizing: "border-box",
      }}>
        <div style={{ flex: 1 }}>
          {[
            { to: "/all-features", label: "Features" },
            { to: "/lead-finder", label: "Integrations" },
            { to: "/trust-center", label: "Trust Center" },
            { to: "/pricing", label: "Pricing" },
          ].map(({ to, label }) => (
            <Link key={to} to={to} onClick={() => setMobileOpen(false)} style={{
              display: "block", width: "100%",
              padding: "18px 0",
              fontSize: "20px", fontWeight: "600", color: "#111",
              textDecoration: "none",
              borderBottom: "1px solid rgba(0,0,0,0.05)",
              fontFamily: "'Inter', sans-serif",
            }}>
              {label}
            </Link>
          ))}
        </div>
        <button
          onClick={() => { setMobileOpen(false); trackCTA("navbar_mobile_get_started", "navbar"); navigate("/professional/login"); }}
          style={{
            width: "100%", padding: "18px",
            background: "#0A0A0A", color: "#FFF",
            fontSize: "16px", fontWeight: "700",
            border: "none", borderRadius: "16px", cursor: "pointer",
            marginTop: "auto",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Get Started Free →
        </button>
      </div>
    </>
  );
}

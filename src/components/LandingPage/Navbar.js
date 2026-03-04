import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import chomskeIcon from "../../images/Chomske_icon.png";
import WaitlistModal from "./WaitlistModal";

const DesktopNavLink = ({ to, children }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      to={to}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        fontSize: "14px",
        fontWeight: "500",
        color: hovered ? "#111827" : "#4B5563",
        textDecoration: "none",
        padding: "7px 14px",
        borderRadius: "8px",
        transition: "all 0.18s ease",
        cursor: "pointer",
        fontFamily: "'Inter', sans-serif",
        backgroundColor: hovered ? "rgba(0,0,0,0.04)" : "transparent",
        whiteSpace: "nowrap",
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
  const [btnHovered, setBtnHovered] = useState(false);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const lastScrollY = useRef(typeof window !== "undefined" ? window.scrollY : 0);
  const ticking = useRef(false);

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
    const onScroll = () => {
      if (ticking.current) return;
      window.requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastScrollY.current;
        setIsScrolled(y > 20);
        if (y < 50) setVisible(true);
        else if (Math.abs(delta) >= 10) setVisible(delta < 0);
        lastScrollY.current = y;
        ticking.current = false;
      });
      ticking.current = true;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const mobileLinkStyle = {
    display: "block",
    width: "100%",
    padding: "16px 0",
    fontSize: "18px",
    fontWeight: "600",
    color: "#111",
    textDecoration: "none",
    borderBottom: "1px solid rgba(0,0,0,0.05)",
    textAlign: "left",
    fontFamily: "'Inter', sans-serif",
  };

  return (
    <>
      {showWaitlist && <WaitlistModal onClose={() => setShowWaitlist(false)} />}
    <header style={{
      position: "fixed",
      top: 0, left: 0, width: "100%",
      height: isMobile ? "64px" : "72px",
      background: isScrolled ? "rgba(255,255,255,0.88)" : "transparent",
      backdropFilter: isScrolled ? "blur(16px)" : "none",
      WebkitBackdropFilter: isScrolled ? "blur(16px)" : "none",
      borderBottom: isScrolled ? "1px solid rgba(0,0,0,0.06)" : "1px solid transparent",
      boxShadow: isScrolled ? "0 4px 20px rgba(0,0,0,0.03)" : "none",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: isMobile ? "0 20px" : "0 40px",
      zIndex: 1000,
      transform: visible ? "translateY(0)" : "translateY(-100%)",
      transition: "transform 0.3s cubic-bezier(0.16,1,0.3,1), background 0.3s ease, border 0.3s ease",
      boxSizing: "border-box",
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>

      {/* Logo */}
      <Link
        to="/"
        onClick={() => { setMobileOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}
        style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", zIndex: 1002 }}
      >
        <img
          src={chomskeIcon}
          alt=""
          style={{ height: 32, width: 32, borderRadius: 8, display: "block", flexShrink: 0 }}
        />
        <span style={{
          fontSize: "17px", fontWeight: 800,
          color: "#0F172A", letterSpacing: "-0.03em",
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}>
          Chomske
        </span>
      </Link>

      {/* Desktop nav (centered) */}
      {!isMobile && (
        <nav style={{
          display: "flex", alignItems: "center", gap: 4,
          position: "absolute", left: "50%", transform: "translateX(-50%)",
        }}>
          <DesktopNavLink to="/problem">Problem</DesktopNavLink>
          <DesktopNavLink to="/how-it-works">How It Works</DesktopNavLink>
          <DesktopNavLink to="/engines">Engines</DesktopNavLink>
        </nav>
      )}

      {/* Right: CTA + mobile toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, zIndex: 1002 }}>
        {!isMobile && (
          <button
            onMouseEnter={() => setBtnHovered(true)}
            onMouseLeave={() => setBtnHovered(false)}
            onClick={() => setShowWaitlist(true)}
            style={{
              background: btnHovered ? "#4338CA" : "#4F46E5",
              color: "#fff",
              border: "none",
              borderRadius: "10px",
              padding: "10px 22px",
              fontSize: "14px",
              fontWeight: "700",
              cursor: "pointer",
              transition: "all 0.2s ease",
              boxShadow: btnHovered
                ? "0 8px 20px rgba(79,70,229,0.4)"
                : "0 4px 12px rgba(79,70,229,0.25)",
              transform: btnHovered ? "translateY(-1px)" : "translateY(0)",
              fontFamily: "'Inter', sans-serif",
              letterSpacing: "-0.01em",
            }}
          >
            Join Waitlist
          </button>
        )}

        {isMobile && (
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            style={{ background: "transparent", border: "none", padding: "8px", cursor: "pointer" }}
            aria-label="Menu"
          >
            <div style={{ position: "relative", width: 24, height: 24 }}>
              {[
                { top: mobileOpen ? "11px" : "5px", transform: mobileOpen ? "rotate(45deg)" : "rotate(0)" },
                { top: "11px", opacity: mobileOpen ? 0 : 1 },
                { bottom: mobileOpen ? "11px" : "5px", transform: mobileOpen ? "rotate(-45deg)" : "rotate(0)" },
              ].map((s, i) => (
                <span key={i} style={{
                  position: "absolute", left: 0,
                  width: "100%", height: 2,
                  background: "#111", borderRadius: 2,
                  transition: "all 0.3s ease",
                  ...s,
                }} />
              ))}
            </div>
          </button>
        )}
      </div>

      {/* Mobile menu */}
      <div style={{
        position: "fixed", top: 0, left: 0,
        width: "100%", height: "90vh",
        background: "rgba(255,255,255,0.98)",
        backdropFilter: "blur(20px)",
        padding: "88px 24px 40px",
        zIndex: 1001,
        transform: mobileOpen ? "translateY(0)" : "translateY(-100%)",
        opacity: mobileOpen ? 1 : 0,
        transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        pointerEvents: mobileOpen ? "all" : "none",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ flex: 1 }}>
          {[
            { to: "/problem", label: "Problem" },
            { to: "/how-it-works", label: "How It Works" },
            { to: "/engines", label: "Engines" },
          ].map(({ to, label }) => (
            <Link key={to} to={to} onClick={() => setMobileOpen(false)} style={mobileLinkStyle}>
              {label}
            </Link>
          ))}
        </div>
        <button
          onClick={() => { setMobileOpen(false); setShowWaitlist(true); }}
          style={{
            width: "100%", padding: "18px",
            background: "linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)",
            color: "#fff", fontSize: "16px", fontWeight: "700",
            border: "none", borderRadius: "14px", cursor: "pointer",
            marginTop: "auto",
            boxShadow: "0 10px 30px rgba(79,70,229,0.3)",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Join Waitlist
        </button>
      </div>
    </header>
    </>
  );
}

import { Suspense, lazy, useState, useEffect, Component } from "react";
import { Helmet } from "react-helmet";
import Navbar from "../components/Navbar";
import HeroSection from "./HeroSection";
import { trackCTA } from "./GoogleAnalytics";

// Lazy-loaded components (new story-driven flow)
const EscalationSection = lazy(() => import("./EscalationSection"));
const WhatIfSection = lazy(() => import("./WhatIfSection"));
const ThreeBlockPage = lazy(() => import("./ThreeBlockPage.js"));
const TransformationStories = lazy(() => import("./TransformationStories"));
const ObjectionSection = lazy(() => import("./ObjectionSection"));
const SocialProofScale = lazy(() => import("./SocialProofScale"));
const WhoIsThisFor = lazy(() => import("./WhoIsThisFor"));
const AllFeatures = lazy(() => import("./AllFeatures.js"));
const IntegrationsGrid = lazy(() => import("./IntegrationsGrid"));
const FAQSection = lazy(() => import("./FAQSection"));
const Footer = lazy(() => import("../components/Footer"));
const BannerLandpage = lazy(() => import("./BannerLandPage"));

// Error Boundary for lazy-loaded sections
class SectionErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "3rem", textAlign: "center", fontFamily: "'Inter', sans-serif" }}>
          <p style={{ fontSize: "16px", color: "#6B7280" }}>Something went wrong loading this section.</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: "12px", padding: "10px 24px", background: "#7132CA", color: "#fff",
              border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "600"
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Social proof stats strip
function StatsStrip() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width:700px)").matches
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width:700px)");
    const handle = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", handle);
    return () => mq.removeEventListener("change", handle);
  }, []);

  const stats = [
    { value: "5 min",   label: "Setup, start to finish" },
    { value: "400",   label: "Messages per month" },
    { value: "$4/mo",   label: "Less than a coffee" },
    { value: "99.9%",   label: "Uptime guaranteed" },
  ];

  return (
    <div style={{
      background: "#FAF8F0",
      borderTop: "1px solid #EDE8D8",
      borderBottom: "1px solid #EDE8D8",
      padding: isMobile ? "28px 20px" : "36px 60px",
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      <div style={{
        maxWidth: 860,
        margin: "0 auto",
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
        gap: isMobile ? "24px 16px" : "0",
        textAlign: "center",
        position: "relative",
      }}>
        {stats.map((s, i) => (
          <div key={i} style={{
            padding: isMobile ? "0" : "0 24px",
            borderRight: !isMobile && i < stats.length - 1 ? "1px solid #DDD8C8" : "none",
          }}>
            <div style={{
              fontSize: isMobile ? "clamp(1.5rem,6vw,1.9rem)" : "clamp(1.8rem,2.5vw,2.1rem)",
              fontWeight: 900,
              color: "#1A1A1A",
              letterSpacing: "-0.04em",
              lineHeight: 1,
              marginBottom: 5,
            }}>{s.value}</div>
            <div style={{
              fontSize: isMobile ? 11 : 12,
              color: "#8C7E5E",
              fontWeight: 500,
              lineHeight: 1.4,
            }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Mid-page CTA component (updated copy)
function MidPageCTA({ navigate }) {
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
    <div style={{
      background: "linear-gradient(135deg, #F8FAFC 0%, #F0FDF4 50%, #FAFAFA 100%)",
      padding: isMobile ? "56px 20px" : "80px 24px",
      textAlign: "center",
      fontFamily: "'Inter', sans-serif",
      position: "relative",
      overflow: "hidden",

    }}>
      {/* Soft glow */}
      <div style={{
        position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        width: isMobile ? 280 : 500, height: isMobile ? 200 : 300,
        background: "radial-gradient(circle, rgba(37,211,102,0.06) 0%, transparent 70%)",
        filter: "blur(40px)", pointerEvents: "none",
      }} />
      <div style={{ position: "relative", zIndex: 1 }}>
      

        <p style={{
          fontSize: "12px", fontWeight: "700", color: "#16A34A",
          marginBottom: isMobile ? "12px" : "16px", letterSpacing: "0.1em", textTransform: "uppercase",
        }}>
          Stop being the last to know
        </p>
        <h2 style={{
          fontSize: isMobile ? "clamp(1.5rem, 6vw, 2rem)" : "clamp(1.8rem, 4vw, 2.8rem)",
          fontWeight: "800", color: "#0F172A",
          marginBottom: isMobile ? "14px" : "18px",
          lineHeight: "1.1", letterSpacing: "-0.03em",
          padding : isMobile ? "0px" : "0px 16px",
        }}>
          Your server is down right now. Does WhatsApp know yet?
        </h2>
        <p style={{
          fontSize: isMobile ? "14px" : "16px", color: "#64748B", maxWidth: "460px",
          margin: "0 auto", marginBottom: isMobile ? "28px" : "36px", lineHeight: "1.7",
          padding: isMobile ? "0 8px" : 0,
        }}>
          Paste one webhook. Sleep soundly. $9/mo.
        </p>
        <button
          onClick={() => { trackCTA("midpage_get_webhook", "mid_page"); navigate("/professional/login"); }}
          style={{
            background: "#0A0A0A",
            color: "#fff", fontSize: isMobile ? "15px" : "16px", fontWeight: "700",
            padding: isMobile ? "16px 32px" : "18px 44px", borderRadius: "14px",
            border: "none", cursor: "pointer",
            width: isMobile ? "100%" : "auto",
            maxWidth: isMobile ? "340px" : "none",
            boxShadow: "0 10px 32px -8px rgba(0,0,0,0.25)",
            transition: "all 0.25s ease",
            letterSpacing: "-0.01em",
          }}
          onMouseEnter={e => { e.target.style.transform = "translateY(-3px)"; e.target.style.boxShadow = "0 16px 40px -8px rgba(0,0,0,0.35)"; }}
          onMouseLeave={e => { e.target.style.transform = "translateY(0)"; e.target.style.boxShadow = "0 10px 32px -8px rgba(0,0,0,0.25)"; }}
        >
          Get Your Webhook →
        </button>
        <div style={{ marginTop: 12 }}>
          <span style={{ fontSize: "13px", color: "#94A3B8", fontWeight: "500" }}>No credit card · No WhatsApp API required</span>
        </div>
      </div>
    </div>
  );
}

// Scroll-to-top button (appears after scrolling past the hero)
function ScrollToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight * 0.8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!show) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: "24px",
      right: "14px",
      zIndex: 999,
      animation: "scrollTopIn 0.3s ease-out",
    }}>
      <style>{`
        @keyframes scrollTopIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .scroll-top-btn:hover { transform: translateY(-3px) !important; box-shadow: 0 12px 32px rgba(109,40,217,0.5) !important; }
      `}</style>
      <button
        className="scroll-top-btn"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        title="Back to top"
        style={{
          width: 40, height: 40,
          borderRadius: 14,
          background: "linear-gradient(135deg, #F5F7F8 0%, #F5F7F8 60%, #F5F7F8 100%)",
          border: "1.5px solid rgba(255,255,255,0.15)",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 8px 24px rgba(109,40,217,0.38)",
          transition: "all 0.22s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6D28D9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>
    </div>
  );
}

export default function LandingPage() {
  return (
    <>
      <Helmet>
        <title>MyHandle | WhatsApp Alerts for SaaS Founders. No API Setup.</title>
        <meta
          name="description"
          content="Turn Stripe, Vercel, and Sentry webhooks into instant WhatsApp pings. Server down, payment failed, customer churning — know in seconds, not hours. No WhatsApp API required. 5-min setup."
        />
        <link rel="canonical" href="https://chomske.com/" />
      </Helmet>

      <Navbar />
      <HeroSection />
      <StatsStrip />

      <SectionErrorBoundary>
        <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center" }}>Loading...</div>}>
          <ThreeBlockPage />
          <EscalationSection />
          <IntegrationsGrid />
          <AllFeatures />
          <BannerLandpage />
          <Footer />
        </Suspense>
      </SectionErrorBoundary>

      <ScrollToTop />
    </>
  );
}

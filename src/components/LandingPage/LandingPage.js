import { Suspense, lazy, useState, useEffect, Component } from "react";
import { Helmet } from "react-helmet";
import Navbar from "./Navbar.js";
import HeroSection from "./HeroSection";

const AgitateSection = lazy(() => import("./AgitateSection"));
const ThreeBlockPage = lazy(() => import("./ThreeBlockPage.js"));
const AllFeatures = lazy(() => import("./AllFeatures.js"));
const Footer = lazy(() => import("./Footer"));
const BannerLandpage = lazy(() => import("./BannerLandPage"));

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
              marginTop: "12px", padding: "10px 24px", background: "#4F46E5", color: "#fff",
              border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "600",
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

function ScrollToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight * 0.8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!show) return null;
  return (
    <div style={{ position: "fixed", bottom: "24px", right: "14px", zIndex: 999 }}>
      <style>{`
        @keyframes scrollTopIn { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .scroll-top-btn:hover { transform: translateY(-3px) !important; box-shadow: 0 12px 32px rgba(79,70,229,0.45) !important; }
      `}</style>
      <button
        className="scroll-top-btn"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        title="Back to top"
        style={{
          width: 40, height: 40, borderRadius: 12,
          background: "#fff",
          border: "1.5px solid rgba(79,70,229,0.2)",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 16px rgba(79,70,229,0.2)",
          transition: "all 0.22s cubic-bezier(0.4,0,0.2,1)",
          animation: "scrollTopIn 0.3s ease-out",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
        <title>Chomske | Stop finding out about churn from Stripe.</title>
        <meta
          name="description"
          content="Chomske connects to your MongoDB and shows you exactly who's about to churn, who's ready to upgrade, and who's stuck — before they make the decision for you. Not a chart. A list."
        />
        <link rel="canonical" href="https://chomske.com/" />
      </Helmet>

      <Navbar />
      <HeroSection />

      <SectionErrorBoundary>
        <Suspense fallback={<div style={{ padding: "4rem", textAlign: "center", fontFamily: "'Inter', sans-serif", color: "#94A3B8" }}>Loading...</div>}>

          {/* Section 1: The Problem */}
          <AgitateSection />

          {/* Section 2: How It Works + 4 Use Cases */}
          <ThreeBlockPage />

          {/* Section 3: Engine deep-dives */}
          <AllFeatures />

          {/* Section 4: Final CTA */}
          <BannerLandpage />

          <Footer />
        </Suspense>
      </SectionErrorBoundary>

      <ScrollToTop />
    </>
  );
}

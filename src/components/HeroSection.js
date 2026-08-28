import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import metaIcon from "../images/meta.png"

export default function Hero({
  heroImage = "https://storage.googleapis.com/myhandlebucket/Hero_IMG_MyHandle.mp4"
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [subdomain, setSubdomain] = useState("");
  const navigate = useNavigate();
  const [availability, setAvailability] = useState("idle");
  const [message, setMessage] = useState("");
  const abortRef = useRef(null);
  const debounceRef = useRef(null);
  const baseUrl = "/api/usersOn";


  // Track small-screen (<=600px)
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" && window.matchMedia("(max-width:600px)").matches
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width:600px)");
    const handler = (e) => setIsMobile(e.matches);
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else mq.addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", handler);
      else mq.removeListener(handler);
    };
  }, []);


  // === Inline styles
  const containerStyle = {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
padding: "clamp(100px, 10vh, 160px) clamp(16px, 8vw, 86px) clamp(24px, 8vh, 120px) clamp(16px, 8vw, 86px)",
    boxSizing: "border-box",
    fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
    color: "#0b1220",
    overflowX: "hidden", 
    background: '#f5f7f8'
  };

  const layoutStyle = {
    width: "100%",
    display: "flex",
    flexDirection: isMobile ? "column" : "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: isMobile ? "24px" : "140px"
  };

const leftColStyle = {
  flex: isMobile ? "0 1 auto" : "1 1 70%",
  display: "flex",
  flexDirection: "column",
  alignItems: isMobile ? "center" : "flex-start",
  textAlign: isMobile ? "center" : "left",
  minWidth: 0,
  width: "100%", // ✅ ADD THIS - ensures full width control
  padding: isMobile ? "0 2px" : "0", // ✅ ADD THIS - applies padding to entire left column
};


const rightColStyle = {
  flex: isMobile ? "0 1 auto" : "1 1 30%",
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: isMobile ? "center" : "flex-end",
  minWidth: 0,
  // optional but safe:
  backgroundColor: "#f5f7f8",
};

const videoWrapperStyle = {
  width: "100%",
  maxWidth: isMobile ? "360px" : "420px", // tweak as you like
  borderRadius: "16px",
  overflow: "hidden", // 🚀 clips that 1px edge
};

const heroImgStyle = {
  width: "100%",
  height: "auto",
  display: "block",
  objectFit: "cover",
  transform: "scale(1.01)", // tiny zoom to kill any baked-in border
};





const subStyle = {
  fontSize: "clamp(1rem, 1.8vw, 1.25rem)",
  lineHeight: 1.5,
  color: "#222831",
  margin: "0 0 clamp(18px, 2.5vw, 24px) 0",
  marginTop: "1rem",
  marginBottom: "2.5rem",
  textAlign: "left",
  fontWeight: 500

};

// inline version for mobile
const subStyleDataInline = {
  display: "block",
  fontSize: "clamp(1rem, 1.6vw, 1.25rem)",
  fontWeight: 500,
  color: "#001BB7",
  marginTop: '8px'
};

// block version for desktop/tablet
const subStyleDataBlock = {
  fontSize: "clamp(0.9rem, 1.6vw, 1.12rem)",
  lineHeight: 1.6,
  color: "#001BB7",
  maxWidth: 760,
  margin: "0 0 clamp(18px, 2.5vw, 24px) 0",
  fontWeight: 500
};



  const headlineStyle = {
    fontSize: "clamp(2rem, 4vw, 3rem)",
    fontWeight: 700,
    margin: "0 0 clamp(12px, 2vw, 16px) 0",
    fontFamily: "-apple-system, BlinkMacSystemFont, Inter, 'Helvetica Neue', Arial",
    textAlign: 'left',
    lineHeight: 1.35,
    color:'#44444E'
  };

  const mobileHeadlineStyle = {
    ...headlineStyle,
    fontSize: "clamp(2rem, 4vw, 3.5rem)",

  };

  // === CTA row with subdomain input + button (no external CSS)
  const ctaRowStyle = {
    width: "100%",
    display: "flex",
    flexDirection: isMobile ? "column" : "row",
    gap: isMobile ? "0px" : "16px",
    justifyContent: isMobile ? "center" : "flex-start",
    alignItems: "stretch",
    marginTop: "clamp(8px, 2vw, 16px)",

  };

const inputWrapStyle = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  background: "#FFFFFF",
  borderRadius: "14px",
  boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)",
  paddingLeft: "16px",
  paddingRight: "16px",
  height: isMobile ? "60px" : "52px",
  boxSizing: "border-box",
  width: "100%",
  maxWidth: isMobile ? "100%" : "480px",
};


  const inputStyle = {
    flex: 1,
    height: "100%",
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: "16px",
    fontWeight: 600,
    color: "#0b1220",
    paddingRight: "120px"
  };

  const suffixStyle = {
    position: "absolute",
    right: "16px",
    top: "50%",
    transform: "translateY(-50%)",
    fontSize: "15px",
    color: "#6b7280",
    whiteSpace: "nowrap",
    pointerEvents: "none"
  };

  const startBtnStyle = {
    appearance: "none",
    border: "none",
    height: isMobile ? "60px" : "52px",
    width: "100%",
    padding: "0 28px",
    fontSize: "16px",
    fontWeight: 700,
    borderRadius: "16px",
    cursor: "pointer",
    background: "#37353E",
    color: "#FFFFFF",
    boxShadow: "0 6px 14px rgba(0,0,0,0.12)",
    transition: "transform 0.15s ease, box-shadow 0.15s ease",
    alignSelf: isMobile ? "stretch" : "auto"

  };

  const startBtnHoverStyle = isHovered
    ? { transform: "translateY(-1px)", boxShadow: "0 10px 18px rgba(0,0,0,0.16)" }
    : {};


  const logoImgStyle = { width: "75%", height: "75%", objectFit: "contain", display: "block" };


  // Add this new component after your existing icon components (CheckIcon, CrossIcon, etc.)
const MetaVerifiedBlock = () => {
  const metaBlockStyle = {
    display: "flex",
    alignItems: "center",
    gap: isMobile ? "12px" : "16px",
    padding: isMobile ? "14px 16px" : "16px 20px",
    // background: "linear-gradient(135deg, #E8F5E9 0%, #F1F8E9 100%)",
    // border: "1px solid #C8E6C9",
    // borderRadius: "12px",
    marginTop: "12px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
    maxWidth: isMobile ? "100%" : "580px"
  };

  const metaIconStyle = {
    width: isMobile ? "42px" : "60px",
    height: isMobile ? "42px" : "60px",
    objectFit: "contain",
    flexShrink: 0
  };

  const leftSectionStyle = {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    flexShrink: 0,
    textAlign: "left"
  };

  const textColumnStyle = {
    display: "flex",
    flexDirection: "column",
    gap: "2px"
  };

  const metaTextStyle = {
    fontSize: isMobile ? "20px" : "48px",
    fontWeight: 600,
    color: "#000000",
    lineHeight: 1.2
  };

  const techProviderStyle = {
    fontSize: isMobile ? "14px" : "18px",
    fontWeight: 500,
    color: "#44444E",
    lineHeight: 1.2
  };

  const dividerStyle = {
    width: "1px",
    height: isMobile ? "36px" : "40px",
    background: "linear-gradient(to bottom, transparent, #C8E6C9 20%, #C8E6C9 80%, transparent)",
    flexShrink: 0
  };

  const descriptionStyle = {
    fontSize: isMobile ? "14px" : "15px",
    fontWeight: 500,
    color: "#44444E",
    lineHeight: 1.4,
    flex: 1,
    marginTop: '12px',
    textAlign: "left"

  };

  return (
    <div style={metaBlockStyle}>
      {/* Left: Icon + Meta Text */}
      <div style={leftSectionStyle}>
        <img 
          src={metaIcon}
          alt="Meta" 
          style={metaIconStyle}
        />
        <div style={textColumnStyle}>
          <span style={metaTextStyle}>Meta</span>
          <span style={techProviderStyle}>Tech Provider</span>
        </div>
      </div>

      {/* Divider */}
      <div style={dividerStyle}></div>

      {/* Right: Description */}
      <p style={descriptionStyle}>
        Chomske has been certified by Meta as a Verified Tech Provider.
      </p>
    </div>
  );
};



    const highlightText = {
    color: "#001BB7",
    display: "inline-flex",
     fontSize: "clamp(2rem, 4vw, 3rem)",
    fontWeight: 700,
    fontFamily: "-apple-system, BlinkMacSystemFont, Inter, 'Helvetica Neue', Arial",
 

  };

     const highlightTextMobile = {
    color: "#001BB7",
    display: "inline-flex",
     fontSize: "clamp(2rem, 4vw, 3.5rem)",
    fontWeight: 700,
    fontFamily: "-apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', Arial",
 

  };

  // NEW: status row styles (inline, no external CSS)
  const statusRowStyle = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minHeight: 24,
    paddingTop: 6,
    paddingLeft: 4,
    fontSize: 15,
    fontWeight: 500,
  marginBottom: "8px"

  };

  const statusColor =
    availability === "available"
      ? "#4C763B" // green-700
      : availability === "taken"
      ? "#b91c1c" // red-700
      : availability === "invalid"
      ? "#92400e" // amber-700
      : availability === "error"
      ? "#7c3aed" // violet-700
      : "#4C763B"; // gray-500


  // Sanitize input to allowed subdomain chars
  const onSubdomainChange = (e) => {
    const raw = e.target.value;
    const cleaned = raw.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setSubdomain(cleaned);
  };

  const isValidSubdomain = (s) =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s) && s.length > 0;

  // NEW: debounce & availability check
  useEffect(() => {
    // reset UI if empty
    if (!subdomain) {
      setAvailability("idle");
      setMessage("");
      if (abortRef.current) abortRef.current.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      return;
    }

    // invalid? show message, skip network
    if (!isValidSubdomain(subdomain)) {
      setAvailability("invalid");
      setMessage("Only letters, numbers, and hyphens. Must start/end with a letter or number.");
      if (abortRef.current) abortRef.current.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      return;
    }

    setAvailability("checking");
    setMessage("Checking…");

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      // cancel previous in-flight request (if any)
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        // Adjust the URL to your backend route
        const res = await axios.post(
          baseUrl + "/subdomain/check",
          { subdomain },
          { signal: controller.signal }
        );

        const available = !!res?.data?.available;
        if (available) {
          setAvailability("available");
          setMessage(`${subdomain}.chomske.com is available!`);
        } else {
          setAvailability("taken");
          setMessage(`${subdomain}.chomske.com is taken.`);
        }
      } catch (err) {
        if (axios.isCancel?.(err) || err?.name === "CanceledError" || err?.name === "AbortError") {
          // request was aborted due to new keystrokes: ignore
          return;
        }
        setAvailability("error");
        setMessage("Couldn't check right now. Please try again.");
      }
    }, 400); // 400ms debounce

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [subdomain]);

  // NEW: tiny inline icons (SVG) so we don’t need external CSS
  const Spinner = () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      style={{ display: "block" }}
      aria-label="Loading"
    >
      <circle cx="12" cy="12" r="10" fill="none" stroke="#4C763B" strokeWidth="3" opacity="0.25" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        fill="none"
        stroke="#4C763B"
        strokeWidth="3"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="0.8s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  );

  const CheckIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20 6L9 17l-5-5"
        fill="none"
        stroke="#043915"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const CrossIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6L6 18"
        fill="none"
        stroke="#dc2626"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );

  const WarnIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 9v4m0 4h.01" stroke="#b45309" strokeWidth="2" strokeLinecap="round" />
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" fill="none" stroke="#b45309" strokeWidth="2" />
    </svg>
  );

  const ErrorIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="none" stroke="#7c3aed" strokeWidth="2" />
      <path d="M12 7v6m0 4h.01" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );

  const StatusIcon = () => {
    if (availability === "checking") return <Spinner />;
    if (availability === "available") return <CheckIcon />;
    if (availability === "taken") return <CrossIcon />;
    if (availability === "invalid") return <WarnIcon />;
    if (availability === "error") return <ErrorIcon />;
    return null;
  };

  return (
    <section style={containerStyle} aria-label="Hero">
      <div style={layoutStyle}>
        {/* LEFT: Content */}
        <div style={leftColStyle}>
          {/* Desktop headline */}
          <h1
            style={{ ...headlineStyle, display: isMobile ? "none" : "block" }}
            aria-hidden={isMobile}
          >
            {"Instagram "}
                 <div style={highlightText}>AutoDM and Bio</div>
            {" Tool for Creators under 50k Followers."}
          </h1>

          {/* Mobile headline */}
          <h1
            style={{ ...mobileHeadlineStyle, display: isMobile ? "block" : "none", margin: 0 }}
            aria-hidden={!isMobile}
          >
            <span style={{ display: "block", lineHeight: 1.25 }}>
              Instagram <div style={highlightTextMobile}>AutoDM and Bio</div> Tool for Creators under 50k Followers.
            </span>
          </h1>

         <p style={subStyle}>
  Monthly 25,00,000 AutoDMs quota, Unlimited Contacts, Unlimited Bio Links & more —all for just ₹399.
  {isMobile ? (
    <>
      {" "}
      {/* <span style={subStyleDataInline}>Built in India, your data stays in India.</span> */}
    </>
  ) : null}
</p>

{/* {!isMobile && (
  <p style={subStyleDataBlock}>
    Built in India, your data stays in India.
  </p>
)} */}


          {/* Subdomain input + CTA */}
          <div style={ctaRowStyle}>
            <label
              htmlFor="subdomain"
              style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}
            >
              Enter your subdomain
            </label>

            <div style={{ display: "flex", flexDirection: "column", minWidth: isMobile ? "100%" : "360px", maxWidth: "480px" }}>
              <div style={inputWrapStyle}>
                <input
                  id="subdomain"
                  inputMode="latin"
                  autoComplete="off"
                  spellCheck="false"
                  placeholder="Ex: mkbhd, mumbiker"
                  value={subdomain}
                  onChange={onSubdomainChange}
                  style={inputStyle}
                  aria-describedby="availability-msg"
                  aria-invalid={availability === "invalid" || availability === "taken"}
                />
                <span style={suffixStyle}>.chomske.com</span>
              </div>

              {/* NEW: status row */}
              <div id="availability-msg" style={{ ...statusRowStyle, color: statusColor }}>
                <StatusIcon />
                <span>{message}</span>
              </div>
            </div>

            <button
            onClick={()=> navigate('/professional/login')}
              style={{ ...startBtnStyle, ...startBtnHoverStyle }}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              aria-label="Get started for free"
              disabled={availability === "checking"}
            >
              Get started for free
            </button>
          </div>


   <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'center' : 'flex-start' }}>

  <MetaVerifiedBlock />
</div>
</div>




     {/* RIGHT: Video */}
<div style={rightColStyle}>
  {heroImage ? (
    <div style={videoWrapperStyle}>
      <video
        src={heroImage}
        style={heroImgStyle}
        autoPlay
        loop
        muted
        playsInline
      />
    </div>
  ) : null}
</div>


      </div>
    </section>
  )
}

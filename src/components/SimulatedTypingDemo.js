import { useEffect, useRef, useState } from 'react';
import InsertEmoticonIcon from '@mui/icons-material/InsertEmoticon';
import ImageIcon from '@mui/icons-material/Image';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import MouseIcon from '@mui/icons-material/AdsClick';
import avatarImg from '../images/man-6086273_1280.jpg';
import { useMediaQuery } from '@mui/material';

export default function SimulatedTypingDemo() {
 
   const isMobile = useMediaQuery('(max-width:600px)');

  const draftText = isMobile
    ? "Despite the abundance of advice and tools, most people struggle with time management. Research indicates that only about 18% of individuals have an effective system in place. Understanding the root causes is the first step toward improvement."
    : `Despite the abundance of advice and tools, most people struggle with time management. Research indicates that only about 18% of individuals have an effective system in place. Understanding the root causes is the first step toward improvement.

Lack of Planning
Many people fail to plan their days, leading to reactive rather than proactive work. Without a clear roadmap, it’s easy to miss deadlines and lose motivation.

Distractions and Multitasking
Digital notifications and the temptation to multitask fragment attention...`;

  const finalPost = isMobile
    ? `Why Most People Struggle with Time Management and How to Fix It

Despite the abundance of advice and tools, most people struggle with time management. 

Research indicates that only about 18% of individuals have an effective system in place.

Understanding the root causes is the first step toward improvement.

1. Lack of Planning
Many people fail to plan their days, leading to reactive rather than proactive work.... `
    : `Why Most People Struggle with Time Management and How to Fix It

Despite the abundance of advice and tools, most people struggle with time management. 

Research indicates that only about 18% of individuals have an effective system in place. 

Understanding the root causes is the first step toward improvement.

1. Lack of Planning
Many people fail to plan their days, leading to reactive rather than proactive work.... `;

  const [typedDraft, setTypedDraft] = useState('');
  const [typedFinal, setTypedFinal] = useState('');
  const [showMouse, setShowMouse] = useState(false);
  const [mouseClicked, setMouseClicked] = useState(false);
  const [startFinalTyping, setStartFinalTyping] = useState(false);
  const [visible, setVisible] = useState(false);

  const containerRef = useRef(null);
  const buttonRef = useRef();
  const mouseRef = useRef();

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
    fontFamily: 'Inter',
    padding: isMobile ? "0px 12px" : "0px 0px"

  };


  const intro = {
    maxWidth: 860,
    margin: "0 auto",
    textAlign: "center",
    color: "#374151",
    fontSize: isMobile ? "0.92rem" : "clamp(0.92rem, 1.2vw, 1.02rem)",
    marginBottom: isMobile ? 6 : 0,
  };

    const wrap = {
    boxSizing: "border-box",
    padding: isMobile ? "16px" : "clamp(24px, 4vw, 46px)",
    marginTop: isMobile ? "4rem" : "6rem",
    width: "100%",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
    color: "#0b1220",
  };


  // IntersectionObserver to detect when component is visible
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Start typing the draft post
  useEffect(() => {
    if (!visible) return;

    let i = 0;
    const interval = setInterval(() => {
      setTypedDraft((prev) => prev + draftText[i]);
      i++;
      if (i >= draftText.length) {
        clearInterval(interval);
        setTimeout(() => setShowMouse(true), 600);
      }
    }, 7);
    return () => clearInterval(interval);
  }, [visible]);

  // Animate mouse to Rewrite button and trigger click
// Animate mouse to Rewrite button and trigger click
useEffect(() => {
  if (!showMouse || !buttonRef.current || !mouseRef.current) return;

  const mouse = mouseRef.current;
  const button = buttonRef.current;

  // Move mouse visually (optional)
  const rect = button.getBoundingClientRect();
  const endX = rect.left + rect.width / 2;
  const endY = rect.top + rect.height / 2;

  mouse.style.transition = 'transform 1.2s ease';
  mouse.style.transform = `translate(${endX}px, ${endY}px)`;

  // Programmatic click — always reliable
  setTimeout(() => {
    setMouseClicked(true);
    button.classList.add('clicked-visual');
    button.click(); // ✅ simulate real click
    setTimeout(() => {
      setStartFinalTyping(true);
      setMouseClicked(false);
      button.classList.remove('clicked-visual');
      setShowMouse(false); // hide mouse
    }, 600);
  }, 1300);
}, [showMouse]);



  // Start typing the final rewritten post
  useEffect(() => {
    if (!startFinalTyping) return;
    let i = 0;
    const interval = setInterval(() => {
      setTypedFinal((prev) => prev + finalPost[i]);
      i++;
      if (i >= finalPost.length) clearInterval(interval);
    }, 7);
    return () => clearInterval(interval);
  }, [startFinalTyping]);

  return (
    <>
      <style>{`
      
        .demo-container {
          display: flex;
          flrx: 0 0 auto;
          justify-content : center;
          flex-direction: column;
          gap: 2rem;
          padding: 2rem 1rem;
        }

        @media(min-width: 768px) {
          .demo-container {
            flex-direction: row;
            justify-content: center;
            align-items: flex-start;
            padding: 4rem;
          }
        }

        .box {
          width: 100%;
          max-width: 480px;
          min-height: 120px;
          border-radius: 12px;
          padding: 1rem;
          font-family: Inter, sans-serif;
          font-size: 1rem;
          background: #fff;
          border: 1px solid #ccc;
          box-shadow: 0 2px 10px rgba(0,0,0,0.05);
          white-space: pre-wrap;
        }

        .linkedin-card {
          padding: 1rem;
          border-radius: 12px;
          background: #fff;
          border: 1px solid #ddd;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
          max-width: 480px;
        }

        .linkedin-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .linkedin-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
        }

        .linkedin-name {
          font-weight: 600;
        }

        .linkedin-role {
          font-size: 0.85rem;
          color: #666;
        }

        .linkedin-toolbar {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-top: 1rem;
        }

        .rewrite-button {
          background: #ccc;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 26px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
        }

        .button.clicked-visual {
          box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2);
          transform: scale(0.98);
          transition: transform 0.1s ease, box-shadow 0.1s ease;
        }

        .mouse-icon {
          position: fixed;
          z-index: 1000;
          top: 0;
          left: 0;
          transform: translate(0, 0);
          transition: transform 1.2s ease;
          pointer-events: none;
          color: #333;
          background: #fff;
          border-radius: 50%;
          padding: 2px;
        }

        .mouse-icon.clicked {
          filter: brightness(0.8);
          transform: scale(0.95);
        }

        .publish-toolbar {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-top: 1rem;
        }

        .publish-button {
          background-color: #ccc;
          color: #fff;
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 20px;
          font-weight: 500;
          cursor: not-allowed;
        }

        .publish-button.enabled {
          background-color: #6366f1;
          cursor: pointer;
        }
      `}</style>

    <section aria-label="Top problems split view" style={wrap}>

        <div style={sectionLabel}>#LinkedIn Pilot</div>
      <h3 style={bigTitle}>Transform Drafts into Authentic LinkedIn Posts</h3>
      <p style={intro}>
        Paste your raw ideas and let the tool instantly rewrite them into polished posts — preserving your unique voice, style, and authenticity with zero extra effort.
      </p>
      </section>

      {showMouse && (
        <div
          ref={mouseRef}
          className={`mouse-icon ${mouseClicked ? 'clicked' : ''}`}
        >
          <MouseIcon fontSize="medium" />
        </div>
      )}

      <div className="demo-container" ref={containerRef}>
        <div style={{ display: 'flex', justifyContent: 'center', flex: 1 }}>
          <div className="linkedin-card">
            <div className="linkedin-header">
              <img src={avatarImg} alt="avatar" className="linkedin-avatar" />
              <div>
                <div className="linkedin-name">Bhaskar Sriram</div>
                <div className="linkedin-role">Post to Anyone</div>
              </div>
            </div>
            <div className="box" style={{ border: 'none', boxShadow: 'none' }}>{typedDraft}</div>
            <div className="linkedin-toolbar">
              <button className="rewrite-button" ref={buttonRef}>
                ✨ Rewrite with AI
              </button>
              <ContentCopyIcon fontSize="small" />
              <InsertEmoticonIcon fontSize="small" />
              <ImageIcon fontSize="small" />
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div className="linkedin-card">
            <div className="linkedin-header">
              <img src={avatarImg} alt="avatar" className="linkedin-avatar" />
              <div>
                <div className="linkedin-name">Bhaskar Sriram</div>
                <div className="linkedin-role">Post to Anyone</div>
              </div>
            </div>
            <div className="box" style={{ border: 'none', boxShadow: 'none' }}>{typedFinal || 'LinkedIn post — rewritten in your tone — will appear here...'}</div>
            <div className="publish-toolbar">
              <CalendarMonthIcon fontSize="small" />
              <button className={`publish-button ${typedFinal.length > 0 ? 'enabled' : ''}`}>
                Publish Now
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

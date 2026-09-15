import { useState, useEffect, useRef } from "react";
import { GoogleLogin } from "@react-oauth/google";
import api, { errorMessage } from "../../api";
import useIsMobile from "../../hooks/useIsMobile";
import Logo from "../Shell/Logo";

/** Where the page's one sign-in button lives, for every other CTA to scroll to. */
const SIGNIN_ANCHOR = "lipi-signin";

/** The content column. Wide enough for a two-column demo, narrow enough to scan. */
const MAX = 1200;

/**
 * The landing page.
 *
 * ── WHY THIS PAGE IS DARK WHEN THE APP IS NOT ────────────────────────────────
 * They are answering different questions. The app is a light, quiet workspace
 * somebody sits inside every morning, where motion is limited to feedback. This
 * page has four seconds to convince a creator who has never heard of us that
 * the thing is real, current, and built by people who finish things. The two
 * rule sets are kept apart on purpose (see index.css).
 *
 * ── WHAT IT SELLS ────────────────────────────────────────────────────────────
 * Not transcription, and not "AI". A creator's slowest hour is deciding what to
 * cover and then writing the thing, and after it, cutting and captioning the
 * recording. The headline is a promise about TIME, in the language they will
 * actually record in, which is why the one moving word in it is the language
 * itself, cycling through nine scripts.
 *
 * ── HOW IT MOVES ─────────────────────────────────────────────────────────────
 * Every value comes from the motion tokens in index.css (Emil Kowalski's
 * design-engineering rules, .claude/skills/emil-design-eng): strong ease-out
 * for anything arriving, ease-in-out for anything moving on screen, linear for
 * progress and marquees, presses at 0.97, hover only where there is a pointer.
 * Explanatory demos may run longer than UI; nothing else does.
 *
 * ── EVERY ANIMATION IS OPTIONAL ──────────────────────────────────────────────
 * Reduced motion turns travel into fades, and the page must read identically
 * with every animation off: reveals resolve to visible, the language word still
 * shows a language, and each demo settles on its finished frame.
 */

/**
 * Nine languages in their own scripts, plus English.
 *
 * Written out rather than generated from a locale list: these are the ones the
 * voice profiler has actually been used in. Each carries its Latin name for the
 * screen reader, since a screen reader will not switch scripts mid-sentence.
 */
const LANGUAGES = [
  { native: "हिन्दी", name: "Hindi" },
  { native: "తెలుగు", name: "Telugu" },
  { native: "தமிழ்", name: "Tamil" },
  { native: "मराठी", name: "Marathi" },
  { native: "ಕನ್ನಡ", name: "Kannada" },
  { native: "বাংলা", name: "Bengali" },
  { native: "ગુજરાતી", name: "Gujarati" },
  { native: "മലയാളം", name: "Malayalam" },
  { native: "ਪੰਜਾਬੀ", name: "Punjabi" },
  { native: "English", name: "English" },
];

/* ── THE FOUR ─────────────────────────────────────────────────────────────────
   Kept as "r,g,b" triples because almost every use is an rgba() at some alpha.
   Blue is measured, not chosen: #1B17FF is the dominant pixel of logo192.png,
   hue 241, lightened until it reads on this ground. Measured on #0A0B0F:
     BLUE    #7C79FF   hue 241    5.65:1
     PURPLE  #DC7BFF   hue 284    7.79:1
     GREEN   #3DD68C   hue 151   10.49:1
     RED     #FF5A5A   hue   0    6.43:1
   Colour is never the ONLY thing carrying meaning here: every section is
   labelled and every demo explains itself in words. */
const BLUE = "124,121,255";
const PURPLE = "220,123,255";
const GREEN = "61,214,140";
const RED = "255,90,90";
const WHITE = "255,255,255";

const reducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Take the visitor to the real Google button (there must only ever be one). */
function scrollToSignIn() {
  const el = document.getElementById(SIGNIN_ANCHOR);
  if (!el) return window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
  el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
}

/**
 * One observer for every reveal on the page.
 *
 * It fires once per element and then unobserves it, so the cost falls to zero
 * once a section has been read past.
 *
 * ── IT FAILS OPEN, AND THAT IS DELIBERATE ────────────────────────────────────
 * The hidden state lives under `.hg-armed`, added HERE after checking the
 * observer exists. Done the other way round, a browser without it, or an error
 * thrown before this effect runs, would leave every section below the fold as a
 * blank dark screen with the content sitting in the DOM unseen.
 */
function useReveal() {
  const root = useRef(null);

  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    el.classList.add("hg-armed");
    const targets = el.querySelectorAll(".hg-reveal");

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      // A little before the element is fully on screen, so the motion is mostly
      // done by the time it is in comfortable reading position.
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );

    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);

  return root;
}

/**
 * Is this element on screen? The demos are looping state machines; left running
 * off-screen they would burn a timer and a re-render every second for nothing.
 */
function useInView(ref, { once = false, threshold = 0.25 } = {}) {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setInView(true); return; }

    const io = new IntersectionObserver(
      ([e]) => {
        setInView(e.isIntersecting);
        if (e.isIntersecting && once) io.disconnect();
      },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, once, threshold]);

  return inView;
}

/**
 * The clock behind every demo: advance a phase counter while visible, loop, and
 * stop dead when scrolled away.
 *
 * Reduced motion pins it to the LAST phase: the end of each scene is its
 * finished state, which is the frame that actually explains the product.
 */
function useSceneClock(phaseCount, { active, interval = 1100, hold = 2 }) {
  const [phase, setPhase] = useState(0);
  const still = reducedMotion();

  useEffect(() => {
    if (still) { setPhase(phaseCount - 1); return; }
    if (!active) return;
    // `hold` extra ticks at the end so the finished state is readable before it
    // resets; a scene that restarts the instant it completes reads as a glitch.
    const t = setInterval(() => setPhase((p) => (p + 1) % (phaseCount + hold)), interval);
    return () => clearInterval(t);
  }, [active, phaseCount, interval, hold, still]);

  return Math.min(phase, phaseCount - 1);
}

/* ═══════════════════════════════════════════════════════════════════════════ */

export default function LandingPage({ onSignedIn, checking }) {
  const isMobile = useIsMobile();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const page = useReveal();

  async function handleCredential(credentialResponse) {
    setError("");
    setBusy(true);
    try {
      const { data } = await api.post("/auth/google", {
        credential: credentialResponse.credential,
      });
      onSignedIn(data.user);
    } catch (err) {
      setError(errorMessage(err, "Sign-in failed. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  // The gutter scales with the viewport; the content column caps at MAX.
  const pad = isMobile ? "20px" : "clamp(28px, 5vw, 80px)";

  return (
    <div ref={page} className="hg-dark" style={{ position: "relative", minHeight: "100vh", overflowX: "hidden" }}>
      <Nav pad={pad} isMobile={isMobile} />
      <Hero
        isMobile={isMobile}
        pad={pad}
        onCredential={handleCredential}
        onError={() => setError("Google sign-in was cancelled or blocked.")}
        error={error}
        busy={busy || checking}
      />
      <SourceBar pad={pad} isMobile={isMobile} />
      <HowItWorks isMobile={isMobile} pad={pad} />
      <BringYourOwn isMobile={isMobile} pad={pad} />
      <EditVideos isMobile={isMobile} pad={pad} />
      <WhatYouGet isMobile={isMobile} pad={pad} />
      <VoiceProof isMobile={isMobile} pad={pad} />
      <Niches isMobile={isMobile} pad={pad} />
      <ClosingCta isMobile={isMobile} pad={pad} busy={busy} />
      <Footer pad={pad} isMobile={isMobile} />
    </div>
  );
}

/* ── Chrome ────────────────────────────────────────────────────────────────── */

/**
 * The bar. The page's own ground at rest, so there is no seam above the hero;
 * glass once scrolled, which is the only way a bar stays legible over the
 * sections that pass under it. Its colour changes, so plain `ease`.
 */
function Nav({ pad, isMobile }) {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      style={{
        position: "sticky", top: 0, zIndex: 40,
        padding: `${isMobile ? 10 : 12}px ${pad}`,
        background: stuck ? "rgba(10,11,15,.72)" : "var(--d-bg)",
        backdropFilter: stuck ? "blur(16px) saturate(160%)" : "none",
        WebkitBackdropFilter: stuck ? "blur(16px) saturate(160%)" : "none",
        borderBottom: `1px solid ${stuck ? "var(--d-line-soft)" : "transparent"}`,
        transition: "background-color 240ms ease, border-color 240ms ease",
      }}
    >
      <div style={{ maxWidth: MAX, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <a href="#start" aria-label="Lipi, back to the top" style={{ textDecoration: "none" }}>
          <Logo color="var(--d-ink)" size={isMobile ? 24 : 26} fontSize={isMobile ? 17.5 : 18.5} />
        </a>

        {!isMobile && (
          <nav aria-label="Sections" style={{ display: "flex", alignItems: "center", gap: 28 }}>
            {[["How it works", "how"], ["Edit videos", "edit"], ["Your voice", "voice"], ["Niches", "niches"]].map(([label, id]) => (
              <a key={id} href={`#${id}`} className="lp-link" style={{ fontSize: 13.5, fontWeight: 500 }}>
                {label}
              </a>
            ))}
          </nav>
        )}

        <button type="button" className="lp-btn lp-btn--ghost lp-btn--sm" onClick={scrollToSignIn}>
          Sign in
        </button>
      </div>
    </header>
  );
}

/* ── Hero ──────────────────────────────────────────────────────────────────── */

function Hero({ isMobile, pad, onCredential, onError, error, busy }) {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef(null);

  const watch = () => {
    videoRef.current?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
    setPlaying(true);
  };

  return (
    <section
      id="start"
      className="hg-hero"
      style={{ position: "relative", padding: `${isMobile ? 30 : 64}px ${pad} ${isMobile ? 60 : 104}px`, overflow: "hidden" }}
    >
      <Grid />

      <div style={{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: MAX, margin: "0 auto" }}>
        <a
          href="#edit"
          className="hg-reveal lp-eyebrow"
          style={{ "--i": 0, textDecoration: "none", gap: 10, padding: "4px 12px 4px 4px" }}
        >
          <span
            style={{
              fontSize: 11.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
              color: "#0B0C10", background: "var(--d-green)",
            }}
          >
            New
          </span>
          <span style={{ color: "var(--d-ink)", fontWeight: 550 }}>Caption and edit your videos too</span>
          <Arrow />
        </a>

        <h1
          className="hg-reveal"
          style={{
            "--i": 1,
            fontSize: isMobile ? "clamp(31px, 8.6vw, 42px)" : "clamp(40px, 4.5vw, 68px)",
            lineHeight: 1.05,
            letterSpacing: "-0.045em",
            fontWeight: 750,
            color: "var(--d-ink)",
            margin: `${isMobile ? 22 : 28}px auto 0`,
            maxWidth: 1120,
          }}
        >
          Script writer for Indian content creators.{" "}
          <span style={{ display: isMobile ? "inline" : "block", color: "rgba(244,244,246,.58)" }}>
            One that sounds like you, in <LanguageFlip />
          </span>
        </h1>

        <p
          className="hg-reveal"
          style={{
            "--i": 2,
            fontSize: isMobile ? 16 : "clamp(16.5px, 1.2vw, 19px)",
            lineHeight: 1.6,
            color: "var(--d-body)",
            margin: `${isMobile ? 18 : 24}px auto 0`,
            maxWidth: 640,
          }}
        >
          Lipi watches 120+ sources all day and finds the stories worth making a video
          about. Then it writes the entire script the way you write, in your language.
        </p>

        {/* ── THE ONLY GoogleLogin ON THIS PAGE ──────────────────────────────
            google.accounts.id.initialize() is global singleton state, so a second
            <GoogleLogin> anywhere on the page would overwrite this one and leave
            it failing at Google's consent screen. Every other CTA scrolls here. */}
        <div
          id={SIGNIN_ANCHOR}
          className="hg-reveal"
          style={{
            "--i": 3,
            display: "flex", flexWrap: "wrap", gap: 12,
            justifyContent: "center", alignItems: "center",
            margin: `${isMobile ? 28 : 36}px 0 0`,
            scrollMarginTop: 96,
          }}
        >
          <SignIn onCredential={onCredential} onError={onError} busy={busy} />
          <button type="button" className="lp-btn lp-btn--ghost" onClick={watch} style={{ height: 40, paddingLeft: 14 }}>
            <span
              aria-hidden="true"
              style={{ width: 22, height: 22, borderRadius: "50%", display: "grid", placeItems: "center", background: "rgba(255,255,255,.1)" }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5l13 7.5-13 7.5z" /></svg>
            </span>
            Watch the demo
          </button>
        </div>

        {error && (
          <div role="alert" style={{ marginTop: 14, fontSize: 13.5, color: "#FF8E8A" }}>
            {error}
          </div>
        )}

        <div
          className="hg-reveal"
          style={{
            "--i": 4,
            marginTop: 18, display: "flex", flexWrap: "wrap",
            alignItems: "center", justifyContent: "center", gap: "10px 14px",
            fontSize: 13.5, color: "var(--d-mute)",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            <Check tone={GREEN} />
            100 free credits to start
          </span>
          {!isMobile && <span aria-hidden="true" style={{ width: 1, height: 14, background: "rgba(255,255,255,.14)" }} />}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            Record for <PlatformMarks size={14} />
          </span>
        </div>

        <div ref={videoRef} className="hg-reveal" style={{ "--i": 5, position: "relative", marginTop: isMobile ? 44 : 72, scrollMarginTop: 90 }}>
          <div className="lp-glow" aria-hidden="true" />
          <HeroVideo isMobile={isMobile} playing={playing} onPlay={() => setPlaying(true)} />
        </div>
      </div>
    </section>
  );
}

/**
 * A fine grid fading out before it reaches the headline. The radial is a MASK,
 * not colour: it only decides where the greyscale lines stop.
 */
function Grid() {
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute", inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(110% 70% at 50% 0%, #000 30%, transparent 72%)",
          WebkitMaskImage: "radial-gradient(110% 70% at 50% 0%, #000 30%, transparent 72%)",
        }}
      />
    </div>
  );
}

/**
 * The language word.
 *
 * Every word is absolutely positioned in one slot whose WIDTH is the current
 * word's, measured from the rendered nodes, so the line never carries the
 * widest of nine invisible scripts. The leaving word rises and blurs away while
 * the arriving one sharpens in from below (index.css .hg-lang-word): the blur
 * is what hides two different scripts overlapping for a frame.
 */
function LanguageFlip() {
  const [{ i, prev }, setState] = useState({ i: 0, prev: -1 });
  const [widths, setWidths] = useState([]);
  const items = useRef([]);

  useEffect(() => {
    const t = setInterval(() => setState((s) => ({ prev: s.i, i: (s.i + 1) % LANGUAGES.length })), 2200);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const measure = () => setWidths(items.current.map((el) => (el ? el.offsetWidth : 0)));
    measure();
    // Webfonts land after first paint; a width measured before they do is the
    // fallback font's, an inch wrong until something forced a re-measure.
    document.fonts?.ready?.then(measure).catch(() => {});
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return (
    <span
      role="img"
      aria-label="your language: Hindi, Telugu, Tamil, Marathi, Kannada, Bengali, Gujarati, Malayalam, Punjabi or English"
      className="indic hg-lang-slot"
      style={{
        position: "relative",
        display: "inline-block",
        verticalAlign: "baseline",
        lineHeight: 1.2,
        width: widths[i] ? `${widths[i]}px` : "auto",
      }}
    >
      {/* The baseline anchor: one in-flow, invisible copy of the current word,
          so the slot sits on the line and gets the right height for every
          script without a hand-tuned number. */}
      <span aria-hidden="true" style={{ visibility: "hidden", whiteSpace: "nowrap" }}>
        {LANGUAGES[i].native}
      </span>

      {LANGUAGES.map((l, n) => (
        <span
          key={l.name}
          ref={(el) => { items.current[n] = el; }}
          aria-hidden="true"
          className="hg-lang-word"
          data-state={n === i ? "on" : n === prev ? "gone" : "off"}
          style={{ color: "var(--yt-bright)" }}
        >
          {l.native}
        </span>
      ))}
    </span>
  );
}

/* ── The product, shown ────────────────────────────────────────── */

const DEMO_VIDEO_ID = "yDEUsSGm8YM";

/**
 * The poster sizes, best first. YouTube answers a missing size with a valid
 * 120x90 grey placeholder and a 404 that browsers still decode, so `error`
 * never fires; the size is chosen by what actually ARRIVES (onLoad measures it).
 */
const POSTER_SIZES = ["maxresdefault", "sddefault", "hqdefault"];
const PLACEHOLDER_MAX_W = 200;

/**
 * The hero's demo: the real product, on video.
 *
 * The YouTube iframe (about a megabyte of third-party script) is created only on
 * the press, with autoplay, so the click that asks for the video is the click
 * that starts it. What renders first is the poster and a play button.
 *
 * Framed in a bezel: an outer panel with a few pixels of padding and a lit top
 * edge around the picture, which is what lets a screenshot sit on a dark page as
 * an object rather than a hole.
 */
function HeroVideo({ isMobile, playing, onPlay }) {
  const [size, setSize] = useState(0);
  const nextSize = () => setSize((n) => Math.min(n + 1, POSTER_SIZES.length - 1));

  return (
    <div
      style={{
        position: "relative", zIndex: 1,
        width: "100%", maxWidth: 1080, margin: "0 auto",
        padding: isMobile ? 5 : 8,
        borderRadius: isMobile ? 18 : 26,
        background: "linear-gradient(180deg, rgba(255,255,255,.09), rgba(255,255,255,.03))",
        border: "1px solid rgba(255,255,255,.10)",
        boxShadow: "var(--d-highlight), 0 50px 100px -40px rgba(0,0,0,.8)",
      }}
    >
      <div
        style={{
          position: "relative", aspectRatio: "16 / 9", overflow: "hidden",
          borderRadius: isMobile ? 13 : 19, background: "#0E1016",
          border: "1px solid rgba(255,255,255,.06)",
        }}
      >
        {playing ? (
          <iframe
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
            src={`https://www.youtube-nocookie.com/embed/${DEMO_VIDEO_ID}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
            title="Lipi: from today's news to a script in your own voice"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            onClick={onPlay}
            aria-label="Play the Lipi demo video"
            className="hg-press-soft"
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%",
              padding: 0, border: "none", background: "none", cursor: "pointer",
              display: "grid", placeItems: "center",
            }}
          >
            <img
              src={`https://i.ytimg.com/vi/${DEMO_VIDEO_ID}/${POSTER_SIZES[size]}.jpg`}
              alt=""
              aria-hidden="true"
              onError={nextSize}
              onLoad={(e) => { if (e.currentTarget.naturalWidth <= PLACEHOLDER_MAX_W) nextSize(); }}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
            {/* Darkened: a thumbnail is designed to outshout a grid of other
                thumbnails, and this one sits under a headline. */}
            <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(10,11,15,.12), rgba(10,11,15,.46))" }} />
            <span
              aria-hidden="true"
              className="hg-play"
              style={{
                position: "relative",
                width: isMobile ? 58 : 76, height: isMobile ? 58 : 76,
                borderRadius: "50%", display: "grid", placeItems: "center",
                background: "var(--yt-bright)",
                boxShadow: `0 18px 44px -12px rgba(${BLUE},.75), inset 0 1px 0 rgba(255,255,255,.4)`,
              }}
            >
              <svg width={isMobile ? 22 : 28} height={isMobile ? 22 : 28} viewBox="0 0 24 24" fill="#0A0A0C" aria-hidden="true" style={{ marginLeft: isMobile ? 3 : 4 }}>
                <path d="M7 4.5l13 7.5-13 7.5z" />
              </svg>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

/* ── The sources it reads ──────────────────────────────────────────────────── */

const SOURCES = [
  "Google News", "Hacker News", "The Verge", "TechCrunch", "arXiv", "GitHub",
  "OpenAI", "DeepMind", "Hugging Face", "Ars Technica", "VentureBeat",
  "Economic Times", "Moneycontrol", "Inc42", "ESPNcricinfo", "Variety",
];

/**
 * A moving band of the sources actually polled. Deliberately not a wall of
 * customer logos: these are real endpoints in services/sources, a claim that
 * can be checked. Constant motion, so linear, and it pauses under a pointer.
 */
function SourceBar({ pad, isMobile }) {
  return (
    <section style={{ borderTop: "1px solid var(--d-line-soft)", borderBottom: "1px solid var(--d-line-soft)", padding: `${isMobile ? 18 : 22}px ${pad}`, background: "var(--d-bg-alt)" }}>
      <div style={{ maxWidth: MAX, margin: "0 auto", display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: "center", gap: isMobile ? 12 : 28 }}>
        <div style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, color: "var(--d-body)", whiteSpace: "nowrap" }}>
          <span className="hg-ping" style={{ "--ping-rgb": GREEN, width: 7, height: 7, borderRadius: "50%", background: `rgb(${GREEN})` }} />
          Watching 120+ sources
        </div>
        <div
          className="hg-marquee"
          style={{
            flex: 1, minWidth: 0, width: "100%", overflow: "hidden",
            maskImage: "linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent)",
            WebkitMaskImage: "linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent)",
          }}
        >
          <div className="hg-marquee-track" aria-hidden="true">
            {[0, 1].map((copy) => (
              <div key={copy} style={{ display: "flex", alignItems: "center", gap: 40, paddingRight: 40 }}>
                {SOURCES.map((s) => (
                  <span key={`${copy}-${s}`} style={{ fontSize: 14.5, fontWeight: 600, color: "rgba(238,240,246,.42)", whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>
                    {s}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Shared pieces ─────────────────────────────────────────────────────────── */

/**
 * One band of the page. `band` alternates the ground between two flat colours a
 * couple of percent apart, enough to see the seam when scrolling past, not
 * enough to read as a coloured box.
 */
function Section({ id, pad, isMobile, band, children }) {
  return (
    <section
      id={id}
      style={{
        position: "relative",
        padding: `${isMobile ? 64 : 112}px ${pad}`,
        borderTop: "1px solid var(--d-line-soft)",
        background: band ? "var(--d-bg-alt)" : "var(--d-bg)",
        overflow: "hidden",
        scrollMarginTop: 40,
      }}
    >
      <div style={{ position: "relative", maxWidth: MAX, margin: "0 auto" }}>{children}</div>
    </section>
  );
}

function SectionHead({ eyebrow, tone = BLUE, title, sub, isMobile, align = "center" }) {
  const center = align === "center";
  return (
    <div className="hg-reveal" style={{ textAlign: align, maxWidth: center ? 720 : 560, margin: center ? "0 auto" : 0 }}>
      <span className="lp-eyebrow" style={{ color: `rgb(${tone})` }}>
        <i />
        <span style={{ color: "var(--d-body)" }}>{eyebrow}</span>
      </span>
      <h2
        style={{
          fontSize: isMobile ? 29 : "clamp(32px, 3.4vw, 52px)",
          fontWeight: 750, letterSpacing: "-0.04em", lineHeight: 1.08,
          color: "var(--d-ink)", margin: "18px 0 14px",
        }}
      >
        {title}
      </h2>
      {sub && (
        <p style={{ fontSize: isMobile ? 15.5 : 17, lineHeight: 1.6, color: "var(--d-body)", margin: center ? "0 auto" : 0, maxWidth: 620 }}>
          {sub}
        </p>
      )}
    </div>
  );
}

function Arrow() {
  return (
    <svg className="lp-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--d-mute)" }}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function Check({ tone = BLUE, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" fill={`rgba(${tone},.16)`} stroke={`rgba(${tone},.45)`} />
      <path d="M8 12.5l2.6 2.6L16.2 9.5" stroke={`rgb(${tone})`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Google's own button: its white pill sits correctly on the dark ground, and a
 * custom-drawn "Sign in with Google" is against Google's brand terms and breaks
 * One Tap.
 */
function SignIn({ onCredential, onError, busy }) {
  return (
    <div style={{ display: "inline-flex", opacity: busy ? 0.55 : 1, transition: "opacity 200ms ease", borderRadius: 999, boxShadow: "0 10px 30px -12px rgba(124,121,255,.6)" }}>
      <GoogleLogin onSuccess={onCredential} onError={onError} text="continue_with" shape="pill" size="large" width="250" />
    </div>
  );
}

/* ── Demo primitives ───────────────────────────────────────────────────────── */

/**
 * The hand doing the clicking. A demo that changes state on its own reads as a
 * video; a pointer that travels to a control and presses it reads as somebody
 * using the product. left/top rather than a transform because the panels are
 * fluid and a fixed pixel offset lands in the margin at other widths. It moves
 * on screen, so ease-in-out; the press is feedback, so ease-out.
 */
function Cursor({ left, top, pressed, hidden }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute", left, top, zIndex: 5,
        transform: `scale(${pressed ? 0.84 : 1})`,
        transition: "left 700ms var(--ease-in-out), top 700ms var(--ease-in-out), transform 160ms var(--ease-out), opacity 300ms ease",
        opacity: hidden ? 0 : 1,
        pointerEvents: "none",
      }}
    >
      <svg width="17" height="20" viewBox="0 0 17 20" fill="none">
        <path d="M1 1L1 15.5L4.8 12.2L7.4 18.4L10.3 17.2L7.7 11.2L12.6 10.8L1 1Z" fill="#fff" stroke="#0B0B0B" strokeWidth="1.1" strokeLinejoin="round" />
      </svg>
      {pressed && (
        <span style={{ position: "absolute", left: -9, top: -9, width: 34, height: 34, borderRadius: "50%", border: "2px solid rgba(255,255,255,.55)" }} />
      )}
    </span>
  );
}

/** The frame every demo sits in: the app's window chrome, small. */
function DemoFrame({ children, label, height }) {
  return (
    <div
      style={{
        position: "relative",
        borderRadius: 14,
        border: "1px solid var(--d-line)",
        background: "#0F1117",
        boxShadow: "var(--d-highlight), 0 30px 60px -40px rgba(0,0,0,.9)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "9px 12px", borderBottom: "1px solid rgba(255,255,255,.06)",
          background: "rgba(255,255,255,.025)",
        }}
      >
        <Dot /><Dot /><Dot />
        <span style={{ marginLeft: 6, fontSize: 10.5, color: "var(--d-mute)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      </div>
      {/* Fixed height so a scene that adds and removes rows cannot make the page
          jump under the reader as it loops. */}
      <div style={{ position: "relative", height, padding: 14 }}>{children}</div>
    </div>
  );
}

function Dot() {
  return <span style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,255,255,.14)", flexShrink: 0 }} />;
}

function Spinner({ tone }) {
  return (
    <span
      style={{
        width: 12, height: 12, borderRadius: "50%", flexShrink: 0,
        border: "2px solid rgba(255,255,255,.16)", borderTopColor: `rgb(${tone})`,
        animation: "hg-spin .7s linear infinite",
      }}
    />
  );
}

/** A pill standing in for a real button inside a demo. */
function MockButton({ tone, children, pressed, dark = true, style }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 10.5, fontWeight: 700, padding: "6px 13px", borderRadius: 999, whiteSpace: "nowrap",
        color: dark ? "#0A0A0C" : "var(--d-ink)",
        background: dark ? `rgb(${tone})` : "rgba(255,255,255,.07)",
        border: dark ? "none" : "1px solid rgba(255,255,255,.14)",
        boxShadow: pressed ? `0 0 0 5px rgba(${tone},.25)` : "none",
        transform: pressed ? "scale(0.97)" : "none",
        transition: "box-shadow 200ms ease, transform 160ms var(--ease-out), background-color 250ms ease, color 250ms ease",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** One row of the mock feed, shared by the first two scenes. */
function DemoRow({ title, meta, tone = WHITE, score, state = "in", isNew, compact }) {
  const dropped = state === "dropped";
  return (
    <div
      style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: compact ? "8px 10px" : "10px 11px",
        borderRadius: 9, marginBottom: 7,
        background: `rgba(${tone},.06)`,
        border: `1px solid rgba(${tone},.18)`,
        opacity: state === "hidden" ? 0 : dropped ? 0.28 : 1,
        transform: state === "hidden" ? "translateY(7px)" : "none",
        transition: "opacity 450ms var(--ease-out), transform 450ms var(--ease-out), border-color 300ms ease",
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        {isNew && (
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".08em", color: `rgb(${tone})`, marginBottom: 3 }}>NEW</div>
        )}
        <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.35, color: "var(--d-ink)", textDecoration: dropped ? "line-through" : "none" }}>
          {title}
        </div>
        {meta && <div style={{ fontSize: 9.5, color: "var(--d-mute)", marginTop: 4 }}>{meta}</div>}
      </div>

      {score != null && (
        <span
          style={{
            flexShrink: 0, fontSize: 11, fontWeight: 800, padding: "3px 8px", borderRadius: 7,
            color: score >= 6 ? `rgb(${tone})` : "var(--d-mute)",
            background: score >= 6 ? `rgba(${tone},.14)` : "rgba(255,255,255,.05)",
            border: `1px solid ${score >= 6 ? `rgba(${tone},.3)` : "rgba(255,255,255,.08)"}`,
          }}
        >
          {score}
        </span>
      )}
    </div>
  );
}

/* ── How it works ──────────────────────────────────────────────────────────── */

/**
 * Three steps, each a working miniature of the real screen.
 *
 * On a desk it is a step picker: the steps on the left, the live screen on the
 * right. The active step's bar fills while its demo plays and moves on when it
 * is full, so the section explains itself without a scroll; clicking a step
 * takes over. The bar is the clock (it advances on animationend), which is what
 * keeps the bar and the step change honest with each other when it is paused.
 * On a phone the three simply stack, demo first.
 */
function HowItWorks({ isMobile, pad }) {
  const steps = [
    { n: "01", tone: RED, title: "It watches while you sleep", body: "120+ sources, around the clock. Nothing waits for you to open the app.", scene: (a) => <SceneWatching active={a} /> },
    { n: "02", tone: BLUE, title: "It throws most of it away", body: "Every story is scored against your niche. You get the two or three worth a video.", scene: (a) => <SceneRanking active={a} /> },
    { n: "03", tone: GREEN, title: "It writes the script in your voice", body: "One tap. Your hooks, your language, ready to read off the screen.", scene: (a, m) => <SceneWriting active={a} isMobile={m} /> },
  ];

  return (
    <Section id="how" pad={pad} isMobile={isMobile}>
      <SectionHead
        isMobile={isMobile}
        tone={RED}
        eyebrow="How it works"
        title="Three things you no longer do"
        sub="Watch it happen. This is the actual screen, not an illustration of one."
      />
      {isMobile ? (
        <div style={{ marginTop: 36, display: "grid", gap: 36 }}>
          {steps.map((s) => <StepStack key={s.n} step={s} />)}
        </div>
      ) : (
        <Stepper steps={steps} />
      )}
    </Section>
  );
}

function StepStack({ step }) {
  const ref = useRef(null);
  const active = useInView(ref);
  return (
    <div ref={ref} className="hg-reveal">
      {step.scene(active, true)}
      <div style={{ marginTop: 16 }}>
        <StepNumber n={step.n} tone={step.tone} />
        <h3 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.025em", color: "var(--d-ink)", margin: "12px 0 6px" }}>{step.title}</h3>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--d-body)", margin: 0 }}>{step.body}</p>
      </div>
    </div>
  );
}

function StepNumber({ n, tone }) {
  return (
    <span
      style={{
        display: "inline-grid", placeItems: "center", minWidth: 30, height: 24, padding: "0 7px", borderRadius: 7,
        fontSize: 11.5, fontWeight: 700, fontVariantNumeric: "tabular-nums",
        color: `rgb(${tone})`, background: `rgba(${tone},.12)`, border: `1px solid rgba(${tone},.28)`,
      }}
    >
      {n}
    </span>
  );
}

const STEP_MS = 8000;

function Stepper({ steps }) {
  const ref = useRef(null);
  const inView = useInView(ref, { threshold: 0.35 });
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(false);
  const tabs = useRef([]);

  const pick = (n, focus = false) => {
    setActive(n);
    if (focus) tabs.current[n]?.focus();
  };

  const onKey = (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const d = e.key === "ArrowDown" ? 1 : -1;
    pick((active + d + steps.length) % steps.length, true);
  };

  const step = steps[active];

  return (
    <div ref={ref} className="hg-reveal" style={{ marginTop: 64, display: "grid", gridTemplateColumns: "minmax(0, 5fr) minmax(0, 7fr)", gap: 40, alignItems: "center" }}>
      <div role="tablist" aria-label="How it works" aria-orientation="vertical" onKeyDown={onKey} style={{ display: "grid", gap: 8 }}>
        {steps.map((s, n) => {
          const on = n === active;
          return (
            <button
              key={s.n}
              ref={(el) => { tabs.current[n] = el; }}
              type="button"
              role="tab"
              id={`how-tab-${n}`}
              aria-selected={on}
              aria-controls="how-panel"
              tabIndex={on ? 0 : -1}
              className="lp-step"
              onClick={() => pick(n)}
              onMouseEnter={() => on && setHovered(true)}
              onMouseLeave={() => setHovered(false)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <StepNumber n={s.n} tone={s.tone} />
                <span style={{ fontSize: 17, fontWeight: 650, letterSpacing: "-0.02em", color: on ? "var(--d-ink)" : "var(--d-body)", transition: "color 200ms ease" }}>
                  {s.title}
                </span>
              </div>
              <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--d-mute)", margin: "8px 0 0 42px" }}>{s.body}</p>
              {on && (
                <span className="lp-progress" data-paused={!inView || hovered} style={{ "--tone": `rgb(${s.tone})`, "--step-ms": `${STEP_MS}ms` }}>
                  <span key={active} onAnimationEnd={() => setActive((a) => (a + 1) % steps.length)} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id="how-panel" aria-labelledby={`how-tab-${active}`} style={{ position: "relative" }}>
        <div key={active} className="lp-scene-in">{step.scene(inView, false)}</div>
      </div>
    </div>
  );
}

/* ── The three scenes ──────────────────────────────────────────────────────── */

/** 01: stories arriving on their own, with the clock running. */
function SceneWatching({ active }) {
  const phase = useSceneClock(5, { active, interval: 900, hold: 2 });
  const rows = [
    { t: "OpenAI ships a model that runs offline", m: "18 sources · Hacker News · 12m ago", tone: RED, isNew: true },
    { t: "Nvidia buys an open-source AI lab", m: "14 sources · Google News · 41m ago", tone: WHITE },
    { t: "India's UPI adds offline payments", m: "9 sources · Google News · 1h ago", tone: WHITE },
    { t: "Anthropic opens an enterprise tier", m: "6 sources · Google News · 2h ago", tone: WHITE },
  ];

  return (
    <DemoFrame label="trylipi.online/app/discover" height={268}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--d-ink)" }}>What to cover today</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--d-mute)" }}>
          <span className="hg-ping" style={{ "--ping-rgb": RED, width: 6, height: 6, borderRadius: "50%", background: `rgb(${RED})` }} />
          {phase === 0 ? "checking…" : "just now"}
        </span>
      </div>
      {rows.map((r, i) => (
        <DemoRow key={r.t} compact tone={r.tone} title={r.t} meta={r.m} isNew={r.isNew && phase >= 1} state={phase > i ? "in" : "hidden"} />
      ))}
    </DemoFrame>
  );
}

/** 02: the scoring pass, and what it throws away. */
function SceneRanking({ active }) {
  const phase = useSceneClock(4, { active, interval: 1150, hold: 2 });
  const rows = [
    { t: "OpenAI ships a model that runs offline", s: 9, keep: true },
    { t: "Nvidia buys an open-source AI lab", s: 8, keep: true },
    { t: "A startup renames its pricing tiers", s: 2, keep: false },
    { t: "Opinion: why AI needs more regulation", s: 1, keep: false },
    { t: "Weekly roundup of 12 AI tools", s: 1, keep: false },
  ];

  return (
    <DemoFrame label="ranking · tech_gadgets" height={268}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--d-ink)" }}>{phase >= 3 ? "Worth a video today" : "Scoring 2,140 stories"}</span>
        <span style={{ fontSize: 10, color: "var(--d-mute)" }}>{phase >= 3 ? "2 kept" : `${rows.length} shown`}</span>
      </div>
      {rows.map((r) => {
        // Phase 1 puts a number on everything; phase 2 strikes the weak ones;
        // phase 3 removes them, so the scene shows what it throws away.
        const state = phase >= 3 && !r.keep ? "hidden" : phase >= 2 && !r.keep ? "dropped" : "in";
        return <DemoRow key={r.t} compact tone={r.keep ? BLUE : WHITE} title={r.t} score={phase >= 1 ? r.s : null} state={state} />;
      })}
      {phase >= 3 && (
        <div className="hg-fade" style={{ fontSize: 10.5, lineHeight: 1.6, color: "var(--d-body)", marginTop: 4 }}>
          <strong style={{ color: "var(--d-ink)" }}>Why it ranks.</strong> First frontier model people can run on their own laptop.
        </div>
      )}
    </DemoFrame>
  );
}

/**
 * 03: the script being written, drawn as a SCRIPT PAGE rather than a chat
 * bubble: numbered lines, the language it is in, and the button a creator
 * actually reaches for.
 */
function SceneWriting({ active, isMobile }) {
  const phase = useSceneClock(5, { active, interval: 1100, hold: 3 });
  const drafting = phase === 2;
  const writing = phase >= 3;
  const spot = phase <= 0 ? { left: "62%", top: 190 } : { left: "26%", top: 44 };

  return (
    <DemoFrame label="your script · Hindi-English" height={268}>
      <Cursor {...spot} pressed={phase === 1} hidden={isMobile} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <MockButton tone={GREEN} pressed={phase === 1}>Write this in my voice</MockButton>
        <span style={{ fontSize: 10, color: "var(--d-mute)" }}>Hinglish · 2 videos</span>
      </div>
      {drafting && (
        <div className="hg-fade" style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 11.5, color: "var(--d-body)" }}>
          <Spinner tone={GREEN} />
          Reading the coverage, then drafting…
        </div>
      )}
      {writing && <ScriptPage active={active} />}
      {!drafting && !writing && <div style={{ fontSize: 11, color: "var(--d-mute)" }}>Pick a story and press the button.</div>}
    </DemoFrame>
  );
}

/** Numbered script lines, arriving one at a time. */
function ScriptPage({ active }) {
  const LINES = [
    "तो दोस्तों, OpenAI ने GPT-6 Astra release कर दिया,",
    "और कहा कि हम AGI era में आ चुके हैं।",
    "लेकिन असली बात ये है:",
    "ये आपके laptop पर offline चलता है।",
  ];
  const shown = useSceneClock(LINES.length + 1, { active, interval: 620, hold: 6 });

  return (
    <div className="hg-fade">
      {LINES.map((l, i) => (
        <div
          key={l}
          className="indic"
          style={{
            display: "flex", gap: 10, alignItems: "baseline",
            fontSize: 11.5, lineHeight: 1.75, color: "var(--d-ink)",
            opacity: i < shown ? 1 : 0,
            transform: i < shown ? "none" : "translateY(4px)",
            transition: "opacity 350ms var(--ease-out), transform 350ms var(--ease-out)",
          }}
        >
          <span style={{ fontSize: 9, color: "var(--d-mute)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{String(i + 1).padStart(2, "0")}</span>
          <span>{l}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Bring your own ────────────────────────────────────────────────────────── */

/**
 * The two ways in that are not the feed. Everything above sells "we watch the
 * news so you do not have to", which has an obvious hole: what about a quiet
 * day, or my own launch? This answers it where the objection forms, with the
 * real screens. Two alternatives side by side, so two cards, not numbered steps.
 */
function BringYourOwn({ isMobile, pad }) {
  const modes = [
    {
      k: "Import", tone: PURPLE, title: "Cover anything you can paste",
      body: "A YouTube video up to ten minutes, up to five article links, or your own text. We tell you what we could not read before you spend a credit.",
      scene: (a) => <SceneImport active={a} isMobile={isMobile} />,
    },
    {
      k: "Idea", tone: BLUE, title: "Or just say what you want to make",
      body: "Type the idea in one line. We draft what the video should say, you correct it, and only what you approve gets written in your voice.",
      scene: (a) => <SceneIdea active={a} isMobile={isMobile} />,
    },
  ];

  return (
    <Section id="bring" pad={pad} isMobile={isMobile} band>
      <SectionHead
        isMobile={isMobile}
        tone={PURPLE}
        eyebrow="Bring your own"
        title="The feed is one of three ways in"
        sub="Some days nothing in the news is yours. Import your own material, or start from nothing but an idea. The same voice writes all three."
      />
      <div style={{ marginTop: isMobile ? 36 : 64, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 16 : 24 }}>
        {modes.map((m, i) => <ModeCard key={m.k} mode={m} index={i} isMobile={isMobile} />)}
      </div>
    </Section>
  );
}

function ModeCard({ mode, index, isMobile }) {
  const ref = useRef(null);
  const active = useInView(ref);
  return (
    <div ref={ref} className="hg-reveal lp-card lp-card--hover" style={{ "--i": index, padding: isMobile ? 18 : 28, display: "flex", flexDirection: "column" }}>
      <span
        style={{
          alignSelf: "flex-start", fontSize: 11.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
          padding: "4px 11px", borderRadius: 999, color: `rgb(${mode.tone})`,
          background: `rgba(${mode.tone},.1)`, border: `1px solid rgba(${mode.tone},.26)`,
        }}
      >
        {mode.k}
      </span>
      <h3 style={{ fontSize: isMobile ? 20 : 23, fontWeight: 700, letterSpacing: "-0.028em", lineHeight: 1.2, color: "var(--d-ink)", margin: "14px 0 8px" }}>{mode.title}</h3>
      <p style={{ fontSize: isMobile ? 14.5 : 15, lineHeight: 1.6, color: "var(--d-body)", margin: "0 0 22px", maxWidth: 480 }}>{mode.body}</p>
      <div style={{ marginTop: "auto" }}>{mode.scene(active)}</div>
    </div>
  );
}

/** A mock input, so these scenes read as a form rather than as a diagram. */
function MockField({ label, value, filled, caret, tone = PURPLE }) {
  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.11em", textTransform: "uppercase", color: "var(--d-mute)", marginBottom: 4 }}>{label}</div>
      <div
        style={{
          fontSize: 10.5, lineHeight: 1.5, padding: "7px 9px", borderRadius: 7, minHeight: 28,
          color: filled ? "var(--d-ink)" : "var(--d-mute)",
          background: "rgba(255,255,255,.035)",
          border: `1px solid ${filled ? `rgba(${tone},.4)` : "rgba(255,255,255,.09)"}`,
          boxShadow: filled ? `0 0 0 3px rgba(${tone},.08)` : "none",
          transition: "border-color 300ms ease, color 300ms ease, box-shadow 300ms ease",
          wordBreak: "break-all",
        }}
      >
        {value}
        {caret && <span className="hg-caret" style={{ color: `rgb(${tone})` }}>|</span>}
      </div>
    </div>
  );
}

/**
 * One line of what we could, or could not, read. The refusal row is the point
 * of the scene: the product says what failed before anyone pays.
 */
function ReadRow({ ok, label, detail, tone = PURPLE }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 7 }}>
      <span
        aria-hidden="true"
        style={{
          width: 14, height: 14, borderRadius: "50%", flexShrink: 0, marginTop: 1,
          display: "grid", placeItems: "center", fontSize: 8.5, fontWeight: 800, lineHeight: 1,
          color: ok ? "#0A0A0C" : "var(--d-ink)", background: ok ? `rgb(${tone})` : "rgba(255,255,255,.16)",
        }}
      >
        {ok ? "✓" : "!"}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10.5, fontWeight: 650, color: "var(--d-ink)", lineHeight: 1.35 }}>{label}</div>
        {detail && <div style={{ fontSize: 9.5, color: "var(--d-mute)", marginTop: 2, lineHeight: 1.4 }}>{detail}</div>}
      </div>
    </div>
  );
}

/** Import: paste it, read it, and be told honestly what came back. */
function SceneImport({ active, isMobile }) {
  const phase = useSceneClock(6, { active, interval: 1000, hold: 3 });
  const typed = phase >= 1;
  const linked = phase >= 2;
  const reading = phase === 4;
  const done = phase >= 5;

  return (
    <DemoFrame label="trylipi.online/app/import" height={252}>
      <Cursor left={phase >= 3 ? "22%" : "70%"} top={phase >= 3 ? 178 : 62} pressed={phase === 3} hidden={isMobile || done} />
      {!done ? (
        <>
          <MockField tone={PURPLE} label="YouTube video" filled={typed} value={typed ? "youtube.com/watch?v=aX2p9kR4mQ" : "https://youtube.com/watch?v=..."} caret={phase === 1} />
          <div style={{ marginBottom: 11 }}>
            <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.11em", textTransform: "uppercase", color: "var(--d-mute)", marginBottom: 5 }}>Article links</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", minHeight: 22 }}>
              {["reuters.com", "livemint.com", "ft.com"].map((h, i) => (
                <span
                  key={h}
                  style={{
                    fontSize: 9.5, padding: "4px 8px", borderRadius: 6, color: "var(--d-body)",
                    background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.10)",
                    opacity: linked ? 1 : 0, transform: linked ? "none" : "translateY(4px)",
                    transition: `opacity 350ms var(--ease-out) ${i * 60}ms, transform 350ms var(--ease-out) ${i * 60}ms`,
                  }}
                >
                  {h}
                </span>
              ))}
            </div>
          </div>
          <MockButton tone={PURPLE} pressed={phase === 3}>Read my source</MockButton>
          {reading ? (
            <div className="hg-fade" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 13, fontSize: 10.5, color: "var(--d-body)" }}>
              <Spinner tone={PURPLE} />
              Watching the video, reading the pages…
            </div>
          ) : (
            <div style={{ fontSize: 9.5, color: "var(--d-mute)", marginTop: 12, lineHeight: 1.5 }}>You see the price, and what we could read, before anything is written.</div>
          )}
        </>
      ) : (
        <div className="hg-fade">
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.11em", textTransform: "uppercase", color: "var(--d-mute)", marginBottom: 10 }}>What we will write from</div>
          <ReadRow tone={PURPLE} ok label="Video read · 8m 12s" detail="RBI policy briefing, full transcript" />
          <ReadRow tone={PURPLE} ok label="2 pages read" detail="reuters.com, livemint.com" />
          <ReadRow tone={PURPLE} label="Could not read 1 link" detail="ft.com blocked us. Usually a paywall." />
          <div style={{ marginTop: 11, paddingTop: 10, borderTop: "1px solid var(--d-line-soft)", display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
            <MockButton tone={PURPLE}>Write this in my voice</MockButton>
            <span style={{ fontSize: 9.5, color: "var(--d-mute)" }}>60s · 54 credits</span>
          </div>
        </div>
      )}
    </DemoFrame>
  );
}

/**
 * Idea: the draft step, which is the part worth showing. The longest phase is a
 * page of text in an EDIT box with a cursor in it, because that is the honest
 * picture: the creator corrects the facts before anything is written.
 */
function SceneIdea({ active, isMobile }) {
  const phase = useSceneClock(6, { active, interval: 1050, hold: 3 });
  const typed = phase >= 1;
  const drafting = phase === 3;
  const drafted = phase >= 4;
  const approved = phase >= 5;
  const DRAFT = [
    "A candlestick pattern is one or two candles telling you what",
    "buyers and sellers did in a single session. A chart pattern is",
    "the shape twenty or thirty candles make together.",
    "Beginners mix them up because both are called patterns, but they",
    "answer different questions on different timeframes.",
  ];

  return (
    <DemoFrame label="trylipi.online/app/idea" height={252}>
      <Cursor left={phase === 2 ? "18%" : approved ? "20%" : "68%"} top={phase === 2 ? 118 : approved ? 196 : 58} pressed={phase === 2 || phase === 5} hidden={isMobile} />
      {!drafted ? (
        <>
          <MockField
            tone={BLUE}
            label="What is the video about?"
            filled={typed}
            value={typed ? "Explain the difference between candlestick patterns and chart patterns" : "Tell us what you want the video to be about..."}
            caret={phase === 1}
          />
          <MockButton tone={BLUE} pressed={phase === 2} style={{ marginTop: 5 }}>Continue</MockButton>
          {drafting && (
            <div className="hg-fade" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 15, fontSize: 10.5, color: "var(--d-body)" }}>
              <Spinner tone={BLUE} />
              No news on this one. Drafting it instead…
            </div>
          )}
        </>
      ) : (
        <div className="hg-fade">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 7 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.11em", textTransform: "uppercase", color: "var(--d-mute)" }}>What the video will say</span>
            <span style={{ fontSize: 9, color: "var(--d-mute)" }}>edit anything</span>
          </div>
          <div style={{ padding: "9px 10px", borderRadius: 8, background: "rgba(255,255,255,.035)", border: `1px solid rgba(${BLUE},.32)` }}>
            {DRAFT.map((l, i) => (
              <div key={l} style={{ fontSize: 10, lineHeight: 1.62, color: "var(--d-ink)" }}>
                {l}
                {i === DRAFT.length - 1 && !approved && <span className="hg-caret" style={{ color: `rgb(${BLUE})` }}>|</span>}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 11, flexWrap: "wrap" }}>
            <MockButton tone={BLUE} pressed={phase === 5}>Use this</MockButton>
            <span style={{ fontSize: 9.5, color: "var(--d-mute)" }}>{approved ? "Approved · writing in your voice" : "Your words, checked by you"}</span>
          </div>
        </div>
      )}
    </DemoFrame>
  );
}

/* ── Edit videos ───────────────────────────────────────────────────────────── */

/**
 * The part of the product after the script: the recording, captioned, cut and
 * dressed. Every line in the list is something the editor does today
 * (components/Edit): captions in the spoken language, translation, photos and
 * clips three ways, a part per sentence, and exports up to 4K with an .srt.
 */
function EditVideos({ isMobile, pad }) {
  const ref = useRef(null);
  const active = useInView(ref);
  const points = [
    ["Captions in the language you spoke", "Timed to your speech, in Telugu, Hindi, Tamil and more, or in Roman letters."],
    ["Translate them in one tap", "The same timing, another language. No re-recording."],
    ["Photos and clips, three ways", "Full screen, split screen with you below, or on top of the shot."],
    ["Cut at every sentence", "Each sentence is a part. Drag its edges to trim; its captions follow."],
    ["Export up to 4K", "Pick the resolution, frame rate and bitrate. Get an .srt file too."],
  ];

  return (
    <Section id="edit" pad={pad} isMobile={isMobile}>
      <div ref={ref} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 5fr) minmax(0, 6fr)", gap: isMobile ? 36 : 64, alignItems: "center" }}>
        <div>
          <SectionHead
            isMobile={isMobile}
            align="left"
            tone={GREEN}
            eyebrow="Edit videos"
            title="Record it once. The captions and cuts are done."
            sub="Upload what you recorded. Lipi captions it in the language you spoke, cuts it at every sentence, and exports it ready to post."
          />
          <ul style={{ listStyle: "none", margin: "30px 0 0", padding: 0, display: "grid", gap: 16 }}>
            {points.map(([t, d], i) => (
              <li key={t} className="hg-reveal" style={{ "--i": i + 1, display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span className="lp-tick" style={{ marginTop: 1, background: `rgba(${GREEN},.12)`, borderColor: `rgba(${GREEN},.3)`, color: `rgb(${GREEN})` }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                </span>
                <div>
                  <div style={{ fontSize: 15.5, fontWeight: 650, color: "var(--d-ink)", letterSpacing: "-0.01em" }}>{t}</div>
                  <div style={{ fontSize: 14, lineHeight: 1.55, color: "var(--d-mute)", marginTop: 2 }}>{d}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="hg-reveal" style={{ "--i": 2, position: "relative" }}>
          <div className="lp-glow" aria-hidden="true" style={{ background: `radial-gradient(60% 60% at 50% 50%, rgba(${GREEN},.16), transparent 70%)` }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <SceneEditor active={active} isMobile={isMobile} />
          </div>
        </div>
      </div>
    </Section>
  );
}

/**
 * The editor, performed: a talking-head video gets its captions, is cut into
 * parts, gets a price graphic as a split screen, and is exported.
 */
function SceneEditor({ active, isMobile }) {
  const phase = useSceneClock(6, { active, interval: 1300, hold: 3 });
  const captioned = phase >= 1;
  const cut = phase >= 3;
  const media = phase >= 4;
  const exported = phase >= 5;
  const parts = [[0, 18], [18, 38], [38, 58], [58, 80], [80, 100]];
  const captions = [[3, 15], [21, 34], [41, 55], [61, 77], [83, 97]];
  const playhead = [6, 24, 40, 52, 68, 92][phase];
  const previewW = isMobile ? 104 : 128;

  return (
    <DemoFrame label="trylipi.online/app/edit" height={isMobile ? 316 : 344}>
      <Cursor left={phase === 5 ? "68%" : "44%"} top={phase === 5 ? 96 : 96} pressed={phase === 2 || phase === 5} hidden={isMobile || phase < 2} />

      <div style={{ display: "flex", gap: isMobile ? 12 : 18 }}>
        {/* The preview: the creator on camera, then a split screen. */}
        <div
          style={{
            position: "relative", width: previewW, aspectRatio: "9 / 16", flexShrink: 0, borderRadius: 10, overflow: "hidden",
            background: "linear-gradient(165deg, #2A2F3B 0%, #171A21 100%)", border: "1px solid rgba(255,255,255,.08)",
          }}
        >
          {/* The graphic that takes the top half. It slides down into its pane:
              it is moving on screen, so ease-in-out. */}
          <div
            style={{
              position: "absolute", left: 0, right: 0, top: 0, height: "50%",
              display: "grid", placeItems: "center",
              background: "linear-gradient(160deg, #F4F1FF, #DCD8FF)",
              transform: media ? "none" : "translateY(-100%)",
              transition: "transform 600ms var(--ease-in-out)",
            }}
          >
            <div style={{ textAlign: "center", color: "#16141F" }}>
              <div style={{ fontSize: isMobile ? 7.5 : 8.5, fontWeight: 700, letterSpacing: ".06em", opacity: .6 }}>IPHONE 17 PRO</div>
              <div style={{ fontSize: isMobile ? 15 : 18, fontWeight: 800, letterSpacing: "-0.03em" }}>₹69,990</div>
              <div style={{ fontSize: isMobile ? 8 : 9, textDecoration: "line-through", opacity: .5 }}>₹79,990</div>
            </div>
          </div>

          {/* The creator: a head and shoulders, drawn, who moves into the lower
              pane when the split screen arrives. */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute", left: 0, right: 0, bottom: 0, height: "100%",
              transform: media ? "translateY(25%) scale(.72)" : "none",
              transformOrigin: "50% 100%",
              transition: "transform 600ms var(--ease-in-out)",
            }}
          >
            <span style={{ position: "absolute", left: "50%", top: "30%", width: "34%", aspectRatio: "1", borderRadius: "50%", transform: "translateX(-50%)", background: "rgba(255,255,255,.14)" }} />
            <span style={{ position: "absolute", left: "50%", top: "52%", width: "72%", height: "60%", borderRadius: "46% 46% 0 0", transform: "translateX(-50%)", background: "rgba(255,255,255,.10)" }} />
          </div>

          {/* The caption, bold and outlined like the export draws it. */}
          <div
            className="indic"
            style={{
              position: "absolute", left: 6, right: 6, bottom: "14%", textAlign: "center",
              fontSize: isMobile ? 10 : 11.5, fontWeight: 700, lineHeight: 1.3, color: "#fff",
              textShadow: "0 0 3px #000, 0 0 3px #000, 0 1px 2px #000",
              opacity: captioned ? 1 : 0, transform: captioned ? "none" : "translateY(4px)",
              transition: "opacity 300ms var(--ease-out), transform 300ms var(--ease-out)",
            }}
          >
            {media ? <><span style={{ color: "#FFD400" }}>₹10,000</span> తగ్గింది</> : "iPhone 17 Pro ధర"}
          </div>
        </div>

        {/* The panel beside it. */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--d-ink)", lineHeight: 1.3 }}>iPhone 17 Pro price drop</div>
            <div style={{ fontSize: 9.5, color: "var(--d-mute)", marginTop: 3 }}>0:38 · Telugu-English</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 10.5, color: "var(--d-body)", minHeight: 16 }}>
            {captioned ? (
              <span className="hg-fade" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Check tone={GREEN} size={13} /> 5 captions written</span>
            ) : (
              <><Spinner tone={GREEN} /> Writing captions…</>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <MockButton tone={GREEN} dark={false} pressed={phase === 2}>✂ Auto-cut</MockButton>
            <MockButton tone={GREEN} pressed={phase === 5}>{exported ? "Exported ✓" : "Export · 1080p"}</MockButton>
          </div>
          {!isMobile && (
            <div style={{ display: "grid", gap: 5, marginTop: 2 }}>
              {[["Layout", media ? "Split screen" : "Full screen"], ["Captions", "Telugu · Bold"], ["Parts", cut ? "5" : "1"]].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, padding: "5px 8px", borderRadius: 6, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
                  <span style={{ color: "var(--d-mute)" }}>{k}</span>
                  <span style={{ color: "var(--d-ink)", fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* The timeline: three tracks and a playhead. */}
      <div style={{ position: "absolute", left: 14, right: 14, bottom: 14, borderTop: "1px solid rgba(255,255,255,.07)", paddingTop: 10 }}>
        {[["Video", "video"], ["Captions", "captions"], ["Media", "media"]].map(([label, track]) => (
          <div key={track} style={{ display: "flex", alignItems: "center", gap: 8, height: 22, marginBottom: 4 }}>
            <span style={{ width: 46, fontSize: 9, color: "var(--d-mute)", flexShrink: 0 }}>{label}</span>
            <div style={{ position: "relative", flex: 1, height: "100%" }}>
              {track === "video" && parts.map(([a, b], n) => (
                <span
                  key={n}
                  style={{
                    position: "absolute", top: 2, bottom: 2, left: `${cut ? a : n === 0 ? 0 : a}%`,
                    width: cut ? `calc(${b - a}% - 2px)` : n === 0 ? "100%" : 0,
                    borderRadius: 4, background: n % 2 ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.22)",
                    opacity: cut || n === 0 ? 1 : 0,
                    transition: "opacity 250ms ease",
                  }}
                />
              ))}
              {track === "captions" && captions.map(([a, b], n) => (
                <span
                  key={n}
                  style={{
                    position: "absolute", top: 2, bottom: 2, left: `${a}%`, width: `${b - a}%`, borderRadius: 4,
                    background: "rgba(255,212,0,.22)", border: "1px solid rgba(255,212,0,.35)",
                    opacity: captioned ? 1 : 0, transform: captioned ? "none" : "translateY(3px)",
                    transition: `opacity 300ms var(--ease-out) ${n * 50}ms, transform 300ms var(--ease-out) ${n * 50}ms`,
                  }}
                />
              ))}
              {track === "media" && (
                <span
                  style={{
                    position: "absolute", top: 2, bottom: 2, left: "58%", width: "22%", borderRadius: 4,
                    background: `rgba(${BLUE},.3)`, border: `1px solid rgba(${BLUE},.5)`,
                    opacity: media ? 1 : 0, transform: media ? "none" : "scale(.95)",
                    transition: "opacity 300ms var(--ease-out), transform 300ms var(--ease-out)",
                  }}
                />
              )}
            </div>
          </div>
        ))}
        <span
          aria-hidden="true"
          style={{
            position: "absolute", top: 6, bottom: 0, left: `calc(54px + (100% - 54px) * ${playhead / 100})`, width: 2, borderRadius: 1,
            background: `rgb(${RED})`, transition: "left 1000ms var(--ease-in-out)",
          }}
        />
      </div>
    </DemoFrame>
  );
}

/* ── What you get ──────────────────────────────────────────────────────────── */

/** Three things, each a small piece of the real interface doing what its heading says. */
function WhatYouGet({ isMobile, pad }) {
  const items = [
    { tone: RED, title: "Every source, checkable", body: "Nothing is invented. Open the links it read.", scene: (a) => <SceneSources active={a} /> },
    { tone: PURPLE, title: "A voice built from your videos", body: "Your hooks, your sign-offs, your mix of English.", scene: (a) => <SceneVoice active={a} /> },
    { tone: GREEN, title: "A script, not a prompt", body: "Finished and ready to record. Copy and go.", scene: (a) => <SceneCopy active={a} isMobile={isMobile} /> },
  ];

  return (
    <Section id="what" pad={pad} isMobile={isMobile} band>
      <SectionHead
        isMobile={isMobile}
        tone={GREEN}
        eyebrow="What you get"
        title="A shortlist and a draft, every morning"
        sub="Not a feed to triage. A decision already made, with the evidence attached."
      />
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: isMobile ? 16 : 20, marginTop: isMobile ? 36 : 64 }}>
        {items.map((it, i) => <GetTile key={it.title} item={it} index={i} isMobile={isMobile} />)}
      </div>
    </Section>
  );
}

function GetTile({ item, index, isMobile }) {
  const ref = useRef(null);
  const active = useInView(ref);
  return (
    <div ref={ref} className="hg-reveal lp-card lp-card--hover" style={{ "--i": index, padding: 12 }}>
      {item.scene(active)}
      <div style={{ padding: isMobile ? "16px 8px 8px" : "18px 10px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: `rgb(${item.tone})` }} />
          <span style={{ fontSize: 16, fontWeight: 650, letterSpacing: "-0.015em", color: "var(--d-ink)" }}>{item.title}</span>
        </div>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--d-body)", margin: 0 }}>{item.body}</p>
      </div>
    </div>
  );
}

/** Coverage links landing one after another. */
function SceneSources({ active }) {
  const rows = [
    ["Google News", "3h ago", "OpenAI unveils 'world's most intelligent model'"],
    ["Qz", "4h ago", "OpenAI launches GPT-6 Astra amid safety fears"],
    ["The Verge", "4h ago", "OpenAI's next big model has 'entered the AGI era'"],
  ];
  const shown = useSceneClock(rows.length + 1, { active, interval: 780, hold: 3 });

  return (
    <DemoFrame label="sources · 56" height={196}>
      {rows.map(([src, when, title], i) => (
        <div
          key={title}
          style={{
            padding: "9px 11px", borderRadius: 9, marginBottom: 7,
            border: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.03)",
            opacity: i < shown ? 1 : 0, transform: i < shown ? "none" : "translateY(6px)",
            transition: "opacity 400ms var(--ease-out), transform 400ms var(--ease-out)",
          }}
        >
          <div style={{ display: "flex", gap: 7, alignItems: "baseline", marginBottom: 3 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--d-ink)" }}>{src}</span>
            <span style={{ fontSize: 9.5, color: "var(--d-mute)" }}>{when}</span>
          </div>
          <div style={{ fontSize: 11, lineHeight: 1.4, color: "var(--d-body)" }}>{title}</div>
        </div>
      ))}
    </DemoFrame>
  );
}

/** The voice set filling up: their own My voice screen. */
function SceneVoice({ active }) {
  const phase = useSceneClock(4, { active, interval: 900, hold: 3 });
  const added = Math.min(phase, 2);

  return (
    <DemoFrame label="my voice" height={196}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--d-ink)", marginBottom: 4 }}>My voice</div>
      <div style={{ fontSize: 10, color: "var(--d-mute)", marginBottom: 11 }}>Up to 5 of your own shorts, under 60 seconds each.</div>
      {[["AI से पैसे कैसे कमाएँ", "51s"], ["Mastering the Claude Suite", "50s"]].map(([t, len], i) => (
        <div
          key={t}
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 9, marginBottom: 7,
            border: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.03)",
            opacity: i < added ? 1 : 0, transform: i < added ? "none" : "translateY(6px)",
            transition: "opacity 400ms var(--ease-out), transform 400ms var(--ease-out)",
          }}
        >
          <span className="indic" style={{ fontSize: 10.5, color: "var(--d-ink)", flex: 1, minWidth: 0 }}>{t}</span>
          <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 999, color: `rgb(${PURPLE})`, background: `rgba(${PURPLE},.14)`, border: `1px solid rgba(${PURPLE},.3)` }}>Ready</span>
          <span style={{ fontSize: 9, color: "var(--d-mute)" }}>{len}</span>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
        {[0, 1, 2, 3, 4].map((d) => (
          <span key={d} style={{ width: 6, height: 6, borderRadius: "50%", background: d < added ? `rgb(${PURPLE})` : "rgba(255,255,255,.16)", transition: "background-color 300ms ease" }} />
        ))}
        <span style={{ fontSize: 9.5, color: "var(--d-mute)", marginLeft: 4 }}>{added} of 5 added</span>
      </div>
    </DemoFrame>
  );
}

/** The finished script, and the one button that ends the job. */
function SceneCopy({ active, isMobile }) {
  const phase = useSceneClock(4, { active, interval: 1100, hold: 3 });
  const copied = phase >= 3;
  const spot = phase <= 0 ? { left: "30%", top: 150 } : { left: "72%", top: 34 };

  return (
    <DemoFrame label="your script" height={196}>
      <Cursor {...spot} pressed={phase === 2} hidden={isMobile} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 11 }}>
        <span style={{ fontSize: 9.5, color: "var(--d-mute)" }}>Hindi-English · from 2 videos</span>
        <MockButton tone={GREEN} dark={copied} pressed={phase === 2} style={{ borderRadius: 8, padding: "5px 11px" }}>
          {copied ? "Copied ✓" : "Copy script"}
        </MockButton>
      </div>
      <p className="indic" style={{ fontSize: 11, lineHeight: 1.8, color: "var(--d-ink)", margin: 0 }}>
        मार्केट में नया update आते ही सिर्फ ऊपर-ऊपर के features देखकर छोड़ देना बहुत easy है। लेकिन उस model
        के background में जो चल रहा है, वो समझना असली काम है।
      </p>
    </DemoFrame>
  );
}

/* ── Your voice ────────────────────────────────────────────────────────────── */

function VoiceProof({ isMobile, pad }) {
  const samples = [
    { lang: "Hindi", native: "हिन्दी", tone: BLUE, text: "देखो भाई, ये launch normal नहीं है। मैंने पूरा paper पढ़ा है और तीन चीज़ें ऐसी हैं जो किसी ने बताई ही नहीं।" },
    { lang: "Telugu", native: "తెలుగు", tone: PURPLE, text: "ఇది చాలా పెద్ద update గురు. నేను ఇందాక దీన్ని test చేశాను, అసలు ఏం జరిగిందో మీకు చెప్తాను." },
  ];

  return (
    <Section id="voice" pad={pad} isMobile={isMobile}>
      <SectionHead
        isMobile={isMobile}
        tone={BLUE}
        eyebrow="Your voice"
        title="It sounds like you, not like a tool"
        sub="Add a few of your own videos. The profile learns your hooks, your rhythm, and how much English you mix in, then writes that way."
      />
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 14 : 20, marginTop: isMobile ? 34 : 56 }}>
        {samples.map((s, i) => (
          <figure
            key={s.lang}
            className="hg-reveal lp-card"
            style={{ "--i": i, margin: 0, padding: isMobile ? "22px 20px" : "30px 30px 32px", overflow: "hidden" }}
          >
            <span
              aria-hidden="true"
              style={{ position: "absolute", top: -60, right: -40, width: 220, height: 220, borderRadius: "50%", background: `radial-gradient(circle, rgba(${s.tone},.16), transparent 70%)`, pointerEvents: "none" }}
            />
            <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <span className="indic" style={{ fontSize: 14, fontWeight: 700, padding: "2px 10px", borderRadius: 999, color: `rgb(${s.tone})`, background: `rgba(${s.tone},.1)`, border: `1px solid rgba(${s.tone},.26)`, lineHeight: 1.7 }}>
                {s.native}
              </span>
              <span style={{ fontSize: 12.5, color: "var(--d-mute)" }}>{s.lang} · your own phrasing</span>
              <span className="hg-eq" aria-hidden="true" style={{ display: "flex", alignItems: "flex-end", gap: 3, marginLeft: "auto", height: 18 }}>
                {[0, 1, 2, 3, 4].map((b) => <span key={b} style={{ animationDelay: `${b * 0.13}s`, background: `rgb(${s.tone})` }} />)}
              </span>
            </div>
            <blockquote className="indic" style={{ position: "relative", fontSize: isMobile ? 16 : 18, lineHeight: 1.85, color: "var(--d-ink)", margin: 0 }}>
              {s.text}
            </blockquote>
          </figure>
        ))}
      </div>
    </Section>
  );
}

/* ── Niches ────────────────────────────────────────────────────────────────── */

function Niches({ isMobile, pad }) {
  // Mirrors services/categories.js.
  const niches = [
    ["AI & technology", BLUE], ["Stock market & finance", GREEN], ["Business & startups", PURPLE],
    ["Crypto & Web3", RED], ["Film & entertainment", PURPLE], ["Sports & cricket", GREEN], ["Science & health", BLUE],
  ];

  return (
    <Section id="niches" pad={pad} isMobile={isMobile} band>
      <SectionHead
        isMobile={isMobile}
        tone={PURPLE}
        eyebrow="Niches"
        title="Pick up to three"
        sub="Each one is watched separately, with its own editorial bar: a rate decision is a 10 to a finance channel and a 0 to a film channel."
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: isMobile ? 9 : 12, justifyContent: "center", marginTop: isMobile ? 30 : 48, maxWidth: 860, marginLeft: "auto", marginRight: "auto" }}>
        {niches.map(([label, tone], i) => (
          <span
            key={label}
            className="hg-reveal"
            style={{
              "--i": i,
              display: "inline-flex", alignItems: "center", gap: 9,
              fontSize: isMobile ? 13.5 : 15, fontWeight: 600,
              padding: isMobile ? "10px 16px" : "12px 20px", borderRadius: 999,
              border: "1px solid var(--d-line)", background: "var(--d-panel)", boxShadow: "var(--d-highlight)",
              color: "var(--d-ink)",
            }}
          >
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: `rgb(${tone})` }} />
            {label}
          </span>
        ))}
      </div>
    </Section>
  );
}

/* ── The close ─────────────────────────────────────────────────────────────── */

/**
 * The closing call to action takes people to the real Google button rather than
 * rendering a second one: two <GoogleLogin>s on a page break the first.
 */
function ClosingCta({ isMobile, pad, busy }) {
  return (
    <section style={{ position: "relative", padding: `${isMobile ? 56 : 104}px ${pad}`, borderTop: "1px solid var(--d-line-soft)" }}>
      <div
        className="hg-reveal lp-card"
        style={{
          maxWidth: MAX, margin: "0 auto", textAlign: "center", overflow: "hidden",
          padding: isMobile ? "44px 22px" : "84px 40px", borderRadius: isMobile ? 22 : 28,
          background: "linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.015))",
        }}
      >
        <Grid />
        <span
          aria-hidden="true"
          style={{ position: "absolute", left: "50%", bottom: "-55%", width: "70%", height: "90%", transform: "translateX(-50%)", borderRadius: "50%", background: `radial-gradient(circle, rgba(${BLUE},.28), transparent 65%)`, filter: "blur(30px)", pointerEvents: "none" }}
        />
        <div style={{ position: "relative" }}>
          <h2 style={{ fontSize: isMobile ? 30 : "clamp(34px, 3.8vw, 58px)", fontWeight: 750, letterSpacing: "-0.045em", lineHeight: 1.05, color: "var(--d-ink)", margin: "0 auto 16px", maxWidth: 760 }}>
            Tomorrow morning, it is already done.
          </h2>
          <p style={{ fontSize: isMobile ? 15.5 : 17.5, lineHeight: 1.6, color: "var(--d-body)", margin: "0 auto 32px", maxWidth: 560 }}>
            Sign in, pick your niche, and see what today looks like when the topic is already chosen and the script is already written.
          </p>
          <button type="button" className="lp-btn lp-btn--primary" disabled={busy} onClick={scrollToSignIn} style={{ height: 48, padding: "0 26px", fontSize: 15.5 }}>
            Continue with Google <Arrow />
          </button>
          <div style={{ marginTop: 16, fontSize: 13, color: "var(--d-mute)" }}>100 free credits to start.</div>
        </div>
      </div>
    </section>
  );
}

/**
 * Where the script ends up. The official single-colour brand paths (Simple
 * Icons geometry), inlined rather than installed. YouTube keeps its own red,
 * which is its trademark rather than our accent; the other two are white.
 */
const PLATFORMS = [
  {
    name: "YouTube",
    fill: "#FF0000",
    path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  },
  {
    name: "Instagram",
    fill: "rgba(255,255,255,.82)",
    path: "M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 1 0 0-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405a1.441 1.441 0 0 1-2.88 0 1.44 1.44 0 0 1 2.88 0z",
  },
  {
    name: "X",
    fill: "rgba(255,255,255,.82)",
    path: "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z",
  },
];

function PlatformMarks({ size = 22 }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
      {PLATFORMS.map((m) => (
        <span
          key={m.name}
          title={m.name}
          style={{
            display: "inline-grid", placeItems: "center", width: size + 14, height: size + 14, borderRadius: 9,
            border: "1px solid rgba(255,255,255,.11)", background: "rgba(255,255,255,.045)",
          }}
        >
          <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={m.name}>
            <path d={m.path} fill={m.fill} />
          </svg>
        </span>
      ))}
    </span>
  );
}

/**
 * The footer, and the only place on this page that is not selling. Policy links
 * open in a new tab so somebody mid-decision is not navigated away from the page
 * making the case; they are plain anchors because a new tab boots the app cold
 * at that address.
 */
function Footer({ pad, isMobile }) {
  return (
    <footer style={{ borderTop: "1px solid var(--d-line-soft)", padding: `${isMobile ? 36 : 56}px ${pad} 28px`, background: "var(--d-bg-alt)" }}>
      <div style={{ maxWidth: MAX, margin: "0 auto" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: isMobile ? 30 : 48, alignItems: "flex-start", justifyContent: "space-between", marginBottom: isMobile ? 28 : 44 }}>
          <div style={{ minWidth: 0 }}>
            <Logo color="var(--d-ink)" />
            <p style={{ fontSize: 13.5, lineHeight: 1.7, color: "var(--d-mute)", margin: "14px 0 0", maxWidth: "36ch" }}>
              Today's topics for your niche, written in your own voice. A product of Betafounder Enterprises, Hyderabad.
            </p>
          </div>
          <div style={{ display: "flex", gap: isMobile ? 40 : 72, flexWrap: "wrap" }}>
            <FooterColumn
              title="Product"
              links={[["How it works", "#how"], ["Edit videos", "#edit"], ["Your voice", "#voice"], ["Niches", "#niches"]]}
            />
            <FooterColumn
              title="Company"
              external
              links={[["Privacy Policy", "/privacy"], ["Terms of Service", "/terms"], ["Cancellation & Refunds", "/refunds"], ["Delivery Policy", "/shipping"], ["Contact Us", "/contact"]]}
            />
          </div>
        </div>
        <div style={{ borderTop: "1px solid var(--d-line-soft)", paddingTop: 20, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", fontSize: 12.5, color: "var(--d-mute)" }}>
          <span>© {new Date().getFullYear()} Betafounder Enterprises</span>
          <span>trylipi.online</span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links, external = false }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 650, color: "var(--d-ink)", marginBottom: 14 }}>{title}</div>
      <nav aria-label={title} style={{ display: "grid", gap: 10 }}>
        {links.map(([label, href]) => (
          <a
            key={href}
            href={href}
            {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
            className="lp-link"
            style={{ fontSize: 13.5, whiteSpace: "nowrap" }}
          >
            {label}
          </a>
        ))}
      </nav>
    </div>
  );
}

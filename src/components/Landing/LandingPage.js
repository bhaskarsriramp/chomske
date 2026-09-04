import { useState, useEffect, useRef } from "react";
import { GoogleLogin } from "@react-oauth/google";
import api, { errorMessage } from "../../api";
import useIsMobile from "../../hooks/useIsMobile";
import Logo from "../Shell/Logo";

/**
 * The landing page.
 *
 * ── WHY THIS PAGE IS DARK WHEN THE APP IS NOT ────────────────────────────────
 * They are answering different questions. The app is a light, quiet workspace
 * somebody sits inside every morning, and its rule is that nothing moves — a
 * feed that twitches as the cursor crosses it is a feed you stop trusting. This
 * page has four seconds to convince a creator who has never heard of us that
 * the thing is real, current, and built by people who finish things. Stillness
 * does not do that; a dark ground with the brand's own light moving across it
 * does. The two rule sets are kept apart on purpose (see index.css) so the app
 * can stay still while the front door moves.
 *
 * ── WHAT IT SELLS ────────────────────────────────────────────────────────────
 * Not transcription, and not "AI". A creator's slowest hour is deciding what to
 * cover and then writing the thing. The headline is therefore a promise about
 * TIME, in the language they will actually record in — which is why the one
 * animated element in the headline is the language itself, cycling through nine
 * scripts. It is the product's whole argument in one word.
 *
 * ── EVERY ANIMATION IS OPTIONAL ──────────────────────────────────────────────
 * The reduced-motion block in index.css switches all of it off, and the page
 * must read identically with none of it running. Nothing below is the only way
 * a piece of content appears: reveals resolve to visible, the language flip
 * still shows a language, the typewriter still shows its script.
 */

/**
 * Nine languages in their own scripts, plus English.
 *
 * Written out rather than generated from a locale list: these are the ones the
 * voice profiler has actually been used in, and a headline that promised
 * Assamese because a library knew the word for it would be a lie told very
 * confidently. Each carries its Latin name for the screen reader, since a
 * screen reader will not switch scripts mid-sentence.
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

/**
 * The page's whole palette: YouTube red, three greens, and white.
 *
 * The cyan, ice blue and orchid this started with are gone. One consequence to
 * keep in mind: red and green are the pair most often confused by people with a
 * red-green deficiency, roughly one man in twelve. Nothing on this page may use
 * the difference between them to carry MEANING — position, label and shape do
 * that everywhere below, and colour is decoration on top. Adding, say, a green
 * "kept" chip beside a red "dropped" chip would break that, and would need a
 * shape or a word as well.
 */
const RED = "255,0,0";
const MINT = "112,255,210";
const LEAF = "118,196,87";
const FOREST = "42,124,19";
const PINE = "42,131,95";
const WHITE = "255,255,255";

const GLOW = { red: RED, mint: MINT, leaf: LEAF, forest: FOREST, pine: PINE };

/**
 * One observer for every reveal on the page.
 *
 * A scroll handler would run on every frame of every scroll for the life of the
 * page to do the same job. This runs when something crosses the threshold and
 * then unobserves it, so the cost falls to zero once you have read past a
 * section.
 *
 * ── IT FAILS OPEN, AND THAT IS DELIBERATE ────────────────────────────────────
 * The hidden state lives under `.hg-armed`, which is added HERE, after checking
 * the observer exists. Done the obvious way round — hidden in the stylesheet,
 * revealed by script — a browser without IntersectionObserver, or any error
 * thrown before this effect runs, leaves every section below the fold as a
 * blank black screen with the content sitting in the DOM unseen. Arming it from
 * script means the worst case is an unanimated page.
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
          io.unobserve(e.target);   // done with it — never watch it again
        }
      },
      // Fires a little before the element is fully on screen, so the motion has
      // finished by the time it is in comfortable reading position rather than
      // starting once you are already looking at it.
      { rootMargin: "0px 0px -10% 0px", threshold: 0.06 }
    );

    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);

  return root;
}

/**
 * Is this element on screen?
 *
 * The scenes below are looping state machines. Left running off-screen they
 * would burn a timer and a re-render every second or so for every scene on the
 * page, on a laptop that is not even showing them.
 */
function useInView(ref, { once = false } = {}) {
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
      { threshold: 0.25 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, once]);

  return inView;
}

/**
 * The clock behind every demo: advance a phase counter while visible, loop, and
 * stop dead when scrolled away.
 *
 * Reduced motion pins it to the LAST phase rather than the first — the end of
 * each scene is its finished state, which is the frame that actually explains
 * the product. Freezing on phase 0 would show an empty panel forever.
 */
function useSceneClock(phaseCount, { active, interval = 1100, hold = 2 }) {
  const [phase, setPhase] = useState(0);
  const still =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (still) { setPhase(phaseCount - 1); return; }
    if (!active) return;
    // `hold` extra ticks at the end so the finished state is readable before it
    // resets — a scene that restarts the instant it completes reads as a glitch.
    const t = setInterval(() => setPhase((p) => (p + 1) % (phaseCount + hold)), interval);
    return () => clearInterval(t);
  }, [active, phaseCount, interval, hold, still]);

  return Math.min(phase, phaseCount - 1);
}

/**
 * The hand doing the clicking.
 *
 * A demo that changes state on its own reads as a video. A pointer that travels
 * to a control and presses it reads as somebody using the product, which is the
 * difference between "this is what it looks like" and "this is what you do".
 */
function Cursor({ left, top, pressed, hidden }) {
  return (
    <span
      aria-hidden="true"
      style={{
        // left/top rather than a transform, because the panels these travel
        // across are fluid: a pointer placed at a fixed pixel offset lands on
        // the right control at 1440px and in the margin at 900px.
        position: "absolute", left, top, zIndex: 5,
        transform: `scale(${pressed ? 0.82 : 1})`,
        transition: "left .62s cubic-bezier(.3,.8,.3,1), top .62s cubic-bezier(.3,.8,.3,1), transform .18s ease, opacity .3s ease",
        opacity: hidden ? 0 : 1,
        pointerEvents: "none",
      }}
    >
      <svg width="17" height="20" viewBox="0 0 17 20" fill="none">
        <path d="M1 1L1 15.5L4.8 12.2L7.4 18.4L10.3 17.2L7.7 11.2L12.6 10.8L1 1Z"
              fill="#fff" stroke="#0B0B0B" strokeWidth="1.1" strokeLinejoin="round" />
      </svg>
      {pressed && (
        <span
          style={{
            position: "absolute", left: -9, top: -9, width: 34, height: 34,
            borderRadius: "50%", border: "2px solid rgba(255,255,255,.55)",
          }}
        />
      )}
    </span>
  );
}

/** The frame every demo sits in — the app's window chrome, small. */
function DemoFrame({ children, label, tone, height }) {
  return (
    <div
      style={{
        position: "relative",
        borderRadius: 14,
        border: "1px solid var(--d-line)",
        background: "linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.015))",
        boxShadow: `0 40px 90px -50px rgba(${tone},.55)`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "9px 12px", borderBottom: "1px solid rgba(255,255,255,.07)",
          background: "rgba(255,255,255,.03)",
        }}
      >
        <Dot /><Dot /><Dot />
        <span style={{ marginLeft: 6, fontSize: 10.5, color: "var(--d-mute)" }}>{label}</span>
      </div>
      {/* Fixed height so a scene that adds and removes rows cannot make the page
          jump under the reader as it loops. */}
      <div style={{ position: "relative", height, padding: 14 }}>{children}</div>
    </div>
  );
}

/** One row of the mock feed, shared by every scene. */
function DemoRow({ title, meta, tone = "255,255,255", score, state = "in", isNew, compact }) {
  const dropped = state === "dropped";
  return (
    <div
      style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: compact ? "8px 10px" : "10px 11px",
        borderRadius: 9,
        marginBottom: 7,
        background: `linear-gradient(180deg, rgba(${tone},.10), rgba(${tone},.025))`,
        border: `1px solid rgba(${tone},.20)`,
        opacity: state === "hidden" ? 0 : dropped ? 0.25 : 1,
        transform: state === "hidden" ? "translateY(7px)" : "none",
        transition: "opacity .45s ease, transform .45s ease, border-color .3s ease",
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        {isNew && (
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".08em", color: `rgb(${tone})`, marginBottom: 3 }}>
            NEW
          </div>
        )}
        <div
          style={{
            fontSize: 11.5, fontWeight: 600, lineHeight: 1.35, color: "var(--d-ink)",
            textDecoration: dropped ? "line-through" : "none",
          }}
        >
          {title}
        </div>
        {meta && <div style={{ fontSize: 9.5, color: "var(--d-mute)", marginTop: 4 }}>{meta}</div>}
      </div>

      {score != null && (
        <span
          style={{
            flexShrink: 0, fontSize: 11, fontWeight: 800,
            padding: "3px 8px", borderRadius: 7,
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

  // The gutter scales with the viewport instead of capping content in a fixed
  // centred column. A 27" monitor should get a genuinely wider page, not the
  // same 1080px strip with more empty space either side of it.
  const pad = isMobile ? "20px" : "clamp(28px, 5vw, 104px)";

  return (
    <div ref={page} className="hg-dark" style={{ position: "relative", minHeight: "100vh", overflowX: "hidden" }}>
      {/* The red/green ground, held still behind everything. */}
      <div className="hg-wash" aria-hidden="true" />

      {/* Everything else rides above it — see .hg-wash for why this z-index is
          load-bearing rather than decoration. */}
      <div style={{ position: "relative", zIndex: 1 }}>
      <Nav pad={pad} isMobile={isMobile} />
      <Hero
        isMobile={isMobile}
        pad={pad}
        onCredential={handleCredential}
        onError={() => setError("Google sign-in was cancelled or blocked.")}
        error={error}
        busy={busy || checking}
      />
      <SourceBar />
      <HowItWorks isMobile={isMobile} pad={pad} />
      <WhatYouGet isMobile={isMobile} pad={pad} />
      <VoiceProof isMobile={isMobile} pad={pad} />
      <Niches isMobile={isMobile} pad={pad} />
      <ClosingCta isMobile={isMobile} pad={pad} onCredential={handleCredential} busy={busy} />
      <Footer pad={pad} isMobile={isMobile} />
      </div>
    </div>
  );
}

/* ── Chrome ────────────────────────────────────────────────────────────────── */

/**
 * A floating glass bar, like the references: it sits ON the hero rather than
 * above it, so the aurora reads through and the page starts at the top of the
 * screen instead of below a header.
 *
 * It gains a border and a stronger blur once you scroll, which is the only way
 * a transparent bar stays legible over content — over the pale product window
 * further down, an unbacked bar would be white text on white.
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
        padding: isMobile ? `12px ${pad}` : `16px ${pad}`,
        // Black at rest, not transparent. The bar is a SIBLING above the hero,
        // so at scroll 0 a transparent one shows the page's own red gradient
        // through it — a red band across the top of an otherwise black hero,
        // which reads as a rendering fault rather than a design. Black matches
        // the hero exactly, so the seam disappears; once scrolled it becomes the
        // translucent glass, over sections that are no longer black anyway.
        background: stuck ? "rgba(8,6,6,.74)" : "#000",
        backdropFilter: stuck ? "blur(14px)" : "none",
        WebkitBackdropFilter: stuck ? "blur(14px)" : "none",
        borderBottom: `1px solid ${stuck ? "var(--d-line-soft)" : "transparent"}`,
        transition: "background .25s ease, border-color .25s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <Logo color="var(--d-ink)" />

        {!isMobile && (
          <nav style={{ display: "flex", alignItems: "center", gap: 30 }}>
            {[["How it works", "how"], ["What you get", "what"], ["Your voice", "voice"], ["Niches", "niches"]].map(
              ([label, id]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="hg-d-link"
                  style={{ fontSize: 13.5, fontWeight: 500, color: "var(--d-mute)", textDecoration: "none" }}
                >
                  {label}
                </a>
              )
            )}
          </nav>
        )}

      </div>
    </header>
  );
}

/* ── Hero ──────────────────────────────────────────────────────────────────── */

function Hero({ isMobile, pad, onCredential, onError, error, busy }) {
  return (
    <section
      id="start"
      className="hg-hero"
      style={{
        position: "relative",
        padding: `${isMobile ? 26 : 46}px ${pad} ${isMobile ? 54 : 88}px`,
        overflow: "hidden",
      }}
    >
      <Aurora />

      <div style={{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: 1180, margin: "0 auto" }}>
        <div className="hg-reveal">
          <Chip />
        </div>

        <h1
          className="hg-reveal"
          style={{
            // Scales with the viewport rather than sitting in a capped column:
            // a wider screen gets bigger words, so the line keeps the same
            // readable character count instead of stretching.
            fontSize: isMobile ? "clamp(30px, 8.4vw, 40px)" : "clamp(42px, 4.6vw, 82px)",
            lineHeight: 1.07,
            letterSpacing: "-0.038em",
            fontWeight: 800,
            color: "var(--d-ink)",
            margin: `${isMobile ? 20 : 26}px auto 0`,
            maxWidth: 1080,
            transitionDelay: ".06s",
          }}
        >
          Never spend more than{" "}
          <span style={{ color: "var(--yt)" }}>60s</span>
          <br />
          on a script in <LanguageFlip />
        </h1>

        <p
          className="hg-reveal"
          style={{
            fontSize: isMobile ? 15.5 : "clamp(16px, 1.15vw, 21px)",
            lineHeight: 1.6,
            color: "var(--d-body)",
            margin: `${isMobile ? 18 : 24}px auto 0`,
            maxWidth: 720,
            transitionDelay: ".12s",
          }}
        >
          Chomske watches the latest news in your niche all day, ranks the
          handful of stories actually worth a video, and writes the entire
          script in your own speaking style &amp; language.
        </p>

        <div
          className="hg-reveal"
          style={{
            display: "flex", flexWrap: "wrap", gap: 14,
            justifyContent: "center", alignItems: "center",
            margin: `${isMobile ? 26 : 34}px 0 0`,
            transitionDelay: ".18s",
          }}
        >
          <SignIn onCredential={onCredential} onError={onError} busy={busy} />
        </div>

        {error && (
          <div role="alert" style={{ marginTop: 14, fontSize: 13.5, color: "#FF8E8A" }}>
            {error}
          </div>
        )}

        <div
          className="hg-reveal"
          style={{
            marginTop: 16, display: "flex", flexWrap: "wrap",
            alignItems: "center", justifyContent: "center", gap: 14,
            transitionDelay: ".22s",
          }}
        >
          <span style={{ fontSize: 12.5, color: "var(--d-mute)" }}>Free to start · No card required</span>
          {/* The rule only separates two things that are on the SAME line. On a
              phone this wraps, and it was left dangling at the end of the first
              line separating nothing from nothing. */}
          {!isMobile && (
            <span aria-hidden="true" style={{ width: 1, height: 14, background: "rgba(255,255,255,.14)" }} />
          )}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 11 }}>
            <span style={{ fontSize: 12.5, color: "var(--d-mute)" }}>Record for</span>
            <PlatformMarks size={17} />
          </span>
        </div>

        <div
          className="hg-reveal"
          style={{ marginTop: isMobile ? 40 : 62, transitionDelay: ".26s" }}
        >
          <HeroDemo isMobile={isMobile} />
        </div>
      </div>
    </section>
  );
}

/**
 * The moving ground.
 *
 * Three blurred blobs of brand light plus a fine grid. The grid is what stops
 * this reading as a generic gradient: it gives the light something to sit
 * behind, which is the difference between "futuristic" and "purple blur".
 *
 * `pointerEvents: none` throughout — a full-bleed decorative layer that eats
 * clicks would swallow the buttons underneath it.
 */
function Aurora() {
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {/* Grid, fading out before it reaches the text so it never competes. */}
      <div
        style={{
          position: "absolute", inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px)",
          backgroundSize: "62px 62px",
          maskImage: "radial-gradient(120% 85% at 50% 8%, #000 35%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(120% 85% at 50% 8%, #000 35%, transparent 78%)",
        }}
      />

      {/* Red, black and white only. Three densities of the same red rather than
          three different hues: on black, one colour at varying strength reads as
          depth, where three would read as a gradient mesh — the thing every
          other AI landing page is already doing. */}
      <div
        className="hg-aurora hg-aurora-a"
        style={{
          width: "58vw", height: "58vw", maxWidth: 900, maxHeight: 900,
          left: "-14vw", top: "-22vw",
          background: "radial-gradient(circle, rgba(255,0,0,.28), transparent 66%)",
        }}
      />
      <div
        className="hg-aurora hg-aurora-b"
        style={{
          width: "52vw", height: "52vw", maxWidth: 820, maxHeight: 820,
          right: "-12vw", top: "-18vw",
          background: "radial-gradient(circle, rgba(204,0,0,.22), transparent 66%)",
        }}
      />
      <div
        className="hg-aurora hg-aurora-c"
        style={{
          width: "78vw", height: "44vw", maxWidth: 1200, maxHeight: 660,
          left: "11vw", bottom: "-26vw",
          background: "radial-gradient(circle, rgba(255,0,0,.20), transparent 68%)",
        }}
      />

      {/* The horizon: one bright hairline with a bloom under it, which is what
          gives the section a floor instead of a fade. */}
      <div
        style={{
          position: "absolute", left: "50%", bottom: 0, transform: "translateX(-50%)",
          width: "140%", height: 1,
          background: "linear-gradient(90deg, transparent, rgba(255,0,0,.75), transparent)",
        }}
      />
    </div>
  );
}

function Chip() {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 9,
        fontSize: 12.5, fontWeight: 600, letterSpacing: "0.01em",
        padding: "7px 15px 7px 12px", borderRadius: 999,
        border: "1px solid rgba(255,255,255,.14)",
        background: "rgba(255,255,255,.05)",
        color: "var(--d-ink)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <span
        className="hg-ping"
        aria-hidden="true"
        style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--yt)", flexShrink: 0 }}
      />
      Topics &amp; Scripts for Indian Creators
    </span>
  );
}

/**
 * The headline's one moving part.
 *
 * Every language occupies the SAME grid cell, so the container is as wide as the
 * widest of them and the line never reflows. A container that resized with each
 * word would drag the rest of the headline sideways nine times a minute — the
 * difference between a headline that breathes and one that twitches.
 *
 * The visible word is `aria-hidden` and the accessible name is fixed, because a
 * screen reader announcing a headline that rewrites itself every two seconds is
 * a headline nobody can read.
 */
function LanguageFlip() {
  const [i, setI] = useState(0);
  const [widths, setWidths] = useState([]);
  const items = useRef([]);

  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % LANGUAGES.length), 1900);
    return () => clearInterval(t);
  }, []);

  // Measure every word once, so the box can be given an explicit width and
  // TRANSITION between them. Measured from the real, rendered nodes rather than
  // estimated from character counts — nine scripts with different glyph widths
  // is exactly the case a heuristic gets wrong.
  useEffect(() => {
    const measure = () => setWidths(items.current.map((el) => (el ? el.offsetWidth : 0)));
    measure();

    // Webfonts land after first paint. A width measured before they do is the
    // FALLBACK font's width, and every word would sit in a box an inch wrong
    // until something forced a re-measure.
    document.fonts?.ready?.then(measure).catch(() => {});

    // Type is clamped to the viewport, so every word's width changes with it.
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return (
    <span
      role="img"
      aria-label="your language — Hindi, Telugu, Tamil, Marathi, Kannada, Bengali, Gujarati, Malayalam, Punjabi or English"
      className="indic"
      style={{
        // ── EVERY WORD IS ABSOLUTELY POSITIONED, AND THAT IS THE POINT ────────
        // Stacked in normal flow, the box would be as wide as the widest of the
        // nine — leaving "मराठी" floating a long way from the words before it,
        // and, worse, making the headline wider than a phone screen because an
        // invisible "മലയാളം" still takes up space. Out of flow, only the
        // measured width below occupies the line.
        position: "relative",
        display: "inline-block",
        verticalAlign: "baseline",
        width: widths[i] ? `${widths[i]}px` : "auto",
        transition: "width .42s cubic-bezier(.2,.8,.25,1)",
      }}
    >
      {/* ── THE BASELINE ANCHOR ───────────────────────────────────────────────
          One copy of the current word, in normal flow and invisible. Without it
          the box has no in-flow content, so its baseline falls to its bottom
          margin edge and the visible word sits below the line it belongs to —
          which is exactly what happened, most visibly in Tamil, whose glyphs
          descend furthest. It also gives the box its height, so nine scripts
          with nine different ascender heights all sit correctly without a
          hand-tuned number. Same string as the visible word, so it can never
          disagree about width either. */}
      <span aria-hidden="true" style={{ visibility: "hidden", whiteSpace: "nowrap" }}>
        {LANGUAGES[i].native}
      </span>

      {LANGUAGES.map((l, n) => (
        <span
          key={l.name}
          ref={(el) => { items.current[n] = el; }}
          aria-hidden="true"
          className={n === i ? "hg-flip-on" : undefined}
          style={{
            // inset 0 rather than a centring transform: the box is already the
            // width of the word it is showing, so the two coincide — and on the
            // frames where the width is mid-transition, the word tracks the box
            // instead of jumping ahead of it.
            position: "absolute",
            left: 0, right: 0, top: 0,
            textAlign: "center",
            whiteSpace: "nowrap",
            opacity: n === i ? 1 : 0,
            color: "var(--yt)",
          }}
        >
          {l.native}
        </span>
      ))}
    </span>
  );
}

/* ── The product, shown ────────────────────────────────────────────────────── */

/**
 * The hero's demo: the actual flow, performed.
 *
 * ── WHY IT MOVES ─────────────────────────────────────────────────────────────
 * A still screenshot of a feed says "this is a list of news". The product is
 * not the list — it is what happens when you pick one thing off it. So the
 * pointer does what a creator does: reads the shortlist, opens a story, reads
 * why it ranks, presses "Write this in my voice", and the script arrives in
 * Hindi. Four seconds, no copy required, and every frame of it is a real
 * screen from the app rather than an illustration of one.
 *
 * Phases:
 *   0  the shortlist, cursor idle
 *   1  cursor travels to the top story
 *   2  press — the story opens on the right
 *   3  cursor travels to "Write this in my voice"
 *   4  press
 *   5  drafting
 *   6  the script, in their language
 */
function HeroDemo({ isMobile }) {
  const ref = useRef(null);
  const inView = useInView(ref);
  const phase = useSceneClock(7, { active: inView, interval: 1150, hold: 3 });

  const opened = phase >= 2;
  const drafting = phase === 5;
  const written = phase >= 6;

  // Where the pointer is, per phase. Percentages across the window, so it lands
  // on the same control at every width.
  const spot =
    phase <= 0 ? { left: "44%", top: 300 } :
    phase <= 2 ? { left: "20%", top: 96 } :
    { left: isMobile ? "26%" : "62%", top: isMobile ? 250 : 62 };
  const pressed = phase === 2 || phase === 4;

  return (
    <div
      ref={ref}
      className="hg-drift"
      style={{
        position: "relative",
        maxWidth: 1080,
        margin: "0 auto",
        borderRadius: isMobile ? 14 : 20,
        border: "1px solid rgba(255,255,255,.12)",
        background: "linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.015))",
        boxShadow: "0 50px 120px -50px rgba(255,0,0,.45), 0 0 0 1px rgba(255,255,255,.03) inset",
        overflow: "hidden",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
      <div
        style={{
          display: "flex", alignItems: "center", gap: 7,
          padding: "10px 14px",
          borderBottom: "1px solid rgba(255,255,255,.07)",
          background: "rgba(255,255,255,.03)",
        }}
      >
        <Dot /><Dot /><Dot />
        <span
          style={{
            marginLeft: 8, fontSize: 11, color: "var(--d-mute)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          chomske.com/app/topics
        </span>
      </div>

      <div style={{ position: "relative" }}>
        {/* Hidden on phones: there is no pointer on a touch screen, and drawing
            one there is a lie about how the product is used. */}
        <Cursor {...spot} pressed={pressed} hidden={isMobile} />

        <div
          style={{
            display: isMobile ? "block" : "grid",
            gridTemplateColumns: "1.02fr 1fr",
            minHeight: isMobile ? 0 : 330,
          }}
        >
          {/* Left: the shortlist */}
          <div style={{ padding: isMobile ? 14 : 18, borderRight: isMobile ? "none" : "1px solid rgba(255,255,255,.07)" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: isMobile ? 13.5 : 15, fontWeight: 700, color: "var(--d-ink)" }}>
                What to cover today
              </span>
              <span style={{ fontSize: 10.5, color: "var(--d-mute)" }}>checked 4m ago</span>
            </div>

            {/* The selected row lifts on the press, exactly as the real feed's
                selected row does — the demo has to match the product it shows. */}
            <div
              style={{
                borderRadius: 10, marginBottom: 8,
                border: `1px solid rgba(255,0,0,${opened ? ".55" : ".22"})`,
                background: `linear-gradient(180deg, rgba(255,0,0,${opened ? ".16" : ".10"}), rgba(255,0,0,.025))`,
                padding: "11px 13px",
                transition: "border-color .3s ease, background .3s ease",
              }}
            >
              <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: ".08em", color: "var(--yt)", marginBottom: 5 }}>
                NEW
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.42, color: "var(--d-ink)" }}>
                OpenAI ships a model that runs offline on a laptop
              </div>
              <div style={{ fontSize: 10.5, color: "var(--d-mute)", marginTop: 6 }}>
                18 sources · Hacker News, The Verge · 12m ago
              </div>
            </div>

            <MockRow
              tone="255,255,255"
              title="Nvidia buys an open-source AI lab for $13 billion"
              meta="14 sources · Google News · 2h ago"
            />
            <MockRow
              tone="255,255,255"
              dim
              title="India's UPI adds an offline payments mode"
              meta="9 sources · Google News · 4h ago"
            />
          </div>

          {/* Right: what opening a story gives you */}
          <div
            style={{
              padding: isMobile ? 14 : 18,
              borderTop: isMobile ? "1px solid rgba(255,255,255,.07)" : "none",
              minHeight: isMobile ? 210 : 0,
            }}
          >
            {!opened ? (
              <div style={{ display: "grid", placeItems: "center", height: "100%", minHeight: 120 }}>
                <span style={{ fontSize: 12, color: "var(--d-mute)" }}>Pick a story to see what happened.</span>
              </div>
            ) : (
              <div className="hg-fade">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontSize: 11.5, fontWeight: 700, padding: "6px 12px", borderRadius: 999,
                      color: "#fff", background: "var(--yt)",
                      boxShadow: pressed && phase === 4 ? "0 0 0 5px rgba(255,0,0,.25)" : "none",
                      transition: "box-shadow .2s ease",
                    }}
                  >
                    Write this in my voice
                  </span>
                  <span style={{ fontSize: 10.5, color: "var(--d-mute)" }}>learned from 5 of your videos</span>
                </div>

                {!drafting && !written && (
                  <p style={{ fontSize: 11.5, lineHeight: 1.65, color: "var(--d-body)", margin: 0 }}>
                    <strong style={{ color: "var(--d-ink)" }}>Why it ranks.</strong>{" "}
                    A frontier model that runs without a connection — the first one people can
                    actually try on their own laptop.
                  </p>
                )}

                {drafting && (
                  <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 11.5, color: "var(--d-body)" }}>
                    <span
                      style={{
                        width: 13, height: 13, borderRadius: "50%", flexShrink: 0,
                        border: "2px solid rgba(255,255,255,.18)", borderTopColor: "var(--yt)",
                        animation: "hg-spin .8s linear infinite",
                      }}
                    />
                    Writing in your voice…
                  </div>
                )}

                {written && <DemoScript isMobile={isMobile} />}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const SCRIPT_WORDS =
  "तो दोस्तों, आज की सबसे बड़ी खबर — OpenAI ने एक ऐसा model निकाल दिया है जो आपके laptop पर बिना internet के चलेगा। मैंने खुद try किया, और सच बताऊँ तो...".split(
    " "
  );

/**
 * The script, arriving word by word.
 *
 * ── WORD BY WORD, NEVER CHARACTER BY CHARACTER ───────────────────────────────
 * This text is Devanagari. A matra is a separate code point that attaches to
 * the consonant before it, so slicing a Hindi string one character at a time
 * renders half-formed clusters and stray floating vowel marks for a frame each
 * — broken-looking, in exactly the script the page is promising to handle well.
 * Splitting on spaces means every frame shows whole, correctly shaped words.
 */
function DemoScript({ isMobile }) {
  const [n, setN] = useState(0);

  useEffect(() => {
    const still =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (still) { setN(SCRIPT_WORDS.length); return; }
    const t = setInterval(() => setN((v) => (v >= SCRIPT_WORDS.length ? v : v + 1)), 85);
    return () => clearInterval(t);
  }, []);

  return (
    <p
      className="indic hg-fade"
      style={{
        fontSize: isMobile ? 12.5 : 13.5, lineHeight: 1.85,
        color: "var(--d-ink)", margin: 0, minHeight: isMobile ? 110 : 130,
      }}
    >
      {SCRIPT_WORDS.slice(0, n).join(" ")}
      {n < SCRIPT_WORDS.length && (
        <span
          className="hg-caret"
          aria-hidden="true"
          style={{
            display: "inline-block", width: 2, height: "1em",
            marginLeft: 3, verticalAlign: "text-bottom", background: "var(--yt)",
          }}
        />
      )}
    </p>
  );
}


function MockRow({ title, meta, tone, isNew, dim }) {
  return (
    <div
      style={{
        padding: "11px 13px",
        borderRadius: 11,
        marginBottom: 8,
        background: `linear-gradient(180deg, rgba(${tone},.10), rgba(${tone},.025))`,
        border: `1px solid rgba(${tone},.22)`,
        opacity: dim ? 0.5 : 1,
      }}
    >
      {isNew && (
        <div
          style={{
            fontSize: 9.5, fontWeight: 800, letterSpacing: "0.08em",
            color: `rgb(${tone})`, marginBottom: 5,
          }}
        >
          NEW
        </div>
      )}
      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.42, color: "var(--d-ink)" }}>{title}</div>
      <div style={{ fontSize: 10.5, color: "var(--d-mute)", marginTop: 6 }}>{meta}</div>
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
 * A moving band of the sources actually polled.
 *
 * Deliberately NOT a wall of customer logos. Every reference page in this
 * category opens with "trusted by" and eight companies that have never heard of
 * them, and a creator has seen that trick often enough to discount the whole
 * page for it. These are real endpoints in services/sources — a claim that can
 * be checked, which is worth more than a claim that cannot.
 */
function SourceBar() {
  return (
    <section
      style={{
        borderTop: "1px solid var(--d-line-soft)",
        borderBottom: "1px solid var(--d-line-soft)",
        padding: "18px 0",
        background: "rgba(255,255,255,.015)",
      }}
    >
      <div style={{ textAlign: "center", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--d-mute)", marginBottom: 14 }}>
        Watching 120+ sources
      </div>

      <div
        className="hg-marquee"
        style={{
          overflow: "hidden",
          maskImage: "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)",
          WebkitMaskImage: "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)",
        }}
      >
        {/* The list twice: the track travels exactly -50%, so copy two lands
            where copy one began and the loop has no visible seam. */}
        <div className="hg-marquee-track" aria-hidden="true">
          {[0, 1].map((copy) => (
            <div key={copy} style={{ display: "flex", alignItems: "center", gap: 40, paddingRight: 40 }}>
              {SOURCES.map((s) => (
                <span
                  key={`${copy}-${s}`}
                  style={{ fontSize: 14.5, fontWeight: 600, color: "rgba(238,246,244,.38)", whiteSpace: "nowrap" }}
                >
                  {s}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Sections ──────────────────────────────────────────────────────────────── */

/* ── How it works: the product, performed ──────────────────────────────────── */

/**
 * Three steps, each one a working miniature of the real screen with two lines
 * of text beside it.
 *
 * ── WHY THE COPY IS THIS SHORT ───────────────────────────────────────────────
 * This section used to be three paragraphs in three boxes. Nobody reads three
 * paragraphs on a landing page — they scan, decide, and leave. A creator can
 * watch a story get scored and a script get written in about four seconds, and
 * understand more from that than from sixty words explaining it. So the text is
 * a caption for the demo, not a substitute for one.
 */
function HowItWorks({ isMobile, pad }) {
  const steps = [
    {
      n: "01",
      tone: RED,
      title: "It watches while you sleep",
      body: "120+ sources, around the clock. Nothing waits for you to open the app.",
      scene: (a) => <SceneWatching active={a} />,
    },
    {
      n: "02",
      tone: LEAF,
      title: "It throws most of it away",
      body: "Every story is scored against your niche. You get the two or three worth a video.",
      scene: (a) => <SceneRanking active={a} />,
    },
    {
      n: "03",
      tone: MINT,
      title: "It writes the script in your voice",
      body: "One tap. Your hooks, your language, ready to read off the screen.",
      scene: (a) => <SceneWriting active={a} isMobile={isMobile} />,
    },
  ];

  return (
    <Section id="how" pad={pad} isMobile={isMobile} glow={LEAF}>
      <SectionHead
        isMobile={isMobile}
        eyebrow="How it works"
        title="Three things you no longer do"
        sub="Watch it happen. This is the actual screen, not an illustration of one."
      />

      <div style={{ marginTop: isMobile ? 34 : 60, display: "grid", gap: isMobile ? 34 : 64 }}>
        {steps.map((s, i) => (
          <StepRow key={s.n} step={s} index={i} isMobile={isMobile} />
        ))}
      </div>
    </Section>
  );
}

/**
 * One step. Alternates sides on desktop so the eye zig-zags down the page
 * instead of running down a single column of identical rows; stacks with the
 * visual FIRST on mobile, because the demo is the argument and a phone should
 * not make you read past the caption to reach it.
 */
function StepRow({ step, index, isMobile }) {
  const ref = useRef(null);
  const active = useInView(ref);
  const flip = !isMobile && index % 2 === 1;

  return (
    <div
      ref={ref}
      className="hg-reveal"
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        gap: isMobile ? 18 : 56,
        alignItems: "center",
      }}
    >
      <div style={{ order: flip ? 2 : 1 }}>{step.scene(active)}</div>

      <div style={{ order: flip ? 1 : 2 }}>
        <div
          style={{
            fontSize: isMobile ? 26 : 34, fontWeight: 800,
            letterSpacing: "-0.04em", lineHeight: 1,
            color: `rgba(${step.tone},.92)`,
            textShadow: `0 0 34px rgba(${step.tone},.45)`,
            marginBottom: 14,
          }}
        >
          {step.n}
        </div>
        <h3
          style={{
            fontSize: isMobile ? 20 : 26, fontWeight: 750,
            letterSpacing: "-0.028em", lineHeight: 1.22,
            color: "var(--d-ink)", margin: "0 0 10px",
          }}
        >
          {step.title}
        </h3>
        <p style={{ fontSize: isMobile ? 14.5 : 16, lineHeight: 1.6, color: "var(--d-body)", margin: 0, maxWidth: 420 }}>
          {step.body}
        </p>
      </div>
    </div>
  );
}

/* ── The three scenes ──────────────────────────────────────────────────────── */

/** 01 — stories arriving on their own, with the clock running. */
function SceneWatching({ active }) {
  const phase = useSceneClock(5, { active, interval: 900, hold: 2 });

  const rows = [
    { t: "OpenAI ships a model that runs offline", m: "18 sources · Hacker News · 12m ago", tone: RED, isNew: true },
    { t: "Nvidia buys an open-source AI lab", m: "14 sources · Google News · 41m ago", tone: WHITE },
    { t: "India's UPI adds offline payments", m: "9 sources · Google News · 1h ago", tone: WHITE },
    { t: "Anthropic opens an enterprise tier", m: "6 sources · Google News · 2h ago", tone: WHITE },
  ];

  return (
    <DemoFrame label="chomske.com/app/topics" tone={RED} height={252}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--d-ink)" }}>What to cover today</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--d-mute)" }}>
          <span className="hg-ping" style={{ width: 6, height: 6, borderRadius: "50%", background: `rgb(${RED})` }} />
          {phase === 0 ? "checking…" : "just now"}
        </span>
      </div>

      {rows.map((r, i) => (
        <DemoRow
          key={r.t}
          compact
          tone={r.tone}
          title={r.t}
          meta={r.m}
          isNew={r.isNew && phase >= 1}
          // Each row lands one tick after the last, so the panel visibly fills
          // rather than appearing complete.
          state={phase > i ? "in" : "hidden"}
        />
      ))}
    </DemoFrame>
  );
}

/** 02 — the scoring pass, and what it throws away. */
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
    <DemoFrame label="ranking · ai_tech" tone={LEAF} height={252}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--d-ink)" }}>
          {phase === 0 ? "Scoring 2,140 stories" : phase >= 3 ? "Worth a video today" : "Scoring 2,140 stories"}
        </span>
        <span style={{ fontSize: 10, color: "var(--d-mute)" }}>
          {phase >= 3 ? "2 kept" : `${rows.length} shown`}
        </span>
      </div>

      {rows.map((r, i) => {
        // Phase 1 puts a number on everything; phase 2 strikes the weak ones;
        // phase 3 removes them. Dropping straight from 5 rows to 2 would hide
        // the very thing this scene exists to show.
        const state = phase >= 3 && !r.keep ? "hidden" : phase >= 2 && !r.keep ? "dropped" : "in";
        return (
          <DemoRow
            key={r.t}
            compact
            tone={r.keep ? LEAF : WHITE}
            title={r.t}
            score={phase >= 1 ? r.s : null}
            state={state}
          />
        );
      })}

      {phase >= 3 && (
        <div className="hg-fade" style={{ fontSize: 10.5, lineHeight: 1.6, color: "var(--d-body)", marginTop: 4 }}>
          <strong style={{ color: "var(--d-ink)" }}>Why it ranks.</strong>{" "}
          First frontier model people can run on their own laptop.
        </div>
      )}
    </DemoFrame>
  );
}

/**
 * 03 — the script being written.
 *
 * Drawn as a SCRIPT PAGE rather than a chat bubble: numbered lines, the
 * language it is in, and the two buttons a creator actually reaches for. This
 * is the frame the whole product is for, so it should look like the thing they
 * will read off a screen while recording, not like a chatbot's answer.
 */
function SceneWriting({ active, isMobile }) {
  const phase = useSceneClock(5, { active, interval: 1100, hold: 3 });

  const drafting = phase === 2;
  const writing = phase >= 3;
  const spot = phase <= 0 ? { left: "62%", top: 190 } : { left: "26%", top: 44 };

  return (
    <DemoFrame label="your script · Hindi-English" tone={MINT} height={252}>
      <Cursor {...spot} pressed={phase === 1} hidden={isMobile} />

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 999,
            color: "#fff", background: `rgb(${RED})`,
            boxShadow: phase === 1 ? `0 0 0 5px rgba(${RED},.25)` : "none",
            transition: "box-shadow .2s ease",
          }}
        >
          Write this in my voice
        </span>
        <span style={{ fontSize: 10, color: "var(--d-mute)" }}>Hinglish · 2 videos</span>
      </div>

      {drafting && (
        <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 11.5, color: "var(--d-body)" }}>
          <span
            style={{
              width: 13, height: 13, borderRadius: "50%", flexShrink: 0,
              border: `2px solid rgba(255,255,255,.16)`, borderTopColor: `rgb(${MINT})`,
              animation: "hg-spin .8s linear infinite",
            }}
          />
          Reading the coverage, then drafting…
        </div>
      )}

      {writing && <ScriptPage active={active} />}

      {!drafting && !writing && (
        <div style={{ fontSize: 11, color: "var(--d-mute)" }}>
          Pick a story and press the button.
        </div>
      )}
    </DemoFrame>
  );
}

/** Numbered script lines, arriving one at a time. */
function ScriptPage({ active }) {
  const LINES = [
    "तो दोस्तों, OpenAI ने GPT-6 Astra release कर दिया,",
    "और कहा कि हम AGI era में आ चुके हैं।",
    "लेकिन असली बात ये है —",
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
            transition: "opacity .35s ease, transform .35s ease",
          }}
        >
          <span style={{ fontSize: 9, color: "var(--d-mute)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
            {String(i + 1).padStart(2, "0")}
          </span>
          <span>{l}</span>
        </div>
      ))}
    </div>
  );
}

/* ── What you get ──────────────────────────────────────────────────────────── */

/**
 * Three things, each one shown rather than claimed.
 *
 * Replaces six text tiles. The six were true and nobody was reading them: a
 * bulleted list of virtues is the part of a landing page a creator scrolls
 * past. Each of these is a small piece of the real interface doing the thing
 * its heading describes.
 */
function WhatYouGet({ isMobile, pad }) {
  const items = [
    {
      tone: RED,
      title: "Every source, checkable",
      body: "Nothing is invented. Open the links it read.",
      scene: (a) => <SceneSources active={a} />,
    },
    {
      tone: LEAF,
      title: "A voice built from your videos",
      body: "Your hooks, your sign-offs, your mix of English.",
      scene: (a) => <SceneVoice active={a} />,
    },
    {
      tone: MINT,
      title: "A script, not a prompt",
      body: "Finished and ready to record. Copy and go.",
      scene: (a) => <SceneCopy active={a} isMobile={isMobile} />,
    },
  ];

  return (
    <Section id="what" pad={pad} isMobile={isMobile} glow={MINT}>
      <SectionHead
        isMobile={isMobile}
        eyebrow="What you get"
        title="A shortlist and a draft, every morning"
        sub="Not a feed to triage. A decision already made, with the evidence attached."
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
          gap: isMobile ? 20 : 24,
          marginTop: isMobile ? 32 : 52,
        }}
      >
        {items.map((it) => (
          <GetTile key={it.title} item={it} isMobile={isMobile} />
        ))}
      </div>
    </Section>
  );
}

function GetTile({ item, isMobile }) {
  const ref = useRef(null);
  const active = useInView(ref);

  return (
    <div ref={ref} className="hg-reveal">
      {item.scene(active)}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
          <span
            aria-hidden="true"
            style={{
              width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
              background: `rgb(${item.tone})`, boxShadow: `0 0 12px rgba(${item.tone},.8)`,
            }}
          />
          <span style={{ fontSize: isMobile ? 15.5 : 16.5, fontWeight: 700, color: "var(--d-ink)" }}>
            {item.title}
          </span>
        </div>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--d-body)", margin: 0 }}>{item.body}</p>
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
    <DemoFrame label="sources · 56" tone={RED} height={196}>
      {rows.map(([src, when, title], i) => (
        <div
          key={title}
          style={{
            padding: "9px 11px", borderRadius: 9, marginBottom: 7,
            border: "1px solid rgba(255,255,255,.09)",
            background: "rgba(255,255,255,.03)",
            opacity: i < shown ? 1 : 0,
            transform: i < shown ? "none" : "translateY(6px)",
            transition: "opacity .4s ease, transform .4s ease",
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

/** The voice set filling up — their own My voice screen. */
function SceneVoice({ active }) {
  const phase = useSceneClock(4, { active, interval: 900, hold: 3 });
  const added = Math.min(phase, 2);

  return (
    <DemoFrame label="my voice" tone={LEAF} height={196}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--d-ink)", marginBottom: 4 }}>My voice</div>
      <div style={{ fontSize: 10, color: "var(--d-mute)", marginBottom: 11 }}>
        Up to 5 of your own shorts, under 60 seconds each.
      </div>

      {[
        ["AI से पैसे कैसे कमाएँ", "51s"],
        ["Mastering the Claude Suite", "50s"],
      ].map(([t, len], i) => (
        <div
          key={t}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 10px", borderRadius: 9, marginBottom: 7,
            border: "1px solid rgba(255,255,255,.09)", background: "rgba(255,255,255,.03)",
            opacity: i < added ? 1 : 0,
            transform: i < added ? "none" : "translateY(6px)",
            transition: "opacity .4s ease, transform .4s ease",
          }}
        >
          <span className="indic" style={{ fontSize: 10.5, color: "var(--d-ink)", flex: 1, minWidth: 0 }}>{t}</span>
          <span
            style={{
              fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
              color: `rgb(${LEAF})`, background: `rgba(${LEAF},.14)`, border: `1px solid rgba(${LEAF},.3)`,
            }}
          >
            Ready
          </span>
          <span style={{ fontSize: 9, color: "var(--d-mute)" }}>{len}</span>
        </div>
      ))}

      {/* The slot dots from the real screen — five, filling as videos land. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
        {[0, 1, 2, 3, 4].map((d) => (
          <span
            key={d}
            style={{
              width: 6, height: 6, borderRadius: "50%",
              background: d < added ? `rgb(${LEAF})` : "rgba(255,255,255,.16)",
              transition: "background .3s ease",
            }}
          />
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
    <DemoFrame label="your script" tone={MINT} height={196}>
      <Cursor {...spot} pressed={phase === 2} hidden={isMobile} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 11 }}>
        <span style={{ fontSize: 9.5, color: "var(--d-mute)" }}>Hindi-English · from 2 videos</span>
        <span
          style={{
            fontSize: 10, fontWeight: 700, padding: "5px 11px", borderRadius: 8,
            color: copied ? "#04120F" : "var(--d-ink)",
            background: copied ? `rgb(${MINT})` : "rgba(255,255,255,.07)",
            border: `1px solid ${copied ? `rgb(${MINT})` : "rgba(255,255,255,.14)"}`,
            transition: "background .25s ease, color .25s ease, border-color .25s ease",
            whiteSpace: "nowrap",
          }}
        >
          {copied ? "Copied ✓" : "Copy script"}
        </span>
      </div>

      <p
        className="indic"
        style={{ fontSize: 11, lineHeight: 1.8, color: "var(--d-ink)", margin: 0 }}
      >
        मार्केट में नया update आते ही सिर्फ ऊपर-ऊपर के features देखकर छोड़ देना बहुत easy है। लेकिन उस model
        के background में जो चल रहा है, वो समझना असली काम है।
      </p>
    </DemoFrame>
  );
}

function VoiceProof({ isMobile, pad }) {
  const samples = [
    {
      lang: "Hindi",
      native: "हिन्दी",
      tone: RED,
      text: "देखो भाई, ये launch normal नहीं है। मैंने पूरा paper पढ़ा है और तीन चीज़ें ऐसी हैं जो किसी ने बताई ही नहीं।",
    },
    {
      lang: "Telugu",
      native: "తెలుగు",
      tone: LEAF,
      text: "ఇది చాలా పెద్ద update గురు. నేను ఇందాక దీన్ని test చేశాను, అసలు ఏం జరిగిందో మీకు చెప్తాను.",
    },
  ];

  return (
    <Section id="voice" pad={pad} isMobile={isMobile} glow={GLOW.red}>
      <SectionHead
        isMobile={isMobile}
        eyebrow="Your voice"
        title="It sounds like you, not like a tool"
        sub="Add a few of your own videos. The profile learns your hooks, your rhythm, and how much English you mix in — then writes that way."
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: isMobile ? 14 : 20,
          marginTop: isMobile ? 30 : 46,
        }}
      >
        {samples.map((s, i) => (
          <div
            key={s.lang}
            className="hg-reveal"
            style={{
              padding: isMobile ? "20px 18px" : "26px 24px",
              borderRadius: 16,
              border: `1px solid rgba(${s.tone},.24)`,
              background: `linear-gradient(180deg, rgba(${s.tone},.09), rgba(255,255,255,.02))`,
              transitionDelay: `${i * 0.1}s`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span className="indic" style={{ fontSize: 15, fontWeight: 700, color: `rgb(${s.tone})` }}>
                {s.native}
              </span>
              <span style={{ fontSize: 11.5, color: "var(--d-mute)" }}>{s.lang} · your own phrasing</span>
              <span
                className="hg-eq"
                aria-hidden="true"
                style={{ display: "flex", alignItems: "flex-end", gap: 3, marginLeft: "auto", height: 18 }}
              >
                {[0, 1, 2, 3, 4].map((b) => (
                  <span key={b} style={{ animationDelay: `${b * 0.13}s`, background: `rgb(${s.tone})` }} />
                ))}
              </span>
            </div>
            <p className="indic" style={{ fontSize: isMobile ? 15 : 16.5, lineHeight: 1.9, color: "var(--d-ink)", margin: 0 }}>
              {s.text}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Niches({ isMobile, pad }) {
  // Mirrors services/categories.js. Colours are the brand seven, so a niche chip
  // here matches the colour that names that category inside the app.
  const niches = [
    ["AI & technology", RED],
    ["Stock market & finance", FOREST],
    ["Business & startups", PINE],
    ["Crypto & Web3", LEAF],
    ["Film & entertainment", RED],
    ["Sports & cricket", MINT],
    ["Science & health", LEAF],
    ["Govt jobs & exams", FOREST],
  ];

  return (
    <Section id="niches" pad={pad} isMobile={isMobile} glow={GLOW.forest}>
      <SectionHead
        isMobile={isMobile}
        eyebrow="Niches"
        title="Pick up to three"
        sub="Each one is watched separately, with its own editorial bar — a rate decision is a 10 to a finance channel and a 0 to a film channel."
      />

      <div
        style={{
          display: "flex", flexWrap: "wrap", gap: isMobile ? 9 : 12,
          justifyContent: "center", marginTop: isMobile ? 28 : 42,
        }}
      >
        {niches.map(([label, tone], i) => (
          <span
            key={label}
            className="hg-reveal hg-d-card"
            style={{
              display: "inline-flex", alignItems: "center", gap: 9,
              fontSize: isMobile ? 13 : 14.5, fontWeight: 600,
              padding: isMobile ? "10px 16px" : "12px 20px",
              borderRadius: 999,
              border: `1px solid rgba(${tone},.3)`,
              background: `rgba(${tone},.07)`,
              color: "var(--d-ink)",
              transitionDelay: `${i * 0.05}s`,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                background: `rgb(${tone})`, boxShadow: `0 0 10px rgba(${tone},.7)`,
              }}
            />
            {label}
          </span>
        ))}
      </div>
    </Section>
  );
}

function ClosingCta({ isMobile, pad, onCredential, busy }) {
  return (
    <section style={{ position: "relative", padding: `${isMobile ? 62 : 100}px ${pad} ${isMobile ? 70 : 116}px`, overflow: "hidden" }}>
      {/* Two washes rather than one: a wide cyan floor, and a tighter mint core
          directly under the heading. A single blob at this size flattens into
          grey the moment it is blurred. */}
      <div
        aria-hidden="true"
        className="hg-aurora hg-aurora-c"
        style={{
          width: "84vw", height: "46vw", maxWidth: 1200, maxHeight: 620,
          left: "8vw", bottom: "-24vw",
          background: `radial-gradient(circle, rgba(${RED},.20), transparent 68%)`,
        }}
      />
      <div
        aria-hidden="true"
        className="hg-aurora hg-aurora-a"
        style={{
          width: "46vw", height: "30vw", maxWidth: 620, maxHeight: 380,
          left: "50%", top: "-8vw", marginLeft: "-23vw",
          background: `radial-gradient(circle, rgba(${MINT},.14), transparent 70%)`,
        }}
      />

      <div className="hg-reveal" style={{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: 720, margin: "0 auto" }}>
        <h2
          style={{
            fontSize: isMobile ? 28 : "clamp(32px, 3.2vw, 56px)",
            fontWeight: 800, letterSpacing: "-0.038em", lineHeight: 1.08,
            color: "var(--d-ink)", margin: "0 0 16px",
          }}
        >
          Tomorrow morning, it is already done.
        </h2>
        <p style={{ fontSize: isMobile ? 15 : 17, lineHeight: 1.62, color: "var(--d-body)", margin: "0 0 30px" }}>
          Sign in, pick your niche, and see what today looks like when the topic
          is already chosen and the script is already written.
        </p>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <SignIn onCredential={onCredential} onError={() => {}} busy={busy} />
        </div>
        <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--d-mute)" }}>
          Free to start. No card required.
        </div>
      </div>
    </section>
  );
}

/* ── Shared pieces ─────────────────────────────────────────────────────────── */

/**
 * @param {string} glow  an rgb triple. A wide, very faint wash behind the
 *   section's heading. Without it the page below the hero is five identical
 *   black slabs — the content varies and the surface never does, which reads as
 *   a template. One colour per section gives each its own light without
 *   introducing a second accent system.
 */
function Section({ id, pad, isMobile, glow, children }) {
  return (
    <section
      id={id}
      style={{
        position: "relative",
        padding: `${isMobile ? 52 : 84}px ${pad}`,
        borderTop: "1px solid var(--d-line-soft)",
        overflow: "hidden",
      }}
    >
      {glow && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute", top: -170, left: "50%", transform: "translateX(-50%)",
            width: "min(1000px, 92vw)", height: 380, pointerEvents: "none",
            background: `radial-gradient(circle, rgba(${glow},.11), transparent 68%)`,
            filter: "blur(28px)",
          }}
        />
      )}
      <div style={{ position: "relative", maxWidth: 1180, margin: "0 auto" }}>{children}</div>
    </section>
  );
}

function SectionHead({ eyebrow, title, sub, isMobile }) {
  return (
    <div className="hg-reveal" style={{ textAlign: "center", maxWidth: 680, margin: "0 auto" }}>
      <div
        style={{
          fontSize: 11, fontWeight: 700, letterSpacing: "0.16em",
          textTransform: "uppercase", color: "var(--d-mute)", marginBottom: 14,
        }}
      >
        {eyebrow}
      </div>
      <h2
        style={{
          fontSize: isMobile ? 25 : "clamp(28px, 2.8vw, 46px)",
          fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.12,
          color: "var(--d-ink)", margin: "0 0 14px",
        }}
      >
        {title}
      </h2>
      {sub && (
        <p style={{ fontSize: isMobile ? 14.5 : 16.5, lineHeight: 1.62, color: "var(--d-body)", margin: 0 }}>
          {sub}
        </p>
      )}
    </div>
  );
}

/**
 * Google's button renders its own white pill, which sits correctly on the dark
 * ground without restyling. It is wrapped rather than replaced because a
 * custom-drawn "Sign in with Google" is against Google's brand terms and, more
 * practically, breaks One Tap.
 */
function SignIn({ onCredential, onError, busy }) {
  return (
    <div style={{ display: "inline-flex", opacity: busy ? 0.55 : 1, transition: "opacity .2s ease" }}>
      <GoogleLogin
        onSuccess={onCredential}
        onError={onError}
        text="continue_with"
        shape="pill"
        size="large"
        width="260"
      />
    </div>
  );
}

function Dot() {
  return <span style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,255,255,.16)" }} />;
}

/**
 * Where the script ends up.
 *
 * ── WHY THESE PATHS AND NOT AN ICON PACKAGE ──────────────────────────────────
 * This project has six dependencies. @mui/icons-material would be a seventh
 * that drags @mui/material and two emotion packages behind it, all so three
 * marks can be drawn. These are the official single-colour brand paths (the
 * Simple Icons geometry), inlined — same shapes, nothing installed.
 *
 * The first attempt was hand-simplified versions of them, and it showed: the
 * Instagram mark came out as a filled blob at 19px, because that glyph is a
 * rounded square with a hole, a ring with a hole, and a dot — approximate any
 * of the three and it fills in solid.
 *
 * Each sits in a badge rather than floating loose in the line. At icon size on
 * a dark ground these were too small to identify, and the point of the row is
 * instant recognition — if you have to squint at it, it has said nothing.
 * YouTube keeps its own red; the other two are white, because three brand
 * colours in a row reads as a sponsor strip.
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
    <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
      {PLATFORMS.map((m) => (
        <span
          key={m.name}
          title={m.name}
          style={{
            display: "inline-grid", placeItems: "center",
            width: size + 14, height: size + 14, borderRadius: 10,
            border: "1px solid rgba(255,255,255,.13)",
            background: "rgba(255,255,255,.05)",
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

function Footer({ pad, isMobile }) {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--d-line-soft)",
        padding: `26px ${pad}`,
        display: "flex", flexWrap: "wrap", gap: 14,
        alignItems: "center", justifyContent: "space-between",
        background: "rgba(255,255,255,.015)",
      }}
    >
      <Logo color="var(--d-ink)" />
      <div style={{ fontSize: 12.5, color: "var(--d-mute)", textAlign: isMobile ? "left" : "right" }}>
        © {new Date().getFullYear()} Chomske · chomske.com
      </div>
    </footer>
  );
}

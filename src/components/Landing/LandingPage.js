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

/** The brand seven as rgb triples, for translucent light on a dark ground. */
const GLOW = {
  cyan: "0,183,205",
  mint: "112,255,210",
  leaf: "118,196,87",
  forest: "42,124,19",
  pine: "42,131,95",
  ice: "227,242,253",
  orchid: "255,166,251",
};

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
    <div ref={page} className="hg-dark" style={{ minHeight: "100vh", overflowX: "hidden" }}>
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
      <Capabilities isMobile={isMobile} pad={pad} />
      <VoiceProof isMobile={isMobile} pad={pad} />
      <Niches isMobile={isMobile} pad={pad} />
      <ClosingCta isMobile={isMobile} pad={pad} onCredential={handleCredential} busy={busy} />
      <Footer pad={pad} isMobile={isMobile} />
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
        background: stuck ? "rgba(6,9,10,.72)" : "transparent",
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

        <a
          href="#start"
          className="hg-d-ghost"
          style={{
            fontSize: 13, fontWeight: 650, padding: "9px 17px", borderRadius: 999,
            border: "1px solid var(--d-line)", color: "var(--d-ink)",
            textDecoration: "none", whiteSpace: "nowrap",
            background: "rgba(255,255,255,.04)",
          }}
        >
          Get started
        </a>
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
          <a
            href="#how"
            className="hg-d-ghost"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              fontSize: 14, fontWeight: 600, padding: "11px 21px", borderRadius: 999,
              border: "1px solid var(--d-line)", color: "var(--d-ink)",
              background: "rgba(255,255,255,.03)", textDecoration: "none",
            }}
          >
            See how it works
            <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>↓</span>
          </a>
        </div>

        {error && (
          <div role="alert" style={{ marginTop: 14, fontSize: 13.5, color: "#FF8E8A" }}>
            {error}
          </div>
        )}

        <div className="hg-reveal" style={{ marginTop: 14, fontSize: 12.5, color: "var(--d-mute)", transitionDelay: ".22s" }}>
          Free to start · No card required · Works in your language
        </div>

        <div
          className="hg-reveal"
          style={{ marginTop: isMobile ? 40 : 62, transitionDelay: ".26s" }}
        >
          <AppWindow isMobile={isMobile} />
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
 * The app's own two panes, at small scale.
 *
 * A feature list can claim anything. Showing the screen a creator will actually
 * open every morning makes the claim checkable in two seconds, which is why the
 * hero ends on this rather than on an illustration.
 */
function AppWindow({ isMobile }) {
  return (
    <div
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
      {/* Window chrome */}
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

      <div
        style={{
          display: isMobile ? "block" : "grid",
          gridTemplateColumns: "1.05fr 1fr",
          minHeight: isMobile ? 0 : 340,
        }}
      >
        {/* Left: the ranked feed */}
        <div style={{ padding: isMobile ? 14 : 18, borderRight: isMobile ? "none" : "1px solid rgba(255,255,255,.07)" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: isMobile ? 13.5 : 15, fontWeight: 700, color: "var(--d-ink)" }}>
              What to cover today
            </span>
            <span style={{ fontSize: 10.5, color: "var(--d-mute)" }}>checked 4m ago</span>
          </div>

          {/* Red marks the one story that is live; the rest are white on black.
              Colour used as a signal, not as decoration — which is also exactly
              how the real feed uses its NEW badge. */}
          <MockRow
            tone="255,0,0"
            isNew
            title="OpenAI ships a model that runs offline on a laptop"
            meta="18 sources · Hacker News, The Verge · 12m ago"
          />
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

        {/* Right: the script it writes */}
        <div style={{ padding: isMobile ? 14 : 18, borderTop: isMobile ? "1px solid rgba(255,255,255,.07)" : "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 11.5, fontWeight: 700, padding: "6px 12px", borderRadius: 999,
                color: "#fff",
                background: "var(--yt)",
              }}
            >
              Write this in my voice
            </span>
            <span style={{ fontSize: 10.5, color: "var(--d-mute)" }}>
              learned from 5 of your videos
            </span>
          </div>
          <ScriptTyping isMobile={isMobile} />
        </div>
      </div>
    </div>
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

/**
 * The script, typing itself out.
 *
 * ── WORD BY WORD, NEVER CHARACTER BY CHARACTER ───────────────────────────────
 * This text is Devanagari. A matra is a separate code point that attaches to the
 * consonant before it, so slicing a Hindi string one character at a time renders
 * half-formed clusters and stray floating vowel marks for a frame each — the
 * effect looks broken in exactly the script the page is promising to handle
 * well. Splitting on spaces means every frame shows whole, correctly shaped
 * words.
 */
const SCRIPT_WORDS =
  "तो दोस्तों, आज की सबसे बड़ी खबर — OpenAI ने एक ऐसा model निकाल दिया है जो आपके laptop पर बिना internet के चलेगा। मैंने खुद try किया, और सच बताऊँ तो...".split(
    " "
  );

function ScriptTyping({ isMobile }) {
  const [n, setN] = useState(0);

  useEffect(() => {
    // Somebody who asked for less motion gets the finished script immediately,
    // not a paragraph that assembles itself while they try to read it.
    const still =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (still) {
      setN(SCRIPT_WORDS.length);
      return;
    }

    const t = setInterval(() => {
      setN((v) => {
        // Holds on the finished paragraph for a beat, then starts over, so a
        // visitor who arrives mid-cycle still sees the whole thing.
        if (v > SCRIPT_WORDS.length + 8) return 0;
        return v + 1;
      });
    }, 105);
    return () => clearInterval(t);
  }, []);

  const done = n >= SCRIPT_WORDS.length;

  return (
    <p
      className="indic"
      style={{
        fontSize: isMobile ? 13.5 : 14.5,
        lineHeight: 1.85,
        color: "var(--d-ink)",
        margin: 0,
        // Reserves the finished paragraph's height so the card does not grow
        // line by line and shove the page around beneath it.
        minHeight: isMobile ? 132 : 152,
      }}
    >
      {SCRIPT_WORDS.slice(0, n).join(" ")}
      {!done && (
        <span
          className="hg-caret"
          aria-hidden="true"
          style={{
            display: "inline-block", width: 2, height: "1em",
            marginLeft: 3, verticalAlign: "text-bottom",
            background: "var(--yt)",
          }}
        />
      )}
    </p>
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
        Reading, every 15 minutes
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

function HowItWorks({ isMobile, pad }) {
  const steps = [
    {
      n: "01",
      tone: GLOW.cyan,
      title: "It reads the wires while you sleep",
      body:
        "A dozen sources every fifteen minutes — Google News, Hacker News, publisher feeds, and a live news API that answers in minutes rather than hours. Nothing waits for you to open the app.",
    },
    {
      n: "02",
      tone: GLOW.orchid,
      title: "It decides what deserves a video",
      body:
        "Most of what breaks is not worth covering. Every story is scored against your niche's own editorial bar, and you get the handful that clear it — with the reason, the angle, and every source that carried it.",
    },
    {
      n: "03",
      tone: GLOW.mint,
      title: "It writes the whole thing in your voice",
      body:
        "Built from your own videos: your hooks, your sign-offs, your mix of English and your language. One tap on a story and the script is there, ready to record.",
    },
  ];

  return (
    <Section id="how" pad={pad} isMobile={isMobile} glow={GLOW.cyan}>
      <SectionHead
        isMobile={isMobile}
        eyebrow="How it works"
        title="Three things you no longer do"
        sub="The hour before recording is research and writing. Both are finished before you sit down."
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
          gap: isMobile ? 14 : 20,
          marginTop: isMobile ? 30 : 46,
        }}
      >
        {steps.map((s, i) => (
          <div
            key={s.n}
            className="hg-reveal hg-d-card"
            style={{
              position: "relative",
              padding: isMobile ? "22px 20px" : "28px 26px",
              borderRadius: 16,
              border: "1px solid var(--d-line)",
              background: "var(--d-panel)",
              overflow: "hidden",
              transitionDelay: `${i * 0.09}s`,
            }}
          >
            {/* A single bar of the step's colour along the top edge — enough to
                separate the three without three coloured cards shouting. */}
            <span
              aria-hidden="true"
              style={{
                position: "absolute", top: 0, left: 0, right: 0, height: 1,
                background: `linear-gradient(90deg, transparent, rgba(${s.tone},.85), transparent)`,
              }}
            />
            {/* The number carries the section's rhythm, so it is sized to be
                seen from across the page rather than read. Its glow is what
                stops three bordered rectangles reading as a pricing table. */}
            <div
              style={{
                fontSize: isMobile ? 30 : 38, fontWeight: 800,
                letterSpacing: "-0.04em", lineHeight: 1,
                color: `rgba(${s.tone},.9)`,
                textShadow: `0 0 34px rgba(${s.tone},.45)`,
                marginBottom: isMobile ? 14 : 20,
              }}
            >
              {s.n}
            </div>
            <h3
              style={{
                fontSize: isMobile ? 17 : 19,
                fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.28,
                color: "var(--d-ink)", margin: "0 0 10px",
              }}
            >
              {s.title}
            </h3>
            <p style={{ fontSize: isMobile ? 14 : 14.5, lineHeight: 1.65, color: "var(--d-body)", margin: 0 }}>
              {s.body}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Capabilities({ isMobile, pad }) {
  const items = [
    ["Ranked, not listed", "Three stories worth covering, out of the few thousand that broke today."],
    ["Early, not late", "First-seen times on every story, so you post before the big channels do."],
    ["Yours, not generic", "The draft is written from your own videos, in the way you actually talk."],
    ["Your language, properly", "Hindi stays Hindi. Telugu stays Telugu. Code-mixing stays where you put it."],
    ["Sources you can check", "Every claim carries the links it came from. Nothing is invented for you."],
    ["One tap to a script", "Pick the story, get the script. No prompt to write, nothing to configure."],
  ];

  return (
    <Section id="what" pad={pad} isMobile={isMobile} glow={GLOW.mint}>
      <SectionHead
        isMobile={isMobile}
        eyebrow="What you get"
        title="A shortlist and a draft, every morning"
        sub="Not a feed to triage. A decision already made, with the evidence attached."
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(300px, 1fr))",
          gap: isMobile ? 12 : 18,
          marginTop: isMobile ? 30 : 46,
        }}
      >
        {items.map(([t, d], i) => (
          <div
            key={t}
            className="hg-reveal hg-d-card"
            style={{
              padding: isMobile ? "18px 18px" : "22px 22px",
              borderRadius: 14,
              border: "1px solid var(--d-line-soft)",
              background: "rgba(255,255,255,.028)",
              transitionDelay: `${(i % 3) * 0.08}s`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}>
              <span
                aria-hidden="true"
                style={{
                  width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                  background: "var(--d-mint)",
                  boxShadow: `0 0 12px rgba(${GLOW.mint},.8)`,
                }}
              />
              <span style={{ fontSize: isMobile ? 14.5 : 15.5, fontWeight: 700, color: "var(--d-ink)" }}>{t}</span>
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.62, color: "var(--d-body)", margin: 0 }}>{d}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

/**
 * The language claim, shown rather than asserted.
 *
 * This is the part of the product most likely to be disbelieved — every tool in
 * this category says it supports Indian languages and most of them mean
 * translated English. So the section is two real script openings side by side,
 * with the code-mixing left in, because that mix is exactly what a translation
 * layer destroys and what a creator will check for first.
 */
function VoiceProof({ isMobile, pad }) {
  const samples = [
    {
      lang: "Hindi",
      native: "हिन्दी",
      tone: GLOW.cyan,
      text: "देखो भाई, ये launch normal नहीं है। मैंने पूरा paper पढ़ा है और तीन चीज़ें ऐसी हैं जो किसी ने बताई ही नहीं।",
    },
    {
      lang: "Telugu",
      native: "తెలుగు",
      tone: GLOW.orchid,
      text: "ఇది చాలా పెద్ద update గురు. నేను ఇందాక దీన్ని test చేశాను, అసలు ఏం జరిగిందో మీకు చెప్తాను.",
    },
  ];

  return (
    <Section id="voice" pad={pad} isMobile={isMobile} glow={GLOW.orchid}>
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
    ["AI & technology", GLOW.cyan],
    ["Stock market & finance", GLOW.forest],
    ["Business & startups", GLOW.pine],
    ["Crypto & Web3", GLOW.leaf],
    ["Film & entertainment", GLOW.orchid],
    ["Sports & cricket", GLOW.mint],
    ["Science & health", GLOW.ice],
    ["Govt jobs & exams", GLOW.orchid],
  ];

  return (
    <Section id="niches" pad={pad} isMobile={isMobile} glow={GLOW.leaf}>
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
          background: `radial-gradient(circle, rgba(${GLOW.cyan},.26), transparent 68%)`,
        }}
      />
      <div
        aria-hidden="true"
        className="hg-aurora hg-aurora-a"
        style={{
          width: "46vw", height: "30vw", maxWidth: 620, maxHeight: 380,
          left: "50%", top: "-8vw", marginLeft: "-23vw",
          background: `radial-gradient(circle, rgba(${GLOW.mint},.14), transparent 70%)`,
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

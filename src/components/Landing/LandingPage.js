/**
 * LandingPage.js: the page somebody sees before they have anything to record.
 *
 * ── SHOW IT, DON'T SAY IT ────────────────────────────────────────────────────
 * Every section leads with the thing working, and the words are what is left
 * to say once it has been seen. The hero is a recording being edited as you
 * watch; the slider is the same recording before and after; the editor is the
 * timeline that recording produced. They are one script (film.js), so the
 * zoom marks under the hero, the blocks in the editor and the camera in both
 * cannot tell different stories.
 *
 * ── WHAT THE PAGE HAS TO GET ACROSS ──────────────────────────────────────────
 * 1. It zooms to your clicks by itself.           (hero, before/after)
 * 2. There is nothing to install, in any browser.  (the install section)
 *    That is the difference from every alternative: desktop recorders are an
 *    app per operating system, auto-zoom extensions are one browser's store.
 * 3. How it works, in the viewer's words.         (the dark band)
 * 4. Everything else a demo needs is there, and all of it can be changed.
 *
 * ── HONEST BY CONSTRUCTION ───────────────────────────────────────────────────
 * Nothing here describes a feature the code does not have. Where a claim is a
 * number (prices, formats, presets) the file it comes from is named beside it.
 *
 * ── AND THE METHOD STAYS OURS ────────────────────────────────────────────────
 * The page says what Clipo does for someone, never how it does it. Nothing
 * here, in public/index.html or in public/llms.txt describes how the pointer
 * or the clicks are found, what the frames are read with, or what is measured:
 * that is the part a competitor would copy. Write the result, not the recipe.
 */
import { useEffect, useRef, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import api, { errorMessage } from "../../api";
import Logo from "../Shell/Logo";
import { useInView } from "./film";
import { HeroFilm, CompareFilm, EditorFilm, CursorGlyph } from "./demo";
import { RecordFlow, Friction, HowItWorks, FeatureGrid } from "./tiles";
import { BrowserRow } from "./logos";
import "./landing.css";

const SIGN_IN = "get-started";

const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const scrollTo = (id) =>
  document.getElementById(id)?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "center" });

export default function LandingPage({ onSignedIn, checking }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signIn({ credential }) {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/auth/google", { credential });
      onSignedIn(data.user);
    } catch (err) {
      setError(errorMessage(err, "Sign-in failed. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  const working = busy || checking;

  return (
    <main className="lp">
      <Nav />
      <Hero onCredential={signIn} onError={() => setError("Google sign-in was cancelled or blocked.")} busy={working} error={error} />
      <Compare />
      <Install />
      <How />
      <Features />
      <Editor />
      <Privacy />
      <Pricing busy={working} />
      <Faq />
      <Close busy={working} />
      <Foot />
    </main>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Pieces
   ──────────────────────────────────────────────────────────────────────────── */

/** A section heading that rises in once, the first time it is seen. */
function Head({ eyebrow, title, sub, dark = false }) {
  const ref = useRef(null);
  const seen = useInView(ref, { once: true });
  return (
    <div ref={ref} className={`lp-head${dark ? " lp-head--dark" : ""}`} data-seen={seen ? "true" : "false"}>
      <p className="lp-eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {sub && <p className="lp-sub">{sub}</p>}
    </div>
  );
}

/* The hero chip's two icons, as plain line drawings: the browser-extension
   puzzle piece (a square with a knob on top and one on the right, the shape
   browsers use for extensions) and a download arrow (Lucide, ISC licence). */
function ExtensionIcon() {
  return (
    <svg className="lp-pill__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.5 9.5a1.5 1.5 0 0 1 1.5-1.5H8a2.5 2.5 0 1 1 3.5 0h3a1.5 1.5 0 0 1 1.5 1.5v3a2.5 2.5 0 1 1 0 3.5v3a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19Z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="lp-pill__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

function StartButton({ busy, children = "Start recording, free", kind = "solid" }) {
  return (
    <button type="button" className={`lp-btn lp-btn--${kind}`} disabled={busy} onClick={() => scrollTo(SIGN_IN)}>
      {children}
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Chrome
   ──────────────────────────────────────────────────────────────────────────── */

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header className="lp-nav" data-scrolled={scrolled ? "true" : "false"}>
      <div className="lp-nav__in">
        <a className="lp-mark" href="#top" aria-label="Clipo, back to top">
          <Logo size={24} fontSize={17} color="currentColor" />
        </a>
        <nav aria-label="Main">
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="lp-nav__end">
          <button type="button" className="lp-textbtn" onClick={() => scrollTo(SIGN_IN)}>
            Sign in
          </button>
          <button type="button" className="lp-btn lp-btn--solid lp-btn--sm" onClick={() => scrollTo(SIGN_IN)}>
            Start free
          </button>
        </div>
      </div>
    </header>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Hero
   ──────────────────────────────────────────────────────────────────────────── */

function Hero({ onCredential, onError, busy, error }) {
  return (
    <section className="lp-hero" id="top">
      <div className="lp-in lp-hero__copy">
        <a className="lp-pill" href="#install" aria-label="No installation, no download">
          <span className="lp-pill__item">
            No installation
            <ExtensionIcon />
          </span>
          <span className="lp-pill__sep" aria-hidden="true" />
          <span className="lp-pill__item">
            No download
            <DownloadIcon />
          </span>
        </a>
        <h1>
          Product demos that zoom
          <br />
          to <span className="lp-hl">every click.<i className="lp-hl__tap" aria-hidden="true"><CursorGlyph /></i></span>
        </h1>
        <p className="lp-lede">
          Record in any browser. Clipo turns it into a polished demo that zooms in on every click, smoothly and
          automatically. Nothing to install.
        </p>

        <div className="lp-start" id={SIGN_IN}>
          <div className="lp-google" data-busy={busy}>
            <GoogleLogin onSuccess={onCredential} onError={onError} text="continue_with" shape="pill" size="large" width="248" />
          </div>
        </div>
        <p className="lp-start__note">100 free credits · No card · Works on all browsers.</p>
        {error && (
          <p className="lp-error" role="alert">
            {error}
          </p>
        )}
        <BrowserRow />
      </div>

      <div className="lp-in lp-hero__film">
        <HeroFilm />
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Before and after
   ──────────────────────────────────────────────────────────────────────────── */

function Compare() {
  return (
    <section className="lp-sec" id="compare">
      <div className="lp-in">
        <Head
          eyebrow="Before and after"
          title="Same recording. Only one of them gets watched."
          sub="Drag the handle. On the left is a plain screen recording; on the right is the same recording after Clipo, with no editing from you."
        />
        <CompareFilm />
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Nothing to install
   ──────────────────────────────────────────────────────────────────────────── */

function Install() {
  return (
    <section className="lp-sec lp-install" id="install">
      <div className="lp-in lp-install__grid">
        <div className="lp-install__copy">
          <Head
            eyebrow="Nothing to install"
            title="Open a tab. Press record."
            sub="No app to download, no extension to approve, no permission buried in system settings. Open Clipo in a tab and start recording."
          />
          <BrowserRow label="Works in" />
          <ul className="lp-os" aria-label="Operating systems">
            <li>macOS</li>
            <li>Windows</li>
            <li>Linux</li>
            <li>ChromeOS</li>
          </ul>
        </div>
        <RecordFlow />
      </div>
      <div className="lp-in">
        <Friction />
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   How it works
   ──────────────────────────────────────────────────────────────────────────── */

function How() {
  return (
    <section className="lp-sec lp-dark" id="how">
      <div className="lp-in">
        <Head
          dark
          eyebrow="How it works"
          title="You record. Clipo directs."
          sub="Show your product the way you normally would. Clipo edits it the way a video editor would: zooming in when you click, and easing out when you're done."
        />
        <HowItWorks />
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Features
   ──────────────────────────────────────────────────────────────────────────── */

function Features() {
  return (
    <section className="lp-sec" id="features">
      <div className="lp-in">
        <Head eyebrow="Features" title="Everything a good demo needs, done before you open the editor." />
        <FeatureGrid />
      </div>
    </section>
  );
}

function Editor() {
  return (
    <section className="lp-sec lp-editor" id="editor">
      <div className="lp-in">
        <Head
          eyebrow="The editor"
          title="Every decision it made is a thing you can move."
          sub="Zooms, clicks, the cursor and captions sit on one timeline. Drag, retime or delete any of it, or add a zoom where Clipo was too careful."
        />
        <EditorFilm />
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Privacy
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * True, and no more specific than a visitor needs: the recording is uploaded
 * and edited on our servers. Who helps process it is named in the privacy
 * policy, which is where that belongs, and this points there.
 */
const PRIVACY = [
  ["Recorded in your browser", "From the tab, window or screen you choose, and only while you are recording. Nothing is installed."],
  ["Edited securely", "Your recording is uploaded securely and edited on our servers. The privacy policy has the details."],
  ["Deleted when you say", "Recordings and their exports are yours to delete, and deleting removes the source file too."],
];

function Privacy() {
  return (
    <section className="lp-sec lp-privacy" id="privacy">
      <div className="lp-in">
        <Head eyebrow="Privacy" title="Where your recording goes." />
        <div className="lp-privacy__grid">
          {PRIVACY.map(([t, b], i) => (
            <div key={t} className="lp-privacy__item">
              <span className="lp-privacy__n">{String(i + 1).padStart(2, "0")}</span>
              <h3>{t}</h3>
              <p>{b}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Pricing
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * backend/services/creditPricing.js SIGNUP_FREE_CREDITS, and the smallest of
 * its PACKS. Change them there and here together.
 *
 * ── ONE CARD, ON PURPOSE ─────────────────────────────────────────────────────
 * The packs used to sit here as three priced cards beside the free one, and
 * three prices in a row read as monthly tiers at a glance: the one thing this
 * pricing is not. So the page offers what a visitor needs to start, the free
 * credits, and says in a sentence that more are a one-time top-up. The packs
 * and their prices are in the app, where they are bought, and in the FAQ.
 */
const FREE_CREDITS = 100;
const SMALLEST_PACK_INR = 199;

function Pricing({ busy }) {
  return (
    <section className="lp-sec lp-pricing" id="pricing">
      <div className="lp-in">
        <Head
          eyebrow="Pricing"
          title="Start free. Pay only for what you record."
          sub="No subscription and nothing recurring. Analysing and exporting are charged by the minute, and the exact cost is on the button before you press it."
        />
        <div className="lp-free">
          <div className="lp-free__lead">
            <span className="lp-free__name">Free to start</span>
            <span className="lp-free__num">
              {FREE_CREDITS}
              <em>credits</em>
            </span>
            <span className="lp-free__per">on the house, for every new account</span>
          </div>
          <div className="lp-free__body">
            <ul>
              <li>Every feature included</li>
              <li>Record, edit and export</li>
              <li>No card needed</li>
            </ul>
            <StartButton busy={busy}>Start free</StartButton>
          </div>
        </div>
        <p className="lp-pricing__note">
          Need more later? Top up with a one-time credit pack inside the app. No subscription, and credits never expire.
        </p>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Questions
   ──────────────────────────────────────────────────────────────────────────── */

const FAQ = [
  [
    "Do I need to install anything?",
    "No. Clipo runs in your browser. There is no app to download and no extension to add.",
  ],
  [
    "Which browsers does it work in?",
    "Current desktop versions of Chrome, Edge, Firefox, Safari, Brave and Opera. Chrome, Edge and the other Chromium browsers can share a single tab; Firefox and Safari share a window or your whole screen. Phones and tablets can't share their screen from a browser, so recording needs a computer.",
  ],
  [
    "How does Clipo know where to zoom?",
    "It follows what you do on screen and zooms in on the moments that matter, like the buttons you click. You don't have to mark anything while you record, and you can change any zoom afterwards.",
  ],
  [
    "What if I want a zoom somewhere else?",
    "Every zoom sits on the timeline, where you can drag it, retime it, delete it or add your own. Clipo also suggests a zoom wherever a moment deserves one.",
  ],
  [
    "Can I record a window or my whole screen?",
    "Yes. Share a browser tab, a single window, or the entire screen.",
  ],
  [
    "Is my recording private?",
    "Your recording is uploaded securely and edited on our servers, and you can delete it and its exports at any time. The privacy policy has the details.",
  ],
  [
    "What does it cost?",
    `New accounts get ${FREE_CREDITS} free credits. After that, one-time credit packs start at ₹${SMALLEST_PACK_INR} and never expire. Analysing and exporting are charged by the minute of video, and the price is shown before you press anything.`,
  ],
  [
    "What can I export?",
    "MP4, WebM or GIF, from 720p up to 4K, at 24, 30 or 60fps, in 16:9, 9:16, 1:1 or 4:5. There are presets for YouTube, Reels and Shorts, LinkedIn and X.",
  ],
];

function Faq() {
  return (
    <section className="lp-sec lp-faq" id="faq">
      <div className="lp-in lp-faq__in">
        <Head eyebrow="FAQ" title="Questions, answered." />
        <div className="lp-faq__list">
          {FAQ.map(([q, a]) => (
            <details key={q} className="lp-q">
              <summary>
                {q}
                <i aria-hidden="true" />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Close
   ──────────────────────────────────────────────────────────────────────────── */

function Close({ busy }) {
  return (
    <section className="lp-close">
      <div className="lp-in">
        <div className="lp-close__card wall wall--hero">
          <h2>Record it once. Clipo does the rest.</h2>
          <p>Free to start, nothing to install, and your first demo in the next five minutes.</p>
          <StartButton busy={busy} kind="light" />
        </div>
      </div>
    </section>
  );
}

function Foot() {
  return (
    <footer className="lp-foot">
      <div className="lp-in lp-foot__in">
        <div className="lp-foot__brand">
          <Logo size={22} fontSize={16} color="currentColor" />
          <p>Product demos that zoom to every click. Recorded in your browser.</p>
        </div>
        <nav aria-label="Product" className="lp-foot__col">
          <b>Product</b>
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
        <nav aria-label="Company" className="lp-foot__col">
          <b>Company</b>
          <a href="/contact">Contact</a>
          <a href="/privacy">Privacy policy</a>
          <a href="/terms">Terms</a>
          <a href="/refunds">Refunds</a>
          <a href="/shipping">Delivery</a>
        </nav>
      </div>
      <div className="lp-in lp-foot__base">
        <small>&copy; {new Date().getFullYear()} Betafounder Enterprises</small>
        <small>tryclipo.com</small>
      </div>
    </footer>
  );
}

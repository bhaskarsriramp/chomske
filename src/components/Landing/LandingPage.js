/**
 * LandingPage.js: the page somebody sees before they have anything to record.
 *
 * ── WHY THIS WAS REBUILT ─────────────────────────────────────────────────────
 * The page it replaces was dark, with an acid-green and lavender palette, five
 * headlines built on the same italic turn ("impossible to miss", "it is a point
 * of view", "forget it is there"), numbered eyebrows on every section, and a
 * mocked-up dashboard for a company that does not exist. The product it leads
 * into is light paper and ink with a black primary and one red signal. Signing
 * in looked like arriving at a different company.
 *
 * theme.js had already written down why that palette was wrong, for the app:
 *
 *   "pale blue-purple is the tell that makes a page look machine-made before a
 *    word of it is read"
 *
 * The landing page simply never adopted the system. So this uses the product's
 * own tokens — --ink, --paper, --line, --primary from index.css — and nothing
 * invented for marketing.
 *
 * ── AND WHY THE HERO IS A DEMONSTRATION ──────────────────────────────────────
 * Emil Kowalski's framework asks what an animation is FOR before it is written,
 * and names explanation as the one purpose that earns a long animation on a
 * marketing page. This product has exactly one thing worth explaining and it is
 * invisible in a screenshot: a browser hands over pixels and no clicks at all,
 * so every press is worked out from the picture, and the camera is moved to it.
 *
 * So the hero does not describe that. It runs it — with the real curve and the
 * real timings the renderer uses, pulled from camera.mjs and events.js, so the
 * thing on the page is the thing the product does:
 *
 *   RAMP_IN 0.45s   SETTLE 0.30s   keep 0.50s   RAMP_OUT 0.50s
 *
 * It is CSS, not JS, because a predetermined animation belongs off the main
 * thread — and it stops entirely under prefers-reduced-motion, where the frame
 * is simply shown zoomed with no travel.
 */
import { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import api, { errorMessage } from "../../api";
import Logo from "../Shell/Logo";
import "./landing.css";

const SIGN_IN = "get-started";

const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const scrollTo = (id) =>
  document.getElementById(id)?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });

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
      <Trick />
      <Pipeline />
      <Editor />
      <Formats />
      <Privacy />
      <Close busy={working} />
      <Foot />
    </main>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Chrome
   ──────────────────────────────────────────────────────────────────────────── */

function Nav() {
  return (
    <header className="lp-nav">
      <div className="lp-nav__in">
        <a className="lp-mark" href="#top" aria-label="Clipo Demo Studio, back to top">
          <Logo size={22} color="currentColor" />
          <span>Demo Studio</span>
        </a>
        <nav aria-label="Main">
          <a href="#how">How it works</a>
          <a href="#editor">The editor</a>
          <a href="#privacy">Privacy</a>
        </nav>
        <button type="button" className="lp-btn lp-btn--quiet" onClick={() => scrollTo(SIGN_IN)}>
          Start recording
        </button>
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
      <div className="lp-in">
        <div className="lp-hero__copy">
          <h1>
            Your screen recording doesn&rsquo;t know you clicked.
            <span> Clipo works it out.</span>
          </h1>
          <p className="lp-lede">
            A browser hands over pixels and nothing else &mdash; no clicks, no cursor position, no idea what you
            pressed. Clipo finds the pointer in every frame, works out what it landed on, and moves the camera
            there. You record once and get a demo people can follow.
          </p>

          <div className="lp-start" id={SIGN_IN}>
            <div className="lp-google" data-busy={busy}>
              <GoogleLogin onSuccess={onCredential} onError={onError} text="continue_with" shape="pill" size="large" width="248" />
            </div>
            <p className="lp-start__note">Free to try. Nothing to install.</p>
            {error && <p className="lp-error" role="alert">{error}</p>}
          </div>
        </div>

        <ZoomDemo />
      </div>
    </section>
  );
}

/**
 * The product, running.
 *
 * A pointer crosses a panel, presses a control, and the frame moves onto it and
 * back. Every number here is the one the renderer uses; see the file header.
 * The markup is deliberately plain — the whole thing is driven by four CSS
 * animations sharing one 6.2s timeline, so it costs no JavaScript at all.
 */
function ZoomDemo() {
  return (
    <figure className="lp-demo" aria-labelledby="lp-demo-cap">
      <div className="lp-demo__frame">
        <div className="lp-demo__stage">
          <div className="lp-demo__ui" aria-hidden="true">
            <div className="lp-demo__side">
              <b />
              <i />
              <i />
              <i />
            </div>
            <div className="lp-demo__main">
              <div className="lp-demo__rowhead">
                <i />
                <i />
              </div>
              <div className="lp-demo__grid">
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              <div className="lp-demo__target">
                <span className="lp-demo__ripple" />
                Publish
              </div>
            </div>
          </div>
          <span className="lp-demo__cursor" aria-hidden="true">
            <CursorGlyph />
          </span>
        </div>
      </div>
      <figcaption id="lp-demo-cap">
        <span className="lp-tick" /> The camera is not keyframed. It is following a press Clipo recovered from the
        picture.
      </figcaption>
    </figure>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   The one idea worth a section
   ──────────────────────────────────────────────────────────────────────────── */

function Trick() {
  return (
    <section className="lp-trick">
      <div className="lp-in">
        <p className="lp-eyebrow">The hard part</p>
        <h2>
          There is no click sensor anywhere in this product. Every press is <em>inferred</em> from what the
          screen did.
        </h2>
        <div className="lp-trick__cols">
          <p>
            Screen capture in a browser gives you frames. It will not tell you where the cursor is, when a button
            went down, or which element took the press &mdash; and once the video is encoded, the one-pixel
            outline that identifies a cursor has been smeared by the compressor.
          </p>
          <p>
            So Clipo reads it back out. It matches the pointer&rsquo;s shape in every frame, watches for the
            interface acknowledging a press, measures what changed and where, and weighs those together. A hand
            resting on a link is not a click. A page scrolling under a still cursor is not a click. A button
            lighting up under a pointer that stopped is.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   What actually happens
   ──────────────────────────────────────────────────────────────────────────── */

const STEPS = [
  {
    n: "01",
    title: "Record",
    body: "Pick a tab, a window or the whole screen. Recording happens in the browser — there is nothing to install and no extension to approve.",
  },
  {
    n: "02",
    title: "Find the pointer",
    body: "Every frame is searched for the cursor by its shape, at the size and design your machine actually draws. A cursor inside a video playing on the page is recognised as somebody else’s and left alone.",
  },
  {
    n: "03",
    title: "Decide what was pressed",
    body: "The glyph, the acknowledgement, the approach, what changed and how much — each is weighed. A press has to be seen by something, not just add up.",
  },
  {
    n: "04",
    title: "Move the camera",
    body: "The shot is built around the control rather than the coordinate, so the whole thing stays in frame. It arrives before the press and leaves once the result is up.",
  },
];

function Pipeline() {
  return (
    <section className="lp-how" id="how">
      <div className="lp-in">
        <div className="lp-head">
          <p className="lp-eyebrow">How it works</p>
          <h2>Four decisions, made from the recording itself.</h2>
        </div>
        <ol className="lp-steps">
          {STEPS.map((s) => (
            <li key={s.n}>
              <span className="lp-steps__n">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   The editor
   ──────────────────────────────────────────────────────────────────────────── */

function Editor() {
  return (
    <section className="lp-editor" id="editor">
      <div className="lp-in lp-editor__grid">
        <div>
          <p className="lp-eyebrow">The editor</p>
          <h2>Every decision it made is a thing you can move.</h2>
          <p className="lp-body">
            The first cut is a starting point, not an export. Each camera move is an object on a timeline with a
            position, a level and a curve &mdash; drag it, retime it, delete it, or add one where Clipo was too
            careful.
          </p>
          <ul className="lp-list">
            <li>Camera moves, with the level and easing on each</li>
            <li>The cursor path, redrawn and smoothed</li>
            <li>Steps the model read out of the recording</li>
            <li>Captions, burned into the final file</li>
          </ul>
        </div>
        <TimelineArt />
      </div>
    </section>
  );
}

/** The editor's timeline, at rest. Not animated: it is a picture of a tool. */
function TimelineArt() {
  return (
    <div className="lp-track" aria-label="The editor timeline: camera moves laid over a recording">
      <div className="lp-track__ruler">
        <span>0:00</span>
        <span>0:05</span>
        <span>0:10</span>
        <span>0:15</span>
      </div>
      <div className="lp-track__lane">
        <span className="lp-track__label">Zoom</span>
        <div>
          <b style={{ left: "6%", width: "13%" }}>1.8&times;</b>
          <b style={{ left: "27%", width: "10%" }}>1.4&times;</b>
          <b style={{ left: "46%", width: "16%" }}>1.8&times;</b>
          <b style={{ left: "72%", width: "11%" }}>1.6&times;</b>
        </div>
      </div>
      <div className="lp-track__lane">
        <span className="lp-track__label">Cursor</span>
        <div>
          <em style={{ left: "4%", width: "84%" }} />
        </div>
      </div>
      <div className="lp-track__lane">
        <span className="lp-track__label">Captions</span>
        <div>
          <i style={{ left: "8%", width: "22%" }} />
          <i style={{ left: "38%", width: "27%" }} />
          <i style={{ left: "70%", width: "18%" }} />
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Output
   ──────────────────────────────────────────────────────────────────────────── */

const SHAPES = [
  ["16:9", "Product tour", "wide"],
  ["9:16", "Launch clip", "tall"],
  ["1:1", "Feature update", "square"],
  ["GIF", "Quick reply", "gif"],
];

function Formats() {
  return (
    <section className="lp-out">
      <div className="lp-in">
        <div className="lp-head">
          <p className="lp-eyebrow">What you get</p>
          <h2>One timeline. Whatever shape it has to land in.</h2>
        </div>
        <div className="lp-shapes">
          {SHAPES.map(([ratio, name, kind]) => (
            <article key={ratio} className={`lp-shape lp-shape--${kind}`}>
              <div className="lp-shape__box">
                <span>{ratio}</span>
              </div>
              <h3>{name}</h3>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Privacy
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * ── THIS SECTION IS WRITTEN FROM THE CODE, NOT FROM THE OLD PAGE ─────────────
 * What it replaced claimed "native desktop capture", a timeline that "begins on
 * your desktop", and sensitive values blurred "before a recording leaves your
 * machine". None of those are true: capture is getDisplayMedia in a tab, the
 * recording is uploaded in chunks, and the analysis, the blur pass and the
 * render all run on the server. The blur pass is currently switched off.
 *
 * Saying less is the only honest option until that changes, so this says what
 * the code does and nothing more.
 */
function Privacy() {
  return (
    <section className="lp-privacy" id="privacy">
      <div className="lp-in lp-privacy__grid">
        <div>
          <p className="lp-eyebrow">Privacy</p>
          <h2>Where your recording goes.</h2>
        </div>
        <dl>
          <div>
            <dt>Recording</dt>
            <dd>Captured in your browser from the tab, window or screen you pick. Nothing is installed.</dd>
          </div>
          <div>
            <dt>Analysis</dt>
            <dd>
              The recording is uploaded and analysed on our servers. Sampled frames are read by Google Gemini to
              work out the steps; the rest is measured from the pixels.
            </dd>
          </div>
          <div>
            <dt>Your control</dt>
            <dd>Recordings and their renders are yours to delete, and deleting removes the source file too.</dd>
          </div>
        </dl>
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
        <h2>Record it once.</h2>
        <p>Then see what Clipo makes of it.</p>
        <button className="lp-btn lp-btn--solid" type="button" disabled={busy} onClick={() => scrollTo(SIGN_IN)}>
          Continue with Google
        </button>
      </div>
    </section>
  );
}

function Foot() {
  return (
    <footer className="lp-foot">
      <div className="lp-in">
        <a className="lp-mark" href="#top">
          <Logo size={20} color="currentColor" />
          <span>Demo Studio</span>
        </a>
        <nav aria-label="Footer">
          <a href="#how">How it works</a>
          <a href="#editor">The editor</a>
          <a href="#privacy">Privacy</a>
          <a href="/privacy">Privacy policy</a>
          <a href="/terms">Terms</a>
        </nav>
        <small>&copy; {new Date().getFullYear()} Betafounder Enterprises</small>
      </div>
    </footer>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Marks
   ──────────────────────────────────────────────────────────────────────────── */

/** The same arrow the product draws, so the page and the app agree. */
function CursorGlyph() {
  return (
    <svg viewBox="0 0 22 26" fill="none" aria-hidden="true">
      <path d="M2 2v17l5-4 4 8 3-1.4-4-8 7-1.3L2 2Z" fill="#fff" stroke="#0F0F0F" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

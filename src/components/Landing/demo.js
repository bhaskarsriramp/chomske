/**
 * demo.js: the recording the landing page plays, and the three frames it
 * plays in — the hero, the before/after slider, and the editor.
 *
 * The screen is a made-up product ("Lumen") on purpose: a demo of a real
 * company's site would be borrowing their brand, and a demo of Clipo itself
 * would be a recording of a recorder. Every size inside it is in cqw, a
 * fraction of the screen's own width, so it is the same picture at 320px and
 * at 1400px and the camera maths in film.js never has to know which.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { SCRIPT, NARRATED, RAMP_OUT, clock, mountScene, shotSpan, useFilm } from "./film";
import "./demoScreen.css";

/** The same arrow the product draws, so the page and the app agree. */
export function CursorGlyph() {
  return (
    <svg viewBox="0 0 22 26" fill="none" aria-hidden="true">
      <path d="M2 2v17l5-4 4 8 3-1.4-4-8 7-1.3L2 2Z" fill="#fff" stroke="#0F0F0F" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

const Check = () => (
  <svg viewBox="0 0 12 12" aria-hidden="true">
    <path d="M2.5 6.2 5 8.6l4.6-5.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* ────────────────────────────────────────────────────────────────────────────
   The screen being recorded
   ──────────────────────────────────────────────────────────────────────────── */

const BARS = [38, 52, 44, 61, 57, 72, 66, 81, 76, 92];

/**
 * `page` is where a screen that no film drives sits (the chat film shows the
 * pricing page and moves its camera in CSS). `account` signs a made-up user
 * in: their email in the nav and on the bill, for the chat film to blur.
 */
export function DemoScreen({ variant = "clipo", captions = false, page = "home", account = "" }) {
  return (
    <div className="dm" data-variant={variant}>
      <div className="dm-view" data-view>
        <div className="dm-cam" data-cam>
          <div className="dm-app" data-screen data-page={page} data-plan="monthly" data-bought="no">
            <header className="dm-nav">
              <span className="dm-logo">
                <i />
                Lumen
              </span>
              <nav>
                <span>Product</span>
                <span>Customers</span>
                <span>Docs</span>
                <span className="dm-nav__pricing" data-target="nav-pricing" data-hoverable>
                  Pricing
                </span>
              </nav>
              {account ? (
                <span className="dm-nav__end">
                  <span className="dm-acct">
                    <i />
                    <span className="dm-mail">{account}</span>
                  </span>
                </span>
              ) : (
                <span className="dm-nav__end">
                  <span>Sign in</span>
                  <b>Start free</b>
                </span>
              )}
            </header>

            <section className="dm-page dm-home">
              <div className="dm-home__copy">
                <span className="dm-pill">New · Funnel reports</span>
                <h4>Analytics your whole team can read.</h4>
                <p>Dashboards that explain themselves. No SQL, and no waiting on the data team.</p>
                <div className="dm-home__cta">
                  <b>Start free</b>
                  <span>Book a demo</span>
                </div>
              </div>
              <div className="dm-dash">
                <div className="dm-dash__head">
                  <span>Weekly active users</span>
                  <em>Last 10 weeks</em>
                </div>
                <div className="dm-dash__num">
                  48,210 <small>+12.4%</small>
                </div>
                <div className="dm-bars">
                  {BARS.map((h, i) => (
                    <i key={i} style={{ height: `${h}%` }} />
                  ))}
                </div>
                <div className="dm-dash__stats">
                  <span>
                    <em>Retention</em>71%
                  </span>
                  <span>
                    <em>Activation</em>38%
                  </span>
                  <span>
                    <em>NPS</em>54
                  </span>
                </div>
              </div>
              <div className="dm-home__row">
                <span className="dm-feat">
                  <i />
                  <span>
                    <b>Funnels</b>
                    <em>See where people drop off, step by step.</em>
                  </span>
                </span>
                <span className="dm-feat">
                  <i />
                  <span>
                    <b>Retention</b>
                    <em>Cohorts that update while you watch.</em>
                  </span>
                </span>
                <span className="dm-feat">
                  <i />
                  <span>
                    <b>Alerts</b>
                    <em>A message when a metric moves.</em>
                  </span>
                </span>
              </div>
            </section>

            <section className="dm-page dm-pricing">
              <h4>Simple pricing that grows with you</h4>
              <p>Every plan includes unlimited dashboards and viewers.</p>
              <div className="dm-toggle">
                <i className="dm-toggle__thumb" />
                <span className="dm-toggle__m">Monthly</span>
                <span>Yearly</span>
                <span className="dm-toggle__l" data-target="plan-lifetime" data-hoverable>
                  Lifetime
                </span>
              </div>
              <div className="dm-plans">
                <div className="dm-plan">
                  <span className="dm-plan__name">Starter</span>
                  <span className="dm-price">
                    <b>$0</b>
                    <em>free forever</em>
                  </span>
                  <ul>
                    <li><Check />3 dashboards</li>
                    <li><Check />7-day history</li>
                    <li><Check />Community help</li>
                  </ul>
                  <span className="dm-btn dm-btn--quiet">Start free</span>
                </div>
                <div className="dm-plan dm-plan--hot">
                  <span className="dm-plan__badge">Most popular</span>
                  <span className="dm-plan__name">Pro</span>
                  <span className="dm-price dm-price--swap" data-target="pro-price">
                    <span className="dm-price__m">
                      <b>$29</b>
                      <em>per month</em>
                    </span>
                    <span className="dm-price__l">
                      <b>$249</b>
                      <em>once, forever</em>
                    </span>
                  </span>
                  <ul>
                    <li><Check />Unlimited dashboards</li>
                    <li><Check />Funnel reports</li>
                    <li><Check />Priority support</li>
                  </ul>
                  <span className="dm-btn dm-btn--buy" data-target="buy-pro" data-hoverable>
                    <span className="dm-btn__m">Get Pro</span>
                    <span className="dm-btn__l">Get lifetime</span>
                    <span className="dm-btn__ok">
                      <Check />
                      You&rsquo;re in
                    </span>
                  </span>
                </div>
                <div className="dm-plan">
                  <span className="dm-plan__name">Team</span>
                  <span className="dm-price dm-price--swap">
                    <span className="dm-price__m">
                      <b>$99</b>
                      <em>per month</em>
                    </span>
                    <span className="dm-price__l">
                      <b>$799</b>
                      <em>once, forever</em>
                    </span>
                  </span>
                  <ul>
                    <li><Check />Everything in Pro</li>
                    <li><Check />SSO and roles</li>
                    <li><Check />Audit log</li>
                  </ul>
                  <span className="dm-btn dm-btn--quiet">Talk to us</span>
                </div>
              </div>
              {account && (
                <p className="dm-billed">
                  Billed to <span className="dm-mail">{account}</span>
                </p>
              )}
            </section>
          </div>
        </div>

        {variant !== "raw" && SCRIPT.presses.map((_, i) => <span key={i} className="dm-ripple" data-ripple={i} />)}
        {captions && <span className="dm-caption" data-caption data-on="false" />}
        <span className="dm-cursor" data-cursor>
          <CursorGlyph />
        </span>
      </div>
    </div>
  );
}

/** Mount a scene on every .dm inside `ref`, in document order, playing `script`. */
function useScenes(ref, variants, script = SCRIPT) {
  const scenes = useRef([]);
  useLayoutEffect(() => {
    const roots = [...ref.current.querySelectorAll(".dm")];
    scenes.current = roots.map((el, i) => mountScene(el, variants[i] || "clipo", script));
    return () => scenes.current.forEach((s) => s.destroy());
    // variants is a literal at every call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);
  return scenes;
}

/* ────────────────────────────────────────────────────────────────────────────
   The player bar: what a video player would show under this one
   ──────────────────────────────────────────────────────────────────────────── */

const pct = (t) => `${(t / SCRIPT.duration) * 100}%`;

function PlayerBar({ barRef, playing, onToggle }) {
  return (
    <div className="pb" ref={barRef}>
      <button type="button" className="pb-play" onClick={onToggle} aria-label={playing ? "Pause the demonstration" : "Play the demonstration"}>
        {playing ? (
          <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="3" width="3" height="10" rx="1" /><rect x="9.5" y="3" width="3" height="10" rx="1" /></svg>
        ) : (
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.2v9.6c0 .5.5.8.9.5l7.4-4.8a.6.6 0 0 0 0-1L5.9 2.7c-.4-.3-.9 0-.9.5Z" /></svg>
        )}
      </button>
      <span className="pb-time" data-time>0:00</span>
      <div className="pb-track" aria-hidden="true">
        {SCRIPT.shots.map((s, i) => {
          const [a, b] = shotSpan(s);
          return (
            <span key={i} className="pb-zoom" data-zoom={i} style={{ left: pct(a), width: pct(b - a) }}>
              <em>{s.label}</em>
            </span>
          );
        })}
        <span className="pb-fill" data-fill />
        {SCRIPT.presses.map((p, i) => (
          <span key={i} className="pb-click" data-click={i} style={{ left: pct(p.t) }} />
        ))}
        <span className="pb-head" data-head />
      </div>
      <span className="pb-time pb-time--end">{clock(SCRIPT.duration)}</span>
      <span className="pb-auto">
        <i />
        {SCRIPT.presses.length} clicks · {SCRIPT.shots.length} auto-zooms
      </span>
    </div>
  );
}

function barPainter() {
  let last = "";
  let parts = null;
  return (bar, t) => {
    if (!bar) return;
    if (!parts) {
      parts = {
        time: bar.querySelector("[data-time]"),
        fill: bar.querySelector("[data-fill]"),
        head: bar.querySelector("[data-head]"),
        zooms: [...bar.querySelectorAll("[data-zoom]")],
        clicks: [...bar.querySelectorAll("[data-click]")],
      };
    }
    const k = t / SCRIPT.duration;
    parts.fill.style.transform = `scaleX(${k})`;
    parts.head.style.left = `${k * 100}%`;
    const txt = clock(t);
    if (txt !== last) parts.time.textContent = last = txt;
    SCRIPT.shots.forEach((s, i) => {
      const [a, b] = shotSpan(s);
      const on = t >= a && t < b ? "true" : "false";
      if (parts.zooms[i].dataset.on !== on) parts.zooms[i].dataset.on = on;
    });
    SCRIPT.presses.forEach((p, i) => {
      const on = t >= p.t ? "true" : "false";
      if (parts.clicks[i].dataset.on !== on) parts.clicks[i].dataset.on = on;
    });
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   The hero
   ──────────────────────────────────────────────────────────────────────────── */

export function HeroFilm() {
  const root = useRef(null);
  const bar = useRef(null);
  const paint = useRef(barPainter()).current;
  const scenes = useScenes(root, ["clipo"]);
  const { playing, toggle } = useFilm(
    root,
    SCRIPT.duration,
    (t) => {
      scenes.current[0]?.apply(t);
      paint(bar.current, t);
    },
    { poster: SCRIPT.poster }
  );

  return (
    <figure className="hf" ref={root} aria-label="A screen recording of a pricing page that zooms in on each click.">
      <div className="hf-stage wall wall--hero">
        <DemoScreen variant="clipo" />
      </div>
      <PlayerBar barRef={bar} playing={playing} onToggle={toggle} />
    </figure>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Before and after
   ──────────────────────────────────────────────────────────────────────────── */

export function CompareFilm() {
  const root = useRef(null);
  const [split, setSplit] = useState(50);
  const scenes = useScenes(root, ["raw", "clipo"]);
  useFilm(
    root,
    SCRIPT.duration,
    (t) => {
      scenes.current[0]?.apply(t);
      scenes.current[1]?.apply(t);
    },
    { poster: SCRIPT.poster }
  );

  return (
    <figure className="cmp" ref={root} style={{ "--split": `${split}%` }}>
      <div className="cmp-layer cmp-layer--raw">
        <div className="cmp-raw">
          <DemoScreen variant="raw" />
        </div>
      </div>
      <div className="cmp-layer cmp-layer--clipo">
        <div className="cmp-clipo wall wall--plum">
          <DemoScreen variant="clipo" />
        </div>
      </div>
      <span className="cmp-tag cmp-tag--raw">What the browser records</span>
      <span className="cmp-tag cmp-tag--clipo">What Clipo gives back</span>
      <span className="cmp-handle" aria-hidden="true">
        <i>
          <svg viewBox="0 0 20 20"><path d="M7 5 2.5 10 7 15M13 5l4.5 5-4.5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </i>
      </span>
      <input
        className="cmp-range"
        type="range"
        min="0"
        max="100"
        value={split}
        onChange={(e) => setSplit(Number(e.target.value))}
        aria-label="Drag to compare the raw recording with Clipo's edit"
      />
    </figure>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   The editor
   ──────────────────────────────────────────────────────────────────────────── */

const RULER = [0, 2, 4, 6, 8];

export function EditorFilm() {
  const root = useRef(null);
  const parts = useRef(null);
  const [active, setActive] = useState(1);
  const activeRef = useRef(1);
  const scenes = useScenes(root, ["clipo"]);

  useFilm(
    root,
    SCRIPT.duration,
    (t) => {
      scenes.current[0]?.apply(t);
      const el = root.current;
      if (!el) return;
      if (!parts.current) {
        parts.current = {
          head: el.querySelector("[data-playhead]"),
          time: el.querySelector("[data-edtime]"),
          blocks: [...el.querySelectorAll("[data-block]")],
          caps: [...el.querySelectorAll("[data-cap]")],
        };
      }
      const P = parts.current;
      P.head.style.left = pct(t);
      P.time.textContent = clock(t);
      let now = -1;
      SCRIPT.shots.forEach((s, i) => {
        const [a, b] = shotSpan(s);
        const on = t >= a && t < b;
        if (on) now = i;
        const v = on ? "true" : "false";
        if (P.blocks[i].dataset.on !== v) P.blocks[i].dataset.on = v;
      });
      SCRIPT.captions.forEach((c, i) => {
        const v = t >= c.t0 && t < c.t1 ? "true" : "false";
        if (P.caps[i].dataset.on !== v) P.caps[i].dataset.on = v;
      });
      if (now >= 0 && now !== activeRef.current) {
        activeRef.current = now;
        setActive(now);
      }
    },
    { poster: SCRIPT.poster }
  );

  const shot = SCRIPT.shots[active];
  return (
    <div className="ed" ref={root} aria-label="The Clipo editor: the zooms it made sit on a timeline, and each one can be moved, retimed or removed.">
      <div className="ed-top">
        <span className="ed-file">
          <i />
          Pricing walkthrough
        </span>
        <span className="ed-top__mid">
          <span className="ed-chip">16:9</span>
          <span className="ed-chip">1080p</span>
        </span>
        <span className="ed-export">Export</span>
      </div>
      <div className="ed-main">
        <div className="ed-preview wall wall--dusk">
          <DemoScreen variant="clipo" captions />
        </div>
        <aside className="ed-side">
          <span className="ed-side__title">Selected zoom</span>
          <div className="ed-field">
            <span>Zoom level</span>
            <b>{shot.label}</b>
          </div>
          <div className="ed-slider">
            <i style={{ width: `${((shot.s - 1) / 2) * 100}%` }} />
          </div>
          <div className="ed-field">
            <span>Follow the cursor</span>
            <span className="ed-switch" data-on={shot.follow ? "true" : "false"}>
              <i />
            </span>
          </div>
          <div className="ed-field ed-field--label">
            <span>Label</span>
            <em>{shot.name}</em>
          </div>
        </aside>
      </div>
      <div className="ed-tl">
        <div className="ed-ruler">
          {RULER.map((s) => (
            <span key={s} style={{ left: pct(s) }}>
              {clock(s)}
            </span>
          ))}
          <em data-edtime>0:00</em>
        </div>
        <div className="ed-lane">
          <span className="ed-lane__name">Zoom</span>
          <div className="ed-lane__body">
            {SCRIPT.shots.map((s, i) => {
              const [a, b] = shotSpan(s);
              return (
                <span
                  key={i}
                  className={`ed-block${i === active ? " is-sel" : ""}`}
                  data-block={i}
                  style={{ left: pct(a), width: pct(b - a) }}
                >
                  <i className="ed-block__ramp" style={{ width: `${(0.45 / (b - a)) * 100}%` }} />
                  {s.label}
                  <i className="ed-block__ramp ed-block__ramp--out" style={{ width: `${(RAMP_OUT / (b - a)) * 100}%` }} />
                </span>
              );
            })}
          </div>
        </div>
        <div className="ed-lane">
          <span className="ed-lane__name">Clicks</span>
          <div className="ed-lane__body">
            {SCRIPT.presses.map((p, i) => (
              <span key={i} className="ed-click" style={{ left: pct(p.t) }}>
                <em>{p.label}</em>
              </span>
            ))}
          </div>
        </div>
        <div className="ed-lane">
          <span className="ed-lane__name">Cursor</span>
          <div className="ed-lane__body">
            <span className="ed-cursorbar">smoothed · ripple on click</span>
          </div>
        </div>
        <div className="ed-lane">
          <span className="ed-lane__name">Captions</span>
          <div className="ed-lane__body">
            {SCRIPT.captions.map((c, i) => (
              <span key={i} className="ed-cap" data-cap={i} style={{ left: pct(c.t0), width: pct(c.t1 - c.t0) }}>
                {c.text}
              </span>
            ))}
          </div>
        </div>
        <span className="ed-heads" aria-hidden="true">
          <span className="ed-playhead" data-playhead />
        </span>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   The product demo
   ──────────────────────────────────────────────────────────────────────────── */

const pctN = (t) => `${(t / NARRATED.duration) * 100}%`;
const RULER_N = [0, 2, 4, 6, 8, 10];
/** The voice pill's bars, tallest in the middle of a word. */
const VOICE_BARS = [38, 64, 46, 82, 58, 92, 70, 50, 86, 62, 44, 74];

/**
 * The same recording, made into a narrated demo: a one-line brief at the top,
 * the script it became on the right (each line lights as it is read), the
 * voice speaking over the picture, a close-up nobody clicked for, and the
 * lanes it all lands on. Everything moves on the film's own clock, so the line
 * that is lit, the caption on the picture and the voice are always one moment.
 */
export function ProductDemoFilm() {
  const root = useRef(null);
  const parts = useRef(null);
  const scenes = useScenes(root, ["clipo"], NARRATED);
  const close = NARRATED.shots.find((sh) => sh.closeup);

  useFilm(
    root,
    NARRATED.duration,
    (t) => {
      scenes.current[0]?.apply(t);
      const el = root.current;
      if (!el) return;
      if (!parts.current) {
        parts.current = {
          head: el.querySelector("[data-pdhead]"),
          time: el.querySelector("[data-pdtime]"),
          lines: [...el.querySelectorAll("[data-line]")],
          bars: [...el.querySelectorAll("[data-linebar]")],
          caps: [...el.querySelectorAll("[data-pdcap]")],
          speak: el.querySelector("[data-speak]"),
          closeTag: el.querySelector("[data-closetag]"),
          blocks: [...el.querySelectorAll("[data-pdblock]")],
        };
      }
      const P = parts.current;
      P.head.style.left = pctN(t);
      const txt = clock(t);
      if (P.time.textContent !== txt) P.time.textContent = txt;

      let speaking = false;
      NARRATED.captions.forEach((c, i) => {
        const state = t >= c.t1 ? "past" : t >= c.t0 ? "now" : "next";
        if (state === "now") speaking = true;
        if (P.lines[i].dataset.state !== state) P.lines[i].dataset.state = state;
        if (P.caps[i].dataset.live !== (state === "now" ? "true" : "false")) P.caps[i].dataset.live = state === "now" ? "true" : "false";
        const k = state === "now" ? (t - c.t0) / (c.t1 - c.t0) : state === "past" ? 1 : 0;
        P.bars[i].style.transform = `scaleX(${k})`;
      });
      const sp = speaking ? "true" : "false";
      if (P.speak.dataset.speak !== sp) P.speak.dataset.speak = sp;

      NARRATED.shots.forEach((sh, i) => {
        const [a, b] = shotSpan(sh);
        const v = t >= a && t < b ? "true" : "false";
        if (P.blocks[i] && P.blocks[i].dataset.live !== v) P.blocks[i].dataset.live = v;
      });
      const [ca, cb] = shotSpan(close);
      const cv = t >= ca && t < cb ? "true" : "false";
      if (P.closeTag.dataset.live !== cv) P.closeTag.dataset.live = cv;
    },
    { poster: NARRATED.poster }
  );

  return (
    <figure
      className="pd"
      ref={root}
      aria-label="A screen recording turned into a narrated product demo: a script read aloud as captions and a voice-over, with zooms on each click and a close-up on the price."
    >
      <div className="pd-top">
        <div className="pd-brief">
          <span className="pd-label">Your brief</span>
          <span className="pd-brief__text">Show a new customer how to buy Pro for life.</span>
        </div>
        <span className="pd-made">
          <Check />
          Script · Captions · Voice-over
        </span>
      </div>

      <div className="pd-main">
        <div className="pd-stage wall wall--aurora">
          <DemoScreen variant="clipo" captions />
          <span className="pd-voice" data-speak="false">
            <i className="pd-voice__avatar">K</i>
            Kore
            <span className="pd-voice__wave">
              {VOICE_BARS.map((h, i) => (
                <i key={i} style={{ "--h": `${h}%`, "--i": i }} />
              ))}
            </span>
          </span>
          <span className="pd-closetag" data-closetag data-live="false">
            Close-up, where you didn&rsquo;t click
          </span>
        </div>

        <aside className="pd-script">
          <span className="pd-label">Script</span>
          <ol>
            {NARRATED.captions.map((c, i) => (
              <li key={i} data-line={i} data-state="next">
                <span className="pd-n">{i + 1}</span>
                <span className="pd-line">
                  {c.text}
                  <i className="pd-line__bar" data-linebar />
                </span>
              </li>
            ))}
          </ol>
          <span className="pd-label">Voice</span>
          <span className="pd-voices">
            <em className="is-on">Kore</em>
            <em>Zephyr</em>
            <em>Charon</em>
            <em>Puck</em>
          </span>
        </aside>
      </div>

      <div className="ed-tl pd-tl">
        <div className="ed-ruler">
          {RULER_N.map((sec) => (
            <span key={sec} style={{ left: pctN(sec) }}>
              {clock(sec)}
            </span>
          ))}
          <em data-pdtime>0:00</em>
        </div>
        <div className="ed-lane">
          <span className="ed-lane__name">Zoom</span>
          <div className="ed-lane__body">
            {NARRATED.shots.map((sh, i) => {
              if (sh.closeup) return null;
              const [a, b] = shotSpan(sh);
              return (
                <span key={i} className="ed-block" data-pdblock={i} style={{ left: pctN(a), width: pctN(b - a) }}>
                  {sh.label}
                </span>
              );
            })}
          </div>
        </div>
        <div className="ed-lane">
          <span className="ed-lane__name">Close-up</span>
          <div className="ed-lane__body">
            {NARRATED.shots.map((sh, i) => {
              if (!sh.closeup) return null;
              const [a, b] = shotSpan(sh);
              return (
                <span key={i} className="ed-block pd-closeblock" data-pdblock={i} style={{ left: pctN(a), width: pctN(b - a) }}>
                  {sh.label}
                </span>
              );
            })}
          </div>
        </div>
        <div className="ed-lane">
          <span className="ed-lane__name">Captions</span>
          <div className="ed-lane__body">
            {NARRATED.captions.map((c, i) => (
              <span key={i} className="ed-cap" data-pdcap={i} style={{ left: pctN(c.t0), width: pctN(c.t1 - c.t0) }}>
                {c.text}
              </span>
            ))}
          </div>
        </div>
        <div className="ed-lane">
          <span className="ed-lane__name">Voice</span>
          <div className="ed-lane__body">
            {NARRATED.captions.map((c, i) => (
              <span key={i} className="pd-take" style={{ left: pctN(c.t0), width: pctN(c.t1 - c.t0) }} />
            ))}
          </div>
        </div>
        <span className="ed-heads" aria-hidden="true">
          <span className="ed-playhead" data-pdhead />
        </span>
      </div>
    </figure>
  );
}

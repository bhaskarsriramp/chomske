/**
 * tiles.js: the demonstrations that are pure CSS.
 *
 * Each one is a short loop of keyframes on a few boxes. They run only while on
 * screen — the wrapper carries data-on, and landing.css pauses every animation
 * under data-on="false" — and not at all under prefers-reduced-motion, where
 * each shows the frame that explains it best.
 *
 * Everything shown is something the product does today: the controls named
 * are the editor's own (Studio/panels.js), the presets are the export dialog's
 * (backend/services/studio/exportOptions.js), and the gradients are the
 * editor's backgrounds (Studio/model.js GRADIENTS).
 */
import { useEffect, useRef } from "react";
import { reducedMotion, useInView } from "./film";
import { CursorGlyph } from "./demo";

/** A wrapper that switches its CSS animations on only while visible. */
export function Live({ as: Tag = "div", className = "", children, ...rest }) {
  const ref = useRef(null);
  const on = useInView(ref);
  // SMIL (the cursor tile's path) is not paused by CSS; pause it by hand.
  useEffect(() => {
    const svgs = ref.current?.querySelectorAll("svg[data-smil]") || [];
    svgs.forEach((svg) => {
      if (reducedMotion()) {
        svg.pauseAnimations?.();
        svg.setCurrentTime?.(1.6);
      } else if (on) svg.unpauseAnimations?.();
      else svg.pauseAnimations?.();
    });
  }, [on]);
  return (
    <Tag ref={ref} className={className} data-on={on ? "true" : "false"} {...rest}>
      {children}
    </Tag>
  );
}

const Tick = () => (
  <svg viewBox="0 0 12 12" aria-hidden="true">
    <path d="M2.5 6.2 5 8.6l4.6-5.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* ────────────────────────────────────────────────────────────────────────────
   Nothing to install: the whole path from a tab to a finished edit
   ──────────────────────────────────────────────────────────────────────────── */

export function RecordFlow() {
  return (
    <Live className="rf" aria-label="Recording in a browser tab: press record, choose the tab in the browser's own share dialog, record, stop, and the edit is made.">
      <div className="rf-win" aria-hidden="true">
        <div className="rf-chrome">
          <span className="rf-dots"><i /><i /><i /></span>
          <span className="rf-tab"><i />Clipo · Record</span>
          <span className="rf-tab rf-tab--off"><i className="rf-fav--lumen" />Lumen · Pricing</span>
        </div>
        <div className="rf-url">
          <svg viewBox="0 0 12 12"><path d="M3.5 5V3.8a2.5 2.5 0 0 1 5 0V5M3 5h6v5H3z" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
          tryclipo.com/app/record
        </div>
        <div className="rf-body">
          {/* 1. ready */}
          <div className="rf-pane rf-ready">
            <b>New recording</b>
            <span className="rf-opt"><i><Tick /></i>Microphone</span>
            <span className="rf-opt"><i><Tick /></i>Screen sound</span>
            <span className="rf-opt"><i><Tick /></i>Edit it automatically</span>
            <span className="rf-go"><i />Start recording</span>
          </div>
          {/* 2. the browser's own dialog */}
          <div className="rf-dialog">
            <b>Choose what to share with tryclipo.com</b>
            <span className="rf-dialog__tabs"><em className="is-on">Chrome tab</em><em>Window</em><em>Entire screen</em></span>
            <span className="rf-thumbs">
              <span className="rf-thumb rf-thumb--pick"><i /><em>Lumen · Pricing</em></span>
              <span className="rf-thumb"><i /><em>Inbox</em></span>
              <span className="rf-thumb"><i /><em>Docs</em></span>
            </span>
            <span className="rf-dialog__foot"><em>Cancel</em><b className="rf-share">Share</b></span>
          </div>
          {/* 3. recording */}
          <div className="rf-pane rf-rec">
            <span className="rf-sharing">tryclipo.com is sharing this tab<em>Stop sharing</em></span>
            <span className="rf-live"><i />REC <span className="rf-timer"><span>0:01 0:02 0:03 0:04 0:05 0:06</span></span></span>
            <span className="rf-mini"><i className="rf-mini__cursor" /></span>
            <span className="rf-stop">Stop</span>
          </div>
          {/* 4. the edit */}
          <div className="rf-pane rf-done">
            <span className="rf-step rf-step--1"><i><Tick /></i>Uploaded</span>
            <span className="rf-step rf-step--2"><i><Tick /></i>3 clicks found</span>
            <span className="rf-step rf-step--3"><i><Tick /></i>3 zooms added</span>
            <span className="rf-ready-edit">Your demo is ready<em>Open the editor</em></span>
          </div>
          <span className="rf-cursor"><CursorGlyph /></span>
          <span className="rf-press" />
        </div>
      </div>
    </Live>
  );
}

/** What recording a demo usually takes, against what it takes here. */
export function Friction() {
  const cols = [
    { name: "Desktop recorders", steps: ["Download the app", "Install it", "Allow screen recording in settings", "Restart it"], note: "One operating system, often Mac only", ours: false },
    { name: "Browser extensions", steps: ["Add it to your browser", "Give it access to your pages", "Pin it to the toolbar"], note: "Usually Chrome only", ours: false },
    { name: "Clipo", steps: ["Open a tab", "Press record"], note: "Any desktop browser, any operating system", ours: true },
  ];
  return (
    <Live className="fr">
      {cols.map((c) => (
        <div key={c.name} className={`fr-col${c.ours ? " fr-col--ours" : ""}`}>
          <span className="fr-name">{c.name}</span>
          <ol>
            {c.steps.map((s, i) => (
              <li key={s} style={{ "--i": i }}>
                <span className="fr-n">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <span className="fr-note">{c.note}</span>
        </div>
      ))}
    </Live>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   How it works, in the viewer's words
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * What Clipo does for someone, never how. The method (how the pointer and the
 * clicks are found) is not published on this page, in index.html or in
 * llms.txt: it is the part other tools would copy. Describe the result.
 */
export const HOW_STEPS = [
  ["Record", "Share a tab, a window or your whole screen, and walk through your product as you normally would."],
  ["Clipo follows along", "Nothing to mark, tag or remember while you record. Just do the demo."],
  ["Clicks become highlights", "Every click that matters gets its moment, so nobody watching misses what you did."],
  ["The camera moves for you", "Smooth zooms glide in before each click and ease back out once the result is on screen."],
];

export function HowItWorks() {
  return (
    <Live className="cs">
      <ol className="cs-steps">
        {HOW_STEPS.map(([title, body], i) => (
          <li key={title} className={`cs-step cs-step--${i + 1}`}>
            <span className="cs-step__n">{String(i + 1).padStart(2, "0")}</span>
            <span>
              <b>{title}</b>
              <em>{body}</em>
            </span>
            <i className="cs-step__bar" />
          </li>
        ))}
      </ol>
      <div className="cs-frame" aria-hidden="true">
        <div className="cs-cam">
          <div className="cs-page">
            <span className="cs-head"><i />Billing</span>
            <span className="cs-row" />
            <span className="cs-row cs-row--short" />
            <span className="cs-toggle">
              <em>Monthly</em>
              <em className="cs-toggle__l">Lifetime</em>
              <i />
            </span>
            <span className="cs-row" />
            <span className="cs-card">
              <span className="cs-card__title" />
              <span className="cs-card__bars"><i /><i /><i /><i /><i /><i /></span>
            </span>
          </div>
          <span className="cs-ripple" />
          <span className="cs-me">
            <CursorGlyph />
          </span>
        </div>
        <span className="cs-rec"><i />REC</span>
        <span className="cs-tags">
          <em className="cs-tag cs-tag--click"><i />Click</em>
          <em className="cs-tag cs-tag--zoom">Auto zoom 1.9×</em>
        </span>
      </div>
    </Live>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   The feature tiles
   ──────────────────────────────────────────────────────────────────────────── */

function Tile({ kind, title, body, children, wide = false }) {
  return (
    <Live as="article" className={`ft ft--${kind}${wide ? " ft--wide" : ""}`}>
      <div className="ft-vis" aria-hidden="true">
        {children}
      </div>
      <div className="ft-copy">
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
    </Live>
  );
}

const RAW = "M24 128 L52 104 L47 99 L83 86 L79 72 L118 70 L122 57 L161 64 L166 49 L204 66 L199 80 L238 70 L246 58 L281 62 L292 44";
const SMOOTH = "M24 128 C 70 70, 130 58, 170 62 S 250 76, 292 44";

function CursorTile() {
  return (
    <Tile
      kind="cursor"
      wide
      title="A cursor worth watching"
      body="Your shaky path, redrawn smooth. Arrow, ring or dot, with a glow, a trail and a ripple on every click."
    >
      <svg className="ft-cursor__svg" viewBox="0 0 316 160" data-smil>
        <path d={RAW} className="ft-cursor__raw" />
        <path d={SMOOTH} className="ft-cursor__smooth" pathLength="1" />
        <g className="ft-cursor__ride">
          <circle r="11" className="ft-cursor__glow" />
          <path d="M0 0v17l5-4 4 8 3-1.4-4-8 7-1.3Z" fill="#fff" stroke="#0F0F0F" strokeWidth="1.5" strokeLinejoin="round" />
          <animateMotion dur="3.2s" repeatCount="indefinite" path={SMOOTH} keyPoints="0;1;1" keyTimes="0;0.8;1" calcMode="spline" keySplines="0.65 0 0.35 1;0 0 1 1" />
        </g>
        <circle cx="292" cy="44" r="4" className="ft-cursor__ripple" opacity="0">
          <animate attributeName="r" dur="3.2s" repeatCount="indefinite" values="4;4;4;22;22" keyTimes="0;0.79;0.8;0.97;1" />
          <animate attributeName="opacity" dur="3.2s" repeatCount="indefinite" values="0;0;0.9;0;0" keyTimes="0;0.79;0.8;0.97;1" />
        </circle>
      </svg>
      <span className="ft-cursor__legend">
        <span><i className="lg-raw" />What you did</span>
        <span><i className="lg-smooth" />What it shows</span>
      </span>
      <span className="ft-cursor__styles">
        <span className="ft-sty ft-sty--arrow"><CursorGlyph />Arrow</span>
        <span className="ft-sty ft-sty--ring"><i />Ring</span>
        <span className="ft-sty ft-sty--dot"><i />Dot</span>
      </span>
    </Tile>
  );
}

const WALLS = [
  ["Dusk", "wall--dusk"],
  ["Aurora", "wall--aurora"],
  ["Plum", "wall--plum"],
  ["Mist", "wall--mist"],
];

function BackdropTile() {
  return (
    <Tile kind="backdrop" title="Framed like a product shot" body="Backgrounds, padding, rounded corners and a shadow. Set once, kept for every export.">
      {WALLS.map(([name, cls], i) => (
        <span key={name} className={`ft-wall wall ${cls}`} style={{ "--i": i }}>
          <em>{name}</em>
        </span>
      ))}
      <span className="ft-shot">
        <span className="ft-shot__bar"><i /><i /><i /></span>
        <span className="ft-shot__row" />
        <span className="ft-shot__row ft-shot__row--s" />
        <span className="ft-shot__grid"><i /><i /><i /></span>
      </span>
    </Tile>
  );
}

function AspectTile() {
  const shapes = [
    ["16:9", "YouTube"],
    ["9:16", "Reels, Shorts"],
    ["1:1", "Square"],
    ["4:5", "LinkedIn"],
  ];
  return (
    <Tile kind="aspect" title="Every shape from one edit" body="Landscape, vertical, square. The camera keeps what matters in frame.">
      <span className="ft-frame">
        <span className="ft-frame__ui">
          <i className="ft-frame__h" />
          <i className="ft-frame__row" />
          <b className="ft-frame__btn">Get lifetime</b>
          <i className="ft-frame__row ft-frame__row--s" />
        </span>
      </span>
      {shapes.map(([r, n], i) => (
        <span key={n} className="ft-rname" style={{ "--i": i }}>
          {n}
        </span>
      ))}
      <span className="ft-ratios">
        {shapes.map(([r], i) => (
          <span key={r} style={{ "--i": i }}>
            <b>{r}</b>
          </span>
        ))}
      </span>
    </Tile>
  );
}

const LINES = [
  ["cap-clipo", "Here's our pricing page"],
  ["cap-bold", "Switch billing to lifetime"],
  ["cap-neon", "and you're in. Done."],
];

function CaptionsTile() {
  return (
    <Tile kind="captions" title="Captions from your voice" body="Transcribed, timed and burned in, in the style you pick.">
      <span className="ft-wave">
        {Array.from({ length: 14 }, (_, i) => (
          <i key={i} style={{ "--i": i }} />
        ))}
      </span>
      {LINES.map(([cls, text], li) => (
        <span key={cls} className={`ft-cap ${cls}`} style={{ "--l": li }}>
          {text.split(" ").map((w, i) => (
            <span key={i} style={{ "--w": i }}>
              {w}{" "}
            </span>
          ))}
        </span>
      ))}
      <span className="ft-capstyles">
        <em style={{ "--l": 0 }}>Clipo</em>
        <em style={{ "--l": 1 }}>Bold</em>
        <em style={{ "--l": 2 }}>Neon</em>
      </span>
    </Tile>
  );
}

function BlurTile() {
  return (
    <Tile kind="blur" title="Private stays private" body="Cover an email, a key or a customer's name. Blur, pixelate or a solid box, for a moment or the whole recording.">
      <span className="ft-card">
        <span className="ft-card__head">Account</span>
        <span className="ft-card__row">
          <em>Owner</em>
          <b className="ft-sec ft-sec--1">
            <span>priya@lumen.app</span>
            <i className="ft-sel ft-sel--1"><em>Blur</em></i>
          </b>
        </span>
        <span className="ft-card__row">
          <em>API key</em>
          <b className="ft-sec ft-sec--2">
            <span>sk_live_51Hq…9fA2</span>
            <i className="ft-sel ft-sel--2"><em>Pixelate</em></i>
          </b>
        </span>
        <span className="ft-card__row"><em>Plan</em><b>Pro · lifetime</b></span>
      </span>
    </Tile>
  );
}

function ExportTile() {
  const presets = [
    ["YouTube", "1080p · 30fps"],
    ["4K demo", "2160p · 60fps"],
    ["Reels", "9:16 · 1080p"],
    ["GIF", "720p · 15fps"],
  ];
  return (
    <Tile kind="export" title="4K at 60fps, or a GIF" body="Presets for YouTube, Reels, LinkedIn and X, or every setting yourself. MP4, WebM or GIF.">
      <span className="ft-presets">
        {presets.map(([n, h], i) => (
          <span key={n} className={i === 1 ? "is-pick" : ""}>
            <b>{n}</b>
            {h}
          </span>
        ))}
      </span>
      <span className="ft-render">
        <span className="ft-render__bar"><i /></span>
        <span className="ft-render__file">
          <em>pricing-walkthrough.mp4</em>
          <b><Tick />3840×2160</b>
        </span>
      </span>
    </Tile>
  );
}

function StepsTile() {
  const steps = ["Open the Pricing page", "Switch billing to Lifetime", "Choose Pro and check out"];
  return (
    <Tile kind="steps" title="Steps, written for you" body="A clear step-by-step of your demo, ready for a help article or a voiceover script.">
      <span className="ft-read"><i />Writing your steps</span>
      <ol className="ft-steps">
        {steps.map((s, i) => (
          <li key={s} style={{ "--i": i }}>
            <span className="ft-steps__n">{i + 1}</span>
            <span className="ft-steps__t">{s}</span>
          </li>
        ))}
      </ol>
    </Tile>
  );
}

function ReviewTile() {
  return (
    <Tile kind="review" title="Nothing slips through" body="If a moment deserves a zoom, Clipo suggests one. One press adds it.">
      <span className="ft-tl">
        <span className="ft-tl__block" style={{ left: "6%", width: "22%" }}>2.2×</span>
        <span className="ft-tl__block ft-tl__block--new" style={{ left: "58%", width: "24%" }}>1.8×</span>
        <span className="ft-tl__click" style={{ left: "12%" }} />
        <span className="ft-tl__click ft-tl__click--miss" style={{ left: "66%" }} />
      </span>
      <span className="ft-toast">
        <span className="ft-toast__icon">!</span>
        <span>
          <b>Add a zoom at 0:07?</b>
          <em>Lifetime toggle</em>
        </span>
        <span className="ft-toast__btn">Add zoom</span>
      </span>
    </Tile>
  );
}

export function FeatureGrid() {
  return (
    <div className="fg">
      <CursorTile />
      <BackdropTile />
      <AspectTile />
      <CaptionsTile />
      <BlurTile />
      <ExportTile />
      <StepsTile />
      <ReviewTile />
    </div>
  );
}

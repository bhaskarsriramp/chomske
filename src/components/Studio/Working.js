/**
 * Working.js: the screen shown while Clipo edits a recording, and while it
 * builds a product demo on top of the edit.
 *
 * One screen for the whole wait, from "the recording is ready" to "open the
 * editor", so nobody watches the editor fill itself in half-made and decides
 * it is broken. It shows three things at once:
 *
 *   the percentage   big, and always moving. The server reports progress in
 *                    jumps; the number eases towards each report and creeps a
 *                    few points past it while a long stage runs, never more
 *                    than CREEP and never to 100 until the work is done.
 *   the stage        what is happening, in words, from the server's own
 *                    progress messages (editPhase / demoPhase below).
 *   a film of it     a small made-up app being edited in front of the creator,
 *                    acting out the current stage: a scan while the recording
 *                    is read, markers where the clicks are found, the camera
 *                    zooming while it is planned, blur landing on the private
 *                    fields, captions typing, a voice speaking. Each stage
 *                    leaves its mark behind for the ones after it.
 *
 * Reusable: anything long the studio does can show this with its own phases.
 *
 * `complete` turns it into the finale: the number runs to 100, every stage
 * ticks, and `onComplete` is called a moment later so the editor opens on a
 * finished screen rather than cutting away at 87%.
 */
import { useEffect, useRef, useState } from "react";
import { Icon } from "./ui";
import "./working.css";

/* ────────────────────────────────────────────────────────────────────────────
   The stages
   ──────────────────────────────────────────────────────────────────────────── */

const EDIT = [
  { id: "watch", label: "Watching your recording", sub: "Reading it frame by frame and following your pointer.", a: "#22D3EE", b: "#3B82F6" },
  { id: "clicks", label: "Finding every click", sub: "Where you pressed, and what changed on screen when you did.", a: "#6D6BFF", b: "#22D3EE" },
  { id: "camera", label: "Planning the camera", sub: "Choosing where to zoom in, how far, and for how long.", a: "#A855F7", b: "#6D6BFF" },
  { id: "private", label: "Checking for anything private", sub: "Emails, keys and personal details get blurred.", a: "#F43F5E", b: "#F59E0B" },
  { id: "build", label: "Building the edit", sub: "Laying the zooms, blur and pointer on the timeline.", a: "#F59E0B", b: "#F43F5E" },
];

const DEMO = [
  { id: "script", label: "Writing the script", sub: "Turning what's on screen and your brief into a story.", a: "#10B981", b: "#22D3EE" },
  { id: "closeups", label: "Choosing close-ups", sub: "Easing in on what matters where you didn't click.", a: "#8B5CF6", b: "#EC4899" },
  { id: "voice", label: "Recording the voice", sub: "Reading the script aloud and fitting it to the video.", a: "#EC4899", b: "#F97316" },
  { id: "final", label: "Putting it together", sub: "Captions, voice and zooms, timed to the picture.", a: "#F97316", b: "#FACC15" },
];

const TRACKS = {
  edit: { phases: EDIT, eyebrow: "Clipo is editing your recording", done: "Your edit is ready" },
  demo: { phases: [...EDIT, ...DEMO], eyebrow: "Clipo is building your product demo", done: "Your product demo is ready" },
  demoOnly: { phases: DEMO, eyebrow: "Clipo is building your product demo", done: "Your product demo is ready" },
};

/** The automatic edit's stage (backend services/studio/analyse.js), as a phase. */
export function editPhase(stage = "", progress = 0) {
  const s = String(stage || "").toLowerCase();
  if (/building the edit|finishing|writing captions/.test(s)) return "build";
  if (/private/.test(s)) return "private";
  if (/camera|narration/.test(s)) return "camera";
  if (/following the pointer|interface|steps|clicks/.test(s)) return "clicks";
  if (/sampling|pointer|watching|queued|ready|preparing/.test(s)) return "watch";
  const p = Number(progress) || 0;
  return p < 0.06 ? "watch" : p < 0.58 ? "clicks" : p < 0.82 ? "camera" : p < 0.9 ? "private" : "build";
}

/** The product demo's stage (backend services/studio/autodemo/), as a phase. */
export function demoPhase(stage = "") {
  const s = String(stage || "").toLowerCase();
  if (/together/.test(s)) return "final";
  if (/voice/.test(s)) return "voice";
  if (/close/.test(s)) return "closeups";
  return "script";
}

/* ────────────────────────────────────────────────────────────────────────────
   The number
   ──────────────────────────────────────────────────────────────────────────── */

/** How far past the last report the number may creep, and how slowly. */
const CREEP = 0.05;
const CREEP_S = 18;

const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * The shown percentage, written straight to the DOM every frame rather than
 * through React state, so a number that moves sixty times a second does not
 * re-render the scene sixty times a second. Monotonic: a report lower than
 * what is already shown holds the number where it is.
 */
function useShown(target, complete, onFinished) {
  const numRef = useRef(null);
  const barRef = useRef(null);
  const st = useRef({ shown: 0, target: 0, since: 0, last: 0, finished: false });
  const completeRef = useRef(complete);
  completeRef.current = complete;
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;

  useEffect(() => {
    const s = st.current;
    const t = Math.max(0, Math.min(1, Number(target) || 0));
    if (t > s.target) {
      s.target = t;
      s.since = performance.now();
    }
  }, [target]);

  useEffect(() => {
    const s = st.current;
    const still = reduced();
    let raf = 0;
    let timer = 0;
    const frame = (now) => {
      const dt = s.last ? Math.min(0.1, (now - s.last) / 1000) : 0;
      s.last = now;
      const done = completeRef.current;
      let goal;
      if (done) goal = 1;
      else {
        const waited = s.since ? (now - s.since) / 1000 : 0;
        goal = Math.min(0.99, s.target + CREEP * (1 - Math.exp(-waited / CREEP_S)));
      }
      if (still) s.shown = Math.max(s.shown, goal);
      else {
        // Quick to catch up from far behind (a page opened at 60%), gentle
        // once close, and quick again for the finale.
        const rate = done ? 5 : goal - s.shown > 0.12 ? 2.6 : 1.4;
        s.shown = Math.max(s.shown, s.shown + (goal - s.shown) * (1 - Math.exp(-rate * dt)));
      }
      const pct = done && s.shown > 0.994 ? 100 : Math.min(99, Math.floor(s.shown * 100));
      if (numRef.current && numRef.current.textContent !== String(pct)) numRef.current.textContent = String(pct);
      if (barRef.current) barRef.current.style.transform = `scaleX(${pct === 100 ? 1 : s.shown})`;
      if (pct === 100 && !s.finished) {
        s.finished = true;
        finishedRef.current?.("shown");
        timer = setTimeout(() => finishedRef.current?.("done"), still ? 250 : 950);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, []);

  return { numRef, barRef };
}

/* ────────────────────────────────────────────────────────────────────────────
   The screen
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * @param track     "edit" | "demo" | "demoOnly"
 * @param phase     the current phase id (editPhase / demoPhase)
 * @param progress  0..1 across the whole track
 * @param complete  the work is done: run to 100 and call onComplete
 */
export default function Working({ track = "edit", phase, progress = 0, complete = false, onComplete, error = "", onRetry, note }) {
  const t = TRACKS[track] || TRACKS.edit;
  const phases = t.phases;
  const found = phases.findIndex((p) => p.id === phase);
  const idx = Math.max(0, found);
  const [finished, setFinished] = useState(false);
  const { numRef, barRef } = useShown(progress, complete, (what) => {
    if (what === "shown") setFinished(true);
    else onComplete?.();
  });

  const current = finished ? phases[phases.length - 1] : phases[idx];
  const sceneId = finished ? "final" : current.id;
  // Which stage's leftovers stay on the picture: everything already done.
  const did = (id) => finished || phases.findIndex((p) => p.id === id) < idx || (track === "demoOnly" && EDIT.some((p) => p.id === id));

  return (
    <div className="wk-wrap">
      <section
        className={`wk${finished ? " is-finished" : ""}${error ? " is-error" : ""}`}
        data-phase={sceneId}
        style={{ "--wk-a": current.a, "--wk-b": current.b }}
        aria-busy={!finished && !error}
      >
        <div className="wk-aurora" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="wk-grid" aria-hidden="true" />
        <Particles />

        <div className="wk-body">
          <div className="wk-stage" aria-hidden="true">
            {/* Keyed by phase: every animation in the film restarts together, so
                the camera, the pointer and the clicks stay in step. */}
            <Scene key={sceneId} phase={sceneId} did={did} />
          </div>

          <div className="wk-side">
            <div className="wk-eyebrow">
              <span className="wk-live" />
              {finished ? "Done" : t.eyebrow}
            </div>

            {error ? (
              <div className="wk-error">
                <Icon name="alert" size={30} />
              </div>
            ) : (
              <div className="wk-pct" aria-hidden="true">
                <span ref={numRef}>0</span>
                <small>%</small>
                {finished && (
                  <span className="wk-burst">
                    <i /><i /><i /><i /><i /><i /><i /><i />
                  </span>
                )}
              </div>
            )}

            <div className="wk-now" key={error ? "error" : finished ? "done" : current.id} aria-live="polite">
              <h2>{error ? "That didn't finish" : finished ? t.done : current.label}</h2>
              <p>{error || (finished ? "Opening the editor…" : current.sub)}</p>
            </div>

            {error && onRetry && (
              <button type="button" className="wk-retry" onClick={onRetry}>
                Try again
              </button>
            )}

            {!error && (
              <ol className={`wk-steps${phases.length > 6 ? " is-long" : ""}`}>
                {phases.map((p, i) => {
                  const state = finished || i < idx ? "done" : i === idx ? "now" : "todo";
                  return (
                    <li key={p.id} className={`is-${state}`} style={{ "--c": p.a }}>
                      <span className="wk-dot">{state === "done" && <Icon name="check" size={11} />}</span>
                      {p.label}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>

        <div className="wk-foot">
          <div
            className="wk-bar"
            role="progressbar"
            aria-label={t.eyebrow}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={finished ? 100 : Math.round((Number(progress) || 0) * 100)}
          >
            <i ref={barRef} />
          </div>
          <p>{note || "This usually takes a minute or two. You can leave this page; it carries on without you."}</p>
        </div>
      </section>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Decoration
   ──────────────────────────────────────────────────────────────────────────── */

// Fixed, so the field looks the same on every render and every visit.
const DOTS = [
  [6, 0, 9, 3], [14, 2.4, 11, 2], [23, 5.1, 8, 4], [31, 1.2, 12, 2], [40, 3.8, 10, 3], [48, 6.6, 9, 2],
  [57, 0.6, 11, 3], [64, 4.4, 13, 2], [72, 2.0, 9, 4], [80, 5.6, 10, 2], [88, 1.6, 12, 3], [95, 3.2, 8, 2],
];

function Particles() {
  return (
    <div className="wk-dots" aria-hidden="true">
      {DOTS.map(([x, delay, dur, size], i) => (
        <i
          key={i}
          style={{
            left: `${x}%`,
            width: size,
            height: size,
            animationDelay: `${-delay}s`,
            animationDuration: `${dur}s`,
            background: i % 3 === 0 ? "var(--wk-a)" : i % 3 === 1 ? "var(--wk-b)" : "#fff",
          }}
        />
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   The film: a made-up app, being edited
   ──────────────────────────────────────────────────────────────────────────── */

const ROWS = [
  { name: 38, mail: 15, tone: "#FDE68A", state: "Active" },
  { name: 30, mail: 17, tone: "#BFDBFE", state: "Invited" },
  { name: 42, mail: 13, tone: "#FBCFE8", state: "Active" },
  { name: 34, mail: 16, tone: "#BBF7D0", state: "Paused" },
];

const CAPTION = ["Start", "a", "new", "project", "in", "one", "click"];

function Scene({ phase, did }) {
  const blurOn = phase === "private" || did("private");
  const marksOn = phase === "clicks" || did("clicks");
  const speaking = phase === "script" || phase === "voice" || phase === "final";

  return (
    <div className="wk-scene">
      <div className="wk-screen">
        <div className="wk-cam">
          <div className="wk-chrome">
            <span className="wk-lights"><i /><i /><i /></span>
            <span className="wk-url">app.yourproduct.com/projects</span>
          </div>

          <aside className="wk-side-nav">
            <span className="wk-logo"><i />Northwind</span>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} className={`wk-nav${i === 1 ? " is-on" : ""}`}><i /><b style={{ width: `${46 + ((i * 17) % 30)}%` }} /></span>
            ))}
          </aside>

          <div className="wk-title">Projects</div>
          <div className="wk-subtitle" />
          <div className="wk-new">+ New project</div>

          <div className="wk-stats">
            {["Active projects", "Tasks this week", "On track"].map((label, i) => (
              <div key={label} className={`wk-stat${i === 1 ? " is-focus" : ""}`}>
                <em>{label}</em>
                <strong>{["24", "318", "92%"][i]}</strong>
                <span className="wk-spark">
                  {[5, 8, 6, 9, 7, 11, 10, 13].map((h, j) => (
                    <i key={j} style={{ height: `${h * 7}%` }} />
                  ))}
                </span>
              </div>
            ))}
          </div>

          <div className="wk-table">
            <div className="wk-thead"><b /><b /><b /><b /></div>
            {ROWS.map((r, i) => (
              <div key={i} className="wk-row">
                <span className="wk-avatar" style={{ background: r.tone }} />
                <span className="wk-name" style={{ width: `${r.name * 0.45}%` }} />
                <span className={`wk-mail${blurOn ? " is-blurred" : ""}`} style={{ "--i": i }}>
                  <b style={{ width: `${r.mail * 5}%` }} />
                </span>
                <span className={`wk-pill is-${r.state.toLowerCase()}`}>{r.state}</span>
                <span className={`wk-act${i === 1 ? " is-target" : ""}`}>Edit</span>
              </div>
            ))}
          </div>

          <div className="wk-switch"><i /></div>
          <div className="wk-switch-label" />

          {phase === "clicks" && (
            <svg className="wk-path" viewBox="0 0 100 62.5">
              <path d="M60 46.9 L88.5 8.9 L90.75 41.1 L24.75 57.5" pathLength="1" />
            </svg>
          )}
          {marksOn && (
            <>
              <span className="wk-mark is-a">1</span>
              <span className="wk-mark is-b">2</span>
              <span className="wk-mark is-c">3</span>
            </>
          )}

          <span className="wk-ripple is-a" />
          <span className="wk-ripple is-b" />
          <span className="wk-ripple is-c" />
          <span className="wk-cursor">
            <svg viewBox="0 0 22 26" fill="none">
              <path d="M2 2v17l5-4 4 8 3-1.4-4-8 7-1.3L2 2Z" fill="#fff" stroke="#0F0F0F" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </span>
        </div>

        {phase === "watch" && (
          <>
            <span className="wk-scan" />
            <span className="wk-corners"><i /><i /><i /><i /></span>
          </>
        )}
        {(phase === "camera" || phase === "final") && <span className="wk-zoom-badge">1.8×</span>}
        {phase === "closeups" && <span className="wk-zoom-badge is-close">Close-up</span>}
        {phase === "private" && <span className="wk-shield"><Icon name="eye" size={13} />4 private details</span>}
        {speaking && (
          <span className="wk-caption">
            {CAPTION.map((w, i) => (
              <b key={i} style={{ "--i": i }}>{w}</b>
            ))}
          </span>
        )}
      </div>

      <Dock phase={phase} />
    </div>
  );
}

/** Under the film: what the current stage is producing. */
function Dock({ phase }) {
  if (phase === "watch") {
    return (
      <div className="wk-dock">
        <span className="wk-dock-label">Frames</span>
        <div className="wk-strip">
          <div>
            {Array.from({ length: 16 }, (_, i) => (
              <i key={i}><b /><b /><b /></i>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (phase === "clicks") {
    return (
      <div className="wk-dock">
        <span className="wk-dock-label">Clicks found</span>
        <div className="wk-chips">
          {["New project", "Edit row", "Turn on"].map((c, i) => (
            <span key={c} className="wk-chip is-click" style={{ "--d": `${[1.15, 3.0, 5.2][i]}s` }}>
              <em>{i + 1}</em>Click · {c}
            </span>
          ))}
        </div>
      </div>
    );
  }
  if (phase === "private") {
    return (
      <div className="wk-dock">
        <span className="wk-dock-label">Privacy</span>
        <div className="wk-chips">
          {["Email", "Email", "API key", "Phone"].map((c, i) => (
            <span key={i} className="wk-chip is-safe" style={{ "--d": `${0.5 + i * 0.9}s` }}>
              <Icon name="blur" size={12} />{c} · blurred
            </span>
          ))}
        </div>
      </div>
    );
  }
  if (phase === "script") {
    return (
      <div className="wk-dock is-script">
        <span className="wk-dock-label">Script</span>
        <div className="wk-lines">
          {["Start a new project in one click.", "Open any row to change who's on it.", "Flip the switch, and you're live."].map((l, i) => (
            <span key={l} style={{ "--d": `${i * 2.1}s`, "--n": l.length }}>
              <em>{i + 1}</em><b>{l}</b>
            </span>
          ))}
        </div>
      </div>
    );
  }
  if (phase === "voice") {
    return (
      <div className="wk-dock">
        <span className="wk-dock-label">Voice</span>
        <div className="wk-voice">
          {Array.from({ length: 44 }, (_, i) => (
            <i key={i} style={{ "--d": `${-((i * 37) % 11) / 10}s`, "--h": `${30 + ((i * 53) % 70)}%` }} />
          ))}
        </div>
      </div>
    );
  }
  const lanes =
    phase === "camera"
      ? [["Zoom", [[10, 15], [30, 22], [56, 26]], "a"]]
      : phase === "closeups"
        ? [["Clicks", [[10, 15], [30, 22], [56, 26]], "dim"], ["Close-up", [[15, 52]], "a"]]
        : phase === "final"
          ? [["Zoom", [[10, 15], [30, 22], [56, 26]], "a"], ["Captions", [[4, 26], [33, 30], [66, 28]], "b"], ["Voice", [[4, 90]], "w"]]
          : [["Video", [[0, 100]], "dim"], ["Zoom", [[10, 15], [30, 22], [56, 26]], "a"], ["Blur", [[20, 60]], "b"]];
  return (
    <div className="wk-dock is-lanes">
      {lanes.map(([label, blocks, tone], li) => (
        <div key={label} className="wk-lane">
          <span className="wk-dock-label">{label}</span>
          <div className="wk-track">
            {blocks.map(([left, width], bi) => (
              <i
                key={bi}
                className={`is-${tone}`}
                style={{ left: `${left}%`, width: `${width}%`, "--d": `${0.2 + li * 0.35 + bi * 0.5}s` }}
              />
            ))}
            <span className="wk-head" />
          </div>
        </div>
      ))}
    </div>
  );
}

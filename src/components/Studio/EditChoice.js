/**
 * EditChoice.js: "how should Clipo edit it?", asked while the recording uploads.
 *
 * Two answers, side by side, each showing what it makes rather than
 * describing it:
 *
 *   Zoom on clicks   the recording, polished: a zoom on every click, a smooth
 *                    pointer, anything private blurred. The default, and what
 *                    most recordings want. Captions, a voice and more zooms can
 *                    be added in the editor whenever the creator likes.
 *   Product demo     all of that, plus a script written from the screen and a
 *                    one-line brief, read as captions and by an AI voice, with
 *                    close-ups where nobody clicked.
 *
 * and a quiet third, "Open it unedited", for anyone who wants none of it.
 *
 * ── THE FILMS ARE THE LANDING PAGE'S ─────────────────────────────────────────
 * Each card plays the landing page's own demonstration (Landing/demo.js
 * DemoScreen, driven by film.js): a pricing page, three clicks, and the camera
 * Clipo builds from them. Drawn from markup, not shipped as video, so they are
 * a few kilobytes, sharp at any width, and show exactly what the editor does.
 * The demo card's film adds the burned-in captions and a speaking voice.
 *
 * Answering does not wait for the upload: the choice is held and acted on the
 * moment the recording is saved (RecordPage.js).
 */
import { useLayoutEffect, useRef, useState } from "react";
import { DemoScreen } from "../Landing/demo";
import { SCRIPT, mountScene, useFilm } from "../Landing/film";
import { BriefForm, briefReady } from "./AutoDemo";
import { DEFAULT_VOICE, voiceById } from "./voices.mjs";
import { Btn, Icon, Toggle } from "./ui";

/** One card's film: the demonstration, framed on a coloured wall. */
function ChoiceFilm({ captions = false, voice = "", tone = "ocean", label }) {
  const root = useRef(null);
  const scene = useRef(null);
  useLayoutEffect(() => {
    const el = root.current?.querySelector(".dm");
    scene.current = el ? mountScene(el, "clipo") : null;
    return () => scene.current?.destroy();
  }, []);
  useFilm(root, SCRIPT.duration, (t) => scene.current?.apply(t), { poster: SCRIPT.poster });

  return (
    <div ref={root} className={`st-film is-${tone}`} role="img" aria-label={label}>
      <div className="st-film-screen" aria-hidden="true">
        <DemoScreen variant="clipo" captions={captions} />
      </div>
      {voice && (
        <span className="st-film-voice" aria-hidden="true">
          <Icon name="mic" size={12} />
          {voice}
          <span className="st-wave">
            <i /><i /><i /><i /><i />
          </span>
        </span>
      )}
    </div>
  );
}

function Option({ selected, onSelect, film, badge, title, lead, points, children }) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      className={`st-opt${selected ? " is-on" : ""}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === " " || e.key === "Enter")) {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {film}
      <div className="st-opt-body">
        <div className="st-opt-head">
          <span className="st-opt-radio" aria-hidden="true" />
          <h2>{title}</h2>
          {badge && <span className="st-opt-badge">{badge}</span>}
        </div>
        <p className="st-opt-lead">{lead}</p>
        <ul className="st-opt-points">
          {points.map((p) => (
            <li key={p}>
              <Icon name="check" size={13} />
              {p}
            </li>
          ))}
        </ul>
        {children}
      </div>
    </div>
  );
}

/**
 * `onChoose` gets { mode: "zoom", captions } | { mode: "demo", brief, voice }
 * | { mode: "none" }, once.
 */
export default function EditChoice({ sent = 0, waiting = false, saved = false, hasMic = false, onChoose }) {
  const [mode, setMode] = useState("zoom");
  const [captions, setCaptions] = useState(false);
  const [brief, setBrief] = useState("");
  const [voice, setVoice] = useState(DEFAULT_VOICE);
  const [chosen, setChosen] = useState(null);

  const pct = Math.round((saved ? 1 : sent) * 100);
  const canGo = mode !== "demo" || briefReady(brief);
  const voiceName = (voiceById(voice) || voiceById(DEFAULT_VOICE))?.label || "";

  const go = (m) => {
    if (chosen) return;
    const choice =
      m === "none"
        ? { mode: "none" }
        : m === "demo"
          ? { mode: "demo", brief: brief.trim(), voice }
          : { mode: "zoom", captions: hasMic && captions };
    setChosen(choice);
    onChoose(choice);
  };

  return (
    <div className="st-choice">
      <div className={`st-choice-save${saved ? " is-saved" : ""}`} role="status" aria-live="polite">
        {saved ? <Icon name="check" size={15} /> : <span className="st-spin" aria-hidden="true" />}
        <span className="st-choice-save-label">
          {saved ? "Recording saved" : waiting ? "Waiting for the network. Keep this tab open" : "Saving your recording"}
        </span>
        <div className="st-bar" style={{ flex: 1 }}>
          <i style={{ width: `${pct}%` }} />
        </div>
        <span className="st-choice-pct">{pct}%</span>
      </div>

      <header className="st-choice-head">
        <h1>How should Clipo edit it?</h1>
        <p>Pick one. Either way you can add zooms, captions, a voice or blur in the editor afterwards.</p>
      </header>

      <div className={`st-choice-grid${chosen ? " is-locked" : ""}`} role="radiogroup" aria-label="How to edit this recording">
        <Option
          selected={mode === "zoom"}
          onSelect={() => setMode("zoom")}
          film={<ChoiceFilm tone="ocean" label="A recording that zooms in on each click." />}
          badge="Default"
          title="Zoom on clicks"
          lead="Your recording, polished. Clipo zooms in wherever you click and tidies everything around it."
          points={[
            "A smooth zoom on every click",
            "A clean pointer with click ripples",
            "Emails, keys and private details blurred",
            "Add captions, a voice or more zooms any time",
          ]}
        >
          {hasMic && (
            <div className="st-opt-extra" onClick={(e) => e.stopPropagation()}>
              <Toggle
                label="Also write captions from my voice"
                hint="From your narration. Leave it off if you didn't speak."
                checked={captions}
                onChange={(v) => {
                  setCaptions(v);
                  setMode("zoom");
                }}
              />
            </div>
          )}
        </Option>

        <Option
          selected={mode === "demo"}
          onSelect={() => setMode("demo")}
          film={
            <ChoiceFilm
              tone="sunset"
              captions
              voice={voiceName}
              label="The same recording with captions and a voice reading a script."
            />
          }
          badge="AI"
          title="Full product demo"
          lead="A finished walkthrough, ready to share. Everything in Zoom on clicks, plus a story told over it."
          points={[
            "A script written from your screen and your brief",
            "Captions, read aloud by an AI voice",
            "Close-ups on what matters where you didn't click",
            "Your own click zooms stay exactly as they are",
          ]}
        >
          {mode === "demo" ? (
            <div className="st-opt-extra">
              <BriefForm brief={brief} setBrief={setBrief} voice={voice} setVoice={setVoice} autoFocus />
            </div>
          ) : (
            <p className="st-opt-more">Choose this to tell Clipo who the demo is for and pick a voice.</p>
          )}
        </Option>
      </div>

      <div className="st-choice-go">
        {chosen ? (
          <p className="st-choice-done" role="status">
            <Icon name="check" size={15} />
            {saved
              ? "Opening the editor…"
              : chosen.mode === "demo"
                ? "Got it. Clipo builds your product demo as soon as the upload finishes."
                : "Got it. The editor opens as soon as the upload finishes."}
          </p>
        ) : (
          <>
            <Btn
              kind="primary"
              size="l"
              icon={<Icon name={mode === "demo" ? "wand" : "zoom"} size={15} />}
              disabled={!canGo}
              onClick={() => go(mode)}
            >
              {mode === "demo" ? "Build my product demo" : "Edit with click zooms"}
            </Btn>
            <Btn kind="quiet" size="l" onClick={() => go("none")}>
              Open it unedited
            </Btn>
            {!canGo && <span className="st-choice-hint">Describe what the demo should show to continue.</span>}
          </>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useMemo } from "react";

/**
 * What a voice analysis looks like while it runs.
 *
 * ── WHY THIS SCREEN MOVES, WHEN THE APP DOES NOT ─────────────────────────────
 * The app's standing rule is that nothing moves (see index.css, "NOTHING LIFTS
 * ON HOVER"). This is the one deliberate exception, and the reason is not
 * decoration: the build reads up to five videos end to end and then makes a
 * model call over all of them, which runs to minutes, and for that entire time
 * the screen said "Analysing…" on a greyed button. A still spinner for two
 * minutes is indistinguishable from a hang, and this is the FIRST thing a new
 * creator ever asks the product to do. People were reloading the page to check
 * it had not died, which is the exact moment they decide whether this thing
 * works.
 *
 * ── IT SHOWS THE REAL JOB, NOT A FAKE TIMER ──────────────────────────────────
 * Every number here comes off the server (backend voiceProfileService.js emits
 * voice:progress as each video is actually read and again when the model call
 * starts). Nothing is on a timer pretending to advance, because a progress bar
 * that lies is worse than no bar: it teaches people the product's other numbers
 * cannot be trusted either.
 *
 * The one thing that IS on a clock is the line under the stages, and it is
 * honest about what it is: not "step 4 of 9", just the kinds of thing the
 * analysis looks for, rotating so a creator learns what they are paying for
 * instead of watching a dot spin. Each carries a glyph because at a glance a
 * shape reads before a sentence does.
 *
 * Reduced motion is handled globally (index.css collapses every animation), and
 * the component is built so that with all of it off it still reads correctly:
 * the stages, the counts and the current line are text, not motion.
 */

/* ── The stages, in the order the server does them ───────────────────────── */
const STAGES = [
  { key: "reading", label: "Reading your videos", glyph: Play },
  { key: "analysing", label: "Listening for how you talk", glyph: Wave },
  { key: "finishing", label: "Writing your voice profile", glyph: Pen },
];

const ORDER = { starting: 0, reading: 0, analysing: 1, finishing: 2 };

/**
 * What the analysis is actually looking for, in the creator's own terms.
 *
 * Written as things about THEM rather than as features of the system: "the
 * words you keep in English" is a thing they will recognise about their own
 * videos, "code-mixing ratio detection" is a thing nobody asked for.
 */
const NOTICING = [
  { emoji: "👋", text: "How you open. The first five seconds you always use." },
  { emoji: "🔤", text: "The words you keep in English, and the ones you never translate." },
  { emoji: "🎚️", text: "Your pace. How many words you get through in a second." },
  { emoji: "✂️", text: "Where you cut a sentence short, and where you let one run." },
  { emoji: "🌶️", text: "The slang and the fillers that are yours, not a newsreader's." },
  { emoji: "😀", text: "Whether you land a story warm, dry, or hyped." },
  { emoji: "🔁", text: "The moves you repeat: the setup, the turn, the payoff." },
  { emoji: "👋", text: "How you sign off, and what you ask for at the end." },
];

/**
 * @param {boolean} compact  the version for a story pane or an import panel,
 *   where this is not the subject of the screen but an answer to "can I order a
 *   script yet". The stages and the footer note go; the waveform, the one-line
 *   state and the rotating line stay, because those are what say the wait is
 *   alive rather than stuck. My voice gets the full card.
 */
export default function VoiceAnalysing({ progress, isPhone, videoCount = 0, compact = false }) {
  const stage = progress?.stage || "starting";
  const at = ORDER[stage] ?? 0;

  const done = Number.isFinite(progress?.done) ? progress.done : 0;
  const total = Number.isFinite(progress?.total) ? progress.total : videoCount;

  // ── The rotating line ─────────────────────────────────────────────────────
  // Shuffled per build rather than always starting at "How you open", so a
  // creator running this a second time is not shown the identical sequence and
  // left thinking it is a canned loop, which it is, but not one they should be
  // able to recite.
  const lines = useMemo(() => shuffle(NOTICING), []);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 3400);
    return () => clearInterval(t);
  }, []);

  const line = lines[tick % lines.length];

  // Coarse on purpose: three stages, and inside `reading` the share of videos
  // actually finished. There is no honest finer number than this, the model
  // call is one opaque wait, so the bar spends that stretch shimmering rather
  // than creeping forward on a guess.
  const pct = stage === "reading" && total
    ? 8 + Math.round((done / total) * 46)
    : stage === "analysing"
      ? 62
      : stage === "finishing"
        ? 88
        : 6;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        padding: isPhone ? 16 : 20,
        borderRadius: 13,
        background: "var(--made-tint)",
        border: "1px solid var(--made-line)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
        <Equaliser />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 650, color: "var(--ink)", letterSpacing: "-0.01em" }}>
            Learning your voice
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-body)", marginTop: 2, lineHeight: 1.5 }}>
            {headline(stage, done, total)}
          </div>
        </div>
      </div>

      {/* ── The bar ───────────────────────────────────────────────────────
          Width is the real state; the sheen on top is what says "still
          working" during the model call, where the width genuinely cannot
          move for a minute or more. */}
      <div
        style={{
          marginTop: 14, height: 6, borderRadius: 99, overflow: "hidden",
          background: "#E6E2DC",
        }}
      >
        <div
          className="hg-voice-bar"
          style={{
            width: `${pct}%`, height: "100%", borderRadius: 99,
            background: "var(--made)",
            transition: "width .6s cubic-bezier(.2,.7,.3,1)",
          }}
        />
      </div>

      {/* ── The three stages ────────────────────────────────────────────── */}
      {!compact && (
      <ol
        style={{
          listStyle: "none", margin: "14px 0 0", padding: 0,
          display: "flex", flexDirection: isPhone ? "column" : "row",
          gap: isPhone ? 9 : 8,
        }}
      >
        {STAGES.map((s, i) => {
          const state = i < at ? "done" : i === at ? "now" : "next";
          const Glyph = s.glyph;
          return (
            <li
              key={s.key}
              style={{
                flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8,
                padding: "8px 10px", borderRadius: 9,
                background: state === "now" ? "var(--card)" : "transparent",
                border: `1px solid ${state === "now" ? "var(--made-line)" : "transparent"}`,
              }}
            >
              <span
                aria-hidden="true"
                className={state === "now" ? "hg-voice-live" : undefined}
                style={{
                  width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                  display: "grid", placeItems: "center",
                  background: state === "next" ? "#E6E2DC" : "var(--made)",
                  color: state === "next" ? "var(--ink-mute)" : "#fff",
                }}
              >
                {state === "done" ? <Tick /> : <Glyph />}
              </span>
              <span
                style={{
                  fontSize: 12.5, lineHeight: 1.35, minWidth: 0,
                  fontWeight: state === "now" ? 650 : 500,
                  color: state === "next" ? "var(--ink-mute)" : "var(--ink)",
                }}
              >
                {s.label}
                {s.key === "reading" && total > 0 && (
                  <span style={{ fontWeight: 500, color: "var(--ink-mute)" }}>
                    {" "}{Math.min(done, total)}/{total}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      )}

      {/* ── What it is looking for ──────────────────────────────────────── */}
      <div
        style={{
          marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--made-line)",
          display: "flex", alignItems: "flex-start", gap: 9, minHeight: 38,
        }}
      >
        {/* Keyed on the tick so React remounts it and the entrance animation
            runs again; without the key it is one node whose text swaps with no
            transition at all. */}
        <span
          key={tick}
          className="hg-voice-line"
          style={{ display: "flex", alignItems: "flex-start", gap: 9 }}
        >
          <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1.45, flexShrink: 0 }}>
            {line.emoji}
          </span>
          <span style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ink-body)" }}>
            {line.text}
          </span>
        </span>
      </div>

      {!compact && (
        <p style={{ fontSize: 12, color: "var(--ink-mute)", margin: "11px 0 0", lineHeight: 1.55 }}>
          This keeps running if you leave this screen. We'll update it wherever you are.
        </p>
      )}
    </div>
  );
}

/** The sentence under the title: the one fact worth having at a glance. */
function headline(stage, done, total) {
  if (stage === "reading") {
    return total
      ? `Reading ${total} video${total === 1 ? "" : "s"} end to end · ${Math.min(done, total)} done`
      : "Reading your videos end to end.";
  }
  if (stage === "analysing") return "Reading all of them together, as one person talking.";
  if (stage === "finishing") return "Almost there. Putting the profile together.";
  return "Starting up. This takes a minute or two.";
}

/** Fisher-Yates, so the rotating lines are not in the same order every build. */
function shuffle(list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ── Marks ────────────────────────────────────────────────────────────────
   Drawn rather than imported: five shapes at 11-13px, each a handful of path
   data, against an icon dependency for the whole app. */

/**
 * Five bars on their own staggered clocks.
 *
 * The one piece here that is purely a feeling, and it earns its place: this
 * screen is about a voice, and a waveform says "we are listening to you" in a
 * way no spinner does. Bars are scaled rather than resized so the whole thing
 * stays on the compositor.
 */
function Equaliser() {
  const bars = [0, 0.18, 0.36, 0.12, 0.28];
  return (
    <span
      aria-hidden="true"
      style={{
        display: "flex", alignItems: "center", gap: 3, height: 34,
        width: 38, flexShrink: 0, justifyContent: "center",
      }}
    >
      {bars.map((delay, i) => (
        <span
          key={i}
          className="hg-voice-eq"
          style={{
            width: 4, height: i === 2 ? 26 : i % 2 ? 20 : 14,
            borderRadius: 99, background: "var(--made)",
            animationDelay: `${delay}s`,
          }}
        />
      ))}
    </span>
  );
}

function Tick() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12.5l5.5 5.5L20 6.5" />
    </svg>
  );
}

function Play() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5l11 6.5-11 6.5z" />
    </svg>
  );
}

function Wave() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M4 12h1.5M9 6.5v11M14 9v6M19 12h1.5" />
    </svg>
  );
}

function Pen() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 4l5 5L8.5 20.5 3 21l.5-5.5z" />
    </svg>
  );
}

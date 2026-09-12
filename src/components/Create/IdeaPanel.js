import { useState, useMemo } from "react";
import api, { errorMessage } from "../../api";
import ScriptPanel from "../Order/ScriptPanel";
import SourceCard from "./SourceCard";
import DraftReview from "./DraftReview";
import Field, { Column, Heading } from "./Field";

/**
 * Idea: a script about whatever they want, in their own voice.
 *
 * ── THE DISTINCTION THIS SCREEN HAS TO CARRY ─────────────────────────────────
 * Import also has a big text box. The difference is what the text IS, and if
 * the copy does not make it obvious the two screens collapse into each other in
 * the creator's head:
 *
 *   Import  the text is MATERIAL. A press release, an article, a transcript.
 *           Facts come out of it. "Turn this into a script."
 *   Idea    the text is an INSTRUCTION. "Make a video about why founders should
 *           ship on Fridays." There are no facts in it yet.
 *
 * ── THREE STEPS, AND THE MIDDLE ONE IS THE PRODUCT ───────────────────────────
 *   1. Say what the video is about.
 *   2. Read what we drafted, and fix it.
 *   3. Choose a length and order it.
 *
 * Step 2 is new and it is the reason this screen works at all. "Explain the
 * difference between candlestick patterns and chart patterns" is a complete
 * idea and almost no material: written straight into sixty seconds it gave the
 * creator their own sentence back, restated four times. Searching the news
 * never helped, because an evergreen explainer has no coverage today or ever,
 * so the honest answer was "no coverage found" over a script nobody wanted.
 *
 * What was missing was content, not sources. So the model drafts the content
 * and the creator corrects it, which is also the only condition under which
 * this product will write from a model's own knowledge: a person who knows the
 * subject has read it and put their name to it. See DraftReview.js.
 *
 * Step 2 is SKIPPED when the lookup found real coverage. Sources are checkable
 * on their own, they come with links, so they need no sign-off, and adding a
 * review step to the one path that least needs it would be pure friction.
 */
export default function IdeaPanel({ voice, onVoiceChange, onGoTranscribe, compact, limits , hideTitle = false }) {
  const maxPrompt = limits?.max_prompt_chars ?? 2000;
  const maxText = limits?.max_text_chars ?? 6000;
  const lookupCredits = limits?.lookup_credits ?? 10;

  const [prompt, setPrompt] = useState("");
  const [lookup, setLookup] = useState(false);

  const [source, setSource] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [redrafting, setRedrafting] = useState(false);
  const [error, setError] = useState("");
  const [draftError, setDraftError] = useState("");

  // ── REOPENING AN APPROVED DRAFT ──────────────────────────────────────────
  // Approving is not final. A creator who gets to the length slider and then
  // remembers a correction has to be able to go back to the text, and without
  // this they could not: "Change" returns to the idea box, and re-entering the
  // same idea reuses the same source, which is already approved and would land
  // them straight back on the order panel. The one edit they actually wanted
  // would be the one edit the screen refused.
  const [reopened, setReopened] = useState(false);

  // Same staleness rule as Import: a prepared brief that no longer matches what
  // is in the box would price and write the previous version. The lookup flag
  // is part of the key because turning it on is a different order, not a
  // display preference: it changes what gets read and what the script may claim.
  const inputsKey = useMemo(() => JSON.stringify([prompt.trim(), lookup]), [prompt, lookup]);
  const [readKey, setReadKey] = useState("");
  const prepared = source && readKey === inputsKey;

  const hasPrompt = prompt.trim().length > 0;


  // Three states, in order. `needs_review` comes from the server and is the
  // same flag that gates POST /script there, so the button and the API cannot
  // disagree about whether this is orderable yet.
  const reviewing = prepared && (source.needs_review || reopened);
  const orderable = prepared && !source.needs_review && !reopened;

  function reset() {
    setSource(null);
    setReadKey("");
    setDraftError("");
    setReopened(false);
  }

  async function prepare() {
    if (!hasPrompt || preparing) return;
    setPreparing(true);
    setError("");
    setDraftError("");
    try {
      const { data } = await api.post("/source/preview", {
        kind: "idea",
        prompt: prompt.trim(),
        lookup,
      });
      setSource(data.source);
      setReadKey(inputsKey);
    } catch (err) {
      setSource(null);
      setError(errorMessage(err, "Couldn't set that up. Please try again."));
    } finally {
      setPreparing(false);
    }
  }

  /** They read the draft, fixed it, and are putting their name to it. */
  async function confirm(text) {
    if (confirming) return;
    setConfirming(true);
    setDraftError("");
    try {
      const { data } = await api.post(`/source/${source.id}/confirm`, { text });
      setSource(data.source);
      setReopened(false);
    } catch (err) {
      setDraftError(errorMessage(err, "Couldn't save that. Please try again."));
    } finally {
      setConfirming(false);
    }
  }

  /** A different take on the same idea. Free. */
  async function rewrite() {
    if (redrafting) return;
    setRedrafting(true);
    setDraftError("");
    try {
      const { data } = await api.post(`/source/${source.id}/redraft`);
      setSource(data.source);
    } catch (err) {
      setDraftError(errorMessage(err, "Couldn't write another draft. Please try again."));
    } finally {
      setRedrafting(false);
    }
  }

  return (
    <Column compact={compact}>
      <Heading
        title="Idea"
        hideTitle={hideTitle}
        blurb="Tell us what you want the video to be about, the way you'd explain it to someone. We'll draft it, you check it, then we write it at the length you pick, in your voice."
        compact={compact}
      />

      {error && (
        <div
          role="alert"
          style={{
            padding: "12px 14px", borderRadius: 10, marginBottom: 16,
            background: "#FCE8E6", border: "1px solid #F5C7C3",
            color: "var(--bad)", fontSize: 13.5, lineHeight: 1.55,
          }}
        >
          {error}
        </div>
      )}

      {/* ── Step 1: the idea ─────────────────────────────────────────────── */}
      {!prepared && (
        <>
          <Field
            label="What's the video about?"
            hint="Your take, your argument, your announcement, a topic you want to explain. The more you say, the closer the draft starts to what you meant."
            count={`${prompt.length.toLocaleString()} / ${maxPrompt.toLocaleString()}`}
            over={prompt.length > maxPrompt}
          >
            <textarea
              className="indic"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value.slice(0, maxPrompt))}
              placeholder="e.g. Today I want to explain the difference between candlestick patterns and chart patterns, and why beginners confuse the two."
              rows={compact ? 6 : 7}
              style={{
                width: "100%", boxSizing: "border-box", fontSize: 14.5, fontFamily: "inherit",
                color: "var(--ink)", padding: "12px 13px", borderRadius: 10,
                border: "1px solid var(--line)", background: "var(--card)",
                outline: "none", resize: "vertical", lineHeight: 1.65, minHeight: 130,
              }}
            />
          </Field>

          {/* ── The grounding switch ────────────────────────────────────────
              Off by default, because most ideas are explainers, opinion or a
              story, and searching the news for those finds somebody else's
              article and pulls the draft towards it. On, it is the same
              research the feed does, aimed at one brief.

              Its copy no longer promises a script written from the brief
              alone, because that is no longer what happens either way: with
              coverage we write from sources, without it we draft and the
              creator checks. Saying so here is what stops the review step
              arriving as a surprise. */}
          <button
            onClick={() => setLookup((v) => !v)}
            aria-pressed={lookup}
            className="hg-pick"
            style={{
              display: "flex", alignItems: "flex-start", gap: 10, width: "100%",
              textAlign: "left", padding: "11px 13px", borderRadius: 10, cursor: "pointer",
              border: `1px solid ${lookup ? "var(--ink)" : "var(--line)"}`,
              background: lookup ? "var(--made-tint)" : "var(--card)",
              marginBottom: 18,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 16, height: 16, borderRadius: 5, flexShrink: 0, marginTop: 2,
                border: `1.5px solid ${lookup ? "var(--ink)" : "#C6C6C6"}`,
                background: lookup ? "var(--ink)" : "transparent",
                color: "#fff", fontSize: 11, lineHeight: "13px", textAlign: "center",
              }}
            >
              {lookup ? "✓" : ""}
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
                Look for real coverage first
                <span style={{ fontWeight: 500, color: "var(--ink-mute)" }}> · +{lookupCredits} cr</span>
              </span>
              <span style={{ display: "block", fontSize: 12.5, color: "var(--ink-mute)", lineHeight: 1.55, marginTop: 2 }}>
                Worth it for anything in the news, so the numbers come from real
                articles you can check. Only charged if we find something; if we
                don't, you'll get a draft to edit instead.
              </span>
            </span>
          </button>

          <button
            onClick={prepare}
            disabled={!hasPrompt || preparing}
            className={hasPrompt && !preparing ? "hg-btn-primary" : undefined}
            style={{
              fontSize: 14, fontWeight: 600, padding: "12px 20px", borderRadius: 11,
              border: hasPrompt ? "none" : "1px solid #DCDCDC",
              background: hasPrompt ? "var(--primary)" : "#EDEDED",
              color: hasPrompt ? "#fff" : "#5F5F5F",
              cursor: hasPrompt && !preparing ? "pointer" : "default",
              opacity: preparing ? 0.55 : 1,
            }}
          >
            {preparing ? (lookup ? "Looking it up…" : "Drafting…") : "Continue"}
          </button>

          <p style={{ fontSize: 12.5, color: "var(--ink-mute)", margin: "9px 0 0", lineHeight: 1.6 }}>
            This step is free. The script is charged next, by length, and the
            lookup only if it finds something.
          </p>
        </>
      )}

      {/* ── Step 2: check the draft ──────────────────────────────────────── */}
      {reviewing && (
        <DraftReview
          // Reopening shows what they APPROVED, not the original proposal.
          // Handing back the model's first attempt would silently discard the
          // corrections they came back to extend.
          draft={reopened && source.text ? source.text : source.draft}
          onConfirm={confirm}
          onRedraft={rewrite}
          onBack={reopened ? () => setReopened(false) : reset}
          backLabel={reopened ? "Cancel" : "Change the idea"}
          busy={confirming}
          redrafting={redrafting}
          error={draftError}
          compact={compact}
          maxChars={maxText}
        />
      )}

      {/* ── Step 3: order it ─────────────────────────────────────────────── */}
      {orderable && (
        <>
          <div style={{ marginBottom: 4 }}>
            <SourceCard source={source} compact={compact} onChange={reset} />
            <div
              className="indic"
              style={{
                marginTop: 10, padding: "12px 14px", borderRadius: 10,
                border: "1px solid var(--line)", background: "var(--card)",
                fontSize: 13.5, lineHeight: 1.68, color: "var(--ink-body)",
                whiteSpace: "pre-wrap", wordBreak: "break-word",
                // Long approved drafts run to several hundred words, and a wall
                // of text between the card and the price would push the thing
                // they came here to do off the screen. They have just finished
                // reading it; this is a reminder, not the document.
                maxHeight: 200, overflowY: "auto",
              }}
            >
              {source.text || source.prompt}
            </div>

            {source.draft_approved_at && (
              <button
                onClick={() => setReopened(true)}
                style={{
                  background: "none", border: "none", padding: "8px 0 0", font: "inherit",
                  fontSize: 12.5, color: "var(--ink)", fontWeight: 600,
                  textDecoration: "underline", cursor: "pointer",
                }}
              >
                Edit this
              </button>
            )}
          </div>

          <ScriptPanel
            sourceId={source.id}
            voice={voice}
            onVoiceChange={onVoiceChange}
            onGoTranscribe={onGoTranscribe}
            compact={compact}
            writingNote={
              source.lookup_used
                ? "Reading what we found, then drafting. Around half a minute."
                : "Writing it in your voice. Around half a minute."
            }
          />
        </>
      )}
    </Column>
  );
}

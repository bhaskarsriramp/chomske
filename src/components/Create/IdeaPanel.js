import { useState, useMemo } from "react";
import api, { errorMessage } from "../../api";
import ScriptPanel from "../Order/ScriptPanel";
import SourceCard from "./SourceCard";
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
 *           ship on Fridays." Facts do not come out of it, because there are
 *           none in it.
 *
 * Everything visible here, the heading, the placeholder, the line under the
 * lookup toggle, exists to keep those apart.
 *
 * ── AND THE PROMISE IT HAS TO KEEP ───────────────────────────────────────────
 * The rest of this product guarantees that every claim in a script traces to a
 * source. A free-form brief has no sources, and the obvious reading of "write
 * me something about X" is "use what you know", which is the one thing that
 * must not happen: a creator reading an invented statistic aloud, in their own
 * voice, to their own audience, is the worst outcome available here, and it
 * does not become safe because they chose the topic.
 *
 * So there are two honest modes and the screen says which one is running:
 *   off   their words, their argument, their voice. No facts added. Ever.
 *   on    we go and find real coverage first, and the strict fact rule applies
 *         to that, exactly as it does on Discover.
 *
 * The lookup runs during the free preview, so "we found nothing, we'll write
 * from your brief and you won't be charged for the lookup" is something the
 * creator learns before they commit rather than after.
 */
export default function IdeaPanel({ voice, onVoiceChange, onGoTranscribe, compact, limits }) {
  const maxPrompt = limits?.max_prompt_chars ?? 2000;
  const lookupCredits = limits?.lookup_credits ?? 10;

  const [prompt, setPrompt] = useState("");
  const [lookup, setLookup] = useState(false);

  const [source, setSource] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");

  // Same staleness rule as Import: a prepared brief that no longer matches what
  // is in the box would price and write the previous version. The lookup flag is
  // part of the key because turning it on is a different order, not a display
  // preference: it changes what gets read and what the script may claim.
  const inputsKey = useMemo(() => JSON.stringify([prompt.trim(), lookup]), [prompt, lookup]);
  const [readKey, setReadKey] = useState("");
  const ready = source && readKey === inputsKey;

  const hasPrompt = prompt.trim().length > 0;

  async function prepare() {
    if (!hasPrompt || preparing) return;
    setPreparing(true);
    setError("");
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

  return (
    <Column compact={compact}>
      <Heading
        title="Idea"
        blurb="Tell us what you want the video to be about, the way you'd explain it to someone. We'll write it at the length you pick, in your voice."
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

      {ready ? (
        <div style={{ marginBottom: 4 }}>
          <SourceCard
            source={source}
            compact={compact}
            onChange={() => { setSource(null); setReadKey(""); }}
          />
          <div
            className="indic"
            style={{
              marginTop: 10, padding: "11px 13px", borderRadius: 10,
              border: "1px solid var(--line)", background: "var(--card)",
              fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-body)",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}
          >
            {source.prompt}
          </div>
        </div>
      ) : (
        <>
          <Field
            label="What's the video about?"
            hint="Your take, your argument, your announcement, a story you want to tell. The more you say, the more it sounds like you."
            count={`${prompt.length.toLocaleString()} / ${maxPrompt.toLocaleString()}`}
            over={prompt.length > maxPrompt}
          >
            <textarea
              className="indic"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value.slice(0, maxPrompt))}
              placeholder="e.g. Why every small creator should stop chasing trends and pick one topic. My take: consistency beats reach in the first year, and I want to explain why with what happened on my own channel."
              rows={compact ? 6 : 7}
              style={{
                width: "100%", boxSizing: "border-box", fontSize: 14.5, fontFamily: "inherit",
                color: "var(--ink)", padding: "12px 13px", borderRadius: 10,
                border: "1px solid var(--line)", background: "var(--card)",
                outline: "none", resize: "vertical", lineHeight: 1.65, minHeight: 130,
              }}
            />
          </Field>

          {/* ── The grounding switch ──────────────────────────────────────────
              Off by default, because most Ideas are opinion, advice or a story,
              and searching the news for those finds somebody else's article and
              pulls the script towards it. On, it is the same research the feed
              does, aimed at one brief. */}
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
                Look it up first
                <span style={{ fontWeight: 500, color: "var(--ink-mute)" }}> · +{lookupCredits} cr</span>
              </span>
              <span style={{ display: "block", fontSize: 12.5, color: "var(--ink-mute)", lineHeight: 1.55, marginTop: 2 }}>
                For anything in the news. We find real coverage and write from
                that, so the numbers are checkable. Only charged if we find
                something.
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
            {preparing ? (lookup ? "Looking it up…" : "Setting up…") : "Continue"}
          </button>

          {/* ── THE SENTENCE THAT PREVENTS THE SUPPORT TICKET ────────────────
              Without it, a creator asking for "a video about today's market
              close" with the lookup off gets a script that is entirely their
              own framing and no numbers, and reasonably concludes the product
              is broken. Said here, at the moment of the decision, it is
              instead the product being clear about what it will and will not
              make up. */}
          <p style={{ fontSize: 12.5, color: "var(--ink-mute)", margin: "9px 0 0", lineHeight: 1.6 }}>
            {lookup
              ? "Free to check. You'll see what we found, and what it costs, before you write anything."
              : "We'll write only from what you type here, and won't add facts, numbers or news of our own. Covering something that happened? Tick the box above, or use Import."}
          </p>
        </>
      )}

      {ready && (
        <ScriptPanel
          sourceId={source.id}
          voice={voice}
          onVoiceChange={onVoiceChange}
          onGoTranscribe={onGoTranscribe}
          compact={compact}
          writingNote={
            source.lookup_used
              ? "Reading what we found, then drafting. Around half a minute."
              : "Drafting in your voice. Around half a minute."
          }
        />
      )}
    </Column>
  );
}

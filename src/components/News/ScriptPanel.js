import { useState, useEffect, useRef, useCallback } from "react";
import api, { errorMessage } from "../../api";
import ScriptOrder from "./ScriptOrder";
import { useCredits } from "../../state/CreditsContext";
import { useProfiles } from "../../state/ProfileContext";

/**
 * Turn the selected story into a script in the creator's own voice.
 *
 * Async and polled, matching /transcribe: writing takes long enough that holding
 * the request open loses to proxy timeouts, and the first script for a new user
 * also pays for building their voice profile.
 *
 * The panel is deliberately honest about how much voice it actually has. A profile
 * learned from one video is a hint, not a voice, and saying so is what stops a
 * thin first result from reading as "this product doesn't work".
 */
export default function ScriptPanel({ storyId, voice, onVoiceChange, onGoTranscribe, compact }) {
  const [script, setScript] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // The balance lives in one place for the whole app (see CreditsContext) — it
  // is shown in the sidebar and the mobile header at the same time as here, and
  // three components each holding their own copy is three numbers that drift.
  const { setBalance, refresh: refreshCredits } = useCredits();
  const { activeId: profileId } = useProfiles();

  const pollRef = useRef(null);

  // A script belongs to one story. Switching stories must clear the last result
  // and stop its poll, or the previous script sits under the new headline.
  useEffect(() => {
    clearInterval(pollRef.current);
    setScript(null);
    setError("");
    setCopied(false);
    setBusy(false);
  }, [storyId]);

  useEffect(() => () => clearInterval(pollRef.current), []);

  const startPolling = useCallback((id) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/script/${id}`);
        setScript(data.script);
        if (data.script.status !== "processing") {
          clearInterval(pollRef.current);
          setBusy(false);
          // The first run builds the voice profile as a side effect — refresh the
          // header so it stops saying "no voice yet".
          onVoiceChange?.();
          // A failed script is refunded (routes/script.js), and so is an add-on
          // that could not be produced. Either way the balance we charged on
          // the way in is no longer the right one.
          refreshCredits();
        }
      } catch (err) {
        clearInterval(pollRef.current);
        setBusy(false);
        setError(errorMessage(err, "Lost track of that script. Try again."));
      }
    }, 2500);
  }, [onVoiceChange, refreshCredits]);

  /**
   * @param {object} order  { seconds, english, packaging } — what they chose in
   *   ScriptOrder. Absent on a regenerate, which repeats the original order.
   */
  async function generate(force = false, order = null) {
    if (busy) return;
    setError("");
    setCopied(false);
    setBusy(true);
    try {
      // The voice is sent explicitly rather than left to the server's default.
      // The creator picked it in the order panel a second ago, and having the
      // server guess at that point is how a story gets written in the wrong
      // voice and charged for.
      const body = { news_id: storyId, force, profile_id: profileId || undefined };
      if (order) {
        body.seconds = order.seconds;
        body.english = order.english;
        body.packaging = order.packaging;
      } else if (script?.duration_seconds) {
        // A regenerate repeats what was bought the first time, including the
        // add-ons — it is a redo, not a downgrade, and it is charged again.
        body.seconds = script.duration_seconds;
        body.english = !!script.english_text;
        body.packaging = !!script.description;
      }

      const { data } = await api.post("/script", body);
      setScript(data.script);
      if (typeof data.balance === "number") setBalance(data.balance);
      if (data.script.status === "processing") startPolling(data.script.id);
      else { setBusy(false); onVoiceChange?.(); refreshCredits(); }
    } catch (err) {
      setBusy(false);
      if (err?.response?.data?.needs_transcript) {
        setError("");
        setScript({ status: "needs_voice" });
        return;
      }
      // Not an error worth a red box: they simply need to top up, and
      // ScriptOrder already shows the balance and the buy button. Surfacing it
      // twice reads as something having gone wrong.
      if (err?.response?.data?.insufficient_credits) {
        setBalance(err.response.data.balance);
        return;
      }
      setError(errorMessage(err));
    }
  }

  function copyScript() {
    if (!script?.text) return;
    navigator.clipboard.writeText(script.text).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => setError("Couldn't copy. Select the text and copy it manually.")
    );
  }

  const hasVoice = !!voice?.profile;

  return (
    <section style={{ marginTop: 28, paddingTop: 22, borderTop: "1px solid var(--line)" }}>
      {/* Just the heading. The balance moved to the sidebar card, where it is on
          screen permanently instead of only while this section is; and the
          language chip went with it — the order panel below already says which
          voice is writing, and the finished script's own header repeats the
          language. Three copies of one fact is noise, not reassurance. */}
      <h3
        style={{
          fontSize: 11.5, fontWeight: 600, letterSpacing: "0.13em",
          textTransform: "uppercase", color: "var(--ink-mute)", margin: "0 0 13px",
        }}
      >
        Your script
      </h3>

      {error && (
        <div
          role="alert"
          style={{
            padding: "12px 14px", borderRadius: 10, marginBottom: 12,
            background: "#FCE8E6", border: "1px solid #F5C7C3",
            color: "var(--bad)", fontSize: 13.5, lineHeight: 1.55,
          }}
        >
          {error}
        </div>
      )}

      {/* No transcripts yet — the voice has nothing to be learned from. */}
      {(script?.status === "needs_voice" || (!hasVoice && voice && voice.transcripts_available === 0)) && (
        <NeedsVoice onGoTranscribe={onGoTranscribe} />
      )}

      {!script && (hasVoice || voice?.transcripts_available > 0) && (
        <div>
          <ScriptOrder busy={busy} onGenerate={(order) => generate(false, order)} />
          {!hasVoice && (
            <p style={{ fontSize: 12.5, color: "var(--ink-mute)", margin: "9px 0 0", lineHeight: 1.6 }}>
              First run also learns your voice from your {voice.transcripts_available === 1 ? "video" : "videos"}, so it takes a little longer.
            </p>
          )}
        </div>
      )}

      {script?.status === "processing" && <Writing />}

      {script?.status === "failed" && (
        <div
          style={{
            padding: 16, borderRadius: 12,
            background: "#FCE8E6", border: "1px solid #F5C7C3",
          }}
        >
          <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--bad)", marginBottom: 5 }}>
            Couldn't write this one
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-body)" }}>
            {script.error || "Something went wrong."}
          </div>
          <button
            onClick={() => generate(true)}
            className="hg-btn-ghost"
            style={{
              marginTop: 12, fontSize: 13, fontWeight: 600, padding: "8px 14px",
              borderRadius: 9, border: "1px solid var(--line)", background: "var(--card)",
              color: "var(--ink-body)", cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      )}

      {script?.status === "done" && (
        <Result
          script={script}
          compact={compact}
          copied={copied}
          onCopy={copyScript}
          onRegenerate={() => generate(true)}
          busy={busy}
        />
      )}
    </section>
  );
}

/* ── Pieces ────────────────────────────────────────────────────────────── */

/** "8 min", "90s" — the duration they ordered, shown as they chose it. */
function fmtDuration(seconds) {
  const s = Number(seconds) || 0;
  return s >= 120 ? `${Math.round(s / 60)} min` : `${s}s`;
}

/**
 * A labelled block inside the upload package, with its own copy button.
 *
 * Per-field rather than one "copy everything": the description and the hashtags
 * go into different boxes on the upload form, so a single blob would just make
 * them paste it once and then edit it back apart.
 */
function Field({ label, copy, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>{label}</span>
        {copy && <CopyButton text={copy} label="Copy" />}
      </div>
      {children}
    </div>
  );
}

function CopyButton({ text, label = "Copy" }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(
          () => { setDone(true); setTimeout(() => setDone(false), 2000); },
          () => {}
        );
      }}
      className="hg-btn-ghost"
      style={{
        fontSize: 12, fontWeight: 600, padding: "5px 11px", borderRadius: 8,
        border: "1px solid var(--line)", background: "var(--card)",
        color: done ? "var(--ok)" : "var(--ink-mute)", cursor: "pointer", flexShrink: 0,
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}

function NeedsVoice({ onGoTranscribe }) {
  return (
    <div
      style={{
        padding: "20px 18px", borderRadius: 12,
        // Was #F9F9F9 on a white pane, which is a two-percent difference: the
        // card had no edges and read as a paragraph nobody had styled. This is
        // the one blocking step between a new account and the whole product, so
        // it should look like a thing to act on, not like body copy.
        background: "#EFEDE9", border: "1px solid #DDD9D2",
      }}
    >
      <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>
        Add a video first
      </div>
      <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--ink-body)", margin: "0 0 14px" }}>
        Your voice is learned from your own videos, how you open, the words you keep in
        English, how you sign off. Add one under My voice and this can write in it.
      </p>
      <button
        onClick={onGoTranscribe}
        className="hg-btn-primary"
        style={{
          fontSize: 13, fontWeight: 600, padding: "10px 16px", borderRadius: 10,
          border: "none", background: "var(--primary)", color: "#fff",
          cursor: "pointer",
        }}
      >
        Go to My voice
      </button>
    </div>
  );
}

function Writing() {
  return (
    <div
      style={{
        padding: 20, borderRadius: 12, background: "var(--card)",
        border: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 13,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 17, height: 17, borderRadius: "50%",
          border: "2px solid var(--line)", borderTopColor: "var(--made)",
          animation: "hg-spin .8s linear infinite", flexShrink: 0,
        }}
      />
      <div>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)" }}>Writing in your voice…</div>
        <div style={{ fontSize: 12.5, color: "var(--ink-mute)", marginTop: 3 }}>
          Reading the coverage, then drafting. Around half a minute.
        </div>
      </div>
    </div>
  );
}

function Result({ script, compact, copied, onCopy, onRegenerate, busy }) {
  return (
    <div className="hg-rise">
      <div
        style={{
          background: "var(--card)", border: "1px solid var(--line)",
          borderRadius: "var(--radius)", overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 10, flexWrap: "wrap", padding: "11px 15px",
            // The one card in the app that is the finished thing. A faint wash
            // of the "you made this" hue marks it as the payoff without turning
            // the script itself into a coloured box.
            borderBottom: "1px solid var(--made-line)", background: "var(--made-tint)",
          }}
        >
          <span style={{ fontSize: 12, color: "var(--ink-mute)" }}>
            {script.language_label || "Your voice"}
            {script.duration_seconds ? ` · ${fmtDuration(script.duration_seconds)}` : ""}
            {script.voice_confidence === "thin" && " · learned from one video"}
          </span>
          <div style={{ display: "flex", gap: 7 }}>
            <button
              onClick={onRegenerate}
              disabled={busy}
              className="hg-btn-ghost"
              style={{
                fontSize: 12.5, fontWeight: 600, padding: "6px 12px", borderRadius: 9,
                border: "1px solid var(--line)", background: "var(--card)",
                color: "var(--ink-mute)", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
              }}
            >
              Rewrite
            </button>
            <button
              onClick={onCopy}
              className="hg-btn-ghost"
              style={{
                fontSize: 12.5, fontWeight: 600, padding: "6px 12px", borderRadius: 9,
                border: "1px solid var(--line)", background: "var(--card)",
                color: copied ? "var(--ok)" : "var(--ink-body)", cursor: "pointer",
              }}
            >
              {copied ? "Copied" : "Copy script"}
            </button>
          </div>
        </div>

        <div
          className="indic"
          style={{
            padding: compact ? 17 : 22,
            fontSize: compact ? 15.5 : 16.5,
            color: "var(--ink)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {script.text}
        </div>
      </div>

      {/* ── The English twin ─────────────────────────────────────────────────
          A second card rather than a tab: they paid for two scripts and both
          should be visible and copyable without hunting for the other one. */}
      {script.english_text && (
        <div
          style={{
            marginTop: 14, background: "var(--card)", border: "1px solid var(--line)",
            borderRadius: "var(--radius)", overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 10, flexWrap: "wrap", padding: "11px 15px",
              borderBottom: "1px solid var(--line)", background: "var(--paper)",
            }}
          >
            <span style={{ fontSize: 12, color: "var(--ink-mute)" }}>
              English · for a global audience
            </span>
            <CopyButton text={script.english_text} label="Copy English" />
          </div>
          <div
            style={{
              padding: compact ? 17 : 22, fontSize: compact ? 15 : 16,
              color: "var(--ink)", whiteSpace: "pre-wrap", wordBreak: "break-word",
              lineHeight: 1.75,
            }}
          >
            {script.english_text}
          </div>
        </div>
      )}

      {/* ── The upload package ─────────────────────────────────────────────── */}
      {(script.description || script.hashtags?.length > 0 || script.thumbnail_lines?.length > 0) && (
        <div
          style={{
            marginTop: 14, padding: compact ? 15 : 18,
            background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--radius)",
          }}
        >
          <div
            style={{
              fontSize: 11, fontWeight: 600, letterSpacing: "0.1em",
              textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 12,
            }}
          >
            Ready to upload
          </div>

          {script.description && (
            <Field label="Description" copy={script.description}>
              <div style={{ fontSize: 13.5, lineHeight: 1.7, color: "var(--ink-body)", whiteSpace: "pre-wrap" }}>
                {script.description}
              </div>
            </Field>
          )}

          {script.hashtags?.length > 0 && (
            <Field label="Hashtags" copy={script.hashtags.map((h) => `#${h}`).join(" ")}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {script.hashtags.map((h) => (
                  <span
                    key={h}
                    className="indic"
                    style={{
                      fontSize: 12, padding: "4px 9px", borderRadius: 999,
                      background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink-body)",
                    }}
                  >
                    #{h}
                  </span>
                ))}
              </div>
            </Field>
          )}

          {script.thumbnail_lines?.length > 0 && (
            <Field label="Thumbnail text">
              <div style={{ display: "grid", gap: 6 }}>
                {script.thumbnail_lines.map((t) => (
                  <div
                    key={t}
                    className="indic"
                    style={{
                      fontSize: 15, fontWeight: 700, color: "var(--ink)",
                      padding: "8px 11px", borderRadius: 8,
                      background: "var(--paper)", border: "1px solid var(--line)",
                    }}
                  >
                    {t}
                  </div>
                ))}
              </div>
            </Field>
          )}
        </div>
      )}

      {script.title_suggestions?.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              fontSize: 11, fontWeight: 600, letterSpacing: "0.12em",
              textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 8,
            }}
          >
            Title ideas
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {script.title_suggestions.map((t, i) => (
              <div
                key={i}
                className="indic"
                style={{
                  fontSize: 14, lineHeight: 1.5, color: "var(--ink-body)",
                  padding: "9px 12px", borderRadius: 9,
                  background: "var(--card)", border: "1px solid var(--line)",
                }}
              >
                {t}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Facts came from these. A creator about to say this out loud should be
          able to check it in one click. */}
      {script.sources_used?.length > 0 && (
        <p style={{ fontSize: 12, color: "var(--ink-mute)", margin: "12px 0 0", lineHeight: 1.6 }}>
          Written from {script.sources_used.length} source
          {script.sources_used.length === 1 ? "" : "s"} listed above. Check any number before you say it.
        </p>
      )}
    </div>
  );
}

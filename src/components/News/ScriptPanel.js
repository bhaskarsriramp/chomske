import { useState, useEffect, useRef, useCallback } from "react";
import api, { errorMessage } from "../../api";

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
        }
      } catch (err) {
        clearInterval(pollRef.current);
        setBusy(false);
        setError(errorMessage(err, "Lost track of that script. Try again."));
      }
    }, 2500);
  }, [onVoiceChange]);

  async function generate(force = false) {
    if (busy) return;
    setError("");
    setCopied(false);
    setBusy(true);
    try {
      const { data } = await api.post("/script", { news_id: storyId, force });
      setScript(data.script);
      if (data.script.status === "processing") startPolling(data.script.id);
      else { setBusy(false); onVoiceChange?.(); }
    } catch (err) {
      setBusy(false);
      if (err?.response?.data?.needs_transcript) {
        setError("");
        setScript({ status: "needs_voice" });
        return;
      }
      setError(errorMessage(err));
    }
  }

  function copyScript() {
    if (!script?.text) return;
    navigator.clipboard.writeText(script.text).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => setError("Couldn't copy — select the text and copy it manually.")
    );
  }

  const hasVoice = !!voice?.profile;

  return (
    <section style={{ marginTop: 28, paddingTop: 22, borderTop: "1px solid var(--line)" }}>
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, flexWrap: "wrap", marginBottom: 13,
        }}
      >
        <h3
          style={{
            fontSize: 11.5, fontWeight: 600, letterSpacing: "0.13em",
            textTransform: "uppercase", color: "var(--ink-mute)", margin: 0,
          }}
        >
          Your script
        </h3>
        {hasVoice && <VoiceChip voice={voice} />}
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: "12px 14px", borderRadius: 10, marginBottom: 12,
            background: "#FDF1EE", border: "1px solid #F3D6CE",
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
          <button
            onClick={() => generate(false)}
            disabled={busy}
            className="hg-btn-primary"
            style={{
              fontSize: 14, fontWeight: 600, padding: "12px 20px", borderRadius: 11,
              border: "none", background: "var(--accent)", color: "#fff",
              cursor: busy ? "default" : "pointer", opacity: busy ? 0.65 : 1,
            }}
          >
            {busy ? "Writing…" : "Write this in my voice"}
          </button>
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
            background: "#FDF1EE", border: "1px solid #F3D6CE",
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

function VoiceChip({ voice }) {
  const p = voice.profile;
  const n = p.transcript_count || 0;
  const tone =
    p.confidence === "good"
      ? { color: "var(--ok)", bg: "#EDF7F1", border: "#CFE8DA" }
      : p.confidence === "fair"
      ? { color: "var(--accent)", bg: "var(--accent-soft)", border: "#F6DDCE" }
      : { color: "var(--ink-mute)", bg: "#F5F2ED", border: "var(--line)" };

  return (
    <span
      title={`Voice learned from ${n} video${n === 1 ? "" : "s"}`}
      style={{
        fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 999,
        color: tone.color, background: tone.bg, border: `1px solid ${tone.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {p.language_label || "Your voice"} · {n} video{n === 1 ? "" : "s"}
    </span>
  );
}

function NeedsVoice({ onGoTranscribe }) {
  return (
    <div
      style={{
        padding: "20px 18px", borderRadius: 12,
        background: "#FCFBF9", border: "1px dashed var(--line)",
      }}
    >
      <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>
        Transcribe a video first
      </div>
      <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--ink-body)", margin: "0 0 14px" }}>
        Your voice is learned from your own videos, how you open, the words you keep in
        English, how you sign off. Run one through Transcribe and this can write in it.
      </p>
      <button
        onClick={onGoTranscribe}
        className="hg-btn-ghost"
        style={{
          fontSize: 13, fontWeight: 600, padding: "9px 15px", borderRadius: 10,
          border: "1px solid var(--line)", background: "var(--card)",
          color: "var(--ink-body)", cursor: "pointer",
        }}
      >
        Go to Transcribe
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
          border: "2px solid var(--line)", borderTopColor: "var(--accent)",
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
            borderBottom: "1px solid var(--line)", background: "#FCFBF9",
          }}
        >
          <span style={{ fontSize: 12, color: "var(--ink-mute)" }}>
            {script.language_label || "Your voice"}
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

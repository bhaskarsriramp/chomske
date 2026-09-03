import { useState, useEffect, useRef, useCallback } from "react";
import api, { errorMessage } from "../../api";
import useIsMobile from "../../hooks/useIsMobile";

/**
 * Paste a video, get back what was said — in the language it was spoken in.
 *
 * Transcription is async on the server (a long video outlives an HTTP request),
 * so this posts once and polls the row until it stops being "processing". The
 * interval is cleared on unmount and on completion; a stray one here would keep
 * hitting the API from a screen nobody is looking at.
 *
 * On desktop the past transcripts sit in their own rail rather than below the
 * result, so switching between two videos doesn't mean scrolling past a
 * thousand words of the first one.
 */
export default function TranscribePanel({ onQuota }) {
  const isPhone = useIsMobile(680);
  const isNarrow = useIsMobile(1100);

  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [active, setActive] = useState(null);
  const [history, setHistory] = useState([]);
  const [copied, setCopied] = useState(false);

  const pollRef = useRef(null);

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await api.get("/transcribe", { params: { limit: 20 } });
      setHistory(data.transcripts || []);
      onQuota?.(data.quota || null);
    } catch { /* history is secondary — never block the main flow on it */ }
  }, [onQuota]);

  useEffect(() => { loadHistory(); }, [loadHistory]);
  useEffect(() => () => clearInterval(pollRef.current), []);

  const startPolling = useCallback((id) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/transcribe/${id}`);
        const t = data.transcript;
        setActive(t);
        if (t.status !== "processing") {
          clearInterval(pollRef.current);
          loadHistory();
        }
      } catch (err) {
        clearInterval(pollRef.current);
        setError(errorMessage(err, "Lost track of that transcription. Try opening it from the list."));
      }
    }, 3000);
  }, [loadHistory]);

  async function handleSubmit(e) {
    e?.preventDefault();
    if (submitting) return;
    setError("");
    setCopied(false);

    const value = url.trim();
    if (!value) return setError("Paste a YouTube link first.");

    setSubmitting(true);
    try {
      const { data } = await api.post("/transcribe", { url: value });
      const t = data.transcript;
      setActive(t);
      setUrl("");
      if (t.status === "processing") startPolling(t.id);
      else loadHistory();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function openFromHistory(item) {
    setError("");
    setCopied(false);
    setActive(item);
    if (item.status === "processing") startPolling(item.id);
  }

  function copyText() {
    if (!active?.text) return;
    navigator.clipboard.writeText(active.text).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => setError("Couldn't copy — select the text and copy it manually.")
    );
  }

  const gut = isPhone ? 16 : 26;

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0, width: "100%" }}>
      <section
        className="hg-scroll"
        style={{
          flex: "1 1 0", minWidth: 0, minHeight: 0,
          padding: `${isPhone ? 18 : 26}px ${gut}px ${isPhone ? 40 : 60}px`,
        }}
      >
        <h1
          style={{
            fontSize: isPhone ? 20 : 23, fontWeight: 750, letterSpacing: "-0.03em",
            color: "var(--ink)", margin: "0 0 5px",
          }}
        >
          Paste a video
        </h1>
        <p style={{ fontSize: isPhone ? 14 : 14.5, color: "var(--ink-body)", margin: "0 0 18px" }}>
          Any public YouTube link. The transcript comes back in the language it was spoken in.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: isPhone ? "column" : "row", gap: 9 }}>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            aria-label="YouTube video URL"
            disabled={submitting}
            style={{
              flex: 1, minWidth: 0, fontSize: 14.5, padding: "13px 15px",
              border: "1px solid var(--line)", borderRadius: 11,
              background: "var(--card)", color: "var(--ink)", outline: "none",
            }}
          />
          <button
            type="submit"
            className="hg-btn-primary"
            disabled={submitting}
            style={{
              fontSize: 14.5, fontWeight: 600, padding: "13px 22px", borderRadius: 11,
              border: "none", background: "var(--accent)", color: "#fff",
              cursor: submitting ? "default" : "pointer",
              opacity: submitting ? 0.65 : 1, whiteSpace: "nowrap",
            }}
          >
            {submitting ? "Starting…" : "Transcribe"}
          </button>
        </form>

        {error && (
          <div
            role="alert"
            style={{
              marginTop: 13, padding: "12px 14px", borderRadius: 10,
              background: "#FDF1EE", border: "1px solid #F3D6CE",
              color: "var(--bad)", fontSize: 13.5, lineHeight: 1.55,
            }}
          >
            {error}
          </div>
        )}

        {active && (
          <Result
            t={active}
            isPhone={isPhone}
            onCopy={copyText}
            copied={copied}
            onRetry={() => { setUrl(active.url); setActive(null); }}
          />
        )}

        {/* Below the split point the rail has nowhere to live, so past
            transcripts fall in under the result. */}
        {isNarrow && history.length > 0 && (
          <div style={{ marginTop: 36 }}>
            <RailHeading>Recent</RailHeading>
            <HistoryList items={history} activeId={active?.id} onOpen={openFromHistory} />
          </div>
        )}
      </section>

      {!isNarrow && (
        <aside
          className="hg-scroll"
          style={{
            flex: "0 0 clamp(280px, 24%, 400px)", minHeight: 0,
            borderLeft: "1px solid var(--line)", background: "var(--paper)",
            padding: "26px 20px 60px",
          }}
        >
          <RailHeading>Recent</RailHeading>
          {history.length ? (
            <HistoryList items={history} activeId={active?.id} onOpen={openFromHistory} />
          ) : (
            <p style={{ fontSize: 13, color: "var(--ink-mute)", lineHeight: 1.6, margin: 0 }}>
              Videos you transcribe will collect here.
            </p>
          )}
        </aside>
      )}
    </div>
  );
}

/* ── Pieces ────────────────────────────────────────────────────────────── */

function RailHeading({ children }) {
  return (
    <h2
      style={{
        fontSize: 11.5, fontWeight: 600, letterSpacing: "0.13em",
        textTransform: "uppercase", color: "var(--ink-mute)", margin: "0 0 11px",
      }}
    >
      {children}
    </h2>
  );
}

function Result({ t, isPhone, onCopy, copied, onRetry }) {
  if (t.status === "processing") return <Processing />;

  if (t.status === "failed") {
    return (
      <div
        style={{
          marginTop: 22, padding: 19, borderRadius: "var(--radius)",
          background: "#FDF1EE", border: "1px solid #F3D6CE",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--bad)", marginBottom: 6 }}>
          Couldn't read this video
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-body)" }}>
          {t.error || "Something went wrong."}
        </div>
        <button
          onClick={onRetry}
          className="hg-btn-ghost"
          style={{
            marginTop: 13, fontSize: 13, fontWeight: 600, padding: "8px 14px",
            borderRadius: 9, border: "1px solid var(--line)", background: "var(--card)",
            color: "var(--ink-body)", cursor: "pointer",
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div
      className="hg-rise"
      style={{
        marginTop: 24, background: "var(--card)", border: "1px solid var(--line)",
        borderRadius: "var(--radius)", overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, flexWrap: "wrap", padding: "13px 17px",
          borderBottom: "1px solid var(--line)", background: "#FCFBF9",
        }}
      >
        <div style={{ minWidth: 0 }}>
          {t.title && (
            <div
              className="indic"
              style={{
                fontSize: 14.5, fontWeight: 600, color: "var(--ink)", lineHeight: 1.4,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {t.title}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: t.title ? 6 : 0 }}>
            {t.language_label && (
              <span
                style={{
                  fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999,
                  color: "var(--accent)", background: "var(--accent-soft)", border: "1px solid #F6DDCE",
                }}
              >
                {t.language_label}
              </span>
            )}
            <a
              href={t.url}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 12, color: "var(--ink-mute)", textDecoration: "none" }}
            >
              open on YouTube ↗
            </a>
          </div>
        </div>

        <button
          onClick={onCopy}
          className="hg-btn-ghost"
          style={{
            fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 9,
            border: "1px solid var(--line)", background: "var(--card)",
            color: copied ? "var(--ok)" : "var(--ink-body)", cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          {copied ? "Copied" : "Copy transcript"}
        </button>
      </div>

      <div
        className="indic"
        style={{
          padding: isPhone ? 18 : 26,
          fontSize: isPhone ? 15.5 : 16.5,
          color: "var(--ink)",
          whiteSpace: "pre-wrap",   // the model returns real paragraph breaks
          wordBreak: "break-word",
        }}
      >
        {t.text}
      </div>
    </div>
  );
}

function Processing() {
  return (
    <div
      style={{
        marginTop: 24, padding: 24, borderRadius: "var(--radius)",
        background: "var(--card)", border: "1px solid var(--line)",
        display: "flex", alignItems: "center", gap: 14,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 18, height: 18, borderRadius: "50%",
          border: "2px solid var(--line)", borderTopColor: "var(--accent)",
          animation: "hg-spin .8s linear infinite", flexShrink: 0,
        }}
      />
      <div>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)" }}>Listening to the video…</div>
        <div style={{ fontSize: 13, color: "var(--ink-mute)", marginTop: 3 }}>
          A few minutes for a long one. You can leave this page open.
        </div>
      </div>
    </div>
  );
}

function HistoryList({ items, activeId, onOpen }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {items.map((it) => {
        const on = it.id === activeId;
        return (
          <button
            key={it.id}
            onClick={() => onOpen(it)}
            className={on ? undefined : "hg-row"}
            style={{
              textAlign: "left", width: "100%", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
              padding: "11px 13px",
              background: on ? "#FBF6F1" : "var(--card)",
              border: `1px solid ${on ? "#EBD8C8" : "var(--line)"}`,
              borderLeft: `3px solid ${on ? "var(--accent)" : "transparent"}`,
              borderRadius: 10,
            }}
          >
            <span style={{ minWidth: 0, flex: 1 }}>
              <span
                className="indic"
                style={{
                  display: "block", fontSize: 13.5, fontWeight: 500, color: "var(--ink)",
                  lineHeight: 1.45,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                {it.title || it.url}
              </span>
              <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-mute)", marginTop: 3 }}>
                {new Date(it.created_at).toLocaleDateString()} · {it.language_label || "—"}
              </span>
            </span>
            <StatusTag status={it.status} />
          </button>
        );
      })}
    </div>
  );
}

function StatusTag({ status }) {
  const map = {
    done:       { label: "Ready",   color: "var(--ok)",     bg: "#EDF7F1",            border: "#CFE8DA" },
    processing: { label: "Working", color: "var(--accent)", bg: "var(--accent-soft)", border: "#F6DDCE" },
    failed:     { label: "Failed",  color: "var(--bad)",    bg: "#FDF1EE",            border: "#F3D6CE" },
  };
  const s = map[status] || map.processing;
  return (
    <span
      style={{
        fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 999,
        color: s.color, background: s.bg, border: `1px solid ${s.border}`,
        whiteSpace: "nowrap", flexShrink: 0,
      }}
    >
      {s.label}
    </span>
  );
}

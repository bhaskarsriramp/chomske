import { useState, useEffect, useCallback } from "react";
import api, { errorMessage } from "../../api";
import ScriptPanel from "./ScriptPanel";
import { sourceLabel, timeAgo, scoreStyle, buildBrief } from "./newsUtils";

/**
 * One story: what happened, the hook, and every outlet that carried it.
 *
 * The coverage list is the reason this exists. The feed answers "what should I
 * cover"; this answers "what actually happened" — oldest source first, so the
 * top row is whoever broke it, and a creator can read more than one account
 * before recording instead of paraphrasing a single headline.
 *
 * Renders in two shapes off the same data:
 *   pane  — the right half of the desktop split, always on screen
 *   sheet — a full-screen layer on phones, where a split has nowhere to go
 */
export default function StoryDetail({ id, preview, mode = "pane", onClose, voice, onVoiceChange, onGoTranscribe }) {
  // Seeded from the feed row so the header paints immediately; the request only
  // fills in coverage. Selecting a story should never flash an empty pane.
  const [item, setItem] = useState(preview || null);
  const [coverage, setCoverage] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setCopied(false);
    if (preview) setItem(preview);

    (async () => {
      try {
        const { data } = await api.get(`/news/${id}`);
        if (cancelled) return;
        setItem(data.item || preview || null);
        setCoverage(data.coverage || []);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, "Couldn't load the sources for this story."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // Stops a slow response for the previous story from overwriting the one the
    // user has since clicked — easy to hit when arrowing down the list.
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (mode !== "sheet") return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, onClose]);

  const copyBrief = useCallback(() => {
    if (!item) return;
    navigator.clipboard.writeText(buildBrief(item, coverage)).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => setError("Couldn't copy — select the text and copy it manually.")
    );
  }, [item, coverage]);

  if (!item) return null;

  const body = (
    <Body
      item={item}
      coverage={coverage}
      loading={loading}
      error={error}
      copied={copied}
      onCopy={copyBrief}
      onClose={mode === "sheet" ? onClose : null}
      compact={mode === "sheet"}
      voice={voice}
      onVoiceChange={onVoiceChange}
      onGoTranscribe={onGoTranscribe}
    />
  );

  if (mode === "sheet") {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
        className="hg-sheet-up"
        style={{
          position: "fixed", inset: 0, zIndex: 60,
          background: "var(--card)", display: "flex", flexDirection: "column",
        }}
      >
        {body}
      </div>
    );
  }

  return body;
}

/* ── Content ───────────────────────────────────────────────────────────── */

function Body({ item, coverage, loading, error, copied, onCopy, onClose, compact, voice, onVoiceChange, onGoTranscribe }) {
  const links = coverage.length
    ? coverage
    : [{ source: item.source, title: item.title, url: item.url, published_at: item.published_at }];

  return (
    <>
      <header
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, padding: compact ? "13px 18px" : "15px 26px",
          borderBottom: "1px solid var(--line)", background: "var(--card)", flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <ScorePill score={item.score} />
          <span
            style={{
              fontSize: 12.5, color: "var(--ink-mute)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {item.source_count > 1 ? `${item.source_count} sources` : sourceLabel(item.source)}
            {" · "}{timeAgo(item.first_seen_at)}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button
            onClick={onCopy}
            className="hg-btn-ghost"
            style={{
              fontSize: 13, fontWeight: 600, padding: "7px 13px", borderRadius: 9,
              border: "1px solid var(--line)", background: "var(--card)",
              color: copied ? "var(--ok)" : "var(--ink-body)", cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            {copied ? "Copied" : "Copy brief"}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close"
              className="hg-btn-ghost"
              style={{
                fontSize: 17, lineHeight: 1, padding: "6px 11px", borderRadius: 9,
                border: "1px solid var(--line)", background: "var(--card)",
                color: "var(--ink-mute)", cursor: "pointer",
              }}
            >
              ×
            </button>
          )}
        </div>
      </header>

      <div
        className="hg-scroll"
        style={{ flex: 1, minHeight: 0, padding: compact ? "22px 18px 60px" : "30px 26px 70px" }}
      >
        <h2
          style={{
            fontSize: compact ? 20 : 24, fontWeight: 700, lineHeight: 1.3,
            letterSpacing: "-0.025em", color: "var(--ink)", margin: "0 0 16px",
          }}
        >
          {item.title}
        </h2>

        {item.angle && (
          <div
            style={{
              padding: "15px 17px", borderRadius: 12,
              background: "var(--accent-soft)", border: "1px solid #F6DDCE", marginBottom: 16,
            }}
          >
            <div
              style={{
                fontSize: 10.5, fontWeight: 700, letterSpacing: "0.13em",
                textTransform: "uppercase", color: "var(--accent)", marginBottom: 7,
              }}
            >
              The angle
            </div>
            <div style={{ fontSize: compact ? 15 : 16, lineHeight: 1.6, color: "var(--ink)" }}>
              {item.angle}
            </div>
          </div>
        )}

        {item.summary && (
          <p style={{ fontSize: compact ? 14.5 : 15.5, lineHeight: 1.7, color: "var(--ink-body)", margin: "0 0 14px" }}>
            {item.summary}
          </p>
        )}

        {item.why && (
          <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--ink-mute)", margin: "0 0 26px" }}>
            <strong style={{ fontWeight: 600, color: "var(--ink-body)" }}>Scored {item.score}: </strong>
            {item.why}
          </p>
        )}

        {/* The deliverable comes before the evidence: writing is why anyone opened
            this story, and burying the button under eight coverage links would put
            the product's whole point below the fold. */}
        <ScriptPanel
          storyId={String(item.id)}
          voice={voice}
          onVoiceChange={onVoiceChange}
          onGoTranscribe={onGoTranscribe}
          compact={compact}
        />

        <div
          style={{
            display: "flex", alignItems: "baseline", justifyContent: "space-between",
            gap: 12, marginTop: 32,
            paddingBottom: 10, borderBottom: "1px solid var(--line)", marginBottom: 12,
          }}
        >
          <h3
            style={{
              fontSize: 11.5, fontWeight: 600, letterSpacing: "0.13em",
              textTransform: "uppercase", color: "var(--ink-mute)", margin: 0,
            }}
          >
            {loading ? "Sources" : `Sources · ${links.length}`}
          </h3>
          <span style={{ fontSize: 12, color: "var(--ink-mute)" }}>oldest first</span>
        </div>

        {error && (
          <div style={{ fontSize: 13.5, color: "var(--bad)", lineHeight: 1.6, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {loading ? (
          <SourceSkeleton />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {links.map((c, i) => (
              <a
                key={`${c.url}-${i}`}
                href={c.url}
                target="_blank"
                rel="noreferrer"
                className="hg-row"
                style={{
                  display: "block", padding: "12px 14px", borderRadius: 10,
                  border: "1px solid var(--line)", background: "var(--card)", textDecoration: "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>
                    {sourceLabel(c.source)}
                  </span>
                  {/* The API sorts by published_at ascending, so row zero broke it. */}
                  {i === 0 && links.length > 1 && (
                    <span
                      style={{
                        fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
                        textTransform: "uppercase", padding: "2px 7px", borderRadius: 999,
                        color: "var(--ok)", background: "#EDF7F1", border: "1px solid #CFE8DA",
                      }}
                    >
                      Broke it
                    </span>
                  )}
                  <span style={{ fontSize: 11.5, color: "var(--ink-mute)" }}>{timeAgo(c.published_at)}</span>
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.5, color: "var(--ink-body)" }}>{c.title}</div>
              </a>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function ScorePill({ score }) {
  const s = scoreStyle(score);
  return (
    <span
      title={`${score} out of 10 for how much this deserves a video today`}
      style={{
        fontSize: 12.5, fontWeight: 700, padding: "4px 10px", borderRadius: 999,
        border: `1px solid ${s.borderColor}`, color: s.color, background: s.background,
        whiteSpace: "nowrap", flexShrink: 0,
      }}
    >
      {score}/10
    </span>
  );
}

function SourceSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: 60, borderRadius: 10, border: "1px solid var(--line)",
            background: "#FCFBF9", opacity: 1 - i * 0.24,
          }}
        />
      ))}
    </div>
  );
}

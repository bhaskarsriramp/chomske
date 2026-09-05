import { useState, useEffect } from "react";
import api, { errorMessage } from "../../api";
import ScriptPanel from "./ScriptPanel";
import { sourceLabel, timeAgo } from "./newsUtils";
import { categoryColor } from "../../theme";

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

  const [brief, setBrief] = useState(preview?.brief || "");
  const [briefLoading, setBriefLoading] = useState(!preview?.brief);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    if (preview) setItem(preview);

    (async () => {
      try {
        const { data } = await api.get(`/news/${id}`);
        if (cancelled) return;
        setItem(data.item || preview || null);
        setCoverage(data.coverage || []);
        if (data.item?.brief) { setBrief(data.item.brief); setBriefLoading(false); }
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

  /**
   * The read on this story, fetched separately from the coverage.
   *
   * Its own request because writing one takes a few seconds the first time, and
   * folded into the call above it would hold the source list back too. Delayed
   * by 350ms because arrowing down the list selects forty stories in as many
   * keystrokes, and each one would otherwise start a generation server-side for
   * a story nobody stopped to look at.
   */
  useEffect(() => {
    if (brief) return;
    let cancelled = false;
    setBriefLoading(true);

    const t = setTimeout(async () => {
      try {
        const { data } = await api.get(`/news/${id}/brief`);
        if (!cancelled) setBrief(data.brief || "");
      } catch {
        /* the pane falls back to the summary it already has */
      } finally {
        if (!cancelled) setBriefLoading(false);
      }
    }, 350);

    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /**
   * A brief that landed while this pane was open.
   *
   * The feed patches its row when the server pushes one (see the socket handler
   * in NewsFeed.js), which changes `preview` under us — but `brief` was seeded
   * from `preview` once, at mount, so without this the story a creator is
   * actually staring at is the one place the live update would not appear.
   *
   * Only ever fills a gap: once there is a brief here, whether fetched above or
   * pushed, it is not replaced. Swapping prose out from under someone mid-read
   * would be worse than showing them the copy they started reading.
   */
  useEffect(() => {
    if (!preview?.brief) return;
    setBrief((prev) => prev || preview.brief);
    setBriefLoading(false);
  }, [preview?.brief]);

  useEffect(() => {
    if (mode !== "sheet") return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, onClose]);

  if (!item) return null;

  const body = (
    <Body
      item={item}
      coverage={coverage}
      loading={loading}
      error={error}
      brief={brief}
      briefLoading={briefLoading}
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

function Body({ item, coverage, loading, error, brief, briefLoading, onClose, compact, voice, onVoiceChange, onGoTranscribe }) {
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
          {/* The category, not the score. The number told a creator nothing here
              that the sentence explaining it further down doesn't tell them
              better, and it opened the pane with a mark out of ten. */}
          {item.category_label && <CategoryChip id={item.category} label={item.category_label} />}
          <span
            style={{
              fontSize: 12.5, color: "var(--ink-mute)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {item.source_count > 1 ? `${item.source_count} sources` : sourceLabel(item.source)}
            {/* The newest write-up, matching the card that opened this pane. */}
            {" · "}{timeAgo(item.latest_at || item.first_seen_at)}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
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
            fontSize: compact ? 21 : 27, fontWeight: 700, lineHeight: 1.24,
            letterSpacing: "-0.022em", color: "var(--ink)", margin: "0 0 12px",
          }}
        >
          {item.title}
        </h2>

        {item.angle && (
          <p
            style={{
              fontSize: compact ? 16 : 17.5, lineHeight: 1.55, fontWeight: 500,
              color: "var(--ink-body)", margin: "0 0 18px",
            }}
          >
            {item.angle}
          </p>
        )}

        {/* ── What actually happened ──────────────────────────────────────
            The reason this pane exists. A headline and a one-line angle is not
            enough to decide on, so the button underneath was being pressed
            blind — and a script about something you did not care about is how
            people stop trusting the button. This is 100-120 words built only
            from the coverage listed below it. */}
        <Brief
          text={brief}
          loading={briefLoading}
          fallback={item.summary}
          compact={compact}
        />

        {item.why && (
          <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--ink-mute)", margin: "0 0 26px" }}>
            {/* No score. The number was doing nothing here that the sentence
                after it doesn't do better. */}
            <strong style={{ fontWeight: 600, color: "var(--ink-body)" }}>Why it ranks. </strong>
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
                  {/* The API now sorts published_at DESCENDING — newest account
                      of the story first, which is the one worth reading when it
                      is still developing — so the LAST row is the one that broke
                      it, not the first. */}
                  {/* Plain text, not a badge. It is a footnote about ordering,
                      not a status worth a coloured chip of its own. */}
                  {i === links.length - 1 && links.length > 1 && (
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ok)" }}>
                      broke it
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

/**
 * The read on the story.
 *
 * Falls back to the collected summary when there was too little source text to
 * write from. Not an error state and not a spinner that never resolves: some
 * stories arrive as a headline and nothing else, and showing the one line we
 * genuinely have beats an apology for the paragraph we don't.
 */
function Brief({ text, loading, fallback, compact }) {
  if (loading && !text) {
    return (
      <div style={{ margin: "0 0 20px", display: "flex", flexDirection: "column", gap: 8 }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="hg-skel"
            style={{ height: 13, borderRadius: 5, width: i === 3 ? "72%" : "100%" }}
          />
        ))}
      </div>
    );
  }

  const body = text || fallback;
  if (!body) return null;

  return (
    <div
      style={{
        fontSize: compact ? 14.5 : 15.5,
        lineHeight: 1.72,
        color: "var(--ink-body)",
        margin: "0 0 22px",
        whiteSpace: "pre-wrap",
      }}
    >
      {body}
    </div>
  );
}

function CategoryChip({ id, label }) {
  const c = categoryColor(id);
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0,
        fontSize: 11.5, fontWeight: 650, padding: "4px 10px", borderRadius: 999,
        color: c.ink, background: c.tint, border: `1px solid ${c.line}`,
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: c.solid }} />
      {label}
    </span>
  );
}

function SourceSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="hg-skel" style={{ height: 56 }} />
      ))}
    </div>
  );
}

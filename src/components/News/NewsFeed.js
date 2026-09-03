import { useState, useEffect, useCallback, useRef } from "react";
import api, { errorMessage } from "../../api";
import useIsMobile from "../../hooks/useIsMobile";
import StoryDetail from "./StoryDetail";
import { sourceLabel, timeAgo, scoreStyle, isFresh } from "./newsUtils";

/**
 * What to make a video about today.
 *
 * The backend pulls a few thousand items a day from free sources and scores each
 * for whether it actually deserves a video. Rows arrive already collapsed, so one
 * launch covered by six outlets is ONE card reading "6 sources" — the count being
 * itself a signal of how big the story is, not just deduplication.
 *
 * ── LAYOUT ───────────────────────────────────────────────────────────────────
 * Split panes on anything desktop-sized: the ranked list on the left, the
 * selected story's sources on the right, each scrolling independently. Choosing
 * a topic means comparing candidates against their coverage, and a single column
 * with a modal on top forces that comparison through memory. Below 1100px there
 * is no room for two panes, so the story opens as a full-screen sheet instead.
 */

// Freshness windows. 6h is the "am I early" view; 72h is the API's ceiling.
const WINDOWS = [
  { key: 6, label: "6h" },
  { key: 24, label: "24h" },
  { key: 48, label: "48h" },
  { key: 72, label: "72h" },
];

// Score floors, named for the decision rather than the number — the choice is
// how picky to be today, not what integer to compare against.
const BARS = [
  { key: 3, label: "Everything" },
  { key: 6, label: "Worth covering" },
  { key: 8, label: "Major only" },
];

export default function NewsFeed({ onGoTranscribe, voiceRev = 0 }) {
  const isPhone = useIsMobile(680);
  const isNarrow = useIsMobile(1100);

  const [hours, setHours] = useState(24);
  const [minScore, setMinScore] = useState(6);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [voice, setVoice] = useState(null);

  const selectedRef = useRef(null);
  const selected = items.find((i) => i.id === openId) || null;

  // Fetched once here rather than inside each story: the profile is per-user, not
  // per-story, and re-requesting it on every click would be a call per selection.
  const loadVoice = useCallback(async () => {
    try {
      const { data } = await api.get("/script/voice");
      setVoice(data);
    } catch { /* the panel degrades to "transcribe first" — never block the feed */ }
  }, []);

  // voiceRev changes when videos are added, deleted or re-analysed on the other
  // screen — without it this pane would keep offering to write in a profile that
  // no longer matches, or keep saying "transcribe first" after they just did.
  useEffect(() => { loadVoice(); }, [loadVoice, voiceRev]);

  // Nothing polls here: the collector runs on its own 15-minute clock, so a
  // client-side interval would re-read identical rows and add load for nothing.
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.get("/news", { params: { hours, min_score: minScore, limit: 40 } });
      setItems(data.items || []);
    } catch (err) {
      setError(errorMessage(err, "Couldn't load today's topics."));
      setItems([]);
    } finally {
      setBusy(false);
      setLoadedOnce(true);
    }
  }, [hours, minScore]);

  useEffect(() => { load(); }, [load]);

  // On a split layout the right pane is always visible, so leaving it empty
  // wastes half the screen — open the top story by default, and re-open it if a
  // filter change drops whatever was selected.
  useEffect(() => {
    if (isNarrow || !items.length) return;
    if (openId && items.some((i) => i.id === openId)) return;
    setOpenId(items[0].id);
  }, [items, isNarrow, openId]);

  // Arrow keys walk the list. Cheap to support and it's how anyone actually
  // triages a feed of forty things.
  useEffect(() => {
    if (isNarrow || !items.length) return;
    const onKey = (e) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      const at = items.findIndex((i) => i.id === openId);
      const next = e.key === "ArrowDown"
        ? Math.min(items.length - 1, at + 1)
        : Math.max(0, at - 1);
      if (items[next]) setOpenId(items[next].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, openId, isNarrow]);

  // Keeps the keyboard cursor on screen. `nearest` is a no-op when the row is
  // already visible, so clicking never causes a jump.
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [openId]);

  const gut = isPhone ? 16 : 26;

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0, width: "100%" }}>
      {/* ── List ─────────────────────────────────────────────────────────── */}
      <section
        style={{
          display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0,
          // Proportional so a wider monitor gives the list more room too, with a
          // floor that keeps headlines off two lines and a ceiling that stops the
          // list from swallowing the sources pane on ultrawide.
          flex: isNarrow ? "1 1 100%" : "0 0 clamp(400px, 36%, 660px)",
          borderRight: isNarrow ? "none" : "1px solid var(--line)",
          background: "var(--paper)",
        }}
      >
        <div style={{ padding: `${isPhone ? 16 : 20}px ${gut}px 14px`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <h1
              style={{
                fontSize: isPhone ? 20 : 23, fontWeight: 750, letterSpacing: "-0.03em",
                color: "var(--ink)", margin: 0,
              }}
            >
              What to cover today
            </h1>
            <button
              onClick={load}
              disabled={busy}
              className="hg-btn-ghost"
              style={{
                fontSize: 12.5, fontWeight: 600, padding: "6px 12px", borderRadius: 9,
                border: "1px solid var(--line)", background: "var(--card)",
                color: "var(--ink-mute)", cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.55 : 1, whiteSpace: "nowrap", flexShrink: 0,
              }}
            >
              {busy ? "Loading" : "Refresh"}
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 13 }}>
            <ChipGroup label="Time window" options={WINDOWS} value={hours} onChange={setHours} />
            <ChipGroup label="Score floor" options={BARS} value={minScore} onChange={setMinScore} />
          </div>
        </div>

        <div
          className="hg-scroll"
          style={{
            flex: 1, minHeight: 0, padding: `0 ${gut}px ${isPhone ? 28 : 34}px`,
            opacity: busy && loadedOnce ? 0.45 : 1, transition: "opacity .15s ease",
          }}
        >
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

          {!loadedOnce && busy && <FeedSkeleton />}

          {loadedOnce && !items.length && !error && (
            <EmptyState
              hours={hours}
              minScore={minScore}
              onWiden={() => { setHours(72); setMinScore(3); }}
            />
          )}

          {items.length > 0 && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {items.map((it) => (
                  <StoryRow
                    key={it.id}
                    item={it}
                    isPhone={isPhone}
                    active={!isNarrow && it.id === openId}
                    rowRef={it.id === openId ? selectedRef : null}
                    onOpen={() => setOpenId(it.id)}
                  />
                ))}
              </div>
              <p style={{ margin: "18px 2px 0", fontSize: 12, color: "var(--ink-mute)", lineHeight: 1.6 }}>
                {items.length} {items.length === 1 ? "story" : "stories"} in the last {hours}h.
                Rechecked every 15 minutes.
              </p>
            </>
          )}
        </div>
      </section>

      {/* ── Sources ──────────────────────────────────────────────────────── */}
      {!isNarrow && (
        <section
          style={{
            flex: "1 1 0", minWidth: 0, minHeight: 0,
            display: "flex", flexDirection: "column", background: "var(--card)",
          }}
        >
          {selected
            ? <StoryDetail
                key={selected.id}
                id={selected.id}
                preview={selected}
                mode="pane"
                voice={voice}
                onVoiceChange={loadVoice}
                onGoTranscribe={onGoTranscribe}
              />
            : <PanePlaceholder loading={busy && !loadedOnce} />}
        </section>
      )}

      {isNarrow && selected && (
        <StoryDetail
          key={selected.id}
          id={selected.id}
          preview={selected}
          mode="sheet"
          onClose={() => setOpenId(null)}
          voice={voice}
          onVoiceChange={loadVoice}
          onGoTranscribe={onGoTranscribe}
        />
      )}
    </div>
  );
}

/* ── Pieces ────────────────────────────────────────────────────────────── */

function ChipGroup({ label, options, value, onChange }) {
  return (
    <div
      role="group"
      aria-label={label}
      style={{
        display: "inline-flex", padding: 3, gap: 2,
        background: "#F2EFE9", border: "1px solid var(--line)", borderRadius: 10,
      }}
    >
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            aria-pressed={on}
            style={{
              fontSize: 12.5, fontWeight: on ? 600 : 500,
              padding: "6px 11px", borderRadius: 8, border: "none",
              background: on ? "var(--card)" : "transparent",
              color: on ? "var(--ink)" : "var(--ink-mute)",
              boxShadow: on ? "0 1px 2px rgba(18,16,13,.09)" : "none",
              cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function StoryRow({ item, isPhone, active, rowRef, onOpen }) {
  const s = scoreStyle(item.score);
  const fresh = isFresh(item.first_seen_at);

  // Up to two named sources then a count: "OpenAI, Hacker News" tells a creator
  // something a bare "4 sources" doesn't.
  const names = (item.sources || []).slice(0, 2).map(sourceLabel).join(", ");
  const more = (item.sources || []).length - 2;

  return (
    <button
      ref={rowRef}
      onClick={onOpen}
      className={active ? undefined : "hg-row"}
      style={{
        textAlign: "left", width: "100%", cursor: "pointer",
        display: "flex", alignItems: "flex-start", gap: 13,
        padding: isPhone ? "13px 14px" : "14px 15px",
        background: active ? "#FBF6F1" : "var(--card)",
        border: `1px solid ${active ? "#EBD8C8" : "var(--line)"}`,
        borderLeft: `3px solid ${active ? "var(--accent)" : "transparent"}`,
        borderRadius: 11,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0, width: 32, height: 32, borderRadius: 9,
          display: "grid", placeItems: "center", fontSize: 13.5, fontWeight: 700,
          border: `1px solid ${s.borderColor}`, color: s.color, background: s.background,
        }}
      >
        {item.score}
      </span>

      <span style={{ minWidth: 0, flex: 1 }}>
        <span
          style={{
            display: "block", fontSize: isPhone ? 15 : 15.5, fontWeight: 600,
            lineHeight: 1.4, letterSpacing: "-0.011em", color: "var(--ink)",
          }}
        >
          {item.title}
        </span>

        {item.angle && (
          <span
            style={{
              marginTop: 5, fontSize: 13.5, lineHeight: 1.55, color: "var(--ink-body)",
              // Two lines is enough to judge the hook; the full angle is one
              // click away, and ragged card heights make a list hard to scan.
              display: "-webkit-box", overflow: "hidden",
              WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            }}
          >
            {item.angle}
          </span>
        )}

        <span
          style={{
            display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap",
            marginTop: 8, fontSize: 11.5, color: "var(--ink-mute)",
          }}
        >
          {fresh && (
            <span
              style={{
                fontSize: 9.5, fontWeight: 700, letterSpacing: "0.09em",
                textTransform: "uppercase", padding: "2px 6px", borderRadius: 999,
                color: "var(--accent)", background: "var(--accent-soft)", border: "1px solid #F6DDCE",
              }}
            >
              Breaking
            </span>
          )}
          {item.source_kind === "primary" && (
            <span style={{ fontWeight: 600, color: "var(--ok)" }}>Announcement</span>
          )}
          <span>
            {item.source_count > 1 ? `${item.source_count} sources · ` : ""}
            {names}{more > 0 ? ` +${more}` : ""}
          </span>
          <span>· {timeAgo(item.first_seen_at)}</span>
          {item.points ? <span>· {item.points} pts</span> : null}
        </span>
      </span>
    </button>
  );
}

function PanePlaceholder({ loading }) {
  return (
    <div style={{ flex: 1, display: "grid", placeItems: "center", padding: 40 }}>
      <p style={{ fontSize: 13.5, color: "var(--ink-mute)", textAlign: "center", margin: 0 }}>
        {loading ? "Reading the wires…" : "Pick a story to see who covered it."}
      </p>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{
            height: 96, borderRadius: 11, border: "1px solid var(--line)",
            background: "var(--card)", opacity: 1 - i * 0.14,
          }}
        />
      ))}
    </div>
  );
}

function EmptyState({ hours, minScore, onWiden }) {
  const picky = minScore >= 6;
  return (
    <div
      style={{
        padding: "30px 24px", textAlign: "center",
        background: "var(--card)", border: "1px dashed var(--line)", borderRadius: "var(--radius)",
      }}
    >
      <div style={{ fontSize: 15.5, fontWeight: 600, color: "var(--ink)", marginBottom: 7 }}>
        Nothing clears the bar right now
      </div>
      <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--ink-body)", margin: "0 0 16px" }}>
        {picky
          ? `Nothing from the last ${hours}h scored ${minScore} or higher. Quiet days are real — most days have two or three stories worth a video, not twenty.`
          : `Nothing has come in for the last ${hours}h. The collector runs every 15 minutes, so a fresh install takes a few minutes to fill up.`}
      </p>
      <button
        onClick={onWiden}
        className="hg-btn-ghost"
        style={{
          fontSize: 13, fontWeight: 600, padding: "9px 15px", borderRadius: 10,
          border: "1px solid var(--line)", background: "var(--card)",
          color: "var(--ink-body)", cursor: "pointer",
        }}
      >
        Widen to 72h, show everything
      </button>
    </div>
  );
}

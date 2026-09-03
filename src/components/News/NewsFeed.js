import { useState, useEffect, useCallback, useRef } from "react";
import api, { errorMessage } from "../../api";
import useIsMobile from "../../hooks/useIsMobile";
import StoryDetail from "./StoryDetail";
import { sourceLabel, timeAgo, isFresh } from "./newsUtils";
import { categoryColor } from "../../theme";

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

export default function NewsFeed({ onGoTranscribe, voiceRev = 0, categoriesKey = "" }) {
  const isPhone = useIsMobile(680);
  const isNarrow = useIsMobile(1100);

  const [hours, setHours] = useState(24);
  const [minScore, setMinScore] = useState(6);
  const [cat, setCat] = useState("");          // "" = every category they picked
  const [feedCats, setFeedCats] = useState([]);
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
      const params = { hours, min_score: minScore, limit: 40 };
      if (cat) params.category = cat;
      const { data } = await api.get("/news", { params });
      setItems(data.items || []);
      // Only refreshed on the unfiltered read: asking for one category makes the
      // server echo back just that one, which would collapse the filter row to a
      // single chip and strand the user inside it.
      if (!cat) setFeedCats(data.categories || []);
    } catch (err) {
      setError(errorMessage(err, "Couldn't load today's topics."));
      setItems([]);
    } finally {
      setBusy(false);
      setLoadedOnce(true);
    }
  }, [hours, minScore, cat]);

  // categoriesKey is a refetch trigger, not an input: the server derives the
  // categories from the session, so the request body never changes. It belongs
  // on the effect rather than in load()'s deps — without it, saving a new
  // selection in Profile leaves Topics serving the previous categories.
  useEffect(() => { load(); }, [load, categoriesKey]);

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

          {/* Shown only when they cover more than one thing. With a single
              category it would be a filter with one setting, and it doubles as
              the legend for the colour on the rows below. */}
          {feedCats.length > 1 && (
            <CategoryFilter cats={feedCats} value={cat} onChange={setCat} />
          )}
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
                background: "#FCE8E6", border: "1px solid #F5C7C3",
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
                    // Naming the category on every row is only worth the line
                    // when there is more than one to tell apart.
                    showCategory={feedCats.length > 1 && !cat}
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
        background: "#F2F2F2", border: "1px solid var(--line)", borderRadius: 10,
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
              boxShadow: on ? "0 1px 2px rgba(15,15,15,.09)" : "none",
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

/**
 * One story in the list.
 *
 * ── NO SCORE NUMBER ──────────────────────────────────────────────────────────
 * There used to be a scored square at the head of every row. It was redundant
 * three ways over: the list is already sorted by that number, the chip group
 * above sets the floor for it, and the detail pane explains it in a sentence.
 * Forty rows each opening with a digit made the feed look like a spreadsheet of
 * results rather than a shortlist of things to say on camera. The ranking is
 * still doing all its work; it is expressed as position, which is how a
 * rundown has always expressed it.
 *
 * The colour is the category. A creator covering markets and AI at once can now
 * tell the two apart before reading, which is the only job colour has here.
 */
/**
 * Which of their categories to show, and the key to the colours below it.
 *
 * Not a ChipGroup: these carry a hue each, and the segmented grey track that
 * suits "6h / 24h / 48h" would put eight competing colours inside one box. Loose
 * pills read as labels, which is what they are.
 */
function CategoryFilter({ cats, value, onChange }) {
  return (
    <div
      role="group"
      aria-label="Category"
      style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 9 }}
    >
      <CategoryPill on={!value} onClick={() => onChange("")} label="All" />
      {cats.map((c) => (
        <CategoryPill
          key={c.id}
          id={c.id}
          label={c.label}
          on={value === c.id}
          onClick={() => onChange(value === c.id ? "" : c.id)}
        />
      ))}
    </div>
  );
}

function CategoryPill({ id, label, on, onClick }) {
  const c = categoryColor(id);
  const plain = !id;
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className="hg-pill"
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 12, fontWeight: on ? 650 : 550,
        padding: "5px 11px", borderRadius: 999, cursor: "pointer",
        background: on ? (plain ? "var(--ink)" : c.tint) : "var(--card)",
        color: on ? (plain ? "#fff" : c.ink) : "var(--ink-mute)",
        border: `1px solid ${on ? (plain ? "var(--ink)" : c.solid) : "var(--line)"}`,
        whiteSpace: "nowrap",
      }}
    >
      {!plain && (
        <span
          aria-hidden="true"
          style={{ width: 6, height: 6, borderRadius: "50%", background: c.solid, flexShrink: 0 }}
        />
      )}
      {label}
    </button>
  );
}

function StoryRow({ item, isPhone, active, rowRef, onOpen, showCategory }) {
  const c = categoryColor(item.category);
  const fresh = isFresh(item.first_seen_at);

  // Up to two named sources then a count: "OpenAI, Hacker News" tells a creator
  // something a bare "4 sources" doesn't.
  const names = (item.sources || []).slice(0, 2).map(sourceLabel).join(", ");
  const more = (item.sources || []).length - 2;

  // One muted line, joined with middots. Metadata as separate coloured chips is
  // how a rundown turns into a sticker album — a creator scans this line, they
  // don't read it, and every badge added is one more thing to look past.
  const meta = [
    item.source_count > 1 ? `${item.source_count} sources` : null,
    names ? `${names}${more > 0 ? ` +${more}` : ""}` : null,
    timeAgo(item.first_seen_at),
    item.points ? `${item.points} pts` : null,
  ].filter(Boolean).join("  ·  ");

  return (
    <button
      ref={rowRef}
      onClick={onOpen}
      className={active ? undefined : "hg-row"}
      style={{
        textAlign: "left", width: "100%", cursor: "pointer",
        display: "block",
        padding: isPhone ? "12px 13px" : "13px 15px",
        // The tint fades out before the text starts, so the row is coloured at
        // the edge a scanning eye catches and plain white where the headline
        // has to be read.
        background: active
          ? c.tint
          : `linear-gradient(180deg, ${c.tint} 0%, var(--card) 74%)`,
        border: `1px solid ${active ? c.solid : c.line}`,
        borderRadius: 10,
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
        <span
          aria-hidden="true"
          style={{ flexShrink: 0, width: 6, height: 6, borderRadius: "50%", background: c.solid }}
        />
        {showCategory && item.category_label && (
          <span
            style={{
              fontSize: 10.5, fontWeight: 700, letterSpacing: "0.055em",
              textTransform: "uppercase", color: c.ink,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {item.category_label}
          </span>
        )}
        {/* Freshness is the one thing worth shouting: a story first seen in the
            last three hours is the whole "post before the big channels" pitch. */}
        {fresh && (
          <span
            title="First seen in the last 3 hours"
            style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.055em", color: "var(--accent)" }}
          >
            NEW
          </span>
        )}
      </span>

      <span
        style={{
          display: "block",
          fontSize: isPhone ? 14.5 : 15, fontWeight: 600,
          lineHeight: 1.38, letterSpacing: "-0.008em", color: "var(--ink)",
        }}
      >
        {item.title}
      </span>

      {item.angle && (
        <span
          style={{
            marginTop: 5, fontSize: 13, lineHeight: 1.5, color: "var(--ink-mute)",
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
          display: "block", marginTop: 7, fontSize: 11.5, color: "#8A8A8A",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}
      >
        {meta}
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
        <div key={i} className="hg-skel" style={{ height: 88 }} />
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
          ? `Nothing from the last ${hours}h scored ${minScore} or higher. Quiet days are real. Most days have two or three stories worth a video, not twenty.`
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

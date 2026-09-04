import { useState, useEffect, useCallback, useRef } from "react";
import api, { errorMessage } from "../../api";
import useIsMobile from "../../hooks/useIsMobile";
import StoryDetail from "./StoryDetail";
import { sourceLabel, timeAgo, isFresh } from "./newsUtils";
import { categoryColor, cardBackground, cardTint } from "../../theme";

/**
 * What to make a video about today.
 *
 * The backend pulls a few thousand items a day from free sources and scores each
 * for whether it actually deserves a video. Rows arrive already collapsed, so one
 * launch covered by six outlets is ONE card reading "6 sources" — the count being
 * itself a signal of how big the story is, not just deduplication.
 *
 * ── WHY THERE ARE NO FILTERS ANY MORE ────────────────────────────────────────
 * This used to open with a time window (6h/24h/48h/72h) and a score floor
 * (Everything / Worth covering / Major only). Seven controls above a list whose
 * whole promise is "we already decided for you". Every one of them was a way to
 * make the feed worse, the defaults were the right answer, and asking someone to
 * tune a ranking they cannot see is asking them to do the product's job. The
 * window and the bar are now constants, and the only choice left is the one that
 * is genuinely theirs: which of their categories they are looking at.
 *
 * ── LAYOUT ───────────────────────────────────────────────────────────────────
 * Split panes on anything desktop-sized: the ranked list on the left, the
 * selected story's brief and sources on the right, each scrolling independently.
 * Choosing a topic means comparing candidates against what they say, and a
 * single column with a modal on top forces that comparison through memory.
 * Below 1100px there is no room for two panes, so the story opens as a
 * full-screen sheet instead.
 */

// The feed's fixed shape. Two days is wide enough that a quiet category still
// has something in it, and the ordering is by recency anyway, so anything older
// sits at the bottom where it belongs rather than distorting the top.
const WINDOW_HOURS = 48;

// Must stay in step with NEWS_BRIEF_MIN_SCORE on the server, which decides which
// stories get a brief written ahead of time. When these drifted apart, a story
// scoring exactly this much appeared here and never had a brief prepared, so it
// regenerated one every time anyone opened it.
const MIN_SCORE = 5;

// A hard ceiling, not a page size. The whole promise is "we already decided for
// you", and forty ranked cards is a list to triage — which is the thing a
// creator already has in four other apps. Most days genuinely have two or three
// stories worth a video; fifteen leaves real choice without becoming a feed.
//
// MUST STAY IN STEP WITH NEWS_BRIEF_LIMIT on the server, which decides how many
// stories get a brief written ahead of time. Cards beyond that number open to a
// spinner and generate their brief on the spot, every time anyone opens them.
const MAX_CARDS = 15;

// The fallback when that comes back empty. A brand-new category has collected
// for minutes, not days, and showing a first-time user an empty product is how
// they conclude it is broken. Widening once beats making them find a control.
const WIDE_HOURS = 72;
const WIDE_MIN_SCORE = 3;

// Refresh is a courtesy, not a lever: the collector runs on its own 15-minute
// clock, so the second press of the same minute cannot return anything the
// first did not. Three is enough to feel responsive and few enough that nobody
// sits there hammering it expecting different news.
const MAX_REFRESHES = 3;

export default function NewsFeed({ onGoTranscribe, voiceRev = 0, categoriesKey = "", userCategories = [] }) {
  const isPhone = useIsMobile(680);
  const isNarrow = useIsMobile(1100);

  // Opens on their first category rather than on everything. A mixed feed of
  // three subjects has no shape — a creator sits down to make a markets video
  // or a tech video, not "a video".
  const [cat, setCat] = useState(userCategories[0] || "");
  const [feedCats, setFeedCats] = useState([]);
  const [items, setItems] = useState([]);
  const [checkedAt, setCheckedAt] = useState(null);
  const [widened, setWidened] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [voice, setVoice] = useState(null);
  const [refreshes, setRefreshes] = useState(0);
  const [ranking, setRanking] = useState(false);
  const [emptyTries, setEmptyTries] = useState(0);
  // What the last fetch produced, so the button can report back instead of
  // going quiet and leaving the reader to guess whether it did anything.
  const [fetched, setFetched] = useState(null);   // null | number of new stories

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
  //
  // `refresh` asks the server to SCORE whatever the collector has brought in
  // since anyone last looked. Ranking is the paid half and no longer runs on a
  // timer, so this is what actually surfaces new stories. It is throttled per
  // category server-side, which is why it is safe to call on every open: inside
  // the cooldown it returns in about a millisecond having spent nothing.
  const load = useCallback(async ({ refresh = false } = {}) => {
    setBusy(true);
    setError("");
    try {
      if (refresh) {
        setRanking(true);
        try {
          await api.post("/news/refresh", cat ? { category: cat } : {});
        } catch {
          // The feed still renders everything already ranked. A failed refresh
          // is a missing update, not a broken screen.
        } finally {
          setRanking(false);
        }
      }

      const base = { limit: MAX_CARDS };
      if (cat) base.category = cat;

      let { data } = await api.get("/news", {
        params: { ...base, hours: WINDOW_HOURS, min_score: MIN_SCORE },
      });

      // Nothing at the normal bar. Try once with the window and the bar opened
      // up before concluding there is nothing to cover.
      let wide = false;
      if (!(data.items || []).length) {
        const retry = await api.get("/news", {
          params: { ...base, hours: WIDE_HOURS, min_score: WIDE_MIN_SCORE },
        });
        if ((retry.data.items || []).length) { data = retry.data; wide = true; }
      }

      const next = data.items || [];
      setItems(next);
      setWidened(wide);
      setCheckedAt(data.checked_at || null);
      setFeedCats(data.categories || []);
      return next;
    } catch (err) {
      setError(errorMessage(err, "Couldn't load today's topics."));
      setItems([]);
      return [];
    } finally {
      setBusy(false);
      setLoadedOnce(true);
    }
  }, [cat]);

  // categoriesKey is a refetch trigger, not an input: the server derives the
  // categories from the session, so the request body never changes. It belongs
  // on the effect rather than in load()'s deps — without it, saving a new
  // selection in Profile leaves Topics serving the previous categories.
  // A plain read. Opening Topics deliberately does NOT rank any more: ranking is
  // the paid half, and work that costs money should be something a creator asks
  // for and can see happening, not something that fires behind them every time
  // they glance at the page. The button below is that ask.
  useEffect(() => { load(); }, [load, categoriesKey]);

  // A different category is a different feed, so it gets its own refresh budget.
  useEffect(() => { setRefreshes(0); setEmptyTries(0); }, [cat]);

  /**
   * An empty feed right after signing up is usually work still in flight, not an
   * empty product: choosing categories fires a collection, that takes about a
   * minute and a half, and it holds the ranking slot while it runs — so the
   * refresh this pane just asked for was correctly told "already in hand".
   *
   * So look again a few times before believing the emptiness. Deliberately a
   * plain GET and never the refresh POST: a retry that re-triggered the paid
   * work would be a loop that pays for its own reason to run again.
   */
  useEffect(() => {
    if (!loadedOnce || items.length || error || emptyTries >= 3) return;
    const t = setTimeout(() => {
      setEmptyTries((n) => n + 1);
      load();
    }, 10000);
    return () => clearTimeout(t);
  }, [loadedOnce, items.length, error, emptyTries, load]);

  // Their selection can change in Profile. If the category being viewed is no
  // longer one of theirs, fall back to the first that is.
  useEffect(() => {
    const ids = (userCategories || []).filter(Boolean);
    if (!ids.length) return;
    if (!cat || !ids.includes(cat)) setCat(ids[0]);
  }, [categoriesKey]);  // eslint-disable-line react-hooks/exhaustive-deps

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
        <div style={{ padding: `${isPhone ? 16 : 20}px 0 12px`, flexShrink: 0 }}>
          <div
            style={{
              display: "flex", alignItems: "baseline", justifyContent: "space-between",
              gap: 12, padding: `0 ${gut}px`,
            }}
          >
            <h1
              style={{
                fontSize: isPhone ? 20 : 23, fontWeight: 750, letterSpacing: "-0.03em",
                color: "var(--ink)", margin: 0,
              }}
            >
              What to cover today
            </h1>
            <FetchButton
              busy={busy}
              running={ranking}
              spent={refreshes >= MAX_REFRESHES}
              fetched={fetched}
              onFetch={async () => {
                setRefreshes((n) => n + 1);
                setFetched(null);
                // Counted here rather than taken from the server: the endpoint
                // knows how many stories it SCORED, which is not the same as how
                // many reached this feed — most score too low to appear, and
                // reporting those as new would be a number that flatters itself.
                const before = new Set(items.map((i) => i.id));
                const next = await load({ refresh: true });
                setFetched((next || []).filter((i) => !before.has(i.id)).length);
              }}
            />
          </div>

          {feedCats.length > 0 && (
            <CategoryStrip cats={feedCats} value={cat} onChange={setCat} gut={gut} />
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

          {loadedOnce && !items.length && !error && <EmptyState settling={emptyTries < 3} />}

          {items.length > 0 && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {items.map((it, i) => (
                  <StoryRow
                    key={it.id}
                    item={it}
                    index={i}
                    isPhone={isPhone}
                    active={!isNarrow && it.id === openId}
                    rowRef={it.id === openId ? selectedRef : null}
                    onOpen={() => setOpenId(it.id)}
                  />
                ))}
              </div>
              {/* Evidence, not a promise. This used to say "Rechecked every 15
                  minutes", which a creator looking at an eight-hour-old top card
                  had no way to believe — they could not tell a quiet news day
                  from a collector that had silently died. The real timestamp
                  makes the difference visible. */}
              <p style={{ margin: "18px 2px 0", fontSize: 12, color: "var(--ink-mute)", lineHeight: 1.6 }}>
                {items.length} {items.length === 1 ? "story" : "stories"}, newest first.
                {widened
                  ? " Nothing cleared the usual bar, so this reaches back further than normal."
                  : ` From the last ${WINDOW_HOURS} hours.`}
                {checkedAt && ` Checked ${timeAgo(checkedAt)}.`}
              </p>
            </>
          )}
        </div>
      </section>

      {/* ── The story ────────────────────────────────────────────────────── */}
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

/**
 * Fetch new topics.
 *
 * ── WHY THIS IS A NAMED ACTION AND NOT "REFRESH" ─────────────────────────────
 * It used to say Refresh, and refresh means "redraw what you already have" —
 * free, instant, expected. This is not that. Pressing it asks the ranker to read
 * everything the collector has gathered since anyone last looked and decide what
 * deserves a video, which takes a few seconds and costs real money. Naming it
 * for what it does makes the wait make sense and makes the cost the creator's
 * choice rather than something the page does behind them.
 *
 * It also reports back. A button that runs for six seconds and then looks
 * exactly as it did before teaches people to press it again, which is precisely
 * the behaviour the budget exists to stop.
 *
 * Once spent it is NOT given the `disabled` attribute, deliberately: a disabled
 * button fires no mouse events in Chrome, so hovering it would say nothing and
 * the person would keep clicking a dead control. It stays live, looks spent, and
 * explains itself — on hover for a pointer, on tap for a thumb, since a phone
 * has no hover to explain anything with.
 */
function FetchButton({ busy, running, spent, fetched, onFetch }) {
  const [showing, setShowing] = useState(false);
  const [report, setReport] = useState(null);
  const timer = useRef(null);
  const reportTimer = useRef(null);

  useEffect(() => () => { clearTimeout(timer.current); clearTimeout(reportTimer.current); }, []);

  // Show the outcome briefly, then go back to being an offer.
  useEffect(() => {
    if (fetched === null) return;
    setReport(fetched);
    clearTimeout(reportTimer.current);
    reportTimer.current = setTimeout(() => setReport(null), 4500);
  }, [fetched]);

  function explain() {
    setShowing(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShowing(false), 2600);
  }

  const label = running
    ? "Fetching…"
    : report !== null
    ? report > 0
      ? `${report} new`
      : "Up to date"
    : "Fetch new topics";

  const idle = !running && report === null;

  return (
    <span style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => {
          if (busy || running) return;
          if (spent) explain();
          else onFetch();
        }}
        aria-disabled={spent || busy || running}
        aria-live="polite"
        onMouseEnter={() => spent && idle && setShowing(true)}
        onMouseLeave={() => { clearTimeout(timer.current); setShowing(false); }}
        className={spent || busy || running ? undefined : "hg-btn-ghost"}
        style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          fontSize: 12.5, fontWeight: 600, padding: "6px 13px", borderRadius: 999,
          border: `1px solid ${report > 0 ? "var(--made-line)" : "var(--line)"}`,
          background: report > 0 ? "var(--made-tint)" : "var(--card)",
          color: report > 0 ? "var(--made)" : "var(--ink-mute)",
          cursor: busy || running || spent ? "default" : "pointer",
          opacity: busy && !running ? 0.55 : spent && idle ? 0.5 : 1,
          whiteSpace: "nowrap",
          transition: "background .15s ease, border-color .15s ease, color .15s ease",
        }}
      >
        {running ? (
          <span
            aria-hidden="true"
            style={{
              width: 11, height: 11, borderRadius: "50%", flexShrink: 0,
              border: "2px solid var(--line)", borderTopColor: "var(--made)",
              animation: "hg-spin .8s linear infinite",
            }}
          />
        ) : (
          <span aria-hidden="true" style={{ fontSize: 13, lineHeight: 1 }}>
            {report !== null ? "✓" : "↻"}
          </span>
        )}
        {label}
      </button>

      {showing && (
        <span
          role="status"
          className="hg-fade"
          style={{
            position: "absolute", top: "calc(100% + 7px)", right: 0, zIndex: 5,
            padding: "7px 11px", borderRadius: 8,
            background: "var(--ink)", color: "#fff",
            fontSize: 12, fontWeight: 500, lineHeight: 1.4,
            whiteSpace: "nowrap", boxShadow: "0 6px 18px -8px rgba(15,15,15,.5)",
          }}
        >
          Latest topics are already fetched.
        </span>
      )}
    </span>
  );
}

/**
 * Which of their categories they are reading.
 *
 * One row that scrolls sideways rather than wrapping. Three long labels wrap to
 * two or three lines, and a header that changes height when someone edits their
 * categories in Profile makes the whole list jump. Scrolling keeps the header a
 * fixed height whatever they picked. It bleeds into the gutter on purpose, so a
 * half-visible chip at the edge shows there is more to scroll to.
 */
function CategoryStrip({ cats, value, onChange, gut }) {
  return (
    <div
      role="group"
      aria-label="Category"
      className="hg-strip"
      style={{
        display: "flex", gap: 7, marginTop: 12,
        overflowX: "auto", overflowY: "hidden",
        padding: `2px ${gut}px`,
        scrollbarWidth: "none",
      }}
    >
      {cats.map((c) => {
        const col = categoryColor(c.id);
        const on = value === c.id;
        return (
          <button
            key={c.id}
            onClick={() => onChange(c.id)}
            aria-pressed={on}
            className="hg-pill"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0,
              fontSize: 12.5, fontWeight: on ? 650 : 550,
              padding: "6px 12px", borderRadius: 999, cursor: "pointer",
              background: on ? col.tint : "var(--card)",
              color: on ? col.ink : "var(--ink-mute)",
              border: `1px solid ${on ? col.solid : "var(--line)"}`,
              whiteSpace: "nowrap",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                background: on ? col.solid : "#CFCFCF",
              }}
            />
            {c.label}
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
 * There used to be a scored square at the head of every row. Redundant three
 * ways over: the list was already sorted by that number, the chips above set its
 * floor, and the detail pane explains it in a sentence. Forty rows each opening
 * with a digit made the feed look like a spreadsheet of results rather than a
 * shortlist of things to say on camera.
 *
 * ── THE COLOUR MEANS NOTHING ─────────────────────────────────────────────────
 * And that is the point. It cycles by position through twelve warm grounds, so
 * a long list has rhythm and no two neighbours look alike. It briefly encoded
 * the category instead, which sounds better and was worse: the feed shows one
 * category at a time, so every card came out the same colour, and a colour that
 * never varies has stopped carrying information anyway.
 */
function StoryRow({ item, index, isPhone, active, rowRef, onOpen }) {
  // Fresh means "somebody wrote about this in the last three hours", which is
  // the question a creator is actually asking. Measured on the newest coverage,
  // so a developing story keeps the flag while it is developing.
  const fresh = isFresh(item.latest_at || item.first_seen_at);
  const tone = cardTint(index);

  // Up to two named sources then a count: "OpenAI, Hacker News" tells a creator
  // something a bare "4 sources" doesn't.
  const names = (item.sources || []).slice(0, 2).map(sourceLabel).join(", ");
  const more = (item.sources || []).length - 2;

  // One muted line, joined with middots. Metadata as separate coloured chips is
  // how a rundown turns into a sticker album — a creator scans this line, they
  // don't read it, and every badge added is one more thing to look past.
  //
  // ONE TIME, AND IT IS THE NEWEST WRITE-UP. Not when the story broke: a story
  // twenty outlets are still filing on is live whatever hour it started, and
  // leading with the break time made a moving feed read as a frozen one. It
  // briefly showed both ("17h ago · more 2h ago"), which was worse — two
  // timestamps on a card is a puzzle, not information.
  const meta = [
    item.source_count > 1 ? `${item.source_count} sources` : null,
    names ? `${names}${more > 0 ? ` +${more}` : ""}` : null,
    timeAgo(item.latest_at || item.first_seen_at),
    item.points ? `${item.points} pts` : null,
  ].filter(Boolean).join("  ·  ");

  return (
    <button
      ref={rowRef}
      onClick={onOpen}
      className={active ? undefined : "hg-row"}
      style={{
        textAlign: "left", width: "100%", cursor: "pointer", display: "block",
        padding: isPhone ? "12px 13px" : "13px 15px",
        background: cardBackground(index, active),
        // Selected takes the tint's own border a shade darker rather than a
        // different colour, so the chosen row reads as the same card, lifted.
        border: `1px solid ${tone.line}`,
        boxShadow: active ? `inset 0 0 0 1px ${tone.line}` : "none",
        borderRadius: 10,
      }}
    >
      {fresh && (
        <span
          title="Fresh coverage in the last 3 hours"
          style={{
            display: "inline-block", marginBottom: 5,
            fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em",
            color: "var(--accent)",
          }}
        >
          NEW
        </span>
      )}

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
            // Two lines is enough to judge the hook; the full read is one click
            // away, and ragged card heights make a list hard to scan.
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
        {loading ? "Reading the wires…" : "Pick a story to see what happened."}
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

/**
 * Nothing to show. There is no "widen the search" button any more because the
 * widening already happened automatically before this rendered — offering it
 * again would be a button that does what was just done.
 */
function EmptyState({ settling }) {
  if (settling) {
    return (
      <div
        style={{
          padding: "30px 24px", textAlign: "center",
          background: "var(--card)", border: "1px dashed var(--line)", borderRadius: "var(--radius)",
        }}
      >
        <div style={{ fontSize: 15.5, fontWeight: 600, color: "var(--ink)", marginBottom: 7 }}>
          Gathering your first stories
        </div>
        <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--ink-body)", margin: 0 }}>
          Reading the sources for what you picked. This takes a minute or two the
          very first time, then it is already done every morning after.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "30px 24px", textAlign: "center",
        background: "var(--card)", border: "1px dashed var(--line)", borderRadius: "var(--radius)",
      }}
    >
      <div style={{ fontSize: 15.5, fontWeight: 600, color: "var(--ink)", marginBottom: 7 }}>
        Nothing worth covering yet
      </div>
      <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--ink-body)", margin: 0 }}>
        Quiet stretches are real. Most days have two or three stories worth a video,
        not twenty. If you have just added this category, the collector runs every
        15 minutes and takes a little while to fill up.
      </p>
    </div>
  );
}

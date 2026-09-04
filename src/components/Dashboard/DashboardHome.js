import { useState, useEffect, useCallback } from "react";
import api, { errorMessage } from "../../api";
import useIsMobile from "../../hooks/useIsMobile";
import Skeleton from "../Shell/Skeleton";
import { useProfiles } from "../../state/ProfileContext";

/**
 * The Dashboard: how much voice we have, and how much you've made with it.
 *
 * The range selector only governs SCRIPTS. Videos are a current state — five
 * slots, some filled — not an activity total, so filtering them by "last 7 days"
 * would show zero for someone whose voice works perfectly but who set it up a
 * month ago. That reads as a broken product, so the card says so explicitly
 * rather than silently ignoring the filter.
 */
const RANGES = [
  { key: "7d", label: "Last 7 days" },
  { key: "28d", label: "Last 28 days" },
  { key: "custom", label: "Custom" },
];

export default function DashboardHome({ onGoTranscribe, onGoScripts }) {
  const isPhone = useIsMobile(680);
  const { active, activeId } = useProfiles();

  const [range, setRange] = useState("7d");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  // Defaults to the channel they are working in, not to "all". Unlike the script
  // history, the numbers here answer "how is THIS channel doing" — and the voice
  // card underneath is meaningless without one channel to be about, since there
  // is no such thing as an average of two voices.
  const profileFilter = activeId || "all";

  const load = useCallback(async () => {
    // A custom range with only one date chosen isn't a range yet — don't fetch
    // and don't show an error for a half-finished action.
    if (range === "custom" && !(custom.from && custom.to)) return;
    setBusy(true);
    setError("");
    try {
      const params = { range };
      if (range === "custom") { params.from = custom.from; params.to = custom.to; }
      if (profileFilter && profileFilter !== "all") params.profile = profileFilter;
      const { data } = await api.get("/stats/dashboard", { params });
      setData(data);
    } catch (err) {
      setError(errorMessage(err, "Couldn't load your dashboard."));
    } finally {
      setBusy(false);
    }
  }, [range, custom.from, custom.to, profileFilter]);

  useEffect(() => { load(); }, [load]);

  const gut = isPhone ? 16 : 30;

  return (
    <div className="hg-scroll" style={{ flex: 1, minHeight: 0, width: "100%", padding: `${isPhone ? 18 : 28}px ${gut}px 60px` }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: isPhone ? 21 : 25, fontWeight: 750, letterSpacing: "-0.03em", color: "var(--ink)", margin: "0 0 5px" }}>
            Dashboard
          </h1>
          <p style={{ fontSize: 14, color: "var(--ink-body)", margin: 0 }}>
            Your voice, and what you've made with it.
          </p>
        </div>

        {/* No profile picker here — the app bar above carries it on every
            screen. See Shell/TopBar.js. */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>

          <div
            role="group"
            aria-label="Date range"
            style={{
              display: "inline-flex", padding: 3, gap: 2,
              background: "#F2F2F2", border: "1px solid var(--line)", borderRadius: 10,
            }}
          >
            {RANGES.map((r) => {
              const on = r.key === range;
              return (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  aria-pressed={on}
                  style={{
                    fontSize: 12.5, fontWeight: on ? 600 : 500, padding: "6px 11px",
                    borderRadius: 8, border: "none", cursor: "pointer", whiteSpace: "nowrap",
                    background: on ? "var(--card)" : "transparent",
                    color: on ? "var(--ink)" : "var(--ink-mute)",
                    boxShadow: on ? "0 1px 2px rgba(15,15,15,.09)" : "none",
                  }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>

          {range === "custom" && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <DateInput value={custom.from} onChange={(v) => setCustom((c) => ({ ...c, from: v }))} label="From" />
              <span style={{ fontSize: 13, color: "var(--ink-mute)" }}>to</span>
              <DateInput value={custom.to} onChange={(v) => setCustom((c) => ({ ...c, to: v }))} label="To" />
            </div>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            marginTop: 18, padding: "12px 14px", borderRadius: 10,
            background: "#FCE8E6", border: "1px solid #F5C7C3",
            color: "var(--bad)", fontSize: 13.5,
          }}
        >
          {error}
        </div>
      )}

      {range === "custom" && !(custom.from && custom.to) && (
        <p style={{ marginTop: 18, fontSize: 13.5, color: "var(--ink-mute)" }}>
          Pick both dates to see the range.
        </p>
      )}

      <div
        style={{
          marginTop: 22, display: "grid", gap: isPhone ? 12 : 16,
          gridTemplateColumns: isPhone ? "1fr" : "repeat(auto-fit, minmax(230px, 1fr))",
          opacity: busy && data ? 0.5 : 1, transition: "opacity .15s ease",
        }}
      >
        <Stat
          label="Videos teaching your voice"
          loading={!data}
          value={data ? `${data.videos.used}` : ""}
          suffix={data ? `of ${data.videos.max}` : ""}
          note={
            data
              ? data.videos.left > 0
                ? `${data.videos.left} slot${data.videos.left === 1 ? "" : "s"} free · not affected by the date filter`
                : "All slots used · not affected by the date filter"
              : ""
          }
          // The whole card is the link, not a button inside it. A number that
          // means "your voice" and a screen called My voice are the same thing;
          // making the reader hunt for a small button to connect them is a step
          // that exists only because the markup happened that way.
          onClick={onGoTranscribe}
          actionLabel="Add or manage videos"
          meter={data ? { used: data.videos.used, max: data.videos.max } : null}
        />

        <Stat
          label="Scripts generated"
          loading={!data}
          value={data ? `${data.scripts.in_range}` : ""}
          suffix={data ? data.range.label.toLowerCase() : ""}
          note={data ? `${data.scripts.all_time} all time` : ""}
          onClick={onGoScripts}
          actionLabel="Read them"
          tone="made"
        />

        <Stat
          label={active?.name ? `Voice · ${active.name}` : "Voice profile"}
          loading={!data}
          value={data?.voice ? confidenceLabel(data.voice.confidence) : data ? "Not built" : ""}
          suffix={data?.voice?.language_label || ""}
          note={
            data?.voice
              ? data.voice.stale
                ? "Out of date. Re-analyse to pick up your latest videos."
                : `Learned from ${data.voice.transcript_count} video${data.voice.transcript_count === 1 ? "" : "s"}`
              : data ? "Add videos, then analyse your voice" : ""
          }
          onClick={onGoTranscribe}
          actionLabel={!data?.voice || data?.voice?.stale ? "Analyse my voice" : "See what we learned"}
          // The card's colour is the confidence itself. A thin profile looking
          // exactly like a good one is how someone ships a script that doesn't
          // sound like them and blames the product.
          tone={
            !data ? "normal"
              : data?.voice?.stale ? "warn"
              : !data?.voice ? "normal"
              : data.voice.confidence === "good" ? "good"
              : data.voice.confidence === "fair" ? "fair"
              : "warn"
          }
        />
      </div>

      {!data && (
        <section style={{ marginTop: 34 }}>
          <Skeleton variant="text" width={150} height={10} />
          <div style={{ height: 12 }} />
          <Skeleton variant="rectangular" height={110} />
        </section>
      )}

      {data?.by_day?.length > 0 && (
        <Activity days={data.by_day} label={data.range.label} isPhone={isPhone} />
      )}

      {data?.recent_scripts?.length > 0 && (
        <section style={{ marginTop: 34 }}>
          <h2
            style={{
              fontSize: 11.5, fontWeight: 600, letterSpacing: "0.13em",
              textTransform: "uppercase", color: "var(--ink-mute)", margin: "0 0 11px",
            }}
          >
            Recent scripts
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {data.recent_scripts.map((s, i) => (
              <div
                key={i}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 12, padding: "12px 14px", borderRadius: 10,
                  background: "var(--card)", border: "1px solid var(--line)",
                }}
              >
                <span style={{ fontSize: 14, color: "var(--ink)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.headline || "Untitled"}
                </span>
                <span style={{ fontSize: 12, color: "var(--ink-mute)", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {new Date(s.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ── Pieces ────────────────────────────────────────────────────────────── */

/**
 * Tone is state, never decoration. Each of these means something a creator can
 * act on: your profile is thin, your profile is stale, you made this many.
 */
const TONES = {
  normal: { tint: "var(--card)", line: "var(--line)", ink: "var(--ink)" },
  made:   { tint: "var(--made-tint)", line: "var(--made-line)", ink: "var(--made)" },
  good:   { tint: "#EDF8F1", line: "#C6E7D3", ink: "#08733E" },
  fair:   { tint: "#FBF5E8", line: "#EEDCB6", ink: "#8F5E07" },
  warn:   { tint: "#FCF0F2", line: "#F3D3D8", ink: "#AB2C41" },
};

function Stat({ label, value, suffix, note, onClick, actionLabel, tone = "normal", meter, loading }) {
  const t = TONES[tone] || TONES.normal;
  const plain = tone === "normal";

  const body = (
    <>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-mute)", marginBottom: 10 }}>
        {label}
      </div>

      {/* Never a dash, never a zero. The old version rendered "—" until the
          request landed, and for that moment it was a claim someone could read
          and believe. A skeleton cannot be mistaken for a value. */}
      {loading ? (
        <>
          <Skeleton variant="text" width={72} height={26} />
          <div style={{ height: 12 }} />
          <Skeleton variant="text" width="86%" height={10} />
          <div style={{ height: 6 }} />
          <Skeleton variant="text" width="54%" height={10} />
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
            <span style={{ fontSize: 28, fontWeight: 750, letterSpacing: "-0.03em", color: t.ink, lineHeight: 1 }}>
              {value}
            </span>
            {suffix && <span style={{ fontSize: 13, color: "var(--ink-mute)" }}>{suffix}</span>}
          </div>

          {meter && (
            <div style={{ display: "flex", gap: 5, marginTop: 12 }}>
              {Array.from({ length: meter.max }, (_, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  style={{
                    height: 5, flex: 1, borderRadius: 99,
                    background: i < meter.used ? "var(--made)" : "#E8E8E8",
                  }}
                />
              ))}
            </div>
          )}

          {note && (
            <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-mute)", marginTop: 9 }}>
              {note}
            </div>
          )}

          {onClick && actionLabel && (
            <div
              style={{
                marginTop: 12, fontSize: 12.5, fontWeight: 600, color: "var(--ink-body)",
                display: "flex", alignItems: "center", gap: 5,
              }}
            >
              {actionLabel}
              <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1 }}>›</span>
            </div>
          )}
        </>
      )}
    </>
  );

  const style = {
    padding: 18, borderRadius: "var(--radius)", textAlign: "left", width: "100%",
    background: plain ? "var(--card)" : `linear-gradient(170deg, ${t.tint} 0%, var(--card) 68%)`,
    border: `1px solid ${t.line}`,
  };

  // A div while loading: a button that navigates before its own label exists is
  // a target someone can hit without knowing what they hit.
  if (!onClick || loading) return <div style={style}>{body}</div>;

  return (
    <button type="button" onClick={onClick} className="hg-row" style={{ ...style, cursor: "pointer", font: "inherit" }}>
      {body}
    </button>
  );
}

/**
 * Bars, drawn with divs. A chart library for one sparkline would be a bigger
 * download than the entire rest of this app.
 */
function Activity({ days, label, isPhone }) {
  const max = Math.max(...days.map((d) => d.count), 1);
  return (
    <section style={{ marginTop: 34 }}>
      <h2
        style={{
          fontSize: 11.5, fontWeight: 600, letterSpacing: "0.13em",
          textTransform: "uppercase", color: "var(--ink-mute)", margin: "0 0 12px",
        }}
      >
        Scripts per day · {label}
      </h2>
      <div
        style={{
          display: "flex", alignItems: "flex-end", gap: 4, height: 110,
          padding: "12px 14px", borderRadius: "var(--radius)",
          background: "var(--card)", border: "1px solid var(--line)", overflowX: "auto",
        }}
      >
        {days.map((d) => (
          <div
            key={d.day}
            title={`${d.day}: ${d.count} script${d.count === 1 ? "" : "s"}`}
            style={{ flex: 1, minWidth: isPhone ? 10 : 14, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}
          >
            <div
              style={{
                height: `${Math.max(4, (d.count / max) * 100)}%`,
                // Same hue as the scripts count above it: one colour for the
                // one thing this app produces.
                background: d.count ? "var(--made)" : "#EDEDED",
                borderRadius: 4,
              }}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function DateInput({ value, onChange, label }) {
  return (
    <input
      type="date"
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      style={{
        fontSize: 12.5, padding: "7px 10px", borderRadius: 8,
        border: "1px solid var(--line)", background: "var(--card)",
        color: "var(--ink)", outline: "none", fontFamily: "inherit",
        // iOS forces these to 16px (see index.css). Without a shrink floor, two
        // date fields plus "to" overflow a 360px screen.
        minWidth: 0, flex: "1 1 130px",
      }}
    />
  );
}

function confidenceLabel(c) {
  return c === "good" ? "Good" : c === "fair" ? "Fair" : "Thin";
}

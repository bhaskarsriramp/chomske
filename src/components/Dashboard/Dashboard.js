import { useState } from "react";
import useIsMobile from "../../hooks/useIsMobile";
import NewsFeed from "../News/NewsFeed";
import TranscribePanel from "../Transcribe/TranscribePanel";

/**
 * The app shell.
 *
 * Two halves of one workflow — pick what to talk about, then study how someone
 * already talked about it — so they're tabs in one window rather than separate
 * pages. The shell owns the viewport (`hg-app` pins it to 100dvh) and each panel
 * scrolls inside it, which is what lets the feed keep a fixed filter bar and a
 * pair of independently scrolling columns.
 *
 * ── WHY PANELS ARE HIDDEN, NOT UNMOUNTED ─────────────────────────────────────
 * Transcription polls a background job. Unmounting the panel on a tab switch
 * would clear that interval and lose the result, so a user who checks the feed
 * while a long video processes would come back to nothing. Each panel mounts the
 * first time its tab is opened and then stays mounted, hidden.
 */
const TABS = [
  { id: "topics", label: "Topics" },
  { id: "transcribe", label: "Transcribe" },
];

export default function Dashboard({ user, onSignOut }) {
  const isPhone = useIsMobile(680);

  const [tab, setTab] = useState("topics");
  const [mounted, setMounted] = useState({ topics: true });
  const [quota, setQuota] = useState(null);

  function openTab(id) {
    setTab(id);
    setMounted((m) => (m[id] ? m : { ...m, [id]: true }));
  }

  return (
    <div className="hg-app" style={{ display: "flex", flexDirection: "column", background: "var(--paper)" }}>
      <header
        style={{
          display: "flex", alignItems: "center", gap: isPhone ? 10 : 22,
          padding: `0 ${isPhone ? 14 : 20}px`, height: isPhone ? 54 : 58,
          borderBottom: "1px solid var(--line)", background: "var(--card)", flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span
            aria-hidden="true"
            style={{
              width: 26, height: 26, borderRadius: 8, background: "var(--ink)", color: "#fff",
              display: "grid", placeItems: "center", fontSize: 14, fontWeight: 700,
              fontFamily: '"Noto Sans Devanagari", Inter, sans-serif',
            }}
          >
            ह
          </span>
          {/* The wordmark is the first thing to go on a phone — the tabs are
              what people actually need to reach. */}
          {!isPhone && (
            <span style={{ fontWeight: 700, fontSize: 15.5, color: "var(--ink)", letterSpacing: "-0.02em" }}>
              Hinglish
            </span>
          )}
        </div>

        <nav style={{ display: "flex", alignSelf: "stretch", gap: isPhone ? 4 : 6 }}>
          {TABS.map((t) => {
            const on = t.id === tab;
            return (
              <button
                key={t.id}
                onClick={() => openTab(t.id)}
                aria-current={on ? "page" : undefined}
                style={{
                  position: "relative", border: "none", background: "transparent",
                  padding: `0 ${isPhone ? 8 : 4}px`, cursor: "pointer",
                  fontSize: isPhone ? 14 : 14.5, fontWeight: on ? 650 : 500,
                  color: on ? "var(--ink)" : "var(--ink-mute)",
                  // The rule sits on the header's own bottom border rather than
                  // under the label, so the tab reads as attached to the panel.
                  boxShadow: on ? "inset 0 -2px 0 0 var(--accent)" : "none",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: isPhone ? 9 : 14, marginLeft: "auto" }}>
          {quota && !isPhone && (
            <span style={{ fontSize: 12.5, color: "var(--ink-mute)" }} title="Videos transcribed today">
              {quota.used}/{quota.limit} today
            </span>
          )}
          {user?.picture && (
            <img
              src={user.picture}
              alt=""
              referrerPolicy="no-referrer"
              style={{ width: 27, height: 27, borderRadius: "50%", border: "1px solid var(--line)" }}
            />
          )}
          <button
            onClick={onSignOut}
            className="hg-btn-ghost"
            style={{
              fontSize: 13, fontWeight: 500, padding: "6px 12px", borderRadius: 9,
              border: "1px solid var(--line)", background: "transparent",
              color: "var(--ink-mute)", cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            {isPhone ? "Exit" : "Sign out"}
          </button>
        </div>
      </header>

      <main style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {mounted.topics && (
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: tab === "topics" ? "flex" : "none" }}>
            {/* A creator with no transcripts can't have a voice yet — the script
                panel sends them here rather than dead-ending. */}
            <NewsFeed onGoTranscribe={() => openTab("transcribe")} />
          </div>
        )}
        {mounted.transcribe && (
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: tab === "transcribe" ? "flex" : "none" }}>
            {/* setQuota is a stable setState reference — an inline arrow here
                would change identity every render and re-fire the panel's
                history fetch in a loop. */}
            <TranscribePanel onQuota={setQuota} />
          </div>
        )}
      </main>
    </div>
  );
}

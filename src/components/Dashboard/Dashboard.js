import { useState, useCallback } from "react";
import useIsMobile from "../../hooks/useIsMobile";
import Sidebar from "../Shell/Sidebar";
import NewsFeed from "../News/NewsFeed";
import TranscribePanel from "../Transcribe/TranscribePanel";
import DashboardHome from "./DashboardHome";
import ProfilePanel from "../Profile/ProfilePanel";

/**
 * The app shell.
 *
 * A sidebar rather than tabs because there are now four destinations in two
 * different jobs — making today's video, and managing the account behind it —
 * and a flat row of four tabs says nothing about which is which.
 *
 * ── WHY PANELS ARE HIDDEN, NOT UNMOUNTED ─────────────────────────────────────
 * Transcription polls a background job. Unmounting on navigation would clear the
 * interval and lose the result, so someone who checks Topics while a video
 * processes would come back to nothing. Each panel mounts the first time it is
 * opened and then stays mounted, hidden. Dashboard is the exception — it holds no
 * in-flight work and its numbers should be fresh on every visit, so it remounts.
 */
export default function Dashboard({ user, onSignOut }) {
  const isNarrow = useIsMobile(900);

  const [tab, setTab] = useState("topics");
  const [mounted, setMounted] = useState({ topics: true });
  const [drawer, setDrawer] = useState(false);
  const [quota, setQuota] = useState(null);
  // Bumped whenever the voice set changes, so the script panel re-reads the
  // profile instead of offering to write in a voice that no longer exists.
  const [voiceRev, setVoiceRev] = useState(0);

  const openTab = useCallback((id) => {
    setTab(id);
    setMounted((m) => (m[id] ? m : { ...m, [id]: true }));
    setDrawer(false);
  }, []);

  const bumpVoice = useCallback(() => setVoiceRev((n) => n + 1), []);

  return (
    <div className="hg-app" style={{ display: "flex", background: "var(--paper)" }}>
      <Sidebar
        tab={tab}
        onTab={openTab}
        isNarrow={isNarrow}
        open={drawer}
        onClose={() => setDrawer(false)}
        user={user}
      />

      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {isNarrow && (
          <header
            style={{
              display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
              height: 54, padding: "0 14px",
              borderBottom: "1px solid var(--line)", background: "var(--card)",
            }}
          >
            <button
              onClick={() => setDrawer(true)}
              aria-label="Open menu"
              style={{
                display: "grid", placeItems: "center", width: 34, height: 34,
                borderRadius: 9, border: "1px solid var(--line)",
                background: "var(--card)", color: "var(--ink)", cursor: "pointer",
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <span style={{ fontWeight: 700, fontSize: 15.5, color: "var(--ink)", letterSpacing: "-0.02em" }}>
              {TITLES[tab]}
            </span>
            {quota && (
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--ink-mute)" }}>
                {quota.used}/{quota.limit} today
              </span>
            )}
          </header>
        )}

        <main style={{ flex: 1, minHeight: 0, display: "flex" }}>
          {mounted.topics && (
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: tab === "topics" ? "flex" : "none" }}>
              <NewsFeed
                voiceRev={voiceRev}
                onGoTranscribe={() => openTab("transcribe")}
              />
            </div>
          )}

          {mounted.transcribe && (
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: tab === "transcribe" ? "flex" : "none" }}>
              {/* setQuota is a stable setState reference — an inline arrow would
                  change identity every render and re-fire the panel's fetch. */}
              <TranscribePanel onQuota={setQuota} onVoiceChange={bumpVoice} />
            </div>
          )}

          {/* Remounted on each visit on purpose: it holds no polling work, and a
              dashboard showing numbers cached from an hour ago is worse than one
              that takes a moment to load. */}
          {tab === "dashboard" && (
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex" }}>
              <DashboardHome onGoTranscribe={() => openTab("transcribe")} />
            </div>
          )}

          {tab === "profile" && (
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex" }}>
              <ProfilePanel user={user} onSignOut={onSignOut} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

const TITLES = {
  topics: "Topics",
  transcribe: "My voice",
  dashboard: "Dashboard",
  profile: "Profile",
};

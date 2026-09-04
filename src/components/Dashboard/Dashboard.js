import { useState, useCallback, useEffect } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import useIsMobile from "../../hooks/useIsMobile";
import Sidebar, { MOBILE_HEADER_H } from "../Shell/Sidebar";
import NewsFeed from "../News/NewsFeed";
import TranscribePanel from "../Transcribe/TranscribePanel";
import DashboardHome from "./DashboardHome";
import ProfilePanel from "../Profile/ProfilePanel";
import ScriptsPanel from "../Scripts/ScriptsPanel";
import Logo from "../Shell/Logo";
import CreditsProvider from "../../state/CreditsContext";
import ProfileProvider, { useProfiles } from "../../state/ProfileContext";
import { CreditsPill } from "../Shell/CreditsCard";

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
export const TAB_IDS = ["topics", "voice", "scripts", "dashboard", "profile"];

/**
 * Both providers wrap the whole shell rather than individual panels.
 *
 * The balance is read by the sidebar, the mobile header and the order panel, and
 * the selected profile by every screen — all of which are mounted at once here
 * (panels are hidden, not unmounted). Per-panel state would mean several copies
 * of each, disagreeing the moment one of them changed.
 */
export default function Dashboard(props) {
  return (
    <CreditsProvider>
      <ProfileProvider>
        <Shell {...props} />
      </ProfileProvider>
    </CreditsProvider>
  );
}

function Shell({ user, onSignOut }) {
  const isNarrow = useIsMobile(900);
  const { tab: tabParam } = useParams();
  const navigate = useNavigate();

  // The URL is the source of truth for which screen is open, so browser back
  // and a page refresh both land where the user actually was.
  const tab = tabParam;
  const [mounted, setMounted] = useState({ [tabParam]: true });
  const [drawer, setDrawer] = useState(false);
  const [quota, setQuota] = useState(null);
  // Bumped whenever the voice set changes, so the script panel re-reads the
  // profile instead of offering to write in a voice that no longer exists.
  const [voiceRev, setVoiceRev] = useState(0);

  const { activeId, refresh: refreshProfiles } = useProfiles();

  const openTab = useCallback((id) => {
    navigate(`/app/${id}`);
    setDrawer(false);
  }, [navigate]);

  // Panels are kept mounted once visited (see the note above), and the URL can
  // now arrive from a link or the back button rather than only from openTab —
  // so registration happens here, on whatever tab is current.
  useEffect(() => {
    setMounted((m) => (m[tab] ? m : { ...m, [tab]: true }));
  }, [tab]);

  // The profile's videos or voice changed — re-read the list (counts,
  // staleness) and tell the panels to re-read the voice.
  const bumpVoice = useCallback(() => {
    setVoiceRev((n) => n + 1);
    refreshProfiles();
  }, [refreshProfiles]);

  // Escape closes the drawer. Also close it if the viewport grows into the
  // desktop layout — otherwise the overlay state survives the resize and blocks
  // the page behind a sidebar that is already permanently visible.
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e) => { if (e.key === "Escape") setDrawer(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  useEffect(() => { if (!isNarrow) setDrawer(false); }, [isNarrow]);

  // A typo or a stale bookmark shouldn't render an empty shell.
  if (!TAB_IDS.includes(tabParam)) return <Navigate to="/app/topics" replace />;

  return (
    <div className="hg-app" style={{ display: "flex", background: "var(--paper)" }}>
      <Sidebar
        tab={tab}
        onTab={openTab}
        isNarrow={isNarrow}
        open={drawer}
        onClose={() => setDrawer(false)}
      />

      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {/* Wordmark left, menu control right — the drawer opens from the right,
            under the thumb that reaches the button. The header stays above the
            drawer and its backdrop so the close control never moves. */}
        {isNarrow && (
          <header
            style={{
              display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
              height: MOBILE_HEADER_H, padding: "0 14px",
              borderBottom: "1px solid var(--line)", background: "var(--card)",
              position: "relative", zIndex: 52,
            }}
          >
            <Logo size={26} fontSize={15.5} />

            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              {/* Credits before the daily quota: it is the number that decides
                  whether the next thing they try will work at all, and on a
                  narrow header only one of the two survives. */}
              {!drawer && <CreditsPill />}
              {quota && !drawer && (
                <span style={{ fontSize: 12, color: "var(--ink-mute)", whiteSpace: "nowrap" }}>
                  {quota.used}/{quota.limit}
                </span>
              )}
              <button
                onClick={() => setDrawer((d) => !d)}
                aria-label={drawer ? "Close menu" : "Open menu"}
                aria-expanded={drawer}
                style={{
                  display: "grid", placeItems: "center", width: 36, height: 36,
                  borderRadius: 9, border: "none",
                  background: "transparent", color: "var(--ink)", cursor: "pointer",
                }}
              >
                {drawer ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                    <path d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                )}
              </button>
            </span>
          </header>
        )}

        <main style={{ flex: 1, minHeight: 0, display: "flex" }}>
          {mounted.topics && (
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: tab === "topics" ? "flex" : "none" }}>
              <NewsFeed
                voiceRev={voiceRev}
                profileId={activeId}
                onGoTranscribe={() => openTab("voice")}
              />
            </div>
          )}

          {mounted.voice && (
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: tab === "voice" ? "flex" : "none" }}>
              {/* setQuota is a stable setState reference — an inline arrow would
                  change identity every render and re-fire the panel's fetch. */}
              <TranscribePanel
                onQuota={setQuota}
                onVoiceChange={bumpVoice}
                onGoProfiles={() => openTab("profile")}
              />
            </div>
          )}

          {/* Remounted on each visit, like the dashboard: a list of scripts is a
              record, and a stale one is a record that has silently stopped being
              true the moment another script finishes writing. */}
          {tab === "scripts" && (
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex" }}>
              <ScriptsPanel onGoTopics={() => openTab("topics")} />
            </div>
          )}

          {/* Remounted on each visit on purpose: it holds no polling work, and a
              dashboard showing numbers cached from an hour ago is worse than one
              that takes a moment to load. */}
          {tab === "dashboard" && (
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex" }}>
              <DashboardHome
                onGoTranscribe={() => openTab("voice")}
                onGoScripts={() => openTab("scripts")}
              />
            </div>
          )}

          {tab === "profile" && (
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex" }}>
              <ProfilePanel
                user={user}
                onSignOut={onSignOut}
                onGoVoice={() => openTab("voice")}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// No section title in the mobile header on purpose: every panel already opens
// with its own heading, so a second copy in the bar is just a duplicate eating
// the row the wordmark and menu control need.

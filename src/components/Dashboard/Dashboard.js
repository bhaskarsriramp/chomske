import { useState, useCallback, useEffect } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import useIsMobile from "../../hooks/useIsMobile";
import Sidebar, { MOBILE_HEADER_H } from "../Shell/Sidebar";
import CreatePage from "../Create/CreatePage";
import TranscribePanel from "../Transcribe/TranscribePanel";
import DashboardHome from "./DashboardHome";
import ProfilePanel from "../Profile/ProfilePanel";
import SupportPanel from "../Support/SupportPanel";
import ScriptsPanel from "../Scripts/ScriptsPanel";
import Logo from "../Shell/Logo";
import CreditsProvider from "../../state/CreditsContext";
import ProfileProvider, { useProfiles } from "../../state/ProfileContext";
import VoiceProvider from "../../state/VoiceContext";
import ShowcaseProvider, { useShowcase } from "../../state/ShowcaseContext";
import AnalysisPanel from "../Showcase/AnalysisPanel";
import { CreditsPill } from "../Shell/CreditsCard";

/**
 * The app shell.
 *
 * A sidebar rather than tabs because there are now four destinations in two
 * different jobs (making today's video, and managing the account behind it),
 * and a flat row of four tabs says nothing about which is which.
 *
 * ── WHY PANELS ARE HIDDEN, NOT UNMOUNTED ─────────────────────────────────────
 * Transcription polls a background job. Unmounting on navigation would clear the
 * interval and lose the result, so someone who checks Topics while a video
 * processes would come back to nothing. Each panel mounts the first time it is
 * opened and then stays mounted, hidden. Dashboard is the exception: it holds no
 * in-flight work and its numbers should be fresh on every visit, so it remounts.
 */
/**
 * ── THREE OF THESE ARE ONE SCREEN ────────────────────────────────────────────
 * discover, import and idea are the three modes of Create (see
 * components/Create/CreatePage.js). They are separate tab ids, and therefore
 * separate URLs, because each is a real destination: back and forward work,
 * a refresh lands where you were, and a mode can be linked to. They are NOT
 * separate panels: one CreatePage is mounted for all three, so a generation in
 * flight survives a mode switch.
 *
 * The old "topics" id is deliberately NOT in this list. It falls through to the
 * catch-all redirect below and lands on Discover, which is what it used to show.
 */
export const CREATE_TABS = ["discover", "import", "idea"];
// "analysis" is reachable only in showcase mode, but it lives in the shared
// list so a stale link or a refresh on it resolves rather than bouncing to
// Discover. Shell below sends a human who lands there to Discover instead.
export const TAB_IDS = [...CREATE_TABS, "analysis", "voice", "scripts", "dashboard", "profile", "support"];

/**
 * All three providers wrap the whole shell rather than individual panels.
 *
 * The balance is read by the sidebar, the mobile header and the order panel, and
 * the selected profile by every screen, all of which are mounted at once here
 * (panels are hidden, not unmounted). Per-panel state would mean several copies
 * of each, disagreeing the moment one of them changed.
 *
 * The voice is the newest of the three and the one with the strongest claim to
 * being up here: a build runs for minutes on the server, and a creator spends
 * those minutes on another screen. Owned by a panel, the wait ended wherever
 * that panel was; owned here, it follows them. VoiceProvider is inside
 * ProfileProvider because it reads the active channel.
 */
/**
 * ShowcaseProvider is OUTSIDE the other three, and that ordering matters.
 *
 * It owns the sign-up dialog, which is the one thing on this screen that
 * outlives everything else: pressing Continue with Google replaces the session
 * and reloads the app. Nesting it under the credits or profile providers would
 * put a dialog that ends the session inside state scoped to that session.
 */
export default function Dashboard(props) {
  return (
    <ShowcaseProvider user={props.user}>
      <CreditsProvider>
        <ProfileProvider>
          <VoiceProvider>
            <Shell {...props} />
          </VoiceProvider>
        </ProfileProvider>
      </CreditsProvider>
    </ShowcaseProvider>
  );
}

function Shell({ user, onSignOut }) {
  const isNarrow = useIsMobile(900);
  const { tab: tabParam } = useParams();
  const navigate = useNavigate();

  // The URL is the source of truth for which screen is open, so browser back
  // and a page refresh both land where the user actually was.
  const tab = tabParam;
  const isCreate = CREATE_TABS.includes(tab);
  const [mounted, setMounted] = useState(
    () => ({ [CREATE_TABS.includes(tabParam) ? "create" : tabParam]: true })
  );
  const [drawer, setDrawer] = useState(false);

  const { activeId, refresh: refreshProfiles } = useProfiles();
  const { isShowcase } = useShowcase();

  const openTab = useCallback((id) => {
    navigate(`/app/${id}`);
    setDrawer(false);
  }, [navigate]);

  // Panels are kept mounted once visited (see the note above), and the URL can
  // now arrive from a link or the back button rather than only from openTab,
  // so registration happens here, on whatever tab is current.
  // The three Create modes share one mount key, because they share one mounted
  // component. Registering them separately would do nothing except make the map
  // lie about what is on the page.
  const mountKey = CREATE_TABS.includes(tab) ? "create" : tab;
  useEffect(() => {
    setMounted((m) => (m[mountKey] ? m : { ...m, [mountKey]: true }));
  }, [mountKey]);

  // The profile's videos or voice changed: re-read the list, whose per-channel
  // counts and staleness flags this shell renders. The voice ITSELF no longer
  // needs telling, every screen reads one live copy of it from VoiceProvider,
  // which is what replaced the revision counter this used to bump.
  const bumpVoice = useCallback(() => { refreshProfiles(); }, [refreshProfiles]);

  // Escape closes the drawer. Also close it if the viewport grows into the
  // desktop layout; otherwise the overlay state survives the resize and blocks
  // the page behind a sidebar that is already permanently visible.
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e) => { if (e.key === "Escape") setDrawer(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  useEffect(() => { if (!isNarrow) setDrawer(false); }, [isNarrow]);

  // A typo or a stale bookmark shouldn't render an empty shell. /app/topics is
  // the specific stale bookmark we know exists, and it lands on Discover, which
  // is what it used to show.
  if (!TAB_IDS.includes(tabParam)) return <Navigate to="/app/discover" replace />;

  // Three screens exist only for one of the two session kinds, and landing on
  // the wrong one should move you rather than render an empty shell: a showcase
  // has no account to show a Dashboard, Profile or Support page for, and a
  // signed-in creator has no showcase to analyse.
  if (isShowcase && ["dashboard", "profile", "support"].includes(tab)) {
    return <Navigate to="/app/discover" replace />;
  }
  if (!isShowcase && tab === "analysis") {
    return <Navigate to="/app/discover" replace />;
  }

  return (
    <div className="hg-app" style={{ display: "flex", background: "var(--paper)" }}>
      <Sidebar
        tab={tab}
        onTab={openTab}
        isNarrow={isNarrow}
        open={drawer}
        onClose={() => setDrawer(false)}
        showcase={isShowcase}
      />

      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {/* Wordmark left, menu control right. The drawer opens from the right,
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
              {/* Credits only. The daily transcription quota used to sit beside
                  this as a bare "0/10", which on a header with no room for a
                  label is a fraction of nothing: two numbers, neither saying
                  what it counts. The one that decides whether the next thing
                  they try will work at all is the balance. */}
              {!drawer && <CreditsPill />}
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
          {/* Where a showcase link lands. Remounted on each visit rather than
              kept alive: it holds no in-flight work, and it is the screen most
              likely to be returned to after the videos change, at which point
              the numbers on it are the old ones. */}
          {isShowcase && tab === "analysis" && (
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex" }}>
              <AnalysisPanel user={user} onGoCreate={() => openTab("discover")} />
            </div>
          )}

          {/* One page for all three Create modes. Mounted under a single key so
              switching between them never unmounts the others: each can have a
              paid generation polling for a result, and the shell's whole
              hidden-not-unmounted rule exists to stop exactly that being lost. */}
          {mounted.create && (
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: isCreate ? "flex" : "none" }}>
              <CreatePage
                mode={tab}
                onMode={openTab}
                profileId={activeId}
                onGoTranscribe={() => openTab("voice")}
              />
            </div>
          )}

          {mounted.voice && (
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: tab === "voice" ? "flex" : "none" }}>
              <TranscribePanel
                onVoiceChange={bumpVoice}
                onGoProfiles={() => openTab("profile")}
                onGoTopics={() => openTab("discover")}
              />
            </div>
          )}

          {/* Remounted on each visit, like the dashboard: a list of scripts is a
              record, and a stale one is a record that has silently stopped being
              true the moment another script finishes writing. */}
          {tab === "scripts" && (
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex" }}>
              <ScriptsPanel onGoTopics={() => openTab("discover")} />
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

          {/* Remounted on each visit, like Profile and Dashboard: it holds no
              in-flight work, and the message it prefills carries the balance,
              which must be the one from this moment rather than from whenever
              the screen was first opened. */}
          {tab === "support" && (
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex" }}>
              <SupportPanel user={user} />
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

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import api, { errorMessage } from "../api";
import { onLiveEvent } from "../realtime/socket";
import { useProfiles } from "./ProfileContext";

/**
 * The account's voice, and whether it is being built right now.
 *
 * ── WHY THIS IS A PROVIDER AND NOT PANEL STATE ───────────────────────────────
 * Three screens ask the same question and used to each hold their own answer:
 * My voice (is it built, can I analyse), Create (is there a voice to write in),
 * and the story pane inside it. They were kept in step by a `voiceRev` counter
 * passed down from the shell and bumped by hand whenever something changed,
 * which worked only for changes a screen made itself. A build finishing on the
 * SERVER is not one of those, so whichever screen was not the one that pressed
 * the button went on showing the old answer until a reload.
 *
 * It also has to outlive the screen that started the work. Analysing runs to
 * minutes and a creator does not sit and watch it: they go and read the feed.
 * The build itself was never at risk, it runs server-side with no request
 * attached, but the only thing tracking it was the panel, so leaving the panel
 * meant losing the result. Held here, above the router, the wait survives every
 * navigation and lands wherever they happen to be.
 *
 * ── LIVE, WITH A POLL UNDERNEATH ─────────────────────────────────────────────
 * The socket carries the truth (backend routes/profiles.js publishes
 * voice:started / voice:progress / voice:built / voice:failed to this account's
 * own room). The poll is the floor: a socket is an improvement on polling and
 * never a dependency here, and a build that finishes while the connection is
 * down must still end on screen. It runs at 6s, slow enough to be a safety net
 * rather than a second implementation, and only while a build is in flight.
 */
const Ctx = createContext(null);

/** Empty enough that a consumer rendered outside the provider still works. */
const FALLBACK = {
  voice: null,
  building: false,
  progress: null,
  error: "",
  justBuilt: null,
  loading: true,
  analyse: async () => {},
  refresh: async () => {},
  clearError: () => {},
  clearJustBuilt: () => {},
};

export function useVoice() {
  return useContext(Ctx) || FALLBACK;
}

export default function VoiceProvider({ children }) {
  const { activeId, loading: profilesLoading, refresh: refreshProfiles } = useProfiles();

  const [voice, setVoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ── TWO SOURCES OF "IT IS BUILDING", DELIBERATELY ─────────────────────────
  // `voice.building` is the server's answer and is authoritative, but it lags:
  // the POST returns before the next read does, so between the press and the
  // first refetch the row still says false. `starting` covers exactly that gap,
  // and is cleared the moment the server's own answer arrives either way.
  const [starting, setStarting] = useState(false);
  const [progress, setProgress] = useState(null);

  // Set when a build FINISHES while this session was watching it, so the
  // celebration belongs to the person who waited. A returning creator whose
  // voice was built last week gets nothing, which is right.
  const [justBuilt, setJustBuilt] = useState(null);
  const watchingRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/script/voice", {
        params: { profile: activeId || undefined },
      });
      setVoice(data);
      return data;
    } catch {
      // Never surfaced. Every screen reading this degrades to "no voice yet",
      // which is a working state; a red banner because one status call failed
      // would break screens that are otherwise fine.
      return null;
    } finally {
      setLoading(false);
    }
  }, [activeId]);

  // Held until the profile list lands, so the first read is against the real
  // channel rather than against whatever the server considers default.
  useEffect(() => {
    if (profilesLoading) return;
    refresh();
  }, [refresh, profilesLoading]);

  // Switching channels switches the answer to every question here.
  useEffect(() => {
    setError("");
    setProgress(null);
    setStarting(false);
    setJustBuilt(null);
    watchingRef.current = false;
  }, [activeId]);

  const building = starting || !!voice?.building;

  /**
   * Start a build.
   *
   * The POST returns as soon as the work is claimed; everything real happens
   * after it, which is what the events and the poll below are for.
   */
  const analyse = useCallback(async () => {
    if (building || !activeId) return;
    setError("");
    setJustBuilt(null);
    setStarting(true);
    setProgress({ stage: "starting" });
    watchingRef.current = true;
    try {
      await api.post(`/profiles/${activeId}/analyse`, {}, { timeout: 60000 });
      // Confirms the claim landed and picks up `building: true` from the row,
      // so the spinner no longer rests on `starting` alone.
      await refresh();
    } catch (err) {
      setStarting(false);
      setProgress(null);
      watchingRef.current = false;
      setError(errorMessage(err, "Couldn't start the analysis. Please try again."));
    }
  }, [building, activeId, refresh]);

  // ── The live half ─────────────────────────────────────────────────────────
  // Registered once for the session rather than per screen: the events are for
  // the account, and a handler that comes and goes with a panel is a handler
  // that is absent for the part of the build a creator spent elsewhere.
  useEffect(() => {
    if (!activeId) return undefined;

    // An event for a channel we are not looking at is not ours to act on. The
    // account has one channel today (see ProfileContext) but the id is on every
    // event precisely so that stops being an assumption.
    const mine = (e) => !e?.profile || String(e.profile) === String(activeId);

    const offStarted = onLiveEvent("voice:started", (e) => {
      if (!mine(e)) return;
      setStarting(true);
      setProgress((p) => p || { stage: "starting" });
    });

    const offProgress = onLiveEvent("voice:progress", (e) => {
      if (!mine(e)) return;
      setStarting(true);
      setProgress({
        stage: e.stage || "analysing",
        done: e.done,
        total: e.total,
        videos: e.videos,
        title: e.title || "",
        language_label: e.language_label || "",
        failed: !!e.failed,
        at: e.at || new Date().toISOString(),
      });
    });

    // Deliberately only a refetch. The event carries the counts, but the settle
    // effect below already turns a finished row into `justBuilt`, and having
    // both write it would mean two code paths deciding when a creator gets
    // congratulated. The event's job is to make the refetch happen NOW rather
    // than on the next poll; the row remains the one thing screens render from,
    // and the server clears `building` before publishing this, so the refetch
    // cannot land back in the spinner (see runBuild in routes/profiles.js).
    const offBuilt = onLiveEvent("voice:built", (e) => {
      if (!mine(e)) return;
      setProgress(null);
      refresh();
    });

    const offFailed = onLiveEvent("voice:failed", async (e) => {
      if (!mine(e)) return;
      setStarting(false);
      setProgress(null);
      watchingRef.current = false;
      setError(e.message || "Couldn't analyse this voice. Please try again.");
      await refresh();
    });

    return () => { offStarted(); offProgress(); offBuilt(); offFailed(); };
  }, [activeId, refresh, refreshProfiles]);

  // ── The floor under it ────────────────────────────────────────────────────
  // Slow on purpose. This exists for the build that finishes while the socket
  // is down or the laptop is asleep, not to drive the screen: at three seconds
  // it would be a second implementation of the same thing, racing the events
  // and paying for it on every build.
  useEffect(() => {
    if (!building) return undefined;
    const t = setInterval(refresh, 6000);
    return () => clearInterval(t);
  }, [building, refresh]);

  // The poll's own arrival has to be able to END a build, which is the whole
  // point of having it: when the row comes back settled, believe it over
  // whatever the press or a missed event left behind.
  useEffect(() => {
    if (!voice) return;
    if (voice.building) {
      // Seeing a build in flight is enough to count as waiting on it, not only
      // having pressed the button. Somebody who reloads the page mid-analysis,
      // or opens the app in a second tab while it runs, is every bit as much
      // the person waiting, and was the one case that finished with no word.
      watchingRef.current = true;
      return;
    }
    setStarting(false);
    setProgress(null);
    if (!watchingRef.current) return;
    watchingRef.current = false;
    if (voice.build_error) { setError(voice.build_error); return; }
    if (voice.profile) {
      setJustBuilt({
        videos: voice.profile.transcript_count || 0,
        language: voice.profile.language_label || "",
      });
      refreshProfiles();
    }
  }, [voice, refreshProfiles]);

  // Stable, so a consumer can put them in an effect's dependencies without that
  // effect re-running every time anything else in here changes.
  const clearError = useCallback(() => setError(""), []);
  const clearJustBuilt = useCallback(() => setJustBuilt(null), []);

  const value = useMemo(
    () => ({
      voice, building, progress, error, justBuilt, loading,
      analyse, refresh, clearError, clearJustBuilt,
    }),
    [voice, building, progress, error, justBuilt, loading, analyse, refresh, clearError, clearJustBuilt]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

import { useState, useEffect, useCallback } from "react";
import api from "../../api";
import useIsMobile from "../../hooks/useIsMobile";
import NewsFeed from "../News/NewsFeed";
import ImportPanel from "./ImportPanel";
import IdeaPanel from "./IdeaPanel";
import ModeSwitch from "./ModeSwitch";

/**
 * Create: the one screen where a script gets made, and the three ways in.
 *
 * ── WHAT CHANGED, AND WHY IT IS ONE SCREEN AND NOT THREE ─────────────────────
 * This used to be Topics: a ranked feed, and nothing else. That put a hard
 * ceiling on the product. A creator could only write about what the collector
 * had found in the two or three categories they picked, so on a quiet day, or
 * for their own product launch, or for a story that broke somewhere we do not
 * source, the answer was an empty list. Somebody who opened the app ready to
 * work and found nothing to work on does not come back the next day.
 *
 * Import and Idea remove that ceiling without touching the expensive part. The
 * voice profile and the writer are the product; the feed was only ever one way
 * to feed them. So all three modes share the order panel, the price, the poll,
 * the script card and the upload package, and differ only in where the material
 * comes from.
 *
 * ── THE MODES ARE HIDDEN, NOT UNMOUNTED ──────────────────────────────────────
 * Same rule the app shell uses for its panels, for the same reason and with a
 * sharper edge here: all three of these can have a generation in flight, and a
 * script that costs real credits is polling for a result. Unmounting on a mode
 * switch would clear the interval and lose the answer to something the creator
 * has already paid for. It also means a half-typed brief survives a look at the
 * feed, which is the thing people actually do while deciding.
 *
 * ── ONE VOICE FETCH FOR ALL THREE ────────────────────────────────────────────
 * Every mode needs the same answer to "is there a voice to write in, and how
 * much of one". Fetched once here and passed down rather than three times, and
 * refetched when the voice set changes so a mode does not go on offering to
 * write in a profile that no longer exists.
 */
export default function CreatePage({ mode, onMode, profileId, voiceRev = 0, onGoTranscribe }) {
  const isPhone = useIsMobile(680);
  const isNarrow = useIsMobile(1100);

  const [voice, setVoice] = useState(null);
  const [limits, setLimits] = useState(null);

  const loadVoice = useCallback(async () => {
    try {
      const { data } = await api.get("/script/voice", {
        params: { profile: profileId || undefined },
      });
      setVoice(data);
    } catch {
      // Not surfaced. The order panel already handles a missing voice, and a
      // red banner over the whole screen because one status call failed would
      // hide a feed that is working perfectly well.
    }
  }, [profileId]);

  useEffect(() => { loadVoice(); }, [loadVoice, voiceRev]);

  /**
   * What the inputs will accept, from the server.
   *
   * The same rule the prices follow (see backend services/creditPricing.js):
   * a limit that exists in the browser AND on the server disagrees eventually,
   * and the copy under a box promising 6,000 characters over an API that
   * silently truncates at 4,000 is the version the creator holds us to.
   *
   * Failing quietly is fine, the panels carry sane defaults and the server
   * clamps regardless, so the worst case is slightly wrong help text.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/source/limits");
        if (!cancelled) setLimits(data.limits || null);
      } catch { /* defaults are fine */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Once a script finishes, the first run has also built the voice profile.
  const onVoiceChange = useCallback(() => { loadVoice(); }, [loadVoice]);

  const gut = isPhone ? 16 : 26;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, width: "100%" }}>
      {/* ── The switch, above everything ────────────────────────────────────
          Its own thin bar rather than inline with a panel heading, because each
          of the three panels owns its heading and putting the control inside
          one of them would make it look like that panel's setting. */}
      <div
        style={{
          flexShrink: 0, padding: `${isPhone ? 12 : 14}px ${gut}px`,
          borderBottom: "1px solid var(--line)", background: "var(--card)",
        }}
      >
        <ModeSwitch mode={mode} onMode={onMode} compact={isPhone} />
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: mode === "discover" ? "flex" : "none" }}>
          <NewsFeed
            voiceRev={voiceRev}
            profileId={profileId}
            onGoTranscribe={onGoTranscribe}
            onGoImport={() => onMode("import")}
            onGoIdea={() => onMode("idea")}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: mode === "import" ? "flex" : "none" }}>
          <ImportPanel
            voice={voice}
            onVoiceChange={onVoiceChange}
            onGoTranscribe={onGoTranscribe}
            compact={isNarrow}
            limits={limits}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: mode === "idea" ? "flex" : "none" }}>
          <IdeaPanel
            voice={voice}
            onVoiceChange={onVoiceChange}
            onGoTranscribe={onGoTranscribe}
            compact={isNarrow}
            limits={limits}
          />
        </div>
      </div>
    </div>
  );
}

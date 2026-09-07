import { useState, useEffect } from "react";
import api from "../../api";
import useIsMobile from "../../hooks/useIsMobile";
import NewsFeed from "../News/NewsFeed";
import ImportPanel from "./ImportPanel";
import IdeaPanel from "./IdeaPanel";
import ModeSwitch from "./ModeSwitch";
import { useVoice } from "../../state/VoiceContext";

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
 * ── ONE VOICE, AND IT IS NOT THIS SCREEN'S ───────────────────────────────────
 * All three modes need the same answer to "is there a voice to write in, and
 * how much of one", and so does My voice. This used to fetch its own copy and
 * refetch it whenever the shell bumped a `voiceRev` counter, which kept the
 * three modes in step with each other and with nothing else: a voice finishing
 * its build on the SERVER moved no counter, so a creator who pressed Analyse
 * and came here to read the feed sat in front of "Add a video first" over a
 * voice that was already built.
 *
 * It now reads state/VoiceContext.js, which follows the build live. The card
 * below turns into the order panel the moment the analysis lands, wherever the
 * creator happens to be standing when it does.
 */
export default function CreatePage({ mode, onMode, profileId, onGoTranscribe }) {
  const isPhone = useIsMobile(680);
  const isNarrow = useIsMobile(1100);

  const { voice, refresh: onVoiceChange } = useVoice();
  const [limits, setLimits] = useState(null);

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
            voice={voice}
            onVoiceChange={onVoiceChange}
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

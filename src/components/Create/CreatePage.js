import { useState, useEffect } from "react";
import api from "../../api";
import useIsMobile from "../../hooks/useIsMobile";
import NewsFeed from "../News/NewsFeed";
import ImportPanel from "./ImportPanel";
import IdeaPanel from "./IdeaPanel";
import ModeSwitch from "./ModeSwitch";
import { useVoice } from "../../state/VoiceContext";

/**
 * The heading each panel would otherwise draw for itself, hoisted so a phone
 * can show it on the same line as the switch. Keyed by mode, because the bar
 * is the one piece of chrome that survives switching panels.
 */
const MOBILE_TITLES = { discover: "What to cover today", import: "Import", idea: "Idea" };

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
          On a desktop it keeps its own thin bar, because each of the three
          panels owns its heading and putting the control inside one of them
          would make it look like that panel's setting.

          ── ON A PHONE IT SHARES THE ROW WITH THE TITLE ─────────────────────
          A phone had three stacked rows before this: the switch, then the
          panel's own heading with its refresh button, then the category chip.
          That is most of the first screen spent on furniture, above a feed that
          is the reason anyone opened the app.

          So on a phone the title moves up here and sits on one line with the
          switch, and each panel stops drawing its own (see `hideTitle`). The
          title has to live in THIS component rather than inside the panels,
          because the switch is what moves between them: rendered inside
          NewsFeed it would vanish the moment somebody switched to Import, and
          there would be no way back. */}
      <div
        style={{
          flexShrink: 0, padding: `${isPhone ? 10 : 14}px ${gut}px`,
          borderBottom: "1px solid var(--line)", background: "var(--card)",
          display: "flex", alignItems: "center", gap: 10,
          justifyContent: isPhone ? "space-between" : "flex-start",
        }}
      >
        {isPhone && (
          <h1
            style={{
              // 16, not 18. At 18 "What to cover today" ran out of room next to
              // three tabs and ellipsised to "What to cover to…", which is worse
              // than smaller type: a truncated heading reads as a layout fault,
              // and the weight is what carries the hierarchy here anyway.
              fontSize: 16, fontWeight: 750, letterSpacing: "-0.02em",
              color: "var(--ink)", margin: 0, minWidth: 0,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}
          >
            {MOBILE_TITLES[mode] || ""}
          </h1>
        )}
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
            hideHeading={isPhone}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: mode === "import" ? "flex" : "none" }}>
          <ImportPanel
            voice={voice}
            onVoiceChange={onVoiceChange}
            onGoTranscribe={onGoTranscribe}
            compact={isNarrow}
            hideTitle={isPhone}
            limits={limits}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: mode === "idea" ? "flex" : "none" }}>
          <IdeaPanel
            voice={voice}
            onVoiceChange={onVoiceChange}
            onGoTranscribe={onGoTranscribe}
            compact={isNarrow}
            hideTitle={isPhone}
            limits={limits}
          />
        </div>
      </div>
    </div>
  );
}

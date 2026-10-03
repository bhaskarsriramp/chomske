/**
 * VoiceSync.js: the voiceover falling behind the captions, said in one place.
 *
 * When captions are edited after the voiceover was made, the voiceover still
 * reads the old words. The editor works out which lines it is missing
 * (voices.mjs voiceDiff) and offers one button to bring it up to date: the
 * server speaks only the lines that changed and places the rest again
 * (backend voice.js), so an update is quick. Shown at the top of the Captions
 * panel, where the edit was made, and in Export, before the file is made.
 *
 * `voice` is the editor's voiceState: { stale, lines, updating, progress,
 * failed } (StudioEditor.js).
 */
import { Btn, Icon } from "./ui";

/** "2 changed lines aren't in the voice-over yet." */
export function voiceBehindText(voice) {
  if (voice.lines > 0) {
    return voice.lines === 1
      ? "1 changed line isn't in the voice-over yet."
      : `${voice.lines} changed lines aren't in the voice-over yet.`;
  }
  return "Your captions changed since the voice-over was made.";
}

/** Whether there is anything to say: behind, being updated, or a failed update. */
export const voiceNeedsSaying = (voice) => !!voice && (voice.stale || voice.updating || !!voice.failed);

export default function VoiceSyncBar({ voice, onUpdate, note = "", action = true }) {
  if (!voiceNeedsSaying(voice)) return null;
  const tone = voice.updating
    ? { border: "1px solid var(--line)", background: "var(--made-tint)" }
    : voice.failed
      ? { border: "1px solid #F5C7C3", background: "#FCE8E6" }
      : { border: "1px solid #F1D6A8", background: "#FFF7E8" };
  return (
    <div
      role="status"
      aria-live="polite"
      style={{ display: "grid", gap: 8, padding: "10px 12px", borderRadius: 10, fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-body)", ...tone }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        {voice.updating ? (
          <span className="st-spin" aria-hidden="true" style={{ marginTop: 2 }} />
        ) : (
          <span style={{ marginTop: 1, color: voice.failed ? "var(--bad)" : "#B7791F", display: "grid" }}>
            <Icon name="mic" size={14} />
          </span>
        )}
        <span style={{ color: voice.failed ? "var(--bad)" : undefined }}>
          {voice.updating
            ? `Updating the voice-over…${voice.progress > 0 ? ` ${Math.round(voice.progress * 100)}%` : ""}`
            : voice.failed || voiceBehindText(voice)}
          {note ? ` ${note}` : ""}
        </span>
      </div>
      {action && !voice.updating && (voice.stale || voice.failed) && (
        <Btn size="s" icon={<Icon name="mic" size={13} />} onClick={onUpdate} style={{ justifySelf: "start" }}>
          {voice.failed ? "Try again" : "Update voice-over"}
        </Btn>
      )}
    </div>
  );
}

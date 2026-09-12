/**
 * Which version of this script you are reading.
 *
 * ── WHY A TOGGLE AND NOT TWO CARDS ───────────────────────────────────────────
 * The English twin used to be a second card stacked under the first, on the
 * reasoning that they paid for two scripts so both should be visible at once.
 * In practice they are the SAME script twice, several hundred words each, and
 * stacking them meant scrolling a full screen of Telugu to reach the English of
 * the thing you had just read, with the title ideas and the sources pushed a
 * page and a half down. Nobody reads both at once; they read one and copy it.
 *
 * So it is one card with states, and the control sits next to Copy, because the
 * choice and the action are the same decision: this is the version I want.
 *
 * ── THERE ARE NOW THREE, AND TWO OF THEM ARE EASILY CONFUSED ─────────────────
 * Roman is the same script transliterated: same words, same language, English
 * letters. English is a different language for a different audience. Read
 * aloud, Roman and native produce identical audio; English does not.
 *
 * Which is why the native pill lost its hyphenated half. The label used to read
 * "Telugu-English", describing the code-mixing honestly, and that was fine
 * beside a single "English" option. With three pills it put "Telugu-English"
 * next to "Roman" next to "English" and invited exactly the wrong reading, that
 * one of them is more English than another. "Telugu · Roman · English" says the
 * true thing: one language, two alphabets, and a translation.
 *
 * Each pill renders only when there is something behind it, and the group
 * renders not at all when the script has neither a Roman nor an English
 * version. A switch that does nothing is worse than no switch.
 */
export default function ScriptToggle({ value, onChange, nativeLabel, hasRoman = false, hasEnglish = false }) {
  if (!hasRoman && !hasEnglish) return null;

  return (
    <div
      role="group"
      aria-label="Script version"
      style={{
        display: "inline-flex", padding: 2, borderRadius: 9, flexShrink: 0,
        background: "var(--paper)", border: "1px solid var(--line)",
      }}
    >
      <Option
        on={value === "native"}
        onClick={() => onChange("native")}
        label={shortLanguage(nativeLabel)}
      />
      {hasRoman && (
        <Option
          on={value === "roman"}
          onClick={() => onChange("roman")}
          label="Roman"
          title="The same script in English letters"
        />
      )}
      {hasEnglish && (
        <Option
          on={value === "english"}
          onClick={() => onChange("english")}
          label="English"
          title="The same story written in English"
        />
      )}
    </div>
  );
}

/**
 * "Telugu-English (Tenglish)" to "Telugu".
 *
 * Drops the parenthetical, which never fitted a pill, and then the second half
 * of the pair, which is the part that misreads beside a Roman and an English
 * option. Splits on both the hyphen and the slash because the label is written
 * by the analyser and has arrived in both shapes.
 *
 * Falls back to "Your voice" for a script written before the language label
 * existed, which is the honest description of what that tab holds.
 */
function shortLanguage(label) {
  const clean = String(label || "").replace(/\s*\(.*?\)\s*/g, "").trim();
  if (!clean) return "Your voice";
  return clean.split(/[-/]/)[0].trim() || "Your voice";
}

/**
 * Why there is no English here, when they paid for English.
 *
 * ── WHY THIS IS ON THE SCREEN AND NOT ONLY IN A LOG ──────────────────────────
 * A twin that cannot be written is refunded, and for a while that was the
 * entire response: the credits came back and nobody was told. From the
 * creator's side that is indistinguishable from being charged for nothing,
 * because the balance moves and no screen ever explains it. They ticked a box,
 * they were billed for it, and they are owed the sentence.
 *
 * There is deliberately no equivalent for a missing Roman version. It is free
 * and automatic, so a failed one costs the creator nothing and owes them no
 * explanation: the tab is simply not there, which is also what a script in
 * English looks like, where there is nothing to transliterate.
 *
 * Amber rather than red: nothing is broken and the script they came for is
 * sitting directly underneath. This is an outcome, not a failure state.
 */
export function EnglishNote({ message }) {
  return (
    <div
      role="status"
      style={{
        padding: "9px 15px",
        borderBottom: "1px solid #EEDCB6",
        background: "#FBF5E8",
        fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-body)",
      }}
    >
      {message}
    </div>
  );
}

function Option({ on, onClick, label, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      style={{
        fontSize: 11.5, fontWeight: 600, fontFamily: "inherit",
        padding: "5px 11px", borderRadius: 7, border: "none", cursor: "pointer",
        whiteSpace: "nowrap",
        background: on ? "var(--card)" : "transparent",
        color: on ? "var(--ink)" : "var(--ink-mute)",
        boxShadow: on ? "0 1px 2px rgba(0,0,0,.07)" : "none",
      }}
    >
      {label}
    </button>
  );
}

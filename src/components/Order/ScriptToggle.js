import { useMemo, useId } from "react";

/**
 * Which letters this script is read in.
 *
 * ── WHY A TOGGLE AND NOT TWO CARDS ───────────────────────────────────────────
 * The English twin used to be a second card stacked under the first, on the
 * reasoning that they paid for two scripts so both should be visible at once.
 * In practice they are the SAME script twice, several hundred words each, and
 * stacking them meant scrolling a full screen of Telugu to reach the English of
 * the thing you had just read. Nobody reads both at once; they read one and
 * copy it. So it is one card with states.
 *
 * ── ROMAN, AND THE ALPHABET NAMED IN ITS OWN LETTERS ─────────────────────────
 * "Roman" is the word creators here already use for Hindi or Telugu typed in
 * English letters ("Roman Hindi"), so the transliteration keeps it. It briefly
 * read "English letters", which was longer and no clearer to the people who
 * actually use this. The native pill names its alphabet in that alphabet
 * (తెలుగు, हिन्दी, தமிழ்), which is both the label and a sample of what
 * pressing it shows.
 *
 * Roman comes FIRST because it is the default: it is the version most creators
 * read fastest, and the one the card opens on.
 *
 * The English twin, when a script has one, is a different document rather than
 * a different alphabet, so it is labelled as a version: "English version".
 *
 * Each pill renders only when there is something behind it, and the group
 * renders not at all when there is only one thing to show. A switch that does
 * nothing is worse than no switch.
 */
export default function ScriptToggle({
  value, onChange, nativeLabel, nativeText = "", hasRoman = false, hasEnglish = false, compact = false,
}) {
  const native = useMemo(() => alphabetName(nativeText, nativeLabel), [nativeText, nativeLabel]);
  const labelId = useId();

  if (!hasRoman && !hasEnglish) return null;

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      {/* Dropped on a narrow card, where the pills have to fit beside Copy;
          "Roman" beside "తెలుగు" explains itself without it. */}
      {!compact && (
        <span id={labelId} style={{ fontSize: 12, color: "var(--ink-mute)", whiteSpace: "nowrap" }}>
          Read in
        </span>
      )}
      <div
        role="group"
        aria-label={compact ? "Read in" : undefined}
        aria-labelledby={compact ? undefined : labelId}
        style={{
          display: "inline-flex", padding: 2, borderRadius: 9, flexShrink: 0,
          background: "var(--paper)", border: "1px solid var(--line)",
        }}
      >
        {hasRoman && (
          <Option
            on={value === "roman"}
            onClick={() => onChange("roman")}
            label="Roman"
            title="The same script, written in English letters"
          />
        )}
        <Option
          on={value === "native"}
          onClick={() => onChange("native")}
          label={native.label}
          indic={native.indic}
          title={native.indic ? "The same script, in its own letters" : undefined}
        />
        {hasEnglish && (
          <Option
            on={value === "english"}
            onClick={() => onChange("english")}
            label="English version"
            title="The same story, written in English"
          />
        )}
      </div>
    </div>
  );
}

/**
 * Each Indic block, and what its own speakers call it, in its own letters.
 *
 * Devanagari is last because Marathi and Nepali share it with Hindi and are
 * told apart by the language label rather than the letters; same for Assamese,
 * which shares Bengali's.
 */
const ALPHABETS = [
  { re: /[ఀ-౿]/g, name: "తెలుగు" },
  { re: /[஀-௿]/g, name: "தமிழ்" },
  { re: /[ಀ-೿]/g, name: "ಕನ್ನಡ" },
  { re: /[ഀ-ൿ]/g, name: "മലയാളം" },
  { re: /[ঀ-৿]/g, name: "বাংলা", byLabel: [[/assam/i, "অসমীয়া"]] },
  { re: /[઀-૿]/g, name: "ગુજરાતી" },
  { re: /[਀-੿]/g, name: "ਪੰਜਾਬੀ" },
  { re: /[଀-୿]/g, name: "ଓଡ଼ିଆ" },
  { re: /[؀-ۿ]/g, name: "اردو" },
  { re: /[ऀ-ॿ]/g, name: "हिन्दी", byLabel: [[/marathi/i, "मराठी"], [/nepali/i, "नेपाली"]] },
];

/**
 * The native pill's label: read off the script's own text, because the
 * language label is written by the analyser and says "Hinglish (Telugu-English)"
 * for a script whose letters are Telugu. The alphabet with the most characters
 * wins, so a stray symbol from another block cannot relabel a whole script.
 *
 * Falls back to the language label, and then to "Your voice", for a script
 * with no Indic letters in it at all.
 */
function alphabetName(text, label) {
  const sample = String(text || "").slice(0, 4000);
  let best = null;
  let bestCount = 0;
  for (const a of ALPHABETS) {
    const count = (sample.match(a.re) || []).length;
    if (count > bestCount) { best = a; bestCount = count; }
  }
  if (best) {
    const override = (best.byLabel || []).find(([re]) => re.test(String(label || "")));
    return { label: override ? override[1] : best.name, indic: true };
  }
  return { label: shortLanguage(label), indic: false };
}

/**
 * "Telugu-English (Tenglish)" to "Telugu".
 *
 * Drops the parenthetical, which never fitted a pill, and then the second half
 * of the pair. Splits on both the hyphen and the slash because the label is
 * written by the analyser and has arrived in both shapes.
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
 * because the balance moves and no screen ever explains it.
 *
 * There is deliberately no equivalent for a missing Roman version. It is free
 * and automatic, so a failed one costs the creator nothing and owes them no
 * explanation: the pill is simply not there.
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

function Option({ on, onClick, label, title, indic = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className={indic ? "indic" : undefined}
      style={{
        fontSize: 12, fontWeight: 600,
        ...(indic ? {} : { fontFamily: "inherit" }),
        padding: "5px 11px", borderRadius: 7, border: "none", cursor: "pointer",
        whiteSpace: "nowrap", lineHeight: 1.35,
        background: on ? "var(--card)" : "transparent",
        color: on ? "var(--ink)" : "var(--ink-mute)",
        boxShadow: on ? "0 1px 2px rgba(0,0,0,.07)" : "none",
      }}
    >
      {label}
    </button>
  );
}

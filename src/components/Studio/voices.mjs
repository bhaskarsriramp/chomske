/**
 * voices.mjs: the AI voiceover's voices, and how captions become what is
 * spoken. Shared by the editor's Voice tab (VoicePanel.js) and the server that
 * makes the voiceover (backend services/studio/voice.js), for the same reason
 * follow.mjs is: the editor has to know when the voiceover it is playing was
 * made from captions that have changed since, and it can only know that by
 * working the answer out exactly as the server did.
 *
 * The voices are Gemini's prebuilt studio voices (gemini-3.8-flash-tts). Each
 * speaks every language the captions can be in; the accent follows the
 * language (Hindi comes out with an Indian accent, measured).
 */
export const VOICES = [
  { id: "Kore", label: "Kore", sub: "Female · clear and steady" },
  { id: "Zephyr", label: "Zephyr", sub: "Female · bright and warm" },
  { id: "Charon", label: "Charon", sub: "Male · calm and informative" },
  { id: "Puck", label: "Puck", sub: "Male · upbeat" },
];
export const DEFAULT_VOICE = "Kore";
export const voiceById = (id) => VOICES.find((v) => v.id === id) || null;

/** A sentence ends here: a full stop, question or exclamation mark, or the Devanagari danda. */
const ENDS = /[.!?।…]["'”’)\]]*\s*$/;
/** ...or at a pause this long between two lines. */
const PAUSE = 1.0;
/** ...or after this many lines, so one long run-on is not one long breath. */
const MOST_LINES = 4;

/**
 * The captions as sentences: what is spoken in one breath.
 *
 * ── WHY NOT LINE BY LINE ─────────────────────────────────────────────────────
 * Captions are cut for reading, not for speaking: "to see your payment methods
 * and past" / "invoices in one place." Spoken apart, each piece comes out as a
 * sentence of its own, with its own fall at the end, and the demo sounds read
 * off cards. Spoken together they are one sentence, which is what they are.
 *
 * @returns {Array<{ text, start, end, ids }>} in recording time, in order
 */
export function sentencesOf(cues) {
  const lines = [...(cues || [])]
    .filter((c) => String(c.text || "").trim())
    .sort((a, b) => a.start - b.start);
  const out = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const c = lines[i];
    const text = String(c.text).replace(/\s+/g, " ").trim();
    if (!cur) cur = { parts: [], start: c.start, end: c.end, ids: [] };
    cur.parts.push(text);
    cur.end = c.end;
    cur.ids.push(c.id);
    const next = lines[i + 1];
    if (!next || ENDS.test(text) || next.start - c.end > PAUSE || cur.ids.length >= MOST_LINES) {
      out.push({ text: cur.parts.join(" "), start: cur.start, end: cur.end, ids: cur.ids });
      cur = null;
    }
  }
  return out;
}

/**
 * Which exact captions a voiceover was made from, in which voice: the voice,
 * and every line's words and place. A voiceover whose signature no longer
 * matches the captions was made from different ones.
 */
export function voiceSig(voice, cues) {
  const lines = [...(cues || [])]
    .filter((c) => String(c.text || "").trim())
    .sort((a, b) => a.start - b.start)
    .map((c) => `${(+c.start).toFixed(2)}|${(+c.end).toFixed(2)}|${String(c.text).replace(/\s+/g, " ").trim()}`);
  const s = `${voice}\n${lines.join("\n")}`;
  // FNV-1a, 32 bits, twice with different seeds: short, stable, no library.
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    a = Math.imul(a ^ ch, 0x01000193) >>> 0;
    b = Math.imul(b ^ ch, 0x5bd1e995) >>> 0;
  }
  return a.toString(36) + b.toString(36);
}

/**
 * What a voiceover no longer matches in the captions as they are now, for the
 * editor's "Update voice-over" (Captions panel, the lane, the preview, Export):
 *   stale    it differs at all (words, places): an update is due
 *   changed  ids of the caption lines whose sentence it never spoke (new or
 *            reworded); an update speaks only those (backend voice.js keeps
 *            every take), and one where only the places changed speaks none
 *   lines    how many such lines
 *   gone     where it speaks sentences no longer in the captions, as
 *            [start, end] in recording time: kept quiet in the preview, so no
 *            one hears old words under new captions
 * Null when there is no voiceover.
 */
export function voiceDiff(voiceover, cues) {
  if (!voiceover) return null;
  const norm = (t) => String(t || "").replace(/s+/g, " ").trim();
  const now = sentencesOf(cues);
  const made = voiceover.sentences || [];
  const spoken = new Set(made.map((s) => norm(s.text)));
  const said = new Set(now.map((s) => norm(s.text)));
  // In a sentence it never spoke, the lines that are new: a line still found
  // word for word in what it did speak was not the edit. If every line is
  // found (one was deleted, or two swapped), the whole sentence is marked.
  const byId = new Map((cues || []).map((c) => [c.id, norm(c.text)]));
  const changed = now
    .filter((s) => !spoken.has(norm(s.text)))
    .flatMap((s) => {
      const fresh = s.ids.filter((id) => !made.some((m) => norm(m.text).includes(byId.get(id))));
      return fresh.length ? fresh : s.ids;
    });
  const gone = made.filter((s) => !said.has(norm(s.text))).map((s) => [Number(s.start) || 0, Number(s.end) || 0]);
  return { stale: voiceSig(voiceover.name, cues) !== voiceover.sig, changed, lines: changed.length, gone };
}

/** What a sample of a voice says: the demo's own first sentence, or two if it is short. */
export function sampleText(cues) {
  const s = sentencesOf(cues);
  if (!s.length) return "";
  let text = s[0].text;
  if (text.split(/\s+/).length < 5 && s[1]) text = `${text} ${s[1].text}`;
  return text.length > 220 ? `${text.slice(0, 217).replace(/\s+\S*$/, "")}…` : text;
}

const voices = { VOICES, DEFAULT_VOICE, voiceById, sentencesOf, voiceSig, voiceDiff, sampleText };
export default voices;

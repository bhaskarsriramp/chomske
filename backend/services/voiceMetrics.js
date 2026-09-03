/**
 * voiceMetrics.js — the part of a creator's voice you can COUNT.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * Asking a model to describe how somebody talks produces the average of every
 * creator it has ever seen described. "Energetic, uses rhetorical questions,
 * mixes English naturally" is true of ten million people and reproduces none of
 * them. Worse, it is unfalsifiable: nothing downstream can check whether a
 * generated script actually matches it, so the writer drifts and nobody notices.
 *
 * Everything in this file is measured from the creator's own transcripts with no
 * model in the loop. That gives three things a prompt cannot:
 *
 *   1. EVIDENCE. The analyser is handed "41% of your words are English, and the
 *      ones that stay English are: website, model, download, setup" instead of
 *      being asked to notice it. A model told a number cannot hallucinate a
 *      different one; a model asked to estimate one usually does.
 *
 *   2. TARGETS. The script writer receives the same numbers as constraints, so
 *      "match their code-mixing" becomes "41% English, not 15%".
 *
 *   3. A GRADE. A finished draft can be measured on the identical axes and
 *      compared. That closes the loop: we can tell whether a script sounds like
 *      the creator without a human reading it. Nobody gets that from one prompt,
 *      and it is the part that compounds.
 *
 * ── THE RULE THAT MAKES IT WORK ──────────────────────────────────────────────
 * Document frequency, not raw frequency. A word repeated nine times in one video
 * is that video's topic. A word appearing twice in each of four videos is how
 * this person talks. Every "signature" list below is filtered by how many
 * separate videos it shows up in, which is what separates a catchphrase from a
 * subject and is exactly the distinction a single-transcript prompt cannot make.
 */

/* ── Scripts ────────────────────────────────────────────────────────────── */

// Unicode ranges for the scripts this product actually sees. Order matters only
// for reporting; a transcript is assigned whichever native script it uses most.
const SCRIPTS = [
  ["devanagari", /[ऀ-ॿ]/g, "Hindi/Marathi"],
  ["telugu", /[ఀ-౿]/g, "Telugu"],
  ["tamil", /[஀-௿]/g, "Tamil"],
  ["bengali", /[ঀ-৿]/g, "Bengali"],
  ["kannada", /[ಀ-೿]/g, "Kannada"],
  ["malayalam", /[ഀ-ൿ]/g, "Malayalam"],
  ["gujarati", /[઀-૿]/g, "Gujarati"],
  ["gurmukhi", /[਀-੿]/g, "Punjabi"],
  ["odia", /[଀-୿]/g, "Odia"],
];

const LATIN_WORD = /^[A-Za-z][A-Za-z'’.-]*$/;

/**
 * Second-person and first-person markers, per language family.
 *
 * Whether a creator talks TO the viewer or ABOUT the subject is one of the
 * largest felt differences between two channels covering identical news, and it
 * is a handful of pronouns away from being measurable.
 */
const YOU_MARKERS = [
  "मीरु", "మీరు", "మీకు", "మీ", "మిమ్మల్ని",           // Telugu
  "आप", "आपको", "आपके", "आपका", "तुम", "तुम्हें", "तेरा",   // Hindi
  "you", "your", "yours", "guys",
];
const ME_MARKERS = [
  "నేను", "నా", "నాకు", "మనం",                          // Telugu
  "मैं", "मुझे", "मेरा", "मेरी", "हम", "हमें",              // Hindi
  "i", "me", "my", "we", "our",
];

/* ── Tokenising ─────────────────────────────────────────────────────────── */

/** Sentence split that understands the danda and Indic punctuation. */
export function sentences(text) {
  return String(text || "")
    .split(/(?<=[.!?।॥…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

/** Word tokens, punctuation stripped, case preserved (case is style too). */
export function words(text) {
  return String(text || "")
    .replace(/[.,!?;:"“”'’()\[\]{}—–\-…।॥]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function dominantScript(text) {
  let best = null;
  let bestN = 0;
  for (const [key, re, label] of SCRIPTS) {
    const n = (String(text).match(re) || []).length;
    if (n > bestN) { bestN = n; best = { key, label }; }
  }
  return bestN > 0 ? best : { key: "latin", label: "English" };
}

function round(n, places = 3) {
  return Number.isFinite(n) ? Number(n.toFixed(places)) : 0;
}

function median(nums) {
  if (!nums.length) return 0;
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/**
 * Rank by how many separate documents a term appears in, then by total count.
 * @param {Array<Map<string, number>>} perDoc  one count map per transcript
 * @param {number} minDocs                     how many videos a term must span
 */
function byDocFrequency(perDoc, minDocs, limit) {
  const docs = new Map();
  const total = new Map();
  for (const m of perDoc) {
    for (const [term, n] of m) {
      docs.set(term, (docs.get(term) || 0) + 1);
      total.set(term, (total.get(term) || 0) + n);
    }
  }
  return [...docs.entries()]
    .filter(([, d]) => d >= Math.min(minDocs, perDoc.length))
    .sort((a, b) => b[1] - a[1] || total.get(b[0]) - total.get(a[0]))
    .slice(0, limit)
    .map(([term, d]) => ({ term, videos: d, count: total.get(term) }));
}

/* ── One transcript ─────────────────────────────────────────────────────── */

function measureOne(t) {
  const text = String(t.text || "");
  const sents = sentences(text);
  const toks = words(text);

  const latin = toks.filter((w) => LATIN_WORD.test(w));
  const script = dominantScript(text);

  const lens = sents.map((s) => words(s).length).filter((n) => n > 0);

  // Latin-script words that carry meaning. Short function words ("a", "is",
  // "to") are English grammar leaking in, not a deliberate choice to keep a term
  // in English, and letting them through would fill the lexicon with noise.
  const englishCounts = new Map();
  for (const w of latin) {
    const k = w.toLowerCase();
    if (k.length < 3) continue;
    if (STOP_EN.has(k)) continue;
    englishCounts.set(k, (englishCounts.get(k) || 0) + 1);
  }

  // Repeated phrases, in whatever script they occur.
  const gramCounts = new Map();
  const lower = toks.map((w) => w.toLowerCase());
  for (let n = 2; n <= 4; n++) {
    for (let i = 0; i + n <= lower.length; i++) {
      const g = lower.slice(i, i + n).join(" ");
      if (g.length < 5) continue;
      gramCounts.set(g, (gramCounts.get(g) || 0) + 1);
    }
  }

  // What each sentence STARTS with — connectors are the joints of a narration
  // and a creator reuses a very small set of them.
  const starters = new Map();
  for (const s of sents) {
    const w = words(s)[0];
    if (!w) continue;
    const k = w.toLowerCase();
    starters.set(k, (starters.get(k) || 0) + 1);
  }

  const you = toks.filter((w) => YOU_MARKERS.includes(w.toLowerCase())).length;
  const me = toks.filter((w) => ME_MARKERS.includes(w.toLowerCase())).length;

  const secs = Number(t.duration_seconds) || 0;

  return {
    script,
    tokens: toks.length,
    latin: latin.length,
    sentences: sents.length,
    lens,
    questions: sents.filter((s) => /[?？]\s*$/.test(s)).length,
    exclaims: sents.filter((s) => /!\s*$/.test(s)).length,
    you,
    me,
    wps: secs > 0 ? toks.length / secs : null,
    firstSentence: sents[0] || "",
    lastSentence: sents[sents.length - 1] || "",
    // The literal first few words, which is the part a returning viewer
    // recognises before they have consciously registered anything.
    openWords: words(sents[0] || "").slice(0, 6).join(" "),
    englishCounts,
    gramCounts,
    starters,
  };
}

// Deliberately small. This is not an English stopword list for search — it only
// removes the words that appear in Hinglish because English grammar came along
// for the ride, never the nouns and verbs a creator chooses to keep in English.
const STOP_EN = new Set([
  "the", "and", "but", "for", "are", "was", "were", "you", "your", "that", "this",
  "with", "from", "have", "has", "had", "not", "can", "will", "would", "should",
  "there", "then", "than", "they", "them", "what", "when", "which", "who", "how",
  "its", "it's", "our", "out", "all", "any", "one", "two", "get", "got", "just",
  "like", "more", "most", "some", "such", "only", "own", "same", "very", "too",
]);

/* ── The profile ────────────────────────────────────────────────────────── */

/**
 * Measure a creator's voice across all their transcripts.
 *
 * @param {Array<{text, duration_seconds, title, language_label}>} transcripts
 * @returns {object|null} null when there is not enough text to measure honestly
 */
export function measureVoice(transcripts) {
  const rows = (transcripts || []).filter((t) => String(t?.text || "").trim().length > 40);
  if (!rows.length) return null;

  const each = rows.map(measureOne);

  const tokens = each.reduce((n, m) => n + m.tokens, 0);
  const latin = each.reduce((n, m) => n + m.latin, 0);
  const sentCount = each.reduce((n, m) => n + m.sentences, 0);
  const allLens = each.flatMap((m) => m.lens);
  const questions = each.reduce((n, m) => n + m.questions, 0);
  const exclaims = each.reduce((n, m) => n + m.exclaims, 0);
  const you = each.reduce((n, m) => n + m.you, 0);
  const me = each.reduce((n, m) => n + m.me, 0);

  const paces = each.map((m) => m.wps).filter((n) => n && Number.isFinite(n));

  // The dominant native script across the set, by how many videos use it.
  const scriptVotes = new Map();
  for (const m of each) {
    scriptVotes.set(m.script.label, (scriptVotes.get(m.script.label) || 0) + 1);
  }
  const scriptLabel = [...scriptVotes.entries()].sort((a, b) => b[1] - a[1])[0][0];

  // Two videos is enough to call something recurring; with one, everything is
  // "recurring" and the word stops meaning anything, so nothing is claimed.
  const minDocs = rows.length >= 2 ? 2 : 1;

  return {
    videos: rows.length,
    script: scriptLabel,

    // ── Code-mixing: the single most distinctive axis for an Indian creator ──
    english_ratio: round(tokens ? latin / tokens : 0),
    english_kept: byDocFrequency(each.map((m) => m.englishCounts), minDocs, 25).map((r) => r.term),

    // ── Shape ──
    sentences: sentCount,
    words: tokens,
    mean_sentence_words: round(allLens.length ? allLens.reduce((a, b) => a + b, 0) / allLens.length : 0, 1),
    median_sentence_words: round(median(allLens), 1),
    short_sentence_ratio: round(allLens.length ? allLens.filter((n) => n <= 6).length / allLens.length : 0),
    long_sentence_ratio: round(allLens.length ? allLens.filter((n) => n >= 20).length / allLens.length : 0),
    question_ratio: round(sentCount ? questions / sentCount : 0),
    exclaim_ratio: round(sentCount ? exclaims / sentCount : 0),

    // ── Who they are talking to ──
    second_person_per_100: round(tokens ? (you / tokens) * 100 : 0, 1),
    first_person_per_100: round(tokens ? (me / tokens) * 100 : 0, 1),
    address: you > me * 1.3 ? "talks to the viewer" : me > you * 1.3 ? "talks about themselves" : "balanced",

    // ── Delivery ──
    words_per_second: paces.length ? round(paces.reduce((a, b) => a + b, 0) / paces.length, 2) : null,

    // ── Verbatim anchors, chosen by recurrence rather than by taste ──
    openings: each.map((m) => m.firstSentence).filter(Boolean),
    closings: each.map((m) => m.lastSentence).filter(Boolean),
    opening_stems: byDocFrequency(
      each.map((m) => new Map(m.openWords ? [[m.openWords.toLowerCase(), 1]] : [])),
      minDocs,
      5
    ).map((r) => r.term),
    repeated_phrases: byDocFrequency(each.map((m) => m.gramCounts), minDocs, 20).map((r) => r.term),
    sentence_starters: byDocFrequency(each.map((m) => m.starters), minDocs, 12).map((r) => r.term),
  };
}

/**
 * Render measurements as evidence a language model can read.
 *
 * Percentages, not decimals, and every list capped: a prompt block long enough
 * to bury the transcripts underneath it makes the analysis worse, not better.
 */
export function metricsBlock(m) {
  if (!m) return "";
  const pc = (x) => `${Math.round(x * 100)}%`;

  const lines = [
    `Measured across ${m.videos} video${m.videos === 1 ? "" : "s"} (${m.words} words). These numbers are FACTS about this creator, computed from the transcripts. Do not contradict them.`,
    ``,
    `Base script: ${m.script}`,
    `English mixed in: ${pc(m.english_ratio)} of all words`,
    m.english_kept.length ? `Words they keep in English: ${m.english_kept.slice(0, 20).join(", ")}` : "",
    ``,
    `Sentence length: ${m.mean_sentence_words} words on average (median ${m.median_sentence_words})`,
    `Short bursts (<=6 words): ${pc(m.short_sentence_ratio)} of sentences`,
    `Long sentences (>=20 words): ${pc(m.long_sentence_ratio)} of sentences`,
    `Questions: ${pc(m.question_ratio)} of sentences end in one`,
    m.exclaim_ratio > 0.02 ? `Exclamations: ${pc(m.exclaim_ratio)} of sentences` : "",
    ``,
    `Address: ${m.address} (second person ${m.second_person_per_100}/100 words, first person ${m.first_person_per_100}/100)`,
    m.words_per_second ? `Delivery: ${m.words_per_second} words per second` : "",
    ``,
    m.repeated_phrases.length ? `Phrases repeated across videos: ${m.repeated_phrases.slice(0, 12).join(" | ")}` : "",
    m.sentence_starters.length ? `Words they begin sentences with: ${m.sentence_starters.slice(0, 10).join(", ")}` : "",
    m.opening_stems.length ? `Opening formula reused across videos: ${m.opening_stems.join(" | ")}` : "",
  ];

  return lines.filter((l) => l !== "").join("\n");
}

/**
 * Grade a generated draft against the profile it was supposed to match.
 *
 * The three axes here are the ones a reader FEELS immediately and a model drifts
 * on most: how much English is in it, how long the sentences run, and whether it
 * asks the viewer anything. Vocabulary and structure matter too, but they cannot
 * be judged without another model call, and this has to be cheap enough to run
 * on every script.
 *
 * @returns {{ ok, drift: string[], measured }}
 */
export function gradeDraft(text, target) {
  const measured = measureVoice([{ text, duration_seconds: null }]);
  if (!measured || !target) return { ok: true, drift: [], measured };

  const drift = [];
  const pc = (x) => `${Math.round(x * 100)}%`;

  // Absolute gap, not relative: going from 40% English to 20% is the same felt
  // wrongness whichever direction it moves, and a ratio blows up near zero.
  const eGap = measured.english_ratio - target.english_ratio;
  if (Math.abs(eGap) > 0.12) {
    drift.push(
      `English mixing is ${pc(measured.english_ratio)} but this creator uses ${pc(target.english_ratio)}. ` +
      (eGap < 0
        ? `Put more English words back in — especially: ${(target.english_kept || []).slice(0, 10).join(", ")}.`
        : `Too much English. Say more of it in ${target.script}.`)
    );
  }

  const lGap = measured.mean_sentence_words - target.mean_sentence_words;
  if (Math.abs(lGap) > 6) {
    drift.push(
      `Sentences average ${measured.mean_sentence_words} words; theirs average ${target.mean_sentence_words}. ` +
      (lGap > 0 ? "Break them up." : "Let them run longer.")
    );
  }

  // Only flagged when the creator demonstrably asks questions and the draft does
  // not. The reverse (a draft asking more) is a style choice, not a defect.
  if (target.question_ratio > 0.12 && measured.question_ratio < target.question_ratio / 2) {
    drift.push(
      `They end ${pc(target.question_ratio)} of sentences with a question; this draft has ${pc(measured.question_ratio)}. Ask the viewer something.`
    );
  }

  return { ok: drift.length === 0, drift, measured };
}

export default { measureVoice, metricsBlock, gradeDraft, sentences, words };

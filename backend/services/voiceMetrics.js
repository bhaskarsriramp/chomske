/**
 * voiceMetrics.js: the part of a creator's voice you can COUNT.
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
  // Arabic block: Urdu, and Kashmiri and Sindhi as commonly written. Without
  // it an Urdu transcript matches no native script and is reported as English,
  // which then tells the writer to produce an English script.
  ["arabic", /[؀-ۿ]/g, "Urdu"],
];

const LATIN_WORD = /^[A-Za-z][A-Za-z'’.-]*$/;

/**
 * ── SECOND- AND FIRST-PERSON MARKERS, AND WHY THIS IS ONLY A SEED ──────────
 * Whether a creator talks TO the viewer or ABOUT the subject is one of the
 * largest felt differences between two channels covering identical news, and
 * the verdict computed from it goes straight into the writing prompt.
 *
 * Which is exactly why the list below cannot be the whole answer. It covers
 * Telugu, Hindi and English. dominantScript() above recognises ten scripts.
 * For the other seven the count came back 0 and the verdict came back
 * "balanced", so a Tamil creator saying "நீங்க" in every sentence, or a
 * Bengali one saying "আপনি", was described to the writer as detached, and the
 * writer duly produced a detached script. Measured, not theorised: see the
 * four-language check in the commit that added this comment.
 *
 * Adding seven more lists would move the same bug to Urdu, to Konkani, to a
 * creator who addresses the room rather than the viewer. So the list is a
 * SEED, and two things override it:
 *
 *   1. markers passed in by the caller, taken from THIS creator's own
 *      analysed speech (see measureVoice's `opts`), which is the only source
 *      that is right by construction; and
 *   2. silence. When neither the seed nor the creator's own markers match
 *      anything, `address` comes back empty and metricsBlock omits the line
 *      entirely. An unmeasured trait must not be reported as a measured one:
 *      saying nothing costs the writer a hint, and saying "balanced" about a
 *      creator who addresses the viewer constantly costs them their voice.
 */
const SEED_YOU = [
  "మీరు", "మీకు", "మీ", "మిమ్మల్ని",                     // Telugu
  "आप", "आपको", "आपके", "आपका", "तुम", "तुम्हें", "तेरा",   // Hindi
  "you", "your", "yours", "guys",
];
const SEED_ME = [
  "నేను", "నా", "నాకు", "మనం",                          // Telugu
  "मैं", "मुझे", "मेरा", "मेरी", "हम", "हमें",              // Hindi
  "i", "me", "my", "we", "our",
];

/**
 * Split a creator's own analysed phrases into countable tokens.
 *
 * `viewer_address` holds what THIS person calls their viewer, quoted verbatim
 * from their transcripts in their own language, so it is the one address
 * marker that is correct for every creator without anybody maintaining a
 * table. It is a phrase, not a token, so it is split and the very short
 * fragments dropped: a one-character particle would match half the transcript.
 */
function markerTokens(input) {
  const parts = Array.isArray(input) ? input : [input];
  const out = new Set();
  for (const part of parts) {
    for (const w of words(String(part || ""))) {
      const k = w.toLowerCase();
      if (k.length >= 2) out.add(k);
    }
  }
  return [...out];
}

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
    .replace(/[.,!?;:"“”'’()\[\]{}–\-…।॥]/g, " ")
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

function measureOne(t, youSet, meSet) {
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

  // What each sentence STARTS with, connectors are the joints of a narration
  // and a creator reuses a very small set of them.
  const starters = new Map();
  for (const s of sents) {
    const w = words(s)[0];
    if (!w) continue;
    const k = w.toLowerCase();
    starters.set(k, (starters.get(k) || 0) + 1);
  }

  const you = toks.filter((w) => youSet.has(w.toLowerCase())).length;
  const me = toks.filter((w) => meSet.has(w.toLowerCase())).length;

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

// Deliberately small. This is not an English stopword list for search, it only
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
/**
 * @param {object} [opts]
 * @param {string|string[]} [opts.viewerAddress]  what THIS creator calls their
 *   viewer, verbatim from their own analysed speech. Counted alongside the seed
 *   above, which is what makes the address metric work in a language nobody
 *   wrote a pronoun list for.
 */
export function measureVoice(transcripts, opts = {}) {
  const rows = (transcripts || []).filter((t) => String(t?.text || "").trim().length > 40);
  if (!rows.length) return null;

  const ownYou = markerTokens(opts.viewerAddress);
  const youSet = new Set([...SEED_YOU, ...ownYou].map((w) => w.toLowerCase()));
  const meSet = new Set(SEED_ME.map((w) => w.toLowerCase()));

  const each = rows.map((t) => measureOne(t, youSet, meSet));

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

    // ── WHY THIS ONE DOES NOT USE minDocs ─────────────────────────────────
    // It did, and it was wrong in a way that quietly gutted the field. minDocs
    // exists to stop a one-off being called a habit, which is right for
    // repeated_phrases and sentence_starters below. It is the wrong test here,
    // because these are not habits: they are evidence that a KIND of word stays
    // English, and a brand name said once is exactly as good evidence as one
    // said twice.
    //
    // Measured on a real profile of four short videos, the two-document rule
    // reduced this list to a single word, "youtube", picked up from the outro.
    // Filtered out were megapixel, arri, oneplus, iqoo, poco, nord, bbd, pixel,
    // magic, capture, honor and sixteen others, all of them retained English in
    // Telugu speech, each appearing in the one video about that product. The
    // field whose entire job is telling the writer what stays English was
    // returning boilerplate.
    //
    // So: presence is the bar, and frequency across the whole set decides the
    // ORDER, which is what byDocFrequency's tiebreak already does. The cap of
    // 25 is what keeps this from turning into a word list.
    english_kept: byDocFrequency(each.map((m) => m.englishCounts), 1, 25).map((r) => r.term),

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
    // Empty when nothing matched at all, which means "not measured in this
    // language", not "balanced". metricsBlock drops the line rather than
    // asserting a stance nobody counted. See the seed comment above.
    address: (you + me) === 0
      ? ""
      : you > me * 1.3 ? "talks to the viewer" : me > you * 1.3 ? "talks about themselves" : "balanced",

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
    // ── A CREATOR WHO SPEAKS ENGLISH IS NOT "98% CODE-MIXED" ──────────────
    // english_ratio counts Latin-script words, which is exactly right when the
    // base language is written in another script and meaningless when it is
    // not: an English creator scores ~98%, and their commonest nouns get
    // listed to the writer as "words they keep in English", which reads as an
    // instruction to preserve a code-mix that does not exist.
    m.script === "English" ? "" : `English mixed in: ${pc(m.english_ratio)} of all words`,
    m.script !== "English" && m.english_kept.length
      ? `Words they keep in English: ${m.english_kept.slice(0, 20).join(", ")}`
      : "",
    ``,
    `Sentence length: ${m.mean_sentence_words} words on average (median ${m.median_sentence_words})`,
    `Short bursts (<=6 words): ${pc(m.short_sentence_ratio)} of sentences`,
    `Long sentences (>=20 words): ${pc(m.long_sentence_ratio)} of sentences`,
    `Questions: ${pc(m.question_ratio)} of sentences end in one`,
    m.exclaim_ratio > 0.02 ? `Exclamations: ${pc(m.exclaim_ratio)} of sentences` : "",
    ``,
    m.address
      ? `Address: ${m.address} (second person ${m.second_person_per_100}/100 words, first person ${m.first_person_per_100}/100)`
      : "",
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
/**
 * The longest run of words the draft shares with material it was only shown as
 * an example, ignoring anything the creator is supposed to repeat.
 *
 * @param {string} draft
 * @param {string[]} examples     descriptive fields, which quote other videos
 * @param {string[]} safePhrases  catchphrases, sign-offs, cues: reuse is correct
 * @returns {string|null} the offending span, for the rewrite note
 */
export function longestReusedSpan(draft, examples, safePhrases, minWords = 5) {
  const norm = (s) => String(s || "").replace(/[।.,!?;:"'“”‘’()]/g, " ").replace(/\s+/g, " ").trim();
  const words = (s) => norm(s).split(" ").filter(Boolean);

  const haystack = " " + examples.map(norm).join(" | ") + " ";
  if (haystack.trim().length < 20) return null;

  // Anything inside a phrase the creator genuinely repeats is exempt, so a
  // sign-off that happens to also appear inside an example is not flagged.
  const safe = safePhrases.map(norm).filter((p) => p.length > 3);

  const w = words(draft);
  let best = null;
  for (let i = 0; i < w.length; i++) {
    // Longest-first from each start, so the report names the whole lifted run
    // rather than its first five words.
    for (let n = Math.min(14, w.length - i); n >= minWords; n--) {
      const span = w.slice(i, i + n).join(" ");
      if (span.length < 12) continue;
      if (!haystack.includes(" " + span + " ") && !haystack.includes(span)) continue;
      if (safe.some((p) => p.includes(span) || span.includes(p))) continue;
      if (!best || span.length > best.length) best = span;
      break;
    }
  }
  return best;
}

export function gradeDraft(text, target, opts = {}) {
  // The creator's own word for their viewer is handed down here for the same
  // reason it is handed to the build: without it the second-person count is
  // zero in every language the seed list does not cover, and the address check
  // below would fire on every draft in those languages instead of none.
  const measured = measureVoice([{ text, duration_seconds: null }], {
    viewerAddress: opts.viewerAddress,
  });
  if (!measured || !target) return { ok: true, drift: [], measured };

  const drift = [];
  const pc = (x) => `${Math.round(x * 100)}%`;

  /* ── DID IT ACTUALLY POINT AT ANYTHING ────────────────────────────────────
     The prompt asks for on-screen cues and the format says how many. Asking is
     not the same as getting: this is the check that turns it from a hope into a
     requirement, the same reason every other number here is measured rather
     than requested politely.

     Deliberately the weakest possible test, ZERO cues where the format wants
     some. Counting them properly would mean deciding what "about one in eight"
     rounds to on a forty-second script, and a grader that rewrites a good draft
     over an arithmetic quibble costs the creator a doubled wait for nothing.
     A script with none at all is the failure worth catching, and it is the one
     that cannot be recorded.

     Matched on the creator's OWN phrases, so this cannot be satisfied by a
     generic English "look at this" appearing in a Telugu script. */
  /* ── DID IT COPY A SENTENCE FROM ANOTHER VIDEO ────────────────────────────
     The prompt's examples are what put a script in this creator's voice, and
     they are also complete fluent sentences about OTHER products sitting right
     there to be reused. Observed live, twice in three runs: an example saying a
     50-megapixel front camera was pointless came back as an 8-megapixel front
     camera being pointless, on a phone where nothing supports it, because the
     tail of the sentence survived intact.

     Two prose rules failed to stop it, which is the usual outcome when an
     instruction argues with a concrete example. This does not argue. It takes
     the spans the model was shown, slides a window over the draft, and reports
     any long overlap.

     The safe phrases are subtracted first. A creator's catchphrase, sign-off,
     pointing phrase or turn of phrase is MEANT to come back verbatim, and
     flagging those would fight the entire point of the profile. What is left is
     the descriptive examples, which are about other products and belong to them. */
  const reused = longestReusedSpan(text, opts.exampleSpans || [], opts.safePhrases || []);
  if (reused) {
    drift.push(
      `This sentence is lifted from a DIFFERENT video about a DIFFERENT product: "${reused}". ` +
      `Reusing it carries that video's claim onto this one, and nothing in this story supports it. ` +
      `Say the point plainly in their register instead. Their catchphrases and sign-offs are fine ` +
      `to repeat; a sentence about another product is not.`
    );
  }

  const wantCues = opts.onScreenDensity && opts.onScreenDensity !== "none";
  const cuePhrases = (opts.showMePhrases || []).map((p) => String(p || "").trim()).filter(Boolean);
  if (wantCues && cuePhrases.length) {
    const hay = String(text || "");
    const found = cuePhrases.filter((p) => hay.includes(p)).length;
    if (found === 0) {
      drift.push(
        `This script never points at anything on screen. This creator does that constantly, ` +
        `and a script without it cannot be recorded. Work in ${opts.onScreenDensity === "low" ? "one" : "two or three"} ` +
        `of their own cues, verbatim: ${cuePhrases.slice(0, 5).map((p) => `"${p}"`).join(", ")}. ` +
        `Only point at things that exist without holding the product: a render, a spec table, a price on screen.`
      );
    }
  }

  // Absolute gap, not relative: going from 40% English to 20% is the same felt
  // wrongness whichever direction it moves, and a ratio blows up near zero.
  const eGap = measured.english_ratio - target.english_ratio;
  if (target.script !== "English" && Math.abs(eGap) > 0.12) {
    drift.push(
      `English mixing is ${pc(measured.english_ratio)} but this creator uses ${pc(target.english_ratio)}. ` +
      (eGap < 0
        ? `Put more English words back in, especially: ${(target.english_kept || []).slice(0, 10).join(", ")}.`
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

  /* ── THE CONNECTIVE TISSUE, CHECKED RATHER THAN REQUESTED ─────────────────
     These three are the reason gradeDraft grew past its original three axes.

     Measured on one creator: at his own rates a 332-word script should carry
     roughly 35 instances of his register, his particles and his way of
     addressing the viewer. The drafts carried 2. Every one of those traits was
     already described to the writer in prose, and prose lost to the model's
     pull toward clean written language in that creator's tongue, every time.

     So they are counted. All three are matched against strings the analyst read
     off THIS creator's own transcripts, never a built-in list, which is what
     makes them work the same way for a creator in any language.

     Each is the weakest useful test, ZERO where there should be many, for the
     same reason as the cue check above: a rewrite costs the creator a doubled
     wait, and it should only be spent on a draft that missed the trait
     completely rather than one that under-used it slightly. */

  const has = (entries) => {
    const hay = String(text || "");
    return (entries || []).some((raw) => {
      // Entries may arrive annotated ("<particle> - start of a sentence"),
      // because knowing where a particle sits is what makes it usable. Split on
      // the common separators and test the short fragments, so the check works
      // whether the analyst annotated the entry or not.
      const parts = String(raw || "").split(/\s[-–—:(]\s*|\(/);
      return parts.some((p) => {
        const frag = p.trim().replace(/[)"']+$/g, "");
        return frag.length >= 2 && frag.split(/\s+/).length <= 4 && hay.includes(frag);
      });
    });
  };

  const register = opts.registerMarkers || [];
  if (register.length && !has(register)) {
    drift.push(
      `This draft is written in the formal version of their language. They do not talk that ` +
      `way: use their own forms, verbatim, wherever the choice comes up. ` +
      `${register.slice(0, 6).map((r) => `"${r}"`).join(", ")}.`
    );
  }

  const particles = opts.discourseParticles || [];
  if (particles.length && !has(particles)) {
    drift.push(
      `Not one of this creator's connecting words or particles appears in this draft, and ` +
      `they are among the most frequent words in their speech. Work them in where they ` +
      `naturally sit: ${particles.slice(0, 6).map((p) => `"${p}"`).join(", ")}.`
    );
  }

  // Only when the creator demonstrably addresses the viewer. A creator who
  // reports rather than addresses is not drifting by doing the same.
  if (
    target.second_person_per_100 >= 2 &&
    measured.second_person_per_100 < target.second_person_per_100 / 2
  ) {
    // Said as a shortfall in SENTENCES to convert, not as a rate to hit. The
    // first version of this message quoted the two rates and asked the model to
    // "turn the flat statements back into things said to the viewer", and the
    // rewrite did not move the number at all: there was nothing in it to act
    // on. This names the deficit, where to spend it, and the transform.
    const short = Math.max(
      1,
      Math.round(((target.second_person_per_100 - measured.second_person_per_100) * measured.words) / 100),
    );
    drift.push(
      `They address the viewer ${target.second_person_per_100} times per 100 words; this draft manages ` +
      `${measured.second_person_per_100}. Roughly ${short} more sentence${short === 1 ? "" : "s"} need to be ` +
      `spoken TO the viewer instead of about the product` +
      (opts.viewerAddress ? `, using their own word for them: "${opts.viewerAddress}"` : "") +
      `. Take the spec and price sentences and say the same facts as what the viewer gets, what they can ` +
      `do with it, or what they are about to see. Change nothing about the facts themselves, and do not ` +
      `add questions at the end to make up the count.`
    );
  }

  /* ── A PHRASE WE ARE RESTING, IN ANY FORM ─────────────────────────────────
     The last resort, and the only thing that worked.

     A one-off phrase was filtered out of the voice block, withdrawn from the
     discipline block once spent, and excluded from the repetition list, until
     the prompt provably did not contain it anywhere. The model wrote it anyway,
     three runs out of three. It is not leaking from our data: "your mind will
     be blown" is simply the stock superlative of the genre, and the model
     reaches for it on its own.

     Nothing said in a prompt can fix that, so this is measured on the output
     instead. Matching is by distinctive WORD rather than by phrase, because the
     model varies the inflection every time it is blocked.

     Two exemptions keep it from firing on innocent drafts. A word that appears
     in the source material is fair game: the story is allowed to be about a
     product the creator once called something. And a word from a phrase they
     genuinely repeat is fair game, because that is their voice. What is left is
     narrow: a distinctive word, from a line they used once, about something
     else. */
  const resting = (opts.restingPhrases || []).filter(Boolean);
  if (resting.length) {
    const bag = (s) => String(s || "").toLowerCase().replace(/[।.,!?;:"'“”‘’()]/g, " ").split(/\s+/);
    const inMaterial = new Set(bag(opts.materialFacts));
    // The resting phrases are themselves in safePhrases, because that list is
    // "things the creator may repeat" and they were classified before anyone
    // counted how often they said them. Left in, they exempt their own words
    // and this check can never fire on the case it exists for.
    const inHabits = new Set(
      (opts.safePhrases || [])
        .filter((p) => !resting.some((r) => String(p).includes(r) || r.includes(String(p))))
        .flatMap((p) => bag(p)),
    );
    const draftWords = new Set(bag(text));

    const hit = resting
      .map((p) => bag(p).find((w) =>
        w.length >= 4 && draftWords.has(w) && !inMaterial.has(w) && !inHabits.has(w)))
      .find(Boolean);

    if (hit) {
      drift.push(
        `This reuses "${hit}", which comes from a line this creator used ONCE, in a video about ` +
        `something else. It has already gone out in recent scripts and it is not one of their ` +
        `habits. Cut it and say what is genuinely interesting about THIS product in plain ` +
        `words. Do not substitute another way of saying the same thing.`
      );
    }
  }

  /* ── THE OPENING IS THE ONE LINE THAT MUST NOT REPEAT ─────────────────────
     Prose could not hold this. Told not to reuse a one-off phrase, the model
     stopped writing "మైండ్ పోద్ది" and wrote "మైండ్ పోయే"; told about that, it
     wrote "మైండ్ బ్లాక్ అయ్యే". Three spellings of one image across three
     scripts, none of them a string match for the last, all of them in the
     opening line.

     Chasing inflections is unwinnable and language-specific. Comparing this
     opening to the openings we actually sent them is neither: whatever form the
     repetition takes, the words repeat, and longestReusedSpan already measures
     exactly that.

     Spans that occur in their own real openings are exempt, so a creator whose
     genuine habit is to start every video the same way keeps it. What gets
     caught is the part that is OURS rather than theirs. */
  const recentOpenings = (opts.recentOpenings || []).filter(Boolean);
  if (recentOpenings.length) {
    const opening = String(text || "").split(/\n+/).map((l) => l.trim()).find(Boolean) || "";
    const reused = longestReusedSpan(opening, recentOpenings, opts.openingSafe || [], 4);
    if (reused) {
      drift.push(
        `This opens almost exactly like a script we already sent them: "${reused}". They read ` +
        `these one after another, so a repeated opening is the first thing they notice. Open ` +
        `on a different move entirely, modelled on a DIFFERENT one of their own real openings. ` +
        `Do not keep the same idea and reword it.`
      );
    }
  }

  return { ok: drift.length === 0, drift, measured };
}

export default { measureVoice, metricsBlock, gradeDraft, sentences, words };

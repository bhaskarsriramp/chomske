/**
 * align.js: which part of a recording is which line of the script.
 *
 * Pure. No I/O, no model, no clock. Given the script's lines and the stretches
 * of speech with what was said in each, it returns one clip per line, the
 * alternate takes, and the speech that matched nothing. Everything here can be
 * tested with plain arrays, and is (scripts/editSelfTest.js).
 *
 * ── WHAT A REAL RECORDING LOOKS LIKE ─────────────────────────────────────────
 * Nobody reads a script cleanly. A creator says line 3, stumbles, says "one
 * more time", says line 3 again, carries on, ad-libs a sentence about their
 * morning between 6 and 7, and skips line 9 because it felt wrong out loud. The
 * matching has to survive all of that without being told any of it:
 *
 *   paraphrase   lines are matched by similarity, never by exact text
 *   retakes      every occurrence of a line is found, and the LAST good one wins
 *   ad-libs      speech that matches no line is kept aside, not forced in
 *   skips        a line nobody said becomes a visible gap, not a wrong clip
 *
 * ── MATCHING IN ROMAN ────────────────────────────────────────────────────────
 * The script has a Roman version line for line, and the transcriber returns one
 * too. Comparing in Roman means one comparison works for every language, and
 * the key below folds the ways the same word gets spelled in English letters
 * ("chudocchu", "chudochu", "choodochu") onto one skeleton.
 */

const PAD = 0.12;           // seconds of pause kept either side of a clip
const MAX_CANDIDATES = 6;   // takes kept per line
const LATE_BONUS = 0.06;    // how much a later take is preferred over an earlier one

/**
 * A spelling-insensitive key for one word.
 *
 * Latin words are reduced to their first letter plus the consonants after it,
 * with the common digraph and doubling variations folded first. Words in an
 * Indic script (a transcript with no Roman) are compared as written.
 */
export function wordKey(word) {
  const w = String(word || "").normalize("NFKD").toLowerCase();
  if (!/[a-z0-9]/.test(w)) {
    return w.replace(/[​-‍।॥.,!?;:'"“”‘’()\-–—…]/g, "");
  }
  let s = w.replace(/[^a-z0-9]/g, "");
  if (!s) return "";
  if (/^\d+$/.test(s)) return s;
  s = s
    .replace(/ph/g, "f").replace(/bh/g, "b").replace(/dh/g, "d").replace(/th/g, "t")
    .replace(/kh/g, "k").replace(/gh/g, "g").replace(/sh/g, "s").replace(/ch/g, "c")
    .replace(/w/g, "v").replace(/z/g, "j").replace(/q/g, "k")
    .replace(/(.)\1+/g, "$1");
  return s[0] + s.slice(1).replace(/[aeiouy]/g, "");
}

/** Words of a string, with where each sits in it. */
export function tokenize(text) {
  const out = [];
  const re = /[^\s]+/g;
  const str = String(text || "");
  let m;
  while ((m = re.exec(str))) {
    const key = wordKey(m[0]);
    if (key) out.push({ key, raw: m[0], charStart: m.index, charEnd: m.index + m[0].length });
  }
  return out;
}

function within1(a, b) {
  // Levenshtein distance <= 1, without building a matrix.
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function same(a, b) {
  if (a === b) return true;
  return a.length >= 4 && b.length >= 4 && within1(a, b);
}

/**
 * Every spoken word in order, each with an estimated start and end.
 *
 * Inside one stretch of speech the time of a word is estimated from where it
 * sits in the transcript. That estimate only matters when a cut has to fall
 * INSIDE a stretch, two lines said without a pause between them. Cuts at the
 * edge of a stretch use the detected pause, which is exact.
 */
function spokenStream(pieces) {
  const out = [];
  pieces.forEach((p, pi) => {
    const source = String(p.roman || p.text || "");
    const toks = tokenize(source);
    const total = source.length || 1;
    const dur = p.end - p.start;
    toks.forEach((t, k) => {
      out.push({
        key: t.key,
        raw: t.raw,
        piece: pi,
        media: p.media,
        first: k === 0,
        last: k === toks.length - 1,
        start: p.start + dur * (t.charStart / total),
        end: p.start + dur * (t.charEnd / total),
      });
    });
  });
  return out;
}

/** Every place in the recording a line might have been said, best first. */
function candidatesFor(lineIdx, lineToks, stream, pieceFirstToken, hints) {
  const L = lineToks.length;
  if (!L || !stream.length) return [];

  const window = Math.ceil(L * 1.6) + 3;
  const starts = new Set();
  const anchors = lineToks.slice(0, Math.min(3, L));

  for (let j = 0; j < stream.length; j++) {
    for (let a = 0; a < anchors.length; a++) {
      // Two-letter keys ("ee", "lo") match everywhere and anchor nothing.
      if (anchors[a].key.length < 2 && L > 1) continue;
      if (same(stream[j].key, anchors[a].key)) {
        starts.add(Math.max(0, j - a));
        break;
      }
    }
  }
  // The transcriber's own opinion of which stretches carry this line.
  for (const [pi, lines] of hints) {
    if (lines.includes(lineIdx) && pieceFirstToken[pi] !== undefined) starts.add(pieceFirstToken[pi]);
  }

  const minScore = L <= 2 ? 0.8 : L <= 4 ? 0.6 : 0.45;
  const found = [];
  let prev = new Uint16Array(window + 1);
  let cur = new Uint16Array(window + 1);

  for (const s0 of starts) {
    // A take never runs across two uploaded files.
    let limit = Math.min(stream.length, s0 + window);
    for (let k = s0 + 1; k < limit; k++) {
      if (stream[k].media !== stream[s0].media) { limit = k; break; }
    }
    const n = limit - s0;
    if (n <= 0) continue;

    // LCS of the whole line against every prefix of the window, in one table:
    // the last row holds the answer for each window length at once.
    prev.fill(0);
    for (let i = 1; i <= L; i++) {
      cur[0] = 0;
      const key = lineToks[i - 1].key;
      for (let k = 1; k <= n; k++) {
        cur[k] = same(key, stream[s0 + k - 1].key) ? prev[k - 1] + 1 : Math.max(prev[k], cur[k - 1]);
      }
      const t = prev; prev = cur; cur = t;
    }

    let bestK = 0;
    let bestF = -1;
    for (let k = 1; k <= n; k++) {
      const f = (2 * prev[k]) / (L + k);
      if (f > bestF + 1e-9) { bestF = f; bestK = k; }
    }
    if (bestK === 0) continue;

    // Drop leading words that belong to no part of the line, so a take does
    // not start with the tail of whatever was said before it.
    let s = s0;
    let k = bestK;
    while (k > 1 && !lineToks.some((t) => same(t.key, stream[s].key))) { s++; k--; }
    const score = Math.min(1, (2 * prev[bestK]) / (L + k));
    if (score < minScore) continue;

    found.push({ s, e: s + k - 1, score });
  }

  // Overlapping windows are the same take found from different anchors.
  found.sort((a, b) => b.score - a.score || a.s - b.s);
  const kept = [];
  for (const c of found) {
    const clash = kept.some((k) => {
      const overlap = Math.min(k.e, c.e) - Math.max(k.s, c.s) + 1;
      return overlap > 0 && overlap >= 0.5 * Math.min(k.e - k.s + 1, c.e - c.s + 1);
    });
    if (!clash) kept.push(c);
    if (kept.length >= MAX_CANDIDATES) break;
  }

  // A stretch the transcriber tied to this line nudges its takes up.
  for (const c of kept) {
    for (let t = c.s; t <= c.e; t++) {
      const lines = hints.get(stream[t].piece);
      if (lines && lines.includes(lineIdx)) { c.score = Math.min(1, c.score + 0.08); break; }
    }
  }

  return kept.sort((a, b) => a.s - b.s);
}

/**
 * Choose one take per line, in recording order, maximising total match.
 *
 * Takes must not overlap and must run forwards through the recording: line 5's
 * take comes after line 4's. Among takes of the same line a later one earns a
 * small bonus, because the reason a line is said twice is almost always that
 * the first attempt was not the keeper.
 */
function choose(cands) {
  const N = cands.length;
  const best = cands.map((cs) => cs.map(() => -Infinity));
  const from = cands.map((cs) => cs.map(() => null));
  let top = null;

  for (let i = 0; i < N; i++) {
    const cs = cands[i];
    for (let c = 0; c < cs.length; c++) {
      const bonus = cs.length > 1 ? LATE_BONUS * (c / (cs.length - 1)) : 0;
      let prevBest = 0;
      let arg = null;
      for (let j = 0; j < i; j++) {
        for (let d = 0; d < cands[j].length; d++) {
          if (cands[j][d].e < cs[c].s && best[j][d] > prevBest) {
            prevBest = best[j][d];
            arg = [j, d];
          }
        }
      }
      best[i][c] = cs[c].score + bonus + prevBest;
      from[i][c] = arg;
      if (!top || best[i][c] > best[top[0]][top[1]]) top = [i, c];
    }
  }

  const chosen = new Array(N).fill(-1);
  let at = top;
  while (at) {
    chosen[at[0]] = at[1];
    at = from[at[0]][at[1]];
  }
  return chosen;
}

/** The words of `text` between two fractions of its length, for "what was said". */
function sliceWords(text, from, to) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const a = Math.floor(from * words.length + 1e-6);
  const b = Math.max(a + 1, Math.round(to * words.length));
  return words.slice(a, b).join(" ");
}

/**
 * @param {object} input
 * @param {{ n, text, roman }[]} input.lines   the script, in order
 * @param {{ media, media_duration, start, end, text, roman, lines? }[]} input.pieces
 *   stretches of speech in recording order (files in upload order), with what
 *   was said and, optionally, the line numbers the transcriber thought they were
 * @returns {{ clips, unused, stats }}
 */
export function alignRecording({ lines, pieces }) {
  const stream = spokenStream(pieces);
  const pieceFirstToken = {};
  const pieceTokenCount = {};
  stream.forEach((t, idx) => {
    if (pieceFirstToken[t.piece] === undefined) pieceFirstToken[t.piece] = idx;
    pieceTokenCount[t.piece] = (pieceTokenCount[t.piece] || 0) + 1;
  });

  const hints = new Map();
  pieces.forEach((p, pi) => {
    if (Array.isArray(p.lines) && p.lines.length) hints.set(pi, p.lines.map(Number));
  });

  const lineToks = lines.map((l) => tokenize(l.roman || l.text));
  const cands = lines.map((l, i) => candidatesFor(l.n, lineToks[i], stream, pieceFirstToken, hints));
  const chosen = choose(cands);

  const takeOf = (c) => {
    const a = stream[c.s];
    const b = stream[c.e];
    const pa = pieces[a.piece];
    const pb = pieces[b.piece];

    const prevSame = pieces[a.piece - 1] && pieces[a.piece - 1].media === pa.media ? pieces[a.piece - 1].end : 0;
    const nextSame = pieces[b.piece + 1] && pieces[b.piece + 1].media === pb.media
      ? pieces[b.piece + 1].start
      : Number(pb.media_duration) || pb.end + PAD;

    let start = a.first ? pa.start : a.start;
    let end = b.last ? pb.end : b.end;
    // Into the pause, never into neighbouring speech: at most PAD, at most half the gap.
    if (a.first) start = Math.max(start - PAD, (prevSame + start) / 2);
    if (b.last) end = Math.min(end + PAD, (end + nextSame) / 2);

    // What was actually said, for captions: exactly the Roman words matched, and
    // the matching share of the native transcript of the stretches involved.
    const saidRoman = stream.slice(c.s, c.e + 1).map((t) => t.raw).join(" ");
    const nativeParts = [];
    for (let pi = a.piece; pi <= b.piece; pi++) {
      const count = pieceTokenCount[pi] || 1;
      const first = pieceFirstToken[pi];
      const from = pi === a.piece ? (c.s - first) / count : 0;
      const to = pi === b.piece ? (c.e - first + 1) / count : 1;
      nativeParts.push(sliceWords(pieces[pi].text, from, to));
    }

    return {
      media: pa.media,
      in: Math.max(0, round3(start)),
      out: round3(end),
      score: round2(c.score),
      said: nativeParts.filter(Boolean).join(" ").trim(),
      said_roman: saidRoman,
      range: [c.s, c.e],
    };
  };

  const used = new Set();
  const clips = lines.map((l, i) => {
    const takes = cands[i].map(takeOf);
    const pick = chosen[i];
    if (pick >= 0) {
      const [s, e] = takes[pick].range;
      for (let t = s; t <= e; t++) used.add(stream[t].piece);
    }
    return {
      line: l.n,
      text: l.text,
      roman: l.roman || "",
      chosen: pick,
      takes: takes.map(({ range, ...t }) => t),
    };
  });

  const unused = [];
  pieces.forEach((p, pi) => {
    if (used.has(pi) || !String(p.roman || p.text || "").trim()) return;
    unused.push({
      media: p.media,
      in: round3(p.start),
      out: round3(p.end),
      said: String(p.text || "").trim(),
      said_roman: String(p.roman || "").trim(),
    });
  });

  const matched = clips.filter((c) => c.chosen >= 0).length;
  return {
    clips,
    unused,
    stats: {
      lines: lines.length,
      matched,
      missing: lines.length - matched,
      retaken: clips.filter((c) => c.takes.length > 1).length,
      unused: unused.length,
    },
  };
}

const round2 = (n) => Math.round(n * 100) / 100;
const round3 = (n) => Math.round(n * 1000) / 1000;

export default { alignRecording, wordKey, tokenize };

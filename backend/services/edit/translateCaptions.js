/**
 * translateCaptions.js: captions in another language, on the same timing.
 *
 * ── ONE PIECE IN, ONE PIECE OUT ──────────────────────────────────────────────
 * Every caption segment is a stretch of speech with a start and an end in the
 * recording. The translation of a segment is shown for exactly that stretch, so
 * the model is told never to move words between pieces, merge them or split
 * them. That is what keeps an English caption on screen while the creator says
 * the Telugu it came from, instead of a paragraph drifting out of step.
 *
 * Word order inside a piece still changes between languages; captions are
 * spread across their piece in proportion to length (timeline.js captionCues),
 * which is as close as a translation can honestly be timed.
 */
import { TEXT_MODEL, generateJson, retryable, pool } from "./gemini.js";
import { languageByCode } from "./languages.js";

const BATCH = 60;
const PARALLEL = 3;

function promptFor(target, sourceLabel, items) {
  return `Translate these video captions into ${target.prompt}.

They are consecutive pieces of one person talking to camera${sourceLabel ? ` (spoken in ${sourceLabel})` : ""}. Each piece is shown on screen only while its own words are spoken, so:
- Translate every piece on its own. Never move words from one piece into another, never merge or split pieces, and return every id exactly once.
- Write it the way a person says it out loud: short, natural, conversational ${target.label}. Not formal, not a document.
- Keep names, brands, product names, prices and numbers exactly as they are (₹69,990 stays ₹69,990, iPhone 17 Pro stays iPhone 17 Pro).
- A piece that is already in ${target.label} comes back unchanged. A piece that is only a filler sound comes back as it is.
Each piece has "text" (as spoken) and "roman" (the same words in English letters) to help you read it.

PIECES:
${JSON.stringify(items)}

Return STRICT JSON only:
{"items":[{"id":"...","text":"..."}]}`;
}

/**
 * @param {object} args
 * @param {{ id, text, roman }[]} args.segments
 * @param {string} args.lang          a CAPTION_LANGUAGES code
 * @param {string} [args.sourceLabel] what was spoken, if known
 * @param {Function} [args.onProgress]
 * @returns {Promise<{ items: Record<string,string>, usage: { usd, input, output } }>}
 * @throws with .userMessage when too little came back to be worth keeping
 */
export async function translateSegments({ segments, lang, sourceLabel = "", onProgress = () => {} }) {
  const target = languageByCode(lang);
  if (!target) throw Object.assign(new Error(`unknown language ${lang}`), { userMessage: "That language isn't available." });

  const todo = segments
    .map((s) => ({ id: s.id, text: String(s.text || s.roman || "").slice(0, 1000), roman: String(s.roman || "").slice(0, 1000) }))
    .filter((s) => s.text);
  const items = {};
  const usage = { usd: 0, input: 0, output: 0 };

  const run = async (batch) => {
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const out = await generateJson({
          model: TEXT_MODEL,
          parts: [{ text: promptFor(target, sourceLabel, batch) }],
          temperature: 0.2,
        });
        usage.usd += out.usd;
        usage.input += out.input;
        usage.output += out.output;
        const wanted = new Set(batch.map((b) => b.id));
        for (const r of Array.isArray(out.json.items) ? out.json.items : []) {
          const id = String(r?.id || "");
          const text = String(r?.text || "").trim().slice(0, 1000);
          if (wanted.has(id) && text) items[id] = text;
        }
        return;
      } catch (err) {
        lastErr = err;
        if (!retryable(err)) break;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    throw lastErr;
  };

  const batches = [];
  for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));

  let finished = 0;
  try {
    await pool(batches, PARALLEL, async (batch) => {
      await run(batch);
      finished++;
      onProgress(finished / (batches.length + 1));
    });
    // One more pass for anything the model skipped, in small batches, where it
    // is least likely to skip again.
    const missing = todo.filter((s) => !items[s.id]);
    if (missing.length) {
      const again = [];
      for (let i = 0; i < missing.length; i += 20) again.push(missing.slice(i, i + 20));
      await pool(again, PARALLEL, run);
    }
  } catch (err) {
    throw Object.assign(new Error(`translation failed: ${err?.message}`), {
      userMessage: "We couldn't translate your captions just now. Your credits are back; please try again.",
    });
  }
  onProgress(1);

  const got = Object.keys(items).length;
  if (todo.length && got < Math.ceil(todo.length * 0.9)) {
    throw Object.assign(new Error(`translation incomplete: ${got}/${todo.length}`), {
      userMessage: "The translation came back incomplete. Your credits are back; please try again.",
    });
  }
  return { items, usage };
}

export default { translateSegments };

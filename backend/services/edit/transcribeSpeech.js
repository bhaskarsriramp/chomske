/**
 * transcribeSpeech.js: what was said in each stretch of a creator's recording.
 *
 * ── THE MODEL IS ASKED LESS THAN IT COULD BE, DELIBERATELY ───────────────────
 * It is not asked for timestamps. Timing comes from the pauses ffmpeg found
 * (services/media/ffmpeg.js detectSpeech), which are exact. Each stretch goes in
 * as its own labelled audio clip, so the model's only job is the one it is
 * reliably good at: writing down what it hears, in two alphabets, and saying
 * which script lines that sounds like.
 *
 * ── WHY THE SCRIPT IS IN THE PROMPT, WHEN THERE IS ONE ───────────────────────
 * Two reasons. Spelling: a Telugu creator saying "Flipkart Big Billion Days"
 * gets it back spelled the way the script spells it, which is what makes the
 * matching find it. And the line hint: "this stretch is lines 4 and 5" is a
 * judgement about paraphrase that no string distance can make. The hint is only
 * a nudge in align.js, never the decision, because a model shown a script will
 * sometimes hear it where it was not said.
 *
 * A video uploaded on its own has no script. Then the model is asked what
 * language is being spoken as well, which becomes the project's label and the
 * name of the "Original" captions.
 */
import fsp from "fs/promises";
import { AUDIO_MODEL, generateJson, retryable } from "./gemini.js";
import { transient } from "./transient.js";

/** Stretches per request. Keeps one request well under the inline-data ceiling. */
const BATCH = 30;
const PARALLEL = 3;

function scriptPrompt(lines, languageLabel) {
  const script = lines
    .map((l) => `${l.n}. ${l.text}${l.roman && l.roman !== l.text ? `  ||  ${l.roman}` : ""}`)
    .join("\n");
  return `You are transcribing pieces of ONE recording. A creator is recording themselves reading the video script below${languageLabel ? ` (${languageLabel})` : ""}. They pause, repeat lines, stumble, restart and sometimes say things that are not in the script.

Each audio clip that follows is labelled PIECE <number>. For EVERY piece return:
- "text": exactly what is said in that piece, in the spoken language's own script, keeping English words in English letters, spelled the way the script spells them where the words are the same. Write what you HEAR. Never copy a script line that was not actually said. Use "" when there is no speech (breathing, noise, silence).
- "roman": the same words written entirely in English letters, the way Indian creators type their language on WhatsApp. For English speech, the same as "text".
- "lines": the script line numbers this piece contains, in order. [] when it matches none, including abandoned false starts, "cut", "one more time", or chatter.

THE SCRIPT (line number, then the line, then its Roman version):
${script}

Return STRICT JSON only:
{"pieces":[{"piece":1,"text":"...","roman":"...","lines":[1]}]}`;
}

function freePrompt(languageLabel) {
  return `You are transcribing pieces of ONE video, in order. Somebody is talking to camera${languageLabel ? `, probably in ${languageLabel}` : ""}. Indian creators often mix their language with English inside one sentence.

These words become the video's on-screen captions, so accuracy is everything: names, brands, prices and numbers exactly as said.

Each audio clip that follows is labelled PIECE <number>. For EVERY piece return:
- "text": exactly what is said, in the spoken language's own script (Telugu in Telugu script, Hindi in Devanagari, and so on), keeping English words in English letters. Write what you HEAR, including repeated words. Use "" when there is no speech (breathing, music, noise, silence).
- "roman": the same words written entirely in English letters, the way Indian creators type their language on WhatsApp. For English speech, the same as "text".

Also return "language": the language being spoken, as a short label a creator would recognise, for example "Telugu-English", "Hindi", "Tamil", "English".

Return STRICT JSON only:
{"language":"...","pieces":[{"piece":1,"text":"...","roman":"..."}]}`;
}

/**
 * @param {object} args
 * @param {{ path, start, end }[]} args.pieces   audio files, one per stretch, in order
 * @param {{ n, text, roman }[]} [args.lines]    the script; empty for a video with none
 * @param {string} [args.languageLabel]
 * @param {Function} [args.onProgress]           (0..1)
 * @returns {Promise<{ results: { text, roman, lines }[], language: string, usage: { usd, input, output } }>}
 *   results[i] belongs to pieces[i]
 */
export async function transcribePieces({ pieces, lines = [], languageLabel = "", onProgress = () => {} }) {
  const prompt = lines.length ? scriptPrompt(lines, languageLabel) : freePrompt(languageLabel);
  const results = pieces.map(() => ({ text: "", roman: "", lines: [] }));
  const usage = { usd: 0, input: 0, output: 0 };
  const languages = new Map();

  const batches = [];
  for (let i = 0; i < pieces.length; i += BATCH) batches.push(pieces.slice(i, i + BATCH).map((p, k) => ({ ...p, index: i + k })));

  let finished = 0;
  const runBatch = async (batch) => {
    const parts = [{ text: prompt }];
    for (let k = 0; k < batch.length; k++) {
      const data = (await fsp.readFile(batch[k].path)).toString("base64");
      parts.push({ text: `PIECE ${k + 1}` }, { inlineData: { mimeType: "audio/mp3", data } });
    }

    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const out = await generateJson({ model: AUDIO_MODEL, parts });
        usage.usd += out.usd;
        usage.input += out.input;
        usage.output += out.output;
        const said = Array.isArray(out.json.pieces) ? out.json.pieces : [];
        const lang = String(out.json.language || "").trim().slice(0, 60);
        if (lang) languages.set(lang, (languages.get(lang) || 0) + batch.length);
        for (const r of said) {
          const k = Number(r.piece) - 1;
          if (k < 0 || k >= batch.length) continue;
          results[batch[k].index] = {
            text: String(r.text || "").trim(),
            roman: String(r.roman || "").trim(),
            lines: (Array.isArray(r.lines) ? r.lines : []).map(Number).filter((n) => Number.isFinite(n)),
          };
        }
        finished++;
        onProgress(finished / batches.length);
        return;
      } catch (err) {
        lastErr = err;
        if (!retryable(err)) break;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    throw Object.assign(new Error(`transcription failed: ${lastErr?.message}`), {
      userMessage: "We couldn't listen to your recording just now. Please try again in a minute.",
      // The model unreachable is waited out by the job runner before this is said.
      transient: transient(lastErr),
    });
  };

  const queue = batches.slice();
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
      while (queue.length) await runBatch(queue.shift());
    })
  );

  const language = [...languages.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  return { results, language, usage };
}

export default { transcribePieces };

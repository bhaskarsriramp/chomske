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
 * ── WHY THE SCRIPT IS IN THE PROMPT ──────────────────────────────────────────
 * Two reasons. Spelling: a Telugu creator saying "Flipkart Big Billion Days"
 * gets it back spelled the way the script spells it, which is what makes the
 * matching find it. And the line hint: "this stretch is lines 4 and 5" is a
 * judgement about paraphrase that no string distance can make. The hint is only
 * a nudge in align.js, never the decision, because a model shown a script will
 * sometimes hear it where it was not said.
 */
import fsp from "fs/promises";
import { GoogleGenAI } from "@google/genai";

const MODEL = process.env.GEMINI_AUDIO_MODEL || process.env.GEMINI_TEXT_MODEL || process.env.GEMINI_VIDEO_MODEL || "gemini-3.5-flash";

/** Stretches per request. Keeps one request well under the inline-data ceiling. */
const BATCH = 30;
const PARALLEL = 3;

let _keys = null;
let _cursor = 0;
function nextKey() {
  if (!_keys) {
    _keys = String(process.env.AISTUDIO_KEY || "").split(",").map((k) => k.trim()).filter(Boolean);
  }
  if (!_keys.length) throw new Error("AISTUDIO_KEY is not set");
  return _keys[_cursor++ % _keys.length];
}
const _clients = new Map();
function client(key) {
  if (!_clients.has(key)) _clients.set(key, new GoogleGenAI({ apiKey: key }));
  return _clients.get(key);
}

function promptFor(lines, languageLabel) {
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

async function callOnce(parts) {
  const res = await client(nextKey()).models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts }],
    config: {
      temperature: 0.1,
      responseMimeType: "application/json",
      maxOutputTokens: 16384,
      // Transcription is mechanical. Same measured finding as geminiClient.js:
      // thinking costs output-rate tokens and changes nothing here.
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  const raw = res?.text || "";
  const parsed = JSON.parse(raw || "{}");
  const u = res?.usageMetadata || {};
  const inRate = parseFloat(process.env.GEMINI_USD_PER_M_INPUT || "1.50");
  const outRate = parseFloat(process.env.GEMINI_USD_PER_M_OUTPUT || "9.00");
  const input = Number(u.promptTokenCount) || 0;
  const output = (Number(u.candidatesTokenCount) || 0) + (Number(u.thoughtsTokenCount) || 0);
  return { pieces: Array.isArray(parsed.pieces) ? parsed.pieces : [], usd: (input / 1e6) * inRate + (output / 1e6) * outRate, input, output };
}

function retryable(err) {
  const status = err?.status ?? err?.response?.status;
  const msg = String(err?.message || "").toLowerCase();
  return status === 429 || status >= 500 || /unavailable|overloaded|resource_exhausted|deadline|unexpected end|json/.test(msg);
}

/**
 * @param {object} args
 * @param {{ path, start, end }[]} args.pieces   audio files, one per stretch, in order
 * @param {{ n, text, roman }[]} args.lines      the script
 * @param {string} [args.languageLabel]
 * @param {Function} [args.onProgress]           (0..1)
 * @returns {Promise<{ results: { text, roman, lines }[], usage: { usd, input, output } }>}
 *   results[i] belongs to pieces[i]
 */
export async function transcribePieces({ pieces, lines, languageLabel = "", onProgress = () => {} }) {
  const prompt = promptFor(lines, languageLabel);
  const results = pieces.map(() => ({ text: "", roman: "", lines: [] }));
  const usage = { usd: 0, input: 0, output: 0 };

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
        const out = await callOnce(parts);
        usage.usd += out.usd;
        usage.input += out.input;
        usage.output += out.output;
        for (const r of out.pieces) {
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
    });
  };

  const queue = batches.slice();
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
      while (queue.length) await runBatch(queue.shift());
    })
  );

  return { results, usage };
}

export default { transcribePieces };

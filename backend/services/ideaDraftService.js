/**
 * ideaDraftService.js: turn two lines into something worth checking.
 *
 * ── THE PROBLEM ──────────────────────────────────────────────────────────────
 * "Today I want to explain the difference between candlestick patterns and
 * chart patterns" is a complete idea and almost no material. Handed straight to
 * the writer it produces sixty seconds built out of one sentence restated four
 * ways, because there is nothing else in the room. The creator reads it, sees
 * their own sentence padded, and concludes the product cannot write.
 *
 * Searching the news does not help here and never will. This is not an event;
 * there is no coverage of it, today or ever. What is missing is not sources,
 * it is CONTENT: what the two things actually are, how they differ, what
 * examples land, what a viewer gets wrong about them.
 *
 * ── WHY A MODEL MAY WRITE THAT, WHEN IT MAY NOT WRITE A SCRIPT ───────────────
 * The rest of this product forbids the model from using its training, because a
 * creator reading an invented number aloud to their own audience is the worst
 * thing it could cause. That rule is not relaxed here. What changes is who
 * signs off.
 *
 * This output is never used directly. It is shown to the creator in an editable
 * box, they correct it, and only the version they approve becomes the material
 * the script is written from. At that point it is not the model's claim, it is
 * theirs, made about their own subject, which they know better than we do.
 * A human in the loop is the entire difference between drafting and inventing.
 *
 * That is also why this is DELIBERATELY not a script. A finished script in
 * their voice is something a creator skims and accepts; a page of plain
 * talking points is something they read and correct. The step only works if it
 * still looks like a draft.
 */
import { GoogleGenAI } from "@google/genai";

const MODEL = process.env.GEMINI_TEXT_MODEL || process.env.GEMINI_VIDEO_MODEL || "gemini-3.5-flash";

let _client = null;
function client() {
  if (_client) return _client;
  const key = String(process.env.AISTUDIO_KEY || "").split(",")[0].trim();
  if (!key) throw new Error("AISTUDIO_KEY is not set");
  _client = new GoogleGenAI({ apiKey: key });
  return _client;
}

/**
 * How long a draft runs.
 *
 * Generous on purpose. The creator has not chosen a duration yet, so this has
 * to be able to serve whatever they pick next, and a writer given more material
 * than a 45 second Reel needs will select from it. The reverse does not work:
 * a 300-word draft cannot support an eight minute script, and the writer would
 * be back to padding, which is the exact failure this step exists to fix.
 */
const TARGET_WORDS = "250-450 words";

/**
 * Draft the content of a video from the creator's idea.
 *
 * @param {string} brief          what they typed
 * @param {object} opts
 * @param {string} opts.previous  an earlier draft they rejected, so a redraft
 *   produces something genuinely different rather than the same text reworded
 * @returns {Promise<string>} plain text, or "" if it could not be drafted. The
 *   caller falls back to the brief alone; this must never break a preview.
 */
export async function draftFromIdea(brief, { previous = "" } = {}) {
  const idea = String(brief || "").trim();
  if (!idea) return "";

  const prompt = `A video creator told you what they want their next video to be about. Write the CONTENT of that video for them to review and edit.

WHAT THEY SAID:
"""${idea.slice(0, 2000)}"""

${previous ? `They have already seen this draft and asked for a different one. Take a genuinely different angle, structure or set of examples. Do not reword the same draft:
"""${previous.slice(0, 2000)}"""

` : ""}WHAT TO WRITE
Write what the video should actually SAY. The substance: what the thing is, how it works, the real differences, the examples that make it land, what people usually get wrong. If they stated an opinion or an argument, build out THEIR argument with reasoning and examples, do not argue against it or add balance they did not ask for.

RULES
1. LANGUAGE. Write in exactly the same language and script the creator used above. If they wrote in Hinglish, write Hinglish. If they mixed Devanagari and English, mix them the same way. If they wrote in plain English, write plain English. Do not translate their subject into another language.
2. NOT A SCRIPT. No hook, no "hey guys", no sign-off, no call to action, no stage directions. Those come later, in their own voice, from their own videos. This is the raw material only.
3. NO INVENTED SPECIFICS. Do not make up statistics, study results, percentages, dates, prices, company figures or quotes. If a number would help but you are not certain of it, describe it in words instead ("most of the time", "a much shorter window"). A creator is going to read this out loud, and a plausible invented figure is worse than no figure.
4. PLAIN TEXT. Short paragraphs, blank line between them. No markdown, no bullet symbols, no headings, no numbering. It goes into a plain edit box.
5. LENGTH. ${TARGET_WORDS}. Enough to build a long video from; the writer will cut what a short one does not need.
6. Say things a person actually knows about this subject. No filler, no "in today's fast-paced world", no restating the brief back at them.

Return STRICT JSON only:
{
  "draft": "the content, following every rule above"
}`;

  try {
    const res = await client().models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        // Warmer than the analysis passes, cooler than the script writer. This
        // is explanatory content the creator will edit, so it wants to be
        // correct and organised more than it wants to be surprising.
        temperature: 0.7,
        responseMimeType: "application/json",
        maxOutputTokens: 2048,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const parsed = JSON.parse(res.text || "{}");
    const draft = String(parsed.draft || "").trim();
    if (!draft) return "";

    console.log(`[draft] wrote ${draft.split(/\s+/).length} words for "${idea.slice(0, 50)}"`);
    return draft;
  } catch (err) {
    // Never thrown to the caller. A failed draft means the creator reviews
    // nothing and writes from their brief, which is what happened before this
    // step existed; losing the whole preview over it would be far worse.
    console.warn(`[draft] failed: ${err.message}`);
    return "";
  }
}

export default { draftFromIdea };

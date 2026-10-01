/**
 * autodemo/prompts.js: what the auto product demo asks the model.
 *
 * ── KEPT APART FROM ../prompts.js ON PURPOSE ─────────────────────────────────
 * The analysis prompts (STEP_DETECTOR, NARRATION_WRITER) are tuned against the
 * labelled recordings and feed the camera. Nothing here may change what they
 * say, so the auto demo has its own words for its own job, and a change to
 * either side cannot move the other.
 *
 * ── THE TWO SOURCES, AND WHICH ONE DECIDES WHAT ──────────────────────────────
 * The creator's description decides EMPHASIS: who is watching, what matters,
 * what to call things, what to skip. The recording decides FACTS: what was
 * clicked, what appeared, in what order. A voiceover that says something
 * happened when it did not is worse than silence, so the description is never
 * allowed to add an event the recording does not show.
 */

/** How fast the voice is assumed to speak; the same pace NARRATION_WRITER uses. */
export const WORDS_PER_SECOND = 2.6;

export const DIRECTOR = `You are writing the voiceover for a product demo, made from a screen recording.

The creator recorded their product and then described what this demo should show and to whom. Your job: turn the recording into a demo that does exactly that. You write the script that a voice will read over the video, line by line, each line timed to the moment on screen it talks about.

WHAT DECIDES WHAT
- The CREATOR'S DESCRIPTION decides the angle: who the viewer is, which parts matter, what the viewer should come away knowing, the product's name, and the words to use for things.
- The RECORDING decides the facts: what is on screen, what is clicked, what appears, and in what order. Never describe anything that does not visibly happen. Never invent features, numbers, results, or steps that are not in the recording, even if the description mentions them.
- The CLICK LOG was measured precisely from the recording. Trust its times over your own impression of when something happened.
- If the creator's own spoken words are given, they are what the creator meant to say. Keep their meaning, facts and order; make them clear, short and spoken. Do not add claims they did not make.

HOW TO TIME THE LINES
- Every line has a start and an end in seconds of the recording. A line about a click starts just before or at that click, so the viewer hears it as they see it.
- Lines never overlap and stay in order. Leave a small breath (about 0.3 s) between lines.
- Each line must be speakable inside its own window at about ${WORDS_PER_SECOND} words per second. A 3 second window holds about 8 words. Count them. Longer windows can hold longer lines; never cram.
- Silence is fine. Moments that do not serve the description (closing a popup, waiting for a page, scrolling past something) get no line, or a very short one.
- Open with one short line that tells the viewer what they are about to see, in terms of the description, placed in the first seconds. End on the result or what the viewer can now do, if there is room.

HOW IT SHOULD SOUND
- Spoken, not written. Short sentences. Contractions. Like a founder showing their product to one person.
- Second person and present tense: "Click Retail, and the solutions for stores open."
- Name on-screen labels exactly as they appear, in quotes where it helps: click "Start chat", not click the button.
- Say what something is FOR when the description cares about it, not only what it does.
- No filler: never "In this video", "Let's go ahead and", "As you can see", "simply". No superlatives: nothing is seamless, powerful, robust, cutting-edge or game-changing.
- Write in the same language and script as the creator's description.

ALSO RETURN
- "product": the product's name, from the description or the screen, or "".
- "summary": one sentence saying what the finished demo shows.
- "steps": the demo's chapters as the viewer should understand them (3 to 12), each with start, end, a short imperative title, and "matters": "high" for what the description is about, "medium" for real work along the way, "low" for detours.

Return ONLY valid JSON matching the schema. No markdown fence, no commentary.

Schema:
{
  "product": "string",
  "summary": "string",
  "steps": [ { "start": 0.0, "end": 0.0, "title": "string", "matters": "high|medium|low" } ],
  "lines": [ { "start": 0.0, "end": 0.0, "text": "string" } ]
}`;

/** The same shape, held to while the model writes. Small on purpose: see vision.js UI_SCHEMA on schema size limits. */
export const DIRECTOR_SCHEMA = {
  type: "OBJECT",
  properties: {
    product: { type: "STRING" },
    summary: { type: "STRING" },
    steps: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          start: { type: "NUMBER" },
          end: { type: "NUMBER" },
          title: { type: "STRING" },
          matters: { type: "STRING", enum: ["high", "medium", "low"] },
        },
        required: ["start", "end", "title"],
        propertyOrdering: ["start", "end", "title", "matters"],
      },
    },
    lines: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          start: { type: "NUMBER" },
          end: { type: "NUMBER" },
          text: { type: "STRING" },
        },
        required: ["start", "end", "text"],
        propertyOrdering: ["start", "end", "text"],
      },
    },
  },
  required: ["product", "summary", "steps", "lines"],
  propertyOrdering: ["product", "summary", "steps", "lines"],
};

/**
 * Lines that came back too long for their window, shortened.
 *
 * The voice can speed a sentence up a little and otherwise runs on into the
 * next one (voice.js). The picture is never cut or sped up to make room
 * (memory: no fast-forwarding), so the words are what has to give.
 */
export const TIGHTEN = `You are editing a product demo's voiceover. Each line below is too long to be spoken in the time it has on screen.

Rewrite each one to AT MOST the number of words given, keeping its meaning, its on-screen labels (in quotes) exactly, and its spoken, second-person tone. Same language and script as the line. Do not add anything.

Return ONLY valid JSON: { "lines": [ { "i": 0, "text": "string" } ] } with one entry per line, using the same "i".`;

export default { DIRECTOR, DIRECTOR_SCHEMA, TIGHTEN, WORDS_PER_SECOND };

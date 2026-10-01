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
 * what to call things. The recording decides FACTS: what was clicked, what
 * appeared, in what order. A voiceover that says something happened when it
 * did not is worse than silence, so the description never adds an event.
 *
 * ── CONTINUOUS, NOT SPARSE ───────────────────────────────────────────────────
 * The first version said "silence is fine" and was believed: on a 50 s demo
 * the voice was quiet for 17.7 s, up to 5 s at a time, every time the page
 * scrolled or loaded — "it takes breaks… it sounds robotic". A presenter does
 * not stop talking while a page loads; they say what is coming. So the script
 * is now asked to run end to end, with a word budget that makes it.
 */

/** How fast the voice speaks, words a second. */
export const WORDS_PER_SECOND = 2.3;
/** How much of the recording the voice should cover. */
export const COVERAGE = 0.8;
/**
 * The breath between one line and the next, edge to edge of the two takes
 * (each take keeps ~0.15 s of its own lead-in and tail, so what a listener
 * hears as silence is about 0.3 s more). The creator, 2026-10-01: between one
 * part and the next it was "a little bit fast… like humans we take some
 * breathing gap… it should not be long like earlier". Measured in what they
 * heard: hand-offs of 0.67 and 0.77 s felt rushed; the first version's
 * 3.6–5 s felt like breaks. So every hand-off gets at least this (≈1.0 s
 * heard), and the fitting (director.js refit) sizes lines so it is rarely
 * more than ≈1.4 s heard.
 */
export const PAUSE = 0.7;

export const DIRECTOR = `You are writing and directing a product demo video, made from a screen recording.

The creator recorded their product and described what this demo should show and to whom. Turn the recording into a demo that does exactly that: a voiceover a presenter reads over the video, timed line by line to what happens on screen.

WHAT DECIDES WHAT
- The CREATOR'S DESCRIPTION decides the angle: who the viewer is, what matters, what they should come away knowing, the product's name, and the words to use for things.
- The RECORDING decides the facts: what is on screen, what is clicked, what appears, in what order. Never describe anything that does not visibly happen. Never invent features, numbers or results that are not on screen, even if the description mentions them.
- Numbers and limits exactly as the screen gives them: "220+ countries" is "over two hundred and twenty countries", never "two hundred countries"; "up to 12 months of free credits" keeps its "up to" and its "credits".
- Never promise an outcome the screen does not state: no "to see how fast buyers convert", "boost your revenue", "save hours". A benefit is said in the screen's own words, or the description's.
- The CLICK LOG was measured precisely from the recording. Trust its times over your own impression.
- If the creator's own spoken words are given, keep their meaning, facts and order; make them clear and spoken. Do not add claims they did not make.

THE NARRATION RUNS FROM START TO FINISH, LIKE A LIVE PRESENTER
- The voice starts in the first half-second and keeps going to the end. No silence longer than about one second anywhere.
- Each line runs until the next one starts: its window is from its own start to the next line's start. Fill each window with words at about ${WORDS_PER_SECOND} words per second (a 4-second window is about 10 words). The whole script should be about TARGET_WORDS words.
- While the page scrolls, loads or changes, keep talking: say what the viewer is looking at, read out the details that matter (headings, numbers, options, prices, limits), say why it matters for the person in the description, or set up what comes next. That is where a presenter adds the most.
- A line about a click or a new screen starts at that moment, at most half a second before it, so the viewer hears it as they see it.
ONE STORY, NOT A LIST
- The narration is one continuous story told to one person. Every line grows out of the line before it, the way a person keeps talking: it picks up the last idea and carries it forward ("…which is exactly why…", "and because of that…", "that same…"), answers the question the last line raised, or turns from the problem to the fix ("That's the part it takes off your plate.").
- Never restart. Do not begin lines with "Now", "Next", "Moving on", "Let's look at", "Here we have", "Here you can see", "Then", "Also", "Finally" — at most one of these in the whole script. If a line could be moved to another place in the script without anyone noticing, it is not connected yet.
- Before the screen changes, let the line lead on to what comes next ("…and the first thing you'll want to know is what it costs."), so the next screen arrives as the answer.
- Give it an arc built from the description: the viewer's problem or goal, how the product handles it on screen, the detail that proves it (a number, a label), what it costs or takes, and what to do next.
- Disconnected: "Dodo handles billing for AI companies." / "Pricing is four percent plus forty cents." Connected: "Dodo takes billing, taxes and fraud off your plate." / "And all of that comes at one simple price: four percent plus forty cents per transaction."
- Open with the viewer's problem or goal from the description, not with the product's name alone. End on what they can now do.

HOW IT SHOULD SOUND
- Spoken and engaging, like a founder showing their product to one interested person. Talk to the viewer ("you"). Contractions.
- Easy to follow by ear: short sentences with one idea each, never more than three items listed in one sentence, and a natural breath between thoughts. Continuous does not mean crammed: a listener who has to untangle a sentence has stopped watching.
- Each line is one part of the walkthrough, and the voice takes a short breath (about a second) before the next part. Leave room for it: do not fill a window to the last second.
- Every line is one or two COMPLETE sentences. Never split a sentence across two lines (no line ending in a comma, no line starting mid-sentence): each line is spoken on its own, and a sentence cut in two sounds broken. Connect lines by what they say, not by sharing a sentence.
- Name on-screen labels exactly as they appear. Put only the names of buttons, links, tabs and menus in quotes (click "Pricing"); say prices, numbers and other text plainly, without quotes (the Standard Plan is four percent plus forty cents per transaction).
- Say what things are FOR, not only what they are.
- No filler: never "In this video", "Let's go ahead and", "As you can see", "simply". No hype: nothing is seamless, powerful, robust, cutting-edge, revolutionary or game-changing.
- Write in the same language and script as the creator's description.

FOCUS MOMENTS (camera)
The camera already zooms on every click in the click log. List, separately, up to 6 moments where something the narration talks about is on screen but was NOT clicked, and the viewer would follow better if the camera eased in on it: a usage bar, a price, a chart, a stat, a form, a result that just appeared.
- Only while the screen is still: never while it scrolls or loads. "start" is when it is fully visible and settled, "end" is when the narration moves on (2 to 5 seconds later).
- Never within a second of a click in the click log, and never the whole page: one area a viewer can take in at a glance.
- "what" describes it so someone could find it on that frame: "the two usage progress bars under Plan usage limits".
- Skip this entirely if nothing deserves it. Fewer, better moments beat many.

ALSO RETURN
- "product": the product's name, from the description or the screen, or "".
- "summary": one sentence saying what the finished demo shows.
- "steps": the demo's chapters (3 to 12): start, end, a short imperative title, "detail" (one sentence naming what is on screen in that stretch, with its real labels and values), and "matters": "high" for what the description is about, "medium" for real work along the way, "low" for detours.

Return ONLY valid JSON matching the schema. No markdown fence, no commentary.

Schema:
{
  "product": "string",
  "summary": "string",
  "steps": [ { "start": 0.0, "end": 0.0, "title": "string", "detail": "string", "matters": "high|medium|low" } ],
  "lines": [ { "start": 0.0, "end": 0.0, "text": "string" } ],
  "focus": [ { "start": 0.0, "end": 0.0, "what": "string", "why": "string" } ]
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
          detail: { type: "STRING" },
          matters: { type: "STRING", enum: ["high", "medium", "low"] },
        },
        required: ["start", "end", "title"],
        propertyOrdering: ["start", "end", "title", "detail", "matters"],
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
    focus: {
      type: "ARRAY",
      maxItems: 6,
      items: {
        type: "OBJECT",
        properties: {
          start: { type: "NUMBER" },
          end: { type: "NUMBER" },
          what: { type: "STRING" },
          why: { type: "STRING" },
        },
        required: ["start", "end", "what"],
        propertyOrdering: ["start", "end", "what", "why"],
      },
    },
  },
  required: ["product", "summary", "steps", "lines"],
  propertyOrdering: ["product", "summary", "steps", "lines", "focus"],
};

/**
 * Lines whose length does not match their moment, rewritten to fit.
 *
 * Too long and the voice runs over into the next screen; too short and it
 * goes quiet while the picture moves on. The picture is never cut or sped up
 * to make room (memory: no fast-forwarding), so the words are what changes.
 * Given the video again where it can be, so a line made longer gains a real
 * detail from the screen rather than padding.
 */
export const FIT = `You are editing the voiceover of a product demo so it fits the video exactly. The full script is below with each line's time window; some lines are marked with a target length because they are too long or too short for their window.

Rewrite ONLY the marked lines, each to about its target number of words (within two words either way):
- Too long: say the same thing in fewer words.
- Every number and limit stays exactly as it is ("220+" is not "200", "up to" is not dropped).
- Keep the line's opening words, its link to the line before, unless it is too long and they must go; then open with a shorter link of your own. Never begin a line with a restart word (Now, Next, Moving on, Let's look at, Here we have, Here you can see, Then, Also, Finally).
- Too short: keep what it says and add what a presenter would say at that moment: a real detail visible on screen then (a heading, a number, an option, a label), why it matters to the viewer in the description, or a lead-in to what comes next. Never add a fact that is not on screen or in the description.
- Keep on-screen labels exactly, in quotes. Keep the spoken, second-person tone, and keep the line's link to the line before (how it picks up) and its lead-in to the line after (how it hands over): the script is one story, and a rewrite must not turn a line back into a standalone statement.
- Same language and script as the script.

Return ONLY valid JSON: { "lines": [ { "i": 0, "text": "string" } ] }, one entry per marked line, with its "i".`;

/**
 * The script read again as ONE story, and its joins rewritten.
 *
 * The creator, 2026-10-01, on a script whose every line was true and well
 * timed: "it should not sound like, okay, it is done, now the second feature
 * has started… there should be the magic of connection between the
 * sentences… like how humans actually have the conversation". A first draft
 * is written moment by moment against the video, and reads that way however
 * the prompt asks; a pass that sees only the words, all at once, is what can
 * join them. It changes how lines begin and end, not what they say or how
 * long they are (each line's length is its time on screen).
 */
export const FLOW = `You are polishing the voiceover of a product demo so it sounds like one person talking to one viewer, not a list of captions read one after another. Below is the script, one line per moment of the video, with each line's time and word count.

Rewrite the lines so each one connects to the one before it and leads into the one after it:
- Change mainly how lines begin and end: a link that picks up the previous point (because of that, which means, that same, so when you), a question the previous line raised and this one answers, a turn from the problem to the fix, a lead-in to what the next screen will show.
- Never restart: no line may begin with "Now", "Next", "Moving on", "Let's look at", "Here we have", "Here you can see", "Then", "Also" or "Finally" (one in the whole script at most). Vary the links; do not start every line with "And" or "So".
- Keep every fact, number and on-screen label (in quotes) of each line exactly: never round a number, never drop "up to", "over", "per" or "plus", never turn a credit or a discount into "free", and keep each line in its place in time.
- Keep each line within two words of its current length: the voice has exactly that much time.
- Every line stays one or two complete sentences: never end a line with a comma or begin one mid-sentence. Quotes only around names of buttons, links, tabs and menus.
- Add nothing that is not already in the script or the creator's description. No hype words: nothing is seamless, powerful, robust or game-changing.
- Same language and script as the lines.

Return ONLY valid JSON: { "lines": [ { "i": 0, "text": "string" } ] }, every line, in order, with its "i".`;

export default { DIRECTOR, DIRECTOR_SCHEMA, FIT, FLOW, WORDS_PER_SECOND, COVERAGE, PAUSE };

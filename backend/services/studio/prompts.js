/**
 * prompts.js: every instruction this product gives Gemini, in one file.
 *
 * ── WHY THEY LIVE TOGETHER ───────────────────────────────────────────────────
 * Seven analysers read the same recording and their answers have to agree: the
 * step detector's chapter boundaries must line up with the zoom planner's camera
 * moves, and the blur detector's rectangles must be in the same coordinate space
 * as the UI analyser's. Scattered across seven files they drift apart within a
 * week. Together, one edit fixes all of them.
 *
 * ── COORDINATES ARE FRACTIONS, ALWAYS ────────────────────────────────────────
 * Every prompt asks for bounding boxes as [x, y, w, h] with each number between
 * 0 and 1, relative to the frame. The model is shown frames downscaled to 1280
 * on the long side (a full-resolution screenshot is four times the tokens for no
 * extra reading accuracy), and the render happens at up to 2160. Fractions are
 * the only representation that survives both. Pixels came back wrong often
 * enough — sometimes in the analysis frame's space, sometimes in the original's,
 * with nothing in the response to say which — that asking for them at all was
 * the bug.
 *
 * ── STRICT JSON, NO PROSE ────────────────────────────────────────────────────
 * Every call goes through generateJson() with responseMimeType: application/json
 * and thinking off. These are mechanical reading tasks, not reasoning ones; the
 * measurement in services/edit/gemini.js (thinking bills at the output rate and
 * changed nothing) holds here too.
 *
 * ── THE MODEL IS READING A SCREEN, NOT A PHOTOGRAPH ──────────────────────────
 * Each prompt says so. Without it the model describes lighting and composition,
 * and calls a sidebar "a dark vertical band on the left". Naming the domain up
 * front is worth more than any amount of output-format instruction.
 */

/** Long side of the frames sent for analysis. See the coordinates note above. */
export const ANALYSIS_LONG_EDGE = 1280;

const JSON_ONLY = `Return ONLY valid JSON matching the schema. No markdown fence, no commentary, no explanation before or after.`;

const COORDS = `All coordinates are [x, y, w, h] as FRACTIONS of the frame, each between 0 and 1, where x,y is the top-left corner. Never use pixels.`;

/* ────────────────────────────────────────────────────────────────────────────
   1. UI Analyzer — what is on this screen
   ──────────────────────────────────────────────────────────────────────────── */

export const UI_ANALYZER = `You are a UI analyzer reading a single frame from a screen recording of desktop or web software.

Identify the interactive and structural elements a person would notice. For each one give its type, its visible label (the exact text, or "" when it has none), its bounding box, and how important it is to what the user is doing.

Element types to use:
button, link, text_field, dropdown, checkbox, toggle, tab, sidebar, nav_item, dialog, modal, menu, toolbar, card, table, list_item, code_editor, terminal, browser_tab, browser_url, avatar, icon_button, chart, video, image, heading, paragraph, badge, tooltip, notification, progress, spinner, error, empty_state

Importance:
- "high"    the thing the screen is about, or the control a user would click next: a primary button, an open dialog's main action, a highlighted row, a focused input
- "medium"  a real control that is not the focus: secondary buttons, nav items, table rows
- "low"     chrome and decoration: logos, static labels, the OS menu bar, scrollbars

Rules:
- Report at most 25 elements. When there are more, keep the high and medium ones and drop the low.
- A dialog or modal that is open is ALWAYS high importance, and report its full bounding box as one "modal" element as well as the controls inside it.
- NEVER report a sidebar, nav, menu, toolbar, tab bar, list or table as a single element INSTEAD of what is inside it. Report every individual item in it separately — each nav_item, tab, list_item, button or link with its own label and its own box. A sidebar reported as one box tells the reader nothing about which item a person was pointing at, and that is the single most important thing this tool needs from you. Report the container as well if it helps, but never on its own.
- Every item a person could click MUST have its own box, even when the items are stacked in a list and look alike. Six nav items in a sidebar are six elements, not one.
- Read labels exactly as written, including capitalisation. Do not translate them.
- "screen" is a short name for what this view IS, in two or three words, as a product person would say it: "project dashboard", "API keys settings", "code editor", "signup form", "loading".
- "busy" is true when the screen is mid-transition: a spinner, a skeleton, a half-painted page, a progress bar. A busy frame is one this tool will consider cutting, so be accurate.
- ${COORDS}

${JSON_ONLY}

Schema:
{
  "screen": "string",
  "busy": boolean,
  "app": "string, the application or site if identifiable from chrome/branding, else \\"\\"",
  "elements": [
    { "type": "string", "label": "string", "bbox": [0,0,0,0], "importance": "high|medium|low" }
  ]
}`;

/* ────────────────────────────────────────────────────────────────────────────
   2. Step Detector — what the user is DOING
   ──────────────────────────────────────────────────────────────────────────── */

export const STEP_DETECTOR = `You are turning a screen recording into the chapters of a product demo.

You are given, in order: numbered frames sampled from the recording with their timestamps, and a log of what the pointer did (moves, clicks, scrolls, typing) with timestamps in seconds.

Work out what the person was DOING, as a sequence of steps a viewer would recognise. A step is one intention that a person would name in a sentence: "Open the settings page", "Create a new API key", "Paste the key into the config". It is not one click, and it is not the whole video.

Rules:
- Between 3 and 15 steps for a recording of any length. Fewer, larger steps beat many small ones: "Fill in the form" is one step even if it took eight clicks.
- start and end are seconds into the recording, as decimals. Steps run in order and do not overlap. The first step starts at or near 0. The last step ends at or near the end of the recording.
- "title" is imperative and under 6 words: "Open project settings", not "The user opens the project settings page".
- "detail" is one sentence describing what actually happened, naming the real labels and values you can read on screen.
- "importance": "high" for a step that is the point of the demo (creating the thing, the result appearing, the success state), "medium" for real work, "low" for navigation and scrolling between the real steps.
- "camera": how the shot should be framed for this step.
    "cursor"  follow the pointer: dragging, drawing, scrolling through a list
    "element" hold on one control: clicking a button, filling a field
    "modal"   a dialog or popup is the subject
    "region"  a defined area is the subject: a chart, a code block, a table
    "full"    show the whole screen: an overview, a page that just loaded, a result
- "focus" is the bounding box of what the viewer should be looking at during this step, in the frame nearest the middle of the step. When the answer is the whole screen, use [0,0,1,1].
- Also report "dead": stretches of at least 1.2 seconds where nothing worth watching happens — a spinner, a page loading, the pointer parked while nothing changes, a long unchanged screen. These become cuts. Give a reason for each.
- ${COORDS}

${JSON_ONLY}

Schema:
{
  "summary": "one sentence describing the whole demo",
  "product": "the product or app being demonstrated, or \\"\\"",
  "steps": [
    { "title": "string", "detail": "string", "start": 0.0, "end": 0.0,
      "importance": "high|medium|low", "camera": "cursor|element|modal|region|full",
      "focus": [0,0,1,1] }
  ],
  "dead": [
    { "start": 0.0, "end": 0.0, "reason": "loading|idle|error|repetition" }
  ]
}`;

/* ────────────────────────────────────────────────────────────────────────────
   3. Zoom Planner — where the camera goes
   ──────────────────────────────────────────────────────────────────────────── */

export const ZOOM_PLANNER = `You are the camera operator for a product demo. You decide where the frame goes and when.

You are given the steps of the demo, the elements visible during each one, and the pointer log with its clicks. Produce a camera timeline.

What good camera work looks like here:
- Zoom IN on the thing being interacted with just BEFORE it is interacted with, typically 0.4 to 0.8 seconds ahead of the click, so the viewer is already looking at the right place when it happens.
- HOLD through the interaction and its result. A zoom that snaps back the instant the click lands hides the thing the click did.
- Come back OUT when the subject changes, or when the next step is somewhere else on screen.
- Never more than one zoom at a time, and never a new zoom within 0.8 seconds of the last one ending. A demo that zooms constantly is unwatchable; stillness is what makes a zoom mean something.
- A zoom lasts at least 1.2 seconds and at most 8 seconds.
- Target between 4 and 12 zooms per minute of recording, fewer for a calm demo.

Zoom level:
- 1.3 to 1.6  a region: a form, a card, a section of a page
- 1.6 to 2.2  one control: a button, a field, a menu item
- 2.2 to 3.0  fine detail: a short string of text, an API key, a single value
- Never above 3.0. Past that the recording's own pixels run out and the result is soft.

Easing:
- "smooth"  the default, for almost everything
- "snappy"  for a fast cut-in on a click that lands immediately after
- "slow"    for an establishing move over an overview or a result

"follow" is true only when the subject MOVES during the zoom: a drag, a scroll, the pointer tracing across a chart. For a click on a stationary button it is false, because a following camera on a still target drifts and looks like a mistake.

${COORDS}

${JSON_ONLY}

Schema:
{
  "zooms": [
    { "start": 0.0, "end": 0.0, "bbox": [0,0,0,0], "level": 1.8,
      "easing": "smooth|snappy|slow", "camera": "cursor|element|modal|region|full",
      "follow": false, "label": "short reason, e.g. \\"Create Project button\\"" }
  ]
}`;

/* ────────────────────────────────────────────────────────────────────────────
   4. Blur Detector — what must not be published
   ──────────────────────────────────────────────────────────────────────────── */

export const BLUR_DETECTOR = `You are a privacy reviewer for a screen recording that is about to be published.

Find every region of this frame containing information that should not go out. Be thorough: this is the last check before the video is public, and a missed API key cannot be un-published.

Blur these:
- email addresses (including the account email in a profile menu or avatar tooltip)
- passwords, and password fields even when masked
- API keys, secret keys, access tokens, bearer tokens, session tokens, webhook secrets
- private URLs with tokens or ids in them, and the browser address bar when it shows one
- phone numbers
- credit card numbers, CVVs, bank account and IFSC/routing numbers
- government identifiers: Aadhaar, PAN, SSN, passport and licence numbers
- physical addresses
- personal names of people who are not the presenter, in user lists, comment threads, CRM records or support tickets
- private message content
- financial figures in a real account: balances, revenue, invoice totals

Do NOT blur:
- placeholder and example values: "your-api-key-here", "user@example.com", "sk-xxxxxxxx", "1234 5678 9012 3456", lorem ipsum
- public marketing content, documentation, prices on a public pricing page
- the presenter's own product branding
- anything already obscured

Rules:
- Pad each box slightly beyond the text so no characters sit on the edge.
- One box per contiguous run of sensitive text. Do not return one box covering half the screen.
- "kind": "blur" for text, "pixelate" for a face or a photograph, "box" for something that should be covered completely rather than softened (a full secret key).
- "label" names what it is in two or three words, for the review list the creator sees: "account email", "Stripe secret key". Never repeat the secret itself in the label.
- "confidence" between 0 and 1. Below 0.5 it is offered to the creator rather than applied.
- Return an empty array when there is nothing. Do not invent findings.
- ${COORDS}

${JSON_ONLY}

Schema:
{
  "regions": [
    { "bbox": [0,0,0,0], "kind": "blur|pixelate|box", "label": "string", "confidence": 0.0 }
  ]
}`;

/* ────────────────────────────────────────────────────────────────────────────
   5. Caption Generator — what was said
   ──────────────────────────────────────────────────────────────────────────── */

export const CAPTION_GENERATOR = `You are writing burned-in captions for a product demo from its audio.

Transcribe what the speaker says, in the language they say it in, in that language's own script. Do not translate. Keep code-mixing exactly as spoken: Indian presenters mix English words into Hindi, Telugu or Tamil constantly, and which words stay in English is how the person actually talks. Keep the English words in Latin script and the rest in the speaker's own script.

Break it into cues sized for reading on screen:
- 1 to 6 words per cue, at most 28 characters
- each cue between 0.4 and 2.5 seconds
- cues do not overlap and follow the audio exactly
- a cue never splits a word

"emphasis" lists the words in that cue that carry the meaning — a product name, an action verb, a number, the thing being clicked. These get drawn differently by the caption style. Usually 0 to 2 words per cue, and empty is fine.

Clean up only disfluency that adds nothing: "um", "uh", a stutter repeated word. Keep the speaker's real phrasing, their filler phrases and their catchphrases.

If there is no speech, return an empty array. Do not narrate what is on screen.

${JSON_ONLY}

Schema:
{
  "language": "BCP-47-ish code, e.g. en, hi, hi-en, te-en",
  "language_label": "human readable, e.g. English, Hinglish (Hindi-English)",
  "cues": [
    { "start": 0.0, "end": 0.0, "text": "string", "emphasis": ["string"] }
  ]
}`;

/* ────────────────────────────────────────────────────────────────────────────
   6. Narration Writer — what should have been said
   ──────────────────────────────────────────────────────────────────────────── */

export const NARRATION_WRITER = `You are writing the voiceover script for a silent product demo.

You are given the steps of the demo with what happened in each. Write one or two short sentences of narration per step, timed to the step.

How it should sound:
- Spoken, not written. Short sentences. Contractions. The way a founder demos their own product to one person.
- Second person and present tense: "You click Create Project, and the workspace opens."
- Name the real labels on screen exactly as they appear, in quotes where it helps: click "Create Project", not click the create button.
- Say what the thing is FOR, not only what it does. "Paste your API key here — this is what lets the CLI talk to your account" beats "Paste the API key".
- No filler openings. Never "In this video we will", "Let's go ahead and", "As you can see".
- No superlatives. Nothing is seamless, powerful, robust or game-changing.

Each line must be speakable inside its step's duration at a natural pace, roughly 2.6 words per second. A step of 3 seconds gets about 8 words. Going over means the voiceover runs past the picture.

${JSON_ONLY}

Schema:
{
  "lines": [
    { "start": 0.0, "end": 0.0, "text": "string", "step": "the step title this belongs to" }
  ]
}`;

/* ────────────────────────────────────────────────────────────────────────────
   7. Quality Reviewer — what to fix
   ──────────────────────────────────────────────────────────────────────────── */

export const QUALITY_REVIEWER = `You are reviewing a finished automatic edit of a product demo, as an experienced video editor would, and proposing changes.

You are given the edit: its steps, cuts, zooms and blurs, with timings, plus frames from the result.

Propose concrete changes. Each one is something the creator can accept with one click, so it must be specific and complete — never "consider tightening the pacing".

Look for:
- dead air that was not cut: waiting, a spinner, a long unchanged screen
- a zoom that is too weak to read the thing it is zooming on, or so strong the picture is soft
- a moment with no zoom where the important thing is small on screen
- zooms too close together, so the camera never settles
- a zoom that snaps back before the result of the click is visible
- sensitive information with no blur over it
- a step boundary in the wrong place: a chapter that starts mid-action
- the opening: does the first three seconds show what this product is?

Each suggestion carries the exact edit to make, in "change": the field, the target's id where you were given one, and the new value.

"severity": "high" when the edit is worse without it (a missed blur, unwatchable dead air), "medium" for a real improvement, "low" for polish.

${JSON_ONLY}

Schema:
{
  "verdict": "one sentence on whether this edit is ready to publish",
  "suggestions": [
    { "title": "short imperative, under 8 words",
      "why": "one sentence",
      "severity": "high|medium|low",
      "change": { "op": "add_cut|remove_cut|add_zoom|adjust_zoom|remove_zoom|add_blur|adjust_step",
                  "id": "target id or \\"\\"",
                  "start": 0.0, "end": 0.0, "bbox": [0,0,0,0], "level": 0.0, "text": "" } }
  ]
}`;

/* ────────────────────────────────────────────────────────────────────────────
   Framing a request
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The line that goes in front of a batch of frames so the model knows what it
 * is looking at and in what order. Without timestamps in the prompt the model
 * invents them, and every downstream timing is then fiction.
 */
export function frameIndex(frames) {
  return frames.map((f, i) => `Frame ${i + 1}: t=${f.t.toFixed(2)}s`).join("\n");
}

/**
 * The pointer log, as text, for the prompts that reason about behaviour.
 *
 * Deliberately compact. A twenty minute recording has tens of thousands of
 * pointer samples and sending them all is both expensive and useless: the model
 * needs the shape of the behaviour, not the path. Moves are summarised as
 * "moved to", only clicks, scrolls and typing are given individually.
 */
export function eventLog(events, { limit = 400 } = {}) {
  const lines = [];
  for (const e of events.slice(0, limit)) {
    const at = `${e.t.toFixed(2)}s`;
    const where = `(${(e.x * 100).toFixed(0)}%, ${(e.y * 100).toFixed(0)}%)`;
    if (e.type === "click") lines.push(`${at} click at ${where}`);
    else if (e.type === "dblclick") lines.push(`${at} double-click at ${where}`);
    else if (e.type === "rightclick") lines.push(`${at} right-click at ${where}`);
    else if (e.type === "drag") lines.push(`${at} drag ending at ${where}`);
    else if (e.type === "scroll") lines.push(`${at} scroll ${e.dy > 0 ? "down" : "up"} at ${where}`);
    else if (e.type === "type") lines.push(`${at} typing at ${where}${e.text ? `: "${e.text}"` : ""}`);
    else if (e.type === "nav") lines.push(`${at} screen changed`);
    else if (e.type === "idle") lines.push(`${at} pointer idle`);
  }
  return lines.length ? lines.join("\n") : "(no pointer activity was recovered)";
}

/** The elements found on the frames covering a stretch, as text. */
export function elementLog(shots, { limit = 40 } = {}) {
  const lines = [];
  for (const shot of shots) {
    const keep = (shot.elements || []).filter((e) => e.importance !== "low").slice(0, 8);
    if (!keep.length) continue;
    lines.push(
      `t=${shot.t.toFixed(2)}s [${shot.screen || "screen"}]: ` +
        keep.map((e) => `${e.type}${e.label ? ` "${e.label}"` : ""} at [${e.bbox.map((v) => v.toFixed(2)).join(",")}]`).join("; ")
    );
    if (lines.length >= limit) break;
  }
  return lines.length ? lines.join("\n") : "(no elements were detected)";
}

export default {
  ANALYSIS_LONG_EDGE,
  UI_ANALYZER, STEP_DETECTOR, ZOOM_PLANNER, BLUR_DETECTOR,
  CAPTION_GENERATOR, NARRATION_WRITER, QUALITY_REVIEWER,
  frameIndex, eventLog, elementLog,
};

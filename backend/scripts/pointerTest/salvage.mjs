/**
 * The reply that stopped in the middle.
 *
 *     node scripts/pointerTest/salvage.mjs
 *
 * ── THE BUG THIS REPRODUCES ──────────────────────────────────────────────────
 * From a production log:
 *
 *   [studio] readFrames batch 8 failed: Expected ',' or ']' after array
 *            element in JSON at position 3316
 *   [studio] vision batch 8 answered 0 of 1 frames; asking again one at a time
 *
 * That is not a malformed reply, it is a truncated one: JSON.parse says exactly
 * that when a document ends right after a complete element inside an array. The
 * model had read the frame and named most of its controls; all of them were
 * thrown away over a missing bracket, and the frame was paid for twice.
 *
 * ── WHAT IS ASSERTED ─────────────────────────────────────────────────────────
 *   a truncated reply is closed off      and every complete element survives
 *   nothing is invented                  the result is a PREFIX of what was said
 *   structure inside strings is ignored  a brace in a label is not a container
 *   a genuinely broken reply still fails rather than being quietly half-read
 */
import { closeTruncated, mendCommas, mendClosers } from "../../services/ai/provider.js";

let pass = true;
const ok = (name, cond, detail = "") => {
  console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "  " + detail : ""));
  if (!cond) pass = false;
  return cond;
};

/** A reply shaped like the one readFrames asks for, cut off mid-element. */
const ELEMENTS = [
  { type: "button", label: "Billing", bbox: [0.18, 0.27, 0.1, 0.05], importance: "high" },
  { type: "nav_item", label: "Usage", bbox: [0.18, 0.34, 0.1, 0.05], importance: "high" },
  { type: "row", label: "Invoice history", bbox: [0.48, 0.38, 0.3, 0.07], importance: "medium" },
];
const full = JSON.stringify({ screen: "billing settings", app: "Claude", busy: false, elements: ELEMENTS });

/* Cut it where the model's reply ran out: just after the second element. */
const cutAt = full.indexOf("},", full.indexOf('"Usage"')) + 1;
const truncated = full.slice(0, cutAt);

console.log("\n" + "=".repeat(80));
console.log("  A vision reply that stopped after the second of three controls");
console.log("=".repeat(80) + "\n");
console.log("    the model sent   " + truncated.length + " characters, " + ELEMENTS.length + " controls begun");
let threw = "";
try { JSON.parse(truncated); } catch (e) { threw = e.message; }
console.log("    JSON.parse says  " + threw);

const mended = closeTruncated(truncated);
const got = mended ? JSON.parse(mended) : null;
console.log("    closed off to    " + (mended ? mended.length + " characters" : "(not repairable)"));
console.log("    controls kept    " + (got?.elements || []).map((e) => e.label).join(", "));
console.log("");

ok("the parser really does reject it", /Expected ',' or ']'|Unexpected end/.test(threw), threw.slice(0, 48));
ok("it is closed off into valid JSON", !!got);
ok("the complete controls survive", (got?.elements || []).length === 2, (got?.elements || []).length + " of 3 begun");
ok("with their labels intact", got?.elements?.[0]?.label === "Billing" && got?.elements?.[1]?.label === "Usage");
ok("and their boxes intact", JSON.stringify(got?.elements?.[1]?.bbox) === JSON.stringify([0.18, 0.34, 0.1, 0.05]));
ok("the fields before the array survive", got?.screen === "billing settings" && got?.app === "Claude");
ok(
  "nothing is invented: what comes back is a prefix of what was sent",
  truncated.startsWith(mended.slice(0, mended.length - 2)),
  "kept " + mended.length + " of " + truncated.length
);

/**
 * The half of this that matters more than the repair: a reply that is broken
 * rather than short must still fail. Quietly half-reading a frame would put
 * invented controls under a pointer, which is worse than reading it again.
 */
console.log("");
ok("a balanced reply is left alone", closeTruncated('{"a":[1,2]}') === null);
ok("an empty object is left alone", closeTruncated("{}") === null);
ok("junk with nothing complete in it is not repaired", closeTruncated('{"a":') === null);
ok("a bare truncated string is not repaired", closeTruncated('{"screen":"billing set') === null);

/**
 * A brace or a bracket inside a label is text, not structure. Without the
 * string tracking this would cut in the wrong place and drop a real control.
 */
const tricky = JSON.stringify({
  screen: "editor",
  elements: [
    { type: "button", label: 'Insert {block} [here]', bbox: [0.1, 0.1, 0.1, 0.05] },
    { type: "button", label: 'Say "hello"', bbox: [0.3, 0.1, 0.1, 0.05] },
    { type: "button", label: "third", bbox: [0.5, 0.1, 0.1, 0.05] },
  ],
});
const trickyCut = tricky.slice(0, tricky.indexOf("},", tricky.indexOf('Say ')) + 1);
const trickyGot = JSON.parse(closeTruncated(trickyCut));
ok(
  "braces and quotes inside a label are text, not structure",
  trickyGot.elements.length === 2 && trickyGot.elements[0].label === "Insert {block} [here]",
  trickyGot.elements.map((e) => e.label).join(" | ")
);

/* And the array-of-frames shape, which is what a batched read comes back as. */
const batch = JSON.stringify({ frames: [{ screen: "one", elements: [] }, { screen: "two", elements: [] }, { screen: "three", elements: [] }] });
const batchCut = batch.slice(0, batch.indexOf("},", batch.indexOf('"two"')) + 1);
const batchGot = JSON.parse(closeTruncated(batchCut));
ok(
  "a truncated batch keeps the frames that did arrive",
  batchGot.frames.length === 2 && batchGot.frames[1].screen === "two",
  batchGot.frames.map((f) => f.screen).join(", ")
);

/* ════════════════════════════════════════════════════════════════════════════
   And the other way a reply breaks: whole, and missing a comma
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * From production, after the truncation repair above had shipped:
 *
 *   readFrames batch 5 failed: Expected ',' or ']' after array element in JSON
 *   at position 4389 — 7618 characters … unrepairable
 *
 * 4389 of 7618. Three thousand characters of valid reply AFTER the fault, so
 * nothing was cut off — the model sent a complete answer with a comma missing
 * in the middle of it, and closeTruncated() has nothing to offer a document
 * that does not stop.
 *
 * In this product's prompts that error has one overwhelming cause: the
 * four-number box every element carries, written as [0.039 0.240 0.106 0.050].
 * JSON.parse says exactly that sentence for exactly that input.
 */
console.log("\n" + "=".repeat(80));
console.log("  A reply that arrived whole with a comma missing from a bbox");
console.log("=".repeat(80) + "\n");

const noCommas = '{"screen":"settings","elements":[{"type":"button","label":"Save video to...","bbox":[0.039 0.240 0.106 0.050]}]}';
let midErr = "";
try { JSON.parse(noCommas); } catch (e) { midErr = e.message; }
const put = mendCommas(noCommas);
const back = put ? JSON.parse(put) : null;

console.log("    JSON.parse says   " + midErr);
console.log("    broke at          " + /position (\d+)/.exec(midErr)?.[1] + " of " + noCommas.length + " characters");
console.log("    repaired bbox     " + JSON.stringify(back?.elements?.[0]?.bbox));
console.log("");

ok("the parser really does reject it", /Expected ',' or '\]'/.test(midErr), midErr.slice(0, 46));
ok("the fault is mid-reply, not at the end", Number(/position (\d+)/.exec(midErr)?.[1]) < noCommas.length - 16);
ok("the separators are put back", !!back);
ok(
  "and the box comes out as four numbers",
  JSON.stringify(back?.elements?.[0]?.bbox) === JSON.stringify([0.039, 0.24, 0.106, 0.05]),
  JSON.stringify(back?.elements?.[0]?.bbox)
);
ok(
  "the label is untouched, spaces and all",
  back?.elements?.[0]?.label === "Save video to...",
  JSON.stringify(back?.elements?.[0]?.label)
);

/**
 * The half that matters as much: this must not touch a reply that is already
 * right, and must not invent structure where two values sit side by side at the
 * top level — that is a different kind of broken and guessing at it would be
 * making an answer up.
 */
console.log("");
ok("a valid reply is left alone", mendCommas('{"elements":[{"bbox":[0.1,0.2,0.3,0.4]}]}') === null);
ok("an empty object is left alone", mendCommas("{}") === null);
ok(
  "two elements missing their comma are joined",
  JSON.parse(mendCommas('{"frames":[{"screen":"one"} {"screen":"two"}]}')).frames.length === 2
);
ok(
  "a space inside a string is never a missing comma",
  mendCommas('{"label":"Save video to playlist"}') === null
);
ok(
  "and neither is one in a label beside a broken box",
  JSON.parse(mendCommas('{"label":"New playlist button","bbox":[0.1 0.2 0.3 0.4]}')).label === "New playlist button"
);

/* ════════════════════════════════════════════════════════════════════════════
   And the third shape: a bracket closed with the wrong character
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * Three malformed replies in a row gave the same complaint mid-document —
 * "Expected ',' or ']' after array element" at 1555 of 5969, at 3827 of 8950,
 * at 4389 of 7618 — and mendCommas() repaired none of them.
 *
 * Enumerating what else produces exactly that sentence leaves a short list, and
 * only one item on it is something a model writing this product's prompts does
 * hundreds of times a reply:
 *
 *     "bbox": [0.039, 0.240, 0.106, 0.050}
 *
 * This is a hypothesis reached by elimination rather than a fault read off a
 * real reply, which is why the failure path also logs the structure around the
 * break. If these carry on, that window names the real shape.
 */
console.log("\n" + "=".repeat(80));
console.log("  A box closed with the wrong bracket");
console.log("=".repeat(80) + "\n");

const badClose = '{"screen":"settings","elements":[{"label":"Save video","bbox":[0.1,0.2,0.3,0.4}}]}';
let closeErr = "";
try { JSON.parse(badClose); } catch (e) { closeErr = e.message; }
const shut = mendClosers(badClose);
const whole = shut ? JSON.parse(shut) : null;

console.log("    JSON.parse says   " + closeErr.replace(/ in JSON at position.*/, ""));
console.log("    repaired box      " + JSON.stringify(whole?.elements?.[0]?.bbox));
console.log("");

ok("the parser rejects it the same way production did", /Expected ',' or '\]' after array element/.test(closeErr));
ok("the bracket is closed properly", !!whole);
ok(
  "and the box survives intact",
  JSON.stringify(whole?.elements?.[0]?.bbox) === JSON.stringify([0.1, 0.2, 0.3, 0.4]),
  JSON.stringify(whole?.elements?.[0]?.bbox)
);
ok("the label survives too", whole?.elements?.[0]?.label === "Save video");

/**
 * The bounds. Nothing is moved and no structure is invented: the nesting the
 * model actually wrote decides the answer, a reply whose brackets all match is
 * untouched, and a closer with nothing open is a different kind of broken that
 * this must not paper over.
 */
console.log("");
ok("a correct reply is left alone", mendClosers('{"elements":[{"bbox":[0.1,0.2]}]}') === null);
ok(
  "a brace inside a label is text, not a bracket",
  mendClosers('{"elements":[{"label":"Insert {block}","bbox":[0.1,0.2]}]}') === null
);
ok("a stray closer with nothing open is not invented around", mendClosers('{"a":1}}') === null);
ok(
  "an element closed with a bracket is put right too",
  JSON.parse(mendClosers('{"elements":[{"label":"Save","bbox":[0.1,0.2]]]}')).elements[0].label === "Save"
);
ok(
  "and a reply with both faults is repaired by the chain",
  (() => {
    const c = mendCommas('{"elements":[{"bbox":[0.1 0.2,0.3,0.4}}]}');
    const b = c ? mendClosers(c) : null;
    try { return JSON.parse(b).elements[0].bbox.length === 4; } catch { return false; }
  })()
);

console.log(pass ? "\nall passed\n" : "\nFAILED\n");
process.exit(pass ? 0 : 1);

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
import { closeTruncated } from "../../services/ai/provider.js";

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

console.log(pass ? "\nall passed\n" : "\nFAILED\n");
process.exit(pass ? 0 : 1);

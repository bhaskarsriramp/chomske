/**
 * What the drawn pointer does with a stretch judged to be somebody else's.
 *
 *     node scripts/pointerTest/strangers.mjs
 *
 * ── THE CHANGE THIS GUARDS ───────────────────────────────────────────────────
 * On a recording of cursorful.com (2026-09-24) the creator's pointer was not in
 * the picture from 2.6s to 23.9s — a tab capture stops drawing an idle pointer
 * — and the locator, lost, followed the demo's cursor twice. Its presses were
 * refused; the DRAWN pointer rode the demo's hand. locate.js withoutStrangers
 * now asks the model about each stretch that appeared from nowhere, and our
 * pointer holds where the creator's was last seen through any it calls
 * somebody else's.
 *
 * The model is a stand-in here: this is about what is done with its answer,
 * which is pure arithmetic on a track and has to be exactly right.
 *
 * ── WHAT IS ASSERTED ─────────────────────────────────────────────────────────
 *   content    no drawn sample at the stranger's place; ours holds at the
 *              creator's last place until theirs is seen again — not switching
 *              halfway across the gap, which would show it at the next place
 *              the creator went seconds before they went there
 *   own        a stretch the model calls the creator's is drawn as found
 *   no answer  the track comes back untouched
 *   proven     a stretch that began where the creator's pointer was is never
 *              put to the model at all
 */
import { withoutStrangers } from "../../services/studio/locate.js";
import { cursorAt } from "../../../src/components/Studio/camera.mjs";

const W = 1920;
const H = 1080;
let pass = true;
const check = (cond, name) => {
  console.log((cond ? "  PASS  " : "  FAIL  ") + name);
  if (!cond) pass = false;
};

/** A run of located sightings at one place, 30 a second. */
function run(from, to, x, y, { proven, shape = "default" }) {
  const out = [];
  for (let t = from; t <= to + 1e-9; t += 1 / 30) {
    out.push({ t: Math.round(t * 1000) / 1000, x: x / W, y: y / H, shape, score: 0.86, located: true, proven });
  }
  return out;
}

// The creator parked at (270,392); the demo's hand at (823,480) while theirs
// is hidden; the creator's hand again on the nav bar at 23.9s.
const own = run(0, 2.6, 270, 392, { proven: true });
const theirs = run(3.2, 6.6, 823, 480, { proven: false, shape: "pointer" });
const back = run(23.9, 25, 926, 34, { proven: true, shape: "pointer" });
const track = [...own, ...theirs, ...back];

const asked = [];
const judge = (kind) => async ({ reference, runs }) => {
  asked.push({ reference, runs });
  return runs.map(() => ({ kind, confidence: 0.95, why: "stand-in" }));
};

console.log("\ncontent");
{
  const { track: out, dropped } = await withoutStrangers(track, { W, H, judge: judge("content") });
  const near = (p, x, y) => Math.hypot(p.x * W - x, p.y * H - y) < 2;
  check(!out.some((p) => near(p, 823, 480)), "nothing drawn at the demo's hand");
  check(dropped.length === 1 && dropped[0].start <= 3.2 && dropped[0].end >= 6.6, "the stretch is reported, for the tracker's samples to be dropped too");
  const at = (t) => cursorAt(out, t);
  const held = [3, 5, 10, 15, 20, 23.8].every((t) => near(at(t), 270, 392));
  check(held, "ours holds at the creator's last place from 3s right up to 23.8s");
  check(near(at(24.2), 926, 34), "and is on the nav bar once theirs is seen there");
  check(asked[0].runs.length === 1, "only the stretch that appeared from nowhere was asked about");
  check(Math.abs(asked[0].reference.x - 270) < 2 && Math.abs(asked[0].reference.y - 392) < 2, "the reference is a proven sighting of the creator's");
}

console.log("\nown");
{
  const { track: out } = await withoutStrangers(track, { W, H, judge: judge("own") });
  check(out === track, "the track comes back as found");
}

console.log("\nno answer");
{
  const { track: out } = await withoutStrangers(track, { W, H, judge: async () => null });
  check(out === track, "the track comes back as found");
  const { track: out2 } = await withoutStrangers(track, { W, H, judge: async () => { throw new Error("quota"); } });
  check(out2 === track, "and when the model fails outright");
  const { track: out3 } = await withoutStrangers(track, { W, H });
  check(out3 === track, "and with no model at all");
}

console.log("\nproven");
{
  asked.length = 0;
  const allProven = [...own, ...run(3.2, 6.6, 300, 400, { proven: true }), ...back];
  const { track: out } = await withoutStrangers(allProven, { W, H, judge: judge("content") });
  check(asked.length === 0 && out === allProven, "nothing is asked when every stretch is proven");
}

console.log(pass ? "\nall passed\n" : "\nFAILED\n");
process.exit(pass ? 0 : 1);

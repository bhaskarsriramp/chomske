/**
 * Do the three cameras agree?
 *
 *     node scripts/pointerTest/camera.mjs
 *
 * ── THE PROBLEM THIS EXISTS FOR ──────────────────────────────────────────────
 * The same camera move is computed in three places: the editor draws it sixty
 * times a second in the browser, the server reads it to place the cursor and
 * the captions, and ffmpeg renders it from expression strings. Two of those now
 * import one module (src/components/Studio/camera.mjs). The third cannot —
 * ffmpeg evaluates strings, not JavaScript — so the only thing keeping it in
 * step is this file.
 *
 * A preview that disagrees with the export is the one bug a creator cannot work
 * around: they move a zoom until it looks right, and it renders wrong, and
 * nothing they can do from the editor will fix it. It has to be caught here.
 *
 * ── WHAT IS ACTUALLY COMPARED ────────────────────────────────────────────────
 *   1. EASE_EXPR against EASE — the ffmpeg strings are mechanically translated
 *      to JavaScript and evaluated against the functions they claim to mirror.
 *      This is what catches a coefficient typed wrong in one of the two, which
 *      is the drift that has actually happened.
 *   2. cameraAtOutput(cameraKeys(tl)) against cameraAt(tl) — the renderer
 *      reduces a timeline to keyframes and interpolates between them, which is
 *      a second route to the same rect. They are sampled every frame of a built
 *      timeline and required to agree to within a pixel of 1920.
 *
 * Neither needs ffmpeg to run. The parse itself is covered by coverage.mjs,
 * which renders a real export; a parser error is loud, and arithmetic drift is
 * silent, so this checks the silent one.
 */
import fs from "fs";
const NL = String.fromCharCode(10);
import { EASE, RAMP_IN, RAMP_OUT, cameraAt, CAMERA_TUNING } from "../../services/studio/timeline.js";
import { cameraKeys, cameraAtOutput } from "../../services/studio/render/camera.js";

/* ────────────────────────────────────────────────────────────────────────────
   1. The ffmpeg strings, read as arithmetic
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * ffmpeg's expression language, as JavaScript.
 *
 * A mechanical translation of the subset the easing strings use. Deliberately
 * dumb: it exists to prove two pieces of arithmetic are the same, not to be a
 * second implementation of av_expr_parse. `if(a,b,c)` is ffmpeg's ternary and
 * `ld(0)` is the progress the caller stored.
 */
function asJs(expr) {
  // eslint-disable-next-line no-new-func
  return new Function("p", "return " + rewrite(expr.split("ld(0)").join("p")) + ";");
}

/**
 * One ffmpeg call rewritten as JavaScript, arguments first, until none are left.
 *
 * The arguments are split on commas at depth one rather than by a regular
 * expression, because every one of these curves nests a pow() inside an if()
 * and a pattern that stops at the first comma gets the branches wrong — which
 * is a test that passes while comparing the wrong things.
 */
function rewrite(src) {
  /**
   * The lookbehind is load-bearing. pow() becomes Math.pow(), which contains
   * pow( — so a pattern without it rewrites its own output forever, and the
   * test hangs rather than failing. Anything preceded by a dot or a word
   * character has already been translated.
   */
  const CALL = /(?<![.\w])(if|lt|gt|pow|clip)\(/;
  let s = src;
  for (;;) {
    const m = CALL.exec(s);
    if (!m) return s;

    const open = m.index + m[0].length - 1;
    const args = [];
    let depth = 0;
    let last = open + 1;
    let close = -1;
    for (let i = open; i < s.length; i++) {
      const c = s[i];
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) {
          args.push(s.slice(last, i));
          close = i;
          break;
        }
      } else if (c === "," && depth === 1) {
        args.push(s.slice(last, i));
        last = i + 1;
      }
    }
    if (close < 0) throw new Error("unbalanced parentheses in: " + src);

    const a = args.map(rewrite);
    const out =
      m[1] === "if" ? "((" + a[0] + ")?(" + a[1] + "):(" + a[2] + "))"
        : m[1] === "lt" ? "((" + a[0] + ")<(" + a[1] + "))"
          : m[1] === "gt" ? "((" + a[0] + ")>(" + a[1] + "))"
            : m[1] === "pow" ? "Math.pow(" + a[0] + "," + a[1] + ")"
              : "Math.min(Math.max((" + a[0] + "),(" + a[1] + ")),(" + a[2] + "))";

    s = s.slice(0, m.index) + out + s.slice(close + 1);
  }
}

/**
 * Read straight out of render/camera.js rather than imported: the constant is
 * not exported, and a test that imported it could not tell the difference
 * between the two files agreeing and itself reading one file twice.
 */
const EASE_EXPR = (() => {
  const url = new URL("../../services/studio/render/camera.js", import.meta.url);
  const src = fs.readFileSync(url, "utf8");
  const block = src.match(/const EASE_EXPR = \{([\s\S]*?)\n\};/);
  if (!block) throw new Error("EASE_EXPR not found in render/camera.js");
  const out = {};
  for (const line of block[1].split("\n")) {
    const m = line.match(/^\s*(\w+):\s*"(.*)",\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
})();

console.log("\nThe ffmpeg easing strings, against the functions they mirror.\n");

let pass = true;
const ok = (name, cond, detail = "") => {
  console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "  " + detail : ""));
  return cond;
};

for (const name of Object.keys(EASE)) {
  const expr = EASE_EXPR[name];
  if (!expr) {
    pass = ok("ffmpeg has a string for " + name, false, "— a zoom using it would render as a jump") && pass;
    continue;
  }
  const fn = asJs(expr);
  let worst = 0;
  let at = 0;
  for (let i = 0; i <= 200; i++) {
    const p = i / 200;
    const d = Math.abs(fn(p) - EASE[name](p));
    if (d > worst) {
      worst = d;
      at = p;
    }
  }
  pass = ok(
    name.padEnd(7) + " matches to 1e-9",
    worst < 1e-9,
    "worst " + worst.toExponential(1) + (worst >= 1e-9 ? " at p=" + at.toFixed(2) : "")
  ) && pass;
}

/* ── And that punch actually overshoots, by the amount claimed ─────────────── */
let peak = 0;
for (let i = 0; i <= 1000; i++) peak = Math.max(peak, EASE.punch(i / 1000));
console.log(
  "\n  punch overshoots by " + ((peak - 1) * 100).toFixed(1) + "% " +
    "(PUNCH_BACK " + CAMERA_TUNING.PUNCH_BACK + ")"
);
pass = ok(
  "the overshoot is between 2% and 12% — a camera, not a spring",
  peak - 1 > 0.02 && peak - 1 < 0.12
) && pass;

/* ────────────────────────────────────────────────────────────────────────────
   2. The renderer's keyframes, against the camera they came from
   ──────────────────────────────────────────────────────────────────────────── */

console.log("\nThe renderer's keyframes, against cameraAt().\n");

/**
 * Two moves close enough that the second interrupts the first, and one on its
 * own much later. The pair is the case the keyframe reduction is most likely to
 * get wrong, because the second move no longer starts from the full frame; the
 * lone one is the case that must come out exactly as it always did.
 */
const tl = {
  duration: 20,
  source: { width: 1920, height: 1080 },
  cuts: [],
  track: [],
  cursor: { enabled: false },
  zooms: [
    { id: "z1", start: 2.0, end: 3.4, x: 0.12, y: 0.10, w: 0.36, h: 0.36, level: 2.0,
      easing: "punch", ramp_in: RAMP_IN, ramp_out: RAMP_OUT, ease_out: "snappy" },
    { id: "z2", start: 3.5, end: 5.2, x: 0.55, y: 0.52, w: 0.34, h: 0.34, level: 2.2,
      easing: "punch", ramp_in: RAMP_IN, ramp_out: RAMP_OUT, ease_out: "snappy" },
    { id: "z3", start: 12.0, end: 14.0, x: 0.30, y: 0.30, w: 0.40, h: 0.40, level: 1.8,
      easing: "smooth", ramp_out: RAMP_OUT, ease_out: "snappy" },
  ],
};

const keys = cameraKeys(tl, { fps: 30 });
let worstPx = 0;
let worstAt = 0;
for (let f = 0; f <= 20 * 30; f++) {
  const t = f / 30;
  const a = cameraAt(tl, t);
  const b = cameraAtOutput(keys, t);
  const d = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.w - b.w)) * 1920;
  if (d > worstPx) {
    worstPx = d;
    worstAt = t;
  }
}

console.log("  " + keys.length + " keyframes over 20s");
/**
 * ── WHY TWO PIXELS AND NOT ZERO ──────────────────────────────────────────────
 * Two floors, neither of them disagreement:
 *
 *   rounding   keys are rounded to four decimal places on purpose — they become
 *              numbers inside an ffmpeg expression string, and full precision
 *              there buys nothing and costs parse length. A fifth of a pixel.
 *   sampling   where two moves overlap the renderer samples the camera thirty
 *              times a second and draws straight lines between the samples,
 *              because no single curve describes a blend. Straight lines across
 *              a curve are about a pixel of 1920 out at the midpoint.
 *
 * The margin to a real fault is not close. The three this test has actually
 * caught measured 807px (the renderer starting every move from the full frame),
 * 487px (a dense sample clobbering the curve name on the key before it) and
 * 1020px — hundreds of times this bar, not fractions above it.
 */
pass = ok(
  "every frame agrees to within two pixels of 1920",
  worstPx < 2,
  "worst " + worstPx.toFixed(2) + "px at " + worstAt.toFixed(2) + "s"
) && pass;

/* ── And that the blend is actually happening ──────────────────────────────── */
/**
 * The point of the whole change: at the moment the second move begins, the
 * camera should still be somewhere inside the first one's shot, not back at the
 * full frame. If this reads 100% the blend is not working and the camera is
 * pulling out and diving back in — the wobble reported as "two zooms mixed up
 * like 2.3 and 1.4x".
 */
const atBlend = cameraAt(tl, tl.zooms[1].start - RAMP_IN);
console.log(
  "\n  when the second move begins, the camera is holding " +
    (atBlend.w * 100).toFixed(0) + "% of the frame"
);
pass = ok("a move that interrupts another starts from where the camera is", atBlend.w < 0.95) && pass;

/** ...and one with nothing before it still starts from the full frame. */
const atClean = cameraAt(tl, tl.zooms[2].start - 0.56);
pass = ok("a move with nothing before it still starts at the full frame", atClean.w > 0.999) && pass;

/* ────────────────────────────────────────────────────────────────────────────
   3. The camera when the pointer cannot be seen
   ──────────────────────────────────────────────────────────────────────────── */

console.log("\nA following shot over a track with a hole in it.\n");

/**
 * ── WHY THIS IS NOT A CORNER CASE ────────────────────────────────────────────
 * The locator found the pointer in 306 frames of 756 on one real Windows
 * recording — forty per cent. A hole in the track is most of a demo, not an
 * edge case, and what the camera does inside one is most of what the viewer
 * sees. The track below is seen moving, then lost for a second and a half, then
 * seen again somewhere else entirely: a page navigating under a hand that did
 * not move, which is the commonest shape a hole has.
 */
const holed = {
  duration: 10,
  source: { width: 1920, height: 1080 },
  cuts: [],
  cursor: { enabled: true, mode: "recorded" },
  track: [
    { t: 1.0, x: 0.30, y: 0.50, shape: "default" },
    { t: 1.5, x: 0.33, y: 0.50, shape: "default" },
    { t: 2.0, x: 0.35, y: 0.50, shape: "default" },
    // ── the hole: the screen repainted and nothing was found ──
    { t: 3.5, x: 0.80, y: 0.20, shape: "default" },
    { t: 3.6, x: 0.805, y: 0.20, shape: "default" },
    { t: 3.7, x: 0.81, y: 0.20, shape: "default" },
    { t: 3.8, x: 0.815, y: 0.20, shape: "default" },
    { t: 3.9, x: 0.82, y: 0.20, shape: "default" },
    { t: 4.0, x: 0.825, y: 0.20, shape: "default" },
  ],
  zooms: [
    { id: "f1", start: 1.0, end: 5.0, x: 0.20, y: 0.40, w: 0.30, h: 0.30, level: 2.0,
      follow: true, follow_strength: 0.7, easing: "smooth", ramp_out: RAMP_OUT },
  ],
};

const seen = cameraAt(holed, 2.0, { track: holed.track });
const midHole = cameraAt(holed, 2.7, { track: holed.track });
const alsoHole = cameraAt(holed, 3.2, { track: holed.track });
const after = cameraAt(holed, 4.0, { track: holed.track });

const moved = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) * 1920;
console.log(
  "  last sighting → mid-hole: " + moved(seen, midHole).toFixed(1) + "px" +
    "   mid-hole → late hole: " + moved(midHole, alsoHole).toFixed(1) + "px" +
    "   → after: " + moved(alsoHole, after).toFixed(0) + "px"
);

pass = ok(
  "the camera does not move while the pointer is unseen",
  moved(seen, midHole) < 1 && moved(midHole, alsoHole) < 1
) && pass;
/**
 * And it does move again once there is evidence. A freeze that never thaws is
 * not a freeze, it is a camera that stopped working.
 */
pass = ok("...and follows again once it is seen", moved(alsoHole, after) > 10) && pass;

/**
 * ── AND IT COMES BACK AS A MOVE, NOT A CUT ───────────────────────────────────
 * The freeze has an ugly ending if nothing damps it: the first sighting after
 * the gap is most of a screen from where the camera has been pointing, and a
 * camera that answers it in full snaps there inside one frame. The gap is
 * invisible; the snap at the end of it is what the viewer notices. So the first
 * frames back must move LESS than the ones after them, not more.
 */
const step1 = moved(cameraAt(holed, 3.5, { track: holed.track }), cameraAt(holed, 3.55, { track: holed.track }));
const step2 = moved(cameraAt(holed, 3.9, { track: holed.track }), cameraAt(holed, 3.95, { track: holed.track }));
console.log(
  "  first 50ms back: " + step1.toFixed(1) + "px   500ms later: " + step2.toFixed(1) + "px"
);
pass = ok("the first frames back move less than the ones after", step1 < step2) && pass;

/* ── The trail: a camera aimed at a trajectory, not at one sample ──────────── */
/**
 * A hand crossing the screen quickly. Aimed at the newest sighting the camera
 * arrives in a series of lurches, one per sample; aimed at the trajectory it
 * travels. Measured as the spread of per-frame steps: a smooth move has steps
 * that resemble each other, and a lurching one does not.
 */
const fast = (() => {
  /**
   * A hand crossing the screen at a steady pace, sampled the way a real tracker
   * samples: unevenly in time, and a pixel or two off in position. The jitter is
   * the point. A camera aimed at the newest sighting answers every wobble and
   * REVERSES DIRECTION on some of them, which is the lurch; a camera aimed at
   * the trajectory does not, because the wobble is outvoted by its neighbours.
   */
  let seed = 9;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const track = [];
  let t = 1.0;
  for (let i = 0; i < 16; i++) {
    track.push({
      t: Math.round(t * 1000) / 1000,
      x: 0.2 + i * 0.04 + (rnd() - 0.5) * 0.02,
      y: 0.5 + (rnd() - 0.5) * 0.015,
      shape: "default",
    });
    // Uneven spacing, always inside GAP_HOLD so nothing here is a freeze.
    t += 0.04 + rnd() * 0.06;
  }
  return {
    duration: 6, source: { width: 1920, height: 1080 }, cuts: [], cursor: { enabled: true, mode: "recorded" },
    track,
    zooms: [{ id: "f", start: 1.0, end: 2.4, x: 0.15, y: 0.42, w: 0.3, h: 0.3, level: 2.2,
      follow: true, follow_strength: 0.8, easing: "smooth", ramp_out: RAMP_OUT }],
  };
})();

const lastT = fast.track[fast.track.length - 1].t;
let reversals = 0;
let prevX = cameraAt(fast, 1.02, { track: fast.track }).x;
let prevDir = 0;
let travel = 0;
for (let t = 1.04; t <= lastT; t += 0.02) {
  const x = cameraAt(fast, t, { track: fast.track }).x;
  const d = x - prevX;
  travel += Math.abs(d) * 1920;
  if (Math.abs(d) > 1e-5) {
    const dir = Math.sign(d);
    if (prevDir !== 0 && dir !== prevDir) reversals++;
    prevDir = dir;
  }
  prevX = x;
}
console.log(
  "  crossing the screen: " + travel.toFixed(0) + "px of camera travel, " +
    reversals + " reversal(s) of direction"
);
/**
 * The pointer only ever goes one way. Every reversal in the camera is the frame
 * answering noise, which is what the trail exists to absorb.
 */
pass = ok("the camera actually travels", travel > 200, travel.toFixed(0) + "px") && pass;
pass = ok(
  "and never reverses, though the sightings do",
  reversals === 0,
  reversals + " reversal(s)"
) && pass;

/* ────────────────────────────────────────────────────────────────────────────
   4. What survives the sanitizer
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * ── A VALIDATOR CAN ERASE A FEATURE WITHOUT FAILING ──────────────────────────
 * Every timeline goes through sanitizeTimeline() before it is stored, and
 * anything it does not recognise is replaced with a default. The easing list it
 * validates against was written by hand in two files, so adding `punch` to the
 * curves did not add it there — and every click zoom built with it was turned
 * back into a half-second glide one function after it was created. The camera
 * tests above all passed the whole time, because they never went through the
 * sanitizer.
 *
 * EASINGS is now derived from EASE, so that particular disagreement cannot
 * happen again. This is here for the next field: anything the camera reads off
 * a zoom has to survive the trip, and the only way to know is to make the trip.
 */
console.log("\nWhat survives sanitizeTimeline().\n");

const { sanitizeTimeline, EASINGS } = await import("../../services/studio/timeline.js");
const round = sanitizeTimeline(
  {
    duration: 10,
    zooms: [{
      id: "s1", start: 1, end: 2, x: 0.1, y: 0.1, w: 0.3, h: 0.3, level: 2,
      easing: "punch", ramp_in: RAMP_IN, ramp_out: RAMP_OUT, ease_out: "snappy",
      intent: "drag", follow: true,
    }],
  },
  { duration: 10 }
).zooms[0];

pass = ok("every curve the camera can draw is a curve a zoom may carry",
  Object.keys(EASE).every((n) => EASINGS.includes(n)),
  "EASINGS " + JSON.stringify(EASINGS)) && pass;
pass = ok("the punch easing survives", round.easing === "punch") && pass;
pass = ok("the shortened ramp-in survives", Math.abs(round.ramp_in - RAMP_IN) < 1e-9) && pass;
pass = ok("the interaction the shot was built for survives", round.intent === "drag") && pass;
pass = ok("and a drag still travels", round.follow === true) && pass;

/* ────────────────────────────────────────────────────────────────────────
   5. Where the shot is aimed
   ──────────────────────────────────────────────────────────────────────── */

/**
 * ── THE MIDDLE OF A BOX IS NOT WHERE THE PRESS LANDED ────────────────────────────
 * A shot exactly the size of what it must hold has one place to sit. A shot
 * WIDER than that has room to choose, and it used to spend that room on the
 * bounding box's midpoint regardless of where the person actually pressed, so
 * a toolbar pressed at its right-hand end was framed on its middle and looked
 * like the camera had missed.
 *
 * locate.js measures where the interface lit up (flashesFrom, which now returns
 * the position as well as the moment), and the framing leans toward it as far
 * as the slack allows and no further. What the box was sized to contain is
 * still contained, which is the assertion that matters: a prettier centre that
 * crops the control is a worse shot, not a better one.
 */
console.log(NL + "Where a wide control is framed when one end of it was pressed." + NL);

const { containingBox } = await import("../../services/studio/events.js");
const bar = { x: 0.2, y: 0.4, w: 0.5, h: 0.06 };
const holdsIt = (r) => r.x <= bar.x + 1e-6 && r.x + r.w >= bar.x + bar.w - 1e-6;
const mid = (r) => r.x + r.w / 2;

const noAnchor = containingBox([bar], 1.6);
const atRight = containingBox([{ ...bar, ax: 0.66, ay: 0.43 }], 1.6);
const atLeft = containingBox([{ ...bar, ax: 0.24, ay: 0.43 }], 1.6);

console.log("  no acknowledgement   centre " + mid(noAnchor).toFixed(3));
console.log("  lit up at 0.66       centre " + mid(atRight).toFixed(3));
console.log("  lit up at 0.24       centre " + mid(atLeft).toFixed(3));
console.log("");

pass = ok("the shot leans toward the end that was pressed", mid(atRight) > mid(noAnchor) + 0.02) && pass;
pass = ok("...and the other way for the other end", mid(atLeft) < mid(noAnchor) - 0.02) && pass;
pass = ok(
  "and the whole control stays in frame either way",
  holdsIt(noAnchor) && holdsIt(atRight) && holdsIt(atLeft)
) && pass;

console.log(pass ? "\nall passed\n" : "\nFAILED\n");
process.exit(pass ? 0 : 1);

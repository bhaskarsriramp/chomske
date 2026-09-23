/**
 * The two shots that have nowhere to go: against the edge, and before the answer.
 *
 *     node scripts/pointerTest/edges.mjs
 *
 * ── THE BUGS THIS REPRODUCES ─────────────────────────────────────────────────
 * Both were described by the creator, in the same breath, as the two things a
 * product demo does constantly and this camera handled badly.
 *
 *   "there is no top section to cover beyond that nav bar … due to that
 *    restriction it is zooming at some other place like below that or right
 *    corner … it is not usually focusing that particular button"
 *
 *   "those spinners will go off, the skeletons will go off and it will render
 *    the real-time data … what exactly happens here, how our system will
 *    react to it"
 *
 * ── ONE: A CONTROL AGAINST THE SIDE OF THE SCREEN ────────────────────────────
 * containingBox() clamps a shot to the closest frame that is on the picture, so
 * a press in the top nav is aimed at y = 0. zoomRect() then ran that aim
 * through soften(), which resists a limit ASYMPTOTICALLY — it returns the limit
 * only in the limit, and for a value sitting exactly on the edge it returns one
 * 0.368 × EDGE_SOFT inside it.
 *
 * That is right for a camera travelling toward the edge and wrong for a camera
 * standing still, and standing still is what every click zoom does. The outer
 * 2.2% of the recording was unreachable. A top-left logo came out with 14% of
 * itself cropped away, a top-right call-to-action with 18%.
 *
 * See camera.mjs resist(): the resistance belongs on the TRAVEL, not on the
 * position, so an excursion of zero moves the shot by zero.
 *
 * ── TWO: A PANEL THAT FETCHES BEFORE IT RENDERS ──────────────────────────────
 * settleAfter() holds the camera until the result of a press is on screen. It
 * looked for the first stretch of quiet — and a page waiting on an API is
 * quiet. Worse, a spinner cannot rescue it: self-animating cells are held in
 * the busy mask and excluded from `cover` deliberately, so a panel showing a
 * spinner over a grey skeleton is, to this measurement, perfectly still.
 *
 * So the camera treated the WAIT as the ANSWER and left before the data landed.
 *
 * The question is not when the screen first stopped, it is when it last moved.
 */
import { levelForBox, containingBox, confirmClicks, zoomsFromClicks } from "../../services/studio/events.js";
import { zoomRect, resist } from "../../services/studio/timeline.js";
import { settleAfter } from "../../services/studio/sync.js";
import { HEURISTIC_REFUSAL } from "../../services/studio/audit.js";

let pass = true;
const ok = (name, cond, detail = "") => {
  console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "  " + detail : ""));
  if (!cond) pass = false;
  return cond;
};
const f3 = (v) => Number(v).toFixed(3);

/* ════════════════════════════════════════════════════════════════════════════
   One: the control against the edge
   ════════════════════════════════════════════════════════════════════════════ */

/** A 1080p capture, which is what almost every demo is. */
const SRC = 1920;

/** Where a shot lands, and how much of its subject survives the crop. */
function frame(box) {
  const level = levelForBox(box, { sourceWidth: SRC });
  const planned = containingBox([box], level);
  const r = zoomRect({ ...planned, level, follow: false }, { zooms: [] }, 0.5, null);
  const ox = Math.max(0, Math.min(box.x + box.w, r.x + r.w) - Math.max(box.x, r.x));
  const oy = Math.max(0, Math.min(box.y + box.h, r.y + r.h) - Math.max(box.y, r.y));
  return {
    planned, rect: r,
    shown: (ox * oy) / (box.w * box.h),
    at: { x: (box.x + box.w / 2 - r.x) / r.w, y: (box.y + box.h / 2 - r.y) / r.h },
  };
}

const EDGE_CASES = [
  ["top-left nav logo", { x: 0.030, y: 0.018, w: 0.075, h: 0.030 }],
  ["top-centre nav item", { x: 0.440, y: 0.020, w: 0.070, h: 0.028 }],
  ["top-right CTA button", { x: 0.880, y: 0.016, w: 0.095, h: 0.034 }],
  ["bottom-right send", { x: 0.900, y: 0.945, w: 0.070, h: 0.035 }],
  ["left rail item", { x: 0.012, y: 0.400, w: 0.140, h: 0.030 }],
  ["mid-screen button", { x: 0.450, y: 0.470, w: 0.090, h: 0.034 }],
];

console.log("\n" + "=".repeat(84));
console.log("  A control pressed against the side of the screen");
console.log("=".repeat(84) + "\n");
console.log("    control                 shown    lands at          camera y   planned y");
for (const [name, box] of EDGE_CASES) {
  const f = frame(box);
  console.log(
    "    " + name.padEnd(22) +
      " " + (f.shown * 100).toFixed(1).padStart(6) + "%" +
      "   " + f3(f.at.x) + "," + f3(f.at.y) +
      "      " + f3(f.rect.y) + "      " + f3(f.planned.y)
  );
}
console.log("");

for (const [name, box] of EDGE_CASES) {
  const f = frame(box);
  ok("all of the " + name + " is in shot", f.shown > 0.999, (f.shown * 100).toFixed(1) + "%");
}

/**
 * The guarantee underneath: a shot that is not following anything is shown
 * exactly where it was aimed. Without this the assertions above are one
 * tuning constant away from passing by luck.
 */
console.log("");
for (const [name, box] of EDGE_CASES) {
  const f = frame(box);
  const drift = Math.hypot(f.rect.x - f.planned.x, f.rect.y - f.planned.y);
  ok("the camera does not drift off the " + name + "'s aim", drift < 1e-6, "moved " + f3(drift));
}

/**
 * And resist() itself, at the three points that matter: no travel is no move,
 * the response starts at full strength, and the limit is approached and never
 * crossed.
 */
console.log("");
ok("no travel moves the shot not at all", resist(0.25, 0.25, 0.25, 0.75) === 0.25);
ok(
  "a small excursion is answered very nearly in full",
  Math.abs(resist(0.5, 0.52, 0.25, 0.75) - 0.52) < 0.001,
  f3(resist(0.5, 0.52, 0.25, 0.75))
);
ok(
  "a huge excursion stops at the edge",
  resist(0.5, 9, 0.25, 0.75) <= 0.75 && resist(0.5, 9, 0.25, 0.75) > 0.74,
  f3(resist(0.5, 9, 0.25, 0.75))
);
ok("a shot already pinned to the edge cannot be pushed past it", resist(0.25, -5, 0.25, 0.75) === 0.25);

/* ════════════════════════════════════════════════════════════════════════════
   Two: the panel that fetches before it renders
   ════════════════════════════════════════════════════════════════════════════ */

const FPS = 12;
const CLICK = 1.0;

/** A motion series from [from, to, cover] spans. Cover is what readScreen reports. */
function series(spans, total = 6) {
  const motion = [];
  for (let i = 0; i * (1 / FPS) <= total; i++) {
    const t = i / FPS;
    let cover = 0;
    for (const [a, b, c] of spans) if (t >= a && t < b) cover = c;
    motion.push({ t: Number(t.toFixed(3)), cover });
  }
  return { motion, fps: FPS };
}

/**
 * `answer` is when the last thing the press caused has finished drawing. The
 * camera must still be on the subject then — it may leave after, never before.
 */
const LOAD_CASES = [
  {
    name: "a tab that just switches",
    spans: [[1.0, 1.25, 0.18]], answer: 1.25,
  },
  {
    name: "a spinner, then data at 2.1s",
    spans: [[1.0, 1.15, 0.20], [2.1, 2.45, 0.16]], answer: 2.45,
  },
  {
    name: "a static skeleton, then data at 2.6s",
    spans: [[1.0, 1.18, 0.22], [2.6, 2.95, 0.19]], answer: 2.95,
  },
  {
    name: "data at 1.4s, then its images at 2.4s",
    spans: [[1.0, 1.15, 0.20], [1.4, 1.7, 0.14], [2.4, 2.7, 0.09]], answer: 2.7,
  },
];

console.log("\n" + "=".repeat(84));
console.log("  A press whose answer arrives in stages");
console.log("=".repeat(84) + "\n");
console.log("    what the panel did                      answer up   hold    camera leaves");
for (const c of LOAD_CASES) {
  const hold = settleAfter(series(c.spans), CLICK);
  console.log(
    "    " + c.name.padEnd(38) +
      "  " + c.answer.toFixed(2) + "s" +
      "    " + hold.toFixed(2) + "s" +
      "    " + (CLICK + hold).toFixed(2) + "s"
  );
}
console.log("");

/**
 * ── AND THIS GUARANTEE WAS DELIBERATELY GIVEN UP ─────────────────────────────
 * These used to assert that the camera stays until the answer is fully drawn,
 * however long that takes up to the ceiling. The ceiling was 2.6s, and on a
 * real recording that stopped being an exception: an app whose content streams
 * in after a click never goes quiet inside the window, so five of seven shots
 * ran to it and 2.5 seconds became the normal length of a zoom.
 *
 * The creator named what a shot is for — "zoom in the area where a button or
 * clickable UI element needs to be zoomed in so on screen every user can see
 * what the user has clicked" — and that is showing WHAT WAS PRESSED, not
 * waiting out whatever it loaded. So the ceiling came down to 1.2s and the
 * promise changed with it.
 *
 * What survives, and is asserted here instead: the hold still GROWS with the
 * work, so a press whose result takes a moment is still held longer than one
 * that answers instantly. It is bounded now, where before it was not.
 */
const holds = LOAD_CASES.map((c) => ({ c, hold: settleAfter(series(c.spans), CLICK) }));
/**
 * Bounded, first and always. The earlier version of this block asserted an
 * ORDER between the four cases — which one is held longest — and that ordering
 * is an accident of where each one's change happens to fall relative to the
 * ceiling. It held at 1.2s and broke at 0.8s without anything being wrong,
 * which is a test measuring the fixture rather than the behaviour.
 */
ok(
  "every hold is inside its bounds",
  holds.every((h) => h.hold >= 0.45 - 1e-9 && h.hold <= 0.8 + 1e-9),
  holds.map((h) => h.hold.toFixed(2)).join(", ")
);
/**
 * And the honest limit of that: the hold answers work it can SEE, and with the
 * ceiling at 1.2s a result that lands after it is outside the window entirely.
 * The skeleton-then-data-at-2.6s case therefore gets the same beat as a tab
 * that just switches — the camera has left long before the answer appears.
 *
 * That is the trade this ceiling makes, written down rather than discovered
 * later: shots are short, and a genuinely slow panel is no longer waited for.
 */
ok(
  "work inside the window still lengthens the hold",
  Math.max(...holds.map((h) => h.hold)) > Math.min(...holds.map((h) => h.hold)) + 0.2,
  holds.map((h) => h.hold.toFixed(2)).join(", ")
);
ok(
  "and a result landing past the ceiling is simply not waited for",
  holds[2].hold === holds[0].hold,
  "data at 2.6s held " + holds[2].hold.toFixed(2) + "s, same as an instant control"
);
ok(
  "and none of them runs past the ceiling",
  holds.every((h) => h.hold <= 0.8 + 1e-9),
  "longest " + Math.max(...holds.map((h) => h.hold)).toFixed(2) + "s"
);

/**
 * The other half of the contract: waiting longer is only right when there was
 * something to wait for. A control that answers at once must not hold the
 * camera, or every shot in a demo becomes the maximum.
 */
console.log("");
/**
 * An instant control settles at once, so what it gets is its own change ending
 * plus the quiet run that proves it ended — half a second, near the floor
 * rather than exactly on it. Asserting the floor itself only worked while the
 * floor happened to be the larger of the two, and broke the moment it was
 * lowered. What matters is that it is nowhere near the ceiling: a demo where
 * every shot ran to `max` would be unwatchable.
 */
ok(
  "an instant control gets a short hold, nothing like the maximum",
  settleAfter(series([[1.0, 1.25, 0.18]]), CLICK) < 0.7,
  settleAfter(series([[1.0, 1.25, 0.18]]), CLICK).toFixed(2) + "s against a ceiling of 0.80s"
);
ok(
  "a press that changed nothing at all gets the minimum beat",
  Math.abs(settleAfter(series([]), CLICK) - 0.45) < 1e-6
);
ok(
  "a screen that never settles is still let go of",
  settleAfter(series([[1.0, 9.0, 0.2]]), CLICK) <= 0.8,
  settleAfter(series([[1.0, 9.0, 0.2]]), CLICK).toFixed(2) + "s"
);
ok("no measurement at all falls back to the beat", settleAfter(null, CLICK) === 0.45);

/* ════════════════════════════════════════════════════════════════════════════
   Three: and the press nobody made, at the moment the data arrived
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * The same recording, asked the other question. Holding the camera through the
 * load is half the job; the other half is not inventing a second press out of
 * the load itself. See events.js ownConsequence().
 */
const PRESS = 10.0;
const ARRIVE = 12.0;

/* The hand clicks, then moves off and comes to rest over a row in the panel it
   just opened — which is where a hand ends up while it waits. */
const track = [];
for (let t = 9.4; t <= 13.5; t += 0.05) {
  const going = t > PRESS + 0.1 && t < PRESS + 0.4;
  track.push({
    t: Number(t.toFixed(2)),
    x: t <= PRESS + 0.1 ? 0.22 : going ? 0.22 + (t - PRESS - 0.1) : 0.55,
    y: t <= PRESS + 0.1 ? 0.30 : going ? 0.30 + (t - PRESS - 0.1) * 0.4 : 0.42,
    shape: "pointer",
  });
}

const panelShots = [{
  t: ARRIVE, screen: "billing settings", busy: false,
  elements: [
    { type: "button", label: "Billing", bbox: [0.18, 0.27, 0.10, 0.05], importance: "high", state: "normal", sticky: false },
    { type: "row", label: "Invoice history", bbox: [0.48, 0.38, 0.30, 0.07], importance: "medium", state: "normal", sticky: false },
  ],
}];

/* Open at the press, silence while the request is in flight, then the data. */
const panelScreen = series([[PRESS, PRESS + 0.2, 0.22], [ARRIVE, ARRIVE + 0.3, 0.18]], 16);

const realPress = { id: "r1", type: "click", t: PRESS, x: 0.22, y: 0.30, confidence: 0.85, corroborated: true, scrolled: false };
const onArrival = { id: "p1", type: "click", t: ARRIVE, x: 0.55, y: 0.42, confidence: 0.8, corroborated: true, scrolled: false };

const blind = confirmClicks([realPress, onArrival], panelShots, { located: track });
const seen = confirmClicks([realPress, onArrival], panelShots, { located: track, screen: panelScreen });

console.log("\n" + "=".repeat(84));
console.log("  A press, a two-second fetch, and the screen change at the end of it");
console.log("=".repeat(84) + "\n");
for (const [label, set] of [["without the screen measured", blind], ["with the screen measured", seen]]) {
  console.log("    " + label);
  for (const e of set) {
    console.log(
      "      " + Number(e.t).toFixed(2) + "s  " + (e.zoomable ? "YES" : "no ") +
        "  score " + Number(e.score).toFixed(2) + "  " + String(e.basis).padEnd(15) + "  " + e.why
    );
  }
}
console.log("");

ok("the real press is confirmed", seen[0].zoomable === true, "basis " + seen[0].basis);
ok(
  "the data arriving does not become a second press",
  seen[1].zoomable === false && seen[1].basis === "still-arriving",
  "basis " + seen[1].basis + ", score " + Number(seen[1].score).toFixed(2)
);
ok(
  "...and it scored well over the bar, so nothing else was stopping it",
  Number(seen[1].score) > 0.5,
  Number(seen[1].score).toFixed(2) + " against a bar of 0.50"
);
ok(
  "without a screen measurement nothing changes",
  blind[0].zoomable === true && blind[1].zoomable === true,
  "which is every recording analysed before this existed"
);

/**
 * The cost of the rule, bounded: an acknowledgement is first-hand evidence and
 * outranks any inference about who owns the change. A creator who really does
 * click again while a page is loading keeps their zoom whenever the interface
 * said anything back.
 */
const acknowledged = confirmClicks(
  [realPress, onArrival], panelShots,
  { located: track, screen: panelScreen, flashes: [{ t: ARRIVE, x: 0.55, y: 0.42 }] }
);
ok(
  "but a second press the interface acknowledged is kept",
  acknowledged[1].zoomable === true,
  "basis " + acknowledged[1].basis
);

/**
 * ── AND THE COST WHEN THAT BOUND WAS TOO LOOSE ───────────────────────────────
 * The first version of the rule asked only about the acknowledgement, and on a
 * real recording it refused three presses the creator had made:
 *
 *   6.30   score 1.25   a hand on "Projects"
 *  10.29   score 0.55   on "Browser-based video editing"
 *  14.01   score 0.75   a hand on "Settings"
 *
 * A hand settled on a control the model named is two independent readings
 * agreeing. That is not the previous press still landing, whatever else the
 * screen is doing, and throwing it away costs a camera move the creator asked
 * for by clicking.
 */
const onNamed = {
  id: "p2", type: "click", t: ARRIVE, x: 0.55, y: 0.42,
  confidence: 0.8, corroborated: true, scrolled: false,
};
const namedShots = [{
  t: ARRIVE, screen: "billing settings", busy: false,
  elements: [
    { type: "button", label: "Billing", bbox: [0.18, 0.27, 0.10, 0.05], importance: "high", state: "normal", sticky: false },
    { type: "button", label: "Projects", bbox: [0.50, 0.39, 0.12, 0.06], importance: "high", state: "normal", sticky: false },
  ],
}];
const keptNamed = confirmClicks([realPress, onNamed], namedShots, { located: track, screen: panelScreen });
console.log("");
console.log("    a hand on a named control, inside the same window:");
console.log("      " + Number(keptNamed[1].t).toFixed(2) + "s  " + (keptNamed[1].zoomable ? "YES" : "no ") +
  "  score " + Number(keptNamed[1].score).toFixed(2) + "  " + keptNamed[1].basis + "  on " + (keptNamed[1].control || "(nothing)"));
console.log("");
ok(
  "a press with a control named under it survives the window",
  keptNamed[1].zoomable === true,
  "basis " + keptNamed[1].basis + ", on " + (keptNamed[1].control || "(nothing)")
);
ok(
  "...because that is two readings agreeing, not one press still landing",
  keptNamed[1].on_control === true && Number(keptNamed[1].score) > 0.5,
  "score " + Number(keptNamed[1].score).toFixed(2)
);

/* ════════════════════════════════════════════════════════════════════════════
   Four: "nothing came of it", measured on a screen that was mostly moving
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * `cover` counts only the cells that were NOT already animating, so a press
 * whose consequence lands inside a playing video is invisible to it. That is
 * right — a video must not corroborate every press on the page — but it means
 * the veto is taken on very little evidence when most of the screen IS video,
 * and this veto is the one refusal the arbiter is never asked about.
 *
 * Measured on a real recording: 456 of 840 cells were moving pictures and
 * seven presses of thirteen died here unseen, two of them on the navigation
 * bar. See events.js SCREEN_DROWNED.
 */
const screenOf = (busyCells) => {
  const busy = [];
  for (let c = 0; c < busyCells; c++) busy.push({ c, start: 0, end: 30 });
  return { grid: { w: 10, h: 10 }, busy, motion: [], fps: 12 };
};
const nothingCame = { id: "n1", type: "click", t: 5, x: 0.5, y: 0.5, confidence: 0.8, corroborated: false };
const quiet = confirmClicks([nothingCame], [], { screen: screenOf(8) })[0];
const drowned = confirmClicks([nothingCame], [], { screen: screenOf(48) })[0];

console.log("");
console.log("=".repeat(84));
console.log("  A press nothing came of: on a quiet screen, and on one full of video");
console.log("=".repeat(84));
console.log("");
console.log("     8 of 100 cells moving   " + quiet.basis.padEnd(20) + quiet.why);
console.log("    48 of 100 cells moving   " + drowned.basis.padEnd(20) + drowned.why);
console.log("");

ok("on a quiet screen it stays a plain fact", quiet.basis === "no-consequence", quiet.basis);
ok(
  "on a screen mostly moving it is named as the guess it is",
  drowned.basis === "no-consequence-busy",
  drowned.basis
);
ok(
  "...and that name is one the arbiter may overturn, while the plain one is final",
  HEURISTIC_REFUSAL.has("no-consequence-busy") && !HEURISTIC_REFUSAL.has("no-consequence")
);
ok("the camera still moves for neither", quiet.zoomable === false && drowned.zoomable === false);

/* ════════════════════════════════════════════════════════════════════════════
   Five: the press written down where the pointer used to be
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * Taken from the event as it is stored, on a real recording:
 *
 *   t 23.736   x 0.7813  y 0.9176   on_control false   basis "scrolling"
 *   target [0.407, 0.020, 0.05, 0.05]        ← "Pricing", from the audit
 *   track ends 22.93 at (0.781, 0.918)       ← the last sighting, 0.81s before
 *
 * The creator pressed Pricing in the navigation bar. The locator lost the
 * pointer during the move up, the press was written down in the bottom-right
 * corner where it had last been seen, and the lookup correctly reported that
 * nothing pressable was there. `on_control: false` — a confident statement
 * about a place nobody had clicked.
 */
const NAV = [
  { type: "nav_item", label: "Pricing", bbox: [0.407, 0.020, 0.05, 0.05], importance: "high", state: "normal", sticky: true },
  { type: "nav_item", label: "Editor", bbox: [0.530, 0.020, 0.05, 0.05], importance: "high", state: "normal", sticky: true },
];
const navShots = [{ t: 23.7, screen: "landing page", busy: false, elements: NAV }];
/* The pointer, last seen down in the corner and then lost. */
const lostTrack = [];
for (let t = 22.5; t <= 22.93; t += 0.05) lostTrack.push({ t: Number(t.toFixed(2)), x: 0.781, y: 0.918, shape: "default" });

const pricing = (age) => ({
  id: "pr", type: "click", t: 23.736, x: 0.7813, y: 0.9176,
  confidence: 0.75, corroborated: true, scrolled: true, position_age: age,
});

const asFact = confirmClicks([pricing(0.02)], navShots, { located: lostTrack })[0];
const asGuess = confirmClicks([pricing(0.81)], navShots, { located: lostTrack })[0];

console.log("");
console.log("=".repeat(84));
console.log("  A press written down 0.81s of pointer travel away from the button");
console.log("=".repeat(84));
console.log("");
console.log("    sighting fresh (0.02s)   on_control " + String(asFact.on_control).padEnd(6) +
  "  basis " + String(asFact.basis).padEnd(18) + asFact.why);
console.log("    sighting stale (0.81s)   on_control " + String(asGuess.on_control).padEnd(6) +
  "  basis " + String(asGuess.basis).padEnd(18) + asGuess.why);
console.log("");

ok(
  "a fresh sighting still says plainly that nothing was under it",
  asFact.on_control === false,
  "on_control " + asFact.on_control
);
ok(
  "a stale one does not claim to have looked where they clicked",
  asGuess.on_control === null,
  "on_control " + asGuess.on_control
);
ok(
  "and it says so, instead of blaming the scroll detector",
  asGuess.basis === "position-unknown",
  asGuess.basis + " — " + asGuess.why
);
ok(
  "which is a refusal the arbiter is asked about with frames",
  HEURISTIC_REFUSAL.has("position-unknown")
);
ok(
  "no control is invented for it either way",
  !asGuess.control && !asFact.control,
  "control " + JSON.stringify(asGuess.control)
);

/* ════════════════════════════════════════════════════════════════════════════
   Six: the shot that stayed in while the page scrolled past behind it
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * Taken from a real export, as the timeline stored it:
 *
 *   zoom   7.27 – 13.65   6.38s held   1.8x
 *   press        7.57   8.81   11.39
 *   scroll              9.38   9.83        ← both inside the zoom
 *
 * Three presses close enough together to merge into one shot, and the creator
 * scrolled in the middle of it. For four of those six seconds the camera was
 * holding a third of the screen around a control nobody was looking at any
 * more, while the page they WERE looking at slid past behind the crop.
 *
 *   "when user clicks and scrolls the rendered page then in that zoom in only
 *    the content is showing closer … user can see the whole page as it is"
 *
 * Merging is a rule about time and time is the wrong question here: two presses
 * either side of a scroll are not one subject however close together they are.
 */
const pressAt = (t, label, x, y) => ({
  id: "c" + t, type: "click", t, x, y, confidence: 0.9, corroborated: true,
  zoomable: true, control: label, on_control: true,
  target: [x - 0.05, y - 0.02, 0.1, 0.04],
});
const withScroll = [
  pressAt(7.57, "Blocking channels", 0.30, 0.35),
  pressAt(8.81, "Browser-based editing", 0.32, 0.46),
  { id: "s1", type: "scroll", t: 9.38 },
  { id: "s2", type: "scroll", t: 9.83 },
  pressAt(11.39, "Log out", 0.34, 0.62),
];
/**
 * The control: the first two presses, 1.2s apart, with nothing moving between
 * them. They must still be ONE shot — merging exists because pulling out and
 * back in between two presses a second apart is what makes auto-zoom seasick,
 * and none of this may quietly turn that off.
 *
 * Two and not three, because all three span 4.67s once merged and MERGE_LONGEST
 * refuses a shot that long on its own account. Testing the scroll rule against
 * a case the length rule also rejects would prove nothing about either.
 */
const noScroll = withScroll.filter((e) => e.type !== "scroll" && e.t < 10);

/**
 * All three inside one step, which is what the real recording had and what
 * makes this a merge at all: MERGE alone is 1.6s and would not reach the third
 * press, while MERGE_IN_STEP is 3.2s and does. Without this the test proves
 * nothing — the presses come apart on the clock and the scroll rule is never
 * asked the question.
 */
const oneStep = [{ id: "st1", start: 7.0, end: 12.5, title: "Look through the settings" }];
const opts = { duration: 22.4, sourceWidth: 1920, steps: oneStep };

const split = zoomsFromClicks(withScroll, opts);
const merged = zoomsFromClicks(noScroll, opts);

console.log("");
console.log("=".repeat(84));
console.log("  Three presses 1.2s and 2.6s apart, with and without a scroll between");
console.log("=".repeat(84));
console.log("");
for (const [name, set] of [["scrolled at 9.38", split], ["nothing moved", merged]]) {
  console.log("    " + name);
  for (const z of set) {
    console.log("      " + z.start.toFixed(2).padStart(6) + " – " + z.end.toFixed(2).padStart(6) +
      "   " + (z.end - z.start).toFixed(2) + "s held   " + String(z.label || "").slice(0, 26));
  }
}
console.log("");

ok("a scroll between two presses ends the shot", split.length === 2, split.length + " zooms");
ok(
  "and the camera is out before the page moves",
  split[0].end <= 9.38 + 1e-9,
  "leaves at " + split[0].end.toFixed(2) + "s, scroll at 9.38s"
);
ok(
  "the press after the scroll still gets its own",
  split[1] && split[1].start < 11.39 && split[1].end > 11.39,
  split[1] ? split[1].start.toFixed(2) + "–" + split[1].end.toFixed(2) : "none"
);
/**
 * The other half of the contract. Merging exists because pulling out and back
 * in between two presses a second apart is what makes auto-zoom seasick, and
 * this must not have quietly turned that off for everybody.
 */
ok(
  "with nothing moving, two presses 1.2s apart are still one shot",
  merged.length === 1,
  merged.length + " zoom covering both"
);
ok(
  "so the rule is about the scroll, not about the gap",
  merged.length === 1 && split.length === 2
);

/**
 * ── AND A CHAIN OF PRESSES DOES NOT BECOME ONE LONG CROP ────────────────────
 * MERGE_MAX stops a merged rect growing until it is the whole screen with the
 * edges trimmed. Nothing stopped it growing in TIME: every press inside the
 * window pushes the end out again. Measured on a real export, four presses
 * between 12.9s and 17.5s became a single 7.46-second shot at 1.4x — at which
 * length the viewer has stopped seeing emphasis and is watching a cropped
 * recording.
 */
const chain = [
  pressAt(12.90, "Plugins", 0.20, 0.64),
  pressAt(14.33, "More", 0.21, 0.30),
  pressAt(16.26, "Usage", 0.22, 0.35),
  pressAt(17.45, "Usage again", 0.25, 0.33),
];
const chained = zoomsFromClicks(chain, {
  duration: 22.6, sourceWidth: 1920,
  steps: [{ id: "st2", start: 12.0, end: 18.0, title: "Look through plugins" }],
});
const longest = chained.reduce((a, z) => Math.max(a, z.end - z.start), 0);
console.log("");
console.log("    four presses over 4.6s, all in one step:");
for (const z of chained) {
  console.log("      " + z.start.toFixed(2).padStart(6) + " – " + z.end.toFixed(2).padStart(6) +
    "   " + (z.end - z.start).toFixed(2) + "s   " + String(z.label || "").slice(0, 20));
}
console.log("");
ok(
  "a chain of presses does not become one long crop",
  longest <= 4.0 + 1e-6,
  "longest shot " + longest.toFixed(2) + "s against a limit of 4.00s"
);
ok(
  "and every press in the chain is still served",
  chained.length >= 2 && chain.every((c) => chained.some((z) => c.t >= z.start && c.t <= z.end)),
  chained.length + " shots covering all four presses"
);

console.log(pass ? "\nall passed\n" : "\nFAILED\n");
process.exit(pass ? 0 : 1);

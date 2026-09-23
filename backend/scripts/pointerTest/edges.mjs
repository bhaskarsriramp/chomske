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
import { levelForBox, containingBox, confirmClicks } from "../../services/studio/events.js";
import { zoomRect, resist } from "../../services/studio/timeline.js";
import { settleAfter } from "../../services/studio/sync.js";

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

for (const c of LOAD_CASES) {
  const hold = settleAfter(series(c.spans), CLICK);
  ok(
    "the camera is still on it when " + c.name.replace(/^an? /, "") + " finishes",
    CLICK + hold >= c.answer - 1e-6,
    "leaves " + (CLICK + hold).toFixed(2) + "s, answer up " + c.answer.toFixed(2) + "s"
  );
}

/**
 * The other half of the contract: waiting longer is only right when there was
 * something to wait for. A control that answers at once must not hold the
 * camera, or every shot in a demo becomes the maximum.
 */
console.log("");
ok(
  "an instant control still gets only the minimum beat",
  Math.abs(settleAfter(series([[1.0, 1.25, 0.18]]), CLICK) - 0.55) < 1e-6,
  settleAfter(series([[1.0, 1.25, 0.18]]), CLICK).toFixed(2) + "s"
);
ok(
  "a press that changed nothing at all gets the minimum beat",
  Math.abs(settleAfter(series([]), CLICK) - 0.55) < 1e-6
);
ok(
  "a screen that never settles is still let go of",
  settleAfter(series([[1.0, 9.0, 0.2]]), CLICK) <= 2.6,
  settleAfter(series([[1.0, 9.0, 0.2]]), CLICK).toFixed(2) + "s"
);
ok("no measurement at all falls back to the beat", settleAfter(null, CLICK) === 0.55);

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

console.log(pass ? "\nall passed\n" : "\nFAILED\n");
process.exit(pass ? 0 : 1);

/**
 * Which presses get to move the camera.
 *
 *     node scripts/pointerTest/clicks.mjs
 *
 * The creator's rule, in their words:
 *
 *   "Zoom in should only happen when user clicks on a Clickable UI element
 *    like buttons etc. It should not zoom-in in any other condition. Some
 *    times users have a tendency to click the mouse at some empty or other
 *    places where there is no UI clickable element, so at those places we
 *    should not Zoom-in."
 *
 * What decides it is the shape the operating system drew: a hand goes over
 * something that answers a click, a plain arrow goes over everything else.
 * These cases are the ones that went wrong on real recordings, written as
 * pointer paths rather than video so they run in a fraction of a second.
 *
 * Needs no fixtures, no network and no Gemini.
 */
import { confirmClicks, inferEvents } from "../../services/studio/events.js";
import { snapToLocated } from "../../services/studio/locate.js";

const FPS = 30;

/** A stretch of located frames: the pointer sitting at one spot, one shape. */
function rest(from, to, x, y, shape) {
  const out = [];
  for (let t = from; t <= to + 1e-9; t += 1 / FPS) {
    out.push({ t: Math.round(t * 1000) / 1000, x, y, shape, located: true });
  }
  return out;
}

/** And a stretch of it travelling, which is where a shape means nothing. */
function sweep(from, to, a, b, shape) {
  const out = [];
  const n = Math.max(1, Math.round((to - from) * FPS));
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    out.push({
      t: Math.round((from + (to - from) * k) * 1000) / 1000,
      x: a.x + (b.x - a.x) * k,
      y: a.y + (b.y - a.y) * k,
      shape,
      located: true,
    });
  }
  return out;
}

const press = (t, x, y, extra = {}) => ({
  id: "e" + t, type: "click", t, x, y, dy: 0, text: "", confidence: 0.8,
  source: "pixel", corroborated: true, scrolled: false, ...extra,
});

let failures = 0;
function check(name, got, want) {
  const ok = got === want;
  if (!ok) failures++;
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + name + (ok ? "" : "   got " + got + ", wanted " + want));
}

console.log("\nA press only moves the camera when something clickable was under it\n");

/* 1. The press this whole thing exists for: a menu item, hand held on it. */
{
  const located = [...sweep(7.0, 7.4, { x: 0.4, y: 0.1 }, { x: 0.031, y: 0.182 }, "default"), ...rest(7.4, 9.2, 0.031, 0.182, "pointer")];
  const [e] = confirmClicks([press(8.32, 0.031, 0.182)], [], { located });
  check("a hand held on a menu item, pressed", e.zoomable, true);
}

/* 2. The one that put a zoom on nothing: empty space while a page loaded. */
{
  const located = rest(18.2, 19.6, 0.176, 0.631, "default");
  const [e] = confirmClicks([press(18.81, 0.176, 0.631)], [], { located });
  check("a plain arrow in empty space", e.zoomable, false);
}

/* 3. The pointer crossing a link on its way elsewhere: one frame of hand. */
{
  const located = [
    ...sweep(24.9, 25.2, { x: 0.2, y: 0.5 }, { x: 0.40, y: 0.17 }, "default"),
    { t: 25.23, x: 0.405, y: 0.166, shape: "pointer", located: true },
    ...sweep(25.26, 25.9, { x: 0.41, y: 0.16 }, { x: 0.6, y: 0.05 }, "default"),
  ];
  const [e] = confirmClicks([press(25.33, 0.406, 0.165)], [], { located });
  check("a link brushed past at speed", e.zoomable, false);
}

/* 4. A text field: the caret is the OS saying this takes input. */
{
  const located = rest(4.0, 5.2, 0.5, 0.3, "text");
  const [e] = confirmClicks([press(4.6, 0.5, 0.3)], [], { located });
  check("a text caret over a field", e.zoomable, true);
}

/* 5. A native button drawn with an arrow, which the model saw and named. */
{
  const located = rest(4.0, 5.2, 0.5, 0.3, "default");
  const shots = [{ t: 4.6, elements: [{ type: "button", label: "Create API key", bbox: [0.46, 0.28, 0.1, 0.04] }] }];
  const [e] = confirmClicks([press(4.6, 0.5, 0.3)], shots, { located });
  check("an arrow on a button the model named", e.zoomable, true);
}

/* 6. Nothing located and nothing read: the oldest behaviour, unchanged. */
{
  const [e] = confirmClicks([press(4.6, 0.5, 0.3)], [], { located: [] });
  check("no reading of any kind", e.zoomable, true);
}

/* 7. A press with nothing following it is still nothing, hand or not. */
{
  const located = rest(7.4, 9.2, 0.031, 0.182, "pointer");
  const [e] = confirmClicks([press(8.32, 0.031, 0.182, { corroborated: false })], [], { located });
  check("a hover over a menu item, nothing came of it", e.zoomable, false);
}

/**
 * 8. A press made while the pointer was travelling.
 *
 * The last zoom of one recording landed here: the pointer crossed the screen,
 * a press was minted somewhere along the way, nothing clickable was under it
 * at any point, and it fell through to "nobody looked, so allow it" — the one
 * case where the evidence is actually against a press.
 */
{
  const located = sweep(26.8, 27.5, { x: 0.55, y: 0.35 }, { x: 0.56, y: 0.10 }, "default");
  const [e] = confirmClicks([press(27.27, 0.555, 0.176)], [], { located });
  check("a press while the pointer was travelling", e.zoomable, false);
}

/* 9. And a scroll over a control is still a scroll. */
{
  const located = rest(7.4, 9.2, 0.031, 0.182, "pointer");
  const [e] = confirmClicks([press(8.32, 0.031, 0.182, { scrolled: true })], [], { located });
  check("the page scrolled under a resting hand", e.zoomable, false);
}

console.log("\nA page finishing loading is not a press\n");

/**
 * A whole-screen change is read as a click when the pointer was resting: that
 * is how a menu item that replaces the page gets its zoom. A page arriving in
 * stages looks identical — except for what the pointer is sitting on.
 */
{
  const whole = (t) => ({ t, energy: 0.3, x: 0, y: 0, w: 1, h: 1, dy: 0 });
  const quiet = (t) => ({ t, energy: 0.0005, x: 0.5, y: 0.5, w: 0.01, h: 0.01, dy: 0 });
  const motion = [];
  for (let t = 0; t < 6; t += 1 / FPS) motion.push(Math.abs(t - 3.0) < 0.05 ? whole(round(t)) : quiet(round(t)));
  function round(t) { return Math.round(t * 1000) / 1000; }

  const onArrow = rest(0, 6, 0.176, 0.631, "default");
  const evA = inferEvents({ samples: onArrow, motion, duration: 6, located: onArrow })
    .filter((e) => e.type === "click");
  check("the screen changes over empty space", evA.length, 0);

  const onHand = rest(0, 6, 0.031, 0.182, "pointer");
  const evH = inferEvents({ samples: onHand, motion, duration: 6, located: onHand })
    .filter((e) => e.type === "click");
  check("the screen changes over a menu item", evH.length > 0, true);
}

console.log("\nA hover is not a press, whatever else happens on screen\n");

/**
 * ── THE ONE THAT PUSHED IN ON A HOVER ───────────────────────────────────────
 * The creator rested the pointer on a sidebar row and never pressed it. The
 * page never changed. Two thirds of a second later a chart elsewhere on the
 * screen finished drawing itself, and because the hover's own highlight was
 * too small to measure, that chart cleared the "bigger than the press itself"
 * bar and became its consequence.
 *
 * A browser answers a real click at once — every real press in that recording
 * was answered in 0.12 seconds.
 */
{
  const FR = 1 / 24;
  const quiet = (t) => ({ t: Math.round(t * 1000) / 1000, energy: 0.0002, x: 0.1, y: 0.6, w: 0.02, h: 0.02, dy: 0 });
  const build = (spike) => {
    const out = [];
    for (let t = 10; t < 13; t += FR) {
      const m = quiet(t);
      if (spike && Math.abs(t - spike.t) < FR) { m.energy = spike.energy; m.x = 0.35; m.y = 0.4; m.w = 0.64; m.h = 0.75; }
      out.push(m);
    }
    return out;
  };
  const onRow = rest(10.2, 12.0, 0.110, 0.625, "pointer");

  // A chart finishing two thirds of a second later, the size that fooled it.
  const late = inferEvents({ samples: onRow, motion: build({ t: 11.65, energy: 0.019 }), duration: 13, located: onRow })
    .filter((e) => e.type === "click");
  check("a chart finishing 0.7s later", late.some((e) => e.corroborated), false);

  // A page replacing itself may still take its time: size earns the delay.
  const big = inferEvents({ samples: onRow, motion: build({ t: 11.65, energy: 0.4 }), duration: 13, located: onRow })
    .filter((e) => e.type === "click");
  check("a whole page arriving 0.7s later", big.some((e) => e.corroborated), true);
}

console.log("\nA press is found wherever it landed, and recorded when it landed\n");

/**
 * ── THE TWO THE CREATOR FOUND IN video_demo_112 ─────────────────────────────
 * Both were presses on plainly clickable things — a chat in a sidebar, "Usage"
 * in a settings dialog's rail — and neither moved the camera. The numbers
 * below are measured off that recording frame by frame, not invented.
 *
 *   "Blocking channels from YouT...chat has been clicked, but Zoom-in not
 *    worked here."
 *   "i have clicked the 'Usage' menu item from the Settings side bar, Zoom-in
 *    not happened and not worked."
 *
 * Two separate causes, one symptom:
 *
 *   1. the dialog's pane swap spans 0.525 of the frame's width, and a
 *      navigation had to span 0.6 of BOTH dimensions, so no press existed;
 *   2. the press that the ordinary path did find was written down at the end
 *      of the dwell — when the hand finally moved on, seconds later — so its
 *      zoom arrived late and was merged into the next click's.
 */

/** Motion samples: quiet at the pointer, with one change dropped in. */
function withChange(from, to, px, py, change) {
  const FR = 1 / 24;
  const out = [];
  for (let t = from; t < to; t += FR) {
    const m = { t: Math.round(t * 1000) / 1000, energy: 0.0002, x: px, y: py, w: 0.02, h: 0.02, dy: 0 };
    if (Math.abs(t - change.t) < FR) {
      m.energy = change.energy; m.x = change.x; m.y = change.y; m.w = change.w; m.h = change.h;
    }
    out.push(m);
  }
  return out;
}

/* 10. The settings dialog: a pane swaps beside the rail that swapped it. */
{
  const path = rest(20.0, 24.5, 0.232, 0.338, "pointer");
  const motion = withChange(20.0, 24.5, 0.232, 0.338,
    { t: 21.583, energy: 0.0555, x: 0.3045, y: 0.1135, w: 0.525, h: 0.839 });
  const found = inferEvents({ samples: path, motion, duration: 25, located: path })
    .filter((e) => e.type === "click");
  check("'Usage' in a settings dialog, pane swap over half the frame", found.length > 0, true);
  // And it belongs to the moment the pane changed, not to the moment the hand
  // left four seconds later, which is what sent its zoom into the next click's.
  check("...recorded when it landed, not when the hand moved on",
    found.length > 0 && Math.abs(found[0].t - 21.583) < 0.3, true);
}

/* 11. A chat row that replaces the whole screen, hand held on it. */
{
  const path = rest(8.5, 11.5, 0.068, 0.587, "pointer");
  const motion = withChange(8.5, 11.5, 0.068, 0.587,
    { t: 9.75, energy: 0.0969, x: 0.0075, y: 0.042, w: 0.991, h: 0.928 });
  const found = inferEvents({ samples: path, motion, duration: 12, located: path })
    .filter((e) => e.type === "click");
  check("a chat row in a sidebar, whole screen replaced", found.length > 0, true);
  check("...and it moves the camera",
    found.length > 0 && confirmClicks(found, [], { located: path })[0].zoomable, true);
}

/**
 * 12. A menu opening: large, and almost none of its pixels are different.
 *
 * The account menu in that same recording covers a third of the width and six
 * tenths of the height, and changes 5.15% of the pixels — it cleared the "did
 * anything come of it" bar by fifteen ten-thousandths. Interfaces are mostly
 * white; the honest measure is how big the thing that appeared was.
 */
{
  const path = rest(10.0, 16.0, 0.11, 0.62, "pointer");
  const motion = withChange(10.0, 16.0, 0.11, 0.62,
    { t: 11.0, energy: 0.012, x: 0.12, y: 0.55, w: 0.22, h: 0.30 });
  const found = inferEvents({ samples: path, motion, duration: 17, located: path })
    .filter((e) => e.type === "click");
  check("a menu opens, pale against a pale page", found.some((e) => e.corroborated), true);
  check("...and is not blamed on the hand five seconds later",
    found.length > 0 && Math.abs(found[0].t - 11.0) < 0.3, true);
}

/**
 * 13. And the thing that loosening the shape test must NOT let back in.
 *
 * A pane-sized change is allowed to be a navigation now, so the price is that
 * it has to be beside the pointer: a rail and the pane it drives are
 * neighbours. A chart finishing on the far side of the screen from a parked
 * hand is the hover the camera used to push in on, and stays refused.
 */
{
  const path = rest(10.2, 12.0, 0.110, 0.625, "pointer");
  const motion = withChange(10.2, 12.0, 0.110, 0.625,
    { t: 11.65, energy: 0.06, x: 0.45, y: 0.15, w: 0.5, h: 0.8 });
  const found = inferEvents({ samples: path, motion, duration: 13, located: path })
    .filter((e) => e.type === "click");
  check("a pane-sized change across the screen from the hand", found.length, 0);
}

console.log("\nA scroll the tracker could not measure is still a scroll\n");

/**
 * ── THE ONE FROM video_demo_113 ─────────────────────────────────────────────
 *   "when i go to the Dashboard sub-menu item ... and scrolled to bottom, at
 *    that instance the Zoom in has happened without any click and right side
 *    you can see our mouse pointer is moving with the vertical scoller line."
 *
 * Every scroll veto in events.js reads `dy`, and `dy` is measured by sliding
 * one frame's row profile over the last one across a fixed range of offsets.
 * Drag a scrollbar and the content moves further than that range in a single
 * frame, so the correlation finds nothing and returns ~0 — "the page did not
 * move". The vetoes all passed, the whole-screen change read as a navigation,
 * and the pointer parked on the scrollbar supplied the rest.
 *
 * Measured off that recording: fourteen consecutive frames, about a fifth of
 * the picture changing each time, dy reported as 0.0000.
 */
function run(from, to, at, until, box) {
  const FR = 1 / 24;
  const out = [];
  const n = Math.round((to - from) / FR);
  for (let i = 0; i < n; i++) {
    const t = Math.round((from + i * FR) * 1000) / 1000;
    const m = { t, energy: 0.0002, x: 0.95, y: 0.5, w: 0.02, h: 0.02, dy: 0 };
    if (t >= at - 1e-9 && t <= until + 1e-9) {
      m.energy = box.energy; m.x = box.x; m.y = box.y; m.w = box.w; m.h = box.h;
      // What the tracker reports when the page moved further than it can see.
      m.dy = 0;
    }
    out.push(m);
  }
  return out;
}

/**
 * The camera, not the record. A press this pipeline refuses still exists as an
 * event — that is events.js's standing contract, so the creator can switch a
 * zoom back on — but it draws no ripple and moves nothing. "Did the camera
 * move" is therefore the question every one of these asks.
 */
function moved(path, motion, duration) {
  const found = inferEvents({ samples: path, motion, duration, located: path })
    .filter((e) => e.type === "click" || e.type === "dblclick");
  return confirmClicks(found, [], { located: path }).some((e) => e.zoomable !== false);
}

/* 14. The scrollbar drag: the pointer parked on the bar, the page streaming past. */
{
  const path = rest(19.0, 22.0, 0.99, 0.42, "default");
  const motion = run(19.0, 22.0, 20.0, 20.92, { energy: 0.1676, x: 0.13, y: 0.03, w: 0.734, h: 0.944 });
  check("a scrollbar dragged to the bottom, dy unmeasurable", moved(path, motion, 23), false);
}

/* 15. The same, with a hand over the bar — a scrollbar thumb is grabbable. */
{
  const path = rest(19.0, 22.0, 0.99, 0.42, "pointer");
  const motion = run(19.0, 22.0, 20.0, 20.92, { energy: 0.1676, x: 0.13, y: 0.03, w: 0.734, h: 0.944 });
  check("...and a hand on the thumb does not make it a press", moved(path, motion, 23), false);
}

/**
 * 15b. The dangerous one: a scroll with no reading of the pointer at all.
 *
 * A plain arrow over the scrollbar is refused by the arrow rule, and that rule
 * carried these cases before. But the locator does not always find the pointer
 * — a busy repainting screen is exactly when it struggles — and with no shape
 * and no model reading the press falls through to the pipeline's oldest
 * default, "nobody looked, so allow it". Scrolling is the one situation where
 * that default is reliably wrong, and it is the only thing standing between a
 * long scroll and a zoom.
 */
{
  const path = rest(19.0, 22.0, 0.99, 0.42, "default");
  const motion = run(19.0, 22.0, 20.0, 20.92, { energy: 0.1676, x: 0.13, y: 0.03, w: 0.734, h: 0.944 });
  const found = inferEvents({ samples: path, motion, duration: 23, located: [] })
    .filter((e) => e.type === "click" || e.type === "dblclick");
  const camera = confirmClicks(found, [], { located: [] }).some((e) => e.zoomable !== false);
  check("...and with nobody able to read the pointer at all", camera, false);
}

/* 16. A scrolling PANE, which is shorter than the frame and just as common. */
{
  const path = rest(19.0, 22.0, 0.78, 0.42, "default");
  const motion = run(19.0, 22.0, 20.0, 20.92, { energy: 0.09, x: 0.30, y: 0.15, w: 0.48, h: 0.62 });
  check("a pane scrolled beside a resting pointer", moved(path, motion, 23), false);
}

/**
 * 17. And the press this must not take away with it.
 *
 * A navigation is a STEP: the frame after it is already the new screen, so it
 * differs from its predecessor by almost nothing. That is what separates it
 * from a scroll, and it has to keep working, or the fix for 113 undoes the
 * fix for 112.
 */
{
  const path = rest(8.5, 11.5, 0.068, 0.587, "pointer");
  const motion = run(8.5, 11.5, 9.75, 9.75, { energy: 0.0969, x: 0.0075, y: 0.042, w: 0.991, h: 0.928 });
  const found = inferEvents({ samples: path, motion, duration: 12, located: path })
    .filter((e) => e.type === "click");
  check("one frame of change is still a new screen", found.length > 0, true);
  check("...and still moves the camera",
    found.length > 0 && confirmClicks(found, [], { located: path })[0].zoomable, true);
}

console.log("\nA press is filed where the hand was, not where it ended up\n");

/**
 * ── THE ONE FROM video_demo_114 ─────────────────────────────────────────────
 *   "between 0:19 - 0:21 why the hell Zoom-in or camera moved to the right
 *    bottom of this screen? ... I guess Zoom-in and Camera movements are not
 *    properly aligned."
 *
 * Solved off that recording by matching the zoomed frames back against the
 * unzoomed ones: the press was on "Usage" in the settings rail at (0.22, 0.35)
 * and the camera settled at 2.17x on (0.755, 0.749) — clamped against the
 * bottom-right corner, aimed at "Adjust limit" at (0.78, 0.81).
 *
 * The hand pressed Usage, then drifted across the dialog while the pane
 * loaded. The dwell was still open, so it carried the hand with it, and a
 * dwell reports the position of its LAST sample. The press was filed where the
 * hand finished, not where it pressed.
 */

/**
 * A hand that presses, then creeps.
 *
 * The creep is deliberately slower than `stillSpeed`, because that is the case
 * that bites: the dwell never closes, so it stays open across the press and
 * keeps overwriting its own position with each new sample. Anything faster
 * ends the dwell and was never the problem.
 */
function pressThenCreep(from, to, a, b) {
  const FPS = 30;
  const out = [];
  const n = Math.round((to - from) * FPS);
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    out.push({
      t: Math.round((from + i / FPS) * 1000) / 1000,
      x: a.x + (b.x - a.x) * k,
      y: a.y + (b.y - a.y) * k,
      shape: "pointer",
      located: true,
    });
  }
  return out;
}

/* 18. The press belongs to the row it landed on. */
{
  const pressed = { x: 0.22, y: 0.35 };
  const ended = { x: 0.285, y: 0.41 };
  const path = pressThenCreep(17.0, 21.0, pressed, ended);
  const motion = run(17.0, 21.0, 17.792, 17.792,
    { energy: 0.0584, x: 0.205, y: 0.113, w: 0.625, h: 0.839 });
  const found = inferEvents({ samples: path, motion, duration: 21.5, located: path })
    .filter((e) => e.type === "click");
  check("a rail item pressed, then the hand creeps away", found.length > 0, true);
  const atPress = found.length ? Math.hypot(found[0].x - pressed.x, found[0].y - pressed.y) : 9;
  const atEnd = found.length ? Math.hypot(found[0].x - ended.x, found[0].y - ended.y) : 0;
  check("...filed where it pressed", atPress < 0.04, true);
  check("...not where the dwell ended up", atEnd > 0.05, true);
}

/**
 * 19. And the locator may correct a press, but it may not relocate one.
 *
 * snapToLocated moves a press onto the pointer the locator actually found,
 * which is worth a few pixels. It had no limit, so one bad frame could pick a
 * press up off its control and put it down anywhere at all.
 */
{
  const press = [{ id: "e1", type: "click", t: 10.0, x: 0.22, y: 0.35, confidence: 0.9 }];

  const nudged = snapToLocated(press, [{ t: 10.01, x: 0.235, y: 0.362, located: true }]);
  check("a sighting a few pixels away corrects the press", nudged[0].snapped, "located");

  const wild = snapToLocated(press, [{ t: 10.01, x: 0.78, y: 0.81, located: true }]);
  check("...a sighting in the far corner does not move it", wild[0].x, 0.22);
}

console.log("\n" + (failures ? failures + " failed" : "all passed") + "\n");
process.exit(failures ? 1 : 0);

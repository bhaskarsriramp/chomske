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
import { confirmClicks, inferEvents, capZoomed, zoomsFromClicks, restToFull } from "../../services/studio/events.js";
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

/**
 * 6. Nothing located and nothing read.
 *
 * ── THIS CHECK USED TO EXPECT THE OPPOSITE ──────────────────────────────────
 * It asserted `true`: with no reading of any kind the press was allowed, which
 * was the pipeline's oldest default, from when the shape of the cursor could
 * not be recovered and there was nothing else to go on.
 *
 * That default is what made every previous bug in this file possible. A demo
 * is full of things that look like a press from the pixels — a page arriving
 * in stages, a scrollbar being dragged, a panel fetching its data — and each
 * one moved the camera until somebody found it in an export and wrote another
 * refusal here. The list could only ever be as long as the bugs already
 * reported, which is why there was always one more.
 *
 * The camera now moves on positive evidence and stays put without it. No hand,
 * no named control, no move. Deliberate, and the cost is stated plainly: if
 * the locator cannot find the pointer in a recording, that recording gets no
 * zooms rather than arbitrary ones.
 */
{
  const [e] = confirmClicks([press(4.6, 0.5, 0.3)], [], { located: [] });
  check("no reading of any kind — the camera stays put", e.zoomable, false);
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

console.log("\nOne bad frame from the locator does not unmake a still hand\n");

/**
 * ── THE ONE FROM video_demo_115 ─────────────────────────────────────────────
 *   "0:04-0:06 i have clicked on 'Projects' button or Tab why Zoomed in not
 *    worked? (camera not moved closed to this button or area)"
 *
 * The hand is visibly parked on the rail item, the OS is drawing a hand, the
 * page navigates — and no ripple, no zoom.
 *
 * osShapeAt() took its reference position from the ONE sighting nearest the
 * press in time, then measured every other sighting against that frame. The
 * locator's worst frames are the ones during a repaint, which is precisely
 * when a press lands. So a single bad frame moved the reference somewhere the
 * pointer never was, every good sighting fell outside `near` of it, and a
 * pointer that had been still for nearly two seconds came back as "seen 36
 * times, settled once" — which confirmClicks reads as its strongest evidence
 * AGAINST a press: "the pointer never stopped here".
 */

/** A hand parked at one spot, with some of the locator's frames spoiled. */
function parkedWith(spoil) {
  const out = rest(3.6, 5.4, 0.05, 0.055, "pointer");
  return out.map((p, i) => (spoil(p, i) ? { ...p, x: 0.62, y: 0.48 } : p));
}
const atPress = (p) => Math.abs(p.t - 4.438) < 0.02;

/* 20. The exact failure: one spoiled frame, at the worst possible moment. */
{
  const located = parkedWith(atPress);
  const [e] = confirmClicks([press(4.438, 0.05, 0.055)], [], { located });
  check("a still hand, one bad frame at the press", e.zoomable, true);
}

/* 21. A burst of them, still a minority. */
{
  const located = parkedWith((p) => p.t > 4.30 && p.t < 4.70);
  const [e] = confirmClicks([press(4.438, 0.05, 0.055)], [], { located });
  check("a still hand, a burst of bad frames through the repaint", e.zoomable, true);
}

/* 22. And the reading this must not start inventing: a pointer that travelled. */
{
  const located = sweep(4.0, 5.0, { x: 0.15, y: 0.10 }, { x: 0.80, y: 0.70 }, "pointer");
  const [e] = confirmClicks([press(4.5, 0.47, 0.40)], [], { located });
  check("a hand sweeping across the screen is still not a press", e.zoomable, false);
}

/**
 * 23. The whole press, end to end, from the numbers measured off 115.
 *
 * The rail item pressed, the page replacing itself, the hand never moving.
 * Unlike 20 above, this one passes on the old code too — where the bad frame
 * falls relative to the press decides whether the reading is poisoned, and
 * here it falls outside. It is kept as the end-to-end check that the press is
 * found, graded and aimed at the thing that was pressed; 20 is the sharp test
 * for the reading itself.
 */
{
  const path = rest(3.6, 6.0, 0.05, 0.055, "pointer").map((p) =>
    Math.abs(p.t - 4.45) < 0.02 ? { ...p, x: 0.62, y: 0.48 } : p);
  // The window spans one sample of the 24Hz grid this helper builds on.
  const motion = run(3.6, 6.0, 4.59, 4.61,
    { energy: 0.0982, x: 0.030, y: 0.042, w: 0.969, h: 0.917 });
  const found = inferEvents({ samples: path, motion, duration: 7, located: path })
    .filter((e) => e.type === "click");
  check("'Projects' pressed, the page navigates", found.length > 0, true);
  check("...and the camera moves to it",
    found.length > 0 && confirmClicks(found, [], { located: path })[0].zoomable, true);
  const off = found.length ? Math.hypot(found[0].x - 0.05, found[0].y - 0.055) : 9;
  check("...aimed at the rail item, not the bad frame", off < 0.05, true);
}

console.log("\nEvery click in ONE recording, whatever surface it lands on\n");

/**
 * ── THE ONE FROM video_demo_116, AND THE POINT OF ALL OF THEM ───────────────
 *   "whenever I click on projects or any other tab the zoom is working ... but
 *    in the same screen recording when I click on the billing or usage the
 *    zoom is not happening ... if one thing is working the other thing is not
 *    working, so it should not be the case."
 *
 * Every earlier case here is one press in isolation, and that is what let the
 * see-saw hide: each fix was checked against the press it was for, and the
 * press it quietly took away sat in a different test — or in none.
 *
 * So this one is a whole recording. A rail item in the app, whose press
 * replaces the page; a rail item inside a settings dialog, whose press
 * replaces one pane of it. The numbers are measured off 116, INCLUDING the
 * video's own `cover` reading, because that reading is the thing the two
 * presses disagree about: the page swap covers a quarter of the frame, the
 * pane swap a twenty-fifth, and for a long time that scalar was the only
 * evidence the pipeline consulted.
 *
 * Both are presses. Both get the camera. If either of these ever fails again,
 * so has the rule.
 */
{
  const FR = 1 / 24;
  const r3 = (t) => Math.round(t * 1000) / 1000;

  // The hand: parked on the app rail, then parked on the dialog rail.
  const samples = [
    ...rest(3.0, 5.5, 0.05, 0.055, "pointer"),
    ...sweep(12.2, 12.7, { x: 0.05, y: 0.055 }, { x: 0.23, y: 0.23 }, "default"),
    ...rest(12.8, 15.5, 0.23, 0.23, "pointer"),
  ];

  // Two presses, two very different surfaces.
  const page = { t: 4.6, energy: 0.0982, x: 0.030, y: 0.042, w: 0.969, h: 0.917, cover: 0.25 };
  const pane = { t: 13.67, energy: 0.0370, x: 0.305, y: 0.120, w: 0.510, h: 0.780, cover: 0.04 };

  const motion = [];
  const cover = [];
  for (let t = 3.0; t < 16.0; t += FR) {
    const now = r3(t);
    const m = { t: now, energy: 0.0002, x: 0.5, y: 0.5, w: 0.02, h: 0.02, dy: 0 };
    let c = 0.001;
    for (const s of [page, pane]) {
      if (Math.abs(now - s.t) < FR) {
        m.energy = s.energy; m.x = s.x; m.y = s.y; m.w = s.w; m.h = s.h;
        c = s.cover;
      }
    }
    motion.push(m);
    cover.push({ t: now, cover: c });
  }

  const found = confirmClicks(
    inferEvents({ samples, motion, duration: 17, screen: { motion: cover }, located: samples })
      .filter((e) => e.type === "click" || e.type === "dblclick"),
    [], { located: samples }
  ).filter((e) => e.zoomable !== false);

  const near = (e, x, y) => Math.hypot(e.x - x, e.y - y) < 0.06;
  check("the app rail — the page is replaced", found.some((e) => near(e, 0.05, 0.055)), true);
  check("the dialog rail — one pane is replaced", found.some((e) => near(e, 0.23, 0.23)), true);
  check("...and both in the same recording", found.length >= 2, true);
}

console.log("\nAnd nothing downstream quietly takes a zoom away again\n");

/**
 * ── A ZOOM IS NOT A SCARCE RESOURCE ──────────────────────────────
 * capZoomed keeps a demo from being mostly zoomed. It used to do that by
 * DROPPING whole zooms, weakest first — which makes presses compete, so a
 * press kept its camera or lost it depending on how many OTHER presses the
 * creator happened to make. Nothing in events.js can fix a see-saw of that
 * shape, and it is the same complaint by another route.
 *
 * It shortens them now. Whatever the pressure, the count comes back whole.
 */
{
  const mk = (n, hold) => Array.from({ length: n }, (_, i) => ({
    id: "z" + i, start: i * 2, end: i * 2 + hold, ramp_out: 0.42, level: 2,
  }));
  const shortest = (zs) => Math.min(...zs.map((z) => z.end - z.start));

  check("a calm demo is left alone", capZoomed(mk(4, 0.9), 25).length, 4);
  check("a busy one keeps every zoom", capZoomed(mk(12, 0.9), 25).length, 12);
  check("a very busy one still keeps every zoom", capZoomed(mk(20, 0.9), 20).length, 20);
  check("...and none is shortened into a twitch", shortest(capZoomed(mk(20, 0.9), 20)) >= 0.29, true);
}

console.log("\nHowever many clicks, however fast, every one gets the camera\n");

/**
 * ── THERE IS NO CLICK BUDGET ────────────────────────────────────
 *   "we can't estimate or imagine how many clicks a user can actually click
 *    on the screen recording, right?"
 *
 * No. So the count must not matter, and neither must the rate. A press that
 * earned a zoom keeps it whether it is the third of three or the four
 * hundredth of five hundred.
 *
 * The rate is the harder half. A push-in, a hold and a pull-out plus the beat
 * at the full frame afterwards is about two seconds; below that there is no
 * room for two separate moves, and restToFull used to resolve that by keeping
 * one press and discarding the other. Clicking round a screen at a second and
 * a half — an ordinary demo pace — lost every second zoom.
 */
{
  const clicks = (n, gap, apart) => Array.from({ length: n }, (_, i) => ({
    id: "e" + i, type: "click", t: 1 + i * gap,
    x: apart ? (i % 2 ? 0.12 : 0.88) : 0.5,
    y: apart ? (i % 2 ? 0.15 : 0.85) : 0.5,
    confidence: 0.9, corroborated: true, zoomable: true,
  }));

  // Is each press inside a shot that is on screen when it happens?
  const served = (n, gap, apart) => {
    const cs = clicks(n, gap, apart);
    const duration = 1 + n * gap + 2;
    const zs = capZoomed(restToFull(zoomsFromClicks(cs, { duration }), { rest: 0.35 }), duration);
    let ok = 0;
    for (const c of cs) {
      const z = zs.find((v) => c.t >= v.start - 0.6 && c.t <= v.end + 0.5);
      if (!z) continue;
      // A following shot travels with the pointer, so it is on whatever it spans.
      if (z.follow) { ok++; continue; }
      if (c.x >= z.x - 0.02 && c.x <= z.x + z.w + 0.02 &&
          c.y >= z.y - 0.02 && c.y <= z.y + z.h + 0.02) ok++;
    }
    return ok;
  };

  for (const [n, gap] of [[15, 3], [20, 1.5], [30, 1.0], [100, 0.4], [500, 0.15]]) {
    check(n + " clicks, one every " + gap + "s, in one place", served(n, gap, false), n);
    check("...and the same at opposite corners", served(n, gap, true), n);
  }

  // And it stays arithmetic: no quadratic blow-up on a long recording.
  const t0 = Date.now();
  served(2000, 0.1, true);
  check("2000 clicks still plans in well under a second", Date.now() - t0 < 1000, true);
}

console.log("\nThe rule itself: a hand, at rest, and something came of it\n");

/**
 * ── THE WHOLE FORMULA, STATED ONCE ─────────────────────────────────
 *   "whenever the mouse pointer changes to hand gesture and then a click
 *    happens, there we should zoom in. Apart from this, at any point of
 *    interaction, we should not zoom anywhere."
 *
 * Everything below the first check is the same press with one piece of that
 * evidence taken away. None of them names the interaction it represents,
 * because the point is that the camera does not need to recognise a scroll,
 * or a page loading, or a drag, to leave them alone — it needs to not find a
 * hand holding still over something that answered.
 */
{
  // The one that moves the camera.
  const held = rest(7.4, 9.2, 0.031, 0.182, "pointer");
  check("a hand held still, and something came of it",
    confirmClicks([press(8.32, 0.031, 0.182)], [], { located: held })[0].zoomable, true);

  // The hand is there but it never stopped: dragging, not pressing. This is
  // the scrollbar in video_demo_final1 — the pointer rides the bar down the
  // page with a hand on it the whole way.
  const riding = sweep(11.8, 15.6, { x: 0.99, y: 0.18 }, { x: 0.99, y: 0.88 }, "pointer");
  const onBar = [12.4, 13.2, 14.1, 15.0].map((t) => {
    const p = riding.find((q) => Math.abs(q.t - t) < 0.02) || { x: 0.99, y: 0.5 };
    return confirmClicks([press(t, p.x, p.y)], [], { located: riding })[0].zoomable;
  });
  check("a hand riding the scrollbar never moves the camera",
    onBar.every((z) => z === false), true);

  // The hand held still, but nothing followed: a hover.
  check("a hand held still, nothing came of it",
    confirmClicks([press(8.32, 0.031, 0.182, { corroborated: false })], [], { located: held })[0].zoomable, false);

  // Something came of it and the hand was still, but the page was sliding.
  check("a hand held still while the page scrolled",
    confirmClicks([press(8.32, 0.031, 0.182, { scrolled: true })], [], { located: held })[0].zoomable, false);

  // Still hand, something came of it — but the OS drew a plain arrow, so
  // whatever changed was not this pointer pressing anything. A panel
  // finishing its fetch under a parked mouse looks exactly like this.
  const parked = rest(7.4, 9.2, 0.42, 0.55, "default");
  check("an arrow parked while the page finished loading",
    confirmClicks([press(8.32, 0.42, 0.55)], [], { located: parked })[0].zoomable, false);

  /**
   * And the interaction nobody has thought of.
   *
   * No hand, no arrow, no model reading, no name for what it was — the case
   * this file cannot enumerate, because it has not been invented yet. It is
   * refused without any rule mentioning it, which is the whole point of
   * asking for evidence instead of listing exceptions.
   */
  check("some interaction nothing in here has a name for",
    confirmClicks([press(8.32, 0.5, 0.5)], [], { located: [] })[0].zoomable, false);
}

console.log("\nA press made the moment the hand arrives is still a press\n");

/**
 * ── THE ONE FROM video_demo_117 ───────────────────────────────────
 * One click in the whole recording got no camera: "My Startup", pressed just
 * after a two-second scroll. Everything else, scrolling included, was right.
 *
 * The stillness test added for the scrollbar asked what share of a SYMMETRIC
 * window either side of the press the pointer spent at the spot. But a press
 * happens at the START of a rest: you scroll, you move to the item, you press
 * it. Half that window is the hand on its way there, and what it was doing
 * before it arrived is not evidence about the press.
 *
 * Measured on the old code, on identical behaviour: arriving 0.72s before the
 * window closed passed, 0.66s failed. A cliff, and ordinary demo timing sits
 * right on it.
 */
{
  // Parked over the content while the wheel scrolls, then over to the rail.
  const arriving = (arrive) => {
    const out = [];
    for (let t = 20.6; t <= 23.0; t += 1 / FPS) {
      let x, y;
      if (t < arrive - 0.15) { x = 0.60; y = 0.55; }
      else if (t < arrive) { const k = (t - (arrive - 0.15)) / 0.15; x = 0.60 + (0.06 - 0.60) * k; y = 0.55 + (0.45 - 0.55) * k; }
      else { x = 0.06; y = 0.45; }
      out.push({ t: Math.round(t * 1000) / 1000, x, y, shape: "pointer", located: true });
    }
    return out;
  };
  const p = press(21.713, 0.06, 0.45);
  const moves = (a) => confirmClicks([p], [], { located: arriving(a) })[0].zoomable;

  check("pressed a moment after the hand lands", moves(21.65), true);
  check("...and however long it waited first",
    [21.0, 21.2, 21.35, 21.45, 21.55, 21.6].every(moves), true);

  /**
   * And the thing that stillness test was put there for, which must stay
   * refused: a hand riding the scrollbar never stops anywhere, so it never
   * builds a span at any one spot.
   */
  const riding = sweep(11.8, 15.6, { x: 0.99, y: 0.18 }, { x: 0.99, y: 0.88 }, "pointer");
  check("a hand riding the scrollbar is still refused",
    [12.4, 13.2, 14.1, 15.0].every((t) =>
      confirmClicks([press(t, 0.99, 0.18 + 0.70 * (t - 11.8) / 3.8)], [], { located: riding })[0].zoomable === false), true);
}

console.log("\n" + (failures ? failures + " failed" : "all passed") + "\n");
process.exit(failures ? 1 : 0);

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

/* 8. And a scroll over a control is still a scroll. */
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

console.log("\n" + (failures ? failures + " failed" : "all passed") + "\n");
process.exit(failures ? 1 : 0);

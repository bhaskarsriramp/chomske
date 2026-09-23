/**
 * Reading a recording's cadence the way capture.js does.
 *
 *     node scripts/pointerTest/cadence.mjs
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * A creator reported that a smooth scroll comes out of the export stepping —
 * "chunk chunk, step step". Their recordings report 13 to 25 frames a second
 * against the 30 every preset exports at, so each captured frame is held for
 * 1.2 to 2.2 output frames. Never a whole number, which is what stepping is.
 *
 * But that figure is frames ÷ duration, and a screen capture only emits a frame
 * when the screen CHANGES. Thirteen a second could be thirty during every
 * scroll and two while the creator talks over a still page — in which case the
 * capture is fine and the fault is in our resample. Or it could be a flat
 * thirteen, in which case the browser never had the frames and no amount of
 * work in the renderer will help. Opposite causes, opposite fixes.
 *
 * capture.js measures the distribution with requestVideoFrameCallback and sends
 * it up. This checks the arithmetic that turns those gaps into an answer,
 * because a percentile off by one would send us chasing the wrong cause for a
 * week — and the measurement itself only runs in a browser, where none of the
 * rest of this suite can reach it.
 *
 * The summary below is the same computation as capture.js cadenceOf(). It is
 * duplicated deliberately: the original runs in a Worker-less browser context
 * that this process cannot import, and the point of the test is the shape of
 * the answer rather than the sharing of the code.
 */

let pass = true;
const ok = (name, cond, detail = "") => {
  console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "  " + detail : ""));
  if (!cond) pass = false;
  return cond;
};
const round3 = (v) => Math.round(Number(v) * 1000) / 1000;

/** capture.js cadenceOf(), over a list of gaps in milliseconds. */
function summarise(gaps) {
  if (gaps.length < 8) return { supported: true, frames: gaps.length + 1 };
  const sorted = [...gaps].sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const hz = (ms) => (ms > 0 ? Math.round((1000 / ms) * 10) / 10 : 0);
  const quarter = sorted.slice(0, Math.max(1, Math.round(sorted.length / 4)));
  const busyMean = quarter.reduce((a, b) => a + b, 0) / quarter.length;
  return {
    supported: true,
    frames: gaps.length + 1,
    p10_ms: round3(at(0.1)),
    median_ms: round3(at(0.5)),
    p90_ms: round3(at(0.9)),
    fastest_quarter_hz: hz(busyMean),
    median_hz: hz(at(0.5)),
    spread: round3(at(0.9) / Math.max(0.1, at(0.1))),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   The two recordings that have to be told apart
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * A HEALTHY capture of a demo that is mostly still. The browser emits at 30fps
 * whenever anything moves and goes quiet in between, so the average over the
 * whole recording is poor and the motion itself was caught perfectly.
 */
const stillScreen = [];
for (let i = 0; i < 120; i++) stillScreen.push(33.3);        // four seconds of scrolling
for (let i = 0; i < 40; i++) stillScreen.push(500);          // twenty seconds of talking

/**
 * A STARVED capture. The encoder or something else on the machine is taking the
 * frames away, so even while the screen is moving the browser manages 13 a
 * second. This is the one no renderer can repair.
 */
const starved = [];
for (let i = 0; i < 120; i++) starved.push(74 + (i % 3) * 4);
for (let i = 0; i < 40; i++) starved.push(500);

/** And a locked 30fps capture, for the shape of a good answer. */
const locked = Array.from({ length: 200 }, () => 33.3);

const a = summarise(stillScreen);
const b = summarise(starved);
const c = summarise(locked);

const avg = (g) => 1000 / (g.reduce((x, y) => x + y, 0) / g.length);

console.log("\n" + "=".repeat(86));
console.log("  Two recordings with almost the same average, and opposite problems");
console.log("=".repeat(86) + "\n");
console.log("    recording           average   median   busiest quarter   spread");
for (const [name, gaps, s] of [
  ["still screen, healthy", stillScreen, a],
  ["starved capture", starved, b],
  ["locked 30fps", locked, c],
]) {
  console.log(
    "    " + name.padEnd(22) +
      avg(gaps).toFixed(1).padStart(5) + "fps" +
      "   " + String(s.median_hz).padStart(5) + "fps" +
      "   " + String(s.fastest_quarter_hz).padStart(9) + "fps" +
      "        " + s.spread.toFixed(1) + "x"
  );
}
console.log("");

ok(
  "the two problem recordings have averages close enough to be confused",
  Math.abs(avg(stillScreen) - avg(starved)) < 8,
  avg(stillScreen).toFixed(1) + "fps and " + avg(starved).toFixed(1) + "fps"
);
ok(
  "but the busiest quarter tells them apart",
  a.fastest_quarter_hz > 25 && b.fastest_quarter_hz < 18,
  a.fastest_quarter_hz + "fps against " + b.fastest_quarter_hz + "fps"
);
ok(
  "a healthy capture of a still screen reads as healthy",
  a.fastest_quarter_hz >= 29 && a.fastest_quarter_hz <= 31,
  a.fastest_quarter_hz + "fps at its busiest"
);
ok(
  "a starved one reads as starved even though it was busy",
  b.fastest_quarter_hz < 15,
  b.fastest_quarter_hz + "fps at its busiest"
);
ok(
  "a locked rate has no spread",
  Math.abs(c.spread - 1) < 0.001 && c.median_hz === 30,
  "spread " + c.spread + "x at " + c.median_hz + "fps"
);
ok(
  "and an on-change capture shows its unevenness whatever its average",
  a.spread > 5,
  a.spread.toFixed(1) + "x between p10 and p90"
);
ok(
  "too few frames to say anything says nothing",
  summarise([33, 33, 33]).median_hz === undefined,
  JSON.stringify(summarise([33, 33, 33]))
);

console.log(pass ? "\nall passed\n" : "\nFAILED\n");
process.exit(pass ? 0 : 1);

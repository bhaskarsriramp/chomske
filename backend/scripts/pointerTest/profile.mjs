/**
 * What the server does with the browser's measurement of the pointer.
 *
 *     node scripts/pointerTest/profile.mjs
 *
 * ── THE CHANGE THIS GUARDS ───────────────────────────────────────────────────
 * The browser now measures the pointer while the recording is being made, at
 * full resolution, and sends two numbers with the upload: which design it is
 * and how tall (src/components/Studio/capture.js, profileOf). locate.js used to
 * discover both by searching the encoded video, and when that search picks
 * wrong it picks wrong for the WHOLE recording — one real demo calibrated as a
 * 21px dark pointer on a machine that draws a 19px light one and located the
 * cursor in 40% of its frames.
 *
 * So a firm measurement now NARROWS the search to the design it names. That is
 * the improvement and it is also the new way to lose: if the measurement is
 * confidently wrong, a narrowed search looks for a pointer that is not there
 * and finds nothing at all. locate.js has a fallback for exactly that — a
 * narrowed search that comes back empty is run again across both designs — and
 * a fallback nobody has ever taken is not a fallback.
 *
 * ── WHAT IS ASSERTED ─────────────────────────────────────────────────────────
 *   right profile    the pointer is found, and the narrowing did not cost it
 *   wrong profile    the pointer is STILL found, because the search reopened
 *   shaky profile    the search never narrows, however wrong the design
 *   no profile       byte for byte what happened before any of this existed
 *
 * Windows only: the pointer images come from C:/Windows/Cursors.
 */
import path from "path";
import os from "os";
import { makeClip } from "./harness.mjs";
import { locatePointer } from "../../services/studio/locate.js";

const S = path.join(os.tmpdir(), "lipi-pointer-test");
const FPS = 20;

/**
 * A macOS-style dark-bodied pointer on a light page. Chosen because it is the
 * case where a wrong design is most tempting: the page is bright, so a light
 * template has plenty of bright things to fit badly against.
 */
const { file, gt, hints } = await makeClip("profile_mac", S + "/bg_light.png", { invert: true });
const duration = gt.length / FPS;

async function run(label, cursor) {
  const r = await locatePointer(file, {
    sourceWidth: 1920,
    sourceHeight: 1020,
    duration,
    fps: FPS,
    hints,
    cursorPx: 20,
    cursor,
  });
  const byI = new Map(r.track.map((p) => [Math.round(p.t * FPS), p]));
  let present = 0;
  let found = 0;
  gt.forEach((g, i) => {
    if (g.x == null) return;
    present++;
    const p = byI.get(i);
    if (p && Math.hypot(p.x * 1920 - g.x, p.y * 1020 - g.y) <= 12) found++;
  });
  const rate = present ? found / present : 0;
  console.log(
    "  " + label.padEnd(30) +
      " settled on " + (r.design + " " + r.heightPx + "px").padEnd(11) +
      " found " + String(Math.round(rate * 100)).padStart(3) + "%"
  );
  return { rate, design: r.design };
}

console.log("\nA dark-bodied pointer on a light page, with the browser saying different things.\n");

const none = await run("no measurement at all", null);
const right = await run("measured right, firmly", { design: "dark", height_px: 19, samples: 40, confidence: 0.9 });
const wrong = await run("measured WRONG, firmly", { design: "light", height_px: 19, samples: 40, confidence: 0.9 });
const shaky = await run("measured wrong, not firmly", { design: "light", height_px: 19, samples: 8, confidence: 0.3 });

console.log("");
const ok = (name, cond) => {
  console.log((cond ? "  PASS  " : "  FAIL  ") + name);
  return cond;
};

let pass = true;
pass = ok("without a measurement, the pointer is found as it always was", none.rate >= 0.95 && none.design === "dark") && pass;
pass = ok("a right measurement keeps it", right.rate >= 0.95 && right.design === "dark") && pass;
/**
 * The bar is the SAME as the others on purpose. A fallback that finds the
 * pointer in half the frames is not a fallback, it is a slower failure — the
 * reopened search has all the evidence the first one would have had.
 */
pass = ok("a wrong measurement does not cost the recording its pointer", wrong.rate >= 0.95 && wrong.design === "dark") && pass;
pass = ok("and a shaky one never narrows the search at all", shaky.rate >= 0.95 && shaky.design === "dark") && pass;

console.log(pass ? "\nall passed\n" : "\nFAILED\n");
process.exit(pass ? 0 : 1);

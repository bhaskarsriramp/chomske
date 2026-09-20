import path from "path";
import os from "os";
import { makeClip } from "./harness.mjs";
import { locatePointer } from "../../services/studio/locate.js";
const S = path.join(os.tmpdir(), "lipi-pointer-test");

const cases = [
  ["light page", S + "/bg_light.png", {}],
  ["dark page", S + "/bg_dark.png", {}],
  ["busy image", S + "/bg_busy.png", {}],
  ["light page, scrolling", S + "/bg_light.png", { scroll: true }],
  ["light page, 150% cursor", S + "/bg_light.png", { size: 48 }],
  ["dark-body pointer (mac)", S + "/bg_light.png", { invert: true }],
  ["dark-body on dark page", S + "/bg_dark.png", { invert: true }],
];
const only = process.argv[2];
for (const [label, bg, o] of cases) {
  if (only && !label.startsWith(only)) continue;
  const { file, gt, hints } = await makeClip(label.replace(/[^a-z0-9]+/gi, "_"), bg, o);
  const t0 = Date.now();
  const r = await locatePointer(file, { sourceWidth: 1920, sourceHeight: 1020, duration: gt.length / 20, fps: 20, hints, cursorPx: o.size === 64 ? 40 : o.size === 48 ? 30 : 20 });
  const ms = Date.now() - t0;
  const byI = new Map(r.track.map((p) => [Math.round(p.t * 20), p]));
  let present = 0, found = 0, errSum = 0, errMax = 0, shapeOk = 0, absent = 0, falsePos = 0, far = 0;
  gt.forEach((g, i) => {
    const p = byI.get(i);
    if (g.x == null) { absent++; if (p) falsePos++; return; }
    present++;
    if (!p) return;
    const e = Math.hypot(p.x * 1920 - g.x, p.y * 1020 - g.y);
    if (e > 12) { far++; return; }
    found++; errSum += e; errMax = Math.max(errMax, e);
    if (p.shape === g.shape) shapeOk++;
  });
  console.log(label.padEnd(26),
    "found " + String(Math.round(100 * found / present)).padStart(3) + "%",
    " wrong place " + String(far).padStart(3),
    " error avg " + (found ? (errSum / found).toFixed(1) : "-") + "px max " + errMax.toFixed(1) + "px",
    " shape right " + (found ? Math.round(100 * shapeOk / found) : 0) + "%",
    " off-screen false hits " + falsePos + "/" + absent,
    " [" + r.design + " " + r.heightPx + "px, " + (ms / gt.length).toFixed(0) + " ms/frame]");
}

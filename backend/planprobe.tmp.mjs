import { plan, PRIORITY, budgetFor } from "./services/studio/audit.js";

const ev = (t, o = {}) => ({ id: "e" + t, type: "click", t, x: 0.5, y: 0.5, zoomable: true, basis: "hand", on_control: true, ...o });

// A recording where the pointer rested five times and the pipeline proposed
// a press for only one of them.
const rests = [
  { t: 2.0, x: 0.20, y: 0.30, ms: 800 },
  { t: 5.0, x: 0.40, y: 0.50, ms: 1500 },
  { t: 9.0, x: 0.60, y: 0.20, ms: 300 },
  { t: 14.0, x: 0.80, y: 0.70, ms: 2200 },
  { t: 20.0, x: 0.10, y: 0.90, ms: 250 },
];
const events = [ev(5.05)];
const zooms = [{ id: "z1", start: 13.6, end: 16.0 }];

const r = plan({ changes: [], events, zooms, rests, duration: 30 });
console.log("budget for 30s:", budgetFor(30));
for (const it of r.items) {
  console.log(`  ${it.kind.padEnd(6)} t=${String(it.t).padEnd(6)} prio=${it.priority} id="${it.id ?? ""}" ${it.why || ""}`);
}
console.log("folded:", r.folded, " dropped:", r.dropped);

const ts = r.items.map((i) => i.t);
const expect = (name, cond) => console.log((cond ? "  PASS  " : "  FAIL  ") + name);
expect("the rest with an event on it is not re-asked (5.0s absent)", !ts.includes(5.0));
expect("the rest under an existing zoom is not asked (14.0s absent)", !ts.includes(14.0));
expect("the bare rests ARE asked (2.0s and 9.0s present)", ts.includes(2.0) && ts.includes(9.0));
expect("rests rank below refused presses", r.items.every((i) => i.priority >= PRIORITY.refused));

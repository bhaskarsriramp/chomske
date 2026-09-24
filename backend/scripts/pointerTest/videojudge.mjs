/**
 * Experiment: the whole recording to Gemini as video — no pixel measurements —
 * and it finds the creator's pointer and every click itself. Scored against
 * the labelled truth files.
 *
 *     VERTEX_PROJECT=<project> node scripts/pointerTest/videojudge.mjs [name-filter] [--fps 10] [--model gemini-2.5-flash] [--think 8192]
 *
 * A click counts as found when a reported one is within T_SLACK seconds and
 * PX_SLACK pixels of the labelled one; also reported is the looser "right time,
 * anywhere" match, because the model's coordinates are coarser than its timing.
 * Every reported click that matches no labelled one is a false click.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

process.env.REDIS_DISABLED = process.env.REDIS_DISABLED || "true";
const { generateJson } = await import("../../services/ai/provider.js");
const { MODEL } = await import("../../services/ai/provider.js");
const { probe } = await import("../../services/media/ffmpeg.js");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, d) => {
  const i = process.argv.indexOf("--" + name);
  return i > 0 ? process.argv[i + 1] : d;
};
const FPS = Number(arg("fps", 10));
const MODEL_ID = arg("model", MODEL.vision);
const THINK = Number(arg("think", 8192));
const filter = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "";
const T_SLACK = 0.8;
const PX_SLACK = 120;

const PROMPT = (duration) => `This is a screen recording of a web browser tab, ${duration.toFixed(1)} seconds long, made by a person recording a product demo of a website. It is sampled at ${FPS} frames per second; every timestamp below is in seconds from the start of the recording.

Find every CLICK the person made with THEIR OWN mouse pointer — the recording computer's pointer, drawn on top of the page.

Pages often contain embedded videos, animated product demos or screenshots that show OTHER people's pointers moving and clicking. Those are not the person's clicks: ignore every pointer inside a video, a demo, or a picture of another screen. The person's own pointer may disappear for long stretches — the recording does not draw it while it is idle — and reappear somewhere else.

A click is the person activating something under their pointer: a link, a button, a navigation item, a tab, a toggle or switch, a checkbox, a menu item, a field. The evidence is that the pointer stops on the thing (often shaped as a hand) and the thing responds — a new page, a menu, a dialog, a switch flipping, a tab becoming selected, a value changing — and the response stays.

NOT clicks: hovering (a highlight that goes away when the pointer leaves), scrolling, the page animating by itself (carousels, auto-rotating tabs, videos, content loading), and anything inside an embedded video or demo.

For every click give the time in seconds, to a tenth, when the button was pressed — just before the response appears; the position of the pointer's tip as fractions of the frame's width and height (0 to 1); what was clicked; and how sure you are.

Also say what the person's own pointer looks like, so we know which one you followed.

Answer with JSON only:
{"pointer": "colour and shape of the person's own pointer", "clicks": [{"t": 0.0, "x": 0.0, "y": 0.0, "target": "under 6 words", "confidence": 0.0}]}`;

const files = fs.readdirSync(path.join(HERE, "truth")).filter((f) => f.endsWith(".json") && f.includes(filter)).sort();
let found = 0;
let foundLoose = 0;
let labelled = 0;
let falses = 0;
let usd = 0;
const rows = [];

for (const f of files) {
  const truth = JSON.parse(fs.readFileSync(path.join(HERE, "truth", f), "utf8"));
  const video = path.join(HERE, "fixtures", truth.recording);
  if (!fs.existsSync(video)) { console.log("SKIP " + f + " (no footage)"); continue; }
  const info = await probe(video);
  const W = info.width;
  const H = info.height;
  const bytes = fs.readFileSync(video);
  console.log("\n" + "=".repeat(78) + "\n" + f + "  " + (bytes.length / 1e6).toFixed(1) + "MB  " + info.duration.toFixed(1) + "s");

  const t0 = Date.now();
  let json = null;
  try {
    const res = await generateJson({
      model: MODEL_ID,
      parts: [
        { inlineData: { mimeType: "video/mp4", data: bytes.toString("base64") }, videoMetadata: { fps: FPS } },
        { text: PROMPT(info.duration) },
      ],
      maxOutputTokens: 16384,
      temperature: 0,
      thinkingBudget: THINK,
    });
    json = res.json;
    usd += res.usd;
    console.log("  answered in " + ((Date.now() - t0) / 1000).toFixed(0) + "s, " + res.input + " tokens in, " + res.output + " out");
  } catch (err) {
    console.log("  FAILED: " + String(err?.message || err).slice(0, 300));
    continue;
  }

  const said = (Array.isArray(json?.clicks) ? json.clicks : []).map((c) => ({
    t: Number(c.t), x: Number(c.x) * W, y: Number(c.y) * H, target: String(c.target || ""), confidence: Number(c.confidence),
  })).filter((c) => Number.isFinite(c.t));
  console.log("  pointer it followed: " + String(json?.pointer || "?"));

  const used = new Set();
  for (const c of truth.clicks || []) {
    labelled++;
    const cands = said.map((s, i) => ({ s, i, dt: Math.abs(s.t - c.t), d: Math.hypot(s.x - c.x, s.y - c.y) })).filter((m) => !used.has(m.i));
    const hit = cands.filter((m) => m.dt <= T_SLACK && m.d <= PX_SLACK).sort((a, b) => a.dt - b.dt)[0];
    const loose = cands.filter((m) => m.dt <= T_SLACK).sort((a, b) => a.dt - b.dt)[0];
    if (hit) { found++; foundLoose++; used.add(hit.i); console.log("  FOUND   " + c.label + " at " + c.t + "s — said " + hit.s.t.toFixed(1) + "s, " + hit.d.toFixed(0) + "px off: " + hit.s.target); }
    else if (loose) { foundLoose++; used.add(loose.i); console.log("  NEAR    " + c.label + " at " + c.t + "s — said " + loose.s.t.toFixed(1) + "s but " + loose.d.toFixed(0) + "px off: " + loose.s.target); }
    else console.log("  MISSED  " + c.label + " at " + c.t + "s");
  }
  for (let i = 0; i < said.length; i++) {
    if (used.has(i)) continue;
    falses++;
    const s = said[i];
    console.log("  FALSE   " + s.t.toFixed(1) + "s at " + s.x.toFixed(0) + "," + s.y.toFixed(0) + " (" + s.confidence + "): " + s.target);
  }
  rows.push({ file: f, said, pointer: json?.pointer });
}

console.log("\n" + "=".repeat(78));
console.log(`model ${MODEL_ID}, ${FPS} fps, thinking ${THINK}`);
console.log(`clicks found (right time and place): ${found} of ${labelled}`);
console.log(`clicks found (right time, any place): ${foundLoose} of ${labelled}`);
console.log(`false clicks: ${falses}`);
console.log(`spend $${usd.toFixed(4)} (at GEMINI_USD_PER_M rates)\n`);
fs.writeFileSync(path.join(HERE, "fixtures", `videojudge-${MODEL_ID}-${FPS}fps.json`), JSON.stringify(rows, null, 1));
process.exit(0);

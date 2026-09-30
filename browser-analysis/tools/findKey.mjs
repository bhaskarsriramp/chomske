// Which drawing a template name stands for: runs the server analysis of one
// recording with the recording canvas and prints the drawing behind `want`.
import fs from "node:fs";
import { sha1Hex } from "../shared/sha1.js";
process.env.REDIS_DISABLED = "true";
process.env.STUDIO_POINTER_VISION = "off";
const [video, capPath, want] = process.argv.slice(2);
const { analyseRecording } = await import("../../backend/services/studio/analyse.js");
const { probe } = await import("../../backend/services/media/ffmpeg.js");
const info = await probe(video);
const capture = JSON.parse(fs.readFileSync(capPath, "utf8"));
const wd = fs.mkdtempSync("tmp-");
await analyseRecording({ video, workDir: wd, capture, source: { width: info.width, height: info.height, fps: info.fps || 30 }, duration: info.duration });
fs.rmSync(wd, { recursive: true, force: true });
for (const key of globalThis.__drawn.keys()) {
  if (sha1Hex(key) === want) {
    const [w, h, ops, args] = JSON.parse(key);
    console.log("FOUND", w, h, JSON.stringify(ops.slice(0, 6)), "...", ops.length, "ops; args", JSON.stringify(args));
  }
}
console.log("drawings in this analysis:", globalThis.__drawn.size);

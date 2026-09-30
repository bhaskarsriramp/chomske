/**
 * tools/genTemplates.mjs <outDir>: every pointer template the locator can
 * build, drawn by the server's canvas, one file each, named by the drawing.
 * Prints { count, bytes } as JSON on its last line.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sha1Hex } from "../shared/sha1.js";
import { encodeImage } from "../shared/templateFile.js";

process.env.REDIS_DISABLED = "true";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOCATE = path.join(HERE, "../../backend/services/studio/locate.js");
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });

// The shapes, read from the locator's own table so a new one is not missed.
const src = fs.readFileSync(LOCATE, "utf8");
const start = src.indexOf("const SHAPES = {");
const block = src.slice(start, src.indexOf("\n};", start));
const shapes = [...block.matchAll(/^ {2}([A-Za-z_][A-Za-z0-9_]*): \{/gm)].map((m) => m[1]);
if (!shapes.length) throw new Error("no shapes found in locate.js");

const { _debug } = await import(pathToFileURL(LOCATE).href);
for (const s of shapes) for (let hp = 4; hp <= 160; hp++) for (const dark of [false, true]) _debug.make(s, hp, dark, 1920);

let bytes = 0;
for (const [key, img] of globalThis.__drawn) {
  const file = encodeImage(img.data, img.width, img.height);
  fs.writeFileSync(path.join(out, sha1Hex(key) + ".bin"), file);
  bytes += file.length;
}
console.log(JSON.stringify({ count: globalThis.__drawn.size, bytes, shapes }));

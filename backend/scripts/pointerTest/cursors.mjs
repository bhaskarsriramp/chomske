import path from "path";
import os from "os";
import fs from "fs";
import { createCanvas } from "@napi-rs/canvas";
// .cur = ICO container: header, entries (w, h, hotspot x/y, size, offset), then PNG or 32-bpp BMP.
export function readCur(path) {
  const b = fs.readFileSync(path);
  const count = b.readUInt16LE(4);
  const out = [];
  for (let i = 0; i < count; i++) {
    const e = 6 + i * 16;
    const w = b[e] || 256, h = b[e + 1] || 256, hx = b.readUInt16LE(e + 4), hy = b.readUInt16LE(e + 6);
    const size = b.readUInt32LE(e + 8), off = b.readUInt32LE(e + 12);
    const data = b.subarray(off, off + size);
    let rgba = null;
    if (data[0] === 0x89 && data[1] === 0x50) { rgba = { png: data }; }
    else {
      const hdr = data.readUInt32LE(0), bw = data.readInt32LE(4), bh = data.readInt32LE(8) / 2, bpp = data.readUInt16LE(14);
      if (bpp !== 32) { out.push({ w, h, hx, hy, bpp }); continue; }
      const px = new Uint8ClampedArray(bw * bh * 4);
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        const s = hdr + ((bh - 1 - y) * bw + x) * 4, d = (y * bw + x) * 4;
        px[d] = data[s + 2]; px[d + 1] = data[s + 1]; px[d + 2] = data[s]; px[d + 3] = data[s + 3];
      }
      rgba = { w: bw, h: bh, px };
    }
    out.push({ w, h, hx, hy, rgba });
  }
  return out;
}
if (process.argv[2] === "show") {
  for (const f of ["aero_arrow", "aero_link"]) {
    const imgs = readCur("C:/Windows/Cursors/" + f + ".cur");
    console.log(f + ": " + imgs.map((m) => m.w + "x" + m.h + " hotspot(" + m.hx + "," + m.hy + ")" + (m.rgba?.png ? " png" : m.rgba ? " bmp32" : " bpp" + m.bpp)).join(", "));
    const m = imgs.find((x) => x.w === 32 && x.rgba?.px);
    if (m) {
      console.log("  32px, '#'=dark opaque, 'o'=light opaque, '.'=semi, ' '=clear; H=hotspot");
      for (let y = 0; y < m.rgba.h; y++) {
        let r = "";
        for (let x = 0; x < m.rgba.w; x++) {
          const d = (y * m.rgba.w + x) * 4, a = m.rgba.px[d + 3], l = m.rgba.px[d];
          r += x === m.hx && y === m.hy ? "H" : a < 40 ? " " : a < 200 ? "." : l < 100 ? "#" : "o";
        }
        if (r.trim()) console.log("   " + String(y).padStart(2) + " |" + r + "|");
      }
    }
  }
}

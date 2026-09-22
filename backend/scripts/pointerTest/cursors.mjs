import path from "path";
import os from "os";
import fs from "fs";
import { createCanvas } from "@napi-rs/canvas";
// .cur = ICO container: header, entries (w, h, hotspot x/y, size, offset), then PNG,
// a 32-bpp BMP, or the two-bitplane monochrome bitmap Windows still uses for
// the I-beam, the resize arrows and the wait pointers.
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
      if (bpp === 32) {
        const px = new Uint8ClampedArray(bw * bh * 4);
        for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
          const s = hdr + ((bh - 1 - y) * bw + x) * 4, d = (y * bw + x) * 4;
          px[d] = data[s + 2]; px[d + 1] = data[s + 1]; px[d + 2] = data[s]; px[d + 3] = data[s + 3];
        }
        rgba = { w: bw, h: bh, px };
      } else if (bpp === 1) {
        /**
         * ── THE OLD MONOCHROME FORMAT, WHICH WINDOWS STILL SHIPS ─────────────
         * The I-beam, the resize arrows and the wait pointers are not 32-bpp
         * bitmaps and not PNG: they are the original two-colour cursors, and a
         * reader that understands only the other two reports "no pixels" for
         * every one of them. That is why they were invisible here.
         *
         * Two bitplanes, each 1 bit per pixel, rows padded to 4 bytes and
         * stored bottom-up: XOR (which of the two palette colours) followed by
         * AND (transparency). The four combinations are the ones every cursor
         * has used since Windows 3:
         *
         *   AND 0, XOR 0   the first palette colour, opaque   (normally black)
         *   AND 0, XOR 1   the second, opaque                 (normally white)
         *   AND 1, XOR 0   transparent
         *   AND 1, XOR 1   invert whatever is behind it
         *
         * The inverting case is real — a classic I-beam is drawn that way over
         * a plain background — and there is no screen here to invert, so it is
         * rendered as opaque black. That is what it looks like over the light
         * background these are traced against, which is the point of drawing
         * them at all.
         */
        const pal = [];
        for (let k = 0; k < 2; k++) {
          const s = hdr + k * 4;
          pal.push([data[s + 2], data[s + 1], data[s]]);
        }
        const stride = ((bw + 31) >> 5) << 2;
        const xorOff = hdr + 8;
        const andOff = xorOff + stride * bh;
        const bit = (base, x, y) => {
          const s = base + (bh - 1 - y) * stride + (x >> 3);
          return s < data.length ? (data[s] >> (7 - (x & 7))) & 1 : 1;
        };
        const px = new Uint8ClampedArray(bw * bh * 4);
        for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
          const xr = bit(xorOff, x, y), an = bit(andOff, x, y), d = (y * bw + x) * 4;
          if (an && !xr) { px[d + 3] = 0; continue; }
          const c = an && xr ? [0, 0, 0] : pal[xr];
          px[d] = c[0]; px[d + 1] = c[1]; px[d + 2] = c[2]; px[d + 3] = 255;
        }
        rgba = { w: bw, h: bh, px };
      } else { out.push({ w, h, hx, hy, bpp }); continue; }
    }
    out.push({ w, h, hx, hy, rgba });
  }
  return out;
}
/**
 * `node scripts/pointerTest/cursors.mjs show [name...]` prints a cursor as text,
 * which is how the outlines in services/studio/locate.js were traced. Names are
 * files in C:/Windows/Cursors without the extension; with none given it shows
 * the two the locator has always modelled.
 *
 * Windows 11 ships its modern cursors as PNG inside the .cur container rather
 * than as the 32-bpp bitmaps the Aero set used, so both are decoded here. A
 * shape that only exists as PNG is invisible to a reader that checks `rgba.px`
 * alone, which is why every beam, resize and busy pointer looked like "no
 * pixels" until this did both.
 */
if (process.argv[2] === "show") {
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const names = process.argv.slice(3);
  for (const f of names.length ? names : ["aero_arrow", "aero_link"]) {
    let imgs;
    try {
      imgs = readCur("C:/Windows/Cursors/" + f + ".cur");
    } catch (err) {
      console.log(f + ": " + err.message);
      continue;
    }
    console.log(f + ": " + imgs.map((m) => m.w + "x" + m.h + " hotspot(" + m.hx + "," + m.hy + ")" + (m.rgba?.png ? " png" : m.rgba ? " bmp32" : " bpp" + m.bpp)).join(", "));
    const m = imgs.find((x) => x.w === 32 && x.rgba) || imgs.find((x) => x.rgba);
    if (!m) continue;
    let w, h, px;
    if (m.rgba.png) {
      const img = await loadImage(Buffer.from(m.rgba.png));
      w = img.width;
      h = img.height;
      const c = createCanvas(w, h);
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      px = g.getImageData(0, 0, w, h).data;
    } else {
      w = m.rgba.w;
      h = m.rgba.h;
      px = m.rgba.px;
    }
    console.log("  " + w + "px, '#'=dark opaque, 'o'=light opaque, '.'=semi, ' '=clear; H=hotspot");
    for (let y = 0; y < h; y++) {
      let r = "";
      for (let x = 0; x < w; x++) {
        const d = (y * w + x) * 4, a = px[d + 3], l = px[d];
        r += x === m.hx && y === m.hy ? "H" : a < 40 ? " " : a < 200 ? "." : l < 100 ? "#" : "o";
      }
      if (r.trim()) console.log("   " + String(y).padStart(2) + " |" + r + "|");
    }
  }
}

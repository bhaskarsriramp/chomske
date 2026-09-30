/**
 * shared/sha1.js: SHA-1 of a string, synchronously, the same in Node and in a
 * worker. Names a pointer template's file by the drawing that makes it (see
 * canvasKey.js): the build writes the file under this name and the worker
 * asks for it by this name, so both must compute it with this one function.
 *
 * Not for anything secret; it is a file name.
 */
export function sha1Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const len = bytes.length;
  const words = ((len + 8) >> 6) + 1;
  const m = new Uint32Array(words * 16);
  for (let i = 0; i < len; i++) m[i >> 2] |= bytes[i] << (24 - (i % 4) * 8);
  m[len >> 2] |= 0x80 << (24 - (len % 4) * 8);
  const bits = len * 8;
  m[words * 16 - 1] = bits >>> 0;
  m[words * 16 - 2] = Math.floor(bits / 0x100000000);

  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let b = 0; b < words; b++) {
    for (let i = 0; i < 16; i++) w[i] = m[b * 16 + i];
    for (let i = 16; i < 80; i++) {
      const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = (x << 1) | (x >>> 31);
    }
    let a = h0, bb = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f, k;
      if (i < 20) { f = (bb & c) | (~bb & d); k = 0x5a827999; }
      else if (i < 40) { f = bb ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (bb & c) | (bb & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = bb ^ c ^ d; k = 0xca62c1d6; }
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = (bb << 30) | (bb >>> 2); bb = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + bb) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map((v) => v.toString(16).padStart(8, "0")).join("");
}

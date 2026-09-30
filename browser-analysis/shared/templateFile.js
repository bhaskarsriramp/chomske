/**
 * shared/templateFile.js: one getImageData result as a small binary file.
 *
 * Layout: "TPL1", width (u16), height (u16), then runs of identical pixels,
 * each a count (u32) and the pixel's r, g, b, a. A pointer template is mostly
 * empty around its outline, so runs are short to store.
 */
export function encodeImage(data, width, height) {
  const runs = [];
  let i = 0;
  while (i < data.length) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    let n = 1;
    while (i + 4 * n < data.length && data[i + 4 * n] === r && data[i + 4 * n + 1] === g && data[i + 4 * n + 2] === b && data[i + 4 * n + 3] === a) n++;
    runs.push(n, r, g, b, a);
    i += 4 * n;
  }
  const out = new Uint8Array(8 + (runs.length / 5) * 8);
  const dv = new DataView(out.buffer);
  out.set([84, 80, 76, 49], 0); // "TPL1"
  dv.setUint16(4, width, true);
  dv.setUint16(6, height, true);
  let o = 8;
  for (let k = 0; k < runs.length; k += 5) {
    dv.setUint32(o, runs[k], true);
    out[o + 4] = runs[k + 1]; out[o + 5] = runs[k + 2]; out[o + 6] = runs[k + 3]; out[o + 7] = runs[k + 4];
    o += 8;
  }
  return out;
}

export function decodeImage(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[0] !== 84 || bytes[1] !== 80 || bytes[2] !== 76 || bytes[3] !== 49) throw new Error("not a template file");
  const width = dv.getUint16(4, true);
  const height = dv.getUint16(6, true);
  const data = new Uint8ClampedArray(width * height * 4);
  let p = 0;
  for (let o = 8; o + 8 <= bytes.length; o += 8) {
    const n = dv.getUint32(o, true);
    const r = bytes[o + 4], g = bytes[o + 5], b = bytes[o + 6], a = bytes[o + 7];
    for (let j = 0; j < n; j++) { data[p++] = r; data[p++] = g; data[p++] = b; data[p++] = a; }
  }
  if (p !== data.length) throw new Error("template file is the wrong size");
  return { data, width, height };
}

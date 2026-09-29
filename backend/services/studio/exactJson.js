/**
 * exactJson.js: JSON that gives back exactly what went in.
 *
 * ── WHY PLAIN JSON IS NOT ENOUGH ─────────────────────────────────────────────
 * The analysis can run in the creator's browser (browser-analysis/), and the
 * server hands it one input it cannot compute there — the screen reading
 * (sync.js readScreen) — and takes back its result. Both must arrive as the
 * very values the server would have had in memory, or the browser's analysis
 * is not the server's any more. Plain JSON changes some of them silently:
 *
 *   a Uint8Array          becomes an object with keys "0", "1", …
 *   NaN, ±Infinity        become null
 *   -0                    becomes 0
 *   undefined             disappears from objects and becomes null in arrays
 *
 * So those are written as tagged objects and restored on the way back in.
 * Numbers otherwise survive JSON exactly (the shortest decimal that parses
 * back to the same double), so nothing else needs help.
 *
 * Shared by the server and the browser worker; no imports, no Node APIs.
 */

const TYPED = {
  Uint8Array, Int8Array, Uint8ClampedArray, Uint16Array, Int16Array,
  Uint32Array, Int32Array, Float32Array, Float64Array,
};

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function toBase64(bytes) {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  if (i < bytes.length) {
    const n = (bytes[i] << 16) | ((i + 1 < bytes.length ? bytes[i + 1] : 0) << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=") + "=";
  }
  return out;
}

const B64_INDEX = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

function fromBase64(s) {
  const clean = s.replace(/=+$/, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    buf = (buf << 6) | B64_INDEX[clean.charCodeAt(i)];
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buf >> bits) & 255;
    }
  }
  return out;
}

const TAGS = new Set(["$n", "$t", "$u", "$o"]);

function pack(v) {
  if (v === undefined) return { $u: 1 };
  if (typeof v === "number") {
    if (Number.isNaN(v)) return { $n: "NaN" };
    if (v === Infinity) return { $n: "Inf" };
    if (v === -Infinity) return { $n: "-Inf" };
    if (v === 0 && 1 / v < 0) return { $n: "-0" };
    return v;
  }
  if (v === null || typeof v !== "object") return v;
  if (ArrayBuffer.isView(v)) {
    const name = v.constructor && v.constructor.name;
    if (!TYPED[name]) throw new Error("exactJson: cannot write a " + name);
    return { $t: name, b: toBase64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
  }
  if (Array.isArray(v)) {
    const out = new Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = pack(v[i]);
    return out;
  }
  const out = {};
  let tagged = false;
  for (const k of Object.keys(v)) {
    if (TAGS.has(k)) tagged = true;
    out[k] = pack(v[k]);
  }
  // A plain object that happens to use one of the tag names is wrapped, so
  // it cannot be mistaken for a tag on the way back.
  return tagged ? { $o: out } : out;
}

function unpack(v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) {
    const out = new Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = unpack(v[i]);
    return out;
  }
  if ("$u" in v) return undefined;
  if ("$n" in v) return v.$n === "NaN" ? NaN : v.$n === "Inf" ? Infinity : v.$n === "-Inf" ? -Infinity : -0;
  if ("$t" in v) {
    const bytes = fromBase64(v.b);
    const T = TYPED[v.$t];
    if (!T) throw new Error("exactJson: unknown array type " + v.$t);
    // Copied into a fresh, aligned buffer of the right type.
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    return new T(copy.buffer, 0, bytes.length / T.BYTES_PER_ELEMENT);
  }
  const src = "$o" in v ? v.$o : v;
  const out = {};
  for (const k of Object.keys(src)) out[k] = unpack(src[k]);
  return out;
}

/** A value, as a string that exactParse turns back into the same value. */
export function exactStringify(value) {
  return JSON.stringify(pack(value));
}

/** The inverse of exactStringify. */
export function exactParse(text) {
  return unpack(JSON.parse(text));
}

/**
 * Every place two values differ, as { at, a, b }, up to `limit` of them.
 * Ids made by timeline.js newId ("z_3fbe9ee506") are random per run, so a
 * pair of them is not a difference. Typed arrays are compared by type and
 * contents; numbers by identity (so NaN equals NaN and -0 differs from 0).
 */
const ID = /^[a-z]+_[0-9a-f]{10}$/;
export function exactDiff(a, b, { limit = 50, at = "", out = [] } = {}) {
  if (out.length >= limit) return out;
  if (typeof a === "string" && typeof b === "string" && ID.test(a) && ID.test(b)) return out;
  if (Object.is(a, b)) return out;
  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
    const same = ArrayBuffer.isView(a) && ArrayBuffer.isView(b) && a.constructor === b.constructor &&
      a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
    if (!same) out.push({ at, a: summarise(a), b: summarise(b) });
    return out;
  }
  if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      exactDiff(a[k], b[k], { limit, at: at + (Array.isArray(a) ? `[${k}]` : `.${k}`), out });
      if (out.length >= limit) break;
    }
    return out;
  }
  out.push({ at, a: summarise(a), b: summarise(b) });
  return out;
}

function summarise(v) {
  if (v === undefined) return "undefined";
  if (ArrayBuffer.isView(v)) return `${v.constructor.name}(${v.length})`;
  const s = JSON.stringify(v);
  return s && s.length > 120 ? s.slice(0, 117) + "..." : s;
}

export default { exactStringify, exactParse, exactDiff };

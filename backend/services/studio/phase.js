/**
 * phase.js: is this the same page, moved — or a different page?
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────
 * Whether a big screen change is a SCROLL or a NEW PAGE decides whether a click
 * is looked for at all (events.js inferEvents), and three separate bugs in one
 * week came from answering it wrongly: a page swapped in one frame, logged by
 * the browser as a quarter-screen shift, thrown away as a scroll — and the
 * press on "Pricing" that caused it never found.
 *
 * The measurements it was answered from look for a SHIFT and report one
 * whether or not there is one: the browser tracker's row correlation always
 * returns its best offset, and readScreen's region median always returns a
 * median. Asked about two unrelated pages, both still answer with a number.
 *
 * Phase correlation answers the question that matters. The normalised
 * cross-power spectrum of two frames, transformed back, is a single sharp peak
 * at the shift when one frame IS the other moved, and flat noise when they are
 * unrelated. The height of the peak is how much of the picture moved together.
 * Measured on every labelled recording (2026-09-25): the frame after each
 * labelled page-changing press peaked at 0.09 or below in 22 of 23 cases; the
 * frames inside real scrolls at 0.30 or above in 61 of 64, the rest being
 * two- and three-pixel nudges. The one page swap that peaked (0.42, a settings
 * pane sliding in) was a shift the region median did not see at all, so the
 * caller asks for both to agree.
 *
 * Pure JavaScript, a radix-2 FFT at half the analysis size. No dependency.
 */

function fft1(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(a);
    const wi = Math.sin(a);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const p = i + k;
        const q = p + half;
        const vr = re[q] * cr - im[q] * ci;
        const vi = re[q] * ci + im[q] * cr;
        re[q] = re[p] - vr; im[q] = im[p] - vi;
        re[p] += vr; im[p] += vi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

function fft2(re, im, w, h, inverse) {
  const rr = new Float64Array(w);
  const ri = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) { rr[x] = re[o + x]; ri[x] = im[o + x]; }
    fft1(rr, ri, inverse);
    for (let x = 0; x < w; x++) { re[o + x] = rr[x]; im[o + x] = ri[x]; }
  }
  const cr = new Float64Array(h);
  const ci = new Float64Array(h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) { cr[y] = re[y * w + x]; ci[y] = im[y * w + x]; }
    fft1(cr, ci, inverse);
    for (let y = 0; y < h; y++) { re[y * w + x] = cr[y]; im[y * w + x] = ci[y]; }
  }
}

const pow2 = (n) => 1 << Math.ceil(Math.log2(Math.max(2, n)));

/**
 * Phase correlation between two grey frames of the same size.
 *
 * Read at half size (2x2 averaged): the question is which of two things
 * happened, not the shift to the pixel, and a quarter of the pixels is a
 * quarter of the work.
 *
 * @param {Uint8Array|Buffer} a  the earlier frame, W*H grey
 * @param {Uint8Array|Buffer} b  the later frame
 * @returns {{shifted:number, still:number, dx:number, dy:number}}
 *   `shifted` is the strongest peak away from no-shift, `dx`/`dy` where it is,
 *   in pixels of the frames given (content moving UP is positive dy, as in
 *   readScreen);
 *   `still` is the peak at no shift — how much stayed exactly where it was.
 */
export function phaseShift(a, b, W, H) {
  const sw = W >> 1;
  const sh = H >> 1;
  const w = pow2(sw);
  const h = pow2(sh);
  const ar = new Float64Array(w * h);
  const ai = new Float64Array(w * h);
  const br = new Float64Array(w * h);
  const bi = new Float64Array(w * h);
  let ma = 0;
  let mb = 0;
  const small = (src, x, y) => {
    const i = 2 * y * W + 2 * x;
    return (src[i] + src[i + 1] + src[i + W] + src[i + W + 1]) / 4;
  };
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { ma += small(a, x, y); mb += small(b, x, y); }
  ma /= sw * sh;
  mb /= sw * sh;
  // A Hann window, so the frame's own edges are not read as structure.
  for (let y = 0; y < sh; y++) {
    const wy = 0.5 - 0.5 * Math.cos((2 * Math.PI * y) / Math.max(1, sh - 1));
    for (let x = 0; x < sw; x++) {
      const wx = 0.5 - 0.5 * Math.cos((2 * Math.PI * x) / Math.max(1, sw - 1));
      ar[y * w + x] = (small(a, x, y) - ma) * wx * wy;
      br[y * w + x] = (small(b, x, y) - mb) * wx * wy;
    }
  }
  fft2(ar, ai, w, h, false);
  fft2(br, bi, w, h, false);
  for (let i = 0; i < w * h; i++) {
    // A·conj(B). With this sign the peak's dy has readScreen's convention —
    // content moving UP the screen positive — checked on a picture moved 20px
    // down (-20) and against readScreen's dy on every labelled scroll.
    const r = ar[i] * br[i] + ai[i] * bi[i];
    const m = ai[i] * br[i] - ar[i] * bi[i];
    const mag = Math.hypot(r, m) || 1;
    ar[i] = r / mag;
    ai[i] = m / mag;
  }
  fft2(ar, ai, w, h, true);
  let still = 0;
  let shifted = 0;
  let dx = 0;
  let dy = 0;
  const n = w * h;
  for (let y = 0; y < h; y++) {
    const yy = y > h / 2 ? y - h : y;
    for (let x = 0; x < w; x++) {
      const xx = x > w / 2 ? x - w : x;
      const v = ar[y * w + x] / n;
      if (Math.abs(xx) <= 1 && Math.abs(yy) <= 1) { if (v > still) still = v; continue; }
      if (v > shifted) { shifted = v; dx = xx; dy = yy; }
    }
  }
  return { shifted, still, dx: dx * 2, dy: dy * 2 };
}

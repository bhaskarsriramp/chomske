/* eslint-disable no-restricted-globals */
// `self` is the worker's global scope and the only way to reach onmessage and
// postMessage from inside one. The rule exists to stop `self` being confused
// with `window` in ordinary application code, where there is no worker and it
// means something else; in this file there is no window at all.

/**
 * tracker.worker.js: recovering the pointer from pixels.
 *
 * ── WHY THIS FILE EXISTS AT ALL ──────────────────────────────────────────────
 * A browser recording a screen gets pixels and nothing else. getDisplayMedia
 * hands over frames; it does not hand over the pointer, the clicks, the keys or
 * which window is in front, and JavaScript sees mouse events only inside its own
 * tab. When a creator shares another window — which is every real demo — there
 * are no events to capture. That is why Screen Studio is a native app and why
 * Supademo ships a browser extension.
 *
 * So the pointer is recovered from the picture. The operating system composites
 * the cursor INTO the captured frames, which means it is there to be found, and
 * this worker finds it.
 *
 * ── THE IDEA ─────────────────────────────────────────────────────────────────
 * Between two frames of a screen recording, almost nothing changes. Usually the
 * only thing that moved IS the pointer, and it shows up as exactly two small
 * patches of difference: where it was, and where it now is. Telling those apart
 * is the whole trick, and the answer is contrast — a cursor is white with a
 * black outline, which is a harder edge than almost anything a user interface
 * draws. The patch that looks most like a cursor is the arrival; the other is
 * the hole it left behind.
 *
 * When a lot of the screen changes at once, no pointer is reported for that
 * frame. A page that just navigated has thousands of difference patches and the
 * cursor is not findable among them; a gap of a frame or two is invisible after
 * interpolation, and a confident wrong answer is not.
 *
 * ── THIS WORKER REPORTS, IT DOES NOT CONCLUDE ────────────────────────────────
 * Nothing here decides that a click happened. It reports where the pointer was
 * and what changed on screen, and the server infers clicks, scrolls and typing
 * from that (backend/services/studio/events.js). The split matters: the
 * observations are recorded once and can never be recovered again, while the
 * conclusions can be re-derived with better thresholds tomorrow, against
 * recordings made today.
 *
 * ── IT RUNS WHILE SOMEBODY IS RECORDING ──────────────────────────────────────
 * Every millisecond spent here is a millisecond of jank in the demo being
 * recorded. Hence: a worker, not the main thread; a downscaled frame, not the
 * full one; connected components over the changed pixels only, not the whole
 * image; and a hard bail-out as soon as the frame is too busy to read.
 */

/** Bumped when the recovery changes in a way that alters what it reports. */
const VERSION = "px-1";

/** Per-channel difference that counts as "this pixel changed". */
const DIFF = 18;
/** Above this share of the frame changed, the pointer is not findable. */
const BUSY = 0.25;
/** A cursor is never bigger than this share of the frame. */
const MAX_BLOB = 0.01;
/** ...nor smaller than this many pixels, at the downscaled size. */
const MIN_BLOB = 3;
/** Components examined per frame before giving up. A busy frame has thousands. */
const MAX_COMPONENTS = 48;

let canvas = null;
let ctx = null;
let prev = null;
let W = 0;
let H = 0;
/** Where the pointer was last seen, in pixels of the downscaled frame. */
let last = null;

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === "reset") {
    prev = null;
    last = null;
    return;
  }
  if (msg.type !== "frame") return;

  try {
    const out = handle(msg);
    self.postMessage(out);
  } catch (err) {
    self.postMessage({ t: msg.t, error: String(err && err.message) });
  } finally {
    if (msg.bitmap && msg.bitmap.close) msg.bitmap.close();
  }
};

function handle({ bitmap, data, width, height, t }) {
  let gray;

  if (bitmap) {
    if (!canvas || W !== bitmap.width || H !== bitmap.height) {
      W = bitmap.width;
      H = bitmap.height;
      canvas = new OffscreenCanvas(W, H);
      // willReadFrequently: this canvas exists only to be read back, and
      // without the hint Chrome keeps it on the GPU and every getImageData is
      // a stall waiting for a readback.
      ctx = canvas.getContext("2d", { willReadFrequently: true });
      prev = null;
    }
    ctx.drawImage(bitmap, 0, 0);
    gray = luma(ctx.getImageData(0, 0, W, H).data, W, H);
  } else {
    if (W !== width || H !== height) {
      W = width;
      H = height;
      prev = null;
    }
    gray = luma(data, W, H);
  }

  const N = W * H;
  if (!prev) {
    prev = gray;
    return { t, first: true, version: VERSION };
  }

  /* ── What changed ──────────────────────────────────────────────────────── */
  const mask = new Uint8Array(N);
  let changed = 0;
  let minX = W;
  let minY = H;
  let maxX = -1;
  let maxY = -1;

  for (let i = 0; i < N; i++) {
    const d = gray[i] - prev[i];
    if (d > DIFF || d < -DIFF) {
      mask[i] = 1;
      changed++;
      const y = (i / W) | 0;
      const x = i - y * W;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  const energy = changed / N;
  const motion = {
    energy,
    x: maxX >= 0 ? minX / W : 0.5,
    y: maxY >= 0 ? minY / H : 0.5,
    w: maxX >= 0 ? (maxX - minX + 1) / W : 0,
    h: maxY >= 0 ? (maxY - minY + 1) / H : 0,
    // Direction is only asked of frames that look like a scroll: a tall band
    // changed and the pointer did not move. Row correlation over a whole frame
    // is the one thing a difference image can say about which way it went, and
    // it costs too much to do on every frame for no reason.
    dy: energy > 0.01 && maxY - minY > H * 0.3 ? shiftOf(gray, prev) : 0,
  };

  /* ── Where the pointer is ──────────────────────────────────────────────── */
  let cursor = null;
  if (changed > 0 && energy < BUSY) {
    cursor = findCursor(mask, gray, changed);
    if (cursor) last = { x: cursor.px, y: cursor.py };
  } else if (energy >= BUSY) {
    // A whole new screen. The pointer is somewhere in it and there is no way to
    // say where, so the last known position is dropped rather than kept and
    // used to bias the next frame toward a place the pointer has left.
    last = null;
  }

  prev = gray;
  return { t, version: VERSION, motion, cursor };
}

/** Rec. 709 luma, which is what the eye and every codec weight by. */
function luma(rgba, w, h) {
  const n = w * h;
  const g = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    g[i] = (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8;
  }
  return g;
}

/**
 * The changed patches, and which one is the pointer.
 *
 * Connected components over the CHANGED pixels only. On an ordinary frame that
 * is a few hundred pixels in two patches, so this costs nothing; the guard
 * above is what keeps it from costing everything on a frame where the whole
 * screen repainted.
 */
function findCursor(mask, gray, changed) {
  const N = W * H;
  const seen = new Uint8Array(N);
  const stack = new Int32Array(Math.min(changed + 16, N));
  const maxArea = Math.max(24, Math.floor(N * MAX_BLOB));

  let best = null;
  let components = 0;

  for (let i = 0; i < N && components < MAX_COMPONENTS; i++) {
    if (!mask[i] || seen[i]) continue;

    // ── Flood fill, iteratively ──────────────────────────────────────────
    // Recursion here overflows the stack on the first large patch, and a large
    // patch is exactly what a frame with any real motion in it is full of.
    let top = 0;
    stack[top++] = i;
    seen[i] = 1;
    let area = 0;
    let bx0 = W;
    let by0 = H;
    let bx1 = -1;
    let by1 = -1;
    let tooBig = false;

    while (top > 0) {
      const p = stack[--top];
      const y = (p / W) | 0;
      const x = p - y * W;
      area++;
      if (x < bx0) bx0 = x;
      if (x > bx1) bx1 = x;
      if (y < by0) by0 = y;
      if (y > by1) by1 = y;
      if (area > maxArea) {
        tooBig = true;
        break;
      }
      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[top++] = p - 1; }
      if (x < W - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[top++] = p + 1; }
      if (y > 0 && mask[p - W] && !seen[p - W]) { seen[p - W] = 1; stack[top++] = p - W; }
      if (y < H - 1 && mask[p + W] && !seen[p + W]) { seen[p + W] = 1; stack[top++] = p + W; }
    }

    components++;
    if (tooBig || area < MIN_BLOB) continue;

    const bw = bx1 - bx0 + 1;
    const bh = by1 - by0 + 1;
    // A cursor is compact. A patch four times wider than it is tall is a menu
    // opening or a row highlighting, not a pointer.
    if (bw > bh * 4 || bh > bw * 5) continue;

    // ── Does it LOOK like a cursor ───────────────────────────────────────
    // The pointer is white with a black outline, which is a bigger swing of
    // brightness across a dozen pixels than a user interface usually draws.
    // This is what separates the patch the pointer arrived at from the patch it
    // left, where the background has simply reappeared.
    let lo = 255;
    let hi = 0;
    for (let y = by0; y <= by1; y++) {
      for (let x = bx0; x <= bx1; x++) {
        const v = gray[y * W + x];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    const contrast = hi - lo;

    // Nearness to where the pointer was a frame ago, as a tie-break. A pointer
    // moves continuously, so the candidate closest to the last sighting is
    // usually right — but it is only a nudge, never the deciding term, or the
    // tracker would follow the first thing it latched onto for ever.
    let near = 1;
    if (last) {
      const dx = (bx0 + bx1) / 2 - last.x;
      const dyy = (by0 + by1) / 2 - last.y;
      near = 1 + 1.5 / (1 + Math.hypot(dx, dyy) / 40);
    }

    const score = contrast * near;
    if (!best || score > best.score) {
      best = { bx0, by0, bx1, by1, bw, bh, area, contrast, score };
    }
  }

  if (!best || best.contrast < 40) return null;

  /* ── The hotspot ───────────────────────────────────────────────────────── */
  // "Where the pointer is" is not the middle of its picture. For an arrow it is
  // the tip, at the top-left; for a hand it is the fingertip, at the top-middle;
  // for a text caret it is the centre. Getting this wrong puts every click
  // ripple and every zoom target a few pixels off the thing that was clicked.
  const density = best.area / (best.bw * best.bh);
  const tall = best.bh > best.bw * 1.6;

  let shape = "default";
  let px;
  let py;

  if (tall && best.bw <= Math.max(4, W * 0.006)) {
    shape = "text";
    px = (best.bx0 + best.bx1) / 2;
    py = (best.by0 + best.by1) / 2;
  } else if (density > 0.62) {
    shape = "pointer";
    px = (best.bx0 + best.bx1) / 2;
    py = best.by0;
  } else {
    shape = "default";
    px = best.bx0;
    py = best.by0;
  }

  return {
    px,
    py,
    x: px / W,
    y: py / H,
    shape,
    // Contrast is the evidence. Below 40 nothing is reported at all; by 140 it
    // is as certain as this method gets, which is not the same as certain.
    conf: Math.max(0.3, Math.min(1, best.contrast / 140)),
  };
}

/**
 * How far the picture moved vertically between two frames.
 *
 * Row brightness profiles, correlated across a range of shifts. Coarse by
 * design: the answer feeds a "was this a scroll, and which way" question, not a
 * measurement, and a cheap answer every frame beats an exact one occasionally.
 */
function shiftOf(cur, old) {
  const rows = new Float32Array(H);
  const prevRows = new Float32Array(H);
  for (let y = 0; y < H; y++) {
    let a = 0;
    let b = 0;
    const base = y * W;
    for (let x = 0; x < W; x += 4) {
      a += cur[base + x];
      b += old[base + x];
    }
    rows[y] = a;
    prevRows[y] = b;
  }

  const MAX = Math.min(40, Math.floor(H / 4));
  let bestShift = 0;
  let bestErr = Infinity;
  for (let s = -MAX; s <= MAX; s += 2) {
    let err = 0;
    let n = 0;
    for (let y = Math.max(0, -s); y < Math.min(H, H - s); y += 2) {
      const d = rows[y + s] - prevRows[y];
      err += d * d;
      n++;
    }
    if (n < 8) continue;
    err /= n;
    if (err < bestErr) {
      bestErr = err;
      bestShift = s;
    }
  }
  return bestShift / H;
}

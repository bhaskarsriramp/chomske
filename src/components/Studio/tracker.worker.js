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
 * is the whole trick.
 *
 * The answer is NOT "whichever looks more like a cursor". Both patches are the
 * same size and shape, and the hole often sits over busier pixels than the
 * arrival does. The answer is that the cursor is in the current frame and not in
 * the previous one, so at the arrival the CURRENT frame has the harder edge and
 * at the departure the PREVIOUS one does. Measuring contrast in both and taking
 * the signed difference decides it outright. See findCursor.
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

/**
 * ── AND IT LOOKS AT THE POINTER AT ITS REAL SIZE ─────────────────────────────
 * Everything above runs on a downscaled frame, because scanning a whole 4K
 * picture twenty-four times a second is not affordable while somebody is
 * recording. Downscaling to a 960px long side halves a 1080p recording, and a
 * nineteen pixel cursor arrives here as nine. Nine pixels is enough to say
 * WHERE the pointer is. It is not enough to say what SHAPE it is, or how tall
 * it is, or whether its body is light or dark — and the server cannot recover
 * any of those either, because by the time it sees the recording H.264 has
 * smeared the one-pixel outline that carries the answer.
 *
 * So a second, much smaller picture is read every frame: a patch cut around the
 * pointer out of the ORIGINAL frame, at one to one, before any encoder touches
 * it. It is the only place in this product where a sharp cursor exists. A
 * 192px patch is fourteen times fewer pixels than the downscaled whole frame,
 * so this costs less than the pass it supplements, not more.
 *
 * What comes out of it is a measurement, not a picture: how tall the glyph is
 * and whether its body is lighter or darker than its outline. Those two numbers
 * are what backend/services/studio/locate.js currently has to GUESS — and a
 * wrong guess there picks the wrong template for the whole recording and loses
 * the pointer in most of its frames, silently.
 */

/** Bumped when the recovery changes in a way that alters what it reports. */
const VERSION = "px-3";

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

/* ── Reading the patch, in original pixels ─────────────────────────────────── */

/** Smallest arrival worth measuring. A real glyph is hundreds of pixels. */
const GLYPH_MIN_AREA = 40;
/** Plausible cursor heights in source pixels: 100% on 720p up to 300% on 4K. */
const GLYPH_MIN_H = 9;
const GLYPH_MAX_H = 96;
/**
 * How solid the arrival has to be. A pointer that moved less than its own width
 * leaves an arrival merged with the hole it came from, and that smear measures
 * taller and thinner than the glyph really is. Merged blobs are sparse; whole
 * glyphs are not.
 */
const GLYPH_MIN_FILL = 0.3;
/** Body and outline must differ by this much before a sample says which is which. */
const GLYPH_MIN_SPLIT = 18;

let canvas = null;
let ctx = null;
let prev = null;
let W = 0;
let H = 0;
/** Where the pointer was last seen, in pixels of the downscaled frame. */
let last = null;

/** The same, for the full-resolution patch: its own canvas, frame and origin. */
let pCanvas = null;
let pCtx = null;
let pPrev = null;
let pW = 0;
let pH = 0;
let pAt = null;

/**
 * `self` is not defined outside a worker. The measurement functions below are
 * pure and are exercised from node (backend/scripts/pointerTest/glyph.mjs), and
 * loading this file there must not trip over the message plumbing.
 */
if (typeof self !== "undefined" && typeof self.postMessage === "function") {
  self.onmessage = (e) => {
    const msg = e.data;
    if (msg.type === "reset") {
      prev = null;
      last = null;
      pPrev = null;
      pAt = null;
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
      if (msg.patch && msg.patch.close) msg.patch.close();
    }
  };
}

function handle(msg) {
  const { bitmap, data, width, height, t } = msg;
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
    // Direction is only asked of frames that look like a scroll: a band
    // changed and the pointer did not move. Row correlation over a whole frame
    // is the one thing a difference image can say about which way it went, and
    // it costs too much to do on every frame for no reason.
    //
    // ── AND A PANE SCROLLS WITHOUT THE FRAME SCROLLING ──────────────────────
    // This asked for a third of the frame's height before it would look. A
    // scrollable pane — a dashboard's main column, a modal's list, a sidebar
    // with its own bar — is shorter than that on plenty of layouts, so its
    // scrolls were reported as dy: 0, which downstream reads as "the page did
    // not move" rather than "nobody looked". An eighth is still far more than
    // any widget and takes in the panes.
    dy: energy > 0.01 && maxY - minY > H * 0.125 ? shiftOf(gray, prev) : 0,
  };

  /* ── Where the pointer is ──────────────────────────────────────────────── */
  let cursor = null;
  if (changed > 0 && energy < BUSY) {
    cursor = findCursor(mask, gray, prev, changed);
    if (cursor) last = { x: cursor.px, y: cursor.py };
  } else if (energy >= BUSY) {
    // A whole new screen. The pointer is somewhere in it and there is no way to
    // say where, so the last known position is dropped rather than kept and
    // used to bias the next frame toward a place the pointer has left.
    last = null;
  }

  prev = gray;

  /**
   * ── AND THE SAME POINTER, AT ITS REAL SIZE ──────────────────────────────
   * The patch is cut around where the pointer was a frame ago, so it is read
   * whether or not the coarse pass found it in this one. When it does find the
   * glyph it says so in ORIGINAL pixels, which is both a better position than
   * the downscaled one and — the reason it exists — a measurement of the
   * pointer itself.
   */
  const glyph = readPatch(msg);
  if (glyph && cursor) {
    // The refined position supersedes the coarse one: the same pointer, read at
    // twice the resolution. Everything else about the sighting stands.
    cursor = { ...cursor, x: glyph.x, y: glyph.y, conf: Math.max(cursor.conf, glyph.conf) };
    last = { x: glyph.x * W, y: glyph.y * H };
  } else if (glyph && energy < BUSY) {
    /**
     * ── AND IT MAY SUPPLY A SIGHTING THE COARSE PASS MISSED, BUT NOT ONE IT
     *    REFUSED ─────────────────────────────────────────────────────────────
     * Those are different failures. A frame where the pointer was simply not
     * isolated among the changed patches is one this can answer better, and it
     * has the stronger evidence: full resolution, and a glyph that had to hold
     * together as a body inside a rim to be reported at all.
     *
     * A frame where the whole screen repainted is not that. There the coarse
     * pass reports nothing ON PURPOSE and drops the last known position with
     * it, because the pointer is somewhere in a new screen and a confident
     * wrong answer is worse than a gap. The patch sees a fraction of that
     * screen and is in no position to overrule it.
     */
    cursor = { px: glyph.x * W, py: glyph.y * H, x: glyph.x, y: glyph.y, shape: glyph.shape, conf: glyph.conf };
    last = { x: cursor.px, y: cursor.py };
  }

  // The measurement is reported either way. Whether this frame's POSITION can
  // be trusted is the question above; what the glyph IS does not depend on how
  // busy the rest of the screen was.
  return { t, version: VERSION, motion, cursor, glyph };
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
/**
 * Connected components over the changed pixels, as bounding boxes.
 *
 * ── FLOOD FILL, ITERATIVELY ──────────────────────────────────────────────────
 * Recursion here overflows the stack on the first large patch, and a large
 * patch is exactly what a frame with any real motion in it is full of.
 *
 * A component that runs past `maxArea` is abandoned where it stands and marked
 * `tooBig` rather than measured: it is a repaint, a menu or a video, and the
 * only useful thing to know about it is that it is not a cursor.
 */
function componentsOf(mask, w, h, changed, maxArea, maxComponents) {
  const N = w * h;
  const seen = new Uint8Array(N);
  const stack = new Int32Array(Math.min(changed + 16, N));
  const out = [];

  for (let i = 0; i < N && out.length < maxComponents; i++) {
    if (!mask[i] || seen[i]) continue;

    let top = 0;
    stack[top++] = i;
    seen[i] = 1;
    let area = 0;
    let bx0 = w;
    let by0 = h;
    let bx1 = -1;
    let by1 = -1;
    let tooBig = false;

    while (top > 0) {
      const p = stack[--top];
      const y = (p / w) | 0;
      const x = p - y * w;
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
      if (x < w - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[top++] = p + 1; }
      if (y > 0 && mask[p - w] && !seen[p - w]) { seen[p - w] = 1; stack[top++] = p - w; }
      if (y < h - 1 && mask[p + w] && !seen[p + w]) { seen[p + w] = 1; stack[top++] = p + w; }
    }

    out.push({ bx0, by0, bx1, by1, bw: bx1 - bx0 + 1, bh: by1 - by0 + 1, area, tooBig });
  }
  return out;
}

/**
 * ── ARRIVAL OR DEPARTURE ─────────────────────────────────────────────────────
 * This is the decision the whole tracker turns on, and getting it wrong is what
 * put a second pointer in the finished video.
 *
 * A moving cursor produces TWO patches of difference: the place it now is, and
 * the hole it left behind where the background has reappeared. They are the
 * same size and the same shape. Scoring them on contrast alone picks whichever
 * sits over busier pixels — and the hole often wins, because the background
 * that came back may be text or an icon while the cursor landed on something
 * plain. The drawn pointer then sits where the mouse WAS, a whole movement
 * behind the real one burnt into the frame, and the viewer sees two cursors at
 * opposite ends of the screen.
 *
 * Contrast in ONE frame cannot tell them apart. Contrast in BOTH can: at the
 * arrival the cursor is in the current frame and was not in the previous one,
 * so the current frame is the high-contrast one. At the departure it is the
 * other way round. The difference between the two is signed, and its sign IS
 * the answer.
 */
function arrivalOf(gray, before, b, w) {
  let lo = 255;
  let hi = 0;
  let plo = 255;
  let phi = 0;
  for (let y = b.by0; y <= b.by1; y++) {
    for (let x = b.bx0; x <= b.bx1; x++) {
      const i = y * w + x;
      const v = gray[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
      const p = before[i];
      if (p < plo) plo = p;
      if (p > phi) phi = p;
    }
  }
  const contrast = hi - lo;
  return { contrast, arrival: contrast - (phi - plo) };
}

function findCursor(mask, gray, before, changed) {
  const N = W * H;
  const maxArea = Math.max(24, Math.floor(N * MAX_BLOB));

  let best = null;

  for (const b of componentsOf(mask, W, H, changed, maxArea, MAX_COMPONENTS)) {
    if (b.tooBig || b.area < MIN_BLOB) continue;

    const { bx0, by0, bx1, by1, bw, bh } = b;
    // A cursor is compact. A patch four times wider than it is tall is a menu
    // opening or a row highlighting, not a pointer.
    if (bw > bh * 4 || bh > bw * 5) continue;

    // Positive where the cursor arrived, negative where it left. See arrivalOf.
    const { contrast, arrival } = arrivalOf(gray, before, b, W);

    // A patch that clearly LOST contrast is the hole, whatever else it scores.
    if (arrival < -12) continue;

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

    // Arrival dominates; raw contrast only separates two candidates that both
    // look like arrivals.
    const score = (arrival * 3 + contrast) * near;
    if (!best || score > best.score) {
      best = { bx0, by0, bx1, by1, bw, bh, area: b.area, contrast, arrival, score };
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

  /**
   * ── HOW FAR IT IS ALLOWED TO HAVE MOVED ───────────────────────────────────
   * This was 40 rows. The frames are downscaled so the long side is 960, which
   * makes a 16:9 recording 540 rows high, so 40 rows is 7.4% of the picture —
   * about 1.8 screens a second at 24Hz.
   *
   * Nobody scrolls that politely. A wheel flick, a Page Down, and above all
   * dragging the scrollbar to the bottom of a page all move further than that
   * in a single frame, and when they do this loop returns whichever offset
   * inside the range fit least badly — which, for two pictures that genuinely
   * do not line up, is arbitrary and often zero. The signal did not degrade
   * gracefully; it inverted. The faster the page scrolled, the more confidently
   * it reported that the page had not scrolled, and every rule that reads `dy`
   * to veto a scroll was reading a number that meant the opposite of what it
   * said. That is how a demo zoomed in on somebody dragging a scrollbar.
   *
   * A quarter of the frame covers a hard flick, and the loop is a row profile
   * of 540 floats stepped by two — the extra offsets cost microseconds.
   */
  const MAX = Math.max(40, Math.floor(H / 4));
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

/* ────────────────────────────────────────────────────────────────────────────
   The pointer at its real size
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The full-resolution patch cut around the pointer, read.
 *
 * ── WHY IT NEEDS TWO FRAMES AT THE SAME ORIGIN ───────────────────────────────
 * The glyph is found the same way it is found in the whole frame: by what
 * changed. That needs a previous patch to compare against, and comparing two
 * patches cut from different places would report the entire picture as changed.
 * So the caller snaps the patch origin to a grid and this refuses the frame
 * where the origin moves. A pointer crossing a grid line costs one sample out
 * of twenty-four a second, and the alternative — registering two offset patches
 * against each other — is arithmetic that can be wrong rather than a frame that
 * is merely missing.
 */
function readPatch({ patch, patchData, patchW, patchH, at, vw, vh }) {
  if (!at || !(vw > 0) || !(vh > 0)) return null;

  let gray;
  if (patch) {
    if (!pCanvas || pW !== patch.width || pH !== patch.height) {
      pW = patch.width;
      pH = patch.height;
      pCanvas = new OffscreenCanvas(pW, pH);
      pCtx = pCanvas.getContext("2d", { willReadFrequently: true });
      pPrev = null;
    }
    pCtx.drawImage(patch, 0, 0);
    gray = luma(pCtx.getImageData(0, 0, pW, pH).data, pW, pH);
  } else if (patchData) {
    if (pW !== patchW || pH !== patchH) {
      pW = patchW;
      pH = patchH;
      pPrev = null;
    }
    gray = luma(patchData, pW, pH);
  } else {
    return null;
  }

  const before = pPrev;
  const moved = !pAt || pAt.x !== at.x || pAt.y !== at.y;
  pPrev = gray;
  pAt = at;
  if (moved || !before || before.length !== gray.length) return null;

  const g = measurePatch(gray, before, pW, pH);
  if (!g) return null;

  return {
    // Normalised against the WHOLE frame, so this is a drop-in replacement for
    // the coarse sighting rather than a second coordinate system.
    x: (at.x + g.px) / vw,
    y: (at.y + g.py) / vh,
    // ...and these are the point of the exercise: the pointer's own size and
    // design, in original pixels, measured before any encoder saw them.
    h: g.h,
    w: g.w,
    design: g.design,
    split: g.split,
    shape: g.shape,
    conf: g.conf,
  };
}

/**
 * Two consecutive full-resolution patches, in, and a measurement of the pointer
 * that moved between them, out.
 *
 * Split out from readPatch because it is the part with an answer that can be
 * checked: backend/scripts/pointerTest/glyph.mjs composites real Windows and
 * macOS cursors at known sizes over known backgrounds and asks this what they
 * are. The rest of readPatch is canvases and message plumbing.
 */
function measurePatch(gray, before, w, h) {
  const N = w * h;
  const mask = new Uint8Array(N);
  let changed = 0;
  for (let i = 0; i < N; i++) {
    const d = gray[i] - before[i];
    if (d > DIFF || d < -DIFF) {
      mask[i] = 1;
      changed++;
    }
  }
  // A patch this busy is a repaint that happened to include the pointer.
  if (!changed || changed > N * BUSY) return null;
  return readGlyph(mask, gray, before, changed, w, h);
}

/**
 * Measure the cursor in a full-resolution patch.
 *
 * Pure, and deliberately so: it is the one piece of this file whose answer can
 * be checked against a known truth, and backend/scripts/pointerTest/glyph.mjs
 * does exactly that by compositing real Windows and macOS cursors at known
 * sizes and asking what this says they are.
 *
 * ── WHAT "DESIGN" MEANS AND HOW IT IS READ ───────────────────────────────────
 * Windows draws a white arrow inside a one-pixel black rim; macOS draws a black
 * one inside a white rim. Which is which cannot be read from brightness — a
 * white arrow is bright on any page — but it can be read from the RELATION
 * between the glyph's inside and its edge, which is a property of the cursor
 * and not of whatever it happens to be sitting on.
 *
 * That rim is one pixel wide. At the downscaled size the tracker normally works
 * at it does not survive the resampling, and in the uploaded video it does not
 * survive H.264. Here it does, which is the whole reason this patch is cut.
 */
function readGlyph(mask, gray, before, changed, w, h) {
  const maxArea = GLYPH_MAX_H * GLYPH_MAX_H;
  let best = null;

  for (const b of componentsOf(mask, w, h, changed, maxArea, 256)) {
    if (b.tooBig || b.area < GLYPH_MIN_AREA) continue;
    if (b.bh < GLYPH_MIN_H || b.bh > GLYPH_MAX_H) continue;
    if (b.bw < 5 || b.bw > GLYPH_MAX_H) continue;
    /**
     * An arrow is about one and a half times as tall as it is wide and a hand
     * about square. Anything flatter is a row highlighting; anything thinner is
     * a text caret, which has no rim to measure and would answer at random.
     */
    if (b.bh < b.bw * 0.8 || b.bh > b.bw * 2.8) continue;
    /**
     * Something has to be inside the box. How much is judged after the glyph
     * has been closed up in toneOf — a white arrow on a white page changes only
     * along its rim and is almost empty until then — so this is only here to
     * drop the obvious debris before the more expensive test.
     */
    if (b.area < b.bw * b.bh * 0.12) continue;

    const { contrast, arrival } = arrivalOf(gray, before, b, w);
    // Only arrivals. The hole holds the background, and measuring the
    // background's rim would answer a question about the page.
    if (arrival < 8 || contrast < 50) continue;

    const score = arrival * 3 + contrast;
    if (!best || score > best.score) best = { b, contrast, score };
  }

  if (!best) return null;

  const body = toneOf(mask, gray, best.b, w, h);
  if (!body || Math.abs(body.split) < GLYPH_MIN_SPLIT) return null;

  const { bx0, by0, bx1, bw, bh } = best.b;
  /**
   * ── AND NOW THE TEST THAT NEEDED THE GLYPH CLOSED UP ──────────────────────
   * A pointer that moved less than its own width leaves an arrival still joined
   * to the hole it came from, and that smear measures taller and thinner than
   * the glyph really is. Both a smear and a bare rim are sparse; the difference
   * is that a rim ENCLOSES its body, so closing it up fills it out and closing
   * up a smear does not. This is that difference, measured.
   */
  const fill = body.area / (bw * bh);
  if (fill < GLYPH_MIN_FILL) return null;

  // The hotspot, as in findCursor: the tip for an arrow, the fingertip for a
  // hand. The middle of the picture is not where the pointer points.
  const dense = fill > 0.62;
  return {
    px: dense ? (bx0 + bx1) / 2 : bx0,
    py: by0,
    // Plus the rim, where the rim was the same colour as what was under it and
    // so never showed up as a change at all. See toneOf.
    h: bh + body.grow,
    w: bw + body.grow,
    shape: dense ? "pointer" : "default",
    design: body.split > 0 ? "light" : "dark",
    split: Math.round(body.split),
    conf: Math.max(0.4, Math.min(1, best.contrast / 140)),
  };
}

/**
 * Which is the body and which is the rim, and how much glyph there is.
 *
 * ── THE MASK IS NOT THE GLYPH ────────────────────────────────────────────────
 * The mask holds what CHANGED, and a cursor is two tones about 250 apart, so
 * whichever of them happens to match what was underneath does not change and is
 * simply absent:
 *
 *   white arrow, white page   only the rim changed; the body is a hole in it
 *   black arrow, white page   only the body changed; the rim is not there at all
 *   either one, busy page     both changed, which is the easy case
 *
 * Reading the mask literally answers the first two wrongly — and those are not
 * edge cases, they are a Windows cursor and a macOS cursor on an ordinary web
 * page. So the footprint is closed up first, and the comparison is made between
 * what is INSIDE it and a ring around its edge, which catches the rim in both
 * directions.
 */
function toneOf(mask, gray, b, w, h) {
  const PAD = 2;
  const gw = b.bw + PAD * 2;
  const gh = b.bh + PAD * 2;

  const f = new Uint8Array(gw * gh);
  for (let y = 0; y < b.bh; y++) {
    for (let x = 0; x < b.bw; x++) {
      if (mask[(b.by0 + y) * w + (b.bx0 + x)]) f[(y + PAD) * gw + (x + PAD)] = 1;
    }
  }

  /**
   * ── THE PART OF THE GLYPH THAT DID NOT CHANGE IS STILL THE GLYPH ──────────
   * A white arrow on a white page changes only along its black rim, and the
   * body inside it is not in the mask at all — the pixels were white before and
   * they are white now. Read literally, that arrow is a thin outline with
   * nothing inside, and the first version of this measured the outline against
   * itself and reported nothing for the single most common case there is: a
   * Windows cursor on a web page.
   *
   * Anything the rim encloses is glyph, whether or not it changed. Filling from
   * the border outwards finds it: what the flood cannot reach is enclosed.
   */
  const outside = new Uint8Array(gw * gh);
  const stack = [];
  for (let x = 0; x < gw; x++) stack.push(x, (gh - 1) * gw + x);
  for (let y = 0; y < gh; y++) stack.push(y * gw, y * gw + gw - 1);
  while (stack.length) {
    const p = stack.pop();
    if (outside[p] || f[p]) continue;
    outside[p] = 1;
    const y = (p / gw) | 0;
    const x = p - y * gw;
    if (x > 0) stack.push(p - 1);
    if (x < gw - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - gw);
    if (y < gh - 1) stack.push(p + gw);
  }
  for (let i = 0; i < f.length; i++) if (!outside[i]) f[i] = 1;

  /**
   * ── INSIDE AGAINST THE RING AROUND THE EDGE ───────────────────────────────
   * Inside is the body and nothing else. The ring is the glyph's own boundary
   * together with the pixel just outside it, so it always contains the rim —
   * whether the rim showed up in the mask or not, which is the other half of
   * the problem: a black arrow on a white page changes across its whole body
   * and not at all along its white rim, so that rim is outside the footprint
   * rather than inside it.
   *
   * The background is in the ring too, and cannot overturn it. Body and rim are
   * drawn at opposite ends of the scale, about 250 apart, and the background is
   * at most half the ring — so it can halve the margin and not reverse its
   * sign.
   */
  let inSum = 0;
  let inN = 0;
  let edgeSum = 0;
  let edgeN = 0;
  let outSum = 0;
  let outN = 0;
  let area = 0;
  for (let y = 1; y < gh - 1; y++) {
    for (let x = 1; x < gw - 1; x++) {
      const p = y * gw + x;
      if (f[p]) area++;
      const sx = b.bx0 + x - PAD;
      const sy = b.by0 + y - PAD;
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const v = gray[sy * w + sx];
      const touches = f[p - 1] || f[p + 1] || f[p - gw] || f[p + gw];
      if (f[p]) {
        if (f[p - 1] && f[p + 1] && f[p - gw] && f[p + gw]) {
          inSum += v;
          inN++;
        } else {
          edgeSum += v;
          edgeN++;
        }
      } else if (touches) {
        outSum += v;
        outN++;
      }
    }
  }
  if (inN < 8 || edgeN < 8 || outN < 8) return null;

  const inner = inSum / inN;
  const edge = edgeSum / edgeN;
  const out = outSum / outN;

  /**
   * ── AND WHETHER THE RIM IS INSIDE THE FOOTPRINT OR OUTSIDE IT ─────────────
   * When the rim is the part that changed, it is the footprint's own edge and
   * the glyph has been measured whole. When the BODY is the part that changed,
   * the rim never entered the mask and the footprint is the body alone — one
   * pixel short all the way round, so the glyph reads two pixels shorter than
   * it is. Left uncorrected that was a consistent three-pixel error on a white
   * cursor over a dark page and a black one over a light page, which is half
   * the recordings there are.
   *
   * Which of the two it is can be read off the footprint's own edge: if that
   * edge is the rim it looks nothing like the body beside it, and if it is the
   * body's outermost row it looks exactly like it.
   */
  const rimOutside = Math.abs(edge - inner) < Math.abs(out - edge) / 2;

  return {
    // Body against everything around it — the edge and the pixel beyond it —
    // so the rim is in the comparison whichever side of the footprint it fell.
    split: inner - (edgeSum + outSum) / (edgeN + outN),
    grow: rimOutside ? 2 : 0,
    area,
    inN,
  };
}

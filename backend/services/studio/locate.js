/**
 * locate.js: finding the pointer by what it looks like, in every frame.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * Everything before this found the pointer by what CHANGED between two frames.
 * That has three blind spots, and every cursor bug a creator reported came out
 * of one of them:
 *
 *   still     a pointer that is not moving makes no change, so it is not seen;
 *             a demo that starts with the mouse parked on a menu has no pointer
 *             until it first moves, and the real one shows on its own
 *   crowded   while the page scrolls, repaints or spins, the page changes far
 *             more than a small hand does, and the tracker reports the page
 *   blurred   the hotspot is guessed from a patch of difference, which is the
 *             union of where the pointer was and where it is — a few pixels off
 *             at rest, and enough for the real cursor to show beside ours
 *
 * The operating system draws its pointer on top of everything, the same way
 * every time: the same outline, the same size, the same two tones. So instead
 * of asking "what moved?", this asks, in every frame, "where is the thing that
 * looks exactly like a pointer?" — and gets an answer while the pointer is
 * still, while the page scrolls under it, and to the pixel.
 *
 * ── HOW ──────────────────────────────────────────────────────────────────────
 * Each pointer shape is drawn as a small template at the recording's pointer
 * size and softened the way video compression softens a one-pixel outline. A
 * frame is compared with the template by masked normalised cross-correlation:
 * only the pixels INSIDE the pointer's own outline take part, so the page
 * behind it is irrelevant, and the score measures the pattern (a bright body
 * inside a dark rim, or the reverse) rather than any absolute brightness.
 *
 * Searching every position of a 1920 × 1020 frame for every shape would be too
 * slow, so a handful of the template's most telling pixels are checked first —
 * deep inside the body must be brighter than points on the rim — and only
 * positions that pass get the full comparison. Most frames need no global
 * search at all: the pointer is looked for first where it was a frame ago.
 *
 * ── WHAT IT RETURNS ──────────────────────────────────────────────────────────
 * One sample per frame it found the pointer in: the hotspot (arrow tip or
 * fingertip), the shape, and the score. Frames it could not find the pointer in
 * are left out, and the caller falls back to the difference tracker there.
 */
import { createCanvas } from "@napi-rs/canvas";
import { ffmpegToFrames } from "../media/ffmpeg.js";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round4 = (v) => Math.round(v * 10000) / 10000;
const round3 = (v) => Math.round(v * 1000) / 1000;

/* ────────────────────────────────────────────────────────────────────────────
   The shapes
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Outlines relative to the hotspot, in units of the pointer's height.
 *
 * Measured from a real Windows recording at 1920 wide: the arrow is 18 pixels
 * tall with its tip at the hotspot; the hand's hotspot is the top of the index
 * finger. macOS draws the same two ideas dark on light, which is handled by
 * inverting the template rather than by more outlines.
 */
const SHAPES = {
  /**
   * Outlines traced row by row from the system pointers at their base size,
   * as OUTER boundaries of the one-pixel rim, in units of each shape's own
   * height. The hand is taller than the arrow in the same set, but not by a
   * fixed ratio — each size is drawn by hand, and measured it is 1.26x at the
   * base size, 1.19x at 150% and 1.21x at 200% — so its height is searched
   * rather than assumed. See HAND_RATIOS.
   */
  arrow: {
    shape: "default",
    poly: [
      [0, 0], [0.05, 0], [0.63, 0.58], [0.63, 0.63], [0.42, 0.68], [0.47, 0.74], [0.5, 0.79],
      [0.53, 0.84], [0.53, 0.89], [0.5, 0.95], [0.45, 1.0], [0.37, 1.0], [0.32, 0.89], [0.26, 0.79],
      [0.21, 0.68], [0.16, 0.74], [0.11, 0.82], [0.05, 0.89], [0, 0.89],
    ],
  },
  hand: {
    shape: "pointer",
    poly: [
      [-0.042, 0], [0.125, 0], [0.125, 0.208], [0.25, 0.208], [0.25, 0.25], [0.375, 0.25],
      [0.375, 0.292], [0.5, 0.292], [0.5, 0.833], [0.458, 0.917], [0.375, 0.958], [0.333, 1.0],
      [0.083, 1.0], [0, 0.958], [-0.042, 0.917], [-0.083, 0.875], [-0.125, 0.813], [-0.167, 0.75],
      [-0.208, 0.708], [-0.25, 0.667], [-0.25, 0.521], [-0.208, 0.5], [-0.125, 0.5], [-0.083, 0.542],
      [-0.042, 0.542],
    ],
    // Dark lines INSIDE the outline: the index finger's edge running on past
    // the knuckles, and the gaps between the curled fingers. Without them a real
    // hand scored 0.59 against its own template.
    lines: [[0.104, 0.208, 0.104, 0.458], [0.229, 0.29, 0.229, 0.458], [0.354, 0.29, 0.354, 0.458]],
  },
  /**
   * The same hand as drawn for the larger sizes (150% and up). A pointer set
   * ships a separate picture per size rather than scaling one, and the large
   * hand is proportioned differently: the finger is centred on the hotspot and
   * longer before the knuckles, which sit lower, and the thumb reaches further.
   * Scaling the small outline up missed a fifth of the frames at 150%.
   */
  handL: {
    shape: "pointer",
    poly: [
      [-0.063, 0], [0.094, 0], [0.094, 0.25], [0.219, 0.25], [0.219, 0.281], [0.344, 0.281],
      [0.344, 0.328], [0.469, 0.328], [0.469, 0.78], [0.44, 0.84], [0.41, 0.88], [0.34, 0.94],
      [0.25, 0.98], [0.06, 1.0], [0, 0.95], [-0.06, 0.91], [-0.13, 0.84], [-0.19, 0.78],
      [-0.25, 0.69], [-0.28, 0.63], [-0.31, 0.6], [-0.31, 0.5], [-0.16, 0.5], [-0.063, 0.56],
    ],
    lines: [[0.078, 0.25, 0.078, 0.45], [0.203, 0.28, 0.203, 0.45], [0.328, 0.31, 0.328, 0.45]],
  },

  /* ──────────────────────────────────────────────────────────────────────────
     The resize pointers
     ──────────────────────────────────────────────────────────────────────────

     ── WHY THEY ARE HERE AND THE TEXT CARET IS NOT ───────────────────────────
     These four are drawn the same way the arrow and the hand are — a light body
     inside a one-pixel dark rim — so the comparison this file is built on works
     on them unchanged. Traced from C:/Windows/Cursors at the 32px set, where
     the arrow's own glyph is 18 coordinate units tall, which is what RESIZE
     below is measured against.

     The text caret is NOT here, and cannot be. It is the old two-colour cursor:
     a bar two pixels wide with no rim and no interior, whose tone comes from
     INVERTING whatever is behind it. Built as a template it comes out a single
     flat grey — measured, one distinct level against the arrow's 46, and a
     norm of 0.76 against the arrow's 1183 — so there is no pattern to correlate
     and matching it would be matching noise. Finding the caret needs a
     different instrument, not another outline.

     ── WHAT THEY ARE FOR ─────────────────────────────────────────────────────
     Not clicks. Nobody presses a button with a resize pointer. They are here so
     the pointer is not LOST while somebody drags a column edge or a panel
     splitter — frames where the arrow and hand templates find nothing, the
     track goes quiet, and everything downstream that reads the track reasons
     about a pointer that was plainly on screen the whole time.

     Their shape is reported as "resize" so that confirmClicks() treats it as
     what it is: a pointer doing something other than pressing.
     ────────────────────────────────────────────────────────────────────────── */

  /** Horizontal double arrow: 23 x 9 at the 32px set, hotspot at its centre. */
  ew: {
    shape: "resize",
    poly: [
      [-1.375, 0], [-0.75, -0.5], [-0.75, -0.125], [0.75, -0.125], [0.75, -0.5],
      [1.375, 0], [0.75, 0.5], [0.75, 0.125], [-0.75, 0.125], [-0.75, 0.5],
    ],
  },
  /** The same, upright: 9 x 23. */
  ns: {
    shape: "resize",
    poly: [
      [0, -0.5], [0.182, -0.273], [0.045, -0.273], [0.045, 0.273], [0.182, 0.273],
      [0, 0.5], [-0.182, 0.273], [-0.045, 0.273], [-0.045, -0.273], [-0.182, -0.273],
    ],
  },
  /**
   * The corner pair: two right-angled heads joined by a diagonal shaft, 17 x 17.
   * One traced and one mirrored, because that is exactly how the system draws
   * the second from the first.
   */
  nwse: {
    shape: "resize",
    poly: [
      [-0.5, -0.5], [-0.125, -0.5], [-0.266, -0.359], [0.359, 0.266], [0.5, 0.125],
      [0.5, 0.5], [0.125, 0.5], [0.266, 0.359], [-0.359, -0.266], [-0.5, -0.125],
    ],
  },
  nesw: {
    shape: "resize",
    poly: [
      [0.5, -0.5], [0.125, -0.5], [0.266, -0.359], [-0.359, 0.266], [-0.5, 0.125],
      [-0.5, 0.5], [-0.125, 0.5], [-0.266, 0.359], [0.359, -0.266], [0.5, -0.125],
    ],
  },
};

/**
 * Each resize outline's own height against the arrow's, at the same pointer
 * size. Measured on the 32px Windows set, where the arrow spans 18 coordinate
 * units: the flat double arrow spans 8, the upright one 22, the corner pair 16.
 */
const RESIZE = { ew: 8 / 18, ns: 22 / 18, nwse: 16 / 18, nesw: 16 / 18 };


/**
 * A template: the pixels inside the pointer's outline, each with how bright it
 * should be relative to the others. Rendered large and scaled down so the rim
 * comes out soft, as it does in a compressed video.
 */
function buildTemplate(name, heightPx, { dark = false, setPx = heightPx } = {}) {
  const def = SHAPES[name];
  const SS = 4;
  const xs = def.poly.map((p) => p[0]);
  const ys = def.poly.map((p) => p[1]);
  const pad = 2;
  const minX = Math.floor(Math.min(...xs) * heightPx) - pad;
  const minY = Math.floor(Math.min(...ys) * heightPx) - pad;
  const maxX = Math.ceil(Math.max(...xs) * heightPx) + pad;
  const maxY = Math.ceil(Math.max(...ys) * heightPx) + pad;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;

  const c = createCanvas(w * SS, h * SS);
  const g = c.getContext("2d");
  g.scale(SS, SS);
  g.translate(-minX, -minY);
  g.beginPath();
  def.poly.forEach(([x, y], i) => (i ? g.lineTo(x * heightPx, y * heightPx) : g.moveTo(x * heightPx, y * heightPx)));
  g.closePath();
  // The rim: a one-pixel outline, drawn INSIDE the shape so the template never
  // claims anything about the page around the pointer.
  g.save();
  g.clip();
  g.fillStyle = dark ? "#000" : "#fff";
  g.fill();
  g.lineWidth = 2.2;
  g.strokeStyle = dark ? "#fff" : "#000";
  g.stroke();
  for (const [x1, y1, x2, y2] of def.lines || []) {
    g.beginPath();
    g.moveTo(x1 * heightPx, y1 * heightPx);
    g.lineTo(x2 * heightPx, y2 * heightPx);
    g.lineWidth = 1.1;
    g.stroke();
  }
  g.restore();

  const img = g.getImageData(0, 0, w * SS, h * SS).data;
  const off = [];
  const val = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a = 0;
      let l = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * w * SS + (x * SS + sx)) * 4;
          a += img[i + 3];
          l += img[i] * img[i + 3];
        }
      }
      // Pixels mostly inside the outline take part; the anti-aliased edge,
      // which is half page and half pointer, does not.
      if (a / (SS * SS) < 200) continue;
      off.push([x + minX, y + minY]);
      val.push(l / a);
    }
  }

  // Mean-centre and normalise once, so a comparison is one pass of sums.
  const n = val.length;
  const mean = val.reduce((s, v) => s + v, 0) / n;
  const cen = val.map((v) => v - mean);
  const norm = Math.sqrt(cen.reduce((s, v) => s + v * v, 0));

  /**
   * ── THE QUICK CHECK MUST NOT DEPEND ON ONE PIXEL ───────────────────────────
   * It used to take the five darkest template pixels and require every one of
   * them darker than the five brightest. The darkest turned out to sit on the
   * hand's one-pixel finger gaps, and half a pixel of compression drift put
   * two of them on the bright body instead: a real hand, correlating at 0.79,
   * was thrown out before it was ever scored.
   *
   * Now the dark samples come from the OUTER rim only, spread around it, and
   * the bright ones from deep in the body, away from every edge; and it is
   * their averages that are compared. One sample landing on the wrong side of
   * a line moves an average by an eighth, not the verdict.
   */
  const inSet = new Set(off.map(([x, y]) => x + "," + y));
  const edge = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !inSet.has(x + a + "," + (y + b)));
  const deep = (x, y) => {
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (!inSet.has(x + a + "," + (y + b))) return false;
    return true;
  };
  const cx = off.reduce((a, p) => a + p[0], 0) / n;
  const cy = off.reduce((a, p) => a + p[1], 0) / n;
  const around = (list) => list.sort((a, b) => Math.atan2(off[a][1] - cy, off[a][0] - cx) - Math.atan2(off[b][1] - cy, off[b][0] - cx));
  const spread = (list, k) => (list.length <= k ? list : Array.from({ length: k }, (_, j) => list[Math.floor((j * list.length) / k)]));
  const rim = around(off.map((p, i) => i).filter((i) => cen[i] < 0 && edge(off[i][0], off[i][1])));
  const body = around(off.map((p, i) => i).filter((i) => cen[i] > 0 && deep(off[i][0], off[i][1]) && cen.every((_, j) => true)));
  const lo = spread(rim, 8);
  const hi = spread(body.length ? body : off.map((p, i) => i).filter((i) => cen[i] > 0), 8);

  /**
   * ── THE COARSE FORM ────────────────────────────────────────────────────────
   * The exact comparison peaks on a single pixel — one pixel off, the thin rim
   * lands on the page and the score collapses — so a scan on every second
   * pixel could not see a pointer standing on an odd coordinate at all. The
   * coarse scan therefore uses a test that survives a pixel of error: the
   * pointer's CORE, two pixels in from every edge, against a BAND about three
   * pixels wide straddling the outline. Off by one, the core is still inside
   * the body and the band still holds the dark rim, so the contrast is still
   * there; a box or a line of text does not have it in the shape of a pointer.
   */
  const dist = new Map();
  for (const [x, y] of off) {
    let d = 0;
    while (d < 3) {
      let ok = true;
      for (let a = -(d + 1); a <= d + 1 && ok; a++) for (let b = -(d + 1); b <= d + 1 && ok; b++) if (!inSet.has(x + a + "," + (y + b))) ok = false;
      if (!ok) break;
      d++;
    }
    dist.set(x + "," + y, d);
  }
  const coreAll = off.filter(([x, y]) => dist.get(x + "," + y) >= 2);
  const bandAll = [];
  const minX2 = Math.min(...off.map((p) => p[0])) - 2;
  const maxX2 = Math.max(...off.map((p) => p[0])) + 2;
  const minY2 = Math.min(...off.map((p) => p[1])) - 2;
  const maxY2 = Math.max(...off.map((p) => p[1])) + 2;
  for (let y = minY2; y <= maxY2; y++) {
    for (let x = minX2; x <= maxX2; x++) {
      const inside = inSet.has(x + "," + y);
      const d = inside ? dist.get(x + "," + y) : -1;
      let nearEdge = false;
      if (!inside) for (let a = -1; a <= 1 && !nearEdge; a++) for (let b = -1; b <= 1 && !nearEdge; b++) if (inSet.has(x + a + "," + (y + b))) nearEdge = true;
      if ((inside && d === 0) || nearEdge) bandAll.push([x, y]);
    }
  }
  const pick = (list, k) => (list.length <= k ? list : Array.from({ length: k }, (_, j) => list[Math.floor((j * list.length) / k)]));
  const core = pick(coreAll.length ? coreAll : off, 10);
  const band = pick(bandAll, 20);

  return { name, shape: def.shape, dark, heightPx: setPx, ownPx: heightPx, off, cen, norm, n, lo, hi, core, band };
}

/* ────────────────────────────────────────────────────────────────────────────
   Comparing
   ──────────────────────────────────────────────────────────────────────────── */

/** The hand's height against the arrow's, across the sizes a system ships. */
const HAND_RATIOS = [1.16, 1.21, 1.26, 1.31];

/** Minimum score to call it the pointer. Validated against real recordings. */
const FOUND = 0.72;
/** The quick check: the body must beat the rim by this much, in grey levels. */
const QUICK = 18;

function prepare(tpl, W) {
  return {
    ...tpl,
    idx: Int32Array.from(tpl.off.map(([dx, dy]) => dy * W + dx)),
    coreIdx: Int32Array.from(tpl.core.map(([dx, dy]) => dy * W + dx)),
    bandIdx: Int32Array.from(tpl.band.map(([dx, dy]) => dy * W + dx)),
    W,
  };
}

/** Pixels between coarse samples; the core/band test tolerates this much error. */
const COARSE_STEP = 3;

/** Grey levels of core-over-band contrast that make a coarse candidate. */
const COARSE = 22;


/**
 * The coarse test: how pointer-shaped is this patch, in grey levels of
 * core-over-band contrast? Below the bar returns -1.
 *
 * Returns a STRENGTH rather than a boolean so the candidates can be ranked. A
 * boolean is enough to filter and useless for deciding which to keep when there
 * are far too many, which is the case this has to survive.
 */
function coarseAt(frame, W, H, t, x, y) {
  if (x + t._minDx - 2 < 0 || y + t._minDy - 2 < 0 || x + t._maxDx + 2 >= W || y + t._maxDy + 2 >= H) return false;
  const base = y * W + x;
  let c = 0;
  for (let k = 0; k < t.coreIdx.length; k++) c += frame[base + t.coreIdx[k]];
  let b = 0;
  for (let k = 0; k < t.bandIdx.length; k++) b += frame[base + t.bandIdx[k]];
  const diff = c / t.coreIdx.length - b / t.bandIdx.length;
  return t.dark ? diff <= -COARSE : diff >= COARSE;
}

/** Masked normalised cross-correlation at one hotspot position. */
function scoreAt(frame, W, H, t, x, y) {
  const minDx = t._minDx, maxDx = t._maxDx, minDy = t._minDy, maxDy = t._maxDy;
  if (x + minDx < 0 || y + minDy < 0 || x + maxDx >= W || y + maxDy >= H) return -1;
  const base = y * W + x;

  // Quick check first: the body, on average, clearly brighter than the rim
  // (or darker, for a dark pointer — the template's own values say which).
  let hiSum = 0;
  for (const i of t.hi) hiSum += frame[base + t.idx[i]];
  let loSum = 0;
  for (const i of t.lo) loSum += frame[base + t.idx[i]];
  if (hiSum / t.hi.length - loSum / t.lo.length < QUICK) return -1;

  let s = 0;
  let s2 = 0;
  let sm = 0;
  const idx = t.idx;
  const cen = t.cen;
  for (let k = 0; k < t.n; k++) {
    const v = frame[base + idx[k]];
    s += v;
    s2 += v * v;
    sm += v * cen[k];
  }
  const varP = s2 - (s * s) / t.n;
  if (varP < 1e-6) return -1;
  return sm / (t.norm * Math.sqrt(varP));
}

function bounds(t) {
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  for (const [dx, dy] of t.off) { a = Math.min(a, dx); b = Math.max(b, dx); c = Math.min(c, dy); d = Math.max(d, dy); }
  t._minDx = a; t._maxDx = b; t._minDy = c; t._maxDy = d;
  return t;
}

/** The best match for any template inside a rectangle of hotspot positions. */
function search(frame, W, H, tpls, x0, y0, x1, y1, step = 1) {
  let best = null;
  x0 = clamp(Math.floor(x0), 0, W - 1); x1 = clamp(Math.ceil(x1), 0, W - 1);
  y0 = clamp(Math.floor(y0), 0, H - 1); y1 = clamp(Math.ceil(y1), 0, H - 1);
  for (const t of tpls) {
    for (let y = y0; y <= y1; y += step) {
      for (let x = x0; x <= x1; x += step) {
        const sc = scoreAt(frame, W, H, t, x, y);
        if (sc > (best ? best.score : FOUND * 0.85)) best = { x, y, score: sc, t };
      }
    }
  }
  // A coarse hit is refined to the exact pixel around it.
  if (best && step > 1) {
    const r = search(frame, W, H, [best.t], best.x - step, best.y - step, best.x + step, best.y + step, 1);
    if (r && r.score >= best.score) best = r;
  }
  return best;
}

/* ────────────────────────────────────────────────────────────────────────────
   The recording
   ──────────────────────────────────────────────────────────────────────────── */

/** Pixels a pointer can move between two frames and still be looked for locally. */
const NEAR = 70;
/** Longest recording the locator will read frame by frame. */
const MAX_SECONDS = 180;

/** The softer bar, for a frame or two after a sure sighting. */
const FLICK = 0.6;
/** Pixels a hand can move a pointer between two frames of a fast flick. */
const THROW = 320;
/** Frames sampled across the recording to decide which pointer it has. */
const CAL_FRAMES = 12;

/**
 * The arrow's own glyph height, in CSS pixels, at 100% display scaling.
 *
 * Measured off the Windows set: the pointer IMAGE is 32 x 32, and the arrow
 * drawn inside it spans 19 rows. macOS draws its arrow to within a pixel of the
 * same, which is why one number serves both. It is a starting point and not a
 * claim — every size within 25% below and 30% above is tried around it.
 */
const GLYPH_CSS = 19;
/**
 * How clearly the best match must beat the next best somewhere else in the
 * frame. This is what separates a pointer from the page: there is one pointer,
 * and it matches its template far better than anything else on screen, while a
 * template that is matching TEXT finds dozens of glyphs that fit it about
 * equally well. Measured on a real recording: the right template scored 0.815
 * on the pointer and 0.546 on the best thing anywhere else; the wrong one
 * scored 0.79 on a letter and nearly as well on others.
 */
const UNIQUE = 0.12;

/**
 * Best and second-best (at least a pointer's width apart) over the whole frame.
 *
 * ── COARSE, THEN EXACT ───────────────────────────────────────────────────────
 * The comparison peaks on ONE pixel: a pointer's outline one pixel off its own
 * edge scores well below the same outline on it. So a scan of every second
 * pixel lands beside the peak about half the time, and the first version of
 * this missed a real pointer that scored 0.866 at its exact position because
 * the coarse grid only saw 0.7. The grid is used to find CANDIDATES, at a lower
 * bar, and each candidate is re-scored at every pixel around it before any
 * decision is made on the numbers.
 */
function topTwo(frame, W, H, t) {
  const sep = Math.max(20, t.heightPx * 1.5);
  // Coarse: every third pixel, with the test that tolerates a pixel of error.
  const hits = [];
  for (let y = 0; y < H; y += COARSE_STEP) {
    for (let x = 0; x < W; x += COARSE_STEP) {
      if (coarseAt(frame, W, H, t, x, y)) hits.push(x, y);
    }
  }

  /**
   * ── EVERY CANDIDATE IS SCORED, AND THAT IS NOT NEGOTIABLE ─────────────────
   * Three ways of scoring fewer of them were tried and all three cost the
   * pointer, so this is written down rather than rediscovered:
   *
   *   a cap of 4000 on the candidate list, keeping the strongest by coarse
   *   contrast. The true pointer was measured at rank 1533 on one frame and
   *   4897 on another — ABOVE the cap — so on a dark, text-dense screen the cap
   *   discards the very thing it is looking for.
   *
   *   scanning the strongest few hundred first and stopping on a sure match.
   *   Identical results on a light UI, and on a dark one it simply arrives at
   *   the same capped set by a longer road.
   *
   *   searching a half-size frame. A cursor IS a one-pixel rim, averaging
   *   destroys it, and a 21px dark pointer located 65 frames out of 376.
   *
   * The lesson in all three: how pointer-like a patch looks at a glance does
   * not rank the real pointer reliably, because a cursor is drawn to be legible
   * against its background and a dark UI is full of high-contrast text. The
   * only thing that separates them is the full correlation — which means
   * running it. Making this cheaper has to come from asking FEWER QUESTIONS
   * (fewer candidate templates, fewer sampled frames) rather than from
   * answering them less carefully.
   */
  const found = [];
  for (let i = 0; i < hits.length; i += 2) {
    const hx = hits[i];
    const hy = hits[i + 1];
    let best = null;
    for (let y = hy - 2; y <= hy + 2; y++) {
      for (let x = hx - 2; x <= hx + 2; x++) {
        const sc = scoreAt(frame, W, H, t, x, y);
        if (sc > (best ? best.score : 0.45)) best = { x, y, score: sc };
      }
    }
    if (!best) continue;
    const near = found.find((c) => Math.abs(c.x - best.x) <= sep && Math.abs(c.y - best.y) <= sep);
    if (near) { if (best.score > near.score) Object.assign(near, best); }
    else found.push(best);
  }
  found.sort((p, q) => q.score - p.score);
  return { best: found[0] || null, second: found[1] || null };
}

/**
 * Which pointer this recording has: the design (light body or dark body) and
 * the size, decided once, from the recording itself.
 *
 * Nothing here is specific to a website or a product. It asks only which of
 * the pointer templates FITS BEST, among those that behave like a pointer
 * rather than like the page — a property of the pointer, which is drawn
 * identically wherever it goes, and not of anything on the page.
 *
 * ── IT HAS TO LOOK FOR THE HAND AS WELL AS THE ARROW ────────────────────────
 * The first version of this offered only arrows, on the reasoning that every
 * recording has an arrow in it somewhere. Most do. The ones that do not are
 * the ones that matter: a demo of a menu, a sidebar, a list of links, where
 * the creator moves from one clickable row to the next and the pointer is a
 * hand nearly the whole time. Twelve frames sampled across such a recording
 * can easily turn up two arrows, one short of the three this needs, and the
 * answer was then "no pointer design recognised" — the locator switched itself
 * off for the whole recording, and the demo fell back to the difference
 * tracker with every bug that entails.
 *
 * Offering both shapes also makes the decision SAFER rather than riskier. The
 * thing this has to avoid mistaking for a pointer is a shape printed on the
 * page, and pages are full of little arrows — play buttons, sort carets,
 * submit chevrons. Almost nothing on a page is shaped like a hand.
 *
 * A hand votes under the arrow height it implies, so both shapes accumulate
 * evidence for the same answer: one design, one size.
 */
async function calibrate(video, W, H, all, duration, fps) {
  const want = new Set();
  const total = Math.max(1, Math.floor(duration * fps));
  for (let k = 0; k < CAL_FRAMES; k++) want.add(Math.floor(((k + 0.5) / CAL_FRAMES) * total));

  /**
   * ── WHAT ONLY A POINTER DOES: IT MOVES ─────────────────────────────────────
   * Being the one clear match in the frame is good evidence, and on a page with
   * arrow-shaped glyphs on it — a play button, a submit chevron, a sort caret —
   * it is not enough on its own. A pointer has a second property nothing
   * printed on the page has: between two moments of a recording it is somewhere
   * else. So each candidate is followed across the sampled frames, and one whose
   * best match wanders is believed over one whose best match never leaves its
   * spot, even if the second scores a little higher in any single frame.
   */
  const votes = new Map();

  /**
   * ── HALF RESOLUTION WAS TRIED HERE AND IT DOES NOT WORK ───────────────────
   * This is the fixed cost of an analysis and it is the biggest single part of
   * a short one: a whole-frame search for every candidate on every sampled
   * frame, about two dozen templates across twelve frames, measured at 28
   * seconds of a 49-second analysis on a 26-second demo. Screening at half
   * resolution made it 7 seconds.
   *
   * It also made it find nothing at all — "calibration found nothing usable",
   * every frame lost. The reason is worth keeping: a cursor is defined by a
   * ONE-PIXEL rim around a body of the opposite tone, and that rim is the
   * entire signal these templates match on. Averaging 2x2 blocks blends the rim
   * into the body, the core-over-band contrast collapses below COARSE, and the
   * coarse filter stops proposing the pointer as a candidate at all.
   *
   * So resolution cannot be traded here, and the same caution applies to the
   * tracking loop below, where halving costs a little accuracy for real speed.
   * Anything cheaper than this has to come from asking FEWER QUESTIONS — fewer
   * candidates or fewer frames — not from asking them of less data.
   */
  await ffmpegToFrames(video, {
    width: W, height: H, fps, pixelFormat: "gray",
    duration,
    onFrame: (frame, i) => {
      if (!want.has(i)) return;
      for (const t of all) {
        const { best, second } = topTwo(frame, W, H, t);
        if (!best || best.score < FOUND) continue;
        const margin = best.score - (second ? second.score : 0.45);
        const key = (t.dark ? "dark" : "light") + ":" + t.heightPx;
        const cur = votes.get(key) || { n: 0, v: 0, unique: 0, at: [] };
        cur.n += 1;
        cur.v += best.score;
        if (margin >= UNIQUE) cur.unique += 1;
        // The shape that matched is kept with the frame: the size is refined
        // below by re-drawing the winner, and re-drawing an arrow over a frame
        // a hand won measures nothing.
        cur.at.push({ frame: Buffer.from(frame), x: best.x, y: best.y, name: t.name, ratio: t.ownPx / t.heightPx });
        votes.set(key, cur);
      }
    },
  });

  const spread = (at) => {
    let d = 0;
    for (let i = 1; i < at.length; i++) d = Math.max(d, Math.hypot(at[i].x - at[0].x, at[i].y - at[0].y));
    return d;
  };
  const offers = [...votes.entries()]
    .map(([k, v]) => [k, { ...v, moves: spread(v.at) >= 25, mean: v.v / v.n }])
    .sort((a, b) => b[1].mean - a[1].mean);
  const describe = (rows) =>
    rows.map(([k, v]) => k + " seen " + v.n + (v.moves ? " moving" : " still") + " clear " + v.unique + " mean " + v.mean.toFixed(3)).join("  |  ");

  const ranked = offers
    /**
     * A candidate has to look like a pointer rather than like the page: either
     * it was somewhere different between frames, which nothing printed on a
     * page ever is, or it was unmistakably the best match in half the frames
     * it appeared in. Noise can manage the first of those, so this is only the
     * gate — the ranking below decides.
     */
    .filter(([, v]) => v.n >= 3 && (v.moves || v.unique >= Math.max(2, v.n * 0.5)))
    /**
     * ── THE POINTER IS THE ONE THE TEMPLATE FITS BEST ────────────────────
     * This used to rank by movement first, then by how many frames a
     * candidate was seen in, and only fall back to the score. Both of those
     * are properties a wrong answer has just as easily as a right one:
     *
     *   moving   a template that fits nothing in particular still finds a
     *            middling match SOMEWHERE in a page of text, and where that
     *            lands changes every frame. It moves as convincingly as a
     *            pointer, for the same reason a broken clock does.
     *   seen     a wrong template matches something in every frame, so it is
     *            seen in all twelve. A real pointer that leaves the window or
     *            is hidden while the creator types is seen in fewer.
     *
     * The score is not like that. It measures how well the pixels under the
     * match actually form a pointer, and on the two recordings that got this
     * wrong the correct answer was top of the list by score both times, and
     * beaten on movement both times:
     *
     *   scaled to 1280:  light 13px scored 0.865 — lost to a dark 10px that
     *                    fitted nothing (0.768) and was never once the clear
     *                    match in a frame. Nothing was found in any frame.
     *   tinted pointer:  light 19px scored 0.806 and was the right answer, on
     *                    a page with sixty arrow glyphs drawn on it where NO
     *                    candidate is ever the clear match.
     *
     * So: best fit first. Movement and uniqueness stay as the filter above —
     * they are what separates a pointer from a glyph printed on the page —
     * but among the candidates that pass, the one that fits best is the one.
     */
    .sort((a, b) => b[1].mean - a[1].mean || b[1].unique - a[1].unique || b[1].n - a[1].n);
  /**
   * What the candidates looked like. Kept in the log because calibration is
   * the one decision in this file that everything else rests on: get the
   * design or the size wrong and every frame after it is wrong too, silently.
   * Reading the top few is how a recording that came out wrong gets diagnosed
   * without re-running anything — and when nothing passed at all, the rejected
   * candidates are the only evidence there is.
   */
  if (!ranked.length) {
    console.log("[studio] pointer calibration found nothing usable. Best offers: " + (describe(offers.slice(0, 3)) || "none"));
    return null;
  }
  console.log("[studio] pointer calibration: " + describe(ranked.slice(0, 3)));
  const [darkKey, hpKey] = ranked[0][0].split(":");
  const dark = darkKey === "dark";

  /**
   * ── THEN TO THE PIXEL ──────────────────────────────────────────────────
   * The sizes tried above are a tenth apart, which finds the right pointer but
   * not always its exact size, and one pixel of height is the difference
   * between the hand matching and not. So the winner is re-measured at every
   * size a couple of pixels either side, on the frames it won, and the size
   * that fits those frames best is the one used.
   */
  const cache = new Map();
  const drawn = (name, hp, ratio) => {
    const key = name + ":" + hp;
    if (!cache.has(key)) {
      cache.set(key, bounds(prepare(buildTemplate(name, Math.max(8, Math.round(hp * ratio)), { dark, setPx: hp }), W)));
    }
    return cache.get(key);
  };
  let best = { hp: Number(hpKey), v: -Infinity };
  for (let hp = Number(hpKey) - 3; hp <= Number(hpKey) + 3; hp++) {
    if (hp < 8) continue;
    let v = 0;
    for (const a of ranked[0][1].at) {
      const t = drawn(a.name, hp, a.ratio);
      let m = -1;
      for (let y = a.y - 3; y <= a.y + 3; y++) for (let x = a.x - 3; x <= a.x + 3; x++) m = Math.max(m, scoreAt(a.frame, W, H, t, x, y));
      v += m;
    }
    if (v > best.v) best = { hp, v };
  }
  return { dark, heightPx: best.hp, votes: ranked[0][1].n, moves: ranked[0][1].moves };
}

/**
 * Find the pointer in every frame of a recording.
 *
 * @param {string} video
 * @param {object} o
 * @param {number} o.sourceWidth
 * @param {number} o.sourceHeight
 * @param {number} o.duration
 * @param {number} [o.fps]       30 matches the export's own frame grid exactly
 * @param {number} [o.cursorPx]  the pointer's measured height, if known
 * @param {Array}  [o.hints]     where the difference tracker thought it was
 * @param {object} [o.env]       the recording machine: platform, dpr, screen_w
 * @returns {Promise<{ track: Array, design: string|null, heightPx: number, found: number, frames: number }>}
 */
export async function locatePointer(video, { sourceWidth, sourceHeight, duration = 0, fps = 30, cursorPx = 0, hints = [], env = null, onDebug = null, onProgress = null } = {}) {
  const W = Math.round(sourceWidth);
  const H = Math.round(sourceHeight);

  /**
   * ── A CEILING, SO A LONG RECORDING IS NOT HELD UP ─────────────────────────
   * Every frame is decoded and searched, which costs roughly a second and a
   * half per second of a 1080p recording on a small server. That is worth it
   * for the demos this is made for and not for a half hour screencast, where
   * it would be most of the wait. Past the ceiling the difference tracker is
   * used on its own, exactly as before this file existed.
   */
  if (duration > MAX_SECONDS) {
    console.log("[studio] recording is " + Math.round(duration) + "s; the pointer locator is skipped past " + MAX_SECONDS + "s");
    return { track: [], design: null, heightPx: 0, found: 0, frames: 0, skipped: "too long" };
  }

  // Sizes around the measured one: an OS picks the pointer's size for the
  // display, and the recording may have been scaled on the way.
  /**
   * ── HOW BIG THE POINTER IS, BEFORE ANY OF THE RECORDING HAS BEEN READ ─────
   * Three sources, in descending order of how much they know:
   *
   *   measured     sync.js watched the pointer move and took the middle of the
   *                patch heights it left. First-hand, and it needs a dozen
   *                clean patches — so it returns nothing on the demos where
   *                the pointer mostly sits still, which are common.
   *   the display  the browser reported the screen's width in CSS pixels. A
   *                cursor is drawn at a fixed CSS size, so its height here is
   *                just that size scaled by videoWidth / screenWidth. See
   *                environment() in capture.js.
   *   nothing      the old arithmetic, which reads as a frame-width rule and
   *                is really the assumption that every creator has a 1920-wide
   *                desktop at 100% zoom. It is wrong by a third on a 1280-wide
   *                laptop and wrong by 40% on a Windows machine at 150%, both
   *                of which are ordinary.
   */
  const fromScreen = num(env?.screen_w) > 0 ? GLYPH_CSS * (W / num(env.screen_w)) : 0;
  const guess = cursorPx > 8 ? cursorPx : fromScreen > 8 ? fromScreen : 20 * (W / 1920);
  const sizes = new Set([0.75, 0.85, 0.95, 1.05, 1.15, 1.3].map((k) => Math.round(guess * k)));
  /**
   * ── WHEN THE TWO DISAGREE, BOTH ARE OFFERED ───────────────────────────────
   * The measurement is first-hand and quantised: it is taken on a 480-wide
   * pass, so a 19-pixel pointer is read as four or five pixels and multiplied
   * back up, and a smeared patch reads high. The display is exact arithmetic on
   * an assumed glyph size. Neither deserves to silently exclude the other, and
   * a size that is not offered here can never be found later — calibration can
   * only pick from this list, and picking wrong costs the whole recording its
   * pointer. Three extra sizes on a rare disagreement is a cheap insurance.
   */
  if (cursorPx > 8 && fromScreen > 8 && (fromScreen > guess * 1.3 || fromScreen < guess * 0.75)) {
    for (const k of [0.9, 1, 1.1]) sizes.add(Math.round(fromScreen * k));
  }
  const make = (name, hp, dark) => bounds(prepare(buildTemplate(name, hp, { dark }), W));
  /** A hand drawn at the height an arrow of `hp` implies, so it votes for `hp`. */
  const asHand = (name, hp, dark, k = 1.21) =>
    bounds(prepare(buildTemplate(name, Math.round(hp * k), { dark, setPx: hp }), W));
  /** Which hand drawing a pointer set uses at this size. See SHAPES.handL. */
  const handNames = (hp) => (hp < 24 ? ["hand"] : hp > 30 ? ["handL"] : ["hand", "handL"]);

  /**
   * ── BOTH SHAPES COMPETE, AND THE BEST FIT WINS ────────────────────────────
   * Three arrangements of this were tried on real recordings before one held.
   *
   * Arrows only was the original, and it fails outright on a demo of a sidebar
   * where every row is clickable: the pointer is a hand nearly throughout, the
   * twelve sampled frames turn up two arrows, and the locator switches itself
   * off for the whole recording.
   *
   * Arrows first, hands only if that finds nothing, fixes that one and not the
   * next: on a recording scaled to 1280 wide the arrow pass did not find
   * nothing — it found NOISE, dark arrows at ten pixels fitting text at 0.768
   * — so the hand pass that would have found the real pointer at 0.865 never
   * ran.
   *
   * Both at once, ranked by movement, was worse than either: noise moves.
   *
   * Both at once ranked by FIT is the one that holds, because fit is the thing
   * a wrong answer cannot have. A template that matches text scores in the
   * 0.74-0.77 range; the pointer it was drawn for scores 0.85 and up. See the
   * ranking in calibrate().
   */
  const candidates = [];
  for (const dark of [false, true]) {
    for (const hp of sizes) {
      candidates.push(make("arrow", hp, dark));
      for (const name of handNames(hp)) candidates.push(asHand(name, hp, dark));
    }
  }
  const cal = await calibrate(video, W, H, candidates, duration, fps);
  if (!cal) return { track: [], design: null, heightPx: 0, found: 0, frames: 0 };

  // Tracking uses only this recording's pointer: both shapes, at its size and
  // one step either side for the anti-aliasing a moving pointer picks up.
  const tpls = [];
  for (const hp of [cal.heightPx - 1, cal.heightPx, cal.heightPx + 1]) tpls.push(make("arrow", hp, cal.dark));
  // Which of the two hand drawings a set uses depends on its size, so both are
  // tried at the heights the system uses; the base one below about 24px.
  const hands = cal.heightPx < 24 ? ["hand"] : cal.heightPx > 30 ? ["handL"] : ["hand", "handL"];
  for (const name of hands) for (const k of HAND_RATIOS) {
    tpls.push(bounds(prepare(buildTemplate(name, Math.round(cal.heightPx * k), { dark: cal.dark, setPx: cal.heightPx }), W)));
  }

  /**
   * ── THE RESIZE POINTERS, KEPT OUT OF THE ORDINARY FRAME ───────────────────
   * Four more templates on every frame would be a third again on the cost of
   * the local search, paid on every frame of every recording, to catch the few
   * seconds of the few demos where somebody drags a column edge. So they are
   * not in `tpls` and never in `wide`: they are looked for only where the arrow
   * and the hand have already come up empty, which is precisely the frame that
   * is about to be lost anyway.
   *
   * They are also weaker templates than the other two — 60 pixels against the
   * arrow's 116, and a norm around 500 against its 1183, because the thin bar
   * between the two heads is all rim and no body. That is survivable HERE, next
   * to a known position, and it is why they are never offered to the
   * whole-frame scan, where a weak template is how the page gets mistaken for
   * a pointer.
   */
  const extra = Object.entries(RESIZE).map(([name, k]) =>
    bounds(prepare(buildTemplate(name, Math.round(cal.heightPx * k), { dark: cal.dark, setPx: cal.heightPx }), W))
  );

  /**
   * ── THE WHOLE-FRAME SCAN NEEDS TWO SHAPES, NOT ELEVEN ─────────────────────
   * Looking near where the pointer just was is cheap and uses every template;
   * scanning the entire frame is most of the cost of this file and only has to
   * RE-ACQUIRE the pointer. One arrow and one hand at the size this recording
   * uses are enough for that, and the local search refines the size on the
   * very next frame. Eleven templates to two takes the cost of a lost frame
   * down by about four fifths.
   */
  const wide = [
    make("arrow", cal.heightPx, cal.dark),
    bounds(prepare(buildTemplate(hands[0], Math.round(cal.heightPx * 1.21), { dark: cal.dark, setPx: cal.heightPx }), W)),
  ];

  /**
   * ── AND NO CHEAPER VERSION OF THEM ────────────────────────────────────────
   * A half-size copy of these two, hunting on a half-size frame and refining
   * the answer at full resolution, was built and measured and removed. It is
   * thirty per cent faster on a light 26px pointer and it located 65 frames of
   * 376 on a dark 21px one — which left no pointer shape for confirmClicks() to
   * judge a press by, so the demo came back with no zooms and no cursor at all.
   * See the note in topTwo: the rim is the signal, and averaging destroys it.
   */

  const hintAt = (t) => {
    let best = null;
    for (const h of hints) { const d = Math.abs(h.t - t); if (d <= 0.25 && (!best || d < best.d)) best = { d, h }; }
    return best ? best.h : null;
  };

  const track = [];
  let last = null;
  let lostFor = 0;
  let frames = 0;

  let prevFrame = null;
  let prevHit = null;
  let recent = null;
  /**
   * The ring around the pointer, frame by frame. Read here and nowhere else
   * because these frames are decoded exactly once, at full source resolution,
   * and this is the only place that has both them and the hotspot. See
   * flashesFrom() above.
   */
  const rings = [];
  const ringOuter = Math.max(14, Math.round((cal.heightPx || 18) * RING));
  const ringHole = Math.max(10, Math.round((cal.heightPx || 18) * RING_HOLE));

  /**
   * ── AN ANALYSIS HAS TO FINISH ────────────────────────────────────────────
   * Searching the whole frame for every template is most of the cost of this
   * file, and how expensive it is depends on what is on the screen rather than
   * on how long the recording is, so nothing inside one search bounds it and
   * this bounds all of them together.
   *
   * Past the budget the global search stops and the cheap local tracking
   * carries on: the pointer is still followed frame to frame wherever it was
   * already being followed, and where it is lost the difference tracker fills
   * in, which is the documented fallback and exactly what happens on a
   * recording no template matches. A demo that analyses with a worse cursor
   * path is a demo. One that never finishes is not.
   *
   * Proportional to length, floored so a short recording is never cut off in
   * the middle, capped so a long one cannot run away.
   */
  /**
   * ── GENEROUS, BECAUSE GIVING UP COSTS THE CURSOR ──────────────────────────
   * This was duration x 2.5s, floored at 90 seconds. On a dark, text-dense
   * recording the search runs at six to nine seconds per second of video, so a
   * thirty second demo hit the floor and stopped two thirds of the way through
   * — and a locator that stops has no pointer for the rest of the recording,
   * which shows up as a missing cursor and missing zooms rather than as a
   * slightly rougher edit.
   *
   * It is a guard against a genuine runaway, not a performance setting. Fifteen
   * seconds of budget per second of video is far more than any recording has
   * needed, so in practice it never fires; what it still prevents is the
   * forty-five minute hang this replaced.
   */
  const budgetMs = Math.round(
    clamp(num(process.env.STUDIO_LOCATE_BUDGET_MS) || duration * 15_000, 300_000, 1_800_000)
  );
  const startedAt = Date.now();
  let overBudget = false;

  await ffmpegToFrames(video, {
    width: W, height: H, fps, pixelFormat: "gray",
    /**
     * ── DECODE WHAT WAS ASKED FOR, NOT WHATEVER THE FILE HOLDS ──────────────
     * This was missing, so the locator read the whole file however long the
     * caller said the recording was. In production the two agree and nothing
     * was wrong — but the budget, the progress bar and MAX_SECONDS are all
     * expressed in `duration`, so every one of them was reasoning about a
     * different number from the one the loop actually worked through. A
     * recording whose container over-reports its length paid for the excess.
     */
    duration,
    onFrame: async (frame, i) => {
      frames++;
      const t = round3(i / fps);
      /**
       * With the model pass off this is the longest thing in an analysis, so it
       * is the one the progress bar has to follow. Every half second of the
       * recording is often enough to look alive and rare enough to cost
       * nothing.
       */
      if (onProgress && duration > 0 && i % Math.round(fps / 2) === 0) {
        onProgress(Math.min(1, t / duration));
      }

      /**
       * ── THE SERVER HAS TO KEEP ANSWERING ──────────────────────────────────
       * This runs on the same thread that serves the website. A frame's work is
       * a few milliseconds, but hundreds of frames back to back with no pause
       * is exactly how an export once took the whole site down. Yielding per
       * frame lets every waiting request through between them.
       */
      await new Promise((r) => setImmediate(r));

      /**
       * A recording made at 18 frames a second, read at 30, repeats about two
       * frames in five exactly. The same picture has the same pointer in it.
       */
      if (prevFrame && sameFrame(prevFrame, frame)) {
        if (prevHit) {
          track.push({ ...prevHit, t });
          // An identical frame has an identical ring. Carrying it keeps a still
          // run intact rather than splitting it in two around a duplicate.
          const last = rings[rings.length - 1];
          if (last) rings.push({ ...last, t });
        }
        return;
      }
      prevFrame = Buffer.from(frame);
      prevHit = null;

      let hit = null;

      // 1. Where it was a frame ago, carried on by its last move — a flick
      //    covers more than the search window in one frame, but it keeps going
      //    the way it was going. Continuity is the evidence here, so a match
      //    needs no uniqueness test.
      if (last) {
        const px = last.x + (last.vx || 0);
        const py = last.y + (last.vy || 0);
        hit = search(frame, W, H, tpls, px - NEAR, py - NEAR, px + NEAR, py + NEAR);
        if ((!hit || hit.score < FOUND) && (last.vx || last.vy)) {
          const r = search(frame, W, H, tpls, last.x - NEAR, last.y - NEAR, last.x + NEAR, last.y + NEAR);
          if (r && (!hit || r.score > hit.score)) hit = r;
        }
      }
      // 2. Where the difference tracker saw something move.
      if (!hit || hit.score < FOUND) {
        const h = hintAt(t);
        if (h) {
          const r = search(frame, W, H, tpls, h.x * W - NEAR, h.y * H - NEAR, h.x * W + NEAR, h.y * H + NEAR);
          if (r && (!hit || r.score > hit.score)) hit = r;
        }
      }
      // 2b. A resize pointer, where it last was. Only once the arrow and the
      //     hand have failed, so dragging a splitter costs one extra local
      //     search and an ordinary frame costs nothing. Continuity is the
      //     evidence, exactly as in step 1: these templates are never trusted
      //     to find a pointer, only to keep hold of one.
      if ((!hit || hit.score < FOUND) && last) {
        const px = last.x + (last.vx || 0);
        const py = last.y + (last.vy || 0);
        const r = search(frame, W, H, extra, px - NEAR, py - NEAR, px + NEAR, py + NEAR);
        if (r && (!hit || r.score > hit.score)) hit = r;
      }
      // 3. Everywhere — and then it has to be the ONE clear match.
      /**
       * While the pointer stays gone — off the screen, or a text caret no
       * template draws — scanning the whole frame every frame is most of the
       * cost of this file. The first few frames after losing it are scanned
       * every time (that is a flick, and it is about to reappear); after that,
       * every few frames. Anywhere the tracker sees movement is still searched
       * on every frame above, so a pointer coming back is caught at once.
       */
      const every = lostFor < 4 ? 1 : lostFor < 12 ? 3 : 6;
      if (!overBudget && Date.now() - startedAt > budgetMs) {
        overBudget = true;
        console.warn(
          "[studio] pointer search gave up its remaining frames after " +
            Math.round(budgetMs / 1000) + "s (at " + t.toFixed(1) + "s of " + duration.toFixed(1) +
            "s); the tracker fills in from here"
        );
      }
      if (!overBudget && (!hit || hit.score < FOUND) && lostFor % every === 0) {
        let r = null;
        /**
         * ── A FLICK IS COMPRESSED HARDEST ─────────────────────────────────────
         * An encoder spends the fewest bits on whatever moved furthest, so in
         * the middle of a fast flick the pointer comes out softer than it ever
         * does at rest, and scores a little under the bar in exactly the frames
         * where ours most needs to keep up. So for a frame or two after a sure
         * sighting, a softer match is accepted — but only if it is still the one
         * clear match in the whole frame, and no further from where the pointer
         * just was than a hand can throw it in that time.
         */
        const fresh = recent && lostFor <= 2;
        const bar = fresh ? FLICK : FOUND;
        for (const tp of wide) {
          const { best, second } = topTwo(frame, W, H, tp);
          if (!best || best.score < bar) continue;
          // A sure match is taken wherever it is; the extra conditions are only
          // for a soft one, which has to earn its place by being where a flick
          // could have carried the pointer.
          const soft = best.score < FOUND;
          /**
           * Being the one clear match in the frame is how a pointer is told
           * from the page — except on a page with arrow-shaped glyphs on it,
           * where a RESTING pointer is not clearly the only one, and would
           * never be picked up at all. The difference tracker is the second
           * opinion: it cannot see a still pointer, but where it does see
           * something move, a match there is corroborated and needs no
           * uniqueness of its own.
           */
          const h = hintAt(t);
          const corroborated = h && Math.hypot(best.x - h.x * W, best.y - h.y * H) <= NEAR;
          if (!corroborated && best.score - (second ? second.score : 0.45) < (soft ? UNIQUE + 0.05 : UNIQUE)) continue;
          if (soft && recent && Math.hypot(best.x - recent.x, best.y - recent.y) > THROW * (lostFor + 1)) continue;
          if (!r || best.score > r.score) r = { ...best, t: tp };
        }
        if (r) hit = { ...r, soft: r.score < FOUND };
      }

      if (onDebug) onDebug({ t, hit: hit ? { x: hit.x, y: hit.y, score: hit.score, soft: !!hit.soft } : null, last, lostFor, recent });
      if (hit && (hit.score >= FOUND || hit.soft)) {
        prevHit = { t, x: round4(hit.x / W), y: round4(hit.y / H), shape: hit.t.shape, score: round3(hit.score), located: true };
        track.push(prevHit);
        rings.push({ t, x: hit.x, y: hit.y, mean: ringMean(frame, W, H, hit.x, hit.y, ringOuter, ringHole) });
        last = last ? { x: hit.x, y: hit.y, vx: hit.x - last.x, vy: hit.y - last.y } : { x: hit.x, y: hit.y };
        lostFor = 0;
      } else {
        lostFor++;
        if (lostFor > 3) last = null;
      }
      recent = last ? { x: last.x, y: last.y } : lostFor <= 2 ? recent : null;
    },
  });

  /**
   * ── A POINTER THAT WAS ALREADY THERE ──────────────────────────────────────
   * A demo often opens with the mouse already resting on what it is about to
   * click. Nothing is found in those frames: the difference tracker cannot see
   * a still pointer, and a still pointer on a page with arrow-shaped glyphs on
   * it is not clearly the one match in the frame either.
   *
   * But the two blind spots answer each other. If the tracker saw NOTHING move
   * before the first frame the pointer was found in, then the pointer did not
   * move, and where it is first found is where it was sitting all along. If it
   * did move, there are sightings, and this does not apply.
   */
  if (track.length && track[0].t > 0.05) {
    const stirred = hints.some((h) => num(h.t) < track[0].t - 0.1);
    if (!stirred) track.unshift({ ...track[0], t: 0, held: true });
  }

  const flashes = flashesFrom(rings, { fps });
  if (flashes.length) {
    console.log(
      "[studio] " + flashes.length + " click acknowledgement(s) seen at the pointer: " +
        flashes.slice(0, 8).map((f) => f.t.toFixed(2) + "s").join(", ") + (flashes.length > 8 ? ", …" : "")
    );
  }

  return { track, flashes, design: cal.dark ? "dark" : "light", heightPx: cal.heightPx, found: track.length, frames };
}

/* ────────────────────────────────────────────────────────────────────────────
   The press itself
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * ── WHAT EVERY OTHER SIGNAL IN THIS PRODUCT IS MISSING ───────────────────────
 * Everything upstream infers a click from its CONSEQUENCE: the pointer stopped,
 * then something changed somewhere. That is a second-hand reading, it arrives
 * hundreds of milliseconds late, and it fails completely on a press that
 * produced nothing visible.
 *
 * But a press is not invisible. Almost every interface acknowledges one, at the
 * moment it happens, at the pointer: a Material ripple, a `:active` darkening, a
 * native button depressing, a focus ring landing on a field. It is small, it is
 * two to eight frames long, and it is centred on the hotspot — which locate.js
 * knows to the pixel, in every frame, at full source resolution, on frames it is
 * already decoding. The cost of reading it is a few hundred byte-sums a frame.
 *
 * ── WHY IT IS READ AS A RING, NOT A PATCH ────────────────────────────────────
 * The cursor is drawn ON TOP of whatever it is over, so a patch centred on the
 * hotspot is mostly cursor, and the cursor's own movement would swamp the
 * signal. The acknowledgement happens AROUND the cursor — a ripple expands from
 * under it, a button darkens well past it — so the cursor's own footprint is
 * cut out and what is left is a ring. The ring is the page; the hole is us.
 *
 * ── AND ONLY WHILE THE POINTER IS STILL ──────────────────────────────────────
 * A moving pointer drags new pixels through the ring every frame and the mean
 * moves for reasons that have nothing to do with a press. Held still, the ring
 * is constant to within compression noise, and a two-frame excursion from that
 * is not ambiguous. This is the same reasoning events.js applies to dwell, one
 * layer down: stillness is what makes a small signal readable at all.
 */

/** Outer size of the ring, as a multiple of the pointer's height. */
const RING = 2.6;
/** ...and the hole cut out of it, which must comfortably clear the cursor. */
const RING_HOLE = 1.35;
/** Frames the pointer must hold a spot before its ring is worth reading. */
const STILL_RUN = 4;
/** How far it may drift, in source pixels, and still count as held. */
const STILL_PX = 2.5;
/** The longest an acknowledgement lasts. Past this it is the page, not a press. */
const FLASH_MAX = 8;
/**
 * How far the ring must move from its own baseline, in grey levels.
 *
 * Absolute floor plus an adaptive term. JPEG noise on a static screen region
 * runs to two or three levels; a button darkening on press is ten to forty. The
 * floor keeps a perfectly clean region from finding a press in its own dither,
 * and the adaptive term keeps a busy one from finding one in its own texture.
 */
const FLASH_FLOOR = 3.5;
const FLASH_SIGMA = 4;

/**
 * The mean of the ring around a hotspot, or null when it runs off the frame.
 *
 * Deliberately a mean and not a histogram: an acknowledgement is a brightness
 * shift across the whole control, and the cheapest statistic that sees it is
 * the one that costs a few hundred additions.
 */
function ringMean(frame, W, H, cx, cy, outer, hole) {
  const x0 = Math.max(0, cx - outer);
  const x1 = Math.min(W - 1, cx + outer);
  const y0 = Math.max(0, cy - outer);
  const y1 = Math.min(H - 1, cy + outer);
  if (x1 - x0 < 6 || y1 - y0 < 6) return null;

  let sum = 0;
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    const inHoleY = dy >= -2 && dy <= hole;      // the cursor hangs BELOW its hotspot
    const row = y * W;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      // The arrow and the hand both extend right and down from the tip, so the
      // hole is not centred on the hotspot — it hangs off it.
      if (inHoleY && dx >= -2 && dx <= hole) continue;
      sum += frame[row + x];
      n++;
    }
  }
  return n > 40 ? sum / n : null;
}

/**
 * Acknowledgements, from a per-frame series of ring means.
 *
 * @param {Array<{t,x,y,mean}>} series  x,y in source pixels; mean may be null
 * @returns {Array<{t, strength, frames}>}
 */
export function flashesFrom(series, { fps = 30 } = {}) {
  const out = [];
  let run = [];

  const close = () => {
    if (run.length >= STILL_RUN) scan(run, out, fps);
    run = [];
  };

  for (let i = 0; i < series.length; i++) {
    const s = series[i];
    const prev = run[run.length - 1];
    if (s.mean == null) {
      close();
      continue;
    }
    if (prev && Math.hypot(s.x - prev.x, s.y - prev.y) <= STILL_PX && s.t - prev.t <= 2.5 / fps) {
      run.push(s);
      continue;
    }
    close();
    run = [s];
  }
  close();
  return out.sort((a, b) => a.t - b.t);
}

/** One still run, read for excursions from its own resting level. */
function scan(run, out, fps) {
  const means = run.map((s) => s.mean);
  const sorted = [...means].sort((a, b) => a - b);
  const base = sorted[sorted.length >> 1];
  /**
   * Spread as a median absolute deviation rather than a standard deviation:
   * the excursion we are looking for is IN this run, and a standard deviation
   * would let it raise the bar it has to clear.
   */
  const devs = means.map((m) => Math.abs(m - base)).sort((a, b) => a - b);
  const mad = devs[devs.length >> 1];
  const bar = Math.max(FLASH_FLOOR, mad * FLASH_SIGMA);

  let from = -1;
  for (let i = 0; i <= run.length; i++) {
    const hot = i < run.length && Math.abs(means[i] - base) >= bar;
    if (hot && from < 0) from = i;
    if (!hot && from >= 0) {
      const len = i - from;
      /**
       * ── IT HAS TO END, AND IT HAS TO END WHERE IT STARTED ─────────────────
       * A press is acknowledged and then released. A ring that shifts and
       * STAYS shifted is the page having changed under a parked pointer — a
       * panel loading, a row highlighting on its own — and calling that a
       * press is how the old rules collected a click for every repaint.
       */
      const ended = i < run.length;
      if (ended && len <= FLASH_MAX) {
        let peak = 0;
        for (let j = from; j < i; j++) peak = Math.max(peak, Math.abs(means[j] - base));
        out.push({
          t: run[from].t,
          strength: Math.round((peak / Math.max(1, bar)) * 100) / 100,
          frames: len,
          levels: Math.round(peak * 10) / 10,
        });
      }
      from = -1;
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   Using what was found
   ──────────────────────────────────────────────────────────────────────────── */

/** How long the locator may lose the pointer before the old tracker fills in. */
const HOLE = 0.2;

/**
 * The located path, with the difference tracker's samples filling only the
 * stretches the locator could not see (a text caret, a pointer in a colour the
 * templates do not cover). Where both exist the located one wins: it is the
 * pointer's actual position in that frame, not an estimate from a difference.
 */
export function mergeLocated(located, fallback) {
  if (!located?.length) return fallback || [];
  const L = [...located].sort((a, b) => a.t - b.t);
  const covered = (t) => {
    let lo = 0;
    let hi = L.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (L[mid].t <= t) lo = mid; else hi = mid; }
    return Math.min(Math.abs(L[lo].t - t), Math.abs(L[hi].t - t)) <= HOLE;
  };
  /**
   * ── THE SHAPE CARRIES ACROSS A GAP ────────────────────────────────────────
   * A fallback sample brings the difference tracker's idea of the shape, which
   * is not a shape at all: it classifies the DENSITY of the patch of pixels
   * that changed, and over a menu row that highlights under a resting hand it
   * says "arrow" almost every time. On one recording it said "arrow" in 4123
   * samples out of 4360, so our pointer was an arrow for the whole demo while
   * the one in the picture was a hand — side by side, plainly different.
   *
   * The operating system does not change the pointer while it sits still. So
   * where a gap's sample is at the same place as the located sighting nearest
   * it in time, that sighting's shape is the shape — measured, a moment either
   * side, rather than guessed from a blob.
   */
  const at = (t) => {
    let lo = 0;
    let hi = L.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (L[mid].t <= t) lo = mid; else hi = mid; }
    return Math.abs(L[lo].t - t) <= Math.abs(L[hi].t - t) ? L[lo] : L[hi];
  };
  const fill = (fallback || []).filter((p) => !covered(Number(p.t))).map((p) => {
    const near = at(Number(p.t));
    if (!near) return p;
    if (Math.hypot(Number(p.x) - Number(near.x), Number(p.y) - Number(near.y)) > SAME_PLACE) return p;
    return { ...p, shape: near.shape || p.shape };
  });
  return [...L, ...fill].sort((a, b) => a.t - b.t);
}

/**
 * Close enough to the nearest sighting to be the same resting place, as a
 * fraction of the frame — about twenty pixels across a 1920 recording.
 */
const SAME_PLACE = 0.011;

/**
 * The path as the renderer should draw it: each located position held until
 * the NEXT frame's, switching halfway between them.
 *
 * ── WHY THERE IS NO SMOOTHING HERE ─────────────────────────────────────────
 * Smoothing is what let the real pointer show while it moved: ours glided
 * between two frames' positions while the picture underneath showed the real
 * one at one of them, a few pixels apart for every frame of every move. The
 * export picks, for each output frame, the recording frame nearest in time;
 * switching at the midpoint makes ours follow exactly the same rule, so on
 * every frame of the finished video ours is where the real one is — at rest,
 * moving, or mid-flick. Located stretches keep their frame rate; the gaps the
 * old tracker filled keep its samples.
 */
export function stepPath(track) {
  const out = [];
  for (let i = 0; i < track.length; i++) {
    const p = track[i];
    const next = track[i + 1];
    out.push({ t: p.t, x: p.x, y: p.y, shape: p.shape || "default" });
    if (next && p.located && next.located && next.t - p.t <= HOLE) {
      const mid = (p.t + next.t) / 2;
      out.push({ t: round3(mid - 0.001), x: p.x, y: p.y, shape: p.shape || "default" });
    }
  }
  return out;
}

/**
 * Each press moved to where the pointer actually was when it happened.
 *
 * The click detector works from differences and places a press at the rest it
 * inferred, which can be a few pixels off; the zoom is aimed there and the
 * ripple drawn there. When the locator saw the pointer at that moment, that is
 * where it was.
 *
 * ── A CORRECTION, NOT A RELOCATION ──────────────────────────────────────────
 * "A few pixels off" is the entire remit, and this used to have no limit on
 * how far it would move a press. Any sighting within a tenth of a second won,
 * whatever it was and wherever it was, so one bad frame from the locator — and
 * a repainting screen is exactly where those come from — could pick a press up
 * off the control it landed on and put it down in the opposite corner, taking
 * the zoom and the ripple with it.
 *
 * So it may correct a press and it may not move one. Past `reach` the two
 * readings are not describing the same press, and the press's own position is
 * the one that came from watching the pointer rest there.
 */
const SNAP_REACH = 0.08;

export function snapToLocated(events, located, { within = 0.12, reach = SNAP_REACH } = {}) {
  if (!located?.length) return events;
  return events.map((e) => {
    if (e.type !== "click" && e.type !== "dblclick") return e;
    let best = null;
    for (const p of located) {
      const d = Math.abs(p.t - e.t);
      if (d <= within && (!best || d < best.d)) best = { d, p };
    }
    if (!best) return e;
    const moved = Math.hypot(num(best.p.x) - num(e.x), num(best.p.y) - num(e.y));
    if (moved > reach) return e;
    return { ...e, x: best.p.x, y: best.p.y, snapped: "located" };
  });
}

/** Two frames are the same picture: a sparse sample of pixels, all identical. */
function sameFrame(a, b) {
  if (a.length !== b.length) return false;
  const step = 997;
  for (let i = 0; i < a.length; i += step) if (a[i] !== b[i]) return false;
  // The sample can miss a small moving pointer, so a full comparison confirms.
  return a.equals(b);
}

/** For tests. */
export const _debug = { coarse: coarseAt, make: (name, hp, dark, W) => bounds(prepare(buildTemplate(name, hp, { dark }), W)), score: scoreAt };

export default { locatePointer, mergeLocated, stepPath, snapToLocated, flashesFrom };

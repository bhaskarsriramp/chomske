/**
 * sync.js: putting the browser's clock and the video's clock on the same time.
 *
 * ── THE BUG THIS FILE EXISTS TO FIX ──────────────────────────────────────────
 * The pointer path is recorded in the browser while the demo is being made. The
 * video is recorded by MediaRecorder at the same moment. They are two different
 * recordings of the same event, made by two different subsystems, and NOTHING
 * ties their timestamps together.
 *
 * MediaRecorder's first frame does not arrive when start() returns; a codec has
 * to come up and a keyframe has to be produced, and how long that takes depends
 * on the machine, the encoder and what else the tab is doing. Meanwhile the
 * tracker is timing from its own zero. The gap is small, it is never the same
 * twice, and on a real recording it measured just under a second.
 *
 * A second is catastrophic here. Everything downstream is a position looked up
 * by time: the drawn cursor, the click that decides where the camera goes, the
 * blur that has to stay over the thing it is hiding. A pointer moving at an
 * ordinary six hundred pixels a second, drawn from a track that is a second
 * out, appears SIX HUNDRED PIXELS from the pointer burnt into the video — and
 * the viewer sees two cursors at opposite ends of the screen, one of them
 * moving a beat behind the other. That is exactly what shipped.
 *
 * ── HOW THE OFFSET IS MEASURED ───────────────────────────────────────────────
 * Not guessed, and not fixed up with a constant. Both recordings contain the
 * same signal — how much of the screen changed, moment to moment — and that
 * signal is spiky and distinctive: a page navigation is a cliff, a still screen
 * is a flat line. The browser's version is in `capture.motion`, written while
 * recording. The video's version is measured here, from the finished file. The
 * offset is whichever shift lines the two up best.
 *
 * This is the same trick as lining up two microphones on one performance, and
 * it has the same advantages: it needs no cooperation from either recorder, it
 * measures what actually happened rather than what should have, and it can be
 * re-run against a recording made months ago. Every existing demo can be
 * re-analysed and comes out aligned.
 *
 * ── IT DECLINES RATHER THAN GUESSES ──────────────────────────────────────────
 * A demo of a completely still screen has no signal to align. So the peak has
 * to be both strong in absolute terms and clearly better than the next best
 * shift, or the answer is "no offset" and the pipeline carries on exactly as it
 * did before. A wrong offset applied confidently is far worse than none.
 */
import { ffmpegToFrames } from "../media/ffmpeg.js";

/** Frames a second the video is re-read at. Enough to place a click. */
const READ_FPS = 12;
/** ...dropped to this for a long recording, where the decode is the cost. */
const LONG_FPS = 6;
const LONG_SECONDS = 600;
/** Long edge the video is scaled to before differencing. */
const READ_EDGE = 480;
/** Per-pixel difference that counts as changed. Matches the browser tracker. */
const DIFF = 18;
/** Columns the frame is divided into when asking WHERE things changed. */
const GRID_W = 40;
/** Changed pixels in a cell before the cell counts as having changed. */
const CELL_MIN = 3;
/** The window over which a cell is judged to be animating rather than reacting. */
const BUSY_WINDOW = 1.5;
/**
 * Share of that window a cell must change in before it counts as an animation.
 *
 * Raised from a third after a real recording came back with FIVE HUNDRED AND
 * FIFTY busy spans and two hundred of four hundred and sixty pointer sightings
 * thrown away — nearly half the path, on a page with one spinner in it. At a
 * third, ordinary things clear the bar: compression noise around text, a
 * caret, a hover shadow, a chart tooltip. A spinner does not merely change
 * often, it changes almost every frame.
 */
const BUSY_SHARE = 0.3;
/**
 * How many neighbouring cells must be busy together.
 *
 * The other half of the same fix. A real animation occupies a patch — a
 * spinner is a disc, a progress bar is a strip — so it lights several adjacent
 * cells at once. One cell on its own, however busy, is noise, and it was
 * costing us the pointer every time it passed near one.
 */
const BUSY_CLUSTER = 2;
/** Cells of margin around an animation, since a cursor drawn over one is lost. */
const BUSY_PAD = 1;

/** The widest disagreement between the two clocks worth searching for. */
const MAX_OFFSET = 3;
/** Correlation the best shift must reach before it is believed. */
const MIN_SCORE = 0.3;
/** ...and how much better than the runner-up it has to be. */
const MIN_MARGIN = 1.2;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round3 = (v) => Math.round(v * 1000) / 1000;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* ────────────────────────────────────────────────────────────────────────────
   What the video itself says
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * How much of the screen changed, frame by frame, measured from the file.
 *
 * Also measures how big the captured pointer actually is. That is not a detail:
 * the synthetic cursor is drawn over the captured one to hide it, and the size
 * it has to beat depends on the creator's display scaling, which nothing in the
 * recording reports. A pointer measured at forty pixels and covered with thirty
 * is two pointers. See overlay.js.
 *
 * ── AND WHERE THE POINTER WAS PARKED ─────────────────────────────────────────
 * The browser's tracker cannot see a pointer that is not moving: it works by
 * differencing frames, and a still pointer makes no difference. So a demo's
 * track begins at the first place the pointer was seen MOVING, and nothing is
 * known about the seconds before that — which is most of a demo's opening,
 * while the creator collects themselves.
 *
 * It is recoverable, and from the same frames. The moment a still pointer moves
 * it leaves TWO patches: the one it arrived at, and the hole where the
 * background came back. That hole is where it had been sitting, for however
 * long it had been sitting there. The browser's tracker computes it and throws
 * it away because it only wants the arrival; here it is kept, and analyse.js
 * uses it to fill the opening rather than leave the demo with no pointer at all.
 *
 * @returns {{ fps, energy: number[], cursorPx: number, frames: number, parked }}
 */
export async function readScreen(video, { duration = 0, sourceWidth = 1920, sourceHeight = 1080 } = {}) {
  const fps = duration > LONG_SECONDS ? LONG_FPS : READ_FPS;
  const W = READ_EDGE;
  // The recording's own shape, not 16:9. A browser tab is 1920x1020 as often as
  // not, and squashing it here would stretch every patch this pass measures —
  // which the "is this cursor shaped" tests below are decided on.
  const H = Math.max(2, Math.round((W * Math.max(0.2, sourceHeight / Math.max(1, sourceWidth))) / 2) * 2);

  const energy = [];
  const sizes = [];
  const grids = [];
  let parked = null;
  let prev = null;
  const N = W * H;
  const gw = GRID_W;
  const gh = Math.max(4, Math.round((gw * H) / W));
  const cw = W / gw;
  const ch = H / gh;

  await ffmpegToFrames(video, {
    width: W,
    height: H,
    fps,
    pixelFormat: "gray",
    duration,
    onFrame: (buf) => {
      if (!prev) {
        prev = Buffer.from(buf);
        energy.push(0);
        grids.push(new Uint8Array(gw * gh));
        return;
      }
      const mask = new Uint8Array(N);
      const counts = new Uint16Array(gw * gh);
      let changed = 0;
      for (let i = 0; i < N; i++) {
        const d = buf[i] - prev[i];
        if (d > DIFF || d < -DIFF) {
          mask[i] = 1;
          changed++;
          const y = (i / W) | 0;
          const x = i - y * W;
          counts[Math.min(gh - 1, (y / ch) | 0) * gw + Math.min(gw - 1, (x / cw) | 0)]++;
        }
      }
      const grid = new Uint8Array(gw * gh);
      for (let c = 0; c < grid.length; c++) grid[c] = counts[c] >= CELL_MIN ? 1 : 0;
      grids.push(grid);
      energy.push(changed / N);
      // Only a frame where little moved can say anything about the pointer;
      // on a frame where the page repainted the patches are the page.
      if (changed > 0 && changed < N * 0.02) {
        const found = patches(mask, W, H, buf, prev);
        for (const c of found) sizes.push(c.bh);
        if (!parked) {
          /**
           * ── THE ANSWER IS A VECTOR, NOT A POSITION ───────────────────────
           * The hole is the patch that LOST contrast: the background coming
           * back where the pointer had been sitting. Its corner is not quite
           * the pointer's corner, though — a cursor's tip is a pixel wide and
           * fades into the background before it clears the difference
           * threshold, so a patch measured at this size is a few pixels short
           * at the top and reading a position straight off it lands about a
           * cursor's width out. Which is enough for the captured pointer to
           * show from under the one drawn over it: the bug this is here to fix.
           *
           * So what is kept is the STEP — the hole relative to the arrival in
           * the same frame. Both are the same cursor measured the same way, so
           * the error is the same in both and cancels in the difference. Added
           * to the browser's own first sighting, which is measured properly at
           * twice this rate, it gives the parked position to a pixel or two.
           */
          const left = found.filter((c) => c.arrival < -20 && c.was >= 40).sort((a, b) => a.arrival - b.arrival)[0];
          const came = found.filter((c) => c.arrival > 20 && c.now >= 40).sort((a, b) => b.arrival - a.arrival)[0];
          if (left) {
            parked = {
              t: round3((energy.length - 1) / fps),
              x: round3(left.x0 / W),
              y: round3(left.y0 / H),
              dx: came ? round3((left.x0 - came.x0) / W) : null,
              dy: came ? round3((left.y0 - came.y0) / H) : null,
            };
          }
        }
      }
      buf.copy(prev);
    },
  });

  sizes.sort((a, b) => a - b);
  /**
   * ── WHY THE MEDIAN OF EVERY PATCH, NOT THE TALLEST PER FRAME ───────────────
   * A pointer that moved further than its own height between two frames leaves
   * two separate patches, each exactly one cursor tall. One that moved less
   * leaves a single smeared patch, taller than the cursor by however far it
   * travelled. Taking the tallest patch on each frame therefore measures the
   * cursor PLUS the movement, and on a test recording it over-read by a third.
   * Pooling every patch and taking the middle one lands on the clean ones,
   * which are the majority.
   */
  const measured = sizes.length >= 12 ? sizes[Math.floor(sizes.length * 0.5)] : 0;

  const read = readGrids(grids, gw, gh, fps);

  return {
    fps,
    energy,
    frames: energy.length,
    cursorPx: measured > 0 ? round3((measured * sourceWidth) / W) : 0,
    parked,
    grid: { w: gw, h: gh },
    busy: read.busy,
    motion: read.motion,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   Animations, and what actually changed around them
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The spinners, and the real screen changes once they are discounted.
 *
 * ── WHY AN ANIMATION HAS TO BE FOUND BEFORE ANYTHING ELSE IS BELIEVED ────────
 * A loading spinner is a small, compact, high-contrast thing that moves every
 * frame in one place. To a tracker that finds the pointer by looking for a
 * small, compact, high-contrast thing that moved, it is a better pointer than
 * the pointer — and a still pointer, which makes no difference at all, cannot
 * compete. So the drawn cursor leaves the mouse, sits on the spinner and turns
 * with it, which is exactly what the creator described seeing.
 *
 * It corrupts the conclusions too. A spinner repaints the screen dozens of
 * times while somebody's hand rests on a menu item, and every one of those
 * repaints looks like the consequence of a click.
 *
 * Both fall out of one observation: THE POINTER NEVER CHANGES THE SAME PIXELS
 * TWICE IN A ROW. It moves, so it changes somewhere new; when it stops it
 * changes nothing at all. Anything that keeps changing in one place for half a
 * second is an animation, and the places it does that are marked here — for the
 * frames it is running, and not for the rest of the recording.
 *
 * What is left is the motion series: how much of the screen changed and where,
 * counted in cells, with the animations taken out. A navigation touches cells
 * all over the frame; a spinner touches four of them forever.
 */
function readGrids(grids, gw, gh, fps) {
  const cells = gw * gh;
  const n = grids.length;
  const busy = [];
  const busyFlags = grids.map(() => new Uint8Array(cells));
  const half = Math.max(2, Math.round((BUSY_WINDOW * fps) / 2));

  /**
   * ── AN ANIMATION IS OFTEN NOT CONTINUOUS IN ANY ONE PLACE ─────────────────
   * The first version of this asked whether a cell changed on every frame for
   * half a second, and a rotating spinner failed it: the arc sweeps through a
   * cell, leaves, and comes back a rotation later, so each cell changes in
   * bursts with gaps between them. The test is how OFTEN a cell changes over a
   * window, not whether it never stops.
   *
   * A pointer crossing a cell changes it for two or three frames out of the
   * eighteen in that window and is nowhere near the threshold; a pointer that
   * stops changes nothing at all. Only something that keeps redrawing itself in
   * one place — a spinner, a progress bar, a caret, a playing video — gets
   * close.
   */
  for (let c = 0; c < cells; c++) {
    let sum = 0;
    for (let i = 0; i < Math.min(n, half + 1); i++) sum += grids[i][c];
    let openFrom = -1;
    for (let i = 0; i < n; i++) {
      const lo = Math.max(0, i - half);
      const hi = Math.min(n - 1, i + half);
      if (i > 0) {
        const add = i + half;
        const drop = i - half - 1;
        if (add < n) sum += grids[add][c];
        if (drop >= 0) sum -= grids[drop][c];
      }
      const hot = sum / (hi - lo + 1) >= BUSY_SHARE;
      if (hot) {
        busyFlags[i][c] = 1;
        if (openFrom < 0) openFrom = i;
      } else if (openFrom >= 0) {
        busy.push({ c, start: round3(openFrom / fps), end: round3((i - 1) / fps) });
        openFrom = -1;
      }
    }
    if (openFrom >= 0) busy.push({ c, start: round3(openFrom / fps), end: round3((n - 1) / fps) });
  }

  // Lone busy cells are dropped before anything is grown: noise does not come
  // in patches, and an animation does.
  for (let i = 0; i < n; i++) {
    const f = busyFlags[i];
    const keep = new Uint8Array(cells);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        if (!f[y * gw + x]) continue;
        let near = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const yy = y + dy;
            const xx = x + dx;
            if (yy >= 0 && yy < gh && xx >= 0 && xx < gw && f[yy * gw + xx]) near++;
          }
        }
        if (near >= BUSY_CLUSTER) keep[y * gw + x] = 1;
      }
    }
    busyFlags[i] = keep;
  }

  busy.length = 0;
  for (let c = 0; c < cells; c++) {
    let openFrom = -1;
    for (let i = 0; i <= n; i++) {
      const hot = i < n && busyFlags[i][c] === 1;
      if (hot && openFrom < 0) openFrom = i;
      else if (!hot && openFrom >= 0) {
        busy.push({ c, start: round3(openFrom / fps), end: round3((i - 1) / fps) });
        openFrom = -1;
      }
    }
  }

  // Grown only for the motion series below: a change touching a cell next to an
  // animation is usually the animation. inBusy() applies its own margin.
  for (let i = 0; i < n; i++) {
    const src = busyFlags[i];
    const out = new Uint8Array(cells);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        if (!src[y * gw + x]) continue;
        for (let dy = -BUSY_PAD; dy <= BUSY_PAD; dy++) {
          for (let dx = -BUSY_PAD; dx <= BUSY_PAD; dx++) {
            const yy = y + dy;
            const xx = x + dx;
            if (yy >= 0 && yy < gh && xx >= 0 && xx < gw) out[yy * gw + xx] = 1;
          }
        }
      }
    }
    busyFlags[i] = out;
  }

  const motion = [];
  for (let i = 0; i < n; i++) {
    const g = grids[i];
    const b = busyFlags[i];
    let hit = 0;
    let live = 0;
    let x0 = gw;
    let y0 = gh;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const c = y * gw + x;
        if (b[c]) continue;
        live++;
        if (!g[c]) continue;
        hit++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    motion.push({
      t: round3(i / fps),
      cover: live > 0 ? round3(hit / live) : 0,
      x: x1 >= 0 ? round3(x0 / gw) : 0.5,
      y: y1 >= 0 ? round3(y0 / gh) : 0.5,
      w: x1 >= 0 ? round3((x1 - x0 + 1) / gw) : 0,
      h: y1 >= 0 ? round3((y1 - y0 + 1) / gh) : 0,
    });
  }

  return { busy, motion };
}

/**
 * Whether a point was inside something that was animating at that moment.
 *
 * Used to throw away pointer sightings that are really a spinner. Throwing one
 * away leaves a gap, and a gap is read as the pointer standing still — which,
 * while somebody waits for a page to load, it almost certainly was.
 */
export function inBusy(screen, t, x, y) {
  if (!screen || !screen.busy || !screen.busy.length || !screen.grid) return false;
  const gw = screen.grid.w;
  const gh = screen.grid.h;
  const cx = Math.min(gw - 1, Math.max(0, Math.floor(x * gw)));
  const cy = Math.min(gh - 1, Math.max(0, Math.floor(y * gh)));
  for (const s of screen.busy) {
    if (t < s.start - 0.1 || t > s.end + 0.1) continue;
    const c = s.c;
    const sy = (c / gw) | 0;
    const sx = c - sy * gw;
    if (Math.abs(sx - cx) <= BUSY_PAD && Math.abs(sy - cy) <= BUSY_PAD) return true;
  }
  return false;
}

/**
 * Every compact patch on a quiet frame. On such a frame they are the pointer.
 *
 * Connected components, same as the browser tracker, with the same rejections:
 * too big is a widget, too small is compression noise, too wide is a row
 * highlighting rather than a cursor. Each one carries the contrast it has now
 * and the contrast it had a frame ago, because the sign of the difference is
 * the only thing that separates where the pointer went from where it left.
 */
function patches(mask, W, H, now, before) {
  // A pointer is between a sixtieth and a twenty-fourth of the frame's width
  // tall on every display anybody records on, which is the only scale-free way
  // to say "cursor sized" when this runs at two different resolutions.
  const minH = Math.max(3, Math.round(W / 190));
  const maxH = Math.max(minH + 2, Math.round(W / 22));
  const maxArea = maxH * maxH;
  const N = W * H;
  const seen = new Uint8Array(N);
  const stack = new Int32Array(N);
  let components = 0;
  const out = [];

  for (let i = 0; i < N && components < 40; i++) {
    if (!mask[i] || seen[i]) continue;
    let top = 0;
    stack[top++] = i;
    seen[i] = 1;
    let area = 0;
    let x0 = W;
    let y0 = H;
    let x1 = -1;
    let y1 = -1;
    while (top > 0) {
      const p = stack[--top];
      const y = (p / W) | 0;
      const x = p - y * W;
      area++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (area > maxArea) break;
      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[top++] = p - 1; }
      if (x < W - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[top++] = p + 1; }
      if (y > 0 && mask[p - W] && !seen[p - W]) { seen[p - W] = 1; stack[top++] = p - W; }
      if (y < H - 1 && mask[p + W] && !seen[p + W]) { seen[p + W] = 1; stack[top++] = p + W; }
    }
    components++;
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    if (area < 4 || area > maxArea) continue;
    if (bh < minH || bh > maxH) continue;
    if (bw > bh * 1.6 || bh > bw * 4) continue;

    let lo = 255, hi = 0, plo = 255, phi = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const j = y * W + x;
        const v = now[j];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
        const q = before[j];
        if (q < plo) plo = q;
        if (q > phi) phi = q;
      }
    }
    out.push({ x0, y0, x1, y1, bw, bh, area, now: hi - lo, was: phi - plo, arrival: hi - lo - (phi - plo) });
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
   Lining the two up
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The shift that best lines the browser's account of the recording up with the
 * video's.
 *
 * @param {Array} motion   capture.motion, as the browser wrote it
 * @param {object} screen  readScreen()'s answer
 * @returns {{ offset, score, margin, confident }} offset is SECONDS TO ADD to a
 *          browser timestamp to reach video time.
 */
export function clockOffset(motion, screen, { duration = 0 } = {}) {
  const none = { offset: 0, score: 0, margin: 0, confident: false };
  if (!screen?.energy?.length || !Array.isArray(motion) || motion.length < 8) return none;

  const fps = screen.fps;
  const span = duration > 0 ? duration : screen.energy.length / fps;
  const n = Math.ceil((span + MAX_OFFSET * 2) * fps);
  if (n < 16) return none;

  const theirs = grid(motion, n, fps);
  const ours = new Float64Array(n);
  for (let i = 0; i < screen.energy.length && i < n; i++) ours[i] = screen.energy[i];

  /**
   * ── WHY THE SIGNAL IS COMPRESSED FIRST ─────────────────────────────────────
   * The two recorders measure change differently — different downscale,
   * different rounding, and the browser's version counts the pointer's own
   * movement while the video's counts the pointer it is drawn under. Raw, one
   * page navigation is a hundred times any other sample and the correlation
   * becomes a test of whether that ONE spike lines up. A square root keeps the
   * ordering and the shape while letting the small events vote too, which is
   * what tells two similar navigations apart.
   */
  for (let i = 0; i < n; i++) {
    theirs[i] = Math.sqrt(theirs[i]);
    ours[i] = Math.sqrt(ours[i]);
  }

  const maxShift = Math.round(MAX_OFFSET * fps);
  const scores = [];
  for (let k = -maxShift; k <= maxShift; k++) scores.push({ k, r: correlate(theirs, ours, k) });

  let best = scores[0];
  for (const s of scores) if (s.r > best.r) best = s;

  // The runner-up has to be a genuinely different answer, not the sample next
  // to the peak, which is always nearly as good.
  let runner = 0;
  for (const s of scores) {
    if (Math.abs(s.k - best.k) <= 2) continue;
    if (s.r > runner) runner = s.r;
  }

  const refined = refine(scores, best.k);
  const margin = runner > 0.001 ? best.r / runner : Infinity;

  return {
    offset: round3(clamp(refined / fps, -MAX_OFFSET, MAX_OFFSET)),
    score: round3(best.r),
    margin: Number.isFinite(margin) ? round3(margin) : 99,
    confident: best.r >= MIN_SCORE && margin >= MIN_MARGIN,
  };
}

/** The browser's samples, laid onto a fixed grid at the video's rate. */
function grid(motion, n, fps) {
  const out = new Float64Array(n);
  const counts = new Float64Array(n);
  for (const m of motion) {
    const t = Number(m?.t);
    const e = Number(m?.energy);
    if (!Number.isFinite(t) || !Number.isFinite(e) || t < 0) continue;
    const i = Math.round(t * fps);
    if (i < 0 || i >= n) continue;
    out[i] += e;
    counts[i] += 1;
  }
  for (let i = 0; i < n; i++) if (counts[i] > 1) out[i] /= counts[i];
  return out;
}

/** Normalised correlation of a against b, with b shifted by k samples. */
function correlate(a, b, k) {
  let n = 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < a.length; i++) {
    const j = i + k;
    if (j < 0 || j >= b.length) continue;
    sa += a[i];
    sb += b[j];
    n++;
  }
  if (n < 16) return 0;
  const ma = sa / n;
  const mb = sb / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    const j = i + k;
    if (j < 0 || j >= b.length) continue;
    const x = a[i] - ma;
    const y = b[j] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  if (da <= 0 || db <= 0) return 0;
  return num / Math.sqrt(da * db);
}

/**
 * The peak, to better than one sample.
 *
 * A parabola through the best shift and its two neighbours. The grid is twelve
 * samples a second and the thing being measured is a pointer that can cross
 * fifty pixels in that time, so the eighth of a second between two shifts is
 * worth recovering.
 */
function refine(scores, k) {
  const at = (kk) => scores.find((s) => s.k === kk)?.r;
  const c = at(k);
  const l = at(k - 1);
  const r = at(k + 1);
  if (c === undefined || l === undefined || r === undefined) return k;
  const denom = l - 2 * c + r;
  if (Math.abs(denom) < 1e-9) return k;
  return k + clamp((0.5 * (l - r)) / denom, -0.5, 0.5);
}

/* ────────────────────────────────────────────────────────────────────────────
   Applying it
   ──────────────────────────────────────────────────────────────────────────── */

/** A tracker report, moved onto the video's clock. */
export function shiftTimes(list, offset, { duration = 0 } = {}) {
  if (!Array.isArray(list) || !offset) return Array.isArray(list) ? list : [];
  const max = duration > 0 ? duration : Infinity;
  return list
    .map((s) => ({ ...s, t: round3(Number(s.t) + offset) }))
    .filter((s) => Number.isFinite(s.t) && s.t >= 0 && s.t <= max);
}

/**
 * The opening of a demo, where the tracker saw nothing because nothing moved.
 *
 * Two samples at the position the video says the pointer was parked: one at the
 * very start and one just before it was first seen moving. smoothTrack reads
 * that as a run, a hold and then the real track, which is exactly what
 * happened. Without it the demo opens with no pointer of ours at all and the
 * small captured one sitting there on its own.
 *
 * It refuses more often than it fires, and should: a pointer that was already
 * moving when the recording started has no parked position to find, and an
 * invented one is the bug this whole change is undoing.
 */
export function fillOpening(track, parked, { minGap = 0.6, maxLead = 0.6 } = {}) {
  if (!Array.isArray(track) || !track.length || !parked) return track || [];
  const first = track[0];
  if (!(first.t >= minGap)) return track;
  // The hole we found has to be the one that STARTS this track. A departure
  // detected long before the first sighting belongs to some other movement the
  // browser managed to miss, and filling from it would assert the pointer sat
  // somewhere it had already left.
  if (!(Math.abs(parked.t - first.t) <= maxLead)) return track;

  // The step from the arrival to the hole, applied to where the browser had the
  // pointer AT THAT SAME MOMENT — not at its first sample, which is a frame or
  // two earlier and, since the pointer is by definition moving, somewhere else.
  // Falls back to the hole's own corner when the arrival could not be measured,
  // which happens when the pointer lands on something its own colour.
  const ref = parked.dx != null ? sampleAt(track, parked.t) : null;
  const x = ref ? clamp(ref.x + parked.dx, 0, 1) : parked.x;
  const y = ref ? clamp(ref.y + parked.dy, 0, 1) : parked.y;
  const at = (t) => ({ t: round3(t), x: round3(x), y: round3(y), shape: "default", conf: 0.5 });
  return [at(0), at(Math.max(0.05, first.t - 0.08)), ...track];
}

/**
 * The same measurement again, at the recording's own resolution.
 *
 * ── WHY IT IS WORTH A SECOND PASS ────────────────────────────────────────────
 * Everything above runs over a 480 pixel working copy, which is all the energy
 * series needs and a quarter of the work. For the parked position it is not
 * enough: each of those pixels is four of the recording's, so the corner of a
 * patch is a dozen source pixels uncertain, and the whole point of knowing
 * where the pointer sat is to draw ours exactly on top of it. Ours is a third
 * larger than the captured one — a dozen pixels out and the original shows from
 * underneath, which is the two-pointer bug arriving by a different route.
 *
 * So one moment, already located to within a frame or two, is read again at
 * full size: about a second of video, a dozen frames, and the answer is good to
 * a pixel or two. Anything that goes wrong here leaves the coarse answer in
 * place rather than failing the analysis.
 */
async function refineParked(video, approx, { width, height, fps }) {
  if (!approx || !(width > 0) || !(height > 0)) return approx;
  const start = Math.max(0, approx.t - 0.5);
  const N = width * height;
  let prev = null;
  let found = null;
  let i = 0;

  await ffmpegToFrames(video, {
    width,
    height,
    fps,
    pixelFormat: "gray",
    start,
    duration: 1.2,
    onFrame: (buf) => {
      const t = start + i / fps;
      i++;
      if (!prev) { prev = Buffer.from(buf); return; }
      if (found) { buf.copy(prev); return; }
      const mask = new Uint8Array(N);
      let changed = 0;
      for (let j = 0; j < N; j++) {
        const d = buf[j] - prev[j];
        if (d > DIFF || d < -DIFF) { mask[j] = 1; changed++; }
      }
      if (changed > 0 && changed < N * 0.02) {
        const cs = patches(mask, width, height, buf, prev);
        const left = cs.filter((c) => c.arrival < -20 && c.was >= 40).sort((a, b) => a.arrival - b.arrival)[0];
        const came = cs.filter((c) => c.arrival > 20 && c.now >= 40).sort((a, b) => b.arrival - a.arrival)[0];
        if (left) {
          found = {
            t: round3(t),
            x: round3(left.x0 / width),
            y: round3(left.y0 / height),
            dx: came ? round3((left.x0 - came.x0) / width) : null,
            dy: came ? round3((left.y0 - came.y0) / height) : null,
          };
        }
      }
      buf.copy(prev);
    },
  });

  return found || approx;
}

/**
 * Sightings with no neighbour, dropped.
 *
 * A pointer that is moving is seen repeatedly; one sighting on its own, with
 * nothing either side of it, is something that flickered once — the tail of a
 * spinner the filter above did not quite cover, a compression artefact, a
 * dialog's drop shadow. Drawn, it is the pointer jumping across the picture for
 * a single frame and back. Held instead, it is nothing at all.
 */
function dropLoners(track, { reach = 0.4 } = {}) {
  if (track.length < 3) return track;
  return track.filter((p, i) => {
    const prev = track[i - 1];
    const next = track[i + 1];
    const near = (q) => q && Math.abs(num(q.t) - num(p.t)) <= reach;
    return near(prev) || near(next);
  });
}

/** The browser's pointer position at a moment, interpolated between samples. */
function sampleAt(track, t) {
  if (!track.length) return null;
  if (t <= track[0].t) return track[0];
  if (t >= track[track.length - 1].t) return track[track.length - 1];
  let lo = 0;
  let hi = track.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = track[lo];
  const b = track[hi];
  const span = b.t - a.t;
  if (!(span > 0)) return a;
  const k = (t - a.t) / span;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/**
 * Measure the offset and move the browser's report onto the video's clock.
 *
 * Degrades the way every other pass in the analysis does: a video that cannot
 * be read, or a recording with nothing in it to align, returns the capture
 * untouched and says so, rather than failing the analysis.
 *
 * @returns {{ track, motion, sync }}
 */
export async function alignCapture({ video, capture = {}, duration = 0, sourceWidth = 1920, sourceHeight = 1080 }) {
  const track = Array.isArray(capture.track) ? capture.track : [];
  const motion = Array.isArray(capture.motion) ? capture.motion : [];
  const bare = { track, motion, screen: null, sync: { offset: 0, score: 0, margin: 0, confident: false, cursor_px: 0, parked: false, spinners: 0, reason: "" } };
  if (!video || !motion.length) return { ...bare, sync: { ...bare.sync, reason: "nothing to align" } };

  let screen;
  try {
    screen = await readScreen(video, { duration, sourceWidth, sourceHeight });
  } catch (err) {
    console.error("[studio] sync: could not re-read the recording:", err);
    return { ...bare, sync: { ...bare.sync, reason: "the recording could not be re-read" } };
  }

  const found = clockOffset(motion, screen, { duration });
  const offset = found.confident ? found.offset : 0;
  const shifted = shiftTimes(track, offset, { duration });

  let parked = screen.parked;
  if (parked && sourceWidth > 0 && sourceHeight > 0) {
    parked = await refineParked(video, parked, { width: sourceWidth, height: sourceHeight, fps: screen.fps })
      .catch((err) => { console.error("[studio] sync: parked refinement failed:", err); return screen.parked; });
  }
  const opened = fillOpening(shifted, parked);

  /**
   * ── SIGHTINGS INSIDE AN ANIMATION ARE NOT SIGHTINGS ──────────────────────
   * A spinner out-competes the pointer for the tracker's attention, so any
   * sample that lands on one is a spinner reported as a mouse. Dropping it
   * leaves a gap, and a gap means "held where it was last seen" — which, while
   * a page loads, is what the pointer was really doing.
   */
  const clean = dropLoners(opened.filter((s2) => !inBusy(screen, num(s2.t), num(s2.x), num(s2.y))));

  return {
    track: clean,
    motion: shiftTimes(motion, offset, { duration }),
    screen,
    sync: {
      ...found,
      offset,
      cursor_px: screen.cursorPx,
      parked: opened.length > shifted.length,
      spinners: screen.busy ? screen.busy.length : 0,
      dropped: opened.length - clean.length,
      reason: found.confident ? "" : "too little movement to line the two clocks up; left as recorded",
    },
  };
}

export default { readScreen, clockOffset, shiftTimes, fillOpening, inBusy, alignCapture };

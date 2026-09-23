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

/* ────────────────────────────────────────────────────────────────────────────
   Reading the page as something that moves under a viewport
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * ── SCROLL WAS A BOOLEAN, AND THAT COST REAL CLICKS ──────────────────────────
 * Everything upstream knows one thing about scrolling: it happened, or it did
 * not. That is enough to refuse a press and not enough to refuse the right
 * ones. On one production recording FIVE OF TEN presses were turned down for
 * "the page was scrolling", and both of the creator's real clicks were on the
 * navigation bar — which is FIXED. It does not move when the page scrolls, so
 * "the page scrolled" says nothing whatever about whether the thing under the
 * pointer was clicked.
 *
 * events.js states the problem and concludes there is no way out:
 *
 *   "There is no cheap third signal that separates them."
 *
 * There is, and it is this: measure the translation of each PART of the screen
 * separately. A part that stays still while the rest of the frame moves is
 * fixed, and a click on something fixed is not explained away by a scroll.
 *
 * ── HOW A REGION'S TRANSLATION IS MEASURED ───────────────────────────────────
 * The frame is divided into a coarse grid. Each cell's rows are summed into a
 * brightness profile, and that profile is slid against the PREVIOUS frame's
 * profile for the same columns — over the whole frame height, not just the
 * cell's own. Sliding a short template over a long one is what lets a cell
 * thirty pixels tall report a shift of eighty: the question is not "how far did
 * this cell move" but "where did this cell's content come from".
 *
 * A cell with nothing in it has a flat profile and would answer "no shift" with
 * total confidence, which is how a blank margin would be reported as a fixed
 * navigation bar. So a cell only votes when it has texture to measure.
 */
const SCROLL_COLS = 4;
/**
 * Sixteen rows and not eight, because of what is actually being looked for. A
 * fixed navigation bar is about seventy pixels on a 1020-tall recording —
 * seven per cent of the frame. Against eight rows that is barely half a cell,
 * so the cell holds the bar AND the page scrolling under it, and whichever has
 * more texture wins: the answer would be decided by how busy the page happened
 * to be rather than by where the bar ends. Sixteen puts the bar in a cell of
 * its own.
 */
const SCROLL_ROWS = 16;
/**
 * How far the page may have travelled between two frames, as a share of the
 * frame's height. A quarter covers a hard wheel flick at 12fps; beyond that the
 * two pictures have nothing in common and the answer would be arbitrary.
 */
const SCROLL_RANGE = 0.25;
/** Below this variance a cell's profile is flat and it does not get a vote. */
const SCROLL_TEXTURE = 8;
/** Frame shift, in rows of the read frame, below which nothing really moved. */
const SCROLL_MOVED = 3;
/** ...and how close to zero a cell must be, in the same units, to be "fixed". */
const SCROLL_STILL = 1.5;
/** How many scrolling frames a cell must sit out before it is called fixed. */
const STICKY_VOTES = 3;
/**
 * And how decisively. A cell that sits out some scrolls and rides others is a
 * cell the measurement is confused about, not a fixed one, and calling it fixed
 * would retire the scroll penalty exactly where the penalty is right.
 */
const STICKY_MARGIN = 2;
/**
 * The most of the frame browser furniture may be. A tab strip and an address
 * bar are about a tenth of a 1080p screen; past this it is a page whose upper
 * part happens not to scroll, and reporting none is better than discounting it.
 */
const CHROME_MAX = 0.15;
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

/**
 * How much of the recording a cell must spend animating before it is a
 * candidate for being video rather than interface.
 *
 * A third. Measured on a drawn test clip with a video filling a quarter of the
 * screen, the cells inside it came out at 47% — a real video does not repaint
 * every cell on every frame either, because most frames of most videos are
 * largely the same as the last. Half was too strict to catch it at all.
 */
const PLAYING_SHARE = 1 / 3;

/**
 * ...and how many connected cells of that kind make a video.
 *
 * The grid is 40 wide, so twenty-four cells is roughly a twentieth of the
 * screen. A spinner covers two to six; a hero video covers well over a
 * hundred. Nothing a page does at this size repaints continuously except
 * moving pictures.
 */
const PLAYING_CELLS = 24;

/**
 * ...and the share of the WHOLE SCREEN past which this measurement is not
 * believed at all.
 *
 * ── A SAFETY VALVE, ADDED AFTER IT BROKE A REAL RECORDING ──────────────────
 * The two tests above are a good description of a demo video on an otherwise
 * quiet page, which is what they were drawn against. On a real page they are
 * not nearly strict enough: a recording of cursorful.com flagged 520 of its 960
 * cells — more than half the screen — because a real page animates almost
 * everywhere at once, with hover states, gradients, carousels, lazy images and
 * a video. The veto then excluded the creator's own pointer along with
 * everything else, and the locator went from finding it in 98% of frames to
 * finding it in none.
 *
 * The lesson is not a better threshold. It is that this measurement has a range
 * outside which it is meaningless, and it must say so rather than guess. If
 * more than a third of the screen looks like moving pictures, then either the
 * page really is mostly video — in which case there is no quiet region to
 * retreat to and the veto buys nothing — or, far more likely, the measurement
 * is wrong. Both answers are the same answer: report nothing and let the
 * locator work exactly as it did before this existed.
 *
 * Failing open is deliberate. A missed content cursor costs some wrong zooms,
 * which the model veto in events.js mediaUnder() then catches on the way to the
 * camera. A pointer vetoed by mistake costs the whole recording its cursor, and
 * nothing downstream can recover it.
 */
const PLAYING_MAX_COVER = 0.35;

/** The widest disagreement between the two clocks worth searching for. */
const MAX_OFFSET = 3;
/** Correlation the best shift must reach before it is believed. */
const MIN_SCORE = 0.3;
/** ...and how much better than the runner-up it has to be. */
const MIN_MARGIN = 1.2;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round3 = (v) => Math.round(v * 1000) / 1000;
const round4 = (v) => Math.round(v * 10000) / 10000;
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
/**
 * Row-brightness profiles for each cell of the scroll grid, one frame.
 *
 * Returned as one flat array of Float32Arrays, cell-major, so a frame's worth
 * is allocated once and compared against the frame before it without copying
 * anything the size of the picture.
 */
function scrollProfiles(buf, W, H) {
  const sw = W / SCROLL_COLS;
  const out = [];
  for (let s = 0; s < SCROLL_COLS; s++) {
    const x0 = Math.floor(s * sw);
    const x1 = Math.min(W, Math.floor((s + 1) * sw));
    const prof = new Float32Array(H);
    for (let y = 0; y < H; y++) {
      let sum = 0;
      const base = y * W;
      // Every second column: a brightness profile does not need the detail and
      // this is the inner loop of the whole pass.
      for (let x = x0; x < x1; x += 2) sum += buf[base + x];
      prof[y] = sum;
    }
    out.push(prof);
  }
  return out;
}

/**
 * Where a band of one strip came from, in rows, or null when it cannot say.
 *
 * `null` is a real answer and the common one: a cell showing a flat panel, an
 * empty margin or a solid header has no vertical texture, and a correlation
 * over it is a measurement of nothing. Voting anyway is how a blank margin
 * becomes a fixed navigation bar.
 */
function bandShift(cur, prev, y0, y1, range) {
  let mean = 0;
  for (let y = y0; y < y1; y++) mean += cur[y];
  mean /= Math.max(1, y1 - y0);

  let varSum = 0;
  for (let y = y0; y < y1; y++) {
    const d = cur[y] - mean;
    varSum += d * d;
  }
  // Normalised against the band's own brightness, so a dark region is not
  // called flat for being dark.
  if (varSum / Math.max(1, y1 - y0) / Math.max(1, mean) < SCROLL_TEXTURE) return null;

  let best = 0;
  let bestErr = Infinity;
  let second = Infinity;
  const H = cur.length;
  for (let s = -range; s <= range; s++) {
    let err = 0;
    let n = 0;
    for (let y = y0; y < y1; y++) {
      const py = y + s;
      if (py < 0 || py >= H) continue;
      const d = cur[y] - prev[py];
      err += d * d;
      n++;
    }
    if (n < (y1 - y0) * 0.6) continue;
    err /= n;
    if (err < bestErr) {
      second = bestErr;
      bestErr = err;
      best = s;
    } else if (err < second) {
      second = err;
    }
  }
  /**
   * A match that is no better than the runner-up is not a match. Repeating
   * content — a list of identical rows, a table, a grid of cards — fits
   * equally well at several offsets, and picking whichever won by a rounding
   * error would report a scroll that never happened.
   */
  if (!Number.isFinite(bestErr) || (Number.isFinite(second) && bestErr > second * 0.85)) return null;
  return best;
}

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

  /**
   * ── THE PAGE AS SOMETHING THAT MOVES UNDER A VIEWPORT ────────────────────
   * Per-frame vertical translation, and which parts of the screen sat it out.
   * See scrollProfiles / bandShift above for how a region's travel is measured
   * and why a region with no texture does not get a vote.
   */
  const scroll = [];
  const stayed = new Int32Array(SCROLL_COLS * SCROLL_ROWS);
  const rode = new Int32Array(SCROLL_COLS * SCROLL_ROWS);
  const range = Math.max(4, Math.round(H * SCROLL_RANGE));
  let prevProf = null;
  let offset = 0;
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
        scroll.push({ t: 0, dy: 0, offset: 0 });
        prevProf = scrollProfiles(buf, W, H);
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
      /**
       * ── AND HOW FAR THE PAGE TRAVELLED, PART BY PART ────────────────────
       * Measured on every frame rather than only on frames that look like a
       * scroll: a fixed bar can only be recognised by what it does WHILE the
       * page moves, and which frames those are is what this is working out.
       */
      const prof = scrollProfiles(buf, W, H);
      const bh = H / SCROLL_ROWS;
      const shifts = new Array(SCROLL_COLS * SCROLL_ROWS).fill(null);
      const seen = [];
      for (let sx = 0; sx < SCROLL_COLS; sx++) {
        for (let by = 0; by < SCROLL_ROWS; by++) {
          const y0 = Math.floor(by * bh);
          const y1 = Math.min(H, Math.floor((by + 1) * bh));
          const d = bandShift(prof[sx], prevProf[sx], y0, y1, range);
          shifts[by * SCROLL_COLS + sx] = d;
          if (d != null) seen.push(d);
        }
      }

      /**
       * The frame's own travel is the MEDIAN of what its regions reported, not
       * the mean. A fixed bar reports zero however far the page went, and a
       * mean would let it drag the answer toward zero — which is the one error
       * that matters here, because it would hide the scroll that the bar is
       * being recognised by sitting out.
       */
      let dy = 0;
      if (seen.length >= 3) {
        seen.sort((a, b) => a - b);
        dy = seen[seen.length >> 1];
      }
      if (Math.abs(dy) >= SCROLL_MOVED) {
        offset += dy;
        for (let c = 0; c < shifts.length; c++) {
          const d = shifts[c];
          if (d == null) continue;
          if (Math.abs(d) <= SCROLL_STILL) stayed[c]++;
          else if (Math.abs(d - dy) <= Math.max(SCROLL_STILL, Math.abs(dy) * 0.3)) rode[c]++;
        }
      }
      scroll.push({
        t: round3((energy.length - 1) / fps),
        // In frame heights, so nothing downstream has to know this pass reads
        // at 480 wide. Positive means the content moved DOWN the screen.
        dy: round4(dy / H),
        offset: round4(offset / H),
      });
      prevProf = prof;

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
    /**
     * ── THE VIEWPORT, RECONSTRUCTED ──────────────────────────────────────────
     * `scroll` is per-frame travel and the running total, both in frame
     * heights. `sticky` is the coarse grid of regions that stayed put while the
     * rest of the picture moved — a fixed navigation bar, a docked rail, a
     * toolbar pinned above a list.
     *
     * Both are pixels only. They work with the model pass off, on a recording
     * of any application, and they are what lets confirmClicks() stop refusing
     * a press on a fixed bar because the page behind it moved.
     */
    scroll,
    sticky: stickyCells(stayed, rode),
    scrollGrid: { w: SCROLL_COLS, h: SCROLL_ROWS },
  };
}

/**
 * Which cells of the scroll grid are fixed.
 *
 * ── DECISIVELY, OR NOT AT ALL ────────────────────────────────────────────────
 * A cell qualifies by sitting out several scrolls AND by riding along with
 * hardly any. A cell that does both is not a fixed bar, it is a cell the
 * measurement is unsure about — a region half covered by a sticky header, a
 * panel that scrolls independently, a page whose own content happens to hold
 * still — and calling it fixed would retire the scroll penalty in exactly the
 * place the penalty is right.
 */
function stickyCells(stayed, rode) {
  const out = new Uint8Array(stayed.length);
  for (let c = 0; c < stayed.length; c++) {
    out[c] = stayed[c] >= STICKY_VOTES && stayed[c] >= rode[c] * STICKY_MARGIN ? 1 : 0;
  }
  return out;
}

/**
 * Is this point inside a part of the screen that does not scroll?
 *
 * @param {object} screen  as readScreen() returns it
 * @param {number} x       0..1 across the frame
 * @param {number} y       0..1 down the frame
 */
export function isSticky(screen, x, y) {
  const g = screen?.scrollGrid;
  const cells = screen?.sticky;
  if (!g || !cells?.length) return false;
  // sync.js num() has no default, so the fallback is spelled out: a point
  // nobody could place is treated as the middle of the frame, which is not
  // sticky on any layout this has seen.
  const fx = Number.isFinite(Number(x)) ? Number(x) : 0.5;
  const fy = Number.isFinite(Number(y)) ? Number(y) : 0.5;
  const cx = Math.min(g.w - 1, Math.max(0, Math.floor(fx * g.w)));
  const cy = Math.min(g.h - 1, Math.max(0, Math.floor(fy * g.h)));
  return cells[cy * g.w + cx] === 1;
}

/**
 * What explains the motion at a point, at a moment.
 *
 * ── THE SEGMENTATION WAS ALREADY THERE, IN FOUR PLACES ───────────────────────
 * Four different things make pixels change in a screen recording and this
 * pipeline already tells them apart — but each with its own instrument, in its
 * own file, answering its own question:
 *
 *   the page scrolling      readScreen's per-region translation, above
 *   a video playing         playingRegions(), which finds what animates all
 *                           recording long
 *   an animation running    readGrids()'s busy cells, which find what changes
 *                           in one place for half a second
 *   the pointer itself      locate.js, which finds the thing shaped like a
 *                           cursor
 *
 * Nothing had ever put them together and asked the obvious question — WHY did
 * this change — so every caller that wanted the answer re-derived a piece of it.
 * This is that question, answered once.
 *
 * The order matters and is not arbitrary. A region that is a video is a video
 * whatever else is true of it; a frame that scrolled is explained by the scroll
 * before it is explained by anything local; an animation is a local fact about
 * one place. What is left — motion at a point, on a frame that did not scroll,
 * outside any video or animation — is the page responding to something, which
 * is the only kind this product wants to point a camera at.
 *
 * @returns {"video"|"scroll"|"animation"|"content"|"still"}
 */
export function explainMotion(screen, t, x, y, { playing = null } = {}) {
  if (!screen) return "still";
  if (playing?.size && inPlaying(playing, screen, x, y)) return "video";

  const list = screen.scroll;
  if (Array.isArray(list) && list.length) {
    let near = null;
    for (const p of list) {
      if (near && Math.abs(num(p.t) - t) >= Math.abs(num(near.t) - t)) break;
      near = p;
    }
    if (near && Math.abs(num(near.dy)) >= 0.004 && !isSticky(screen, x, y)) return "scroll";
  }

  if (inBusy(screen, t, x, y)) return "animation";

  const cover = coverAt(screen, t);
  return cover > 0.002 ? "content" : "still";
}

/** How much of the screen changed at a moment, from the motion series. */
function coverAt(screen, t) {
  const series = screen?.motion;
  if (!Array.isArray(series) || !series.length) return 0;
  let best = null;
  for (const m of series) {
    if (best && Math.abs(num(m.t) - t) >= Math.abs(num(best.t) - t)) break;
    best = m;
  }
  return best ? num(best.cover) : 0;
}

/**
 * How much of the top of the frame is the browser's own furniture.
 *
 * ── DETECTED GENERICALLY, BECAUSE A LIST OF BROWSERS IS A BLOCKLIST ──────────
 * The obvious way to do this is to recognise Chrome's tab strip, Arc's
 * sidebar, Safari's compact toolbar and Edge's Copilot rail. That is a list,
 * and a list is only ever as long as the browsers somebody thought to test —
 * which is the pattern this codebase already refused once, in confirmClicks:
 *
 *   "we should not hard code what things need to be ignored … if we follow that
 *    simple rule, any other new interaction comes, it simply ignores it."
 *
 * Two signals do it without naming anybody:
 *
 *   the capture surface   a TAB capture has no browser furniture in it at all,
 *                         by construction. getDisplayMedia says which was
 *                         shared and capture.js already records it, so this is
 *                         free and exact for the commonest case.
 *   what does not scroll  browser furniture is at the top of the frame and
 *                         never moves, whatever browser drew it. The sticky
 *                         grid already knows.
 *
 * ── AND WHAT THIS CANNOT DO ──────────────────────────────────────────────────
 * It cannot tell a browser's chrome from a page's own fixed header, because
 * from pixels alone they are the same thing: a band at the top that does not
 * move. So it is used as weak evidence and never as a veto — clicking a tab or
 * an address bar is a real thing to show in a demo, and a press there with a
 * named control or an acknowledgement behind it is believed exactly as any
 * other is.
 */
export function chromeBand(screen, capture = null) {
  /**
   * ── ONLY WHERE FURNITURE IS EVEN POSSIBLE ─────────────────────────────────
   * A tab capture contains the page and nothing else, so there is nothing to
   * find. And an UNKNOWN surface is treated the same way, deliberately: the
   * band this looks for — rows at the top that never scroll — is exactly what
   * a page's own fixed header looks like, and discounting one of those is the
   * opposite of what the sticky work was for. Measured on the test page with a
   * seventy-pixel nav bar, guessing wrong took a real press from 0.75 to the
   * bar itself.
   *
   * So it fires only when getDisplayMedia actually said a whole screen or a
   * window was shared, which is when browser furniture is in the picture at
   * all. Anything else reports none.
   */
  const surface = String(capture?.surface || "");
  if (surface !== "monitor" && surface !== "window") return 0;
  const g = screen?.scrollGrid;
  const cells = screen?.sticky;
  if (!g || !cells?.length) return 0;

  let rows = 0;
  for (let cy = 0; cy < g.h; cy++) {
    let stuck = 0;
    for (let cx = 0; cx < g.w; cx++) if (cells[cy * g.w + cx]) stuck++;
    // Most of the row, not some of it: furniture spans the window.
    if (stuck < g.w * 0.6) break;
    rows++;
  }
  /**
   * A band more than a fifth of the frame tall is not furniture, it is a page
   * whose whole upper half happens not to scroll — a hero section, a dashboard
   * header, a sidebar layout read row-wise. Better to report none than to
   * discount a fifth of the picture.
   */
  const band = rows / g.h;
  return band > CHROME_MAX ? 0 : band;
}

/**
 * How far the page had scrolled by a moment, in frame heights.
 *
 * The running total, so two moments can be compared: a control seen at y = 0.4
 * when the offset was 2.1 and again at y = 0.4 when it was 3.6 is not the same
 * control, and one seen at 0.4 and then 0.25 after the page moved 0.15 is.
 */
export function scrollAt(screen, t) {
  const list = screen?.scroll;
  if (!Array.isArray(list) || !list.length) return 0;
  const want = num(t);
  let lo = 0;
  let hi = list.length - 1;
  if (want <= num(list[0].t)) return num(list[0].offset);
  if (want >= num(list[hi].t)) return num(list[hi].offset);
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (num(list[mid].t) <= want) lo = mid;
    else hi = mid;
  }
  return num(list[lo].offset);
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
 * How much of the recording each cell of the grid spent animating, and which
 * cells were animating for most of it.
 *
 * ── THE PROBLEM THIS EXISTS FOR: A CURSOR THAT IS NOT THE CURSOR ────────────
 * locate.js finds the pointer by looking for the thing that looks exactly like
 * a pointer. On a page with a product demo playing on it — which is every
 * competitor's home page, and a great many real products — there are TWO such
 * things, and the one inside the video is a genuine operating-system pointer
 * recorded from somebody else's screen. It is not noise. It fits the template
 * as well as the real one because it IS one, and it moves, so every test that
 * separates a pointer from the page passes it.
 *
 * What separates them is not how they look but WHERE they live. The real
 * pointer is composited on top of everything and goes wherever the hand goes;
 * the other one is a picture inside a rectangle that is repainting itself
 * thirty times a second for the whole recording, and it can never leave.
 *
 * readGrids() above already measures exactly that — its own comment names "a
 * playing video" as the thing it detects — but as short spans, which cannot
 * tell a hero video that plays throughout from a spinner during one load. This
 * totals them: a cell busy for most of the recording is a video, and a pointer
 * found inside one is somebody else's.
 *
 * ── DELIBERATELY NOT USED TO REJECT A POINTER THAT IS BEING FOLLOWED ────────
 * A creator moving their own pointer onto a playing video to press pause is
 * ordinary, and their pointer is then inside one of these regions. The caller
 * applies this only where there is no continuity to reason from — calibration,
 * and re-acquiring a pointer that was lost — never to a pointer it is already
 * following frame to frame. See locate.js.
 *
 * ── THE VALVE IS ABOUT REJECTING, NOT ABOUT CHOOSING ────────────────────────
 * `cap` is how much of the screen may animate before this refuses to answer.
 * The default exists because the answer is used to REJECT a pointer sighting,
 * and a measurement that calls most of the screen a video would reject the
 * real pointer everywhere — better to say nothing.
 *
 * Calibration asks the same question for the opposite purpose. There the veto
 * keeps a template from being FITTED to video pixels, and saying nothing means
 * the video gets to pick the cursor. That is exactly what happened on a
 * recording of a landing page with an embedded player:
 *
 *   456 of 840 screen cells look like moving pictures … the content-cursor
 *   check is skipped for this recording
 *   pointer calibration: dark:21 … mean 0.842  |  light:17 … mean 0.798
 *
 * The creator is on Windows, whose arrow is light, and their other recordings
 * on the same machine calibrate to light 18px and find the pointer in 88% of
 * frames. This one chose dark on five sample frames it was free to match
 * inside a dark video, and found the pointer in 38% — losing it precisely
 * during the fast moves to the navigation bar, so every press there was
 * written down at a stale position with nothing under it.
 *
 * So the cap is the caller's to set. `cap: 1` returns the measurement whatever
 * its size, for a caller that would rather have a crude veto than none.
 *
 * @param {object} screen  from readScreen()
 * @param {number} duration
 * @param {number} [share] fraction of the recording a cell must animate for
 * @param {number} [cap]   share of the screen past which this reports nothing
 * @returns {Set<number>} cell indices, empty when there is nothing to report
 */
export function playingRegions(screen, { duration = 0, share = PLAYING_SHARE, least = PLAYING_CELLS, cap = PLAYING_MAX_COVER } = {}) {
  const out = new Set();
  if (!screen?.busy?.length || !screen.grid || !(duration > 0)) return out;

  const total = new Map();
  for (const s of screen.busy) {
    const secs = Math.max(0, num(s.end) - num(s.start));
    total.set(s.c, (total.get(s.c) || 0) + secs);
  }
  const hot = new Set();
  for (const [c, secs] of total) if (secs / duration >= share) hot.add(c);
  if (!hot.size) return out;

  /**
   * ── SIZE IS WHAT TELLS A VIDEO FROM A SPINNER ─────────────────────────────
   * How OFTEN a cell repaints cannot do it on its own. A page that spends four
   * seconds of a ten second demo loading has a spinner that is busy 40% of the
   * time — the same share a video reaches — and the pointer is very often
   * resting right beside it, waiting. Refusing that region would throw away
   * exactly the sighting parked.mjs exists to protect.
   *
   * Their SHAPES are nothing alike. A spinner is a handful of cells; a video is
   * a rectangle covering a good part of the screen. So the busy cells are
   * grouped into connected blobs and only the big ones count.
   */
  const gw = screen.grid.w;
  const gh = screen.grid.h;
  const seen = new Set();
  for (const start of hot) {
    if (seen.has(start)) continue;
    const blob = [];
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const c = queue.pop();
      blob.push(c);
      const y = (c / gw) | 0;
      const x = c - y * gw;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const n = ny * gw + nx;
        if (!hot.has(n) || seen.has(n)) continue;
        seen.add(n);
        queue.push(n);
      }
    }
    if (blob.length >= least) for (const c of blob) out.add(c);
  }

  // Past the valve this says nothing rather than something wrong. See above.
  if (out.size > gw * gh * cap) {
    console.log(
      "[studio] " + out.size + " of " + gw * gh + " screen cells look like moving pictures, which is too much of it " +
        "to be a video playing on a page; the content-cursor check is skipped for this recording"
    );
    return new Set();
  }
  return out;
}

/**
 * Is this point inside one of those regions?
 *
 * Padded by a cell, the same slack inBusy() uses: the grid is coarse and a
 * video's edge rarely lands on a cell boundary.
 */
export function inPlaying(regions, screen, x, y) {
  if (!regions?.size || !screen?.grid) return false;
  const gw = screen.grid.w;
  const gh = screen.grid.h;
  const cx = Math.min(gw - 1, Math.max(0, Math.floor(num(x) * gw)));
  const cy = Math.min(gh - 1, Math.max(0, Math.floor(num(y) * gh)));
  for (const c of regions) {
    const sy = (c / gw) | 0;
    const sx = c - sy * gw;
    if (Math.abs(sx - cx) <= BUSY_PAD && Math.abs(sy - cy) <= BUSY_PAD) return true;
  }
  return false;
}

/**
 * When the screen went quiet again after a moment.
 *
 * ── THE CAMERA WAS LEAVING BEFORE THE ANSWER ARRIVED ─────────────────────────
 * A zoom holds for a fixed beat after the press (events.js HOLD). That is right
 * when a control responds instantly and wrong whenever it does not: click "Open
 * Calendar", the camera pushes in, and what the viewer is shown for the length
 * of the hold is a grey loading skeleton — then the camera pulls out at the
 * exact moment the real calendar renders. The wait is framed and the payoff is
 * not, which is the reverse of what a demo is for.
 *
 * A press is worth watching until its result is ON SCREEN and STILL. That is
 * measurable from the same series everything else here is measured from: the
 * screen is settled once the change per frame has been under the noise floor
 * for a moment together.
 *
 * Bounded at both ends. Never shorter than the beat a fast control deserves,
 * and never longer than `max` — a page that never settles (a video, a ticker, a
 * progress bar that runs for a minute) must not hold the camera hostage.
 *
 * ── AND `max` TURNED OUT TO BE THE WHOLE LENGTH OF A SHOT ────────────────────
 * It was 2.6s, chosen as a ceiling for the rare page that keeps moving. On a
 * real demo it was not rare at all — measured across one 33.7s recording, five
 * of seven shots held 2.25 to 2.59 seconds after their press, every one of them
 * up against that ceiling. An app whose content streams in after a click never
 * goes quiet inside the window, so the ceiling stopped being an exception and
 * became the normal length of a zoom.
 *
 * The creator named what the shot is for, which settles what the ceiling should
 * be: "we need to zoom in the area where a button or clickable UI element needs
 * to be zoomed in so on screen every user can see what the user has clicked".
 * That is showing WHAT WAS PRESSED, not waiting out whatever it loaded. A
 * second is long enough to read a control and see it respond; past
 * that the viewer is watching a crop of a page for reasons of their own.
 *
 * `min` is untouched, so a control that answers at once is unaffected — this
 * shortens only the shots that were running to the ceiling.
 *
 * @returns {number} seconds after `t`, within [min, max]
 */
export function settleAfter(screen, t, { min = 0.45, max = 0.8, quiet = 0.012, forMs = 300 } = {}) {
  const series = screen?.motion;
  if (!Array.isArray(series) || !series.length) return min;

  const fps = num(screen.fps) || 12;
  const beat = Math.max(2, Math.round((forMs / 1000) * fps)) / fps;

  /**
   * ── A PAGE THAT IS WAITING LOOKS EXACTLY LIKE A PAGE THAT IS FINISHED ─────
   * This used to return at the FIRST quiet run, and quiet is not the same
   * question as done. Click something that fetches and the screen goes: the
   * panel opens, then nothing at all while the request is in flight, then the
   * data lands. That silence in the middle is the wait, and reading it as the
   * answer sent the camera home before the answer existed.
   *
   * A spinner does not save it either — it is the one thing that CANNOT show
   * up here, because self-animating cells are held in the busy mask and
   * excluded from `cover` on purpose (see readScreen). So a panel showing a
   * spinner over a grey skeleton is, to this measurement, perfectly still.
   *
   * Measured against the shapes real pages make, the old rule missed the
   * payoff on four loading patterns out of five, by up to 1.4 seconds.
   *
   * The fix is to ask when the screen last changed rather than when it first
   * stopped, and to leave a beat after that. A control that answers instantly
   * has nothing after its own response and still gets `min`, which is what
   * every recording analysed before this got.
   */
  let last = -Infinity;

  for (const m of series) {
    const dt = num(m.t) - t;
    if (dt < 0) continue;
    if (dt > max) break;
    if (num(m.cover) > quiet) last = dt;
  }

  // Nothing moved at all in the window: the beat a fast control is owed.
  if (!Number.isFinite(last)) return min;
  return clamp(last + beat, min, max);
}

/**
 * How much of a changed region was something animating on its own.
 *
 * ── inBusy() ASKS ABOUT A POINT, AND A VIDEO IS NOT A POINT ──────────────────
 * inBusy() exists to throw away a pointer sighting that is really a spinner, so
 * it takes the one position it is suspicious of. The question here is a
 * different one: a press is believed because something CHANGED afterwards, and
 * what has to be ruled out is that the change was a region of the screen moving
 * by itself — a playing video, a carousel, an animated hero.
 *
 * That is a question about an area, and it cannot be answered by sampling a
 * point: the centre of a 900-pixel-wide video is inside it and the centre of
 * the bounding box around "the video AND a button that lit up" may not be.
 *
 * @param {object} screen  readScreen()'s output
 * @param {number} t
 * @param {{x,y,w,h}} box  fractions of the frame
 * @returns {number} 0..1, the share of the box's cells that were animating
 */
export function busyShare(screen, t, box) {
  if (!screen?.busy?.length || !screen.grid || !box) return 0;
  const gw = screen.grid.w;
  const gh = screen.grid.h;

  const x0 = Math.max(0, Math.min(gw - 1, Math.floor(num(box.x) * gw)));
  const y0 = Math.max(0, Math.min(gh - 1, Math.floor(num(box.y) * gh)));
  const x1 = Math.max(x0, Math.min(gw - 1, Math.ceil((num(box.x) + num(box.w)) * gw) - 1));
  const y1 = Math.max(y0, Math.min(gh - 1, Math.ceil((num(box.y) + num(box.h)) * gh) - 1));
  const cells = (x1 - x0 + 1) * (y1 - y0 + 1);
  if (cells <= 0) return 0;

  const hot = new Set();
  for (const s of screen.busy) {
    if (t < s.start - 0.1 || t > s.end + 0.1) continue;
    const sy = (s.c / gw) | 0;
    const sx = s.c - sy * gw;
    if (sx < x0 || sx > x1 || sy < y0 || sy > y1) continue;
    hot.add(s.c);
  }
  return hot.size / cells;
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

/**
 * ── A HAND CANNOT DO THAT ────────────────────────────────────────────────────
 * The tracker finds the pointer by differencing two frames and taking the most
 * convincing patch of change. Most of the time the most convincing patch of
 * change IS the pointer. When a page repaints, a menu opens or a list redraws,
 * it is whichever piece of the new content happened to land on the busiest
 * background, and the reported position jumps to the middle of the page.
 *
 * Read as a path, those jumps are the pointer crossing the screen and coming
 * back inside two frames. On the recording that prompted this, thirty-two of
 * two hundred and twenty-six consecutive sightings required between four and
 * twenty-two THOUSAND pixels per second. A hand on a mouse peaks near four.
 *
 * This is what a viewer reports as "multiple cursors". The drawn pointer flicks
 * to the middle of the page and back while the one burnt into the recording
 * stays where it really was, so for a moment there are two — and because the
 * flick lasts a frame or two, it reads as a second cursor blinking rather than
 * as the first one moving.
 *
 * There is no need to guess which sighting is right. The constraint is
 * physical, it is one-sided, and it costs nothing to apply: a position that
 * could only be reached faster than a hand can move is not the pointer. Drop
 * it, and the gap it leaves means "held where it was last seen", which is what
 * every other gap in this file already means.
 */

/** Frame widths per second a hand can actually move a mouse. */
const MAX_SPEED = 2.5;
/**
 * Past this long between sightings, nothing is impossible: the pointer had time
 * to get anywhere, and the gap is the tracker losing it rather than a move.
 */
const FREE_AFTER = 0.35;

/**
 * ── WHEN THE WHOLE PAGE IS MOVING, NOTHING IN IT IS THE POINTER ──────────────
 * A pointer moving across a screen changes about a tenth of a per cent of the
 * picture: its own few hundred pixels, once where it was and once where it is.
 * The tracker reports a position by picking the most convincing patch of
 * change, which is the right answer exactly when the pointer is the only thing
 * changing.
 *
 * When the page scrolls, or navigates, or a list redraws, several per cent of
 * the picture changes at once, and the most convincing patch is a piece of
 * content. On one recording every single sighting taken while more than three
 * per cent of the screen was changing — fifty-four of two hundred and five —
 * sat along the top edge of the page at y between 0.00 and 0.13, where
 * scrolled content enters and leaves the frame. The creator's pointer was
 * sitting still on a sidebar item the whole time, and ours was drawn darting
 * across the top of the page instead: two cursors.
 *
 * And a real pointer is almost never visible then anyway. During a trackpad
 * scroll it is not moving at all, so it makes no difference to see; during a
 * page load the hand has usually stopped. Dropping these leaves a gap, and a
 * gap means held where it was last seen, which is where it was.
 */
const REPAINT = 0.03;

export function dropRepaints(track, motion) {
  if (!track.length || !motion || !motion.length) return track;
  const m = [...motion].sort((a, b) => num(a.t) - num(b.t));
  const busy = (t) => {
    let lo = 0;
    let hi = m.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (num(m[mid].t) <= t) lo = mid;
      else hi = mid;
    }
    const near = Math.abs(num(m[lo].t) - t) <= Math.abs(num(m[hi].t) - t) ? m[lo] : m[hi];
    return Math.abs(num(near.t) - t) <= 0.08 && num(near.energy) > REPAINT;
  };
  return track.filter((p) => !busy(num(p.t)));
}

/**
 * ── THE POINTER DOES NOT GO ROUND IN CIRCLES ─────────────────────────────────
 * A loading spinner is the tracker's worst enemy and has been through every
 * round of this. It is small, it is high contrast, it sits on a plain
 * background, and unlike almost anything else on a screen it changes on EVERY
 * frame. Whatever the tracker scores, a spinner wins.
 *
 * Two previous attempts worked from the video: find the cells that keep
 * changing and refuse sightings inside them. The trouble is that a ROTATING
 * spinner does not keep changing any one cell. The arc sweeps past a given cell
 * for two frames out of eighteen and is somewhere else the rest of the time, so
 * a threshold set high enough to ignore text shimmer is far too high to catch
 * it — which is exactly what happened: four hundred and seventy-six animated
 * spans were found in one recording and the spinner in the middle of it was not
 * one of them.
 *
 * Looked at as a PATH rather than as a region, it is unmistakable, and it needs
 * no threshold tuned against anything. The pointer went:
 *
 *     (0.578, 0.363) (0.573, 0.372) (0.570, 0.372) (0.563, 0.363)
 *     (0.562, 0.358) (0.581, 0.353) (0.581, 0.357) (0.577, 0.365) ...
 *
 * round and round, twice a second, for two and a half seconds. That is a circle
 * two per cent of the frame across, and the reported path around it was three
 * times the width of the box that contains it.
 *
 * Nothing a hand does looks like that. A pointer at rest has a path length of
 * nearly zero. A pointer travelling has a path length about equal to the box it
 * covers, because it goes from one side of that box to the other. Only
 * something going round and round stays inside a small box while travelling
 * several times its width, so the test is the ratio of the two, and it does not
 * care about contrast, colour, size or frame rate.
 *
 * What is dropped becomes a gap, and a gap means "held where it was last seen",
 * which is what the pointer was really doing while the page loaded.
 */

/** A gap longer than this ends a run: the tracker lost whatever it was on. */
const ORBIT_BREAK = 0.25;
/** Fewer sightings than this in one run says nothing either way. */
const ORBIT_MIN = 7;
/** How long it has to keep it up. Shorter than this is a hand being adjusted. */
const ORBIT_SPAN = 0.4;
/** Spinners are small. A box bigger than this is somebody using the screen. */
const ORBIT_BOX = 0.05;
/**
 * Path length as a multiple of the box it stays inside.
 *
 * Measured across two recordings: runs where the pointer was really resting or
 * really travelling came in at 1.0 to 1.3. The spinner runs came in at 2.2,
 * 2.7, 3.0 and 7.9. There is a wide empty gap between those two populations and
 * this sits in it.
 */
const ORBIT_WIND = 2.0;
/**
 * Once a spinner is proven to be somewhere, sightings around it are its doing
 * too — the short runs either side of a confirmed orbit, too brief to convict
 * on their own. This is how long after the orbit that still applies.
 */
const ORBIT_HALO = 2.0;
/** And how far outside its box. */
const ORBIT_PAD = 0.02;

export function dropOrbits(track, { sourceWidth = 1920, sourceHeight = 1080 } = {}) {
  if (track.length < ORBIT_MIN) return track;
  const ratio = sourceHeight / Math.max(1, sourceWidth);
  const apart = (a, b) => Math.hypot(num(b.x) - num(a.x), (num(b.y) - num(a.y)) * ratio);

  const spinning = new Uint8Array(track.length);
  for (let i = 0; i < track.length; i++) {
    /**
     * The run is grown by the BOX, not by the clock. A fixed time window was
     * the first attempt and it let arcs through: one sighting elsewhere falling
     * inside the window stretches the box, the ratio collapses, and a spinner
     * the tracker had been circling for half a second reads as ordinary travel.
     * Growing only while the path stays inside a spinner-sized box means the
     * run ends where the pointer actually left, which is the honest boundary.
     */
    let x0 = num(track[i].x), x1 = x0;
    let y0 = num(track[i].y), y1 = y0;
    let j = i;
    let path = 0;

    while (j + 1 < track.length) {
      const next = track[j + 1];
      if (num(next.t) - num(track[j].t) > ORBIT_BREAK) break;
      const nx0 = Math.min(x0, num(next.x));
      const nx1 = Math.max(x1, num(next.x));
      const ny0 = Math.min(y0, num(next.y));
      const ny1 = Math.max(y1, num(next.y));
      if (Math.hypot(nx1 - nx0, (ny1 - ny0) * ratio) > ORBIT_BOX) break;
      path += apart(track[j], next);
      x0 = nx0; x1 = nx1; y0 = ny0; y1 = ny1;
      j++;
    }

    const n = j - i + 1;
    const span = num(track[j].t) - num(track[i].t);
    const box = Math.hypot(x1 - x0, (y1 - y0) * ratio);
    if (n < ORBIT_MIN || span < ORBIT_SPAN || !(box > 0)) continue;
    if (path < box * ORBIT_WIND) continue;
    for (let k = i; k <= j; k++) spinning[k] = 1;
    i = j;
  }

  /**
   * ── WHAT THE SPINNER DID EITHER SIDE OF ITS OWN ORBIT ────────────────────
   * A spinner does not start and stop at the boundaries of a convictable run.
   * Around each one sit shorter runs in the same tiny patch of screen — five
   * sightings over a fifth of a second — that carry the same shape but not
   * enough of it to convict alone.
   *
   * They do not need to stand alone. Once an animation is proven to be at a
   * place and a time, a sighting in that same place moments later is far better
   * explained by the animation than by a hand that happened to visit the exact
   * pixels the spinner occupies and then leave again.
   */
  const zones = [];
  for (let i = 0; i < track.length; i++) {
    if (!spinning[i]) continue;
    let j = i;
    while (j + 1 < track.length && spinning[j + 1]) j++;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let k = i; k <= j; k++) {
      x0 = Math.min(x0, num(track[k].x)); x1 = Math.max(x1, num(track[k].x));
      y0 = Math.min(y0, num(track[k].y)); y1 = Math.max(y1, num(track[k].y));
    }
    zones.push({
      x0: x0 - ORBIT_PAD, x1: x1 + ORBIT_PAD,
      y0: y0 - ORBIT_PAD, y1: y1 + ORBIT_PAD,
      from: num(track[i].t) - ORBIT_HALO, to: num(track[j].t) + ORBIT_HALO,
    });
    i = j;
  }

  const out = [];
  for (let i = 0; i < track.length; i++) {
    if (spinning[i]) continue;
    const p = track[i];
    const t = num(p.t), x = num(p.x), y = num(p.y);
    if (zones.some((z) => t >= z.from && t <= z.to && x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1)) continue;
    out.push(p);
  }
  return out;
}

export function dropFliers(track, { sourceWidth = 1920, sourceHeight = 1080 } = {}) {
  if (track.length < 3) return track;
  const ratio = sourceHeight / Math.max(1, sourceWidth);
  // Distance in frame widths, so the limit means the same thing on any shape of
  // screen: vertical travel is scaled by the aspect rather than counted as if
  // the frame were square.
  const apart = (a, b) => Math.hypot(num(b.x) - num(a.x), (num(b.y) - num(a.y)) * ratio);
  const impossible = (a, b) => {
    const dt = num(b.t) - num(a.t);
    if (dt <= 0 || dt >= FREE_AFTER) return false;
    return apart(a, b) / dt > MAX_SPEED;
  };

  /**
   * ── THE EXCURSION IS THE SHAPE TO LOOK FOR ─────────────────────────────────
   * A per-sample speed limit is not enough on its own, because the tracker does
   * not fail one sample at a time. A repaint holds its attention for as long as
   * it lasts, so the reported position leaves the pointer, sits somewhere else
   * for several samples that agree with each other perfectly, and comes back.
   * Judged pairwise, every sample in the middle of that is unremarkable.
   *
   * Judged as runs it is obvious, and it is obvious in one specific way: the
   * path goes A, then B, then back to A. Run 8 of one real recording sat at
   * (0.57, 0.23), run 9 was a single sighting 833 pixels away, and run 10 was
   * back at (0.57, 0.23). A hand does not do that. A tracker distracted by one
   * frame of a list redrawing does it constantly.
   *
   * So the test is comparative rather than absolute: if the run before and the
   * run after agree with each other BETTER than either agrees with what is
   * between them, what is between them is the odd one out. That needs no
   * threshold for "how far is too far" — the recording's own two opinions
   * either side supply it.
   */
  const runs = [[track[0]]];
  for (let i = 1; i < track.length; i++) {
    const p = track[i];
    const prev = track[i - 1];
    if (impossible(prev, p) || num(p.t) - num(prev.t) >= FREE_AFTER) runs.push([p]);
    else runs[runs.length - 1].push(p);
  }

  const keep = runs.map(() => true);
  for (let i = 1; i < runs.length - 1; i++) {
    const r = runs[i];
    const span = num(r[r.length - 1].t) - num(r[0].t);
    // Long enough to be somebody's hand resting there is long enough to believe.
    if (r.length > 3 || span > 0.25) continue;

    // Only a run the path had to JUMP into and out of is a candidate. One
    // reached across an ordinary gap is just the pointer being found again.
    const before = runs[i - 1][runs[i - 1].length - 1];
    const after = runs[i + 1][0];
    if (!impossible(before, r[0]) || !impossible(r[r.length - 1], after)) continue;

    const detourIn = apart(before, r[0]);
    const detourOut = apart(r[r.length - 1], after);
    if (apart(before, after) < Math.min(detourIn, detourOut)) keep[i] = false;
  }

  /* ── The pairwise limit, applied to what survives ─────────────────────── */
  const surviving = [];
  for (let i = 0; i < runs.length; i++) if (keep[i]) surviving.push(...runs[i]);

  const out = [surviving[0]];
  for (let i = 1; i < surviving.length; i++) {
    const p = surviving[i];
    const anchor = out[out.length - 1];
    const dt = num(p.t) - num(anchor.t);
    if (dt <= 0) continue;
    if (dt >= FREE_AFTER || apart(anchor, p) / dt <= MAX_SPEED) { out.push(p); continue; }

    /**
     * A single sighting cannot outvote the anchor, but a run that keeps
     * agreeing with itself can: that is what a genuinely fast flick across the
     * screen looks like. Without this a stale anchor would swallow a real move.
     */
    const next = surviving[i + 1];
    const gap = next ? num(next.t) - num(p.t) : Infinity;
    if (next && gap < FREE_AFTER && apart(p, next) / Math.max(1e-3, gap) <= MAX_SPEED) out.push(p);
  }
  return out;
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
  /**
   * ── THE ORBIT TEST GOES FIRST, AND THAT IS NOT ARBITRARY ─────────────────
   * It was written second and so it was bolted on at the end, after the busy
   * filter and the lone-sighting filter had already had the track. That made
   * it useless and it took a creator's report to notice: it found zero orbits
   * in a recording that visibly had one, because the two filters ahead of it
   * had removed a hundred and thirty samples first, breaking every run into
   * pieces too short to recognise.
   *
   * An orbit is a property of a DENSE run of sightings. Thin the run and the
   * shape is gone, whichever samples you remove. So it reads the track before
   * anything else has touched it.
   */
  const quiet = dropRepaints(opened, shiftTimes(motion, offset, { duration }));
  const still = dropOrbits(quiet, { sourceWidth, sourceHeight });
  const seen = dropLoners(still.filter((s2) => !inBusy(screen, num(s2.t), num(s2.x), num(s2.y))));
  const clean = dropFliers(seen, { sourceWidth, sourceHeight });

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
      repaints: opened.length - quiet.length,
      orbits: quiet.length - still.length,
      dropped: still.length - seen.length,
      fliers: seen.length - clean.length,
      reason: found.confident ? "" : "too little movement to line the two clocks up; left as recorded",
    },
  };
}

export default { readScreen, clockOffset, shiftTimes, fillOpening, inBusy, busyShare, settleAfter, dropRepaints, dropOrbits, dropFliers, alignCapture };

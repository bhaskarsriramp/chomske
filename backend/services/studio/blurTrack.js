/**
 * blurTrack.js: making a blur follow what it covers.
 *
 * ── THE PROBLEM ──────────────────────────────────────────────────────────────
 * A blur is a rectangle drawn over one moment: an API key, an email, a name.
 * The moment the creator scrolls, the key moves and the rectangle does not, and
 * a blur that stays put while the secret slides out from under it is worse than
 * none: it looks safe and is not. So a blur has to STICK to what it covers,
 * through scrolling, through the page jumping, through it leaving the screen
 * and coming back.
 *
 * ── FOLLOW THE NEIGHBOURHOOD, NOT THE PATCH ──────────────────────────────────
 * The first version searched each frame for the patch under the blur and took
 * the best match. On a database explorer that is exactly wrong: every document
 * has a `user: ObjectId('6aa…')` line, the hex differs in a few characters, and
 * when the page scrolled and the line above the secret slid under the toolbar,
 * the NEXT document's line scored higher than the real one. The blur jumped to
 * it, lost it, and flew off the bottom of the screen while the real key sat in
 * plain view for eight seconds. Measured, on a real recording.
 *
 * So each frame asks where the BAND around the blur (several lines tall) could
 * have moved since the previous one, and keeps several answers, because on a
 * page of repeating documents one document's band looks like the next one's
 * too. Which answer is right is then decided by the one thing a lookalike does
 * not share: the blurred text itself, compared with the ORIGINAL at twice the
 * working size. Only when the text no longer looks like itself (highlighted,
 * being edited) is motion alone trusted, and only strong motion. Always the
 * original, never the last match, so error cannot build up frame by frame.
 *
 * ── NEVER TO REVEAL ──────────────────────────────────────────────────────────
 * Every frame ends in one of four states, each chosen for what it does when the
 * tracker is wrong:
 *
 *   seen    followed. The blur sits on it.
 *   moving  the band was lost while moving towards an edge it would cross
 *           within a fraction of a second: the page is scrolling it away. The
 *           blur keeps going at that speed until it is off the frame, so the
 *           half of a line still on screen stays covered. Only towards a near
 *           edge — carrying a blur across the middle of the screen on a guess
 *           is how it ends up somewhere the secret is not.
 *   gone    entirely off the frame. Nothing to cover; not drawn.
 *   held    lost for any other reason: a dialog over it, it got highlighted,
 *           a tooltip sat on it. The blur stays exactly where it was — it fails
 *           closed — and the span is reported so the editor can ask for a look.
 *
 * Held has an end. A blur follows its secret for the whole recording, so when
 * the creator goes to another page, holding would leave a box over that page
 * for the rest of the video. It lets go (gone) once BOTH are true for LET_GO:
 * the screen's layout is no longer the one it was seen on, and what is under
 * the blur now is plainly not the secret. A highlight, a tooltip or a menu
 * changes part of the layout, not all of it, so those still hold; a dimmed
 * backdrop leaves the layout's shape alone (the measure ignores brightness),
 * and the secret under it still matches and is simply found again. Letting go
 * changes nothing about looking: it keeps being looked for, and found again
 * the moment it comes back.
 *
 * Finding it again after gone or held is deliberately STRICT: the blurred text
 * itself must match almost exactly, and clearly better than any other place on
 * the screen. A lookalike is worse than holding. That test runs on a copy TWICE
 * the working size: at 640 wide a 24-character hex id is 85 pixels, three and a
 * half per character, and one id looks like the next; at 1280 the characters
 * are legible and a real match scores well clear of its neighbours. The same
 * content back half a pixel lower (it happens: a list re-renders a pixel and a
 * half off) is found by letting that test move a few pixels.
 *
 * When it is found again, the frames just before are walked BACKWARDS from
 * there, following the band, so a line scrolling in from an edge is covered
 * from its first visible row rather than from the frame it was recognised.
 *
 * ── TIME IS THE VIDEO'S OWN ──────────────────────────────────────────────────
 * Screen recordings are variable frame rate — measured, 4 ms to 700 ms between
 * frames on one recording. Every position is keyed to the real timestamp of the
 * frame it was measured on, read from the decoder, never to an even sampling.
 * The export turns those into the ticks its own frame-rate conversion lands
 * each frame on (see render/compose.js), because in a fast scroll the page
 * moves a hundred pixels a frame, and a blur one frame late has shown the
 * secret.
 */
import { spawn } from "child_process";
import { FFMPEG_PATH } from "../media/ffmpeg.js";
import { FOLLOW_VERSION } from "../../../src/components/Studio/follow.mjs";

// The same number the editor and the export require of a follow (follow.mjs).
export const TRACK_VERSION = FOLLOW_VERSION;

/** The working copy's width. A source pixel is ~3 of these at 1920. */
const WORK_W = 640;
/** The copy identity is judged on: twice the working size (see the header). */
const HI = 2;
/** Coarse search scale. */
const K = 4;
/** Of a template's area that must be on screen for a partial match to count. */
const MIN_VISIBLE = 0.35;
/**
 * ...and of its texture (variance). Area alone is not enough: a box drawn a
 * little taller than its line is mostly blank padding, and with the line off
 * the top of the frame the sliver still on screen is that padding, which
 * matches any blank strip. Measured: such slivers scored 0.82-0.93 at the top
 * edge of pages the secret was not on, and were taken for it.
 */
const MIN_VISIBLE_TEXTURE = 0.4;
/** Below this a patch is too plain to recognise (a blank field). */
const MIN_TEXTURE = 3.5;
/** The band's match that counts as "it moved by this much". */
const BAND_OK = 0.8;
/** Motion trusted on its own, when the text itself cannot be matched. */
const BAND_STRONG = 0.9;
/**
 * ...or motion that is CLEAR: the best move of the band clears BAND_CLEAR_MIN
 * and beats every other move (more than a few pixels away) by BAND_CLEAR.
 * Measured: a name cut in half by the edge of an embedded video, the page
 * scrolling 115 px between two frames 0.28 s apart, band 0.80 against 0.45,
 * text 0.13 (half the box was over the page outside the video); holding still
 * there showed the name for three frames. On a page of lookalike rows the
 * band's moves come out close together, so this never picks between
 * lookalikes. Over five recordings it decided two frames, both right.
 */
const BAND_CLEAR_MIN = 0.75;
const BAND_CLEAR = 0.1;
/**
 * The blurred text matching its original: this is it. Not higher: the same
 * text re-drawn half a pixel off after a scroll scores 0.87-0.88 (measured),
 * while the nearest lookalike, a neighbouring document's id, scored 0.75. The
 * margin below, not this number, is what keeps lookalikes out.
 */
const ID_OK = 0.82;
/** The band unchanged: nothing moved (the common case, and the fast path). */
const STATIC = 0.985;
/** The original patch close enough to snap to. */
const VERIFY = 0.8;
/**
 * Finding it again: how well the blurred text itself must match, and by how
 * much it must beat the next best place on the screen. There is deliberately
 * no requirement on the surroundings: when the page scrolls the line above the
 * secret can slide under a toolbar, and a rule that the neighbourhood match
 * too rejected the real secret (text 0.92, unique) at exactly that moment.
 */
const STRICT_RECT = 0.82;
const STRICT_MARGIN = 0.08;
/**
 * ...and its surroundings must be its own. A blur follows ONE thing through
 * the whole recording, so a find is tried on every other page too, where the
 * same word can sit somewhere else entirely: a channel name "levelsio" was
 * found again in the search box above ("…startup by levelsio"), text 0.83,
 * surroundings 0.41, and the blur moved there. A loosely drawn box (half
 * blank, or across two lines) is at identity size mostly "a dark band", and
 * the lower half of a bold heading matched one at 0.93 with surroundings 0.12.
 * Measured over five recordings: every true find had surroundings of 0.88 to
 * 1, every false one 0 to 0.41.
 */
const STRICT_CONTEXT = 0.6;
/**
 * ── SIZE ──────────────────────────────────────────────────────────────────
 * What a blur covers can grow and shrink: a demo video embedded in a page
 * zooms in, a page is zoomed. Templates exist at SC_STEP^k of the drawn size,
 * k from K_MIN to K_MAX, cut from the anchor frame (templateSets). Following
 * tries the sizes either side of the current one, SPREAD_NEAR steps, or
 * SPREAD_FAR after a long gap between frames; a find anywhere tries the size
 * it was lost at and the size it was drawn at. Measured: an embedded video
 * zoomed a channel name to about 1.7x in 1.3 s; at a fixed size the blur held
 * still while the name slid out from under it.
 */
const SC_STEP = 1.03;
const K_MIN = -20;
const K_MAX = 24;
const SPREAD_NEAR = 3;
const SPREAD_FAR = 6;
/**
 * How much the surroundings count beside the text when choosing between
 * places. Real ids made in the same second share most of their digits:
 * measured, the line above a Mongo ObjectId scored 0.935 against the id's own
 * 0.999, three characters apart. Their surroundings differ (the real one sits
 * between `_id` and `__v`, the other between the last document's `updated_at`
 * and `user`), so they break the tie. When the surroundings are hidden, every
 * candidate loses them alike and the text decides.
 */
const CONTEXT_WEIGHT = 0.5;
/** Carried towards an edge only if it would be off the frame within this. */
const EXIT_WINDOW = 0.45;
/** Never carried longer than this. */
const CARRY_MAX = 1.0;
/** How far back a find is walked to cover the frames just before it. The
 *  identity copy is kept for these frames, so this is also a memory budget. */
const BACKFILL = 1.0;
/** Seconds decoded at a time when walking the span backwards. */
const BACK_CHUNK = 4;
/** Mean change (0-255) in a tiny thumbnail that counts as "the screen changed". */
const CHANGED = 0.6;
/** While lost, look again at least this often even if the screen barely moved. */
const RELOOK = 0.5;
/** ...and at most this often. What a find misses in between, the backfill
 *  walk from the find covers (BACKFILL is well beyond it). */
const LOOK_EVERY = 0.1;
/**
 * Letting go of a held blur (see the header): after this long lost, when the
 * layout of the whole screen correlates below PAGE_SAME with the frame it was
 * last seen on, and the blurred text scores below GONE_ID where the blur is.
 * Measured on real recordings: navigations (pricing page to editor, a site to
 * a YouTube search and back) correlate -0.12 to -0.02; the same page scrolled,
 * or with a large search menu open over it, 0.71 to 1. The secret's own text
 * scored 0.08 on the page navigated to, against 0.82 for a match. A count of
 * changed pixels does NOT work: two white pages share most of their pixels.
 */
const LET_GO = 0.5;
const PAGE_SAME = 0.4;
/**
 * The same, for the part of the screen around the blur: a video embedded in
 * a page going from a results page to a video page scored 0.43-0.45 there
 * while the page around it scored 0.8. Stricter than the whole screen, since
 * it only ever lets go with the text itself gone from under the blur too.
 */
const NEAR_SAME = 0.6;
const GONE_ID = 0.5;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ────────────────────────────────────────────────────────────────────────────
   Decoding, with the frames' own timestamps
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Decode [from, to] of a file to greyscale frames at W x H, each paired with
 * its real presentation time (seconds, the file's clock). `onFrame(buf, t)`
 * is awaited in order. `showinfo` reports each frame's pts on stderr; frames
 * arrive on stdout; the two are paired by order.
 */
function decode(file, { from, to, W, H, onFrame }) {
  const bytes = W * H;
  const args = [
    "-hide_banner", "-nostdin",
    "-ss", String(Math.max(0, from)), "-to", String(to), "-copyts",
    "-i", file,
    "-an", "-sn", "-fps_mode", "passthrough",
    "-vf", `scale=${W}:${H}:flags=area,showinfo`,
    "-pix_fmt", "gray", "-f", "rawvideo", "pipe:1",
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_PATH, args, { windowsHide: true });
    const times = [];
    const frames = [];
    let held = [];
    let heldBytes = 0;
    let errTail = "";
    let lineBuf = "";
    let chain = Promise.resolve();
    let settled = false;
    const fail = (e) => { if (!settled) { settled = true; try { child.kill("SIGKILL"); } catch { /* gone */ } reject(e); } };

    const pump = () => {
      while (frames.length && times.length) {
        const buf = frames.shift();
        const t = times.shift();
        chain = chain.then(() => onFrame(buf, t));
      }
      if (frames.length > 8) {
        child.stdout.pause();
        chain.then(() => { if (!settled) child.stdout.resume(); }, fail);
      }
    };

    child.stderr.on("data", (d) => {
      const s = d.toString();
      errTail = (errTail + s).slice(-4000);
      lineBuf += s;
      const lines = lineBuf.split("\n");
      lineBuf = lines.pop();
      for (const line of lines) {
        const m = line.includes("showinfo") && /\bpts_time:\s*(-?[\d.]+)/.exec(line);
        if (m) times.push(Number(m[1]));
      }
      pump();
    });
    child.stdout.on("data", (chunk) => {
      held.push(chunk);
      heldBytes += chunk.length;
      if (heldBytes < bytes) return;
      const all = held.length === 1 ? held[0] : Buffer.concat(held, heldBytes);
      const whole = Math.floor(all.length / bytes);
      for (let i = 0; i < whole; i++) frames.push(Buffer.from(all.subarray(i * bytes, (i + 1) * bytes)));
      const rest = all.subarray(whole * bytes);
      held = rest.length ? [Buffer.from(rest)] : [];
      heldBytes = rest.length;
      pump();
    });
    child.on("error", fail);
    child.on("close", (code) => {
      if (lineBuf) {
        const m = lineBuf.includes("showinfo") && /\bpts_time:\s*(-?[\d.]+)/.exec(lineBuf);
        if (m) times.push(Number(m[1]));
      }
      pump();
      chain.then(() => {
        if (settled) return;
        settled = true;
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with ${code}: ${errTail.slice(-600)}`));
      }, fail);
    });
  });
}

/* ────────────────────────────────────────────────────────────────────────────
   Matching
   ──────────────────────────────────────────────────────────────────────────── */

function shrink(img, w, h, k) {
  const ow = Math.floor(w / k);
  const oh = Math.floor(h / k);
  const out = new Float32Array(ow * oh);
  const kk = k * k;
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      let s = 0;
      for (let j = 0; j < k; j++) {
        const row = (y * k + j) * w + x * k;
        for (let i = 0; i < k; i++) s += img[row + i];
      }
      out[y * ow + x] = s / kk;
    }
  }
  return { data: out, w: ow, h: oh };
}

/** A template: the patch at (x, y, w, h) of img, kept raw (NCC is computed per overlap). */
/** Half size, as bytes: the working copy from the identity copy. */
function half(img, w, h) {
  const ow = w >> 1;
  const oh = h >> 1;
  const out = new Uint8Array(ow * oh);
  for (let y = 0; y < oh; y++) {
    const r0 = 2 * y * w;
    const r1 = r0 + w;
    for (let x = 0; x < ow; x++) {
      const i = 2 * x;
      out[y * ow + x] = (img[r0 + i] + img[r0 + i + 1] + img[r1 + i] + img[r1 + i + 1] + 2) >> 2;
    }
  }
  return out;
}

function templateOf(img, iw, x, y, w, h) {
  const t = new Float32Array(w * h);
  let s = 0;
  let s2 = 0;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const v = img[(y + j) * iw + x + i];
      t[j * w + i] = v;
      s += v;
      s2 += v * v;
    }
  }
  const n = w * h;
  const std = Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2));
  return { t, w, h, std };
}

/**
 * NCC of template T placed with its top-left at (x, y) in img, over the part
 * of it that is on the image. Returns -1 when too little of it is on screen.
 */
function ncc(img, iw, ih, T, x, y) {
  const x0 = Math.max(0, -x);
  const y0 = Math.max(0, -y);
  const x1 = Math.min(T.w, iw - x);
  const y1 = Math.min(T.h, ih - y);
  const cw = x1 - x0;
  const ch = y1 - y0;
  if (cw <= 2 || ch <= 1 || cw * ch < MIN_VISIBLE * T.w * T.h) return -1;
  let si = 0, si2 = 0, st = 0, st2 = 0, sit = 0;
  for (let j = y0; j < y1; j++) {
    const irow = (y + j) * iw + x;
    const trow = j * T.w;
    for (let i = x0; i < x1; i++) {
      const a = img[irow + i];
      const b = T.t[trow + i];
      si += a; si2 += a * a; st += b; st2 += b * b; sit += a * b;
    }
  }
  const n = cw * ch;
  const vi = si2 - (si * si) / n;
  const vt = st2 - (st * st) / n;
  if (vi < 1e-3 || vt < 1e-3) return 0;
  if (n < T.w * T.h && vt < MIN_VISIBLE_TEXTURE * T.std * T.std * T.w * T.h) return -1;
  return (sit - (si * st) / n) / Math.sqrt(vi * vt);
}

/** Best position within [cx±rx, cy±ry], allowing the patch partly off the frame. */
function search(img, iw, ih, T, cx, cy, rx, ry, step = 1, keep = 1) {
  const minX = -Math.floor(T.w * (1 - MIN_VISIBLE));
  const minY = -Math.floor(T.h * (1 - MIN_VISIBLE));
  const maxX = iw - Math.ceil(T.w * MIN_VISIBLE);
  const maxY = ih - Math.ceil(T.h * MIN_VISIBLE);
  const x0 = Math.max(minX, Math.round(cx - rx));
  const x1 = Math.min(maxX, Math.round(cx + rx));
  const y0 = Math.max(minY, Math.round(cy - ry));
  const y1 = Math.min(maxY, Math.round(cy + ry));
  if (keep === 1) {
    let bx = cx;
    let by = cy;
    let bs = -1;
    for (let y = y0; y <= y1; y += step) {
      for (let x = x0; x <= x1; x += step) {
        const s = ncc(img, iw, ih, T, x, y);
        if (s > bs) { bs = s; bx = x; by = y; }
      }
    }
    return { x: bx, y: by, s: bs };
  }
  // The best `keep`, kept in order by insertion: re-sorting the list on every
  // hit made a whole-frame search a hundred times slower than the matching.
  const best = [];
  let floor = -Infinity;
  for (let y = y0; y <= y1; y += step) {
    for (let x = x0; x <= x1; x += step) {
      const s = ncc(img, iw, ih, T, x, y);
      if (s < -0.5 || (best.length >= keep && s <= floor)) continue;
      let i = best.length;
      best.push(null);
      while (i > 0 && best[i - 1].s < s) {
        best[i] = best[i - 1];
        i--;
      }
      best[i] = { x, y, s };
      if (best.length > keep) best.pop();
      if (best.length >= keep) floor = best[best.length - 1].s;
    }
  }
  return best;
}

/* ────────────────────────────────────────────────────────────────────────────
   Following, one direction at a time
   ──────────────────────────────────────────────────────────────────────────── */

function meanDiff(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

/** The cells of a tw × th thumbnail within (hw, hh) of (cx, cy), as one array. */
function windowOf(d, tw, th, cx, cy, hw, hh) {
  const x0 = clamp(Math.round(cx - hw), 0, tw - 1);
  const x1 = clamp(Math.round(cx + hw), x0 + 1, tw);
  const y0 = clamp(Math.round(cy - hh), 0, th - 1);
  const y1 = clamp(Math.round(cy + hh), y0 + 1, th);
  const out = new Float32Array((x1 - x0) * (y1 - y0));
  let i = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out[i++] = d[y * tw + x];
  return out;
}

/** How alike two tiny thumbnails' layouts are: their correlation, -1 to 1 (0 if either is flat). */
function layoutCorr(a, b) {
  const n = a.length;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    sa += a[i];
    sb += b[i];
  }
  const ma = sa / n;
  const mb = sb / n;
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < n; i++) {
    const u = a[i] - ma;
    const v = b[i] - mb;
    ab += u * v;
    aa += u * u;
    bb += v * v;
  }
  return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
}

/* ────────────────────────────────────────────────────────────────────────────
   Templates at any scale
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The region [x0, x0 + rw) × [y0, y0 + rh) of img (iw × ih bytes) resampled
 * to ow × oh: each output pixel is the mean of up to 4 × 4 bilinear samples
 * over its footprint, so shrinking does not alias and growing is smooth.
 * Outside the image reads as its nearest edge.
 */
function resample(img, iw, ih, x0, y0, rw, rh, ow, oh) {
  const out = new Float32Array(ow * oh);
  const fx = rw / ow;
  const fy = rh / oh;
  const nx = clamp(Math.ceil(fx), 1, 4);
  const ny = clamp(Math.ceil(fy), 1, 4);
  const at = (x, y) => {
    const u = clamp(x - 0.5, 0, iw - 1);
    const v = clamp(y - 0.5, 0, ih - 1);
    const xi = Math.floor(u);
    const yi = Math.floor(v);
    const ax = u - xi;
    const ay = v - yi;
    const x1 = Math.min(iw - 1, xi + 1);
    const r0 = yi * iw;
    const r1 = Math.min(ih - 1, yi + 1) * iw;
    return (img[r0 + xi] * (1 - ax) + img[r0 + x1] * ax) * (1 - ay) + (img[r1 + xi] * (1 - ax) + img[r1 + x1] * ax) * ay;
  };
  for (let j = 0; j < oh; j++) {
    for (let i = 0; i < ow; i++) {
      let s = 0;
      for (let b = 0; b < ny; b++) {
        const y = y0 + (j + (b + 0.5) / ny) * fy;
        for (let a = 0; a < nx; a++) s += at(x0 + (i + (a + 0.5) / nx) * fx, y);
      }
      out[j * ow + i] = s / (nx * ny);
    }
  }
  return out;
}

/** A template from resampled pixels: the same shape templateOf makes. */
function asTemplate(t, w, h) {
  let s = 0;
  let s2 = 0;
  for (let i = 0; i < t.length; i++) {
    s += t[i];
    s2 += t[i] * t[i];
  }
  const n = t.length;
  return { t, w, h, std: Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2)) };
}

/**
 * Every template the follower matches with, at scale SC_STEP^k of the anchor,
 * made on demand and kept. All are cut from the anchor frame's identity copy
 * (twice the working size), so up to twice the original size a template is
 * still made of real pixels rather than enlarged ones.
 *
 * Positions are in working pixels of the anchor frame: R0 the rectangle, P0
 * the patch around it (the rectangle and its surroundings, cut short at the
 * frame's edges), c0 the rectangle's centre. At scale s each covers the same
 * part of the anchor frame, drawn s times larger.
 */
function templateSets(anchorHi, W2, H2, R0, P0, c0) {
  const cache = new Map();
  const cut = (reg, d) => {
    const ow = Math.max(2, Math.round(reg.w * d));
    const oh = Math.max(2, Math.round(reg.h * d));
    return asTemplate(resample(anchorHi, W2, H2, reg.x * HI, reg.y * HI, reg.w * HI, reg.h * HI, ow, oh), ow, oh);
  };
  return (k) => {
    let set = cache.get(k);
    if (set) return set;
    const s = SC_STEP ** k;
    const T = cut(P0, s);
    set = {
      k,
      s,
      rw: R0.w * s,
      rh: R0.h * s,
      T,
      Tc: cut(P0, s / K),
      TrectLo: cut(R0, s),
      TrectHalf: cut(R0, s / 2),
      TrectHi: cut(R0, s * HI),
      // Where the rectangle's centre sits inside the patch, in working pixels.
      pcx: ((c0.x - P0.x) / P0.w) * T.w,
      pcy: ((c0.y - P0.y) / P0.h) * T.h,
    };
    cache.set(k, set);
    return set;
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   Following, one direction at a time
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * One direction of the walk from the anchor. `dir` is +1 walking forward in
 * time and -1 walking back. Feed it frames in that order with an increasing
 * `idx`; each call returns the rectangle's centre `c` (working pixels), its
 * scale step `k` and its state for that frame, and, after a find, `fill`:
 * earlier frames (by idx) whose places it now knows.
 */
function follower({ tplAt, W, H, c0, dir, debug = null }) {
  let c = { ...c0 };
  let k = 0;
  let state = "seen";
  let prev = null;
  let lastT = null;
  let vel = { x: 0, y: 0 };
  let carry = null;           // { c, t } where carrying began
  let thumb = null;
  let lookedT = null;         // when a lost search last ran
  let lost = null;            // { t, tiny, k } the last frame it was seen on, once lost
  const recent = [];          // frames since the last seen one, for backfill

  const rectOf = (cc, kk) => {
    const S = tplAt(kk);
    return { x: cc.x - S.rw / 2, y: cc.y - S.rh / 2, w: S.rw, h: S.rh };
  };
  const onFrame = (cc, kk) => {
    const r = rectOf(cc, kk);
    return r.x + r.w > 0 && r.y + r.h > 0 && r.x < W && r.y < H;
  };
  const inRange = (kk) => kk >= K_MIN && kk <= K_MAX;

  /**
   * Where the band around the rectangle (centre cc, scale kk) in frame a
   * could have gone in frame b: `still` if it did not move, otherwise up to
   * four distinct shifts, best band match first. Null when there is no band
   * to measure (off the frame, or a flat panel). Frame to frame, so it copes
   * with a zoom: between two frames a zoom changes the size by a few per cent.
   */
  function bandShifts(a, b, cc, kk) {
    const r = rectOf(cc, kk);
    const bx = clamp(Math.round(r.w * 0.5), 24, 120);
    const by = clamp(Math.round(r.h * 2), 24, 70);
    const x0 = Math.max(0, Math.round(r.x - bx));
    const y0 = Math.max(0, Math.round(r.y - by));
    const x1 = Math.min(W, Math.round(r.x + r.w + bx));
    const y1 = Math.min(H, Math.round(r.y + r.h + by));
    if (x1 - x0 < 12 || y1 - y0 < 12) return null;
    const Tb = templateOf(a.img, W, x0, y0, x1 - x0, y1 - y0);
    if (Tb.std < MIN_TEXTURE) return null;
    const s0 = ncc(b.img, W, H, Tb, x0, y0);
    if (s0 >= STATIC) return { still: true, list: [{ dx: 0, dy: 0, s: s0 }] };

    const list = [];
    const add = (m) => {
      if (m.s < 0) return;
      const dx = m.x - x0;
      const dy = m.y - y0;
      const same = list.find((q) => Math.abs(q.dx - dx) <= 2 && Math.abs(q.dy - dy) <= 2);
      if (!same) list.push({ dx, dy, s: m.s });
      else if (m.s > same.s) Object.assign(same, { dx, dy, s: m.s });
    };
    add(search(b.img, W, H, Tb, x0, y0, 6, 8));
    if (list.length === 0 || list[0].s < 0.97) {
      const Tbc = templateOf(a.small.data, a.small.w, Math.floor(x0 / K), Math.floor(y0 / K),
        Math.max(2, Math.floor((x1 - x0) / K)), Math.max(2, Math.floor((y1 - y0) / K)));
      if (Tbc.std >= MIN_TEXTURE / 2) {
        for (const m of search(b.small.data, b.small.w, b.small.h, Tbc, x0 / K, y0 / K, b.small.w / 8, b.small.h, 1, 6)) {
          add(search(b.img, W, H, Tb, m.x * K, m.y * K, K + 1, K + 1));
        }
      }
    }
    list.sort((u, v) => v.s - u.s);
    return { still: false, list: list.slice(0, 4) };
  }

  /**
   * The text alone at scale kk, anywhere within (rx, ry) of centre cc (or the
   * whole frame), as up to `n` distinct centres. It proposes places the band
   * cannot: the band depends on the surroundings, and it is the surroundings
   * that change when a line slides under a toolbar.
   */
  function textCandidates(f, cc, kk, rx, ry, n) {
    const S = tplAt(kk);
    const hf = f.half || (f.half = shrink(f.img, W, H, 2));
    const r = rectOf(cc, kk);
    const hits = search(hf.data, hf.w, hf.h, S.TrectHalf, r.x / 2, r.y / 2, rx / 2 + 1, ry / 2 + 1, 1, n * 4);
    const out = [];
    for (const h of hits) {
      if (out.some((o) => Math.abs(o.x - h.x) < S.rw / 6 && Math.abs(o.y - h.y) < Math.max(1, S.rh / 4))) continue;
      out.push(h);
      if (out.length >= n) break;
    }
    return out.map((h) => {
      const fine = search(f.img, W, H, S.TrectLo, h.x * 2, h.y * 2, 2, 2);
      return { x: fine.x + S.TrectLo.w / 2, y: fine.y + S.TrectLo.h / 2 };
    });
  }

  /**
   * How well the blurred text at centre cc and scale kk matches the original,
   * at the identity size, and exactly where; `ctx` is how well its
   * surroundings do, and `score` the two together (CONTEXT_WEIGHT).
   */
  function identityAt(f, cc, kk) {
    const S = tplAt(kk);
    const id = search(f.hi, W * HI, H * HI, S.TrectHi, (cc.x - S.rw / 2) * HI, (cc.y - S.rh / 2) * HI, 4, 4);
    const nc = { x: (id.x + S.TrectHi.w / 2) / HI, y: (id.y + S.TrectHi.h / 2) / HI };
    const ctx = Math.max(0, ncc(f.img, W, H, S.T, Math.round(nc.x - S.pcx), Math.round(nc.y - S.pcy)));
    return { s: id.s, ctx, score: id.s + CONTEXT_WEIGHT * ctx, c: nc, k: kk };
  }

  /**
   * The best of some candidate centres, over the scales near kk: each at kk
   * first, then the best few walked a step at a time towards whichever size
   * matches better, at most `spread` steps. A zoom is found this way; a page
   * that did not zoom costs one extra look each way.
   */
  function bestAcross(f, cands, kk, spread, few = 2) {
    const firsts = [];
    for (const q of cands) firsts.push(identityAt(f, q, kk));
    firsts.sort((u, v) => v.score - u.score);
    let best = firsts[0] || null;
    for (const st of firsts.slice(0, few)) {
      for (const d of [1, -1]) {
        let here = st;
        for (let n = 0; n < spread && inRange(here.k + d); n++) {
          const next = identityAt(f, here.c, here.k + d);
          if (next.score <= here.score) break;
          here = next;
          if (here.score > best.score) best = here;
        }
      }
    }
    return best;
  }

  /**
   * One step of following, from frame a (centre cc, scale kk) to frame b.
   * Returns { c, k }, or null when it cannot be followed. The band proposes;
   * the text decides, at whichever nearby size fits; motion alone only when
   * the text is not itself.
   */
  function advance(a, b, cc, kk, v, dt) {
    const band = bandShifts(a, b, cc, kk);
    if (band?.still) return { c: verify(b.img, cc, kk), k: kk };
    const pts = (band?.list || []).map((m) => ({ x: cc.x + m.dx, y: cc.y + m.dy }));
    if (dt && (v.x || v.y)) pts.push({ x: cc.x + v.x * dt, y: cc.y + v.y * dt });
    let best = null;
    if (b.hi) {
      pts.push(...textCandidates(b, cc, kk, Math.max(8, tplAt(kk).rw / 3), 90, 3));
      // A long gap between frames can hold a whole zoom: look further then.
      best = bestAcross(b, pts, kk, Math.abs(dt) > 0.15 ? SPREAD_FAR : SPREAD_NEAR);
    }
    debug?.({ at: b.t, follow: (band?.list || []).map((m) => [m.dx, m.dy, +m.s.toFixed(3)]), id: best ? [+best.s.toFixed(3), best.k] : null });
    if (best && best.s >= ID_OK) return { c: best.c, k: best.k };
    const top = band?.list?.[0];
    if (top && top.s >= BAND_STRONG) return { c: verify(b.img, { x: cc.x + top.dx, y: cc.y + top.dy }, kk), k: kk };
    if (top && top.s >= BAND_CLEAR_MIN) {
      const rival = band.list.find((m) => Math.hypot(m.dx - top.dx, m.dy - top.dy) > 4);
      if (!rival || top.s - rival.s >= BAND_CLEAR) return { c: verify(b.img, { x: cc.x + top.dx, y: cc.y + top.dy }, kk), k: kk };
    }
    return null;
  }

  /** Snap a moved centre to the original patch, when it is there to snap to. */
  function verify(img, cc, kk) {
    const S = tplAt(kk);
    const v = search(img, W, H, S.T, Math.round(cc.x - S.pcx), Math.round(cc.y - S.pcy), 3, 3);
    return v.s >= VERIFY ? { x: v.x + S.pcx, y: v.y + S.pcy } : cc;
  }

  /**
   * Anywhere on the frame, strictly, at the size it was last seen at and the
   * size it was placed at. Candidates come from the working copy; which of
   * them is the blurred text is decided on the identity copy, with a few
   * pixels and a few sizes of give; the winner must beat every other place
   * clearly, and its surroundings must be its own (STRICT_CONTEXT): the same
   * word elsewhere on the screen is not the thing that was blurred.
   */
  function strictFind(f, kLast) {
    const pts = [];
    for (const kk of new Set([kLast, 0])) {
      const S = tplAt(kk);
      for (const m of search(f.small.data, f.small.w, f.small.h, S.Tc, f.small.w / 2, f.small.h / 2, f.small.w, f.small.h, 1, 8)) {
        const r = search(f.img, W, H, S.T, m.x * K, m.y * K, K + 1, K + 1);
        if (r.s >= 0) pts.push({ c: { x: r.x + S.pcx, y: r.y + S.pcy }, k: kk });
      }
      for (const q of textCandidates(f, { x: W / 2, y: H / 2 }, kk, W, H, 8)) pts.push({ c: q, k: kk });
    }
    const scored = [];
    for (const p of pts) {
      const id = identityAt(f, p.c, p.k);
      if (!scored.some((o) => Math.abs(o.c.x - id.c.x) < 2 && Math.abs(o.c.y - id.c.y) < 2)) scored.push(id);
    }
    scored.sort((u, v) => v.score - u.score);
    // The strongest few, each given a few sizes of give.
    for (let i = 0; i < Math.min(3, scored.length); i++) scored[i] = bestAcross(f, [scored[i].c], scored[i].k, SPREAD_NEAR, 1);
    scored.sort((u, v) => v.score - u.score);
    debug?.({ at: f.t, find: scored.slice(0, 5).map((o) => [Math.round(o.c.x), Math.round(o.c.y), o.k, +o.s.toFixed(3), +o.ctx.toFixed(2)]) });
    const best = scored[0];
    if (!best || best.s < STRICT_RECT || best.ctx < STRICT_CONTEXT) return null;
    const S = tplAt(best.k);
    const rival = scored.find((o) => Math.abs(o.c.y - best.c.y) > S.rh || Math.abs(o.c.x - best.c.x) > S.rw / 2);
    if (rival && rival.score > best.score - STRICT_MARGIN) return null;
    return { c: best.c, k: best.k };
  }

  /** After a find at frame f (centre cc, scale kk), walk the frames just before it back. */
  function backfill(f, cc, kk) {
    const fill = [];
    let next = f;
    let np = { c: cc, k: kk };
    for (let i = recent.length - 1; i >= 0; i--) {
      const g = recent[i];
      if (Math.abs(f.t - g.t) > BACKFILL) break;
      // The same step as following: the band proposes, the text decides.
      const gp = advance(next, g, np.c, np.k, { x: 0, y: 0 }, Math.abs(next.t - g.t));
      if (!gp) break;
      fill.push({ idx: g.idx, c: gp.c, k: gp.k, state: onFrame(gp.c, gp.k) ? "seen" : "gone" });
      next = g;
      np = gp;
    }
    return fill;
  }

  return function step(hi, img, t, idx) {
    const f = { img, hi, small: shrink(img, W, H, K), t, idx };
    if (!prev) {
      prev = f;
      lastT = t;
      return { c: { ...c }, k, state };
    }

    let fill = null;

    if (state === "seen") {
      const dt = t - lastT;
      const np = advance(prev, f, c, k, vel, dt);
      if (np) {
        if (dt) vel = { x: (np.c.x - c.x) / dt, y: (np.c.y - c.y) / dt };
        c = np.c;
        k = np.k;
        state = onFrame(c, k) ? "seen" : "gone";
      } else {
        // The neighbourhood is not where it was: the page changed, or it left.
        lost = { t: lastT, tiny: shrink(prev.img, W, H, 8).data, k };
        const found = strictFind(f, k);
        if (found) {
          c = found.c;
          k = found.k;
          vel = { x: 0, y: 0 };
        } else {
          const ahead = { x: c.x + vel.x * EXIT_WINDOW * dir, y: c.y + vel.y * EXIT_WINDOW * dir };
          if (Math.hypot(vel.x, vel.y) > 1 && !onFrame(ahead, k)) {
            carry = { c: { ...c }, t: lastT };
            state = "moving";
            c = { x: carry.c.x + vel.x * (t - carry.t), y: carry.c.y + vel.y * (t - carry.t) };
            if (!onFrame(c, k)) state = "gone";
          } else {
            state = "held";
          }
        }
      }
    } else {
      if (state === "moving") {
        c = { x: carry.c.x + vel.x * (t - carry.t), y: carry.c.y + vel.y * (t - carry.t) };
        if (!onFrame(c, k)) state = "gone";
        else if (Math.abs(t - carry.t) > CARRY_MAX) state = "held";
      }
      const tiny = shrink(img, W, H, 8).data;
      // Held on a screen that is no longer the one it was on, over something
      // that is not it: the page changed. Let go, and keep looking. The
      // screen as a whole, or the part of it around the blur: a video
      // embedded in a page can change completely while the page around it,
      // most of the screen, stays exactly as it was.
      if (state === "held" && lost && Math.abs(t - lost.t) >= LET_GO) {
        const S = tplAt(k);
        const near = (d) => windowOf(d, Math.floor(W / 8), Math.floor(H / 8), c.x / 8, c.y / 8,
          Math.max(S.rw * 1.5, 60) / 8, Math.max(S.rh * 4, 40) / 8);
        const whole = layoutCorr(tiny, lost.tiny);
        const around = layoutCorr(near(tiny), near(lost.tiny));
        if (whole < PAGE_SAME || around < NEAR_SAME) {
          const same = Math.min(whole, around);
          const here = identityAt(f, c, k).s;
          debug?.({ at: t, letGo: [+same.toFixed(3), +here.toFixed(3)] });
          if (here < GONE_ID) state = "gone";
        }
      }
      const since = lookedT === null ? Infinity : Math.abs(t - lookedT);
      if (since >= LOOK_EVERY && (!thumb || meanDiff(tiny, thumb) >= CHANGED || since >= RELOOK)) {
        thumb = tiny;
        lookedT = t;
        const found = strictFind(f, lost ? lost.k : k);
        if (found) {
          c = found.c;
          k = found.k;
          vel = { x: 0, y: 0 };
          state = "seen";
          fill = backfill(f, c, k);
        }
      }
    }

    if (state === "seen") {
      recent.length = 0;
      thumb = null;
      lookedT = null;
      lost = null;
    }
    // Kept, identity copy and all, only as long as a backfill could reach
    // back (BACKFILL): at 1280 wide a second of frames is tens of megabytes.
    recent.push(f);
    while (recent.length && Math.abs(t - recent[0].t) > BACKFILL) recent.shift();
    prev = f;
    lastT = t;
    return { c: { ...c }, k, state, fill };
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   The whole job
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Follow one blur through its span.
 *
 * @param {string} file         the recording (the same file the export reads)
 * @param {object} o
 * @param {{x,y,w,h}} o.rect    fractions of the frame, where it is at `at`
 * @param {number} o.at         the moment the rectangle was placed, seconds
 * @param {number} o.start      the blur's span, seconds
 * @param {number} o.end
 * @param {number} o.sourceWidth, o.sourceHeight
 * @returns {Promise<{ version, at, keys: Array<[t, x, y, on, s]>, held: Array<[t0, t1]>, trackable, frames }>}
 *   keys: from time t (a real frame time) the rectangle's top-left is at
 *   (x, y), fractions, it is s times the size it was drawn, and it is drawn
 *   when on is 1, until the next key.
 */
export async function trackBlur(file, { rect, at, start, end, sourceWidth, sourceHeight, onProgress = () => {}, onDebug = null }) {
  const W = WORK_W;
  const H = Math.max(2, Math.round((W * sourceHeight) / sourceWidth / 2) * 2);
  // On whole working pixels, so the templates at the drawn size are the
  // anchor frame's own pixels, not an interpolation of them: interpolating
  // softened a Mongo id's template enough that the id itself scored 0.78
  // instead of 0.88 where it was found again, under the 0.82 bar.
  const R0 = {
    x: Math.round(rect.x * W),
    y: Math.round(rect.y * H),
    w: Math.max(2, Math.round(rect.w * W)),
    h: Math.max(2, Math.round(rect.h * H)),
  };
  const c0 = { x: R0.x + R0.w / 2, y: R0.y + R0.h / 2 };
  // What that rounding moved the rectangle by, put back on every key, so at
  // the anchor the blur is exactly where it was drawn.
  const nudge = { x: rect.x - (c0.x / W - rect.w / 2), y: rect.y - (c0.y / H - rect.h / 2) };
  // The patch recognised: the rectangle and a margin of what surrounds it.
  const padY = Math.max(6, Math.round(R0.h * 0.6));
  const padX = Math.max(6, Math.round(R0.w * 0.1));
  const P0 = { x: clamp(R0.x - padX, 0, W - 4), y: clamp(R0.y - padY, 0, H - 4) };
  P0.w = Math.max(4, Math.min(W - P0.x, R0.x + R0.w + padX - P0.x));
  P0.h = Math.max(4, Math.min(H - P0.y, R0.y + R0.h + padY - P0.y));

  const W2 = W * HI;
  const H2 = H * HI;

  // ── The anchor frame: the one on screen at `at` ────────────────────────
  let anchorHi = null;
  let anchorT = null;
  await decode(file, {
    from: Math.max(0, at - 0.6), to: at + 0.05, W: W2, H: H2,
    onFrame: (buf, t) => {
      if (t <= at + 1e-3 || anchorHi === null) {
        anchorHi = buf;
        anchorT = t;
      }
    },
  });
  if (!anchorHi) throw new Error("no frame at the anchor");
  const anchorImg = half(anchorHi, W2, H2);

  const tplAt = templateSets(anchorHi, W2, H2, R0, P0, c0);
  if (tplAt(0).T.std < MIN_TEXTURE) {
    // Nothing there to recognise (a blank field, a flat panel). Following it
    // would mean following noise; the blur stays where it was drawn.
    return { version: TRACK_VERSION, at: anchorT, keys: [], held: [], trackable: false, frames: 0 };
  }

  const all = [{ t: anchorT, c: c0, k: 0, state: "seen" }];
  const span = Math.max(0.001, end - start);
  let done = 0;

  /** Run one direction; `feed(cb)` delivers (buf, t) in walking order. */
  async function walk(dir, feed) {
    const states = [];
    const step = follower({ tplAt, W, H, c0, dir, debug: onDebug });
    step(anchorHi, anchorImg, anchorT, -1);
    await feed((buf, t) => {
      const idx = states.length;
      const r = step(buf, half(buf, W2, H2), t, idx);
      states.push({ t, c: r.c, k: r.k, state: r.state });
      for (const u of r.fill || []) {
        if (states[u.idx]) Object.assign(states[u.idx], { c: u.c, k: u.k, state: u.state });
      }
    });
    all.push(...states);
  }

  // ── Forward, streamed ──────────────────────────────────────────────────
  if (end > anchorT + 1e-3) {
    await walk(1, (take) =>
      decode(file, {
        from: anchorT, to: end, W: W2, H: H2,
        onFrame: (buf, t) => {
          if (t <= anchorT + 1e-4) return;
          take(buf, t);
          done = t - anchorT;
          onProgress(Math.min(0.98, done / span));
        },
      })
    );
  }

  // ── Backward, a few seconds at a time ──────────────────────────────────
  if (start < anchorT - 1e-3) {
    await walk(-1, async (take) => {
      let hi = anchorT;
      while (hi > start + 1e-3) {
        const lo = Math.max(start, hi - BACK_CHUNK);
        const chunk = [];
        await decode(file, {
          from: lo, to: hi, W: W2, H: H2,
          onFrame: (buf, t) => {
            if (t < hi - 1e-4 && t >= lo - 1e-4) chunk.push({ buf, t });
          },
        });
        for (let i = chunk.length - 1; i >= 0; i--) take(chunk[i].buf, chunk[i].t);
        done += hi - lo;
        onProgress(Math.min(0.98, done / span));
        hi = lo;
      }
    });
  }

  all.sort((a, b) => a.t - b.t);

  // ── Keys: only where something changes ────────────────────────────────
  const keys = [];
  const held = [];
  let heldFrom = null;
  for (const st of all) {
    const s = SC_STEP ** st.k;
    const x = +(st.c.x / W - (rect.w * s) / 2 + nudge.x).toFixed(5);
    const y = +(st.c.y / H - (rect.h * s) / 2 + nudge.y).toFixed(5);
    const sc = +s.toFixed(4);
    const on = st.state === "gone" ? 0 : 1;
    const last = keys[keys.length - 1];
    if (!last || last[3] !== on || last[4] !== sc || Math.abs(last[1] - x) * W > 0.25 || Math.abs(last[2] - y) * H > 0.25) {
      keys.push([+st.t.toFixed(4), x, y, on, sc]);
    }
    if (st.state === "held") {
      if (heldFrom === null) heldFrom = st.t;
    } else if (heldFrom !== null) {
      held.push([+heldFrom.toFixed(3), +st.t.toFixed(3)]);
      heldFrom = null;
    }
  }
  if (heldFrom !== null) held.push([+heldFrom.toFixed(3), +all[all.length - 1].t.toFixed(3)]);

  onProgress(1);
  return { version: TRACK_VERSION, at: anchorT, keys, held, trackable: true, frames: all.length };
}

export default { trackBlur, TRACK_VERSION };

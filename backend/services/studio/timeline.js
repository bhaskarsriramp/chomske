/**
 * timeline.js: the shape of a demo, and the arithmetic every consumer shares.
 *
 * ── THE RECORDING IS NOT THE SOURCE OF TRUTH ─────────────────────────────────
 * The video is pixels. What the AI edited, what the creator adjusts and what
 * the renderer draws all live here, as data, in SOURCE time: seconds from the
 * first frame of the recording, before anything was cut. Nothing in this
 * document moves when a cut is added or removed, which is the whole reason a
 * demo can be re-edited without re-analysing it.
 *
 * Output time is DERIVED. `layout()` walks the cuts and produces the segments
 * that survive, with where each one lands in the finished video. Every consumer
 * maps through it rather than storing an output position, so deleting a five
 * second wait does not rewrite the fifty zooms after it.
 *
 * ── EVERY POSITION IS A FRACTION ─────────────────────────────────────────────
 * x, y, w, h are fractions of the SOURCE frame, 0..1, never pixels. A demo
 * recorded on a 3840×2160 display and exported at 1080p is the same numbers
 * drawn with fewer pixels, and a zoom planned against a downsampled analysis
 * frame is valid against the full-resolution render. Pixels appear in exactly
 * two places in this product: the ffmpeg command line, and the canvas that
 * draws the cursor layer. Both convert at the edge.
 *
 * ── THE BROWSER KEEPS A COPY ─────────────────────────────────────────────────
 * src/components/Studio/model.js mirrors the arithmetic below so the preview
 * agrees with the export. If the two ever disagree, the export is right.
 *
 *   cuts     [{ id, start, end, reason, auto }]          removed from the output
 *   zooms    [{ id, start, end, x, y, w, h, level, easing, follow, auto }]
 *   cursor   { enabled, theme, size, smoothing, glow, trail, ripple, hide_real }
 *   track    [{ t, x, y, shape }]                        the path that is DRAWN
 *   captured [{ t, x, y }]                               where the pointer really was
 *   events   [{ id, t, type, x, y, ... }]                clicks, scrolls, typing
 *   steps    [{ id, start, end, title, detail, importance, camera }]
 *   captions { enabled, style, position, size, px, color, x, y, lang }
 *   cues     [{ id, start, end, text, emphasis, custom }]  custom: one line styled alone
 *   blurs    [{ id, start, end, x, y, w, h, kind, strength, label, auto }]
 *   canvas   { aspect, background, padding, radius, shadow }
 *   audio    { voice, music: [...] }
 *   narration[{ id, start, end, text }]
 */
import crypto from "crypto";

/** Output frame shapes. Keyed the way a creator names them, not W:H maths. */
/**
 * The shapes a demo can be exported in.
 *
 * "source" is first and is the default, and it is not a shape at all — it means
 * the recording's own. A screen recording is already the shape somebody chose
 * when they sized the window, and putting it inside a 16:9 frame means scaling
 * it to fit: a 1920 wide capture rendered into a 1690 wide box, every pixel
 * resampled, every letter softened. That is invisible on a photograph and
 * glaring on interface text, which is the only thing a product demo contains.
 * Exporting at the recording's own size copies pixels one for one.
 */
export const ASPECTS = {
  "16:9": [1920, 1080],
  "9:16": [1080, 1920],
  "1:1": [1080, 1080],
  "4:5": [1080, 1350],
};

/** Aspect choices including "source". ASPECTS holds only the fixed shapes. */
export const ASPECT_KEYS = ["source", ...Object.keys(ASPECTS)];

export const CURSOR_THEMES = ["system", "light", "dark", "ring", "dot", "none"];
export const CAPTION_STYLES = ["trylipi", "hormozi", "apple", "minimal", "neon"];
export const EASINGS = ["smooth", "snappy", "slow", "linear"];
export const BLUR_KINDS = ["blur", "pixelate", "box"];

/** What a zoom is for. Drives the default rect and how the camera behaves. */
export const CAMERA_MODES = ["cursor", "element", "modal", "region", "full"];

export const newId = (prefix) => `${prefix}_${crypto.randomBytes(5).toString("hex")}`;

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const frac = (v, d = 0) => clamp(num(v, d), 0, 1);
const pick = (v, list, d) => (list.includes(v) ? v : d);

/* ────────────────────────────────────────────────────────────────────────────
   Defaults
   ──────────────────────────────────────────────────────────────────────────── */

/** Where the drawn pointer's path comes from. See intent.js. */
export const CURSOR_MODES = ["intent", "recorded"];

export const defaultCursor = () => ({
  // "intent": composed from the clicks the recording actually contains, resting
  // on each control and travelling between them. "recorded": the recovered
  // path, smoothed. Composed is the default because a recovered path carries
  // every hesitation and twitch of a real hand, and none of them are what the
  // demo is about.
  mode: "recorded",
  enabled: true,
  theme: "light",
  // Drawn larger than the captured pointer on purpose. The real cursor is burnt
  // into the recording and cannot be removed, so ours has to COVER it; at 1.0
  // the original peeks out from under the synthetic one on every fast move.
  size: 1.35,
  smoothing: 0.65,
  glow: 0.35,
  trail: 0,
  ripple: true,
  hide_real: true,
  captured_px: 22,
});

export const defaultCaptions = () => ({
  enabled: false,
  style: "trylipi",
  position: "bottom",
  size: "m",
  // Overrides, all null meaning "use the style and position above". Same shape
  // as the script editor's captions (services/edit/timeline.js) so the two
  // products' caption controls are the same controls.
  px: null,
  color: null,
  x: null,
  y: null,
  lang: "",
});

/**
 * ── NOTHING AROUND THE RECORDING UNLESS SOMEBODY ASKS ────────────────────────
 * This used to default to a gradient with six per cent padding and rounded
 * corners — the look every screen-recorder markets itself with. It is the wrong
 * default for this product twice over.
 *
 * It costs resolution: padding shrinks the picture inside the frame, so a 1920
 * wide capture is resampled down to about 1690 and back up on playback, and the
 * interface text — the entire content of a product demo — comes out soft. And
 * it is a decision the creator has not made yet. The Canvas panel offers
 * backgrounds, padding and corners; picking one is opting IN to a presentation
 * frame, and until then what they recorded is what they see.
 */
export const defaultCanvas = () => ({
  aspect: "source",
  background: { kind: "none" },
  padding: 0,
  radius: 0,
  shadow: 0,
});

export const defaultAudio = () => ({ voice: 1, music: [] });

export function emptyTimeline({ duration = 0, width = 1920, height = 1080, fps = 30 } = {}) {
  return {
    version: 1,
    duration: num(duration),
    source: { width: num(width, 1920), height: num(height, 1080), fps: num(fps, 30) },
    canvas: defaultCanvas(),
    cuts: [],
    zooms: [],
    cursor: defaultCursor(),
    track: [],
    composed: [],
    captured: [],
    events: [],
    steps: [],
    captions: defaultCaptions(),
    cues: [],
    blurs: [],
    narration: [],
    audio: defaultAudio(),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   Source time → output time
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The stretches of the recording that survive the cuts, and where each lands.
 *
 * Overlapping and out-of-order cuts are normal: the silence detector and the
 * AI both propose them, and a creator drags one over another. They are merged
 * here rather than at the point of insert, so nothing upstream has to care.
 *
 * @returns {{ segments: Array<{src_start, src_end, out_start, out_end}>, duration: number, removed: number }}
 */
export function layout(tl) {
  const total = Math.max(0, num(tl?.duration));
  const cuts = mergedCuts(tl, total);

  const segments = [];
  let cursor = 0;
  let out = 0;
  for (const c of cuts) {
    if (c.start > cursor) {
      const d = c.start - cursor;
      segments.push({ src_start: cursor, src_end: c.start, out_start: out, out_end: out + d });
      out += d;
    }
    cursor = Math.max(cursor, c.end);
  }
  if (cursor < total) {
    const d = total - cursor;
    segments.push({ src_start: cursor, src_end: total, out_start: out, out_end: out + d });
    out += d;
  }

  return { segments, duration: out, removed: total - out };
}

/** Cuts, clamped to the recording, sorted, overlaps merged, empties dropped. */
export function mergedCuts(tl, total = num(tl?.duration)) {
  const raw = (tl?.cuts || [])
    .map((c) => ({ start: clamp(num(c.start), 0, total), end: clamp(num(c.end), 0, total) }))
    .filter((c) => c.end - c.start > 0.02)
    .sort((a, b) => a.start - b.start);

  const out = [];
  for (const c of raw) {
    const last = out[out.length - 1];
    if (last && c.start <= last.end + 0.001) last.end = Math.max(last.end, c.end);
    else out.push({ ...c });
  }
  return out;
}

/**
 * Where a moment of the recording ends up in the finished video.
 * Inside a cut there is no answer: `null`, and the caller decides what that
 * means (a zoom that starts inside a cut simply never plays).
 */
export function toOutput(srcT, lay) {
  for (const s of lay.segments) {
    if (srcT >= s.src_start && srcT <= s.src_end) return s.out_start + (srcT - s.src_start);
  }
  return null;
}

/** Same, but a moment inside a cut snaps FORWARD to the next surviving frame. */
export function toOutputSnapped(srcT, lay) {
  for (const s of lay.segments) {
    if (srcT <= s.src_start) return s.out_start;
    if (srcT <= s.src_end) return s.out_start + (srcT - s.src_start);
  }
  return lay.duration;
}

/** The reverse: a moment of the finished video, back in recording time. */
export function toSource(outT, lay) {
  for (const s of lay.segments) {
    if (outT >= s.out_start && outT <= s.out_end) return s.src_start + (outT - s.out_start);
  }
  return lay.segments.length ? lay.segments[lay.segments.length - 1].src_end : 0;
}

/**
 * A span of recording time, as the spans of output time it becomes.
 *
 * One span in, many out: a zoom that runs across a cut is two stretches of the
 * export with the removed seconds gone from the middle. Every overlay uses this,
 * which is why a cut never has to touch anything else in the document.
 */
export function spanToOutput(start, end, lay) {
  const out = [];
  for (const s of lay.segments) {
    const a = Math.max(start, s.src_start);
    const b = Math.min(end, s.src_end);
    if (b - a > 0.001) {
      out.push({
        start: s.out_start + (a - s.src_start),
        end: s.out_start + (b - s.src_start),
        src_start: a,
        src_end: b,
      });
    }
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
   The cursor path
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Where the pointer was at a moment of the RECORDING.
 *
 * The track is sampled, not per-frame: the tracker runs at 30-60 Hz and drops
 * samples it is not confident about (a full-screen repaint hides the cursor
 * from a frame difference). So this interpolates, and the renderer smooths.
 * Returns null before the first sample and after the last, where there is
 * genuinely nothing to draw rather than a guess worth making.
 */
/**
 * The path that gets drawn.
 *
 * ── BOTH ARE KEPT, AND THE CHOICE IS MADE AT RENDER TIME ─────────────────────
 * The recovered path and the composed one are both written at analysis time,
 * because they cost nothing to keep and recomputing either means re-reading the
 * recording. The cursor's `mode` picks between them when the frame is drawn, so
 * switching is instant in the editor instead of another analysis.
 *
 * "recorded" is the default. A composed path is steadier and better aimed, but
 * it goes where the pointer in the RECORDING does not, and that pointer is
 * burnt into the pixels — so composing it only looks right if the original can
 * also be removed, and removing it means reconstructing whatever it was sitting
 * on. On a flat panel that is invisible; over a heading it takes a bite out of
 * the text. Until the recording can be made without a cursor in it at all, the
 * honest default is the one that puts our pointer exactly where theirs is and
 * covers it.
 */
export function drawnTrack(tl) {
  if (!tl || tl.cursor?.enabled === false) return null;
  const composed = tl.composed;
  if (tl.cursor?.mode === "intent" && composed && composed.length > 1) return composed;
  return tl.track || null;
}

export function cursorAt(track, t) {
  if (!track?.length) return null;
  const first = track[0];
  const last = track[track.length - 1];

  /**
   * ── THE TWO ENDS ARE NOT THE SAME QUESTION ────────────────────────────────
   * This looks like an off-by-one and is the reason finished demos opened with
   * two pointers on screen.
   *
   * The tracker finds the pointer by differencing frames, so it cannot see one
   * that is not moving — and a demo begins with the pointer parked while the
   * creator gets ready. The first sample is therefore not "where the pointer
   * started". It is the first place it was seen MOVING, which is where it
   * ARRIVED. Holding it backwards asserts the pointer spent the opening of the
   * demo somewhere it had not reached yet, and on a real recording that put our
   * pointer on a sidebar item for five seconds while the one burnt into the
   * video sat two hundred and sixty pixels away. Two cursors, neither moving.
   *
   * The other end is the opposite case and holding IS right there: the tracker
   * stopped seeing the pointer because it stopped moving, so it is still where
   * it was last seen.
   *
   * So: nothing before the first sighting, held after the last. Where nothing
   * is known the renderer draws nothing, which leaves the captured pointer on
   * its own rather than putting a second one next to it.
   */
  if (t < first.t - EDGE_GRACE) return null;
  if (t <= first.t) return { x: first.x, y: first.y, shape: first.shape || "default" };
  if (t >= last.t) return { x: last.x, y: last.y, shape: last.shape || "default" };

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

  /**
   * ── A LONG GAP IS HELD, NOT CROSSED ───────────────────────────────────────
   * The tracker reports nothing while the screen is repainting, which is
   * exactly what a page navigation is. That leaves a hole in the track, and
   * interpolating across it draws the pointer gliding in a straight line from
   * wherever it was to wherever it turns up next — usually right through the
   * middle of the picture, while the real pointer burnt into the frames sat
   * perfectly still on the link that was clicked. Two pointers, moving apart.
   *
   * Nobody knows where the pointer was during the hole. But the overwhelmingly
   * common case is that it did not move: you click, the page loads, your hand
   * stays put. So a gap longer than one dropped sample holds the last known
   * position and snaps at the far end, where there is evidence again.
   */
  if (span > GAP_HOLD) {
    const near = t - a.t <= span / 2 ? a : b;
    return { x: near.x, y: near.y, shape: near.shape || "default" };
  }

  const k = span > 0 ? (t - a.t) / span : 0;
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    // The shape is what it was at the last sample, never blended: a pointer is
    // an arrow or a hand, and half of each is not a thing.
    shape: a.shape || "default",
  };
}

/**
 * Longest gap in the track still worth interpolating across.
 *
 * The tracker runs at 24 Hz, so a normal step is 42ms and one dropped frame is
 * 83ms. Past a fifth of a second the pointer was not seen for five samples and
 * there is no path to draw, only a guess.
 */
const GAP_HOLD = 0.2;

/**
 * How far before the first sighting the pointer may still be drawn.
 *
 * Only enough to stop it blinking on at a frame boundary. Anything longer is
 * the guess this function exists not to make.
 */
const EDGE_GRACE = 0.1;

/**
 * The track with jitter taken out, resampled to a fixed rate.
 *
 * ── WHY CATMULL-ROM AND NOT A MOVING AVERAGE ─────────────────────────────────
 * A moving average pulls the path away from where the pointer actually was, and
 * the error is worst exactly where it matters: the moment it arrives at a button
 * and stops. Catmull-Rom passes THROUGH every sample and only shapes the curve
 * between them, so a click still lands on the thing that was clicked.
 *
 * `strength` blends between the raw path (0) and the smoothed one (1). It is a
 * blend rather than a curve parameter because the recovered path already has
 * measurement noise in it, and the creator is really asking "how much of that
 * noise do I want to see".
 */
/**
 * How far the drawn pointer may ever sit from the captured one, as a fraction
 * of the frame's width.
 *
 * ── THIS IS WHAT STOPS THE VIDEO SHOWING TWO CURSORS ─────────────────────────
 * The pointer in the recording is burnt into the pixels and cannot be removed.
 * The drawn one covers it — that is the entire reason it is drawn larger than
 * life (defaultCursor.size). Covering only works while the two are in the same
 * place, and smoothing is precisely a licence to put them in different places:
 * a Catmull-Rom spline rounds the corner on a fast direction change, and at a
 * sharp turn the smoothed path can leave the real path by fifty pixels. What
 * the viewer sees then is a crisp pointer and, a thumb's width away, the
 * original: two cursors, which is worse than no cursor at all.
 *
 * So smoothing is now a preference expressed WITHIN a budget rather than a free
 * hand. A 22px cursor on a 1920-wide frame is about 0.0115 of the width, so a
 * drift of one cursor-width still leaves the two overlapping. Below that the
 * rounding is invisible; above it the recording develops a second mouse.
 */
const MAX_DRIFT = 0.012;

/**
 * The two pointers this product draws, and nothing else.
 *
 * ── WHY THE SHAPE IS SMOOTHED AND WHY THERE ARE ONLY TWO ─────────────────────
 * The tracker classifies the shape per frame from a handful of pixels, so its
 * answer flickers: hand, arrow, hand, hand, arrow across six frames of a steady
 * hover. Drawn literally that is a pointer changing silhouette five times a
 * second, which is what "multiple mouse pointers" looked like in a finished
 * video — not two cursors on screen at once, one cursor that would not stay
 * still.
 *
 * So the shape is decided over a window rather than per frame, and it has to
 * win that window by a margin before it changes. And it is two shapes, not
 * four: hand over anything clickable, arrow for everything else. The I-beam was
 * a third silhouette to flicker between for no gain — nobody watching a demo
 * needs to be told the pointer is over a text field.
 */
const HOVER_SHAPES = new Set(["pointer", "hand"]);
/** Samples either side that vote on what the pointer is at this instant. */
const SHAPE_WINDOW = 5;
/** Share of the window that must agree before the pointer becomes a hand. */
const SHAPE_MAJORITY = 0.6;

function shapeAt(pts, i) {
  let hand = 0;
  let n = 0;
  for (let k = Math.max(0, i - SHAPE_WINDOW); k <= Math.min(pts.length - 1, i + SHAPE_WINDOW); k++) {
    n++;
    if (HOVER_SHAPES.has(pts[k].shape)) hand++;
  }
  return n > 0 && hand / n >= SHAPE_MAJORITY ? "pointer" : "default";
}

/**
 * ── A GAP IN THE TRACK IS NOT A STRAIGHT LINE ────────────────────────────────
 * Resampling used to run from the first sample to the end of the recording at a
 * steady rate, which quietly filled every hole in the track with interpolated
 * points. The holes are not noise. The tracker reports nothing while the
 * pointer is perfectly still, because a still pointer makes no difference
 * between two frames — so the holes are exactly the moments the pointer was
 * parked, which are the moments a viewer is most likely to be looking at it.
 *
 * Interpolating across one draws our pointer gliding slowly from where it was
 * to wherever it turns up next, usually straight across the picture, while the
 * pointer burnt into the recording sits motionless. Two cursors, drifting
 * apart. The guard in cursorAt was written for this and never fired, because
 * smoothing ran first and left it nothing to find.
 *
 * So the track is split into RUNS at every gap. Each run is smoothed on its
 * own, and between two runs the last known position is HELD, because that is
 * what the pointer was actually doing. The move is bridged over the final
 * fraction of a second so it reads as a fast movement rather than a teleport —
 * and after a still gap that move is a few pixels anyway, since the pointer
 * becomes visible again the instant it starts moving.
 */
export function smoothTrack(track, { rate = 60, strength = 0.65, duration = 0, maxDrift = MAX_DRIFT } = {}) {
  if (!track?.length) return [];
  const pts = [...track].sort((a, b) => a.t - b.t).map((p, i, arr) => ({ ...p, shape: shapeAt(arr, i) }));
  if (pts.length < 3 || strength <= 0) return pts;

  const end = duration > 0 ? duration : pts[pts.length - 1].t;
  const step = 1 / rate;
  const out = [];

  // Runs of samples with no gap longer than one dropped frame between them.
  const runs = [];
  let run = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].t - pts[i - 1].t > GAP_HOLD) {
      runs.push(run);
      run = [];
    }
    run.push(pts[i]);
  }
  runs.push(run);

  for (let r = 0; r < runs.length; r++) {
    const seg = runs[r];
    const stop = r + 1 < runs.length ? runs[r + 1][0].t : end;

    if (seg.length < 3) {
      for (const q of seg) out.push({ t: round3(q.t), x: frac(q.x), y: frac(q.y), shape: q.shape });
    } else {
      let i = 0;
      for (let t = seg[0].t; t <= seg[seg.length - 1].t + 1e-6; t += step) {
        while (i < seg.length - 2 && seg[i + 1].t < t) i++;
        const p0 = seg[Math.max(0, i - 1)];
        const p1 = seg[i];
        const p2 = seg[Math.min(seg.length - 1, i + 1)];
        const p3 = seg[Math.min(seg.length - 1, i + 2)];
        const span = p2.t - p1.t;
        const k = span > 0 ? clamp((t - p1.t) / span, 0, 1) : 0;

        const sx = catmull(p0.x, p1.x, p2.x, p3.x, k);
        const sy = catmull(p0.y, p1.y, p2.y, p3.y, k);
        const rx = p1.x + (p2.x - p1.x) * k;
        const ry = p1.y + (p2.y - p1.y) * k;

        // Smoothed, then pulled back onto the real path if it wandered too far.
        // Scaling the whole offset rather than clamping each axis keeps the
        // direction of the correction, so the pointer stays on the curve it was
        // drawing instead of snapping square against one axis.
        let dx = (sx - rx) * strength;
        let dy = (sy - ry) * strength;
        const drift = Math.hypot(dx, dy);
        if (drift > maxDrift) {
          const k2 = maxDrift / drift;
          dx *= k2;
          dy *= k2;
        }
        out.push({ t: round3(t), x: frac(rx + dx), y: frac(ry + dy), shape: shapeAt(seg, i) });
      }
    }

    // ── The hold ──────────────────────────────────────────────────────────
    const held = out[out.length - 1];
    if (!held || stop <= held.t + step) continue;
    const next = r + 1 < runs.length ? runs[r + 1][0] : null;
    const reach = next ? Math.hypot(next.x - held.x, next.y - held.y) : 0;
    // Only a move worth seeing gets a bridge; a few pixels is a jump nobody
    // can perceive and easing it just delays the truth.
    const bridge = next && reach > 0.02 ? Math.min(BRIDGE, (stop - held.t) / 2) : 0;
    for (let t = held.t + step; t < stop - 1e-6; t += step) {
      if (bridge > 0 && t > stop - bridge) {
        const k = clamp((t - (stop - bridge)) / bridge, 0, 1);
        const e = EASE.smooth(k);
        out.push({ t: round3(t), x: frac(held.x + (next.x - held.x) * e), y: frac(held.y + (next.y - held.y) * e), shape: held.shape });
      } else {
        out.push({ t: round3(t), x: held.x, y: held.y, shape: held.shape });
      }
    }
  }
  return out;
}

/** How long a move across a gap is given, when there is one worth showing. */
const BRIDGE = 0.18;

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

const round3 = (v) => Math.round(v * 1000) / 1000;
const round4 = (v) => Math.round(v * 10000) / 10000;

/* ────────────────────────────────────────────────────────────────────────────
   The camera
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Easing curves, as functions of progress 0..1.
 *
 * Never linear. A linear zoom is the single clearest tell that a demo was made
 * by a machine: real camera moves accelerate and settle, and the eye reads a
 * constant-rate zoom as a glitch rather than a move.
 */
export const EASE = {
  smooth: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  snappy: (t) => 1 - Math.pow(1 - t, 4),
  slow: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  linear: (t) => t,
};

export const easeFn = (name) => EASE[name] || EASE.smooth;

/** How long a zoom takes to get in, and to come back out. */
export const RAMP = { smooth: 0.55, snappy: 0.32, slow: 0.9, linear: 0.5 };

/**
 * A zoom's two ramps, which are NOT the same length.
 *
 * ── GOING IN AND COMING OUT ARE DIFFERENT MOVES ──────────────────────────────
 * A zoom onto a button has to arrive gently: the viewer is being asked to look
 * somewhere, and a hard push-in reads as a jump cut. Coming out is the
 * opposite. The click has happened, the screen has changed underneath, and
 * what the viewer needs is the whole page NOW. Easing out over half a second
 * means half a second of watching a crop of a page that has already moved on,
 * and it is the single thing that makes an automatic edit feel laggy.
 *
 * So a zoom carries its own `ramp_in` / `ramp_out` in seconds, and its own
 * `ease_out` curve. Nothing is required to set them — without them a zoom
 * behaves exactly as it always did, symmetric on its easing — but the camera
 * built from clicks (events.js clickCamera) sets a fast snappy way out.
 */
export function rampsOf(z) {
  const base = RAMP[z?.easing] || RAMP.smooth;
  // `== null` and not Number.isFinite(Number(v)): Number(null) is 0, which IS
  // finite, so the obvious version silently turned every unset ramp into the
  // 0.05s minimum. The symptom was a zoom that jumped from 1× to 2× inside a
  // frame and a half — the exact opposite of the eased approach this whole
  // file exists to guarantee.
  const given = (v) => v != null && v !== "" && Number.isFinite(Number(v));
  const inR = given(z?.ramp_in) ? clamp(Number(z.ramp_in), 0.05, 2) : base;
  const outR = given(z?.ramp_out) ? clamp(Number(z.ramp_out), 0.05, 2) : base;
  return {
    in: inR,
    out: outR,
    easeIn: z?.easing || "smooth",
    easeOut: EASE[z?.ease_out] ? z.ease_out : z?.easing || "smooth",
  };
}

/**
 * The camera rect at a moment of the RECORDING: which part of the source frame
 * fills the output, as fractions.
 *
 * Zooms are applied in order and each one ramps in from, and back out to,
 * whatever was on screen before it. Overlapping zooms are not blended; the last
 * one to start wins, because two cameras is not a thing and the alternative
 * (a crossfade between two crops) reads as a wobble.
 */
export function cameraAt(tl, t, { track = null } = {}) {
  const full = { x: 0, y: 0, w: 1, h: 1 };
  const zooms = activeZooms(tl);
  if (!zooms.length) return full;

  // The last zoom whose influence (ramp in + hold + ramp out) covers t.
  let z = null;
  for (const cand of zooms) {
    const r = rampsOf(cand);
    if (t >= cand.start - r.in && t <= cand.end + r.out) z = cand;
  }
  if (!z) return full;

  const r = rampsOf(z);
  const target = zoomRect(z, tl, t, track);

  if (t < z.start) {
    const k = easeFn(r.easeIn)(clamp((t - (z.start - r.in)) / r.in, 0, 1));
    return lerpRect(full, target, k);
  }
  if (t > z.end) {
    const k = easeFn(r.easeOut)(clamp((t - z.end) / r.out, 0, 1));
    return lerpRect(target, full, k);
  }
  return target;
}

/** Zooms that are real: inside the recording, with a positive length. */
export function activeZooms(tl) {
  const total = num(tl?.duration);
  return (tl?.zooms || [])
    .map((z) => ({ ...z, start: clamp(num(z.start), 0, total), end: clamp(num(z.end), 0, total) }))
    .filter((z) => z.end - z.start > 0.05)
    .sort((a, b) => a.start - b.start);
}

/**
 * The rect one zoom is holding at time t.
 *
 * A following zoom re-centres on the pointer as it moves, which is what makes
 * a scroll or a drag readable; it is damped so the frame does not chase every
 * tremor, and clamped so the camera never leaves the picture.
 */
export function zoomRect(z, tl, t, track) {
  const level = Math.max(1, num(z.level, 1.6));
  /**
   * ── THE RECT WINS WHEN IT IS WIDER THAN THE LEVEL ─────────────────────────
   * The frame used to be sized from `level` alone and the zoom's own rectangle
   * was used only for its centre. But a rectangle is not decoration: a zoom
   * built from several clicks is sized by events.js containing() so that every
   * one of those clicks is inside the frame when it happens. Throwing that size
   * away and cropping to 1/level put the clicks back outside — the exact fault
   * that shipped a demo where nothing could be seen being pressed.
   *
   * So `level` is the intent and the rectangle is the floor. A zoom never
   * crops tighter than the thing it was built to show.
   */
  const need = Math.max(num(z.w, 0), num(z.h, 0));
  const w = clamp(Math.max(1 / level, need), 0.05, 1);
  const h = w;

  let cx = frac(z.x + z.w / 2, 0.5);
  let cy = frac(z.y + z.h / 2, 0.5);

  if (z.follow && track?.length) {
    const p = cursorAt(track, t);
    if (p) {
      // Damped toward the pointer rather than locked to it: at 1.0 the frame is
      // rigidly attached to the mouse and every small correction becomes a whip
      // pan across the screen.
      const k = clamp(num(z.follow_strength, 0.7), 0, 1);
      cx = cx + (p.x - cx) * k;
      cy = cy + (p.y - cy) * k;
    }
  }

  return clampRect({ x: cx - w / 2, y: cy - h / 2, w, h });
}

/** Keeps the camera inside the frame: a crop that hangs off the edge is black. */
export function clampRect(r) {
  const w = clamp(num(r.w, 1), 0.05, 1);
  const h = clamp(num(r.h, 1), 0.05, 1);
  return {
    x: clamp(num(r.x), 0, 1 - w),
    y: clamp(num(r.y), 0, 1 - h),
    w,
    h,
  };
}

function lerpRect(a, b, k) {
  return clampRect({
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    w: a.w + (b.w - a.w) * k,
    h: a.h + (b.h - a.h) * k,
  });
}

/**
 * A point of the SOURCE frame, as a point of the OUTPUT frame, under the camera.
 * Everything drawn on top (cursor, annotations, blur) goes through this, so a
 * zoom moves the pointer and the arrow pointing at it by exactly the same amount.
 */
export function project(pt, cam) {
  return {
    x: (pt.x - cam.x) / cam.w,
    y: (pt.y - cam.y) / cam.h,
    scale: 1 / cam.w,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   Captions
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Cues placed in OUTPUT time, split where a cut falls inside them.
 * A cue that spans a removed wait becomes two, rather than one that drifts off
 * the speech by however long the wait was.
 */
export function placedCues(tl, lay = layout(tl)) {
  if (!tl?.captions?.enabled) return [];
  const out = [];
  for (const cue of tl.cues || []) {
    const start = num(cue.start);
    const end = num(cue.end);
    if (end - start <= 0.02) continue;
    for (const span of spanToOutput(start, end, lay)) {
      if (span.end - span.start > 0.08) out.push({ ...cue, start: span.start, end: span.end });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Same treatment for anything else that sits on the picture for a stretch. */
export function placedSpans(items, lay, { min = 0.08 } = {}) {
  const out = [];
  for (const item of items || []) {
    const start = num(item.start);
    const end = num(item.end);
    if (end - start <= 0.02) continue;
    for (const span of spanToOutput(start, end, lay)) {
      if (span.end - span.start > min) {
        out.push({ ...item, start: span.start, end: span.end, src_start: span.src_start, src_end: span.src_end });
      }
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * One caption line's own styling, or null when it follows the track's.
 *
 * ── WHY PER-LINE AND NOT PER-TRACK ───────────────────────────────────────────
 * The one caption edit people actually make is to a single line: the product
 * name should be bigger, the warning should be red, this one line collides with
 * the interface and has to move up. Without this the only way to do it is to
 * split the caption track, which breaks the timing of everything after it.
 * Same shape as the script editor's `segment.custom`, so the control that edits
 * one edits the other.
 *
 * Every field is independently null: setting a colour must not silently also
 * pin the size to whatever the track happened to be at the time.
 */
function cueCustom(c) {
  if (!c || typeof c !== "object") return null;
  const out = {
    style: CAPTION_STYLES.includes(c.style) ? c.style : null,
    size: ["s", "m", "l", "xl"].includes(c.size) ? c.size : null,
    px: c.px == null ? null : clamp(num(c.px, 0), 8, 96),
    color: /^#[0-9a-f]{6}$/i.test(c.color || "") ? c.color : null,
    x: c.x == null ? null : round4(frac(c.x, 0.5)),
    y: c.y == null ? null : round4(frac(c.y, 0.84)),
    bold: c.bold == null ? null : !!c.bold,
  };
  return Object.values(out).some((v) => v !== null) ? out : null;
}

/* ────────────────────────────────────────────────────────────────────────────
   Sanitising
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * A timeline from the browser, or from the model, made safe to store and render.
 *
 * Anything unrecognised is dropped rather than carried: this document is read
 * straight into an ffmpeg command line and into a canvas, and "whatever the
 * client sent" is how a filter graph becomes a shell argument. Every number is
 * clamped to a range that renders, every enum is checked against its list, and
 * the arrays are capped.
 */
export function sanitizeTimeline(input, { duration = 0, source = null } = {}) {
  const src = input && typeof input === "object" ? input : {};
  const total = num(duration) || num(src.duration);

  const span = (o, { maxLen = total } = {}) => {
    const start = clamp(num(o.start), 0, total);
    const end = clamp(num(o.end, start), start, Math.min(total, start + maxLen));
    return { start: round3(start), end: round3(end) };
  };
  const rect = (o) => {
    const r = clampRect({ x: num(o.x), y: num(o.y), w: num(o.w, 0.25), h: num(o.h, 0.25) });
    return { x: round4(r.x), y: round4(r.y), w: round4(r.w), h: round4(r.h) };
  };
  const text = (v, max = 240) => String(v == null ? "" : v).replace(/[ --]/g, "").slice(0, max);

  const out = emptyTimeline({
    duration: total,
    width: num(source?.width ?? src.source?.width, 1920),
    height: num(source?.height ?? src.source?.height, 1080),
    fps: num(source?.fps ?? src.source?.fps, 30),
  });

  // ── Canvas ────────────────────────────────────────────────────────────────
  const c = src.canvas || {};
  out.canvas = {
    aspect: pick(c.aspect, ASPECT_KEYS, "source"),
    background: {
      kind: pick(c.background?.kind, ["gradient", "solid", "image", "none"], "gradient"),
      value: text(c.background?.value ?? "dusk", 64),
    },
    padding: clamp(num(c.padding, 0.06), 0, 0.3),
    radius: clamp(num(c.radius, 18), 0, 80),
    shadow: clamp(num(c.shadow, 0.5), 0, 1),
  };

  // ── Cuts ──────────────────────────────────────────────────────────────────
  out.cuts = (src.cuts || [])
    .slice(0, 400)
    .map((x) => ({
      id: text(x.id, 32) || newId("cut"),
      ...span(x),
      reason: pick(x.reason, ["silence", "loading", "error", "idle", "manual"], "manual"),
      auto: !!x.auto,
    }))
    .filter((x) => x.end - x.start > 0.02);

  // ── Zooms ─────────────────────────────────────────────────────────────────
  out.zooms = (src.zooms || [])
    .slice(0, 300)
    .map((x) => ({
      id: text(x.id, 32) || newId("z"),
      ...span(x),
      ...rect(x),
      level: clamp(num(x.level, 1.6), 1, 5),
      easing: pick(x.easing, EASINGS, "smooth"),
      // Going in and coming out are separate moves. Null means "same as the
      // easing", which is how every zoom behaved before this existed. See
      // rampsOf() above.
      ramp_in: x.ramp_in == null ? null : clamp(num(x.ramp_in, 0.55), 0.05, 2),
      ramp_out: x.ramp_out == null ? null : clamp(num(x.ramp_out, 0.2), 0.05, 2),
      ease_out: x.ease_out == null ? null : pick(x.ease_out, EASINGS, "snappy"),
      camera: pick(x.camera, CAMERA_MODES, "element"),
      follow: !!x.follow,
      follow_strength: clamp(num(x.follow_strength, 0.7), 0, 1),
      label: text(x.label, 80),
      auto: !!x.auto,
    }))
    .filter((x) => x.end - x.start > 0.05);

  // ── Cursor ────────────────────────────────────────────────────────────────
  const cur = src.cursor || {};
  out.cursor = {
    enabled: cur.enabled !== false,
    theme: pick(cur.theme, CURSOR_THEMES, "light"),
    size: clamp(num(cur.size, 1.35), 0.5, 3),
    smoothing: clamp(num(cur.smoothing, 0.65), 0, 1),
    glow: clamp(num(cur.glow, 0.35), 0, 1),
    trail: clamp(num(cur.trail, 0), 0, 1),
    ripple: cur.ripple !== false,
    hide_real: cur.hide_real !== false,
    mode: pick(cur.mode, CURSOR_MODES, "recorded"),
    // How big the captured pointer actually measured, in source pixels. The
    // creator's display scaling decides it and nothing in the recording says,
    // so sync.js measures it and the erase patch is sized from it.
    captured_px: clamp(num(cur.captured_px, 22), 8, 96),
  };

  // ── The recovered path ────────────────────────────────────────────────────
  // Capped hard. Sixty samples a second for a twenty minute demo is 72,000
  // points, which is a 3 MB document Mongo will take and the browser will not
  // enjoy. The tracker already thins; this is the backstop.
  out.track = (src.track || [])
    .slice(0, 120000)
    .map((p) => ({
      t: round3(clamp(num(p.t), 0, total)),
      x: round4(frac(p.x)),
      y: round4(frac(p.y)),
      shape: text(p.shape, 16) || "default",
    }))
    .sort((a, b) => a.t - b.t);

  /**
   * ── WHERE THE POINTER REALLY WAS ──────────────────────────────────────────
   * Not the path that gets drawn — `track` is that, and once composed it is a
   * different path entirely. This is the recovered one, kept for exactly one
   * job: telling the renderer where the pointer the operating system burnt into
   * the recording is, so it can be removed (render/hide.js).
   *
   * Thinned hard, because it is only ever used to position a patch a little
   * larger than a cursor. Fifteen samples a second is finer than the patch is.
   */
  // The composed path, kept alongside the recovered one so cursor.mode can
  // switch between them without another analysis. See drawnTrack().
  out.composed = (src.composed || [])
    .slice(0, 120000)
    .map((p) => ({
      t: round3(clamp(num(p.t), 0, total)),
      x: round4(frac(p.x)),
      y: round4(frac(p.y)),
      shape: text(p.shape, 16) || "default",
    }))
    .sort((a, b) => a.t - b.t);

  out.captured = (src.captured || [])
    .slice(0, 40000)
    .map((p) => ({ t: round3(clamp(num(p.t), 0, total)), x: round4(frac(p.x)), y: round4(frac(p.y)) }))
    .sort((a, b) => a.t - b.t);

  // ── Events ────────────────────────────────────────────────────────────────
  out.events = (src.events || [])
    .slice(0, 20000)
    .map((e) => ({
      id: text(e.id, 32) || newId("e"),
      t: round3(clamp(num(e.t), 0, total)),
      type: pick(e.type, ["click", "dblclick", "rightclick", "drag", "scroll", "type", "key", "nav", "hover", "idle"], "click"),
      // Whether the recording showed a consequence. Only a corroborated click
      // moves the camera; see events.js zoomsFromClicks.
      corroborated: e.corroborated !== false,
      x: round4(frac(e.x, 0.5)),
      y: round4(frac(e.y, 0.5)),
      dy: round3(num(e.dy)),
      text: text(e.text, 120),
      confidence: clamp(num(e.confidence, 0.5), 0, 1),
      source: pick(e.source, ["pixel", "sdk", "ai", "manual"], "pixel"),
    }))
    .sort((a, b) => a.t - b.t);

  // ── Steps ─────────────────────────────────────────────────────────────────
  out.steps = (src.steps || [])
    .slice(0, 200)
    .map((s) => ({
      id: text(s.id, 32) || newId("s"),
      ...span(s),
      title: text(s.title, 100),
      detail: text(s.detail, 400),
      importance: pick(s.importance, ["high", "medium", "low"], "medium"),
      camera: pick(s.camera, CAMERA_MODES, "element"),
    }))
    .filter((s) => s.title);

  // ── Captions ──────────────────────────────────────────────────────────────
  const cap = src.captions || {};
  out.captions = {
    enabled: !!cap.enabled,
    style: pick(cap.style, CAPTION_STYLES, "trylipi"),
    position: pick(cap.position, ["top", "middle", "bottom"], "bottom"),
    size: pick(cap.size, ["s", "m", "l", "xl"], "m"),
    px: cap.px == null ? null : clamp(num(cap.px, 0), 8, 96),
    color: /^#[0-9a-f]{6}$/i.test(cap.color || "") ? cap.color : null,
    x: cap.x == null ? null : round4(frac(cap.x, 0.5)),
    y: cap.y == null ? null : round4(frac(cap.y, 0.84)),
    lang: text(cap.lang, 12),
  };
  out.cues = (src.cues || [])
    .slice(0, 5000)
    .map((q) => ({
      id: text(q.id, 32) || newId("q"),
      ...span(q, { maxLen: 12 }),
      text: text(q.text, 300),
      emphasis: (q.emphasis || []).slice(0, 6).map((w) => text(w, 60)).filter(Boolean),
      // One line styled on its own. Null unless the creator touched it, so the
      // common case costs nothing and "make THIS line yellow and bigger" is
      // possible without splitting the caption track into two.
      custom: cueCustom(q.custom),
    }))
    .filter((q) => q.text && q.end - q.start > 0.05);

  // ── Blur ──────────────────────────────────────────────────────────────────
  out.blurs = (src.blurs || [])
    .slice(0, 500)
    .map((b) => ({
      id: text(b.id, 32) || newId("b"),
      ...span(b),
      ...rect(b),
      kind: pick(b.kind, BLUR_KINDS, "blur"),
      strength: clamp(num(b.strength, 0.7), 0.1, 1),
      label: text(b.label, 60),
      auto: !!b.auto,
    }))
    .filter((b) => b.end - b.start > 0.02);

  // ── Narration ─────────────────────────────────────────────────────────────
  out.narration = (src.narration || [])
    .slice(0, 300)
    .map((n) => ({ id: text(n.id, 32) || newId("v"), ...span(n), text: text(n.text, 600) }))
    .filter((n) => n.text);

  // ── Audio ─────────────────────────────────────────────────────────────────
  const a = src.audio || {};
  out.audio = {
    voice: clamp(num(a.voice, 1), 0, 2),
    music: (a.music || []).slice(0, 8).map((m) => ({
      id: text(m.id, 32) || newId("m"),
      media: text(m.media, 40),
      start: round3(clamp(num(m.start), 0, total)),
      in: round3(Math.max(0, num(m.in))),
      duration: round3(Math.max(0, num(m.duration))),
      volume: clamp(num(m.volume, 0.2), 0, 2),
      fade_in: clamp(num(m.fade_in, 0.5), 0, 10),
      fade_out: clamp(num(m.fade_out, 1), 0, 10),
    })),
  };

  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
   Small shared questions
   ──────────────────────────────────────────────────────────────────────────── */

/** Everything the export will actually draw, for the "what came out" record. */
export function drewCounts(tl, lay = layout(tl)) {
  return {
    duration: round3(lay.duration),
    cut: mergedCuts(tl).length,
    removed: round3(lay.removed),
    zooms: placedSpans(activeZooms(tl), lay).length,
    cursor: tl.cursor?.enabled && tl.track?.length ? tl.track.length : 0,
    clicks: (tl.events || []).filter((e) => e.type === "click" || e.type === "dblclick").length,
    captions: placedCues(tl, lay).length,
    blurs: placedSpans(tl.blurs || [], lay).length,
    music: (tl.audio?.music || []).length,
  };
}

/**
 * Output pixel size for an aspect at a short-side resolution.
 *
 * With aspect "source" the recording's own size wins, and is never scaled UP:
 * a 1020 tall capture asked for "1440p" has no 1440 lines to give, and
 * inventing them costs bitrate that would otherwise go on sharpening the lines
 * it does have. It is scaled DOWN when a smaller export was asked for.
 */
export function outputSize(aspect, resolution = 1080, source = null) {
  if (aspect === "source") {
    const sw = num(source?.width);
    const sh = num(source?.height);
    if (sw > 1 && sh > 1) {
      const short = Math.min(sw, sh);
      const k = short > resolution ? resolution / short : 1;
      return [Math.max(2, Math.round((sw * k) / 2) * 2), Math.max(2, Math.round((sh * k) / 2) * 2)];
    }
  }
  const [w, h] = ASPECTS[aspect] || ASPECTS["16:9"];
  const short = Math.min(w, h);
  const k = resolution / short;
  // Even numbers throughout: yuv420p cannot encode an odd dimension.
  return [Math.round((w * k) / 2) * 2, Math.round((h * k) / 2) * 2];
}

export default {
  ASPECTS, CURSOR_THEMES, CAPTION_STYLES, EASINGS, BLUR_KINDS, CAMERA_MODES,
  newId, emptyTimeline, defaultCursor, defaultCaptions, defaultCanvas, defaultAudio,
  layout, mergedCuts, toOutput, toOutputSnapped, toSource, spanToOutput,
  cursorAt, smoothTrack, EASE, easeFn, RAMP, cameraAt, activeZooms, zoomRect, clampRect, project,
  placedCues, placedSpans, sanitizeTimeline, drewCounts, outputSize,
};
